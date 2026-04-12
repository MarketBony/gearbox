
export type Site = 
  // PLAQUE CENTRE
  | 'Clermont' | 'Ussel' | 'Mozac' | 'Massagettes' 
  // PLAQUE NORD
  | 'Vichy' | 'Moulins' | 'Thiers' | 'Ambert' | 'Ricoux'
  // PLAQUE SUD
  | 'Issoire' | 'Brioude' | 'Mende' | 'Le Puy-en-Velay'
  // PLAQUE SUD-OUEST
  | 'Albi' | 'Rodez' | 'Millau' | 'Aurillac' | 'Figeac' | 'Gaillac' | 'Villefranche' | 'Carmaux' | 'Lavaur'
  // ENTITÉS NISSAN (sites géographiques Nissan uniquement)
  | 'Montluçon' | 'Saint-Etienne'
  // ENTITÉS SPÉCIFIQUES (buckets budgétaires)
  | 'Alpine' | 'Nissan';

export type PlaqueName = 'PLAQUE CENTRE' | 'PLAQUE NORD' | 'PLAQUE SUD' | 'PLAQUE SUD-OUEST';

export type ServiceType = 'VN' | 'VO' | 'APV' | 'PR' | 'Tous Services';

export type BrandType = 'Renault' | 'Dacia' | 'Alpine' | 'Nissan' | 'Mobilize' | 'Groupe';

export type ProjectType = 'Partenariat' | 'Expo/Salon' | 'Animation Co' | 'OP Clients' | 'Contenu' | 'Collaborateurs';

export type TaskChannel = '' | 'SMS' | 'E-mail' | 'GMB' | 'Radio' | 'Print' | 'Affichage' | 'Presse' | 'Street Market' | 'PLV';

export type TaskStatus = 'Todo' | 'InProgress' | 'Done' | 'Programmed' | 'Empty';

// --- AUTH TYPES ---
export type UserRole = 'Master' | 'Administrator' | 'Coordinator' | 'Digital Manager' | 'Guest';

export interface User {
  id: string;
  name: string;
  loginId: string;
  password?: string; // Optional when retrieving public profile, mandatory for auth check
  role: UserRole;
  avatarColor?: string; // Hex code for avatar background
}

export interface Task {
  id: string;
  name: string;
  channel: TaskChannel;
  cost: number;
  status: TaskStatus;
  assignedUserId?: string;
  // --- New Fields for Campaign Management ---
  volumetry?: number;
  openRate?: number;
  npaiRate?: number;
  stopRate?: number;
  clickRate?: number;
  codTxt?: string;
  billedAmount?: number;
}

export interface Project {
  id: string;
  name: string;
  site: string; // Primary display site or "Multi-sites"
  sites?: string[]; // List of all selected sites
  budgetDistribution?: Record<string, number>; // Site -> Percentage (0-100)
  service: ServiceType[];
  brands: BrandType[];
  projectType: ProjectType;
  status: 'Draft' | 'Active' | 'Done' | 'Archived';
  startDate: string;
  endDate: string;
  budgetPlanned: number;
  budgetActual: number;
  description: string;
  progress: number;
  tasks: Task[];
  assignedUsers?: string[];
}

export interface Campaign {
  id: string;
  name: string;
  site: Site | PlaqueName | 'GROUPE BONY';
  service: ServiceType[];
  type: 'Email' | 'SMS' | 'Digital' | 'Print' | 'Radio' | 'Event';
  startDate: string;
  endDate: string;
  budgetPlanned: number;
  status: 'Scheduled' | 'Running' | 'Completed';
  roi?: number;
}

// --- DIGITAL MODULE TYPES ---
export type SocialStatus = 'À venir' | 'En attente' | 'Non Validé' | 'Programmed' | 'Rédigé' | 'Abandonné' | 'Validé' | 'Publié';
// Changed to string to allow dynamic tags management
export type SocialNetwork = string; 
export type SocialTarget = 'Collaborateurs' | 'Internet';

export interface SocialPost {
  id: string;
  title: string;
  status: SocialStatus;
  date: string;
  targets: SocialTarget[];
  brands: BrandType[];
  service: ServiceType;
  networks: SocialNetwork[];
  concessions: string[]; // Can include sites, plaques or 'Groupe'
  mediaFiles: string[]; // Placeholders for now
  link: string;
  wording: string;
  lom: string;
  co2: string;
  archived: boolean;
}

export interface DigitalTags {
    networks: string[];
    co2: string[];
}

export interface Equipment {
  id: string;
  name: string;
  totalQuantity: number;
  category?: string;
}

export interface EquipmentBooking {
  id: string;
  equipmentId: string;
  quantity: number;
  startDate: string;
  endDate: string;
  site: Site | PlaqueName | 'GROUPE BONY';
  service: ServiceType;
  brand: BrandType;
  description: string;
}

export interface Expense {
  id: string;
  name: string;
  amount: number;
  date: string;
  site: Site;
  service: ServiceType;
  parentId?: string;
  category: string;
}

export interface FixedExpense {
  id: string;
  date: string;
  service: ServiceType;
  site: string;
  sites?: string[]; // List of all selected sites
  budgetDistribution?: Record<string, number>; // Site -> Percentage (0-100)
  comment: string;
  amount: number;
  brand?: BrandType; // Pour le routage budgétaire Alpine/Nissan
}

// --- CHAT TYPES ---
export interface ChatConversation {
  id: string;
  type: 'general' | 'private';
  participants: string[]; // userIds
  name?: string;
  pinnedBy: string[]; // userIds
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCounts: Record<string, number>; // userId -> count
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  content: string;
  type: 'text' | 'image';
  timestamp: string;
  edited: boolean;
  editedAt?: string;
  deleted: boolean;
  reactions: Record<string, string[]>; // emoji -> userId[]
  replyToId?: string;
}

// --- BUDGET FORECAST TYPES ---
export interface BudgetLine {
  site: Site;
  brands: BrandType[];
  // Stores 12 monthly values for each service
  entries: {
    VN: number[];
    VO: number[];
    PR: number[];
    APV: number[];
  };
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  action: string;
  entity: string;
  entityName: string;
  timestamp: string;
}

export interface IpcApi {
  loadData: (table: string) => Promise<any[]>;
  saveData: (table: string, data: any) => Promise<void>;
  importCrm: (filePath: string) => Promise<any>;
  onFileWatch: (callback: (file: any) => void) => void;
}

declare global {
  interface Window {
    electron?: IpcApi;
  }
}
