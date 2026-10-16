// @ts-nocheck — rendu repris tel quel du prototype validé (maquettes/jeux/minigolf.html), en JavaScript.
// =====================================================================================
// MINIGOLF — rendu à l'écran (canvas) : ambiances, décors animés, sons, particules, visée en fronde.
// Le moteur et les trous viennent de shared/minigolf.ts (le même code que le serveur). Ici, on ne fait que
// DESSINER : chaque coup est validé et calculé par le serveur ; on le rejoue pour l'animation, puis on
// recale les balles sur le plateau renvoyé (backend/src/games/minigolfRules.ts).
// Pilotage : monter(canvas, io) / maj(plateau, contexte) / demonter().
// =====================================================================================
/* eslint-disable */
import { LOGO_CGT_SRC, SLOGANS, PANCARTES } from '../cgt';
import { DT, PAS_IMAGE, R, R_TROU, TROU_PAR_ID, couloir, dansPoly, plusProche, simuler, spline, arcPts, sub, len, relief, preparer, segmentsMobiles } from '../../../../shared/minigolf';
/* =====================================================================================
   AMBIANCES — rendu seulement, la physique est identique. Choisie par celui qui lance, la même pour tous.
   ===================================================================================== */
const AMB = {
  ete: { l: 'Parc en été', sol: '#5e8b3c', gazon: ['#3f9a49', '#4aa854'], frange: '#2f7a39', rail: 'bois', railC: ['#c48a4c', '#6f4521', '#e8b77f'],
    sable: ['#e9d49c', '#cfb574', '#fbedc4'], eau: ['#1f6fa8', '#4aa6d8', '#bfe7f5'], glace: ['#dff3fa', '#9fd2e6'], drapeau: '#d9472b',
    toit: ['#b5482f', '#7e2c1a'], maison: '#efe2c6', bumper: ['#f4f1ea', '#d6402f'], tapis: ['#3b3f45', '#5a6068'], tourniquet: ['#e6dcc6', '#c9772f'], pont: ['#b88a56', '#7d5932'] },
  mer: { l: 'Bord de mer', sol: '#e3cfa4', gazon: ['#2c9f7c', '#35ad89'], frange: '#1f7d61', rail: 'peint', railC: ['#f6f3ea', '#2c5a85', '#ffffff'],
    sable: ['#f2e1b5', '#d8c18c', '#fff5d9'], eau: ['#0f8fa8', '#33c3d3', '#dffbfd'], glace: ['#e8fafc', '#a9e3ea'], drapeau: '#f2b632',
    toit: ['#2c5a85', '#1b3a58'], maison: '#f8f6ef', bumper: ['#ffffff', '#2c5a85'], tapis: ['#2c5a85', '#3d74a8'], tourniquet: ['#f6f3ea', '#ef6f5e'], pont: ['#c9a777', '#8f6b40'] },
  nuit: { l: 'Nocturne UV', sol: '#0a0718', gazon: ['#1b1747', '#211c57'], frange: '#120f33', rail: 'neon', railC: ['#ff3cac', '#5b0d3d', '#ffc2e6'],
    sable: ['#d9f24a', '#a2b91f', '#f2ff9e'], eau: ['#1238c9', '#2f7bff', '#7ef9ff'], glace: ['#7ef9ff', '#1aa6d8'], drapeau: '#b6ff3a',
    toit: ['#3ae0ff', '#0b5a78'], maison: '#140f36', bumper: ['#3ae0ff', '#ff3cac'], tapis: ['#140f36', '#3ae0ff'], tourniquet: ['#140f36', '#b6ff3a'], pont: ['#2a2360', '#ff3cac'], neon: true },
  manif: { l: 'Grève CGT', sol: '#4a4c51', gazon: ['#44a04b', '#4fae55'], frange: '#33803a', rail: 'vauban', railC: ['#c7ccd3', '#5c636d', '#eef1f5'],
    sable: ['#d9b26a', '#b58b43', '#f0d39b'], eau: ['#4f6a78', '#7a95a2', '#c9d8de'], glace: ['#dfe9ef', '#a8bccb'], drapeau: '#e3001b',
    toit: ['#e3001b', '#8f0010'], maison: '#f1ece2', bumper: ['#ffffff', '#e3001b'], tapis: ['#2b2d31', '#e3001b'], tourniquet: ['#f1ece2', '#e3001b'], pont: ['#8a8f96', '#5c636d'],
    annonces: { 'Trou en un !': 'Grève générale !', Eagle: 'Victoire sociale', Birdie: 'Acquis social', Par: 'Statu quo', Bogey: 'Recul', 'Double bogey': 'Casse sociale', Plouf: 'Dans la flaque', 'Balle ramassée': 'Évacuée' } },
};

/* =====================================================================================
   SON — synthétisé (aucun fichier). Coupé par défaut, bouton ♪.
   ===================================================================================== */
let ctxSon = null, son = false;
const audio = () => (ctxSon = ctxSon || new (window.AudioContext || window.webkitAudioContext)());
function bruit(dur, filtre, vol, freq, q = 1) {
  if (!son) return; try {
    const c = audio(), n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = filtre; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = vol; s.connect(f).connect(g).connect(c.destination); s.start();
  } catch (e) { /* son indisponible */ }
}
function ton(f0, f1, dur, vol, type = 'sine', delai = 0) {
  if (!son) return; try {
    const c = audio(), o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + delai;
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) { /* son indisponible */ }
}
const SONS = {
  frappe: (f) => { bruit(0.05, 'bandpass', 0.5 * f + 0.2, 2800, 2); ton(1100, 600, 0.05, 0.08, 'triangle'); },
  mur: (f) => { bruit(0.05, 'bandpass', 0.4 * f + 0.05, 900, 3); ton(260, 160, 0.06, 0.06 * f + 0.001, 'triangle'); },
  pierre: (f) => bruit(0.04, 'highpass', 0.35 * f + 0.05, 1800),
  mobile: (f) => { bruit(0.07, 'lowpass', 0.4 * f + 0.1, 700); ton(180, 120, 0.08, 0.06, 'square'); },
  bumper: (f) => { ton(420, 860, 0.14, 0.13 * f + 0.06, 'square'); },
  choc: (f) => { bruit(0.03, 'highpass', 0.5 * f + 0.1, 3500); ton(2400, 1800, 0.04, 0.05); },
  levre: () => { bruit(0.04, 'bandpass', 0.12, 2400, 4); },
  sable: (f) => bruit(0.18, 'lowpass', 0.25 * f + 0.08, 1400),
  tuyau: () => { ton(300, 90, 0.35, 0.12, 'sine'); bruit(0.3, 'lowpass', 0.12, 500); },
  sortie: () => { ton(120, 420, 0.18, 0.1, 'sine'); },
  trou: () => { ton(820, 200, 0.2, 0.18); bruit(0.06, 'bandpass', 0.25, 1600, 3); setTimeout(() => bruit(0.05, 'lowpass', 0.2, 500), 140); },
  eau: () => { bruit(0.5, 'lowpass', 0.55, 1200); ton(340, 80, 0.35, 0.07); },
  bravo: (manif) => {
    if (manif) { ton(220, 225, 0.6, 0.12, 'sawtooth'); ton(277, 280, 0.6, 0.1, 'sawtooth'); ton(3000, 2600, 0.5, 0.05, 'sine', 0.55); bruit(1.2, 'bandpass', 0.15, 800, 0.6); }
    else { [523, 659, 784].forEach((f, i) => ton(f, f, 0.18, 0.08, 'triangle', i * 0.09)); }
  },
};

/* =====================================================================================
   RENDU
   ===================================================================================== */
let cv: any = null, g: any = null;
const vue = { k: 1, ox: 0, oy: 0, dpr: 1 };
let C = null; // calques et décors du trou affiché
function graine(s) { s = s >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const hash = (str) => [...str].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
function chemin(c, pts, ferme = true) { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); if (ferme) c.closePath(); }
function bboxDe(pts) { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; }
function distBord(h, x, y) { let d = 1e9; const b = h.bord; for (let i = 0; i < b.length; i++) { const p = plusProche([x, y], b[i], b[(i + 1) % b.length]); d = Math.min(d, Math.hypot(x - p[0], y - p[1])); } return dansPoly([x, y], b) ? -d : d; }
/** Points répartis le long d'une ligne (poteaux, barreaux). */
function lelong(pts, ferme, pas, fn) {
  let reste = pas / 2;
  for (let i = 0; i < pts.length - (ferme ? 0 : 1); i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    let s = reste;
    while (s < L) { fn([a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L], ang); s += pas; }
    reste = s - L;
  }
}
function toile(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

// ---- textures (motifs répétés, mis en cache par ambiance) ----
const motifs = {};
function motif(cle, taille, dessin) { if (!motifs[cle]) { const c = toile(taille, taille); dessin(c.getContext('2d'), taille); motifs[cle] = c; } return motifs[cle]; }
function textureGazon(a) {
  return motif('gazon' + a.l, 128, (x, s) => {
    const r = graine(7); x.fillStyle = a.gazon[0]; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 2200; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.09)'; x.save(); x.translate(r() * s, r() * s); x.rotate(r() * 3); x.fillRect(0, 0, 0.8, 2.4); x.restore(); }
    if (a.neon) for (let i = 0; i < 40; i++) { x.fillStyle = ['#ff3cac', '#3ae0ff', '#b6ff3a'][i % 3]; x.globalAlpha = 0.5; x.fillRect(r() * s, r() * s, 1.4, 1.4); x.globalAlpha = 1; }
  });
}
function textureSol(a) {
  return motif('sol' + a.l, 256, (x, s) => {
    const r = graine(13); x.fillStyle = a.sol; x.fillRect(0, 0, s, s);
    if (a === AMB.ete) for (let i = 0; i < 5000; i++) { x.fillStyle = ['rgba(0,0,0,.12)', 'rgba(255,255,255,.06)', 'rgba(30,60,10,.18)'][i % 3]; x.save(); x.translate(r() * s, r() * s); x.rotate(r() * 6); x.fillRect(0, 0, 1, 3.5); x.restore(); }
    if (a === AMB.mer) { for (let i = 0; i < 3000; i++) { x.fillStyle = r() < 0.5 ? 'rgba(120,90,40,.16)' : 'rgba(255,255,255,.3)'; x.fillRect(r() * s, r() * s, 1.3, 1.3); } x.strokeStyle = 'rgba(150,115,60,.18)'; x.lineWidth = 1.4; for (let y = 8; y < s; y += 18) { x.beginPath(); for (let X = 0; X <= s; X += 8) x.lineTo(X, y + Math.sin((X + y * 3) / 22) * 3); x.stroke(); } }
    if (a === AMB.nuit) { for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.5})`; const t = r() * 1.6 + 0.3; x.fillRect(r() * s, r() * s, t, t); } x.strokeStyle = 'rgba(90,80,200,.12)'; for (let i = 0; i <= s; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, s); x.moveTo(0, i); x.lineTo(s, i); x.stroke(); } }
    if (a === AMB.manif) for (let i = 0; i < 9000; i++) { const v = r(); x.fillStyle = v < 0.45 ? 'rgba(0,0,0,.18)' : v < 0.9 ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.18)'; x.fillRect(r() * s, r() * s, 1.2, 1.2); }
  });
}
function textureSable(a) {
  return motif('sable' + a.l, 96, (x, s) => {
    const r = graine(3); x.fillStyle = a.sable[0]; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 1600; i++) { x.fillStyle = r() < 0.5 ? a.sable[1] : a.sable[2]; x.globalAlpha = 0.6; x.fillRect(r() * s, r() * s, 1.3, 1.3); } x.globalAlpha = 1;
  });
}

// ---- éléments de décor dessinés une fois en petites images ----
function spriteArbre(a, r, rnd) {
  const c = toile(r * 2.4, r * 2.4), x = c.getContext('2d'), m = r * 1.2;
  if (a === AMB.mer) { // palmier vu de dessus
    x.translate(m, m); const n = 7 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) { const th = i / n * Math.PI * 2 + rnd() * 0.4; x.save(); x.rotate(th);
      x.fillStyle = i % 2 ? '#2f8a3a' : '#3fa04a'; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(r * 0.5, -r * 0.32, r, 0); x.quadraticCurveTo(r * 0.5, r * 0.32, 0, 0); x.fill();
      x.strokeStyle = 'rgba(0,40,0,.4)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, 0); x.lineTo(r * 0.95, 0); x.stroke(); x.restore(); }
    x.fillStyle = '#7a5a2e'; x.beginPath(); x.arc(0, 0, r * 0.12, 0, 7); x.fill(); return c;
  }
  if (a === AMB.nuit) { // champignon fluo
    x.translate(m, m); const col = ['#ff3cac', '#3ae0ff', '#b6ff3a'][Math.floor(rnd() * 3)];
    x.shadowColor = col; x.shadowBlur = r * 0.6; x.fillStyle = col; x.beginPath(); x.arc(0, 0, r * 0.8, 0, 7); x.fill(); x.shadowBlur = 0;
    x.fillStyle = 'rgba(255,255,255,.75)'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc((rnd() - 0.5) * r, (rnd() - 0.5) * r, r * (0.08 + rnd() * 0.1), 0, 7); x.fill(); } return c;
  }
  // feuillu (été, manif : platane de boulevard)
  x.translate(m, m);
  const verts = a === AMB.manif ? ['#4f7a3a', '#5d8c45', '#6d9c52', '#3f6630'] : ['#2f6f2a', '#3c8a35', '#4f9f42', '#26592a'];
  for (let i = 0; i < 9; i++) { const th = rnd() * 6.28, d = rnd() * r * 0.45; x.fillStyle = verts[i % 4]; x.beginPath(); x.arc(Math.cos(th) * d, Math.sin(th) * d, r * (0.45 + rnd() * 0.25), 0, 7); x.fill(); }
  for (let i = 0; i < 30; i++) { const th = rnd() * 6.28, d = rnd() * r * 0.8; x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,220,.12)' : 'rgba(0,30,0,.18)'; x.beginPath(); x.arc(Math.cos(th) * d - r * 0.1, Math.sin(th) * d - r * 0.12, r * 0.13, 0, 7); x.fill(); }
  return c;
}
function rocher(x, cx, cy, r, rnd, a) {
  const pts = Array.from({ length: 9 }, (_, i) => { const th = i / 9 * 6.28, k = 0.75 + rnd() * 0.3; return [cx + Math.cos(th) * r * k, cy + Math.sin(th) * r * k * 0.85]; });
  x.save(); x.fillStyle = 'rgba(0,0,0,.28)'; x.translate(r * 0.18, r * 0.22); chemin(x, pts); x.fill(); x.restore();
  const gr = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  const base = a.neon ? ['#3a3370', '#17123a'] : a === AMB.mer ? ['#c9c0b0', '#7f7668'] : ['#b9b4aa', '#6d6a63'];
  gr.addColorStop(0, base[0]); gr.addColorStop(1, base[1]); x.fillStyle = gr; chemin(x, pts); x.fill();
  x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = Math.max(1, r * 0.06); x.stroke();
  x.fillStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.ellipse(cx - r * 0.25, cy - r * 0.28, r * 0.3, r * 0.16, -0.6, 0, 7); x.fill();
  x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1; x.beginPath(); x.moveTo(cx - r * 0.1, cy - r * 0.2); x.lineTo(cx + r * 0.2, cy + r * 0.25); x.stroke();
}
const LOGO_CGT = new Image(); LOGO_CGT.src = LOGO_CGT_SRC;
LOGO_CGT.onload = () => { C = null; };
function embleme(x, cx, cy, r) { // logo CGT officiel : r = demi-hauteur
  const w = r * 2 * 212 / 270;
  if (LOGO_CGT.complete && LOGO_CGT.naturalWidth) x.drawImage(LOGO_CGT, cx - w / 2, cy - r, w, 2 * r);
  else { x.fillStyle = '#d20012'; x.fillRect(cx - w / 2, cy - r, w, 2 * r); }
}

/** Construit les calques fixes du trou affiché et la liste des éléments animés du décor. */
function preparerScene(h, a) {
  const W = cv.width, H = cv.height, k = vue.k, rnd = graine(hash(h.id + a.l));
  const L = { sol: toile(W, H), haut: toile(W, H), toits: toile(W, H) };
  const vx0 = -vue.ox / k, vy0 = -vue.oy / k, vx1 = (W - vue.ox) / k, vy1 = (H - vue.oy) / k;
  const dyn = [];
  const libre = (x, y, r) => distBord(h, x, y) > r + 18 && !dyn.some((d) => d.r && Math.hypot(d.x - x, d.y - y) < (d.r + r) * 0.8);
  // ---------- sol (fond + décor au sol + parcours) ----------
  let c = L.sol.getContext('2d');
  c.fillStyle = c.createPattern(textureSol(a), 'repeat'); c.fillRect(0, 0, W, H);
  c.save(); c.translate(vue.ox, vue.oy); c.scale(k, k);
  const bb = bboxDe(h.bord);
  if (a === AMB.ete) { // allée gravillonnée et massifs fleuris autour
    const ay = bb.y1 + 60 < vy1 ? bb.y1 + 55 : bb.y0 - 55;
    c.strokeStyle = '#d6c8a8'; c.lineWidth = 58; c.lineCap = 'round'; chemin(c, spline([[vx0 - 50, ay], [(vx0 + vx1) / 2, ay + 25], [vx1 + 50, ay - 10]]), false); c.stroke();
    c.save(); c.globalAlpha = 0.5; for (let i = 0; i < 900; i++) { c.fillStyle = rnd() < 0.5 ? '#a99c7d' : '#f2e9d2'; c.fillRect(vx0 + rnd() * (vx1 - vx0), ay - 28 + rnd() * 70, 1.6, 1.6); } c.restore();
    for (let i = 0; i < 14; i++) { const x = vx0 + rnd() * (vx1 - vx0), y = vy0 + rnd() * (vy1 - vy0); if (distBord(h, x, y) < 40) continue; const col = ['#e84a5f', '#ffd166', '#f5f5f5', '#c77dff'][i % 4]; for (let j = 0; j < 26; j++) { c.fillStyle = j % 3 ? col : '#2d6a2a'; c.beginPath(); c.arc(x + (rnd() - 0.5) * 34, y + (rnd() - 0.5) * 22, 2.2 + rnd() * 1.5, 0, 7); c.fill(); } }
  }
  if (a === AMB.mer) { // serviettes, coquillages, et la mer sur un côté
    const haut = bb.y0 - vy0 > vy1 - bb.y1;
    dyn.push({ type: 'mer', haut, y: haut ? bb.y0 - 40 : bb.y1 + 40 });
    for (let i = 0; i < 6; i++) { const x = vx0 + rnd() * (vx1 - vx0), y = vy0 + rnd() * (vy1 - vy0); if (!libre(x, y, 40)) continue; c.save(); c.translate(x, y); c.rotate(rnd() - 0.5); const col = ['#ef6f5e', '#2c5a85', '#f2b632'][i % 3]; for (let j = 0; j < 5; j++) { c.fillStyle = j % 2 ? '#fff' : col; c.fillRect(-28 + j * 11.2, -16, 11.2, 32); } c.restore(); dyn.push({ x, y, r: 30 }); }
    for (let i = 0; i < 20; i++) { const x = vx0 + rnd() * (vx1 - vx0), y = vy0 + rnd() * (vy1 - vy0); if (distBord(h, x, y) < 20) continue; c.fillStyle = ['#fff4e6', '#f6c6a8', '#e9e0d0'][i % 3]; c.beginPath(); c.ellipse(x, y, 4, 3, rnd() * 3, 0, 7); c.fill(); }
  }
  if (a === AMB.manif) { // chaussée : marquages, passage piéton, plaques d'égout, tracts
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 6; c.setLineDash([46, 34]);
    [bb.y0 - 70, bb.y1 + 70].forEach((y) => { if (y > vy0 && y < vy1) { c.beginPath(); c.moveTo(vx0, y); c.lineTo(vx1, y); c.stroke(); } }); c.setLineDash([]);
    const zx = bb.x1 + 70 < vx1 ? bb.x1 + 40 : bb.x0 - 110;
    c.fillStyle = 'rgba(255,255,255,.8)'; for (let y = vy0; y < vy1; y += 34) c.fillRect(zx, y, 70, 18);
    for (let i = 0; i < 3; i++) { const x = vx0 + rnd() * (vx1 - vx0), y = vy0 + rnd() * (vy1 - vy0); if (!libre(x, y, 24)) continue; c.fillStyle = '#33353a'; c.beginPath(); c.arc(x, y, 18, 0, 7); c.fill(); c.strokeStyle = '#25272b'; c.lineWidth = 2; for (let j = -12; j <= 12; j += 6) { c.beginPath(); c.moveTo(x - 14, y + j); c.lineTo(x + 14, y + j); c.stroke(); } }
    for (let i = 0; i < 40; i++) { const x = vx0 + rnd() * (vx1 - vx0), y = vy0 + rnd() * (vy1 - vy0); if (distBord(h, x, y) < 12) continue; c.save(); c.translate(x, y); c.rotate(rnd() * 6); c.fillStyle = rnd() < 0.7 ? '#f5f1e6' : '#ffd6d6'; c.fillRect(-7, -9, 14, 18); c.fillStyle = '#e3001b'; c.fillRect(-5, -6, 10, 3); c.fillStyle = 'rgba(0,0,0,.35)'; for (let j = 0; j < 4; j++) c.fillRect(-5, -1 + j * 2.4, 10 * (0.5 + rnd() * 0.5), 0.8); c.restore(); }
  }
  // ombre portée du parcours
  c.save(); c.shadowColor = a.neon ? 'rgba(255,60,172,.35)' : 'rgba(0,0,0,.4)'; c.shadowBlur = 22 * k; c.shadowOffsetY = 8 * k; chemin(c, h.bord); c.fillStyle = a.gazon[0]; c.fill(); c.restore();
  // gazon : texture, tonte en damier diagonal, frange plus sombre le long des rails
  c.save(); chemin(c, h.bord); c.clip();
  c.fillStyle = c.createPattern(textureGazon(a), 'repeat'); c.fillRect(bb.x0 - 20, bb.y0 - 20, bb.x1 - bb.x0 + 40, bb.y1 - bb.y0 + 40);
  c.save(); c.globalAlpha = a.neon ? 0.35 : 0.45; c.fillStyle = a.gazon[1]; c.translate((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2); c.rotate(0.35);
  for (let x = -900; x < 900; x += 90) c.fillRect(x, -900, 45, 1800); c.restore();
  c.strokeStyle = a.frange; c.globalAlpha = 0.55; c.lineWidth = 34; chemin(c, h.bord); c.stroke(); c.globalAlpha = 1;
  // zones
  for (const z of h.zones || []) {
    if (z.type === 'sable') {
      c.save(); chemin(c, z.pts); c.fillStyle = a.sable[1]; c.fill(); c.clip();
      c.fillStyle = c.createPattern(textureSable(a), 'repeat'); c.save(); c.translate(3, 4); c.fillRect(bb.x0, bb.y0, bb.x1 - bb.x0, bb.y1 - bb.y0); c.restore();
      const zb = bboxDe(z.pts); c.strokeStyle = 'rgba(120,90,40,.22)'; c.lineWidth = 1.5; // traces de râteau
      for (let r = 8; r < Math.max(zb.x1 - zb.x0, zb.y1 - zb.y0); r += 9) { c.beginPath(); c.ellipse((zb.x0 + zb.x1) / 2 + 8, (zb.y0 + zb.y1) / 2, r, r * 0.7, 0.3, 0, 7); c.stroke(); }
      c.restore(); c.save(); chemin(c, z.pts); c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,.14)'; c.stroke(); c.lineWidth = 2; c.strokeStyle = a.sable[2]; c.globalAlpha = 0.5; c.stroke(); c.restore();
      if (a === AMB.manif) { const zc = bboxDe(z.pts); cone(c, zc.x0 + 6, zc.y0 + 4); cone(c, zc.x1 - 6, zc.y1 - 4); }
    } else if (z.type === 'glace') {
      c.save(); chemin(c, z.pts); c.clip(); const zb = bboxDe(z.pts), gr = c.createLinearGradient(zb.x0, zb.y0, zb.x1, zb.y1); gr.addColorStop(0, a.glace[0]); gr.addColorStop(1, a.glace[1]); c.fillStyle = gr; c.fillRect(zb.x0, zb.y0, zb.x1 - zb.x0, zb.y1 - zb.y0);
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.2; for (let i = 0; i < 60; i++) { const x0 = zb.x0 + rnd() * (zb.x1 - zb.x0), y0 = zb.y0 + rnd() * (zb.y1 - zb.y0); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + 20 + rnd() * 50, y0 + (rnd() - 0.5) * 12); c.stroke(); } c.restore();
    } else if (z.type === 'pente') {
      c.save(); chemin(c, z.pts); c.clip(); const zb = bboxDe(z.pts), ang = Math.atan2(z.ay, z.ax);
      c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 2.5;
      for (let x = zb.x0 + 30; x < zb.x1; x += 64) for (let y = zb.y0 + 30; y < zb.y1; y += 64) { c.save(); c.translate(x, y); c.rotate(ang); c.beginPath(); c.moveTo(-7, -8); c.lineTo(3, 0); c.lineTo(-7, 8); c.stroke(); c.restore(); }
      c.restore();
    } else if (z.type === 'gazon') {
      c.save(); chemin(c, z.pts); c.clip(); c.fillStyle = c.createPattern(textureGazon(a), 'repeat'); c.fillRect(bb.x0, bb.y0, bb.x1 - bb.x0, bb.y1 - bb.y0);
      c.globalAlpha = 0.4; c.fillStyle = a.gazon[1]; c.translate((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2); c.rotate(0.35); for (let x = -900; x < 900; x += 90) c.fillRect(x, -900, 45, 1800); c.restore();
    }
  }
  c.restore(); // fin du clip parcours
  // départ : tapis de départ
  c.save(); c.translate(h.depart[0], h.depart[1]); c.fillStyle = a.neon ? 'rgba(182,255,58,.22)' : 'rgba(0,0,0,.2)'; c.beginPath(); c.roundRect(-17, -17, 34, 34, 5); c.fill();
  c.strokeStyle = a.neon ? '#b6ff3a' : 'rgba(255,255,255,.45)'; c.lineWidth = 1.5; c.stroke(); c.restore();
  // tuyaux : entrée et sortie
  for (const T of h.tuyaux || []) {
    [T.a, T.b].forEach((p, j) => { c.save(); c.translate(p[0], p[1]); c.fillStyle = a.neon ? '#3ae0ff' : '#7d8794'; c.beginPath(); c.arc(0, 0, R_TROU + 7, 0, 7); c.fill();
      c.fillStyle = a.neon ? '#ff3cac' : '#aeb7c2'; c.beginPath(); c.arc(-1, -1, R_TROU + 4, 0, 7); c.fill(); const gr = c.createRadialGradient(-2, -2, 1, 0, 0, R_TROU + 1); gr.addColorStop(0, '#000'); gr.addColorStop(1, '#2b2f36'); c.fillStyle = gr; c.beginPath(); c.arc(0, 0, R_TROU + 1, 0, 7); c.fill();
      if (j) { c.rotate(T.dir); c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.moveTo(R_TROU + 16, 0); c.lineTo(R_TROU + 9, -5); c.lineTo(R_TROU + 9, 5); c.fill(); } c.restore(); });
  }
  // coupe du trou
  c.save(); c.translate(h.trou[0], h.trou[1]);
  c.fillStyle = a.neon ? 'rgba(182,255,58,.14)' : 'rgba(0,0,0,.12)'; c.beginPath(); c.arc(0, 0, R_TROU + 8, 0, 7); c.fill();
  const gt = c.createRadialGradient(-3, -4, 1, 0, 0, R_TROU); gt.addColorStop(0, '#000'); gt.addColorStop(0.7, '#141414'); gt.addColorStop(1, '#3a3a3a');
  c.fillStyle = gt; c.beginPath(); c.arc(0, 0, R_TROU, 0, 7); c.fill();
  c.strokeStyle = a.neon ? a.drapeau : '#f4f4f4'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, R_TROU - 1, Math.PI * 0.15, Math.PI * 1.15); c.stroke();
  c.restore();
  c.restore();
  // ---------- calque du dessus : rails, blocs, rochers, maisons (sans toit) ----------
  c = L.haut.getContext('2d'); c.save(); c.translate(vue.ox, vue.oy); c.scale(k, k);
  dessinerRail(c, a, h.bord, true, 14);
  for (const m of h.murs || []) {
    if (!m.bloc) { dessinerRail(c, a, m.pts, false, 10); continue; }
    if (m.style === 'maison') { c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 10; c.shadowOffsetY = 5; chemin(c, m.pts); c.fillStyle = a.maison; c.fill(); c.restore(); continue; }
    c.save(); if (a.neon) { c.shadowColor = '#3ae0ff'; c.shadowBlur = 14; } else { c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 9; c.shadowOffsetY = 4; }
    chemin(c, m.pts); c.fillStyle = a.neon ? '#140f36' : a.railC[1]; c.fill(); c.restore();
    c.save(); chemin(c, m.pts); c.clip(); c.fillStyle = a.neon ? '#1b154a' : a.railC[0]; c.fill();
    if (!a.neon) { c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1; const mb = bboxDe(m.pts); for (let y = mb.y0 + 8; y < mb.y1; y += 11) { c.beginPath(); c.moveTo(mb.x0, y); c.lineTo(mb.x1, y + 4); c.stroke(); } }
    c.restore(); dessinerRail(c, a, m.pts, true, 6);
  }
  for (const r of h.rocs || []) {
    if (r.style === 'massif') {
      c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 8; c.shadowOffsetY = 4; c.fillStyle = a.neon ? '#140f36' : '#6b4a2e'; c.beginPath(); c.arc(r.x, r.y, r.r, 0, 7); c.fill(); c.restore();
      lelong(arcPts(r.x, r.y, r.r - 2, 0, 6.28, 24), true, 7, (p) => { c.fillStyle = a.neon ? '#3ae0ff' : '#cfc8bb'; c.beginPath(); c.arc(p[0], p[1], 3.4, 0, 7); c.fill(); });
      const fr = graine(hash(h.id + 'f')); for (let i = 0; i < 26; i++) { const th = fr() * 6.28, d = fr() * (r.r - 7); c.fillStyle = i % 4 === 0 ? '#2d6a2a' : ['#e84a5f', '#ffd166', '#ffffff', '#c77dff'][i % 4]; if (a.neon) c.fillStyle = ['#ff3cac', '#b6ff3a', '#3ae0ff', '#fff'][i % 4]; c.beginPath(); c.arc(r.x + Math.cos(th) * d, r.y + Math.sin(th) * d, 2.6, 0, 7); c.fill(); }
    } else rocher(c, r.x, r.y, r.r, graine(hash(h.id) + r.x), a);
  }
  c.restore();
  // ---------- toits (au-dessus des balles) ----------
  c = L.toits.getContext('2d'); c.save(); c.translate(vue.ox, vue.oy); c.scale(k, k);
  for (const t of h.toits || []) { dessinerToit(c, a, t); if (!t.pales) dyn.push({ type: 'cheminee', x: t.c[0] + Math.cos(t.dir) * (t.L + 12) * 0.2 - Math.sin(t.dir) * (t.Lg + 12) * 0.26, y: t.c[1] + Math.sin(t.dir) * (t.L + 12) * 0.2 + Math.cos(t.dir) * (t.Lg + 12) * 0.26 }); }
  c.restore();
  // ---------- éléments animés du décor (hors parcours) ----------
  const essais = Math.round((vx1 - vx0) * (vy1 - vy0) / 9000);
  const place = (n, r0, r1, fn) => { for (let i = 0, ok = 0; i < n * 6 && ok < n; i++) { const r = r0 + rnd() * (r1 - r0), x = vx0 + rnd() * (vx1 - vx0), y = vy0 + rnd() * (vy1 - vy0); if (!libre(x, y, r)) continue; ok++; fn(x, y, r); } };
  place(Math.min(16, Math.max(5, essais / 3)), a === AMB.nuit ? 10 : 26, a === AMB.nuit ? 22 : 48, (x, y, r) => {
    if (a === AMB.manif && rnd() < 0.55) return; dyn.push({ type: 'arbre', x, y, r, sprite: spriteArbre(a, r * k, rnd), ph: rnd() * 6 });
  });
  if (a === AMB.ete) { place(Math.min(8, essais / 5), 10, 18, (x, y, r) => { rocher(L.sol.getContext('2d'), vue.ox + x * k, vue.oy + y * k, r * k, rnd, a); dyn.push({ x, y, r }); }); for (let i = 0; i < 3; i++) dyn.push({ type: 'papillon', x: vx0 + rnd() * (vx1 - vx0), y: vy0 + rnd() * (vy1 - vy0), ph: rnd() * 6, c: ['#ffd166', '#ffffff', '#ff8fab'][i] }); }
  if (a === AMB.mer) for (let i = 0; i < 2; i++) dyn.push({ type: 'mouette', ph: rnd() * 40, y: vy0 + rnd() * (vy1 - vy0), v: 40 + rnd() * 30 });
  if (a === AMB.nuit) { for (let i = 0; i < 40; i++) dyn.push({ type: 'luciole', x: vx0 + rnd() * (vx1 - vx0), y: vy0 + rnd() * (vy1 - vy0), ph: rnd() * 6, c: ['#ff3cac', '#3ae0ff', '#b6ff3a'][i % 3] }); place(4, 10, 10, (x, y) => dyn.push({ type: 'lampe', x, y, ph: rnd() * 6, c: ['#ff3cac', '#3ae0ff'][Math.floor(rnd() * 2)], r: 14 })); }
  if (a === AMB.manif) {
    let sl = Math.floor(rnd() * SLOGANS.length);
    // banderoles : il faut la place pour toute leur longueur (les deux bouts et le milieu hors du parcours)
    for (let i = 0, ok = 0; i < 300 && ok < Math.max(3, Math.round(essais / 7)); i++) {
      const x = vx0 + 140 + rnd() * (vx1 - vx0 - 280), y = vy0 + 30 + rnd() * (vy1 - vy0 - 60);
      if (![-130, -65, 0, 65, 130].every((dx) => libre(x + dx, y, 22))) continue;
      ok++; dyn.push({ type: 'banderole', x, y, w: 270, txt: SLOGANS[sl++ % SLOGANS.length], ph: rnd() * 6, r: 40 });
      [-130, -65, 65, 130].forEach((dx) => dyn.push({ x: x + dx, y, r: 30 }));
    }
    place(1, 50, 50, (x, y) => dyn.push({ type: 'stand', x, y, ph: rnd() * 6, r: 60 }));
    place(Math.max(3, Math.round(essais / 9)), 20, 20, (x, y) => dyn.push({ type: 'brasero', x, y, ph: rnd() * 6, r: 30 }));
    place(Math.max(5, Math.round(essais / 6)), 12, 12, (x, y) => dyn.push({ type: 'ballon', x, y, ph: rnd() * 6, r: 18 }));
    // la foule : quelques cortèges de 6 à 10 personnes (au plus ~45 manifestants)
    const PEAUX = ['#f1c7a5', '#e0ac85', '#c68b62', '#8d5a3b', '#5c3a26'], VESTES = ['#2d3a4f', '#3b3f45', '#6b2737', '#2f5d50', '#7a6a55', '#1f2933', '#8b8f94'];
    let nb = 0;
    place(Math.min(6, Math.max(3, Math.round(essais / 12))), 40, 40, (gx, gy) => {
      const n = 6 + Math.floor(rnd() * 5);
      for (let k = 0; k < n && nb < 45; k++) {
        const px = gx + (rnd() - 0.5) * 70, py = gy + (rnd() - 0.5) * 40;
        if (distBord(h, px, py) < 22) continue;
        const v = rnd(); nb++;
        dyn.push({ type: 'manif', x: px, y: py, ph: rnd() * 6, peau: PEAUX[Math.floor(rnd() * PEAUX.length)], veste: rnd() < 0.4 ? 'chasuble' : VESTES[Math.floor(rnd() * VESTES.length)],
          porte: v < 0.18 ? 'drapeau' : v < 0.3 ? 'pancarte' : null, txt: PANCARTES[Math.floor(rnd() * PANCARTES.length)], ang: (rnd() - 0.5) * 0.6 - Math.PI / 2, cheveux: rnd() < 0.5 ? '#2b1d14' : rnd() < 0.5 ? '#6b4a2e' : '#c9a36b' });
      }
    });
    dyn.sort((a, b) => (a.type === 'manif') - (b.type === 'manif') || a.y - b.y);
    place(6, 8, 8, (x, y) => { cone(L.sol.getContext('2d'), x, y, true); dyn.push({ x, y, r: 10 }); });
  }
  C = { h, a, L, dyn, vx0, vy0, vx1, vy1 };
}
function cone(c, x, y, monde) {
  c.save(); if (monde) { c.translate(vue.ox + x * vue.k, vue.oy + y * vue.k); c.scale(vue.k, vue.k); } else c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.arc(2, 3, 9, 0, 7); c.fill();
  c.fillStyle = '#ff6a00'; c.beginPath(); c.arc(0, 0, 9, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 6, 0, 7); c.fill(); c.fillStyle = '#ff6a00'; c.beginPath(); c.arc(0, 0, 3.4, 0, 7); c.fill();
  c.restore();
}
function dessinerRail(c, a, pts, ferme, ep) {
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  if (a.rail === 'neon') {
    c.shadowColor = a.railC[0]; c.shadowBlur = 16; chemin(c, pts, ferme); c.lineWidth = ep; c.strokeStyle = a.railC[1]; c.stroke();
    c.lineWidth = ep * 0.45; c.strokeStyle = a.railC[0]; c.stroke(); c.shadowBlur = 0; c.lineWidth = 1.5; c.strokeStyle = a.railC[2]; c.stroke(); c.restore(); return;
  }
  c.save(); c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 7; c.shadowOffsetY = 3; chemin(c, pts, ferme); c.lineWidth = ep + 3; c.strokeStyle = a.railC[1]; c.stroke(); c.restore();
  chemin(c, pts, ferme); c.lineWidth = ep; c.strokeStyle = a.railC[0]; c.stroke();
  if (a.rail === 'bois') { c.lineWidth = 0.8; c.strokeStyle = 'rgba(80,40,10,.35)'; c.setLineDash([18, 7, 4, 9]); c.stroke(); c.setLineDash([]);
    c.save(); c.translate(-0.8, -1.4); chemin(c, pts, ferme); c.lineWidth = Math.max(1.5, ep * 0.2); c.strokeStyle = a.railC[2]; c.globalAlpha = 0.65; c.stroke(); c.restore();
    lelong(pts, ferme, 130, (p) => { c.fillStyle = a.railC[1]; c.beginPath(); c.arc(p[0], p[1], ep * 0.55, 0, 7); c.fill(); c.fillStyle = a.railC[2]; c.beginPath(); c.arc(p[0] - 1, p[1] - 1, ep * 0.32, 0, 7); c.fill(); }); }
  if (a.rail === 'peint') { c.save(); c.translate(-0.8, -1.2); chemin(c, pts, ferme); c.lineWidth = Math.max(1.5, ep * 0.25); c.strokeStyle = '#fff'; c.stroke(); c.restore();
    lelong(pts, ferme, 46, (p) => { c.fillStyle = a.railC[1]; c.beginPath(); c.arc(p[0], p[1], 1.6, 0, 7); c.fill(); }); }
  if (a.rail === 'vauban') { // barrières de police, vues de dessus
    c.lineWidth = 1.2; c.strokeStyle = a.railC[1];
    lelong(pts, ferme, 6, (p, ang) => { const nx = -Math.sin(ang) * ep * 0.45, ny = Math.cos(ang) * ep * 0.45; c.beginPath(); c.moveTo(p[0] - nx, p[1] - ny); c.lineTo(p[0] + nx, p[1] + ny); c.stroke(); });
    c.lineWidth = 2; chemin(c, pts, ferme); c.strokeStyle = a.railC[2]; c.globalAlpha = 0.6; c.stroke(); c.globalAlpha = 1;
    lelong(pts, ferme, 200, (p) => { c.fillStyle = '#fff'; c.fillRect(p[0] - 9, p[1] - 4, 18, 8); c.fillStyle = '#e3001b'; c.fillRect(p[0] - 9, p[1] - 4, 6, 8); c.fillRect(p[0] + 3, p[1] - 4, 6, 8); });
  }
  c.restore();
}
function dessinerToit(c, a, t) {
  const ux = Math.cos(t.dir), uy = Math.sin(t.dir), vx = -uy, vy = ux, p = (u, v) => [t.c[0] + ux * u + vx * v, t.c[1] + uy * u + vy * v];
  const L = t.L + 12, Lg = t.Lg + 12, quad = (u0, v0, u1, v1) => [p(u0, v0), p(u1, v0), p(u1, v1), p(u0, v1)];
  // entrées du tunnel : arches sombres sur les deux façades
  for (const s of [-1, 1]) { c.save(); chemin(c, quad(s * t.L / 2 - (s > 0 ? 0 : 10), -t.tu / 2 - 4, s * t.L / 2 + (s > 0 ? 10 : 0), t.tu / 2 + 4)); c.fillStyle = 'rgba(0,0,0,.55)'; c.fill(); c.restore(); }
  // ombre portée du toit
  c.save(); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 18; c.shadowOffsetX = 9; c.shadowOffsetY = 12; chemin(c, quad(-L / 2, -Lg / 2, L / 2, Lg / 2)); c.fillStyle = a.toit[1]; c.fill(); c.restore();
  // deux pans : lumière venant du haut
  for (const [v0, v1, clair] of [[-Lg / 2, 0, true], [0, Lg / 2, false]]) {
    c.save(); chemin(c, quad(-L / 2, v0, L / 2, v1)); c.clip();
    const [gx0, gy0] = p(0, v0), [gx1, gy1] = p(0, v1), gr = c.createLinearGradient(gx0, gy0, gx1, gy1);
    gr.addColorStop(0, clair ? a.toit[0] : a.toit[1]); gr.addColorStop(1, clair ? a.toit[1] : a.toit[0]); c.fillStyle = gr; c.fillRect(t.c[0] - L - Lg, t.c[1] - L - Lg, 2 * (L + Lg), 2 * (L + Lg));
    // tuiles en écailles, rangées parallèles au faîtage
    c.strokeStyle = a.neon ? 'rgba(255,60,172,.5)' : 'rgba(0,0,0,.22)'; c.lineWidth = 1.1;
    for (let v = v0 + 7, r = 0; v < v1 + 7; v += 8, r++) for (let u = -L / 2 + (r % 2 ? 6 : 0); u < L / 2 + 6; u += 12) {
      const [x, y] = p(u, v); c.beginPath(); c.arc(x, y, 6, Math.atan2(vy, vx) + (clair ? 0 : Math.PI), Math.atan2(vy, vx) + (clair ? Math.PI : 2 * Math.PI)); c.stroke(); }
    c.restore();
  }
  // faîtage et rives
  c.save(); c.lineCap = 'round'; const [fx0, fy0] = p(-L / 2, 0), [fx1, fy1] = p(L / 2, 0);
  c.strokeStyle = a.neon ? '#ff3cac' : 'rgba(0,0,0,.35)'; c.lineWidth = 6; c.beginPath(); c.moveTo(fx0, fy0); c.lineTo(fx1, fy1); c.stroke();
  c.strokeStyle = a.neon ? '#ffc2e6' : 'rgba(255,255,255,.4)'; c.lineWidth = 2; c.beginPath(); c.moveTo(fx0, fy0 - 1); c.lineTo(fx1, fy1 - 1); c.stroke();
  chemin(c, quad(-L / 2, -Lg / 2, L / 2, Lg / 2)); c.strokeStyle = a.neon ? '#3ae0ff' : 'rgba(0,0,0,.3)'; c.lineWidth = 2; c.stroke(); c.restore();
  if (a === AMB.manif) { const [ex, ey] = p(0, -Lg / 4); embleme(c, ex, ey, Math.min(L, Lg) * 0.2); }
  if (!t.pales) { // cheminée qui fume
    const [cx, cy] = p(L * 0.2, Lg * 0.26); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(cx - 4, cy - 2, 16, 14); c.fillStyle = '#8d7b6a'; c.fillRect(cx - 7, cy - 7, 14, 14); c.fillStyle = '#3b322b'; c.fillRect(cx - 4, cy - 4, 8, 8);
  } else { // chapeau du moulin
    const [cx, cy] = p(-t.L / 2 + 14, 0); c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.arc(cx + 4, cy + 5, 16, 0, 7); c.fill(); c.fillStyle = a.toit[0]; c.beginPath(); c.arc(cx, cy, 15, 0, 7); c.fill(); c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 2; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.arc(cx - 4, cy - 5, 5, 0, 7); c.fill();
  }
}

// ---- éléments animés ----
function dessinerEau(c, a, h, t) {
  for (const z of h.zones || []) {
    if (z.type !== 'eau') continue;
    const apres = h.zones.slice(h.zones.indexOf(z) + 1).filter((q) => q.pts && q.type !== 'pente' && q.type !== 'tapis');
    const decoupe = () => { c.beginPath(); [z.pts, ...apres.map((q) => q.pts)].forEach((pts) => pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])))); c.clip('evenodd'); };
    c.save(); chemin(c, h.bord); c.clip(); decoupe();
    const zb = bboxDe(z.pts); const gr = c.createLinearGradient(zb.x0, zb.y0, zb.x1, zb.y1); gr.addColorStop(0, a.eau[0]); gr.addColorStop(1, a.eau[1]); c.fillStyle = gr; c.fillRect(zb.x0, zb.y0, zb.x1 - zb.x0, zb.y1 - zb.y0);
    // bord peu profond, reflets ondulants, caustiques
    chemin(c, z.pts); c.lineWidth = 26; c.strokeStyle = a.eau[1]; c.globalAlpha = 0.55; c.stroke(); c.globalAlpha = 1;
    c.strokeStyle = a.eau[2]; c.globalAlpha = 0.35; c.lineWidth = 1.6;
    for (let y = zb.y0 + 6; y < zb.y1; y += 16) { c.beginPath(); for (let x = zb.x0; x <= zb.x1; x += 10) { const yy = y + Math.sin(x / 31 + t * 1.7 + y * 0.7) * 3 + Math.sin(x / 13 - t * 2.3) * 1.2; x === zb.x0 ? c.moveTo(x, yy) : c.lineTo(x, yy); } c.stroke(); }
    c.globalAlpha = 0.22; c.fillStyle = a.eau[2];
    for (let i = 0; i < 26; i++) { const x = zb.x0 + ((i * 97 + t * 14) % (zb.x1 - zb.x0 + 1)), y = zb.y0 + ((i * 61 + Math.sin(t + i) * 10 + 1000) % (zb.y1 - zb.y0 + 1)); c.beginPath(); c.ellipse(x, y, 7 + (i % 3) * 3, 2.5, 0.3, 0, 7); c.fill(); }
    c.globalAlpha = 1; c.restore();
    // écume le long des berges
    c.save(); chemin(c, h.bord); c.clip(); decoupe(); c.beginPath(); [z.pts, ...apres.map((q) => q.pts)].forEach((pts) => { pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); }); c.setLineDash([3, 7]); c.lineDashOffset = -t * 9; c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.7)'; c.stroke(); c.setLineDash([]);
    c.lineWidth = 3; c.strokeStyle = a === AMB.manif ? 'rgba(40,40,40,.35)' : 'rgba(40,60,30,.35)'; c.globalAlpha = 0.7; c.stroke(); c.restore();
  }
  for (const z of h.zones || []) if (z.type === 'pont') { // ponts en planches
    c.save(); chemin(c, h.bord); c.clip(); chemin(c, z.pts); c.clip(); const zb = bboxDe(z.pts);
    c.fillStyle = a.pont[0]; c.fillRect(zb.x0, zb.y0, zb.x1 - zb.x0, zb.y1 - zb.y0); c.strokeStyle = a.pont[1]; c.lineWidth = 1.6;
    for (let x = zb.x0; x < zb.x1; x += 13) { c.beginPath(); c.moveTo(x, zb.y0); c.lineTo(x, zb.y1); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,.25)'; for (let x = zb.x0 + 6; x < zb.x1; x += 13) { c.fillRect(x, zb.y0 + 6, 1.4, 1.4); c.fillRect(x, zb.y1 - 8, 1.4, 1.4); } c.restore();
  }
}
function dessinerMecanismes(c, a, h, t, flash) {
  for (const z of h.zones || []) {
    if (z.type === 'tapis') {
      c.save(); chemin(c, z.pts); c.clip(); const zb = bboxDe(z.pts); c.fillStyle = a.tapis[0]; c.fillRect(zb.x0, zb.y0, zb.x1 - zb.x0, zb.y1 - zb.y0);
      const ang = Math.atan2(z.vy, z.vx), sp = Math.hypot(z.vx, z.vy), cx = (zb.x0 + zb.x1) / 2, cy = (zb.y0 + zb.y1) / 2; c.translate(cx, cy); c.rotate(ang);
      const Lz = Math.abs(Math.cos(ang)) > 0.5 ? zb.x1 - zb.x0 : zb.y1 - zb.y0, Wz = Math.abs(Math.cos(ang)) > 0.5 ? zb.y1 - zb.y0 : zb.x1 - zb.x0, off = (t * sp) % 28;
      c.strokeStyle = a.tapis[1]; c.lineWidth = 4; if (a.neon) { c.shadowColor = a.tapis[1]; c.shadowBlur = 8; }
      for (let u = -Lz / 2 - 28 + off; u < Lz / 2 + 28; u += 28) { c.beginPath(); c.moveTo(u - 8, -Wz * 0.32); c.lineTo(u + 4, 0); c.lineTo(u - 8, Wz * 0.32); c.stroke(); }
      c.restore(); c.save(); chemin(c, z.pts); c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.4)'; c.stroke(); c.restore();
    }
    if (z.type === 'tourniquet') {
      c.save(); c.translate(z.x, z.y); c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(3, 4, z.r + 4, 0, 7); c.fill();
      c.rotate(z.w * t); c.fillStyle = a.tourniquet[0]; c.beginPath(); c.arc(0, 0, z.r, 0, 7); c.fill();
      c.fillStyle = a.tourniquet[1]; c.globalAlpha = 0.65; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, z.r, i * Math.PI / 4, i * Math.PI / 4 + Math.PI / 8); c.closePath(); c.fill(); } c.globalAlpha = 1;
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, z.r, 0, 7); c.stroke(); c.fillStyle = '#555'; c.beginPath(); c.arc(0, 0, 9, 0, 7); c.fill(); c.restore();
    }
  }
  (h.bumpers || []).forEach((b, i) => {
    const f = flash[i] || 0, rr = b.r * (1 + f * 0.18);
    c.save(); c.translate(b.x, b.y); if (a.neon || f) { c.shadowColor = a.bumper[1]; c.shadowBlur = 10 + 20 * f; } else { c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 6; c.shadowOffsetY = 3; }
    c.fillStyle = a.bumper[1]; c.beginPath(); c.arc(0, 0, rr, 0, 7); c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0;
    c.fillStyle = a.bumper[0]; for (let j = 0; j < 6; j++) { c.beginPath(); c.arc(Math.cos(j * 1.047) * rr * 0.62, Math.sin(j * 1.047) * rr * 0.62, rr * 0.16, 0, 7); c.fill(); }
    c.fillStyle = f ? '#fff' : a.bumper[0]; c.beginPath(); c.arc(0, 0, rr * 0.38, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.arc(-rr * 0.35, -rr * 0.4, rr * 0.2, 0, 7); c.fill(); c.restore();
  });
  for (const m of h.mobiles || []) {
    if (m.type === 'helice') {
      c.save(); c.translate(m.x, m.y);
      for (let i = 0; i < m.pales; i++) { c.save(); c.rotate(m.phase + m.w * t + i * 2 * Math.PI / m.pales); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 6; c.shadowOffsetY = 4; c.fillStyle = '#f4efe4'; c.fillRect(4, -6, m.l - 4, 12); c.shadowColor = 'transparent'; c.fillStyle = a.drapeau; for (let x = 14; x < m.l - 6; x += 18) c.fillRect(x, -6, 9, 12); c.restore(); }
      c.fillStyle = '#6f4521'; c.beginPath(); c.arc(0, 0, 11, 0, 7); c.fill(); c.restore();
    } else if (m.type === 'porte') {
      const kk = 0.5 - 0.5 * Math.cos(2 * Math.PI * t / m.periode + (m.phase || 0)), cx = m.a[0] + (m.b[0] - m.a[0]) * kk, cy = m.a[1] + (m.b[1] - m.a[1]) * kk;
      c.save(); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 5; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(m.a[0], m.a[1]); c.lineTo(m.b[0], m.b[1]); c.stroke(); c.setLineDash([]);
      c.shadowColor = a.neon ? '#3ae0ff' : 'rgba(0,0,0,.45)'; c.shadowBlur = 10; c.shadowOffsetY = a.neon ? 0 : 5;
      c.fillStyle = a.neon ? '#3ae0ff' : a.railC[0]; c.fillRect(cx - m.taille[0] / 2, cy - m.taille[1] / 2, m.taille[0], m.taille[1]); c.shadowColor = 'transparent';
      c.fillStyle = a.drapeau; for (let y = -m.taille[1] / 2 + 3; y < m.taille[1] / 2 - 3; y += 10) c.fillRect(cx - m.taille[0] / 2 + 3, cy + y, m.taille[0] - 6, 5); c.restore();
    }
  }
}
function dessinerPales(c, a, h, t) {
  for (const m of h.mobiles || []) {
    if (m.type !== 'moulin') continue;
    const ux = Math.cos(m.dir), uy = Math.sin(m.dir), vx = -uy, vy = ux, p = (u, v) => [m.c[0] + ux * u + vx * v, m.c[1] + uy * u + vy * v];
    const moyeu = p(m.devant + 4, 0);
    for (let i = 0; i < m.pales; i++) {
      const th = m.phase + m.w * t + i * 2 * Math.PI / m.pales, sn = Math.sin(th), cs = Math.cos(th);
      // pale verticale vue de dessus : elle se déplie vers l'avant quand elle descend (elle ferme alors le tunnel)
      const bout = p(m.devant + 4 - Math.max(0, sn) * m.l * 0.5, cs * m.l), ombre = p(m.devant + 14 - Math.max(0, sn) * m.l * 0.5, cs * m.l + 14);
      c.save(); c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 14; c.lineCap = 'round'; c.beginPath(); c.moveTo(moyeu[0] + 10, moyeu[1] + 12); c.lineTo(ombre[0], ombre[1]); c.stroke(); c.restore();
      c.save(); c.lineCap = 'round'; c.strokeStyle = a.neon ? '#3ae0ff' : '#5b4330'; c.lineWidth = 4; c.beginPath(); c.moveTo(moyeu[0], moyeu[1]); c.lineTo(bout[0], bout[1]); c.stroke();
      const w2 = 9 + 3 * Math.abs(cs), dir = [bout[0] - moyeu[0], bout[1] - moyeu[1]], dl = Math.hypot(dir[0], dir[1]) || 1, nx = -dir[1] / dl * w2, ny = dir[0] / dl * w2;
      const base = [moyeu[0] + dir[0] * 0.25, moyeu[1] + dir[1] * 0.25];
      c.fillStyle = a.neon ? 'rgba(58,224,255,.5)' : a === AMB.manif ? '#e3001b' : '#f4efe4'; c.strokeStyle = a.neon ? '#3ae0ff' : '#5b4330'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(base[0], base[1]); c.lineTo(bout[0], bout[1]); c.lineTo(bout[0] + nx, bout[1] + ny); c.lineTo(base[0] + nx, base[1] + ny); c.closePath(); c.fill(); c.stroke();
      if (!a.neon) { c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 0.8; for (let s = 0.2; s < 1; s += 0.2) { const q = [base[0] + (bout[0] - base[0]) * s, base[1] + (bout[1] - base[1]) * s]; c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(q[0] + nx, q[1] + ny); c.stroke(); } }
      c.restore();
    }
    c.fillStyle = a.neon ? '#ff3cac' : '#3e2c1f'; c.beginPath(); c.arc(moyeu[0], moyeu[1], 7, 0, 7); c.fill(); c.fillStyle = a.neon ? '#ffc2e6' : '#c48a4c'; c.beginPath(); c.arc(moyeu[0] - 1.5, moyeu[1] - 1.5, 3.5, 0, 7); c.fill();
  }
}
function dessinerDecorAnime(c, a, t) {
  for (const d of C.dyn) {
    if (d.type === 'arbre') {
      const sx = Math.sin(t * 0.9 + d.ph) * 1.6, sy = Math.cos(t * 0.7 + d.ph) * 1.1;
      c.save(); c.globalAlpha = a.neon ? 0.5 : 0.28; c.fillStyle = '#000'; c.beginPath(); c.ellipse(d.x + d.r * 0.3, d.y + d.r * 0.4, d.r * 1.02, d.r * 0.92, 0, 0, 7); c.fill(); c.restore();
      c.save(); c.translate(d.x + sx, d.y + sy); c.rotate(Math.sin(t * 0.6 + d.ph) * 0.03); c.drawImage(d.sprite, -d.r * 1.2, -d.r * 1.2, d.r * 2.4, d.r * 2.4); c.restore();
    } else if (d.type === 'cheminee') {
      if (Math.random() < 0.12) particule({ type: 'fumee', x: d.x + (Math.random() - 0.5) * 4, y: d.y, vx: 10 + Math.random() * 8, vy: -8 - Math.random() * 6, vie: 2.6, taille: 4 });
    } else if (d.type === 'papillon') {
      const x = d.x + Math.sin(t * 0.37 + d.ph) * 120, y = d.y + Math.sin(t * 0.53 + d.ph * 2) * 70, b = Math.abs(Math.sin(t * 14 + d.ph));
      c.save(); c.translate(x, y); c.rotate(Math.cos(t * 0.37 + d.ph)); c.fillStyle = d.c; c.beginPath(); c.ellipse(-3, 0, 4, 5 * b + 1, 0.3, 0, 7); c.ellipse(3, 0, 4, 5 * b + 1, -0.3, 0, 7); c.fill(); c.fillStyle = '#333'; c.fillRect(-0.6, -4, 1.2, 8); c.restore();
    } else if (d.type === 'mouette') {
      const span = C.vx1 - C.vx0 + 300, x = C.vx0 - 150 + ((t * d.v + d.ph * 40) % span), y = d.y + Math.sin(t * 0.5 + d.ph) * 30, ail = Math.sin(t * 6 + d.ph) * 6;
      c.save(); c.globalAlpha = 0.22; c.strokeStyle = '#000'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + 22, y + 40 + ail); c.quadraticCurveTo(x + 32, y + 36, x + 40, y + 40); c.quadraticCurveTo(x + 48, y + 36, x + 58, y + 40 + ail); c.stroke(); c.restore();
      c.save(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 18, y + ail); c.quadraticCurveTo(x - 8, y - 4, x, y); c.quadraticCurveTo(x + 8, y - 4, x + 18, y + ail); c.stroke(); c.restore();
    } else if (d.type === 'mer') {
      const y0 = d.y, s = d.haut ? -1 : 1, yb = d.haut ? C.vy0 - 10 : C.vy1 + 10, f = (x) => y0 + s * (Math.sin(x / 50 + t * 1.2) * 6 + Math.sin(x / 23 - t) * 3);
      c.save(); c.beginPath(); c.moveTo(C.vx0 - 10, yb);
      for (let x = C.vx0 - 10; x <= C.vx1 + 10; x += 12) c.lineTo(x, f(x));
      c.lineTo(C.vx1 + 10, yb); c.closePath(); const gr = c.createLinearGradient(0, y0, 0, yb); gr.addColorStop(0, '#5fd3dc'); gr.addColorStop(1, '#0f6f9a'); c.fillStyle = gr; c.fill();
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 3; c.beginPath(); for (let x = C.vx0 - 10; x <= C.vx1 + 10; x += 12) x === C.vx0 - 10 ? c.moveTo(x, f(x)) : c.lineTo(x, f(x)); c.stroke(); c.restore();
    } else if (d.type === 'luciole') {
      const x = d.x + Math.sin(t * 0.3 + d.ph) * 30, y = d.y + Math.cos(t * 0.4 + d.ph) * 20, al = 0.3 + 0.7 * Math.max(0, Math.sin(t * 1.5 + d.ph));
      c.save(); c.globalAlpha = al; c.shadowColor = d.c; c.shadowBlur = 10; c.fillStyle = d.c; c.beginPath(); c.arc(x, y, 1.8, 0, 7); c.fill(); c.restore();
    } else if (d.type === 'lampe') {
      const p = 0.6 + 0.4 * Math.sin(t * 2 + d.ph); c.save(); const gr = c.createRadialGradient(d.x, d.y, 2, d.x, d.y, 60); gr.addColorStop(0, d.c); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 0.35 * p; c.fillStyle = gr; c.beginPath(); c.arc(d.x, d.y, 60, 0, 7); c.fill();
      c.globalAlpha = 1; c.fillStyle = '#222'; c.beginPath(); c.arc(d.x, d.y, 7, 0, 7); c.fill(); c.shadowColor = d.c; c.shadowBlur = 16 * p; c.fillStyle = d.c; c.beginPath(); c.arc(d.x, d.y, 4, 0, 7); c.fill(); c.restore();
    } else if (d.type === 'manif') {
      const b = Math.sin(t * 3.2 + d.ph) * 0.9, mx = d.x + Math.sin(t * 0.6 + d.ph) * 1.5, my = d.y + b;
      c.save(); c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(mx + 3, my + 4, 8.5, 6, 0, 0, 7); c.fill(); c.restore();
      c.save(); c.translate(mx, my); c.rotate(d.ang + Math.PI / 2);
      if (d.veste === 'chasuble') { c.fillStyle = '#e3001b'; c.beginPath(); c.ellipse(0, 0, 8, 5.2, 0, 0, 7); c.fill(); c.fillStyle = '#fff'; c.fillRect(-8, -1, 16, 2); }
      else { c.fillStyle = d.veste; c.beginPath(); c.ellipse(0, 0, 8, 5.2, 0, 0, 7); c.fill(); }
      c.fillStyle = d.peau; c.beginPath(); c.arc(0, 0.5, 3.6, 0, 7); c.fill(); c.fillStyle = d.cheveux; c.beginPath(); c.arc(0, 1.6, 3.4, 0, Math.PI); c.fill();
      c.restore();
      if (d.porte === 'drapeau') {
        c.save(); c.translate(mx + 5, my - 2); c.strokeStyle = '#ccc'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -16); c.stroke();
        c.beginPath(); c.moveTo(0, -16); for (let i = 0; i <= 8; i++) c.lineTo(i * 2.6, -16 + Math.sin(t * 6 + d.ph - i * 0.7) * 1.6 * i / 8); for (let i = 8; i >= 0; i--) c.lineTo(i * 2.6, -4 + Math.sin(t * 6 + d.ph - i * 0.7) * 1.6 * i / 8); c.closePath();
        c.fillStyle = '#d20012'; c.fill(); embleme(c, 10.4, -10 + Math.sin(t * 6 + d.ph - 3) * 0.8, 5.2); c.restore();
      } else if (d.porte === 'pancarte') {
        const lev = Math.max(0, Math.sin(t * 2.4 + d.ph)) * 3;
        c.save(); c.translate(mx, my - 12 - lev); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(-21, -7, 46, 20);
        c.fillStyle = '#d20012'; c.fillRect(-23, -11, 46, 20); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(-21.5, -9.5, 43, 17);
        c.fillStyle = '#fff'; c.font = '8px "Bowlby One SC", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(d.txt, 0, -1, 40); c.restore();
      }
    } else if (d.type === 'stand') {
      c.save(); c.translate(d.x, d.y); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(-36, -18, 80, 46);
      for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#fff' : '#e3001b'; c.fillRect(-40 + i * 10, -24, 10, 30); }
      c.fillStyle = '#3b3f45'; c.fillRect(-34, 8, 68, 14); c.fillStyle = '#ff8a00'; for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(-26 + i * 10, 15, 4, 1.8, 0, 0, 7); c.fill(); }
      c.fillStyle = '#e3001b'; c.fillRect(-30, -14, 52, 14); c.fillStyle = '#fff'; c.font = '9px "Bowlby One SC", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('MERGUEZ', -4, -7); embleme(c, 32, -12, 7); c.restore();
      if (Math.random() < 0.3) particule({ type: 'fumee', x: d.x + (Math.random() - 0.5) * 50, y: d.y + 12, vx: 6 + Math.random() * 8, vy: -14 - Math.random() * 8, vie: 3, taille: 5 });
    } else if (d.type === 'banderole') {
      c.save(); c.translate(d.x, d.y); const w = d.w, hh = 34;
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(-w / 2 + 6, -hh / 2 + 8, w, hh);
      c.beginPath(); for (let i = 0; i <= 20; i++) c.lineTo(-w / 2 + w * i / 20, -hh / 2 + Math.sin(t * 2 + d.ph + i * 0.5) * 2); for (let i = 20; i >= 0; i--) c.lineTo(-w / 2 + w * i / 20, hh / 2 + Math.sin(t * 2 + d.ph + i * 0.5) * 2); c.closePath();
      c.fillStyle = '#e3001b'; c.fill(); c.fillStyle = '#fff'; c.font = '12px "Bowlby One SC", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(d.txt, 12, Math.sin(t * 2 + d.ph + 10) * 1.5, w - 40);
      embleme(c, -w / 2 + 16, Math.sin(t * 2 + d.ph) * 2, 11); c.fillStyle = '#6b5a45'; c.fillRect(-w / 2 - 3, -hh / 2 - 4, 4, hh + 8); c.fillRect(w / 2 - 1, -hh / 2 - 4, 4, hh + 8); c.restore();
    } else if (d.type === 'drapeau') {
      c.save(); c.translate(d.x, d.y); c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.arc(3, 3, 4, 0, 7); c.fill(); c.fillStyle = '#ddd'; c.beginPath(); c.arc(0, 0, 3, 0, 7); c.fill();
      c.beginPath(); c.moveTo(0, 0); for (let i = 0; i <= 10; i++) c.lineTo(i * 3.4, -22 + Math.sin(t * 5 + d.ph - i * 0.6) * 2.4 * i / 10); for (let i = 10; i >= 0; i--) c.lineTo(i * 3.4, Math.sin(t * 5 + d.ph - i * 0.6) * 2.4 * i / 10); c.closePath();
      c.fillStyle = '#e3001b'; c.fill(); embleme(c, 17, -11 + Math.sin(t * 5 + d.ph - 3) * 1.2, 7); c.restore();
    } else if (d.type === 'brasero') {
      c.save(); c.translate(d.x, d.y); c.fillStyle = '#2b2d31'; c.beginPath(); c.arc(0, 0, 13, 0, 7); c.fill(); c.strokeStyle = '#555'; c.lineWidth = 2; c.stroke();
      for (let i = 0; i < 6; i++) { const ph = t * 6 + d.ph + i; c.fillStyle = i % 2 ? '#ff8a00' : '#ffd400'; c.globalAlpha = 0.85; c.beginPath(); c.arc(Math.sin(ph) * 4, Math.cos(ph * 1.3) * 4, 4 + Math.sin(ph * 2) * 1.5, 0, 7); c.fill(); } c.restore();
      if (Math.random() < 0.25) particule({ type: 'fumee', x: d.x + (Math.random() - 0.5) * 8, y: d.y, vx: 8 + Math.random() * 10, vy: -12 - Math.random() * 8, vie: 3, taille: 6 });
    } else if (d.type === 'ballon') {
      const by = d.y + Math.sin(t * 1.4 + d.ph) * 4, bx = d.x + Math.sin(t * 0.9 + d.ph) * 3;
      c.save(); c.globalAlpha = 0.25; c.fillStyle = '#000'; c.beginPath(); c.ellipse(d.x + 16, d.y + 22, 10, 9, 0, 0, 7); c.fill(); c.restore();
      c.save(); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(bx, by + 11); c.quadraticCurveTo(bx + 4, by + 18, bx - 2, by + 26); c.stroke();
      c.fillStyle = '#e3001b'; c.beginPath(); c.ellipse(bx, by, 10, 11.5, 0, 0, 7); c.fill(); embleme(c, bx, by, 6); c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(bx - 4, by - 5, 2.5, 4, -0.5, 0, 7); c.fill(); c.restore();
    }
  }
}

// ---- particules ----
let parts = [];
function particule(p) { if (parts.length < 600) parts.push(Object.assign({ age: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8 }, p)); }
function gerbe(type, x, y, n, o = {}) { for (let i = 0; i < n; i++) { const th = (o.ang ?? Math.random() * 6.28) + (o.ang != null ? (Math.random() - 0.5) * (o.cone || 1.2) : 0), v = (o.v || 80) * (0.4 + Math.random() * 0.8); particule({ type, x, y, vx: Math.cos(th) * v, vy: Math.sin(th) * v, vie: (o.vie || 0.6) * (0.6 + Math.random() * 0.6), taille: (o.taille || 3) * (0.6 + Math.random() * 0.8), c: o.c && o.c[i % o.c.length] }); } }
function majParticules(dt) {
  for (const p of parts) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    const fr = p.type === 'confetti' ? 1.6 : p.type === 'fumee' ? 0.3 : 3.2; p.vx *= Math.exp(-fr * dt); p.vy *= Math.exp(-fr * dt); if (p.type === 'confetti') p.vy += 60 * dt; if (p.type === 'fumee') p.taille += 10 * dt; }
  parts = parts.filter((p) => p.age < p.vie);
}
function dessinerParticules(c, haut) {
  for (const p of parts) {
    const k = 1 - p.age / p.vie, enHaut = p.type === 'confetti' || p.type === 'fumee';
    if (enHaut !== haut) continue;
    c.save(); c.globalAlpha = Math.max(0, k);
    if (p.type === 'anneau') { c.strokeStyle = p.c || 'rgba(255,255,255,.8)'; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, p.taille + (1 - k) * 26, 0, 7); c.stroke(); }
    else if (p.type === 'confetti') { c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.c; c.fillRect(-p.taille, -p.taille * 0.45, p.taille * 2, p.taille * 0.9); }
    else if (p.type === 'fumee') { c.globalAlpha = k * 0.28; c.fillStyle = '#9a9a9a'; c.beginPath(); c.arc(p.x, p.y, p.taille, 0, 7); c.fill(); }
    else if (p.type === 'brin') { c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.c || '#2f7a39'; c.fillRect(-0.6, -2.2, 1.2, 4.4); }
    else if (p.type === 'etincelle') { c.fillStyle = p.c || '#fff6c2'; c.shadowColor = p.c || '#ffd166'; c.shadowBlur = 6; c.beginPath(); c.arc(p.x, p.y, p.taille * k, 0, 7); c.fill(); }
    else { c.fillStyle = p.c || 'rgba(255,255,255,.8)'; c.beginPath(); c.arc(p.x, p.y, p.taille * (0.5 + k * 0.5), 0, 7); c.fill(); }
    c.restore();
  }
}

// ---- balles ----
const COUL_J = ['#ffffff', '#ffd23f'], COUL_J2 = ['#c9ccd2', '#d99a0b'];
const rot = [{ a: 0, d: 0 }, { a: 0, d: 0 }];
function dessinerBalle(c, a, h, x, y, i, alpha = 1, echelle = 1) {
  const [z] = relief(h, x, y), hz = Math.max(0, z) * 0.12;
  c.save(); c.globalAlpha = alpha;
  c.fillStyle = 'rgba(0,0,0,.32)'; c.beginPath(); c.ellipse(x + 2.6 + hz, y + 3.6 + hz, R * echelle, R * 0.82 * echelle, 0, 0, 7); c.fill();
  if (a.neon) { c.shadowColor = COUL_J[i]; c.shadowBlur = 14; }
  const rr = R * echelle * (1 + Math.max(0, z) * 0.006), gr = c.createRadialGradient(x - rr * 0.35, y - rr * 0.4, 0.5, x, y, rr);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.6, COUL_J[i]); gr.addColorStop(1, COUL_J2[i]); c.fillStyle = gr; c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill(); c.shadowBlur = 0;
  // alvéoles qui tournent avec le roulement
  const ro = rot[i]; c.save(); c.beginPath(); c.arc(x, y, rr, 0, 7); c.clip(); c.fillStyle = 'rgba(0,0,0,.13)';
  for (let k2 = 0; k2 < 6; k2++) { const ph = ro.a + k2 * 1.05, s = Math.sin(ph), cc = Math.cos(ph); if (cc < 0) continue; const off = s * rr * 0.75, lat = k2 % 2 ? 2.4 : -2.4, px = x + Math.cos(ro.d) * off - Math.sin(ro.d) * lat, py = y + Math.sin(ro.d) * off + Math.cos(ro.d) * lat; c.beginPath(); c.ellipse(px, py, 1.3 * cc + 0.3, 1.3, ro.d, 0, 7); c.fill(); }
  c.restore(); c.restore();
}
function tournerBalle(i, dx, dy) { const d = Math.hypot(dx, dy); if (d > 0.01) { rot[i].a += d / R; rot[i].d = Math.atan2(dy, dx); } }
function dessinerDrapeau(c, a, h, t, leve) {
  c.save(); c.translate(h.trou[0], h.trou[1]); if (leve) c.globalAlpha = 0.3;
  c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(0, 0); c.lineTo(30, 20); c.stroke();
  c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.moveTo(30, 20); c.lineTo(48, 26 + Math.sin(t * 4) * 2); c.lineTo(38, 32); c.fill();
  c.strokeStyle = a.neon ? '#f6f7ff' : '#fafafa'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -40); c.stroke();
  c.fillStyle = a.drapeau; if (a.neon) { c.shadowColor = a.drapeau; c.shadowBlur = 14; }
  c.beginPath(); c.moveTo(0, -40); for (let i = 0; i <= 8; i++) c.lineTo(i * 3.2, -40 + Math.sin(t * 5 - i * 0.7) * 1.6 * i / 8 + i * 0.6); c.lineTo(25, -27 + Math.sin(t * 5 - 6) * 1.5); for (let i = 8; i >= 0; i--) c.lineTo(i * 3.2, -26 + Math.sin(t * 5 - i * 0.7) * 1.6 * i / 8); c.closePath(); c.fill();
  if (a === AMB.manif) { c.shadowBlur = 0; embleme(c, 12, -33, 5.5); }
  c.fillStyle = '#ffd400'; c.beginPath(); c.arc(0, -41, 2, 0, 7); c.fill();
  c.restore();
}

function dessinerVisee(c, a, b, t) {
  const d = sub(visee.p0, visee.p), Ld = len(d); if (Ld < 8) return;
  const pw = Math.min(1, Ld / DRAG_MAX), ang = Math.atan2(d[1], d[0]), col = pw < 0.5 ? '#9be36d' : pw < 0.8 ? '#ffc93c' : '#ff5a3c', aide = etat.aide;
  const lg = aide === 'force' ? 22 : aide === 'longue' ? 40 + pw * 170 : 24 + pw * 90;
  c.save(); c.translate(b.x, b.y); c.rotate(ang); c.strokeStyle = col; c.lineWidth = 3; c.setLineDash(aide === 'force' ? [] : [7, 6]);
  c.beginPath(); c.moveTo(R + 4, 0); c.lineTo(R + lg, 0); c.stroke(); c.setLineDash([]);
  c.fillStyle = col; c.beginPath(); c.moveTo(R + lg + 9, 0); c.lineTo(R + lg - 2, -6.5); c.lineTo(R + lg - 2, 6.5); c.closePath(); c.fill(); c.restore();
  c.save(); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 5; c.beginPath(); c.arc(b.x, b.y, R + 14, 0, 7); c.stroke();
  c.strokeStyle = col; c.beginPath(); c.arc(b.x, b.y, R + 14, -Math.PI / 2, -Math.PI / 2 + pw * Math.PI * 2); c.stroke(); c.restore();
  c.save(); c.strokeStyle = 'rgba(255,255,255,.35)'; c.setLineDash([3, 5]); c.lineWidth = 1.5; c.beginPath(); c.moveTo(visee.p0[0], visee.p0[1]); c.lineTo(visee.p[0], visee.p[1]); c.stroke(); c.restore();
}
export function apercuAmbiance(cnv, cle) {
  const a = AMB[cle];
  const x = cnv.getContext('2d'), W = cnv.width, H = cnv.height;
  x.fillStyle = x.createPattern(textureSol(a), 'repeat'); x.fillRect(0, 0, W, H);
  if (a === AMB.mer) { x.fillStyle = '#33c3d3'; x.fillRect(0, 0, W, 22); x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); for (let i = 0; i <= W; i += 10) x.lineTo(i, 22 + Math.sin(i / 14) * 3); x.stroke(); }
  const pts = couloir([[34, 92], [100, 62], [160, 108], [222, 78]], 50);
  x.save(); x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 8; x.shadowOffsetY = 3; chemin(x, pts); x.fillStyle = a.gazon[0]; x.fill(); x.restore();
  x.save(); chemin(x, pts); x.clip(); x.fillStyle = x.createPattern(textureGazon(a), 'repeat'); x.fillRect(0, 0, W, H); x.globalAlpha = 0.45; x.fillStyle = a.gazon[1]; for (let i = -10; i < W; i += 24) { x.save(); x.translate(i, 0); x.rotate(0.35); x.fillRect(0, -20, 12, 300); x.restore(); } x.restore();
  dessinerRail(x, a, pts, true, 6);
  x.fillStyle = '#000'; x.beginPath(); x.arc(212, 80, 5, 0, 7); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(212, 80); x.lineTo(212, 58); x.stroke(); x.fillStyle = a.drapeau; x.beginPath(); x.moveTo(212, 58); x.lineTo(224, 62); x.lineTo(212, 67); x.fill();
  x.fillStyle = '#fff'; x.beginPath(); x.arc(42, 92, 3.5, 0, 7); x.fill();
  if (a === AMB.manif) { embleme(x, 228, 26, 15); x.fillStyle = '#e3001b'; x.fillRect(10, 128, 150, 22); x.fillStyle = '#fff'; x.font = '10px "Bowlby One SC", Impact'; x.fillText('BONY, PARTAGE LES RICHESSES !', 16, 143); }
  if (a === AMB.ete) { x.drawImage(spriteArbre(a, 26, graine(4)), 196, 104, 54, 54); }
  if (a === AMB.nuit) { x.drawImage(spriteArbre(a, 14, graine(9)), 20, 120, 30, 30); x.drawImage(spriteArbre(a, 12, graine(5)), 200, 20, 26, 26); }
}
/* =====================================================================================
   PILOTAGE PAR L'ÉTAT SERVEUR
   ===================================================================================== */
const AIDE = { facile: 'longue', normal: 'ligne', expert: 'force' };
const ORDRE = ['p1', 'p2'];
let io = null, raf = 0, ro = null, visee = null, trace = [], secousse = 0, flash = {}, chute = null;
let etat = null;          // { h, board, ctx, balles: [[x, y, dedans, visible]], horloge0, t0, aide }
let anim = null, enAttente = null, dernierVu = undefined, attendu = null, changementTrou = 0, pauseTrou = false;
const cleDe = (d) => (d ? [d.i, d.joueur, d.horloge, d.angle, d.puissance].join('|') : null);
const horlogeLocale = () => (etat ? etat.horloge0 + (performance.now() - etat.t0) / 1000 : 0);

function ajuster() {
  if (!cv || !etat) return;
  const r = cv.getBoundingClientRect(); if (r.width < 10 || r.height < 10) return;
  vue.dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * vue.dpr)); cv.height = Math.max(1, Math.round(r.height * vue.dpr));
  const h = etat.h, bb = bboxDe(h.bord), m = Math.max(40, Math.min(r.width, r.height) * 0.1) * vue.dpr;
  vue.k = Math.min((cv.width - 2 * m) / (bb.x1 - bb.x0), (cv.height - 2 * m) / (bb.y1 - bb.y0));
  vue.ox = (cv.width - (bb.x1 - bb.x0) * vue.k) / 2 - bb.x0 * vue.k; vue.oy = (cv.height - (bb.y1 - bb.y0) * vue.k) / 2 - bb.y0 * vue.k;
  preparerScene(h, AMB[etat.board.cfg.amb] || AMB.ete);
}
const ballesDe = (board, tour) => ORDRE.map((m) => [board.balles[m].x, board.balles[m].y, board.balles[m].dedans ? 1 : 0, board.balles[m].pose || (m === tour && !board.fini[m]) ? 1 : 0]);
/** Affiche le plateau tel que le serveur l'a renvoyé (sans animation). */
function appliquer(board, ctx) {
  const h = TROU_PAR_ID[board.trous[board.i]], nouveau = !etat || etat.h !== h;
  pauseTrou = false;
  etat = { h, board, ctx, balles: ballesDe(board, ctx.tour), horloge0: board.horloge, t0: performance.now(), aide: AIDE[board.cfg.diff] || 'ligne' };
  if (nouveau) { trace = []; parts = []; chute = null; flash = {}; C = null; ajuster(); if (!ctx.fini) io?.annonce(`Trou ${board.i + 1}`, `${h.nom} · par ${h.par}`); }
}
/** Rejoue le dernier coup (le sien ou celui de l'adversaire) à partir de l'état AVANT le coup. */
function rejouer(board, ctx, local) {
  const d = board.dernier, h = TROU_PAR_ID[board.trous[d.i]], j = ORDRE.indexOf(d.joueur);
  pauseTrou = false;
  if (!etat || etat.h !== h) { etat = { h, board, ctx, balles: [], horloge0: d.horloge, t0: performance.now(), aide: AIDE[board.cfg.diff] }; C = null; ajuster(); }
  const avant = d.avant, balles = ORDRE.map((m) => ({ x: avant[m].x, y: avant[m].y, dedans: avant[m].dedans || (!avant[m].pose && m !== d.joueur) }));
  const res = simuler(h, { balles, horloge: d.horloge }, { balle: j, angle: d.angle, puissance: d.puissance }, { choc: board.cfg.choc });
  etat.balles = ORDRE.map((m, i) => [avant[m].x, avant[m].y, avant[m].dedans ? 1 : 0, avant[m].pose || i === j ? 1 : 0]);
  anim = { res, t0: performance.now(), ev: 0, j, prec: null, cle: cleDe(d), d, board, ctx, local };
  SONS.frappe(d.puissance); secousse = Math.max(secousse, d.puissance * 0.25);
  gerbe('brin', avant[d.joueur].x, avant[d.joueur].y, Math.round(4 + d.puissance * 10), { ang: d.angle + Math.PI, cone: 1.4, v: 60 + d.puissance * 140, vie: 0.6, c: [C?.a?.gazon?.[1] || '#4aa854', C?.a?.frange || '#2f7a39'] });
}
function finAnim() {
  // Son propre coup fini AVANT la réponse du serveur : la balle reste où elle s'est arrêtée, on attend le plateau
  // (maj() le range dans enAttente, et la boucle rappelle finAnim à l'image suivante).
  if (anim.local && !enAttente) return;
  // Le coup tel que le serveur l'a joué (rentré, eau, ramassé), pas la copie locale qui n'en sait rien.
  const dS = enAttente?.board?.dernier, d = dS && cleDe(dS) === anim.cle ? dS : anim.d;
  const { ctx, j } = anim, nom = ctx.joueurs[j] || '';
  const a = AMB[(enAttente?.board || anim.board).cfg.amb] || AMB.ete, A = a.annonces || {}, tr = (s) => A[s] || s;
  const fin = enAttente || { board: anim.board, ctx: anim.ctx }; anim = null; enAttente = null;
  const b = fin.board;
  if (d.rentre) {
    const h = TROU_PAR_ID[b.trous[d.i]], c = b.i === d.i ? b.enCours[d.joueur] : b.coups[d.joueur][d.i], df = c - h.par;
    const n = c === 1 ? 'Trou en un !' : df <= -2 ? 'Eagle' : df === -1 ? 'Birdie' : df === 0 ? 'Par' : df === 1 ? 'Bogey' : df === 2 ? 'Double bogey' : `+${df}`;
    io?.annonce(tr(n), `${nom} · ${c} coup${c > 1 ? 's' : ''}`);
    if (df <= 0) { SONS.bravo(a === AMB.manif); gerbe('confetti', h.trou[0], h.trou[1], c === 1 ? 140 : 70, { v: 260, vie: 2.4, taille: 4, c: a === AMB.manif ? ['#d20012', '#ffffff', '#ffd400'] : a.neon ? ['#ff3cac', '#3ae0ff', '#b6ff3a'] : ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#ffffff'] }); }
  } else if (d.eau) io?.annonce(tr('Plouf'), `${nom} · +1 coup de pénalité`);
  else if (d.ramasse) io?.annonce(tr('Balle ramassée'), `${nom} · maximum atteint`);
  if (b.i !== d.i || fin.ctx.fini) {
    // Trou terminé : on laisse voir la balle au fond du trou avant de passer au suivant.
    etat.balles = etat.balles.map((x) => x.slice()); const id = ++changementTrou; pauseTrou = true;
    setTimeout(() => { if (id === changementTrou && !anim) { appliquer(b, fin.ctx); suite(); } }, 1900);
  } else { appliquer(b, fin.ctx); suite(); }
}
/** Après une animation : s'il est déjà arrivé un coup plus récent, on le rejoue. */
function suite() { const b = etat?.board; if (b?.dernier && cleDe(b.dernier) !== dernierVu) { dernierVu = cleDe(b.dernier); rejouer(b, etat.ctx); } }

/** Le serveur a renvoyé un nouveau plateau (son coup, celui de l'adversaire, ou le premier affichage). */
export function maj(board, ctx) {
  if (!board?.trous) return;
  const cle = cleDe(board.dernier);
  if (anim) {
    enAttente = { board, ctx };
    if (cle && cle !== anim.cle && cle !== dernierVu && !(attendu && cle === attendu)) { /* coup suivant : rejoué après celui-ci */ } else dernierVu = cle;
    if (cle === attendu) attendu = null;
    return;
  }
  if (dernierVu === undefined) {
    // Premier affichage : on rejoue le dernier coup de l'adversaire (on voit ce qu'il a fait), pas le sien.
    dernierVu = cle;
    if (board.dernier && board.dernier.joueur !== ctx.moi && board.dernier.i === board.i && !ctx.fini) { appliquer(board, ctx); rejouer(board, ctx); return; }
    appliquer(board, ctx); return;
  }
  if (attendu && cle === attendu) attendu = null;
  if (cle && cle !== dernierVu) { dernierVu = cle; rejouer(board, ctx); return; }
  if (pauseTrou) { etat.ctx = ctx; return; } // la pause de fin de trou appliquera ce plateau
  appliquer(board, ctx);
}
const peutJouer = () => etat && !anim && !attendu && !pauseTrou && !etat.ctx.fini && etat.ctx.tour === etat.ctx.moi && !etat.board.fini[etat.ctx.moi] && TROU_PAR_ID[etat.board.trous[etat.board.i]] === etat.h;
function jouer(angle, puissance) {
  const board = etat.board, ctx = etat.ctx, horloge = Math.min(board.horloge + 3500, Math.max(board.horloge, horlogeLocale()));
  // Coup joué tout de suite à l'écran (même moteur que le serveur) ; le plateau du serveur fera foi à la fin.
  const d = { joueur: ctx.moi, i: board.i, angle, puissance, horloge, avant: JSON.parse(JSON.stringify(board.balles)), eau: 0, rentre: false, ramasse: false };
  attendu = cleDe(d); dernierVu = attendu;
  rejouer({ ...board, dernier: d }, ctx, true);
  Promise.resolve(io?.jouer({ angle, puissance, horloge })).then((r) => {
    if (r?.error) { attendu = null; anim = null; enAttente = null; io?.erreur(r.error); if (etat) appliquer(etat.board, etat.ctx); }
  });
}
function versMonde(ev) { const r = cv.getBoundingClientRect(); return [((ev.clientX - r.left) * vue.dpr - vue.ox) / vue.k, ((ev.clientY - r.top) * vue.dpr - vue.oy) / vue.k]; }
const DRAG_MAX = 200;
const onDown = (ev) => { if (!peutJouer()) return; cv.setPointerCapture(ev.pointerId); visee = { p0: versMonde(ev), p: versMonde(ev) }; };
const onMove = (ev) => { if (visee) visee.p = versMonde(ev); };
const onUp = () => { if (!visee) return; const v = visee; visee = null; const d = sub(v.p0, v.p), Ld = len(d); if (Ld < 8 || !peutJouer()) return; jouer(Math.atan2(d[1], d[0]), Math.min(1, Ld / DRAG_MAX)); };
const onKey = (ev) => { if (ev.key === 'Escape') visee = null; };

let dernier = performance.now();
function boucle(now) {
  raf = requestAnimationFrame(boucle);
  const dt = Math.min(0.05, (now - dernier) / 1000); dernier = now;
  if (!etat || !cv) return;
  if (!C || C.h !== etat.h) ajuster(); if (!C) return;
  const h = etat.h, a = C.a;
  secousse = Math.max(0, secousse - dt * 2.5); for (const k in flash) flash[k] = Math.max(0, flash[k] - dt * 4);
  const sx = (Math.random() - 0.5) * secousse * 6 * vue.dpr, sy = (Math.random() - 0.5) * secousse * 6 * vue.dpr;
  let balles = etat.balles, horloge;
  if (anim) {
    const el = Math.max(0, now - anim.t0) / 1000, k = Math.min(anim.res.images.length - 1, Math.floor(el * 240 / PAS_IMAGE));
    balles = anim.res.images[k].map((b, i) => [b[0], b[1], b[2], b[3] && etat.balles[i]?.[3] !== 0 || i === anim.j ? b[3] : 0]);
    horloge = anim.d.horloge + k * PAS_IMAGE * DT;
    while (anim.ev < anim.res.evts.length && anim.res.evts[anim.ev].n <= k * PAS_IMAGE) evenement(anim.res.evts[anim.ev++], h);
    if (anim.prec) balles.forEach((b, i) => tournerBalle(i, b[0] - anim.prec[i][0], b[1] - anim.prec[i][1])); anim.prec = balles;
    trace.push([balles[anim.j][0], balles[anim.j][1], balles[anim.j][3]]); if (trace.length > 18) trace.shift();
    if (k >= anim.res.images.length - 1) { etat.balles = balles.map((b) => b.slice()); finAnim(); }
  } else { horloge = horlogeLocale(); if (trace.length) trace.shift(); }
  majParticules(dt);
  g.setTransform(1, 0, 0, 1, sx, sy); g.drawImage(C.L.sol, 0, 0);
  g.setTransform(vue.k, 0, 0, vue.k, vue.ox + sx, vue.oy + sy);
  dessinerEau(g, a, h, horloge); dessinerMecanismes(g, a, h, horloge, flash);
  g.setTransform(1, 0, 0, 1, sx, sy); g.drawImage(C.L.haut, 0, 0); g.setTransform(vue.k, 0, 0, vue.k, vue.ox + sx, vue.oy + sy);
  dessinerParticules(g, false);
  trace.forEach((p, i) => { if (!p[2]) return; g.fillStyle = a.neon ? `rgba(182,255,58,${(i / trace.length) * 0.4})` : `rgba(255,255,255,${(i / trace.length) * 0.3})`; g.beginPath(); g.arc(p[0], p[1], R * (0.35 + 0.6 * i / trace.length), 0, 7); g.fill(); });
  const tour = etat.ctx.tour, moi = etat.ctx.moi;
  balles.forEach((b, i) => {
    if (!b[3]) return;
    if (b[2]) { if (chute && chute.i === i) { const e = Math.max(0, now - chute.t) / 280; if (e < 1) dessinerBalle(g, a, h, h.trou[0], h.trou[1], i, 1 - e * 0.6, 1 - e * 0.45); } return; }
    dessinerBalle(g, a, h, b[0], b[1], i, anim || ORDRE[i] === tour ? 1 : 0.8);
  });
  let leve = false;
  if (!anim && !etat.ctx.fini && tour) {
    const i = ORDRE.indexOf(tour), b = balles[i];
    if (b && b[3] && !b[2]) {
      leve = Math.hypot(b[0] - h.trou[0], b[1] - h.trou[1]) < 80;
      g.save(); g.strokeStyle = COUL_J[i]; g.globalAlpha = 0.5 + 0.35 * Math.sin(now / 220); g.lineWidth = 2; g.beginPath(); g.arc(b[0], b[1], R + 6 + Math.sin(now / 220) * 1.5, 0, 7); g.stroke(); g.restore();
      if (visee && tour === moi) dessinerVisee(g, a, { x: b[0], y: b[1] }, horloge);
    }
  }
  g.setTransform(1, 0, 0, 1, sx, sy); g.drawImage(C.L.toits, 0, 0); g.setTransform(vue.k, 0, 0, vue.k, vue.ox + sx, vue.oy + sy);
  dessinerPales(g, a, h, horloge); dessinerDecorAnime(g, a, horloge); dessinerDrapeau(g, a, h, horloge, leve); dessinerParticules(g, true);
}
function evenement(e, h) {
  const a = C.a; SONS[e.type] && SONS[e.type](e.f ?? 0.5);
  if (e.type === 'mur' || e.type === 'pierre' || e.type === 'mobile') { if (e.f > 0.25) { secousse = Math.max(secousse, e.f * 0.6); gerbe('poussiere', e.x, e.y, Math.round(e.f * 8), { v: 50, vie: 0.4, taille: 2.4, c: [a.neon ? '#ff3cac' : 'rgba(255,255,255,.7)'] }); } }
  if (e.type === 'bumper') { flash[e.idx] = 1; secousse = Math.max(secousse, 0.5 + e.f * 0.5); gerbe('etincelle', e.x, e.y, 12, { v: 140, vie: 0.35, taille: 2.2, c: [a.bumper[1], '#ffffff'] }); }
  if (e.type === 'sable') gerbe('poussiere', e.x, e.y, Math.round(8 + e.f * 18), { v: 70, vie: 0.7, taille: 3, c: [a.sable[1], a.sable[2]] });
  if (e.type === 'eau') { gerbe('goutte', e.x, e.y, 22, { v: 120, vie: 0.6, taille: 2.6, c: [a.eau[2], '#ffffff'] }); for (let i = 0; i < 3; i++) particule({ type: 'anneau', x: e.x, y: e.y, vx: 0, vy: 0, vie: 0.9 + i * 0.3, taille: 4 + i * 6, c: 'rgba(255,255,255,.75)' }); }
  if (e.type === 'tuyau' || e.type === 'sortie') gerbe('poussiere', e.x, e.y, 10, { v: 60, vie: 0.5, taille: 2.6, c: ['rgba(255,255,255,.6)'] });
  if (e.type === 'choc') gerbe('etincelle', e.x, e.y, 6, { v: 80, vie: 0.25, taille: 1.8 });
  if (e.type === 'trou') { chute = { i: e.balle, t: performance.now() }; particule({ type: 'anneau', x: h.trou[0], y: h.trou[1], vx: 0, vy: 0, vie: 0.6, taille: R_TROU, c: a.neon ? '#b6ff3a' : 'rgba(255,255,255,.9)' }); }
}

export function monter(canvas, callbacks) {
  cv = canvas; g = cv.getContext('2d'); io = callbacks; etat = null; anim = null; enAttente = null; dernierVu = undefined; attendu = null; pauseTrou = false; C = null; parts = [];
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); addEventListener('keydown', onKey);
  ro = new ResizeObserver(() => { C = null; }); ro.observe(cv);
  raf = requestAnimationFrame(boucle);
}
export function demonter() {
  cancelAnimationFrame(raf); ro?.disconnect(); changementTrou++;
  if (cv) { cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerup', onUp); }
  removeEventListener('keydown', onKey); cv = null; g = null; io = null; etat = null; anim = null; C = null;
}
export const reglerSon = (b) => { son = b; if (b) ton(600, 800, 0.08, 0.08); };
export const enAnimation = () => !!anim;
export const AMBIANCES = Object.fromEntries(Object.entries(AMB).map(([k, a]) => [k, a.l]));
