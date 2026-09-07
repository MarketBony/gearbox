import { Project } from '../types';
import { db, ApiError } from './dataService';

/**
 * File de sauvegarde des projets — UN SEUL `PUT /api/projects/:id` en vol par projet.
 *
 * ⚠️ POURQUOI CE MODULE EXISTE. Deux PUT concurrents sur le même projet ne se contentent
 * pas de se doubler : le diff transactionnel du serveur SUPPRIME les tâches présentes en
 * base et absentes du corps reçu (`deleteMany` dans `backend/src/routes/projects.ts`).
 * Deux corps construits depuis des états divergents s'effacent donc mutuellement des
 * tâches, et le `task.update` concurrent sur la ligne supprimée échoue — d'où le 404
 * mesuré le 27/08/2026. Sérialiser par projet ferme cette classe entière de défauts.
 *
 * ⚠️ LA COALESCENCE N'EST SÛRE QUE PARCE QUE CHAQUE CHARGE EST UN INSTANTANÉ COMPLET,
 * construit depuis le miroir `projetRef` de l'écran. Le dernier instantané contient donc
 * TOUT ce que portaient les précédents : les remplacer ne perd rien. **Si un jour la
 * charge devient un delta partiel, cette coalescence perd des modifications EN
 * SILENCE.** C'est l'invariant à ne pas casser.
 *
 * ⚠️ Sérialisation PAR PROJET et non globale : deux personnes qui travaillent sur deux
 * projets différents n'ont aucune raison de s'attendre, et une file globale ferait
 * dépendre la latence de chacun du projet le plus lourd.
 */

type Rappels = {
  /** Réponse du serveur, appelée seulement si la charge a été acceptée. */
  onSucces?: (projetServeur: Project) => void;
  /** Échec définitif, après épuisement des reprises pour les codes réessayables. */
  onEchec?: (erreur: unknown, projetEnvoye: Project) => void;
  /** Appelé quand la file de CE projet se vide (succès comme échec). */
  onRepos?: () => void;
};

type Etat = {
  enVol: boolean;
  /** Dernier instantané à envoyer. `null` = rien en attente. */
  enAttente: Project | null;
  rappels: Rappels;
};

const parProjet = new Map<string, Etat>();

/**
 * Codes REJOUABLES. Le PUT est **idempotent** — il applique un instantané complet et
 * converge vers le même état — donc rejouable sans risque de doublon.
 *  - `0`   : réseau injoignable (`ApiError(0)` de `apiFetch`) ;
 *  - `503` : base momentanément saturée, rendu par la route depuis le correctif 48.
 * Tout le reste est définitif : un 400, un 403 ou un 404 ne s'améliorera pas en
 * réessayant, et boucler dessus ne ferait qu'ajouter à la charge qui a causé le défaut.
 */
const REESSAYABLE = [0, 503];

/** Attentes entre tentatives, en ms. Deux reprises, puis on remonte l'erreur. */
const ATTENTES = [400, 1200];

const attendre = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const etatDe = (id: string): Etat => {
  let e = parProjet.get(id);
  if (!e) { e = { enVol: false, enAttente: null, rappels: {} }; parProjet.set(id, e); }
  return e;
};

/** Une écriture est-elle en cours ou en attente pour ce projet ? */
export const aDesEcrituresEnCours = (projectId: string): boolean => {
  const e = parProjet.get(projectId);
  return !!e && (e.enVol || e.enAttente !== null);
};

/** Exécute un rappel de l'appelant sans jamais laisser son erreur casser la file. */
const sansCasser = (f?: () => void) => { try { f?.(); } catch (e) { console.error('[fileSauvegardeProjet] rappel en erreur :', e); } };

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
          const reponse = await db.updateProject(charge);
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
  // Pas d'entrée morte : sans ça la Map croît d'un projet par projet visité.
  if (!etat.enAttente) parProjet.delete(id);
};

/**
 * Met un instantané complet du projet en file. Si un PUT est déjà en vol pour ce projet,
 * l'instantané remplace celui qui attendait (voir l'invariant de coalescence en tête).
 */
export const pousser = (projet: Project, rappels: Rappels = {}) => {
  const etat = etatDe(projet.id);
  etat.enAttente = projet;
  etat.rappels = rappels;
  void pomper(projet.id);
};

export const fileSauvegardeProjet = { pousser, aDesEcrituresEnCours };
