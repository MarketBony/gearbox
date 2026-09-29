import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { Project, Task, User } from '../../types';
import { db, ApiError, normalizeProject } from '../../services/dataService';
import { getSocket, connectSocket } from '../../services/socket';
import { fileSauvegardeProjet } from '../../services/fileSauvegardeProjet';
import { recalculerProjet } from '../../utils/projet';
import { canEditProjects } from '../../constants';

// =====================================================================
// Espace de travail de l'interface v2 : SOURCE UNIQUE des projets (tâches comprises), des
// tâches libres et des utilisateurs, pour les rubriques portées ET les widgets (DataHub).
//
// Pourquoi : l'ancien Gearbox recharge `/api/projects` en entier à chaque ouverture de page et
// à chaque événement temps réel, puis redessine la page. Ici :
//  - chargement UNE fois, puis mise à jour ENTRÉE PAR ENTRÉE : le serveur envoie le projet
//    complet avec `projects:updated` (backend/src/realtime/index.ts `emitEvent`). Un client
//    CLOISONNÉ (chef de site) reçoit `null` à la place : on recharge alors, par la route
//    cloisonnée — le cloisonnement reste entièrement côté serveur ;
//  - écriture OPTIMISTE : l'écran change tout de suite, la sauvegarde part par la file
//    existante (`fileSauvegardeProjet` : un seul PUT en vol par projet, coalescence, reprises),
//    avec `recalculerProjet` (utils/projet.ts) — aucune seconde logique métier ;
//  - ÉCHO LOCAL : le serveur n'envoie pas ses événements à l'onglet qui a écrit
//    (`x-socket-id`). Or d'autres fenêtres du même onglet (pages actuelles : Dashboard, Budget,
//    Agenda…) doivent voir l'écriture : on rejoue l'événement sur les écouteurs locaux.
// =====================================================================

export interface WorkspaceState {
  /** Projets chargés au moins une fois. */
  ready: boolean;
  projects: Project[];
  byId: Record<string, Project>;
  /** Tâches libres (To-do). Chargées seulement pour les rôles d'écriture : `/api/tasks` est
   *  refusé aux autres (un Guest restait sinon bloqué sur « Chargement… », BUGS-CONNUS). */
  standalone: Task[];
  users: User[];
  /** Nombre de projets dont une sauvegarde est en cours (indicateur « Sauvegarde… »). */
  saving: number;
}

export const workspace = createStore<WorkspaceState>(() => ({
  ready: false, projects: [], byId: {}, standalone: [], users: [], saving: 0,
}));

/** Sélecteur React. Le sélecteur doit rendre une valeur STABLE (un élément de l'état, pas un
 *  tableau recalculé) — sinon le composant se re-rend à chaque changement de l'espace. */
export const useWorkspace = <T,>(sel: (s: WorkspaceState) => T): T => useStore(workspace, sel);

// ---------------------------------------------------------------- session
interface Me { id: string; name: string; role: string; avatarColor?: string }
let me: Me | null = null;
let started = false;
/** Message à l'utilisateur (erreurs de sauvegarde) : branché sur la coque par l'appelant. */
let say: (msg: string) => void = (m) => console.warn('[workspace]', m);
/** Message à l'utilisateur (même canal pour toutes les écritures de l'interface v2). */
export const notify = (msg: string) => say(msg);
/** Rôle du compte connecté (posé par `startWorkspace`). */
export const currentRole = () => me?.role;

const index = (list: Project[]) => Object.fromEntries(list.map((p) => [p.id, p]));
const setProjects = (projects: Project[]) => workspace.setState({ projects, byId: index(projects), ready: true });
const putProject = (p: Project) => {
  const s = workspace.getState();
  const exists = !!s.byId[p.id];
  const projects = exists ? s.projects.map((x) => (x.id === p.id ? p : x)) : [p, ...s.projects];
  workspace.setState({ projects, byId: { ...s.byId, [p.id]: p } });
};
const dropProject = (id: string) => {
  const s = workspace.getState(); if (!s.byId[id]) return;
  const byId = { ...s.byId }; delete byId[id];
  workspace.setState({ projects: s.projects.filter((p) => p.id !== id), byId });
};

// ---------------------------------------------------------------- chargements
export async function reloadProjects() {
  const list = await db.getProjects();
  // Une écriture locale en attente PRIME sur la lecture : sinon le rechargement effacerait
  // à l'écran une saisie que la file va envoyer.
  const s = workspace.getState();
  setProjects(list.map((p) => (fileSauvegardeProjet.aDesEcrituresEnCours(p.id) && s.byId[p.id] ? s.byId[p.id] : p)));
}
async function reloadStandalone() {
  if (!canEditProjects(me?.role)) { workspace.setState({ standalone: [] }); return; }
  workspace.setState({ standalone: await db.getStandaloneTasks() });
}
async function reloadUsers() { workspace.setState({ users: await db.getUsers() }); }

const timers: Record<string, ReturnType<typeof setTimeout>> = {};
/** Rechargement groupé (300 ms, même délai que `useRealtimeSync`). */
const later = (k: string, f: () => Promise<void>) => {
  clearTimeout(timers[k]);
  timers[k] = setTimeout(() => { f().catch(() => { /* réessayé au prochain événement */ }); }, 300);
};

// ---------------------------------------------------------------- temps réel
let echoing = false;
/** Rejoue un événement sur les écouteurs LOCAUX du socket (pages actuelles ouvertes). */
/** Vrai pendant un écho local : les abonnés de l'interface v2 l'ignorent (ils ont déjà l'état). */
export const isEchoing = () => echoing;
export function echo(event: string, payload: unknown) {
  const s: any = getSocket(); if (!s?.listeners) return;
  echoing = true;
  try { for (const l of s.listeners(event)) { try { l(payload); } catch (e) { console.error(e); } } } finally { echoing = false; }
}

function bindSocket() {
  const s = getSocket() ?? connectSocket(); if (!s) return;
  s.on('projects:updated', (p: any) => {
    if (echoing) return;
    if (!p) return later('projects', reloadProjects);                         // client cloisonné
    if (fileSauvegardeProjet.aDesEcrituresEnCours(p.id)) return;             // notre saisie prime
    putProject(normalizeProject(p));
  });
  s.on('projects:deleted', (id: any) => {
    if (echoing) return;
    if (typeof id === 'string') dropProject(id); else later('projects', reloadProjects);
  });
  s.on('tasks:updated', (t: any) => {
    if (echoing || !canEditProjects(me?.role)) return;
    if (!t) return later('tasks', reloadStandalone);
    const L = workspace.getState().standalone;
    workspace.setState({ standalone: L.some((x) => x.id === t.id) ? L.map((x) => (x.id === t.id ? t : x)) : [t, ...L] });
  });
  s.on('tasks:deleted', (id: any) => {
    if (echoing || !canEditProjects(me?.role)) return;
    if (typeof id === 'string') workspace.setState({ standalone: workspace.getState().standalone.filter((x) => x.id !== id) });
    else later('tasks', reloadStandalone);
  });
  for (const ev of ['users:updated', 'users:deleted']) s.on(ev, () => { if (!echoing) later('users', reloadUsers); });
  // (Re)connexion : le serveur ne rejoue pas les événements manqués pendant la coupure.
  s.on('connect', () => { later('projects', reloadProjects); later('tasks', reloadStandalone); later('users', reloadUsers); });
}

/** Démarre l'espace de travail (idempotent). */
export function startWorkspace(user: Me, onMessage?: (msg: string) => void) {
  me = user; if (onMessage) say = onMessage;
  if (started) return; started = true;
  bindSocket();
  reloadProjects().catch(() => say('Chargement des projets impossible (serveur injoignable ?).'));
  reloadStandalone().catch(() => { /* rôle sans accès ou réseau : liste vide */ });
  reloadUsers().catch(() => { /* réessayé à la reconnexion */ });
}

// ---------------------------------------------------------------- écritures : projets
// Messages repris MOT POUR MOT de `onEchecSauvegarde` (pages/Projects.tsx) : même situation,
// même consigne à l'utilisateur.
function saveError(e: unknown, id: string) {
  if (!(e instanceof ApiError)) { say('Échec inattendu de la sauvegarde.'); return; }
  switch (e.status) {
    case 0: say('Serveur injoignable. Vos modifications ne sont PAS perdues : elles repartiront à la prochaine sauvegarde — ne fermez pas l\'onglet.'); return;
    case 503: say('La base est momentanément saturée. Plusieurs tentatives ont échoué : réessayez dans une minute.'); return;
    case 401: return;   // déconnexion gérée par AuthContext
    case 403: say('Droits insuffisants pour modifier ce projet.'); break;
    case 404: say('Ce projet n\'existe plus (supprimé depuis un autre poste ?).'); dropProject(id); break;
    case 409: say(e.message && !/^Erreur \d+$/.test(e.message) ? e.message : 'Conflit de sauvegarde. Les données ont été rechargées.'); break;
    default: say(e.message && !/^Erreur \d+$/.test(e.message) ? e.message : 'Échec de la sauvegarde du projet.');
  }
  // Refus du serveur : on revient à SON état (l'optimisme local serait un mensonge).
  later('projects', reloadProjects);
}

const lastServer: Record<string, Project> = {};
const inFlight = new Set<string>();
/**
 * Modifie un projet : `change` rend le projet MODIFIÉ (sans muter son argument). Le résultat
 * est recalculé (`recalculerProjet`), affiché aussitôt, puis envoyé en INSTANTANÉ COMPLET
 * (invariant de la file de sauvegarde). La réponse du serveur n'est réappliquée qu'au repos
 * de la file — jamais par-dessus une saisie plus récente.
 */
export function mutateProject(id: string, change: (p: Project) => Project) {
  if (!canEditProjects(me?.role)) return;
  const cur = workspace.getState().byId[id]; if (!cur) return;
  const next = recalculerProjet(change(cur));
  putProject(next);
  if (!inFlight.has(id)) { inFlight.add(id); workspace.setState((s) => ({ saving: s.saving + 1 })); }
  fileSauvegardeProjet.pousser(next, {
    onSucces: (srv) => { lastServer[id] = srv; },
    onEchec: (e) => saveError(e, id),
    onRepos: () => {
      inFlight.delete(id); workspace.setState((s) => ({ saving: Math.max(0, s.saving - 1) }));
      const srv = lastServer[id]; delete lastServer[id];
      if (srv) { putProject(srv); echo('projects:updated', srv); }
    },
  });
}

/** Modifie UNE tâche d'un projet. */
export const mutateTask = (projectId: string, taskId: string, patch: Partial<Task>) =>
  mutateProject(projectId, (p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) }));

/** Entrée du journal d'activité (même forme que les pages actuelles), au nom du compte connecté. */
export function logActivity(entity: string, action: string, name: string, id?: string) {
  if (!me) return;
  db.logActivity({ id: `act-${Date.now()}`, userId: me.id, userName: me.name, userColor: me.avatarColor || '#f75632', action, entity, entityName: name, ...(id ? { entityId: id } : {}), timestamp: new Date().toISOString() } as any);
}
const logProject = (action: string, p: { id: string; name: string }) => logActivity('project', action, p.name, p.id);

export async function createProject(p: Project): Promise<Project | null> {
  if (!canEditProjects(me?.role)) return null;
  try {
    const srv = await db.createProject(recalculerProjet(p));
    putProject(srv); echo('projects:updated', srv); logProject('a créé le projet', srv);
    return srv;
  } catch {
    say('Échec de la création du projet (serveur injoignable ?).');
    return null;
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  if (!canEditProjects(me?.role)) return false;
  const p = workspace.getState().byId[id]; if (!p) return false;
  dropProject(id);
  try {
    await db.deleteProject(id);
    echo('projects:deleted', id); logProject('a supprimé le projet', p);
    return true;
  } catch {
    say('Une erreur est survenue lors de la suppression.');
    later('projects', reloadProjects);
    return false;
  }
}

/** Archivage : même écriture que tout autre champ, plus l'entrée au journal (comme Projects.tsx). */
export function archiveProject(id: string) {
  const p = workspace.getState().byId[id]; if (!p) return;
  mutateProject(id, (x) => ({ ...x, status: 'Archived' }));
  logProject('a archivé le projet', p);
}

// ---------------------------------------------------------------- écritures : tâches libres
// Route `/api/tasks` : liste blanche `FIELDS` (backend/src/routes/tasks.ts), coût forcé à 0.
export async function createStandalone(data: Partial<Task>): Promise<Task | null> {
  try {
    const t = await db.createStandaloneTask(data);
    workspace.setState((s) => ({ standalone: [t, ...s.standalone] })); echo('tasks:updated', t);
    return t;
  } catch (e) {
    throw e instanceof Error ? e : new Error('Échec de l\'enregistrement.');
  }
}

export async function updateStandalone(id: string, patch: Partial<Task>): Promise<void> {
  const before = workspace.getState().standalone;
  workspace.setState({ standalone: before.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  try {
    const t = await db.updateStandaloneTask(id, patch);
    workspace.setState((s) => ({ standalone: s.standalone.map((x) => (x.id === id ? t : x)) })); echo('tasks:updated', t);
  } catch (e) {
    workspace.setState({ standalone: before });
    throw e instanceof Error ? e : new Error('Échec de l\'enregistrement.');
  }
}

export async function deleteStandalone(id: string): Promise<void> {
  const before = workspace.getState().standalone;
  workspace.setState({ standalone: before.filter((t) => t.id !== id) });
  try { await db.deleteStandaloneTask(id); echo('tasks:deleted', id); }
  catch (e) { workspace.setState({ standalone: before }); throw new Error('Échec de la suppression.'); }
}
