// @ts-nocheck — moteur sonore Web Audio repris tel quel du prototype validé (maquettes/jeux/bowling/son.js), en JavaScript.
// Intégration v2 (18/10/2026) : modules ESM empaquetés par Vite (aucun CDN), chargés à la demande avec le bowling.
/* eslint-disable */
/* =====================================================================================
   son.js — MOTEUR SONORE du bowling Gearbox (prototype v2, 16/10/2026)

   Aucun fichier audio : tout est SYNTHÉTISÉ en Web Audio (rien à héberger, aucune licence). Le premier prototype
   jouait des bruits blancs filtrés posés à sec sur la sortie : c'est ce qui le rendait « nullissime ». Ici, quatre
   idées font la différence :

   1. UNE SALLE. Tout passe par une réverbération à convolution dont la réponse impulsionnelle est CALCULÉE (grand
      hall carrelé, ~1,75 s, réflexions précoces discrètes puis queue dense qui s'assombrit). Chaque son choisit son
      dosage sec / réverbéré : un son proche est surtout sec, un son lointain (fosse, autres pistes) surtout mouillé.
      C'est ce rapport, plus qu'un volume, qui place les sons dans l'espace.
   2. DES OBJETS QUI RÉSONNENT. Les quilles ne sont pas du bruit : synthèse MODALE (6 sinusoïdes inharmoniques
      amorties, 0,8–4 kHz, comme une quille d'érable plastifiée), chaque quille avec SON timbre (n° 1 à 10), chaque
      choc avec ses amplitudes de modes (le point d'impact change), plus un transitoire de bruit (le vernis).
   3. DES ÉVÉNEMENTS QUI S'ACCUMULENT. Un strike = 40 contacts en 0,3 s. Limiteur de polyphonie (on garde les 18 chocs
      les plus forts, on vole le plus faible), gain par voix qui baisse avec la densité (somme en énergie, pas en
      amplitude), et une couche de « fracas » pré-calculée qui remplit la rafale au-delà du budget.
   4. DES GENS… SANS VOIX. Aucune voix synthétisée (17/10/2026 : les chœurs, cris et chants à formants sonnaient
      « film d'horreur », Théo les a fait retirer). La salle vit par ce qui ne parle pas : applaudissements (de la
      salve nourrie aux quelques mains polies), sifflets à roulette et aux doigts, batucada, cornes, pétards,
      grésillement du barbecue de la manif, et une rumeur de fond grave et diffuse, sans aucun formant identifiable.

   Graphe :
     sources ─► [passe-bas de distance] ─► panoramique ─┬─► sec ─────► bus (effets | foule | ambiance) ─┐
                                                         └─► envoi ───► réverbération (convolution) ─────┤
                                                              maître ─► compresseur ─► limiteur ─► sortie ◄┘
   Performance : les bruits (blanc, rose, brun), la réponse de salle, les applaudissements et le fracas sont calculés
   UNE fois (les deux derniers en différé, après l'activation). Chaque son est une « grappe » de nœuds jetables,
   arrêtée et déconnectée à sa fin.

   API : exactement celle de CONTRAT.md (creerSon, activer, theme, ambiance, lacher, roulement, contact, resultat,
   machine), plus deux ajouts facultatifs pour la table de mixage : S.mix({...}) et S.diagnostic().
   ===================================================================================== */

/* -------------------------------------------------------------------------------------
   RÉGLAGES — tout ce qui se retouche à l'oreille est ici.
   ------------------------------------------------------------------------------------- */
const REGLAGES = {
  mix: { general: 0.85, effets: 1, foule: 0.8, ambiance: 0.4 },      // volumes par défaut des bus
  envoi: { effets: 0.22, foule: 0.42, ambiance: 0.6 },                // part envoyée dans la salle, par défaut
  salle: { duree: 1.9, rt60: 1.75 },                                  // réponse impulsionnelle générée
  niveaux: { chocs: 0.24, lacher: 0.45, roulement: 0.3, fracas: 0.95, foule: 0.7, machine: 0.5 },
  poly: { chocs: 18, fenetre: 0.15, seuilFracas: 3 },                 // budget de voix, fenêtre de densité (s)
  latence: 0.012,                                                     // marge avant l'instant de jeu (s)
};

/** Échelles de force (N, telles que Rapier les donne) : [seuil d'audibilité, force qui sature l'intensité].
 *  En dessous du seuil : pas de son (une quille posée pèse ~15 N, la boule ~67 N en roulant).
 *  Courbe LOG entre les deux, puis plafonnement : de 25 N à 4 000 N, c'est 0 → 1. À valider sur de vrais lancers. */
const ECHELLE_FORCE = {
  'boule-piste': [80, 4000],
  'boule-quille': [25, 4000],
  'quille-quille': [6, 1500],
  'quille-piste': [25, 1500],
  'quille-mur': [6, 1200],
  'boule-gouttiere': [25, 3000],
  'boule-fosse': [25, 3000],
  'quille-fosse': [6, 1000],
};

/** Modes d'une quille (érable plastifié, 1,53 kg) : rapports inharmoniques, amplitudes, T60 (s). Le bois est très
 *  amorti (≤ 0,25 s) — c'est ce qui donne le « tock » et pas le « ding » d'une cloche. f0 ~ 820 Hz → modes 0,8–3,9 kHz. */
const QUILLE = {
  f0: 820,
  rapports: [1.0, 1.71, 2.37, 3.02, 3.86, 4.75],
  amplitudes: [1.0, 0.72, 0.55, 0.42, 0.3, 0.2],
  t60: [0.24, 0.17, 0.13, 0.1, 0.075, 0.055],
};

/* -------------------------------------------------------------------------------------
   Petits outils
   ------------------------------------------------------------------------------------- */
const alea = Math.random;
const entre = (a, b) => a + alea() * (b - a);
const borne = (x, a, b) => Math.min(b, Math.max(a, x));
const dB = (d) => Math.pow(10, d / 20);
const choisir = (l) => l[Math.floor(alea() * l.length)];
/** x physique (positif = à GAUCHE du joueur) → panoramique (négatif = gauche). Jamais tout à fait aux bords. */
const panDe = (x) => (x == null || !isFinite(x) ? entre(-0.2, 0.2) : borne(-x / 0.9, -1, 1) * 0.75);
/** Force brute (N) → intensité 0..1 (courbe log, plafonnée) ; null si inaudible. Sans force : 0,55. */
function intensite(type, force) {
  if (force == null || !isFinite(force)) return 0.55;
  const [f0, fmax] = ECHELLE_FORCE[type] || [10, 2000];
  if (force < f0) return null;
  return borne(Math.log(force / f0) / Math.log(fmax / f0), 0, 1);
}
/** Intensité → gain : 30 dB de dynamique entre le plus léger et le plus violent. */
const niveauDe = (i) => dB(-30 + 30 * i);

/* -------------------------------------------------------------------------------------
   DSP hors ligne : tampons calculés une seule fois (Float32Array)
   ------------------------------------------------------------------------------------- */
function bruitBlanc(n) { const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = alea() * 2 - 1; return d; }
/** Bruit rose (filtre de Paul Kellet) : -3 dB/octave, le « souffle » naturel. */
function bruitRose(n) {
  const d = new Float32Array(n); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = alea() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return d;
}
/** Bruit brun (intégré, -6 dB/octave) sans dérive continue : la matière du grondement. */
function bruitBrun(n) {
  const d = new Float32Array(n); let b = 0, m = 0;
  for (let i = 0; i < n; i++) { b = (b + 0.02 * (alea() * 2 - 1)) / 1.02; d[i] = b * 3.5; m += d[i]; }
  m /= n; for (let i = 0; i < n; i++) d[i] -= m;
  return d;
}
/** Rend un tampon bouclable : la fin est fondue (à puissance constante) dans le début → aucun clic à la boucle. */
function bouclable(d, nf) {
  const n = d.length - nf, o = new Float32Array(n); o.set(d.subarray(0, n));
  for (let i = 0; i < nf; i++) { const x = i / nf; o[i] = d[i] * Math.sqrt(x) + d[n + i] * Math.sqrt(1 - x); }
  return o;
}
function normaliser(canaux, crete) {
  let m = 1e-9; for (const c of canaux) for (let i = 0; i < c.length; i++) m = Math.max(m, Math.abs(c[i]));
  const k = crete / m; for (const c of canaux) for (let i = 0; i < c.length; i++) c[i] *= k;
}
/** Passe-bande RBJ (0 dB au centre). */
function coefPasseBande(f, q, sr) {
  const w = 2 * Math.PI * f / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
  return { b0: al / a0, b2: -al / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - al) / a0 };
}
const gainsPan = (pan) => [Math.cos((pan + 1) * Math.PI / 4), Math.sin((pan + 1) * Math.PI / 4)];

/** RÉPONSE IMPULSIONNELLE d'un grand hall carrelé (stéréo). Trois étages :
 *  - réflexions précoces discrètes (sol, murs latéraux, plafond, fond) alternées gauche / droite : la taille de la
 *    salle se lit dans ces 90 premières ms ;
 *  - queue diffuse qui se densifie (70 ms) puis décroît exponentiellement (RT60 ≈ 1,75 s : carrelage + volume) ;
 *  - assombrissement progressif (passe-bas qui descend de ~10 kHz à 1,6 kHz) : les aigus meurent avant les graves,
 *    sinon c'est une réverbération « métallique » de mauvais plugin. Canaux décorrélés → largeur. */
function rendreSalle(sr, duree, rt60) {
  const n = Math.floor(sr * duree), L = new Float32Array(n), R = new Float32Array(n);
  const precoces = [[0.009, 0.55, 0.35], [0.014, 0.3, 0.5], [0.021, 0.42, 0.28], [0.027, 0.25, 0.38], [0.036, 0.3, 0.22],
    [0.044, 0.2, 0.3], [0.058, 0.22, 0.16], [0.071, 0.14, 0.2], [0.086, 0.12, 0.1], [0.104, 0.08, 0.1]];
  for (const [t, gl, gr] of precoces) {
    const i = Math.floor(t * sr), s = alea() < 0.5 ? -1 : 1;
    for (let k = 0; k < 4; k++) { const v = s * Math.exp(-k / 1.5) * (1 - k * 0.1); L[i + k] += gl * v; R[i + k + 1] += gr * v; }
  }
  const debut = 0.016, k = 6.91 / rt60; let lL = 0, lR = 0, env = 0, a = 0;
  for (let i = Math.floor(debut * sr); i < n; i++) {
    if ((i & 31) === 0 || !env) { // enveloppe et filtre recalculés tous les 32 échantillons (0,7 ms) : 30× moins de Math.exp
      const t = i / sr, montee = Math.min(1, (t - debut) / 0.07), fin = Math.min(1, (n - i) / (0.05 * sr));
      env = Math.exp(-k * t) * montee * fin * 0.72 + 1e-12;
      a = Math.exp(-2 * Math.PI * (1600 + 9000 * Math.exp(-t / 0.55)) / sr);
    }
    lL = (1 - a) * (alea() * 2 - 1) + a * lL; lR = (1 - a) * (alea() * 2 - 1) + a * lR;
    L[i] += lL * env; R[i] += lR * env;
  }
  return [L, R];
}

/** APPLAUDISSEMENTS (stéréo, bouclable) : 26 personnes, chacune avec SA cadence (3,4–6 Hz), SON timbre de mains
 *  (résonance 0,85–2,5 kHz, plus ou moins creuse) et SA place dans la salle. Un clap = bruit très court passé dans
 *  la résonance de la personne + un peu de bruit brut (le « claquement »). Le tampon est une texture stable ; la
 *  forme (montée, tenue, extinction) est donnée au jeu par une enveloppe. */
function rendreApplaudissements(sr, duree = 4, personnes = 26) {
  const n = Math.floor(sr * duree), L = new Float32Array(n), R = new Float32Array(n);
  for (let p = 0; p < personnes; p++) {
    const cadence = entre(3.4, 6), c = coefPasseBande(entre(850, 2500), entre(1.2, 4), sr), tau = entre(0.005, 0.014) * sr;
    const [gl, gr] = gainsPan(entre(-0.95, 0.95)), niv = entre(0.45, 1);
    let t = alea() / cadence;
    while (t < duree) {
      const i0 = Math.floor(t * sr), len = Math.floor(tau * 5.5), g = niv * entre(0.7, 1), dec = Math.exp(-1 / tau);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0, env = 0;
      for (let i = 0; i < len; i++) {
        env = i < 24 ? i / 24 : env * dec; const x = (alea() * 2 - 1) * env;
        const y = c.b0 * x + c.b2 * x2 - c.a1 * y1 - c.a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y;
        const s = (y * 0.85 + x * 0.12) * g, j = (i0 + i) % n; // repli circulaire : la boucle est parfaite
        L[j] += s * gl; R[j] += s * gr;
      }
      t += (1 / cadence) * entre(0.82, 1.18);
    }
  }
  normaliser([L, R], 0.9);
  return [L, R];
}

/** FRACAS de strike (stéréo, 1,7 s) : la gerbe de quilles AU-DELÀ du budget de polyphonie. Processus de Poisson dont
 *  le taux s'effondre (240 chocs/s au début, constante 0,2 s, puis une traîne) ; chaque grain = 4 modes de quille
 *  (phaseur complexe amorti, quille au hasard) + claquement du vernis ; puis les chutes sourdes dans la fosse. */
function rendreFracas(sr, duree = 1.7) {
  const n = Math.floor(sr * duree), L = new Float32Array(n), R = new Float32Array(n);
  const taux = (t) => 240 * Math.exp(-t / 0.2) + 22 * Math.exp(-t / 0.8), tMax = 262;
  let t = 0;
  while (t < duree - 0.25) {
    t += -Math.log(1 - alea()) / tMax;
    if (alea() > taux(t) / tMax) continue;
    const i0 = Math.floor(t * sr), amp = entre(0.25, 1) * Math.exp(-t / 0.45), [gl, gr] = gainsPan(entre(-0.8, 0.8));
    const f0 = entre(760, 1020);
    for (let k = 0; k < 4; k++) {
      const f = f0 * QUILLE.rapports[k] * entre(0.99, 1.01), a = amp * QUILLE.amplitudes[k] * entre(0.4, 1.3);
      const tau = (QUILLE.t60[k] / 6.91) * sr * entre(0.8, 1.2), len = Math.min(n - i0, Math.floor(tau * 6.91));
      const w = 2 * Math.PI * f / sr, d = Math.exp(-1 / tau), cr = d * Math.cos(w), ci = d * Math.sin(w);
      let zr = a, zi = 0;
      for (let j = 0; j < len; j++) { const nr = zr * cr - zi * ci; zi = zr * ci + zi * cr; zr = nr; L[i0 + j] += zi * gl; R[i0 + j] += zi * gr; }
    }
    for (let j = 0; j < 40 && i0 + j < n; j++) { const v = (alea() * 2 - 1) * amp * 0.6 * Math.exp(-j / 8); L[i0 + j] += v * gl; R[i0 + j] += v * gr; }
  }
  const a = Math.exp(-2 * Math.PI * 350 / sr);
  for (let k = 0; k < 9; k++) {
    const t0 = entre(0.18, 1.3), i0 = Math.floor(t0 * sr), amp = 1.4 * Math.exp(-t0 / 1), [gl, gr] = gainsPan(entre(-0.6, 0.6));
    let y = 0;
    for (let j = 0; j < 0.08 * sr && i0 + j < n; j++) { y = (1 - a) * (alea() * 2 - 1) + a * y; const v = y * amp * Math.exp(-j / (0.018 * sr)); L[i0 + j] += v * gl; R[i0 + j] += v * gr; }
  }
  normaliser([L, R], 0.95);
  return [L, R];
}

/* -------------------------------------------------------------------------------------
   GRAPPE : un son = un paquet de nœuds jetables, arrêtés puis déconnectés à la fin
   ------------------------------------------------------------------------------------- */
class Grappe {
  constructor(ctx) { this.ctx = ctx; this.noeuds = []; this.sources = []; this.sortie = null; this.minuteur = 0; this.libre = false; }
  n(x) { this.noeuds.push(x); return x; }
  s(x) { this.sources.push(x); return this.n(x); }
  /** Arrête toutes les sources à t, puis déconnecte tout (un peu après, pour laisser filer les queues). */
  fin(t) {
    for (const s of this.sources) { try { s.stop(t); } catch (e) { /* déjà arrêtée */ } }
    clearTimeout(this.minuteur);
    this.minuteur = setTimeout(() => this.liberer(), Math.max(0, (t - this.ctx.currentTime) * 1000) + 300);
  }
  liberer() {
    if (this.libre) return; this.libre = true;
    for (const x of this.noeuds) { try { x.disconnect(); } catch (e) { /* rien */ } }
    this.noeuds.length = 0; this.sources.length = 0;
  }
  /** Coupe vite (vol de voix, arrêt d'ambiance) : fondu exponentiel puis arrêt. */
  couper(tau = 0.012) {
    const t = this.ctx.currentTime;
    if (this.sortie) {
      const g = this.sortie.gain;
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
      g.setTargetAtTime(0, t, tau);
    }
    this.fin(t + tau * 7);
  }
}

/* =====================================================================================
   LE MOTEUR (créé au premier S.activer(true), c'est-à-dire pendant un geste de l'utilisateur)
   ===================================================================================== */
class Moteur {
  constructor(etat) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const c = this.ctx = new AC({ latencyHint: 'interactive' });
    this.etat = etat; this.tampons = {}; this.courbes = {};

    // Chaîne maître : un compresseur doux qui « colle » le mélange (comme la salle elle-même), puis un limiteur dur
    // qui garantit qu'un turkey en pleine manif ne sature jamais la carte son.
    this.maitre = c.createGain();
    const comp = this.comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.22;
    const lim = this.lim = c.createDynamicsCompressor();
    lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    this.analyseur = c.createAnalyser(); this.analyseur.fftSize = 2048; this.mesure = new Float32Array(2048);
    this.maitre.connect(comp).connect(lim); lim.connect(c.destination); lim.connect(this.analyseur);

    // La salle.
    this.salle = c.createConvolver(); this.salle.buffer = this.banque('salle');
    const retour = c.createGain(); retour.gain.value = 0.9; this.salle.connect(retour).connect(this.maitre);

    // Les trois bus : chacun a une entrée sèche et une entrée vers la salle, réglées ensemble par le mixage.
    this.bus = {};
    for (const nom of ['effets', 'foule', 'ambiance']) {
      const sec = c.createGain(), mouille = c.createGain(); sec.connect(this.maitre); mouille.connect(this.salle);
      this.bus[nom] = { sec, mouille, envoi: REGLAGES.envoi[nom] };
    }
    this.appliquerMix(etat.mix);

    // Polyphonie des chocs.
    this.voix = []; this.rafale = []; this.abandons = 0; this.vols = 0; this.fracasEnCours = null; this.dernierFracas = -9;
    this.derniers = {}; this.lot = { p: -1e9, t0: 0 };
    // Roulement.
    this.roul = null; this.odometre = 0; this.dernierRoulP = 0; this.dernierLacher = -9;
    // Ambiance.
    this.amb = null; this.horloge = 0;

    // Préchauffage différé : un tampon par temps mort du navigateur (le plus lourd, le fracas, coûte ~40 ms).
    const aRendre = ['blanc', 'rose', 'brun', 'applaudissements', 'fracas1', 'fracas2'];
    const auRepos = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 400 }) : (f) => setTimeout(f, 30);
    const suivant = () => { const nom = aRendre.shift(); if (!nom) return; this.banque(nom); auRepos(suivant); };
    auRepos(suivant);
  }

  get maintenant() { return this.ctx.currentTime; }

  appliquerMix(mix) {
    const t = this.ctx.currentTime;
    this.maitre.gain.setTargetAtTime(mix.general, t, 0.05);
    for (const nom of Object.keys(this.bus)) {
      const v = mix[nom] ?? 1;
      this.bus[nom].sec.gain.setTargetAtTime(v, t, 0.05); this.bus[nom].mouille.gain.setTargetAtTime(v, t, 0.05);
    }
  }

  /** Tampons préparés une seule fois (synchrone si on en a besoin avant la fin du préchauffage). */
  banque(nom) {
    if (this.tampons[nom]) return this.tampons[nom];
    const sr = this.ctx.sampleRate, nf = Math.floor(sr * 0.05); let canaux;
    switch (nom) {
      case 'blanc': canaux = [bouclable(bruitBlanc(sr * 3), nf)]; break;
      case 'rose': canaux = [bouclable(bruitRose(sr * 3), nf)]; break;
      case 'brun': canaux = [bouclable(bruitBrun(sr * 3), nf)]; break;
      case 'salle': canaux = rendreSalle(sr, REGLAGES.salle.duree, REGLAGES.salle.rt60); break;
      case 'applaudissements': canaux = rendreApplaudissements(sr); break;
      case 'fracas1': case 'fracas2': canaux = rendreFracas(sr); break;
      default: throw new Error('tampon inconnu ' + nom);
    }
    const b = this.ctx.createBuffer(canaux.length, canaux[0].length, sr);
    canaux.forEach((d, i) => b.getChannelData(i).set(d));
    return (this.tampons[nom] = b);
  }

  /** Courbe de saturation tanh (mégaphone, cris) — mise en cache par dureté. */
  courbe(k) {
    if (this.courbes[k]) return this.courbes[k];
    const n = 1024, d = new Float32Array(n), t = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; d[i] = Math.tanh(k * x) / t; }
    return (this.courbes[k] = d);
  }

  /* ---------- briques de graphe ---------- */
  gain(g, v = 1) { const x = g.n(this.ctx.createGain()); x.gain.value = v; return x; }
  filtre(g, type, f, q = 0.707, gainDb = 0) {
    const x = g.n(this.ctx.createBiquadFilter()); x.type = type; x.frequency.value = f; x.Q.value = q; x.gain.value = gainDb; return x;
  }
  osc(g, type, f) { const x = g.s(this.ctx.createOscillator()); x.type = type; x.frequency.value = f; return x; }
  /** Source de bruit en boucle ; à démarrer avec un décalage aléatoire (deux sons ne partagent jamais le même grain). */
  bruit(g, nom = 'blanc', vitesse = 1) {
    const s = g.s(this.ctx.createBufferSource()); s.buffer = this.banque(nom); s.loop = true; s.playbackRate.value = vitesse; return s;
  }
  demarrer(s, t) { s.start(t, alea() * (s.buffer ? s.buffer.duration * 0.9 : 0)); }
  /** Sortie d'un son : passe-bas de distance (facultatif) → panoramique → sec + envoi vers la salle.
   *  `bus` : nom de bus, ou sous-bus { sec, mouille, envoi } (ambiance, qui doit pouvoir tout éteindre d'un coup). */
  sortie(g, bus = 'effets', { pan = 0, envoi, sec = 1, passeBas = 0 } = {}) {
    const c = this.ctx, b = typeof bus === 'string' ? this.bus[bus] : bus;
    const entree = this.gain(g, 1); let x = entree;
    if (passeBas) { const f = this.filtre(g, 'lowpass', passeBas, 0.5); x.connect(f); x = f; }
    const p = g.n(c.createStereoPanner()); p.pan.value = borne(pan, -1, 1); x.connect(p);
    p.connect(this.gain(g, sec)).connect(b.sec);
    p.connect(this.gain(g, envoi ?? b.envoi)).connect(b.mouille);
    return entree;
  }
  /** Enveloppe percussive : 0 → crête en `att`, puis décroissance exponentielle (T60 donné). */
  percu(param, t, crete, t60, att = 0.0015) {
    param.setValueAtTime(0, t); param.linearRampToValueAtTime(crete, t + att); param.setTargetAtTime(0, t + att, t60 / 6.91);
  }

  /* =================================================================================
     FRAPPE MODALE — la brique de tous les chocs (quilles, planches, gouttière, mécanique)
     o = { modes: [{ f, a, t60 }], niveau, bus, pan, envoi, sec, passeBas,
           transitoire: { bruit, type, f, q, duree, niveau },   // le contact lui-même (bruit court filtré)
           corps: { f0, f1, duree, niveau, forme } }            // une masse qui s'écrase : sinus qui chute
     ================================================================================= */
  frappe(t, o) {
    const c = this.ctx, g = new Grappe(c);
    const out = g.sortie = this.gain(g, o.niveau);
    out.connect(this.sortie(g, o.bus || 'effets', o));
    let fin = t + 0.05, tau = 0.02;
    for (const m of o.modes || []) {
      if (m.f > 16000 || m.a < 0.004) continue;
      const osc = this.osc(g, 'sine', m.f), e = this.gain(g, 0);
      this.percu(e.gain, t, m.a, m.t60);
      osc.connect(e).connect(out); osc.start(t);
      fin = Math.max(fin, t + m.t60 * 1.1); tau = Math.max(tau, m.t60 / 6.91);
    }
    if (o.transitoire) {
      const tr = o.transitoire, s = this.bruit(g, tr.bruit || 'blanc'); let x = s;
      if (tr.type) { const f = this.filtre(g, tr.type, tr.f, tr.q || 0.8); s.connect(f); x = f; }
      const e = this.gain(g, 0);
      e.gain.setValueAtTime(tr.niveau, t); e.gain.setTargetAtTime(0, t + 0.0005, tr.duree / 5);
      x.connect(e).connect(out); this.demarrer(s, t);
      fin = Math.max(fin, t + tr.duree * 1.3);
    }
    if (o.corps) {
      const k = o.corps, osc = this.osc(g, k.forme || 'sine', k.f0), e = this.gain(g, 0);
      osc.frequency.setValueAtTime(k.f0, t); osc.frequency.exponentialRampToValueAtTime(k.f1, t + k.duree * 0.7);
      this.percu(e.gain, t, k.niveau, k.duree, 0.002);
      osc.connect(e).connect(out); osc.start(t);
      fin = Math.max(fin, t + k.duree * 1.1); tau = Math.max(tau, k.duree / 6.91);
    }
    g.fin(fin);
    return { g, fin, t0: t, niveau: o.niveau, tau };
  }

  /** Les modes d'une quille pour UN choc. `n` (1..10) fixe le timbre propre de la quille (±4,5 %) ; le point
   *  d'impact, inconnu, est simulé par des amplitudes tirées à chaque choc → jamais deux chocs identiques.
   *  `clair` > 0 : un choc dur / bref excite mieux les modes hauts ; < 0 : contact long et mou (la boule). */
  modesQuille(n, i, { clair = 0, duree = 1, gain = 1 } = {}) {
    const perso = n >= 1 && n <= 10 ? 1 + 0.045 * Math.sin(n * 7.31 + 1.7) : entre(0.955, 1.045);
    const f0 = QUILLE.f0 * perso * entre(0.988, 1.012), b = (i - 0.5) * 0.8 + clair, nb = QUILLE.rapports.length;
    return QUILLE.rapports.map((r, k) => ({
      f: f0 * r * entre(0.994, 1.006),
      a: gain * QUILLE.amplitudes[k] * entre(0.45, 1.25) * Math.exp(b * (k / (nb - 1) - 0.4)),
      t60: QUILLE.t60[k] * entre(0.85, 1.15) * duree,
    }));
  }

  /* =================================================================================
     CONTACTS DE LA PHYSIQUE
     ================================================================================= */
  /** Instant de jeu d'un contact : les contacts d'une même image arrivent dans le même appel JS ; on rétablit leur
   *  écart réel (c.t) dans la limite de 30 ms, plus 0–3 ms de flou, au lieu de les empiler sur la même milliseconde
   *  (effet « mitraillette » à 60 Hz et phases qui s'annulent). */
  instantContact(tPhys) {
    const p = performance.now();
    if (p - this.lot.p > 6) this.lot = { p, t0: tPhys ?? 0 };
    const decal = tPhys == null ? 0 : borne(tPhys - this.lot.t0, 0, 0.03);
    return this.ctx.currentTime + REGLAGES.latence + decal + alea() * 0.003;
  }

  /** Densité de chocs de quilles dans la fenêtre (somme des intensités) : le baromètre du strike. */
  densite(t) {
    const f = REGLAGES.poly.fenetre;
    while (this.rafale.length && this.rafale[0].t < t - f) this.rafale.shift();
    return this.rafale.reduce((s, r) => s + r.i, 0);
  }

  /** Limiteur de polyphonie : vrai si le choc peut jouer (éventuellement en volant la voix la plus faible). */
  admettre(niveau) {
    const now = this.ctx.currentTime;
    this.voix = this.voix.filter((v) => v.fin > now);
    if (this.voix.length < REGLAGES.poly.chocs) return true;
    let pire = null, min = Infinity;
    for (const v of this.voix) {
      const actuel = v.niveau * Math.exp(-Math.max(0, now - v.t0) / v.tau);
      if (actuel < min) { min = actuel; pire = v; }
    }
    if (pire && niveau > min * 1.2) { pire.g.couper(); this.voix.splice(this.voix.indexOf(pire), 1); this.vols++; return true; }
    this.abandons++; return false;
  }

  contact(c) {
    const type = c.type;
    if (type === 'boule-piste') {
      // Le rebond du lâcher. Si jeu.js appelle aussi S.lacher pour le même instant, on ne double pas le « bonk ».
      if (this.ctx.currentTime - this.dernierLacher > 0.25) this.lacher(c.force, true);
      return;
    }
    const i = intensite(type, c.force);
    if (i == null) return;
    // Dé-doublonnage : un contact qui persiste (Rapier rapporte à chaque pas) ne doit pas sonner comme une crécelle.
    const cle = type + ':' + (c.n ?? ''), now = this.ctx.currentTime, d = this.derniers[cle];
    if (d && now - d.t < 0.035 && i <= d.i * 1.3) return;
    this.derniers[cle] = { t: now, i };

    const t = this.instantContact(c.t), pan = panDe(c.x);
    const quille = type !== 'boule-gouttiere' && type !== 'boule-fosse';
    let k = 1;
    if (quille) {
      this.rafale.push({ t, i });
      const dens = this.densite(t);
      // Somme en énergie : N chocs simultanés font √N fois plus de bruit, pas N fois. On n'en compense qu'une partie
      // (-3 dB à densité 10) : le strike DOIT rester l'événement le plus fort du jeu, c'est le compresseur qui tient.
      k = 1 / Math.sqrt(1 + 0.1 * dens);
      this.gererFracas(t, dens);
    }
    const niveau = niveauDe(i) * REGLAGES.niveaux.chocs * k;
    if (!this.admettre(niveau)) return;
    const v = this.choc(type, t, i, niveau, pan, c);
    if (v) this.voix.push(v);
  }

  /** Le « CRASH » : quand la densité de chocs dépasse le seuil, on lance une gerbe pré-calculée par-dessus les
   *  voix réelles ; si la densité continue de monter dans les 300 ms, on la renforce au lieu d'en empiler une 2e. */
  gererFracas(t, dens) {
    const seuil = REGLAGES.poly.seuilFracas, cible = borne((dens - 2) / 6, 0.25, 1) * REGLAGES.niveaux.fracas;
    const f = this.fracasEnCours;
    if (f && t - f.t < 0.3) { if (cible > f.niveau) { f.niveau = cible; f.gain.gain.setTargetAtTime(cible, t, 0.03); } return; }
    if (dens < seuil || t - this.dernierFracas < 0.7) return;
    this.dernierFracas = t;
    const g = new Grappe(this.ctx), s = g.s(this.ctx.createBufferSource());
    s.buffer = this.banque(alea() < 0.5 ? 'fracas1' : 'fracas2'); s.playbackRate.value = entre(0.93, 1.07);
    const gain = g.sortie = this.gain(g, 0);
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(cible, t + 0.004);
    s.connect(gain).connect(this.sortie(g, 'effets', { envoi: 0.35, pan: entre(-0.15, 0.15) }));
    s.start(t); g.fin(t + s.buffer.duration / s.playbackRate.value + 0.05);
    this.fracasEnCours = { t, niveau: cible, gain };
  }

  /** Le timbre de chaque type de contact. */
  choc(type, t, i, niveau, pan, c) {
    switch (type) {
      case 'boule-quille': {
        // Plus grave et plus « plein » : la boule (6,8 kg, contact long) étouffe les aigus et excite le mode de corps
        // de la quille (~0,52 f0, le gros « TOCK ») ; dessous, l'écrasement de la masse (sinus 170 → 95 Hz).
        const modes = this.modesQuille(c.n, i, { clair: -0.5, duree: 1.1 });
        modes.push({ f: modes[0].f * 0.52, a: 0.95, t60: 0.17 });
        return this.frappe(t, {
          modes, niveau: niveau * 1.25, pan, envoi: 0.3,
          transitoire: { bruit: 'rose', type: 'lowpass', f: 2200 + 3500 * i, q: 0.7, duree: 0.022, niveau: 0.9 },
          corps: { f0: 170, f1: 92, duree: 0.12, niveau: 0.35 + 0.65 * i },
        });
      }
      case 'quille-quille': {
        // Deux quilles sonnent : celle du contact (n) et une autre. Contact bref et dur → modes hauts, clic aigu.
        const a = this.modesQuille(c.n, i, { clair: 0.4, duree: 0.9, gain: 0.7 }).slice(0, 5);
        const b = this.modesQuille(0, i, { clair: 0.4, duree: 0.9, gain: 0.55 }).slice(0, 5);
        return this.frappe(t, {
          modes: a.concat(b), niveau, pan,
          transitoire: { type: 'bandpass', f: entre(3500, 5500), q: 1.2, duree: 0.008, niveau: 1.1 },
        });
      }
      case 'quille-piste': {
        // La quille tombe sur le bois : la piste répond (planche ~210 / 370 / 560 Hz, « toc » sourd) et la quille
        // ne résonne qu'à moitié (elle tape par le flanc ou la tête).
        const modes = this.modesQuille(c.n, i, { clair: -0.2, duree: 0.8, gain: 0.55 });
        modes.push({ f: entre(200, 235), a: 0.8, t60: 0.09 }, { f: entre(355, 395), a: 0.45, t60: 0.07 }, { f: entre(530, 600), a: 0.3, t60: 0.05 });
        return this.frappe(t, {
          modes, niveau, pan,
          transitoire: { bruit: 'rose', type: 'lowpass', f: 900 + 900 * i, q: 0.7, duree: 0.03, niveau: 0.8 },
          corps: { f0: 135, f1: 88, duree: 0.08, niveau: 0.55 * i + 0.15 },
        });
      }
      case 'quille-mur': {
        // Les « kickbacks » (panneaux latéraux) : claquement SEC — bruit très bref, aigu, et un panneau qui sonne court.
        const modes = this.modesQuille(c.n, i, { clair: 0.3, duree: 0.7, gain: 0.5 });
        const j = entre(0.95, 1.05);
        modes.push({ f: 470 * j, a: 0.7, t60: 0.07 }, { f: 820 * j, a: 0.5, t60: 0.05 }, { f: 1310 * j, a: 0.45, t60: 0.04 }, { f: 2050 * j, a: 0.3, t60: 0.03 });
        return this.frappe(t, {
          modes, niveau: niveau * 1.1, pan: c.x == null ? choisir([-0.75, 0.75]) : Math.sign(-c.x || 1) * 0.75,
          transitoire: { type: 'highpass', f: 1800, q: 0.7, duree: 0.006, niveau: 1.3 },
        });
      }
      case 'quille-fosse': {
        // Chute sourde, lointaine : la fosse est capitonnée, sous le niveau de la piste. Peu de sec, beaucoup de salle.
        const modes = this.modesQuille(c.n, i, { clair: -0.8, duree: 0.5, gain: 0.2 });
        return this.frappe(t, {
          modes, niveau: niveau * 0.9, pan, sec: 0.45, envoi: 0.55, passeBas: 1800,
          transitoire: { bruit: 'rose', type: 'lowpass', f: 450, q: 0.7, duree: 0.12, niveau: 1 },
          corps: { f0: 95, f1: 60, duree: 0.15, niveau: 0.7 },
        });
      }
      case 'boule-fosse': {
        // La boule crève le rideau puis retombe au fond : deux coups sourds, très graves.
        const o = { pan, sec: 0.5, envoi: 0.5, passeBas: 1200 };
        const a = this.frappe(t, { ...o, niveau: niveau * 1.4, modes: [{ f: entre(130, 150), a: 0.4, t60: 0.12 }],
          transitoire: { bruit: 'rose', type: 'lowpass', f: 350, q: 0.7, duree: 0.15, niveau: 1 }, corps: { f0: 75, f1: 42, duree: 0.35, niveau: 1 } });
        this.frappe(t + entre(0.12, 0.2), { ...o, niveau: niveau * 0.6, transitoire: { bruit: 'brun', type: 'lowpass', f: 300, q: 0.7, duree: 0.1, niveau: 1 },
          corps: { f0: 68, f1: 45, duree: 0.25, niveau: 1 } });
        return a;
      }
      case 'boule-gouttiere': {
        // La gouttière est un canal creux : « clong » métallique, résonances longues (jusqu'à 0,55 s).
        const j = entre(0.97, 1.03), base = [310, 745, 1290, 2010, 2870], amp = [1, 0.7, 0.5, 0.35, 0.2], t60 = [0.55, 0.42, 0.3, 0.2, 0.13];
        return this.frappe(t, {
          modes: base.map((f, k) => ({ f: f * j * entre(0.99, 1.01), a: amp[k] * entre(0.6, 1.2), t60: t60[k] })), niveau: niveau * 1.2, pan,
          transitoire: { bruit: 'rose', type: 'lowpass', f: 1500, q: 0.7, duree: 0.02, niveau: 0.8 },
          corps: { f0: 120, f1: 70, duree: 0.1, niveau: 0.8 },
        });
      }
      default: return null;
    }
  }

  /* =================================================================================
     LÂCHER — le « bonk » d'une boule de 6,8 kg sur le bois de l'approche
     ================================================================================= */
  /** force : 0..1 (qualité normalisée par jeu.js) ou Newtons bruts de Rapier (> 1). Une masse qui s'écrase =
   *  sinus grave qui chute (115 → 52 Hz), les planches répondent (180 / 305 / 470 Hz), un bruit sourd d'impact.
   *  Fort (boule lâchée trop tard) : plus clair, plus long, et un petit rebond 70–120 ms après. */
  lacher(force, enNewtons = false) {
    const f = Number(force);
    const i = !isFinite(f) ? 0.4 : (!enNewtons && f <= 1 ? borne(f, 0, 1) : intensite('boule-piste', f) ?? 0);
    const t = this.ctx.currentTime + REGLAGES.latence, niv = dB(-10 + 10 * i) * REGLAGES.niveaux.lacher;
    this.dernierLacher = this.ctx.currentTime; this.odometre = 0;
    const coup = (tt, n) => this.frappe(tt, {
      niveau: n, pan: 0.05, envoi: 0.3,
      modes: [{ f: entre(170, 190), a: 0.6, t60: 0.14 }, { f: entre(290, 320), a: 0.35, t60: 0.1 }, { f: entre(455, 490), a: 0.2, t60: 0.07 }],
      transitoire: { bruit: 'rose', type: 'lowpass', f: 600 + 1600 * i, q: 0.7, duree: 0.03, niveau: 0.9 },
      corps: { f0: 115, f1: 52, duree: 0.14 + 0.06 * i, niveau: 1 },
    });
    coup(t, niv);
    if (i > 0.6) coup(t + 0.07 + 0.05 * i, niv * 0.35);
  }

  /* =================================================================================
     ROULEMENT — un seul graphe persistant, piloté à chaque image
     ================================================================================= */
  roulement(e) {
    if (!this.roul) this.roul = this.creerRoulement();
    this.roul.maj(e || {});
  }
  creerRoulement() {
    const c = this.ctx, g = new Grappe(c), m = this, t0 = c.currentTime, b = this.bus.effets;
    // Distance : passe-bas + panoramique + sec / mouillé pilotés (la boule s'éloigne vers 18 m).
    const sortie = g.sortie = this.gain(g, 0);
    const lpDist = this.filtre(g, 'lowpass', 8000, 0.5), pan = g.n(c.createStereoPanner());
    const sec = this.gain(g, 1), mouille = this.gain(g, 0.12);
    sortie.connect(lpDist).connect(pan); pan.connect(sec).connect(b.sec); pan.connect(mouille).connect(b.mouille);

    // Piste : A (grondement) + B (grain du bois) + C (chuintement sur l'huile) → modulation de rotation → gPiste.
    const am = this.gain(g, 0.8), gPiste = this.gain(g, 1); am.connect(gPiste).connect(sortie);
    // A — grondement : bruit brun, passe-bas qui s'ouvre avec la vitesse, bosse à 85 Hz (le « corps » de la salle).
    const sA = this.bruit(g, 'brun'), lpA = this.filtre(g, 'lowpass', 200, 0.9), pk = this.filtre(g, 'peaking', 85, 1.1, 7), gA = this.gain(g, 0);
    sA.connect(lpA).connect(pk).connect(gA).connect(am);
    // B — grain : bruit rose en bande étroite ~300–600 Hz. C'est lui qu'on entend sur un haut-parleur de portable,
    // qui ne restitue pas les 85 Hz du grondement.
    const sB = this.bruit(g, 'rose'), bpB = this.filtre(g, 'bandpass', 400, 1.3), gB = this.gain(g, 0);
    sB.connect(bpB).connect(gB).connect(am);
    // C — huile : tant que la boule GLISSE (elle tourne moins vite qu'elle n'avance), un souffle aigu, sifflant.
    const sC = this.bruit(g, 'rose'), hpC = this.filtre(g, 'highpass', 1200, 0.7), bpC = this.filtre(g, 'bandpass', 2600, 0.6), gC = this.gain(g, 0);
    sC.connect(hpC).connect(bpC).connect(gC).connect(am);
    // Rotation : les trous de doigts et le noyau asymétrique donnent un battement à la fréquence de rotation
    // (v / 2πr ≈ 12 Hz à 8 m/s) — forme non sinusoïdale (harmoniques 1-2-3).
    const lfoRot = g.s(c.createOscillator());
    lfoRot.setPeriodicWave(c.createPeriodicWave(new Float32Array([0, 0, 0, 0]), new Float32Array([0, 1, 0.45, 0.2])));
    lfoRot.frequency.value = 10; const profRot = this.gain(g, 0.18); lfoRot.connect(profRot).connect(am.gain);
    // Houle lente : lattes, huile inégale (deux LFO non commensurables → jamais périodique à l'oreille).
    const l1 = this.osc(g, 'sine', 0.37), l2 = this.osc(g, 'sine', 0.83);
    l1.connect(this.gain(g, 0.07)).connect(am.gain); l2.connect(this.gain(g, 0.05)).connect(am.gain);

    // Gouttière : canal métallique creux → deux résonances + filtre en peigne (tube de ~4 ms), battement plus marqué.
    const sD = this.bruit(g, 'rose'), sumD = this.gain(g, 1);
    sD.connect(this.filtre(g, 'bandpass', 480, 3)).connect(sumD); sD.connect(this.filtre(g, 'bandpass', 1150, 5)).connect(this.gain(g, 0.6)).connect(sumD);
    const ligne = g.n(c.createDelay(0.05)); ligne.delayTime.value = 0.0042;
    const reinj = this.gain(g, 0.55), lpBoucle = this.filtre(g, 'lowpass', 3500, 0.5);
    const amG = this.gain(g, 0.65), gGout = this.gain(g, 0);
    sumD.connect(ligne); ligne.connect(lpBoucle).connect(reinj).connect(ligne); // boucle de réinjection
    sumD.connect(amG); ligne.connect(amG); lfoRot.connect(this.gain(g, 0.35)).connect(amG.gain);
    amG.connect(gGout).connect(sortie);

    for (const s of [sA, sB, sC, sD]) this.demarrer(s, t0);
    lfoRot.start(t0); l1.start(t0); l2.start(t0);

    const R = {
      g, dernier: performance.now(), veille: 0,
      maj: (e) => {
        const now = c.currentTime, p = performance.now(), tc = 0.04;
        const dt = Math.min(0.05, (p - R.dernier) / 1000); R.dernier = p;
        const v = borne(+e.vitesse || 0, 0, 12), gl = borne(+e.glisse || 0, 0, 1), nv = v / 9;
        m.odometre += v * dt;
        const dist = isFinite(e.z) ? Math.max(0, e.z) : m.odometre;
        const zone = e.zone, roule = zone === 'piste' || zone === 'gouttiere';
        const lvl = roule ? Math.min(1.25, Math.pow(nv, 1.1)) : 0;
        gA.gain.setTargetAtTime(0.9 * lvl, now, tc);
        lpA.frequency.setTargetAtTime(110 + 30 * v, now, tc);
        gB.gain.setTargetAtTime(roule ? 0.3 * Math.pow(nv, 1.6) : 0, now, tc);
        bpB.frequency.setTargetAtTime(260 + 35 * v, now, tc);
        gC.gain.setTargetAtTime(roule ? 0.12 * gl * nv : 0, now, tc);
        bpC.frequency.setTargetAtTime(2200 + 120 * v, now, tc);
        lfoRot.frequency.setTargetAtTime(Math.max(0.5, v / (2 * Math.PI * 0.1085)), now, tc);
        profRot.gain.setTargetAtTime(0.18 * (1 - 0.6 * gl), now, tc); // en glissade, la boule tourne moins
        gPiste.gain.setTargetAtTime(zone === 'piste' ? 1 : 0, now, 0.03);
        gGout.gain.setTargetAtTime(zone === 'gouttiere' ? 3.2 * Math.min(1.2, nv + 0.15) : 0, now, 0.03); // bandes étroites : peu d'énergie
        // Éloignement : -11 dB et ~1,5 kHz de bande à 18 m ; la part de salle augmente.
        lpDist.frequency.setTargetAtTime(300 + 7000 / (1 + dist / 4), now, 0.08);
        sec.gain.setTargetAtTime(1 / (1 + dist / 7), now, 0.08);
        mouille.gain.setTargetAtTime(0.12 + 0.35 * Math.min(1, dist / 18), now, 0.08);
        pan.pan.setTargetAtTime(isFinite(e.x) ? panDe(e.x) * 0.6 : 0, now, 0.08);
        sortie.gain.setTargetAtTime(REGLAGES.niveaux.roulement, now, 0.03);
        // Chien de garde : si jeu.js cesse d'appeler (fin de lecture, pause), on s'éteint puis on libère tout.
        clearTimeout(R.veille);
        R.veille = setTimeout(() => {
          sortie.gain.setTargetAtTime(0, c.currentTime, 0.08);
          R.veille = setTimeout(() => R.detruire(), 1200);
        }, 180);
      },
      detruire: () => {
        clearTimeout(R.veille); if (m.roul === R) m.roul = null;
        sortie.gain.setTargetAtTime(0, c.currentTime, 0.03); g.fin(c.currentTime + 0.25);
      },
    };
    return R;
  }

  /* =================================================================================
     FOULE — sans voix : applaudissements, mains éparses, rumeur, sifflets
     ================================================================================= */
  /** Quelques mains POLIES, éparses (déception gentille : gouttière, raté) : n personnes, chacune 3 à 6 claps à sa
   *  cadence, timbre propre (résonance 0,9–2,4 kHz), loin dans la salle. Pas une salve : on entend chaque main. */
  clapsEpars(t, { n = 3, niveau = 0.5, bus = 'foule', loin = 0.5 } = {}) {
    for (let p = 0; p < n; p++) {
      const f = entre(900, 2400), q = entre(1.2, 3), pan = entre(-0.8, 0.8), cad = entre(2.6, 3.8), nb = Math.floor(entre(3, 7));
      let x = t + entre(0.05, 0.6) + p * 0.08;
      for (let k = 0; k < nb; k++) {
        const fin = 1 - 0.5 * k / nb; // le dernier clap s'essouffle
        this.frappe(x, { bus, pan, sec: 1 - loin * 0.6, envoi: 0.4 + loin * 0.4, passeBas: loin ? 6000 : 0,
          niveau: niveau * REGLAGES.niveaux.foule * entre(0.5, 0.8) * fin,
          transitoire: { bruit: 'blanc', type: 'bandpass', f: f * entre(0.97, 1.03), q, duree: entre(0.012, 0.02), niveau: 1 } });
        x += (1 / cad) * entre(0.88, 1.12);
      }
    }
  }

  /** Applaudissements : la texture pré-calculée, en 1 à 3 couches décalées (plus de monde = plus de couches, pas
   *  plus fort), avec montée, tenue et longue extinction (les derniers applaudissent toujours un peu plus tard). */
  applaudir(t, { duree = 3, niveau = 0.7, couches = 1, bus = 'foule', loin = 0, pan = 0 } = {}) {
    for (let k = 0; k < couches; k++) {
      const g = new Grappe(this.ctx), s = g.s(this.ctx.createBufferSource());
      s.buffer = this.banque('applaudissements'); s.loop = true; s.playbackRate.value = entre(0.94, 1.06);
      const e = g.sortie = this.gain(g, 0), tk = t + k * entre(0.04, 0.15), crete = niveau * REGLAGES.niveaux.foule * (k ? 0.7 : 1);
      e.gain.setValueAtTime(0, tk); e.gain.linearRampToValueAtTime(crete, tk + 0.25);
      e.gain.setTargetAtTime(crete * 0.75, tk + 0.3, duree * 0.3); e.gain.setTargetAtTime(0, tk + duree * 0.6, duree * 0.18);
      s.connect(e).connect(this.sortie(g, bus, { pan: pan + (k ? entre(-0.3, 0.3) : 0), sec: 1 - loin * 0.75, passeBas: loin ? 2500 : 0 }));
      s.start(tk, alea() * 3); g.fin(tk + duree * 1.6);
    }
  }

  /** Rumeur : la salle qui s'emballe, SANS voix — bruits brun et rose étouffés (pas de bande de formant : on ne doit
   *  entendre aucune voyelle), battus irrégulièrement. Grave, diffuse, surtout dans la salle (réverbération). */
  rumeur(t, { duree = 2, niveau = 0.4, bus = 'foule' } = {}) {
    const g = new Grappe(this.ctx), b = this.bruit(g, 'brun'), r = this.bruit(g, 'rose'), am = this.gain(g, 0.8), e = g.sortie = this.gain(g, 0);
    const s1 = this.gain(g, 1);
    b.connect(this.filtre(g, 'lowpass', 420, 0.5)).connect(this.gain(g, 1.2)).connect(s1);
    r.connect(this.filtre(g, 'lowpass', 750, 0.5)).connect(this.filtre(g, 'highpass', 120, 0.5)).connect(this.gain(g, 0.45)).connect(s1);
    s1.connect(am).connect(e).connect(this.sortie(g, bus, { envoi: 0.7, sec: 0.6 }));
    for (let x = t; x < t + duree; x += entre(0.12, 0.3)) am.gain.setTargetAtTime(entre(0.7, 1), x, 0.08);
    const crete = niveau * REGLAGES.niveaux.foule * 1.6;
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(crete, t + 0.3);
    e.gain.setTargetAtTime(crete * 0.6, t + 0.35, duree * 0.35); e.gain.setTargetAtTime(0, t + duree * 0.7, duree * 0.2);
    this.demarrer(b, t); this.demarrer(r, t); g.fin(t + duree * 1.6);
  }

  /** Sifflet à roulette (manif, arbitre) : la bille qui tourne dans la chambre module la hauteur ET le volume
   *  à ~40 Hz — c'est ce « trille » qui le rend reconnaissable. motif : [[durée sifflée, silence], ...].
   *  Niveaux bas exprès : un son pur à 3 kHz tombe là où l'oreille est la plus sensible, il perce tout le mélange. */
  sifflet(t, { f = entre(2700, 3500), motif = null, niveau = 0.12, pan = 0, loin = 0, bus = 'foule' } = {}) {
    const c = this.ctx, g = new Grappe(c);
    const out = g.sortie = this.gain(g, niveau);
    out.connect(this.sortie(g, bus, { pan, sec: 1 - loin * 0.8, envoi: 0.3 + loin * 0.5, passeBas: loin ? 5000 : 0 }));
    const o = this.osc(g, 'sine', f), lfo = this.osc(g, 'sine', entre(36, 48));
    lfo.connect(this.gain(g, f * 0.06)).connect(o.frequency);
    const am = this.gain(g, 0.7); lfo.connect(this.gain(g, 0.3)).connect(am.gain);
    const gate = this.gain(g, 0);
    const souffle = this.bruit(g, 'blanc'), bp = this.filtre(g, 'bandpass', f, 6);
    o.connect(am).connect(gate); souffle.connect(bp).connect(this.gain(g, 0.5)).connect(gate); gate.connect(out);
    const m = motif || choisir([[[0.35, 0.08], [0.12, 0.08], [0.5, 0]], [[0.12, 0.07], [0.12, 0.07], [0.12, 0.07], [0.6, 0]], [[0.9, 0]], [[0.2, 0.1], [0.2, 0.1], [0.2, 0.1], [0.2, 0]]]);
    let x = t;
    for (const [on, off] of m) {
      gate.gain.setTargetAtTime(1, x, 0.006); o.frequency.setTargetAtTime(f * entre(0.98, 1.02), x, 0.01);
      gate.gain.setTargetAtTime(0, x + on, 0.012); x += on + off;
    }
    o.start(t); lfo.start(t); this.demarrer(souffle, t); g.fin(x + 0.15);
  }

  /** Sifflement aux doigts (admiration, ambiance Bony) : « fiiiuu-fi ! » — glissando montant puis seconde note. */
  siffletDoigts(t, { niveau = 0.12, pan = entre(-0.6, 0.6) } = {}) {
    const g = new Grappe(this.ctx), o = this.osc(g, 'sine', 1700), e = g.sortie = this.gain(g, 0);
    const souffle = this.bruit(g, 'blanc'), bp = this.filtre(g, 'bandpass', 2600, 4);
    o.frequency.setValueAtTime(1700, t); o.frequency.exponentialRampToValueAtTime(2900, t + 0.25);
    o.frequency.setValueAtTime(2900, t + 0.35); o.frequency.setValueAtTime(2200, t + 0.43); o.frequency.exponentialRampToValueAtTime(3100, t + 0.55);
    o.frequency.exponentialRampToValueAtTime(2400, t + 0.78);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(niveau, t + 0.04); e.gain.setValueAtTime(niveau, t + 0.33);
    e.gain.linearRampToValueAtTime(0, t + 0.37); e.gain.linearRampToValueAtTime(niveau * 1.1, t + 0.45); e.gain.setTargetAtTime(0, t + 0.7, 0.04);
    o.connect(e); souffle.connect(bp).connect(this.gain(g, 0.06)).connect(e);
    e.connect(this.sortie(g, 'foule', { pan, envoi: 0.45 }));
    o.start(t); this.demarrer(souffle, t); g.fin(t + 1);
  }

  /* =================================================================================
     MANIF — pétards, corne, tambours, mégaphone
     ================================================================================= */
  /** Pétard : un claquement de quelques ms (l'onde de choc) et un « boum » grave. Lointain = beaucoup de salle,
   *  peu de sec, aigus coupés. C'est le rapport sec / réverbéré qui fait la distance. */
  petard(t, { niveau = 0.6, loin = 0.6, pan = entre(-0.8, 0.8), bus = 'foule' } = {}) {
    const g = new Grappe(this.ctx), s = this.bruit(g, 'blanc'), e = g.sortie = this.gain(g, 0);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(niveau, t + 0.0005); e.gain.setTargetAtTime(0, t + 0.0005, 0.008);
    const m = this.gain(g, 1); s.connect(this.filtre(g, 'highpass', 300, 0.7)).connect(m); s.connect(this.filtre(g, 'lowpass', 200, 0.7)).connect(this.gain(g, 2)).connect(m);
    m.connect(e);
    const boum = this.osc(g, 'sine', 60), eb = this.gain(g, 0); this.percu(eb.gain, t, niveau * 0.8, 0.3, 0.002);
    boum.frequency.setValueAtTime(70, t); boum.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    boum.connect(eb);
    const sortie = this.sortie(g, bus, { pan, sec: 1 - loin * 0.85, envoi: 0.35 + loin * 0.65, passeBas: 14000 / (1 + 5 * loin) });
    e.connect(sortie); eb.connect(sortie);
    this.demarrer(s, t); boum.start(t); g.fin(t + 0.45);
  }
  rafalePetards(t, n, o = {}) { let x = t; const pan = o.pan ?? entre(-0.7, 0.7); for (let k = 0; k < n; k++) { this.petard(x, { ...o, pan: pan + entre(-0.1, 0.1), niveau: (o.niveau ?? 0.4) * entre(0.5, 1) }); x += entre(0.03, 0.09); } }

  /** Corne de brume (bombe d'air comprimé) : deux anches dissonantes, saturées. */
  corne(t, { duree = 0.9, niveau = 0.16, loin = 0.3, pan = entre(-0.6, 0.6), bus = 'foule' } = {}) {
    const c = this.ctx, g = new Grappe(c), e = g.sortie = this.gain(g, 0), sh = g.n(c.createWaveShaper()); sh.curve = this.courbe(3);
    const lp = this.filtre(g, 'lowpass', 2600, 0.8);
    for (const f of [entre(405, 425), entre(510, 530), entre(600, 640)]) { const o = this.osc(g, 'sawtooth', f); o.connect(this.gain(g, 0.25)).connect(sh); o.frequency.setValueAtTime(f * 0.92, t); o.frequency.linearRampToValueAtTime(f, t + 0.06); o.start(t); }
    sh.connect(lp).connect(e);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(niveau, t + 0.04); e.gain.setValueAtTime(niveau, t + duree); e.gain.linearRampToValueAtTime(0, t + duree + 0.08);
    e.connect(this.sortie(g, bus, { pan, sec: 1 - loin * 0.7, envoi: 0.3 + loin * 0.5 }));
    g.fin(t + duree + 0.15);
  }

  /** Grosse caisse (surdo) : peau qui chute 90 → 48 Hz + claquement de la mailloche. */
  grosseCaisse(t, { niveau = 0.5, pan = -0.25, loin = 0.4, bus = 'foule', grave = 1 } = {}) {
    this.frappe(t, { bus, pan, sec: 1 - loin * 0.6, envoi: 0.25 + loin * 0.4, niveau,
      corps: { f0: 92 * grave, f1: 48 * grave, duree: 0.45, niveau: 1 },
      transitoire: { bruit: 'rose', type: 'lowpass', f: 1800, q: 0.7, duree: 0.015, niveau: 0.6 } });
  }
  /** Caisse claire (tarol) : timbre (bruit 1,8–6 kHz) + fût (190 Hz). */
  caisseClaire(t, { niveau = 0.3, pan = -0.2, loin = 0.4, bus = 'foule' } = {}) {
    this.frappe(t, { bus, pan, sec: 1 - loin * 0.6, envoi: 0.25 + loin * 0.4, niveau,
      modes: [{ f: entre(185, 200), a: 0.5, t60: 0.1 }, { f: entre(320, 340), a: 0.25, t60: 0.07 }],
      transitoire: { type: 'bandpass', f: 3500, q: 0.5, duree: 0.13, niveau: 1 } });
  }
  rouleCaisse(t, duree, o = {}) { let x = t, k = 0; while (x < t + duree) { this.caisseClaire(x, { ...o, niveau: (o.niveau ?? 0.3) * (0.5 + 0.5 * (x - t) / duree) * (k++ % 2 ? 0.8 : 1) }); x += Math.max(0.035, 0.09 - 0.05 * (x - t) / duree); } }

  /* =================================================================================
     RÉSULTATS
     ================================================================================= */
  resultat(r) {
    const t = this.ctx.currentTime + 0.03;
    if (this.etat.theme === 'cgt') return this.resultatCGT(r, t);
    switch (r) {
      case 'turkey':
        this.applaudir(t, { duree: 5.2, niveau: 0.95, couches: 3 });
        this.rumeur(t, { duree: 4, niveau: 0.5 });
        this.siffletDoigts(t + 0.3); this.siffletDoigts(t + 0.9); this.siffletDoigts(t + 1.6);
        return;
      case 'strike':
        this.applaudir(t, { duree: 3.8, niveau: 0.8, couches: 2 });
        this.rumeur(t + 0.05, { duree: 2.6, niveau: 0.35 });
        this.siffletDoigts(t + 0.4);
        return;
      case 'spare':
        this.applaudir(t, { duree: 2.3, niveau: 0.6 });
        this.rumeur(t, { duree: 1.4, niveau: 0.18 });
        return;
      case 'bon':
        this.applaudir(t, { duree: 1.2, niveau: 0.3 });
        return;
      case 'rate':
        this.clapsEpars(t + 0.2, { n: 2, niveau: 0.45 });
        return;
      case 'gouttiere':
        this.clapsEpars(t + 0.3, { n: 3, niveau: 0.5 }); // quelques encouragements polis
        return;
    }
  }
  resultatCGT(r, t) {
    const sifflets = (n, etalement, o = {}) => { for (let k = 0; k < n; k++) this.sifflet(t + alea() * etalement, { niveau: entre(0.06, 0.14), pan: entre(-0.85, 0.85), loin: entre(0, 0.5), ...o }); };
    switch (r) {
      case 'turkey':
      case 'strike': {
        const fort = r === 'turkey';
        this.rumeur(t, { duree: fort ? 3.6 : 2.8, niveau: 0.55 });
        sifflets(fort ? 12 : 8, 1.6);
        this.petard(t + 0.15, { niveau: 0.7, loin: 0.3 }); this.rafalePetards(t + 0.6, fort ? 22 : 12, { niveau: 0.35, loin: 0.5 });
        if (fort) { this.petard(t + 1.4, { niveau: 0.6, loin: 0.4 }); this.petard(t + 1.9, { niveau: 0.6, loin: 0.5 }); }
        this.corne(t + 0.3, { duree: fort ? 1.4 : 0.9 });
        this.applaudir(t, { duree: 3.2, niveau: 0.55, couches: fort ? 2 : 1 });
        this.rouleCaisse(t, 1.0, { niveau: 0.4, loin: 0.3 }); this.grosseCaisse(t + 1.02, { niveau: 0.7, loin: 0.3 });
        if (fort) this.batucada(t + 1.3, 3.2, { niveau: 0.5 });
        return;
      }
      case 'spare':
        sifflets(4, 1);
        this.applaudir(t, { duree: 1.8, niveau: 0.5 });
        this.grosseCaisse(t + 0.1, { niveau: 0.6 }); this.grosseCaisse(t + 0.4, { niveau: 0.6 });
        this.corne(t + 0.2, { duree: 0.5 });
        return;
      case 'bon':
        sifflets(2, 0.6); this.applaudir(t, { duree: 1, niveau: 0.25 });
        return;
      case 'rate':
        // dérision : en France on siffle pour huer (long, continu)
        sifflets(2, 0.4, { motif: [[entre(0.9, 1.3), 0]] });
        return;
      case 'gouttiere':
        sifflets(5, 1.2, { motif: [[entre(0.9, 1.6), 0]] });
        this.grosseCaisse(t + 0.5, { niveau: 0.45, grave: 0.8 }); this.grosseCaisse(t + 1.1, { niveau: 0.35, grave: 0.75 }); // « boum… boum »
        return;
    }
  }

  /** Batucada de manif (surdo grave / médium, tarol en double-croches accentuées), sans aucune voix. */
  batucada(t, duree, { niveau = 0.5, bus = 'foule', loin = 0.3 } = {}) {
    const dc = 60 / 112 / 4; let k = 0;
    for (let x = t; x < t + duree; x += dc, k++) {
      const p = k % 16;
      if (p === 0 || p === 8) this.grosseCaisse(x, { bus, niveau: niveau * 0.9, loin });
      if (p === 4 || p === 12) this.grosseCaisse(x, { bus, niveau: niveau * 0.5, loin, grave: 1.5 });
      if ([2, 6, 10, 14].includes(p)) this.caisseClaire(x, { bus, niveau: niveau * 0.5, loin });
      else if (alea() < 0.5) this.caisseClaire(x, { bus, niveau: niveau * 0.18, loin });
    }
  }

  /* =================================================================================
     MACHINE — le râteau balaie, la table remet les quilles (~3,2 s)
     ================================================================================= */
  machine() {
    const t = this.ctx.currentTime + 0.02, loin = { sec: 0.55, envoi: 0.4, passeBas: 6000 }, N = REGLAGES.niveaux.machine;
    const c = this.ctx, g = new Grappe(c), out = g.sortie = this.gain(g, N);
    out.connect(this.sortie(g, 'effets', loin));
    // Moteur électrique (50 Hz + harmoniques) et réducteur qui chante (520 → 760 Hz).
    const hum = this.osc(g, 'sawtooth', 50), lpH = this.filtre(g, 'lowpass', 260, 0.8), eH = this.gain(g, 0);
    hum.connect(lpH).connect(eH).connect(out);
    eH.gain.setValueAtTime(0, t); eH.gain.linearRampToValueAtTime(0.35, t + 0.25); eH.gain.setValueAtTime(0.35, t + 2.85); eH.gain.setTargetAtTime(0, t + 2.9, 0.12);
    hum.frequency.setValueAtTime(38, t); hum.frequency.linearRampToValueAtTime(50, t + 0.25);
    const whine = this.osc(g, 'triangle', 520), eW = this.gain(g, 0), vib = this.osc(g, 'sine', 7);
    vib.connect(this.gain(g, 6)).connect(whine.frequency);
    whine.frequency.setValueAtTime(380, t); whine.frequency.linearRampToValueAtTime(620, t + 0.4); whine.frequency.setValueAtTime(620, t + 1.55);
    whine.frequency.linearRampToValueAtTime(540, t + 1.75); whine.frequency.linearRampToValueAtTime(700, t + 2.5); whine.frequency.linearRampToValueAtTime(400, t + 3.0);
    eW.gain.setValueAtTime(0, t); eW.gain.linearRampToValueAtTime(0.045, t + 0.3); eW.gain.setValueAtTime(0.045, t + 2.8); eW.gain.setTargetAtTime(0, t + 2.9, 0.1);
    whine.connect(eW).connect(out);
    for (const s of [hum, whine, vib]) s.start(t);
    // Balayage : le souffle de la barre qui pousse les quilles (bande qui monte 500 → 1400 Hz).
    const sw = this.bruit(g, 'rose'), bpS = this.filtre(g, 'bandpass', 500, 1.2), eS = this.gain(g, 0);
    bpS.frequency.setValueAtTime(500, t + 0.35); bpS.frequency.exponentialRampToValueAtTime(1400, t + 0.95);
    eS.gain.setValueAtTime(0, t + 0.3); eS.gain.linearRampToValueAtTime(0.5, t + 0.45); eS.gain.setTargetAtTime(0, t + 0.9, 0.08);
    sw.connect(bpS).connect(eS).connect(out); this.demarrer(sw, t);
    g.fin(t + 3.4);
    // Pièces métalliques : modes d'une barre d'acier (longs, inharmoniques).
    const clunk = (tt, n) => { const j = entre(0.97, 1.03); this.frappe(tt, { ...loin, niveau: n * N,
      modes: [180, 470, 1020, 1740, 2630].map((f, k) => ({ f: f * j, a: [0.7, 1, 0.6, 0.4, 0.25][k] * entre(0.7, 1.1), t60: [0.35, 0.3, 0.22, 0.15, 0.1][k] })),
      transitoire: { type: 'bandpass', f: 2500, q: 0.8, duree: 0.01, niveau: 0.8 }, corps: { f0: 110, f1: 70, duree: 0.08, niveau: 0.5 } }); };
    // Cliquetis de la chaîne : tics métalliques irréguliers pendant tout le cycle.
    const tic = (tt) => this.frappe(tt, { ...loin, niveau: entre(0.04, 0.12) * N,
      modes: [{ f: entre(2800, 3100), a: 0.6, t60: 0.03 }, { f: entre(4000, 4400), a: 0.4, t60: 0.02 }], transitoire: { type: 'highpass', f: 3000, q: 0.7, duree: 0.004, niveau: 1 } });
    for (let x = t + 0.2; x < t + 2.7; x += entre(0.035, 0.12)) tic(x);
    clunk(t + 0.15, 0.6);                                   // la barre de balayage descend
    for (let k = 0; k < 7; k++) {                            // les quilles poussées s'entrechoquent…
      const tt = t + entre(0.4, 0.9), i = entre(0.15, 0.45);
      this.frappe(tt, { ...loin, niveau: niveauDe(i) * 0.6 * N, modes: this.modesQuille(0, i, { clair: 0.2, gain: 0.6 }).slice(0, 5),
        transitoire: { type: 'bandpass', f: 4000, q: 1, duree: 0.008, niveau: 0.8 } });
    }
    for (let k = 0; k < 5; k++) {                            // … et tombent dans la fosse
      this.frappe(t + entre(0.7, 1.2), { ...loin, sec: 0.35, niveau: 0.35 * N, passeBas: 1500,
        transitoire: { bruit: 'rose', type: 'lowpass', f: 450, q: 0.7, duree: 0.1, niveau: 1 }, corps: { f0: 95, f1: 60, duree: 0.14, niveau: 0.6 } });
    }
    clunk(t + 1.25, 0.45);                                  // fin de course
    clunk(t + 1.9, 0.35);                                   // la table descend…
    const td = t + 2.15;                                     // … dépose les 10 quilles (presque ensemble)
    for (let n = 1; n <= 10; n++) {
      this.frappe(td + entre(0, 0.09), { ...loin, niveau: entre(0.18, 0.3) * N, pan: entre(-0.3, 0.3),
        modes: this.modesQuille(n, 0.3, { clair: -0.3, gain: 0.5 }).slice(0, 4).concat([{ f: entre(200, 235), a: 0.7, t60: 0.08 }]),
        transitoire: { bruit: 'rose', type: 'lowpass', f: 1500, q: 0.7, duree: 0.02, niveau: 0.6 } });
    }
    clunk(td + 0.12, 0.55);
    clunk(t + 2.75, 0.3);                                   // la table remonte
  }

  /* =================================================================================
     AMBIANCE (boucle) — horloge à anticipation : toutes les 150 ms, on planifie les 500 ms suivantes
     ================================================================================= */
  ambiance(on) {
    if (on && !this.amb) {
      this.amb = this.etat.theme === 'cgt' ? new AmbianceCGT(this) : new AmbianceBony(this);
      clearInterval(this.horloge); this.horloge = setInterval(() => { try { this.amb && this.amb.tick(); } catch (e) { console.warn('[son] ambiance', e); } }, 150);
      this.amb.tick();
    } else if (!on && this.amb) {
      this.amb.arreter(); this.amb = null; clearInterval(this.horloge);
    }
  }

  diagnostic() {
    const now = this.ctx.currentTime;
    this.analyseur.getFloatTimeDomainData(this.mesure);
    let crete = 0, e = 0; for (const v of this.mesure) { crete = Math.max(crete, Math.abs(v)); e += v * v; }
    const rms = Math.sqrt(e / this.mesure.length);
    return {
      etat: this.ctx.state, voix: this.voix.filter((v) => v.fin > now).length, budget: REGLAGES.poly.chocs,
      vols: this.vols, abandons: this.abandons, densite: +this.densite(now).toFixed(2),
      creteDb: +(20 * Math.log10(crete + 1e-9)).toFixed(1), rmsDb: +(20 * Math.log10(rms + 1e-9)).toFixed(1), reductionDb: +(this.comp.reduction || 0).toFixed(1),
      roulement: !!this.roul, ambiance: this.amb ? this.amb.nom : null,
    };
  }
}

/* -------------------------------------------------------------------------------------
   Ambiances
   ------------------------------------------------------------------------------------- */
/** Socle commun : un sous-bus qu'on peut fondre d'un coup. (Les « bavards » à formants ont été retirés le
 *  17/10/2026 : aucune voix synthétisée.) */
class AmbianceBase {
  constructor(m, nom, volume = 1) {
    this.m = m; this.nom = nom; const c = m.ctx, b = m.bus.ambiance;
    this.g = new Grappe(c);
    const sec = this.g.sortie = m.gain(this.g, 0), mouille = m.gain(this.g, 0);
    sec.connect(b.sec); mouille.connect(b.mouille);
    for (const x of [sec, mouille]) { x.gain.setValueAtTime(0, c.currentTime); x.gain.linearRampToValueAtTime(volume, c.currentTime + 2); }
    this.sb = { sec, mouille, envoi: b.envoi };
    this.longues = []; // grappes planifiées loin dans le futur : à couper à l'arrêt
  }
  get now() { return this.m.ctx.currentTime; }
  /** Horizon de planification ; onglet caché → les minuteurs sont bridés à 1 s, on voit plus loin. Les échéances
   *  restées dans le passé (onglet endormi) sont recalées au lieu d'être toutes jouées d'un coup. */
  horizon() {
    const now = this.now;
    for (const k of Object.keys(this)) if (k.startsWith('prochain') && typeof this[k] === 'number' && this[k] < now) this[k] = now + entre(0.2, 1.5);
    return now + (typeof document !== 'undefined' && document.hidden ? 1.4 : 0.5);
  }
  arreter() {
    const t = this.now;
    for (const g of this.longues) if (!g.libre) g.couper(0.3);
    for (const x of [this.sb.sec, this.sb.mouille]) { x.gain.cancelScheduledValues(t); x.gain.setValueAtTime(x.gain.value, t); x.gain.linearRampToValueAtTime(0, t + 1.2); }
    this.g.fin(t + 1.4);
  }
}

/** BONY : une salle de bowling un samedi soir. Rumeur grave et diffuse, ronron des machines, boules sur les autres
 *  pistes (roulement lointain puis impact, parfois un strike et quelques applaudissements), retour de boules. */
class AmbianceBony extends AmbianceBase {
  constructor(m) {
    super(m, 'bony'); const g = this.g, t = this.now;
    // Rumeur : bruits brun + rose très étouffés, SANS bosse de formant (aucune voyelle reconnaissable), deux houles
    // lentes non commensurables. Le brouhaha d'une salle entendu de loin.
    const r = m.bruit(g, 'rose'), rb = m.bruit(g, 'brun'), am = m.gain(g, 0.8), l = m.osc(g, 'sine', 0.13), l2 = m.osc(g, 'sine', 0.071);
    r.connect(m.filtre(g, 'lowpass', 650, 0.5)).connect(m.filtre(g, 'highpass', 110, 0.5)).connect(am);
    rb.connect(m.filtre(g, 'lowpass', 380, 0.5)).connect(m.gain(g, 0.9)).connect(am);
    l.connect(m.gain(g, 0.16)).connect(am.gain); l2.connect(m.gain(g, 0.1)).connect(am.gain);
    am.connect(m.gain(g, 0.26)).connect(m.sortie(g, this.sb, { sec: 0.5, envoi: 0.9 }));
    m.demarrer(rb, t); l2.start(t);
    // Ronron des machines (moteurs des releveurs, ventilation) : très bas, presque subliminal.
    const h = m.bruit(g, 'brun'), hum = m.osc(g, 'sine', 100);
    h.connect(m.filtre(g, 'lowpass', 140, 0.7)).connect(m.gain(g, 0.15)).connect(m.sortie(g, this.sb, { sec: 1, envoi: 0.2 }));
    hum.connect(m.gain(g, 0.006)).connect(m.sortie(g, this.sb, { sec: 1, envoi: 0 }));
    m.demarrer(r, t); m.demarrer(h, t); l.start(t); hum.start(t);
    this.prochainPiste = t + entre(1.5, 4); this.prochainRetour = t + entre(5, 12);
  }
  tick() {
    const m = this.m, h = this.horizon();
    if (this.prochainPiste < h) { this.pisteLointaine(this.prochainPiste); this.prochainPiste += entre(4.5, 11); }
    if (this.prochainRetour < h) {
      const t = this.prochainRetour, pan = entre(-0.9, 0.9);
      for (const dt of [0, entre(0.25, 0.6)]) {
        m.frappe(t + dt, { bus: this.sb, pan, sec: 0.35, envoi: 0.9, passeBas: 4000, niveau: entre(0.05, 0.1),
          modes: [1180, 2650, 3900].map((f, k) => ({ f: f * entre(0.95, 1.05), a: [1, 0.6, 0.3][k], t60: [0.05, 0.035, 0.025][k] })),
          corps: { f0: 260, f1: 190, duree: 0.04, niveau: 0.8 }, transitoire: { type: 'highpass', f: 2000, q: 0.7, duree: 0.004, niveau: 0.6 } });
      }
      this.prochainRetour += entre(9, 20);
    }
  }
  /** Une boule sur une autre piste : roulement qui monte, impact, quelques quilles… ou un strike et des bravos. */
  pisteLointaine(t) {
    const m = this.m, g = new Grappe(m.ctx), pan = entre(-0.95, 0.95), duree = entre(1.6, 2.6);
    const s = m.bruit(g, 'brun'), e = g.sortie = m.gain(g, 0);
    s.connect(m.filtre(g, 'lowpass', 220, 0.8)).connect(m.filtre(g, 'bandpass', 380, 1)).connect(e);
    e.connect(m.sortie(g, this.sb, { pan, sec: 0.25, envoi: 0.9, passeBas: 900 }));
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.18, t + 0.4); e.gain.setTargetAtTime(0.1, t + 0.5, duree * 0.4); e.gain.setTargetAtTime(0, t + duree, 0.05);
    m.demarrer(s, t); g.fin(t + duree + 0.4);
    const ti = t + duree, x = alea();
    if (x < 0.55) {
      const n = Math.floor(entre(2, 6));
      for (let k = 0; k < n; k++) {
        const i = entre(0.3, 0.8);
        m.frappe(ti + k * entre(0.02, 0.08), { bus: this.sb, pan: pan + entre(-0.05, 0.05), sec: 0.3, envoi: 1, passeBas: 2500,
          niveau: niveauDe(i) * 0.12, modes: m.modesQuille(0, i), transitoire: { type: 'bandpass', f: 3500, q: 1, duree: 0.006, niveau: 0.6 } });
      }
    } else {
      const g2 = new Grappe(m.ctx), b = g2.s(m.ctx.createBufferSource()); b.buffer = m.banque(alea() < 0.5 ? 'fracas1' : 'fracas2'); b.playbackRate.value = entre(0.9, 1.05);
      const e2 = g2.sortie = m.gain(g2, x < 0.88 ? 0.12 : 0.22);
      b.connect(e2).connect(m.sortie(g2, this.sb, { pan, sec: 0.3, envoi: 1, passeBas: 2500 })); b.start(ti); g2.fin(ti + 2);
      if (x >= 0.88) { m.applaudir(ti + 0.4, { duree: 1.6, niveau: 0.2, bus: this.sb, loin: 0.8, pan }); }
    }
  }
}

/** CGT : la grève a envahi la salle. Rumeur de manif (sans voix), batucada (surdo + tarol) avec ses « breaks »,
 *  sifflets à roulette qui se répondent, pétards et cornes au loin, et le barbecue / brasero qui grésille. */
class AmbianceCGT extends AmbianceBase {
  constructor(m) {
    super(m, 'cgt', 0.63); const g = this.g, t = this.now; // une manif est plus forte qu'un samedi soir : -4 dB pour rester un fond
    // Rumeur de foule SANS formants (plus dense et un peu plus claire que la salle Bony, toujours sans voyelle).
    const r = m.bruit(g, 'rose'), rb = m.bruit(g, 'brun'), s1 = m.gain(g, 1); this.am = m.gain(g, 0.8);
    r.connect(m.filtre(g, 'lowpass', 900, 0.5)).connect(m.filtre(g, 'highpass', 130, 0.5)).connect(s1);
    rb.connect(m.filtre(g, 'lowpass', 420, 0.5)).connect(m.gain(g, 1.1)).connect(s1);
    s1.connect(this.am).connect(m.gain(g, 0.3)).connect(m.sortie(g, this.sb, { sec: 0.55, envoi: 0.85 }));
    m.demarrer(r, t); m.demarrer(rb, t);
    // Grésillement du barbecue à chipolatas et du brasero (au fond, côté droit du joueur) : souffle aigu filtré, très
    // bas, et des crépitements (graisse qui saute, palettes qui craquent) planifiés dans tick().
    const gr = m.bruit(g, 'blanc'), eg = m.gain(g, 0.012), lg = m.osc(g, 'sine', 0.4);
    gr.connect(m.filtre(g, 'highpass', 2500, 0.6)).connect(m.filtre(g, 'lowpass', 7000, 0.6)).connect(eg);
    lg.connect(m.gain(g, 0.004)).connect(eg.gain);
    eg.connect(m.sortie(g, this.sb, { pan: 0.55, sec: 0.6, envoi: 0.5, passeBas: 6500 }));
    m.demarrer(gr, t); lg.start(t);
    this.prochainCrepit = t + entre(0.1, 0.5);
    // Batucada : 104 à la noire, double-croche = 0,144 s.
    this.dc = 60 / 104 / 4; this.pas = 0; this.tPas = t + 0.3; this.pauseTambour = 0;
    this.prochainSifflet = t + entre(0.5, 2); this.prochainPetard = t + entre(4, 10); this.prochaineCorne = t + entre(15, 30);
    this.prochainAppel = t + entre(4, 8); this.occupeJusqua = 0;
  }
  tick() {
    const m = this.m, h = this.horizon(), now = this.now;
    if (!(this.amTick > now)) this.amTick = now;
    while (this.amTick < h) { this.amTick += entre(0.07, 0.16); this.am.gain.setTargetAtTime(entre(0.55, 1), this.amTick, 0.05); }
    if (this.tPas < now) { const n = Math.ceil((now - this.tPas) / this.dc); this.tPas += n * this.dc; this.pas += n; }
    // Tambours : surdo grave sur 1 et 3, surdo médium sur 2 et 4, tarol en double-croches avec accents.
    while (this.tPas < h) {
      const p = this.pas % 16, t = this.tPas;
      if (t > this.pauseTambour) {
        if (p === 0 || p === 8) m.grosseCaisse(t, { bus: this.sb, niveau: 0.32, loin: 0.5 });
        if (p === 4 || p === 12) m.grosseCaisse(t, { bus: this.sb, niveau: 0.18, loin: 0.5, grave: 1.5 });
        if ([2, 6, 10, 14].includes(p)) m.caisseClaire(t, { bus: this.sb, niveau: 0.16, loin: 0.5 });
        else if (alea() < 0.45) m.caisseClaire(t, { bus: this.sb, niveau: 0.05, loin: 0.5 });
      }
      this.tPas += this.dc; this.pas++;
      if (this.pas % 256 === 0 && alea() < 0.5) this.pauseTambour = this.tPas + entre(5, 9); // les tambours soufflent
    }
    if (this.prochainSifflet < h) { m.sifflet(this.prochainSifflet, { bus: this.sb, niveau: entre(0.04, 0.12), pan: entre(-0.9, 0.9), loin: entre(0.3, 0.9) }); this.prochainSifflet += entre(0.6, 3.2); }
    if (this.prochainPetard < h) {
      const t = this.prochainPetard;
      if (alea() < 0.3) m.rafalePetards(t, Math.floor(entre(8, 20)), { bus: this.sb, niveau: 0.25, loin: 0.85 });
      else m.petard(t, { bus: this.sb, niveau: entre(0.3, 0.55), loin: entre(0.7, 0.95) });
      this.prochainPetard += entre(7, 18);
    }
    if (this.prochaineCorne < h) { m.corne(this.prochaineCorne, { bus: this.sb, niveau: 0.1, loin: 0.8, duree: entre(0.5, 1.2) }); this.prochaineCorne += entre(25, 50); }
    // crépitements du barbecue / brasero
    while (this.prochainCrepit < h) {
      const tc = this.prochainCrepit;
      m.frappe(tc, { bus: this.sb, pan: entre(0.35, 0.75), sec: 0.6, envoi: 0.4, passeBas: 8000, niveau: entre(0.01, 0.035),
        transitoire: { bruit: 'blanc', type: 'bandpass', f: entre(2500, 6000), q: entre(0.8, 2), duree: entre(0.003, 0.008), niveau: 1 } });
      this.prochainCrepit += alea() < 0.2 ? entre(0.02, 0.06) : entre(0.08, 0.5);
    }
    // Appel / réponse SANS voix : un sifflet à roulette lance (motif rythmé), les tambours répondent par un « break »
    // (roulement qui monte + accents de surdo), parfois une corne pour finir.
    if (this.prochainAppel < h && now > this.occupeJusqua) {
      let t = this.prochainAppel; const mesure = this.dc * 16;
      m.sifflet(t, { bus: this.sb, niveau: 0.1, pan: entre(-0.5, 0.5), loin: 0.35, motif: [[0.12, 0.06], [0.12, 0.06], [0.12, 0.06], [0.5, 0]] });
      const origine = this.tPas - this.pas * this.dc; t = origine + Math.ceil((t + 1.0 - origine) / mesure) * mesure;
      this.pauseTambour = t + mesure * 0.5;
      m.rouleCaisse(t, mesure * 0.5, { bus: this.sb, niveau: 0.32, loin: 0.45 });
      for (const k of [0, 3, 6]) m.grosseCaisse(t + mesure * 0.5 + k * this.dc, { bus: this.sb, niveau: 0.42, loin: 0.45 });
      if (alea() < 0.4) m.corne(t + mesure * 0.5 + 0.1, { bus: this.sb, niveau: 0.09, loin: 0.7, duree: entre(0.5, 0.9) });
      this.occupeJusqua = t + mesure; this.prochainAppel = t + mesure + entre(10, 22);
    }
  }
}

/* =====================================================================================
   FAÇADE — l'objet S du contrat. Rien ne doit jamais faire planter le jeu : tout est sous try/catch.
   ===================================================================================== */
export function creerSon() {
  let m = null, avert = false;
  const etat = { actif: false, theme: 'bony', ambiance: false, mix: { ...REGLAGES.mix } };
  const pret = () => m && etat.actif && m.ctx.state !== 'closed';
  const sur = (fn) => (...a) => { try { if (pret()) return fn(...a); } catch (e) { if (!avert) { avert = true; console.warn('[son]', e); } } };
  const S = {
    /** true : crée (au 1er appel, DANS un geste de l'utilisateur) ou reprend le contexte audio. false : coupe tout. */
    activer(on) {
      try {
        if (on) {
          if (!m) m = new Moteur(etat);
          etat.actif = true;
          if (m.ctx.state !== 'running') m.ctx.resume();
          if (etat.ambiance) m.ambiance(true);
        } else if (m) {
          etat.actif = false;
          if (m.roul) m.roul.detruire();
          m.ambiance(false);
          setTimeout(() => { if (!etat.actif && m.ctx.state === 'running') m.ctx.suspend(); }, 250);
        }
      } catch (e) { console.warn('[son] activation impossible', e); }
    },
    /** 'bony' | 'cgt' ; si l'ambiance tourne, elle bascule (fondu de 1,2 s). */
    theme(t) {
      const nouveau = t === 'cgt' ? 'cgt' : 'bony';
      if (nouveau === etat.theme) return;
      etat.theme = nouveau;
      if (pret() && etat.ambiance) { try { m.ambiance(false); m.ambiance(true); } catch (e) { /* rien */ } }
    },
    ambiance(on) { etat.ambiance = !!on; if (pret()) { try { m.ambiance(!!on); } catch (e) { console.warn('[son]', e); } } },
    lacher: sur((force) => m.lacher(force)),
    roulement: sur((e) => m.roulement(e)),
    contact: sur((c) => { if (c && c.type) m.contact(c); }),
    resultat: sur((r) => m.resultat(r)),
    machine: sur(() => m.machine()),
    /** Ajout (hors contrat, facultatif) : volumes 0..1+ des bus { general, effets, foule, ambiance }. */
    mix(v) { Object.assign(etat.mix, v || {}); if (m) m.appliquerMix(etat.mix); return { ...etat.mix }; },
    /** Ajout (hors contrat, facultatif) : état du moteur pour la table de mixage (voix, crête, compression). */
    diagnostic() { return m ? m.diagnostic() : { etat: 'non créé' }; },
    /** Ajout (intégration v2, 18/10/2026) : fermeture de la fenêtre — ambiance arrêtée, horloge coupée, AudioContext fermé. */
    fermer() {
      etat.actif = false;
      const mm = m; m = null;
      if (!mm) return;
      try { if (mm.roul) mm.roul.detruire(); } catch (e) { /* rien */ }
      try { mm.ambiance(false); } catch (e) { /* rien */ }
      clearInterval(mm.horloge);
      try { if (mm.ctx.state !== 'closed') mm.ctx.close(); } catch (e) { /* rien */ }
    },
  };
  return S;
}
