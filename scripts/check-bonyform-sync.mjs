// =============================================================================
// GARDE-FOU — le format des Forms Bony est DUPLIQUÉ entre `shared/bonyform.ts` (source
// canonique : éditeur Gearbox + Worker Cloudflare) et `backend/src/bonyforms/schema.ts`
// (serveur Gearbox). Même raison que check-plaques-sync.mjs : aucune image Docker ne voit
// les deux dossiers (`backend` exclu du contexte `web`, contexte `api` = ./backend).
//
// Une divergence est GRAVE et silencieuse : le Worker accepterait une réponse que le serveur
// refuse (ou l'inverse). Ici la copie doit être OCTET POUR OCTET identique — on modifie la
// source canonique, puis : cp shared/bonyform.ts backend/src/bonyforms/schema.ts
// Fichiers absents (build Docker) : contrôle ignoré, comme pour les plaques.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = join(racine, 'shared', 'bonyform.ts');
const B = join(racine, 'backend', 'src', 'bonyforms', 'schema.ts');
if (!existsSync(A) || !existsSync(B)) process.exit(0);
const norm = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
if (norm(A) !== norm(B)) {
  console.error('\n✖ Forms Bony : backend/src/bonyforms/schema.ts DIFFÈRE de shared/bonyform.ts.');
  console.error('  Modifier la source canonique puis : cp shared/bonyform.ts backend/src/bonyforms/schema.ts\n');
  process.exit(1);
}
console.log('✔ Forms Bony : format synchronisé (shared ↔ backend).');
