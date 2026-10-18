// =============================================================================
// GARDE-FOU — le moteur du bowling est DUPLIQUÉ entre `shared/bowling/` (source canonique : navigateur)
// et `backend/src/games/bowling/` (serveur : il rejoue chaque lancer et fait foi). Même raison que
// check-minigolf-sync.mjs : aucune image Docker ne voit les deux dossiers (`backend` exclu du contexte
// `web`, contexte `api` = ./backend).
//
// Une divergence est GRAVE et silencieuse : l'écran montrerait un lancer différent de celui que le serveur
// a compté. La copie doit être OCTET POUR OCTET identique — on modifie la source canonique, puis :
//   cp shared/bowling/physique.ts backend/src/games/bowling/physique.ts
//   cp shared/bowling/regles.ts   backend/src/games/bowling/regles.ts
// Contrôle aussi la version EXACTE de Rapier des deux côtés (même version = même résultat au bit près).
// Fichiers absents (build Docker) : contrôle ignoré, comme pour le minigolf.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const FICHIERS = ['physique.ts', 'regles.ts'];
const norm = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let erreurs = 0;
for (const f of FICHIERS) {
  const A = join(racine, 'shared', 'bowling', f), B = join(racine, 'backend', 'src', 'games', 'bowling', f);
  if (!existsSync(A) || !existsSync(B)) continue;
  if (norm(A) !== norm(B)) {
    console.error(`\n✖ Bowling : backend/src/games/bowling/${f} DIFFÈRE de shared/bowling/${f}.`);
    console.error(`  Modifier la source canonique puis : cp shared/bowling/${f} backend/src/games/bowling/${f}\n`);
    erreurs++;
  }
}
const RAPIER = '@dimforge/rapier3d-deterministic-compat';
const PA = join(racine, 'package.json'), PB = join(racine, 'backend', 'package.json');
if (existsSync(PA) && existsSync(PB)) {
  const va = JSON.parse(norm(PA)).dependencies?.[RAPIER], vb = JSON.parse(norm(PB)).dependencies?.[RAPIER];
  if (!va || va !== vb || !/^\d+\.\d+\.\d+$/.test(va)) {
    console.error(`\n✖ Bowling : ${RAPIER} doit avoir la MÊME version EXACTE (sans ^ ni ~) dans package.json (${va}) et backend/package.json (${vb}).\n`);
    erreurs++;
  }
}
if (erreurs) process.exit(1);
console.log('✔ Bowling : moteur synchronisé (shared ↔ backend), Rapier à la même version exacte.');
