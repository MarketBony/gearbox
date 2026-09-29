/* =====================================================================
   Rubrique « Digital & Social » (miroir de pages/Digital.tsx)
   - Calendrier Editorial : lignes éditables en place (titre, lien,
     wording, 10 réglages, médias, commentaires, archiver, supprimer)
   - Planning Digital : mois / semaine, filtre de site par plaque,
     info-bulle riche, PROPOSITION : glisser une publication d'un jour
     à l'autre pour la replanifier
   - Archives : mêmes lignes, estompées
   - Gestion des TAGS : réseaux (8 verrouillés), CO², mentions LOM
   Règles réelles : Holding passe tous les filtres marque, « Tous
   Services » tous les filtres service, GROUPE BONY tous les filtres
   de site ; Site Manager = Planning seul, limité à son site.
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt, esc = GX.esc;
  const EDIT_ROLES = ['Master', 'Administrator', 'Director', 'Digital Manager', 'External'];
  const SERVICES = ['VN', 'VO', 'APV', 'PR', 'Tous Services', 'RH'];
  const TARGETS = [['Internet', 'WEB'], ['Collaborateurs', 'COLLAB.']];
  const BASE_NETS = D.NETWORKS.slice(0, 8).map((n) => n.id);
  const TAG_COLORS = ['#0ea5a4', '#d97706', '#4f46e5', '#db2777', '#16a34a', '#0284c7'];
  const MEDIA_MAX = 50, ACCEPT = /\.(jpe?g|png|webp|mp4|mov)$/i;

  GX.css(`
  .dig .app-head{padding-top:6px;padding-bottom:6px}
  .dig .ah-tabs{min-width:0;max-width:100%}
  .dig .ah-tabs .tabs{border-bottom:0;min-width:0;flex:1 1 auto}
  .dig .ah-tabs .tabs>button{height:36px;display:inline-flex;align-items:center;gap:6px;font-size:13.5px}
  .dig .app-head2 .search{width:280px}
  .dig-fsep{margin:0 2px}
  .dig-saving{font-size:10.5px;font-weight:800;letter-spacing:.12em;color:var(--accent);display:inline-flex;align-items:center;gap:6px;animation:dig-blink .9s steps(2,jump-none) infinite}
  .dig-saving::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
  @keyframes dig-blink{50%{opacity:.25}}
  .dig-body{flex:1;min-height:0;position:relative}
  /* Modèle validé (Digital.dc.html) : éditos COMPACTS sur 3 colonnes, ~120 px par édito */
  .dig-body{--dig-cols:minmax(250px,1fr) minmax(600px,2.15fr) 84px}
  .dig-cols{position:sticky;top:0;z-index:4;display:grid;grid-template-columns:var(--dig-cols);gap:18px;padding:9px 28px 8px 34px;background:color-mix(in srgb,var(--surface-1) 90%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3);box-shadow:inset 0 -1px 0 var(--line)}
  .dig-cols .r{text-align:right}
  .dig-sort{display:inline-flex;align-items:center;gap:6px;font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit;border-radius:6px;padding:2px 6px;margin:-2px -6px;justify-self:start;transition:color var(--t-fast),background var(--t-fast)}
  .dig-sort:hover{color:var(--text);background:var(--surface-3)}
  .dig-sort svg.i{width:12px;height:12px;color:var(--accent);transition:transform var(--t-med) var(--spring-bouncy)}
  .dig-sort.desc svg.i{transform:rotate(180deg)}
  .dig-list{display:flex;flex-direction:column;gap:8px;padding:8px 14px 28px}
  .dig-note{display:flex;align-items:center;gap:8px;margin:0 0 2px;padding:9px 14px;border-radius:11px;font-size:13px;color:var(--text-2);background:color-mix(in srgb,var(--warn) 9%,var(--surface-2));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--warn) 30%,transparent)}
  .dig-note svg.i{color:var(--warn);flex:none}
  .dig-row{position:relative;display:grid;grid-template-columns:var(--dig-cols);gap:18px;align-items:center;padding:12px 14px 12px 20px;border-radius:12px;overflow:hidden;background:color-mix(in srgb,var(--c) 5%,var(--surface-2));box-shadow:inset 0 0 0 1px var(--line-2),var(--shadow-1);transition:box-shadow var(--t-fast),opacity var(--t-med),filter var(--t-med)}
  :root[data-theme="light"] .dig-row{background:color-mix(in srgb,var(--c) 4%,#fff);box-shadow:inset 0 0 0 1px var(--line),0 1px 2px rgba(20,16,30,.07),0 6px 16px -10px rgba(20,16,30,.2)}
  .dig-row:hover{box-shadow:inset 0 0 0 1px var(--line-3),var(--shadow-2)}
  .dig-row.arch{opacity:.6;filter:grayscale(.8)}
  .dig-row.arch:hover{opacity:.95;filter:grayscale(.2)}
  .dig-rail{position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--c);transition:background var(--t-med)}
  .dig-content{display:flex;flex-direction:column;gap:6px;min-width:0}
  .dig-top{display:flex;align-items:center;gap:10px;min-width:0}
  .dig-ttl{flex:1;min-width:0;font-family:var(--font-display);font-weight:700;font-size:13px;line-height:1.35;letter-spacing:.03em;text-transform:uppercase;border:0;outline:0;background:transparent;padding:2px 6px;margin:-2px -6px;border-radius:7px;text-overflow:ellipsis;transition:background var(--t-fast),box-shadow var(--t-fast)}
  .dig-ttl:hover:not(:disabled){background:var(--surface-3)}.dig-ttl:focus{background:var(--surface-3);box-shadow:0 0 0 3px var(--focus)}
  .dig-ttl:disabled{color:var(--text)}
  .dig-link{display:flex;align-items:center;justify-content:flex-end;gap:2px;flex:0 1 auto;max-width:48%;min-height:24px;font-size:12.5px;min-width:0}
  .dig-link a{color:var(--info);font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:5px;min-width:0}
  .dig-link a:hover span{text-decoration:underline}
  .dig-link .ph{color:var(--text-3);font-style:italic;white-space:nowrap}
  .dig-link input{height:28px;font-size:12.5px;width:230px;max-width:100%}
  .dig-wording{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;cursor:pointer;width:100%;height:46px;overflow:hidden;padding:5px 9px;border-radius:8px;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line);font-size:13px;line-height:18px;color:var(--text-2);text-align:left;white-space:pre-wrap;word-break:break-word;transition:background var(--t-fast),box-shadow var(--t-fast)}
  :root[data-theme="light"] .dig-wording{background:var(--surface-0)}
  .dig-wording:hover{background:var(--surface-4);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bony-violet) 45%,transparent)}
  .dig-wording.empty{color:var(--text-3);font-style:italic}
  .dig-set{display:grid;gap:7px;min-width:0}
  .dig-r1,.dig-r2{display:grid;gap:8px;min-width:0}
  .dig-r1{grid-template-columns:120px 134px 118px minmax(0,1fr) minmax(0,1fr)}
  .dig-r2{grid-template-columns:minmax(0,1fr) 134px minmax(0,1fr) minmax(0,1fr) 96px}
  .dig-cell{display:grid;gap:4px;min-width:0}
  .dig-cell>.lb{font-size:10px;line-height:1;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dig-pick{display:flex;align-items:center;gap:5px;width:100%;min-width:0;height:30px;padding:0 8px;border-radius:7px;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line-2);font-size:12.5px;overflow:hidden;white-space:nowrap;transition:background var(--t-fast),box-shadow var(--t-fast),filter var(--t-fast)}
  :root[data-theme="light"] .dig-pick{background:#fff}
  .dig-pick:hover:not(:disabled){background:var(--surface-4)}
  .dig-pick:disabled{cursor:default}
  .dig-pick .ph{color:var(--text-3);font-style:italic}
  .dig-pick .chev{margin-left:auto;opacity:.6;width:12px;height:12px;flex:none}
  .dig-pick .more{height:20px;padding:0 5px;border-radius:5px;display:inline-grid;place-items:center;font-size:11px;font-weight:800;color:var(--text-2);background:var(--surface-4);flex:none}
  .dig-pick .badge{height:20px;font-size:11px;flex:none}
  .dig-pick.st,:root[data-theme="light"] .dig-pick.st{background:var(--c);color:var(--fg,#fff);font-weight:800;box-shadow:none}
  .dig-pick.st:hover:not(:disabled){filter:brightness(1.08);background:var(--c)}
  .dig-pick.st.strike span{text-decoration:line-through}
  .dig-dot{width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}
  .dig-nets{display:inline-flex;gap:4px;align-items:center}
  .dig-nets svg.i{width:15px;height:15px}
  .dig-date{height:30px;font-size:12.5px;padding:0 7px}
  :root[data-theme="light"] .dig-date{background:#fff}
  .dig-date:disabled{opacity:1}
  .dig-ro{display:flex;align-items:center;height:30px;padding:0 8px;border-radius:7px;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line-2);font-size:12.5px;font-weight:600}
  .dig-tg{display:flex;gap:5px}
  .dig-tg button{flex:1;min-width:0;display:grid;place-items:center;height:30px;border-radius:7px;font-size:10.5px;font-weight:800;letter-spacing:.05em;background:var(--surface-3);color:var(--text-3);box-shadow:inset 0 0 0 1px var(--line-2);transition:all var(--t-fast)}
  .dig-tg button[aria-pressed="true"]{background:color-mix(in srgb,var(--bony-orange) 18%,transparent);color:var(--bony-orange);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bony-orange) 65%,transparent)}
  .dig-tg button:active:not(:disabled){transform:scale(.95)}
  .dig-tg button:disabled{cursor:default}
  .dig-pro{display:flex;align-items:center;justify-content:center;gap:6px;height:30px;border-radius:7px;font-size:12px;font-weight:800;letter-spacing:.04em;background:var(--surface-3);color:var(--text-2);box-shadow:inset 0 0 0 1px var(--line-2);transition:all var(--t-fast)}
  .dig-pro .box{width:14px;height:14px;border-radius:4px;box-shadow:inset 0 0 0 1.5px var(--line-3);display:grid;place-items:center}
  .dig-pro .box svg.i{width:11px;height:11px}
  .dig-pro[aria-pressed="true"]{background:var(--bony-grad);color:#fff;box-shadow:none}
  .dig-pro[aria-pressed="true"] .box{box-shadow:none;background:rgba(255,255,255,.25)}
  .dig-pro:disabled{cursor:default}
  /* Actions : grille 2 x 2 de boutons-icônes, pastilles compteurs */
  .dig-act{display:grid;grid-template-columns:repeat(2,36px);gap:10px;justify-content:end;align-content:center}
  .dig-ib{position:relative;width:36px;height:36px;border-radius:9px;display:grid;place-items:center;background:var(--surface-3);color:var(--text-2);box-shadow:inset 0 0 0 1px var(--line-2);cursor:pointer;transition:background var(--t-fast),color var(--t-fast),box-shadow var(--t-fast),transform var(--t-fast) var(--ease-out)}
  :root[data-theme="light"] .dig-ib{background:#fff}
  .dig-ib:hover:not(:disabled):not(.dis){background:var(--surface-4);color:var(--text)}
  .dig-ib:active:not(:disabled):not(.dis){transform:scale(.93)}
  .dig-ib.on{color:var(--c);background:color-mix(in srgb,var(--c) 12%,var(--surface-3));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 60%,transparent)}
  .dig-ib .bdg{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:var(--c);color:#fff;font-size:10px;font-weight:800;display:grid;place-items:center;box-shadow:0 2px 6px rgba(0,0,0,.3)}
  .dig-ib.dis,.dig-ib:disabled{cursor:default;opacity:.55}
  .dig-ib input{pointer-events:none}
  .dig-ib.del{color:color-mix(in srgb,var(--danger) 75%,var(--text-2))}
  .dig-ib.del:hover{color:var(--danger);background:color-mix(in srgb,var(--danger) 12%,var(--surface-3))}
  .dig-ib.del.confirm{background:var(--danger);color:#fff;font-size:8.5px;font-weight:800;line-height:1.05;letter-spacing:.04em;text-align:center;animation:dig-blink .7s steps(2,jump-none) infinite}
  .dig-tdel.confirm{background:var(--danger);color:#fff;font-weight:800;letter-spacing:.06em;animation:dig-blink .7s steps(2,jump-none) infinite}
  .dig-sum{display:none;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px}
  .dig-sum .btn .i{transition:transform var(--t-med) var(--spring-snappy)}
  .dig-row.open .dig-sum .btn .i{transform:rotate(180deg)}
  .dig-hl{animation:dig-hl 1.8s var(--ease-out)}
  @keyframes dig-hl{0%,30%{box-shadow:inset 0 0 0 2px var(--accent),0 0 0 6px var(--focus)}100%{box-shadow:inset 0 0 0 1px var(--line),0 0 0 0 transparent}}
  /* < 1060 px : contenu + actions en haut, réglages dessous (toujours sur 2 lignes) */
  @container app (max-width:1060px){
    .dig-body{--dig-cols:minmax(0,1fr) 84px}
    .dig-set{grid-column:1/-1;grid-row:2}
    .dig-cols>span:first-child{display:none}
    .dig-row{row-gap:10px}
  }
  @container app (max-width:760px){
    .dig-r1{grid-template-columns:118px minmax(0,1fr) minmax(0,1fr)}
    .dig-r2{grid-template-columns:repeat(3,minmax(0,1fr))}
  }
  @container app (max-width:720px){
    .dig-list{padding:8px 10px 20px}.dig-cols{padding:8px 14px 6px 24px}
    .dig-fq{flex:1 1 100%}.dig .app-head2 .dig-fq .search{width:100%}.dig-fsep{display:none}
  }
  @container app (max-width:560px){
    .dig-body{--dig-cols:minmax(0,1fr)}
    .dig-row{gap:10px;padding-left:18px}
    .dig-cols .r{display:none}
    .dig-top{flex-wrap:wrap}.dig-link{max-width:100%;justify-content:flex-start}
    .dig-sum{display:flex}
    .dig-set{display:none;grid-row:auto}
    .dig-r1,.dig-r2{grid-template-columns:1fr 1fr}
    .dig-row.open .dig-set{display:grid;animation:ui-fade-up var(--t-med) var(--spring-soft) both}
    .dig-act{display:flex;justify-content:flex-end;gap:10px}
  }
  /* Planning */
  .dig-plan{display:flex;flex-direction:column;height:100%;min-height:0}
  .dig-ph{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;padding:10px 16px;border-bottom:1px solid var(--line)}
  .dig-ph h2{font-size:16px;letter-spacing:-.01em;min-width:170px;text-transform:capitalize}
  .dig-prop{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:99px;font-size:10.5px;font-weight:700;color:var(--bony-violet);background:color-mix(in srgb,var(--bony-violet) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bony-violet) 35%,transparent)}
  .dig-dows{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-bottom:1px solid var(--line);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3)}
  .dig-dows span{padding:7px 8px}
  .dig-grid{flex:1;min-height:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-auto-rows:minmax(104px,1fr);gap:1px;background:var(--line);overflow:auto}
  .dig-grid.week{grid-auto-rows:minmax(360px,1fr)}
  .dig-day{background:var(--surface-1);padding:5px 5px 6px;display:flex;flex-direction:column;gap:3px;min-width:0;min-height:0;overflow:hidden;transition:background var(--t-fast),box-shadow var(--t-fast)}
  .dig-day.out{background:var(--surface-0)}.dig-day.out .dn{opacity:.4}
  .dig-day .dn{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:var(--text-2);padding:1px 2px}
  .dig-day .dn b{min-width:22px;height:22px;border-radius:99px;display:grid;place-items:center;padding:0 4px}
  .dig-day.today .dn b{background:var(--bony-grad);color:#fff}
  .dig-day .dn .n{margin-left:auto;font-size:10px;color:var(--text-3);font-weight:600}
  .dig-day.drop{background:var(--sel);box-shadow:inset 0 0 0 2px var(--accent)}
  .dig-day .dl{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:3px;scrollbar-width:none}
  .dig-chip{flex:none;display:flex;align-items:center;gap:4px;min-width:0;padding:3px 6px 3px 6px;border-radius:6px;background:var(--surface-3);box-shadow:inset 4px 0 0 var(--c);font-size:12px;cursor:pointer;user-select:none;-webkit-user-select:none;transition:background var(--t-fast),opacity var(--t-med),transform var(--t-fast) var(--ease-out)}
  .dig-chip:hover{background:var(--surface-4)}
  .dig-chip svg.i{width:12px;height:12px}
  .dig-chip .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
  .dig-chip .nets{display:inline-flex;gap:1px;flex:none;align-items:center}
  .dig-chip .pl{font-size:9.5px;font-weight:700;color:var(--text-3)}
  .dig-chip.strike .t{text-decoration:line-through;opacity:.6}
  .dig-chip.arch{opacity:.6}
  .dig-chip.lift{opacity:.25;transform:scale(.97)}
  .dig-edit .dig-chip{cursor:grab}
  .dig-grid.week .dig-chip{flex-direction:column;align-items:stretch;gap:5px;padding:7px 8px 7px 11px;border-radius:9px;font-size:13px}
  .dig-grid.week .dig-chip .t{white-space:normal;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
  .dig-chip .wk{display:flex;align-items:center;gap:4px}
  .dig-ghost{position:absolute;z-index:95;pointer-events:none;margin:0;box-shadow:var(--shadow-2),inset 3px 0 0 var(--c);background:var(--surface-4);transform:rotate(-2deg) scale(1.06);transition:none}
  .dig-grab,.dig-grab *{cursor:grabbing !important}
  .dig-hc{position:absolute;z-index:92;width:270px;padding:12px 14px;border-radius:14px;pointer-events:none;display:grid;gap:7px;font-size:12px;animation:ui-pop var(--t-med) var(--spring-snappy) both}
  .dig-hc b.t{font-size:13.5px;line-height:1.3}
  .dig-agenda{padding:4px 12px 24px}
  .dig-ag-d{position:sticky;top:0;z-index:2;padding:12px 4px 6px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3);background:var(--surface-1)}
  .dig-ag-d.today{color:var(--accent)}
  .dig-ag-it{display:flex;align-items:center;gap:10px;padding:9px 10px 9px 13px;border-radius:11px;background:var(--surface-2);box-shadow:inset 3px 0 0 var(--c),inset 0 0 0 1px var(--line);cursor:pointer;margin-bottom:6px;transition:background var(--t-fast)}
  .dig-ag-it:hover{background:var(--surface-3)}
  @container app (max-width:900px){.dig-ph h2{min-width:0;font-size:16px}}
  /* Médias */
  .dig-drop{border:1.5px dashed var(--line-3);border-radius:14px;padding:18px;text-align:center;color:var(--text-3);cursor:pointer;display:grid;gap:4px;justify-items:center;transition:border-color var(--t-fast),background var(--t-fast),transform var(--t-med) var(--spring-bouncy)}
  .dig-drop:hover{border-color:var(--text-3)}
  .dig-drop.over{border-color:var(--accent);background:var(--sel);color:var(--accent);transform:scale(1.015)}
  .dig-gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px;margin-top:14px}
  .dig-tile{position:relative;display:grid;gap:5px;min-width:0;cursor:grab}
  .dig-tile.dragging{opacity:.35}
  .dig-thumb{position:relative;aspect-ratio:1;border-radius:11px;overflow:hidden;display:grid;place-items:center;color:rgba(255,255,255,.9);background:linear-gradient(145deg,var(--a),var(--b));box-shadow:inset 0 0 0 1px var(--line)}
  .dig-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .dig-thumb svg.i{width:26px;height:26px;stroke-width:1.5;filter:drop-shadow(0 2px 6px rgba(0,0,0,.35))}
  .dig-thumb.link{background:var(--surface-3);color:var(--text-2);grid-template-rows:1fr auto;padding:12px 8px;text-align:center}
  .dig-thumb.link b{font-size:12px;color:var(--text)}
  .dig-thumb .vid{position:absolute;left:6px;bottom:6px;font-size:9px;font-weight:800;padding:2px 5px;border-radius:5px;background:rgba(0,0,0,.45);color:#fff}
  .dig-num{position:absolute;left:6px;top:6px;z-index:2;min-width:20px;height:20px;border-radius:99px;display:grid;place-items:center;font-size:10.5px;font-weight:800;background:rgba(0,0,0,.5);color:#fff;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
  .dig-tact{position:absolute;right:5px;top:5px;z-index:2;display:flex;gap:4px;opacity:0;transform:translateY(-3px);transition:all var(--t-fast) var(--ease-out)}
  .dig-tile:hover .dig-tact{opacity:1;transform:none}
  .dig-tact button{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;background:rgba(0,0,0,.55);color:#fff;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
  .dig-tact button:hover{background:var(--accent)}
  .dig-fname{font-size:11px;color:var(--text-2);text-align:center}
  .dig-lb{position:absolute;inset:0;z-index:70;display:grid;grid-template-rows:auto 1fr auto;background:rgba(6,5,10,.86);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#fff;animation:ui-fade-up var(--t-fast) var(--ease-out) both}
  .dig-lb-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;font-weight:700}
  .dig-lb-bar button,.dig-lb-nav{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.1);color:#fff}
  .dig-lb-bar button:hover,.dig-lb-nav:hover{background:rgba(255,255,255,.2)}
  .dig-lb-stage{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:0 14px;min-height:0}
  .dig-lb-img{justify-self:center;width:min(100%,70vh);max-height:100%;aspect-ratio:1;border-radius:16px;overflow:hidden;position:relative;display:grid;place-items:center;background:linear-gradient(145deg,var(--a),var(--b));box-shadow:0 30px 80px -20px rgba(0,0,0,.7)}
  .dig-lb-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000}
  .dig-lb-img svg.i{width:64px;height:64px;stroke-width:1.2}
  .dig-lb-foot{text-align:center;padding:10px;font-size:12px;opacity:.7}
  /* Commentaires */
  .dig-cmts{display:flex;flex-direction:column;gap:12px;max-height:46vh;overflow:auto;margin:14px -4px 0;padding:0 4px}
  .dig-cmt{display:flex;gap:10px;align-items:flex-start}
  .dig-cmt .bub{flex:1;min-width:0;padding:8px 11px;border-radius:4px 14px 14px 14px;background:var(--surface-3)}
  .dig-cmt.mine .bub{background:color-mix(in srgb,var(--bony-violet) 16%,var(--surface-3))}
  .dig-cmt .who{display:flex;align-items:center;gap:8px;font-size:12px}
  .dig-cmt .txt{margin-top:3px;white-space:pre-wrap;word-break:break-word}
  .dig-cmt .x{opacity:0;transition:opacity var(--t-fast)}.dig-cmt:hover .x{opacity:1}
  .dig-compose{display:flex;gap:8px;align-items:flex-end;margin-top:14px}
  .dig-compose .textarea{min-height:40px;max-height:140px;resize:none}
  /* Tags */
  .dig-tags{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:16px 20px 26px;align-items:start}
  .dig-tagcol{display:flex;flex-direction:column;min-height:0;overflow:hidden}
  .dig-tagh{display:flex;align-items:center;gap:8px;padding:14px 14px 10px}
  .dig-tagh .count{background:var(--surface-4);color:var(--text-2);margin-left:auto}
  .dig-tagadd{display:flex;gap:6px;padding:0 12px 10px}
  .dig-tagadd .input{height:28px;font-size:12px}
  .dig-taglist{padding:0 8px 10px;max-height:520px}
  .dig-tag{display:flex;align-items:center;gap:8px;min-height:36px;padding:4px 6px 4px 8px;border-radius:9px;transition:background var(--t-fast)}
  .dig-tag:hover{background:var(--surface-3)}
  .dig-tag .nm{flex:1;min-width:0;font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dig-tag .nm.long{white-space:normal;font-weight:500;line-height:1.35}
  .dig-tag .input{height:26px;font-size:12px;flex:1}
  .dig-tag .ctrl{display:flex;gap:2px;opacity:.35;transition:opacity var(--t-fast)}.dig-tag:hover .ctrl{opacity:1}
  .dig-tdel.confirm{width:auto;padding:0 8px;font-size:10.5px}
  .dig-lock{color:var(--text-3);display:inline-grid;place-items:center;width:24px}
  @container app (max-width:960px){.dig-tags{grid-template-columns:1fr 1fr}.dig-tags>:last-child{grid-column:1/-1}}
  @container app (max-width:620px){.dig-tags{grid-template-columns:1fr;padding:12px}.dig-tags>:last-child{grid-column:auto}}
  `);

  /* ---------------- Utilitaires ---------------- */
  const pd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const monday = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const canEdit = () => EDIT_ROLES.includes(GX.ctx.role) && !GX.ctx.readOnly;
  const isSM = () => !!GX.ctx.site;
  const isAdmin = () => ['Master', 'Administrator'].includes(GX.ctx.role);
  const post = (id) => D.POSTS.find((p) => p.id === id);
  const brandLabel = (b) => (b === 'Holding' ? 'GROUPE BONY' : b);
  const stOf = (id) => D.socialStatus(id);
  const stColor = (id) => (stOf(id).strike ? 'var(--text-3)' : stOf(id).c);
  /* Statut en étiquette PLEINE (v2.1) : texte foncé sur les teintes claires */
  const LIGHT_ST = ['Constructeur', 'En attente', 'Validé', 'Publié'];
  const stFill = (id) => (stOf(id).strike ? 'var(--surface-4)' : stOf(id).c);
  const stFg = (id) => (stOf(id).strike ? 'var(--text-3)' : LIGHT_ST.includes(id) ? '#0b0a10' : '#fff');
  const stBadge = (id) => `<span class="badge solid" style="--c:${stFill(id)};color:${stFg(id)};font-weight:800;${stOf(id).strike ? 'text-decoration:line-through' : ''}">${esc(id)}</span>`;
  const svcBadge = (s) => GX.r.service(s);
  const netIc = (id) => { const n = D.network(id); return n ? `<span style="color:${n.c};display:inline-flex" data-tip="${esc(n.id)}">${GX.icon(n.icon, 'sm')}</span>` : `<span style="color:var(--text-3);display:inline-flex" data-tip="${esc(id)}">${GX.icon('globe', 'sm')}</span>`; };
  const netsHTML = (list, max) => list.slice(0, max).map(netIc).join('') + (list.length > max ? `<span class="more">+${list.length - max}</span>` : '');
  const inPeri = (p) => {
    const per = GX.ctx.perimetre; if (!per || per === 'Tout le réseau') return true;
    if (per === 'Nissan') return p.brands.includes('Nissan') || p.concessions.includes('FULL NISSAN');
    return p.concessions.includes(per) || p.concessions.includes('GROUPE BONY');
  };
  const sitesView = (p) => { if (!GX.ctx.site) return { shown: p.concessions, hidden: 0 }; const shown = p.concessions.filter((c) => c === GX.ctx.site || c === 'GROUPE BONY'); return { shown, hidden: p.concessions.length - shown.length }; };
  const normLink = (v) => { v = v.trim(); if (!v) return ''; if (/^www\./i.test(v)) return 'https://' + v; if (!/^[a-z]+:\/\//i.test(v) && /\.[a-z]{2,}/i.test(v)) return 'https://' + v; return v; };
  const shortLink = (u) => { const s = u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, ''); return s.length > 36 ? s.slice(0, 34) + '…' : s; };
  const linkService = (u) => /wetransfer|we\.tl/i.test(u) ? 'WeTransfer' : /sharepoint|onedrive|1drv/i.test(u) ? 'SharePoint' : /drive\.google|docs\.google/i.test(u) ? 'Google Drive' : /dropbox/i.test(u) ? 'Dropbox' : /swisstransfer/i.test(u) ? 'SwissTransfer' : 'Lien externe';
  const cDate = (c) => {
    let d; if (c.d && c.d.length > 10) d = new Date(c.d); else { d = pd(c.d || GX.iso(new Date())); const h = hash(c.t + c.u); d.setHours(8 + (h % 10), h % 60); }
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} à ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const MEDIA_NAMES = ['visuel-carre-1080.jpg', 'story-1080x1920.png', 'teaser-15s.mp4', 'banniere-facebook.webp', 'photo-concession.jpg', 'carrousel-02.png', 'reel-atelier.mov'];
  const GRADS = ['#8f12ab', '#293f74', '#22c3d6', '#f75632', '#10b981'];
  function mediaOf(p) {
    if (!p._media) {
      const h = hash(p.id), c1 = D.brand(p.brands[0])?.hex || '#f75632';
      p._media = Array.from({ length: p.media || 0 }, (_, i) => { const name = MEDIA_NAMES[(h + i * 3) % MEDIA_NAMES.length]; return { id: GX.uid('m'), kind: /\.(mp4|mov)$/i.test(name) ? 'video' : 'image', name, a: c1, b: GRADS[(h + i) % GRADS.length] }; });
      if (p._media.length >= 3 && h % 2) { const u = 'https://wetransfer.com/downloads/rushs-tournage'; p._media[p._media.length - 1] = { id: GX.uid('m'), kind: 'link', name: u, service: linkService(u) }; }
    }
    return p._media;
  }

  /* ---------------- Ligne éditable ----------------
     Sélecteurs = GX.ui.pick (pickers.js), mono/multi comme Digital.tsx :
     Statut, Service, Loi LOM = mono ; Marques, Sites, Réseaux, Classes CO² = multi. */
  const PICKS = {
    status: { multi: false, title: 'Statut', groups: () => [{ items: D.SOCIAL_STATUS.map((s) => ({ v: s.id, l: s.id, color: stFill(s.id) })) }] },
    service: { multi: false, title: 'Service', groups: () => [{ items: SERVICES.map((s) => ({ v: s, l: s, color: D.SERVICE_COLOR[s] })) }] },
    lom: { multi: false, title: 'Loi LOM', width: 340, groups: () => [{ items: [{ v: '', l: 'Aucune' }, ...D.LOM.map((l) => ({ v: l, l }))] }] },
    brands: { title: 'Marques', allLabel: 'Aucune', groups: () => [{ items: D.BRANDS.map((b) => ({ v: b.id, l: b.label || b.id, color: b.hex })) }] },
    networks: { title: 'Réseaux', allLabel: 'Aucun', groups: (p) => [{ items: [...D.NETWORKS.map((n) => n.id), ...p.networks.filter((x) => !D.network(x))].map((n) => ({ v: n, l: n, color: D.network(n)?.c })) }] },
    co2s: { title: 'Classes CO²', allLabel: 'Aucune', search: true, width: 280, groups: (p) => [{ items: [...D.CO2, ...p.co2s.filter((c) => !D.CO2.includes(c))].map((c) => ({ v: c, l: c })) }] },
  };
  const chev = () => GX.icon('chevdown', 'chev');
  function pickLabel(k, p) {
    const ph = (t) => `<span class="ph">${t}</span>`;
    switch (k) {
      case 'status': return `<span class="ellipsis">${esc(p.status)}</span>`;
      case 'service': return `<i class="dig-dot" style="--c:${D.SERVICE_COLOR[p.service] || '#8a8599'}"></i><span class="ellipsis" style="font-weight:700">${esc(p.service)}</span>`;
      case 'brands': return p.brands.length ? GX.r.brandChips(p.brands.slice(0, 2)) + (p.brands.length > 2 ? `<span class="more">+${p.brands.length - 2}</span>` : '') : ph('Aucune');
      case 'concessions': { const v = sitesView(p); if (!v.shown.length && !v.hidden) return ph('Aucun'); return `<span class="ellipsis" style="font-weight:600">${esc(v.shown.slice(0, 2).join(', ') || '—')}</span>${v.shown.length > 2 || v.hidden ? `<span class="more">+${v.shown.length > 2 ? v.shown.length - 2 : 0}${v.hidden ? ` · ${v.hidden} masq.` : ''}</span>` : ''}`; }
      case 'networks': return p.networks.length ? `<span class="dig-nets">${netsHTML(p.networks, 5)}</span>` : ph('Aucun');
      case 'lom': return p.lom ? `<span class="ellipsis">${esc(p.lom)}</span>` : ph('Aucune');
      case 'co2s': return p.co2s.length ? `<span class="ellipsis" style="font-weight:600">${esc(p.co2s[0])}</span>${p.co2s.length > 1 ? `<span class="more">+${p.co2s.length - 1}</span>` : ''}` : ph('Aucune');
    }
    return '';
  }
  function pickAttrs(k, p) {
    if (k !== 'status') return 'class="dig-pick"';
    return `class="dig-pick st ${stOf(p.status).strike ? 'strike' : ''}" style="--c:${stFill(p.status)};--fg:${stFg(p.status)}"`;
  }
  function linkHTML(p, ed) {
    return (p.link ? `<a href="${esc(p.link)}" data-act="open-link" target="_blank" rel="noopener">${GX.icon('link', 'sm')}<span class="ellipsis">${esc(shortLink(p.link))}</span></a>` : `<span class="ph">Aucun lien</span>`)
      + (ed ? `<button class="icon-btn sm" data-act="link-edit" data-tip="${p.link ? 'Modifier le lien' : 'Ajouter un lien'}">${GX.icon('edit', 'sm')}</button>` : '');
  }
  /* Pastilles : « 9+ » au-delà de 9, et rien à zéro (EditoRow de Digital.tsx) */
  const nine = (n) => (n > 9 ? '9+' : String(n));
  const mediaTip = (p) => { const M = mediaOf(p); if (!M.length) return 'Gérer les médias'; const nl = M.filter((m) => m.kind === 'link').length, nf = M.length - nl, pl = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`; return !nl ? pl(nf, 'fichier') : !nf ? pl(nl, 'lien') : `${pl(nf, 'fichier')} · ${pl(nl, 'lien')}`; };
  function actsHTML(p) {
    const ed = canEdit(), nC = p.comments.length, nM = p.media || 0;
    return `<button class="dig-ib ${nM ? 'on' : ''}" data-act="media" style="--c:var(--bony-orange)" data-tip="${esc(mediaTip(p))}" aria-label="Médias">${GX.icon('image', 'sm')}${nM ? `<b class="bdg">${nine(nM)}</b>` : ''}</button>
      <button class="dig-ib ${nC ? 'on' : ''}" data-act="comments" style="--c:var(--bony-violet)" data-tip="${nC ? `${nC} commentaire${nC > 1 ? 's' : ''}` : 'Commenter'}" aria-label="Commentaires">${GX.icon('message', 'sm')}${nC ? `<b class="bdg">${nine(nC)}</b>` : ''}</button>
      <label class="dig-ib ${p.archived ? 'on' : ''} ${ed ? '' : 'dis'}" style="--c:var(--bony-orange)" data-tip="${p.archived ? 'Désarchiver' : 'Archiver'}" aria-label="Archiver"><input type="checkbox" data-act="archive" ${p.archived ? 'checked' : ''} ${ed ? '' : 'disabled'} /></label>
      ${ed ? `<button class="dig-ib del" data-act="del" data-tip="Supprimer définitivement" aria-label="Supprimer">${GX.icon('trash', 'sm')}</button>` : ''}`;
  }
  function rowHTML(p, i = 0, anim = false) {
    const ed = canEdit(), dis = ed ? '' : 'disabled';
    const pick = (k) => `<button ${pickAttrs(k, p)} data-pick="${k}" ${dis} data-tip="${esc(k === 'lom' && p.lom ? p.lom : '')}">${pickLabel(k, p)}${ed ? chev() : ''}</button>`;
    const cell = (lb, inner) => `<div class="dig-cell"><span class="lb">${lb}</span>${inner}</div>`;
    const date = ed ? `<input type="date" class="input dig-date" data-k="date" value="${p.date}" />` : `<div class="dig-ro num">${pd(p.date).toLocaleDateString('fr-FR')}</div>`;
    return `<article class="dig-row ${p.archived ? 'arch' : ''} ${anim ? 'enter' : ''}" data-id="${p.id}" style="--i:${Math.min(i, 12)};--c:${stFill(p.status)}">
      <span class="dig-rail"></span>
      <div class="dig-content">
        <div class="dig-top"><input class="dig-ttl" data-k="title" value="${esc(p.title)}" placeholder="Titre de la publication..." ${dis} data-tip="${esc(p.title || '')}" />
          <div class="dig-link">${linkHTML(p, ed)}</div></div>
        <div class="dig-wording ${p.wording ? '' : 'empty'}" role="button" tabindex="0" data-act="wording" data-tip="${ed ? 'Écrire le wording' : 'Lire le wording'}">${p.wording ? esc(p.wording) : ed ? 'Rédiger le post ici...' : 'Aucun wording'}</div>
      </div>
      <div class="dig-sum"><b class="num">${F.date(pd(p.date))}</b>${stBadge(p.status)}${GX.r.brandChips(p.brands.slice(0, 2))}<span class="dig-nets">${netsHTML(p.networks, 3)}</span><span class="grow"></span><button class="btn sm ghost" data-act="more-set">Réglages${GX.icon('chevdown', 'sm')}</button></div>
      <div class="dig-set">
        <div class="dig-r1">${cell('Date', date)}${cell('Statut', pick('status'))}${cell('Service', pick('service'))}${cell('Marques', pick('brands'))}${cell('Sites', pick('concessions'))}</div>
        <div class="dig-r2">${cell('Réseaux', pick('networks'))}
          ${cell('Diffusion', `<div class="dig-tg">${TARGETS.map(([v, l]) => `<button data-target="${v}" aria-pressed="${p.targets.includes(v)}" ${dis} data-tip="${v === 'Internet' ? 'Site internet' : 'Collaborateurs'}">${l}</button>`).join('')}</div>`)}
          ${cell('Loi LOM', pick('lom'))}${cell('Classes CO²', pick('co2s'))}
          ${cell('Client B2B', `<button class="dig-pro" data-act="pro" aria-pressed="${!!p.proPlus}" ${dis} data-tip="Marquer cette publication comme PRO+ (B2B)"><span class="box">${p.proPlus ? GX.icon('check', 'sm') : ''}</span>PRO+</button>`)}</div>
      </div>
      <div class="dig-act">${actsHTML(p)}</div>
    </article>`;
  }

  /* ================================================================ */
  GX.registerApp({
    id: 'digital', name: 'Digital', icon: 'digital', tint: ['#2f7cf6', '#293f74'], size: [1240, 760], minSize: [360, 360],
    mount(body, win) {
      const f = { q: '', brand: '', service: '' };                       // Digital.tsx : marque MONO, service MONO
      const plan = { mode: 'month', anchor: GX.today(), site: '' };        // filtre de site du Planning : MONO (Select)
      let tab = 'cal', sortAsc = true, compact = false, hc = null, hcT = null, saveT = null, lb = null;
      const timers = new Set();
      const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

      body.innerHTML = `<div class="app dig">
        <div class="app-head"><div class="ah-t"><h1>Digital &amp; Social</h1><span class="sub">Gestion Editoriale &amp; Réseaux</span><span class="dig-saving hide" data-saving>ENREGISTREMENT...</span></div>
          <div class="ah-tabs"><div class="tabs" data-tabs></div></div><div class="ah-f" data-ro></div></div>
        <div data-bar></div>
        <div class="dig-body" data-body></div></div>`;
      const appEl = body.querySelector('.app'), bodyEl = body.querySelector('[data-body]'), barEl = body.querySelector('[data-bar]'), tabsEl = body.querySelector('[data-tabs]');
      const TABS = [['cal', 'Calendrier Editorial', 'digital'], ['plan', 'Planning Digital', 'agenda'], ['arch', 'Archives', 'archives'], ['tags', 'Gestion des TAGS', 'settings']];

      function saving() {
        const s = body.querySelector('[data-saving]'); s.classList.remove('hide');
        clearTimeout(saveT); saveT = later(() => s.classList.add('hide'), 900);
      }

      /* ---------- Squelette ---------- */
      function renderAll() {
        if (isSM()) tab = 'plan';
        const tabs = isSM() ? TABS.filter((t) => t[0] === 'plan') : TABS;
        tabsEl.innerHTML = tabs.map(([v, l, ic]) => `<button data-v="${v}" aria-selected="${tab === v}">${GX.icon(ic, 'sm')}${l}</button>`).join('');
        body.querySelector('[data-ro]').innerHTML = canEdit() ? '' : `<span class="badge" style="--c:var(--danger)">${GX.icon('lock', 'sm')}Lecture Seule</span>`;
        renderBar(); renderBody();
      }
      const brandName = (b) => (b ? D.brand(b)?.label || b : 'Toutes Marques');
      function renderBar() {
        if (tab !== 'cal' && tab !== 'arch') { barEl.innerHTML = ''; return; }
        const per = GX.ctx.perimetre && GX.ctx.perimetre !== 'Tout le réseau' ? GX.ctx.perimetre : null;
        barEl.innerHTML = `<div class="app-head2">
          <div class="dig-fq"><span class="label">Recherche</span><label class="search">${GX.icon('search', 'sm')}<input data-q placeholder="Rechercher..." value="${esc(f.q)}" /></label></div>
          <span class="dig-fsep"></span>
          <div><span class="label">Marque</span>${GX.ui.pickerBtn('data-f="brand"', 'tag', brandName(f.brand), f.brand)}</div>
          <div><span class="label">Service</span>${GX.ui.pickerBtn('data-f="service"', 'layers', f.service || 'Tous Services', f.service)}</div>
          ${per ? `<div><span class="label">Périmètre</span><span class="chip" style="cursor:default;height:36px" data-tip="Périmètre global (barre de menus)">${GX.icon('pin', 'sm')}${esc(per)}</span></div>` : ''}
          ${f.q || f.brand || f.service ? `<button class="btn ghost sm" data-act="clear">${GX.icon('close', 'sm')}Effacer</button>` : ''}
          <span class="grow"></span><span class="faint num" data-count style="font-size:13px;align-self:center"></span>
          ${tab === 'cal' && canEdit() ? `<button class="btn primary" data-act="new">${GX.icon('plus', 'sm')}Ajouter</button>` : ''}</div>`;
      }
      function renderBody(anim = true) {
        closePop(); hideHC();
        bodyEl.classList.toggle('scroll', tab !== 'plan');
        win.setTitle('Digital', TABS.find((t) => t[0] === tab)[1]);
        if (tab === 'cal' || tab === 'arch') renderList({ anim });
        else if (tab === 'plan') renderPlan();
        else renderTags();
        if (anim && tab !== 'cal' && tab !== 'arch') GX.animate(bodyEl, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
      }

      /* ---------- Calendrier / Archives ---------- */
      const listPosts = (archived) => D.POSTS.filter((p) => !!p.archived === archived && inPeri(p)
        && (!f.q || (p.title || '').toLowerCase().includes(f.q.toLowerCase()))
        && (!f.brand || p.brands.includes(f.brand) || p.brands.includes('Holding'))
        && (!f.service || p.service === f.service || p.service === 'Tous Services'))
        .sort((a, b) => (sortAsc ? 1 : -1) * (a.date.localeCompare(b.date) || (a.title || '').localeCompare(b.title || '')));
      function renderList({ anim = false, flip = false } = {}) {
        const L = listPosts(tab === 'arch'), sc = bodyEl.scrollTop;
        const rects = flip ? new Map([...bodyEl.querySelectorAll('.dig-row')].map((r) => [r.dataset.id, r.getBoundingClientRect()])) : null;
        const open = new Set([...bodyEl.querySelectorAll('.dig-row.open')].map((r) => r.dataset.id));
        bodyEl.innerHTML = `<div class="dig-cols"><span>Contenu du post</span><button class="dig-sort ${sortAsc ? '' : 'desc'}" data-act="sort" data-tip="Inverser le tri par date">Réglages · Tri par date ${GX.icon('arrowup', 'sm')}</button><span class="r">Média / Actions</span></div>
          <div class="dig-list">${tab === 'arch' ? `<div class="dig-note">${GX.icon('info', 'sm')}<span>Les fichiers des publications archivées sont purgés du serveur 30 jours après l’archivage ; les liens externes (WeTransfer, SharePoint, Drive…) sont conservés. Médias en lecture seule ici.</span></div>` : ''}${L.map((p, i) => rowHTML(p, i, anim)).join('') || `<div class="empty">${GX.icon(tab === 'arch' ? 'archives' : 'digital')}<b style="color:var(--text)">Aucune publication trouvée dans ${tab === 'arch' ? 'Archives' : 'Calendrier Editorial'}.</b>${f.q || f.brand || f.service ? 'Aucun résultat pour ces filtres.' : ''}</div>`}</div>`;
        open.forEach((id) => bodyEl.querySelector(`.dig-row[data-id="${id}"]`)?.classList.add('open'));
        bodyEl.scrollTop = sc;
        if (rects) bodyEl.querySelectorAll('.dig-row').forEach((r) => GX.flip(r, rects.get(r.dataset.id), { spring: 'soft' }));
        const c = barEl.querySelector('[data-count]'); if (c) c.textContent = `${L.length} publication${L.length > 1 ? 's' : ''}`;
      }
      function replaceRow(p) {
        const old = bodyEl.querySelector(`.dig-row[data-id="${p.id}"]`); if (!old) return;
        const wasOpen = old.classList.contains('open');
        old.insertAdjacentHTML('afterend', rowHTML(p)); old.remove();
        const nw = bodyEl.querySelector(`.dig-row[data-id="${p.id}"]`); if (wasOpen) nw.classList.add('open');
        return nw;
      }
      function collapse(el, done) {
        const h = el.offsetHeight; el.style.overflow = 'hidden';
        GX.animate(el, [{ height: h + 'px', opacity: 1, transform: 'none' }, { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginBottom: '-8px', transform: 'scale(.98)' }], { spring: 'snappy', fill: 'forwards' }).onfinish = () => { el.remove(); done && done(); };
      }
      function setField(p, k, v) { p[k] = v; saving(); }

      /* ---------- Sélecteurs (GX.ui.pick / GX.ui.sitePicker) ---------- */
      const closePop = () => GX.ui.closePick();
      function openPick(anchor, p, k) {
        const syncAnchor = () => { if (anchor.isConnected) anchor.innerHTML = pickLabel(k, p) + chev(); };
        if (k === 'concessions') {
          return GX.ui.sitePicker(anchor, p.concessions, (v) => { p.concessions = v; syncAnchor(); saving(); }, { variant: 'digital', multi: true, title: 'Sites' });
        }
        const def = PICKS[k];
        if (def.multi === false) {
          const cur = k === 'lom' ? (p.lom || '') : p[k];
          return GX.ui.pick(anchor, def.groups(p), { multi: false, selected: [cur], title: def.title, width: def.width, search: false, onChange: ([v]) => {
            if (k === 'lom') p.lom = v || null; else p[k] = v;
            saving(); const nw = replaceRow(p);
            if (nw && k === 'status') GX.animate(nw.querySelector('.dig-rail'), [{ transform: 'scaleY(.2)' }, { transform: 'none' }], { spring: 'bouncy' });
          } });
        }
        return GX.ui.pick(anchor, def.groups(p), { multi: true, selected: p[k], title: def.title, allLabel: def.allLabel, width: def.width, search: def.search, onChange: (v) => {
          let excl = false;                                   // Holding (GROUPE BONY) : tag marque exclusif
          if (k === 'brands' && v.length > 1 && v.includes('Holding')) { v = p.brands.includes('Holding') ? v.filter((x) => x !== 'Holding') : ['Holding']; excl = true; }
          p[k] = v; syncAnchor(); saving();
          if (excl) { GX.ui.closePick(); GX.shell?.hud?.('GROUPE BONY est exclusif des autres marques'); }
        } });
      }
      /* filtres de la barre d'outils : MONO, comme les <Select> de Digital.tsx */
      function openBarPick(b) {
        const k = b.dataset.f;
        const groups = k === 'brand'
          ? [{ items: [{ v: '', l: 'Toutes Marques' }, ...D.BRANDS.map((x) => ({ v: x.id, l: x.label || x.id, color: x.hex }))] }]
          : [{ items: [{ v: '', l: 'Tous Services' }, ...SERVICES.filter((s) => s !== 'Tous Services').map((s) => ({ v: s, l: s, color: D.SERVICE_COLOR[s] }))] }];
        GX.ui.pick(b, groups, { multi: false, search: false, selected: [f[k]], title: k === 'brand' ? 'Marque' : 'Service', onChange: ([v]) => { f[k] = v; renderBar(); renderList({ anim: true }); } });
      }
      /* filtre de site du Planning : MONO — « Tous Sites », ★ plaque, sites (PLAQUES_STRUCTURE) */
      function openSitePick(b) {
        const groups = [{ items: [{ v: '', l: 'Tous Sites' }] }, ...Object.entries(D.PLAQUES).map(([pl, ss]) => ({ label: pl, collapsible: true, items: [{ v: pl, l: '★ ' + pl, hint: 'toute la plaque' }, ...ss.map((s) => ({ v: s, l: s }))] }))];
        GX.ui.pick(b, groups, { multi: false, selected: [plan.site], title: 'Sites', width: 280, onChange: ([v]) => { plan.site = v; renderPlan(); } });
      }

      /* ---------- Feuilles : création, wording, médias, commentaires ---------- */
      function newPost(date) {
        if (!canEdit()) return;
        const sh = win.sheet(`<h3>Nouvelle Publication</h3><div class="muted" style="font-size:12px">Statut « À venir », date ${date ? 'du ' + F.date(pd(date)) : 'du jour'}, « Tous Services ». Le reste se règle dans la ligne.</div>
          <label class="field" style="margin-top:14px"><span class="label">Titre</span><input class="input" data-np placeholder="Titre de la publication..." maxlength="160" /></label>
          <div class="foot"><button class="btn" data-sheet="">ANNULER</button><button class="btn primary" data-sheet="ok">CRÉER</button></div>`, {
          onClose: (v) => {
            const title = sh.el.querySelector('[data-np]').value.trim(); if (v !== 'ok' || !title) return;
            const p = { id: GX.uid('sp'), title, date: date || GX.iso(GX.today()), status: 'À venir', service: 'Tous Services', brands: [], concessions: [], networks: [], targets: [], lom: null, co2s: [], proPlus: false, link: '', wording: '', media: 0, comments: [], archived: false };
            D.POSTS.unshift(p); saving();
            if (tab === 'plan') { renderPlan(); later(() => flash(bodyEl.querySelector(`.dig-chip[data-id="${p.id}"]`)), 60); }
            else later(() => reveal(p.id), 60);
            GX.shell?.notify?.({ app: 'digital', title: 'Publication créée', body: `« ${title} » — À venir, ${F.date(pd(p.date))}.`, silent: true });
          },
        });
        sh.el.querySelector('[data-np]').addEventListener('keydown', (e) => { if (e.key === 'Enter') sh.el.querySelector('[data-sheet=ok]').click(); });
      }
      function openWording(p) {
        const ed = canEdit();
        const sh = win.sheet(`<h3>Wording</h3><div class="muted ellipsis" style="font-size:12px">${esc(p.title || 'Sans titre')}</div>
          <textarea class="textarea" data-w rows="10" style="margin-top:12px;min-height:220px" placeholder="Écris le texte de la publication…" ${ed ? '' : 'readonly'}>${esc(p.wording)}</textarea>
          <div class="foot" style="align-items:center"><span class="faint num grow" data-wc style="font-size:12px"></span><button class="btn primary" data-sheet="close">Fermer</button></div>`, {
          width: 620,
          onClose: () => { const v = sh.el.querySelector('[data-w]').value; if (ed && v !== p.wording) { p.wording = v; saving(); replaceRow(p); } },
        });
        const ta = sh.el.querySelector('[data-w]'), wc = sh.el.querySelector('[data-wc]');
        const cnt = () => (wc.textContent = `${ta.value.length} caractère${ta.value.length > 1 ? 's' : ''}`); cnt(); ta.addEventListener('input', cnt);
        setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 60);
      }
      function syncCounts(p) {
        const r = bodyEl.querySelector(`.dig-row[data-id="${p.id}"]`); if (!r) return;
        const act = r.querySelector('.dig-act'), sig = () => [...act.querySelectorAll('.bdg')].map((b) => b.textContent).join('|');
        const before = sig(); act.innerHTML = actsHTML(p);
        if (sig() !== before) act.querySelectorAll('.bdg').forEach((b) => GX.animate(b, [{ transform: 'scale(1.5)' }, { transform: 'none' }], { spring: 'bouncy' }));
      }

      function openMedia(p) {
        const ed = canEdit() && !p.archived, M = mediaOf(p);      // Digital.tsx : médias figés sur une publication archivée
        const sh = win.sheet(`<div class="row"><h3 class="grow">Médias</h3><span class="faint num" data-foot style="font-size:12px"></span></div>
          <div class="muted ellipsis" style="font-size:12px">${esc(p.title || 'Sans titre')}</div>
          ${ed ? `<div class="dig-drop" data-drop style="margin-top:14px">${GX.icon('upload', 'lg')}<b style="color:var(--text)">Glisse des fichiers ici…</b><span style="font-size:11px">JPG · PNG · WebP · MP4 · MOV, 2 Go max · ou clique pour parcourir</span><input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.mp4,.mov" hidden data-file /></div>
          <form class="row" data-lform style="margin-top:10px"><input class="input" data-l placeholder="…ou colle un lien WeTransfer, SharePoint, Drive…" /><button class="btn">${GX.icon('link', 'sm')}Ajouter</button></form>` : ''}
          <div class="dig-gal" data-gal></div>
          <div class="foot"><span class="faint grow" style="font-size:11px;align-self:center">${ed ? 'Glisse les vignettes pour changer l’ordre de publication.' : ''}</span><button class="btn primary" data-sheet="">Terminé</button></div>`, { width: 680 });
        const gal = sh.el.querySelector('[data-gal]'), foot = sh.el.querySelector('[data-foot]');
        const commit = () => { p.media = M.length; syncCounts(p); saving(); };
        const tileHTML = (m, i) => m.kind === 'link'
          ? `<div class="dig-tile" draggable="${ed}" data-mid="${m.id}"><span class="dig-num">${i + 1}</span>${tact(m)}<div class="dig-thumb link">${GX.icon('link', 'lg')}<div><b>${esc(m.service)}</b><div class="faint ellipsis" style="font-size:10.5px">${esc(shortLink(m.name))}</div></div></div><div class="dig-fname ellipsis">${esc(m.service)}</div></div>`
          : `<div class="dig-tile" draggable="${ed}" data-mid="${m.id}"><span class="dig-num">${i + 1}</span>${tact(m)}<div class="dig-thumb" data-zoom style="--a:${m.a};--b:${m.b}">${m.url ? `<img src="${m.url}" alt="" />` : GX.icon(m.kind === 'video' ? 'video' : 'image')}${m.kind === 'video' ? `<span class="vid">${esc((m.name.split('.').pop() || 'MP4').toUpperCase())}</span>` : ''}</div><div class="dig-fname ellipsis">${esc(m.name)}</div></div>`;
        const tact = (m) => `<div class="dig-tact"><button data-mact="dl" data-tip="${m.kind === 'link' ? 'Ouvrir' : 'Télécharger'}">${GX.icon(m.kind === 'link' ? 'arrowr' : 'download', 'sm')}</button>${ed ? `<button data-mact="rm" data-tip="Retirer">${GX.icon('close', 'sm')}</button>` : ''}</div>`;
        const draw = () => {
          gal.innerHTML = M.map(tileHTML).join('') || `<div class="empty" style="grid-column:1/-1;padding:20px">${GX.icon('image')}Aucun média pour cette publication</div>`;
          const nf = M.filter((m) => m.kind !== 'link').length, nl = M.length - nf;
          foot.textContent = `${nf} fichier${nf > 1 ? 's' : ''} · ${nl} lien${nl > 1 ? 's' : ''} · max ${MEDIA_MAX}`;
        };
        const renumber = () => gal.querySelectorAll('.dig-tile').forEach((t, i) => (t.querySelector('.dig-num').textContent = i + 1));
        draw();
        const add = (items) => {
          const room = MEDIA_MAX - M.length; if (room <= 0) return GX.shell?.hud(`Maximum ${MEDIA_MAX} médias atteint`);
          const ok = items.slice(0, room); M.push(...ok); draw(); commit();
          gal.querySelectorAll('.dig-tile').forEach((t, i) => { if (i >= M.length - ok.length) GX.animate(t, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy', delay: (i - M.length + ok.length) * 40, fill: 'backwards' }); });
          if (items.length > room) GX.shell?.hud(`Maximum ${MEDIA_MAX} médias : ${items.length - room} ignoré(s)`);
        };
        const addFiles = (files) => {
          const good = [], bad = [];
          files.forEach((fl) => (ACCEPT.test(fl.name) && fl.size <= 2 * 1024 ** 3 ? good : bad).push(fl));
          if (bad.length) GX.shell?.hud(`Format ou taille refusé : ${bad.map((b) => b.name).join(', ')}`);
          add(good.map((fl) => ({ id: GX.uid('m'), kind: /\.(mp4|mov)$/i.test(fl.name) ? 'video' : 'image', name: fl.name, a: '#293f74', b: '#8f12ab', url: /^image\//.test(fl.type) ? URL.createObjectURL(fl) : null })));
        };
        const dz = sh.el.querySelector('[data-drop]');
        if (dz) {
          const fi = dz.querySelector('[data-file]');
          dz.addEventListener('click', () => fi.click()); fi.addEventListener('change', () => { addFiles([...fi.files]); fi.value = ''; });
          dz.addEventListener('dragover', (e) => { if (![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); dz.classList.add('over'); });
          dz.addEventListener('dragleave', () => dz.classList.remove('over'));
          dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles([...(e.dataTransfer?.files || [])]); });
          sh.el.querySelector('[data-lform]').addEventListener('submit', (e) => {
            e.preventDefault(); const inp = sh.el.querySelector('[data-l]'), u = normLink(inp.value);
            if (!/^https?:\/\/\S+\.\S+/.test(u)) { GX.animate(inp, [{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 260 }); return; }
            add([{ id: GX.uid('m'), kind: 'link', name: u, service: linkService(u) }]); inp.value = '';
          });
        }
        gal.addEventListener('click', (e) => {
          const t = e.target.closest('.dig-tile'); if (!t) return; const m = M.find((x) => x.id === t.dataset.mid);
          const a = e.target.closest('[data-mact]');
          if (a?.dataset.mact === 'rm') {
            GX.animate(t, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.6)' }], { duration: 180, fill: 'forwards' }).onfinish = () => {
              const rects = new Map([...gal.children].map((c) => [c.dataset.mid, c.getBoundingClientRect()]));
              M.splice(M.indexOf(m), 1); if (m.url) URL.revokeObjectURL(m.url); draw(); commit();
              gal.querySelectorAll('.dig-tile').forEach((c) => GX.flip(c, rects.get(c.dataset.mid)));
            };
            return;
          }
          if (a?.dataset.mact === 'dl') return GX.shell?.hud(m.kind === 'link' ? `Ouverture de ${m.service} (maquette)` : `Téléchargement de ${m.name} (maquette)`);
          if (e.target.closest('[data-zoom]')) lightbox(M, M.indexOf(m), t.querySelector('.dig-thumb'));
        });
        /* réordonner : glisser-déposer natif + FLIP */
        let dragId = null;
        gal.addEventListener('dragstart', (e) => { const t = e.target.closest('.dig-tile'); if (!t || !ed) return; dragId = t.dataset.mid; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); requestAnimationFrame(() => t.classList.add('dragging')); });
        gal.addEventListener('dragover', (e) => {
          if (!dragId) return; e.preventDefault();
          const over = e.target.closest('.dig-tile'), me = gal.querySelector(`[data-mid="${dragId}"]`); if (!over || over === me) return;
          const rects = new Map([...gal.children].map((c) => [c, c.getBoundingClientRect()]));
          const kids = [...gal.children]; const after = kids.indexOf(over) > kids.indexOf(me);
          gal.insertBefore(me, after ? over.nextSibling : over);
          [...gal.children].forEach((c) => c !== me && GX.flip(c, rects.get(c), { spring: 'snappy' }));
        });
        gal.addEventListener('dragend', () => {
          if (!dragId) return; gal.querySelector(`[data-mid="${dragId}"]`)?.classList.remove('dragging'); dragId = null;
          const order = [...gal.children].map((c) => c.dataset.mid); M.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); renumber(); saving();
        });
      }
      function lightbox(M, i, origin) {
        const imgs = M.filter((m) => m.kind !== 'link'); let k = imgs.indexOf(M[i]);
        lb?.remove(); lb = document.createElement('div'); lb.className = 'dig-lb'; lb.tabIndex = -1;
        const draw = () => { const m = imgs[k]; lb.innerHTML = `<div class="dig-lb-bar"><span class="ellipsis grow">${esc(m.name)}</span><span style="opacity:.6;font-weight:600" class="num">${k + 1} / ${imgs.length}</span><button data-lb="dl" data-tip="Télécharger">${GX.icon('download')}</button><button data-lb="x" data-tip="Fermer (Échap)">${GX.icon('close')}</button></div>
          <div class="dig-lb-stage"><button class="dig-lb-nav" data-lb="prev" ${imgs.length < 2 ? 'style="visibility:hidden"' : ''}>${GX.icon('back', 'lg')}</button><div class="dig-lb-img" style="--a:${m.a};--b:${m.b}">${m.url ? `<img src="${m.url}" alt="" />` : GX.icon(m.kind === 'video' ? 'play' : 'image')}</div><button class="dig-lb-nav" data-lb="next" ${imgs.length < 2 ? 'style="visibility:hidden"' : ''}>${GX.icon('chevron', 'lg')}</button></div>
          <div class="dig-lb-foot">${m.kind === 'video' ? 'Aperçu vidéo (maquette) · ' : ''}← → pour naviguer · Échap pour fermer</div>`; };
        draw(); win.body.append(lb); lb.focus();
        const im = lb.querySelector('.dig-lb-img'), from = origin?.getBoundingClientRect(), to = im.getBoundingClientRect();
        if (from && to.width) GX.animate(im, [{ transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${from.width / to.width})`, transformOrigin: '0 0', borderRadius: '40px' }, { transform: 'none', transformOrigin: '0 0', borderRadius: '16px' }], { spring: 'snappy' });
        const close = () => { const l = lb; lb = null; if (l) GX.animate(l, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).onfinish = () => l.remove(); };
        const go = (d) => { k = (k + d + imgs.length) % imgs.length; draw(); GX.animate(lb.querySelector('.dig-lb-img'), [{ opacity: 0, transform: `translateX(${d * 30}px) scale(.96)` }, { opacity: 1, transform: 'none' }], { spring: 'snappy' }); };
        lb.addEventListener('click', (e) => { const b = e.target.closest('[data-lb]'); if (!b) { if (e.target === lb || e.target.classList.contains('dig-lb-stage')) close(); return; } const a = b.dataset.lb; if (a === 'x') close(); if (a === 'prev') go(-1); if (a === 'next') go(1); if (a === 'dl') GX.shell?.hud(`Téléchargement de ${imgs[k].name} (maquette)`); });
        lb.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); });
      }

      function openComments(p) {
        const ro = !canEdit();
        const sh = win.sheet(`<div class="row"><h3 class="grow">Commentaires</h3><span class="badge" style="--c:var(--bony-violet)" data-cn></span></div>
          <div class="muted ellipsis" style="font-size:12px">${esc(p.title || 'Sans titre')}</div>
          <div class="dig-cmts" data-list></div>
          ${ro ? '<div class="faint" style="margin-top:12px;font-size:12px">Lecture seule : vous ne pouvez pas commenter.</div>' : `<div class="dig-compose"><textarea class="textarea" data-c rows="1" maxlength="2000" placeholder="Écrire un commentaire…"></textarea><button class="btn primary" data-send data-tip="Envoyer (Entrée)">${GX.icon('send', 'sm')}</button></div>
          <div class="row faint" style="font-size:11px;margin-top:6px"><span class="grow">Entrée pour envoyer · Maj+Entrée pour un retour à la ligne</span><span class="num" data-cc>0 / 2000</span></div>`}
          <div class="foot"><button class="btn" data-sheet="">Fermer</button></div>`, { width: 540 });
        const list = sh.el.querySelector('[data-list]');
        const draw = () => {
          list.innerHTML = p.comments.map((c, i) => { const u = D.user(c.u), mine = c.u === 'me'; return `<div class="dig-cmt ${mine ? 'mine' : ''}" data-i="${i}">${GX.r.av(c.u)}<div class="bub"><div class="who"><b>${esc(u.name)}</b><span class="faint num">${cDate(c)}</span><span class="grow"></span>${(mine || isAdmin()) && !ro ? `<button class="icon-btn sm x" data-del data-tip="Supprimer">${GX.icon('trash', 'sm')}</button>` : ''}</div><div class="txt">${esc(c.t)}</div></div></div>`; }).join('') || `<div class="empty" style="padding:24px">${GX.icon('message')}Aucun commentaire pour l’instant</div>`;
          sh.el.querySelector('[data-cn]').textContent = p.comments.length;
        };
        draw(); list.scrollTop = list.scrollHeight;
        list.addEventListener('click', (e) => {
          const b = e.target.closest('[data-del]'); if (!b) return; const el = b.closest('.dig-cmt'), i = +el.dataset.i;
          collapse(el, () => { p.comments.splice(i, 1); draw(); syncCounts(p); saving(); });
        });
        const ta = sh.el.querySelector('[data-c]'); if (!ta) return;
        const cc = sh.el.querySelector('[data-cc]');
        const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; cc.textContent = `${ta.value.length} / 2000`; };
        const send = () => {
          const t = ta.value.trim().slice(0, 2000); if (!t) return;
          p.comments.push({ u: 'me', t, d: new Date().toISOString() }); ta.value = ''; grow(); draw(); syncCounts(p); saving();
          const last = list.lastElementChild; list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
          last && GX.animate(last, [{ opacity: 0, transform: 'translateY(10px) scale(.97)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy' });
        };
        ta.addEventListener('input', grow);
        ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
        sh.el.querySelector('[data-send]').addEventListener('click', send);
        setTimeout(() => ta.focus(), 60);
      }

      /* ---------- Aperçu rapide ---------- */
      function quickLook(p, origin) {
        const v = sitesView(p);
        const ql = GX.shell?.quickLook?.({ title: p.title || 'Sans titre', origin, html: `<div style="display:grid;gap:12px">
          <div class="row wrap">${stBadge(p.status)}${svcBadge(p.service)}${GX.r.brandChips(p.brands)}${p.proPlus ? GX.r.proPlus() : ''}${p.archived ? '<span class="badge">Archivée</span>' : ''}</div>
          <div class="muted">${F.dateLong(pd(p.date))} · ${TARGETS.filter(([t]) => p.targets.includes(t)).map(([, l]) => l).join(' + ') || 'Diffusion non définie'}</div>
          <div class="card pad" style="white-space:pre-wrap;font-size:12.5px;line-height:1.55">${p.wording ? esc(p.wording) : '<span class="faint">Aucun wording</span>'}</div>
          <div class="row wrap" style="gap:6px">${p.networks.map((n) => `<span class="chip" style="cursor:default">${netIc(n)}${esc(n)}</span>`).join('') || '<span class="faint">Aucun réseau</span>'}</div>
          <div class="faint" style="font-size:12px">${GX.icon('pin', 'sm')} ${esc(v.shown.join(', ') || '—')}${v.hidden ? ` · +${v.hidden} masqué(s)` : ''}${p.co2s.length ? ' · CO² : ' + esc(p.co2s.join(', ')) : ''}</div>
          <div class="row"><span class="faint grow" style="font-size:12px">${p.media || 0} média(s) · ${p.comments.length} commentaire(s)</span>${isSM() ? '' : `<button class="btn sm primary" data-ql-open>${p.archived ? 'Voir dans les Archives' : 'Voir dans le calendrier'}</button>`}</div></div>` });
        document.querySelector('.ql [data-ql-open]')?.addEventListener('click', () => { ql?.close(); reveal(p.id); });
      }
      function flash(el) { if (!el) return; el.classList.remove('dig-hl'); void el.offsetWidth; el.classList.add('dig-hl'); later(() => el.classList.remove('dig-hl'), 1900); }
      function reveal(id) {
        const p = post(id); if (!p) return;
        if (!inPeri(p)) GX.shell?.hud(`Publication hors du périmètre « ${GX.ctx.perimetre} »`);
        if (isSM() || tab === 'plan') {
          tab = 'plan'; plan.anchor = pd(p.date); renderAll();
          const c = bodyEl.querySelector(`.dig-chip[data-id="${id}"], .dig-ag-it[data-id="${id}"]`);
          c?.scrollIntoView({ block: 'center', behavior: 'smooth' }); later(() => c && GX.animate(c, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'none' }], { spring: 'bouncy' }), 250);
          return;
        }
        const want = p.archived ? 'arch' : 'cal';
        const passes = listPosts(p.archived).includes(p);
        if (!passes) Object.assign(f, { q: '', brand: '', service: '' });
        if (tab !== want || !passes) { tab = want; renderAll(); }
        const row = bodyEl.querySelector(`.dig-row[data-id="${id}"]`); if (!row) return;
        row.scrollIntoView({ block: 'center', behavior: 'smooth' }); flash(row);
      }

      /* ---------- Planning ---------- */
      function planRange() {
        if (plan.mode === 'week') { const s = monday(plan.anchor); return [s, GX.addDays(s, 6)]; }
        const first = new Date(plan.anchor.getFullYear(), plan.anchor.getMonth(), 1), last = new Date(plan.anchor.getFullYear(), plan.anchor.getMonth() + 1, 0);
        return [monday(first), GX.addDays(monday(last), 6), first, last];
      }
      const planPosts = () => D.POSTS.filter((p) => inPeri(p) && (!plan.site || p.concessions.includes('GROUPE BONY') || p.concessions.includes(plan.site) || (D.PLAQUES[plan.site] && p.concessions.some((c) => D.PLAQUES[plan.site].includes(c)))));
      function chipHTML(p, week) {
        const s = stOf(p.status);
        const nets = `<span class="nets">${p.networks.slice(0, 3).map(netIc).join('')}${p.networks.length > 3 ? `<span class="pl">+${p.networks.length - 3}</span>` : ''}</span>`;
        return week
          ? `<div class="dig-chip ${s.strike ? 'strike' : ''} ${p.archived ? 'arch' : ''}" data-id="${p.id}" style="--c:${stColor(p.status)}"><div class="wk">${GX.r.brandDots(p.brands)}<span class="grow"></span>${nets}</div><span class="t">${esc(p.title || 'Sans titre')}</span><div>${stBadge(p.status)}</div></div>`
          : `<div class="dig-chip ${s.strike ? 'strike' : ''} ${p.archived ? 'arch' : ''}" data-id="${p.id}" style="--c:${stColor(p.status)}">${nets}<span class="t">${esc(p.title || 'Sans titre')}</span></div>`;
      }
      function renderPlan() {
        const [a, b, first] = planRange(), ed = canEdit() && !compact;
        const P = planPosts(), byDay = {};
        P.forEach((p) => (byDay[p.date] ??= []).push(p));
        Object.values(byDay).forEach((l) => l.sort((x, y) => D.SOCIAL_STATUS.findIndex((s) => s.id === x.status) - D.SOCIAL_STATUS.findIndex((s) => s.id === y.status)));
        const days = []; for (let d = new Date(a); d <= b; d = GX.addDays(d, 1)) days.push(new Date(d));
        const inRange = P.filter((p) => p.date >= GX.iso(plan.mode === 'week' ? a : first) && p.date <= GX.iso(plan.mode === 'week' ? b : planRange()[3]));
        const title = plan.mode === 'week' ? `Semaine du ${F.date(a)}` : plan.anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        const today = GX.iso(GX.today());
        const siteSel = isSM() ? GX.ui.pickerBtn('disabled', 'pin', GX.ctx.site, true) : GX.ui.pickerBtn('data-psite', 'pin', plan.site ? (D.PLAQUES[plan.site] ? '★ ' + plan.site : plan.site) : 'Tous Sites', plan.site);
        let grid;
        if (compact) {
          const list = inRange.slice().sort((x, y) => x.date.localeCompare(y.date)); const groups = {};
          list.forEach((p) => (groups[p.date] ??= []).push(p));
          grid = `<div class="scroll grow dig-agenda" style="min-height:0">${Object.entries(groups).map(([d, ps]) => `<div class="dig-ag-d ${d === today ? 'today' : ''}">${d === today ? 'Aujourd’hui · ' : ''}${F.dateLong(pd(d))}</div>${ps.map((p) => `<div class="dig-ag-it" data-id="${p.id}" style="--c:${stColor(p.status)}"><div class="grow" style="min-width:0"><div class="ellipsis" style="font-weight:600;${stOf(p.status).strike ? 'text-decoration:line-through' : ''}">${esc(p.title || 'Sans titre')}</div><div class="row" style="gap:4px;margin-top:3px">${GX.r.brandDots(p.brands)}<span class="dig-nets">${netsHTML(p.networks, 4)}</span></div></div>${stBadge(p.status)}</div>`).join('')}`).join('') || `<div class="empty">${GX.icon('agenda')}Aucune publication sur la période</div>`}</div>`;
        } else {
          grid = `<div class="dig-dows">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d, i) => `<span>${plan.mode === 'week' ? `${d} ${days[i].getDate()}` : d}</span>`).join('')}</div>
            <div class="dig-grid ${plan.mode === 'week' ? 'week' : ''} ${ed ? 'dig-edit' : ''}" data-grid>${days.map((d) => { const iso = GX.iso(d), l = byDay[iso] || [], out = plan.mode === 'month' && d.getMonth() !== plan.anchor.getMonth();
              return `<div class="dig-day ${out ? 'out' : ''} ${iso === today ? 'today' : ''}" data-date="${iso}"><div class="dn"><b>${d.getDate() === 1 && plan.mode === 'month' ? F.date(d) : d.getDate()}</b>${l.length ? `<span class="n">${l.length}</span>` : ''}</div><div class="dl">${l.map((p) => chipHTML(p, plan.mode === 'week')).join('')}</div></div>`; }).join('')}</div>`;
        }
        bodyEl.innerHTML = `<div class="dig-plan"><div class="dig-ph">
          <h2 class="grow">${esc(title)}</h2>
          <div class="row" style="gap:4px"><button class="icon-btn" data-nav="-1" data-tip="Précédent">${GX.icon('back')}</button><button class="btn sm" data-nav="0">Auj.</button><button class="icon-btn" data-nav="1" data-tip="Suivant">${GX.icon('chevron')}</button></div>
          <div class="seg" data-pmode><button data-v="month" aria-pressed="${plan.mode === 'month'}">Mois</button><button data-v="week" aria-pressed="${plan.mode === 'week'}">Sem.</button></div>
          ${siteSel}<span class="badge num" style="--c:var(--info)">${inRange.length} post${inRange.length > 1 ? 's' : ''}</span>
          ${ed ? `<span class="dig-prop" data-tip="Amélioration proposée pour la refonte : n’existe pas encore dans Gearbox">${GX.icon('bolt', 'sm')}Proposition · glisser pour replanifier</span>` : ''}
        </div>${grid}</div>`;
      }
      /* info-bulle riche */
      function showHC(chip) {
        const p = post(chip.dataset.id); if (!p) return; hideHC();
        const v = sitesView(p), el = document.createElement('div'); el.className = 'dig-hc glass glass-strong';
        el.innerHTML = `<div class="row" style="gap:6px;flex-wrap:wrap">${p.brands.map((b) => `<span class="dig-bp" style="font-size:11px"><i class="brand-dot" style="--c:${D.brand(b)?.hex}"></i>${esc(brandLabel(b))}</span>`).join('') || '<span class="faint" style="font-size:11px">Aucune marque</span>'}<span class="grow"></span>${stBadge(p.status)}</div>
          <b class="t">${esc(p.title || 'Sans titre')}</b><span class="faint">${F.dateLong(pd(p.date))}</span>
          ${p.wording ? `<span class="muted" style="line-height:1.45">${esc(p.wording.length > 120 ? p.wording.slice(0, 118) + '…' : p.wording)}</span>` : ''}
          <div class="row wrap" style="gap:4px">${v.shown.slice(0, 3).map((s) => `<span class="badge">${esc(s)}</span>`).join('')}${v.shown.length > 3 ? `<span class="badge">+${v.shown.length - 3}</span>` : ''}${v.hidden ? `<span class="badge" style="--c:var(--text-3)">+${v.hidden} masqué${v.hidden > 1 ? 's' : ''}</span>` : ''}</div>
          <div class="row" style="gap:6px">${p.networks.map(netIc).join('') || '<span class="faint">Aucun réseau</span>'}</div>`;
        appEl.append(el);
        const ar = appEl.getBoundingClientRect(), r = chip.getBoundingClientRect();
        let x = r.right - ar.left + 8, y = r.top - ar.top - 6;
        if (x + el.offsetWidth > ar.width - 6) x = r.left - ar.left - el.offsetWidth - 8;
        if (x < 6) x = Math.max(6, Math.min(r.left - ar.left, ar.width - el.offsetWidth - 6));
        y = Math.max(6, Math.min(y, ar.height - el.offsetHeight - 6));
        Object.assign(el.style, { left: x + 'px', top: y + 'px' }); hc = el;
      }
      function hideHC() { clearTimeout(hcT); if (hc) { hc.remove(); hc = null; } }
      bodyEl.addEventListener('pointerover', (e) => {
        if (tab !== 'plan' || e.pointerType === 'touch') return;
        const c = e.target.closest('.dig-chip'); if (!c || c.contains(e.relatedTarget)) return;
        clearTimeout(hcT); hcT = setTimeout(() => showHC(c), 280);
      });
      bodyEl.addEventListener('pointerout', (e) => { const c = e.target.closest('.dig-chip'); if (c && !c.contains(e.relatedTarget)) hideHC(); });
      /* glisser-déposer : replanifier (proposition) */
      bodyEl.addEventListener('pointerdown', (e) => {
        if (tab !== 'plan' || e.button !== 0) return;
        const chip = e.target.closest('.dig-chip'); if (!chip) return;
        const p = post(chip.dataset.id), sx = e.clientX, sy = e.clientY, canDrag = canEdit() && !compact && e.pointerType !== 'touch';
        let ghost = null, over = null, off = null;
        const move = (ev) => {
          if (!ghost) {
            if (!canDrag || Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
            hideHC(); const r = chip.getBoundingClientRect(), ar = appEl.getBoundingClientRect();
            ghost = chip.cloneNode(true); ghost.classList.add('dig-ghost'); ghost.style.width = r.width + 'px';
            off = { x: sx - r.left, y: sy - r.top, ax: ar.left, ay: ar.top }; appEl.append(ghost); chip.classList.add('lift'); appEl.classList.add('dig-grab');
            GX.animate(ghost, [{ transform: 'none' }, { transform: 'rotate(-2deg) scale(1.06)' }], { spring: 'bouncy' });
          }
          ghost.style.left = ev.clientX - off.x - off.ax + 'px'; ghost.style.top = ev.clientY - off.y - off.ay + 'px';
          const d = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.dig-day');
          if (d !== over) { over?.classList.remove('drop'); over = d; over?.classList.add('drop'); }
        };
        const up = () => {
          removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
          if (!ghost) { quickLook(p, chip); return; }
          appEl.classList.remove('dig-grab'); over?.classList.remove('drop');
          const from = ghost.getBoundingClientRect();
          if (over && over.dataset.date !== p.date) {
            const old = p.date; p.date = over.dataset.date; saving(); ghost.remove(); renderPlan();
            const nc = bodyEl.querySelector(`.dig-chip[data-id="${p.id}"]`); if (nc) GX.flip(nc, from, { spring: 'bouncy' });
            GX.shell?.hud(`Replanifiée : ${F.date(pd(old))} → ${F.date(pd(p.date))}`);
          } else {
            const to = chip.getBoundingClientRect();
            GX.animate(ghost, [{ left: ghost.style.left, top: ghost.style.top }, { left: to.left - off.ax + 'px', top: to.top - off.ay + 'px', transform: 'none' }], { spring: 'snappy', fill: 'forwards' }).onfinish = () => { ghost.remove(); chip.classList.remove('lift'); };
          }
        };
        addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
      });

      /* ---------- Gestion des TAGS ---------- */
      const TAGS = {
        net: { title: 'Réseaux Sociaux', icon: 'globe', ph: 'Nouveau réseau…', list: () => D.NETWORKS.map((n) => n.id), used: (p, n) => p.networks.includes(n) },
        co2: { title: 'Classes CO² & Mentions', icon: 'leaf', ph: 'Ex. CLIO - B120', list: () => D.CO2, used: (p, n) => p.co2s.includes(n) },
        lom: { title: 'Mentions Loi LOM', icon: 'info', ph: 'Nouvelle mention…', list: () => D.LOM, used: (p, n) => p.lom === n },
      };
      function tagItem(key, n) {
        const locked = key === 'net' && BASE_NETS.includes(n), ed = canEdit(), used = D.POSTS.filter((p) => TAGS[key].used(p, n)).length;
        return `<div class="dig-tag" data-tag="${esc(n)}">${key === 'net' ? netIc(n) : ''}<span class="nm ${key === 'lom' ? 'long' : ''}">${esc(n)}</span><span class="faint num" style="font-size:11px" data-tip="${used} publication(s)">${used}</span>
          ${locked ? `<span class="dig-lock" data-tip="Réseau de base : verrouillé">${GX.icon('lock', 'sm')}</span>` : ed ? `<span class="ctrl"><button class="icon-btn sm" data-tact="edit" data-tip="Modifier">${GX.icon('edit', 'sm')}</button><button class="icon-btn sm dig-tdel" data-tact="del" data-tip="Supprimer">${GX.icon('trash', 'sm')}</button></span>` : ''}</div>`;
      }
      function renderTags() {
        const ed = canEdit();
        bodyEl.innerHTML = `<div class="dig-tags">${Object.entries(TAGS).map(([k, t], i) => `<section class="card dig-tagcol enter" style="--i:${i * 2}" data-tags="${k}">
          <div class="dig-tagh">${GX.icon(t.icon, 'sm')}<b>${t.title}</b><span class="count" data-tc>${t.list().length}</span></div>
          ${ed ? `<form class="dig-tagadd" data-add><input class="input" placeholder="${t.ph}" maxlength="120" /><button class="btn sm primary">${GX.icon('plus', 'sm')}Ajouter</button></form>` : ''}
          <div class="dig-taglist scroll">${t.list().map((n) => tagItem(k, n)).join('')}</div></section>`).join('')}</div>`;
      }
      function renameTag(key, oldN, newN) {
        newN = newN.trim(); if (!newN || newN === oldN) return false;
        if (TAGS[key].list().includes(newN)) { GX.shell?.hud('Ce tag existe déjà'); return false; }
        if (key === 'net') { D.NETWORKS.find((n) => n.id === oldN).id = newN; D.POSTS.forEach((p) => (p.networks = p.networks.map((x) => (x === oldN ? newN : x)))); }
        if (key === 'co2') { D.CO2[D.CO2.indexOf(oldN)] = newN; D.POSTS.forEach((p) => (p.co2s = p.co2s.map((x) => (x === oldN ? newN : x)))); }
        if (key === 'lom') { D.LOM[D.LOM.indexOf(oldN)] = newN; D.POSTS.forEach((p) => { if (p.lom === oldN) p.lom = newN; }); }
        saving(); return true;
      }
      bodyEl.addEventListener('submit', (e) => {
        const fm = e.target.closest('[data-add]'); if (!fm) return; e.preventDefault();
        const col = fm.closest('[data-tags]'), key = col.dataset.tags, inp = fm.querySelector('input'), n = inp.value.trim();
        if (!n) return; if (TAGS[key].list().includes(n)) { GX.shell?.hud('Ce tag existe déjà'); return; }
        if (key === 'net') D.NETWORKS.push({ id: n, icon: 'globe', c: TAG_COLORS[D.NETWORKS.length % TAG_COLORS.length] }); else (key === 'co2' ? D.CO2 : D.LOM).push(n);
        inp.value = ''; saving();
        const list = col.querySelector('.dig-taglist'); list.insertAdjacentHTML('beforeend', tagItem(key, n));
        const it = list.lastElementChild; it.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        GX.animate(it, [{ opacity: 0, transform: 'translateY(8px) scale(.96)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy' });
        col.querySelector('[data-tc]').textContent = TAGS[key].list().length;
      });

      /* ---------- Délégation d'événements ---------- */
      tabsEl.addEventListener('change', (e) => { tab = e.detail; renderBar(); renderBody(); });
      barEl.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { f.q = e.target.value; renderList(); } });
      barEl.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) openBarPick(b); if (e.target.closest('[data-act=clear]')) { Object.assign(f, { q: '', brand: '', service: '' }); renderBar(); renderList({ anim: true }); } });
      barEl.addEventListener('click', (e) => { if (e.target.closest('[data-act=new]')) newPost(); });
      bodyEl.addEventListener('scroll', () => { closePop(); hideHC(); }, { passive: true });
      bodyEl.addEventListener('change', (e) => {
        const t = e.target;
        const row = t.closest('.dig-row'); if (!row) return; const p = post(row.dataset.id);
        if (t.dataset.act === 'archive') {
          p.archived = t.checked; saving();
          GX.shell?.hud(p.archived ? 'Publication archivée' : 'Publication désarchivée');
          collapse(row, () => { const c = barEl.querySelector('[data-count]'); const n = listPosts(tab === 'arch').length; if (c) c.textContent = `${n} publication${n > 1 ? 's' : ''}`; });
          return;
        }
        const k = t.dataset.k; if (!k) return;
        if (k === 'title') return setField(p, k, t.value.trim());
        if (k === 'date' && t.value) { setField(p, k, t.value); renderList({ flip: true }); flash(bodyEl.querySelector(`.dig-row[data-id="${p.id}"]`)); }
      });
      bodyEl.addEventListener('keydown', (e) => {
        if (e.target.matches('.dig-ttl') && e.key === 'Enter') e.target.blur();
        if (e.target.matches('.dig-wording') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openWording(post(e.target.closest('.dig-row').dataset.id)); }
        if (e.target.matches('[data-linkin]')) {
          if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
          if (e.key === 'Escape') { e.target.dataset.cancel = '1'; e.target.blur(); }
        }
      });
      bodyEl.addEventListener('focusout', (e) => {
        const t = e.target; if (!t.matches('[data-linkin]')) return;
        const row = t.closest('.dig-row'), p = post(row.dataset.id);
        if (!t.dataset.cancel) { const v = normLink(t.value); if (v !== p.link) { p.link = v; saving(); } }
        const box = row.querySelector('.dig-link'); box.innerHTML = linkHTML(p, canEdit());
        GX.animate(box, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
      });
      bodyEl.addEventListener('dblclick', (e) => {
        if (tab !== 'plan' || e.target.closest('.dig-chip')) return;
        const d = e.target.closest('.dig-day'); if (d && canEdit()) newPost(d.dataset.date);
      });
      bodyEl.addEventListener('click', (e) => {
        const t = e.target;
        if (tab === 'plan') {
          const ps = t.closest('[data-psite]'); if (ps) return openSitePick(ps);
          const nav = t.closest('[data-nav]');
          if (nav) { const n = +nav.dataset.nav; plan.anchor = n === 0 ? GX.today() : plan.mode === 'week' ? GX.addDays(plan.anchor, 7 * n) : new Date(plan.anchor.getFullYear(), plan.anchor.getMonth() + n, 1); renderPlan(); GX.animate(bodyEl.querySelector('.dig-grid, .dig-agenda'), [{ opacity: 0, transform: `translateX(${(n || 0) * 24}px)` }, { opacity: 1, transform: 'none' }], { spring: 'snappy' }); return; }
          const ag = t.closest('.dig-ag-it'); if (ag) quickLook(post(ag.dataset.id), ag);
          return;
        }
        if (tab === 'tags') return tagClick(e);
        if (t.closest('[data-act=sort]')) { sortAsc = !sortAsc; renderList({ flip: true }); return; }
        const row = t.closest('.dig-row'); if (!row) return; const p = post(row.dataset.id);
        const pk = t.closest('[data-pick]'); if (pk && !pk.disabled) return openPick(pk, p, pk.dataset.pick);
        const tg = t.closest('[data-target]');
        if (tg && !tg.disabled) { const v = tg.dataset.target; p.targets = p.targets.includes(v) ? p.targets.filter((x) => x !== v) : [...p.targets, v]; tg.setAttribute('aria-pressed', p.targets.includes(v)); saving(); return; }
        const act = t.closest('[data-act]')?.dataset.act;
        if (act === 'open-link') { e.preventDefault(); GX.shell?.hud(`Ouverture de ${shortLink(p.link)} (maquette)`); return; }
        if (act === 'link-edit') {
          const box = row.querySelector('.dig-link'); box.innerHTML = `<input class="input" data-linkin value="${esc(p.link)}" placeholder="https://… ou www.…" />`;
          const i = box.querySelector('input'); i.focus(); i.select(); return;
        }
        if (act === 'pro') { p.proPlus = !p.proPlus; saving(); replaceRow(p); return; }
        if (act === 'wording') return openWording(p);
        if (act === 'media') return openMedia(p);
        if (act === 'comments') return openComments(p);
        if (act === 'more-set') { row.classList.toggle('open'); return; }
        if (act === 'del') {
          const b = t.closest('[data-act=del]');
          if (b.classList.contains('confirm')) { D.POSTS.splice(D.POSTS.indexOf(p), 1); saving(); collapse(row, () => renderList()); GX.shell?.hud('Publication supprimée'); return; }
          b.classList.add('confirm'); b.innerHTML = 'SUPPR<br>?'; b.dataset.tip = 'Confirmer la suppression'; GX.animate(b, [{ transform: 'scale(.9)' }, { transform: 'none' }], { spring: 'bouncy' });
          later(() => { if (b.isConnected) { b.classList.remove('confirm'); b.innerHTML = GX.icon('trash', 'sm'); b.dataset.tip = 'Supprimer définitivement'; } }, 3000);
        }
      });
      function tagClick(e) {
        const b = e.target.closest('[data-tact]'); if (!b) return;
        const it = b.closest('.dig-tag'), col = b.closest('[data-tags]'), key = col.dataset.tags, n = it.dataset.tag;
        if (b.dataset.tact === 'del') {
          if (b.classList.contains('confirm')) {
            if (key === 'net') D.NETWORKS.splice(D.NETWORKS.findIndex((x) => x.id === n), 1); else { const a = key === 'co2' ? D.CO2 : D.LOM; a.splice(a.indexOf(n), 1); }
            saving(); collapse(it, () => (col.querySelector('[data-tc]').textContent = TAGS[key].list().length)); return;
          }
          b.classList.add('confirm'); b.textContent = 'Confirmer ?'; b.dataset.tip = '';
          later(() => { if (b.isConnected) { b.classList.remove('confirm'); b.innerHTML = GX.icon('trash', 'sm'); } }, 3000);
          return;
        }
        const nm = it.querySelector('.nm'); it.querySelector('.ctrl').classList.add('hide');
        nm.outerHTML = `<input class="input" value="${esc(n)}" />`;
        const inp = it.querySelector('input'); inp.focus(); inp.select();
        let done = false;
        const finish = (ok) => { if (done) return; done = true; const v = inp.value; const changed = ok && renameTag(key, n, v); it.outerHTML = tagItem(key, changed ? v.trim() : n); };
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') finish(true); if (ev.key === 'Escape') { ev.stopPropagation(); finish(false); } });
        inp.addEventListener('blur', () => finish(true));
      }
      bodyEl.addEventListener('contextmenu', (e) => {
        const chip = e.target.closest('.dig-chip, .dig-ag-it'), row = e.target.closest('.dig-row');
        if ((!chip && !row) || e.target.closest('input,textarea')) return;
        e.preventDefault(); hideHC();
        const el = chip || row, p = post(el.dataset.id), ed = canEdit();
        const setStatus = D.SOCIAL_STATUS.map((s) => ({ label: s.id, checked: p.status === s.id, action: () => { p.status = s.id; saving(); tab === 'plan' ? renderPlan() : replaceRow(p); } }));
        GX.menu.open([
          { label: 'Aperçu rapide', icon: 'quicklook', action: () => quickLook(p, el) },
          ...(chip && !isSM() ? [{ label: p.archived ? 'Voir dans les Archives' : 'Voir dans le calendrier', icon: 'list', action: () => { tab = 'cal'; reveal(p.id); } }] : []),
          ...(row ? [{ label: 'Médias…', icon: 'image', action: () => openMedia(p) }, { label: 'Commentaires…', icon: 'message', action: () => openComments(p) }] : []),
          ...(ed ? ['-', { header: 'Statut' }, ...setStatus, '-',
            ...(chip ? [{ label: 'Replanifier au lendemain', icon: 'arrowr', action: () => { p.date = GX.iso(GX.addDays(pd(p.date), 1)); saving(); renderPlan(); } }] : []),
            { label: 'Dupliquer', icon: 'copy', action: () => { const c = structuredClone({ ...p, _media: undefined }); c.id = GX.uid('sp'); c.title = (p.title || '') + ' (copie)'; c.status = 'À venir'; c.comments = []; c.archived = false; D.POSTS.unshift(c); saving(); tab === 'plan' ? renderPlan() : reveal(c.id); } },
            ...(row ? [{ label: p.archived ? 'Désarchiver' : 'Archiver', icon: 'archives', action: () => { p.archived = !p.archived; saving(); collapse(row); } }] : [])] : []),
        ], { x: e.clientX, y: e.clientY });
      });
      bodyEl.addEventListener('change', (e) => {
        const seg = e.target.closest?.('[data-pmode]'); if (!seg || !e.detail) return;
        plan.mode = e.detail; later(() => renderPlan(), 170);
      });

      const stopW = GX.ui.watchWidth(body, 720, (c) => { const was = compact; compact = c; if (tab === 'plan' && was !== c) renderPlan(); });
      compact = body.clientWidth < 720;
      renderAll();
      const offs = [GX.on('ctx', () => { closePop(); renderAll(); })];

      return {
        destroy: () => { stopW(); offs.forEach((o) => o()); closePop(); hideHC(); lb?.remove(); timers.forEach(clearTimeout); clearTimeout(hcT); },
        command: (c) => {
          if (c === 'new-post') { if (!canEdit()) return GX.shell?.hud('Lecture seule : création impossible'); if (tab !== 'cal' && tab !== 'plan') { tab = 'cal'; renderAll(); } newPost(); }
          else if (typeof c === 'string' && c.startsWith('post:')) reveal(c.slice(5));
        },
        menus: () => ({
          'Fichier': [{ label: 'Nouvelle publication…', icon: 'plus', disabled: !canEdit(), action: () => { if (tab !== 'cal' && tab !== 'plan') { tab = 'cal'; renderAll(); } newPost(); } }],
          'Présentation': [
            ...(isSM() ? TABS.filter((t) => t[0] === 'plan') : TABS).map(([v, l]) => ({ label: l, checked: tab === v, action: () => { tab = v; renderAll(); } })), '-',
            { label: 'Tri par date croissante', checked: sortAsc, disabled: tab === 'plan' || tab === 'tags', action: () => { sortAsc = true; renderList({ flip: true }); } },
            { label: 'Tri par date décroissante', checked: !sortAsc, disabled: tab === 'plan' || tab === 'tags', action: () => { sortAsc = false; renderList({ flip: true }); } }, '-',
            { label: 'Planning : mois', checked: plan.mode === 'month', action: () => { plan.mode = 'month'; tab = 'plan'; renderAll(); } },
            { label: 'Planning : semaine', checked: plan.mode === 'week', action: () => { plan.mode = 'week'; tab = 'plan'; renderAll(); } },
            { label: 'Revenir à aujourd’hui', icon: 'agenda', action: () => { plan.anchor = GX.today(); tab = 'plan'; renderAll(); } },
          ],
        }),
      };
    },
  });
})();
