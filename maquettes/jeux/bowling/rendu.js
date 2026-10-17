// =====================================================================================
// Bowling Gearbox — RENDU 3D (prototype v2). three.js 0.160, modules ES natifs, aucun build.
// Contrat : CONTRAT.md. Repère three.js : y en haut, z le long de la piste (0 = ligne de faute,
// quille 1 à 18,29 m), x POSITIF = GAUCHE du joueur (la caméra regarde vers +z).
// Ce module ne simule rien : il affiche les images de physique.js et anime tout le reste
// (joueur façon Mii, décors Bony auto-mobile / Grève CGT, caméra, effets).
//
// Techniques : environnement PMREM aux couleurs du thème (reflets des boules et quilles), piste
// vernie = bois procédural + reflet miroir (Reflector) mélangé par Fresnel dans un matériau
// physique, ombres douces limitées à deux lumières, tone mapping ACES + léger bloom sur les néons.
// Couche 0 = ce qui se reflète dans la piste (piste principale, quilles, boule, joueur, fond de
// piste, plafonniers) ; couche 1 = décor (non reflété : économise la seconde passe).
// =====================================================================================
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
// cgt.js importé avec le suffixe de version de ce module (le serveur de maquettes ne coupe pas le cache : un cgt.js
// périmé en cache cassait le chargement quand ses exports changent)
const { SLOGANS, PANCARTES, ANNONCES: ANNONCES_CGT } = await import('./cgt.js' + new URL(import.meta.url).search);

/* =====================================================================================
   CONSTANTES
   ===================================================================================== */
// Dimensions alignées sur DIMENSIONS de physique.js (la physique fait foi, 17/10/2026) : fin de l'aire (fosse) 19,158,
// rideau 19,92, fosse 0,35 m sous la piste, gouttières en arc de 0,235 × 0,0476 m, murs de l'aire (kickbacks) 17,2 → rideau.
const P = { demi: 0.527, gout: 0.235, profGout: 0.0476, pas: 1.724, zQ1: 18.29, rang: 0.264, ecart: 0.3048, hQ: 0.381, rB: 0.1085, zFin: 19.158, zFond: 19.92, profFosse: 0.35, zMurs: 17.2, zMasque: 17.55, zElan: -4.6 };
const C = { orange: '#f75632', violet: '#8f12ab', nuit: '#293f74', noir: '#000000', rouge: '#e3001b', rougeLogo: '#d20012' };
const COUCHE_DECOR = 1;
const X_MUR = 8.75, Z_SALLE = -11.5, Y_PLAF = 4.4, NUM_PISTE = 7, Z_LACHER = 0.15; // z de la boule au lâcher dans physique.js
const VOISINES = [-4, -3, -2, -1, 1, 2, 3, 4];
const RATIO_LOGO = 67.67 / 239.62, RATIO_CGT = 270 / 212; // jamais déformés : on garde toujours ces rapports
const F_TITRE = 'Syncopate, "Arial Black", Arial, sans-serif', F_TEXTE = '"Albert Sans", Arial, sans-serif', F_MANIF = '"Bowlby One SC", Impact, "Arial Black", sans-serif';
const URL_POLICES = 'https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;600;800&family=Bowlby+One+SC&family=Syncopate:wght@700&display=swap';
// emplacements numérotés vus du joueur : 7 à gauche (x le plus grand), 10 à droite
const EMPLACEMENTS = [[1, 0, 0], [2, 1, 1], [3, -1, 1], [4, 2, 2], [5, 0, 2], [6, -2, 2], [7, 3, 3], [8, 1, 3], [9, -1, 3], [10, -3, 3]]
  .map(([n, c, r]) => ({ n, x: c * P.ecart / 2, z: P.zQ1 + r * P.rang, rot: 0 }));
// Le titre d'une annonce est TOUJOURS le terme de bowling (Théo, 17/10/2026) ; en CGT, la blague va en sous-titre et
// vient de cgt.js (ANNONCES). jeu.js pilote l'écran avec R.annonce(titre, sous) ; ces titres ne servent que par défaut.
const ANNONCES = {
  bony: { strike: 'strike !', spare: 'spare !', gouttiere: 'gouttière', turkey: 'turkey !' },
  cgt: Object.fromEntries(Object.entries(ANNONCES_CGT).filter(([, a]) => a.titre).map(([k, a]) => [k, a.titre])),
};
const U_TEMPS = { value: 0 }; // horloge partagée par les shaders (drapeaux, banderoles)

/* =====================================================================================
   OUTILS
   ===================================================================================== */
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lisse = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
function graine(s) { s = (s >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function toile(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
let ANISO = 4;
function texture(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.lineaire ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  if (o.repete) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (o.flipY === false) t.flipY = false;
  return t;
}
function degrade(x, x0, y0, x1, y1, arrets) { const g = x.createLinearGradient(x0, y0, x1, y1); arrets.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
const DEG = [[0, C.orange], [1, C.violet]]; // dégradé identitaire, angle 0° : orange à gauche, violet à droite
function melange(a, b, t) { return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString(); }
function logo(x, img, cx, cy, l, ratio = RATIO_LOGO) { if (img) x.drawImage(img, cx - l / 2, cy - l * ratio / 2, l, l * ratio); }
function texteAjuste(x, txt, cx, cy, lMax, police, taille) {
  let t = taille; x.font = police.replace('{t}', t);
  while (x.measureText(txt).width > lMax && t > 8) { t -= 2; x.font = police.replace('{t}', t); }
  x.fillText(txt, cx, cy); return t;
}
function profilLisse(pts, n) {
  const c = new THREE.SplineCurve(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  return c.getPoints(n).map((v) => new THREE.Vector2(Math.max(0, v.x), v.y));
}
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _col = new THREE.Color();
function compo(out, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) { _e.set(rx, ry, rz); _q.setFromEuler(_e); return out.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz)); }
const _M = new THREE.Matrix4();
/** InstancedMesh statique : liste d'objets {x,y,z,rx,ry,rz,sx,sy,sz,c} */
function instances(geo, mat, liste) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, liste.length));
  liste.forEach((o, i) => {
    compo(_M, o.x || 0, o.y || 0, o.z || 0, o.rx || 0, o.ry || 0, o.rz || 0, o.sx ?? 1, o.sy ?? o.sx ?? 1, o.sz ?? o.sx ?? 1);
    im.setMatrixAt(i, _M); if (o.c) im.setColorAt(i, _col.set(o.c));
  });
  im.count = liste.length; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  return im;
}
/** plan horizontal (normale +y) en coordonnées monde, UV : u le long de x, v le long de z */
function planSol(x0, x1, z0, z1, y = 0) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x0) / (x1 - x0), (pos.getZ(i) - z0) / (z1 - z0));
  return g;
}
/** boîte à couleurs de sommets en dégradé le long d'un axe (néons) */
function bandeauDegrade(longueur, ep, haut, axe, c0, c1, segs = 32) {
  const g = new THREE.BoxGeometry(axe === 'x' ? longueur : ep, haut, axe === 'z' ? longueur : ep, axe === 'x' ? segs : 1, 1, axe === 'z' ? segs : 1);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), a = new THREE.Color(c0), b = new THREE.Color(c1), t = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { const v = (axe === 'x' ? pos.getX(i) : pos.getZ(i)) / longueur + 0.5; t.copy(a).lerp(b, v); col.set([t.r, t.g, t.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
function chargerImage(nom) {
  return new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = new URL('./assets/' + nom, import.meta.url).href; });
}
async function chargerPolices() {
  try {
    if (!document.querySelector('link[data-polices-bowling]') && ![...document.styleSheets].some((s) => (s.href || '').includes('Syncopate'))) {
      const lien = document.createElement('link'); lien.rel = 'stylesheet'; lien.href = URL_POLICES; lien.dataset.policesBowling = '1';
      const charge = new Promise((ok) => { lien.onload = ok; lien.onerror = ok; });
      document.head.appendChild(lien); await Promise.race([charge, attendre(3000)]);
    }
    const voulues = ['700 64px Syncopate', '400 64px "Albert Sans"', '800 64px "Albert Sans"', '64px "Bowlby One SC"'];
    await Promise.race([Promise.all(voulues.map((f) => document.fonts.load(f, 'AaÈéÀ0!'))), attendre(3500)]);
  } catch { /* polices de substitution (Arial) */ }
}

/* =====================================================================================
   BRUIT 3D (marbrure de la boule, sans couture sur la sphère)
   ===================================================================================== */
function creerBruit(seed) {
  const r = graine(seed), p = new Uint8Array(512), perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const f = (t) => t * t * (3 - 2 * t), l = (a, c, t) => a + (c - a) * t;
  const b = (x, y, z) => {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), u = f(x - X), v = f(y - Y), w = f(z - Z), xi = X & 255, yi = Y & 255, zi = Z & 255;
    const h = (i, j, k) => p[p[p[xi + i] + yi + j] + zi + k] / 255;
    return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v), l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
  };
  return (x, y, z, oct = 4) => { let s = 0, a = 0.5, fr = 1, n = 0; for (let o = 0; o < oct; o++) { s += a * b(x * fr, y * fr, z * fr); n += a; a *= 0.5; fr *= 2.03; } return s / n; };
}

/* =====================================================================================
   TEXTURES PROCÉDURALES
   ===================================================================================== */
/** bois de piste : planches dans la longueur (canvas y = z), érable aux extrémités, pin au milieu (joints en dents de scie) */
function boisBase(W, H, longueur, nbPlanches, seed, epissures) {
  const c = toile(W, H), x = c.getContext('2d'), lp = W / nbPlanches, pxm = H / longueur, rnd = graine(seed);
  for (let i = 0; i < nbPlanches; i++) {
    const t = rnd(), x0 = Math.floor(i * lp), lw = Math.ceil(lp) + 1;
    x.fillStyle = `hsl(${33 + t * 5}, ${50 + t * 10}%, ${76 - t * 7}%)`; x.fillRect(x0, 0, lw, H);
    if (epissures) {
      const z0 = epissures[0] + (i % 2 ? 0 : 0.3), z1 = epissures[1] + (i % 2 ? 0.3 : 0);
      x.fillStyle = `hsl(${27 + t * 6}, ${55 + t * 8}%, ${66 - t * 7}%)`; x.fillRect(x0, z0 * pxm, lw, (z1 - z0) * pxm);
    }
    for (let k = 0; k < 8; k++) { // fil du bois
      x.strokeStyle = `rgba(${105 + rnd() * 40}, ${58 + rnd() * 30}, 24, ${0.05 + rnd() * 0.1})`; x.lineWidth = 0.6 + rnd() * 1.1;
      const bx = i * lp + 1 + rnd() * (lp - 2), ph = rnd() * 6, amp = rnd() * 1.3;
      x.beginPath(); for (let y = 0; y <= H; y += 48) x.lineTo(bx + Math.sin(y / 260 + ph) * amp, y); x.stroke();
    }
    for (let y = rnd() * 2.4 * pxm; y < H; y += (1.8 + rnd() * 1.6) * pxm) { x.fillStyle = 'rgba(95,55,22,.28)'; x.fillRect(x0, y, lw, 1); } // bouts de planches
  }
  x.fillStyle = 'rgba(90,50,20,.32)'; for (let i = 1; i < nbPlanches; i++) x.fillRect(Math.round(i * lp), 0, 1, H);
  for (let k = 0; k < 14000; k++) { x.fillStyle = rnd() < 0.55 ? 'rgba(120,70,30,.10)' : 'rgba(255,244,220,.10)'; x.fillRect(rnd() * W, rnd() * H, 1 + rnd(), 1 + rnd() * 7); }
  return c;
}
function marquagesPiste(x, W, H, theme) {
  const pxm = H / P.zFin, pxx = W / (2 * P.demi), lp = W / 39;
  const cx = (pl) => (pl - 0.5) * lp; // planche 1 = bord droit du joueur (x négatif)
  const coul = (pl) => theme === 'cgt' ? C.rouge : melange(C.violet, C.orange, (pl - 1) / 38); // orange à l'écran à gauche
  const point = (px, pz, r, c) => { x.fillStyle = c; x.beginPath(); x.ellipse(px, pz, r * pxx, r * pxm, 0, 0, 7); x.fill(); };
  x.fillStyle = theme === 'cgt' ? C.rouge : C.nuit; x.fillRect(0, 0, W, 0.03 * pxm); // ligne de faute
  for (const pl of [3, 5, 8, 11, 14, 26, 29, 32, 35, 37]) point(cx(pl), 2.13 * pxm, 0.012, theme === 'cgt' ? '#7a0010' : C.nuit);
  for (const [pl, zp] of [[5, 3.96], [10, 4.27], [15, 4.57], [20, 4.88], [25, 4.57], [30, 4.27], [35, 3.96]]) {
    x.fillStyle = coul(pl); x.beginPath();
    x.moveTo(cx(pl), zp * pxm); x.lineTo(cx(pl) - lp * 0.62, (zp - 0.19) * pxm); x.lineTo(cx(pl), (zp - 0.13) * pxm); x.lineTo(cx(pl) + lp * 0.62, (zp - 0.19) * pxm);
    x.closePath(); x.fill();
  }
  x.fillStyle = 'rgba(60,35,15,.45)'; for (const pl of [10, 30]) x.fillRect(cx(pl) - 1, 10.36 * pxm, 2, 1.83 * pxm); // repères de distance
  for (const e of EMPLACEMENTS) point((e.x + P.demi) * pxx, e.z * pxm, 0.022, 'rgba(70,40,18,.55)');
}
function textureElan(theme, base) {
  const W = base.width, H = base.height, c = toile(W, H), x = c.getContext('2d'); x.drawImage(base, 0, 0);
  const pxm = H / (0 - P.zElan), pxx = W / P.pas, zc = (z) => (z - P.zElan) * pxm, xc = (xx) => (xx + P.pas / 2) * pxx;
  const pc = theme === 'cgt' ? '#7a0010' : C.nuit;
  const point = (px, pz, r) => { x.fillStyle = pc; x.beginPath(); x.ellipse(px, pz, r * pxx, r * pxm, 0, 0, 7); x.fill(); };
  for (const zz of [-3.66, -4.57, -0.12]) for (const b of [-0.4, -0.27, -0.14, 0, 0.14, 0.27, 0.4]) point(xc(b), zc(zz), zz > -1 ? 0.008 : 0.013);
  x.fillStyle = theme === 'cgt' ? C.rouge : C.nuit; x.fillRect(xc(-P.demi - P.gout), H - 0.03 * pxm, (2 * (P.demi + P.gout)) * pxx, 0.03 * pxm);
  return c;
}
function textureQuille(theme) {
  const H = 512, c = toile(4, H), x = c.getContext('2d');
  x.fillStyle = '#fbfaf6'; x.fillRect(0, 0, 4, H);
  const bande = (h0, h1, coul) => { x.fillStyle = coul; x.fillRect(0, (1 - h1 / P.hQ) * H, 4, (h1 - h0) / P.hQ * H); };
  if (theme === 'cgt') { bande(0.258, 0.271, C.rouge); bande(0.279, 0.292, C.rouge); } else { bande(0.258, 0.271, C.orange); bande(0.279, 0.292, C.violet); }
  return texture(c);
}
/** boule marbrée (équirectangulaire, bruit 3D sur la sphère → aucune couture), trous des doigts en u = 0,25 (axe +z local) */
function textureBoule(theme, IMG) {
  const W = 768, H = 384, c = toile(W, H), x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data, n = creerBruit(theme === 'cgt' ? 77 : 31);
  const pal = theme === 'cgt' ? [[120, 0, 10], [228, 0, 27], [70, 0, 6], [255, 236, 236]] : [[247, 86, 50], [143, 18, 171], [30, 44, 92], [255, 236, 226]];
  for (let j = 0; j < H; j++) {
    const th = (j + 0.5) / H * Math.PI, sy = Math.cos(th) * 1.7, sr = Math.sin(th) * 1.7;
    for (let i = 0; i < W; i++) {
      const ph = (i + 0.5) / W * Math.PI * 2, px = sr * Math.cos(ph), pz = sr * Math.sin(ph);
      const w = n(px + 5.2, sy, pz, 3), v = n(px + w * 2.4, sy + w * 2.1, pz - w * 1.9, 4);
      const m = lisse((v - 0.32) / 0.36);
      let r = lerp(pal[0][0], pal[1][0], m), g = lerp(pal[0][1], pal[1][1], m), bb = lerp(pal[0][2], pal[1][2], m);
      const veine = Math.pow(1 - Math.abs(Math.sin((v * 9 + sy * 0.8) * Math.PI)), 7) * 0.85;
      r = lerp(r, pal[2][0], veine); g = lerp(g, pal[2][1], veine); bb = lerp(bb, pal[2][2], veine);
      const eclat = Math.pow(1 - Math.abs(Math.sin(w * 13 * Math.PI)), 22) * (theme === 'cgt' ? 0.35 : 0.55);
      r = lerp(r, pal[3][0], eclat); g = lerp(g, pal[3][1], eclat); bb = lerp(bb, pal[3][2], eclat);
      const k = (j * W + i) * 4; d[k] = r; d[k + 1] = g; d[k + 2] = bb; d[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const trou = (cx, cy, r) => {
    const g = x.createRadialGradient(cx, cy - 1, r * 0.15, cx, cy, r * 1.3);
    g.addColorStop(0, '#000'); g.addColorStop(0.72, '#0a0a0a'); g.addColorStop(0.8, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r * 1.3, 0, 7); x.fill();
  };
  trou(W * 0.25 - 15, H * 0.43, 11); trou(W * 0.25 + 15, H * 0.43, 11); trou(W * 0.25, H * 0.64, 13);
  if (theme === 'cgt') logo(x, IMG.cgt, W * 0.75, H * 0.5, 74, RATIO_CGT);
  else logo(x, IMG.blanc, W * 0.75, H * 0.5, 150);
  return texture(c);
}
function textureTache() { // ombre de contact douce
  const c = toile(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,.85)'); g.addColorStop(0.45, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return texture(c);
}
function textureMoquette(theme) {
  const S = 512, c = toile(S, S), x = c.getContext('2d'), rnd = graine(theme === 'cgt' ? 9 : 4);
  x.fillStyle = theme === 'cgt' ? '#2a2b30' : '#1c2850'; x.fillRect(0, 0, S, S);
  for (let k = 0; k < 9000; k++) { x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.12)'; x.fillRect(rnd() * S, rnd() * S, 2, 2); }
  const coul = theme === 'cgt' ? ['#a3121e', '#5b5d63', '#7d1018'] : [C.orange, C.violet, '#4f6fc2', '#c4479e'];
  x.lineCap = 'round';
  for (let k = 0; k < 16; k++) { // « routes » courbes, en rappel du monogramme
    const x0 = rnd() * S, y0 = rnd() * S, r = 40 + rnd() * 110, a0 = rnd() * 6.28;
    x.strokeStyle = coul[k % coul.length]; x.lineWidth = 3 + rnd() * 5; x.globalAlpha = 0.75;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { x.beginPath(); x.arc(x0 + dx, y0 + dy, r, a0, a0 + 1.4 + rnd() * 1.4); x.stroke(); }
  }
  x.globalAlpha = 1;
  for (let k = 0; k < 60; k++) { x.fillStyle = coul[k % coul.length]; x.beginPath(); x.arc(rnd() * S, rnd() * S, 2 + rnd() * 3, 0, 7); x.fill(); }
  const t = texture(c, { repete: true }); t.repeat.set(6, 3); return t;
}

/* =====================================================================================
   GÉOMÉTRIES
   ===================================================================================== */
function geometrieQuille() { // profil réglementaire lissé (rayon, hauteur en m)
  const pts = [[0.0258, 0], [0.031, 0.006], [0.042, 0.035], [0.054, 0.075], [0.0605, 0.114], [0.058, 0.15], [0.049, 0.19], [0.035, 0.225], [0.0238, 0.25], [0.0228, 0.262], [0.026, 0.29], [0.0312, 0.322], [0.0323, 0.343], [0.029, 0.364], [0.02, 0.376], [0.008, 0.3805]];
  const p = [new THREE.Vector2(0, 0), ...profilLisse(pts, 40), new THREE.Vector2(0, P.hQ)];
  const g = new THREE.LatheGeometry(p, 24);
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setY(i, pos.getY(i) / P.hQ);
  return g;
}
function geoGouttiere(longueur) { // arc de cercle ouvert vers le haut (même profil que physique.js), axe le long de z
  const c = P.gout / 2, s = P.profGout, r = (c * c + s * s) / (2 * s), th = Math.atan2(c, r - s);
  const g = new THREE.CylinderGeometry(r, r, longueur, 16, 1, true, -th, 2 * th);
  g.rotateX(Math.PI / 2); g.translate(0, r - s, 0); return g;
}
function geoVauban() {
  const parts = [], tube = (x0, y0, x1, y1, r = 0.017) => {
    const l = Math.hypot(x1 - x0, y1 - y0), g = new THREE.CylinderGeometry(r, r, l, 6);
    g.rotateZ(-Math.atan2(x1 - x0, y1 - y0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0); parts.push(g);
  };
  tube(-1, 0.06, -1, 1.1, 0.022); tube(1, 0.06, 1, 1.1, 0.022); tube(-1, 1.08, 1, 1.08, 0.022); tube(-1, 0.22, 1, 0.22, 0.02);
  for (let i = 1; i < 14; i++) { const xx = -1 + i * 2 / 14; tube(xx, 0.22, xx, 1.08, 0.011); }
  for (const xx of [-0.92, 0.92]) { const p = new THREE.BoxGeometry(0.05, 0.03, 0.6); p.translate(xx, 0.03, 0); parts.push(p); }
  return mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g));
}

/* =====================================================================================
   PERSONNAGES FAÇON MII
   ===================================================================================== */
const MAT_NOIR = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.25 });
const MAT_BLANC = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const MAT_BOUCHE = new THREE.MeshStandardMaterial({ color: '#5a1e1e', roughness: 0.5 });
let MAT_CHAS = null, GM = null;
function matChasuble(IMG) { // chasuble rouge à bande blanche, logo CGT dans le dos
  if (MAT_CHAS) return MAT_CHAS;
  const W = 256, H = 128, c = toile(W, H), x = c.getContext('2d');
  x.fillStyle = C.rouge; x.fillRect(0, 0, W, H);
  x.fillStyle = '#f4f4f4'; x.fillRect(0, H * 0.3, W, H * 0.13);
  x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(0, H * 0.3 + 3, W, 2); x.fillRect(0, H * 0.43 - 5, W, 2);
  if (IMG?.cgt) { const h = 30, l = h / RATIO_CGT * 1.35; for (const cx of [0, W]) x.drawImage(IMG.cgt, cx - l / 2, H * 0.6, l, h); }
  MAT_CHAS = new THREE.MeshStandardMaterial({ map: texture(c), roughness: 0.6, side: THREE.DoubleSide });
  return MAT_CHAS;
}
function geoMii() {
  if (GM) return GM;
  const capsule = (r, l) => { const g = new THREE.CapsuleGeometry(r, l, 4, 12); g.translate(0, -l / 2, 0); return g; };
  const lathe = (pts, n, seg) => new THREE.LatheGeometry(profilLisse(pts, n), seg, Math.PI);
  const chaussure = new THREE.SphereGeometry(0.07, 14, 10); chaussure.scale(0.85, 0.55, 1.55);
  const meche = new THREE.SphereGeometry(0.2, 18, 10); meche.scale(0.95, 0.42, 0.55);
  const longs = new THREE.SphereGeometry(0.2, 18, 12); longs.scale(1.02, 1.45, 0.62);
  const visiere = new THREE.CylinderGeometry(0.16, 0.16, 0.012, 20, 1, false, -Math.PI / 2, Math.PI); visiere.scale(1, 1, 0.8);
  GM = {
    corps: lathe([[0, 0], [0.15, 0.004], [0.193, 0.07], [0.203, 0.18], [0.194, 0.31], [0.174, 0.41], [0.13, 0.49], [0.06, 0.528], [0, 0.535]], 26, 28),
    chasuble: lathe([[0.172, 0.02], [0.21, 0.075], [0.219, 0.18], [0.21, 0.31], [0.19, 0.41], [0.152, 0.468]], 16, 28),
    tete: new THREE.SphereGeometry(0.2, 32, 24),
    cheveux: new THREE.SphereGeometry(0.213, 32, 16, 0, Math.PI * 2, 0, 1.3),
    oeil: new THREE.SphereGeometry(0.026, 14, 10), reflet: new THREE.SphereGeometry(0.0075, 8, 6),
    sourcil: new THREE.CapsuleGeometry(0.0085, 0.045, 3, 6), nez: new THREE.SphereGeometry(0.024, 12, 8),
    bouche: new THREE.TorusGeometry(0.038, 0.0075, 6, 16, Math.PI), boucheO: new THREE.SphereGeometry(0.03, 12, 8),
    oreille: new THREE.SphereGeometry(0.038, 12, 8),
    bras: capsule(0.05, 0.25), avantBras: capsule(0.044, 0.22), brasEntier: capsule(0.048, 0.47),
    main: new THREE.SphereGeometry(0.056, 14, 10),
    cuisse: capsule(0.075, 0.38), mollet: capsule(0.064, 0.36), chaussure,
    chignon: new THREE.SphereGeometry(0.085, 16, 12), meche, longs, visiere,
  };
  return GM;
}
/** construit un Mii articulé ; o : { peau, cheveux, coiffure, haut, manche, bas, chaussures, texHaut, chasuble, ombre } */
function creerMii(o = {}, IMG) {
  const g = geoMii();
  const std = (c, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const M = { peau: std(o.peau || '#f2c7a2', 0.55), haut: std(o.haut || '#3b6fd8', 0.62), manche: std(o.manche || o.haut || '#3b6fd8', 0.62), bas: std(o.bas || '#2b3446', 0.72), cheveux: std(o.cheveux || '#3a2416', 0.5), chaussure: std(o.chaussures || '#202838', 0.42) };
  if (o.texHaut) { M.haut.map = o.texHaut; M.haut.color.set('#ffffff'); }
  const m = { M, racine: new THREE.Group(), base: { x: 0, z: 0, lacet: 0 }, yeux: [], reflets: [], sourcils: [] };
  const grp = (parent, x = 0, y = 0, z = 0) => { const gg = new THREE.Group(); gg.position.set(x, y, z); parent.add(gg); return gg; };
  const maille = (geo, mat, parent, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.castShadow = !!o.ombre; parent.add(me); return me; };
  m.bassin = grp(m.racine, 0, 0.8, 0);
  for (const [k, s] of [['D', -1], ['G', 1]]) {
    const h = grp(m.bassin, 0.095 * s, 0, 0); maille(g.cuisse, M.bas, h);
    const ge = grp(h, 0, -0.38, 0); maille(g.mollet, M.bas, ge);
    const pi = grp(ge, 0, -0.36, 0); maille(g.chaussure, M.chaussure, pi, 0, -0.02, 0.045);
    m['hanche' + k] = h; m['genou' + k] = ge; m['pied' + k] = pi;
  }
  m.torse = grp(m.bassin, 0, -0.03, 0);
  maille(g.corps, M.haut, m.torse);
  m.chasuble = maille(g.chasuble, matChasuble(IMG), m.torse); m.chasuble.visible = !!o.chasuble;
  for (const [k, s] of [['D', -1], ['G', 1]]) {
    const e = grp(m.torse, 0.2 * s, 0.43, 0); maille(g.bras, M.manche, e);
    const co = grp(e, 0, -0.25, 0); maille(g.avantBras, M.peau, co);
    const ma = grp(co, 0, -0.225, 0); maille(g.main, M.peau, ma, 0, -0.035, 0.005);
    m['epaule' + k] = e; m['coude' + k] = co; m['main' + k] = ma;
  }
  m.prise = grp(m.mainD, 0, -0.08, 0.095); // centre de la boule tenue (doigts dans les trous)
  m.tete = grp(m.torse, 0, 0.5, 0);
  const t = grp(m.tete, 0, 0.2, 0); m.visage = t;
  maille(g.tete, M.peau, t).scale.set(1, 1.04, 0.97);
  const coiffure = o.coiffure || 'court';
  if (coiffure !== 'casquette') { const ch = maille(g.cheveux, M.cheveux, t); ch.rotation.x = -0.42; }
  if (coiffure === 'frange') { const f = maille(g.meche, M.cheveux, t, 0.03, 0.12, 0.09); f.rotation.set(0.5, 0, -0.25); }
  if (coiffure === 'chignon') maille(g.chignon, M.cheveux, t, 0, 0.17, -0.13);
  if (coiffure === 'longs') maille(g.longs, M.cheveux, t, 0, -0.09, -0.08);
  if (coiffure === 'casquette') {
    const mc = std(o.casquette || C.rouge, 0.5); const cap = maille(g.cheveux, mc, t, 0, 0.012, 0); cap.rotation.x = -0.2; cap.scale.setScalar(1.02);
    const v = maille(g.visiere, mc, t, 0, 0.1, 0.13); v.rotation.x = 0.12;
  }
  for (const s of [-1, 1]) {
    const oe = maille(g.oeil, MAT_NOIR, t, 0.068 * s, 0.02, 0.172); oe.scale.set(0.72, 1.25, 0.55); oe.castShadow = false; m.yeux.push(oe);
    const re = maille(g.reflet, MAT_BLANC, t, 0.068 * s + 0.007, 0.036, 0.187); re.castShadow = false; m.reflets.push(re);
    const so = maille(g.sourcil, M.cheveux, t, 0.07 * s, 0.098, 0.158); so.rotation.z = Math.PI / 2; so.castShadow = false; m.sourcils.push(so);
    maille(g.oreille, M.peau, t, 0.196 * s, -0.005, 0).scale.set(0.6, 1, 0.8);
  }
  maille(g.nez, M.peau, t, 0, -0.012, 0.19).castShadow = false;
  m.bouche = maille(g.bouche, MAT_BOUCHE, t, 0, -0.07, 0.171); m.bouche.castShadow = false;
  m.boucheO = maille(g.boucheO, MAT_BOUCHE, t, 0, -0.088, 0.168); m.boucheO.scale.set(1.1, 0.7, 0.45); m.boucheO.visible = false;
  return m;
}
function poseNeutre() {
  return { avance: 0, hauteur: 0, lacet: 0, torseX: 0.04, torseY: 0, torseZ: 0, teteX: 0, teteY: 0, teteZ: 0,
    epDx: 0.05, epDy: 0, epDz: -0.1, coudeD: -0.15, poignetD: 0, epGx: 0.05, epGy: 0, epGz: 0.1, coudeG: -0.15, poignetG: 0,
    hDx: 0, hDz: 0, gD: 0.05, pD: 0, hGx: 0, hGz: 0, gG: 0.05, pG: 0, joie: 0, tristesse: 0, yeux: 1, bouche: 0.3 };
}
function melangerPoses(a, b, t) { const p = {}; for (const k in a) p[k] = lerp(a[k], b[k], t); return p; }
function exprimer(m, p) {
  m.sourcils.forEach((s, i) => { const c = i === 0 ? 1 : -1; s.position.y = 0.098 + p.joie * 0.014 - p.tristesse * 0.004; s.rotation.z = Math.PI / 2 + c * (p.tristesse * 0.5 - p.joie * 0.12); });
  const ouv = Math.max(0.1, p.yeux);
  m.yeux.forEach((e) => { e.scale.y = 1.25 * ouv; });
  m.reflets.forEach((r) => { r.visible = ouv > 0.55; });
  if (p.bouche >= 0) { m.bouche.rotation.set(-0.35, 0, Math.PI); m.bouche.position.y = -0.07; m.bouche.scale.set(1, clamp(0.35 + p.bouche * 0.65, 0.3, 1), 1); }
  else { m.bouche.rotation.set(0.2, 0, 0); m.bouche.position.y = -0.105; m.bouche.scale.set(0.8, clamp(0.3 - p.bouche * 0.5, 0.3, 0.9), 1); }
  m.boucheO.visible = p.bouche > 1.05; m.boucheO.scale.y = 0.45 + clamp(p.bouche - 1, 0, 1) * 0.5;
}
function poser(m, p) {
  const ca = Math.cos(m.base.lacet), sa = Math.sin(m.base.lacet);
  m.racine.position.set(m.base.x + sa * p.avance, 0, m.base.z + ca * p.avance);
  m.racine.rotation.y = m.base.lacet + p.lacet;
  m.bassin.position.y = 0.8 + p.hauteur;
  m.torse.rotation.set(p.torseX, p.torseY, p.torseZ);
  m.tete.rotation.set(p.teteX, p.teteY, p.teteZ);
  m.epauleD.rotation.set(p.epDx, p.epDy, p.epDz); m.coudeD.rotation.set(p.coudeD, 0, 0); m.mainD.rotation.set(p.poignetD, 0, 0);
  m.epauleG.rotation.set(p.epGx, p.epGy, p.epGz); m.coudeG.rotation.set(p.coudeG, 0, 0); m.mainG.rotation.set(p.poignetG, 0, 0);
  m.hancheD.rotation.set(p.hDx, 0, p.hDz); m.genouD.rotation.x = p.gD; m.piedD.rotation.x = -(p.hDx + p.gD) * 0.9 + p.pD;
  m.hancheG.rotation.set(p.hGx, 0, p.hGz); m.genouG.rotation.x = p.gG; m.piedG.rotation.x = -(p.hGx + p.gG) * 0.9 + p.pG;
  exprimer(m, p);
}
// Élan en 4 pas sur un temps global g : approche = pas 1-2 (g 0→2), arrière = pas 3 (2→3),
// avant = pas 4 glissé + lâcher (3→4), suivi = accompagnement (4→5). Clés interpolées en Catmull-Rom.
const CLES = {
  avance: [[0, 0], [1, 0.72], [2, 1.56], [3, 2.5], [4, 3.42], [4.5, 3.47], [5, 3.48]],
  epDx: [[0, -0.32], [0.6, -0.85], [1.3, -0.3], [2, 0.45], [3, 1.55], [3.7, 0.55], [4, -0.25], [4.5, -1.55], [5, -2.3]],
  coudeD: [[0, -1.45], [0.6, -0.5], [1.3, -0.12], [2, -0.06], [3, -0.05], [4, -0.08], [4.5, -0.3], [5, -0.55]],
  epDz: [[0, 0.12], [0.6, 0.05], [2, -0.06], [3, -0.12], [4, 0.0], [5, 0.12]],
  epDy: [[0, -0.1], [1, 0], [5, 0]],
  epGx: [[0, -0.42], [0.6, -0.65], [1.5, -0.25], [3, -0.35], [4, -0.45], [5, -0.4]],
  epGz: [[0, -0.42], [0.6, -0.25], [1.5, 0.35], [3, 0.95], [4, 1.1], [5, 1.05]],
  epGy: [[0, 0.35], [0.6, 0.2], [1.5, 0], [5, 0]],
  coudeG: [[0, -1.25], [0.6, -0.7], [1.5, -0.3], [3, -0.25], [5, -0.3]],
  torseX: [[0, 0.12], [1, 0.18], [2, 0.26], [3, 0.42], [4, 0.58], [5, 0.52]],
  torseY: [[0, 0], [2, -0.06], [3, -0.25], [3.8, 0], [4, 0.06], [5, 0.15]],
  hauteur: [[0, -0.015], [2, -0.03], [3, -0.06], [3.5, -0.16], [4, -0.24], [5, -0.22]],
};
function cle(tab, g) {
  const n = tab.length; if (g <= tab[0][0]) return tab[0][1]; if (g >= tab[n - 1][0]) return tab[n - 1][1];
  let i = 0; while (g > tab[i + 1][0]) i++;
  const p0 = tab[Math.max(0, i - 1)], p1 = tab[i], p2 = tab[i + 1], p3 = tab[Math.min(n - 1, i + 2)], dx = p2[0] - p1[0], u = (g - p1[0]) / dx;
  const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * dx, m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * dx, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
}
const FIN_ELAN = cle(CLES.avance, 5);
function jambesElan(p, g) {
  const A = 0.42;
  if (g >= 4) { const s = clamp(g - 4, 0, 1); p.hGx = -0.95; p.gG = 1.05; p.hDx = 0.8 + 0.2 * s; p.gD = 0.22 - 0.1 * s; p.hDz = 0.32 * lisse(s); p.pD = 0.55; return; }
  const k = Math.floor(g), u = g - k, e = lisse(u);
  if (k === 3) { p.hGx = lerp(A, -0.95, e); p.gG = lerp(0.12, 1.05, e); p.hDx = lerp(-A, 0.8, e); p.gD = lerp(0.1, 0.22, e) + Math.sin(Math.PI * u) * 0.25; p.pD = 0.55 * e; return; }
  const debut = k === 0 ? 0 : A, balance = lerp(debut, -A, e), genouB = 0.1 + Math.sin(Math.PI * u) * 0.7, appui = lerp(-debut, A, u);
  if (k % 2 === 0) { p.hDx = balance; p.gD = genouB; p.hGx = appui; p.gG = 0.1; } else { p.hGx = balance; p.gG = genouB; p.hDx = appui; p.gD = 0.1; }
}
const clignement = (t) => ((t % 3.7) < 0.12 ? 0.1 : 1);
function poseGlobale(g, temps) {
  const p = poseNeutre();
  for (const k in CLES) p[k] = cle(CLES[k], g);
  if (g < 3) p.hauteur -= Math.abs(Math.sin(Math.PI * g)) * 0.025;
  if (g <= 0) { const r = Math.sin(temps * 2.1); p.hauteur += r * 0.005; p.torseX += r * 0.014; p.epDx += r * 0.012; p.hDx = p.hGx = -0.05; p.gD = p.gG = 0.12; p.teteY = Math.sin(temps * 0.45) * 0.06; }
  else jambesElan(p, g);
  p.teteX = -p.torseX * 0.75; p.teteY += -p.torseY * 0.6;
  p.yeux = clignement(temps); p.bouche = g > 3.5 ? 0.05 : 0.25;
  return p;
}
const G_PHASE = (phase, t) => (phase === 'approche' ? 2 * t : phase === 'arriere' ? 2 + t : phase === 'avant' ? 3 + t : phase === 'suivi' ? 4 + t : 0);
function poseReaction(type, tau, temps) {
  const p = poseNeutre(); p.avance = FIN_ELAN; p.yeux = clignement(temps);
  const w = Math.sin(tau * 9), entree = lisse(tau / 0.35);
  if (type === 'strike') {
    const saut = tau < 2.6 ? Math.max(0, Math.sin(tau * 7.5)) * 0.11 : 0;
    p.hauteur = saut - (saut > 0.01 ? 0 : 0.03); p.gD = p.gG = saut > 0.01 ? 0.05 : 0.3; p.hDx = p.hGx = saut > 0.01 ? -0.05 : -0.2;
    p.epDx = -2.75 + w * 0.15; p.epDz = -0.45; p.epGx = -2.75 - w * 0.15; p.epGz = 0.45; p.coudeD = p.coudeG = -0.25;
    p.joie = 1; p.bouche = 1.7; p.yeux = 0.12; p.teteX = -0.15; p.torseX = -0.05;
  } else if (type === 'spare') {
    const pompe = Math.sin(tau * 10) * 0.5 + 0.5;
    p.epDx = lerp(-1.5, -0.55, pompe); p.coudeD = -2.2; p.epDz = -0.25; p.epGz = 0.25; p.epGx = 0.1;
    p.hauteur = -0.04 + pompe * 0.02; p.gD = p.gG = 0.18; p.joie = 0.8; p.bouche = 1.3; p.yeux = 0.6; p.torseX = 0.12;
  } else if (type === 'bon') {
    const cl = Math.sin(tau * 13);
    p.epDx = p.epGx = -0.95; p.coudeD = p.coudeG = -1.05; p.epDz = 0.32 + cl * 0.22; p.epGz = -0.32 - cl * 0.22; p.epDy = 0.3; p.epGy = -0.3;
    p.joie = 0.6; p.bouche = 0.9; p.teteX = Math.sin(tau * 5) * 0.06;
  } else if (type === 'rate') {
    p.epDx = -2.35; p.epDz = -0.95; p.coudeD = -2.05; p.epGx = -2.35; p.epGz = 0.95; p.coudeG = -2.05;
    p.teteY = Math.sin(tau * 3.2) * 0.3; p.tristesse = 0.7; p.bouche = -0.4; p.torseX = -0.06;
  } else { // gouttière : tête basse, épaules tombantes
    p.teteX = 0.5; p.teteY = Math.sin(tau * 1.6) * 0.18; p.torseX = 0.3; p.epDx = p.epGx = 0.12; p.epDz = -0.04; p.epGz = 0.04; p.coudeD = p.coudeG = -0.05;
    p.hauteur = -0.05; p.gD = p.gG = 0.2; p.hDx = p.hGx = -0.12; p.tristesse = 1; p.bouche = -1; p.yeux = Math.min(p.yeux, 0.55);
  }
  p.hauteur *= entree;
  return p;
}
function poseMarche(temps, avance) {
  const p = poseNeutre(), ph = temps * 6.2, s = Math.sin(ph);
  p.avance = avance; p.hDx = s * 0.36; p.hGx = -s * 0.36; p.gD = Math.max(0, -Math.cos(ph)) * 0.55 + 0.08; p.gG = Math.max(0, Math.cos(ph)) * 0.55 + 0.08;
  p.epDx = -s * 0.32; p.epGx = s * 0.32; p.epDz = -0.12; p.epGz = 0.12; p.coudeD = p.coudeG = -0.3;
  p.hauteur = -Math.abs(Math.cos(ph)) * 0.02; p.torseX = 0.06; p.yeux = clignement(temps); p.bouche = 0.4;
  return p;
}

/* =====================================================================================
   SHADER D'ONDULATION (drapeaux, banderoles) — normale recalculée pour garder du modelé
   ===================================================================================== */
function onduler(mat, { amp = 0.05, onde = 1.2, vit = 2.4, poids = 'x' } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTemps = U_TEMPS;
    const w = poids === 'x' ? 'uv.x' : '(0.35 + 0.65 * (1.0 - uv.y))', k = (onde * 6.2832).toFixed(4);
    sh.vertexShader = 'uniform float uTemps;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `
        #ifdef USE_INSTANCING
          float phO = instanceMatrix[3].x * 1.3 + instanceMatrix[3].z * 0.7;
        #else
          float phO = modelMatrix[3].x * 1.3 + modelMatrix[3].z * 0.7;
        #endif
        float poidsO = ${w};
        float argO = position.x * ${k} - uTemps * ${vit.toFixed(3)} + phO;
        float dzO = sin(argO) * ${amp.toFixed(4)} * poidsO;
        float penteO = cos(argO) * ${(amp * onde * 6.2832).toFixed(4)} * poidsO;
        vec3 objectNormal = normalize(vec3(-penteO, 0.0, 1.0));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position); transformed.z += dzO; transformed.y += sin(argO * 0.5 + 1.0) * ${(amp * 0.3).toFixed(4)} * poidsO;`);
  };
  mat.customProgramCacheKey = () => `onde-${amp}-${onde}-${vit}-${poids}`;
  return mat;
}

/* =====================================================================================
   CRÉATION DU RENDU
   ===================================================================================== */
export async function creerRendu(canvas, { theme = 'bony' } = {}) {
  await chargerPolices();
  const [logoCouleur, logoBlanc, logoCgt] = await Promise.all(['logo-bony-color.svg', 'logo-bony-white.svg', 'logo-cgt.svg'].map(chargerImage));
  const IMG = { couleur: logoCouleur, blanc: logoBlanc, cgt: logoCgt };

  /* ---------- moteur ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let ratioPixels = Math.min(window.devicePixelRatio || 1, 1.5), fReflet = 0.5;
  renderer.setPixelRatio(ratioPixels);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false; // compteurs cumulés sur toutes les passes d'une image (remis à zéro dans rendre)
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d1328');
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 90); camera.layers.enable(COUCHE_DECOR);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const etat = { theme: theme === 'cgt' ? 'cgt' : 'bony', temps: 0 };
  const surTheme = []; // fonctions (theme) => void appelées par setTheme
  const decor = (o) => { o.traverse((e) => e.layers.set(COUCHE_DECOR)); return o; };
  const std = (couleur, r = 0.6, m = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: couleur, roughness: r, metalness: m, ...extra });
  const neon = (c, k = 2.6) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) });
  const groupeBony = new THREE.Group(), groupeCgt = new THREE.Group();
  scene.add(groupeBony, groupeCgt);

  /* ---------- environnement (reflets) : une salle virtuelle aux couleurs du thème ---------- */
  const envs = {};
  function environnement(th) {
    if (envs[th]) return envs[th];
    const s = new THREE.Scene();
    const boite = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 40), new THREE.MeshBasicMaterial({ color: th === 'cgt' ? '#2a2326' : '#1d2645', side: THREE.BackSide }));
    boite.position.y = 4; s.add(boite);
    const panneau = (w, h, c, k, x, y, z, rx = 0, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m); };
    for (let z = -15; z <= 15; z += 5) for (let x = -9; x <= 9; x += 6) panneau(3.4, 0.7, '#ffffff', 7, x, 8.9, z, Math.PI / 2);
    const c1 = th === 'cgt' ? '#ff2a1a' : C.orange, c2 = th === 'cgt' ? '#ffffff' : C.violet;
    panneau(40, 0.9, c1, 3, 14.9, 2.5, 0, 0, -Math.PI / 2); panneau(40, 0.9, c2, 3, -14.9, 2.5, 0, 0, Math.PI / 2);
    panneau(30, 1.2, c2, 2.4, 0, 2.2, 19.9, 0, Math.PI); panneau(30, 1.2, c1, 2.4, 0, 2.2, -19.9);
    panneau(30, 40, '#9a6f45', 0.55, 0, -0.9, 0, -Math.PI / 2);
    envs[th] = pmrem.fromScene(s, 0.035).texture;
    return envs[th];
  }

  /* ---------- lumières ---------- */
  const hemi = new THREE.HemisphereLight('#e8eeff', '#7a5636', 0.85); scene.add(hemi);
  const soleil = new THREE.DirectionalLight('#fff4e6', 1.7);
  soleil.position.set(2.8, 8, 1.5); soleil.target.position.set(0, 0, -2.2);
  soleil.castShadow = true; soleil.shadow.mapSize.set(1024, 1024);
  Object.assign(soleil.shadow.camera, { left: -2.6, right: 2.6, top: 3.2, bottom: -3.2, near: 1, far: 16 });
  soleil.shadow.bias = -0.0004; soleil.shadow.normalBias = 0.02;
  scene.add(soleil, soleil.target);
  const spot = new THREE.SpotLight('#fff8ee', 5.5, 0, 0.75, 0.7, 2);
  spot.position.set(0, 0.97, P.zMasque - 0.08); spot.target.position.set(0, 0, 19.0); // sous le bloc de masquage, comme les vraies rampes
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = 0.2; spot.shadow.camera.far = 6; spot.shadow.bias = -0.0003; spot.shadow.normalBias = 0.01;
  scene.add(spot, spot.target);
  const feux = [new THREE.PointLight('#ff3a1a', 0, 9, 2), new THREE.PointLight('#ff3a1a', 0, 9, 2)]; // fumigènes (CGT)
  feux[0].position.set(-4.8, 2.1, -7.5); feux[1].position.set(5.4, 2.1, -6.8); scene.add(...feux);

  /* ---------- piste principale : bois verni + reflet miroir ---------- */
  const boisPiste = boisBase(512, 4096, P.zFin, 39, 7, [4.9, 15.2]);
  const canPiste = toile(512, 4096), texPiste = texture(canPiste, { flipY: false });
  const boisElanBase = boisBase(512, 1024, -P.zElan, 64, 13, null);
  let canElan = textureElan(etat.theme, boisElanBase); const texElan = texture(canElan, { flipY: false });
  function dessinerPiste(th) {
    const x = canPiste.getContext('2d'); x.drawImage(boisPiste, 0, 0); marquagesPiste(x, 512, 4096, th); texPiste.needsUpdate = true;
    canElan = textureElan(th, boisElanBase); texElan.image = canElan; texElan.needsUpdate = true;
  }
  dessinerPiste(etat.theme);
  const refl = new Reflector(planSol(-P.demi, P.demi, 0, P.zFin).rotateX(Math.PI / 2), { textureWidth: 512, textureHeight: 512, clipBias: 0.003, multisample: 0 });
  refl.rotation.x = -Math.PI / 2; refl.frustumCulled = false; refl.receiveShadow = true;
  const uRefl = { tReflet: { value: refl.getRenderTarget().texture }, mReflet: { value: refl.material.uniforms.textureMatrix.value }, forceReflet: { value: 0.62 } };
  refl.material.dispose();
  function matReflechissant(map) {
    const m = new THREE.MeshPhysicalMaterial({ map, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.45 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uRefl);
      sh.vertexShader = 'uniform mat4 mReflet;\nvarying vec4 vUvReflet;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvUvReflet = mReflet * vec4( position, 1.0 );');
      sh.fragmentShader = 'uniform sampler2D tReflet;\nuniform float forceReflet;\nvarying vec4 vUvReflet;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
        {
          vec2 uvR = vUvReflet.xy / vUvReflet.w;
          uvR.x += (diffuseColor.r - 0.62) * 0.006;
          vec3 r = texture2D(tReflet, uvR).rgb * 0.34;
          r += texture2D(tReflet, uvR + vec2(0.0, 0.0045)).rgb * 0.2;
          r += texture2D(tReflet, uvR - vec2(0.0, 0.0045)).rgb * 0.2;
          r += texture2D(tReflet, uvR + vec2(0.0, 0.011)).rgb * 0.13;
          r += texture2D(tReflet, uvR - vec2(0.0, 0.011)).rgb * 0.13;
          float nv = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
          float fres = 0.16 + 0.84 * pow(1.0 - nv, 4.0);
          outgoingLight = outgoingLight * (1.0 - fres * 0.3) + r * vec3(1.0, 0.94, 0.86) * fres * forceReflet;
        }
        #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'piste-reflet';
    return m;
  }
  refl.material = matReflechissant(texPiste);
  scene.add(refl);
  const elanPrincipal = new THREE.Mesh(planSol(-P.pas / 2, P.pas / 2, P.zElan, 0).rotateX(Math.PI / 2), matReflechissant(texElan));
  elanPrincipal.rotation.x = -Math.PI / 2; elanPrincipal.receiveShadow = true;
  scene.add(decor(elanPrincipal)); // couche décor : il lit la texture de reflet, il ne doit pas être dessiné DEDANS (boucle de rétroaction)

  /* ---------- pistes voisines, gouttières, séparations ---------- */
  const matPisteV = new THREE.MeshPhysicalMaterial({ map: texPiste, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.55 }); // 0,9 teintait les pistes en rose
  const matElanV = new THREE.MeshPhysicalMaterial({ map: texElan, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9 });
  scene.add(decor(instances(planSol(-P.demi, P.demi, 0, P.zFin), matPisteV, VOISINES.map((k) => ({ x: k * P.pas })))));
  scene.add(decor(instances(planSol(-P.pas / 2, P.pas / 2, P.zElan, 0), matElanV, VOISINES.map((k) => ({ x: k * P.pas })))));
  const matMetal = std('#d3d8de', 0.26, 0.9, { side: THREE.DoubleSide });
  const goutt = [];
  for (let k = -4; k <= 4; k++) for (const s of [-1, 1]) goutt.push({ x: k * P.pas + s * (P.demi + P.gout / 2), z: P.zFin / 2 });
  scene.add(decor(instances(geoGouttiere(P.zFin), matMetal, goutt)));
  const matNuit = std(C.nuit, 0.32), bornes = [];
  for (let k = -5; k <= 4; k++) bornes.push((k + 0.5) * P.pas);
  scene.add(decor(instances(new THREE.BoxGeometry(0.2, 0.03, 16.9), matNuit, bornes.map((x) => ({ x, y: 0.012, z: 8.45 })))));
  const garde = instances(new RoundedBoxGeometry(0.2, 1.08, P.zFond + 0.1 - P.zMurs, 2, 0.03), matNuit, bornes.map((x) => ({ x, y: 0.47, z: (P.zFond + 0.1 + P.zMurs) / 2 })));
  scene.add(decor(garde));
  // fosse et rideau (couche 0 : se reflètent au bout de la piste)
  const largeurPistes = 9 * P.pas;
  const fosse = new THREE.Mesh(planSol(-largeurPistes / 2, largeurPistes / 2, P.zFin, P.zFond, -P.profFosse), std('#121626', 0.9)); scene.add(fosse);
  const bord = new THREE.Mesh(new THREE.PlaneGeometry(largeurPistes, P.profFosse), std('#1a1f33', 0.8)); bord.position.set(0, -P.profFosse / 2, P.zFin); bord.rotation.y = Math.PI; scene.add(bord);
  const rideau = new THREE.Mesh(new THREE.PlaneGeometry(largeurPistes, 1.25), std('#0b0e19', 1)); rideau.position.set(0, 0.275, P.zFond); rideau.rotation.y = Math.PI; scene.add(rideau);

  /* ---------- bloc de masquage, fronton, rampes de lumière ---------- */
  const caisson = new THREE.Mesh(new THREE.BoxGeometry(2 * X_MUR, 1.2, 0.6), matNuit); caisson.position.set(0, 1.6, P.zMasque + 0.3); scene.add(caisson);
  function textureMasque(type, th) {
    const W = type === 'principal' ? 1024 : 512, H = Math.round(W / 1.62), c = toile(W, H), x = c.getContext('2d');
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (th === 'bony') {
      if (type === 'principal') {
        x.fillStyle = degrade(x, 0, 0, W, 0, DEG); x.fillRect(0, 0, W, H);
        x.fillStyle = degrade(x, 0, 0, W * 0.6, H, [[0, 'rgba(255,255,255,.16)'], [0.6, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,.1)']]); x.fillRect(0, 0, W, H);
        logo(x, IMG.blanc, W / 2, H * 0.42, W * 0.6);
        x.fillStyle = '#fff'; texteAjuste(x, 'génération auto-mobile', W / 2, H * 0.8, W * 0.74, `700 {t}px ${F_TITRE}`, 40);
      } else if (type === 'A') {
        x.fillStyle = degrade(x, 0, 0, 0, H, [[0, '#2f4a86'], [1, '#1e2f59']]); x.fillRect(0, 0, W, H);
        logo(x, IMG.blanc, W / 2, H * 0.45, W * 0.6);
        x.fillStyle = degrade(x, W * 0.2, 0, W * 0.8, 0, DEG); x.fillRect(W * 0.2, H * 0.8, W * 0.6, 6);
      } else {
        x.fillStyle = degrade(x, 0, 0, W, H, [[0, '#b9b9b9'], [0.3, '#e6e6e6'], [1, '#ffffff']]); x.fillRect(0, 0, W, H); // gris dégradé de la charte
        logo(x, IMG.couleur, W / 2, H * 0.5, W * 0.6);
      }
    } else {
      if (type === 'principal') {
        x.fillStyle = C.rouge; x.fillRect(0, 0, W, H);
        x.strokeStyle = '#fff'; x.lineWidth = 10; x.strokeRect(18, 18, W - 36, H - 36);
        logo(x, IMG.cgt, W * 0.19, H / 2, H * 0.62 / RATIO_CGT, RATIO_CGT);
        x.fillStyle = '#fff'; texteAjuste(x, 'GRÈVE', W * 0.62, H * 0.36, W * 0.56, `{t}px ${F_MANIF}`, 170); texteAjuste(x, 'GÉNÉRALE', W * 0.62, H * 0.68, W * 0.56, `{t}px ${F_MANIF}`, 120);
      } else {
        const rouge = type === 'A';
        x.fillStyle = rouge ? C.rouge : '#f4f1ea'; x.fillRect(0, 0, W, H);
        logo(x, IMG.cgt, W * 0.17, H / 2, H * 0.5 / RATIO_CGT, RATIO_CGT);
        x.fillStyle = rouge ? '#fff' : C.rouge; texteAjuste(x, rouge ? PANCARTES[2] : PANCARTES[1], W * 0.6, H / 2, W * 0.62, `{t}px ${F_MANIF}`, 64);
      }
    }
    return texture(c);
  }
  const texMasque = { bony: {}, cgt: {} };
  const masque = (type, th) => texMasque[th][type] || (texMasque[th][type] = textureMasque(type, th));
  const matPanneau = (type) => new THREE.MeshStandardMaterial({ map: masque(type, etat.theme), roughness: 0.45, emissive: '#ffffff', emissiveMap: masque(type, etat.theme), emissiveIntensity: type === 'principal' ? 0.07 : 0.26 });
  const geoPanneau = new THREE.PlaneGeometry(1.62, 1.0);
  const panneaux = { principal: new THREE.Mesh(geoPanneau, matPanneau('principal')) };
  panneaux.principal.position.set(0, 1.6, P.zMasque - 0.005); panneaux.principal.rotation.y = Math.PI;
  // couche décor : son dégradé orange → violet se reflétait dans la piste vernie juste devant les quilles et, avec le
  // bloom, faisait une tache rose sur-saturée au niveau des quilles (constaté à l'écran, 17/10/2026)
  scene.add(decor(panneaux.principal));
  for (const type of ['A', 'B']) {
    panneaux[type] = instances(geoPanneau, matPanneau(type), VOISINES.filter((k) => (Math.abs(k) % 2 === 1) === (type === 'A')).map((k) => ({ x: k * P.pas, y: 1.6, z: P.zMasque - 0.005, ry: Math.PI })));
    scene.add(panneaux[type]);
  }
  surTheme.push((th) => { for (const type in panneaux) { const m = panneaux[type].material; m.map = m.emissiveMap = masque(type, th); m.needsUpdate = true; } });
  const rampes = instances(new THREE.BoxGeometry(1.6, 0.035, 0.07), neon('#ffffff', 3.2), [...Array(9)].map((_, i) => ({ x: (i - 4) * P.pas, y: 1.0, z: P.zMasque - 0.03 })));
  scene.add(rampes);
  const matNeonDeg = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.4, 2.4, 2.4) });
  const matNeonCgt = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.rouge).multiplyScalar(2.6) });
  const neons = []; // maillages qui changent de matériau avec le thème
  const ligneMasque = new THREE.Mesh(bandeauDegrade(2 * X_MUR, 0.05, 0.05, 'x', C.violet, C.orange), matNeonDeg);
  ligneMasque.position.set(0, 2.22, P.zMasque - 0.03); scene.add(ligneMasque); neons.push(ligneMasque);
  // fronton au-dessus du bloc de masquage
  function textureFronton(th) {
    const W = 4096, H = 512, c = toile(W, H), x = c.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle';
    if (th === 'bony') {
      x.fillStyle = degrade(x, 0, 0, 0, H, [[0, '#1b2a52'], [1, C.nuit]]); x.fillRect(0, 0, W, H);
      x.fillStyle = degrade(x, 0, 0, W, 0, DEG); x.fillRect(0, H - 10, W, 10);
      logo(x, IMG.blanc, W / 2, H * 0.5, 820);
      x.fillStyle = '#ffffff'; x.font = `700 58px ${F_TITRE}`;
      for (const cx of [W * 0.2, W * 0.8]) x.fillText('génération auto-mobile', cx, H * 0.52);
      for (const cx of [W * 0.335, W * 0.665]) { x.fillStyle = degrade(x, cx - 40, 0, cx + 40, 0, DEG); x.beginPath(); x.arc(cx, H * 0.52, 12, 0, 7); x.fill(); }
    } else {
      x.fillStyle = degrade(x, 0, 0, 0, H, [[0, '#8f0010'], [1, '#c8001a']]); x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff'; x.fillRect(0, H - 12, W, 12);
      for (const cx of [W * 0.06, W * 0.94]) logo(x, IMG.cgt, cx, H * 0.48, 300 / RATIO_CGT, RATIO_CGT);
      x.fillStyle = '#fff'; texteAjuste(x, SLOGANS[2], W / 2, H * 0.5, W * 0.76, `{t}px ${F_MANIF}`, 170);
    }
    return texture(c);
  }
  const texFronton = { bony: textureFronton('bony') };
  const fronton = new THREE.Mesh(new THREE.PlaneGeometry(2 * X_MUR, Y_PLAF - 2.2), new THREE.MeshStandardMaterial({ map: texFronton.bony, emissive: '#ffffff', emissiveMap: texFronton.bony, emissiveIntensity: 0.28, roughness: 0.6 }));
  fronton.position.set(0, (Y_PLAF + 2.2) / 2, P.zMasque); fronton.rotation.y = Math.PI; scene.add(fronton);
  surTheme.push((th) => { const t = texFronton[th] || (texFronton[th] = textureFronton(th)); fronton.material.map = fronton.material.emissiveMap = t; fronton.material.needsUpdate = true; });

  /* ---------- plafond, plafonniers, ailettes, murs ---------- */
  const matPlafond = std('#151d38', 0.9);
  matPlafond.side = THREE.BackSide; // plan horizontal vu par-dessous
  scene.add(decor(new THREE.Mesh(planSol(-X_MUR, X_MUR, Z_SALLE, P.zFond, Y_PLAF), matPlafond)));
  const plafonniers = instances(new THREE.BoxGeometry(largeurPistes, 0.05, 0.2), neon('#ffffff', 3.4), [1.5, 5.2, 9, 12.8, 16.2].map((z) => ({ y: 3.62, z })));
  scene.add(plafonniers);
  const ailettes = instances(new THREE.BoxGeometry(0.05, 0.5, 31), std('#ffffff', 0.5, 0, { emissive: '#ffffff', emissiveIntensity: 0.12 }), bornes.map((x) => ({ x, y: 3.98, z: 4.6, c: '#ffffff' })));
  scene.add(decor(ailettes));
  surTheme.push((th) => {
    bornes.forEach((x, i) => ailettes.setColorAt(i, _col.set(th === 'cgt' ? (i % 2 ? '#f2f2f2' : C.rouge) : melange(C.violet, C.orange, (x + 8) / 16))));
    ailettes.instanceColor.needsUpdate = true;
  });
  const lampes = instances(new THREE.CylinderGeometry(0.22, 0.3, 0.22, 20, 1, true), std(C.nuit, 0.4, 0.3, { side: THREE.DoubleSide }), [...Array(9)].map((_, i) => ({ x: (i - 4) * P.pas, y: 2.55, z: -7.4 })));
  const disques = instances(new THREE.CircleGeometry(0.28, 20), neon('#fff3df', 2.6), [...Array(9)].map((_, i) => ({ x: (i - 4) * P.pas, y: 2.45, z: -7.4, rx: Math.PI / 2 })));
  scene.add(decor(lampes), decor(disques));
  const matMur = std('#ecebea', 0.9), matPlinthe = std(C.nuit, 0.55);
  for (const s of [-1, 1]) {
    const mur = new THREE.Mesh(new THREE.PlaneGeometry(P.zFond - Z_SALLE, Y_PLAF), matMur); mur.position.set(s * X_MUR, Y_PLAF / 2, (P.zFond + Z_SALLE) / 2); mur.rotation.y = -s * Math.PI / 2; scene.add(decor(mur));
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, P.zFond - Z_SALLE), matPlinthe); pl.position.set(s * (X_MUR - 0.04), 0.55, (P.zFond + Z_SALLE) / 2); scene.add(decor(pl));
    for (const y of [1.13, 4.3]) {
      const n = new THREE.Mesh(bandeauDegrade(P.zFond - Z_SALLE, 0.05, 0.05, 'z', s > 0 ? C.orange : C.violet, s > 0 ? C.violet : C.orange), matNeonDeg);
      n.position.set(s * (X_MUR - 0.1), y, (P.zFond + Z_SALLE) / 2); scene.add(decor(n)); neons.push(n);
    }
  }
  const murFond = new THREE.Mesh(new THREE.PlaneGeometry(2 * X_MUR, Y_PLAF), matMur); murFond.position.set(0, Y_PLAF / 2, Z_SALLE); scene.add(decor(murFond));
  const plFond = new THREE.Mesh(new THREE.BoxGeometry(2 * X_MUR, 0.9, 0.08), matPlinthe); plFond.position.set(0, 0.45, Z_SALLE + 0.04); scene.add(decor(plFond));
  surTheme.push((th) => { matMur.color.set(th === 'cgt' ? '#c9c5bf' : '#ecebea'); matPlinthe.color.set(th === 'cgt' ? '#2b2d31' : C.nuit); matPlafond.color.set(th === 'cgt' ? '#1e1f24' : '#151d38'); });
  // rubans « route » le long des murs : rappel du monogramme (un parcours), lumineux, en dégradé
  function ruban(pts, largeur, c0, c1) {
    const courbe = new THREE.CatmullRomCurve3(pts), n = 200, pos = [], col = [], idx = [], a = new THREE.Color(c0), b = new THREE.Color(c1), t = new THREE.Color();
    for (let i = 0; i <= n; i++) {
      const p = courbe.getPoint(i / n); t.copy(a).lerp(b, i / n);
      pos.push(p.x, p.y - largeur / 2, p.z, p.x, p.y + largeur / 2, p.z); col.push(t.r, t.g, t.b, t.r, t.g, t.b);
      if (i < n) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    return g;
  }
  const matRuban = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.6, 1.6, 1.6), side: THREE.DoubleSide });
  const matRubanCgt = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.rouge).multiplyScalar(1.6), side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const xm = s * (X_MUR - 0.02);
    for (const [ph, l, y0] of [[0, 0.3, 2.75], [1.7, 0.1, 2.55]]) {
      const pts = []; for (let z = Z_SALLE + 0.5; z <= P.zFond - 0.3; z += 3.2) pts.push(new THREE.Vector3(xm, y0 + Math.sin(z * 0.33 + ph + s) * 0.75, z));
      const r = new THREE.Mesh(ruban(pts, l, s > 0 ? C.orange : C.violet, s > 0 ? C.violet : C.orange), matRuban); scene.add(decor(r)); neons.push(r);
    }
  }
  surTheme.push((th) => { for (const n of neons) n.material = th === 'cgt' ? (n.material === matRuban ? matRubanCgt : n.material === matNeonDeg ? matNeonCgt : n.material) : (n.material === matRubanCgt ? matRuban : n.material === matNeonCgt ? matNeonDeg : n.material); });
  // murale du fond (vue dans le plan de célébration)
  function textureMurale(th) {
    const W = 2560, H = 512, c = toile(W, H), x = c.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle';
    if (th === 'bony') {
      x.fillStyle = degrade(x, 0, 0, W * 0.4, H * 2, [[0, '#c8c8c8'], [0.3, '#ececec'], [1, '#ffffff']]); x.fillRect(0, 0, W, H);
      x.lineCap = 'round';
      for (const [y0, l, a] of [[0.78, 26, 0.9], [0.86, 10, 0.6]]) {
        x.strokeStyle = degrade(x, 0, 0, W, 0, DEG); x.lineWidth = l; x.globalAlpha = a; x.beginPath(); x.moveTo(-20, H * y0);
        x.bezierCurveTo(W * 0.3, H * (y0 - 0.5), W * 0.62, H * (y0 + 0.25), W + 20, H * (y0 - 0.45)); x.stroke();
      }
      x.globalAlpha = 1; logo(x, IMG.couleur, W / 2, H * 0.36, 860);
      x.fillStyle = degrade(x, W * 0.3, 0, W * 0.7, 0, DEG); texteAjuste(x, 'génération auto-mobile', W / 2, H * 0.72, W * 0.5, `700 {t}px ${F_TITRE}`, 64);
    } else {
      x.fillStyle = '#b9b5ae'; x.fillRect(0, 0, W, H);
      const rnd = graine(5); for (let k = 0; k < 4000; k++) { x.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.08)'; x.fillRect(rnd() * W, rnd() * H, 3, 3); }
      x.fillStyle = C.rouge; x.fillRect(W * 0.18, H * 0.16, W * 0.64, H * 0.46);
      logo(x, IMG.cgt, W * 0.25, H * 0.39, 190 / RATIO_CGT, RATIO_CGT);
      x.fillStyle = '#fff'; texteAjuste(x, 'GRÈVE GÉNÉRALE', W * 0.55, H * 0.39, W * 0.5, `{t}px ${F_MANIF}`, 150);
      [[0.07, 0.4, -0.06], [0.93, 0.42, 0.05], [0.3, 0.8, 0.03], [0.7, 0.8, -0.04], [0.5, 0.82, 0.02]].forEach(([u, v, r], i) => {
        x.save(); x.translate(W * u, H * v); x.rotate(r); x.fillStyle = i % 2 ? '#f4f1ea' : C.rouge; x.fillRect(-190, -52, 380, 104);
        x.fillStyle = i % 2 ? C.rouge : '#fff'; texteAjuste(x, PANCARTES[i % PANCARTES.length], 0, 2, 350, `{t}px ${F_MANIF}`, 54); x.restore();
      });
    }
    return texture(c);
  }
  const texMurale = { bony: textureMurale('bony') };
  const murale = new THREE.Mesh(new THREE.PlaneGeometry(2 * X_MUR, 3.4), new THREE.MeshStandardMaterial({ map: texMurale.bony, roughness: 0.85 }));
  murale.position.set(0, 2.65, Z_SALLE + 0.02); scene.add(decor(murale));
  surTheme.push((th) => { murale.material.map = texMurale[th] || (texMurale[th] = textureMurale(th)); murale.material.needsUpdate = true; });

  /* ---------- sols de la salle ---------- */
  const texMoq = { bony: textureMoquette('bony') };
  const matMoq = std('#ffffff', 0.95, 0, { map: texMoq.bony });
  scene.add(decor(new THREE.Mesh(planSol(-X_MUR, X_MUR, Z_SALLE, P.zElan), matMoq)));
  for (const s of [-1, 1]) {
    const g = planSol(Math.min(s * largeurPistes / 2, s * X_MUR), Math.max(s * largeurPistes / 2, s * X_MUR), P.zElan, P.zFond);
    scene.add(decor(new THREE.Mesh(g, matMoq)));
  }
  surTheme.push((th) => { matMoq.map = texMoq[th] || (texMoq[th] = textureMoquette(th)); matMoq.needsUpdate = true; });

  /* ---------- écrans au-dessus des pistes ---------- */
  const canEcran = toile(768, 432), texEcran = texture(canEcran);
  const annonce = { txt: '', sous: '', fin: 0 };
  let sloganEcran = 0;
  function dessinerEcran() {
    const x = canEcran.getContext('2d'), W = 768, H = 432, th = etat.theme; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (annonce.txt) {
      const sous = annonce.sous;
      if (th === 'bony') {
        x.fillStyle = degrade(x, 0, 0, W, 0, DEG); x.fillRect(0, 0, W, H); x.fillStyle = '#fff';
        texteAjuste(x, annonce.txt, W / 2, H * (sous ? 0.42 : 0.48), W * 0.86, `700 {t}px ${F_TITRE}`, 96);
        if (sous) texteAjuste(x, sous, W / 2, H * 0.74, W * 0.86, `600 {t}px ${F_TEXTE}`, 40);
      } else {
        x.fillStyle = C.rouge; x.fillRect(0, 0, W, H); logo(x, IMG.cgt, W / 2, H * 0.2, 64 / RATIO_CGT, RATIO_CGT); x.fillStyle = '#fff';
        texteAjuste(x, annonce.txt, W / 2, H * (sous ? 0.52 : 0.64), W * 0.9, `{t}px ${F_MANIF}`, 110);
        if (sous) texteAjuste(x, sous, W / 2, H * 0.82, W * 0.9, `{t}px ${F_MANIF}`, 40);
      }
    } else if (th === 'bony') {
      x.fillStyle = degrade(x, 0, 0, 0, H, [[0, '#1d2c58'], [1, '#121c3a']]); x.fillRect(0, 0, W, H);
      x.fillStyle = degrade(x, 0, 0, W, 0, DEG); x.fillRect(0, 0, W, 14);
      x.textAlign = 'left'; x.fillStyle = '#fff'; x.font = `700 34px ${F_TITRE}`; x.fillText('piste ' + NUM_PISTE, 34, 64);
      x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 2;
      for (let i = 0; i < 10; i++) { x.strokeRect(34 + i * 70, 130, 70, 90); x.strokeRect(34 + i * 70 + 38, 130, 32, 34); }
      x.fillStyle = 'rgba(255,255,255,.75)'; x.font = `600 22px ${F_TEXTE}`; for (let i = 0; i < 10; i++) x.fillText(String(i + 1), 40 + i * 70, 118);
      logo(x, IMG.blanc, W - 150, H - 52, 220);
    } else {
      x.fillStyle = C.rouge; x.fillRect(0, 0, W, H); x.fillStyle = '#fff'; x.fillRect(0, H - 16, W, 16);
      logo(x, IMG.cgt, 80, 84, 100 / RATIO_CGT, RATIO_CGT);
      x.fillStyle = '#fff'; x.textAlign = 'left'; x.font = `34px ${F_MANIF}`; x.fillText('PISTE ' + NUM_PISTE + ' — OCCUPÉE', 150, 84);
      const mots = SLOGANS[sloganEcran % SLOGANS.length].split(' '), lignes = ['']; x.font = `52px ${F_MANIF}`;
      for (const m of mots) { const essai = (lignes[lignes.length - 1] + ' ' + m).trim(); if (x.measureText(essai).width > W - 80) lignes.push(m); else lignes[lignes.length - 1] = essai; }
      x.textAlign = 'center'; lignes.forEach((l, i) => x.fillText(l, W / 2, H * 0.58 + (i - (lignes.length - 1) / 2) * 62));
    }
    texEcran.needsUpdate = true;
  }
  function textureEcranVoisin(th) {
    const W = 512, H = 288, c = toile(W, H), x = c.getContext('2d'); x.textBaseline = 'middle';
    if (th === 'bony') {
      x.fillStyle = '#16224a'; x.fillRect(0, 0, W, H); x.fillStyle = degrade(x, 0, 0, W, 0, DEG); x.fillRect(0, 0, W, 10);
      x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 2; x.font = `600 20px ${F_TEXTE}`; x.fillStyle = '#fff';
      ['Léa', 'Karim', 'Inès'].forEach((n, j) => { x.fillText(n, 18, 70 + j * 70); for (let i = 0; i < 8; i++) x.strokeRect(100 + i * 50, 46 + j * 70, 50, 48); });
    } else {
      x.fillStyle = C.rouge; x.fillRect(0, 0, W, H); logo(x, IMG.cgt, 70, H / 2, 120 / RATIO_CGT, RATIO_CGT);
      x.fillStyle = '#fff'; x.textAlign = 'center'; texteAjuste(x, PANCARTES[0], 300, H / 2, 300, `{t}px ${F_MANIF}`, 90);
    }
    return texture(c);
  }
  const texEcranV = { bony: textureEcranVoisin('bony') };
  const matEcranV = new THREE.MeshBasicMaterial({ map: texEcranV.bony, color: new THREE.Color(1.15, 1.15, 1.15) });
  const matEcran = new THREE.MeshBasicMaterial({ map: texEcran, color: new THREE.Color(1.2, 1.2, 1.2) });
  surTheme.push((th) => { matEcranV.map = texEcranV[th] || (texEcranV[th] = textureEcranVoisin(th)); matEcranV.needsUpdate = true; dessinerEcran(); });
  const Z_ECRAN = -0.4, Y_ECRAN = 2.9, INCL = 0.16;
  const geoEcran = new THREE.PlaneGeometry(1.2, 0.675);
  const cadres = [], tiges = [];
  for (let k = -4; k <= 4; k++) {
    const g = new THREE.Group(); g.position.set(k * P.pas, Y_ECRAN, Z_ECRAN); g.rotation.set(0, Math.PI, 0);
    const e = new THREE.Mesh(geoEcran, k === 0 ? matEcran : matEcranV); e.rotation.x = INCL; e.position.z = 0.046; g.add(e); scene.add(decor(g));
    cadres.push({ x: k * P.pas, y: Y_ECRAN, z: Z_ECRAN, rx: -INCL }); tiges.push({ x: k * P.pas - 0.35, y: (Y_PLAF + Y_ECRAN) / 2 + 0.2, z: Z_ECRAN }, { x: k * P.pas + 0.35, y: (Y_PLAF + Y_ECRAN) / 2 + 0.2, z: Z_ECRAN });
  }
  scene.add(decor(instances(new RoundedBoxGeometry(1.3, 0.77, 0.08, 2, 0.03), std('#151a2b', 0.35, 0.3), cadres)));
  scene.add(decor(instances(new THREE.CylinderGeometry(0.012, 0.012, Y_PLAF - Y_ECRAN - 0.3, 6), matMetal, tiges)));

  /* ---------- zone des sièges : canapés, consoles, retours de boules, râteliers, bar ---------- */
  const assise = [], dossier = [], coussins = [], tables = [];
  for (let k = -4; k <= 4; k++) {
    assise.push({ x: k * P.pas, y: 0.21, z: -7.3 }); dossier.push({ x: k * P.pas, y: 0.55, z: -7.62, rx: -0.12 });
    coussins.push({ x: k * P.pas - 0.36, y: 0.45, z: -7.28, c: k % 2 ? C.orange : C.violet }, { x: k * P.pas + 0.36, y: 0.45, z: -7.28, c: k % 2 ? C.violet : C.orange });
    tables.push({ x: k * P.pas, y: 0.36, z: -5.9 });
  }
  const matSiege = std(C.nuit, 0.45);
  scene.add(decor(instances(new RoundedBoxGeometry(1.55, 0.42, 0.66, 3, 0.07), matSiege, assise)));
  scene.add(decor(instances(new RoundedBoxGeometry(1.55, 0.62, 0.16, 3, 0.06), matSiege, dossier)));
  const coussinsM = instances(new RoundedBoxGeometry(0.7, 0.1, 0.56, 3, 0.04), std('#ffffff', 0.7), coussins); scene.add(decor(coussinsM));
  surTheme.push((th) => { coussins.forEach((c, i) => coussinsM.setColorAt(i, _col.set(th === 'cgt' ? (i % 2 ? '#f2f2f2' : C.rouge) : c.c))); coussinsM.instanceColor.needsUpdate = true; matSiege.color.set(th === 'cgt' ? '#34363c' : C.nuit); });
  scene.add(decor(instances(new THREE.CylinderGeometry(0.06, 0.12, 0.72, 12), matMetal, tables)));
  scene.add(decor(instances(new RoundedBoxGeometry(0.52, 0.06, 0.4, 2, 0.02), std('#151a2b', 0.3), tables.map((t) => ({ ...t, y: 0.74 })))));
  const consoles = instances(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshBasicMaterial({ map: texEcranV.bony, color: new THREE.Color(1.1, 1.1, 1.1) }), tables.map((t) => ({ x: t.x, y: 0.92, z: t.z, rx: -0.5 })));
  consoles.material = matEcranV; scene.add(decor(consoles));
  // retours de boules (entre les pistes d'une même paire)
  const retours = [-0.5, 1.5, 3.5, -2.5].map((k) => k * P.pas);
  const matCapot = std(C.orange, 0.35), matCapotRetour = std(C.nuit, 0.3, 0.2);
  scene.add(decor(instances(new RoundedBoxGeometry(0.56, 0.5, 2.1, 3, 0.06), matSiege, retours.map((x) => ({ x, y: 0.25, z: -2.75 })))));
  const capot = new THREE.SphereGeometry(0.26, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2); capot.scale(0.95, 0.8, 1.2);
  scene.add(decor(instances(capot, matCapotRetour, retours.map((x) => ({ x, y: 0.5, z: -1.95 })))));
  scene.add(decor(instances(new THREE.TorusGeometry(0.255, 0.018, 8, 32, Math.PI), matCapot, retours.map((x) => ({ x, y: 0.5, z: -1.95, ry: Math.PI / 2 })))));
  scene.add(decor(instances(new THREE.BoxGeometry(0.03, 0.03, 1.5), matMetal, retours.flatMap((x) => [{ x: x - 0.1, y: 0.53, z: -3.0 }, { x: x + 0.1, y: 0.53, z: -3.0 }]))));
  surTheme.push((th) => { matCapot.color.set(th === 'cgt' ? C.rouge : C.orange); matCapotRetour.color.set(th === 'cgt' ? '#2b2d31' : C.nuit); });
  // boules de couleur : sur les retours et les râteliers
  const coulBoules = { bony: [C.orange, C.violet, C.nuit, '#ffffff', '#4f6fc2', '#c4479e'], cgt: [C.rouge, '#ffffff', '#2b2d31', '#8f0010', C.rouge] };
  const posBoules = [];
  retours.forEach((x) => { for (let i = 0; i < 3; i++) posBoules.push({ x, y: 0.53 + P.rB * 0.6, z: -3.5 + i * 0.23 }); });
  for (const xr of [-6.2, -2.2, 2.2]) for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) posBoules.push({ x: xr - 1.05 + i * 0.35, y: 0.55 + r * 0.42, z: Z_SALLE + 0.45 + r * 0.05 });
  const matBoulesDeco = new THREE.MeshPhysicalMaterial({ roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  const boulesDeco = instances(new THREE.SphereGeometry(P.rB, 20, 14), matBoulesDeco, posBoules.map((p) => ({ ...p, c: '#ffffff' })));
  scene.add(decor(boulesDeco));
  surTheme.push((th) => { posBoules.forEach((_, i) => boulesDeco.setColorAt(i, _col.set(coulBoules[th][(i * 7) % coulBoules[th].length]))); boulesDeco.instanceColor.needsUpdate = true; });
  scene.add(decor(instances(new RoundedBoxGeometry(2.6, 0.08, 0.36, 2, 0.02), matMetal, [-6.2, -2.2, 2.2].flatMap((x) => [{ x, y: 0.44, z: Z_SALLE + 0.45 }, { x, y: 0.86, z: Z_SALLE + 0.5 }]))));
  // bar (côté gauche du fond) : comptoir à façade en dégradé
  const canBar = toile(1024, 340), xb = canBar.getContext('2d');
  xb.fillStyle = degrade(xb, 0, 0, 1024, 0, DEG); xb.fillRect(0, 0, 1024, 340); logo(xb, IMG.blanc, 512, 150, 520);
  xb.fillStyle = '#fff'; xb.textAlign = 'center'; xb.textBaseline = 'middle'; texteAjuste(xb, 'génération auto-mobile', 512, 280, 760, `700 {t}px ${F_TITRE}`, 36);
  const bar = new THREE.Group(); bar.position.set(6.35, 0, -9.7);
  const comptoir = new THREE.Mesh(new RoundedBoxGeometry(3.1, 1.05, 0.7, 3, 0.04), matSiege); comptoir.position.y = 0.525; bar.add(comptoir);
  const facade = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.0), new THREE.MeshStandardMaterial({ map: texture(canBar), emissive: '#ffffff', emissiveMap: null, roughness: 0.5 }));
  facade.material.emissiveMap = facade.material.map; facade.material.emissiveIntensity = 0.25; facade.position.set(0, 0.53, 0.356); bar.add(facade);
  const plateau = new THREE.Mesh(new RoundedBoxGeometry(3.3, 0.06, 0.85, 2, 0.02), std('#f4f4f4', 0.25)); plateau.position.y = 1.08; bar.add(plateau);
  bar.add(instances(new THREE.CylinderGeometry(0.2, 0.16, 0.06, 18), matCapot, [-1, -0.33, 0.33, 1].map((x) => ({ x, y: 0.72, z: 0.85 }))));
  bar.add(instances(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), matMetal, [-1, -0.33, 0.33, 1].map((x) => ({ x, y: 0.36, z: 0.85 }))));
  groupeBony.add(decor(bar));

  /* ---------- quilles, boule, ombre de contact, aperçu de visée ---------- */
  const geoQ = geometrieQuille();
  const texQ = { bony: textureQuille('bony'), cgt: textureQuille('cgt') };
  const matQ = new THREE.MeshPhysicalMaterial({ map: texQ[etat.theme], roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0.3, iridescenceIOR: 1.4, iridescenceThicknessRange: [180, 420] });
  const quilles = new THREE.InstancedMesh(geoQ, matQ, 10); quilles.castShadow = true; quilles.frustumCulled = false; scene.add(quilles);
  const quillesV = new THREE.InstancedMesh(geoQ, matQ, VOISINES.length * 10); quillesV.frustumCulled = false; scene.add(decor(quillesV));
  surTheme.push((th) => { matQ.map = texQ[th]; matQ.needsUpdate = true; });
  const texB = {}, texBoule = (th) => texB[th] || (texB[th] = textureBoule(th, IMG));
  const matB = new THREE.MeshPhysicalMaterial({ map: texBoule(etat.theme), roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.03 });
  const boule = new THREE.Mesh(new THREE.SphereGeometry(P.rB, 44, 30), matB); boule.castShadow = true; scene.add(boule);
  surTheme.push((th) => { matB.map = texBoule(th); matB.needsUpdate = true; });
  const texTache = textureTache();
  const tacheBoule = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: texTache, transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 }));
  scene.add(decor(tacheBoule));
  // aperçu de visée : chevrons lumineux qui défilent vers les quilles
  const canGuide = toile(64, 256), xg = canGuide.getContext('2d');
  function dessinerGuide(th) {
    xg.clearRect(0, 0, 64, 256);
    for (let i = 0; i < 4; i++) {
      const y = 224 - i * 64; xg.fillStyle = th === 'cgt' ? '#ff3b3b' : (i % 2 ? C.violet : C.orange);
      xg.beginPath(); xg.moveTo(32, y - 40); xg.lineTo(60, y); xg.lineTo(46, y); xg.lineTo(32, y - 20); xg.lineTo(18, y); xg.lineTo(4, y); xg.closePath(); xg.fill();
    }
    texGuide.needsUpdate = true;
  }
  const texGuide = texture(canGuide, { repete: true, flipY: false }); texGuide.wrapS = THREE.ClampToEdgeWrapping;
  const geoGuide = new THREE.PlaneGeometry(0.11, 6.5, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, 3.25);
  { const uv = geoGuide.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 13); }
  const guide = new THREE.Mesh(geoGuide, new THREE.MeshBasicMaterial({ map: texGuide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, 1.6, 1.6), polygonOffset: true, polygonOffsetFactor: -4 }));
  guide.position.y = 0.004; scene.add(decor(guide)); dessinerGuide(etat.theme);
  surTheme.push(dessinerGuide);

  /* ---------- particules : confettis, éclats (instanciés), fumée / poussière / étincelles (points) ---------- */
  const PART = (() => {
    const NC = 900, NE = 300, NF = 900, NS = 260;
    const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.036, 0.022), std('#ffffff', 0.45, 0.15, { side: THREE.DoubleSide }), NC);
    conf.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NC * 3), 3); conf.count = 0; conf.frustumCulled = false;
    const ecl = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.014), std('#ffffff', 0.4), NE);
    ecl.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NE * 3), 3); ecl.count = 0; ecl.frustumCulled = false;
    const nuage = (n, additif) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('taille', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('couleur', new THREE.BufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage));
      const m = new THREE.ShaderMaterial({
        uniforms: { uEchelle: { value: 600 } }, transparent: true, depthWrite: false, blending: additif ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: 'attribute float taille; attribute vec4 couleur; varying vec4 vC; uniform float uEchelle;\nvoid main(){ vC = couleur; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(taille * uEchelle / max(0.1, -mv.z), 1.0, 256.0); gl_Position = projectionMatrix * mv; }',
        fragmentShader: `varying vec4 vC;\nvoid main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard; float a = 1.0 - r * r; a *= a; ${additif ? 'a = pow(a, 2.0);' : ''} gl_FragColor = vec4(vC.rgb, vC.a * a); }`,
      });
      const p = new THREE.Points(g, m); p.frustumCulled = false; g.setDrawRange(0, 0); return p;
    };
    const fum = nuage(NF, false), etin = nuage(NS, true);
    scene.add(decor(conf), decor(ecl), decor(fum), decor(etin));
    const L = { conf: [], ecl: [], fum: [], etin: [] }, cc = new THREE.Color(), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3();
    const ajout = (l, n, o) => { if (l.length < n) l.push(o); };
    return {
      confettis(x, y, z, n, couleurs, v = 4, cone = 1) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 6.28, r = Math.random() * cone;
          ajout(L.conf, NC, { p: new THREE.Vector3(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3), vel: new THREE.Vector3(Math.cos(a) * r * v * 0.6, v * (0.6 + Math.random() * 0.6), Math.sin(a) * r * v * 0.6),
            axe: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), ang: Math.random() * 6, va: 6 + Math.random() * 10, age: 0, vie: 3.5 + Math.random() * 2.5, ph: Math.random() * 6, c: new THREE.Color(couleurs[i % couleurs.length]) });
        }
      },
      pluie(x0, x1, y, z0, z1, n, couleurs) { // confettis qui tombent du plafond
        for (let i = 0; i < n; i++) ajout(L.conf, NC, { p: new THREE.Vector3(lerp(x0, x1, Math.random()), y + Math.random() * 0.6, lerp(z0, z1, Math.random())), vel: new THREE.Vector3(0, -0.3, 0), axe: new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize(), ang: Math.random() * 6, va: 5 + Math.random() * 8, age: 0, vie: 4 + Math.random() * 2, ph: Math.random() * 6, c: new THREE.Color(couleurs[i % couleurs.length]) });
      },
      eclats(x, y, z, n, f) {
        for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = (0.8 + Math.random() * 1.8) * f; ajout(L.ecl, NE, { p: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(Math.cos(a) * v, 0.6 + Math.random() * 2.2 * f, Math.sin(a) * v * 0.7 + 0.4), axe: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(), ang: 0, va: 20, age: 0, vie: 0.9 + Math.random() * 0.6, c: new THREE.Color(Math.random() < 0.6 ? '#ffffff' : '#e8c79a') }); }
      },
      fumee(x, y, z, n, o = {}) {
        const c = new THREE.Color(o.c || '#d8cdbd');
        for (let i = 0; i < n; i++) ajout(L.fum, NF, { p: new THREE.Vector3(x + (Math.random() - 0.5) * (o.disp || 0.1), y, z + (Math.random() - 0.5) * (o.disp || 0.1)), vel: new THREE.Vector3((Math.random() - 0.5) * (o.vx ?? 0.5), (o.vy ?? 0.5) * (0.5 + Math.random()), (Math.random() - 0.5) * (o.vx ?? 0.5)), t0: o.t0 || 0.12, t1: o.t1 || 0.7, age: 0, vie: (o.vie || 1.4) * (0.7 + Math.random() * 0.6), a: o.a ?? 0.5, c: c.clone().multiplyScalar(0.85 + Math.random() * 0.3) });
      },
      etincelles(x, y, z, n, couleur = '#ffffff') {
        const c = new THREE.Color(couleur).multiplyScalar(3);
        for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, e = Math.random() * 1.2, v = 1 + Math.random() * 3; ajout(L.etin, NS, { p: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(Math.cos(a) * Math.cos(e) * v, Math.sin(e) * v + 0.5, Math.sin(a) * Math.cos(e) * v), age: 0, vie: 0.35 + Math.random() * 0.5, t: 0.03 + Math.random() * 0.04, c }); }
      },
      maj(dt, echelle) {
        fum.material.uniforms.uEchelle.value = etin.material.uniforms.uEchelle.value = echelle;
        let n = 0;
        for (const q of L.conf) {
          q.age += dt; if (q.age > q.vie) continue;
          if (q.p.y > 0.006) {
            q.vel.y -= 2.4 * dt; const tr = Math.exp(-2.2 * dt); q.vel.multiplyScalar(tr);
            q.p.addScaledVector(q.vel, dt); q.p.x += Math.sin(q.age * 5 + q.ph) * 0.12 * dt; q.ang += q.va * dt;
          } else { q.p.y = 0.006; q.va = 0; }
          const f = Math.min(1, (q.vie - q.age) * 2);
          qq.setFromAxisAngle(q.axe, q.ang); m4.compose(q.p, qq, sc.set(f, f, f)); conf.setMatrixAt(n, m4); conf.setColorAt(n, q.c); L.conf[n++] = q;
        }
        L.conf.length = n; conf.count = n; conf.instanceMatrix.needsUpdate = true; conf.instanceColor.needsUpdate = true;
        n = 0;
        for (const q of L.ecl) {
          q.age += dt; if (q.age > q.vie) continue;
          q.vel.y -= 9.8 * dt; q.p.addScaledVector(q.vel, dt); q.ang += q.va * dt;
          if (q.p.y < 0.008 && q.p.z < P.zFin) { q.p.y = 0.008; q.vel.y *= -0.3; q.vel.x *= 0.6; q.vel.z *= 0.6; q.va *= 0.5; }
          const f = Math.min(1, (q.vie - q.age) * 4);
          qq.setFromAxisAngle(q.axe, q.ang); m4.compose(q.p, qq, sc.set(f, f, f)); ecl.setMatrixAt(n, m4); ecl.setColorAt(n, q.c); L.ecl[n++] = q;
        }
        L.ecl.length = n; ecl.count = n; ecl.instanceMatrix.needsUpdate = true; ecl.instanceColor.needsUpdate = true;
        for (const [liste, pts, frotte] of [[L.fum, fum, 0.8], [L.etin, etin, 2.5]]) {
          const pa = pts.geometry.attributes.position, ta = pts.geometry.attributes.taille, ca = pts.geometry.attributes.couleur; n = 0;
          for (const q of liste) {
            q.age += dt; if (q.age > q.vie) continue;
            q.vel.multiplyScalar(Math.exp(-frotte * dt)); if (pts === etin) q.vel.y -= 4 * dt; q.p.addScaledVector(q.vel, dt);
            const u = q.age / q.vie;
            const taille = pts === fum ? lerp(q.t0, q.t1, Math.sqrt(u)) : q.t, al = pts === fum ? q.a * Math.min(1, q.age / 0.25) * Math.pow(1 - u, 1.4) : 1 - u;
            pa.setXYZ(n, q.p.x, q.p.y, q.p.z); ta.setX(n, taille); ca.setXYZW(n, q.c.r, q.c.g, q.c.b, al); liste[n++] = q;
          }
          liste.length = n; pts.geometry.setDrawRange(0, n); pa.needsUpdate = ta.needsUpdate = ca.needsUpdate = true;
        }
      },
    };
  })();

  /* ---------- le joueur ---------- */
  function textureChemise() { // chemise de bowling bleu nuit, bandeau en dégradé, petit logo blanc sur le cœur
    const W = 512, H = 256, c = toile(W, H), x = c.getContext('2d');
    x.fillStyle = C.nuit; x.fillRect(0, 0, W, H);
    x.fillStyle = degrade(x, W * 0.25, 0, W * 0.75, 0, [[0, C.orange], [1, C.violet]]); x.fillRect(W * 0.25, H * 0.42, W * 0.5, H * 0.1);
    x.fillStyle = degrade(x, W * 0.75, 0, W * 1.25, 0, [[0, C.violet], [1, C.orange]]); x.fillRect(W * 0.75, H * 0.42, W * 0.25, H * 0.1);
    x.fillStyle = degrade(x, -W * 0.25, 0, W * 0.25, 0, [[0, C.violet], [1, C.orange]]); x.fillRect(0, H * 0.42, W * 0.25, H * 0.1);
    x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, W, H * 0.07); x.fillRect(W * 0.495, 0, W * 0.01, H * 0.42);
    logo(x, IMG.blanc, W * 0.6, H * 0.3, 52 * 1.25);
    return texture(c);
  }
  const texChemise = textureChemise();
  const joueur = creerMii({ peau: '#f1c39c', cheveux: '#4a2c1a', coiffure: 'frange', texHaut: texChemise, manche: C.nuit, bas: '#2a3045', chaussures: '#e9e9ea', ombre: true }, IMG);
  scene.add(joueur.racine);
  surTheme.push((th) => {
    const M = joueur.M; M.haut.map = th === 'cgt' ? null : texChemise; M.haut.color.set(th === 'cgt' ? '#8b8f94' : '#ffffff'); M.haut.needsUpdate = true;
    M.manche.color.set(th === 'cgt' ? '#8b8f94' : C.nuit); joueur.chasuble.visible = th === 'cgt';
  });
  // décalage de la prise au lâcher (pour que la boule quitte la main à la position demandée)
  const offsetLacher = (() => { poser(joueur, poseGlobale(4, 0)); joueur.racine.updateMatrixWorld(true); const v = new THREE.Vector3(); joueur.prise.getWorldPosition(v); return v; })();
  const J = { phase: 'attente', t: 0, reaction: null, tau: 0, instantane: null, melange: 1, xJoueur: 0, angle: 0, enMain: true, guide: true };
  const posePrecedente = { p: poseGlobale(0, 0) };
  function placerJoueur(xJoueur, angle) {
    J.xJoueur = xJoueur; J.angle = angle;
    const lacet = -angle, o = offsetLacher.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), lacet), xb = -xJoueur;
    joueur.base.x = xb - o.x; joueur.base.z = Z_LACHER - o.z; joueur.base.lacet = lacet;
    guide.position.set(xb, 0.004, 0.25); guide.rotation.y = lacet; guide.visible = J.guide = true;
  }

  /* ---------- joueurs voisins (animés discrètement) ---------- */
  const rndV = graine(42);
  // Pistes ±2 seulement (plus ±1 ni -3) : sur les pistes voisines immédiates, le Mii en attente se tenait à 1,1 m de la caméra
  // de visée et sa tête masquait la piste (constaté à l'écran, 17/10/2026). Plus loin, on les voit lancer au loin. Pas de ±3 / ±4 : les manifestants assis
  // du thème CGT y sont (z -2,6).
  const voisins = [
    { k: 2, o: { peau: '#e0ac85', cheveux: '#1f150e', coiffure: 'chignon', haut: '#c4479e', bas: '#2b3446' } },
    { k: -2, o: { peau: '#8d5a3b', cheveux: '#151010', coiffure: 'court', haut: '#2bb39b', bas: '#384050' } },
  ].map((v, i) => {
    const mii = creerMii(v.o, IMG); mii.base.x = v.k * P.pas + 0.2; mii.base.z = Z_LACHER - offsetLacher.z; scene.add(decor(mii.racine));
    const b = new THREE.Mesh(boule.geometry, new THREE.MeshPhysicalMaterial({ color: [C.violet, '#4f6fc2', C.orange][i], roughness: 0.15, clearcoat: 1 })); scene.add(decor(b));
    return { ...v, mii, boule: b, etat: 'attente', t: rndV() * 4, prochain: 3 + rndV() * 8, ph: rndV() * 10, bx: 0, bv: 7, crochet: 0, impact: false, reset: 0, quilles: [] };
  });
  surTheme.push((th) => voisins.forEach((v) => { v.mii.chasuble.visible = th === 'cgt'; v.boule.material.color.set(th === 'cgt' ? C.rouge : [C.violet, '#4f6fc2', C.orange][voisins.indexOf(v)]); }));
  const etatsQuillesV = VOISINES.map(() => EMPLACEMENTS.map((e) => ({ ...e, tombe: false, dir: 0, d: 0, delai: 0, p: 0 })));
  const _mq = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _ax = new THREE.Vector3(), _pp = new THREE.Vector3(), _un = new THREE.Vector3(1, 1, 1);
  function majQuillesVoisines(dt) {
    VOISINES.forEach((k, li) => etatsQuillesV[li].forEach((q, i) => {
      if (q.tombe) q.p = Math.min(1, q.p + (q.delai > 0 ? 0 : dt / 0.35)), q.delai -= dt;
      const a = lisse(q.p) * Math.PI / 2;
      _ax.set(Math.cos(q.dir + Math.PI / 2), 0, Math.sin(q.dir + Math.PI / 2)); _qq.setFromAxisAngle(_ax, -a);
      _pp.set(k * P.pas + q.x + Math.cos(q.dir) * q.d * q.p, Math.sin(a) * 0.055, q.z + Math.sin(q.dir) * q.d * q.p);
      quillesV.setMatrixAt(li * 10 + i, _mq.compose(_pp, _qq, _un));
    }));
    quillesV.instanceMatrix.needsUpdate = true;
  }
  function majVoisin(v, dt, temps) {
    v.t += dt; let p; const T = 0.6, li = VOISINES.indexOf(v.k);
    if (v.etat === 'attente') { p = poseGlobale(0, temps + v.ph); if (v.t > v.prochain) { v.etat = 'elan'; v.t = 0; } }
    else if (v.etat === 'elan') {
      const g = v.t / T;
      if (g < 4) p = poseGlobale(g, temps + v.ph);
      else {
        if (!v.lance) { v.lance = true; v.bx = v.k * P.pas + (rndV() - 0.5) * 0.3; v.bz = 0; v.crochet = (rndV() - 0.3) * 0.25; v.impact = false; }
        p = poseGlobale(Math.min(5, 4 + (v.t - 4 * T) / 0.7), temps + v.ph);
        if (v.t > 4 * T + 1.6) { v.etat = 'retour'; v.t = 0; }
      }
    } else {
      const d = 3.6, s = Math.min(1, v.t / d);
      p = poseMarche(temps, FIN_ELAN * (1 - lisse(s))); p.lacet = s < 0.88 ? Math.PI : lerp(Math.PI, 2 * Math.PI, (s - 0.88) / 0.12);
      if (s >= 1) { v.etat = 'attente'; v.t = 0; v.prochain = 6 + rndV() * 10; v.lance = false; }
    }
    poser(v.mii, p);
    if (!v.lance || v.etat === 'attente') {
      v.mii.racine.updateMatrixWorld(true); v.mii.prise.getWorldPosition(v.boule.position); v.boule.visible = true;
    } else if (v.bz < P.zFond) {
      v.bz += v.bv * dt; const u = Math.max(0, v.bz - 9) / 9.3;
      v.boule.position.set(v.bx + v.crochet * u * u, P.rB, v.bz); v.boule.rotateX(v.bv * dt / P.rB);
      if (!v.impact && v.bz > P.zQ1 - 0.2) {
        v.impact = true; const tout = rndV() < 0.45;
        etatsQuillesV[li].forEach((q) => { if (tout || rndV() < 0.7) { q.tombe = true; q.dir = Math.atan2(q.z - P.zQ1 + 0.4, q.x - (v.boule.position.x - v.k * P.pas)) + (rndV() - 0.5) * 1.2; q.d = 0.15 + rndV() * 0.45; q.delai = (q.z - P.zQ1) / 2.5; q.p = 0; } });
        v.reset = temps + 4.2;
      }
      if (v.bz > P.zFin + 0.3) v.boule.visible = false;
    }
    if (v.reset && temps > v.reset) { v.reset = 0; etatsQuillesV[li].forEach((q) => { q.tombe = false; q.p = 0; }); }
  }

  /* ---------- foule (instanciée) : spectateurs (Bony) / manifestants (CGT) ---------- */
  const FOULE = (() => {
    const g = geoMii(), CAP = 96;
    const inst = (geo, mat, n) => { const im = new THREE.InstancedMesh(geo, mat, n); im.frustumCulled = false; im.count = 0; im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); scene.add(decor(im)); return im; };
    const blanc = (r) => std('#ffffff', r);
    const I = {
      torse: inst(g.corps, blanc(0.65), CAP), chasuble: inst(g.chasuble, matChasuble(IMG), CAP), tete: inst(g.tete, blanc(0.55), CAP), cheveux: inst(g.cheveux, blanc(0.5), CAP),
      oeil: inst(g.oeil, MAT_NOIR, CAP * 2), bras: inst(g.brasEntier, blanc(0.62), CAP * 2), main: inst(g.main, blanc(0.55), CAP * 2),
      cuisse: inst(g.cuisse, blanc(0.7), CAP * 2), mollet: inst(g.mollet, blanc(0.7), CAP * 2), pied: inst(g.chaussure, blanc(0.45), CAP * 2),
    };
    // accessoires (CGT)
    const texDrapeau = (() => { const c = toile(256, 176), x = c.getContext('2d'); x.fillStyle = C.rouge; x.fillRect(0, 0, 256, 176); logo(x, IMG.cgt, 128, 88, 100 / RATIO_CGT * 1.0, RATIO_CGT); return texture(c); })();
    const geoDrapeau = new THREE.PlaneGeometry(0.8, 0.55, 12, 3).translate(0.4, -0.275, 0);
    const matDrapeau = onduler(std('#ffffff', 0.7, 0, { map: texDrapeau, side: THREE.DoubleSide }), { amp: 0.06, onde: 1.1, vit: 5, poids: 'x' });
    const ACC = { hampe: inst(new THREE.CylinderGeometry(0.014, 0.014, 1.9, 6).translate(0, 0.95, 0), std('#c8c8c8', 0.4, 0.6), 60), drapeau: inst(geoDrapeau, matDrapeau, 60), baton: inst(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5).translate(0, 0.3, 0), std('#8a6a45', 0.8), 40), torche: inst(new THREE.CylinderGeometry(0.02, 0.022, 0.22, 8), std('#2b2d31', 0.6), 12), flamme: inst(new THREE.SphereGeometry(0.035, 8, 6), neon('#ff4a2a', 4), 12) };
    const pancartes = PANCARTES.map((txt, i) => {
      const c = toile(256, 172), x = c.getContext('2d'), r = i % 2 === 0; x.fillStyle = r ? C.rouge : '#f4f1ea'; x.fillRect(0, 0, 256, 172);
      x.strokeStyle = r ? '#fff' : C.rouge; x.lineWidth = 6; x.strokeRect(8, 8, 240, 156); x.fillStyle = r ? '#fff' : C.rouge; x.textAlign = 'center'; x.textBaseline = 'middle';
      texteAjuste(x, txt, 128, 88, 220, `{t}px ${F_MANIF}`, 54);
      const geo = mergeGeometries([new THREE.PlaneGeometry(0.62, 0.42).translate(0, 0, 0.004), new THREE.PlaneGeometry(0.62, 0.42).rotateY(Math.PI).translate(0, 0, -0.004)]);
      return inst(geo, std('#ffffff', 0.8, 0, { map: texture(c) }), 30);
    });
    let gens = [], drapeauxFixes = [];
    const Mb = new THREE.Matrix4(), Mt = new THREE.Matrix4(), Mh = new THREE.Matrix4(), Ms = new THREE.Matrix4(), Mk = new THREE.Matrix4(), L = new THREE.Matrix4(), T2 = new THREE.Matrix4(), mainPos = new THREE.Vector3();
    const cpt = {};
    const pose = (im, m, c) => { const i = cpt[im.uuid] = (cpt[im.uuid] || 0); im.setMatrixAt(i, m); if (c) im.setColorAt(i, c); cpt[im.uuid] = i + 1; };
    const cP = new THREE.Color(), cC = new THREE.Color(), cH = new THREE.Color(), cB = new THREE.Color(), cS = new THREE.Color(), cBlanc = new THREE.Color('#ffffff'), cNoir = new THREE.Color('#1a1a1a');
    return {
      vider() { gens = []; drapeauxFixes = []; },
      ajouter(o) { gens.push({ s: 1, lacet: 0, assis: 0, mode: 'calme', ph: Math.random() * 10, ...o }); },
      drapeauFixe(x, y, z, lacet) { drapeauxFixes.push({ x, y, z, lacet }); },
      emetteurs() { return gens.filter((p) => p.porte === 'fumigene'); },
      maj(temps, acclame) {
        for (const k in cpt) cpt[k] = 0;
        for (const p of gens) {
          const fete = acclame > temps && p.mode !== 'manif', manif = p.mode === 'manif';
          const rebond = manif ? Math.abs(Math.sin(temps * 3.3 + p.ph)) * 0.05 : fete ? Math.abs(Math.sin(temps * 7 + p.ph)) * 0.07 * (p.assis ? 0.3 : 1) : Math.sin(temps * 1.7 + p.ph) * 0.004;
          const hb = p.assis === 1 ? 0.5 : p.assis === 2 ? 0.12 : 0.8;
          compo(Mb, p.x, rebond, p.z, 0, p.lacet, 0, p.s);
          Mt.multiplyMatrices(Mb, compo(L, 0, hb - 0.03, 0, p.assis ? -0.05 : 0.04 + Math.sin(temps * 0.8 + p.ph) * 0.02, Math.sin(temps * 0.5 + p.ph) * 0.08, 0));
          cP.set(p.peau); cC.set(p.cheveux); cH.set(p.haut); cB.set(p.bas);
          pose(I.torse, Mt, cH); if (p.chasuble) pose(I.chasuble, Mt, cBlanc);
          Mh.multiplyMatrices(Mt, compo(L, 0, 0.7, 0, Math.sin(temps * 0.9 + p.ph) * 0.05, Math.sin(temps * 0.6 + p.ph * 2) * 0.25, 0));
          pose(I.tete, T2.multiplyMatrices(Mh, compo(L, 0, 0, 0, 0, 0, 0, 1, 1.04, 0.97)), cP);
          pose(I.cheveux, T2.multiplyMatrices(Mh, compo(L, 0, 0, 0, -0.42)), cC);
          for (const s of [-1, 1]) pose(I.oeil, T2.multiplyMatrices(Mh, compo(L, 0.068 * s, 0.02, 0.172, 0, 0, 0, 0.72, 1.25 * clignement(temps + p.ph), 0.55)), cNoir);
          // bras
          for (const s of [-1, 1]) {
            let ax = 0.05, az = 0.12 * s;
            if (fete) { ax = -2.75 + Math.sin(temps * 9 + p.ph + s) * 0.25; az = 0.4 * s; }
            else if (manif) {
              if (s === -1 && p.porte) { ax = p.porte === 'pancarte' ? -2.55 + Math.sin(temps * 2.4 + p.ph) * 0.18 : -2.65; az = -0.1; }
              else if (s === 1 && p.porte === 'pancarte') { ax = -2.55 + Math.sin(temps * 2.4 + p.ph) * 0.18; az = 0.1; }
              else if (p.poing && s === -1) { ax = -2.5 + Math.sin(temps * 6 + p.ph) * 0.45; az = -0.2; }
              else { ax = -0.2 + Math.sin(temps * 3.3 + p.ph + s) * 0.15; az = 0.15 * s; }
            } else if (p.assis) { ax = -0.75; az = 0.05 * s; }
            Ms.multiplyMatrices(Mt, compo(L, 0.2 * s, 0.43, 0, ax, 0, az));
            pose(I.bras, Ms, cH); Mk.multiplyMatrices(Ms, compo(L, 0, -0.5, 0)); pose(I.main, Mk, cP);
            if (s === -1 && p.porte && manif) {
              mainPos.setFromMatrixPosition(Mk);
              if (p.porte === 'drapeau') {
                pose(ACC.hampe, compo(L, mainPos.x, mainPos.y - 0.5, mainPos.z, 0, p.lacet, 0));
                pose(ACC.drapeau, compo(L, mainPos.x, mainPos.y + 1.38, mainPos.z, 0, p.lacet + 0.3, 0));
              } else if (p.porte === 'pancarte') {
                pose(ACC.baton, compo(L, mainPos.x + 0.2 * Math.cos(p.lacet), mainPos.y - 0.2, mainPos.z - 0.2 * Math.sin(p.lacet), 0, p.lacet, 0));
                pose(pancartes[p.txt % pancartes.length], compo(L, mainPos.x + 0.2 * Math.cos(p.lacet), mainPos.y + 0.48, mainPos.z - 0.2 * Math.sin(p.lacet), 0, p.lacet, 0));
              } else if (p.porte === 'fumigene') {
                pose(ACC.torche, compo(L, mainPos.x, mainPos.y + 0.06, mainPos.z)); pose(ACC.flamme, compo(L, mainPos.x, mainPos.y + 0.19, mainPos.z, 0, 0, 0, 1 + Math.sin(temps * 30 + p.ph) * 0.3));
                p.feu = p.feu || new THREE.Vector3(); p.feu.set(mainPos.x, mainPos.y + 0.2, mainPos.z);
              }
            }
          }
          // jambes
          const hx = p.assis === 1 ? -1.5 : p.assis === 2 ? -1.45 : 0, kx = p.assis === 1 ? 1.5 : p.assis === 2 ? 0.1 : 0.04;
          for (const s of [-1, 1]) {
            Ms.multiplyMatrices(Mb, compo(L, 0.095 * s, hb, 0, hx + (p.assis ? 0 : Math.sin(temps * 3.3 + p.ph + s) * (manif ? 0.06 : 0)), 0, p.assis === 2 ? 0.12 * s : 0));
            pose(I.cuisse, Ms, cB); Mk.multiplyMatrices(Ms, compo(L, 0, -0.38, 0, kx)); pose(I.mollet, Mk, cB);
            T2.multiplyMatrices(Mk, compo(L, 0, -0.36, 0, -(hx + kx) * 0.9)); Ms.multiplyMatrices(T2, compo(L, 0, -0.02, 0.045)); pose(I.pied, Ms, cS.set(p.chaussures || '#1d2433'));
          }
        }
        for (const d of drapeauxFixes) { pose(ACC.hampe, compo(L, d.x, d.y, d.z, 0, d.lacet, 0, 1, 1.25, 1)); pose(ACC.drapeau, compo(L, d.x, d.y + 2.36, d.z, 0, d.lacet, 0, 1.4)); }
        for (const im of [...Object.values(I), ...Object.values(ACC), ...pancartes]) {
          im.count = cpt[im.uuid] || 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        }
      },
    };
  })();
  const PEAUX = ['#f1c7a5', '#e0ac85', '#c68b62', '#8d5a3b', '#5c3a26', '#f6d2b8'], CHEVEUX = ['#2b1d14', '#6b4a2e', '#c9a36b', '#151010', '#8a8a8a', '#a0522d'];
  const HAUTS_BONY = [C.orange, C.violet, C.nuit, '#ffffff', '#4f6fc2', '#2bb39b', '#f2b632', '#c4479e'], HAUTS_MANIF = ['#2d3a4f', '#3b3f45', '#6b2737', '#2f5d50', '#7a6a55', '#1f2933', '#8b8f94'];
  function peupler(th) {
    FOULE.vider(); const r = graine(th === 'cgt' ? 1312 : 77), choix = (t) => t[Math.floor(r() * t.length)];
    const base = () => ({ peau: choix(PEAUX), cheveux: choix(CHEVEUX), bas: choix(['#2b3446', '#384050', '#1f2933', '#4a4f5a']), chaussures: choix(['#1d2433', '#e9e9ea', '#5a3b22']), s: 0.92 + r() * 0.12, ph: r() * 10 });
    if (th === 'bony') {
      for (let k = -4; k <= 4; k++) for (const dx of [-0.38, 0.38]) if (r() < 0.6) FOULE.ajouter({ ...base(), x: k * P.pas + dx, z: -7.28, assis: 1, haut: choix(HAUTS_BONY), lacet: (r() - 0.5) * 0.3 });
      [[5.5, -8.8, Math.PI], [6.4, -8.75, Math.PI + 0.3], [7.3, -8.85, Math.PI - 0.2], [-7.9, 3, Math.PI / 2], [-7.95, 9.5, Math.PI / 2 - 0.3], [7.9, 6, -Math.PI / 2]].forEach(([x, z, l]) => FOULE.ajouter({ ...base(), x, z, lacet: l, haut: choix(HAUTS_BONY) }));
    } else {
      const libre = (x, z) => !(Math.abs(x) < 2.4 && z > -8.2) && !(x < -5.1 && z < -8.4);
      for (let i = 0, n = 0; i < 400 && n < 40; i++) {
        const x = -8.2 + r() * 16.4, z = -10.7 + r() * 5.6; if (!libre(x, z)) continue; n++;
        const v = r(); FOULE.ajouter({ ...base(), x, z, mode: 'manif', lacet: (r() - 0.5) * 0.7, chasuble: r() < 0.55, haut: choix(HAUTS_MANIF), porte: v < 0.2 ? 'drapeau' : v < 0.36 ? 'pancarte' : v < 0.42 ? 'fumigene' : null, poing: r() < 0.4, txt: Math.floor(r() * 5) });
      }
      for (const s of [-1, 1]) for (let z = 0.8; z < 16; z += 1.25 + r() * 0.6) {
        const v = r(); FOULE.ajouter({ ...base(), x: s * (8.15 + r() * 0.35), z, mode: 'manif', lacet: -s * Math.PI / 2 - 0.35 * s, chasuble: r() < 0.6, haut: choix(HAUTS_MANIF), porte: v < 0.22 ? 'drapeau' : v < 0.4 ? 'pancarte' : v < 0.44 ? 'fumigene' : null, poing: r() < 0.5, txt: Math.floor(r() * 5) });
      }
      for (const k of [-4, -3, 3, 4]) for (let i = 0; i < 3; i++) FOULE.ajouter({ ...base(), x: k * P.pas + (i - 1) * 0.5, z: -2.6 + (i % 2) * 0.7, assis: 2, mode: 'calme', lacet: Math.PI + (r() - 0.5) * 0.6, chasuble: true, haut: choix(HAUTS_MANIF) });
      for (const s of [-1, 1]) for (let z = 1; z < 16; z += 4.1) FOULE.drapeauFixe(s * 7.72, 0, z, -s * Math.PI / 2);
    }
  }

  /* ---------- décor CGT : banderoles, Vauban, ballons, stand merguez, tracts ---------- */
  const ballons = [];
  {
    const banderole = (txt, l, h) => {
      const W = 2048, H = Math.round(W * h / l), c = toile(W, H), x = c.getContext('2d');
      x.fillStyle = C.rouge; x.fillRect(0, 0, W, H); x.strokeStyle = '#fff'; x.lineWidth = H * 0.05; x.strokeRect(H * 0.08, H * 0.08, W - H * 0.16, H - H * 0.16);
      logo(x, IMG.cgt, H * 0.62, H / 2, H * 0.72 / RATIO_CGT, RATIO_CGT);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; texteAjuste(x, txt, W / 2 + H * 0.5, H * 0.53, W - H * 1.8, `{t}px ${F_MANIF}`, H * 0.56);
      const m = onduler(std('#ffffff', 0.75, 0, { map: texture(c), side: THREE.DoubleSide }), { amp: 0.045, onde: 0.35, vit: 1.6, poids: 'y' });
      return new THREE.Mesh(new THREE.PlaneGeometry(l, h, 40, 4), m);
    };
    const poser3 = (o, x, y, z, ry) => { o.position.set(x, y, z); o.rotation.y = ry; groupeCgt.add(o); return o; };
    poser3(banderole(SLOGANS[0], 6, 0.85), -3.7, 3.35, 6.2, Math.PI);
    poser3(banderole(SLOGANS[3], 5.6, 0.8), 3.6, 3.4, 12.2, Math.PI);
    poser3(banderole(SLOGANS[4], 5, 0.8), X_MUR - 0.08, 2.5, 4.5, -Math.PI / 2);
    poser3(banderole(SLOGANS[1], 6, 0.8), -X_MUR + 0.08, 2.5, 7.5, Math.PI / 2);
    poser3(banderole(SLOGANS[5], 5.5, 0.8), X_MUR - 0.08, 2.5, 13.5, -Math.PI / 2);
    poser3(banderole(SLOGANS[7], 5.5, 0.8), -X_MUR + 0.08, 2.5, -2, Math.PI / 2);
    // Avancée devant la foule (z -5,3, au-dessus des têtes) : à z -9,6 elle masquait l'enseigne « GRÈVE GÉNÉRALE » de la
    // murale du fond dans le plan de célébration (constaté à l'écran, 17/10/2026).
    poser3(banderole(SLOGANS[6], 6.5, 0.8), 0, 3.3, -5.3, 0);
    const cordes = []; for (const [x, z, l] of [[-3.7, 6.2, 6], [3.6, 12.2, 5.6]]) for (const s of [-1, 1]) cordes.push({ x: x + s * l / 2, y: 4.1, z });
    groupeCgt.add(instances(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 4), std('#dddddd', 0.6), cordes));
    // barrières Vauban
    const vb = [];
    for (const x of [-7.4, -5.3, -3.2, 3.2, 5.3, 7.4]) vb.push({ x, z: -4.95 });
    for (const s of [-1, 1]) for (let z = -3.6; z < 16.5; z += 2.08) vb.push({ x: s * 7.72, z, ry: Math.PI / 2 });
    groupeCgt.add(instances(geoVauban(), std('#c7ccd3', 0.38, 0.75), vb));
    // ballons CGT
    const cb = toile(512, 256), xbl = cb.getContext('2d'); xbl.fillStyle = C.rouge; xbl.fillRect(0, 0, 512, 256);
    for (const u of [128, 384]) logo(xbl, IMG.cgt, u, 128, 70 / RATIO_CGT * 1.0, RATIO_CGT);
    const rb = graine(8);
    for (let i = 0; i < 18; i++) { const a = vb[Math.floor(rb() * vb.length)]; ballons.push({ ax: a.x + (rb() - 0.5) * 1.6, az: a.z + (rb() - 0.5) * 1.2, h: 2.3 + rb() * 1.2, ph: rb() * 6 }); }
    const geoBallon = new THREE.SphereGeometry(0.24, 20, 14); geoBallon.scale(1, 1.18, 1);
    ballons.mesh = new THREE.InstancedMesh(geoBallon, new THREE.MeshPhysicalMaterial({ map: texture(cb), roughness: 0.25, clearcoat: 0.8 }), ballons.length); ballons.mesh.frustumCulled = false;
    const gf = new THREE.BufferGeometry(); gf.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ballons.length * 6), 3));
    ballons.fils = new THREE.LineSegments(gf, new THREE.LineBasicMaterial({ color: '#e8e8e8' })); ballons.fils.frustumCulled = false;
    groupeCgt.add(ballons.mesh, ballons.fils);
    // stand merguez (au fond, côté droit du joueur)
    const stand = new THREE.Group(); stand.position.set(-6.7, 0, -9.7);
    const cs = toile(512, 256), xs = cs.getContext('2d'); for (let i = 0; i < 16; i++) { xs.fillStyle = i % 2 ? '#fff' : C.rouge; xs.fillRect(i * 32, 0, 32, 256); }
    const comptoirS = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.95, 0.8), std('#ffffff', 0.7, 0, { map: texture(cs) })); comptoirS.position.y = 0.475; stand.add(comptoirS);
    const toit = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.1), std('#ffffff', 0.7, 0, { map: texture(cs) })); toit.position.set(0, 2.2, 0.1); toit.rotation.x = 0.12; stand.add(toit);
    stand.add(instances(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), matMetal, [[-1.2, -0.3], [1.2, -0.3], [-1.2, 0.5], [1.2, 0.5]].map(([x, z]) => ({ x, y: 1.1, z }))));
    const ce = toile(512, 128), xe = ce.getContext('2d'); xe.fillStyle = C.rouge; xe.fillRect(0, 0, 512, 128); logo(xe, IMG.cgt, 60, 64, 90 / RATIO_CGT, RATIO_CGT);
    xe.fillStyle = '#fff'; xe.textAlign = 'center'; xe.textBaseline = 'middle'; texteAjuste(xe, 'MERGUEZ', 290, 66, 380, `{t}px ${F_MANIF}`, 84);
    const enseigne = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), new THREE.MeshStandardMaterial({ map: texture(ce), emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0.3 }));
    enseigne.material.emissiveMap = enseigne.material.map; enseigne.position.set(0, 1.72, 0.66); stand.add(enseigne);
    const grill = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.5), std('#2b2d31', 0.5, 0.6)); grill.position.set(0, 0.98, 0); stand.add(grill);
    stand.add(instances(new THREE.CapsuleGeometry(0.022, 0.16, 3, 6), std('#8a3b1a', 0.4), [...Array(10)].map((_, i) => ({ x: -0.55 + i * 0.12, y: 1.03, z: (i % 2) * 0.1 - 0.05, rx: Math.PI / 2 }))));
    groupeCgt.add(stand); ballons.grill = new THREE.Vector3(-6.7, 1.1, -9.7);
    // tracts au sol
    const ct = toile(64, 92), xt = ct.getContext('2d'); xt.fillStyle = '#f6f3ec'; xt.fillRect(0, 0, 64, 92); xt.fillStyle = C.rouge; xt.fillRect(6, 6, 52, 18); xt.fillStyle = '#888'; for (let i = 0; i < 7; i++) xt.fillRect(6, 32 + i * 8, 52 - (i % 3) * 8, 3);
    const rt = graine(21), tracts = [];
    for (let i = 0; i < 150; i++) { const x = -8.3 + rt() * 16.6, z = -11 + rt() * 9.5; if (Math.abs(x) < 0.9 && z > -5) continue; tracts.push({ x, y: 0.003 + i * 0.00001, z, rx: -Math.PI / 2, rz: rt() * 6.28 }); }
    groupeCgt.add(instances(new THREE.PlaneGeometry(0.15, 0.21), std('#ffffff', 0.9, 0, { map: texture(ct) }), tracts));
  }
  decor(groupeCgt); decor(groupeBony);

  /* =====================================================================================
     ÉTAT DE LECTURE, CAMÉRA, EFFETS
     ===================================================================================== */
  let ordreQuilles = EMPLACEMENTS.map((e) => ({ ...e }));
  const lect = { images: null, impactT: null, premier: false, offsetQ: 0 };
  const decalage = new THREE.Vector3(), mainBoule = new THREE.Vector3(), _mb = new THREE.Quaternion(), qTrous = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -2.448);
  function poserQuilles(debout) {
    ordreQuilles = debout.map((d) => ({ ...d }));
    debout.forEach((d, i) => quilles.setMatrixAt(i, compo(_M, d.x, 0, d.z, 0, d.rot || 0, 0)));
    quilles.count = debout.length; quilles.instanceMatrix.needsUpdate = true;
  }
  poserQuilles(EMPLACEMENTS);

  const cam = { mode: 'visee', pos: new THREE.Vector3(), cible: new THREE.Vector3(), fov: 42, sec: 0, vit: 3 };
  const cPos = new THREE.Vector3(), cCib = new THREE.Vector3(), _jp = new THREE.Vector3();
  function cibleCamera(mode) {
    let fov = 42;
    if (mode === 'suivi') {
      const b = boule.position, z = Math.min(b.z, 13.8), d = Math.exp(-Math.max(0, b.z) / 3.2);
      cPos.set(b.x * 0.55 - 0.42 * d, 0.62 + 0.75 * d, z - 2.3); cCib.set(b.x * 0.35, 0.12, Math.min(b.z + 4.5, 18.7)); fov = 46;
    } else if (mode === 'quilles') { cPos.set(0.46, 0.4, 16.8); cCib.set(-0.03, 0.2, 18.78); fov = 40; }
    else if (mode === 'celebration') { joueur.racine.getWorldPosition(_jp); cPos.set(_jp.x - 0.45, 1.32, _jp.z + 2.75); cCib.set(_jp.x, 1.02, _jp.z); fov = 44; }
    else { const j = joueur.base; cPos.set(j.x - 0.5, 2.1, j.z - 2.55); cCib.set(-J.xJoueur * 0.35, 0.45, 14); fov = 42; }
    return fov;
  }
  function changerCamera(mode, immediat) {
    cam.mode = mode; cam.vit = { visee: 3, suivi: 5.5, quilles: 3.2, celebration: 2.4 }[mode] || 3;
    if (immediat) { cam.fov = cibleCamera(mode); cam.pos.copy(cPos); cam.cible.copy(cCib); }
  }
  placerJoueur(0, 0); poser(joueur, poseGlobale(0, 0)); changerCamera('visee', true);

  const flash = { neon: 0, acclame: 0 };
  const COULEURS = { bony: [C.orange, C.violet, C.nuit, '#ffffff', '#ffb199', '#c66be0'], cgt: [C.rouge, C.rougeLogo, '#ffffff', C.rouge] };
  function effet(nom, o = {}) {
    const th = etat.theme;
    if (nom === 'secousse') cam.sec = Math.max(cam.sec, clamp(o.force ?? 1, 0, 3) * 0.035);
    else if (nom === 'eclats') {
      const f = clamp(Math.log10(1 + (o.force ?? 300)) / 3, 0.3, 1.6);
      PART.eclats(o.x ?? 0, o.y ?? 0.15, o.z ?? P.zQ1, Math.round(6 + f * 14), f);
      PART.fumee(o.x ?? 0, (o.y ?? 0.1) * 0.5, o.z ?? P.zQ1, Math.round(3 + f * 5), { c: '#e6dccb', vie: 0.9, t0: 0.08, t1: 0.45, a: 0.35, vy: 0.3 });
      PART.etincelles(o.x ?? 0, o.y ?? 0.2, o.z ?? P.zQ1, Math.round(4 + f * 6));
    } else if (nom === 'strike' || nom === 'spare' || nom === 'confettis') {
      const n = nom === 'strike' ? 320 : nom === 'spare' ? 140 : (o.n || 160);
      const x = o.x ?? (nom === 'confettis' ? joueur.racine.position.x : 0), y = o.y ?? (nom === 'confettis' ? 2.2 : 0.35), z = o.z ?? (nom === 'confettis' ? joueur.racine.position.z + 0.6 : 18.6);
      PART.confettis(x, y, z, n, COULEURS[th], nom === 'confettis' ? 2.5 : 4.5, 1.1);
      if (nom !== 'confettis') {
        PART.pluie(-2, 2, 3.4, -1.5, 3, nom === 'strike' ? 260 : 90, COULEURS[th]);
        PART.etincelles(0, 0.4, 18.5, nom === 'strike' ? 60 : 25, th === 'cgt' ? '#ff6040' : '#ffd9b0');
        flash.neon = 1; flash.acclame = etat.temps + 3.5;
        annonce.txt = ANNONCES[th][nom] || ''; annonce.sous = ''; annonce.fin = etat.temps + 3.2; dessinerEcran();
        if (nom === 'strike') cam.sec = Math.max(cam.sec, 0.03);
        if (th === 'cgt') for (const e of FOULE.emetteurs()) if (e.feu) PART.fumee(e.feu.x, e.feu.y, e.feu.z, 14, { c: '#ff3b2a', vie: 4, t0: 0.3, t1: 1.8, a: 0.42, vy: 0.7, disp: 0.3 });
      }
    }
  }

  /* ---------- qualité adaptative (puce graphique intégrée) ---------- */
  const _tampon = new THREE.Vector2();
  const qualite = { niveau: 0, acc: 0, n: 0, img: 0, dernier: performance.now() };
  let largeur = canvas.clientWidth || 1280, hauteur = canvas.clientHeight || 720;
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.35, 1.3);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  function redimensionner(w, h) {
    largeur = Math.max(1, w | 0); hauteur = Math.max(1, h | 0);
    renderer.setPixelRatio(ratioPixels); renderer.setSize(largeur, hauteur, false);
    composer.setPixelRatio(ratioPixels); composer.setSize(largeur, hauteur);
    refl.getRenderTarget().setSize(Math.ceil(largeur * ratioPixels * fReflet), Math.ceil(hauteur * ratioPixels * fReflet));
    camera.aspect = largeur / hauteur; camera.updateProjectionMatrix();
  }
  function surveiller() {
    const now = performance.now(), dtr = now - qualite.dernier; qualite.dernier = now;
    if (++qualite.img < 90 || dtr > 250 || qualite.niveau >= 3) return;
    qualite.acc += dtr; qualite.n++;
    if (qualite.n >= 120) {
      const moy = qualite.acc / qualite.n; qualite.acc = qualite.n = 0;
      if (moy > 24) {
        qualite.niveau++; // paliers : définition 1 → plus de bloom → reflets et ombres allégés
        if (ratioPixels > 1) ratioPixels = 1;
        else if (bloom.enabled) bloom.enabled = false;
        else { qualite.niveau = 3; fReflet = 0.33; soleil.shadow.mapSize.set(512, 512); spot.shadow.mapSize.set(512, 512); soleil.shadow.map?.dispose(); spot.shadow.map?.dispose(); soleil.shadow.map = spot.shadow.map = null; }
        redimensionner(largeur, hauteur);
      }
    }
  }

  /* ---------- décor de manif additionnel (module séparé, facultatif) ----------
     decor-manif.js : export creerDecorManif(THREE, { logoTexture, zoneInterdite }) → { groupe, maj(dt, t), dispose() }.
     Monté UNIQUEMENT en thème CGT ; s'il n'existe pas (encore), on s'en passe sans erreur. */
  const manif = { mod: null, chargement: null, inst: null, absent: false };
  const ZONE_INTERDITE = { x: [-2.4, 2.4], z: [-8.2, 21], note: 'piste principale, joueur, caméras de visée / suivi / célébration' };
  function monterManif() {
    if (manif.inst || manif.absent || etat.theme !== 'cgt') return;
    if (!manif.chargement) manif.chargement = import(new URL('./decor-manif.js', import.meta.url).href + new URL(import.meta.url).search)
      .then((m) => { manif.mod = m; }).catch(() => { manif.absent = true; });
    manif.chargement.then(() => {
      if (manif.inst || !manif.mod || etat.theme !== 'cgt') return;
      try {
        const logoTexture = IMG.cgt ? (() => { const t = new THREE.Texture(IMG.cgt); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; })() : undefined;
        manif.inst = manif.mod.creerDecorManif(THREE, { logoTexture, zoneInterdite: ZONE_INTERDITE });
        decor(manif.inst.groupe); scene.add(manif.inst.groupe);
      } catch (e) { console.warn('[rendu] decor-manif.js', e); manif.absent = true; manif.inst = null; }
    });
  }
  function demonterManif() {
    if (!manif.inst) return;
    scene.remove(manif.inst.groupe);
    try { manif.inst.dispose(); } catch (e) { console.warn('[rendu] decor-manif.js', e); }
    manif.inst = null;
  }

  /* ---------- thème ---------- */
  function setTheme(th) {
    etat.theme = th === 'cgt' ? 'cgt' : 'bony';
    scene.environment = environnement(etat.theme);
    groupeBony.visible = etat.theme === 'bony'; groupeCgt.visible = etat.theme === 'cgt';
    hemi.color.set(etat.theme === 'cgt' ? '#ffe9e4' : '#e8eeff'); hemi.groundColor.set(etat.theme === 'cgt' ? '#6a3a2e' : '#7a5636');
    feux.forEach((f) => { f.visible = etat.theme === 'cgt'; });
    dessinerPiste(etat.theme);
    annonce.txt = '';
    for (const f of surTheme) f(etat.theme);
    peupler(etat.theme);
    if (etat.theme === 'cgt') monterManif(); else demonterManif();
  }
  setTheme(etat.theme);
  redimensionner(largeur, hauteur);

  /* =====================================================================================
     BOUCLE D'UNE IMAGE
     ===================================================================================== */
  const neonsBase = [matNeonDeg, matNeonCgt, matRuban, matRubanCgt, plafonniers.material, rampes.material].map((m) => [m, m.color.clone()]);
  function rendre(dt = 1 / 60) {
    dt = clamp(dt || 0, 0, 0.1); etat.temps += dt; const temps = etat.temps; U_TEMPS.value = temps;
    surveiller(); renderer.info.reset();
    // joueur
    let p;
    if (J.reaction) { J.tau += dt; p = poseReaction(J.reaction, J.tau, temps); }
    else p = poseGlobale(G_PHASE(J.phase, J.t), temps);
    if (J.instantane && J.melange < 1) { J.melange = Math.min(1, J.melange + dt / 0.3); p = melangerPoses(J.instantane, p, lisse(J.melange)); }
    posePrecedente.p = p; poser(joueur, p);
    if (J.enMain) {
      joueur.racine.updateMatrixWorld(true); joueur.prise.getWorldPosition(boule.position); joueur.mainD.getWorldQuaternion(_mb); boule.quaternion.copy(_mb).multiply(qTrous);
      mainBoule.copy(boule.position); boule.visible = true;
    }
    guide.visible = J.guide && !J.reaction && (J.phase === 'attente');
    texGuide.offset.y = -(temps * 0.9 % 1);
    // tache d'ombre sous la boule
    const hb = boule.position.y - P.rB, sol = Math.abs(boule.position.x) > P.demi && boule.position.z < P.zFin ? Math.min(0, hb) : (boule.position.z > P.zFin ? -P.profFosse : 0);
    tacheBoule.visible = boule.visible && !J.enMain && boule.position.z < P.zFin + 1.2;
    tacheBoule.position.set(boule.position.x, sol + 0.003, boule.position.z); tacheBoule.material.opacity = 0.55 * clamp(1 - (hb - sol) / 0.5, 0, 1);
    // voisins, quilles voisines, foule, ballons, fumée
    for (const v of voisins) majVoisin(v, dt, temps);
    majQuillesVoisines(dt);
    FOULE.maj(temps, flash.acclame);
    if (etat.theme === 'cgt') {
      const pa = ballons.fils.geometry.attributes.position;
      ballons.forEach((b, i) => {
        const x = b.ax + Math.sin(temps * 0.7 + b.ph) * 0.12, y = b.h + Math.sin(temps * 1.3 + b.ph) * 0.08, z = b.az + Math.cos(temps * 0.6 + b.ph) * 0.1;
        ballons.mesh.setMatrixAt(i, compo(_M, x, y, z, Math.sin(temps + b.ph) * 0.1, temps * 0.3 + b.ph, 0)); pa.setXYZ(i * 2, x, y - 0.28, z); pa.setXYZ(i * 2 + 1, b.ax, 1.08, b.az);
      });
      ballons.mesh.instanceMatrix.needsUpdate = true; pa.needsUpdate = true;
      for (const e of FOULE.emetteurs()) if (e.feu && Math.random() < dt * 9) PART.fumee(e.feu.x, e.feu.y, e.feu.z, 1, { c: '#ff3b2a', vie: 4.5, t0: 0.18, t1: 1.6, a: 0.38, vy: 0.55, vx: 0.25 });
      if (Math.random() < dt * 4) PART.fumee(ballons.grill.x + (Math.random() - 0.5), ballons.grill.y, ballons.grill.z, 1, { c: '#bdb7ad', vie: 3.5, t0: 0.2, t1: 1.2, a: 0.25, vy: 0.5 });
      feux.forEach((f, i) => { f.intensity = 6 + Math.sin(temps * 23 + i * 2) * 1.8 + Math.sin(temps * 37 + i) * 1.2; });
      const em = FOULE.emetteurs().filter((e) => e.feu);
      em.slice(0, 2).forEach((e, i) => feux[i].position.copy(e.feu));
    }
    // néons et annonce
    flash.neon = Math.max(0, flash.neon - dt * 0.6);
    const k = 1 + flash.neon * (1.2 + Math.sin(temps * 22) * 0.6);
    for (const [m, c] of neonsBase) m.color.copy(c).multiplyScalar(k);
    if (annonce.txt && temps > annonce.fin) { annonce.txt = ''; dessinerEcran(); }
    matEcran.color.setScalar(annonce.txt ? 1.3 + Math.max(0, Math.sin(temps * 14)) * 0.6 : 1.2);
    if (etat.theme === 'cgt' && !annonce.txt && Math.floor(temps / 6) !== sloganEcran) { sloganEcran = Math.floor(temps / 6); dessinerEcran(); }
    if (manif.inst) { try { manif.inst.maj(dt, temps); } catch (e) { console.warn('[rendu] decor-manif.js', e); demonterManif(); manif.absent = true; } }
    PART.maj(dt, renderer.getDrawingBufferSize(_tampon).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
    // caméra
    const fov = cibleCamera(cam.mode), a = 1 - Math.exp(-cam.vit * dt);
    cam.pos.lerp(cPos, a); cam.cible.lerp(cCib, Math.min(1, a * 1.25)); cam.fov = lerp(cam.fov, fov, a);
    camera.position.copy(cam.pos); camera.fov = cam.fov;
    if (cam.sec > 0.0005) {
      cam.sec *= Math.exp(-6.5 * dt);
      camera.position.x += Math.sin(temps * 61) * cam.sec; camera.position.y += Math.sin(temps * 47 + 1) * cam.sec * 0.8; camera.position.z += Math.sin(temps * 53 + 2) * cam.sec * 0.4;
    }
    camera.lookAt(cam.cible); camera.updateProjectionMatrix();
    composer.render(dt);
  }

  /* =====================================================================================
     API (CONTRAT.md)
     ===================================================================================== */
  return {
    setTheme,
    poserQuilles,
    joueur: {
      placer(xJoueur = 0, angle = 0) {
        J.reaction = null; J.instantane = null; J.melange = 1; J.phase = 'attente'; J.t = 0;
        placerJoueur(xJoueur, angle);
      },
      elan(phase, t = 0) {
        if (J.reaction) { J.reaction = null; J.instantane = posePrecedente.p; J.melange = 0; }
        J.phase = phase; J.t = clamp(t, 0, 1);
      },
      reaction(type) {
        J.instantane = posePrecedente.p; J.melange = 0; J.reaction = type; J.tau = 0;
        // annonce par défaut, sauf si jeu.js en affiche déjà une (R.annonce)
        if ((type === 'gouttiere' || (type === 'rate' && etat.theme === 'cgt')) && !(annonce.txt && etat.temps < annonce.fin)) { annonce.txt = ANNONCES[etat.theme][type]; annonce.sous = ''; annonce.fin = etat.temps + 2.8; dessinerEcran(); }
        if (type === 'strike' || type === 'spare') flash.acclame = etat.temps + 3.5;
      },
    },
    boule: {
      enMain(v) { J.enMain = !!v; if (v) boule.visible = true; },
    },
    lecture(images, impactT = null) {
      lect.images = images; lect.impactT = impactT; lect.premier = true; J.enMain = false; boule.visible = true;
      // origine des quilles : base (y ≈ 0 debout, convention d'emplacements()) ou centre de masse → on compense
      const q0 = images?.[0]?.quilles; lect.offsetQ = 0;
      if (q0?.length) { const ys = q0.map((q) => q[1]).sort((a, b) => a - b), med = ys[Math.floor(ys.length / 2)]; if (med > 0.05 && med < 0.3) lect.offsetQ = med; }
    },
    image(img, dt = 1 / 60) {
      if (!img) return;
      const b = img.boule;
      if (b) {
        boule.position.set(b[0], b[1], b[2]); boule.quaternion.set(b[3], b[4], b[5], b[6]);
        if (lect.premier) { lect.premier = false; decalage.copy(mainBoule).sub(boule.position); if (decalage.length() > 1.2) decalage.set(0, 0, 0); }
        decalage.multiplyScalar(Math.exp(-(dt || 1 / 60) * 14)); boule.position.add(decalage);
      }
      const qs = img.quilles || [], n = Math.min(qs.length, quilles.count), off = lect.offsetQ;
      for (let i = 0; i < n; i++) {
        const q = qs[i]; _qq.set(q[3], q[4], q[5], q[6]); _pp.set(0, -off, 0).applyQuaternion(_qq).add(_v.set(q[0], q[1], q[2]));
        quilles.setMatrixAt(i, _mq.compose(_pp, _qq, _un));
      }
      quilles.instanceMatrix.needsUpdate = true;
    },
    camera(mode, o = {}) { changerCamera(mode, !!o.immediat); },
    /** Ajout (intégration, 17/10/2026) : l'écran au-dessus de la piste affiche l'annonce de jeu.js — titre = terme de
     *  bowling, sous-titre facultatif (la blague en thème CGT). */
    annonce(titre, sous = '', duree = 3.2) { annonce.txt = titre || ''; annonce.sous = sous || ''; annonce.fin = etat.temps + duree; dessinerEcran(); },
    effet,
    rendre,
    redimensionner,
    get theme() { return etat.theme; },
    debug: { scene, camera, renderer, qualite, J, cam },
  };
}
