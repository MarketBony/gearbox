// @ts-nocheck — moteur de la maquette CONVERTI (maquettes/v2/js/shell.js), comportement identique.
// Typage fin : second temps, fichier par fichier, une fois le rendu validé identique à la maquette.
// Substitutions mécaniques : scripts/ui2-convert-engine.mjs. Retouches manuelles : balises [GEARBOX].
import { canEditProjects, canEditDigital, FIXED_EXPENSE_EDIT_ROLES, peutLireConges } from '../../../constants';
import { canBook } from '../../apps/material/logic';
export function install(): void {
const GX = (window as any).GX; // lu au démarrage (le noyau l'a créé), pas à l'import
/* =====================================================================
   GEARBOX OS — la coque desktop : barre de menus, Dock, Launchpad,
   Spotlight, centre de contrôle, notifications, widgets, écran verrouillé,
   « Voir comme » (rôles cloisonnés), raccourcis.
   ===================================================================== */
(() => {
  const S = (GX.shell = {});
  const D = GX.data, $ = (s, r = GX.root) => r.querySelector(s);
  /* Réglages par défaut : fond Bony, thème sombre, direction Signal, Liquid Glass, icônes claires,
     barre du haut escamotable. PREFS_V : quand les défauts changent, on les réapplique une fois. */
  const DEFAULTS = { theme: 'dark', effects: 'full', wallpaper: 'bony', dockMag: true, dockAutohide: false, dockSmart: true, dockSize: 50, widgets: true, dnd: false, material: 'liquid', iconStyle: 'light', da: 'signal', menubarAuto: true };
  const PREFS_V = 3, stored = GX.store.get('prefs', {});
  const prefs = Object.assign({}, DEFAULTS, (stored.v || 0) >= PREFS_V ? stored : { ...stored, theme: 'dark', wallpaper: 'bony', material: 'liquid', iconStyle: 'light', da: 'signal', menubarAuto: true, dockSize: 50 }, { v: PREFS_V });
  prefs.iconStyle = ({ signature: 'light', graphite: 'dark', bony: 'tinted' })[prefs.iconStyle] || prefs.iconStyle;
  const savePrefs = () => GX.store.set('prefs', prefs);
  S.prefs = prefs;
  /* [GEARBOX] Rôle et site RÉELS du compte (pont de l'appli) — « Voir comme » est retiré. */
  const applyRole = () => {
    const b = GX.bridge(); GX.ctx.role = b.user.role; GX.ctx.uid = b.user.id;
    /* Chef de site : `ctx.site` = LIBELLÉ de son périmètre verrouillé (toutes ses concessions, pas la première
       seule — audit du 30/09/2026) ; `ctx.sites` = la liste. Le périmètre global ne filtre rien de plus : le
       serveur n'envoie déjà que ses sites (d'où « Tout le réseau » dès qu'il en a plusieurs). */
    const sm = GX.ctx.role === 'Site Manager', ss = sm ? (b.user.sites || []) : [];
    GX.ctx.sites = sm ? ss : null;
    GX.ctx.site = sm ? (ss.length > 1 ? ss.join(', ') : ss[0] || 'Aucun site') : null;
    GX.ctx.readOnly = ['Site Manager', 'Guest'].includes(GX.ctx.role);
    GX.ctx.perimetre = sm ? (ss.length === 1 ? ss[0] : 'Tout le réseau') : GX.ctx.perimetre;
  };
  applyRole();

  /* [GEARBOX] Droits : ceux de l'appli (services/navigation.ts + gardes d'App.tsx), jamais une table locale. */
  S.canOpen = (appId) => {
    const a = GX.app(appId); if (!a) return false; if (a.system) return true;
    const id = a.parent || appId; if (id === 'settings') return true;
    const b = GX.bridge(), tab = GX.tabOf(id);
    return b.nav.allowedIds.has(tab) && b.resolveTab(tab) === tab;
  };
  /* [GEARBOX] Actions globales (menu Fichier, Spotlight, appui long mobile) : proposées seulement au rôle qui
     peut les FAIRE — mêmes règles que les rubriques (constants.ts), jamais une liste locale. Avant : proposées à
     tous puis refusées à l'ouverture (audit des droits du 30/09/2026). */
  const ACTION_RIGHTS = {
    'new-project': () => canEditProjects(GX.ctx.role) && !GX.ctx.readOnly,
    'new-post': () => canEditDigital(GX.ctx.role) && !GX.ctx.readOnly,
    'conge': () => peutLireConges(GX.ctx.role),
    'book': () => canBook(GX.ctx.role),
    'expense': () => FIXED_EXPENSE_EDIT_ROLES.includes(GX.ctx.role) && !GX.ctx.readOnly,
  };
  const ACTION_APP = { 'new-project': 'projects', 'new-post': 'digital', 'conge': 'conges', 'book': 'material', 'expense': 'fixed' };
  S.canAction = (k) => !ACTION_APP[k] || (S.canOpen(ACTION_APP[k]) && (ACTION_RIGHTS[k]?.() ?? true));
  /** Ouvre une rubrique puis lui passe une commande — RIEN si l'ouverture est refusée (avant : la commande
      partait vers la fenêtre active, une autre rubrique). */
  S.openWith = (appId, cmd, params) => { const w = GX.wm.open(appId, params); if (!w) return null; setTimeout(() => w.inst?.command?.(cmd), 420); return w; };
  const DOCK = ['launchpad', 'dashboard', 'projects', 'todo', 'digital', 'campaigns', 'forms', 'chat', 'hello', 'agenda', 'budget', 'fixed', 'material', 'conges', 'export', 'games', '|', 'archives', 'settings'];

  /* ======================= Démarrage ======================= */
  S.init = () => {
    if (prefs.material === 'apple') prefs.material = 'liquid';
    if (['prisme', 'terminal', 'glitch'].includes(prefs.wallpaper)) prefs.wallpaper = 'bony'; /* [GEARBOX] identifiants d'essai du 30/09/2026 → définitifs */ prefs.wallpaper = ({ 'bony-a': 'bony', 'bony-b': 'bony-trame', 'bony-c': 'bony-traces' } as any)[prefs.wallpaper] || prefs.wallpaper; // fonds retirés // « Verre Apple » est devenu « Liquid Glass »
    prefs.theme = GX.bridge().theme; /* [GEARBOX] thème de l'appli */
    const R0 = GX.host; R0.dataset.theme = prefs.theme; R0.dataset.effects = prefs.effects; R0.dataset.material = prefs.material; R0.dataset.icons = prefs.iconStyle; R0.dataset.wallpaper = prefs.wallpaper; prefs.da = 'signal'; R0.dataset.da = 'signal'; // direction artistique unique (les deux autres ont été retirées) R0.toggleAttribute('data-mbauto', !!prefs.menubarAuto);
    GX.body.insertAdjacentHTML('beforeend', `
      <div class="wallpaper wp-${prefs.wallpaper}" id="wp"></div>
      <header class="menubar glass glass-strong" id="menubar"></header>
      <main id="desk"><div class="widgets" id="widgets"></div></main>
      <div class="mc-veil" id="mcVeil"></div><div class="mc-spaces glass glass-strong" id="mcSpaces"></div>
      <div class="dock-hot" id="dockHot"></div><div class="dock-wrap" id="dockWrap"><nav class="dock glass" id="dock"></nav></div>
      <div class="launchpad" id="launchpad"><label class="search lp-search">${GX.icon('search')}<input placeholder="Rechercher" /></label><div class="lp-grid"></div></div>
      <div class="spot-veil" id="spotVeil"></div><div class="spot glass glass-strong" id="spot"><div class="sp-in">${GX.icon('search')}<input placeholder="Recherche Gearbox" /></div><div class="sp-res scroll"></div>
        <div class="sp-foot"><span><span class="kbd">↑</span> <span class="kbd">↓</span> naviguer</span><span><span class="kbd">↵</span> ouvrir</span><span><span class="kbd">Échap</span> fermer</span></div></div>
      <div class="panel glass glass-strong" id="cc"></div>
      <aside class="nc" id="nc"><div class="nc-head glass glass-strong" style="padding:10px 14px;border-radius:14px"><span>Notifications</span><button class="btn sm ghost" id="ncClear">Tout effacer</button></div><div class="nc-list scroll" id="ncList"></div></aside>
      <div class="banners" id="banners"></div>`);
    GX.wm.init($('#desk'));
    GX.wm.initMissionEvents();
    setWallpaper(prefs.wallpaper, false);
    GX.host.style.setProperty('--dock-icon', prefs.dockSize + 'px');
    setTimeout(() => GX.wall?.previews(), 1200);
    buildMenubar(); buildDock(); buildLaunchpad(); buildSpotlight(); buildCC(); buildNC(); buildWidgets(); initDesktopMenu(); initKeys(); initMenubarAuto();
    GX.on('wm:focus', () => { buildMenubar(); S.widgetsDim(); applyDock(); });
    GX.on('wm:change', () => { refreshDock(); S.widgetsDim(); applyDock(); buildMenubar(); });
    GX.on('wm:title', () => buildMenubar());
    GX.on('badges', refreshDock);
    GX.on('presence', refreshDockPresence); GX.on('data:users', refreshDockPresence);
    tick(); setInterval(tick, 15000);
    start(); /* [GEARBOX] écran verrouillé retiré (décision Théo) */
  };
  async function start() {
    // ?app=<id> : ouvre une seule rubrique, agrandie (tests, liens directs)
    const direct = new URLSearchParams(location.search).get('app');
    if (direct && GX.app(direct)) { const w = GX.wm.open(direct, {}, { silent: true }); if (w) GX.wm.snap(w, 'max'); return; }
    const restored = await GX.wm.restoreSession();
    if (!restored) {
      GX.wm.open('dashboard');
      setTimeout(() => { if (innerWidth >= 1280) { const d = GX.wm.list()[0]; if (d) GX.wm.snap(d, 'left'); const p = GX.wm.open('projects'); if (p) GX.wm.snap(p, 'right'); } }, 400);
      setTimeout(() => S.notify({ app: 'settings', title: 'Bienvenue dans Gearbox OS', body: 'Glissez une fenêtre sur un bord ou un coin · survolez le bouton vert · F3 · Ctrl K · clic droit partout · swipe à deux doigts pour changer de bureau.', actions: [{ label: 'Voir les raccourcis', action: () => shortcuts() }] }), 1800);
    }
    /* [GEARBOX] scheduleSimulation() retiré : les notifications viennent du vrai fil d'activité. */
  }

  /* ======================= Barre de menus ======================= */
  let mbOpen = null, mergedWin = null;
  function appMenus() {
    const w = GX.wm.active();
    const app = w ? (w.app.parent ? GX.app(w.app.parent) : w.app) : null;
    const custom = (w && (w.inst?.menus?.() || w.app.menus?.(w))) || {};
    const winItems = GX.wm.list().filter((x) => x.space === GX.wm.cur()).map((x) => ({ label: x.title + (x.min ? ' (réduite)' : ''), checked: x === w, action: () => GX.wm.focus(x) }));
    const m = {};
    m.__logo = [
      { label: 'À propos de Gearbox OS', icon: 'info', action: about }, '-',
      { label: 'Réglages…', icon: 'settings', action: () => GX.wm.open('settings') },
      { label: 'Fond d’écran…', icon: 'wallpaper', action: () => GX.wm.open('settings', { title: 'Réglages', tab: 'apparence' }) }, '-',
      /* [GEARBOX] « Voir comme » et « Verrouiller l'écran » retirés ; retour à l'ancienne interface et déconnexion. */
      { label: 'Réinitialiser la session', icon: 'refresh', action: () => GX.wm.resetSession() }, '-',
      { label: 'Revenir à l’ancienne interface', icon: 'arrowl', action: () => GX.bridge().onExit() },
      { label: `Se déconnecter (${GX.bridge().user.name})`, icon: 'logout', action: () => GX.bridge().logout() },
    ];
    m.__app = app ? [
      { label: `À propos de ${app.name}`, icon: 'info', action: () => S.hud(`${app.name} — rubrique Gearbox`) }, '-',
      { label: `Masquer ${app.name}`, kbd: 'Ctrl Alt M', action: () => GX.wm.list().filter((x) => (x.app.parent || x.appId) === app.id).forEach((x) => GX.wm.minimize(x)) },
      { label: 'Masquer les autres', action: () => GX.wm.visible().filter((x) => (x.app.parent || x.appId) !== app.id).forEach((x) => GX.wm.minimize(x)) },
      { label: 'Tout afficher', action: () => GX.wm.list().forEach((x) => x.min && GX.wm.restore(x)) }, '-',
      { label: `Quitter ${app.name}`, kbd: '', action: () => GX.wm.list().filter((x) => (x.app.parent || x.appId) === app.id).forEach((x) => GX.wm.close(x)) },
    ] : [{ label: 'À propos de Gearbox OS', action: about }];
    m['Fichier'] = [...(custom['Fichier'] || []), ...(custom['Fichier'] ? ['-'] : []), ...(S.canAction('new-project') ? [{ label: 'Nouveau projet', icon: 'plus', action: () => S.action('new-project') }, '-'] : []), { label: 'Fermer la fenêtre', kbd: 'Ctrl Alt W', disabled: !w, action: () => w && GX.wm.close(w) }];
    m['Édition'] = [{ label: 'Annuler', kbd: 'Ctrl Z', disabled: true }, { label: 'Rétablir', kbd: 'Ctrl Y', disabled: true }, '-', { label: 'Copier', kbd: 'Ctrl C', disabled: true }, { label: 'Coller', kbd: 'Ctrl V', disabled: true }, '-', { label: 'Rechercher partout', icon: 'search', kbd: 'Ctrl K', action: () => S.spotlight() }];
    m['Présentation'] = [...(custom['Présentation'] || []), ...(custom['Présentation'] ? ['-'] : []),
      { label: prefs.theme === 'dark' ? 'Thème clair' : 'Thème sombre', icon: prefs.theme === 'dark' ? 'sun' : 'moon', action: toggleTheme },
      { label: w?.state === 'full' ? 'Quitter le plein écran' : 'Plein écran', icon: 'desktop', kbd: 'Ctrl Alt F', disabled: !w, action: () => w && GX.wm.fullscreen(w) },
      { label: 'Masquer automatiquement le Dock', checked: prefs.dockAutohide, action: () => { prefs.dockAutohide = !prefs.dockAutohide; savePrefs(); applyDock(); } }];
    m['Aller'] = GX.apps.size ? [...GX.apps.values()].filter((a) => !a.hidden && !a.system && S.canOpen(a.id)).map((a) => ({ label: a.name, icon: a.icon || a.id, action: () => GX.wm.open(a.id) })) : [];
    m['Fenêtre'] = [
      { label: 'Réduire', kbd: 'Ctrl Alt M', disabled: !w, action: () => GX.wm.minimize(w) },
      { label: 'Agrandir', kbd: 'Ctrl ⇧ ↑', disabled: !w, action: () => GX.wm.toggleMax(w) },
      { label: 'Ancrer à gauche', kbd: 'Ctrl ⇧ ←', disabled: !w, action: () => GX.wm.snap(w, 'left', { assist: true }) },
      { label: 'Ancrer à droite', kbd: 'Ctrl ⇧ →', disabled: !w, action: () => GX.wm.snap(w, 'right', { assist: true }) },
      { label: 'Toujours au premier plan', kbd: 'Ctrl Alt T', checked: w?.pinned, disabled: !w, action: () => GX.wm.togglePin(w) }, '-',
      { label: 'Mission Control', icon: 'expose', kbd: 'F3', action: () => GX.wm.mission(true) },
      { label: 'Afficher le bureau', icon: 'desktop', kbd: 'Ctrl Alt D', action: () => GX.wm.showDesktop() },
      { label: 'Bureau suivant', kbd: 'Ctrl Alt 1…4', action: () => GX.wm.goSpace((GX.wm.cur() + 1) % GX.wm.spaces().length) },
      { label: 'Nouveau bureau', icon: 'plus', disabled: GX.wm.spaces().length >= 4, action: () => { GX.wm.addSpace(); GX.wm.goSpace(GX.wm.spaces().length - 1); } },
      ...(winItems.length ? ['-', ...winItems] : []),
    ];
    m['Aide'] = [{ label: 'Raccourcis clavier', icon: 'keyboard', kbd: 'Ctrl /', action: shortcuts }, { label: 'À propos de la maquette', icon: 'info', action: about }];
    return { m, app };
  }
  function buildMenubar() {
    const mb = $('#menubar'); if (!mb) return;
    const { m, app } = appMenus();
    const names = ['Fichier', 'Édition', 'Présentation', 'Aller', 'Fenêtre', 'Aide'];
    const roleBadge = GX.ctx.role !== 'Master' ? `<span class="mb-role" data-tip="Votre rôle">${D.ROLES[GX.ctx.role].l}${GX.ctx.site ? ' · ' + GX.ctx.site : ''}</span>` : '';
    // Fenêtre agrandie active : sa barre de titre fusionne avec la barre de menus (+40 px de contenu)
    const aw = GX.wm.active(), merged = aw && (aw.state === 'max' || (aw.state === 'snap' && aw.zone === 'max')) && !aw.min && aw.space === GX.wm.cur() && !GX.host.classList.contains('fs-mode') ? aw : null;
    if (mergedWin && mergedWin !== merged && mergedWin.tools && mergedWin.el.isConnected) mergedWin.el.querySelector('.titlebar').append(mergedWin.tools);
    GX.root.querySelectorAll('.win.merged').forEach((x) => x !== merged?.el && x.classList.remove('merged'));
    merged?.el.classList.add('merged');
    mergedWin = merged; GX.host.classList.toggle('mb-merged', !!merged);
    mb.innerHTML = `<button class="mb-item mb-logo" data-m="__logo"><img src="icon-mark.svg" alt="" /></button>
      ${merged ? `<div class="mb-lights lights"><button class="l-close" data-tip="Fermer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button><button class="l-min" data-tip="Réduire"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button><button class="l-max" data-tip="Restaurer (double-clic sur le titre)"><svg viewBox="0 0 24 24"><path d="M17 7 7 17M15 17H7V9"/></svg></button></div>` : ''}
      <button class="mb-item mb-app" data-m="__app">${merged ? GX.esc(merged.title || app.name) : app ? GX.esc(app.name) : 'Gearbox'}</button>
      ${names.map((n) => `<button class="mb-item" data-m="${n}">${n}</button>`).join('')}
      <div class="mb-tools" id="mbTools"></div>
      <div class="mb-right">${roleBadge}
        <button class="mb-item mb-peri" id="mbPeri" data-tip="Périmètre global : filtre toutes les rubriques"><i class="dot"></i>${GX.esc(GX.ctx.perimetre)}${GX.icon('chevdown', 'sm')}</button>
        <button class="mb-item" id="mbSpot" data-tip="Rechercher (Ctrl K)">${GX.icon('search')}</button>
        <button class="mb-item" id="mbCC" data-tip="Centre de contrôle">${GX.icon('sliders')}</button>
        <button class="mb-item ${unread() ? 'mb-dot' : ''}" id="mbNC" data-tip="Notifications" ${GX.bridge().showSocial ? '' : 'hidden'}>${GX.icon(prefs.dnd ? 'belloff' : 'bell')}</button>
        <button class="mb-item mb-clock" id="mbClock"></button></div>`;
    tick();
    mb.querySelectorAll('[data-m]').forEach((b) => {
      b.addEventListener('click', () => openMb(b, m));
      b.addEventListener('pointerenter', () => { if (mbOpen && mbOpen !== b) openMb(b, m); });
    });
    mb.onpointerdown = mb.ondblclick = null;
    if (merged) {
      $('#mbTools').append(merged.tools);
      mb.querySelector('.mb-lights .l-close').onclick = () => GX.wm.close(merged);
      mb.querySelector('.mb-lights .l-min').onclick = () => GX.wm.minimize(merged);
      mb.querySelector('.mb-lights .l-max').onclick = () => GX.wm.unsnap(merged);
      mb.querySelector('.mb-app').ondblclick = () => GX.wm.unsnap(merged);
      /* Barre du haut fusionnée : l'attraper dans un espace vide détache la fenêtre (comme la barre de titre) */
      mb.onpointerdown = (e) => { if (!e.target.closest('button,input,.mb-item,.mb-lights,#mbTools > *')) GX.wm.startDrag(e, merged, mb); };
      mb.ondblclick = (e) => { if (!e.target.closest('button,input,.mb-item,#mbTools > *')) GX.wm.unsnap(merged); };
    }
    $('#mbPeri').onclick = (e) => perimetreMenu(e.currentTarget);
    $('#mbSpot').onclick = () => S.spotlight();
    $('#mbCC').onclick = () => togglePanel('cc');
    $('#mbNC').onclick = $('#mbClock').onclick = () => togglePanel('nc');
  }
  function openMb(b, m) {
    if (mbOpen === b) { GX.menu.close(); return; }
    GX.root.querySelectorAll('.mb-item.open').forEach((x) => x.classList.remove('open'));
    b.classList.add('open'); mbOpen = b;
    GX.menu.open(m[b.dataset.m] || [], b, { onClose: () => { b.classList.remove('open'); if (mbOpen === b) mbOpen = null; } });
  }
  function perimetreMenu(anchor) {
    if (GX.ctx.site) { S.hud(`Périmètre verrouillé : ${GX.ctx.site} (chef de site)`); return; }
    const set = (p) => { GX.ctx.perimetre = p; buildMenubar(); GX.emit('ctx'); S.hud('Périmètre : ' + p); };
    // Plaques en sous-listes repliables (comme le filtre Périmètre de Gearbox) + recherche : plus de liste à rallonge
    GX.ui.pick(anchor, [
      { items: [{ v: 'Tout le réseau', l: 'Tout le réseau' }] },
      ...Object.entries(D.PLAQUES).map(([pl, sites]) => ({ label: pl, collapsible: true, items: sites.map((s) => ({ v: s, l: s })) })),
      { label: 'Hors plaque', items: D.NISSAN_ONLY.map((s) => ({ v: s, l: s, hint: 'Nissan' })) },
      { label: 'Entités spécifiques', items: [{ v: 'Nissan', l: 'Nissan', hint: 'enveloppe globale' }] },
    ], { multi: false, search: true, title: 'Périmètre', width: 300, selected: [GX.ctx.perimetre || 'Tout le réseau'], onChange: ([v]) => set(v) });
  }
  function tick() { const c = $('#mbClock'); if (c) c.textContent = new Date().toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', ''); }

  /* ======================= Dock ======================= */
  function buildDock() {
    const dock = $('#dock');
    const ids = DOCK.filter((id) => id === '|' || id === 'launchpad' || S.canOpen(id));
    dock.innerHTML = ids.map((id) => id === '|' ? '<span class="sep"></span>' : id === 'launchpad'
      ? `<button class="dk" data-app="launchpad">${GX.appIcon({ id: 'launchpad' }, 50)}<span class="tip glass glass-strong">Launchpad</span></button>`
      : `<button class="dk" data-app="${id}">${GX.appIcon(id, 50)}<span class="run"></span><span class="tip glass glass-strong">${GX.esc(GX.app(id).name)}</span></button>`).join('');
    const items = [...dock.querySelectorAll('.dk')];
    dock.onpointermove = (e) => {
      if (!prefs.dockMag || GX.eco()) return; dock.classList.add('live');
      for (const it of items) { const r = it.getBoundingClientRect(); const d = Math.abs(e.clientX - (r.left + r.width / 2)); const k = Math.max(0, 1 - d / 160); it.style.setProperty('--m', (1 + .6 * Math.sin((k * Math.PI) / 2) ** 2).toFixed(3)); }
    };
    dock.onpointerleave = () => { dock.classList.remove('live'); items.forEach((it) => it.style.setProperty('--m', 1)); };
    dock.onclick = (e) => {
      const it = e.target.closest('.dk'); if (!it) return; const id = it.dataset.app;
      if (id === 'launchpad') return S.launchpad();
      const ws = GX.wm.list().filter((w) => (w.app.parent || w.appId) === id);
      if (!ws.length) return GX.wm.open(id, {}, { origin: it.querySelector('.app-ico') });
      const act = GX.wm.active();
      if (act && ws.includes(act) && ws.length === 1) return GX.wm.minimize(act); // clic sur l'app active = réduire (Windows)
      const vis = ws.filter((w) => !w.min); if (!vis.length) return ws.forEach((w) => GX.wm.restore(w));
      if (vis.length > 1 && act && ws.includes(act)) return GX.wm.mission(true, { app: id });
      GX.wm.focus(vis[0]);
    };
    dock.oncontextmenu = (e) => {
      const it = e.target.closest('.dk'); if (!it) return; e.preventDefault(); const id = it.dataset.app; if (id === 'launchpad') return;
      const ws = GX.wm.list().filter((w) => (w.app.parent || w.appId) === id);
      dock.classList.add('menu-open');
      const m = GX.menu.open([
        ...(ws.length ? [{ header: 'Fenêtres' }, ...ws.map((w) => ({ label: w.title + (w.min ? ' (réduite)' : ''), checked: w === GX.wm.active(), action: () => GX.wm.restore(w) })), '-'] : []),
        { label: ws.length ? 'Afficher toutes les fenêtres' : 'Ouvrir', icon: ws.length ? 'expose' : 'arrowr', action: () => (ws.length ? GX.wm.mission(true, { app: id }) : GX.wm.open(id)) },
        ...(ws.length ? [{ label: 'Tout réduire', icon: 'minus', action: () => ws.forEach((w) => GX.wm.minimize(w)) }, '-', { label: 'Quitter', icon: 'close', action: () => ws.forEach((w) => GX.wm.close(w)) }] : []),
      ], { x: e.clientX - 60, y: 0 }, { onClose: () => dock.classList.remove('menu-open') });
      m.style.top = it.getBoundingClientRect().top - m.offsetHeight - 14 + 'px';
    };
    $('#dockHot').onpointerenter = () => { dockPeek = true; applyDock(); };
    $('#dockWrap').onpointerleave = () => { dockPeek = false; setTimeout(applyDock, 250); };
    $('#dockWrap').onpointerenter = () => { dockPeek = true; };
    refreshDock(); applyDock();
  }
  /* Dock intelligent : il s'efface dès qu'une fenêtre ancrée ou agrandie le recouvre
     (les fenêtres gagnent toute la hauteur) et revient au survol du bord bas. */
  const dockH = () => (parseFloat(getComputedStyle(GX.host).getPropertyValue('--dock-icon')) || 50) + 26;
  let dockPeek = false;
  function applyDock() {
    if (!$('#dockWrap')) return;
    const covered = prefs.dockSmart && GX.wm.visible().some((w) => w.state !== 'normal' || w.rect.y + w.rect.h > innerHeight - dockH());
    const hide = !dockPeek && (prefs.dockAutohide || GX.host.classList.contains('fs-mode') || covered);
    $('#dockWrap').classList.toggle('hidden', hide);
  }
  S.applyDock = applyDock;
  S.dockReserve = () => (prefs.dockAutohide || prefs.dockSmart || GX.host.classList.contains('fs-mode') ? 0 : dockH());
  function refreshDock() {
    if (!$('#dock')) return;
    const run = new Set(GX.wm.list().map((w) => w.app.parent || w.appId));
    GX.root.querySelectorAll('#dock .dk').forEach((it) => {
      const id = it.dataset.app; it.classList.toggle('running', run.has(id));
      const n = GX.app(id)?.badge?.() || 0, t = n > 99 ? '99+' : String(n); let c = it.querySelector('.count');
      if (n && !c) { it.insertAdjacentHTML('beforeend', `<span class="count">${t}</span>`); } else if (n && c) { if (c.textContent != t) { c.textContent = t; GX.animate(c, [{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { spring: 'bouncy' }); } } else if (!n && c) c.remove();
    });
    refreshDockPresence();
  }
  /* [GEARBOX] Présence (08/10/2026) : qui est sur quelle rubrique, en mini-avatars sous l'icône, comme les bulles
     de la barre latérale de l'ancienne interface. Les rubriques absentes du Dock se regroupent sur le Launchpad. */
  function refreshDockPresence() {
    if (!$('#dock')) return;
    const P = D.PRESENCE || {}, items = [...GX.root.querySelectorAll('#dock .dk')];
    const inDock = new Set(items.map((it) => it.dataset.app));
    const rest = [...new Set(Object.keys(P).filter((a) => !inDock.has(a)).flatMap((a) => P[a]))];
    items.forEach((it) => {
      const id = it.dataset.app, uids = id === 'launchpad' ? rest : P[id] || [], key = GX.r.presKey(uids);
      let el = it.querySelector('.gx-pres');
      if ((el?.dataset.k || '') === key) return;
      el?.remove();
      if (uids.length) { it.insertAdjacentHTML('beforeend', GX.r.presStack(uids)); it.querySelector('.gx-pres').dataset.k = key; }
    });
  }
  S.refreshDock = refreshDock;
  S.dockRect = (id) => { const it = GX.root.querySelector(`#dock .dk[data-app="${id}"] .app-ico`); if (!it || $('#dockWrap').classList.contains('hidden')) return null; return it.getBoundingClientRect(); };
  S.bounce = (id) => { const it = GX.root.querySelector(`#dock .dk[data-app="${id}"]`); if (!it || GX.eco()) return; it.classList.remove('bounce'); void it.offsetWidth; it.classList.add('bounce'); setTimeout(() => it.classList.remove('bounce'), 820); };
  S.chrome = (show) => { $('#menubar').classList.toggle('hidden', !show); applyDock(); };

  /* Barre du haut escamotable : elle apparaît quand la souris touche le bord haut, et reste tant
     qu'un de ses menus, le centre de contrôle ou les notifications sont ouverts. */
  function initMenubarAuto() {
    const mb = $('#menubar'); let hideT = null;
    const busy = () => mbOpen || $('#cc').classList.contains('on') || $('#nc').classList.contains('on') || !!GX.root.querySelector('.menu');
    const show = () => { clearTimeout(hideT); hideT = null; mb.classList.add('peek'); };
    const hide = () => { if (hideT) return; hideT = setTimeout(function h() { if (busy()) { hideT = setTimeout(h, 400); return; } hideT = null; mb.classList.remove('peek'); }, 380); };
    GX.win(window, 'pointermove', (e) => {
      if (!prefs.menubarAuto) return;
      if (e.clientY <= 3) show();
      else if (mb.classList.contains('peek')) { if (e.clientY > mb.offsetHeight + 28) hide(); else { clearTimeout(hideT); hideT = null; } }
    }, { passive: true });
    GX.host.addEventListener('pointerleave', (e) => { if (prefs.menubarAuto && e.clientY <= 0) show(); });
    S.peekMenubar = show;
  }

  /* ======================= Launchpad ======================= */
  function buildLaunchpad() {
    const lp = $('#launchpad'), grid = lp.querySelector('.lp-grid'), q = lp.querySelector('input');
    const render = () => {
      const t = q.value.trim().toLowerCase();
      grid.innerHTML = [...GX.apps.values()].filter((a) => !a.hidden && !a.system && S.canOpen(a.id) && (!t || a.name.toLowerCase().includes(t))).map((a, i) =>
        `<button class="lp-app" data-app="${a.id}" style="animation:ui-pop var(--t-med) var(--spring-bouncy) both;animation-delay:${i * 14}ms">${GX.appIcon(a, 76)}<span>${GX.esc(a.name)}</span></button>`).join('');
    };
    S.launchpad = (on = !lp.classList.contains('on')) => { if (on) { q.value = ''; render(); } lp.classList.toggle('on', on); if (on) setTimeout(() => q.focus(), 50); };
    q.oninput = render;
    lp.onclick = (e) => { const b = e.target.closest('.lp-app'); if (b) { const ico = b.querySelector('.app-ico').getBoundingClientRect(); S.launchpad(false); GX.wm.open(b.dataset.app, {}, { origin: ico }); } else if (!e.target.closest('.lp-search')) S.launchpad(false); };
    lp.onkeydown = (e) => { if (e.key === 'Escape') S.launchpad(false); if (e.key === 'Enter') lp.querySelector('.lp-app:not(.locked)')?.click(); };
  }

  /* ======================= Spotlight ======================= */
  const ACTIONS = [
    { k: 'new-project', l: 'Nouveau projet', icon: 'plus', app: 'projects' }, { k: 'new-post', l: 'Nouvelle publication', icon: 'plus', app: 'digital' },
    { k: 'conge', l: 'Poser une période de congés', icon: 'conges', app: 'conges' }, { k: 'book', l: 'Réserver du matériel', icon: 'material', app: 'material' },
    { k: 'expense', l: 'Nouvelle dépense', icon: 'fixed', app: 'fixed' }, { k: 'mission', l: 'Mission Control', icon: 'expose' }, { k: 'desktop', l: 'Afficher le bureau', icon: 'desktop' },
    { k: 'theme', l: 'Basculer le thème clair / sombre', icon: 'contrast' }, { k: 'eco', l: 'Basculer les effets économes', icon: 'leaf' }, { k: 'lock', l: 'Verrouiller l’écran', icon: 'lock' },
    { k: 'shortcuts', l: 'Raccourcis clavier', icon: 'keyboard' },
  ];
  S.action = (k) => {
    const a = ACTIONS.find((x) => x.k === k);
    if (k === 'mission') return GX.wm.mission(true); if (k === 'desktop') return GX.wm.showDesktop(); if (k === 'theme') return toggleTheme(); if (k === 'eco') return toggleEco();
    if (k === 'shortcuts') return shortcuts();
    if (a?.app && S.canAction(k)) S.openWith(a.app, k);
  };
  function buildSpotlight() {
    const spot = $('#spot'), veil = $('#spotVeil'), q = spot.querySelector('input'), res = spot.querySelector('.sp-res');
    let items = [], sel = 0;
    const render = () => {
      const t = q.value.trim().toLowerCase(), has = (s) => s.toLowerCase().includes(t);
      const apps = [...GX.apps.values()].filter((a) => !a.hidden && !a.system && S.canOpen(a.id) && (!t || has(a.name))).map((a) => ({ g: 'Rubriques', icon: GX.appIcon(a, 24), l: a.name, sub: '', run: () => GX.wm.open(a.id) }));
      const acts = ACTIONS.filter((a) => t && has(a.l) && S.canAction(a.k)).map((a) => ({ g: 'Actions', icon: GX.icon(a.icon), l: a.l, sub: 'Action', run: () => S.action(a.k) }));
      const prj = t && S.canOpen('projects') ? D.PROJECTS.filter((p) => has(p.name + ' ' + p.sites.join(' '))).slice(0, 5).map((p) => ({ g: 'Projets', icon: GX.icon('projects'), l: p.name, sub: p.sites.join(', '), run: () => GX.wm.open('project', { id: p.id, title: p.name }) })) : [];
      const posts = t && S.canOpen('digital') ? D.POSTS.filter((p) => has(p.title)).slice(0, 3).map((p) => ({ g: 'Publications', icon: GX.icon('digital'), l: p.title, sub: GX.fmt.date(p.date), run: () => S.openWith('digital', 'post:' + p.id) })) : [];
      const ppl = t && S.canOpen('chat') ? D.USERS.filter((u) => u.id !== GX.ctx.uid && has(u.name)).slice(0, 3).map((u) => ({ g: 'Personnes', icon: GX.r.av(u.id, 'sm'), l: u.name, sub: D.ROLES[u.role].l, run: () => S.openWith('chat', 'dm:' + u.id) })) : [];
      /* [GEARBOX] mIAouss (P1) : « Demander à mIAouss » pour toute recherche, ou ouvrir le volet. */
      const mia = GX.assistant?.available ? [{ g: 'mIAouss', icon: GX.appGlyph('assistant'), l: t ? `Demander à mIAouss : « ${q.value.trim()} »` : 'Parler à mIAouss', sub: 'Assistant', run: () => GX.assistant.open(t ? q.value.trim() : undefined) }] : [];
      items = [...acts, ...prj, ...apps.slice(0, t ? 5 : 8), ...posts, ...ppl, ...mia]; sel = Math.min(sel, Math.max(0, items.length - 1));
      let g = ''; res.innerHTML = items.length ? items.map((it, i) => (it.g !== g ? `<div class="sp-g label">${(g = it.g)}</div>` : '') + `<div class="sp-r ${i === sel ? 'on' : ''}" data-i="${i}">${it.icon}<span class="ellipsis">${GX.esc(it.l)}</span><span class="sub">${GX.esc(it.sub)}</span></div>`).join('') : `<div class="empty">${GX.icon('search')}Aucun résultat pour « ${GX.esc(q.value)} »</div>`;
    };
    S.spotlight = (on = !spot.classList.contains('on')) => { spot.classList.toggle('on', on); veil.classList.toggle('on', on); if (on) { q.value = ''; sel = 0; render(); setTimeout(() => q.focus(), 30); } else q.blur(); };
    q.oninput = () => { sel = 0; render(); };
    res.onclick = (e) => { const r = e.target.closest('.sp-r'); if (r) { S.spotlight(false); items[+r.dataset.i].run(); } };
    res.onpointermove = (e) => { const r = e.target.closest('.sp-r'); if (r && +r.dataset.i !== sel) { sel = +r.dataset.i; res.querySelectorAll('.sp-r').forEach((x, i) => x.classList.toggle('on', i === sel)); } };
    veil.onclick = () => S.spotlight(false);
    q.onkeydown = (e) => {
      if (e.key === 'Escape') S.spotlight(false);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; render(); res.querySelector('.sp-r.on')?.scrollIntoView({ block: 'nearest' }); e.preventDefault(); }
      if (e.key === 'Enter' && items[sel]) { S.spotlight(false); items[sel].run(); }
    };
  }

  /* ======================= Centre de contrôle ======================= */
  const STATIC_WP = { sunset: 'Coucher de soleil', night: 'Nuit', dawn: 'Aube', volcans: 'Volcans', graphite: 'Graphite', carbone: 'Carbone', grille: 'Grille' };
  const wpName = (w) => GX.wall?.get(w)?.name || STATIC_WP[w] || w;
  function buildCC() {
    const cc = $('#cc');
    const WPS = [...(GX.wall ? GX.wall.ids : []), 'sunset', 'night', 'dawn', 'volcans', 'graphite', 'carbone', 'grille'];
    const render = () => {
      cc.innerHTML = `<div class="cc">
        <div class="cc-tile ${prefs.theme === 'dark' ? 'on' : ''}" data-k="theme"><span class="ic">${GX.icon(prefs.theme === 'dark' ? 'moon' : 'sun')}</span><div><b>Thème</b><span>${prefs.theme === 'dark' ? 'Sombre' : 'Clair'}</span></div></div>
        <div class="cc-tile ${prefs.effects === 'eco' ? 'on' : ''}" data-k="eco"><span class="ic">${GX.icon('leaf')}</span><div><b>Effets économes</b><span>${prefs.effects === 'eco' ? 'Aucun flou' : 'Désactivés'}</span></div></div>
        <div class="cc-tile ${prefs.dnd ? 'on' : ''}" data-k="dnd"><span class="ic">${GX.icon('moon')}</span><div><b>Ne pas déranger</b><span>${prefs.dnd ? 'Bannières coupées' : 'Désactivé'}</span></div></div>
        <div class="cc-tile ${prefs.dockMag ? 'on' : ''}" data-k="mag"><span class="ic">${GX.icon('maximize')}</span><div><b>Agrandissement</b><span>du Dock</span></div></div>
        <div class="cc-tile" data-k="mission"><span class="ic">${GX.icon('expose')}</span><div><b>Mission Control</b><span>F3</span></div></div>
        <div class="cc-tile" data-k="desktop"><span class="ic">${GX.icon('desktop')}</span><div><b>Bureau</b><span>Ctrl Alt D</span></div></div>

        <div class="cc-tile cc-wide" style="display:block;cursor:default"><b style="font-size:12px">Matière</b><div class="seg" style="margin-top:8px;display:flex" data-ccmat>${[['pixel', 'Pixel'], ['liquid', 'Liquid Glass'], ['solid', 'Opaque']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${(prefs.material || 'pixel') === v}" style="flex:1">${l}</button>`).join('')}</div>
          <b style="font-size:12px;display:block;margin-top:10px">Style d’icônes</b><div class="seg" style="margin-top:8px;display:flex" data-ccico>${[['light', 'Claire'], ['dark', 'Sombre'], ['tinted', 'Teintée']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${(prefs.iconStyle || 'light') === v}" style="flex:1">${l}</button>`).join('')}</div></div>
        <div class="cc-tile ${prefs.dockSmart ? 'on' : ''}" data-k="smart"><span class="ic">${GX.icon('sidebar')}</span><div><b>Dock intelligent</b><span>${prefs.dockSmart ? 'S’efface' : 'Toujours visible'}</span></div></div>
        <div class="cc-tile ${prefs.menubarAuto ? 'on' : ''}" data-k="mbauto"><span class="ic">${GX.icon('window')}</span><div><b>Barre du haut</b><span>${prefs.menubarAuto ? 'Escamotable' : 'Toujours visible'}</span></div></div>
        <div class="cc-tile" data-k="widgets"><span class="ic">${GX.icon('grid')}</span><div><b>Widgets</b><span>Personnaliser</span></div></div>
        <div class="cc-tile cc-wide" style="display:block;cursor:default"><b style="font-size:12px">Fond d’écran</b><div class="cc-wps">${WPS.map((w) => `<button class="${prefs.wallpaper === w ? 'on' : ''}" data-wp="${w}" title="${GX.esc(wpName(w))}"><span class="th"><span class="wallpaper wp-${w}"></span></span><span class="nm">${GX.esc(wpName(w))}</span></button>`).join('')}</div></div>
        <div class="cc-tile cc-wide" style="display:block;cursor:default"><b style="font-size:12px">Taille du Dock</b><input type="range" class="range" id="ccDock" min="38" max="64" value="${prefs.dockSize}" /></div></div>`;
    };
    render();
    cc.onclick = (e) => {
      const t = e.target.closest('[data-k]'), wp = e.target.closest('[data-wp]');
      if (wp) { setWallpaper(wp.dataset.wp); render(); return; }
      if (!t) return; const k = t.dataset.k;
      if (k === 'theme') toggleTheme(); if (k === 'eco') toggleEco(); if (k === 'dnd') { prefs.dnd = !prefs.dnd; savePrefs(); buildMenubar(); }
      if (k === 'mag') { prefs.dockMag = !prefs.dockMag; savePrefs(); }
      if (k === 'smart') S.setPref('dockSmart', !prefs.dockSmart);
      if (k === 'mbauto') S.setPref('menubarAuto', !prefs.menubarAuto);
      if (k === 'widgets') { togglePanel(null); GX.widgets?.edit(true); return; } if (k === 'mission') { togglePanel(null); GX.wm.mission(true); } if (k === 'desktop') { togglePanel(null); GX.wm.showDesktop(); }
      render();
    };
    cc.addEventListener('change', (e) => { const g = e.target.closest?.('[data-ccmat],[data-ccico],[data-ccda]'); if (!g || typeof e.detail !== 'string') return; S.setPref(g.matches('[data-ccmat]') ? 'material' : g.matches('[data-ccda]') ? 'da' : 'iconStyle', e.detail); });
    cc.oninput = (e) => { if (e.target.id === 'ccDock') { prefs.dockSize = +e.target.value; GX.host.style.setProperty('--dock-icon', prefs.dockSize + 'px'); savePrefs(); GX.widgets?.render(); for (const w of GX.wm.list()) if (w.state !== 'normal') GX.wm.snap(w, w.zone); } };
    S.renderCC = render;
  }
  function togglePanel(which) {
    const cc = $('#cc'), nc = $('#nc');
    const ccOn = which === 'cc' && !cc.classList.contains('on'), ncOn = which === 'nc' && !nc.classList.contains('on');
    cc.classList.toggle('on', ccOn); nc.classList.toggle('on', ncOn);
    if (ccOn) S.renderCC(); if (ncOn) { renderNC(); setTimeout(() => { session.forEach((n) => (n.unread = false)); GX.bridge().feed.markAllRead(); refreshNotifs(); buildMenubar(); }, 1500); } /* [GEARBOX] lu = même règle que la cloche */
  }
  S.togglePanel = togglePanel;
  GX.win(document, 'pointerdown', (e) => { if (!e.target.closest('#cc,#nc,#mbCC,#mbNC,#mbClock,.menu')) { $('#cc')?.classList.remove('on'); $('#nc')?.classList.remove('on'); } }, true);

  function toggleTheme() {
    /* [GEARBOX] bascule AUSSI le thème de l'appli (ThemeContext), qui fait foi */
    const apply = () => { prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; GX.host.dataset.theme = prefs.theme; savePrefs(); buildMenubar(); GX.bridge().toggleTheme(); };
    if (document.startViewTransition && !GX.eco()) document.startViewTransition(apply).ready.catch(() => {}); else apply();
  }
  function toggleEco() { prefs.effects = prefs.effects === 'eco' ? 'full' : 'eco'; GX.host.dataset.effects = prefs.effects; savePrefs(); S.hud(prefs.effects === 'eco' ? 'Effets économes : aucun flou' : 'Effets complets'); }
  S.toggleTheme = toggleTheme; S.toggleEco = toggleEco;
  function setWallpaper(w, save = true) {
    prefs.wallpaper = w; GX.host.dataset.wallpaper = w; const el = $('#wp');
    if (GX.wall && el) { if (GX.wall.is(w)) { el.className = 'wallpaper wp-anim'; GX.wall.mount(el, w); if (save) savePrefs(); return; } GX.wall.unmount(); }
    if (save && el) { const old = el.cloneNode(); old.className = el.className.replace('wp-anim', 'wp-' + (GX.wall?.status()?.id || 'sunset')); el.after(old); el.className = `wallpaper wp-${w}`; old.style.zIndex = 0; GX.animate(old, [{ opacity: 1 }, { opacity: 0 }], { duration: 600, easing: 'ease' }).onfinish = () => old.remove(); }
    else if (el) el.className = `wallpaper wp-${w}`;
    if (save) savePrefs();
  }
  S.setWallpaper = setWallpaper; S.wallpaperClass = () => 'wp-' + prefs.wallpaper;
  /* Préférences : un seul point d'entrée (Réglages, Centre de contrôle, mobile) */
  S.setPref = (k, v) => {
    prefs[k] = v; savePrefs(); const root = GX.host;
    if (k === 'theme') root.dataset.theme = v;
    if (k === 'effects') root.dataset.effects = v;
    if (k === 'wallpaper') setWallpaper(v);
    if (k === 'dockAutohide') { applyDock(); for (const w of GX.wm.list()) if (w.state === 'snap' || w.state === 'max') GX.wm.snap(w, w.zone); }
    if (k === 'dockSize') { root.style.setProperty('--dock-icon', v + 'px'); GX.widgets?.render(); }
    if (k === 'material') root.dataset.material = v;
    if (k === 'da') { // chaque direction propose son fond d'écran
      const apply = () => { root.dataset.da = v; const wp = { nocturne: 'gargantua', carbone: 'carbone', signal: 'bony' }[v]; if (wp) { prefs.wallpaper = wp; setWallpaper(wp); } };
      if (document.startViewTransition && !GX.eco()) document.startViewTransition(apply).ready.catch(() => {}); else apply();
    }
    if (k === 'iconStyle') { root.dataset.icons = v; buildDock(); buildLaunchpad && GX.root.querySelector('#launchpad.on') && S.launchpad(true); }
    if (k === 'menubarAuto') { root.toggleAttribute('data-mbauto', !!v); if (!v) $('#menubar').classList.remove('peek'); for (const w of GX.wm.list()) if (w.state === 'snap' || w.state === 'max') GX.wm.snap(w, w.zone); buildWidgets(); }
    if (k === 'dockSmart') { applyDock(); for (const w of GX.wm.list()) if (w.state === 'snap' || w.state === 'max') GX.wm.snap(w, w.zone); }
    if (k === 'widgets') buildWidgets();
    buildMenubar(); GX.emit('prefs', prefs);
  };

  /* ======================= Rôles : « Voir comme » ======================= */
  /* [GEARBOX] S.setRole (« Voir comme ») retiré : le rôle est celui du compte connecté. */

  /* ======================= Notifications ======================= */
  /* [GEARBOX] Deux sources : les notifications de la SESSION (S.notify) et le VRAI fil d'activité
     (GX.data.FEED, relu à chaque 'data'). Ouvrir une entrée du fil = même routage que la cloche
     de l'ancienne interface (openActivityEntry). « Tout effacer » masque le fil pour la session. */
  const session = []; let feedHidden = false; const feedSeen = new Set(); let feedPrimed = false;
  const fromFeed = () => (feedHidden || !GX.bridge().showSocial ? [] : D.FEED.map((f) => ({ id: 'feed:' + f.id, app: f.app, title: D.user(f.u).name, body: `${f.a} « ${f.o} »`, at: f.at, unread: f.unread, u: f.u, onClick: () => GX.openActivity(f.raw) })));
  let notifs = [];
  const refreshNotifs = () => { notifs = [...session, ...fromFeed()].sort((x, y) => y.at - x.at); };
  GX.on('data', () => {
    // Bannière pour chaque entrée ARRIVÉE pendant la session (jamais l'historique au chargement)
    const fresh = D.FEED.filter((f) => !feedSeen.has(f.id));
    D.FEED.forEach((f) => feedSeen.add(f.id));
    if (feedPrimed && GX.bridge().showSocial) fresh.forEach((f) => S.notify({ app: f.app, u: f.u, title: D.user(f.u).name, body: `${f.a} « ${f.o} »`, onClick: () => GX.openActivity(f.raw), bannerOnly: true }));
    if (D.ready) feedPrimed = true;
    refreshNotifs(); buildMenubar(); if ($('#nc')?.classList.contains('on')) renderNC();
  });
  const unread = () => notifs.filter((n) => n.unread).length;
  function buildNC() { $('#ncClear').onclick = () => { session.length = 0; feedHidden = true; GX.bridge().feed.markAllRead(); refreshNotifs(); renderNC(); buildMenubar(); }; }
  function renderNC() {
    const list = $('#ncList');
    list.innerHTML = notifs.length ? notifs.map((n, i) => notifHTML(n, i)).join('') : `<div class="empty glass" style="border-radius:16px">${GX.icon('bell')}Aucune notification</div>`;
    list.querySelectorAll('.notif').forEach((el) => (el.onclick = () => { const n = notifs[+el.dataset.i]; togglePanel(null); n.onClick ? n.onClick() : GX.app(n.app) && GX.wm.open(n.app); }));
  }
  const notifHTML = (n, i) => { const a = GX.app(n.app) || GX.app('settings'); return `<div class="notif glass ${n.unread ? 'unread' : ''}" data-i="${i}">${n.u ? GX.r.av(n.u) : GX.appIcon(a, 30)}
    <div style="min-width:0"><div class="n-app">${GX.esc(a.name)}</div><div class="n-t ellipsis">${GX.esc(n.title)}</div><div class="n-b">${GX.esc(n.body)}</div>${n.actions ? `<div class="n-actions">${n.actions.map((x, k) => `<button class="btn sm" data-a="${k}">${GX.esc(x.label)}</button>`).join('')}</div>` : ''}</div><span class="n-time">${GX.fmt.ago(n.at)}</span></div>`; };
  S.notify = (n) => {
    n = { at: Date.now(), unread: true, ...n }; if (!n.bannerOnly) { session.unshift(n); refreshNotifs(); } buildMenubar(); /* [GEARBOX] */
    if (prefs.dnd || n.silent) return;
    const box = $('#banners'), el = document.createElement('div');
    el.innerHTML = notifHTML(n, 0); const b = el.firstElementChild; box.prepend(b);
    while (box.children.length > 3) box.lastElementChild.remove();
    let t = setTimeout(out, 4500), gone = false;
    function out() { if (gone) return; gone = true; clearTimeout(t); b.style.animation = ''; b.classList.add('out'); setTimeout(() => b.remove(), 270); }
    b.onpointerenter = () => clearTimeout(t); b.onpointerleave = () => { if (!gone) t = setTimeout(out, 1800); };
    /* Bouton fermer (au survol) et geste : glisser la bannière vers la droite pour l'écarter */
    const x = document.createElement('button'); x.className = 'n-x'; x.setAttribute('aria-label', 'Fermer'); x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    x.onclick = (e) => { e.stopPropagation(); out(); }; b.append(x);
    b.addEventListener('animationend', () => { if (!gone) b.style.animation = 'none'; }, { once: true });
    let px = null, dx = 0, dragged = false;
    b.onpointerdown = (e) => { if (e.button !== 0 || e.target.closest('button')) return; px = e.clientX; dx = 0; dragged = false; b.setPointerCapture(e.pointerId); b.style.animation = 'none'; b.style.transition = 'none'; };
    b.onpointermove = (e) => { if (px == null) return; dx = e.clientX - px; if (dx < 0) dx /= 4; if (Math.abs(dx) > 4) dragged = true; b.style.transform = `translateX(${dx}px)`; b.style.opacity = String(1 - Math.max(0, dx) / 300); };
    b.onpointerup = b.onpointercancel = () => {
      if (px == null) return; px = null; b.style.transition = 'transform .45s var(--spring-snappy), opacity .25s';
      if (dx > 80) { gone = true; clearTimeout(t); b.style.transition = 'transform .22s ease-in, opacity .22s'; b.style.transform = 'translateX(420px)'; b.style.opacity = '0'; setTimeout(() => b.remove(), 240); }
      else { b.style.transform = ''; b.style.opacity = ''; }
    };
    b.onclick = (e) => { if (dragged) { dragged = false; return; } const a = e.target.closest('[data-a]'); out(); n.unread = false; buildMenubar(); if (a) n.actions[+a.dataset.a].action(); else n.onClick ? n.onClick() : GX.app(n.app) && GX.wm.open(n.app); };
  };
  /* [GEARBOX] scheduleSimulation() retiré (messages et défis fictifs). */

  /* ======================= HUD ======================= */
  S.hud = (text) => { GX.root.querySelectorAll('.space-label').forEach((x) => x.remove()); const h = document.createElement('div'); h.className = 'space-label glass glass-strong'; h.textContent = text; GX.body.append(h); setTimeout(() => h.remove(), 1150); };

  /* ======================= Widgets de bureau ======================= */
  function buildWidgets() {
    const box = $('#widgets'); if (!box) return;
    if (GX.widgets) return GX.widgets.render(box);
    if (!prefs.widgets) { box.innerHTML = ''; return; }
    const act = D.PROJECTS.filter((p) => p.status !== 'Draft');
    /* [GEARBOX] montants : moteur du Dashboard (computeDashboardStats), jamais recalculés ici */
    const planned = D.stats?.totalForecast || 0;
    const spent = D.stats?.totalActual || 0;
    const pct = planned ? Math.round((spent / planned) * 100) : 0; /* [GEARBOX] */
    const late = act.filter(D.projectLate).length;
    const nextPosts = D.POSTS.filter((p) => !p.archived && p.date >= GX.iso(GX.today())).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
    const weekEnd = GX.iso(GX.addDays(GX.today(), 6)), off = new Set(D.CONGES.filter((c) => c.date >= GX.iso(GX.today()) && c.date <= weekEnd).map((c) => c.u));
    const W = [];
    if (S.canOpen('budget')) W.push(`<div class="wdg glass" data-app="budget"><div class="wt">${GX.icon('budget', 'sm')}Budget ${new Date().getFullYear()}</div><div class="row" style="margin-top:auto;gap:12px"><div class="ring" style="--p:${Math.min(100, pct)};--sz:64px;--th:8px"></div><div><div class="wv num" style="font-size:26px">${pct} %</div><div class="faint" style="font-size:11px">${GX.fmt.eurK(spent)} engagés</div></div></div></div>`);
    if (S.canOpen('projects')) W.push(`<div class="wdg accent" data-app="projects"><div class="wt">${GX.icon('alert', 'sm')}En retard</div><div class="wv num">${late}</div><div class="faint" style="font-size:12px">projets à reprendre</div></div>`);
    if (S.canOpen('digital')) W.push(`<div class="wdg glass w2" data-app="digital"><div class="wt">${GX.icon('digital', 'sm')}Prochaines publications</div><div style="margin-top:8px;display:grid;gap:6px">${nextPosts.map((p) => `<div class="row" style="gap:8px;font-size:12px"><b class="num" style="width:48px">${GX.fmt.date(p.date)}</b><span class="ellipsis grow">${GX.esc(p.title)}</span>${GX.r.sStatus(p.status)}</div>`).join('')}</div></div>`);
    if (S.canOpen('conges')) W.push(`<div class="wdg glass" data-app="conges"><div class="wt">${GX.icon('conges', 'sm')}Absents cette semaine</div><div class="av-stack" style="margin-top:auto">${[...off].slice(0, 5).map((u) => GX.r.av(u)).join('')}</div><div class="faint" style="font-size:12px;margin-top:6px">${off.size} collaborateur${off.size > 1 ? 's' : ''}</div></div>`);
    if (S.canOpen('chat')) { const n = D.CONVS.reduce((s, c) => s + c.unread, 0); W.push(`<div class="wdg glass" data-app="chat"><div class="wt">${GX.icon('chat', 'sm')}Chat</div><div class="wv num">${n}</div><div class="faint" style="font-size:12px">messages non lus</div></div>`); }
    box.innerHTML = W.join('');
    box.onclick = (e) => { const w = e.target.closest('.wdg'); if (w) { if (GX.wm.desktopShown()) GX.wm.showDesktop(false); GX.wm.open(w.dataset.app, {}, { origin: w }); } };
  }
  S.buildWidgets = buildWidgets;
  S.widgetsDim = (force) => { const box = $('#widgets'); if (!box) return; const dim = force ?? (!GX.wm.desktopShown() && !!GX.wm.active()); box.classList.toggle('dim', !!dim); };
  GX.on('badges', buildWidgets);

  /* ======================= Clic droit sur le bureau ======================= */
  function initDesktopMenu() {
    $('#desk').addEventListener('contextmenu', (e) => {
      if (e.target.closest('.win')) return; e.preventDefault();
      GX.menu.open([
        { label: 'Modifier le bureau et les widgets…', icon: 'grid', action: () => GX.widgets?.edit(true) },
        { label: 'Nouveau projet', icon: 'plus', action: () => S.action('new-project') }, '-',
        { header: 'Fond d’écran' }, ...(GX.wall ? GX.wall.catalog : []).map((d) => ({ label: d.name + ' ✦', checked: prefs.wallpaper === d.id, action: () => setWallpaper(d.id) })), '-', ...['sunset', 'night', 'dawn', 'volcans', 'graphite', 'carbone', 'grille'].map((w) => ({ label: { sunset: 'Coucher de soleil', night: 'Nuit', dawn: 'Aube', volcans: 'Volcans', graphite: 'Graphite', carbone: 'Carbone', grille: 'Grille' }[w], checked: prefs.wallpaper === w, action: () => setWallpaper(w) })), '-',
        { label: 'Afficher les widgets', checked: prefs.widgets, action: () => { prefs.widgets = !prefs.widgets; savePrefs(); buildWidgets(); } },
        { label: 'Mission Control', icon: 'expose', kbd: 'F3', action: () => GX.wm.mission(true) },
        { label: GX.wm.desktopShown() ? 'Ramener les fenêtres' : 'Afficher le bureau', icon: 'desktop', kbd: 'Ctrl Alt D', action: () => GX.wm.showDesktop() }, '-',
        { label: 'Réglages…', icon: 'settings', action: () => GX.wm.open('settings') },
      ], { x: e.clientX, y: e.clientY });
    });
    $('#desk').addEventListener('click', (e) => { if (e.target.id === 'desk' || e.target.classList.contains('space')) { if (GX.wm.desktopShown()) GX.wm.showDesktop(false); GX.wm.focus(null); } });
  }

  /* ======================= Écran verrouillé ======================= */
  /* [GEARBOX] Écran verrouillé retiré (décision Théo). */

  /* ======================= Raccourcis & à propos ======================= */
  function shortcuts() {
    const K = (s) => s.split(' ').map((k) => `<span class="kbd">${k}</span>`).join('');
    const list = [['Rechercher partout', 'Ctrl K'], ['Launchpad', 'F4'], ['Mission Control', 'F3'], ['Changer d’app', 'Alt ²'], ['Ancrer à gauche / droite', 'Ctrl ⇧ ← →'], ['Agrandir / quart haut', 'Ctrl ⇧ ↑'],
      ['Restaurer / quart bas / réduire', 'Ctrl ⇧ ↓'], ['Plein écran', 'Ctrl Alt F'], ['Réduire', 'Ctrl Alt M'], ['Fermer la fenêtre', 'Ctrl Alt W'], ['Toujours au premier plan', 'Ctrl Alt T'], ['Afficher le bureau', 'Ctrl Alt D'],
      ['Aller au bureau 1…4', 'Ctrl Alt 1'], ['Envoyer la fenêtre au bureau', 'Ctrl Alt ⇧ 1'], ['Fenêtre suivante / précédente', 'Swipe 2 doigts sur une fenêtre'], ['Changer de bureau', 'Swipe 2 doigts sur le fond'], ['Aperçu rapide (listes)', 'Espace'], ['Verrouiller', 'Ctrl Alt L'], ['Cette aide', 'Ctrl /']];
    const el = document.createElement('div'); el.className = 'shortcuts glass glass-strong';
    el.innerHTML = `<div class="row"><h3 style="font-size:18px">Raccourcis clavier</h3><button class="icon-btn" style="margin-left:auto">${GX.icon('close')}</button></div>
      <div class="muted" style="margin-top:4px">Gestes aussi : glisser une fenêtre sur un bord ou un coin pour l’ancrer, en haut au centre pour les dispositions, la secouer pour réduire les autres. Coin bas-gauche : Mission Control. Coin bas-droit : Aero Peek.</div>
      <div class="sc-grid">${list.map(([l, k]) => `<div class="sc"><span>${l}</span><span>${K(k)}</span></div>`).join('')}</div>`;
    GX.body.append(el);
    const close = () => { el.remove(); GX.unwin(window, 'keydown', kd, true); };
    const kd = (e) => { if (e.key === 'Escape') close(); };
    el.querySelector('.icon-btn').onclick = close; GX.win(window, 'keydown', kd, true);
    setTimeout(() => GX.win(window, 'pointerdown', function h(e) { if (!el.contains(e.target)) { close(); GX.unwin(window, 'pointerdown', h, true); } }, true));
  }
  S.shortcuts = shortcuts;
  function about() {
    const w = GX.wm.open('about'); if (w) return;
  }

  /* ======================= Aperçu rapide (Quick Look) ======================= */
  S.quickLook = ({ title, html, origin }) => {
    GX.root.querySelector('.ql')?.remove();
    const el = document.createElement('div'); el.className = 'ql glass glass-strong';
    el.innerHTML = `<div class="ql-bar">${GX.icon('quicklook')}<span class="ellipsis grow">${GX.esc(title)}</span><button class="icon-btn sm">${GX.icon('close', 'sm')}</button></div><div class="ql-body">${html}</div>`;
    GX.body.append(el);
    const r = origin?.getBoundingClientRect?.() || origin; const b = el.getBoundingClientRect();
    if (r) GX.animate(el, [{ transform: `translate(${r.left - b.left - b.width / 2}px, ${r.top - b.top - b.height / 2}px) scale(${r.width / b.width}, ${r.height / b.height})`, opacity: .4 }, { transform: 'translate(-50%,-50%)', opacity: 1 }], { spring: 'snappy' });
    let closed = false; /* [GEARBOX] pas d'écouteur orphelin si on ferme avant le tic */
    const close = () => { closed = true; GX.unwin(window, 'keydown', kd, true); GX.animate(el, [{ opacity: 1, transform: 'translate(-50%,-50%)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.94)' }], { duration: 140, fill: 'forwards' }).onfinish = () => el.remove(); };
    const kd = (e) => { if (e.key === 'Escape' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); close(); } };
    el.querySelector('.icon-btn').onclick = close; setTimeout(() => { if (!closed) GX.win(window, 'keydown', kd, true); }, 10);
    return { close };
  };

  /* ======================= Clavier global ======================= */
  function initKeys() {
    GX.win(window, 'keydown', (e) => {
      const inField = e.target.closest?.('input,textarea,select,[contenteditable]');
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); S.spotlight(); return; }
      if (e.key === 'F4') { e.preventDefault(); S.launchpad(); return; }
      if ((e.ctrlKey && e.key === '/') || (e.key === '?' && !inField)) { e.preventDefault(); shortcuts(); return; }
      if (e.key === 'Escape') { if ($('#launchpad').classList.contains('on')) S.launchpad(false); togglePanel(null); }
    });
  }
})();

}
