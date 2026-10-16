/* =====================================================================================
   BOWLING — moteur pur et DÉTERMINISTE (prototype, 16/10/2026). Deviendra shared/bowling.ts, le même au serveur et
   au navigateur, comme le minigolf : le navigateur n'enverra que { x0, angle, puissance, effet } ; le serveur simulera
   et fera foi. Donc : aucun Math.random, aucune horloge, pas fixe.

   Repère : mètres et secondes d'une vraie piste. x = latéral (positif = à DROITE vu du joueur), z = le long de la piste
   (0 = ligne de faute, quille 1 à 18,29 m). La physique est à plat (le plan de la piste) ; la chute d'une quille est
   modélisée par une « capsule » qui s'allonge dans le sens de la chute (le haut de la quille balaie ses voisines).
   ===================================================================================== */

export const PISTE = {
  demi: 0.527,        // demi-largeur de piste (41,5 pouces)
  gouttiere: 0.235,   // largeur d'une gouttière
  quille1: 18.29,     // ligne de faute → quille 1
  ecart: 0.3048,      // 12 pouces entre quilles voisines
  rang: 0.264,        // écart entre deux rangées (12 × √3 / 2)
  huile: 11.5,        // fin de la zone huilée (la boule glisse, ne crochète presque pas)
  plateau: 17.75,     // début de l'aire des quilles (murs latéraux = « kickbacks »)
  murX: 0.762,        // position des murs latéraux de l'aire des quilles
  fosse: 19.45,       // au-delà : la quille ou la boule tombe dans la fosse
};
export const R_BOULE = 0.109, R_QUILLE = 0.06, H_QUILLE = 0.381, M_BOULE = 7, M_QUILLE = 1.55;
export const DT = 1 / 240, PAS_IMAGE = 4, T_MAX = 9;

/** Réglages de la physique (réglés par simulation, voir scripts de test du prototype). */
export const P = {
  vMin: 3.4, vMax: 9.0,          // vitesse de la boule (m/s) selon la puissance 0..1
  angleMax: 0.07,                // angle de lancer maximal (rad)
  crochet: 0.62, crochetHuile: 0.04, // accélération latérale due à l'effet (m/s²), zone sèche / huilée
  freinHuile: 0.08, freinSec: 0.22,  // ralentissement de la boule (m/s²)
  vChute: 0.42,                  // vitesse reçue au-delà de laquelle une quille debout tombe
  eQuilles: 0.6, eBoule: 0.45, eMur: 0.5,
  frottQuille: 2.4,              // freinage d'une quille couchée qui glisse (m/s²)
  amortiDebout: 16,              // une quille debout poussée doucement vacille sur place
  dureeChute: 0.3,               // temps pour qu'une quille touche le sol
  balayage: 1.4,                 // vitesse du haut de la quille pendant la chute (m/s), au bout de la capsule
};

/** Les 10 emplacements, numérotés comme au bowling : 1 devant, puis 2-3, 4-5-6, 7-8-9-10 de gauche à droite. */
export function emplacements() {
  const out = [];
  let n = 0;
  for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++) out.push({ n: ++n, x: (i - r / 2) * PISTE.ecart, z: PISTE.quille1 + r * PISTE.rang });
  return out;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r6 = (v) => Math.round(v * 1e6) / 1e6; // arrondi des états échangés (rejouables à l'identique)

/** Points les plus proches entre deux segments [p1,q1] et [p2,q2] (Ericson). Un segment de longueur 0 = un point. */
function segSeg(p1x, p1z, q1x, q1z, p2x, p2z, q2x, q2z) {
  const d1x = q1x - p1x, d1z = q1z - p1z, d2x = q2x - p2x, d2z = q2z - p2z, rx = p1x - p2x, rz = p1z - p2z;
  const a = d1x * d1x + d1z * d1z, e = d2x * d2x + d2z * d2z, f = d2x * rx + d2z * rz;
  let s = 0, t = 0;
  if (a <= 1e-12 && e <= 1e-12) { s = 0; t = 0; }
  else if (a <= 1e-12) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1x * rx + d1z * rz;
    if (e <= 1e-12) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1x * d2x + d1z * d2z, den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  return [p1x + d1x * s, p1z + d1z * s, s, p2x + d2x * t, p2z + d2z * t, t];
}

/** Forme d'une quille : capsule [base → base + dir × L] ; debout, L = 0 (un simple disque). */
function forme(q, t) {
  if (!q.tombe) return { ax: q.x, az: q.z, bx: q.x, bz: q.z, r: R_QUILLE, prog: 1 };
  const prog = Math.min(1, (t - q.tChute) / P.dureeChute), L = H_QUILLE * 0.82 * prog;
  return { ax: q.x, az: q.z, bx: q.x + q.dx * L, bz: q.z + q.dz * L, r: R_QUILLE * 0.85, prog };
}

/**
 * Simule un lancer. `debout` : les quilles encore debout ({ n, x, z }). `lancer` : { x0, angle, puissance, effet }
 * (x0 en m depuis l'axe, angle en rad, puissance 0..1, effet -1..1 : positif = la boule crochète vers la GAUCHE,
 * comme le lancer d'un droitier). Rend les images à rejouer (toutes les PAS_IMAGE étapes) et le résultat.
 */
export function simuler(debout, lancer) {
  const x0 = clamp(+lancer.x0 || 0, -PISTE.demi + R_BOULE, PISTE.demi - R_BOULE);
  const angle = clamp(+lancer.angle || 0, -P.angleMax, P.angleMax);
  const puis = clamp(+lancer.puissance || 0, 0, 1), effet = clamp(+lancer.effet || 0, -1, 1);
  const v0 = P.vMin + (P.vMax - P.vMin) * puis;
  const b = { x: x0, z: 0, vx: v0 * Math.sin(angle), vz: v0 * Math.cos(angle), gout: false, fosse: false };
  const Q = debout.map((q) => ({ n: q.n, x: q.x, z: q.z, vx: 0, vz: 0, tombe: false, tChute: 0, dx: 0, dz: 1, sortie: false, wob: 0 }));
  const images = [];
  let t = 0, pas = 0, calme = 0;

  const faireTomber = (q) => {
    if (q.tombe) return;
    const v = Math.hypot(q.vx, q.vz) || 1;
    q.tombe = true; q.tChute = t; q.dx = q.vx / v; q.dz = q.vz / v;
  };

  /** Impulsion entre deux corps (masses mA, mB) au point de contact, normale n de A vers B. */
  const choc = (A, mA, sA, B, mB, sB, nx, nz, pen, e) => {
    const vax = A.vx + sA[0], vaz = A.vz + sA[1], vbx = B.vx + sB[0], vbz = B.vz + sB[1];
    const vrel = (vbx - vax) * nx + (vbz - vaz) * nz;
    const ia = 1 / mA, ib = 1 / mB;
    if (vrel < 0) {
      const j = -(1 + e) * vrel / (ia + ib);
      A.vx -= j * ia * nx; A.vz -= j * ia * nz; B.vx += j * ib * nx; B.vz += j * ib * nz;
    }
    const c = pen / (ia + ib);
    A.x -= c * ia * nx; A.z -= c * ia * nz; B.x += c * ib * nx; B.z += c * ib * nz;
  };
  // Vitesse ajoutée par la chute au point de contact (le haut de la quille balaie plus vite que la base).
  const balaie = (q, s, prog) => (q.tombe && prog < 1 ? [q.dx * s * P.balayage, q.dz * s * P.balayage] : [0, 0]);

  while (t < T_MAX) {
    // ---- Boule ----
    if (!b.fosse) {
      const v = Math.hypot(b.vx, b.vz);
      if (!b.gout && b.z < PISTE.quille1) b.vx += -effet * (b.z < PISTE.huile ? P.crochetHuile : P.crochet) * DT;
      const frein = (b.z < PISTE.huile ? P.freinHuile : P.freinSec) * DT;
      if (v > 0.05) { const k = Math.max(0, v - frein) / v; b.vx *= k; b.vz *= k; }
      b.x += b.vx * DT; b.z += b.vz * DT;
      if (!b.gout && b.z < PISTE.plateau && Math.abs(b.x) > PISTE.demi - R_BOULE * 0.3) {
        b.gout = true; b.x = Math.sign(b.x) * (PISTE.demi + PISTE.gouttiere / 2); b.vx = 0;
      }
      if (!b.gout && b.z >= PISTE.plateau && Math.abs(b.x) > PISTE.murX - R_BOULE) { b.x = Math.sign(b.x) * (PISTE.murX - R_BOULE); b.vx = -b.vx * P.eMur; }
      if (b.z > PISTE.fosse) b.fosse = true;
    }

    // ---- Quilles : mouvement ----
    for (const q of Q) {
      if (q.sortie) continue;
      if (!q.tombe) {
        const k = Math.exp(-P.amortiDebout * DT); q.vx *= k; q.vz *= k;
        q.wob = Math.max(q.wob * Math.exp(-3 * DT), Math.hypot(q.vx, q.vz));
      } else {
        const v = Math.hypot(q.vx, q.vz);
        if (v > 0) { const k = Math.max(0, v - P.frottQuille * DT) / v; q.vx *= k; q.vz *= k; }
      }
      q.x += q.vx * DT; q.z += q.vz * DT;
      if (q.z > PISTE.plateau - 0.3 && Math.abs(q.x) > PISTE.murX - R_QUILLE) { q.x = Math.sign(q.x) * (PISTE.murX - R_QUILLE); q.vx = -q.vx * P.eMur; faireTomber(q); }
      if (q.z > PISTE.fosse || q.z < PISTE.quille1 - 1.5) { q.sortie = true; q.tombe = true; if (!q.tChute) q.tChute = t; }
      if (!q.tombe && q.z < PISTE.plateau && Math.abs(q.x) > PISTE.demi) faireTomber(q); // tombée dans la gouttière
    }

    // ---- Collisions ----
    if (!b.gout && !b.fosse) {
      for (const q of Q) {
        if (q.sortie) continue;
        const f = forme(q, t);
        const [, , , cx, cz, s] = segSeg(b.x, b.z, b.x, b.z, f.ax, f.az, f.bx, f.bz);
        let nx = cx - b.x, nz = cz - b.z; const d = Math.hypot(nx, nz), pen = R_BOULE + f.r - d;
        if (pen > 0 && d > 1e-9) {
          nx /= d; nz /= d;
          choc(b, M_BOULE, [0, 0], q, M_QUILLE, balaie(q, s, f.prog), nx, nz, pen, P.eBoule);
          if (Math.hypot(q.vx, q.vz) > P.vChute) faireTomber(q);
        }
      }
    }
    for (let i = 0; i < Q.length; i++) {
      const A = Q[i]; if (A.sortie) continue;
      const fa = forme(A, t);
      for (let j = i + 1; j < Q.length; j++) {
        const B = Q[j]; if (B.sortie) continue;
        if (!A.tombe && !B.tombe && Math.abs(A.x - B.x) > 0.2) continue; // deux quilles debout à leur place ne se touchent pas
        const fb = forme(B, t);
        const [px, pz, s1, cx, cz, s2] = segSeg(fa.ax, fa.az, fa.bx, fa.bz, fb.ax, fb.az, fb.bx, fb.bz);
        let nx = cx - px, nz = cz - pz; const d = Math.hypot(nx, nz), pen = fa.r + fb.r - d;
        if (pen > 0 && d > 1e-9) {
          nx /= d; nz /= d;
          const avA = Math.hypot(A.vx, A.vz), avB = Math.hypot(B.vx, B.vz);
          choc(A, M_QUILLE, balaie(A, s1, fa.prog), B, M_QUILLE, balaie(B, s2, fb.prog), nx, nz, pen, P.eQuilles);
          if (!A.tombe && Math.hypot(A.vx, A.vz) - avA > P.vChute * 0.5 && Math.hypot(A.vx, A.vz) > P.vChute) faireTomber(A);
          if (!B.tombe && Math.hypot(B.vx, B.vz) - avB > P.vChute * 0.5 && Math.hypot(B.vx, B.vz) > P.vChute) faireTomber(B);
        }
      }
    }

    t += DT; pas++;
    if (pas % PAS_IMAGE === 0) {
      images.push({
        b: [r6(b.x), r6(b.z), b.gout ? 1 : 0, b.fosse ? 1 : 0],
        q: Q.map((q) => [r6(q.x), r6(q.z), q.tombe ? r6(Math.min(1, (t - q.tChute) / P.dureeChute)) : 0, r6(Math.atan2(q.dx, q.dz)), r6(Math.min(0.3, q.wob * 0.5)), q.sortie ? 1 : 0]),
      });
    }
    // Fin : boule partie (fosse ou gouttière passée) et plus rien ne bouge depuis 0,4 s.
    const bougent = Q.some((q) => !q.sortie && (Math.hypot(q.vx, q.vz) > 0.03 || (q.tombe && t - q.tChute < P.dureeChute)));
    calme = (b.fosse || b.z > PISTE.fosse) && !bougent ? calme + DT : 0;
    if (calme > 0.4) break;
  }

  const restent = Q.filter((q) => !q.tombe && !q.sortie).map((q) => ({ n: q.n, x: r6(q.x), z: r6(q.z) }));
  return { images, restent, tombees: debout.length - restent.length, gouttiere: b.gout, duree: t };
}

/* =====================================================================================
   SCORE — règles officielles : 10 frames ; strike = 10 + les 2 lancers suivants ; spare = 10 + le lancer suivant ;
   10e frame : 3 lancers si strike ou spare. `nbFrames` permet une partie courte (même règle sur la dernière frame).
   ===================================================================================== */
export function tableau(lancers, nbFrames = 10) {
  // 1) Découpe en frames (lancers de chaque frame + indice de son premier lancer).
  const frames = [];
  let i = 0;
  for (let f = 0; f < nbFrames; f++) {
    const derniere = f === nbFrames - 1, d = i;
    let l;
    if (!derniere) l = lancers[i] === 10 ? [10] : lancers.slice(i, i + 2);
    else {
      l = lancers.slice(i, i + 2);
      if (l.length === 2 && (l[0] === 10 || l[0] + l[1] === 10) && lancers[i + 2] !== undefined) l.push(lancers[i + 2]);
    }
    i += l.length;
    const strike = l[0] === 10, spare = !strike && l.length >= 2 && l[0] + l[1] === 10;
    const fini = derniere ? (l.length === 3 || (l.length === 2 && !strike && !spare)) : strike || l.length === 2;
    frames.push({ l, d, strike, spare, derniere, fini, total: null });
  }
  // 2) Cumuls : un strike attend les 2 lancers suivants, un spare le suivant ; un cumul en attente bloque la suite.
  let cumul = 0;
  for (const fr of frames) {
    if (!fr.fini) break;
    let pts;
    if (fr.derniere) pts = fr.l.reduce((a, c) => a + c, 0);
    else if (fr.strike) pts = lancers[fr.d + 1] !== undefined && lancers[fr.d + 2] !== undefined ? 10 + lancers[fr.d + 1] + lancers[fr.d + 2] : null;
    else if (fr.spare) pts = lancers[fr.d + 2] !== undefined ? 10 + lancers[fr.d + 2] : null;
    else pts = fr.l[0] + fr.l[1];
    if (pts === null) break;
    cumul += pts; fr.total = cumul;
  }
  return { frames, total: cumul, fini: frames[nbFrames - 1].fini };
}

/** Où en est un joueur : numéro de frame (0..), numéro de lancer dans la frame, et faut-il remettre les 10 quilles ? */
export function position(lancers, nbFrames = 10) {
  let i = 0;
  for (let f = 0; f < nbFrames; f++) {
    const derniere = f === nbFrames - 1;
    const r = lancers.slice(i);
    if (!derniere) {
      if (!r.length) return { frame: f, lancer: 0, rack: true };
      if (r[0] === 10) { i += 1; continue; }
      if (r.length === 1) return { frame: f, lancer: 1, rack: false };
      i += 2;
    } else {
      if (!r.length) return { frame: f, lancer: 0, rack: true };
      if (r.length === 1) return { frame: f, lancer: 1, rack: r[0] === 10 };
      const bonus = r[0] === 10 || r[0] + r[1] === 10;
      if (r.length === 2 && bonus) return { frame: f, lancer: 2, rack: r[1] === 10 || (r[0] !== 10 && r[0] + r[1] === 10) || (r[0] === 10 && r[1] === 10) };
      return { frame: nbFrames, lancer: 0, rack: false, fini: true };
    }
  }
  return { frame: nbFrames, lancer: 0, rack: false, fini: true };
}
