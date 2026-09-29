/* =====================================================================
   Rubrique « Congés » (miroir de pages/Conges.tsx)
   - onglets Planning / Agenda / Tableau de bord
   - Planning : collaborateurs × jours du mois, Total, « Absents / jour »,
     week-ends et fériés grisés ; clic sur une case → panneau (types,
     puis Journée / Matin / Après-midi, ✓ validation, retrait) ; GLISSER
     sur plusieurs cases de sa ligne = raccourci « poser une période »
   - validation : case pleine = validée, pâle = en attente ; seuls
     Master et Director valident (Administrator EXCLU, décision de Théo) ;
     chacun ne modifie que SA ligne, les gestionnaires (Master,
     Administrator, Director) toutes
   - période de référence 1er juin → 31 mai, droit 25 j ouvrés par
     défaut, seuls les CP décomptés du solde
   - « Poser une période » et « Participants » en PANNEAU LATÉRAL
   - accès : membres du périmètre + gestionnaires ; jamais Chef de site
     ni Externe (CONGES_LECTURE_ROLES)
   - fenêtre étroite / téléphone : une carte par personne
   ===================================================================== */
(() => {
  const D = GX.data;
  GX.css(`
  .cng-h .ah-tabs .tabs{border:0}
  .cng-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .cng-h2 .cng-lgw{margin-left:auto}
  .cng-sep{background:var(--line-2)}
  .cng-nav{display:flex;align-items:center;gap:4px;height:36px}
  .cng-nav b{font-size:15px;letter-spacing:-.01em;min-width:170px;text-align:center;white-space:nowrap}
  .cng-legend{display:flex;align-items:center;gap:4px 14px;flex-wrap:wrap;min-height:36px;font-size:var(--fs-13);color:var(--text)}
  .cng-legend span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
  .cng-legend i{width:14px;height:14px;border-radius:4px;background:var(--c)}
  .cng-legend i.pend{background:color-mix(in srgb,var(--c) 26%,transparent);box-shadow:inset 0 0 0 1.5px var(--c)}
  .cng-legend i.half{background:linear-gradient(90deg,var(--c) 50%,transparent 50%);box-shadow:inset 0 0 0 1.5px var(--c)}
  .cng-legend i.we{background:var(--we);box-shadow:inset 0 0 0 1px var(--line-2)}
  .cng-body{flex:1;min-height:0;display:flex;position:relative}
  .cng-main{flex:1;min-width:0;min-height:0;position:relative;display:flex;flex-direction:column}
  .cng-pane{position:absolute;inset:0;display:flex;flex-direction:column;z-index:1}
  .cng-pane.out{pointer-events:none;z-index:0}
  /* Le planning : une carte détachée du fond, pleine largeur */
  .cng-stage{position:relative;flex:1;min-height:0;overflow:hidden;margin:0 22px 22px;border:1px solid var(--line-2);border-radius:14px;background:var(--surface-1)}
  .cng-stage > .cng-pane{background:var(--surface-1)}

  /* Case de congé : pleine = validée (texte blanc sur la couleur du type), en attente = teinte + contour pointillé */
  .cng{--we:color-mix(in srgb,var(--surface-4) 55%,transparent);--pendmix:30%}
  .cng [style*="--c:"]{--ct:color-mix(in srgb,var(--c) 55%,#fff)}
  :root[data-theme="light"] .cng{--we:color-mix(in srgb,var(--surface-4) 70%,transparent);--pendmix:20%}
  :root[data-theme="light"] .cng [style*="--c:"]{--ct:color-mix(in srgb,var(--c) 72%,#000)}
  .cng-k{--f:var(--c);position:absolute;inset:4px 3px;border-radius:6px;display:grid;place-items:center;font-size:11px;font-weight:800;letter-spacing:.01em;color:#fff;background:var(--f);font-style:normal;line-height:1;text-shadow:0 1px 1px rgba(0,0,0,.25)}
  .cng-k.pend{--f:color-mix(in srgb,var(--c) var(--pendmix),transparent);color:var(--ct);text-shadow:none;outline:1.5px dashed var(--c);outline-offset:-1.5px}
  .cng-k.am{background:linear-gradient(90deg,var(--f) 50%,transparent 50%);box-shadow:inset 0 0 0 1.5px var(--c);color:var(--text);text-shadow:none}
  .cng-k.pm{background:linear-gradient(90deg,transparent 50%,var(--f) 50%);box-shadow:inset 0 0 0 1.5px var(--c);color:var(--text);text-shadow:none}

  /* Planning (tableau) */
  .cng-gw{flex:1;min-height:0;height:100%}
  .cng-t{border-collapse:separate;border-spacing:0;width:100%;min-width:calc(260px + var(--n) * 32px);table-layout:fixed;font-size:var(--fs-13);user-select:none;-webkit-user-select:none}
  .cng-t th,.cng-t td{padding:0;height:44px;border-bottom:1px solid var(--line-2);text-align:center}
  .cng-t tbody tr:nth-child(even) td.nm,.cng-t tbody tr:nth-child(even) td.tot{background:var(--surface-2)}
  .cng-t thead th{position:sticky;top:0;z-index:2;background:var(--surface-1);height:50px;font-weight:600;box-shadow:inset 0 -1px 0 var(--line-2)}
  .cng-t .nm{position:sticky;left:0;z-index:1;width:220px;background:var(--surface-1);text-align:left;padding:0 14px;box-shadow:inset -1px 0 0 var(--line-2)}
  .cng-t thead .nm,.cng-t tfoot .nm{z-index:3}
  .cng-t .tot{position:sticky;right:0;z-index:1;width:62px;background:var(--surface-1);font-weight:700;box-shadow:inset 1px 0 0 var(--line-2)}
  .cng-t thead .tot,.cng-t tfoot .tot{z-index:3}
  .cng-t th.d span{display:block;font-size:11px;font-weight:700;color:var(--text-2);margin-bottom:2px}
  .cng-t th.d b{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 3px;border-radius:99px;font-size:13px}
  .cng-t th.we{background:color-mix(in srgb,var(--surface-4) 60%,var(--surface-1))}
  .cng-t th.we span,.cng-t th.we b{color:var(--text-3)}
  .cng-t th.hol span,.cng-t th.hol b{color:var(--accent)}
  .cng-t th.today b{background:var(--accent);color:#fff}
  .cng-t td.c{position:relative;border-left:1px solid var(--line)}
  .cng-t td.mon,.cng-t th.mon{border-left:2px solid var(--line-2)}
  .cng-t td.we{background:var(--we)}
  .cng-t td.hol{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--accent) 13%,transparent) 0 4px,transparent 4px 8px)}
  .cng-t td.today{background:color-mix(in srgb,var(--accent) 7%,transparent)}
  .cng-t td.ed{cursor:cell}
  .cng-t td.ed:hover::after{content:"";position:absolute;inset:4px 3px;border-radius:6px;box-shadow:inset 0 0 0 1.5px var(--line-3);background:color-mix(in srgb,var(--accent) 8%,transparent)}
  .cng-t td.drag::before{content:"";position:absolute;inset:3px 0;background:var(--sel);box-shadow:inset 0 1.5px 0 var(--accent),inset 0 -1.5px 0 var(--accent);z-index:0}
  .cng-t td.drag.d0::before{left:2px;border-radius:7px 0 0 7px;box-shadow:inset 1.5px 1.5px 0 var(--accent),inset 0 -1.5px 0 var(--accent)}
  .cng-t td.drag.d1::before{right:2px;border-radius:0 7px 7px 0;box-shadow:inset -1.5px 1.5px 0 var(--accent),inset 0 -1.5px 0 var(--accent)}
  .cng-t td.drag.d0.d1::before{border-radius:7px;box-shadow:inset 0 0 0 1.5px var(--accent)}
  .cng-t tr.me .nm b{color:var(--accent)}
  .cng-t tbody tr:hover .nm{background:var(--surface-2)}
  .cng-t tfoot td{position:sticky;bottom:0;background:var(--surface-1);height:38px;font-weight:700;box-shadow:inset 0 1px 0 var(--line-2);border:0}
  .cng-t tfoot td.c{border-left:1px solid var(--line)}
  .cng-nm{display:flex;align-items:center;gap:9px;min-width:0}
  .cng-nm b{font-size:var(--fs-14)}
  .cng-abs{color:var(--accent);font-size:var(--fs-14)} .cng-abs.hi{color:var(--danger)}
  .cng-void{height:100%;display:grid;place-content:center;justify-items:center;gap:6px;text-align:center;padding:24px;color:var(--text-2)}
  .cng-void b{color:var(--text);font-size:15px}
  .cng-void svg.i{width:34px;height:34px;stroke-width:1.4;color:var(--text-3)}

  /* Cartes (compact) */
  .cng-cards{flex:1;min-height:0;height:100%;padding:12px;display:grid;gap:10px;align-content:start}
  .cng-card{padding:4px 12px 12px;display:grid;gap:8px}
  .cng-ch{display:flex;align-items:center;gap:10px;height:48px;width:100%;text-align:left}
  .cng-ch svg.i{transition:transform var(--t-med) var(--spring-snappy);color:var(--text-3)}
  .cng-card.open .cng-ch svg.i:last-child{transform:rotate(90deg)}
  .cng-runs{display:flex;flex-wrap:wrap;gap:5px}
  .cng-runs .badge.pend{background:transparent;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 55%,transparent)}
  .cng-mini{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}
  .cng-mini > span{font-size:11px;font-weight:700;color:var(--text-2);text-align:center;padding:2px 0}
  .cng-mc{position:relative;height:42px;border-radius:8px;background:var(--surface-3);font-size:12px;font-weight:600;color:var(--text);display:flex;align-items:flex-start;justify-content:flex-start;padding:3px 5px}
  .cng-mc.we{background:var(--we);color:var(--text-3)}
  .cng-mc.hol{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--accent) 13%,transparent) 0 4px,transparent 4px 8px);color:var(--accent)}
  .cng-mc.today{box-shadow:inset 0 0 0 1.5px var(--accent);color:var(--accent)}
  .cng-mc .cng-k{inset:17px 3px 3px;font-size:10px;border-radius:5px}

  /* Agenda : douze mois, tout le monde mêlé */
  .cng-scroll{flex:1;min-height:0}
  .cng-agrid{padding:0 22px 22px;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:20px;align-content:start}
  .cng-am{padding:18px 18px 16px;background:var(--surface-2);border:1px solid var(--line-2)}
  .cng-am.cur{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 55%,transparent)}
  .cng-amh{display:flex;align-items:baseline;gap:8px;margin-bottom:10px}
  .cng-amh b{font-family:var(--font-display);font-size:14px;letter-spacing:.08em;text-transform:uppercase}
  .cng-am.cur .cng-amh b{color:var(--accent)}
  .cng-amg{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}
  .cng-amg > span{font-size:11px;font-weight:700;color:var(--text-2);text-align:center}
  .cng-ad{min-height:66px;border-radius:8px;padding:3px 3px 4px;display:flex;flex-direction:column;align-items:stretch;gap:2px;text-align:left;box-shadow:inset 0 0 0 1px var(--line);transition:background var(--t-fast),transform var(--t-fast) var(--ease-out),box-shadow var(--t-fast)}
  .cng-ad .top{display:flex;align-items:baseline;justify-content:space-between;gap:2px}
  .cng-ad .n{font-size:12.5px;font-weight:700;color:var(--text)}
  .cng-ad .c{font-size:11px;font-weight:800;color:var(--accent)} .cng-ad .c.hi{color:var(--danger)}
  .cng-ad .hl{font-size:9.5px;line-height:1.15;color:var(--accent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cng-ad.we{background:var(--we);box-shadow:none}
  .cng-ad.has{cursor:pointer}
  .cng-ad.has:hover{box-shadow:inset 0 0 0 1.5px var(--accent);background:var(--surface-3)}
  .cng-ad.has:active{transform:scale(.94)}
  .cng-ad.we .n{color:var(--text-3)} .cng-ad.hol .n{color:var(--accent)}
  .cng-ad.today{box-shadow:inset 0 0 0 1.5px var(--accent)}
  .cng-ad:disabled{cursor:default}
  .cng-avs{display:flex;flex-wrap:wrap;gap:2px;margin-top:auto}
  .cng-av{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:8px;font-weight:800;color:#fff;background:var(--c);box-shadow:0 0 0 1.5px var(--r)}
  .cng-av.pend{opacity:.6}
  .cng-av.more{background:transparent;color:var(--text-2);box-shadow:none;font-size:9.5px;width:auto;padding:0 2px}

  /* Tableau de bord */
  .cng-dash{padding:0 22px 24px;display:grid;gap:20px}
  .cng-legal{font-size:var(--fs-13);color:var(--text-2)}
  .cng-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
  .cng-kpi{padding:20px 22px;display:grid;gap:6px;background:var(--surface-2);border:1px solid var(--line-2)}
  .cng-kpi .kpi-v{font-size:30px}
  .cng-g2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  .cng-card2{padding:20px 22px;background:var(--surface-2);border:1px solid var(--line-2)}
  .cng-card2 h3{font-family:var(--font-display);font-size:14px;letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:baseline;gap:8px;margin-bottom:14px;flex-wrap:wrap}
  .cng-card2 h3 .faint{margin-left:auto;font-family:inherit;font-size:12px;font-weight:500;letter-spacing:0;text-transform:none}
  .cng-sold{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:4px 10px;padding:8px 0}
  .cng-sold + .cng-sold{border-top:1px solid var(--line)}
  .cng-sold .bar{grid-column:2/4;height:7px}
  .cng-sold .v{font-size:var(--fs-13);color:var(--text-2);white-space:nowrap;display:flex;align-items:center;gap:4px}
  .cng-sold .v input{width:58px;height:26px;padding:0 6px}
  .cng-mbars{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;height:200px}
  .cng-mcol{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;border-radius:8px;padding:4px 0;transition:background var(--t-fast)}
  .cng-mcol:hover{background:var(--surface-3)}
  .cng-mcol .bx{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;min-height:0}
  .cng-mcol .stk{width:70%;max-width:30px;display:flex;flex-direction:column-reverse;border-radius:6px 6px 3px 3px;overflow:hidden;min-height:2px;background:var(--surface-3);transform-origin:bottom;animation:cng-rise var(--t-slow) var(--spring-soft) both}
  .cng-mcol .stk i{display:block;background:var(--c)}
  .cng-mcol.top .stk{box-shadow:0 0 0 2px var(--warn)}
  .cng-mcol .v{font-size:12px;font-weight:700;color:var(--text);min-height:15px}
  .cng-mcol .l{font-size:12px;color:var(--text-2);font-weight:600}
  .cng-mcol.cur .l{color:var(--accent)}
  @keyframes cng-rise{from{transform:scaleY(0)}}
  .cng-hb{display:grid;gap:4px;padding:6px 0}
  .cng-hstk{display:flex;height:9px;border-radius:99px;overflow:hidden;background:var(--surface-3)}
  .cng-hstk i{display:block;background:var(--c);transform-origin:left;animation:ui-grow var(--t-slow) var(--spring-soft) both}
  .cng-busy{display:flex;align-items:center;gap:10px;padding:8px 6px;margin:0 -6px;border-radius:9px;cursor:pointer;transition:background var(--t-fast)}
  .cng-busy:hover{background:var(--surface-3)}
  .cng-busy + .cng-busy{border-top:1px solid var(--line)}

  /* Panneau (popover dans la fenêtre) */
  .cng-pop{position:absolute;z-index:45;width:min(310px,calc(100% - 16px));padding:12px;border-radius:16px;display:grid;gap:10px}
  .cng-pop-h{display:flex;align-items:center;gap:8px;min-width:0}
  .cng-types{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .cng-types button{display:flex;align-items:center;gap:8px;height:38px;padding:0 10px;border-radius:10px;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line);font-size:var(--fs-13);font-weight:600;text-align:left;transition:background var(--t-fast),box-shadow var(--t-fast),transform var(--t-fast) var(--ease-out)}
  .cng-types button:hover{background:var(--surface-4)}
  .cng-types button:active{transform:scale(.96)}
  .cng-types button i{width:28px;height:20px;border-radius:5px;background:var(--c);color:#fff;font-style:normal;font-size:10px;font-weight:800;display:grid;place-items:center;flex:none}
  .cng-types button[aria-pressed="true"]{background:color-mix(in srgb,var(--c) 18%,var(--surface-3));box-shadow:inset 0 0 0 1.5px var(--c)}
  .cng-types button:disabled{opacity:.45;pointer-events:none}
  .cng-pop .seg{width:100%}.cng-pop .seg > button{flex:1;text-align:center}
  .cng-count{padding:12px 14px;border-radius:12px;background:var(--sel);font-weight:600;display:flex;align-items:center;gap:10px;line-height:1.35}
  .cng-count b{font-size:20px;letter-spacing:-.02em;color:var(--accent)}
  .cng-list{display:grid;gap:4px;max-height:260px}

  /* Panneau latéral de saisie (modèle Dépenses) */
  .cng-side{flex:none;width:0;overflow:hidden;transition:width var(--t-med) var(--ease-out)}
  .cng-side.on{width:460px}
  .cng-side-in{width:460px;height:100%;display:flex;flex-direction:column;background:var(--surface-2);border-left:1px solid var(--line-2);box-shadow:var(--shadow-1)}
  .cng-side-h{display:flex;align-items:center;gap:12px;padding:20px 22px 6px}
  .cng-side-h .ic{width:34px;height:34px;border-radius:9px;flex:none;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)}
  .cng-side-h h3{flex:1;min-width:0;font-family:var(--font-display);font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
  .cng-side-sub{padding:0 22px 10px 68px;font-size:var(--fs-13);color:var(--text-2)}
  .cng-side-b{flex:1;min-height:0;padding:4px 22px 20px}
  .cng-side-b .form-grid{gap:14px}
  .cng-side-f{display:flex;gap:8px;justify-content:flex-end;align-items:center;padding:14px 22px;border-top:1px solid var(--line-2);font-size:var(--fs-13);color:var(--text-2)}
  .cng-prow{display:flex;align-items:center;gap:10px;min-height:52px;padding:4px 8px;border-radius:12px;transition:background var(--t-fast)}
  .cng-prow:hover{background:var(--surface-3)}
  .cng-prow .who{flex:1;min-width:0}
  .cng-prow .who b{display:block;font-size:var(--fs-14)}
  .cng-prow .who span{font-size:12px;color:var(--text-2)}
  .cng-confirm{display:grid;gap:8px;margin:2px 0 6px;padding:12px;border-radius:12px;background:color-mix(in srgb,var(--warn) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--warn) 40%,transparent);font-size:var(--fs-13)}

  @container app (max-width:1000px){.cng-kpis{grid-template-columns:1fr 1fr}.cng-legend .x{display:none}}
  @container app (max-width:760px){
    .cng-side{position:absolute;inset:0;z-index:40;width:100%;transform:translateX(104%);transition:transform var(--t-med) var(--ease-out);pointer-events:none}
    .cng-side.on{width:100%;transform:none;pointer-events:auto}
    .cng-side-in{width:100%;border-left:0}
  }
  @container app (max-width:720px){.cng-g2{grid-template-columns:1fr}.cng-dash,.cng-agrid{padding:0 10px 16px;gap:12px}.cng-kpis{gap:12px}.cng-stage{margin:0 10px 10px}.cng-h2 .cng-lgw{margin-left:0}.cng-h .ah-f{width:auto;margin-left:auto}.cng-nav b{min-width:0}}
  @container app (max-width:460px){.cng-h .ah-t{flex-basis:100%}.cng-h .ah-tabs{min-width:0}.cng-h .cng-tabs button{padding-inline:8px}.cng-acts .lbl{display:none}.cng-kpi{padding:14px}.cng-kpi .kpi-v{font-size:22px}.cng-mbars{gap:2px;height:160px}.cng-mcol .v{font-size:10px}.cng-mcol .l{font-size:10.5px}.cng-agrid{grid-template-columns:1fr}.cng-legend .t{display:none}.cng-h2 > div:has(> .cng-nav){flex-basis:100%}.cng-nav b{flex:1}.cng-side-b .form-grid{grid-template-columns:1fr}}
  `);

  /* ---------------- Dates ---------------- */
  const P = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const addM = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const isWE = (d) => d.getDay() === 0 || d.getDay() === 6;
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MSHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const LETTER = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const easter = (y) => { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31); return new Date(y, mo - 1, ((h + l - 7 * m + 114) % 31) + 1); };
  const HOLS = {};
  /* Les 11 fériés de lib/joursFeries.ts (Alsace-Moselle exclue, comme dans Gearbox) */
  const holiday = (d) => {
    const y = d.getFullYear();
    HOLS[y] ??= (() => { const E = easter(y), o = {}; [[new Date(y, 0, 1), 'Jour de l’an'], [addD(E, 1), 'Lundi de Pâques'], [new Date(y, 4, 1), 'Fête du Travail'], [new Date(y, 4, 8), 'Victoire 1945'], [addD(E, 39), 'Ascension'], [addD(E, 50), 'Lundi de Pentecôte'], [new Date(y, 6, 14), 'Fête nationale'], [new Date(y, 7, 15), 'Assomption'], [new Date(y, 10, 1), 'Toussaint'], [new Date(y, 10, 11), 'Armistice 1918'], [new Date(y, 11, 25), 'Noël']].forEach(([x, n]) => (o[GX.iso(x)] = n)); return o; })();
    return HOLS[y][GX.iso(d)];
  };
  const worked = (d) => !isWE(d) && !holiday(d);
  const daysOf = (m0) => { const n = new Date(m0.getFullYear(), m0.getMonth() + 1, 0).getDate(); return [...Array(n)].map((_, i) => new Date(m0.getFullYear(), m0.getMonth(), i + 1)); };
  const workedBetween = (a, b) => { const out = []; for (let d = a; d <= b; d = addD(d, 1)) if (worked(d)) out.push(d); return out; };
  /* « 1,5 » et non « 1.5 » (fmtJours) */
  const nf = (n) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  /* valeurJourConge : une demi-journée compte 0,5, tout le reste 1 */
  const val = (c) => (c.demi ? 0.5 : 1);
  const DEMI = { null: 'Journée', matin: 'Matin', 'apres-midi': 'Après-midi' };
  /* Période de référence 1er juin → 31 mai ; off = décalage en années par rapport à la période courante (navigation ‹ ›) */
  const pStart = (off = 0) => new Date(D.periodStart.getFullYear() + off, 5, 1);
  const periodEnd = (off = 0) => new Date(D.periodStart.getFullYear() + off + 1, 5, 1);
  const periodLabel = (off = 0) => `Juin ${D.periodStart.getFullYear() + off} – Mai ${D.periodStart.getFullYear() + off + 1}`;

  /* ---------------- Droits (constants.ts / routes/conges.ts) ---------------- */
  const READERS = ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager', 'Guest'];   // CONGES_LECTURE_ROLES
  const MANAGERS = ['Master', 'Administrator', 'Director'], VALIDATORS = ['Master', 'Director'];
  const denied = () => !READERS.includes(GX.ctx.role);
  const isManager = () => MANAGERS.includes(GX.ctx.role);
  const canValidate = () => VALIDATORS.includes(GX.ctx.role);
  const members = () => D.CONGES_MEMBERS.filter((u) => D.USERS.some((x) => x.id === u));
  /* peutEcrirePour : chacun SA ligne (s'il est dans le périmètre), les gestionnaires toutes.
     ⚠️ L'Invité est dans CONGES_LECTURE_ROLES : le vrai serveur le laisse écrire sa propre ligne. */
  const canEdit = (u) => !denied() && (isManager() || (u === 'me' && members().includes('me')));

  /* ---------------- Données ---------------- */
  const index = () => { const m = new Map(); D.CONGES.forEach((c) => m.set(c.u + '|' + c.date, c)); return m; };
  const find = (u, iso) => D.CONGES.find((c) => c.u === u && c.date === iso);
  const inPeriod = (c, off = 0) => c.date >= GX.iso(pStart(off)) && c.date < GX.iso(periodEnd(off));
  const cpTaken = (u, off = 0) => D.CONGES.filter((c) => c.u === u && c.type === 'CP' && inPeriod(c, off) && worked(P(c.date))).reduce((s, c) => s + val(c), 0);
  /* Droit à CP : une ligne n'existe que si le droit a été modifié ; sinon 25 j (CONGES_DROIT_DEFAUT) */
  /* D.CONGES_DROITS porte la période courante (lue aussi par un widget) ; les autres périodes vivent ici, en mock local */
  const OTHER_DROITS = {};
  const droit = (u, off = 0) => (off === 0 ? D.CONGES_DROITS[u] ?? 25 : OTHER_DROITS[u + '|' + off] ?? 25);
  const setDroit = (u, off, n) => { if (off === 0) D.CONGES_DROITS[u] = n; else OTHER_DROITS[u + '|' + off] = n; };
  /* Libellé court du type TOUJOURS affiché (CP, RTT, HR, SS, CR) ; la demi-journée se voit au remplissage de la case */
  const kHTML = (c, tip = true) => { const L = D.leave(c.type) || D.LEAVE_TYPES[0]; return `<i class="cng-k ${c.ok ? 'ok' : 'pend'} ${c.demi === 'matin' ? 'am' : c.demi === 'apres-midi' ? 'pm' : ''}" style="--c:${L.c}" ${tip ? `data-tip="${L.l}${c.demi ? ' — ' + DEMI[c.demi].toLowerCase() : ''}${c.ok ? ' — validé' : ' — en attente'}"` : ''}>${L.s}</i>`; };
  const avHTML = (c) => { const u = D.user(c.u), L = D.leave(c.type); return `<span class="cng-av ${c.ok ? '' : 'pend'}" style="--c:${u.color};--r:${L.c}" data-tip="${GX.esc(u.name)} — ${L.l}${c.demi ? ` (${DEMI[c.demi].toLowerCase()})` : ''}">${u.initials}</span>`; };

  GX.registerApp({
    id: 'conges', name: 'Congés', icon: 'conges', tint: ['#ffcc33', '#ff8a3d'], size: [1240, 760], minSize: [360, 360],
    mount(body, win) {
      const T0 = GX.today();
      /* pOff : période affichée par l'Agenda et le Tableau de bord (‹ › comme dans Gearbox), distincte du mois du Planning */
      const st = { tab: ['planning', 'agenda', 'dash'].includes(GX.store.get('cng.tab')) ? GX.store.get('cng.tab') : 'planning', month: new Date(T0.getFullYear(), T0.getMonth(), 1), pOff: 0, open: new Set(['me']), editDroit: null };
      let compact = false, pop = null, pnl = null;
      body.innerHTML = `<div class="app cng">
        <div class="app-head cng-h"><div class="ah-t"><h1>Congés</h1><span class="sub" data-sub></span></div>
          <div class="ah-tabs"><div class="tabs cng-tabs" data-tabs><button data-v="planning" aria-selected="${st.tab === 'planning'}">Planning</button><button data-v="agenda" aria-selected="${st.tab === 'agenda'}">Agenda</button><button data-v="dash" aria-selected="${st.tab === 'dash'}">Tableau de bord</button></div></div>
          <div class="ah-f cng-acts" data-acts></div></div>
        <div class="app-head2 cng-h2" data-h2></div>
        <div class="cng-body"><div class="cng-main" data-main></div><aside class="cng-side" data-side></aside></div></div>`;
      const $ = (s) => body.querySelector(s), main = $('[data-main]'), h2 = $('[data-h2]'), side = $('[data-side]'), app = body.querySelector('.app');

      /* ---------- En-tête ---------- */
      function header() {
        const n = members().length;
        $('[data-sub]').textContent = `${n} collaborateur${n > 1 ? 's' : ''} · ${st.tab === 'planning' ? `${cap(MONTHS[st.month.getMonth()])} ${st.month.getFullYear()}` : `période ${periodLabel(st.pOff)}`}`;
        $('[data-acts]').innerHTML = denied() ? '' : `${isManager() ? `<button class="btn" data-part data-tip="Choisir qui apparaît dans la rubrique">${GX.icon('users', 'sm')}<span class="lbl">Participants</span></button>` : ''}
          ${n && (isManager() || members().includes('me')) ? `<button class="btn primary" data-pose>${GX.icon('plus', 'sm')}<span class="lbl">Poser une période</span></button>` : ''}`;
        win.setTitle('Congés', { planning: 'Planning', agenda: 'Agenda', dash: 'Tableau de bord' }[st.tab]);
      }
      const legendHTML = () => `<div class="cng-legend">${D.LEAVE_TYPES.map((l) => `<span data-tip="${l.l}"><i style="--c:${l.c}"></i>${l.s}<span class="t x">${l.s !== l.l ? '· ' + l.l : ''}</span></span>`).join('')}
        <span class="x"><i class="we"></i>Week-end / férié</span><span class="x"><i class="pend" style="--c:var(--text-2)"></i>pâle = en attente</span><span class="x"><i class="half" style="--c:var(--text-2)"></i>½ journée</span></div>`;
      /* Panneau de filtres du modèle : navigation + légende, libellés au-dessus */
      function toolbar() {
        if (denied()) { h2.classList.add('hide'); return; }
        h2.classList.remove('hide');
        const nav = st.tab === 'planning'
          ? `<div><span class="label">Mois</span><div class="cng-nav"><button class="icon-btn" data-mnav="-1" data-tip="Mois précédent (←)">${GX.icon('back')}</button><b data-mt>${cap(MONTHS[st.month.getMonth()])} ${st.month.getFullYear()}</b><button class="icon-btn" data-mnav="1" data-tip="Mois suivant (→)">${GX.icon('chevron')}</button></div></div>`
          : `<div><span class="label">Période de référence</span><div class="cng-nav"><button class="icon-btn" data-pnav="-1" data-tip="Période précédente">${GX.icon('back')}</button><b data-pt>${periodLabel(st.pOff)}</b><button class="icon-btn" data-pnav="1" data-tip="Période suivante">${GX.icon('chevron')}</button>${st.tab === 'agenda' ? '<button class="btn sm" data-ptoday>Aujourd’hui</button>' : ''}</div></div>`;
        h2.innerHTML = `${nav}<span class="cng-sep"></span><div class="cng-lgw"><span class="label">Légende · plein = validé</span>${legendHTML()}</div>`;
      }

      /* ---------- Planning ---------- */
      function voidHTML() {
        return `<div class="cng-void">${GX.icon('users')}<b>Personne dans la rubrique pour l'instant.</b><span>${isManager() ? 'Utilisez « Participants » pour choisir qui apparaît dans le planning.' : 'Un administrateur doit vous ajouter au planning.'}</span></div>`;
      }
      function gridHTML() {
        const days = daysOf(st.month), T = GX.today(), idx = index(), M = members();
        if (!M.length) return voidHTML();
        const cls = (d) => `${isWE(d) ? 'we' : ''} ${holiday(d) ? 'hol' : ''} ${same(d, T) ? 'today' : ''} ${d.getDay() === 1 ? 'mon' : ''}`;
        if (compact) return cardsHTML(days, idx, M);
        const absent = days.map((d) => { const iso = GX.iso(d); return worked(d) ? M.filter((u) => idx.has(u + '|' + iso)).length : 0; });
        const rows = [...M].sort((a, b) => D.user(a).name.localeCompare(D.user(b).name)).map((u) => {
          const us = D.user(u), ed = canEdit(u); let tot = 0;
          const cells = days.map((d) => { const iso = GX.iso(d), c = idx.get(u + '|' + iso), w = worked(d); if (c && w) tot += val(c); return `<td class="c ${cls(d)} ${ed && w ? 'ed' : ''}" data-d="${iso}">${c && w ? kHTML(c) : ''}</td>`; }).join('');
          return `<tr data-u="${u}" class="${u === 'me' ? 'me' : ''}"><td class="nm"><div class="cng-nm">${GX.r.av(u, 'sm')}<b class="ellipsis">${GX.esc(us.name)}${u === 'me' ? ' (vous)' : ''}</b></div></td>${cells}<td class="tot num">${tot ? nf(tot) : '<span class="faint">—</span>'}</td></tr>`;
        }).join('');
        return `<div class="cng-gw scroll"><table class="cng-t" style="--n:${days.length}">
          <thead><tr><th class="nm"><span class="label">Collaborateur</span></th>${days.map((d) => { const h = holiday(d); return `<th class="d ${cls(d)}" ${h ? `data-tip="${h}"` : ''}><span>${LETTER[d.getDay()]}</span><b class="num">${d.getDate()}</b></th>`; }).join('')}<th class="tot"><span class="label">Total</span></th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td class="nm"><span class="label">Absents / jour</span></td>${absent.map((n, i) => `<td class="c ${cls(days[i])}">${n ? `<span class="cng-abs num ${n >= 4 ? 'hi' : ''}">${n}</span>` : ''}</td>`).join('')}<td class="tot"></td></tr></tfoot>
        </table></div>`;
      }
      function runsOf(u, days, idx) {
        const out = []; let cur = null;
        for (const d of days) {
          if (!worked(d)) continue;
          const c = idx.get(u + '|' + GX.iso(d));
          if (c && cur && cur.type === c.type && cur.ok === c.ok && !c.demi && !cur.demi) { cur.b = d; cur.n += 1; continue; }
          if (cur) out.push(cur); cur = c ? { type: c.type, ok: c.ok, demi: c.demi, a: d, b: d, n: val(c) } : null;
        }
        if (cur) out.push(cur);
        return out;
      }
      function cardsHTML(days, idx, M) {
        const T = GX.today(), lead = (days[0].getDay() + 6) % 7;
        return `<div class="cng-cards scroll">${[...M].sort((a, b) => D.user(a).name.localeCompare(D.user(b).name)).map((u, i) => {
          const us = D.user(u), open = st.open.has(u), runs = runsOf(u, days, idx), tot = runs.reduce((s, r) => s + r.n, 0);
          return `<div class="card cng-card enter ${open ? 'open' : ''}" style="--i:${i}" data-u="${u}">
            <button class="cng-ch" data-card="${u}">${GX.r.av(u)}<div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${GX.esc(us.name)}${u === 'me' ? ' (vous)' : ''}</b></div><b class="num" style="color:var(--accent)">${nf(tot)} j</b>${GX.icon('chevron')}</button>
            ${runs.length ? `<div class="cng-runs">${runs.map((r) => { const L = D.leave(r.type); return `<span class="badge ${r.ok ? '' : 'pend'}" style="--c:${L.c}">${r.a.getDate()}${r.b > r.a ? '–' + r.b.getDate() : ''} ${MSHORT[r.a.getMonth()]} · ${L.s}${r.demi ? ' ' + DEMI[r.demi].toLowerCase() : ''}${r.ok ? '' : ' · en attente'}</span>`; }).join('')}</div>` : '<div class="faint" style="font-size:12.5px;font-style:italic">Aucun congé ce mois-ci.</div>'}
            ${open ? `<div class="cng-mini">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x) => `<span>${x}</span>`).join('')}${'<i></i>'.repeat(lead)}${days.map((d) => { const iso = GX.iso(d), c = idx.get(u + '|' + iso); return `<button class="cng-mc ${isWE(d) ? 'we' : ''} ${holiday(d) ? 'hol' : ''} ${same(d, T) ? 'today' : ''}" data-cell="${u}" data-d="${iso}">${d.getDate()}${c && worked(d) ? kHTML(c, false) : ''}</button>`; }).join('')}</div>` : ''}
          </div>`;
        }).join('')}</div>`;
      }
      const planningHTML = () => `<div class="cng-stage" data-stage><div class="cng-pane">${gridHTML()}</div></div>`;

      /* ---------- Agenda : douze mois d'affilée, tout le monde mêlé ---------- */
      function agendaHTML() {
        const idx = index(), M = members(), T = GX.today();
        const cards = [...Array(12)].map((_, i) => {
          const m0 = addM(pStart(st.pOff), i), days = daysOf(m0), lead = (days[0].getDay() + 6) % 7; let sum = 0;
          const cells = days.map((d) => {
            const iso = GX.iso(d), hol = holiday(d), abs = worked(d) ? M.map((u) => idx.get(u + '|' + iso)).filter(Boolean) : [];
            abs.forEach((c) => (sum += val(c)));
            return `<button class="cng-ad ${abs.length ? 'has' : ''} ${isWE(d) ? 'we' : ''} ${hol ? 'hol' : ''} ${same(d, T) ? 'today' : ''}" data-day="${iso}" ${hol ? `data-tip="${hol}"` : ''} ${abs.length ? '' : 'disabled'}>
              <span class="top"><span class="n num">${d.getDate()}</span>${abs.length ? `<span class="c num ${abs.length >= 4 ? 'hi' : ''}">${abs.length}</span>` : ''}</span>${hol ? `<span class="hl">${hol}</span>` : ''}
              ${abs.length ? `<span class="cng-avs">${abs.slice(0, 4).map((c) => avHTML(c)).join('')}${abs.length > 4 ? `<span class="cng-av more">+${abs.length - 4}</span>` : ''}</span>` : ''}</button>`;
          }).join('');
          const cur = m0.getMonth() === T.getMonth() && m0.getFullYear() === T.getFullYear();
          return `<div class="card cng-am enter ${cur ? 'cur' : ''}" style="--i:${i}" data-m="${GX.iso(m0)}"><div class="cng-amh"><b>${cap(MONTHS[m0.getMonth()])} ${m0.getFullYear()}</b><span class="faint" style="font-size:12.5px">${sum ? `${nf(sum)} jour${sum > 1 ? 's' : ''} posé${sum > 1 ? 's' : ''}` : 'personne d’absent'}</span><span class="grow"></span><button class="icon-btn sm" data-goto="${GX.iso(m0)}" data-tip="Ouvrir le planning du mois">${GX.icon('chevron', 'sm')}</button></div>
            <div class="cng-amg">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x) => `<span>${x}</span>`).join('')}${'<i></i>'.repeat(lead)}${cells}</div></div>`;
        }).join('');
        return `<div class="scroll cng-scroll" data-ascroll>${M.length ? `<div class="cng-agrid">${cards}</div>` : voidHTML()}</div>`;
      }

      /* ---------- Tableau de bord (période de référence, jamais l'année civile) ---------- */
      function stats() {
        const M = new Set(members()), ps = pStart(st.pOff), a = GX.iso(ps), b = GX.iso(periodEnd(st.pOff));
        const E = D.CONGES.filter((c) => M.has(c.u) && c.date >= a && c.date < b && worked(P(c.date)));
        const byMonth = [...Array(12)].map(() => Object.fromEntries(D.LEAVE_TYPES.map((l) => [l.id, 0])));
        const byUser = {}, byDay = new Map(); let total = 0;
        E.forEach((c) => {
          const d = P(c.date), mi = (d.getFullYear() - ps.getFullYear()) * 12 + d.getMonth() - ps.getMonth(), v = val(c);
          total += v;
          if (byMonth[mi]) byMonth[mi][c.type] = (byMonth[mi][c.type] || 0) + v;
          (byUser[c.u] ??= {})[c.type] = (byUser[c.u][c.type] || 0) + v;
          if (!byDay.has(c.date)) byDay.set(c.date, []); byDay.get(c.date).push(c);
        });
        const mTot = byMonth.map((o) => Object.values(o).reduce((s, v) => s + v, 0));
        const busiest = mTot.indexOf(Math.max(...mTot));
        const days = [...byDay.entries()].sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]));
        return { M: [...M], total, byMonth, mTot, busiest, byUser, peak: days[0], heavy: days.filter(([, l]) => l.length >= 3).slice(0, 8) };
      }
      function dashHTML() {
        const s = stats(), n = s.M.length, mgr = isManager(), y0 = pStart(st.pOff).getFullYear();
        if (!n) return `<div class="scroll cng-scroll">${voidHTML()}</div>`;
        const k = (i, ic, t, v, sub, col) => `<div class="card cng-kpi enter" style="--i:${i}"><span class="label">${GX.icon(ic, 'sm')} ${t}</span><span class="kpi-v num" style="color:${col}">${v}</span><span class="faint" style="font-size:12.5px">${sub}</span></div>`;
        const bm = addM(pStart(st.pOff), s.busiest), maxM = Math.max(1, ...s.mTot), T = GX.today();
        const uTot = (u) => Object.values(s.byUser[u] || {}).reduce((a, b) => a + b, 0), maxU = Math.max(1, ...s.M.map(uTot));
        const sold = s.M.map((u) => ({ u, taken: cpTaken(u, st.pOff), dr: droit(u, st.pOff) })).sort((a, b) => (a.dr - a.taken) - (b.dr - b.taken));
        return `<div class="scroll cng-scroll"><div class="cng-dash">
          <div class="cng-legal">Période de référence légale : du 1<sup>er</sup> juin ${y0} au 31 mai ${y0 + 1}.</div>
          <div class="cng-kpis">
            ${k(0, 'agenda', 'Jours posés', nf(s.total), `sur ${n} collaborateur${n > 1 ? 's' : ''}`, '#3b82f6')}
            ${k(1, 'users', 'Moyenne / personne', nf(Math.round((s.total / n) * 10) / 10), 'jours sur la période', '#10b981')}
            ${k(2, 'barchart', 'Mois le plus chargé', s.mTot[s.busiest] ? cap(MONTHS[bm.getMonth()]) : '—', s.mTot[s.busiest] ? `${nf(s.mTot[s.busiest])} jours posés` : 'aucun congé', '#f59e0b')}
            ${k(3, 'alert', 'Pic d’absences', s.peak ? s.peak[1].length : '—', s.peak ? `le ${P(s.peak[0]).toLocaleDateString('fr-FR')}` : 'aucun congé', '#f43f5e')}
          </div>
          <div class="cng-g2">
            <div class="card cng-card2"><h3>Solde de congés payés<span class="faint">25 jours ouvrés par défaut${mgr ? ' · modifiable au crayon' : ''} · seuls les CP décomptent</span></h3>
              ${sold.map(({ u, taken, dr }) => { const rest = Math.round((dr - taken) * 10) / 10, col = rest < 0 ? 'var(--danger)' : rest <= 3 ? 'var(--warn)' : 'var(--info)'; return `<div class="cng-sold">${GX.r.av(u, 'sm')}<b class="ellipsis">${GX.esc(D.user(u).name)}</b>
                <span class="v num"><b style="color:var(--text)">${nf(taken)}</b> / ${st.editDroit === u ? `<input class="input num" inputmode="decimal" value="${nf(dr)}" data-droit-in="${u}" />` : `${nf(dr)}`} · <b style="color:${rest < 0 ? 'var(--danger)' : 'inherit'}">${nf(rest)} rest.</b>${mgr && st.editDroit !== u ? `<button class="icon-btn sm" data-droit="${u}" data-tip="Modifier le droit à congés payés de cette période">${GX.icon('edit', 'sm')}</button>` : ''}</span>
                <div class="bar"><i style="width:${Math.min(100, dr > 0 ? (taken / dr) * 100 : 0)}%;--c:${col}"></i></div></div>`; }).join('')}
            </div>
            <div class="card cng-card2"><h3>Répartition mensuelle<span class="faint">clic → planning du mois</span></h3>
              <div class="cng-mbars">${s.byMonth.map((o, i) => { const m = addM(pStart(st.pOff), i), t = s.mTot[i], cur = m.getMonth() === T.getMonth() && m.getFullYear() === T.getFullYear(); return `<button class="cng-mcol ${cur ? 'cur' : ''} ${i === s.busiest && t ? 'top' : ''}" data-goto="${GX.iso(m)}" data-tip="${cap(MONTHS[m.getMonth()])} ${m.getFullYear()} : ${nf(t)} jours${t ? ' — ' + D.LEAVE_TYPES.filter((l) => o[l.id]).map((l) => `${l.s} ${nf(o[l.id])}`).join(', ') : ''}"><span class="v num">${t ? nf(t) : ''}</span><span class="bx"><span class="stk" style="height:${Math.max(1.5, (t / maxM) * 100)}%;animation-delay:${i * 30}ms">${D.LEAVE_TYPES.map((l) => (o[l.id] ? `<i style="flex:${o[l.id]};--c:${l.c}"></i>` : '')).join('')}</span></span><span class="l">${cap(MSHORT[m.getMonth()]).replace('.', '')}</span></button>`; }).join('')}</div>
              <div class="row wrap" style="gap:10px;margin-top:12px;font-size:var(--fs-13)">${D.LEAVE_TYPES.map((l) => `<span class="row" style="gap:5px"><i class="brand-dot" style="--c:${l.c}"></i>${l.l}</span>`).join('')}</div>
            </div>
          </div>
          <div class="cng-g2">
            <div class="card cng-card2"><h3>Jours posés par collaborateur<span class="faint">tous types</span></h3>
              ${[...s.M].sort((a, b) => uTot(b) - uTot(a)).map((u, i) => { const o = s.byUser[u] || {}; return `<div class="cng-hb"><div class="row" style="font-size:13px">${GX.r.av(u, 'sm')}<span class="grow ellipsis" style="font-weight:600">${GX.esc(D.user(u).name)}</span><b class="num">${nf(uTot(u))}</b></div>
                <div class="cng-hstk" style="width:${Math.max(2, (uTot(u) / maxU) * 100)}%">${D.LEAVE_TYPES.map((l) => (o[l.id] ? `<i style="flex:${o[l.id]};--c:${l.c};animation-delay:${i * 40}ms" data-tip="${l.l} : ${nf(o[l.id])} j"></i>` : '')).join('')}</div></div>`; }).join('')}
            </div>
            <div class="card cng-card2"><h3>Journées les plus chargées<span class="faint">3 absents ou plus</span></h3>
              ${s.heavy.length ? s.heavy.map(([iso, l]) => `<div class="cng-busy" data-goto="${iso.slice(0, 8)}01" data-tip="Voir le planning du mois"><div style="width:44px;text-align:center;flex:none"><span class="label" style="font-size:9px">${MSHORT[P(iso).getMonth()]}</span><b class="num" style="display:block;font-size:17px;line-height:1.1">${P(iso).getDate()}</b></div>
                <div class="grow" style="min-width:0"><div style="font-weight:600">${cap(P(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div><div class="faint ellipsis" style="font-size:12.5px">${l.map((c) => GX.esc(D.user(c.u).name)).join(', ')}</div></div>
                <span class="badge" style="--c:${l.length >= 4 ? 'var(--danger)' : 'var(--accent)'}">${l.length}</span></div>`).join('') : `<div class="empty">${GX.icon('check')}Aucune journée à 3 absents ou plus.</div>`}
            </div>
          </div>
        </div></div>`;
      }

      /* ---------- Rendu + transitions ---------- */
      function tabHTML() { return st.tab === 'planning' ? planningHTML() : st.tab === 'agenda' ? agendaHTML() : dashHTML(); }
      function swapIn(host, html, dir, cls) {
        const old = host.querySelector(`:scope > .${cls}:not(.out)`);
        const pane = document.createElement('div'); pane.className = cls; pane.innerHTML = html; host.append(pane);
        if (!old) return pane;
        old.classList.add('out');
        GX.animate(old, [{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 26}%)`, opacity: 0 }], { spring: 'snappy', fill: 'forwards' }).onfinish = () => old.remove();
        GX.animate(pane, [{ transform: `translateX(${dir * 34}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'snappy' });
        setTimeout(() => old.isConnected && old.remove(), 1200);
        return pane;
      }
      const scrollToCurrent = (pane, smooth) => requestAnimationFrame(() => { const c = pane?.querySelector('.cng-am.cur'), sc = pane?.querySelector('[data-ascroll]'); if (c && sc) sc.scrollTo({ top: c.offsetTop - 4, behavior: smooth ? 'smooth' : 'auto' }); });
      function render(dir = 0) {
        closePop(); header(); toolbar();
        if (denied()) { closePanel(); main.innerHTML = `<div class="cng-void">${GX.icon('lock')}<b>Accès restreint</b><span>Les congés ne sont accessibles ni aux externes ni aux chefs de site.</span></div>`; return; }
        const pane = dir ? swapIn(main, tabHTML(), dir, 'cng-pane') : (() => { main.innerHTML = `<div class="cng-pane">${tabHTML()}</div>`; return main.firstElementChild; })();
        if (st.tab === 'agenda') scrollToCurrent(pane);
      }
      /* Re-rendu sur place du contenu (après une modification), en gardant le défilement */
      function refresh() {
        header();
        const pane = main.querySelector('.cng-pane:not(.out)'); if (!pane) return render();
        if (st.tab === 'planning') {
          const g = pane.querySelector('[data-stage] .cng-pane:not(.out)'); if (!g) return render();
          const sc = g.firstElementChild, top = sc?.scrollTop || 0, left = sc?.scrollLeft || 0;
          g.innerHTML = gridHTML(); const n = g.firstElementChild; if (n) { n.scrollTop = top; n.scrollLeft = left; }
        } else {
          const sc = pane.querySelector('.scroll'), top = sc?.scrollTop || 0;
          pane.innerHTML = tabHTML(); const n = pane.querySelector('.scroll'); if (n) n.scrollTop = top;
        }
      }
      function goMonth(m0, dir) {
        if (st.tab !== 'planning') { st.month = m0; return switchTab('planning'); }
        dir ??= m0 > st.month ? 1 : m0 < st.month ? -1 : 0; st.month = m0;
        if (!dir) return;
        closePop(); header();
        const t = h2.querySelector('[data-mt]');
        if (t) { t.textContent = `${cap(MONTHS[m0.getMonth()])} ${m0.getFullYear()}`; GX.animate(t, [{ opacity: 0, transform: `translateX(${dir * 10}px)` }, { opacity: 1, transform: 'none' }], { spring: 'soft' }); }
        const stage = main.querySelector('.cng-pane:not(.out) [data-stage]'); if (!stage) return render();
        swapIn(stage, gridHTML(), dir, 'cng-pane');
      }
      function goPeriod(dir) {
        st.pOff += dir; header();
        const t = h2.querySelector('[data-pt]'); if (t) { t.textContent = periodLabel(st.pOff); GX.animate(t, [{ opacity: 0, transform: `translateX(${dir * 10}px)` }, { opacity: 1, transform: 'none' }], { spring: 'soft' }); }
        swapIn(main, tabHTML(), dir, 'cng-pane');
      }
      function switchTab(t) {
        const order = ['planning', 'agenda', 'dash'], dir = order.indexOf(t) >= order.indexOf(st.tab) ? 1 : -1;
        st.tab = t; GX.store.set('cng.tab', t);
        const tabs = $('[data-tabs]'), b = tabs.querySelector(`[data-v="${t}"]`);
        if (b.getAttribute('aria-selected') !== 'true') { tabs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', x === b)); GX.ui.refresh(tabs.parentElement); }
        render(dir);
      }
      function changed(msg) { refresh(); if (msg) GX.shell?.hud?.(msg); GX.emit('badges'); }

      /* ---------- Panneau d'une cellule (popover) ---------- */
      function closePop() { if (!pop) return; const p = pop; pop = null; p.cleanup(); GX.animate(p.el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 120, fill: 'forwards' }).onfinish = () => p.el.remove(); }
      function openPop(anchor, html, wire) {
        closePop();
        const el = document.createElement('div'); el.className = 'cng-pop glass glass-strong'; el.innerHTML = html; app.append(el);
        const r = anchor.getBoundingClientRect(), a = app.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
        let top = r.bottom - a.top + 6, below = true; if (top + h > a.height - 8) { top = Math.max(8, r.top - a.top - h - 6); below = false; }
        el.style.top = top + 'px'; el.style.left = Math.max(8, Math.min(r.left - a.left + r.width / 2 - w / 2, a.width - w - 8)) + 'px';
        el.style.transformOrigin = `${Math.max(10, Math.min(w - 10, r.left - a.left + r.width / 2 - parseFloat(el.style.left)))}px ${below ? 0 : '100%'}`;
        GX.animate(el, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy' });
        const away = (e) => { if (!el.contains(e.target) && !e.target.closest('.menu,.tip-bubble')) closePop(); };
        const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); } };
        setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', key, true); });
        pop = { el, cleanup: () => { removeEventListener('pointerdown', away, true); removeEventListener('keydown', key, true); } };
        wire && wire(el);
        return el;
      }
      /* L'ordre des types = CONGES_TYPES (ordre du sélecteur) */
      const typesHTML = (sel, dis) => `<div class="cng-types">${D.LEAVE_TYPES.map((l) => `<button data-type="${l.id}" aria-pressed="${sel === l.id}" style="--c:${l.c}" ${dis ? 'disabled' : ''}><i>${l.s}</i><span class="ellipsis">${l.l}</span></button>`).join('')}</div>`;
      const pulse = (u, iso) => { const k = main.querySelector(`tr[data-u="${u}"] td[data-d="${iso}"] .cng-k, [data-cell="${u}"][data-d="${iso}"] .cng-k`); if (k) GX.animate(k, [{ transform: 'scale(.5)', opacity: .3 }, { transform: 'none', opacity: 1 }], { spring: 'bouncy' }); };

      function cellPop(u, iso, anchor) {
        const d = P(iso), ed = canEdit(u);
        if (!worked(d)) return GX.shell?.hud?.(holiday(d) ? `${holiday(d)} — jour férié` : 'Week-end : rien à poser');
        const html = () => {
          const c = find(u, iso), L = c && D.leave(c.type);
          return `<div class="cng-pop-h">${GX.r.av(u, 'sm')}<div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${GX.esc(D.user(u).name)}</b><span class="faint" style="font-size:12px">${cap(GX.fmt.dateLong(d))}</span></div>
              ${c ? `<span class="badge" style="--c:${c.ok ? 'var(--ok)' : 'var(--warn)'}">${c.ok ? 'Validé' : 'En attente'}</span>` : ''}</div>
            ${ed ? `${typesHTML(c?.type)}
              ${c ? `<div class="seg" data-demi>${[null, 'matin', 'apres-midi'].map((x) => `<button data-v="${x || ''}" aria-pressed="${(c.demi || null) === x}">${DEMI[x]}</button>`).join('')}</div>
                <div class="row" style="gap:6px;flex-wrap:wrap">${canValidate() ? `<button class="btn sm ${c.ok ? '' : 'primary'} grow" data-valid>${GX.icon('check', 'sm')}${c.ok ? 'Retirer la validation' : 'Valider ✓'}</button>` : ''}<button class="btn sm danger grow" data-del>${GX.icon('trash', 'sm')}Retirer ce congé</button></div>` : ''}`
            : c ? `<div class="row" style="gap:8px"><span class="badge solid" style="--c:${L.c}">${L.s}</span><b>${L.l}</b><span class="faint">${DEMI[c.demi]}</span></div><div class="faint" style="font-size:12px">Lecture : vous ne pouvez modifier que votre propre ligne.</div>`
            : '<div class="faint">Aucun congé ce jour.</div>'}`;
        };
        const wire = (el) => {
          el.addEventListener('click', (e) => {
            /* Changer de famille CONSERVE la demi-journée et la validation déjà posées (upsert de routes/conges.ts) */
            const t = e.target.closest('[data-type]');
            if (t) { const c = find(u, iso); if (c) c.type = t.dataset.type; else D.CONGES.push({ u, date: iso, type: t.dataset.type, demi: null, ok: false }); after(); }
            if (e.target.closest('[data-valid]')) { const c = find(u, iso); if (c) { c.ok = !c.ok; after(c.ok ? 'Congé validé' : 'Validation retirée'); } }
            if (e.target.closest('[data-del]')) { const c = find(u, iso); if (c) D.CONGES.splice(D.CONGES.indexOf(c), 1); refresh(); closePop(); GX.shell?.hud?.('Congé retiré'); }
          });
          el.addEventListener('change', (e) => { if (!e.target.closest?.('[data-demi]')) return; const c = find(u, iso); if (c) { c.demi = e.detail || null; setTimeout(after, 140); } });
        };
        const after = (msg) => { refresh(); pulse(u, iso); if (pop) { pop.el.innerHTML = html(); } if (msg) GX.shell?.hud?.(msg); };
        openPop(anchor, html(), wire);
      }
      function rangePop(u, a, b, anchor) {
        const days = workedBetween(P(a), P(b));
        if (!days.length) return GX.shell?.hud?.('Aucun jour ouvré sur cette sélection');
        openPop(anchor, `<div class="cng-pop-h">${GX.r.av(u, 'sm')}<div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${GX.esc(D.user(u).name)}</b><span class="faint" style="font-size:12px">${P(a).getDate()} ${MSHORT[P(a).getMonth()]} → ${P(b).getDate()} ${MSHORT[P(b).getMonth()]}</span></div><span class="badge" style="--c:var(--accent)">${days.length} j ouvré${days.length > 1 ? 's' : ''}</span></div>
          ${typesHTML(null)}<div class="faint" style="font-size:12px">Week-ends et jours fériés sont automatiquement ignorés.</div>`, (el) => {
          el.addEventListener('click', (e) => { const t = e.target.closest('[data-type]'); if (!t) return; pose(u, days, t.dataset.type); closePop(); });
        });
      }
      /* setCongePeriode : jours ouvrés seulement, demi-journée à vide ; un jour déjà posé change de type mais garde sa validation */
      function pose(u, days, type) {
        days.forEach((d) => { const iso = GX.iso(d), c = find(u, iso); if (c) Object.assign(c, { type, demi: null }); else D.CONGES.push({ u, date: iso, type, demi: null, ok: false }); });
        refresh(); days.forEach((d) => pulse(u, GX.iso(d)));
        const L = D.leave(type), n = days.length;
        GX.shell?.hud?.(`${n} jour${n > 1 ? 's' : ''} posé${n > 1 ? 's' : ''} · ${L.s}`);
        GX.emit('badges');
      }
      function dayPop(iso, anchor) {
        const d = P(iso), M = members(), list = M.map((u) => find(u, iso)).filter(Boolean);
        openPop(anchor, `<div class="cng-pop-h"><div class="grow"><b>${cap(GX.fmt.dateLong(d))}</b><div class="faint" style="font-size:12px">${holiday(d) ? holiday(d) + ' · ' : ''}${list.length} absent${list.length > 1 ? 's' : ''} sur ${M.length}</div></div></div>
          <div class="cng-list scroll">${list.map((c) => { const L = D.leave(c.type); return `<div class="list-row" style="padding:4px 6px;min-height:36px">${GX.r.av(c.u, 'sm')}<span class="grow ellipsis" style="font-weight:600">${GX.esc(D.user(c.u).name)}</span><span class="badge ${c.ok ? 'solid' : ''}" style="--c:${L.c}">${L.s}${c.demi ? ' ' + DEMI[c.demi].toLowerCase() : ''}</span></div>`; }).join('')}</div>
          <button class="btn sm" data-open-month>${GX.icon('agenda', 'sm')}Voir dans le planning</button>`, (el) => el.querySelector('[data-open-month]').onclick = () => { closePop(); st.month = new Date(d.getFullYear(), d.getMonth(), 1); switchTab('planning'); });
      }

      /* ---------- Panneau latéral ---------- */
      function closePanel() {
        if (!pnl) return; const p = pnl; pnl = null;
        side.classList.remove('on'); p.cleanup(); p.onClose?.();
        setTimeout(() => { if (!pnl) side.innerHTML = ''; }, 380);
      }
      function panel({ icon, title, sub, body: html, foot, onClose }) {
        closePanel();
        side.innerHTML = `<div class="cng-side-in"><div class="cng-side-h"><span class="ic">${GX.icon(icon)}</span><h3 class="ellipsis">${title}</h3><button class="icon-btn" data-pclose data-tip="Fermer (Échap)">${GX.icon('close')}</button></div>
          ${sub ? `<div class="cng-side-sub">${sub}</div>` : ''}<div class="cng-side-b scroll">${html}</div><div class="cng-side-f">${foot}</div></div>`;
        const el = side.firstElementChild;
        requestAnimationFrame(() => side.classList.add('on'));
        const key = (e) => { if (e.key === 'Escape' && !e.target.closest('.menu')) { e.stopPropagation(); closePanel(); } };
        const clk = (e) => { if (e.target.closest('[data-pclose]')) closePanel(); };
        el.addEventListener('keydown', key); el.addEventListener('click', clk);
        pnl = { el, onClose, cleanup: () => { el.removeEventListener('keydown', key); el.removeEventListener('click', clk); } };
        return pnl;
      }

      /* « Poser une période » : champs exacts de ModalePeriode — Collaborateur (si plusieurs cibles), Du, Au, Type */
      function openPose(pre = {}) {
        const who = members().filter((u) => canEdit(u)).sort((a, b) => D.user(a).name.localeCompare(D.user(b).name));
        if (!who.length) return GX.shell?.hud?.('Vous ne faites pas partie du planning');
        let type = 'CP';
        const u0 = pre.u && who.includes(pre.u) ? pre.u : who.includes('me') ? 'me' : who[0];
        const p = panel({ icon: 'plus', title: 'Poser une période',
          body: `<div class="form-grid">
            ${who.length > 1 ? `<label class="field full"><span class="label">Collaborateur</span><select class="select" data-f="u">${who.map((u) => `<option value="${u}" ${u === u0 ? 'selected' : ''}>${GX.esc(D.user(u).name)}${u === 'me' ? ' (vous)' : ''}</option>`).join('')}</select></label>` : ''}
            <label class="field"><span class="label">Du</span><input type="date" class="input" data-f="from" value="${pre.from || ''}" /></label>
            <label class="field"><span class="label">Au</span><input type="date" class="input" data-f="to" value="${pre.to || pre.from || ''}" /></label>
            <div class="field full"><span class="label">Type</span>${typesHTML(type)}</div>
            <div class="full cng-count" data-count></div>
          </div>`,
          foot: '<button class="btn" data-pclose>Annuler</button><button class="btn primary" data-okbtn>Poser</button>' });
        const el = p.el, f = (k) => el.querySelector(`[data-f="${k}"]`);
        const calc = () => { const a = f('from').value, b = f('to').value; return { u: f('u')?.value || u0, days: a && b && a <= b ? workedBetween(P(a), P(b)) : [] }; };
        function update() {
          const c = calc(), n = c.days.length;
          el.querySelector('[data-count]').innerHTML = n ? `${GX.icon('agenda')}<span><b class="num">${n}</b> jour${n > 1 ? 's' : ''} ouvré${n > 1 ? 's' : ''} seront posés. Week-ends et jours fériés sont automatiquement ignorés.</span>` : `${GX.icon('info')}<span>Choisissez une date de début et une date de fin.</span>`;
          f('to').min = f('from').value || '';
          el.querySelector('[data-okbtn]').disabled = !n;
        }
        /* Choisir le début aligne la fin dessus tant qu'elle est vide ou antérieure (constaté en recette dans Gearbox) */
        el.addEventListener('change', (e) => { if (e.target.matches('[data-f="from"]') && (!f('to').value || f('to').value < f('from').value)) f('to').value = f('from').value; update(); });
        el.addEventListener('input', update);
        el.addEventListener('click', (e) => { const t = e.target.closest('[data-type]'); if (t) { type = t.dataset.type; el.querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', x === t)); } });
        el.querySelector('[data-okbtn]').addEventListener('click', () => { const c = calc(); if (!c.days.length) return; closePanel(); pose(c.u, c.days, type); });
        update();
      }
      /* « Participants » : seuls les rôles de CONGES_LECTURE_ROLES ; retirer quelqu'un conserve ses congés */
      function openParticipants() {
        if (!isManager()) return;
        const eligible = D.USERS.filter((u) => READERS.includes(u.role)).sort((a, b) => a.name.localeCompare(b.name));
        let q = '', ask = null;
        const listHTML = () => {
          const rows = eligible.filter((u) => !q || u.name.toLowerCase().includes(q));
          return rows.map((u) => { const inn = D.CONGES_MEMBERS.includes(u.id); return `<div class="cng-prow">${GX.r.av(u.id)}<div class="who"><b class="ellipsis">${GX.esc(u.name)}</b><span>${D.ROLES[u.role].l}</span></div><input type="checkbox" class="check" data-mem="${u.id}" ${inn ? 'checked' : ''} aria-label="Dans le planning" /></div>
            ${ask === u.id ? `<div class="cng-confirm"><b>Retirer ${GX.esc(u.name)} du planning ?</b><span>Ses congés déjà posés sont CONSERVÉS : il suffit de le rajouter pour les revoir.</span><div class="row" style="gap:6px;justify-content:flex-end"><button class="btn sm" data-ano>Annuler</button><button class="btn sm primary" data-ayes="${u.id}">Retirer</button></div></div>` : ''}`; }).join('') || '<div class="empty">Aucun compte éligible.</div>';
        };
        const p = panel({ icon: 'users', title: 'Participants', sub: 'Qui apparaît dans le planning des congés.',
          body: `<label class="search" style="margin-bottom:10px">${GX.icon('search', 'sm')}<input placeholder="Rechercher…" data-psearch /></label><div data-plist>${listHTML()}</div>`,
          foot: '<span class="grow">Retirer quelqu’un ne supprime pas ses congés : il disparaît du planning, ses jours restent enregistrés.</span>',
          onClose: () => render() });
        const el = p.el, host = el.querySelector('[data-plist]'), redraw = () => { host.innerHTML = listHTML(); };
        el.querySelector('[data-psearch]').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); redraw(); });
        el.addEventListener('change', (e) => {
          const s = e.target.closest('[data-mem]'); if (!s) return; const id = s.dataset.mem, i = D.CONGES_MEMBERS.indexOf(id);
          if (s.checked && i < 0) { D.CONGES_MEMBERS.push(id); ask = null; redraw(); header(); refresh(); }
          else if (!s.checked && i >= 0) { s.checked = true; ask = id; redraw(); }
        });
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-ano]')) { ask = null; redraw(); }
          const y = e.target.closest('[data-ayes]'); if (y) { const i = D.CONGES_MEMBERS.indexOf(y.dataset.ayes); if (i >= 0) D.CONGES_MEMBERS.splice(i, 1); ask = null; redraw(); header(); refresh(); }
        });
      }

      /* ---------- Câblage ---------- */
      $('[data-tabs]').addEventListener('change', (e) => switchTab(e.detail));
      $('[data-acts]').addEventListener('click', (e) => { if (e.target.closest('[data-pose]')) openPose(); if (e.target.closest('[data-part]')) openParticipants(); });
      h2.addEventListener('click', (e) => {
        const n = e.target.closest('[data-mnav]'); if (n) return goMonth(addM(st.month, +n.dataset.mnav), +n.dataset.mnav);
        const pn = e.target.closest('[data-pnav]'); if (pn) return goPeriod(+pn.dataset.pnav);
        if (e.target.closest('[data-ptoday]')) { const dir = -Math.sign(st.pOff); if (dir) goPeriod(dir * Math.abs(st.pOff)); scrollToCurrent(main.querySelector('.cng-pane:not(.out)'), true); }
      });
      main.addEventListener('click', (e) => {
        const g = e.target.closest('[data-goto]'); if (g) { const d = P(g.dataset.goto); st.month = new Date(d.getFullYear(), d.getMonth(), 1); return switchTab('planning'); }
        const card = e.target.closest('[data-card]'); if (card) { const u = card.dataset.card; st.open.has(u) ? st.open.delete(u) : st.open.add(u); const r = card.parentElement.getBoundingClientRect(); refresh(); const nc = main.querySelector(`.cng-card[data-u="${u}"]`); if (nc) GX.animate(nc, [{ height: r.height + 'px', overflow: 'hidden' }, { height: nc.offsetHeight + 'px', overflow: 'hidden' }], { spring: 'snappy' }); return; }
        const cell = e.target.closest('[data-cell]'); if (cell) return cellPop(cell.dataset.cell, cell.dataset.d, cell);
        const day = e.target.closest('[data-day]'); if (day && !day.disabled) return dayPop(day.dataset.day, day);
        const dr = e.target.closest('[data-droit]'); if (dr) { st.editDroit = dr.dataset.droit; refresh(); const i = main.querySelector('[data-droit-in]'); i?.focus(); i?.select(); }
      });
      /* Droit à CP : saisie libre (« 12,5 » accepté), ≥ 0 ; Entrée valide, Échap annule */
      const saveDroit = (inp) => { if (!inp || st.editDroit !== inp.dataset.droitIn) return; const v = Number(String(inp.value).replace(',', '.')); const u = inp.dataset.droitIn; st.editDroit = null; if (Number.isFinite(v) && v >= 0 && v !== droit(u, st.pOff)) { setDroit(u, st.pOff, v); GX.shell?.hud?.(`Droit : ${nf(v)} j`); } refresh(); };
      main.addEventListener('keydown', (e) => { const i = e.target.closest('[data-droit-in]'); if (!i) return; if (e.key === 'Enter') saveDroit(i); if (e.key === 'Escape') { e.stopPropagation(); st.editDroit = null; refresh(); } });
      main.addEventListener('focusout', (e) => { const i = e.target.closest?.('[data-droit-in]'); if (i) setTimeout(() => saveDroit(i), 0); });
      /* Glisser sur sa ligne : raccourci de la maquette pour poser une période d'un geste */
      main.addEventListener('pointerdown', (e) => {
        const td = e.target.closest('.cng-t td.c'); if (!td || e.button !== 0 || !td.closest('tbody')) return;
        const row = td.parentElement, u = row.dataset.u, cells = [...row.querySelectorAll('td.c')], i0 = cells.indexOf(td);
        if (!canEdit(u) || e.pointerType === 'touch') { const up0 = () => { removeEventListener('pointerup', up0); cellPop(u, td.dataset.d, td); }; addEventListener('pointerup', up0); return; }
        e.preventDefault(); let i1 = i0;
        const paint = () => { const a = Math.min(i0, i1), b = Math.max(i0, i1); cells.forEach((c, i) => { c.classList.toggle('drag', i >= a && i <= b); c.classList.toggle('d0', i === a); c.classList.toggle('d1', i === b); }); };
        const mv = (ev) => { const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('td.c'); if (el && el.parentElement === row) { const i = cells.indexOf(el); if (i !== i1) { i1 = i; paint(); } } };
        const up = () => {
          removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
          const a = Math.min(i0, i1), b = Math.max(i0, i1); const anchor = cells[b];
          setTimeout(() => cells.forEach((c) => c.classList.remove('drag', 'd0', 'd1')), a === b ? 0 : 900);
          if (a === b) cellPop(u, cells[a].dataset.d, cells[a]); else rangePop(u, cells[a].dataset.d, cells[b].dataset.d, anchor);
        };
        paint(); addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      body.tabIndex = -1;
      body.addEventListener('keydown', (e) => {
        if (e.target.closest('input,textarea,select,.cng-side') || st.tab !== 'planning' || e.ctrlKey || e.metaKey) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); goMonth(addM(st.month, -1), -1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); goMonth(addM(st.month, 1), 1); }
      });

      /* ---------- Adaptatif ---------- */
      const stopW = GX.ui.watchWidth(body, 640, (c) => { const was = compact; compact = c; if (was !== c && main.firstElementChild && st.tab === 'planning') refresh(); });
      compact = body.clientWidth > 0 && body.clientWidth < 640;
      render();
      const off = [GX.on('ctx', () => { closePanel(); render(); })];

      return {
        destroy() { stopW(); off.forEach((o) => o()); closePop(); closePanel(); },
        command(c) { if (c === 'conge') openPose(); if (c?.startsWith?.('tab:')) switchTab(c.slice(4)); },
        menus: () => ({
          'Fichier': [{ label: 'Poser une période…', icon: 'plus', disabled: denied() || !members().some((u) => canEdit(u)), action: () => openPose() }, { label: 'Participants…', icon: 'users', disabled: !isManager(), action: openParticipants }],
          'Présentation': [{ label: 'Planning', checked: st.tab === 'planning', action: () => switchTab('planning') }, { label: 'Agenda', checked: st.tab === 'agenda', action: () => switchTab('agenda') }, { label: 'Tableau de bord', checked: st.tab === 'dash', action: () => switchTab('dash') }, '-',
            { label: 'Mois précédent', icon: 'back', kbd: '←', action: () => goMonth(addM(st.month, -1), -1) }, { label: 'Mois suivant', icon: 'chevron', kbd: '→', action: () => goMonth(addM(st.month, 1), 1) }],
        }),
      };
    },
  });
})();
