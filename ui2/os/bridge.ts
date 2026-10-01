// =====================================================================
// PONT entre l'appli Gearbox (arbre React principal : auth, thème, droits,
// temps réel, pages actuelles) et la coque v2 (racine React séparée, dans un
// Shadow DOM). La coque ne décide RIEN en matière de droits : elle lit ici ce
// que l'appli a calculé (computeNav, resolveTab — la cascade de gardes d'App.tsx).
// =====================================================================
import { useSyncExternalStore } from 'react';
import type { computeNav } from '../../services/navigation';
import type { ActivityLog } from '../../types';

export interface Bridge {
  user: { id: string; name: string; role: string; avatarColor?: string; sites?: string[] };
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  logout: () => void;
  onExit: () => void;
  /** Rubrique courante d'App.tsx (id RÉEL) et son setter (présence, notifications). */
  tab: string;
  setTab: (t: string) => void;
  /** Cascade de gardes d'App.tsx : une rubrique non autorisée est redirigée. */
  resolveTab: (t: string) => string;
  nav: ReturnType<typeof computeNav>;
  chatUnread: number;
  gamesChallenges: number;
  feed: { entries: ActivityLog[]; isUnread: (e: ActivityLog) => boolean; unreadCount: number; markAllRead: () => void };
  showSocial: boolean;
}

function store<T>(initial: T) {
  let v = initial; const ls = new Set<() => void>();
  return {
    get: () => v,
    set: (n: T) => { v = n; ls.forEach(l => l()); },
    subscribe: (l: () => void) => { ls.add(l); return () => { ls.delete(l); }; },
  };
}

export const bridgeStore = store<Bridge | null>(null);
export const useBridge = () => useSyncExternalStore(bridgeStore.subscribe, bridgeStore.get) as Bridge;

/** Poignée qu'une rubrique PORTÉE (React) remplit pour le moteur : menus de la barre du haut,
 *  commandes (Spotlight, raccourcis). Même contrat que l'objet rendu par `mount` dans la maquette. */
export interface PortedInst { command?: (c: string) => void; menus?: () => Record<string, unknown[]> | undefined }
/** Fenêtre (ou écran mobile) montée d'une rubrique PORTÉE : React y rend la rubrique par portail,
 *  DANS la racine fantôme — elle hérite donc de la CSS de la maquette et des contextes de l'appli. */
export interface PortedMount { key: string; appId: string; host: HTMLElement; win: any; inst: PortedInst }
export const portedStore = store<PortedMount[]>([]);
export const usePortedMounts = () => useSyncExternalStore(portedStore.subscribe, portedStore.get);

/** Rubriques ACTUELLES à projeter dans les fenêtres (ids d'app de la maquette). */
export const legacyStore = store<string[]>([]);
export const useLegacyIds = () => useSyncExternalStore(legacyStore.subscribe, legacyStore.get);

// ---- Identifiants : app de la maquette ⇄ rubrique réelle ----
const TAB_OF_APP: Record<string, string> = { hello: 'hello-marketing', fixed: 'fixed-expenses' };
const APP_OF_TAB: Record<string, string> = Object.fromEntries(Object.entries(TAB_OF_APP).map(([a, t]) => [t, a]));
export const tabOf = (app: string) => TAB_OF_APP[app] || app;
export const appOf = (tab: string) => APP_OF_TAB[tab] || tab;

/** Métadonnées des rubriques, relevées dans maquettes/v2/js/apps/*.js (GX.registerApp). */
export const APP_META: { id: string; name: string; icon: string; tint: [string, string]; size: [number, number]; minSize: [number, number] }[] = [
  { id: 'dashboard', name: 'Dashboard', icon: 'dashboard', tint: ['#f75632', '#c2185b'], size: [1240, 800], minSize: [380, 360] },
  { id: 'projects', name: 'Projets', icon: 'projects', tint: ['#8f12ab', '#5b1bd1'], size: [1320, 800], minSize: [360, 380] },
  { id: 'todo', name: 'To-do', icon: 'todo', tint: ['#34c77b', '#12806b'], size: [1100, 680], minSize: [360, 320] },
  { id: 'digital', name: 'Digital', icon: 'digital', tint: ['#2f7cf6', '#293f74'], size: [1240, 760], minSize: [360, 360] },
  { id: 'campaigns', name: 'Campagnes', icon: 'campaigns', tint: ['#ff8a3d', '#f75632'], size: [1180, 740], minSize: [360, 320] },
  { id: 'forms', name: 'Forms', icon: 'forms', tint: ['#a78bfa', '#673ab7'], size: [1200, 780], minSize: [360, 360] },
  { id: 'chat', name: 'Chat', icon: 'chat', tint: ['#34c7ff', '#1e6fd9'], size: [980, 660], minSize: [360, 320] },
  { id: 'hello', name: 'Hello Marketing', icon: 'hello', tint: ['#ff5fa2', '#8f12ab'], size: [1320, 820], minSize: [360, 360] },
  { id: 'agenda', name: 'Agenda', icon: 'agenda', tint: ['#ff5d5d', '#d62f5b'], size: [1120, 720], minSize: [360, 320] },
  { id: 'budget', name: 'Budget', icon: 'budget', tint: ['#f5a524', '#f75632'], size: [1280, 800], minSize: [360, 320] },
  { id: 'fixed', name: 'Dépenses', icon: 'fixed', tint: ['#caa04b', '#8a5a1c'], size: [1240, 740], minSize: [360, 320] },
  { id: 'material', name: 'Matériel', icon: 'material', tint: ['#7c8aa5', '#3b4863'], size: [1180, 720], minSize: [360, 360] },
  { id: 'conges', name: 'Congés', icon: 'conges', tint: ['#ffcc33', '#ff8a3d'], size: [1240, 760], minSize: [360, 360] },
  { id: 'export', name: 'Export', icon: 'export', tint: ['#22b573', '#146c43'], size: [1080, 680], minSize: [360, 320] },
  { id: 'games', name: 'Jeux', icon: 'games', tint: ['#b36bff', '#6a2bd9'], size: [1100, 740], minSize: [360, 320] },
  { id: 'archives', name: 'Archives', icon: 'archives', tint: ['#8e8a99', '#4a4655'], size: [1200, 740], minSize: [360, 380] },
  { id: 'settings', name: 'Réglages', icon: 'settings', tint: ['#9aa0ad', '#555b68'], size: [980, 680], minSize: [360, 320] },
];
