import { TODO_ROLES } from '../auth/roles';

// ============================================================================
// TÂCHES MULTI-ASSIGNÉES (16/10/2026) — SEULE PORTE d'écriture des assignés d'une tâche.
//
// Deux colonnes : `assignedUserIds` (la liste, vérité) et `assignedUserId` (historique, tenu = PREMIER de la liste).
// L'ancienne interface (`pages/*`) ne connaît que le second ; la v2 (`ui2/`) écrit la liste. Les deux routes
// d'écriture des tâches (`routes/projects.ts`, diff du PUT et POST ; `routes/tasks.ts`, tâches libres) passent
// par `normaliserAssignes` puis `verifierNouveauxAssignes` — ne jamais réécrire cette règle dans une route.
//
// ⚠️ ARBITRAGE ENTRE LES DEUX CHAMPS : on compare à l'état EN BASE, jamais les deux champs du corps entre eux.
// Les deux clients renvoient la tâche ENTIÈRE telle qu'ils l'ont lue au GET, donc avec les deux champs :
//  - la v2 change la liste et peut laisser un `assignedUserId` périmé → la LISTE a changé : elle gagne ;
//  - l'ancienne interface change `assignedUserId` et renvoie la liste lue au GET, inchangée → seul le premier
//    assigné a changé : il REMPLACE le premier de la liste, les autres sont gardés (elle ne les voit pas, elle ne
//    doit pas les effacer). « Non assigné » depuis l'ancienne interface retire le premier seulement.
// Comparer les deux champs du corps entre eux aurait fait gagner la liste périmée de l'ancienne interface : son
// changement d'assigné aurait répondu 200 et disparu au rechargement — le piège des listes blanches.
// ============================================================================

/** Erreur de validation : message FIXE et en français, sûr à renvoyer au client (400). */
export class AssigneInvalideError extends Error {
  constructor(message: string) { super(message); this.name = 'AssigneInvalideError'; }
}

const propre = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.trim() !== ''))] : [];

const memeListe = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Assignés d'une ligne en base (une ligne antérieure à la reprise n'a que `assignedUserId`). */
export const assignesDe = (t: { assignedUserId?: string | null; assignedUserIds?: string[] | null } | null | undefined): string[] =>
  !t ? [] : t.assignedUserIds && t.assignedUserIds.length ? t.assignedUserIds : t.assignedUserId ? [t.assignedUserId] : [];

/**
 * Rend `data` cohérent (MUTE et renvoie `data`) : `assignedUserIds` = liste propre (dédoublonnée, sans vide),
 * `assignedUserId` = son premier élément ou null. Si le corps ne porte NI l'un NI l'autre, ne touche à rien
 * (« champ absent = non modifié », même sémantique que `pickTaskData`).
 * `ancienne` = la ligne en base (absente pour une création).
 */
export function normaliserAssignes(data: any, ancienne?: { assignedUserId?: string | null; assignedUserIds?: string[] | null } | null) {
  const aListe = data.assignedUserIds !== undefined, aScalaire = data.assignedUserId !== undefined;
  if (!aListe && !aScalaire) return data;
  const avant = assignesDe(ancienne);
  const recue = aListe ? propre(data.assignedUserIds) : null;
  let liste: string[];
  if (recue && !memeListe(recue, avant)) liste = recue;                                   // la liste a changé (v2)
  else if (aScalaire && (data.assignedUserId || null) !== (avant[0] ?? null)) {           // seul le 1er a changé (v1)
    const v: string | null = typeof data.assignedUserId === 'string' && data.assignedUserId.trim() ? data.assignedUserId : null;
    const reste = avant.slice(1).filter(x => x !== v);
    liste = v ? [v, ...reste] : reste;
  } else liste = recue ?? avant;
  data.assignedUserIds = liste;
  data.assignedUserId = liste[0] ?? null;
  return data;
}

/** Assignés AJOUTÉS par cette écriture (ceux qui étaient déjà là ne sont pas revérifiés). */
export const nouveauxAssignes = (data: any, ancienne?: { assignedUserId?: string | null; assignedUserIds?: string[] | null } | null): string[] => {
  if (!Array.isArray(data.assignedUserIds)) return [];
  const avant = new Set(assignesDe(ancienne));
  return data.assignedUserIds.filter((x: string) => !avant.has(x));
};

// `prisma` ou le client d'une transaction (`tx`) : seul `user.findMany` est utilisé.
type LecteurUsers = { user: { findMany: (...args: any[]) => any } };

/** Parmi `ids`, ceux qui désignent un compte existant ayant la To-do (`TODO_ROLES`). */
export async function assignesEligibles(db: LecteurUsers, ids: string[]): Promise<Set<string>> {
  const uniques = [...new Set(ids)];
  if (!uniques.length) return new Set();
  const users: { id: string; role: string }[] = await db.user.findMany({ where: { id: { in: uniques } }, select: { id: true, role: true } });
  return new Set(users.filter(u => TODO_ROLES.includes(u.role)).map(u => u.id));
}

/**
 * Refuse (AssigneInvalideError → 400) toute NOUVELLE attribution à un compte inexistant ou sans To-do
 * (External, chef de site). Décision de Théo : n'importe qui attribue à n'importe qui, mais seulement parmi les
 * rôles qui ont la To-do.
 * ⚠️ Seuls les assignés AJOUTÉS sont vérifiés : une tâche restée assignée à un compte devenu inéligible (rôle
 * changé, compte supprimé) doit rester enregistrable — la refuser bloquerait toute sauvegarde du projet entier,
 * dont le PUT renvoie TOUTES les tâches. Même raison que l'absence de contrôle serveur de MARKETING_TEAM_ROLES.
 * Une seule requête, et seulement quand une attribution est ajoutée (le PUT des projets est sensible au pooler).
 */
export async function verifierNouveauxAssignes(db: LecteurUsers, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const ok = await assignesEligibles(db, ids);
  if (ids.some(id => !ok.has(id))) {
    throw new AssigneInvalideError('Assignation refusée : une tâche ne peut être attribuée qu’à un compte qui a accès à la To-do.');
  }
}
