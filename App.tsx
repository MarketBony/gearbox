
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
import { db } from './services/dataService';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

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

  if (loading || !dbReady) return <div className="h-screen bg-black flex items-center justify-center text-bony-orange animate-pulse font-title">INITIALISATION...</div>;

  if (!user) {
      return <Login />;
  }

  const EXTERNAL_ALLOWED_TABS = ['digital', 'chat', 'hello-marketing', 'games'];
  const GAMES_ALLOWED_ROLES = ['Master', 'Administrator', 'Coordinator', 'Digital Manager'];

  const renderContent = () => {
    const isExternal = user?.role === 'External';
    const canAccessGames = GAMES_ALLOWED_ROLES.includes(user?.role ?? '');
    let tab = (isExternal && !EXTERNAL_ALLOWED_TABS.includes(activeTab)) ? 'digital' : activeTab;
    if (tab === 'games' && !canAccessGames) tab = 'dashboard';

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
      case 'settings': return <Settings />;
      default: return isExternal ? <Digital /> : <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-bony-dark text-bony-text font-sans selection:bg-blue-500/30 transition-colors duration-300">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 ml-0 md:ml-20 lg:ml-64 relative overflow-hidden pb-16 md:pb-0">
        {renderContent()}
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
