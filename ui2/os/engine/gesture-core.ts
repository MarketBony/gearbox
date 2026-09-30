// =====================================================================
// Reconnaissance du balayage 2 doigts à partir des événements `wheel` — SANS DOM.
//
// Le navigateur ne dit ni « doigts posés », ni « doigts levés », ni « inertie » : un balayage de pavé
// arrive comme un flux de `wheel` (deltaX), et après le lever des doigts le système peut continuer d'en
// émettre en décroissant (inertie). Ce module déduit les phases du flux lui-même :
//   repos → (décision d'axe) → suivi → [lever détecté] → inertie avalée → repos
// Règles (calibrées le 30/09/2026 sur le diagnostic du pavé de Théo, maquettes/ux/diag-geste.html) :
//  - axe décidé une fois pour tout le geste, sur les premiers pixels (un geste vertical est ignoré
//    jusqu'à la fin, un geste horizontal ne défile jamais verticalement) ;
//  - tout se lit sur une VITESSE LISSÉE (somme des deltaX sur `velWindow` ms) : sur un pavé Windows les
//    deltaX sont des entiers très bruités pendant que les doigts bougent (20, 30, 21, 20, 30…), alors que
//    l'inertie, quand il y en a, est une décroissance lisse ;
//  - LEVER = l'événement à delta NUL (dx = dy = 0) que Chrome émet exactement quand les doigts quittent le
//    pavé (Windows, pavé de précision : présent à la fin de CHAQUE geste du diagnostic, juste avant
//    l'inertie). On conclut tout de suite, avec la vitesse d'avant, sans attendre la fin de l'inertie ;
//  - SECOURS tant qu'aucun delta nul n'a été vu (autre pavé / navigateur) : après un geste réellement
//    RAPIDE (pic ≥ `liftMinV`), vitesse qui baisse `decayRun` fois de suite jusqu'à `liftRatio` du pic.
//    Il se trompe sur un geste qui ralentit puis repart sans lever : d'où la priorité au delta nul ;
//  - FIN sans inertie (doigts immobiles puis levés) = silence de `idle` ms (la fin d'un geste lent est
//    clairsemée : trous de 67 à 133 ms mesurés, d'où 160) ;
//  - NOUVEAU GESTE pendant l'inertie = vitesse qui repart nettement au-dessus du creux (plusieurs fois
//    de suite), ou changement de sens : on peut enchaîner des balayages rapides.
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
  /** Silence qui conclut un geste ignoré, en ms. */
  gap: number;
  /** Silence qui conclut l'inertie, en ms (un fil principal chargé retarde aussi les événements). */
  coastIdle: number;
  /** Fenêtre de la vitesse lissée, en ms. */
  velWindow: number;
  /** Pic de vitesse (px/ms) à partir duquel un geste peut « lever » (sinon il finit sur silence). */
  liftMinV: number;
  /** Lever quand la vitesse retombe sous cette fraction du pic… */
  liftRatio: number;
  /** … après autant de baisses consécutives. */
  decayRun: number;
  /** Nouveau geste pendant l'inertie : vitesse au-dessus de max(reviveV, creux × reviveRatio)… */
  reviveV: number;
  reviveRatio: number;
  /** … autant de fois de suite. */
  reviveRun: number;
}

export const DEFAULT_SWIPE: SwipeOpts = {
  axisPx: 6, axisRatio: 1.2, idle: 160, gap: 60, coastIdle: 400, velWindow: 50,
  liftMinV: 0.6, liftRatio: 0.6, decayRun: 3, reviveV: 0.4, reviveRatio: 2.5, reviveRun: 2,
};

export type EndReason = 'lift' | 'idle' | 'cancel';
export interface SwipeHandlers {
  /** Début d'un geste HORIZONTAL. Retourner false : le geste n'est pas pris (il est ignoré jusqu'à sa fin). */
  begin(first: WheelSample): boolean;
  /** Déplacement cumulé depuis le début (px, signe de deltaX) et vitesse lissée (px/ms). */
  move(acc: number, v: number, s: WheelSample): void;
  /** Fin : déplacement total, vitesse au lever (px/ms, 0 si les doigts se sont arrêtés), cause. */
  end(acc: number, v: number, reason: EndReason): void;
}

export type SwipeState = 'rest' | 'pending' | 'track' | 'coast' | 'ignore';

export function createSwipeRecognizer(handlers: SwipeHandlers, opts: Partial<SwipeOpts> = {}) {
  const o = { ...DEFAULT_SWIPE, ...opts };
  let state: SwipeState = 'rest';
  let acc = 0, pdx = 0, pdy = 0, lastT = -Infinity, dir = 0;
  let pending: WheelSample[] = [];
  let hist: WheelSample[] = [];
  let peakV = 0, lastA = 0, run = 0, vDecay = 0, lastV = 0;
  let valley = 0, revive = 0, sawZero = false, warm = 0;

  /** Vitesse lissée (px/ms, signée) : somme des deltaX sur la fenêtre, divisée par la fenêtre. */
  const vel = (t: number) => {
    let sum = 0;
    for (let i = hist.length - 1; i >= 0 && hist[i].t > t - o.velWindow; i--) sum += hist[i].dx;
    return sum / o.velWindow;
  };
  const push = (s: WheelSample) => { hist.push(s); if (hist.length > 48) hist.shift(); };

  function finish(reason: EndReason, v: number) {
    const a = acc;
    state = reason === 'lift' ? 'coast' : 'rest';
    valley = Math.abs(lastV); revive = 0;
    acc = 0; run = 0;
    handlers.end(a, v, reason);
  }

  function start(s: WheelSample) {
    // Décision d'axe sur les premiers pixels.
    pending.push(s); pdx += s.dx; pdy += s.dy;
    if (Math.abs(pdx) + Math.abs(pdy) < o.axisPx) { state = 'pending'; return; }
    const horiz = Math.abs(pdx) > Math.abs(pdy) * o.axisRatio;
    const first = pending[0], all = pending;
    dir = Math.sign(pdx);
    pending = []; pdx = 0; pdy = 0;
    if (!horiz || !handlers.begin(first)) { state = 'ignore'; return; }
    state = 'track'; acc = 0; hist = []; run = 0; peakV = 0; lastA = 0; lastV = 0;
    for (const x of all) { if (state === 'track') track(x); }
  }

  function track(s: WheelSample) {
    if (s.dx === 0 && s.dy === 0) { sawZero = true; finish('lift', lastV); return; }   // doigts levés
    acc += s.dx; push(s);
    const v = vel(s.t), a = Math.abs(v);
    if (a < lastA - 1e-3) { if (run === 0) vDecay = lastV; run++; } else if (a > lastA + 1e-3) run = 0;
    peakV = Math.max(peakV, a); lastA = a; lastV = v;
    if (v) dir = Math.sign(v);
    handlers.move(acc, v, s);
    if (!sawZero && peakV >= o.liftMinV && run >= o.decayRun && a <= peakV * o.liftRatio) finish('lift', vDecay);
  }

  /** Un échantillon. Rend l'état APRÈS traitement : 'track'/'coast' = le geste est à nous (preventDefault). */
  function feed(s: WheelSample): SwipeState {
    const gapMs = s.t - lastT;
    if (state === 'track' && gapMs > o.idle) finish('idle', 0);
    else if (state === 'pending' && gapMs > o.idle) { state = 'rest'; pending = []; pdx = 0; pdy = 0; }
    else if (state === 'coast' && gapMs > o.coastIdle) state = 'rest';
    else if (state === 'ignore' && gapMs > o.gap) state = 'rest';
    lastT = s.t;

    if (s.dx === 0 && s.dy === 0 && state !== 'track') return state;   // delta nul hors suivi : sans objet
    if (state === 'coast') {
      // Après une coupure, la vitesse lissée repart de zéro : on attend une fenêtre pleine avant de juger
      // (sinon ce faux creux ferait prendre la suite de l'inertie pour un nouveau geste).
      if (gapMs > o.velWindow) warm = s.t + o.velWindow;
      push(s);
      if (s.t < warm) return 'coast';
      const a = Math.abs(vel(s.t));
      const flip = Math.sign(s.dx) !== 0 && Math.sign(s.dx) !== dir && Math.abs(s.dx) >= 2;
      const up = a > Math.max(o.reviveV, valley * o.reviveRatio);
      revive = up ? revive + 1 : 0;
      if (!up) valley = Math.min(valley, a);
      if (!flip && revive < o.reviveRun) return 'coast';
      // Nouveau geste : il repart des derniers échantillons de la reprise.
      const since = flip ? [s] : hist.slice(-o.reviveRun);
      state = 'rest'; revive = 0; hist = [];
      for (const x of since) { if (state === 'rest' || state === 'pending') start(x); else if (state === 'track') track(x); }
      return state;
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
    else if (state === 'coast' && t - lastT > o.coastIdle) state = 'rest';
    else if (state === 'ignore' && t - lastT > o.gap) state = 'rest';
  }

  function cancel() { if (state === 'track') finish('cancel', 0); state = 'rest'; pending = []; }

  return { feed, flush, cancel, state: () => state, opts: o, lifts: () => sawZero };
}
