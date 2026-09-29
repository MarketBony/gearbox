import React, { useEffect, useMemo, useRef, useState } from 'react';
import './styles/tokens.css';
import './styles/shell.css';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAppSettings } from '../services/appSettings';
import { useCongesAcces } from '../services/congesAcces';
import { computeNav } from '../services/navigation';
import { useNavBadges } from '../services/navBadges';
import { useWindows, Win } from './wm';
import Window from './Window';
import Dock, { DockEntry } from './Dock';
import MenuBar from './MenuBar';
import type { MenuItem } from './Menu';

// Coque de l'interface v2 (Gearbox OS) — lot 1a : bureau, fenêtres, Dock, barre du haut.
// ⚠️ Aucune logique métier ni de droits ici :
//  - les rubriques visibles viennent de `computeNav` (même source que la Sidebar) ;
//  - chaque fenêtre passe par `resolveTab`, la cascade de gardes d'App.tsx ;
//  - le contenu d'une fenêtre est la page ACTUELLE (`renderPage`), tant que la rubrique
//    n'est pas portée (lots 2 → 16).
// La rubrique de la fenêtre active remonte dans `setTab` : présence, notifications
// système et `gearbox-navigate` continuent donc de passer par App.tsx.

export interface Ui2RootProps {
  /** Rubrique active, après les gardes de rôle d'App.tsx. */
  tab: string;
  setTab: (tab: string) => void;
  resolveTab: (tab: string) => string;
  renderPage: (tab: string) => React.ReactNode;
  /** Retour à l'ancienne interface (coupe la préférence bêta). */
  onExit: () => void;
}

const PREF_KEY = (userId: string) => `gearbox_ui2_prefs:${userId}`;
interface Prefs { mbAuto: boolean }
const readPrefs = (userId: string): Prefs => {
  try { return { mbAuto: true, ...JSON.parse(localStorage.getItem(PREF_KEY(userId)) || '{}') }; } catch { return { mbAuto: true }; }
};

const EXTRA_TITLES: Record<string, string> = { archives: 'Archives', settings: 'Paramètres' };
const MENUBAR_H = 30;

const Ui2Root: React.FC<Ui2RootProps> = ({ tab, setTab, resolveTab, renderPage, onExit }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { gamesEnabled } = useAppSettings();
  const { visible: voitConges } = useCongesAcces();
  const nav = computeNav({ role: user?.role, gamesEnabled, voitConges });
  const { chatUnread, gamesChallenges } = useNavBadges(user, gamesEnabled);
  const wm = useWindows(user!.id);
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs(user!.id));
  const [snapHint, setSnapHint] = useState<Win['mode'] | null>(null);

  useEffect(() => {
    try { localStorage.setItem(PREF_KEY(user!.id), JSON.stringify(prefs)); } catch { /* ignore */ }
  }, [prefs, user]);

  const titleOf = (id: string) => nav.mainItems.find(i => i.id === id)?.label || EXTRA_TITLES[id] || id;

  // Une fenêtre qui ne passe plus les gardes (rôle changé, Jeux éteints, sortie du
  // périmètre des Congés…) est fermée — même règle que `resolvedTab`.
  useEffect(() => {
    wm.wins.forEach(w => { if (resolveTab(w.id) !== w.id) wm.close(w.id); });
  }, [wm.wins, resolveTab]);

  // Synchronisation App ⇄ coque. ⚠️ Sans garde, les deux sens se renvoyaient la balle
  // (fenêtre active → setTab → tab → open → fenêtre active…) jusqu'au plantage.
  // `pushed` retient la dernière rubrique que la COQUE a envoyée : son écho est ignoré.
  const pushed = useRef<string | null>(null);

  // App → coque : une navigation extérieure (`gearbox-navigate`, clic de notification)
  // ouvre ou ramène la fenêtre. Au premier montage, une session restaurée prime.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (wm.wins.length > 0) return;
    }
    if (tab === pushed.current) return;
    pushed.current = null;
    wm.open(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Coque → App : la fenêtre active devient la rubrique courante (présence).
  useEffect(() => {
    if (wm.active && wm.active.id !== tab) {
      pushed.current = wm.active.id;
      setTab(wm.active.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wm.active?.id]);

  // Un `gearbox-navigate` vers la rubrique DÉJÀ courante ne change pas `tab` : on
  // rouvre quand même sa fenêtre si elle a été fermée ou réduite.
  useEffect(() => {
    const h = (e: CustomEvent) => { const t = e.detail?.tab; if (t) wm.open(resolveTab(t)); };
    window.addEventListener('gearbox-navigate' as any, h);
    return () => window.removeEventListener('gearbox-navigate' as any, h);
  }, [resolveTab, wm.open]);

  const openApp = (id: string) => {
    const w = wm.wins.find(x => x.id === id);
    // Clic sur l'icône de la fenêtre déjà au premier plan : elle se réduit (comme macOS).
    if (w && !w.min && wm.active?.id === id) wm.minimize(id);
    else wm.open(id);
  };

  const active = wm.active;
  const merged = !!active && active.mode === 'max';
  const topInset = prefs.mbAuto ? 0 : MENUBAR_H;
  const badge = (id: string) =>
    id === 'chat' && chatUnread > 0 ? (chatUnread > 99 ? '99+' : String(chatUnread))
      : id === 'games' && gamesChallenges > 0 ? (gamesChallenges > 9 ? '9+' : String(gamesChallenges))
        : undefined;

  const dockMain: DockEntry[] = nav.mainItems.map(i => ({ id: i.id, label: i.label, badge: badge(i.id) }));
  const dockExtra: DockEntry[] = [
    ...(nav.allowedIds.has('archives') ? [{ id: 'archives', label: 'Archives' }] : []),
    { id: 'settings', label: 'Paramètres' },
  ];
  const running = useMemo(() => new Set(wm.wins.map(w => w.id)), [wm.wins]);

  const gearboxMenu: MenuItem[] = [
    { label: 'Paramètres', action: () => wm.open('settings') },
    { label: 'Barre du haut escamotable', checked: prefs.mbAuto, action: () => setPrefs(p => ({ ...p, mbAuto: !p.mbAuto })) },
    { label: theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre', action: toggleTheme },
    '-',
    { label: "Revenir à l'ancienne interface", action: onExit },
    '-',
    { label: 'Déconnexion', danger: true, action: logout },
  ];
  const windowMenu: MenuItem[] = [
    { label: 'Réduire', disabled: !active, action: () => active && wm.minimize(active.id) },
    { label: active?.mode === 'normal' ? 'Agrandir' : 'Restaurer', disabled: !active, action: () => active && wm.toggleMax(active.id) },
    { label: 'Ancrer à gauche', disabled: !active, action: () => active && wm.setMode(active.id, 'left') },
    { label: 'Ancrer à droite', disabled: !active, action: () => active && wm.setMode(active.id, 'right') },
    { label: 'Fermer', disabled: !active, action: () => active && wm.close(active.id) },
    '-',
    { label: 'Afficher le bureau', disabled: wm.wins.length === 0, action: wm.minimizeAll },
    ...(wm.wins.length ? ['-' as const] : []),
    ...wm.wins.map(w => ({ label: titleOf(w.id), checked: active?.id === w.id, action: () => wm.open(w.id) })),
  ];

  const clock = useClock();

  return (
    <div className="gx2" data-theme={theme === 'light' ? 'light' : 'dark'} data-material="liquid">
      <div className="gx2-wallpaper" aria-hidden="true" />

      <div className="gx2-desk">
        {wm.wins.map(w => (
          <Window
            key={w.id}
            win={w}
            title={titleOf(w.id)}
            active={active?.id === w.id}
            merged={merged && active?.id === w.id}
            topInset={topInset}
            onFocus={() => wm.focus(w.id)}
            onClose={() => wm.close(w.id)}
            onMinimize={() => wm.minimize(w.id)}
            onToggleMax={() => wm.toggleMax(w.id)}
            onGeometry={p => wm.patch(w.id, p)}
            onSnapHint={setSnapHint}
          >
            {/* Page actuelle, dans le même contexte typographique que l'ancienne coque. */}
            <div className="gx2-legacy h-full text-bony-text font-sans">{renderPage(w.id)}</div>
          </Window>
        ))}
        {snapHint && <div className={`gx2-snap-preview snap-${snapHint}`} style={{ top: topInset }} />}
      </div>

      <MenuBar
        auto={prefs.mbAuto}
        active={active}
        activeTitle={active ? titleOf(active.id) : ''}
        merged={merged}
        gearboxMenu={gearboxMenu}
        windowMenu={windowMenu}
        onLights={{
          close: () => active && wm.close(active.id),
          minimize: () => active && wm.minimize(active.id),
          toggleMax: () => active && wm.toggleMax(active.id),
        }}
        right={<>
          <span className="gx2-mb-item gx2-beta">bêta</span>
          <span className="gx2-mb-item">{user?.name}</span>
          <span className="gx2-mb-item gx2-mb-clock">{clock}</span>
        </>}
      />

      <Dock
        main={dockMain}
        extra={dockExtra}
        running={running}
        hidden={!!active && active.mode !== 'normal'}
        onOpen={openApp}
        onClose={wm.close}
      />
    </div>
  );
};

function useClock() {
  const fmt = () => new Date().toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const [t, setT] = useState(fmt);
  useEffect(() => { const i = setInterval(() => setT(fmt()), 15000); return () => clearInterval(i); }, []);
  return t;
}

export default Ui2Root;
