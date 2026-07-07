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
