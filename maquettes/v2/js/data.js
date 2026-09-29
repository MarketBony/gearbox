/* =====================================================================
   GEARBOX OS — données FICTIVES, mais calquées sur les vrais référentiels
   (constants.ts / types.ts, relevés le 25/09/2026). Aucun nom, montant ou
   message réel. Les dates sont relatives à aujourd'hui pour rester vivantes.
   ===================================================================== */
(() => {
  let seed = 20260925;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const some = (a, n) => [...a].sort(() => rnd() - .5).slice(0, n);
  const int = (a, b) => Math.floor(a + rnd() * (b - a + 1));
  const T = GX.today();
  const day = (n) => GX.iso(GX.addDays(T, n));

  /* ---------------- Référentiels (miroir de constants.ts) ---------------- */
  const PLAQUES = {
    'PLAQUE CENTRE': ['Clermont', 'Ussel', 'Mozac', 'Massagettes'],
    'PLAQUE NORD': ['Vichy', 'Moulins', 'Thiers', 'Ambert', 'Ricoux'],
    'PLAQUE SUD': ['Issoire', 'Brioude', 'Mende', 'Le Puy-en-Velay'],
    'PLAQUE SUD-OUEST': ['Albi', 'Rodez', 'Millau', 'Aurillac', 'Figeac', 'Gaillac', 'Villefranche', 'Carmaux', 'Lavaur'],
  };
  const NISSAN_ONLY = ['Montluçon', 'Saint-Etienne'];
  const SITES = [...Object.values(PLAQUES).flat(), ...NISSAN_ONLY];
  const plaqueOf = (s) => Object.keys(PLAQUES).find((p) => PLAQUES[p].includes(s)) || 'SITES NISSAN';
  const ALPINE_SITES = ['Clermont', 'Le Puy-en-Velay', 'Vichy', 'Rodez'];
  const NISSAN_SITES = ['Clermont', 'Montluçon', 'Moulins', 'Le Puy-en-Velay', 'Saint-Etienne', 'Rodez', 'Albi', 'Aurillac'];
  const BRANDS = [
    { id: 'Renault', c: 'var(--brand-renault)', hex: '#ffcc33' }, { id: 'Dacia', c: 'var(--brand-dacia)', hex: '#6a7551' },
    { id: 'Alpine', c: 'var(--brand-alpine)', hex: '#0055a4' }, { id: 'Nissan', c: 'var(--brand-nissan)', hex: '#c3002f' },
    { id: 'Mobilize', c: 'var(--brand-mobilize)', hex: '#7b3fe4' }, { id: 'Holding', c: 'var(--brand-holding)', hex: '#64748b', label: 'GROUPE BONY' },
  ];
  const SERVICES = ['VN', 'VO', 'APV', 'PR'];
  const SERVICE_COLOR = { VN: '#293f74', VO: '#f75632', APV: '#8f12ab', PR: '#22c3d6', 'Tous Services': '#8a8599', RH: '#34c77b' };
  const PROJECT_TYPES = ['Partenariat', 'Expo/Salon', 'Animation Co', 'OP Clients', 'Contenu', 'Collaborateurs'];
  const CHANNELS = ['SMS', 'E-mail', 'GMB', 'Radio', 'Print', 'Affichage', 'Presse', 'Street Market', 'PLV', 'Traiteur', 'Audiovisuel', 'Mobilier', 'Lieu'];
  const PROJECT_STATUS = { Draft: { l: 'Brouillon', c: 'var(--text-3)' }, Active: { l: 'Actif', c: 'var(--ok)' }, Done: { l: 'Terminé', c: 'var(--info)' }, Archived: { l: 'Archivé', c: 'var(--text-3)' } };
  const TASK_STATUS = { Empty: { l: 'Vierge', c: 'var(--text-3)', w: 0 }, Todo: { l: 'À faire', c: 'var(--info)', w: 0 }, InProgress: { l: 'En cours', c: 'var(--warn)', w: .5 }, Programmed: { l: 'Programmé', c: 'var(--bony-violet)', w: 1 }, Done: { l: 'Terminé', c: 'var(--ok)', w: 1 } };
  const SOCIAL_STATUS = [
    { id: 'À venir', c: '#64748b' }, { id: 'Constructeur', c: '#22c3d6' }, { id: 'En attente', c: '#f59e0b' }, { id: 'Non Validé', c: '#ef4444' },
    { id: 'Rédigé', c: '#3b82f6' }, { id: 'Validé', c: '#10b981' }, { id: 'Programmé', c: '#8f12ab' }, { id: 'Publié', c: '#22c55e', solid: true }, { id: 'Abandonné', c: '#1f1d24', strike: true },
  ];
  const NETWORKS = [
    { id: 'Instagram', icon: 'instagram', c: '#e1306c' }, { id: 'Story Instagram', icon: 'instagram', c: '#f77737' }, { id: 'Facebook', icon: 'facebook', c: '#1877f2' },
    { id: 'Story Facebook', icon: 'facebook', c: '#4f9cf9' }, { id: 'LinkedIn', icon: 'linkedin', c: '#0a66c2' }, { id: 'GMB', icon: 'gmb', c: '#34a853' },
    { id: 'TikTok', icon: 'tiktok', c: '#ff0050' }, { id: 'YouTube', icon: 'youtube', c: '#ff0000' },
  ];
  const CO2 = ['CLIO - B120', 'CLIO E-TECH - A102', 'R5 - A0', 'MÉGANE E-TECH - A0', 'CAPTUR - B127', 'AUSTRAL - A105', 'RAFALE - A105', 'SCÉNIC E-TECH - A0', 'SANDERO - B118', 'DUSTER - B126', 'JOGGER - B124', 'SPRING - A0', 'BIGSTER - B128', 'QASHQAI - B124', 'JUKE - B127', 'X-TRAIL - A118', 'A290 - A0', 'A110 - E153'];
  const LOM = ['Pour les trajets courts, privilégiez la marche ou le vélo #SeDéplacerMoinsPolluer', 'Pensez à covoiturer #SeDéplacerMoinsPolluer', 'Au quotidien, prenez les transports en commun #SeDéplacerMoinsPolluer', 'Non nécessaire'];
  const DIGITAL_CONCESSIONS = ['GROUPE BONY', 'FULL RENAULT', 'FULL DACIA', 'FULL NISSAN', 'FULL ALPINE', ...SITES.filter((s) => s !== 'Ricoux'), 'Yssingeaux'];
  const LEAVE_TYPES = [
    { id: 'CP', l: 'Congé payé', s: 'CP', c: '#3b82f6' }, { id: 'RTT', l: 'RTT', s: 'RTT', c: '#8b5cf6' }, { id: 'HR', l: 'Heures de récup', s: 'HR', c: '#f59e0b' },
    { id: 'CSS', l: 'Congé sans solde', s: 'SS', c: '#64748b' }, { id: 'CR', l: 'Congé révision', s: 'CR', c: '#10b981' },
  ];
  const ROLES = {
    Master: { l: 'Master' }, Administrator: { l: 'Administrateur' }, Director: { l: 'Directeur' }, Coordinator: { l: 'Coordinateur' },
    'Digital Manager': { l: 'Digital Manager' }, Guest: { l: 'Invité' }, External: { l: 'Externe' }, 'Site Manager': { l: 'Chef de site' },
  };
  /* Rubriques visibles par rôle (miroir de constants.ts / Sidebar.tsx) */
  const STD = ['hello', 'dashboard', 'projects', 'todo', 'digital', 'chat', 'campaigns', 'material', 'agenda', 'budget', 'fixed', 'archives', 'settings', 'conges'];
  const ACCESS = {
    Master: [...STD, 'games', 'export'], Administrator: [...STD, 'games', 'export'], Director: [...STD, 'export'],
    // Congés : lecture ouverte à CONGES_LECTURE_ROLES (Master, Administrator, Director, Coordinator, Digital Manager, Guest)
    Coordinator: [...STD, 'games', 'export'], 'Digital Manager': [...STD, 'games'],
    Guest: STD, External: ['digital', 'chat', 'hello', 'settings'],
    'Site Manager': ['dashboard', 'projects', 'digital', 'hello', 'budget', 'agenda', 'settings'],
  };

  /* ---------------- Équipe (inventée) ---------------- */
  const PALETTE = ['#f75632', '#8f12ab', '#293f74', '#e11d74', '#0ea5a4', '#d97706', '#4f46e5', '#16a34a', '#db2777', '#0284c7', '#7c3aed', '#b45309'];
  const USERS = [
    ['me', 'Théo L.', 'Master', 'Clermont-Ferrand'], ['u1', 'Camille Roux', 'Administrator', 'Clermont-Ferrand'], ['u2', 'Hugo Martin', 'Coordinator', 'Vichy'],
    ['u3', 'Léa Bernard', 'Digital Manager', 'Clermont-Ferrand'], ['u4', 'Tom Durand', 'Coordinator', 'Rodez'], ['u5', 'Inès Garcia', 'Director', 'Clermont-Ferrand'],
    ['u6', 'Lucas Petit', 'Guest', 'Issoire'], ['u7', 'Manon Leroy', 'Digital Manager', 'Clermont-Ferrand'], ['u8', 'Nathan Moreau', 'Site Manager', 'Le Puy-en-Velay'],
    ['u9', 'Sarah Fontaine', 'Coordinator', 'Albi'], ['u10', 'Julien Lambert', 'External', 'Lyon'], ['u11', 'Chloé Mercier', 'Administrator', 'Clermont-Ferrand'],
  ].map(([id, name, role, city], i) => ({
    id, name, role, city, color: PALETTE[i % PALETTE.length], initials: name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
    birthdate: `19${int(80, 99)}-${String(((i * 5) % 12) + 1).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
    sites: role === 'Site Manager' ? ['Le Puy-en-Velay'] : [], online: rnd() > .4,
  }));
  USERS[3].birthdate = `1994-${String(T.getMonth() + 1).padStart(2, '0')}-${String(T.getDate() + 2 > 28 ? 28 : T.getDate() + 2).padStart(2, '0')}`;
  const user = (id) => USERS.find((u) => u.id === id) || USERS[0];

  /* ---------------- Projets + tâches ---------------- */
  const PROVIDERS = ['Imprimerie Arverne', 'Radio Volcans FM', 'Sono Pro 63', 'Agence Pixel', 'Traiteur Maison Blanc', 'Affichage Dôme', 'Mailflow', 'SMS Express', 'Studio Volcans', 'Mobilier Expo'];
  const NAMES = [
    ['Portes ouvertes R5 E-Tech', 'OP Clients', ['Clermont'], ['Renault'], ['VN']], ['Salon de l’auto de Rodez', 'Expo/Salon', ['Rodez'], ['Renault', 'Alpine'], ['VN']],
    ['Campagne APV Hiver', 'OP Clients', ['Clermont', 'Vichy', 'Issoire', 'Le Puy-en-Velay'], ['Renault', 'Dacia'], ['APV']], ['Soirée clients Alpine A290', 'Animation Co', ['Vichy'], ['Alpine'], ['VN']],
    ['Essais Dacia Bigster', 'Animation Co', ['Le Puy-en-Velay'], ['Dacia'], ['VN']], ['Qashqai — campagne digitale', 'Contenu', ['Montluçon', 'Saint-Etienne'], ['Nissan'], ['VN']],
    ['Week-end reprise VO', 'OP Clients', ['Moulins'], ['Renault', 'Dacia'], ['VO']], ['Signalétique atelier', 'Partenariat', ['Thiers'], ['Renault'], ['APV']],
    ['Lancement Mobilize Duo', 'Contenu', ['Clermont'], ['Mobilize'], ['VN']], ['Foire de Mende', 'Expo/Salon', ['Mende'], ['Renault', 'Dacia'], ['VN', 'VO']],
    ['Partenariat ASM Clermont', 'Partenariat', ['Clermont', 'Mozac'], ['Renault'], ['PR']], ['Journée collaborateurs', 'Collaborateurs', ['Clermont'], ['Holding'], ['Tous Services']],
    ['Jeu concours Clio', 'OP Clients', ['Albi', 'Gaillac', 'Lavaur'], ['Renault'], ['VN']], ['Salon Habitat Aurillac', 'Expo/Salon', ['Aurillac'], ['Renault', 'Nissan'], ['VN']],
    ['Opé pneus hiver', 'OP Clients', ['Brioude', 'Issoire'], ['Renault', 'Dacia'], ['APV']], ['Tournage vidéo Austral', 'Contenu', ['Clermont'], ['Renault'], ['VN']],
    ['Street marketing Millau', 'Animation Co', ['Millau'], ['Dacia'], ['VN', 'VO']], ['Présentation Rafale', 'Animation Co', ['Figeac', 'Villefranche'], ['Renault'], ['VN']],
    ['Campagne Black Friday VO', 'OP Clients', ['Clermont', 'Vichy', 'Moulins', 'Rodez', 'Albi'], ['Renault', 'Dacia', 'Nissan'], ['VO']], ['Fête de fin d’année', 'Collaborateurs', ['Clermont'], ['Holding'], ['Tous Services']],
    ['Rallye des Volcans', 'Partenariat', ['Clermont', 'Issoire'], ['Alpine', 'Renault'], ['PR']], ['Salon VO Saint-Etienne', 'Expo/Salon', ['Saint-Etienne'], ['Nissan'], ['VO']],
    ['Opé carrosserie printemps', 'OP Clients', ['Carmaux', 'Albi'], ['Renault'], ['APV']], ['Portes ouvertes Duster', 'OP Clients', ['Ussel', 'Massagettes'], ['Dacia'], ['VN']],
  ];
  const TASKNAMES = { SMS: 'SMS d’invitation', 'E-mail': 'Emailing J-7', GMB: 'Post Google Business', Radio: 'Spots radio', Print: 'Flyers A5', Affichage: 'Affichage 4×3', Presse: 'Encart presse', 'Street Market': 'Équipe street', PLV: 'Kakémonos', Traiteur: 'Cocktail', Audiovisuel: 'Captation vidéo', Mobilier: 'Location mange-debout', Lieu: 'Réservation salle' };
  const PROJECTS = NAMES.map(([name, type, sites, brands, services], i) => {
    const start = int(-70, 60), len = int(1, 25);
    const status = i === 8 || i === 23 ? 'Draft' : start + len < -12 ? (i % 3 ? 'Done' : 'Archived') : 'Active';
    const nTasks = int(3, 7), team = ['me', ...some(['u1', 'u2', 'u3', 'u4', 'u7', 'u9', 'u11'], int(1, 3))];
    const tasks = Array.from({ length: nTasks }, (_, k) => {
      const ch = pick(CHANNELS), dl = start + int(-15, len);
      const st = status === 'Done' || status === 'Archived' ? 'Done' : dl < 0 ? pick(['Done', 'Done', 'InProgress', 'Todo']) : pick(['Todo', 'InProgress', 'Programmed', 'Empty', 'Done']);
      const t = { id: `t${i}_${k}`, name: TASKNAMES[ch] + (k > 3 ? ' (relance)' : ''), provider: pick(PROVIDERS), channel: ch, status: st, assignee: pick(team),
        cost: ch === 'Lieu' || ch === 'Traiteur' ? int(20, 90) * 100 : int(6, 120) * 50, deadline: day(dl), startDate: day(dl - int(2, 12)), notes: k === 0 ? 'Valider le BAT avant vendredi.' : '' };
      if (ch === 'SMS' || ch === 'E-mail') Object.assign(t, { volume: int(8, 60) * 100, openRate: ch === 'SMS' ? int(88, 98) : int(18, 42), npai: int(1, 6), stop: int(0, 3), clickRate: int(2, 14), codTxt: 'BONY' + int(10, 99), billed: Math.round(t.cost * .9) });
      return t;
    });
    const p = { id: 'p' + (i + 1), name, type, sites, brands, services, status, startDate: day(start), endDate: day(start + len), tasks, team,
      budgetPlanned: Math.round(tasks.reduce((s, t) => s + t.cost, 0) * (0.85 + rnd() * .4) / 100) * 100,
      description: `${type} — ${sites.join(', ')}. Objectif : générer du trafic et des leads qualifiés.`, proPlus: i % 7 === 3, expertMode: i === 1 || i === 2,
      alpineShare: brands.includes('Alpine') && brands.some((b) => ['Renault', 'Dacia', 'Mobilize'].includes(b)) ? 70 : null,
      nissanShare: brands.includes('Nissan') && brands.some((b) => ['Renault', 'Dacia', 'Mobilize'].includes(b)) ? 50 : null,
      files: i === 1 ? [{ n: 'Plan du stand.pdf', s: '2,4 Mo' }, { n: 'Devis traiteur.pdf', s: '310 Ko' }, { n: 'Visuel 4x3.jpg', s: '5,8 Mo' }] : [] };
    p.distribution = sites.length > 1 ? Object.fromEntries(sites.map((s) => [s, Math.round(100 / sites.length)])) : null;
    return p;
  });
  const projectActual = (p) => p.tasks.reduce((s, t) => s + (t.cost || 0), 0);
  const projectProgress = (p) => (p.tasks.length ? Math.round((p.tasks.reduce((s, t) => s + TASK_STATUS[t.status].w, 0) / p.tasks.length) * 100) : 0);
  const projectLate = (p) => p.status === 'Active' && new Date(p.endDate) < T && projectProgress(p) < 100;

  /* ---------------- Publications Digital ---------------- */
  const POST_TITLES = ['Nouvelle R5 : réservez votre essai', 'Portes ouvertes ce week-end', 'Offre pneus hiver', 'Coulisses de l’atelier', 'Bienvenue à notre nouveau conseiller', 'Le Bigster arrive !', 'Jeu concours : gagnez un week-end', 'Nos VO certifiés', 'Alpine A290 en démonstration', 'Recrutement : technicien APV', 'Salon de Rodez : J-5', 'Entretien : on s’occupe de tout', 'Nissan Qashqai e-Power', 'Soirée clients : merci !', 'Black Friday VO', 'Trophée des collaborateurs'];
  const POSTS = Array.from({ length: 44 }, (_, i) => {
    const d = int(-24, 30), past = d < 0;
    const status = past ? pick(['Publié', 'Publié', 'Publié', 'Abandonné', 'Programmé']) : pick(['À venir', 'Constructeur', 'En attente', 'Non Validé', 'Rédigé', 'Validé', 'Programmé', 'Programmé']);
    let brands = some(['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize', 'Holding'], int(1, 2)); if (brands.includes('Holding')) brands = ['Holding']; // tag exclusif
    return {
      id: 'sp' + i, title: pick(POST_TITLES), date: day(d), status, service: pick(['VN', 'VO', 'APV', 'PR', 'Tous Services', 'RH']), brands,
      concessions: some(DIGITAL_CONCESSIONS, int(1, 4)), networks: some(NETWORKS.map((n) => n.id), int(1, 4)), targets: rnd() > .8 ? ['Internet', 'Collaborateurs'] : ['Internet'],
      lom: rnd() > .5 ? pick(LOM) : null, co2s: brands.includes('Holding') ? [] : some(CO2, int(0, 2)), proPlus: rnd() > .85,
      link: rnd() > .5 ? 'https://www.bony-automobiles.fr/offres' : '', wording: 'Profitez de conditions exceptionnelles dans votre concession. Essais sur rendez-vous, reprise de votre véhicule au meilleur prix. #Bony #Auvergne',
      media: int(0, 4), comments: rnd() > .6 ? [{ u: pick(['u3', 'u7', 'u1']), t: 'Visuel validé par la concession 👍', d: day(d - 1) }] : [], archived: past && rnd() > .75,
    };
  });

  /* ---------------- Dépenses ---------------- */
  const EXP_COMMENTS = ['Abonnement plateforme SMS', 'Hébergement site web', 'Licence Canva équipe', 'Goodies salon', 'Photographe portraits', 'Abonnement Meta Ads', 'Impression cartes de visite', 'Adhésion club entreprises', 'Location stockage PLV', 'Veille presse'];
  const EXPENSES = Array.from({ length: 22 }, (_, i) => ({
    id: 'e' + i, date: day(int(-240, 60)), sites: rnd() > .7 ? ['GROUPE BONY'] : [pick(SITES)], service: pick(['VN', 'VO', 'APV', 'PR', 'Tous Services']),
    brands: [pick(['Renault', 'Renault', 'Dacia', 'Holding', 'Nissan'])], comment: pick(EXP_COMMENTS), amount: int(3, 90) * 50, annual: rnd() > .8, proPlus: rnd() > .9,
  }));

  /* ---------------- Budget : lignes par concession + entités spécifiques ---------------- */
  const BUDGET_SITES = SITES.filter((s) => !['Thiers', 'Ambert'].includes(s)); // alias budgétaires → Ricoux
  const BUDGET_LINES = [
    ...BUDGET_SITES.map((s) => ({ id: s, plaque: plaqueOf(s), brands: NISSAN_ONLY.includes(s) ? ['Nissan'] : ['Renault', 'Dacia'], planned: Object.fromEntries(SERVICES.map((sv) => [sv, Array.from({ length: 12 }, () => int(1, 9) * 100)])) })),
    ...['Clermont', 'Vichy', 'Le Puy', 'Rodez'].map((s) => ({ id: 'Alpine-' + s, plaque: 'ENTITÉS SPÉCIFIQUES', brands: ['Alpine'], planned: Object.fromEntries(SERVICES.map((sv) => [sv, Array.from({ length: 12 }, () => (sv === 'VN' ? int(3, 12) * 100 : int(0, 2) * 100))])) })),
    { id: 'Nissan', plaque: 'ENTITÉS SPÉCIFIQUES', brands: ['Nissan'], planned: Object.fromEntries(SERVICES.map((sv) => [sv, Array.from({ length: 12 }, () => int(4, 16) * 100)])) },
  ];
  /* Routage simplifié, pour la maquette seulement. Dans Gearbox, c'est
     resolveBudgetLine() / splitShareToBuckets() de constants.ts, et nulle part ailleurs. */
  const ALIAS = { Thiers: 'Ricoux', Ambert: 'Ricoux', Riom: 'Mozac' };
  function routeItem({ sites, brands, amount, distribution, alpineShare, nissanShare }) {
    if (brands.includes('Holding')) return [];
    const out = []; const rdm = brands.some((b) => ['Renault', 'Dacia', 'Mobilize'].includes(b));
    for (const s of sites) {
      const part = amount * ((distribution?.[s] ?? 100 / sites.length) / 100); const site = ALIAS[s] || s;
      if (brands.includes('Alpine') && ALPINE_SITES.includes(s)) { const a = rdm ? (alpineShare ?? 100) / 100 : 1; out.push(['Alpine-' + (s === 'Le Puy-en-Velay' ? 'Le Puy' : s), part * a]); if (a < 1) out.push([site, part * (1 - a)]); }
      // Nissan est GLOBAL : un élément tagué Nissan sur un site Nissan va à l'enveloppe unique « Nissan »
      // (curseur lu seulement si une marque RDM est présente) ; sans le tag, la part reste sur son site.
      else if (brands.includes('Nissan') && NISSAN_SITES.includes(s)) { const n = rdm ? (nissanShare ?? 100) / 100 : 1; out.push(['Nissan', part * n]); if (n < 1) out.push([site, part * (1 - n)]); }
      else out.push([site, part]);
    }
    return out;
  }

  /* ---------------- Matériel ---------------- */
  const EQUIPMENT = [
    ['eq1', 'Tente pliante 3×3', 'Mobilier', 4], ['eq2', 'Kakémono Renault', 'PLV', 6], ['eq3', 'Kakémono Dacia', 'PLV', 4], ['eq4', 'Écran 55" sur pied', 'Audiovisuel', 2],
    ['eq5', 'Sono portable', 'Son', 2], ['eq6', 'Arche gonflable', 'PLV', 1], ['eq7', 'Mange-debout', 'Mobilier', 10], ['eq8', 'Photobooth', 'Animation', 1],
    ['eq9', 'Drapeaux plume', 'PLV', 12], ['eq10', 'Machine à café pro', 'Autre', 1],
  ].map(([id, name, cat, qty]) => ({ id, name, cat, qty }));
  const BOOKINGS = Array.from({ length: 16 }, (_, i) => {
    const eq = pick(EQUIPMENT), s = int(-10, 40);
    return { id: 'b' + i, eq: eq.id, qty: Math.max(1, int(1, Math.ceil(eq.qty / 2))), start: day(s), end: day(s + int(0, 4)), site: pick(SITES), service: pick(SERVICES), note: pick(['Portes ouvertes', 'Salon', 'Animation parking', 'Tournage', 'Soirée clients']), by: pick(['u1', 'u2', 'u4', 'u9', 'me']) };
  });

  /* ---------------- Congés : période juin → mai ---------------- */
  const periodStart = new Date(T.getMonth() >= 5 ? T.getFullYear() : T.getFullYear() - 1, 5, 1);
  const CONGES_MEMBERS = ['me', 'u1', 'u2', 'u3', 'u4', 'u5', 'u7', 'u9', 'u11'];
  const CONGES = [];
  CONGES_MEMBERS.forEach((u) => {
    for (let k = 0; k < int(4, 7); k++) {
      const s = int(-100, 180), len = int(1, 6), type = pick(['CP', 'CP', 'CP', 'RTT', 'HR', 'CSS', 'CR']);
      for (let d = 0; d < len; d++) {
        const dt = GX.addDays(T, s + d); if ([0, 6].includes(dt.getDay())) continue;
        CONGES.push({ u, date: GX.iso(dt), type, demi: len === 1 && rnd() > .6 ? pick(['matin', 'apres-midi']) : null, ok: s + d < 14 || rnd() > .35 });
      }
    }
  });
  const CONGES_DROITS = Object.fromEntries(CONGES_MEMBERS.map((u) => [u, 25]));

  /* ---------------- Chat ---------------- */
  const now = Date.now(), min = 6e4;
  const CONVS = [
    { id: 'c0', kind: 'general', name: 'Chat Général', members: USERS.filter((u) => u.role !== 'External').map((u) => u.id), unread: 2 },
    { id: 'c1', kind: 'group', name: 'Salon de Rodez', members: ['me', 'u2', 'u4', 'u9'], unread: 3, theme: 'Synthwave', admins: ['me'] },
    { id: 'c2', kind: 'group', name: 'Team Digital', members: ['me', 'u3', 'u7', 'u10'], unread: 0, theme: 'Lagon', admins: ['u3'], pinned: true },
    { id: 'c3', kind: 'dm', name: 'Camille Roux', members: ['me', 'u1'], unread: 0 },
    { id: 'c4', kind: 'dm', name: 'Léa Bernard', members: ['me', 'u3'], unread: 1 },
    { id: 'c5', kind: 'dm', name: 'Inès Garcia', members: ['me', 'u5'], unread: 0, muted: true },
  ];
  const MSGS = {
    c0: [[`u5`, 'Bonjour à tous ! Point marketing jeudi 9h30 en salle Puy de Dôme ☕', 180], ['u2', 'Je serai en visio depuis Vichy', 170, { r: { '👍': ['u1', 'u3'] } }], ['u11', 'Qui a les clés de la réserve PLV ?', 40], ['u4', 'Moi, je les dépose à l’accueil ce midi', 36, { r: { '❤️': ['u11'] } }]],
    c1: [['u4', 'Le plan du stand est validé par l’organisateur', 300, { type: 'file', file: 'Plan du stand.pdf · 2,4 Mo' }], ['u2', 'Top ! On part sur 3 véhicules + l’A290 ?', 280], ['me', 'Oui, et on garde un emplacement pour le photobooth', 270, { r: { '👍': ['u2', 'u4', 'u9'] } }],
      ['u9', 'J’ai réservé les mange-debout dans Matériel', 90, { type: 'project', project: 'p2' }], ['u4', 'Photos du montage 👇', 20, { type: 'image' }], ['u2', 'Ça a de la gueule 🔥', 12]],
    c2: [['u3', 'Les visuels de la R5 sont dans le Digital', 600], ['u7', 'Je programme les posts pour lundi', 560], ['u10', 'BAT vidéo envoyé 🎬', 120, { type: 'voice', dur: '0:24' }]],
    c3: [['u1', 'Tu peux valider la dépense goodies ?', 1500], ['me', 'C’est fait 👌', 1480]],
    c4: [['u3', 'Le client a demandé une story en plus pour samedi', 25]],
    c5: [['u5', 'Merci pour le bilan du trimestre', 3000]],
  };
  const MESSAGES = Object.fromEntries(Object.entries(MSGS).map(([c, arr]) => [c, arr.map(([u, t, ago, x = {}], i) => ({ id: c + 'm' + i, u, t, at: now - ago * min, type: x.type || 'text', ...x, r: x.r || {} }))]));

  /* ---------------- Jeux ---------------- */
  const GAMES = {
    challenges: [{ from: 'u2', game: 'Puissance 4', at: now - 25 * min }, { from: 'u7', game: 'Morpion', at: now - 90 * min }],
    running: [{ vs: 'u4', game: 'Bataille navale', state: 'À VOUS' }, { vs: 'u3', game: 'Morpion', state: 'ATTENTE' }],
    board: [['u3', 14, 9, 4, 1], ['me', 12, 8, 3, 1], ['u2', 11, 6, 4, 1], ['u7', 9, 4, 5, 0], ['u4', 7, 3, 3, 1], ['u11', 5, 2, 3, 0]],
  };

  /* ---------------- Fil d'actualité ---------------- */
  const FEED = [
    ['u2', 'a créé le projet', 'Foire de Mende', 'projects', 8], ['u3', 'a programmé la publication', 'Nouvelle R5 : réservez votre essai', 'digital', 22],
    ['u9', 'a créé une réservation matériel', 'Mange-debout ×6', 'material', 47], ['u1', 'a ajouté une dépense', 'Licence Canva équipe', 'fixed', 95],
    ['u4', 'a terminé la tâche', 'Kakémonos — Salon de Rodez', 'projects', 180], ['u7', 'a commenté', 'Jeu concours : gagnez un week-end', 'digital', 260],
    ['u11', 'a ajouté le matériel', 'Photobooth', 'material', 1440], ['u5', 'a validé les congés de', 'Hugo Martin', 'conges', 2000],
  ].map(([u, a, o, app, ago], i) => ({ id: 'f' + i, u, a, o, app, at: now - ago * min, unread: i < 3 }));

  /* ---------------- Hello Marketing ---------------- */
  const HELLO = {
    weather: { city: 'Clermont-Ferrand', t: 17, feels: 16, desc: 'Éclaircies', icon: 'cloudsun' },
    forecast: [['sam', 'sun', 21, 11], ['dim', 'cloudsun', 19, 10], ['lun', 'cloud', 15, 9], ['mar', 'cloud', 14, 8], ['mer', 'sun', 18, 9]],
    track: { title: 'Moteur', artist: 'Les Volcans Électriques', cover: ['#f75632', '#293f74'] },
    croissants: 'u7',
    rss: {
      'Actu Auto': ['Le marché de l’occasion repart à la hausse en septembre', 'Électrique : les bornes rapides se multiplient sur les autoroutes', 'Essai : le nouveau SUV compact passe au crible', 'Les ventes de citadines électriques progressent', 'Hybride ou électrique : que choisir en 2026 ?', 'Le salon de Paris dévoile ses premières dates'],
      'Marketing & Tech': ['Réseaux sociaux : la vidéo courte reste reine', 'IA générative : cinq usages concrets pour les équipes marketing', 'Emailing : les taux d’ouverture remontent', 'Retail : le retour des événements en magasin', 'Google Business Profile : les nouveautés à connaître', 'Mesurer le ROI d’un salon professionnel'],
    },
  };

  GX.data = {
    PLAQUES, SITES, NISSAN_ONLY, ALPINE_SITES, NISSAN_SITES, plaqueOf, BRANDS, SERVICES, SERVICE_COLOR, PROJECT_TYPES, CHANNELS, PROJECT_STATUS, TASK_STATUS,
    SOCIAL_STATUS, NETWORKS, CO2, LOM, DIGITAL_CONCESSIONS, LEAVE_TYPES, ROLES, ACCESS, USERS, user, PROJECTS, projectActual, projectProgress, projectLate,
    POSTS, EXPENSES, BUDGET_LINES, routeItem, EQUIPMENT, BOOKINGS, CONGES, CONGES_MEMBERS, CONGES_DROITS, periodStart, CONVS, MESSAGES, GAMES, FEED, HELLO, PROVIDERS,
    brand: (id) => BRANDS.find((b) => b.id === id), socialStatus: (id) => SOCIAL_STATUS.find((s) => s.id === id) || SOCIAL_STATUS[0], network: (id) => NETWORKS.find((n) => n.id === id),
    leave: (id) => LEAVE_TYPES.find((l) => l.id === id), project: (id) => PROJECTS.find((p) => p.id === id),
  };

  /* Petits rendus partagés, pour que toutes les apps disent la même chose de la même façon */
  GX.r = {
    av: (uid, cls = '') => { const u = user(uid); return `<span class="av ${cls}" style="--c:${u.color}" data-tip="${GX.esc(u.name)}">${u.initials}</span>`; },
    brandDots: (brands) => brands.map((b) => `<i class="brand-dot" style="--c:${GX.data.brand(b)?.hex}" data-tip="${b}"></i>`).join(''),
    /* Étiquettes de marque PLEINES comme dans Gearbox (lisibilité) : texte foncé sur Renault */
    brandChips: (brands) => brands.map((b) => `<span class="badge brand" style="--c:${GX.data.brand(b)?.hex};${b === 'Renault' ? 'color:#1b1604' : ''}">${b}</span>`).join(' '),
    pStatus: (s) => `<span class="badge" style="--c:${PROJECT_STATUS[s].c}"><i class="dot"></i>${PROJECT_STATUS[s].l}</span>`,
    tStatus: (s) => `<span class="badge" style="--c:${TASK_STATUS[s].c}">${TASK_STATUS[s].l}</span>`,
    sStatus: (id) => { const s = GX.data.socialStatus(id); return `<span class="badge ${s.solid ? 'solid' : ''}" style="--c:${s.c};${s.strike ? 'text-decoration:line-through;--c:var(--text-3)' : ''}">${id}</span>`; },
    service: (s) => `<span class="badge svc" style="--c:${SERVICE_COLOR[s] === '#293f74' ? '#5b7fd6' : SERVICE_COLOR[s] || '#8a8599'}">${s}</span>`,
    proPlus: () => `<span class="badge solid" style="--c:var(--bony-violet)">PRO+</span>`,
    net: (id, s = 'sm') => { const n = GX.data.network(id); return n ? `<span style="color:${n.c}" data-tip="${n.id}">${GX.icon(n.icon, s)}</span>` : ''; },
  };
})();
