/* =====================================================================
   Rubrique « Agenda » (miroir de pages/Agenda.tsx)
   - affiche les PROJETS (jamais les brouillons) en barres multi-jours,
     liseré à la couleur du SERVICE (SERVICE_COLOR)
   - vues Semaine / Mois (grille LUN…DIM) et Trimestre / Semestre / Année
     (frise par mois) ; les barres qui se chevauchent sont rangées en
     COULOIRS : jamais deux barres l'une sur l'autre
   - transitions : glissement horizontal entre périodes (flèches, ← →,
     balayage au doigt ou au pavé tactile), zoom entre vues (clic sur un
     jour du mois → sa semaine, clic sur un mois de la frise → ce mois)
   - lecture seule ; chef de site : seulement les projets de son site
   - fenêtre étroite / téléphone : liste chronologique
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt, DAY = 864e5;
  GX.css(`
  .agd-h .ah-t{flex:1 1 auto;min-width:0}
  .agd-h h1{overflow:hidden;text-overflow:ellipsis}
  .agd-nav{display:flex;align-items:center;gap:2px}
  .agd-seg .s{display:none}
  .agd-sep{background:var(--line-2)}
  .agd-lgs{display:flex;flex-wrap:wrap;gap:5px}
  .agd-lg{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 12px;border-radius:10px;color:var(--text);font-weight:600;font-size:var(--fs-13);box-shadow:inset 0 0 0 1px var(--line-2);transition:background var(--t-fast),box-shadow var(--t-fast)}
  .agd-lg:hover{background:var(--surface-3)}
  .agd-lg i{width:12px;height:12px;border-radius:4px;background:var(--cv)}
  .agd-lg[aria-pressed="true"]{background:color-mix(in srgb,var(--cv) 22%,transparent);box-shadow:inset 0 0 0 1.5px var(--cv)}
  .agd-sub .agd-cntw{margin-left:auto}
  .agd-cnt{display:flex;align-items:baseline;gap:8px;height:36px;color:var(--text-2);font-weight:600;white-space:nowrap;font-size:var(--fs-13)}
  .agd-cnt b{font-size:22px;color:var(--text);letter-spacing:-.02em}
  .agd-ftog .count{margin-left:2px}
  /* Le calendrier : une carte détachée du fond, pleine largeur */
  .agd-stage{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:pan-y;margin:0 22px 22px;border:1px solid var(--line-2);border-radius:14px;background:var(--surface-1)}
  .agd-pane{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--surface-1);z-index:1;will-change:transform}
  .agd-none{padding:6px 14px 10px;color:var(--text-3);font-style:italic}
  .agd-pane.out{pointer-events:none;z-index:0}
  .agd-7{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}

  /* Barres */
  /* --c = couleur de service (donnée) ; --cv = variante lisible selon le thème (éclaircie en sombre) */
  .agd{--mixb:36%}
  .agd [style*="--c:"]{--cv:color-mix(in srgb,var(--c) 62%,#fff)}
  :root[data-theme="light"] .agd{--mixb:22%}
  :root[data-theme="light"] .agd [style*="--c:"]{--cv:var(--c)}
  .agd-bar{position:relative;display:flex;flex-direction:column;justify-content:center;gap:3px;min-width:0;overflow:hidden;text-align:left;border-radius:9px;padding:0 9px 0 12px;
    background:color-mix(in srgb,var(--c) var(--mixb),var(--surface-2));color:var(--text);
    box-shadow:inset 4px 0 0 var(--cv),inset 0 0 0 1px color-mix(in srgb,var(--cv) 45%,transparent);
    transition:transform var(--t-fast) var(--ease-out),filter var(--t-fast),box-shadow var(--t-fast)}
  .agd-bar:hover{filter:brightness(1.1);box-shadow:inset 4px 0 0 var(--cv),inset 0 0 0 1.5px var(--cv),var(--shadow-1);z-index:2}
  .agd-bar:active{transform:scale(.97)}
  .agd-bar.cl{border-top-left-radius:2px;border-bottom-left-radius:2px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--cv) 45%,transparent)}
  .agd-bar.cr{border-top-right-radius:2px;border-bottom-right-radius:2px}
  .agd-bar .n{font-weight:700;font-size:var(--fs-14);display:flex;align-items:center;gap:5px;min-width:0}
  .agd-bar .n svg.i{color:var(--ok)}
  .agd-bar .m{font-size:var(--fs-12);color:var(--text-2)}
  .agd-pr{display:flex;align-items:center;gap:7px;font-size:var(--fs-12);color:var(--text-2);min-width:0}
  .agd-pr .bar{flex:1;min-width:24px;height:5px;background:color-mix(in srgb,var(--c) 22%,var(--surface-3))}
  .agd-pr .bar > i,.agd-li .bar > i{background:var(--cv)}
  .agd-pr b{color:var(--text)}

  /* Semaine */
  .agd-dh{border-bottom:1px solid var(--line);flex:none}
  .agd-dhc{display:flex;align-items:center;gap:7px;padding:10px 10px 9px;min-width:0;border-left:1px solid var(--line)}
  .agd-dhc:first-child{border-left:0}
  .agd-dhc span{font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--text-3)}
  .agd-dhc b{font-size:19px;font-weight:600;letter-spacing:-.02em;min-width:30px;height:30px;display:grid;place-items:center;border-radius:99px}
  .agd-dhc.we b{color:var(--text-3)}
  .agd-dhc.today span{color:var(--accent)}
  .agd-dhc.today b{background:var(--accent);color:#fff;box-shadow:0 4px 12px -4px var(--accent)}
  .agd-dhc .hol{font-size:11.5px;font-weight:700;color:var(--accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .agd-wbody{flex:1;min-height:0}
  .agd-wrap{position:relative;min-height:100%}
  .agd-cols{position:absolute;inset:0;pointer-events:none}
  .agd-cols > i{border-left:1px solid var(--line)} .agd-cols > i:first-child{border-left:0}
  .agd-cols > i.we{background:color-mix(in srgb,var(--surface-3) 38%,transparent)}
  .agd-cols > i.today{background:color-mix(in srgb,var(--accent) 7%,transparent)}
  .agd-wl{position:relative;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-auto-rows:74px;row-gap:6px;padding:10px 0 24px}
  .agd-wl .agd-bar{margin:0 4px}

  /* Mois */
  .agd-mh{border-bottom:1px solid var(--line);flex:none}
  .agd-mh span{padding:7px 10px;font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--text-3);text-align:right}
  .agd-mg{flex:1;min-height:0;display:grid;grid-template-rows:repeat(var(--weeks),minmax(0,1fr))}
  .agd-mr{position:relative;min-height:0;border-bottom:1px solid var(--line);overflow:hidden}
  .agd-mr:last-child{border-bottom:0}
  .agd-mbg{position:absolute;inset:0}
  .agd-mc{border-left:1px solid var(--line);padding:4px 5px;display:flex;justify-content:flex-end;align-items:flex-start;gap:4px}
  .agd-mc:first-child{border-left:0}
  .agd-mc.we{background:color-mix(in srgb,var(--surface-3) 38%,transparent)}
  .agd-dn{height:22px;min-width:22px;padding:0 6px;border-radius:99px;font-weight:600;font-size:13px;white-space:nowrap;transition:background var(--t-fast)}
  .agd-dn:hover{background:var(--surface-3)}
  .agd-mc.out .agd-dn{color:var(--text-3)}
  .agd-mc.hol .agd-dn{color:var(--accent)}
  .agd-mc.today .agd-dn{background:var(--accent);color:#fff}
  .agd-mb{position:absolute;left:0;right:0;top:29px;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-auto-rows:22px;row-gap:2px;pointer-events:none}
  .agd-mb > *{pointer-events:auto}
  .agd-bar.mo{border-radius:5px;padding:0 6px 0 9px;font-size:12.5px;font-weight:650;margin:0 3px;white-space:nowrap}
  .agd-bar.mo.cl{margin-left:0}.agd-bar.mo.cr{margin-right:0}
  .agd-more{margin:0 3px;padding:0 6px;border-radius:5px;font-size:12px;font-weight:700;color:var(--text-2);text-align:left;white-space:nowrap;overflow:hidden}
  .agd-more:hover{background:var(--surface-3);color:var(--text)}

  /* Frise */
  .agd-fh{position:relative;height:42px;flex:none;border-bottom:1px solid var(--line)}
  .agd-fm{position:absolute;top:0;bottom:0;border-left:1px solid var(--line);padding:5px 10px;text-align:left;font-weight:700;font-size:13px;overflow:hidden;white-space:nowrap;transition:background var(--t-fast)}
  .agd-fm:first-child{border-left:0}
  .agd-fm small{display:block;font-weight:500;color:var(--text-3);font-size:11.5px}
  .agd-fm:hover{background:var(--surface-3)}
  .agd-fm.cur{color:var(--accent)}
  .agd-fb{flex:1;min-height:0}
  .agd-fbg{position:absolute;inset:0;pointer-events:none}
  .agd-fbg > i{position:absolute;top:0;bottom:0;border-left:1px solid var(--line)}
  .agd-fbg > i.alt{background:color-mix(in srgb,var(--surface-3) 22%,transparent)}
  .agd-fbg > i.we{border:0;background:color-mix(in srgb,var(--surface-3) 30%,transparent)}
  .agd-now{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:var(--accent);z-index:3;pointer-events:none;border-radius:2px}
  .agd-now::before{content:"";position:absolute;top:2px;left:-3px;width:8px;height:8px;border-radius:50%;background:var(--accent)}
  .agd-fl{position:relative;margin:12px 0 26px}
  .agd-bar.fr{position:absolute;height:28px;flex-direction:row;align-items:center;justify-content:flex-start;gap:6px;border-radius:7px;font-size:13px;font-weight:650;padding:0 7px 0 9px;white-space:nowrap}
  .agd-bar.fr .pc{margin-left:auto;font-size:12px;color:var(--text-2);flex:none}

  /* Liste (compact) */
  .agd-list{padding:0 12px 28px}
  .agd-lh{position:sticky;top:0;z-index:1;display:flex;align-items:baseline;gap:8px;padding:14px 4px 7px;background:var(--surface-1);font-weight:700}
  .agd-lh .faint{font-weight:500;font-size:13px}
  .agd-lh.today{color:var(--accent)}
  .agd-li{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px 10px 14px;margin-bottom:6px;border-radius:12px;text-align:left;
    background:color-mix(in srgb,var(--c) calc(var(--mixb) - 10%),var(--surface-2));box-shadow:inset 4px 0 0 var(--cv),inset 0 0 0 1px var(--line);transition:transform var(--t-fast) var(--ease-out)}
  .agd-li:active{transform:scale(.98)}
  .agd-li .bar{width:54px;height:5px;margin-top:5px}

  .agd-empty{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:8px;text-align:center;color:var(--text-3);pointer-events:none;padding:20px}
  .agd-empty svg.i{width:34px;height:34px;stroke-width:1.4}
  .agd-empty b{color:var(--text);font-size:14px}
  .agd-empty .btn{pointer-events:auto;margin-top:4px}

  @container app (max-width:720px){
    .agd-seg .l{display:none}.agd-seg .s{display:inline}
    .agd-h .ah-f{width:auto;margin-left:auto}
    .agd-dhc{flex-direction:column;gap:2px;padding:8px 2px}.agd-dhc .hol{display:none}
    .agd-sub .agd-lgw,.agd-sub .agd-sep{display:none}
    .agd-sub .agd-cntw{margin-left:0}
    .agd-stage{margin:0 10px 10px}
  }
  @container app (max-width:460px){
    .agd-h .ah-t{flex-basis:100%}
    .agd-ftog .lbl{display:none}
    .agd-sub > div:has(> .picker-btn){flex:1 1 40%;min-width:0}.agd-sub .picker-btn{width:100%}
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
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MSHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const DOW = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const isoWeek = (d) => { const t = addD(d, 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(t.getFullYear(), 0, 4); return 1 + Math.round((diff(t, w1) - 3 + ((w1.getDay() + 6) % 7)) / 7); };
  const easter = (y) => { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31); return new Date(y, mo - 1, ((h + l - 7 * m + 114) % 31) + 1); };
  const HOLS = {};
  const holiday = (d) => {
    const y = d.getFullYear();
    HOLS[y] ??= (() => { const E = easter(y), o = {}; [[new Date(y, 0, 1), 'Jour de l’an'], [addD(E, 1), 'Lundi de Pâques'], [new Date(y, 4, 1), 'Fête du Travail'], [new Date(y, 4, 8), 'Victoire 1945'], [addD(E, 39), 'Ascension'], [addD(E, 50), 'Lundi de Pentecôte'], [new Date(y, 6, 14), 'Fête nationale'], [new Date(y, 7, 15), 'Assomption'], [new Date(y, 10, 1), 'Toussaint'], [new Date(y, 10, 11), 'Armistice'], [new Date(y, 11, 25), 'Noël']].forEach(([x, n]) => (o[GX.iso(x)] = n)); return o; })();
    return HOLS[y][GX.iso(d)];
  };

  /* ---------------- Vues ---------------- */
  const VIEWS = { week: { l: 'Semaine', s: 'Sem.' }, month: { l: 'Mois', s: 'Mois' }, quarter: { l: 'Trimestre', s: 'Trim.', n: 3 }, semester: { l: 'Semestre', s: '6 mois', n: 6 }, year: { l: 'Année', s: 'An' } };
  const ORDER = Object.keys(VIEWS);
  const BRAND_F = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize', 'Holding'];
  const SERVICE_F = [...D.SERVICES, 'Tous Services'];

  function period(view, a) {
    if (view === 'week') {
      const s = monday(a), e6 = addD(s, 6);
      const title = s.getMonth() === e6.getMonth() ? `${s.getDate()} – ${e6.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`
        : s.getFullYear() === e6.getFullYear() ? `${s.getDate()} ${MSHORT[s.getMonth()]} – ${e6.getDate()} ${MSHORT[e6.getMonth()]} ${s.getFullYear()}`
        : `${s.getDate()} ${MSHORT[s.getMonth()]} ${s.getFullYear()} – ${e6.getDate()} ${MSHORT[e6.getMonth()]} ${e6.getFullYear()}`;
      return { s, e: addD(s, 7), kicker: `Semaine ${isoWeek(s)}`, title };
    }
    if (view === 'month') {
      const m0 = new Date(a.getFullYear(), a.getMonth(), 1), m1 = addM(m0, 1);
      return { s: monday(m0), e: addD(monday(addD(m1, -1)), 7), m0, m1, kicker: 'Mois', title: `${cap(MONTHS[m0.getMonth()])} ${m0.getFullYear()}` };
    }
    if (view === 'year') { const y = a.getFullYear(); return { s: new Date(y, 0, 1), e: new Date(y + 1, 0, 1), kicker: 'Janvier → décembre', title: `Année ${y}` }; }
    /* Comme pages/Agenda.tsx : le trimestre est CALENDAIRE (janv., avr., juil., oct.) et le semestre
       commence en janvier ou en juillet — jamais au mois courant. */
    const n = VIEWS[view].n, s = new Date(a.getFullYear(), Math.floor(a.getMonth() / n) * n, 1), last = addM(s, n - 1);
    return { s, e: addM(s, n), kicker: `${cap(MONTHS[s.getMonth()])}${s.getFullYear() !== last.getFullYear() ? ' ' + s.getFullYear() : ''} → ${MONTHS[last.getMonth()]} ${last.getFullYear()}`,
      title: `${view === 'quarter' ? 'Trimestre' : 'Semestre'} · début ${MONTHS[s.getMonth()]} ${s.getFullYear()}` };
  }
  /* Avancer d'une période ; si la période visée contient aujourd'hui, on s'y ancre */
  function shift(a, view, dir) {
    let n;
    if (view === 'week') n = addD(a, 7 * dir);
    else if (view === 'month') n = addM(a, dir);
    else if (view === 'year') n = new Date(a.getFullYear() + dir, 0, 1);
    else { const k = VIEWS[view].n; n = addM(new Date(a.getFullYear(), Math.floor(a.getMonth() / k) * k, 1), dir * k); }
    const T = GX.today(), p = period(view, n);
    return T >= p.s && T < p.e && view !== 'week' ? T : n;
  }

  /* Rangement en couloirs : une barre prend le premier couloir libre.
     minSpan = largeur visuelle minimale (en jours) pour la frise. */
  function pack(items, s0, e0, minSpan = 1) {
    const N = diff(e0, s0);
    const segs = items.filter((it) => it.e >= s0 && it.s < e0).map((it) => {
      const a = Math.max(0, diff(it.s, s0)), b = Math.min(N - 1, diff(it.e, s0));
      return { it, a, b, vb: Math.min(N - 1, Math.max(b, a + minSpan - 1)), cl: it.s < s0, cr: it.e >= e0 };
    }).sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a) || x.it.p.name.localeCompare(y.it.p.name));
    const ends = [];
    segs.forEach((sg) => { let l = ends.findIndex((e) => e < sg.a); if (l < 0) { l = ends.length; ends.push(-1); } ends[l] = sg.vb; sg.lane = l; });
    return { segs, lanes: ends.length };
  }

  GX.registerApp({
    id: 'agenda', name: 'Agenda', icon: 'agenda', tint: ['#ff5d5d', '#d62f5b'], size: [1120, 720], minSize: [360, 320],
    mount(body, win) {
      const st = { view: VIEWS[GX.store.get('agd.view')] ? GX.store.get('agd.view') : 'week', anchor: GX.today(), f: { brand: null, service: null, type: null }, showF: GX.store.get('agd.filters', true) !== false };
      let compact = false, lastW = 0, lastFit = 0, hovered = null, swiped = false;

      /* En-tête compact v2.1 : ligne 1 = période + vues + navigation ; ligne 2 = filtres (Marque / Service / Objet, MONO comme dans Gearbox) + légende */
      body.innerHTML = `<div class="app agd">
        <div class="app-head agd-h">
          <div class="ah-t"><h1>Agenda</h1><span class="sub" data-title></span></div>
          <div class="ah-tabs"><div class="seg agd-seg" data-views>${ORDER.map((v, i) => `<button data-v="${v}" aria-pressed="${v === st.view}" data-tip="${VIEWS[v].l} (${i + 1})"><span class="l">${VIEWS[v].l}</span><span class="s">${VIEWS[v].s}</span></button>`).join('')}</div></div>
          <div class="ah-f"><div class="agd-nav"><button class="icon-btn" data-nav="-1" data-tip="Période précédente (←)">${GX.icon('back')}</button><button class="btn sm" data-today>Aujourd’hui</button><button class="icon-btn" data-nav="1" data-tip="Période suivante (→)">${GX.icon('chevron')}</button></div>
            <button class="btn sm agd-ftog" data-ftog aria-pressed="${st.showF}" data-tip="Afficher / masquer les filtres"></button></div>
        </div>
        <div class="app-head2 agd-sub ${st.showF ? '' : 'hide'}" data-sub></div>
        <div class="agd-stage" data-stage></div></div>`;
      const $ = (s) => body.querySelector(s);
      const stage = $('[data-stage]'), seg = $('[data-views]');
      const cur = () => stage.querySelector('.agd-pane:not(.out)');

      /* ---------- Données visibles ---------- */
      const scopeOk = (p) => {
        if (GX.ctx.site) return p.sites.includes(GX.ctx.site);
        const per = GX.ctx.perimetre; if (!per || per === 'Tout le réseau') return true;
        return per === 'Nissan' ? p.brands.includes('Nissan') : p.sites.includes(per);
      };
      const colorOf = (p) => D.SERVICE_COLOR[p.services[0]] || D.SERVICE_COLOR['Tous Services'];
      /* Mêmes règles que pages/Agenda.tsx : un projet Holding reste visible quel que soit le filtre Marque,
         un projet « Tous Services » reste visible quel que soit le filtre Service. */
      const items = () => D.PROJECTS.filter((p) => p.status !== 'Draft' && scopeOk(p)
        && (!st.f.brand || p.brands.includes(st.f.brand) || p.brands.includes('Holding'))
        && (!st.f.service || p.services.includes(st.f.service) || p.services.includes('Tous Services')) && (!st.f.type || p.type === st.f.type))
        .map((p) => { let s = P(p.startDate), e = P(p.endDate); if (e < s) [s, e] = [e, s]; return { p, s, e, c: colorOf(p) }; });
      const sitesTxt = (p) => { if (!GX.ctx.site) return p.sites.join(', '); const h = p.sites.length - 1; return GX.ctx.site + (h > 0 ? ` (+${h} masqué${h > 1 ? 's' : ''})` : ''); };
      const tipOf = (p) => `${p.name} · ${F.date(p.startDate)} → ${F.date(p.endDate)} · ${p.services.join(', ')} · ${sitesTxt(p)} · ${D.projectProgress(p)} % · ${F.eur(D.projectActual(p))}`;
      const check = (p) => (p.status === 'Done' || p.status === 'Archived' ? GX.icon('check', 'sm') : '');

      /* ---------- Rendus ---------- */
      function barHTML(sg, kind, style) {
        const { p, c } = sg.it, pr = D.projectProgress(p), k = `${p.id}:${sg.a}`;
        const cls = `agd-bar ${kind} ${sg.cl ? 'cl' : ''} ${sg.cr ? 'cr' : ''}`;
        let inner;
        if (kind === 'wk') inner = `<span class="n"><span class="ellipsis">${GX.esc(p.name)}</span>${check(p)}</span><span class="m ellipsis num">${F.date(p.startDate)} → ${F.date(p.endDate)}</span>
          <span class="agd-pr"><span class="bar"><i style="width:${pr}%;--c:${c}"></i></span><b class="num">${pr} %</b><span class="num ellipsis">${F.eur(D.projectActual(p))}</span></span>`;
        else if (kind === 'fr') inner = `<span class="ellipsis">${GX.esc(p.name)}</span>${sg.wide ? `<span class="pc num">${pr} %</span>` : ''}`;
        else inner = `<span class="ellipsis">${GX.esc(p.name)}</span>`;
        return `<button class="${cls}" data-id="${p.id}" data-k="${k}" style="--c:${c};${style}" data-tip="${GX.esc(tipOf(p))}">${inner}</button>`;
      }
      const emptyHTML = (txt, its, per) => {
        const next = its.filter((it) => it.s >= per.e).sort((a, b) => a.s - b.s)[0], prev = its.filter((it) => it.e < per.s).sort((a, b) => b.e - a.e)[0];
        return `<div class="agd-empty">${GX.icon('agenda')}<b>${txt}</b><span>${its.length ? 'Aucun projet ne tombe sur cette période.' : 'Aucun projet ne correspond aux filtres.'}</span>
          <div class="row">${prev ? `<button class="btn sm" data-jump="${GX.iso(prev.s)}">${GX.icon('back', 'sm')}Précédent</button>` : ''}${next ? `<button class="btn sm" data-jump="${GX.iso(next.s)}">Prochain projet ${GX.icon('chevron', 'sm')}</button>` : ''}</div></div>`;
      };

      function weekHTML(per, its) {
        const T = GX.today(), days = [...Array(7)].map((_, i) => addD(per.s, i));
        const { segs, lanes } = pack(its, per.s, per.e);
        return `<div class="agd-dh agd-7">${days.map((d, i) => { const h = holiday(d); return `<div class="agd-dhc ${isWE(d) ? 'we' : ''} ${same(d, T) ? 'today' : ''}"><span>${DOW[i]}</span><b class="num">${d.getDate()}</b>${h ? `<span class="hol" data-tip="${h}">${h}</span>` : ''}</div>`; }).join('')}</div>
          <div class="agd-wbody scroll"><div class="agd-wrap"><div class="agd-cols agd-7">${days.map((d) => `<i class="${isWE(d) || holiday(d) ? 'we' : ''} ${same(d, T) ? 'today' : ''}"></i>`).join('')}</div>
          <div class="agd-wl" style="grid-template-rows:repeat(${Math.max(1, lanes)},74px)">${segs.map((sg) => barHTML(sg, 'wk', `grid-column:${sg.a + 1}/${sg.b + 2};grid-row:${sg.lane + 1}`)).join('')}</div></div></div>
          ${segs.length ? '' : emptyHTML('Aucun projet cette semaine', its, per)}`;
      }

      function monthHTML(per, its, h) {
        const T = GX.today(), weeks = Math.round(diff(per.e, per.s) / 7);
        const fit = Math.max(1, Math.floor(((h ? (h - 31) / weeks : 110) - 31) / 21)); lastFit = fit;
        let any = false;
        const rows = [...Array(weeks)].map((_, w) => {
          const s = addD(per.s, 7 * w), e = addD(s, 7), { segs, lanes } = pack(its, s, e);
          if (segs.length) any = true;
          let shown = segs, more = '';
          if (lanes > fit) {
            const capL = fit - 1; shown = segs.filter((x) => x.lane < capL);
            for (let d = 0; d < 7; d++) { const n = segs.filter((x) => x.lane >= capL && x.a <= d && x.b >= d).length; if (n) more += `<button class="agd-more" data-more="${GX.iso(addD(s, d))}" style="grid-column:${d + 1};grid-row:${capL + 1}">+${n} autre${n > 1 ? 's' : ''}</button>`; }
          }
          const cells = [...Array(7)].map((_, d) => {
            const x = addD(s, d), out = x < per.m0 || x >= per.m1, hol = holiday(x);
            return `<div class="agd-mc ${isWE(x) ? 'we' : ''} ${out ? 'out' : ''} ${hol ? 'hol' : ''} ${same(x, T) ? 'today' : ''}"><button class="agd-dn num" data-zoom="${GX.iso(x)}" data-tip="${hol ? hol + ' · ' : ''}Voir la semaine">${x.getDate() === 1 ? `1 ${MSHORT[x.getMonth()]}` : x.getDate()}</button></div>`;
          }).join('');
          return `<div class="agd-mr"><div class="agd-mbg agd-7">${cells}</div><div class="agd-mb">${shown.map((sg) => barHTML(sg, 'mo', `grid-column:${sg.a + 1}/${sg.b + 2};grid-row:${sg.lane + 1}`)).join('')}${more}</div></div>`;
        }).join('');
        return `<div class="agd-mh agd-7">${DOW.map((d) => `<span>${d}</span>`).join('')}</div><div class="agd-mg" style="--weeks:${weeks}">${rows}</div>${any ? '' : emptyHTML('Aucun projet ce mois-ci', its, per)}`;
      }

      function friseHTML(per, its, w) {
        const T = GX.today(), N = diff(per.e, per.s), ppd = (w || 900) / N, minSpan = Math.max(1, Math.ceil(46 / ppd));
        const { segs, lanes } = pack(its, per.s, per.e, minSpan);
        let head = '', bg = '', k = 0;
        for (let m = new Date(per.s); m < per.e; m = addM(m, 1), k++) {
          const a = diff(m, per.s), len = diff(addM(m, 1), m), px = len * ppd;
          const isCur = m.getMonth() === T.getMonth() && m.getFullYear() === T.getFullYear();
          head += `<button class="agd-fm ${isCur ? 'cur' : ''}" data-month="${GX.iso(m)}" style="left:${(a / N) * 100}%;width:${(len / N) * 100}%" data-tip="Voir ${MONTHS[m.getMonth()]} ${m.getFullYear()}">${px < 84 ? cap(MSHORT[m.getMonth()]) : cap(MONTHS[m.getMonth()])}<small>${m.getFullYear()}</small></button>`;
          bg += `<i class="${k % 2 ? 'alt' : ''}" style="left:${(a / N) * 100}%;width:${(len / N) * 100}%"></i>`;
        }
        if (ppd >= 7) for (let i = 0; i < N; i++) { const d = addD(per.s, i); if (isWE(d) || holiday(d)) bg += `<i class="we" style="left:${(i / N) * 100}%;width:${(1 / N) * 100}%"></i>`; }
        const now = T >= per.s && T < per.e ? `<div class="agd-now" style="left:${((diff(T, per.s) + .5) / N) * 100}%" data-tip="Aujourd’hui"></div>` : '';
        const bars = segs.map((sg) => { const span = sg.vb - sg.a + 1; sg.wide = span * ppd > 120; return barHTML(sg, 'fr', `left:calc(${(sg.a / N) * 100}% + 2px);width:calc(${(span / N) * 100}% - 4px);top:${sg.lane * 34}px`); }).join('');
        return `<div class="agd-fh">${head}</div><div class="agd-fb scroll"><div class="agd-wrap"><div class="agd-fbg">${bg}${now}</div><div class="agd-fl" style="height:${Math.max(1, lanes) * 34}px">${bars}</div></div></div>
          ${segs.length ? '' : emptyHTML('Aucun projet sur la période', its, per)}`;
      }

      function listHTML(per, its) {
        const T = GX.today(), row = (it, sub) => { const p = it.p, pr = D.projectProgress(p); return `<button class="agd-li" data-id="${p.id}" data-k="${p.id}" style="--c:${it.c}"><div class="grow" style="min-width:0"><div class="row" style="gap:6px;font-weight:700"><span class="ellipsis">${GX.esc(p.name)}</span>${check(p)}</div><div class="faint ellipsis" style="font-size:12px">${sub}</div></div><div style="text-align:right;flex:none"><b class="num">${pr} %</b><div class="bar"><i style="width:${pr}%;--c:${it.c}"></i></div><div class="faint num" style="font-size:11px;margin-top:3px">${F.eur(D.projectActual(p))}</div></div></button>`; };
        let out = '';
        if (st.view === 'week' || st.view === 'month') {
          const s = st.view === 'month' ? per.m0 : per.s, e = st.view === 'month' ? per.m1 : per.e;
          for (let d = s; d < e; d = addD(d, 1)) {
            const act = its.filter((it) => it.s <= d && it.e >= d).sort((a, b) => a.s - b.s || a.p.name.localeCompare(b.p.name));
            /* Comme la liste mobile de CalendarGrid : la semaine montre ses 7 jours (« — » si vide), le mois seulement les jours occupés */
            if (!act.length && st.view !== 'week') continue;
            const t = same(d, T), hol = holiday(d);
            out += `<div class="agd-lh ${t ? 'today' : ''}">${t ? 'Aujourd’hui' : cap(d.toLocaleDateString('fr-FR', { weekday: 'long' }))}<span class="faint">${d.getDate()} ${MONTHS[d.getMonth()]}${hol ? ' · ' + hol : ''}</span></div>`;
            if (!act.length) { out += '<div class="agd-none">—</div>'; continue; }
            out += act.map((it) => { const n = diff(it.e, it.s) + 1; return row(it, `${n > 1 ? `Jour ${diff(d, it.s) + 1}/${n} · ` : ''}${it.p.services.join(', ')} · ${GX.esc(sitesTxt(it.p))}`); }).join('');
          }
        } else {
          for (let m = new Date(per.s); m < per.e; m = addM(m, 1)) {
            const m1 = addM(m, 1), act = its.filter((it) => it.s < m1 && it.e >= m).sort((a, b) => a.s - b.s);
            if (!act.length) continue;
            out += `<div class="agd-lh" data-month="${GX.iso(m)}">${cap(MONTHS[m.getMonth()])}<span class="faint">${m.getFullYear()} · ${act.length} projet${act.length > 1 ? 's' : ''}</span></div>`;
            out += act.map((it) => row(it, `${F.date(it.p.startDate)} → ${F.date(it.p.endDate)} · ${it.p.services.join(', ')} · ${GX.esc(sitesTxt(it.p))}`)).join('');
          }
        }
        return out ? `<div class="scroll" style="flex:1;min-height:0"><div class="agd-list">${out}</div></div>` : emptyHTML('Aucun événement sur cette période.', its, per);
      }

      function paneHTML(per, its) {
        if (compact) return listHTML(per, its);
        if (st.view === 'week') return weekHTML(per, its);
        if (st.view === 'month') return monthHTML(per, its, stage.clientHeight);
        return friseHTML(per, its, stage.clientWidth);
      }

      /* ---------- En-tête ---------- */
      function head(per, its, animate) {
        // Même en-tête que les autres rubriques : le titre reste « Agenda », la période passe en sous-titre
        const tt = $('[data-title]'), label = `${per.title} · ${per.kicker}`;
        const changed = tt.textContent !== label;
        tt.textContent = label;
        if (animate && changed) GX.animate(tt, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
        const n = [st.f.brand, st.f.service, st.f.type].filter(Boolean).length;
        const inPer = pack(its, per.m0 || per.s, per.m1 || per.e).segs.length;
        /* Panneau de filtres du modèle : un groupe = libellé au-dessus du contrôle. Options EXACTES de
           pages/Agenda.tsx : Marque (Toutes + BRANDS), Service (Tous + SERVICES, « Tous Services » compris),
           Objet (Tous + PROJECT_TYPES) — trois sélecteurs SIMPLES, comme les <Select> de Gearbox. */
        $('[data-sub]').innerHTML = `<div><span class="label">Marque</span>${GX.ui.pickerBtn('data-pf="brand"', 'car', st.f.brand || 'Toutes', !!st.f.brand)}</div>
          <div><span class="label">Service</span>${GX.ui.pickerBtn('data-pf="service"', 'layers', st.f.service || 'Tous', !!st.f.service)}</div>
          <div><span class="label">Objet</span>${GX.ui.pickerBtn('data-pf="type"', 'target', st.f.type || 'Tous', !!st.f.type)}</div>
          ${n ? `<button class="btn sm ghost" data-freset>${GX.icon('close', 'sm')}Effacer</button>` : ''}
          <span class="agd-sep"></span>
          <div class="agd-lgw"><span class="label">Couleur des barres = service</span><div class="agd-lgs">${SERVICE_F.map((s) => `<button class="agd-lg" data-svc="${s}" aria-pressed="${st.f.service === s}" data-tip="Clic : filtrer sur ${s}" style="--c:${D.SERVICE_COLOR[s]}"><i></i><span>${s}</span></button>`).join('')}</div></div>
          <div class="agd-cntw"><span class="label">${GX.ctx.site ? GX.esc(GX.ctx.site) + ' · lecture seule' : 'Sur la période'}</span><span class="agd-cnt"><b class="num">${inPer}</b>projet${inPer > 1 ? 's' : ''} · brouillons exclus</span></div>`;
        const ft = $('[data-ftog]');
        ft.innerHTML = `${GX.icon('filter', 'sm')}<span class="lbl">Filtres</span>${n ? `<span class="count">${n}</span>` : ''}`;
        ft.setAttribute('aria-pressed', st.showF);
        win.setTitle('Agenda', VIEWS[st.view].l);
      }

      /* ---------- Transitions ---------- */
      function swap(html, kind, dir = 1, origin) {
        const old = cur();
        const pane = document.createElement('div'); pane.className = 'agd-pane'; pane.innerHTML = html; stage.append(pane);
        if (!old) return;
        old.classList.add('out');
        const from = old.style.transform || 'none';
        let a;
        if (kind === 'slide') {
          a = GX.animate(old, [{ transform: from, opacity: 1 }, { transform: `translateX(${-dir * 32}%)`, opacity: 0 }], { spring: 'snappy', fill: 'forwards' });
          GX.animate(pane, [{ transform: `translateX(${dir * 42}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'snappy' });
        } else if (kind === 'zoom') {
          if (origin) { const r = origin.getBoundingClientRect(), s = stage.getBoundingClientRect(); const o = `${r.left + r.width / 2 - s.left}px ${r.top + r.height / 2 - s.top}px`; pane.style.transformOrigin = o; old.style.transformOrigin = o; }
          if (dir < 0) { // vers une vue plus fine : la nouvelle vue jaillit de l'élément cliqué
            a = GX.animate(old, [{ transform: 'none', opacity: 1 }, { transform: 'scale(1.35)', opacity: 0 }], { spring: 'soft', fill: 'forwards' });
            GX.animate(pane, [{ transform: 'scale(.35)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'soft' });
          } else {       // vers une vue plus large : la vue actuelle se replie
            a = GX.animate(old, [{ transform: 'none', opacity: 1 }, { transform: 'scale(.72)', opacity: 0 }], { spring: 'soft', fill: 'forwards' });
            GX.animate(pane, [{ transform: 'scale(1.18)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'soft' });
          }
        } else {
          a = GX.animate(old, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
          GX.animate(pane, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
        }
        a.onfinish = () => old.remove();
        setTimeout(() => old.isConnected && old.remove(), 1400);
      }
      /* Re-rendu sur place (filtres, données) : les barres glissent vers leur nouvelle place (FLIP) */
      function inPlace(html, flip = true) {
        const pane = cur(); if (!pane) return swap(html);
        const first = new Map();
        if (flip) pane.querySelectorAll('[data-k]').forEach((el) => first.set(el.dataset.k, el.getBoundingClientRect()));
        const sc = pane.querySelector('.scroll')?.scrollTop || 0;
        pane.innerHTML = html;
        const s = pane.querySelector('.scroll'); if (s) s.scrollTop = sc;
        if (!flip) return;
        pane.querySelectorAll('[data-k]').forEach((el, i) => {
          const r = first.get(el.dataset.k);
          if (r) GX.flip(el, r, { spring: 'soft' });
          else GX.animate(el, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy', delay: Math.min(i, 12) * 12, fill: 'backwards' });
        });
      }

      function render(kind, dir, origin) {
        const per = period(st.view, st.anchor), its = items();
        head(per, its, !!kind);
        const html = paneHTML(per, its);
        if (!cur()) swap(html);
        else if (kind === 'inplace') inPlace(html, true);
        else if (kind === 'quiet') inPlace(html, false);
        else swap(html, kind, dir, origin);
        lastW = stage.clientWidth;
      }

      /* ---------- Actions ---------- */
      function nav(dir) { st.anchor = shift(st.anchor, st.view, dir); render('slide', dir); }
      function goToday() {
        const T = GX.today(), p = period(st.view, st.anchor);
        if (T >= p.s && T < p.e) { st.anchor = T; GX.animate($('[data-title]'), [{ transform: 'scale(1.06)' }, { transform: 'none' }], { spring: 'bouncy' }); return; }
        const dir = T < p.s ? -1 : 1; st.anchor = T; render('slide', dir);
      }
      function setView(v, origin, anchor) {
        if (!VIEWS[v]) return;
        const dir = ORDER.indexOf(v) > ORDER.indexOf(st.view) ? 1 : -1;
        if (anchor) st.anchor = anchor;
        if (v === st.view) return render('slide', 1);
        st.view = v; GX.store.set('agd.view', v);
        const b = seg.querySelector(`[data-v="${v}"]`);
        if (b && b.getAttribute('aria-pressed') !== 'true') { seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); GX.ui.refresh(body.querySelector('.agd-h')); }
        render('zoom', dir, origin);
      }
      function openProject(id, el) { const p = D.project(id); if (!p) return; (win.open || GX.wm.open)('project', { id: p.id, title: p.name }, el); }
      function quickLook(id, el) {
        const p = D.project(id); if (!p) return; const pr = D.projectProgress(p), c = colorOf(p);
        GX.shell?.quickLook?.({ title: p.name, origin: el, html: `<div style="display:grid;gap:12px">
          <div class="row wrap">${GX.r.pStatus(p.status)}${p.services.map((s) => GX.r.service(s)).join('')}${GX.r.brandChips(p.brands)}</div>
          <div class="muted">${GX.esc(p.type)} · ${GX.esc(sitesTxt(p))}</div>
          <div class="row" style="gap:10px"><div class="card pad grow"><div class="label">Dates</div><b>${F.dateY(p.startDate)} → ${F.dateY(p.endDate)}</b></div><div class="card pad grow"><div class="label">Budget réel</div><b class="num">${F.eur(D.projectActual(p))}</b> <span class="faint num">/ ${F.eur(p.budgetPlanned)}</span></div></div>
          <div><div class="row"><span class="label grow">Avancement</span><b class="num">${pr} %</b></div><div class="bar" style="margin-top:6px"><i style="width:${pr}%;--c:${c}"></i></div></div>
          <div class="faint" style="font-size:12px">${p.tasks.length} tâches · Espace ou Échap pour fermer · clic sur la barre pour ouvrir le projet</div></div>` });
      }
      function dayMenu(iso, el) {
        const d = P(iso), act = items().filter((it) => it.s <= d && it.e >= d).sort((a, b) => a.s - b.s);
        GX.menu.open([{ header: cap(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })) + ` · ${act.length} projet${act.length > 1 ? 's' : ''}` },
          ...act.map((it) => ({ label: `${it.p.name} (${it.p.services[0]})`, action: () => openProject(it.p.id, el) })), '-',
          { label: 'Voir la semaine', icon: 'agenda', action: () => setView('week', el, d) }], el);
      }

      /* ---------- Filtres : sélecteurs partagés (MONO, comme les Select de Gearbox) ---------- */
      const FILTERS = {
        brand: { title: 'Marque', all: 'Toutes', items: BRAND_F.map((b) => ({ v: b, l: b, color: D.brand(b)?.hex, hint: b === 'Holding' ? 'toujours affiché' : '' })) },
        service: { title: 'Service', all: 'Tous', items: SERVICE_F.map((s) => ({ v: s, l: s, color: D.SERVICE_COLOR[s], hint: s === 'Tous Services' ? 'toujours affiché' : '' })) },
        type: { title: 'Objet', all: 'Tous', items: D.PROJECT_TYPES.map((t) => ({ v: t, l: t })) },
      };
      function openFilter(key, btn) {
        const f = FILTERS[key];
        GX.ui.pick(btn, [{ items: [{ v: '', l: f.all }, ...f.items] }], { multi: false, search: false, title: f.title, selected: [st.f[key] || ''],
          onChange: (v) => { st.f[key] = v[0] || null; render('inplace'); } });
      }
      const resetFilters = () => { st.f = { brand: null, service: null, type: null }; render('inplace'); };

      /* ---------- Câblage (délégation, une seule fois) ---------- */
      body.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => nav(+b.dataset.nav)));
      $('[data-today]').onclick = goToday;
      /* Bouton « Filtres » de Gearbox : replie / déplie le panneau (préférence mémorisée) */
      $('[data-ftog]').onclick = () => { st.showF = !st.showF; GX.store.set('agd.filters', st.showF); $('[data-sub]').classList.toggle('hide', !st.showF); render('quiet'); };
      seg.addEventListener('change', (e) => setView(e.detail));
      $('[data-sub]').addEventListener('click', (e) => {
        const s = e.target.closest('[data-svc]'); if (s) { st.f.service = st.f.service === s.dataset.svc ? null : s.dataset.svc; render('inplace'); }
        const pf = e.target.closest('[data-pf]'); if (pf) openFilter(pf.dataset.pf, pf);
        if (e.target.closest('[data-freset]')) resetFilters();
      });
      stage.addEventListener('click', (e) => {
        if (swiped) return;
        const bar = e.target.closest('[data-id]'); if (bar) return openProject(bar.dataset.id, bar);
        const z = e.target.closest('[data-zoom]'); if (z) return setView('week', z, P(z.dataset.zoom));
        const m = e.target.closest('[data-month]'); if (m) return setView('month', m, (() => { const d = P(m.dataset.month), T = GX.today(); return d.getMonth() === T.getMonth() && d.getFullYear() === T.getFullYear() ? T : d; })());
        const mo = e.target.closest('[data-more]'); if (mo) return dayMenu(mo.dataset.more, mo);
        const j = e.target.closest('[data-jump]'); if (j) { const d = P(j.dataset.jump), dir = d < period(st.view, st.anchor).s ? -1 : 1; st.anchor = d; return render('slide', dir); }
      });
      stage.addEventListener('contextmenu', (e) => {
        const bar = e.target.closest('[data-id]');
        if (!bar) { e.preventDefault(); return GX.menu.open([{ header: 'Présentation' }, ...ORDER.map((v, i) => ({ label: VIEWS[v].l, kbd: String(i + 1), checked: st.view === v, action: () => setView(v) })), '-', { label: 'Aujourd’hui', kbd: 'T', icon: 'agenda', action: goToday }], { x: e.clientX, y: e.clientY }); }
        e.preventDefault(); const p = D.project(bar.dataset.id);
        GX.menu.open([{ header: p.name }, { label: 'Ouvrir le projet', icon: 'projects', action: () => openProject(p.id, bar) }, { label: 'Aperçu rapide', icon: 'quicklook', kbd: 'Espace', action: () => quickLook(p.id, bar) }, '-',
          { label: 'Aller à la semaine de début', icon: 'agenda', action: () => setView('week', bar, P(p.startDate)) }, { label: 'Aller au mois de début', action: () => setView('month', bar, P(p.startDate)) },
          '-', { label: `Filtrer sur ${p.services[0]}`, icon: 'filter', action: () => { st.f.service = p.services[0]; render('inplace'); } }], { x: e.clientX, y: e.clientY });
      });
      stage.addEventListener('pointerover', (e) => { hovered = e.target.closest('[data-id]'); });
      /* Pavé tactile : balayage horizontal = période suivante / précédente */
      let acc = 0, accT = 0, wheelAt = 0;
      stage.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.3) return;
        acc += e.deltaX; clearTimeout(accT); accT = setTimeout(() => (acc = 0), 180);
        if (Math.abs(acc) > 110 && Date.now() - wheelAt > 550) { nav(acc > 0 ? 1 : -1); acc = 0; wheelAt = Date.now(); }
      }, { passive: true });
      /* Doigt : la vue suit le doigt, puis bascule (ou revient en ressort) */
      stage.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        const pane = cur(); if (!pane) return;
        const sx = e.clientX, sy = e.clientY; let dx = 0, on = false, dead = false;
        const mv = (ev) => {
          const x = ev.clientX - sx, y = ev.clientY - sy;
          if (!on && !dead) { if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) dead = true; else if (Math.abs(x) > 12) { on = true; try { stage.setPointerCapture(e.pointerId); } catch (er) {} } }
          if (on) { dx = x; pane.style.transform = `translateX(${dx}px)`; pane.style.opacity = String(1 - Math.min(.45, Math.abs(dx) / 700)); }
        };
        const up = () => {
          stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerup', up); stage.removeEventListener('pointercancel', up);
          if (!on) return; swiped = true; setTimeout(() => (swiped = false), 60);
          if (Math.abs(dx) > 64) nav(dx < 0 ? 1 : -1);
          else { GX.animate(pane, [{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { spring: 'bouncy' }); pane.style.transform = ''; pane.style.opacity = ''; }
        };
        stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
      });
      body.tabIndex = -1;
      body.addEventListener('keydown', (e) => {
        if (e.target.closest('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); nav(1); }
        else if (e.key === 't' || e.key === 'T') goToday();
        else if (/^[1-5]$/.test(e.key)) setView(ORDER[+e.key - 1]);
        else if (e.key === ' ' && hovered?.isConnected) { e.preventDefault(); quickLook(hovered.dataset.id, hovered); }
      });

      /* ---------- Adaptatif ---------- */
      let raf = 0;
      const ro = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const w = body.clientWidth, c = w < 600;
          GX.ui.refresh(body.querySelector('.agd-h'));
          if (c !== compact) { compact = c; return render(cur() ? 'quiet' : null); }
          if (compact || !cur()) return;
          if (st.view === 'month') { const weeks = Math.round(diff(period('month', st.anchor).e, period('month', st.anchor).s) / 7); const fit = Math.max(1, Math.floor(((stage.clientHeight - 31) / weeks - 31) / 21)); if (fit !== lastFit) render('quiet'); }
          else if (st.view !== 'week' && Math.abs(stage.clientWidth - lastW) > 30) render('quiet');
        });
      });
      compact = body.clientWidth > 0 && body.clientWidth < 600;
      render(null);
      ro.observe(body);
      const off = [GX.on('ctx', () => render('quiet')), GX.on('data:projects', () => render('inplace'))];

      return {
        destroy() { ro.disconnect(); off.forEach((o) => o()); GX.ui.closePick(); },
        command(c) { if (c === 'today') goToday(); if (c?.startsWith?.('view:')) setView(c.slice(5)); if (c?.startsWith?.('date:')) { st.anchor = P(c.slice(5)); render('slide', 1); } },
        menus: () => ({
          'Présentation': [...ORDER.map((v, i) => ({ label: VIEWS[v].l, kbd: String(i + 1), checked: st.view === v, action: () => setView(v) })), '-',
            { label: 'Aujourd’hui', icon: 'agenda', kbd: 'T', action: goToday }, { label: 'Période précédente', icon: 'back', kbd: '←', action: () => nav(-1) }, { label: 'Période suivante', icon: 'chevron', kbd: '→', action: () => nav(1) }, '-',
            { label: 'Afficher les filtres', icon: 'filter', checked: st.showF, action: () => $('[data-ftog]').click() }],
          'Filtres': [{ header: 'Marque' }, ...BRAND_F.map((b) => ({ label: b, checked: st.f.brand === b, action: () => { st.f.brand = st.f.brand === b ? null : b; render('inplace'); } })), '-',
            { header: 'Service' }, ...SERVICE_F.map((s) => ({ label: s, checked: st.f.service === s, action: () => { st.f.service = st.f.service === s ? null : s; render('inplace'); } })), '-',
            { header: 'Objet' }, ...D.PROJECT_TYPES.map((t) => ({ label: t, checked: st.f.type === t, action: () => { st.f.type = st.f.type === t ? null : t; render('inplace'); } })), '-',
            { label: 'Réinitialiser les filtres', icon: 'refresh', disabled: !st.f.brand && !st.f.service && !st.f.type, action: resetFilters }],

        }),
      };
    },
  });
})();
