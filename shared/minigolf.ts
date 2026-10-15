// @ts-nocheck — moteur écrit en JavaScript (prototype maquettes/jeux/minigolf.html), typé « any » à dessein.
// =====================================================================================
// MINIGOLF — moteur physique et parcours, PARTAGÉS entre le serveur (validation des coups) et le navigateur
// (rejouer le coup à l'écran). Source canonique : shared/minigolf.ts ; copie OCTET POUR OCTET dans
// backend/src/games/minigolf.ts (contrôlée par scripts/check-minigolf-sync.mjs, comme les Forms Bony).
// On modifie ici, puis : cp shared/minigolf.ts backend/src/games/minigolf.ts
//
// ⚠️ Déterministe : mêmes entrées → même trajectoire. Le navigateur n'envoie que { angle, puissance, horloge } ;
// le serveur simule et fait foi (la position finale affichée est toujours celle du serveur).
// =====================================================================================
/* eslint-disable */
/* =====================================================================================
   MOTEUR — pur et déterministe (deviendra shared/minigolf.ts, le même au serveur et au navigateur).
   Le navigateur n'enverra que { angle, puissance, horloge } ; le serveur simulera et renverra la trajectoire.
   Unités : centimètres et secondes d'une piste réelle. Pas fixe de 1/240 s, découpé en sous-pas à grande vitesse
   (la balle ne traverse jamais un rail). Relief par « bosses » gaussiennes : la balle tourne autour d'une butte,
   descend dans une cuvette, ralentit en montant.
   ===================================================================================== */
export const DEF = { roulement: 62, trainee: 0.42, sable: 540, glace: 16, rebondBois: 0.74, rebondPierre: 0.55, bumper: 1.32,
  vitesseMax: 1150, captureTrou: 170, choc: 0.92, gravite: 1 };
export const P: any = { ...DEF };
export const R = 7, R_TROU = 11.5, DT = 1 / 240, PAS_IMAGE = 4, T_MAX = 15, G = 981;

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const len = (a) => Math.hypot(a[0], a[1]);
export function dansPoly(pt, poly) {
  let d = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) d = !d;
  }
  return d;
}
export function plusProche(p, a, b) {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return [a[0] + ab[0] * t, a[1] + ab[1] * t];
}
export const angleDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

/** Préparation d'un trou : segments fixes et grille de recherche (calculée une fois). */
export const CELL = 40;
export function preparer(h) {
  if (h._prep) return h._prep;
  const S = [];
  const anneau = (pts, ferme, r, e) => { for (let i = 0; i < pts.length - (ferme ? 0 : 1); i++) S.push({ a: pts[i], b: pts[(i + 1) % pts.length], r, e }); };
  anneau(h.bord, true, 7, 'bois');
  (h.murs || []).forEach((m) => anneau(m.pts, !!m.bloc, m.bloc ? 2 : 5, m.style === 'massif' || m.style === 'roc' ? 'pierre' : 'bois'));
  const grille = new Map();
  S.forEach((s, i) => {
    const m = s.r + R + 2;
    const x0 = Math.floor((Math.min(s.a[0], s.b[0]) - m) / CELL), x1 = Math.floor((Math.max(s.a[0], s.b[0]) + m) / CELL);
    const y0 = Math.floor((Math.min(s.a[1], s.b[1]) - m) / CELL), y1 = Math.floor((Math.max(s.a[1], s.b[1]) + m) / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; (grille.get(k) || grille.set(k, []).get(k)).push(i); }
  });
  const ronds = [...(h.rocs || []).map((c) => ({ ...c, e: 'pierre' })), ...(h.bumpers || []).map((c, i) => ({ ...c, e: 'bumper', idx: i }))];
  return (h._prep = { S, grille, ronds });
}
/** Obstacles mobiles à l'instant t : segments (avec leur vitesse, pour le rebond). */
export function segmentsMobiles(h, t) {
  const S = [];
  (h.mobiles || []).forEach((m, mi) => {
    if (m.type === 'helice') {
      for (let i = 0; i < m.pales; i++) {
        const th = m.phase + m.w * t + i * 2 * Math.PI / m.pales;
        S.push({ a: [m.x, m.y], b: [m.x + Math.cos(th) * m.l, m.y + Math.sin(th) * m.l], r: 5, e: 'bois', rot: { c: [m.x, m.y], w: m.w }, mi });
      }
    } else if (m.type === 'porte') {
      const ph = 2 * Math.PI * t / m.periode + (m.phase || 0), k = 0.5 - 0.5 * Math.cos(ph), dk = Math.PI / m.periode * Math.sin(ph);
      const cx = m.a[0] + (m.b[0] - m.a[0]) * k, cy = m.a[1] + (m.b[1] - m.a[1]) * k;
      const v = [(m.b[0] - m.a[0]) * dk, (m.b[1] - m.a[1]) * dk], w = m.taille[0] / 2, hh = m.taille[1] / 2;
      const c = [[cx - w, cy - hh], [cx + w, cy - hh], [cx + w, cy + hh], [cx - w, cy + hh]];
      for (let i = 0; i < 4; i++) S.push({ a: c[i], b: c[(i + 1) % 4], r: 0, e: 'bois', v, mi });
    } else if (m.type === 'moulin' && moulinFerme(m, t)) {
      // Moulin à vent : une pale qui passe en bas ferme l'entrée du tunnel.
      const ux = Math.cos(m.dir), uy = Math.sin(m.dir), vx = -uy, vy = ux, f = m.devant;
      const p = (u, v) => [m.c[0] + ux * u + vx * v, m.c[1] + uy * u + vy * v];
      S.push({ a: p(f, -m.tunnel / 2 - 4), b: p(f, m.tunnel / 2 + 4), r: 5, e: 'bois', mi });
    }
  });
  return S;
}
export function moulinFerme(m, t) {
  for (let i = 0; i < m.pales; i++) if (Math.abs(angleDiff(m.phase + m.w * t + i * 2 * Math.PI / m.pales, Math.PI / 2)) < m.ouverture) return true;
  return false;
}
/** Relief : hauteur (cm) et pente, somme de bosses gaussiennes (h < 0 : cuvette). */
export function relief(h, x, y) {
  let z = 0, gx = 0, gy = 0;
  for (const b of h.bosses || []) {
    const s = b.r / 2, dx = x - b.x, dy = y - b.y, d2 = dx * dx + dy * dy;
    if (d2 > 9 * s * s) continue;
    const e = b.h * Math.exp(-d2 / (2 * s * s));
    z += e; gx -= e * dx / (s * s); gy -= e * dy / (s * s);
  }
  return [z, gx, gy];
}
/** Sol à un point : dernière zone de surface qui le contient l'emporte ; pentes et tapis s'ajoutent. */
export function zoneDe(h, x, y) {
  const z = { sol: 'gazon', ax: 0, ay: 0, belt: null };
  for (const q of h.zones || []) {
    if (q.type === 'tourniquet') { if (Math.hypot(x - q.x, y - q.y) < q.r) { z.sol = 'gazon'; z.belt = [-q.w * (y - q.y), q.w * (x - q.x)]; } continue; }
    if (!dansPoly([x, y], q.pts)) continue;
    if (q.type === 'pente') { z.ax += q.ax; z.ay += q.ay; }
    else if (q.type === 'tapis') { z.sol = 'gazon'; z.belt = [q.vx, q.vy]; }
    else { z.sol = q.type === 'pont' ? 'gazon' : q.type; z.belt = null; }
  }
  return z;
}
/**
 * Simule un coup. etat = { balles: [{ x, y, dedans }], horloge } ; coup = { balle, angle, puissance 0..1 }.
 * Rend { images: [[x, y, dedans, visible] par balle], evts, eau, final }. Pur : mêmes entrées → mêmes sorties.
 */
export function simuler(h, etat, coup, opts = {}) {
  const { S, grille, ronds } = preparer(h);
  const B = etat.balles.map((b) => ({ x: b.x, y: b.y, vx: 0, vy: 0, dedans: !!b.dedans, depart: [b.x, b.y], arret: true, tuyau: null, sol: null }));
  const jb = B[coup.balle];
  const v0 = Math.pow(Math.max(0, Math.min(1, coup.puissance)), 1.2) * P.vitesseMax;
  jb.vx = Math.cos(coup.angle) * v0; jb.vy = Math.sin(coup.angle) * v0; jb.arret = false;
  const evts = [], images = [];
  let t = etat.horloge, n = 0, eau = 0;
  const choc = opts.choc !== false, seul = opts.seul, nMax = (opts.tmax || T_MAX) / DT;
  const enJeu = () => B.some((b) => (!b.arret || b.tuyau) && !b.dedans);
  const REB = { bois: () => P.rebondBois, pierre: () => P.rebondPierre, bumper: () => P.bumper };
  while (enJeu() && n < nMax) {
    if (opts.premierChoc && evts.some((e) => e.type !== 'levre' && e.type !== 'sable')) break;
    const mob = segmentsMobiles(h, t);
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (b.dedans || (seul && i !== coup.balle)) continue;
      if (b.tuyau) {
        if (n >= b.tuyau.sortie) {
          const T = b.tuyau.def, sp = Math.max(170, b.tuyau.v * 0.9);
          b.x = T.b[0] + Math.cos(T.dir) * (R_TROU + R + 3); b.y = T.b[1] + Math.sin(T.dir) * (R_TROU + R + 3);
          b.vx = Math.cos(T.dir) * sp; b.vy = Math.sin(T.dir) * sp; b.tuyau = null; b.arret = false;
          evts.push({ n, type: 'sortie', balle: i, x: b.x, y: b.y });
        }
        continue;
      }
      if (b.arret) continue;
      const vit = Math.hypot(b.vx, b.vy), ns = Math.min(8, Math.max(1, Math.ceil(vit * DT / 3))), dt = DT / ns;
      for (let s = 0; s < ns && !b.arret && !b.dedans && !b.tuyau; s++) {
        const z = zoneDe(h, b.x, b.y);
        if (z.sol !== b.sol) { if (z.sol === 'sable' && Math.hypot(b.vx, b.vy) > 60) evts.push({ n, type: 'sable', balle: i, x: b.x, y: b.y, f: Math.min(1, Math.hypot(b.vx, b.vy) / 700) }); b.sol = z.sol; }
        if (z.sol === 'eau') {
          evts.push({ n, type: 'eau', balle: i, x: b.x, y: b.y });
          b.x = b.depart[0]; b.y = b.depart[1]; b.vx = b.vy = 0; b.arret = true; if (i === coup.balle) eau++; break;
        }
        const [, gx, gy] = relief(h, b.x, b.y);
        const ax = z.ax - P.gravite * G * gx * 0.55, ay = z.ay - P.gravite * G * gy * 0.55;
        const bv = z.belt || [0, 0];
        let rx = b.vx - bv[0] + ax * dt, ry = b.vy - bv[1] + ay * dt, sp = Math.hypot(rx, ry);
        const mu = z.sol === 'sable' ? P.sable : z.sol === 'glace' ? P.glace : P.roulement;
        const k = z.sol === 'glace' ? 0.1 : z.sol === 'sable' ? 1.4 : P.trainee;
        if (sp > 0) { const nsp = Math.max(0, sp - (mu + k * sp) * dt); rx *= nsp / sp; ry *= nsp / sp; sp = nsp; }
        b.vx = rx + bv[0]; b.vy = ry + bv[1];
        b.x += b.vx * dt; b.y += b.vy * dt;
        // Trou : capturée si assez lente ; sinon attirée par la lèvre, elle peut en ressortir.
        const dc = Math.hypot(b.x - h.trou[0], b.y - h.trou[1]), vb = Math.hypot(b.vx, b.vy);
        if (dc < R_TROU) {
          if (vb < P.captureTrou || (dc < 3.5 && vb < P.captureTrou * 1.5)) { b.dedans = true; b.x = h.trou[0]; b.y = h.trou[1]; evts.push({ n, type: 'trou', balle: i, v: vb }); break; }
          const f = 2600 * (1 - dc / R_TROU) + 300;
          b.vx += (h.trou[0] - b.x) / (dc || 1) * f * dt; b.vy += (h.trou[1] - b.y) / (dc || 1) * f * dt;
          if (!evts.length || evts[evts.length - 1].type !== 'levre' || n - evts[evts.length - 1].n > 20) evts.push({ n, type: 'levre', balle: i });
        }
        // Tuyaux (entrée : n'importe quelle vitesse)
        for (const T of h.tuyaux || []) {
          if (Math.hypot(b.x - T.a[0], b.y - T.a[1]) < R_TROU + 1) {
            const L = Math.hypot(T.b[0] - T.a[0], T.b[1] - T.a[1]);
            b.tuyau = { def: T, v: Math.hypot(b.vx, b.vy), sortie: n + Math.round(Math.max(0.35, L / 520) / DT) };
            b.x = T.a[0]; b.y = T.a[1]; evts.push({ n, type: 'tuyau', balle: i, x: T.a[0], y: T.a[1] }); break;
          }
        }
        if (b.tuyau) break;
        // Rails, murs, obstacles mobiles
        const cle = Math.floor(b.x / CELL) + ',' + Math.floor(b.y / CELL), cand = (grille.get(cle) || []).map((j) => S[j]).concat(mob);
        let contact = false;
        for (const sg of cand) {
          const p = plusProche([b.x, b.y], sg.a, sg.b), d = [b.x - p[0], b.y - p[1]], dist = Math.hypot(d[0], d[1]), lim = R + sg.r;
          if (dist >= lim || dist === 0) continue;
          const nrm = [d[0] / dist, d[1] / dist];
          b.x = p[0] + nrm[0] * lim; b.y = p[1] + nrm[1] * lim;
          const vs = sg.v || (sg.rot ? [-sg.rot.w * (p[1] - sg.rot.c[1]), sg.rot.w * (p[0] - sg.rot.c[0])] : [0, 0]);
          const rel = [b.vx - vs[0], b.vy - vs[1]], vn = dot(rel, nrm);
          if (vn < 0) {
            const e = REB[sg.e](), tg = [rel[0] - vn * nrm[0], rel[1] - vn * nrm[1]];
            b.vx = vs[0] + tg[0] * 0.95 - e * vn * nrm[0]; b.vy = vs[1] + tg[1] * 0.95 - e * vn * nrm[1];
            if (-vn > 35) evts.push({ n, type: sg.mi != null ? 'mobile' : sg.e === 'pierre' ? 'pierre' : 'mur', balle: i, f: Math.min(1, -vn / 700), x: p[0], y: p[1] });
          }
          contact = true;
        }
        for (const c of ronds) {
          const d = [b.x - c.x, b.y - c.y], dist = Math.hypot(d[0], d[1]), lim = R + c.r;
          if (dist >= lim || dist === 0) continue;
          const nrm = [d[0] / dist, d[1] / dist], vn = b.vx * nrm[0] + b.vy * nrm[1];
          b.x = c.x + nrm[0] * lim; b.y = c.y + nrm[1] * lim;
          if (vn < 0) {
            const e = REB[c.e]();
            b.vx -= (1 + e) * vn * nrm[0]; b.vy -= (1 + e) * vn * nrm[1];
            if (c.e === 'bumper') { const s2 = Math.hypot(b.vx, b.vy), mn = 260; if (s2 < mn) { b.vx *= mn / s2; b.vy *= mn / s2; } if (s2 > P.vitesseMax) { b.vx *= P.vitesseMax / s2; b.vy *= P.vitesseMax / s2; } }
            evts.push({ n, type: c.e === 'bumper' ? 'bumper' : 'pierre', balle: i, idx: c.idx, f: Math.min(1, -vn / 600), x: c.x + nrm[0] * c.r, y: c.y + nrm[1] * c.r });
          }
          contact = true;
        }
        // Arrêt : presque immobile (dans le repère du tapis), et pas emportée par le relief.
        const rsp = Math.hypot(b.vx - bv[0], b.vy - bv[1]), pente = Math.hypot(ax, ay);
        if (!z.belt && rsp < 4 && (pente < mu * 0.95 || contact)) { b.vx = b.vy = 0; b.arret = true; }
      }
    }
    if (choc) for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], c = B[j];
      if (a.dedans || c.dedans || a.tuyau || c.tuyau || (seul && (i !== coup.balle && j !== coup.balle))) continue;
      const d = [c.x - a.x, c.y - a.y], dist = Math.hypot(d[0], d[1]);
      if (dist >= 2 * R || dist === 0) continue;
      const nrm = [d[0] / dist, d[1] / dist], rel = (a.vx - c.vx) * nrm[0] + (a.vy - c.vy) * nrm[1], pen = 2 * R - dist;
      a.x -= nrm[0] * pen / 2; a.y -= nrm[1] * pen / 2; c.x += nrm[0] * pen / 2; c.y += nrm[1] * pen / 2;
      if (rel > 0) {
        const jx = (1 + P.choc) / 2 * rel;
        a.vx -= jx * nrm[0]; a.vy -= jx * nrm[1]; c.vx += jx * nrm[0]; c.vy += jx * nrm[1];
        a.arret = c.arret = false;
        evts.push({ n, type: 'choc', balle: i, f: Math.min(1, rel / 600), x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 });
      }
    }
    if (n % PAS_IMAGE === 0) images.push(B.map((b) => [b.x, b.y, b.dedans ? 1 : 0, b.tuyau ? 0 : 1]));
    t += DT; n++;
  }
  images.push(B.map((b) => [b.x, b.y, b.dedans ? 1 : 0, 1]));
  return { images, evts, eau, final: { balles: B.map((b) => ({ x: b.x, y: b.y, dedans: b.dedans })), horloge: t } };
}

/* =====================================================================================
   PARCOURS — 18 trous, 6 par difficulté. Outils de dessin : couloir (piste courbe à bouts ronds), salle arrondie,
   maison de moulin (tunnel + pales qui ferment l'entrée), bosses / cuvettes, tapis roulants, tourniquet, tuyaux.
   ===================================================================================== */
export const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
export const arcPts = (cx, cy, r, a0, a1, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
export function salle(x, y, w, h, r) {
  return [...arcPts(x + w - r, y + r, r, -Math.PI / 2, 0, 6), ...arcPts(x + w - r, y + h - r, r, 0, Math.PI / 2, 6),
    ...arcPts(x + r, y + h - r, r, Math.PI / 2, Math.PI, 6), ...arcPts(x + r, y + r, r, Math.PI, 1.5 * Math.PI, 6)];
}
export function ellipse(cx, cy, rx, ry, n = 22, bruit = 0, graine = 1) {
  return Array.from({ length: n }, (_, i) => { const a = i / n * 2 * Math.PI, k = 1 + bruit * Math.sin(a * 3 + graine) * Math.cos(a * 2 - graine); return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]; });
}
/** Contour fermé lissé (berges, bunkers dessinés à la main). */
export function lisse(pts, pas = 10) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n], m = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / pas));
    for (let k = 0; k < m; k++) { const t = k / m, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3))); }
  }
  return out;
}
export function spline(pts, pas = 12) {
  const out = [], Q = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < Q.length - 2; i++) {
    const p0 = Q[i - 1], p1 = Q[i], p2 = Q[i + 1], p3 = Q[i + 2], n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / pas));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
export function couloir(ctrl, larg) {
  const c = spline(ctrl), gau = [], dro = [], w = larg / 2;
  const tg = (i) => { const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  c.forEach((p, i) => { const [tx, ty] = tg(i); gau.push([p[0] - ty * w, p[1] + tx * w]); dro.push([p[0] + ty * w, p[1] - tx * w]); });
  // Côté intérieur d'un virage serré : la ligne décalée fait une petite boucle, qu'on coupe à son point de croisement.
  const nettoyer = (L) => {
    const X = (a, b, c2, d) => { const den = (b[0] - a[0]) * (d[1] - c2[1]) - (b[1] - a[1]) * (d[0] - c2[0]); if (!den) return null;
      const t = ((c2[0] - a[0]) * (d[1] - c2[1]) - (c2[1] - a[1]) * (d[0] - c2[0])) / den, u = ((c2[0] - a[0]) * (b[1] - a[1]) - (c2[1] - a[1]) * (b[0] - a[0])) / den;
      return t > 0 && t < 1 && u > 0 && u < 1 ? [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] : null; };
    for (let i = 0; i < L.length - 1; i++) for (let j = Math.min(L.length - 2, i + 40); j > i + 1; j--) {
      const p = X(L[i], L[i + 1], L[j], L[j + 1]); if (p) { L.splice(i + 1, j - i, p); break; }
    }
    return L;
  };
  nettoyer(gau); nettoyer(dro);
  const [ex, ey] = tg(c.length - 1), [sx, sy] = tg(0), ae = Math.atan2(ey, ex), as = Math.atan2(sy, sx);
  const e = c[c.length - 1], s = c[0];
  return [...gau, ...arcPts(e[0], e[1], w, ae + Math.PI / 2, ae - Math.PI / 2, 10).slice(1, -1), ...dro.reverse(), ...arcPts(s[0], s[1], w, as - Math.PI / 2, as - 1.5 * Math.PI, 10).slice(1, -1)];
}
/** Maison de moulin : deux blocs de part et d'autre d'un tunnel, un toit (dessiné au-dessus de la balle), et
 *  éventuellement des pales qui ferment l'entrée quand l'une d'elles passe en bas. dir : sens de passage. */
export function maison(t, cx, cy, dir, o = {}) {
  const L = o.long || 96, Lg = o.large || 150, tu = o.tunnel || 36, ux = Math.cos(dir), uy = Math.sin(dir), vx = -uy, vy = ux;
  const p = (u, v) => [cx + ux * u + vx * v, cy + uy * u + vy * v];
  t.murs = t.murs || []; t.toits = t.toits || []; t.mobiles = t.mobiles || [];
  t.murs.push({ bloc: true, style: 'maison', pts: [p(-L / 2, -Lg / 2), p(L / 2, -Lg / 2), p(L / 2, -tu / 2), p(-L / 2, -tu / 2)] });
  t.murs.push({ bloc: true, style: 'maison', pts: [p(-L / 2, tu / 2), p(L / 2, tu / 2), p(L / 2, Lg / 2), p(-L / 2, Lg / 2)] });
  t.toits.push({ c: [cx, cy], dir, L, Lg, tu, pales: !!o.pales });
  if (o.pales) t.mobiles.push({ type: 'moulin', c: [cx, cy], dir, devant: -L / 2 - 9, tunnel: tu, pales: o.pales, w: o.w || 1.4, phase: o.phase || 0, ouverture: o.ouverture || 0.38, l: o.l || Lg * 0.62 });
  return t;
}
export const T = (o) => o;
export const TROUS = [
  // ---------------------------------------------------------------- FACILE
  T({ id: 'f1', nom: 'Le Jardin', diff: 'facile', par: 2, bord: couloir([[80, 250], [260, 160], [470, 310], [680, 230]], 150), depart: [96, 246], trou: [650, 236],
    rocs: [{ x: 372, y: 238, r: 26, style: 'massif' }] }),
  T({ id: 'f2', nom: 'Le Slalom', diff: 'facile', par: 2, bord: salle(0, 0, 800, 270, 70), depart: [80, 135], trou: [720, 135],
    rocs: [{ x: 250, y: 135, r: 26, style: 'massif' }, { x: 400, y: 72, r: 22, style: 'massif' }, { x: 400, y: 198, r: 22, style: 'massif' }, { x: 550, y: 135, r: 26, style: 'massif' }] }),
  T({ id: 'f3', nom: 'Le Fer à cheval', diff: 'facile', par: 3, bord: couloir([[90, 90], [430, 90], [580, 195], [430, 300], [90, 300]], 124), depart: [104, 90], trou: [118, 300],
    rocs: [{ x: 300, y: 196, r: 22, style: 'roc' }] }),
  T({ id: 'f4', nom: 'Les Champignons', diff: 'facile', par: 2, bord: salle(0, 0, 660, 380, 80), depart: [80, 190], trou: [580, 190],
    bumpers: [{ x: 330, y: 132, r: 17 }, { x: 330, y: 248, r: 17 }, { x: 450, y: 190, r: 19 }] }),
  T({ id: 'f5', nom: "L'Entonnoir", diff: 'facile', par: 2, bord: salle(0, 0, 720, 380, 70), depart: [80, 190], trou: [640, 190],
    murs: [{ pts: [[300, 40], [540, 160]] }, { pts: [[300, 340], [540, 220]] }], bumpers: [{ x: 300, y: 190, r: 16 }] }),
  maison(T({ id: 'f6', nom: 'La Chaumière', diff: 'facile', par: 2, bord: couloir([[80, 180], [720, 180]], 140), depart: [96, 180], trou: [670, 180] }), 400, 180, 0, { large: 150 }),
  // ---------------------------------------------------------------- NORMAL
  maison(T({ id: 'n1', nom: 'Le Moulin', diff: 'normal', par: 3, bord: salle(0, 0, 840, 300, 60), depart: [80, 150], trou: [750, 150],
    rocs: [{ x: 620, y: 90, r: 20, style: 'roc' }, { x: 620, y: 210, r: 20, style: 'roc' }] }), 420, 150, 0, { large: 160, pales: 4, w: 1.25 }),
  T({ id: 'n2', nom: 'Le Ruisseau', diff: 'normal', par: 3, bord: salle(0, 0, 840, 380, 50), depart: [80, 300], trou: [760, 90],
    zones: [{ type: 'eau', pts: lisse([[325, -20], [455, -20], [470, 80], [445, 190], [470, 300], [450, 400], [320, 400], [300, 290], [330, 180], [305, 80]]) },
      { type: 'pont', pts: rect(290, 150, 200, 64) }],
    murs: [{ pts: [[300, 148], [480, 148]] }, { pts: [[300, 216], [480, 216]] }], rocs: [{ x: 620, y: 260, r: 24, style: 'roc' }] }),
  T({ id: 'n3', nom: 'Le Bunker', diff: 'normal', par: 3, bord: couloir([[90, 90], [460, 90], [600, 210], [600, 420]], 140), depart: [104, 90], trou: [600, 405],
    zones: [{ type: 'sable', pts: ellipse(610, 120, 80, 62, 22, 0.15, 2) }, { type: 'sable', pts: ellipse(520, 330, 40, 56, 18, 0.12, 4) }] }),
  T({ id: 'n4', nom: 'Les Tapis', diff: 'normal', par: 3, bord: salle(0, 0, 800, 360, 50), depart: [80, 270], trou: [720, 90],
    zones: [{ type: 'tapis', pts: rect(320, 40, 72, 280), vx: 0, vy: 170 }, { type: 'tapis', pts: rect(408, 40, 72, 280), vx: 0, vy: -170 }] }),
  T({ id: 'n5', nom: 'Le Flipper', diff: 'normal', par: 3, bord: salle(0, 0, 820, 430, 70), depart: [74, 215], trou: [745, 215],
    bumpers: [{ x: 240, y: 120, r: 17 }, { x: 240, y: 310, r: 17 }, { x: 380, y: 215, r: 20 }, { x: 520, y: 110, r: 17 }, { x: 520, y: 320, r: 17 }, { x: 640, y: 215, r: 15 }],
    murs: [{ pts: [[690, 120], [690, 175]] }, { pts: [[690, 255], [690, 310]] }] }),
  T({ id: 'n6', nom: 'Le Tourniquet', diff: 'normal', par: 3, bord: salle(0, 0, 780, 420, 70), depart: [74, 210], trou: [705, 210],
    zones: [{ type: 'tourniquet', x: 390, y: 210, r: 120, w: 1.7 }], rocs: [{ x: 390, y: 50, r: 22, style: 'roc' }, { x: 390, y: 370, r: 22, style: 'roc' }], bumpers: [{ x: 600, y: 120, r: 15 }, { x: 600, y: 300, r: 15 }] }),
  // ---------------------------------------------------------------- EXPERT
  T({ id: 'e1', nom: 'Le Serpent', diff: 'expert', par: 4, bord: couloir([[80, 90], [320, 80], [400, 200], [250, 320], [320, 440], [600, 440], [690, 300], [610, 180], [740, 80]], 104), depart: [96, 90], trou: [728, 86],
    zones: [{ type: 'sable', pts: ellipse(240, 330, 42, 34, 16, 0.1, 1) }, { type: 'sable', pts: ellipse(690, 320, 36, 46, 16, 0.12, 3) }] }),
  T({ id: 'e2', nom: "L'Île", diff: 'expert', par: 3, bord: salle(0, 0, 840, 440, 40), depart: [80, 220], trou: [680, 220],
    zones: [{ type: 'eau', pts: [[175, -20], [860, -20], [860, 460], [175, 460]] }, { type: 'pont', pts: rect(165, 194, 385, 52) }, { type: 'gazon', pts: ellipse(660, 220, 135, 115, 26, 0.08, 5) }],
    murs: [{ pts: [[175, 192], [530, 192]] }, { pts: [[175, 248], [530, 248]] }],
    mobiles: [{ type: 'porte', a: [345, 170], b: [345, 270], taille: [24, 40], periode: 2.8 }], bumpers: [{ x: 760, y: 220, r: 15 }] }),
  maison(maison(T({ id: 'e3', nom: 'Les Deux Moulins', diff: 'expert', par: 3, bord: salle(0, 0, 920, 300, 50), depart: [70, 150], trou: [850, 150],
    rocs: [{ x: 460, y: 150, r: 26, style: 'massif' }] }), 280, 150, 0, { large: 300, pales: 3, w: 1.7, ouverture: 0.5 }), 640, 150, 0, { large: 300, pales: 4, w: -2.1, phase: 1, ouverture: 0.42 }),
  T({ id: 'e4', nom: 'Le Cratère', diff: 'expert', par: 3, bord: salle(0, 0, 780, 460, 90), depart: [80, 230], trou: [530, 230],
    murs: [{ pts: arcPts(530, 230, 78, 0.6, 2 * Math.PI - 0.6, 22) }], zones: [{ type: 'sable', pts: ellipse(680, 230, 50, 120, 22, 0.1, 3) }], rocs: [{ x: 300, y: 100, r: 20, style: 'roc' }, { x: 300, y: 360, r: 20, style: 'roc' }, { x: 700, y: 90, r: 18, style: 'roc' }] }),
  T({ id: 'e5', nom: 'Le Labyrinthe', diff: 'expert', par: 4, bord: salle(0, 0, 780, 460, 40), depart: [90, 70], trou: [680, 90],
    murs: [{ bloc: true, pts: rect(180, 0, 30, 340) }, { bloc: true, pts: rect(370, 120, 30, 340) }, { bloc: true, pts: rect(560, 0, 30, 340) }],
    tuyaux: [{ a: [90, 405], b: [700, 410], dir: 0 }], zones: [{ type: 'sable', pts: ellipse(470, 405, 50, 30, 16, 0.1, 2) }] }),
  T({ id: 'e6', nom: 'La Glissoire', diff: 'expert', par: 3, bord: salle(0, 0, 840, 380, 50), depart: [70, 110], trou: [760, 110],
    zones: [{ type: 'glace', pts: rect(190, 0, 460, 380) }, { type: 'pente', pts: rect(190, 0, 460, 380), ax: 0, ay: 130 }, { type: 'eau', pts: [[190, 300], [650, 300], [650, 400], [190, 400]] }],
    rocs: [{ x: 420, y: 40, r: 18, style: 'roc' }], bumpers: [{ x: 700, y: 230, r: 15 }] }),
];
export const DIFFS = {
  facile: { l: 'Facile', d: 'Parcours ouverts, grande flèche de visée.', tirage: ['facile'] },
  normal: { l: 'Normal', d: 'Sable, eau, moulins, tapis. Petite flèche de visée.', tirage: ['normal', 'facile'] },
  expert: { l: 'Expert', d: 'Îles, cratère, labyrinthe. Seule la force est affichée.', tirage: ['expert', 'normal'] },
};

export const TROU_PAR_ID: Record<string, any> = Object.fromEntries(TROUS.map((h) => [h.id, h]));
export const MAX_COUPS = (h: any) => h.par + 4;
