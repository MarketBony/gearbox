
import { Project, Task, Campaign, Equipment, EquipmentBooking, BudgetLine, User, SocialPost, DigitalTags, FixedExpense, ChatConversation, ChatMessage, ActivityLog, FeedInfo, StorageInfo, ProjectFile, SocialComment, CongeJour, CongeType, CongeDemi, CongeDroit, PostIt, GoogleStatus, GForm, GFormDetail, GFormLog, BonyFormRow, BonyFormDetail, BonyResponse, BonyKit, BonyFont, AssistantMessage, AssistantTurn, AssistantNote, AssistantMe, AssistantUsageView } from '../types';
import type { LobbyData, GameSession, GameChallenge, GameType } from '../components/games/gameTypes';
import { MOCK_PROJECTS, INITIAL_BUDGET_SCENARIO, SITES, SOCIAL_NETWORKS, CO2_OPTIONS, LOI_LOM_OPTIONS } from '../constants';
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
// Exportée pour l'interface v2 : les projets reçus par le temps réel passent par la même porte.
export const normalizeProject = (p: any): Project => ({
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
  date: toDay(p.date),
  // Repli sur l'ancienne classe unique : un onglet servi par une API d'avant le
  // correctif 58 ne porte pas `co2s`.
  co2s: Array.isArray(p.co2s) ? p.co2s : (p.co2 ? [p.co2] : []),
  proPlus: p.proPlus === true,
});
// Le backend génère les ids et gère createdAt/updatedAt : on ne les renvoie
// pas dans les corps de mutation (les routes social/campaigns passent le body
// brut à Prisma).
const stripMeta = ({ id, createdAt, updatedAt, ...data }: any) => data;

/**
 * Forme sûre d'un `DigitalTags`, quelle que soit la source.
 * ⚠️ `lom` n'existe que depuis le correctif 49 : une ligne écrite avant, ou un
 * `localStorage` d'un poste pas encore mis à jour, ne le porte pas. Sans ce repli,
 * l'écran planterait sur un `.map` d'`undefined`.
 */
/**
 * Valeurs semées par `backend/src/routes/seed.ts` à la création de la base. Leur présence
 * signifie que personne n'a jamais curé la table depuis l'écran — ce qui a été le cas
 * jusqu'au correctif 49, l'écran n'écrivant que dans le `localStorage`.
 */
const TAGS_DU_SEED = {
  networks: ['Facebook', 'Instagram', 'LinkedIn'],
  co2: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
};

const memeListe = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** La table est-elle encore « d'usine » : vide, ou strictement égale au seed ? */
const estNonCuree = (t: DigitalTags): boolean => {
  const vide = t.networks.length === 0 && t.co2.length === 0 && t.lom.length === 0;
  const seed = memeListe(t.networks, TAGS_DU_SEED.networks) && memeListe(t.co2, TAGS_DU_SEED.co2) && t.lom.length === 0;
  return vide || seed;
};

/** Union ordonnée, sans doublon : le serveur d'abord, puis ce que le poste ajoute. */
const fusionner = (a: string[], b: string[]): string[] => {
  const vus = new Set(a);
  return [...a, ...b.filter(v => !vus.has(v))];
};

const normalizeDigitalTags = (t: any): DigitalTags => ({
  networks: Array.isArray(t?.networks) ? t.networks : [],
  co2: Array.isArray(t?.co2) ? t.co2 : [],
  lom: Array.isArray(t?.lom) ? t.lom : [],
});

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
    // ⚠️ L'amorçage des tags Digital dans le `localStorage` a été RETIRÉ au correctif 49 :
    // la source de vérité est désormais la table `DigitalTags` via `/api/tags`. Semer les
    // valeurs canoniques ici ferait croire à la récupération unique de `getDigitalTags`
    // qu'un travail local existe, et publierait des valeurs par défaut que personne n'a
    // saisies. Les défauts sont désormais rendus à l'affichage, sans être enregistrés.
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
  // ---- Tâches AUTONOMES (To-do, sans projet) ----
  // Ne concernent JAMAIS les tâches de projet, qui passent par updateProject.
  async getStandaloneTasks(): Promise<Task[]> {
    return apiFetch<Task[]>('/tasks');
  }
  async createStandaloneTask(task: Partial<Task>): Promise<Task> {
    return apiFetch('/tasks', { method: 'POST', body: JSON.stringify(task) });
  }
  async updateStandaloneTask(id: string, task: Partial<Task>): Promise<Task> {
    return apiFetch(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(task) });
  }
  async deleteStandaloneTask(id: string): Promise<void> {
    await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
  }

  // ---- FICHIERS du mode EXPERT (projet et tâche) ----
  // Le dépôt se fait en DEUX temps, volontairement : `uploadFile` écrit le fichier via
  // la route uploads (seule à toucher le disque, avec ses règles de taille et son
  // nommage en uuid), puis `addProjectFile` enregistre la métadonnée. Refaire un
  // multer ici aurait dupliqué ces garde-fous.
  async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    return apiFetch<ProjectFile[]>(`/project-files/${projectId}`);
  }
  async addProjectFile(
    projectId: string,
    data: { url: string; fileName: string; fileSize: number; taskId?: string | null }
  ): Promise<ProjectFile> {
    return apiFetch(`/project-files/${projectId}`, { method: 'POST', body: JSON.stringify(data) });
  }
  async deleteProjectFile(fileId: string): Promise<void> {
    await apiFetch(`/project-files/item/${fileId}`, { method: 'DELETE' });
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
  // Upload d'un fichier (chat|avatar|calendar|project) via POST /api/uploads/:type.
  // multipart/form-data : on NE fixe PAS Content-Type (le navigateur ajoute la
  // boundary). Renvoie l'URL relative servie par le backend.
  /**
   * Dépôt AVEC PROGRESSION (XHR : `fetch` ne remonte pas l'avancement de l'envoi). Utilisé par la boîte d'envoi du
   * Chat (services/chatOutbox.ts). Mêmes règles que `uploadFile` : JWT, 401 = session expirée, message du serveur.
   */
  uploadFileWithProgress(type: 'chat', file: File, onProgress: (p: number) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const form = new FormData(); form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/uploads/${type}`);
      const token = getToken(); if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onerror = () => reject(new ApiError(0, 'Connexion perdue pendant l’envoi du fichier.'));
      xhr.ontimeout = () => reject(new ApiError(0, 'Envoi du fichier trop long, réessaie.'));
      xhr.timeout = 5 * 60_000;
      xhr.onload = () => {
        if (xhr.status === 401) { clearToken(); window.dispatchEvent(new CustomEvent('gearbox-auth-expired')); return reject(new ApiError(401, 'Session expirée')); }
        let body: any = {}; try { body = JSON.parse(xhr.responseText || '{}'); } catch { /* corps non JSON */ }
        if (xhr.status < 200 || xhr.status >= 300) return reject(new ApiError(xhr.status, body.error || body.message || `Erreur ${xhr.status}`));
        if (!body.url) return reject(new ApiError(500, 'Réponse du serveur incomplète.'));
        resolve(body.url);
      };
      xhr.send(form);
    });
  }

  async uploadFile(type: 'chat' | 'avatar' | 'calendar' | 'project' | 'chatbg', file: File): Promise<string> {
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

  // Espace consommé par les uploads + espace disque du serveur. Lecture ouverte à
  // tous les rôles ; le backend met le résultat en cache 60 s, l'appeler à chaque
  // ouverture des Paramètres ne coûte donc rien.
  async getStorage(): Promise<StorageInfo> {
    return apiFetch('/storage');
  }

  // --- JEUX (branchés backend le 05/08/2026) ---
  // Avant, défis et parties vivaient dans le localStorage : défier un collègue
  // était impossible. Tout passe désormais par le serveur, et les parties
  // reçues sont des vues REDACTÉES (pas de navires adverses) — voir gameTypes.ts.
  async getGamesLobby(): Promise<LobbyData> {
    return apiFetch('/games/lobby');
  }
  async getGameSession(id: string): Promise<GameSession> {
    return apiFetch(`/games/sessions/${id}`);
  }
  async sendGameChallenge(toUserId: string, game: GameType): Promise<GameChallenge> {
    return apiFetch('/games/challenges', { method: 'POST', body: JSON.stringify({ toUserId, game }) });
  }
  async refuseGameChallenge(id: string): Promise<GameChallenge> {
    return apiFetch(`/games/challenges/${id}/refuse`, { method: 'POST' });
  }
  // Renvoie la partie créée : seul le destinataire du défi peut accepter.
  async acceptGameChallenge(id: string): Promise<GameSession> {
    return apiFetch(`/games/challenges/${id}/accept`, { method: 'POST' });
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

  // --- COMMENTAIRES D'UNE PUBLICATION (correctif 50) ---
  //
  // ⚠️ Les fils ne sont PAS chargés avec les publications : `GET /api/social` n'en
  // renvoie que le NOMBRE (`commentCount`, dérivé côté serveur), et le fil lui-même
  // n'est lu qu'à l'ouverture du panneau. Charger 57 fils pour en afficher un seul
  // ferait payer à chaque rechargement — y compris ceux du temps réel — ce dont on se
  // sert une fois.
  async getSocialComments(postId: string): Promise<SocialComment[]> {
    return apiFetch<SocialComment[]>(`/social/${postId}/comments`);
  }
  async addSocialComment(postId: string, content: string): Promise<SocialComment> {
    // ⚠️ Aucun auteur envoyé : le serveur le lit dans le jeton. Un `authorId` client
    // permettrait de signer au nom d'un collègue.
    return apiFetch<SocialComment>(`/social/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }
  async deleteSocialComment(commentId: string): Promise<void> {
    await apiFetch(`/social/comments/${commentId}`, { method: 'DELETE' });
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
  //
  // ⚠️⚠️ CES DEUX MÉTHODES N'ATTEIGNAIENT PAS LE SERVEUR. Jusqu'au correctif 49
  // (09/09/2026), elles lisaient et écrivaient dans le `localStorage` du navigateur,
  // alors que la route `/api/tags` ET le modèle Prisma `DigitalTags` existaient depuis
  // l'origine — simplement jamais appelés par le client (vérifié : aucun `apiFetch('/tags')`
  // nulle part). Conséquences vécues par l'équipe digitale : les tags créés par une
  // personne étaient INVISIBLES de ses collègues, perdus au vidage du navigateur, et
  // l'abonnement temps réel `RT_EVENTS.tags` de `pages/Digital.tsx` écoutait un événement
  // que plus rien n'émettait.

  /** Clé du drapeau de migration, posée une fois pour toutes par poste. */
  private static readonly TAGS_MIGRES = 'gearbox_digital_tags_migres';

  async getDigitalTags(): Promise<DigitalTags> {
      if (this.isElectron && window.electron) {
          const rows = await window.electron.loadData('digital_tags');
          if (rows && rows.length > 0) return normalizeDigitalTags(rows[0]);
          return { networks: SOCIAL_NETWORKS, co2: CO2_OPTIONS, lom: LOI_LOM_OPTIONS };
      }

      const serveur = normalizeDigitalTags(await apiFetch('/tags'));

      // ⚠️ RÉCUPÉRATION UNIQUE DES TAGS LOCAUX — et ce n'est PAS un simple « si le serveur
      // est vide ». Constaté le 09/09/2026 en branchant la route : la table n'était pas
      // vide, elle contenait les valeurs du SEED d'origine (3 réseaux, classes A à G,
      // cf. backend/src/routes/seed.ts), tandis que le `localStorage` des postes portait le
      // vrai travail de l'équipe — 34 modèles avec leur classe CO², les 8 réseaux réels.
      // Une garde sur le seul « vide » n'aurait donc jamais joué, et l'écran serait retombé
      // sur les valeurs du seed : l'équipe aurait vu son travail disparaître.
      //
      // On considère donc comme NON CURÉE une table vide OU strictement égale au seed, et
      // on remonte alors l'UNION du serveur et du local. L'union plutôt qu'un remplacement :
      // aucune valeur n'est perdue, ni celle du serveur ni celle du poste, et le tri est
      // ensuite trivial à faire à la main dans l'écran.
      if (!localStorage.getItem(DataService.TAGS_MIGRES)) {
          const brut = localStorage.getItem('gearbox_digital_tags');
          if (brut && estNonCuree(serveur)) {
              try {
                  const locaux = normalizeDigitalTags(JSON.parse(brut));
                  if (locaux.networks.length || locaux.co2.length || locaux.lom.length) {
                      const union: DigitalTags = {
                          networks: fusionner(serveur.networks, locaux.networks),
                          co2: fusionner(serveur.co2, locaux.co2),
                          lom: fusionner(serveur.lom, locaux.lom),
                      };
                      const remontes = normalizeDigitalTags(await apiFetch('/tags', { method: 'POST', body: JSON.stringify(union) }));
                      localStorage.setItem(DataService.TAGS_MIGRES, new Date().toISOString());
                      return remontes;
                  }
              } catch (e) {
                  // Un `localStorage` illisible ne doit pas empêcher l'écran de s'ouvrir.
                  console.error('[tags] récupération des tags locaux impossible :', e);
              }
          }
          localStorage.setItem(DataService.TAGS_MIGRES, new Date().toISOString());
      }

      // Base encore vierge : on propose les valeurs canoniques, SANS les enregistrer.
      // Elles ne partiront au serveur qu'à la première modification volontaire.
      if (serveur.networks.length === 0 && serveur.co2.length === 0 && serveur.lom.length === 0) {
          return { networks: SOCIAL_NETWORKS, co2: CO2_OPTIONS, lom: LOI_LOM_OPTIONS };
      }
      return serveur;
  }

  /**
   * ⚠️ ACCEPTE UN PATCH, et c'est le point important : `routes/tags.ts` n'écrit QUE les
   * catégories présentes dans le corps. Envoyer `{ networks }` seul laisse `co2` et `lom`
   * intacts en base, quoi qu'ait l'écran dans son état. Le 10/09/2026, l'envoi
   * systématique des trois catégories a effacé les 34 modèles CO² et les 4 mentions
   * Loi LOM : l'état de l'écran faisait autorité sur des listes qu'il n'avait pas
   * chargées. Ne pas revenir à un objet complet « pour simplifier ».
   */
  async saveDigitalTags(tags: Partial<DigitalTags>): Promise<DigitalTags> {
      if (this.isElectron && window.electron) {
          // ⚠️ Electron n'a pas d'équivalent du « patch » : le stockage local remplace la
          // ligne entière. On relit donc l'existant et on fusionne, pour que la même
          // signature ne vide pas les catégories absentes ici non plus.
          const existant = await this.getDigitalTags();
          const fusionne: DigitalTags = { ...existant, ...tags };
          // Use 'save-data' with array [tags] since it expects array for generic insert
          await window.electron.saveData('digital_tags', [fusionne]);
          return fusionne;
      }
      // Le serveur nettoie et dédoublonne (routes/tags.ts) : on rend SA réponse, pas
      // l'objet envoyé, pour que l'écran reflète ce qui est réellement enregistré.
      return normalizeDigitalTags(await apiFetch('/tags', { method: 'POST', body: JSON.stringify(tags) }));
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

  // Aperçu d'un lien. Rend `null` quand le domaine n'est pas dans la liste blanche
  // serveur (204) — cas normal et majoritaire, pas une erreur.
  async getLinkPreview(url: string): Promise<any | null> {
    return apiFetch(`/link-preview?url=${encodeURIComponent(url)}`);
  }

  // ---- Réglages d'application (interrupteurs de fonctionnalité) ----
  // Lecture ouverte à tous ; la bascule est refusée par le SERVEUR à tout rôle
  // autre que Master — masquer le bouton ne suffirait pas.
  async getAppSettings(): Promise<{ gamesEnabled: boolean }> {
    return apiFetch('/settings');
  }
  async setGamesEnabled(enabled: boolean): Promise<{ gamesEnabled: boolean }> {
    return apiFetch('/settings/games', { method: 'PUT', body: JSON.stringify({ enabled }) });
  }

  // Recherche de GIF (Tenor). La clé d'API ne transite jamais côté client.
  async getGifStatus(): Promise<{ disponible: boolean }> {
    return apiFetch('/gifs/status');
  }
  async searchGifs(q: string): Promise<{ id: string; apercu: string | null; url: string; description: string }[]> {
    return apiFetch(`/gifs?q=${encodeURIComponent(q)}`);
  }

  // ⚠️ Cette signature est une WHITELIST : un champ absent d'ici ne peut pas être
  // envoyé (excess property check sur l'objet littéral de l'appelant). C'est ce qui a
  // fait qu'un utilisateur ne pouvait pas enregistrer son propre anniversaire pendant
  // deux jours. Tout champ ajouté à `User` et modifiable par son porteur doit être
  // reporté ICI **et** dans `AuthContext.updateProfile` — même piège que la
  // déstructuration explicite de `routes/users.ts` (cf. `nissanShare`, `birthdate`).
  // Convention du serveur (routes/auth.ts) : champ absent = inchangé, valeur vide = effacement.
  /**
   * ⚠️ CETTE SIGNATURE EST UNE LISTE BLANCHE : ce qui n'y figure pas ne PEUT pas être
   * envoyé (TypeScript refuse les propriétés en trop sur un littéral). C'est ce qui a
   * réparé la date de naissance le 06/08/2026 — et ce qui impose d'ajouter ici tout
   * nouveau champ modifiable par son propriétaire, comme `chatBackground`.
   */
  /**
   * Personnalisation du Chat PAR CONVERSATION (11/09/2026).
   *
   * ⚠️ Chargée en UNE fois à l'ouverture du Chat, pas conversation par conversation :
   * l'écran change de fil sans aller-retour réseau, et le volume est dérisoire (une
   * ligne par discussion réglée, pour le seul utilisateur courant).
   */
  // --- CONGÉS (12/09/2026) ---
  //
  // ⚠️ Le GET rend les jours ET le périmètre en une seule réponse : l'écran a besoin des
  // deux pour dessiner une ligne par membre, même vide. Les séparer ferait deux requêtes
  // au chargement pour une donnée qui ne se lit jamais l'une sans l'autre.
  async getConges(debut: string, fin: string): Promise<{ jours: CongeJour[]; membres: string[]; droits: CongeDroit[] }> {
    return apiFetch(`/conges?debut=${debut}&fin=${fin}`);
  }
  /** `type: null` efface la cellule. `demi` : 'AM', 'PM' ou null pour un jour entier. */
  async setCongeJour(userId: string, date: string, type: CongeType | null, demi: CongeDemi = null) {
    return apiFetch('/conges/jour', { method: 'PUT', body: JSON.stringify({ userId, date, type, demi }) });
  }
  /** Pose en lot. `jours` = les jours OUVRÉS calculés par le client (voir lib/joursFeries). */
  async setCongePeriode(userId: string, jours: string[], type: CongeType | null, demi: CongeDemi = null) {
    return apiFetch<{ jours: number }>('/conges/periode', { method: 'PUT', body: JSON.stringify({ userId, jours, type, demi }) });
  }
  /**
   * Droit à CP d'une personne sur une période de référence (juin `periode` → mai +1).
   * ⚠️ Réservé aux gestionnaires côté serveur ; poser la valeur par défaut EFFACE la ligne.
   */
  async setCongeDroit(userId: string, periode: number, jours: number) {
    await apiFetch('/conges/droit', { method: 'PUT', body: JSON.stringify({ userId, periode, jours }) });
  }
  /** Le ✓. Réservé Master/Director côté serveur — un autre rôle reçoit 403. */
  async setCongeValidation(userId: string, date: string, validated: boolean) {
    await apiFetch('/conges/jour/validation', { method: 'PUT', body: JSON.stringify({ userId, date, validated }) });
  }
  async ajouterMembreConges(userId: string) {
    await apiFetch('/conges/membres', { method: 'POST', body: JSON.stringify({ userId }) });
  }
  /** ⚠️ Retire du planning, ne supprime AUCUN congé. */
  async retirerMembreConges(userId: string) {
    await apiFetch(`/conges/membres/${userId}`, { method: 'DELETE' });
  }

  // --- Post-it : agenda personnel (la route filtre sur l'utilisateur connecté) ---
  async getPostIts(): Promise<PostIt[]> {
    return apiFetch<PostIt[]>('/postits');
  }
  async createPostIt(p: Omit<PostIt, 'id' | 'createdAt' | 'updatedAt'>): Promise<PostIt> {
    return apiFetch<PostIt>('/postits', { method: 'POST', body: JSON.stringify(p) });
  }
  async updatePostIt(id: string, p: Partial<Omit<PostIt, 'id' | 'createdAt' | 'updatedAt'>>): Promise<PostIt> {
    return apiFetch<PostIt>(`/postits/${id}`, { method: 'PUT', body: JSON.stringify(p) });
  }
  async deletePostIt(id: string): Promise<void> {
    await apiFetch(`/postits/${id}`, { method: 'DELETE' });
  }

  // --- Assistant IA « mIAouss » (équipe marketing ; tout est filtré sur l'utilisateur connecté) ---
  async assistantConversation(): Promise<AssistantMessage[]> { return apiFetch<AssistantMessage[]>('/assistant/conversation'); }
  /** `orga` : l'organisation du groupe lue dans constants.ts (le serveur ne la connaît pas). */
  async assistantAsk(message: string, orga?: string): Promise<AssistantTurn> { return apiFetch<AssistantTurn>('/assistant/chat', { method: 'POST', body: JSON.stringify({ message, orga }) }); }
  async assistantToolResults(turnId: string, results: { id: string; content: string }[]): Promise<AssistantTurn> {
    return apiFetch<AssistantTurn>('/assistant/chat/tools', { method: 'POST', body: JSON.stringify({ turnId, results }) });
  }
  async assistantReset(): Promise<void> { await apiFetch('/assistant/conversation', { method: 'DELETE' }); }
  async assistantNotes(): Promise<AssistantNote[]> { return apiFetch<AssistantNote[]>('/assistant/notes'); }
  async assistantAddNote(content: string): Promise<AssistantNote> { return apiFetch<AssistantNote>('/assistant/notes', { method: 'POST', body: JSON.stringify({ content }) }); }
  async assistantEditNote(id: string, content: string): Promise<AssistantNote> { return apiFetch<AssistantNote>(`/assistant/notes/${id}`, { method: 'PUT', body: JSON.stringify({ content }) }); }
  async assistantDeleteNote(id: string): Promise<void> { await apiFetch(`/assistant/notes/${id}`, { method: 'DELETE' }); }
  async assistantClearNotes(): Promise<void> { await apiFetch('/assistant/notes', { method: 'DELETE' }); }
  async assistantMe(): Promise<AssistantMe> { return apiFetch<AssistantMe>('/assistant/me'); }
  async assistantSetPrefs(p: { memoryPaused: boolean }): Promise<AssistantMe> { return apiFetch<AssistantMe>('/assistant/prefs', { method: 'PUT', body: JSON.stringify(p) }); }
  async assistantUsage(): Promise<AssistantUsageView> { return apiFetch<AssistantUsageView>('/assistant/usage'); }
  /** Master seul. `cap` : null = défaut, -1 = sans limite, 0..500. */
  async assistantSetCap(userId: string, cap: number | null): Promise<void> { await apiFetch(`/assistant/caps/${userId}`, { method: 'PUT', body: JSON.stringify({ cap }) }); }

  // --- Forms : Google Forms par le compte partagé (le serveur garde le jeton, FORMS_ROLES sur chaque route) ---
  async getGoogleStatus(): Promise<GoogleStatus> { return apiFetch<GoogleStatus>('/forms/google/status'); }
  /** Adresse de l'écran d'autorisation Google (Master) : la page y est redirigée, Google la ramène ensuite. */
  async connectGoogle(): Promise<string> { return (await apiFetch<{ url: string }>('/forms/google/connect', { method: 'POST' })).url; }
  async disconnectGoogle(): Promise<void> { await apiFetch('/forms/google/disconnect', { method: 'POST' }); }
  async getForms(): Promise<GForm[]> { return apiFetch<GForm[]>('/forms'); }
  async importForm(url: string): Promise<GForm> { return apiFetch<GForm>('/forms/import', { method: 'POST', body: JSON.stringify({ url }) }); }
  async getFormDetail(id: string): Promise<GFormDetail> { return apiFetch<GFormDetail>(`/forms/${id}`); }
  async syncForm(id: string): Promise<GForm> { return apiFetch<GForm>(`/forms/${id}/sync`, { method: 'POST' }); }
  async removeForm(id: string): Promise<void> { await apiFetch(`/forms/${id}`, { method: 'DELETE' }); }
  // --- Forms Bony : formulaires maison (publiés par le Worker Cloudflare) ---
  async getBonyForms(): Promise<{ workerReady: boolean; workerUrl: string | null; forms: BonyFormRow[] }> { return apiFetch('/bony-forms'); }
  async createBonyForm(title: string): Promise<BonyFormDetail> { return apiFetch('/bony-forms', { method: 'POST', body: JSON.stringify({ title }) }); }
  async duplicateBonyForm(id: string): Promise<BonyFormDetail> { return apiFetch(`/bony-forms/${id}/duplicate`, { method: 'POST' }); }
  async getBonyForm(id: string): Promise<BonyFormDetail> { return apiFetch(`/bony-forms/${id}`); }
  async saveBonyDraft(id: string, draft: any): Promise<BonyFormRow> { return apiFetch(`/bony-forms/${id}/draft`, { method: 'PUT', body: JSON.stringify({ draft }) }); }
  async publishBonyForm(id: string): Promise<BonyFormRow> { return apiFetch(`/bony-forms/${id}/publish`, { method: 'POST' }); }
  async closeBonyForm(id: string): Promise<BonyFormRow> { return apiFetch(`/bony-forms/${id}/close`, { method: 'POST' }); }
  async deleteBonyForm(id: string): Promise<void> { await apiFetch(`/bony-forms/${id}`, { method: 'DELETE' }); }
  async getBonyResponses(id: string): Promise<BonyResponse[]> { return apiFetch(`/bony-forms/${id}/responses`); }
  async deleteBonyResponse(id: string, rid: string): Promise<void> { await apiFetch(`/bony-forms/${id}/responses/${rid}`, { method: 'DELETE' }); }
  /** Fichier déposé par un répondant (route authentifiée : jamais d'adresse publique). */
  async getBonyFile(formId: string, rid: string, fid: string): Promise<Blob> {
    const token = getToken();
    const res = await fetch(`${API_BASE}/bony-forms/${formId}/responses/${rid}/files/${fid}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    if (!res.ok) { const b = await res.json().catch(() => ({} as any)); throw new ApiError(res.status, b.error || `Erreur ${res.status}`); }
    return res.blob();
  }
  async setBonyMeta(id: string, meta: { projectId: string | null; sites: string[]; brands: string[]; service: string[] }): Promise<BonyFormRow> { return apiFetch(`/bony-forms/${id}/meta`, { method: 'PUT', body: JSON.stringify(meta) }); }
  async followBonyForm(id: string, on: boolean): Promise<{ followers: string[] }> { return apiFetch(`/bony-forms/${id}/follow`, { method: 'POST', body: JSON.stringify({ on }) }); }
  async getBonyVersions(id: string): Promise<any[]> { return apiFetch(`/bony-forms/${id}/versions`); }
  async getBonyVersion(id: string, v: number): Promise<any> { return apiFetch(`/bony-forms/${id}/versions/${v}`); }
  async restoreBonyVersion(id: string, v: number): Promise<BonyFormRow> { return apiFetch(`/bony-forms/${id}/versions/${v}/restore`, { method: 'POST' }); }
  async getBonyDraws(id: string): Promise<any[]> { return apiFetch(`/bony-forms/${id}/draws`); }
  async drawBony(id: string, rules: { winners: number; alternates: number; consentField: string | null; uniqueField: string | null; excludePrevious: boolean }): Promise<any> { return apiFetch(`/bony-forms/${id}/draw`, { method: 'POST', body: JSON.stringify(rules) }); }
  async getBonyKits(): Promise<BonyKit[]> { return apiFetch('/bony-forms/kits'); }
  async saveBonyKit(name: string, theme: any): Promise<BonyKit> { return apiFetch('/bony-forms/kits', { method: 'POST', body: JSON.stringify({ name, theme }) }); }
  async deleteBonyKit(kid: string): Promise<void> { await apiFetch(`/bony-forms/kits/${kid}`, { method: 'DELETE' }); }
  async getBonyFonts(): Promise<BonyFont[]> { return apiFetch('/bony-forms/fonts'); }
  async saveBonyFont(f: { family: string; weight: number; style: string; url: string; fileName: string }): Promise<BonyFont> { return apiFetch('/bony-forms/fonts', { method: 'POST', body: JSON.stringify(f) }); }
  async deleteBonyFont(fid: string): Promise<void> { await apiFetch(`/bony-forms/fonts/${fid}`, { method: 'DELETE' }); }
  /** Image déjà compressée ou police (base64 sans préfixe) : stockée chez Cloudflare, renvoie son adresse publique. */
  async uploadBonyAsset(type: string, data: string): Promise<{ url: string }> { return apiFetch('/bony-forms/assets', { method: 'POST', body: JSON.stringify({ type, data }) }); }

  async createForm(title: string): Promise<GForm> { return apiFetch<GForm>('/forms', { method: 'POST', body: JSON.stringify({ title }) }); }
  /** Formulaire Google EN DIRECT (éditeur) : objet brut de l'API Forms + dernier auteur Gearbox. */
  async getFormLive(id: string): Promise<{ form: any; lastEditedBy: string | null; lastEditedAt: string | null }> { return apiFetch(`/forms/${id}/form`); }
  /** Modifications de l'éditeur (liste blanche serveur) ; 409 = modifié ailleurs, recharger. */
  async batchForm(id: string, requests: any[], revisionId: string, summary: string): Promise<{ form: any }> {
    return apiFetch(`/forms/${id}/batch`, { method: 'POST', body: JSON.stringify({ requests, revisionId, summary }) });
  }
  async publishForm(id: string, isPublished: boolean, isAcceptingResponses: boolean): Promise<GForm> {
    return apiFetch<GForm>(`/forms/${id}/publish`, { method: 'POST', body: JSON.stringify({ isPublished, isAcceptingResponses }) });
  }
  async duplicateForm(id: string): Promise<{ form: GForm; skipped: number }> { return apiFetch(`/forms/${id}/duplicate`, { method: 'POST' }); }
  async getFormLog(id: string): Promise<GFormLog[]> { return apiFetch<GFormLog[]>(`/forms/${id}/log`); }

  async updateMe(data: { name?: string; password?: string; avatarColor?: string; avatarUrl?: string | null; birthdate?: string; chatBackground?: string; chatBubble?: string }): Promise<Omit<User, 'loginId'>> {
    return apiFetch('/auth/me', { method: 'PUT', body: JSON.stringify(data) });
  }
}

export const db = new DataService();
