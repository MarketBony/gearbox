
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Digital from './pages/Digital';
import Chat from './pages/Chat';
import Campaigns from './pages/Campaigns';
import Material from './pages/Material';
import Budget from './pages/Budget';
import FixedExpenses from './pages/FixedExpenses';
import Agenda from './pages/Agenda';
import Login from './pages/Login';
import Settings from './pages/Settings';
import HelloMarketing from './pages/HelloMarketing';
import Games from './pages/Games';
import TodoList from './pages/TodoList';
import Export from './pages/Export';
import { EXPORT_ALLOWED_ROLES } from './constants';
import Conges from './pages/Conges';
import { useCongesAcces, congesAccesStore } from './services/congesAcces';
import { canSeeGames, SITE_MANAGER_SECTIONS, isSiteManager } from './constants';
import { appSettingsStore, useAppSettings } from './services/appSettings';
import { useRealtimeSync, RT_EVENTS } from './services/realtime';
import AnimatedBackground from './components/AnimatedBackground';
import { db } from './services/dataService';
import { setMySection } from './services/socket';
import { refreshPushSubscription } from './services/pushNotifications';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AnimatePresence, motion } from 'framer-motion';
import { pageVariants, pageTransition } from './lib/motion';
import Ui2Gate from './ui2/Ui2Gate';
import { useUi2Active, setUi2Beta } from './ui2/beta';

// Inner App handles logic after provider is mounted
const InnerApp: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dbReady, setDbReady] = useState(false);
  // Interface v2 (Gearbox OS, bêta) : préférence du compte, lue ici pour rester au-dessus
  // des retours anticipés (un hook ne peut pas être conditionnel).
  const ui2Active = useUi2Active(user);
  // Interrupteurs de fonctionnalité : chargés une fois à l'ouverture de session,
  // puis suivis en temps réel — une extinction par le Master doit être immédiate
  // chez tout le monde, sans rechargement.
  const { gamesEnabled } = useAppSettings();

  // Réglages d'application : rechargés à chaque ouverture de session (le store part
  // du défaut prudent « éteint », donc la rubrique n'apparaît qu'une fois la réponse
  // reçue — jamais l'inverse).
  useEffect(() => {
    if (user) appSettingsStore.refresh();
  }, [user]);

  // Bascule par le Master : répercutée chez tout le monde sans rechargement.
  useRealtimeSync(RT_EVENTS.settings, () => { appSettingsStore.refresh(); });

  // Congés : le PÉRIMÈTRE décide de la visibilité de la rubrique. Rechargé à l'ouverture
  // de session, puis suivi en temps réel — être ajouté au planning doit faire apparaître
  // la rubrique sans rechargement, et en être retiré doit la faire disparaître.
  useEffect(() => {
    if (user) congesAccesStore.refresh(user.role, user.id);
  }, [user?.id, user?.role]);
  useRealtimeSync(RT_EVENTS.conges, () => { if (user) congesAccesStore.refresh(user.role, user.id); });

  useEffect(() => {
    // Initialize Data Service
    db.init().then(() => setDbReady(true));

    // Listen for internal navigation events
    const handleNavigation = (e: CustomEvent) => {
      if (e.detail && e.detail.tab) {
        setActiveTab(e.detail.tab);
      }
    };
    window.addEventListener('gearbox-navigate' as any, handleNavigation);
    return () => window.removeEventListener('gearbox-navigate' as any, handleNavigation);
  }, []);

  // `games` retiré le 14/08/2026 : la rubrique est pilotée par un interrupteur, et un
  // External n'y a de toute façon pas accès (la garde ci-dessous le rattrapait déjà).
  // 'settings' ajouté le 25/08/2026 : sans lui, un External ne pouvait ni changer son
  // mot de passe, ni sa photo, ni renseigner son anniversaire. La gestion des comptes
  // reste fermée — elle dépend de `canManageUsers`, qui ne contient pas ce rôle.
  const EXTERNAL_ALLOWED_TABS = ['digital', 'chat', 'hello-marketing', 'settings'];
  // GAMES_ALLOWED_ROLES vient désormais de constants.ts (il était dupliqué ici
  // et dans pages/Games.tsx).

  // Onglet RÉSOLU (après redirections de rôle) — sert de `key` à la transition.
  const isExternal = user?.role === 'External';
  const canAccessGames = canSeeGames(user?.role, gamesEnabled);
  const canExport = EXPORT_ALLOWED_ROLES.includes(user?.role ?? '');
  // Congés : visible pour les membres du périmètre et ceux qui le gèrent.
  const { visible: voitConges } = useCongesAcces();
  // Cascade de gardes en FONCTION : l'interface v2 l'applique à chaque fenêtre, pas
  // seulement à l'onglet actif (une fenêtre restaurée d'une session précédente passe
  // par les mêmes gardes).
  const resolveTab = (tab: string): string => {
    let resolvedTab = (isExternal && !EXTERNAL_ALLOWED_TABS.includes(tab)) ? 'digital' : tab;
    if (resolvedTab === 'games' && !canAccessGames) resolvedTab = 'dashboard';
    if (resolvedTab === 'export' && !canExport) resolvedTab = 'dashboard';
    // ⚠️ Même raison que pour les autres gardes : l'onglet actif est mémorisé en session,
    // une rubrique retirée du menu reste ATTEIGNABLE sans ceci. Le refus réel est de toute
    // façon côté serveur (`routes/conges.ts` rend 403, même sur le GET).
    if (resolvedTab === 'conges' && !voitConges) resolvedTab = 'dashboard';
    // ⚠️ Chef de site : liste FERMÉE de rubriques. Masquer la navigation ne suffit pas —
    // l'onglet actif est mémorisé en session et un événement `gearbox-navigate` peut
    // pointer n'importe où. Sans cette garde, une rubrique interdite restait
    // ATTEIGNABLE même une fois retirée du menu. `settings` est autorisé en plus des
    // 6 rubriques : chacun accède à son propre profil.
    if (isSiteManager(user?.role) && ![...SITE_MANAGER_SECTIONS, 'settings'].includes(resolvedTab)) {
      resolvedTab = 'dashboard';
    }
    return resolvedTab;
  };
  const resolvedTab = resolveTab(activeTab);

  // Présence : on annonce la rubrique RÉELLEMENT affichée (`resolvedTab`), pas
  // `activeTab` brut qui peut être redirigé par les droits — sinon un External
  // apparaîtrait sur une rubrique qu'il ne voit pas.
  // Ce hook doit rester AU-DESSUS des retours anticipés ci-dessous : un hook ne
  // peut pas être appelé conditionnellement.
  useEffect(() => {
    if (user) setMySection(resolvedTab);
  }, [user, resolvedTab]);

  // Notifications push : si la permission est déjà accordée, on renvoie
  // l'abonnement au serveur à chaque démarrage. Un navigateur peut renouveler un
  // abonnement de lui-même, laissant l'ancien endpoint muet sans que personne ne
  // le sache ; le serveur faisant un upsert, ce rappel répare ce cas. Aucune
  // permission n'est demandée ici (ce serait sans effet, et interdit sur iOS
  // hors geste utilisateur).
  useEffect(() => {
    if (user) void refreshPushSubscription();
  }, [user]);

  // Clic sur une notification système : le service worker refocalise la fenêtre
  // puis nous envoie la rubrique à ouvrir.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'gearbox-notification-click' && e.data.section) {
        setActiveTab(e.data.section);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  if (loading || !dbReady) return <div className="h-screen bg-black flex items-center justify-center text-bony-orange animate-pulse font-title">INITIALISATION...</div>;

  if (!user) {
      return <Login />;
  }


  const renderContent = (tab: string) => {
    switch (tab) {
      case 'hello-marketing': return <HelloMarketing />;
      case 'games': return <Games />;
      case 'todo': return <TodoList />;
      case 'dashboard': return <Dashboard />;
      case 'projects': return <Projects viewMode="current" />;
      case 'digital': return <Digital />;
      case 'chat': return <Chat />;
      case 'archives': return <Projects viewMode="archived" />;
      case 'campaigns': return <Campaigns />;
      case 'material': return <Material />;
      case 'agenda': return <Agenda />;
      case 'budget': return <Budget />;
      case 'fixed-expenses': return <FixedExpenses />;
      case 'export': return <Export />;
      case 'conges': return <Conges />;
      case 'settings': return <Settings />;
      default: return isExternal ? <Digital /> : <Dashboard />;
    }
  };

  // Bêta v2 : la coque reçoit l'onglet DÉJÀ résolu par les gardes de rôle ci-dessus —
  // elle n'a aucune logique de droits propre.
  if (ui2Active) {
    return (
      <Ui2Gate
        tab={resolvedTab}
        setTab={setActiveTab}
        resolveTab={resolveTab}
        renderPage={renderContent}
        onExit={() => setUi2Beta(user.id, false)}
      />
    );
  }

  return (
    <div className="flex h-screen text-bony-text font-sans selection:bg-blue-500/30 transition-colors duration-300">
      <AnimatedBackground />
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 ml-0 md:ml-20 lg:ml-56 relative overflow-hidden pb-16 md:pb-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={resolvedTab}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
            className="h-full"
          >
            {renderContent(resolvedTab)}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
      <AuthProvider>
          <ThemeProvider>
            <InnerApp />
          </ThemeProvider>
      </AuthProvider>
  );
};

export default App;
