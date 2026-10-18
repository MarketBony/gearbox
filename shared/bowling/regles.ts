// @ts-nocheck — règles écrites en JavaScript (prototype maquettes/jeux/bowling/regles.js), typées « any » à dessein.
// =====================================================================================
// BOWLING — score officiel, PARTAGÉ entre le serveur (il tient la partie) et le navigateur (feuille de score).
// Source canonique : shared/bowling/regles.ts ; copie OCTET POUR OCTET dans backend/src/games/bowling/regles.ts
// (scripts/check-bowling-sync.mjs). Reprise à l’identique du prototype (testé : 300 / 150 / 0 / 167 / 190).
// =====================================================================================
/* eslint-disable */
// Règles du bowling (score officiel, frames, remise des quilles). Pur, partagé plus tard avec le serveur.
// Testé : 300 / 150 / 0 / 167 / 190 (parties de référence).
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
