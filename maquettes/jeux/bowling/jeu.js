// =====================================================================================
// Bowling Gearbox — ASSEMBLAGE (prototype v2, 17/10/2026). Contrat : CONTRAT.md.
// Ce module ne simule rien et ne dessine pas la 3D : il lit le GESTE du joueur (souris ou doigt), le traduit en
// lancer pour physique.js (dans un Web Worker), puis met en scène le résultat image par image avec rendu.js et son.js
// (lâcher, roulement, ralenti à l'impact, chocs, secousse, verdict, machine), tient la partie avec regles.js et
// affiche le HUD à la charte.
//
// LE GESTE (référence : Wii Sports Bowling)
//   On MAINTIENT le clic, on TIRE vers soi (le Mii part en élan, bras en arrière, il suit la souris avec de
//   l'inertie), on POUSSE vers l'avant et on RELÂCHE. Lecture du geste :
//   - vitesse : la vitesse de poussée (pic sur 60 ms, en « unités d'écran » par seconde, indépendante de la taille
//     de la fenêtre) → 3 … 10,5 m/s par une courbe douce aux deux bouts et étale au milieu (là où l'on joue) ;
//     un tirage trop court bride un peu la vitesse (on ne lance pas fort sans élan) ;
//   - direction : la trajectoire GLOBALE de la poussée s'ajoute à la visée (une poussée en biais de 5° envoie la
//     boule ~0,2 m à côté à la quille 1) — c'est la précision de la main, pas le placement, qui fait le lancer ;
//   - effet : le CHANGEMENT de direction en fin de geste (coup de poignet, 100 dernières ms) — tourner vers la gauche
//     fait crocheter à gauche (effet > 0) ;
//   - vitesse ↔ précision : vite = fort et droit, mais la déviation de la main est amplifiée et le poignet compte moins ;
//   - lâcher : relâcher trop tôt dans la poussée « tire » la boule à gauche, la garder une fois le bras arrêté la
//     « pousse » à droite, et dans les deux cas lâcher < 1 (petit rebond lourd, perte de vitesse) ;
//   - tout est DÉTERMINISTE : mêmes mouvements de souris → même lancer (aucun aléa).
//   - tolérance : un clic sans tirage, un tirage sans poussée, une poussée molle → le geste est ANNULÉ (le Mii revient
//     en place), jamais un lancer raté par accident.
//   Tous les réglages du ressenti sont dans GESTE et LECTURE ci-dessous.
// =====================================================================================
const V = new URL(import.meta.url).search; // suffixe de version propagé aux modules (cache du serveur de maquettes)
const [{ creerRendu }, { creerSon }, { tableau, position }, { emplacements, DIMENSIONS }, { ANNONCES: ANNONCES_CGT }] = await Promise.all([
  import('./rendu.js' + V), import('./son.js' + V), import('./regles.js' + V), import('./physique.js' + V), import('./cgt.js' + V),
]);

/* =====================================================================================
   RÉGLAGES DU RESSENTI
   ===================================================================================== */
const GESTE = {
  tirage: 0.25,            // course d'un tirage complet, en unités d'écran U (U = min(hauteur, 0,75 × largeur))
  depassement: 0.10,       // la poussée est « complète » à tant d'U au-delà du point de départ
  seuilTir: 9,             // px vers soi avant que le geste devienne un tir
  seuilPlacement: 14,      // px à l'horizontale (et 1,6 × plus qu'à la verticale) : on se place au lieu de tirer
  ressort: 160, amorti: 0.7, // inertie du bras (ressort ; amorti < 1 : il dépasse un peu, il a du poids)
  vMin: 0.6, vMax: 8.0,    // vitesse de poussée (U/s, pic sur 60 ms) qui donne vitesseMin … vitesseMax (à la souris :
                           // poussée posée ≈ 2–3, coup franc ≈ 4–5, coup très sec ≥ 7)
  toucher: 0.5,            // au doigt, l'écran est petit et le geste rapide : sa vitesse compte pour moitié (à valider)
  vitesseMin: 3, vitesseMax: 10.5, // m/s (plage du contrat)
  brideTirage: 0.6,        // tirage (0..1) en dessous duquel la vitesse est bridée (jusqu'à -15 %)
  annuler: { vMin: 0.4, tirageMin: 0.14 }, // en dessous : geste annulé
  // EFFET = coup de poignet : CHANGEMENT de direction entre le corps de la poussée (0 → `corps` de la course vers le
  // haut) et son trait final (`trait` → 1), en degrés → effet 0..1. Une poussée droite mais en biais n'a donc PAS d'effet : elle dévie.
  effet: { zoneMorte: 5, plein: 32, expo: 1.25, corps: 0.5, trait: 0.7 },
  // DIRECTION = trajectoire du corps de la poussée (première moitié de la course), en degrés par rapport à la verticale
  // de l'écran. Elle s'AJOUTE à la visée : gain 0,0024 rad/° → 5° de biais ≈ 0,012 rad ≈ 0,22 m à la quille 1.
  direction: { gain: 0.0024, zoneMorte: 0.5 },
  // VITESSE ↔ PRÉCISION : au-delà du milieu de la plage, la déviation de direction est amplifiée (jusqu'à ×1,8 au
  // maximum) et le poignet compte moins (effet ×0,55 au maximum). Lent = précis et crochète beaucoup ; rapide = fort,
  // droit, mais la moindre erreur de main coûte cher.
  precision: { debut: 0.5, ampliMax: 1.8, effetMin: 0.55 },
  // TIMING du lâcher : fenêtre parfaite = relâcher après au moins `tot` de la poussée ET moins de `tard` s après que
  // le bras a ralenti. Trop tôt : la boule est « tirée » (déviée à gauche du joueur) et tombe ; trop tard : « poussée »
  // (à droite) et rebondit. Déviation jusqu'à `devMax` rad (0,02 ≈ 0,36 m à la quille 1), proportionnelle à l'erreur.
  lacher: { tot: 0.6, tard: 0.08, tardPlein: 0.45, min: 0.35, devMax: 0.02 },
  place: { sensibilite: 0.75, pas: 0.6, angle: 0.06, molette: 0.004 }, // placement : m par U glissé, m/s au clavier, rad/s, rad par cran
};
const LECTURE = {
  ralenti: 0.35,           // vitesse de lecture autour de l'impact
  avantImpact: 0.08,       // le ralenti commence tant de secondes (physiques) avant le 1er choc boule-quille
  apresImpact: 0.7,        // … et dure jusqu'à tant après
  rampe: 0.12,             // entrée / sortie du ralenti (s physiques)
  verdict: 1.0,            // annonce (strike, spare…) tant après l'impact
  fin: 2.3,                // la lecture s'arrête tant après l'impact (les quilles ont fini de tomber)
  fete: 2.6, feteStrike: 3.2, // durée de la célébration (s)
  machine: 2.6,            // balayage et remise des quilles (s), calé sur S.machine()
};
const NOMS = { bony: ['Joueur 1', 'Joueur 2'], cgt: ['Camarade 1', 'Camarade 2'] };
// Annonces : le TITRE est toujours le terme de bowling (Théo, 17/10/2026) ; en thème CGT, la blague de cgt.js
// (ANNONCES[cle].sous, tirée au hasard) s'affiche EN DESSOUS. En thème Bony, le sous-titre informe.
const TITRES_BONY = { strike: 'strike !', double: 'double !', turkey: 'turkey !', spare: 'spare !', split: 'split !', gouttiere: 'gouttière !', rate: 'raté !' };
const SOUS_BONY = { strike: 'les 10 quilles d’un coup', double: 'deux strikes d’affilée', turkey: 'trois strikes d’affilée', spare: 'frame bouclée', gouttiere: 'on se reconcentre' };

/* =====================================================================================
   OUTILS
   ===================================================================================== */
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const lisse = (t) => { t = borne(t, 0, 1); return t * t * (3 - 2 * t); };
const maintenant = () => performance.now() / 1000;
const RACK = () => emplacements().map(({ n, x, z }) => ({ n, x, z, rot: 0 }));
const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');

/* =====================================================================================
   CHARGEMENT : rendu (décor, polices, textures) et physique (Worker : Rapier + préchauffage) en parallèle
   ===================================================================================== */
const ch = { barre: $('#chBarre'), etape: $('#chEtape'), pas: 0 };
const etapeChargement = (txt, fin = false) => { ch.pas++; ch.barre.style.width = (fin ? 100 : Math.min(90, ch.pas * 35)) + '%'; ch.etape.textContent = txt; };

function creerPhysique() {
  const attente = new Map(); let id = 0, worker = null, repli = null;
  const surRepli = async () => { // fil principal (navigateur sans Worker module) : même module, mêmes résultats
    if (!repli) repli = (async () => { const P = await import('./physique.js' + V); await P.initPhysique(); return P; })();
    return repli;
  };
  let pret;
  try {
    worker = new Worker(new URL('./worker-physique.js' + V, import.meta.url), { type: 'module' });
    pret = new Promise((ok, ko) => {
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'pret') ok(m);
        else if (m.type === 'resultat') { const a = attente.get(m.id); if (a) { attente.delete(m.id); a.ok(m); } }
        else if (m.type === 'erreur') { const a = attente.get(m.id); if (a) { attente.delete(m.id); a.ko(new Error(m.message)); } else ko(new Error(m.message)); }
      };
      worker.onerror = (e) => { e.preventDefault?.(); worker = null; ko(new Error(e.message || 'Worker indisponible')); };
    }).catch(async (e) => { console.warn('[jeu] physique sur le fil principal :', e.message); worker = null; await surRepli(); return { ms: 0, msChauffe: 0, repli: true }; });
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
  };
}

const canvas = $('#scene');
const physique = creerPhysique();
etapeChargement('Montage de la salle et des personnages…');
const R = await creerRendu(canvas, { theme: 'bony' });
etapeChargement('Moteur physique : chargement de Rapier et lancer de préchauffage…');
let infoPhysique;
try { infoPhysique = await physique.pret; }
catch (e) { $('#chErreur').textContent = 'Physique indisponible : ' + e.message; throw e; }
const S = creerSon(); // l'AudioContext ne naît qu'au premier clic sur « Son » (le navigateur l'exige)
const ajuster = () => R.redimensionner(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
addEventListener('resize', ajuster); ajuster();
if (typeof ResizeObserver === 'function') new ResizeObserver(ajuster).observe(canvas); // émulation d'écran, panneaux…

/* =====================================================================================
   ÉTAT DE LA PARTIE
   ===================================================================================== */
const cfg = { theme: 'bony', joueurs: 1, frames: 10, son: false };
const partie = { joueurs: [], courant: 0, debout: RACK(), fini: false };
const etat = {
  phase: 'visee',          // visee | geste | annule | lacher | roule | fete | machine | fin
  g: 0, gv: 0,             // élan du Mii (0..5, voir rendu.js) et sa vitesse : c'est lui qui a l'inertie
  geste: null,             // mesure du geste en cours
  lancer: null,            // paramètres envoyés à la physique
  sim: null,               // résultat de la simulation (null tant qu'il n'est pas revenu)
  idSim: 0,
  lect: null,              // lecture en cours
  minuteur: 0,
  touches: {},
  enAttente: null,         // réglage (joueurs, frames) à appliquer dès que possible
  stats: { images: 0, cumul: 0, pire: 0, durees: [], simMs: [] },
  historique: [],
};

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

/* =====================================================================================
   VISÉE
   ===================================================================================== */
const joueur = () => partie.joueurs[partie.courant];
function preparerVisee(immediat = false) {
  etat.phase = 'visee'; etat.g = 0; etat.gv = 0;
  const j = joueur();
  R.joueur.placer(j.x, j.angle); R.boule.enMain(true);
  R.camera('visee', { immediat });
  document.body.classList.add('visee'); document.body.classList.remove('geste');
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
  const planche = Math.round(borne((DIMENSIONS.demi - j.x) / (2 * DIMENSIONS.demi) * 39 + 0.5, 1, 39)); // planche 1 = bord droit
  const deg = j.angle * 180 / Math.PI, sens = Math.abs(deg) < 0.05 ? 'droit devant' : (deg > 0 ? 'vers la droite ' : 'vers la gauche ') + fmt(Math.abs(deg)) + '°';
  $('#lectureVisee').innerHTML = `planche <b>${planche}</b><br>${sens}`;
}

/* =====================================================================================
   LE GESTE
   ===================================================================================== */
const unite = () => Math.max(240, Math.min(innerHeight, innerWidth * 0.75));
const elanDe = (g) => (g < 2 ? ['approche', g / 2] : g < 3 ? ['arriere', g - 2] : g < 4 ? ['avant', g - 3] : ['suivi', Math.min(1, g - 4)]);
function poserElan() { const [ph, t] = elanDe(etat.g); R.joueur.elan(ph, t); }

/** Vitesse verticale « vers l'avant » (U/s) sur une fenêtre de w secondes finissant à l'échantillon k. */
function vitesseAvant(ech, k, w, tMin = -Infinity) {
  // la fenêtre ne remonte pas avant le début de la poussée (tMin) : sinon un geste très vif (40 ms) est dilué par
  // l'immobilité qui le précède (mesuré : un coup sec donnait moins de vitesse qu'un coup franc)
  const b = ech[k]; let j = k;
  while (j > 0 && b.t - ech[j - 1].t <= w && ech[j - 1].t >= tMin) j--; // échantillons DANS la fenêtre seulement
  const a = ech[j], dt = b.t - a.t;
  return dt > 0.008 ? -(b.y - a.y) / dt / unite() : 0;
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  if (etat.phase === 'fete' || etat.phase === 'machine') { accelerer(); return; }
  if (etat.phase !== 'visee') return;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* rien */ }
  const t = maintenant(), j = joueur();
  etat.geste = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, mode: 'indecis', ech: [{ t, x: e.clientX, y: e.clientY }],
    dyMax: 0, tirage: 0, pousse: false, p: 0, vPic: 0, tFort: t, gHaut: 0, xDepart: j.x };
  derniereSaisie = e.pointerType;
  majAide();
});
canvas.addEventListener('pointermove', (e) => {
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
    else if (dy > GESTE.seuilTir) { G.mode = 'tir'; etat.phase = 'geste'; document.body.classList.add('geste'); document.body.classList.remove('visee'); R.boule.enMain(true); majAide(); }
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
    if (dy > G.dyMax - 0.05 * D && G.p < 0.02) { G.pousse = false; G.vPic = 0; } // il retire vers lui : on reprend le tirage
  }
}
/** Cible de l'élan du Mii : le tirage l'emmène de 0 à 3 (approche en pas, bras en arrière), la poussée de là à 4,1. */
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
  if (e && G.pousse) echantillon(G, e.clientX, e.clientY, t); // la position du relâcher compte (coup très sec)
  // --- validité : tolérant, on n'envoie jamais un lancer par accident
  if (!G.pousse || G.vPic < GESTE.annuler.vMin || G.tirage < GESTE.annuler.tirageMin) {
    annulerGeste(!G.pousse ? 'Pousse vers l’avant avant de relâcher' : G.tirage < GESTE.annuler.tirageMin ? 'Tire davantage vers toi pour prendre de l’élan' : 'Pousse plus franchement');
    return;
  }
  // --- vitesse : pic de la poussée, courbe étale au milieu
  const n = borne((G.vPic - GESTE.vMin) / (GESTE.vMax - GESTE.vMin), 0, 1), d = n - 0.5;
  let vitesse = GESTE.vitesseMin + (GESTE.vitesseMax - GESTE.vitesseMin) * (0.5 + 0.55 * d + 1.8 * d * d * d);
  vitesse *= lerp(0.85, 1, borne(G.tirage / GESTE.brideTirage, 0, 1));
  vitesse = borne(vitesse, GESTE.vitesseMin, GESTE.vitesseMax);
  // --- direction de la poussée (globale) et trait final (100 ms finissant quand le bras était encore lancé)
  const fin = Math.min(t, G.tFort + 0.03), ech = G.ech;
  let kb = ech.length - 1; while (kb > 0 && ech[kb].t > fin) kb--;
  let kh = kb; while (kh > 0 && ech[kh - 1].t >= G.tHaut) kh--; // haut du tirage = début de la poussée
  // Segments repérés en fraction de la COURSE vers le haut (indépendants de la durée du geste et de la fréquence de
  // la souris), avec une zone tampon entre les deux pour que la transition du poignet ne pollue aucune mesure :
  // corps = [0 ; corps], trait final = [trait ; 1]. Point d'une fraction f : interpolé entre deux échantillons.
  const course = Math.max(1, ech[kh].y - ech[kb].y);
  const point = (f) => { let k = kh; while (k < kb && ech[kh].y - ech[k + 1].y < f * course) k++; const a = ech[k], b = ech[Math.min(kb, k + 1)];
    const fa = (ech[kh].y - a.y) / course, fb = (ech[kh].y - b.y) / course, u = fb > fa ? borne((f - fa) / (fb - fa), 0, 1) : 0; return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }; };
  const deg = (dx, dy) => Math.atan2(dx, Math.max(1, -dy)) * 180 / Math.PI; // 0 = droit vers le haut, > 0 = vers la droite
  const p0 = point(0), pc = point(GESTE.effet.corps), pt = point(GESTE.effet.trait), p1 = point(1);
  const angleTrait = deg(p1.x - pt.x, p1.y - pt.y);   // fin de geste (poignet)
  const angleDebut = deg(pc.x - p0.x, pc.y - p0.y);   // corps de la poussée
  // la DIRECTION est celle du corps de la poussée (pas du trait final) : sinon le coup de poignet dévierait aussi
  const dirPoussee = angleDebut;
  // --- précision selon la vitesse
  const Pr = GESTE.precision, exces = borne((n - Pr.debut) / (1 - Pr.debut), 0, 1);
  const ampli = lerp(1, Pr.ampliMax, exces), poignet = lerp(1, Pr.effetMin, exces);
  // --- effet : changement de direction en fin de geste (le coup de poignet)
  const E = GESTE.effet, tourne = angleTrait - angleDebut;
  const ampl = Math.pow(borne((Math.abs(tourne) - E.zoneMorte) / (E.plein - E.zoneMorte), 0, 1), E.expo);
  const effet = -Math.sign(tourne) * ampl * poignet; // fin de geste vers la gauche → crochet à gauche (effet > 0)
  // --- déviation de direction (angle > 0 = vers la droite du joueur, comme la poussée vers la droite de l'écran)
  const Dr = GESTE.direction, dirUtile = Math.sign(dirPoussee) * Math.max(0, Math.abs(dirPoussee) - Dr.zoneMorte);
  const devDirection = dirUtile * Dr.gain * ampli;
  // --- lâcher : trop tôt dans la poussée (tiré à gauche), ou bras arrêté depuis trop longtemps (poussé à droite)
  const L = GESTE.lacher, retard = t - G.tFort;
  let lacher = 1, timing = 'parfait', devTiming = 0;
  if (G.p < L.tot) { const e = 1 - G.p / L.tot; lacher = lerp(1, L.min + 0.1, e); devTiming = -L.devMax * e; timing = 'tôt'; }
  else if (retard > L.tard) { const e = borne((retard - L.tard) / (L.tardPlein - L.tard), 0, 1); lacher = lerp(1, L.min, e); devTiming = L.devMax * e; timing = 'tard'; }
  const j0 = joueur(), angle = borne(j0.angle + devDirection + devTiming, -0.08, 0.08);
  const j = j0;
  etat.lancer = { position: j.x, angle: Math.round(angle * 100000) / 100000, vitesse: Math.round(vitesse * 1000) / 1000, effet: Math.round(effet * 1000) / 1000, lacher: Math.round(lacher * 1000) / 1000 };
  etat.mesure = { n, vPic: G.vPic, tirage: G.tirage, angleTrait, dirPoussee, tourne, timing, p: G.p, retard, devDirection, devTiming, vise: j.angle, ecart: etat.lancer.angle - j.angle };
  // journal des gestes (réglage du ressenti sur de vrais lancers : JEU.etat.historique dans la console)
  etat.historique.push({ type: G.type, U: Math.round(unite()), vPic: +G.vPic.toFixed(2), tirage: +G.tirage.toFixed(2), angleTrait: +angleTrait.toFixed(1), dirPoussee: +dirPoussee.toFixed(1), p: +G.p.toFixed(2), retard: +retard.toFixed(3), ...etat.lancer });
  etat.phase = 'lacher'; etat.vLacher = 2.6 + 4.5 * n; etat.sim = null;
  document.body.classList.remove('geste');
  const id = ++etat.idSim, debout = partie.debout.map(({ n: nn, x, z, rot }) => ({ n: nn, x, z, rot }));
  physique.simuler(debout, etat.lancer).then((m) => {
    if (id !== etat.idSim) return;
    etat.sim = m.res; etat.stats.simMs.push(m.ms);
  }).catch((err) => { console.error('[jeu] simulation', err); if (id === etat.idSim) annulerGeste('La simulation a échoué, rejoue le lancer'); });
  majAide();
};
canvas.addEventListener('pointerup', relacher);
canvas.addEventListener('pointercancel', (e) => { const G = etat.geste; if (G && e.pointerId === G.id) { etat.geste = null; if (etat.phase === 'geste') annulerGeste(); } });

function annulerGeste(msg) {
  etat.geste = null; etat.idSim++; etat.phase = 'annule';
  document.body.classList.remove('geste');
  if (msg) montrerAide(msg);
}

/* =====================================================================================
   LÂCHER ET LECTURE IMAGE PAR IMAGE
   ===================================================================================== */
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
  // fin de lecture : les quilles ont fini de tomber (impact + LECTURE.fin), ou la boule est au fond depuis 0,6 s
  let tFin = res.duree;
  if (res.impactT != null) tFin = Math.min(res.duree, res.impactT + LECTURE.fin);
  else { const k = res.images.findIndex((im) => im.boule[2] > DIMENSIONS.fosse + 0.1 || im.boule[1] < -0.15); if (k >= 0) tFin = Math.min(res.duree, res.images[k].t + 0.6); }
  etat.lect = { res, t: 0, tPrec: -1, vit: 1, iContact: 0, tFin, verdict: false, camQuilles: false, tReel: 0, debout: partie.debout, eclats: 0 };
  etat.phase = 'roule';
  R.boule.enMain(false);
  R.lecture(res.images, res.impactT);
  R.camera('suivi');
  // son du lâcher : un lâcher raté sonne plus lourd (rebond) ; un lancer rapide claque un peu plus
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

/** Une image de lecture : avance l'horloge physique (ralenti compris), affiche l'image interpolée, joue les sons et
 *  les effets des contacts franchis À CETTE IMAGE — le son et la secousse tombent sur le choc visible. */
function lire(dt) {
  const L = etat.lect, res = L.res;
  L.vit = facteurLecture(L, L.t);
  const tAvant = L.t;
  L.t = Math.min(L.tFin, L.t + dt * L.vit);
  L.tReel += dt;
  const img = imageA(res, L.t);
  R.image(img, dt);
  // Mii : accompagnement du geste
  R.joueur.elan('suivi', Math.min(1, L.tReel / 0.9));
  // roulement : un appel par image, avec z et x (distance juste même au ralenti) ; au ralenti, le son « ralentit » aussi
  const ro = res.roulement[Math.min(res.roulement.length - 1, Math.round(L.t * 60))];
  if (ro) S.roulement({ vitesse: ro.vitesse * (0.45 + 0.55 * L.vit), glisse: ro.glisse, zone: ro.zone, z: img.boule[2], x: img.boule[0] });
  // contacts franchis pendant cette image
  let secousse = 0; const eclats = [];
  const cs = res.contacts;
  while (L.iContact < cs.length && cs[L.iContact].t <= L.t) {
    const c = cs[L.iContact++];
    if (c.t <= tAvant && tAvant > 0) continue;
    if (c.type === 'boule-piste' && c.t < 0.3) continue; // déjà joué par S.lacher (même quart de seconde)
    S.contact({ ...c, t: c.t / Math.max(0.2, L.vit) }); // écarts entre chocs d'une même image étirés comme l'image
    const lg = Math.log10(Math.max(1, c.force));
    if (c.type === 'boule-quille') { secousse = Math.max(secousse, borne((lg - 2.2) * 1.0, 0.15, 2.2)); if (c.force > 300) eclats.push(c); }
    else if (c.type === 'quille-quille') secousse = Math.max(secousse, borne((lg - 2.8) * 0.4, 0, 0.45));
    else if (c.type === 'quille-mur' || c.type === 'quille-fosse') secousse = Math.max(secousse, borne((lg - 2.7) * 0.3, 0, 0.35));
    else if (c.type === 'boule-fosse') secousse = Math.max(secousse, borne((lg - 2.6) * 0.6, 0, 0.8));
    else if (c.type === 'boule-gouttiere') secousse = Math.max(secousse, borne((lg - 2.4) * 0.4, 0, 0.4));
    else if (c.type === 'boule-piste') secousse = Math.max(secousse, borne((lg - 2.4) * 0.5, 0, 0.6));
  }
  if (secousse > 0.08) R.effet('secousse', { force: secousse }); // les frôlements ne font pas trembler l'image
  // éclats : seulement aux chocs de la boule, le plus fort de l'image, 3 par lancer au plus (sinon la gerbe noie le choc)
  if (eclats.length && L.eclats < 3) { const c = eclats.sort((a, b) => b.force - a.force)[0]; L.eclats++; R.effet('eclats', { x: c.x, y: c.y, z: c.z, force: c.force }); }
  // caméra : on passe sur les quilles juste avant l'impact (ou quand la boule arrive, si elle ne touche rien)
  if (!L.camQuilles && ((res.impactT != null && L.t >= res.impactT - 0.42) || img.boule[2] > 14.2)) { L.camQuilles = true; R.camera('quilles'); }
  // verdict (annonce, salle) : un peu après l'impact pour un strike / spare, sinon en fin de lecture
  const ti = res.impactT;
  if (!L.verdict && ti != null && L.t >= ti + LECTURE.verdict) verdict(L, true);
  if (L.t >= L.tFin) { if (!L.verdict) verdict(L, false); finLecture(L); }
}

/* =====================================================================================
   VERDICT, CÉLÉBRATION, MACHINE, ENCHAÎNEMENT
   ===================================================================================== */
function verdict(L, enCours) {
  const res = L.res, j = joueur(), avant = position(j.lancers, cfg.frames);
  const tombees = res.tombees, reste = res.restent.length;
  let type;
  if (avant.rack && tombees === 10) type = 'strike';
  else if (!avant.rack && reste === 0) type = 'spare';
  else if (tombees === 0) type = res.gouttiere ? 'gouttiere' : 'rate';
  else if (avant.rack) type = tombees >= 6 ? 'bon' : 'rate';
  else type = reste <= 2 ? 'bon' : 'rate';
  // le score attend la fin de lecture pour s'écrire (cohérent avec ce qu'on voit), mais le verdict se décide ici
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

/** Clic pendant la fête ou la machine : on presse le pas (utile à 2 joueurs). */
function accelerer() { if (etat.phase === 'fete') etat.minuteur = Math.min(etat.minuteur, 0.15); else if (etat.phase === 'machine') etat.machine.vite = true; }

function suite() {
  // qui joue ensuite, et sur quelles quilles ?
  const j = joueur(), L = etat.lect, avant = L.verdict.avant, apres = position(j.lancers, cfg.frames);
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

/** Le râteau : les quilles gardées montent dans la table, le reste est balayé dans la fosse, puis la table repose. */
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
    const descend = 1 - lisse((t - 1.85) / 0.45), haut = M.gardees.size ? levee : 0.85; // un rack neuf descend de la table
    const quilles = M.nouvelles.map((q) => { const r = q.rot || 0; return [q.x, haut * descend, q.z, 0, Math.sin(r / 2), 0, Math.cos(r / 2)]; });
    R.image({ quilles }, dt);
  }
  if (t >= LECTURE.machine) {
    partie.debout = M.nouvelles; R.poserQuilles(partie.debout);
    if (M.prochain < 0) { finDePartie(); return; }
    partie.courant = M.prochain;
    preparerVisee();
    majHUD();
  }
}

function finDePartie() {
  partie.fini = true; etat.phase = 'fin';
  document.body.classList.remove('visee');
  R.camera('celebration'); R.joueur.reaction('strike');
  const th = cfg.theme, scores = partie.joueurs.map((j) => tableau(j.lancers, cfg.frames).total);
  const max = Math.max(...scores), gagnants = scores.map((s, i) => (s === max ? i : -1)).filter((i) => i >= 0);
  const noms = NOMS[th];
  let phrase;
  if (scores.length === 1) phrase = th === 'cgt' ? `Bilan de la lutte : ${max} points` : `Score final : ${max}`;
  else if (gagnants.length > 1) phrase = th === 'cgt' ? 'Égalité : la solidarité l’emporte' : 'Égalité parfaite !';
  else phrase = th === 'cgt' ? `${noms[gagnants[0]]} mène le cortège !` : `${noms[gagnants[0]]} remporte la partie !`;
  $('#finTitre').textContent = th === 'cgt' ? 'Fin de la manif' : 'partie terminée';
  $('#finVainqueur').textContent = phrase;
  $('#finScores').innerHTML = scores.map((s, i) => `<div class="${scores.length > 1 && gagnants.length === 1 && i === gagnants[0] ? 'gagne' : ''}"><span>${noms[i]}</span><b>${s}</b></div>`).join('');
  $('#finSignature').textContent = th === 'cgt' ? 'On lâche rien !' : 'Bony auto-mobile · Génération auto-mobile';
  $('#fin').classList.add('vu');
  R.effet('confettis', { n: 160 });
  S.resultat(scores.length > 1 || max >= 100 ? 'strike' : 'bon');
  majHUD();
}

/* =====================================================================================
   HUD : feuille de score, schéma des quilles, aide, retour du lâcher, annonce
   ===================================================================================== */
function marques(fr, nbFrames) {
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
  const noms = NOMS[cfg.theme];
  $('#feuille').innerHTML = partie.joueurs.map((j, ij) => {
    const tb = tableau(j.lancers, cfg.frames), pos = position(j.lancers, cfg.frames), actif = ij === partie.courant && !partie.fini;
    const cases = tb.frames.map((fr, f) => {
      const m = marques(fr, cfg.frames);
      return `<div class="fr${fr.derniere ? ' der' : ''}${actif && pos.frame === f ? ' cour' : ''}"><div class="num">${f + 1}</div><div class="ls">${m.map(([t, c]) => `<span class="${c}">${t}</span>`).join('')}</div><div class="cu">${fr.total ?? ''}</div></div>`;
    }).join('');
    return `<div class="ligne${actif ? ' actif' : ''}"><div class="nom"><i></i>${noms[ij]}</div>${cases}<div class="tot"><small>total</small>${tb.total}</div></div>`;
  }).join('');
}
// schéma des quilles (vu du joueur : 7 à gauche, 10 à droite, la 1 devant / en bas)
const POS_SCHEMA = { 1: [0, 0], 2: [1, 1], 3: [-1, 1], 4: [2, 2], 5: [0, 2], 6: [-2, 2], 7: [3, 3], 8: [1, 3], 9: [-1, 3], 10: [-3, 3] };
$('#schema').innerHTML = Object.entries(POS_SCHEMA).map(([n, [c, r]]) => `<circle id="sq${n}" cx="${43 - c * 11.5}" cy="${68 - r * 19}" r="7"></circle>`).join('');
function majSchema(debout, avant = null, vient = false) {
  const set = new Set(debout);
  for (let n = 1; n <= 10; n++) $('#sq' + n).setAttribute('class', set.has(n) ? (vient ? 'vient' : 'debout') : 'tombee');
  if (vient) setTimeout(() => { if (etat.phase !== 'roule') for (const n of set) $('#sq' + n).setAttribute('class', 'debout'); }, 1200);
  const nb = set.size;
  $('#reste').textContent = nb === 0 ? 'toutes les quilles sont tombées' : nb === 1 ? '1 quille debout' : `${nb} quilles debout`;
}
function majEtat() {
  const j = joueur(), noms = NOMS[cfg.theme];
  if (!j) return;
  const pos = position(j.lancers, cfg.frames);
  $('#qui').textContent = partie.fini ? 'Partie terminée' : (cfg.joueurs > 1 ? 'À toi, ' : '') + noms[partie.courant];
  if (!partie.fini) {
    const nl = pos.lancer + 1;
    $('#ou').innerHTML = `Frame <b>${Math.min(cfg.frames, pos.frame + 1)}</b> / ${cfg.frames} · ${nl}<sup>${nl === 1 ? 'er' : 'e'}</sup> lancer`;
  } else $('#ou').textContent = '';
}
function majHUD() {
  majFeuille(); majEtat();
  if (etat.phase === 'visee' || etat.phase === 'fin') majSchema(partie.debout.map((q) => q.n));
}
let derniereSaisie = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
function majAide() {
  const doigt = derniereSaisie === 'touch' || derniereSaisie === 'pen', a = $('#aide'), p = etat.phase;
  if (p === 'visee') a.innerHTML = doigt
    ? 'Garde le doigt posé, <b>tire vers toi</b>, <b>pousse</b> et lâche · glisse ← → pour te placer'
    : 'Maintiens le clic, <b>tire vers toi</b>, <b>pousse</b> et relâche · glisse ← → pour te placer · molette : viser';
  else if (p === 'geste') a.innerHTML = 'Pousse <b>bien droit</b> (un biais dévie la boule) et relâche en fin de poussée — un coup de poignet final donne l’effet';
  else if (p === 'fete' || p === 'machine') a.innerHTML = doigt ? 'Touche l’écran pour passer' : 'Clic pour passer';
  else if (p === 'fin') a.innerHTML = '';
  else if (p !== 'annule') a.innerHTML = '';
  a.style.opacity = a.innerHTML ? 1 : 0;
}
let aideMinuteur = 0;
function montrerAide(msg) { const a = $('#aide'); a.innerHTML = msg; a.style.opacity = 1; clearTimeout(aideMinuteur); aideMinuteur = setTimeout(majAide, 2200); }

function montrerRetour(L, M) {
  const kmh = Math.round(L.vitesse * 3.6), e = L.effet, ae = Math.abs(e);
  const force = ae < 0.08 ? 'boule droite' : `${ae < 0.35 ? 'léger' : ae < 0.7 ? 'net' : 'fort'} crochet à ${e > 0 ? 'gauche' : 'droite'}`;
  // direction réelle par rapport à la visée (angle > 0 = vers la droite du joueur) et écart à la quille 1 (~18,1 m)
  const ecDeg = M.ecart * 180 / Math.PI, ecCm = Math.round(Math.abs(M.ecart) * 1814);
  const dir = Math.abs(ecDeg) < 0.05 ? 'pile dans la visée' : `${fmt(Math.abs(ecDeg))}° à ${ecDeg > 0 ? 'droite' : 'gauche'} de la visée (${ecCm} cm à la quille 1)`;
  const lach = M.timing === 'parfait' ? 'lâcher parfait' : M.timing === 'tôt' ? 'lâcher précoce : boule tirée à gauche' : 'lâcher tardif : boule poussée à droite';
  $('#retour').innerHTML = `<div class="kmh">${kmh}<small>km/h</small></div><div class="det"><span><b>${dir}</b></span><span>${force}</span><div class="barre"><i style="left:${50 - e * 50}%"></i></div><span>${lach}</span></div>`;
  $('#retour').classList.add('vu');
  clearTimeout(montrerRetour.m); montrerRetour.m = setTimeout(cacherRetour, 3400);
}
function cacherRetour() { $('#retour').classList.remove('vu'); }

let annonceMinuteur = 0;
/** Split : la quille 1 est tombée et les quilles restantes forment au moins deux groupes séparés (7-10, 4-6, 5-7…).
 *  Voisines = adjacentes dans le triangle (0,3048 m), ou l'une derrière l'autre (2-8, 3-9, 1-5 : « sleepers », pas
 *  un split). Sur les emplacements réglementaires, pas sur les positions décalées. */
const EMPL = Object.fromEntries(emplacements().map((e) => [e.n, e]));
function estSplit(restent) {
  if (restent.length < 2 || restent.includes(1)) return false;
  const voisines = (a, b) => { const dx = EMPL[a].x - EMPL[b].x, dz = EMPL[a].z - EMPL[b].z, d = Math.hypot(dx, dz); return d < 0.32 || (Math.abs(dx) < 0.01 && d < 0.55); };
  const vu = new Set([restent[0]]), pile = [restent[0]];
  while (pile.length) { const a = pile.pop(); for (const b of restent) if (!vu.has(b) && voisines(a, b)) { vu.add(b); pile.push(b); } }
  return vu.size < restent.length;
}
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
  el.querySelector('.gros').style.fontSize = fort ? '' : 'clamp(30px, 5vw, 72px)';
  el.classList.add('vu');
  R.annonce(titre, sous, 3.2); // l'écran au-dessus de la piste dit la même chose
  clearTimeout(annonceMinuteur); annonceMinuteur = setTimeout(() => cacherAnnonce(), cle === 'strike' || cle === 'turkey' ? 2900 : 2300);
}
function cacherAnnonce(net) { const el = $('#annonce'); if (net) { el.classList.remove('vu', 'part'); return; } if (el.classList.contains('vu')) { el.classList.add('part'); setTimeout(() => el.classList.remove('vu', 'part'), 380); } }

/* =====================================================================================
   RÉGLAGES (thème, joueurs, frames, son, nouvelle partie)
   ===================================================================================== */
const ICONE_SON = { off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>', on: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 5.5a9 9 0 0 1 0 13"/></svg>' };
function majSon() { const b = $('#bSon'); b.innerHTML = (cfg.son ? ICONE_SON.on : ICONE_SON.off) + (cfg.son ? 'Son activé' : 'Son coupé'); b.classList.toggle('actif', cfg.son); b.setAttribute('aria-pressed', cfg.son); }
$('#bSon').onclick = () => { cfg.son = !cfg.son; S.theme(cfg.theme); S.activer(cfg.son); S.ambiance(cfg.son); majSon(); };
function appliquerTheme(th) {
  cfg.theme = th; document.body.dataset.theme = th; R.setTheme(th); S.theme(th);
  $$('#reglages [data-theme]').forEach((b) => b.classList.toggle('actif', b.dataset.theme === th));
  const cgt = th === 'cgt';
  $('#logo').src = cgt ? 'assets/logo-cgt.svg' : 'assets/logo-bony-white.svg'; $('#logo').alt = cgt ? 'CGT' : 'Bony auto-mobile';
  $('#marque .titre').textContent = cgt ? 'Piquet de grève' : 'bowling';
  $('#finLogo').src = cgt ? 'assets/logo-cgt.svg' : 'assets/logo-bony-color.svg';
  document.title = cgt ? 'Bowling — Grève CGT' : 'Bowling — Bony auto-mobile';
  majHUD();
}
$$('#reglages [data-theme]').forEach((b) => (b.onclick = () => appliquerTheme(b.dataset.theme)));
const quandLibre = (f) => { if (etat.phase === 'visee' || etat.phase === 'fin') f(); else etat.enAttente = f; };
$$('[data-joueurs]').forEach((b) => (b.onclick = () => { cfg.joueurs = +b.dataset.joueurs; $$('[data-joueurs]').forEach((x) => x.classList.toggle('actif', x === b)); quandLibre(nouvellePartie); }));
$$('[data-frames]').forEach((b) => (b.onclick = () => { cfg.frames = +b.dataset.frames; $$('[data-frames]').forEach((x) => x.classList.toggle('actif', x === b)); quandLibre(nouvellePartie); }));
$('#bNouvelle').onclick = () => nouvellePartie();
$('#bRejouer').onclick = () => nouvellePartie();

// pavé de visée : appui maintenu = répétition
for (const b of $$('#pave button')) {
  let rep = 0;
  const pas = () => { if (etat.phase !== 'visee') return; placer((+b.dataset.pas || 0) * 0.027, (+b.dataset.vise || 0) * 0.002); };
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); pas(); clearInterval(rep); rep = setInterval(pas, 90); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearInterval(rep));
}
// clavier : ← → se placer ; Maj + ← → (ou A / E) viser ; Échap annule le geste
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && etat.phase === 'geste') { annulerGeste('Geste annulé'); return; }
  etat.touches[e.key.toLowerCase()] = true; etat.touches.shift = e.shiftKey;
  if (['arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
});
addEventListener('keyup', (e) => { etat.touches[e.key.toLowerCase()] = false; etat.touches.shift = e.shiftKey; });
canvas.addEventListener('wheel', (e) => { if (etat.phase !== 'visee') return; e.preventDefault(); placer(0, Math.sign(e.deltaY) * GESTE.place.molette); }, { passive: false });
function clavier(dt) {
  const T = etat.touches, g = T.arrowleft ? -1 : T.arrowright ? 1 : 0;
  let dx = 0, da = 0;
  if (g && !T.shift) dx = g * GESTE.place.pas * dt; else if (g) da = g * GESTE.place.angle * dt;
  if (T.a) da -= GESTE.place.angle * dt; if (T.e || T.d) da += GESTE.place.angle * dt;
  if (dx || da) placer(dx, da);
}

/* =====================================================================================
   BOUCLE
   ===================================================================================== */
let avant = performance.now();
function boucle(ms) {
  const dtr = (ms - avant) / 1000; avant = ms;
  const dt = borne(dtr, 0, 0.1);
  // statistiques de fluidité (window.JEU.stats)
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
      if (etat.g < 0.03 && Math.abs(etat.gv) < 0.2) preparerVisee();
      break;
    }
    case 'lacher': {
      // le bras finit sa course (sa vitesse dépend de la poussée), puis le Mii tient la glissade si la physique n'a
      // pas encore répondu ; la boule part à g = 4, en fin de glissade
      if (etat.g < 4) { etat.g = Math.min(4, etat.g + dt * Math.max(etat.vLacher, etat.gv)); etat.gv = 0; }
      else etat.g = Math.min(4.12, etat.g + dt * 0.25);
      poserElan();
      if (etat.g >= 4 && etat.sim) lacherBoule();
      break;
    }
    case 'roule': lire(dt); break;
    case 'fete': {
      etat.minuteur -= dt;
      if (etat.minuteur <= 0) suite();
      break;
    }
    case 'machine': animerMachine(dt); break;
    default: break;
  }
  R.rendre(dt);
  requestAnimationFrame(boucle);
}

/* =====================================================================================
   DÉMARRAGE
   ===================================================================================== */
majSon();
appliquerTheme('bony');
nouvellePartie();
etapeChargement('Prêt', true);
console.info(`[jeu] physique prête : Rapier ${infoPhysique.ms} ms, préchauffage ${infoPhysique.msChauffe} ms${infoPhysique.repli ? ' (fil principal)' : ' (Worker)'}`);
requestAnimationFrame((ms) => { avant = ms; requestAnimationFrame(boucle); });
setTimeout(() => $('#chargement').classList.add('fini'), 250);

// accès pour les tests et le réglage à chaud (console)
window.JEU = { R, S, cfg, partie, etat, GESTE, LECTURE, physique, infoPhysique,
  fluidite() {
    const d = etat.stats.durees.slice().sort((a, b) => a - b); if (!d.length) return null;
    const moy = d.reduce((a, b) => a + b, 0) / d.length;
    return { images: d.length, ips: Math.round(1000 / moy), moyMs: +moy.toFixed(1), p95Ms: +d[Math.floor(d.length * 0.95)].toFixed(1), pireMs: +d[d.length - 1].toFixed(1), qualite: R.debug.qualite.niveau, simMs: etat.stats.simMs.slice(-10) };
  },
};
