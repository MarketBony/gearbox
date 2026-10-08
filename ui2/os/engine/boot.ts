// =====================================================================
// Démarrage du moteur de la maquette (ui2/os/engine/*) dans la racine fantôme.
// Ordre identique à maquettes/v2/index.html. Tout ce qui relie le moteur au VRAI
// Gearbox est ici (et dans les balises [GEARBOX] des fichiers convertis) :
//  - GX.bridge() : compte, thème, droits, pastilles, fil d'activité (ui2/os/bridge.ts)
//  - GX.data     : adaptateur de vraies données (ui2/os/data.ts), rempli par DataHub
//  - rubriques pas encore portées : leur fenêtre projette la page ACTUELLE par <slot>
//  - synchronisation avec App.tsx : la fenêtre active devient la rubrique courante
//    (présence, notifications système) ; une navigation de l'appli ouvre la fenêtre.
// =====================================================================
import { install as core } from './core';
import { install as charts } from './charts';
import { install as pickers } from './pickers';
import { install as controls } from './controls';
import { install as icons } from './icons';
import { install as wallpapers } from './wallpapers';
import { install as widgets } from './widgets';
import { install as gesture } from './gesture';
import { install as wm } from './wm';
import { install as winswipe } from './winswipe';
import { install as shell } from './shell';
import { install as mobile } from './mobile';
import { install as system } from './apps/system';
import { install as r } from './r';
import { createData } from '../data';
import { bridgeStore, legacyStore, portedStore, tabOf, appOf, APP_META } from '../bridge';
import { PORTED_IDS, PORTED_EXTRA_META } from '../../apps/ids';
import { openActivityEntry } from '../../../services/activityFeed';

export type ShellMode = 'desktop' | 'mobile';

/** Même critère que maquettes/v2/index.html. */
export const isSmall = () => window.innerWidth <= 760 || (window.matchMedia('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) <= 520);

let booted = false;

export function boot(host: HTMLElement, root: ShadowRoot, body: HTMLElement): ShellMode {
  const w = window as any;
  if (booted) return w.GX.host.dataset.shell;       // le moteur s'installe une seule fois par page
  booted = true;
  w.__GX_BOOT = { host, root, body };
  core();
  const GX = w.GX;

  // --- Pont vers l'appli ---
  GX.bridge = () => bridgeStore.get();
  GX.tabOf = tabOf; GX.appOf = appOf;
  GX.openActivity = (entry: any) => openActivityEntry(entry);
  GX.openProject = (id: string) => {
    window.sessionStorage.setItem('pendingProjectId', id);
    window.dispatchEvent(new CustomEvent('gearbox-navigate', { detail: { tab: 'projects', projectId: id } }));
  };
  const b0 = GX.bridge();
  GX.ctx.uid = b0.user.id; GX.ctx.role = b0.user.role;

  // --- Données : l'adaptateur existe AVANT les modules (certains lisent GX.data à l'installation) ---
  GX.data = createData();
  GX.data.ME = b0.user.id;
  r();

  charts(); pickers(); controls(); icons(); wallpapers(); widgets(); gesture(); wm(); winswipe(); shell(); mobile(); system();

  // --- Rubriques PORTÉES (React, ui2/apps/*) : le moteur fournit la fenêtre, React la remplit par
  //     portail (OsHost). Un conteneur dédié en `display: contents` : React ne partage pas son nœud
  //     avec ce que le moteur ajoute au corps de la fenêtre (volets `win.sheet`, etc.).
  // Pastilles « non lus » : la coque (Dock, pilule, grille) les lit par `GX.app(id).badge()`. Avant le 08/10/2026
  // aucune rubrique ne la fournissait : le Dock du bureau n'affichait jamais rien. Source = le pont (useNavBadges,
  // partagée avec l'ancienne interface).
  const BADGE: Record<string, () => number> = {
    chat: () => GX.bridge()?.chatUnread || 0,
    games: () => GX.bridge()?.gamesChallenges || 0,
  };
  let seq = 0;
  for (const id of PORTED_IDS) {
    const m = APP_META.find((x) => x.id === id) || PORTED_EXTRA_META[id]; if (!m) continue;
    GX.registerApp({
      ...m,
      ...(BADGE[id] ? { badge: BADGE[id] } : {}),
      mount(bodyEl: HTMLElement, win: any) {
        const host = document.createElement('div'); host.className = 'gx-react'; host.style.display = 'contents';
        bodyEl.append(host);
        const key = `${id}-${++seq}`, inst: any = {};
        portedStore.set([...portedStore.get(), { key, appId: id, host, win, inst }]);
        return {
          command: (c: string) => inst.command?.(c),
          menus: () => inst.menus?.(),
          destroy() { portedStore.set(portedStore.get().filter((x) => x.key !== key)); },
        };
      },
    });
  }

  // --- Rubriques pas encore portées : la fenêtre projette la page actuelle ---
  for (const m of APP_META) {
    if (GX.apps.has(m.id)) continue;
    GX.registerApp({
      ...m,
      mount(bodyEl: HTMLElement, win: any) {
        bodyEl.innerHTML = `<slot name="app-${m.id}"></slot>`;
        // Classes lues par overrides.css (pas de :has(), trop coûteux) : fenêtre / écran hôte d'une page actuelle.
        const frame = win?.el || bodyEl.closest('.win, .m-app');
        frame?.classList.add('gx-legacy');
        legacyStore.set([...new Set([...legacyStore.get(), m.id])]);
        GX.host.classList.add('gx-has-legacy');
        return { destroy() {
          frame?.classList.remove('gx-legacy');
          legacyStore.set(legacyStore.get().filter((x) => x !== m.id));
          if (!legacyStore.get().length) GX.host.classList.remove('gx-has-legacy');
        } };
      },
    });
  }

  // --- Synchronisation avec App.tsx (garde contre l'écho : on retient ce que la coque a poussé) ---
  let pushed: string | null = null;
  GX.on('wm:focus', (win: any) => {
    if (!win) return;
    const tab = tabOf(win.app?.parent || win.appId);
    const b = GX.bridge();
    if (b.nav.allowedIds.has(tab) || tab === 'settings') { if (b.tab !== tab) { pushed = tab; b.setTab(tab); } }
  });
  let lastTab = b0.tab;
  bridgeStore.subscribe(() => {
    const b = GX.bridge(); if (!b || b.tab === lastTab) return;
    lastTab = b.tab;
    if (b.tab === pushed) { pushed = null; return; }
    openTab(b.tab);
  });
  // Navigation interne (cloche, liens entre rubriques, notifications système)
  window.addEventListener('gearbox-navigate' as any, (e: CustomEvent) => { if (e.detail?.tab) openTab(e.detail.tab); });
  function openTab(tab: string) {
    const b = GX.bridge(); const t = b.resolveTab(tab); const app = appOf(t);
    if (GX.host.dataset.shell === 'mobile') GX.mobile?.open(app);
    else GX.wm?.open(app);
  }

  // --- Coque : bureau ou téléphone (la maquette recharge la page quand on franchit le seuil) ---
  const mode: ShellMode = isSmall() ? 'mobile' : 'desktop';
  host.dataset.shell = mode;
  (mode === 'mobile' ? GX.mobile : GX.shell).init();
  let t = 0;
  window.addEventListener('resize', () => { clearTimeout(t); t = window.setTimeout(() => { if ((isSmall() ? 'mobile' : 'desktop') !== mode) location.reload(); }, 300); });
  return mode;
}
