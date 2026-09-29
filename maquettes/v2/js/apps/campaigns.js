/* =====================================================================
   Rubrique « Campagnes » (miroir de pages/Campaigns.tsx) — v2.1
   Une campagne = une TÂCHE de projet au canal SMS ou E-mail (projets
   brouillons exclus), datée par la DATE DE DÉBUT DU PROJET (parentStartDate,
   comme Gearbox). Période unique (GX.ui.dateRange + ‹ ›) qui pilote
   graphiques ET liste. Filtres Liste en une ligne, tous MONO comme dans
   Gearbox : Canal (Tout / E-mail / SMS), Plaque / Site (plaque ★ ou site),
   Marque (une seule ; un élément Holding reste visible, règle de Gearbox).
   Tableau éditable en ligne : chaque saisie recalcule les graphiques ; filtres en
   carte repliable (« Filtres liste »), vue carte en lecture seule sous 720 px.
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt;
  const EDIT = ['Master', 'Administrator', 'Director', 'Coordinator'];
  const BRANDS = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize'];     // Holding exclue des choix (Campaigns.tsx)
  const PCT = ['openRate', 'npai', 'stop', 'clickRate'];
  const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const MAIL = 'var(--bony-orange)', SMS = 'var(--info)';
  /* Camembert « Facturé / Svc » : couleurs exactes de PIE_COLORS (Campaigns.tsx) */
  const PIE = { VN: '#f75632', VO: '#8f12ab', APV: '#293f74', PR: '#06b6d4' };

  GX.css(`
  .cmp-h .ah-t{min-width:0;flex:0 1 auto}.cmp-h .ah-t .sub{overflow:hidden;text-overflow:ellipsis}
  @container app (max-width:520px){.cmp-h .ah-t .sub{display:none}}
  .cmp-root{flex:1;min-height:0;display:flex;flex-direction:column;gap:20px;padding:4px 22px 22px;overflow:auto}
  .cmp-charts{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:20px;flex:none;overflow:hidden}
  .cmp-card{padding:18px 20px 14px;min-width:0}
  .cmp-card h3{font-family:var(--font-display);font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:center;gap:8px;margin-bottom:10px;min-height:28px}
  .cmp-card h3 svg{color:var(--c,var(--accent))}
  .cmp-card h3 .seg{font-family:var(--font-ui);letter-spacing:0;text-transform:none}
  .cmp-card h3 .faint{font-family:var(--font-ui);letter-spacing:0;text-transform:none}
  .cmp-saving{font-size:10.5px;font-weight:800;letter-spacing:.12em;color:var(--accent);display:inline-flex;align-items:center;gap:6px;animation:cmp-blink .9s steps(2,jump-none) infinite}
  .cmp-saving::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
  @keyframes cmp-blink{50%{opacity:.25}}
  .cmp-fsep{margin:0 2px}
  .cmp-eur{position:relative;display:inline-block}.cmp-eur::after{content:"€";position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--text-3);pointer-events:none}
  .cmp-eur .cmp-in{padding-right:20px}
  .cmp-cards{display:none;flex-direction:column;gap:10px}
  .cmp-mc{padding:14px 16px;border-radius:12px;background:var(--surface-2);box-shadow:inset 3px 0 0 var(--c),inset 0 0 0 1px var(--line-2);display:grid;gap:6px;cursor:pointer}
  .cmp-mc .top{display:flex;align-items:center;justify-content:space-between;font-size:12.5px;font-weight:800}
  .cmp-mc .nm{font-size:14.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cmp-mc .kv{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--text-2)}
  .cmp-mc .kv b{color:var(--text);font-weight:700}
  .cmp-card h3 .seg,.cmp-card h3 .faint{margin-left:auto}
  .cmp-card h3 .faint{font-weight:500;font-size:12px}
  .cmp-donut{display:flex;align-items:center;gap:14px}
  .cmp-donut .gxleg{font-size:12.5px}
  .cmp-list{flex:1;min-height:220px;display:flex;flex-direction:column;overflow:hidden}
  .cmp-tscroll{flex:1;min-height:0;overflow:auto;scrollbar-width:thin}
  .cmp-tbl{font-size:13.5px}
  .cmp-tbl th{background:var(--surface-2);z-index:3}
  .cmp-tbl td{height:44px;padding:0 10px}
  .cmp-tbl td.in{padding:0 4px 0 6px}
  .cmp-tbl tbody tr:nth-child(even){background:color-mix(in srgb,var(--surface-3) 30%,transparent)}
  .cmp-tbl tbody tr:hover{background:color-mix(in srgb,var(--accent) 7%,var(--surface-2))}
  .cmp-tbl th.s{cursor:pointer;user-select:none}.cmp-tbl th.s:hover{color:var(--text)}
  .cmp-tbl .dt{font-weight:700;font-variant-numeric:tabular-nums}
  .cmp-tbl .ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;flex:none;color:var(--c);background:color-mix(in srgb,var(--c) 18%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 35%,transparent)}
  .cmp-tbl .cp{display:flex;align-items:center;gap:10px;min-width:280px;max-width:440px}
  .cmp-tbl .pn{font-weight:700;font-size:14px;cursor:pointer;line-height:1.2}
  .cmp-tbl .pn:hover{color:var(--accent)}
  .cmp-tbl .l2{display:flex;align-items:center;gap:4px;margin-top:2px;min-width:0}
  .cmp-tbl .l2 .tn{color:var(--text-2);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;margin-right:2px}
  .cmp-tbl .l2 .badge{height:18px;font-size:11px;padding:0 6px;flex:none}
  .cmp-tbl .site{background:var(--surface-3);color:var(--text-2);box-shadow:inset 0 0 0 1px var(--line-2)}
  .cmp-in{height:30px;width:74px;border:0;outline:0;background:transparent;border-radius:7px;padding:0 6px;font:inherit;text-align:right;font-variant-numeric:tabular-nums;transition:background var(--t-fast),box-shadow var(--t-fast);-moz-appearance:textfield}
  .cmp-in::-webkit-outer-spin-button,.cmp-in::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
  .cmp-in.w{width:92px}.cmp-in.t{width:84px;text-align:left}
  .cmp-tbl tr:hover .cmp-in:not(:disabled){background:var(--surface-1);box-shadow:inset 0 0 0 1px var(--line-2)}
  .cmp-in:not(:disabled):hover{box-shadow:inset 0 0 0 1px var(--line-3)!important}
  .cmp-in:focus{background:var(--surface-1)!important;box-shadow:inset 0 0 0 1px var(--accent),0 0 0 3px var(--focus)!important}
  .cmp-in::placeholder{color:var(--text-3)}
  .cmp-in:disabled{color:var(--text)}
  .cmp-in.bad{box-shadow:inset 0 0 0 1px var(--danger)!important}

  .cmp-canal button[data-v="E-mail"][aria-pressed="true"]{color:var(--bony-orange)}
  .cmp-canal button[data-v="SMS"][aria-pressed="true"]{color:var(--info)}
  .cmp-nav{display:inline-flex;align-items:center;gap:2px}
  .cmp-nav .icon-btn{width:26px;height:30px}
  .cmp-n{font-size:12.5px;font-weight:700;color:var(--text-2);white-space:nowrap}
  .cmp-live{animation:cmp-live .6s var(--ease-out)}
  @keyframes cmp-live{from{filter:brightness(1.4)}}
  @container app (max-width:1080px){.cmp-charts{grid-template-columns:1fr 1fr}.cmp-charts>.cmp-card:nth-child(2){grid-column:1/-1;order:3}}
  @container app (max-width:720px){.cmp-root{overflow:auto;padding:4px 10px 14px;gap:14px}.cmp-charts{grid-template-columns:1fr;gap:14px}.cmp-charts>.cmp-card:nth-child(2){grid-column:auto}
    .cmp-list{display:none}.cmp-cards{display:flex}.cmp-fq{flex:1 1 100%}.cmp-fq .search{width:100% !important}.cmp-fsep{display:none}}
  @container app (max-width:460px){.cmp-donut{flex-wrap:wrap}}
  `);

  /* ---------------- Période ---------------- */
  const pd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const lastDay = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const monthSpan = (a, b) => (a.getDate() === 1 && b.getDate() === lastDay(b) ? (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1 : 0);
  function perLabel(from, to) {
    const a = pd(from), b = pd(to), n = monthSpan(a, b);
    if (n === 12 && a.getMonth() === 0) return String(a.getFullYear());
    if (n === 6 && a.getMonth() % 6 === 0) return `S${a.getMonth() < 6 ? 1 : 2} ${a.getFullYear()}`;
    if (n === 3 && a.getMonth() % 3 === 0) return `T${a.getMonth() / 3 + 1} ${a.getFullYear()}`;
    if (n === 1) { const s = a.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return s[0].toUpperCase() + s.slice(1); }
    return GX.ui.periodLabel(from, to);
  }
  function shift(P, dir) {
    const a = pd(P.from), b = pd(P.to), n = monthSpan(a, b);
    if (n) { P.from = GX.iso(new Date(a.getFullYear(), a.getMonth() + dir * n, 1)); P.to = GX.iso(new Date(b.getFullYear(), b.getMonth() + dir * n + 1, 0)); }
    else { const len = Math.round((b - a) / 864e5) + 1; P.from = GX.iso(GX.addDays(a, dir * len)); P.to = GX.iso(GX.addDays(b, dir * len)); }
  }
  function buckets(a, b) {
    const days = Math.round((b - a) / 864e5) + 1, out = [];
    if (days <= 31) for (let i = 0; i < days; i++) { const d = GX.addDays(a, i); out.push({ l: days <= 7 ? F.day(d) + ' ' + d.getDate() : String(d.getDate()), s: GX.iso(d), e: GX.iso(d) }); }
    else if (days <= 120) for (let d = new Date(a); d <= b; d = GX.addDays(d, 7)) { const e = GX.addDays(d, 6); out.push({ l: F.date(d).replace('.', ''), s: GX.iso(d), e: GX.iso(e > b ? b : e) }); }
    else for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d <= b; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) { const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); out.push({ l: MONTHS[d.getMonth()], s: GX.iso(d < a ? a : d), e: GX.iso(e > b ? b : e) }); }
    return out;
  }
  const per = () => GX.ctx.site || GX.ctx.perimetre || 'Tout le réseau';
  const inPer = (p) => { const x = per(); if (x === 'Tout le réseau') return true; if (x === 'Nissan') return p.brands.includes('Nissan'); return p.sites.includes(x); };
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  /* Courbe de pourcentages (les périodes sans campagne restent vides, pas à 0) */
  function pctLine(labels, vals, color, H) {
    const W = 600, pl = 40, pb = 20, pt = 8, iw = W - pl - 10, ih = H - pt - pb, bw = iw / labels.length;
    const x = (i) => pl + i * bw + bw / 2, y = (v) => pt + ih - (v / 100) * ih;
    const grid = [0, 50, 100].map((v) => `<line x1="${pl}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" /><text x="${pl - 6}" y="${y(v) + 3}" text-anchor="end" font-size="11" fill="var(--text-3)">${v} %</text>`).join('');
    const segs = []; let cur = [];
    vals.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(v), v, i]); }); if (cur.length) segs.push(cur);
    const path = segs.map((s) => s.map(([px, py], k) => `${k ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')).join(' ');
    const area = segs.filter((s) => s.length > 1).map((s) => `M${s[0][0].toFixed(1)},${y(0)} ` + s.map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join(' ') + ` L${s[s.length - 1][0].toFixed(1)},${y(0)} Z`).join(' ');
    const step = Math.ceil(labels.length / 12);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;overflow:visible">
      <defs><linearGradient id="cmpA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#cmpA)" />
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" style="animation:ch-draw 900ms var(--ease-out) both" />
      ${segs.flat().map(([px, py, v, i]) => `<circle cx="${px}" cy="${py}" r="3.2" fill="var(--surface-1)" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" data-tip="${GX.esc(labels[i])} : ${v.toFixed(1)} %" />`).join('')}
      ${labels.map((l, i) => (i % step ? '' : `<text x="${x(i)}" y="${H - 5}" text-anchor="middle" font-size="11" fill="var(--text-3)">${GX.esc(l)}</text>`)).join('')}
      ${segs.length ? '' : `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="12" fill="var(--text-3)">Aucune donnée renseignée</text>`}</svg>`;
  }
  const intFmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
  const volFmt = (v) => (v >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k' : String(Math.round(v)));
  const CH = 128;   // hauteur des graphiques (compacts)

  GX.registerApp({
    id: 'campaigns', name: 'Campagnes', icon: 'campaigns', tint: ['#ff8a3d', '#f75632'], size: [1180, 740], minSize: [360, 320],
    mount(body, win) {
      const Y = new Date().getFullYear();
      const P = { from: `${Y}-01-01`, to: `${Y}-12-31` };
      const fl = { q: '', canal: '', zone: '', brand: '' };        // zone : '' | plaque | site (mono, comme Gearbox)
      let showA = GX.store.get('cmp.analyse', true), showF = GX.store.get('cmp.filtres', true), perf = 'vol', dir = -1, selfEmit = false, chT = 0, saveT = 0;
      const saving = () => { const s = body.querySelector('[data-saving]'); if (!s) return; s.classList.remove('hide'); clearTimeout(saveT); saveT = setTimeout(() => s.classList.add('hide'), 900); };
      const allowed = () => (D.ACCESS[GX.ctx.role] || []).includes('campaigns');
      const canEdit = () => EDIT.includes(GX.ctx.role) && !GX.ctx.readOnly;

      const rowsAll = () => {
        const q = fl.q.trim().toLowerCase();
        const zone = !fl.zone ? null : D.PLAQUES[fl.zone] || [fl.zone];
        return D.PROJECTS.filter((p) => p.status !== 'Draft' && inPer(p) && p.startDate >= P.from && p.startDate <= P.to
            && (!fl.brand || p.brands.includes(fl.brand) || p.brands.includes('Holding')) && (!zone || p.sites.some((x) => zone.includes(x))))
          .flatMap((p) => p.tasks.filter((t) => (t.channel === 'SMS' || t.channel === 'E-mail') && (!fl.canal || t.channel === fl.canal)
            && (!q || `${t.name} ${p.name}`.toLowerCase().includes(q))).map((t) => ({ t, p })))
          .sort((x, y) => dir * x.p.startDate.localeCompare(y.p.startDate) || x.p.name.localeCompare(y.p.name));
      };
      const nFilters = () => [fl.canal, fl.zone, fl.brand, fl.q.trim()].filter(Boolean).length;

      function renderAll() {
        if (!allowed()) { body.innerHTML = `<div class="app"><div class="empty" style="height:100%">${GX.icon('lock')}<b style="color:var(--text);font-size:16px">Accès restreint</b>Votre rôle n’a pas accès aux Campagnes.</div></div>`; return; }
        body.innerHTML = `<div class="app">
          <div class="app-head cmp-h"><div class="ah-t"><h1>Campagnes</h1><span class="sub">Performance SMS &amp; E-mailing <span class="cmp-saving hide" data-saving>ENREGISTREMENT...</span></span></div><div class="ah-f" data-hf></div></div>
          <div class="app-head2 ${showF ? '' : 'hide'}" data-h2></div>
          <div class="cmp-root">
            <div class="cmp-charts ${showA ? '' : 'hide'}" data-charts></div>
            <div class="card cmp-list"><div class="cmp-tscroll" data-table></div></div>
            <div class="cmp-cards" data-cards></div>
          </div></div>`;
        renderHead(); renderH2(); refresh();
      }
      function renderHead() {
        const h = body.querySelector('[data-hf]');
        h.innerHTML = `${per() !== 'Tout le réseau' ? `<button class="chip" data-peri data-tip="Périmètre global — barre de menus">${GX.icon(GX.ctx.site ? 'lock' : 'pin', 'sm')}${GX.esc(per())}</button>` : ''}
          <span class="cmp-nav"><button class="icon-btn" data-nav="-1" data-tip="Période précédente">${GX.icon('back', 'sm')}</button>${GX.ui.pickerBtn('data-per', 'agenda', perLabel(P.from, P.to), P.from !== `${Y}-01-01` || P.to !== `${Y}-12-31`)}<button class="icon-btn" data-nav="1" data-tip="Période suivante">${GX.icon('chevron', 'sm')}</button></span>
          <button class="btn sm" data-analyse data-tip="${showA ? 'Masquer les graphiques pour gagner de la place' : 'Afficher les graphiques d’analyse'}">${GX.icon('barchart', 'sm')}${showA ? 'Masquer l’analyse' : 'Afficher l’analyse'}</button>
          <button class="btn sm ${showF ? 'primary' : ''}" data-ftog>${GX.icon(showF ? 'close' : 'filter', 'sm')}Filtres liste${nFilters() ? ` <span class="count">${nFilters()}</span>` : ''}</button>`;
        h.querySelector('[data-ftog]').onclick = toggleFilters;
        h.querySelector('[data-peri]')?.addEventListener('click', () => document.getElementById('mbPeri')?.click());
        h.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => { shift(P, +b.dataset.nav); renderHead(); refresh(); }));
        h.querySelector('[data-per]').onclick = (e) => GX.ui.dateRange(e.currentTarget, { from: P.from, to: P.to }, ({ from, to }) => { if (from && to && from <= to) { P.from = from; P.to = to; renderHead(); refresh(); } });
        h.querySelector('[data-analyse]').onclick = toggleAnalyse;
      }
      function renderH2() {
        const h = body.querySelector('[data-h2]');
        const zl = fl.zone ? (D.PLAQUES[fl.zone] ? '★ ' + fl.zone : fl.zone) : 'Tout le réseau';
        h.innerHTML = `<div class="cmp-fq"><span class="label">Recherche</span><label class="search" style="width:260px">${GX.icon('search', 'sm')}<input data-q placeholder="Filtrer la liste..." value="${GX.esc(fl.q)}" /></label></div>
          <span class="cmp-fsep"></span>
          <div><span class="label">Canal</span><div class="seg cmp-canal" data-canal>${[['', 'Tout'], ['E-mail', 'E-mail'], ['SMS', 'SMS']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${fl.canal === v}">${l}</button>`).join('')}</div></div>
          <div><span class="label">Plaque / Site</span>${GX.ui.pickerBtn('data-zone', 'pin', zl, !!fl.zone)}</div>
          <div><span class="label">Marque</span>${GX.ui.pickerBtn('data-brand', 'tag', fl.brand || 'Toutes marques', !!fl.brand)}</div>
          <button class="btn sm ghost" data-rall style="align-self:flex-end" data-tip="Filtres, période (année en cours) et tri (plus récentes d’abord)">${GX.icon('refresh', 'sm')}Réinitialiser tout</button>
          <span class="grow"></span>${canEdit() ? '' : '<span class="badge" style="--c:var(--text-3);align-self:center">Lecture seule</span>'}<span class="cmp-n num" data-n style="align-self:center"></span>`;
        const syncHead = () => { const b = body.querySelector('[data-ftog] .count'), n = nFilters(); if (b ? b.textContent !== String(n) : n) renderHead(); };
        const q = h.querySelector('[data-q]'); q.oninput = () => { fl.q = q.value; refresh(); syncHead(); };
        h.querySelector('[data-canal]').addEventListener('change', (e) => { fl.canal = e.detail; refresh(); syncHead(); });
        h.querySelector('[data-zone]').onclick = (e) => GX.ui.pick(e.currentTarget, [
          { items: [{ v: '', l: 'Tout le réseau' }] },
          { label: 'Plaques', items: Object.keys(D.PLAQUES).map((pl) => ({ v: pl, l: '★ ' + pl, hint: D.PLAQUES[pl].length + ' sites' })) },
          ...Object.entries(D.PLAQUES).map(([pl, ss]) => ({ label: pl, collapsible: true, items: ss.map((s) => ({ v: s, l: s })) })),
        ], { multi: false, selected: [fl.zone], title: 'Plaque / Site', width: 290, onChange: ([v]) => { fl.zone = v || ''; renderH2(); renderHead(); refresh(); } });
        h.querySelector('[data-brand]').onclick = (e) => GX.ui.pick(e.currentTarget, [{ items: [{ v: '', l: 'Toutes marques' }, ...BRANDS.map((b) => ({ v: b, l: b, color: D.brand(b).hex }))] }],
          { multi: false, selected: [fl.brand], title: 'Marque', onChange: ([v]) => { fl.brand = v || ''; renderH2(); renderHead(); refresh(); } });
        /* « RÉINITIALISER TOUT » (Campaigns.tsx) : filtres + période = année en cours + tri décroissant */
        h.querySelector('[data-rall]').onclick = () => { Object.assign(fl, { q: '', canal: '', zone: '', brand: '' }); Object.assign(P, { from: `${Y}-01-01`, to: `${Y}-12-31` }); dir = -1; renderHead(); renderH2(); refresh(); };
      }
      function toggleFilters() {
        showF = !showF; GX.store.set('cmp.filtres', showF);
        const h = body.querySelector('[data-h2]');
        if (showF) { h.classList.remove('hide'); GX.animate(h, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { spring: 'snappy' }); setTimeout(() => h.querySelector('[data-q]')?.focus(), 60); }
        else h.classList.add('hide');
        renderHead();
      }
      function toggleAnalyse() {
        showA = !showA; GX.store.set('cmp.analyse', showA);
        const c = body.querySelector('[data-charts]');
        if (showA) { c.classList.remove('hide'); renderCharts(); const h = c.scrollHeight; GX.animate(c, [{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { spring: 'snappy' }); }
        else { const h = c.offsetHeight; GX.animate(c, [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { spring: 'snappy' }).onfinish = () => { if (!showA) c.classList.add('hide'); }; }
        renderHead();
      }

      /* ---------- Graphiques (compacts) ---------- */
      function renderCharts(rows = rowsAll()) {
        const c = body.querySelector('[data-charts]'); if (!c || !showA) return;
        const bk = buckets(pd(P.from), pd(P.to)), labels = bk.map((b) => b.l);
        const inB = (b) => rows.filter(({ p }) => p.startDate >= b.s && p.startDate <= b.e);
        const pk = { vol: 'volume', open: 'openRate', click: 'clickRate' }[perf];
        const perfHTML = perf === 'vol'
          ? GX.chart.bars({ labels, series: [{ name: 'Volume', values: bk.map((b) => inB(b).reduce((s, { t }) => s + (+t.volume || 0), 0)), color: 'var(--bony-violet)' }], height: CH, fmt: volFmt })
          : pctLine(labels, bk.map((b) => avg(inB(b).map(({ t }) => t[pk]).filter((v) => v != null && v !== ''))), 'var(--bony-violet)', CH);
        /* Règle exacte de Campaigns.tsx : montant = facturé, à défaut coût ; service = le 1er du
           projet ; « Tous Services » réparti en 4 parts égales VN / VO / APV / PR */
        const svc = { VN: 0, VO: 0, APV: 0, PR: 0 };
        rows.forEach(({ t, p }) => { const amt = +t.billed || +t.cost || 0, s = (p.services && p.services[0]) || 'Tous Services';
          if (s === 'Tous Services') Object.keys(svc).forEach((k) => (svc[k] += amt / 4)); else if (s in svc) svc[s] += amt; });
        const parts = Object.keys(svc).map((s) => ({ label: s, value: Math.round(svc[s]), color: PIE[s] })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value), billed = parts.reduce((a, x) => a + x.value, 0);
        c.innerHTML = `<div class="card cmp-card" style="--c:var(--bony-orange)"><h3>${GX.icon('campaigns', 'sm')}Nb Campagnes<span class="faint num">${rows.length} au total</span></h3>${GX.chart.bars({ labels, series: [{ name: 'Campagnes', values: bk.map((b) => inB(b).length), color: 'var(--bony-orange)' }], height: CH, fmt: intFmt })}</div>
          <div class="card cmp-card" style="--c:var(--bony-violet)"><h3>${GX.icon('barchart', 'sm')}Performance<div class="seg" data-perf>${[['vol', 'Volume'], ['open', 'Ouverture'], ['click', 'Clics']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${perf === k}">${l}</button>`).join('')}</div></h3>${perfHTML}</div>
          <div class="card cmp-card" style="--c:var(--info)"><h3>${GX.icon('euro', 'sm')}Facturé / Svc<span class="faint">« Tous Services » réparti</span></h3>${parts.length ? `<div class="cmp-donut">${GX.chart.donut({ parts, center: F.eurK(billed), sub: 'facturés', size: 116 })}<div class="grow gxleg" style="min-width:140px">${GX.chart.legend(parts, F.eur)}</div></div>` : '<div class="empty" style="padding:24px">Aucune donnée</div>'}</div>`;
        c.querySelector('[data-perf]').addEventListener('change', (e) => { perf = e.detail; setTimeout(() => renderCharts(), 170); });
      }

      /* ---------- Tableau ---------- */
      const cellIn = (t, k, cls, dis) => {
        const v = t[k], isT = k === 'codTxt';
        /* placeholders de Campaigns.tsx : Vol. / Factu « 0 », taux « - », COD « Code... » */
        const ph = isT ? 'Code...' : PCT.includes(k) ? '-' : '0';
        const inp = `<input class="cmp-in ${cls}" ${isT ? 'type="text"' : `type="number" inputmode="decimal" min="0" ${PCT.includes(k) ? 'max="100" step="0.1"' : 'step="1"'}`} data-k="${k}" value="${v == null ? '' : GX.esc(v)}" placeholder="${ph}" ${dis ? 'disabled' : ''} aria-label="${k}" />`;
        return k === 'billed' ? `<span class="cmp-eur">${inp}</span>` : inp;
      };
      const siteOf = (p) => (GX.ctx.site ? GX.ctx.site : p.sites[0] + (p.sites.length > 1 ? ` +${p.sites.length - 1}` : ''));
      const pctTxt = (v) => (v == null || v === '' ? '-' : String(v).replace('.', ',') + ' %');
      /* Vue carte en fenêtre étroite / mobile : lecture seule, comme la vue « md:hidden » de Campaigns.tsx */
      const cardsHTML = (rows) => rows.map(({ t, p }) => { const mail = t.channel === 'E-mail'; return `<div class="cmp-mc" data-t="${t.id}" data-p="${p.id}" style="--c:${mail ? MAIL : SMS}">
          <div class="top"><span style="color:var(--accent)" class="num">${pd(p.startDate).toLocaleDateString('fr-FR')}</span><span style="color:${mail ? MAIL : SMS}">${GX.icon(mail ? 'mail' : 'sms', 'sm')} ${t.channel}</span></div>
          <div class="nm">${GX.esc(t.name || p.name)}</div>
          <div class="kv"><span>${GX.esc(siteOf(p))}</span>${t.volume != null ? `<span>Vol : <b class="num">${F.n(t.volume)}</b></span>` : ''}${t.cost ? `<span><b class="num">${F.eur(t.cost)}</b></span>` : ''}${t.openRate != null ? `<span>Ouv. <b class="num">${pctTxt(t.openRate)}</b></span>` : ''}${t.billed != null ? `<span>Factu <b class="num">${F.eur(t.billed)}</b></span>` : ''}</div>
          <div class="row wrap" style="gap:4px">${GX.r.brandChips(p.brands)}</div></div>`; }).join('');
      function refresh() {
        if (!allowed()) return;
        const rows = rowsAll(), host = body.querySelector('[data-table]'), cards = body.querySelector('[data-cards]'), dis = !canEdit();
        body.querySelector('[data-n]').textContent = `${rows.length} résultat${rows.length > 1 ? 's' : ''}`;
        const empty = `<div class="empty">${GX.icon('campaigns')}<b style="color:var(--text)">Aucune campagne trouvée</b>Ajoutez des tâches « SMS » ou « E-mail » dans vos projets.</div>`;
        host.innerHTML = rows.length ? `<table class="tbl cmp-tbl"><thead><tr><th class="s" data-sort data-tip="Date de début du projet">Date <span style="display:inline-block;vertical-align:-2px;transition:transform var(--t-med);transform:rotate(${dir > 0 ? 180 : 0}deg)">${GX.icon('chevdown', 'sm')}</span></th><th>Campagne / Projet</th><th class="r">Coût</th><th class="r">Vol.</th><th class="r">Ouv. %</th><th class="r">NPAI %</th><th class="r">STOP %</th><th class="r">Clics %</th><th>COD TXT</th><th class="r">Factu €</th></tr></thead>
          <tbody>${rows.map(({ t, p }) => { const mail = t.channel === 'E-mail'; return `<tr data-t="${t.id}" data-p="${p.id}">
            <td class="dt">${pd(p.startDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</td>
            <td><div class="cp"><span class="ic" style="--c:${mail ? MAIL : SMS}" data-tip="${t.channel}">${GX.icon(mail ? 'mail' : 'sms', 'sm')}</span><div style="min-width:0;flex:1"><div class="pn ellipsis" data-open data-tip="${GX.esc(p.name)}">${GX.esc(p.name)}</div>
              <div class="l2"><span class="tn" data-tip="${GX.esc(t.name)}">${GX.esc(t.name)}</span><span class="badge site">${GX.esc(siteOf(p))}</span>${GX.r.brandChips(p.brands)}</div></div></div></td>
            <td class="r num muted" style="white-space:nowrap">${F.n(t.cost || 0)} €</td><td class="r in">${cellIn(t, 'volume', 'w', dis)}</td>${PCT.map((k) => `<td class="r in">${cellIn(t, k, '', dis)}</td>`).join('')}<td class="in">${cellIn(t, 'codTxt', 't', dis)}</td><td class="r in">${cellIn(t, 'billed', 'w', dis)}</td></tr>`; }).join('')}</tbody></table>`
          : empty;
        cards.innerHTML = rows.length ? cardsHTML(rows) : empty;
        cards.querySelectorAll('.cmp-mc').forEach((c) => (c.onclick = () => { const p = D.project(c.dataset.p); GX.wm.open('project', { id: p.id, title: p.name }, { origin: c }); }));
        host.querySelector('[data-sort]')?.addEventListener('click', () => { dir *= -1; refresh(); });
        host.querySelectorAll('tbody tr').forEach((tr) => {
          const p = D.project(tr.dataset.p), t = p.tasks.find((x) => x.id === tr.dataset.t);
          tr.querySelector('[data-open]').onclick = (e) => GX.wm.open('project', { id: p.id, title: p.name }, { origin: e.currentTarget });
          tr.querySelectorAll('[data-k]').forEach((inp) => {
            const k = inp.dataset.k;
            inp.addEventListener('focus', () => inp.select?.());
            inp.addEventListener('input', () => {
              if (k === 'codTxt') t[k] = inp.value.trim() || null;
              else if (inp.value === '') t[k] = null;                        // vide = non renseigné (jamais 0)
              else { let v = +inp.value; if (PCT.includes(k)) { inp.classList.toggle('bad', v < 0 || v > 100); v = Math.max(0, Math.min(100, v)); } else v = Math.max(0, v); t[k] = v; }
              liveUpdate();
            });
            inp.addEventListener('change', () => { inp.classList.remove('bad'); inp.value = t[k] == null ? '' : t[k]; saving(); selfEmit = true; GX.emit('data:projects'); selfEmit = false; });
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); const next = e.key === 'Enter' ? tr.nextElementSibling?.querySelector(`[data-k="${k}"]`) : null; next ? next.focus() : inp.blur(); } });
          });
        });
        renderCharts(rows);
      }
      function liveUpdate() {
        clearTimeout(chT);
        chT = setTimeout(() => {
          renderCharts(rowsAll());
          body.querySelectorAll('[data-charts] .cmp-card').forEach((c) => { c.classList.remove('cmp-live'); void c.offsetWidth; c.classList.add('cmp-live'); });
        }, 140);
      }

      renderAll();
      win.setTitle('Campagnes');
      const busy = () => body.contains(document.activeElement) && document.activeElement.matches('input');
      const off = [GX.on('ctx', renderAll), GX.on('data:projects', () => { if (!selfEmit && !busy()) refresh(); })];
      const setPer = (k) => {
        const t = GX.today(), y = t.getFullYear(), m = t.getMonth(), dow = (t.getDay() + 6) % 7;
        const R = { week: [GX.addDays(t, -dow), GX.addDays(t, 6 - dow)], month: [new Date(y, m, 1), new Date(y, m + 1, 0)], quarter: [new Date(y, m - (m % 3), 1), new Date(y, m - (m % 3) + 3, 0)],
          semester: [new Date(y, m < 6 ? 0 : 6, 1), new Date(y, m < 6 ? 6 : 12, 0)], year: [new Date(y, 0, 1), new Date(y, 11, 31)] }[k];
        P.from = GX.iso(R[0]); P.to = GX.iso(R[1]); renderHead(); refresh();
      };
      return {
        destroy: () => { clearTimeout(chT); clearTimeout(saveT); off.forEach((o) => o()); },
        command: (c) => { if (c === 'filters') body.querySelector('[data-q]')?.focus(); },
        menus: () => ({
          'Présentation': [{ label: showA ? 'Masquer l’analyse' : 'Afficher l’analyse', icon: 'barchart', action: toggleAnalyse }, '-',
            { header: 'Période' }, ...[['week', 'Cette semaine'], ['month', 'Ce mois'], ['quarter', 'Ce trimestre'], ['semester', 'Ce semestre'], ['year', 'Cette année']].map(([k, l]) => ({ label: l, action: () => setPer(k) })),
            { label: 'Personnalisé…', icon: 'agenda', action: () => body.querySelector('[data-per]')?.click() }, '-',
            { label: 'Date : plus récentes d’abord', checked: dir < 0, action: () => { dir = -1; refresh(); } }, { label: 'Date : plus anciennes d’abord', checked: dir > 0, action: () => { dir = 1; refresh(); } }],
        }),
      };
    },
  });
})();
