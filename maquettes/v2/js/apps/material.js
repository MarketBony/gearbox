/* =====================================================================
   Rubrique « Matériel » — Gestion Matériel (miroir de pages/Material.tsx)
   - onglets Planning / Inventaire ; bouton d'action selon l'onglet
     (Planning → RÉSERVER, Inventaire → AJOUTER MATÉRIEL, gestionnaires)
   - Planning : vues SEMAINE / MOIS, filtre UNIQUE « Tout le matériel »
     ou un matériel (seul filtre de la vraie page) ; clic sur un jour =
     nouvelle réservation ; glisser sur plusieurs jours / glisser une
     barre = raccourcis de la maquette (création / déplacement)
   - ANTI SUR-RÉSERVATION : « Disponible : N » = stock − max simultané
     sur la période ; quantité plafonnée ; refus « Stock insuffisant ! »
   - réservations ouvertes à TOUT utilisateur qui a la rubrique (routes/
     equipmentBookings.ts : aucun requireRole, aucune notion d'auteur) ;
     catalogue (ajout / modification / suppression) réservé à Master,
     Administrator, Director (MANAGE_ROLES de routes/equipment.ts)
   - saisie en PANNEAU LATÉRAL (modèle Dépenses) ; fenêtre étroite :
     le panneau recouvre la rubrique
   - le stock est commun à tout le réseau : le périmètre global filtre
     l'affichage, jamais le calcul de disponibilité
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt, DAY = 864e5;
  GX.css(`
  .mat-h .ah-tabs .tabs{border:0}
  .mat-h .acts{display:flex;gap:8px;align-items:center}
  /* --c = couleur de service (donnée) ; --cv = variante lisible selon le thème */
  .mat{--mixb:34%}
  .mat [style*="--c:"]{--cv:color-mix(in srgb,var(--c) 62%,#fff)}
  :root[data-theme="light"] .mat{--mixb:20%}
  :root[data-theme="light"] .mat [style*="--c:"]{--cv:var(--c)}
  .mat-sep{background:var(--line-2)}
  .mat-per{display:flex;align-items:center;gap:4px;height:36px}
  .mat-per b{font-size:15px;letter-spacing:-.01em;white-space:nowrap;min-width:170px;text-align:center}
  .mat-h2 .seg{height:36px;align-items:center}.mat-h2 .seg > button{height:30px;padding:0 14px;font-size:var(--fs-13)}
  .mat-h2 .mat-notew{margin-left:auto}
  .mat-note{display:flex;align-items:center;gap:6px;height:36px;font-size:var(--fs-13);color:var(--text-2)}
  .mat-body{flex:1;min-height:0;display:flex;position:relative}
  .mat-main{flex:1;min-width:0;min-height:0;position:relative;display:flex;flex-direction:column}
  /* Le calendrier : une carte détachée du fond, pleine largeur */
  .mat-stage{position:relative;flex:1;min-height:0;overflow:hidden;margin:0 22px 22px;border:1px solid var(--line-2);border-radius:14px;background:var(--surface-1)}
  .mat-pane{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--surface-1);z-index:1}
  .mat-pane.out{pointer-events:none;z-index:0}
  .mat-7{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}

  /* Jauge de disponibilité */
  .mat-g{display:flex;align-items:center;gap:6px;min-width:0;font-size:12px;font-weight:700;color:var(--text-2)}
  .mat-g .bar{flex:1;height:5px;min-width:18px}
  .mat-g.ok .bar > i{--c:var(--ok)} .mat-g.low .bar > i{--c:var(--warn)} .mat-g.full .bar > i{--c:var(--danger)}
  .mat-g.full{color:var(--danger)}
  .mat-g .x{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 4px;border-radius:99px;background:var(--danger);color:#fff;font-size:11px}

  /* Barres de réservation */
  .mat-bar{position:relative;display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:0;overflow:hidden;text-align:left;border-radius:9px;padding:0 9px 0 11px;cursor:grab;
    background:color-mix(in srgb,var(--c) var(--mixb),var(--surface-2));color:var(--text);box-shadow:inset 4px 0 0 var(--cv),inset 0 0 0 1px color-mix(in srgb,var(--cv) 45%,transparent);
    transition:transform var(--t-fast) var(--ease-out),filter var(--t-fast),opacity var(--t-fast);touch-action:none;user-select:none;-webkit-user-select:none}
  .mat-bar:hover{filter:brightness(1.1);z-index:2;box-shadow:inset 4px 0 0 var(--cv),inset 0 0 0 1.5px var(--cv),var(--shadow-1)}
  .mat-bar.ro{cursor:pointer}
  .mat-bar.cl{border-top-left-radius:2px;border-bottom-left-radius:2px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--cv) 45%,transparent)}
  .mat-bar.cr{border-top-right-radius:2px;border-bottom-right-radius:2px}
  .mat-bar b{font-size:var(--fs-14);display:block}
  .mat-bar .m{font-size:var(--fs-12);color:var(--text-2)}
  .mat-bar.lift{opacity:.45;transform:scale(.97)}
  .mat-bar.mo{border-radius:5px;padding:0 6px 0 9px;font-size:12.5px;font-weight:600;margin:0 3px;flex-direction:row;align-items:center;justify-content:flex-start;gap:5px;white-space:nowrap}
  .mat-bar.mo.cl{margin-left:0}.mat-bar.mo.cr{margin-right:0}
  .mat-bar.mo .m{font-size:11.5px}
  .mat-stage.dragging .mat-bar:not(.lift){pointer-events:none}
  .mat-stage.dragging{cursor:grabbing}

  /* Semaine */
  .mat-dh{border-bottom:1px solid var(--line);flex:none}
  .mat-dhc{display:grid;gap:5px;padding:9px 10px 8px;border-left:1px solid var(--line);min-width:0}
  .mat-dhc:first-child{border-left:0}
  .mat-dhc .t{display:flex;align-items:center;gap:7px}
  .mat-dhc .t span{font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--text-2)}
  .mat-dhc .t b{font-size:18px;font-weight:600;min-width:28px;height:28px;display:grid;place-items:center;border-radius:99px}
  .mat-dhc.today .t b{background:var(--accent);color:#fff}
  .mat-dhc.today .t span{color:var(--accent)}
  .mat-wbody{flex:1;min-height:0}
  .mat-wrap{position:relative;min-height:100%}
  .mat-cols{position:absolute;inset:0}
  .mat-col{border-left:1px solid var(--line);position:relative;transition:background var(--t-fast)}
  .mat-col:first-child{border-left:0}
  .mat-col.we{background:color-mix(in srgb,var(--surface-4) 45%,transparent)}
  .mat-col.today{background:color-mix(in srgb,var(--accent) 6%,transparent)}
  .mat-ed .mat-col{cursor:copy}
  .mat-ed .mat-col:hover{background:color-mix(in srgb,var(--surface-3) 55%,transparent)}
  .mat-ed .mat-col:hover::after{content:"+ Réserver";position:absolute;left:0;right:0;bottom:14px;text-align:center;font-size:12px;font-weight:700;color:var(--text-2)}
  .mat-wl{position:relative;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-auto-rows:56px;row-gap:6px;padding:10px 0 48px;pointer-events:none}
  .mat-wl .mat-bar{margin:0 4px;pointer-events:auto}
  [data-d].sel{background:var(--sel)!important;box-shadow:inset 0 2px 0 var(--accent),inset 0 -2px 0 var(--accent)}
  [data-d].tgt{background:color-mix(in srgb,var(--ok) 16%,transparent)!important;box-shadow:inset 0 2px 0 var(--ok),inset 0 -2px 0 var(--ok)}
  [data-d].bad{background:color-mix(in srgb,var(--danger) 16%,transparent)!important;box-shadow:inset 0 2px 0 var(--danger),inset 0 -2px 0 var(--danger)}

  /* Mois */
  .mat-mh{border-bottom:1px solid var(--line);flex:none}
  .mat-mh span{padding:7px 10px;font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--text-2)}
  .mat-mg{flex:1;min-height:0;display:grid;grid-template-rows:repeat(var(--weeks),minmax(0,1fr))}
  .mat-mr{position:relative;min-height:0;border-bottom:1px solid var(--line);overflow:hidden}
  .mat-mr:last-child{border-bottom:0}
  .mat-mbg{position:absolute;inset:0}
  .mat-mc{border-left:1px solid var(--line);padding:5px 6px;display:flex;align-items:flex-start;gap:6px;min-width:0}
  .mat-mc:first-child{border-left:0}
  .mat-mc.we{background:color-mix(in srgb,var(--surface-4) 45%,transparent)}
  .mat-mc .dn{font-size:13px;font-weight:600;min-width:22px;height:22px;display:grid;place-items:center;border-radius:99px;flex:none}
  .mat-mc.out .dn{color:var(--text-3)}
  .mat-mc.today .dn{background:var(--accent);color:#fff}
  .mat-mc .mat-g{flex:1;margin-top:9px}
  .mat-ed .mat-mc{cursor:copy}
  .mat-ed .mat-mc:hover{background:color-mix(in srgb,var(--surface-3) 55%,transparent)}
  .mat-mb{position:absolute;left:0;right:0;top:31px;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-auto-rows:22px;row-gap:2px;pointer-events:none}
  .mat-mb > *{pointer-events:auto}
  .mat-more{margin:0 3px;padding:0 6px;border-radius:5px;font-size:12px;font-weight:700;color:var(--text-2);text-align:left;white-space:nowrap;overflow:hidden}
  .mat-more:hover{background:var(--surface-3);color:var(--text)}

  /* Liste (compact) */
  .mat-list{padding:0 12px 28px}
  .mat-lh{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:8px;padding:12px 2px 7px;background:var(--surface-1);font-weight:700}
  .mat-lh.today{color:var(--accent)}
  .mat-lh .mat-g{width:90px;flex:none}
  .mat-li{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px 10px 14px;margin-bottom:6px;border-radius:12px;text-align:left;
    background:color-mix(in srgb,var(--c) calc(var(--mixb) - 10%),var(--surface-2));box-shadow:inset 4px 0 0 var(--cv),inset 0 0 0 1px var(--line);transition:transform var(--t-fast) var(--ease-out)}
  .mat-li:active{transform:scale(.98)}
  .mat-free{padding:8px 12px;margin-bottom:6px;border-radius:12px;border:1.5px dashed var(--line-3);color:var(--text-2);font-size:var(--fs-13);width:100%;text-align:left}

  /* Inventaire : tableau dense et lisible dans une carte pleine largeur */
  .mat-inv{flex:1;min-height:0;padding:0 22px 22px}
  .mat-card{border:1px solid var(--line-2);border-radius:14px;background:var(--surface-2);overflow:hidden}
  .mat-card-h{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;padding:18px 22px 14px}
  .mat-sec{font-family:var(--font-display);font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .mat-card-h .faint{font-size:var(--fs-13)}
  .mat-card-h .n{margin-left:auto;font-size:13px;color:var(--text-2)}
  .mat-card-h .n b{font-size:22px;color:var(--text);letter-spacing:-.02em;margin-right:4px}
  .mat-tbl th{padding-top:11px;padding-bottom:11px}
  .mat-tbl td{padding-top:13px;padding-bottom:13px}
  .mat-tbl th:first-child,.mat-tbl td:first-child{padding-left:22px}.mat-tbl th:last-child,.mat-tbl td:last-child{padding-right:22px}
  .mat-tbl tbody tr{cursor:pointer}
  .mat-tbl tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--surface-3) 45%,transparent)}
  .mat-tbl tbody tr:hover td{background:var(--surface-3)}
  .mat-tbl td b{font-size:var(--fs-14)}
  .mat-tbl .c{text-align:center}
  .mat-tbl .qty{font-size:19px;font-weight:700;color:var(--accent)}
  .mat-tbl .acts{display:inline-flex;gap:2px;justify-content:flex-end}
  .mat-tbl .catm{display:none;font-size:12.5px;color:var(--text-2)}

  /* Panneau latéral de saisie (modèle Dépenses) */
  .mat-side{flex:none;width:0;overflow:hidden;transition:width var(--t-med) var(--ease-out)}
  .mat-side.on{width:480px}
  .mat-side-in{width:480px;height:100%;display:flex;flex-direction:column;background:var(--surface-2);border-left:1px solid var(--line-2);box-shadow:var(--shadow-1)}
  .mat-side-h{display:flex;align-items:center;gap:12px;padding:20px 22px 12px}
  .mat-side-h .ic{width:34px;height:34px;border-radius:9px;flex:none;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)}
  .mat-side-h h3{flex:1;min-width:0;font-family:var(--font-display);font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
  .mat-side-b{flex:1;min-height:0;padding:0 22px 20px}
  .mat-side-b .form-grid{gap:14px}
  .mat-side-f{display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap;padding:14px 22px;border-top:1px solid var(--line-2)}
  .mat-del{margin-right:auto;display:flex;align-items:center;gap:6px;font-weight:700;font-size:var(--fs-13)}
  .mat-del .yes{background:var(--danger);color:#fff}
  .mat-dispo{font-size:12.5px;font-weight:700}
  .mat-strip{display:flex;gap:2px;align-items:flex-end;height:34px;padding:6px 8px;border-radius:10px;background:var(--surface-1);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
  .mat-strip i{flex:1;min-width:2px;border-radius:2px;background:var(--ok)}
  .mat-strip i.low{background:var(--warn)} .mat-strip i.full{background:var(--danger)}
  .mat-err{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--danger) 14%,transparent);color:var(--danger);font-weight:700}
  .mat-qty.over{box-shadow:inset 0 0 0 1px var(--danger),0 0 0 3px color-mix(in srgb,var(--danger) 30%,transparent)}

  @container app (max-width:760px){
    .mat-side{position:absolute;inset:0;z-index:40;width:100%;transform:translateX(104%);transition:transform var(--t-med) var(--ease-out);pointer-events:none}
    .mat-side.on{width:100%;transform:none;pointer-events:auto}
    .mat-side-in{width:100%;border-left:0}
  }
  @container app (max-width:720px){
    .mat-h .ah-f{width:auto;margin-left:auto}
    .mat-h2 .mat-notew{display:none}
    .mat-dhc .mat-g span{display:none}
    .mat-tbl .cat{display:none}.mat-tbl .catm{display:block}
    .mat-stage{margin:0 10px 10px}.mat-inv{padding:0 10px 10px}
    .mat-per b{min-width:0}
  }
  @container app (max-width:460px){
    .mat-h .ah-t .sub{display:none}
    .mat-h .acts .lbl{display:none}
    .mat-h2 > div:has(> .mat-per){flex-basis:100%}.mat-per b{flex:1;font-size:14px;overflow:hidden;text-overflow:ellipsis}
    .mat-h2 > div:has(> .picker-btn){flex:1;min-width:0}.mat-h2 .picker-btn{width:100%}
    .mat-tbl th,.mat-tbl td{padding-left:8px!important;padding-right:8px!important}.mat-tbl th{white-space:normal}
    .mat-h .mat-tabs svg.i{display:none}.mat-h .ah-t h1{font-size:16px}
    .mat-card-h{padding:14px 12px 10px}
    .mat-side-b .form-grid{grid-template-columns:1fr}
  }
  `);

  /* ---------------- Dates ---------------- */
  const P = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const addM = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
  const diff = (a, b) => Math.round((a - b) / DAY);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const monday = (d) => addD(d, -((d.getDay() + 6) % 7));
  const isWE = (d) => d.getDay() === 0 || d.getDay() === 6;
  const isoAdd = (iso, n) => GX.iso(addD(P(iso), n));
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MSHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const DOW = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const range = (a, b) => (a === b ? F.date(a) : `${F.date(a)} → ${F.date(b)}`);
  const hud = (t) => GX.shell?.hud?.(t);

  /* ---------------- Règles (routes/equipment.ts + routes/equipmentBookings.ts) ---------------- */
  const MANAGERS = ['Master', 'Administrator', 'Director'];
  const isManager = () => MANAGERS.includes(GX.ctx.role);
  /* Réserver, modifier, supprimer une réservation : tout utilisateur authentifié qui voit la rubrique.
     ⚠️ Le vrai Gearbox n'enregistre pas d'auteur et ne restreint pas l'Invité ici : on ne l'invente pas.
     Chef de site et Externe n'ont pas la rubrique (liste fermée), d'où ce seul garde-fou. */
  const canBook = () => !['Site Manager', 'External'].includes(GX.ctx.role);
  const canEditBooking = () => canBook();
  const eqOf = (id) => D.EQUIPMENT.find((e) => e.id === id);
  /* SERVICES de constants.ts, « Tous Services » compris (valeur par défaut d'une réservation) */
  const SERVICES = [...D.SERVICES, 'Tous Services'];
  const colorOf = (b) => D.SERVICE_COLOR[b.service] || D.SERVICE_COLOR['Tous Services'];
  /* Stock : quantité réservée un jour donné (TOUT le réseau, jamais filtrée par le périmètre) */
  const usedOn = (eqId, iso, exclude) => D.BOOKINGS.reduce((s, b) => (b.eq === eqId && b.id !== exclude && b.start <= iso && b.end >= iso ? s + b.qty : s), 0);
  /* Disponible sur une période = stock − maximum simultané sur la période (getAvailability) */
  const avail = (eqId, a, b, exclude) => {
    const eq = eqOf(eqId); if (!eq || !a) return 0; if (!b || b < a) b = a;
    let max = 0; for (let d = a, n = 0; d <= b && n < 400; d = isoAdd(d, 1), n++) max = Math.max(max, usedOn(eqId, d, exclude));
    return Math.max(0, eq.qty - max);
  };
  const perOk = (b) => {
    const per = GX.ctx.perimetre; if (!per || per === 'Tout le réseau') return true;
    if (per === 'Nissan') return b.site === 'Nissan' || D.NISSAN_ONLY.includes(b.site);
    return b.site === per;
  };
  /* Options du champ Site de la vraie page : GROUPE BONY, les sites des 4 plaques (PLAQUES_STRUCTURE), Nissan.
     ⚠️ La vraie page propose aussi un pseudo-site « Alpine » : Alpine étant PAR SITE (règle métier), il est
     volontairement absent ici — écart signalé dans le compte rendu. */
  const siteOptions = (sel) => {
    const known = ['GROUPE BONY', ...Object.values(D.PLAQUES).flat(), 'Nissan'];
    return `${sel && !known.includes(sel) ? `<option selected>${GX.esc(sel)}</option>` : ''}<option ${sel === 'GROUPE BONY' ? 'selected' : ''}>GROUPE BONY</option>${Object.entries(D.PLAQUES).map(([pl, ss]) => `<optgroup label="${pl}">${ss.map((s) => `<option ${sel === s ? 'selected' : ''}>${s}</option>`).join('')}</optgroup>`).join('')}<optgroup label="Entité"><option ${sel === 'Nissan' ? 'selected' : ''}>Nissan</option></optgroup>`;
  };

  function pack(items, s0, e0) {
    const N = diff(e0, s0);
    const segs = items.filter((it) => it.e >= s0 && it.s < e0).map((it) => ({ it, a: Math.max(0, diff(it.s, s0)), b: Math.min(N - 1, diff(it.e, s0)), cl: it.s < s0, cr: it.e >= e0 }))
      .sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a));
    const ends = [];
    segs.forEach((sg) => { let l = ends.findIndex((e) => e < sg.a); if (l < 0) { l = ends.length; ends.push(-1); } ends[l] = sg.b; sg.lane = l; });
    return { segs, lanes: ends.length };
  }

  GX.registerApp({
    id: 'material', name: 'Matériel', icon: 'material', tint: ['#7c8aa5', '#3b4863'], size: [1180, 720], minSize: [360, 360],
    mount(body, win) {
      const st = { tab: GX.store.get('mat.tab') === 'inv' ? 'inv' : 'planning', view: GX.store.get('mat.view') === 'month' ? 'month' : 'week', anchor: GX.today(), eq: '' };
      let compact = false, lastFit = 0, pnl = null;
      body.innerHTML = `<div class="app mat">
        <div class="app-head mat-h"><div class="ah-t"><h1>Gestion Matériel</h1><span class="sub">Logistique événementielle · stock commun à tout le réseau</span></div>
          <div class="ah-tabs"><div class="tabs mat-tabs" data-tabs><button data-v="planning" aria-selected="${st.tab === 'planning'}">${GX.icon('agenda', 'sm')} Planning</button><button data-v="inv" aria-selected="${st.tab === 'inv'}">${GX.icon('material', 'sm')} Inventaire</button></div></div>
          <div class="ah-f acts" data-acts></div></div>
        <div class="app-head2 mat-h2" data-h2></div>
        <div class="mat-body"><div class="mat-main" data-main></div><aside class="mat-side" data-side></aside></div></div>`;
      const $ = (s) => body.querySelector(s), main = $('[data-main]'), h2 = $('[data-h2]'), side = $('[data-side]');
      const stage = () => main.querySelector('[data-stage]');
      const curPane = () => stage()?.querySelector('.mat-pane:not(.out)');

      /* Un seul bouton d'action, selon l'onglet (comme la vraie page) */
      function header() {
        $('[data-acts]').innerHTML = st.tab === 'planning'
          ? (canBook() ? `<button class="btn primary" data-book>${GX.icon('plus', 'sm')}<span class="lbl">Réserver</span></button>` : '<span class="badge" style="--c:var(--danger)">Lecture seule</span>')
          : (isManager() ? `<button class="btn primary" data-addeq>${GX.icon('plus', 'sm')}<span class="lbl">Ajouter matériel</span></button>` : '');
        win.setTitle('Matériel', st.tab === 'inv' ? 'Inventaire' : st.view === 'week' ? 'Planning · semaine' : 'Planning · mois');
      }

      /* ---------- Période ---------- */
      function period() {
        const a = st.anchor;
        if (st.view === 'week') {
          const s = monday(a), e6 = addD(s, 6);
          const title = s.getMonth() === e6.getMonth() ? `${s.getDate()} – ${e6.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}` : `${s.getDate()} ${MSHORT[s.getMonth()]} – ${e6.getDate()} ${MSHORT[e6.getMonth()]} ${e6.getFullYear()}`;
          return { s, e: addD(s, 7), title };
        }
        const m0 = new Date(a.getFullYear(), a.getMonth(), 1), m1 = addM(m0, 1);
        return { s: monday(m0), e: addD(monday(addD(m1, -1)), 7), m0, m1, title: `${cap(MONTHS[m0.getMonth()])} ${m0.getFullYear()}` };
      }
      const items = () => D.BOOKINGS.filter((b) => eqOf(b.eq) && (!st.eq || b.eq === st.eq) && perOk(b)).map((b) => ({ b, s: P(b.start), e: P(b.end < b.start ? b.start : b.end), c: colorOf(b) }));
      /* Filtre « Matériel » : TOUT LE MATÉRIEL ou un seul (sélecteur simple de la vraie page), groupé par catégorie */
      function openEqPick(btn) {
        const cats = [...new Set(D.EQUIPMENT.map((e) => e.cat || 'Autre'))].sort((a, b) => a.localeCompare(b));
        GX.ui.pick(btn, [{ items: [{ v: '', l: 'Tout le matériel' }] }, ...cats.map((c) => ({ label: c, items: D.EQUIPMENT.filter((e) => (e.cat || 'Autre') === c).map((e) => ({ v: e.id, l: e.name, hint: `stock ${e.qty}` })) }))],
          { multi: false, title: 'Matériel', selected: [st.eq], width: 290, onChange: (v) => { st.eq = v[0] || ''; toolbar(); inPlace(true); } });
      }

      /* ---------- Panneau de filtres (modèle : libellé au-dessus, carte) ---------- */
      function toolbar() {
        if (st.tab !== 'planning') { h2.classList.add('hide'); h2.innerHTML = ''; return; }
        h2.classList.remove('hide');
        const per = period(), filtered = GX.ctx.perimetre && GX.ctx.perimetre !== 'Tout le réseau';
        h2.innerHTML = `<div><span class="label">Période</span><div class="mat-per"><button class="icon-btn" data-nav="-1" data-tip="Précédent (←)">${GX.icon('back')}</button><button class="btn sm" data-today>Aujourd’hui</button><b data-ptitle>${per.title}</b><button class="icon-btn" data-nav="1" data-tip="Suivant (→)">${GX.icon('chevron')}</button></div></div>
          <div><span class="label">Vue</span><div class="seg" data-view><button data-v="week" aria-pressed="${st.view === 'week'}">Semaine</button><button data-v="month" aria-pressed="${st.view === 'month'}">Mois</button></div></div>
          <span class="mat-sep"></span>
          <div><span class="label">Matériel</span>${GX.ui.pickerBtn('data-eqpick', 'filter', st.eq ? eqOf(st.eq)?.name || 'Tout le matériel' : 'Tout le matériel', !!st.eq)}</div>
          <div class="mat-notew"><span class="label">Disponibilité</span><span class="mat-note">${GX.icon('info', 'sm')}${filtered ? `Périmètre ${GX.esc(GX.ctx.perimetre)} · la jauge compte tout le réseau` : canBook() ? 'Clic sur un jour pour réserver · jauge = unités sorties' : 'Lecture seule'}</span></div>`;
      }

      /* ---------- Jauge du jour ---------- */
      function gauge(iso, withText) {
        if (st.eq) {
          const eq = eqOf(st.eq), used = usedOn(eq.id, iso), free = Math.max(0, eq.qty - used), cls = free === 0 ? 'full' : free <= Math.max(1, Math.floor(eq.qty / 4)) ? 'low' : 'ok';
          return `<span class="mat-g ${cls}" data-tip="${GX.esc(eq.name)} : ${free} disponible${free > 1 ? 's' : ''} sur ${eq.qty}"><span class="bar"><i style="width:${Math.min(100, (used / eq.qty) * 100)}%"></i></span>${withText ? `<span class="num">${free}/${eq.qty}</span>` : ''}</span>`;
        }
        let used = 0, tot = 0; const out = [];
        D.EQUIPMENT.forEach((eq) => { const u = usedOn(eq.id, iso); used += Math.min(u, eq.qty); tot += eq.qty; if (u >= eq.qty) out.push(eq.name); });
        const p = tot ? (used / tot) * 100 : 0;
        return `<span class="mat-g ${out.length ? 'full' : p > 50 ? 'low' : 'ok'}" data-tip="${used} / ${tot} unités sorties${out.length ? ' · épuisé : ' + GX.esc(out.join(', ')) : ''}"><span class="bar"><i style="width:${p}%"></i></span>${out.length ? `<span class="x">${out.length}</span>` : withText ? `<span class="num">${Math.round(p)} %</span>` : ''}</span>`;
      }

      /* ---------- Rendus ---------- */
      /* Contenu = celui de l'EventBar réel : « 2x Nom », site · service (semaine) ou « - site » (mois) ; infobulle = nom, description, site, service, dates */
      function barHTML(sg, kind, style) {
        const { b, c } = sg.it, eq = eqOf(b.eq), cls = `mat-bar ${kind} ${sg.cl ? 'cl' : ''} ${sg.cr ? 'cr' : ''} ${canEditBooking(b) ? '' : 'ro'}`;
        const tip = `${eq.name}${b.note ? ' · ' + b.note : ''} · ${b.site} · ${b.service} · ${range(b.start, b.end)} · ${b.qty} unité${b.qty > 1 ? 's' : ''}`;
        const inner = kind === 'mo' ? `<b class="ellipsis" style="font-size:12.5px;display:inline">${b.qty}x ${GX.esc(eq.name)}</b><span class="m ellipsis">- ${GX.esc(b.site)}</span>`
          : `<b class="ellipsis">${b.qty}x ${GX.esc(eq.name)}</b><span class="m ellipsis">${GX.esc(b.site)} · ${b.service}</span>`;
        return `<div class="${cls}" data-bk="${b.id}" data-k="${b.id}:${sg.a}" style="--c:${c};${style}" data-tip="${GX.esc(tip)}">${inner}</div>`;
      }
      function weekHTML(per, its) {
        const T = GX.today(), days = [...Array(7)].map((_, i) => addD(per.s, i)), { segs, lanes } = pack(its, per.s, per.e);
        return `<div class="mat-dh mat-7">${days.map((d, i) => `<div class="mat-dhc ${same(d, T) ? 'today' : ''}"><div class="t"><span>${DOW[i]}</span><b class="num">${d.getDate()}</b></div>${gauge(GX.iso(d), true)}</div>`).join('')}</div>
          <div class="mat-wbody scroll"><div class="mat-wrap ${canBook() ? 'mat-ed' : ''}"><div class="mat-cols mat-7">${days.map((d) => `<div class="mat-col ${isWE(d) ? 'we' : ''} ${same(d, T) ? 'today' : ''}" data-d="${GX.iso(d)}"></div>`).join('')}</div>
          <div class="mat-wl" style="grid-template-rows:repeat(${Math.max(1, lanes)},50px)">${segs.map((sg) => barHTML(sg, 'wk', `grid-column:${sg.a + 1}/${sg.b + 2};grid-row:${sg.lane + 1}`)).join('')}</div></div></div>`;
      }
      function monthHTML(per, its, h) {
        const T = GX.today(), weeks = Math.round(diff(per.e, per.s) / 7), fit = Math.max(1, Math.floor(((h ? (h - 31) / weeks : 110) - 33) / 24)); lastFit = fit;
        const rows = [...Array(weeks)].map((_, w) => {
          const s = addD(per.s, 7 * w), e = addD(s, 7), { segs, lanes } = pack(its, s, e);
          let shown = segs, more = '';
          if (lanes > fit) { const capL = fit - 1; shown = segs.filter((x) => x.lane < capL); for (let d = 0; d < 7; d++) { const n = segs.filter((x) => x.lane >= capL && x.a <= d && x.b >= d).length; if (n) more += `<button class="mat-more" data-more="${GX.iso(addD(s, d))}" style="grid-column:${d + 1};grid-row:${capL + 1}">+${n} autre${n > 1 ? 's' : ''}</button>`; } }
          const cells = [...Array(7)].map((_, d) => { const x = addD(s, d), iso = GX.iso(x); return `<div class="mat-mc ${isWE(x) ? 'we' : ''} ${x < per.m0 || x >= per.m1 ? 'out' : ''} ${same(x, T) ? 'today' : ''}" data-d="${iso}"><span class="dn num">${x.getDate()}</span>${gauge(iso, false)}</div>`; }).join('');
          return `<div class="mat-mr"><div class="mat-mbg mat-7 ${canBook() ? 'mat-ed' : ''}">${cells}</div><div class="mat-mb">${shown.map((sg) => barHTML(sg, 'mo', `grid-column:${sg.a + 1}/${sg.b + 2};grid-row:${sg.lane + 1}`)).join('')}${more}</div></div>`;
        }).join('');
        return `<div class="mat-mh mat-7">${DOW.map((d) => `<span>${d}</span>`).join('')}</div><div class="mat-mg" style="--weeks:${weeks}">${rows}</div>`;
      }
      /* Liste (fenêtre étroite / téléphone), comme la liste mobile de CalendarGrid : la semaine montre ses 7 jours, le mois ses jours occupés */
      function listHTML(per, its) {
        const T = GX.today(), s = st.view === 'month' ? per.m0 : per.s, e = st.view === 'month' ? per.m1 : per.e; let out = '';
        for (let d = s; d < e; d = addD(d, 1)) {
          const iso = GX.iso(d), act = its.filter((it) => it.s <= d && it.e >= d);
          if (!act.length && st.view === 'month' && !same(d, T)) continue;
          out += `<div class="mat-lh ${same(d, T) ? 'today' : ''}"><span class="grow">${same(d, T) ? 'Aujourd’hui' : cap(d.toLocaleDateString('fr-FR', { weekday: 'long' }))} <span class="faint" style="font-weight:500">${d.getDate()} ${MONTHS[d.getMonth()]}</span></span>${gauge(iso, true)}${canBook() ? `<button class="icon-btn sm" data-add="${iso}" data-tip="Réserver ce jour">${GX.icon('plus', 'sm')}</button>` : ''}</div>`;
          out += act.length ? act.map((it) => { const b = it.b, eq = eqOf(b.eq); return `<button class="mat-li" data-bkl="${b.id}" style="--c:${it.c}"><div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${b.qty}x ${GX.esc(eq.name)}</b><div class="faint ellipsis" style="font-size:12px">${GX.esc(b.site)} · ${b.service} · ${range(b.start, b.end)}${b.note ? ' · ' + GX.esc(b.note) : ''}</div></div></button>`; }).join('')
            : canBook() ? `<button class="mat-free" data-add="${iso}">Libre — toucher pour réserver</button>` : '<div class="mat-free">Aucun événement sur cette période.</div>';
        }
        return `<div class="scroll" style="flex:1;min-height:0"><div class="mat-list">${out || `<div class="empty">${GX.icon('material')}Aucun événement sur cette période.</div>`}</div></div>`;
      }
      function paneHTML() {
        const per = period(), its = items(), s = stage();
        if (compact) return listHTML(per, its);
        return st.view === 'week' ? weekHTML(per, its) : monthHTML(per, its, s?.clientHeight);
      }
      /* Inventaire : colonnes exactes de la vraie page — Nom du matériel · Catégorie · Quantité Totale · Actions */
      function invHTML() {
        const list = D.EQUIPMENT, units = list.reduce((s, e) => s + e.qty, 0), mgr = isManager();
        return `<div class="mat-inv scroll"><div class="mat-card enter">
          <div class="mat-card-h"><h2 class="mat-sec">Catalogue</h2><span class="faint">${mgr ? 'Ajout, modification et suppression : Master, Administrateur, Directeur' : 'Consultation · la gestion du catalogue est réservée aux Master, Administrateurs et Directeurs'}</span><span class="n"><b class="num">${list.length}</b>matériel${list.length > 1 ? 's' : ''} · ${units} unités</span></div>
          <table class="tbl mat-tbl"><thead><tr><th>Nom du matériel</th><th class="cat">Catégorie</th><th class="c">Quantité Totale</th><th class="r">Actions</th></tr></thead><tbody>
          ${list.map((e, i) => `<tr data-eqrow="${e.id}" class="enter" style="--i:${i}" data-tip="Voir son planning"><td><b>${GX.esc(e.name)}</b><div class="catm">${GX.esc(e.cat || '')}</div></td><td class="cat">${e.cat ? `<span class="badge">${GX.esc(e.cat)}</span>` : ''}</td>
            <td class="c"><span class="qty num">${e.qty}</span></td>
            <td class="r">${mgr ? `<span class="acts"><button class="icon-btn sm" data-editeq="${e.id}" data-tip="Modifier">${GX.icon('edit', 'sm')}</button><button class="icon-btn sm" data-deleq="${e.id}" data-tip="Supprimer" style="color:var(--danger)">${GX.icon('trash', 'sm')}</button></span>` : ''}</td></tr>`).join('') || `<tr><td colspan="4"><div class="empty">${GX.icon('material')}Aucun matériel dans le catalogue</div></td></tr>`}
          </tbody></table></div></div>`;
      }

      /* ---------- Transitions ---------- */
      function swap(html, kind, dir = 1) {
        const s = stage(); if (!s) return;
        const old = curPane(), pane = document.createElement('div'); pane.className = 'mat-pane'; pane.innerHTML = html; s.append(pane);
        if (!old) return;
        old.classList.add('out');
        let a;
        if (kind === 'zoom') {
          a = GX.animate(old, [{ transform: 'none', opacity: 1 }, { transform: `scale(${dir > 0 ? .9 : 1.1})`, opacity: 0 }], { spring: 'soft', fill: 'forwards' });
          GX.animate(pane, [{ transform: `scale(${dir > 0 ? 1.08 : .92})`, opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'soft' });
        } else {
          a = GX.animate(old, [{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 30}%)`, opacity: 0 }], { spring: 'snappy', fill: 'forwards' });
          GX.animate(pane, [{ transform: `translateX(${dir * 40}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'snappy' });
        }
        a.onfinish = () => old.remove(); setTimeout(() => old.isConnected && old.remove(), 1300);
      }
      function inPlace(flip = true) {
        const pane = curPane(); if (!pane) return swap(paneHTML());
        const first = new Map(); if (flip) pane.querySelectorAll('[data-k]').forEach((el) => first.set(el.dataset.k, el.getBoundingClientRect()));
        const sc = pane.querySelector('.scroll'), top = sc?.scrollTop || 0;
        pane.innerHTML = paneHTML(); const n = pane.querySelector('.scroll'); if (n) n.scrollTop = top;
        if (flip) pane.querySelectorAll('[data-k]').forEach((el) => { const r = first.get(el.dataset.k); if (r) GX.flip(el, r, { spring: 'soft' }); else GX.animate(el, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy' }); });
      }
      function render(dir = 0) {
        header(); toolbar();
        const old = main.firstElementChild;
        main.innerHTML = st.tab === 'inv' ? invHTML() : '<div class="mat-stage" data-stage></div>';
        if (dir && old) GX.animate(main.firstElementChild, [{ opacity: 0, transform: `translateX(${dir * 24}px)` }, { opacity: 1, transform: 'none' }], { spring: 'snappy' });
        if (st.tab === 'planning') swap(paneHTML());
      }
      function refresh() { if (st.tab === 'inv') { const sc = main.querySelector('.scroll'), t = sc?.scrollTop || 0; render(); const n = main.querySelector('.scroll'); if (n) n.scrollTop = t; } else inPlace(true); }
      function nav(dir) { st.anchor = st.view === 'week' ? addD(st.anchor, 7 * dir) : (() => { const n = addM(st.anchor, dir), T = GX.today(); return n.getMonth() === T.getMonth() && n.getFullYear() === T.getFullYear() ? T : n; })(); updTitle(dir); swap(paneHTML(), 'slide', dir); }
      function goToday() { const T = GX.today(), p = period(); if (T >= p.s && T < p.e && (!p.m0 || (T >= p.m0 && T < p.m1))) { st.anchor = T; const t = h2.querySelector('[data-ptitle]'); return t && GX.animate(t, [{ transform: 'scale(1.06)' }, { transform: 'none' }], { spring: 'bouncy' }); } const dir = T < p.s ? -1 : 1; st.anchor = T; updTitle(dir); swap(paneHTML(), 'slide', dir); }
      function updTitle(dir) { const t = h2.querySelector('[data-ptitle]'); header(); if (!t) return; t.textContent = period().title; GX.animate(t, [{ opacity: 0, transform: `translateX(${dir * 10}px)` }, { opacity: 1, transform: 'none' }], { spring: 'soft' }); }
      function setView(v) { if (v === st.view) return; const dir = v === 'month' ? 1 : -1; st.view = v; GX.store.set('mat.view', v); const sg = h2.querySelector('[data-view]'); if (sg) { sg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v)); GX.ui.refresh(sg.parentElement); } updTitle(dir); swap(paneHTML(), 'zoom', dir); }
      function switchTab(t) { if (t === st.tab) return; const dir = t === 'inv' ? 1 : -1; st.tab = t; GX.store.set('mat.tab', t); const tabs = $('[data-tabs]'), b = tabs.querySelector(`[data-v="${t}"]`); if (b.getAttribute('aria-selected') !== 'true') { tabs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', x === b)); GX.ui.refresh(tabs.parentElement); } closePanel(); render(dir); }

      /* ---------- Panneau latéral ---------- */
      function closePanel() {
        if (!pnl) return; const p = pnl; pnl = null;
        side.classList.remove('on'); p.cleanup();
        setTimeout(() => { if (!pnl) side.innerHTML = ''; }, 380);
      }
      function panel({ icon, title, body: html, foot }) {
        closePanel();
        side.innerHTML = `<div class="mat-side-in"><div class="mat-side-h"><span class="ic">${GX.icon(icon)}</span><h3 class="ellipsis">${title}</h3><button class="icon-btn" data-pclose data-tip="Fermer (Échap)">${GX.icon('close')}</button></div>
          <div class="mat-side-b scroll">${html}</div><div class="mat-side-f">${foot}</div></div>`;
        const el = side.firstElementChild;
        requestAnimationFrame(() => side.classList.add('on'));
        const key = (e) => { if (e.key === 'Escape' && !e.target.closest('.menu')) { e.stopPropagation(); closePanel(); } };
        const clk = (e) => { if (e.target.closest('[data-pclose]')) closePanel(); };
        el.addEventListener('keydown', key); el.addEventListener('click', clk);
        pnl = { el, cleanup: () => { el.removeEventListener('keydown', key); el.removeEventListener('click', clk); } };
        setTimeout(() => el.querySelector('input:not([disabled]),textarea')?.focus({ preventScroll: true }), 80);
        return pnl;
      }

      /* ---------- Réservation : champs et contrôles de la vraie modale ---------- */
      function openBooking(pre = {}) {
        const edit = pre.edit ? D.BOOKINGS.find((x) => x.id === pre.edit) : null;
        if (!canBook()) return edit ? quick(edit) : hud('Lecture seule');
        if (!D.EQUIPMENT.length) return hud('Ajoutez d’abord du matériel dans l’Inventaire');
        const T = GX.iso(GX.today());
        /* Valeurs par défaut de la vraie page : site GROUPE BONY, service Tous Services, marque Holding (champ caché) */
        const v = edit ? { ...edit } : { eq: pre.eq || st.eq || D.EQUIPMENT[0].id, start: pre.start || T, end: pre.end || pre.start || T, qty: 1, site: 'GROUPE BONY', service: 'Tous Services', brand: 'Holding', note: '' };
        const p = panel({ icon: edit ? 'edit' : 'plus', title: edit ? 'Modifier la réservation' : 'Nouvelle réservation',
          body: `<div class="form-grid">
            <label class="field full"><span class="label">Matériel</span><select class="select" data-f="eq" ${edit ? 'disabled' : ''}>${D.EQUIPMENT.map((e) => `<option value="${e.id}" ${v.eq === e.id ? 'selected' : ''}>${GX.esc(e.name)} (Total: ${e.qty})</option>`).join('')}</select></label>
            <label class="field"><span class="label">Date de début</span><input type="date" class="input" data-f="start" value="${v.start}" /></label>
            <label class="field"><span class="label">Date de fin</span><input type="date" class="input" data-f="end" value="${v.end}" /></label>
            <label class="field full"><span class="row"><span class="label grow">Quantité</span><span class="mat-dispo num" data-dispo></span></span><input type="number" class="input num mat-qty" data-f="qty" min="1" value="${v.qty}" /></label>
            <label class="field"><span class="label">Site</span><select class="select" data-f="site">${siteOptions(v.site)}</select></label>
            <label class="field"><span class="label">Service</span><select class="select" data-f="service">${SERVICES.map((s) => `<option ${v.service === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
            <div class="field full"><span class="label" data-striplbl>Disponibilité jour par jour</span><div class="mat-strip" data-strip></div></div>
            <label class="field full"><span class="label">Description / Détail OP</span><textarea class="textarea" data-f="note" placeholder="Détails de l'événement..." style="min-height:96px;resize:none">${GX.esc(v.note || '')}</textarea></label>
            <div class="full mat-err hide" data-err></div>
          </div>`,
          foot: `${edit ? '<span class="mat-del" data-delz><button class="btn ghost danger" data-delask>Supprimer</button></span>' : ''}<button class="btn" data-pclose>Annuler</button><button class="btn primary" data-save>Enregistrer</button>` });
        const el = p.el, f = (k) => el.querySelector(`[data-f="${k}"]`);
        const read = () => ({ eq: f('eq').value, start: f('start').value, end: f('end').value, qty: parseInt(f('qty').value, 10) || 0, site: f('site').value, service: f('service').value, note: f('note').value.trim() });
        const err = (m) => { const x = el.querySelector('[data-err]'); x.innerHTML = m ? `${GX.icon('alert', 'sm')}${m}` : ''; x.classList.toggle('hide', !m); };
        function upd() {
          const r = read(), eq = eqOf(r.eq), ok = r.eq && r.start && r.end, dispo = ok ? avail(r.eq, r.start, r.end < r.start ? r.start : r.end, edit?.id) : null;
          const b = el.querySelector('[data-dispo]');
          b.textContent = dispo === null ? '' : `Disponible : ${dispo}`; b.style.color = dispo === 0 ? 'var(--danger)' : 'var(--ok)';
          if (dispo !== null) f('qty').max = String(dispo); f('qty').classList.toggle('over', dispo !== null && r.qty > dispo);
          const days = []; if (ok) for (let d = r.start, n = 0; d <= r.end && n < 62; d = isoAdd(d, 1), n++) days.push(d);
          el.querySelector('[data-strip]').innerHTML = days.map((d) => { const used = usedOn(r.eq, d, edit?.id), free = eq.qty - used; return `<i class="${free <= 0 ? 'full' : free < r.qty ? 'low' : ''}" style="height:${Math.max(12, (Math.max(0, free) / eq.qty) * 100)}%" data-tip="${F.dateLong(P(d))} : ${Math.max(0, free)} / ${eq.qty} disponible${free > 1 ? 's' : ''}"></i>`; }).join('');
          el.querySelector('[data-striplbl]').textContent = `Disponibilité jour par jour · ${eq.name}${days.length ? ` · ${days.length} jour${days.length > 1 ? 's' : ''}` : ''}`;
          if (dispo !== null && r.qty <= dispo) err('');
        }
        el.addEventListener('input', (e) => { if (e.target.matches('[data-f="start"]') && f('end').value && f('end').value < f('start').value) f('end').value = f('start').value; upd(); });
        el.addEventListener('change', (e) => {
          /* Comme la vraie saisie : une quantité au-delà du disponible est refusée (ramenée au disponible) */
          if (e.target.matches('[data-f="qty"]')) { const r = read(), dispo = avail(r.eq, r.start, r.end, edit?.id); let q = parseInt(f('qty').value, 10) || 1; if (q > dispo && dispo > 0) { q = dispo; GX.animate(el.querySelector('[data-dispo]'), [{ transform: 'scale(1.2)' }, { transform: 'none' }], { spring: 'bouncy' }); } f('qty').value = Math.max(1, q); }
          upd();
        });
        el.querySelector('[data-save]').addEventListener('click', () => {
          const r = read(), eq = eqOf(r.eq);
          if (!r.eq || !r.start || !r.end || !r.qty) return err('Veuillez remplir tous les champs obligatoires.');
          if (r.end < r.start) return err('La date de fin doit être postérieure ou égale à la date de début.');
          const dispo = avail(r.eq, r.start, r.end, edit?.id);
          if (r.qty > dispo) { err(`Stock insuffisant ! Disponible : ${dispo} / ${eq.qty}`); GX.animate(el, [{ transform: 'none' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'none' }], { duration: 420, easing: 'ease-out' }); return; }
          if (edit) { Object.assign(edit, { ...r, eq: edit.eq }); hud('Réservation modifiée'); }
          else {
            const b = { id: GX.uid('b'), ...r, brand: 'Holding' }; D.BOOKINGS.push(b);
            GX.shell?.notify?.({ app: 'material', u: 'me', title: 'Réservation créée', body: `${b.qty}x ${eq.name} · ${range(b.start, b.end)} · ${b.site} · ${b.service}`, onClick: () => { GX.wm?.open?.('material'); }, silent: true });
            if (!st.eq || st.eq === b.eq) { const pp = period(); if (P(b.start) >= pp.e || P(b.end) < pp.s) st.anchor = P(b.start); }
          }
          closePanel(); afterChange();
        });
        /* Suppression : confirmation EN LIGNE (« Confirmer ? OUI / NON ») comme la vraie modale */
        el.addEventListener('click', (e) => {
          const z = el.querySelector('[data-delz]'); if (!z) return;
          if (e.target.closest('[data-delask]')) { z.innerHTML = `<span>Confirmer ?</span><button class="btn sm yes" data-delyes>Oui</button><button class="btn sm ghost" data-delno>Non</button>`; GX.animate(z, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); }
          if (e.target.closest('[data-delno]')) z.innerHTML = '<button class="btn ghost danger" data-delask>Supprimer</button>';
          if (e.target.closest('[data-delyes]')) { D.BOOKINGS.splice(D.BOOKINGS.indexOf(edit), 1); closePanel(); afterChange(); hud('Réservation supprimée'); }
        });
        if (pre.askDelete) el.querySelector('[data-delask]')?.click();
        upd();
      }
      function afterChange() {
        if (st.tab !== 'planning') return refresh();
        const t = h2.querySelector('[data-ptitle]'); if (t && t.textContent !== period().title) { updTitle(1); swap(paneHTML(), 'slide', 1); } else inPlace(true);
      }
      function quick(b, origin) {
        const eq = eqOf(b.eq);
        GX.shell?.quickLook?.({ title: `${b.qty}x ${eq.name}`, origin, html: `<div style="display:grid;gap:10px"><div class="row wrap">${GX.r.service(b.service)}${eq.cat ? `<span class="badge">${GX.esc(eq.cat)}</span>` : ''}</div>
          <div class="row" style="gap:10px"><div class="card pad grow"><div class="label">Période</div><b>${range(b.start, b.end)}</b></div><div class="card pad grow"><div class="label">Site</div><b>${GX.esc(b.site)}</b></div></div>
          ${b.note ? `<div class="muted">${GX.esc(b.note)}</div>` : ''}</div>` });
      }

      /* ---------- Inventaire : champs de la vraie modale (Nom, Catégorie en texte libre, Quantité Totale) ---------- */
      function openEquipment(id) {
        if (!isManager()) return;
        const e = id ? eqOf(id) : null, cats = [...new Set(D.EQUIPMENT.map((x) => x.cat).filter(Boolean))];
        const p = panel({ icon: e ? 'edit' : 'material', title: e ? 'Modifier le matériel' : 'Nouveau matériel',
          body: `<div class="form-grid">
            <label class="field full"><span class="label">Nom du matériel</span><input class="input" data-f="name" value="${GX.esc(e?.name || '')}" placeholder="Ex: Enceinte JBL" /></label>
            <label class="field full"><span class="label">Catégorie</span><input class="input" data-f="cat" list="matCats" value="${GX.esc(e ? e.cat || '' : 'Autre')}" placeholder="Ex: Son, Mobilier, PLV..." /><datalist id="matCats">${cats.map((c) => `<option value="${GX.esc(c)}">`).join('')}</datalist></label>
            <label class="field"><span class="label">Quantité Totale</span><input type="number" class="input num" data-f="qty" min="1" value="${e?.qty || 1}" /></label>
            <div class="full mat-err hide" data-err></div>
          </div>`,
          foot: '<button class="btn" data-pclose>Annuler</button><button class="btn primary" data-save>Enregistrer</button>' });
        const el = p.el, f = (k) => el.querySelector(`[data-f="${k}"]`);
        el.querySelector('[data-save]').addEventListener('click', () => {
          const name = f('name').value.trim(), cat = f('cat').value.trim(), qty = parseInt(f('qty').value, 10) || 0;
          if (!name || !qty) { const x = el.querySelector('[data-err]'); x.innerHTML = `${GX.icon('alert', 'sm')}Veuillez remplir le nom et la quantité.`; x.classList.remove('hide'); return; }
          if (e) Object.assign(e, { name, cat, qty }); else D.EQUIPMENT.push({ id: GX.uid('eq'), name, cat, qty });
          closePanel(); refresh(); hud(e ? 'Matériel modifié' : 'Matériel ajouté');
        });
      }
      function deleteEquipment(id) {
        if (!isManager()) return; const e = eqOf(id), n = D.BOOKINGS.filter((b) => b.eq === id).length;
        win.sheet(`<h3>Supprimer « ${GX.esc(e.name)} » ?</h3><div class="muted">Êtes-vous sûr de vouloir supprimer ce matériel ? Les réservations liées seront aussi supprimées${n ? ` (${n} réservation${n > 1 ? 's' : ''})` : ''}.</div>
          <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" style="background:var(--danger)">Supprimer</button></div>`, {
          onClose: (v) => { if (v !== 'ok') return; D.EQUIPMENT.splice(D.EQUIPMENT.indexOf(e), 1); for (let i = D.BOOKINGS.length - 1; i >= 0; i--) if (D.BOOKINGS[i].eq === id) D.BOOKINGS.splice(i, 1); if (st.eq === id) st.eq = ''; closePanel(); refresh(); hud('Matériel supprimé'); },
        });
      }

      /* ---------- Gestes du planning (raccourcis de la maquette) ---------- */
      const cellAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('[data-stage] .mat-pane:not(.out) [data-d]');
      const hl = (a, b, cls) => { const p = curPane(); if (!p) return; ['sel', 'tgt', 'bad'].forEach((c) => c !== cls && p.querySelectorAll('.' + c).forEach((x) => x.classList.remove(c))); p.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle(cls, !!cls && x.dataset.d >= a && x.dataset.d <= b)); };
      function startCreate(e, cell) {
        const a = cell.dataset.d; let b = a, moved = false;
        if (e.pointerType === 'touch') { const up0 = () => { removeEventListener('pointerup', up0); openBooking({ start: a, end: a }); }; addEventListener('pointerup', up0, { once: true }); return; }
        e.preventDefault(); stage().classList.add('dragging'); hl(a, a, 'sel');
        const mv = (ev) => { const c = cellAt(ev.clientX, ev.clientY); if (c && c.dataset.d !== b) { b = c.dataset.d; moved = true; hl(a < b ? a : b, a < b ? b : a, 'sel'); } };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); stage()?.classList.remove('dragging'); const s = a < b ? a : b, en = a < b ? b : a; setTimeout(() => hl('', '', null), moved ? 500 : 0); openBooking({ start: s, end: en }); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      }
      function startMove(e, bar) {
        const b = D.BOOKINGS.find((x) => x.id === bar.dataset.bk); if (!b) return;
        const sx = e.clientX, sy = e.clientY, can = canEditBooking(b) && e.pointerType !== 'touch';
        let moved = false, off = 0, ok = true, grab = null;
        const mv = (ev) => {
          if (!can) return;
          if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
          if (!moved) { moved = true; bar.classList.add('lift'); stage().classList.add('dragging'); grab = cellAt(sx, sy)?.dataset.d || b.start; }
          const c = cellAt(ev.clientX, ev.clientY); if (!c) return;
          off = diff(P(c.dataset.d), P(grab)); const ns = isoAdd(b.start, off), ne = isoAdd(b.end, off);
          ok = off === 0 || avail(b.eq, ns, ne, b.id) >= b.qty; hl(ns, ne, ok ? 'tgt' : 'bad');
        };
        const up = () => {
          removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
          stage()?.classList.remove('dragging'); bar.classList.remove('lift'); hl('', '', null);
          if (!moved) return canEditBooking(b) ? openBooking({ edit: b.id }) : quick(b, bar);
          if (!off) return;
          const ns = isoAdd(b.start, off), ne = isoAdd(b.end, off), eq = eqOf(b.eq);
          if (!ok) { const dispo = avail(b.eq, ns, ne, b.id); GX.animate(bar, [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'none' }], { duration: 380, easing: 'ease-out' }); return hud(`Stock insuffisant ! Disponible : ${dispo} / ${eq.qty}`); }
          b.start = ns; b.end = ne; inPlace(true); hud(`Déplacée : ${range(ns, ne)}`);
        };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
        if (can) e.preventDefault();
      }

      /* ---------- Câblage ---------- */
      $('[data-tabs]').addEventListener('change', (e) => switchTab(e.detail));
      $('[data-acts]').addEventListener('click', (e) => { if (e.target.closest('[data-book]')) openBooking(); if (e.target.closest('[data-addeq]')) openEquipment(); });
      h2.addEventListener('click', (e) => {
        const n = e.target.closest('[data-nav]'); if (n) return nav(+n.dataset.nav);
        if (e.target.closest('[data-today]')) return goToday();
        const ep = e.target.closest('[data-eqpick]'); if (ep) return openEqPick(ep);
      });
      h2.addEventListener('change', (e) => { if (e.target.closest?.('[data-view]')) setView(e.detail); });
      main.addEventListener('click', (e) => {
        const ad = e.target.closest('[data-add]'); if (ad) return openBooking({ start: ad.dataset.add, end: ad.dataset.add });
        const bl = e.target.closest('[data-bkl]'); if (bl) { const b = D.BOOKINGS.find((x) => x.id === bl.dataset.bkl); return canEditBooking(b) ? openBooking({ edit: b.id }) : quick(b, bl); }
        const mo = e.target.closest('[data-more]'); if (mo) { const iso = mo.dataset.more, list = items().filter((it) => it.b.start <= iso && it.b.end >= iso); return GX.menu.open([{ header: cap(F.dateLong(P(iso))) }, ...list.map((it) => ({ label: `${it.b.qty}x ${eqOf(it.b.eq).name} · ${it.b.site}`, action: () => (canEditBooking(it.b) ? openBooking({ edit: it.b.id }) : quick(it.b, mo)) })), ...(canBook() ? ['-', { label: 'Réserver ce jour…', icon: 'plus', action: () => openBooking({ start: iso, end: iso }) }] : [])], mo); }
        const ed = e.target.closest('[data-editeq]'); if (ed) return openEquipment(ed.dataset.editeq);
        const dl = e.target.closest('[data-deleq]'); if (dl) return deleteEquipment(dl.dataset.deleq);
        const row = e.target.closest('[data-eqrow]'); if (row) { st.eq = row.dataset.eqrow; return switchTab('planning'); }
      });
      main.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || compact || st.tab !== 'planning' || !e.target.closest('[data-stage]')) return;
        const bar = e.target.closest('[data-bk]'); if (bar) return startMove(e, bar);
        const cell = e.target.closest('[data-d]'); if (cell && canBook()) startCreate(e, cell);
      });
      main.addEventListener('contextmenu', (e) => {
        const bar = e.target.closest('[data-bk]'), row = e.target.closest('[data-eqrow]');
        if (bar) { e.preventDefault(); const b = D.BOOKINGS.find((x) => x.id === bar.dataset.bk), okE = canEditBooking(b); GX.menu.open([{ header: `${b.qty}x ${eqOf(b.eq).name}` }, { label: 'Aperçu rapide', icon: 'quicklook', action: () => quick(b, bar) }, { label: 'Modifier…', icon: 'edit', disabled: !okE, action: () => openBooking({ edit: b.id }) },
          { label: `Voir seulement « ${eqOf(b.eq).name} »`, icon: 'filter', action: () => { st.eq = b.eq; toolbar(); inPlace(true); } }, '-', { label: 'Supprimer…', icon: 'trash', disabled: !okE, action: () => openBooking({ edit: b.id, askDelete: true }) }], { x: e.clientX, y: e.clientY }); }
        else if (row) { e.preventDefault(); const id = row.dataset.eqrow; GX.menu.open([{ label: 'Réserver…', icon: 'plus', disabled: !canBook(), action: () => { switchTab('planning'); openBooking({ eq: id }); } }, { label: 'Voir le planning', icon: 'agenda', action: () => { st.eq = id; switchTab('planning'); } }, '-', { label: 'Modifier…', icon: 'edit', disabled: !isManager(), action: () => openEquipment(id) }, { label: 'Supprimer…', icon: 'trash', disabled: !isManager(), action: () => deleteEquipment(id) }], { x: e.clientX, y: e.clientY }); }
      });
      body.tabIndex = -1;
      body.addEventListener('keydown', (e) => {
        if (e.target.closest('input,textarea,select,.mat-side') || st.tab !== 'planning' || e.ctrlKey || e.metaKey) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); } if (e.key === 'ArrowRight') { e.preventDefault(); nav(1); }
        if (e.key === 't' || e.key === 'T') goToday();
      });

      /* ---------- Adaptatif ---------- */
      let raf = 0;
      const ro2 = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const c = body.clientWidth < 600; GX.ui.refresh(body);
          if (c !== compact) { compact = c; if (st.tab === 'planning' && curPane()) inPlace(false); return; }
          if (!compact && st.tab === 'planning' && st.view === 'month' && stage()) { const p = period(), weeks = Math.round(diff(p.e, p.s) / 7), fit = Math.max(1, Math.floor(((stage().clientHeight - 31) / weeks - 33) / 24)); if (fit !== lastFit) inPlace(false); }
        });
      });
      compact = body.clientWidth > 0 && body.clientWidth < 600;
      render();
      ro2.observe(body); ro2.observe(main);
      const off = [GX.on('ctx', () => { closePanel(); render(); })];

      return {
        destroy() { ro2.disconnect(); off.forEach((o) => o()); GX.ui.closePick(); closePanel(); },
        command(c) { if (c === 'book') { if (st.tab !== 'planning') switchTab('planning'); openBooking(); } },
        menus: () => ({
          'Fichier': [{ label: 'Réserver du matériel…', icon: 'plus', disabled: !canBook(), action: () => { if (st.tab !== 'planning') switchTab('planning'); openBooking(); } }, { label: 'Ajouter matériel…', icon: 'material', disabled: !isManager(), action: () => { switchTab('inv'); openEquipment(); } }],
          'Présentation': [{ label: 'Planning', checked: st.tab === 'planning', action: () => switchTab('planning') }, { label: 'Inventaire', checked: st.tab === 'inv', action: () => switchTab('inv') }, '-',
            { label: 'Semaine', checked: st.view === 'week', disabled: st.tab !== 'planning', action: () => setView('week') }, { label: 'Mois', checked: st.view === 'month', disabled: st.tab !== 'planning', action: () => setView('month') }, '-',
            { label: 'Aujourd’hui', icon: 'agenda', kbd: 'T', disabled: st.tab !== 'planning', action: goToday }, { label: 'Tout le matériel', checked: !st.eq, disabled: st.tab !== 'planning', action: () => { st.eq = ''; toolbar(); inPlace(true); } }],
        }),
      };
    },
  });
})();
