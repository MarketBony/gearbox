/* =====================================================================
   Rubrique « SPARK » (le CRM de Bony ; « RCU » = nom technique, jamais affiché) — MAQUETTE statique
   Cadrage : RCU-CADRAGE.md · modèle : backend/rcu-migrations/001_socle.sql
   Contrat de rubrique : maquettes/v2/APPS.md (mêmes primitives, même coque).

   Écrans
   - Accueil : chiffres, état du dernier import par source (VN, VO ; BSO = import unique), raccourcis.
   - Clients : recherche universelle (nom, téléphone, e-mail, plaque, VIN) + filtres, liste paginée
     CÔTÉ SERVEUR, fiche client (Véhicules, Ventes, Financements et garanties, Coordonnées, Sources,
     Échanges et Relances en « bientôt »).
   - À arbitrer : file des doublons proposés (même nom + prénom + CP sans autre élément commun).
   - Requêteur : listes de relance construites en phrases (requeteur.js, branché ici par GX.crmReq).
   - Imports (Master seulement) : journal import_run et rapport détaillé.

   Accès : rôles de Jeux (GAMES_ROLES) — Master, Administrator, Coordinator, Digital Manager.
   Director et chef de site exclus (cadrage § 1). Imports : Master.

   Données : 100 % FICTIVES, générées ici (graine fixe). Téléphones dans les plages réservées à la
   fiction par l'ARCEP (06 39 98 …, 04 65 71 …), e-mails en @example.com (RFC 2606). Aucun nom réel.
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt;

  /* ---------------- Accès (sans toucher data.js : on complète la table en mémoire) ---------------- */
  const CRM_ROLES = ['Master', 'Administrator', 'Coordinator', 'Digital Manager'];
  CRM_ROLES.forEach((r) => { const a = D.ACCESS[r]; if (a && !a.includes('crm')) a.push('crm'); });
  const canImports = () => GX.ctx.role === 'Master';

  /* ---------------- Outils ---------------- */
  const T = GX.today(), TODAY = GX.iso(T);
  const rng = (seed) => { let s = (Math.imul(seed + 1, 2654435761) >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  const pk = (r, a) => a[Math.floor(r() * a.length)];
  const wpk = (r, o) => { const e = Object.entries(o).filter(([, w]) => w > 0), t = e.reduce((s, [, w]) => s + w, 0); let x = r() * t; for (const [k, w] of e) if ((x -= w) < 0) return k; return e[0][0]; };
  const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const pad = (n, l) => String(n).padStart(l, '0');
  const addM = (iso, m) => { const d = new Date(iso); d.setMonth(d.getMonth() + m); return GX.iso(d); };
  const addY = (iso, y) => addM(iso, y * 12);
  const mDiff = (a, b) => (new Date(b) - new Date(a)) / (864e5 * 30.44);
  const dFR = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '—');
  const mY = (iso) => new Date(iso).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }).replace('.', '');
  const cap = (s) => s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const slug = (s) => plain(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const tel = (n) => n.replace(/(\d{2})(?=\d)/g, '$1 ');
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = GX.esc;
  const plural = (n, s, p = s + 's') => `${F.n(n)} ${n > 1 ? p : s}`;

  /* ---------------- Référentiels fictifs (sites réels de constants.ts) ---------------- */
  const GEO = {
    Clermont: [['Clermont-Ferrand', '63000'], ['Chamalières', '63400'], ['Aubière', '63170'], ['Cournon-d’Auvergne', '63800'], ['Beaumont', '63110'], ['Pont-du-Château', '63430']],
    Mozac: [['Riom', '63200'], ['Mozac', '63200'], ['Châtel-Guyon', '63140'], ['Volvic', '63530']],
    Massagettes: [['Saint-Genès-Champanelle', '63122'], ['Aydat', '63970'], ['Rochefort-Montagne', '63210']],
    Ussel: [['Ussel', '19200'], ['Meymac', '19250']],
    Vichy: [['Vichy', '03200'], ['Cusset', '03300'], ['Bellerive-sur-Allier', '03700']],
    Moulins: [['Moulins', '03000'], ['Yzeure', '03400'], ['Avermes', '03000']],
    Thiers: [['Thiers', '63300'], ['Peschadoires', '63920']], Ambert: [['Ambert', '63600']],
    Issoire: [['Issoire', '63500'], ['Brassac-les-Mines', '63570']], Brioude: [['Brioude', '43100'], ['Langeac', '43300']],
    Mende: [['Mende', '48000'], ['Marvejols', '48100']], 'Le Puy-en-Velay': [['Le Puy-en-Velay', '43000'], ['Espaly-Saint-Marcel', '43000'], ['Yssingeaux', '43200']],
    Albi: [['Albi', '81000'], ['Saint-Juéry', '81160']], Rodez: [['Rodez', '12000'], ['Onet-le-Château', '12850'], ['Luc-la-Primaube', '12450']],
    Millau: [['Millau', '12100']], Aurillac: [['Aurillac', '15000'], ['Arpajon-sur-Cère', '15130']], Figeac: [['Figeac', '46100']],
    Gaillac: [['Gaillac', '81600']], Villefranche: [['Villefranche-de-Rouergue', '12200']], Carmaux: [['Carmaux', '81400'], ['Blaye-les-Mines', '81400']],
    Lavaur: [['Lavaur', '81500']], Montluçon: [['Montluçon', '03100'], ['Domérat', '03410']], 'Saint-Etienne': [['Saint-Étienne', '42000'], ['Saint-Chamond', '42400']],
  };
  const SITE_W = { Clermont: 18, Mozac: 5, Massagettes: 1.5, Ussel: 2, Vichy: 7, Moulins: 5, Thiers: 2.5, Ambert: 1, Issoire: 5, Brioude: 2.5, Mende: 2.5, 'Le Puy-en-Velay': 6.5, Albi: 6, Rodez: 7.5, Millau: 2, Aurillac: 6, Figeac: 2.5, Gaillac: 3.5, Villefranche: 1.6, Carmaux: 1.6, Lavaur: .6, Montluçon: 2, 'Saint-Etienne': 1.5 };
  const SO = D.PLAQUES['PLAQUE SUD-OUEST'];
  const SOC = (site, brand) => brand === 'Nissan' ? (SO.includes(site) ? 'BSO' : 'REP_AUTO') : SO.includes(site) ? 'BSO' : ({ Vichy: 'SODAVI', Moulins: 'GGPL', Thiers: 'RICOUX', Ambert: 'RICOUX', Issoire: 'AVA', Brioude: 'AVA', Mende: 'GGV', 'Le Puy-en-Velay': 'GGV', Montluçon: 'REP_AUTO', 'Saint-Etienne': 'REP_AUTO' }[site] || 'EAA');
  const AFF = { Clermont: 'VNVOCL', Mozac: 'VNVOVOL', Massagettes: 'VNVOMA', Ussel: 'VNVOUS', Vichy: 'VNVOVI', Moulins: 'VNVOMO', Thiers: 'VNVOTH', Ambert: 'VNVOTH', Issoire: 'VNVOISS', Brioude: 'VNVOAVABRI', Mende: 'VNVOMEN', 'Le Puy-en-Velay': 'VNVOPUY', Albi: 'VNVORALBI', Rodez: 'VNVORRODEZ', Millau: 'VNVORMILLAU', Aurillac: 'VNVORAURIL', Figeac: 'VNVORFIG', Gaillac: 'VNVORGAILLAC', Villefranche: 'VNVORVIL', Carmaux: 'VNVORCARM', Lavaur: 'VNVORLAVR', Montluçon: 'VNVOMONNIS', 'Saint-Etienne': 'VNVOCLERNIS' };
  const AFF_ALP = { Clermont: 'VNVOCLAPL', Vichy: 'VNVOVIALP', 'Le Puy-en-Velay': 'VNVOPUYALP', Rodez: 'VNVOALPRDZ' };
  const AFF_NIS = { Clermont: 'VNVOCLERNIS', Vichy: 'VNVOCUSNIS', Moulins: 'VNVOMOUNIS', Montluçon: 'VNVOMONNIS', 'Le Puy-en-Velay': 'VNVOCLERNIS', 'Saint-Etienne': 'VNVOCLERNIS', Rodez: 'VNVONISRDZ', Albi: 'VNVONISALB', Aurillac: 'VNVONISAUR' };
  const LIB = { Clermont: 'CLERM', Mozac: 'MOZAC', Massagettes: 'Massagette', Ussel: 'USSEL', Vichy: 'VICHY', Moulins: 'AVERMES', Thiers: 'THIER', Ambert: 'AMBER', Issoire: 'ISSOI', Brioude: 'BRIOUDE', Mende: 'MENDE', 'Le Puy-en-Velay': 'LE PUY', Albi: 'ALBI', Rodez: 'RODEZ', Millau: 'MILLAU', Aurillac: 'AURILLAC', Figeac: 'FIGEAC', Gaillac: 'GAILLAC', Villefranche: 'VILLEFRANC', Carmaux: 'CARMAUX', Lavaur: 'LAVAUR', Montluçon: 'MONTLUCON', 'Saint-Etienne': 'STETIENNE' };
  const BSO_CPT = { Rodez: 'VNVORO_FDC', Albi: 'VNVOALBI_FDC', Aurillac: 'VNVOAU_FDC', Gaillac: 'VNVOGA_FDC', Lavaur: 'VNVOGA_FDC', Millau: 'VNVO_FDC', Villefranche: 'VNVOVI_FDC', Figeac: 'FIVNVO_FDC', Carmaux: 'VNVOCX_FDC' };

  const NOMS = ['MARTIN', 'BERNARD', 'DUBOIS', 'THOMAS', 'ROBERT', 'RICHARD', 'PETIT', 'DURAND', 'LEROY', 'MOREAU', 'SIMON', 'LAURENT', 'LEFEBVRE', 'MICHEL', 'GARCIA', 'DAVID', 'BERTRAND', 'ROUX', 'VINCENT', 'FOURNIER', 'GIRARD', 'ANDRÉ', 'MERCIER', 'DUPONT', 'LAMBERT', 'BONNET', 'FRANÇOIS', 'CHABRIER', 'VIALLE', 'COUDERT', 'FAYOLLE', 'ROCHE', 'BOYER', 'BARRIER', 'PERRET', 'MAZET', 'ASTIER', 'CHAMBON', 'BRUNEL', 'TEYSSIER', 'DELMAS', 'ALBARET', 'BOUSQUET', 'VIDAL', 'FABRE', 'CAYLA', 'SOULIÉ', 'VERDIER', 'MALLET', 'CHASSAING', 'MONTEIL', 'FAURE', 'COUSTEIX', 'TIXIER', 'BESSE', 'VERNET', 'GRANIER', 'ROUQUETTE', 'ESTIVAL', 'PAGÈS', 'MOULIN', 'BARTHÉLÉMY', 'COMBES', 'GAILLARD', 'RAYNAL', 'LACOMBE'];
  const PH = ['Jean', 'Pierre', 'Michel', 'Alain', 'Philippe', 'Christophe', 'Laurent', 'Nicolas', 'Julien', 'Thomas', 'Kévin', 'Romain', 'Hugo', 'Lucas', 'Maxime', 'Sébastien', 'Guillaume', 'Bernard', 'Gérard', 'Patrick', 'Didier', 'Florian', 'Mathieu', 'Olivier'];
  const PF = ['Marie', 'Nathalie', 'Isabelle', 'Sylvie', 'Catherine', 'Sandrine', 'Céline', 'Aurélie', 'Julie', 'Camille', 'Laura', 'Emma', 'Chloé', 'Manon', 'Sophie', 'Monique', 'Françoise', 'Christine', 'Valérie', 'Élodie', 'Martine', 'Pauline', 'Léa', 'Anne'];
  const ACTIV = ['Transports', 'Menuiserie', 'Plomberie', 'Boulangerie', 'Électricité', 'Paysages', 'Maçonnerie', 'Ambulances', 'Taxi', 'Couverture', 'Charpente', 'Primeurs', 'Fromagerie', 'Vitrerie'];
  const RUES = [['rue', 'des Volcans'], ['avenue', 'Jean Jaurès'], ['rue', 'de la République'], ['chemin', 'des Écoles'], ['impasse', 'du Stade'], ['rue', 'Pasteur'], ['allée', 'des Tilleuls'], ['boulevard', 'Victor Hugo'], ['avenue', 'de la Gare'], ['chemin', 'du Moulin'], ['route', 'des Vignes'], ['rue', 'du Lac'], ['place', 'du Marché'], ['rue', 'des Acacias'], ['route', 'de Lyon'], ['rue', 'du Pont']];
  const VEND_P = ['Julien', 'Sophie', 'Karim', 'Nicolas', 'Audrey', 'Romain', 'Cédric', 'Laetitia', 'Yann', 'Stéphane', 'Mélanie', 'Bruno', 'Thierry', 'Delphine'];
  const VEND_N = ['Morel', 'Barret', 'Charrier', 'Delorme', 'Pradier', 'Rigal', 'Joubert', 'Malet', 'Sabatier', 'Vergne', 'Couderc', 'Lafon', 'Bouchet', 'Gerbaud'];
  const VENDEURS = Object.fromEntries(Object.keys(GEO).map((s, i) => { const r = rng(900 + i); return [s, [0, 1, 2, 3].map(() => `${pk(r, VEND_P)} ${pk(r, VEND_N)}`)]; }));
  const R2 = ['Garage Tixier', 'Garage du Lac', 'Auto Sancy', 'Garage Central', 'Garage de la Gare', 'Garage Brunel', 'Garage des Monts', 'Auto Service Vialle'];

  const BRAND_W = (site) => ({ Renault: 58, Dacia: 30, Alpine: D.ALPINE_SITES.includes(site) ? 3 : 0, Nissan: (D.NISSAN_SITES.includes(site) || site === 'Vichy') ? (D.NISSAN_ONLY.includes(site) ? 400 : 8) : 0, Mobilize: 1.2 });
  const MODELS = {
    Renault: [['Clio V', 'Essence', 21500], ['Clio E-Tech', 'Hybride', 25900], ['Captur', 'Essence', 26400], ['Captur E-Tech', 'Hybride', 31200], ['Austral E-Tech', 'Hybride', 41500], ['Arkana', 'Hybride', 34900], ['Mégane E-Tech', 'Électrique', 39800], ['Scénic E-Tech', 'Électrique', 43900], ['R5 E-Tech', 'Électrique', 32900], ['Symbioz', 'Hybride', 33500], ['Rafale', 'Hybride', 48900], ['Kangoo Van', 'Diesel', 27300], ['Trafic Fourgon', 'Diesel', 36800], ['Twingo', 'Essence', 14900], ['Zoé', 'Électrique', 32500], ['Kadjar', 'Diesel', 27900]],
    Dacia: [['Sandero Stepway', 'Essence', 17900], ['Sandero', 'GPL', 14900], ['Duster', 'Diesel', 22900], ['Duster', 'Hybride', 27400], ['Jogger', 'GPL', 21300], ['Spring', 'Électrique', 16900], ['Bigster', 'Hybride', 29900]],
    Alpine: [['A110 GTS', 'Essence', 82900], ['A290', 'Électrique', 38700], ['A110', 'Essence', 62900]],
    Nissan: [['Qashqai', 'Hybride', 35900], ['Juke', 'Essence', 24900], ['X-Trail e-Power', 'Hybride', 45900], ['Micra', 'Essence', 18900], ['Ariya', 'Électrique', 47900]],
    Mobilize: [['Duo', 'Électrique', 11900]],
  };
  const LAUNCH = { 'Clio E-Tech': 2020, 'Captur E-Tech': 2020, 'Austral E-Tech': 2022, Arkana: 2021, 'Mégane E-Tech': 2022, 'Scénic E-Tech': 2024, 'R5 E-Tech': 2024, Symbioz: 2024, Rafale: 2024, 'Clio V': 2019, Captur: 2013, Kadjar: 2015, Zoé: 2013, Jogger: 2022, Spring: 2021, Bigster: 2025, 'Sandero Stepway': 2009, 'A110 GTS': 2022, A290: 2024, A110: 2017, 'X-Trail e-Power': 2022, Ariya: 2022, Juke: 2010, Qashqai: 2007, Duo: 2024 };   // pas de modèle avant sa sortie
  const VERSIONS = { Renault: ['Evolution', 'Techno', 'Esprit Alpine', 'Iconic', 'Équilibre'], Dacia: ['Essential', 'Expression', 'Journey', 'Extreme'], Alpine: ['GTS', 'Première Édition', 'Atelier'], Nissan: ['Acenta', 'N-Connecta', 'Tekna'], Mobilize: ['Duo 80'] };
  const WMI = { Renault: 'VF1', Dacia: 'UU1', Alpine: 'VFA', Nissan: 'SJN', Mobilize: 'VF1' };
  const LET = 'ABCDEFGHJKLMNPQRSTVWXYZ', VINCH = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  const immat = (r) => `${pk(r, LET)}${pk(r, LET)}-${pad(int(r, 1, 999), 3)}-${pk(r, LET)}${pk(r, LET)}`;
  const vin = (r, b) => WMI[b] + Array.from({ length: 14 }, () => pk(r, VINCH)).join('');

  const FAM_C = { LOA: '#3b82f6', LLD: '#8b5cf6', 'Crédit': '#10b981', 'Crédit ballon': '#14b8a6', 'Crédit-bail': '#f59e0b', 'Comptant': '#94a3b8' };
  const PROD = { LOA: ['LOA - NEW DEAL 2', 'LOA - NEW DEAL 1', 'ND2', 'DLA'], LLD: ['LLD - NEW DEAL 3', '08', 'NLO'], 'Crédit': ['CREDIT CLASSIQUE', 'CLA', '02'], 'Crédit ballon': ['CREDIT BALLON (VO)'], 'Crédit-bail': ['CREDIT BAIL', 'CBA'] };
  const A_CONF = ['DLA', 'NLA', 'DLO', 'NLO', '06', '22', 'CPT', '03', '25', '24'];
  const VH_C = { VN: '#5b7fd6', VO: '#f75632', BSO: '#8a8599' };
  const VH_L = { VN: 'VN', VO: 'VO', BSO: 'Ancienne base' };
  const AV_C = ['#f75632', '#8f12ab', '#293f74', '#e11d74', '#0ea5a4', '#d97706', '#4f46e5', '#16a34a', '#0284c7', '#7c3aed'];
  const CIV = { H: { l: 'Homme', a: 'M.' }, F: { l: 'Femme', a: 'Mme' }, C: { l: 'Couple', a: 'M. et Mme' }, S: { l: 'Société', a: '' } };
  const RULES = ['Même nom + prénom + portable', 'Même nom + prénom + CP + voie', 'Même nom + prénom + e-mail', 'BSO ↔ DCS : même VIN + même nom'];

  /* ---------------- Génération du « serveur » fictif ----------------
     4 000 fiches complètes servent d'échantillon ; les compteurs sont extrapolés à 180 427 (volume réel annoncé par Théo). */
  const TOTAL = 180427, POOL = 4000, SCALE = TOTAL / POOL;
  function genClient(i) {
    const r = rng(i * 7 + 3);
    const soc = r() < .12, couple = !soc && r() < .1, fem = !soc && !couple && r() < .48;
    const site = wpk(r, SITE_W), [ville, cp] = pk(r, GEO[site]);
    const nom = pk(r, NOMS), prenom = soc ? '' : pk(r, fem ? PF : PH);
    const civ = soc ? 'S' : couple ? 'C' : fem ? 'F' : 'H';
    const forme = pk(r, ['SARL', 'SAS', 'EURL', 'SASU']);
    const civRaw = { S: pk(r, [forme, 'Société', 'Etablissement']), C: pk(r, ['Mr & Mme', 'MR ME', 'M. et Mme', 'Monsieur et Madame']), F: pk(r, ['Mme', 'MME', 'Madame', 'Mlle']), H: pk(r, ['M.', 'MR', 'Monsieur', 'Mr']) }[civ];
    const raison = soc ? `${forme} ${pk(r, ACTIV)} ${cap(nom)}` : '';
    const [typeRue, rue] = pk(r, RUES), num = String(int(r, 1, 128));
    const c = { id: 'SPK-' + pad(100217 + i * 23, 7), i, soc, civ, civRaw, nom, prenom, raison, num, typeRue, rue, cp, ville, site, sales: [], vehicles: [], ids: [], contacts: [], nplc: null, vendeurRef: null, vendeurRefBy: null };

    // Ventes, de la plus ancienne à la plus récente
    const so = SO.includes(site);
    const nS = soc ? int(r, 1, 5) : 1 + Math.floor(r() * r() * 4.4);
    let d = new Date(so ? int(r, 2006, 2025) : int(r, 2017, 2026), int(r, 0, 11), int(r, 1, 28));
    if (d > T) d = GX.addDays(T, -int(r, 20, 400));
    let prevVeh = null;
    for (let k = 0; k < nS && d <= T; k++) {
      const date = GX.iso(d), bso = so && date < '2025-10-01';
      let typeVH = r() < .55 ? 'VN' : 'VO';
      if (!bso && typeVH === 'VN' && date < '2020-01-01') typeVH = 'VO';
      const brand = wpk(r, BRAND_W(site)), mec = typeVH === 'VN' ? date : addM(date, -int(r, 10, 84));
      const okM = MODELS[brand].filter((m) => (LAUNCH[m[0]] || 2000) <= +mec.slice(0, 4)), [modele, energie, prix] = pk(r, okM.length ? okM : MODELS[brand]);
      const v = { id: c.id + '-V' + k, vin: vin(r, brand), immat: immat(r), brand, modele, version: pk(r, VERSIONS[brand]), energie, mec, reprisLe: null, saleIdx: k };
      const ageY = mDiff(mec, TODAY) / 12;
      v.ctProchain = ageY < 4 ? addY(mec, 4) : (() => { let x = addY(mec, 4); while (x < addM(TODAY, -2)) x = addY(x, 2); return x; })();
      const sameSoc = SOC(site, brand);
      const aff = brand === 'Alpine' ? AFF_ALP[site] : brand === 'Nissan' ? AFF_NIS[site] : AFF[site];
      const s = {
        id: c.id + '-S' + k, source: bso ? 'BSO' : typeVH, typeVH: bso && r() < .05 ? 'AUTRE' : typeVH, date, commande: GX.iso(GX.addDays(d, -int(r, 12, 75))), site, brand,
        affaire: bso ? null : aff, societe: bso ? 'BSO' : sameSoc, libelle: bso ? null : LIB[site], compte: bso ? `${brand === 'Nissan' ? 'VNVONISLP_FDC' : BSO_CPT[site] || 'VNVORO_FDC'}_021025` : null,
        dossier: bso ? null : pad(int(r, 10000, 99999), 6), vendeurs: [pk(r, VENDEURS[site])], intermediaire: typeVH === 'VN' && r() < .08 ? pk(r, R2) : null,
        typeVente: soc ? 'VENTE A SOCIETE' : 'VENTE A PARTICU', tarif: Math.round((typeVH === 'VN' ? prix : prix * Math.max(.35, 1 - mDiff(mec, date) / 120)) / 10) * 10,
        reprise: null, fin: null, garantie: null, absente: null, veh: v,
      };
      if (r() < .05) s.vendeurs.push(pk(r, VENDEURS[site]));
      if (prevVeh && !prevVeh.reprisLe && r() < .5) { prevVeh.reprisLe = date; s.reprise = { montant: Math.round(int(r, 3, 19) * 500), veh: prevVeh }; }
      if (r() < (typeVH === 'VN' ? .55 : .35)) {
        const famille = wpk(r, { LOA: typeVH === 'VN' ? 5 : 2.4, LLD: typeVH === 'VN' ? 1.6 : 0, 'Crédit': 2.5, 'Crédit-bail': soc ? 2 : .15, 'Crédit ballon': typeVH === 'VO' ? 1.2 : 0 });
        const organisme = famille === 'LOA' || famille === 'LLD' ? (r() < .88 ? 'DIAC' : 'Autre banque') : r() < .45 ? 'DIAC' : 'Autre banque';
        const duree = famille === 'LLD' ? pk(r, [36, 48]) : pk(r, [24, 36, 37, 48, 49, 60]);
        const produit = pk(r, PROD[famille]);
        s.fin = { organisme, famille, produit, aConfirmer: A_CONF.includes(produit), debut: date, fin: addM(date, duree), duree, calculee: typeVH === 'VO' };
      } else if (r() < .3) s.fin = { organisme: 'Aucun', famille: 'Comptant', produit: 'AUCUN', debut: null, fin: null, duree: null };
      s.garantie = typeVH === 'VN' ? (r() < .25 ? { code: 'EXT5', libelle: 'Extension de garantie 5 ans', km: 100000, mois: 60 } : { code: 'GC2', libelle: 'Garantie constructeur', km: null, mois: brand === 'Dacia' ? 36 : 24 })
        : { code: r() < .6 ? 'VO12' : 'VO24', libelle: 'Garantie VO', km: null, mois: r() < .6 ? 12 : 24 };
      if (r() < .015 && !bso) s.absente = GX.iso(GX.addDays(T, -int(r, 1, 20)));
      c.sales.push(s); c.vehicles.push(v); prevVeh = v;
      d = new Date(d.getFullYear() + int(r, 2, 5), int(r, 0, 11), int(r, 1, 28));
    }
    // Identités sources : (source, société) → un numéro DCS
    const byKey = new Map();
    c.sales.forEach((s) => { const key = s.source + '|' + s.societe; if (!byKey.has(key)) byKey.set(key, []); byKey.get(key).push(s); });
    [...byKey.entries()].forEach(([key, ss], j) => {
      const [source, societe] = key.split('|'), last = ss[ss.length - 1];
      c.ids.push({ id: c.id + '-I' + j, source, societe, numero: source === 'BSO' ? 'F' + pad(int(r, 100000, 999999), 7) : source === 'VN' ? pad(int(r, 100000, 499999), 6) : pad(int(r, 10000, 99999), 5),
        nomDCS: soc ? plain(raison) : `${plain(nom)} ${plain(prenom)}`, civRaw, ventes: ss.length, derniere: last.date, premierRun: source === 'BSO' ? 287 : int(r, 120, 400),
        rule: j === 0 ? null : r() < .12 ? 'Arbitrage manuel — Théo L., 03/10/2026' : pk(r, source === 'BSO' ? [RULES[3], RULES[0]] : RULES.slice(0, 3)), separee: false });
    });
    // Coordonnées (portable / fixe / e-mail), chacune avec sa source et son état
    const firstId = c.ids[c.ids.length - 1] || c.ids[0], idLbl = (x) => x ? `${x.source === 'BSO' ? 'Ancienne base' : x.source} · ${x.societe} · ${x.numero}` : '—';
    const port = '063998' + pad(int(r, 0, 9999), 4);
    const st = r();
    c.contacts.push({ id: c.id + '-K0', type: 'Portable', val: port, etat: st < .05 ? 'suspect' : st < .065 ? 'refuse' : 'valide', motif: st < .05 ? `Partagé par ${int(r, 4, 9)} identités de noms différents` : st < .065 ? `Refusé par le client — saisi par ${pk(r, ['Hugo Martin', 'Léa Bernard', 'Tom Durand'])} le ${dFR(GX.addDays(T, -int(r, 10, 300)))}` : '', src: idLbl(firstId), vu: firstId?.derniere });
    if (c.ids.length > 1 && r() < .45) c.contacts.push({ id: c.id + '-K1', type: 'Portable', val: '063998' + pad(int(r, 0, 9999), 4), etat: 'valide', motif: 'Ancien numéro (vu sur une identité plus ancienne)', src: idLbl(c.ids[0]), vu: c.ids[0].derniere });
    if (r() < .35) c.contacts.push({ id: c.id + '-K2', type: 'Fixe', val: '046571' + pad(int(r, 0, 9999), 4), etat: 'valide', motif: '', src: idLbl(c.ids[0]), vu: c.ids[0].derniere });
    if (r() < .68) {
      const bony = r() < .04;
      c.contacts.push({ id: c.id + '-K3', type: 'E-mail', val: bony ? `atelier.${slug(site)}@bonyautomobiles.com` : soc ? `contact.${slug(nom)}@example.com` : `${slug(prenom)}.${slug(nom)}${r() < .3 ? int(r, 1, 99) : ''}@example.com`, etat: bony ? 'suspect' : 'valide', motif: bony ? 'Domaine Bony : adresse de la concession, pas du client' : '', src: idLbl(firstId), vu: firstId?.derniere });
    }
    if (r() < .006) c.contacts[0] = { ...c.contacts[0], val: '0600000000', etat: 'suspect', motif: 'Numéro bidon (chiffres répétés)' };
    // Synthèse (ce qui est indexé côté serveur)
    c.last = c.sales[c.sales.length - 1];
    c.cur = c.vehicles.filter((v) => !v.reprisLe);
    c.curFin = c.sales.filter((s) => s.fin?.fin && s.fin.fin >= TODAY).sort((a, b) => a.fin.fin.localeCompare(b.fin.fin))[0] || null;
    c.lastFin = c.sales.filter((s) => s.fin?.fin).sort((a, b) => b.fin.fin.localeCompare(a.fin.fin))[0] || null;
    c.suspect = c.contacts.some((k) => k.etat === 'suspect');
    c.vendeurRef = c.last.vendeurs[0];
    c.since = c.sales[0].date.slice(0, 4);
    c.brands = [...new Set(c.vehicles.map((v) => v.brand))];
    if (r() < .015) c.nplc = { by: 'Hugo Martin', date: dFR(GX.addDays(T, -int(r, 5, 200))), motif: 'Demande du client par téléphone' };
    return c;
  }
  const CLIENTS = Array.from({ length: POOL }, (_, i) => genClient(i));
  const byId = new Map(CLIENTS.map((c) => [c.id, c]));
  const nameOf = (c) => c.soc ? c.raison : `${c.nom} ${c.prenom}`;
  const fullName = (c) => c.soc ? c.raison : `${CIV[c.civ].a} ${c.nom} ${c.prenom}`;
  const initials = (c) => c.soc ? c.raison.split(' ').slice(1, 3).map((w) => w[0]).join('').toUpperCase() : (c.prenom[0] + c.nom[0]).toUpperCase();
  const avC = (c) => AV_C[c.i % AV_C.length];
  const finLeft = (s) => mDiff(TODAY, s.fin.fin);

  /* Pont vers le Requêteur (requeteur.js) : il lit le MÊME échantillon fictif, pour que ses compteurs collent aux autres onglets. */
  GX.crmData = { CLIENTS, byId, TOTAL, SCALE, POOL, VENDEURS, SITE_W, GEO, FAM_C, VH_C, VH_L, CIV, R2, MODELS, TODAY,
    h: { nameOf, fullName, tel, dFR, mY, addM, addY, mDiff, rng, int, pk, pad, plain, slug, cap, plural } };

  /* ---------------- « Serveur » : recherche, filtres, tri, pagination ----------------
     ⚠ Rien de tout cela ne tournera dans le navigateur. En vrai : GET /api/crm/clients?q=…&sites=…&page=…
     → { total, rows[50] }. Les ~90 000 fiches et ~110 000 ventes ne sont JAMAIS chargées côté client :
     Postgres fait la recherche (index trigramme sur le nom normalisé, index sur plaque, VIN, portable
     normalisé 0XXXXXXXXX et e-mail en minuscules), les filtres (vente.site, vente.fin_fin…), le tri et
     la pagination. Le navigateur ne reçoit que la page affichée. */
  const PAGE = 50;
  function detect(q) {
    const t = q.trim(), compact = t.replace(/[\s.-]/g, '');
    if (!t) return null;
    if (t.includes('@')) return { k: 'mail', l: 'adresse e-mail', v: t.toLowerCase() };
    if (/^[A-Za-z]{2}-?\d{3}-?[A-Za-z]{2}$/.test(t.replace(/\s/g, ''))) return { k: 'immat', l: 'immatriculation', v: t.toUpperCase().replace(/\s/g, '').replace(/^(\w{2})-?(\d{3})-?(\w{2})$/, '$1-$2-$3') };
    if (/^\d{6,10}$/.test(compact)) return { k: 'tel', l: 'téléphone', v: compact.replace(/^\+?33/, '0') };
    if (/^[A-HJ-NPR-Z0-9]{8,17}$/i.test(compact) && /\d/.test(compact) && /[a-z]/i.test(compact)) return { k: 'vin', l: compact.length === 17 ? 'VIN' : 'VIN (partiel)', v: compact.toUpperCase() };
    return { k: 'nom', l: 'nom, raison sociale ou ville', v: plain(t) };
  }
  function matchQ(c, d) {
    if (!d) return true;
    switch (d.k) {
      case 'mail': return c.contacts.some((k) => k.type === 'E-mail' && k.val.includes(d.v));
      case 'immat': return c.vehicles.some((v) => v.immat === d.v);
      case 'tel': return c.contacts.some((k) => k.type !== 'E-mail' && k.val.includes(d.v));
      case 'vin': return c.vehicles.some((v) => v.vin.includes(d.v));
      default: return plain(`${c.nom} ${c.prenom} ${c.raison} ${c.ville}`).includes(d.v);
    }
  }
  function query(f, page) {
    const d = detect(f.q);
    const L = CLIENTS.filter((c) => {
      if (!matchQ(c, d)) return false;
      if (f.sites.length && !c.sales.some((s) => f.sites.includes(s.site))) return false;
      if (f.brands.length && !c.brands.some((b) => f.brands.includes(b))) return false;
      if (f.kind !== 'all' && (f.kind === 'soc') !== c.soc) return false;
      if (f.vh !== 'all' && !c.sales.some((s) => s.source === f.vh)) return false;
      if (f.fam.length && !c.sales.some((s) => s.fin && f.fam.includes(s.fin.famille))) return false;
      if (f.ech !== 'all') {
        if (f.ech === 'past') { if (c.curFin || !c.lastFin || mDiff(c.lastFin.fin.fin, TODAY) > 12) return false; }
        else if (!c.curFin || finLeft(c.curFin) > +f.ech) return false;
      }
      if (f.suspect && !c.suspect) return false;
      if (f.nplc && !c.nplc) return false;
      return true;
    });
    const s = { recent: (a, b) => b.last.date.localeCompare(a.last.date), nom: (a, b) => nameOf(a).localeCompare(nameOf(b), 'fr'), fin: (a, b) => (a.curFin?.fin.fin || '9').localeCompare(b.curFin?.fin.fin || '9') }[f.sort];
    L.sort(s);
    const unfiltered = !d && !nFilters(f);
    const total = unfiltered ? TOTAL : d ? L.length : Math.round(L.length * SCALE);
    const pages = Math.max(1, Math.ceil(total / PAGE)), p = Math.min(page, pages - 1);
    const rows = L.length ? Array.from({ length: Math.min(PAGE, total - p * PAGE) }, (_, k) => L[(p * PAGE + k) % L.length]) : [];
    return { total, rows, page: p, pages, d };
  }
  const nFilters = (f) => f.sites.length + f.brands.length + f.fam.length + (f.kind !== 'all') + (f.vh !== 'all') + (f.ech !== 'all') + !!f.suspect + !!f.nplc;

  /* ---------------- File d'arbitrage (paires proposées, pas appliquées) ---------------- */
  const ARB_TOTAL0 = 1799;
  const PAIRS = Array.from({ length: 16 }, (_, i) => {
    const r = rng(5000 + i), site = wpk(r, SITE_W), [ville, cp] = pk(r, GEO[site]), fem = r() < .5;
    const nom = pk(r, NOMS), prenom = pk(r, fem ? PF : PH), kind = pk(r, ['rien', 'rien', 'rien', 'suspect', 'voie']);
    const side = (src, j) => {
      const brand = wpk(r, BRAND_W(site)), [mo] = pk(r, MODELS[brand]), [tr, ru] = pk(r, RUES);
      const date = GX.iso(GX.addDays(T, -int(r, 30, 2400)));
      return { source: src, societe: SOC(site, brand), numero: src === 'VN' ? pad(int(r, 100000, 499999), 6) : src === 'VO' ? pad(int(r, 10000, 99999), 5) : 'F' + pad(int(r, 100000, 999999), 7),
        civRaw: fem ? pk(r, ['Mme', 'MME', 'Madame']) : pk(r, ['M.', 'MR', 'Monsieur']), nom, prenom, num: String(int(r, 1, 90)), typeRue: tr, rue: ru, cp, ville,
        portable: '063998' + pad(int(r, 0, 9999), 4), portSuspect: false, email: r() < .6 ? `${slug(prenom)}.${slug(nom)}${int(r, 1, 99)}@example.com` : '',
        veh: `${brand} ${mo} · ${immat(r)}`, brand, date, vendeur: pk(r, VENDEURS[site]), site, j };
    };
    const srcs = pk(r, [['VN', 'VO'], ['VO', 'VN'], ['VN', 'VN'], ['BSO', 'VO'], ['VO', 'VO']]);
    const a = side(srcs[0], 0), b = side(srcs[1], 1);
    if (srcs[0] === 'BSO') a.societe = 'BSO';
    if (kind === 'suspect') { b.portable = a.portable; a.portSuspect = b.portSuspect = true; }
    if (kind === 'voie') { b.typeRue = a.typeRue; b.rue = a.rue; }
    const why = kind === 'suspect' ? 'Même nom, prénom et code postal. Même portable, mais il est SUSPECT (partagé par 6 identités) : il ne compte pas pour rapprocher.'
      : kind === 'voie' ? 'Même nom, prénom et code postal, même voie mais numéro différent : pas assez pour une fusion automatique.'
      : 'Même nom, prénom et code postal, sans aucun autre élément commun (adresse, portable, e-mail, véhicule).';
    return { id: 'P' + (i + 1), a, b, kind, why, site };
  });

  /* ---------------- Journal des imports (rcu.import_run) ---------------- */
  const RUNS = (() => {
    const out = []; let id = 418; const r = rng(77);
    for (let dd = 0; dd < 14; dd++) {
      for (const src of ['VO', 'VN']) {
        const day = GX.addDays(T, -dd), start = new Date(day); start.setHours(5, src === 'VN' ? 2 : 7, int(r, 0, 59));
        const recu = new Date(start); recu.setMinutes(recu.getMinutes() - int(r, 8, 40));
        const vn = src === 'VN', base = vn ? 80522 - dd * 31 : 55104 - dd * 14;
        const run = { id: id--, source: src, fichier: vn ? 'Clients VN - REQ.txt' : 'Clients VO - REQ.txt', recu: recu.toISOString(), debut: start.toISOString(), statut: 'applique', force: false,
          empreinte: Array.from({ length: 64 }, () => pk(r, '0123456789abcdef')).join(''), message: '' };
        const lus = base + int(r, -6, 6), sansClient = vn ? 25575 + int(r, -20, 20) : int(r, 1100, 1300);
        const excl = vn ? { 'Transfert au VO': 1210 + int(r, 0, 40), 'Vente aux loueurs': 642 + int(r, 0, 9), 'Vente VS': 411, 'LLD Bony': 383, 'Vente VD agent (à confirmer)': 188, 'Rétrocession': 95, 'Immobilisation': 61, 'Buy-back': 22, 'Ex-rent': 14 }
          : { 'Affaire COBA': 2104 + int(r, 0, 15), 'LLD Bony': 341, 'Ligne multi-vendeurs regroupée': 347, 'Transfert (hors particulier)': 0 };
        const ex = Object.values(excl).reduce((a, b) => a + b, 0);
        run.stats = { lus, totalLigne: lus, sansClient, excl, retenues: lus - sansClient - ex, colonnes: vn ? 54 : 47, ignorees: vn ? 1 : 0,
          ventes: { nouvelles: int(r, vn ? 18 : 9, vn ? 64 : 31), modifiees: int(r, 80, 420), disparues: r() < .3 ? int(r, 1, 3) : 0 }, identites: { nouvelles: int(r, 6, 40), modifiees: int(r, 40, 260) },
          vehicules: int(r, 8, 50), suspects: int(r, 0, 4), volume: (r() * 0.4 - 0.1), aClasser: dd === 0 && vn ? [{ affaire: 'VNVOCLERNIS', libelle: 'YSSINGEAUX', n: 3 }] : dd === 2 && !vn ? [{ affaire: 'VNVOISS', libelle: 'ISSOI2', n: 1 }] : [] };
        run.duree = int(r, vn ? 170 : 110, vn ? 260 : 160);
        if (dd === 4 && !vn) { run.statut = 'refuse'; run.stats.lus = run.stats.totalLigne = 32410; run.stats.volume = -41.2; run.message = 'Volume en baisse de 41,2 % par rapport à l’import précédent (seuil : 10 %). Import non appliqué : les données de la veille sont conservées.'; run.duree = 22; }
        if (dd === 9 && vn) { run.statut = 'refuse'; run.stats = { lus: 0, manque: 'Numéro du client (propriétaire)', colonnes: 53, ignorees: 0 }; run.message = 'Colonne obligatoire absente : « Numéro du client (propriétaire) ». Le fichier n’a pas été lu.'; run.duree = 2; }
        if (dd === 11 && vn) { run.statut = 'erreur'; run.message = 'Connexion à rcu-db perdue pendant l’étape 3 (mise à jour des ventes). Transaction annulée : les données de la veille sont conservées.'; run.duree = 96; run.stats.ventes = null; }
        const fin = new Date(start); fin.setSeconds(fin.getSeconds() + run.duree); run.fin = fin.toISOString();
        out.push(run);
      }
    }
    const bsoD = new Date(GX.addDays(T, -1)); bsoD.setHours(14, 20, 0);
    out.push({ id: 287, source: 'BSO', fichier: 'CLIENTS VNVO - BSO (AVR).txt', recu: bsoD.toISOString(), debut: bsoD.toISOString(), fin: new Date(+bsoD + 1394e3).toISOString(), duree: 1394, statut: 'applique', force: false,
      empreinte: '9c41e07a52d3b8f16a0e44c2d97b1f3a6058e2d4c11b7a9f03e6d58b2c4a17e0', message: 'Import unique de l’ancienne base Sud-Ouest (LABOBSO, gelée au 02/10/2025). Pas de requête quotidienne (R8).',
      stats: { lus: 360302, totalLigne: null, sansClient: 15267, excl: { 'Identité générique (> 20 véhicules)': 32490 + 11840, 'Fin de financement bidon (01/01/1997) ignorée*': 0 }, retenues: 360302 - 15267 - 44330, colonnes: 31, ignorees: 2,
        ventes: { nouvelles: 300705, modifiees: 0, disparues: 0 }, identites: { nouvelles: 128402, modifiees: 0 }, vehicules: 168394, suspects: 1204, volume: null, vinDistincts: 169974, vinConnus: 1580, finBidon: 2597,
        aClasser: [{ affaire: 'VNVONISLP_FDC', libelle: 'Nissan Rodez / Albi / Aurillac', n: 4812 }] } });
    return out;
  })();
  const lastRun = (src) => RUNS.filter((x) => x.source === src).sort((a, b) => b.id - a.id)[0];
  const lastOk = (src) => RUNS.filter((x) => x.source === src && x.statut === 'applique').sort((a, b) => b.id - a.id)[0];
  const RUN_ST = { applique: { l: 'Appliqué', c: 'var(--ok)', i: 'check' }, refuse: { l: 'Refusé', c: 'var(--warn)', i: 'alert' }, erreur: { l: 'Erreur', c: 'var(--danger)', i: 'close' }, en_cours: { l: 'En cours', c: 'var(--info)', i: 'clock' } };
  const runBadge = (x) => { const s = RUN_ST[x.statut]; return `<span class="badge" style="--c:${s.c}"><i class="dot"></i>${s.l}${x.force ? ' (forcé)' : ''}</span>`; };
  const hm = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dur = (s) => s >= 60 ? `${Math.floor(s / 60)} min ${pad(s % 60, 2)} s` : `${s} s`;
  const when = (iso) => { const d = GX.iso(iso); return d === TODAY ? `aujourd’hui à ${hm(iso)}` : d === GX.iso(GX.addDays(T, -1)) ? `hier à ${hm(iso)}` : `${dFR(d)} à ${hm(iso)}`; };

  /* ---------------- Styles (préfixe crm-) ---------------- */
  GX.css(`
  .crm .app-head{padding-bottom:12px}
  .crm-view{flex:1;min-height:0;position:relative}
  .crm-view>.stack{height:100%}
  .crm-lbl{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3)}
  .crm-h2{margin:0;font-family:var(--font-display);font-weight:700;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--text);display:flex;align-items:center;gap:8px}
  .crm-h2 .n{color:var(--text-3)}
  .crm-note{font-size:12.5px;color:var(--text-3);line-height:1.5}
  .crm-mono{font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;font-size:12.5px;letter-spacing:.02em}
  .crm-plate{display:inline-flex;align-items:center;gap:0;height:22px;padding:0 7px 0 0;border-radius:5px;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line-2);font:700 12px/1 ui-monospace,Consolas,monospace;letter-spacing:.05em;color:var(--text);white-space:nowrap;flex:none;overflow:hidden}
  .crm-plate::before{content:"F";display:grid;place-items:center;align-self:stretch;width:13px;margin-right:6px;background:var(--info);color:var(--surface-0);font:700 8px/1 var(--font-ui)}
  .crm-pill{height:20px;padding:0 8px;border-radius:99px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;flex:none;white-space:nowrap;background:color-mix(in srgb,var(--c) 18%,transparent);color:color-mix(in srgb,var(--c) 75%,var(--text))}
  .crm-kv{display:grid;grid-template-columns:minmax(110px,auto) minmax(0,1fr);gap:7px 16px;font-size:13.5px;align-items:baseline}
  .crm-kv>span{color:var(--text-3);font-size:12.5px}
  .crm-kv>b{font-weight:600;min-width:0;overflow-wrap:anywhere}
  .crm-soon{border-radius:var(--r-lg);border:1px dashed var(--line-2);padding:18px 20px;display:flex;gap:14px;align-items:flex-start;color:var(--text-2)}
  .crm-soon svg.i{flex:none;color:var(--text-3);margin-top:2px}
  .crm-tag{height:20px;padding:0 7px;border-radius:6px;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;display:inline-flex;align-items:center;background:var(--surface-3);color:var(--text-3);box-shadow:inset 0 0 0 1px var(--line);white-space:nowrap}
  /* Liste */
  .crm-split{--side-w:470px;height:100%}
  .crm-list{display:flex;flex-direction:column;height:100%;min-height:0}
  .crm-search{display:flex;gap:8px;padding:14px 16px 8px}
  .crm-search .search{flex:1;height:44px;min-width:0}
  .crm-search .search input{font-size:14.5px}
  .crm-ftog{width:44px;height:44px;padding:0;justify-content:center;flex:none;position:relative}
  .crm-ftog.on{box-shadow:inset 0 0 0 1.5px var(--accent);color:var(--accent)}
  .crm-ftog .count{position:absolute;top:-6px;right:-6px}
  .crm-qhint{padding:2px 18px 10px;font-size:12.5px;color:var(--text-3);display:flex;gap:6px 10px;align-items:center;flex-wrap:wrap;min-height:28px}
  .crm-qhint b{color:var(--text-2)}
  .crm-fcard{margin:0 14px 10px;padding:16px;display:flex;flex-direction:column;gap:13px;flex:none}
  .crm-fg{display:flex;flex-direction:column;gap:7px;min-width:0}
  .crm-f2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .crm-fcard .picker-btn{width:100%;max-width:none;height:38px}
  .crm-fcard .picker-btn .v{flex:1;text-align:left;min-width:0;overflow:hidden;text-overflow:ellipsis}
  .crm-fcard .seg{width:100%}.crm-fcard .seg button{flex:1;padding:0 6px}
  .crm-ffoot{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .crm-link{font-size:13px;font-weight:600;color:var(--accent);background:none;border:0;padding:0;cursor:pointer;font-family:inherit}
  .crm-link:hover{text-decoration:underline}
  .crm-items{flex:1;min-height:120px;padding:2px 12px 12px;display:flex;flex-direction:column;gap:6px}
  .crm-item{position:relative;padding:12px 14px;border-radius:12px;cursor:pointer;display:flex;flex-direction:column;gap:6px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line);transition:background var(--t-fast),box-shadow var(--t-fast)}
  .crm-item:hover{background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line-2)}
  .crm-item.sel{background:color-mix(in srgb,var(--accent) 12%,var(--surface-2));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 55%,transparent)}
  .crm-item.stop{box-shadow:inset 3px 0 0 var(--text-3),inset 0 0 0 1px var(--line)}
  .crm-item .n{display:flex;align-items:center;gap:8px;min-width:0}
  .crm-item .t{flex:1;min-width:0;font-weight:700;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)}
  .crm-item.sel .t{color:var(--accent)}
  .crm-item .s,.crm-item .m{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-2);min-width:0}
  .crm-item .m{flex-wrap:wrap;row-gap:5px}
  .crm-item .bd{width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}
  .crm-pager{display:flex;align-items:center;gap:8px;padding:9px 14px;border-top:1px solid var(--line);font-size:12.5px;color:var(--text-2);flex:none;background:var(--surface-0)}
  .crm-pager .grow{text-align:center}
  /* Fiche */
  .crm-dhost{container-type:inline-size;container-name:crmd}
  .crm-fiche{padding:22px 34px 48px;display:flex;flex-direction:column;gap:18px}
  .crm-crumb{display:flex;align-items:center;justify-content:space-between;gap:10px 16px;flex-wrap:wrap}
  .crm-crumb .c{font-size:13px;color:var(--text-3);display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
  .crm-crumb .c b{color:var(--text-2);font-weight:600}
  .crm-crumb .acts{display:flex;gap:8px;flex-wrap:wrap}
  .crm-idt{display:flex;gap:18px;align-items:flex-start;min-width:0}
  .crm-idt .av{--s:58px;font-size:20px;border-radius:16px}
  .crm-eye{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
  .crm-name{font-family:var(--font-display);text-transform:uppercase;font-size:26px;font-weight:700;letter-spacing:.02em;line-height:1.15;margin:4px 0 4px;overflow-wrap:anywhere}
  .crm-addr{font-size:14px;color:var(--text-2)}
  .crm-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:center}
  .crm-stop{display:flex;gap:12px;align-items:center;padding:12px 16px;border-radius:12px;background:color-mix(in srgb,var(--danger) 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--danger) 35%,transparent);font-size:13.5px}
  .crm-stop svg.i{color:var(--danger);flex:none}
  .crm-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
  .crm-fact{padding:14px 16px;display:flex;flex-direction:column;gap:5px;min-width:0;cursor:pointer;transition:background var(--t-fast)}
  .crm-fact:hover{background:var(--surface-3)}
  .crm-fact .v{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .crm-fact .h{font-size:12.5px;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .crm-tabsbar{position:sticky;top:0;z-index:3;margin:0 -34px;padding:0 34px;background:var(--surface-1);border-bottom:1px solid var(--line)}
  .crm-tabsbar .tabs{border:0}
  .crm-tabsbar .tabs button{display:inline-flex;align-items:center;gap:6px}
  .crm-tabsbar .tabs .k{font-size:11.5px;color:var(--text-3);font-variant-numeric:tabular-nums}
  .crm-tabsbar .tabs .soon{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3);padding:2px 5px;border-radius:5px;background:var(--surface-3)}
  .crm-tabc{display:flex;flex-direction:column;gap:20px;min-height:200px}
  .crm-sec{display:flex;flex-direction:column;gap:12px}
  .crm-vgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
  .crm-veh{padding:16px 18px;display:flex;flex-direction:column;gap:12px;min-width:0}
  .crm-veh.old{background:color-mix(in srgb,var(--surface-2) 55%,transparent)}
  .crm-veh .hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .crm-veh .mo{font-weight:700;font-size:15px}
  .crm-tl{position:relative;display:flex;flex-direction:column;gap:12px;padding-left:26px}
  .crm-tl::before{content:"";position:absolute;left:8px;top:8px;bottom:8px;width:2px;border-radius:2px;background:var(--line-2)}
  .crm-ev{position:relative;padding:14px 18px;display:flex;flex-direction:column;gap:10px;min-width:0}
  .crm-ev::before{content:"";position:absolute;left:-23px;top:19px;width:12px;height:12px;border-radius:50%;background:var(--c);box-shadow:0 0 0 3px var(--surface-1)}
  .crm-ev.gone{opacity:.62}
  .crm-ev .hd{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap}
  .crm-ev .kv2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 24px}
  .crm-fin{padding:16px 18px;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:14px 26px;min-width:0}
  .crm-fin .hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .crm-fin .fam{font-size:17px;font-weight:700}
  .crm-prog{display:flex;flex-direction:column;gap:8px;justify-content:center}
  .crm-prog .bar{height:9px}
  .crm-prog .lg{display:flex;justify-content:space-between;font-size:12px;color:var(--text-3)}
  .crm-prog .big{font-size:15px;font-weight:700}
  .crm-ctbl td{white-space:normal;height:auto;padding-top:10px;padding-bottom:10px;vertical-align:top}
  .crm-ctbl tbody tr:nth-child(even){background:color-mix(in srgb,var(--surface-3) 30%,transparent)}
  .crm-ctbl tr.sus td:first-child{box-shadow:inset 3px 0 0 var(--danger)}
  .crm-ctbl tr.ref td:first-child{box-shadow:inset 3px 0 0 var(--text-3)}
  .crm-ctbl tr.ref .val{text-decoration:line-through;color:var(--text-3)}
  .crm-idgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
  .crm-idc{padding:16px 18px;display:flex;flex-direction:column;gap:12px;min-width:0}
  .crm-idc.sep{opacity:.55}
  .crm-idc .hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .crm-rel{display:flex;flex-direction:column;gap:6px}
  .crm-rel>div{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--surface-2) 60%,transparent);box-shadow:inset 0 0 0 1px var(--line);font-size:13.5px;color:var(--text-2)}
  /* Accueil */
  .crm-home{padding:4px 30px 40px;display:flex;flex-direction:column;gap:16px}
  .crm-kpi{padding:16px 18px;display:flex;flex-direction:column;gap:6px;cursor:pointer;min-width:0;transition:background var(--t-fast),box-shadow var(--t-fast)}
  .crm-kpi:hover{background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line-2)}
  .crm-kpi .kpi-v{font-size:28px}
  .crm-kpi .h{font-size:12.5px;color:var(--text-2)}
  .crm-g2{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px}
  .crm-panel{padding:18px 20px;display:flex;flex-direction:column;gap:14px;min-width:0}
  .crm-src{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:6px 14px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
  .crm-src:first-of-type{border-top:0;padding-top:4px}
  .crm-src .ic{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;font-weight:800;font-size:12px;background:color-mix(in srgb,var(--c) 18%,transparent);color:color-mix(in srgb,var(--c) 80%,var(--text));grid-row:span 2}
  .crm-src .l1{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-weight:700;font-size:14px}
  .crm-src .l2{font-size:12.5px;color:var(--text-2);grid-column:2 / 4}
  .crm-short{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
  .crm-short button{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line);text-align:left;font-weight:600;font-size:13.5px;color:var(--text);transition:background var(--t-fast)}
  .crm-short button:hover{background:var(--surface-3)}
  .crm-short button small{display:block;font-weight:500;font-size:12px;color:var(--text-3);margin-top:2px}
  .crm-short .ico{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--c,var(--accent)) 18%,transparent);color:var(--c,var(--accent))}
  .crm-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--text-2)}
  .crm-legend i{display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--c);margin-right:5px}
  /* Arbitrage */
  .crm-arb{padding:4px 30px 40px;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;align-items:start}
  .crm-arbm{display:flex;flex-direction:column;gap:14px;min-width:0}
  .crm-why{display:flex;gap:12px;padding:14px 16px;border-radius:12px;background:color-mix(in srgb,var(--warn) 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--warn) 32%,transparent);font-size:13.5px;line-height:1.5}
  .crm-why svg.i{color:var(--warn);flex:none;margin-top:2px}
  .crm-cmp{width:100%;border-collapse:separate;border-spacing:0;font-size:13.5px}
  .crm-cmp th{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3);text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}
  .crm-cmp td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}
  .crm-cmp td:first-child{color:var(--text-3);font-size:12.5px;width:120px}
  .crm-cmp td.mk{width:30px;text-align:center}
  .crm-cmp tr.eq td.v{background:color-mix(in srgb,var(--ok) 9%,transparent)}
  .crm-cmp tr.ne td.v{background:color-mix(in srgb,var(--warn) 7%,transparent)}
  .crm-cmp tr.sus td.v{background:color-mix(in srgb,var(--danger) 8%,transparent)}
  .crm-arbh{display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap}
  .crm-acts{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;align-items:center}
  .crm-acts .btn{height:40px;padding:0 16px}
  .crm-kbd{font-size:11px;font-weight:700;padding:1px 6px;border-radius:5px;background:color-mix(in srgb,var(--surface-0) 50%,transparent);box-shadow:inset 0 0 0 1px var(--line-2);margin-left:4px}
  .crm-q{display:flex;flex-direction:column;gap:6px}
  .crm-q .list-row{background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line);cursor:pointer;font-size:13px}
  .crm-q .list-row.on{box-shadow:inset 0 0 0 1.5px var(--accent)}
  /* Imports */
  .crm-runs{padding:6px 12px 16px;display:flex;flex-direction:column;gap:6px}
  .crm-run{padding:11px 14px;border-radius:12px;cursor:pointer;display:flex;flex-direction:column;gap:5px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line);transition:background var(--t-fast)}
  .crm-run:hover{background:var(--surface-3)}
  .crm-run.sel{background:color-mix(in srgb,var(--accent) 12%,var(--surface-2));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 55%,transparent)}
  .crm-run.ko{box-shadow:inset 3px 0 0 var(--c),inset 0 0 0 1px var(--line)}
  .crm-run .n{display:flex;align-items:center;gap:8px;font-size:13.5px}
  .crm-run .s{font-size:12.5px;color:var(--text-2);display:flex;gap:8px}
  .crm-rd{padding:22px 34px 48px;display:flex;flex-direction:column;gap:18px}
  .crm-chk{display:flex;flex-direction:column;gap:2px}
  .crm-chk>div{display:flex;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid var(--line);font-size:13.5px}
  .crm-chk>div:last-child{border-bottom:0}
  .crm-chk svg.i{flex:none}
  .crm-msg{display:flex;gap:12px;padding:14px 16px;border-radius:12px;background:color-mix(in srgb,var(--c) 11%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 35%,transparent);font-size:13.5px;line-height:1.5}
  .crm-msg svg.i{color:var(--c);flex:none;margin-top:2px}
  .crm-cnt{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
  .crm-cnt>div{padding:12px 14px;border-radius:12px;background:color-mix(in srgb,var(--surface-0) 55%,transparent);box-shadow:inset 0 0 0 1px var(--line)}
  .crm-cnt b{display:block;font-size:19px;font-variant-numeric:tabular-nums;margin-top:3px}
  @container app (max-width:1180px){.crm-split{--side-w:400px}}
  @container app (max-width:1060px){.crm-arb{grid-template-columns:minmax(0,1fr)}.crm-g2{grid-template-columns:minmax(0,1fr)}}
  @container app (max-width:720px){.crm-home,.crm-arb{padding:4px 14px 28px}.crm-search{padding:12px 12px 8px}.crm-fcard{margin:0 10px 10px;padding:14px}.crm-items{padding:2px 10px 12px}.crm-cmp td:first-child{width:84px}}
  .crm-g2.eq{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  @container crmd (max-width:760px){.crm-g2.eq{grid-template-columns:minmax(0,1fr)}}
  @container crmd (max-width:900px){.crm-facts{grid-template-columns:repeat(2,minmax(0,1fr))}.crm-fin{grid-template-columns:minmax(0,1fr)}}
  @container crmd (max-width:620px){.crm-fiche,.crm-rd{padding:16px 14px 32px;gap:14px}.crm-tabsbar{margin:0 -14px;padding:0 14px}.crm-name{font-size:19px}.crm-idt .av{--s:44px;font-size:15px}.crm-ev .kv2{grid-template-columns:minmax(0,1fr)}.crm-vgrid,.crm-idgrid{grid-template-columns:minmax(0,1fr)}.crm-kv{grid-template-columns:minmax(0,1fr);gap:2px 0}.crm-kv>b{margin-bottom:6px}.crm-crumb .hide-s{display:none}}
  @container crmd (max-width:400px){.crm-facts{gap:8px}.crm-fact{padding:11px 12px}.crm-fact .v{font-size:16px}.crm-fact .h{white-space:normal;font-size:12px}}
  @container app (max-width:520px){.crm .ah-eye,.crm .app-head .sub,.crm .app-head .ah-f{display:none}.crm .app-head{padding:10px 14px 4px}}
  `);

  /* =====================================================================
     Rendus partagés (liste, fiche) — aussi utilisés par la fenêtre « fiche client »
     ===================================================================== */
  const brandChip = (b) => GX.r.brandChips([b]);
  const plate = (v) => `<span class="crm-plate" data-tip="Immatriculation">${esc(v.immat)}</span>`;
  const vhPill = (src) => `<span class="crm-pill" style="--c:${VH_C[src]}">${VH_L[src]}</span>`;
  const etatBadge = (e) => e === 'suspect' ? `<span class="badge" style="--c:var(--danger)">${GX.icon('alert', 'sm')}Suspect</span>` : e === 'refuse' ? `<span class="badge" style="--c:var(--text-3)">${GX.icon('close', 'sm')}Refusé</span>` : `<span class="badge" style="--c:var(--ok)">${GX.icon('check', 'sm')}Valide</span>`;
  const finTxt = (s) => { const m = finLeft(s); return m < 1 ? `fin dans ${Math.max(0, Math.round(m * 30.44))} j` : `fin dans ${Math.round(m)} mois`; };
  const finBadge = (c) => {
    if (!c.curFin) return '';
    const m = finLeft(c.curFin), col = m <= 3 ? 'var(--danger)' : m <= 6 ? 'var(--warn)' : 'var(--info)';
    return `<span class="badge" style="--c:${col}" data-tip="${esc(c.curFin.fin.famille)} ${esc(c.curFin.fin.organisme)} · échéance le ${dFR(c.curFin.fin.fin)}">${GX.icon('euro', 'sm')}${esc(c.curFin.fin.famille)} · ${finTxt(c.curFin)}</span>`;
  };
  const itemHTML = (c, sel) => {
    const v = c.last.veh, n = c.cur.length;
    return `<div class="crm-item ${sel ? 'sel' : ''} ${c.nplc ? 'stop' : ''}" data-id="${c.id}">
      <div class="n"><span class="t">${esc(nameOf(c))}</span>${c.soc ? '<span class="crm-tag">Société</span>' : ''}${vhPill(c.last.source)}</div>
      <div class="s"><span class="ellipsis grow">${esc(c.ville)} (${c.cp}) · ${esc(c.site)}</span><span class="faint ellipsis" style="max-width:42%" data-tip="Vendeur référent">${GX.icon('user', 'sm')} ${esc(c.vendeurRef)}</span></div>
      <div class="m"><i class="bd" style="--c:${D.brand(v.brand).hex}" data-tip="${v.brand}"></i><span class="ellipsis" style="max-width:52%">${esc(v.modele)}${n > 1 ? ` <span class="faint">+${n - 1}</span>` : ''}</span>${plate(v)}<span class="grow"></span>${finBadge(c)}${c.suspect ? `<span class="badge" style="--c:var(--danger)" data-tip="Une coordonnée au moins est suspecte : ni rapprochement ni relance">${GX.icon('alert', 'sm')}Suspecte</span>` : ''}${c.nplc ? `<span class="badge" style="--c:var(--text-3)">${GX.icon('belloff', 'sm')}Ne plus contacter</span>` : ''}</div></div>`;
  };

  function ficheHTML(c, st, mode) {
    const vn = c.sales.filter((s) => s.source === 'VN').length, vo = c.sales.filter((s) => s.source === 'VO').length, bso = c.sales.filter((s) => s.source === 'BSO').length;
    const cts = c.cur.map((v) => v.ctProchain).filter(Boolean).sort()[0];
    const nSus = c.contacts.filter((k) => k.etat === 'suspect').length;
    const tabs = [['veh', 'Véhicules', c.vehicles.length], ['ventes', 'Ventes', c.sales.length], ['fin', 'Financements et garanties', c.sales.filter((s) => s.fin && s.fin.famille !== 'Comptant').length], ['coord', 'Coordonnées', c.contacts.length], ['src', 'Sources', c.ids.length], ['ech', 'Échanges', 'lot 4'], ['rel', 'Relances', 'lot 4']];
    const civ = CIV[c.civ];
    return `<div class="crm-fiche">
      <div class="crm-crumb"><span class="c">${mode === 'doc' ? 'SPARK' : 'Clients'} <span>/</span> <b class="ellipsis" style="max-width:300px">${esc(nameOf(c))}</b><span class="num hide-s crm-mono" style="margin-left:8px" data-tip="Identifiant SPARK : attribué à vie, survit aux fusions">${c.id}</span></span>
        <div class="acts"><button class="btn" data-act="window">${GX.icon('copy', 'sm')}${mode === 'doc' ? 'Ouvrir la liste' : 'Ouvrir dans une fenêtre'}</button><button class="btn" data-act="more" aria-label="Plus d’actions" data-tip="Vendeur référent, ne plus contacter…">${GX.icon('more', 'sm')}</button></div></div>
      <div class="crm-idt"><span class="av" style="--c:${avC(c)}">${esc(initials(c))}</span><div class="grow">
        <div class="crm-eye">${c.soc ? 'Société' : 'Particulier'} · client depuis ${c.since}</div>
        <h2 class="crm-name">${esc(fullName(c))}</h2>
        <div class="crm-addr">${esc(c.num)} ${esc(c.typeRue)} ${esc(c.rue)} · ${c.cp} ${esc(c.ville)}</div>
        <div class="crm-tags">
          <span class="badge" style="--c:var(--info)" data-tip="Civilité normalisée (4 valeurs). Libellé DCS : « ${esc(c.civRaw)} »">${GX.icon(c.soc ? 'building' : 'user', 'sm')}${civ.l}</span>
          <span class="badge" data-tip="Site principal : celui de la dernière vente">${GX.icon('pin', 'sm')}${esc(c.site)}</span>
          ${GX.r.brandChips(c.brands)}
          <span class="badge" style="--c:var(--bony-violet)" data-tip="${c.vendeurRefBy ? `Réattribué par ${esc(c.vendeurRefBy)}` : 'Par défaut : vendeur de la dernière vente. Réattribuable (lot 4, R6).'}">${GX.icon('handshake', 'sm')}Vendeur référent : ${esc(c.vendeurRef)}</span>
          ${nSus ? `<span class="badge" style="--c:var(--danger)">${GX.icon('alert', 'sm')}${nSus} coordonnée${nSus > 1 ? 's' : ''} suspecte${nSus > 1 ? 's' : ''}</span>` : ''}
        </div></div></div>
      ${c.nplc ? `<div class="crm-stop">${GX.icon('belloff')}<div class="grow"><b>Ne plus contacter</b> — ${esc(c.nplc.motif)}. Saisi par ${esc(c.nplc.by)} le ${c.nplc.date}. Ce client est exclu de toutes les relances ; aucun import ne lève ce statut.</div><button class="btn sm" data-act="nplc">Lever</button></div>` : ''}
      <div class="crm-facts">
        <div class="card crm-fact" data-goto="veh"><span class="crm-lbl">Parc actuel</span><span class="v">${plural(c.cur.length, 'véhicule')}</span><span class="h">${c.vehicles.length - c.cur.length ? `+ ${c.vehicles.length - c.cur.length} en historique` : 'aucun historique'}</span></div>
        <div class="card crm-fact" data-goto="ventes"><span class="crm-lbl">Ventes</span><span class="v">${c.sales.length}</span><span class="h">${[vn && `${vn} VN`, vo && `${vo} VO`, bso && `${bso} anc. base`].filter(Boolean).join(' · ')} · dernière ${mY(c.last.date)}</span></div>
        <div class="card crm-fact" data-goto="fin"><span class="crm-lbl">Financement en cours</span><span class="v" style="${c.curFin && finLeft(c.curFin) <= 6 ? 'color:var(--warn)' : ''}">${c.curFin ? `${esc(c.curFin.fin.famille)} · ${esc(c.curFin.fin.organisme)}` : 'Aucun'}</span><span class="h">${c.curFin ? `échéance le ${dFR(c.curFin.fin.fin)} (${finTxt(c.curFin).replace('fin ', '')})` : c.lastFin ? `dernier terminé le ${dFR(c.lastFin.fin.fin)}` : 'jamais financé chez Bony'}</span></div>
        <div class="card crm-fact" data-goto="veh"><span class="crm-lbl">Prochain contrôle technique</span><span class="v" style="${cts && cts < addM(TODAY, 2) ? 'color:var(--warn)' : ''}">${cts ? dFR(cts) : '—'}</span><span class="h">${cts ? GX.fmt.rel(cts) : 'aucun véhicule au parc'}</span></div>
      </div>
      <div class="crm-tabsbar"><div class="tabs" data-ftabs>${tabs.map(([k, l, n]) => `<button data-v="${k}" aria-selected="${st.tab === k}">${l}${typeof n === 'number' ? ` <span class="k">${n}</span>` : ` <span class="soon">${n}</span>`}${k === 'coord' && nSus ? GX.icon('alert', 'sm').replace('class="i sm"', 'class="i sm" style="color:var(--danger)"') : ''}</button>`).join('')}</div></div>
      <div class="crm-tabc" data-tabc>${tabHTML(c, st)}</div>
    </div>`;
  }

  function tabHTML(c, st) {
    switch (st.tab) {
      case 'ventes': return ventesHTML(c, st);
      case 'fin': return finHTML(c);
      case 'coord': return coordHTML(c);
      case 'src': return srcHTML(c);
      case 'ech': return soonHTML('ech', c);
      case 'rel': return soonHTML('rel', c);
      default: return vehHTML(c);
    }
  }
  function vehCard(c, v) {
    const s = c.sales[v.saleIdx], ct = v.ctProchain, ctC = !v.reprisLe && ct < TODAY ? 'var(--danger)' : !v.reprisLe && ct < addM(TODAY, 2) ? 'var(--warn)' : '';
    const first = mDiff(v.mec, TODAY) < 48;
    return `<div class="card crm-veh ${v.reprisLe ? 'old' : ''}"><div class="hd">${brandChip(v.brand)}<span class="mo">${esc(v.modele)}</span><span class="faint">${esc(v.version)}</span><span class="grow"></span>${plate(v)}</div>
      <div class="crm-kv"><span>VIN</span><b class="crm-mono">${v.vin}</b><span>Énergie</span><b>${v.energie}</b><span>1re mise en circ.</span><b>${dFR(v.mec)}</b>
        <span>Acheté</span><b>${vhPill(s.source)} le ${dFR(s.date)} · ${esc(s.site)}</b>
        ${v.reprisLe ? `<span>Sorti du parc</span><b>Repris par Bony le ${dFR(v.reprisLe)}</b>` : `<span>${first ? '1er contrôle technique' : 'Prochain CT'}</span><b style="${ctC ? `color:${ctC}` : ''}">${dFR(ct)} <span class="faint" style="font-weight:500">· ${GX.fmt.rel(ct)}</span></b>`}</div></div>`;
  }
  const vehHTML = (c) => {
    const cur = c.cur, old = c.vehicles.filter((v) => v.reprisLe);
    return `<div class="crm-sec"><h3 class="crm-h2">Parc actuel <span class="n">${cur.length}</span></h3>${cur.length ? `<div class="crm-vgrid">${cur.map((v) => vehCard(c, v)).join('')}</div>` : '<div class="crm-note">Aucun véhicule dont ce client soit le dernier acheteur connu.</div>'}
      <div class="crm-note">Parc actuel = véhicules dont ce client est le dernier acheteur connu (clé : VIN, à défaut la plaque). Le CT est calculé depuis la 1re mise en circulation quand DCS ne le fournit pas.</div></div>
      ${old.length ? `<div class="crm-sec"><h3 class="crm-h2">Historique <span class="n">${old.length}</span></h3><div class="crm-vgrid">${old.map((v) => vehCard(c, v)).join('')}</div></div>` : ''}`;
  };
  function ventesHTML(c, st) {
    const L = c.sales.filter((s) => st.vf === 'all' || s.source === st.vf).slice().reverse();
    const has = (k) => c.sales.some((s) => s.source === k);
    return `<div class="row wrap" style="justify-content:space-between;gap:10px"><div class="seg" data-vf>${[['all', 'Toutes'], ['VN', 'VN'], ['VO', 'VO'], ['BSO', 'Ancienne base']].filter(([k]) => k === 'all' || has(k)).map(([k, l]) => `<button data-v="${k}" aria-pressed="${st.vf === k}">${l}</button>`).join('')}</div>
      <span class="crm-note">Seules les ventes retenues apparaissent (particuliers et sociétés, R3).</span></div>
      <div class="crm-tl">${L.map((s) => {
        const v = s.veh, f = s.fin && s.fin.famille !== 'Comptant' ? s.fin : null;
        return `<div class="card crm-ev ${s.absente ? 'gone' : ''}" style="--c:${VH_C[s.source]}">
          <div class="hd">${vhPill(s.source)}${s.typeVH === 'AUTRE' ? '<span class="crm-tag" data-tip="« Relation client » de l’ancienne base">Autre</span>' : ''}<b style="font-size:14.5px">${s.source === 'BSO' ? 'Évènement' : 'Livrée'} le ${dFR(s.date)}</b>${s.source !== 'BSO' ? `<span class="faint" style="font-size:12.5px">commande ${dFR(s.commande)}</span>` : ''}<span class="grow"></span><b class="num">${F.eur(s.tarif)}</b></div>
          <div class="row wrap" style="gap:8px">${brandChip(v.brand)}<b>${esc(v.modele)}</b><span class="faint">${esc(v.version)} · ${v.energie}</span>${plate(v)}</div>
          ${s.absente ? `<div class="crm-note" style="color:var(--warn)">${GX.icon('alert', 'sm')} Disparue de l’import du ${dFR(s.absente)} : conservée et marquée, jamais supprimée.</div>` : ''}
          <div class="kv2"><div class="crm-kv">
            <span>Site</span><b>${esc(s.site)}</b>
            ${s.source === 'BSO' ? `<span>Compte évènement</span><b class="crm-mono">${esc(s.compte)}</b>` : `<span>Affaire</span><b><span class="crm-mono">${esc(s.affaire)}</span> <span class="faint" style="font-weight:500">· ${esc(s.societe)} · libellé « ${esc(s.libelle)} »</span></b><span>N° de dossier</span><b class="crm-mono">${s.dossier}</b>`}
            <span>Type de vente</span><b>${esc(s.typeVente)}</b></div>
          <div class="crm-kv"><span>Vendeur${s.vendeurs.length > 1 ? 's' : ''}</span><b>${s.vendeurs.map(esc).join(', ')}</b>
            ${s.intermediaire ? `<span>Intermédiaire</span><b>${esc(s.intermediaire)} <span class="crm-tag">Agent R2</span></b>` : ''}
            ${s.reprise ? `<span>Reprise</span><b>${F.eur(s.reprise.montant)} <span class="faint" style="font-weight:500">· ${esc(s.reprise.veh.modele)} ${esc(s.reprise.veh.immat)}</span></b>` : ''}
            <span>Financement</span><b>${f ? `${esc(f.organisme)} · ${esc(f.famille)} · ${f.duree} mois` : s.fin ? 'Comptant' : '—'}</b></div></div></div>`;
      }).join('')}</div>`;
  }
  function finHTML(c) {
    const L = c.sales.filter((s) => s.fin && s.fin.famille !== 'Comptant').sort((a, b) => b.fin.fin.localeCompare(a.fin.fin));
    const g = c.sales.filter((s) => s.garantie).slice().reverse();
    return `<div class="crm-sec"><h3 class="crm-h2">Financements <span class="n">${L.length}</span></h3>
      ${L.map((s) => {
        const f = s.fin, done = f.fin < TODAY, tot = mDiff(f.debut, f.fin), el = Math.min(tot, Math.max(0, mDiff(f.debut, TODAY))), pct = Math.round((el / tot) * 100), left = finLeft(s);
        const col = done ? 'var(--text-3)' : left <= 3 ? 'var(--danger)' : left <= 6 ? 'var(--warn)' : FAM_C[f.famille] || 'var(--info)';
        return `<div class="card crm-fin"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">
          <div class="hd"><span class="badge ${f.organisme === 'DIAC' ? 'solid' : ''}" style="--c:${f.organisme === 'DIAC' ? '#ffcc33' : 'var(--info)'};${f.organisme === 'DIAC' ? 'color:#1b1604' : ''}">${esc(f.organisme)}</span><span class="fam">${esc(f.famille)}</span><span class="faint crm-mono" data-tip="Libellé ou code DCS brut, traduit par ref_financement">${esc(f.produit)}</span>${f.aConfirmer ? '<span class="crm-tag" data-tip="Famille déduite d’un code encore à confirmer (cadrage § 3.4)">à confirmer</span>' : ''}</div>
          <div class="crm-kv"><span>Véhicule</span><b>${esc(s.veh.modele)} · ${esc(s.veh.immat)}</b><span>Vente</span><b>${vhPill(s.source)} du ${dFR(s.date)} · ${esc(s.site)}</b>
            <span>Début → fin</span><b>${dFR(f.debut)} → ${dFR(f.fin)}</b><span>Durée</span><b>${f.duree} mois${f.calculee ? ' <span class="crm-tag" data-tip="Saisie à 0 dans DCS (règle au VO) : calculée depuis le début et la fin">calculée</span>' : ''}</b></div></div>
          <div class="crm-prog"><span class="crm-lbl">${done ? 'Terminé' : 'Avancement jusqu’à l’échéance'}</span><span class="big" style="color:${col}">${done ? `Terminé depuis ${Math.max(1, Math.round(-left))} mois` : `Échéance ${finTxt(s).replace('fin ', '')}`}</span>
            <div class="bar"><i style="width:${pct}%;--c:${col}"></i></div><div class="lg"><span>${mY(f.debut)}</span><span>${pct} %</span><span>${mY(f.fin)}</span></div></div></div>`;
      }).join('') || '<div class="crm-note">Aucun financement connu : achats au comptant ou financement hors Bony.</div>'}</div>
      <div class="crm-sec"><h3 class="crm-h2">Garanties <span class="n">${g.length}</span></h3><div class="card scroll"><table class="tbl"><thead><tr><th>Véhicule</th><th>Garantie</th><th>Code</th><th class="r">Kilométrage</th><th>Depuis</th><th>Fin estimée</th></tr></thead><tbody>
        ${g.map((s) => { const e = addM(s.date, s.garantie.mois); return `<tr><td><b>${esc(s.veh.modele)}</b> <span class="faint">${esc(s.veh.immat)}</span></td><td>${esc(s.garantie.libelle)} ${s.garantie.mois} mois</td><td class="crm-mono">${s.garantie.code}</td><td class="r num">${s.garantie.km ? F.n(s.garantie.km) + ' km' : '—'}</td><td class="num">${dFR(s.date)}</td><td class="num" style="${e >= TODAY ? 'color:var(--ok);font-weight:600' : 'color:var(--text-3)'}">${dFR(e)}</td></tr>`; }).join('')}
      </tbody></table></div><div class="crm-note">La fin de garantie est estimée (date de vente + durée) : DCS ne transmet que le code, le libellé et le kilométrage.</div></div>`;
  }
  function coordHTML(c) {
    const row = (k) => `<tr class="${k.etat === 'suspect' ? 'sus' : k.etat === 'refuse' ? 'ref' : ''}" data-k="${k.id}"><td>${GX.icon(k.type === 'E-mail' ? 'mail' : k.type === 'Fixe' ? 'message' : 'sms', 'sm')} ${k.type}</td>
      <td><b class="val ${k.type === 'E-mail' ? '' : 'num'}">${esc(k.type === 'E-mail' ? k.val : tel(k.val))}</b></td><td>${etatBadge(k.etat)}</td><td class="crm-note" style="max-width:280px">${esc(k.motif) || '—'}</td>
      <td style="font-size:12.5px">${esc(k.src)}<div class="faint">vue le ${dFR(k.vu)}</div></td>
      <td class="r">${k.etat === 'valide' ? `<button class="btn sm" data-ref="${k.id}" data-tip="Le client refuse ce canal : mémorisé par Bony, jamais effacé par l’import">Refuser</button>` : k.etat === 'refuse' ? `<button class="btn sm ghost" data-unref="${k.id}">Rétablir</button>` : '<span class="faint" style="font-size:12px" data-tip="Recalculé à chaque import (R4)">automatique</span>'}</td></tr>`;
    return `<div class="crm-sec"><div class="card scroll"><table class="tbl crm-ctbl"><thead><tr><th>Type</th><th>Coordonnée</th><th>État</th><th>Motif</th><th>Source</th><th></th></tr></thead><tbody>${c.contacts.map(row).join('')}
      <tr><td>${GX.icon('pin', 'sm')} Adresse</td><td><b>${esc(c.num)} ${esc(c.typeRue)} ${esc(c.rue)}</b><div class="faint">${c.cp} ${esc(c.ville)}</div></td><td>${etatBadge('valide')}</td><td class="crm-note">Celle de la vente la plus récente</td><td style="font-size:12.5px">${esc(c.ids[c.ids.length - 1].source)} · ${esc(c.ids[c.ids.length - 1].societe)}</td><td></td></tr></tbody></table></div>
      <div class="crm-legend"><span>${etatBadge('valide')} utilisable pour rapprocher et relancer</span><span>${etatBadge('suspect')} partagée par trop d’identités, domaine Bony ou numéro bidon : ni rapprochement ni relance (R4)</span><span>${etatBadge('refuse')} refus du client, saisi dans Gearbox (couche Bony)</span></div></div>`;
  }
  function srcHTML(c) {
    return `<div class="crm-note">Une <b>identité source</b> est ce que DCS appelle un client : clé source · société · numéro (le numéro DCS n’est unique que par société, et le VO a sa propre numérotation). Le client SPARK regroupe ses identités ; ses attributs viennent de la vente la plus récente. Une décision manuelle est <b>rejouée à chaque import</b>.</div>
      <div class="crm-idgrid">${c.ids.map((x, j) => `<div class="card crm-idc ${x.separee ? 'sep' : ''}"><div class="hd">${vhPill(x.source)}<b>${esc(x.societe)}</b><span class="faint">${x.source === 'BSO' ? 'n° de fiche' : x.source === 'VN' ? 'n° client propriétaire' : 'n° compte client'}</span><b class="crm-mono">${x.numero}</b><span class="grow"></span>
        ${c.ids.length > 1 && !x.separee ? `<button class="btn sm ghost" data-sep="${x.id}" data-tip="Décision manuelle : cette identité deviendra un client distinct">Séparer</button>` : ''}</div>
        <div class="crm-kv"><span>Nom dans DCS</span><b class="crm-mono">${esc(x.nomDCS)}</b><span>Civilité DCS</span><b>« ${esc(x.civRaw)} » → ${CIV[c.civ].l.toLowerCase()}</b><span>Ventes</span><b>${x.ventes} · dernière le ${dFR(x.derniere)}</b><span>Vue depuis</span><b>import n° ${x.premierRun}</b>
          <span>Rattachement</span><b>${x.separee ? '<span class="badge" style="--c:var(--warn)">Séparée — client distinct au prochain recalcul</span>' : j === 0 ? '<span class="badge" style="--c:var(--text-3)">Identité d’origine (la plus ancienne survit)</span>' : `<span class="badge" style="--c:${x.rule.startsWith('Arbitrage') ? 'var(--bony-violet)' : 'var(--ok)'}">${esc(x.rule)}</span>`}</b></div></div>`).join('')}</div>`;
  }
  function soonHTML(k, c) {
    if (k === 'ech') return `<div class="crm-soon">${GX.icon('message', 'lg')}<div><b style="color:var(--text)">Échanges — arrive avec le lot 4</b><div class="crm-note" style="margin-top:4px">Appels, visites, e-mails et notes des vendeurs, qualification du client, réattribution du vendeur. Couche Bony : saisie par les utilisateurs, jamais touchée par l’import du soir.</div>
      <button class="btn sm" style="margin-top:12px" disabled>${GX.icon('plus', 'sm')}Noter un échange</button></div></div>`;
    const T2 = [];
    if (c.curFin) T2.push(['euro', `Fin de ${c.curFin.fin.famille} le ${dFR(c.curFin.fin.fin)}`, finTxt(c.curFin)]);
    c.cur.forEach((v) => { if (v.ctProchain >= TODAY && v.ctProchain < addM(TODAY, 12)) T2.push(['car', `Contrôle technique ${v.modele} (${v.immat})`, dFR(v.ctProchain)]); });
    c.cur.forEach((v) => { const a = Math.floor(mDiff(v.mec, TODAY) / 12); if (a >= 4) T2.push(['clock', `${v.modele} : ${a} ans`, 'âge du véhicule']); });
    const y = Math.floor(mDiff(c.last.date, TODAY) / 12); if (y >= 4) T2.push(['refresh', `Sans achat depuis ${y} ans`, `dernier : ${dFR(c.last.date)}`]);
    return `<div class="crm-soon">${GX.icon('bell', 'lg')}<div class="grow"><b style="color:var(--text)">Relances — suivi par client au lot 4</b> <span class="faint" style="font-weight:500">· les listes se construisent dès le lot 3 dans le Requêteur</span><div class="crm-note" style="margin-top:4px">Règles réglables (fin de financement, CT, anniversaire, âge du véhicule, sans achat depuis X ans), listes exportables. Aperçu de ce que ce client déclencherait :</div>
      ${c.nplc ? '<div class="crm-note" style="margin-top:10px;color:var(--danger)">Aucune : client « ne plus contacter ».</div>' : `<div class="crm-rel" style="margin-top:12px">${T2.map(([i, l, h]) => `<div>${GX.icon(i, 'sm')}<span class="grow">${esc(l)}</span><span class="faint">${esc(h)}</span></div>`).join('') || '<div>Aucun déclencheur pour l’instant.</div>'}</div>`}</div></div>`;
  }

  /* Interactions de la fiche (partagées par la rubrique et la fenêtre « fiche ») */
  function wireFiche(host, c, st, win, { refresh, openList, openWindow }) {
    if (!host || !c) return;
    const rt = () => { const tc = host.querySelector('[data-tabc]'); if (tc) { tc.innerHTML = tabHTML(c, st); wireTab(); } };
    host.querySelector('[data-ftabs]')?.addEventListener('change', (e) => { st.tab = e.detail; rt(); GX.store.set('crm.ftab', st.tab); });
    host.querySelectorAll('[data-goto]').forEach((el) => el.addEventListener('click', () => { st.tab = el.dataset.goto; const b = host.querySelector(`[data-ftabs] [data-v="${st.tab}"]`); b?.click(); host.querySelector('.crm-tabsbar')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }));
    host.querySelector('[data-act=window]')?.addEventListener('click', (e) => openWindow ? openWindow(c, e.currentTarget) : openList?.());
    host.querySelector('[data-act=nplc]')?.addEventListener('click', () => toggleNplc(c, win, refresh));
    host.querySelector('[data-act=more]')?.addEventListener('click', (e) => GX.menu.open([
      { header: 'Couche Bony — lot 4' },
      { label: 'Réattribuer le vendeur référent…', icon: 'handshake', action: () => reassign(c, win, refresh) },
      { label: c.nplc ? 'Lever « ne plus contacter »' : 'Marquer « ne plus contacter »…', icon: 'belloff', action: () => toggleNplc(c, win, refresh) },
      '-', { label: 'Copier l’identifiant SPARK', icon: 'copy', action: () => { try { navigator.clipboard?.writeText(c.id); } catch (er) {} GX.shell.hud(`${c.id} copié`); } },
    ], e.currentTarget, { align: 'right' }));
    function wireTab() {
      host.querySelector('[data-vf]')?.addEventListener('change', (e) => { st.vf = e.detail; setTimeout(rt, 140); });
      host.querySelectorAll('[data-ref]').forEach((b) => b.addEventListener('click', () => { const k = c.contacts.find((x) => x.id === b.dataset.ref); k.etat = 'refuse'; k.motif = `Refusé par le client — saisi par Théo L. le ${dFR(TODAY)}`; GX.shell.hud('Coordonnée refusée · exclue des relances'); rt(); }));
      host.querySelectorAll('[data-unref]').forEach((b) => b.addEventListener('click', () => { const k = c.contacts.find((x) => x.id === b.dataset.unref); k.etat = 'valide'; k.motif = ''; rt(); }));
      host.querySelectorAll('[data-sep]').forEach((b) => b.addEventListener('click', () => {
        const x = c.ids.find((i) => i.id === b.dataset.sep);
        win.sheet(`<h3>Séparer cette identité ?</h3><div class="muted" style="line-height:1.55">L’identité <b style="color:var(--text)">${x.source} · ${esc(x.societe)} · ${x.numero}</b> sera détachée de ${esc(nameOf(c))} et deviendra un client distinct.<br><br>La décision est enregistrée et <b style="color:var(--text)">rejouée à chaque import</b> : la nuit ne la défera pas.</div>
          <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">Séparer</button></div>`, { onClose: (v) => { if (v !== 'ok') return; x.separee = true; GX.shell.hud('Identité séparée'); rt(); } });
      }));
    }
    wireTab();
  }
  function reassign(c, win, refresh) {
    const opts = [...new Set([...(VENDEURS[c.site] || []), ...c.sales.flatMap((s) => s.vendeurs)])];
    win.sheet(`<div class="label" style="color:var(--bony-violet)">Couche Bony · lot 4</div><h3 style="margin:2px 0 8px">Vendeur référent</h3><div class="muted" style="line-height:1.5">Par défaut, le vendeur de la dernière vente. Quand un vendeur quitte le groupe, ses clients sont réattribués (R6). L’import ne modifie jamais ce choix.</div>
      <label class="field" style="margin-top:14px"><span class="label">Vendeur</span><select class="select" id="crmVr">${opts.map((o) => `<option ${o === c.vendeurRef ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
      <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">Enregistrer</button></div>`, { width: 460, onClose: (v) => { const s = document.getElementById('crmVr')?.value; if (v === 'ok' && s) { c.vendeurRef = s; c.vendeurRefBy = `Théo L. le ${dFR(TODAY)}`; GX.shell.hud('Vendeur référent réattribué'); refresh(); } } });
  }
  function toggleNplc(c, win, refresh) {
    if (c.nplc) { c.nplc = null; GX.shell.hud('Statut « ne plus contacter » levé'); return refresh(); }
    win.sheet(`<div class="label" style="color:var(--danger)">Couche Bony · lot 4</div><h3 style="margin:2px 0 8px">Ne plus contacter ${esc(nameOf(c))} ?</h3><div class="muted" style="line-height:1.5">Le client sort de toutes les listes de relance. Aucun import ne lève ce statut : seul un utilisateur le peut.</div>
      <label class="field" style="margin-top:14px"><span class="label">Motif</span><input class="input" id="crmNm" value="Demande du client" /></label>
      <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" style="background:var(--danger)">Confirmer</button></div>`, { width: 460, onClose: (v) => { if (v !== 'ok') return; c.nplc = { by: 'Théo L.', date: dFR(TODAY), motif: document.getElementById('crmNm')?.value || 'Sans motif' }; refresh(); } });
  }

  /* =====================================================================
     Rubrique
     ===================================================================== */
  function mount(body, win) {
    const views = () => [['home', 'Accueil'], ['clients', 'Clients'], ['arb', 'À arbitrer'], ['req', 'Requêteur'], ...(canImports() ? [['imports', 'Imports']] : [])];
    const st = { view: GX.store.get('crm.view', 'home'), arbTotal: ARB_TOTAL0 };
    if (!views().some(([k]) => k === st.view)) st.view = 'home';
    const perToCtx = () => GX.ctx.perimetre && GX.ctx.perimetre !== 'Tout le réseau' && GX.data.SITES.includes(GX.ctx.perimetre) ? [GX.ctx.perimetre] : [];
    const F0 = () => ({ q: '', sites: perToCtx(), brands: [], kind: 'all', vh: 'all', fam: [], ech: 'all', suspect: false, nplc: false, sort: 'recent' });
    const cs = { f: F0(), page: 0, selId: null, autoSel: false, showF: false, tab: GX.store.get('crm.ftab', 'veh'), vf: 'all' };
    const as = { idx: 0, queue: PAIRS.slice(), done: [] };
    const is = { selId: lastRun('VN').id, src: 'all' };
    let compact = false, stack = null, listHost = null, lastPer = GX.ctx.perimetre;

    body.innerHTML = `<div class="app crm">
      <div class="app-head"><div class="ah-t"><span class="ah-eye">Relation client</span><h1>SPARK</h1><span class="sub" data-sub></span></div>
        <div class="ah-tabs"><div class="tabs" data-views></div></div>
        <div class="ah-f"><span class="badge" style="--c:var(--warn)" data-tip="Maquette : toutes les données sont fictives">Maquette · données fictives</span></div></div>
      <div class="crm-view" data-view></div></div>`;
    const $ = (s) => body.querySelector(s), vhost = $('[data-view]');

    function head() {
      const r = lastOk('VN');
      $('[data-sub]').textContent = `${F.n(TOTAL)} clients · mis à jour ${when(r.fin)}`;
      $('[data-views]').innerHTML = views().map(([k, l]) => `<button data-v="${k}" aria-selected="${st.view === k}">${l}${k === 'arb' ? ` <span class="count" style="background:var(--warn);margin-left:4px">${F.n(st.arbTotal)}</span>` : ''}</button>`).join('');
      GX.ui.refresh($('.app-head'));
      win.setTitle('SPARK', views().find(([k]) => k === st.view)?.[1]);
    }
    $('[data-views]').addEventListener('change', (e) => go(e.detail));
    function go(v, opts = {}) {
      if (!views().some(([k]) => k === v)) return GX.shell.hud('Imports : réservé au rôle Master');
      st.view = v; GX.store.set('crm.view', v);
      if (opts.filters) { Object.assign(cs.f, F0(), opts.filters); cs.page = 0; cs.selId = null; cs.showF = !!opts.showF; }
      if (opts.run) is.selId = opts.run;
      head(); render();
      if (opts.focus) setTimeout(() => (listHost || body).querySelector('[data-q]')?.focus(), 80);
    }
    function render() {
      vhost.classList.remove('stack'); vhost.innerHTML = ''; stack = null; listHost = null;
      if (st.view === 'clients') return clientsBuild();
      if (st.view === 'arb') return arbBuild();
      if (st.view === 'imports') return importsBuild();
      if (st.view === 'req' && GX.crmReq) return GX.crmReq.build(vhost, { win, compact, openClient: (id, el) => { const c = byId.get(id); if (!c) return; if (compact) { cs.selId = id; cs.autoSel = false; go('clients'); } else fcb().openWindow(c, el); } });
      return homeBuild();
    }

    /* ---------------- Accueil ---------------- */
    function homeBuild() {
      const fins = Array.from({ length: 12 }, (_, m) => { const d = addM(TODAY, m); const r = rng(300 + m); return { l: mY(d), LOA: 560 + int(r, 0, 260), 'Crédit': 230 + int(r, 0, 120), LLD: 130 + int(r, 0, 80), autres: 40 + int(r, 0, 40) }; });
      const six = fins.slice(0, 6).reduce((s, x) => s + x.LOA + x['Crédit'] + x.LLD + x.autres, 0);
      const plq = Object.entries(D.PLAQUES).map(([p, ss]) => ({ label: p.replace('PLAQUE ', 'Plaque ').replace(/(Plaque )(.*)/, (m, a, b) => a + cap(b)), value: Math.round(ss.reduce((s, x) => s + (SITE_W[x] || 0), 0) / 102.4 * TOTAL) }));
      plq.push({ label: 'Sites Nissan hors plaque', value: Math.round((SITE_W['Montluçon'] + SITE_W['Saint-Etienne']) / 102.4 * TOTAL) });
      const src = (k) => { const x = lastRun(k), ok = lastOk(k), c = VH_C[k], s = x.stats;
        return `<div class="crm-src"><span class="ic" style="--c:${c}">${k === 'BSO' ? 'BSO' : k}</span>
          <div class="l1">${k === 'BSO' ? 'Ancienne base Sud-Ouest' : k === 'VN' ? 'Requête VN du soir' : 'Requête VO du soir'} ${runBadge(x)}${k === 'BSO' ? '<span class="crm-tag">Import unique</span>' : ''}</div>
          <span>${canImports() ? `<button class="btn sm ghost" data-run="${x.id}">Rapport ${GX.icon('chevron', 'sm')}</button>` : ''}</span>
          <div class="l2">${x.statut === 'applique' ? `${when(x.fin)} · ${F.n(s.lus)} lignes lues · ${F.n(s.retenues)} retenues${s.ventes ? ` · +${F.n(s.ventes.nouvelles)} ventes nouvelles` : ''}` : `${when(x.debut)} — ${esc(x.message)} Dernier import appliqué : ${when(ok.fin)}.`}</div></div>`; };
      vhost.innerHTML = `<div class="scroll" style="height:100%"><div class="crm-home">
        <div class="kpis">
          <div class="card crm-kpi enter" style="--i:0" data-k="all"><span class="crm-lbl">Clients</span><span class="kpi-v num">${F.n(TOTAL)}</span><span class="h">${F.n(158776)} particuliers · ${F.n(21651)} sociétés</span></div>
          <div class="card crm-kpi enter" style="--i:1" data-k="all"><span class="crm-lbl">Véhicules</span><span class="kpi-v num">${F.n(250045)}</span><span class="h">dont ${F.n(153190)} au parc actuel · ${F.n(224310)} ventes</span></div>
          <div class="card crm-kpi enter" style="--i:2" data-k="fin6"><span class="crm-lbl">Financements · fin ≤ 6 mois</span><span class="kpi-v num" style="color:var(--warn)">${F.n(six)}</span><span class="h">LOA, LLD, crédits DIAC et autres banques</span></div>
          <div class="card crm-kpi enter" style="--i:3" data-k="arb"><span class="crm-lbl">Fiches à arbitrer</span><span class="kpi-v num">${F.n(st.arbTotal)}</span><span class="h">doublons proposés, jamais fusionnés seuls</span></div>
        </div>
        <div class="crm-g2">
          <div class="card crm-panel"><div class="row" style="justify-content:space-between"><h2 class="crm-h2">${GX.icon('refresh', 'sm')} Dernier import par source</h2>${canImports() ? '<button class="crm-link" data-act="imports">Tous les imports</button>' : ''}</div>
            <div>${src('VN')}${src('VO')}${src('BSO')}</div>
            <div class="crm-note">Dépôt SFTP chaque nuit, appliqué vers 5 h. Un fichier sans sa ligne de total, ou dont le volume chute de plus de 10 %, n’est pas appliqué : les données de la veille restent en place.</div></div>
          <div class="card crm-panel"><h2 class="crm-h2">${GX.icon('pin', 'sm')} Clients par plaque</h2>${GX.chart.hbars({ items: plq, fmt: F.n })}<div class="crm-note">Site principal = site de la dernière vente.</div></div>
        </div>
        <div class="card crm-panel"><div class="row wrap" style="justify-content:space-between"><h2 class="crm-h2">${GX.icon('euro', 'sm')} Fins de financement · 12 prochains mois</h2>
          <div class="crm-legend">${[['LOA', FAM_C.LOA], ['Crédit', FAM_C['Crédit']], ['LLD', FAM_C.LLD], ['Autres', FAM_C['Crédit-bail']]].map(([l, c]) => `<span><i style="--c:${c}"></i>${l}</span>`).join('')}</div></div>
          ${GX.chart.bars({ labels: fins.map((x) => x.l), series: [{ name: 'LOA', values: fins.map((x) => x.LOA), color: FAM_C.LOA }, { name: 'Crédit', values: fins.map((x) => x['Crédit']), color: FAM_C['Crédit'] }, { name: 'LLD', values: fins.map((x) => x.LLD), color: FAM_C.LLD }, { name: 'Autres', values: fins.map((x) => x.autres), color: FAM_C['Crédit-bail'] }], stacked: true, height: 200, fmt: F.n })}
          <div class="crm-note">Cliquez sur « Financements · fin ≤ 6 mois » pour la liste des clients concernés. Les relances automatiques arrivent au lot 4.</div></div>
        <div class="crm-sec"><h2 class="crm-h2">Raccourcis</h2><div class="crm-short">
          <button data-sc="search"><span class="ico">${GX.icon('search')}</span><span>Rechercher un client<small>nom, téléphone, e-mail, plaque, VIN</small></span></button>
          <button data-sc="fin6" style="--c:var(--warn)"><span class="ico">${GX.icon('euro')}</span><span>Fins de financement<small>échéance dans les 6 mois</small></span></button>
          <button data-sc="arb" style="--c:var(--bony-violet)"><span class="ico">${GX.icon('users')}</span><span>File d’arbitrage<small>${F.n(st.arbTotal)} paires à trancher</small></span></button>
          <button data-sc="sus" style="--c:var(--danger)"><span class="ico">${GX.icon('alert')}</span><span>Coordonnées suspectes<small>${F.n(5812)} clients concernés</small></span></button>
          <button data-sc="nplc" style="--c:var(--text-3)"><span class="ico">${GX.icon('belloff')}</span><span>Ne plus contacter<small>clients exclus des relances</small></span></button>
          ${canImports() ? `<button data-sc="imports" style="--c:var(--info)"><span class="ico">${GX.icon('upload')}</span><span>Imports<small>rapports et sites à classer</small></span></button>` : ''}
        </div></div>
        <div class="crm-g2"><div class="crm-soon">${GX.icon('message', 'lg')}<div><b style="color:var(--text)">Échanges et vendeur référent · lot 4</b><div class="crm-note" style="margin-top:4px">Notes d’appel, visites, qualification, « ne plus contacter », réattribution quand un vendeur part.</div></div></div>
          <div class="crm-soon" data-sc="req" style="cursor:pointer;border-style:solid">${GX.icon('bell', 'lg')}<div><b style="color:var(--text)">Requêteur · lot 3</b><div class="crm-note" style="margin-top:4px">Fin de financement, prochain CT, anniversaire, âge du véhicule, sans achat depuis X ans… Des listes construites en phrases, exportables vers Excel, Sarbacane, allmysms, phoning et courrier.</div></div></div></div>
      </div></div>`;
      const sc = (k) => ({ search: () => go('clients', { filters: {}, focus: true }), fin6: () => go('clients', { filters: { ech: '6', sort: 'fin' }, showF: true }), arb: () => go('arb'), sus: () => go('clients', { filters: { suspect: true }, showF: true }), nplc: () => go('clients', { filters: { nplc: true }, showF: true }), imports: () => go('imports'), req: () => go('req'), all: () => go('clients', { filters: {} }) }[k]?.());
      vhost.querySelectorAll('[data-sc]').forEach((b) => b.addEventListener('click', () => sc(b.dataset.sc)));
      vhost.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => sc(b.dataset.k)));
      vhost.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', () => go('imports', { run: +b.dataset.run })));
      vhost.querySelector('[data-act=imports]')?.addEventListener('click', () => go('imports'));
    }

    /* ---------------- Clients : liste → fiche ---------------- */
    const famList = ['LOA', 'LLD', 'Crédit', 'Crédit ballon', 'Crédit-bail', 'Comptant'];
    const ECH = { all: 'Toutes', 3: 'Dans les 3 mois', 6: 'Dans les 6 mois', 12: 'Dans les 12 mois', past: 'Terminé (12 derniers mois)' };
    let res = null;
    function listHTML() {
      const f = cs.f; res = query(f, cs.page); const n = nFilters(f);
      if (!compact && (!cs.selId || !res.rows.some((c) => c.id === cs.selId))) { cs.selId = res.rows[0]?.id || null; cs.autoSel = true; }
      const from = res.total ? res.page * PAGE + 1 : 0, to = Math.min(res.total, (res.page + 1) * PAGE);
      return `<div class="crm-list">
        <div class="crm-search"><label class="search">${GX.icon('search', 'sm')}<input data-q placeholder="Nom, téléphone, e-mail, plaque, VIN…" aria-label="Rechercher un client" value="${esc(f.q)}" /></label>
          <button class="btn crm-ftog ${cs.showF ? 'on' : ''}" data-act="filters" data-tip="${cs.showF ? 'Masquer les filtres' : 'Filtres'}" aria-label="Filtres">${GX.icon(cs.showF ? 'close' : 'filter', 'sm')}${!cs.showF && n ? `<span class="count">${n}</span>` : ''}</button></div>
        <div class="crm-qhint">${res.d ? `${GX.icon('info', 'sm')}Recherche par <b>${res.d.l}</b> ·` : ''}${res.total ? `<span><b class="num">${F.n(from)}–${F.n(to)}</b> sur <b class="num">${F.n(res.total)}</b> client${res.total > 1 ? 's' : ''}</span>` : '<span>Aucun résultat</span>'}
          <span class="grow"></span><button class="crm-link" data-act="sort">${{ recent: 'Achat le plus récent', nom: 'Nom A → Z', fin: 'Échéance la plus proche' }[f.sort]} ${GX.icon('chevdown', 'sm')}</button></div>
        ${cs.showF ? `<div class="card crm-fcard">
          <div class="crm-f2"><div class="crm-fg"><span class="crm-lbl">Site (au moins un achat)</span>${GX.ui.pickerBtn('data-fsites', 'pin', GX.ui.summary(f.sites, { all: 'Tout le réseau' }), f.sites.length)}</div>
            <div class="crm-fg"><span class="crm-lbl">Famille de financement</span>${GX.ui.pickerBtn('data-ffam', 'euro', GX.ui.summary(f.fam, { all: 'Toutes' }), f.fam.length)}</div></div>
          <div class="crm-fg"><span class="crm-lbl">Marque (au moins un véhicule)</span>${GX.ui.chips(['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize'], f.brands, { all: 'Toutes', colors: Object.fromEntries(D.BRANDS.map((b) => [b.id, b.hex])), attr: 'data-fbrands' })}</div>
          <div class="crm-fg"><span class="crm-lbl">Client</span><div class="seg" data-fkind>${[['all', 'Tous'], ['part', 'Particuliers'], ['soc', 'Sociétés']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${f.kind === v}">${l}</button>`).join('')}</div></div>
          <div class="crm-fg"><span class="crm-lbl">Type d’achat</span><div class="seg" data-fvh>${[['all', 'Tous'], ['VN', 'VN'], ['VO', 'VO'], ['BSO', 'Ancienne base']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${f.vh === v}">${l}</button>`).join('')}</div></div>
          <div class="crm-f2"><div class="crm-fg"><span class="crm-lbl">Fin de financement</span>${GX.ui.pickerBtn('data-fech', 'clock', ECH[f.ech], f.ech !== 'all')}</div>
            <div class="crm-fg"><span class="crm-lbl">Qualité</span><div class="col" style="gap:6px;padding-top:2px"><label class="row" style="font-size:13px;cursor:pointer"><input type="checkbox" data-fsus ${f.suspect ? 'checked' : ''} />Coordonnée suspecte</label><label class="row" style="font-size:13px;cursor:pointer"><input type="checkbox" data-fnplc ${f.nplc ? 'checked' : ''} />Ne plus contacter</label></div></div></div>
          <div class="crm-ffoot"><button class="crm-link" data-act="reset">Réinitialiser</button><span class="crm-note">Filtres appliqués par le serveur</span></div>
        </div>` : ''}
        <div class="crm-items scroll" data-items>${res.rows.map((c) => itemHTML(c, c.id === cs.selId && !(compact && cs.autoSel))).join('') || `<div class="empty">${GX.icon('users')}Aucun client ne correspond.<span class="crm-note">Vérifiez l’orthographe, ou cherchez par plaque, téléphone ou VIN.</span></div>`}</div>
        <div class="crm-pager"><button class="btn sm" data-pg="-1" ${res.page <= 0 ? 'disabled' : ''} aria-label="Page précédente">${GX.icon('back', 'sm')}</button>
          <span class="grow num">Page ${F.n(res.page + 1)} / ${F.n(res.pages)}</span>
          <span class="faint" data-tip="Le navigateur ne reçoit que la page affichée (50 fiches). Recherche, filtres, tri et pagination sont faits par la base.">${GX.icon('info', 'sm')}</span>
          <button class="btn sm" data-pg="1" ${res.page >= res.pages - 1 ? 'disabled' : ''} aria-label="Page suivante">${GX.icon('chevron', 'sm')}</button></div>
      </div>`;
    }
    const sel = () => byId.get(cs.selId);
    const detailPane = () => { const c = sel(); return c ? ficheHTML(c, cs, 'list') : `<div class="empty" style="height:100%">${GX.icon('users')}<b class="display" style="color:var(--text);font-size:15px">Sélectionnez un client</b>↑ ↓ pour naviguer · double-clic pour une fenêtre</div>`; };
    const fcb = () => ({ refresh: () => { refreshList(); refreshDetail(); }, openWindow: (c, el) => GX.wm.open('crm-client', { id: c.id, title: nameOf(c) }, { origin: el }) });
    function clientsBuild() {
      if (compact) {
        stack = GX.ui.stack(vhost); listHost = stack.push('Clients', listHTML(), { noHead: true }); listHost.style.display = 'flex'; listHost.style.flexDirection = 'column'; wireList(listHost);
        if (cs.selId && !cs.autoSel) openCompact();
      } else {
        vhost.innerHTML = `<div class="split crm-split"><div class="side">${listHTML()}</div><div class="main scroll crm-dhost" data-detail>${detailPane()}</div></div>`;
        listHost = vhost.querySelector('.side'); wireList(listHost); wireFiche(vhost.querySelector('[data-detail]'), sel(), cs, win, fcb());
      }
    }
    function refreshList(keepFocus) {
      if (!listHost?.isConnected) return; const sc = listHost.querySelector('[data-items]')?.scrollTop || 0;
      listHost.innerHTML = listHTML(); wireList(listHost); const it = listHost.querySelector('[data-items]'); if (it && keepFocus) it.scrollTop = sc;
    }
    function refreshDetail(anim) {
      const host = compact ? (stack?.depth() > 1 ? stack.top() : null) : vhost.querySelector('[data-detail]'); if (!host) return;
      const sc = host.scrollTop; host.innerHTML = detailPane(); host.scrollTop = anim ? 0 : sc; wireFiche(host, sel(), cs, win, fcb());
      if (anim && host.firstElementChild) GX.animate(host.firstElementChild, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
    }
    function select(id) {
      if (!id) return; cs.selId = id; cs.autoSel = false; cs.vf = 'all';
      if (compact) return openCompact();
      listHost.querySelectorAll('.crm-item').forEach((x) => x.classList.toggle('sel', x.dataset.id === id));
      listHost.querySelector(`.crm-item[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
      refreshDetail(true); win.setTitle('SPARK', nameOf(sel()));
    }
    function openCompact() { const c = sel(); if (!c || !stack || stack.depth() > 1) return; const host = stack.push(nameOf(c), ficheHTML(c, cs, 'list')); host.classList.add('crm-dhost'); wireFiche(host, c, cs, win, fcb()); }
    function wireList(host) {
      const q = (s) => host.querySelector(s), f = cs.f, upd = () => { cs.page = 0; refreshList(); if (!compact) refreshDetail(); };
      let tq; q('[data-q]')?.addEventListener('input', (e) => { clearTimeout(tq); tq = setTimeout(() => { f.q = e.target.value; const pos = e.target.selectionStart; upd(); const i = listHost.querySelector('[data-q]'); i?.focus(); i?.setSelectionRange(pos, pos); }, 180); });   // debounce : un appel serveur par pause de frappe
      q('[data-act=filters]')?.addEventListener('click', () => { cs.showF = !cs.showF; refreshList(); });
      q('[data-act=reset]')?.addEventListener('click', () => { Object.assign(f, F0(), { sites: [], q: f.q }); upd(); });
      q('[data-act=sort]')?.addEventListener('click', (e) => GX.menu.open([['recent', 'Achat le plus récent'], ['nom', 'Nom A → Z'], ['fin', 'Échéance de financement la plus proche']].map(([k, l]) => ({ label: l, checked: f.sort === k, action: () => { f.sort = k; upd(); } })), e.currentTarget));
      q('[data-fsites]')?.addEventListener('click', (e) => GX.ui.sitePicker(e.currentTarget, f.sites, (v) => { f.sites = v; upd(); }, { variant: 'filter', entities: false, title: 'Site d’achat' }));
      q('[data-ffam]')?.addEventListener('click', (e) => GX.ui.pick(e.currentTarget, [{ items: famList.map((x) => ({ v: x, l: x, color: FAM_C[x] })) }], { title: 'Famille de financement', selected: f.fam, allLabel: 'Toutes', onChange: (v) => { f.fam = v; upd(); } }));
      q('[data-fech]')?.addEventListener('click', (e) => GX.ui.pick(e.currentTarget, [{ items: Object.entries(ECH).map(([v, l]) => ({ v, l })) }], { multi: false, title: 'Fin de financement', selected: [f.ech], onChange: ([v]) => { f.ech = v; if (v !== 'all' && v !== 'past') f.sort = 'fin'; upd(); } }));
      q('[data-fbrands]')?.addEventListener('change', (e) => { f.brands = e.detail; upd(); });
      q('[data-fkind]')?.addEventListener('change', (e) => { f.kind = e.detail; setTimeout(upd, 150); });
      q('[data-fvh]')?.addEventListener('change', (e) => { f.vh = e.detail; setTimeout(upd, 150); });
      q('[data-fsus]')?.addEventListener('change', (e) => { f.suspect = e.target.checked; upd(); });
      q('[data-fnplc]')?.addEventListener('change', (e) => { f.nplc = e.target.checked; upd(); });
      host.querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => { cs.page = Math.max(0, cs.page + +b.dataset.pg); cs.selId = null; refreshList(); host.querySelector('[data-items]')?.scrollTo(0, 0); if (!compact) refreshDetail(true); }));
      const items = q('[data-items]'); if (!items) return;
      items.addEventListener('click', (e) => { const it = e.target.closest('.crm-item'); if (!it) return; if (e.ctrlKey || e.metaKey) return fcb().openWindow(byId.get(it.dataset.id), it); select(it.dataset.id); });
      items.addEventListener('dblclick', (e) => { const it = e.target.closest('.crm-item'); if (it) fcb().openWindow(byId.get(it.dataset.id), it); });
      items.addEventListener('contextmenu', (e) => { const it = e.target.closest('.crm-item'); if (!it) return; e.preventDefault(); const c = byId.get(it.dataset.id);
        GX.menu.open([{ label: 'Ouvrir la fiche', action: () => select(c.id) }, { label: 'Ouvrir dans une nouvelle fenêtre', icon: 'copy', action: () => fcb().openWindow(c, it) }, '-', { label: 'Copier l’identifiant SPARK', icon: 'copy', action: () => GX.shell.hud(`${c.id} copié`) }], { x: e.clientX, y: e.clientY }); });
    }

    /* ---------------- File d'arbitrage ---------------- */
    function arbBuild() {
      vhost.innerHTML = `<div class="scroll" style="height:100%" data-arb></div>`; arbRender();
    }
    function arbRender(anim) {
      const host = vhost.querySelector('[data-arb]'); if (!host) return;
      const p = as.queue[as.idx];
      const side = (s, lbl) => `<div class="card crm-panel" style="gap:10px"><div class="row wrap">${vhPill(s.source)}<b>${esc(s.societe)}</b><span class="crm-mono faint">${s.numero}</span><span class="grow"></span><span class="crm-tag">${lbl}</span></div>
        <div style="font-weight:700;font-size:16px">${esc(s.civRaw)} ${esc(s.nom)} ${esc(s.prenom)}</div><div class="muted" style="font-size:13px">${esc(s.num)} ${esc(s.typeRue)} ${esc(s.rue)} · ${s.cp} ${esc(s.ville)}</div>
        <div class="row wrap" style="gap:6px">${brandChip(s.brand)}<span style="font-size:13px">${esc(s.veh)}</span></div><div class="crm-note">Dernière vente le ${dFR(s.date)} · ${esc(s.site)} · ${esc(s.vendeur)}</div></div>`;
      const cmp = p ? [
        ['Nom', p.a.nom, p.b.nom], ['Prénom', p.a.prenom, p.b.prenom], ['Code postal', p.a.cp, p.b.cp], ['Adresse', `${p.a.num} ${p.a.typeRue} ${p.a.rue}`, `${p.b.num} ${p.b.typeRue} ${p.b.rue}`],
        ['Portable', tel(p.a.portable) + (p.a.portSuspect ? ' ⚠' : ''), tel(p.b.portable) + (p.b.portSuspect ? ' ⚠' : ''), p.a.portSuspect], ['E-mail', p.a.email || '—', p.b.email || '—'], ['Véhicule', p.a.veh, p.b.veh], ['Identité DCS', `${p.a.source} · ${p.a.societe} · ${p.a.numero}`, `${p.b.source} · ${p.b.societe} · ${p.b.numero}`],
      ] : [];
      host.innerHTML = `<div class="crm-arb">
        <div class="crm-arbm" data-pair>${p ? `
          <div class="crm-arbh"><h2 class="crm-h2">Paire ${F.n(ARB_TOTAL0 - st.arbTotal + 1)} <span class="n">sur ${F.n(ARB_TOTAL0)}</span></h2><span class="grow"></span><span class="crm-note">Site : ${esc(p.site)}</span></div>
          <div class="crm-why">${GX.icon('info')}<div><b>Pourquoi cette paire ?</b> ${esc(p.why)}<div class="crm-note" style="margin-top:4px">Règle § 4.3 : proposé, jamais appliqué automatiquement. Votre décision est enregistrée et rejouée à chaque import.</div></div></div>
          <div class="grid2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">${side(p.a, 'Identité A')}${side(p.b, 'Identité B')}</div>
          <div class="card scroll"><table class="crm-cmp"><thead><tr><th>Champ</th><th>Identité A</th><th></th><th>Identité B</th></tr></thead><tbody>${cmp.map(([l, a, b, sus]) => { const eq = a === b; return `<tr class="${sus ? 'sus' : eq ? 'eq' : 'ne'}"><td>${l}</td><td class="v">${esc(a)}</td><td class="mk v">${sus ? `<span style="color:var(--danger)" data-tip="Coordonnée suspecte : ignorée pour rapprocher">${GX.icon('alert', 'sm')}</span>` : eq ? `<span style="color:var(--ok)">${GX.icon('check', 'sm')}</span>` : `<span style="color:var(--warn)" data-tip="Différent">≠</span>`}</td><td class="v">${esc(b)}</td></tr>`; }).join('')}</tbody></table></div>
          <div class="crm-acts"><span class="crm-note grow">Raccourcis : F fusionner · S séparer · P plus tard</span>
            <button class="btn" data-dec="later">${GX.icon('clock', 'sm')}Plus tard<span class="crm-kbd">P</span></button>
            <button class="btn" data-dec="split">${GX.icon('close', 'sm')}Séparer<span class="crm-kbd">S</span></button>
            <button class="btn primary" data-dec="merge">${GX.icon('check', 'sm')}Fusionner<span class="crm-kbd">F</span></button></div>`
          : `<div class="empty" style="padding:60px 20px">${GX.icon('check')}<b style="color:var(--text);font-size:15px">Plus rien dans cet échantillon</b><span class="crm-note">La vraie file en compte ${F.n(st.arbTotal)} ; elle se recharge par lots de 50.</span></div>`}</div>
        <aside class="crm-arbm">
          <div class="card crm-panel"><h3 class="crm-h2">À suivre <span class="n">${as.queue.length - as.idx - 1 > 0 ? as.queue.length - as.idx - 1 : 0}</span></h3><div class="crm-q">${as.queue.slice(as.idx + 1, as.idx + 7).map((x, k) => `<div class="list-row" data-jump="${as.idx + 1 + k}">${GX.icon('users', 'sm')}<span class="grow ellipsis"><b>${esc(x.a.nom)} ${esc(x.a.prenom)}</b> <span class="faint">· ${x.a.cp}</span></span>${vhPill(x.a.source)}${vhPill(x.b.source)}</div>`).join('') || '<div class="crm-note">—</div>'}</div></div>
          <div class="card crm-panel"><h3 class="crm-h2">Décisions de la session <span class="n">${as.done.length}</span></h3><div class="crm-q">${as.done.slice().reverse().slice(0, 8).map((d) => `<div class="list-row">${d.dec === 'merge' ? `<span style="color:var(--ok)">${GX.icon('check', 'sm')}</span>` : d.dec === 'split' ? `<span style="color:var(--warn)">${GX.icon('close', 'sm')}</span>` : `<span class="faint">${GX.icon('clock', 'sm')}</span>`}<span class="grow ellipsis">${esc(d.p.a.nom)} ${esc(d.p.a.prenom)} <span class="faint">· ${{ merge: 'fusionnés', split: 'séparés', later: 'reporté' }[d.dec]}</span></span><button class="crm-link" data-undo="${d.p.id}">Annuler</button></div>`).join('') || '<div class="crm-note">Aucune pour l’instant.</div>'}</div>
            <div class="crm-note">Fusion : le client le plus ancien garde son identifiant SPARK, l’autre est journalisé. Séparation : les deux ne seront plus proposés ensemble.</div></div>
        </aside></div>`;
      if (anim) { const el = host.querySelector('[data-pair]'); if (el) GX.animate(el, [{ opacity: 0, transform: 'translateX(18px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' }); }
      host.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => decide(b.dataset.dec)));
      host.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => { const j = +b.dataset.jump; const [x] = as.queue.splice(j, 1); as.queue.splice(as.idx, 0, x); arbRender(true); }));
      host.querySelectorAll('[data-undo]').forEach((b) => b.addEventListener('click', () => { const k = as.done.findIndex((d) => d.p.id === b.dataset.undo); if (k < 0) return; const [d] = as.done.splice(k, 1); as.queue.splice(as.idx, 0, d.p); if (d.dec !== 'later') st.arbTotal++; head(); arbRender(true); GX.shell.hud('Décision annulée'); }));
    }
    function decide(dec) {
      const p = as.queue[as.idx]; if (!p) return;
      as.queue.splice(as.idx, 1);
      if (dec === 'later') as.queue.push(p); else st.arbTotal--;
      as.done.push({ p, dec }); head();
      GX.shell.hud({ merge: 'Fusionnés · rejoué à chaque import', split: 'Séparés · ne seront plus proposés', later: 'Reporté en fin de file' }[dec]);
      arbRender(true);
    }

    /* ---------------- Imports (Master) ---------------- */
    function runsFor() { return RUNS.filter((x) => is.src === 'all' || x.source === is.src).sort((a, b) => b.id - a.id); }
    function runsHTML() {
      return `<div class="crm-list"><div style="padding:14px 16px 10px"><div class="seg" data-rsrc style="width:100%">${[['all', 'Toutes'], ['VN', 'VN'], ['VO', 'VO'], ['BSO', 'BSO']].map(([v, l]) => `<button data-v="${v}" aria-pressed="${is.src === v}" style="flex:1">${l}</button>`).join('')}</div></div>
        <div class="crm-runs scroll" style="flex:1;min-height:0">${runsFor().map((x) => { const s = RUN_ST[x.statut]; return `<div class="crm-run ${x.statut !== 'applique' ? 'ko' : ''} ${x.id === is.selId ? 'sel' : ''}" style="--c:${s.c}" data-rid="${x.id}">
          <div class="n">${vhPill(x.source)}<b class="num">n° ${x.id}</b><span class="faint ellipsis grow">${dFR(GX.iso(x.debut))} · ${hm(x.debut)}</span>${runBadge(x)}</div>
          <div class="s"><span class="grow ellipsis">${x.stats.lus ? `${F.n(x.stats.lus)} lignes` : 'fichier non lu'}${x.stats.ventes ? ` · +${F.n(x.stats.ventes.nouvelles)} ventes` : ''}</span><span class="num">${dur(x.duree)}</span></div></div>`; }).join('')}</div></div>`;
    }
    function runHTML(x) {
      if (!x) return `<div class="empty" style="height:100%">${GX.icon('upload')}Sélectionnez un import</div>`;
      const s = x.stats, S = RUN_ST[x.statut], prev = RUNS.filter((y) => y.source === x.source && y.id < x.id && y.statut === 'applique').sort((a, b) => b.id - a.id)[0];
      const ok = (b, l, h = '') => `<div><span style="color:${b === true ? 'var(--ok)' : b === false ? 'var(--danger)' : 'var(--text-3)'}">${GX.icon(b === true ? 'check' : b === false ? 'close' : 'minus', 'sm')}</span><span class="grow">${l}</span><span class="faint num" style="font-size:12.5px">${h}</span></div>`;
      const exTot = s.excl ? Object.values(s.excl).reduce((a, b) => a + b, 0) : 0;
      return `<div class="crm-rd">
        <div class="crm-crumb"><span class="c">Imports <span>/</span> <b>n° ${x.id}</b></span><div class="acts">${x.statut === 'refuse' && s.lus ? `<button class="btn" data-act="force" style="color:var(--warn)">${GX.icon('bolt', 'sm')}Appliquer quand même…</button>` : ''}</div></div>
        <div><div class="crm-eye">${x.source === 'BSO' ? 'Import unique · ancienne base Sud-Ouest' : `Requête ${x.source} du soir`}</div><h2 class="crm-name" style="font-size:22px">${esc(x.fichier)}</h2>
          <div class="crm-tags">${runBadge(x)}<span class="badge">${GX.icon('clock', 'sm')}reçu ${when(x.recu)}</span><span class="badge">traité de ${hm(x.debut)} à ${hm(x.fin)} · ${dur(x.duree)}</span><span class="badge crm-mono" data-tip="sha256 : un même fichier n’est jamais appliqué deux fois">${x.empreinte.slice(0, 12)}…</span></div></div>
        ${x.message ? `<div class="crm-msg" style="--c:${x.statut === 'applique' ? 'var(--info)' : S.c}">${GX.icon(x.statut === 'applique' ? 'info' : S.i)}<div>${esc(x.message)}</div></div>` : ''}
        <div class="crm-g2 eq">
          <div class="card crm-panel"><h3 class="crm-h2">Contrôles</h3><div class="crm-chk">
            ${ok(s.manque ? false : true, s.manque ? `En-têtes : colonne « ${esc(s.manque)} » absente` : `En-têtes reconnus par leur nom (${s.colonnes} colonnes${s.ignorees ? `, ${s.ignorees} ignorée${s.ignorees > 1 ? 's' : ''}` : ''})`)}
            ${x.source === 'BSO' ? ok(null, 'Ligne de total', 'absente dans ce fichier (normal)') : s.manque ? ok(null, 'Ligne de total', 'non vérifiée') : ok(s.totalLigne === s.lus, 'Ligne de total présente et égale au nombre de lignes', `${F.n(s.totalLigne)} = ${F.n(s.lus)}`)}
            ${x.source === 'BSO' || s.manque ? ok(null, 'Volume comparé à l’import précédent', '—') : ok(s.volume > -10, `Volume comparé à l’import n° ${prev?.id ?? '—'} (seuil −10 %)`, `${s.volume > 0 ? '+' : ''}${(+s.volume).toFixed(1).replace('.', ',')} %`)}
            ${ok(true, 'Empreinte inédite (fichier jamais appliqué)')}
            ${ok(x.statut === 'erreur' ? false : s.manque || x.statut === 'refuse' ? null : true, 'Écriture en base (transaction unique)', x.statut === 'erreur' ? 'annulée' : x.statut === 'refuse' ? 'non tentée' : 'validée')}
          </div></div>
          <div class="card crm-panel"><h3 class="crm-h2">Lignes du fichier</h3>${s.lus ? `<div class="crm-cnt"><div><span class="crm-lbl">Lues</span><b>${F.n(s.lus)}</b></div><div><span class="crm-lbl">Sans client</span><b>${F.n(s.sansClient)}</b></div><div><span class="crm-lbl">Exclues</span><b>${F.n(exTot)}</b></div><div><span class="crm-lbl">Retenues</span><b style="color:var(--ok)">${F.n(s.retenues)}</b></div></div>
            ${x.source === 'BSO' ? `<div class="crm-note">${F.n(s.vinDistincts)} VIN distincts, dont ${F.n(s.vinConnus)} déjà connus de DCS (rapprochés par VIN + nom). ${F.n(s.finBidon)} fins de financement au 01/01/1997 ignorées.</div>` : ''}` : '<div class="crm-note">Le fichier n’a pas été lu.</div>'}</div>
        </div>
        ${s.lus && s.excl ? `<div class="crm-g2 eq">
          <div class="card crm-panel"><h3 class="crm-h2">Exclusions par motif</h3>${GX.chart.hbars({ items: Object.entries(s.excl).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ label: l, value: v })), fmt: F.n })}<div class="crm-note">Motifs tirés de ref_type_vente et ref_affaire (R3, R11). Corrigeables sans toucher au code.</div></div>
          <div class="card crm-panel"><h3 class="crm-h2">Ce qui a changé</h3>${s.ventes ? `<div class="crm-cnt">
            <div><span class="crm-lbl">Ventes nouvelles</span><b style="color:var(--ok)">+${F.n(s.ventes.nouvelles)}</b></div><div><span class="crm-lbl">Ventes modifiées</span><b>${F.n(s.ventes.modifiees)}</b></div>
            <div><span class="crm-lbl">Ventes disparues</span><b style="${s.ventes.disparues ? 'color:var(--warn)' : ''}">${F.n(s.ventes.disparues)}</b></div><div><span class="crm-lbl">Identités nouvelles</span><b>+${F.n(s.identites.nouvelles)}</b></div>
            <div><span class="crm-lbl">Identités modifiées</span><b>${F.n(s.identites.modifiees)}</b></div><div><span class="crm-lbl">Véhicules nouveaux</span><b>+${F.n(s.vehicules)}</b></div>
            <div><span class="crm-lbl">Devenues suspectes</span><b>${F.n(s.suspects)}</b></div></div><div class="crm-note">Une vente disparue d’un import complet est marquée, jamais supprimée.</div>` : '<div class="crm-note">Rien n’a été écrit : transaction annulée.</div>'}</div></div>` : ''}
        ${s.aClasser?.length ? `<div class="card crm-panel"><h3 class="crm-h2">${GX.icon('pin', 'sm')} Sites à classer <span class="n">${s.aClasser.length}</span></h3>
          <div class="crm-note">Libellé de site inconnu : la vente est importée avec un site « à classer », jamais rejetée ni devinée. Classer ajoute la correspondance à ref_site_libelle ; elle s’applique dès le prochain import.</div>
          <div class="scroll"><table class="tbl"><thead><tr><th>Affaire / compte</th><th>Libellé DCS</th><th class="r">Lignes</th><th>Site Gearbox</th></tr></thead><tbody>${s.aClasser.map((a, k) => `<tr><td class="crm-mono">${esc(a.affaire)}</td><td><b>${esc(a.libelle)}</b></td><td class="r num">${F.n(a.n)}</td><td>${a.site ? `<span class="badge" style="--c:var(--ok)">${GX.icon('check', 'sm')}${esc(a.site)}</span>` : `<button class="btn sm" data-classer="${k}">${GX.icon('pin', 'sm')}Classer…</button>`}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
        <div class="crm-note">Fichier archivé 14 jours sur le VPS. La base de SPARK ne quitte jamais le VPS (R1).</div>
      </div>`;
    }
    function importsBuild() {
      if (compact) {
        stack = GX.ui.stack(vhost); listHost = stack.push('Imports', runsHTML(), { noHead: true }); wireRuns(listHost);
      } else {
        vhost.innerHTML = `<div class="split crm-split" style="--side-w:400px"><div class="side">${runsHTML()}</div><div class="main scroll crm-dhost" data-detail>${runHTML(RUNS.find((x) => x.id === is.selId))}</div></div>`;
        listHost = vhost.querySelector('.side'); wireRuns(listHost); wireRun(vhost.querySelector('[data-detail]'));
      }
    }
    function wireRuns(host) {
      host.querySelector('[data-rsrc]')?.addEventListener('change', (e) => { is.src = e.detail; setTimeout(() => { host.innerHTML = runsHTML(); wireRuns(host); }, 150); });
      host.querySelectorAll('[data-rid]').forEach((el) => el.addEventListener('click', () => {
        is.selId = +el.dataset.rid; const x = RUNS.find((y) => y.id === is.selId);
        if (compact) { const h = stack.push(`Import n° ${x.id}`, runHTML(x)); h.classList.add('crm-dhost'); return wireRun(h); }
        host.querySelectorAll('.crm-run').forEach((y) => y.classList.toggle('sel', +y.dataset.rid === is.selId));
        const d = vhost.querySelector('[data-detail]'); d.innerHTML = runHTML(x); d.scrollTop = 0; wireRun(d);
        GX.animate(d.firstElementChild, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
      }));
    }
    function wireRun(host) {
      const x = RUNS.find((y) => y.id === is.selId); if (!x) return;
      const re = () => { host.innerHTML = runHTML(x); wireRun(host); if (listHost && !compact) { listHost.innerHTML = runsHTML(); wireRuns(listHost); } };
      host.querySelectorAll('[data-classer]').forEach((b) => b.addEventListener('click', (e) => GX.ui.sitePicker(e.currentTarget, [], ([v]) => { if (!v) return; x.stats.aClasser[+b.dataset.classer].site = v; GX.ui.closePick(); GX.shell.hud(`Correspondance ajoutée : → ${v}`); re(); }, { variant: 'filter', multi: false, entities: true, title: 'Site Gearbox' })));
      host.querySelector('[data-act=force]')?.addEventListener('click', () => win.sheet(`<div class="row" style="gap:12px;color:var(--warn)">${GX.icon('alert', 'lg')}<h3 style="margin:0;color:var(--text)">Forcer l’application ?</h3></div>
        <div class="muted" style="margin-top:10px;line-height:1.55">${esc(x.message)}<br><br>Forcer applique ce fichier tel quel : <b style="color:var(--text)">les ventes absentes seront marquées « disparues »</b>. À ne faire que si la baisse est expliquée (requête modifiée volontairement, purge DCS…).</div>
        <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" style="background:var(--warn)">Appliquer quand même</button></div>`, { onClose: async (v) => {
          if (v !== 'ok') return; x.statut = 'en_cours'; re(); await delay(1200);
          x.statut = 'applique'; x.force = true; x.message = `Appliqué de force par Théo L. le ${dFR(TODAY)} malgré une baisse de volume de ${String(-x.stats.volume).replace('.', ',')} %.`;
          x.stats.ventes = { nouvelles: 4, modifiees: 61, disparues: 22648 }; x.stats.identites = { nouvelles: 1, modifiees: 12 }; re(); head();
          GX.shell.notify({ app: 'crm', title: `Import n° ${x.id} appliqué (forcé)`, body: '22 648 ventes marquées « disparues ».', silent: true });
        } }));
    }

    /* ---------------- Clavier, largeur, contexte ---------------- */
    body.addEventListener('keydown', (e) => {
      if (e.target.closest('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (st.view === 'arb') { const k = { f: 'merge', s: 'split', p: 'later' }[e.key.toLowerCase()]; if (k) { e.preventDefault(); decide(k); } return; }
      if (st.view === 'clients' && res && !compact) {
        const i = res.rows.findIndex((c) => c.id === cs.selId);
        if (e.key === 'ArrowDown') { e.preventDefault(); select(res.rows[Math.min(res.rows.length - 1, i + 1)]?.id); }
        if (e.key === 'ArrowUp') { e.preventDefault(); select(res.rows[Math.max(0, i - 1)]?.id); }
        if (e.key === '/') { e.preventDefault(); listHost?.querySelector('[data-q]')?.focus(); }
      }
    });
    body.tabIndex = -1;
    head();
    const stopW = GX.ui.watchWidth(body, 900, (c) => { compact = c; if (c) cs.showF = false; render(); });
    const off = [GX.on('ctx', () => {
      if (!GX.shell.canOpen('crm')) return;
      if (GX.ctx.perimetre !== lastPer) { cs.f.sites = perToCtx(); lastPer = GX.ctx.perimetre; }
      if (!views().some(([k]) => k === st.view)) st.view = 'home';
      head(); render();
    })];
    return {
      destroy: () => { stopW(); off.forEach((o) => o()); },
      command: (c) => { if (c === 'search') go('clients', { filters: {}, focus: true }); if (c === 'arbitrage') go('arb'); if (c === 'requeteur') go('req'); if (c?.startsWith?.('client:')) { cs.selId = c.slice(7); cs.autoSel = false; go('clients'); } },
      menus: () => ({
        'Fichier': [{ label: 'Rechercher un client', icon: 'search', kbd: '/', action: () => go('clients', { focus: true }) }, { label: 'Ouvrir la fiche dans une fenêtre', icon: 'copy', disabled: st.view !== 'clients' || !sel(), action: () => fcb().openWindow(sel()) }],
        'Présentation': [...views().map(([k, l]) => ({ label: l, checked: st.view === k, action: () => go(k) })), '-',
          { label: 'Clients : achat le plus récent d’abord', checked: cs.f.sort === 'recent', action: () => { cs.f.sort = 'recent'; go('clients'); } },
          { label: 'Clients : nom A → Z', checked: cs.f.sort === 'nom', action: () => { cs.f.sort = 'nom'; go('clients'); } },
          { label: 'Clients : échéance la plus proche', checked: cs.f.sort === 'fin', action: () => { cs.f.sort = 'fin'; go('clients'); } }],
      }),
    };
  }

  /* Fenêtre « fiche client » (comme la fenêtre de projet) */
  function mountDoc(body, win) {
    const c = byId.get(win.params.id), st = { tab: GX.store.get('crm.ftab', 'veh'), vf: 'all' };
    body.innerHTML = `<div class="app"><div class="app-body scroll crm-dhost" data-d style="height:100%"></div></div>`;
    const host = body.querySelector('[data-d]');
    const draw = () => { host.innerHTML = c ? ficheHTML(c, st, 'doc') : `<div class="empty">${GX.icon('users')}Fiche introuvable</div>`; wireFiche(host, c, st, win, { refresh: draw, openList: () => GX.wm.open('crm') }); if (c) win.setTitle(nameOf(c), 'Fiche client'); };
    draw();
    return { destroy() {} };
  }

  GX.registerApp({ id: 'crm', name: 'SPARK', icon: 'handshake', tint: ['#14b8a6', '#155e75'], size: [1340, 820], minSize: [360, 380], badge: () => 0, mount });
  GX.registerApp({ id: 'crm-client', name: 'Fiche client', icon: 'handshake', tint: ['#14b8a6', '#155e75'], size: [1080, 800], minSize: [360, 380], hidden: true, parent: 'crm', mount: mountDoc });
})();
