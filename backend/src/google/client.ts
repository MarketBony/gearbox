import crypto from 'crypto';
import { prisma } from '../db';

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT GOOGLE (01/10/2026) — PORTE UNIQUE vers Google pour la rubrique Forms.
//
// Un seul compte Google connecté côté serveur (marketbony@gmail.com). Aucun jeton Google ne
// quitte ce module : ni vers le navigateur, ni dans les logs. Appels en `fetch` direct (pas de
// bibliothèque `googleapis`, lourde pour trois points d'entrée).
//
// Variables d'environnement (backend/.env et .env du VPS, listées dans docker-compose.yml) :
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI,
//   GOOGLE_TOKEN_KEY (32 octets en base64) — ⚠️ IDENTIQUE en local et sur le VPS : le backend
//   local écrit dans la base de PRODUCTION, un jeton chiffré en local doit rester lisible en prod.
// ═══════════════════════════════════════════════════════════════════════════

/** Accès demandés à Google. `forms.body` et `forms.responses.readonly` sont classés « sensibles »
 *  (pas « restreints ») par la console : app non vérifiée, sans audit annuel. `openid email` :
 *  savoir QUEL compte a été connecté (un compte perso par erreur se verrait tout de suite). */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.responses.readonly',
];

const env = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI?.trim() || '',
  key: process.env.GOOGLE_TOKEN_KEY?.trim() || '',
});
export const googleConfigured = () => { const e = env(); return !!(e.clientId && e.clientSecret && e.redirectUri && e.key); };

/** Erreur d'authentification Google (jeton révoqué, compte non connecté) : la route répond 409. */
export class GoogleAuthError extends Error {}
/** Erreur rendue par l'API Google : `status` HTTP de Google, message lisible. */
export class GoogleApiError extends Error { constructor(public status: number, message: string) { super(message); } }

// ---------------------------------------------------------------- chiffrement du jeton
const keyBuf = () => {
  const k = Buffer.from(env().key, 'base64');
  if (k.length !== 32) throw new Error('GOOGLE_TOKEN_KEY invalide (32 octets en base64 attendus).');
  return k;
};
export const encrypt = (plain: string) => {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keyBuf(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
};
const decrypt = (enc: string) => {
  const [v, iv, tag, ct] = enc.split(':');
  if (v !== 'v1') throw new Error('Format de jeton inconnu.');
  const d = crypto.createDecipheriv('aes-256-gcm', keyBuf(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
};

// ---------------------------------------------------------------- autorisation (OAuth, flux serveur)
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** États OAuth en cours (anti-falsification) : un par clic « Connecter », valable 10 minutes. */
const pendingStates = new Map<string, { userId: string; exp: number }>();

export function authUrl(userId: string) {
  const now = Date.now();
  for (const [k, v] of pendingStates) if (v.exp < now) pendingStates.delete(k);
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, { userId, exp: now + 10 * 60_000 });
  const e = env();
  const q = new URLSearchParams({
    client_id: e.clientId, redirect_uri: e.redirectUri, response_type: 'code', scope: GOOGLE_SCOPES.join(' '),
    // `offline` + `consent` : Google rend un jeton de rafraîchissement à CHAQUE connexion (sinon
    // seulement la première fois). ⚠️ Plafond de 100 jetons par client : ne pas reconnecter en boucle.
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Fin du flux : échange le code, vérifie les accès accordés, enregistre le jeton chiffré. */
export async function completeAuth(state: string, code: string) {
  const st = pendingStates.get(state); pendingStates.delete(state);
  if (!st || st.exp < Date.now()) throw new GoogleAuthError('Demande de connexion expirée ou inconnue : recommencez depuis Gearbox.');
  const e = env();
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: e.clientId, client_secret: e.clientSecret, redirect_uri: e.redirectUri, grant_type: 'authorization_code' }) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.refresh_token) throw new GoogleAuthError(`Google a refusé la connexion (${j.error_description || j.error || r.status}).`);
  const granted = String(j.scope || '');
  const missing = GOOGLE_SCOPES.filter((s) => s.startsWith('https://') && !granted.includes(s));
  if (missing.length) throw new GoogleAuthError('Tous les accès n’ont pas été cochés sur l’écran Google : recommencez en cochant tout.');
  let email: string | null = null;
  try { email = JSON.parse(Buffer.from(String(j.id_token).split('.')[1], 'base64url').toString('utf8')).email || null; } catch { /* sans e-mail */ }
  const data = { email, refreshTokenEnc: encrypt(j.refresh_token), scopes: granted, connectedBy: st.userId, connectedAt: new Date(), lastError: null };
  await prisma.googleConnection.upsert({ where: { id: 'google' }, create: { id: 'google', ...data }, update: data });
  access = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60_000 };
  return { email };
}

/** Déconnexion : révocation chez Google (au mieux), puis suppression de la ligne. */
export async function disconnect() {
  const row = await prisma.googleConnection.findUnique({ where: { id: 'google' } });
  access = null;
  if (!row) return;
  try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(row.refreshTokenEnc))}`, { method: 'POST' }); } catch { /* déjà révoqué : sans gravité */ }
  await prisma.googleConnection.delete({ where: { id: 'google' } });
}

// ---------------------------------------------------------------- jeton d'accès (cache mémoire, ~1 h)
let access: { token: string; exp: number } | null = null;
async function accessToken(force = false): Promise<string> {
  if (!force && access && access.exp > Date.now()) return access.token;
  if (!googleConfigured()) throw new GoogleAuthError('Google n’est pas configuré sur ce serveur.');
  const row = await prisma.googleConnection.findUnique({ where: { id: 'google' } });
  if (!row) throw new GoogleAuthError('Aucun compte Google connecté.');
  const e = env();
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: decrypt(row.refreshTokenEnc), client_id: e.clientId, client_secret: e.clientSecret, grant_type: 'refresh_token' }) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    // `invalid_grant` = accès révoqué (manuellement, 6 mois sans usage…) : reconnexion par le Master.
    const msg = j.error === 'invalid_grant' ? 'Accès Google révoqué : le Master doit reconnecter le compte.' : `Renouvellement de l’accès Google impossible (${j.error || r.status}).`;
    await prisma.googleConnection.update({ where: { id: 'google' }, data: { lastError: msg } }).catch(() => {});
    access = null;
    throw new GoogleAuthError(msg);
  }
  if (row.lastError) await prisma.googleConnection.update({ where: { id: 'google' }, data: { lastError: null } }).catch(() => {});
  access = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60_000 };
  return access.token;
}

// ---------------------------------------------------------------- appels à l'API Forms
const FORMS = 'https://forms.googleapis.com/v1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Appel à l'API Forms : jeton renouvelé au besoin, reprise sur 429 / 5xx (attente croissante). */
export async function forms<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let forced = false;
  for (let attempt = 0; ; attempt++) {
    const token = await accessToken(forced);
    const r = await fetch(`${FORMS}${path}`, {
      method: init.method || 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (r.ok) return (r.status === 204 ? null : await r.json()) as T;
    if (r.status === 401 && !forced) { forced = true; continue; }          // jeton périmé avant l'heure
    if ((r.status === 429 || r.status >= 500) && attempt < 3) { await sleep(600 * 2 ** attempt + Math.random() * 300); continue; }
    const j: any = await r.json().catch(() => ({}));
    const msg = r.status === 404 ? 'Formulaire introuvable chez Google (supprimé, ou n’appartient pas au compte connecté).'
      : r.status === 403 ? 'Google refuse l’accès à ce formulaire : il n’appartient pas au compte connecté, ou ne lui est pas partagé en édition.'
      : r.status === 429 ? 'Google limite les appels : réessayez dans une minute.'
      : j?.error?.message || `Erreur Google (${r.status}).`;
    throw new GoogleApiError(r.status, msg);
  }
}
