import { ApiError } from './dataService';

/**
 * Fabrique de FILES DE SAUVEGARDE — un seul envoi en vol par entité.
 *
 * ⚠️ POURQUOI CE MODULE EXISTE. Deux écritures concurrentes sur la même entité ne se
 * contentent pas de se doubler : côté Projets, le diff transactionnel du serveur SUPPRIME
 * les tâches présentes en base et absentes du corps reçu, donc deux corps construits
 * depuis des états divergents s'effacent mutuellement des lignes (404 mesuré le
 * 27/08/2026). Côté Digital, deux `PUT /api/social/:id` partis d'instantanés différents
 * se réécrasent champ par champ. Sérialiser par entité ferme cette classe entière.
 *
 * ⚠️ POURQUOI UNE FABRIQUE, ET NON UNE DEUXIÈME COPIE. Ce code existait au correctif 48
 * pour les seuls projets. Le Digital en a exactement le même besoin — et dans ce dépôt,
 * une règle recopiée finit par diverger : c'est ce qui a fait diverger Budget et Dashboard
 * QUATRE fois, et ce qui a mis trois copies de la formule d'avancement en circulation.
 * On paramètre donc l'envoi au lieu de dupliquer la mécanique.
 *
 * ⚠️ LA COALESCENCE N'EST SÛRE QUE PARCE QUE CHAQUE CHARGE EST UN INSTANTANÉ COMPLET,
 * construit depuis le miroir de l'écran. Le dernier instantané contient donc TOUT ce que
 * portaient les précédents : les remplacer ne perd rien. **Si un jour la charge devient un
 * delta partiel, cette coalescence perdra des modifications EN SILENCE.** C'est
 * l'invariant à ne pas casser, quelle que soit l'entité.
 *
 * ⚠️ Sérialisation PAR ENTITÉ et non globale : deux personnes qui travaillent sur deux
 * projets (ou deux publications) différents n'ont aucune raison de s'attendre, et une file
 * globale ferait dépendre la latence de chacun de l'entité la plus lourde.
 * Chaque appel à `creerFileSauvegarde` a sa PROPRE table : deux entités ne peuvent donc
 * pas se percuter même si elles partageaient un identifiant.
 */

export type RappelsFile<T> = {
  /** Réponse du serveur, appelée seulement si la charge a été acceptée. */
  onSucces?: (entiteServeur: T) => void;
  /** Échec définitif, après épuisement des reprises pour les codes réessayables. */
  onEchec?: (erreur: unknown, entiteEnvoyee: T) => void;
  /** Appelé quand la file de CETTE entité se vide (succès comme échec). */
  onRepos?: () => void;
};

/**
 * Codes REJOUABLES. L'envoi est **idempotent** — il applique un instantané complet et
 * converge vers le même état — donc rejouable sans risque de doublon.
 *  - `0`   : réseau injoignable (`ApiError(0)` de `apiFetch`) ;
 *  - `503` : base momentanément saturée, rendue par les routes depuis le correctif 48.
 * Tout le reste est définitif : un 400, un 403 ou un 404 ne s'améliorera pas en
 * réessayant, et boucler dessus ne ferait qu'ajouter à la charge qui a causé le défaut.
 */
const REESSAYABLE = [0, 503];

/** Attentes entre tentatives, en ms. Deux reprises, puis on remonte l'erreur. */
const ATTENTES = [400, 1200];

const attendre = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

type Etat<T> = {
  enVol: boolean;
  /** Dernier instantané à envoyer. `null` = rien en attente. */
  enAttente: T | null;
  rappels: RappelsFile<T>;
};

/**
 * Crée une file indépendante.
 * @param nom    Sert uniquement aux traces (`[file:projet] …`).
 * @param envoyer Fonction d'écriture réseau — typiquement `db.updateProject`.
 */
export const creerFileSauvegarde = <T extends { id: string }>(
  nom: string,
  envoyer: (charge: T) => Promise<T>
) => {
  const parEntite = new Map<string, Etat<T>>();

  const etatDe = (id: string): Etat<T> => {
    let e = parEntite.get(id);
    if (!e) { e = { enVol: false, enAttente: null, rappels: {} }; parEntite.set(id, e); }
    return e;
  };

  /** Exécute un rappel de l'appelant sans jamais laisser son erreur casser la file. */
  const sansCasser = (f?: () => void) => {
    try { f?.(); } catch (e) { console.error(`[file:${nom}] rappel en erreur :`, e); }
  };

  const pomper = async (id: string) => {
    const etat = etatDe(id);
    if (etat.enVol) return;
    etat.enVol = true;

    try {
      // Tant qu'un instantané attend, on l'envoie. Une modification arrivée pendant
      // l'envoi précédent est donc traitée au tour suivant, jamais en parallèle.
      while (etat.enAttente) {
        const charge = etat.enAttente;
        etat.enAttente = null;

        let tentative = 0;
        for (;;) {
          try {
            const reponse = await envoyer(charge);
            sansCasser(() => etat.rappels.onSucces?.(reponse));
            break;
          } catch (e) {
            const statut = e instanceof ApiError ? e.status : -1;

            // ⚠️ On rejoue avec l'instantané le PLUS RÉCENT, pas celui qui a échoué : s'il
            // en est arrivé un pendant l'attente, il subsume le précédent. Réenvoyer
            // l'ancien écraserait la modification la plus fraîche.
            if (REESSAYABLE.includes(statut) && tentative < ATTENTES.length) {
              await attendre(ATTENTES[tentative]);
              tentative += 1;
              if (etat.enAttente) break; // un plus récent attend : il repart au tour de boucle
              continue;
            }

            sansCasser(() => etat.rappels.onEchec?.(e, charge));
            break;
          }
        }
      }
    } finally {
      etat.enVol = false;
    }

    // ⚠️ FENÊTRE DE COURSE À NE PAS REFERMER TROP TÔT. Un `pousser` survenu pendant le
    // dernier `await` a posé son instantané mais n'a PAS pu démarrer de pompe (`enVol`
    // valait encore vrai, donc `pomper` est ressorti aussitôt). Conclure ici — annoncer le
    // repos et purger l'entrée — perdrait cette sauvegarde en silence. On relance.
    if (etat.enAttente) { void pomper(id); return; }

    sansCasser(etat.rappels.onRepos);
    // Pas d'entrée morte : sans ça la table croît d'une entrée par entité visitée.
    if (!etat.enAttente) parEntite.delete(id);
  };

  return {
    /**
     * Met un instantané complet en file. Si un envoi est déjà en vol pour cette entité,
     * l'instantané remplace celui qui attendait (voir l'invariant de coalescence en tête).
     */
    pousser: (entite: T, rappels: RappelsFile<T> = {}) => {
      const etat = etatDe(entite.id);
      etat.enAttente = entite;
      etat.rappels = rappels;
      void pomper(entite.id);
    },

    /** Une écriture est-elle en cours ou en attente pour cette entité ? */
    aDesEcrituresEnCours: (id: string): boolean => {
      const e = parEntite.get(id);
      return !!e && (e.enVol || e.enAttente !== null);
    },
  };
};
