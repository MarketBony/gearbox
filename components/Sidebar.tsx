
import React, { useState } from 'react';
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
  Euro,
  MoreHorizontal,
  X,
  MessageSquare
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const mainItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'projects', icon: FolderKanban, label: 'Projets' },
    { id: 'digital', icon: Globe, label: 'Digital' },
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
    { id: 'campaigns', icon: Megaphone, label: 'Campagnes' },
    { id: 'material', icon: Package, label: 'Matériel' },
    { id: 'agenda', icon: CalendarDays, label: 'Agenda' },
    { id: 'budget', icon: PiggyBank, label: 'Budget' },
    { id: 'fixed-expenses', icon: Euro, label: 'Dépenses Fixes' },
  ];

  // Bottom nav: first 5 items shown directly, rest + extras in More menu
  const bottomNavItems = mainItems.slice(0, 5);
  const moreNavItems = [
    ...mainItems.slice(5),
    { id: 'archives', icon: Archive, label: 'Projets Archivés' },
    { id: 'settings', icon: Settings, label: 'Paramètres' },
  ];

  const logoColor = theme === 'dark' ? 'white' : '#0f172a';

  const handleMoreItemClick = (id: string) => {
    setActiveTab(id);
    setShowMoreMenu(false);
  };

  const isMoreActive = moreNavItems.some(i => i.id === activeTab);

  return (
    <>
      {/* ===== DESKTOP / TABLET SIDEBAR (md+) ===== */}
      <div className="hidden md:flex w-20 lg:w-64 bg-bony-panel border-r border-bony-border flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-300">
        {/* Logo Area */}
        <div className="h-20 flex items-center justify-center lg:justify-start lg:px-6 border-b border-bony-border shrink-0">
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
          {mainItems.map((item) => {
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
            {[{ id: 'archives', icon: Archive, label: 'Projets Archivés' }].map((item) => {
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

        <div className="p-4 border-t border-bony-border bg-bony-dark space-y-2 shrink-0">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded transition-colors group"
          >
            {theme === 'dark' ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-blue-600" />}
            <span className="ml-3 hidden lg:block text-sm font-bold">
               {theme === 'dark' ? 'Mode Clair' : 'Mode Sombre'}
            </span>
          </button>

          <button
            onClick={logout}
            className="w-full flex items-center p-2 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors group"
          >
            <LogOut size={20} />
            <span className="ml-3 hidden lg:block text-sm font-bold">Me déconnecter</span>
          </button>

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

          <div className="mt-4 hidden lg:flex flex-col items-center justify-center">
            <div className="text-[9px] text-bony-muted mb-0.5">CONNECTÉ EN TANT QUE</div>
            <div className="text-xs font-bold text-bony-text uppercase flex items-center gap-1">
              {user?.loginId}
              {user?.role === 'Digital Manager' && <Globe size={10} className="text-bony-violet"/>}
            </div>
          </div>
        </div>
      </div>

      {/* ===== MOBILE BOTTOM NAV (< md) ===== */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-bony-panel border-t border-bony-border flex items-stretch h-16">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px] ${
                isActive ? 'text-bony-orange' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[9px] font-bold leading-none truncate px-0.5">
                {item.label.split(' ')[0]}
              </span>
            </button>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setShowMoreMenu(true)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px] ${
            isMoreActive ? 'text-bony-orange' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <MoreHorizontal size={20} />
          <span className="text-[9px] font-bold leading-none">Plus</span>
        </button>
      </div>

      {/* ===== MORE MENU OVERLAY (mobile) ===== */}
      {showMoreMenu && (
        <div className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMoreMenu(false)}
          />
          {/* Bottom sheet */}
          <div className="relative bg-bony-panel border-t border-bony-border rounded-t-2xl p-4 pb-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Navigation</span>
              <button
                onClick={() => setShowMoreMenu(false)}
                className="p-1.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {moreNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleMoreItemClick(item.id)}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-colors min-h-[64px] ${
                      isActive
                        ? 'bg-bony-gradient text-white shadow-lg'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon size={22} />
                    <span className="text-[10px] font-bold text-center leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-bony-border pt-3 flex gap-3">
              <button
                onClick={() => { toggleTheme(); setShowMoreMenu(false); }}
                className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 min-h-[44px]"
              >
                {theme === 'dark'
                  ? <Sun size={18} className="text-yellow-400" />
                  : <Moon size={18} className="text-blue-600" />}
                <span className="text-xs font-bold">
                  {theme === 'dark' ? 'Mode Clair' : 'Mode Sombre'}
                </span>
              </button>
              <button
                onClick={() => { logout(); setShowMoreMenu(false); }}
                className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-red-500/10 text-red-500 min-h-[44px]"
              >
                <LogOut size={18} />
                <span className="text-xs font-bold">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
