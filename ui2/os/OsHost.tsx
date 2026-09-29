import React, { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import css from './maquette.css?inline';
import overridesCss from './overrides.css?inline';
import { boot } from './engine/boot';
import DataHub from './DataHub';
import { bridgeStore, useLegacyIds, usePortedMounts, tabOf } from './bridge';
import { PORTED_APPS } from '../apps/registry';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppSettings } from '../../services/appSettings';
import { useCongesAcces } from '../../services/congesAcces';
import { computeNav } from '../../services/navigation';
import { useNavBadges } from '../../services/navBadges';
import { useActivityFeed } from '../../services/activityFeed';
import { hasSocialFeatures } from '../../constants';

// =====================================================================
// Hôte de l'interface v2 (Gearbox OS) dans l'arbre React de l'appli.
//  1. Publie le PONT (compte, thème, droits, pastilles, fil d'activité) : le moteur lit
//     tout là, il ne recalcule aucun droit.
//  2. Crée une racine FANTÔME (Shadow DOM), y injecte le CSS de la maquette (généré, tel
//     quel) et y démarre le MOTEUR de la maquette (ui2/os/engine, converti en TypeScript).
//  3. Monte <DataHub/> (vraies données → GX.data).
//  4. Projette les pages ACTUELLES dans les fenêtres des rubriques pas encore portées
//     (<slot name="app-<id>"> : elles gardent Tailwind et les contextes React de l'appli).
// =====================================================================

export interface OsHostProps {
  tab: string;
  setTab: (tab: string) => void;
  resolveTab: (tab: string) => string;
  renderPage: (tab: string) => React.ReactNode;
  onExit: () => void;
}

// Rubrique PORTÉE : premier rendu en TRANSITION. La fenêtre s'ouvre tout de suite (animation du
// moteur) et React construit la rubrique par tranches de quelques ms au lieu de bloquer l'écran
// d'un seul tenant — mesuré le 30/09/2026 (build de prod) : 125 à 183 ms de script à l'ouverture de
// Projets (117 projets + fiche), 59 ms pour la To-do. Les nœuds DOM sont créés pendant le rendu :
// la validation finale ne fait qu'insérer l'arbre déjà prêt.
const DeferredApp: React.FC<{ App: React.ComponentType<any>; win: any; inst: any }> = ({ App, win, inst }) => {
  const [go, setGo] = useState(false);
  useEffect(() => { startTransition(() => setGo(true)); }, []);
  return go ? <App win={win} inst={inst} /> : null;
};

// Page actuelle projetée dans une fenêtre. Figée par rubrique : les pages ne prennent aucun
// prop et se mettent à jour par leurs contextes et leurs données. Sans ce gel, chaque
// changement de fenêtre active (setTab → rendu d'App) re-rendait TOUTES les pages ouvertes :
// tâche longue de 542 ms mesurée le 29/09/2026, en plein milieu de l'animation de réduction.
const LegacyPage = React.memo<{ id: string; render: (tab: string) => React.ReactNode }>(
  ({ id, render }) => <>{render(tabOf(id))}</>,
  (a, b) => a.id === b.id,
);

const OsHost: React.FC<OsHostProps> = ({ tab, setTab, resolveTab, renderPage, onExit }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { gamesEnabled } = useAppSettings();
  const { visible: voitConges } = useCongesAcces();
  const nav = computeNav({ role: user?.role, gamesEnabled, voitConges });
  const { chatUnread, gamesChallenges } = useNavBadges(user, gamesEnabled);
  const feed = useActivityFeed();
  const slotRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [booted, setBooted] = useState(false);

  // Le pont est republié à chaque rendu (le moteur lit toujours la valeur à jour).
  // Sortie de la bêta : rechargement, car le moteur (comme la maquette) pose des écouteurs
  // globaux qu'on ne démonte pas — un rechargement garantit une ancienne interface propre.
  useLayoutEffect(() => {
    if (!user) return;
    bridgeStore.set({
      user: { id: user.id, name: user.name, role: user.role, avatarColor: user.avatarColor, sites: (user as any).sites },
      theme: theme === 'light' ? 'light' : 'dark', toggleTheme, logout,
      onExit: () => { onExit(); window.location.reload(); },
      tab, setTab, resolveTab, nav, chatUnread, gamesChallenges,
      feed: { entries: feed.entries, isUnread: feed.isUnread, unreadCount: feed.unreadCount, markAllRead: feed.markAllRead },
      showSocial: user.role !== 'External' && hasSocialFeatures(user.role),
    });
  });

  // Thème : l'appli fait foi ; le moteur le reflète sur l'hôte (comme il le posait sur <html>).
  useEffect(() => {
    const h = hostRef.current; if (!h || !booted) return;
    h.dataset.theme = theme === 'light' ? 'light' : 'dark';
    const GX = (window as any).GX; if (GX?.shell?.prefs) GX.shell.prefs.theme = h.dataset.theme;
  }, [theme, booted]);

  // L'hôte est PERSISTANT : le moteur s'installe une seule fois par page (écouteurs globaux), il ne
  // peut pas redémarrer dans un nouvel élément. Si ce composant est démonté puis remonté (App repasse
  // par « INITIALISATION… », rechargement à chaud…), on raccroche le MÊME hôte — sa racine fantôme et
  // tout le bureau voyagent avec lui. Sans ça : écran noir (constaté le 29/09/2026).
  useLayoutEffect(() => {
    const w = window as any;
    let host: HTMLDivElement = w.__gxHost;
    const fresh = !host;
    if (fresh) {
      host = w.__gxHost = document.createElement('div');
      host.className = 'gx2-host';
      Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '0' });
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = `${css}\n${overridesCss}`;
      const body = document.createElement('div');
      body.className = 'gx-body';
      shadow.append(style, body);
    }
    slotRef.current!.appendChild(host);
    if (fresh) boot(host, host.shadowRoot!, host.shadowRoot!.querySelector('.gx-body') as HTMLElement);
    hostRef.current = host;
    setBooted(true);
    return () => { host.remove(); };
  }, []);

  // Premier rendu d'une page à l'ouverture de sa fenêtre : en TRANSITION, pour que React le
  // découpe au lieu de bloquer l'animation d'ouverture (tâches de ~100 ms mesurées sinon).
  const ported = usePortedMounts();
  const legacyIds = useLegacyIds();
  const [legacy, setLegacy] = useState(legacyIds);
  useEffect(() => { startTransition(() => setLegacy(legacyIds)); }, [legacyIds]);
  return (
    <div ref={slotRef}>
      {booted && <DataHub />}
      {booted && ported.map(m => { const App = PORTED_APPS[m.appId]; return App ? createPortal(<DeferredApp App={App} win={m.win} inst={m.inst} />, m.host, m.key) : null; })}
      {booted && legacy.map(id => createPortal(
        <div key={id} slot={`app-${id}`} className="gx2-legacy text-bony-text font-sans" style={{ height: '100%', overflow: 'hidden' }}>
          <LegacyPage id={id} render={renderPage} />
        </div>,
        hostRef.current!,
        id,
      ))}
    </div>
  );
};

export default OsHost;
