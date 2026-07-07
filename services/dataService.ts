
import { Project, Campaign, Equipment, EquipmentBooking, Expense, BudgetLine, User, SocialPost, DigitalTags, FixedExpense, ChatConversation, ChatMessage, ActivityLog } from '../types';
import { MOCK_PROJECTS, INITIAL_BUDGET_SCENARIO, SITES, SOCIAL_NETWORKS, CO2_OPTIONS } from '../constants';

// In a real scenario, this connects to the Electron preload script exposed via window.electron
// For this demo, it uses LocalStorage to simulate persistence in the browser.

const generateId = () => Math.random().toString(36).substr(2, 9);

const MOCK_EQUIPMENT: Equipment[] = [
    { id: 'eq-1', name: 'Enceinte JBL', totalQuantity: 2, category: 'Son' },
    { id: 'eq-2', name: 'Desk Bony', totalQuantity: 1, category: 'Mobilier' },
    { id: 'eq-3', name: 'Desk Alpine', totalQuantity: 1, category: 'Mobilier' },
    { id: 'eq-4', name: 'Kakémono ID', totalQuantity: 2, category: 'PLV' },
    { id: 'eq-5', name: 'Mur d\'image', totalQuantity: 1, category: 'PLV' },
    { id: 'eq-6', name: 'Kakémono Carte RH', totalQuantity: 1, category: 'PLV' },
    { id: 'eq-7', name: 'Kakémono Valeurs RH', totalQuantity: 1, category: 'PLV' },
    { id: 'eq-8', name: 'Kakémono Métiers RH', totalQuantity: 1, category: 'PLV' },
    { id: 'eq-9', name: 'Kit Kakémono VA', totalQuantity: 1, category: 'PLV' },
    { id: 'eq-10', name: 'Tonelle Renault', totalQuantity: 1, category: 'Structure' },
    { id: 'eq-11', name: 'Tonelle Dacia', totalQuantity: 2, category: 'Structure' },
    { id: 'eq-12', name: 'Tonelle Blanche', totalQuantity: 1, category: 'Structure' },
    { id: 'eq-13', name: 'Transat Dacia', totalQuantity: 2, category: 'Mobilier' },
    { id: 'eq-14', name: 'Tables', totalQuantity: 10, category: 'Mobilier' },
    { id: 'eq-15', name: 'Chaises', totalQuantity: 32, category: 'Mobilier' },
    { id: 'eq-16', name: 'Mange-debout', totalQuantity: 12, category: 'Mobilier' },
];

const DEFAULT_USERS: User[] = [
    { id: 'u1', name: 'Théo Labonne', loginId: 'Theo', password: 'admin', role: 'Master', avatarColor: '#f75632' },
    { id: 'u2', name: 'Claire Richard', loginId: 'Claire', password: 'admin', role: 'Administrator', avatarColor: '#8f12ab' },
    { id: 'u3', name: 'Christian Charlier', loginId: 'Christian', password: 'admin', role: 'Administrator', avatarColor: '#293f74' },
    { id: 'u4', name: 'Bastien Fuziol', loginId: 'Bastien', password: 'admin', role: 'Coordinator', avatarColor: '#10b981' },
    { id: 'u5', name: 'Alexis Perz', loginId: 'Alexis', password: 'admin', role: 'Coordinator', avatarColor: '#0ea5e9' },
    { id: 'u6', name: 'Romane Chambon', loginId: 'Romane', password: 'admin', role: 'Coordinator', avatarColor: '#f43f5e' },
    // Nouveaux utilisateurs
    { id: 'u7', name: 'Morgane Barthe', loginId: 'Morgane', password: 'admin', role: 'Digital Manager', avatarColor: '#ec4899' }, // Pink
    { id: 'u8', name: 'Hugo Culetto', loginId: 'Hugo', password: 'admin', role: 'Digital Manager', avatarColor: '#8b5cf6' }, // Violet light
    { id: 'u9', name: 'Ludivine Roux', loginId: 'Ludivine', password: 'admin', role: 'Guest', avatarColor: '#64748b' }, // Slate
    { id: 'u10', name: 'Lucy Bohere', loginId: 'Lucy', password: 'admin', role: 'Coordinator', avatarColor: '#14b8a6' }, // Teal
];

// MOCK SOCIAL POSTS
const MOCK_SOCIAL_POSTS: SocialPost[] = [
    {
        id: 'sp-1',
        title: 'Lancement R5 E-Tech',
        status: 'Programmed',
        date: new Date().toISOString().split('T')[0],
        targets: ['Internet'],
        brands: ['Renault'],
        service: 'VN',
        networks: ['Instagram', 'Facebook', 'LinkedIn'],
        concessions: ['Clermont', 'Issoire'],
        mediaFiles: [],
        link: 'https://renault-clermont.fr/r5',
        wording: 'La révolution est en marche ! Découvrez la nouvelle R5 E-Tech 100% électrique dans nos concessions. #R5 #Renault #Electric',
        lom: 'Non nécessaire',
        co2: 'R5 - A0',
        archived: false
    },
    {
        id: 'sp-2',
        title: 'Offre Pneus Hiver',
        status: 'Validé',
        date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
        targets: ['Internet'],
        brands: ['Groupe'],
        service: 'APV',
        networks: ['Facebook', 'GMB'],
        concessions: ['GROUPE BONY'],
        mediaFiles: [],
        link: '',
        wording: 'Préparez votre hiver en toute sérénité. Profitez de -30% sur le 2ème pneu Michelin.',
        lom: 'Pensez à covoiturer #SeDéplacerMoinsPolluer',
        co2: '',
        archived: false
    },
    {
        id: 'sp-3',
        title: 'Recrutement Mécanicien',
        status: 'Publié',
        date: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0],
        targets: ['Internet', 'Collaborateurs'],
        brands: ['Groupe'],
        service: 'Tous Services',
        networks: ['LinkedIn', 'Facebook'],
        concessions: ['Ussel'],
        mediaFiles: [],
        link: 'https://bony-automobiles.com/carrieres',
        wording: 'Nous recrutons un Mécanicien H/F pour notre site d\'Ussel. Rejoignez une équipe dynamique !',
        lom: 'Non nécessaire',
        co2: '',
        archived: true // Archived example
    }
];

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
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      localStorage.setItem('gearbox_expenses', JSON.stringify([]));
      localStorage.setItem('gearbox_budgets', JSON.stringify(INITIAL_BUDGET_SCENARIO));
    }
    // Ensure budgets exist if adding this feature later
    if (!localStorage.getItem('gearbox_budgets')) {
        localStorage.setItem('gearbox_budgets', JSON.stringify(INITIAL_BUDGET_SCENARIO));
    }
    // Ensure Equipment exists
    if (!localStorage.getItem('gearbox_equipment')) {
        localStorage.setItem('gearbox_equipment', JSON.stringify(MOCK_EQUIPMENT));
    }
    // Ensure Equipment Bookings exist
    if (!localStorage.getItem('gearbox_equipment_bookings')) {
        localStorage.setItem('gearbox_equipment_bookings', JSON.stringify([]));
    }
    // Ensure Users exist
    if (!localStorage.getItem('gearbox_users')) {
        localStorage.setItem('gearbox_users', JSON.stringify(DEFAULT_USERS));
    } else {
        // QUICK FIX FOR DEMO: If users exist but are missing the new ones, merge them.
        const currentUsers: User[] = JSON.parse(localStorage.getItem('gearbox_users') || '[]');
        if (currentUsers.length < 10) {
             const existingIds = new Set(currentUsers.map(u => u.id));
             const toAdd = DEFAULT_USERS.filter(u => !existingIds.has(u.id));
             localStorage.setItem('gearbox_users', JSON.stringify([...currentUsers, ...toAdd]));
        }
    }
    // Ensure Social Posts exist
    if (!localStorage.getItem('gearbox_social_posts')) {
        localStorage.setItem('gearbox_social_posts', JSON.stringify(MOCK_SOCIAL_POSTS));
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
  
  // --- Campaigns ---
  async getCampaigns(): Promise<Campaign[]> { return this.get('campaigns'); }
  async saveCampaigns(campaigns: Campaign[]) { await this.save('campaigns', campaigns); }

  // --- Equipment ---
  async getEquipment(): Promise<Equipment[]> { return this.get('equipment'); }
  async saveEquipment(equipment: Equipment[]) { await this.save('equipment', equipment); }

  async getEquipmentBookings(): Promise<EquipmentBooking[]> { return this.get('equipment_bookings'); }
  async saveEquipmentBookings(bookings: EquipmentBooking[]) { await this.save('equipment_bookings', bookings); }
  
  // --- Expenses (Actuals) ---
  async getExpenses(): Promise<Expense[]> { return this.get('expenses'); }
  async saveExpenses(expenses: Expense[]) { await this.save('expenses', expenses); }

  // --- Fixed Expenses (BRANCHÉES BACKEND — étape 7.2) ---
  // CRUD unitaire ; isAnnual/alpineShare/budgetDistribution transitent BRUTS
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

  // --- USERS ---
  async getUsers(): Promise<User[]> { return this.get('users'); }
  async saveUsers(users: User[]) { await this.save('users', users); }
  
  // --- SOCIAL POSTS (DIGITAL) ---
  async getSocialPosts(): Promise<SocialPost[]> { return this.get('social_posts'); }
  async saveSocialPosts(posts: SocialPost[]) { await this.save('social_posts', posts); }

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

  // --- CHAT ---
  getConversations(): ChatConversation[] {
    const data = localStorage.getItem('gearbox_conversations');
    const convs: ChatConversation[] = data ? JSON.parse(data) : [];
    // Ensure general conversation exists
    if (!convs.find(c => c.id === 'general')) {
      const general: ChatConversation = {
        id: 'general', type: 'general', participants: [],
        name: 'Chat Général', pinnedBy: [], unreadCounts: {}
      };
      convs.unshift(general);
      localStorage.setItem('gearbox_conversations', JSON.stringify(convs));
    }
    return convs;
  }

  saveConversations(convs: ChatConversation[]) {
    localStorage.setItem('gearbox_conversations', JSON.stringify(convs));
  }

  getMessages(conversationId: string): ChatMessage[] {
    const data = localStorage.getItem(`gearbox_messages_${conversationId}`);
    return data ? JSON.parse(data) : [];
  }

  saveMessages(conversationId: string, messages: ChatMessage[]) {
    localStorage.setItem(`gearbox_messages_${conversationId}`, JSON.stringify(messages));
  }

  // --- USER CRUD ---
  async saveUser(user: User) {
    const users = await this.getUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) users[idx] = user;
    else users.push(user);
    await this.saveUsers(users);
  }

  async deleteUser(id: string) {
    const users = await this.getUsers();
    await this.saveUsers(users.filter(u => u.id !== id));
  }

  // --- ACTIVITY LOG ---
  getActivityLog(): ActivityLog[] {
    const data = localStorage.getItem('gearbox_activity_log');
    return data ? JSON.parse(data) : [];
  }

  logActivity(entry: ActivityLog) {
    // Actions du Master invisibles dans le fil d'actualité
    try {
      const users: User[] = JSON.parse(localStorage.getItem('gearbox_users') || '[]');
      const actor = users.find(u => u.id === entry.userId);
      if (actor?.role === 'Master') return;
    } catch { /* ignore */ }
    const log = this.getActivityLog();
    const updated = [entry, ...log].slice(0, 200);
    localStorage.setItem('gearbox_activity_log', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('gearbox-activity-updated'));
  }

  // --- AUTH (BRANCHÉE BACKEND — étape 7.1) ---
  // Remplace l'ancien authenticate() localStorage (comparaison en clair).
  async login(loginId: string, password: string): Promise<{ token: string; user: Omit<User, 'loginId'> }> {
    return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ loginId, password }) });
  }
  async fetchMe(): Promise<Omit<User, 'loginId'>> {
    return apiFetch('/auth/me');
  }
  async updateMe(data: { name?: string; password?: string; avatarColor?: string }): Promise<Omit<User, 'loginId'>> {
    return apiFetch('/auth/me', { method: 'PUT', body: JSON.stringify(data) });
  }
}

export const db = new DataService();
