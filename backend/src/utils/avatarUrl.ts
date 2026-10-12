// ============================================================================
// PHOTO (utilisateur ou groupe) — SEULE règle de validation d'une `avatarUrl`.
//
// Extraite le 12/10/2026 (lot sécurité serveur) de `realtime/chat.ts`, où elle ne
// protégeait que la photo de groupe : `PUT /api/auth/me` et `PUT /api/users/:id`
// acceptaient n'importe quelle chaîne, donc une URL EXTERNE rendue dans un `<img>`
// chez tous les collègues (fuite d'adresse IP, pixel de traçage). Trois écrivains,
// une seule règle : ne pas la recopier.
//
// Une photo ne peut être QUE un fichier déposé par POST /api/uploads/avatar : nom en
// uuid + extension assainie (voir routes/uploads.ts). Les 4 extensions sont exactement
// celles que `EXT_BY_MIME` produit pour le type `avatar` (jpeg -> .jpg) : pas de `.jpeg`.
// ============================================================================
export const AVATAR_UPLOAD_PATH =
  /^\/uploads\/avatar\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|gif|webp)$/;

/**
 * Valeur d'`avatarUrl` reçue d'un client → valeur à écrire, ou `false` si refusée.
 *  - `undefined` → `undefined` (champ absent : non modifié) ;
 *  - `null` ou chaîne vide → `null` (photo supprimée) ;
 *  - chemin `/uploads/avatar/<uuid>.<ext>` → le chemin ;
 *  - tout le reste (URL externe, autre dossier, autre type) → `false`.
 */
export const checkAvatarUrl = (v: unknown): string | null | undefined | false => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  return typeof v === 'string' && AVATAR_UPLOAD_PATH.test(v) ? v : false;
};

export const AVATAR_REFUSED = 'Photo refusée : seule une image déposée dans Gearbox est acceptée.';
