// @ts-nocheck — moteur de la maquette CONVERTI (maquettes/v2/js/mobile.js), comportement identique.
// Typage fin : second temps, fichier par fichier, une fois le rendu validé identique à la maquette.
// Substitutions mécaniques : scripts/ui2-convert-engine.mjs. Retouches manuelles : balises [GEARBOX].
export function install(): void {
const GX = (window as any).GX; // lu au démarrage (le noyau l'a créé), pas à l'import
/* =====================================================================
   GEARBOX OS — coque TÉLÉPHONE
   Accueil (widgets + grille + Dock), apps plein écran ouvertes en zoom
   depuis leur icône, barre d'accueil (glisser = accueil, glisser et
   tenir = sélecteur d'apps), écrans empilés (retour), centres tirés du
   haut, recherche, appui long = actions rapides, bannières.
   Les rubriques sont les MÊMES qu'au bureau : elles s'adaptent seules.
   ===================================================================== */
(() => {
  const M = (GX.mobile = {});
  const D = GX.data, $ = (s, r = GX.root) => r.querySelector(s);
  let root, home, open = [], current = null; // open : écrans vivants, current : écran visible
  const QUICK = { projects: ['new-project', 'Nouveau projet'], digital: ['new-post', 'Nouvelle publication'], conges: ['conge', 'Poser une période'], material: ['book', 'Réserver du matériel'], fixed: ['expense', 'Nouvelle dépense'] };
  const DOCK = ['dashboard', 'projects', 'chat', 'agenda'];

  M.init = () => {
    const prefs = GX.shell.prefs;
    if (prefs.material === 'apple') prefs.material = 'liquid';
    if (['prisme', 'terminal', 'glitch'].includes(prefs.wallpaper)) prefs.wallpaper = 'bony';
    const R0 = GX.host; R0.dataset.theme = prefs.theme; R0.dataset.effects = prefs.effects; R0.dataset.material = prefs.material || 'pixel'; R0.dataset.icons = prefs.iconStyle || 'light'; R0.dataset.wallpaper = prefs.wallpaper; R0.dataset.da = 'signal';
    GX.body.insertAdjacentHTML('beforeend', `<div class="m-root" id="mroot">
      <div class="wallpaper wp-${prefs.wallpaper}" id="wp"></div>
      <div class="m-status"><button class="m-sl" id="mSL"><span id="mTime"></span><i class="ndot hide" id="mDot"></i></button><button class="m-sr" id="mSR">${GX.icon('wifi')}${GX.icon('battery')}</button></div>
      <div class="m-home" id="mhome"></div>
      <div class="m-banners" id="mban"></div></div>`);
    root = $('#mroot'); home = $('#mhome');
    if (GX.wall?.is(prefs.wallpaper)) { const wp = $('#wp'); wp.className = 'wallpaper wp-anim'; GX.wall.mount(wp, prefs.wallpaper); }
    setTimeout(() => GX.wall?.previews(), 1500);
    installShims(); buildHome(); tick(); setInterval(tick, 15000);
    $('#mSL').onclick = () => sheetV('nc'); $('#mSR').onclick = () => sheetV('cc');
    pullDown();
    GX.on('badges', () => { refreshBadges(); });
    /* [GEARBOX] la maquette construisait l'accueil une fois (données fictives déjà là) ; les VRAIES données
       arrivent après : on reconstruit l'accueil à leur arrivée et à chaque changement de rôle. */
    GX.on('data:projects', () => buildHome()); GX.on('ctx', () => buildHome());
    GX.on('prefs', () => {});
    if (!GX.store.sget('m-hint')) { GX.store.sset('m-hint', 1); setTimeout(() => GX.shell.hud('Balayez vers le bas pour chercher'), 900); }
    const direct = new URLSearchParams(location.search).get('app');
    if (direct && GX.app(direct)) setTimeout(() => M.open(direct), 200);
    /* [GEARBOX] scheduleSim() retiré (messages fictifs) */
  };
  const tick = () => { const t = $('#mTime'); if (t) t.textContent = GX.fmt.time(new Date()); };

  /* ---------------- Adaptateurs : les apps parlent au bureau, on répond en mobile ---------------- */
  function installShims() {
    GX.wm = {
      open: (id, params = {}, opts = {}) => M.open(id, params, opts.origin),
      active: () => current, list: () => open, visible: () => (current ? [current] : []),
      close: (w) => M.close(w), focus: (w) => M.show(w), minimize: () => M.home(), restore: (w) => M.show(w),
      unsnap: () => {}, snap: () => {}, toggleMax: () => {}, cur: () => 0, spaces: () => [{}], mission: () => M.switcher(), showDesktop: () => M.home(), desktopShown: () => !current,
    };
    GX.shell.notify = notify;
    GX.shell.dockRect = () => null; GX.shell.bounce = () => {}; GX.shell.refreshDock = refreshBadges;
    /* [GEARBOX] adaptateur de « Voir comme » (setRole) retiré : rôle du compte connecté. */
  }

  /* ---------------- Accueil ---------------- */
  function buildHome() {
    const apps = [...GX.apps.values()].filter((a) => !a.hidden && !a.system && GX.shell.canOpen(a.id));
    const dock = DOCK.filter((id) => GX.shell.canOpen(id));
    const grid = apps.filter((a) => !dock.includes(a.id));
    const pages = [grid.slice(0, 16), grid.slice(16)].filter((p) => p.length);
    home.innerHTML = `<div class="m-pages" id="mpages">
        <div class="m-page"><div class="m-greet"><div class="label">${GX.fmt.dateLong(new Date())}</div><h1>Bonjour ${GX.esc((GX.bridge().user.name || '').split(' ')[0])}</h1></div>${widgetsHTML()}</div>
        ${pages.map((pg) => `<div class="m-page"><button class="m-search glass" data-spot>${GX.icon('search', 'sm')}Rechercher</button><div class="m-grid">${pg.map((a) => icoHTML(a)).join('')}</div></div>`).join('')}
      </div><div class="m-dots" id="mdots">${[0, ...pages.map((_, i) => i + 1)].map((i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>
      <nav class="m-dock glass">${dock.map((id) => icoHTML(GX.app(id))).join('')}</nav>`;
    const pagesEl = $('#mpages');
    pagesEl.addEventListener('scroll', () => { const i = Math.round(pagesEl.scrollLeft / pagesEl.clientWidth); GX.root.querySelectorAll('#mdots i').forEach((d, k) => d.classList.toggle('on', k === i)); }, { passive: true });
    home.querySelectorAll('[data-spot]').forEach((b) => (b.onclick = spotlight));
    wireIcons(home); refreshBadges();
    home.querySelectorAll('.m-wdg').forEach((w) => (w.onclick = (e) => { if (e.target.closest('input,textarea,button')) return; if (w.dataset.app) M.open(w.dataset.app, {}, w); }));
  }
  const icoHTML = (a) => `<button class="m-ico" data-app="${a.id}">${GX.appIcon(a, 60)}<span class="nm">${GX.esc(a.name)}</span></button>`;
  function widgetsHTML() {
    if (GX.widgets) return `<div class="m-widgets">${GX.widgets.items().map((w) => `<div class="m-wdg wdg ${GX.widgets.kind(w)} msz-${w.size}" data-app="${GX.widgets.app(w) || ''}">${GX.widgets.inner(w)}</div>`).join('')}</div>`;
    const W = [], act = D.PROJECTS.filter((p) => p.status !== 'Draft');
    if (GX.shell.canOpen('budget')) {
      const planned = D.stats?.totalForecast || 0; /* [GEARBOX] moteur du Dashboard */
      const spent = D.stats?.totalActual || 0, pct = planned ? Math.round((spent / planned) * 100) : 0;
      W.push(`<div class="m-wdg glass" data-app="budget"><div class="wt">${GX.icon('budget', 'sm')}Budget</div><div class="row" style="margin-top:auto;gap:10px"><div class="ring" style="--p:${Math.min(100, pct)};--sz:58px;--th:8px"></div><b class="num" style="font-size:24px">${pct} %</b></div></div>`);
    }
    if (GX.shell.canOpen('projects')) W.push(`<div class="m-wdg accent" data-app="projects"><div class="wt">${GX.icon('alert', 'sm')}En retard</div><div class="wv num">${act.filter(D.projectLate).length}</div><div class="faint" style="font-size:12px">projets à reprendre</div></div>`);
    if (GX.shell.canOpen('digital')) {
      const next = D.POSTS.filter((p) => !p.archived && p.date >= GX.iso(GX.today())).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
      W.push(`<div class="m-wdg glass w2" data-app="digital"><div class="wt">${GX.icon('digital', 'sm')}Prochaines publications</div><div style="display:grid;gap:8px;margin-top:10px">${next.map((p) => `<div class="row" style="gap:8px;font-size:13px"><b class="num" style="width:50px">${GX.fmt.date(p.date)}</b><span class="ellipsis grow">${GX.esc(p.title)}</span>${GX.r.sStatus(p.status)}</div>`).join('')}</div></div>`);
    }
    if (GX.shell.canOpen('chat')) W.push(`<div class="m-wdg glass" data-app="chat"><div class="wt">${GX.icon('chat', 'sm')}Chat</div><div class="wv num" data-chatn>${D.CONVS.reduce((s, c) => s + c.unread, 0)}</div><div class="faint" style="font-size:12px">non lus</div></div>`);
    if (GX.shell.canOpen('agenda')) { const up = act.filter((p) => p.status === 'Active' && p.endDate >= GX.iso(GX.today())).sort((a, b) => a.endDate.localeCompare(b.endDate))[0]; W.push(`<div class="m-wdg glass" data-app="agenda"><div class="wt">${GX.icon('agenda', 'sm')}Prochaine échéance</div><b style="margin-top:auto;font-size:15px;line-height:1.25">${up ? GX.esc(up.name) : '—'}</b><div class="faint" style="font-size:12px;margin-top:4px">${up ? GX.fmt.rel(up.endDate) : ''}</div></div>`); }
    return `<div class="m-widgets">${W.join('')}</div>`;
  }
  function wireIcons(scope) {
    scope.querySelectorAll('.m-ico').forEach((b) => {
      let t = 0, long = false;
      b.addEventListener('pointerdown', () => { long = false; b.classList.add('press'); t = setTimeout(() => { long = true; quickActions(b); }, 480); });
      const cancel = () => { clearTimeout(t); b.classList.remove('press'); };
      b.addEventListener('pointerup', cancel); b.addEventListener('pointerleave', cancel); b.addEventListener('pointercancel', cancel);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      b.addEventListener('click', () => { if (!long) M.open(b.dataset.app, {}, b.querySelector('.app-ico')); });
    });
  }
  function quickActions(b) {
    const id = b.dataset.app, a = GX.app(id), q = QUICK[id];
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
    home.classList.add('dim'); b.style.zIndex = 900; GX.animate(b.querySelector('.app-ico'), [{ transform: 'scale(.88)' }, { transform: 'scale(1.12)' }], { spring: 'bouncy', fill: 'forwards' });
    const r = b.getBoundingClientRect();
    GX.menu.open([{ label: 'Ouvrir ' + a.name, icon: 'arrowr', action: () => M.open(id, {}, b.querySelector('.app-ico')) }, ...(q && !GX.ctx.readOnly ? [{ label: q[1], icon: 'plus', action: () => { const w = M.open(id); setTimeout(() => w?.inst?.command?.(q[0]), 480); } }] : []), '-', { label: 'Rechercher', icon: 'search', action: spotlight }],
      { x: r.left, y: r.bottom + 8 }, { onClose: () => { home.classList.remove('dim'); b.style.zIndex = ''; b.querySelector('.app-ico').getAnimations().forEach((x) => x.cancel()); } });
  }
  function refreshBadges() {
    GX.root.querySelectorAll('.m-ico').forEach((b) => {
      const n = GX.app(b.dataset.app)?.badge?.() || 0; let c = b.querySelector('.count');
      if (n && !c) b.insertAdjacentHTML('beforeend', `<span class="count">${n}</span>`); else if (n) c.textContent = n; else c?.remove();
    });
    const cn = GX.root.querySelector('[data-chatn]'); if (cn) cn.textContent = D.CONVS.reduce((s, c) => s + c.unread, 0);
  }

  /* ---------------- Ouvrir / fermer / afficher ---------------- */
  M.open = (appId, params = {}, origin) => {
    const app = GX.app(appId); if (!app) return;
    if (!GX.shell.canOpen(app.parent || appId)) { GX.shell.hud('Accès restreint pour ce rôle'); return; }
    const key = appId + (params.id ? ':' + params.id : '');
    const ex = open.find((w) => w.key === key);
    if (ex) { M.show(ex, origin); return ex; }
    const el = document.createElement('section'); el.className = 'm-app';
    const backTo = current && (app.parent || params.id) ? current : null;
    el.innerHTML = `<div class="m-nav">${backTo ? `<button class="m-back">${GX.icon('back', 'lg')}${GX.esc(backTo.app.name)}</button>` : ''}<div class="m-title">${backTo ? '' : GX.appIcon(app.parent ? GX.app(app.parent) : app, 24)}<span class="ellipsis t"></span></div><button class="icon-btn" data-menu>${GX.icon('more')}</button></div><div class="m-body"></div><div class="m-ind" data-tip=""></div>`;
    root.append(el);
    const win = {
      key, appId, app, params, el, body: el.querySelector('.m-body'), backTo, tools: document.createElement('div'),
      setTitle(t, sub = '') { el.querySelector('.m-title .t').innerHTML = `${GX.esc(backTo ? t : t)}${sub ? ` <span class="sub">${GX.esc(sub)}</span>` : ''}`; win.title = t; },
      setTools(html) { win.tools.innerHTML = html; return win.tools; }, close: () => M.close(win), focus: () => M.show(win),
      sheet: (html, o) => GX.ui.sheet(el, html, o), open: (id, p, o) => M.open(id, p, o), isCompact: () => true,
    };
    win.setTitle(params.title || app.name);
    open.push(win);
    try { win.inst = app.mount(win.body, win) || {}; } catch (err) { console.error(err); win.body.innerHTML = `<div class="empty">${GX.icon('alert')}Erreur : ${GX.esc(err.message)}</div>`; win.inst = {}; }
    el.querySelector('.m-back')?.addEventListener('click', () => M.close(win));
    el.querySelector('[data-menu]').onclick = (e) => appMenu(win, e.currentTarget);
    wireIndicator(win);
    const prev = current; current = win; root.classList.add('app-open');
    if (backTo) { // écran empilé : glisse depuis la droite, l'écran d'origine recule
      GX.animate(el, [{ transform: 'translateX(100%)' }, { transform: 'none' }], { spring: 'snappy' });
      GX.animate(prev.el, [{ transform: 'none', filter: 'brightness(1)' }, { transform: 'translateX(-25%)', filter: 'brightness(.7)' }], { spring: 'snappy' }).onfinish = () => prev.el.classList.add('hidden');
      edgeBack(win);
    } else { zoomIn(el, origin); if (prev) setTimeout(() => prev.el.classList.add('hidden'), 350); home.classList.add('away'); }
    if (!GX.store.sget('m-ind')) { GX.store.sset('m-ind', 1); el.insertAdjacentHTML('beforeend', '<div class="m-hint glass glass-strong">Glissez vers le haut pour revenir à l’accueil</div>'); }
    return win;
  };
  function zoomIn(el, origin) {
    const r = origin ? (origin.getBoundingClientRect ? origin.getBoundingClientRect() : origin) : { left: innerWidth / 2 - 30, top: innerHeight / 2 - 30, width: 60, height: 60 };
    GX.animate(el, [{ transform: `translate(${r.left}px, ${r.top}px) scale(${r.width / innerWidth}, ${r.height / innerHeight})`, borderRadius: '60px', opacity: .4 }, { opacity: 1, offset: .25 }, { transform: 'none', borderRadius: '0px', opacity: 1 }], { spring: 'snappy', duration: GX.spring.snappy.ms * 1.2 });
  }
  function zoomOut(win, done) {
    const ico = home.querySelector(`.m-ico[data-app="${win.app.parent || win.appId}"] .app-ico`);
    const r = ico && ico.getBoundingClientRect().width ? ico.getBoundingClientRect() : { left: innerWidth / 2 - 30, top: innerHeight / 2 - 30, width: 60, height: 60 };
    const cur = getComputedStyle(win.el).transform;
    GX.animate(win.el, [{ transform: cur === 'none' ? 'none' : cur, borderRadius: '28px', opacity: 1 }, { transform: `translate(${r.left}px, ${r.top}px) scale(${r.width / innerWidth}, ${r.height / innerHeight})`, borderRadius: '60px', opacity: 0 }], { spring: 'snappy', fill: 'forwards' }).onfinish = () => { win.el.classList.add('hidden'); win.el.getAnimations().forEach((a) => a.cancel()); win.el.style.transform = ''; done && done(); };
  }
  M.show = (win, origin) => {
    if (current === win) return;
    const prev = current; current = win; root.classList.add('app-open'); home.classList.add('away');
    win.el.classList.remove('hidden'); root.append(win.el); zoomIn(win.el, origin);
    if (prev) setTimeout(() => prev.el.classList.add('hidden'), 350);
  };
  M.home = () => {
    if (!current) return; const w = current; current = null; root.classList.remove('app-open');
    home.classList.remove('away'); zoomOut(w);
    open.filter((x) => x !== w).forEach((x) => x.el.classList.add('hidden'));
  };
  M.close = (win, silent) => {
    try { win.inst?.destroy?.(); } catch (e) {}
    open = open.filter((w) => w !== win);
    if (win.backTo && current === win && open.includes(win.backTo)) { // retour vers l'écran d'origine
      const b = win.backTo; b.el.classList.remove('hidden'); current = b;
      GX.animate(b.el, [{ transform: 'translateX(-25%)', filter: 'brightness(.7)' }, { transform: 'none', filter: 'brightness(1)' }], { spring: 'snappy' });
      GX.animate(win.el, [{ transform: getComputedStyle(win.el).transform === 'none' ? 'none' : getComputedStyle(win.el).transform }, { transform: 'translateX(100%)' }], { spring: 'snappy', fill: 'forwards' }).onfinish = () => win.el.remove();
      return;
    }
    if (current === win) { current = null; root.classList.remove('app-open'); home.classList.remove('away'); if (!silent) return zoomOut(win, () => win.el.remove()); }
    win.el.remove();
  };
  function appMenu(win, anchor) {
    const m = win.inst?.menus?.() || {};
    const items = Object.entries(m).flatMap(([k, arr]) => (arr?.length ? [{ header: k }, ...arr] : []));
    GX.menu.open([...items, ...(items.length ? ['-'] : []), { label: 'Sélecteur d’apps', icon: 'expose', action: M.switcher }, { label: 'Accueil', icon: 'grid', action: M.home }, { label: 'Fermer ' + win.app.name, icon: 'close', action: () => M.close(win) }], anchor, { align: 'right' });
  }
  /* Glisser depuis le bord gauche d'un écran empilé = retour */
  function edgeBack(win) {
    win.el.addEventListener('pointerdown', (e) => {
      if (e.clientX > 22 || e.pointerType === 'mouse' || current !== win) return;
      const sx = e.clientX; let dx = 0; const b = win.backTo; if (!b) return; b.el.classList.remove('hidden'); b.el.getAnimations().forEach((a) => a.cancel());
      const mv = (ev) => { dx = Math.max(0, ev.clientX - sx); win.el.style.transform = `translateX(${dx}px)`; b.el.style.transform = `translateX(${-25 + (dx / innerWidth) * 25}%)`; };
      const up = () => { GX.unwin(window, 'pointermove', mv); b.el.style.transform = ''; if (dx > innerWidth * .33) { M.close(win); } else { GX.animate(win.el, [{ transform: `translateX(${dx}px)` }, { transform: 'none' }]); win.el.style.transform = ''; b.el.classList.add('hidden'); } };
      GX.win(window, 'pointermove', mv); GX.win(window, 'pointerup', up, { once: true });
    });
  }

  /* ---------------- Barre d'accueil : glisser = accueil, glisser + tenir = sélecteur ---------------- */
  function wireIndicator(win) {
    const ind = win.el.querySelector('.m-ind');
    ind.addEventListener('click', () => { if (!moved) M.home(); });
    let moved = false;
    ind.addEventListener('pointerdown', (e) => {
      moved = false; const sy = e.clientY, t0 = performance.now(); let dy = 0, holdT = 0, held = false, lastY = sy, lastT = t0, vel = 0;
      ind.setPointerCapture(e.pointerId); win.el.getAnimations().forEach((a) => a.cancel());
      const mv = (ev) => {
        dy = Math.min(0, ev.clientY - sy); if (Math.abs(dy) > 6) moved = true;
        const now = performance.now(); vel = (ev.clientY - lastY) / Math.max(1, now - lastT); lastY = ev.clientY; lastT = now;
        const p = Math.min(1, -dy / (innerHeight * .6));
        win.el.style.transform = `translateY(${dy * .6}px) scale(${1 - p * .45})`; win.el.style.transformOrigin = '50% 100%'; win.el.style.borderRadius = 28 * p + 'px';
        home.classList.remove('away'); home.style.opacity = p; home.style.transform = `scale(${.9 + p * .1})`;
        clearTimeout(holdT); if (-dy > 70 && -dy < innerHeight * .45) holdT = setTimeout(() => { held = true; if (navigator.vibrate) try { navigator.vibrate(6); } catch (e) {} }, 260);
      };
      const up = () => {
        ind.removeEventListener('pointermove', mv); clearTimeout(holdT);
        home.style.opacity = ''; home.style.transform = ''; win.el.style.transformOrigin = '0 0'; win.el.style.borderRadius = '';
        if (!moved) { win.el.style.transform = ''; home.classList.add('away'); return; }
        if (held) { win.el.style.transform = ''; M.switcher(); return; }
        if (-dy > 110 || vel < -0.6) { current = null; root.classList.remove('app-open'); zoomOut(win); win.el.style.transform = ''; }
        else { GX.animate(win.el, [{ transform: win.el.style.transform }, { transform: 'none' }]); win.el.style.transform = ''; home.classList.add('away'); }
      };
      ind.addEventListener('pointermove', mv); ind.addEventListener('pointerup', up, { once: true }); ind.addEventListener('pointercancel', up, { once: true });
    });
  }

  /* ---------------- Sélecteur d'apps ---------------- */
  M.switcher = () => {
    GX.root.querySelector('.m-switch')?.remove();
    const sw = document.createElement('div'); sw.className = 'm-switch';
    const list = [...open].reverse();
    sw.innerHTML = list.length ? '' : '<div class="m-empty">Aucune app ouverte</div>';
    list.forEach((w) => {
      const c = document.createElement('div'); c.className = 'm-card';
      c.innerHTML = `<div class="lbl">${GX.appIcon(w.app.parent ? GX.app(w.app.parent) : w.app, 22)}<span class="ellipsis">${GX.esc(w.title || w.app.name)}</span></div><div class="shot"></div>`;
      const shot = c.querySelector('.shot'), clone = w.el.cloneNode(true); clone.classList.remove('hidden'); clone.style.cssText = ''; shot.append(clone);
      requestAnimationFrame(() => { clone.style.transform = `scale(${shot.clientWidth / innerWidth})`; });
      // Glisser la carte vers le haut = fermer l'app
      c.addEventListener('pointerdown', (e) => {
        const sy = e.clientY, sx = e.clientX; let dy = 0, vertical = null;
        const mv = (ev) => { if (vertical === null && (Math.abs(ev.clientY - sy) > 8 || Math.abs(ev.clientX - sx) > 8)) vertical = Math.abs(ev.clientY - sy) > Math.abs(ev.clientX - sx); if (!vertical) return; dy = Math.min(0, ev.clientY - sy); c.style.transform = `translateY(${dy}px)`; c.style.opacity = 1 + dy / 500; };
        const up = () => {
          GX.unwin(window, 'pointermove', mv);
          if (vertical && dy < -120) { GX.animate(c, [{ transform: `translateY(${dy}px)`, opacity: c.style.opacity }, { transform: 'translateY(-110vh)', opacity: 0 }], { duration: 240, fill: 'forwards' }).onfinish = () => { M.close(w, true); c.remove(); if (!open.length) { sw.remove(); } }; }
          else if (vertical) { GX.animate(c, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }]); c.style.transform = ''; c.style.opacity = ''; }
          else if (vertical === null) { sw.remove(); M.show(w, shot); }
        };
        GX.win(window, 'pointermove', mv); GX.win(window, 'pointerup', up, { once: true });
      });
      sw.append(c);
    });
    sw.addEventListener('click', (e) => { if (e.target === sw) { sw.remove(); if (current) { current.el.classList.add('hidden'); current = null; root.classList.remove('app-open'); } home.classList.remove('away'); } });
    root.append(sw);
    open.forEach((w) => w.el.classList.add('hidden')); current = null; root.classList.remove('app-open'); home.classList.add('away');
  };

  /* ---------------- Centres tirés du haut ---------------- */
  /* [GEARBOX] vrai fil d'activité (GX.data.FEED), relu à chaque ouverture ; masqué hors équipe marketing */
  const feedNotifs = () => (GX.bridge().showSocial ? D.FEED : []).map((f) => ({ app: f.app, u: f.u, title: D.user(f.u).name, body: `${f.a} « ${f.o} »`, at: f.at, unread: f.unread, raw: f.raw }));
  function sheetV(which) {
    GX.root.querySelectorAll('.m-sheetv').forEach((x) => x.remove());
    const s = document.createElement('div'); s.className = 'm-sheetv';
    const P = GX.shell.prefs;
    const notifs = feedNotifs(); /* [GEARBOX] */
    if (which === 'nc') {
      s.innerHTML = `<h2>Notifications</h2>${notifs.map((n, i) => `<div class="notif glass ${n.unread ? 'unread' : ''}" data-i="${i}">${n.u ? GX.r.av(n.u) : GX.appIcon(n.app, 30)}<div style="min-width:0"><div class="n-app">${GX.esc(GX.app(n.app)?.name || '')}</div><div class="n-t">${GX.esc(n.title)}</div><div class="n-b">${GX.esc(n.body)}</div></div><span class="n-time">${GX.fmt.ago(n.at)}</span></div>`).join('') || '<div class="empty">Aucune notification</div>'}<div class="grab"></div>`;
      notifs.forEach((n) => (n.unread = false)); $('#mDot').classList.add('hide'); GX.bridge().feed.markAllRead(); /* [GEARBOX] */
    } else {
      s.innerHTML = `<h2>Centre de contrôle</h2><div class="m-cc">
        <div class="cc-tile ${P.theme === 'dark' ? 'on' : ''}" data-k="theme"><span class="ic">${GX.icon(P.theme === 'dark' ? 'moon' : 'sun')}</span><div><b>Thème</b><span>${P.theme === 'dark' ? 'Sombre' : 'Clair'}</span></div></div>
        <div class="cc-tile ${P.effects === 'eco' ? 'on' : ''}" data-k="eco"><span class="ic">${GX.icon('leaf')}</span><div><b>Économe</b><span>${P.effects === 'eco' ? 'Sans flou' : 'Désactivé'}</span></div></div>
        <div class="cc-tile ${P.dnd ? 'on' : ''}" data-k="dnd"><span class="ic">${GX.icon('moon')}</span><div><b>Ne pas déranger</b><span>${P.dnd ? 'Activé' : 'Désactivé'}</span></div></div>
        <div class="cc-tile" data-k="switch"><span class="ic">${GX.icon('expose')}</span><div><b>Apps ouvertes</b><span>${open.length}</span></div></div>
        <div class="cc-tile" style="grid-column:1/-1;display:block"><b style="font-size:12px">Fond d’écran</b><div class="cc-wps">${[...(GX.wall ? GX.wall.ids : []), 'sunset', 'night', 'dawn', 'volcans', 'graphite', 'carbone', 'grille'].map((w) => `<button class="${P.wallpaper === w ? 'on' : ''}" data-wp="${w}"><div class="wallpaper wp-${w}" style="position:absolute"></div></button>`).join('')}</div></div></div><div class="grab"></div>`;
    }
    root.append(s); requestAnimationFrame(() => s.classList.add('on'));
    const close = () => { s.classList.remove('on'); setTimeout(() => s.remove(), 460); };
    s.addEventListener('click', (e) => {
      const n = e.target.closest('.notif'); if (n) { close(); const x = notifs[+n.dataset.i]; x.raw ? GX.openActivity(x.raw) : M.open(x.app); return; } /* [GEARBOX] */
      const k = e.target.closest('[data-k]')?.dataset.k, wp = e.target.closest('[data-wp]');
      if (wp) { GX.shell.setPref('wallpaper', wp.dataset.wp); close(); return; }
      if (k === 'theme') GX.shell.toggleTheme(); /* [GEARBOX] thème de l'appli */
      if (k === 'eco') GX.shell.setPref('effects', P.effects === 'eco' ? 'full' : 'eco');
      if (k === 'dnd') GX.shell.setPref('dnd', !P.dnd);
      if (k === 'switch') { close(); M.switcher(); return; }
      if (k) { close(); setTimeout(() => sheetV('cc'), 480); return; }
      if (e.target === s || e.target.classList.contains('grab')) close();
    });
    // Glisser vers le haut pour refermer
    s.addEventListener('pointerdown', (e) => { if (e.target.closest('select,button,.notif')) return; const sy = e.clientY; let dy = 0; const mv = (ev) => { dy = Math.min(0, ev.clientY - sy); s.style.transform = `translateY(${dy}px)`; }; const up = () => { GX.unwin(window, 'pointermove', mv); s.style.transform = ''; if (dy < -80) close(); }; GX.win(window, 'pointermove', mv); GX.win(window, 'pointerup', up, { once: true }); });
  }
  /* Tirer vers le bas : depuis la barre d'état (gauche = notifications, droite = contrôle), au milieu de l'accueil = recherche */
  function pullDown() {
    GX.win(window, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse' && !e.target.closest('.m-status')) return;
      const inStatus = e.clientY < 50 + (parseFloat(getComputedStyle(GX.host).getPropertyValue('--sat')) || 0);
      const onHome = !current && e.target.closest('.m-page') && !e.target.closest('.m-ico,.m-wdg,button');
      if (!inStatus && !onHome) return;
      const sy = e.clientY, sx = e.clientX; let dy = 0;
      const mv = (ev) => { dy = ev.clientY - sy; };
      const up = () => { GX.unwin(window, 'pointermove', mv); if (dy > 60) { if (inStatus) sheetV(sx < innerWidth / 2 ? 'nc' : 'cc'); else spotlight(); } };
      GX.win(window, 'pointermove', mv); GX.win(window, 'pointerup', up, { once: true });
    }, true);
  }

  /* ---------------- Recherche ---------------- */
  function spotlight() {
    GX.root.querySelector('.m-spot')?.remove();
    const s = document.createElement('div'); s.className = 'm-spot';
    s.innerHTML = `<div class="row"><label class="search grow">${GX.icon('search')}<input placeholder="Rechercher dans Gearbox" /></label><button class="btn ghost" data-x>Annuler</button></div><div class="res"></div>`;
    root.append(s);
    const q = s.querySelector('input'), res = s.querySelector('.res');
    const render = () => {
      const t = q.value.trim().toLowerCase(), has = (x) => x.toLowerCase().includes(t);
      const apps = [...GX.apps.values()].filter((a) => !a.hidden && !a.system && GX.shell.canOpen(a.id) && (!t || has(a.name))).slice(0, t ? 6 : 8).map((a) => ({ i: GX.appIcon(a, 34), l: a.name, s: 'Rubrique', run: () => M.open(a.id) }));
      const pr = t ? D.PROJECTS.filter((p) => has(p.name)).slice(0, 5).map((p) => ({ i: GX.icon('projects', 'lg'), l: p.name, s: p.sites[0], run: () => M.open('project', { id: p.id, title: p.name }) })) : [];
      const pp = t ? D.USERS.filter((u) => u.id !== GX.ctx.uid && has(u.name)).slice(0, 3).map((u) => ({ i: GX.r.av(u.id), l: u.name, s: 'Message', run: () => { const w = M.open('chat'); setTimeout(() => w?.inst?.command?.('dm:' + u.id), 450); } })) : [];
      const items = [...pr, ...apps, ...pp];
      res.innerHTML = items.map((x, i) => `<button class="sp-r" data-i="${i}">${x.i}<span class="ellipsis">${GX.esc(x.l)}</span><span class="sub">${GX.esc(x.s || '')}</span></button>`).join('') || `<div class="empty">${GX.icon('search')}Aucun résultat</div>`;
      res.onclick = (e) => { const b = e.target.closest('.sp-r'); if (b) { s.remove(); items[+b.dataset.i].run(); } };
    };
    q.oninput = render; render(); setTimeout(() => q.focus(), 60);
    s.querySelector('[data-x]').onclick = () => s.remove();
  }

  /* ---------------- Bannières ---------------- */
  function notify(n) {
    n = { at: Date.now(), unread: true, ...n }; notifs.unshift(n); $('#mDot')?.classList.remove('hide');
    if (GX.shell.prefs.dnd || n.silent) return;
    const box = $('#mban'), el = document.createElement('div');
    el.innerHTML = `<div class="notif glass glass-strong">${n.u ? GX.r.av(n.u) : GX.appIcon(n.app || 'settings', 30)}<div style="min-width:0"><div class="n-app">${GX.esc(GX.app(n.app)?.name || '')}</div><div class="n-t">${GX.esc(n.title)}</div><div class="n-b">${GX.esc(n.body)}</div></div><span class="n-time">maintenant</span></div>`;
    const b = el.firstElementChild; box.prepend(b); while (box.children.length > 2) box.lastElementChild.remove();
    const out = () => { b.classList.add('out'); setTimeout(() => b.remove(), 270); }; let t = setTimeout(out, 5000);
    b.onclick = () => { clearTimeout(t); out(); n.onClick ? n.onClick() : M.open(n.app); };
    b.addEventListener('pointerdown', (e) => { const sy = e.clientY; const mv = (ev) => { if (ev.clientY - sy < -30) { clearTimeout(t); out(); GX.unwin(window, 'pointermove', mv); } }; GX.win(window, 'pointermove', mv); GX.win(window, 'pointerup', () => GX.unwin(window, 'pointermove', mv), { once: true }); });
  }
  /* [GEARBOX] scheduleSim() retiré. */
})();

}
