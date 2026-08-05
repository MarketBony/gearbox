// Les 7 rôles valides — source de vérité : types.ts (UserRole) côté frontend.
// role est un String libre en base depuis la suppression de l'enum Prisma :
// cette liste est le seul garde-fou contre une valeur invalide à l'écriture.
export const VALID_ROLES = [
  'Master',
  'Administrator',
  'Director',
  'Coordinator',
  'Digital Manager',
  'Guest',
  'External',
] as const;

export const isValidRole = (role: unknown): boolean =>
  typeof role === 'string' && (VALID_ROLES as readonly string[]).includes(role);

// --- Qui peut attribuer quel rôle (05/08/2026) -------------------------------------
//
// Jusqu'ici, les trois rôles autorisés à gérer les comptes (Master, Administrator,
// Director) pouvaient attribuer N'IMPORTE LEQUEL des 7 rôles : `isValidRole` vérifiait
// que la valeur existait, jamais que l'auteur avait le droit de la donner. Un Director
// pouvait donc s'attribuer **Administrator ou même Master**, ou promouvoir un complice
// qui le promouvait en retour.
//
// Règle arbitrée par Théo : **un Director ne gère que les comptes en dessous de lui.**
// Il ne peut donner ni Master, ni Administrator, ni même Director — ni à lui-même, ni à
// personne. Master et Administrator conservent tous leurs droits.
//
// ⚠️ Interdire seulement « Director → soi-même → Administrator » aurait été décoratif :
// la promotion croisée à deux comptes suffisait à contourner.
export const DIRECTOR_ASSIGNABLE_ROLES = ['Coordinator', 'Digital Manager', 'Guest', 'External'];

// Suppression d'un compte : réservée à Master et Administrator (décision de Théo,
// 05/08/2026). Le DELETE était ouvert à `ADMIN_ROLES`, Director inclus, et ne regardait
// **ni qui supprime ni qui est supprimé** : un Director pouvait donc effacer un
// Administrator, voire le compte Master — sans même passer par une escalade de rôle.
// Supprimer est irréversible : on ne le laisse pas à un rôle qui ne peut déjà plus
// promouvoir personne.
export const USER_DELETE_ROLES = ['Master', 'Administrator'];

export const canAssignRole = (actorRole: string | undefined, targetRole: string): boolean => {
  if (actorRole === 'Director') return DIRECTOR_ASSIGNABLE_ROLES.includes(targetRole);
  return true;
};

// ⚠️ Conséquence à connaître, et volontaire : l'interface envoie l'objet utilisateur
// COMPLET, donc un Director qui modifierait seulement le nom d'un compte Administrator
// enverrait quand même `role: 'Administrator'` et se verra refusé. Autrement dit un
// Director ne peut pas éditer un compte de niveau supérieur ou égal au sien — ce qui
// ferme au passage une seconde voie d'escalade : changer l'identifiant et le mot de
// passe d'un compte Administrator pour se l'approprier. Le message le dit explicitement
// pour que le refus soit compréhensible.
export const forbiddenRoleMessage = (targetRole: string) =>
  `En tant que Director, vous ne pouvez pas attribuer ni modifier le rôle "${targetRole}". ` +
  `Vous ne gérez que les comptes ${DIRECTOR_ASSIGNABLE_ROLES.join(', ')}.`;
