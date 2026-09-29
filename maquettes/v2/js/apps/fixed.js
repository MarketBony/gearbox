/* =====================================================================
   Rubrique « Dépenses » (miroir de pages/FixedExpenses.tsx) — v2.4
   Modèle validé : maquettes/ux/project/Depenses.dc.html
   - En-tête : Total période + Nouvelle dépense (EDIT_ROLES seulement).
   - Filtres : recherche, site (TOUS SITES / GROUPE BONY / sites des plaques),
     service, du / au ; compteur de dépenses.
   - Tableau triable (Date + Annuelle, Site / plaque, Service, Commentaire + PRO+,
     Montant, actions) à en-tête collant ; liste de cartes en fenêtre étroite.
   - Saisie en PANNEAU LATÉRAL : date + Ponctuelle / Annuelle, montant, service,
     sites (GROUPE BONY global, R/N, plaques, sites Nissan), marques (Holding
     exclusif, Alpine / Nissan selon les sites), curseurs de part (100 par
     défaut, visibles avec une marque RDM), répartition % / € + total,
     commentaire, PRO+.
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt;
  const RDM = ['Renault', 'Dacia', 'Mobilize'];
  const SERVICES = ['VN', 'VO', 'APV', 'PR', 'Tous Services'];                         // constants.ts SERVICES
  const BRANDS = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize', 'Holding'];       // constants.ts BRANDS
  const EDIT_ROLES = ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager'];
  const BRAND_BG = { Renault: ['#ffcc33', '#1a1400'], Dacia: ['#6a7551', '#fff'], Alpine: ['#0055a4', '#fff'], Nissan: ['#c3002f', '#fff'], Mobilize: ['#7b3fe4', '#fff'], Holding: ['#475569', '#fff'] };
  const SVC_HEX = { VN: '#3a5fc8', VO: '#f75632', APV: '#8f12ab', PR: '#1aa9bd', 'Tous Services': '#6b6880' };
  /* Clés de ventilation des périmètres groupés — copie de constants.ts (DISTRIBUTION_GROUPE_BONY / _RN) */
  const DIST = {
    'GROUPE BONY': { Clermont: 29 * .71, Mozac: 29 * .16, Massagettes: 29 * .05, Ussel: 29 * .08, Vichy: 7, Moulins: 5, Ricoux: 4, Issoire: 5, 'Le Puy-en-Velay': 9 * .72, Mende: 9 * .28,
      Albi: 32 * .19, Aurillac: 32 * .19, Figeac: 32 * .08, Villefranche: 32 * .05, Millau: 32 * .07, Rodez: 32 * .24, Gaillac: 32 * .11, Lavaur: 32 * .02, Carmaux: 32 * .05, Nissan: 9 },
    'GROUPE BONY (R/N)': { Clermont: 31.9 * .71, Mozac: 31.9 * .16, Massagettes: 31.9 * .05, Ussel: 31.9 * .08, Vichy: 7.75, Moulins: 5.1, Ricoux: 4.66, Issoire: 5.79, 'Le Puy-en-Velay': 9.44 * .72, Mende: 9.44 * .28,
      Albi: 35.37 * .2, Aurillac: 35.37 * .21, Figeac: 35.37 * .09, Millau: 35.37 * .07, Rodez: 35.37 * .29, Gaillac: 35.37 * .14 },
  };
  const GROUPS = Object.keys(DIST);

  GX.css(`
  .fix-shell{flex:1;min-height:0;display:flex;position:relative}
  .fix-main{flex:1;min-width:0;display:flex;flex-direction:column}
  .fix-h .ah-t{min-width:0;flex:0 1 auto}
  .fix-h .ah-f{display:flex;align-items:center;gap:12px;margin-left:auto}
  .fix-tot{padding:10px 18px;text-align:right;border-radius:12px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line-2)}
  .fix-tot .label{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--text-3)}
  .fix-tot b{display:block;font-family:var(--font-display);font-weight:700;font-size:21px;margin-top:4px;white-space:nowrap;font-variant-numeric:tabular-nums}
  .fix-f{display:flex;flex-wrap:wrap;align-items:center !important}
  .fix-f .search{width:300px;height:38px}
  .fix-il{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3)}
  .fix-f input[type="date"]{width:150px;height:36px}
  .fix-cnt{margin-left:auto;font-size:13px;color:var(--text-2);white-space:nowrap}
  .fix-body{display:flex;flex-direction:column;padding:0 22px 22px;overflow:hidden}
  .fix-card{flex:1;min-height:0;display:flex;flex-direction:column;padding:6px 0 0;overflow:hidden}
  .fix-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--surface-4) transparent;padding:0 8px 8px}
  .fix-scroll::-webkit-scrollbar{width:12px;height:12px}
  .fix-scroll::-webkit-scrollbar-thumb{background:var(--surface-4);border-radius:8px;border:3px solid transparent;background-clip:padding-box}
  .fix-t{width:100%;min-width:760px;border-collapse:separate;border-spacing:0;font-size:14px}
  .fix-t th{position:sticky;top:0;z-index:2;background:var(--surface-2);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);text-align:left;padding:12px 14px;border-bottom:1px solid var(--line-2);white-space:nowrap;user-select:none}
  .fix-t th[data-sort]{cursor:pointer}.fix-t th[data-sort]:hover{color:var(--text)}
  .fix-t th .ar{display:inline-grid;vertical-align:-3px;margin-left:4px;color:var(--accent)}
  .fix-t th.r,.fix-t td.r{text-align:right}
  .fix-t td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
  .fix-t tbody tr{transition:background var(--t-fast)}
  .fix-t tbody tr:hover{background:color-mix(in srgb,var(--surface-3) 60%,transparent)}
  .fix-t tbody tr.cur{background:color-mix(in srgb,var(--accent) 11%,transparent)}
  .fix-b{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap}
  .fix-b.an{background:color-mix(in srgb,var(--bony-violet) 22%,transparent);color:color-mix(in srgb,var(--bony-violet) 45%,var(--text))}
  .fix-b.site{background:color-mix(in srgb,var(--text) 8%,transparent);color:var(--text);text-transform:uppercase;max-width:230px;overflow:hidden;text-overflow:ellipsis;display:inline-block;line-height:22px}
  .fix-b.svc{background:var(--c);color:#fff}
  .fix-b.pro{background:var(--bony-grad);color:#fff;margin-right:8px}
  .fix-dt{font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
  .fix-amt{font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
  .fix-act{display:inline-flex;gap:2px;opacity:0;transition:opacity var(--t-fast)}
  .fix-t tr:hover .fix-act,.fix-t tr:focus-within .fix-act,.fix-t tr.cur .fix-act{opacity:1}
  .fix-act .del{color:var(--danger)}
  .fix-flash{animation:fix-flash 1.4s var(--ease-out)}
  @keyframes fix-flash{0%,30%{background:var(--sel)}}
  .fix-cards{display:none;flex-direction:column;gap:10px;overflow:auto;flex:1;min-height:0;padding-bottom:10px}
  .fix-mc{padding:12px 14px;display:grid;gap:6px}
  .fix-mc .top{display:flex;align-items:center;gap:8px}
  .fix-mc .top .fix-dt{color:var(--accent)}
  .fix-mc .meta{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text-2);flex-wrap:wrap}
  .fix-mc .cm{font-size:13px;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .fix-mc .acts{display:flex;justify-content:flex-end;gap:4px}
  .fix-empty{padding:48px 16px}
  /* Panneau latéral */
  .fix-scrim{display:none}
  .fix-panel{width:520px;flex:none;box-sizing:border-box;height:100%;display:flex;flex-direction:column;background:var(--surface-1);border-left:1px solid var(--line-2);box-shadow:-30px 0 60px -34px rgba(0,0,0,.55);animation:fix-in var(--t-slow) var(--spring-snappy) both}
  @keyframes fix-in{from{transform:translateX(40px);opacity:0}}
  .fix-panel.out{animation:fix-out var(--t-med) ease-in both}
  @keyframes fix-out{to{transform:translateX(40px);opacity:0}}
  .fix-ph{display:flex;align-items:center;gap:10px;padding:22px 24px 14px;flex:none}
  .fix-ph .ic{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 20%,transparent);color:var(--c);flex:none}
  .fix-ph h2{margin:0;font-family:var(--font-display);font-weight:700;font-size:15px;letter-spacing:.04em;text-transform:uppercase;min-width:0}
  .fix-pb{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;padding:4px 24px 20px;display:flex;flex-direction:column;gap:18px}
  .fix-pb .label{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--text-3)}
  .fix-fld{display:flex;flex-direction:column;gap:7px;min-width:0}
  .fix-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
  .fix-pb .input,.fix-pb .select{height:40px;width:100%;box-sizing:border-box}
  .fix-pb input[type="date"]{height:40px;width:100%}
  .fix-dis{opacity:.45;pointer-events:none}
  .fix-hint{font-size:12.5px;color:color-mix(in srgb,var(--bony-violet) 40%,var(--text));margin-top:-10px}
  .fix-note{font-size:12px;color:var(--text-3)}
  .fix-amtin{position:relative}.fix-amtin .input{font-size:16px;font-weight:700;padding-right:30px;text-align:left}
  .fix-amtin span{position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--text-3);font-weight:600}
  .fix-sitebtn{width:100%;max-width:none;height:40px;justify-content:space-between}
  .fix-brands{display:flex;flex-wrap:wrap;gap:6px}
  .fix-brands .chip{height:32px;padding:0 13px;border-radius:8px;font-size:13px;background:transparent;box-shadow:inset 0 0 0 1px var(--line-2);color:var(--text-2)}
  .fix-brands .chip[aria-pressed="true"]{background:var(--bg);color:var(--fg);box-shadow:none}
  .fix-brands .chip:disabled{opacity:.35;cursor:not-allowed}
  .fix-share{padding:12px 14px;border-radius:10px;background:color-mix(in srgb,var(--surface-0) 55%,transparent);box-shadow:inset 0 0 0 1px var(--line);display:flex;flex-direction:column;gap:9px}
  .fix-share .row{justify-content:space-between;gap:10px}
  .fix-share b{font-size:13px}
  .fix-share input[type="range"]{width:100%}
  .fix-dist{display:flex;flex-direction:column;gap:8px}
  .fix-dist .hd{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .fix-dist .seg button{height:26px;padding:0 12px}
  .fix-drow{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:9px;background:color-mix(in srgb,var(--surface-0) 55%,transparent);box-shadow:inset 0 0 0 1px var(--line)}
  .fix-drow span.n{flex:1;min-width:0;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .fix-drow .input{width:96px;height:32px;text-align:right;flex:none}
  .fix-drow .u{width:14px;color:var(--text-3);font-size:12px}
  .fix-drow .alt{width:84px;text-align:right;font-size:13px;color:var(--text-2);white-space:nowrap;font-variant-numeric:tabular-nums}
  .fix-dtot{text-align:right;font-size:13px;font-weight:700}
  .fix-pb .textarea{min-height:80px;width:100%;box-sizing:border-box}
  .fix-pro{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;cursor:pointer}
  .fix-pf{display:flex;align-items:center;gap:10px;padding:14px 24px 18px;border-top:1px solid var(--line);flex:none}
  .fix-err{color:var(--danger);font-size:12.5px;font-weight:600;margin-right:auto;line-height:1.3}
  @container app (max-width:1239px){
    .fix-scrim{display:block;position:absolute;inset:0;z-index:29;background:rgba(0,0,0,.28)}
    .fix-panel{position:absolute;top:0;right:0;bottom:0;z-index:30;width:min(520px,100%)}}
  @container app (max-width:900px){.fix-f .search{width:100%}.fix-cnt{margin-left:0}}
  @container app (max-width:760px){.fix-scroll{display:none}.fix-card{background:none;box-shadow:none;border:0;padding:0}.fix-cards{display:flex}.fix-body{padding:0 10px 12px}}
  @container app (max-width:560px){.fix-h .ah-t .sub{display:none}.fix-tot{padding:8px 12px}.fix-tot b{font-size:16px}.fix-new .lbl{display:none}
    .fix-2{grid-template-columns:1fr}.fix-ph,.fix-pb,.fix-pf{padding-left:16px;padding-right:16px}.fix-f input[type="date"]{width:130px}}
  `);

  const esc = GX.esc;
  const isGroupExp = (e) => GROUPS.includes(e.site) || (e.sites || []).some((s) => GROUPS.includes(s));
  const siteOf = (e) => e.site || ((e.sites || []).find((s) => GROUPS.includes(s))) || (e.sites || []).join(', ');
  const brandsOf = (e) => (e.brands?.length ? e.brands : e.brand ? [e.brand] : []);
  const dateFr = (d) => new Date(d).toLocaleDateString('fr-FR');
  const amountFr = (n) => (+n || 0).toLocaleString('fr-FR') + ' €';
  const per = () => GX.ctx.site || GX.ctx.perimetre || 'Tout le réseau';
  const inPer = (e) => { const p = per(); if (p === 'Tout le réseau') return true; if (p === 'Nissan') return brandsOf(e).includes('Nissan'); return (e.sites || []).includes(p) || e.site === p; };
  /* getAvailableBrands() */
  const brandAvail = (sites, b) => (b === 'Alpine' ? sites.some((s) => D.ALPINE_SITES.includes(s)) : b === 'Nissan' ? sites.some((s) => D.NISSAN_SITES.includes(s)) : true);

  GX.registerApp({
    id: 'fixed', name: 'Dépenses', icon: 'fixed', tint: ['#caa04b', '#8a5a1c'], size: [1240, 740], minSize: [360, 320],
    mount(body, win) {
      const f = { q: '', site: 'All', service: 'All', from: '', to: '' };
      const sort = { k: 'date', dir: 'desc' };
      let selfEmit = false, flashId = null, form = null;
      const canEdit = () => EDIT_ROLES.includes(GX.ctx.role);
      body.innerHTML = `<div class="app"><div class="fix-shell"><div class="fix-main">
          <div class="app-head fix-h"><div class="ah-t"><h1>Dépenses</h1><span class="sub">Dépenses fixes ponctuelles ou annuelles, imputées au budget</span></div><div class="ah-f" data-head></div></div>
          <div class="app-head2 fix-f" data-filters></div>
          <div class="app-body fix-body" data-body></div></div><div data-panel style="display:contents"></div></div></div>`;
      const $h = body.querySelector('[data-head]'), $f = body.querySelector('[data-filters]'), $b = body.querySelector('[data-body]'), $p = body.querySelector('[data-panel]');
      const nFilters = () => !!f.q + (f.site !== 'All') + (f.service !== 'All') + !!f.from + !!f.to;

      const list = () => {
        const q = f.q.toLowerCase();
        const L = D.EXPENSES.filter((e) => inPer(e)
          && (!q || (e.comment || '').toLowerCase().includes(q) || siteOf(e).toLowerCase().includes(q) || e.service.toLowerCase().includes(q))
          && (f.site === 'All' || siteOf(e) === f.site) && (f.service === 'All' || e.service === f.service)
          && (!f.from || new Date(e.date) >= new Date(f.from)) && (!f.to || new Date(e.date) <= new Date(f.to)));
        const key = { date: (e) => e.date, site: (e) => siteOf(e).toLowerCase(), service: (e) => e.service.toLowerCase(), comment: (e) => (e.comment || '').toLowerCase(), amount: (e) => +e.amount || 0 }[sort.k];
        const s = sort.dir === 'asc' ? 1 : -1;
        return L.sort((a, b) => { const x = key(a), y = key(b); return x < y ? -s : x > y ? s : 0; });
      };

      function renderHead(L) {
        $h.innerHTML = `${!canEdit() ? '<span class="badge" style="--c:var(--danger)">Lecture seule</span>' : ''}
          <div class="fix-tot"><span class="label">Total période</span><b data-total>${amountFr(L.reduce((s, e) => s + (+e.amount || 0), 0))}</b></div>
          ${canEdit() ? `<button class="btn primary fix-new" data-new>${GX.icon('plus', 'sm')}<span class="lbl">Nouvelle dépense</span></button>` : ''}`;
        $h.querySelector('[data-new]')?.addEventListener('click', () => openForm());
      }
      function renderFilters() {
        const siteLbl = f.site === 'All' ? 'Tous sites' : f.site, svcLbl = f.service === 'All' ? 'Tous services' : f.service;
        $f.innerHTML = `<label class="search">${GX.icon('search', 'sm')}<input data-q placeholder="Rechercher…" aria-label="Rechercher" value="${esc(f.q)}" /></label>
          ${per() !== 'Tout le réseau' ? `<button class="chip" data-peri data-tip="Périmètre global — barre de menus">${GX.icon(GX.ctx.site ? 'lock' : 'pin', 'sm')}${esc(per())}</button>` : ''}
          ${GX.ui.pickerBtn('data-site', 'pin', siteLbl, f.site !== 'All')}
          ${GX.ui.pickerBtn('data-svc', 'layers', svcLbl, f.service !== 'All')}
          <span class="fix-il">Du</span><input type="date" data-from value="${f.from}" aria-label="Du" />
          <span class="fix-il">Au</span><input type="date" data-to value="${f.to}" aria-label="Au" />
          ${nFilters() ? `<button class="btn sm ghost" data-reset>${GX.icon('refresh', 'sm')}Réinitialiser</button>` : ''}
          <span class="fix-cnt" data-cnt></span>`;
        $f.querySelector('[data-peri]')?.addEventListener('click', () => document.getElementById('mbPeri')?.click());
        $f.querySelector('[data-q]').oninput = (e) => { const had = !!f.q; f.q = e.target.value; if (had !== !!f.q) { renderFilters(); const i = $f.querySelector('[data-q]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } refresh(); };
        // Filtres MONO comme FixedExpenses.tsx : site (TOUS SITES, GROUPE BONY, sites des plaques) et service
        $f.querySelector('[data-site]').onclick = (e) => GX.ui.pick(e.currentTarget, [{ items: [{ v: 'All', l: 'Tous sites' }, { v: 'GROUPE BONY', l: 'GROUPE BONY' }] },
          ...Object.entries(D.PLAQUES).map(([pl, ss]) => ({ label: pl, items: ss.map((s) => ({ v: s, l: s })) }))], { multi: false, search: true, selected: [f.site], title: 'Site', width: 280, onChange: ([v]) => { f.site = v || 'All'; renderFilters(); refresh(); } });
        $f.querySelector('[data-svc]').onclick = (e) => GX.ui.pick(e.currentTarget, [{ items: [{ v: 'All', l: 'Tous services' }, ...SERVICES.map((s) => ({ v: s, l: s, color: SVC_HEX[s] }))] }], { multi: false, selected: [f.service], title: 'Service', onChange: ([v]) => { f.service = v || 'All'; renderFilters(); refresh(); } });
        $f.querySelector('[data-from]').onchange = (e) => { f.from = e.target.value; renderFilters(); refresh(); };
        $f.querySelector('[data-to]').onchange = (e) => { f.to = e.target.value; renderFilters(); refresh(); };
        $f.querySelector('[data-reset]')?.addEventListener('click', () => { Object.assign(f, { q: '', site: 'All', service: 'All', from: '', to: '' }); renderFilters(); refresh(); });
      }
      const svcBadge = (s) => `<span class="fix-b svc" style="--c:${SVC_HEX[s] || '#6b6880'}">${esc(s)}</span>`;
      const acts = (e) => (canEdit() ? `<span class="fix-act"><button class="icon-btn sm" data-act="edit" data-tip="Modifier" aria-label="Modifier">${GX.icon('edit', 'sm')}</button><button class="icon-btn sm del" data-act="del" data-tip="Supprimer" aria-label="Supprimer">${GX.icon('trash', 'sm')}</button></span>` : '');
      function rowHTML(e) {
        return `<tr data-id="${e.id}" class="${flashId === e.id ? 'fix-flash' : ''} ${form?.id === e.id ? 'cur' : ''}">
          <td><span class="fix-dt">${dateFr(e.date)}</span>${e.annual ? '<span class="fix-b an" style="margin-left:8px">Annuelle</span>' : ''}</td>
          <td><span class="fix-b site" data-tip="${esc(siteOf(e))}">${esc(siteOf(e))}</span></td>
          <td>${svcBadge(e.service)}</td>
          <td>${e.proPlus ? '<span class="fix-b pro">PRO+</span>' : ''}${esc(e.comment || '')}</td>
          <td class="r"><span class="fix-amt">${amountFr(e.amount)}</span></td>
          <td class="r">${acts(e)}</td></tr>`;
      }
      function cardHTML(e) {
        return `<article class="card fix-mc ${flashId === e.id ? 'fix-flash' : ''}" data-id="${e.id}"><div class="top"><span class="fix-dt">${dateFr(e.date)}</span>${e.annual ? '<span class="fix-b an">Annuelle</span>' : ''}<span class="grow"></span><span class="fix-amt">${amountFr(e.amount)}</span></div>
          <div class="meta"><span>${esc(siteOf(e))}</span><span>·</span><span>${esc(e.service)}</span>${e.proPlus ? '<span class="grow"></span><span class="fix-b pro" style="margin:0">PRO+</span>' : ''}</div>
          ${e.comment ? `<div class="cm">${esc(e.comment)}</div>` : ''}${canEdit() ? `<div class="acts">${acts(e).replace('fix-act', 'fix-act" style="opacity:1')}</div>` : ''}</article>`;
      }
      function refresh() {
        const L = list(), sc = $b.querySelector('.fix-scroll')?.scrollTop || 0;
        renderHead(L);
        const cnt = $f.querySelector('[data-cnt]'); if (cnt) cnt.textContent = `${L.length} dépense${L.length > 1 ? 's' : ''}`;
        const th = (k, l, cls = '') => `<th class="${cls}" data-sort="${k}">${l}${sort.k === k ? `<span class="ar">${GX.icon(sort.dir === 'asc' ? 'arrowup' : 'arrowdown', 'sm')}</span>` : ''}</th>`;
        const empty = `<div class="empty fix-empty">${GX.icon('search')}Aucune dépense fixe trouvée.</div>`;
        $b.innerHTML = `<div class="card fix-card"><div class="fix-scroll" tabindex="0" aria-label="Dépenses"><table class="fix-t"><thead><tr>${th('date', 'Date')}${th('site', 'Site / plaque')}${th('service', 'Service')}${th('comment', 'Commentaire')}${th('amount', 'Montant (€)', 'r')}<th class="r" style="width:90px">Actions</th></tr></thead>
            <tbody>${L.length ? L.map(rowHTML).join('') : `<tr><td colspan="6">${empty}</td></tr>`}</tbody></table></div>
          <div class="fix-cards">${L.length ? L.map(cardHTML).join('') : empty}</div></div>`;
        const s2 = $b.querySelector('.fix-scroll'); s2.scrollTop = sc; flashId = null;
        $b.querySelectorAll('th[data-sort]').forEach((t) => (t.onclick = () => { if (sort.k === t.dataset.sort) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc'; else { sort.k = t.dataset.sort; sort.dir = 'desc'; } refresh(); }));
        $b.querySelectorAll('[data-id]').forEach((el) => {
          const e = D.EXPENSES.find((x) => x.id === el.dataset.id); if (!e) return;
          el.querySelector('[data-act=edit]')?.addEventListener('click', () => openForm(e));
          el.querySelector('[data-act=del]')?.addEventListener('click', () => askDelete(e));
          el.ondblclick = () => canEdit() && openForm(e);
          el.oncontextmenu = (ev) => { if (!canEdit()) return; ev.preventDefault(); GX.menu.open([{ header: e.comment || 'Dépense fixe' }, { label: 'Modifier…', icon: 'edit', action: () => openForm(e) }, '-', { label: 'Supprimer…', icon: 'trash', action: () => askDelete(e) }], { x: ev.clientX, y: ev.clientY }); };
        });
      }
      function changed() { selfEmit = true; GX.emit('data:expenses'); selfEmit = false; refresh(); }
      function askDelete(e) {
        win.sheet(`<h3>Supprimer la dépense</h3><p class="muted" style="margin:8px 0 0">Êtes-vous sûr de vouloir supprimer cette dépense ?</p><p style="margin:10px 0 0;font-weight:600">${esc(e.comment || siteOf(e) || 'Dépense fixe')} · ${amountFr(e.amount)}</p>
          <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" style="background:var(--danger)">Supprimer</button></div>`, {
          width: 420, onClose: (v) => { if (v !== 'ok') return; const i = D.EXPENSES.indexOf(e); if (i < 0) return; D.EXPENSES.splice(i, 1); if (form?.id === e.id) closeForm(); changed(); GX.shell?.hud?.('Dépense supprimée'); } });
      }

      /* ---------------- Panneau latéral de saisie ---------------- */
      function closeForm() {
        if (!form) return; const el = $p.querySelector('.fix-panel'); const sc = $p.querySelector('.fix-scrim'); form = null;
        if (el) { el.classList.add('out'); sc?.remove(); setTimeout(() => { if (!form) $p.innerHTML = ''; }, 180); }
        refresh();
      }
      function openForm(src) {
        if (!canEdit()) return GX.shell?.hud?.('Lecture seule : création et modification réservées aux éditeurs');
        const edit = !!src;
        let d;
        if (src) {
          d = { ...structuredClone(src), brands: [...brandsOf(src)] };
          const g = GROUPS.find((x) => x === src.site || (src.sites || []).includes(x));
          if (g && !src.distribution) Object.assign(d, { site: g, sites: Object.keys(DIST[g]), distribution: { ...DIST[g] } });
          d.site = siteOf(d); d.distribution = d.distribution || Object.fromEntries(d.sites.map((s) => [s, 100 / d.sites.length]));
        } else d = { date: GX.iso(GX.today()), service: 'VN', site: 'Clermont', sites: ['Clermont'], distribution: { Clermont: 100 }, amount: 0, comment: '', brands: [], annual: false, proPlus: false, alpineShare: null, nissanShare: null };
        let mode = '%';
        form = { id: src?.id || null };
        const svg = (n) => GX.icon(n, 'sm');
        $p.innerHTML = `<div class="fix-scrim" data-scrim></div><aside class="fix-panel" role="dialog" aria-label="${edit ? 'Modifier la dépense' : 'Nouvelle dépense fixe'}">
          <div class="fix-ph"><span class="ic" style="--c:${edit ? '#5b8cff' : 'var(--accent)'}">${svg(edit ? 'edit' : 'plus')}</span><h2 class="grow">${edit ? 'Modifier la dépense' : 'Nouvelle dépense fixe'}</h2><button class="icon-btn" data-close aria-label="Fermer" data-tip="Fermer (Échap)">${GX.icon('close')}</button></div>
          <div class="fix-pb">
            <div class="fix-2"><div class="fix-fld"><span class="label">Date *</span><div data-datew><input type="date" data-k="date" value="${d.date || ''}" aria-label="Date" /></div></div>
              <div class="fix-fld"><span class="label">Imputation</span><div class="seg" data-k="annual"><button data-v="0" aria-pressed="${!d.annual}" title="Montant imputé sur le seul mois de la date choisie.">Ponctuelle</button><button data-v="1" aria-pressed="${!!d.annual}" title="Montant total réparti sur les 12 mois de l'année (calcul au Budget uniquement).">Annuelle</button></div></div></div>
            <span class="fix-hint" data-annhint></span>
            <div class="fix-2"><div class="fix-fld"><span class="label">Montant *</span><div class="fix-amtin"><input type="number" class="input" data-k="amount" step="0.01" value="${d.amount ?? ''}" placeholder="0.00" aria-label="Montant" /><span>€</span></div></div>
              <div class="fix-fld"><span class="label">Service *</span><select class="select" data-k="service" aria-label="Service">${SERVICES.map((s) => `<option value="${s}" ${d.service === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>
            <div class="fix-fld"><span class="label">Site / plaque *</span><div data-sitew></div><span class="fix-note">GROUPE BONY (global) · GROUPE BONY (R/N) · sites par plaque · sites Nissan</span></div>
            <div class="fix-fld"><span class="label">Marque(s) — routage budgétaire</span><div class="fix-brands" data-brands></div><span class="fix-note" data-bnote></span></div>
            <div data-shares style="display:contents"></div>
            <div data-dist></div>
            <div class="fix-fld"><span class="label">Commentaire</span><textarea class="textarea" data-k="comment" placeholder="Description de la dépense...">${esc(d.comment || '')}</textarea></div>
            <label class="fix-pro"><input type="checkbox" data-k="proPlus" ${d.proPlus ? 'checked' : ''} />Type client : PRO+ (B2B)</label>
          </div>
          <div class="fix-pf"><span class="fix-err" data-err></span><button class="btn" data-close>Annuler</button><button class="btn primary" data-save>Enregistrer</button></div></aside>`;
        const P = $p.querySelector('.fix-panel'), $ = (q) => P.querySelector(q);
        refresh();

        const isGroup = () => GROUPS.includes(d.site);
        const hasRdm = () => d.brands.some((b) => RDM.includes(b));
        function renderDate() {
          $('[data-datew]').classList.toggle('fix-dis', !!d.annual);
          $('[data-annhint]').textContent = d.annual && d.date ? `Réparti sur toute l'année ${new Date(d.date).getFullYear()} (montant total ci-contre).` : '';
          $('[data-annhint]').style.display = d.annual && d.date ? '' : 'none';
        }
        function renderSites() {
          $('[data-sitew]').innerHTML = `<button class="picker-btn fix-sitebtn" data-sitebtn><span class="v">${esc(d.site || 'Sélectionner...')}</span>${GX.icon('chevdown', 'sm')}</button>`;
          $('[data-sitebtn]').onclick = (ev) => {
            const cur = isGroup() ? [d.site === 'GROUPE BONY' ? 'GROUPE BONY (GLOBAL)' : d.site] : [...d.sites];
            GX.ui.sitePicker(ev.currentTarget, cur, (vals) => {
              const v = vals.map((s) => (s === 'GROUPE BONY (GLOBAL)' ? 'GROUPE BONY' : s)), prev = cur.map((s) => (s === 'GROUPE BONY (GLOBAL)' ? 'GROUPE BONY' : s));
              const added = v.filter((s) => !prev.includes(s)), g = added.find((s) => GROUPS.includes(s));
              if (g) { setSites(g, Object.keys(DIST[g]), { ...DIST[g] }); return GX.ui.closePick(); }          // updateSiteSelection('GROUPE BONY…')
              const ss = isGroup() ? added : v.filter((s) => !GROUPS.includes(s));                                // quitter un mode groupe repart de zéro
              setSites(ss.length === 1 ? ss[0] : ss.join(', '), ss, ss.length ? Object.fromEntries(ss.map((s) => [s, 100 / ss.length])) : {});
              if (prev.some((s) => GROUPS.includes(s))) GX.ui.closePick();
            }, { variant: 'project', title: 'Site / plaque' });
          };
        }
        function setSites(site, sites, dist) {
          d.site = site; d.sites = sites; d.distribution = dist;
          d.brands = d.brands.filter((b) => brandAvail(d.sites, b));
          renderSites(); renderBrands(); renderDyn(); check();
        }
        function renderBrands() {
          const aOk = brandAvail(d.sites, 'Alpine'), nOk = brandAvail(d.sites, 'Nissan');
          $('[data-brands]').innerHTML = BRANDS.map((b) => { const ok = brandAvail(d.sites, b), on = d.brands.includes(b); return `<button class="chip" data-brand="${b}" aria-pressed="${on}" style="--bg:${BRAND_BG[b][0]};--fg:${BRAND_BG[b][1]}" ${ok ? '' : `disabled data-tip="${b} : aucun site éligible"`}>${b}</button>`; }).join('');
          $('[data-bnote]').textContent = !aOk && !nOk ? 'Sélectionnez un site Alpine ou Nissan pour activer ces marques.' : 'Holding est exclusif et n’est imputé à aucun budget.';
          $('[data-brands]').querySelectorAll('[data-brand]').forEach((btn) => (btn.onclick = () => {
            const b = btn.dataset.brand, on = d.brands.includes(b);
            d.brands = b === 'Holding' ? (on ? [] : ['Holding']) : on ? d.brands.filter((x) => x !== b) : [...d.brands.filter((x) => x !== 'Holding'), b];
            renderBrands(); renderDyn();
          }));
        }
        function renderDyn() {
          // Curseurs part marque / compte RDM : seulement sur une dépense mixte (marque RDM présente), défaut 100
          const cur = hasRdm() ? [['Alpine', 'alpineShare'], ['Nissan', 'nissanShare']].filter(([b]) => d.brands.includes(b)) : [];
          $('[data-shares]').innerHTML = cur.map(([b, k]) => { const v = d[k] ?? 100; return `<div class="fix-share"><div class="row"><span class="label">Part ${b} (%)</span><b data-shv="${k}">${v} % → ${b} · ${100 - v} % → compte RDM</b></div><input type="range" min="0" max="100" value="${v}" data-share="${k}" data-b="${b}" aria-label="Part ${b}" style="--p:${v}%" /></div>`; }).join('')
            + (cur.length === 2 ? '<span class="fix-note" style="margin-top:-8px">Alpine + Nissan + RDM : Alpine passe avant, la part Nissan est ignorée au calcul du budget.</span>' : '');
          $('[data-shares]').querySelectorAll('[data-share]').forEach((r) => (r.oninput = () => { const k = r.dataset.share, b = r.dataset.b; d[k] = +r.value; $(`[data-shv="${k}"]`).textContent = `${r.value} % → ${b} · ${100 - r.value} % → compte RDM`; }));
          renderDist();
        }
        function renderDist() {
          const w = $('[data-dist]');
          if (!(d.sites.length > 1)) { w.innerHTML = ''; return; }
          const base = +d.amount || 0, fixedDist = isGroup(), euro = mode === '€', euroOff = fixedDist || !(base > 0);
          w.innerHTML = `<div class="fix-dist"><div class="hd"><span class="label">Répartition budgétaire${fixedDist ? ' · verrouillée' : ''}</span><div class="seg" data-mode><button data-v="%" aria-pressed="${!euro}">%</button><button data-v="€" aria-pressed="${euro}">€</button></div></div>
            ${d.sites.map((s) => { const pct = d.distribution[s] || 0, amt = Math.round(base * (pct / 100)); return `<div class="fix-drow"><span class="n" data-tip="${esc(s)}">${esc(s)}</span>
              <input class="input num" type="number" ${euro ? '' : 'min="0" max="100"'} data-ds="${esc(s)}" value="${euro ? amt : Number(pct.toFixed(2))}" ${(euro ? euroOff : fixedDist) ? 'disabled' : ''} /><span class="u">${euro ? '€' : '%'}</span>
              <span class="alt" data-alt="${esc(s)}">${euro ? `${Number(pct.toFixed(1))} %` : amountFr(amt)}</span></div>`; }).join('')}
            ${euro && !(base > 0) ? '<span class="fix-note" style="color:var(--warn)">Montant = 0 € : saisie en € indisponible (utilisez le mode %).</span>' : ''}
            <div class="fix-dtot" data-dtot></div></div>`;
          w.querySelector('[data-mode]').addEventListener('change', (e) => { mode = e.detail; setTimeout(renderDist, 140); });
          w.querySelectorAll('[data-ds]').forEach((inp) => (inp.oninput = () => {
            const s = inp.dataset.ds, v = +inp.value || 0;
            d.distribution[s] = mode === '€' ? (base > 0 ? (v / base) * 100 : 0) : v;
            const pct = d.distribution[s]; w.querySelector(`[data-alt="${CSS.escape(s)}"]`).textContent = mode === '€' ? `${Number(pct.toFixed(1))} %` : amountFr(Math.round(base * (pct / 100)));
            distTotal();
          }));
          distTotal();
        }
        function distTotal() {
          const el = $('[data-dtot]'); if (!el) return;
          const t = Object.values(d.distribution).reduce((a, b) => a + b, 0);
          el.style.color = Math.abs(t - 100) < 0.01 ? 'var(--ok)' : 'var(--danger)';
          el.textContent = `Total : ${Math.round(t)} %`;
        }
        function check() {
          const ok = !!d.date && d.amount !== '' && d.amount !== null && d.amount !== undefined && !isNaN(Number(d.amount)) && !!d.site && !!d.service;
          $('[data-err]').textContent = ok ? '' : 'Veuillez remplir tous les champs obligatoires (Date, Montant, Site, Service)';
          return ok;
        }

        $('[data-k=date]').onchange = (e) => { d.date = e.target.value; renderDate(); check(); };
        $('[data-k=amount]').oninput = (e) => { d.amount = e.target.value === '' ? '' : Number(e.target.value); renderDist(); check(); };
        $('[data-k=service]').onchange = (e) => { d.service = e.target.value; };
        $('[data-k=comment]').oninput = (e) => { d.comment = e.target.value; };
        $('[data-k=proPlus]').onchange = (e) => { d.proPlus = e.target.checked; };
        $('[data-k=annual]').addEventListener('change', (e) => { d.annual = e.detail === '1'; renderDate(); });
        P.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeForm));
        $p.querySelector('[data-scrim]').onclick = closeForm;
        P.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeForm(); } });
        $('[data-save]').onclick = () => {
          if (!check()) return GX.animate($('[data-err]'), [{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { spring: 'snappy' });
          const out = { date: d.date, annual: !!d.annual, amount: Number(d.amount) || 0, site: d.site, sites: [...d.sites], distribution: { ...d.distribution }, service: d.service,
            brands: [...d.brands], brand: d.brands[0], comment: d.comment || '', proPlus: !!d.proPlus, alpineShare: d.alpineShare ?? null, nissanShare: d.nissanShare ?? null };
          let e = src && D.EXPENSES.find((x) => x.id === src.id);
          if (e) Object.assign(e, out); else { e = { id: GX.uid('e'), ...out }; D.EXPENSES.unshift(e); }
          flashId = e.id; form = null; $p.innerHTML = ''; changed();
          GX.shell?.hud?.(edit ? 'Dépense modifiée' : 'Dépense enregistrée');
          requestAnimationFrame(() => $b.querySelector(`tr[data-id="${e.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
        };
        renderDate(); renderSites(); renderBrands(); renderDyn(); check();
        setTimeout(() => $('[data-k=amount]')?.focus(), 80);
      }

      renderFilters(); refresh();
      win.setTitle('Dépenses');
      const off = [GX.on('ctx', () => { if (form && !canEdit()) { form = null; $p.innerHTML = ''; } renderFilters(); refresh(); }), GX.on('data:expenses', () => { if (!selfEmit) refresh(); })];
      return {
        destroy: () => off.forEach((o) => o()),
        command: (c) => { if (c === 'expense' || c === 'new-expense') openForm(); if (c?.startsWith?.('edit:')) { const e = D.EXPENSES.find((x) => x.id === c.slice(5)); if (e) { flashId = e.id; openForm(e); } } },
        menus: () => ({
          'Fichier': [{ label: 'Nouvelle dépense…', icon: 'plus', disabled: !canEdit(), action: () => openForm() }, { label: 'Exporter vers Excel…', icon: 'export', disabled: !GX.shell?.canOpen?.('export'), action: () => GX.wm.open('export') }],
          'Présentation': [{ header: 'Trier par' }, ...[['date', 'Date'], ['site', 'Site / plaque'], ['service', 'Service'], ['comment', 'Commentaire'], ['amount', 'Montant']].map(([k, l]) => ({ label: l, checked: sort.k === k, action: () => { if (sort.k === k) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc'; else { sort.k = k; sort.dir = 'desc'; } refresh(); } })), '-',
            { label: 'Réinitialiser les filtres', icon: 'refresh', disabled: !nFilters(), action: () => { Object.assign(f, { q: '', site: 'All', service: 'All', from: '', to: '' }); renderFilters(); refresh(); } }],
        }),
      };
    },
  });
})();
