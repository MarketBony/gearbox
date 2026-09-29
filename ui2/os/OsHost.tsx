import React, { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import css from './maquette.css?inline';
import overridesCss from './overrides.css?inline';
import { boot } from './engine/boot';
import DataHub from './DataHub';
import { bridgeStore, useLegacyIds, tabOf } from './bridge';
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
  const hostRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const host = hostRef.current!;
    if (host.shadowRoot) { setBooted(true); return; }     // React.StrictMode : l'effet est rejoué
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `${css}\n${overridesCss}`;
    const body = document.createElement('div');
    body.className = 'gx-body';
    shadow.append(style, body);
    boot(host, shadow, body);
    setBooted(true);
  }, []);

  // Premier rendu d'une page à l'ouverture de sa fenêtre : en TRANSITION, pour que React le
  // découpe au lieu de bloquer l'animation d'ouverture (tâches de ~100 ms mesurées sinon).
  const legacyIds = useLegacyIds();
  const [legacy, setLegacy] = useState(legacyIds);
  useEffect(() => { startTransition(() => setLegacy(legacyIds)); }, [legacyIds]);
  return (
    <div ref={hostRef} className="gx2-host" style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
      {booted && <DataHub />}
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
