
import { Project, Campaign, Equipment, EquipmentBooking, BudgetLine, User, SocialPost, DigitalTags, FixedExpense, ChatConversation, ChatMessage, ActivityLog, FeedInfo } from '../types';
import { MOCK_PROJECTS, INITIAL_BUDGET_SCENARIO, SITES, SOCIAL_NETWORKS, CO2_OPTIONS } from '../constants';
import { primeAvatarCache } from './avatarCache';
import { getCurrentSocketId } from './socketId';

// In a real scenario, this connects to the Electron preload script exposed via window.electron
// For this demo, it uses LocalStorage to simulate persistence in the browser.

const generateId = () => Math.random().toString(36).substr(2, 9);

// =====================================================================
// COUCHE API — branchement progressif sur le backend Express (étape 7).
// Pattern unique réutilisé par chaque module au fil des bascules.
// =====================================================================
const API_BASE = '/api'; // proxifié par vite vers le backend (vite.config.ts)
const TOKEN_KEY = 'gearbox_token';
const AUTH_USER_KEY = 'gearbox_auth_user';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Wrapper fetch central : JWT attaché automatiquement, erreurs typées.
// Sur 401 (token absent/expiré côté serveur) : purge du token + événement
// global 'gearbox-auth-expired' (écouté par AuthContext -> déconnexion propre).
// Un 403 (rôle insuffisant) ne déconnecte PAS.
async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  // Identifie l'onglet appelant pour que le serveur ne lui renvoie PAS l'événement
  // temps réel de sa propre mutation : sinon il refetche son écriture et écrase
  // son état local en cours de saisie (voir services/socketId.ts).
  const socketId = getCurrentSocketId();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(socketId ? { 'x-socket-id': socketId } : {}),
        ...(options.headers || {})
      }
    });
  } catch (e) {
    // Serveur/réseau injoignable (backend éteint, hotspot coupé...)
    throw new ApiError(0, 'Serveur injoignable');
  }

  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('gearbox-auth-expired'));
    throw new ApiError(401, 'Session expirée');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new ApiError(res.status, body.error || body.message || `Erreur ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

// Variante de apiFetch renvoyant du TEXTE : les flux RSS sont du XML, pas du JSON.
// Même gestion du JWT et du 401 que apiFetch (dont la version JSON est utilisée
// partout ailleurs).
async function apiFetchText(path: string): Promise<string> {
  const token = getToken();
  const socketId = getCurrentSocketId();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(socketId ? { 'x-socket-id': socketId } : {})
      }
    });
  } catch (e) {
    throw new ApiError(0, 'Serveur injoignable');
  }
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('gearbox-auth-expired'));
    throw new ApiError(401, 'Session expirée');
  }
  if (!res.ok) {
    throw new ApiError(res.status, `Erreur ${res.status}`);
  }
  return res.text();
}

// Le backend renvoie des DateTime ISO complets ; le frontend manipule du
// 'yyyy-MM-dd' partout (DatePicker, comparaisons de chaînes) — on normalise
// à la réception, sans toucher les pages.
const toDay = (v: any): string => (typeof v === 'string' && v.length > 10 ? v.slice(0, 10) : v);
const normalizeProject = (p: any): Project => ({
  ...p,
  startDate: toDay(p.startDate),
  endDate: toDay(p.endDate)
});
const normalizeFixedExpense = (e: any): FixedExpense => ({
  ...e,
  date: toDay(e.date)
});
const normalizeCampaign = (c: any): Campaign => ({
  ...c,
  startDate: toDay(c.startDate),
  endDate: toDay(c.endDate)
});
const normalizeBooking = (b: any): EquipmentBooking => ({
  ...b,
  startDate: toDay(b.startDate),
  endDate: toDay(b.endDate)
});
const normalizeSocialPost = (p: any): SocialPost => ({
  ...p,
  date: toDay(p.date)
});
// Le backend génère les ids et gère createdAt/updatedAt : on ne les renvoie
// pas dans les corps de mutation (les routes social/campaigns passent le body
// brut à Prisma).
const stripMeta = ({ id, createdAt, updatedAt, ...data }: any) => data;

// Helpers de migration one-shot localStorage -> Supabase (étape 7.2) :
// ne s'exécute que si l'API est vide, qu'aucune migration n'a déjà eu lieu
// (flag), que le compte connecté peut écrire (Master/Admin) et que des
// données locales existent.
const readLocalStore = <T,>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(`gearbox_${key}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};
const isStoredUserAdmin = (): boolean => {
  try {
    const u = JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null');
    return u?.role === 'Master' || u?.role === 'Administrator';
  } catch {
    return false;
  }
};

class DataService {
  private isElectron = !!window.electron;

  // Initialize DB or LocalStorage
  async init() {
    if (!localStorage.getItem('gearbox_projects')) {
      localStorage.setItem('gearbox_projects', JSON.stringify(MOCK_PROJECTS));
      localStorage.setItem('gearbox_campaigns', JSON.stringify([]));
      // plus de 'gearbox_expenses' : les dépenses ponctuelles viennent de l'API
      localStorage.setItem('gearbox_budgets', JSON.stringify(INITIAL_BUDGET_SCENARIO));
    }
    // Ensure budgets exist if adding this feature later
    if (!localStorage.getItem('gearbox_budgets')) {
        localStorage.setItem('gearbox_budgets', JSON.stringify(INITIAL_BUDGET_SCENARIO));
    }
    // Ensure Digital Tags exist
    if (!localStorage.getItem('gearbox_digital_tags')) {
        const defaultTags: DigitalTags = {
            networks: SOCIAL_NETWORKS,
            co2: CO2_OPTIONS
        };
        localStorage.setItem('gearbox_digital_tags', JSON.stringify(defaultTags));
    }
  }

  // --- Generic Helpers ---
  private async get<T>(key: string): Promise<T[]> {
    if (this.isElectron && window.electron) {
      return window.electron.loadData(key);
    }
    const data = localStorage.getItem(`gearbox_${key}`);
    return data ? JSON.parse(data) : [];
  }

  private async save<T>(key: string, data: T[]) {
    if (this.isElectron && window.electron) {
      await window.electron.saveData(key, data);
      return;
    }
    localStorage.setItem(`gearbox_${key}`, JSON.stringify(data));
    // Simulate network/disk delay
    await new Promise(r => setTimeout(r, 200)); 
  }

  // --- Projects (BRANCHÉ BACKEND — étape 7.1) ---
  // CRUD unitaire aligné sur l'API REST (le PUT gère le diff des tâches côté
  // serveur). L'ancien saveProjects(tableau complet) n'existe plus.
  async getProjects(): Promise<Project[]> {
    const projects = await apiFetch<any[]>('/projects');
    return projects.map(normalizeProject);
  }
  async createProject(project: Project): Promise<Project> {
    return normalizeProject(await apiFetch('/projects', { method: 'POST', body: JSON.stringify(project) }));
  }
  async updateProject(project: Project): Promise<Project> {
    return normalizeProject(await apiFetch(`/projects/${project.id}`, { method: 'PUT', body: JSON.stringify(project) }));
  }
  async deleteProject(id: string): Promise<void> {
    await apiFetch(`/projects/${id}`, { method: 'DELETE' });
  }
  
  // --- Campaigns (BRANCHÉES BACKEND — étape 7.4) ---
  // Aucun CRUD UI aujourd'hui (Campaigns.tsx travaille sur les tâches des
  // projets ; seul le Dashboard lit la liste) — le CRUD unitaire est posé
  // pour le jour où un écran l'utilisera. Écritures : Master/Admin/Coordinator.
  async getCampaigns(): Promise<Campaign[]> {
    const campaigns = await apiFetch<any[]>('/campaigns');
    return campaigns.map(normalizeCampaign);
  }
  async createCampaign(campaign: Campaign): Promise<Campaign> {
    return normalizeCampaign(await apiFetch('/campaigns', { method: 'POST', body: JSON.stringify(stripMeta(campaign)) }));
  }
  async updateCampaign(campaign: Campaign): Promise<Campaign> {
    return normalizeCampaign(await apiFetch(`/campaigns/${campaign.id}`, { method: 'PUT', body: JSON.stringify(stripMeta(campaign)) }));
  }
  async deleteCampaign(id: string): Promise<void> {
    await apiFetch(`/campaigns/${id}`, { method: 'DELETE' });
  }

  // --- Equipment + réservations (BRANCHÉS BACKEND — étape 7.4) ---
  // Catalogue : mutations Master/Administrator (routes/equipment.ts) ;
  // réservations : tout utilisateur authentifié (routes/equipmentBookings.ts).
  // Pas de contrôle de chevauchement côté serveur (BUGS-CONNUS.md) : le
  // frontend garde son calcul de disponibilité en mémoire.
  async getEquipment(): Promise<Equipment[]> {
    let equipment = await apiFetch<any[]>('/equipment');
    equipment = await this.migrateEquipmentIfNeeded(equipment);
    return equipment;
  }
  async createEquipment(eq: Omit<Equipment, 'id'>): Promise<Equipment> {
    return apiFetch('/equipment', { method: 'POST', body: JSON.stringify(eq) });
  }
  async updateEquipment(eq: Equipment): Promise<Equipment> {
    return apiFetch(`/equipment/${eq.id}`, { method: 'PUT', body: JSON.stringify(stripMeta(eq)) });
  }
  async deleteEquipment(id: string): Promise<void> {
    await apiFetch(`/equipment/${id}`, { method: 'DELETE' });
  }

  async getEquipmentBookings(): Promise<EquipmentBooking[]> {
    const bookings = await apiFetch<any[]>('/equipment-bookings');
    return bookings.map(normalizeBooking);
  }
  async createEquipmentBooking(booking: Omit<EquipmentBooking, 'id'>): Promise<EquipmentBooking> {
    return normalizeBooking(await apiFetch('/equipment-bookings', { method: 'POST', body: JSON.stringify(booking) }));
  }
  async updateEquipmentBooking(booking: EquipmentBooking): Promise<EquipmentBooking> {
    return normalizeBooking(await apiFetch(`/equipment-bookings/${booking.id}`, { method: 'PUT', body: JSON.stringify(stripMeta(booking)) }));
  }
  async deleteEquipmentBooking(id: string): Promise<void> {
    await apiFetch(`/equipment-bookings/${id}`, { method: 'DELETE' });
  }
  // Migration one-shot catalogue + réservations : les réservations locales
  // référencent les anciens ids localStorage -> on mappe vers les ids générés
  // par le backend au fil des POST.
  private async migrateEquipmentIfNeeded(apiEquipment: any[]): Promise<any[]> {
    const FLAG = 'gearbox_migrated_equipment';
    if (apiEquipment.length > 0 || localStorage.getItem(FLAG) || !isStoredUserAdmin()) return apiEquipment;
    const localEq = readLocalStore<Equipment>('equipment');
    if (localEq.length === 0) {
      localStorage.setItem(FLAG, '1');
      return apiEquipment;
    }
    const idMap: Record<string, string> = {};
    for (const eq of localEq) {
      const created = await apiFetch('/equipment', {
        method: 'POST',
        body: JSON.stringify({ name: eq.name, totalQuantity: Number(eq.totalQuantity), category: eq.category })
      });
      idMap[eq.id] = created.id;
    }
    const localBk = readLocalStore<EquipmentBooking>('equipment_bookings');
    let migratedBk = 0;
    for (const bk of localBk) {
      const equipmentId = idMap[bk.equipmentId];
      if (!equipmentId) continue; // réservation orpheline (matériel disparu)
      try {
        await apiFetch('/equipment-bookings', {
          method: 'POST',
          body: JSON.stringify({ ...stripMeta(bk), equipmentId, quantity: Number(bk.quantity) })
        });
        migratedBk++;
      } catch { /* réservation invalide : on ne bloque pas le reste */ }
    }
    localStorage.setItem(FLAG, '1');
    console.info(`[migration] ${localEq.length} matériel(s) et ${migratedBk} réservation(s) localStorage poussés vers Supabase.`);
    return apiFetch<any[]>('/equipment');
  }


  // --- Dépenses ponctuelles : PAS de couche client ---
  // La route /api/expenses et le modèle Prisma OneOffExpense existent mais sont
  // DORMANTS (table vide). Une dépense ponctuelle se saisit dans la rubrique
  // « Dépenses » (FixedExpense avec isAnnual = false) : le montant ne pèse que
  // sur le mois de sa date, et ce modèle offre en plus le multi-sites, la
  // répartition %/€, les marques et PRO+. Ne pas recréer de second chemin ici.

  // --- Fixed Expenses (BRANCHÉES BACKEND — étape 7.2) ---
  // CRUD unitaire ; isAnnual/alpineShare/nissanShare/budgetDistribution BRUTS
  // (tout calcul — fractionnement /12, routage Alpine/Nissan — reste dans Budget.tsx).
  async getFixedExpenses(): Promise<FixedExpense[]> {
    let expenses = await apiFetch<any[]>('/fixed-expenses');
    expenses = await this.migrateFixedExpensesIfNeeded(expenses);
    return expenses.map(normalizeFixedExpense);
  }
  async createFixedExpense(expense: FixedExpense): Promise<FixedExpense> {
    return normalizeFixedExpense(await apiFetch('/fixed-expenses', { method: 'POST', body: JSON.stringify(expense) }));
  }
  async updateFixedExpense(expense: FixedExpense): Promise<FixedExpense> {
    return normalizeFixedExpense(await apiFetch(`/fixed-expenses/${expense.id}`, { method: 'PUT', body: JSON.stringify(expense) }));
  }
  async deleteFixedExpense(id: string): Promise<void> {
    await apiFetch(`/fixed-expenses/${id}`, { method: 'DELETE' });
  }
  private async migrateFixedExpensesIfNeeded(apiExpenses: any[]): Promise<any[]> {
    const FLAG = 'gearbox_migrated_fixed_expenses';
    if (apiExpenses.length > 0 || localStorage.getItem(FLAG) || !isStoredUserAdmin()) return apiExpenses;
    const local = readLocalStore<FixedExpense>('fixed_expenses');
    if (local.length === 0) {
      localStorage.setItem(FLAG, '1');
      return apiExpenses;
    }
    for (const expense of local) {
      await apiFetch('/fixed-expenses', { method: 'POST', body: JSON.stringify(expense) });
    }
    localStorage.setItem(FLAG, '1');
    console.info(`[migration] ${local.length} dépense(s) fixe(s) localStorage poussée(s) vers Supabase.`);
    return apiFetch<any[]>('/fixed-expenses');
  }

  // --- Budgets / prévisionnel (BRANCHÉS BACKEND — étape 7.2) ---
  // Une ligne par site (identité = site, upsert côté backend), pas de dimension
  // année. Le GET renvoie aussi id/createdAt/updatedAt — bénin pour le frontend.
  async getBudgets(): Promise<BudgetLine[]> {
    let budgets = await apiFetch<any[]>('/budget');
    budgets = await this.migrateBudgetsIfNeeded(budgets);
    return budgets;
  }
  async upsertBudget(line: BudgetLine): Promise<BudgetLine> {
    return apiFetch('/budget', {
      method: 'POST',
      body: JSON.stringify({ site: line.site, entries: line.entries, brands: line.brands ?? [] })
    });
  }
  async deleteBudget(id: string): Promise<void> {
    await apiFetch(`/budget/${id}`, { method: 'DELETE' });
  }
  private async migrateBudgetsIfNeeded(apiBudgets: any[]): Promise<any[]> {
    const FLAG = 'gearbox_migrated_budgets';
    if (apiBudgets.length > 0 || localStorage.getItem(FLAG) || !isStoredUserAdmin()) return apiBudgets;
    const local = readLocalStore<BudgetLine>('budgets');
    if (local.length === 0) {
      localStorage.setItem(FLAG, '1');
      return apiBudgets;
    }
    for (const line of local) {
      await apiFetch('/budget', {
        method: 'POST',
        body: JSON.stringify({ site: line.site, entries: line.entries, brands: line.brands ?? [] })
      });
    }
    localStorage.setItem(FLAG, '1');
    console.info(`[migration] ${local.length} ligne(s) de prévisionnel localStorage poussée(s) vers Supabase.`);
    return apiFetch<any[]>('/budget');
  }

  // --- Users (BRANCHÉS BACKEND — étape 7.3) ---
  // GET ouvert à tout utilisateur authentifié ; mutations réservées
  // Master/Administrator (règle backend routes/users.ts). Le mot de passe
  // transite EN CLAIR dans la requête (HTTPS) — le hash bcrypt est fait
  // côté serveur, jamais côté client. L'API ne renvoie jamais de hash.
  async getUsers(): Promise<User[]> {
    const users = await apiFetch<User[]>('/users');
    // Alimente le cache d'avatars (photos de profil) consommé par <Avatar/>.
    primeAvatarCache(users);
    window.dispatchEvent(new CustomEvent('gearbox-avatar-updated'));
    return users;
  }
  // Upload d'un fichier (chat|avatar|calendar) via POST /api/uploads/:type.
  // multipart/form-data : on NE fixe PAS Content-Type (le navigateur ajoute la
  // boundary). Renvoie l'URL relative servie par le backend.
  async uploadFile(type: 'chat' | 'avatar' | 'calendar', file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const token = getToken();
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/uploads/${type}`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form
      });
    } catch {
      throw new ApiError(0, 'Serveur injoignable');
    }
    if (res.status === 401) {
      clearToken();
      window.dispatchEvent(new CustomEvent('gearbox-auth-expired'));
      throw new ApiError(401, 'Session expirée');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as any));
      throw new ApiError(res.status, body.error || body.message || `Erreur ${res.status}`);
    }
    const { url } = await res.json();
    return url as string;
  }
  async createUser(user: Omit<User, 'id'>): Promise<User> {
    return apiFetch('/users', { method: 'POST', body: JSON.stringify(user) });
  }
  async updateUser(user: User): Promise<User> {
    const { id, ...data } = user;
    return apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }
  async deleteUser(id: string): Promise<void> {
    await apiFetch(`/users/${id}`, { method: 'DELETE' });
  }
  // Met à jour uniquement la photo de profil d'un utilisateur (Master éditant un
  // autre compte). null = suppression. Les autres champs restent inchangés.
  async setUserAvatar(userId: string, avatarUrl: string | null): Promise<User> {
    return apiFetch(`/users/${userId}`, { method: 'PUT', body: JSON.stringify({ avatarUrl }) });
  }

  // --- Social Posts / Digital (BRANCHÉS BACKEND — étape 7.4) ---
  // Écritures : Master/Administrator/Director/Digital Manager/External
  // (EDIT_ROLES de routes/social.ts, aligné sur le gating de Digital.tsx).
  // networks/co2/concessions sont des chaînes libres : stockage brut,
  // aucune validation d'enum côté serveur.
  async getSocialPosts(): Promise<SocialPost[]> {
    let posts = await apiFetch<any[]>('/social');
    posts = await this.migrateSocialPostsIfNeeded(posts);
    return posts.map(normalizeSocialPost);
  }
  async createSocialPost(post: Omit<SocialPost, 'id'>): Promise<SocialPost> {
    return normalizeSocialPost(await apiFetch('/social', { method: 'POST', body: JSON.stringify(stripMeta(post)) }));
  }
  async updateSocialPost(post: SocialPost): Promise<SocialPost> {
    return normalizeSocialPost(await apiFetch(`/social/${post.id}`, { method: 'PUT', body: JSON.stringify(stripMeta(post)) }));
  }
  async deleteSocialPost(id: string): Promise<void> {
    await apiFetch(`/social/${id}`, { method: 'DELETE' });
  }
  // Migration one-shot : on CONSERVE les ids d'origine (le backend accepte
  // l'id fourni) car les médias sont stockés en localStorage sous une clé
  // dérivée de l'id du post — de nouveaux ids casseraient ces associations.
  private async migrateSocialPostsIfNeeded(apiPosts: any[]): Promise<any[]> {
    const FLAG = 'gearbox_migrated_social_posts';
    if (apiPosts.length > 0 || localStorage.getItem(FLAG) || !isStoredUserAdmin()) return apiPosts;
    const local = readLocalStore<SocialPost>('social_posts');
    if (local.length === 0) {
      localStorage.setItem(FLAG, '1');
      return apiPosts;
    }
    for (const post of local) {
      await apiFetch('/social', { method: 'POST', body: JSON.stringify(post) });
    }
    localStorage.setItem(FLAG, '1');
    console.info(`[migration] ${local.length} publication(s) localStorage poussée(s) vers Supabase.`);
    return apiFetch<any[]>('/social');
  }

  // --- DIGITAL TAGS ---
  async getDigitalTags(): Promise<DigitalTags> {
      if (this.isElectron && window.electron) {
          const rows = await window.electron.loadData('digital_tags');
          if (rows && rows.length > 0) return rows[0];
          return { networks: SOCIAL_NETWORKS, co2: CO2_OPTIONS };
      }
      const data = localStorage.getItem('gearbox_digital_tags');
      return data ? JSON.parse(data) : { networks: SOCIAL_NETWORKS, co2: CO2_OPTIONS };
  }

  async saveDigitalTags(tags: DigitalTags) {
      if (this.isElectron && window.electron) {
          // Use 'save-data' with array [tags] since it expects array for generic insert
          await window.electron.saveData('digital_tags', [tags]); 
          return;
      }
      localStorage.setItem('gearbox_digital_tags', JSON.stringify(tags));
      await new Promise(r => setTimeout(r, 200));
  }

  // --- CHAT (BRANCHÉ BACKEND — étape 7) ---
  // Chargement initial via REST uniquement. Les mutations de MESSAGE
  // (envoi/édition/suppression/réaction) et le marquage lu passent par
  // Socket.IO (services/socket.ts), pas par REST. Le Chat Général est servi par
  // le backend (appartenance implicite) — plus de synthèse client. Timestamps
  // ISO complets, utilisés tels quels (pas de normalisation yyyy-MM-dd).
  async getConversations(): Promise<ChatConversation[]> {
    return apiFetch<ChatConversation[]>('/chat/conversations');
  }
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    return apiFetch<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`);
  }
  async createConversation(input: {
    type: 'private' | 'group';
    participants: string[];
    name?: string;
    adminIds?: string[];
  }): Promise<ChatConversation> {
    return apiFetch('/chat/conversations', { method: 'POST', body: JSON.stringify(input) });
  }

  // --- ACTIVITY LOG (BRANCHÉ BACKEND — étape 7.4) ---
  // Lecture : GET (200 entrées max, récent d'abord, plafond appliqué côté
  // serveur). Écriture : POST fire-and-forget — la règle "Master non
  // journalisé" est appliquée côté backend d'après le rôle du JWT (204).
  async getActivityLog(): Promise<ActivityLog[]> {
    return apiFetch<ActivityLog[]>('/activity-log');
  }

  logActivity(entry: ActivityLog) {
    const { id, ...data } = entry; // id généré par le backend
    apiFetch('/activity-log', { method: 'POST', body: JSON.stringify(data) })
      .then(() => window.dispatchEvent(new CustomEvent('gearbox-activity-updated')))
      .catch(() => { /* journalisation best-effort : ne bloque jamais l'action */ });
  }

  // --- AUTH (BRANCHÉE BACKEND — étape 7.1) ---
  // Remplace l'ancien authenticate() localStorage (comparaison en clair).
  async login(loginId: string, password: string): Promise<{ token: string; user: Omit<User, 'loginId'> }> {
    return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ loginId, password }) });
  }
  async fetchMe(): Promise<Omit<User, 'loginId'>> {
    return apiFetch('/auth/me');
  }
  // --- Hello Marketing : flux RSS et musique du jour ---
  // Proxifiés par notre backend (backend/src/routes/feeds.ts et music.ts) : le
  // navigateur ne peut appeler ni les flux ni Deezer en direct (CORS), et l'ancien
  // proxy tiers corsproxy.io réservait son offre gratuite à localhost — d'où des
  // blocs qui ne fonctionnaient jamais en production avant le 30/07/2026.
  // Le client ne transmet qu'une CLÉ, jamais une URL (voir la note de sécurité
  // dans routes/feeds.ts).
  async getFeeds(): Promise<FeedInfo[]> {
    return apiFetch('/feeds');
  }
  async getFeedContent(key: string): Promise<string> {
    return apiFetchText(`/feeds/${encodeURIComponent(key)}`);
  }
  async getMusicTracks(): Promise<{ data?: any[] }> {
    return apiFetch('/music/tracks');
  }

  async updateMe(data: { name?: string; password?: string; avatarColor?: string; avatarUrl?: string | null }): Promise<Omit<User, 'loginId'>> {
    return apiFetch('/auth/me', { method: 'PUT', body: JSON.stringify(data) });
  }
}

export const db = new DataService();
