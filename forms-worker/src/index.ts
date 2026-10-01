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
import { validate, type BonyFormDef, type Answers } from '../../shared/bonyform';
import CLIENT from './gen/client.js';
import BONY_LOGO from '../../public/logo-bony-white.svg';

interface Env {
  FORMS: KVNamespace;
  GEARBOX_URL: string;
  GEARBOX_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET: string;
}
interface Stored { status: 'open' | 'closed'; version: number; def: BonyFormDef }
interface State { status: string; taken: Record<string, Record<string, number>>; total: number }

const RATE = 8;                 // envois par minute, par IP et par formulaire
const MIN_FILL_MS = 1500;       // en dessous : robot
const QUEUE_TTL = 30 * 86400;   // une réponse en file est gardée 30 jours

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
const SEC_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.bunny.net; font-src https://fonts.bunny.net; img-src * data: blob:; frame-src https://challenges.cloudflare.com; connect-src 'self'",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SEC_HEADERS } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** JSON inclus dans un <script> : rien qui puisse fermer la balise. */
const inlineJson = (x: unknown) => JSON.stringify(x).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// Polices servies par Bunny Fonts (miroir de Google Fonts sans traceur : pas de transfert d'IP à Google).
// Syncopate n'existe qu'en 400 et 700.
const FONTS: Record<string, { slug: string; w: string }> = {
  'Albert Sans': { slug: 'albert-sans', w: '400,500,600,700,800' }, 'Syncopate': { slug: 'syncopate', w: '400,700' },
  'Inter': { slug: 'inter', w: '400,500,600,700,800' }, 'Poppins': { slug: 'poppins', w: '400,500,600,700,800' },
  'Montserrat': { slug: 'montserrat', w: '400,500,600,700,800' }, 'Playfair Display': { slug: 'playfair-display', w: '400,600,700,800' },
  'Space Grotesk': { slug: 'space-grotesk', w: '400,500,600,700' },
};
function page(title: string, theme: BonyFormDef['theme'] | null, bodyHtml: string, boot?: unknown, status = 200) {
  const t = theme || { primary: '#f75632', background: '#f6f4fa', surface: '#ffffff', text: '#1d1a24', font: 'Poppins', radius: 16 } as any;
  const body = FONTS[t.font] || FONTS['Albert Sans'], head = (t.headingFont && FONTS[t.headingFont]) || null;
  const families = [`${body.slug}:${body.w}`, ...(head && head !== body ? [`${head.slug}:${head.w}`] : [])].join('|');
  const logo = BONY_LOGO.replace(/<\?xml[^>]*>/, '').replace(/fill="#ffffff"/gi, 'fill="currentColor"');
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="${esc(t.background)}">
<link rel="preconnect" href="https://fonts.bunny.net"><link rel="stylesheet" href="https://fonts.bunny.net/css?family=${families}&display=swap">
<style>:root{--p:${t.primary};--bg:${t.background};--sf:${t.surface};--tx:${t.text};--r:${Number(t.radius) || 0}px;--font:'${t.font}',system-ui,-apple-system,'Segoe UI',sans-serif;--hfont:'${t.headingFont || t.font}','${t.font}',system-ui,sans-serif}${CSS}</style>
${boot ? `<script>window.__BF=${inlineJson(boot)}</script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>` : ''}
</head><body><template id="bony-logo">${logo}</template><div id="app">${bodyHtml}</div>${boot ? `<script>${CLIENT}</script>` : ''}</body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SEC_HEADERS } });
}
const notice = (title: string, msg: string, theme: BonyFormDef['theme'] | null = null, status = 200) =>
  page(title, theme, `<main class="bf-notice"><div class="bf-card bf-in"><div class="bf-ico">!</div><h1>${esc(title)}</h1><p>${esc(msg)}</p></div></main>`, undefined, status);

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
    meta: { params, durationMs: Math.min(Date.now() - Number(body.t0), 86_400_000), country: (req as any).cf?.country || null, layout: form.def.theme.layout },
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
    return page(form.def.title, form.def.theme, '<div class="bf-boot"></div>', { publicId, def: form.def, siteKey: env.TURNSTILE_SITE_KEY, taken: state?.taken || {} });
  },

  async scheduled(_ev: ScheduledEvent, env: Env, ctx: ExecutionContext) { ctx.waitUntil(flushQueue(env)); },
};

// ---------------------------------------------------------------- styles (thème par variables CSS)
const CSS = `
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--tx);font:16px/1.5 var(--font);-webkit-font-smoothing:antialiased}
.bf-wrap{max-width:720px;margin:0 auto;padding:28px 16px 80px}
.bf-card{background:var(--sf);border-radius:var(--r);padding:24px;box-shadow:0 1px 2px rgba(0,0,0,.06),0 12px 32px -18px rgba(0,0,0,.35);border:1px solid color-mix(in srgb,var(--tx) 8%,transparent)}
.bf-head{position:relative;overflow:hidden;padding:0}
.bf-head .bf-hero{height:180px;background:center/cover no-repeat;}
.bf-head .bf-band{height:10px;background:var(--p)}
.bf-head .bf-hin{padding:22px 24px 24px}
.bf-logo{height:30px;color:var(--tx);margin-bottom:14px;display:block}.bf-logo svg{height:100%;width:auto}
h1{font-family:var(--hfont);font-size:clamp(24px,5vw,32px);line-height:1.15;margin:0 0 8px;font-weight:700;letter-spacing:-.01em}
.bf-desc{margin:0;opacity:.78;white-space:pre-wrap}
.bf-list{display:flex;flex-direction:column;gap:14px;margin-top:14px}
.bf-q{transition:opacity .35s,transform .35s cubic-bezier(.22,1,.36,1)}
.bf-q label.bf-l{display:block;font-weight:650;font-size:16.5px;margin-bottom:4px}
.bf-req{color:var(--p);margin-left:3px}
.bf-help{font-size:14px;opacity:.7;margin:0 0 12px;white-space:pre-wrap}
.bf-in{animation:bf-in .55s cubic-bezier(.22,1,.36,1) both;animation-delay:calc(var(--i,0)*55ms)}
@keyframes bf-in{from{opacity:0;transform:translateY(16px) scale(.985)}to{opacity:1;transform:none}}
.bf-fold{display:grid;grid-template-rows:1fr;transition:grid-template-rows .4s cubic-bezier(.22,1,.36,1),opacity .3s}
.bf-fold>div{min-height:0;overflow:hidden}.bf-fold.off{grid-template-rows:0fr;opacity:0;pointer-events:none}
.bf-list>.bf-fold.off{margin-top:-14px}   /* l'écart de la liste ne doit pas rester sous une question masquée */
input.bf-t,textarea.bf-t,select.bf-t{width:100%;font:inherit;color:var(--tx);background:color-mix(in srgb,var(--tx) 4%,var(--sf));border:1.5px solid color-mix(in srgb,var(--tx) 14%,transparent);border-radius:calc(var(--r)*.6);padding:12px 14px;outline:0;transition:border-color .2s,box-shadow .2s,background .2s}
textarea.bf-t{min-height:110px;resize:vertical}
input.bf-t:focus,textarea.bf-t:focus,select.bf-t:focus{border-color:var(--p);box-shadow:0 0 0 4px color-mix(in srgb,var(--p) 22%,transparent);background:var(--sf)}
.bf-opts{display:grid;gap:8px}
.bf-opt{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:calc(var(--r)*.6);border:1.5px solid color-mix(in srgb,var(--tx) 12%,transparent);cursor:pointer;transition:border-color .2s,background .2s,transform .15s;user-select:none}
.bf-opt:hover{border-color:color-mix(in srgb,var(--p) 55%,transparent)}
.bf-opt:active{transform:scale(.985)}
.bf-opt input{position:absolute;opacity:0;pointer-events:none}
.bf-mk{width:22px;height:22px;flex:none;border:2px solid color-mix(in srgb,var(--tx) 30%,transparent);border-radius:50%;display:grid;place-items:center;transition:all .2s}
.bf-opt.sq .bf-mk{border-radius:6px}
.bf-mk::after{content:"";width:10px;height:10px;border-radius:inherit;background:#fff;transform:scale(0);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.bf-opt.on{border-color:var(--p);background:color-mix(in srgb,var(--p) 9%,transparent)}
.bf-opt.on .bf-mk{background:var(--p);border-color:var(--p)}.bf-opt.on .bf-mk::after{transform:scale(1)}
.bf-other{margin-top:8px}
.bf-scale{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.bf-scale button{min-width:46px;height:46px;border-radius:calc(var(--r)*.6);border:1.5px solid color-mix(in srgb,var(--tx) 14%,transparent);background:transparent;color:var(--tx);font:inherit;font-weight:650;cursor:pointer;transition:all .2s cubic-bezier(.34,1.56,.64,1)}
.bf-scale button:hover{border-color:var(--p);transform:translateY(-2px)}
.bf-scale button.on{background:var(--p);border-color:var(--p);color:#fff;transform:scale(1.08)}
.bf-scale-l{display:flex;justify-content:space-between;font-size:13px;opacity:.65;margin-top:6px}
.bf-stars{display:flex;gap:6px}.bf-stars button{font-size:34px;line-height:1;background:none;border:0;cursor:pointer;color:color-mix(in srgb,var(--tx) 22%,transparent);transition:transform .2s cubic-bezier(.34,1.56,.64,1),color .2s;padding:2px}
.bf-stars button.on{color:var(--p)}.bf-stars button:hover{transform:scale(1.2) rotate(-6deg)}
.bf-consent{display:flex;gap:12px;align-items:flex-start;cursor:pointer;font-size:14.5px}
.bf-consent .bf-mk{border-radius:6px;margin-top:2px}
.bf-err{color:#e5484d;font-size:13.5px;margin-top:8px;display:flex;gap:6px;align-items:center;animation:bf-in .3s both}
.bf-q.bad .bf-t,.bf-q.bad .bf-opt{border-color:#e5484d}
.bf-q.shake{animation:bf-shake .4s}@keyframes bf-shake{20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(2px)}}
.bf-sec{padding-top:10px}.bf-sec h2{font-family:var(--hfont);font-size:21px;margin:0 0 4px;font-weight:700}
.bf-stmt{white-space:pre-wrap}
.bf-act{display:flex;align-items:center;gap:12px;margin-top:20px;flex-wrap:wrap}
.bf-btn{font:inherit;font-weight:700;font-size:16px;color:#fff;background:var(--p);border:0;border-radius:calc(var(--r)*.7);padding:14px 26px;cursor:pointer;box-shadow:0 10px 24px -12px var(--p);transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s,opacity .2s;display:inline-flex;align-items:center;gap:10px}
.bf-btn:hover{transform:translateY(-2px);box-shadow:0 14px 28px -12px var(--p)}.bf-btn:active{transform:scale(.97)}
.bf-btn[disabled]{opacity:.6;cursor:wait;transform:none}
.bf-btn.ghost{background:transparent;color:var(--tx);box-shadow:none;border:1.5px solid color-mix(in srgb,var(--tx) 18%,transparent)}
.bf-spin{width:16px;height:16px;border-radius:50%;border:2.5px solid #fff;border-right-color:transparent;animation:bf-rot .7s linear infinite}@keyframes bf-rot{to{transform:rotate(360deg)}}
.bf-gerr{color:#e5484d;font-weight:600;font-size:14px}
.bf-ts{min-height:0}
.bf-hp{position:absolute!important;left:-9999px;width:1px;height:1px;opacity:0}
.bf-prog{position:sticky;top:0;z-index:5;height:5px;background:color-mix(in srgb,var(--tx) 8%,transparent)}
.bf-prog i{display:block;height:100%;background:var(--p);transform-origin:left;transition:transform .45s cubic-bezier(.22,1,.36,1)}
.bf-step{min-height:60vh;display:flex;flex-direction:column;justify-content:center}
.bf-step .bf-q label.bf-l{font-size:22px}
.bf-stepnav{font-size:13px;opacity:.6;margin-bottom:10px}
.bf-slide-in{animation:bf-sl .5s cubic-bezier(.22,1,.36,1) both}@keyframes bf-sl{from{opacity:0;transform:translateY(34px)}to{opacity:1;transform:none}}
.bf-slide-back{animation:bf-sb .5s cubic-bezier(.22,1,.36,1) both}@keyframes bf-sb{from{opacity:0;transform:translateY(-34px)}to{opacity:1;transform:none}}
.bf-thanks{text-align:center;padding:48px 24px}
.bf-check{width:84px;height:84px;margin:0 auto 18px}
.bf-check circle{stroke:var(--p);stroke-width:4;fill:none;stroke-dasharray:252;stroke-dashoffset:252;animation:bf-draw .7s cubic-bezier(.65,0,.35,1) forwards}
.bf-check path{stroke:var(--p);stroke-width:5;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;stroke-dashoffset:60;animation:bf-draw .45s .55s cubic-bezier(.65,0,.35,1) forwards}
@keyframes bf-draw{to{stroke-dashoffset:0}}
.bf-conf{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:9}
.bf-conf i{position:absolute;top:-12px;width:9px;height:14px;border-radius:2px;animation:bf-fall linear forwards}
@keyframes bf-fall{to{transform:translate3d(var(--dx),110vh,0) rotate(var(--rot));opacity:.9}}
.bf-notice{min-height:100vh;display:grid;place-items:center;padding:24px}.bf-notice .bf-card{max-width:460px;text-align:center}
.bf-ico{width:52px;height:52px;border-radius:50%;margin:0 auto 14px;display:grid;place-items:center;background:color-mix(in srgb,var(--p) 14%,transparent);color:var(--p);font-weight:800;font-size:24px}
.bf-foot{text-align:center;font-size:12px;opacity:.45;margin-top:26px}
@media (max-width:560px){.bf-card{padding:18px}.bf-head .bf-hin{padding:18px}.bf-head .bf-hero{height:130px}.bf-scale button{min-width:40px;height:42px}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;
