import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { UPLOADS_ROOT } from '../routes/uploads';

// ═══════════════════════════════════════════════════════════════════════════
// FICHIERS DÉPOSÉS PAR LES RÉPONDANTS des Forms Bony (F3, 01/10/2026) — PORTE UNIQUE.
//
// Décision de Théo (01/10) : stockés sur le VPS. ⚠️ JAMAIS sous UPLOADS_ROOT : tout ce qui y est est servi
// en public par `/uploads/…` sans connexion. Ici : volume Docker À PART (`bonyforms_files`, monté sur
// /app/forms-files), lu seulement par une route Gearbox avec JWT + FORMS_ROLES. Données personnelles.
//
// Arborescence : <racine>/<formId>/_pending/<id>.bin|.meta  (déposé, réponse pas encore envoyée)
//                <racine>/<formId>/<responseId>/<id>.bin|.meta  (rattaché à une réponse)
// Extensions .bin / .meta (et non .json) : nodemon, en local, redémarre l'API sur tout .json.
// Les dépôts jamais suivis d'une réponse sont purgés après 48 h.
// ═══════════════════════════════════════════════════════════════════════════

export const FILES_ROOT = process.env.FORMS_FILES_ROOT || path.join(path.dirname(UPLOADS_ROOT), 'forms-files');
const RE_ID = /^[a-z0-9]{24}$/, RE_UUID = /^[0-9a-f-]{36}$/;
const PENDING_TTL = 48 * 3_600_000;

export interface FileMeta { id: string; name: string; type: string; size: number; at: string }

const secret = () => process.env.FORMS_WORKER_SECRET || '';
/** Signature d'un jeton de fichier (même calcul dans le Worker) : le navigateur ne peut pas en forger. */
export const fileSig = (publicId: string, id: string) => crypto.createHmac('sha256', secret()).update(`file.${publicId}.${id}`).digest('hex').slice(0, 32);
export function tokenId(publicId: string, token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const [id, sig] = token.split('.');
  if (!RE_ID.test(id || '') || !/^[a-f0-9]{32}$/.test(sig || '')) return null;
  const a = Buffer.from(fileSig(publicId, id)), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
}

const dirOf = (formId: string, sub: string) => {
  if (!RE_UUID.test(formId) || !(sub === '_pending' || RE_UUID.test(sub))) throw new Error('Chemin de fichier invalide.');
  return path.join(FILES_ROOT, formId, sub);
};
const safeName = (n: string) => n.normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').slice(0, 120) || 'fichier';

/** Dépôt (en attente de la réponse). Purge au passage les dépôts orphelins du formulaire. */
export function savePending(formId: string, id: string, name: string, type: string, bytes: Buffer): FileMeta {
  if (!RE_ID.test(id)) throw new Error('Identifiant de fichier invalide.');
  const dir = dirOf(formId, '_pending');
  fs.mkdirSync(dir, { recursive: true });
  purgePending(dir);
  const meta: FileMeta = { id, name: safeName(name), type, size: bytes.length, at: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, `${id}.bin`), bytes);
  fs.writeFileSync(path.join(dir, `${id}.meta`), JSON.stringify(meta));
  return meta;
}
function purgePending(dir: string) {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (now - fs.statSync(p).mtimeMs > PENDING_TTL) fs.rmSync(p, { force: true }); }
  } catch { /* dossier absent */ }
}
/** Rattache des dépôts à une réponse. Rend les identifiants introuvables (expirés, jamais déposés). */
export function claim(formId: string, responseId: string, ids: string[]): string[] {
  const from = dirOf(formId, '_pending'), to = dirOf(formId, responseId), missing: string[] = [];
  for (const id of ids) {
    if (!RE_ID.test(id) || !fs.existsSync(path.join(from, `${id}.bin`))) {
      if (!fs.existsSync(path.join(to, `${id}.bin`))) missing.push(id);   // un renvoi depuis la file l'a déjà rattaché
      continue;
    }
    fs.mkdirSync(to, { recursive: true });
    for (const ext of ['bin', 'meta']) fs.renameSync(path.join(from, `${id}.${ext}`), path.join(to, `${id}.${ext}`));
  }
  return missing;
}
export function pendingExists(formId: string, id: string) { return RE_ID.test(id) && fs.existsSync(path.join(dirOf(formId, '_pending'), `${id}.bin`)); }
/** Fichier d'une réponse (pour la route de lecture authentifiée). */
export function readFile(formId: string, responseId: string, id: string): { meta: FileMeta; file: string } | null {
  if (!RE_ID.test(id)) return null;
  const dir = dirOf(formId, responseId), file = path.join(dir, `${id}.bin`);
  if (!fs.existsSync(file)) return null;
  let meta: FileMeta;
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, `${id}.meta`), 'utf8')); } catch { meta = { id, name: 'fichier', type: 'application/octet-stream', size: fs.statSync(file).size, at: '' }; }
  return { meta, file };
}
export function listFiles(formId: string, responseId: string): FileMeta[] {
  try {
    const dir = dirOf(formId, responseId);
    return fs.readdirSync(dir).filter((f) => f.endsWith('.meta')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  } catch { return []; }
}
/** Effacement (réponse supprimée, droit à l'effacement) ; sans `responseId` : tout le formulaire. */
export function removeFiles(formId: string, responseId?: string) {
  if (!RE_UUID.test(formId)) return;
  try { fs.rmSync(responseId ? dirOf(formId, responseId) : path.join(FILES_ROOT, formId), { recursive: true, force: true }); } catch { /* rien à effacer */ }
}
