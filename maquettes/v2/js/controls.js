/* =====================================================================
   v2.3 — CONTRÔLES CHARTÉS + SOCLE DU MODÈLE UX VALIDÉ
   Toute la maquette en profite sans qu'une rubrique change une ligne :
   - <input type="date"> ouvre le calendrier Gearbox (plus le calendrier natif) ;
   - <select> ouvre le menu de sélection Gearbox (plus la liste native) ;
   - cases à cocher, curseurs, champs date : dessinés à la charte ;
   - en-tête de rubrique (catégorie · grand titre Syncopate · sous-titre),
     panneau de filtres en carte (libellés au-dessus), ambiance orange / violet.
   ===================================================================== */
(() => {
  const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : null);

  /* ---------------- Calendrier ---------------- */
  let cal = null;
  const closeCal = () => { if (!cal) return; const c = cal; cal = null; c.cleanup(); c.el.remove(); };
  GX.ui.closeCalendar = closeCal;
  GX.ui.calendar = (anchor, value, onPick, { min, max, title } = {}) => {
    closeCal();
    const sel = parse(value), T = GX.today ? GX.today() : new Date();
    let view = new Date((sel || T).getFullYear(), (sel || T).getMonth(), 1);
    const lo = parse(min), hi = parse(max);
    const el = document.createElement('div'); el.className = 'gx-datecal glass glass-strong';
    const render = () => {
      const y = view.getFullYear(), m = view.getMonth(), first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < 42; i++) {
        const d = new Date(y, m, 1 - first + i), v = iso(d);
        const off = d.getMonth() !== m, dis = (lo && d < lo) || (hi && d > hi);
        cells.push(`<button type="button" data-d="${v}" class="${off ? 'off' : ''} ${sel && v === iso(sel) ? 'on' : ''} ${v === iso(T) ? 'today' : ''}" ${dis ? 'disabled' : ''}>${d.getDate()}</button>`);
        if (i >= 34 && d.getMonth() !== m && i % 7 === 6) break;
      }
      el.innerHTML = `${title ? `<div class="cal-t">${GX.esc(title)}</div>` : ''}<div class="cal-h"><button type="button" data-nav="-1" aria-label="Mois précédent">${GX.icon('chevleft', 'sm')}</button><b>${MOIS[m]} ${y}</b><button type="button" data-nav="1" aria-label="Mois suivant">${GX.icon('chevright', 'sm')}</button></div>
        <div class="cal-w">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((w) => `<span>${w}</span>`).join('')}</div><div class="cal-g">${cells.join('')}</div>
        <div class="cal-f"><button type="button" data-today>Aujourd’hui</button><span class="grow"></span><button type="button" data-clear>Effacer</button></div>`;
      void days;
    };
    render(); document.body.append(el);
    const r = anchor.getBoundingClientRect();
    const x = Math.max(6, Math.min(r.left, innerWidth - el.offsetWidth - 6)); let yy = r.bottom + 6;
    if (yy + el.offsetHeight > innerHeight - 6) yy = Math.max(6, r.top - el.offsetHeight - 6);
    Object.assign(el.style, { left: x + 'px', top: yy + 'px' });
    el.addEventListener('click', (e) => {
      const n = e.target.closest('[data-nav]'); if (n) { view = new Date(view.getFullYear(), view.getMonth() + +n.dataset.nav, 1); return render(); }
      const d = e.target.closest('[data-d]'); if (d && !d.disabled) { onPick(d.dataset.d); return closeCal(); }
      if (e.target.closest('[data-today]')) { onPick(iso(T)); return closeCal(); }
      if (e.target.closest('[data-clear]')) { onPick(''); return closeCal(); }
    });
    el.addEventListener('wheel', (e) => { e.preventDefault(); view = new Date(view.getFullYear(), view.getMonth() + (e.deltaY > 0 ? 1 : -1), 1); render(); }, { passive: false });
    const away = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeCal(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeCal(); } };
    setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', key, true); });
    cal = { el, cleanup: () => { removeEventListener('pointerdown', away, true); removeEventListener('keydown', key, true); } };
    return el;
  };

  const fire = (inp) => { inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); };

  /* ---------------- <input type="date"> → calendrier Gearbox ---------------- */
  const openDate = (inp) => GX.ui.calendar(inp, inp.value, (v) => { inp.value = v; fire(inp); }, { min: inp.min, max: inp.max });
  document.addEventListener('pointerdown', (e) => {
    const inp = e.target.closest?.('input[type="date"]'); if (!inp || inp.disabled || inp.readOnly) return;
    e.preventDefault(); inp.focus({ preventScroll: true });
    if (cal && cal.el.isConnected) return closeCal();
    openDate(inp);
  }, true);
  document.addEventListener('keydown', (e) => {
    const inp = e.target.closest?.('input[type="date"]'); if (!inp || !['Enter', ' ', 'ArrowDown'].includes(e.key) || (e.key === 'ArrowDown' && !e.altKey)) return;
    e.preventDefault(); openDate(inp);
  }, true);

  /* ---------------- <select> → menu de sélection Gearbox ---------------- */
  document.addEventListener('mousedown', (e) => {
    const s = e.target.closest?.('select'); if (!s || s.disabled || s.multiple || e.button !== 0) return;
    e.preventDefault(); s.focus({ preventScroll: true });
    const groups = []; let loose = [];
    [...s.children].forEach((c) => {
      if (c.tagName === 'OPTGROUP') { if (loose.length) { groups.push({ items: loose }); loose = []; } groups.push({ label: c.label, items: [...c.children].filter((o) => !o.hidden).map((o) => ({ v: o.value, l: o.text, dis: o.disabled })) }); }
      else if (!c.hidden) loose.push({ v: c.value, l: c.text, dis: c.disabled });
    });
    if (loose.length) groups.push({ items: loose });
    groups.forEach((g) => (g.items = g.items.filter((i) => !i.dis)));
    const n = groups.reduce((a, g) => a + g.items.length, 0);
    GX.ui.pick(s, groups, { multi: false, selected: [s.value], width: Math.max(s.offsetWidth, 190), search: n > 10, onChange: ([v]) => { s.value = v; fire(s); } });
  }, true);

  /* ---------------- Curseurs : remplissage en dégradé jusqu'au pouce ---------------- */
  const fill = (r) => { const min = +r.min || 0, max = +r.max || 100; r.style.setProperty('--p', ((+r.value - min) / (max - min || 1)) * 100 + '%'); };
  document.addEventListener('input', (e) => { if (e.target.matches?.('input[type="range"]')) fill(e.target); }, true);

  /* ---------------- Reflet qui suit la souris sur les contrôles en matière ---------------- */
  const GLINT = '.btn, .picker-btn, .chip, .seg, .search, .input, .textarea';
  let gRaf = 0, gEv = null, gEl = null;
  addEventListener('pointermove', (e) => {
    gEv = e; if (gRaf) return;
    gRaf = requestAnimationFrame(() => {
      gRaf = 0; const t = gEv.target.closest?.(GLINT);
      if (gEl && gEl !== t) { gEl.style.removeProperty('--gx'); gEl.style.removeProperty('--gy'); }
      gEl = t; if (!t) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty('--gx', (gEv.clientX - r.left) + 'px'); t.style.setProperty('--gy', (gEv.clientY - r.top) + 'px');
    });
  }, { passive: true });

  /* ---------------- En-tête : la catégorie de la rubrique au-dessus du titre ---------------- */
  const CAT = { dashboard: 'Tableau de bord', projects: 'Gestion de projets', project: 'Gestion de projets', todo: 'Gestion de projets', digital: 'Com digitale', campaigns: 'Com digitale', hello: 'Communauté', conges: 'Communauté', chat: 'Communauté', budget: 'Outils', fixed: 'Outils', material: 'Outils', agenda: 'Outils', export: 'Outils', archives: 'Historique', games: 'Détente', settings: 'Système' };
  const decorate = (root) => {
    root.querySelectorAll?.('input[type="range"]').forEach(fill);
    root.querySelectorAll?.('.win[data-app] .app-head .ah-t').forEach((t) => {
      if (t.querySelector('.ah-eye')) return;
      const id = t.closest('.win').dataset.app, c = CAT[id]; if (!c) return;
      t.insertAdjacentHTML('afterbegin', `<span class="ah-eye">${c}</span>`);
    });
  };
  new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach((n) => n.nodeType === 1 && decorate(n.parentElement || n)); }).observe(document.documentElement, { childList: true, subtree: true });

  GX.css(`
  /* Calendrier */
  .gx-datecal{position:fixed;z-index:21000;width:292px;padding:12px;border-radius:16px;animation:ui-menu var(--t-med) var(--spring-snappy) both;user-select:none}
  .gx-datecal .cal-t{font-weight:700;padding:0 4px 8px}
  .gx-datecal .cal-h{display:flex;align-items:center;gap:6px;padding:0 2px 8px}
  .gx-datecal .cal-h b{flex:1;text-align:center;font-size:14px}
  .gx-datecal .cal-h button{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--surface-3)}
  .gx-datecal .cal-h button:hover{background:var(--surface-4)}
  .gx-datecal .cal-w,.gx-datecal .cal-g{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
  .gx-datecal .cal-w span{font-size:10.5px;font-weight:700;letter-spacing:.08em;color:var(--text-3);text-align:center;padding:4px 0}
  .gx-datecal .cal-g button{height:34px;border-radius:9px;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
  .gx-datecal .cal-g button:hover:not(:disabled){background:var(--surface-3)}
  .gx-datecal .cal-g button.off{color:var(--text-3);opacity:.55}
  .gx-datecal .cal-g button.today{box-shadow:inset 0 0 0 1.5px var(--accent)}
  .gx-datecal .cal-g button.on{background:var(--bony-grad);color:#fff;box-shadow:0 6px 14px -8px var(--accent)}
  .gx-datecal .cal-g button:disabled{opacity:.25;cursor:not-allowed}
  .gx-datecal .cal-f{display:flex;align-items:center;gap:6px;padding-top:10px;margin-top:8px;border-top:1px solid var(--line)}
  .gx-datecal .cal-f button{height:28px;padding:0 11px;border-radius:8px;font-size:12.5px;font-weight:600;background:var(--surface-3)}
  .gx-datecal .cal-f button:hover{background:var(--surface-4)}.gx-datecal .cal-f [data-today]{color:var(--accent)}

  /* Champs natifs dessinés à la charte */
  input[type="date"]{cursor:pointer;color-scheme:dark;font-variant-numeric:tabular-nums}
  :root[data-theme="light"] input[type="date"]{color-scheme:light}
  input[type="date"]::-webkit-calendar-picker-indicator{display:none}
  input[type="date"]:not(.input){height:32px;padding:0 10px;border:0;border-radius:var(--r-sm);background:var(--surface-3);color:var(--text);font:inherit}
  select{cursor:pointer}
  select:not(.select):not([multiple]){appearance:none;height:32px;padding:0 28px 0 10px;border:0;border-radius:var(--r-sm);background:var(--surface-3) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 9px center;color:var(--text);font:inherit;font-weight:600}
  input[type="checkbox"]{appearance:none;-webkit-appearance:none;width:18px;height:18px;margin:0;border-radius:5px;flex:none;background:var(--surface-3);box-shadow:inset 0 0 0 1.5px var(--line-3);display:inline-grid;place-items:center;cursor:pointer;vertical-align:middle;transition:background var(--t-fast),box-shadow var(--t-fast)}
  input[type="checkbox"]:hover{box-shadow:inset 0 0 0 1.5px var(--accent)}
  input[type="checkbox"]:checked{background:var(--bony-grad);box-shadow:0 4px 10px -6px var(--accent)}
  input[type="checkbox"]:checked::after{content:"";width:9px;height:5px;border:solid #fff;border-width:0 0 2px 2px;transform:translateY(-1px) rotate(-45deg)}
  input[type="checkbox"]:focus-visible{outline:none;box-shadow:inset 0 0 0 1.5px var(--accent),0 0 0 3px var(--focus)}
  input[type="range"]{appearance:none;-webkit-appearance:none;height:6px;border-radius:3px;cursor:pointer;background:linear-gradient(90deg,#ff5a2e,#b43bff) 0 0/var(--p,50%) 100% no-repeat,var(--surface-4)}
  input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.45),0 0 0 3px color-mix(in srgb,var(--accent) 35%,transparent);cursor:grab}
  input[type="range"]::-moz-range-thumb{width:18px;height:18px;border:0;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.45)}

  /* ---------- Modèle UX validé : en-tête de rubrique ---------- */
  .app-head{padding:22px 30px 16px;gap:12px 20px;align-items:flex-end;border-bottom:0;background:transparent}
  .app-head .ah-t{flex-direction:column;align-items:flex-start;gap:0;min-width:0}
  .app-head .ah-eye{font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:7px}
  :root[data-da] .app-head .ah-t h1{font-size:24px !important;letter-spacing:.03em;line-height:1.12;display:flex;align-items:center;gap:10px;white-space:normal}
  .app-head .ah-t h1 svg.i{display:none}
  .app-head .ah-t .sub{font-size:13.5px;color:var(--text-2);margin-top:7px;white-space:normal}
  .app-head .ah-tabs{align-self:flex-end}
  .app-head .ah-f{align-self:flex-end}
  /* Panneau de filtres : une carte, libellés au-dessus des contrôles */
  .app-head2{margin:0 22px 14px;padding:14px 18px;border:1px solid var(--line-2);border-radius:14px;background:color-mix(in srgb,var(--surface-2) 72%,transparent);gap:12px 18px;align-items:flex-end}
  .app-head2 > div:has(> .label), .app-head2 > label:has(> .label){display:flex;flex-direction:column;align-items:flex-start;gap:7px}
  .app-head2 .label{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3)}
  .app-head2 > [class$="-sep"]{width:1px;align-self:stretch;height:auto;background:var(--line-2)}
  .picker-btn{height:36px;padding:0 12px;border-radius:10px;background:color-mix(in srgb,var(--surface-0) 70%,transparent);box-shadow:inset 0 0 0 1px var(--line-2)}
  .picker-btn:hover{background:var(--surface-3)}
  .picker-btn.active{background:color-mix(in srgb,var(--accent) 16%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 55%,transparent)}
  @container app (max-width:720px){.app-head{padding:16px 16px 12px}:root[data-da] .app-head .ah-t h1{font-size:19px !important}.app-head2{margin:0 10px 10px;padding:12px}}

  /* Ambiance : les lueurs Bony au fond des pages (thème sombre) */
  :root:not([data-theme="light"]){--page-bg:radial-gradient(900px 520px at 0% 100%,rgba(255,90,46,.075),transparent 70%),radial-gradient(900px 600px at 100% 0%,rgba(180,59,255,.085),transparent 70%),var(--surface-1)}
  :root[data-theme="light"]{--page-bg:var(--surface-1)}
  .win-body{background:var(--page-bg)}
  `);
})();
