// @ts-nocheck — moteur écrit en JavaScript (prototype maquettes/jeux/bowling/physique.js), typé « any » à dessein.
// =====================================================================================
// BOWLING — physique PARTAGÉE entre le serveur (il rejoue chaque lancer et fait foi) et le navigateur (animation).
// Source canonique : shared/bowling/physique.ts ; copie OCTET POUR OCTET dans backend/src/games/bowling/physique.ts
// (contrôlée par scripts/check-bowling-sync.mjs, comme le minigolf). On modifie ici, puis :
//   cp shared/bowling/physique.ts backend/src/games/bowling/physique.ts
//
// ⚠️ Physique VALIDÉE par Théo (17/10/2026) : reprise à l’identique du prototype. Seul écart : AUCUN import par CDN —
// initPhysique(RAPIER) reçoit le module @dimforge/rapier3d-deterministic-compat@0.21.0 (version EXACTE, la même
// dans package.json et backend/package.json : c’est elle qui garantit le même résultat au bit près).
// =====================================================================================
/* eslint-disable */
/* =====================================================================================
   BOWLING — physique 3D DÉTERMINISTE (prototype v2, 16/10/2026). Contrat : CONTRAT.md (§ physique.js).

   Pourquoi un vrai moteur : le prototype 1 (../bowling-moteur.js, 2D maison) a été jugé « éteint ». Ici, tout émerge
   d'une simulation de corps rigides Rapier (build DÉTERMINISTE, WASM, f32 avec libm logicielle) : rien n'est scripté,
   ni le crochet de la boule, ni la chute des quilles.

   CHARGEMENT DE RAPIER
   - Partout (navigateur ET serveur) : passer le module déjà importé (paquet npm, WASM embarqué en base64) :
       import RAPIER from '@dimforge/rapier3d-deterministic-compat';   // 0.21.0, EXACTEMENT
       await initPhysique(RAPIER);
   Même paquet, même version → même résultat AU BIT PRÈS dans les deux environnements (vérifié par test-physique).

   DÉTERMINISME (le serveur rejouera chaque lancer et fera foi)
   - Pas fixe 1/240 s, aucune horloge, aucun aléa ; un monde Rapier NEUF par lancer, corps créés dans un ordre fixe
     (décor, boule, quilles dans l'ordre de `debout`).
   - Aucun Math.sin/cos/atan/exp/pow dans ce qui touche l'état : leur précision n'est PAS normée par ECMAScript et
     diffère d'un moteur JS à l'autre. On n'utilise que + - * / et Math.sqrt (exacts IEEE) ; la trigonométrie passe
     par sinD / cosD / atan2D, des séries écrites ici.

   MODÈLE PHYSIQUE
   - Boule : sphère 6,8 kg, rayon 0,1085, rayon de giration 0,065 m (noyau d'une boule réelle). Lâchée avec une vitesse
     ET une rotation : régime 250 → 400 tr/min selon |effet|, axe incliné (« axis rotation » jusqu'à REGLAGES.axeMax,
     « axis tilt » jusqu'à REGLAGES.tiltMax). Effet 0 = rotation avant seule.
   - L'HUILE : le frottement boule/piste dépend de la position de la boule (motif d'huile). Rapier ne connaît qu'un
     frottement par collider : la surface (piste + aire, d'un seul tenant) est faite de DEUX colliders superposés que
     les groupes de collision séparent — l'un ne voit que la boule et son frottement est mis à jour à CHAQUE pas selon
     (x, z) de la boule ; l'autre ne voit que les quilles (frottement fixe). Aucun tronçon, donc AUCUNE arête où la boule
     pourrait accrocher (un essai avec une marche de 0,5 mm entre piste et aire la faisait décoller de 40 cm).
     μ = 0,02 dans l'huile (12 premiers mètres au centre, ~1 m de moins sur les bords), rampe de 1,6 m, puis sec μ = 0,20.
     (Avec μ = 0,04 la boule dérivait de ~0,25 m dans l'huile et crochetait trop tôt : mesuré, d'où 0,02.)
     → La boule GLISSE (le point de contact frotte : elle perd un peu de vitesse et commence à tourner « en avant »),
       CROCHÈTE quand la piste sèche mord la rotation latérale, puis ROULE (plus de glissement : trajectoire droite).
       Rien d'inventé : c'est le frottement de Coulomb sur une sphère qui tourne. La direction du glissement étant
       constante sur une sphère, le crochet est fort là où μ est fort — d'où l'huile longue et le crochet tardif.
   - Effet Magnus LÉGER (demandé) : F = REGLAGES.magnus · (ω × v), appliqué tant que la boule est sur la piste. Seule
     la composante verticale de ω (l'inclinaison de l'axe) donne une poussée latérale ; elle va dans le sens du crochet.
   - Lâcher imparfait (`lacher` < 1) : la boule part de plus haut (rebond sur la piste, perte d'énergie au choc et un
     peu de vitesse au lâcher). Toujours déterministe.
   - Quilles : corps COMPOSÉS d'un pied cylindrique et de 4 enveloppes convexes qui suivent le profil réglementaire
     (bas du ventre, ventre large, col fin, tête), 1,53 kg, centre de gravité à 0,14 m (angle de basculement ≈ 10°). Elles basculent, rebondissent, ricochent sur les murs de l'aire
     (« kickbacks ») et reviennent faucher, tombent dans la fosse, vacillent et restent parfois debout, éventuellement
     décalées (`restent` porte x, z, rot pour le lancer suivant).
   - Décor : piste et aire (voir l'huile), gouttières au profil arrondi (tronçons plans orientés le long de la piste :
     leurs arêtes sont PARALLÈLES au mouvement, la boule ne peut pas y buter), murs latéraux, fosse, rideau arrière.
   - Frottements et rebonds : réglés PAR PAIRE dans REGLAGES (règle « Multiply » partout, voir matieres()). Le rebond
     boule/quille élevé (0,8) donne la « déflexion » d'une boule droite (elle laisse la 5, la 5-10…) ; les murs de
     l'aire sont mous (0,2) : un « kickback » renvoie la quille sans la transformer en boule de flipper.
   - Ce qu'on a MESURÉ (test-physique-balayage.mjs, 16/10/2026) : voir le bandeau de ce script.
   - Contacts : évènements de force de contact Rapier (CONTACT_FORCE_EVENTS). Un « choc » = le début d'un épisode de
     contact entre deux colliders ; sa force = le maximum sur ses 4 premiers pas (N, brute : un strike donne des chocs
     boule-quille de 2 000 à 3 500 N, une quille qui retombe quelques centaines). Les contacts permanents (boule qui
     roule, quille posée) ne produisent qu'un épisode ; les seuils SEUILS écartent les frôlements inaudibles.
     Une quille-quille porte n ET n2 ; un choc de la boule contre un mur, le rideau ou la fosse est classé
     'boule-fosse' (le contrat n'a pas de type 'boule-mur').

   REPÈRE (celui de three.js, CONTRAT.md) : y en haut, z le long de la piste (0 = ligne de faute, quille 1 à 18,29),
   x positif = à GAUCHE du joueur. Images : boule = centre ; quille = centre de sa BASE (y = 0 debout), quaternion
   three.js [x, y, z, w].
   ===================================================================================== */


// ------------------------------------------------------------------ trigonométrie déterministe
const PI = 3.141592653589793, DEMI_PI = 1.5707963267948966;

/** Séries de Taylor sur [-π/4, π/4] (erreur < 1e-17). */
function serieSin(r) {
  const r2 = r * r;
  return r * (1 - r2 / 6 * (1 - r2 / 20 * (1 - r2 / 42 * (1 - r2 / 72 * (1 - r2 / 110 * (1 - r2 / 156 * (1 - r2 / 210 * (1 - r2 / 272))))))));
}
function serieCos(r) {
  const r2 = r * r;
  return 1 - r2 / 2 * (1 - r2 / 12 * (1 - r2 / 30 * (1 - r2 / 56 * (1 - r2 / 90 * (1 - r2 / 132 * (1 - r2 / 182 * (1 - r2 / 240)))))));
}
function quadrant(x) {
  const k = Math.round(x / DEMI_PI), r = x - k * DEMI_PI;
  return [((k % 4) + 4) % 4, r];
}
export function sinD(x) {
  const [k, r] = quadrant(x), s = serieSin(r), c = serieCos(r);
  return k === 0 ? s : k === 1 ? c : k === 2 ? -s : -c;
}
export function cosD(x) {
  const [k, r] = quadrant(x), s = serieSin(r), c = serieCos(r);
  return k === 0 ? c : k === 1 ? -s : k === 2 ? -c : s;
}
/** atan par double demi-angle (|y| ≤ tan(π/16)) puis série. */
function atanD(x) {
  const neg = x < 0;
  if (neg) x = -x;
  const inv = x > 1;
  if (inv) x = 1 / x;
  let y = x / (1 + Math.sqrt(1 + x * x));
  y = y / (1 + Math.sqrt(1 + y * y));
  const y2 = y * y;
  let s = 0; // série de Horner : 1 - y²/3 + y⁴/5 - …
  for (let n = 25; n >= 1; n -= 2) s = s * y2 + ((((n - 1) / 2) % 2) ? -1 : 1) / n;
  let a = 4 * y * s;
  if (inv) a = DEMI_PI - a;
  return neg ? -a : a;
}
export function atan2D(y, x) {
  if (x > 0) return atanD(y / x);
  if (x < 0) return y >= 0 ? atanD(y / x) + PI : atanD(y / x) - PI;
  return y > 0 ? DEMI_PI : y < 0 ? -DEMI_PI : 0;
}

const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
const r5 = (v) => Math.round(v * 1e5) / 1e5;
const r3 = (v) => Math.round(v * 1e3) / 1e3;

// ------------------------------------------------------------------ dimensions (mètres)
export const DIMENSIONS = Object.freeze({
  demi: 0.527,            // demi-largeur de piste (41,5 pouces)
  gouttiere: 0.235,       // largeur d'une gouttière
  profGouttiere: 0.0476,  // profondeur d'une gouttière (1 7/8 pouce), profil en arc de cercle
  quille1: 18.29,         // ligne de faute → quille 1
  ecart: 0.3048,          // 12 pouces entre quilles voisines
  rang: 0.264,            // écart entre deux rangées
  hQuille: 0.381, mQuille: 1.53, dQuille: 0.121, cgQuille: 0.14,
  rBoule: 0.1085, mBoule: 6.8, giration: 0.065,
  aire: 17.6,             // début de l'aire des quilles (même surface que la piste, frottement et rebond propres)
  murDebut: 17.2,         // début des murs latéraux (« kickbacks »)
  murX: 0.762,            // face intérieure des murs = bord extérieur des gouttières
  fosse: 19.158,          // fin de l'aire (34 3/16 pouces derrière la quille 1) : au-delà, la fosse
  profFosse: 0.35,        // fond de la fosse sous la piste
  rideau: 19.92,          // rideau arrière (amortisseur) au fond de la fosse
  hMur: 0.9,
});
const D = DIMENSIONS;

/** Réglages (mesurés par test-physique-balayage.mjs). Modifiables par opts.reglages pour les tests SEULEMENT :
 *  le serveur qui rejoue un lancer n'en passe jamais, sinon il ne calculerait pas la même chose que le navigateur. */
export const REGLAGES = Object.freeze({
  dt: 1 / 240, pasImage: 4, tMax: 9,
  gravite: 9.81,
  muHuile: 0.02, muSec: 0.20,
  finHuile: 12.0,         // fin de la zone huilée (au centre de la piste)
  rampeHuile: 1.6,        // longueur de la transition huile → sec (m)
  huileBords: 1.5,        // l'huile est plus courte de tant (m) sur les bords de la piste (motif « maison »)
  tourMin: 250, tourMax: 400, // régime de la boule (tr/min) selon |effet|
  axeMax: 0.75,           // « axis rotation » à effet maximal (rad) : part de rotation latérale
  tiltMax: 0.26,          // « axis tilt » à effet maximal (rad) : part de rotation autour de la verticale
  magnus: 0.003,          // coefficient de l'effet Magnus (N·s²/rad/m) — léger, comme demandé
  hLacher: 0.12,          // hauteur de chute supplémentaire pour un lâcher raté (lacher = 0)
  perteLacher: 0.05,      // perte de vitesse au lâcher pour lacher = 0
  amortiQuille: 2,        // amortissement angulaire des quilles (air + roulis) : 2 ramène Brooklyn de 47 à 30 %
  iterations: 4,
  // boule lente : à l'entrée de l'aire, rebonds (B = boule/quille, Q = quilles) et frottement boule/quille (F)
  // multipliés par kMou… à vMou m/s et moins, 1 à vDur et plus (linéaire entre les deux) ; vitesse À L'ENTRÉE DE
  // L'AIRE (≈ 85 % de la vitesse au lâcher). Mesuré : à 4 m/s, 0 % de strikes dans la poche au lieu de 75 %.
  vMou: 3.5, vDur: 5.5, kMouB: 1, kMouQ: 0.3, kMouF: 2, kMouA: 1,
  // frottements PAR PAIRE : B = boule, Q = quille, A = aire des quilles, M = mur, G = gouttière, F = fosse/rideau
  fBQ: 0.2, fQQ: 0.16, fQA: 0.6, fBA: 0.3, fQM: 0.2, fBG: 0.15, fQF: 0.6,
  // rebonds PAR PAIRE (P = piste, R = rideau)
  eBQ: 0.8, eQQ: 0.4, eQA: 0.35, eBP: 0.3, eQM: 0.2, eBG: 0.25, eQF: 0.18, eQR: 0.08,
});

// ------------------------------------------------------------------ matières
// Rapier combine les coefficients de deux colliders ; on impose la règle « Multiply » partout et on règle des valeurs
// PAR PAIRE (REGLAGES.f… / e…) : les coefficients par collider s'en déduisent (voir matieres()).
function matieres(P) {
  const fq = Math.sqrt(P.fQQ), fb = P.fBQ / fq, eq = Math.sqrt(P.eQQ), eb = P.eBQ / eq;
  return {
    f: { boule: fb, quille: fq, aire: P.fQA / fq, gouttiere: P.fBG / fb, mur: P.fQM / fq, fosse: P.fQF / fq, rideau: P.fQF / fq },
    e: { boule: eb, quille: eq, piste: P.eBP / eb, aire: P.eQA / eq, gouttiere: P.eBG / eb, mur: P.eQM / eq, fosse: P.eQF / eq, rideau: P.eQR / eq },
  };
}

/** Seuils (N) en dessous desquels un épisode de contact n'est pas un « choc » rendu à son.js / rendu.js. */
const SEUILS = {
  'boule-piste': 30, 'boule-quille': 40, 'quille-quille': 25, 'quille-piste': 40, 'quille-mur': 30,
  'boule-gouttiere': 30, 'boule-fosse': 60, 'quille-fosse': 80,
};

// ------------------------------------------------------------------ profil d'une quille (y, rayon) depuis la base
const PROFIL = [
  [0.000, 0.0258], [0.010, 0.0330], [0.030, 0.0420], [0.057, 0.0490], [0.085, 0.0560], [0.114, 0.0605],
  [0.140, 0.0590], [0.170, 0.0520], [0.200, 0.0400], [0.230, 0.0285], [0.254, 0.0230], [0.280, 0.0245],
  [0.305, 0.0290], [0.330, 0.0322], [0.355, 0.0290], [0.372, 0.0210], [0.381, 0.0100],
];
// Le PIED est un vrai cylindre Rapier (rayon 0,0258, 12 mm de haut) : une enveloppe convexe posée à plat sur un
// pavé « tremble » dans Rapier et une quille seule finissait par tomber d'elle-même ; le cylindre est parfaitement
// stable et s'endort (mesuré). Puis 4 enveloppes convexes : bas du ventre, ventre, col (cône), tête (indices des
// cercles du profil). Debout, seule la semelle touche l'aire (la 1re enveloppe commence à 10 mm).
const PIED = { r: 0.0258, h: 0.012 };
const MORCEAUX = [[1, 3], [3, 7], [7, 10], [10, 16]];
const COTES = 12; // cercles à 12 côtés

/** Les 10 emplacements, numérotés comme au bowling : 1 devant, puis 2-3, 4-5-6, 7-8-9-10 de GAUCHE à droite
 *  (vu du joueur). x positif = gauche → la 7 a le plus grand x. */
export function emplacements() {
  const out = [];
  let n = 0;
  for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++) out.push({ n: ++n, x: (r / 2 - i) * D.ecart, y: 0, z: D.quille1 + r * D.rang });
  return out;
}

// ------------------------------------------------------------------ chargement et précalculs
let R = null;       // le module Rapier
let PRE = null;     // descripteurs de formes réutilisés d'un lancer à l'autre

/**
 * Charge Rapier (WASM) une fois. `module` : le module @dimforge/rapier3d-deterministic-compat déjà importé (obligatoire).
 */
export async function initPhysique(module) {
  if (R) return R;
  if (!module) throw new Error("physique : initPhysique(RAPIER) attend le module Rapier importé");
  const m = module;
  const rap = m && typeof m.init === 'function' ? m : m.default;
  await rap.init();
  R = rap;
  PRE = precalculer();
  return R;
}

/** Masse et inerties d'une quille (solide de révolution du PROFIL, masse ramenée à 1,53 kg, CdG imposé à 0,14). */
function inertieQuille() {
  let m = 0, iAxe = 0, iTrav = 0;
  const N = 400, h = D.hQuille, yc = D.cgQuille;
  for (let k = 0; k < N; k++) {
    const y = (k + 0.5) * h / N;
    let j = 0;
    while (j < PROFIL.length - 2 && PROFIL[j + 1][0] < y) j++;
    const [y0, r0] = PROFIL[j], [y1, r1] = PROFIL[j + 1];
    const r = r0 + (r1 - r0) * (y - y0) / (y1 - y0);
    const dm = r * r * h / N; // ∝ π r² dy (π s'élimine)
    m += dm;
    iAxe += 0.5 * r * r * dm;
    iTrav += (0.25 * r * r + (y - yc) * (y - yc)) * dm;
  }
  const k = D.mQuille / m;
  return { axe: iAxe * k, trav: iTrav * k };
}

function precalculer() {
  // Enveloppes convexes de la quille (repère local : origine au centre de la base, y en haut)
  const cs = [], sn = [];
  for (let i = 0; i < COTES; i++) { cs.push(cosD(2 * PI * i / COTES)); sn.push(sinD(2 * PI * i / COTES)); }
  const enveloppes = MORCEAUX.map(([a, b]) => {
    const pts = [];
    for (let j = a; j <= b; j++) {
      const [y, r] = PROFIL[j];
      for (let i = 0; i < COTES; i++) pts.push(r * cs[i], y, r * sn[i]);
    }
    return new Float32Array(pts);
  });
  // Gouttière : arc de cercle passant par les deux bords (à y = 0) et le fond (y = -prof)
  const c = D.gouttiere / 2, s = D.profGouttiere, rg = (c * c + s * s) / (2 * s), th = atan2D(c, rg - s);
  const SEG = 8, segments = [];
  for (let i = 0; i < SEG; i++) {
    const a0 = -th + 2 * th * i / SEG, a1 = -th + 2 * th * (i + 1) / SEG;
    // points de l'arc (centre en (0, rg - s) relatif au fond, x relatif au milieu de la gouttière)
    const x0 = rg * sinD(a0), y0 = rg - s - rg * cosD(a0), x1 = rg * sinD(a1), y1 = rg - s - rg * cosD(a1);
    segments.push({ x0, y0, x1, y1 });
  }
  return { enveloppes, segments, inertie: inertieQuille() };
}

// ------------------------------------------------------------------ simulation d'un lancer
/** Frottement boule/piste au point (x, z) : huile plus longue au centre (motif « maison »), rampe, puis sec. */
function muPiste(P, x, z) {
  const bord = borne(Math.abs(x) / D.demi, 0, 1);
  const fin = P.finHuile + P.huileBords * (0.5 - bord * bord) * 2 / 3; // ≈ +0,5 m au centre, -1 m sur les bords
  const u = borne((z - fin) / P.rampeHuile + 0.5, 0, 1);
  const lisse = u * u * (3 - 2 * u);
  return P.muHuile + (P.muSec - P.muHuile) * lisse;
}

/**
 * Simule un lancer (synchrone, déterministe). Voir CONTRAT.md pour `debout`, `lancer` et le retour.
 * opts.leger = true : pas d'images ni de roulement (serveur, balayages) ; opts.reglages : surcharge (tests).
 */
export function simuler(debout, lancer, opts = {}) {
  if (!R) throw new Error('physique.js : attendre initPhysique() avant simuler()');
  const P = opts.reglages ? { ...REGLAGES, ...opts.reglages } : REGLAGES;
  const leger = !!opts.leger;
  const DT = P.dt, RB = D.rBoule;
  const { f: FROT, e: REBOND } = matieres(P);

  // ---- paramètres du lancer (bornés comme dans le contrat)
  const xJ = borne(+lancer.position || 0, -0.45, 0.45);
  const angle = borne(+lancer.angle || 0, -0.08, 0.08);
  const effet = borne(+lancer.effet || 0, -1, 1);
  const lacher = lancer.lacher === undefined ? 1 : borne(+lancer.lacher || 0, 0, 1);
  const v0 = borne(+lancer.vitesse || 0, 3, 10.5) * (1 - P.perteLacher * (1 - lacher));

  const monde = new R.World({ x: 0, y: -P.gravite, z: 0 });
  monde.timestep = DT;
  monde.numSolverIterations = P.iterations;
  const file = new R.EventQueue(true);
  const tags = new Map(); // handle de collider → { genre, n?, corps }
  const M = R.CoefficientCombineRule.Multiply;
  // groupes de collision (appartenance << 16 | filtre) : boule 1, quilles 2, décor 4, sol de la boule 8, sol des quilles 16
  const GR_BOULE = (1 << 16) | (1 | 2 | 4 | 8), GR_QUILLE = (2 << 16) | (1 | 2 | 4 | 16), GR_DECOR = (4 << 16) | 0xffff;
  const GR_SOL_BOULE = (8 << 16) | 1, GR_SOL_QUILLES = (16 << 16) | 2;
  const EVTS = R.ActiveEvents.CONTACT_FORCE_EVENTS;

  const fixe = (desc, genre, frot, rebond, groupes = GR_DECOR) => {
    desc.setFriction(frot).setFrictionCombineRule(M).setRestitution(rebond).setRestitutionCombineRule(M).setCollisionGroups(groupes);
    const col = monde.createCollider(desc);
    tags.set(col.handle, { genre, corps: -1 });
    return col;
  };

  // ---- décor (ordre fixe)
  const LONG0 = -1.5;
  // Piste + aire des quilles : UNE SEULE surface d'un bout à l'autre (aucune arête à franchir : une marche, même de
  // 0,5 mm, faisait décoller la boule de 40 cm par contact spéculatif sur l'arête — mesuré), en DEUX colliders
  // superposés que les groupes de collision séparent : l'un ne voit que la boule (frottement mis à jour à chaque pas
  // selon sa position : huile, sec, aire), l'autre ne voit que les quilles (frottement et rebond fixes).
  const sol = () => R.ColliderDesc.cuboid(D.demi, (D.profFosse + 0.05) / 2, (D.fosse - LONG0) / 2)
    .setTranslation(0, -(D.profFosse + 0.05) / 2, (D.fosse + LONG0) / 2);
  const piste = fixe(sol(), 'piste', P.muHuile / FROT.boule, REBOND.piste, GR_SOL_BOULE);
  fixe(sol(), 'aire', FROT.aire, REBOND.aire, GR_SOL_QUILLES);
  // gouttières : SEG tronçons plans orientés le long de z
  for (const cote of [1, -1]) {
    const xm = cote * (D.demi + D.gouttiere / 2);
    for (const sg of PRE.segments) {
      const dx = sg.x1 - sg.x0, dy = sg.y1 - sg.y0, L = Math.sqrt(dx * dx + dy * dy);
      const ep = 0.02; // épaisseur ; la face SUPÉRIEURE est la corde de l'arc
      const nx = -dy / L, ny = dx / L; // normale vers le haut
      const cx = xm + cote * (sg.x0 + sg.x1) / 2 - cote * nx * ep / 2, cy = (sg.y0 + sg.y1) / 2 - ny * ep / 2;
      const a = atan2D(dy, dx) * cote; // rotation autour de z
      const q = { x: 0, y: 0, z: sinD(a / 2), w: cosD(a / 2) };
      fixe(R.ColliderDesc.cuboid(L / 2 + 0.002, ep / 2, (D.fosse - LONG0) / 2).setTranslation(cx, cy, (D.fosse + LONG0) / 2).setRotation(q),
        'gouttiere', FROT.gouttiere, REBOND.gouttiere);
    }
    // rebord extérieur de la gouttière (séparation entre pistes), avant les murs
    fixe(R.ColliderDesc.cuboid(0.05, 0.04, (D.murDebut - LONG0) / 2).setTranslation(cote * (D.murX + 0.05), 0.04, (D.murDebut + LONG0) / 2),
      'mur', FROT.mur, REBOND.mur);
    // mur latéral de l'aire (« kickback »)
    const zM0 = D.murDebut, zM1 = D.rideau + 0.1;
    fixe(R.ColliderDesc.cuboid(0.05, (D.hMur + D.profFosse) / 2, (zM1 - zM0) / 2)
      .setTranslation(cote * (D.murX + 0.05), (D.hMur - D.profFosse) / 2, (zM1 + zM0) / 2), 'mur', FROT.mur, REBOND.mur);
  }
  // fond de fosse et rideau
  fixe(R.ColliderDesc.cuboid(D.murX + 0.1, 0.05, (D.rideau - D.fosse) / 2 + 0.1)
    .setTranslation(0, -D.profFosse - 0.05, (D.rideau + D.fosse) / 2), 'fosse', FROT.fosse, REBOND.fosse);
  fixe(R.ColliderDesc.cuboid(D.murX + 0.1, (D.hMur + D.profFosse) / 2, 0.05)
    .setTranslation(0, (D.hMur - D.profFosse) / 2, D.rideau + 0.05), 'rideau', FROT.rideau, REBOND.rideau);

  // ---- boule
  const sA = sinD(angle), cA = cosD(angle);
  const dirX = -sA, dirZ = cA;                     // angle positif = vers la droite du joueur = -x
  const hChute = 0.004 + P.hLacher * (1 - lacher);
  const a = Math.abs(effet), sg = effet < 0 ? -1 : 1;
  const tours = (P.tourMin + (P.tourMax - P.tourMin) * a) * PI / 30; // rad/s
  const phi = P.axeMax * a, tau = P.tiltMax * a;
  const cP = cosD(phi), sP = sinD(phi), cT = cosD(tau), sT = sinD(tau);
  // axe de roulement r = y × d ; axe latéral = -d (crochet vers +x pour effet > 0) ; inclinaison sur +y
  const rX = dirZ, rZ = -dirX;
  const w = {
    x: tours * (cT * cP * rX - sg * cT * sP * dirX),
    y: tours * sg * sT,
    z: tours * (cT * cP * rZ - sg * cT * sP * dirZ),
  };
  const iB = D.mBoule * D.giration * D.giration;
  const corpsBoule = monde.createRigidBody(R.RigidBodyDesc.dynamic()
    .setTranslation(-xJ, RB + hChute, 0.15)
    .setLinvel(v0 * dirX, 0, v0 * dirZ).setAngvel(w)
    .setCcdEnabled(true));
  const colBoule = monde.createCollider(R.ColliderDesc.ball(RB)
    .setMassProperties(D.mBoule, { x: 0, y: 0, z: 0 }, { x: iB, y: iB, z: iB }, { x: 0, y: 0, z: 0, w: 1 })
    .setFriction(FROT.boule).setFrictionCombineRule(M).setRestitution(REBOND.boule).setRestitutionCombineRule(M)
    .setCollisionGroups(GR_BOULE)
    .setActiveEvents(EVTS).setContactForceEventThreshold(1), corpsBoule);
  tags.set(colBoule.handle, { genre: 'boule', corps: 0 });

  // ---- quilles (ordre de `debout`)
  const I = PRE.inertie;
  const quilles = debout.map((d, i) => {
    const rot = +d.rot || 0;
    const corps = monde.createRigidBody(R.RigidBodyDesc.dynamic()
      .setTranslation(+d.x, 0, +d.z).setRotation({ x: 0, y: sinD(rot / 2), z: 0, w: cosD(rot / 2) })
      .setAdditionalMassProperties(D.mQuille, { x: 0, y: D.cgQuille, z: 0 }, { x: I.trav, y: I.axe, z: I.trav }, { x: 0, y: 0, z: 0, w: 1 })
      .setAngularDamping(P.amortiQuille).setLinearDamping(0.05));
    // (pas de setSleeping(true) : une quille créée endormie traverse l'aire au premier réveil — mesuré)
    const cols = [];
    for (let k = -1; k < PRE.enveloppes.length; k++) {
      const forme = k < 0 ? R.ColliderDesc.cylinder(PIED.h / 2, PIED.r).setTranslation(0, PIED.h / 2, 0)
        : R.ColliderDesc.convexHull(PRE.enveloppes[k]);
      const col = monde.createCollider(forme.setDensity(0)
        .setFriction(FROT.quille).setFrictionCombineRule(M).setRestitution(REBOND.quille).setRestitutionCombineRule(M)
        .setCollisionGroups(GR_QUILLE)
        .setActiveEvents(EVTS).setContactForceEventThreshold(1), corps);
      tags.set(col.handle, { genre: 'quille', n: d.n, corps: i + 1 });
      cols.push(col);
    }
    return { n: d.n, corps, cols, sortie: false, tFosse: -1, fosse: false };
  });

  // ---- boucle
  const images = [], roulement = [], contacts = [];
  const episodes = new Map(); // "h1|h2" → { dernier, debut, c (contact) }
  const parCorps = new Map(); // "pas|corpsA|corpsB|type" → contact déjà émis ce pas-ci
  let pas = 0, t = 0, calme = 0, surAire = false, gouttiere = false, bouleFinie = false, tFosseBoule = -1, zone = null;
  const nPasMax = Math.round(P.tMax / DT);

  const typeDe = (ta, tb) => {
    if (ta.genre !== 'boule' && ta.genre !== 'quille') [ta, tb] = [tb, ta];
    if (tb.genre === 'boule') [ta, tb] = [tb, ta];
    if (ta.genre === 'boule') {
      if (tb.genre === 'quille') return ['boule-quille', ta, tb];
      if (tb.genre === 'piste' || tb.genre === 'aire') return ['boule-piste', ta, tb];
      if (tb.genre === 'gouttiere') return ['boule-gouttiere', ta, tb];
      return ['boule-fosse', ta, tb]; // fosse, rideau, murs : « le fond de la machine »
    }
    if (ta.genre === 'quille') {
      if (tb.genre === 'quille') return ['quille-quille', ta, tb];
      if (tb.genre === 'mur' || tb.genre === 'rideau') return ['quille-mur', ta, tb];
      if (tb.genre === 'fosse') return ['quille-fosse', ta, tb];
      return ['quille-piste', ta, tb]; // piste, aire, gouttière
    }
    return [null];
  };

  const imager = () => {
    const pb = corpsBoule.translation(), qb = corpsBoule.rotation();
    images.push({
      t: r5(t),
      boule: [r5(pb.x), r5(pb.y), r5(pb.z), r5(qb.x), r5(qb.y), r5(qb.z), r5(qb.w)],
      quilles: quilles.map((q) => {
        const p = q.corps.translation(), r = q.corps.rotation();
        return [r5(p.x), r5(p.y), r5(p.z), r5(r.x), r5(r.y), r5(r.z), r5(r.w)];
      }),
    });
    const v = corpsBoule.linvel(), o = corpsBoule.angvel();
    const vit = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    // vitesse du point de contact : v + ω × (0, -R, 0)
    const gx = v.x + RB * o.z, gz = v.z - RB * o.x;
    const g = Math.sqrt(gx * gx + gz * gz);
    roulement.push({ t: r5(t), vitesse: r3(vit), glisse: zone ? r3(borne(g / Math.max(vit, 0.3), 0, 1)) : 0, zone });
  };
  if (!leger) imager();

  const evts = [];
  while (pas < nPasMax) {
    // huile : frottement de la piste selon la position de la boule
    const pb = corpsBoule.translation();
    if (pb.z < D.aire) piste.setFriction(muPiste(P, pb.x, pb.z) / FROT.boule);
    else if (!surAire) {
      surAire = true;
      piste.setFriction(P.fBA / FROT.boule);
      // Boule LENTE : chocs plus « mous ». Les rebonds boule/quille et quille/quille baissent avec la vitesse de la
      // boule à l'entrée de l'aire (une seule fois, d'après l'état : déterministe). Sans cela un moteur rigide est
      // invariant d'échelle et une boule à 4 m/s renversait autant qu'à 8 m/s (mesuré).
      const v = corpsBoule.linvel(), vit = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      const k = borne((vit - P.vMou) / (P.vDur - P.vMou), 0, 1);
      colBoule.setRestitution(REBOND.boule * (P.kMouB + (1 - P.kMouB) * k));
      colBoule.setFriction(FROT.boule * (P.kMouF + (1 - P.kMouF) * k));
      piste.setFriction(P.fBA * (P.kMouA + (1 - P.kMouA) * k) / (FROT.boule * (P.kMouF + (1 - P.kMouF) * k)));
      const eQ = REBOND.quille * (P.kMouQ + (1 - P.kMouQ) * k);
      for (const q of quilles) for (const c of q.cols) c.setRestitution(eQ);
    }
    // Magnus léger, tant que la boule est sur la piste ou l'aire
    corpsBoule.resetForces(false);
    if (!bouleFinie && !gouttiere && pb.z < D.fosse) {
      const v = corpsBoule.linvel(), o = corpsBoule.angvel(), k = P.magnus;
      corpsBoule.addForce({ x: k * (o.y * v.z - o.z * v.y), y: k * (o.z * v.x - o.x * v.z), z: k * (o.x * v.y - o.y * v.x) }, false);
    }

    monde.step(file);
    pas++;
    t = pas * DT;

    // ---- contacts
    evts.length = 0;
    file.drainContactForceEvents((e) => { evts.push(e.collider1(), e.collider2(), e.totalForceMagnitude()); });
    zone = null;
    for (let i = 0; i < evts.length; i += 3) {
      const h1 = evts[i], h2 = evts[i + 1], f = evts[i + 2];
      const t1 = tags.get(h1), t2 = tags.get(h2);
      if (!t1 || !t2) continue;
      const [type, ta, tb] = typeDe(t1, t2);
      if (!type) continue;
      if (ta.genre === 'boule') {
        if (tb.genre === 'piste' || tb.genre === 'aire') zone = 'piste';
        else if (tb.genre === 'gouttiere' && zone !== 'piste') zone = 'gouttiere';
      }
      const cle = h1 < h2 ? h1 + '|' + h2 : h2 + '|' + h1;
      const ep = episodes.get(cle);
      if (ep && pas - ep.dernier <= 2) {
        ep.dernier = pas;
        if (pas - ep.debut < 4 && f > ep.c.force) ep.c.force = f;
        continue;
      }
      // nouvel épisode ; fusion avec un épisode du même couple de corps commencé à ce pas
      const ccle = pas + '|' + Math.min(ta.corps, tb.corps) + '|' + Math.max(ta.corps, tb.corps) + '|' + type;
      let c = parCorps.get(ccle);
      if (c) { if (f > c.force) c.force = f; }
      else {
        // position : point de contact du solveur, sinon milieu des deux corps
        let px = 0, py = 0, pz = 0, ok = false;
        monde.narrowPhase.contactPair(h1, h2, monde.bodies, (man) => {
          if (!ok && man.numSolverContacts() > 0) { const p = man.solverContactPoint(0); px = p.x; py = p.y; pz = p.z; ok = true; }
        });
        if (!ok) {
          const ca = ta.corps === 0 ? corpsBoule : ta.corps > 0 ? quilles[ta.corps - 1].corps : null;
          const p = ca ? ca.translation() : { x: 0, y: 0, z: 0 };
          px = p.x; py = p.y; pz = p.z;
        }
        c = { t: r5(t), type, force: f, x: px, y: py, z: pz };
        if (ta.genre === 'quille') c.n = ta.n;
        else if (tb.genre === 'quille') c.n = tb.n;
        if (type === 'quille-quille') c.n2 = tb.n;
        contacts.push(c);
        parCorps.set(ccle, c);
      }
      episodes.set(cle, { dernier: pas, debut: pas, c });
    }

    // ---- boule : gouttière, fosse
    const p = corpsBoule.translation();
    if (!gouttiere && !bouleFinie && p.z < D.quille1 - 0.3 && Math.abs(p.x) > D.demi && p.y < RB - 0.01) gouttiere = true;
    if (!bouleFinie && (p.z > D.fosse + 0.05 && p.y < RB - 0.05 || p.y < -0.5 || p.z > D.rideau + 0.5)) {
      if (tFosseBoule < 0) tFosseBoule = t;
      if (t - tFosseBoule > 0.5) { corpsBoule.setEnabled(false); bouleFinie = true; }
    }
    // ---- quilles : fosse, sorties
    let bougent = false;
    for (const q of quilles) {
      if (q.sortie) continue;
      const pq = q.corps.translation();
      const dehors = Math.abs(pq.x) > D.murX + 0.3 || pq.y < -D.profFosse - 0.5 || pq.y > 3 || pq.z > D.rideau + 0.6 || pq.z < 12;
      if (pq.z > D.fosse + 0.02 && pq.y < -0.1) { q.fosse = true; if (q.tFosse < 0) q.tFosse = t; }
      if (dehors || (q.fosse && t - q.tFosse > 0.6)) { q.corps.setEnabled(false); q.sortie = true; q.fosse = q.fosse || !dehors; continue; }
      if (q.corps.isSleeping()) continue;
      const v = q.corps.linvel(), o = q.corps.angvel();
      if (v.x * v.x + v.y * v.y + v.z * v.z > 0.0025 || o.x * o.x + o.y * o.y + o.z * o.z > 0.09) bougent = true;
    }

    if (!leger && pas % P.pasImage === 0) imager();

    // ---- fin : boule partie (fosse, ou gouttière passée) et plus rien ne bouge
    const partie = bouleFinie || p.z > D.fosse + 0.05 || (gouttiere && p.z > D.fosse);
    calme = partie && !bougent ? calme + DT : 0;
    if (calme >= 0.3) break;
  }
  if (!leger && pas % P.pasImage !== 0) imager();

  // ---- résultat
  const COS10 = 0.984807753012208;
  const restent = [];
  quilles.forEach((q, i) => {
    if (q.sortie || q.fosse) return;
    const p = q.corps.translation(), r = q.corps.rotation();
    const haut = 1 - 2 * (r.x * r.x + r.z * r.z); // composante y de l'axe de la quille
    const surAire = Math.abs(p.x) < D.demi && p.z > D.aire - 1 && p.z < D.fosse && p.y > -0.02 && p.y < 0.03;
    if (haut >= COS10 && surAire) {
      let rot = 2 * atan2D(r.y, r.w);
      if (rot > PI) rot -= 2 * PI; else if (rot <= -PI) rot += 2 * PI;
      restent.push({ n: debout[i].n, x: r5(p.x), z: r5(p.z), rot: r5(rot) });
    }
  });
  const chocs = contacts.filter((c) => c.force >= SEUILS[c.type]);
  for (const c of chocs) { c.force = Math.round(c.force * 10) / 10; c.x = r3(c.x); c.y = r3(c.y); c.z = r3(c.z); }
  const premier = chocs.find((c) => c.type === 'boule-quille');
  const res = {
    images, contacts: chocs, roulement, restent,
    tombees: debout.length - restent.length,
    gouttiere,
    duree: r5(t),
    impactT: premier ? premier.t : null,
  };
  file.free();
  monde.free();
  return res;
}
