/* =====================================================================
   Rubriques « Projets » et « Archives » + fenêtre de projet
   (miroir de pages/Projects.tsx et components/expert/*)
   Mise en page : modèle validé maquettes/ux/project/Projets.dc.html
   - liste 440 px avec panneau de filtres complet (tri par date, périmètre
     MULTI, utilisateurs, marques dont Holding, services, objet, statut,
     PRO+ 3 états, période de début Du / Au, réinitialiser, compteur)
   - fiche pleine largeur : fil d'Ariane + actions, titre éditable, bouton
     mode Expert, carte contexte (statut + archiver, période, PRO+, site /
     plaque, type, équipe, services, marques, part Alpine / Nissan,
     description) et carte Budget (prévu, réel auto, avancement, gain,
     répartition par site % / €), tableau Tâches & coûts pleine largeur
     (9 colonnes, tri, total) puis modules Expert.
   - double-clic ou ⌘ : le projet s'ouvre dans SA fenêtre (document)
   - Espace : aperçu rapide ; ↑ ↓ : navigation clavier ; Entrée : fenêtre
   - règles réelles : sites MULTI (GROUPE BONY GLOBAL / R-N verrouillent la
     répartition), Alpine seulement sur site Alpine, Nissan sur site Nissan,
     Holding exclusif, curseurs de part (100 par défaut, lus seulement si une
     marque RDM est présente, Alpine passe avant Nissan).
   - Archives (parité Projects.tsx viewMode="archived") : archiver demande
     confirmation puis sort le projet de la liste courante et le désélectionne ;
     restaurer (bouton archive ou statut) le repasse Actif immédiatement et le
     renvoie dans Projets. Un projet archivé reste compté dans le budget.
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt;
  const RDM = ['Renault', 'Dacia', 'Mobilize'];
  const FILTER_BRANDS = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize', 'Holding'];
  const P_SERVICES = [...D.SERVICES, 'Tous Services'];
  const TASK_ORDER = { Empty: 0, Todo: 1, InProgress: 2, Programmed: 3, Done: 4 };
  const GROUPS = {   // copies de DISTRIBUTION_GROUPE_BONY / _RN (constants.ts)
    'GROUPE BONY (GLOBAL)': { Clermont: 20.59, Mozac: 4.64, Massagettes: 1.45, Ussel: 2.32, Vichy: 7, Moulins: 5, Ricoux: 4, Issoire: 5, 'Le Puy-en-Velay': 6.48, Mende: 2.52, Albi: 6.08, Aurillac: 6.08, Figeac: 2.56, Villefranche: 1.6, Millau: 2.24, Rodez: 7.68, Gaillac: 3.52, Lavaur: .64, Carmaux: 1.6, Nissan: 9 },
    'GROUPE BONY (R/N)': { Clermont: 22.65, Mozac: 5.1, Massagettes: 1.6, Ussel: 2.55, Vichy: 7.75, Moulins: 5.1, Ricoux: 4.66, Issoire: 5.79, 'Le Puy-en-Velay': 6.8, Mende: 2.64, Albi: 7.07, Aurillac: 7.43, Figeac: 3.18, Millau: 2.48, Rodez: 10.26, Gaillac: 4.95 },
  };
  const marketing = () => D.USERS.filter((u) => !['External', 'Site Manager', 'Guest'].includes(u.role));
  const brandLbl = (b) => b;   // vocabulaire réel : le tag s'appelle « Holding » depuis le 30/07/2026
  const fg = (b) => b === 'Renault' ? '#1b1604' : '#fff';

  GX.css(`
  .prj-split{--side-w:440px}
  .prj-list{display:flex;flex-direction:column;min-height:0;height:100%}
  .prj-search{display:flex;gap:8px;padding:0 22px 14px}
  .prj-search .search{flex:1;height:42px;min-width:0}
  .prj-search .search input{font-size:14px}
  .prj-ftog{width:42px;height:42px;padding:0;justify-content:center;flex:none;position:relative}
  .prj-ftog.on{box-shadow:inset 0 0 0 1.5px var(--accent);color:var(--accent)}
  .prj-ftog .count{position:absolute;top:-6px;right:-6px}
  .prj-fcard{margin:0 16px;padding:18px;display:flex;flex-direction:column;gap:14px}
  .prj-lbl{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3)}
  .prj-fg{display:flex;flex-direction:column;gap:7px;min-width:0}
  .prj-f2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .prj-fcard .picker-btn,.prj-main .picker-btn{width:100%;max-width:none;height:40px}
  .prj-fcard .picker-btn .v,.prj-main .picker-btn .v{flex:1;text-align:left;min-width:0;overflow:hidden;text-overflow:ellipsis}
  .prj-fcard .seg{width:100%}.prj-fcard .seg button{flex:1;padding:0 6px}
  .prj-fdates{display:flex;align-items:center;gap:8px}.prj-fdates input{flex:1;min-width:0}
  .prj-ffoot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:2px}
  .prj-link{font-size:13px;font-weight:600;color:var(--accent);background:none;border:0;padding:0;cursor:pointer;font-family:inherit}
  .prj-link:hover{text-decoration:underline}
  .prj-rescount{font-size:13px;font-weight:700;color:var(--accent)}
  .prj-items{padding:14px 16px 24px;display:flex;flex-direction:column;gap:8px}
  .prj-item{position:relative;padding:15px 16px;border-radius:12px;cursor:pointer;display:flex;flex-direction:column;gap:9px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line);transition:background var(--t-fast),box-shadow var(--t-fast)}
  .prj-item:hover{background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line-2)}
  .prj-item.sel{background:color-mix(in srgb,var(--accent) 12%,var(--surface-2));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 55%,transparent)}
  .prj-item .n{display:flex;align-items:center;gap:8px;min-width:0}
  .prj-item .t{flex:1;min-width:0;font-family:var(--font-display);font-weight:700;font-size:13px;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)}
  .prj-item.sel .t{color:var(--accent)}
  .prj-item .s{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--text-2);min-width:0}
  .prj-item .m{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-2);min-width:0}
  .prj-item .dots{display:inline-flex;gap:5px;flex:none}
  .prj-item .dots i{width:8px;height:8px;border-radius:50%;background:var(--c)}
  .prj-pill{height:20px;padding:0 8px;border-radius:99px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;flex:none;background:color-mix(in srgb,var(--c) 16%,transparent);color:var(--c)}
  .prj-pbar{width:64px;height:5px;border-radius:3px;background:var(--surface-4);flex:none;overflow:hidden}
  .prj-pbar i{display:block;height:100%;border-radius:3px;background:var(--bony-grad)}
  .prj-dhost{container-type:inline-size;container-name:prjd}
  .prj-detail{padding:26px 40px 56px;display:flex;flex-direction:column;gap:24px}
  .prj-crumb{display:flex;align-items:center;justify-content:space-between;gap:10px 16px;flex-wrap:wrap}
  .prj-crumb .c{font-size:13px;color:var(--text-3);display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
  .prj-crumb .c b{color:var(--text-2);font-weight:600}
  .prj-crumb .acts{display:flex;gap:8px;flex-wrap:wrap}
  .prj-titlebar{display:flex;align-items:flex-end;justify-content:space-between;gap:14px 24px;flex-wrap:wrap}
  .prj-titlebar>div{flex:1;min-width:240px}
  .prj-eye{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
  .prj-title{display:block;width:calc(100% + 16px);font-family:var(--font-display);text-transform:uppercase;font-size:34px;font-weight:700;letter-spacing:.02em;line-height:1.15;border:0;outline:0;background:transparent;color:var(--text);padding:4px 8px;margin:4px -8px 0;border-radius:10px}
  .prj-title:hover:not(:disabled){background:var(--surface-3)}.prj-title:focus{background:var(--surface-3);box-shadow:0 0 0 3px var(--focus)}
  .prj-xbtn{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bony-violet) 55%,transparent);color:var(--bony-violet)}
  .prj-xbtn.on{background:var(--bony-grad);color:#fff;box-shadow:none}
  .prj-top{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:24px;align-items:stretch}
  .prj-main{padding:26px 30px;display:flex;flex-direction:column;gap:22px;min-width:0}
  .prj-r1{display:flex;flex-wrap:wrap;gap:20px 32px;align-items:flex-end}
  .prj-hr{height:1px;background:var(--line)}
  .prj-r3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}
  .prj-r2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);gap:22px}
  .prj-chips{display:flex;flex-wrap:wrap;gap:8px}
  .prj-tog{height:32px;padding:0 13px;border-radius:8px;font-weight:600;font-size:13px;background:transparent;box-shadow:inset 0 0 0 1px var(--line-2);color:var(--text-2);transition:background var(--t-fast),color var(--t-fast)}
  .prj-tog:hover{color:var(--text);background:var(--surface-3)}
  .prj-tog.on{background:var(--bony-grad);color:#fff;box-shadow:0 6px 16px -8px var(--accent)}
  .prj-tog.brand.on{background:var(--c);color:var(--fg,#fff);box-shadow:none}
  .prj-tog:disabled{opacity:.55;pointer-events:none}
  .prj-team{display:flex;align-items:center;gap:8px;min-height:40px;flex-wrap:wrap}
  .prj-team .av{cursor:pointer}
  .prj-add{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;box-shadow:inset 0 0 0 1px var(--line-2);color:var(--text-2)}
  .prj-add:hover{background:var(--surface-3);color:var(--text)}
  .prj-share{padding:14px 16px;border-radius:10px;background:color-mix(in srgb,var(--surface-0) 60%,transparent);box-shadow:inset 0 0 0 1px var(--line);display:flex;align-items:center;gap:12px 16px;flex-wrap:wrap}
  .prj-share b.l{font-size:13.5px;width:170px;flex:none}
  .prj-share input[type=range]{flex:1;min-width:140px}
  .prj-share .v{font-size:13.5px;font-weight:700;width:110px;text-align:right;flex:none}
  .prj-note{font-size:12.5px;color:var(--text-3);line-height:1.45}
  .prj-bud{padding:24px 26px;display:flex;flex-direction:column;gap:18px;min-width:0}
  .prj-h2{margin:0;font-family:var(--font-display);font-weight:700;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--text);display:flex;align-items:center;gap:8px}
  .prj-b2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
  .prj-planned{display:flex;align-items:center;gap:8px;height:48px;padding:0 13px;border-radius:10px;background:color-mix(in srgb,var(--surface-0) 60%,transparent);box-shadow:inset 0 0 0 1px var(--line-2)}
  .prj-planned input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text);font:700 20px var(--font-ui);font-variant-numeric:tabular-nums}
  .prj-real{height:48px;display:flex;align-items:center;font-family:var(--font-display);font-weight:700;font-size:22px;color:var(--text);white-space:nowrap}
  .prj-gain{padding:14px 16px;border-radius:10px;background:color-mix(in srgb,var(--c) 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 30%,transparent)}
  .prj-gain b{display:block;margin-top:6px;font-size:20px;color:var(--c)}
  .prj-dist{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .prj-dist>div{display:flex;align-items:center;gap:8px;padding:5px 6px 5px 10px;border-radius:9px;background:color-mix(in srgb,var(--surface-0) 60%,transparent);box-shadow:inset 0 0 0 1px var(--line);min-width:0}
  .prj-dist span.n{flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .prj-dist input{width:64px;height:26px;text-align:right;border:0;outline:0;border-radius:6px;background:var(--surface-3);color:var(--text);font:700 13px var(--font-ui);padding:0 6px}
  .prj-dist input:disabled{background:transparent}
  .prj-dist small{font-size:11.5px;color:var(--text-3);width:52px;text-align:right;flex:none}
  .prj-tcard{padding:24px 28px;display:flex;flex-direction:column;gap:12px;min-width:0}
  .prj-tasks{table-layout:fixed;min-width:1080px;width:100%}
  .prj-tasks th{white-space:nowrap}
  .prj-tasks th button{display:inline-flex;align-items:center;gap:4px;font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit}
  .prj-tasks th button:hover,.prj-tasks th button.on{color:var(--text)}
  .prj-tasks td{height:44px;padding:3px 5px}
  .prj-tasks tbody tr:nth-child(even){background:color-mix(in srgb,var(--surface-3) 35%,transparent)}
  .prj-tasks tr.late td:first-child{box-shadow:inset 3px 0 0 var(--danger)}
  .prj-tasks input.cell,.prj-tasks select.cell{height:34px;width:100%;border:0;outline:0;border-radius:8px;padding:0 10px;font:600 13.5px var(--font-ui);color:var(--text);min-width:0;background-color:color-mix(in srgb,var(--surface-0) 55%,transparent);box-shadow:inset 0 0 0 1px var(--line)}
  .prj-tasks select.cell{padding-right:28px;cursor:pointer}
  .prj-tasks .cell:hover{box-shadow:inset 0 0 0 1px var(--line-2)}.prj-tasks .cell:focus{box-shadow:inset 0 0 0 1.5px var(--accent)}
  .prj-tasks .cell:disabled{pointer-events:none;box-shadow:none;background-color:transparent;background-image:none}
  .prj-tasks .cell.st{background-color:color-mix(in srgb,var(--c) 18%,transparent);color:var(--c);box-shadow:none;font-weight:700}
  .prj-tasks .asg{display:flex;align-items:center;gap:7px;min-width:0}
  .prj-tasks .del{opacity:.4}.prj-tasks tr:hover .del{opacity:1}
  .prj-total{display:flex;justify-content:flex-end;align-items:baseline;gap:24px;padding:12px 4px 0;border-top:1px solid var(--line);font-size:14px}
  .prj-total b{font-size:17px}
  .prj-x{border-radius:var(--r-lg);background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line);position:relative;overflow:hidden}
  .prj-x::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--bony-grad)}
  .prj-xhead{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;padding:16px 20px 16px 22px;border-bottom:1px solid var(--line)}
  .prj-xtabs{display:flex;gap:3px;margin-left:auto;padding:3px;border-radius:11px;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line)}
  .prj-xtabs button{height:30px;padding:0 12px;border-radius:8px;font-weight:700;font-size:12px;letter-spacing:.03em;text-transform:uppercase;color:var(--text-2);display:inline-flex;align-items:center;gap:6px}
  .prj-xtabs button.on{background:var(--bony-grad);color:#fff}
  .prj-xgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:18px 20px 20px 22px}
  .prj-xbloc{padding:14px 16px;border-radius:12px;background:var(--surface-1);box-shadow:inset 0 0 0 1px var(--line);min-width:0}
  .prj-xline{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;font-size:13.5px;cursor:pointer}
  .prj-xline:hover{background:var(--surface-3)}
  .prj-xline b.num{min-width:24px;text-align:right}
  .prj-xsub{display:grid;gap:3px;padding:0 0 6px 18px}
  .prj-xsub div{font-size:13px;padding:4px 8px;border-radius:7px;cursor:pointer;display:flex;gap:8px}.prj-xsub div:hover{background:var(--surface-3)}
  .gantt{position:relative;padding:8px 20px 18px 22px;overflow-x:auto}
  .gantt .g-in{position:relative;min-width:640px}
  .gantt .g-scale{position:relative;height:24px;margin-left:150px;border-bottom:1px solid var(--line)}
  .gantt .g-scale span{position:absolute;top:4px;font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;padding-left:4px;border-left:1px solid var(--line-2);height:20px}
  .gantt .g-row{display:grid;grid-template-columns:140px 1fr;align-items:center;gap:10px;min-height:44px;border-bottom:1px solid var(--line)}
  .gantt .g-track{position:relative;height:44px}
  .gantt .g-bar{position:absolute;top:12px;height:20px;border-radius:6px;background:var(--bony-grad);font-size:11.5px;font-weight:600;color:#fff;padding:0 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:20px;box-shadow:0 2px 6px -2px rgba(0,0,0,.4);cursor:pointer;animation:ui-grow var(--t-slow) var(--spring-soft) both}
  .gantt .g-bar.done{opacity:.5}
  .gantt .g-ms{position:absolute;top:16px;width:12px;height:12px;transform:rotate(45deg);background:var(--bony-violet);border-radius:2px;margin-left:-6px;cursor:pointer;box-shadow:0 0 0 2px var(--surface-2)}
  .gantt .g-today{position:absolute;top:0;bottom:0;width:2px;background:var(--danger);z-index:2;pointer-events:none}
  .gantt .g-today::before{content:"Aujourd'hui";position:absolute;top:2px;left:5px;font-size:10.5px;color:var(--danger);font-weight:700;white-space:nowrap}
  .dropzone{border:1.5px dashed var(--line-3);border-radius:14px;padding:18px;text-align:center;color:var(--text-3);transition:border-color var(--t-fast),background var(--t-fast)}
  .dropzone.over{border-color:var(--accent);background:var(--sel)}
  @container app (max-width:1180px){.prj-split{--side-w:380px}}
  @container prjd (max-width:1060px){.prj-top{grid-template-columns:minmax(0,1fr)}.prj-xgrid{grid-template-columns:1fr 1fr}}
  @container prjd (max-width:760px){.prj-detail{padding:18px 16px 36px;gap:18px}.prj-main,.prj-bud,.prj-tcard{padding:18px 16px}.prj-r3,.prj-r2{grid-template-columns:minmax(0,1fr);gap:18px}.prj-title{font-size:22px}.prj-xgrid{grid-template-columns:1fr}.prj-xtabs{margin-left:0}.prj-share b.l,.prj-share .v{width:auto}}
  @container prjd (max-width:480px){.prj-r1{flex-direction:column;align-items:stretch;gap:16px}.prj-crumb .hide-s{display:none}.prj-b2{grid-template-columns:minmax(0,1fr)}.prj-dist{grid-template-columns:minmax(0,1fr)}}
  @container app (max-width:520px){.prj-search{padding:0 14px 12px}.prj-fcard{margin:0 10px;padding:14px}.prj-items{padding:12px 10px 20px}}
  `);

  /* ---------------- Données dérivées ---------------- */
  const siteView = (p) => GX.ctx.site ? { shown: p.sites.filter((s) => s === GX.ctx.site), hidden: p.sites.filter((s) => s !== GX.ctx.site).length } : { shown: p.sites, hidden: 0 };
  const groupMode = (p) => p.siteMode && GROUPS[p.siteMode] ? p.siteMode : null;
  // Libellé « site » d'un projet (Project.site réel : site unique, liste, ou GROUPE BONY)
  const siteTxt = (p) => {
    const gm = groupMode(p); if (gm && !GX.ctx.site) return gm === 'GROUPE BONY (GLOBAL)' ? 'GROUPE BONY' : gm;
    const v = siteView(p); return (v.shown.length > 2 ? `${v.shown[0]} +${v.shown.length - 1}` : v.shown.join(', ')) + (v.hidden ? ` · +${v.hidden} masqué${v.hidden > 1 ? 's' : ''}` : '');
  };
  const brandAllowed = (p, b) => b === 'Alpine' ? p.sites.some((s) => D.ALPINE_SITES.includes(s)) : b === 'Nissan' ? p.sites.some((s) => D.NISSAN_SITES.includes(s)) : true;
  const plaqueHas = (sel, p) => { const pl = D.PLAQUES[sel]; return pl ? p.sites.some((s) => pl.includes(s)) : false; };
  function listFor(mode, f) {
    const L = D.PROJECTS.filter((p) => {
      if (mode === 'archived' ? p.status !== 'Archived' : p.status === 'Archived') return false;
      if (GX.ctx.site && !p.sites.includes(GX.ctx.site)) return false;                      // chef de site : ses sites seulement
      if (f.q && !p.name.toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.sites.length && !f.sites.some((s) => s === 'GROUPE BONY' || p.sites.includes(s) || plaqueHas(s, p) || (s === 'Nissan' && p.brands.includes('Nissan')))) return false;
      if (f.services.length && !f.services.some((s) => p.services.includes(s) || p.services.includes('Tous Services'))) return false;
      // Comme le vrai filtre : un projet Holding remonte sous n'importe quelle marque ; la puce Holding seule isole les projets Holding
      if (f.brands.length && !f.brands.some((b) => p.brands.includes(b) || (b !== 'Holding' && p.brands.includes('Holding')))) return false;
      if (f.users.length && !f.users.some((u) => p.team.includes(u))) return false;
      if (f.type !== 'All' && p.type !== f.type) return false;
      if (f.status !== 'All' && p.status !== f.status) return false;
      if (f.pro !== 'all' && (f.pro === 'pro' ? !p.proPlus : !!p.proPlus)) return false;
      if (f.from && p.startDate < f.from) return false;
      if (f.to && p.startDate > f.to) return false;
      return true;
    });
    return L.sort((a, b) => (f.sort === 'asc' ? 1 : -1) * a.startDate.localeCompare(b.startDate));
  }

  function itemHTML(p, sel) {
    const pr = D.projectProgress(p), st = D.PROJECT_STATUS[p.status], amt = D.projectActual(p), tags = [...p.brands.map(brandLbl), ...p.services];
    return `<div class="prj-item ${sel ? 'sel' : ''}" data-id="${p.id}" tabindex="-1">
      <div class="n"><span class="t" title="${GX.esc(p.name)}">${GX.esc(p.name)}</span>${p.proPlus ? GX.r.proPlus() : ''}<span class="prj-pill" style="--c:${st.c}">${st.l}</span></div>
      <div class="s"><span class="ellipsis grow">${GX.esc(siteTxt(p))} · ${p.type}</span>${amt > 0 ? `<b class="num" style="color:var(--text);flex:none">${F.eur(amt)}</b>` : ''}</div>
      <div class="m"><span class="dots">${p.brands.slice(0, 4).map((b) => `<i style="--c:${D.brand(b).hex}" data-tip="${brandLbl(b)}"></i>`).join('')}</span><span class="ellipsis grow" title="${GX.esc(tags.join(' · '))}">${GX.esc(tags.join(' · '))}</span>${p.tasks.length || amt > 0 ? `<span class="prj-pbar"><i style="width:${pr}%"></i></span><span class="num" style="width:34px;text-align:right">${pr} %</span>` : ''}</div></div>`;
  }

  /* ---------------- Montage ---------------- */
  function mount(body, win, mode) {
    const perToCtx = () => !GX.ctx.site && GX.ctx.perimetre && GX.ctx.perimetre !== 'Tout le réseau' ? [GX.ctx.perimetre] : [];
    const F0 = () => ({ q: '', sort: 'desc', sites: perToCtx(), brands: [], services: [], users: [], type: 'All', status: 'All', pro: 'all', from: '', to: '' });
    const f = F0();
    let selId = mode === 'doc' ? win.params.id : null, stack = null, compact = false, listHost = null, autoSel = false, showF = !win.isCompact();
    let sortK = 'deadline', sortDir = 'asc', frozen = null, frozenFor = null, distMode = '%', xtab = 'pilotage', xOpen = {}, selfEmit = false, lastPer = GX.ctx.perimetre;
    body.innerHTML = `<div class="app"><div class="app-body" data-root></div></div>`;
    const root = body.querySelector('[data-root]');
    const ro = () => GX.ctx.readOnly;
    const label = () => mode === 'archived' ? 'Archives' : 'Projets';
    // Même décompte que le vrai `activeFilterCount` (+ le filtre PRO+ du modèle validé)
    const nF = () => f.sites.length + f.brands.length + f.services.length + f.users.length + (f.type !== 'All' ? 1 : 0) + (f.status !== 'All' ? 1 : 0) + (f.pro !== 'all' ? 1 : 0) + (f.from ? 1 : 0) + (f.to ? 1 : 0);

    /* ---------- Liste ---------- */
    const listHTML = () => {
      const L = listFor(mode, f), n = nF();
      const chips = `<div class="chips" data-multi data-fbrands><button class="chip" data-v="" aria-pressed="${!f.brands.length}">Toutes</button>${FILTER_BRANDS.map((b) => `<button class="chip" data-v="${b}" aria-pressed="${f.brands.includes(b)}"><i class="brand-dot" style="--c:${D.brand(b).hex}"></i>${brandLbl(b)}</button>`).join('')}</div>`;
      return `<div class="prj-list scroll">
        <div class="app-head"><div class="ah-t"><h1 class="display">${label()}</h1><span class="sub">${L.length} ${mode === 'archived' ? `archive${L.length > 1 ? 's' : ''}` : `projet${L.length > 1 ? 's' : ''}`}</span></div>
          <div class="ah-f">${mode === 'current' && !ro() ? `<button class="btn primary" data-act="new">${GX.icon('plus', 'sm')}Nouveau</button>` : ''}</div></div>
        <div class="prj-search"><label class="search">${GX.icon('search', 'sm')}<input data-q placeholder="${mode === 'archived' ? 'Rechercher une archive…' : 'Rechercher un projet…'}" aria-label="${mode === 'archived' ? 'Rechercher une archive' : 'Rechercher un projet'}" value="${GX.esc(f.q)}" /></label>
          <button class="btn prj-ftog ${showF ? 'on' : ''}" data-act="filters" data-tip="${showF ? 'Masquer les filtres' : 'Filtres avancés'}" aria-label="${showF ? 'Masquer les filtres' : 'Filtres avancés'}">${GX.icon(showF ? 'close' : 'filter', 'sm')}${!showF && n ? `<span class="count">${n}</span>` : ''}</button></div>
        ${showF ? `<div class="card prj-fcard">
          <div class="row" style="justify-content:space-between"><span class="prj-lbl">Trier par date</span><button class="btn sm" data-fsort>${f.sort === 'desc' ? 'Plus récents' : 'Plus anciens'} ${GX.icon(f.sort === 'desc' ? 'chevdown' : 'chevup', 'sm')}</button></div>
          <div class="prj-f2">
            <div class="prj-fg"><span class="prj-lbl">Périmètre</span>${GX.ui.pickerBtn('data-fsites', 'pin', GX.ctx.site ? GX.ctx.site : GX.ui.summary(f.sites, { all: 'Tout le réseau' }), f.sites.length)}</div>
            <div class="prj-fg"><span class="prj-lbl">Utilisateurs</span>${GX.ui.pickerBtn('data-fusers', 'users', f.users.length ? GX.ui.summary(f.users.map((u) => D.user(u).name)) : 'Tous', f.users.length)}</div></div>
          <div class="prj-fg"><span class="prj-lbl">Marques</span>${chips}</div>
          <div class="prj-fg"><span class="prj-lbl">Services</span>${GX.ui.chips(D.SERVICES, f.services, { all: 'Tous', attr: 'data-fsvc' })}</div>
          <div class="prj-f2">
            <div class="prj-fg"><span class="prj-lbl">Objet (type)</span>${GX.ui.pickerBtn('data-ftype', 'tag', f.type === 'All' ? 'Tous types' : f.type, f.type !== 'All')}</div>
            <div class="prj-fg"><span class="prj-lbl">Statut</span>${GX.ui.pickerBtn('data-fstatus', 'flag', f.status === 'All' ? 'Tous statuts' : D.PROJECT_STATUS[f.status].l, f.status !== 'All')}</div></div>
          <div class="prj-fg"><span class="prj-lbl">PRO+ (B2B)</span><div class="seg" data-fpro>${[['all', 'Tout'], ['standard', 'Sans PRO+'], ['pro', 'PRO+ uniquement']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${f.pro === v}">${l}</button>`).join('')}</div></div>
          <div class="prj-fg"><span class="prj-lbl">Période (date de début)</span><div class="prj-fdates"><input type="date" class="input" data-ffrom value="${f.from}" aria-label="Du" title="Du" /><span class="muted">→</span><input type="date" class="input" data-fto value="${f.to}" min="${f.from}" aria-label="Au" title="Au" /></div></div>
          <div class="prj-ffoot"><button class="prj-link" data-act="reset">Réinitialiser</button><span class="prj-rescount">${L.length} résultat${L.length > 1 ? 's' : ''}</span></div>
        </div>` : ''}
        <div class="prj-items" data-items>${L.map((p) => itemHTML(p, p.id === selId && !(compact && autoSel))).join('') || `<div class="empty">${GX.icon(mode === 'archived' ? 'archives' : 'projects')}Aucun projet trouvé</div>`}</div></div>`;
    };

    /* ---------- Détail ---------- */
    function sortedTasks(p) {
      if (frozen && frozenFor === p.id) { const by = new Map(p.tasks.map((t) => [t.id, t])); const o = frozen.map((id) => by.get(id)).filter(Boolean); return [...o, ...p.tasks.filter((t) => !frozen.includes(t.id))]; }
      const s = sortDir === 'asc' ? 1 : -1, txt = (x) => (x || '').toLocaleLowerCase('fr');
      return [...p.tasks].sort((a, b) => {
        switch (sortK) {
          case 'deadline': return !a.deadline && !b.deadline ? 0 : !a.deadline ? 1 : !b.deadline ? -1 : a.deadline.localeCompare(b.deadline) * s;
          case 'cost': return ((a.cost || 0) - (b.cost || 0)) * s;
          case 'status': return (TASK_ORDER[a.status] - TASK_ORDER[b.status]) * s;
          case 'assignee': { const na = a.assignee ? D.user(a.assignee).name : '', nb = b.assignee ? D.user(b.assignee).name : ''; return !na && !nb ? 0 : !na ? 1 : !nb ? -1 : na.localeCompare(nb, 'fr') * s; }
          default: return txt(a[sortK]).localeCompare(txt(b[sortK]), 'fr') * s;
        }
      });
    }
    function detailHTML(p) {
      const r = ro(), dis = r ? 'disabled' : '', actual = D.projectActual(p), pr = D.projectProgress(p), gain = p.budgetPlanned - actual, sv = siteView(p), today = GX.iso(GX.today());
      const hasRdm = p.brands.some((b) => RDM.includes(b)), shares = hasRdm ? ['Alpine', 'Nissan'].filter((b) => p.brands.includes(b)) : [];
      const gm = groupMode(p), dist = p.distribution || {}, total = Object.values(dist).reduce((a, b) => a + b, 0), done = p.tasks.filter((t) => t.status === 'Done').length;
      const th = (k, l, cls = '') => `<th class="${cls}"><button data-sort="${k}" class="${sortK === k && !frozen ? 'on' : ''}">${l}${sortK === k ? GX.icon(sortDir === 'asc' ? 'chevup' : 'chevdown', 'sm') : GX.icon('sort', 'sm')}</button></th>`;
      const tasks = sortedTasks(p), expert = !!p.expertMode, arch = p.status === 'Archived';
      const siteLbl = gm ? `${gm === 'GROUPE BONY (GLOBAL)' ? 'GROUPE BONY' : gm} · ${p.sites.length} sites` : (sv.shown.join(', ') || 'Sélectionner…') + (sv.hidden ? ` · +${sv.hidden} masqué${sv.hidden > 1 ? 's' : ''}` : '');
      const asgOpts = (t) => { const L = marketing().map((u) => u.id); if (t.assignee && !L.includes(t.assignee)) L.unshift(t.assignee); return L; };
      const gainC = gain >= 0 ? 'var(--ok)' : 'var(--danger)';
      return `<div class="prj-detail">
      <div class="prj-crumb">
        <span class="c">${mode === 'doc' ? 'Projet' : label()} <span>/</span> <b class="ellipsis" style="max-width:340px">${GX.esc(p.name || 'Sans nom')}</b><span class="num hide-s" style="margin-left:10px">ID : ${p.id}</span>
          ${r ? `<span class="badge" style="--c:var(--danger);margin-left:8px">${GX.icon('lock', 'sm')}Lecture seule</span>` : ''}</span>
        <div class="acts">
          <button class="btn" data-act="window" data-tip="${mode === 'doc' ? 'Revenir à la liste des projets' : 'Ouvrir dans sa propre fenêtre'}">${GX.icon('copy', 'sm')}${mode === 'doc' ? 'Ouvrir la liste' : 'Ouvrir dans une fenêtre'}</button>
          ${r ? '' : `<button class="btn" data-act="more" data-tip="Dupliquer, aperçu…" aria-label="Plus d’actions">${GX.icon('more', 'sm')}</button><button class="btn" data-act="delete" style="color:var(--danger)">${GX.icon('trash', 'sm')}Supprimer</button>`}
        </div>
      </div>
      <div class="prj-titlebar">
        <div><div class="prj-eye">Titre du projet</div><input class="prj-title" data-k="name" value="${GX.esc(p.name)}" placeholder="NOM DU PROJET" aria-label="Titre du projet" ${dis} /></div>
        ${r ? (expert ? `<span class="badge" style="--c:var(--bony-violet)">${GX.icon('bolt', 'sm')}Mode Expert actif</span>` : '') : `<button class="btn prj-xbtn ${expert ? 'on' : ''}" data-act="expert" data-tip="${expert ? 'Revenir à la vue simple. Aucune donnée n’est supprimée.' : 'Débloquer les indicateurs, le planning et les fichiers'}">${GX.icon('bolt', 'sm')}${expert ? 'Mode Expert actif' : 'Activer le mode Expert'}</button>`}
      </div>

      <div class="prj-top">
        <section class="card prj-main">
          <div class="prj-r1">
            <div class="prj-fg"><span class="prj-lbl">Statut du projet</span><div class="row" style="gap:8px"><div class="seg" data-k="status" ${r ? 'style="pointer-events:none;opacity:.6"' : ''}>${['Draft', 'Active', 'Done'].map((s) => `<button data-v="${s}" aria-pressed="${p.status === s}">${D.PROJECT_STATUS[s].l}</button>`).join('')}</div>
              ${r ? (arch ? `<span class="badge" style="--c:var(--text-3)">${GX.icon('archives', 'sm')}Archivé</span>` : '') : `<button class="btn ${arch ? 'primary' : ''}" data-act="archive" style="width:40px;padding:0;justify-content:center" data-tip="${arch ? 'Restaurer' : 'Archiver'}" aria-label="${arch ? 'Restaurer' : 'Archiver'}">${GX.icon('archives', 'sm')}</button>`}</div></div>
            <div class="prj-fg"><span class="prj-lbl">Période</span><div class="row" style="gap:6px"><input type="date" class="input" data-k="startDate" value="${p.startDate}" ${dis} /><span class="muted">→</span><input type="date" class="input" data-k="endDate" min="${p.startDate}" value="${p.endDate}" ${dis} /></div></div>
            <div class="prj-fg"><span class="prj-lbl">Client B2B</span><label class="row" style="gap:10px;height:40px;font-size:14px;font-weight:600;cursor:pointer" data-tip="Marquer ce projet comme PRO+ (B2B)"><input type="checkbox" data-k="proPlus" ${p.proPlus ? 'checked' : ''} ${dis} />PRO+</label></div>
          </div>
          <div class="prj-hr"></div>
          <div class="prj-r3">
            <div class="prj-fg"><span class="prj-lbl">Site / plaque</span>${r ? `<div class="picker-btn" style="pointer-events:none">${GX.icon(gm ? 'lock' : 'pin', 'sm')}<span class="v">${GX.esc(siteLbl)}</span></div>` : GX.ui.pickerBtn('data-act="sites"', gm ? 'lock' : 'pin', siteLbl, false)}</div>
            <div class="prj-fg"><span class="prj-lbl">Type de projet</span><select class="select" data-k="type" ${dis} style="height:40px">${D.PROJECT_TYPES.map((t) => `<option ${t === p.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
            <div class="prj-fg"><span class="prj-lbl">Équipe projet <span style="color:var(--text-2)">${p.team.length}</span></span><div class="prj-team">${p.team.map((u) => `<span data-mem="${u}" data-tip="${GX.esc(D.user(u).name)} · ${D.ROLES[D.user(u).role].l}">${GX.r.av(u)}</span>`).join('') || '<span class="faint" style="font-size:13px">Aucun membre assigné</span>'}${r ? '' : `<button class="prj-add" data-act="team" data-tip="Ajouter un membre" aria-label="Ajouter un membre">${GX.icon('plus', 'sm')}</button>`}</div></div>
          </div>
          <div class="prj-r2">
            <div class="prj-fg"><span class="prj-lbl">Services</span><div class="prj-chips">${P_SERVICES.map((s) => `<button class="prj-tog ${p.services.includes(s) ? 'on' : ''}" data-svc="${s}" ${dis}>${s}</button>`).join('')}</div></div>
            <div class="prj-fg"><span class="prj-lbl">Marques</span><div class="prj-chips">${D.BRANDS.filter((b) => brandAllowed(p, b.id)).map((b) => `<button class="prj-tog brand ${p.brands.includes(b.id) ? 'on' : ''}" style="--c:${b.hex};--fg:${fg(b.id)}" data-brand="${b.id}" ${dis}>${brandLbl(b.id)}</button>`).join('')}</div></div>
          </div>
          ${shares.map((b) => { const k = b === 'Alpine' ? 'alpineShare' : 'nissanShare', v = p[k] ?? 100, ign = b === 'Nissan' && shares.includes('Alpine'); return `<div class="prj-share" style="${ign ? 'opacity:.55' : ''}"><b class="l">Part ${b} / RDM</b><input type="range" min="0" max="100" step="1" data-share="${k}" value="${v}" ${dis} aria-label="Part ${b} (%)" /><span class="v num" data-sharev="${k}">${v} % · ${100 - v} %</span><span class="prj-note" style="flex-basis:100%" data-sharetxt="${k}">${ign ? 'Ignorée : Alpine passe avant Nissan.' : `${v} % → ${b} · ${100 - v} % → compte RDM. Curseur vide = 100 % sur la marque.`}</span></div>`; }).join('')}
          <div class="prj-note">Alpine seulement avec un site Alpine, Nissan avec un site Nissan. Holding : exclusif, imputé à aucun budget.</div>
          <div class="prj-fg"><span class="prj-lbl">Description globale</span><textarea class="textarea" data-k="description" rows="3" ${dis} placeholder="Contexte général du projet…" style="font-size:14px;line-height:1.55">${GX.esc(p.description)}</textarea></div>
        </section>

        <aside class="card prj-bud">
          <div><h2 class="prj-h2">Budget</h2><div class="prj-note" style="margin-top:5px">Pilotage financier en temps réel</div></div>
          <div class="prj-b2">
            <div class="prj-fg"><span class="prj-lbl">Budget prévu</span><label class="prj-planned"><input data-k="budgetPlanned" type="number" min="0" value="${p.budgetPlanned}" placeholder="0" ${dis} /><span class="muted" style="font-weight:700">€</span></label></div>
            <div class="prj-fg"><span class="prj-lbl">Réel (auto)</span><div class="prj-real num">${F.eur(actual)}</div></div>
          </div>
          <div class="prj-fg"><div class="row" style="justify-content:space-between"><span class="prj-lbl">Avancement tâches</span><b class="num" style="font-size:13.5px">${pr} % · ${done} / ${p.tasks.length}</b></div><div class="bar" style="height:7px"><i style="width:${pr}%"></i></div></div>
          <div class="prj-gain" style="--c:${gainC}"><div class="prj-lbl" style="color:${gainC}">${GX.icon(gain >= 0 ? 'trending' : 'alert', 'sm')} ${gain >= 0 ? 'Gain estimé' : 'Dépassement'}</div><b class="num">${F.eur(Math.abs(gain))} <span style="font-size:13px;font-weight:600">(${(p.budgetPlanned ? Math.abs((gain / p.budgetPlanned) * 100) : 0).toFixed(1).replace('.', ',')} %)</span></b></div>
          ${p.sites.length > 1 && !GX.ctx.site ? `<div class="prj-fg" style="gap:10px"><div class="row" style="justify-content:space-between"><span class="prj-lbl">Répartition budgétaire</span><div class="seg" data-dmode>${['%', '€'].map((m) => `<button data-v="${m}" aria-pressed="${distMode === m}">${m}</button>`).join('')}</div></div>
            ${gm ? `<div class="prj-note">${GX.icon('lock', 'sm')} Répartition verrouillée par ${gm}.</div>` : ''}
            <div class="prj-dist scroll" style="max-height:300px">${p.sites.map((s) => { const pct = dist[s] || 0, amt = Math.round(actual * pct / 100), eur = distMode === '€'; return `<div><span class="n" title="${s}">${s}</span><input class="num" type="number" step="${eur ? 1 : 0.01}" data-dist="${s}" value="${eur ? amt : +pct.toFixed(2)}" ${gm || r || (eur && !(actual > 0)) ? 'disabled' : ''} aria-label="${s}" /><small class="num">${eur ? `${+pct.toFixed(1)} %` : F.eurK(amt)}</small></div>`; }).join('')}</div>
            ${distMode === '€' && !(actual > 0) ? '<div class="prj-note" style="color:var(--warn)">Budget réalisé = 0 € : saisie en € indisponible (utilisez le mode %).</div>' : ''}
            <div class="row" style="justify-content:flex-end;font-size:13px">Total : <b class="num" style="margin-left:6px;color:${Math.abs(total - 100) > 0.1 ? 'var(--danger)' : 'var(--ok)'}">${total.toFixed(1)} %</b></div></div>` : ''}
        </aside>
      </div>

      <section class="card prj-tcard">
        <div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap"><h2 class="prj-h2">Tâches &amp; coûts <span style="color:var(--text-3)">${p.tasks.length}</span></h2><div class="row" style="gap:8px">${frozen && frozenFor === p.id ? `<button class="btn sm ghost" data-act="resort">${GX.icon('sort', 'sm')}Retrier</button>` : ''}${r ? '' : `<button class="btn" data-act="add-task">${GX.icon('plus', 'sm')}Ajouter une tâche</button>`}</div></div>
        <div class="scroll"><table class="tbl prj-tasks"><colgroup><col style="width:36px"><col><col style="width:17%"><col style="width:150px"><col style="width:140px"><col style="width:190px"><col style="width:120px"><col style="width:150px"><col style="width:${expert ? 84 : 44}px"></colgroup>
          <thead><tr><th style="text-align:center">#</th>${th('name', 'Nom de la tâche')}${th('provider', 'Prestataire')}${th('channel', 'Canal')}${th('status', 'Statut')}${th('assignee', 'Assigné')}${th('cost', 'Coût (€)', 'r')}${th('deadline', 'Échéance')}<th></th></tr></thead><tbody>
          ${tasks.map((t, i) => { const late = t.deadline && t.deadline < today && t.status !== 'Done', lateD = late ? Math.round((new Date(today) - new Date(t.deadline)) / 864e5) : 0; return `<tr data-t="${t.id}" class="${late ? 'late' : ''}"><td class="faint num" style="text-align:center">${i + 1}</td>
            <td><input class="cell" data-tk="name" value="${GX.esc(t.name)}" placeholder="Description de la tâche…" ${dis} /></td>
            <td><input class="cell" data-tk="provider" value="${GX.esc(t.provider || '')}" placeholder="Prestataire…" ${dis} /></td>
            <td><select class="cell" data-tk="channel" ${dis}><option value="">-- Aucun --</option>${D.CHANNELS.map((c) => `<option ${t.channel === c ? 'selected' : ''}>${c}</option>`).join('')}</select></td>
            <td><select class="cell st" data-tk="status" ${dis} style="--c:${D.TASK_STATUS[t.status].c}">${Object.entries(D.TASK_STATUS).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${v.l}</option>`).join('')}</select></td>
            <td><div class="asg">${t.assignee ? GX.r.av(t.assignee, 'sm') : `<span class="av sm" style="--c:var(--surface-4)">?</span>`}<select class="cell" data-tk="assignee" ${dis}><option value="">— Non assigné —</option>${asgOpts(t).map((u) => `<option value="${u}" ${t.assignee === u ? 'selected' : ''}>${GX.esc(D.user(u).name)}</option>`).join('')}</select></div></td>
            <td><input class="cell num" data-tk="cost" type="number" value="${t.cost || 0}" style="text-align:right" ${dis} /></td>
            <td><input class="cell num" data-tk="deadline" type="date" value="${t.deadline || ''}" style="${late ? 'color:var(--danger);font-weight:700' : ''}" ${late ? `data-tip="Dépassée · ${lateD} j"` : ''} ${dis} /></td>
            <td style="text-align:right;white-space:nowrap">${expert ? `<button class="icon-btn sm" data-act="tdetail" data-tip="Détail : dates, note et fichiers" style="${t.notes || t.files?.length ? 'color:var(--bony-violet)' : ''}">${GX.icon(t.files?.length ? 'paperclip' : 'file', 'sm')}</button>` : ''}${r ? '' : `<button class="icon-btn sm del" data-act="tdel" data-tip="Supprimer la tâche" aria-label="Supprimer la tâche">${GX.icon('close', 'sm')}</button>`}</td></tr>`; }).join('') || `<tr><td colspan="9"><div class="empty" style="padding:18px">Aucune tâche définie. Ajoutez des tâches pour piloter le budget et l’avancement.</div></td></tr>`}
        </tbody></table></div>
        <div class="prj-total"><span class="muted">Total des tâches</span><b class="num">${F.eur(actual)}</b></div>
      </section>
      ${expert ? expertHTML(p) : ''}
    </div>`;
    }

    function expertHTML(p) {
      const today = GX.iso(GX.today());
      const late = p.tasks.filter((t) => t.status !== 'Done' && t.deadline && t.deadline < today), noOne = p.tasks.filter((t) => !t.assignee && t.status !== 'Done'), noDate = p.tasks.filter((t) => t.status === 'Todo' && !t.deadline);
      const who = {}; p.tasks.forEach((t) => { const k = t.assignee || ''; who[k] ??= { n: 0, d: 0, late: 0, amt: 0 }; who[k].n++; if (t.status === 'Done') who[k].d++; if (t.status !== 'Done' && t.deadline && t.deadline < today) who[k].late++; who[k].amt += t.cost || 0; });
      const total = D.projectActual(p), top3 = [...p.tasks].sort((a, b) => b.cost - a.cost).slice(0, 3).reduce((s, t) => s + t.cost, 0);
      const prov = {}; p.tasks.forEach((t) => (prov[t.provider || 'Sans prestataire'] = (prov[t.provider || 'Sans prestataire'] || 0) + (t.cost || 0)));
      const taskFiles = p.tasks.filter((t) => t.files?.length), nFiles = p.files.length + taskFiles.reduce((s, t) => s + t.files.length, 0);
      const line = (key, list, lbl, tone) => `<div class="prj-xline" data-xopen="${key}"><b class="num" style="color:${list.length ? tone : 'var(--ok)'}">${list.length}</b><span class="grow">${lbl}</span>${list.length ? GX.icon(xOpen[key] ? 'chevup' : 'chevdown', 'sm') : ''}</div>
        ${xOpen[key] && list.length ? `<div class="prj-xsub">${list.map((t) => `<div data-topen="${t.id}"><span class="ellipsis grow">${GX.esc(t.name || 'Sans nom')}</span><span class="faint num">${t.deadline ? F.date(t.deadline) : ''}</span></div>`).join('')}</div>` : ''}`;
      const file = (fl) => `<div class="list-row" style="background:var(--surface-3)">${GX.icon('file')}<b class="grow ellipsis">${GX.esc(fl.n)}</b><span class="faint">${fl.s}</span><button class="icon-btn sm" data-tip="Télécharger">${GX.icon('download', 'sm')}</button></div>`;
      return `<div class="prj-x" data-expert><div class="prj-xhead">${GX.icon('bolt')}<div><h2 class="prj-h2">Mode Expert</h2><div class="prj-note" style="margin-top:4px">Pilotage avancé — indicateurs, planning et pièces jointes de ce projet. Ne change aucun montant.</div></div>
        <div class="prj-xtabs">${[['pilotage', 'Pilotage', 'target'], ['planning', 'Planning', 'gantt'], ['fichiers', 'Fichiers', 'paperclip']].map(([k, l, ic]) => `<button data-xtab="${k}" class="${xtab === k ? 'on' : ''}">${GX.icon(ic, 'sm')}${l}${k === 'fichiers' ? ` <span class="num">${nFiles}</span>` : ''}</button>`).join('')}</div></div>
        ${xtab === 'pilotage' ? `<div class="prj-xgrid">
          <div class="prj-xbloc"><div class="prj-lbl" style="margin-bottom:6px">${GX.icon('alert', 'sm')} À traiter</div>${line('late', late, 'en retard', 'var(--danger)')}${line('noOne', noOne, 'sans personne assignée', 'var(--warn)')}${line('noDate', noDate, 'à faire sans date', 'var(--warn)')}</div>
          <div class="prj-xbloc"><div class="prj-lbl" style="margin-bottom:8px">${GX.icon('users', 'sm')} Qui fait quoi</div>${Object.entries(who).map(([u, w]) => `<div class="row" style="font-size:13.5px;padding:6px 0;border-bottom:1px solid var(--line)">${u ? GX.r.av(u, 'sm') : '<span class="av sm" style="--c:var(--surface-4)">?</span>'}<span class="grow ellipsis">${u ? GX.esc(D.user(u).name) : 'Non assigné'}</span><span class="faint num">${w.d}/${w.n}</span>${w.late ? `<span class="badge solid" style="--c:var(--danger)">${w.late}</span>` : ''}<b class="num" style="min-width:58px;text-align:right">${F.eurK(w.amt)}</b></div>`).join('')}</div>
          <div class="prj-xbloc"><div class="prj-lbl">${GX.icon('euro', 'sm')} Où part l’argent</div><div class="num" style="font-size:24px;font-weight:700;margin:8px 0 2px">${F.eur(total)}</div><div class="faint" style="font-size:12.5px;margin-bottom:10px">Les 3 plus grosses lignes : ${total ? Math.round((top3 / total) * 100) : 0} %</div>${total ? GX.chart.hbars({ items: Object.entries(prov).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([l, v]) => ({ label: l, value: v })) }) : '<div class="faint">Aucun coût saisi sur les tâches.</div>'}</div>
        </div>` : xtab === 'planning' ? ganttHTML(p) : `<div style="padding:18px 20px 20px 22px;display:grid;gap:10px">
          <div class="prj-lbl">Fichiers du projet</div>${p.files.map(file).join('') || '<div class="faint">Aucun fichier.</div>'}
          ${ro() ? '' : `<div class="dropzone" data-drop>${GX.icon('upload', 'lg')}<div style="margin-top:6px">Glissez des fichiers ici · tous formats, 100 Mo maximum</div></div>`}
          ${taskFiles.length ? `<div class="prj-lbl" style="margin-top:8px">Fichiers rattachés à une tâche <span style="color:var(--bony-violet)">${taskFiles.reduce((s, t) => s + t.files.length, 0)}</span></div>${taskFiles.map((t) => `<button class="row" data-topen="${t.id}" style="font-weight:600;font-size:13px">${GX.icon('paperclip', 'sm')}${GX.esc(t.name)} ${GX.icon('chevron', 'sm')}</button>${t.files.map(file).join('')}`).join('')}` : ''}
        </div>`}</div>`;
    }
    function ganttHTML(p) {
      const dated = p.tasks.filter((t) => t.deadline), orph = p.tasks.filter((t) => !t.deadline);
      if (!dated.length) return `<div class="empty" style="padding:24px">Aucune tâche datée</div>`;
      const T = +GX.today(), t0 = Math.min(...dated.map((t) => +new Date(t.startDate || t.deadline)), T) - 864e5 * 3, t1 = Math.max(...dated.map((t) => +new Date(t.deadline)), T) + 864e5 * 4;
      const x = (d) => ((+new Date(d) - t0) / (t1 - t0)) * 100;
      const grads = []; for (let d = new Date(new Date(t0).getFullYear(), new Date(t0).getMonth() + 1, 1); +d < t1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) grads.push(d);
      const byU = {}; dated.forEach((t) => (byU[t.assignee || ''] ??= []).push(t));
      return `<div class="gantt"><div class="g-in"><div class="g-scale">${grads.map((d) => `<span style="left:${x(d)}%">${d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')} ${String(d.getFullYear()).slice(2)}</span>`).join('')}</div>
        <div style="position:absolute;left:150px;right:0;top:0;bottom:0;pointer-events:none"><div class="g-today" style="left:${x(GX.today())}%"></div></div>
        ${Object.entries(byU).map(([u, ts]) => `<div class="g-row"><div class="row" style="font-size:13px;font-weight:600;min-width:0">${u ? GX.r.av(u, 'sm') : ''}<span class="ellipsis">${u ? GX.esc(D.user(u).name) : 'Non assigné'}</span></div><div class="g-track">
          ${ts.map((t, i) => t.startDate && t.startDate < t.deadline ? `<div class="g-bar ${t.status === 'Done' ? 'done' : ''}" data-topen="${t.id}" style="left:${x(t.startDate)}%;width:${Math.max(1.5, x(t.deadline) - x(t.startDate))}%;animation-delay:${i * 40}ms" data-tip="${GX.esc(t.name)} · ${F.date(t.startDate)} → ${F.date(t.deadline)}">${GX.esc(t.name)}</div>` : `<div class="g-ms" data-topen="${t.id}" style="left:${x(t.deadline)}%" data-tip="${GX.esc(t.name)} · jalon ${F.date(t.deadline)}"></div>`).join('')}
        </div></div>`).join('')}</div>
        ${orph.length ? `<div class="faint" style="font-size:12.5px;margin-top:10px">Sans date : ${orph.map((t) => `<button data-topen="${t.id}" style="text-decoration:underline">${GX.esc(t.name || 'Sans nom')}</button>`).join(', ')}</div>` : ''}</div>`;
    }

    const detailPane = () => { const p = D.project(selId); return p ? detailHTML(p) : `<div class="empty" style="height:100%">${GX.icon(mode === 'archived' ? 'archives' : 'projects')}<b class="display" style="color:var(--text);font-size:15px">${mode === 'archived' ? 'Sélectionnez une archive' : 'Sélectionnez un projet'}</b>↑ ↓ pour naviguer · Espace pour l’aperçu · double-clic pour une fenêtre</div>`; };

    function build() {
      if (mode === 'doc') { root.innerHTML = `<div class="scroll prj-dhost" style="height:100%" data-detail>${detailPane()}</div>`; wireDetail(root.querySelector('[data-detail]')); return; }
      if (compact) {
        stack = GX.ui.stack(root);
        listHost = stack.push(label(), listHTML(), { noHead: true }); wireList(listHost);
        if (selId && !autoSel) openDetailCompact();
      } else {
        stack = null; root.classList.remove('stack');
        root.innerHTML = `<div class="split prj-split"><div class="side">${listHTML()}</div><div class="main scroll prj-dhost" data-detail>${detailPane()}</div></div>`;
        listHost = root.querySelector('.side'); wireList(listHost); wireDetail(root.querySelector('[data-detail]'));
      }
    }
    function refreshList() { const host = listHost; if (!host || !host.isConnected || mode === 'doc') return; const sc = host.querySelector('.prj-list')?.scrollTop || 0; host.innerHTML = listHTML(); wireList(host); const it = host.querySelector('.prj-list'); if (it) it.scrollTop = sc; }
    function refreshDetail(anim) {
      const host = mode === 'doc' || !compact ? root.querySelector('[data-detail]') : (stack?.depth() > 1 ? stack.top() : null); if (!host) return;
      const sc = host.scrollTop; host.innerHTML = detailPane(); host.scrollTop = anim ? 0 : sc; wireDetail(host);
      if (anim && host.firstElementChild) GX.animate(host.firstElementChild, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
      const p = D.project(selId); if (mode === 'doc' && p) win.setTitle(p.name, 'Projet');
    }
    function select(id, anim = true) {
      if (!id) return; if (id !== selId) { frozen = null; xOpen = {}; } selId = id; autoSel = false;
      if (compact) return openDetailCompact();
      root.querySelectorAll('.prj-item').forEach((x) => x.classList.toggle('sel', x.dataset.id === id));
      root.querySelector(`.prj-item[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
      refreshDetail(anim); const p = D.project(id); win.setTitle(label(), p?.name);
    }
    function openDetailCompact() { const p = D.project(selId); if (!p || !stack || stack.depth() > 1) return; const host = stack.push(p.name, detailHTML(p)); host.classList.add('prj-dhost'); wireDetail(host); }

    function wireList(host) {
      const q = (s) => host.querySelector(s);
      q('[data-q]')?.addEventListener('input', (e) => { f.q = e.target.value; const pos = e.target.selectionStart; refreshList(); const i = listHost?.querySelector('[data-q]'); i?.focus(); i?.setSelectionRange(pos, pos); });
      q('[data-act=new]')?.addEventListener('click', newProject);
      q('[data-act=filters]')?.addEventListener('click', () => { showF = !showF; refreshList(); });
      q('[data-act=reset]')?.addEventListener('click', () => { Object.assign(f, F0(), { sites: [] }); refreshList(); });
      q('[data-fsort]')?.addEventListener('click', () => { f.sort = f.sort === 'desc' ? 'asc' : 'desc'; refreshList(); });
      q('[data-fbrands]')?.addEventListener('change', (e) => { f.brands = e.detail; refreshList(); });
      q('[data-fsvc]')?.addEventListener('change', (e) => { f.services = e.detail; refreshList(); });
      q('[data-fpro]')?.addEventListener('change', (e) => { f.pro = e.detail; setTimeout(refreshList, 150); });
      q('[data-ffrom]')?.addEventListener('change', (e) => { f.from = e.target.value || ''; if (f.to && f.from && f.to < f.from) f.to = f.from; refreshList(); });
      q('[data-fto]')?.addEventListener('change', (e) => { f.to = e.target.value || ''; refreshList(); });
      q('[data-fsites]')?.addEventListener('click', (e) => { if (GX.ctx.site) return GX.shell.hud(`Périmètre verrouillé : ${GX.ctx.site}`); GX.ui.sitePicker(e.currentTarget, f.sites, (v) => { f.sites = v; refreshList(); }, { variant: 'filter' }); });
      q('[data-fusers]')?.addEventListener('click', (e) => GX.ui.pick(e.currentTarget, [{ items: marketing().map((u) => ({ v: u.id, l: u.name, hint: D.ROLES[u.role].l })) }], { title: 'Utilisateurs rattachés', selected: f.users, allLabel: 'Tous', search: true, onChange: (v) => { f.users = v; refreshList(); } }));
      q('[data-ftype]')?.addEventListener('click', (e) => GX.ui.pick(e.currentTarget, [{ items: [{ v: 'All', l: 'Tous types' }, ...D.PROJECT_TYPES.map((t) => ({ v: t, l: t }))] }], { multi: false, title: 'Objet (type)', selected: [f.type], onChange: (v) => { f.type = v[0]; refreshList(); } }));
      q('[data-fstatus]')?.addEventListener('click', (e) => GX.ui.pick(e.currentTarget, [{ items: [{ v: 'All', l: 'Tous statuts' }, ...['Draft', 'Active', 'Done', ...(mode === 'archived' ? ['Archived'] : [])].map((s) => ({ v: s, l: D.PROJECT_STATUS[s].l, color: D.PROJECT_STATUS[s].c }))] }], { multi: false, title: 'Statut', selected: [f.status], onChange: (v) => { f.status = v[0]; refreshList(); } }));
      const items = q('[data-items]'); if (!items) return;
      items.addEventListener('click', (e) => { const it = e.target.closest('.prj-item'); if (!it) return; if (e.ctrlKey || e.metaKey) return openWindow(it.dataset.id, it); select(it.dataset.id); });
      items.addEventListener('dblclick', (e) => { const it = e.target.closest('.prj-item'); if (it) openWindow(it.dataset.id, it); });
      items.addEventListener('contextmenu', (e) => {
        const it = e.target.closest('.prj-item'); if (!it) return; e.preventDefault(); const p = D.project(it.dataset.id);
        GX.menu.open([{ label: 'Ouvrir', action: () => select(p.id) }, { label: 'Ouvrir dans une nouvelle fenêtre', icon: 'copy', action: () => openWindow(p.id, it) }, { label: 'Aperçu rapide', icon: 'quicklook', kbd: 'Espace', action: () => quickLook(p, it) }, '-',
          ...(ro() ? [] : [{ label: p.status === 'Archived' ? 'Restaurer' : 'Archiver…', icon: 'archives', action: () => archive(p) }, { label: 'Dupliquer', icon: 'copy', action: () => duplicate(p) }])], { x: e.clientX, y: e.clientY });
      });
    }
    function openWindow(id, origin) { const p = D.project(id); if (p) GX.wm.open('project', { id, title: p.name }, { origin }); }
    function quickLook(p, origin) {
      if (!p) return; const pr = D.projectProgress(p);
      GX.shell?.quickLook?.({ title: p.name, origin, html: `<div style="display:grid;gap:12px"><div class="row wrap">${GX.r.pStatus(p.status)}${p.proPlus ? GX.r.proPlus() : ''}${GX.r.brandChips(p.brands)}</div>
        <div class="muted">${GX.esc(siteTxt(p))} · ${p.type} · ${p.services.join(', ')}</div>
        <div class="row" style="gap:10px"><div class="card grow" style="padding:11px 12px"><span class="label">Dates</span><b style="font-size:14px;display:block;margin-top:3px">${F.date(p.startDate)} → ${F.date(p.endDate)}</b></div><div class="card grow" style="padding:11px 12px"><span class="label">Budget</span><b class="num" style="font-size:14px;display:block;margin-top:3px">${F.eur(D.projectActual(p))} / ${F.eur(p.budgetPlanned)}</b></div></div>
        <div><div class="row"><span class="label grow">Avancement</span><b class="num">${pr} %</b></div><div class="bar" style="margin-top:6px"><i style="width:${pr}%"></i></div></div>
        <div class="faint" style="font-size:12px">${p.tasks.length} tâches · ${p.team.length} personnes · Espace ou Échap pour fermer</div></div>` });
    }
    function changed() { selfEmit = true; GX.emit('data:projects'); selfEmit = false; refreshList(); refreshDetail(false); }
    function duplicate(p) { const c = structuredClone(p); c.id = GX.uid('p'); c.name += ' (copie)'; c.status = 'Draft'; D.PROJECTS.unshift(c); selId = c.id; changed(); }
    // Parité Projects.tsx : un projet qui change de rubrique (archivé / restauré) est désélectionné ;
    // dans sa propre fenêtre il reste affiché.
    function moved(p, msg) {
      if (mode !== 'doc') { selId = null; if (compact && stack?.depth() > 1) stack.pop(); }
      changed(); GX.shell?.notify?.({ app: 'archives', title: msg, body: `« ${p.name} »`, silent: true });
    }
    function archive(p) {
      if (p.status === 'Archived') { p.status = 'Active'; return moved(p, 'Projet restauré dans Projets'); }
      win.sheet(`<div class="row" style="gap:12px;color:var(--bony-orange)">${GX.icon('alert', 'lg')}<h3 style="margin:0;color:var(--text)">Confirmer l’archivage ?</h3></div>
        <div class="muted" style="margin-top:10px;line-height:1.55">Vous êtes sur le point d’archiver le projet <b style="color:var(--text)">${GX.esc(p.name)}</b>.<br><br>Il sera déplacé dans la rubrique <b style="color:var(--text)">« Projets archivés »</b> et n’apparaîtra plus dans la liste des projets actifs. Il reste compté dans le budget : l’archivage est un classement, pas une annulation.</div>
        <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">Oui, archiver</button></div>`, { onClose: (v) => { if (v === 'ok') { p.status = 'Archived'; moved(p, 'Projet archivé'); } } });
    }
    function freeze(p) { if (!(frozen && frozenFor === p.id)) { frozen = sortedTasks(p).map((t) => t.id); frozenFor = p.id; } }
    function setSites(p, values) {
      const prev = groupMode(p), picked = Object.keys(GROUPS).find((g) => values.includes(g) && g !== prev);
      if (picked) { p.siteMode = picked; p.sites = Object.keys(GROUPS[picked]); p.distribution = { ...GROUPS[picked] }; GX.ui.closePick(); }
      else {
        let sites = values.filter((v) => !GROUPS[v]);
        if (prev) { if (!sites.length) return GX.shell.hud('Un projet garde au moins un site'); p.siteMode = null; GX.ui.closePick(); }    // sortie du mode groupé : on repart du site choisi
        if (!sites.length) return GX.shell.hud('Un projet garde au moins un site');
        p.sites = sites; p.distribution = sites.length > 1 ? Object.fromEntries(sites.map((s) => [s, 100 / sites.length])) : null;   // répartition égale par défaut (comme le vrai)
      }
      const before = p.brands.length; p.brands = p.brands.filter((b) => brandAllowed(p, b));
      if (p.brands.length < before) GX.shell.hud('Marque retirée : aucun site éligible');
      changed();
    }
    function removeMember(p, u) {
      const go = () => { p.team = p.team.filter((x) => x !== u); changed(); };
      if (p.team.length > 1) return go();
      win.sheet(`<h3>Retirer le dernier membre ?</h3><div class="muted">${GX.esc(D.user(u).name)} est le seul membre du projet. Le retirer quand même ?</div><div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">Retirer</button></div>`, { onClose: (v) => v === 'ok' && go() });
    }
    function taskDetail(p, t) {
      t.files ??= [];
      const sh = win.sheet(`<div class="label" style="color:var(--bony-violet)">Détail de la tâche</div><h3 style="margin:2px 0 6px">${GX.esc(t.name || 'Sans nom')}</h3>
        <div class="row wrap" style="gap:6px">${GX.r.tStatus(t.status)}${t.assignee ? `${GX.r.av(t.assignee, 'sm')}<span>${GX.esc(D.user(t.assignee).name)}</span>` : '<span class="faint">Non assignée</span>'}${t.channel ? `<span class="badge">${t.channel}</span>` : ''}</div>
        <div class="label" style="margin-top:14px">${GX.icon('agenda', 'sm')} Fenêtre de réalisation</div>
        <div class="row" style="gap:8px;margin-top:6px"><label class="field grow"><span class="label">Début</span><input type="date" class="input" data-td="startDate" value="${t.startDate || ''}" ${ro() ? 'disabled' : ''} /></label><label class="field grow"><span class="label">Échéance</span><input type="date" class="input" data-td="deadline" value="${t.deadline || ''}" ${ro() ? 'disabled' : ''} /></label></div>
        <div class="label" style="margin-top:14px">${GX.icon('edit', 'sm')} Note</div><textarea class="textarea" data-td="notes" rows="3" style="margin-top:6px" ${ro() ? 'disabled' : ''}>${GX.esc(t.notes || '')}</textarea><div class="faint" style="font-size:11.5px">Enregistrée en quittant le champ.</div>
        <div class="label" style="margin-top:14px">${GX.icon('paperclip', 'sm')} Fichiers de la tâche ${t.files.length ? `<span style="color:var(--bony-violet)">${t.files.length}</span>` : ''}</div>
        <div style="display:grid;gap:6px;margin-top:6px" data-tfiles>${t.files.map((fl) => `<div class="list-row" style="background:var(--surface-3)">${GX.icon('file')}<b class="grow ellipsis">${GX.esc(fl.n)}</b><span class="faint">${fl.s}</span></div>`).join('')}</div>
        ${ro() ? '' : `<button class="btn sm" data-addfile style="margin-top:6px">${GX.icon('upload', 'sm')}Ajouter un fichier (fictif)</button>`}
        <div class="foot"><button class="btn primary" data-sheet="ok">Fermer</button></div>`, { width: 520, onClose: () => changed() });
      const el = sh?.el || document;
      el.querySelectorAll('[data-td]').forEach((i) => i.addEventListener('change', () => { t[i.dataset.td] = i.value; }));
      el.querySelector('[data-addfile]')?.addEventListener('click', () => { t.files.push({ n: `Pièce ${t.files.length + 1}.pdf`, s: '120 Ko' }); el.querySelector('[data-tfiles]').insertAdjacentHTML('beforeend', `<div class="list-row" style="background:var(--surface-3)">${GX.icon('file')}<b class="grow">Pièce ${t.files.length}.pdf</b><span class="faint">120 Ko</span></div>`); });
    }

    function wireDetail(host) {
      const p = D.project(selId); if (!p) return;
      const set = (k, v) => { p[k] = v; changed(); };
      host.querySelectorAll('[data-k]').forEach((el) => {
        const k = el.dataset.k;
        if (el.classList.contains('seg')) return el.addEventListener('change', (e) => setTimeout(() => {
          if (p.status === 'Archived' && e.detail !== 'Archived') { p.status = e.detail; return moved(p, 'Projet restauré dans Projets'); }   // restaurer par le statut
          set(k, e.detail);
        }, 160));
        el.addEventListener('change', () => {
          let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Math.max(0, +el.value || 0) : el.value;
          if (k === 'startDate' && v > p.endDate) p.endDate = v;
          if (k === 'endDate' && v < p.startDate) v = p.startDate;
          if (k === 'name') win.setTitle(mode === 'doc' ? v : label(), mode === 'doc' ? 'Projet' : v);
          set(k, v);
        });
      });
      host.querySelector('[data-dmode]')?.addEventListener('change', (e) => { distMode = e.detail; setTimeout(() => refreshDetail(false), 150); });
      host.querySelectorAll('[data-dist]').forEach((el) => el.addEventListener('change', () => { const a = D.projectActual(p); p.distribution ??= {}; p.distribution[el.dataset.dist] = distMode === '€' ? (a > 0 ? (+el.value / a) * 100 : 0) : +el.value; changed(); }));
      host.querySelectorAll('[data-share]').forEach((el) => {
        const k = el.dataset.share, b = k === 'alpineShare' ? 'Alpine' : 'Nissan', ign = b === 'Nissan' && p.brands.includes('Alpine');
        el.addEventListener('input', () => {
          const v = Math.max(0, Math.min(100, +el.value || 0)); p[k] = v;
          const vv = host.querySelector(`[data-sharev="${k}"]`); if (vv) vv.textContent = `${v} % · ${100 - v} %`;
          const tx = host.querySelector(`[data-sharetxt="${k}"]`); if (tx && !ign) tx.textContent = `${v} % → ${b} · ${100 - v} % → compte RDM. Curseur vide = 100 % sur la marque.`;
        });
        el.addEventListener('change', () => { selfEmit = true; GX.emit('data:projects'); selfEmit = false; });
      });
      host.querySelectorAll('[data-svc]').forEach((b) => b.addEventListener('click', () => {
        const s = b.dataset.svc;
        if (s === 'Tous Services') p.services = p.services.includes(s) ? [] : [s];
        else { const t = p.services.filter((x) => x !== 'Tous Services'); p.services = t.includes(s) ? t.filter((x) => x !== s) : [...t, s]; }
        changed();
      }));
      host.querySelectorAll('[data-brand]').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.brand;
        if (id === 'Holding') p.brands = p.brands.includes('Holding') ? [] : ['Holding'];                      // tag exclusif
        else { const t = p.brands.filter((x) => x !== 'Holding'); p.brands = t.includes(id) ? t.filter((x) => x !== id) : [...t, id]; }
        changed();
      }));
      host.querySelectorAll('[data-mem]').forEach((m) => m.addEventListener('click', (e) => {
        const u = m.dataset.mem, us = D.user(u);
        GX.menu.open([{ label: `${us.name} · ${D.ROLES[us.role].l}`, disabled: true }, ...(ro() ? [] : ['-', { label: 'Retirer du projet', icon: 'close', action: () => removeMember(p, u) }])], e.currentTarget);
      }));
      host.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.sort; frozen = null; if (k === sortK) sortDir = sortDir === 'asc' ? 'desc' : 'asc'; else { sortK = k; sortDir = 'asc'; } refreshDetail(false); }));
      host.querySelectorAll('[data-t]').forEach((tr) => {
        const t = p.tasks.find((x) => x.id === tr.dataset.t); if (!t) return;
        tr.querySelectorAll('[data-tk]').forEach((inp) => inp.addEventListener('change', () => { freeze(p); t[inp.dataset.tk] = inp.type === 'number' ? +inp.value || 0 : inp.value || (inp.dataset.tk === 'assignee' ? null : ''); changed(); }));
        tr.querySelector('[data-act=tdel]')?.addEventListener('click', () => { p.tasks = p.tasks.filter((x) => x !== t); changed(); });
        tr.querySelector('[data-act=tdetail]')?.addEventListener('click', () => taskDetail(p, t));
      });
      host.querySelectorAll('[data-topen]').forEach((el) => el.addEventListener('click', () => { const t = p.tasks.find((x) => x.id === el.dataset.topen); if (t) taskDetail(p, t); }));
      host.querySelectorAll('[data-xopen]').forEach((el) => el.addEventListener('click', () => { xOpen[el.dataset.xopen] = !xOpen[el.dataset.xopen]; refreshDetail(false); }));
      host.querySelectorAll('[data-xtab]').forEach((b) => b.addEventListener('click', () => { xtab = b.dataset.xtab; refreshDetail(false); }));
      const act = (n, fn) => host.querySelector(`[data-act=${n}]`)?.addEventListener('click', fn);
      act('window', (e) => mode === 'doc' ? GX.wm.open('projects') : openWindow(p.id, e.currentTarget));
      act('expert', () => set('expertMode', !p.expertMode));
      act('archive', () => archive(p));
      act('resort', () => { frozen = null; refreshDetail(false); });
      act('add-task', () => {
        p.tasks.push({ id: GX.uid('t'), name: '', provider: '', channel: '', status: 'Todo', assignee: null, cost: 0, deadline: '', startDate: '', notes: '', files: [] });
        freeze(p); changed();
        const host2 = compact && mode !== 'doc' ? stack.top() : root.querySelector('[data-detail]'); const rows = host2?.querySelectorAll('[data-tk=name]'); rows?.[rows.length - 1]?.focus();
      });
      act('team', (e) => GX.ui.pick(e.currentTarget, [{ label: 'Équipe marketing', items: marketing().filter((u) => !p.team.includes(u.id)).map((u) => ({ v: u.id, l: u.name, hint: D.ROLES[u.role].l })) }], { multi: false, title: 'Ajouter un membre', selected: [], search: true, onChange: ([v]) => { if (v && !p.team.includes(v)) { p.team = [...p.team, v]; changed(); } } }));
      act('sites', (e) => { const gm = groupMode(p); GX.ui.sitePicker(e.currentTarget, gm ? [gm] : p.sites, (v) => setSites(p, v), { variant: 'project', title: 'Site / Plaque' }); });
      act('more', (e) => GX.menu.open([{ label: 'Dupliquer', icon: 'copy', action: () => duplicate(p) }, { label: 'Aperçu rapide', icon: 'quicklook', kbd: 'Espace', action: () => quickLook(p, e.target) }, '-', { label: p.status === 'Archived' ? 'Restaurer' : 'Archiver…', icon: 'archives', action: () => archive(p) }], e.currentTarget));
      act('delete', () => win.sheet(`<h3>Supprimer « ${GX.esc(p.name)} » ?</h3><div class="muted">Cette action est définitive (maquette : rien n’est réellement supprimé).</div><div class="foot"><button class="btn" data-sheet="">Non</button><button class="btn primary" data-sheet="ok" style="background:var(--danger)">Oui, supprimer</button></div>`, { onClose: (v) => { if (v !== 'ok') return; D.PROJECTS.splice(D.PROJECTS.indexOf(p), 1); selId = null; if (mode === 'doc') return win.close(); if (compact) stack.pop(); changed(); } }));
      const dz = host.querySelector('[data-drop]');
      if (dz) { dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over'); dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); [...(e.dataTransfer?.files || [])].forEach((fl) => p.files.push({ n: fl.name, s: Math.max(1, Math.round(fl.size / 1024)) + ' Ko' })); changed(); }; }
    }
    function newProject() {
      if (ro() || mode !== 'current') return;
      win.sheet(`<h3>Nouveau projet</h3><div class="muted">Donnez un nom à votre projet pour commencer. Il naît en brouillon (Clermont, VN, Renault, OP Clients) : invisible des budgets tant qu’il n’est pas actif.</div>
        <label class="field" style="margin-top:14px"><span class="label">Nom du projet</span><input class="input" id="npName" placeholder="Nom du projet…" /></label>
        <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" id="npOk" disabled>Créer</button></div>`, { onClose: (v) => {
        const name = document.getElementById('npName')?.value.trim(); if (v !== 'ok' || !name) return;
        const p = { id: GX.uid('p'), name, type: 'OP Clients', sites: ['Clermont'], brands: ['Renault'], services: ['VN'], status: 'Draft', startDate: GX.iso(GX.today()), endDate: GX.iso(GX.today()), tasks: [], team: ['me'], budgetPlanned: 0, description: '', proPlus: false, expertMode: false, alpineShare: null, nissanShare: null, files: [], distribution: null };
        D.PROJECTS.unshift(p); f.status = 'All'; selId = p.id; selfEmit = true; GX.emit('data:projects'); selfEmit = false; refreshList(); select(p.id);
        GX.shell?.notify?.({ app: 'projects', title: 'Projet créé', body: `« ${name} » est en brouillon.`, silent: true });
      } });
      setTimeout(() => { const i = document.getElementById('npName'), ok = document.getElementById('npOk'); i?.focus(); i?.addEventListener('input', () => { if (ok) ok.disabled = !i.value.trim(); }); i?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && i.value.trim()) ok?.click(); }); }, 50);
    }

    // Clavier : ↑ ↓ naviguer, Entrée = fenêtre, Espace = aperçu rapide
    body.addEventListener('keydown', (e) => {
      if (e.target.closest('input,textarea,select') || mode === 'doc') return;
      const L = listFor(mode, f), i = L.findIndex((p) => p.id === selId);
      if (e.key === 'ArrowDown') { e.preventDefault(); select(L[Math.min(L.length - 1, i + 1)]?.id); }
      if (e.key === 'ArrowUp') { e.preventDefault(); select(L[Math.max(0, i - 1)]?.id); }
      if (e.key === ' ' && selId) { e.preventDefault(); quickLook(D.project(selId), root.querySelector(`.prj-item[data-id="${selId}"]`)); }
      if (e.key === 'Enter' && selId) openWindow(selId, root.querySelector(`.prj-item[data-id="${selId}"]`));
    });
    body.tabIndex = -1;

    const stopW = mode === 'doc' ? () => {} : GX.ui.watchWidth(body, 900, (c) => { compact = c; if (c) showF = showF && false; build(); });
    if (mode === 'doc') build();
    else if (!selId) { const first = listFor(mode, f)[0]; selId = first?.id || null; autoSel = true; }
    const off = [
      GX.on('ctx', () => { if (GX.ctx.perimetre !== lastPer) { f.sites = perToCtx(); lastPer = GX.ctx.perimetre; } build(); }),
      GX.on('data:projects', () => { if (selfEmit) return; if (!body.contains(document.activeElement) || !document.activeElement?.closest?.('input,textarea,select')) { refreshList(); refreshDetail(false); } }),
    ];
    return {
      destroy: () => { stopW(); off.forEach((o) => o()); },
      command: (c) => { if (c === 'new-project') newProject(); if (c.startsWith?.('select:')) select(c.slice(7)); },
      menus: () => ({
        'Fichier': [...(mode === 'current' && !ro() ? [{ label: 'Nouveau projet…', icon: 'plus', action: newProject }] : []), { label: 'Ouvrir dans une nouvelle fenêtre', icon: 'copy', disabled: !selId || mode === 'doc', action: () => openWindow(selId) }, { label: 'Aperçu rapide', icon: 'quicklook', kbd: 'Espace', disabled: !selId, action: () => quickLook(D.project(selId)) },
          ...(!ro() && selId && D.project(selId) ? ['-', { label: D.project(selId).status === 'Archived' ? 'Restaurer le projet' : 'Archiver le projet…', icon: 'archives', action: () => archive(D.project(selId)) }] : [])],
        'Présentation': [{ label: 'Plus récents d’abord', checked: f.sort === 'desc', action: () => { f.sort = 'desc'; refreshList(); } }, { label: 'Plus anciens d’abord', checked: f.sort === 'asc', action: () => { f.sort = 'asc'; refreshList(); } }, '-',
          { label: showF ? 'Masquer les filtres avancés' : 'Afficher les filtres avancés', icon: 'filter', disabled: mode === 'doc', action: () => { showF = !showF; refreshList(); } },
          { label: 'Réinitialiser les filtres', icon: 'refresh', disabled: mode === 'doc', action: () => { Object.assign(f, F0(), { sites: [] }); refreshList(); } }],
      }),
    };
  }

  GX.registerApp({ id: 'projects', name: 'Projets', icon: 'projects', tint: ['#8f12ab', '#5b1bd1'], size: [1320, 800], minSize: [360, 380], mount: (b, w) => mount(b, w, 'current') });
  GX.registerApp({ id: 'archives', name: 'Archives', icon: 'archives', tint: ['#8e8a99', '#4a4655'], size: [1200, 740], minSize: [360, 380], mount: (b, w) => mount(b, w, 'archived') });
  GX.registerApp({ id: 'project', name: 'Projet', icon: 'projects', tint: ['#8f12ab', '#5b1bd1'], size: [1100, 800], minSize: [360, 380], hidden: true, parent: 'projects', mount: (b, w) => mount(b, w, 'doc') });
})();
