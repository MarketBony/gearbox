/* =====================================================================
   Rubrique « Budget » — Budget & prévisionnel (miroir de pages/Budget.tsx) — v2.4
   Modèle validé : maquettes/ux/project/Budget.dc.html + BudgetProvisions.dc.html
   Filtres partagés par les deux onglets (panneau .app-head2, libellés au-dessus) :
   Périmètre MULTI (puces + « +N », plaques ★, Entités spécifiques : Nissan),
   Marque MULTI (Alpine / Nissan grisées hors périmètre éligible), Service MULTI,
   PRO+ 3 états, Année, Période mois → mois, compteur de filtres, Réinitialiser.
   - Suivi réalisé : 4 KPI, évolution mensuelle (barres réalisé + ligne prévu),
     tableau « Répartition & performance par site » à EN-TÊTE COLLANT et à
     défilement propre (le tableau défile seul dans sa carte en grand écran).
   - Provisions : total groupe annuel (non filtré), « Calculé sur N sites »,
     badge Lecture seule, cartes repliables (état gardé) par plaque puis
     Entités spécifiques, grille 4 services × 12 mois, sauvegarde auto.
     Seul le périmètre filtre ; édition : Master, Administrator, Director.
   Règles : brouillons exclus, archivés comptés, Holding jamais imputé,
   Alpine par site, Nissan global (seulement si « Nissan » est coché),
   chef de site : ses lignes (site + Alpine-<site>), jamais Nissan.
   Routage : GX.data.routeItem() seul (équivalent maquette de splitShareToBuckets).
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt;
  const RDM = ['Renault', 'Dacia', 'Mobilize'];
  const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const SVC = ['VN', 'VO', 'PR', 'APV'];                               // ordre des colonnes / grilles de Budget.tsx
  const SVC_CHIPS = ['VN', 'VO', 'APV', 'PR'];                          // BUDGET_SERVICE_CHIPS
  const BRAND_CHIPS = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize']; // BUDGET_BRAND_CHIPS
  const SVC_HEX = { VN: '#3a5fc8', VO: '#f75632', APV: '#8f12ab', PR: '#1aa9bd' };
  const SPEC = 'ENTITÉS SPÉCIFIQUES';
  const EDIT_PROV = ['Master', 'Administrator', 'Director'];            // canEditProvisions
  const Y = new Date().getFullYear(), YEARS = [Y - 2, Y - 1, Y];
  const ALPINE_BUCKETS = { Clermont: 'Alpine-Clermont', Vichy: 'Alpine-Vichy', 'Le Puy-en-Velay': 'Alpine-Le Puy', Rodez: 'Alpine-Rodez' };
  /* Clés de ventilation du site « GROUPE BONY » (valeur de SITE, ≠ tag Holding) — copie de constants.ts */
  const DIST_GB = { Clermont: 29 * .71, Mozac: 29 * .16, Massagettes: 29 * .05, Ussel: 29 * .08, Vichy: 7, Moulins: 5, Ricoux: 4, Issoire: 5, 'Le Puy-en-Velay': 9 * .72, Mende: 9 * .28,
    Albi: 32 * .19, Aurillac: 32 * .19, Figeac: 32 * .08, Villefranche: 32 * .05, Millau: 32 * .07, Rodez: 32 * .24, Gaillac: 32 * .11, Lavaur: 32 * .02, Carmaux: 32 * .05, Nissan: 9 };
  const DIST_RN = { Clermont: 31.9 * .71, Mozac: 31.9 * .16, Massagettes: 31.9 * .05, Ussel: 31.9 * .08, Vichy: 7.75, Moulins: 5.1, Ricoux: 4.66, Issoire: 5.79, 'Le Puy-en-Velay': 9.44 * .72, Mende: 9.44 * .28,
    Albi: 35.37 * .2, Aurillac: 35.37 * .21, Figeac: 35.37 * .09, Millau: 35.37 * .07, Rodez: 35.37 * .29, Gaillac: 35.37 * .14 };

  GX.css(`
  .bud-h .ah-t{min-width:0;flex:0 1 auto}
  .bud-h .ah-f{display:flex;align-items:center;gap:10px;margin-left:auto}
  .bud-saving{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);opacity:0;transition:opacity var(--t-med)}
  .bud-saving.on{opacity:1;animation:bud-pulse 1s ease-in-out infinite alternate}
  @keyframes bud-pulse{to{opacity:.55}}
  .bud-ftog{display:none}
  /* Panneau de filtres */
  .bud-f{display:flex;flex-wrap:wrap}
  .bud-sep{width:1px;background:var(--line-2)}
  .bud-f .chip{height:32px;padding:0 13px;border-radius:8px;font-size:13px;box-shadow:inset 0 0 0 1px var(--line-2);background:transparent;color:var(--text-2)}
  .bud-f .chip:hover{color:var(--text);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 50%,transparent)}
  .bud-f .chip[aria-pressed="true"]{background:var(--bony-grad);color:#fff;box-shadow:0 6px 16px -9px var(--accent)}
  .bud-f .chip[aria-pressed="true"][data-v="Renault"]{background:#ffcc33;color:#1a1400}
  .bud-f .chip[aria-pressed="true"][data-v="Dacia"]{background:#6a7551;color:#fff}
  .bud-f .chip[aria-pressed="true"][data-v="Alpine"]{background:#0055a4;color:#fff}
  .bud-f .chip[aria-pressed="true"][data-v="Nissan"]{background:#c3002f;color:#fff}
  .bud-f .chip[aria-pressed="true"][data-v="Mobilize"]{background:#7b3fe4;color:#fff}
  ${SVC_CHIPS.map((s) => `.bud-f [data-svcs] .chip[aria-pressed="true"][data-v="${s}"]{background:${SVC_HEX[s]};color:#fff}`).join('')}
  .bud-f .chip:disabled{opacity:.3;cursor:not-allowed;pointer-events:auto}
  .bud-f .chip:disabled:hover{box-shadow:inset 0 0 0 1px var(--line-2);color:var(--text-2)}
  .bud-f .select{height:36px;min-width:0}
  .bud-sel-pro{width:160px}.bud-sel-y{width:96px}.bud-sel-m{width:92px}
  .bud-per{display:flex;align-items:center;gap:8px;color:var(--text-3)}
  .bud-peri{max-width:300px;gap:6px}
  .bud-tag{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 4px 0 8px;border-radius:6px;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent);font-size:12.5px;font-weight:600;white-space:nowrap}
  .bud-tag i{font-style:normal;display:inline-grid;place-items:center;width:17px;height:17px;border-radius:5px;cursor:pointer}
  .bud-tag i:hover{background:color-mix(in srgb,var(--accent) 28%,transparent)}
  .bud-fr{margin-left:auto;align-self:flex-end;display:flex;flex-direction:column;align-items:flex-end;gap:5px;padding-bottom:4px}
  .bud-fr b{font-size:13px;color:var(--accent)}
  .bud-fr button{font-size:13px;font-weight:600;color:var(--accent);background:none;padding:0}
  .bud-fr button:hover{text-decoration:underline}
  .bud-dimgrp{opacity:.4;pointer-events:none}
  .bud-dimgrp .row{gap:6px;flex-wrap:wrap}
  .bud-dimgrp .chip{pointer-events:none}
  .bud-fnote{font-size:13px;color:var(--text-3);max-width:430px;line-height:1.4;align-self:flex-end;padding-bottom:4px}
  /* Corps */
  .bud-body{overflow:hidden}
  .bud-body.t-prov{overflow:auto}
  .bud-real{height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:20px;padding:0 22px 22px}
  .bud-h2{margin:0;font-family:var(--font-display);font-weight:700;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--text)}
  .bud-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;flex:none}
  .bud-kpi{padding:20px 24px;display:flex;flex-direction:column;gap:12px;min-width:0;position:relative;overflow:hidden}
  .bud-kpi .label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--text-3)}
  .bud-kv{font-family:var(--font-display);font-weight:700;font-size:26px;line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:8px}
  .bud-kpi .sub{font-size:13px;color:var(--text-2)}
  .bud-kpi .deco{position:absolute;right:-10px;bottom:-14px;opacity:.13;color:var(--bony-orange)}
  .bud-kpi .deco svg{width:90px;height:90px}
  .bud-kpi.alert{background:color-mix(in srgb,var(--danger) 10%,var(--surface-2))}
  .bud-cbar{height:7px;border-radius:4px;background:var(--surface-4);overflow:hidden}
  .bud-cbar i{display:block;height:100%;border-radius:inherit;background:var(--bony-grad);transform-origin:left;animation:ui-grow var(--t-slow) var(--spring-soft) both}
  .bud-cbar.over i{background:var(--danger)}
  .bud-split{flex:1;min-height:0;display:grid;grid-template-columns:minmax(320px,34%) minmax(0,1fr);gap:20px}
  .bud-ccard{padding:22px 24px;display:flex;flex-direction:column;gap:14px;min-height:0;min-width:0}
  .bud-ccard .hd{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
  .bud-leg{display:flex;gap:14px;font-size:12.5px;font-weight:600;color:var(--text-2)}
  .bud-leg span{display:inline-flex;align-items:center;gap:6px}
  .bud-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;background:#f75632}
  .bud-leg i.ln{width:16px;height:0;border-top:2px dashed #6d86d6;border-radius:0;background:none}
  .bud-chart{flex:1;min-height:200px;display:flex;flex-direction:column}
  .bud-chart .gxc{flex:1;min-height:0;grid-template-rows:minmax(0,1fr) 18px !important}
  .bud-chart .gxc span{font-size:11.5px !important}
  .bud-tcard{padding:22px 0 0;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}
  .bud-tcard .hd{padding:0 24px 14px;flex:none}
  .bud-tcard .hd p{margin:6px 0 0;font-size:13px;color:var(--text-2)}
  .bud-tscroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--surface-4) transparent;margin:0 10px 10px}
  .bud-tscroll::-webkit-scrollbar{width:12px;height:12px}
  .bud-tscroll::-webkit-scrollbar-thumb{background:var(--surface-4);border-radius:8px;border:3px solid transparent;background-clip:padding-box}
  .bud-tscroll::-webkit-scrollbar-corner{background:transparent}
  .bud-t{width:100%;min-width:620px;border-collapse:separate;border-spacing:0;font-size:14px}
  .bud-t th{position:sticky;top:0;z-index:2;background:var(--surface-2);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);text-align:right;padding:12px 14px;border-bottom:1px solid var(--line-2);white-space:nowrap}
  .bud-t th:first-child{text-align:left;left:0;z-index:3}
  .bud-t th.dim{color:color-mix(in srgb,var(--text-3) 45%,transparent)}
  .bud-t td{padding:10px 14px;border-bottom:1px solid var(--line);text-align:right;vertical-align:middle;white-space:nowrap;background:var(--surface-2);transition:background var(--t-fast)}
  .bud-t td:first-child{text-align:left;position:sticky;left:0;z-index:1}
  .bud-t tbody tr:hover td{background:color-mix(in srgb,var(--surface-3) 70%,var(--surface-2))}
  .bud-t td b{font-weight:700;font-variant-numeric:tabular-nums}
  .bud-t .pv{display:block;font-size:11.5px;color:var(--text-3);margin-top:2px;font-weight:500;font-variant-numeric:tabular-nums}
  .bud-t .plq{letter-spacing:.06em;text-transform:uppercase}
  .bud-t td.dim > *{opacity:.3}
  .bud-t .al{display:inline-flex;align-items:center;gap:5px}
  .bud-empty{padding:40px 16px}
  /* Provisions */
  .bud-prov{display:flex;flex-direction:column;gap:14px;padding:0 22px 40px}
  .bud-hero{padding:22px 26px;display:flex;align-items:center;flex-wrap:wrap;gap:14px 24px;position:relative;overflow:hidden}
  .bud-hero::before{content:"";position:absolute;inset:0;background:var(--bony-grad);opacity:.13;pointer-events:none}
  .bud-hero > *{position:relative}
  .bud-hero .label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--accent)}
  .bud-hero .kv{margin-top:8px;font-family:var(--font-display);font-weight:700;font-size:34px;line-height:1.05;font-variant-numeric:tabular-nums}
  .bud-pill{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px;border-radius:8px;background:color-mix(in srgb,var(--text) 8%,transparent);font-size:13px;font-weight:700;white-space:nowrap}
  .bud-pill.ro{background:color-mix(in srgb,var(--danger) 14%,transparent);color:var(--danger)}
  .bud-plq{display:flex;align-items:center;gap:14px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-top:6px}
  .bud-plq::before,.bud-plq::after{content:"";height:1px;flex:1;background:color-mix(in srgb,var(--accent) 32%,transparent)}
  .bud-pcard{overflow:hidden;transition:box-shadow var(--t-fast)}
  .bud-pcard:hover{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bony-violet) 35%,transparent)}
  .bud-phead{display:flex;align-items:center;gap:14px;width:100%;padding:14px 20px;text-align:left;background:transparent}
  .bud-phead:hover{background:color-mix(in srgb,var(--surface-3) 45%,transparent)}
  .bud-pcard.open .bud-phead{border-bottom:1px solid var(--line)}
  .bud-phead .chev{display:inline-grid;color:var(--text-3);transition:transform var(--t-med) var(--spring-snappy)}
  .bud-pcard.open .bud-phead .chev{transform:rotate(90deg);color:var(--accent)}
  .bud-phead .nm{font-family:var(--font-display);font-weight:700;font-size:14.5px;letter-spacing:.05em;text-transform:uppercase;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bud-pbadge{height:22px;padding:0 8px;border-radius:6px;background:color-mix(in srgb,var(--text) 8%,transparent);font-size:11px;font-weight:700;color:var(--text-2);display:inline-flex;align-items:center;white-space:nowrap}
  .bud-dots{display:inline-flex;gap:5px}.bud-dots i{width:9px;height:9px;border-radius:50%;background:var(--c)}
  .bud-phead .v{text-align:right;flex:none}
  .bud-phead .v .label{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-3)}
  .bud-phead .v .m{font-size:15px;font-weight:700;margin-top:3px;font-variant-numeric:tabular-nums}
  .bud-phead .v.an{width:150px}
  .bud-phead .v .a{font-size:20px;font-weight:700;margin-top:2px;background:linear-gradient(90deg,#ff7a52,#c77dff);-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums;white-space:nowrap}
  .bud-gwrap{overflow:hidden}
  .bud-grid{overflow-x:auto;scrollbar-width:thin;padding:16px 20px 20px}
  .bud-grid table{border-collapse:separate;border-spacing:8px 8px;margin:-8px;width:calc(100% + 16px);min-width:1080px}
  .bud-grid th{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);text-align:right;padding:0 2px}
  .bud-grid th:first-child,.bud-grid td:first-child{text-align:left;position:sticky;left:0;z-index:1;background:var(--surface-2);width:84px}
  .bud-grid th:last-child{width:118px}
  .bud-svc{height:24px;padding:0 9px;border-radius:6px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;color:#fff;background:var(--c)}
  .bud-grid input{width:100%;min-width:58px;height:34px;box-sizing:border-box;border-radius:7px;border:0;box-shadow:inset 0 0 0 1px var(--line-2);background:color-mix(in srgb,var(--surface-0) 60%,transparent);color:var(--text);font-family:inherit;font-weight:600;font-size:13.5px;text-align:right;padding:0 8px;font-variant-numeric:tabular-nums;outline:0;-moz-appearance:textfield;transition:box-shadow var(--t-fast)}
  .bud-grid input::-webkit-outer-spin-button,.bud-grid input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
  .bud-grid input:hover{box-shadow:inset 0 0 0 1px var(--line-3)}
  .bud-grid input:focus{box-shadow:inset 0 0 0 1px var(--accent),0 0 0 3px var(--focus)}
  .bud-grid input:disabled{opacity:.5;cursor:not-allowed;background:transparent;box-shadow:none}
  .bud-grid td.tot{text-align:right;font-size:15px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
  .bud-flash{animation:bud-flash .7s var(--ease-out)}
  @keyframes bud-flash{from{color:var(--accent)}}
  /* Adaptatif */
  @container app (max-width:1180px){.bud-kpis{gap:14px}.bud-kpi{padding:16px 18px}.bud-kv{font-size:22px}}
  @container app (max-width:999px){
    .bud-body{overflow:auto}.bud-real{height:auto}
    .bud-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
    .bud-split{grid-template-columns:1fr;flex:none}
    .bud-ccard{height:300px}
    .bud-tcard{height:max(380px,64vh)}}
  @container app (max-width:760px){.bud-phead .plqb{display:none}.bud-phead .v.an{width:auto}}
  @container app (max-width:720px){
    .bud-ftog{display:inline-flex}.bud-h .ah-t .sub{display:none}
    .bud-f:not(.open){display:none}.bud-sep{display:none}
    .bud-f > div{width:100%}.bud-fr{margin-left:0;align-self:flex-start;flex-direction:row;gap:14px}
    .bud-real,.bud-prov{padding:0 10px 16px;gap:12px}
    .bud-kpis{gap:10px}.bud-kpi{padding:14px;gap:8px}.bud-kv{font-size:19px}
    .bud-ccard,.bud-tcard .hd{padding-left:16px;padding-right:16px}
    .bud-hero{padding:18px}.bud-hero .kv{font-size:26px}
    .bud-phead{padding:12px 14px;gap:10px}.bud-phead .avg{display:none}.bud-phead .v .a{font-size:17px}
    .bud-grid{padding:12px 14px 16px}}
  @container app (max-width:460px){.bud-kv{font-size:16px}.bud-kpi .sub{font-size:12px}.bud-phead .dots{display:none}.bud-per .select{width:80px}}
  `);

  /* ---------------- Référentiel des lignes (miroir de constants.ts) ---------------- */
  // Montluçon / Saint-Étienne n'ont pas de ligne propre dans Gearbox (leurs dépenses Nissan vont à l'enveloppe Nissan).
  const allLines = () => D.BUDGET_LINES.filter((l) => !D.NISSAN_ONLY.includes(l.id));
  /* resolveBudgetLine() */
  const resolveLine = (id) => {
    if (id === 'Nissan') return { siteReel: null, marque: 'Nissan', global: true };
    const a = Object.entries(ALPINE_BUCKETS).find(([, b]) => b === id);
    return a ? { siteReel: a[0], marque: 'Alpine', global: false } : { siteReel: id, marque: null, global: false };
  };
  /* isDestinationInScope() : Alpine suit son site, Nissan n'entre que nommé explicitement */
  const inScope = (id, scope) => { if (!scope.length || scope.includes(id)) return true; const r = resolveLine(id); return !r.global && r.siteReel !== null && scope.includes(r.siteReel); };
  /* Lignes renvoyées par le serveur : un chef de site ne reçoit que son site et son enveloppe Alpine (budgetScopeOf), jamais Nissan. */
  const visibleLines = () => {
    const s = GX.ctx.site; if (!s) return allLines();
    const own = [D.routeItem({ sites: [s], brands: ['Renault'], amount: 1 })[0]?.[0], ALPINE_BUCKETS[s]].filter(Boolean);
    return allLines().filter((l) => own.includes(l.id));
  };
  const plaqueOfLine = (id) => Object.keys(D.PLAQUES).find((p) => D.PLAQUES[p].includes(id)) || SPEC;
  const annualOf = (l) => SVC.reduce((s, sv) => s + l.planned[sv].reduce((a, b) => a + b, 0), 0);
  const withDist = (it) => {
    if (it.distribution) return it;
    const g = (it.sites || []).find((s) => s === 'GROUPE BONY' || s === 'GROUPE BONY (R/N)');
    if (!g) return it;
    const d = g === 'GROUPE BONY' ? DIST_GB : DIST_RN;
    return { ...it, sites: Object.keys(d), distribution: d };
  };
  const isHolding = (b) => b.includes('Holding') || b.includes('Groupe');   // isHoldingBrand() (alias legacy « Groupe »)
  const hitsOf = (list) => (list.includes('Tous Services') ? [...SVC] : list.filter((s) => SVC.includes(s)));
  const tone = (p) => (p > 100 ? 'var(--danger)' : p > 80 ? 'var(--warn)' : 'var(--ok)');
  const periodLabel = (f) => (f.m0 === 0 && f.m1 === 11 ? `Annuel ${f.year}` : `Période ${MONTHS[f.m0]} – ${MONTHS[f.m1]} ${f.year}`);

  /* ---------------- Moteur d'agrégation (renderSuivi / aggregatedData) ---------------- */
  function compute(f) {
    const lines = visibleLines();
    const svcs = f.services.length ? SVC.filter((s) => f.services.includes(s)) : [...SVC];
    const stats = Object.fromEntries(lines.map((l) => [l.id, { fc: Object.fromEntries(SVC.map((s) => [s, 0])), ac: Object.fromEntries(SVC.map((s) => [s, 0])), fcM: Array(12).fill(0), acM: Array(12).fill(0) }]));
    const inM = (m) => m >= f.m0 && m <= f.m1;
    const brandIn = (brands) => !f.brands.length || brands.includes('Holding') || f.brands.some((b) => brands.includes(b));
    const lineBrandIn = (id) => { if (!f.brands.length) return true; const { marque } = resolveLine(id); return marque ? f.brands.includes(marque) : f.brands.some((b) => RDM.includes(b)); };
    const proIn = (p) => f.pro === 'all' || (f.pro === 'pro' ? !!p : !p);
    // 1. Prévisionnel (enveloppes)
    lines.forEach((l) => { if (!lineBrandIn(l.id)) return; svcs.forEach((s) => l.planned[s].forEach((v, m) => { if (inM(m)) { stats[l.id].fc[s] += v; stats[l.id].fcM[m] += v; } })); });
    const put = (dests, month, hits) => dests.forEach(([id, amt]) => {
      const st = stats[id]; if (!st || !amt) return;
      const per = amt / hits.length;
      hits.forEach((s) => { if (svcs.includes(s)) { st.ac[s] += per; st.acM[month] += per; } });
    });
    let nP = 0, nE = 0;
    // 2. Réalisé — projets (Draft exclu, Archived compté, Holding jamais imputé, compté sur sa date de début)
    D.PROJECTS.forEach((p) => {
      if (p.status === 'Draft' || !proIn(p.proPlus) || isHolding(p.brands) || !brandIn(p.brands)) return;
      const d = new Date(p.startDate); if (d.getFullYear() !== f.year || !inM(d.getMonth())) return;
      const cost = D.projectActual(p); if (!cost) return;
      const hits = hitsOf(p.services || []); if (!hits.length) return;
      put(D.routeItem({ ...withDist(p), amount: cost }), d.getMonth(), hits); nP++;
    });
    // 3. Réalisé — dépenses fixes (annuelle : lissée sur 12 mois, le filtre de période s'applique par mois)
    D.EXPENSES.forEach((e) => {
      const brands = e.brands?.length ? e.brands : e.brand ? [e.brand] : [];
      if (!proIn(e.proPlus) || isHolding(brands) || !brandIn(brands)) return;
      const d = new Date(e.date); if (d.getFullYear() !== f.year || !e.amount) return;
      const hits = hitsOf([e.service]); if (!hits.length) return;
      const months = e.annual ? Array.from({ length: 12 }, (_, m) => [m, e.amount / 12]) : [[d.getMonth(), e.amount]];
      let used = false;
      months.forEach(([m, amt]) => { if (!inM(m)) return; used = true; put(D.routeItem({ ...withDist({ ...e, brands }), amount: amt }), m, hits); });
      if (used) nE++;
    });
    // 4. Périmètre (isDestinationInScope) puis tri par nom, comme Gearbox
    const scope = GX.ctx.site ? [] : f.sites;
    const rows = lines.filter((l) => inScope(l.id, scope)).sort((a, b) => a.id.localeCompare(b.id, 'fr')).map((l) => {
      const st = stats[l.id], plan = SVC.reduce((a, s) => a + st.fc[s], 0), real = SVC.reduce((a, s) => a + st.ac[s], 0);
      return { id: l.id, plaque: plaqueOfLine(l.id), st, plan, real, pct: plan > 0 ? (real / plan) * 100 : 0 };
    });
    const fcM = Array(12).fill(0), acM = Array(12).fill(0);
    rows.forEach((r) => r.st.fcM.forEach((v, i) => { fcM[i] += v; acM[i] += r.st.acM[i]; }));
    const months = Array.from({ length: f.m1 - f.m0 + 1 }, (_, i) => f.m0 + i);
    return { rows, svcs, months, fcM: months.map((m) => fcM[m]), acM: months.map((m) => acM[m]), plan: rows.reduce((a, r) => a + r.plan, 0), real: rows.reduce((a, r) => a + r.real, 0), nP, nE };
  }

  const ICO_COINS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7M3 12v5c0 1.7 2.7 3 6 3 1.3 0 2.5-.2 3.5-.6M15 10.5c3.3 0 6 1.3 6 3s-2.7 3-6 3-6-1.3-6-3"/></svg>';

  GX.registerApp({
    id: 'budget', name: 'Budget', icon: 'budget', tint: ['#f5a524', '#f75632'], size: [1280, 800], minSize: [360, 320],
    mount(body, win) {
      const fromCtx = () => { const p = GX.ctx.perimetre; return GX.ctx.site || !p || p === 'Tout le réseau' ? [] : [p]; };
      const DEF = () => ({ sites: [], brands: [], services: [], pro: 'all', year: Y, m0: 0, m1: 11 });
      const f = { ...DEF(), sites: fromCtx() };
      let tab = GX.store.get('bud.tab', 'real') === 'prov' ? 'prov' : 'real', first = true, selfEmit = false, fOpen = false, saveT = 0;
      const open = new Set(GX.store.get('bud.expanded', []));
      body.innerHTML = `<div class="app"><div class="app-head bud-h"><div class="ah-t"><h1>Budget &amp; prévisionnel</h1><span class="sub">Pilotage financier par concession</span></div>
          <div class="ah-f"><span class="bud-saving" data-saving>${GX.icon('cloud', 'sm')}Sauvegarde auto…</span><button class="btn sm bud-ftog" data-ftog></button>
            <div class="seg" data-tabs><button data-v="real" aria-pressed="${tab === 'real'}">Suivi réalisé</button><button data-v="prov" aria-pressed="${tab === 'prov'}">Provisions</button></div></div></div>
        <div class="app-head2 bud-f" data-filters></div><div class="app-body bud-body" data-body></div></div>`;
      const $b = body.querySelector('[data-body]'), $f = body.querySelector('[data-filters]'), $tog = body.querySelector('[data-ftog]'), $sv = body.querySelector('[data-saving]');
      const canProv = () => EDIT_PROV.includes(GX.ctx.role);
      const effSites = () => (GX.ctx.site ? [GX.ctx.site] : f.sites);
      const nAct = () => f.sites.length + f.brands.length + f.services.length + (f.year !== Y) + (f.m0 !== 0 || f.m1 !== 11) + (f.pro !== 'all');
      /* BudgetBrandPicker : Alpine / Nissan indisponibles sans site éligible dans le périmètre */
      const brandAvail = (b) => { const S = effSites(); if (b === 'Alpine') return !S.length || S.some((s) => D.ALPINE_SITES.includes(s)); if (b === 'Nissan') return !S.length || S.some((s) => D.NISSAN_SITES.includes(s)) || S.includes('Nissan'); return true; };

      /* ---------- Filtres ---------- */
      function periBtn() {
        if (GX.ctx.site) return `<button class="picker-btn active bud-peri" disabled data-tip="Périmètre imposé (chef de site)">${GX.icon('lock', 'sm')}<span class="v">${GX.esc(GX.ctx.site)}</span></button>`;
        const s = f.sites;
        const inner = s.length ? s.slice(0, 2).map((x) => `<span class="bud-tag">${GX.esc(x)}<i data-rm="${GX.esc(x)}" role="button" aria-label="Retirer ${GX.esc(x)}">×</i></span>`).join('') + (s.length > 2 ? `<span class="faint">+${s.length - 2}</span>` : '') : '<span class="v">Tout le réseau</span>';
        return `<button class="picker-btn bud-peri ${s.length ? 'active' : ''}" data-sites>${s.length ? '' : GX.icon('pin', 'sm')}${inner}${GX.icon('chevdown', 'sm')}</button>`;
      }
      function renderFilters() {
        f.brands = f.brands.filter(brandAvail);
        const n = nAct();
        $tog.className = `btn sm bud-ftog ${fOpen ? 'primary' : ''}`;
        $tog.innerHTML = `${GX.icon('filter', 'sm')}Filtres${n ? ` <span class="count">${n}</span>` : ''}`;
        const peri = `<div><span class="label">Périmètre</span>${periBtn()}</div>`;
        if (tab === 'prov') {
          $f.innerHTML = `${peri}<span class="bud-sep"></span>
            <div class="bud-dimgrp" aria-disabled="true"><span class="label">Marque · Service · PRO+ · Année · Période</span><div class="row">
              <span class="chip">${f.brands.length ? GX.esc(f.brands.join(', ')) : 'Toutes'}</span><span class="chip">${f.services.length ? GX.esc(f.services.join(', ')) : 'Tous'}</span>
              <span class="chip">${{ all: 'Tout', standard: 'Sans PRO+', pro: 'PRO+ uniquement' }[f.pro]}</span><span class="chip">${f.year}</span><span class="chip">${MONTHS[f.m0]} → ${MONTHS[f.m1]}</span></div></div>
            <span class="bud-fnote">Sur les provisions, seul le périmètre s’applique : les enveloppes n’ont pas d’année et le total groupe n’est pas filtré.</span>`;
        } else {
          $f.innerHTML = `${peri}<span class="bud-sep"></span>
            <div><span class="label">Marque</span>${GX.ui.chips(BRAND_CHIPS, f.brands, { all: 'Toutes', attr: 'data-brands' })}</div><span class="bud-sep"></span>
            <div><span class="label">Service</span>${GX.ui.chips(SVC_CHIPS, f.services, { all: 'Tous', attr: 'data-svcs' })}</div><span class="bud-sep"></span>
            <div><span class="label">PRO+ (B2B)</span><select class="select bud-sel-pro" data-pro aria-label="PRO+ (B2B)">${[['all', 'Tout'], ['standard', 'Sans PRO+'], ['pro', 'PRO+ uniquement']].map(([v, l]) => `<option value="${v}" ${f.pro === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div><span class="label">Année</span><select class="select bud-sel-y" data-year aria-label="Année">${YEARS.map((y) => `<option value="${y}" ${f.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
            <div><span class="label">Période</span><div class="bud-per"><select class="select bud-sel-m" data-m0 aria-label="Mois de début">${MONTHS.map((m, i) => `<option value="${i}" ${f.m0 === i ? 'selected' : ''}>${m}</option>`).join('')}</select><span>→</span><select class="select bud-sel-m" data-m1 aria-label="Mois de fin">${MONTHS.map((m, i) => `<option value="${i}" ${f.m1 === i ? 'selected' : ''}>${m}</option>`).join('')}</select></div></div>
            ${n ? `<div class="bud-fr"><b>${n} filtre${n > 1 ? 's' : ''} actif${n > 1 ? 's' : ''}</b><button data-reset>Réinitialiser</button></div>` : ''}`;
          $f.querySelectorAll('[data-brands] > button[data-v]').forEach((b) => { if (b.dataset.v && !brandAvail(b.dataset.v)) { b.disabled = true; b.dataset.tip = `Aucun site ${b.dataset.v} dans le périmètre`; } });
          $f.querySelector('[data-brands]').addEventListener('change', (e) => { f.brands = e.detail; upd(); });
          $f.querySelector('[data-svcs]').addEventListener('change', (e) => { f.services = e.detail; upd(); });
          $f.querySelector('[data-pro]').onchange = (e) => { f.pro = e.target.value; upd(); };
          $f.querySelector('[data-year]').onchange = (e) => { f.year = +e.target.value; upd(); };
          $f.querySelector('[data-m0]').onchange = (e) => { f.m0 = +e.target.value; if (f.m0 > f.m1) f.m1 = f.m0; upd(); };
          $f.querySelector('[data-m1]').onchange = (e) => { f.m1 = +e.target.value; if (f.m1 < f.m0) f.m0 = f.m1; upd(); };
          $f.querySelector('[data-reset]')?.addEventListener('click', reset);
        }
        $f.querySelector('[data-sites]')?.addEventListener('click', (e) => {
          const rm = e.target.closest('[data-rm]');
          if (rm) { e.stopPropagation(); f.sites = f.sites.filter((x) => x !== rm.dataset.rm); return upd(); }
          GX.ui.pick(e.currentTarget, [...Object.entries(D.PLAQUES).map(([pl, ss]) => ({ label: '★ ' + pl, toggleAll: true, items: ss.map((s) => ({ v: s, l: s, hint: [D.ALPINE_SITES.includes(s) && 'Alpine', D.NISSAN_SITES.includes(s) && 'Nissan'].filter(Boolean).join(' · ') })) })),
            { label: 'Entités spécifiques', items: [{ v: 'Nissan', l: 'Nissan', hint: 'enveloppe globale' }] }],
          { multi: true, search: true, selected: f.sites, allLabel: 'Tout le réseau', title: 'Périmètre', width: 310, onChange: (v) => { f.sites = v; upd(); } });
        });
        $f.classList.toggle('open', fOpen);
      }
      const upd = () => { renderFilters(); renderBody(); };
      function reset() { Object.assign(f, DEF()); upd(); }
      $tog.onclick = () => { fOpen = !fOpen; renderFilters(); };

      /* ---------- Suivi réalisé ---------- */
      function realHTML(c) {
        const pl = periodLabel(f), rem = c.plan - c.real, pc = c.plan > 0 ? (c.real / c.plan) * 100 : 0, over = pc > 100;
        let ki = 0;
        const kpi = (label, value, sub, vStyle = '', extra = '', cls = '') => `<article class="card bud-kpi ${cls} ${first ? 'enter' : ''}" style="--i:${ki++}"><span class="label">${label}</span><div class="bud-kv num" style="${vStyle}">${value}</div>${extra}${sub ? `<span class="sub">${sub}</span>` : ''}</article>`;
        const svcTxt = f.services.length ? f.services.join(', ') : 'tous services', brTxt = f.brands.length ? f.brands.join(', ') : 'toutes marques';
        const cell = (r, s) => {
          const fc = r.st.fc[s], ac = r.st.ac[s], p = fc > 0 ? (ac / fc) * 100 : 0, dim = f.services.length && !f.services.includes(s);
          const col = fc > 0 ? tone(p) : 'var(--text-3)';
          return `<td class="${dim ? 'dim' : ''}"><b style="color:${col}">${ac > 0 ? F.n(Math.round(ac)) : '-'}</b>${fc > 0 ? `<span class="pv">prévu ${F.n(Math.round(fc))}</span>` : ''}</td>`;
        };
        const rows = c.rows.map((r) => `<tr><td><b>${GX.esc(r.id)}</b><span class="pv plq">${GX.esc(r.plaque)}</span></td>${SVC.map((s) => cell(r, s)).join('')}
          <td><b>${F.eur(r.real)}</b></td><td><b style="color:${tone(r.pct)}">${Math.round(r.pct)} %</b></td></tr>`).join('');
        return `<div class="bud-real">
          <section class="bud-kpis">
            ${kpi(`Budget prévu (${pl})`, F.eur(c.plan), `Enveloppes du périmètre · ${svcTxt} · ${brTxt}`)}
            ${kpi(`Réalisé (${pl})`, F.eur(c.real), 'Projets (hors brouillons) + dépenses fixes', 'color:var(--bony-orange)', `<span class="deco">${ICO_COINS}</span>`)}
            ${kpi('Reste à engager', F.eur(rem), rem < 0 ? 'Dépassement sur la période' : 'Prévu − réalisé sur la période', `color:${rem < 0 ? 'var(--danger)' : 'var(--ok)'}`)}
            ${kpi('Consommation', `${pc.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %${over ? GX.icon('alert') : ''}`, over ? `Dépassé de ${F.eur(c.real - c.plan)}` : '', over ? 'color:var(--danger)' : '', `<div class="bud-cbar ${over ? 'over' : ''}"><i style="width:${Math.min(100, pc)}%"></i></div>`, over ? 'alert' : '')}
          </section>
          <section class="bud-split">
            <article class="card bud-ccard ${first ? 'enter' : ''}" style="--i:4"><div class="hd"><h2 class="bud-h2">Évolution mensuelle</h2><div class="bud-leg"><span><i></i>Réalisé</span><span><i class="ln"></i>Budget prévu</span></div></div>
              <div class="bud-chart">${GX.chart.bars({ labels: c.months.map((m) => MONTHS[m]), series: [{ name: 'Réalisé', values: c.acM, color: '#f75632' }], line: { name: 'Budget prévu', values: c.fcM, color: '#6d86d6' }, height: 260 })}</div></article>
            <article class="card bud-tcard ${first ? 'enter' : ''}" style="--i:5"><div class="hd"><h2 class="bud-h2">Répartition &amp; performance par site</h2>
                <p>Données filtrées : ${pl}. ${f.services.length ? `Services : ${GX.esc(f.services.join(', '))}.` : 'Tous services.'}${GX.ctx.site ? ` Périmètre imposé : ${GX.esc(GX.ctx.site)}.` : ''}</p></div>
              <div class="bud-tscroll" data-tscroll tabindex="0" aria-label="Tableau par site"><table class="bud-t"><thead><tr><th>Site / plaque</th>${SVC.map((s) => `<th class="${f.services.length && !f.services.includes(s) ? 'dim' : ''}">${s}</th>`).join('')}<th>Réalisé période</th><th>%</th></tr></thead>
                <tbody>${rows || `<tr><td colspan="7" style="position:static"><div class="empty bud-empty">${GX.icon('budget')}Aucune ligne de budget dans ce périmètre</div></td></tr>`}</tbody></table></div></article>
          </section></div>`;
      }

      /* ---------- Provisions (seul le périmètre filtre) ---------- */
      const provLines = () => { const scope = GX.ctx.site ? [] : f.sites; return visibleLines().filter((l) => inScope(l.id, scope)).sort((a, b) => a.id.localeCompare(b.id, 'fr')); };
      function provHTML() {
        const all = visibleLines(), total = all.reduce((a, l) => a + annualOf(l), 0);
        const groups = [...Object.keys(D.PLAQUES), SPEC].map((g) => [g, provLines().filter((l) => plaqueOfLine(l.id) === g)]).filter(([, ls]) => ls.length);
        return `<div class="bud-prov">
          <section class="card bud-hero ${first ? 'enter' : ''}"><div><span class="label">Budget prévisionnel groupe (annuel)</span><div class="kv" data-hero>${F.eur(total)}</div></div>
            <span class="grow"></span>
            <span class="bud-pill">${GX.icon('budget', 'sm')}Calculé sur ${all.length} site${all.length > 1 ? 's' : ''}</span>
            ${canProv() ? '' : `<span class="bud-pill ro">${GX.icon('lock', 'sm')}Lecture seule</span>`}</section>
          ${groups.map(([g, ls], gi) => `<div class="bud-plq ${first ? 'enter' : ''}" style="--i:${gi + 1}">${GX.esc(g)}</div>${ls.map(pcardHTML).join('')}`).join('') || `<div class="empty">${GX.icon('budget')}Aucune ligne de budget dans ce périmètre</div>`}
        </div>`;
      }
      function pcardHTML(l) {
        const a = annualOf(l), isOpen = open.has(l.id), g = plaqueOfLine(l.id);
        return `<article class="card bud-pcard ${isOpen ? 'open' : ''}" data-pl="${GX.esc(l.id)}"><button class="bud-phead" data-toggle-pl aria-expanded="${isOpen}">
            <span class="chev">${GX.icon('chevron', 'sm')}</span><b class="nm">${GX.esc(l.id)}</b><span class="bud-pbadge plqb">${GX.esc(g)}</span>
            <span class="bud-dots dots">${l.brands.map((b) => `<i style="--c:${D.brand(b).hex}" data-tip="${b}"></i>`).join('')}</span><span class="grow"></span>
            <span class="v avg"><span class="label">Mensuel moy.</span><div class="m" data-avg>${F.eur(a / 12)}</div></span>
            <span class="v an"><span class="label">Annuel prévu</span><div class="a" data-ann>${F.eur(a)}</div></span></button>
          <div class="bud-gwrap">${isOpen ? gridHTML(l) : ''}</div></article>`;
      }
      function gridHTML(l) {
        const dis = canProv() ? '' : 'disabled';
        return `<div class="bud-grid"><table><thead><tr><th>Service</th>${MONTHS.map((m) => `<th>${m}</th>`).join('')}<th>Total annuel</th></tr></thead><tbody>
          ${SVC.map((s) => `<tr data-sv="${s}"><td><span class="bud-svc" style="--c:${SVC_HEX[s]}">${s}</span></td>${l.planned[s].map((v, m) => `<td><input type="number" min="0" step="100" inputmode="numeric" value="${v}" data-m="${m}" ${dis} aria-label="${s} ${MONTHS[m]} — ${GX.esc(l.id)}" /></td>`).join('')}<td class="tot" data-rt>${F.eur(l.planned[s].reduce((a, b) => a + b, 0))}</td></tr>`).join('')}
          </tbody></table></div>`;
      }
      function refreshCard(card, l) {
        const a = annualOf(l);
        card.querySelectorAll('tbody tr').forEach((tr) => (tr.querySelector('[data-rt]').textContent = F.eur(l.planned[tr.dataset.sv].reduce((x, y) => x + y, 0))));
        card.querySelector('[data-avg]').textContent = F.eur(a / 12);
        const ann = card.querySelector('[data-ann]'); ann.textContent = F.eur(a); ann.classList.remove('bud-flash'); void ann.offsetWidth; ann.classList.add('bud-flash');
        const hero = $b.querySelector('[data-hero]'); if (hero) hero.textContent = F.eur(visibleLines().reduce((x, y) => x + annualOf(y), 0));
      }
      function saving() { $sv.classList.add('on'); clearTimeout(saveT); saveT = setTimeout(() => $sv.classList.remove('on'), 800); }
      function wireGrid(card, l) {
        card.querySelectorAll('input[data-m]').forEach((inp) => {
          const sv = inp.closest('tr').dataset.sv, m = +inp.dataset.m;
          inp.addEventListener('input', () => { if (!canProv()) return; l.planned[sv][m] = Math.max(0, Math.round(+inp.value || 0)); refreshCard(card, l); saving(); });
          inp.addEventListener('change', () => { inp.value = l.planned[sv][m]; selfEmit = true; GX.emit('data:budget', { line: l.id }); selfEmit = false; });
          inp.addEventListener('focus', () => inp.select());
          inp.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return; e.preventDefault();
            const rows = [...card.querySelectorAll('tbody tr')], ri = rows.indexOf(inp.closest('tr')) + (e.shiftKey ? -1 : 1);
            (rows[ri]?.querySelector(`input[data-m="${m}"]`) || card.querySelector(`tbody tr:first-child input[data-m="${Math.min(11, m + 1)}"]`))?.focus();
          });
        });
      }
      const persistOpen = () => GX.store.set('bud.expanded', [...open]);
      function togglePl(card) {
        const id = card.dataset.pl, l = allLines().find((x) => x.id === id), wrap = card.querySelector('.bud-gwrap'), h0 = wrap.offsetHeight;
        if (open.has(id)) { open.delete(id); card.classList.remove('open'); GX.animate(wrap, [{ height: h0 + 'px' }, { height: '0px' }], { spring: 'snappy' }).onfinish = () => { if (!open.has(id)) wrap.innerHTML = ''; }; }
        else { open.add(id); card.classList.add('open'); wrap.innerHTML = gridHTML(l); wireGrid(card, l); GX.animate(wrap, [{ height: '0px', opacity: .4 }, { height: wrap.scrollHeight + 'px', opacity: 1 }], { spring: 'snappy' }); }
        card.querySelector('[data-toggle-pl]').setAttribute('aria-expanded', open.has(id)); persistOpen();
      }
      function wireProv() {
        $b.querySelectorAll('.bud-pcard').forEach((card) => {
          card.querySelector('[data-toggle-pl]').onclick = () => togglePl(card);
          if (open.has(card.dataset.pl)) wireGrid(card, allLines().find((x) => x.id === card.dataset.pl));
        });
      }

      /* ---------- Rendu ---------- */
      function renderBody() {
        const ts = $b.querySelector('[data-tscroll]'), keep = { b: $b.scrollTop, t: ts?.scrollTop || 0, l: ts?.scrollLeft || 0 };
        $b.classList.toggle('t-prov', tab === 'prov');
        if (tab === 'real') $b.innerHTML = realHTML(compute(f)); else { $b.innerHTML = provHTML(); wireProv(); }
        $b.scrollTop = keep.b; const t2 = $b.querySelector('[data-tscroll]'); if (t2) { t2.scrollTop = keep.t; t2.scrollLeft = keep.l; }
        first = false;
      }
      function setTab(t) {
        tab = t; GX.store.set('bud.tab', t);
        const tb = body.querySelector('[data-tabs]'); tb.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === t)); GX.ui.refresh?.(tb.parentElement);
        first = true; renderFilters(); renderBody(); $b.scrollTop = 0;
        win.setTitle('Budget', t === 'prov' ? 'Provisions' : 'Suivi réalisé');
      }
      body.querySelector('[data-tabs]').addEventListener('change', (e) => { if (e.detail !== tab) setTimeout(() => setTab(e.detail), 120); });

      win.setTitle('Budget', tab === 'prov' ? 'Provisions' : 'Suivi réalisé');
      renderFilters(); renderBody();
      const busy = () => body.contains(document.activeElement) && document.activeElement.matches('input');
      const off = [
        GX.on('ctx', () => { f.sites = fromCtx(); first = true; renderFilters(); renderBody(); }),
        GX.on('data:projects', () => { if (!busy()) renderBody(); }),
        GX.on('data:expenses', () => { if (!busy()) renderBody(); }),
        GX.on('data:budget', () => { if (!selfEmit && !busy()) renderBody(); }),
      ];
      return {
        destroy: () => { off.forEach((o) => o()); clearTimeout(saveT); },
        command: (c) => { if (c === 'prov' && tab !== 'prov') setTab('prov'); if (c === 'real' && tab !== 'real') setTab('real'); },
        menus: () => ({
          'Fichier': [{ label: 'Exporter vers Excel…', icon: 'export', disabled: !GX.shell?.canOpen?.('export'), action: () => GX.wm.open('export') },
            { label: 'Nouvelle dépense…', icon: 'plus', disabled: !GX.shell?.canOpen?.('fixed') || GX.ctx.readOnly, action: () => { const w = GX.wm.open('fixed'); setTimeout(() => (w || GX.wm.active())?.inst?.command?.('expense'), 450); } }],
          'Présentation': [{ label: 'Suivi réalisé', checked: tab === 'real', action: () => tab !== 'real' && setTab('real') }, { label: 'Provisions', checked: tab === 'prov', action: () => tab !== 'prov' && setTab('prov') }, '-',
            { label: 'Déplier toutes les enveloppes', icon: 'chevdown', disabled: tab !== 'prov', action: () => { provLines().forEach((l) => open.add(l.id)); persistOpen(); renderBody(); } },
            { label: 'Replier toutes les enveloppes', icon: 'chevup', disabled: tab !== 'prov', action: () => { open.clear(); persistOpen(); renderBody(); } }, '-',
            { label: 'Réinitialiser les filtres', icon: 'refresh', disabled: !nAct(), action: reset }],
        }),
      };
    },
  });
})();
