// @ts-nocheck — assemblage repris du prototype validé (maquettes/jeux/bowling/jeu.js), en JavaScript.
// =====================================================================================
// BOWLING — ASSEMBLAGE (intégration v2, 18/10/2026). Repris de maquettes/jeux/bowling/jeu.js : le GESTE (réglages
// GESTE / LECTURE inchangés), la mise en scène image par image, le HUD et la partie à la charte. Ce qui change :
//  - tout est monté dans une RACINE (la fenêtre v2 vit dans une racine fantôme : aucun `document.querySelector`),
//    et tout se libère à la fermeture (`detruire` : boucle, écouteurs, Worker, WebGL, AudioContext) ;
//  - deux modes :
//      'solo'  : entraînement local, exactement le prototype (1 ou 2 joueurs sur le même poste, aucun serveur,
//                aucune écriture) ;
//      'duel'  : partie à deux contre un collègue. On n'envoie au serveur QUE le lancer issu du geste
//                ({ position, angle, vitesse, effet, lacher }) ; le serveur le rejoue (backend/src/games/
//                bowlingRules.ts) et FAIT FOI : lancers, quilles debout, tour, fin et vainqueur viennent de son
//                plateau. En parallèle on simule localement (même moteur, même Rapier : même résultat au bit près)
//                pour animer tout de suite, et l'on contrôle que le résultat local = celui du serveur. Le lancer de
//                l'adversaire est rejoué chez nous à partir de `board.dernier` (entrées du moteur + quilles avant).
// =====================================================================================
import { creerRendu } from './rendu';
import { creerSon } from './son';
import { tableau, position } from '../../../../shared/bowling/regles';
import * as PH from '../../../../shared/bowling/physique';
const { emplacements, DIMENSIONS } = PH;
import { ANNONCES as ANNONCES_CGT } from './cgt';
import URL_LOGO_BLANC from './assets/logo-bony-white.svg?url';
import URL_LOGO_COULEUR from './assets/logo-bony-color.svg?url';
import URL_LOGO_CGT from './assets/logo-cgt.svg?url';

/* =====================================================================================
   RÉGLAGES DU RESSENTI — identiques au prototype validé (ne pas retoucher sans Théo)
   ===================================================================================== */
const GESTE = {
  tirage: 0.25, depassement: 0.10, seuilTir: 9, seuilPlacement: 14, ressort: 160, amorti: 0.7,
  vMin: 0.6, vMax: 8.0, toucher: 0.5, vitesseMin: 3, vitesseMax: 10.5, brideTirage: 0.6,
  annuler: { vMin: 0.4, tirageMin: 0.14 },
  effet: { zoneMorte: 5, plein: 32, expo: 1.25, corps: 0.5, trait: 0.7 },
  direction: { gain: 0.0024, zoneMorte: 0.5 },
  precision: { debut: 0.5, ampliMax: 1.8, effetMin: 0.55 },
  lacher: { tot: 0.6, tard: 0.08, tardPlein: 0.45, min: 0.35, devMax: 0.02 },
  place: { sensibilite: 0.75, pas: 0.6, angle: 0.06, molette: 0.004 },
};
const LECTURE = { ralenti: 0.35, avantImpact: 0.08, apresImpact: 0.7, rampe: 0.12, verdict: 1.0, fin: 2.3, fete: 2.6, feteStrike: 3.2, machine: 2.6 };
const NOMS = { bony: ['Joueur 1', 'Joueur 2'], cgt: ['Camarade 1', 'Camarade 2'] };
const TITRES_BONY = { strike: 'strike !', double: 'double !', turkey: 'turkey !', spare: 'spare !', split: 'split !', gouttiere: 'gouttière !', rate: 'raté !' };
const SOUS_BONY = { strike: 'les 10 quilles d’un coup', double: 'deux strikes d’affilée', turkey: 'trois strikes d’affilée', spare: 'frame bouclée', gouttiere: 'on se reconcentre' };
const MARQUES = ['p1', 'p2'];

/* =====================================================================================
   OUTILS
   ===================================================================================== */
const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const lisse = (t) => { t = borne(t, 0, 1); return t * t * (3 - 2 * t); };
const maintenant = () => performance.now() / 1000;
const RACK = () => emplacements().map(({ n, x, z }) => ({ n, x, z, rot: 0 }));
const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');
const echapper = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Physique dans un Web Worker (repli sur le fil principal si le navigateur le refuse). */
function creerPhysique() {
  const attente = new Map(); let id = 0, worker = null, repli = null;
  const surRepli = async () => {
    if (!repli) repli = (async () => {
      const { default: RAPIER } = await import('@dimforge/rapier3d-deterministic-compat');
      await PH.initPhysique(RAPIER); return PH;
    })();
    return repli;
  };
  let pret;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    pret = new Promise((ok, ko) => {
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'pret') ok(m);
        else if (m.type === 'resultat') { const a = attente.get(m.id); if (a) { attente.delete(m.id); a.ok(m); } }
        else if (m.type === 'erreur') { const a = attente.get(m.id); if (a) { attente.delete(m.id); a.ko(new Error(m.message)); } else ko(new Error(m.message)); }
      };
      worker.onerror = (e) => { e.preventDefault?.(); try { worker.terminate(); } catch { /* rien */ } worker = null; ko(new Error(e.message || 'Worker indisponible')); };
    }).catch(async (e) => { console.warn('[bowling] physique sur le fil principal :', e.message); worker = null; await surRepli(); return { ms: 0, msChauffe: 0, repli: true }; });
    worker.postMessage({ type: 'init' });
  } catch (e) {
    pret = surRepli().then(() => ({ ms: 0, msChauffe: 0, repli: true }));
  }
  return {
    pret,
    simuler(debout, lancer) {
      if (worker) return new Promise((ok, ko) => { const k = ++id; attente.set(k, { ok, ko }); worker.postMessage({ type: 'simuler', id: k, debout, lancer }); });
      return surRepli().then((P) => { const t0 = performance.now(); const res = P.simuler(debout, lancer); return { res, ms: Math.round(performance.now() - t0) }; });
    },
    detruire() { if (worker) { worker.terminate(); worker = null; } for (const a of attente.values()) a.ko(new Error('fermé')); attente.clear(); },
  };
}

/* =====================================================================================
   MONTAGE
   io = { mode: 'solo' | 'duel', theme, frames, moi: 'p1' | 'p2', noms: [n1, n2],
          jouer(lancer) → Promise<{ error? }>, quitter(), erreur(msg) }
   Retour : { maj({ board, tour, fini, gagnant }), detruire() }
   ===================================================================================== */
export async function monterBowling(racine, io) {
  const $ = (s) => racine.querySelector(s), $$ = (s) => [...racine.querySelectorAll(s)];
  const duel = io.mode === 'duel';
  let detruit = false, raf = 0;
  const minuteurs = new Set();
  const plusTard = (f, ms) => { const t = setTimeout(() => { minuteurs.delete(t); if (!detruit) f(); }, ms); minuteurs.add(t); return t; };
  const annulerMinuteur = (t) => { clearTimeout(t); minuteurs.delete(t); };
  const ecouteurs = [];
  const ecouter = (cible, type, f, o) => { cible.addEventListener(type, f, o); ecouteurs.push(() => cible.removeEventListener(type, f, o)); };

  /* ---------------------------------------------------------------- CHARGEMENT */
  const ch = { barre: $('#chBarre'), etape: $('#chEtape'), pas: 0 };
  const etapeChargement = (txt, fin = false) => { ch.pas++; ch.barre.style.width = (fin ? 100 : Math.min(90, ch.pas * 35)) + '%'; ch.etape.textContent = txt; };
  const canvas = $('#scene');
  const physique = creerPhysique();
  etapeChargement('Montage de la salle et des personnages…');
  const R = await creerRendu(canvas, { theme: io.theme === 'cgt' ? 'cgt' : 'bony' });
  if (detruit) { R.detruire(); physique.detruire(); return null; }
  etapeChargement('Moteur physique : chargement de Rapier et lancer de préchauffage…');
  let infoPhysique;
  try { infoPhysique = await physique.pret; }
  catch (e) { $('#chErreur').textContent = 'Physique indisponible : ' + e.message; R.detruire(); physique.detruire(); throw e; }
  const S = creerSon(); // l'AudioContext ne naît qu'au premier clic sur « Son » (le navigateur l'exige)
  const ajuster = () => R.redimensionner(canvas.clientWidth || 1, canvas.clientHeight || 1);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(ajuster) : null;
  ro?.observe(canvas); ajuster();

  /* ---------------------------------------------------------------- ÉTAT DE LA PARTIE */
  const cfg = { theme: io.theme === 'cgt' ? 'cgt' : 'bony', joueurs: duel ? 2 : 1, frames: io.frames === 5 ? 5 : 10, son: false };
  const partie = { joueurs: [], courant: 0, debout: RACK(), fini: false, gagnant: undefined };
  const etat = {
    phase: 'visee', g: 0, gv: 0, geste: null, lancer: null, sim: null, idSim: 0, lect: null, minuteur: 0, touches: {},
    enAttente: null, stats: { images: 0, cumul: 0, pire: 0, durees: [], simMs: [] },
    // DUEL : plateau du serveur pour le lancer en cours d'animation (null tant qu'il n'est pas arrivé), dernier
    // plateau reçu, numéro du dernier lancer vu, lancer refusé par le serveur.
    serveur: null, dernierPlateau: null, vuN: -1, refus: null, mien: false,
  };
  const nomDe = (i) => (duel ? io.noms[i] : NOMS[cfg.theme][i]);
  const moiIdx = MARQUES.indexOf(io.moi);
  const aMoi = () => !duel || (partie.courant === moiIdx && !partie.fini);

  function nouvellePartie() {
    partie.joueurs = Array.from({ length: cfg.joueurs }, (_, i) => ({ i, lancers: [], x: 0.12, angle: -0.006, serie: 0 }));
    partie.courant = 0; partie.fini = false; partie.debout = RACK();
    etat.idSim++; etat.sim = null; etat.lect = null; etat.geste = null;
    $('#fin').classList.remove('vu');
    cacherAnnonce(true); cacherRetour();
    R.poserQuilles(partie.debout);
    preparerVisee(true);
    majHUD();
  }

  /* ---------------------------------------------------------------- DUEL : plateau du serveur */
  /** Recopie le plateau du serveur dans la partie (hors animation) : il fait foi. */
  function synchroniser(ctx) {
    const b = ctx.board;
    for (let i = 0; i < 2; i++) {
      const j = partie.joueurs[i] || (partie.joueurs[i] = { i, lancers: [], x: 0.12, angle: -0.006, serie: 0 });
      j.lancers = (b.lancers?.[MARQUES[i]] || []).slice();
    }
    partie.debout = (b.debout || RACK()).map(({ n, x, z, rot }) => ({ n, x, z, rot }));
    partie.fini = !!ctx.fini; partie.gagnant = ctx.gagnant;
    partie.courant = ctx.tour ? MARQUES.indexOf(ctx.tour) : partie.courant;
    etat.vuN = b.n || 0;
    R.poserQuilles(partie.debout);
    if (partie.fini) finDePartie();
    else if (aMoi()) preparerVisee();
    else attendreAdversaire();
    majHUD();
  }
  function attendreAdversaire() {
    etat.phase = 'attente'; etat.g = 0; etat.gv = 0;
    const j = joueur();
    R.joueur.placer(j.x, j.angle); R.boule.enMain(true); R.joueur.elan('attente', 0);
    R.camera('visee');
    racine.classList.remove('visee', 'geste');
    majAide();
  }
  /** Rejoue chez nous le lancer de l'adversaire (`board.dernier`) : même moteur, mêmes entrées, même résultat. */
  function rejouer(ctx) {
    const b = ctx.board, d = b.dernier, ij = MARQUES.indexOf(d.joueur), j = partie.joueurs[ij];
    j.lancers = (b.lancers[d.joueur] || []).slice(0, -1);
    partie.courant = ij; partie.debout = d.debout.map(({ n, x, z, rot }) => ({ n, x, z, rot }));
    R.poserQuilles(partie.debout);
    j.x = d.lancer.position; j.angle = borne(d.lancer.angle, -0.08, 0.08);
    R.joueur.placer(j.x, j.angle); R.boule.enMain(true); R.camera('visee');
    racine.classList.remove('visee', 'geste');
    majHUD();
    const n = borne((d.lancer.vitesse - GESTE.vitesseMin) / (GESTE.vitesseMax - GESTE.vitesseMin), 0, 1);
    etat.lancer = d.lancer; etat.mesure = { n, rejoue: true, ecart: 0, timing: d.lancer.lacher >= 0.999 ? 'parfait' : 'raté' };
    etat.serveur = ctx; etat.mien = false; etat.refus = null;
    etat.phase = 'lacher'; etat.g = 0; etat.gv = 0; etat.vLacher = 2.6 + 4.5 * n; etat.sim = null;
    lancerSimulation(d.debout, d.lancer, d);
    majAide();
  }
  /** Appelée à chaque nouvelle vue de la partie (props React). Idempotente. */
  function maj(ctx) {
    if (!duel || detruit || !ctx?.board) return;
    etat.dernierPlateau = ctx;
    const b = ctx.board, n = b.n || 0;
    const anime = etat.phase !== 'visee' && etat.phase !== 'attente' && etat.phase !== 'fin' && etat.phase !== 'annule';
    if (etat.vuN < 0) { synchroniser(ctx); return; }                       // première vue : on se cale, sans animation
    if (anime) {
      // Le lancer en cours d'animation : son plateau d'arrivée (le mien, ou celui de l'adversaire déjà connu).
      if (etat.mien && n === etat.vuN + 1 && b.dernier?.joueur === io.moi) { etat.serveur = ctx; controler(ctx); }
      else if (n === etat.vuN + 1 || n === etat.vuN) { if (etat.serveur && (etat.serveur.board.n || 0) === n) etat.serveur = ctx; }
      return;                                                                // le reste sera appliqué à la fin de l'animation
    }
    if (n === etat.vuN + 1 && b.dernier && b.dernier.joueur !== io.moi) { rejouer(ctx); return; }
    if (n !== etat.vuN || !!ctx.fini !== partie.fini || (ctx.tour && MARQUES.indexOf(ctx.tour) !== partie.courant)) synchroniser(ctx);
  }
  /** Mon lancer : le résultat local doit être celui du serveur (déterminisme). Sinon, le serveur fait foi. */
  function controler(ctx) {
    const d = ctx.board.dernier, s = etat.sim;
    if (!d || !s) return;
    const restent = s.restent.map((q) => q.n).sort((a, b) => a - b).join(','), serveur = d.restent.slice().sort((a, b) => a - b).join(',');
    if (s.tombees !== d.tombees || restent !== serveur) {
      console.warn('[bowling] résultat local ≠ serveur', { local: { tombees: s.tombees, restent }, serveur: { tombees: d.tombees, restent: serveur } });
      io.erreur('Résultat recalé sur celui du serveur.');
    }
  }

  /* ---------------------------------------------------------------- VISÉE */
  const joueur = () => partie.joueurs[partie.courant];
  function preparerVisee(immediat = false) {
    etat.phase = 'visee'; etat.g = 0; etat.gv = 0;
    const j = joueur();
    R.joueur.placer(j.x, j.angle); R.boule.enMain(true);
    R.camera('visee', { immediat });
    racine.classList.add('visee'); racine.classList.remove('geste');
    majVisee(); majAide();
    if (etat.enAttente) { const f = etat.enAttente; etat.enAttente = null; f(); }
  }
  function placer(dx, dAngle) {
    const j = joueur();
    j.x = borne(j.x + dx, -0.45, 0.45); j.angle = borne(j.angle + dAngle, -0.08, 0.08);
    R.joueur.placer(j.x, j.angle); majVisee();
  }
  function majVisee() {
    const j = joueur(); if (!j) return;
    const planche = Math.round(borne((DIMENSIONS.demi - j.x) / (2 * DIMENSIONS.demi) * 39 + 0.5, 1, 39));
    const deg = j.angle * 180 / Math.PI, sens = Math.abs(deg) < 0.05 ? 'droit devant' : (deg > 0 ? 'vers la droite ' : 'vers la gauche ') + fmt(Math.abs(deg)) + '°';
    $('#lectureVisee').innerHTML = `planche <b>${planche}</b><br>${sens}`;
  }

  /* ---------------------------------------------------------------- LE GESTE (inchangé) */
  // Unité d'écran : celle du VIEWPORT du navigateur, comme le prototype plein écran — le même mouvement de souris
  // donne le même lancer, quelle que soit la taille de la fenêtre Gearbox.
  const unite = () => Math.max(240, Math.min(innerHeight, innerWidth * 0.75));
  const elanDe = (g) => (g < 2 ? ['approche', g / 2] : g < 3 ? ['arriere', g - 2] : g < 4 ? ['avant', g - 3] : ['suivi', Math.min(1, g - 4)]);
  function poserElan() { const [ph, t] = elanDe(etat.g); R.joueur.elan(ph, t); }
  function vitesseAvant(ech, k, w, tMin = -Infinity) {
    const b = ech[k]; let j = k;
    while (j > 0 && b.t - ech[j - 1].t <= w && ech[j - 1].t >= tMin) j--;
    const a = ech[j], dt = b.t - a.t;
    return dt > 0.008 ? -(b.y - a.y) / dt / unite() : 0;
  }
  let derniereSaisie = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
  ecouter(canvas, 'pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    try { racine.focus({ preventScroll: true }); } catch { /* rien */ }
    if (etat.phase === 'fete' || etat.phase === 'machine') { accelerer(); return; }
    if (etat.phase !== 'visee' || !aMoi()) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* rien */ }
    const t = maintenant(), j = joueur();
    etat.geste = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, mode: 'indecis', ech: [{ t, x: e.clientX, y: e.clientY }],
      dyMax: 0, tirage: 0, pousse: false, p: 0, vPic: 0, tFort: t, gHaut: 0, xDepart: j.x };
    derniereSaisie = e.pointerType;
    majAide();
  });
  ecouter(canvas, 'pointermove', (e) => {
    const G = etat.geste;
    if (!G || e.pointerId !== G.id || etat.phase !== 'visee' && etat.phase !== 'geste') return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) echantillon(G, ev.clientX, ev.clientY, ev.timeStamp ? ev.timeStamp / 1000 : maintenant());
  });
  function echantillon(G, x, y, t) {
    if (t <= G.ech[G.ech.length - 1].t) t = G.ech[G.ech.length - 1].t + 0.001;
    G.ech.push({ t, x, y }); if (G.ech.length > 240) G.ech.splice(0, 60);
    const dx = x - G.x0, dy = y - G.y0, U = unite();
    if (G.mode === 'indecis') {
      if (Math.abs(dx) > GESTE.seuilPlacement && Math.abs(dx) > 1.6 * Math.abs(dy)) G.mode = 'placement';
      else if (dy > GESTE.seuilTir) { G.mode = 'tir'; etat.phase = 'geste'; racine.classList.add('geste'); racine.classList.remove('visee'); R.boule.enMain(true); majAide(); }
    }
    if (G.mode === 'placement') {
      const j = joueur(); j.x = borne(G.xDepart + dx / U * GESTE.place.sensibilite, -0.45, 0.45);
      R.joueur.placer(j.x, j.angle); majVisee(); return;
    }
    if (G.mode !== 'tir') return;
    const D = GESTE.tirage * U;
    if (dy >= G.dyMax) { G.dyMax = dy; G.tHaut = t; G.pousse = false; }
    G.tirage = Math.max(G.tirage, borne(G.dyMax / D, 0, 1));
    if (!G.pousse && G.dyMax > 0.12 * D && dy < G.dyMax - 0.05 * D) { G.pousse = true; G.gHaut = etat.g; G.tPousse = t; }
    if (G.pousse) {
      G.p = borne((G.dyMax - dy) / (G.dyMax + GESTE.depassement * U), 0, 1.15);
      const k = G.ech.length - 1, ev = G.type === 'touch' ? GESTE.toucher : 1;
      const v60 = vitesseAvant(G.ech, k, 0.06, G.tHaut) * ev, v40 = vitesseAvant(G.ech, k, 0.04, G.tHaut) * ev;
      if (v60 > G.vPic) G.vPic = v60;
      if (v40 >= 0.35 * G.vPic && G.vPic > 0.2) G.tFort = t;
      if (dy > G.dyMax - 0.05 * D && G.p < 0.02) { G.pousse = false; G.vPic = 0; }
    }
  }
  function cibleElan(G) {
    if (!G || G.mode !== 'tir') return 0;
    if (!G.pousse) return 3 * Math.pow(borne(G.ech.length ? (G.ech[G.ech.length - 1].y - G.y0) / (GESTE.tirage * unite()) : 0, 0, 1), 0.92);
    return G.gHaut + (4.1 - G.gHaut) * Math.min(1, G.p);
  }
  function ressortElan(dt, cible) {
    const k = GESTE.ressort, c = 2 * Math.sqrt(k) * GESTE.amorti, n = Math.ceil(dt / 0.008), h = dt / n;
    for (let i = 0; i < n; i++) { etat.gv += (k * (cible - etat.g) - c * etat.gv) * h; etat.g += etat.gv * h; }
    etat.g = borne(etat.g, 0, 4.6);
  }

  const relacher = (e) => {
    const G = etat.geste;
    if (!G || (e && e.pointerId !== G.id)) return;
    etat.geste = null;
    if (G.mode !== 'tir') { if (etat.phase === 'geste') annulerGeste(); return; }
    const t = e && e.timeStamp ? e.timeStamp / 1000 : maintenant();
    if (e && G.pousse) echantillon(G, e.clientX, e.clientY, t);
    if (!G.pousse || G.vPic < GESTE.annuler.vMin || G.tirage < GESTE.annuler.tirageMin) {
      annulerGeste(!G.pousse ? 'Pousse vers l’avant avant de relâcher' : G.tirage < GESTE.annuler.tirageMin ? 'Tire davantage vers toi pour prendre de l’élan' : 'Pousse plus franchement');
      return;
    }
    const n = borne((G.vPic - GESTE.vMin) / (GESTE.vMax - GESTE.vMin), 0, 1), d = n - 0.5;
    let vitesse = GESTE.vitesseMin + (GESTE.vitesseMax - GESTE.vitesseMin) * (0.5 + 0.55 * d + 1.8 * d * d * d);
    vitesse *= lerp(0.85, 1, borne(G.tirage / GESTE.brideTirage, 0, 1));
    vitesse = borne(vitesse, GESTE.vitesseMin, GESTE.vitesseMax);
    const fin = Math.min(t, G.tFort + 0.03), ech = G.ech;
    let kb = ech.length - 1; while (kb > 0 && ech[kb].t > fin) kb--;
    let kh = kb; while (kh > 0 && ech[kh - 1].t >= G.tHaut) kh--;
    const course = Math.max(1, ech[kh].y - ech[kb].y);
    const point = (f) => { let k = kh; while (k < kb && ech[kh].y - ech[k + 1].y < f * course) k++; const a = ech[k], b = ech[Math.min(kb, k + 1)];
      const fa = (ech[kh].y - a.y) / course, fb = (ech[kh].y - b.y) / course, u = fb > fa ? borne((f - fa) / (fb - fa), 0, 1) : 0; return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }; };
    const deg = (dx, dy) => Math.atan2(dx, Math.max(1, -dy)) * 180 / Math.PI;
    const p0 = point(0), pc = point(GESTE.effet.corps), pt = point(GESTE.effet.trait), p1 = point(1);
    const angleTrait = deg(p1.x - pt.x, p1.y - pt.y);
    const angleDebut = deg(pc.x - p0.x, pc.y - p0.y);
    const dirPoussee = angleDebut;
    const Pr = GESTE.precision, exces = borne((n - Pr.debut) / (1 - Pr.debut), 0, 1);
    const ampli = lerp(1, Pr.ampliMax, exces), poignet = lerp(1, Pr.effetMin, exces);
    const E = GESTE.effet, tourne = angleTrait - angleDebut;
    const ampl = Math.pow(borne((Math.abs(tourne) - E.zoneMorte) / (E.plein - E.zoneMorte), 0, 1), E.expo);
    const effet = -Math.sign(tourne) * ampl * poignet;
    const Dr = GESTE.direction, dirUtile = Math.sign(dirPoussee) * Math.max(0, Math.abs(dirPoussee) - Dr.zoneMorte);
    const devDirection = dirUtile * Dr.gain * ampli;
    const L = GESTE.lacher, retard = t - G.tFort;
    let lacher = 1, timing = 'parfait', devTiming = 0;
    if (G.p < L.tot) { const e2 = 1 - G.p / L.tot; lacher = lerp(1, L.min + 0.1, e2); devTiming = -L.devMax * e2; timing = 'tôt'; }
    else if (retard > L.tard) { const e2 = borne((retard - L.tard) / (L.tardPlein - L.tard), 0, 1); lacher = lerp(1, L.min, e2); devTiming = L.devMax * e2; timing = 'tard'; }
    const j = joueur(), angle = borne(j.angle + devDirection + devTiming, -0.08, 0.08);
    // `+ 0` : jamais de « -0 » (le JSON le perd ; le serveur recevrait 0 et pourrait simuler autre chose au bit près)
    etat.lancer = { position: j.x + 0, angle: Math.round(angle * 100000) / 100000 + 0, vitesse: Math.round(vitesse * 1000) / 1000, effet: Math.round(effet * 1000) / 1000 + 0, lacher: Math.round(lacher * 1000) / 1000 };
    etat.mesure = { n, vPic: G.vPic, tirage: G.tirage, angleTrait, dirPoussee, tourne, timing, p: G.p, retard, devDirection, devTiming, vise: j.angle, ecart: etat.lancer.angle - j.angle };
    etat.phase = 'lacher'; etat.vLacher = 2.6 + 4.5 * n; etat.sim = null;
    racine.classList.remove('geste');
    const debout = partie.debout.map(({ n: nn, x, z, rot }) => ({ n: nn, x, z, rot }));
    if (duel) {
      // Le serveur rejoue CE lancer sur SES quilles (les mêmes que `partie.debout`, recopiées de son plateau).
      etat.serveur = null; etat.refus = null; etat.mien = true;
      const id = etat.idSim + 1;
      io.jouer(etat.lancer).then((r) => {
        if (detruit || id !== etat.idSim) return;
        if (r?.error) { etat.refus = r.error; abandonnerLancer(r.error); }
      }, (err) => { if (!detruit && id === etat.idSim) abandonnerLancer(err?.message || 'Lancer refusé.'); });
    }
    lancerSimulation(debout, etat.lancer);
    majAide();
  };
  function lancerSimulation(debout, lancer, attendu = null) {
    const id = ++etat.idSim;
    physique.simuler(debout, lancer).then((m) => {
      if (detruit || id !== etat.idSim) return;
      etat.sim = m.res; etat.stats.simMs.push(m.ms);
      if (attendu && (m.res.tombees !== attendu.tombees)) console.warn('[bowling] lancer rejoué : résultat local ≠ serveur', { local: m.res.tombees, serveur: attendu.tombees });
      if (etat.serveur && etat.mien) controler(etat.serveur);
    }).catch((err) => { if (detruit) return; console.error('[bowling] simulation', err); if (id === etat.idSim) annulerGeste('La simulation a échoué, rejoue le lancer'); });
  }
  ecouter(canvas, 'pointerup', relacher);
  ecouter(canvas, 'pointercancel', (e) => { const G = etat.geste; if (G && e.pointerId === G.id) { etat.geste = null; if (etat.phase === 'geste') annulerGeste(); } });

  function annulerGeste(msg) {
    etat.geste = null; etat.idSim++; etat.phase = 'annule';
    racine.classList.remove('geste');
    if (msg) montrerAide(msg);
  }
  /** DUEL : le serveur a refusé le lancer (pas votre tour, partie terminée…) → on revient à l'état du serveur. */
  function abandonnerLancer(msg) {
    io.erreur(msg);
    etat.idSim++; etat.lect = null; etat.serveur = null; etat.mien = false;
    cacherRetour(); cacherAnnonce(true);
    R.poserQuilles(partie.debout); R.boule.enMain(true);
    if (etat.dernierPlateau) { etat.phase = 'annule'; synchroniser(etat.dernierPlateau); }
    else annulerGeste(msg);
  }

  /* ---------------------------------------------------------------- LÂCHER ET LECTURE (inchangés) */
  const TAMPON = { boule: new Array(7).fill(0), quilles: Array.from({ length: 10 }, () => new Array(7).fill(0)) };
  function interp(out, a, b, u) {
    for (let k = 0; k < 3; k++) out[k] = a[k] + (b[k] - a[k]) * u;
    const s = a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6] < 0 ? -1 : 1;
    let n = 0;
    for (let k = 3; k < 7; k++) { out[k] = a[k] + (s * b[k] - a[k]) * u; n += out[k] * out[k]; }
    n = Math.sqrt(n) || 1; for (let k = 3; k < 7; k++) out[k] /= n;
  }
  function imageA(res, t) {
    const im = res.images, f = borne(t * 60, 0, im.length - 1), i = Math.floor(f), j = Math.min(im.length - 1, i + 1), u = f - i;
    const a = im[i], b = im[j];
    interp(TAMPON.boule, a.boule, b.boule, u);
    const nq = a.quilles.length; TAMPON.quilles.length = nq;
    for (let k = 0; k < nq; k++) { if (!TAMPON.quilles[k]) TAMPON.quilles[k] = new Array(7).fill(0); interp(TAMPON.quilles[k], a.quilles[k], b.quilles[k], u); }
    return TAMPON;
  }
  function lacherBoule() {
    const res = etat.sim, L = etat.lancer, M = etat.mesure;
    let tFin = res.duree;
    if (res.impactT != null) tFin = Math.min(res.duree, res.impactT + LECTURE.fin);
    else { const k = res.images.findIndex((im) => im.boule[2] > DIMENSIONS.fosse + 0.1 || im.boule[1] < -0.15); if (k >= 0) tFin = Math.min(res.duree, res.images[k].t + 0.6); }
    etat.lect = { res, t: 0, tPrec: -1, vit: 1, iContact: 0, tFin, verdict: false, camQuilles: false, tReel: 0, debout: partie.debout, eclats: 0 };
    etat.phase = 'roule';
    R.boule.enMain(false);
    R.lecture(res.images, res.impactT);
    R.camera('suivi');
    S.lacher(borne(0.22 + 0.62 * (1 - L.lacher) + 0.16 * M.n, 0, 1));
    montrerRetour(L, M);
    majAide();
  }
  function facteurLecture(lect, t) {
    const ti = lect.res.impactT; if (ti == null) return 1;
    const a = ti - LECTURE.avantImpact, b = ti + LECTURE.apresImpact, r = LECTURE.rampe, s = LECTURE.ralenti;
    if (t < a - r) return 1;
    if (t < a) return lerp(1, s, lisse((t - (a - r)) / r));
    if (t < b) return s;
    if (t < b + 2 * r) return lerp(s, 1, lisse((t - b) / (2 * r)));
    return 1;
  }
  function lire(dt) {
    const L = etat.lect, res = L.res;
    L.vit = facteurLecture(L, L.t);
    const tAvant = L.t;
    L.t = Math.min(L.tFin, L.t + dt * L.vit);
    L.tReel += dt;
    const img = imageA(res, L.t);
    R.image(img, dt);
    R.joueur.elan('suivi', Math.min(1, L.tReel / 0.9));
    const ro2 = res.roulement[Math.min(res.roulement.length - 1, Math.round(L.t * 60))];
    if (ro2) S.roulement({ vitesse: ro2.vitesse * (0.45 + 0.55 * L.vit), glisse: ro2.glisse, zone: ro2.zone, z: img.boule[2], x: img.boule[0] });
    let secousse = 0; const eclats = [];
    const cs = res.contacts;
    while (L.iContact < cs.length && cs[L.iContact].t <= L.t) {
      const c = cs[L.iContact++];
      if (c.t <= tAvant && tAvant > 0) continue;
      if (c.type === 'boule-piste' && c.t < 0.3) continue;
      S.contact({ ...c, t: c.t / Math.max(0.2, L.vit) });
      const lg = Math.log10(Math.max(1, c.force));
      if (c.type === 'boule-quille') { secousse = Math.max(secousse, borne((lg - 2.2) * 1.0, 0.15, 2.2)); if (c.force > 300) eclats.push(c); }
      else if (c.type === 'quille-quille') secousse = Math.max(secousse, borne((lg - 2.8) * 0.4, 0, 0.45));
      else if (c.type === 'quille-mur' || c.type === 'quille-fosse') secousse = Math.max(secousse, borne((lg - 2.7) * 0.3, 0, 0.35));
      else if (c.type === 'boule-fosse') secousse = Math.max(secousse, borne((lg - 2.6) * 0.6, 0, 0.8));
      else if (c.type === 'boule-gouttiere') secousse = Math.max(secousse, borne((lg - 2.4) * 0.4, 0, 0.4));
      else if (c.type === 'boule-piste') secousse = Math.max(secousse, borne((lg - 2.4) * 0.5, 0, 0.6));
    }
    if (secousse > 0.08) R.effet('secousse', { force: secousse });
    if (eclats.length && L.eclats < 3) { const c = eclats.sort((a, b) => b.force - a.force)[0]; L.eclats++; R.effet('eclats', { x: c.x, y: c.y, z: c.z, force: c.force }); }
    if (!L.camQuilles && ((res.impactT != null && L.t >= res.impactT - 0.42) || img.boule[2] > 14.2)) { L.camQuilles = true; R.camera('quilles'); }
    const ti = res.impactT;
    if (!L.verdict && ti != null && L.t >= ti + LECTURE.verdict) verdict(L, true);
    if (L.t >= L.tFin) { if (!L.verdict) verdict(L, false); finLecture(L); }
  }

  /* ---------------------------------------------------------------- VERDICT, CÉLÉBRATION, MACHINE */
  function verdict(L) {
    const res = L.res, j = joueur(), avant = position(j.lancers, cfg.frames);
    const tombees = res.tombees, reste = res.restent.length;
    let type;
    if (avant.rack && tombees === 10) type = 'strike';
    else if (!avant.rack && reste === 0) type = 'spare';
    else if (tombees === 0) type = res.gouttiere ? 'gouttiere' : 'rate';
    else if (avant.rack) type = tombees >= 6 ? 'bon' : 'rate';
    else type = reste <= 2 ? 'bon' : 'rate';
    j.serie = type === 'strike' ? j.serie + 1 : 0;
    const turkey = type === 'strike' && j.serie >= 3;
    const restent = res.restent.map((q) => q.n).sort((a, b) => a - b);
    const cle = type === 'strike' ? (j.serie >= 3 ? 'turkey' : j.serie === 2 ? 'double' : 'strike')
      : avant.rack && estSplit(restent) ? 'split' : type;
    L.verdict = { type, cle, turkey, tombees, avant };
    if (type === 'strike' || type === 'spare') { R.effet(type); }
    S.resultat(turkey ? 'turkey' : type);
    annoncer(cle, tombees, restent, avant);
    majSchema(res.restent.map((q) => q.n), L.debout.map((q) => q.n));
  }
  function finLecture(L) {
    const j = joueur(), vd = L.verdict;
    j.lancers.push(vd.tombees);
    etat.phase = 'fete'; etat.minuteur = vd.type === 'strike' ? LECTURE.feteStrike : LECTURE.fete;
    R.camera('celebration');
    R.joueur.reaction(vd.type);
    if (vd.type === 'bon' && vd.tombees >= 8) R.effet('confettis', { n: 50 });
    majHUD();
    majAide();
  }
  function accelerer() { if (etat.phase === 'fete') etat.minuteur = Math.min(etat.minuteur, 0.15); else if (etat.phase === 'machine') etat.machine.vite = true; }
  function suite() {
    const L = etat.lect;
    if (duel) {
      // Le plateau du SERVEUR décide : prochain joueur, quilles debout (positions comprises), fin de partie.
      const ctx = etat.serveur, b = ctx.board;
      const prochain = ctx.fini ? -1 : MARQUES.indexOf(ctx.tour);
      const rack = prochain < 0 || position(b.lancers[MARQUES[prochain]] || [], cfg.frames).rack;
      const nouvelles = (b.debout || RACK()).map(({ n, x, z, rot }) => ({ n, x, z, rot }));
      demarrerMachine(L, rack ? RACK() : nouvelles, rack, prochain);
      return;
    }
    const j = joueur(), avant = L.verdict.avant, apres = position(j.lancers, cfg.frames);
    const changeJoueur = apres.fini || apres.frame !== avant.frame;
    let prochain = partie.courant;
    if (changeJoueur) {
      prochain = -1;
      for (let k = 1; k <= partie.joueurs.length; k++) {
        const c = (partie.courant + k) % partie.joueurs.length;
        if (!position(partie.joueurs[c].lancers, cfg.frames).fini) { prochain = c; break; }
      }
    }
    const pos = prochain >= 0 ? position(partie.joueurs[prochain].lancers, cfg.frames) : null;
    const rack = !pos || pos.rack;
    const nouvelles = rack ? RACK() : L.res.restent.map((q) => ({ n: q.n, x: q.x, z: q.z, rot: q.rot }));
    demarrerMachine(L, nouvelles, rack, prochain);
  }
  function demarrerMachine(L, nouvelles, rack, prochain) {
    const res = L.res, der = res.images[res.images.length - 1];
    const gardees = new Set(rack ? [] : nouvelles.map((q) => q.n));
    etat.machine = { t: 0, vite: false, depart: der.quilles.map((q) => q.slice()), ordre: L.debout.map((q) => q.n), gardees, nouvelles, prochain, pose: false };
    etat.phase = 'machine';
    R.camera('quilles');
    S.machine();
    majSchema(rack ? [] : nouvelles.map((q) => q.n), L.debout.map((q) => q.n), true);
  }
  function animerMachine(dt) {
    const M = etat.machine; M.t += dt * (M.vite ? 3 : 1);
    const t = M.t, levee = 0.55;
    if (t < 1.75) {
      const monte = lisse(t / 0.35), balai = lisse((t - 0.35) / 0.75);
      const quilles = M.depart.map((q, i) => {
        const o = q.slice();
        if (M.gardees.has(M.ordre[i])) { o[1] = q[1] + levee * monte; return o; }
        o[2] = q[2] + 2.0 * balai; o[1] = q[1] - 0.6 * borne((o[2] - DIMENSIONS.fosse) / 0.35, 0, 1);
        if (balai >= 1) o[1] = -5;
        return o;
      });
      R.image({ quilles }, dt);
    } else {
      if (!M.pose) { M.pose = true; R.poserQuilles(M.nouvelles); }
      const descend = 1 - lisse((t - 1.85) / 0.45), haut = M.gardees.size ? levee : 0.85;
      const quilles = M.nouvelles.map((q) => { const r = q.rot || 0; return [q.x, haut * descend, q.z, 0, Math.sin(r / 2), 0, Math.cos(r / 2)]; });
      R.image({ quilles }, dt);
    }
    if (t >= LECTURE.machine) {
      if (duel) {
        // Fin de l'animation : on se cale sur le DERNIER plateau reçu (il peut déjà contenir le lancer suivant de
        // l'adversaire, qui sera alors rejoué à son tour).
        const ctx = etat.serveur; etat.serveur = null; etat.lect = null; etat.mien = false;
        etat.phase = 'annule';
        synchroniser(ctx);
        const der = etat.dernierPlateau;
        if (der && der !== ctx) maj(der);
        return;
      }
      partie.debout = M.nouvelles; R.poserQuilles(partie.debout);
      if (M.prochain < 0) { finDePartie(); return; }
      partie.courant = M.prochain;
      preparerVisee();
      majHUD();
    }
  }
  function finDePartie() {
    partie.fini = true; etat.phase = 'fin';
    racine.classList.remove('visee', 'geste');
    R.camera('celebration'); R.joueur.reaction('strike');
    const th = cfg.theme, scores = partie.joueurs.map((j) => tableau(j.lancers, cfg.frames).total);
    const max = Math.max(...scores);
    let gagnants = scores.map((s, i) => (s === max ? i : -1)).filter((i) => i >= 0);
    // En duel, le vainqueur est celui du SERVEUR (un abandon peut désigner l'autre, quel que soit le score).
    if (duel && partie.gagnant && partie.gagnant !== 'draw') gagnants = [MARQUES.indexOf(partie.gagnant)];
    if (duel && partie.gagnant === 'draw') gagnants = [0, 1];
    let phrase;
    if (scores.length === 1) phrase = th === 'cgt' ? `Bilan de la lutte : ${max} points` : `Score final : ${max}`;
    else if (gagnants.length > 1) phrase = th === 'cgt' ? 'Égalité : la solidarité l’emporte' : 'Égalité parfaite !';
    else phrase = th === 'cgt' ? `${nomDe(gagnants[0])} mène le cortège !` : `${nomDe(gagnants[0])} remporte la partie !`;
    // Partie close alors que tout le monde n'a pas fini ses frames : c'est un abandon.
    if (duel && !partie.joueurs.every((j) => position(j.lancers, cfg.frames).fini)) phrase += ' (abandon)';
    $('#finTitre').textContent = th === 'cgt' ? 'Fin de la manif' : 'partie terminée';
    $('#finVainqueur').textContent = phrase;
    $('#finScores').innerHTML = scores.map((s, i) => `<div class="${scores.length > 1 && gagnants.length === 1 && i === gagnants[0] ? 'gagne' : ''}"><span>${echapper(nomDe(i))}</span><b>${s}</b></div>`).join('');
    $('#finSignature').textContent = th === 'cgt' ? 'On lâche rien !' : 'Bony auto-mobile · Génération auto-mobile';
    $('#fin').classList.add('vu');
    R.effet('confettis', { n: 160 });
    S.resultat(scores.length > 1 || max >= 100 ? 'strike' : 'bon');
    majHUD(); majAide();
  }

  /* ---------------------------------------------------------------- HUD */
  function marques(fr) {
    const l = fr.l, s = [];
    const v = (n) => (n === 10 ? ['X', 'x'] : n === 0 ? ['-', ''] : [String(n), '']);
    if (!fr.derniere) {
      if (fr.strike) return [['', ''], ['X', 'x']];
      if (l.length > 0) s.push(v(l[0])); if (l.length > 1) s.push(l[0] + l[1] === 10 ? ['/', 'sp'] : v(l[1]));
      while (s.length < 2) s.push(['', '']); return s;
    }
    if (l.length > 0) s.push(v(l[0]));
    if (l.length > 1) s.push(l[0] === 10 ? v(l[1]) : l[0] + l[1] === 10 ? ['/', 'sp'] : v(l[1]));
    if (l.length > 2) s.push(l[0] === 10 && l[1] !== 10 ? (l[1] + l[2] === 10 ? ['/', 'sp'] : v(l[2])) : v(l[2]));
    while (s.length < 3) s.push(['', '']);
    return s;
  }
  function majFeuille() {
    $('#feuille').innerHTML = partie.joueurs.map((j, ij) => {
      const tb = tableau(j.lancers, cfg.frames), pos = position(j.lancers, cfg.frames), actif = ij === partie.courant && !partie.fini;
      const cases = tb.frames.map((fr, f) => {
        const m = marques(fr);
        return `<div class="fr${fr.derniere ? ' der' : ''}${actif && pos.frame === f ? ' cour' : ''}"><div class="num">${f + 1}</div><div class="ls">${m.map(([t, c]) => `<span class="${c}">${t}</span>`).join('')}</div><div class="cu">${fr.total ?? ''}</div></div>`;
      }).join('');
      const vous = duel && ij === moiIdx ? ' <small>(vous)</small>' : '';
      return `<div class="ligne${actif ? ' actif' : ''}"><div class="nom"><i></i>${echapper(nomDe(ij))}${vous}</div>${cases}<div class="tot"><small>total</small>${tb.total}</div></div>`;
    }).join('');
  }
  const POS_SCHEMA = { 1: [0, 0], 2: [1, 1], 3: [-1, 1], 4: [2, 2], 5: [0, 2], 6: [-2, 2], 7: [3, 3], 8: [1, 3], 9: [-1, 3], 10: [-3, 3] };
  $('#schema').innerHTML = Object.entries(POS_SCHEMA).map(([n, [c, r]]) => `<circle id="sq${n}" cx="${43 - c * 11.5}" cy="${68 - r * 19}" r="7"></circle>`).join('');
  function majSchema(debout, avant = null, vient = false) {
    const set = new Set(debout);
    for (let n = 1; n <= 10; n++) $('#sq' + n).setAttribute('class', set.has(n) ? (vient ? 'vient' : 'debout') : 'tombee');
    if (vient) plusTard(() => { if (etat.phase !== 'roule') for (const n of set) $('#sq' + n).setAttribute('class', 'debout'); }, 1200);
    const nb = set.size;
    $('#reste').textContent = nb === 0 ? 'toutes les quilles sont tombées' : nb === 1 ? '1 quille debout' : `${nb} quilles debout`;
  }
  function majEtat() {
    const j = joueur();
    if (!j) return;
    const pos = position(j.lancers, cfg.frames);
    let qui;
    if (partie.fini) qui = 'Partie terminée';
    else if (duel) qui = partie.courant === moiIdx ? 'À vous de jouer' : `Au tour de ${nomDe(partie.courant)}`;
    else qui = (cfg.joueurs > 1 ? 'À toi, ' : '') + nomDe(partie.courant);
    $('#qui').textContent = qui;
    if (!partie.fini) {
      const nl = pos.lancer + 1;
      $('#ou').innerHTML = `Frame <b>${Math.min(cfg.frames, pos.frame + 1)}</b> / ${cfg.frames} · ${nl}<sup>${nl === 1 ? 'er' : 'e'}</sup> lancer`;
    } else $('#ou').textContent = '';
  }
  function majHUD() {
    majFeuille(); majEtat();
    if (etat.phase === 'visee' || etat.phase === 'fin' || etat.phase === 'attente') majSchema(partie.debout.map((q) => q.n));
  }
  function majAide() {
    const doigt = derniereSaisie === 'touch' || derniereSaisie === 'pen', a = $('#aide'), p = etat.phase;
    if (p === 'visee') a.innerHTML = doigt
      ? 'Garde le doigt posé, <b>tire vers toi</b>, <b>pousse</b> et lâche · glisse ← → pour te placer'
      : 'Maintiens le clic, <b>tire vers toi</b>, <b>pousse</b> et relâche · glisse ← → pour te placer · molette : viser';
    else if (p === 'geste') a.innerHTML = 'Pousse <b>bien droit</b> (un biais dévie la boule) et relâche en fin de poussée — un coup de poignet final donne l’effet';
    else if (p === 'fete' || p === 'machine') a.innerHTML = duel && etat.mien && !etat.serveur ? 'Validation du lancer par le serveur…' : doigt ? 'Touche l’écran pour passer' : 'Clic pour passer';
    else if (p === 'attente') a.innerHTML = `Au tour de <b>${echapper(nomDe(partie.courant))}</b> — son lancer s’affichera ici`;
    else if (p === 'lacher' || p === 'roule') a.innerHTML = duel && !etat.mien ? `Lancer de <b>${echapper(nomDe(partie.courant))}</b>` : '';
    else if (p === 'fin') a.innerHTML = '';
    else if (p !== 'annule') a.innerHTML = '';
    a.style.opacity = a.innerHTML ? 1 : 0;
  }
  let aideMinuteur = 0;
  function montrerAide(msg) { const a = $('#aide'); a.innerHTML = msg; a.style.opacity = 1; annulerMinuteur(aideMinuteur); aideMinuteur = plusTard(majAide, 2200); }
  let retourMinuteur = 0;
  function montrerRetour(L, M) {
    const kmh = Math.round(L.vitesse * 3.6), e = L.effet, ae = Math.abs(e);
    const force = ae < 0.08 ? 'boule droite' : `${ae < 0.35 ? 'léger' : ae < 0.7 ? 'net' : 'fort'} crochet à ${e > 0 ? 'gauche' : 'droite'}`;
    let lignes;
    if (M.rejoue) lignes = `<span><b>lancer de ${echapper(nomDe(partie.courant))}</b></span><span>${force}</span><div class="barre"><i style="left:${50 - e * 50}%"></i></div><span>${M.timing === 'parfait' ? 'lâcher parfait' : 'lâcher imparfait'}</span>`;
    else {
      const ecDeg = M.ecart * 180 / Math.PI, ecCm = Math.round(Math.abs(M.ecart) * 1814);
      const dir = Math.abs(ecDeg) < 0.05 ? 'pile dans la visée' : `${fmt(Math.abs(ecDeg))}° à ${ecDeg > 0 ? 'droite' : 'gauche'} de la visée (${ecCm} cm à la quille 1)`;
      const lach = M.timing === 'parfait' ? 'lâcher parfait' : M.timing === 'tôt' ? 'lâcher précoce : boule tirée à gauche' : 'lâcher tardif : boule poussée à droite';
      lignes = `<span><b>${dir}</b></span><span>${force}</span><div class="barre"><i style="left:${50 - e * 50}%"></i></div><span>${lach}</span>`;
    }
    $('#retour').innerHTML = `<div class="kmh">${kmh}<small>km/h</small></div><div class="det">${lignes}</div>`;
    $('#retour').classList.add('vu');
    annulerMinuteur(retourMinuteur); retourMinuteur = plusTard(cacherRetour, 3400);
  }
  function cacherRetour() { $('#retour').classList.remove('vu'); }
  const EMPL = Object.fromEntries(emplacements().map((e) => [e.n, e]));
  function estSplit(restent) {
    if (restent.length < 2 || restent.includes(1)) return false;
    const voisines = (a, b) => { const dx = EMPL[a].x - EMPL[b].x, dz = EMPL[a].z - EMPL[b].z, d = Math.hypot(dx, dz); return d < 0.32 || (Math.abs(dx) < 0.01 && d < 0.55); };
    const vu = new Set([restent[0]]), pile = [restent[0]];
    while (pile.length) { const a = pile.pop(); for (const b of restent) if (!vu.has(b) && voisines(a, b)) { vu.add(b); pile.push(b); } }
    return vu.size < restent.length;
  }
  let annonceMinuteur = 0;
  function annoncer(cle, tombees, restent, avant) {
    const th = cfg.theme, reste = restent.length, nb = `${tombees} ${tombees > 1 ? 'quilles' : 'quille'}`;
    let titre, sous;
    if (th === 'cgt') {
      const a = ANNONCES_CGT[cle] || ANNONCES_CGT.bon;
      titre = a.titre || (tombees > 0 ? nb : ANNONCES_CGT.rate.titre);
      sous = a.sous && a.sous.length ? a.sous[Math.floor(Math.random() * a.sous.length)] : '';
    } else {
      titre = TITRES_BONY[cle] || (tombees > 0 ? nb : TITRES_BONY.rate);
      sous = SOUS_BONY[cle] || '';
      if (cle === 'split') sous = 'reste ' + restent.join('-');
      else if (!sous && avant.rack && reste > 0) sous = reste === 1 ? 'reste 1 quille' : `restent ${reste} quilles`;
    }
    const el = $('#annonce'); el.classList.remove('vu', 'part'); void el.offsetWidth;
    el.querySelector('.gros').textContent = titre; el.querySelector('.petit').textContent = sous;
    const fort = ['strike', 'double', 'turkey', 'spare', 'split', 'gouttiere'].includes(cle);
    el.querySelector('.gros').style.fontSize = fort ? '' : 'clamp(30px, 5cqw, 72px)';
    el.classList.add('vu');
    R.annonce(titre, sous, 3.2);
    annulerMinuteur(annonceMinuteur); annonceMinuteur = plusTard(() => cacherAnnonce(), cle === 'strike' || cle === 'turkey' ? 2900 : 2300);
  }
  function cacherAnnonce(net) { const el = $('#annonce'); if (net) { el.classList.remove('vu', 'part'); return; } if (el.classList.contains('vu')) { el.classList.add('part'); plusTard(() => el.classList.remove('vu', 'part'), 380); } }

  /* ---------------------------------------------------------------- RÉGLAGES */
  const ICONE_SON = { off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>', on: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 5.5a9 9 0 0 1 0 13"/></svg>' };
  function majSon() { const b = $('#bSon'); b.innerHTML = (cfg.son ? ICONE_SON.on : ICONE_SON.off) + (cfg.son ? 'Son activé' : 'Son coupé'); b.classList.toggle('actif', cfg.son); b.setAttribute('aria-pressed', cfg.son); }
  $('#bSon').onclick = () => { cfg.son = !cfg.son; S.theme(cfg.theme); S.activer(cfg.son); S.ambiance(cfg.son); majSon(); };
  function appliquerTheme(th) {
    cfg.theme = th; racine.dataset.theme = th; R.setTheme(th); S.theme(th);
    $$('#reglages [data-theme]').forEach((b) => b.classList.toggle('actif', b.dataset.theme === th));
    const cgt = th === 'cgt';
    $('#logo').src = cgt ? URL_LOGO_CGT : URL_LOGO_BLANC; $('#logo').alt = cgt ? 'CGT' : 'Bony auto-mobile';
    $('#marque .titre').textContent = cgt ? 'Piquet de grève' : 'bowling';
    $('#finLogo').src = cgt ? URL_LOGO_CGT : URL_LOGO_COULEUR;
    majHUD();
  }
  $$('#reglages [data-theme]').forEach((b) => (b.onclick = () => appliquerTheme(b.dataset.theme)));
  const quandLibre = (f) => { if (etat.phase === 'visee' || etat.phase === 'fin') f(); else etat.enAttente = f; };
  $$('[data-joueurs]').forEach((b) => (b.onclick = () => { cfg.joueurs = +b.dataset.joueurs; $$('[data-joueurs]').forEach((x) => x.classList.toggle('actif', x === b)); quandLibre(nouvellePartie); }));
  $$('[data-frames]').forEach((b) => (b.onclick = () => { cfg.frames = +b.dataset.frames; $$('[data-frames]').forEach((x) => x.classList.toggle('actif', x === b)); quandLibre(nouvellePartie); }));
  $$('[data-frames]').forEach((x) => x.classList.toggle('actif', +x.dataset.frames === cfg.frames));
  $('#bNouvelle').onclick = () => nouvellePartie();
  $('#bRejouer').onclick = () => (duel ? io.quitter() : nouvellePartie());
  if (duel) { $('#bRejouer').textContent = 'Retour au lobby'; for (const s of ['[data-groupe="theme"]', '[data-groupe="joueurs"]', '[data-groupe="frames"]', '[data-groupe="nouvelle"]']) $(s).hidden = true; }

  for (const b of $$('#pave button')) {
    let rep = 0;
    const pas = () => { if (etat.phase !== 'visee') return; placer((+b.dataset.pas || 0) * 0.027, (+b.dataset.vise || 0) * 0.002); };
    ecouter(b, 'pointerdown', (e) => { e.preventDefault(); pas(); clearInterval(rep); rep = setInterval(pas, 90); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) ecouter(b, ev, () => clearInterval(rep));
    ecouteurs.push(() => clearInterval(rep));
  }
  // clavier : ← → se placer ; Maj + ← → (ou A / E) viser ; Échap annule le geste. Écouté sur la RACINE (la fenêtre
  // du bowling a le focus) et non sur `window` : les autres fenêtres de Gearbox gardent leurs flèches.
  ecouter(racine, 'keydown', (e) => {
    if (e.key === 'Escape' && etat.phase === 'geste') { annulerGeste('Geste annulé'); return; }
    etat.touches[e.key.toLowerCase()] = true; etat.touches.shift = e.shiftKey;
    if (['arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
  });
  ecouter(racine, 'keyup', (e) => { etat.touches[e.key.toLowerCase()] = false; etat.touches.shift = e.shiftKey; });
  ecouter(racine, 'blur', () => { etat.touches = {}; }, true);
  ecouter(canvas, 'wheel', (e) => { if (etat.phase !== 'visee') return; e.preventDefault(); placer(0, Math.sign(e.deltaY) * GESTE.place.molette); }, { passive: false });
  function clavier(dt) {
    const T = etat.touches, g = T.arrowleft ? -1 : T.arrowright ? 1 : 0;
    let dx = 0, da = 0;
    if (g && !T.shift) dx = g * GESTE.place.pas * dt; else if (g) da = g * GESTE.place.angle * dt;
    if (T.a) da -= GESTE.place.angle * dt; if (T.e || T.d) da += GESTE.place.angle * dt;
    if (dx || da) placer(dx, da);
  }

  /* ---------------------------------------------------------------- BOUCLE */
  let avant = performance.now();
  function boucle(ms) {
    if (detruit) return;
    const dtr = (ms - avant) / 1000; avant = ms;
    const dt = borne(dtr, 0, 0.1);
    const st = etat.stats; st.images++; st.cumul += dtr; st.durees.push(dtr * 1000); if (st.durees.length > 600) st.durees.shift();
    switch (etat.phase) {
      case 'visee': clavier(dt); break;
      case 'geste': {
        ressortElan(dt, cibleElan(etat.geste)); poserElan();
        $('#jauge div').style.height = Math.round(borne(etat.g / 4, 0, 1) * 100) + '%';
        break;
      }
      case 'annule': {
        ressortElan(dt, 0); poserElan();
        if (etat.g < 0.03 && Math.abs(etat.gv) < 0.2) { if (aMoi()) preparerVisee(); else attendreAdversaire(); }
        break;
      }
      case 'lacher': {
        if (etat.g < 4) { etat.g = Math.min(4, etat.g + dt * Math.max(etat.vLacher, etat.gv)); etat.gv = 0; }
        else etat.g = Math.min(4.12, etat.g + dt * 0.25);
        poserElan();
        if (etat.g >= 4 && etat.sim) lacherBoule();
        break;
      }
      case 'roule': lire(dt); break;
      case 'fete': {
        etat.minuteur -= dt;
        // En duel, on attend le plateau du serveur (il arrive en ~0,2 s ; la fête dure 2,6 s).
        if (etat.minuteur <= 0 && (!duel || etat.serveur)) suite();
        else if (etat.minuteur <= 0) majAide();
        break;
      }
      case 'machine': animerMachine(dt); break;
      default: break;
    }
    R.rendre(dt);
    raf = requestAnimationFrame(boucle);
  }

  /* ---------------------------------------------------------------- DÉMARRAGE */
  majSon();
  appliquerTheme(cfg.theme);
  nouvellePartie();
  if (duel && io.initial) maj(io.initial);
  etapeChargement('Prêt', true);
  console.info(`[bowling] physique prête : Rapier ${infoPhysique.ms} ms, préchauffage ${infoPhysique.msChauffe} ms${infoPhysique.repli ? ' (fil principal)' : ' (Worker)'}`);
  raf = requestAnimationFrame((ms) => { avant = ms; raf = requestAnimationFrame(boucle); });
  plusTard(() => $('#chargement').classList.add('fini'), 250);

  return {
    maj,
    /** Libère TOUT : boucle, minuteurs, écouteurs, Worker, WebGL, AudioContext. */
    detruire() {
      if (detruit) return;
      detruit = true;
      cancelAnimationFrame(raf);
      for (const t of minuteurs) clearTimeout(t); minuteurs.clear();
      for (const f of ecouteurs) f(); ecouteurs.length = 0;
      ro?.disconnect();
      physique.detruire();
      try { S.fermer(); } catch { /* rien */ }
      try { R.detruire(); } catch (e) { console.warn('[bowling] libération du rendu', e); }
    },
    /** Mesures de fluidité (console : réglage). */
    fluidite() {
      const d = etat.stats.durees.slice().sort((a, b) => a - b); if (!d.length) return null;
      const moy = d.reduce((a, b) => a + b, 0) / d.length;
      return { images: d.length, ips: Math.round(1000 / moy), moyMs: +moy.toFixed(1), p95Ms: +d[Math.floor(d.length * 0.95)].toFixed(1), pireMs: +d[d.length - 1].toFixed(1), simMs: etat.stats.simMs.slice(-10) };
    },
  };
}
