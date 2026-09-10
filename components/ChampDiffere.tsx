import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Champs de saisie à SAUVEGARDE DIFFÉRÉE — brouillon local, écriture au blur.
 *
 * ⚠️ POURQUOI CE COMPOSANT EXISTE. Avant lui, 16 contrôles de `pages/Projects.tsx` et
 * `pages/Campaigns.tsx` appelaient `handleUpdateProject` / `updateTaskField` dans leur
 * `onChange`, donc déclenchaient un `PUT /api/projects/:id` — le projet ENTIER, avec
 * toutes ses tâches — à CHAQUE FRAPPE. Taper un nom de tâche de 20 caractères lançait
 * 20 transactions interactives d'environ 0,7 s en moins de 4 secondes, chacune épinglant
 * une connexion serveur du pooler pgBouncer pour toute sa durée.
 * Mesuré en production le 07/09/2026 : 48 échecs sur les 4 jours de vie du conteneur,
 * TOUS sur le même projet (24 tâches), 28 en « Transaction already closed » (le budget
 * de 5 s consommé à attendre) et 20 en « Unable to start a transaction in the given
 * time » (les 2 s de maxWait épuisées). L'utilisateur lisait « serveur injoignable ? »
 * alors que le serveur allait très bien : c'est l'écran qui saturait la base.
 *
 * ⚠️ BLUR ET NON DEBOUNCE, décision à ne pas réviser sans relire ceci :
 *  - un debounce envoie quand même un PUT par PAUSE de frappe — écrire « Flyer A5
 *    recto/verso » avec deux hésitations en fait trois, pour une seule intention ;
 *  - il se déclenche pendant que le champ a ENCORE le focus, ce qui rouvre exactement
 *    les deux défauts que le blur ferme : le tri qui fait sauter la ligne (voir
 *    `ordreGele` dans Projects.tsx) et la réponse serveur qui réécrase le brouillon ;
 *  - le blur est émis par le navigateur AVANT tout clic ailleurs. Changer de projet,
 *    ajouter une tâche, changer d'onglet applicatif : tout passe par un blur, donc tout
 *    commet le brouillon. Il ne reste que trois sorties sans blur, traitées
 *    explicitement ici : le DÉMONTAGE, l'ONGLET CACHÉ et la FERMETURE.
 *
 * ⚠️ `valeur` n'est réabsorbée QUE si le champ n'a pas le focus. Sans cette règle, le
 * rechargement temps réel déclenché par la modification d'un COLLÈGUE écraserait la
 * saisie en cours — même défaut que celui qui dé-sélectionnait une puce de marque avant
 * l'exclusion de l'auteur côté socket (`backend/src/realtime/index.ts`).
 *
 * ⚠️ Le composant NE SAIT PAS si l'écriture est permise : il rend `disabled` comme
 * n'importe quel input, et le refus réel vient de l'appelant (`canEdit`) puis du serveur
 * (`requireRole(EDIT_ROLES)`). Ne pas y ajouter de logique de rôle.
 */

type ProprietesCommunes = {
  /**
   * Identité de la DONNÉE éditée, pas sa valeur — typiquement `${task.id}:name`.
   * ⚠️ Sert à distinguer « la même cellule a reçu une nouvelle valeur » de « ce n'est
   * plus la même cellule ». Sans elle, un tri qui réordonne les lignes ferait réutiliser
   * l'instance de React pour une AUTRE tâche, et le brouillon de l'une partirait dans
   * l'autre.
   */
  cle: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Notifie l'écran qu'un champ prend/perd le focus (compteur de saisies vives). */
  onFocusChange?: (focus: boolean) => void;
  /** Conservés pour le gel de l'ordre des tâches (`gelerOrdre` / libération). */
  onFocusPlus?: () => void;
  onBlurPlus?: () => void;
  /**
   * Notifie le brouillon À CHAQUE FRAPPE, sans rien envoyer au serveur.
   *
   * ⚠️ À n'utiliser que pour un affichage QUI ACCOMPAGNE le champ — un compteur de
   * caractères, un aperçu du texte. Ajouté au correctif 49 pour le wording du Digital,
   * dont l'aperçu et le compteur lisaient la valeur enregistrée et FIGEAIENT donc pendant
   * la frappe.
   *
   * ⚠️ NE JAMAIS s'en servir pour écrire (état remonté, appel réseau) : ce serait
   * réintroduire exactement le défaut que ce composant existe pour supprimer, avec un
   * rendu — voire un PUT — par caractère. La seule écriture est `onValider`, au blur.
   */
  onBrouillonChange?: (brouillon: string) => void;
};

/** Câblage commun : brouillon, réabsorption conditionnelle, et les trois sorties sans blur. */
const useBrouillon = <T,>(
  valeur: T,
  cle: string,
  commettre: (brouillonActuel: T) => void,
  surBrouillon?: (brouillon: T) => void
) => {
  const [brouillon, setBrouillon] = useState<T>(valeur);
  const focusRef = useRef(false);
  // Miroir du brouillon : les écouteurs (démontage, visibilité) sont posés une seule fois
  // et liraient sinon la valeur du premier rendu.
  const brouillonRef = useRef<T>(valeur);
  brouillonRef.current = brouillon;
  const commettreRef = useRef(commettre);
  commettreRef.current = commettre;

  // Changement d'IDENTITÉ : on repart de la valeur reçue, sans rien commettre — le
  // brouillon en cours appartenait à une autre donnée.
  useEffect(() => { setBrouillon(valeur); brouillonRef.current = valeur; }, [cle]);

  // Changement de VALEUR : réabsorbé seulement hors focus (voir l'avertissement en tête).
  useEffect(() => { if (!focusRef.current) setBrouillon(valeur); }, [valeur]);

  // Remontée du brouillon à l'appelant (compteur, aperçu). Purement consultatif : voir
  // l'avertissement sur `onBrouillonChange`.
  const surBrouillonRef = useRef(surBrouillon);
  surBrouillonRef.current = surBrouillon;
  useEffect(() => { surBrouillonRef.current?.(brouillon); }, [brouillon]);

  const valider = useCallback(() => { commettreRef.current(brouillonRef.current); }, []);

  useEffect(() => {
    // ⚠️ ONGLET CACHÉ / FERMETURE. `visibilitychange` couvre le changement d'onglet, le
    // passage en arrière-plan sur mobile et, sur la plupart des navigateurs, la
    // fermeture. `beforeunload` complète pour la fermeture directe. Un `blur` de fenêtre
    // ne suffirait pas : il ne retire pas le focus du champ, donc la réabsorption
    // resterait bloquée et le brouillon ne serait jamais commis.
    const surVisibilite = () => { if (document.visibilityState === 'hidden') valider(); };
    document.addEventListener('visibilitychange', surVisibilite);
    window.addEventListener('beforeunload', valider);
    return () => {
      document.removeEventListener('visibilitychange', surVisibilite);
      window.removeEventListener('beforeunload', valider);
      // ⚠️ FLUSH AU DÉMONTAGE. La ligne peut disparaître (tri, suppression, changement de
      // projet) alors qu'un brouillon n'est pas commis. On le commet ici — et c'est
      // l'appelant (`validerChampTache`) qui refuse l'écriture si la tâche n'existe plus
      // dans l'état courant, sinon supprimer une ligne en cours de saisie la ferait
      // RESSUSCITER.
      valider();
    };
  }, [valider]);

  return { brouillon, setBrouillon, focusRef, valider };
};

// --------------------------------------------------------------------------------------
// CHAMP TEXTE
// --------------------------------------------------------------------------------------

export const ChampTexte: React.FC<ProprietesCommunes & {
  valeur: string;
  /** Appelé au blur, SEULEMENT si la valeur a changé. */
  onValider: (v: string) => void;
  multiligne?: boolean;
  rows?: number;
  /**
   * Prend le focus au montage. Ajouté au correctif 50 pour le lien d'une ligne d'édito,
   * qui n'affiche son champ que le temps de l'édition : sans focus automatique, le clic
   * sur le crayon ouvrirait un champ qu'il faudrait ensuite aller cliquer.
   * ⚠️ Ne rien changer d'autre au comportement : l'écriture reste au blur.
   */
  autoFocus?: boolean;
}> = ({ valeur, onValider, cle, disabled, className, placeholder, multiligne, rows, autoFocus,
        onFocusChange, onFocusPlus, onBlurPlus, onBrouillonChange }) => {
  const valeurRef = useRef(valeur);
  valeurRef.current = valeur;

  const { brouillon, setBrouillon, focusRef, valider } = useBrouillon<string>(
    valeur, cle,
    (b) => { if (b !== valeurRef.current) onValider(b); }, // garde de non-changement : pas de PUT inutile
    onBrouillonChange
  );

  const communes = {
    disabled, className, placeholder, autoFocus,
    value: brouillon,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setBrouillon(e.target.value),
    onFocus: () => { focusRef.current = true; onFocusChange?.(true); onFocusPlus?.(); },
    onBlur: () => { focusRef.current = false; valider(); onFocusChange?.(false); onBlurPlus?.(); },
  };

  return multiligne
    ? <textarea {...communes} rows={rows} />
    : <input type="text" {...communes} />;
};

// --------------------------------------------------------------------------------------
// CHAMP NOMBRE
// --------------------------------------------------------------------------------------

/**
 * ⚠️ VIDE N'EST PAS ZÉRO, et la bonne réponse dépend de la COLONNE :
 *  - `Task.cost` et `Project.budgetPlanned` sont des `Float` NON nullables : un champ
 *    vidé vaut 0. → `videVaut="zero"`
 *  - `volumetry`, `openRate`, `npaiRate`, `stopRate`, `clickRate`, `billedAmount` sont
 *    des `Float?`. Avant ce lot, `Number(e.target.value)` rendait 0 pour une chaîne
 *    vide : effacer un KPI de campagne écrivait « 0 % » au lieu de « non renseigné ».
 *    → `videVaut="null"`
 *  - `alpineShare` / `nissanShare` sont `Float?` et leur sémantique métier est
 *    « null = 100 % sur la marque » (règle non négociable, cf. CLAUDE.md) : vider doit
 *    donc rendre `null`, JAMAIS 0 — un 0 déplacerait tout le montant sur le compte RDM.
 *    → `videVaut="null"`
 */
export type VideVaut = 'zero' | 'null';

/**
 * ⚠️ Aucune valeur NON FINIE ne part au serveur. `JSON.stringify({x: NaN})` rend
 * `{"x":null}` : sur une colonne nullable la donnée est effacée en silence, sur une
 * colonne non nullable Prisma refuse et TOUTE la transaction échoue — l'utilisateur voit
 * « serveur injoignable ». Honnêtement : ce garde-fou n'est PAS atteignable aujourd'hui,
 * un `<input type="number">` rendant `''` et jamais `'abc'` (le navigateur filtre). Il le
 * devient dès qu'on passe un champ en `type="text" inputMode="decimal"`, et il coûte
 * deux lignes.
 */
const normaliser = (brut: string, videVaut: VideVaut): { ok: boolean; valeur: number | null } => {
  // La virgule décimale française : « 12,5 » est ce que tape un utilisateur francophone,
  // et `Number('12,5')` vaut NaN.
  const t = brut.trim().replace(',', '.');
  if (t === '') return { ok: true, valeur: videVaut === 'zero' ? 0 : null };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, valeur: null };
  return { ok: true, valeur: n };
};

export const ChampNombre: React.FC<ProprietesCommunes & {
  valeur: number | null | undefined;
  onValider: (v: number | null) => void;
  videVaut: VideVaut;
  /** Bornage appliqué AU COMMIT et non à chaque frappe (sinon taper « 100 » bloque à 1). */
  borne?: [number, number];
  step?: string | number;
}> = ({ valeur, onValider, cle, videVaut, borne, step, disabled, className, placeholder,
        onFocusChange, onFocusPlus, onBlurPlus }) => {
  // Représentation texte de la valeur du modèle. `null`/`undefined` → champ vide, et non
  // « 0 » : c'est ce qui rend « non renseigné » distinguable de « zéro » à l'écran aussi.
  const texteDe = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

  const valeurRef = useRef(valeur);
  valeurRef.current = valeur;

  const { brouillon, setBrouillon, focusRef, valider } = useBrouillon<string>(
    texteDe(valeur), cle,
    (b) => {
      const r = normaliser(b, videVaut);
      if (!r.ok) return; // saisie inexploitable : on ne touche à rien, la valeur d'avant reste
      let v = r.valeur;
      if (v !== null && borne) v = Math.min(borne[1], Math.max(borne[0], v));
      // Garde de non-changement, comparée sur la valeur NORMALISÉE : sans ça, ouvrir puis
      // quitter un champ vide sur une colonne nullable enverrait un PUT pour rien.
      const actuelle = valeurRef.current;
      const memeValeur = v === (actuelle === undefined ? null : actuelle);
      if (memeValeur) return;
      onValider(v);
    }
  );

  return (
    <input
      type="number"
      step={step}
      disabled={disabled}
      className={className}
      placeholder={placeholder}
      value={brouillon}
      onChange={(e) => setBrouillon(e.target.value)}
      onFocus={() => { focusRef.current = true; onFocusChange?.(true); onFocusPlus?.(); }}
      onBlur={() => { focusRef.current = false; valider(); onFocusChange?.(false); onBlurPlus?.(); }}
    />
  );
};
