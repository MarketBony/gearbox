// @ts-nocheck — moteur de la maquette CONVERTI (maquettes/v2/js/core.js), comportement identique.
// Typage fin : second temps, fichier par fichier, une fois le rendu validé identique à la maquette.
// Substitutions mécaniques : scripts/ui2-convert-engine.mjs. Retouches manuelles : balises [GEARBOX].
export function install(): void {
/* =====================================================================
   GEARBOX OS — noyau : ressorts, icônes, formats, stockage, bus,
   primitives d'interface (menus, info-bulles, onglets, feuilles, piles).
   Tout est inventé : aucune donnée réelle, aucun appel réseau.
   ===================================================================== */
const GX = (window.GX = { apps: new Map(), ctx: { role: 'admin', site: null, perimetre: 'Tout le réseau', readOnly: false } });

/* [GEARBOX] La coque vit dans un Shadow DOM (ui2/os/OsHost.tsx), posé AVANT l'installation :
   GX.host = l'élément hôte (ce que la maquette posait sur <html> / <body> : data-theme, classes…),
   GX.root = la racine fantôme (document.querySelector…), GX.body = le conteneur où la maquette
   ajoutait ses éléments (document.body.append…). */
Object.assign(GX, window.__GX_BOOT || {});
/* [GEARBOX] Rôle réel, id réel de l'utilisateur (la maquette l'appelait 'me') : posés par le pont. */
GX.ctx.uid = GX.ctx.uid || '';
/* [GEARBOX] Écouteurs sur window / document : un événement sorti d'un Shadow DOM a pour
   `target` l'HÔTE. GX.win rend au gestionnaire un événement dont `target` est la VRAIE cible
   (composedPath()[0]) ; GX.unwin retire le même gestionnaire. Tout le reste est inchangé. */
const __wrapped = new WeakMap();
const __real = (e) => {
  const t = (e.composedPath && e.composedPath()[0]) || e.target;
  if (t === e.target) return e;
  return new Proxy(e, { get: (o, k) => (k === 'target' ? t : typeof o[k] === 'function' ? o[k].bind(o) : o[k]) });
};
GX.win = (tgt, type, fn, opts) => {
  let w = __wrapped.get(fn);
  if (!w) { w = (e) => fn(__real(e)); __wrapped.set(fn, w); }
  tgt.addEventListener(type, w, opts);
};
GX.unwin = (tgt, type, fn, opts) => { const w = __wrapped.get(fn); if (w) tgt.removeEventListener(type, w, opts); };

/* ---------- Ressorts physiques → courbes CSS linear() (modèle SwiftUI) ---------- */
function springCurve({ stiffness = 300, damping = 30, mass = 1 }) {
  const dt = 1 / 240; let x = 0, v = 0, t = 0; const pts = [];
  while (t < 3) {
    const a = (-stiffness * (x - 1) - damping * v) / mass;
    v += a * dt; x += v * dt; t += dt; pts.push([t, x]);
    if (t > 0.08 && Math.abs(1 - x) < 0.0006 && Math.abs(v) < 0.012) break;
  }
  const step = Math.max(1, Math.floor(pts.length / 44)), out = ['0'];
  for (let i = step; i < pts.length; i += step) out.push(`${pts[i][1].toFixed(4)} ${((pts[i][0] / t) * 100).toFixed(1)}%`);
  out.push('1');
  return { css: `linear(${out.join(', ')})`, ms: Math.round(t * 1000) };
}
const LINEAR_OK = (() => { try { return CSS.supports('transition-timing-function', 'linear(0, 1)'); } catch (e) { return false; } })();
GX.spring = {
  snappy: springCurve({ stiffness: 420, damping: 26 }),   // ζ ≈ 0,63 : dépasse d’environ 8 % puis se pose (fenêtres, feuilles, piles)
  soft:   springCurve({ stiffness: 200, damping: 19 }),   // ζ ≈ 0,67 : glissés longs (bureaux, graphiques)
  bouncy: springCurve({ stiffness: 360, damping: 14 }),   // ζ ≈ 0,37 : rebond franc (relâchement, pastilles, widgets)
  gentle: springCurve({ stiffness: 150, damping: 17 }),
  window: springCurve({ stiffness: 380, damping: 29 }),   // ζ ≈ 0,74 : léger dépassement (~3 %) — une fenêtre ne doit pas « sauter »
};
for (const s of Object.values(GX.spring)) if (!LINEAR_OK) s.css = 'cubic-bezier(.22,1,.36,1)';
if (LINEAR_OK) for (const [k, s] of Object.entries(GX.spring)) GX.host.style.setProperty(`--spring-${k}`, s.css);
GX.eco = () => GX.host.dataset.effects === 'eco';
/* Anime avec un ressort ; en mode économe, raccourcit tout */
GX.animate = (el, kf, { spring = 'snappy', duration, delay = 0, fill = 'none', easing } = {}) => {
  const s = GX.spring[spring] || GX.spring.snappy;
  const d = GX.eco() ? Math.min(duration || s.ms, 180) : duration || s.ms;
  return el.animate(kf, { duration: d, delay, fill, easing: easing || s.css });
};
/* FLIP : on anime l'écart entre l'ancienne et la nouvelle boîte, jamais la mise en page */
GX.flip = (el, first, opts = {}) => {
  const last = el.getBoundingClientRect();
  if (!first || !last.width) return;
  const dx = first.left - last.left, dy = first.top - last.top, sx = first.width / last.width, sy = first.height / last.height;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < .01 && Math.abs(sy - 1) < .01) return;
  const o = el.style.transformOrigin; el.style.transformOrigin = '0 0';
  const a = GX.animate(el, [{ transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})` }, { transform: 'none' }], opts);
  a.onfinish = () => { el.style.transformOrigin = o; };
  return a;
};

/* ---------- Icônes (trait, famille lucide) ---------- */
const I = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  projects: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 13h8M8 16h5"/>',
  todo: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
  forms: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  digital: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  campaigns: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/>',
  material: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  budget: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H5"/><circle cx="16" cy="14" r="1.2"/>',
  fixed: '<path d="M17 6.5A7 7 0 1 0 17 17.5"/><path d="M4 10h9M4 14h9"/>',
  export: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  conges: '<path d="M12 21v-8"/><path d="M12 13c-4 0-7-2-8-5 3-1 6 0 8 2 2-2 5-3 8-2-1 3-4 5-8 5z"/><path d="M12 10c0-3 1-5 3-7"/>',
  hello: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  games: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3M15.5 12h.01M18 14h.01"/>',
  archives: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  launchpad: '<rect x="3" y="3" width="5" height="5" rx="1.2"/><rect x="9.5" y="3" width="5" height="5" rx="1.2"/><rect x="16" y="3" width="5" height="5" rx="1.2"/><rect x="3" y="9.5" width="5" height="5" rx="1.2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.2"/><rect x="16" y="9.5" width="5" height="5" rx="1.2"/><rect x="3" y="16" width="5" height="5" rx="1.2"/><rect x="9.5" y="16" width="5" height="5" rx="1.2"/><rect x="16" y="16" width="5" height="5" rx="1.2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  belloff: '<path d="M8.7 3A6 6 0 0 1 18 8a21 21 0 0 0 .6 5M17 17H3s3-2 3-9a4.7 4.7 0 0 1 .3-1.7M10.3 21a1.9 1.9 0 0 0 3.4 0M2 2l20 20"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-6 7-10 16-10 0 9-4 16-10 16"/><path d="M2 22c3-6 6-9 10-11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="m5 12 5 5 9-10"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>', chevleft: '<path d="m15 6-6 6 6 6"/>', chevright: '<path d="m9 6 6 6-6 6"/>', chevdown: '<path d="m6 9 6 6 6-6"/>', back: '<path d="m15 6-6 6 6 6"/>', chevup: '<path d="m6 15 6-6 6 6"/>',
  arrowr: '<path d="M5 12h14M13 6l6 6-6 6"/>', arrowup: '<path d="M12 19V5M6 11l6-6 6 6"/>', arrowdown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  filter: '<path d="M4 5h16l-6 8v5l-4 2v-7z"/>', sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  kanban: '<rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="12" rx="1.5"/><rect x="17" y="3" width="4" height="8" rx="1.5"/>',
  gantt: '<path d="M3 5h8M7 10h10M5 15h7M12 20h9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M18 13a6 6 0 0 1 4 7"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10 5-3v10l-5-3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  send: '<path d="m4 12 16-8-6 16-2-7z"/>', paperclip: '<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  message: '<path d="M4 5h16v11H8l-4 4z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3 7 9 6 9-6"/>',
  sms: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  power: '<path d="M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  snap: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M12 12h9"/>',
  maximize: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
  car: '<path d="M5 17h14M3 13l2-6h14l2 6v5h-3M6 18H3v-5"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
  truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  euro: '<path d="M17 6.5A7 7 0 1 0 17 17.5M4 10h9M4 14h9"/>', percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  trending: '<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>', barchart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pie: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.3A9 9 0 0 1 20.7 9H15z"/>',
  refresh: '<path d="M20 11A8 8 0 0 0 5.3 7M4 4v4h4M4 13a8 8 0 0 0 14.7 4M20 20v-4h-4"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
  battery: '<rect x="2" y="7" width="18" height="10" rx="2.5"/><path d="M22 11v2M5 10h9v4H5z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z"/>',
  cloudsun: '<path d="M12 3v1M5.6 5.6l.7.7M3 12h1M18.4 5.6l-.7.7"/><path d="M8.5 10a3.5 3.5 0 0 1 6.6-1.7"/><path d="M8 20a4 4 0 1 1 .9-7.9A5 5 0 0 1 18.5 14 3 3 0 0 1 18 20z"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  play: '<path d="M7 4v16l13-8z"/>', pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>',
  rss: '<path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14"/><circle cx="6" cy="18" r="1.3"/>',
  croissant: '<path d="M4 15c2-6 6-9 8-9s6 3 8 9c-3-1-5-1-8-1s-5 0-8 1z"/><path d="M8 9.5 10 14M16 9.5 14 14"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  handshake: '<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2M14 14l2.5 2.5a1.4 1.4 0 0 0 2-2l-3.8-3.8a2 2 0 0 0-2.8 0l-.9.9a1.4 1.4 0 0 1-2-2l2.8-2.8a4 4 0 0 1 4.9-.6l.5.3a4 4 0 0 0 2.2.6H21M3 10h3l4.2 4.2a1.4 1.4 0 0 1-2 2L7 15M21 16h-3"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  wallpaper: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m3 16 5-5 4 4 3-3 6 6"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/>',
  desktop: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  spaces: '<rect x="2" y="6" width="9" height="12" rx="1.5"/><rect x="13" y="6" width="9" height="12" rx="1.5"/>',
  expose: '<rect x="3" y="3" width="8" height="6" rx="1.2"/><rect x="13" y="3" width="8" height="6" rx="1.2"/><rect x="3" y="12" width="8" height="6" rx="1.2"/><rect x="13" y="12" width="8" height="6" rx="1.2"/><path d="M8 21h8"/>',
  quicklook: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/>',
  pinned: '<path d="M9 4h6l-1 6 4 3v2h-5v5l-1 1-1-1v-5H6v-2l4-3z"/>',
  swap: '<path d="M4 7h14l-3-3M20 17H6l3 3"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  facebook: '<path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V9H6v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h2z"/>',
  linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7h.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/>',
  tiktok: '<path d="M14 3v11a4 4 0 1 1-4-4M14 3c.5 3 2.5 5 6 5"/>',
  youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>',
  gmb: '<path d="M3 9 5 4h14l2 5M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v7h14v-7"/>',
};
GX.icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n] || I.grid}</svg>`;

/* ---------- Formats ---------- */
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
GX.fmt = {
  eur: (n) => nf.format(Math.round(n)) + ' €',
  eurK: (n) => (Math.abs(n) >= 1000 ? (n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k€' : nf.format(n) + ' €'),
  n: (n) => nf.format(n),
  pct: (n) => Math.round(n) + ' %',
  date: (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
  dateY: (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
  dateLong: (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
  day: (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
  time: (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  rel: (d) => {
    const days = Math.round((new Date(new Date(d).toDateString()) - new Date(new Date().toDateString())) / 864e5);
    if (days === 0) return "aujourd'hui"; if (days === 1) return 'demain'; if (days === -1) return 'hier';
    return days > 0 ? `dans ${days} j` : `il y a ${-days} j`;
  },
  ago: (d) => {
    const m = Math.round((Date.now() - new Date(d)) / 6e4);
    if (m < 1) return "à l'instant"; if (m < 60) return `il y a ${m} min`; const h = Math.round(m / 60);
    if (h < 24) return `il y a ${h} h`; return GX.fmt.date(d);
  },
};
GX.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
GX.iso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
GX.addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
GX.today = () => new Date(new Date().toDateString());
GX.uid = (p = 'id') => p + Math.random().toString(36).slice(2, 8);

/* ---------- Stockage sûr (peut être vide ou refusé) ---------- */
/* [GEARBOX] Clés préfixées par l'id du compte (un bureau par personne sur un poste partagé). */
GX.store = {
  get(k, d = null) { try { const v = localStorage.getItem('gxos.' + (GX.ctx.uid || '_') + '.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('gxos.' + (GX.ctx.uid || '_') + '.' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('gxos.' + (GX.ctx.uid || '_') + '.' + k); } catch (e) {} },
  sget(k) { try { return sessionStorage.getItem('gxos.' + k); } catch (e) { return null; } },
  sset(k, v) { try { sessionStorage.setItem('gxos.' + k, v); } catch (e) {} },
};

/* ---------- Bus d'événements ---------- */
const bus = new EventTarget();
GX.on = (t, fn) => { const h = (e) => fn(e.detail); bus.addEventListener(t, h); return () => bus.removeEventListener(t, h); };
GX.emit = (t, d) => bus.dispatchEvent(new CustomEvent(t, { detail: d }));

/* ---------- Injection de CSS par app (scopé par préfixe) ---------- */
/* [GEARBOX] Le CSS de la maquette est DÉJÀ extrait (ui2/os/maquette.css, injecté dans la racine fantôme) :
   GX.css ne fait plus rien — l injecter dans document.head toucherait l ancienne interface. */
GX.css = () => {};

/* ---------- Registre des apps ----------
   GX.registerApp({ id, name, icon, tint:[c1,c2], size:[w,h], minSize:[w,h],
     hidden, parent, roles, badge(), menus(win), mount(body, win) → { destroy?, command? } }) */
GX.registerApp = (def) => { GX.apps.set(def.id, { size: [880, 580], minSize: [420, 320], ...def }); };
GX.app = (id) => GX.apps.get(id);
GX.appIcon = (a, s = 48) => {
  a = typeof a === 'string' ? GX.app(a) : a;
  return `<span class="app-ico" style="--s:${s}px;--c1:${a.tint[0]};--c2:${a.tint[1]}">${GX.icon(a.icon || a.id)}</span>`;
};

/* ---------- Primitives d'interface ---------- */
GX.ui = {};
/* Segmented control + onglets : le curseur glisse en ressort, sans rien à brancher */
function placeThumb(seg, animate = true) {
  const b = seg.querySelector(':scope > button[aria-pressed="true"]'), t = seg.querySelector(':scope > .thumb');
  if (!b || !t) return; if (!animate) t.style.transition = 'none';
  t.style.width = b.offsetWidth + 'px'; t.style.transform = `translateX(${b.offsetLeft}px)`;
  if (!animate) requestAnimationFrame(() => (t.style.transition = ''));
}
function placeInk(tabs, animate = true) {
  const b = tabs.querySelector(':scope > button[aria-selected="true"]'), t = tabs.querySelector(':scope > .ink');
  if (!b || !t) return; if (!animate) t.style.transition = 'none';
  t.style.width = b.offsetWidth - 16 + 'px'; t.style.transform = `translateX(${b.offsetLeft + 8}px)`;
  if (!animate) requestAnimationFrame(() => (t.style.transition = ''));
}
GX.ui.refresh = (root = GX.root) => { /* [GEARBOX] la racine fantôme, pas la page */
  root.querySelectorAll('.seg').forEach((s) => { if (!s.querySelector(':scope > .thumb')) s.insertAdjacentHTML('afterbegin', '<span class="thumb"></span>'); placeThumb(s, false); });
  root.querySelectorAll('.tabs').forEach((t) => { if (!t.querySelector(':scope > .ink')) t.insertAdjacentHTML('beforeend', '<span class="ink"></span>'); placeInk(t, false); });
};
GX.win(document, 'click', (e) => {
  const sb = e.target.closest('.seg > button');
  if (sb) { sb.parentElement.querySelectorAll(':scope > button').forEach((x) => x.setAttribute('aria-pressed', x === sb)); placeThumb(sb.parentElement); sb.parentElement.dispatchEvent(new CustomEvent('change', { detail: sb.dataset.v ?? sb.textContent.trim(), bubbles: true })); }
  const tb = e.target.closest('.tabs > button');
  if (tb) { tb.parentElement.querySelectorAll(':scope > button').forEach((x) => x.setAttribute('aria-selected', x === tb)); placeInk(tb.parentElement); tb.parentElement.dispatchEvent(new CustomEvent('change', { detail: tb.dataset.v ?? tb.textContent.trim(), bubbles: true })); }
  const ch = e.target.closest('.chip[data-toggle]');
  if (ch) ch.setAttribute('aria-pressed', ch.getAttribute('aria-pressed') !== 'true');
});
new MutationObserver((ms) => {
  for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.('.seg,.tabs') || n.querySelector?.('.seg,.tabs'))) { requestAnimationFrame(() => GX.ui.refresh(n.parentElement || n)); return; }
}).observe(GX.root, { childList: true, subtree: true }); /* [GEARBOX] les .seg/.tabs naissent dans la racine fantôme */
GX.win(window, 'resize', () => GX.ui.refresh());

/* Menus contextuels et déroulants : un seul composant pour toute l'app */
let openMenu = null;
/* [GEARBOX] Bascule du menu sur son déclencheur : l'appui (pointerdown) EXTÉRIEUR ferme le menu, puis le
   clic qui suit sur le même bouton le rouvrait — un menu ne se refermait jamais par son bouton (recette
   30/09). On retient le déclencheur fermé par cet appui, et le clic qui suit ne rouvre pas. */
let closedByPress = null;
GX.menu = {
  /* items : [{label, icon, kbd, action, checked, disabled, sub}] | '-' | {header} */
  open(items, at, { align = 'left', onClose } = {}) {
    if (at instanceof Element && closedByPress && closedByPress.at === at && performance.now() - closedByPress.t < 600) { closedByPress = null; return null; }
    GX.menu.close();
    const m = document.createElement('div'); m.className = 'menu glass glass-strong';
    m.innerHTML = items.map((it, i) => it === '-' ? '<div class="sep"></div>' : it.header ? `<div class="mh">${GX.esc(it.header)}</div>` :
      `<div class="mi ${it.disabled ? 'dis' : ''}" data-i="${i}"><span class="ck">${it.checked ? GX.icon('check', 'sm') : it.icon ? GX.icon(it.icon, 'sm') : ''}</span>${GX.esc(it.label)}${it.kbd ? `<span class="k">${it.kbd}</span>` : ''}</div>`).join('');
    GX.body.append(m);
    let x, y;
    if (at instanceof Element) { const r = at.getBoundingClientRect(); x = align === 'right' ? r.right - m.offsetWidth : r.left; y = r.bottom + 4; }
    else { x = at.x; y = at.y; }
    x = Math.max(6, Math.min(x, innerWidth - m.offsetWidth - 6)); y = Math.max(6, Math.min(y, innerHeight - m.offsetHeight - 6));
    Object.assign(m.style, { left: x + 'px', top: y + 'px' });
    let kb = -1; const mis = [...m.querySelectorAll('.mi:not(.dis)')];
    const key = (e) => {
      if (e.key === 'Escape') { GX.menu.close(); e.stopPropagation(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { kb = (kb + (e.key === 'ArrowDown' ? 1 : -1) + mis.length) % mis.length; mis.forEach((x, j) => x.classList.toggle('kbfocus', j === kb)); e.preventDefault(); }
      if (e.key === 'Enter' && kb >= 0) mis[kb].click();
    };
    m.addEventListener('click', (e) => { const mi = e.target.closest('.mi'); if (!mi) return; const it = items[+mi.dataset.i]; GX.menu.close(); it.action && it.action(); });
    const away = (e) => { if (m.contains(e.target)) return; if (at instanceof Element && at.contains(e.target)) closedByPress = { at, t: performance.now() }; GX.menu.close(); };
    setTimeout(() => { if (openMenu?.m !== m) return; /* [GEARBOX] déjà refermé avant ce tic : sinon écouteurs orphelins (Échap avalé pour toujours) — défaut de la maquette */ GX.win(window, 'pointerdown', away, true); GX.win(window, 'keydown', key, true); });
    openMenu = { m, cleanup: () => { GX.unwin(window, 'pointerdown', away, true); GX.unwin(window, 'keydown', key, true); onClose && onClose(); } };
    return m;
  },
  close() { if (!openMenu) return; const { m, cleanup } = openMenu; openMenu = null; cleanup(); m.style.pointerEvents = 'none'; m.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90 }).onfinish = () => m.remove(); setTimeout(() => m.remove(), 220); },
  isOpen: () => !!openMenu,
};

/* Info-bulles : [data-tip="…"] partout, sans rien brancher */
let tipEl = null, tipTimer = null;
GX.win(document, 'pointerover', (e) => {
  const t = e.target.closest('[data-tip]'); clearTimeout(tipTimer);
  if (!t) { tipEl && tipEl.remove(); tipEl = null; return; }
  tipTimer = setTimeout(() => {
    tipEl && tipEl.remove(); tipEl = document.createElement('div'); tipEl.className = 'tip-bubble glass glass-strong'; tipEl.textContent = t.dataset.tip; GX.body.append(tipEl);
    const r = t.getBoundingClientRect(); let x = r.left + r.width / 2 - tipEl.offsetWidth / 2, y = r.bottom + 6;
    if (y + tipEl.offsetHeight > innerHeight - 4) y = r.top - tipEl.offsetHeight - 6;
    Object.assign(tipEl.style, { left: Math.max(4, Math.min(x, innerWidth - tipEl.offsetWidth - 4)) + 'px', top: y + 'px' });
  }, 450);
});
GX.win(document, 'pointerdown', () => { clearTimeout(tipTimer); tipEl && tipEl.remove(); tipEl = null; }, true);

/* Feuille (sheet) dans un conteneur : glisse depuis le haut, garde le contexte */
GX.ui.sheet = (host, html, { onClose, width } = {}) => {
  const veil = document.createElement('div'); veil.className = 'sheet-veil';
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.innerHTML = html; if (width) sh.style.width = `min(${width}px, calc(100% - 32px))`;
  host.append(veil, sh); requestAnimationFrame(() => { veil.classList.add('on'); sh.classList.add('on'); sh.querySelector('input,textarea,select')?.focus(); });
  const close = (val) => { veil.classList.remove('on'); sh.classList.remove('on'); setTimeout(() => { veil.remove(); sh.remove(); }, 380); onClose && onClose(val); };
  veil.onclick = () => close();
  sh.addEventListener('click', (e) => { const b = e.target.closest('[data-sheet]'); if (b) close(b.dataset.sheet); });
  sh.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  return { el: sh, close };
};

/* Pile de navigation (liste → détail) pour les mises en page compactes :
   fenêtre étroite ou téléphone. Glisser depuis le bord gauche = retour. */
GX.ui.stack = (host) => {
  host.classList.add('stack'); host.innerHTML = '';
  const pages = [];
  const make = (title, html, back) => {
    const p = document.createElement('div'); p.className = 'page';
    p.innerHTML = `<div class="stack-head">${back ? `<button class="back">${GX.icon('back', 'lg')}${GX.esc(back)}</button>` : ''}<span class="t ellipsis">${GX.esc(title || '')}</span></div><div class="scroll" style="flex:1;min-height:0"></div>`;
    const body = p.lastElementChild; if (typeof html === 'string') body.innerHTML = html; else if (html) body.append(html);
    p.querySelector('.back')?.addEventListener('click', () => api.pop());
    return p;
  };
  const api = {
    push(title, html, { noHead = false } = {}) {
      const prev = pages[pages.length - 1];
      const p = make(title, html, prev ? prev.dataset.title : null); p.dataset.title = title || '';
      if (noHead && !prev) p.firstElementChild.remove();
      host.append(p); pages.push(p);
      if (prev) {
        GX.animate(p, [{ transform: 'translateX(100%)' }, { transform: 'none' }], { spring: 'snappy' });
        GX.animate(prev, [{ transform: 'none', filter: 'brightness(1)' }, { transform: 'translateX(-28%)', filter: 'brightness(.7)' }], { spring: 'snappy', fill: 'forwards' });
        edgeSwipe(p);
      }
      return p.lastElementChild;
    },
    pop() {
      if (pages.length < 2) return;
      const p = pages.pop(), prev = pages[pages.length - 1];
      prev.getAnimations().forEach((a) => a.cancel());
      GX.animate(prev, [{ transform: 'translateX(-28%)', filter: 'brightness(.7)' }, { transform: 'none', filter: 'brightness(1)' }], { spring: 'snappy' });
      GX.animate(p, [{ transform: getComputedStyle(p).transform === 'none' ? 'none' : getComputedStyle(p).transform }, { transform: 'translateX(100%)' }], { spring: 'snappy', fill: 'forwards' }).onfinish = () => p.remove();
    },
    depth: () => pages.length, top: () => pages[pages.length - 1]?.lastElementChild,
  };
  function edgeSwipe(p) {
    p.addEventListener('pointerdown', (e) => {
      const r = p.getBoundingClientRect(); if (e.clientX - r.left > 24 || e.pointerType === 'mouse') return;
      const sx = e.clientX; let dx = 0; p.setPointerCapture(e.pointerId);
      const prev = pages[pages.length - 2];
      const mv = (ev) => { dx = Math.max(0, ev.clientX - sx); p.style.transform = `translateX(${dx}px)`; };
      const up = () => { p.removeEventListener('pointermove', mv); if (dx > r.width * .33) api.pop(); else { GX.animate(p, [{ transform: `translateX(${dx}px)` }, { transform: 'none' }]); p.style.transform = ''; } };
      p.addEventListener('pointermove', mv); p.addEventListener('pointerup', up, { once: true });
    });
  }
  return api;
};

/* Observe la largeur d'un conteneur : compact (< seuil) ou large */
GX.ui.watchWidth = (el, threshold, fn) => {
  let last = null;
  const ro = new ResizeObserver(([e]) => { const c = e.contentRect.width < threshold; if (c !== last) { last = c; fn(c); } });
  ro.observe(el); return () => ro.disconnect();
};

/* Styles partagés des icônes d'app */
GX.css(`
.app-ico{width:var(--s);height:var(--s);border-radius:calc(var(--s)*.24);display:grid;place-items:center;color:#fff;flex:none;position:relative;
  background:linear-gradient(160deg,var(--c1),var(--c2));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 -1px 1px rgba(0,0,0,.18),0 3px 8px -3px rgba(0,0,0,.45)}
.app-ico::after{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(180deg,rgba(255,255,255,.22),transparent 48%);pointer-events:none}
.app-ico svg.i{width:calc(var(--s)*.5);height:calc(var(--s)*.5);stroke-width:1.9;position:relative;z-index:1}
`);

}
