// =====================================================================
// Reconnaissance du balayage 2 doigts à partir des événements `wheel` — SANS DOM.
//
// Le navigateur ne dit ni « doigts posés », ni « doigts levés », ni « inertie » : un balayage de pavé
// arrive comme un flux de `wheel` (deltaX), et après le lever des doigts le système continue d'en
// émettre en décroissant (inertie). Ce module déduit les phases du flux lui-même :
//   repos → (décision d'axe) → suivi → [lever détecté] → inertie avalée → repos
// Règles (calibrées sur les enregistrements de maquettes/ux/diag-geste.html) :
//  - axe décidé une fois pour tout le geste, sur les premiers pixels (un geste vertical est ignoré
//    jusqu'à la fin, un geste horizontal ne défile jamais verticalement) ;
//  - LEVER = décroissance continue du flux (plusieurs échantillons qui baissent) : on conclut tout de
//    suite avec la vitesse d'avant la décroissance, au lieu d'attendre la fin de l'inertie ;
//  - FIN sans inertie (doigts immobiles puis levés) = silence de `idle` ms ;
//  - NOUVEAU GESTE pendant l'inertie = reprise après une coupure (poser les doigts coupe l'inertie),
//    ré-accélération nette, ou changement de sens : on peut enchaîner des balayages rapides.
// Pure et déterministe (horodatages fournis) : rejouable en test (scripts/gesture-replay.mjs).
// =====================================================================

export interface WheelSample { t: number; dx: number; dy: number }

export interface SwipeOpts {
  /** Pixels cumulés (|dx|+|dy|) avant de décider l'axe. */
  axisPx: number;
  /** Horizontal si |dx| > |dy| × axisRatio sur ces premiers pixels. */
  axisRatio: number;
  /** Silence qui conclut un geste suivi (doigts immobiles puis levés), en ms. */
  idle: number;
  /** Silence qui conclut l'inertie ou un geste ignoré, en ms (l'inertie est un flux continu). */
  gap: number;
  /** Échantillons consécutifs en baisse pour conclure « doigts levés ». */
  decayRun: number;
  /** Baisse totale minimale sur la série (fraction du premier), pour ne pas confondre avec une vitesse constante. */
  decayDrop: number;
  /** Ré-accélération pendant l'inertie qui ouvre un nouveau geste (rapport au précédent). */
  reaccel: number;
  /** … et amplitude minimale de cet échantillon, en px. */
  reaccelPx: number;
  /** Fenêtre de calcul de la vitesse, en ms. */
  velWindow: number;
}

export const DEFAULT_SWIPE: SwipeOpts = {
  axisPx: 6, axisRatio: 1.2, idle: 120, gap: 60, decayRun: 4, decayDrop: 0.25, reaccel: 1.6, reaccelPx: 6, velWindow: 60,
};

export type EndReason = 'lift' | 'idle' | 'cancel';
export interface SwipeHandlers {
  /** Début d'un geste HORIZONTAL. Retourner false : le geste n'est pas pris (il est ignoré jusqu'à sa fin). */
  begin(first: WheelSample): boolean;
  /** Déplacement cumulé depuis le début (px, signe de deltaX) et vitesse (px/ms). */
  move(acc: number, v: number, s: WheelSample): void;
  /** Fin : déplacement total, vitesse au lever (px/ms, 0 si les doigts se sont arrêtés), cause. */
  end(acc: number, v: number, reason: EndReason): void;
}

export type SwipeState = 'rest' | 'pending' | 'track' | 'coast' | 'ignore';

export function createSwipeRecognizer(handlers: SwipeHandlers, opts: Partial<SwipeOpts> = {}) {
  const o = { ...DEFAULT_SWIPE, ...opts };
  let state: SwipeState = 'rest';
  let acc = 0, pdx = 0, pdy = 0, lastT = -Infinity, prev = 0, peak = 0;
  let pending: WheelSample[] = [];
  let hist: WheelSample[] = [];        // échantillons récents (vitesse)
  let run = 0, runStart = 0, vBeforeDecay = 0, lastV = 0;
  let coastPrev = 0, coastUp = 0, valley = 0;

  const vel = (t: number) => {
    const from = t - o.velWindow; let sum = 0, t0 = t;
    for (let i = hist.length - 1; i >= 0 && hist[i].t >= from; i--) { sum += hist[i].dx; t0 = hist[i].t; }
    const dt = Math.max(t - t0, 16);
    return sum / dt;
  };

  function finish(reason: EndReason, v: number) {
    const a = acc;
    state = reason === 'lift' ? 'coast' : 'rest';
    coastPrev = Math.abs(prev); coastUp = 0; valley = coastPrev;
    acc = 0; hist = []; run = 0;
    handlers.end(a, v, reason);
  }

  function start(s: WheelSample) {
    // Décision d'axe sur les premiers pixels.
    pending.push(s); pdx += s.dx; pdy += s.dy;
    if (Math.abs(pdx) + Math.abs(pdy) < o.axisPx) { state = 'pending'; return; }
    const horiz = Math.abs(pdx) > Math.abs(pdy) * o.axisRatio;
    const first = pending[0], all = pending;
    pending = []; pdx = 0; pdy = 0;
    if (!horiz || !handlers.begin(first)) { state = 'ignore'; return; }
    state = 'track'; acc = 0; hist = []; run = 0; peak = 0; prev = 0; lastV = 0;
    for (const x of all) track(x);
  }

  function track(s: WheelSample) {
    acc += s.dx; hist.push(s); if (hist.length > 64) hist.shift();
    const a = Math.abs(s.dx);
    // Série en baisse (même sens, amplitude qui ne remonte pas).
    if (prev && Math.sign(s.dx) === Math.sign(prev) && a <= Math.abs(prev) && a > 0) {
      if (run === 0) { runStart = Math.abs(prev); vBeforeDecay = lastV; }
      run++;
    } else run = 0;
    peak = Math.max(peak, a);
    prev = s.dx;
    const v = vel(s.t); lastV = run ? lastV : v;
    handlers.move(acc, v, s);
    if (run >= o.decayRun && runStart > 0 && (runStart - a) / runStart >= o.decayDrop && a < peak) finish('lift', vBeforeDecay);
  }

  /** Un échantillon. Rend l'état APRÈS traitement : 'track'/'coast' = le geste est à nous (preventDefault). */
  function feed(s: WheelSample): SwipeState {
    const gapMs = s.t - lastT;
    // Silences : fin de geste suivi, fin d'inertie, fin de geste ignoré.
    if (state === 'track' && gapMs > o.idle) finish('idle', 0);
    else if (state === 'pending' && gapMs > o.idle) { state = 'rest'; pending = []; pdx = 0; pdy = 0; }
    else if (state === 'coast' && gapMs > o.gap) {
      // Coupure dans l'inertie : un fil principal chargé (animation en cours) retarde aussi les
      // événements. Un échantillon qui continue la décroissance dans le même sens reste de l'inertie ;
      // un vrai nouveau geste est repéré par la ré-accélération ou le changement de sens (plus bas).
      const cont = Math.sign(s.dx) === Math.sign(prev) && Math.abs(s.dx) <= coastPrev * 1.2 && gapMs < 400;
      if (!cont) state = 'rest';
    }
    else if (state === 'ignore' && gapMs > o.gap) state = 'rest';
    lastT = s.t;

    if (state === 'coast') {
      const a = Math.abs(s.dx);
      const flip = Math.sign(s.dx) !== 0 && Math.sign(s.dx) !== Math.sign(prev) && a >= 2;
      // Ré-accélération : deux échantillons de suite nettement au-dessus du CREUX de l'inertie.
      const up = a >= o.reaccelPx && a > valley * o.reaccel;
      coastUp = up ? coastUp + 1 : 0;
      if (a) { coastPrev = a; prev = s.dx; if (!up) valley = Math.min(valley, a); }
      if (flip || coastUp >= 2) { state = 'rest'; coastUp = 0; }
      else return 'coast';
    }
    if (state === 'ignore') return 'ignore';
    if (state === 'rest' || state === 'pending') { start(s); return state; }
    track(s);
    return state;
  }

  /** À appeler sur minuterie : conclut un geste dont le flux s'est arrêté. */
  function flush(t: number) {
    if (state === 'track' && t - lastT > o.idle) finish('idle', 0);
    else if (state === 'pending' && t - lastT > o.idle) { state = 'rest'; pending = []; pdx = 0; pdy = 0; }
    else if (state === 'coast' && t - lastT > 400) state = 'rest';
    else if (state === 'ignore' && t - lastT > o.gap) state = 'rest';
  }

  function cancel() { if (state === 'track') finish('cancel', 0); state = 'rest'; pending = []; }

  return { feed, flush, cancel, state: () => state, opts: o };
}
