// @ts-nocheck — module du moteur (même style que les fichiers convertis).
// =====================================================================
// [GEARBOX] Balayage 2 doigts entre les fenêtres du bureau courant (destinataire `windows` de la porte
// unique, engine/gesture.ts). La transition SUIT LES DOIGTS puis se termine sur un ressort qui part de
// la vitesse du geste. Deux rendus, au choix dans Réglages › Bureau et Dock (`gestureMode`) :
//  - « Glissement » (slide) : comme les apps plein écran du Mac, la fenêtre part sur le côté et la
//    voisine arrive à sa place ; les autres s'effacent le temps du geste.
//  - « Bandeau » (strip) : les fenêtres se rangent en cartes réduites sur une ligne qui défile avec les
//    doigts ; on peut en sauter plusieurs d'un geste lancé. La carte du centre prend le premier plan.
//  - « Auto » : Glissement si la fenêtre sous le curseur est agrandie ou plein écran, Bandeau sinon.
// Ordre de parcours : celui du Dock (ordre d'ouverture pour une rubrique hors Dock), figé pendant le
// geste ; fenêtres réduites exclues ; pas de passage au bureau suivant en bout de liste (butée élastique).
// Tout mouvement = transform/opacity, écrit une fois par image (rAF), jamais de mise en page.
// =====================================================================
export function install(): void {
  const GX = (window as any).GX;
  if (!GX.gesture) return;
  const GAP_SLIDE = 28, GAP_STRIP = 44;
  const mode = () => GX.store.get('gestureMode', 'auto');
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rub = (x, min, max) => (x < min ? min - Math.sqrt(min - x) * 6 : x > max ? max + Math.sqrt(x - max) * 6 : x);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /** Ordre du Dock, puis ordre d'ouverture. */
  function order() {
    const dock = [...GX.root.querySelectorAll('#dock .dk')].map((d) => d.dataset.app);
    const all = GX.wm.list();
    return GX.wm.visible()
      .map((w) => ({ w, k: dock.indexOf(w.app.parent || w.appId), o: all.indexOf(w) }))
      .sort((a, b) => (a.k < 0 ? 999 : a.k) - (b.k < 0 ? 999 : b.k) || a.o - b.o)
      .map((x) => x.w);
  }

  /* Ressort amorti (x'' = -k(x - cible) - c·x'), intégré image par image : part de la vitesse du geste. */
  function spring(from, to, v0, onFrame, done, k = 300, zeta = .86) {
    const c = 2 * Math.sqrt(k) * zeta; let x = from, v = v0, last = performance.now(), raf = 0;
    const step = (now) => {
      const dt = Math.min(.034, (now - last) / 1000); last = now;
      for (let i = 0; i < 4; i++) { const a = -k * (x - to) - c * v; v += (a * dt) / 4; x += (v * dt) / 4; }
      if (Math.abs(x - to) < .002 && Math.abs(v) < .02) { onFrame(to); done(); return; }
      onFrame(x); raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }
  function tween(ms, ease, onFrame, done) {
    const t0 = performance.now(); let raf = 0;
    const step = (now) => { const t = Math.min(1, (now - t0) / ms); onFrame(ease(t)); if (t < 1) raf = requestAnimationFrame(step); else done(); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }

  let g = null;            // geste en cours (ou fin animée)
  let loop = 0;

  function frame() { loop = 0; if (!g) return; render(); if (g.live) loop = requestAnimationFrame(frame); }
  function startLoop() { if (!loop) loop = requestAnimationFrame(frame); }

  /* ---------------- Glissement ---------------- */
  function renderSlide() {
    const now = performance.now(), W = g.W + GAP_SLIDE;
    g.list.forEach((w, k) => {
      if (k !== g.i0 && now < g.fadeUntil) return;          // encore en fondu à sa place
      const o = k - g.pos, vis = Math.abs(o) < 1;
      w.el.style.transition = 'none';
      w.el.style.opacity = vis ? '' : '0';
      w.el.style.transform = `translate3d(${(vis ? o : Math.sign(o)) * W}px,0,0)`;
    });
  }

  /* ---------------- Bandeau ---------------- */
  function layoutStrip() {
    const W = innerWidth, H = innerHeight;
    g.cards = g.list.map((w) => { const r = w.rect, s = Math.min(.46, (H * .5) / r.h, (W * .34) / r.w); return { r, s, cw: r.w * s, ch: r.h * s }; });
    g.c = [0]; for (let k = 1; k < g.cards.length; k++) g.c[k] = g.c[k - 1] + g.cards[k - 1].cw / 2 + GAP_STRIP + g.cards[k].cw / 2;
    g.S = g.cards.length > 1 ? g.c[g.c.length - 1] / (g.cards.length - 1) : W * .3;
    g.cy = H * .47;
  }
  const centerAt = (p) => {
    const n = g.c.length; if (p <= 0) return g.c[0] + p * g.S; if (p >= n - 1) return g.c[n - 1] + (p - (n - 1)) * g.S;
    const i = Math.floor(p), f = p - i; return g.c[i] + (g.c[i + 1] - g.c[i]) * f;
  };
  function renderStrip() {
    const e = g.e, C = centerAt(g.pos), sel = Math.round(clamp(g.pos, 0, g.list.length - 1));
    if (g.veil) g.veil.style.opacity = String(e);
    g.list.forEach((w, k) => {
      const d = g.cards[k], r = d.r;
      const left = innerWidth / 2 + (g.c[k] - C) - d.cw / 2, top = g.cy - d.ch / 2;
      const sc = 1 + (d.s - 1) * e;
      w.el.style.transition = 'none';
      w.el.style.transform = `translate3d(${(left - r.x) * e}px,${(top - r.y) * e}px,0) scale(${sc})`;
      w.el.classList.toggle('gx-sw-on', e > .5 && k === sel);
    });
  }

  function render() { g.kind === 'slide' ? renderSlide() : renderStrip(); }

  /* ---------------- Cycle du geste ---------------- */
  function begin(ev) {
    if (mode() === 'off' || GX.host.dataset.shell === 'mobile' || GX.wm.missionOn?.() || GX.wm.desktopShown?.()) return false;
    // Reprise pendant la fin animée : on repart de là où on en est.
    if (g && !g.live) { g.stop?.(); g.live = true; g.base = g.pos; g.acc = 0; g.fadeUntil = 0; if (g.kind === 'strip') { const e0 = g.e; g.stop = tween(160, easeOut, (t) => { g.e = e0 + (1 - e0) * t; }, () => {}); } startLoop(); return; }
    const list = order(); if (!list.length) return false;
    const el = ev.target.closest?.('.win'), under = list.find((w) => w.el === el) || GX.wm.active();
    const i0 = Math.max(0, list.indexOf(under)), w0 = list[i0];
    const maxed = w0.state === 'max' || w0.state === 'full' || (w0.state === 'snap' && w0.zone === 'max');
    const m = mode(), kind = list.length < 2 ? 'slide' : m === 'slide' ? 'slide' : m === 'strip' ? 'strip' : maxed ? 'slide' : 'strip';
    g = { kind, list, i0, base: i0, pos: i0, acc: 0, W: innerWidth, e: 0, live: true, fadeUntil: performance.now() + 120 };
    // Souris bloquée par un écran transparent, PAS par une classe sur l'hôte : une classe sur l'hôte fait
    // recalculer les styles de toute la coque (tâche de 70 ms mesurée au début du geste).
    g.shield = document.createElement('div'); g.shield.className = 'gx-sw-shield'; GX.body.append(g.shield);
    GX.gesture.register(g.shield, GX.gesture.owners.windows);   // un geste relancé pendant la fin animée reste ici
    if (GX.store.get('gestureLite', false)) GX.host.classList.add('gx-swipe-lite');
    list.forEach((w) => { w.el.style.transformOrigin = '0 0'; });
    if (kind === 'slide') {
      list.forEach((w, k) => { if (k !== i0) { w.el.style.transition = 'opacity 120ms ease-out'; w.el.style.opacity = '0'; } });
    } else {
      layoutStrip();
      g.veil = document.createElement('div'); g.veil.className = 'gx-sw-veil'; g.veil.style.opacity = '0';
      w0.el.parentElement.append(g.veil);
      g.stop = tween(240, easeOut, (t) => { g.e = t; }, () => {});
    }
    startLoop();
  }

  function move(acc) {
    if (!g || !g.live) return;
    g.acc = acc;
    const n = g.list.length, unit = g.kind === 'slide' ? g.W : g.S;
    // Glissement : UNE fenêtre par geste au plus (butée élastique au-delà) ; Bandeau : libre.
    const s0 = Math.round(g.base), lo = g.kind === 'slide' ? Math.max(0, s0 - 1) : 0, hi = g.kind === 'slide' ? Math.min(n - 1, s0 + 1) : n - 1;
    g.pos = rub(g.base * unit + acc, lo * unit, hi * unit) / unit;
  }

  function end(acc, v) {
    if (!g || !g.live) return;
    move(acc); g.live = false;
    const n = g.list.length, unit = g.kind === 'slide' ? g.W : g.S, vp = (v * 1000) / unit; // pages par seconde
    const start = Math.round(g.base), d = g.pos - start;
    let j;
    if (g.kind === 'slide') {
      if (Math.abs(d) >= .5) j = start + Math.sign(d);
      else if (Math.abs(d) > .16 || (Math.abs(v) > .35 && Math.sign(v) === Math.sign(d || v))) j = start + Math.sign(d || v);
      else j = start;
    } else j = Math.round(g.pos + vp * .08);
    j = clamp(j, 0, n - 1);
    g.stop?.();
    g.stop = spring(g.pos, j, vp, (x) => { g.pos = x; render(); }, () => finish(j), g.kind === 'slide' ? 300 : 420);
  }

  function finish(j) {
    const w = g.list[j];
    if (g.kind === 'slide') { cleanup(w); return; }
    // Premier plan par le seul z-index pendant le retour : `WM.focus` prévient l'appli (rubrique courante),
    // tâche de 100 à 160 ms mesurée qui faisait caler le zoom à son départ. Le vrai focus vient à la fin.
    w.el.style.zIndex = String(Math.max(...g.list.map((x) => +x.el.style.zIndex || 0)) + 1);
    const e0 = g.e;
    g.stop = tween(300, easeInOut, (t) => { g.e = e0 * (1 - t); render(); }, () => cleanup(w));
  }

  function cleanup(w) {
    const G0 = g; g = null;
    if (loop) { cancelAnimationFrame(loop); loop = 0; }
    if (GX.wm.active() !== w) GX.wm.focus(w);                  // un seul focus, animation finie
    G0.veil?.remove(); G0.shield?.remove();
    G0.list.forEach((x) => {
      x.el.classList.remove('gx-sw-on');
      x.el.style.transform = ''; x.el.style.transformOrigin = '';
      if (G0.kind === 'slide' && x !== w) {
        x.el.style.transition = 'none'; x.el.style.opacity = '0';
        requestAnimationFrame(() => { x.el.style.transition = 'opacity 200ms ease-out'; x.el.style.opacity = ''; });
        setTimeout(() => { if (!g) x.el.style.transition = ''; }, 260);
      } else { x.el.style.transition = ''; x.el.style.opacity = ''; }
    });
    GX.host.classList.remove('gx-swipe-lite');
  }

  // Page masquée en plein geste (Alt+Tab) : plus d'images, l'animation resterait figée à mi-course.
  document.addEventListener('visibilitychange', () => { if (document.hidden && g) { g.stop?.(); cleanup(g.list[clamp(Math.round(g.pos), 0, g.list.length - 1)]); } });

  GX.gesture.owners.windows = {
    enabled: () => mode() !== 'off' && GX.host.dataset.shell !== 'mobile',
    begin, move, end,
    peek: () => g,                                            // lecture seule (tests)
  };
}
