

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

export const BRANDS: BrandType[] = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize', 'Groupe'];

export const PROJECT_TYPES: ProjectType[] = ['Partenariat', 'Expo/Salon', 'Animation Co', 'OP Clients', 'Contenu', 'Collaborateurs'];

export const TASK_CHANNELS: TaskChannel[] = ['SMS', 'E-mail', 'GMB', 'Radio', 'Print', 'Affichage', 'Presse', 'Street Market', 'PLV'];

export const SERVICE_COLORS: Record<ServiceType, string> = {
  VN: 'text-bony-blue border-bony-blue bg-bony-blue/10',
  VO: 'text-bony-orange border-bony-orange bg-bony-orange/10',
  APV: 'text-bony-violet border-bony-violet bg-bony-violet/10',
  PR: 'text-cyan-600 border-cyan-600 bg-cyan-600/10',
  'Tous Services': 'text-slate-500 border-slate-500 bg-slate-500/10',
};

// Simple visual colors for brands
export const BRAND_COLORS: Record<BrandType, string> = {
  Renault: 'bg-[#ffcc33] text-black border-[#ffcc33]', // Renault Yellow
  Dacia: 'bg-[#6a7551] text-white border-[#6a7551]', // Dacia Khaki
  Alpine: 'bg-[#0055a4] text-white border-[#0055a4]', // Alpine Blue
  Nissan: 'bg-[#c3002f] text-white border-[#c3002f]', // Nissan Red
  Mobilize: 'bg-purple-500 text-white border-purple-500', 
  Groupe: 'bg-slate-700 text-white border-slate-600',
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
    { name: 'Déstockage Hiver', type: 'Animation Co', service: ['VO'], brands: ['Groupe'] },
    { name: 'Lancement Duster 3', type: 'OP Clients', service: ['VN'], brands: ['Dacia'] },
    { name: 'Foire de Cournon', type: 'Expo/Salon', service: ['VN', 'VO', 'APV'], brands: ['Groupe'] },
    { name: 'Campagne Climatisation', type: 'Animation Co', service: ['APV'], brands: ['Renault', 'Dacia'] },
    { name: 'Ventes Privées', type: 'OP Clients', service: ['VN'], brands: ['Alpine'] },
    { name: 'Sponsoring Rugby', type: 'Partenariat', service: ['Tous Services'], brands: ['Groupe'] },
    { name: 'Offre Pneus Été', type: 'Animation Co', service: ['APV', 'PR'], brands: ['Renault'] },
    { name: 'Roadshow Electrique', type: 'OP Clients', service: ['VN'], brands: ['Renault', 'Nissan'] },
    { name: 'Challenge Vendeurs', type: 'Collaborateurs', service: ['VN'], brands: ['Groupe'] },
    { name: 'Rentrée Scolaire', type: 'Animation Co', service: ['VO'], brands: ['Dacia'] },
    { name: 'Portes Ouvertes Octobre', type: 'OP Clients', service: ['VN', 'VO'], brands: ['Renault', 'Dacia'] },
    { name: 'Contrôle Technique Offert', type: 'Animation Co', service: ['APV'], brands: ['Renault'] },
    { name: 'Marché de Noël', type: 'Partenariat', service: ['VN'], brands: ['Groupe'] },
    { name: 'Campagne Distribution', type: 'Animation Co', service: ['APV'], brands: ['Dacia'] },
    { name: 'Black Friday VO', type: 'Animation Co', service: ['VO'], brands: ['Groupe'] },
    { name: 'Lancement R5 E-Tech', type: 'OP Clients', service: ['VN'], brands: ['Renault'] },
    { name: 'Soirée Partenaires', type: 'Partenariat', service: ['Tous Services'], brands: ['Alpine'] },
    { name: 'Liquidation Stock Fin Année', type: 'Animation Co', service: ['VO'], brands: ['Groupe'] },
    { name: 'Voeux', type: 'Contenu', service: ['Tous Services'], brands: ['Groupe'] },
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
