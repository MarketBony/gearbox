// =====================================================================
// FORMS BONY — Worker public (Cloudflare), 01/10/2026.
// https://forms.bonyauto-mobile.workers.dev/<publicId>
//
// UNE application sert TOUS les formulaires : publier un formulaire = Gearbox dépose sa définition
// dans le KV (`form:<publicId>`), sans rebuild ni déploiement. Rôles du Worker :
//  1. afficher le formulaire (page + client `client.ts` inclus dans la page) ;
//  2. filtrer les abus AVANT tout appel à Gearbox : limitation de débit par IP, champ piège,
//     délai minimal de remplissage, captcha Turnstile ;
//  3. valider les réponses avec le format PARTAGÉ (shared/bonyform.ts, même fonction que Gearbox) ;
//  4. transmettre la réponse à Gearbox, SIGNÉE (HMAC, secret partagé) — et si Gearbox ne répond pas,
//     la garder en file (`q:<id>`) et la renvoyer chaque minute (cron) : aucune réponse perdue.
// Le Worker n'a AUCUN accès à la base de Gearbox.
// =====================================================================
import { validate, type BonyFormDef, type Answers, type Theme } from '../../shared/bonyform';
import { renderTheme, fontsHref, fontFaces } from './theme';
import { CSS } from './styles';
import CLIENT from './gen/client.js';
import BONY_LOGO from '../../public/logo-bony-white.svg';

interface Env {
  FORMS: KVNamespace;
  GEARBOX_URL: string;
  GEARBOX_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET: string;
  /** Origines autorisées à intégrer l'aperçu en direct (/__preview), séparées par des virgules. */
  PREVIEW_ORIGINS: string;
}
interface Stored { status: 'open' | 'closed'; version: number; def: BonyFormDef }
interface State { status: string; taken: Record<string, Record<string, number>>; total: number }

const RATE = 8;                 // envois par minute, par IP et par formulaire
const MIN_FILL_MS = 1500;       // en dessous : robot
const QUEUE_TTL = 30 * 86400;   // une réponse en file est gardée 30 jours
const ASSET_MAX = 3 * 1024 * 1024;  // une image : 3 Mo au plus (compressée par Gearbox avant l'envoi)

// ---------------------------------------------------------------- signature (HMAC-SHA256, hex)
async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const safeEq = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
async function signedByGearbox(req: Request, env: Env, raw: string) {
  const ts = req.headers.get('x-gearbox-ts') || '', sig = req.headers.get('x-gearbox-sig') || '';
  if (!env.GEARBOX_SECRET || !ts || Math.abs(Date.now() - Number(ts)) > 5 * 60_000) return false;
  return safeEq(await hmac(env.GEARBOX_SECRET, `${ts}.${raw}`), sig);
}
async function toGearbox(env: Env, path: string, payload: unknown, timeoutMs = 8000) {
  const body = JSON.stringify(payload), ts = String(Date.now());
  return fetch(`${env.GEARBOX_URL.replace(/\/+$/, '')}${path}`, {
    method: 'POST', body, signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', 'x-gearbox-ts': ts, 'x-gearbox-sig': await hmac(env.GEARBOX_SECRET, `${ts}.${body}`) },
  });
}

// ---------------------------------------------------------------- réponses HTTP
const CSP_BASE = "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.bunny.net; font-src 'self' https://fonts.bunny.net; img-src * data: blob:; frame-src https://challenges.cloudflare.com; connect-src 'self'";
const SEC_HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'content-security-policy': CSP_BASE };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SEC_HEADERS } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** JSON inclus dans un <script> : rien qui puisse fermer la balise. */
const inlineJson = (x: unknown) => JSON.stringify(x).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** Page HTML : thème (variables + attributs, theme.ts), calque de fond, client inclus si `boot`. */
function page(title: string, theme: Partial<Theme> | null, bodyHtml: string, boot?: unknown, opts: { status?: number; frameAncestors?: string; desc?: string; share?: { title?: string; image?: string | null }; origin?: string } = {}) {
  const { vars, attrs, t } = renderTheme(theme);
  const logo = BONY_LOGO.replace(/<\?xml[^>]*>/, '').replace(/fill="#ffffff"/gi, 'fill="currentColor"');
  const at = Object.entries(attrs).filter(([, v]) => v).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  const desc = opts.desc ? `<meta name="description" content="${esc(opts.desc)}"><meta property="og:description" content="${esc(opts.desc)}">` : '';
  // Aperçu du lien partagé (F2b) : réglages « Partage » d'abord, sinon titre, description et image d'en-tête.
  // Les robots des messageries veulent une adresse ABSOLUE pour l'image.
  const abs = (u?: string | null) => (!u ? '' : /^https?:\/\//.test(u) ? u : /^\/a\/[a-z0-9]+$/.test(u) && opts.origin ? `${opts.origin}${u}` : '');
  const ogTitle = opts.share?.title?.trim() || title, ogImg = abs(opts.share?.image) || abs(t.header.image) || abs(t.bg.kind === 'image' ? t.bg.image : null);
  const og = `<meta property="og:type" content="website"><meta property="og:site_name" content="Bony Automobiles"><meta property="og:title" content="${esc(ogTitle)}">${desc}${ogImg ? `<meta property="og:image" content="${esc(ogImg)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(ogImg)}">` : '<meta name="twitter:card" content="summary">'}<meta name="twitter:title" content="${esc(ogTitle)}">`;
  const html = `<!doctype html><html lang="fr"${at}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="${esc(/^#/.test(t.background) ? t.background : '#111111')}">${og}
<link rel="preconnect" href="https://fonts.bunny.net"><link id="bf-fonts" rel="stylesheet" href="${fontsHref(t)}">
<style id="bf-faces">${fontFaces(t)}</style><style id="bf-vars">:root{${vars}}</style><style>${CSS}</style>
${boot ? `<script>window.__BF=${inlineJson(boot)}</script>${(boot as any).preview ? '' : '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>'}` : ''}
</head><body><div class="bf-bg" aria-hidden="true"><i></i><i></i><i></i></div><div class="bf-side" aria-hidden="true"></div><template id="bony-logo">${logo}</template><div id="app">${bodyHtml}</div>${boot ? `<script>${CLIENT}</script>` : ''}</body></html>`;
  const csp = opts.frameAncestors ? `${CSP_BASE}; frame-ancestors ${opts.frameAncestors}` : CSP_BASE;
  return new Response(html, { status: opts.status || 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SEC_HEADERS, 'content-security-policy': csp } });
}
const notice = (title: string, msg: string, theme: Partial<Theme> | null = null, status = 200) =>
  page(title, theme, `<main class="bf-notice"><div class="bf-card bf-in"><div class="bf-ico">!</div><h1>${esc(title)}</h1><p>${esc(msg)}</p></div></main>`, undefined, { status });

// ---------------------------------------------------------------- état (places des créneaux), cache 30 s
async function stateOf(env: Env, publicId: string, def: BonyFormDef): Promise<State | null> {
  if (!def.fields.some((f) => f.type === 'slot') && !def.settings.maxResponses) return null;
  const k = `st:${publicId}`;
  const cached = await env.FORMS.get<State>(k, 'json');
  if (cached) return cached;
  try {
    const r = await toGearbox(env, '/api/bony-forms/state', { publicId }, 4000);
    if (!r.ok) return null;
    const s = (await r.json()) as State;
    await env.FORMS.put(k, JSON.stringify(s), { expirationTtl: 60 });
    return s;
  } catch { return null; }                                  // Gearbox indisponible : affichage sans compteur
}

// ---------------------------------------------------------------- réception d'une réponse
async function submit(req: Request, env: Env, publicId: string, form: Stored) {
  if (form.status !== 'open') return json({ error: form.def.settings.closedMessage || 'Ce formulaire n’accepte plus de réponses.', closed: true }, 409);
  const ip = req.headers.get('cf-connecting-ip') || 'inconnue';
  const rk = `rl:${publicId}:${ip}:${Math.floor(Date.now() / 60_000)}`;
  const n = Number((await env.FORMS.get(rk)) || 0);
  if (n >= RATE) return json({ error: 'Trop d’envois depuis votre connexion : réessayez dans une minute.' }, 429);
  await env.FORMS.put(rk, String(n + 1), { expirationTtl: 120 });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Requête invalide.' }, 400); }
  if (body?.hp) return json({ ok: true });                  // champ piège rempli : robot, on fait semblant
  if (!Number.isFinite(body?.t0) || Date.now() - Number(body.t0) < MIN_FILL_MS) return json({ error: 'Envoi trop rapide : réessayez.' }, 400);

  // Captcha Turnstile (vérifié côté serveur, jamais seulement dans le navigateur).
  const ts = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(body?.token || ''), remoteip: ip }),
  }).then((r) => r.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
  if (!ts.success) return json({ error: 'Vérification anti-robot échouée : rechargez la page.', captcha: true }, 403);

  const state = await stateOf(env, publicId, form.def);
  const v = validate(form.def, (body?.answers || {}) as Answers, { taken: state?.taken });
  if (!v.ok) return json({ error: 'Certaines réponses sont à corriger.', errors: v.errors }, 422);

  const params: Record<string, string> = {};
  if (body?.params && typeof body.params === 'object') Object.entries(body.params).slice(0, 20).forEach(([k, x]) => { if (typeof x === 'string') params[k.slice(0, 40)] = x.slice(0, 200); });
  const payload = {
    publicId, responseId: crypto.randomUUID(), answers: v.clean, submittedAt: new Date().toISOString(),
    meta: { params, ref: typeof body?.ref === 'string' && /^[a-z0-9.-]{1,120}$/i.test(body.ref) ? body.ref.toLowerCase() : null, durationMs: Math.min(Date.now() - Number(body.t0), 86_400_000), country: (req as any).cf?.country || null, layout: form.def.theme.layout },
  };
  try {
    const r = await toGearbox(env, '/api/bony-forms/ingest', payload);
    if (r.ok) { await env.FORMS.delete(`st:${publicId}`); return json({ ok: true }); }
    if (r.status === 409 || r.status === 422 || r.status === 404) return json(await r.json().catch(() => ({ error: 'Réponse refusée.' })), r.status);
    throw new Error(`Gearbox ${r.status}`);
  } catch (e) {
    // Gearbox indisponible (déploiement, panne) : la réponse est GARDÉE et renvoyée par le cron.
    await env.FORMS.put(`q:${payload.responseId}`, JSON.stringify({ ...payload, queued: true }), { expirationTtl: QUEUE_TTL });
    console.log(`[forms] réponse ${payload.responseId} mise en file (${e instanceof Error ? e.message : e})`);
    return json({ ok: true, queued: true });
  }
}

/** Cron (chaque minute) : renvoie à Gearbox les réponses restées en file. */
async function flushQueue(env: Env) {
  const list = await env.FORMS.list({ prefix: 'q:', limit: 50 });
  for (const k of list.keys) {
    const p = await env.FORMS.get(k.name); if (!p) continue;
    try {
      const r = await toGearbox(env, '/api/bony-forms/ingest', JSON.parse(p));
      // 2xx : enregistrée ; 404 : formulaire supprimé dans Gearbox (plus personne pour la lire).
      if (r.ok || r.status === 404) await env.FORMS.delete(k.name);
    } catch { /* Gearbox toujours indisponible : nouvel essai à la prochaine minute */ }
  }
}

// ---------------------------------------------------------------- routage
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, '') || '/';

    // Gearbox → Worker (signé) : publication, fermeture, retrait d'un formulaire.
    if (path.startsWith('/__gearbox/')) {
      if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
      const raw = await req.text();
      if (!(await signedByGearbox(req, env, raw))) return json({ error: 'Signature invalide.' }, 401);
      const msg = JSON.parse(raw);
      // Image (fond, en-tête, logo, option) ou police de marque : déposée par Gearbox. Identifiant = empreinte.
      // Pas de SVG : servi depuis ce domaine, il pourrait exécuter du script.
      if (path === '/__gearbox/asset') {
        if (!/^[a-z0-9]{16,64}$/.test(msg?.id || '') || !/^(image\/(webp|png|jpeg|gif)|font\/(woff2|woff|otf|ttf))$/.test(msg?.type || '') || typeof msg?.data !== 'string') return json({ error: 'Fichier invalide.' }, 400);
        const bin = Uint8Array.from(atob(msg.data), (c) => c.charCodeAt(0));
        if (bin.byteLength > ASSET_MAX) return json({ error: 'Image trop lourde.' }, 413);
        await env.FORMS.put(`asset:${msg.id}`, bin, { metadata: { type: msg.type } });
        return json({ ok: true, path: `/a/${msg.id}` });
      }
      if (!/^[a-z0-9]{10}$/.test(msg?.publicId || '')) return json({ error: 'Identifiant invalide.' }, 400);
      if (path === '/__gearbox/publish') {
        if (msg.status !== 'open' && msg.status !== 'closed') return json({ error: 'Statut invalide.' }, 400);
        await env.FORMS.put(`form:${msg.publicId}`, JSON.stringify({ status: msg.status, version: msg.version, def: msg.def }));
        await env.FORMS.delete(`st:${msg.publicId}`);
        return json({ ok: true });
      }
      if (path === '/__gearbox/remove') { await env.FORMS.delete(`form:${msg.publicId}`); await env.FORMS.delete(`st:${msg.publicId}`); return json({ ok: true }); }
      return json({ error: 'Inconnu.' }, 404);
    }

    // Images : immuables (l'identifiant est l'empreinte du contenu), cache d'un an au plus près du visiteur.
    const am = /^\/a\/([a-z0-9]{16,64})$/.exec(path);
    if (am && req.method === 'GET') {
      const cache = (caches as any).default as Cache;
      const hit = await cache.match(req); if (hit) return hit;
      const { value, metadata } = await env.FORMS.getWithMetadata<{ type: string }>(`asset:${am[1]}`, 'arrayBuffer');
      if (!value) return new Response('Introuvable', { status: 404 });
      const res = new Response(value, { headers: { 'content-type': metadata?.type || 'image/webp', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*', 'content-security-policy': "default-src 'none'; sandbox" } });
      await cache.put(req, res.clone());
      return res;
    }
    // Aperçu en direct (éditeur de Gearbox) : la définition arrive par postMessage, aucun envoi possible,
    // intégrable SEULEMENT par les origines de PREVIEW_ORIGINS.
    if (path === '/__preview') {
      const origins = (env.PREVIEW_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
      return page('Aperçu', null, '<div class="bf-boot"></div>', { preview: true, origins, def: null, siteKey: '', taken: {} }, { frameAncestors: origins.join(' ') || "'none'" });
    }
    if (path === '/') return notice('Formulaires Bony', 'Ouvrez le lien du formulaire reçu par e-mail.');
    if (path === '/favicon.ico') return new Response(null, { status: 204 });
    const m = /^\/([a-z0-9]{10})$/.exec(path);
    if (!m) return notice('Formulaire introuvable', 'Ce lien ne correspond à aucun formulaire.', null, 404);
    const publicId = m[1];
    const form = await env.FORMS.get<Stored>(`form:${publicId}`, 'json');
    if (!form) return notice('Formulaire introuvable', 'Ce lien ne correspond à aucun formulaire, ou il a été retiré.', null, 404);

    if (req.method === 'POST') return submit(req, env, publicId, form);
    if (req.method !== 'GET') return json({ error: 'Méthode non autorisée.' }, 405);

    const s = form.def.settings, now = Date.now();
    if (form.status !== 'open' || (s.closeAt && now > Date.parse(s.closeAt))) return notice(form.def.title, s.closedMessage || 'Ce formulaire n’accepte plus de réponses.', form.def.theme);
    if (s.openAt && now < Date.parse(s.openAt)) {
      const d = new Date(s.openAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
      return notice(form.def.title, `Ce formulaire ouvrira le ${d}.`, form.def.theme);
    }
    const state = await stateOf(env, publicId, form.def);
    if (s.maxResponses && state && state.total >= s.maxResponses) return notice(form.def.title, s.closedMessage || 'Le nombre maximal de réponses est atteint.', form.def.theme);
    return page(form.def.title, form.def.theme, '<div class="bf-boot"></div>', { publicId, def: form.def, siteKey: env.TURNSTILE_SITE_KEY, taken: state?.taken || {} }, { desc: form.def.settings.share?.description?.trim() || form.def.description || undefined, share: form.def.settings.share, origin: url.origin });
  },

  async scheduled(_ev: ScheduledEvent, env: Env, ctx: ExecutionContext) { ctx.waitUntil(flushQueue(env)); },
};
