/* =====================================================================
   Rubrique « To-do » (miroir de pages/TodoList.tsx) — Kanban personnel
   v2.1 (retours de Théo : lisibilité, fonds porteurs de sens, hauteur utile)
   - uniquement les tâches ASSIGNÉES à moi : tâches des projets Actifs ou
     Brouillons dont la fin n'est pas passée + tâches LIBRES (autonomes),
     qui ne disparaissent que terminées ET échues ; « Vierge » masqué
   - date de référence = échéance de la tâche, sinon fin du projet
   - filtres (carte .app-head2 repliable, libellés au-dessus) : recherche
     tâche OU projet, Périmètre MULTI (plaques), 6 Marques, Services
     VN/VO/APV/PR, plage de dates, « Effacer tout »
   - carte : liseré d'urgence, nom, projet + site (↗) OU « Libre » + sites
     + crayon, échéance « Expiré il y a X j » / « X j restants » / date /
     « Sans échéance », services, marques, canal, coût, flèches ‹ ›
   - colonnes teintées de leur couleur, cartes contrastées, liseré rouge
     « Expiré / ≤ 3 j », orange « ≤ 7 j »
   - glisser-déposer entre colonnes (souris) + FLIP ; flèches ‹ › au doigt
   - tâche libre : création, édition, suppression (pas de coût : décision
     de Théo, le serveur force cost = 0)
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt, esc = GX.esc;
  const COLS = [['Todo', 'À faire', 'var(--info)'], ['InProgress', 'En cours', 'var(--bony-orange)'], ['Programmed', 'Programmé', 'var(--bony-violet)'], ['Done', 'Terminé', 'var(--ok)']];
  const CREATE = ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager'];
  const BRANDS = D.BRANDS.map((b) => b.id);
  const FILTER_SERVICES = ['VN', 'VO', 'APV', 'PR'];            // filtre : SERVICES sans « Tous Services » (comme TodoList.tsx)
  const FORM_SERVICES = [...FILTER_SERVICES, 'Tous Services'];  // formulaire : SERVICES complet
  const BRAND_COLORS = Object.fromEntries(D.BRANDS.map((b) => [b.id, b.hex]));
  const day = (n) => GX.iso(GX.addDays(GX.today(), n));
  /* Tâches libres : en mémoire, partagées entre les fenêtres de la session */
  const FREE = [
    { id: 'free1', name: 'Commander les goodies du salon', provider: 'Goodies & Co', channel: 'PLV', status: 'Todo', deadline: day(2), sites: ['Rodez'], brands: ['Renault'], services: ['VN'] },
    { id: 'free2', name: 'Refaire la signature e-mail de l’équipe', provider: '', channel: 'E-mail', status: 'InProgress', deadline: null, sites: [], brands: [], services: ['Tous Services'] },
    { id: 'free3', name: 'Réserver le photographe portraits', provider: 'Studio Volcans', channel: 'Audiovisuel', status: 'Programmed', deadline: day(12), sites: ['Clermont'], brands: ['Holding'], services: ['Tous Services'] },
    { id: 'free4', name: 'Relancer l’imprimeur pour les flyers', provider: 'Imprimerie Arverne', channel: 'Print', status: 'Todo', deadline: day(-3), sites: ['Vichy', 'Moulins'], brands: ['Renault', 'Dacia'], services: ['APV'] },
  ];

  GX.css(`
  .tdo-h2 .search{width:300px}
  .tdo-h2 .tdo-clear{margin-left:auto;align-self:flex-end;color:var(--danger)}
  .tdo-fbtn .count{background:var(--accent)}
  .tdo-saving{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);align-self:center;animation:tdo-pulse 1s ease-in-out infinite}
  @keyframes tdo-pulse{50%{opacity:.45}}
  .tdo-h2 .chips .chip{height:30px;font-size:13px}
  .tdo-none{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px;color:var(--text-2);font-size:14px;text-align:center}
  .tdo-none svg.i{width:40px;height:40px;stroke-width:1;color:var(--text-3)}
  .tdo-colnav{display:none}
  .tdo-board{flex:1;min-height:0;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:12px;padding:12px 14px 14px}
  .tdo-col{display:flex;flex-direction:column;min-height:0;min-width:0;border-radius:16px;background:color-mix(in srgb,var(--c) 9%,var(--surface-0));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 22%,var(--line));transition:box-shadow var(--t-fast),background var(--t-fast)}
  :root[data-theme="light"] .tdo-col{background:color-mix(in srgb,var(--c) 8%,var(--surface-0))}
  .tdo-col.over{background:color-mix(in srgb,var(--c) 18%,var(--surface-0));box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--c) 70%,transparent)}
  .tdo-col>header{display:flex;align-items:center;gap:8px;padding:10px 12px;margin:6px 6px 4px;border-radius:11px;background:color-mix(in srgb,var(--c) 16%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 32%,transparent)}
  .tdo-col>header .dot{width:9px;height:9px;border-radius:50%;background:var(--c);flex:none}
  .tdo-col>header b{font-size:12.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:color-mix(in srgb,var(--c) 75%,var(--text))}
  .tdo-col>header .n{min-width:22px;height:20px;padding:0 6px;border-radius:99px;display:inline-grid;place-items:center;font-size:12px;font-weight:800;background:var(--c);color:#fff}
  .tdo-cards{flex:1;min-height:60px;padding:4px 8px 10px;display:flex;flex-direction:column;gap:8px}
  .tdo-empty{margin:4px 2px;padding:18px 10px;border-radius:12px;border:1.5px dashed color-mix(in srgb,var(--c) 40%,var(--line-2));text-align:center;color:var(--text-3);font-size:13px}
  .tdo-card{position:relative;padding:10px 11px 6px 13px;border-radius:12px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line-2),var(--shadow-1);border-left:4px solid transparent;cursor:grab;display:grid;gap:7px;user-select:none;-webkit-user-select:none;flex:none;
    transition:box-shadow var(--t-fast),opacity var(--t-fast),transform var(--t-fast)}
  :root[data-theme="light"] .tdo-card{background:#fff;box-shadow:inset 0 0 0 1px var(--line),0 1px 2px rgba(20,16,30,.08),0 4px 12px -6px rgba(20,16,30,.18)}
  .tdo-card.r{border-left-color:var(--danger)}.tdo-card.o{border-left-color:var(--bony-orange)}
  .tdo-card:hover{box-shadow:inset 0 0 0 1px var(--line-3),var(--shadow-2)}
  .tdo-card:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .tdo-card.ph{opacity:.28}
  .tdo-card .nm{font-size:14.5px;font-weight:700;line-height:1.3;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .tdo-card.done .nm{color:var(--text-2);text-decoration:line-through;text-decoration-color:var(--line-3)}
  .tdo-l2{display:flex;align-items:center;flex-wrap:wrap;gap:3px 8px;min-width:0}
  .tdo-pj{display:inline-flex;flex:1 1 130px;align-items:center;gap:6px;min-width:0;font-size:13px;font-weight:600;color:var(--text-2);border-radius:6px;padding:1px 4px;margin:-1px -4px;transition:color var(--t-fast),background var(--t-fast)}
  .tdo-pj:hover{color:var(--accent);background:var(--sel)}
  .tdo-pj svg.i{width:13px;height:13px;flex:none}
  .tdo-pj .st{font-size:12px;color:var(--text-3);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .tdo-pj .st.site{flex:none;max-width:45%}
  .tdo-libre{height:20px;padding:0 7px;border-radius:6px;display:inline-flex;align-items:center;font-size:11.5px;font-weight:800;flex:none;background:color-mix(in srgb,var(--bony-violet) 18%,transparent);color:color-mix(in srgb,var(--bony-violet) 60%,var(--text));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bony-violet) 45%,transparent)}
  .tdo-dl{display:inline-flex;align-items:center;gap:5px;margin-left:auto;flex:none;font-size:12.5px;font-weight:700;color:var(--text-2);white-space:nowrap}
  .tdo-dl svg.i{width:13px;height:13px}
  .tdo-dl.late{color:var(--danger)}.tdo-dl.crit{color:var(--danger)}.tdo-dl.warn{color:var(--bony-orange)}.tdo-dl.none{color:var(--text-3);font-weight:500}
  .tdo-tags{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
  .tdo-tags .badge{height:20px;font-size:11.5px;padding:0 7px}
  .tdo-tags .ch{background:var(--surface-3);color:var(--text-2);box-shadow:inset 0 0 0 1px var(--line-2)}
  :root[data-theme="light"] .tdo-tags .ch{background:var(--surface-3);color:var(--text-2)}
  .tdo-tags .cost{margin-left:auto;font-size:12.5px;font-weight:700;white-space:nowrap}
  .tdo-mv{display:flex;gap:4px;border-top:1px solid var(--line);padding-top:4px}
  .tdo-mv button{flex:1;height:26px;border-radius:7px;display:grid;place-items:center;color:var(--text-2);transition:background var(--t-fast),color var(--t-fast)}
  .tdo-mv button:hover{background:var(--surface-3);color:var(--text)}
  .tdo-mv button[disabled]{opacity:.25;pointer-events:none}
  .tdo-ghost{position:absolute;z-index:40;pointer-events:none;cursor:grabbing;margin:0;box-shadow:inset 0 0 0 1px var(--line-3),var(--shadow-3)}
  .tdo-sheet .chips .chip{height:28px}
  @container app (max-width:980px){.tdo-h2 .search{width:220px}}
  @container app (max-width:720px){
    .tdo-h2 > div:has(> .search){flex:1 1 100%}.tdo-h2 .search{width:100%}
    .tdo .app-head .btn.primary span{display:none}
    .tdo-h2 .tdo-sep{display:none}
    .tdo-h2 .tdo-clear{margin-left:0}
    .tdo-colnav{display:flex;overflow-x:auto;scrollbar-width:none;padding:8px 12px 0}
    .tdo-colnav .seg{flex:none}
    .tdo-board{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:88%;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;padding:10px 12px 14px;gap:10px;scrollbar-width:none}
    .tdo-col{scroll-snap-align:center}
    .tdo-mv button{height:34px}
  }
  `);

  /* ---------------- Données ---------------- */
  const todayIso = () => GX.iso(GX.today());
  const daysTo = (d) => Math.round((new Date(d) - GX.today()) / 864e5);
  function items() {
    const out = [], T = todayIso();
    for (const p of D.PROJECTS) {
      if (!(p.status === 'Active' || p.status === 'Draft') || p.endDate < T) continue;   // TodoList.tsx : projets actifs/brouillons non échus
      for (const t of p.tasks) if (t.assignee === 'me' && t.status !== 'Empty')
        out.push({ id: t.id, t, p, sites: p.sites, brands: p.brands, services: p.services, ref: t.deadline || p.endDate, start: p.startDate, noDate: false });
    }
    for (const t of FREE) {
      if (t.status === 'Done' && t.deadline && t.deadline < T) continue;               // libre : disparaît terminée ET échue
      out.push({ id: t.id, t, p: null, sites: t.sites, brands: t.brands, services: t.services, ref: t.deadline || '9999-12-31', start: t.deadline || T, noDate: !t.deadline });
    }
    return out;
  }
  const inGlobal = (it) => {
    const per = GX.ctx.perimetre; if (!per || per === 'Tout le réseau') return true;
    if (per === 'Nissan') return it.brands.includes('Nissan');
    return !it.sites.length || it.sites.includes(per);
  };
  function urgency(it) {
    /* TodoList.tsx : l'urgence ne dépend QUE de la date de référence, statut compris
       (une tâche terminée d'un projet encore actif reste « Expiré il y a X j »).
       Libellé « X j restants » jusqu'à 7 j : modèle validé (Todo.dc.html). */
    if (it.noDate) return { txt: 'Sans échéance', cls: 'none', edge: '' };
    const d = daysTo(it.ref), left = `${d} j restant${d > 1 ? 's' : ''}`;
    if (d < 0) return { txt: `Expiré il y a ${-d} j`, cls: 'late', edge: 'r' };
    if (d <= 3) return { txt: left, cls: 'crit', edge: 'r' };
    if (d <= 7) return { txt: left, cls: 'warn', edge: 'o' };
    return { txt: F.dateY(it.ref), cls: '', edge: '' };
  }
  const brandLabel = (b) => (b === 'Holding' ? 'GROUPE BONY' : b);

  /* ---------------- Montage ---------------- */
  function mount(body, win) {
    const f = { q: '', sites: [], brands: [], services: [], from: '', to: '' };
    let hideDone = false, open = GX.store.get('todo.filters', body.clientWidth === 0 || body.clientWidth >= 720), selfEmit = false, suppressClick = false;
    body.innerHTML = `<div class="app tdo"><div data-head></div><div class="app-head2 tdo-h2" data-h2></div><div class="tdo-colnav" data-nav></div><div class="tdo-board scroll" data-board></div><div class="tdo-none hide" data-none></div></div>`;
    const app = body.firstElementChild, head = body.querySelector('[data-head]'), h2 = body.querySelector('[data-h2]'), board = body.querySelector('[data-board]'), nav = body.querySelector('[data-nav]'), none = body.querySelector('[data-none]');
    const ro = () => GX.ctx.readOnly;
    const canCreate = () => CREATE.includes(GX.ctx.role) && !ro();
    const cols = () => COLS.filter((c) => !(hideDone && c[0] === 'Done'));

    const matchSites = (it) => f.sites.some((s) => (s === 'Nissan' ? it.brands.includes('Nissan') : it.sites.includes(s)));
    const filtered = () => items().filter((it) => {
      if (!inGlobal(it)) return false;
      const q = f.q.trim().toLowerCase();
      if (q && !`${it.t.name} ${it.p?.name || ''}`.toLowerCase().includes(q)) return false;
      if (f.sites.length && !matchSites(it)) return false;
      if (f.brands.length && !f.brands.some((b) => it.brands.includes(b))) return false;
      if (f.services.length && !f.services.some((s) => it.services.includes(s))) return false;
      if (f.from && it.ref < f.from) return false;
      if (f.to && it.start > f.to) return false;
      return true;
    });
    /* même décompte que TodoList.tsx : une unité par famille de filtre */
    const active = () => (f.q.trim() ? 1 : 0) + (f.sites.length ? 1 : 0) + (f.brands.length ? 1 : 0) + (f.services.length ? 1 : 0) + (f.from || f.to ? 1 : 0);

    /* --- en-tête compact --- */
    function renderHead() {
      const n = active();
      head.innerHTML = `<div class="app-head"><div class="ah-t"><h1>To-do</h1><span class="sub" data-stats></span></div>
        <div class="ah-f"><span class="tdo-saving hide" data-saving>Sauvegarde…</span>
          <button class="btn tdo-fbtn" data-act="toggle" aria-expanded="${open}">${GX.icon('filter', 'sm')}Filtres${n ? `<span class="count">${n}</span>` : ''}${GX.icon(open ? 'chevup' : 'chevdown', 'sm')}</button>
          ${ro() ? `<span class="badge" style="--c:var(--danger)">${GX.icon('lock', 'sm')}Lecture seule</span>` : ''}
          ${canCreate() ? `<button class="btn primary" data-act="new" data-tip="Nouvelle tâche">${GX.icon('plus', 'sm')}<span>Nouvelle tâche</span></button>` : ''}</div></div>`;
      renderH2(); renderStats();
    }
    /* libellé du bouton Périmètre, comme SiteFilterDropdown : « Périmètre » / « N site(s) » */
    const siteLbl = (v) => (v.length ? `${v.length} site${v.length > 1 ? 's' : ''}` : 'Périmètre');
    function renderH2() {
      h2.classList.toggle('hide', !open);
      h2.innerHTML = `<div><span class="label">Recherche</span><label class="search">${GX.icon('search', 'sm')}<input data-q placeholder="Rechercher une tâche ou un projet…" value="${esc(f.q)}" /></label></div>
        <div><span class="label">Périmètre</span>${GX.ui.pickerBtn('data-f="sites"', 'pin', siteLbl(f.sites), f.sites.length)}</div>
        <span class="tdo-sep"></span><div><span class="label">Marques</span>${GX.ui.chips(BRANDS, f.brands, { all: 'Toutes', colors: BRAND_COLORS, attr: 'data-f="brands"' })}</div>
        <span class="tdo-sep"></span><div><span class="label">Services</span>${GX.ui.chips(FILTER_SERVICES, f.services, { all: 'Tous', attr: 'data-f="services"' })}</div>
        <span class="tdo-sep"></span><div><span class="label">Dates</span>${GX.ui.pickerBtn('data-f="dates"', 'agenda', GX.ui.periodLabel(f.from, f.to), f.from || f.to)}</div>
        <button class="btn ghost sm tdo-clear ${active() ? '' : 'hide'}" data-act="clear">${GX.icon('close', 'sm')}Effacer tout</button>`;
    }
    function renderStats(list = filtered()) {
      const el = head.querySelector('[data-stats]'); if (!el) return;
      el.innerHTML = `<b class="num" style="color:var(--text)">${list.length}</b> tâche${list.length !== 1 ? 's' : ''} assignée${list.length !== 1 ? 's' : ''} · les plus urgentes en haut de chaque colonne`;
    }

    /* --- tableau --- */
    function cardHTML(it) {
      const t = it.t, u = urgency(it), si = COLS.findIndex((c) => c[0] === t.status), dis = ro();
      const where = it.sites.length ? esc(it.sites.length > 2 ? `${it.sites.slice(0, 2).join(', ')} +${it.sites.length - 2}` : it.sites.join(', ')) : '';
      return `<article class="tdo-card ${u.edge} ${t.status === 'Done' ? 'done' : ''}" data-id="${it.id}" tabindex="0">
        <div class="nm" title="${esc(t.name)}">${esc(t.name)}</div>
        <div class="tdo-l2">${it.p
          ? `<button class="tdo-pj" data-act="project" data-tip="Ouvrir le projet"><span class="ellipsis" style="color:var(--text)">${esc(it.p.name)}</span><span class="st site">${esc(it.p.sites[0] || '')}</span>${it.p.status === 'Draft' ? '<span class="badge" style="--c:var(--text-3);height:18px">Brouillon</span>' : ''}${GX.icon('arrowr', 'sm')}</button>`
          : `<button class="tdo-pj" data-act="edit" data-tip="${dis ? 'Tâche libre' : 'Modifier cette tâche'}"><span class="tdo-libre">Libre</span>${where ? `<span class="st">${where}</span>` : ''}${dis ? '' : GX.icon('edit', 'sm')}</button>`}
          <span class="tdo-dl ${u.cls}">${u.cls === 'none' ? '' : GX.icon(u.cls === 'late' ? 'alert' : 'clock')}${u.txt}</span></div>
        <div class="tdo-tags">${it.services.map((s) => GX.r.service(s)).join('')}${GX.r.brandChips(it.brands)}${t.channel ? `<span class="badge ch">${esc(t.channel)}</span>` : ''}${t.cost ? `<span class="cost num">${F.eur(t.cost)}</span>` : ''}</div>
        <div class="tdo-mv"><button data-mv="-1" ${si <= 0 || dis ? 'disabled' : ''} aria-label="Colonne précédente" data-tip="${si > 0 ? 'Vers « ' + COLS[si - 1][1] + ' »' : ''}">${GX.icon('back', 'sm')}</button><button data-mv="1" ${si >= COLS.length - 1 || dis ? 'disabled' : ''} aria-label="Colonne suivante" data-tip="${si < COLS.length - 1 ? 'Vers « ' + COLS[si + 1][1] + ' »' : ''}">${GX.icon('chevron', 'sm')}</button></div>
      </article>`;
    }
    const sortIt = (a, b) => a.ref.localeCompare(b.ref) || a.t.name.localeCompare(b.t.name);
    function renderBoard(list = filtered()) {
      const cs = cols(); board.style.setProperty('--n', cs.length);
      const sc = new Map([...board.querySelectorAll('[data-drop]')].map((c) => [c.dataset.drop, c.scrollTop])), bx = board.scrollLeft;
      /* TodoList.tsx : liste filtrée vide → message plein écran à la place du tableau */
      const empty = !list.length;
      board.classList.toggle('hide', empty); nav.classList.toggle('hide', empty); none.classList.toggle('hide', !empty);
      none.innerHTML = !empty ? '' : `${GX.icon('todo')}<p>${items().some(inGlobal) ? 'Aucune tâche ne correspond aux filtres sélectionnés.' : 'Aucune tâche ne vous est assignée dans les projets actifs.'}</p>${active() ? '<button class="btn sm" data-act="clear">Effacer les filtres</button>' : ''}`;
      board.innerHTML = empty ? '' : cs.map(([k, l, c]) => {
        const its = list.filter((it) => it.t.status === k).sort(sortIt);
        return `<section class="tdo-col" data-col="${k}" style="--c:${c}"><header><i class="dot"></i><b>${l}</b><span class="n num" style="margin-left:auto">${its.length}</span></header>
          <div class="tdo-cards scroll" data-drop="${k}">${its.map(cardHTML).join('') || '<div class="tdo-empty">Aucune tâche</div>'}</div></section>`;
      }).join('');
      board.querySelectorAll('[data-drop]').forEach((c) => (c.scrollTop = sc.get(c.dataset.drop) || 0)); board.scrollLeft = bx;
      nav.innerHTML = `<div class="seg" data-colseg>${cs.map(([k, l], i) => `<button data-v="${k}" aria-pressed="${i === 0}">${l} ${list.filter((it) => it.t.status === k).length}</button>`).join('')}</div>`;
      renderStats(list); syncNav();
    }
    const rectsOf = () => new Map([...board.querySelectorAll('.tdo-card')].map((c) => [c.dataset.id, c.getBoundingClientRect()]));
    function flipAll(rects, movedId, from) {
      board.querySelectorAll('.tdo-card').forEach((c) => {
        const r = c.dataset.id === movedId && from ? from : rects.get(c.dataset.id);
        if (r) GX.flip(c, r, { spring: c.dataset.id === movedId ? 'bouncy' : 'snappy' });
        else GX.animate(c, [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
      });
    }
    const find = (id) => items().find((it) => it.id === id);
    function setStatus(it, st, from) {
      if (!it || it.t.status === st || ro()) return;
      const rects = rectsOf(); it.t.status = st; saving();
      if (hideDone && st === 'Done') hideDone = false;
      if (it.p) { selfEmit = true; GX.emit('data:projects'); selfEmit = false; }
      renderBoard(); flipAll(rects, it.id, from);
      const c = board.querySelector(`.tdo-card[data-id="${it.id}"]`);
      if (c) { c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); if (st === 'Done') GX.animate(c, [{ boxShadow: '0 0 0 0 var(--ok)' }, { boxShadow: '0 0 0 6px transparent' }], { duration: 700, easing: 'ease-out' }); }
      const cnt = board.querySelector(`[data-col="${st}"] .n`); if (cnt) GX.animate(cnt, [{ transform: 'scale(1.5)' }, { transform: 'none' }], { spring: 'bouncy' });
    }

    /* « Sauvegarde… » de TodoList.tsx pendant l'écriture (simulée) */
    let saveT = 0;
    function saving() { const s = head.querySelector('[data-saving]'); if (!s) return; s.classList.remove('hide'); clearTimeout(saveT); saveT = setTimeout(() => s.classList.add('hide'), 700); }

    /* --- navigation compacte entre colonnes --- */
    let navT = 0;
    function syncNav() {
      const seg = nav.querySelector('.seg'); if (!seg || !board.clientWidth) return;
      const colsEl = [...board.querySelectorAll('.tdo-col')], mid = board.scrollLeft + board.clientWidth / 2;
      const i = Math.max(0, colsEl.findIndex((c) => c.offsetLeft <= mid && c.offsetLeft + c.offsetWidth >= mid));
      const bs = [...seg.querySelectorAll('button')]; if (bs[i]?.getAttribute('aria-pressed') === 'true') return;
      bs.forEach((b, k) => b.setAttribute('aria-pressed', k === i)); GX.ui.refresh(nav);
    }
    board.addEventListener('scroll', () => { clearTimeout(navT); navT = setTimeout(syncNav, 90); }, { passive: true });
    nav.addEventListener('change', (e) => { const c = board.querySelector(`[data-col="${e.detail}"]`); if (c) board.scrollTo({ left: c.offsetLeft - 12, behavior: 'smooth' }); });

    /* --- glisser-déposer (souris / stylet) --- */
    board.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.tdo-card'); if (!card || e.button !== 0 || e.pointerType === 'touch' || e.target.closest('button') || ro()) return;
      const sx = e.clientX, sy = e.clientY; let drag = null;
      const move = (ev) => {
        if (!drag) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return; drag = begin(card, sx, sy); }
        const ar = app.getBoundingClientRect();
        drag.ghost.style.left = ev.clientX - ar.left - drag.ox + 'px'; drag.ghost.style.top = ev.clientY - ar.top - drag.oy + 'px';
        const col = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tdo-col');
        if (col !== drag.over) { drag.over?.classList.remove('over'); drag.over = col && board.contains(col) ? col : null; drag.over?.classList.add('over'); }
        const cards = drag.over?.querySelector('[data-drop]'); if (cards) { const r = cards.getBoundingClientRect(); if (ev.clientY > r.bottom - 30) cards.scrollTop += 8; else if (ev.clientY < r.top + 30) cards.scrollTop -= 8; }
      };
      const up = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
        if (!drag) return; suppressClick = true; setTimeout(() => (suppressClick = false), 0);
        const { ghost, over, item } = drag; over?.classList.remove('over'); card.classList.remove('ph');
        const gr = ghost.getBoundingClientRect(); ghost.remove();
        if (over && over.dataset.col !== item.t.status) setStatus(item, over.dataset.col, gr);
        else GX.flip(card, gr, { spring: 'bouncy' });
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
    function begin(card, sx, sy) {
      const r = card.getBoundingClientRect(), ar = app.getBoundingClientRect();
      const ghost = card.cloneNode(true); ghost.classList.add('tdo-ghost'); ghost.classList.remove('ph');
      Object.assign(ghost.style, { width: r.width + 'px', left: r.left - ar.left + 'px', top: r.top - ar.top + 'px' });
      app.append(ghost); card.classList.add('ph'); GX.menu.close();
      GX.animate(ghost, [{ transform: 'none' }, { transform: 'rotate(2.5deg) scale(1.04)' }], { spring: 'snappy', fill: 'forwards' });
      return { ghost, ox: sx - r.left, oy: sy - r.top, over: null, item: find(card.dataset.id) };
    }

    /* --- clics sur les cartes --- */
    const openProject = (it, origin) => GX.wm.open('project', { id: it.p.id, title: it.p.name }, { origin });
    board.addEventListener('click', (e) => {
      if (suppressClick) return;
      const mv = e.target.closest('[data-mv]'), card = e.target.closest('.tdo-card'); if (!card) return;
      const it = find(card.dataset.id); if (!it) return;
      if (mv) { const i = COLS.findIndex((c) => c[0] === it.t.status) + +mv.dataset.mv; if (COLS[i]) setStatus(it, COLS[i][0]); return; }
      if (it.p) openProject(it, card); else taskSheet(it.t);
    });
    board.addEventListener('keydown', (e) => {
      const card = e.target.closest('.tdo-card'); if (!card || e.target !== card) return; const it = find(card.dataset.id);
      if (e.key === 'Enter') card.click();
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !ro()) { e.preventDefault(); const i = COLS.findIndex((c) => c[0] === it.t.status) + (e.key === 'ArrowRight' ? 1 : -1); if (COLS[i]) { setStatus(it, COLS[i][0]); board.querySelector(`.tdo-card[data-id="${it.id}"]`)?.focus(); } }
    });
    board.addEventListener('contextmenu', (e) => {
      const card = e.target.closest('.tdo-card'); if (!card) return; e.preventDefault(); const it = find(card.dataset.id);
      GX.menu.open([{ header: 'Déplacer vers' }, ...COLS.map(([k, l]) => ({ label: l, checked: it.t.status === k, disabled: ro(), action: () => setStatus(it, k) })), '-',
        it.p ? { label: 'Ouvrir le projet', icon: 'projects', action: () => openProject(it, card) } : { label: 'Modifier la tâche…', icon: 'edit', disabled: ro(), action: () => taskSheet(it.t) },
        ...(it.p ? [] : [{ label: 'Supprimer la tâche', icon: 'trash', disabled: ro(), action: () => delFree(it.t) }])], { x: e.clientX, y: e.clientY });
    });

    /* --- filtres --- */
    const refilter = () => { const rects = rectsOf(); renderBoard(); flipAll(rects); syncFilterUI(); };
    function syncFilterUI() {
      const n = active(), fb = head.querySelector('.tdo-fbtn');
      if (fb) fb.innerHTML = `${GX.icon('filter', 'sm')}Filtres${n ? `<span class="count">${n}</span>` : ''}${GX.icon(open ? 'chevup' : 'chevdown', 'sm')}`;
      h2.querySelector('[data-act=clear]')?.classList.toggle('hide', !active());
    }
    h2.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { f.q = e.target.value; refilter(); } });
    none.addEventListener('click', (e) => { if (e.target.closest('[data-act=clear]')) clearAll(); });
    head.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'toggle') {
        open = !open; GX.store.set('todo.filters', open); renderH2(); syncFilterUI(); a.setAttribute('aria-expanded', open);
        if (open) GX.animate(h2, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
      }
      if (a.dataset.act === 'new') taskSheet(null);
    });
    h2.addEventListener('change', (e) => {
      const g = e.target.closest('.chips[data-f]'); if (!g || !Array.isArray(e.detail)) return;
      f[g.dataset.f] = e.detail; refilter();
    });
    h2.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]'), a = e.target.closest('[data-act]');
      if (b?.dataset.f === 'sites') GX.ui.sitePicker(b, f.sites, (v) => { f.sites = v; b.querySelector('.v').textContent = siteLbl(v); b.classList.toggle('active', !!v.length); refilter(); }, { variant: 'filter', multi: true, entities: false });
      if (b?.dataset.f === 'dates') GX.ui.dateRange(b, { from: f.from, to: f.to }, ({ from, to }) => { f.from = from || ''; f.to = to || ''; b.querySelector('.v').textContent = GX.ui.periodLabel(f.from, f.to); b.classList.toggle('active', !!(f.from || f.to)); refilter(); });
      if (a?.dataset.act === 'clear') clearAll();
    });
    function clearAll() { Object.assign(f, { q: '', sites: [], brands: [], services: [], from: '', to: '' }); renderHead(); refilter(); }

    /* --- tâche libre : création / modification / suppression --- */
    function delFree(t) {
      if (ro()) return;
      const i = FREE.indexOf(t); if (i < 0) return;
      const rects = rectsOf(); FREE.splice(i, 1); saving(); renderBoard(); flipAll(rects); GX.shell?.hud?.('Tâche supprimée');
    }
    function taskSheet(t) {
      if (t ? ro() : !canCreate()) { if (t) GX.shell?.hud?.('Lecture seule'); return; }
      const v = t ? { ...t, sites: [...t.sites], brands: [...t.brands], services: [...t.services] } : { name: '', provider: '', deadline: '', channel: '', status: 'Todo', sites: [], brands: [], services: [] };
      const chip = (attr, val, on, label, color) => `<button type="button" class="chip" ${attr}="${esc(val)}" aria-pressed="${on}">${color ? `<i class="brand-dot" style="--c:${color}"></i>` : ''}${esc(label)}</button>`;
      const brandsHTML = () => BRANDS.map((b) => chip('data-t-brand', b, v.brands.includes(b), brandLabel(b), BRAND_COLORS[b])).join('');
      const sh = win.sheet(`<div class="tdo-sheet"><h3>${t ? 'Modifier la tâche' : 'Nouvelle tâche'}</h3><div class="muted">Tâche libre, toujours assignée à vous. Les tâches d’un projet se créent depuis le projet.</div>
        <div class="form-grid">
          <label class="field full"><span class="label">Nom *</span><input class="input" data-t="name" value="${esc(v.name)}" placeholder="Ex. Relancer l’imprimeur" /></label>
          <label class="field"><span class="label">Prestataire</span><input class="input" data-t="provider" value="${esc(v.provider || '')}" list="tdoProv" /><datalist id="tdoProv">${D.PROVIDERS.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>
          <label class="field"><span class="label">Deadline</span><input type="date" class="input" data-t="deadline" value="${v.deadline || ''}" /></label>
          <label class="field"><span class="label">Canal</span><select class="select" data-t="channel"><option value="">—</option>${D.CHANNELS.map((c) => `<option ${c === v.channel ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="field"><span class="label">Statut</span><select class="select" data-t="status">${COLS.map(([k, l]) => `<option value="${k}" ${k === v.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <div class="field full"><span class="label">Sites</span><div>${GX.ui.pickerBtn('data-t-sites', 'pin', GX.ui.summary(v.sites, { all: 'Choisir des sites', max: 3 }), v.sites.length)}</div></div>
          <div class="field full"><span class="label">Marques</span><div class="chips" data-t-brands>${brandsHTML()}</div><span class="faint" style="font-size:12px">GROUPE BONY (Holding) est exclusif : suivi, jamais imputé à un budget.</span></div>
          <div class="field full"><span class="label">Services</span><div class="chips">${FORM_SERVICES.map((s) => chip('data-t-svc', s, v.services.includes(s), s)).join('')}</div></div>
        </div>
        <div class="foot">${t ? `<button class="btn danger" data-t-del>${GX.icon('trash', 'sm')}Supprimer</button><span class="grow"></span>` : ''}<button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-t-ok ${v.name ? '' : 'disabled'}>${t ? 'Enregistrer' : 'Créer la tâche'}</button></div></div>`, { width: 600 });
      const el = sh.el, ok = el.querySelector('[data-t-ok]');
      el.addEventListener('input', (e) => { if (e.target.matches('[data-t=name]')) ok.disabled = !e.target.value.trim(); });
      el.addEventListener('click', (e) => {
        const sb = e.target.closest('[data-t-sites]'), b = e.target.closest('[data-t-brand]'), sv = e.target.closest('[data-t-svc]');
        if (sb) GX.ui.sitePicker(sb, v.sites, (vals) => { v.sites = vals; sb.querySelector('.v').textContent = GX.ui.summary(vals, { all: 'Choisir des sites', max: 3 }); sb.classList.toggle('active', !!vals.length); }, { variant: 'filter', multi: true, title: 'Sites', entities: false });
        if (b) { const x = b.dataset.tBrand; if (x === 'Holding') v.brands = v.brands.includes('Holding') ? [] : ['Holding']; else { v.brands = v.brands.filter((y) => y !== 'Holding'); v.brands = v.brands.includes(x) ? v.brands.filter((y) => y !== x) : [...v.brands, x]; } el.querySelector('[data-t-brands]').innerHTML = brandsHTML(); }
        if (sv) { const x = sv.dataset.tSvc; v.services = v.services.includes(x) ? v.services.filter((y) => y !== x) : [...v.services, x]; sv.setAttribute('aria-pressed', v.services.includes(x)); }
        const del = e.target.closest('[data-t-del]');
        if (del) {
          if (!del.classList.contains('primary')) { del.classList.add('primary'); del.innerHTML = `${GX.icon('trash', 'sm')}Confirmer la suppression`; return; }
          sh.close(); delFree(t);
        }
        if (e.target.closest('[data-t-ok]')) {
          const val = (k) => el.querySelector(`[data-t=${k}]`).value;
          const name = val('name').trim(); if (!name) return;
          const data = { name, provider: val('provider').trim(), deadline: val('deadline') || null, channel: val('channel'), status: val('status'), sites: v.sites, brands: v.brands, services: v.services };
          const rects = rectsOf(); let id;
          if (t) { Object.assign(t, data); id = t.id; } else { id = GX.uid('free'); FREE.unshift({ id, ...data }); }
          sh.close(); saving(); if (hideDone && data.status === 'Done') hideDone = false;
          renderBoard(); flipAll(rects);
          const c = board.querySelector(`.tdo-card[data-id="${id}"]`); if (c) { c.scrollIntoView({ block: 'nearest', inline: 'center' }); GX.animate(c, [{ transform: 'scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'bouncy' }); }
          if (!filtered().some((it) => it.id === id)) GX.shell?.hud?.(t ? 'Tâche enregistrée — masquée par les filtres actifs' : 'Tâche créée — masquée par les filtres actifs');
        }
      });
      setTimeout(() => el.querySelector('[data-t=name]')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !ok.disabled) ok.click(); }), 30);
    }

    renderHead(); renderBoard();
    const ro2 = new ResizeObserver(() => syncNav()); ro2.observe(board);
    const off = [
      GX.on('data:projects', () => { if (selfEmit) return; const rects = rectsOf(); renderBoard(); flipAll(rects); }),
      GX.on('ctx', () => { renderHead(); renderBoard(); }),
    ];
    return {
      destroy() { off.forEach((o) => o()); ro2.disconnect(); clearTimeout(navT); clearTimeout(saveT); GX.ui.closePick(); },
      command(c) { if (c === 'new-task' || c === 'new') taskSheet(null); },
      menus: () => ({
        'Fichier': [{ label: 'Nouvelle tâche…', icon: 'plus', disabled: !canCreate(), action: () => taskSheet(null) }],
        'Présentation': [{ label: 'Masquer la colonne « Terminé »', checked: hideDone, action: () => { hideDone = !hideDone; const r = rectsOf(); renderBoard(); flipAll(r); } },
          { label: 'Afficher la ligne de filtres', checked: open, action: () => head.querySelector('[data-act=toggle]')?.click() }, '-',
          { label: 'Effacer tous les filtres', icon: 'close', disabled: !active(), action: clearAll }],
      }),
    };
  }

  GX.registerApp({ id: 'todo', name: 'To-do', icon: 'todo', tint: ['#34c77b', '#12806b'], size: [1100, 680], minSize: [360, 320], mount });
})();
