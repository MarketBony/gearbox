// =====================================================================
// GX.data — ADAPTATEUR : même API que maquettes/v2/js/data.js, remplie avec
// les VRAIES données de Gearbox (dataService, stores temps réel).
// ⚠️ Règles :
//  - aucune donnée fictive : tout vient du serveur (donc déjà CLOISONNÉ pour un
//    chef de site) ou des référentiels de constants.ts ;
//  - aucun calcul métier recopié : les montants de budget viennent de
//    `stats` = computeDashboardStats (le moteur du Dashboard) ; `routeItem` de la
//    maquette (routage simplifié) n'existe PAS ici ;
//  - les tables de COULEURS / libellés d'affichage sont celles de la maquette
//    (celles de constants.ts sont des classes Tailwind, inutilisables ici).
// Remplie et rafraîchie par <DataHub/> (DataHub.tsx), qui émet 'data' ensuite.
// =====================================================================
import {
  PLAQUES_STRUCTURE, SITES as K_SITES, ALPINE_SITES as K_ALPINE, NISSAN_SITES as K_NISSAN, PROJECT_TYPES as K_TYPES,
  TASK_CHANNELS, SOCIAL_NETWORKS, LOI_LOM_OPTIONS, DIGITAL_CONCESSIONS as K_CONCESSIONS, CONGES_TYPES,
  valeurJourConge, congeDecompteSolde, periodeCongesDe,
} from '../../constants';
import type { DashboardStats } from '../../services/dashboardStats';
import type { Project, SocialPost, FixedExpense, BudgetLine, User, Equipment, EquipmentBooking, CongeJour, CongeDroit, ChatConversation, ActivityLog } from '../../types';

// ---------------- Référentiels ----------------
export const PLAQUES: Record<string, string[]> = PLAQUES_STRUCTURE as any;
export const NISSAN_ONLY = (K_SITES as string[]).filter(s => !Object.values(PLAQUES).flat().includes(s));
export const SITES: string[] = K_SITES as string[];
export const plaqueOf = (s: string) => Object.keys(PLAQUES).find(p => PLAQUES[p].includes(s)) || 'SITES NISSAN';
export const ALPINE_SITES: string[] = K_ALPINE as string[];
export const NISSAN_SITES: string[] = K_NISSAN as string[];
export const BRANDS = [
  { id: 'Renault', c: 'var(--brand-renault)', hex: '#ffcc33' }, { id: 'Dacia', c: 'var(--brand-dacia)', hex: '#6a7551' },
  { id: 'Alpine', c: 'var(--brand-alpine)', hex: '#0055a4' }, { id: 'Nissan', c: 'var(--brand-nissan)', hex: '#c3002f' },
  { id: 'Mobilize', c: 'var(--brand-mobilize)', hex: '#7b3fe4' }, { id: 'Holding', c: 'var(--brand-holding)', hex: '#64748b', label: 'GROUPE BONY' },
];
export const SERVICES = ['VN', 'VO', 'APV', 'PR'];
export const SERVICE_COLOR: Record<string, string> = { VN: '#293f74', VO: '#f75632', APV: '#8f12ab', PR: '#22c3d6', 'Tous Services': '#8a8599', RH: '#34c77b' };
export const PROJECT_TYPES: string[] = K_TYPES as string[];
export const CHANNELS: string[] = TASK_CHANNELS as string[];
export const PROJECT_STATUS: Record<string, { l: string; c: string }> = { Draft: { l: 'Brouillon', c: 'var(--text-3)' }, Active: { l: 'Actif', c: 'var(--ok)' }, Done: { l: 'Terminé', c: 'var(--info)' }, Archived: { l: 'Archivé', c: 'var(--text-3)' } };
export const TASK_STATUS: Record<string, { l: string; c: string; w: number }> = { Empty: { l: 'Vierge', c: 'var(--text-3)', w: 0 }, Todo: { l: 'À faire', c: 'var(--info)', w: 0 }, InProgress: { l: 'En cours', c: 'var(--warn)', w: .5 }, Programmed: { l: 'Programmé', c: 'var(--bony-violet)', w: 1 }, Done: { l: 'Terminé', c: 'var(--ok)', w: 1 } };
// Statuts Digital : ids RÉELS (types.ts SocialStatus), couleurs de la maquette.
export const SOCIAL_STATUS: { id: string; c: string; solid?: boolean; strike?: boolean }[] = [
  { id: 'À venir', c: '#64748b' }, { id: 'Constructeur', c: '#22c3d6' }, { id: 'En attente', c: '#f59e0b' }, { id: 'Non Validé', c: '#ef4444' },
  { id: 'Rédigé', c: '#3b82f6' }, { id: 'Validé', c: '#10b981' }, { id: 'Programmed', c: '#8f12ab' }, { id: 'Publié', c: '#22c55e', solid: true }, { id: 'Abandonné', c: '#1f1d24', strike: true },
];
const NET_STYLE: Record<string, { icon: string; c: string }> = {
  Instagram: { icon: 'instagram', c: '#e1306c' }, 'Story Instagram': { icon: 'instagram', c: '#f77737' }, Facebook: { icon: 'facebook', c: '#1877f2' },
  'Story Facebook': { icon: 'facebook', c: '#4f9cf9' }, LinkedIn: { icon: 'linkedin', c: '#0a66c2' }, GMB: { icon: 'gmb', c: '#34a853' },
  TikTok: { icon: 'tiktok', c: '#ff0050' }, YouTube: { icon: 'youtube', c: '#ff0000' },
};
export const NETWORKS = (SOCIAL_NETWORKS as string[]).map(id => ({ id, ...(NET_STYLE[id] || { icon: 'globe', c: '#8a8599' }) }));
export const LOM: string[] = LOI_LOM_OPTIONS as string[];
export const DIGITAL_CONCESSIONS: string[] = K_CONCESSIONS;
export const LEAVE_TYPES = Object.entries(CONGES_TYPES).map(([id, t]) => ({ id, l: t.label, s: t.court, c: t.couleur }));
export const ROLES: Record<string, { l: string }> = {
  Master: { l: 'Master' }, Administrator: { l: 'Administrateur' }, Director: { l: 'Directeur' }, Coordinator: { l: 'Coordinateur' },
  'Digital Manager': { l: 'Digital Manager' }, Guest: { l: 'Invité' }, External: { l: 'Externe' }, 'Site Manager': { l: 'Chef de site' },
};

// ---------------- Formes de la maquette ----------------
export interface MUser { id: string; name: string; role: string; city: string; color: string; initials: string; birthdate: string; sites: string[]; online: boolean; photo?: string | null }
export interface MTask { id: string; name: string; provider: string; channel: string; status: string; assignee: string; cost: number; deadline: string; startDate: string; notes: string; volume?: number; openRate?: number; npai?: number; stop?: number; clickRate?: number; codTxt?: string; billed?: number }
export interface MProject { id: string; name: string; type: string; sites: string[]; brands: string[]; services: string[]; status: string; startDate: string; endDate: string; tasks: MTask[]; team: string[]; budgetPlanned: number; budgetActual: number; progress: number; description: string; proPlus: boolean; expertMode: boolean; alpineShare: number | null; nissanShare: number | null; distribution: Record<string, number> | null; files: { n: string; s: string }[]; raw: Project }
export interface MPost { id: string; title: string; date: string; status: string; service: string; brands: string[]; concessions: string[]; networks: string[]; archived: boolean; proPlus: boolean; raw: SocialPost }
export interface MConv { id: string; kind: 'general' | 'group' | 'dm'; name: string; members: string[]; unread: number; admins: string[]; pinned: boolean; muted: boolean; last?: string; lastAt?: number; raw: ChatConversation }

const initials = (name: string) => name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

export const mapUser = (u: User, online: boolean): MUser => ({
  id: u.id, name: u.name, role: u.role, city: (u as any).city || '', color: u.avatarColor || '#8a8599', initials: initials(u.name),
  birthdate: u.birthdate || '', sites: (u as any).sites || [], online,
});
export const mapProject = (p: Project): MProject => ({
  id: p.id, name: p.name, type: p.projectType, sites: p.sites && p.sites.length ? p.sites : [p.site], brands: p.brands || [], services: p.service || [],
  status: p.status, startDate: p.startDate, endDate: p.endDate,
  tasks: (p.tasks || []).map(t => ({
    id: t.id, name: t.name, provider: t.provider || '', channel: t.channel, status: t.status, assignee: t.assignedUserId || '', cost: t.cost || 0,
    deadline: t.deadline || '', startDate: t.startDate || '', notes: t.notes || '',
    volume: t.volumetry, openRate: t.openRate, npai: t.npaiRate, stop: t.stopRate, clickRate: t.clickRate, codTxt: t.codTxt, billed: t.billedAmount,
  })),
  team: p.assignedUsers || [], budgetPlanned: p.budgetPlanned || 0, budgetActual: p.budgetActual || 0, progress: p.progress || 0,
  description: p.description || '', proPlus: !!p.proPlus, expertMode: !!p.expertMode,
  alpineShare: p.alpineShare ?? null, nissanShare: p.nissanShare ?? null,
  distribution: p.budgetDistribution && Object.keys(p.budgetDistribution).length ? p.budgetDistribution : null, files: [], raw: p,
});
export const mapPost = (s: SocialPost): MPost => ({
  id: s.id, title: s.title, date: (s.date || '').slice(0, 10), status: s.status, service: (s as any).service || '', brands: s.brands || [],
  concessions: (s as any).concessions || [], networks: s.networks || [], archived: !!(s as any).archived, proPlus: !!(s as any).proPlus, raw: s,
});

// ---------------- L'objet GX.data ----------------
// ids d'APP de la maquette (hello, fixed…) — le pont les traduit en rubriques réelles.
const TAB_OF_ENTITY: Record<string, string> = { project: 'projects', post: 'digital', task: 'campaigns', 'fixed-expense': 'fixed', equipment: 'material', booking: 'material', user: 'settings' };

export function createData() {
  const D = {
    // référentiels
    PLAQUES, SITES, NISSAN_ONLY, ALPINE_SITES, NISSAN_SITES, plaqueOf, BRANDS, SERVICES, SERVICE_COLOR, PROJECT_TYPES, CHANNELS, PROJECT_STATUS, TASK_STATUS,
    SOCIAL_STATUS, NETWORKS, CO2: [] as string[], LOM, DIGITAL_CONCESSIONS, LEAVE_TYPES, ROLES,
    PROVIDERS: [] as string[],
    // état chargé (vide tant que DataHub n'a pas reçu la réponse)
    ready: false,
    ME: '',
    USERS: [] as MUser[],
    PROJECTS: [] as MProject[],
    POSTS: [] as MPost[],
    EXPENSES: [] as { id: string; date: string; sites: string[]; service: string; brands: string[]; comment: string; amount: number; annual: boolean; proPlus: boolean; raw: FixedExpense }[],
    BUDGET_LINES: [] as { id: string; plaque: string; brands: string[]; planned: Record<string, number[]>; raw: BudgetLine }[],
    EQUIPMENT: [] as { id: string; name: string; cat: string; qty: number; raw: Equipment }[],
    BOOKINGS: [] as { id: string; eq: string; qty: number; start: string; end: string; site: string; service: string; note: string; raw: EquipmentBooking }[],
    CONGES: [] as { u: string; date: string; type: string; demi: 'matin' | 'apres-midi' | null; ok: boolean; raw: CongeJour }[],
    CONGES_MEMBERS: [] as string[],
    CONGES_DROITS: {} as Record<string, number>,
    congesDroits: [] as CongeDroit[],
    periodStart: new Date(),
    CONVS: [] as MConv[],
    MESSAGES: {} as Record<string, { id: string; u: string; t: string; at: number; type: string; r: Record<string, string[]> }[]>,
    GAMES: { challenges: [] as { from: string; game: string; at: number }[], running: [] as any[], board: [] as any[] },
    FEED: [] as { id: string; u: string; a: string; o: string; app: string; at: number; unread: boolean; raw: ActivityLog }[],
    HELLO: { weather: null as any, forecast: [] as any[], track: null as any, rss: {} as Record<string, string[]> },
    /** Résultat de computeDashboardStats (réglages par défaut du Dashboard) — SEULE source des montants. */
    stats: null as DashboardStats | null,
    // accès
    user: (id: string): MUser => D.USERS.find(u => u.id === (id === 'me' ? D.ME : id)) || D.USERS.find(u => u.id === D.ME) || ({ id, name: '—', role: '', city: '', color: '#8a8599', initials: '?', birthdate: '', sites: [], online: false }),
    project: (id: string) => D.PROJECTS.find(p => p.id === id),
    brand: (id: string) => BRANDS.find(b => b.id === id),
    socialStatus: (id: string) => SOCIAL_STATUS.find(s => s.id === id) || SOCIAL_STATUS[0],
    network: (id: string) => NETWORKS.find(n => n.id === id),
    leave: (id: string) => LEAVE_TYPES.find(l => l.id === id),
    /** Montant engagé d'un projet : la valeur SERVEUR (somme des tâches, cf. handleUpdateProject). */
    projectActual: (p: MProject) => p.budgetActual,
    /** Avancement : la valeur SERVEUR `progress` (recalculée à chaque sauvegarde du projet). */
    projectProgress: (p: MProject) => p.progress,
    /** En retard : la liste du moteur du Dashboard (même règle que la carte « Projets en retard »). */
    projectLate: (p: MProject) => !!D.stats?.projetsEnRetard.some(x => x.id === p.id),
    /** ⚠️ N'existe pas dans Gearbox : le routage passe par constants.ts. Lire `stats`. */
    routeItem: (): never => { throw new Error('[ui2] routeItem est une simplification de la maquette : utiliser GX.data.stats (computeDashboardStats) ou constants.ts'); },
    tabOfEntity: (entity: string) => TAB_OF_ENTITY[entity] || 'dashboard',
    /** Congés : les portes uniques de constants.ts (solde = CP de la période juin→mai en cours). */
    leaveValue: (c: { raw: CongeJour }) => valeurJourConge(c.raw.type, c.raw.demi),
    leaveCountsCP: (c: { date: string; raw: CongeJour }) => congeDecompteSolde(c.raw.type) && periodeCongesDe(c.date) === periodeCongesDe(D.iso(new Date())),
    iso: (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  };
  return D;
}
export type GXData = ReturnType<typeof createData>;
