// @ts-nocheck — moteur de la maquette CONVERTI (maquettes/ux/mascottes.html : makeCat, Rig, Buddy), comportement
// identique sauf les retouches marquées [GEARBOX]. Typage fin : plus tard, une fois le rendu validé par Théo.
// =====================================================================
// mIAouss — LA MASCOTTE (P1, 08/10/2026). Le chat mécano tigré (« Piston » dans la maquette), seul retenu.
//
// Il vit sur une PISTE : le Dock (ordinateur) ou la pilule (téléphone), et il est posé DANS le conteneur de cette
// piste (#dockWrap, #mpill) : il part et revient avec elle (plein écran, masquage auto, défilement) sans calcul.
//
// ⚠️ ÉCONOMIE (les PC de l'équipe ont déjà chauffé, audit perf de l'été) : la boucle d'animation S'ARRÊTE dès
// qu'elle ne sert plus — onglet caché, piste masquée, « Effets économes » ou « réduire les animations » (une
// image fixe, plus rien ne tourne) — et ralentit à ~8 images/s pendant le sommeil (au bout de 25 s sans
// interaction). Éveillé, ~30 images/s au repos, 60 seulement quand il bouge.
// =====================================================================

const D = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
function spring(s, target, k, damp, dt) { s.v += ((target - s.x) * k - s.v * damp) * dt; s.x += s.v * dt; return s.x; }
const T = (el, tf) => el && el.setAttribute('transform', tf);
const show = (el, on) => el && (el.style.display = on ? '' : 'none');
const about = (cx, cy, inner) => `translate(${cx} ${cy}) ${inner} translate(${-cx} ${-cy})`;
const blurDefs = (u) => `<filter id="b1${u}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.4"/></filter><filter id="b3${u}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3"/></filter>`;
function chain(state, n, len, x0, y0, baseAng, curl, follow, dt) {
  if (!state.a) state.a = Array(n).fill(baseAng);
  let x = x0, y = y0, prev = baseAng; const pts = [[x, y]];
  for (let i = 0; i < n; i++) { const tgt = prev + curl; state.a[i] += (tgt - state.a[i]) * Math.min(1, dt * follow); prev = state.a[i]; x += Math.cos(prev) * len; y += Math.sin(prev) * len; pts.push([x, y]); }
  return pts;
}
const smoothPath = (p) => { let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`; for (let i = 1; i < p.length - 1; i++) { const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; d += ` Q${p[i][0].toFixed(1)} ${p[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`; } const l = p[p.length - 1]; return d + ` L${l[0].toFixed(1)} ${l[1].toFixed(1)}`; };
// [GEARBOX] + scared (attrapé), ouch (tombé), dizzy (secoué : yeux en spirale)
const EYES = { neutral: 'open', think: 'open', listen: 'open', happy: 'happy', love: 'love', surprised: 'wide', sleep: 'closed', chill: 'open', scared: 'wide', ouch: 'closed', dizzy: 'dizzy' };
const MOUTH = { neutral: 'w', think: 'w', listen: 'w', happy: 'open', love: 'open', surprised: 'o', sleep: 'w', chill: 'w', scared: 'o', ouch: 'o', dizzy: 'o' };
function faces(r, s, def) {
  const e = EYES[s.mood] || 'open', m = (def?.mouthMap || {})[s.mood] || MOUTH[s.mood] || 'w';
  for (const k of ['open', 'happy', 'closed', 'wide', 'love', 'dizzy']) show(r['eye_' + k], e === k);
  for (const k of ['w', 'open', 'o']) show(r['mouth_' + k], m === k);
  if (r.blushL) { const b = s.mood === 'happy' || s.mood === 'love' ? .9 : .4; r.blushL.style.opacity = b; r.blushR.style.opacity = b; }
}
const blinkEye = (el, cx, cy, b, lx, ly) => T(el, `translate(${lx} ${ly}) ` + about(cx, cy, `scale(1 ${Math.max(.08, 1 - b * .94)})`));

// ---------------------------------------------------------------- le chat (viewBox 120 × 120, sol à y = 110)
const EAR = { L: 'M33 42 Q28.5 17 36 10 Q47.5 18.5 51.5 30Z', Li: 'M37 35 Q34.3 20.6 38.2 16.2 Q45.4 21.8 47.3 30Z', R: 'M87 42 Q91.5 17 84 10 Q72.5 18.5 68.5 30Z', Ri: 'M83 35 Q85.7 20.6 81.8 16.2 Q74.6 21.8 72.7 30Z' };
function makeCat(o) {
  const E = o.eye, ex = [60 - E.dx, 60 + E.dx], ey = E.y;
  const eye = (cx, u) => `<ellipse cx="${cx}" cy="${ey}" rx="${E.rx}" ry="${E.ry}" fill="url(#i${u})"/>
      <ellipse cx="${cx}" cy="${ey}" rx="${E.rx}" ry="${E.ry}" fill="none" stroke="${E.ring}" stroke-width="1" opacity=".7"/>
      <circle cx="${cx - E.rx * .36}" cy="${ey - E.ry * .4}" r="${E.rx * .38}" fill="#fff"/><circle cx="${cx + E.rx * .36}" cy="${ey + E.ry * .38}" r="${E.rx * .16}" fill="#fff" opacity=".85"/>`;
  const ears = EAR;
  return {
    id: o.id, name: o.name, speed: o.speed || 55,
    svg: (u) => `<defs>${blurDefs(u)}
      <radialGradient id="f${u}" cx="36%" cy="26%" r="85%"><stop offset="0" stop-color="${o.fur[0]}"/><stop offset=".48" stop-color="${o.fur[1]}"/><stop offset="1" stop-color="${o.fur[2]}"/></radialGradient>
      <radialGradient id="c${u}" cx="45%" cy="30%" r="75%"><stop offset="0" stop-color="${o.cream[0]}"/><stop offset="1" stop-color="${o.cream[1]}"/></radialGradient>
      <radialGradient id="i${u}" cx="50%" cy="72%" r="75%"><stop offset="0" stop-color="${E.iris[0]}"/><stop offset=".55" stop-color="${E.iris[1]}"/><stop offset="1" stop-color="${E.iris[2]}"/></radialGradient>
      <linearGradient id="p${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.earIn[0]}"/><stop offset="1" stop-color="${o.earIn[1]}"/></linearGradient>
      ${o.defs ? o.defs(u) : ''}</defs>
      <ellipse data-r="shadow" cx="60" cy="111" rx="27" ry="5" fill="#000" opacity=".35" filter="url(#b3${u})"/>
      <g data-r="root">
        <path data-r="tail" fill="none" stroke="${o.tail[0]}" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path data-r="tailTip" fill="none" stroke="${o.tail[1]}" stroke-width="9.5" stroke-linecap="round"/>
        <g data-r="legL"><ellipse cx="49" cy="106" rx="8.6" ry="5.6" fill="url(#f${u})"/><ellipse cx="49" cy="108.6" rx="5.6" ry="1.8" fill="#fff" opacity=".18"/></g>
        <g data-r="legR"><ellipse cx="71" cy="106" rx="8.6" ry="5.6" fill="url(#f${u})"/><ellipse cx="71" cy="108.6" rx="5.6" ry="1.8" fill="#fff" opacity=".18"/></g>
        <g data-r="body">
          <ellipse cx="60" cy="92" rx="21.5" ry="17.5" fill="url(#f${u})"/>
          ${o.body(u)}
          <ellipse cx="60" cy="106.5" rx="17" ry="3.4" fill="#000" opacity=".2" filter="url(#b1${u})"/>
        </g>
        <g data-r="armL"><ellipse cx="39.3" cy="93" rx="6.4" ry="5.8" fill="url(#f${u})"/></g>
        <g data-r="armR"><ellipse cx="80.7" cy="93" rx="6.4" ry="5.8" fill="url(#f${u})"/></g>
        <g data-r="head">
          <g data-r="earL"><path d="${ears.L}" fill="url(#f${u})"/><path d="${ears.Li}" fill="url(#p${u})"/></g>
          <g data-r="earR"><path d="${ears.R}" fill="url(#f${u})"/><path d="${ears.Ri}" fill="url(#p${u})"/></g>
          <path d="M31.5 59 L22.5 62.5 L31 65 L25.5 70.5 L35.5 67.5Z" fill="${o.fluff}"/><path d="M88.5 59 L97.5 62.5 L89 65 L94.5 70.5 L84.5 67.5Z" fill="${o.fluff}"/>
          <ellipse cx="60" cy="52" rx="31.5" ry="28.5" fill="url(#f${u})"/>
          ${o.marks()}
          <ellipse cx="60" cy="64.5" rx="14" ry="9.8" fill="url(#c${u})"/>
          <ellipse cx="45.5" cy="34.5" rx="11.5" ry="6" fill="#fff" opacity=".45" filter="url(#b1${u})" transform="rotate(-22 45.5 34.5)"/>
          <path d="M80 27.5 Q89.5 34 91.2 47" stroke="${o.rim}" stroke-width="2.2" fill="none" opacity=".65" stroke-linecap="round"/>
          <ellipse data-r="blushL" cx="39.5" cy="64" rx="5.8" ry="3.3" fill="#ff86aa" filter="url(#b1${u})"/><ellipse data-r="blushR" cx="80.5" cy="64" rx="5.8" ry="3.3" fill="#ff86aa" filter="url(#b1${u})"/>
          <g data-r="eye_open"><g data-r="eL">${eye(ex[0], u)}</g><g data-r="eR">${eye(ex[1], u)}</g></g>
          <path data-r="eye_happy" d="M${ex[0] - 6.7} ${ey + 2.5} Q${ex[0]} ${ey - 7} ${ex[0] + 6.7} ${ey + 2.5} M${ex[1] - 6.7} ${ey + 2.5} Q${ex[1]} ${ey - 7} ${ex[1] + 6.7} ${ey + 2.5}" stroke="${o.line}" stroke-width="3.1" fill="none" stroke-linecap="round"/>
          <path data-r="eye_closed" d="M${ex[0] - 6.7} ${ey + .5} Q${ex[0]} ${ey + 6} ${ex[0] + 6.7} ${ey + .5} M${ex[1] - 6.7} ${ey + .5} Q${ex[1]} ${ey + 6} ${ex[1] + 6.7} ${ey + .5}" stroke="${o.line}" stroke-width="2.7" fill="none" stroke-linecap="round"/>
          <g data-r="eye_wide"><ellipse cx="${ex[0]}" cy="${ey - 1}" rx="${E.rx + 1.4}" ry="${E.ry + 1.6}" fill="url(#i${u})"/><circle cx="${ex[0]}" cy="${ey}" r="2" fill="#07040a"/><circle cx="${ex[0] - 3}" cy="${ey - 4}" r="2.6" fill="#fff"/>
            <ellipse cx="${ex[1]}" cy="${ey - 1}" rx="${E.rx + 1.4}" ry="${E.ry + 1.6}" fill="url(#i${u})"/><circle cx="${ex[1]}" cy="${ey}" r="2" fill="#07040a"/><circle cx="${ex[1] - 3}" cy="${ey - 4}" r="2.6" fill="#fff"/></g>
          <g data-r="eye_dizzy" fill="none" stroke="${o.line}" stroke-width="2" stroke-linecap="round">${[ex[0], ex[1]].map((c) => `<path d="M${c} ${ey} m0 -1.2 a1.2 1.2 0 1 1 -1.2 1.6 a3 3 0 1 1 3.4 3 a5 5 0 1 1 -4.6 -6.6"/>`).join('')}</g>
          <g data-r="eye_love" fill="#ff4f8b"><path d="M${ex[0]} ${ey + 7} C${ex[0] - 10} ${ey - 1} ${ex[0] - 6} ${ey - 9} ${ex[0]} ${ey - 4} C${ex[0] + 6} ${ey - 9} ${ex[0] + 10} ${ey - 1} ${ex[0]} ${ey + 7}Z"/><path d="M${ex[1]} ${ey + 7} C${ex[1] - 10} ${ey - 1} ${ex[1] - 6} ${ey - 9} ${ex[1]} ${ey - 4} C${ex[1] + 6} ${ey - 9} ${ex[1] + 10} ${ey - 1} ${ex[1]} ${ey + 7}Z"/></g>
          <path d="M57.3 60.3 Q60 58.8 62.7 60.3 Q61.7 62.8 60 63.2 Q58.3 62.8 57.3 60.3Z" fill="${o.nose}"/>
          <path data-r="mouth_w" d="M55.5 64.8 Q57.8 67.4 60 65.1 Q62.2 67.4 64.5 64.8" stroke="${o.line}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
          <g data-r="mouth_open"><path d="M54.3 64.8 Q60 74 65.7 64.8 Q60 66.8 54.3 64.8Z" fill="#6b2236"/><ellipse cx="60" cy="69.6" rx="3.1" ry="1.9" fill="#ff7b98"/></g>
          <ellipse data-r="mouth_o" cx="60" cy="67" rx="3" ry="3.6" fill="#6b2236"/>
          <path d="M41 62.3 L27 59.8 M41 65.8 L27.5 67.8 M79 62.3 L93 59.8 M79 65.8 L92.5 67.8" stroke="#fff" stroke-width="1.15" opacity=".85" stroke-linecap="round"/>
          ${o.hat(u)}
        </g>
      </g>`,
    pose(r, s, dt) {
      const w = s.walk, ph = s.ph, bob = -Math.abs(Math.sin(ph)) * 1.8 * w + Math.sin(s.t * 2.3) * .45 * (1 - w);
      // [GEARBOX] s.rot : chute à la renverse (pivot aux pieds) ; s.dangle : attrapé, les pattes pendent
      T(r.root, `translate(0 ${(-s.jumpY).toFixed(2)}) ` + about(60, 104, `rotate(${(s.lean + s.rot).toFixed(2)}) scale(${s.sx.toFixed(3)} ${s.sy.toFixed(3)})`));
      const alt = clamp(s.jumpY / 60, 0, .6); T(r.shadow, about(60, 111, `scale(${1 - alt} 1)`)); r.shadow.style.opacity = .35 * (1 - alt);
      const lift = (p) => -Math.max(0, -Math.cos(p)) * 4 * w;
      const dg = s.dangle, kick = Math.sin(s.t * 13) * 3.2 * dg;
      T(r.legL, `translate(${(Math.sin(ph) * 4.5 * w - s.sit * 3 + kick).toFixed(2)} ${(lift(ph) + s.sit + dg * 5).toFixed(2)})`);
      T(r.legR, `translate(${(Math.sin(ph + Math.PI) * 4.5 * w + s.sit * 3 - kick).toFixed(2)} ${(lift(ph + Math.PI) + s.sit + dg * 5).toFixed(2)})`);
      T(r.body, `translate(0 ${(bob + s.sit * 2).toFixed(2)})`);
      T(r.armL, `translate(0 ${(bob + Math.sin(ph + Math.PI) * 1.6 * w + s.sit * 2).toFixed(2)}) ` + about(43, 87, `rotate(${(s.dangle * (100 + Math.sin(s.t * 11) * 25)).toFixed(1)})`));
      T(r.armR, `translate(0 ${(bob + Math.sin(ph) * 1.6 * w + s.sit * 2).toFixed(2)}) ` + about(77, 87, `rotate(${(-Math.max(s.wave, s.dangle) * (115 + Math.sin(s.wph) * 26)).toFixed(1)})`));
      const hx = s.lookX * 2.2, hy = s.lookY * 1.6 + bob * 1.25 + s.sit * 2.5;
      T(r.head, `translate(${hx.toFixed(2)} ${hy.toFixed(2)}) ` + about(60, 78, `rotate(${(s.lookX * 7 + s.tilt + s.lean * .3).toFixed(2)})`));
      T(r.earL, about(41, 34, `rotate(${(-s.earL).toFixed(2)})`)); T(r.earR, about(79, 34, `rotate(${(s.earR).toFixed(2)})`));
      const lx = s.lookX * 2.5, ly = s.lookY * 2;
      blinkEye(r.eL, ex[0], ey, s.blink, lx, ly); blinkEye(r.eR, ex[1], ey, s.blink, lx, ly); T(r.eye_wide, `translate(${lx} ${ly})`);
      faces(r, s, this);
      const base = -0.55 + Math.sin(s.t * 1.7) * .25 + Math.sin(ph) * .35 * w - (s.mood === 'surprised' ? .7 : 0) + s.sit * .55;
      const pts = chain(r.tailS || (r.tailS = {}), 7, 5.2, 77, 99 + bob, base, -0.24 + Math.sin(s.t * 2.3) * .06, 9, dt);
      r.tail.setAttribute('d', smoothPath(pts)); r.tailTip.setAttribute('d', smoothPath(pts.slice(-3)));
    },
  };
}

/** Le tigré mécano : lunettes d'aviateur relevées sur le front, salopette, clé dans la poche. */
export const MIAOUSS = makeCat({
  id: 'miaouss', name: 'mIAouss',
  fur: ['#ffdcab', '#f6a650', '#c9651f'], cream: ['#fffdf8', '#f1d6b8'], earIn: ['#ffcad8', '#f08aa8'], fluff: '#e8913f', rim: '#ffe6c4', line: '#5a2f1f', nose: '#ff7c9c', tail: ['#e48c3c', '#c4621f'],
  marks: () => `<path d="M30.2 49.6 Q34 50.8 36.2 48.8 M29.8 55 Q34 55.6 36.7 53.8 M89.8 49.6 Q86 50.8 83.8 48.8 M90.2 55 Q86 55.6 83.3 53.8" stroke="#c4621f" stroke-width="2.1" fill="none" stroke-linecap="round" opacity=".7"/>`,
  eye: { dx: 13, y: 53, rx: 7, ry: 8.3, iris: ['#b57a3c', '#43281a', '#160c06'], ring: '#160c06' },
  defs: (u) => `<linearGradient id="o${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d98ff"/><stop offset="1" stop-color="#2350c2"/></linearGradient>
    <radialGradient id="gl${u}g" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#d9fbff"/><stop offset=".5" stop-color="#6fc7e8"/><stop offset="1" stop-color="#256a8f"/></radialGradient>`,
  body: (u) => `<path d="M40.3 93 Q41.3 108.8 60 109.8 Q78.7 108.8 79.7 93 Q78.2 87 72 87 L48 87 Q41.8 87 40.3 93Z" fill="url(#o${u})"/>
    <rect x="50.5" y="81.5" width="19" height="13.5" rx="4.6" fill="url(#o${u})"/>
    <path d="M46.6 77.5 L51.3 87.2 M73.4 77.5 L68.7 87.2" stroke="#2350c2" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="51.3" cy="87.2" r="1.9" fill="#ffd84d"/><circle cx="68.7" cy="87.2" r="1.9" fill="#ffd84d"/>
    <rect x="55" y="88.5" width="10" height="7" rx="2.2" fill="#1b46ad" opacity=".55"/>
    <path d="M60.5 88.3 L64.8 81.5" stroke="#d6dbe6" stroke-width="2.3" stroke-linecap="round"/><path d="M63 80.6 a2.4 2.4 0 1 0 3.6 1.8" fill="none" stroke="#d6dbe6" stroke-width="2"/>`,
  hat: (u) => `<path d="M29 35 Q60 23 91 35" stroke="#5a3a26" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <g><circle cx="49" cy="31" r="8.2" fill="#c9a04a"/><circle cx="49" cy="31" r="6.2" fill="url(#gl${u}g)"/><path d="M45.5 28.5 Q48 26.5 51 27.5" stroke="#fff" stroke-width="1.6" fill="none" opacity=".85" stroke-linecap="round"/>
      <circle cx="71" cy="31" r="8.2" fill="#c9a04a"/><circle cx="71" cy="31" r="6.2" fill="url(#gl${u}g)"/><path d="M67.5 28.5 Q70 26.5 73 27.5" stroke="#fff" stroke-width="1.6" fill="none" opacity=".85" stroke-linecap="round"/>
      <path d="M57.2 31 Q60 29 62.8 31" stroke="#c9a04a" stroke-width="2.4" fill="none"/></g>`,
});

// ---------------------------------------------------------------- RIG : ressorts, saut, clignement
let UID = 0;
export class Rig {
  constructor(def, size = 100) {
    this.el = document.createElement('div'); this.el.className = 'mia-rig'; this.el.style.width = this.el.style.height = size + 'px';
    this.def = def; const u = 'mia' + ++UID;
    this.el.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true">${def.svg(u)}</svg>`;
    this.r = {}; this.el.querySelectorAll('[data-r]').forEach((n) => (this.r[n.dataset.r] = n));
    this.s = { t: Math.random() * 10, ph: 0, walk: 0, lean: 0, sx: 1, sy: 1, jumpY: 0, jumpV: 0, lookX: 0, lookY: 0, blink: 0, wave: 0, wph: 0, sit: 0, tilt: 0, earL: 0, earR: 0, mood: 'neutral', rot: 0, dangle: 0 };
    this.k = { sq: { x: 1, v: 0 }, lean: { x: 0, v: 0 }, earL: { x: 0, v: 0 }, earR: { x: 0, v: 0 }, tilt: { x: 0, v: 0 }, rot: { x: 0, v: 0 } };
    this.air = false; this.crouch = 0; this.nextBlink = 1 + Math.random() * 2; this.blinkT = 0; this.nextTwitch = 2; this.nextTilt = 3; this.tiltTarget = 0;
  }
  jump(power = 230) { if (this.air || this.crouch > 0) return; this.crouch = .13; this.power = power; }
  startle() { this.air = true; this.s.jumpV = 170; this.k.sq.v += 3; this.k.earL.v -= 260; this.k.earR.v -= 260; }
  /** En mouvement (saut, ressorts encore lancés) : la boucle doit tourner à pleine vitesse. */
  busy() { const k = this.k; return this.air || this.crouch > 0 || Math.abs(k.sq.v) > .05 || Math.abs(k.lean.v) > .5 || Math.abs(k.rot.v) > .5 || Math.abs(this.s.walk) > .02 || this.s.dangle > .02; }
  update(dt, inp = {}) {
    const s = this.s, k = this.k; s.t += dt;
    const speed = Math.abs(inp.vx || 0);
    s.walk = lerp(s.walk, clamp(speed / 40, 0, 1), Math.min(1, dt * 8));
    s.ph += speed * dt * .2;
    s.lean = spring(k.lean, clamp((inp.vx || 0) * .09, -10, 10) * (inp.facing || 1), 90, 12, dt);
    s.lookX = lerp(s.lookX, clamp(inp.lx || 0, -1, 1), Math.min(1, dt * 7)); s.lookY = lerp(s.lookY, clamp(inp.ly || 0, -1, 1), Math.min(1, dt * 7));
    s.mood = inp.mood || 'neutral';
    let sqT = 1 + Math.sin(s.t * 2.4) * .012;
    if (this.crouch > 0) { this.crouch -= dt; sqT = .76; if (this.crouch <= 0) { this.air = true; s.jumpV = this.power; } }
    if (this.air) { s.jumpV -= 900 * dt; s.jumpY += s.jumpV * dt; sqT = 1 + clamp(s.jumpV / 1600, -.06, .14); if (s.jumpY <= 0) { s.jumpY = 0; this.air = false; k.sq.v -= Math.min(4.5, Math.abs(s.jumpV) / 70); s.jumpV = 0; k.earL.v += 200; k.earR.v += 200; } }
    sqT -= s.sit * .05 + (inp.mood === 'sleep' ? .03 : 0);
    s.sy = spring(k.sq, sqT, 260, 13, dt); s.sx = 1 + (1 - s.sy) * .75;
    if (s.t > this.nextBlink && inp.mood !== 'sleep') { this.blinkT = .17; this.nextBlink = s.t + 2 + Math.random() * 3.5; if (Math.random() < .2) this.nextBlink = s.t + .3; }
    if (this.blinkT > 0) { this.blinkT -= dt; s.blink = Math.sin(Math.PI * clamp(1 - this.blinkT / .17, 0, 1)); } else s.blink = 0;
    s.wave = lerp(s.wave, inp.wave ? 1 : 0, Math.min(1, dt * 9)); s.wph += dt * 15;
    s.sit = lerp(s.sit, inp.sit ? 1 : 0, Math.min(1, dt * 6));
    if (s.t > this.nextTwitch) { (Math.random() < .5 ? k.earL : k.earR).v += 300 * (Math.random() < .5 ? 1 : -1); this.nextTwitch = s.t + 2.5 + Math.random() * 4; }
    const earT = inp.mood === 'sleep' ? 10 : inp.mood === 'surprised' ? -8 : 0;
    s.earL = spring(k.earL, earT, 140, 9, dt); s.earR = spring(k.earR, earT, 140, 9, dt);
    if (s.t > this.nextTilt) { this.tiltTarget = this.tiltTarget ? 0 : (Math.random() < .5 ? -1 : 1) * (6 + Math.random() * 6); this.nextTilt = s.t + (this.tiltTarget ? 1.4 : 3 + Math.random() * 5); }
    s.tilt = spring(k.tilt, inp.mood === 'think' ? 9 : this.tiltTarget, 60, 9, dt);
    s.rot = spring(k.rot, inp.rot || 0, 70, 9, dt);
    s.dangle = lerp(s.dangle, inp.dangle ? 1 : 0, Math.min(1, dt * 10));
    this.def.pose(this.r, s, dt);
  }
}

// ---------------------------------------------------------------- BUDDY : la vie sur la piste, avec une vraie physique
const PHRASES = ['On bosse sur quoi ?', 'Besoin d’un coup de patte ?', 'Coucou !', 'Je surveille les chiffres.'];
const G_ACC = 2300;            // gravité (px/s²)
const HARD_FALL = 1150;        // vitesse d'impact au-delà de laquelle il se casse la figure
const SOFT_FALL = 520;         // au-delà : « Ouf ! » et un nuage de poussière
const STAR = '<svg width="11" height="11" viewBox="0 0 24 24"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z" fill="#ffd84d" stroke="#c98a12" stroke-width="1.2"/></svg>';

export class Buddy {
  /**
   * host  : conteneur de la piste (#dockWrap, #mpill) — la mascotte y est posée et voyage avec lui.
   * track : la piste elle-même (#dock, #mpill).
   * opts  : { size, name, onClick(buddy), isHidden() (piste masquée), isCalm() (« Effets économes » /
   *           réduire les animations), isDnd() (« Ne pas déranger »), mobile }
   *
   * [GEARBOX] P1 bis (retours de Théo du 08/10) : le Dock est un SOL (il tient debout sur les icônes, et une icône
   * qui grossit sous lui l'envoie en l'air) ; attrapé, il se promène partout, jambes pendantes, la bulle le suit ;
   * lâché, il tombe (lancé : il garde son élan, rebondit sur les bords) ; de haut, il se casse la figure ; secoué,
   * il a le tournis. Coordonnées : (x, y) = coin haut gauche, dans le repère du conteneur.
   */
  constructor(host, track, opts = {}) {
    this.host = host; this.track = track; this.o = opts; this.size = opts.size || 64; this.onClick = opts.onClick;
    this.def = MIAOUSS; this.x = null; this.y = null; this.dir = 1; this.vx = 0; this.vy = 0; this.airborne = false; this.target = null; this.mode = 'idle'; this.mood = 'neutral';
    this.until = 0; this.lastInteract = performance.now(); this.mouse = null; this.lastMouse = null; this.lastT = performance.now(); this.flips = []; this.rot = 0;
    this.el = document.createElement('div'); this.el.className = 'mia-buddy' + (opts.mobile ? ' mob' : ''); this.el.style.width = this.el.style.height = this.size + 'px';
    this.el.setAttribute('role', 'button'); this.el.setAttribute('tabindex', '0'); this.el.setAttribute('aria-label', 'mIAouss, ton assistant : cliquer pour lui parler');
    this.rig = new Rig(this.def, this.size); this.el.append(this.rig.el); host.append(this.el);
    this.el.__buddy = this;   // débogage (console : élément .mia-buddy → __buddy)
    this.off = []; this.bind();
    this.wake();
  }
  destroy() { this.dead = true; cancelAnimationFrame(this.raf); clearTimeout(this.tm); this.off.forEach((f) => f()); this.bubble?.remove(); this.stars?.remove(); this.el.remove(); }
  on(t, ev, fn, o) { t.addEventListener(ev, fn, o); this.off.push(() => t.removeEventListener(ev, fn, o)); }
  center() { const r = this.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * .55 }; }
  /** Couloir de marche sur la piste (repère du conteneur). */
  bounds(h = this.host.getBoundingClientRect()) { const t = this.track.getBoundingClientRect(); return { left: t.left - h.left - this.size * .12, right: t.right - h.left - this.size * .88, top: t.top - h.top - this.size * .915 }; }
  /** Limites de l'écran (repère du conteneur) : il peut aller partout, jamais dehors. */
  screen(h) { return { left: -h.left + 2, right: innerWidth - h.left - this.size - 2, top: -h.top + 30, floor: innerHeight - h.top - this.size * .97 }; }
  /**
   * Hauteur du sol sous ses pieds : le dessus de la piste, ou celui d'une icône du Dock si elle dépasse (agrandie au
   * survol) — c'est ce qui l'empêche de passer à travers. Hors de la piste : le bas de l'écran.
   */
  groundAt(x, h) {
    const t = this.track.getBoundingClientRect(), foot0 = h.left + x + this.size * .3, foot1 = h.left + x + this.size * .7;
    if (foot1 < t.left + 6 || foot0 > t.right - 6) return this.screen(h).floor;
    let top = t.top;
    if (!this.o.mobile) this.track.querySelectorAll('.app-ico').forEach((ic) => { const r = ic.getBoundingClientRect(); if (r.right > foot0 && r.left < foot1 && r.top < top) top = r.top; });
    return top - h.top - this.size * .915;
  }
  placeBubble(h) {
    const b = this.bubble; if (!b || !b.isConnected) return;
    const w = b.offsetWidth, cx = h.left + this.x + this.size / 2, pageX = clamp(cx - w / 2, 8, innerWidth - w - 8);
    b.style.left = (pageX - h.left) + 'px'; b.style.top = (this.y + this.size * .1 - b.offsetHeight) + 'px';
    b.style.setProperty('--tail', `${clamp(cx - pageX, 14, w - 14)}px`);
  }
  say(text, ms = 1800, cls = '') {
    if (this.o.isCalm?.()) return;
    this.bubble?.remove(); const b = document.createElement('div'); b.className = 'mia-bubble ' + cls; b.textContent = text; this.host.append(b);
    this.bubble = b; this.placeBubble(this.host.getBoundingClientRect());     // [GEARBOX] et il la suit à chaque image
    clearTimeout(this.bt); if (ms) this.bt = setTimeout(() => { b.remove(); if (this.bubble === b) this.bubble = null; }, ms);
  }
  fx(html, dx, anim, dy = 0) { if (this.o.isCalm?.()) return; const n = document.createElement('div'); n.className = 'mia-fx'; n.innerHTML = html; n.style.left = (this.x + this.size / 2 + dx) + 'px'; n.style.top = (this.y + this.size * .2 + dy) + 'px'; n.style.animation = anim; this.host.append(n); setTimeout(() => n.remove(), 2400); }
  hearts() { [-16, 0, 16].forEach((d, i) => setTimeout(() => this.fx('<svg width="14" height="12" viewBox="0 0 18 16"><path d="M9 15C-3 7 2-2 9 4c7-6 12 3 0 11z" fill="#ff4f8b"/></svg>', d - 7, 'mia-rise 1.1s ease-out forwards'), i * 110)); }
  dust() { [-1, 1].forEach((d) => this.fx('<i class="mia-dust"></i>', d * this.size * .28 - 6, `mia-puff${d < 0 ? 'L' : 'R'} .55s ease-out forwards`, this.size * .62)); }
  /** Étoiles qui tournent au-dessus de la tête (tournis, chute) : un seul élément, suivi à chaque image. */
  starsOn(ms) {
    if (this.o.isCalm?.()) return;
    if (!this.stars) { const s = document.createElement('div'); s.className = 'mia-stars'; s.innerHTML = `<i>${STAR}</i><i>${STAR}</i><i>${STAR}</i>`; this.host.append(s); this.stars = s; }
    clearTimeout(this.st); this.st = setTimeout(() => { this.stars?.remove(); this.stars = null; }, ms);
  }
  act(mode, o = {}) {
    const now = performance.now(); this.lastInteract = now; if (!o.keep) { this.bubble?.remove(); this.bubble = null; } this.mode = mode; this.until = 0;
    const set = (mood, ms) => { this.mood = mood; if (ms) this.until = now + ms; };
    this.rot = 0;
    if (mode === 'idle') set('neutral');
    if (mode === 'walk') { const b = this.bounds(); this.target = o.to ?? b.left + Math.random() * (b.right - b.left); set('neutral'); }
    if (mode === 'wave') { set('happy', 1800); this.say(o.text || `Coucou ${this.o.name || ''} !`); }
    if (mode === 'jump') { set('happy', 900); this.rig.jump(o.power || 230); if (o.hearts !== false) setTimeout(() => this.hearts(), 160); }
    if (mode === 'love') { set('love', 1900); this.hearts(); this.say(o.text || 'Rrrrr…', 1600); }
    if (mode === 'think') { set('think', o.ms || 2600); this.say('• • •', o.ms || 2600, 'dots'); }
    if (mode === 'startle') { set('surprised', 1000); this.rig.startle(); this.say(o.text || '!', 1000, o.text ? '' : 'bang'); }
    if (mode === 'sleep') { set('sleep'); this.zzz(); }
    if (mode === 'drag') { set('scared'); this.say(o.text || 'Hééé !', 0); }
    if (mode === 'fall') set('scared');
    if (mode === 'ouch') { set('ouch', 1300); this.rot = (o.side || this.dir) * 82; this.say('Aïe !', 1100); this.starsOn(2400); }
    if (mode === 'dizzy') { set('dizzy', o.ms || 3800); this.say(o.text || 'Je vois des étoiles…', 2400); this.starsOn(o.ms || 3800); }
    if (mode === 'listen') set('neutral');
    if (mode === 'chase') set('happy');
    this.wake();
  }
  zzz() { if (this.mode !== 'sleep' || this.dead) return; this.fx('<b style="font:800 13px var(--font-display, inherit);color:#d6ceff">z</b>', 12, 'mia-zz 1.9s ease-out forwards', -8); clearTimeout(this.zt); this.zt = setTimeout(() => this.zzz(), 1400); }
  wakeJolt(text) { this.act('startle', { text: this.mode === 'sleep' ? text || 'Hein ?!' : '' }); }
  /** [GEARBOX] « parle » : réflexion pendant que l'assistant répond, écoute pendant que le volet est ouvert. */
  setListening(on) { this.listening = on; if (on) { if (!['drag', 'fall', 'ouch', 'dizzy'].includes(this.mode)) this.act('listen'); } else if (this.mode === 'listen' || this.mode === 'think') this.act('idle'); }
  setThinking(on) { if (on) this.act('think', { ms: 60_000 }); else if (this.mode === 'think') this.act(this.listening ? 'listen' : 'idle'); }
  /** Atterrissage : selon la vitesse d'impact, rien, « Ouf ! », ou la chute à la renverse. */
  land(v) {
    this.airborne = false; this.vy = 0;
    if (this.dizzyPending) { this.dizzyPending = false; this.rig.k.sq.v -= 3; this.dust(); this.act('dizzy'); return; }
    if (v > HARD_FALL) { this.rig.k.sq.v -= 5; this.dust(); this.act('ouch', { side: this.vx >= 0 ? 1 : -1 }); this.vx = 0; return; }
    if (v > SOFT_FALL) { this.rig.k.sq.v -= 4; this.dust(); this.act('startle', { text: 'Ouf !' }); this.vx *= .3; return; }
    this.rig.k.sq.v -= Math.min(3, v / 200); if (this.mode === 'fall') this.act(this.listening ? 'listen' : 'idle');
  }
  bind() {
    let down = null;
    this.on(this.el, 'pointerenter', () => { this.hover = true; this.hoverSince = performance.now(); this.wake(); });
    this.on(this.el, 'pointerleave', () => { this.hover = false; });
    this.on(this.el, 'pointerdown', (e) => {
      e.stopPropagation();
      const h = this.host.getBoundingClientRect();
      down = { x: e.clientX, y: e.clientY, gx: e.clientX - (h.left + this.x), gy: e.clientY - (h.top + this.y), moved: false, last: { x: e.clientX, y: e.clientY, t: performance.now() } };
      this.vel = { x: 0, y: 0 };
      this.el.setPointerCapture(e.pointerId);
    });
    this.on(this.el, 'pointermove', (e) => {
      if (!down) return;
      if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down.moved = true; this.el.classList.add('drag'); this.airborne = false; this.act('drag'); this.flips = []; }
      if (!down.moved) return;
      const h = this.host.getBoundingClientRect(), sc = this.screen(h), now = performance.now(), dt = Math.max(1, now - down.last.t) / 1000;
      const nx = clamp(e.clientX - h.left - down.gx, sc.left, sc.right), ny = clamp(e.clientY - h.top - down.gy, sc.top, sc.floor);
      const vx = (e.clientX - down.last.x) / dt, vy = (e.clientY - down.last.y) / dt;
      this.vel = { x: lerp(this.vel.x, vx, .5), y: lerp(this.vel.y, vy, .5) };
      // secousses : changements de sens rapides ; 5 en 1,5 s → le tournis
      const sgn = Math.sign(this.vel.x);
      if (Math.abs(this.vel.x) > 650 && sgn && sgn !== this.lastSgn) { this.lastSgn = sgn; this.flips.push(now); }
      this.flips = this.flips.filter((t) => now - t < 1500);
      if (this.flips.length >= 5 && !this.dizzyPending) { this.dizzyPending = true; this.say('Arrêêête… 😵', 0); }
      this.dir = nx >= this.x ? 1 : -1; this.x = nx; this.y = ny; down.last = { x: e.clientX, y: e.clientY, t: now };
      this.wake();
    });
    this.on(this.el, 'pointerup', (e) => {
      if (!down) return; e.stopPropagation(); const moved = down.moved; down = null; this.el.classList.remove('drag');
      if (moved) {
        // lâché : il garde l'élan de la main (borné), puis la gravité fait le reste
        this.vx = clamp(this.vel.x, -1600, 1600); this.vy = clamp(this.vel.y, -1600, 1400);
        this.airborne = true; this.mode = 'fall'; this.mood = 'scared'; this.bubble?.remove(); this.bubble = null; this.lastInteract = performance.now();
        this.wake(); return;
      }
      this.click();
    });
    this.on(this.el, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); } });
    // Regard et poursuite : la souris n'est suivie que près de la piste (aucun calcul ailleurs).
    this.on(window, 'pointermove', (e) => {
      if (this.o.mobile || this.o.isCalm?.()) return;
      const now = performance.now(), p = { x: e.clientX, y: e.clientY, t: now };
      const v = this.lastMouse ? Math.hypot(p.x - this.lastMouse.x, p.y - this.lastMouse.y) / Math.max(1, now - this.lastMouse.t) : 0;
      this.lastMouse = p;
      const tr = this.track.getBoundingClientRect();
      if (p.y < tr.top - 260) { if (this.mouse) { this.mouse = null; } return; }
      this.mouse = p;
      const c = this.center();
      if (v > 3 && Math.hypot(p.x - c.x, p.y - c.y) < 120 && ['idle', 'walk', 'chase'].includes(this.mode) && now - (this.startledAt || 0) > 4000) { this.startledAt = now; this.act('startle', { text: 'Wouah !' }); }
      else this.wake();
    }, { passive: true });
    // Un clic sur une icône du Dock : il sursaute ou saute (comme dans la maquette).
    this.on(this.track, 'click', (e) => {
      const i = e.target.closest?.('.dk, button'); if (!i || this.o.mobile || this.mode === 'sleep') return;
      const ir = i.getBoundingClientRect(), c = this.center(); this.dir = ir.left + ir.width / 2 > c.x ? 1 : -1;
      if (Math.abs(ir.left + ir.width / 2 - c.x) < 120) this.act('startle', { text: 'Oh !' }); else this.act('jump', { hearts: false, power: 160 });
    });
    this.on(document, 'visibilitychange', () => { if (!document.hidden) this.wake(); });
  }
  click() {
    if (['ouch', 'dizzy'].includes(this.mode)) { this.say(this.mode === 'dizzy' ? 'Attends, ça tourne…' : 'Laisse-moi me relever !', 1200, ''); return; }
    if (this.mode === 'sleep') { this.act('jump', { hearts: false, power: 180 }); this.say('Hein ? Je ne dormais pas !', 1400); }
    else this.act('jump');
    clearTimeout(this.ct); this.ct = setTimeout(() => this.onClick?.(this), this.o.isCalm?.() ? 0 : 380);
  }
  // ⚠️ `inLoop` : un act() appelé PENDANT la boucle ne doit pas lancer une seconde boucle (elles se multiplieraient).
  wake() { if (this.dead || this.inLoop || this.raf || this.tm) return; this.lastT = performance.now(); this.raf = requestAnimationFrame((t) => this.loop(t)); }
  schedule(fps) {
    this.raf = 0; this.tm = 0;
    if (this.dead || document.hidden) return;                    // onglet caché : arrêt complet
    if (fps >= 60) this.raf = requestAnimationFrame((t) => this.loop(t));
    else this.tm = setTimeout(() => { this.tm = 0; this.raf = requestAnimationFrame((t) => this.loop(t)); }, 1000 / fps);
  }
  loop(t) {
    this.raf = 0; this.inLoop = true;
    try { this.frame(t); } finally { this.inLoop = false; }
  }
  frame(t) {
    const dt = Math.min(.05, (t - this.lastT) / 1000); this.lastT = t;
    const calm = !!this.o.isCalm?.(), hidden = !!this.o.isHidden?.(), dnd = !!this.o.isDnd?.();
    const h = this.host.getBoundingClientRect(), b = this.bounds(h), sc = this.screen(h);
    if (this.x == null) { this.x = b.left + (b.right - b.left) * (this.o.mobile ? .5 : .82); this.y = b.top; }
    const dragging = this.mode === 'drag', ko = this.mode === 'ouch' || this.mode === 'dizzy';
    // Piste masquée, Ne pas déranger : il dort. Effets économes : une image fixe, plus rien ne tourne.
    if ((hidden || dnd) && this.mode !== 'sleep' && !this.listening && !dragging && !this.airborne) { this.wasHidden = hidden; this.act('sleep'); }
    if (!hidden && !dnd && this.wasHidden && this.mode === 'sleep') { this.wasHidden = false; this.wakeJolt(this.o.mobile ? '' : 'Me revoilà !'); }
    if (this.until && t > this.until) { this.until = 0; this.act(this.listening ? 'listen' : 'idle'); }

    // --- marche, poursuite (seulement au sol, ni attrapé ni sonné)
    let want = 0;
    const g0 = this.groundAt(this.x, h), onTrack = g0 < sc.floor - 1;
    if (this.mouse && !calm && !this.hover && !hidden && !this.airborne && onTrack && ['idle', 'walk', 'chase'].includes(this.mode)) {
      const tr = this.track.getBoundingClientRect(), near = this.mouse.y > tr.top - 80 && this.mouse.y < tr.bottom + 10 && this.mouse.x > tr.left - 30 && this.mouse.x < tr.right + 30;
      if (near) { const tx = this.mouse.x - h.left - this.size / 2; if (Math.abs(tx - this.x) > 22) { if (this.mode !== 'chase') this.act('chase'); this.target = clamp(tx, b.left, b.right); } else if (this.mode === 'chase') { this.act('idle'); this.mood = 'happy'; } }
      else if (this.mode === 'chase') this.act('idle');
    }
    // tombé hors de la piste : il y retourne à pied (le sol qui monte le fait sauter dessus)
    if (!this.airborne && !dragging && !ko && !onTrack && ['idle', 'listen'].includes(this.mode) && !calm) this.act('walk', { to: clamp(this.x, b.left + 10, b.right - 10) });
    if ((this.mode === 'walk' || this.mode === 'chase') && this.target != null && !this.airborne) {
      const d = this.target - this.x, sp = this.def.speed * (this.mode === 'chase' ? 2.4 : 1);
      want = Math.abs(d) < 3 ? 0 : Math.sign(d) * Math.min(sp, Math.abs(d) * 4);
      if (this.mode === 'walk' && Math.abs(d) < 3) this.act(this.listening ? 'listen' : 'idle');
    }

    // --- physique : gravité, sol (piste ou icônes agrandies), bords de l'écran
    if (!dragging) {
      if (!this.airborne) this.vx = lerp(this.vx, want, Math.min(1, dt * 6));
      this.x += this.vx * dt;
      if (this.x < sc.left || this.x > sc.right) { this.x = clamp(this.x, sc.left, sc.right); this.vx = -this.vx * .45; }
      const g = this.groundAt(this.x, h);
      if (this.airborne) {
        this.vy += G_ACC * dt; this.y += this.vy * dt;
        if (this.y < sc.top) { this.y = sc.top; this.vy = Math.abs(this.vy) * .3; }
        if (this.y >= g && this.vy >= 0) { this.y = g; this.land(this.vy); }
      } else if (g < this.y - .5) {
        // le sol monte sous lui (icône qui grossit, retour sur la piste) : il est envoyé en l'air
        const rise = this.y - g; this.y = g;
        // au plus un envol toutes les 0,9 s : en courant sur un Dock agrandi, il serait sinon projeté à chaque icône
        if (rise > 5 && !ko && t - (this.bumpAt || 0) > 900) { this.bumpAt = t; this.vy = -Math.min(560, 220 + rise * 16); this.airborne = true; if (rise > 9) { this.mood = 'surprised'; this.say(rise > 18 ? 'Wouh !' : 'Hop !', 700); } }
      } else if (g > this.y + .5) {
        // le sol se dérobe (icône qui rapetisse, bord de la piste) : il tombe
        this.airborne = true; this.vy = Math.max(this.vy, 0);
        if (g - this.y > 40 && !ko) this.mode = 'fall';
      }
    }
    if (Math.abs(this.vx) > 4) this.dir = this.vx > 0 ? 1 : -1;

    // --- regard, humeur
    let lx = 0, ly = 0;
    if (this.mouse && this.mood !== 'sleep' && !ko) { const c = this.center(), dx = this.mouse.x - c.x, dy = this.mouse.y - c.y, d = Math.hypot(dx, dy) || 1; lx = clamp(dx / Math.max(80, d), -1, 1) * this.dir; ly = clamp(dy / Math.max(80, d), -1, 1); }
    if (this.listening && !this.mouse) { lx = .4 * this.dir; ly = -.5; }   // volet ouvert : il lève les yeux vers lui
    if (this.mode === 'dizzy') { lx = Math.sin(t / 160) * .9; ly = Math.cos(t / 190) * .6; }
    if (this.mode === 'fall' && this.airborne) this.mood = 'scared';
    if (this.hover && ['idle', 'listen'].includes(this.mode) && !this.until) {
      this.mood = 'happy';
      // il ronronne si on le survole longtemps (au plus toutes les 10 s)
      if (!calm && t - (this.hoverSince || t) > 1500 && t - (this.purredAt || 0) > 10000) { this.purredAt = t; this.act('love'); }
    } else if (!this.hover && this.mood === 'happy' && this.mode === 'idle' && !this.until) this.mood = 'neutral';
    // vie automatique (jamais en économie, ni volet ouvert)
    if (!calm && !this.hover && !this.listening && this.mode === 'idle' && !hidden && !dnd && !this.airborne && onTrack) {
      if (t - this.lastInteract > 25000) this.act('sleep');
      else if (Math.random() < dt / 4.5) { const r = Math.random(); if (r < .58) this.act('walk'); else if (r < .72) this.act('wave', { text: PHRASES[Math.floor(Math.random() * PHRASES.length)] }); else if (r < .86) this.act('think', { ms: 2600 }); else this.act('jump', { hearts: false, power: 170 }); }
    }

    // --- rendu
    const wob = this.mode === 'dizzy' ? Math.sin(t / 110) * 9 : 0;
    this.el.style.transform = `translate(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px)`; this.rig.el.classList.toggle('flip', this.dir < 0);
    this.el.classList.toggle('lifted', dragging || this.airborne);
    this.placeBubble(h);
    if (this.stars) this.stars.style.transform = `translate(${(this.x + this.size / 2).toFixed(1)}px, ${(this.y + this.size * (this.mode === 'ouch' ? .55 : .08)).toFixed(1)}px)`;
    this.rig.update(calm ? 0.016 : dt, {
      vx: dragging ? 0 : this.airborne ? 0 : this.vx, facing: this.dir, lx, ly, mood: this.mood,
      wave: this.mode === 'wave' && !!this.until, sit: this.mode === 'sleep' || this.mode === 'listen',
      rot: (this.rot || 0) + wob + (dragging ? clamp((this.vel?.x || 0) * .012, -25, 25) : 0), dangle: dragging || (this.airborne && this.mode === 'fall'),
    });
    // Cadence : 60 i/s quand il bouge, 30 au repos, 8 en dormant ; arrêt complet en économie ou piste masquée.
    const moving = this.rig.busy() || Math.abs(this.vx) > 1 || this.airborne || dragging || ko || this.mode === 'chase' || this.mode === 'walk' || !!this.bubble;
    if (calm && !moving) return;                                 // image fixe : relancé par un clic / survol
    if (hidden && this.mode === 'sleep' && !moving) return;      // piste rangée : il dort, rien ne tourne
    this.schedule(moving ? 60 : this.mode === 'sleep' ? 8 : 30);
  }
}
