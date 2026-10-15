/* =====================================================================
   SPARK — onglet « Équipes » et portefeuilles vendeurs (lot 4) — MAQUETTE statique
   Branché sur crm.js par GX.crmEquipes (comme requeteur.js par GX.crmReq) : même échantillon fictif.

   Décisions de Théo (15/10/2026) :
   - SPARK est LA source des vendeurs (GRID la lira plus tard) : modèle repris de GRID (plaque → site →
     vendeur, encadrement chef de site / chef des ventes VN / VO, date d'entrée / de sortie, marques,
     archivage), enrichi de ce que GRID n'a pas : fonction, secteur (codes postaux), IPN, téléphone,
     noms DCS reconnus, portefeuille.
   - UN vendeur par client (son portefeuille) ; l'agent qui a vendu est une SECONDE variable du client.
   - Ne plus contacter (global + par canal) et Échanges au même lot ; « déjà ciblés » plus tard.

   Données 100 % FICTIVES (noms inventés, 06 39 98 … et 04 65 71 … réservés à la fiction, @example.com).
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt, esc = GX.esc, CD = GX.crmData, H = CD.h;
  const { rng, pk, int, pad, dFR, addM } = H;
  const TODAY = CD.TODAY;
  const addD = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return GX.iso(d); };
  const plural = H.plural;

  /* ---------------- Référentiel (ce que la table rcu.vendeur contiendra) ---------------- */
  const FONCTIONS = {
    hall: { l: 'Hall', c: 'var(--info)', tip: 'Reçoit les clients orphelins du site, répartis équitablement' },
    secteur: { l: 'Secteur', c: 'var(--bony-violet)', tip: 'Reçoit les clients orphelins de SES codes postaux' },
    societes: { l: 'Sociétés', c: 'var(--warn)', tip: 'Reçoit les clients sociétés orphelins du site' },
    magasin: { l: 'Magasin', c: 'var(--text-3)', tip: 'Magasin / DIAC : ne reçoit pas de portefeuille par défaut' },
    alternant: { l: 'Alternant', c: 'var(--text-3)', tip: 'Ne reçoit pas de clients (« pas de leads »)' },
  };
  const P = ['Julien', 'Sophie', 'Karim', 'Nicolas', 'Audrey', 'Romain', 'Cédric', 'Laetitia', 'Yann', 'Stéphane', 'Mélanie', 'Bruno', 'Thierry', 'Delphine', 'Hugo', 'Clara', 'Mathis', 'Inès'];
  const N = ['Morel', 'Barret', 'Charrier', 'Delorme', 'Pradier', 'Rigal', 'Joubert', 'Malet', 'Sabatier', 'Vergne', 'Couderc', 'Lafon', 'Bouchet', 'Gerbaud', 'Astier', 'Chassang', 'Teyssier', 'Vidal'];
  const SITES = Object.keys(CD.GEO);
  const PLAQ = [...Object.keys(D.PLAQUES).map((p) => ({ id: p, l: p.replace('PLAQUE ', ''), sites: D.PLAQUES[p].filter((s) => SITES.includes(s)) })), { id: 'SITES NISSAN', l: 'Sites Nissan', sites: D.NISSAN_ONLY.filter((s) => SITES.includes(s)) }];
  const deptOf = (cp) => cp.slice(0, 2);

  let seq = 1;
  const V = [];             // vendeurs
  const ENC = {};           // encadrement par site
  const mk = (r, site, o) => {
    const [prenom, nom] = o.name ? o.name.split(' ') : [pk(r, P), pk(r, N)];
    const v = { id: seq++, prenom, nom, site, service: 'VN', marques: ['Renault'], fonction: 'hall', recoit: true, secteurs: [], entree: addM(TODAY, -int(r, 8, 140)), sortie: null,
      ipn: 'D' + pad(int(r, 10000, 219999), 6), tel: '06 39 98 ' + pad(int(r, 0, 99), 2) + ' ' + pad(int(r, 0, 99), 2), alias: [], verrou: 0, histo: [], ...o };
    v.email = `${H.slug(v.prenom)}.${H.slug(v.nom)}@example.com`;
    if (!v.alias.length) v.alias = [H.plain(`${v.nom} ${v.prenom}`)];
    if (v.fonction === 'alternant' || v.fonction === 'magasin') v.recoit = false;
    V.push(v); return v;
  };
  SITES.forEach((site, i) => {
    const r = rng(4200 + i), base = CD.VENDEURS[site] || [], cps = [...new Set(CD.GEO[site].map(([, cp]) => cp))];
    const brands = D.NISSAN_ONLY.includes(site) ? ['Nissan'] : D.ALPINE_SITES.includes(site) ? ['Renault', 'Alpine'] : ['Renault'];
    ENC[site] = { chefSite: `${pk(r, P)} ${pk(r, N)}`, cdvVN: `${pk(r, P)} ${pk(r, N)}`, cdvVO: site === 'Massagettes' ? null : `${pk(r, P)} ${pk(r, N)}` };
    base.forEach((name, j) => mk(r, site, { name, service: j < 3 ? 'VN' : 'VO', marques: D.NISSAN_ONLY.includes(site) ? brands : j === 1 ? ['Dacia'] : j === 3 ? ['Renault', 'Dacia'] : brands }));
    if (!D.NISSAN_ONLY.includes(site)) mk(r, site, { fonction: 'secteur', secteurs: [...cps.slice(1), String(+deptOf(cps[0]) % 2 ? deptOf(cps[0]) : '')].filter(Boolean).slice(0, 4), marques: ['Renault', 'Dacia'] });
    if ((CD.SITE_W[site] || 0) >= 5) {
      mk(r, site, { fonction: 'societes', marques: ['Renault', 'Dacia'] });
      mk(r, site, { service: 'VO', marques: ['Renault', 'Dacia'] });
      mk(r, site, { fonction: 'alternant', entree: addM(TODAY, -3) });
    }
  });
  // Situations à montrer : un départ programmé, une arrivée future, un vendeur sorti, un vendeur sans secteur couvrant tout.
  const clerm = V.filter((v) => v.site === 'Clermont');
  clerm[2].sortie = addD(TODAY, 16); clerm[2].histo.push(['clock', `Départ programmé au ${dFR(clerm[2].sortie)} par Théo L.`, dFR(TODAY)]);
  const arrive = mk(rng(77), 'Clermont', { fonction: 'secteur', secteurs: ['63270', '63118', '63910'], entree: addD(TODAY, 17), marques: ['Renault', 'Dacia'] });
  const sorti = mk(rng(78), 'Clermont', { name: 'Hugo Teyssier', service: 'VO', sortie: addM(TODAY, -2), entree: addM(TODAY, -60) });
  const status = (v) => v.sortie && v.sortie < TODAY ? 'sorti' : v.entree > TODAY ? 'arrive' : v.sortie ? 'part' : 'present';
  const ST = { present: ['Présent', 'var(--ok)'], part: ['Part', 'var(--warn)'], arrive: ['Arrive', 'var(--info)'], sorti: ['Sorti', 'var(--text-3)'] };
  const stBadge = (v) => { const s = status(v), [l, c] = ST[s]; return `<span class="badge" style="--c:${c}">${l}${s === 'part' ? ` le ${dFR(v.sortie)}` : s === 'arrive' ? ` le ${dFR(v.entree)}` : s === 'sorti' ? ` le ${dFR(v.sortie)}` : ''}</span>`; };
  const fnBadge = (v) => { const f = FONCTIONS[v.fonction]; return `<span class="badge" style="--c:${f.c}" data-tip="${esc(f.tip)}">${f.l}</span>`; };
  const fullV = (v) => `${v.prenom} ${v.nom}`;
  const byName = new Map(V.map((v) => [fullV(v), v]));

  /* ---------------- Portefeuilles (calculés sur l'échantillon de crm.js, extrapolés comme ses compteurs) ---------------- */
  CD.CLIENTS.forEach((c) => {
    const v = byName.get(c.vendeurRef);
    c.agent = c.last?.intermediaire || null;
    c.pfOrigine = 'achat';
    if (v === sorti || (!v && c.site === 'Clermont')) { const sec = V.find((x) => x.site === c.site && x.fonction === 'secteur' && status(x) === 'present' && x.secteurs.some((s) => c.cp.startsWith(s))); c.vendeurRef = fullV(sec || clerm[0]); c.pfOrigine = 'reattrib'; c.pfDepuis = { de: fullV(sorti), le: addM(TODAY, -2), regle: sec ? 'Secteur (code postal)' : 'Hall (le moins chargé)' }; }
  });
  const pf = (v) => CD.CLIENTS.filter((c) => c.vendeurRef === fullV(v));
  const pfN = (v) => status(v) === 'sorti' || status(v) === 'arrive' ? 0 : Math.round(pf(v).length * CD.SCALE) + (v.fonction === 'secteur' ? 380 + (v.id * 37) % 600 : v.fonction === 'societes' ? 210 + (v.id * 13) % 300 : 0);
  const ORPH = CD.CLIENTS.filter((c) => c.site !== 'Clermont' && c.i % 61 === 7 && c.last?.brand !== 'Renault').slice(0, 40);
  ORPH.forEach((c) => { c.vendeurRef = null; c.pfOrigine = 'orphelin'; });
  const orphN = Math.round(ORPH.length * CD.SCALE);

  /* ---------------- Noms DCS → vendeurs ---------------- */
  const DCS = [
    ...V.filter((v) => status(v) !== 'arrive').slice(0, 14).map((v) => ({ nom: v.alias[0], ventes: 300 + (v.id * 97) % 1400, derniere: addD(TODAY, -(v.id % 40)), etat: 'auto', vendeur: v.id })),
    { nom: 'DIRECTION', ventes: 1702, derniere: addD(TODAY, -3), etat: 'pas', note: 'Ventes saisies au nom de la direction' },
    { nom: 'MOREL JUL', ventes: 211, derniere: addD(TODAY, -9), etat: 'proposé', vendeur: clerm[0].id, note: 'Nom tronqué dans DCS' },
    { nom: 'CHARRIER CEDRIK', ventes: 96, derniere: addD(TODAY, -21), etat: 'proposé', vendeur: V.find((v) => v.nom === 'Charrier')?.id || clerm[1].id, note: 'Orthographe proche' },
    { nom: 'TEYSSIER HUGO', ventes: 1068, derniere: addM(TODAY, -2), etat: 'auto', vendeur: sorti.id },
    { nom: 'FAURE ROMANE', ventes: 864, derniere: addM(TODAY, -14), etat: 'ancien', note: 'Absente du référentiel : clients réattribués' },
    { nom: 'BOYER LUC', ventes: 43, derniere: addD(TODAY, -6), etat: 'inconnu', note: 'Aucun vendeur proche' },
  ];
  const DCS_ST = { auto: ['Reconnu', 'var(--ok)'], 'proposé': ['À valider', 'var(--warn)'], inconnu: ['Inconnu', 'var(--danger)'], ancien: ['Ancien vendeur', 'var(--text-3)'], pas: ['Pas un vendeur', 'var(--text-3)'] };
  const aValider = () => DCS.filter((d) => d.etat === 'proposé' || d.etat === 'inconnu').length;

  /* ---------------- Règles de portefeuille ---------------- */
  const REGLES = [
    ['lock', 'Choix manuel verrouillé', 'Un client attribué à la main avec « verrouiller » ne bouge plus jamais, même au départ du vendeur (il passe alors dans « À attribuer »).'],
    ['handshake', 'Vendeur de son dernier achat', 'Par défaut, le client appartient au vendeur de son dernier achat (VN ou VO), s’il est présent dans le référentiel. L’agent qui a vendu reste noté à part : il ne change pas le portefeuille.'],
    ['flag', 'Règles particulières', 'Exceptions propres à une concession, dans l’ordre du tableau ci-dessous (Brioude, agents rattachés…).'],
    ['building', 'Sociétés', 'Client société sans vendeur : vendeur « Sociétés » du site, marque compatible.'],
    ['pin', 'Secteur', 'Client sans vendeur : vendeur « Secteur » du site dont la liste couvre son code postal. Un code postal précis l’emporte sur un département entier.'],
    ['users', 'Hall', 'Sinon : vendeurs « Hall » du site, même service (VN / VO) et marque compatible, en donnant au moins chargé. Calcul déterministe : relancé deux fois, il donne le même résultat.'],
    ['alert', 'À attribuer', 'Personne ne convient (aucun vendeur du bon service ou de la bonne marque) : le client attend dans la file du site.'],
  ];
  const PART = [
    { on: true, site: 'Issoire', l: 'VN : clients des codes postaux de Brioude (43100, 43360, 43410…) sans vendeur présent', dest: 'Vendeur secteur de Langeac' },
    { on: true, site: 'Le Puy-en-Velay', l: 'Agent « Garage des Monts » (43500) rattaché au Puy depuis le 01/01/2026', dest: 'Vendeur secteur du Puy' },
    { on: true, site: 'Thiers', l: 'Thiers et Ambert : une seule équipe (affaire VNVOTH, VN et VO)', dest: 'Vendeurs de Thiers' },
    { on: false, site: 'Vichy', l: 'Clients APV de Cusset (atelier GIDARMSCUS) sans achat', dest: 'Hall de Vichy' },
  ];
  const JOURNAL = [
    { d: addD(TODAY, -1), n: 37, det: '31 réattributions (départ de Hugo Teyssier : reliquat), 6 nouveaux clients orphelins → secteur' },
    { d: addD(TODAY, -8), n: 2412, det: 'Départ de Hugo Teyssier : 1 284 → secteur, 1 093 → hall (3 vendeurs), 35 → à attribuer' },
    { d: addD(TODAY, -15), n: 18, det: 'Nouveaux clients orphelins de l’import du vendredi' },
  ];

  /* ---------------- Styles propres à l'onglet ---------------- */
  GX.css(`
  .eq-wrap{height:100%;display:flex;flex-direction:column;min-height:0}
  .eq-sub{padding:12px 18px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .eq-body{flex:1;min-height:0}
  .eq-pl{padding:10px 16px 4px}
  .eq-site{display:flex;align-items:center;gap:10px;padding:9px 16px;cursor:pointer;border-left:3px solid transparent}
  .eq-site:hover{background:var(--surface-3)}.eq-site.sel{background:var(--surface-3);border-left-color:var(--accent)}
  .eq-site b{font-weight:600}.eq-site .num{color:var(--text-3);font-size:12.5px}
  .eq-pad{padding:20px 24px 40px;display:flex;flex-direction:column;gap:18px}
  .eq-enc{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .eq-enc .card{padding:12px 14px;display:flex;flex-direction:column;gap:4px;cursor:pointer}
  .eq-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
  .eq-tbl th{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
  .eq-tbl td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:middle}
  .eq-tbl tr.cl{cursor:pointer}.eq-tbl tr.cl:hover td{background:var(--surface-3)}
  .eq-tbl tr.off td{opacity:.55}
  .eq-tbl .r{text-align:right;font-variant-numeric:tabular-nums}
  .eq-cps{display:flex;flex-wrap:wrap;gap:4px}.eq-cps .badge{font-variant-numeric:tabular-nums}
  .eq-av{--s:30px;width:var(--s);height:var(--s);border-radius:50%;display:inline-grid;place-items:center;font-size:11.5px;font-weight:700;background:var(--surface-3);color:var(--text-2);flex:none}
  .eq-rules{display:flex;flex-direction:column;gap:8px}
  .eq-rule{display:flex;gap:12px;align-items:flex-start;padding:12px 14px}
  .eq-rule .k{flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--surface-3);font-size:12px;font-weight:700}
  .eq-bar{height:8px;border-radius:4px;background:var(--surface-3);overflow:hidden;display:flex}
  .eq-bar i{display:block;height:100%}
  .eq-prev{display:flex;flex-direction:column;gap:6px;margin-top:12px}
  .eq-prev>div{display:flex;gap:10px;align-items:center;font-size:13.5px}
  .eq-ech{display:flex;flex-direction:column;gap:10px}
  .eq-ev{display:flex;gap:12px;padding:12px 14px}
  .eq-ev .ic{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--surface-3)}
  .eq-canaux{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
  .eq-canaux label{display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid var(--line);border-radius:var(--r-md);cursor:pointer}
  @container app (max-width:900px){.eq-enc{grid-template-columns:minmax(0,1fr)}.eq-tbl .hide-m{display:none}}
  `);

  /* =====================================================================
     Onglet Équipes
     ===================================================================== */
  function build(vhost, { win, compact, openClient }) {
    const st = { sub: GX.store.get('crm.eq.sub', 'org'), site: GX.store.get('crm.eq.site', 'Clermont'), vend: null, svc: 'all' };
    const render = () => {
      vhost.innerHTML = `<div class="eq-wrap"><div class="eq-sub"><div class="seg" data-eqsub>${[['org', 'Organisation'], ['dcs', `Noms DCS${aValider() ? ` <span class="count" style="background:var(--warn);margin-left:4px">${aValider()}</span>` : ''}`], ['reg', 'Règles du portefeuille'], ['orph', `À attribuer <span class="count" style="margin-left:4px">${F.n(orphN)}</span>`]].map(([k, l]) => `<button data-v="${k}" aria-pressed="${st.sub === k}">${l}</button>`).join('')}</div>
        <span class="grow"></span><span class="crm-note hide-s">Référentiel SPARK · source unique des vendeurs (GRID le lira)</span></div><div class="eq-body" data-eqb></div></div>`;
      vhost.querySelector('[data-eqsub]').addEventListener('change', (e) => { st.sub = e.detail; st.vend = null; GX.store.set('crm.eq.sub', st.sub); body(); });
      body();
    };
    const body = () => {
      const b = vhost.querySelector('[data-eqb]');
      if (st.sub === 'org') return orgBuild(b);
      if (st.sub === 'dcs') { b.innerHTML = `<div class="scroll" style="height:100%">${dcsHTML()}</div>`; return wireDcs(b); }
      if (st.sub === 'reg') { b.innerHTML = `<div class="scroll" style="height:100%">${regHTML()}</div>`; return wireReg(b); }
      b.innerHTML = `<div class="scroll" style="height:100%">${orphHTML()}</div>`; wireOrph(b);
    };

    /* ---------- Organisation : plaques → sites → vendeurs ---------- */
    function sitesHTML() {
      return `<div class="crm-list"><div class="scroll" style="flex:1;min-height:0;padding-bottom:16px">${PLAQ.map((p) => `<div class="eq-pl crm-lbl">Plaque ${esc(p.l)}</div>${p.sites.map((s) => {
        const vs = V.filter((v) => v.site === s && status(v) !== 'sorti'), al = vs.some((v) => status(v) !== 'present');
        return `<div class="eq-site ${s === st.site ? 'sel' : ''}" data-site="${esc(s)}"><b class="grow ellipsis">${esc(s)}</b>${al ? `<span style="color:var(--warn)" data-tip="Arrivée ou départ programmé">${GX.icon('clock', 'sm')}</span>` : ''}<span class="num">${vs.length} vend.</span></div>`; }).join('')}`).join('')}
        <div style="padding:12px 16px"><button class="btn sm ghost" data-act="addsite">${GX.icon('plus', 'sm')}Nouveau site…</button></div></div></div>`;
    }
    function siteHTML(site) {
      const e = ENC[site], vs = V.filter((v) => v.site === site), tot = vs.reduce((a, v) => a + pfN(v), 0);
      const rows = (svc) => vs.filter((v) => v.service === svc && (st.svc === 'all' || st.svc === svc)).sort((a, b) => status(a).localeCompare(status(b)) || a.nom.localeCompare(b.nom)).map((v) => `<tr class="cl ${status(v) === 'sorti' ? 'off' : ''}" data-vid="${v.id}">
        <td><div class="row" style="gap:10px"><span class="eq-av">${esc(v.prenom[0] + v.nom[0])}</span><div style="min-width:0"><b>${esc(fullV(v))}</b><div class="faint crm-mono" style="font-size:11.5px">${v.ipn}</div></div></div></td>
        <td>${fnBadge(v)}</td><td class="hide-m">${GX.r.brandChips(v.marques)}</td>
        <td class="hide-m"><div class="eq-cps">${v.secteurs.length ? v.secteurs.slice(0, 3).map((s) => `<span class="badge">${s.length === 2 ? `dép. ${s}` : s}</span>`).join('') + (v.secteurs.length > 3 ? `<span class="faint">+${v.secteurs.length - 3}</span>` : '') : '<span class="faint">—</span>'}</div></td>
        <td>${stBadge(v)}</td><td class="r"><b>${pfN(v) ? F.n(pfN(v)) : '—'}</b></td></tr>`).join('');
      const tbl = (svc) => `<div class="crm-sec"><h3 class="crm-h2">${svc === 'VN' ? 'Véhicules neufs' : 'Véhicules d’occasion'} <span class="n">${vs.filter((v) => v.service === svc && status(v) !== 'sorti').length}</span></h3>
        <table class="eq-tbl"><thead><tr><th>Vendeur</th><th>Fonction</th><th class="hide-m">Marques</th><th class="hide-m">Secteur</th><th>Statut</th><th class="r">Portefeuille</th></tr></thead><tbody>${rows(svc) || '<tr><td colspan="6" class="faint">Aucun vendeur</td></tr>'}</tbody></table></div>`;
      return `<div class="eq-pad">
        <div class="crm-crumb"><span class="c">Équipes <span>/</span> ${esc(D.plaqueOf(site).replace('PLAQUE ', 'Plaque '))} <span>/</span> <b>${esc(site)}</b></span>
          <div class="acts"><button class="btn primary" data-act="addv">${GX.icon('plus', 'sm')}Ajouter un vendeur</button></div></div>
        <div><div class="crm-eye">Concession</div><h2 class="crm-name">${esc(site)}</h2>
          <div class="crm-tags"><span class="badge">${GX.icon('users', 'sm')}${vs.filter((v) => status(v) === 'present').length} vendeurs présents</span><span class="badge">${GX.icon('handshake', 'sm')}${F.n(tot)} clients en portefeuille</span>${ORPH.some((c) => c.site === site) ? `<span class="badge" style="--c:var(--warn)">${GX.icon('alert', 'sm')}${F.n(Math.round(ORPH.filter((c) => c.site === site).length * CD.SCALE))} à attribuer</span>` : ''}</div></div>
        <div class="crm-sec"><h3 class="crm-h2">Encadrement</h3><div class="eq-enc">${[['chefSite', 'Chef de site'], ['cdvVN', 'Chef des ventes VN'], ['cdvVO', 'Chef des ventes VO']].map(([k, l]) => `<div class="card" data-enc="${k}"><span class="crm-lbl">${l}</span><b>${e[k] ? esc(e[k]) : '<span class="faint">Non désigné</span>'}</b><span class="crm-note">Compte Gearbox · voit les portefeuilles du site</span></div>`).join('')}</div></div>
        <div class="row" style="gap:10px"><div class="seg" data-svc>${[['all', 'Tous'], ['VN', 'VN'], ['VO', 'VO']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${st.svc === k}">${l}</button>`).join('')}</div><span class="crm-note">Cliquer sur un vendeur pour sa fiche, son secteur et son portefeuille.</span></div>
        ${st.svc !== 'VO' ? tbl('VN') : ''}${st.svc !== 'VN' ? tbl('VO') : ''}</div>`;
    }
    function vendHTML(v) {
      const n = pfN(v), list = pf(v), ag = list.filter((c) => c.agent).length, re = list.filter((c) => c.pfOrigine === 'reattrib').length;
      const br = {}; list.forEach((c) => { const b = c.last?.brand || 'Renault'; br[b] = (br[b] || 0) + 1; });
      const tb = Object.values(br).reduce((a, b) => a + b, 0) || 1;
      return `<div class="eq-pad">
        <div class="crm-crumb"><span class="c">Équipes <span>/</span> <a data-act="back" style="cursor:pointer">${esc(v.site)}</a> <span>/</span> <b>${esc(fullV(v))}</b></span>
          <div class="acts"><button class="btn" data-act="edit">${GX.icon('edit', 'sm')}Modifier</button>${status(v) === 'present' || status(v) === 'part' ? `<button class="btn" data-act="depart" style="color:var(--warn)">${GX.icon('clock', 'sm')}${v.sortie ? 'Modifier le départ…' : 'Programmer un départ…'}</button>` : ''}<button class="btn" data-act="vmore" aria-label="Plus">${GX.icon('more', 'sm')}</button></div></div>
        <div class="crm-idt"><span class="av" style="--c:var(--bony-violet)">${esc(v.prenom[0] + v.nom[0])}</span><div class="grow"><div class="crm-eye">${v.service} · ${esc(v.site)}</div><h2 class="crm-name">${esc(fullV(v))}</h2>
          <div class="crm-tags">${fnBadge(v)}${GX.r.brandChips(v.marques)}${stBadge(v)}${!v.recoit ? `<span class="badge" style="--c:var(--text-3)">${GX.icon('lock', 'sm')}Ne reçoit pas de clients</span>` : ''}</div></div></div>
        <div class="crm-facts">
          <div class="card crm-fact"><span class="crm-lbl">Portefeuille</span><span class="v">${n ? F.n(n) : '—'}</span><span class="h">${status(v) === 'arrive' ? `commence le ${dFR(v.entree)}` : status(v) === 'sorti' ? 'réattribué à son départ' : 'clients dont il est le vendeur'}</span></div>
          <div class="card crm-fact"><span class="crm-lbl">Dont vendus via un agent</span><span class="v">${F.n(Math.round(ag * CD.SCALE))}</span><span class="h">restent à lui, agent noté à part</span></div>
          <div class="card crm-fact"><span class="crm-lbl">Reçus par réattribution</span><span class="v">${F.n(Math.round(re * CD.SCALE))}</span><span class="h">départs de collègues, orphelins</span></div>
          <div class="card crm-fact"><span class="crm-lbl">Secteur</span><span class="v">${v.secteurs.length ? plural(v.secteurs.length, 'zone') : '—'}</span><span class="h">${v.fonction === 'secteur' ? 'codes postaux attitrés' : 'pas de secteur attitré'}</span></div></div>
        <div class="crm-g2 eq">
          <div class="crm-sec"><h3 class="crm-h2">Fiche</h3><div class="card" style="padding:14px 16px"><div class="crm-kv">
            <span>Nom</span><b>${esc(v.nom.toUpperCase())}</b><span>Prénom</span><b>${esc(v.prenom)}</b><span>IPN</span><b class="crm-mono">${v.ipn}</b>
            <span>Téléphone</span><b>${v.tel}</b><span>E-mail</span><b>${esc(v.email)}</b>
            <span>Site</span><b>${esc(v.site)}</b><span>Service</span><b>${v.service}</b><span>Fonction</span><b>${FONCTIONS[v.fonction].l}</b>
            <span>Marques</span><b>${v.marques.join(', ')}</b><span>Entrée</span><b>${dFR(v.entree)}</b><span>Sortie</span><b>${v.sortie ? dFR(v.sortie) : '—'}</b>
            <span>Reçoit des clients</span><b>${v.recoit ? 'Oui' : 'Non (alternant, magasin…)'}</b></div></div></div>
          <div class="crm-sec"><h3 class="crm-h2">Secteur <span class="n">${v.secteurs.length}</span></h3><div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
            <div class="eq-cps" data-cps>${v.secteurs.map((s, i) => `<span class="badge">${s.length === 2 ? `Département ${s}` : s}<button class="btn sm ghost" data-rmcp="${i}" aria-label="Retirer" style="padding:0 2px;margin-left:2px">${GX.icon('close', 'sm')}</button></span>`).join('') || '<span class="faint">Aucun code postal</span>'}</div>
            <div class="row" style="gap:8px"><input class="input" data-cpin placeholder="Code postal (63270) ou département (43)" style="flex:1" /><button class="btn sm" data-act="addcp">${GX.icon('plus', 'sm')}Ajouter</button></div>
            <div class="crm-note">Un code postal précis l’emporte sur un département entier. Deux vendeurs secteur ne peuvent pas avoir le même code postal sur le même site, service et marque : SPARK le refuse.</div></div>
            <h3 class="crm-h2" style="margin-top:6px">Noms dans DCS</h3><div class="card" style="padding:14px 16px"><div class="eq-cps">${v.alias.map((a) => `<span class="badge crm-mono">${esc(a)}</span>`).join('')}</div><div class="crm-note" style="margin-top:8px">Les ventes DCS à ces noms lui sont rattachées. Gérées dans « Noms DCS ».</div></div></div></div>
        <div class="crm-sec"><h3 class="crm-h2">Portefeuille par marque</h3><div class="eq-bar">${Object.entries(br).map(([b, x]) => `<i style="width:${x / tb * 100}%;background:${D.brand(b)?.hex || 'var(--text-3)'}" data-tip="${b} : ${Math.round(x / tb * 100)} %"></i>`).join('')}</div>
          <div class="row" style="gap:10px"><button class="btn sm" data-act="voir">${GX.icon('search', 'sm')}Voir ses clients dans le Requêteur</button><button class="btn sm" data-act="transf">${GX.icon('swap', 'sm')}Transférer des clients…</button></div></div>
        <div class="crm-sec"><h3 class="crm-h2">Historique</h3><div class="crm-rel">${[...v.histo, ['users', `Créé (import du fichier MAEVA)`, dFR(addD(TODAY, -1))]].map(([i, l, d]) => `<div>${GX.icon(i, 'sm')}<span class="grow">${esc(l)}</span><span class="faint">${d}</span></div>`).join('')}</div></div></div>`;
    }
    function orgBuild(b) {
      if (st.vend) { b.innerHTML = `<div class="scroll crm-dhost" style="height:100%">${vendHTML(V.find((v) => v.id === st.vend))}</div>`; return wireVend(b); }
      if (compact) { b.innerHTML = `<div class="scroll crm-dhost" style="height:100%"><div style="padding:12px 18px"><select class="select" data-sitesel>${SITES.map((s) => `<option ${s === st.site ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>${siteHTML(st.site)}</div>`; b.querySelector('[data-sitesel]').addEventListener('change', (e) => { st.site = e.target.value; orgBuild(b); }); return wireSite(b); }
      b.innerHTML = `<div class="split crm-split" style="--side-w:260px"><div class="side">${sitesHTML()}</div><div class="main scroll crm-dhost" data-sd>${siteHTML(st.site)}</div></div>`;
      b.querySelectorAll('[data-site]').forEach((el) => el.addEventListener('click', () => { st.site = el.dataset.site; GX.store.set('crm.eq.site', st.site); orgBuild(b); }));
      b.querySelector('[data-act=addsite]')?.addEventListener('click', () => win.sheet(`<h3>Nouveau site</h3><div class="muted">GRID n’a pas d’écran pour ça (Lavaur y a été ajouté en SQL) : SPARK l’aura.</div>
        <label class="field" style="margin-top:12px"><span class="label">Nom</span><input class="input" placeholder="Saint-Flour" /></label><label class="field"><span class="label">Plaque</span><select class="select">${PLAQ.map((p) => `<option>${p.l}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Codes d’affaire DCS rattachés</span><input class="input" placeholder="VNVOSF" /></label><div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">Créer</button></div>`, { width: 460 }));
      wireSite(b);
    }
    function wireSite(b) {
      b.querySelector('[data-svc]')?.addEventListener('change', (e) => { st.svc = e.detail; setTimeout(() => orgBuild(b), 120); });
      b.querySelectorAll('[data-vid]').forEach((tr) => tr.addEventListener('click', () => { st.vend = +tr.dataset.vid; orgBuild(b); }));
      b.querySelector('[data-act=addv]')?.addEventListener('click', () => editSheet(null, () => orgBuild(b)));
      b.querySelectorAll('[data-enc]').forEach((el) => el.addEventListener('click', () => win.sheet(`<h3>${el.querySelector('.crm-lbl').textContent} · ${esc(st.site)}</h3><div class="muted">Un seul titulaire par rôle et par site (comme GRID). C’est un compte Gearbox : il verra les portefeuilles de son site quand SPARK s’ouvrira aux chefs de site.</div>
        <label class="field" style="margin-top:12px"><span class="label">Compte</span><select class="select"><option>${esc(ENC[st.site][el.dataset.enc] || '— Aucun —')}</option><option>— Aucun —</option></select></label><div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">Enregistrer</button></div>`, { width: 440 })));
    }
    function wireVend(b) {
      const v = V.find((x) => x.id === st.vend), re = () => orgBuild(b);
      b.querySelector('[data-act=back]')?.addEventListener('click', () => { st.vend = null; re(); });
      b.querySelector('[data-act=edit]')?.addEventListener('click', () => editSheet(v, re));
      b.querySelector('[data-act=depart]')?.addEventListener('click', () => departSheet(v, re));
      b.querySelector('[data-act=transf]')?.addEventListener('click', () => transfSheet(v, re));
      b.querySelector('[data-act=voir]')?.addEventListener('click', () => GX.shell.hud(`Requêteur : « Vendeur du portefeuille est ${fullV(v)} »`));
      b.querySelector('[data-act=vmore]')?.addEventListener('click', (e) => GX.menu.open([{ label: 'Changer de site…', icon: 'swap', action: () => GX.shell.hud('Transfert de site : l’historique suit le vendeur, ses clients restent à lui') }, { label: 'Archiver', icon: 'archives', action: () => GX.shell.hud('Archivé : masqué des listes, réversible (comme GRID)') }], e.currentTarget, { align: 'right' }));
      b.querySelector('[data-act=addcp]')?.addEventListener('click', () => { const i = b.querySelector('[data-cpin]'), x = i.value.trim(); if (!/^\d{2}(\d{3})?$/.test(x)) return GX.shell.hud('Code postal (5 chiffres) ou département (2 chiffres)'); v.secteurs.push(x); GX.shell.hud(`${x} ajouté · aperçu du recalcul : ${int(rng(+x), 4, 90)} clients orphelins le rejoindront cette nuit`); re(); });
      b.querySelectorAll('[data-rmcp]').forEach((x) => x.addEventListener('click', () => { v.secteurs.splice(+x.dataset.rmcp, 1); re(); }));
    }

    /* ---------- Fiches (création / modification, départ, transfert) ---------- */
    function editSheet(v, done) {
      const x = v || { prenom: '', nom: '', site: st.site, service: 'VN', marques: ['Renault'], fonction: 'hall', recoit: true, entree: TODAY, sortie: null, ipn: '', tel: '', email: '' };
      win.sheet(`<div class="label" style="color:var(--bony-violet)">Référentiel vendeurs</div><h3 style="margin:2px 0 8px">${v ? 'Modifier ' + esc(fullV(v)) : 'Ajouter un vendeur'}</h3>
        <div class="crm-g2 eq" style="gap:10px"><label class="field"><span class="label">Nom</span><input class="input" value="${esc(x.nom)}" /></label><label class="field"><span class="label">Prénom</span><input class="input" value="${esc(x.prenom)}" /></label>
        <label class="field"><span class="label">Site</span><select class="select">${SITES.map((s) => `<option ${s === x.site ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Service</span><select class="select"><option ${x.service === 'VN' ? 'selected' : ''}>VN</option><option ${x.service === 'VO' ? 'selected' : ''}>VO</option></select></label>
        <label class="field"><span class="label">Fonction</span><select class="select">${Object.entries(FONCTIONS).map(([k, f]) => `<option ${k === x.fonction ? 'selected' : ''}>${f.l}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Marques</span><input class="input" value="${x.marques.join(', ')}" /></label>
        <label class="field"><span class="label">Date d’entrée</span><input class="input" type="date" value="${x.entree}" /></label><label class="field"><span class="label">Date de sortie</span><input class="input" type="date" value="${x.sortie || ''}" /></label>
        <label class="field"><span class="label">IPN</span><input class="input crm-mono" value="${x.ipn}" placeholder="D123456" /></label><label class="field"><span class="label">Téléphone</span><input class="input" value="${x.tel}" /></label></div>
        <label class="field"><span class="label">E-mail</span><input class="input" value="${esc(x.email)}" /></label>
        <label class="row" style="gap:8px;margin-top:8px"><input type="checkbox" ${x.recoit ? 'checked' : ''} /> Reçoit des clients (décocher : alternant, magasin, absence longue)</label>
        <div class="crm-note" style="margin-top:8px">Une date d’entrée future : il n’entre dans la répartition qu’à cette date. Une date de sortie : ses clients sont réattribués la nuit qui suit.</div>
        <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">Enregistrer</button></div>`, { width: 620, onClose: (r) => { if (r === 'ok') { GX.shell.hud(v ? 'Vendeur modifié' : 'Vendeur ajouté'); done(); } } });
    }
    function previewDepart(v) {
      const n = pfN(v) || 1240, sec = V.filter((x) => x.site === v.site && x.fonction === 'secteur' && status(x) === 'present' && x !== v);
      const hall = V.filter((x) => x.site === v.site && x.fonction === 'hall' && x.service === v.service && status(x) === 'present' && x !== v && x.recoit);
      const a = Math.round(n * .46), s = Math.round(n * .04), h = n - a - s;
      return `<div class="eq-prev">
        <div>${GX.icon('pin', 'sm')}<span class="grow"><b>${F.n(a)}</b> → secteur (${sec.map((x) => esc(fullV(x))).join(', ') || 'aucun'})</span></div>
        <div>${GX.icon('users', 'sm')}<span class="grow"><b>${F.n(h)}</b> → hall ${v.service}, répartis entre ${hall.map((x) => `${esc(fullV(x))} (+${F.n(Math.round(h / Math.max(1, hall.length)))})`).join(', ') || 'personne'}</span></div>
        <div style="color:var(--warn)">${GX.icon('alert', 'sm')}<span class="grow"><b>${F.n(s)}</b> → à attribuer (aucun vendeur ${v.service} sur leur marque)</span></div></div>`;
    }
    function departSheet(v, done) {
      win.sheet(`<div class="label" style="color:var(--warn)">Départ</div><h3 style="margin:2px 0 8px">${esc(fullV(v))} quitte ${esc(v.site)}</h3>
        <label class="field"><span class="label">Dernier jour</span><input class="input" type="date" value="${v.sortie || addD(TODAY, 16)}" /></label>
        <div class="field" style="margin-top:10px"><span class="label">Ses ${F.n(pfN(v) || 1240)} clients</span>
          <label class="row" style="gap:8px;margin-top:6px"><input type="radio" name="eqdep" checked /> Les répartir selon les règles (recommandé)</label>
          <label class="row" style="gap:8px;margin-top:6px"><input type="radio" name="eqdep" /> Tout donner à : <select class="select" style="flex:1">${V.filter((x) => x.site === v.site && x !== v && status(x) !== 'sorti').map((x) => `<option>${esc(fullV(x))}${status(x) === 'arrive' ? ` (arrive le ${dFR(x.entree)})` : ''}</option>`).join('')}</select></label></div>
        <div class="crm-lbl" style="margin-top:14px">Aperçu au ${dFR(v.sortie || addD(TODAY, 16))}</div>${previewDepart(v)}
        <div class="crm-note" style="margin-top:12px">Rien ne bouge avant le dernier jour : la réattribution se fait la nuit qui suit, et chaque client garde la trace « réattribué depuis ${esc(fullV(v))} ». Les clients verrouillés à son nom passent dans « À attribuer ».</div>
        <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" style="background:var(--warn)">Programmer le départ</button></div>`, { width: 560, onClose: (r) => { if (r !== 'ok') return; v.sortie = v.sortie || addD(TODAY, 16); v.histo.unshift(['clock', `Départ programmé au ${dFR(v.sortie)} par Théo L.`, dFR(TODAY)]); GX.shell.hud('Départ programmé'); done(); } });
    }
    function transfSheet(v, done) {
      win.sheet(`<h3>Transférer des clients de ${esc(fullV(v))}</h3><div class="muted">Pour un rééquilibrage ou une absence longue, sans départ.</div>
        <label class="field" style="margin-top:12px"><span class="label">Quels clients</span><select class="select"><option>Ceux d’un code postal ou département…</option><option>Ceux d’une marque…</option><option>Une liste du Requêteur…</option><option>Tous</option></select></label>
        <label class="field"><span class="label">Vers</span><select class="select">${V.filter((x) => x.site === v.site && x !== v && status(x) === 'present').map((x) => `<option>${esc(fullV(x))}</option>`).join('')}</select></label>
        <label class="row" style="gap:8px;margin-top:8px"><input type="checkbox" /> Verrouiller (le recalcul ne les déplacera plus)</label>
        <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">Transférer</button></div>`, { width: 500, onClose: (r) => { if (r === 'ok') { GX.shell.hud('Clients transférés'); done(); } } });
    }

    /* ---------- Noms DCS ---------- */
    function dcsHTML() {
      return `<div class="eq-pad"><div><div class="crm-eye">Correspondances</div><h2 class="crm-name" style="font-size:22px">Noms de vendeurs dans DCS</h2>
        <div class="crm-note" style="max-width:760px">DCS écrit le vendeur en texte libre (« Nom vendeur1 »). SPARK rattache chaque nom à un vendeur du référentiel : automatiquement quand le nom colle (113 sur 138 au chargement du fichier MAEVA), à valider sinon. Un nom sans vendeur = un <b>ancien vendeur</b> : ses clients sont réattribués.</div></div>
        <table class="eq-tbl"><thead><tr><th>Nom dans DCS</th><th class="r">Ventes</th><th class="hide-m">Dernière vente</th><th>Rattaché à</th><th>État</th><th></th></tr></thead><tbody>
        ${DCS.slice().sort((a, b) => (a.etat === 'auto') - (b.etat === 'auto')).map((d, i) => { const v = V.find((x) => x.id === d.vendeur), [l, c] = DCS_ST[d.etat]; return `<tr><td><b class="crm-mono">${esc(d.nom)}</b>${d.note ? `<div class="faint" style="font-size:12px">${esc(d.note)}</div>` : ''}</td><td class="r">${F.n(d.ventes)}</td><td class="hide-m">${dFR(d.derniere)}</td>
          <td>${v ? `${esc(fullV(v))} <span class="faint">· ${esc(v.site)}</span>` : '<span class="faint">—</span>'}</td><td><span class="badge" style="--c:${c}">${l}</span></td>
          <td class="r">${d.etat === 'proposé' ? `<button class="btn sm primary" data-ok="${esc(d.nom)}">Valider</button> ` : ''}${d.etat !== 'auto' ? `<button class="btn sm" data-dcs="${esc(d.nom)}">Rattacher…</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
    }
    function wireDcs(b) {
      const re = () => { render(); };
      b.querySelectorAll('[data-ok]').forEach((x) => x.addEventListener('click', () => { DCS.find((d) => d.nom === x.dataset.ok).etat = 'auto'; GX.shell.hud('Correspondance validée · ses ventes rejoignent son portefeuille cette nuit'); re(); }));
      b.querySelectorAll('[data-dcs]').forEach((x) => x.addEventListener('click', (e) => GX.menu.open([
        { header: x.dataset.dcs }, ...V.filter((v) => status(v) !== 'sorti').slice(0, 6).map((v) => ({ label: `${fullV(v)} · ${v.site}`, icon: 'user', action: () => { Object.assign(DCS.find((d) => d.nom === x.dataset.dcs), { etat: 'auto', vendeur: v.id }); re(); } })), '-',
        { label: 'Ancien vendeur (réattribuer ses clients)', icon: 'clock', action: () => { Object.assign(DCS.find((d) => d.nom === x.dataset.dcs), { etat: 'ancien', vendeur: null }); re(); } },
        { label: 'Pas un vendeur (direction, compte générique)', icon: 'close', action: () => { Object.assign(DCS.find((d) => d.nom === x.dataset.dcs), { etat: 'pas', vendeur: null }); re(); } },
      ], e.currentTarget, { align: 'right' })));
    }

    /* ---------- Règles ---------- */
    function regHTML() {
      return `<div class="eq-pad"><div><div class="crm-eye">Recalcul automatique</div><h2 class="crm-name" style="font-size:22px">Règles du portefeuille</h2>
        <div class="crm-note" style="max-width:760px">Chaque nuit après l’import, et à chaque changement du référentiel (entrée, sortie, secteur, marque), SPARK recalcule à qui appartient chaque client <b>qui n’a plus de vendeur présent</b>. Un client qui a un vendeur présent ne bouge jamais tout seul : pas de rééquilibrage automatique. Chaque changement est tracé sur la fiche du client.</div></div>
        <div class="crm-sec"><h3 class="crm-h2">Dans l’ordre</h3><div class="eq-rules">${REGLES.map(([i, l, t], k) => `<div class="card eq-rule"><span class="k">${k + 1}</span><div class="grow"><b>${GX.icon(i, 'sm')} ${l}</b><div class="crm-note" style="margin-top:3px">${t}</div></div></div>`).join('')}</div></div>
        <div class="crm-sec"><h3 class="crm-h2">Règles particulières <span class="n">${PART.length}</span></h3>
          <table class="eq-tbl"><thead><tr><th style="width:44px">Active</th><th>Site</th><th>Condition</th><th>Va à</th></tr></thead><tbody>${PART.map((p, i) => `<tr><td><input type="checkbox" data-part="${i}" ${p.on ? 'checked' : ''} /></td><td>${esc(p.site)}</td><td>${esc(p.l)}</td><td>${esc(p.dest)}</td></tr>`).join('')}</tbody></table>
          <div><button class="btn sm" data-act="addpart">${GX.icon('plus', 'sm')}Ajouter une règle…</button> <span class="crm-note">Reprises de la feuille « EXTRACTION DCSNET » du fichier MAEVA.</span></div></div>
        <div class="crm-sec"><h3 class="crm-h2">Derniers recalculs</h3><div class="crm-rel">${JOURNAL.map((j) => `<div>${GX.icon('refresh', 'sm')}<span class="grow"><b>${F.n(j.n)}</b> client${j.n > 1 ? 's' : ''} ont changé de vendeur — ${esc(j.det)}</span><span class="faint">${dFR(j.d)}</span></div>`).join('')}</div>
          <div><button class="btn sm" data-act="simu">${GX.icon('eye', 'sm')}Simuler le recalcul maintenant</button></div></div></div>`;
    }
    function wireReg(b) {
      b.querySelectorAll('[data-part]').forEach((x) => x.addEventListener('change', () => { PART[+x.dataset.part].on = x.checked; GX.shell.hud(x.checked ? 'Règle activée · effet au prochain recalcul' : 'Règle désactivée'); }));
      b.querySelector('[data-act=simu]')?.addEventListener('click', () => win.sheet(`<h3>Simulation (rien n’est écrit)</h3><div class="muted">Si le recalcul tournait maintenant :</div><div class="eq-prev"><div>${GX.icon('pin', 'sm')}<span class="grow"><b>24</b> orphelins → secteur</span></div><div>${GX.icon('users', 'sm')}<span class="grow"><b>11</b> orphelins → hall</span></div><div>${GX.icon('alert', 'sm')}<span class="grow"><b>3</b> → à attribuer</span></div></div><div class="foot"><button class="btn" data-sheet="">Fermer</button><button class="btn primary" data-sheet="ok">Appliquer maintenant</button></div>`, { width: 460 }));
      b.querySelector('[data-act=addpart]')?.addEventListener('click', () => win.sheet(`<h3>Nouvelle règle particulière</h3><label class="field"><span class="label">Site</span><select class="select">${SITES.map((s) => `<option>${esc(s)}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Quand le client…</span><select class="select"><option>a un code postal parmi…</option><option>a acheté via l’agent…</option><option>a acheté sur l’affaire DCS…</option><option>a acheté au vendeur (ancien)…</option></select></label><label class="field"><span class="label">Valeurs</span><input class="input" placeholder="43100, 43360…" /></label>
        <label class="field"><span class="label">Il va à</span><select class="select"><option>Un vendeur précis…</option><option>Le secteur d’un autre site…</option><option>Le hall d’un autre site…</option></select></label><div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">Ajouter</button></div>`, { width: 500 }));
    }

    /* ---------- À attribuer ---------- */
    function orphHTML() {
      const bySite = {}; ORPH.forEach((c) => (bySite[c.site] = bySite[c.site] || []).push(c));
      return `<div class="eq-pad"><div><div class="crm-eye">File d’attente</div><h2 class="crm-name" style="font-size:22px">Clients à attribuer</h2><div class="crm-note" style="max-width:760px">Aucune règle n’a trouvé de vendeur (souvent : aucun vendeur du bon service ou de la bonne marque sur le site). Le chef de site les répartit ; on peut aussi ajouter un vendeur ou une règle, et la file se vide au recalcul suivant.</div></div>
        ${Object.entries(bySite).map(([s, L]) => `<div class="crm-sec"><h3 class="crm-h2">${esc(s)} <span class="n">${F.n(Math.round(L.length * CD.SCALE))}</span></h3><table class="eq-tbl"><thead><tr><th style="width:30px"><input type="checkbox" data-all="${esc(s)}" /></th><th>Client</th><th class="hide-m">CP</th><th>Dernier achat</th><th class="hide-m">Pourquoi</th></tr></thead><tbody>
          ${L.slice(0, 5).map((c) => `<tr class="cl" data-cid="${c.id}"><td><input type="checkbox" data-sel /></td><td><b>${esc(H.nameOf(c))}</b></td><td class="hide-m">${c.cp}</td><td>${esc(c.last.typeVH)} ${esc(c.last.brand || '')} · ${dFR(c.last.date)}</td><td class="hide-m faint">${c.last.typeVH === 'VO' ? 'Aucun vendeur VO présent' : `Aucun vendeur ${esc(c.last.brand || 'Renault')} au hall`}</td></tr>`).join('')}</tbody></table>
          <div><button class="btn sm" data-give="${esc(s)}">${GX.icon('handshake', 'sm')}Attribuer la sélection à…</button></div></div>`).join('')}</div>`;
    }
    function wireOrph(b) {
      b.querySelectorAll('[data-cid]').forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('input')) return; openClient(tr.dataset.cid, tr); }));
      b.querySelectorAll('[data-give]').forEach((x) => x.addEventListener('click', (e) => GX.menu.open(V.filter((v) => v.site === x.dataset.give && status(v) === 'present').map((v) => ({ label: `${fullV(v)} · ${v.service} ${FONCTIONS[v.fonction].l}`, icon: 'user', action: () => GX.shell.hud(`Attribués à ${fullV(v)}`) })), e.currentTarget)));
    }
    render();
  }

  /* =====================================================================
     Fiche client : portefeuille, agent, ne plus contacter par canal, échanges
     ===================================================================== */
  const CANAUX = [['email', 'E-mail', 'mail'], ['sms', 'SMS', 'sms'], ['tel', 'Téléphone', 'message'], ['courrier', 'Courrier', 'file']];
  const pfBadge = (c) => {
    const tip = c.pfVerrou ? `Choisi par ${c.pfVerrou} · verrouillé` : c.pfOrigine === 'reattrib' ? `Réattribué le ${dFR(c.pfDepuis.le)} (départ de ${c.pfDepuis.de}) · règle ${c.pfDepuis.regle}` : c.pfOrigine === 'orphelin' ? 'Aucun vendeur : dans « À attribuer »' : 'Vendeur de son dernier achat';
    return `<span class="badge" style="--c:${c.vendeurRef ? 'var(--bony-violet)' : 'var(--warn)'}" data-tip="${esc(tip)}">${GX.icon(c.pfVerrou ? 'lock' : 'handshake', 'sm')}Portefeuille : ${c.vendeurRef ? esc(c.vendeurRef) : 'à attribuer'}${c.pfOrigine === 'reattrib' ? ' <span style="opacity:.7">· réattribué</span>' : ''}</span>${c.agent ? `<span class="badge" style="--c:var(--text-3)" data-tip="Seconde variable : l’agent a vendu, le client reste au portefeuille de notre vendeur">${GX.icon('building', 'sm')}Vendu via ${esc(c.agent)}</span>` : ''}`;
  };
  function reassign(c, win, refresh) {
    const vs = V.filter((v) => v.site === c.site && status(v) !== 'sorti');
    win.sheet(`<div class="label" style="color:var(--bony-violet)">Portefeuille</div><h3 style="margin:2px 0 8px">Vendeur de ${esc(H.nameOf(c))}</h3><div class="muted" style="line-height:1.5">Actuellement : <b style="color:var(--text)">${c.vendeurRef ? esc(c.vendeurRef) : 'à attribuer'}</b>. Par défaut, le vendeur du dernier achat ; réattribué automatiquement si le vendeur part.</div>
      <label class="field" style="margin-top:14px"><span class="label">Vendeur</span><select class="select" id="eqVr">${Object.entries(FONCTIONS).map(([k, f]) => { const L = vs.filter((v) => v.fonction === k); return L.length ? `<optgroup label="${f.l}">${L.map((v) => `<option ${fullV(v) === c.vendeurRef ? 'selected' : ''} value="${esc(fullV(v))}">${esc(fullV(v))} · ${v.service}${status(v) !== 'present' ? ` (${ST[status(v)][0].toLowerCase()})` : ''}</option>`).join('')}</optgroup>` : ''; }).join('')}</select></label>
      <label class="row" style="gap:8px;margin-top:10px"><input type="checkbox" id="eqLock" ${c.pfVerrou ? 'checked' : ''} /> Verrouiller : le recalcul automatique ne le changera plus</label>
      <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">Enregistrer</button></div>`, { width: 480, onClose: (r) => { const s = document.getElementById('eqVr')?.value, l = document.getElementById('eqLock')?.checked; if (r === 'ok' && s) { c.vendeurRef = s; c.pfOrigine = 'manuel'; c.pfVerrou = l ? `Théo L. le ${dFR(TODAY)}` : null; c.vendeurRefBy = `Théo L. le ${dFR(TODAY)}`; GX.shell.hud('Portefeuille mis à jour'); refresh(); } } });
  }
  function nplcSheet(c, win, refresh) {
    const n = c.nplcC || {};
    win.sheet(`<div class="label" style="color:var(--danger)">Ne plus contacter</div><h3 style="margin:2px 0 8px">${esc(H.nameOf(c))}</h3><div class="muted" style="line-height:1.5">Le client sort automatiquement de tous les exports et de tous les comptages du Requêteur, sur les canaux cochés. Aucun import ne lève ce statut.</div>
      <label class="row" style="gap:8px;margin-top:12px;font-weight:600"><input type="checkbox" id="eqAll" ${c.nplc ? 'checked' : ''} /> Ne plus contacter du tout</label>
      <div class="eq-canaux">${CANAUX.map(([k, l, i]) => `<label><input type="checkbox" data-can="${k}" ${c.nplc || n[k] ? 'checked' : ''} />${GX.icon(i, 'sm')}${l}</label>`).join('')}</div>
      <label class="field" style="margin-top:12px"><span class="label">Motif</span><select class="select" id="eqMot"><option>Demande du client</option><option>Désinscription (STOP, lien e-mail)</option><option>Client décédé</option><option>Litige en cours</option><option>Autre</option></select></label>
      <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" style="background:var(--danger)">Enregistrer</button></div>`, { width: 480, onClose: (r) => {
      if (r !== 'ok') return;
      const all = document.getElementById('eqAll')?.checked, mot = document.getElementById('eqMot')?.value;
      const can = Object.fromEntries([...document.querySelectorAll('[data-can]')].map((x) => [x.dataset.can, x.checked]));
      c.nplc = all ? { by: 'Théo L.', date: dFR(TODAY), motif: mot } : null; c.nplcC = all ? null : can;
      GX.shell.hud(all ? 'Ne plus contacter : tous canaux' : 'Canaux refusés enregistrés'); refresh();
    } });
  }
  const nplcBanner = (c) => {
    const n = c.nplcC && Object.entries(c.nplcC).filter(([, v]) => v).map(([k]) => CANAUX.find((x) => x[0] === k)[1]);
    return !c.nplc && n?.length ? `<div class="crm-stop" style="--c:var(--warn)">${GX.icon('belloff')}<div class="grow"><b>Refuse :</b> ${n.join(', ')}. Exclu des exports sur ces canaux.</div><button class="btn sm" data-act="nplc">Modifier</button></div>` : '';
  };

  /* Échanges : couche Bony (saisie par les utilisateurs), jamais touchée par l'import */
  const TYPES = { appel: ['Appel', 'message'], email: ['E-mail', 'mail'], sms: ['SMS', 'sms'], visite: ['Visite', 'users'], note: ['Note', 'edit'] };
  const RES = ['Intéressé', 'Projet d’achat', 'À rappeler', 'Pas intéressé', 'Injoignable', 'Information'];
  const echOf = (c) => {
    if (c.ech) return c.ech;
    const r = rng(c.i * 7 + 3), n = c.i % 3 === 0 ? int(r, 1, 4) : 0;
    return (c.ech = Array.from({ length: n }, (_, k) => ({ type: pk(r, Object.keys(TYPES)), res: pk(r, RES), d: addD(TODAY, -int(r, 3 + k * 40, 30 + k * 60)), by: c.vendeurRef || 'Théo L.', txt: pk(r, ['Rappeler après les vacances, réfléchit à un Austral.', 'Fin de LOA en mars : intéressé par une reprise.', 'Ne souhaite pas changer de véhicule cette année.', 'Venu en concession pour l’essai du Duster.', 'Messagerie, message laissé.']), rappel: null })).sort((a, b) => b.d.localeCompare(a.d)));
  };
  const echCount = (c) => echOf(c).length;
  function echHTML(c) {
    const L = echOf(c);
    return `<div class="crm-sec"><div class="row" style="gap:10px"><h3 class="crm-h2 grow">Échanges <span class="n">${L.length}</span></h3><button class="btn sm primary" data-act="addech">${GX.icon('plus', 'sm')}Noter un échange</button></div>
      <div class="crm-note">Appels, e-mails, visites et notes. Couche Bony : saisie par les utilisateurs, jamais modifiée par l’import du soir. Un « À rappeler » daté remonte dans le Requêteur.</div>
      <div class="eq-ech">${L.map((e) => `<div class="card eq-ev"><span class="ic">${GX.icon(TYPES[e.type][1], 'sm')}</span><div class="grow"><div class="row" style="gap:8px;flex-wrap:wrap"><b>${TYPES[e.type][0]}</b><span class="badge">${esc(e.res)}</span>${e.rappel ? `<span class="badge" style="--c:var(--warn)">${GX.icon('clock', 'sm')}rappel le ${dFR(e.rappel)}</span>` : ''}<span class="grow"></span><span class="faint" style="font-size:12.5px">${dFR(e.d)} · ${esc(e.by)}</span></div><div style="margin-top:4px;line-height:1.5">${esc(e.txt)}</div></div></div>`).join('') || `<div class="crm-soon">${GX.icon('message', 'lg')}<div>Aucun échange noté pour ce client.</div></div>`}</div></div>`;
  }
  function wireEch(host, c, win, rt) {
    host.querySelector('[data-act=addech]')?.addEventListener('click', () => win.sheet(`<h3>Noter un échange</h3>
      <div class="crm-g2 eq" style="gap:10px"><label class="field"><span class="label">Type</span><select class="select" id="eqT">${Object.entries(TYPES).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Date</span><input class="input" type="date" id="eqD" value="${TODAY}" /></label>
      <label class="field"><span class="label">Résultat</span><select class="select" id="eqR">${RES.map((x) => `<option>${x}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Rappeler le</span><input class="input" type="date" id="eqRp" /></label></div>
      <label class="field"><span class="label">Compte rendu</span><textarea class="input" id="eqX" rows="4" placeholder="Ce qui a été dit, le projet du client…"></textarea></label>
      <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">Enregistrer</button></div>`, { width: 540, onClose: (r) => {
      if (r !== 'ok') return; const g = (id) => document.getElementById(id)?.value;
      echOf(c).unshift({ type: g('eqT'), d: g('eqD') || TODAY, res: g('eqR'), rappel: g('eqRp') || null, txt: g('eqX') || '(sans texte)', by: 'Théo L.' });
      GX.shell.hud('Échange enregistré'); rt();
    } }));
  }

  GX.crmEquipes = { build, reassign, nplcSheet, nplcBanner, pfBadge, echHTML, wireEch, echCount, aValider };
})();
