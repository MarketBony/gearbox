/* =====================================================================
   SPARK (CRM) · onglet « Requêteur » — MAQUETTE statique (branchée par crm.js via GX.crmReq)

   L'inverse du Requêteur DCS : une requête se lit comme une liste de phrases en français.
   - Gauche  : Recettes prêtes à l'emploi, Mes requêtes (perso / partagées), Historique des exports.
   - Centre  : le constructeur. Des « briques » groupées par famille (Client, Véhicule, Achat,
               Financement, Coordonnées, Sauf). ET entre briques, OU entre les valeurs d'une brique.
               Niveau (une ligne par client / par véhicule) et canal (garde-fous + dédoublonnage auto).
   - Droite  : le résultat en direct (compteur, joignabilité, répartitions, aperçu, avertissements)
               et la barre d'export (Excel, CSV e-mailing, SMS, phoning imprimable, courrier), tracée.

   Champs : UNIQUEMENT ceux de la base RCU (backend/rcu-migrations/001_socle.sql, 003_clients.sql) :
   client (type, civilite, cp, ville, site, sites, vendeur…), vehicule (marque, modele, energie, genre,
   date_mec, ct_prochain), vente (type_vh, date_livraison, type_vente, montant_tarif, montant_reprise,
   vendeurs, intermediaire, site, fin_organisme, fin_famille, fin_debut, fin_fin, fin_duree),
   contacts (valide / suspect), identite_generique. Pas de kilométrage, pas de fin de garantie, pas de
   consentement : ils n'existent pas. « Ne plus contacter » et « déjà ciblé » : lot 4.

   Données : l'échantillon fictif de crm.js (GX.crmData, 4 000 fiches) ; les compteurs sont extrapolés
   au volume réel (× SCALE), comme dans l'onglet Clients. En vrai : la requête part au serveur
   (POST /api/crm/requetes/compter), Postgres compte, le navigateur ne reçoit que les chiffres et
   20 lignes d'aperçu.
   ===================================================================== */
(() => {
  if (!GX.crmData) return;
  const X = GX.crmData, H = X.h, D = GX.data, F = GX.fmt, esc = GX.esc;
  const TODAY = X.TODAY, ME = 'Théo L.';
  const { dFR, mDiff, addM, addY, tel, nameOf } = H;
  const sc = (k) => Math.round(k * X.SCALE);                       // échantillon → volume réel
  const yrs = (iso) => mDiff(iso, TODAY) / 12;
  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const has = (x) => x !== null && x !== undefined && x !== '';
  const inR = (x, a, b) => (!has(a) || x >= +a) && (!has(b) || x <= +b);
  const n0 = (x) => F.n(x);
  const svg = (d) => `<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  /* Pictogrammes absents du jeu commun (core.js) : dessinés ici au même trait */
  const IC = {
    phone: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>'),
    printer: svg('<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
    sheet: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
    letter: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  };

  /* ---------------- Ce que la base sait de chaque client (dérivé de l'échantillon) ---------------- */
  const VU = new Set(['Kangoo Van', 'Trafic Fourgon']);   // genre VU (vehicule.genre) ; le reste en VP
  X.CLIENTS.forEach((c) => {
    const k = (t, e) => c.contacts.find((x) => x.type === t && x.etat === e);
    c._rq = {
      mail: k('E-mail', 'valide')?.val || null, mailSus: !!k('E-mail', 'suspect'),
      port: k('Portable', 'valide')?.val || null, portSus: !!k('Portable', 'suspect'),
      fixe: k('Fixe', 'valide')?.val || null,
      adr: (c.i * 7) % 23 !== 0,                       // adresse complète (n°, voie, CP, ville) — ~4 % incomplètes
      gen: c.soc && c.i % 37 === 5,                    // rcu.identite_generique (> 20 véhicules, « Groupe Bony », 77777…)
      cible: (c.i * 13) % 11 === 0,                    // déjà dans un export récent (journal) — lot 4
      lines: c.sales.map((s) => ({ c, s, v: s.veh })),
    };
  });

  /* ---------------- Familles et briques ---------------- */
  const FAMS = {
    client: { l: 'Client', i: 'user', c: '#5b7fd6' },
    veh: { l: 'Véhicule', i: 'car', c: '#14b8a6' },
    achat: { l: 'Achat', i: 'tag', c: '#f75632' },
    fin: { l: 'Financement', i: 'euro', c: '#8b5cf6' },
    coord: { l: 'Coordonnées', i: 'mail', c: '#d97706' },
    sauf: { l: 'Sauf', i: 'minus', c: 'var(--danger)' },
  };
  const FAM_ORDER = Object.keys(FAMS);
  const b_ = (v) => `<b>${esc(String(v))}</b>`;
  const ou = (a, map = (x) => x) => { const t = a.map((x) => b_(map(x))); return t.length < 2 ? t.join('') : `${t.slice(0, -1).join(', ')} ou ${t[t.length - 1]}`; };
  const span = (a, b, u) => has(a) && has(b) ? (+a === +b ? `${a} ${u}` : `de ${a} à ${b} ${u}`) : has(a) ? `plus de ${a} ${u}` : has(b) ? `moins de ${b} ${u}` : 'peu importe';
  const dans = (a, b, u) => (!has(a) || +a === 0) && has(b) ? `dans les ${b} ${u}` : has(a) && has(b) ? `dans ${a} à ${b} ${u}` : has(a) ? `dans plus de ${a} ${u}` : 'à n’importe quelle date';
  const DEPS = { '03': 'Allier', 12: 'Aveyron', 15: 'Cantal', 19: 'Corrèze', 42: 'Loire', 43: 'Haute-Loire', 46: 'Lot', 48: 'Lozère', 63: 'Puy-de-Dôme', 81: 'Tarn' };
  const DEP_L = Object.entries(DEPS).map(([k, v]) => `${String(k).padStart(2, '0')} ${v}`).sort();
  const CIV_M = { Madame: 'F', Monsieur: 'H', Couple: 'C', Société: 'S' };
  const VH_M = { VN: 'VN', VO: 'VO', 'Ancienne base': 'BSO' };
  const BRANDS = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize'];
  const BR_C = Object.fromEntries(BRANDS.map((b) => [b, D.brand(b)?.hex]));
  const VENDS = [...new Set(Object.values(X.VENDEURS).flat())].sort();
  const vendGroups = () => Object.entries(X.VENDEURS).map(([s, vs]) => ({ label: s, items: [...new Set(vs)].map((v) => ({ v, l: v })) }));
  const modGroups = () => Object.entries(X.MODELS).map(([b, ms]) => ({ label: b, items: [...new Set(ms.map((m) => m[0]))].map((m) => ({ v: m, l: m })) }));
  /* Zones de chalandise des concessions (règles de ciblage Bony, feuille « EXTRACTION DCSNET » du fichier vendeurs) */
  const RULE_AGENT = '<b>Règle Bony :</b> pour un événement en concession, on ne prend <b>que les clients sans agent</b> ; pour une opération chez un agent, <b>uniquement ses clients</b>. On n’envoie pas nos clients chez les agents.';
  const perSite = () => { const p = GX.ctx && GX.ctx.perimetre; return p && p !== 'Tout le réseau' && GX.data.SITES.includes(p) ? p : null; };
  const ZONES = { Clermont: ['63'], Issoire: ['63', '15', '43'], 'Le Puy-en-Velay': ['43', '07', '48'], Massagettes: ['63', '15'], Mende: ['48'], Moulins: ['03', '58', '71'], Mozac: ['63'], Ussel: ['19', '23'], Vichy: ['03', '63'], 'Thiers / Ambert': ['42', '43', '63'] };
  const fe = (s) => s.fin && s.fin.famille !== 'Comptant' && s.fin.fin ? s.fin : null;

  /* Chaque type : famille, portée (client = la fiche ; line = UN véhicule acheté, avec sa vente et son financement),
     valeurs par défaut, champs du volet d'édition, phrase, test. Les briques « Sauf » renvoient VRAI pour EXCLURE. */
  const TY = {
    type: { fam: 'client', l: 'Particulier ou société', scope: 'client', def: () => ({ v: 'particulier' }),
      fields: [{ k: 'v', t: 'seg', l: 'Type de client', opts: [['particulier', 'Particulier'], ['societe', 'Société']] }],
      say: (p) => `Client ${b_(p.v === 'societe' ? 'société' : 'particulier')}`, test: (c, p) => c.soc === (p.v === 'societe') },
    civ: { fam: 'client', l: 'Civilité', scope: 'client', def: () => ({ v: ['Madame', 'Monsieur'] }),
      fields: [{ k: 'v', t: 'chips', l: 'Civilité (normalisée)', opts: Object.keys(CIV_M), all: 'Toutes' }],
      say: (p) => p.v.length ? `Civilité : ${ou(p.v)}` : 'Toutes civilités', test: (c, p) => !p.v.length || p.v.some((x) => CIV_M[x] === c.civ) },
    siteP: { fam: 'client', l: 'Site du client', scope: 'client', def: () => ({ v: ['Clermont'] }),
      fields: [{ k: 'v', t: 'sites', l: 'Site (celui de sa dernière vente)' }],
      say: (p) => p.v.length ? `Client du site de ${ou(p.v)}` : 'Client de n’importe quel site', test: (c, p) => !p.v.length || p.v.includes(c.site) },
    geo: { fam: 'client', l: 'Lieu d’habitation', scope: 'client', def: () => ({ mode: 'dep', deps: ['63 Puy-de-Dôme'], txt: '' }),
      fields: [{ k: 'mode', t: 'seg', l: 'Chercher par', opts: [['dep', 'Département'], ['cp', 'Code postal'], ['ville', 'Ville']] },
        { k: 'deps', t: 'chips', l: 'Départements', opts: DEP_L, all: 'Tous', show: (p) => p.mode === 'dep' },
        { k: 'txt', t: 'text', l: 'Valeurs (séparées par des virgules)', ph: (p) => p.mode === 'cp' ? '63000, 63100, 03200' : 'Riom, Vichy, Rodez', show: (p) => p.mode !== 'dep' }],
      say: (p) => { const L = p.txt.split(',').map((x) => x.trim()).filter(Boolean);
        return p.mode === 'dep' ? (p.deps.length ? `Habite dans le ${ou(p.deps)}` : 'Habite n’importe où') : !L.length ? 'Habite n’importe où' : p.mode === 'cp' ? `Code postal ${ou(L)}` : `Habite à ${ou(L)}`; },
      test: (c, p) => { if (p.mode === 'dep') return !p.deps.length || p.deps.some((d) => c.cp.startsWith(d.slice(0, 2)));
        const L = p.txt.split(',').map((x) => H.plain(x.trim())).filter(Boolean); if (!L.length) return true;
        return p.mode === 'cp' ? L.some((x) => c.cp.startsWith(x)) : L.some((x) => H.plain(c.ville).includes(x)); } },
    anc: { fam: 'client', l: 'Ancienneté du client', scope: 'client', def: () => ({ min: 10, max: '' }),
      fields: [{ t: 'range', a: 'min', b: 'max', l: 'Client depuis', u: 'ans' }],
      say: (p) => `Client depuis ${b_(span(p.min, p.max, 'ans'))}`, test: (c, p) => inR(yrs(c.sales[0].date), p.min, p.max) },
    nbveh: { fam: 'client', l: 'Nombre de véhicules au parc', scope: 'client', def: () => ({ min: 2, max: '' }),
      fields: [{ t: 'range', a: 'min', b: 'max', l: 'Véhicules dont il est le dernier acheteur connu', u: 'véhicules' }],
      say: (p) => has(p.min) && !has(p.max) ? `Possède ${b_(`${p.min} véhicule${p.min > 1 ? 's' : ''} ou plus`)} au parc` : `Possède ${b_(span(p.min, p.max, 'véhicules'))} au parc`,
      test: (c, p) => inR(c.cur.length, p.min, p.max) },
    vendeur: { fam: 'client', l: 'Vendeur référent', scope: 'client', def: () => ({ v: [] }),
      fields: [{ k: 'v', t: 'pick', l: 'Vendeur référent', i: 'user', groups: vendGroups, all: 'Tous les vendeurs' }],
      say: (p) => p.v.length ? `Suivi par ${ou(p.v)}` : 'Suivi par n’importe quel vendeur', test: (c, p) => !p.v.length || p.v.includes(c.vendeurRef) },
    zone: { fam: 'client', l: 'Zone de la concession', scope: 'client', def: () => ({ v: 'Clermont' }),
      fields: [{ k: 'v', t: 'pick1', l: 'Concession (sa zone de chalandise s’applique d’office)', i: 'pin', opts: () => Object.entries(ZONES).map(([k, d]) => ({ v: k, l: k, hint: d.join(', ') })) }],
      say: (p) => `Client domicilié dans la zone de ${b_(p.v)} (${(ZONES[p.v] || []).join(', ')})`,
      test: (c, p) => (ZONES[p.v] || []).some((d) => c.cp.startsWith(d)) },
    origine: { fam: 'client', l: 'Origine (ancienne base)', scope: 'client', def: () => ({ v: 'bso' }),
      fields: [{ k: 'v', t: 'seg', l: 'Origine', opts: [['bso', 'Seulement l’ancienne base'], ['both', 'Ancienne base, revenu depuis']] }],
      say: (p) => p.v === 'bso' ? `Connu ${b_('seulement par l’ancienne base Sud-Ouest')}, jamais revenu depuis` : `Connu de l’ancienne base Sud-Ouest ${b_('et revenu depuis')}`,
      test: (c, p) => c.sales.some((s) => s.source === 'BSO') && (p.v === 'bso' ? c.sales.every((s) => s.source === 'BSO') : c.sales.some((s) => s.source !== 'BSO')) },

    marque: { fam: 'veh', l: 'Marque', scope: 'line', def: () => ({ v: ['Renault'] }),
      fields: [{ k: 'v', t: 'chips', l: 'Marque du véhicule', opts: BRANDS, colors: BR_C, all: 'Toutes' }],
      say: (p) => p.v.length ? `Véhicule ${ou(p.v)}` : 'Véhicule de toute marque', test: (L, p) => !p.v.length || p.v.includes(L.v.brand) },
    modele: { fam: 'veh', l: 'Modèle', scope: 'line', def: () => ({ v: ['Clio V'] }),
      fields: [{ k: 'v', t: 'pick', l: 'Modèle', i: 'car', groups: modGroups, all: 'Tous les modèles' }],
      say: (p) => p.v.length ? `Modèle ${ou(p.v)}` : 'Tous modèles', test: (L, p) => !p.v.length || p.v.includes(L.v.modele) },
    energie: { fam: 'veh', l: 'Énergie', scope: 'line', def: () => ({ v: ['Électrique', 'Hybride'] }),
      fields: [{ k: 'v', t: 'chips', l: 'Énergie', opts: ['Essence', 'Diesel', 'Hybride', 'Électrique', 'GPL'], all: 'Toutes' }],
      say: (p) => p.v.length ? `Motorisation ${ou(p.v, (x) => x.toLowerCase())}` : 'Toute motorisation', test: (L, p) => !p.v.length || p.v.includes(L.v.energie) },
    genre: { fam: 'veh', l: 'Genre (VP / VU)', scope: 'line', def: () => ({ v: 'VU' }),
      fields: [{ k: 'v', t: 'seg', l: 'Genre', opts: [['VP', 'Particulier (VP)'], ['VU', 'Utilitaire (VU)']] }],
      say: (p) => p.v === 'VU' ? `Véhicule ${b_('utilitaire (VU)')}` : `Véhicule ${b_('particulier (VP)')}`, test: (L, p) => VU.has(L.v.modele) === (p.v === 'VU') },
    age: { fam: 'veh', l: 'Âge du véhicule', scope: 'line', def: () => ({ min: 6, max: '' }),
      fields: [{ t: 'range', a: 'min', b: 'max', l: 'Âge depuis la 1re mise en circulation', u: 'ans' }],
      say: (p) => `Véhicule de ${b_(span(p.min, p.max, 'ans'))}`, test: (L, p) => inR(yrs(L.v.mec), p.min, p.max) },
    parc: { fam: 'veh', l: 'Encore au parc ou revendu', scope: 'line', def: () => ({ v: 'oui' }),
      fields: [{ k: 'v', t: 'seg', l: 'Le client l’a-t-il encore ?', opts: [['oui', 'Encore au parc'], ['non', 'Revendu ou repris']] }],
      say: (p) => p.v === 'oui' ? `Véhicule ${b_('encore au parc')} du client` : `Véhicule ${b_('revendu ou repris')}`, test: (L, p) => !L.v.reprisLe === (p.v === 'oui') },
    ct: { fam: 'veh', l: 'Prochain contrôle technique', scope: 'line', def: () => ({ min: 0, max: 2 }),
      fields: [{ t: 'range', a: 'min', b: 'max', l: 'Prochain CT dans', u: 'mois' }],
      say: (p) => `Prochain contrôle technique ${b_(dans(p.min, p.max, 'mois'))}`,
      test: (L, p) => { const m = mDiff(TODAY, L.v.ctProchain); return m >= Math.max(0, +p.min || 0) && (!has(p.max) || m <= +p.max); } },

    vh: { fam: 'achat', l: 'VN, VO ou ancienne base', scope: 'line', def: () => ({ v: ['VN'] }),
      fields: [{ k: 'v', t: 'chips', l: 'Type d’achat', opts: Object.keys(VH_M), all: 'Tous' }],
      say: (p) => p.v.length ? `Acheté en ${ou(p.v)}` : 'Acheté en VN, VO ou ancienne base', test: (L, p) => !p.v.length || p.v.some((x) => VH_M[x] === L.s.source) },
    livr: { fam: 'achat', l: 'Date de livraison', scope: 'line', def: () => ({ mode: 'ago', min: 3, max: 4, n: 3, from: '', to: '' }),
      fields: [{ k: 'mode', t: 'seg', l: 'Livré', opts: [['ago', 'Il y a…'], ['anniv', 'Anniversaire'], ['entre', 'Entre deux dates']] },
        { t: 'range', a: 'min', b: 'max', l: 'Il y a', u: 'ans', show: (p) => p.mode === 'ago' },
        { t: 'num', k: 'n', l: 'Anniversaire de livraison (dans les 30 prochains jours)', u: 'ans', show: (p) => p.mode === 'anniv' },
        { t: 'dates', a: 'from', b: 'to', l: 'Livré entre le … et le …', show: (p) => p.mode === 'entre' }],
      say: (p) => p.mode === 'anniv' ? `Livré il y a ${b_(`${p.n || '?'} ans`)}, anniversaire ${b_('dans les 30 prochains jours')}`
        : p.mode === 'entre' ? `Livré ${p.from || p.to ? `entre le ${b_(dFR(p.from))} et le ${b_(dFR(p.to))}` : 'à n’importe quelle date'}` : `Livré il y a ${b_(span(p.min, p.max, 'ans'))}`,
      test: (L, p) => { const d = L.s.date;
        if (p.mode === 'anniv') { if (!has(p.n)) return true; const a = addY(d, +p.n); return a >= TODAY && a <= GX.iso(GX.addDays(new Date(TODAY), 30)); }
        if (p.mode === 'entre') return (!p.from || d >= p.from) && (!p.to || d <= p.to);
        return inR(yrs(d), p.min, p.max); } },
    dernier: { fam: 'achat', l: 'Sans achat depuis…', scope: 'client', def: () => ({ min: 5, max: '' }),
      fields: [{ t: 'range', a: 'min', b: 'max', l: 'Dernier achat il y a', u: 'ans' }],
      say: (p) => `Dernier achat il y a ${b_(span(p.min, p.max, 'ans'))}`, test: (c, p) => inR(yrs(c.last.date), p.min, p.max) },
    tv: { fam: 'achat', l: 'Type de vente', scope: 'line', def: () => ({ v: 'VENTE A SOCIETE' }),
      fields: [{ k: 'v', t: 'seg', l: 'Type de vente DCS', opts: [['VENTE A PARTICU', 'À un particulier'], ['VENTE A SOCIETE', 'À une société']] }],
      say: (p) => `Vente ${b_(p.v === 'VENTE A SOCIETE' ? 'à une société' : 'à un particulier')}`, test: (L, p) => L.s.typeVente === p.v },
    montant: { fam: 'achat', l: 'Montant tarif TTC', scope: 'line', def: () => ({ min: 30000, max: '' }),
      fields: [{ t: 'range', a: 'min', b: 'max', l: 'Montant tarif TTC (colonne DCS)', u: '€' }],
      say: (p) => `Montant tarif TTC de ${b_(span(has(p.min) ? F.n(p.min) : '', has(p.max) ? F.n(p.max) : '', '€'))}`, test: (L, p) => inR(L.s.tarif, p.min, p.max) },
    reprise: { fam: 'achat', l: 'Avec ou sans reprise', scope: 'line', def: () => ({ v: 'oui' }),
      fields: [{ k: 'v', t: 'seg', l: 'Reprise', opts: [['oui', 'Avec reprise'], ['non', 'Sans reprise']] }],
      say: (p) => `Acheté ${b_(p.v === 'oui' ? 'avec une reprise' : 'sans reprise')}`, test: (L, p) => !!L.s.reprise === (p.v === 'oui') },
    siteA: { fam: 'achat', l: 'Site de l’achat', scope: 'line', def: () => ({ v: ['Clermont'] }),
      fields: [{ k: 'v', t: 'sites', l: 'Site où le véhicule a été vendu' }],
      say: (p) => p.v.length ? `Acheté à ${ou(p.v)}` : 'Acheté sur n’importe quel site', test: (L, p) => !p.v.length || p.v.includes(L.s.site) },
    vendA: { fam: 'achat', l: 'Vendeur de l’achat', scope: 'line', def: () => ({ v: [] }),
      fields: [{ k: 'v', t: 'pick', l: 'Vendeur de la vente', i: 'user', groups: vendGroups, all: 'Tous' }],
      say: (p) => p.v.length ? `Vendu par ${ou(p.v)}` : 'Vendu par n’importe quel vendeur', test: (L, p) => !p.v.length || L.s.vendeurs.some((v) => p.v.includes(v)) },

    agent: { fam: 'achat', l: 'Vendu en direct ou par un agent', scope: 'line', note: RULE_AGENT, def: () => ({ mode: 'sans', v: [] }),
      fields: [{ k: 'mode', t: 'seg', l: 'Vente', opts: [['sans', 'Sans agent (en concession)'], ['un', 'Par un agent précis'], ['tous', 'Par n’importe quel agent']] },
        { k: 'v', t: 'pick', l: 'Agent(s) R2', i: 'building', groups: () => [{ items: X.R2.map((v) => ({ v, l: v })) }], all: 'Choisir…', show: (p) => p.mode === 'un' }],
      say: (p) => p.mode === 'sans' ? `Vendu ${b_('sans agent')} (vente en concession)` : p.mode === 'un' ? (p.v.length ? `Vendu par l’agent ${ou(p.v)}` : 'Vendu par l’agent… (à choisir)') : `Vendu ${b_('par un agent R2')}, n’importe lequel`,
      test: (L, p) => p.mode === 'sans' ? !L.s.intermediaire : p.mode === 'un' ? !!L.s.intermediaire && p.v.includes(L.s.intermediaire) : !!L.s.intermediaire },

    fin: { fam: 'fin', l: 'Financement et échéance', scope: 'line', def: () => ({ fam: ['LOA'], org: ['DIAC'], when: 'dans', min: 3, max: 6, from: '', to: '' }),
      fields: [{ k: 'fam', t: 'chips', l: 'Famille de produit', opts: ['LOA', 'LLD', 'Crédit', 'Crédit-bail', 'Crédit ballon'], colors: X.FAM_C, all: 'Toutes' },
        { k: 'org', t: 'chips', l: 'Organisme', opts: ['DIAC', 'Autre banque'], all: 'Tous' },
        { k: 'when', t: 'seg', l: 'Fin du contrat', opts: [['dans', 'Dans…'], ['entre', 'Entre deux dates'], ['cours', 'En cours'], ['fini', 'Terminé']] },
        { t: 'range', a: 'min', b: 'max', l: 'Se termine dans', u: 'mois', show: (p) => p.when === 'dans' },
        { t: 'dates', a: 'from', b: 'to', l: 'Se termine entre le … et le …', show: (p) => p.when === 'entre' }],
      say: (p) => `Financement ${p.fam.length ? ou(p.fam) : b_('de toute famille')}${p.org.length ? ` chez ${ou(p.org)}` : ''} ${
        p.when === 'dans' ? `qui se termine ${b_(dans(p.min, p.max, 'mois'))}` : p.when === 'entre' ? `qui se termine entre le ${b_(dFR(p.from))} et le ${b_(dFR(p.to))}` : p.when === 'cours' ? b_('encore en cours') : b_('déjà terminé')}`,
      test: (L, p) => { const f = fe(L.s); if (!f) return false;
        if (p.fam.length && !p.fam.includes(f.famille)) return false; if (p.org.length && !p.org.includes(f.organisme)) return false;
        if (p.when === 'cours') return f.fin >= TODAY; if (p.when === 'fini') return f.fin < TODAY;
        if (p.when === 'entre') return (!p.from || f.fin >= p.from) && (!p.to || f.fin <= p.to);
        const m = mDiff(TODAY, f.fin); return m >= Math.max(0, +p.min || 0) && (!has(p.max) || m <= +p.max); } },
    sansfin: { fam: 'fin', l: 'Sans financement (comptant)', scope: 'line', def: () => ({}), fields: [],
      say: () => `Payé ${b_('comptant')}, sans financement connu`, test: (L) => !fe(L.s) },
    duree: { fam: 'fin', l: 'Durée du contrat', scope: 'line', def: () => ({ min: 36, max: 48 }),
      fields: [{ t: 'range', a: 'min', b: 'max', l: 'Durée (fournie par DCS, sinon calculée)', u: 'mois' }],
      say: (p) => `Contrat de ${b_(span(p.min, p.max, 'mois'))}`, test: (L, p) => { const f = fe(L.s); return !!f && inR(f.duree, p.min, p.max); } },
    ecoule: { fam: 'fin', l: 'Part du contrat écoulée', scope: 'line', def: () => ({ min: 80, max: '' }),
      fields: [{ t: 'range', a: 'min', b: 'max', l: 'Part écoulée', u: '%' }],
      say: (p) => `Contrat écoulé à ${b_(span(p.min, p.max, '%'))}`,
      test: (L, p) => { const f = fe(L.s); if (!f || !f.debut) return false; const k = 100 * (new Date(TODAY) - new Date(f.debut)) / (new Date(f.fin) - new Date(f.debut)); return inR(k, p.min, p.max); } },

    joignable: { fam: 'coord', l: 'Joignable (portable ou e-mail)', scope: 'client', def: () => ({}), fields: [], say: () => `A un ${b_('portable ou un e-mail valide')}`, test: (c) => !!(c._rq.port || c._rq.mail) },
    mail: { fam: 'coord', l: 'A un e-mail valide', scope: 'client', def: () => ({}), fields: [], say: () => `A une ${b_('adresse e-mail valide')}`, test: (c) => !!c._rq.mail },
    port: { fam: 'coord', l: 'A un portable valide', scope: 'client', def: () => ({}), fields: [], say: () => `A un ${b_('portable valide')}`, test: (c) => !!c._rq.port },
    tel: { fam: 'coord', l: 'A un téléphone valide', scope: 'client', def: () => ({}), fields: [], say: () => `A un ${b_('téléphone valide')} (portable ou fixe)`, test: (c) => !!(c._rq.port || c._rq.fixe) },
    adr: { fam: 'coord', l: 'A une adresse postale complète', scope: 'client', def: () => ({}), fields: [], say: () => `A une ${b_('adresse postale complète')}`, test: (c) => c._rq.adr },
    nosus: { fam: 'coord', l: 'Aucune coordonnée suspecte', scope: 'client', def: () => ({}), fields: [], say: () => `${b_('Aucune coordonnée suspecte')} (numéro partagé, domaine Bony…)`, test: (c) => !c.suspect },

    cible: { fam: 'sauf', l: 'Déjà ciblés récemment', scope: 'client', lot: 'lot 4', def: () => ({ n: 30 }),
      fields: [{ t: 'num', k: 'n', l: 'Déjà présents dans un export depuis', u: 'jours' }],
      say: (p) => `Sauf les clients ${b_(`déjà ciblés depuis ${p.n || '?'} jours`)}`, test: (c, p) => c._rq.cible && (+p.n || 0) >= 7 },
    nplc: { fam: 'sauf', l: '« Ne plus contacter »', scope: 'client', lot: 'lot 4', soon: true, def: () => ({}), fields: [],
      say: () => `Sauf les clients ${b_('« ne plus contacter »')}`, test: (c) => !!c.nplc },
    generic: { fam: 'sauf', l: 'Identités génériques', scope: 'client', def: () => ({}), fields: [],
      say: () => `Sauf les ${b_('identités génériques')} (garages, loueurs, la concession : plus de 20 véhicules)`, test: (c) => c._rq.gen },
    soc: { fam: 'sauf', l: 'Les sociétés', scope: 'client', def: () => ({}), fields: [], say: () => `Sauf les ${b_('sociétés')}`, test: (c) => c.soc },
    nosite: { fam: 'sauf', l: 'Un ou des sites', scope: 'client', def: () => ({ v: ['Saint-Etienne'] }), fields: [{ k: 'v', t: 'sites', l: 'Sites à écarter (site du client)' }],
      say: (p) => p.v.length ? `Sauf les clients de ${ou(p.v)}` : 'Sauf… (aucun site choisi)', test: (c, p) => p.v.includes(c.site) },
  };

  /* Canaux : garde-fous ajoutés d'office + dédoublonnage */
  const CANAL = {
    tous: { l: 'Tous', icon: 'list', need: null },
    email: { l: 'E-mailing', icon: 'mail', need: (r) => !!r.mail, sus: (r) => r.mailSus, guard: 'mail', susWhy: 'partagé par plusieurs identités, ou adresse d’une concession Bony', dd: 'Un seul envoi par adresse e-mail', ddRate: .021, coord: 'e-mail',
      say: `A une ${b_('adresse e-mail valide')}, ni suspecte ni au domaine Bony` },
    sms: { l: 'SMS', icon: 'sms', need: (r) => !!r.port, sus: (r) => r.portSus, guard: 'port', susWhy: 'partagé par plusieurs identités, ou numéro bidon', dd: 'Un seul SMS par numéro de portable', ddRate: .014, coord: 'portable',
      say: `A un ${b_('portable valide')} (06 / 07), non suspect` },
    phoning: { l: 'Phoning', icon: 'phone', need: (r) => !!(r.port || r.fixe), sus: (r) => r.portSus, guard: 'tel', susWhy: 'partagé par plusieurs identités, ou numéro bidon', dd: 'Un seul appel par numéro', ddRate: .014, coord: 'téléphone',
      say: `A un ${b_('téléphone valide')} (portable, sinon fixe), non suspect` },
    courrier: { l: 'Courrier', icon: 'letter', need: (r) => r.adr, sus: () => false, guard: 'adr', susWhy: '', dd: 'Un seul courrier par foyer (même adresse)', ddRate: .034, coord: 'adresse',
      say: `A une ${b_('adresse postale complète')} (numéro, voie, code postal, ville)` },
  };
  const canIcon = (k) => (k === 'phoning' ? IC.phone : k === 'courrier' ? IC.letter : GX.icon(CANAL[k].icon, 'sm'));

  /* ---------------- Requêtes ---------------- */
  let bid = 0, qid = 0;
  const mk = (t, p = {}, on = true) => ({ id: 'b' + ++bid, t, p: { ...TY[t].def(), ...p }, on });
  const SAUF0 = () => [mk('generic'), mk('nplc')];
  /* Périmètre de la barre de menus (« Tout le réseau » / un site) → brique Site préremplie, comme le filtre de l'onglet Clients */
  const applyPer = (q) => { const site = perSite(), i = q.bricks.findIndex((b) => b.per);
    if (!site) { if (i >= 0) q.bricks.splice(i, 1); return q; }
    if (i >= 0) q.bricks[i].p.v = [site]; else q.bricks.unshift({ ...mk('siteP', { v: [site] }), per: true }); return q; };
  const newQ = (name, bricks = [], o = {}) => applyPer({ id: 'q' + ++qid, name, bricks: [...bricks, ...SAUF0()], level: 'client', canal: 'tous', dedupe: true, savedId: null, from: null, ...o });
  const cloneQ = (q) => ({ ...q, id: 'q' + ++qid, bricks: q.bricks.map((b) => ({ ...b, id: 'b' + ++bid, p: JSON.parse(JSON.stringify(b.p)) })) });

  const RECIPES = [
    { id: 'r0', l: 'Invitation événement concession', d: 'Zone de la concession, sans agent, joignable', i: 'flag', c: '#f75632',
      q: () => newQ('Invitation événement concession', [mk('zone', { v: perSite() && ZONES[perSite()] ? perSite() : 'Clermont' }), mk('agent', { mode: 'sans' }), mk('joignable')]) },
    { id: 'r1', l: 'Fins de LOA / LLD dans 3 à 6 mois', d: 'Proposer le renouvellement avant l’échéance', i: 'euro', c: X.FAM_C.LOA,
      q: () => newQ('Fins de LOA / LLD dans 3 à 6 mois', [mk('fin', { fam: ['LOA', 'LLD'], org: [], min: 3, max: 6 }), mk('parc')]) },
    { id: 'r2', l: 'Fins de crédit DIAC dans 6 mois', d: 'Crédit classique et ballon, DIAC seulement', i: 'euro', c: X.FAM_C['Crédit'],
      q: () => newQ('Fins de crédit DIAC dans 6 mois', [mk('fin', { fam: ['Crédit', 'Crédit ballon'], org: ['DIAC'], min: 0, max: 6 }), mk('parc')]) },
    { id: 'r3', l: 'Contrôle technique dans les 2 mois (VO)', d: 'Rappel CT pour les clients VO', i: 'clock', c: '#f59e0b',
      q: () => newQ('Contrôle technique dans les 2 mois (VO)', [mk('vh', { v: ['VO'] }), mk('parc'), mk('ct')], { canal: 'sms' }) },
    { id: 'r4', l: 'Véhicule de plus de 6 ans encore au parc', d: 'Candidats à la reprise', i: 'car', c: '#14b8a6',
      q: () => newQ('Véhicule de plus de 6 ans au parc', [mk('age', { min: 6 }), mk('parc')]) },
    { id: 'r5', l: 'Anniversaire VN 3 ans, sans financement', d: 'Clients comptant : leur proposer une offre', i: 'gift', c: '#e11d74',
      q: () => newQ('Anniversaire de livraison VN 3 ans sans financement', [mk('vh', { v: ['VN'] }), mk('livr', { mode: 'anniv', n: 3 }), mk('sansfin')], { canal: 'email' }) },
    { id: 'r6', l: 'Clients sans achat depuis 5 ans', d: 'Réactiver les clients endormis', i: 'refresh', c: '#94a3b8',
      q: () => newQ('Clients sans achat depuis 5 ans', [mk('dernier', { min: 5 })], { canal: 'courrier' }) },
    { id: 'r7', l: 'Clients électriques et hybrides', d: 'Évènements, bornes, nouveautés E-Tech', i: 'bolt', c: '#16a34a',
      q: () => newQ('Clients électriques et hybrides', [mk('energie'), mk('parc')], { canal: 'email' }) },
    { id: 'r8', l: 'Sociétés avec 3 véhicules ou plus', d: 'Flottes : rendez-vous pro', i: 'building', c: '#5b7fd6',
      q: () => newQ('Sociétés (flottes) de 3 véhicules ou plus', [mk('type', { v: 'societe' }), mk('nbveh', { min: 3 })], { canal: 'phoning' }) },
    { id: 'r9', l: 'Clients R2 (vendus par un agent)', d: 'Clients finaux passés par un agent', i: 'handshake', c: '#8f12ab',
      q: () => newQ('Clients R2 (vendus par un agent)', [mk('agent', { mode: 'tous' })]) },
    { id: 'r10', l: 'Ancienne base Sud-Ouest jamais revenue', d: 'Connus avant le 01/10/2025, aucun achat depuis', i: 'globe', c: '#8a8599',
      q: () => newQ('Ancienne base Sud-Ouest jamais revenue', [mk('origine')], { canal: 'courrier' }) },
  ];

  /* ---------------- Moteur (simulation du serveur) ---------------- */
  function run(q) {
    const act = q.bricks.filter((b) => b.on && !TY[b.t].soon);
    const cl = act.filter((b) => TY[b.t].scope === 'client' && TY[b.t].fam !== 'sauf');
    const sf = act.filter((b) => TY[b.t].fam === 'sauf');
    const ln = act.filter((b) => TY[b.t].scope === 'line');
    const ex = Object.fromEntries(q.bricks.filter((b) => TY[b.t].fam === 'sauf').map((b) => [b.id, 0]));
    const base = [];
    for (const c of X.CLIENTS) {
      if (!cl.every((b) => TY[b.t].test(c, b.p))) continue;
      const lines = ln.length ? c._rq.lines.filter((L) => ln.every((b) => TY[b.t].test(L, b.p))) : c._rq.lines;
      if (!lines.length) continue;
      let out = false;
      for (const b of q.bricks) if (TY[b.t].fam === 'sauf' && (b.on || TY[b.t].soon) && TY[b.t].test(c, b.p)) { ex[b.id]++; if (b.on && !TY[b.t].soon) out = true; }   // impact affiché sur chaque « Sauf »
      if (!out) base.push({ c, lines });
    }
    const G = CANAL[q.canal];
    let final = [], noCoord = 0, sus = 0, dup = 0;
    for (const x of base) {
      if (G.need && !G.need(x.c._rq)) { if (G.sus(x.c._rq)) sus++; else noCoord++; continue; }
      if (G.need && q.dedupe && hash(x.c.i + q.canal) % 1000 < G.ddRate * 1000) { dup++; continue; }
      final.push(x);
    }
    const nLines = final.reduce((s, x) => s + x.lines.length, 0);
    const fun = { base: base.length, mail: 0, port: 0, adr: 0 };
    base.forEach((x) => { const r = x.c._rq; if (r.mail) fun.mail++; if (r.port) fun.port++; if (r.adr) fun.adr++; });
    const finLines = final.flatMap((x) => x.lines);
    return {
      base, final, ex, noCoord, sus, dup, nLines, fun,
      nplc: final.filter((x) => x.c.nplc).length, gen: final.filter((x) => x.c._rq.gen).length, sus2: final.filter((x) => x.c.suspect).length,
      aConf: ln.some((b) => b.t === 'fin' || b.t === 'duree' || b.t === 'ecoule') ? finLines.filter((L) => L.s.fin?.aConfirmer).length : 0,
      off: q.bricks.filter((b) => !b.on && !TY[b.t].soon).length,
    };
  }
  const sig = (q) => JSON.stringify([q.bricks.filter((b) => b.on).map((b) => [b.t, b.p]), q.canal, q.level, q.dedupe]);
  const weekAgo = (q, n) => { const pct = (hash(sig(q)) % 1000) / 100 - 3.5; return Math.round(n / (1 + pct / 100)); };   // relancée lundi dernier (simulation)
  const mainN = (q, R) => q.level === 'veh' ? (q.canal !== 'tous' && q.dedupe ? R.final.length : R.nLines) : R.final.length;

  /* Ligne représentative d'un client (aperçu, exports au niveau client) */
  const hasT = (q, t) => q.bricks.some((b) => b.on && b.t === t);
  function pickLine(q, x) {
    if (hasT(q, 'fin')) return x.lines.filter((L) => fe(L.s)).sort((a, b) => fe(a.s).fin.localeCompare(fe(b.s).fin))[0] || x.lines[0];
    if (hasT(q, 'ct')) return x.lines.slice().sort((a, b) => a.v.ctProchain.localeCompare(b.v.ctProchain))[0];
    return x.lines[x.lines.length - 1];
  }
  function rows(q, R, max = Infinity) {
    let L = q.level === 'veh' && !(q.canal !== 'tous' && q.dedupe) ? R.final.flatMap((x) => x.lines) : R.final.map((x) => pickLine(q, x));
    const key = hasT(q, 'fin') ? (l) => fe(l.s)?.fin || '9' : hasT(q, 'ct') ? (l) => l.v.ctProchain : (l) => '~' + (99999999 - +l.s.date.replace(/-/g, ''));
    L = L.slice().sort((a, b) => key(a).localeCompare(key(b)));
    return L.slice(0, max);
  }
  const repere = (q) => hasT(q, 'fin') || hasT(q, 'duree') || hasT(q, 'ecoule') ? ['Fin de contrat', (l) => fe(l.s) ? dFR(fe(l.s).fin) : '—']
    : hasT(q, 'ct') ? ['Prochain CT', (l) => dFR(l.v.ctProchain)] : ['Livré le', (l) => dFR(l.s.date)];

  /* ---------------- État (survit aux changements d'onglet et de largeur) ---------------- */
  const S = {
    q: RECIPES[0].q(), open: null, resTab: 'site', libF: 'all',
    saved: [], journal: [],
    xl: null,
  };
  S.q.from = 'r1';
  const mkSaved = (name, q, author, daysAgo, shared) => { const R = run(q), n = mainN(q, R); return { id: 's' + ++qid, name, q: { ...q, name }, author, date: GX.iso(GX.addDays(new Date(TODAY), -daysAgo)), shared, count: sc(weekAgo(q, n)) }; };
  S.saved = [
    mkSaved('Relance LOA Clermont – novembre', newQ('', [mk('fin', { fam: ['LOA'], org: ['DIAC'], min: 1, max: 2 }), mk('siteA', { v: ['Clermont', 'Mozac'] })], { canal: 'sms' }), ME, 4, false),
    mkSaved('Électriques Sud-Ouest (essais R5)', newQ('', [mk('energie', { v: ['Électrique'] }), mk('siteP', { v: ['Albi', 'Rodez', 'Aurillac', 'Gaillac', 'Lavaur', 'Villefranche'] }), mk('parc')], { canal: 'email' }), 'Léa Bernard', 10, true),
    mkSaved('Flottes PME du Puy-de-Dôme', newQ('', [mk('type', { v: 'societe' }), mk('geo'), mk('nbveh', { min: 2 })], { canal: 'phoning' }), 'Hugo Martin', 18, true),
    mkSaved('CT VO Vichy – phoning', newQ('', [mk('vh', { v: ['VO'] }), mk('siteA', { v: ['Vichy'] }), mk('ct', { min: 0, max: 3 })], { canal: 'phoning', level: 'veh' }), ME, 26, false),
  ];
  const at = (d, h, m) => { const x = GX.addDays(new Date(TODAY), -d); x.setHours(h, m); return x.toISOString(); };
  S.journal = [
    { who: ME, when: at(1, 16, 42), fmt: 'sms', n: 2496, qn: 'Relance LOA Clermont – novembre' },
    { who: 'Léa Bernard', when: at(3, 10, 5), fmt: 'csv', n: 7828, qn: 'Électriques Sud-Ouest (essais R5)' },
    { who: 'Hugo Martin', when: at(6, 9, 18), fmt: 'phoning', n: 824, qn: 'Flottes PME du Puy-de-Dôme' },
    { who: ME, when: at(9, 14, 30), fmt: 'excel', n: 4174, qn: 'Fins de LOA / LLD dans 3 à 6 mois' },
    { who: 'Tom Durand', when: at(15, 11, 2), fmt: 'courrier', n: 13260, qn: 'Clients sans achat depuis 5 ans' },
  ];
  const FMT = { excel: ['Excel', IC.sheet], csv: ['Sarbacane', GX.icon('mail', 'sm')], sms: ['allmysms', GX.icon('sms', 'sm')], phoning: ['Phoning', IC.printer], courrier: ['Courrier', IC.letter] };
  /* Nom du fichier exporté : outil, requête, exportateur, date (décision Théo, 12/10) */
  const FEXT = { excel: 'xlsx', csv: 'csv', sms: 'csv', phoning: 'pdf', courrier: 'pdf' }, FTOOL = { excel: 'excel', csv: 'sarbacane', sms: 'allmysms', phoning: 'phoning', courrier: 'courrier' };
  const fslug = (x) => H.plain(String(x)).replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  const fname = (fmt, qn = S.q.name, who = ME, date = TODAY) => `SPARK_${FTOOL[fmt]}_${fslug(qn).slice(0, 40)}_${fslug(who)}_${date}.${FEXT[fmt]}`;
  const RCOUNT = Object.fromEntries(RECIPES.map((r) => { const q = r.q(); const R = run(q); return [r.id, sc(mainN(q, R))]; }));

  /* ---------------- Styles (préfixe rq-) ---------------- */
  GX.css(`
  .rq{display:grid;grid-template-columns:290px minmax(0,1fr) 410px;height:100%;min-height:0}
  .rq-col{min-height:0;overflow:auto}
  .rq-lib{border-right:1px solid var(--line);padding:14px 12px 28px;display:flex;flex-direction:column;gap:18px;background:color-mix(in srgb,var(--surface-0) 35%,transparent)}
  .rq-sec{display:flex;flex-direction:column;gap:8px}
  .rq-sec>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px}
  .rq-sec>summary::-webkit-details-marker{display:none}
  .rq-sec>summary .chev{margin-left:auto;color:var(--text-3);transition:transform var(--t-med) var(--spring-snappy)}
  .rq-sec[open]>summary .chev{transform:rotate(90deg)}
  .rq-rcs{display:flex;flex-direction:column;gap:6px}
  .rq-rc{display:flex;gap:10px;align-items:center;padding:10px 11px;border-radius:12px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line);cursor:pointer;text-align:left;width:100%;color:var(--text);font-family:inherit;transition:background var(--t-fast),box-shadow var(--t-fast)}
  .rq-rc:hover{background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line-2)}
  .rq-rc.on{background:color-mix(in srgb,var(--accent) 12%,var(--surface-2));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 55%,transparent)}
  .rq-rc .ico{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--c) 20%,transparent);color:var(--c)}
  .rq-rc .tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
  .rq-rc .t{font-weight:700;font-size:13.5px;line-height:1.3}
  .rq-rc .d{font-size:12px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rq-rc .k{font-size:12px;font-weight:700;color:var(--text-2);font-variant-numeric:tabular-nums;white-space:nowrap}
  .rq-jr{display:flex;gap:10px;align-items:flex-start;padding:9px 4px;border-bottom:1px solid var(--line);font-size:12.5px}
  .rq-jr:last-child{border-bottom:0}
  .rq-jr .ic{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;flex:none;background:var(--surface-3);color:var(--text-2)}
  .rq-jr b{color:var(--text);font-weight:600}
  .rq-bld{padding:16px 22px 40px;display:flex;flex-direction:column;gap:14px}
  .rq-top{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap}
  .rq-name{flex:1 1 460px;min-width:0;display:flex;align-items:center;gap:10px}
  .rq-title{flex:1;min-width:0;font:700 19px/1.25 var(--font-ui);letter-spacing:-.01em;color:var(--text);background:transparent;border:0;border-radius:8px;padding:6px 8px;margin-left:-8px;outline:none;resize:none;overflow:hidden;field-sizing:content;height:auto}
  .rq-title:hover{background:var(--surface-2)}.rq-title:focus{background:var(--surface-2);box-shadow:inset 0 0 0 1.5px var(--accent)}
  .rq-acts{display:flex;gap:6px;flex-wrap:wrap}
  .rq-libbtn{display:none!important}
  .rq-mini{display:none}
  .rq-opts{padding:12px 14px;display:flex;gap:12px 22px;flex-wrap:wrap;align-items:flex-end}
  .rq-opt{display:flex;flex-direction:column;gap:6px;min-width:0;max-width:100%}
  .rq-opt .seg button{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
  .rq-list{display:flex;flex-direction:column;gap:8px}
  .rq-fh{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--c)}
  .rq-fh:first-child{margin-top:0}
  .rq-fh .l{flex:1;height:1px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 45%,transparent),transparent)}
  .rq-fh button{font:600 12px var(--font-ui);letter-spacing:0;text-transform:none;color:var(--text-3);background:none;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:6px}
  .rq-fh button:hover{color:var(--text);background:var(--surface-3)}
  .rq-and{align-self:flex-start;margin:-3px 0 -3px 26px;font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3);padding:1px 8px;border-radius:99px;background:var(--surface-3)}
  .rq-b{border-radius:14px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line),inset 3px 0 0 var(--c);transition:box-shadow var(--t-fast),opacity var(--t-fast)}
  .rq-b:hover{box-shadow:inset 0 0 0 1px var(--line-2),inset 3px 0 0 var(--c)}
  .rq-b.open{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--c) 65%,transparent),inset 3px 0 0 var(--c)}
  .rq-bh{display:flex;align-items:center;gap:10px;padding:8px 10px 8px 14px;min-height:50px}
  .rq-bi{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--c) 18%,transparent);color:var(--c)}
  .rq-bs{flex:1;min-width:0;text-align:left;font:500 14.5px/1.45 var(--font-ui);color:var(--text-2);background:none;border:0;padding:4px 0;cursor:pointer}
  .rq-bs b{color:var(--text);font-weight:700}
  .rq-b.off{opacity:.55}.rq-b.off .rq-bs{text-decoration:line-through}
  .rq-b.rq-lock{background:color-mix(in srgb,var(--c) 7%,var(--surface-2))}.rq-b.rq-lock .rq-bs{cursor:default}
  .rq-b.soon{background:transparent;box-shadow:inset 0 0 0 1px var(--line);opacity:.62}.rq-b.soon .rq-bs{cursor:default}
  .rq-bn{font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--danger);white-space:nowrap}
  .rq-bn.z{color:var(--text-3);font-weight:600}
  .rq-be{padding:12px 14px 14px 54px;display:flex;flex-direction:column;gap:12px;border-top:1px dashed var(--line-2);animation:ui-fade-up var(--t-med) var(--ease-out) both}
  .rq-fld{display:flex;flex-direction:column;gap:6px;min-width:0}
  .rq-fld .seg{max-width:100%;overflow-x:auto}.rq-fld .seg button{white-space:nowrap}
  .rq-range{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13.5px}
  .rq-range .input{width:96px;height:36px}
  .rq-range .input[type=date]{width:160px}
  .rq-be .foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
  .rq-add{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:10px 12px;border-radius:14px;border:1px dashed var(--line-2)}
  .rq-add>button{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border-radius:99px;font:600 13px var(--font-ui);color:var(--text);background:color-mix(in srgb,var(--c) 14%,var(--surface-2));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 30%,transparent);cursor:pointer}
  .rq-add>button:hover{background:color-mix(in srgb,var(--c) 24%,var(--surface-2))}
  .rq-add>button svg.i{color:var(--c)}
  .rq-hint{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:14px;background:color-mix(in srgb,var(--info) 9%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--info) 28%,transparent);font-size:13.5px;line-height:1.5;color:var(--text-2)}
  .rq-hint svg.i{color:var(--info);flex:none;margin-top:2px}
  .rq-res{border-left:1px solid var(--line);display:flex;flex-direction:column;background:color-mix(in srgb,var(--surface-0) 35%,transparent)}
  .rq-resi{padding:16px 16px 18px;display:flex;flex-direction:column;gap:12px;flex:1}
  .rq-cnt{padding:16px 18px;display:flex;flex-direction:column;gap:6px}
  .rq-big{font-size:46px;font-weight:700;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums;background:var(--bony-grad);-webkit-background-clip:text;background-clip:text;color:transparent}
  .rq-big small{font-size:16px;letter-spacing:0;-webkit-text-fill-color:var(--text-2);margin-left:6px;font-weight:600}
  .rq-sub{font-size:13px;color:var(--text-2);display:flex;gap:6px 10px;flex-wrap:wrap;align-items:center}
  .rq-fun{display:flex;flex-direction:column;gap:9px}
  .rq-fun>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;align-items:center;font-size:13px;padding:6px 8px;border-radius:10px}
  .rq-fun>div.on{background:color-mix(in srgb,var(--accent) 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent)}
  .rq-fun .bar{grid-column:1 / 3;height:7px}
  .rq-fun .lb{display:flex;align-items:center;gap:7px;min-width:0}
  .rq-fun .lb span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rq-fun b{font-variant-numeric:tabular-nums}
  .rq-warn{display:flex;flex-direction:column;gap:6px}
  .rq-warn>div{display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.45;padding:9px 11px;border-radius:10px;background:color-mix(in srgb,var(--c) 9%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 26%,transparent)}
  .rq-warn svg.i{color:var(--c);flex:none;margin-top:1px}
  .rq-warn b{font-variant-numeric:tabular-nums}
  .rq-prev{font-size:12.5px}
  .rq-prev td{height:auto;padding-top:8px;padding-bottom:8px;vertical-align:top}
  .rq-prev tbody tr{cursor:pointer}
  .rq-prev tbody tr:nth-child(even){background:color-mix(in srgb,var(--surface-3) 30%,transparent)}
  .rq-prev .nm{font-weight:700;color:var(--text);white-space:nowrap}
  .rq-prev .sm{color:var(--text-3);font-size:11.5px;white-space:nowrap}
  .rq-ok{color:var(--ok)}.rq-ko{color:var(--text-3);opacity:.45}
  .rq-exp{position:sticky;bottom:0;z-index:2;padding:10px 12px;border-top:1px solid var(--line);background:var(--surface-1);display:flex;flex-direction:column;gap:8px}
  .rq-exp .bt{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
  .rq-exp .bt button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 2px;border-radius:11px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line);font:600 11.5px var(--font-ui);color:var(--text);cursor:pointer;transition:background var(--t-fast)}
  .rq-exp .bt button:hover{background:var(--surface-3)}
  .rq-exp .bt button.rec{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--accent) 60%,transparent)}
  .rq-exp .bt button svg.i{width:18px;height:18px;color:var(--accent)}
  /* Volets d'export */
  .rq-fname{margin-top:14px;display:flex;align-items:center;gap:8px;padding:8px 11px;border-radius:10px;background:var(--surface-0);box-shadow:inset 0 0 0 1px var(--line);font-size:12px;color:var(--text-2);overflow-wrap:anywhere;min-width:0}
  .rq-fname svg.i{flex:none;color:var(--accent)}
  .rq-cols{display:flex;flex-direction:column;gap:4px;max-height:320px;overflow:auto;padding:2px}
  .rq-cols>div{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:9px;background:var(--surface-2);font-size:13px}
  .rq-cols>div.off{opacity:.5;background:transparent}
  .rq-cols .ord{margin-left:auto;display:flex;gap:2px}
  .rq-code{font:12px/1.55 ui-monospace,Consolas,monospace;background:var(--surface-0);box-shadow:inset 0 0 0 1px var(--line);border-radius:10px;padding:10px 12px;overflow:auto;white-space:pre;color:var(--text-2)}
  .rq-vars{display:flex;flex-wrap:wrap;gap:5px}
  .rq-vars button{height:26px;padding:0 9px;border-radius:7px;font:600 12px ui-monospace,Consolas,monospace;background:var(--surface-3);color:var(--text);cursor:pointer;border:0}
  .rq-vars button:hover{background:var(--surface-4)}
  .rq-smsp{align-self:flex-start;max-width:340px;padding:10px 14px;border-radius:18px 18px 18px 6px;background:var(--surface-3);font-size:13.5px;line-height:1.45;white-space:pre-wrap}
  .rq-meter{display:flex;gap:8px 16px;flex-wrap:wrap;font-size:12.5px;color:var(--text-2)}
  .rq-meter b{color:var(--text);font-variant-numeric:tabular-nums}
  /* Aperçu d'impression : du papier, donc blanc dans les deux thèmes */
  .rq-print{background:var(--surface-0);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:16px;max-height:56vh;overflow:auto;box-shadow:inset 0 0 0 1px var(--line)}
  .rq-paper{background:#fff;color:#1d1b22;border-radius:4px;box-shadow:0 6px 24px -8px rgba(0,0,0,.45);padding:22px 24px;font-size:11px;min-width:640px}
  .rq-paper h4{margin:0;font-size:15px}
  .rq-paper .hd{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #1d1b22;padding-bottom:8px;margin-bottom:10px}
  .rq-paper .hd .m{color:#5c5866;font-size:10.5px;line-height:1.5;text-align:right}
  .rq-paper table{width:100%;border-collapse:collapse}
  .rq-paper th{font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;text-align:left;color:#5c5866;border-bottom:1px solid #b9b5c2;padding:4px 5px}
  .rq-paper td{border-bottom:1px solid #e3e0ea;padding:6px 5px;vertical-align:top}
  .rq-paper td.ck,.rq-paper th.ck{text-align:center;width:46px}
  .rq-paper .box{display:inline-block;width:11px;height:11px;border:1.4px solid #1d1b22;border-radius:2px}
  .rq-paper .notes{margin-top:12px;border:1px solid #b9b5c2;border-radius:4px;height:64px;padding:5px 8px;color:#8a8597}
  .rq-paper .ft{display:flex;justify-content:space-between;margin-top:10px;color:#8a8597;font-size:9.5px}
  .rq-labels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;min-width:560px}
  .rq-labels>div{border:1px dashed #b9b5c2;border-radius:4px;padding:10px 12px;line-height:1.5;font-size:11px;min-height:78px}
  @container app (max-width:1240px){.rq{grid-template-columns:minmax(0,1fr) 360px}.rq-lib{display:none}.rq-libbtn{display:inline-flex!important}}
  @container app (max-width:760px){
    .rq{display:block;overflow:auto}.rq-col{overflow:visible}
    .rq-lib{display:flex;border:0;padding:12px 12px 4px;background:none;gap:12px}.rq-libbtn{display:none!important}
    .rq-mini{display:flex;position:sticky;top:6px;z-index:4;align-self:center;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:99px;border:0;font:600 13px var(--font-ui);color:var(--text);background:color-mix(in srgb,var(--surface-1) 82%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:inset 0 0 0 1px var(--line-2),0 8px 20px -10px rgba(0,0,0,.5);cursor:pointer;margin-bottom:-6px}
    .rq-mini b{font-size:15px;font-variant-numeric:tabular-nums}
    .rq-rcs.strip{flex-direction:row;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px}.rq-rcs.strip .rq-rc{flex:0 0 250px;min-width:0;scroll-snap-align:start}
    .rq-bld{padding:8px 12px 18px}.rq-be{padding:12px 12px 14px}.rq-title{font-size:17px}
    .rq-res{border:0;background:none}.rq-resi{padding:4px 12px 16px}
    .rq-exp .bt button{font-size:10.5px}
    .rq-canal .seg button{padding:0 8px}.rq-canal .seg button svg.i{display:none}
  }
  `);

  /* =====================================================================
     Rendu
     ===================================================================== */
  function build(vhost, ctx) {
    const { win } = ctx;
    applyPer(S.q);
    const narrow = () => vhost.clientWidth <= 760;
    vhost.innerHTML = `<div class="rq" data-rq>
      <section class="rq-col rq-lib" data-lib></section>
      <section class="rq-col" data-bld></section>
      <section class="rq-col rq-res" data-res></section></div>`;
    const $ = (s) => vhost.querySelector(s);
    let R = null, resT = 0, shownN = null;

    /* ---------- Gauche : bibliothèque ---------- */
    function libHTML(inSheet) {
      const strip = !inSheet && narrow();
      const sv = S.saved.filter((s) => S.libF === 'all' || (S.libF === 'me' ? s.author === ME && !s.shared : s.shared));
      return `<div class="rq-sec"><div class="row" style="justify-content:space-between"><h3 class="crm-h2">${GX.icon('star', 'sm')} Recettes</h3><span class="crm-note">≈ au dernier import</span></div>
          <div class="rq-hint" style="padding:9px 11px;font-size:12.5px;gap:9px">${GX.icon('handshake', 'sm')}<div>${RULE_AGENT}</div></div>
          <div class="rq-rcs ${strip ? 'strip' : ''}">${RECIPES.map((r) => `<button class="rq-rc ${S.q.from === r.id ? 'on' : ''}" data-rcp="${r.id}" style="--c:${r.c}"><span class="ico">${GX.icon(r.i, 'sm')}</span><span class="tx"><span class="t">${esc(r.l)}</span><span class="d">${esc(r.d)}</span></span><span class="k" data-tip="Estimation, clients">≈ ${n0(RCOUNT[r.id])}</span></button>`).join('')}</div></div>
        <details class="rq-sec" ${strip ? '' : 'open'}><summary><h3 class="crm-h2">${GX.icon('file', 'sm')} Mes requêtes <span class="n">${S.saved.length}</span></h3><span class="chev">${GX.icon('chevron', 'sm')}</span></summary>
          <div class="seg" data-libf style="width:100%">${[['all', 'Toutes'], ['me', 'Perso'], ['team', 'Partagées']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${S.libF === v}" style="flex:1">${l}</button>`).join('')}</div>
          <div class="rq-rcs">${sv.map((s) => `<button class="rq-rc ${S.q.savedId === s.id ? 'on' : ''}" data-sv="${s.id}" style="--c:${s.shared ? 'var(--info)' : 'var(--text-3)'}"><span class="ico">${GX.icon(s.shared ? 'users' : 'user', 'sm')}</span><span class="tx"><span class="t">${esc(s.name)}</span><span class="d">${esc(s.author)} · ${dFR(s.date)} · ${CANAL[s.q.canal].l}</span></span><span class="k" data-tip="Résultat au dernier lancement (${dFR(s.date)})">${n0(s.count)}</span></button>`).join('') || '<div class="crm-note">Aucune requête ici.</div>'}</div></details>
        <details class="rq-sec" ${strip ? '' : 'open'}><summary><h3 class="crm-h2">${GX.icon('clock', 'sm')} Historique des exports</h3><span class="chev">${GX.icon('chevron', 'sm')}</span></summary>
          <div>${S.journal.slice(0, 5).map(jrHTML).join('')}</div>
          <button class="crm-link" data-act="journal" style="align-self:flex-start">Tout l’historique (${S.journal.length})</button></details>`;
    }
    const jrHTML = (j) => `<div class="rq-jr"><span class="ic">${FMT[j.fmt][1]}</span><div class="grow" style="min-width:0"><div><b>${esc(j.who)}</b> · ${FMT[j.fmt][0]} · <b class="num">${n0(j.n)}</b> lignes</div><div class="faint ellipsis">« ${esc(j.qn)} » · ${when(j.when)}</div></div></div>`;
    const when = (iso) => { const d = GX.iso(new Date(iso)), t = new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); return d === TODAY ? `aujourd’hui ${t}` : `${dFR(d)} ${t}`; };
    function wireLib(host, close) {
      host.querySelectorAll('[data-rcp]').forEach((b) => b.addEventListener('click', () => { const r = RECIPES.find((x) => x.id === b.dataset.rcp); S.q = r.q(); S.q.from = r.id; S.open = null; close?.(); all(); GX.shell.hud(`Recette chargée : ${r.l}`); }));
      host.querySelectorAll('[data-sv]').forEach((b) => b.addEventListener('click', () => { const s = S.saved.find((x) => x.id === b.dataset.sv); S.q = { ...cloneQ(s.q), name: s.name, savedId: s.id, shared: s.shared }; S.open = null; close?.(); all(); }));
      host.querySelector('[data-libf]')?.addEventListener('change', (e) => { S.libF = e.detail; setTimeout(() => { host.innerHTML = libHTML(!!close); wireLib(host, close); }, 140); });
      host.querySelector('[data-act=journal]')?.addEventListener('click', () => { close?.(); journalSheet(); });
    }
    const renderLib = () => { const h = $('[data-lib]'); h.innerHTML = libHTML(false); wireLib(h); };

    /* ---------- Centre : constructeur ---------- */
    function brickHTML(b) {
      const t = TY[b.t], f = FAMS[t.fam], open = S.open === b.id && !t.soon, ex = R?.ex[b.id];
      const imp = t.fam === 'sauf' ? `<span class="rq-bn ${ex && !t.soon ? '' : 'z'}" data-bn="${b.id}" data-soon="${t.soon ? 1 : ''}" data-tip="${t.soon ? 'Clients concernés aujourd’hui (exclusion automatique au lot 4)' : 'Clients retirés par cette exclusion'}">${ex ? (t.soon ? `${n0(sc(ex))} concernés` : `− ${n0(sc(ex))}`) : '0'}</span>` : '';
      return `<div class="rq-b ${b.on ? '' : 'off'} ${open ? 'open' : ''} ${t.soon ? 'soon' : ''}" data-b="${b.id}" style="--c:${f.c}">
        <div class="rq-bh"><span class="rq-bi">${GX.icon(f.i, 'sm')}</span>
          <button class="rq-bs" data-edit ${t.soon ? 'disabled' : ''} data-tip="${t.soon ? 'Arrive au lot 4' : 'Cliquer pour modifier'}">${t.say(b.p)}</button>
          ${b.per ? '<span class="crm-tag" data-tip="Prérempli par le périmètre choisi dans la barre de menus">Périmètre</span>' : ''}${t.lot ? `<span class="crm-tag">${t.lot}</span>` : ''}${imp}
          ${t.soon ? '' : `<input type="checkbox" class="switch" data-tog ${b.on ? 'checked' : ''} aria-label="Activer la condition" data-tip="${b.on ? 'Désactiver temporairement' : 'Réactiver'}" />
          <button class="icon-btn sm" data-del aria-label="Supprimer la condition" data-tip="Supprimer">${GX.icon('trash', 'sm')}</button>`}</div>
        ${open ? `<div class="rq-be">${editorHTML(b)}${t.note ? `<div class="rq-hint" style="padding:10px 12px;font-size:13px">${GX.icon('info', 'sm')}<div>${t.note}</div></div>` : ''}<div class="foot"><span class="crm-note">${t.scope === 'line' ? 'Porte sur le même véhicule que les autres conditions Véhicule, Achat et Financement.' : 'Porte sur la fiche client.'}</span><button class="btn sm primary" data-done>${GX.icon('check', 'sm')}Terminé</button></div></div>` : ''}</div>`;
    }
    function editorHTML(b) {
      const p = b.p;
      return TY[b.t].fields.filter((f) => !f.show || f.show(p)).map((f) => `<div class="rq-fld"><span class="crm-lbl">${esc(f.l)}</span>${(() => {
        switch (f.t) {
          case 'chips': return GX.ui.chips(f.opts, p[f.k], { all: f.all || 'Peu importe', colors: f.colors || {}, attr: `data-f="${f.k}"` });
          case 'seg': return `<div class="seg" data-f="${f.k}">${f.opts.map(([v, l]) => `<button data-v="${v}" aria-pressed="${p[f.k] === v}">${esc(l)}</button>`).join('')}</div>`;
          case 'pick1': return GX.ui.pickerBtn(`data-pk1="${f.k}" style="max-width:100%"`, f.i, p[f.k] || 'Choisir…', !!p[f.k]);
          case 'pick': case 'sites': return GX.ui.pickerBtn(`data-pk="${f.k}" data-pt="${f.t}" style="max-width:100%"`, f.t === 'sites' ? 'pin' : f.i, GX.ui.summary(p[f.k], { all: f.all || 'Tout le réseau', max: 3 }), p[f.k].length);
          case 'range': return `<div class="rq-range"><span class="faint">de</span><input class="input" type="number" inputmode="numeric" min="0" data-n="${f.a}" value="${has(p[f.a]) ? p[f.a] : ''}" placeholder="—" aria-label="Minimum" /><span class="faint">à</span><input class="input" type="number" inputmode="numeric" min="0" data-n="${f.b}" value="${has(p[f.b]) ? p[f.b] : ''}" placeholder="—" aria-label="Maximum" /><span>${esc(f.u)}</span><span class="crm-note">Laisser vide = sans limite</span></div>`;
          case 'num': return `<div class="rq-range"><input class="input" type="number" inputmode="numeric" min="0" data-n="${f.k}" value="${has(p[f.k]) ? p[f.k] : ''}" /><span>${esc(f.u)}</span></div>`;
          case 'dates': return `<div class="rq-range"><input class="input" type="date" data-d="${f.a}" value="${p[f.a] || ''}" aria-label="Du" /><span class="faint">au</span><input class="input" type="date" data-d="${f.b}" value="${p[f.b] || ''}" aria-label="Au" /></div>`;
          case 'text': return `<input class="input" data-s="${f.k}" value="${esc(p[f.k] || '')}" placeholder="${esc(f.ph ? f.ph(p) : '')}" />`;
        }
        return '';
      })()}</div>`).join('');
    }
    function guardHTML() {
      const G = CANAL[S.q.canal]; if (!G.need) return '';
      const tag = `<span class="crm-tag" data-tip="Ajouté d’office par le canal : choisissez « Tous » pour l’enlever">${GX.icon('lock', 'sm')} ${G.l}</span>`;
      return `<div class="rq-b rq-lock" style="--c:${FAMS.coord.c}"><div class="rq-bh"><span class="rq-bi">${GX.icon('lock', 'sm')}</span><span class="rq-bs">${G.say}</span>${tag}</div></div>
        <div class="rq-b rq-lock ${S.q.dedupe ? '' : 'off'}" style="--c:${FAMS.coord.c}"><div class="rq-bh"><span class="rq-bi">${GX.icon('users', 'sm')}</span><span class="rq-bs">${b_(G.dd)} (dédoublonnage)</span>${tag}<input type="checkbox" class="switch" data-dd ${S.q.dedupe ? 'checked' : ''} aria-label="Dédoublonner" data-tip="Dédoublonnage ${S.q.dedupe ? 'actif' : 'coupé'}" /></div></div>`;
    }
    function bldHTML() {
      const q = S.q, sv = S.saved.find((s) => s.id === q.savedId);
      const user = q.bricks.filter((b) => TY[b.t].fam !== 'sauf');
      let list = '', prevFam = null, first = true;
      for (const fam of FAM_ORDER) {
        const L = q.bricks.filter((b) => TY[b.t].fam === fam), guard = fam === 'coord' ? guardHTML() : '';
        if (!L.length && !guard) continue;
        list += `<div class="rq-fh" style="--c:${FAMS[fam].c}">${GX.icon(FAMS[fam].i, 'sm')}${FAMS[fam].l}${fam === 'sauf' ? ' <span style="text-transform:none;letter-spacing:0;font-weight:600;color:var(--text-3)">— ces clients sont retirés</span>' : ''}<span class="l"></span><button data-addf="${fam}">${GX.icon('plus', 'sm')}Ajouter</button></div>`;
        L.forEach((b) => { if (!first && prevFam === fam) list += '<span class="rq-and">et</span>'; list += brickHTML(b); first = false; prevFam = fam; });
        if (guard) { if (L.length) list += '<span class="rq-and">et</span>'; list += guard; }
        prevFam = fam;
      }
      return `<div class="rq-bld"><button class="rq-mini" data-mini aria-label="Voir le résultat"></button>
        <div class="rq-top"><div class="rq-name"><textarea class="rq-title" data-name rows="1" aria-label="Nom de la requête" spellcheck="false">${esc(q.name)}</textarea>
          <span class="crm-tag" data-tip="${sv ? `Enregistrée par ${esc(sv.author)} le ${dFR(sv.date)}` : 'Pas encore enregistrée'}">${sv ? (sv.shared ? `${GX.icon('users', 'sm')} Partagée` : `${GX.icon('user', 'sm')} Perso`) : 'Brouillon'}</span></div>
          <div class="rq-acts"><button class="btn rq-libbtn" data-act="lib">${GX.icon('star', 'sm')}Recettes</button>
            <button class="btn" data-act="more" aria-label="Plus d’actions" data-tip="Nouvelle, dupliquer…">${GX.icon('more', 'sm')}</button>
            <button class="btn" data-act="plan" data-tip="Relancer chaque semaine et prévenir">${GX.icon('clock', 'sm')}Programmer</button>
            <button class="btn primary" data-act="save">${GX.icon('check', 'sm')}Enregistrer</button></div></div>
        <div class="card rq-opts">
          <div class="rq-opt"><span class="crm-lbl">Une ligne par</span><div class="seg" data-level>${[['client', 'Client'], ['veh', 'Véhicule']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${q.level === v}">${l}</button>`).join('')}</div></div>
          <div class="rq-opt rq-canal"><span class="crm-lbl">Pour un envoi par</span><div class="seg" data-canal>${Object.entries(CANAL).map(([k, c]) => `<button data-v="${k}" aria-pressed="${q.canal === k}">${canIcon(k)}${c.l}</button>`).join('')}</div></div>
        </div>
        ${user.length ? '' : `<div class="rq-hint">${GX.icon('info')}<div><b style="color:var(--text)">Partez d’une recette</b>, ou ajoutez une condition ci-dessous. Chaque condition se lit comme une phrase et se modifie d’un clic.</div></div>`}
        <div class="rq-list">${list}</div>
        <div class="rq-add"><span class="crm-lbl" style="margin-right:4px">Ajouter une condition</span>${FAM_ORDER.map((k) => `<button data-addf="${k}" style="--c:${FAMS[k].c}">${GX.icon(FAMS[k].i, 'sm')}${FAMS[k].l}${k === 'sauf' ? '…' : ''}</button>`).join('')}</div>
        <div class="crm-note">${GX.icon('info', 'sm')} <b>ET</b> entre les conditions, <b>OU</b> entre les valeurs d’une même condition. Les conditions Véhicule, Achat et Financement portent sur <b>le même véhicule</b>. Une condition désactivée reste en place mais ne compte pas.</div>
      </div>`;
    }
    function renderBld() { const h = $('[data-bld]'), st = h.scrollTop; h.innerHTML = bldHTML(); h.scrollTop = st; wireBld(h); }
    function refreshBrick(b) {   // changement de mode : on redessine la brique, pas tout le constructeur
      const el = $(`[data-b="${b.id}"]`); if (!el) return renderBld();
      el.outerHTML = brickHTML(b); wireBrick($(`[data-b="${b.id}"]`), b);
    }
    function softBrick(b) { const s = $(`[data-b="${b.id}"] .rq-bs`); if (s) s.innerHTML = TY[b.t].say(b.p); schedule(); }
    function wireBrick(el, b) {
      if (!el) return;
      const t = TY[b.t];
      el.querySelector('[data-edit]')?.addEventListener('click', () => { const was = S.open; S.open = S.open === b.id ? null : b.id; if (was && was !== b.id) { const o = S.q.bricks.find((x) => x.id === was); if (o) refreshBrick(o); } refreshBrick(b); });
      el.querySelector('[data-done]')?.addEventListener('click', () => { S.open = null; refreshBrick(b); });
      el.querySelector('[data-tog]')?.addEventListener('change', (e) => { b.on = e.target.checked; el.classList.toggle('off', !b.on); schedule(); });
      el.querySelector('[data-del]')?.addEventListener('click', () => {
        const i = S.q.bricks.indexOf(b); S.q.bricks.splice(i, 1); if (S.open === b.id) S.open = null; renderBld(); schedule();
        GX.shell.hud('Condition supprimée');
      });
      el.querySelectorAll('.chips[data-f]').forEach((g) => g.addEventListener('change', (e) => { b.p[g.dataset.f] = e.detail; softBrick(b); }));
      el.querySelectorAll('.seg[data-f]').forEach((g) => g.addEventListener('change', (e) => { b.p[g.dataset.f] = e.detail; setTimeout(() => { refreshBrick(b); schedule(); }, 140); }));
      el.querySelectorAll('[data-pk1]').forEach((btn) => btn.addEventListener('click', (e) => { const k = btn.dataset.pk1, f = t.fields.find((x) => x.k === k);
        GX.ui.pick(e.currentTarget, [{ items: f.opts() }], { multi: false, title: f.l, selected: [b.p[k]], width: 300, onChange: ([v]) => { b.p[k] = v; btn.querySelector('.v').textContent = v; softBrick(b); } }); }));
      el.querySelectorAll('[data-pk]').forEach((btn) => btn.addEventListener('click', (e) => {
        const k = btn.dataset.pk, f = t.fields.find((x) => x.k === k);
        const done = (v) => { b.p[k] = v; btn.querySelector('.v').textContent = GX.ui.summary(v, { all: f.all || 'Tout le réseau', max: 3 }); btn.classList.toggle('active', !!v.length); softBrick(b); };
        if (btn.dataset.pt === 'sites') GX.ui.sitePicker(e.currentTarget, b.p[k], done, { variant: 'filter', entities: false, title: f.l });
        else GX.ui.pick(e.currentTarget, f.groups(), { title: f.l, selected: b.p[k], allLabel: f.all || 'Tous', onChange: done, width: 300 });
      }));
      let tn; const deb = () => { clearTimeout(tn); tn = setTimeout(() => softBrick(b), 220); };
      el.querySelectorAll('[data-n]').forEach((i) => i.addEventListener('input', () => { b.p[i.dataset.n] = i.value === '' ? '' : Math.max(0, +i.value); deb(); }));
      el.querySelectorAll('[data-d]').forEach((i) => i.addEventListener('change', () => { b.p[i.dataset.d] = i.value; softBrick(b); }));
      el.querySelectorAll('[data-s]').forEach((i) => i.addEventListener('input', () => { b.p[i.dataset.s] = i.value; deb(); }));
    }
    function addMenu(fam, anchor) {
      const items = Object.entries(TY).filter(([k, t]) => t.fam === fam && !(fam === 'coord' && ['tel'].includes(k)));
      GX.menu.open([{ header: FAMS[fam].l }, ...items.map(([k, t]) => ({ label: t.l + (t.soon ? ' (lot 4)' : ''), icon: FAMS[fam].i, disabled: !!t.soon || (t.fam === 'sauf' && S.q.bricks.some((b) => b.t === k)), action: () => {
        const b = mk(k); const sauf = S.q.bricks.findIndex((x) => TY[x.t].fam === 'sauf');
        if (fam === 'sauf' || sauf < 0) S.q.bricks.push(b); else S.q.bricks.splice(sauf, 0, b);
        S.open = TY[k].fields.length ? b.id : null; S.q.from = null; renderBld(); schedule(); renderLibSoft();
        requestAnimationFrame(() => { const el = $(`[data-b="${b.id}"]`); if (!el) return; el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); GX.animate(el, [{ opacity: 0, transform: 'translateY(-6px) scale(.98)' }, { opacity: 1, transform: 'none' }], { spring: 'snappy' }); });
      } }))], anchor);
    }
    function wireBld(h) {
      S.q.bricks.forEach((b) => wireBrick(h.querySelector(`[data-b="${b.id}"]`), b));
      const ta = h.querySelector('[data-name]'), fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }; requestAnimationFrame(fit);
      ta.addEventListener('input', () => { S.q.name = ta.value.replace(/\n/g, ' '); fit(); }); ta.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ta.blur(); } });
      h.querySelector('[data-level]')?.addEventListener('change', (e) => { S.q.level = e.detail; schedule(); });
      h.querySelector('[data-canal]')?.addEventListener('change', (e) => { S.q.canal = e.detail; setTimeout(() => { renderBld(); schedule(); }, 140); });
      h.querySelector('[data-dd]')?.addEventListener('change', (e) => { S.q.dedupe = e.target.checked; e.target.closest('.rq-b').classList.toggle('off', !S.q.dedupe); schedule(); });
      h.querySelector('[data-mini]')?.addEventListener('click', () => $('[data-res]').scrollIntoView({ behavior: 'smooth', block: 'start' }));
      h.querySelectorAll('[data-addf]').forEach((b) => b.addEventListener('click', (e) => addMenu(b.dataset.addf, e.currentTarget)));
      h.querySelector('[data-act=save]')?.addEventListener('click', saveSheet);
      h.querySelector('[data-act=plan]')?.addEventListener('click', planSheet);
      h.querySelector('[data-act=lib]')?.addEventListener('click', () => { const s = win.sheet(`<div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">Recettes et requêtes</h3><button class="icon-btn sm" data-sheet="" aria-label="Fermer">${GX.icon('close', 'sm')}</button></div><div class="col" style="gap:18px" data-libs>${libHTML(true)}</div>`, { width: 460 }); wireLib(s.el.querySelector('[data-libs]'), () => s.close()); });
      h.querySelector('[data-act=more]')?.addEventListener('click', (e) => GX.menu.open([
        { label: 'Nouvelle requête vide', icon: 'plus', action: () => { S.q = newQ('Nouvelle requête'); S.open = null; all(); } },
        { label: 'Dupliquer', icon: 'copy', action: () => { S.q = { ...cloneQ(S.q), name: S.q.name + ' (copie)', savedId: null }; all(); GX.shell.hud('Requête dupliquée : pensez à l’enregistrer'); } },
        '-', { label: 'Réactiver toutes les conditions', icon: 'refresh', disabled: !S.q.bricks.some((b) => !b.on), action: () => { S.q.bricks.forEach((b) => (b.on = true)); renderBld(); schedule(); } },
        { label: 'Historique des exports', icon: 'clock', action: journalSheet },
      ], e.currentTarget, { align: 'right' }));
    }
    const renderLibSoft = () => renderLib();   // toujours : la colonne masquée en largeur moyenne peut réapparaître

    /* ---------- Droite : résultat ---------- */
    function schedule() { clearTimeout(resT); resT = setTimeout(renderRes, 90); }
    function resHTML() {
      const q = S.q, G = CANAL[q.canal];
      const nC = sc(R.final.length), nL = sc(q.canal !== 'tous' && q.dedupe && q.level === 'veh' ? R.final.length : R.nLines), main = q.level === 'veh' ? nL : nC;
      const prev = sc(weekAgo(q, mainN(q, R))), d = main - prev, pct = prev ? (d / prev) * 100 : 0;
      const f = R.fun, fb = Math.max(1, f.base);
      const funRow = (k, ic, l, v, on) => `<div class="${on ? 'on' : ''}"><span class="lb">${ic}<span>${l}</span></span><b>${n0(sc(v))}<span class="faint" style="font-weight:500"> · ${Math.round((v / fb) * 100)} %</span></b><div class="bar"><i style="width:${(v / fb) * 100}%;--c:${on ? 'var(--accent)' : 'var(--info)'}"></i></div></div>`;
      const W = [];
      if (R.sus) W.push(['var(--danger)', 'alert', `<b>${n0(sc(R.sus))}</b> clients écartés car leur ${G.coord} est <b>suspect</b> (${G.susWhy}).`]);
      if (R.noCoord) W.push(['var(--text-3)', 'info', `<b>${n0(sc(R.noCoord))}</b> clients écartés faute de ${G.coord} ${q.canal === 'courrier' ? 'complète' : 'valide'}.`]);
      if (R.dup) W.push(['var(--info)', 'users', `<b>${n0(sc(R.dup))}</b> doublons retirés : ${G.dd[0].toLowerCase() + G.dd.slice(1)}.`]);
      if (q.level === 'veh' && q.canal !== 'tous' && q.dedupe && R.nLines > R.final.length) W.push(['var(--info)', 'car', `Un client à plusieurs véhicules ne reçoit qu’un envoi : <b>${n0(sc(R.nLines - R.final.length))}</b> lignes véhicule regroupées.`]);
      if (q.canal === 'tous' && R.sus2) W.push(['var(--warn)', 'alert', `<b>${n0(sc(R.sus2))}</b> clients ont une coordonnée suspecte : elle ne sera jamais exportée.`]);
      if (R.nplc) W.push(['var(--warn)', 'belloff', `<b>${n0(sc(R.nplc))}</b> clients marqués « ne plus contacter » sont encore dans la liste : leur exclusion automatique arrive au lot 4.`]);
      if (R.gen) W.push(['var(--warn)', 'building', `<b>${n0(sc(R.gen))}</b> identités génériques (garages, loueurs) sont incluses.`]);
      if (R.aConf) W.push(['var(--text-3)', 'info', `<b>${n0(sc(R.aConf))}</b> contrats ont un code de financement « à confirmer » (DLA, NLO, 06…) : leur famille est provisoire.`]);
      if (R.off) W.push(['var(--text-3)', 'eye', `${R.off} condition${R.off > 1 ? 's' : ''} désactivée${R.off > 1 ? 's' : ''} : ${R.off > 1 ? 'elles ne comptent' : 'elle ne compte'} pas.`]);
      const [rl, rf] = repere(q), P = rows(q, R, 20);
      return `<div class="rq-resi">
        <div class="card rq-cnt"><span class="crm-lbl">Résultat · en direct</span>
          <div class="rq-big" data-big>${n0(shownN ?? main)}<small>${q.level === 'veh' ? 'véhicules' : 'clients'}</small></div>
          <div class="rq-sub"><span>${q.level === 'veh' ? `${n0(nC)} clients` : `${n0(nL)} véhicules`}</span>
            <span class="badge" style="--c:${d >= 0 ? 'var(--ok)' : 'var(--warn)'}" data-tip="Même requête relancée lundi dernier : ${n0(prev)}">${GX.icon(d >= 0 ? 'arrowup' : 'arrowdown', 'sm')}${d >= 0 ? '+' : '−'}${n0(Math.abs(d))} (${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1).replace('.', ',')} %) vs semaine dernière</span></div>
          ${G.need ? `<div class="crm-note">sur ${n0(sc(f.base))} correspondants avant les garde-fous du canal ${G.l}</div>` : `<div class="crm-note">Aucun canal choisi : pas de garde-fou ni de dédoublonnage.</div>`}</div>
        <div class="card crm-panel" style="gap:10px"><h3 class="crm-h2">${GX.icon('target', 'sm')} Joignabilité</h3><div class="rq-fun">
          ${funRow('base', GX.icon('users', 'sm'), 'Correspondants', f.base, q.canal === 'tous')}
          ${funRow('mail', GX.icon('mail', 'sm'), 'avec un e-mail valide', f.mail, q.canal === 'email')}
          ${funRow('port', GX.icon('sms', 'sm'), 'avec un portable valide', f.port, q.canal === 'sms' || q.canal === 'phoning')}
          ${funRow('adr', IC.letter, 'avec une adresse complète', f.adr, q.canal === 'courrier')}</div></div>
        ${W.length ? `<div class="rq-warn">${W.map(([c, i, t]) => `<div style="--c:${c}">${GX.icon(i, 'sm')}<span>${t}</span></div>`).join('')}</div>` : ''}
        <div class="card crm-panel" style="gap:10px"><div class="row wrap" style="justify-content:space-between;gap:8px"><h3 class="crm-h2">${GX.icon('pie', 'sm')} Répartition</h3>
          <div class="seg" data-rt>${[['site', 'Sites'], ['brand', 'Marques'], ['mois', hasT(q, 'fin') ? 'Échéances' : 'Énergies']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${S.resTab === v}">${l}</button>`).join('')}</div></div>
          <div data-rep>${repHTML()}</div></div>
        <div class="card crm-panel" style="gap:10px;padding-left:0;padding-right:0;padding-bottom:6px"><div class="row" style="justify-content:space-between;padding:0 18px"><h3 class="crm-h2">${GX.icon('list', 'sm')} Aperçu <span class="n">${P.length} lignes</span></h3></div>
          ${P.length ? `<div class="scroll"><table class="tbl rq-prev"><thead><tr><th>Client</th><th>Véhicule</th><th>${rl}</th><th data-tip="E-mail · portable valides">Contact</th><th>Vendeur</th></tr></thead><tbody>${P.map((l) => `<tr data-cid="${l.c.id}">
            <td><div class="nm">${esc(nameOf(l.c))}</div><div class="sm">${esc(l.c.ville)} · ${esc(l.s.site)}</div></td>
            <td><div class="row" style="gap:6px;white-space:nowrap"><i class="brand-dot" style="--c:${BR_C[l.v.brand]}"></i>${esc(l.v.modele)}</div><div class="sm">${esc(l.v.immat)} · ${X.VH_L[l.s.source]}</div></td>
            <td class="num" style="white-space:nowrap">${rf(l)}</td>
            <td style="white-space:nowrap"><span class="${l.c._rq.mail ? 'rq-ok' : 'rq-ko'}">${GX.icon('mail', 'sm')}</span> <span class="${l.c._rq.port ? 'rq-ok' : 'rq-ko'}">${GX.icon('sms', 'sm')}</span></td>
            <td style="white-space:nowrap">${esc(l.c.vendeurRef)}</td></tr>`).join('')}</tbody></table></div>`
            : `<div class="empty" style="padding:26px 16px">${GX.icon('filter')}Aucun client ne correspond.<span class="crm-note">Désactivez une condition pour voir laquelle bloque.</span></div>`}
          <div class="crm-note" style="padding:0 18px">Un clic ouvre la fiche client. Seules ces 20 lignes quittent le serveur ; la liste complète part à l’export.</div></div>
      </div>
      <div class="rq-exp"><div class="row" style="justify-content:space-between"><span class="crm-lbl">Exporter ${n0(main)} ${q.level === 'veh' ? 'lignes véhicule' : 'clients'}</span><button class="crm-link" data-act="journal">Historique</button></div>
        <div class="bt">${[['excel', 'Excel'], ['csv', 'Sarbacane'], ['sms', 'allmysms'], ['phoning', 'Phoning'], ['courrier', 'Courrier']].map(([k, l]) => `<button data-exp="${k}" class="${({ email: 'csv', sms: 'sms', phoning: 'phoning', courrier: 'courrier' }[q.canal] === k) ? 'rec' : ''}" ${main ? '' : 'disabled'}>${FMT[k][1]}${l}</button>`).join('')}</div></div>`;
    }
    function repHTML() {
      const q = S.q, L = rows(q, R);
      const cnt = (fn) => { const m = new Map(); L.forEach((l) => { const k = fn(l); if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
      if (!L.length) return '<div class="crm-note">—</div>';
      if (S.resTab === 'brand') return GX.chart.hbars({ items: cnt((l) => l.v.brand).map(([k, v]) => ({ label: k, value: sc(v), color: BR_C[k] })), fmt: n0 });
      if (S.resTab === 'mois') {
        if (!hasT(q, 'fin')) return GX.chart.hbars({ items: cnt((l) => l.v.energie).map(([k, v]) => ({ label: k, value: sc(v) })), fmt: n0 });
        const ms = Array.from({ length: 12 }, (_, i) => addM(TODAY, i).slice(0, 7));
        const by = cnt((l) => fe(l.s)?.fin.slice(0, 7)); const g = Object.fromEntries(by);
        const used = ms.filter((m) => g[m]); if (!used.length) return '<div class="crm-note">Aucune échéance dans les 12 prochains mois.</div>';
        const span2 = ms.slice(ms.indexOf(used[0]), ms.indexOf(used[used.length - 1]) + 1);
        return GX.chart.bars({ labels: span2.map((m) => H.mY(m + '-15')), series: [{ name: 'Fins de contrat', values: span2.map((m) => sc(g[m] || 0)), color: X.FAM_C.LOA }], height: 150, fmt: n0 });
      }
      const s = cnt((l) => l.s.site), top = s.slice(0, 6), rest = s.slice(6).reduce((a, [, v]) => a + v, 0);
      return GX.chart.hbars({ items: [...top.map(([k, v]) => ({ label: k, value: sc(v) })), ...(rest ? [{ label: `${s.length - 6} autres sites`, value: sc(rest), color: 'var(--text-3)' }] : [])], fmt: n0 });
    }
    function renderRes() {
      R = run(S.q);
      const h = $('[data-res]'); if (!h) return;
      const st = h.scrollTop, q = S.q, target = sc(mainN(q, R));
      const from = shownN; shownN = target;
      h.innerHTML = resHTML(); h.scrollTop = st;
      const mini = vhost.querySelector('[data-mini]'); if (mini) mini.innerHTML = `${GX.icon('target', 'sm')}<b>${n0(target)}</b> ${q.level === 'veh' ? 'véhicules' : 'clients'} ${GX.icon('arrowdown', 'sm')}`;
      // impacts des « Sauf » dans le constructeur
      vhost.querySelectorAll('[data-bn]').forEach((el) => { const v = R.ex[el.dataset.bn] || 0, so = !!el.dataset.soon; el.textContent = v ? (so ? `${n0(sc(v))} concernés` : `− ${n0(sc(v))}`) : '0'; el.classList.toggle('z', !v || so); });
      const big = h.querySelector('[data-big]');
      if (big && from !== null && from !== target) { const t0 = performance.now(), small = big.querySelector('small').outerHTML; const step = (t) => { const k = Math.min(1, (t - t0) / 420), e = 1 - Math.pow(1 - k, 3); big.innerHTML = n0(Math.round(from + (target - from) * e)) + small; if (k < 1 && big.isConnected) requestAnimationFrame(step); }; requestAnimationFrame(step); }
      h.querySelector('[data-rt]')?.addEventListener('change', (e) => { S.resTab = e.detail; h.querySelector('[data-rep]').innerHTML = repHTML(); });
      h.querySelectorAll('[data-cid]').forEach((tr) => tr.addEventListener('click', () => ctx.openClient(tr.dataset.cid, tr)));
      h.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', () => exportSheet(b.dataset.exp)));
      h.querySelector('[data-act=journal]')?.addEventListener('click', journalSheet);
    }
    function all() { renderLib(); renderBld(); renderRes(); }

    /* =====================================================================
       Volets : enregistrer, programmer, exports, historique
       ===================================================================== */
    function saveSheet() {
      const q = S.q, sv = S.saved.find((s) => s.id === q.savedId), mine = !sv || sv.author === ME;
      const s = win.sheet(`<div class="label" style="color:var(--accent)">Requêteur</div><h3 style="margin:2px 0 8px">${sv && mine ? 'Mettre à jour la requête' : 'Enregistrer la requête'}</h3>
        <label class="field" style="margin-top:10px"><span class="label">Nom</span><input class="input" data-sn value="${esc(q.name)}" /></label>
        <div class="field" style="margin-top:12px"><span class="label">Visible par</span><div class="seg" data-ssh style="width:100%"><button data-v="me" aria-pressed="${!(sv?.shared)}" style="flex:1">${GX.icon('user', 'sm')} Moi seulement</button><button data-v="team" aria-pressed="${!!sv?.shared}" style="flex:1">${GX.icon('users', 'sm')} Toute l’équipe CRM</button></div></div>
        <div class="crm-note" style="margin-top:10px">On enregistre les <b>conditions</b>, jamais la liste : relancée demain, la requête tiendra compte de l’import de la nuit.${sv && !mine ? ` Cette requête appartient à ${esc(sv.author)} : vous en créez une copie.` : ''}</div>
        <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">Enregistrer</button></div>`, { width: 480, onClose: (v) => {
          if (v !== 'ok') return; const name = (el.querySelector('[data-sn]').value || 'Sans nom').trim(), shared = shareV === 'team', n = sc(mainN(S.q, run(S.q)));
          S.q.name = name;
          if (sv && mine) Object.assign(sv, { name, shared, q: cloneQ(S.q), date: TODAY, count: n });
          else { const x = { id: 's' + ++qid, name, q: cloneQ(S.q), author: ME, date: TODAY, shared, count: n }; S.saved.unshift(x); S.q.savedId = x.id; }
          S.q.shared = shared; renderLib(); renderBld(); GX.shell.hud(shared ? 'Requête enregistrée et partagée avec l’équipe' : 'Requête enregistrée');
        } });
      const el = s.el; let shareV = sv?.shared ? 'team' : 'me';
      el.querySelector('[data-ssh]').addEventListener('change', (e) => { shareV = e.detail; });
    }
    function planSheet() {
      win.sheet(`<div class="row" style="gap:8px"><span class="label" style="color:var(--accent)">Requêteur</span><span class="badge" style="--c:var(--bony-violet)">${GX.icon('star', 'sm')}Idée · pas encore au planning</span></div>
        <h3 style="margin:6px 0 8px">Programmer « ${esc(S.q.name)} »</h3>
        <div class="muted" style="line-height:1.5">La requête se relance seule après l’import de la nuit, et vous prévient quand il y a du nouveau. Aucune liste n’est envoyée par e-mail : le résultat reste dans Gearbox.</div>
        <div class="col" style="gap:12px;margin-top:14px">
          <label class="field"><span class="label">Quand</span><select class="select"><option>Chaque lundi à 7 h</option><option>Chaque jour à 7 h</option><option>Le 1er de chaque mois</option></select></label>
          <label class="row" style="gap:10px;font-size:13.5px"><input type="checkbox" class="switch" checked />Me prévenir par une notification Gearbox</label>
          <label class="row" style="gap:10px;font-size:13.5px"><input type="checkbox" class="switch" checked />Seulement si le nombre de clients bouge de plus de <input class="input" type="number" value="5" style="width:64px;height:30px" /> %</label>
          <label class="row" style="gap:10px;font-size:13.5px"><input type="checkbox" class="switch" />Ne garder que les <b>nouveaux</b> clients depuis la dernière fois</label>
        </div>
        <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">Noter l’idée</button></div>`, { width: 500, onClose: (v) => { if (v === 'ok') GX.shell.hud('Idée notée : « Programmer » n’est pas encore développé'); } });
    }
    function journalSheet() {
      win.sheet(`<div class="row" style="justify-content:space-between"><h3 style="margin:0">Historique des exports</h3><button class="icon-btn sm" data-sheet="" aria-label="Fermer">${GX.icon('close', 'sm')}</button></div>
        <div class="crm-note" style="margin:6px 0 12px">Chaque export est tracé : qui, quand, combien de lignes, quelle requête, quel format. Le journal ne s’efface pas.</div>
        <div class="scroll"><table class="tbl"><thead><tr><th>Quand</th><th>Qui</th><th>Format</th><th class="r">Lignes</th><th>Requête</th><th>Fichier</th></tr></thead><tbody>${S.journal.map((j) => `<tr><td style="white-space:nowrap">${when(j.when)}</td><td style="white-space:nowrap">${esc(j.who)}</td><td style="white-space:nowrap">${FMT[j.fmt][1]} ${FMT[j.fmt][0]}</td><td class="r num">${n0(j.n)}</td><td>${esc(j.qn)}</td><td class="crm-mono" style="white-space:nowrap;font-size:11.5px">${esc(j.file || fname(j.fmt, j.qn, j.who, GX.iso(new Date(j.when))))}</td></tr>`).join('')}</tbody></table></div>`, { width: 980 });
    }
    function log(fmt, n) {
      const file = fname(fmt);
      S.journal.unshift({ who: ME, when: new Date().toISOString(), fmt, n, qn: S.q.name, file });
      renderLibSoft(); GX.shell.hud(`${file} : ${n0(n)} lignes · tracé dans l’historique`);
    }

    /* Colonnes d'export : uniquement des champs de la base */
    const CIVL = { H: 'Monsieur', F: 'Madame', C: 'Madame, Monsieur', S: '' };
    const COLS = [
      ['id', 'Identifiant SPARK', (l) => l.c.id], ['civ', 'Civilité', (l) => CIVL[l.c.civ]], ['nom', 'Nom', (l) => l.c.soc ? '' : l.c.nom], ['prenom', 'Prénom', (l) => l.c.prenom],
      ['raison', 'Raison sociale', (l) => l.c.raison], ['adresse', 'Adresse', (l) => `${l.c.num} ${l.c.typeRue} ${l.c.rue}`], ['cp', 'Code postal', (l) => l.c.cp], ['ville', 'Ville', (l) => l.c.ville],
      ['portable', 'Portable', (l) => l.c._rq.port ? tel(l.c._rq.port) : ''], ['fixe', 'Téléphone fixe', (l) => l.c._rq.fixe ? tel(l.c._rq.fixe) : ''], ['email', 'E-mail', (l) => l.c._rq.mail || ''],
      ['site', 'Site', (l) => l.s.site], ['vendeur', 'Vendeur référent', (l) => l.c.vendeurRef], ['marque', 'Marque', (l) => l.v.brand], ['modele', 'Modèle', (l) => l.v.modele], ['version', 'Version', (l) => l.v.version],
      ['energie', 'Énergie', (l) => l.v.energie], ['immat', 'Immatriculation', (l) => l.v.immat], ['vin', 'VIN', (l) => l.v.vin], ['mec', '1re mise en circulation', (l) => dFR(l.v.mec)], ['ct', 'Prochain CT', (l) => dFR(l.v.ctProchain)],
      ['livr', 'Date de livraison', (l) => dFR(l.s.date)], ['typevh', 'VN / VO', (l) => X.VH_L[l.s.source]], ['montant', 'Montant tarif TTC', (l) => F.eur(l.s.tarif)], ['org', 'Organisme', (l) => fe(l.s)?.organisme || 'Aucun'],
      ['fam', 'Famille de financement', (l) => fe(l.s)?.famille || 'Comptant'], ['finfin', 'Fin de contrat', (l) => fe(l.s) ? dFR(fe(l.s).fin) : ''], ['duree', 'Durée (mois)', (l) => fe(l.s)?.duree || ''], ['r2', 'Agent R2', (l) => l.s.intermediaire || ''],
    ];
    const PRESETS = { tous: ['id', 'civ', 'nom', 'prenom', 'raison', 'cp', 'ville', 'portable', 'email', 'site', 'vendeur', 'marque', 'modele', 'immat', 'livr', 'org', 'fam', 'finfin'],
      email: ['civ', 'prenom', 'nom', 'email', 'modele', 'finfin', 'vendeur', 'site'], sms: ['prenom', 'portable', 'modele', 'finfin', 'vendeur', 'site'],
      phoning: ['civ', 'nom', 'prenom', 'portable', 'fixe', 'marque', 'modele', 'immat', 'finfin', 'livr', 'vendeur'], courrier: ['civ', 'nom', 'prenom', 'raison', 'adresse', 'cp', 'ville'] };
    const colOf = (k) => COLS.find((c) => c[0] === k);
    const expRows = (max) => rows(S.q, R, max);
    const expN = () => sc(mainN(S.q, R));
    const foot = (k, label) => `<div class="rq-fname" data-fname="${k}">${FMT[k][1]}<span class="crm-mono">${esc(fname(k))}</span></div>
      <div class="crm-note" style="margin-top:8px">${GX.icon('lock', 'sm')} Ouvert à tous les rôles qui ont SPARK, et tracé dans l’historique (qui, quand, combien, quelle requête). Le nom du fichier porte l’exportateur et la date. Les coordonnées suspectes ne sortent jamais.</div>
      <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">${GX.icon('download', 'sm')}${label} · ${n0(expN())} lignes</button></div>`;
    const head = (k, t, sub) => `<div class="row" style="gap:10px"><span class="rq-bi" style="--c:var(--accent)">${FMT[k][1]}</span><div class="grow"><h3 style="margin:0">${t}</h3><div class="crm-note">« ${esc(S.q.name)} » · ${esc(sub)}</div></div><button class="icon-btn sm" data-sheet="" aria-label="Fermer">${GX.icon('close', 'sm')}</button></div>`;

    function exportSheet(k) {
      if (!R) return;
      if (k === 'excel') return excelSheet();
      const L = expRows(Infinity), n = expN();
      if (k === 'csv') {
        /* Sarbacane : 4 champs standard + champs personnalisés (à créer une fois dans la liste Sarbacane, puis associés à l'import) */
        const STD = ['email', 'civilite', 'prenom', 'nom'], PERSO = ['modele', 'date_fin_contrat', 'vendeur', 'site', 'mois_restants'];
        const civS = (c) => c.civ === 'F' ? 'Madame' : c.civ === 'H' || c.civ === 'C' ? 'Monsieur' : '';
        const v = (l) => { const f = fe(l.s); return [l.c._rq.mail || '', civS(l.c), l.c.prenom, l.c.soc ? l.c.raison : l.c.nom, l.v.modele, f ? dFR(f.fin) : '', l.c.vendeurRef, l.s.site, f && f.fin >= TODAY ? Math.max(0, Math.round(mDiff(TODAY, f.fin))) : '']; };
        const sample = L.filter((l) => l.c._rq.mail).slice(0, 4);
        const warn = S.q.canal !== 'email' ? `<div class="rq-warn" style="margin-top:12px"><div style="--c:var(--warn)">${GX.icon('alert', 'sm')}<span>Le canal de la requête n’est pas « E-mailing » : les clients sans e-mail valide seront ignorés, et le dédoublonnage par e-mail s’appliquera au fichier.</span></div></div>` : '';
        return win.sheet(`${head('csv', 'Fichier pour Sarbacane', 'prêt pour l’import d’une liste de contacts')}${warn}
          <div class="crm-lbl" style="margin:14px 0 6px">Champs standard Sarbacane</div>
          <div class="rq-vars">${STD.map((c) => `<button type="button">${c}</button>`).join('')}</div>
          <div class="crm-lbl" style="margin:12px 0 6px">Champs personnalisés <span class="faint" style="text-transform:none;letter-spacing:0;font-weight:500">· à créer une fois dans la liste Sarbacane, puis à associer à l’import</span></div>
          <div class="rq-vars">${PERSO.map((c) => `<button type="button" data-tip="Variable de personnalisation dans le modèle d’e-mail">${c}</button>`).join('')}</div>
          <div class="crm-note" style="margin-top:6px">« civilite » vaut Madame ou Monsieur (un couple sort en Monsieur), vide pour une société : prévoir « Bonjour » par défaut dans le modèle. « date_fin_contrat » et « mois_restants » sont vides si la requête ne porte pas sur un financement.</div>
          <div class="crm-lbl" style="margin:14px 0 6px">Aperçu du fichier · séparateur « ; » · UTF-8</div>
          <div class="rq-code">${esc([[...STD, ...PERSO].join(';'), ...sample.map((l) => v(l).join(';'))].join('\n'))}</div>
          ${foot('csv', 'Télécharger pour Sarbacane')}`, { width: 720, onClose: (x) => { if (x === 'ok') log('csv', n); } });
      }
      if (k === 'sms') return smsSheet(L, n);
      if (k === 'phoning') return phoningSheet(L, n);
      if (k === 'courrier') return courrierSheet(L, n);
    }
    function excelSheet() {
      if (!S.xl) S.xl = PRESETS[S.q.canal === 'email' ? 'email' : S.q.canal].slice();
      const s = win.sheet(`${head('excel', 'Export Excel', 'choisissez et ordonnez les colonnes')}
        <div class="crm-lbl" style="margin:14px 0 6px">Préréglage</div>
        <div class="seg" data-pre style="max-width:100%;overflow-x:auto">${[['tous', 'Complet'], ['email', 'E-mailing'], ['sms', 'SMS'], ['phoning', 'Phoning'], ['courrier', 'Courrier']].map(([v, l]) => `<button data-v="${v}" aria-pressed="false">${l}</button>`).join('')}</div>
        <div class="row" style="justify-content:space-between;margin:14px 0 6px"><span class="crm-lbl">Colonnes · <span data-nc></span></span><span class="crm-note">Flèches = ordre dans le fichier</span></div>
        <div class="rq-cols" data-cols></div>
        <div class="crm-lbl" style="margin:14px 0 6px">Aperçu</div><div class="scroll" data-xprev></div>
        ${foot('excel', 'Télécharger le .xlsx')}`, { width: 720, onClose: (x) => { if (x === 'ok') log('excel', expN()); } });
      const el = s.el;
      const draw = () => {
        const on = S.xl, off = COLS.map((c) => c[0]).filter((k) => !on.includes(k));
        el.querySelector('[data-nc]').textContent = `${on.length} sur ${COLS.length}`;
        el.querySelector('[data-cols]').innerHTML = [...on.map((k, i) => `<div><input type="checkbox" class="check" data-ck="${k}" checked /><span class="grow">${esc(colOf(k)[1])}</span><span class="ord"><button class="icon-btn sm" data-mv="${k}|-1" ${i ? '' : 'disabled'} aria-label="Monter">${GX.icon('chevup', 'sm')}</button><button class="icon-btn sm" data-mv="${k}|1" ${i < on.length - 1 ? '' : 'disabled'} aria-label="Descendre">${GX.icon('chevdown', 'sm')}</button></span></div>`),
          ...off.map((k) => `<div class="off"><input type="checkbox" class="check" data-ck="${k}" /><span class="grow">${esc(colOf(k)[1])}</span></div>`)].join('');
        const P = expRows(3);
        el.querySelector('[data-xprev]').innerHTML = `<table class="tbl" style="font-size:12px"><thead><tr>${on.map((k) => `<th>${esc(colOf(k)[1])}</th>`).join('')}</tr></thead><tbody>${P.map((l) => `<tr>${on.map((k) => `<td style="white-space:nowrap">${esc(String(colOf(k)[2](l) ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      };
      el.addEventListener('change', (e) => { const c = e.target.closest('[data-ck]'); if (!c) return; const k = c.dataset.ck; S.xl = c.checked ? [...S.xl, k] : S.xl.filter((x) => x !== k); draw(); });
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-mv]'); if (!b) return; const [k, d] = b.dataset.mv.split('|'), i = S.xl.indexOf(k), j = i + +d; [S.xl[i], S.xl[j]] = [S.xl[j], S.xl[i]]; draw(); });
      el.querySelector('[data-pre]').addEventListener('change', (e) => { S.xl = PRESETS[e.detail].slice(); draw(); });
      draw();
    }
    const GSM = new Set('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà');
    const GSMX = new Set('^{}\\[~]|€');
    function smsLen(t) {
      const bad = [...new Set([...t].filter((ch) => !GSM.has(ch) && !GSMX.has(ch)))];
      if (bad.length) { const n = t.length; return { n, per: n <= 70 ? 70 : 67, parts: n <= 70 ? 1 : Math.ceil(n / 67), bad }; }
      const n = [...t].reduce((s, ch) => s + (GSMX.has(ch) ? 2 : 1), 0); return { n, per: n <= 160 ? 160 : 153, parts: n <= 160 ? 1 : Math.ceil(n / 153), bad };
    }
    function smsSheet(L, n) {
      const smp = L.find((l) => l.c._rq.port) || L[0];
      const fill = (t, l) => t.replace(/\{(\w+)\}/g, (m, k) => ({ civilite: CIVL[l.c.civ] || '', prenom: l.c.prenom || l.c.raison, nom: l.c.nom, modele: l.v.modele, date_fin: fe(l.s) ? dFR(fe(l.s).fin) : dFR(l.v.ctProchain), vendeur: l.c.vendeurRef, site: l.s.site }[k] ?? m));
      const longest = (k) => L.slice(0, 400).reduce((a, l) => { const v = fill(`{${k}}`, l); return v.length > a.length ? v : a; }, '');
      const T0 = `Bonjour {prenom}, le contrat de votre {modele} finit le {date_fin}. {vendeur} vous attend chez Bony {site}. STOP au 36XXX`;
      const codeHTML = (fmt) => esc(['numero;prenom;modele;date_fin;vendeur;site', ...L.filter((l) => l.c._rq.port).slice(0, 3).map((l) => [(fmt === 'plus' ? '+33' : '33') + l.c._rq.port.slice(1), l.c.prenom || l.c.raison, l.v.modele, fe(l.s) ? dFR(fe(l.s).fin) : '', l.c.vendeurRef, l.s.site].join(';'))].join('\n'));
      const s = win.sheet(`${head('sms', 'Fichier pour allmysms', 'numéros au format international, prêts pour l’import')}
        <div class="row wrap" style="gap:10px 16px;margin:14px 0 6px;align-items:flex-end">
          <div class="rq-fld"><span class="crm-lbl">Format du numéro</span><div class="seg" data-nf><button data-v="33" aria-pressed="true">33639981234</button><button data-v="plus" aria-pressed="false">+33639981234</button></div></div>
          <label class="rq-fld"><span class="crm-lbl">Expéditeur (11 car. max.)</span><input class="input" data-exp-from value="BONY AUTO" maxlength="11" style="width:170px;height:34px" /></label>
          <span class="crm-note" data-from-chk></span></div>
        <div class="crm-lbl" style="margin:12px 0 6px">Colonnes du fichier</div>
        <div class="rq-code" data-sms-code>${codeHTML('33')}</div>
        <div class="crm-lbl" style="margin:14px 0 6px">Message type</div>
        <div class="rq-vars" style="margin-bottom:6px">${['civilite', 'prenom', 'nom', 'modele', 'date_fin', 'vendeur', 'site'].map((k) => `<button type="button" data-var="${k}">{${k}}</button>`).join('')}</div>
        <textarea class="textarea" data-msg rows="4" style="width:100%">${esc(T0)}</textarea>
        <div class="rq-meter" data-meter style="margin-top:8px"></div>
        <div class="crm-lbl" style="margin:14px 0 6px">Aperçu sur le premier client</div><div class="rq-smsp" data-smsp></div>
        <div class="crm-note" style="margin-top:8px">160 caractères pour un SMS, puis des tranches de 153 au-delà. La mention de désinscription (STOP) est obligatoire. Les numéros suspects ou en double sont déjà retirés.</div>
        ${foot('sms', 'Télécharger pour allmysms')}`, { width: 660, onClose: (x) => { if (x === 'ok') log('sms', n); } });
      const el = s.el, ta = el.querySelector('[data-msg]'), from = el.querySelector('[data-exp-from]');
      el.querySelector('[data-nf]').addEventListener('change', (e) => { el.querySelector('[data-sms-code]').innerHTML = codeHTML(e.detail); });
      const chkFrom = () => { const v = from.value, ok = /^[A-Za-z0-9 ]{1,11}$/.test(v) && /[A-Za-z]/.test(v); el.querySelector('[data-from-chk]').innerHTML = ok ? `<span class="rq-ok">${GX.icon('check', 'sm')} ${v.length}/11</span>` : `<span style="color:var(--warn)">${GX.icon('alert', 'sm')} lettres et chiffres seulement, au moins une lettre, 11 au plus</span>`; };
      from.addEventListener('input', chkFrom); chkFrom();
      const upd = () => {
        const t = ta.value, worst = t.replace(/\{(\w+)\}/g, (m, k) => longest(k) || m), a = smsLen(fill(t, smp)), bad = [...new Set([...a.bad, ...smsLen(worst).bad])];
        let w = smsLen(worst); if (bad.length && !w.bad.length) w = { ...w, parts: w.n <= 70 ? 1 : Math.ceil(w.n / 67) };   // un seul « ç » dans une valeur suffit à passer en Unicode
        el.querySelector('[data-smsp]').textContent = fill(t, smp);
        el.querySelector('[data-meter]').innerHTML = `<span>Ce client : <b>${a.n}</b> caractères · <b>${a.parts}</b> SMS</span><span>Pire cas (variables les plus longues) : <b>${w.n}</b> · <b>${w.parts}</b> SMS</span><span>Volume : <b>≈ ${n0(n * w.parts)}</b> SMS facturés au plus</span>${bad.length ? `<span style="color:var(--warn)">${GX.icon('alert', 'sm')} « ${esc(bad.slice(0, 4).join(' '))} » (message ou valeur d’une variable) force l’encodage Unicode : 70 caractères par SMS au lieu de 160</span>` : `<span class="rq-ok">${GX.icon('check', 'sm')} Alphabet SMS standard (160 car.)</span>`}${/\bSTOP\b/.test(t) ? '' : `<span style="color:var(--danger)">${GX.icon('alert', 'sm')} Mention STOP absente : obligatoire</span>`}`;
      };
      ta.addEventListener('input', upd);
      el.querySelectorAll('[data-var]').forEach((b) => b.addEventListener('click', () => { const p = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, p) + `{${b.dataset.var}}` + ta.value.slice(ta.selectionEnd ?? p); ta.focus(); upd(); }));
      upd();
    }
    function phoningSheet(L, n) {
      const by = new Map(); L.forEach((l) => { const k = l.c.vendeurRef; if (!by.has(k)) by.set(k, []); by.get(k).push(l); });
      const groups = [...by.entries()].sort((a, b) => b[1].length - a[1].length), real = (ls) => Math.max(ls.length, sc(ls.length)), pages = groups.reduce((t, [, ls]) => t + Math.ceil(real(ls) / 12), 0);
      const today = dFR(TODAY), [rl, rf] = repere(S.q);
      const page = ([vend, ls], i) => `<div class="rq-paper"><div class="hd"><div><div style="font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#5c5866">Fichier de phoning · Bony</div><h4>${esc(vend)}</h4><div style="color:#5c5866;margin-top:2px">Site : ${esc(ls[0].s.site)} · ${n0(real(ls))} client${real(ls) > 1 ? 's' : ''} à appeler</div></div>
          <div class="m">Campagne : <b style="color:#1d1b22">${esc(S.q.name)}</b><br>Édité le ${today} par ${ME}<br>Page ${i ? Math.ceil(real(groups[0][1]) / 12) + 1 : 1} / ${pages}</div></div>
        <table><thead><tr><th>Client</th><th>Téléphone</th><th>Véhicule</th><th>${rl}</th><th>Dernier achat</th><th class="ck">Joint</th><th class="ck">Messa&shy;gerie</th><th class="ck">RDV</th><th class="ck">Pas intéressé</th></tr></thead>
        <tbody>${ls.slice(0, 10).map((l) => `<tr><td><b>${esc(H.fullName(l.c))}</b><br><span style="color:#5c5866">${esc(l.c.cp)} ${esc(l.c.ville)}</span></td><td style="white-space:nowrap">${tel(l.c._rq.port || l.c._rq.fixe || '')}</td><td>${esc(l.v.brand)} ${esc(l.v.modele)}<br><span style="color:#5c5866">${esc(l.v.immat)}</span></td><td style="white-space:nowrap">${rf(l)}</td><td style="white-space:nowrap">${dFR(l.c.last.date)}</td>${'<td class="ck"><span class="box"></span></td>'.repeat(4)}</tr>`).join('')}</tbody></table>
        ${real(ls) > Math.min(10, ls.length) ? `<div style="color:#8a8597;margin-top:6px">… ${n0(real(ls) - Math.min(10, ls.length))} autres clients de ${esc(vend)} sur les pages suivantes</div>` : ''}
        <div class="notes">Notes :</div><div class="ft"><span>Document interne — ne pas diffuser, à détruire après la campagne</span><span>${esc(vend)}</span></div></div>`;
      win.sheet(`${head('phoning', 'Fichier de phoning imprimable', `${groups.length} vendeurs · ${n0(pages)} pages, 12 clients par page`)}
        <div class="row wrap" style="gap:10px;margin:14px 0 10px"><div class="seg"><button aria-pressed="true">Une page par vendeur</button><button aria-pressed="false">Une page par site</button></div><label class="row" style="gap:8px;font-size:13px"><input type="checkbox" class="check" checked />Trier par ${rl.toLowerCase()}</label></div>
        <div class="rq-print">${groups.slice(0, 2).map(page).join('')}${groups.length > 2 ? `<div class="crm-note" style="text-align:center">… et les pages des ${groups.length - 2} autres vendeurs</div>` : ''}</div>
        ${foot('phoning', 'Imprimer / PDF')}`, { width: 900, onClose: (x) => { if (x === 'ok') log('phoning', n); } });
    }
    function courrierSheet(L, n) {
      const lab = (l) => `${l.c.soc ? `<b>${esc(l.c.raison)}</b>` : `<b>${esc(H.fullName(l.c))}</b>`}<br>${esc(l.c.num)} ${esc(l.c.typeRue)} ${esc(l.c.rue)}<br>${esc(l.c.cp)} ${esc(H.plain(l.c.ville))}`;
      const s = win.sheet(`${head('courrier', 'Courrier', 'étiquettes ou fichier de publipostage')}
        <div class="seg" data-cm style="margin:14px 0 10px"><button data-v="lab" aria-pressed="true">Planche d’étiquettes</button><button data-v="pub" aria-pressed="false">Publipostage (Word)</button></div>
        <div data-cv></div>
        ${S.q.canal !== 'courrier' ? `<div class="rq-warn" style="margin-top:10px"><div style="--c:var(--warn)">${GX.icon('alert', 'sm')}<span>Choisissez le canal « Courrier » pour retirer les adresses incomplètes et n’envoyer qu’un courrier par foyer.</span></div></div>` : ''}
        ${foot('courrier', 'Télécharger')}`, { width: 720, onClose: (x) => { if (x === 'ok') log('courrier', n); } });
      const el = s.el;
      const draw = (m) => { el.querySelector('[data-cv]').innerHTML = m === 'pub'
        ? `<div class="crm-note" style="margin-bottom:6px">Fichier à fusionner dans Word (Publipostage → Sélection des destinataires).</div><div class="rq-code">${esc(['civilite;nom;prenom;raison_sociale;adresse;code_postal;ville;modele;vendeur;site', ...L.slice(0, 4).map((l) => [CIVL[l.c.civ], l.c.soc ? '' : l.c.nom, l.c.prenom, l.c.raison, `${l.c.num} ${l.c.typeRue} ${l.c.rue}`, l.c.cp, H.plain(l.c.ville), l.v.modele, l.c.vendeurRef, l.s.site].join(';'))].join('\n'))}</div>`
        : `<div class="crm-note" style="margin-bottom:6px">Planche A4 de 24 étiquettes (3 × 8, 70 × 37 mm) · ${n0(Math.ceil(n / 24))} planches.</div><div class="rq-print" style="max-height:340px"><div class="rq-paper" style="min-width:0"><div class="rq-labels">${L.slice(0, 9).map((l) => `<div>${lab(l)}</div>`).join('')}</div></div></div>`; };
      el.querySelector('[data-cm]').addEventListener('change', (e) => draw(e.detail));
      draw('lab');
    }

    all();
    return { destroy() {} };
  }

  GX.crmReq = { build };
})();
