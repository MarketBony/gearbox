
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Avatar from './Avatar';
import PresenceBubbles from './PresenceBubbles';
import { db } from '../services/dataService';
import { chatStore } from '../services/chatStore';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { usePresence } from '../services/presenceStore';
import { useCongesAcces } from '../services/congesAcces';
import { setAppBadge } from '../services/pushNotifications';
import { ActivityLog } from '../types';
// Source unique des rôles ayant accès aux Jeux (Director en est exclu, règle métier).
import { canSeeGames, SITE_MANAGER_SECTIONS, isSiteManager, hasSocialFeatures } from '../constants';
import { useAppSettings } from '../services/appSettings';
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
  MessageSquare,
  Bell,
  Sparkles,
  Gamepad2,
  CheckSquare,
  FileSpreadsheet,
  Palmtree
} from 'lucide-react';

const relativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
};

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  // Interrupteur général de la rubrique Jeux, piloté en ligne par le Master.
  // Re-rendu automatique à la bascule : la rubrique disparaît/réapparaît sans
  // que personne n'ait à recharger.
  const { gamesEnabled } = useAppSettings();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [lastReadTs, setLastReadTs] = useState<string | null>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [gamesChallengeCount, setGamesChallengeCount] = useState(0);

  const loadActivity = () => {
    // GET /api/activity-log — best-effort : la cloche reste vide si l'API est injoignable.
    db.getActivityLog().then(setActivityLog).catch(() => { /* ignore */ });
    setLastReadTs(localStorage.getItem('gearbox_activity_last_read'));
  };

  const loadChatUnread = () => {
    if (!user) return;
    // Source unique : le store chat alimenté par le socket (temps réel), plus de localStorage.
    const total = chatStore.getUnreadTotal(user.id);
    setChatUnreadCount(total);
    // PWA : même compteur sur l'icône de l'application installée (façon
    // Messenger). Posé ici parce que le total y est déjà calculé — le dupliquer
    // ailleurs, c'est prendre le risque que les deux divergent.
    setAppBadge(total);
  };

  // ⚠️ Lisait `localStorage.gearbox_game_challenges` avec un polling 3 s jusqu'au
  // 05/08/2026 : la pastille ne pouvait donc JAMAIS montrer un défi reçu, puisque le
  // défi était écrit dans le navigateur de l'émetteur. Oubli résiduel de la refonte
  // des Jeux — le reste du module était passé au serveur, pas ce compteur.
  // Désormais serveur, et rafraîchi par l'événement socket (voir plus bas), donc
  // sans polling.
  const loadGamesChallenges = () => {
    if (!canSeeGames(user?.role, gamesEnabled)) {
      setGamesChallengeCount(0);
      return;
    }
    db.getGamesLobby()
      .then(d => setGamesChallengeCount(
        d.challenges.filter(c => c.toUserId === user.id && c.status === 'pending').length
      ))
      .catch(() => { /* réseau : on garde la valeur précédente */ });
  };

  useEffect(() => {
    loadActivity();
    loadChatUnread();
    loadGamesChallenges();
    const actHandler = () => loadActivity();
    const chatHandler = () => loadChatUnread();
    window.addEventListener('gearbox-activity-updated', actHandler);
    window.addEventListener('gearbox-chat-unread-updated', chatHandler);
    return () => {
      window.removeEventListener('gearbox-activity-updated', actHandler);
      window.removeEventListener('gearbox-chat-unread-updated', chatHandler);
    };
  }, []);

  // Défis reçus : le socket remplace le polling 3 s supprimé ci-dessus. La pastille
  // apparaît donc dès qu'un collègue lance un défi, sans rechargement.
  useRealtimeSync(RT_EVENTS.games, loadGamesChallenges);

  // Temps réel du journal d'activité : 'gearbox-activity-updated' ci-dessus est
  // un événement window, donc limité à l'onglet qui a écrit. La cloche ne
  // montrait l'activité des autres utilisateurs qu'après un rechargement.
  useRealtimeSync(RT_EVENTS.activity, loadActivity);

  const openActivity = () => {
    setShowActivity(true);
  };

  const closeActivity = () => {
    const now = new Date().toISOString();
    localStorage.setItem('gearbox_activity_last_read', now);
    setLastReadTs(now);
    setShowActivity(false);
  };

  const handleEntryClick = (entry: ActivityLog) => {
    closeActivity();
    const detail: Record<string, string> = {};
    switch (entry.entity) {
      case 'project':
        detail.tab = 'projects';
        if (entry.entityId) {
          window.sessionStorage.setItem('pendingProjectId', entry.entityId);
          detail.projectId = entry.entityId;
        }
        break;
      case 'post':
        detail.tab = 'digital';
        break;
      case 'task':
        detail.tab = 'campaigns';
        if (entry.entityId) {
          window.sessionStorage.setItem('pendingProjectId', entry.entityId);
          detail.projectId = entry.entityId;
        }
        break;
      case 'fixed-expense':
        detail.tab = 'fixed-expenses';
        break;
      case 'equipment':
      case 'booking':
        detail.tab = 'material';
        break;
      case 'user':
        detail.tab = 'settings';
        break;
      default:
        detail.tab = 'dashboard';
    }
    window.dispatchEvent(new CustomEvent('gearbox-navigate', { detail }));
  };

  const unreadCount = activityLog.filter(e =>
    lastReadTs ? new Date(e.timestamp) > new Date(lastReadTs) : true
  ).length;

  // Présence des AUTRES utilisateurs par rubrique (soi-même exclu : on sait
  // déjà où on est, et ça économise une place précieuse sur mobile).
  // Chef de site : consultation seule, cloisonné, et sans aucune interaction avec
  // l'équipe marketing (ni cloche d'actualité, ni bulles de présence — les siennes
  // comme celles des autres). Déclaré ICI, avant la présence qui s'en sert.
  const isSiteManagerUser = isSiteManager(user?.role);
  const showSocial = hasSocialFeatures(user?.role);

  const presenceBrute = usePresence(user?.id);
  // ⚠️ Un chef de site ne voit AUCUNE bulle de présence — ni la sienne, ni celles des
  // autres. On neutralise la SOURCE plutôt que d'ajouter une condition aux cinq
  // endroits qui rendent <PresenceBubbles/> : c'est le genre d'oubli qui laisse une
  // bulle traîner dans une variante de nav. Le serveur ne lui envoie de toute façon
  // rien (registerPresenceHandlers n'est pas enregistré pour ce rôle).
  const presence = showSocial ? presenceBrute : {};

  const isExternal = user?.role === 'External';
  // ⚠️ Cette ligne réécrivait la liste des rôles EN DUR, alors que le commentaire de
  // l'import affirmait s'appuyer sur la constante partagée : la constante ne pilotait
  // donc NI le menu latéral NI la nav groupée. Test unique désormais, qui intègre
  // l'interrupteur général piloté par le Master.
  const canAccessGames = canSeeGames(user?.role, gamesEnabled);
  const canExport = user?.role === 'Master' || user?.role === 'Administrator' || user?.role === 'Director' || user?.role === 'Coordinator';
  // ⚠️ Congés : la rubrique n'est visible que pour les MEMBRES du périmètre et ceux qui
  // le gèrent — tous les comptes Gearbox ne sont pas du marketing. Défaut prudent à
  // `false` tant que la lecture n'a pas abouti (voir services/congesAcces.ts).
  const { visible: voitConges } = useCongesAcces();

  const allMainItems = [
    { id: 'hello-marketing', icon: Sparkles, label: 'Hello Marketing' },
    ...(canAccessGames ? [{ id: 'games', icon: Gamepad2, label: 'Jeux' }] : []),
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'projects', icon: FolderKanban, label: 'Projets' },
    ...(!isExternal ? [{ id: 'todo', icon: CheckSquare, label: 'To-do' }] : []),
    { id: 'digital', icon: Globe, label: 'Digital' },
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
    { id: 'campaigns', icon: Megaphone, label: 'Campagnes' },
    { id: 'material', icon: Package, label: 'Matériel' },
    { id: 'agenda', icon: CalendarDays, label: 'Agenda' },
    { id: 'budget', icon: PiggyBank, label: 'Budget' },
    { id: 'fixed-expenses', icon: Euro, label: 'Dépenses' },
    ...(canExport ? [{ id: 'export', icon: FileSpreadsheet, label: 'Export' }] : []),
    ...(voitConges ? [{ id: 'conges', icon: Palmtree, label: 'Congés' }] : []),
  ];

  // Chef de site : liste FERMÉE de rubriques (Dashboard, Projets, Digital, Hello
  // Marketing, Budget, Agenda). Tout le reste lui est refusé — et pas seulement
  // masqué : les routes correspondantes le rejettent côté serveur.
  const mainItems = isSiteManagerUser
    ? allMainItems.filter(i => SITE_MANAGER_SECTIONS.includes(i.id))
    : isExternal
      ? allMainItems.filter(i => ['digital', 'chat', 'hello-marketing'].includes(i.id))
      : allMainItems;

  // ============================================================================
  // BARRE DU BAS (mobile) — liste EXPLICITE, demandée par Théo le 05/08/2026
  //
  // Avant, c'était `mainItems.slice(0, 5)` : la barre héritait donc de l'ordre du
  // menu latéral, d'où Hello Marketing et Jeux en première position alors que ce
  // ne sont pas les rubriques du quotidien. On choisit désormais explicitement.
  //
  // ⚠️ On pioche les ids DANS `mainItems` et non dans une liste parallèle : le
  // gating par rôle (Jeux, Export, External) y est déjà porté, on l'hérite donc
  // gratuitement au lieu de le réimplémenter — et une rubrique retirée à un rôle
  // ne peut pas réapparaître par la barre.
  // ============================================================================
  const MOBILE_BAR_IDS = ['dashboard', 'projects', 'todo', 'agenda', 'chat'];

  // Ordre = celui de MOBILE_BAR_IDS, pas celui du menu latéral.
  const preferredBottom = MOBILE_BAR_IDS
    .map(id => mainItems.find(i => i.id === id))
    .filter((i): i is typeof mainItems[number] => !!i);

  // ⚠️ Repli indispensable pour le rôle EXTERNAL : il n'a que Digital, Chat et
  // Hello Marketing, et son menu « Plus » est vide (voir plus bas). Sans ce repli
  // il n'aurait que « Chat » dans sa barre et les deux autres rubriques
  // deviendraient tout simplement inaccessibles sur mobile.
  const bottomNavItems = preferredBottom.length >= 3
    ? preferredBottom
    : mainItems.slice(0, 5);

  // ⚠️ « Plus » = tout ce qui n'est PAS dans la barre, et non plus un découpage par
  // indice (`slice(5)`). Avec l'ancienne formule, changer la barre aurait fait
  // disparaître Hello Marketing et Jeux du mobile tout en dupliquant Agenda et Chat.
  const bottomIds = new Set(bottomNavItems.map(i => i.id));
  // ⚠️ L'External avait un menu « Plus » VIDE, à dessein : ses trois rubriques tiennent
  // déjà dans la barre du bas (correctif 31). Mais depuis qu'il a accès aux Paramètres,
  // un menu vide les rendrait INATTEIGNABLES depuis un téléphone — or c'est justement
  // là qu'on change sa photo de profil. On lui rend donc un « Plus » qui ne contient
  // que ça.
  const moreNavItems = isExternal
    ? [{ id: 'settings', icon: Settings, label: 'Paramètres' }]
    : [
        ...mainItems.filter(i => !bottomIds.has(i.id)),
        { id: 'archives', icon: Archive, label: 'Projets Archivés' },
        { id: 'settings', icon: Settings, label: 'Paramètres' },
      ];

  const logoColor = theme === 'dark' ? 'white' : '#0f172a';

  const handleMoreItemClick = (id: string) => {
    setActiveTab(id);
    setShowMoreMenu(false);
  };

  const isMoreActive = moreNavItems.some(i => i.id === activeTab);

  // Sur mobile, 8 rubriques sur 13 sont derrière le bouton « Plus » : sans ça,
  // la présence y serait invisible. Le serveur ne place un utilisateur que dans
  // une seule rubrique, mais on déduplique par sécurité.
  const hiddenPresence = Array.from(
    new Map(
      moreNavItems.flatMap(i => presence[i.id] || []).map(u => [u.userId, u])
    ).values()
  );

  return (
    <>
      {/* ===== DESKTOP / TABLET SIDEBAR (md+) ===== */}
      <div className="hidden md:flex w-20 lg:w-56 glass-strong border-r border-bony-border flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-300">

        {/* Logo Area — compact on lg */}
        <div className="flex items-center justify-center px-6 py-4 border-b border-bony-border shrink-0">
          <img src={theme === 'dark' ? '/logo-white.svg' : '/logo-color.svg'} alt="GEARBOX" className="w-full max-w-[180px] h-auto object-contain" />
        </div>

        {/* ── DESKTOP (lg+) — grouped nav ── */}
        {(() => {
          const groups = isExternal
            ? [{ label: '', items: mainItems }]
            : [
                {
                  label: '',
                  items: [{ id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' }],
                },
                {
                  label: 'GESTION DE PROJETS',
                  items: [
                    { id: 'projects', icon: FolderKanban, label: 'Projets' },
                    { id: 'todo', icon: CheckSquare, label: 'To-do' },
                  ],
                },
                {
                  label: 'COM DIGITALE',
                  items: [
                    { id: 'digital', icon: Globe, label: 'Digital' },
                    { id: 'campaigns', icon: Megaphone, label: 'Campagnes' },
                  ],
                },
                {
                  label: 'COMMUNAUTÉ',
                  items: [
                    { id: 'hello-marketing', icon: Sparkles, label: 'Hello Marketing' },
                    // ⚠️ Cette liste est ÉCRITE EN DUR : une rubrique ajoutée au seul
                    // `allMainItems` serait invisible ICI, c'est-à-dire sur l'écran
                    // desktop principal — piège n°1 de ce fichier. Le filtrage par rôle,
                    // lui, s'applique bien : `idsAutorises` dérive de `mainItems`.
                    { id: 'conges', icon: Palmtree, label: 'Congés' },
                    ...(canAccessGames ? [{ id: 'games', icon: Gamepad2, label: 'Jeux' }] : []),
                    { id: 'chat', icon: MessageSquare, label: 'Chat' },
                  ],
                },
                {
                  label: 'OUTILS',
                  items: [
                    { id: 'budget', icon: PiggyBank, label: 'Budget' },
                    { id: 'fixed-expenses', icon: Euro, label: 'Dépenses' },
                    { id: 'material', icon: Package, label: 'Matériel' },
                    { id: 'agenda', icon: CalendarDays, label: 'Agenda' },
                    ...(canExport ? [{ id: 'export', icon: FileSpreadsheet, label: 'Export' }] : []),
                  ],
                },
                {
                  label: 'HISTORIQUE',
                  items: [{ id: 'archives', icon: Archive, label: 'Archives' }],
                },
              ];

          // ⚠️ Cette nav groupée réécrivait ses rubriques EN DUR et ignorait
          // complètement `mainItems` : un rôle restreint voyait donc toute la
          // navigation malgré le filtrage (constaté par Théo le 05/08/2026 avec le
          // premier compte chef de site). On la réaligne sur la source unique —
          // `mainItems` porte déjà toutes les règles de rôle. Archives n'y figurant
          // pas, on l'autorise explicitement pour les rôles qui y ont droit.
          const idsAutorises = new Set([
            ...mainItems.map(i => i.id),
            ...(isSiteManagerUser ? [] : ['archives']),
          ]);
          const groupesFiltres = groups
            .map(g => ({ ...g, items: g.items.filter(i => idsAutorises.has(i.id)) }))
            .filter(g => g.items.length > 0);

          return (
            <nav className="hidden lg:flex flex-1 flex-col py-2 px-2 overflow-y-auto [&::-webkit-scrollbar]:w-0 [-ms-overflow-style:none] [scrollbar-width:none]">
              {groupesFiltres.map((group, gi) => (
                <div key={group.label || gi} className={gi > 0 ? 'mt-1' : ''}>
                  {gi > 0 && <div className="h-px bg-bony-border/50 mx-1 my-1.5" />}
                  {group.label && (
                    <div className="px-2 pb-0.5 pt-0.5">
                      <span className="text-[9px] font-bold text-bony-muted uppercase tracking-widest">{group.label}</span>
                    </div>
                  )}
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center px-2 py-1.5 rounded-md transition-all duration-200 group relative overflow-hidden ${
                          isActive
                            ? 'text-white shadow-md shadow-bony-violet/20'
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {isActive && <div className="absolute inset-0 bg-bony-gradient opacity-90" />}
                        {/* min-w-0 indispensable : le bouton porte overflow-hidden,
                            sans ça la rangée dépasse sa largeur et les avatars de
                            présence sont rognés au lieu de comprimer le libellé. */}
                        <div className="relative z-10 flex items-center gap-2.5 w-full min-w-0">
                          <div className="relative shrink-0">
                            <Icon size={16} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-white' : 'group-hover:text-bony-orange transition-colors'} />
                            {item.id === 'chat' && chatUnreadCount > 0 && (
                              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-bony-orange text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                                {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                              </span>
                            )}
                            {item.id === 'games' && gamesChallengeCount > 0 && (
                              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-bony-violet text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                                {gamesChallengeCount > 9 ? '9+' : gamesChallengeCount}
                              </span>
                            )}
                          </div>
                          {/* flex-1 + min-w-0 : le libellé occupe la place restante et
                              se tronque, ce qui pousse la présence à droite sans jamais
                              la faire déborder (recette standard, plus fiable que ml-auto
                              qui n'empêche pas le débordement).
                              text-left OBLIGATOIRE : un <button> est centré par défaut
                              (UA stylesheet). Sans flex-1 le span faisait la largeur du
                              texte et ça ne se voyait pas ; avec flex-1 il est plus large,
                              donc le texte se centrait. */}
                          <span className={`flex-1 min-w-0 text-left text-[13px] font-medium truncate ${isActive ? 'font-semibold' : ''}`}>
                            {item.label}
                          </span>
                          <span className="shrink-0">
                            <PresenceBubbles users={presence[item.id] || []} size={18} max={2} />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          );
        })()}

        {/* ── TABLET (md only, not lg) — icon-only flat nav ── */}
        <nav className="flex lg:hidden flex-1 flex-col py-4 items-center gap-1 overflow-y-auto [&::-webkit-scrollbar]:w-0">
          {mainItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center justify-center w-11 h-10 rounded-lg transition-all duration-200 ${
                  isActive ? 'text-white shadow-lg shadow-bony-violet/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isActive && <div className="absolute inset-0 bg-bony-gradient rounded-lg opacity-90" />}
                <div className="relative z-10">
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-white' : 'group-hover:text-bony-orange'} />
                  {item.id === 'chat' && chatUnreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-bony-orange text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                      {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                    </span>
                  )}
                  {item.id === 'games' && gamesChallengeCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-bony-violet text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                      {gamesChallengeCount > 9 ? '9+' : gamesChallengeCount}
                    </span>
                  )}
                  {/* Présence : ancrée en BAS (les badges non-lus occupent le haut
                      à droite), centrée sous l'icône pour ne pas déborder du
                      bouton de 44px quelle que soit la largeur des bulles. */}
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                    <PresenceBubbles users={presence[item.id] || []} size={13} max={2} />
                  </div>
                </div>
              </button>
            );
          })}
          {/* Archives : hors des rubriques d'un chef de site (liste fermée). */}
          {!isExternal && !isSiteManagerUser && (
            <>
              <div className="w-6 h-px bg-bony-border/60 my-1" />
              <button
                onClick={() => setActiveTab('archives')}
                className={`relative flex items-center justify-center w-11 h-10 rounded-lg transition-all duration-200 ${
                  activeTab === 'archives' ? 'text-white bg-slate-700' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <Archive size={20} strokeWidth={2} />
              </button>
            </>
          )}
        </nav>

        {/* ── BOTTOM USER ZONE ── */}
        <div className="border-t border-bony-border shrink-0">

          {/* Desktop lg: compact user card + actions */}
          <div className="hidden lg:flex flex-col p-3 gap-2">
            {/* Row 1: user info + settings */}
            <div className="flex items-center gap-2">
              {user && <Avatar userId={user.id} name={user.name} color={user.avatarColor} size={28} />}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-bony-text truncate leading-tight">{user?.name}</p>
                <p className="text-[10px] text-bony-muted truncate leading-tight">{user?.role}</p>
              </div>
              <button
                onClick={() => setActiveTab('settings')}
                className="p-1 rounded hover:bg-white/5 text-bony-text/40 hover:text-bony-text transition-colors shrink-0"
              >
                <Settings size={14} />
              </button>
            </div>

            {/* Fil d'actualité — outil d'équipe marketing. Un chef de site n'y a pas
                accès : la route répond 403, ce n'est pas qu'un masquage. */}
            {!isExternal && showSocial && (
              <button
                onClick={openActivity}
                className="relative flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/5 text-bony-text/50 hover:text-bony-orange transition-colors w-full"
              >
                <div className="relative shrink-0">
                  <Bell size={15} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[13px] h-[13px] bg-bony-orange text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>
                <span className="text-[12px]">Fil d'actualité</span>
                {unreadCount > 0 && <span className="ml-auto text-[10px] text-bony-orange font-semibold">{unreadCount} non lu{unreadCount > 1 ? 's' : ''}</span>}
              </button>
            )}

            {/* Separator */}
            <div className="border-t border-bony-border/40" />

            {/* Row 2: theme + logout */}
            <div className="flex items-center justify-between">
              <button
                onClick={toggleTheme}
                className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/5 text-bony-text/50 hover:text-bony-text transition-colors"
              >
                {theme === 'dark' ? <Sun size={15} className="text-yellow-400" /> : <Moon size={15} className="text-blue-500" />}
                <span className="text-[11px]">{theme === 'dark' ? 'Clair' : 'Sombre'}</span>
              </button>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/5 text-red-400 hover:text-red-300 transition-colors"
              >
                <LogOut size={15} />
                <span className="text-[11px]">Déconnexion</span>
              </button>
            </div>
          </div>

          {/* Tablet md: icon buttons */}
          <div className="flex lg:hidden flex-col items-center gap-1.5 p-3">
            {!isExternal && showSocial && (
              <button onClick={openActivity} className="relative p-2 rounded hover:bg-white/10 text-bony-text/50 hover:text-bony-orange transition-colors">
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] bg-bony-orange text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            )}
            <button onClick={toggleTheme} className="p-2 rounded hover:bg-white/10 text-bony-text/50 hover:text-bony-text transition-colors">
              {theme === 'dark' ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-blue-600" />}
            </button>
            <button onClick={() => setActiveTab('settings')} className="p-2 rounded hover:bg-white/10 text-bony-text/50 hover:text-bony-text transition-colors">
              <Settings size={18} />
            </button>
            <button onClick={logout} className="p-2 rounded hover:bg-red-500/10 text-red-400 transition-colors">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ===== MOBILE BOTTOM NAV (< md) ===== */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-bony-border flex items-stretch h-16">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px] ${
                isActive ? 'text-bony-orange' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {/* Présence : dans l'espace libre en haut de la barre (64px pour
                  ~32px de contenu), centrée sur le bouton. Évite le badge
                  non-lus (coin haut-droit de l'icône) et le label (en bas).
                  Avatars à 12px : 2 + compteur tiennent dans un onglet de la
                  barre même sur un écran de 320px. */}
              <div className="absolute top-0.5 left-1/2 -translate-x-1/2">
                <PresenceBubbles users={presence[item.id] || []} size={12} max={2} />
              </div>
              <div className="relative">
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                {item.id === 'chat' && chatUnreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[14px] h-3.5 bg-bony-orange text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                  </span>
                )}
                {item.id === 'games' && gamesChallengeCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[14px] h-3.5 bg-bony-violet text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {gamesChallengeCount > 9 ? '9+' : gamesChallengeCount}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-bold leading-none truncate px-0.5">
                {item.label.split(' ')[0]}
              </span>
            </button>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setShowMoreMenu(true)}
          className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px] ${
            isMoreActive ? 'text-bony-orange' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          {/* Présence agrégée des rubriques masquées derrière ce menu. */}
          <div className="absolute top-0.5 left-1/2 -translate-x-1/2">
            <PresenceBubbles users={hiddenPresence} size={12} max={2} />
          </div>
          <MoreHorizontal size={20} />
          <span className="text-[9px] font-bold leading-none">Plus</span>
        </button>
      </div>

      {/* ===== ACTIVITY PANEL OVERLAY ===== */}
      {showActivity && (
        <div className="fixed inset-0 z-[200] flex">
          <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={closeActivity} />
          <div className="w-80 md:w-96 glass-strong glass-sheen relative overflow-hidden border-l border-bony-border h-full flex flex-col shadow-glass-lg">
            {/* Header */}
            <div className="p-4 border-b border-bony-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-bony-orange" />
                <h3 className="font-title text-sm font-bold text-bony-text tracking-widest uppercase">Fil d'actualité</h3>
              </div>
              <button
                onClick={closeActivity}
                className="p-1.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
              >
                <X size={16} />
              </button>
            </div>
            {/* Entries */}
            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-bony-border">
              {activityLog.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 p-8">
                  <Bell size={32} strokeWidth={1} />
                  <p className="text-sm text-center">Aucune activité récente.</p>
                </div>
              ) : (
                activityLog.map(entry => {
                  const isUnread = lastReadTs ? new Date(entry.timestamp) > new Date(lastReadTs) : true;
                  return (
                    <div
                      key={entry.id}
                      onClick={() => handleEntryClick(entry)}
                      className={`flex items-start gap-3 p-3 transition-colors cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 ${isUnread ? 'bg-bony-orange/5' : ''}`}
                    >
                      <div className="shrink-0 mt-0.5">
                        <Avatar userId={entry.userId} name={entry.userName} color={entry.userColor} size={30} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-bony-text leading-snug">
                          <span className="font-semibold">{entry.userName}</span>{' '}
                          <span className="text-slate-500 dark:text-slate-400">{entry.action}</span>{' '}
                          <span className="text-bony-orange font-semibold">{entry.entityName}</span>
                        </p>
                        <p className="text-[10px] text-bony-muted mt-0.5">{relativeTime(entry.timestamp)}</p>
                      </div>
                      {isUnread && (
                        <div className="w-1.5 h-1.5 rounded-full bg-bony-orange shrink-0 mt-1.5" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== MORE MENU OVERLAY (mobile) ===== */}
      {showMoreMenu && (
        <div className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMoreMenu(false)}
          />
          {/* Bottom sheet */}
          <div className="relative glass-strong glass-sheen overflow-hidden border-t border-bony-border rounded-t-2xl p-4 pb-6 shadow-glass-lg">
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
                    className={`relative flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-colors min-h-[64px] ${
                      isActive
                        ? 'bg-bony-gradient text-white shadow-lg'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {/* Détail de la présence, rubrique par rubrique : le bouton
                        « Plus » n'en donne que l'agrégat. */}
                    <div className="absolute top-1 right-1">
                      <PresenceBubbles users={presence[item.id] || []} size={14} max={2} />
                    </div>
                    <Icon size={22} />
                    <span className="text-[10px] font-bold text-center leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-bony-border pt-3 flex gap-3 flex-wrap">
              <button
                onClick={() => { setShowMoreMenu(false); openActivity(); }}
                className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 min-h-[44px] relative"
              >
                <div className="relative">
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-bony-orange text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold">Actualités</span>
              </button>
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
