// @ts-nocheck — moteur de la maquette CONVERTI (maquettes/v2/js/wm.js), comportement identique.
// Typage fin : second temps, fichier par fichier, une fois le rendu validé identique à la maquette.
// Substitutions mécaniques : scripts/ui2-convert-engine.mjs. Retouches manuelles : balises [GEARBOX].
export function install(): void {
const GX = (window as any).GX; // lu au démarrage (le noyau l'a créé), pas à l'import
/* =====================================================================
   GEARBOX OS — gestionnaire de fenêtres
   Ouvrir / fermer / réduire (génie) / agrandir / plein écran, déplacer,
   redimensionner (8 bords), ancrage Aero Snap (bords, coins, haut),
   dispositions Windows 11 + assistant d'ancrage, séparateur lié,
   bureaux multiples (swipe), Mission Control (glisser vers un bureau),
   Afficher le bureau, Aero Peek, Aero Shake, sélecteur d'apps, session.
   Tout mouvement = transform (composité) ; la mise en page n'est touchée
   qu'une fois, à la fin du geste.
   ===================================================================== */
(() => {
  const WM = (GX.wm = {});
  const wins = new Map();            // wid → win
  let mru = [];                      // ordre d'activation (le plus récent en tête)
  let z = 100, activeWid = null, desk, spaceEls = [];
  const spaces = [];                 // [{ name, ratio }]
  let cur = 0, cascade = 0, restoring = false;
  const css = (n) => parseFloat(getComputedStyle(GX.host).getPropertyValue(n)) || 0;
  const MB = () => (GX.host.classList.contains('fs-mode') ? 0 : css('--mb-space')); // place réservée par la barre du haut (0 si escamotable)
  const G = () => css('--gap') || 8;

  /* ---------------- Zone de travail et zones d'ancrage ---------------- */
  WM.workArea = () => {
    const g = G(), dockH = GX.shell?.dockReserve?.() ?? 0;
    return { x: g, y: MB() + g, w: innerWidth - 2 * g, h: innerHeight - MB() - 2 * g - dockH };
  };
  function zoneRect(zone, sp = spaces[cur]) {
    const a = WM.workArea(), g = G(), r = sp?.ratio ?? .5, h2 = (a.h - g) / 2, w3 = (a.w - 2 * g) / 3;
    const L = a.w * r - g / 2, R = a.w * (1 - r) - g / 2, xr = a.x + a.w * r + g / 2;
    const Z = {
      max: [0, MB(), innerWidth, innerHeight - MB() - (GX.shell?.dockReserve?.() ?? 0)], left: [a.x, a.y, L, a.h], right: [xr, a.y, R, a.h],
      tl: [a.x, a.y, L, h2], bl: [a.x, a.y + h2 + g, L, h2], tr: [xr, a.y, R, h2], br: [xr, a.y + h2 + g, R, h2],
      l3: [a.x, a.y, w3, a.h], c3: [a.x + w3 + g, a.y, w3, a.h], r3: [a.x + 2 * (w3 + g), a.y, w3, a.h],
      l23: [a.x, a.y, 2 * w3 + g, a.h], r13: [a.x + 2 * (w3 + g), a.y, w3, a.h], l13: [a.x, a.y, w3, a.h], r23: [a.x + w3 + g, a.y, 2 * w3 + g, a.h],
    }[zone];
    return Z && { x: Math.round(Z[0]), y: Math.round(Z[1]), w: Math.round(Z[2]), h: Math.round(Z[3]) };
  }
  WM.zoneRect = zoneRect;
  const COMPLEMENT = { left: ['right'], right: ['left'], l23: ['r13'], r13: ['l23'], l13: ['r23'], r23: ['l13'], tl: ['tr', 'bl', 'br'], tr: ['tl', 'bl', 'br'], bl: ['tl', 'tr', 'br'], br: ['tl', 'tr', 'bl'] };
  WM.LAYOUTS = [
    { cols: '1fr 1fr', rows: '1fr', zones: [['left', '1/1/2/2'], ['right', '1/2/2/3']] },
    { cols: '2fr 1fr', rows: '1fr', zones: [['l23', '1/1/2/2'], ['r13', '1/2/2/3']] },
    { cols: '1fr 1fr 1fr', rows: '1fr', zones: [['l3', '1/1/2/2'], ['c3', '1/2/2/3'], ['r3', '1/3/2/4']] },
    { cols: '1fr 1fr', rows: '1fr 1fr', zones: [['tl', '1/1/2/2'], ['tr', '1/2/2/3'], ['bl', '2/1/3/2'], ['br', '2/2/3/3']] },
    { cols: '1fr 1fr', rows: '1fr 1fr', zones: [['left', '1/1/3/2'], ['tr', '1/2/2/3'], ['br', '2/2/3/3']] },
    { cols: '1fr 2fr', rows: '1fr', zones: [['l13', '1/1/2/2'], ['r23', '1/2/2/3']] },
  ];

  /* ---------------- Initialisation ---------------- */
  WM.init = (el) => {
    desk = el;
    const saved = GX.store.get('session');
    const n = Math.max(1, Math.min(4, saved?.spaces?.length || 1));
    for (let i = 0; i < n; i++) addSpaceEl(saved?.spaces?.[i]);
    cur = Math.min(saved?.cur || 0, n - 1); layoutSpaces(false);
    desk.insertAdjacentHTML('beforeend', '<div class="snap-preview" id="snapPreview"></div>');
    GX.win(window, 'resize', () => { for (const w of wins.values()) refit(w); drawDividers(); });
    initSwipe(); initKeys(); initHotCorners();
  };
  function addSpaceEl(def) {
    const i = spaces.length; spaces.push({ name: def?.name || `Bureau ${i + 1}`, ratio: def?.ratio ?? .5 });
    const s = document.createElement('div'); s.className = 'space'; s.dataset.i = i; s.style.pointerEvents = 'none';
    desk.append(s); spaceEls.push(s);
  }
  /* Les bureaux hors écran sont masqués (visibility) une fois la transition finie :
     le navigateur ne peint plus leurs fenêtres. */
  let visT = 0;
  function layoutSpaces(anim = true) {
    spaceEls.forEach((s, i) => { s.classList.toggle('anim', anim); s.style.transform = `translateX(${(i - cur) * 100}%)`; s.style.visibility = ''; });
    clearTimeout(visT); visT = setTimeout(() => spaceEls.forEach((s, i) => { if (i !== cur) s.style.visibility = 'hidden'; }), anim ? 620 : 0);
  }
  const showAllSpaces = () => { clearTimeout(visT); spaceEls.forEach((s) => (s.style.visibility = '')); };

  /* ---------------- Ouvrir une fenêtre ---------------- */
  WM.open = (appId, params = {}, opts = {}) => {
    const app = GX.app(appId); if (!app) return;
    if (GX.shell && !GX.shell.canOpen(app.parent || appId)) { GX.shell.notify({ app: 'settings', title: 'Accès restreint', body: `Votre rôle n'a pas accès à « ${app.name} ».` }); return; }
    const key = appId + (params.id ? ':' + params.id : '');
    const existing = [...wins.values()].find((w) => w.key === key);
    if (existing && !app.multi) { if (existing.min) WM.restore(existing); else { goSpace(existing.space); WM.focus(existing); pulse(existing); } return existing; }

    const wid = GX.uid('w'), a = WM.workArea();
    const space = opts.space ?? cur;
    let [w, h] = app.size; w = Math.min(w, a.w); h = Math.min(h, a.h);
    const off = (cascade++ % 6) * 26;
    const rect = opts.rect || { x: Math.round(a.x + Math.max(0, (a.w - w) / 2 - 60 + off)), y: Math.round(a.y + Math.max(0, Math.min(40 + off, a.h - h))), w, h };
    const el = document.createElement('section'); el.className = 'win'; el.dataset.wid = wid; el.dataset.app = app.parent || app.id; el.style.pointerEvents = 'auto';
    el.innerHTML = `
      <div class="titlebar"><div class="lights"><button class="l-close" data-tip="Fermer">${svg('<path d="M6 6l12 12M18 6 6 18"/>')}</button><button class="l-min" data-tip="Réduire">${svg('<path d="M5 12h14"/>')}</button><button class="l-max" data-tip="Agrandir · survol : dispositions">${svg('<path d="M7 17 17 7M9 7h8v8"/>')}</button></div>
        <div class="ttl">${GX.appIcon(app.parent ? GX.app(app.parent) : app, 18)}<span class="t ellipsis"></span><span class="sub ellipsis"></span></div><div class="tools"></div></div>
      <div class="win-body"></div>
      ${['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => `<div class="rz ${d}" data-d="${d}"></div>`).join('')}`;
    const win = {
      wid, key, appId, app, params, el, body: el.querySelector('.win-body'), tools: el.querySelector('.tools'), space,
      state: 'normal', zone: null, normal: { ...rect }, min: false, pinned: false,
      setTitle(t, sub = '') { el.querySelector('.ttl .t').textContent = t; el.querySelector('.ttl .sub').textContent = sub ? '— ' + sub : ''; win.title = t; GX.emit('wm:title', win); },
      setTools(html) { win.tools.innerHTML = html; return win.tools; },
      close: () => WM.close(win), focus: () => WM.focus(win),
      sheet: (html, o) => GX.ui.sheet(win.body, html, o),
      open: (id, p, originEl) => WM.open(id, p, { origin: originEl }),
      isCompact: () => win.body.clientWidth < 720,
    };
    applyRect(win, rect, false);
    spaceEls[space].append(el);
    wins.set(wid, win);
    win.setTitle(params.title || app.name);
    wire(win);
    try { win.inst = app.mount(win.body, win) || {}; } catch (err) { console.error(err); win.body.innerHTML = `<div class="empty">${GX.icon('alert')}Erreur dans « ${app.name} »<div class="faint">${GX.esc(err.message)}</div></div>`; win.inst = {}; }
    if (opts.state && opts.state !== 'normal') { if (opts.state === 'max' || opts.state === 'snap') { win.state = opts.state; win.zone = opts.zone || 'max'; applyRect(win, zoneRect(win.zone, spaces[space]), false); el.classList.toggle('maxi', win.zone === 'max'); } }
    if (!opts.state && innerWidth < 1100) { win.state = 'max'; win.zone = 'max'; applyRect(win, zoneRect('max'), false); el.classList.add('maxi'); }
    if (opts.pinned) togglePin(win, true);
    if (space !== cur && !restoring) goSpace(space);
    // Zoom depuis l'origine : icône du Dock, ligne cliquée, résultat Spotlight…
    const from = opts.origin ? (opts.origin instanceof Element ? opts.origin.getBoundingClientRect() : opts.origin) : GX.shell?.dockRect(app.parent || appId);
    if (from && !opts.silent) zoomFrom(win, from);
    if (opts.min) { win.min = true; hideWin(el, true); }
    else WM.focus(win);
    GX.shell?.bounce(app.parent || appId);
    changed();
    return win;
  };
  const svg = (p) => `<svg viewBox="0 0 24 24">${p}</svg>`;
  /* [GEARBOX] Fenêtre réduite : une page ACTUELLE (.gx-legacy) est masquée par `visibility`, pas par
     `display: none` — sinon elle perd sa taille, ses graphiques se recalculent au réaffichage
     (tâche longue de 180 ms mesurée sur le Dashboard, en pleine animation de restauration). */
  function hideWin(el, on) {
    if (el.classList.contains('gx-legacy')) { el.style.visibility = on ? 'hidden' : ''; el.style.pointerEvents = on ? 'none' : 'auto'; } /* 'auto' comme à la création : l'espace parent est à 'none' */
    else el.style.display = on ? 'none' : '';
  }
  function zoomFrom(win, r) {
    const b = win.el.getBoundingClientRect();
    GX.animate(win.el, [
      { transform: `translate(${r.left - b.left}px, ${r.top - b.top}px) scale(${r.width / b.width}, ${r.height / b.height})`, opacity: 0, borderRadius: '30px' },
      { opacity: 1, offset: .2 },
      { transform: 'none', opacity: 1, borderRadius: getComputedStyle(win.el).borderRadius },
    ], { spring: 'window', duration: GX.spring.window.ms * 1.1 });
  }
  function pulse(win) { GX.animate(win.el, [{ transform: 'scale(1)' }, { transform: 'scale(1.012)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' }); }
  function applyRect(win, r, animate = true) {
    const first = animate ? win.el.getBoundingClientRect() : null;
    Object.assign(win.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    win.rect = { ...r };
    if (animate) GX.flip(win.el, first, { spring: 'window' });
  }
  function refit(win) {
    if (win.state === 'full') return applyRect(win, { x: 0, y: 0, w: innerWidth, h: innerHeight }, false);
    if (win.state !== 'normal') return applyRect(win, zoneRect(win.zone, spaces[win.space]), false);
    const a = WM.workArea(), r = win.rect;
    applyRect(win, { x: Math.max(a.x - r.w + 120, Math.min(r.x, a.x + a.w - 120)), y: Math.max(MB(), Math.min(r.y, a.y + a.h - 40)), w: Math.min(r.w, a.w), h: Math.min(r.h, a.h) }, false);
  }

  /* ---------------- Focus / fermeture / réduction ---------------- */
  WM.focus = (win) => {
    if (!win) { activeWid = null; for (const w of wins.values()) w.el.classList.add('inactive'); GX.emit('wm:focus', null); return; }
    if (win.min) return WM.restore(win);
    win.el.style.zIndex = (win.pinned ? 100000 : 0) + ++z;
    activeWid = win.wid; mru = [win.wid, ...mru.filter((x) => x !== win.wid)];
    for (const w of wins.values()) w.el.classList.toggle('inactive', w !== win);
    GX.emit('wm:focus', win);
  };
  WM.active = () => wins.get(activeWid) || null;
  WM.list = () => [...wins.values()];
  WM.visible = (space = cur) => [...wins.values()].filter((w) => w.space === space && !w.min);
  WM.close = (win) => {
    try { win.inst?.destroy?.(); } catch (e) {}
    const el = win.el; wins.delete(win.wid); mru = mru.filter((x) => x !== win.wid);
    GX.animate(el, [{ transform: 'none', opacity: 1 }, { transform: 'scale(.95)', opacity: 0 }], { duration: 170, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'forwards' }).onfinish = () => el.remove();
    if (win.state === 'full') exitFull(win, true);
    if (activeWid === win.wid) WM.focus(topWin());
    drawDividers(); changed();
  };
  const topWin = (space = cur) => mru.map((id) => wins.get(id)).find((w) => w && w.space === space && !w.min) || null;
  WM.minimize = (win) => {
    if (win.min) return; win.min = true;
    const to = GX.shell?.dockRect(win.app.parent || win.appId);
    const done = () => { hideWin(win.el, true); };
    if (to && !GX.eco()) genie(win.el, to, false, done); else { GX.animate(win.el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.9)' }], { duration: 180, fill: 'forwards' }).onfinish = () => { done(); win.el.getAnimations().forEach((a) => a.cancel()); }; }
    if (activeWid === win.wid) WM.focus(topWin());
    drawDividers(); changed();
  };
  WM.restore = (win) => {
    if (!win.min) return WM.focus(win);
    win.min = false; goSpace(win.space); hideWin(win.el, false);
    const from = GX.shell?.dockRect(win.app.parent || win.appId);
    if (from && !GX.eco()) genie(win.el, from, true); else zoomFrom(win, from || win.el.getBoundingClientRect());
    WM.focus(win); drawDividers(); changed();
  };
  /* Effet « génie » approché : la fenêtre se pince vers l'icône puis s'y engouffre */
  function genie(el, icon, reverse, done) {
    const b = el.getBoundingClientRect(); if (!b.width) { done && done(); return; }
    const cx = ((icon.left + icon.width / 2 - b.left) / b.width) * 100;
    const dx = icon.left + icon.width / 2 - (b.left + b.width / 2), dy = icon.top - b.top;
    const kf = [
      { transform: 'none', clipPath: 'polygon(0% 0%,100% 0%,100% 100%,0% 100%)', opacity: 1 },
      { transform: `translate(${dx * .15}px, ${dy * .12}px) scaleY(.92)`, clipPath: `polygon(0% 0%,100% 0%,${Math.min(100, cx + 14)}% 100%,${Math.max(0, cx - 14)}% 100%)`, opacity: 1, offset: .42 },
      { transform: `translate(${icon.left - b.left}px, ${icon.top - b.top}px) scale(${icon.width / b.width}, ${icon.height / b.height})`, clipPath: `polygon(${cx - 30}% 0%,${cx + 30}% 0%,${cx + 30}% 100%,${cx - 30}% 100%)`, opacity: .3 },
    ];
    const a = el.animate(reverse ? kf.reverse() : kf, { duration: reverse ? 480 : 520, easing: reverse ? 'cubic-bezier(.2,.8,.3,1)' : 'cubic-bezier(.6,0,.4,1)', fill: reverse ? 'none' : 'forwards' });
    a.onfinish = () => { done && done(); if (!reverse) a.cancel(); };
  }

  /* ---------------- Agrandir / ancrer / plein écran ---------------- */
  WM.snap = (win, zone, { assist = false, layout = null } = {}) => {
    if (win.state === 'full') exitFull(win, true);
    if (win.state === 'normal') win.normal = { ...win.rect };
    win.state = zone === 'max' ? 'max' : 'snap'; win.zone = zone;
    win.el.classList.toggle('maxi', zone === 'max');
    applyRect(win, zoneRect(zone, spaces[win.space]));
    WM.focus(win);
    if (assist) {
      const rest = layout ? layout.zones.map((z) => z[0]).filter((z) => z !== zone) : COMPLEMENT[zone] || [];
      if (rest.length) snapAssist(rest, win);
    }
    setTimeout(drawDividers, 30); changed();
  };
  WM.unsnap = (win) => {
    if (win.state === 'normal') return;
    if (win.state === 'full') return exitFull(win);
    win.state = 'normal'; win.zone = null; win.el.classList.remove('maxi');
    applyRect(win, win.normal); drawDividers(); changed();
  };
  WM.toggleMax = (win) => (win.state === 'max' ? WM.unsnap(win) : WM.snap(win, 'max'));
  WM.fullscreen = (win) => {
    if (win.state === 'full') return exitFull(win);
    win.prev = { state: win.state, zone: win.zone }; if (win.state === 'normal') win.normal = { ...win.rect };
    win.state = 'full'; win.el.classList.add('full'); GX.host.classList.add('fs-mode');
    GX.shell?.chrome(false);
    applyRect(win, { x: 0, y: 0, w: innerWidth, h: innerHeight }); WM.focus(win); changed();
    GX.shell?.hud('Plein écran — Échap pour sortir');
  };
  function exitFull(win, silent) {
    win.el.classList.remove('full'); GX.host.classList.remove('fs-mode'); GX.shell?.chrome(true);
    const p = win.prev || { state: 'normal' }; win.state = p.state; win.zone = p.zone;
    if (!silent) { if (p.state === 'normal') applyRect(win, win.normal); else applyRect(win, zoneRect(p.zone, spaces[win.space])); }
    changed();
  }
  function togglePin(win, v = !win.pinned) { win.pinned = v; win.el.classList.toggle('pinned', v); WM.focus(win); changed(); GX.shell?.hud(v ? 'Toujours au premier plan' : 'Premier plan désactivé'); }
  WM.togglePin = togglePin;

  /* ---------------- Assistant d'ancrage (Snap Assist) ---------------- */
  let assistEl = null;
  function snapAssist(zones, placed) {
    closeAssist();
    const zone = zones[0];
    const taken = new Set([placed.wid]);
    const cands = WM.visible().filter((w) => !taken.has(w.wid) && !(w.state === 'snap' && zones.includes(w.zone)));
    if (!cands.length) return;
    const r = zoneRect(zone);
    assistEl = document.createElement('div'); assistEl.className = 'snap-assist glass glass-strong';
    Object.assign(assistEl.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    assistEl.innerHTML = `<div class="sa-h">${GX.icon('snap')}Choisissez une fenêtre pour cet emplacement<span class="faint" style="margin-left:auto;font-weight:500">Échap pour ignorer</span></div><div class="sa-list"></div>`;
    const list = assistEl.querySelector('.sa-list');
    cands.forEach((w) => {
      const c = document.createElement('div'); c.className = 'sa-card';
      c.innerHTML = `<div class="sa-thumb"></div><div class="sa-t">${GX.appIcon(w.app.parent ? GX.app(w.app.parent) : w.app, 18)}<span class="ellipsis">${GX.esc(w.title)}</span></div>`;
      const th = c.querySelector('.sa-thumb'), clone = w.body.cloneNode(true);
      const bw = w.body.clientWidth || 800, bh = w.body.clientHeight || 500; Object.assign(clone.style, { width: bw + 'px', height: bh + 'px' });
      requestAnimationFrame(() => { clone.style.transform = `scale(${th.clientWidth / bw})`; }); th.append(clone);
      c.onclick = () => { closeAssist(); WM.snap(w, zone); if (zones.length > 1) snapAssist(zones.slice(1), w); };
      list.append(c);
    });
    GX.body.append(assistEl);
  }
  function closeAssist() { if (assistEl) { assistEl.remove(); assistEl = null; } }
  WM.closeAssist = closeAssist;
  GX.win(document, 'pointerdown', (e) => { if (assistEl && !assistEl.contains(e.target)) closeAssist(); }, true);

  /* ---------------- Dispositions (survol du bouton vert) ---------------- */
  let layEl = null, layTimer = null;
  function showLayouts(win, anchor, onPick) {
    hideLayouts();
    layEl = document.createElement('div'); layEl.className = 'snap-layouts glass glass-strong';
    layEl.innerHTML = `<div class="lh">Disposer la fenêtre</div>` + WM.LAYOUTS.map((L, i) =>
      `<div class="lay" style="grid-template-columns:${L.cols};grid-template-rows:${L.rows}">${L.zones.map(([z, area]) => `<button data-l="${i}" data-z="${z}" style="grid-area:${area}"></button>`).join('')}</div>`).join('');
    GX.body.append(layEl);
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    Object.assign(layEl.style, { left: Math.max(8, Math.min(r.left - 20, innerWidth - layEl.offsetWidth - 8)) + 'px', top: r.bottom + 8 + 'px' });
    layEl.addEventListener('click', (e) => { const b = e.target.closest('button[data-z]'); if (!b) return; hideLayouts(); (onPick || ((z, L) => WM.snap(win, z, { assist: true, layout: L })))(b.dataset.z, WM.LAYOUTS[+b.dataset.l]); });
    layEl.addEventListener('pointerleave', () => { layTimer = setTimeout(hideLayouts, 350); });
    layEl.addEventListener('pointerenter', () => clearTimeout(layTimer));
    return layEl;
  }
  function hideLayouts() { clearTimeout(layTimer); if (layEl) { layEl.remove(); layEl = null; } }
  WM.showLayouts = showLayouts;

  /* ---------------- Câblage d'une fenêtre ---------------- */
  function wire(win) {
    const el = win.el, tb = el.querySelector('.titlebar');
    el.addEventListener('pointerdown', () => { if (activeWid !== win.wid && !desk.classList.contains('mc')) WM.focus(win); }, true);
    el.querySelector('.l-close').onclick = (e) => { e.stopPropagation(); WM.close(win); };
    el.querySelector('.l-min').onclick = (e) => { e.stopPropagation(); WM.minimize(win); };
    const mx = el.querySelector('.l-max');
    mx.onclick = (e) => { e.stopPropagation(); hideLayouts(); e.altKey ? WM.fullscreen(win) : WM.toggleMax(win); };
    mx.addEventListener('pointerenter', () => { clearTimeout(layTimer); layTimer = setTimeout(() => showLayouts(win, mx), 480); });
    mx.addEventListener('pointerleave', () => { clearTimeout(layTimer); if (layEl) layTimer = setTimeout(hideLayouts, 400); });
    tb.addEventListener('dblclick', (e) => { if (!e.target.closest('button,input,.tools')) WM.toggleMax(win); });
    tb.addEventListener('contextmenu', (e) => { if (e.target.closest('.tools')) return; e.preventDefault(); GX.menu.open(windowMenu(win), { x: e.clientX, y: e.clientY }); });
    tb.addEventListener('pointerdown', (e) => startDrag(e, win));
    /* L'en-tête de rubrique sert aussi de poignée (indispensable quand la barre de titre est fusionnée
       dans la barre du haut) : on l'attrape pour déplacer, et on la détache si la fenêtre est agrandie ;
       double-clic dans un espace vide = agrandir / restaurer, comme sous Windows. */
    el.addEventListener('pointerdown', (e) => { const h = e.target.closest('.app-head'); if (h && el.contains(h)) startDrag(e, win, h); });
    el.addEventListener('dblclick', (e) => { if (e.target.closest('.app-head') && !e.target.closest(NODRAG)) WM.toggleMax(win); });
    el.querySelectorAll('.rz').forEach((h) => h.addEventListener('pointerdown', (e) => startResize(e, win, h.dataset.d)));
  }
  WM.windowMenu = (win) => windowMenu(win);
  function windowMenu(win) {
    return [
      { label: 'Réduire', icon: 'minus', kbd: 'Ctrl Alt M', action: () => WM.minimize(win) },
      { label: win.state === 'max' ? 'Restaurer' : 'Agrandir', icon: 'maximize', kbd: 'Ctrl ⇧ ↑', action: () => WM.toggleMax(win) },
      { label: win.state === 'full' ? 'Quitter le plein écran' : 'Plein écran', icon: 'desktop', kbd: 'Ctrl Alt F', action: () => WM.fullscreen(win) },
      '-',
      { label: 'Ancrer à gauche', icon: 'sidebar', kbd: 'Ctrl ⇧ ←', action: () => WM.snap(win, 'left', { assist: true }) },
      { label: 'Ancrer à droite', icon: 'sidebar', kbd: 'Ctrl ⇧ →', action: () => WM.snap(win, 'right', { assist: true }) },
      { label: 'Dispositions…', icon: 'snap', action: () => showLayouts(win, win.el.querySelector('.l-max')) },
      '-',
      ...spaces.map((s, i) => ({ label: `Déplacer vers ${s.name}`, icon: 'spaces', disabled: i === win.space, kbd: `Ctrl Alt ⇧ ${i + 1}`, action: () => WM.moveToSpace(win, i, true) })),
      spaces.length < 4 ? { label: 'Déplacer vers un nouveau bureau', icon: 'plus', action: () => { WM.addSpace(); WM.moveToSpace(win, spaces.length - 1, true); } } : null,
      '-',
      { label: 'Toujours au premier plan', icon: 'pinned', checked: win.pinned, action: () => togglePin(win) },
      '-',
      { label: 'Fermer', icon: 'close', kbd: 'Ctrl Alt W', action: () => WM.close(win) },
    ].filter(Boolean);
  }

  /* ---------------- Déplacement + ancrage + Aero Shake ---------------- */
  const preview = () => GX.root.getElementById('snapPreview');
  function showPreview(r) { const p = preview(); if (!r) return p.classList.remove('on'); Object.assign(p.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); p.classList.add('on'); }
  function zoneAt(x, y) {
    const e = 3, c = 90, top = MB() + 2;
    if (y <= top && x > innerWidth * .33 && x < innerWidth * .67) return 'layouts';
    if (y <= top) return 'max';
    if (x <= e) return y < MB() + c ? 'tl' : y > innerHeight - c ? 'bl' : 'left';
    if (x >= innerWidth - e - 1) return y < MB() + c ? 'tr' : y > innerHeight - c ? 'br' : 'right';
    return null;
  }
  const NODRAG = 'button,input,select,textarea,.tools,a,label,.chip,.seg,.picker-btn,.search,[contenteditable],[data-nodrag]';
  function startDrag(e, win, handle) {
    if (e.button !== 0 || e.target.closest(NODRAG) || desk.classList.contains('mc')) return;
    const H = handle || tb(win.el);
    const el = win.el; let sx = e.clientX, sy = e.clientY, dx = 0, dy = 0, zone = null, moved = false, layStrip = null, layPick = null;
    const shake = { dir: 0, flips: [], lastX: sx };
    H.setPointerCapture(e.pointerId);
    const move = (ev) => {
      if (!moved) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        moved = true; el.classList.add('dragging'); closeAssist();
        if (win.state !== 'normal') { // on détache la fenêtre ancrée sous le curseur (comportement Windows)
          const ratio = (sx - win.rect.x) / win.rect.w; const n = win.normal || { w: Math.min(1100, Math.round(innerWidth * .7)), h: Math.round(innerHeight * .72) };
          if (win.state === 'full') exitFull(win, true);
          win.state = 'normal'; win.zone = null; el.classList.remove('maxi');
          applyRect(win, { x: Math.round(sx - n.w * ratio), y: Math.max(MB(), sy - 18), w: n.w, h: n.h }, false);
          sx = ev.clientX; sy = ev.clientY; drawDividers();
        }
      }
      dx = ev.clientX - sx; dy = Math.max(MB() - win.rect.y, ev.clientY - sy);
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      // Aero Shake : 4 changements de direction rapides → réduire les autres
      const d = Math.sign(ev.clientX - shake.lastX); if (Math.abs(ev.clientX - shake.lastX) > 14) { if (d && d !== shake.dir) { shake.flips.push(performance.now()); shake.dir = d; } shake.lastX = ev.clientX; }
      shake.flips = shake.flips.filter((t) => performance.now() - t < 700);
      if (shake.flips.length >= 5) { shake.flips = []; aeroShake(win); }
      zone = zoneAt(ev.clientX, ev.clientY);
      if (zone === 'layouts') {
        if (!layStrip) layStrip = showLayouts(win, { left: innerWidth / 2 - 130, bottom: MB() + 4 }, () => {});
        const hit = GX.root.elementFromPoint(ev.clientX, ev.clientY) /* [GEARBOX] racine fantôme */?.closest?.('.lay button');
        layStrip.querySelectorAll('button').forEach((b) => (b.style.background = b === hit ? 'var(--bony-grad)' : ''));
        layPick = hit ? { z: hit.dataset.z, L: WM.LAYOUTS[+hit.dataset.l] } : null; showPreview(layPick ? zoneRect(layPick.z) : null);
      } else {
        if (layStrip) { const hit = GX.root.elementFromPoint(ev.clientX, ev.clientY) /* [GEARBOX] racine fantôme */?.closest?.('.lay button'); if (!hit) { hideLayouts(); layStrip = null; layPick = null; } else { layPick = { z: hit.dataset.z, L: WM.LAYOUTS[+hit.dataset.l] }; showPreview(zoneRect(layPick.z)); return; } }
        showPreview(zone ? zoneRect(zone) : null);
      }
    };
    const up = () => {
      H.removeEventListener('pointermove', move); el.classList.remove('dragging'); showPreview(null);
      if (!moved) return;
      el.style.transform = ''; applyRect(win, { ...win.rect, x: win.rect.x + dx, y: win.rect.y + dy }, false);
      if (layPick) { hideLayouts(); WM.snap(win, layPick.z, { assist: true, layout: layPick.L }); }
      else if (zone && zone !== 'layouts') WM.snap(win, zone, { assist: zone !== 'max' });
      else { hideLayouts(); win.normal = { ...win.rect }; changed(); }
    };
    H.addEventListener('pointermove', move); H.addEventListener('pointerup', up, { once: true }); H.addEventListener('pointercancel', up, { once: true });
  }
  WM.startDrag = startDrag;
  const tb = (el) => el.querySelector('.titlebar');
  let shaken = null;
  function aeroShake(win) {
    const others = WM.visible().filter((w) => w !== win);
    if (others.length) { shaken = others.map((w) => w.wid); others.forEach((w) => WM.minimize(w)); GX.shell?.hud('Aero Shake — les autres fenêtres sont réduites'); }
    else if (shaken) { shaken.map((id) => wins.get(id)).filter(Boolean).forEach((w) => WM.restore(w)); shaken = null; WM.focus(win); }
  }

  /* ---------------- Redimensionnement (8 bords) ---------------- */
  function startResize(e, win, d) {
    if (e.button !== 0) return; e.stopPropagation(); e.preventDefault();
    const [mw, mh] = win.app.minSize, s = { ...win.rect }, sx = e.clientX, sy = e.clientY, h = e.target;
    if (win.state !== 'normal') { win.state = 'normal'; win.zone = null; win.el.classList.remove('maxi'); drawDividers(); }
    win.el.classList.add('resizing'); h.setPointerCapture(e.pointerId); closeAssist();
    let raf = 0, last;
    const move = (ev) => {
      last = ev; if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0; const dx = last.clientX - sx, dy = last.clientY - sy; const r = { ...s };
        if (d.includes('e')) r.w = Math.max(mw, s.w + dx);
        if (d.includes('s')) r.h = Math.max(mh, s.h + dy);
        if (d.includes('w')) { r.w = Math.max(mw, s.w - dx); r.x = s.x + s.w - r.w; }
        if (d.includes('n')) { r.h = Math.max(mh, s.h - dy); r.y = Math.max(MB(), s.y + s.h - r.h); r.h = s.y + s.h - r.y; }
        applyRect(win, r, false);
      });
    };
    const up = () => { h.removeEventListener('pointermove', move); win.el.classList.remove('resizing'); win.normal = { ...win.rect }; changed(); };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up, { once: true });
  }

  /* ---------------- Séparateur lié entre deux fenêtres ancrées ---------------- */
  let divEl = null;
  function drawDividers() {
    const vis = WM.visible().filter((w) => w.state === 'snap');
    const L = vis.some((w) => ['left', 'tl', 'bl'].includes(w.zone)), R = vis.some((w) => ['right', 'tr', 'br'].includes(w.zone));
    if (!(L && R) || desk.classList.contains('mc')) { divEl && divEl.remove(); divEl = null; return; }
    const a = WM.workArea(), r = spaces[cur].ratio;
    if (!divEl) {
      divEl = document.createElement('div'); divEl.className = 'snap-divider'; divEl.dataset.tip = 'Glisser pour redimensionner les deux fenêtres'; GX.body.append(divEl);
      divEl.addEventListener('pointerdown', (e) => {
        divEl.setPointerCapture(e.pointerId); divEl.classList.add('drag');
        const mv = (ev) => { const aa = WM.workArea(); spaces[cur].ratio = Math.max(.25, Math.min(.75, (ev.clientX - aa.x) / aa.w)); for (const w of WM.visible()) if (w.state === 'snap' && ['left', 'right', 'tl', 'tr', 'bl', 'br'].includes(w.zone)) applyRect(w, zoneRect(w.zone), false); drawDividers(); };
        const up = () => { divEl.removeEventListener('pointermove', mv); divEl.classList.remove('drag'); changed(); };
        divEl.addEventListener('pointermove', mv); divEl.addEventListener('pointerup', up, { once: true });
      });
    }
    Object.assign(divEl.style, { left: a.x + a.w * r - 6 + 'px', top: a.y + 'px', height: a.h + 'px', zIndex: z + 1 });
  }
  WM.drawDividers = drawDividers;

  /* ---------------- Bureaux multiples ---------------- */
  WM.spaces = () => spaces; WM.cur = () => cur;
  WM.addSpace = () => { if (spaces.length >= 4) return; addSpaceEl(); layoutSpaces(false); changed(); GX.emit('wm:spaces'); };
  WM.removeSpace = (i) => {
    if (spaces.length < 2) return;
    for (const w of wins.values()) if (w.space === i) WM.moveToSpace(w, i === 0 ? 1 : i - 1);
    for (const w of wins.values()) if (w.space > i) w.space--;
    spaces.splice(i, 1); spaceEls[i].remove(); spaceEls.splice(i, 1); spaceEls.forEach((s, k) => (s.dataset.i = k)); spaces.forEach((s, k) => (s.name = `Bureau ${k + 1}`));
    cur = Math.min(cur, spaces.length - 1); layoutSpaces(false); changed(); GX.emit('wm:spaces');
  };
  function goSpace(i, hud = false) {
    if (i === cur || i < 0 || i >= spaces.length) return;
    cur = i; layoutSpaces(true); closeAssist();
    WM.focus(topWin()); drawDividers(); GX.emit('wm:spaces'); changed();
    if (hud) GX.shell?.hud(spaces[i].name);
  }
  WM.goSpace = (i) => goSpace(i, true);
  WM.moveToSpace = (win, i, follow = false) => {
    if (i === win.space || !spaceEls[i]) return;
    win.space = i; spaceEls[i].append(win.el);
    if (win.state === 'snap' || win.state === 'max') applyRect(win, zoneRect(win.zone, spaces[i]), false);
    if (follow) { goSpace(i, true); WM.focus(win); } else if (activeWid === win.wid) WM.focus(topWin());
    drawDividers(); changed(); GX.emit('wm:spaces');
  };
  /* Swipe horizontal (pavé tactile / molette horizontale / doigt sur le fond) */
  function initSwipe() {
    let acc = 0, t = 0, active = false;
    const onWheel = (e) => {
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.2 || Math.abs(e.deltaX) < 2) return;
      if (e.target.closest('.win-body') && !e.target.closest('.titlebar')) return; // à l'intérieur d'une fenêtre, on laisse défiler
      if (spaces.length < 2 && !e.shiftKey) { /* rien */ }
      e.preventDefault(); if (!active) showAllSpaces(); active = true; acc += e.deltaX;
      const max = innerWidth * .9; const atEdge = (acc < 0 && cur === 0) || (acc > 0 && cur === spaces.length - 1);
      const shown = atEdge ? Math.sign(acc) * Math.sqrt(Math.abs(acc)) * 6 : Math.max(-max, Math.min(max, acc));
      spaceEls.forEach((s, i) => { s.classList.remove('anim'); s.style.transform = `translateX(calc(${(i - cur) * 100}% - ${shown}px))`; });
      clearTimeout(t); t = setTimeout(() => { active = false; const go = Math.abs(acc) > innerWidth * .16 ? cur + Math.sign(acc) : cur; acc = 0; if (go !== cur && go >= 0 && go < spaces.length) goSpace(go, true); else layoutSpaces(true); }, 130);
    };
    GX.win(window, 'wheel', onWheel, { passive: false });
    // Doigt / stylet sur le fond du bureau
    desk.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || e.target.closest('.win,.wdg')) return;
      const sx = e.clientX; let dx = 0; showAllSpaces();
      const mv = (ev) => { dx = ev.clientX - sx; spaceEls.forEach((s, i) => { s.classList.remove('anim'); s.style.transform = `translateX(calc(${(i - cur) * 100}% + ${dx}px))`; }); };
      const up = () => { GX.unwin(window, 'pointermove', mv); const go = Math.abs(dx) > innerWidth * .2 ? cur - Math.sign(dx) : cur; if (go !== cur && go >= 0 && go < spaces.length) goSpace(go, true); else layoutSpaces(true); };
      GX.win(window, 'pointermove', mv); GX.win(window, 'pointerup', up, { once: true });
    });
  }

  /* ---------------- Mission Control ---------------- */
  let mcOn = false, mcFilter = null;
  WM.mission = (on = !mcOn, { app = null } = {}) => {
    if (on === mcOn && !app) return;
    mcOn = on; mcFilter = app; closeAssist(); hideLayouts();
    const veil = GX.root.getElementById('mcVeil'), bar = GX.root.getElementById('mcSpaces');
    const list = WM.visible().filter((w) => !app || w.appId === app || w.app.parent === app);
    if (!on || !list.length) {
      mcOn = false; desk.classList.remove('mc'); desk.classList.add('mc-out'); veil.classList.remove('on'); bar.classList.remove('on');
      for (const w of wins.values()) { w.el.style.transform = ''; w.el.querySelector('.mc-label')?.remove(); }
      setTimeout(() => desk.classList.remove('mc-out'), 500); drawDividers(); GX.shell?.widgetsDim(); return;
    }
    desk.classList.add('mc'); veil.classList.add('on'); if (!app) { renderSpacesBar(); bar.classList.add('on'); }
    divEl && divEl.remove(); divEl = null; GX.shell?.widgetsDim(true);
    const top = app ? MB() + 30 : 150, bottom = 110, W = innerWidth - 80, H = innerHeight - top - bottom;
    const sorted = [...list].sort((a, b) => a.rect.x - b.rect.x || a.rect.y - b.rect.y);
    const n = sorted.length, cols = Math.ceil(Math.sqrt(n * (W / H) / 1.5)), rows = Math.ceil(n / cols);
    const cw = W / cols, ch = H / rows;
    sorted.forEach((w, i) => {
      const r = w.rect, s = Math.min((cw - 36) / r.w, (ch - 50) / r.h, .8);
      const row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols), rowOff = (W - inRow * cw) / 2;
      const cx = 40 + rowOff + (i % cols) * cw + cw / 2, cy = top + row * ch + ch / 2 - 10;
      w.el.style.transform = `translate(${cx - r.w * s / 2 - r.x}px, ${cy - r.h * s / 2 - r.y}px) scale(${s})`;
      w.el.querySelector('.mc-label')?.remove();
      w.el.insertAdjacentHTML('beforeend', `<span class="mc-label glass glass-strong" style="transform:translateX(-50%) scale(${1 / s})">${GX.esc(w.title)}</span>`);
      w.mcScale = s;
    });
  };
  WM.missionOn = () => mcOn;
  function renderSpacesBar() {
    const bar = GX.root.getElementById('mcSpaces'), a = { w: innerWidth, h: innerHeight };
    bar.innerHTML = spaces.map((s, i) => `<div class="mc-sp ${i === cur ? 'cur' : ''}" data-i="${i}"><div class="th"><div class="wallpaper ${GX.shell?.wallpaperClass?.() || 'wp-sunset'}" style="position:absolute"></div>
      ${[...wins.values()].filter((w) => w.space === i && !w.min).map((w) => `<div class="mini" style="left:${(w.rect.x / a.w) * 100}%;top:${(w.rect.y / a.h) * 100}%;width:${(w.rect.w / a.w) * 100}%;height:${(w.rect.h / a.h) * 100}%"></div>`).join('')}</div>
      <span>${s.name}${spaces.length > 1 ? ` <button class="icon-btn sm" data-del="${i}" data-tip="Supprimer ce bureau" style="display:inline-grid;vertical-align:middle">${GX.icon('close', 'sm')}</button>` : ''}</span></div>`).join('') +
      (spaces.length < 4 ? `<div class="mc-sp add" data-add><div class="th">${GX.icon('plus', 'lg')}</div><span>Nouveau bureau</span></div>` : '');
  }
  WM.renderSpacesBar = renderSpacesBar;
  function initMissionEvents() {
    const veil = GX.root.getElementById('mcVeil'), bar = GX.root.getElementById('mcSpaces');
    veil.addEventListener('click', () => WM.mission(false));
    bar.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]'); if (del) { e.stopPropagation(); WM.removeSpace(+del.dataset.del); renderSpacesBar(); WM.mission(true); return; }
      if (e.target.closest('[data-add]')) { WM.addSpace(); renderSpacesBar(); return; }
      const sp = e.target.closest('.mc-sp'); if (sp) { WM.mission(false); goSpace(+sp.dataset.i, true); }
    });
    // Clic = focus ; glisser une fenêtre sur un bureau = l'y déplacer
    desk.addEventListener('pointerdown', (e) => {
      if (!mcOn) return; const el = e.target.closest('.win'); if (!el) return;
      e.preventDefault(); e.stopPropagation();
      const win = wins.get(el.dataset.wid), sx = e.clientX, sy = e.clientY; let ghost = null, over = null;
      const mv = (ev) => {
        if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
          ghost = document.createElement('div'); ghost.className = 'mc-ghost glass glass-strong'; ghost.innerHTML = `<div class="row" style="padding:10px 12px;font-weight:700">${GX.appIcon(win.app.parent ? GX.app(win.app.parent) : win.app, 22)}${GX.esc(win.title)}</div>`;
          GX.body.append(ghost); el.style.opacity = .35;
        }
        if (!ghost) return;
        Object.assign(ghost.style, { left: ev.clientX - 90 + 'px', top: ev.clientY - 20 + 'px', width: '200px' });
        const t = GX.root.elementFromPoint(ev.clientX, ev.clientY) /* [GEARBOX] racine fantôme */?.closest?.('.mc-sp'); bar.querySelectorAll('.mc-sp').forEach((s) => s.classList.toggle('drop', s === t && !s.classList.contains('cur')));
        over = t;
      };
      const up = () => {
        GX.unwin(window, 'pointermove', mv); el.style.opacity = '';
        if (!ghost) { WM.mission(false); WM.focus(win); return; }
        ghost.remove();
        if (over) { if (over.dataset.add !== undefined) { WM.addSpace(); WM.moveToSpace(win, spaces.length - 1); } else if (+over.dataset.i !== win.space) WM.moveToSpace(win, +over.dataset.i); }
        renderSpacesBar(); WM.mission(true);
      };
      GX.win(window, 'pointermove', mv); GX.win(window, 'pointerup', up, { once: true });
    }, true);
  }
  WM.initMissionEvents = initMissionEvents;

  /* ---------------- Afficher le bureau / Aero Peek ---------------- */
  let desktopShown = false;
  WM.showDesktop = (on = !desktopShown) => {
    desktopShown = on; const cx = innerWidth / 2, cy = innerHeight / 2;
    for (const w of WM.visible()) {
      if (!on) { w.el.style.transition = `transform ${GX.spring.soft.ms}ms ${GX.spring.soft.css}`; w.el.style.transform = ''; continue; }
      const r = w.rect, mx = r.x + r.w / 2 - cx, my = r.y + r.h / 2 - cy;
      const tx = mx >= 0 ? innerWidth - r.x - 40 : -(r.x + r.w - 40), ty = my >= 0 ? innerHeight - r.y - 40 : -(r.y + r.h - 40);
      const horiz = Math.abs(mx) / innerWidth > Math.abs(my) / innerHeight;
      w.el.style.transition = `transform ${GX.spring.soft.ms}ms ${GX.spring.soft.css}`;
      w.el.style.transform = horiz ? `translateX(${tx}px)` : `translateY(${ty}px)`;
    }
    setTimeout(() => { for (const w of wins.values()) w.el.style.transition = ''; }, GX.spring.soft.ms + 50);
    GX.shell?.widgetsDim(!on ? undefined : false);
  };
  WM.desktopShown = () => desktopShown;
  function initHotCorners() {
    const br = document.createElement('div'); br.className = 'hot-corner'; Object.assign(br.style, { right: 0, bottom: 0 }); br.dataset.tip = 'Aero Peek · clic : afficher le bureau';
    const bl = document.createElement('div'); bl.className = 'hot-corner'; Object.assign(bl.style, { left: 0, bottom: 0 });
    GX.body.append(br, bl);
    let t1, t2;
    br.addEventListener('pointerenter', () => { t1 = setTimeout(() => desk.classList.add('peek'), 500); });
    br.addEventListener('pointerleave', () => { clearTimeout(t1); desk.classList.remove('peek'); });
    br.addEventListener('click', () => { desk.classList.remove('peek'); WM.showDesktop(); });
    bl.addEventListener('pointerenter', () => { t2 = setTimeout(() => WM.mission(true), 350); });
    bl.addEventListener('pointerleave', () => clearTimeout(t2));
  }

  /* ---------------- Sélecteur d'apps (Alt + ²) ---------------- */
  let sw = null;
  function switcher(step) {
    const order = mru.map((id) => wins.get(id)).filter(Boolean);
    const seen = new Set(), apps = [];
    for (const w of order) { const k = w.app.parent || w.appId; if (!seen.has(k)) { seen.add(k); apps.push({ k, w }); } }
    if (apps.length < 1) return;
    if (!sw) { sw = { i: 0, apps, el: document.createElement('div') }; sw.el.className = 'switcher glass glass-strong'; GX.body.append(sw.el); }
    sw.apps = apps; sw.i = (sw.i + step + apps.length) % apps.length;
    sw.el.innerHTML = apps.map((a, i) => `<div class="sw ${i === sw.i ? 'on' : ''}" data-i="${i}">${GX.appIcon(GX.app(a.k), 64)}<span class="ellipsis" style="max-width:90px">${GX.esc(GX.app(a.k).name)}</span></div>`).join('');
    sw.el.onclick = (e) => { const s = e.target.closest('.sw'); if (s) { sw.i = +s.dataset.i; commitSwitch(); } };
  }
  function commitSwitch() { if (!sw) return; const a = sw.apps[sw.i]; sw.el.remove(); sw = null; if (a) { goSpace(a.w.space, false); a.w.min ? WM.restore(a.w) : WM.focus(a.w); } }

  /* ---------------- Clavier ---------------- */
  function initKeys() {
    GX.win(window, 'keydown', (e) => {
      const inField = e.target.closest?.('input,textarea,select,[contenteditable]');
      const w = WM.active();
      if (e.altKey && !e.ctrlKey && e.code === 'Backquote') { e.preventDefault(); switcher(sw ? (e.shiftKey ? -1 : 1) : 1); return; }
      if (e.key === 'Escape') {
        if (sw) { sw.el.remove(); sw = null; return; }
        if (assistEl) return closeAssist();
        if (mcOn) return WM.mission(false);
        if (desktopShown) return WM.showDesktop(false);
        if (w?.state === 'full') return exitFull(w);
      }
      if (e.key === 'F3') { e.preventDefault(); WM.mission(); return; }
      // AZERTY : Ctrl+Alt = AltGr (# ~ { [ | @…) → jamais dans un champ, jamais avec AltGr
      if (inField || e.getModifierState?.('AltGraph')) return;
      // Ancrage : Ctrl+Maj+flèches (Ctrl+Alt+flèches fait pivoter l'écran avec certains pilotes Intel)
      const arrows = e.ctrlKey && e.shiftKey && !e.altKey && e.key.startsWith('Arrow');
      if (arrows && !w) return;
      if (!arrows && !(e.ctrlKey && e.altKey)) return;
      const k = e.key.toLowerCase(), digit = e.code.startsWith('Digit') ? +e.code.slice(5) : null;
      if (!arrows && digit && digit <= spaces.length) { e.preventDefault(); if (e.shiftKey && w) WM.moveToSpace(w, digit - 1, true); else goSpace(digit - 1, true); return; }
      if (k === 'd') { e.preventDefault(); WM.showDesktop(); return; }
      if (!w) return;
      if (!arrows && e.key.startsWith('Arrow')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); w.zone === 'right' ? WM.unsnap(w) : WM.snap(w, w.zone === 'tr' ? 'tl' : w.zone === 'br' ? 'bl' : 'left', { assist: true }); }
      if (e.key === 'ArrowRight') { e.preventDefault(); w.zone === 'left' ? WM.unsnap(w) : WM.snap(w, w.zone === 'tl' ? 'tr' : w.zone === 'bl' ? 'br' : 'right', { assist: true }); }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (w.zone === 'left') WM.snap(w, 'tl'); else if (w.zone === 'right') WM.snap(w, 'tr'); else if (w.zone === 'bl') WM.snap(w, 'left'); else if (w.zone === 'br') WM.snap(w, 'right'); else WM.snap(w, 'max'); }
      if (e.key === 'ArrowDown') { e.preventDefault(); if (w.zone === 'left') WM.snap(w, 'bl'); else if (w.zone === 'right') WM.snap(w, 'br'); else if (w.zone === 'tl') WM.snap(w, 'left'); else if (w.zone === 'tr') WM.snap(w, 'right'); else if (w.state !== 'normal') WM.unsnap(w); else WM.minimize(w); }
      if (k === 'f') { e.preventDefault(); WM.fullscreen(w); }
      if (k === 'm') { e.preventDefault(); WM.minimize(w); }
      if (k === 'w') { e.preventDefault(); WM.close(w); }
      if (k === 't') { e.preventDefault(); togglePin(w); }
    });
    GX.win(window, 'keyup', (e) => { if (e.key === 'Alt' && sw) commitSwitch(); });
    GX.win(window, 'blur', () => { if (sw) { sw.el.remove(); sw = null; } });
  }

  /* ---------------- Session (réouverture des fenêtres) ---------------- */
  let saveT = 0;
  function changed() { GX.emit('wm:change'); if (restoring) return; clearTimeout(saveT); saveT = setTimeout(WM.save, 400); }
  WM.save = () => GX.store.set('session', {
    cur, spaces, wins: [...wins.values()].filter((w) => w.state !== 'full').map((w) => ({ appId: w.appId, params: w.params, rect: w.state === 'normal' ? w.rect : w.normal, state: w.state, zone: w.zone, space: w.space, min: w.min, pinned: w.pinned, z: +w.el.style.zIndex || 0 })),
  });
  WM.restoreSession = async () => {
    const s = GX.store.get('session'); if (!s?.wins?.length) return false;
    restoring = true;
    const list = [...s.wins].sort((a, b) => a.z - b.z);
    for (const [i, w] of list.entries()) {
      if (!GX.app(w.appId) || w.space >= spaces.length) continue;
      await new Promise((r) => setTimeout(r, i ? 70 : 0));
      const win = WM.open(w.appId, w.params, { rect: w.rect, space: w.space, state: w.state, zone: w.zone, min: w.min, pinned: w.pinned, silent: w.space !== cur });
      if (win && w.state !== 'normal') win.normal = w.rect;
    }
    restoring = false; drawDividers(); WM.save(); return true;
  };
  WM.resetSession = () => { GX.store.del('session'); location.reload(); };
})();

}
