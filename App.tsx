
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
import Export, { EXPORT_ALLOWED_ROLES } from './pages/Export';
import AnimatedBackground from './components/AnimatedBackground';
import { db } from './services/dataService';
import { setMySection } from './services/socket';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AnimatePresence, motion } from 'framer-motion';
import { pageVariants, pageTransition } from './lib/motion';

// Inner App handles logic after provider is mounted
const InnerApp: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dbReady, setDbReady] = useState(false);

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

  const EXTERNAL_ALLOWED_TABS = ['digital', 'chat', 'hello-marketing', 'games'];
  const GAMES_ALLOWED_ROLES = ['Master', 'Administrator', 'Coordinator', 'Digital Manager'];

  // Onglet RÉSOLU (après redirections de rôle) — sert de `key` à la transition.
  const isExternal = user?.role === 'External';
  const canAccessGames = GAMES_ALLOWED_ROLES.includes(user?.role ?? '');
  const canExport = EXPORT_ALLOWED_ROLES.includes(user?.role ?? '');
  let resolvedTab = (isExternal && !EXTERNAL_ALLOWED_TABS.includes(activeTab)) ? 'digital' : activeTab;
  if (resolvedTab === 'games' && !canAccessGames) resolvedTab = 'dashboard';
  if (resolvedTab === 'export' && !canExport) resolvedTab = 'dashboard';

  // Présence : on annonce la rubrique RÉELLEMENT affichée (`resolvedTab`), pas
  // `activeTab` brut qui peut être redirigé par les droits — sinon un External
  // apparaîtrait sur une rubrique qu'il ne voit pas.
  // Ce hook doit rester AU-DESSUS des retours anticipés ci-dessous : un hook ne
  // peut pas être appelé conditionnellement.
  useEffect(() => {
    if (user) setMySection(resolvedTab);
  }, [user, resolvedTab]);

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
      case 'settings': return <Settings />;
      default: return isExternal ? <Digital /> : <Dashboard />;
    }
  };

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
