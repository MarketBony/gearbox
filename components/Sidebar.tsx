
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Megaphone, 
  Package, 
  CalendarDays, 
  PiggyBank,
  Settings,
  Archive,
  LogOut,
  Globe,
  Sun,
  Moon,
  Euro
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'projects', icon: FolderKanban, label: 'Projets' },
    { id: 'digital', icon: Globe, label: 'Digital' }, 
    { id: 'campaigns', icon: Megaphone, label: 'Campagnes' },
    { id: 'material', icon: Package, label: 'Matériel' },
    { id: 'agenda', icon: CalendarDays, label: 'Agenda' },
    { id: 'budget', icon: PiggyBank, label: 'Budget' },
    { id: 'fixed-expenses', icon: Euro, label: 'Dépenses Fixes' },
  ];

  const bottomItems = [
    { id: 'archives', icon: Archive, label: 'Projets Archivés' },
  ];

  // Couleur dynamique pour le SVG Logo
  const logoColor = theme === 'dark' ? 'white' : '#0f172a';

  return (
    <div className="w-20 lg:w-64 bg-bony-panel border-r border-bony-border flex flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-300">
      {/* Logo Area */}
      <div className="h-20 flex items-center justify-center lg:justify-start lg:px-6 border-b border-bony-border">
        {/* Gearbox Logo SVG */}
        <div className="shrink-0">
          <svg width="40" height="40" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 20 V80" stroke={logoColor} strokeWidth="8" strokeLinecap="round"/>
            <path d="M80 20 V80" stroke={logoColor} strokeWidth="8" strokeLinecap="round"/>
            <path d="M20 50 H80" stroke={logoColor} strokeWidth="8" strokeLinecap="round"/>
            <path d="M50 50 V25" stroke={logoColor} strokeWidth="8" strokeLinecap="round"/>
            <circle cx="50" cy="20" r="10" fill={logoColor}/>
          </svg>
        </div>
        <div className="ml-3 hidden lg:flex flex-col justify-center">
            <span className="font-title font-bold text-xl text-bony-text tracking-widest leading-none">GEARBOX</span>
            <span className="text-[10px] text-bony-orange tracking-[0.2em] font-sans uppercase font-bold mt-1">Plaque Edition</span>
        </div>
      </div>

      <nav className="flex-1 py-6 space-y-2 px-3 overflow-y-auto custom-scrollbar">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center p-3 rounded-lg transition-all duration-300 group relative overflow-hidden ${
                isActive 
                  ? 'text-white shadow-lg shadow-bony-violet/20' 
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {isActive && (
                <div className="absolute inset-0 bg-bony-gradient opacity-100" />
              )}
              
              <div className="relative z-10 flex items-center w-full">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} className={isActive ? "text-white" : "group-hover:text-bony-orange transition-colors"} />
                <span className={`ml-4 font-medium hidden lg:block tracking-wide ${isActive ? 'font-bold' : ''}`}>
                  {item.label}
                </span>
              </div>
            </button>
          );
        })}

        <div className="pt-4 mt-4 border-t border-bony-border">
            <div className="px-3 mb-2 text-[10px] font-bold text-bony-muted uppercase tracking-widest hidden lg:block">Historique</div>
            {bottomItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
                <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center p-3 rounded-lg transition-all duration-300 group relative overflow-hidden ${
                    isActive 
                    ? 'text-white bg-slate-800' 
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                }`}
                >
                <div className="relative z-10 flex items-center w-full">
                    <Icon size={20} strokeWidth={2} className={isActive ? "text-white" : "group-hover:text-bony-text transition-colors"} />
                    <span className={`ml-4 font-medium hidden lg:block tracking-wide ${isActive ? 'font-bold' : ''}`}>
                    {item.label}
                    </span>
                </div>
                </button>
            );
            })}
        </div>
      </nav>

      <div className="p-4 border-t border-bony-border bg-bony-dark space-y-2">
        {/* THEME TOGGLE */}
        <button 
          onClick={toggleTheme}
          className="w-full flex items-center p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded transition-colors group"
        >
          {theme === 'dark' ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-blue-600" />}
          <span className="ml-3 hidden lg:block text-sm font-bold">
             {theme === 'dark' ? 'Mode Clair' : 'Mode Sombre'}
          </span>
        </button>

        {/* LOGOUT BUTTON */}
        <button 
          onClick={logout}
          className="w-full flex items-center p-2 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors group"
        >
          <LogOut size={20} />
          <span className="ml-3 hidden lg:block text-sm font-bold">Me déconnecter</span>
        </button>

        {/* SETTINGS BUTTON */}
        <button 
          onClick={() => setActiveTab('settings')}
          className={`w-full flex items-center p-2 rounded transition-colors group ${
              activeTab === 'settings' 
              ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5' 
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Settings size={20} className="group-hover:text-bony-violet transition-colors" />
          <span className="ml-3 hidden lg:block text-sm">Paramètres</span>
        </button>

        <div className="mt-4 flex flex-col items-center justify-center hidden lg:flex">
             <div className="text-[9px] text-bony-muted mb-0.5">CONNECTÉ EN TANT QUE</div>
             <div className="text-xs font-bold text-bony-text uppercase flex items-center gap-1">
                 {user?.loginId}
                 {user?.role === 'Digital Manager' && <Globe size={10} className="text-bony-violet"/>}
             </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
