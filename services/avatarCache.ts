// Cache client userId -> URL de photo de profil (alimenté par l'API /users et le
// user connecté). Permet à <Avatar userId=...> d'afficher la vraie photo partout
// sans passer l'URL en prop à chaque appel. Complète le fallback localStorage
// (photos base64 "legacy" de l'ancien mécanisme).

const cache = new Map<string, string | null>();

export const setAvatarUrl = (userId: string, url: string | null | undefined) => {
  if (userId) cache.set(userId, url ?? null);
};

export const primeAvatarCache = (users: Array<{ id: string; avatarUrl?: string | null }>) => {
  for (const u of users) cache.set(u.id, u.avatarUrl ?? null);
};

export const getAvatarUrl = (userId: string): string | null =>
  (userId ? cache.get(userId) : null) ?? null;
