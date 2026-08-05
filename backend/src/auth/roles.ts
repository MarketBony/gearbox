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
  // Chef de site (05/08/2026) — PREMIER rôle dont les droits dépendent d'une DONNÉE
  // du compte (`User.sites`) et pas seulement de son nom. Lecture seule, cloisonné
  // à ses concessions par `auth/siteScope.ts`.
  //
  // ⚠️ Son absence de tous les `EDIT_ROLES` des routes suffit à le rendre en lecture
  // seule : ne l'ajouter à AUCUNE de ces listes. C'est voulu, ce n'est pas un oubli.
  'Site Manager',
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

// Accès aux Jeux. ⚠️ **Director en est EXCLU volontairement** — c'est la seule
// exception à la règle « Director = mêmes droits qu'Administrator » (cf. CLAUDE.md).
// Ce n'est pas un oubli : ne pas l'ajouter en croyant corriger une incohérence.
// Doit rester aligné sur `GAMES_ALLOWED_ROLES` de `constants.ts` côté frontend.
export const GAMES_ROLES = ['Master', 'Administrator', 'Coordinator', 'Digital Manager'];

// --- Chef de site (05/08/2026) ------------------------------------------------
//
// Le nom du rôle et son test vivent ICI, avec les autres constantes de rôle, et non
// dans `siteScope.ts` : ce dernier tire Prisma, or `uploads.ts` a besoin du test sans
// avoir besoin d'une base.
export const SITE_MANAGER_ROLE = 'Site Manager';
export const isSiteManager = (role?: string | null) => role === SITE_MANAGER_ROLE;
//
// ⚠️ **PAS dans DIRECTOR_ASSIGNABLE_ROLES** (décision de Théo) : créer un chef de site
// revient à ouvrir un accès aux données financières d'une concession, on le réserve à
// Master et Administrator.
//
// Les rubriques qui lui sont accessibles. Liste FERMÉE : tout ce qui n'y figure pas lui
// est refusé, y compris par appel direct à l'API. Doit rester alignée sur
// `SITE_MANAGER_SECTIONS` de `constants.ts` (frontend).
export const SITE_MANAGER_SECTIONS = [
  'dashboard', 'projects', 'digital', 'hello-marketing', 'budget', 'agenda',
];

// Rôles qui n'ont AUCUNE interaction avec l'équipe marketing : ni chat, ni jeux, ni
// présence, ni fil d'actualité. Un chef de site consulte, il ne collabore pas.
export const NO_SOCIAL_ROLES = ['Site Manager'];
export const hasSocialFeatures = (role?: string | null) =>
  !!role && !NO_SOCIAL_ROLES.includes(role);

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
