// @ts-nocheck — moteur de la coque (même convention que les autres modules de ui2/os/engine).
import { setFitCover } from '../viewport';

export function install(): void {
const GX = (window as any).GX; // lu au démarrage (le noyau l'a créé), pas à l'import
/* =====================================================================
   GEARBOX OS — coque TÉLÉPHONE, refonte du 07/10/2026 (proposition C validée par Théo,
   maquettes/ux/mobile-nav.html). Moins « OS », plus application :
   - le téléphone garde SA barre d'état et SA barre gestuelle : plus de fausse barre d'état, plus de
     barre d'accueil maison (elles faisaient doublon), plus de sélecteur d'apps ni de centres tirés du haut ;
   - PILULE flottante : Accueil · 3 favoris (Projets, To-do, Chat par défaut, modifiables) · loupe.
     Elle s'efface quand on fait défiler vers le bas, revient vers le haut, et se retire sous le clavier
     et sous les volets. Son emplacement est RÉSERVÉ en bas des écrans (rien n'est jamais caché dessous) ;
   - LOUPE = sélecteur universel : rubriques, actions rapides, récents, recherche (projets, personnes) ;
   - RETOUR du téléphone (Android, glisser du navigateur) : ferme dans l'ordre menu, volet, page interne,
     écran empilé, rubrique. Une seule entrée d'historique au-dessus de l'accueil, recréée tant qu'il reste
     quelque chose d'ouvert : on ne quitte jamais Gearbox par erreur ;
   - ACCUEIL : salutation, cloche (notifications), avatar (thème, réglages…), widgets PERSONNALISABLES
     (disposition propre au téléphone, W.m dans widgets.ts), puis toutes les rubriques en grille.
   Les rubriques sont les MÊMES qu'au bureau : elles s'adaptent seules à la largeur.
   ===================================================================== */
(() => {
  const M = (GX.mobile = {});
  const D = GX.data, $ = (s, r = GX.root) => r.querySelector(s);
  let root, home, pill;
  let open = [], current = null;          // open : écrans vivants ; current : écran visible (null = accueil)
  let editing = false;                    // accueil en mode édition
  const overlays = [];                    // couches ouvertes (loupe, notifications, catalogue, menu de l'avatar) : { el, close }
  const QUICK = { projects: ['new-project', 'Nouveau projet'], digital: ['new-post', 'Nouvelle publication'], conges: ['conge', 'Poser une période'], material: ['book', 'Réserver du matériel'], fixed: ['expense', 'Nouvelle dépense'] };
  const FAV_DEFAULT = ['projects', 'todo', 'chat'];
  const FAV_FILL = ['dashboard', 'agenda', 'digital', 'hello', 'chat', 'projects', 'todo', 'budget'];
  const HOME_SVG = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>';
  const esc = (s) => GX.esc(String(s ?? ''));

  M.init = () => {
    const prefs = GX.shell.prefs;
    if (prefs.material === 'apple') prefs.material = 'liquid';
    if (['prisme', 'terminal', 'glitch'].includes(prefs.wallpaper)) prefs.wallpaper = 'bony'; /* [GEARBOX] identifiants d'essai du 30/09/2026 → définitifs */ prefs.wallpaper = ({ 'bony-a': 'bony', 'bony-b': 'bony-trame', 'bony-c': 'bony-traces' } as any)[prefs.wallpaper] || prefs.wallpaper;
    const R0 = GX.host; R0.dataset.theme = prefs.theme; R0.dataset.effects = prefs.effects; R0.dataset.material = prefs.material || 'pixel'; R0.dataset.icons = prefs.iconStyle || 'light'; R0.dataset.wallpaper = prefs.wallpaper; R0.dataset.da = 'signal';
    setFitCover(true);
    GX.body.insertAdjacentHTML('beforeend', `<div class="m-root" id="mroot">
      <div class="wallpaper wp-${prefs.wallpaper}" id="wp"></div>
      <div class="m-home" id="mhome"></div>
      <nav class="m-pill glass glass-strong" id="mpill" aria-label="Navigation"></nav>
      <div class="m-banners" id="mban"></div></div>`);
    root = $('#mroot'); home = $('#mhome'); pill = $('#mpill');
    if (GX.wall?.is(prefs.wallpaper)) { const wp = $('#wp'); wp.className = 'wallpaper wp-anim'; GX.wall.mount(wp, prefs.wallpaper); }
    setTimeout(() => GX.wall?.previews(), 1500);
    installShims(); buildHome(); buildPill(); wireHome(); wirePill(); wireHistory();
    /* Teinte du fond : textes de l'accueil clairs sur fond sombre (thème sombre, ou fond animé, sombre partout). */
    const tone = () => root.classList.toggle('on-dark', GX.host.dataset.theme !== 'light' || !!GX.wall?.is(GX.shell.prefs.wallpaper));
    tone(); GX.on('prefs', tone);
    new MutationObserver(tone).observe(GX.host, { attributes: true, attributeFilter: ['data-theme', 'data-wallpaper'] });
    GX.on('badges', refreshBadges);
    /* [GEARBOX] les VRAIES données arrivent après le démarrage : l'accueil suit leurs changements et le rôle. */
    GX.on('data:projects', () => buildHome()); GX.on('data:users', () => buildHome());
    GX.on('ctx', () => { buildHome(); buildPill(); });
    GX.on('widgets:saved', () => buildHome());
    setInterval(() => { if (!current && home.querySelector('.wclock')) buildHome(); }, 60000);
    const direct = new URLSearchParams(location.search).get('app');
    if (direct && GX.app(direct)) setTimeout(() => M.open(direct), 200);
  };

  /* ---------------- Adaptateurs : les apps parlent au bureau, on répond en téléphone ---------------- */
  function installShims() {
    GX.wm = {
      open: (id, params = {}, opts = {}) => M.open(id, params, opts.origin),
      active: () => current, list: () => open, visible: () => (current ? [current] : []),
      close: (w) => M.close(w), focus: (w) => M.show(w), minimize: () => M.home(), restore: (w) => M.show(w),
      unsnap: () => {}, snap: () => {}, toggleMax: () => {}, cur: () => 0, spaces: () => [{}], mission: () => M.home(), desktopShown: () => !current,
      /* showDesktop(false) = « quitter le bureau » (les widgets l'appellent avant d'ouvrir une rubrique) : rien à faire ici.
         L'appeler « accueil » masquait 190 ms plus tard la rubrique qu'on venait d'ouvrir (retour de Théo, 07/10). */
      showDesktop: (on) => { if (on !== false) M.home(); },
    };
    GX.shell.notify = notify;
    GX.shell.dockRect = () => null; GX.shell.bounce = () => {}; GX.shell.refreshDock = refreshBadges;
    /* Menus des rubriques : sans les entrées propres à l'ordinateur (fenêtres, aperçu rapide à la barre d'espace)
       ni les raccourcis clavier. Séparateurs et titres orphelins retirés. */
    const open0 = GX.menu.open;
    GX.menu.open = (items, at, o) => open0.call(GX.menu, cleanMenu(items), at, o);
  }
  const DESK_ONLY = /^(Ouvrir dans une nouvelle fenêtre|Aperçu rapide|Masquer |Réduire|Plein écran|Mosaïque)/;
  function cleanMenu(items) {
    const out = [];
    for (const it of items || []) {
      if (it && typeof it === 'object' && !it.header && DESK_ONLY.test(it.label || '')) continue;
      out.push(it && typeof it === 'object' && it.kbd ? { ...it, kbd: undefined } : it);
    }
    // séparateurs en tête / en queue / doublés, titres sans entrée
    const res = [];
    out.forEach((it, i) => {
      if (it === '-') { if (!res.length || res[res.length - 1] === '-') return; res.push(it); return; }
      if (it?.header) { const next = out.slice(i + 1).find((x) => x !== '-'); if (!next || next.header) return; }
      res.push(it);
    });
    while (res.length && (res[res.length - 1] === '-' || res[res.length - 1]?.header)) res.pop();
    return res;
  }

  /* ---------------- Favoris de la pilule ---------------- */
  const appsAllowed = () => [...GX.apps.values()].filter((a) => !a.hidden && !a.system && GX.shell.canOpen(a.id));
  function favorites() {
    const saved = GX.store.get('m-fav');
    const want = Array.isArray(saved) ? saved : FAV_DEFAULT;
    const ok = want.filter((id) => GX.app(id) && GX.shell.canOpen(id)).slice(0, 3);
    // Rôle sans l'un des favoris par défaut (External, chef de site…) : on complète, sans écrire la préférence.
    if (!Array.isArray(saved)) for (const id of FAV_FILL) { if (ok.length >= 3) break; if (!ok.includes(id) && GX.app(id) && GX.shell.canOpen(id)) ok.push(id); }
    return ok;
  }
  const badgeOf = (id) => { const b = GX.bridge(); return id === 'chat' ? b.chatUnread || 0 : id === 'games' ? b.gamesChallenges || 0 : 0; };
  const badgeTxt = (n) => (n > 99 ? '99+' : String(n));

  /* ---------------- Accueil ---------------- */
  let pendingHome = false;
  function buildHome() {
    if (!home) return;
    // Jamais sous les doigts : un champ de l'accueil a le focus (Chat interactif, note) → on reconstruit à sa sortie.
    const ae = GX.root.activeElement;
    if (ae && home.contains(ae) && ae.matches('input,textarea,[contenteditable]')) { pendingHome = true; return; }
    pendingHome = false;
    const sc = home.querySelector('.m-scroll'), top = sc ? sc.scrollTop : 0;
    const first = esc((GX.bridge().user.name || '').split(' ')[0]);
    const apps = appsAllowed();
    home.innerHTML = `<div class="m-scroll" id="mscroll">
      <header class="m-hhead">
        <div class="m-greet"><div class="label">${esc(GX.fmt.dateLong(new Date()))}</div><h1>${editing ? 'Modifier l’accueil' : `Bonjour ${first}`}</h1></div>
        ${editing ? '<button class="btn primary m-done" data-done>OK</button>'
          : `<button class="m-hbtn" data-notif aria-label="Notifications">${GX.icon('bell')}<i class="ndot ${unreadFeed() ? '' : 'hide'}" id="mDot"></i></button><button class="m-me" data-me aria-label="Mon compte">${GX.r.av(GX.ctx.uid)}</button>`}
      </header>
      ${GX.shell.prefs.widgets === false && !editing ? '' : `<div class="m-widgets ${editing ? 'editing' : ''}" id="mwidgets">${widgetsHTML()}</div>`}
      ${editing ? editExtrasHTML() : `<button class="m-editbtn glass" data-edit>${GX.icon('edit', 'sm')}Modifier l’accueil</button>
        <div class="m-sec">Rubriques</div><div class="m-grid">${apps.map(icoHTML).join('')}</div>`}
    </div>`;
    const sc2 = home.querySelector('.m-scroll'); if (sc2 && top) sc2.scrollTop = top;
    if (GX.widgets) GX.widgets.wirePlay(home);
    refreshBadges();
  }
  const icoHTML = (a) => `<button class="m-ico" data-app="${a.id}">${GX.appIcon(a, 60)}<span class="nm">${esc(a.name)}</span></button>`;
  function widgetsHTML() {
    const W = GX.widgets; if (!W) return '';
    const items = W.m.items();
    if (!items.length) return `<div class="m-wempty">${editing ? 'Aucun widget : ajoutez-en un ci-dessous.' : 'Aucun widget sur l’accueil.'}</div>`;
    return items.map((w, i) => {
      const tier = W.m.tierOf(w.size), tiers = W.m.tiers(w.type);
      const ctl = editing ? `<div class="m-wshield"></div><button class="m-wx" data-wrm aria-label="Retirer">${GX.icon('minus', 'sm')}</button>
        <div class="m-wctl">${tiers.length > 1 ? `<button data-wsz>${esc(W.m.TIER_L[tier])} ⇄</button>` : `<span>${esc(W.m.TIER_L[tier])}</span>`}${W.m.configurable(w.type) ? `<button data-wcfg aria-label="Configurer">${GX.icon('sliders', 'sm')}</button>` : ''}<i></i><button data-wup aria-label="Monter" ${i === 0 ? 'disabled' : ''}>↑</button><button data-wdn aria-label="Descendre" ${i === items.length - 1 ? 'disabled' : ''}>↓</button></div>` : '';
      return `<div class="m-wdg wdg ${W.kind(w)} mt-${tier}" data-id="${w.id}" data-app="${W.app(w) || ''}">${W.inner(w)}${ctl}</div>`;
    }).join('');
  }
  function editExtrasHTML() {
    const favs = favorites();
    return `<button class="m-editbtn glass" data-wadd>${GX.icon('plus', 'sm')}Ajouter un widget</button>
      <div class="m-sec">Barre du bas · 3 favoris</div>
      <div class="m-favs">${appsAllowed().map((a) => `<button class="chip" data-fav="${a.id}" aria-pressed="${favs.includes(a.id)}">${esc(a.name)}</button>`).join('')}</div>
      <p class="m-note">Touchez une rubrique pour l’ajouter ou la retirer. Au-delà de trois, la plus ancienne laisse sa place.</p>
      <button class="m-link" data-wreset>Revenir aux widgets par défaut</button>`;
  }
  /* Clics, appui long et saisies de l'accueil : branchés UNE fois sur le conteneur (l'intérieur est redessiné). */
  function wireHome() {
    let eat = 0;
    home.addEventListener('click', (e) => {
      if (Date.now() - eat < 450) { e.stopPropagation(); e.preventDefault(); return; }
      const t = e.target;
      if (t.closest('[data-notif]')) return notifications();
      if (t.closest('[data-me]')) return meMenu(t.closest('[data-me]'));
      if (t.closest('[data-edit]')) return setEdit(true);
      if (t.closest('[data-done]')) return setEdit(false);
      if (t.closest('[data-wadd]')) return catalog();
      if (t.closest('[data-wreset]')) { GX.widgets?.m.reset(); return; }
      const fv = t.closest('[data-fav]'); if (fv) return toggleFav(fv.dataset.fav);
      const ico = t.closest('.m-ico'); if (ico) return M.open(ico.dataset.app, {}, ico.querySelector('.app-ico'));
      const el = t.closest('.m-wdg'); if (!el || !GX.widgets) return;
      const W = GX.widgets.m, id = el.dataset.id;
      if (editing) {
        if (t.closest('[data-wrm]')) return W.remove(id);
        if (t.closest('[data-wup]')) return W.move(id, -1);
        if (t.closest('[data-wdn]')) return W.move(id, 1);
        if (t.closest('[data-wcfg]')) return W.configure(id, t.closest('[data-wcfg]'));
        if (t.closest('[data-wsz]')) { const w = W.items().find((x) => x.id === id); if (!w) return; const ts = W.tiers(w.type), k = ts.findIndex(([tier]) => tier === W.tierOf(w.size)); return W.size(id, ts[(k + 1) % ts.length][1]); }
        return;
      }
      GX.widgets.act(e, el);
    });
    home.addEventListener('change', (e) => GX.widgets?.onChange(e));
    home.addEventListener('input', (e) => GX.widgets?.onInput(e));
    home.addEventListener('focusout', () => setTimeout(() => { if (pendingHome && !home.contains(GX.root.activeElement)) buildHome(); }, 0));
    home.addEventListener('contextmenu', (e) => { if (e.target.closest('.m-wdg,.m-ico')) e.preventDefault(); });
    // Appui long : sur un widget = mode édition ; sur une icône = actions rapides.
    const INTERACTIVE = 'input,textarea,select,button,a[href],label,[contenteditable],[data-wc-zone],[data-play]';
    home.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || editing) return;
      const wdg = e.target.closest('.m-wdg'), ico = e.target.closest('.m-ico');
      if (!(ico || (wdg && !e.target.closest(INTERACTIVE)))) return;
      const sx = e.clientX, sy = e.clientY; let done = false;
      ico?.classList.add('press');
      const tm = setTimeout(() => { done = true; eat = Date.now(); try { navigator.vibrate?.(8); } catch (_) {} ico ? quickActions(ico) : setEdit(true); }, 520);
      const mv = (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) stop(); };
      const stop = () => { clearTimeout(tm); ico?.classList.remove('press'); GX.unwin(window, 'pointermove', mv); GX.unwin(window, 'pointerup', stop); GX.unwin(window, 'pointercancel', stop); if (done) eat = Date.now(); };
      GX.win(window, 'pointermove', mv); GX.win(window, 'pointerup', stop); GX.win(window, 'pointercancel', stop);
    });
  }
  function setEdit(on) {
    if (editing === on) return;
    editing = on; GX.menu.close();
    if (!on) closeOverlay('catalog');
    byScroll = false; buildHome(); applyPill(); hSync();
    if (on) home.querySelector('.m-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function toggleFav(id) {
    let f = favorites();
    f = f.includes(id) ? f.filter((x) => x !== id) : [...f, id].slice(-3);
    GX.store.set('m-fav', f); buildPill(); buildHome();
  }
  function catalog() {
    const W = GX.widgets?.m; if (!W) return;
    const have = new Set(W.items().map((w) => w.type));
    const el = document.createElement('div'); el.className = 'm-csheet';
    el.innerHTML = `<div class="m-veil" data-x></div><div class="m-cpanel glass glass-strong"><div class="grab"></div>
      <div class="row m-chead"><b>Ajouter un widget</b><span class="grow"></span><button class="btn ghost" data-x>Fermer</button></div>
      <div class="m-clist">${W.catalog().map((c) => { const a = c.app && GX.app(c.app); return `<button class="m-ci ${have.has(c.type) ? 'has' : ''}" data-add="${c.type}">${a ? GX.appIcon(a, 34) : `<span class="m-cig">${GX.icon('grid')}</span>`}<span class="m-cit"><b>${esc(c.name)}</b><span>${a ? esc(a.name) + ' · ' : ''}${c.tiers.map(([t]) => W.TIER_L[t]).join(' · ')}</span></span>${have.has(c.type) ? `<span class="m-cok">${GX.icon('check', 'sm')}</span>` : GX.icon('plus', 'sm')}</button>`; }).join('')}</div></div>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) return closeOverlay('catalog');
      const b = e.target.closest('[data-add]'); if (!b) return;
      const w = W.add(b.dataset.add); closeOverlay('catalog');
      if (w) setTimeout(() => home.querySelector(`.m-wdg[data-id="${w.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    });
    pushOverlay('catalog', el);
  }
  function quickActions(b) {
    const id = b.dataset.app, a = GX.app(id), q = QUICK[id];
    pushOverlay('quick', null);   // le retour du téléphone referme le menu au lieu de quitter Gearbox
    GX.menu.open([{ label: 'Ouvrir ' + a.name, icon: 'arrowr', action: () => M.open(id, {}, b.querySelector('.app-ico')) },
      ...(q && GX.shell.canAction(q[0]) /* [GEARBOX] même règle que la rubrique (engine/shell.ts) */ ? [{ label: q[1], icon: 'plus', action: () => runQuick(id, q[0]) }] : []),
      '-', { label: 'Rechercher', icon: 'search', action: spotlight }],
    b, { onClose: () => { b.classList.remove('press'); closeOverlay('quick'); } });
  }
  const runQuick = (id, cmd) => { const w = M.open(id); if (w) setTimeout(() => w.inst?.command?.(cmd), 480); };
  function refreshBadges() {
    GX.root.querySelectorAll('.m-ico').forEach((b) => {
      const n = badgeOf(b.dataset.app); let c = b.querySelector('.count');
      if (n && !c) b.insertAdjacentHTML('beforeend', `<span class="count">${badgeTxt(n)}</span>`); else if (n) c.textContent = badgeTxt(n); else c?.remove();
    });
    pill?.querySelectorAll('[data-go]').forEach((b) => {
      const n = badgeOf(b.dataset.go); let c = b.querySelector('.bdg');
      if (n && !c) b.insertAdjacentHTML('beforeend', `<i class="bdg">${badgeTxt(n)}</i>`); else if (n) c.textContent = badgeTxt(n); else c?.remove();
      b.setAttribute('aria-label', (GX.app(b.dataset.go)?.name || '') + (n ? ` (${n} non lus)` : ''));
    });
    $('#mDot')?.classList.toggle('hide', !unreadFeed());
  }

  /* ---------------- Pilule ---------------- */
  function buildPill() {
    if (!pill) return;
    pill.innerHTML = `<button data-home aria-label="Accueil">${HOME_SVG}</button>${favorites().map((id) => `<button data-go="${id}" aria-label="${esc(GX.app(id).name)}">${GX.icon(id)}</button>`).join('')}<button class="srch" data-spot aria-label="Rechercher">${GX.icon('search')}</button>`;
    markPill(); refreshBadges();
  }
  function markPill() {
    const cur = current ? current.app.parent || current.appId : null;
    pill?.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.hasAttribute('data-home') ? !cur : b.dataset.go === cur));
  }
  /* Masquage : défilement vers le bas, clavier ouvert, volet ou couche ouverte. L'emplacement de la pilule est
     réservé en bas des écrans (--pill-h) : il se libère quand elle s'efface. Après un changement, 350 ms
     d'insensibilité au défilement : le redimensionnement de l'écran ne doit pas la faire clignoter. */
  let byScroll = false, kb = false, hold = 0, quietUntil = 0, userAt = 0;
  /* Écran avec une barre fixe en bas (saisie d'une conversation du Chat) : la pilule la couvrirait → elle se retire. */
  const DOCKED = '.cht-compose';
  const docked = () => !!current && [...current.el.querySelectorAll(DOCKED)].some((e) => e.offsetParent !== null);
  /* La pilule FLOTTE au-dessus du contenu (pas de bande réservée, retour de Théo du 07/10) : chaque zone qui défile
     reçoit en bas la place de la pilule, pour que son dernier élément reste atteignable. */
  function padScroller(t) {
    if (!t || t.dataset.mPad || !t.closest('.m-app')) return;
    const cs = getComputedStyle(t); if (!/(auto|scroll)/.test(cs.overflowY)) return;
    t.dataset.mPad = '1'; t.style.paddingBottom = `calc(${parseFloat(cs.paddingBottom) || 0}px + 80px + var(--sab))`;
  }
  const padScan = (win) => win?.el.querySelectorAll('.scroll, .app-body').forEach((e) => { if (e.scrollHeight > e.clientHeight + 1) padScroller(e); });
  const lastY = new WeakMap();
  function applyPill() {
    const off = byScroll || kb || hold > 0 || overlays.length > 0 || editing || docked();
    if (root.classList.contains('pill-off') === off) return;
    root.classList.toggle('pill-off', off); quietUntil = performance.now() + 350;
  }
  function wirePill() {
    pill.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-home')) return M.home();
      if (b.hasAttribute('data-spot')) return spotlight();
      const id = b.dataset.go;
      if (current && (current.app.parent || current.appId) === id) return toRoot(current);   // rubrique déjà affichée : retour à sa racine
      M.open(id);
    });
    /* Seul un défilement FAIT PAR L'UTILISATEUR (doigt, molette) masque la pilule. */
    const touched = () => { userAt = performance.now(); };
    ['touchmove', 'wheel'].forEach((ev) => root.addEventListener(ev, touched, { capture: true, passive: true }));
    root.addEventListener('pointermove', (e) => { if (e.buttons) touched(); }, { capture: true, passive: true });
    root.addEventListener('scroll', (e) => {
      const t = e.target; if (!(t instanceof Element)) return;
      padScroller(t);
      const y = t.scrollTop, last = lastY.has(t) ? lastY.get(t) : 0; lastY.set(t, y);   // liste jamais vue : on part du haut
      if (performance.now() < quietUntil) return;
      if (performance.now() - userAt > 700) return;                      // défilement par le code (fil du Chat qui descend…) : ignoré
      const d = y - last; if (Math.abs(d) < 6) return;
      if (t.scrollHeight - t.clientHeight < 120) return;                   // presque rien à faire défiler : la pilule reste
      byScroll = d > 0 && y > 40; applyPill();
    }, true);
    /* Après un clic : la page affichée a pu changer (conversation ouverte / refermée, fiche…) → masquage remis à zéro. */
    let sig = '';
    const screenSig = () => (current ? current.key + ':' + current.el.querySelectorAll('.stack > .page').length : 'home');
    root.addEventListener('click', () => setTimeout(() => { const n = screenSig(); if (n !== sig) { sig = n; byScroll = false; } applyPill(); }, 420), true);
    const editable = (el) => !!el && (el.matches?.('textarea,select,[contenteditable="true"]') || (el.matches?.('input') && !/^(checkbox|radio|range|button|submit|color|file)$/.test(el.type)));
    GX.win(document, 'focusin', () => { kb = editable(GX.root.activeElement); applyPill(); });
    GX.win(document, 'focusout', () => setTimeout(() => { kb = editable(GX.root.activeElement); applyPill(); }, 60));
  }
  /* Toucher la rubrique déjà affichée : on revient à sa racine (écrans empilés fermés, page interne dépilée). */
  function toRoot(win) {
    let w = win;
    while (w && w.backTo && open.includes(w.backTo)) { const b = w.backTo; dropWin(w); w = b; }
    if (w !== current) { showNow(w); }
    const backs = [...w.el.querySelectorAll('.stack > .page:not(:first-child) .stack-head .back')];
    backs.reverse().forEach((b) => b.click());
    w.el.querySelectorAll('.scroll, .app-body').forEach((s) => s.scrollTop > 0 && s.scrollTo({ top: 0, behavior: 'smooth' }));
    byScroll = false; applyPill(); hSync();
  }

  /* ---------------- Ouvrir / afficher / fermer ---------------- */
  M.open = (appId, params = {}, origin) => {
    const app = GX.app(appId); if (!app) return;
    if (!GX.shell.canOpen(app.parent || appId)) { GX.shell.hud('Accès restreint pour ce rôle'); return; }
    if (editing) { editing = false; buildHome(); }
    closeOverlays(); GX.menu.close();
    const key = appId + (params.id ? ':' + params.id : '');
    const ex = open.find((w) => w.key === key);
    if (ex) { M.show(ex); return ex; }
    const backTo = current && (app.parent || params.id) ? current : null;
    const nav = !!(backTo || app.parent);                   // fiche (projet…) : barre avec retour ; rubrique : son propre en-tête
    const el = document.createElement('section'); el.className = 'm-app' + (nav ? ' nav' : ' top');
    const backLbl = backTo ? backTo.title || backTo.app.name : app.parent ? GX.app(app.parent)?.name || 'Retour' : '';
    el.innerHTML = nav
      ? `<div class="m-nav"><button class="m-back">${GX.icon('back', 'lg')}<span class="ellipsis">${esc(backLbl)}</span></button><div class="m-title"><span class="ellipsis t"></span></div><button class="icon-btn" data-menu aria-label="Plus d’actions">${GX.icon('more')}</button></div><div class="m-body"></div>`
      : `<button class="icon-btn m-more glass" data-menu aria-label="Plus d’actions">${GX.icon('more')}</button><div class="m-body"></div>`;
    root.insertBefore(el, pill);
    const win = {
      key, appId, app, params, el, body: el.querySelector('.m-body'), backTo, tools: document.createElement('div'),
      setTitle(t, sub = '') { win.title = t; const tt = el.querySelector('.m-title .t'); if (tt) tt.innerHTML = `${esc(t)}${sub ? ` <span class="sub">${esc(sub)}</span>` : ''}`; },
      setTools(html) { win.tools.innerHTML = html; return win.tools; }, close: () => M.close(win), focus: () => M.show(win),
      /* Volets : par le bas ; la pilule se retire tant qu'un volet est ouvert (ses boutons sont en bas). */
      sheet: (html, o = {}) => { hold++; applyPill(); let done = false; return GX.ui.sheet(el, html, { ...o, onClose: (v) => { if (!done) { done = true; hold = Math.max(0, hold - 1); applyPill(); } o.onClose?.(v); } }); },
      open: (id, p, o) => M.open(id, p, o), isCompact: () => true,
    };
    win.setTitle(params.title || app.name);
    open.push(win);
    try { win.inst = app.mount(win.body, win) || {}; } catch (err) { console.error(err); win.body.innerHTML = `<div class="empty">${GX.icon('alert')}Erreur : ${esc(err.message)}</div>`; win.inst = {}; }
    el.querySelector('.m-back')?.addEventListener('click', () => back(win));
    el.querySelector('[data-menu]').onclick = (e) => appMenu(win, e.currentTarget);
    const prev = current; current = win; home.classList.add('away');
    if (backTo) { // écran empilé : glisse depuis la droite, l'écran d'origine recule
      GX.animate(el, [{ transform: 'translateX(100%)' }, { transform: 'none' }], { spring: 'snappy' });
      GX.animate(prev.el, [{ transform: 'none', filter: 'brightness(1)' }, { transform: 'translateX(-25%)', filter: 'brightness(.7)' }], { spring: 'snappy' }).onfinish = () => { if (current !== prev) prev.el.classList.add('hidden'); prev.el.getAnimations().forEach((a) => a.cancel()); };
      edgeBack(win);
    } else { fadeIn(el); if (prev) setTimeout(() => { if (current !== prev) prev.el.classList.add('hidden'); }, 220); }
    remember(app, params);
    afterNav(win);
    return win;
  };
  /* Retour depuis la barre d'une fiche : écran d'origine, sinon la rubrique parente. */
  function back(win) {
    if (win.backTo && open.includes(win.backTo)) return M.close(win);
    const parent = win.app.parent;
    if (parent) { const p = M.open(parent); if (p && p !== win) dropWin(win); return; }
    M.close(win);
  }
  const fadeIn = (el) => GX.animate(el, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' });
  /* Affiche un écran déjà vivant, sans animation de pile. */
  function showNow(win) {
    const prev = current; current = win; home.classList.add('away');
    win.el.classList.remove('hidden'); win.el.style.transform = ''; win.el.style.filter = ''; root.insertBefore(win.el, pill);
    if (prev && prev !== win) prev.el.classList.add('hidden');
  }
  M.show = (win) => {
    if (!win || current === win) { afterNav(win); return; }
    closeOverlays(); GX.menu.close();
    showNow(win); fadeIn(win.el); afterNav(win);
  };
  M.home = () => {
    if (editing) { setEdit(false); }
    closeOverlays(); GX.menu.close();
    if (current) {
      const w = current; current = null;
      GX.animate(w.el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(14px)' }], { duration: 180, easing: 'ease-in' }).onfinish = () => { if (current !== w) w.el.classList.add('hidden'); w.el.getAnimations().forEach((a) => a.cancel()); };
    }
    open.forEach((x) => setTimeout(() => { if (x !== current) x.el.classList.add('hidden'); }, 190));   // relu au moment de masquer
    home.classList.remove('away');
    if (pendingHome) buildHome();
    afterNav(null);
  };
  /* Retire un écran sans animation (déjà quitté). */
  function dropWin(win) {
    try { win.inst?.destroy?.(); } catch (e) {}
    open = open.filter((w) => w !== win); win.el.remove();
    open.forEach((w) => { if (w.backTo === win) w.backTo = null; });
  }
  M.close = (win) => {
    if (!win) return;
    if (win.backTo && current === win && open.includes(win.backTo)) { // retour vers l'écran d'origine
      try { win.inst?.destroy?.(); } catch (e) {}
      open = open.filter((w) => w !== win);
      const b = win.backTo; b.el.classList.remove('hidden'); current = b;
      GX.animate(b.el, [{ transform: 'translateX(-25%)', filter: 'brightness(.7)' }, { transform: 'none', filter: 'brightness(1)' }], { spring: 'snappy' });
      GX.animate(win.el, [{ transform: getComputedStyle(win.el).transform === 'none' ? 'none' : getComputedStyle(win.el).transform }, { transform: 'translateX(100%)' }], { spring: 'snappy', fill: 'forwards' }).onfinish = () => win.el.remove();
      afterNav(b);
      return;
    }
    const wasCurrent = current === win;
    dropWin(win);
    if (wasCurrent) { current = null; home.classList.remove('away'); if (pendingHome) buildHome(); afterNav(null); }
  };
  /* Après chaque navigation : pilule (état, visible), titre de l'onglet du navigateur, historique, rubrique active. */
  function afterNav(win) {
    byScroll = false; markPill(); applyPill(); hSync();
    if (win) setTimeout(() => { padScan(win); applyPill(); }, 400);
    if (win) GX.emit('wm:focus', win);   // même synchronisation que le bureau (onglet actif d'App.tsx, présence)
  }
  function appMenu(win, anchor) {
    const m = win.inst?.menus?.() || {};
    const items = Object.entries(m).flatMap(([k, arr]) => (arr?.length ? [{ header: k.startsWith('__') ? win.app.name : k }, ...arr] : []));
    GX.menu.open([...items, ...(items.length ? ['-'] : []), { label: 'Accueil', icon: 'grid', action: M.home }, { label: 'Fermer ' + win.app.name, icon: 'close', action: () => M.close(win) }], anchor, { align: 'right' });
  }
  /* Glisser depuis le bord gauche d'un écran empilé = retour */
  function edgeBack(win) {
    win.el.addEventListener('pointerdown', (e) => {
      if (e.clientX > 22 || e.pointerType === 'mouse' || current !== win) return;
      const sx = e.clientX; let dx = 0; const b = win.backTo; if (!b || !open.includes(b)) return; b.el.classList.remove('hidden'); b.el.getAnimations().forEach((a) => a.cancel());
      const mv = (ev) => { dx = Math.max(0, ev.clientX - sx); win.el.style.transform = `translateX(${dx}px)`; b.el.style.transform = `translateX(${-25 + (dx / innerWidth) * 25}%)`; };
      const up = () => { GX.unwin(window, 'pointermove', mv); b.el.style.transform = ''; if (dx > innerWidth * .33) { M.close(win); } else { GX.animate(win.el, [{ transform: `translateX(${dx}px)` }, { transform: 'none' }]); win.el.style.transform = ''; b.el.classList.add('hidden'); } };
      GX.win(window, 'pointermove', mv); GX.win(window, 'pointerup', up, { once: true });
    });
  }

  /* ---------------- Retour du téléphone (historique) ----------------
     Invariant : UNE entrée d'historique au-dessus de l'accueil tant que quelque chose est ouvert. Le retour
     système la consomme : on ferme UN niveau, et s'il reste quelque chose d'ouvert on la recrée. Quand tout se
     referme par l'interface, on la retire nous-mêmes (history.back, retour ignoré). */
  let hOn = false, hSkip = 0, hTimer = 0;
  const anyOpen = () => !!current || editing || overlays.length > 0;
  /* Le retrait est DIFFÉRÉ d'un tic : « fermer le menu puis ouvrir une rubrique » se fait dans la même tâche, et
     un history.back() suivi d'un pushState immédiat ramène SOUS l'accueil (Chrome résout le retour à l'appel) —
     le retour suivant quittait alors Gearbox (constaté le 07/10/2026). Si un écran s'ouvre entre-temps, l'entrée reste. */
  function hSync() {
    try {
      if (anyOpen()) { clearTimeout(hTimer); hTimer = 0; if (!hOn) { history.pushState({ gxm: 1 }, ''); hOn = true; } }
      else if (hOn && !hTimer) hTimer = setTimeout(() => { hTimer = 0; if (!anyOpen() && hOn) { hOn = false; hSkip++; history.back(); } }, 0);
    } catch (e) { /* historique indisponible : la navigation reste possible par l'interface */ }
  }
  function wireHistory() {
    window.addEventListener('popstate', () => {
      if (hSkip) { hSkip--; return; }
      clearTimeout(hTimer); hTimer = 0;
      hOn = false; byScroll = false; goBack(); hSync(); setTimeout(applyPill, 420);
    });
  }
  function goBack() {
    if (GX.menu.isOpen()) return GX.menu.close();
    if (overlays.length) return closeOverlay(overlays[overlays.length - 1].id);
    if (editing) return setEdit(false);
    const w = current; if (!w) return;
    const veils = w.el.querySelectorAll('.sheet-veil.on'); if (veils.length) return veils[veils.length - 1].click();
    const stacks = [...w.el.querySelectorAll('.stack')].filter((s) => s.querySelectorAll(':scope > .page').length > 1);
    if (stacks.length) { const pages = stacks[stacks.length - 1].querySelectorAll(':scope > .page'); const b = pages[pages.length - 1].querySelector('.stack-head .back'); if (b) return b.click(); }
    if (w.backTo || w.app.parent) return back(w);
    M.home();
  }

  /* ---------------- Couches (loupe, notifications, catalogue, menu de l'avatar) ---------------- */
  function pushOverlay(id, el, onClose) {
    closeOverlay(id);
    overlays.push({ id, el, onClose }); if (el) { root.append(el); requestAnimationFrame(() => el.classList.add('on')); }
    applyPill(); hSync();
  }
  function closeOverlay(id) {
    const i = overlays.findIndex((o) => o.id === id); if (i < 0) return;
    const [o] = overlays.splice(i, 1);
    if (o.el) { o.el.classList.remove('on'); setTimeout(() => o.el.remove(), 300); }
    o.onClose?.(); applyPill(); hSync();
  }
  const closeOverlays = () => [...overlays].reverse().forEach((o) => closeOverlay(o.id));

  /* Menu de l'avatar : ce que l'ancien centre de contrôle et le menu Gearbox du bureau proposaient. */
  function meMenu(anchor) {
    const P = GX.shell.prefs, me = GX.bridge().user;
    pushOverlay('me', null);
    GX.menu.open([
      { header: me.name || 'Mon compte' },
      { label: P.theme === 'dark' ? 'Thème clair' : 'Thème sombre', icon: P.theme === 'dark' ? 'sun' : 'moon', action: () => GX.shell.toggleTheme() },
      { label: 'Effets économes (sans flou)', icon: 'leaf', checked: P.effects === 'eco', action: () => GX.shell.setPref('effects', P.effects === 'eco' ? 'full' : 'eco') },
      { label: 'Ne pas déranger', icon: 'moon', checked: !!P.dnd, action: () => GX.shell.setPref('dnd', !P.dnd) },
      '-',
      ...(GX.shell.canOpen('settings') ? [{ label: 'Réglages', icon: 'settings', action: () => M.open('settings') }, { label: 'Fond d’écran…', icon: 'wallpaper', action: () => M.open('settings', { title: 'Réglages', tab: 'apparence' }) }, '-'] : []),
      { label: 'Revenir à l’ancienne interface', icon: 'arrowr', action: () => GX.bridge().onExit() },
      { label: 'Se déconnecter', icon: 'power', action: () => GX.bridge().logout() },
    ], anchor, { align: 'right', onClose: () => closeOverlay('me') });
  }

  /* Notifications : le vrai fil d'activité (GX.data.FEED), masqué hors équipe marketing. */
  const feedNotifs = () => (GX.bridge().showSocial ? D.FEED || [] : []).map((f) => ({ app: f.app, u: f.u, title: D.user(f.u).name, body: `${f.a} « ${f.o} »`, at: f.at, unread: f.unread, raw: f.raw }));
  const unreadFeed = () => { try { return (GX.bridge().feed?.unreadCount || 0) > 0 && GX.bridge().showSocial; } catch (e) { return false; } };
  function notifications() {
    const notifs = feedNotifs();
    const el = document.createElement('div'); el.className = 'm-panel';
    el.innerHTML = `<div class="m-phead"><h2>Notifications</h2><button class="icon-btn" data-x aria-label="Fermer">${GX.icon('close')}</button></div>
      <div class="m-pbody">${notifs.length ? notifs.map((n, i) => `<button class="notif glass ${n.unread ? 'unread' : ''}" data-i="${i}">${n.u ? GX.r.av(n.u) : GX.appIcon(n.app, 30)}<div style="min-width:0;text-align:left"><div class="n-app">${esc(GX.app(n.app)?.name || '')}</div><div class="n-t">${esc(n.title)}</div><div class="n-b">${esc(n.body)}</div></div><span class="n-time">${GX.fmt.ago(n.at)}</span></button>`).join('') : `<div class="empty">${GX.icon('bell')}Aucune notification</div>`}</div>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) return closeOverlay('notif');
      const n = e.target.closest('.notif'); if (!n) return;
      const x = notifs[+n.dataset.i]; closeOverlay('notif');
      if (x.raw) GX.openActivity(x.raw); else if (x.app) M.open(x.app);
    });
    pushOverlay('notif', el);
    if (notifs.some((n) => n.unread)) { try { GX.bridge().feed.markAllRead(); } catch (e) {} $('#mDot')?.classList.add('hide'); }
  }

  /* ---------------- Loupe : sélecteur universel ---------------- */
  function remember(app, params) {
    try {
      const it = params.id ? { t: 'w', id: app.id, pid: params.id, title: params.title || app.name } : { t: 'a', id: app.id };
      const k = (x) => x.t + x.id + (x.pid || '');
      const list = (GX.store.get('m-recent') || []).filter((x) => x && k(x) !== k(it));
      GX.store.set('m-recent', [it, ...list].slice(0, 6));
    } catch (e) {}
  }
  function spotlight() {
    const el = document.createElement('div'); el.className = 'm-spot';
    el.innerHTML = `<div class="row m-shead"><label class="search grow">${GX.icon('search')}<input placeholder="Rechercher dans Gearbox" enterkeyhint="search" /></label><button class="btn ghost" data-x>Annuler</button></div><div class="res"></div>`;
    const q = el.querySelector('input'), res = el.querySelector('.res');
    let items = [];
    const row = (x, i) => `<button class="sp-r" data-i="${i}">${x.i}<span class="ellipsis">${esc(x.l)}</span><span class="sub">${esc(x.s || '')}</span></button>`;
    const render = () => {
      const t = q.value.trim().toLowerCase(), has = (x) => String(x || '').toLowerCase().includes(t);
      items = [];
      if (!t) {
        const apps = appsAllowed();
        const quick = Object.entries(QUICK).filter(([id, [cmd]]) => GX.shell.canOpen(id) && GX.shell.canAction(cmd)).map(([id, [cmd, l]]) => ({ i: `<span class="sp-plus">${GX.icon('plus')}</span>`, l, s: GX.app(id)?.name, run: () => runQuick(id, cmd) }));
        const rec = (GX.store.get('m-recent') || []).filter((x) => x && GX.app(x.id) && GX.shell.canOpen(GX.app(x.id).parent || x.id)).map((x) => (x.t === 'w'
          ? { i: GX.appIcon(GX.app(GX.app(x.id).parent || x.id), 34), l: x.title, s: GX.app(x.id).name, run: () => M.open(x.id, { id: x.pid, title: x.title }) }
          : { i: GX.appIcon(GX.app(x.id), 34), l: GX.app(x.id).name, s: 'Rubrique', run: () => M.open(x.id) }));
        let h = `<div class="m-sh">Rubriques</div><div class="m-grid sp-grid">${apps.map(icoHTML).join('')}</div>`;
        if (quick.length) { h += `<div class="m-sh">Actions rapides</div>`; quick.forEach((x) => { h += row(x, items.length); items.push(x); }); }
        if (rec.length) { h += `<div class="m-sh">Récents</div>`; rec.forEach((x) => { h += row(x, items.length); items.push(x); }); }
        res.innerHTML = h;
      } else {
        const apps = appsAllowed().filter((a) => has(a.name)).slice(0, 6).map((a) => ({ i: GX.appIcon(a, 34), l: a.name, s: 'Rubrique', run: () => M.open(a.id) }));
        const pr = GX.shell.canOpen('projects') ? D.PROJECTS.filter((p) => has(p.name)).slice(0, 6).map((p) => ({ i: GX.appIcon(GX.app('projects'), 34), l: p.name, s: p.sites?.[0] || 'Projet', run: () => M.open('project', { id: p.id, title: p.name }) })) : [];
        const pp = GX.shell.canOpen('chat') ? D.USERS.filter((u) => u.id !== GX.ctx.uid && has(u.name)).slice(0, 4).map((u) => ({ i: GX.r.av(u.id), l: u.name, s: 'Message', run: () => { const w = M.open('chat'); setTimeout(() => w?.inst?.command?.('dm:' + u.id), 450); } })) : [];
        items = [...apps, ...pr, ...pp];
        res.innerHTML = items.map(row).join('') || `<div class="empty">${GX.icon('search')}Aucun résultat</div>`;
      }
    };
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) return closeOverlay('spot');
      const ico = e.target.closest('.m-ico'); if (ico) { closeOverlay('spot'); return M.open(ico.dataset.app); }
      const b = e.target.closest('.sp-r'); if (b) { const x = items[+b.dataset.i]; closeOverlay('spot'); x?.run(); }
    });
    q.addEventListener('input', render);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = res.querySelector('.sp-r'); if (b && q.value.trim()) b.click(); } });
    render();
    pushOverlay('spot', el);
    // Le clavier ne s'ouvre pas tout seul sur la grille vide : on ne place le curseur que si l'utilisateur touche le champ.
  }

  /* ---------------- Bannières ---------------- */
  function notify(n) {
    n = { at: Date.now(), unread: true, ...n };
    $('#mDot')?.classList.remove('hide');
    if (GX.shell.prefs.dnd || n.silent) return;
    const box = $('#mban'); if (!box) return;
    const el = document.createElement('div');
    el.innerHTML = `<div class="notif glass glass-strong">${n.u ? GX.r.av(n.u) : GX.appIcon(GX.app(n.app) || GX.app('settings'), 30)}<div style="min-width:0"><div class="n-app">${esc(GX.app(n.app)?.name || '')}</div><div class="n-t">${esc(n.title)}</div><div class="n-b">${esc(n.body)}</div></div><span class="n-time">maintenant</span></div>`;
    const b = el.firstElementChild; box.prepend(b); while (box.children.length > 2) box.lastElementChild.remove();
    const out = () => { b.classList.add('out'); setTimeout(() => b.remove(), 270); }; const t = setTimeout(out, 5000);
    b.onclick = () => { clearTimeout(t); out(); n.onClick ? n.onClick() : n.app && M.open(n.app); };
    b.addEventListener('pointerdown', (e) => { const sy = e.clientY; const mv = (ev) => { if (ev.clientY - sy < -30) { clearTimeout(t); out(); GX.unwin(window, 'pointermove', mv); } }; GX.win(window, 'pointermove', mv); GX.win(window, 'pointerup', () => GX.unwin(window, 'pointermove', mv), { once: true }); });
  }
})();

}
