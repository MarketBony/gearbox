/* =====================================================================
   Rubrique « Dashboard » — Cockpit général (miroir de pages/Dashboard.tsx)
   Mise en page : modèle validé maquettes/ux/project/Main.dc.html
   (en-tête + Exporter / Nouveau projet, carte de filtres sur deux lignes,
   6 KPI en grands chiffres, trajectoire + mix, échéances + publications,
   écart prévu/réalisé pleine largeur).
   Filtres réels : période (du/au), périmètre MULTI (plaques, sites, Nissan),
   marques MULTI (puces), services MULTI (puces), PRO+ 3 états.
   Blocs réels : 6 KPI, trajectoire, mix activité, prochaines échéances,
   prochaines publications, écart prévu/réalisé, projets en retard,
   performance des campagnes (6 tuiles + tableau par canal), budget par
   canal, top consommateurs (sites ET prestataires), charge de l'équipe.
   Mêmes calculs : brouillons exclus, Holding tracké mais jamais imputé,
   périmètre testé sur la DESTINATION budgétaire (Nissan jamais implicite),
   taux de campagne pondérés par la volumétrie. Chef de site : périmètre
   borné à ses concessions, blocs « marketing » masqués (hasSocialFeatures).
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt;
  const BRANDS = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize'];
  const MIX_COLOR = { VN: '#f75632', VO: '#8f12ab', APV: '#5b7fd6', PR: '#06b6d4' };   // couleurs du Dashboard réel
  const ALIAS = { Thiers: 'Ricoux', Ambert: 'Ricoux' };
  const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
  /* Ventilation GROUPE BONY (copie de DISTRIBUTION_GROUPE_BONY, constants.ts) — pour les dépenses « GROUPE BONY » */
  const GB = { Clermont: 20.59, Mozac: 4.64, Massagettes: 1.45, Ussel: 2.32, Vichy: 7, Moulins: 5, Ricoux: 4, Issoire: 5, 'Le Puy-en-Velay': 6.48, Mende: 2.52,
    Albi: 6.08, Aurillac: 6.08, Figeac: 2.56, Villefranche: 1.6, Millau: 2.24, Rodez: 7.68, Gaillac: 3.52, Lavaur: .64, Carmaux: 1.6, Nissan: 9 };

  GX.css(`
  .dsh-break{flex-basis:100%;height:1px;background:var(--line);margin:4px 0}
  .dsh-fstate{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:6px;padding-bottom:4px;font-size:13px;color:var(--text-2);white-space:nowrap}
  .dsh-link{font-size:13px;font-weight:600;color:var(--accent);cursor:pointer;background:none;border:0;padding:0;font-family:inherit;white-space:nowrap}
  .dsh-link:hover{text-decoration:underline}
  .dsh-body{padding:6px 30px 40px;display:grid;grid-template-columns:minmax(0,1fr);gap:24px}
  .dsh-lbl{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3)}
  .dsh-h2{margin:0;font-family:var(--font-display);font-weight:700;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--text);display:flex;align-items:center;gap:8px}
  .dsh-hint{margin-top:6px;font-size:13px;line-height:1.45;color:var(--text-2)}
  .dsh-h{display:flex;align-items:flex-start;justify-content:space-between;gap:10px 18px;flex-wrap:wrap}
  .dsh-legend{display:flex;gap:8px 18px;flex-wrap:wrap;font-size:13px;font-weight:600;color:var(--text-2)}
  .dsh-legend>span{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
  .dsh-legend i{display:inline-block;width:10px;height:10px;border-radius:3px}
  .dsh-legend i.dash{width:18px;height:0;border-radius:0;border-top:2px dashed var(--text-2)}
  .dsh-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
  .dsh-kpi{padding:24px;min-height:176px;display:flex;flex-direction:column;gap:14px;position:relative;overflow:hidden}
  .dsh-kpi::before{content:"";position:absolute;left:0;top:24px;bottom:24px;width:3px;border-radius:0 3px 3px 0;background:var(--kc)}
  .dsh-kpi .top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
  .dsh-kpi .ic{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--kc) 14%,transparent);color:var(--kc)}
  .dsh-kv{font-family:var(--font-display);font-weight:700;font-size:30px;letter-spacing:-.01em;line-height:1.05;color:var(--text);overflow-wrap:anywhere}
  .dsh-kv small{font-family:var(--font-ui);font-size:16px;font-weight:600;margin-left:8px;color:var(--text-2);letter-spacing:0}
  .dsh-kpi .foot{margin-top:auto;font-size:14px;line-height:1.45;color:var(--text-2)}
  .dsh-rb{display:grid;grid-template-columns:128px 1fr 44px;align-items:center;gap:10px;font-size:12.5px;color:var(--text-2)}
  .dsh-rb b{text-align:right;color:var(--text)}
  .dsh-card{padding:24px 28px;display:flex;flex-direction:column;gap:18px;min-width:0;min-height:0}
  .dsh-g21{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:24px}
  .dsh-g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
  .dsh-list{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;overflow:auto;max-height:392px;padding-right:2px}
  .dsh-row{display:flex;align-items:center;gap:16px;padding:14px 16px;border-radius:12px;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line);cursor:pointer;transition:background var(--t-fast),box-shadow var(--t-fast);min-width:0}
  .dsh-row:hover{background:var(--surface-4);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 45%,transparent)}
  .dsh-row .t{font-size:15px;font-weight:700;color:var(--text)}
  .dsh-row .s{margin-top:4px;font-size:13px;color:var(--text-2)}
  .dsh-row .in{font-size:13px;font-weight:700;white-space:nowrap}
  .dsh-date{width:48px;height:48px;border-radius:10px;flex:none;display:grid;place-content:center;text-align:center;background:var(--text);color:var(--surface-1)}
  .dsh-date span{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--danger);line-height:1.1}
  .dsh-date b{font-size:18px;line-height:1}
  .dsh-late{box-shadow:inset 3px 0 0 var(--danger),inset 0 0 0 1px var(--line)}
  .dsh-mix{display:flex;justify-content:center;padding:4px 0}
  .dsh-mixl{display:grid;gap:12px}
  .dsh-mixl .row{gap:10px;font-size:14px}
  .dsh-mixl i{width:10px;height:10px;border-radius:50%;flex:none}
  .dsh-gaps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:48px;row-gap:18px}
  .dsh-gap{display:flex;flex-direction:column;gap:7px;cursor:pointer;min-width:0}
  .dsh-gap .bar{height:6px}
  .dsh-gap .ft{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--text-3)}
  .dsh-tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
  .dsh-tile{padding:14px 16px;border-radius:12px;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line);min-width:0}
  .dsh-tile b{font-size:20px;display:block;margin:6px 0 2px;font-family:var(--font-display);letter-spacing:-.01em;color:var(--text)}
  .dsh-tile .faint{font-size:12px}
  .dsh-sub{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3);display:flex;align-items:center;gap:6px}
  .dsh-team{display:grid;grid-template-columns:auto minmax(0,1fr) minmax(60px,120px) 30px;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}
  .dsh-team:last-child{border-bottom:0}
  .dsh-empty{padding:26px 12px;text-align:center;color:var(--text-3);font-size:13.5px;border:1.5px dashed var(--line-2);border-radius:12px}
  .tbl.zebra tbody tr:nth-child(even){background:color-mix(in srgb,var(--surface-3) 45%,transparent)}
  @container app (max-width:1250px){.dsh-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @container app (max-width:1000px){.dsh-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.dsh-g21,.dsh-g2{grid-template-columns:minmax(0,1fr);gap:18px}.dsh-gaps{grid-template-columns:minmax(0,1fr)}.dsh-body{gap:18px}}
  @container app (max-width:720px){.dsh-body{padding:4px 12px 28px;gap:14px}.dsh-card{padding:18px 16px;gap:14px}.dsh-kpi{padding:18px 18px;min-height:0}.dsh-kpi::before{top:18px;bottom:18px}.dsh-kv{font-size:24px}.dsh-fstate{margin-left:0;align-items:flex-start;flex-direction:row;gap:12px}.dsh-hsub{display:none}}
  @container app (max-width:560px){.dsh-kpis{grid-template-columns:minmax(0,1fr);gap:12px}.dsh-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.dsh-row{gap:12px;padding:12px}.dsh-row .t{font-size:14px}.dsh-rb{grid-template-columns:104px 1fr 40px}.dsh-head-x{display:none}}
  `);

  /* ---------- Périmètre : test sur la DESTINATION (isDestinationInScope de constants.ts) ---------- */
  const inScope = (dest, sc) => {
    if (!sc.length) return true;
    if (sc.includes(dest)) return true;
    if (dest === 'Nissan') return false;                                    // Nissan : jamais implicite
    const real = dest.startsWith('Alpine-') ? (dest === 'Alpine-Le Puy' ? 'Le Puy-en-Velay' : dest.slice(7)) : dest;
    return sc.includes(real) || sc.some((s) => ALIAS[s] === real);
  };
  /* Parts d'un élément, éclatées en destinations (routage partagé de data.js, Holding retiré : il est tracké) */
  const partsOf = (it, shares) => Object.entries(shares).flatMap(([raw, pct]) => pct <= 0 ? [] :
    D.routeItem({ sites: [raw], brands: it.brands.filter((b) => b !== 'Holding'), amount: pct, distribution: null, alpineShare: it.alpineShare, nissanShare: it.nissanShare })
      .map(([dest, v]) => ({ raw, dest, pct: v })));
  const projShares = (p) => p.sites.length > 1 && p.distribution ? p.distribution : { [p.sites[0]]: 100 };
  const expShares = (e) => e.sites[0] === 'GROUPE BONY' ? GB : { [e.sites[0]]: 100 };
  const midnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

  function compute(f) {
    const sc = f.ctxs, dStart = new Date(f.from), dEnd = new Date(f.to + 'T23:59:59'), chartYear = dStart.getFullYear(), today = midnight(), todayIso = GX.iso(GX.today());
    const brandIn = (bs) => !f.brands.length || bs.includes('Holding') || f.brands.some((b) => bs.includes(b));
    const svcIn = (ss) => !f.services.length || ss.includes('Tous Services') || f.services.some((s) => ss.includes(s));
    const proIn = (v) => f.pro === 'all' || (f.pro === 'pro' ? !!v : !v);
    const isHolding = (bs) => bs.includes('Holding');
    let forecast = 0, actual = 0, engADate = 0, active = 0, programmed = 0, sumProg = 0, nActive = 0;
    const trend = Array.from({ length: 12 }, () => ({ prevu: 0, reel: 0 })), mix = { VN: 0, VO: 0, APV: 0, PR: 0 };
    const byCanal = {}, bySite = {}, byProv = {}, charge = {}, gaps = [], late = [];
    const perf = { SMS: { volume: 0, o: 0, c: 0, n: 0, s: 0, cout: 0, envois: 0 }, 'E-mail': { volume: 0, o: 0, c: 0, n: 0, s: 0, cout: 0, envois: 0 } };
    const hit = (svcs) => svcs.includes('Tous Services') ? D.SERVICES : svcs.filter((s) => D.SERVICES.includes(s));

    // Enveloppes (prévu)
    D.BUDGET_LINES.forEach((l) => {
      if (!inScope(l.id, sc) || !brandIn(l.brands)) return;
      D.SERVICES.forEach((sv) => { if (f.services.length && !f.services.includes(sv)) return; l.planned[sv].forEach((v, m) => { trend[m].prevu += v; const c = new Date(chartYear, m, 15); if (c >= dStart && c <= dEnd) forecast += v; }); });
    });
    // Projets (réalisé)
    D.PROJECTS.forEach((p) => {
      if (p.status === 'Draft') return;                                   // brouillon : nulle part
      if (!proIn(p.proPlus)) return;
      const parts = partsOf(p, projShares(p)).filter((d) => inScope(d.dest, sc));
      if (!parts.length || !brandIn(p.brands) || !svcIn(p.services)) return;
      const prog = D.projectProgress(p);
      if (p.status === 'Active') { active++; sumProg += prog; nActive++; }
      if (p.status !== 'Archived' && new Date(p.endDate) < today && prog < 100) late.push(p);
      p.tasks.forEach((t) => { if ((t.status === 'Todo' || t.status === 'InProgress') && t.assignee) charge[t.assignee] = (charge[t.assignee] || 0) + 1; });
      programmed += p.tasks.filter((t) => (t.channel === 'SMS' || t.channel === 'E-mail') && t.status === 'Programmed').length;
      if (isHolding(p.brands)) return;                                     // Holding : tracké, jamais imputé
      const total = D.projectActual(p), share = parts.reduce((s, d) => s + d.pct, 0) / 100, cost = total * share, pd = new Date(p.startDate);
      if (pd.getFullYear() === chartYear) trend[pd.getMonth()].reel += cost;
      if (pd < dStart || pd > dEnd) return;
      actual += cost; if (pd <= today) engADate += cost;
      if (p.budgetPlanned > 0) gaps.push({ p, prevu: p.budgetPlanned, realise: total, ecart: total - p.budgetPlanned });
      parts.forEach(({ raw, pct }) => { const s = ALIAS[raw] || raw; bySite[s] = (bySite[s] || 0) + total * pct / 100; });
      p.tasks.forEach((t) => {
        const ct = (t.cost || 0) * share;
        if (t.channel) byCanal[t.channel] = (byCanal[t.channel] || 0) + ct;
        if (t.provider) { const e = byProv[t.provider] ||= { v: 0, n: 0 }; e.v += ct; e.n++; }
        const c = perf[t.channel];
        if (c && t.volume > 0) { const v = t.volume; c.volume += v; c.envois++; c.cout += ct; c.o += v * (t.openRate || 0) / 100; c.c += v * (t.clickRate || 0) / 100; c.n += v * (t.npai || 0) / 100; c.s += v * (t.stop || 0) / 100; }
      });
      const hs = hit(p.services); hs.forEach((s) => (mix[s] += cost / hs.length));
    });
    // Dépenses fixes (réalisé)
    D.EXPENSES.forEach((e) => {
      if (!proIn(e.proPlus) || isHolding(e.brands) || !brandIn(e.brands) || !svcIn([e.service]) || !e.amount) return;
      const ed = new Date(e.date), hs = hit([e.service]);
      Object.entries(expShares(e)).forEach(([raw, pct]) => {
        const frac = partsOf(e, { [raw]: 100 }).filter((d) => inScope(d.dest, sc)).reduce((s, d) => s + d.pct / 100, 0); if (frac <= 0) return;
        const cost = e.amount * (pct / 100) * frac;
        const contribs = e.annual ? Array.from({ length: 12 }, (_, m) => [m, cost / 12]) : [[ed.getMonth(), cost]];
        contribs.forEach(([m, c]) => {
          if (ed.getFullYear() === chartYear) trend[m].reel += c;
          const chk = e.annual ? new Date(ed.getFullYear(), m, 15) : ed;
          if (chk >= dStart && chk <= dEnd) { actual += c; if (chk <= today) engADate += c; hs.forEach((s) => (mix[s] += c / hs.length)); }
        });
      });
    });
    const sortTop = (o, n) => Object.entries(o).map(([k, v]) => [k, Math.round(v)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
    const w = (num, vol) => vol > 0 ? +((num / vol) * 100).toFixed(1) : 0;
    const perfCanal = ['SMS', 'E-mail'].map((k) => { const d = perf[k]; return { canal: k, envois: d.envois, volume: d.volume, cout: Math.round(d.cout), o: w(d.o, d.volume), c: w(d.c, d.volume), cpc: d.volume ? d.cout / d.volume : 0 }; }).filter((d) => d.volume > 0);
    const V = perf.SMS.volume + perf['E-mail'].volume, sum = (k) => perf.SMS[k] + perf['E-mail'][k];
    const dur = dEnd - dStart, el = Math.min(Math.max(Date.now() - dStart, 0), dur);
    return {
      forecast, actual, active, programmed, trend, mix, late: late.sort((a, b) => a.endDate.localeCompare(b.endDate)),
      avgProg: nActive ? Math.round(sumProg / nActive) : 0,
      gaps: gaps.sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart)).slice(0, 6).map((g) => ({ ...g, pct: g.prevu ? Math.round((g.ecart / g.prevu) * 100) : 0 })),
      canal: sortTop(byCanal, 8), sites: sortTop(bySite, 5),
      provs: Object.entries(byProv).map(([k, v]) => [k, Math.round(v.v), v.n]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5),
      charge: Object.entries(charge).sort((a, b) => b[1] - a[1]),
      perfCanal, perfG: { volume: V, envois: sum('envois'), o: w(sum('o'), V), c: w(sum('c'), V), n: w(sum('n'), V), s: w(sum('s'), V), cout: Math.round(sum('cout')), cpc: V ? sum('cout') / V : 0 },
      pctTemps: dur > 0 ? Math.round((el / dur) * 100) : 0, pctADate: forecast ? Math.round((engADate / forecast) * 100) : 0, pctPeriode: forecast ? Math.round((actual / forecast) * 100) : 0,
      deadlines: D.PROJECTS.filter((p) => p.status === 'Active' && p.sites.some((s) => inScope(ALIAS[s] || s, sc)) && proIn(p.proPlus) && p.endDate >= todayIso).sort((a, b) => a.endDate.localeCompare(b.endDate)).slice(0, 10),
      posts: D.POSTS.filter((p) => (!sc.length || p.concessions.includes('GROUPE BONY') || sc.some((c) => p.concessions.includes(c))) && (!f.brands.length || p.brands.includes('Holding') || f.brands.some((b) => p.brands.includes(b)))
        && !p.archived && p.status !== 'Publié' && p.status !== 'Abandonné' && p.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10),
    };
  }

  GX.registerApp({
    id: 'dashboard', name: 'Dashboard', icon: 'dashboard', tint: ['#f75632', '#c2185b'], size: [1240, 800], minSize: [380, 360],
    mount(body, win) {
      const y = new Date().getFullYear();
      const perToCtx = () => GX.ctx.site ? [GX.ctx.site] : !GX.ctx.perimetre || GX.ctx.perimetre === 'Tout le réseau' ? [] : [GX.ctx.perimetre];
      const f = { from: `${y}-01-01`, to: `${y}-12-31`, ctxs: perToCtx(), brands: [], services: [], pro: 'all' };
      let lastPer = GX.ctx.perimetre, lastRole = GX.ctx.role, showF = !win.isCompact(), stamp = Date.now();
      // Un filtre « actif » restreint les chiffres : les dates n'en font pas partie (comme le vrai Dashboard)
      const nActive = () => (f.ctxs.length && !GX.ctx.site ? 1 : 0) + (f.brands.length ? 1 : 0) + (f.services.length ? 1 : 0) + (f.pro !== 'all' ? 1 : 0);
      const isYear = () => f.from.endsWith('-01-01') && f.to.endsWith('-12-31') && f.from.slice(0, 4) === f.to.slice(0, 4);
      const summary = () => [isYear() ? f.from.slice(0, 4) : GX.ui.periodLabel(f.from, f.to), f.ctxs.length ? GX.ui.summary(f.ctxs) : 'Tout le réseau', f.brands.length && GX.ui.summary(f.brands), f.services.length && GX.ui.summary(f.services), f.pro === 'pro' ? 'PRO+ seul' : f.pro === 'standard' ? 'Sans PRO+' : null].filter(Boolean).join(' · ');
      const siteTxt = (p) => { if (!GX.ctx.site) return p.sites.length > 2 ? `${p.sites[0]} +${p.sites.length - 1}` : p.sites.join(', '); const n = p.sites.filter((s) => s !== GX.ctx.site).length; return GX.ctx.site + (n ? ` · +${n} masqué${n > 1 ? 's' : ''}` : ''); };
      const dateBox = (d) => `<div class="dsh-date"><span>${new Date(d).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</span><b class="num">${new Date(d).getDate()}</b></div>`;
      const days = (d) => Math.round((new Date(new Date(d).toDateString()) - new Date(new Date().toDateString())) / 864e5);
      const resetAll = () => Object.assign(f, { from: `${y}-01-01`, to: `${y}-12-31`, ctxs: perToCtx(), brands: [], services: [], pro: 'all' });
      const brandChips = (vals, sel, attr) => `<div class="chips" data-multi ${attr}><button class="chip" data-v="" aria-pressed="${!sel.length}">Toutes</button>${vals.map((b) => `<button class="chip" data-v="${b}" aria-pressed="${sel.includes(b)}"><i class="brand-dot" style="--c:${D.brand(b).hex}"></i>${b}</button>`).join('')}</div>`;

      const render = () => {
        const sc0 = body.querySelector('.app-body')?.scrollTop || 0;
        const c = compute(f), sm = GX.ctx.role === 'Site Manager', mkt = !sm;           // hasSocialFeatures : blocs marketing masqués au chef de site
        const burn = c.forecast ? (c.actual / c.forecast) * 100 : 0, rest = c.forecast - c.actual, gap = c.pctADate - c.pctTemps;
        const gapC = gap > 10 ? 'var(--danger)' : gap < -10 ? 'var(--warn)' : 'var(--ok)';
        const canNew = !GX.ctx.readOnly && GX.shell?.canOpen?.('projects') !== false, canExport = GX.shell?.canOpen?.('export');
        let ki = 0;
        /* KPI au format du modèle : libellé + pastille d'icône, grand chiffre Syncopate, pied de carte */
        const k = (ic, col, t, v, unit, foot, extra = '', vColor = '') => `<div class="card dsh-kpi enter" style="--i:${ki++};--kc:${col}"><div class="top"><span class="dsh-lbl">${t}</span><span class="ic">${GX.icon(ic, 'sm')}</span></div>
          <div class="dsh-kv num" style="${vColor ? `color:${vColor}` : ''}">${v}${unit ? `<small>${unit}</small>` : ''}</div>${extra}<p class="foot" style="margin-bottom:0">${foot}</p></div>`;
        const rb = (l, p, col, strong) => `<div class="dsh-rb"><span>${l}</span><div class="bar" style="height:7px"><i style="width:${Math.min(100, p)}%;--c:${col}"></i></div><b class="num" style="${strong ? '' : 'color:var(--text-3)'}">${p} %</b></div>`;
        const empty = (t) => `<div class="dsh-empty">${t}</div>`;
        const head = (title, hint, right = '') => `<div class="dsh-h"><div style="min-width:0"><h2 class="dsh-h2">${title}</h2>${hint ? `<div class="dsh-hint">${hint}</div>` : ''}</div>${right}</div>`;
        const ok = (x) => !GX.ctx.site || x.sites.includes(GX.ctx.site);
        const mixParts = D.SERVICES.map((s) => ({ label: s, value: Math.round(c.mix[s]), color: MIX_COLOR[s] })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
        const mixTot = mixParts.reduce((s, p) => s + p.value, 0) || 1;
        const n = nActive();
        body.innerHTML = `<div class="app">
          <div class="app-head">
            <div class="ah-t"><h1 class="display">Cockpit général</h1><span class="sub"><span class="dsh-hsub">Vue consolidée et analyse de la performance · </span>mise à jour ${F.ago(stamp)}</span></div>
            <div class="ah-f">
              <button class="btn ${showF ? '' : 'primary'}" data-togf data-tip="${GX.esc(summary())}">${GX.icon('filter', 'sm')}Filtres${n ? ` <span class="count">${n}</span>` : ''}</button>
              ${canExport ? `<button class="btn dsh-head-x" data-export>${GX.icon('download', 'sm')}Exporter</button>` : ''}
              ${canNew ? `<button class="btn primary" data-newp>${GX.icon('plus', 'sm')}Nouveau projet</button>` : ''}
            </div>
          </div>
          <div class="app-head2 ${showF ? '' : 'hide'}">
            <div><span class="label">Période</span>${GX.ui.pickerBtn('data-period', 'agenda', isYear() ? `Année ${f.from.slice(0, 4)}` : GX.ui.periodLabel(f.from, f.to), !isYear())}</div>
            <div><span class="label">Périmètre</span>${GX.ui.pickerBtn('data-peri', 'pin', sm ? GX.ui.summary(f.ctxs, { all: GX.ctx.site }) : GX.ui.summary(f.ctxs, { all: 'Tout le réseau' }), f.ctxs.length && !sm)}</div>
            <div><span class="label">Client B2B (PRO+)</span><div class="seg" data-fp>${[['all', 'Tout'], ['standard', 'Sans PRO+'], ['pro', 'PRO+ uniquement']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${f.pro === v}">${l}</button>`).join('')}</div></div>
            <div class="dsh-fstate"><span>${n ? `${n} filtre${n > 1 ? 's' : ''} actif${n > 1 ? 's' : ''}` : 'Aucun filtre actif'}</span><button class="dsh-link" data-reset>Réinitialiser</button></div>
            <div class="dsh-break"></div>
            <div><span class="label">Marque</span>${brandChips(BRANDS, f.brands, 'data-fb')}</div>
            <div><span class="label">Service</span>${GX.ui.chips(D.SERVICES, f.services, { all: 'Tous', attr: 'data-fs' })}</div>
          </div>
          <div class="app-body scroll"><div class="dsh-body">
          <div class="dsh-kpis">
            ${k('budget', 'var(--bony-orange)', 'Budget consommé', F.n(Math.round(c.actual)), '€', `Sur ${F.eur(c.forecast)} prévus sur la période · <b style="color:${burn > 100 ? 'var(--danger)' : 'var(--ok)'}">${burn.toFixed(1).replace('.', ',')} %</b>`, `<div class="bar ${burn > 100 ? 'over' : ''}" style="height:6px"><i style="width:${Math.min(100, burn)}%;${burn > 100 ? '--c:var(--danger)' : ''}"></i></div>`)}
            ${k('target', 'var(--info)', 'Reste à engager', F.n(Math.round(rest)), '€', rest < 0 ? 'Dépassement budgétaire sur la période.' : 'Disponible pour de nouveaux projets.', '', rest < 0 ? 'var(--danger)' : '')}
            ${k('layers', 'var(--ok)', 'Projets actifs', c.active, '', '<span style="color:var(--ok);font-weight:700">● En cours de réalisation</span> sur le périmètre.')}
            ${k('campaigns', 'var(--bony-violet)', 'Campagnes programmées', c.programmed, '', 'Envois SMS / e-mail au statut « programmé ».')}
            ${k('alert', c.late.length ? 'var(--danger)' : 'var(--ok)', 'Projets en retard', c.late.length, '', 'Échéance dépassée, avancement inférieur à 100 %.', '', c.late.length ? 'var(--danger)' : 'var(--ok)')}
            ${k('trending', gapC, 'Avance / retard de budget', `${gap > 0 ? '+' : gap < 0 ? '−' : ''}${Math.abs(gap)}`, 'points',
              `Engagé ${c.pctADate} % pour ${c.pctTemps} % de la période écoulée : ${gap > 10 ? 'vous engagez plus vite que le temps ne passe, le budget risque de manquer.' : gap < -10 ? 'le budget risque de rester non engagé.' : 'engagements au rythme du calendrier.'}`,
              `<div style="display:grid;gap:6px">${rb('Engagé à date', c.pctADate, 'var(--bony-orange)', true)}${rb('Période écoulée', c.pctTemps, 'var(--text-3)')}<div class="dsh-rb" style="grid-template-columns:auto 1fr"><span>Engagé sur la période</span><b class="num" style="text-align:left;color:var(--text-2)">${c.pctPeriode} %</b></div></div>`, gapC)}
          </div>
          <div class="dsh-g21">
            <div class="card dsh-card">${head(`Trajectoire mensuelle ${new Date(f.from).getFullYear()}`, 'Réalisé ventilé des projets et dépenses, face à l’enveloppe du périmètre.', `<div class="dsh-legend"><span><i class="dash"></i>Budget mensuel</span><span><i style="background:var(--bony-orange)"></i>Réalisé</span></div>`)}
              ${GX.chart.bars({ labels: MONTHS, series: [{ name: 'Réalisé mensuel', values: c.trend.map((m) => Math.round(m.reel)) }], line: { name: 'Budget mensuel', values: c.trend.map((m) => Math.round(m.prevu)) }, height: 280 })}</div>
            <div class="card dsh-card">${head('Mix activité', 'Réalisé de la période, par service.')}
              ${mixParts.length ? `<div class="dsh-mix">${GX.chart.donut({ parts: mixParts, size: 190, thickness: 24, center: F.eurK(c.actual), sub: 'engagés' })}</div>
                <div class="dsh-mixl">${mixParts.map((p) => `<div class="row"><i style="background:${p.color}"></i><b>${p.label}</b><span class="grow"></span><span class="muted num">${F.eurK(p.value)}</span><b class="num" style="width:44px;text-align:right">${Math.round((p.value / mixTot) * 100)} %</b></div>`).join('')}</div>` : empty('Aucune donnée')}</div>
          </div>
          <div class="dsh-g2">
            <div class="card dsh-card">${head('Prochaines échéances', 'Projets actifs dont la fin approche.', `<button class="dsh-link" data-open="projects">Tous les projets →</button>`)}
              <div class="dsh-list">${c.deadlines.filter(ok).map((p) => { const d = days(p.endDate); return `<div class="dsh-row" data-proj="${p.id}">${dateBox(p.endDate)}<div class="grow" style="min-width:0"><div class="t ellipsis">${GX.esc(p.name)}</div><div class="s ellipsis">${GX.esc(siteTxt(p))} · ${p.type}</div></div><span class="in" style="color:${d <= 7 ? 'var(--warn)' : 'var(--text-2)'}">${F.rel(p.endDate)}</span></div>`; }).join('') || empty('Aucune échéance à venir')}</div></div>
            <div class="card dsh-card">${head('Prochaines publications', 'Publications à venir, hors publiées et abandonnées.', GX.shell?.canOpen?.('digital') === false ? '' : `<button class="dsh-link" data-open="digital">Calendrier éditorial →</button>`)}
              <div class="dsh-list">${c.posts.map((p) => `<div class="dsh-row" data-post="${p.id}">${dateBox(p.date)}<div class="grow" style="min-width:0"><div class="t ellipsis">${GX.esc(p.title)}</div><div class="s row" style="gap:6px;flex-wrap:wrap">${p.networks.slice(0, 4).map((nw) => GX.r.net(nw)).join('')}${GX.r.brandChips(p.brands)}</div></div>${GX.r.sStatus(p.status)}</div>`).join('') || empty('Aucune publication à venir')}</div></div>
          </div>
          <div class="card dsh-card">${head('Écart prévu / réalisé', `Projets avec un budget prévisionnel · avancement moyen des projets actifs : <b style="color:var(--text)">${c.avgProg} %</b>`, `<div class="dsh-legend"><span><i style="background:var(--text-3)"></i>Prévu</span><span><i style="background:var(--danger)"></i>Dépassement</span><span><i style="background:var(--ok)"></i>Sous budget</span></div>`)}
            ${c.gaps.length ? `<div class="dsh-gaps">${c.gaps.map((g) => { const m = Math.max(g.prevu, g.realise) || 1, col = g.ecart > 0 ? 'var(--danger)' : 'var(--ok)'; return `<div class="dsh-gap" data-proj="${g.p.id}"><div class="row" style="gap:10px;font-size:14px"><b class="ellipsis grow">${GX.esc(g.p.name)}</b><b class="num" style="color:${col}">${g.ecart > 0 ? '+' : g.ecart < 0 ? '−' : ''}${Math.abs(g.pct)} %</b></div>
              <div class="bar"><i style="width:${(g.prevu / m) * 100}%;--c:var(--text-3)"></i></div><div class="bar"><i style="width:${(g.realise / m) * 100}%;--c:${col}"></i></div>
              <div class="ft num"><span>Prévu ${F.eur(g.prevu)}</span><span>Réalisé ${F.eur(g.realise)}</span></div></div>`; }).join('')}</div>` : empty('Aucun prévisionnel saisi sur la période')}</div>
          <div class="dsh-g2">
            <div class="card dsh-card">${head(`Projets en retard${c.late.length ? ` <span class="badge solid" style="--c:var(--danger)">${c.late.length}</span>` : ''}`, 'Échéance dépassée et avancement incomplet. Triés du plus ancien retard.')}
              <div class="dsh-list">${c.late.filter(ok).map((p) => { const pr = D.projectProgress(p); return `<div class="dsh-row dsh-late" data-proj="${p.id}"><div class="grow" style="min-width:0"><div class="t ellipsis">${GX.esc(p.name)}</div><div class="s">${GX.esc(siteTxt(p))} · <span style="color:var(--danger);font-weight:600">fin ${F.date(p.endDate)} · ${F.rel(p.endDate)}</span></div></div><div style="width:110px;flex:none"><div class="bar" style="height:6px"><i style="width:${pr}%"></i></div><div class="num faint" style="font-size:12px;text-align:right;margin-top:4px">${pr} %</div></div></div>`; }).join('') || `<div class="dsh-empty" style="color:var(--ok)">Aucun projet en retard 🎉</div>`}</div></div>
            <div class="card dsh-card">${head('Budget par canal', 'Coûts des tâches, par canal de diffusion.')}${c.canal.length ? GX.chart.hbars({ items: c.canal.map(([l, v]) => ({ label: l, value: v, color: 'var(--bony-violet)' })) }) : empty('Aucune dépense')}</div>
          </div>
          ${mkt ? `<div class="card dsh-card">${head('Performance des campagnes', 'Envois SMS et e-mail du périmètre. <b style="color:var(--text)">Taux pondérés par la volumétrie</b> — une moyenne simple des taux serait faussée par les écarts de volume entre envois.')}
            ${c.perfG.volume ? `<div class="dsh-tiles">${[['Contacts touchés', F.n(c.perfG.volume), `${c.perfG.envois} envois`], ['Taux d’ouverture', `${c.perfG.o} %`, 'pondéré'], ['Taux de clic', `${c.perfG.c} %`, 'pondéré'], ['Coût / contact', `${c.perfG.cpc.toFixed(3).replace('.', ',')} €`, F.eur(c.perfG.cout)], ['NPAI', `${c.perfG.n} %`, 'adresses invalides'], ['Désabonnements', `${c.perfG.s} %`, 'STOP / désinscrits']]
              .map(([l, v, s]) => `<div class="dsh-tile"><div class="dsh-lbl ellipsis">${l}</div><b class="num">${v}</b><div class="faint ellipsis">${s}</div></div>`).join('')}</div>
              <div class="scroll"><table class="tbl zebra" style="min-width:560px"><thead><tr><th>Canal</th><th class="r">Envois</th><th class="r">Contacts</th><th class="r">Ouverture</th><th class="r">Clic</th><th class="r">Coût</th><th class="r">Coût / contact</th></tr></thead><tbody>
              ${c.perfCanal.map((x) => `<tr><td><b>${GX.icon(x.canal === 'SMS' ? 'sms' : 'mail', 'sm')} ${x.canal}</b></td><td class="r num muted">${x.envois}</td><td class="r num">${F.n(x.volume)}</td><td class="r num">${x.o} %</td><td class="r num">${x.c} %</td><td class="r num muted">${F.eur(x.cout)}</td><td class="r num" style="color:var(--bony-orange);font-weight:700">${x.cpc.toFixed(3).replace('.', ',')} €</td></tr>`).join('')}</tbody></table></div>`
              : empty('Aucune volumétrie saisie. Renseignez volumétrie et taux dans les tâches SMS / E-mail des projets pour activer ces indicateurs.')}</div>
          <div class="dsh-g2">
            <div class="card dsh-card">${head('Top consommateurs', 'Sites et prestataires, montants ventilés.')}
              <div class="dsh-sub">${GX.icon('building', 'sm')} Sites</div>${c.sites.length ? GX.chart.hbars({ items: c.sites.map(([l, v]) => ({ label: l, value: v })) }) : empty('—')}
              <div class="dsh-sub">${GX.icon('handshake', 'sm')} Prestataires</div>${c.provs.length ? GX.chart.hbars({ items: c.provs.map(([l, v, nb]) => ({ label: `${l} · ${nb} tâche${nb > 1 ? 's' : ''}`, value: v, color: 'var(--info)' })) }) : empty('—')}</div>
            <div class="card dsh-card">${head('Charge de l’équipe', 'Tâches encore ouvertes (à faire ou en cours), par personne.')}
              ${c.charge.length ? `<div>${(() => { const m = c.charge[0][1]; return c.charge.map(([u, nb]) => `<div class="dsh-team">${GX.r.av(u, 'sm')}<b class="ellipsis" style="font-size:14px">${GX.esc(D.user(u).name)}</b><div class="bar" style="height:7px"><i style="width:${(nb / m) * 100}%"></i></div><b class="num" style="text-align:right">${nb}</b></div>`).join(''); })()}</div>` : empty('Aucune tâche ouverte')}</div>
          </div>` : ''}
          </div></div></div>`;
        const ab = body.querySelector('.app-body'); if (ab) ab.scrollTop = sc0;
        wire();
      };

      const openIn = (app, cmd, origin) => { const w = GX.wm.open(app, {}, { origin }); if (cmd) setTimeout(() => (w || GX.wm.active())?.inst?.command?.(cmd), 450); };
      function wire() {
        const q = (s) => body.querySelector(s);
        q('[data-togf]').onclick = () => { showF = !showF; render(); };
        q('[data-reset]')?.addEventListener('click', () => { resetAll(); render(); });
        q('[data-export]')?.addEventListener('click', (e) => openIn('export', null, e.currentTarget));
        q('[data-newp]')?.addEventListener('click', (e) => openIn('projects', 'new-project', e.currentTarget));
        body.querySelectorAll('[data-open]').forEach((b) => b.onclick = (e) => openIn(b.dataset.open, null, e.currentTarget));
        q('[data-period]').onclick = (e) => GX.ui.dateRange(e.currentTarget, { from: f.from, to: f.to }, ({ from, to }) => { if (!from || !to) return; f.from = from; f.to = to < from ? from : to; render(); });
        q('[data-peri]').onclick = (e) => {
          if (GX.ctx.site) {                                              // chef de site : ses concessions seulement (restrictTo)
            const mine = D.USERS.find((u) => u.role === 'Site Manager')?.sites || [GX.ctx.site];
            return GX.ui.pick(e.currentTarget, [{ label: 'Mes concessions', items: mine.map((s) => ({ v: s, l: s })) }], { title: 'Périmètre', selected: f.ctxs, allLabel: 'Toutes mes concessions', onChange: (v) => { f.ctxs = v.length ? v : [GX.ctx.site]; render(); } });
          }
          GX.ui.sitePicker(e.currentTarget, f.ctxs, (v) => { f.ctxs = v; render(); }, { variant: 'filter' });
        };
        q('[data-fb]').addEventListener('change', (e) => { f.brands = e.detail; render(); });
        q('[data-fs]').addEventListener('change', (e) => { f.services = e.detail; render(); });
        q('[data-fp]').addEventListener('change', (e) => { f.pro = e.detail; setTimeout(render, 160); });
        body.querySelectorAll('[data-proj]').forEach((r) => r.onclick = () => { const p = D.project(r.dataset.proj); if (p) GX.wm.open('project', { id: p.id, title: p.name }, { origin: r }); });
        body.querySelectorAll('[data-post]').forEach((r) => r.onclick = () => openIn('digital', 'post:' + r.dataset.post, r));
      }

      render();
      const onCtx = () => {
        // Périmètre LOCAL : on ne le resynchronise que si le périmètre global (ou le rôle) a changé
        if (GX.ctx.perimetre !== lastPer || GX.ctx.role !== lastRole) { f.ctxs = perToCtx(); lastPer = GX.ctx.perimetre; lastRole = GX.ctx.role; }
        render();
      };
      const onData = () => { stamp = Date.now(); render(); };
      const tick = setInterval(() => { const s = body.querySelector('.app-head .sub'); if (s && s.lastChild) s.lastChild.textContent = `mise à jour ${F.ago(stamp)}`; }, 60000);
      const off = [GX.on('ctx', onCtx), GX.on('data:projects', onData)];
      return {
        destroy: () => { clearInterval(tick); off.forEach((o) => o()); },
        command: (cmd) => { if (cmd === 'filters') { showF = true; render(); } },
        menus: () => ({
          'Fichier': [
            ...(!GX.ctx.readOnly ? [{ label: 'Nouveau projet…', icon: 'plus', action: () => openIn('projects', 'new-project') }] : []),
            ...(GX.shell?.canOpen?.('export') ? [{ label: 'Exporter…', icon: 'download', action: () => openIn('export') }] : []),
          ],
          'Présentation': [
            { label: showF ? 'Masquer les filtres' : 'Afficher les filtres', icon: 'filter', action: () => { showF = !showF; render(); } },
            { label: 'Réinitialiser les filtres', icon: 'refresh', action: () => { resetAll(); render(); } }, '-',
            { label: 'Année en cours', checked: isYear() && f.from.startsWith(String(y)), action: () => { f.from = `${y}-01-01`; f.to = `${y}-12-31`; render(); } },
            { label: 'Reprendre le périmètre global', icon: 'pin', action: () => { f.ctxs = perToCtx(); render(); } },
          ],
        }),
      };
    },
  });
})();
