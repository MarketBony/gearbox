import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// LIEN GEARBOX ↔ WORKER CLOUDFLARE des Forms Bony (01/10/2026) — PORTE UNIQUE.
//
// Deux sens, une seule règle : chaque message est SIGNÉ (HMAC-SHA256 du corps + horodatage) avec
// le secret partagé `FORMS_WORKER_SECRET` (même valeur dans backend/.env, le .env du VPS et les
// secrets du Worker). Horodatage à ±5 minutes : un message capturé ne peut pas être rejoué plus tard.
//  - Gearbox → Worker : publication / fermeture d'un formulaire (définition déposée dans le KV).
//  - Worker → Gearbox : réponse validée (routes/bonyForms.ts, POST /ingest), état des places.
// Le Worker n'a AUCUN accès à la base : le pire qu'une fuite de son secret permettrait est de déposer
// de fausses réponses, jamais de lire les données.
// ═══════════════════════════════════════════════════════════════════════════

const env = () => ({ url: (process.env.FORMS_WORKER_URL || '').replace(/\/+$/, ''), secret: process.env.FORMS_WORKER_SECRET || '' });
export const workerConfigured = () => { const e = env(); return !!(e.url && e.secret.length >= 32); };
export const workerUrl = () => env().url;

const SKEW = 5 * 60_000;
export const sign = (ts: string, body: string) => crypto.createHmac('sha256', env().secret).update(`${ts}.${body}`).digest('hex');

/** Vérifie la signature d'un message du Worker (corps JSON re-sérialisé à l'identique). */
export function verify(ts: unknown, sig: unknown, body: unknown): boolean {
  if (!workerConfigured() || typeof ts !== 'string' || typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > SKEW) return false;
  const expected = Buffer.from(sign(ts, JSON.stringify(body)), 'hex');
  const got = Buffer.from(sig, 'hex');
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

/** Appel signé vers le Worker (`/__gearbox/...`). Rend le JSON de réponse, ou lève une erreur lisible. */
export async function callWorker(path: string, payload: unknown): Promise<any> {
  if (!workerConfigured()) throw new Error('Le Worker des formulaires n’est pas configuré (FORMS_WORKER_URL / FORMS_WORKER_SECRET).');
  const body = JSON.stringify(payload), ts = String(Date.now());
  let r: Response;
  try {
    r = await fetch(`${env().url}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gearbox-ts': ts, 'x-gearbox-sig': sign(ts, body) }, body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch { throw new Error('Le Worker des formulaires est injoignable : le formulaire n’a pas été mis en ligne.'); }
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Le Worker a refusé la demande (${r.status}).`);
  return j;
}
