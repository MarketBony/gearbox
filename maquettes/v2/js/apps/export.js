/* =====================================================================
   Rubrique « Export » — Export Excel (miroir de pages/Export.tsx)
   - Réservé Master, Administrator, Director, Coordinator (EXPORT_ALLOWED_ROLES),
     sinon écran « Accès restreint » avec le texte réel.
   - Un seul réglage : la période, en deux dates « Du » / « Au » (défaut : année
     en cours ; « Au » ne peut précéder « Du » et suit « Du » s'il le dépasse).
   - GEARBOX_Export_<du>_<au>.xlsx, 2 onglets : Projets (filtrés sur la date de
     début, brouillons exclus, sans tâches, 13 colonnes) et Dépenses (filtrées
     sur leur date, 7 colonnes). Messages réels : succès « Export généré avec
     succès. », info « Aucune donnée… », erreur de dates.
   - Modèle UX : en-tête, période dans la carte de filtres, cartes à gros chiffres,
     aperçu façon tableur (onglets en bas) pleine largeur, CSV de démonstration.
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt;
  const ALLOWED = ['Master', 'Administrator', 'Director', 'Coordinator'];
  const COLS = {
    Projets: ['Nom', 'Site(s)', 'Marque(s)', 'Service(s)', 'Type', 'Statut', 'PRO+', 'Date début', 'Date fin', 'Budget prévisionnel', 'Budget réalisé', 'Avancement (%)', 'Description'],
    Dépenses: ['Date', 'Site(s)', 'Marque(s)', 'Service', 'Commentaire', 'Montant', 'PRO+'],
  };
  const MONEY = new Set(['Budget prévisionnel', 'Budget réalisé', 'Montant']);
  const NUM = new Set([...MONEY, 'Avancement (%)']);
  const WIDE = { Nom: 200, Description: 320, Commentaire: 220, 'Site(s)': 150 };

  GX.css(`
  .exp-h .ah-t{min-width:0;flex:1 1 auto}
  .exp-f .input[type="date"]{width:170px;height:36px}
  .exp-f .exp-note{font-size:13px;color:var(--text-2);line-height:1.45;max-width:520px;align-self:center}
  .exp-f .exp-note b{color:var(--text)}
  .exp-err{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--danger);align-self:center}
  .exp{flex:1;min-height:0;display:flex;flex-direction:column;padding:0 22px 18px;gap:18px}
  .exp-cards{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr) minmax(0,1fr);gap:20px;flex:none}
  .exp-card{background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-lg);padding:20px 22px;display:flex;flex-direction:column;gap:12px;min-width:0}
  .exp-card h2{font-family:var(--font-display);font-size:14px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;display:flex;align-items:center;gap:8px;color:var(--text)}
  .exp-card h2 svg.i{color:var(--accent)}
  .exp-book{display:flex;align-items:center;gap:16px;min-width:0}
  .exp-doc{width:54px;height:64px;border-radius:9px 20px 9px 9px;position:relative;display:grid;place-items:end center;padding-bottom:9px;color:#fff;flex:none;
    background:linear-gradient(160deg,color-mix(in srgb,var(--ok) 85%,#fff 15%),color-mix(in srgb,var(--ok) 70%,#000 30%));box-shadow:0 10px 26px -12px color-mix(in srgb,var(--ok) 80%,transparent)}
  .exp-doc b{font-size:11.5px;letter-spacing:.06em}
  .exp-doc::after{content:"";position:absolute;right:0;top:0;width:16px;height:16px;border-radius:0 20px 0 8px;background:rgba(255,255,255,.35)}
  .exp-fname{font-weight:700;font-size:14.5px;overflow-wrap:anywhere}
  .exp-tabsum{display:flex;gap:8px;flex-wrap:wrap}
  .exp-tabsum span{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:8px;background:var(--surface-3);font-size:12.5px;font-weight:600;color:var(--text-2)}
  .exp-tabsum span b{color:var(--text)}
  .exp-big{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .exp-big div{display:grid;gap:2px}
  .exp-big b{font-size:34px;font-weight:800;letter-spacing:-.03em;line-height:1.05;font-variant-numeric:tabular-nums}
  .exp-big span{font-size:12.5px;color:var(--text-2);font-weight:600}
  .exp-sum{font-size:13px;color:var(--text-2)}
  .exp-msg{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:12px;font-size:13.5px;line-height:1.45}
  .exp-msg svg.i{flex:none;margin-top:1px}
  .exp-msg.ok{background:color-mix(in srgb,var(--ok) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ok) 35%,transparent);color:var(--text)}
  .exp-msg.ok svg.i{color:var(--ok)}
  .exp-msg.info{background:color-mix(in srgb,var(--warn) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--warn) 35%,transparent)}
  .exp-msg.info svg.i{color:var(--warn)}
  .exp-msg.err{background:color-mix(in srgb,var(--danger) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--danger) 35%,transparent)}
  .exp-msg.err svg.i{color:var(--danger)}
  .exp-prog{width:100%;height:6px;border-radius:99px;background:var(--surface-3);overflow:hidden}
  .exp-prog i{display:block;height:100%;width:0;border-radius:inherit;background:var(--bony-grad);transition:width 120ms linear}
  .exp-prev{flex:1;min-height:260px;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;background:var(--surface-2);transition:opacity var(--t-med)}
  .exp-prev.stale{opacity:.45;pointer-events:none}
  .exp-prev .empty{flex:1}
  .exp-fx{display:flex;align-items:center;height:32px;border-bottom:1px solid var(--line);font-size:12.5px;background:var(--surface-1)}
  .exp-fx .ref{width:70px;padding:0 10px;font-weight:700;border-right:1px solid var(--line);height:100%;display:flex;align-items:center}
  .exp-fx .fx{padding:0 10px;color:var(--text-3);font-style:italic;font-family:Georgia,serif;border-right:1px solid var(--line);height:100%;display:flex;align-items:center}
  .exp-fx .val{padding:0 10px;min-width:0}
  .exp-grid{flex:1;min-height:0;outline:0}
  .exp-grid table{border-collapse:separate;border-spacing:0;font-size:12.5px;table-layout:fixed}
  .exp-grid th{position:sticky;top:0;z-index:2;height:24px;background:var(--surface-3);color:var(--text-2);font-weight:600;font-size:11.5px;border-right:1px solid var(--line);border-bottom:1px solid var(--line-2);text-align:center}
  .exp-grid tbody th{position:sticky;left:0;z-index:1;width:40px;min-width:40px;text-align:center;border-bottom:1px solid var(--line)}
  .exp-grid thead th:first-child{left:0;z-index:3;width:40px}
  .exp-grid th.on{color:var(--ok);background:color-mix(in srgb,var(--ok) 16%,var(--surface-3))}
  .exp-grid td{height:26px;padding:0 8px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--surface-1);cursor:cell}
  .exp-grid tbody tr:nth-child(odd):not(.h) td{background:color-mix(in srgb,var(--surface-2) 55%,var(--surface-1))}
  .exp-grid tr.h td{font-weight:700;color:#fff;background:#293f74;box-shadow:inset 0 -2px 0 #f75632;text-align:center}
  .exp-grid td.n{text-align:right;font-variant-numeric:tabular-nums}
  .exp-grid td.sel{box-shadow:inset 0 0 0 2px var(--ok);position:relative}
  .exp-tabs{display:flex;align-items:stretch;gap:2px;height:34px;padding:0 8px;border-top:1px solid var(--line);background:var(--surface-1);font-size:12.5px}
  .exp-tabs button{padding:0 14px;font-weight:600;color:var(--text-2);border-radius:0 0 8px 8px;transition:background var(--t-fast),color var(--t-fast)}
  .exp-tabs button:hover{background:var(--surface-3)}
  .exp-tabs button.on{color:var(--ok);background:var(--surface-2);box-shadow:inset 0 2px 0 var(--ok)}
  .exp-tabs .faint{margin-left:auto;align-self:center}
  .exp-deny{height:100%;display:grid;place-content:center;justify-items:center;text-align:center;gap:10px;padding:30px;color:var(--text-2)}
  .exp-deny .lk{width:64px;height:64px;border-radius:20px;display:grid;place-items:center;background:var(--surface-3);color:var(--text-3)}
  @container app (max-width:1000px){.exp-cards{grid-template-columns:1fr 1fr}.exp-cards .exp-card:first-child{grid-column:1 / -1}}
  @container app (max-width:720px){.exp{padding:0 10px 12px;gap:12px}.exp-cards{grid-template-columns:1fr;gap:12px}.exp-card{padding:16px}.exp-f .input[type="date"]{width:100%}.exp-f > div{flex:1 1 140px}.exp-f .exp-note{flex:1 1 100%}.exp-prev{min-height:300px}}
  @container app (max-width:520px){.exp-h .ah-t .sub{display:none}.exp-h .ah-f .btn{padding:0 10px}}
  `);

  const dfr = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  function build(du, au) {
    const P = D.PROJECTS.filter((p) => p.status !== 'Draft' && p.startDate && p.startDate >= du && p.startDate <= au).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const E = D.EXPENSES.filter((e) => e.date && e.date >= du && e.date <= au).sort((a, b) => a.date.localeCompare(b.date));
    return {
      Projets: P.map((p) => [p.name, (p.sites || []).join(', '), (p.brands || []).join(', '), (p.services || []).join(', '), p.type || '', D.PROJECT_STATUS[p.status]?.l || p.status, p.proPlus ? 'Oui' : 'Non', dfr(p.startDate), p.endDate ? dfr(p.endDate) : '', p.budgetPlanned || 0, D.projectActual(p) || 0, D.projectProgress(p) || 0, p.description || '']),
      Dépenses: E.map((e) => [dfr(e.date), (e.sites || []).join(', '), (e.brands || []).join(', '), e.service || '', e.comment || '', e.amount || 0, e.proPlus ? 'Oui' : 'Non']),
    };
  }
  const colL = (i) => String.fromCharCode(65 + i);
  const fmtCell = (col, v) => (MONEY.has(col) ? F.eur(v) : col === 'Avancement (%)' ? v + ' %' : v);
  const plural = (n, s) => `${n} ${s}${n > 1 ? 's' : ''}`;

  GX.registerApp({
    id: 'export', name: 'Export', icon: 'export', tint: ['#22b573', '#146c43'], size: [1080, 680], minSize: [360, 320],
    mount(body, win) {
      const Y = new Date().getFullYear();
      let du = `${Y}-01-01`, au = `${Y}-12-31`, data = null, gen = null, sheet = 'Projets', selC = [1, 0], raf = 0, stale = false, busy = false, msg = null;
      const allowed = () => ALLOWED.includes(GX.ctx.role);
      const fname = (a = du, b = au) => `GEARBOX_Export_${a || 'debut'}_${b || 'fin'}.xlsx`;
      const $ = (q) => body.querySelector(q);
      const bad = () => (du && au && du > au ? 'La date de début doit précéder la date de fin.' : '');

      function render() {
        cancelAnimationFrame(raf); busy = false;
        if (!allowed()) {
          body.innerHTML = `<div class="app"><div class="exp-deny"><span class="lk">${GX.icon('lock', 'lg')}</span><h2 style="font-size:18px;color:var(--text)">Accès restreint</h2><div style="max-width:380px;font-size:13.5px">L’export des données est réservé aux rôles de gestion (Master, Administrateur, Directeur, Coordinateur).</div><div class="faint" style="font-size:12.5px">Rôle actuel : ${GX.esc(D.ROLES[GX.ctx.role]?.l || GX.ctx.role)}</div></div></div>`;
          win.setTitle('Export Excel'); return;
        }
        body.innerHTML = `<div class="app"><div class="app-head exp-h"><div class="ah-t"><h1>Export Excel</h1><span class="sub">Projets et dépenses fixes sur une période, au format .xlsx</span></div>
            <div class="ah-f"><button class="btn primary" data-gen>${GX.icon('download', 'sm')}<span data-genl>Générer le fichier Excel</span></button></div></div>
          <div class="app-head2 exp-f">
            <div><span class="label">Du</span><input type="date" class="input" data-du value="${du}" /></div>
            <div><span class="label">Au</span><input type="date" class="input" data-au value="${au}" min="${du}" /></div>
            <div class="exp-f-sep"></div>
            <div class="exp-note" data-note></div>
          </div>
          <div class="exp scroll">
            <section class="exp-cards">
              <article class="exp-card"><h2>${GX.icon('export', 'sm')}Classeur</h2>
                <div class="exp-book"><span class="exp-doc"><b>XLSX</b></span><div style="min-width:0;display:grid;gap:8px"><div class="exp-fname" data-fname></div>
                  <div class="exp-tabsum"><span>Projets <b>${COLS.Projets.length} col.</b></span><span>Dépenses <b>${COLS.Dépenses.length} col.</b></span></div></div></div>
                <div class="exp-sum">En-têtes à la charte, filtre automatique, montants sommables. Les tâches des projets ne sont pas exportées.</div></article>
              <article class="exp-card"><h2>${GX.icon('agenda', 'sm')}Sur la période</h2><div class="exp-big" data-big></div><div class="exp-sum" data-per></div></article>
              <article class="exp-card"><h2>${GX.icon('check', 'sm')}Résultat</h2><div data-status></div></article>
            </section>
            <section class="exp-prev ${stale ? 'stale' : ''}" data-prev></section>
          </div></div>`;
        const onDates = () => {
          const i1 = $('[data-du]'), i2 = $('[data-au]');
          du = i1.value; if (du && au && du > au) { au = du; i2.value = au; }       // comme DatePicker : « Au » suit « Du »
          au = i2.value; i2.min = du || '';
          msg = null; if (data && !stale) { stale = true; $('[data-prev]')?.classList.add('stale'); }
          refresh();
        };
        $('[data-du]').addEventListener('change', onDates);
        $('[data-au]').addEventListener('change', onDates);
        $('[data-gen]').onclick = generate;
        refresh();
        renderSheet();
        win.setTitle('Export Excel', data ? sheet : '');
      }
      function refresh() {
        const e = bad(), b = !e ? build(du, au) : { Projets: [], Dépenses: [] };
        $('[data-note]').innerHTML = e ? `<span class="exp-err">${GX.icon('alert', 'sm')}${e}</span>`
          : 'Les <b>projets</b> sont filtrés sur leur date de début, les <b>dépenses</b> sur leur date. Le fichier contient 2 onglets : <em>Projets</em> et <em>Dépenses</em>.';
        $('[data-fname]').textContent = fname();
        $('[data-big]').innerHTML = `<div><b>${b.Projets.length}</b><span>${b.Projets.length > 1 ? 'projets' : 'projet'}</span></div><div><b>${b.Dépenses.length}</b><span>${b.Dépenses.length > 1 ? 'dépenses fixes' : 'dépense fixe'}</span></div>`;
        $('[data-per]').textContent = du && au ? `Du ${F.dateY(du)} au ${F.dateY(au)} · brouillons exclus` : 'Période ouverte · brouillons exclus';
        $('[data-gen]').disabled = busy;
        $('[data-genl]').textContent = data && !stale ? 'Régénérer le fichier Excel' : 'Générer le fichier Excel';
        status();
      }
      function status() {
        const s = $('[data-status]'); if (!s || busy) return;
        if (msg) { s.innerHTML = `<div class="exp-msg ${msg.type === 'error' ? 'err' : 'info'}">${GX.icon('alert', 'sm')}<span>${GX.esc(msg.text)}</span></div>`; return; }
        if (data && !stale) {
          const n = data.Projets.length, m = data.Dépenses.length;
          s.innerHTML = `<div class="exp-msg ok">${GX.icon('check', 'sm')}<div><b>Export généré avec succès.</b><div style="font-size:12.5px;color:var(--text-2);margin-top:2px">${plural(n, 'projet')} · ${plural(m, 'dépense')} fixe${m > 1 ? 's' : ''}.</div></div></div>
            <button class="btn sm" data-dl data-tip="La maquette fournit un CSV de l’onglet affiché ; Gearbox produit le .xlsx">${GX.icon('download', 'sm')}CSV de démo (${GX.esc(sheet)})</button>`;
          s.querySelector('[data-dl]').onclick = download; return;
        }
        s.innerHTML = stale ? `<div class="exp-msg info">${GX.icon('info', 'sm')}<span>Période modifiée : générez à nouveau le fichier.</span></div>`
          : `<div class="exp-sum">Aucun fichier généré pour l’instant. Choisissez la période puis cliquez sur « Générer le fichier Excel ».</div>`;
      }

      function generate() {
        if (busy) return;
        msg = null;
        if (bad()) { msg = { type: 'error', text: bad() }; return status(); }
        busy = true; $('[data-gen]').disabled = true; $('[data-genl]').textContent = 'Génération en cours…';
        const steps = [[0, 'Lecture des projets…'], [.42, 'Lecture des dépenses fixes…'], [.72, 'Mise en forme des onglets…'], [.94, 'Écriture du classeur…']];
        const t0 = performance.now(), dur = GX.eco() ? 400 : 1200;
        $('[data-status]').innerHTML = `<div class="exp-prog"><i></i></div><div class="exp-sum" data-step>${steps[0][1]}</div>`;
        const bar = $('.exp-prog i'), st = $('[data-step]');
        const tick = (t) => {
          const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 2.2);
          if (!bar.isConnected) return;
          bar.style.width = e * 100 + '%'; st.textContent = [...steps].reverse().find(([a]) => e >= a)[1];
          if (k < 1) { raf = requestAnimationFrame(tick); return; }
          busy = false;
          const b = build(du, au);
          if (!b.Projets.length && !b.Dépenses.length) { msg = { type: 'info', text: 'Aucune donnée (projet ou dépense fixe) sur la période sélectionnée.' }; refresh(); return; }
          const first = !data; data = b; gen = { du, au }; stale = false; sheet = data.Projets.length ? 'Projets' : 'Dépenses'; selC = [1, 0];
          render();
          const prev = $('[data-prev]');
          if (prev && first) GX.animate(prev, [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
          GX.shell?.notify?.({ app: 'export', title: 'Export prêt', body: `${fname(gen.du, gen.au)} — ${plural(data.Projets.length, 'projet')} · ${data.Dépenses.length} dépenses fixes`, silent: true });
        };
        raf = requestAnimationFrame(tick);
      }

      /* ---------- Aperçu façon tableur ---------- */
      function renderSheet() {
        const host = $('[data-prev]'); if (!host) return;
        if (!data) { host.innerHTML = `<div class="empty">${GX.icon('grid')}<b style="color:var(--text)">Aperçu du classeur</b>Les onglets Projets et Dépenses s’afficheront ici une fois le fichier généré.</div>`; return; }
        const cols = COLS[sheet], rows = data[sheet];
        host.innerHTML = `<div class="exp-fx"><span class="ref" data-ref></span><span class="fx">fx</span><span class="val ellipsis" data-val></span></div>
          <div class="exp-grid scroll" tabindex="0" data-grid><table><colgroup><col style="width:40px" />${cols.map((c) => `<col style="width:${WIDE[c] || (NUM.has(c) ? 124 : 108)}px" />`).join('')}</colgroup>
            <thead><tr><th></th>${cols.map((_, i) => `<th data-ch="${i}">${colL(i)}</th>`).join('')}</tr></thead>
            <tbody><tr class="h"><th data-rh="0">1</th>${cols.map((c, i) => `<td data-c="${i}" data-r="0">${GX.esc(c)}</td>`).join('')}</tr>
            ${rows.map((r, ri) => `<tr><th data-rh="${ri + 1}">${ri + 2}</th>${r.map((v, i) => `<td class="${NUM.has(cols[i]) ? 'n' : ''}" data-c="${i}" data-r="${ri + 1}">${GX.esc(fmtCell(cols[i], v))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
          <div class="exp-tabs">${Object.keys(COLS).map((s) => `<button class="${s === sheet ? 'on' : ''}" data-tab="${s}">${s}</button>`).join('')}<span class="faint">${plural(rows.length, 'ligne')} · ${F.dateY(gen.du)} → ${F.dateY(gen.au)}</span></div>`;
        host.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => setSheet(b.dataset.tab)));
        const grid = host.querySelector('[data-grid]');
        grid.addEventListener('click', (e) => { const td = e.target.closest('td'); if (td) selectCell(+td.dataset.r, +td.dataset.c); });
        grid.addEventListener('keydown', (e) => {
          const mv = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1], Enter: [1, 0], Tab: [0, e.shiftKey ? -1 : 1] }[e.key]; if (!mv) return;
          e.preventDefault(); selectCell(Math.max(0, Math.min(rows.length, selC[0] + mv[0])), Math.max(0, Math.min(cols.length - 1, selC[1] + mv[1])));
        });
        selectCell(Math.min(selC[0], rows.length), selC[1], false);
      }
      function setSheet(s) { if (!data || sheet === s) return; sheet = s; selC = [1, 0]; renderSheet(); status(); win.setTitle('Export Excel', s); }
      function selectCell(r, c, scroll = true) {
        const host = $('[data-prev]'); if (!host || !data) return;
        const cols = COLS[sheet], rows = data[sheet]; selC = [r, c];
        host.querySelectorAll('td.sel, th.on').forEach((x) => x.classList.remove('sel', 'on'));
        const td = host.querySelector(`td[data-r="${r}"][data-c="${c}"]`); if (!td) return;
        td.classList.add('sel'); host.querySelector(`th[data-ch="${c}"]`)?.classList.add('on'); host.querySelector(`th[data-rh="${r}"]`)?.classList.add('on');
        host.querySelector('[data-ref]').textContent = colL(c) + (r + 1);
        const raw = r === 0 ? cols[c] : rows[r - 1][c];
        host.querySelector('[data-val]').textContent = r > 0 && NUM.has(cols[c]) ? String(raw).replace('.', ',') : raw;
        if (scroll) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      function download() {
        if (!data || stale) return;
        const q = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
        const csv = '﻿' + [COLS[sheet], ...data[sheet].map((r) => r.map((v, i) => (NUM.has(COLS[sheet][i]) ? String(v).replace('.', ',') : v)))].map((r) => r.map(q).join(';')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = `GEARBOX_Export_${gen.du}_${gen.au}_${sheet}.csv`; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        GX.shell?.hud?.(`CSV de démo « ${sheet} » téléchargé`);
      }

      render();
      const onData = () => { if (!allowed() || !$('[data-big]')) return; if (data) { stale = true; $('[data-prev]')?.classList.add('stale'); } refresh(); };
      const off = [GX.on('ctx', render), GX.on('data:projects', onData), GX.on('data:expenses', onData)];
      return {
        destroy: () => { cancelAnimationFrame(raf); off.forEach((o) => o()); },
        command: (c) => { if (c === 'generate' && allowed()) generate(); },
        menus: () => ({
          'Fichier': [{ label: 'Générer le fichier Excel', icon: 'download', disabled: !allowed(), action: generate }, { label: 'Télécharger le CSV de démo', icon: 'download', disabled: !data || stale, action: download }],
          'Présentation': data ? Object.keys(COLS).map((s) => ({ label: 'Onglet ' + s, checked: sheet === s, action: () => setSheet(s) })) : [{ label: 'Générez d’abord le fichier', disabled: true }],
        }),
      };
    },
  });
})();
