/**
 * Helpers d'affichage des fichiers, partagés entre le Chat et le mode Expert.
 *
 * ⚠️ `formatPoids` vivait en double : défini localement dans `pages/Chat.tsx`, il
 * allait l'être une seconde fois pour les fichiers de projet. Extrait ici le
 * 27/08/2026 — deux copies d'une même règle d'affichage, c'est exactement ce qui a
 * fait diverger trois listes de rôles sur l'écran Digital (correctif 41).
 */

/** Poids lisible : « 812 o », « 340 Ko », « 2,4 Mo ». */
export const formatPoids = (octets?: number): string => {
  if (!octets || octets <= 0) return '';
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(octets < 10 * 1024 * 1024 ? 1 : 0)} Mo`;
};

/**
 * Le fichier peut-il être affiché en vignette ?
 *
 * ⚠️ Test sur l'EXTENSION et non sur un type MIME : le mode Expert accepte tous les
 * formats, le serveur ne stocke pas le MIME, et le nom sur le disque est un uuid suivi
 * de l'extension retenue par `uploads.ts`. C'est donc la seule information disponible.
 */
export const estImage = (nomOuUrl: string): boolean =>
  /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(nomOuUrl);

/**
 * Famille du fichier, pour choisir une icône. Volontairement grossier : il s'agit
 * d'aider l'œil à trier une liste, pas de décrire un format.
 */
export type FamilleFichier = 'image' | 'pdf' | 'tableur' | 'document' | 'archive' | 'media' | 'autre';

export const familleFichier = (nom: string): FamilleFichier => {
  const n = nom.toLowerCase();
  if (estImage(n)) return 'image';
  if (/\.pdf$/.test(n)) return 'pdf';
  if (/\.(xlsx?|xlsm|csv|ods|numbers)$/.test(n)) return 'tableur';
  if (/\.(docx?|odt|rtf|txt|md|pages|pptx?|odp|key)$/.test(n)) return 'document';
  if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return 'archive';
  if (/\.(mp4|mov|avi|mkv|webm|mp3|wav|m4a|aac|ogg)$/.test(n)) return 'media';
  return 'autre';
};
