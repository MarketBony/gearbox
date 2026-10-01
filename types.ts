
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

// 'Holding' (anciennement 'Groupe', renommé le 30/07/2026) est un tag EXCLUSIF :
// quand il est posé, aucune autre marque ne peut l'être, et l'élément n'entre dans
// AUCUN budget quels que soient ses sites (voir isHoldingBrand dans constants.ts).
// À ne pas confondre avec le périmètre 'GROUPE BONY' et ses clés de ventilation.
export type BrandType = 'Renault' | 'Dacia' | 'Alpine' | 'Nissan' | 'Mobilize' | 'Holding';

export type ProjectType = 'Partenariat' | 'Expo/Salon' | 'Animation Co' | 'OP Clients' | 'Contenu' | 'Collaborateurs';

export type TaskChannel = '' | 'SMS' | 'E-mail' | 'GMB' | 'Radio' | 'Print' | 'Affichage' | 'Presse' | 'Street Market' | 'PLV' | 'Traiteur' | 'Audiovisuel' | 'Mobilier' | 'Lieu';

export type TaskStatus = 'Todo' | 'InProgress' | 'Done' | 'Programmed' | 'Empty';

// --- AUTH TYPES ---
// ⚠️ 'Site Manager' (chef de site) est le premier rôle dont les droits dépendent d'une
// DONNÉE du compte (`sites` ci-dessous) et pas seulement de son nom : lecture seule,
// cloisonné à ses concessions. Voir SITE_MANAGER_SECTIONS dans constants.ts et
// backend/src/auth/siteScope.ts, qui est le garde-fou réel.
export type UserRole = 'Master' | 'Administrator' | 'Director' | 'Coordinator' | 'Digital Manager' | 'Guest' | 'External' | 'Site Manager';

export interface User {
  id: string;
  name: string;
  loginId: string;
  password?: string; // Optional when retrieving public profile, mandatory for auth check
  role: UserRole;
  avatarColor?: string; // Hex code for avatar background
  avatarUrl?: string; // URL relative de la photo de profil uploadée (/uploads/avatar/...)
  // Date de naissance 'YYYY-MM-DD'. Donnée SERVEUR depuis le 04/08/2026 : elle vivait
  // en localStorage, ce qui la rendait invisible de tous les autres postes. À ne pas
  // confondre avec la ville, qui reste une préférence locale (météo de son poste).
  birthdate?: string;
  /**
   * Fond de discussion du Chat. `proc:<id>` (catalogue de `lib/personnalisationChat.ts`) ou
   * `/uploads/chatbg/<uuid>.<ext>` (image importée). Absent/`null` = fond par défaut.
   * Donnée SERVEUR : elle suit l'utilisateur d'un appareil à l'autre, contrairement au
   * thème clair/sombre qui reste une préférence du poste.
   */
  chatBackground?: string | null;
  /** Couleur des bulles de mes messages : un id du catalogue, ou absent pour le défaut. */
  chatBubble?: string | null;
  // Périmètre du rôle « Site Manager » : les concessions auxquelles il est rattaché.
  // Vide ou absent pour tous les autres rôles, qui voient l'ensemble.
  // ⚠️ Liste vide = ne voit RIEN (fail closed), jamais « voit tout ».
  sites?: string[];
}

export interface Task {
  id: string;
  name: string;
  provider?: string; // Prestataire (texte libre, optionnel — tâches existantes sans ce champ = undefined)
  channel: TaskChannel;
  cost: number;
  status: TaskStatus;
  assignedUserId?: string;
  // --- Tâches AUTONOMES (créées depuis la To-do, sans projet) ---
  // Une tâche de PROJET hérite ces informations de son projet et laisse ces champs
  // vides ; une tâche autonome n'a aucun projet dont hériter, elle les porte donc
  // elle-même. `projectId` absent/null = tâche autonome.
  // Pas de budget sur une tâche autonome : `cost` y vaut toujours 0.
  projectId?: string | null;
  deadline?: string;      // 'yyyy-MM-dd'
  // --- MODE EXPERT (27/08/2026) ---
  // Saisis dans le mode Expert d'un projet, et lus NULLE PART ailleurs : ni To-do, ni
  // Agenda, ni Campagnes, ni Export. `startDate` est ce qui permet au Gantt de tracer
  // une vraie barre ; sans elle, la tâche se rend en jalon sur son échéance.
  startDate?: string | null;   // 'yyyy-MM-dd'
  notes?: string | null;
  sites?: string[];
  brands?: BrandType[];
  service?: ServiceType[];
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
  proPlus?: boolean; // PRO+ (B2B) — optionnel, absent/false = non-PRO+ (fallback)
  // Curseurs de répartition pour les projets mixtes (marque à budget propre +
  // Renault/Dacia/Mobilize). Non renseigné = 100 % vers la marque, cf.
  // `splitShareToBuckets` dans constants.ts.
  alpineShare?: number; // % Alpine vs RDM (0-100)
  nissanShare?: number; // % Nissan vs RDM (0-100)
  // ⚠️⚠️ NE PAS CONFONDRE avec `proPlus` plus haut, qui n'a AUCUN rapport :
  //  - `proPlus`    = PRO+ (B2B), marqueur MÉTIER, pilote un filtre du Dashboard, du
  //                   Budget et de l'Export. Il change des CHIFFRES.
  //  - `expertMode` = mode Expert, marqueur d'INTERFACE, débloque KPI / Gantt /
  //                   fichiers / notes sur ce projet. Il ne change AUCUN montant et
  //                   n'entre dans aucune agrégation.
  // C'est pour éviter cette collision que le mode ne s'appelle pas « PRO ».
  expertMode?: boolean;
}

/**
 * Fichier déposé dans le mode Expert. `taskId` renseigné = fichier d'une TÂCHE,
 * `taskId` absent = fichier du PROJET — un seul type pour les deux, comme en base.
 * Le disque ne porte qu'un uuid : `fileName` est le nom d'origine, seul affichable.
 */
export interface ProjectFile {
  id: string;
  projectId: string;
  taskId?: string | null;
  url: string;
  fileName: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: string;
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
export type SocialStatus = 'À venir' | 'Constructeur' | 'En attente' | 'Non Validé' | 'Programmed' | 'Rédigé' | 'Abandonné' | 'Validé' | 'Publié';
// Changed to string to allow dynamic tags management
export type SocialNetwork = string; 
export type SocialTarget = 'Collaborateurs' | 'Internet';

// ⚠️ `RH` n'existe QUE dans le Digital, et c'est volontaire.
// `ServiceType` / `SERVICES` (VN, VO, APV, PR, Tous Services) pilotent le routage
// budgétaire (`resolveBudgetLine`) et sont partagés par les Projets, le Budget, les
// Dépenses fixes, l'Agenda, la To-do et l'Export : y ajouter `RH` ouvrirait une
// cinquième colonne dans tout le Budget et une ligne d'enveloppe qui n'existe pas,
// pour un besoin purement éditorial. On élargit donc ICI seulement.
// `SocialPost.service` est un `String` libre en base (schema.prisma) → aucune migration.
export type SocialServiceType = ServiceType | 'RH';

export interface SocialPost {
  id: string;
  title: string;
  status: SocialStatus;
  date: string;
  targets: SocialTarget[];
  brands: BrandType[];
  service: SocialServiceType; // ⚠️ au SINGULIER, contrairement à Project.service qui est un tableau
  networks: SocialNetwork[];
  concessions: string[]; // Sites, plaques ou 'GROUPE BONY' — périmètres, PAS des marques
  // Deux formes, disjointes : `/uploads/calendar/<uuid>.<ext>` pour un fichier déposé
  // dans Gearbox, `https://…` pour un lien externe (WeTransfer, SharePoint, Drive…).
  // Validé côté serveur par `validerMediaFiles` (backend/src/routes/social.ts) ; les
  // purges ne touchent QUE les urls `/uploads/calendar/`, un lien n'est jamais purgé.
  mediaFiles: string[];
  // Noms d'origine des visuels, tableau PARALLÈLE à `mediaFiles` (même longueur, même
  // ordre — l'index fait le lien). Vide sur les publications antérieures au correctif 49 :
  // l'écran retombe alors sur le nom uuid du fichier. Recalé par le serveur, seule porte.
  mediaNames?: string[];
  /**
   * Nombre de commentaires — DÉRIVÉ, renvoyé par `GET /api/social`, jamais stocké.
   * ⚠️ Il repart au serveur à chaque sauvegarde (le client renvoie la publication
   * entière) : c'est la liste blanche `SOCIAL_FIELDS` de `routes/social.ts` qui l'écarte.
   */
  commentCount?: number;
  link: string;
  wording: string;
  lom: string;
  /** ⚠️ Hérité : première valeur de `co2s`, recalculée par le serveur. Ne plus l'écrire. */
  co2: string;
  /** Classes CO² — plusieurs par publication depuis le 24/09/2026 (correctif 58). */
  co2s: string[];
  /** Marqueur PRO+ (B2B), affichage seul — le Digital n'a pas de budget. */
  proPlus?: boolean;
  archived: boolean;
  archivedAt?: string; // Renseigné par le backend à l'archivage ; ancre la purge des médias
}

/**
 * Un commentaire d'une publication du calendrier éditorial (correctif 50).
 *
 * ⚠️ Ni nom ni couleur d'auteur : `authorId` seul, l'identité se résout à l'affichage
 * depuis la liste des utilisateurs. Recopier le nom laisserait une valeur périmée dans
 * tout l'historique après un renommage — c'est la leçon des parties de jeu (correctif 30).
 */
export interface SocialComment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: string;
  /**
   * Identité résolue par le SERVEUR à la lecture (jamais stockée sur le commentaire).
   * ⚠️ C'est le serveur qui la résout, et non l'écran : un rôle cloisonné ne reçoit de
   * `GET /api/users` que sa propre fiche, il lirait sinon « Utilisateur » partout.
   * `null` si le compte a été supprimé depuis.
   */
  author?: { id: string; name: string; avatarColor?: string } | null;
}

// Flux RSS de Hello Marketing. Les URL vivent UNIQUEMENT côté serveur
// (backend/src/routes/feeds.ts) : le client ne manipule qu'une clé, ce qui évite
// tout détournement du proxy et permet de réparer un flux mort en redéployant
// `api` seule, sans toucher au frontend.
export interface FeedInfo {
  key: string;
  name: string;
  color: string;                        // classe Tailwind du badge
  category: 'auto' | 'marketing';
}

export interface DigitalTags {
    networks: string[];
    co2: string[];
    // ⚠️ Mentions Loi LOM, éditables depuis « Gestion des TAGS » au correctif 49.
    // Troisième et DERNIÈRE catégorie ouverte : `networks`, `co2` et `lom` sont les seuls
    // champs de `SocialPost` typés `String` LIBRE. Marques, services, statuts et sites
    // sont adossés à des types de ce fichier et pilotent des tests métier — les ouvrir
    // supprimerait la garantie de compilation sans validation serveur pour la remplacer.
    lom: string[];
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

// Pas d'interface pour les dépenses ponctuelles : elles se saisissent comme une
// `FixedExpense` avec `isAnnual = false` (montant imputé sur le seul mois de sa
// date). Le modèle Prisma `OneOffExpense` et la route /api/expenses existent
// encore mais sont DORMANTS — ne pas les rebrancher sans en discuter, ce serait
// un second chemin plus pauvre vers un besoin déjà couvert.
// L'ancienne interface `Expense` (name/category/parentId, ère localStorage) a été
// supprimée le 29/07/2026 : aucun code ne l'utilisait et sa forme divergeait.

export interface FixedExpense {
  id: string;
  date: string;
  service: ServiceType;
  site: string;
  sites?: string[]; // List of all selected sites
  budgetDistribution?: Record<string, number>; // Site -> Percentage (0-100)
  comment: string;
  amount: number;
  brand?: BrandType; // Pour le routage budgétaire Alpine/Nissan (legacy — premier élément de brands)
  brands?: BrandType[]; // Multi-sélection marques pour le routage budgétaire
  proPlus?: boolean; // PRO+ (B2B) — optionnel, absent/false = non-PRO+ (fallback)
  isAnnual?: boolean; // Dépense annuelle : montant total sur l'année, fractionné sur 12 mois UNIQUEMENT à l'agrégation Budget (jamais stocké dupliqué). Absent/false = mensuelle (comportement inchangé).
  // Curseurs de répartition pour les dépenses mixtes — mêmes règles que Project.
  alpineShare?: number; // % Alpine vs RDM (0-100)
  nissanShare?: number; // % Nissan vs RDM (0-100)
}

// --- CHAT TYPES ---
export interface ChatConversation {
  id: string;
  type: 'general' | 'private' | 'group';
  participants: string[]; // userIds
  adminIds?: string[];    // group admins (group type only)
  name?: string;
  // Photo du groupe : URL relative servie par le backend (/uploads/avatar/...).
  // La source de vérité est la BASE, comme `mutedBy` et contrairement à `pinnedBy` :
  // c'est ce qui la rend visible de TOUS les participants. Avant le 06/08/2026 elle
  // vivait en base64 dans le localStorage, donc visible du seul poste qui l'avait
  // déposée. absent/null = pas de photo.
  avatarUrl?: string | null;
  pinnedBy: string[]; // userIds — overlay localStorage, JAMAIS écrit en base
  // userIds ayant mis la conversation en sourdine. Contrairement à `pinnedBy`,
  // la source de vérité est la BASE : c'est le serveur qui décide d'envoyer les
  // notifications push. Coupe le push, pas le compteur non-lu.
  mutedBy?: string[];
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCounts: Record<string, number>; // userId -> count
  // THÈME PARTAGÉ (24/09/2026) : vu par tous les membres, écrit par
  // `chat:conversation:theme`. Jamais renseigné sur le Chat Général (inviolable).
  background?: string | null;
  bubble?: string | null;
  // Accusés de lecture : userId -> date ISO (horloge serveur) du dernier passage.
  readAt?: Record<string, string>;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  content: string;
  // ⚠️ Doit rester aligné sur `TYPES_CONNUS` de `backend/src/realtime/chat.ts` :
  // un type absent de la liste SERVEUR est stocké et affiché comme du texte, sans
  // erreur. 'project' : `content` porte l'id du projet cité.
  // 'audio' : message vocal. `content` = URL du fichier, `fileName` = DURÉE
  // formatée (« 0:12 ») — le modèle n'a pas de champ de durée.
  type: 'text' | 'image' | 'file' | 'project' | 'audio';
  timestamp: string;
  edited: boolean;
  editedAt?: string;
  deleted: boolean;
  reactions: Record<string, string[]>; // emoji -> userId[]
  replyToId?: string;
  // --- Pièces jointes (05/08/2026) ---
  // Le fichier sur disque porte un uuid : `fileName` est le nom d'origine, nécessaire
  // à l'affichage et au téléchargement. `fileExpiredAt` est posé par la purge à
  // 180 jours — le message reste, seule la pièce jointe a disparu.
  fileName?: string;
  fileSize?: number;
  fileExpiredAt?: string;
}

// --- STOCKAGE (GET /api/storage) ---
// Espace consommé par Gearbox et espace disque du serveur. Lisible par tous les rôles.
// --- POST-IT (01/10/2026) — agenda PERSONNEL de la To-do (GET /api/postits) ---
// Lu par son seul auteur, connecté à rien d'autre. Dates en TEXTE LOCAL :
// créneau 'YYYY-MM-DDTHH:mm' (fin exclusive) ; journée entière 'YYYY-MM-DD' (fin inclusive).
export type PostItColor = 'yellow' | 'peach' | 'pink' | 'lavender' | 'sky' | 'mint' | 'lime' | 'slate';
export interface PostIt {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color: PostItColor;
  createdAt?: string;
  updatedAt?: string;
}

// --- FORMS (01/10/2026) — Google Forms par le compte partagé (routes /api/forms, FORMS_ROLES) ---
export interface GoogleStatus {
  configured: boolean;          // variables GOOGLE_* présentes sur le serveur
  connected: boolean;
  email: string | null;         // compte Google connecté (doit être marketbony@gmail.com)
  connectedAt: string | null;
  connectedBy: string | null;   // nom du Master qui a connecté
  lastError: string | null;     // ex. accès révoqué : reconnexion nécessaire
  canConnect: boolean;          // Master
}
/** Formulaire du catalogue Gearbox (sans la structure). */
export interface GForm {
  id: string;
  formId: string;               // identifiant Google
  title: string;
  description: string | null;
  responderUri: string | null;  // lien à partager (formulaire à remplir)
  isPublished: boolean;
  acceptingResponses: boolean;
  revisionId: string | null;
  responseCount: number;
  lastResponseAt: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
  lastEditedBy?: string | null; // userId de la dernière modification faite depuis Gearbox
  lastEditedAt?: string | null;
}
/** Entrée du journal Gearbox d'un formulaire (qui a modifié quoi, depuis Gearbox). */
export interface GFormLog { id: string; action: string; detail: string | null; at: string; user: string }
/** Réponse en cache : `answers` = objet brut de l'API Google (questionId → réponse). */
export interface GFormResponse { id: string; submittedAt: string; respondentEmail: string | null; answers: Record<string, any> }
export interface GFormDetail { form: GForm & { structure: { items: any[]; settings: any } | null }; responses: GFormResponse[] }

export interface StorageInfo {
  disque: { total: number; libre: number; utilise: number };
  uploads: {
    total: number;
    parType: Record<'chat' | 'avatar' | 'calendar', { octets: number; fichiers: number }>;
  };
  calculeLe: string;
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
  entityId?: string;
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

// --- CONGÉS (12/09/2026) ---
//
// ⚠️ La FAMILLE ne porte plus la demi-journée (12/09/2026). Les codes 'CPAM'/'CPAPM' du
// correctif 54 mélangeaient les deux notions : ajouter « HR matin » et « congé sans solde »
// aurait demandé 'HRAM', 'HRAPM', 'CSSAM'… Toute famille peut désormais être posée en
// demi-journée, via `demi`.
export type CongeType = 'CP' | 'RTT' | 'HR' | 'CSS' | 'CR';

/** Demi-journée. `null` = jour entier, seule valeur qui fasse compter 1 au lieu de 0,5. */
export type CongeDemi = 'AM' | 'PM' | null;

/** Une cellule du planning : une personne, un jour. */
export interface CongeJour {
  id: string;
  userId: string;
  /** 'YYYY-MM-DD' — jamais un DateTime : un jour de congé n'a ni heure ni fuseau. */
  date: string;
  type: CongeType;
  demi: CongeDemi;
  /** Le ✓ de la maquette. Seuls Master et Director peuvent le poser. */
  validated: boolean;
  createdBy: string;
}

/**
 * Droit à congés payés d'une personne sur une période de référence (juin → mai).
 * ⚠️ Une ligne n'existe QUE si le droit a été modifié : l'absence vaut
 * `CONGES_DROIT_DEFAUT` (25 jours ouvrés).
 */
export interface CongeDroit {
  userId: string;
  /** Année de DÉBUT de la période : 2026 = 1er juin 2026 → 31 mai 2027. */
  periode: number;
  jours: number;
}
