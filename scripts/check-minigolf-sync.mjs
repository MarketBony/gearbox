// =============================================================================
// GARDE-FOU — le moteur du minigolf est DUPLIQUÉ entre `shared/minigolf.ts` (source
// canonique : navigateur) et `backend/src/games/minigolf.ts`
// (serveur : il simule chaque coup). Même raison que check-plaques-sync.mjs : aucune image Docker ne voit
// les deux dossiers (`backend` exclu du contexte `web`, contexte `api` = ./backend).
//
// Une divergence est GRAVE et silencieuse : l'écran rejouerait une trajectoire différente de
// celle que le serveur a calculée. Ici la copie doit être OCTET POUR OCTET identique — on modifie la
// source canonique, puis : cp shared/minigolf.ts backend/src/games/minigolf.ts
// Fichiers absents (build Docker) : contrôle ignoré, comme pour les plaques.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = join(racine, 'shared', 'minigolf.ts');
const B = join(racine, 'backend', 'src', 'games', 'minigolf.ts');
if (!existsSync(A) || !existsSync(B)) process.exit(0);
const norm = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
if (norm(A) !== norm(B)) {
  console.error('\n✖ Minigolf : backend/src/games/minigolf.ts DIFFÈRE de shared/minigolf.ts.');
  console.error('  Modifier la source canonique puis : cp shared/minigolf.ts backend/src/games/minigolf.ts\n');
  process.exit(1);
}
console.log('✔ Minigolf : moteur synchronisé (shared ↔ backend).');
