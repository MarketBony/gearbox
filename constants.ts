

import { Site, ServiceType, Project, PlaqueName, BrandType, ProjectType, TaskChannel, Task, BudgetLine, SocialStatus, SocialNetwork } from './types';

export const PLAQUES_STRUCTURE: Record<PlaqueName, Site[]> = {
  'PLAQUE CENTRE': ['Clermont', 'Ussel', 'Mozac', 'Massagettes'],
  'PLAQUE NORD': ['Vichy', 'Moulins', 'Thiers', 'Ambert', 'Ricoux'],
  'PLAQUE SUD': ['Issoire', 'Brioude', 'Mende', 'Le Puy-en-Velay'],
  'PLAQUE SUD-OUEST': ['Albi', 'Rodez', 'Millau', 'Aurillac', 'Figeac', 'Gaillac', 'Villefranche', 'Carmaux', 'Lavaur']
};

export const SITES: Site[] = [
    ...Object.values(PLAQUES_STRUCTURE).flat(),
    'Montluçon',
    'Saint-Etienne',
    // Alpine et Nissan sont des buckets budgétaires, pas des sites géographiques sélectionnables
];

// Sites où Alpine est présent (projets tagués Alpine → budget routé vers entité Alpine)
export const ALPINE_SITES: Site[] = ['Clermont', 'Le Puy-en-Velay', 'Vichy', 'Rodez'];

// Sites où Nissan est présent (projets tagués Nissan → budget routé vers entité Nissan)
export const NISSAN_SITES: Site[] = ['Clermont', 'Montluçon', 'Moulins', 'Le Puy-en-Velay', 'Saint-Etienne', 'Rodez', 'Albi', 'Aurillac'];

export const SERVICES: ServiceType[] = ['VN', 'VO', 'APV', 'PR', 'Tous Services'];

export const BRANDS: BrandType[] = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize', 'Holding'];

export const PROJECT_TYPES: ProjectType[] = ['Partenariat', 'Expo/Salon', 'Animation Co', 'OP Clients', 'Contenu', 'Collaborateurs'];

export const TASK_CHANNELS: TaskChannel[] = ['SMS', 'E-mail', 'GMB', 'Radio', 'Print', 'Affichage', 'Presse', 'Street Market', 'PLV', 'Traiteur', 'Audiovisuel', 'Mobilier', 'Lieu'];

export const SERVICE_COLORS: Record<ServiceType, string> = {
  VN: 'text-bony-blue border-bony-blue bg-bony-blue/10',
  VO: 'text-bony-orange border-bony-orange bg-bony-orange/10',
  APV: 'text-bony-violet border-bony-violet bg-bony-violet/10',
  PR: 'text-cyan-600 border-cyan-600 bg-cyan-600/10',
  'Tous Services': 'text-slate-500 border-slate-500 bg-slate-500/10',
};

// Simple visual colors for brands
// =====================================================================
// TAG HOLDING — règle métier non négociable (cf. CLAUDE.md)
//
// Un élément taggué Holding est TRACKÉ (il reste dans les listes, l'Agenda,
// l'Export) mais n'est imputé à AUCUN budget, quels que soient les sites
// sélectionnés. Le tag est aussi EXCLUSIF : le poser retire toute autre marque.
//
// Ne PAS confondre avec le périmètre 'GROUPE BONY' et ses clés de ventilation
// (DISTRIBUTION_GROUPE_BONY plus bas) : celles-ci répartissent légitimement un
// coût sur les concessions et n'ont rien à voir avec la Holding.
// =====================================================================
export const HOLDING_BRAND = 'Holding';

// Accepte aussi l'ancienne valeur 'Groupe' : le tag est stocké en base
// (Project.brands, FixedExpense.brands/brand sont des String[]) et une ligne
// écrite avant le renommage du 30/07/2026 doit rester exclue du budget. Sans cet
// alias, l'exclusion échouerait silencieusement sur les données existantes.
export const isHoldingBrand = (
  brands?: string[] | null,
  legacyBrand?: string | null
): boolean => {
  const all = [...(brands || []), ...(legacyBrand ? [legacyBrand] : [])];
  return all.includes(HOLDING_BRAND) || all.includes('Groupe');
};

// =====================================================================
// ROUTAGE BUDGÉTAIRE ALPINE / NISSAN — SOURCE UNIQUE DE VÉRITÉ
//
// Ces entités ne sont ni tout à fait des marques, ni tout à fait des sites, et
// cette ambiguïté a produit quatre bugs (voir BUGS-CONNUS.md du 03/08/2026) :
// `Budget.tsx` routait la dépense vers des buckets mais filtrait les lignes par
// égalité de nom, et `Dashboard.tsx` ne routait pas du tout. Chaque écran avait
// sa propre demi-logique. Tout passe désormais par les 3 fonctions ci-dessous.
//
// Asymétrie ASSUMÉE, elle reflète la réalité du groupe :
//   - **Alpine est par site** : 4 concessions, donc 4 enveloppes `Alpine-<site>`.
//     Il n'existe PAS d'entité « Alpine » globale — on l'obtient en croisant le
//     tag marque Alpine avec le périmètre.
//   - **Nissan est global** : une seule enveloppe `Nissan`, jamais ventilée par
//     site. Elle n'appartient à un périmètre que si `Nissan` y est explicitement
//     sélectionné, sinon on la compterait une fois par site éligible.
// =====================================================================

/** Site réel -> nom de la ligne de budget Alpine correspondante. */
export const ALPINE_BUCKETS: Record<string, string> = {
  'Clermont': 'Alpine-Clermont',
  'Vichy': 'Alpine-Vichy',
  'Le Puy-en-Velay': 'Alpine-Le Puy',
  'Rodez': 'Alpine-Rodez',
};

/** L'unique ligne de budget Nissan (globale, non ventilée). */
export const NISSAN_BUCKET = 'Nissan';

// Concessions dont le budget est porté par une autre : elles n'ont pas de ligne
// propre. Était recopié en dur dans deux blocs de Budget.tsx.
const SITE_ALIASES: Record<string, string> = {
  'Thiers': 'Ricoux',
  'Ambert': 'Ricoux',
  'Riom': 'Mozac',
};

/** Ramène un site saisi vers le site qui porte réellement son budget. */
export const resolveSiteAlias = (site: string): string => SITE_ALIASES[site] ?? site;

/**
 * Décompose une LIGNE DE BUDGET en (site réel, marque).
 * Sert à filtrer les enveloppes : `Alpine-Clermont` doit répondre à la fois au
 * périmètre « Clermont » et au tag marque « Alpine ».
 *
 *   'Alpine-Clermont' -> { siteReel: 'Clermont', marque: 'Alpine', global: false }
 *   'Nissan'          -> { siteReel: null,       marque: 'Nissan', global: true  }
 *   'Clermont'        -> { siteReel: 'Clermont', marque: null,     global: false }
 *
 * `marque: null` signifie Renault/Dacia/Mobilize — le compte d'exploitation
 * commun, qu'aucune de ces trois marques ne distingue (règle métier).
 */
export const resolveBudgetLine = (
  site: string
): { siteReel: string | null; marque: BrandType | null; global: boolean } => {
  if (site === NISSAN_BUCKET) return { siteReel: null, marque: 'Nissan', global: true };
  for (const [siteReel, bucket] of Object.entries(ALPINE_BUCKETS)) {
    if (site === bucket) return { siteReel, marque: 'Alpine', global: false };
  }
  return { siteReel: site, marque: null, global: false };
};

/**
 * Les trois marques qui partagent un seul compte d'exploitation (règle métier :
 * aucune distinction budgétaire entre elles).
 */
export const RDM_BRANDS: BrandType[] = ['Renault', 'Dacia', 'Mobilize'];

/** L'élément mélange-t-il une marque à budget propre et le compte RDM ? */
const hasRDM = (brands: string[]): boolean =>
  brands.some(b => (RDM_BRANDS as string[]).includes(b));

const clampPct = (v: number): number => Math.min(100, Math.max(0, v));

/**
 * Où imputer UNE PART de dépense (un site de la ventilation), selon les marques
 * de l'élément — et, pour les éléments mixtes, selon le curseur de répartition.
 *
 * Retourne une LISTE de destinations pondérées dont les ratios somment
 * TOUJOURS à 1. La conservation des montants est donc garantie par
 * construction, et non par la vigilance de l'appelant.
 *
 * ⚠️ Retourne toujours au moins une destination — jamais une liste vide. C'est
 * le correctif du défaut qui faisait disparaître 2 870 € : l'ancien code
 * abandonnait la part par un `return` silencieux dès qu'un élément tagué Alpine
 * portait une part sur un site non-Alpine. Une part non éligible reste
 * désormais sur son site.
 *
 * Deux règles, arrêtées avec Théo :
 *
 * 1. **Parts éligibles routées, reste sur les sites.** Un projet Nissan +
 *    Renault verse sa part Clermont au bucket Nissan et laisse sa part Vichy
 *    sur Vichy (Vichy n'est pas un site Nissan).
 * 2. **Curseur vide = tout sur la marque.** Sur un élément mixte
 *    (Alpine ou Nissan + RDM), `alpineShare` / `nissanShare` scinde la part
 *    entre le bucket marque et le site. Non renseigné, on garde le
 *    comportement historique : 100 % vers la marque. Activer les curseurs ne
 *    déplace donc aucun euro tant que personne ne les renseigne.
 *
 * Le curseur n'est lu que si une marque RDM est présente — même condition que
 * son affichage dans les formulaires. Une valeur restée en base après le
 * retrait du tag Renault ne peut ainsi pas scinder en douce un projet
 * Alpine pur.
 *
 * Alpine est évaluée avant Nissan : sur l'improbable Alpine + Nissan + Renault,
 * Alpine gagne et `nissanShare` est ignoré.
 */
export const splitShareToBuckets = (
  site: string,
  brands?: string[] | null,
  legacyBrand?: string | null,
  shares?: { alpineShare?: number | null; nissanShare?: number | null }
): Array<{ site: string; ratio: number }> => {
  const all = [...(brands || []), ...(legacyBrand ? [legacyBrand] : [])];
  const cible = resolveSiteAlias(site);

  const split = (bucket: string, pct: number | null | undefined) => {
    // Curseur vide (ou élément non mixte) : tout sur la marque, comme avant.
    // `Number.isFinite` couvre aussi NaN et ±Infinity : une valeur non finie
    // se propagerait sinon dans tous les totaux, qui afficheraient « NaN € ».
    if (pct === undefined || pct === null || !Number.isFinite(pct) || !hasRDM(all)) {
      return [{ site: bucket, ratio: 1 }];
    }
    const r = clampPct(pct) / 100;
    if (r >= 1) return [{ site: bucket, ratio: 1 }];
    if (r <= 0) return [{ site: cible, ratio: 1 }];
    return [
      { site: bucket, ratio: r },
      { site: cible, ratio: 1 - r },
    ];
  };

  if (all.includes('Alpine') && ALPINE_BUCKETS[cible]) {
    return split(ALPINE_BUCKETS[cible], shares?.alpineShare);
  }
  if (all.includes('Nissan') && (NISSAN_SITES as string[]).includes(cible)) {
    return split(NISSAN_BUCKET, shares?.nissanShare);
  }
  return [{ site: cible, ratio: 1 }];
};

export const BRAND_COLORS: Record<BrandType, string> = {
  Renault: 'bg-[#ffcc33] text-black border-[#ffcc33]', // Renault Yellow
  Dacia: 'bg-[#6a7551] text-white border-[#6a7551]', // Dacia Khaki
  Alpine: 'bg-[#0055a4] text-white border-[#0055a4]', // Alpine Blue
  Nissan: 'bg-[#c3002f] text-white border-[#c3002f]', // Nissan Red
  Mobilize: 'bg-purple-500 text-white border-purple-500', 
  Holding: 'bg-slate-700 text-white border-slate-600',
};

// --- DIGITAL CONSTANTS ---

export const SOCIAL_STATUS_COLORS: Record<SocialStatus, string> = {
    'À venir': 'bg-slate-700 text-slate-300 border-slate-600',
    'En attente': 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    'Non Validé': 'bg-red-500/20 text-red-400 border-red-500/50',
    'Rédigé': 'bg-blue-500/20 text-blue-300 border-blue-500/50',
    'Validé': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
    'Programmed': 'bg-purple-500/20 text-purple-300 border-purple-500/50', // Programmé
    'Publié': 'bg-green-500 text-black font-bold border-green-400',
    'Abandonné': 'bg-black/50 text-slate-600 border-slate-800 line-through',
};

export const SOCIAL_NETWORKS: SocialNetwork[] = ['Instagram', 'Story Instagram', 'Facebook', 'Story Facebook', 'LinkedIn', 'GMB', 'TikTok', 'YouTube'];

export const LOI_LOM_OPTIONS = [
    "Au quotidien, prenez les transports en commun #SeDéplacerMoinsPolluer",
    "Pensez à covoiturer #SeDéplacerMoinsPolluer",
    "Pour les trajets courts privilégiez la marche ou le vélo #SeDéplacerMoinsPolluer",
    "Non nécessaire"
];

export const CO2_OPTIONS = [
    "A110 - D153", "A290 - A0", "A390 - A0", "ARIYA - A0", "ARKANA - B108", "AUSTRAL - B107", 
    "BIGSTER - B105", "CAPTUR - B118", "CLIO - B120", "DUO - A0", "DUSTER - C122", 
    "ESPACE - B108", "JOGGER - B118", "JUKE - C136", "JUKE HYBRID - B111", "LEAF - A0", 
    "MEGANE - A0", "MICRA - A0", "NOUVELLE CLIO - A92", "QASHQAI e-POWER - B119", 
    "QASHQAI HYBRID - D144", "R4 - A0", "R5 - A0", "RAFALE - B108", "S01 - A0", 
    "S04 - A0", "SANDERO - C122", "SCENIC - A0", "SPRING - A0", "STEPWAY - B112", 
    "SYMBIOZ - A98", "TWINGO - A0", "X-TRAIL - D145", "X-TRAIL e-POWER - C133"
];

// --- INITIAL BUDGET DATA (FROM USER INPUT) ---
// Helper to fill array of 12
const fill12 = (val: number) => Array(12).fill(val);

export const INITIAL_BUDGET_SCENARIO: BudgetLine[] = [
    { site: 'Vichy', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(2092.76), VO: fill12(2635.76), PR: fill12(229.76), APV: fill12(728.76) } },
    { site: 'Moulins', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(2140), VO: fill12(1751), PR: fill12(157), APV: fill12(451) } },
    { site: 'Clermont', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(9650), VO: fill12(6074), PR: fill12(4205), APV: fill12(1462) } },
    // Mozac takes Riom's data
    { site: 'Mozac', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(1785), VO: fill12(1749), PR: fill12(124), APV: fill12(487) } },
    { site: 'Massagettes', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(978), VO: fill12(1388), PR: fill12(144), APV: fill12(184) } },
    { site: 'Ussel', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(735), VO: fill12(1355), PR: fill12(111), APV: fill12(138) } },
    { site: 'Issoire', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(1591), VO: fill12(2251), PR: fill12(57), APV: fill12(202) } },
    { site: 'Alpine', brands: ['Alpine'], entries: { VN: fill12(10000), VO: fill12(0), PR: fill12(0), APV: fill12(0) } },
    { site: 'Le Puy-en-Velay', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(2335.83), VO: fill12(2155.83), PR: fill12(249.83), APV: fill12(103.83) } },
    { site: 'Mende', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(623.71), VO: fill12(1346.71), PR: fill12(102.71), APV: fill12(119.71) } },
    { site: 'Albi', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(1429), VO: fill12(1690), PR: fill12(15), APV: fill12(381) } },
    { site: 'Rodez', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(1799), VO: fill12(2609), PR: fill12(203), APV: fill12(812) } },
    { site: 'Aurillac', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(1411), VO: fill12(1690), PR: fill12(15), APV: fill12(380) } },
    { site: 'Gaillac', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(687), VO: fill12(1039), PR: fill12(64), APV: fill12(37) } },
    { site: 'Millau', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(738), VO: fill12(1108), PR: fill12(114), APV: fill12(139) } },
    { site: 'Lavaur', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(-25), VO: fill12(725), PR: fill12(175), APV: fill12(80) } },
    { site: 'Villefranche', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(-62), VO: fill12(938), PR: fill12(138), APV: fill12(105) } },
    { site: 'Figeac', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(475), VO: fill12(845), PR: fill12(101), APV: fill12(-114) } },
    { site: 'Carmaux', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(-62), VO: fill12(1188), PR: fill12(138), APV: fill12(238) } },
    // Ricoux (covers Thiers + Ambert)
    { site: 'Ricoux', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(646.58), VO: fill12(1289.58), PR: fill12(45.58), APV: fill12(-77.42) } },
    { site: 'Nissan', brands: ['Nissan'], entries: { VN: fill12(2153), VO: fill12(1653), PR: fill12(-97), APV: fill12(-47) } },
    
    // Default 0 for Brioude (missing from user list)
    { site: 'Brioude', brands: ['Renault', 'Dacia', 'Mobilize'], entries: { VN: fill12(0), VO: fill12(0), PR: fill12(0), APV: fill12(0) } },
];


// --- DATA GENERATOR (DYNAMIC YEAR) ---

const generateMockData = (): Project[] => {
  const projects: Project[] = [];
  const currentYear = new Date().getFullYear();
  const baseDate = new Date(`${currentYear}-01-01`);

  const projectTemplates = [
    { name: 'Portes Ouvertes Janvier', type: 'OP Clients', service: ['VN', 'VO'], brands: ['Renault', 'Dacia'] },
    { name: 'Salon de l\'Habitat', type: 'Expo/Salon', service: ['VN'], brands: ['Renault'] },
    { name: 'Déstockage Hiver', type: 'Animation Co', service: ['VO'], brands: ['Holding'] },
    { name: 'Lancement Duster 3', type: 'OP Clients', service: ['VN'], brands: ['Dacia'] },
    { name: 'Foire de Cournon', type: 'Expo/Salon', service: ['VN', 'VO', 'APV'], brands: ['Holding'] },
    { name: 'Campagne Climatisation', type: 'Animation Co', service: ['APV'], brands: ['Renault', 'Dacia'] },
    { name: 'Ventes Privées', type: 'OP Clients', service: ['VN'], brands: ['Alpine'] },
    { name: 'Sponsoring Rugby', type: 'Partenariat', service: ['Tous Services'], brands: ['Holding'] },
    { name: 'Offre Pneus Été', type: 'Animation Co', service: ['APV', 'PR'], brands: ['Renault'] },
    { name: 'Roadshow Electrique', type: 'OP Clients', service: ['VN'], brands: ['Renault', 'Nissan'] },
    { name: 'Challenge Vendeurs', type: 'Collaborateurs', service: ['VN'], brands: ['Holding'] },
    { name: 'Rentrée Scolaire', type: 'Animation Co', service: ['VO'], brands: ['Dacia'] },
    { name: 'Portes Ouvertes Octobre', type: 'OP Clients', service: ['VN', 'VO'], brands: ['Renault', 'Dacia'] },
    { name: 'Contrôle Technique Offert', type: 'Animation Co', service: ['APV'], brands: ['Renault'] },
    { name: 'Marché de Noël', type: 'Partenariat', service: ['VN'], brands: ['Holding'] },
    { name: 'Campagne Distribution', type: 'Animation Co', service: ['APV'], brands: ['Dacia'] },
    { name: 'Black Friday VO', type: 'Animation Co', service: ['VO'], brands: ['Holding'] },
    { name: 'Lancement R5 E-Tech', type: 'OP Clients', service: ['VN'], brands: ['Renault'] },
    { name: 'Soirée Partenaires', type: 'Partenariat', service: ['Tous Services'], brands: ['Alpine'] },
    { name: 'Liquidation Stock Fin Année', type: 'Animation Co', service: ['VO'], brands: ['Holding'] },
    { name: 'Voeux', type: 'Contenu', service: ['Tous Services'], brands: ['Holding'] },
    { name: 'Campagne Freinage', type: 'Animation Co', service: ['APV'], brands: ['Renault', 'Dacia'] }
  ];

  projectTemplates.forEach((tpl, index) => {
    // Distribute dates across Current Year
    const startMonth = Math.floor(index / 2); // Roughly 2 projects per month
    const startDate = new Date(baseDate.getFullYear(), startMonth, Math.floor(Math.random() * 20) + 1);
    const endDate = new Date(startDate);
    // Random duration: some are 1 day, some are 15 days
    const duration = index % 5 === 0 ? 0 : 15; // Every 5th project is 1 day long
    endDate.setDate(startDate.getDate() + duration);

    // Format local date string YYYY-MM-DD
    const offset = startDate.getTimezoneOffset() * 60000;
    const sDateStr = new Date(startDate.getTime() - offset).toISOString().split('T')[0];
    const eDateStr = new Date(endDate.getTime() - offset).toISOString().split('T')[0];
    
    // Random Site
    const site = SITES[Math.floor(Math.random() * SITES.length)];
    
    // Generate Tasks
    const tasks: Task[] = [];
    const numTasks = Math.floor(Math.random() * 4) + 2; // 2 to 5 tasks

    for (let i = 0; i < numTasks; i++) {
        const isCampaign = Math.random() > 0.4;
        const channel: TaskChannel = isCampaign 
            ? (Math.random() > 0.5 ? 'SMS' : 'E-mail') 
            : (['Print', 'Radio', 'PLV', ''][Math.floor(Math.random() * 4)] as TaskChannel);
        
        const cost = Math.floor(Math.random() * 1500) + 200;
        
        let metrics = {};
        if (channel === 'SMS' || channel === 'E-mail') {
             const vol = Math.floor(Math.random() * 5000) + 500;
             const open = channel === 'E-mail' ? Math.floor(Math.random() * 40) + 10 : 95;
             const click = Math.floor(Math.random() * 10) + 1;
             metrics = {
                 volumetry: vol,
                 openRate: open,
                 npaiRate: Math.floor(Math.random() * 5),
                 stopRate: Math.floor(Math.random() * 2),
                 clickRate: click,
                 codTxt: `COD${Math.floor(Math.random() * 999)}`,
                 billedAmount: cost
             };
        }

        tasks.push({
            id: `t-${index}-${i}`,
            name: `${channel ? channel + ' - ' : ''}Action ${i+1}`,
            channel: channel,
            cost: cost,
            status: Math.random() > 0.3 ? 'Done' : 'Programmed',
            ...metrics
        });
    }

    const totalCost = tasks.reduce((sum, t) => sum + t.cost, 0);

    projects.push({
        id: `p-${index}`,
        name: tpl.name,
        site: site as Site,
        service: tpl.service as ServiceType[],
        brands: tpl.brands as BrandType[],
        projectType: tpl.type as ProjectType,
        status: index < 5 ? 'Done' : (index < 15 ? 'Active' : 'Draft'),
        startDate: sDateStr,
        endDate: eDateStr,
        budgetPlanned: totalCost * 1.2,
        budgetActual: totalCost,
        description: `Projet généré automatiquement pour ${tpl.name}.`,
        progress: index < 5 ? 100 : Math.floor(Math.random() * 80),
        tasks: tasks
    });
  });

  return projects;
};

export const MOCK_PROJECTS: Project[] = generateMockData();

// --- BUDGET DISTRIBUTION RULES ---

export const DISTRIBUTION_GROUPE_BONY: Record<string, number> = {
    // Centre 29%
    'Clermont': 29 * 0.71,
    'Mozac': 29 * 0.16,
    'Massagettes': 29 * 0.05,
    'Ussel': 29 * 0.08,
    
    // Nord
    'Vichy': 7,
    'Moulins': 5,
    'Ricoux': 4, // Thiers + Ambert

    // Sud
    'Issoire': 5,
    'Le Puy-en-Velay': 9 * 0.72,
    'Mende': 9 * 0.28,

    // Sud-Ouest 32%
    'Albi': 32 * 0.19,
    'Aurillac': 32 * 0.19,
    'Figeac': 32 * 0.08,
    'Villefranche': 32 * 0.05,
    'Millau': 32 * 0.07,
    'Rodez': 32 * 0.24,
    'Gaillac': 32 * 0.11,
    'Lavaur': 32 * 0.02,
    'Carmaux': 32 * 0.05,

    // Specific
    'Nissan': 9
};

export const DISTRIBUTION_GROUPE_BONY_RN: Record<string, number> = {
    // Centre 31.90%
    'Clermont': 31.90 * 0.71,
    'Mozac': 31.90 * 0.16,
    'Massagettes': 31.90 * 0.05,
    'Ussel': 31.90 * 0.08,

    // Nord
    'Vichy': 7.75,
    'Moulins': 5.10,
    'Ricoux': 4.66,

    // Sud
    'Issoire': 5.79,
    'Le Puy-en-Velay': 9.44 * 0.72,
    'Mende': 9.44 * 0.28,

    // Sud-Ouest 35.37%
    'Albi': 35.37 * 0.20,
    'Aurillac': 35.37 * 0.21,
    'Figeac': 35.37 * 0.09,
    'Millau': 35.37 * 0.07,
    'Rodez': 35.37 * 0.29,
    'Gaillac': 35.37 * 0.14
    // Note: Villefranche, Lavaur, Carmaux, Nissan not specified for RN
};

// ============================================================================
// ACCÈS AUX JEUX
//
// ⚠️ **Director en est EXCLU volontairement** : c'est la seule exception à la
// règle « Director = mêmes droits qu'Administrator » (cf. CLAUDE.md). Ce n'est
// pas un oubli — ne pas l'ajouter en croyant corriger une incohérence.
//
// Était dupliqué dans App.tsx ET pages/Games.tsx jusqu'au 05/08/2026 ; remonté
// ici pour n'avoir qu'une source, comme le reste des règles transverses.
// Doit rester aligné sur `GAMES_ROLES` de backend/src/auth/roles.ts, qui est le
// seul garde-fou réel : ici on ne fait que masquer une rubrique inaccessible.
// ============================================================================
export const GAMES_ALLOWED_ROLES: string[] = [
  'Master',
  'Administrator',
  'Coordinator',
  'Digital Manager',
];

// ============================================================================
// ÉQUIPE MARKETING — qui peut être RATTACHÉ à un projet ou à une tâche (06/08/2026)
//
// Sert à trois endroits de `pages/Projects.tsx` : le filtre « Utilisateur », le
// dropdown d'ajout à l'équipe d'un projet, et le sélecteur d'assigné d'une tâche.
// Avant, ces listes proposaient TOUS les comptes — y compris Guest, External et
// chef de site, qui n'ont rien à faire dans une équipe projet.
//
// ⚠️ **Director EST inclus**, contrairement à `GAMES_ALLOWED_ROLES` juste au-dessus.
// Ce n'est pas une incohérence : il édite et crée des projets, et `handleCreateProject`
// met automatiquement le créateur dans l'équipe — l'exclure aurait produit des équipes
// contenant quelqu'un d'inéligible dès la création. Arbitré avec Théo le 06/08/2026,
// données à l'appui (2 projets et 2 tâches concernés en base).
//
// ⚠️ **Liste d'AFFICHAGE, pas une règle de sécurité**, et c'est délibéré : il n'existe
// pas de contrôle serveur équivalent. En ajouter un rejetterait les projets existants
// à la sauvegarde (aucune migration des données n'a été faite), ce qui casserait
// l'édition de projets légitimes. C'est pourquoi il n'y a pas de jumeau dans
// `backend/src/auth/roles.ts` — l'absence est voulue, ne pas la « corriger ».
//
// ⚠️ Le contenu ressemble à celui des `EDIT_ROLES` de `routes/projects.ts` : c'est une
// COÏNCIDENCE de valeurs, pas la même règle (« qui peut éditer » ≠ « qui peut être
// rattaché »). Ne pas les aliaser l'une sur l'autre.
// ============================================================================
export const MARKETING_TEAM_ROLES: string[] = [
  'Master',
  'Administrator',
  'Director',
  'Coordinator',
  'Digital Manager',
];

export const isMarketingRole = (role?: string): boolean =>
  !!role && MARKETING_TEAM_ROLES.includes(role);

// ============================================================================
// RÔLE « CHEF DE SITE » (Site Manager) — 05/08/2026
//
// Premier rôle dont les droits dépendent d'une DONNÉE du compte (`user.sites`) et
// pas seulement de son nom. Consultation seule, cloisonné à ses concessions.
//
// ⚠️ Ce fichier ne fait que MASQUER : le garde-fou réel est côté serveur
// (`backend/src/auth/siteScope.ts` filtre les données, et l'absence du rôle dans
// tous les `EDIT_ROLES` interdit l'écriture). Ne jamais s'appuyer uniquement sur
// ces constantes pour protéger quoi que ce soit.
// ============================================================================
export const SITE_MANAGER_ROLE = 'Site Manager';
export const isSiteManager = (role?: string | null) => role === SITE_MANAGER_ROLE;

/** Rubriques accessibles à un chef de site. Liste FERMÉE, alignée sur le backend. */
export const SITE_MANAGER_SECTIONS: string[] = [
  'dashboard', 'projects', 'digital', 'hello-marketing', 'budget', 'agenda',
];

/**
 * Rôles qui n'ont aucune interaction avec l'équipe marketing : ni chat, ni jeux, ni
 * fil d'actualité, ni bulles de présence — ni les leurs, ni celles des autres.
 * Aligné sur `hasSocialFeatures` de backend/src/auth/roles.ts.
 */
export const hasSocialFeatures = (role?: string | null) => !isSiteManager(role);

/**
 * Périmètre imposé à l'utilisateur, ou `null` s'il voit tout.
 *
 * ⚠️ Renvoie un tableau VIDE pour un chef de site sans site rattaché — « ne voit
 * rien », jamais « voit tout ». Le défaut doit être fermé, comme côté serveur.
 * À utiliser pour BORNER les sélecteurs de périmètre : il peut filtrer **entre** ses
 * sites s'il en a plusieurs, jamais en dehors.
 */
export const allowedSitesFor = (user?: { role?: string | null; sites?: string[] } | null): string[] | null =>
  isSiteManager(user?.role) ? (user?.sites ?? []) : null;
