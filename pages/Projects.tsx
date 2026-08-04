
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { Project, Task, TaskStatus, ServiceType, PlaqueName, Site, BrandType, ProjectType, User, ActivityLog } from '../types';
import { db } from '../services/dataService';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { useAuth } from '../contexts/AuthContext';
import { SITES, PLAQUES_STRUCTURE, SERVICES, SERVICE_COLORS, BRANDS, BRAND_COLORS, PROJECT_TYPES, TASK_CHANNELS, DISTRIBUTION_GROUPE_BONY, DISTRIBUTION_GROUPE_BONY_RN, ALPINE_SITES, NISSAN_SITES, RDM_BRANDS } from '../constants';
import {
    Plus, Save, Trash2, FolderKanban, CheckCircle2, Circle, PlayCircle,
    CalendarCheck, Coins, TrendingUp, TrendingDown, Search, Filter, X,
    Archive, AlertTriangle, ArrowRight, Wallet, ArrowUp, ArrowDown, Lock, ChevronDown, ChevronRight, Check, PieChart, UserCircle
} from 'lucide-react';
import Avatar from '../components/Avatar';
import DatePicker from '../components/DatePicker';
import Select from '../components/Select';
import FloatingPanel from '../components/FloatingPanel';

// Puces marque minimalistes (mêmes teintes que BRAND_COLORS, charte identique)
const BRAND_DOT: Record<string, string> = {
  Renault: 'bg-[#ffcc33]',
  Dacia: 'bg-[#6a7551]',
  Alpine: 'bg-[#0055a4]',
  Nissan: 'bg-[#c3002f]',
  Mobilize: 'bg-purple-500',
  Groupe: 'bg-slate-500',
};

// Parse local (anti-décalage J+1) : 'YYYY-MM-DD' → Date à minuit local.
const parseLocalDate = (iso: string): Date => {
    const [y, m, d] = (iso || '').split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
};

// --- TEAM SECTION COMPONENT (extracted to use its own ref for fixed dropdown) ---
interface TeamSectionProps {
    assignedIds: string[];
    unassignedUsers: User[];
    allUsers: User[];
    canEdit: boolean;
    showDropdown: boolean;
    setShowDropdown: (v: boolean) => void;
    onAdd: (userId: string) => void;
    onRemove: (userId: string) => void;
}
const TeamSection: React.FC<TeamSectionProps> = ({
    assignedIds, unassignedUsers, allUsers, canEdit,
    showDropdown, setShowDropdown, onAdd, onRemove,
}) => {
    const btnRef = useRef<HTMLButtonElement>(null);

    const handleOpenDropdown = () => setShowDropdown(!showDropdown);

    return (
        <div className="pt-2">
            <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-3">Équipe projet</label>
            <div className="flex items-center gap-2 flex-wrap">
                {assignedIds.map(uid => {
                    const u = allUsers.find(x => x.id === uid);
                    if (!u) return null;
                    const canRemove = canEdit;
                    return (
                        <div key={uid} className="relative group/av">
                            <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={34} />
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover/av:opacity-100 pointer-events-none z-20 shadow-lg">
                                {u.name}<br /><span className="text-slate-400">{u.role}</span>
                            </div>
                            {canRemove && (
                                <button
                                    onClick={() => onRemove(u.id)}
                                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/av:opacity-100 transition shadow"
                                >
                                    <X size={8} className="text-white" />
                                </button>
                            )}
                        </div>
                    );
                })}

                {canEdit && unassignedUsers.length > 0 && (
                    <>
                        <button
                            ref={btnRef}
                            onClick={handleOpenDropdown}
                            className="w-[34px] h-[34px] rounded-full border-2 border-dashed border-bony-border text-slate-400 hover:border-bony-orange hover:text-bony-orange transition flex items-center justify-center"
                            title="Ajouter un membre"
                        >
                            <Plus size={14} />
                        </button>
                        <FloatingPanel open={showDropdown} onClose={() => setShowDropdown(false)} triggerRef={btnRef} width={220} minWidth={180} maxHeight={300} className="rounded-xl">
                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                {unassignedUsers.map(u => (
                                    <button
                                        key={u.id}
                                        onClick={() => onAdd(u.id)}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/5 transition text-left"
                                    >
                                        <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={26} />
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-bony-text leading-tight truncate">{u.name}</p>
                                            <p className="text-[9px] text-bony-muted truncate">{u.role}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </FloatingPanel>
                    </>
                )}

                {assignedIds.length === 0 && (
                    <span className="text-xs text-slate-400 italic">Aucun membre assigné</span>
                )}
            </div>
        </div>
    );
};

// --- FILTER COMPONENTS ---
const ALL_PROJ_PLAQUE_SITES = Object.values(PLAQUES_STRUCTURE).flat() as string[];
const PROJ_SPECIAL_SITES: string[] = ['Alpine', 'Nissan'];

interface ProjSitePickerProps { selected: string[]; onChange: (v: string[]) => void; }
const ProjSitePicker: React.FC<ProjSitePickerProps> = ({ selected, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [expandedPlaques, setExpandedPlaques] = useState<Set<string>>(new Set(Object.keys(PLAQUES_STRUCTURE)));
    const triggerRef = useRef<HTMLDivElement>(null);

    const toggle = (site: string) =>
        onChange(selected.includes(site) ? selected.filter(s => s !== site) : [...selected, site]);
    const togglePlaque = (plaqueSites: string[]) => {
        const allSel = plaqueSites.every(s => selected.includes(s));
        if (allSel) onChange(selected.filter(s => !plaqueSites.includes(s)));
        else onChange([...selected.filter(s => !plaqueSites.includes(s)), ...plaqueSites]);
    };
    const toggleExpandPlaque = (p: string) => {
        const next = new Set(expandedPlaques);
        next.has(p) ? next.delete(p) : next.add(p);
        setExpandedPlaques(next);
    };
    const selectAll = () => onChange([...ALL_PROJ_PLAQUE_SITES, ...PROJ_SPECIAL_SITES]);
    const clearAll = () => onChange([]);
    const isAll = selected.length === 0;

    const triggerLabel = isAll ? 'Tout le réseau' : selected.length === 1 ? selected[0] : `${selected.length} sites`;

    const handleOpen = () => setOpen(v => !v);

    return (
        <div ref={triggerRef} className="relative">
            <div className="flex flex-col">
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Périmètre</span>
                <button onClick={handleOpen} className="flex items-center gap-1.5 text-xs font-bold text-bony-orange hover:text-bony-violet transition whitespace-nowrap">
                    {triggerLabel}
                    <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
            </div>
            <FloatingPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} width={256} maxHeight={340} className="rounded-xl">
                                <div className="p-2 border-b border-bony-border shrink-0">
                                    <div className="flex items-center gap-2 bg-bony-dark border border-bony-border rounded-lg px-2 py-1.5">
                                        <Search size={13} className="text-slate-500 shrink-0" />
                                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un site…" className="flex-1 bg-transparent text-xs text-bony-text outline-none placeholder-bony-muted" />
                                        {search && <button onClick={() => setSearch('')}><X size={12} className="text-slate-400" /></button>}
                                    </div>
                                </div>
                                <div className="flex gap-1 px-2 py-1.5 border-b border-bony-border shrink-0">
                                    <button onClick={clearAll} className={`flex-1 text-[10px] font-bold py-1 rounded transition ${isAll ? 'bg-bony-orange/20 text-bony-orange border border-bony-orange/40' : 'text-slate-500 hover:text-bony-text hover:bg-white/5'}`}>Tout le réseau</button>
                                    <button onClick={selectAll} className="flex-1 text-[10px] font-bold py-1 rounded text-slate-500 hover:text-bony-text hover:bg-white/5 transition">Tout sélectionner</button>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
                                    {Object.entries(PLAQUES_STRUCTURE).map(([plaqueName, sites]) => {
                                        const filtered = sites.filter(s => !search || s.toLowerCase().includes(search.toLowerCase()));
                                        if (search && filtered.length === 0) return null;
                                        const expanded = expandedPlaques.has(plaqueName);
                                        const allSel = sites.every(s => selected.includes(s));
                                        const someSel = sites.some(s => selected.includes(s));
                                        return (
                                            <div key={plaqueName}>
                                                <div className="flex items-center px-2 py-1">
                                                    <button onClick={() => toggleExpandPlaque(plaqueName)} className="flex items-center gap-1 flex-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-bony-text transition">
                                                        <ChevronRight size={11} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
                                                        {plaqueName}
                                                    </button>
                                                    <button onClick={() => togglePlaque(sites as string[])} className={`w-4 h-4 rounded border flex items-center justify-center transition ${allSel ? 'bg-bony-orange border-bony-orange' : someSel ? 'bg-bony-orange/30 border-bony-orange/50' : 'border-bony-border hover:border-bony-orange/50'}`}>
                                                        {(allSel || someSel) && <Check size={10} className="text-white" />}
                                                    </button>
                                                </div>
                                                {(expanded || search) && (search ? filtered : sites).map(site => (
                                                    <button key={site} onClick={() => toggle(site)} className="w-full flex items-center justify-between gap-2 pl-6 pr-2 py-1.5 text-xs hover:bg-white/5 transition">
                                                        <span className={`truncate min-w-0 ${selected.includes(site) ? 'text-bony-text font-bold' : 'text-slate-500'}`}>{site}</span>
                                                        {selected.includes(site) && <Check size={12} className="text-bony-orange shrink-0" />}
                                                    </button>
                                                ))}
                                            </div>
                                        );
                                    })}
                                    <div>
                                        <div className="px-2 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Entités Spécifiques</div>
                                        {PROJ_SPECIAL_SITES.filter(s => !search || s.toLowerCase().includes(search.toLowerCase())).map(site => (
                                            <button key={site} onClick={() => toggle(site)} className="w-full flex items-center justify-between gap-2 pl-6 pr-2 py-1.5 text-xs hover:bg-white/5 transition">
                                                <span className={`truncate min-w-0 ${selected.includes(site) ? 'text-bony-text font-bold' : 'text-slate-500'}`}>{site}</span>
                                                {selected.includes(site) && <Check size={12} className="text-bony-orange shrink-0" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
            </FloatingPanel>
        </div>
    );
};

const PROJ_BRAND_CHIPS: BrandType[] = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize'];
interface ProjBrandPickerProps { selected: BrandType[]; onChange: (v: BrandType[]) => void; }
const ProjBrandPicker: React.FC<ProjBrandPickerProps> = ({ selected, onChange }) => {
    const isAll = selected.length === 0;
    const toggle = (b: BrandType) => onChange(selected.includes(b) ? selected.filter(x => x !== b) : [...selected, b]);
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Marque</span>
            <div className="flex flex-wrap gap-1.5">
                <button onClick={() => onChange([])} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${isAll ? 'bg-bony-gradient border-transparent text-white shadow' : 'bg-transparent border-bony-border text-slate-500 hover:border-bony-orange/50 dark:hover:text-white hover:text-slate-900'}`}>Toutes</button>
                {PROJ_BRAND_CHIPS.map(b => {
                    const active = selected.includes(b);
                    return (
                        <button key={b} onClick={() => toggle(b)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${active ? `${BRAND_COLORS[b]} scale-105 shadow` : 'bg-transparent border-bony-border text-slate-500 hover:border-bony-orange/50 dark:hover:text-white hover:text-slate-900'}`}>{b}</button>
                    );
                })}
            </div>
        </div>
    );
};

const PROJ_SERVICE_CHIPS: ServiceType[] = ['VN', 'VO', 'APV', 'PR'];
interface ProjServicePickerProps { selected: ServiceType[]; onChange: (v: ServiceType[]) => void; }
const ProjServicePicker: React.FC<ProjServicePickerProps> = ({ selected, onChange }) => {
    const isAll = selected.length === 0;
    const toggle = (s: ServiceType) => onChange(selected.includes(s) ? selected.filter(x => x !== s) : [...selected, s]);
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Service</span>
            <div className="flex flex-wrap gap-1.5">
                <button onClick={() => onChange([])} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${isAll ? 'bg-bony-gradient border-transparent text-white shadow' : 'bg-transparent border-bony-border text-slate-500 hover:border-bony-orange/50 dark:hover:text-white hover:text-slate-900'}`}>Tous</button>
                {PROJ_SERVICE_CHIPS.map(s => {
                    const active = selected.includes(s);
                    return (
                        <button key={s} onClick={() => toggle(s)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${active ? `${SERVICE_COLORS[s]} scale-105 shadow` : 'bg-transparent border-bony-border text-slate-500 hover:border-bony-orange/50 dark:hover:text-white hover:text-slate-900'}`}>{s}</button>
                    );
                })}
            </div>
        </div>
    );
};

interface ProjectsProps {
    viewMode?: 'current' | 'archived';
}

const Projects: React.FC<ProjectsProps> = ({ viewMode = 'current' }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProjectRaw] = useState<Project | null>(null);
  const SESSION_SELECTED_KEY = `gearbox_session_projects_${viewMode}_selectedId`;
  const setSelectedProject = useCallback((p: Project | null) => {
    setSelectedProjectRaw(p);
    if (p) sessionStorage.setItem(SESSION_SELECTED_KEY, p.id);
    else sessionStorage.removeItem(SESSION_SELECTED_KEY);
  }, [SESSION_SELECTED_KEY]);
  const [saving, setSaving] = useState(false);
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  // Répartition budgétaire : bascule d'affichage/saisie (UI only) — le modèle reste en %
  const [budgetDistMode, setBudgetDistMode] = useState<'%' | '€'>('%');

  // --- PERMISSIONS ---
  const canEdit = user?.role === 'Master' || user?.role === 'Administrator' || user?.role === 'Director' || user?.role === 'Coordinator';

  // --- ARCHIVE MODAL STATE ---
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [projectToArchive, setProjectToArchive] = useState<Project | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // --- LIST WIDTH (resizable) ---
  const LIST_WIDTH_KEY = 'gearbox_projects_list_width';
  const [listWidth, setListWidth] = useState<number>(() => {
    const saved = localStorage.getItem(LIST_WIDTH_KEY);
    return saved ? Math.min(480, Math.max(240, parseInt(saved, 10))) : 320;
  });
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = listWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = ev.clientX - startX.current;
      const next = Math.min(480, Math.max(240, startWidth.current + delta));
      setListWidth(next);
    };
    const onUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setListWidth(prev => {
        localStorage.setItem(LIST_WIDTH_KEY, String(prev));
        return prev;
      });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [listWidth]);

  // --- FILTER STATES ---
  const [showFilters, setShowFilters] = useSessionState<boolean>(`projects_${viewMode}_showFilters`, false);
  const [searchTerm, setSearchTerm] = useSessionState<string>(`projects_${viewMode}_searchTerm`, '');
  const [filterSites, setFilterSites] = useSessionState<string[]>(`projects_${viewMode}_filterSites`, []);
  const [filterBrands, setFilterBrands] = useSessionState<BrandType[]>(`projects_${viewMode}_filterBrands`, []);
  const [filterServices, setFilterServices] = useSessionState<ServiceType[]>(`projects_${viewMode}_filterServices`, []);
  const [filterType, setFilterType] = useSessionState<ProjectType | 'All'>(`projects_${viewMode}_filterType`, 'All');
  const [filterStatus, setFilterStatus] = useSessionState<string>(`projects_${viewMode}_filterStatus`, 'All');
  const [filterDateFrom, setFilterDateFrom] = useSessionState<string>(`projects_${viewMode}_filterDateFrom`, '');
  const [filterDateTo, setFilterDateTo] = useSessionState<string>(`projects_${viewMode}_filterDateTo`, '');
  const [sortOrder, setSortOrder] = useSessionState<'asc' | 'desc'>(`projects_${viewMode}_sortOrder`, 'desc');

  const scrollRef = useScrollRestore(`projects_${viewMode}`);

  useEffect(() => {
    loadProjects();
    db.getUsers().then(setUsers);

    const handleNavigation = (e: CustomEvent) => {
        if (e.detail && e.detail.projectId) {
            const targetId = e.detail.projectId;
            window.sessionStorage.setItem('pendingProjectId', targetId);
            
            db.getProjects().then(data => {
                setProjects(data);
                const found = data.find(p => p.id === targetId);
                if (found) {
                    setSelectedProject(found);
                }
            });
        }
    };
    window.addEventListener('gearbox-navigate' as any, handleNavigation);
    return () => window.removeEventListener('gearbox-navigate' as any, handleNavigation);
  }, []);

  // Temps réel : projets (+ liste des utilisateurs, utilisée pour l'affectation
  // des tâches). loadProjects re-synchronise aussi le projet ouvert par son id,
  // donc la sélection n'est pas perdue quand un collègue modifie ce projet.
  useRealtimeSync([...RT_EVENTS.projects, ...RT_EVENTS.users], () => {
    loadProjects();
    db.getUsers().then(setUsers).catch(() => {});
  });

  useEffect(() => {
      setSelectedProject(null);
  }, [viewMode]);

  useEffect(() => {
      setShowDeleteConfirm(false);
  }, [selectedProject]);

  const loadProjects = async () => {
    const data = await db.getProjects();
    setProjects(data);

    const pendingId = window.sessionStorage.getItem('pendingProjectId');
    const savedId = window.sessionStorage.getItem(`gearbox_session_projects_${viewMode}_selectedId`);
    const targetId = pendingId || savedId;

    if (targetId) {
        const found = data.find(p => p.id === targetId);
        if (found) {
            const isArchived = found.status === 'Archived';
            if ((viewMode === 'archived' && isArchived) || (viewMode === 'current' && !isArchived)) {
                setSelectedProjectRaw(found);
            }
        }
        if (pendingId) window.sessionStorage.removeItem('pendingProjectId');
    }
  };

  const handleUpdateProject = useCallback(async (updated: Project) => {
    if (!canEdit) return;
    setSaving(true);
    
    let totalWeight = 0;
    if (updated.tasks.length > 0) {
        updated.tasks.forEach(t => {
            if (t.status === 'Done' || t.status === 'Programmed') totalWeight += 1;
            else if (t.status === 'InProgress') totalWeight += 0.5;
        });
        updated.progress = Math.round((totalWeight / updated.tasks.length) * 100);
    } else {
        updated.progress = 0;
    }
    updated.budgetActual = updated.tasks.reduce((sum, t) => sum + (t.cost || 0), 0);

    // Update optimiste local, puis PUT unitaire vers l'API (le backend gère
    // le diff des tâches). En cas d'échec : resynchronisation depuis la base.
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    setSelectedProject(updated);

    try {
      await db.updateProject(updated);
    } catch (error) {
      console.error('Project update failed:', error);
      alert('Échec de la sauvegarde du projet (serveur injoignable ?). Rechargement des données.');
      const fresh = await db.getProjects().catch(() => null);
      if (fresh) setProjects(fresh);
    }
    setTimeout(() => setSaving(false), 500);
  }, [canEdit]);

  const handleStatusChange = async (newStatus: string) => {
      if (!selectedProject || !canEdit) return;

      if (newStatus === 'Archived') {
          setProjectToArchive({ ...selectedProject, status: 'Archived' });
          setShowArchiveConfirm(true);
          return;
      }

      if (selectedProject.status === 'Archived' && newStatus !== 'Archived') {
          const restored = { ...selectedProject, status: newStatus as any };
          await handleUpdateProject(restored);
          setSelectedProject(null);
          return;
      }

      handleUpdateProject({ ...selectedProject, status: newStatus as any });
  };

  const confirmArchive = async () => {
      if (projectToArchive && canEdit) {
          await handleUpdateProject(projectToArchive);
          if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a archivé le projet', entity: 'project', entityName: projectToArchive.name, entityId: projectToArchive.id, timestamp: new Date().toISOString() });
          setShowArchiveConfirm(false);
          setProjectToArchive(null);
          setSelectedProject(null);
      }
  };

  const handleDeleteProject = async (id: string) => {
      try {
          const deletedProject = projects.find(p => p.id === id);
          await db.deleteProject(id);
          setProjects(prev => prev.filter(p => p.id !== id));
          setSelectedProject(null);
          if (user && deletedProject) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a supprimé le projet', entity: 'project', entityName: deletedProject.name, entityId: deletedProject.id, timestamp: new Date().toISOString() });
      } catch (error) {
          console.error("Error deleting project:", error);
          alert("Une erreur est survenue lors de la suppression.");
      }
  };

  const openCreateModal = () => {
    if (!canEdit) return;
    setNewProjectName('');
    setShowCreateModal(true);
  };

  const confirmCreateProject = async () => {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    setShowCreateModal(false);
    setNewProjectName('');
    const newProject: Project = {
      id: Math.random().toString(36).substr(2, 9),
      name: trimmed,
      site: 'Clermont',
      sites: ['Clermont'],
      budgetDistribution: { 'Clermont': 100 },
      service: ['VN'],
      brands: ['Renault'],
      projectType: 'OP Clients',
      status: 'Draft',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      budgetPlanned: 0,
      budgetActual: 0,
      description: '',
      progress: 0,
      tasks: [],
      assignedUsers: user ? [user.id] : [],
    };
    try {
      const created = await db.createProject(newProject);
      setProjects(prev => [...prev, created]);
      setSelectedProject(created);
    } catch (error) {
      console.error('Project creation failed:', error);
      alert('Échec de la création du projet (serveur injoignable ?).');
      return;
    }
    if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a créé le projet', entity: 'project', entityName: newProject.name, entityId: newProject.id, timestamp: new Date().toISOString() });
  };

  const updateSiteSelection = (newSite: string) => {
      if (!selectedProject || !canEdit) return;
      
      let newSites = [...(selectedProject.sites || [])];
      // If sites was undefined (legacy), init with current site
      if (!selectedProject.sites && selectedProject.site) {
          newSites = [selectedProject.site];
      }

      let newDistribution = { ...(selectedProject.budgetDistribution || {}) };
      let mainSite = selectedProject.site;

      const isGroupMode = (s: string) => s === 'GROUPE BONY' || s === 'GROUPE BONY (R/N)';

      if (newSite === 'GROUPE BONY') {
          newSites = Object.keys(DISTRIBUTION_GROUPE_BONY);
          newDistribution = { ...DISTRIBUTION_GROUPE_BONY };
          mainSite = 'GROUPE BONY';
      } else if (newSite === 'GROUPE BONY (R/N)') {
          newSites = Object.keys(DISTRIBUTION_GROUPE_BONY_RN);
          newDistribution = { ...DISTRIBUTION_GROUPE_BONY_RN };
          mainSite = 'GROUPE BONY (R/N)';
      } else {
          // If we were in a group mode, clear everything first
          if (isGroupMode(mainSite)) {
              newSites = [];
          }

          // Toggle site
          if (newSites.includes(newSite)) {
              newSites = newSites.filter(s => s !== newSite);
          } else {
              newSites.push(newSite);
          }

          // Update mainSite for display
          if (newSites.length === 0) mainSite = '';
          else if (newSites.length === 1) mainSite = newSites[0];
          else mainSite = newSites.join(', ');

          // Recalculate distribution for manual mode (Equal split by default)
          if (newSites.length > 0) {
              // Preserve existing values if possible? No, user said "Par défaut la répartition est égale"
              // But if I uncheck one site, I should rebalance others?
              // Simple approach: Reset to equal split whenever selection changes in manual mode.
              const equalShare = 100 / newSites.length;
              newDistribution = {};
              newSites.forEach(s => newDistribution[s] = equalShare);
          } else {
              newDistribution = {};
          }
      }

      handleUpdateProject({ 
          ...selectedProject, 
          site: mainSite, 
          sites: newSites, 
          budgetDistribution: newDistribution 
      });
  };

  const updateBudgetDistribution = (site: string, value: number) => {
      if (!selectedProject || !canEdit) return;
      const newDistribution = { ...(selectedProject.budgetDistribution || {}) };
      newDistribution[site] = value;
      handleUpdateProject({ ...selectedProject, budgetDistribution: newDistribution });
  };

  const toggleService = (s: ServiceType) => {
      if (!selectedProject || !canEdit) return;
      const currentServices = selectedProject.service || [];
      let newServices: ServiceType[] = [];

      if (s === 'Tous Services') {
          newServices = currentServices.includes('Tous Services') ? [] : ['Tous Services'];
      } else {
          let temp = currentServices.filter(svc => svc !== 'Tous Services');
          newServices = temp.includes(s) ? temp.filter(svc => svc !== s) : [...temp, s];
      }
      handleUpdateProject({ ...selectedProject, service: newServices });
  };

  const toggleBrand = (b: BrandType) => {
      if (!selectedProject || !canEdit) return;
      const currentBrands = selectedProject.brands || [];
      let newBrands: BrandType[] = [];

      if (b === 'Holding') {
          newBrands = currentBrands.includes('Holding') ? [] : ['Holding'];
      } else {
          let temp = currentBrands.filter(br => br !== 'Holding');
          newBrands = temp.includes(b) ? temp.filter(br => br !== b) : [...temp, b];
      }
      handleUpdateProject({ ...selectedProject, brands: newBrands });
  };

  const addTask = () => {
      if (!selectedProject || !canEdit) return;
      const newTask: Task = { id: Math.random().toString(36).substr(2, 9), name: '', channel: '', cost: 0, status: 'Todo' };
      handleUpdateProject({ ...selectedProject, tasks: [...selectedProject.tasks, newTask] });
  };

  const updateTask = (taskId: string, field: keyof Task, value: any) => {
      if (!selectedProject || !canEdit) return;
      const newTasks = selectedProject.tasks.map(t => t.id === taskId ? { ...t, [field]: value } : t);
      handleUpdateProject({ ...selectedProject, tasks: newTasks });
  };

  const removeTask = (taskId: string) => {
      if (!selectedProject || !canEdit) return;
      const newTasks = selectedProject.tasks.filter(t => t.id !== taskId);
      handleUpdateProject({ ...selectedProject, tasks: newTasks });
  };

  const addAssignedUser = (userId: string) => {
      if (!selectedProject || !canEdit) return;
      const current = selectedProject.assignedUsers || [];
      if (current.includes(userId)) return;
      handleUpdateProject({ ...selectedProject, assignedUsers: [...current, userId] });
      setShowTeamDropdown(false);
  };

  const removeAssignedUser = (userId: string) => {
      if (!selectedProject || !canEdit) return;
      const current = selectedProject.assignedUsers || [];
      if (current.length <= 1) {
          if (!confirm('Cet utilisateur est le seul membre du projet. Le retirer quand même ?')) return;
      }
      handleUpdateProject({ ...selectedProject, assignedUsers: current.filter(id => id !== userId) });
  };

  const filteredProjects = useMemo(() => {
    let result = projects.filter(p => {
        if (viewMode === 'current' && p.status === 'Archived') return false;
        if (viewMode === 'archived' && p.status !== 'Archived') return false;

        if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;

        if (filterSites.length > 0) {
            const matchesSite = filterSites.some(sel => {
                if (sel === 'GROUPE BONY') return true;
                const isPlaque = Object.keys(PLAQUES_STRUCTURE).includes(sel);
                if (isPlaque) {
                    const sitesInPlaque = PLAQUES_STRUCTURE[sel as PlaqueName];
                    return p.site === sel || sitesInPlaque.includes(p.site as Site);
                }
                return p.site === sel;
            });
            if (!matchesSite) return false;
        }

        if (filterServices.length > 0) {
            const hasService = filterServices.some(s => p.service.includes(s) || p.service.includes('Tous Services'));
            if (!hasService) return false;
        }

        if (filterBrands.length > 0) {
            const pBrands = p.brands || [];
            const hasBrand = filterBrands.some(b => pBrands.includes(b) || pBrands.includes('Holding'));
            if (!hasBrand) return false;
        }

        if (filterType !== 'All' && p.projectType !== filterType) return false;
        if (filterStatus !== 'All' && p.status !== filterStatus) return false;

        // Filtre période sur la date de début (parse local anti J+1, bornes incluses, vide = tous)
        if ((filterDateFrom || filterDateTo) && p.startDate) {
            const pStart = parseLocalDate(p.startDate).getTime();
            if (filterDateFrom && pStart < parseLocalDate(filterDateFrom).getTime()) return false;
            if (filterDateTo && pStart > parseLocalDate(filterDateTo).getTime()) return false;
        }

        return true;
    });

    return result.sort((a, b) => {
        const dateA = new Date(a.startDate).getTime();
        const dateB = new Date(b.startDate).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

  }, [projects, viewMode, searchTerm, filterSites, filterServices, filterBrands, filterType, filterStatus, filterDateFrom, filterDateTo, sortOrder]);

  const budgetVariance = selectedProject ? (selectedProject.budgetPlanned - selectedProject.budgetActual) : 0;
  const isUnderBudget = budgetVariance >= 0;
  const variancePercent = selectedProject && selectedProject.budgetPlanned > 0 
    ? Math.abs((budgetVariance / selectedProject.budgetPlanned) * 100).toFixed(1) 
    : '0.0';

  const activeFilterCount = filterSites.length + filterBrands.length + filterServices.length
      + (filterType !== 'All' ? 1 : 0) + (filterStatus !== 'All' ? 1 : 0)
      + (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0);

  const resetFilters = () => {
      setSearchTerm('');
      setFilterSites([]);
      setFilterBrands([]);
      setFilterServices([]);
      setFilterType('All');
      setFilterStatus('All');
      setFilterDateFrom('');
      setFilterDateTo('');
      setSortOrder('desc');
  };

  const getListStatusBadge = (status: string) => {
      switch(status) {
          case 'Draft':    return <span className="text-[9px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded-full">brouillon</span>;
          case 'Active':   return <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded-full">actif</span>;
          case 'Done':     return <span className="text-[9px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-1.5 py-0.5 rounded-full">terminé</span>;
          case 'Archived': return <span className="text-[9px] font-medium text-slate-400 bg-slate-100 dark:bg-black/40 px-1.5 py-0.5 rounded-full">archivé</span>;
          default: return null;
      }
  };

  return (
    <div className="flex h-full overflow-hidden relative">
      
      {showCreateModal && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="glass-strong glass-sheen relative overflow-hidden rounded-xl p-6 max-w-sm w-full shadow-2xl">
                  <h3 className="text-lg font-title text-bony-text mb-1">Nouveau Projet</h3>
                  <p className="text-xs text-bony-muted mb-4">Donnez un nom à votre projet pour commencer.</p>
                  <input
                      type="text"
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmCreateProject(); if (e.key === 'Escape') setShowCreateModal(false); }}
                      placeholder="Nom du projet..."
                      autoFocus
                      className="w-full bg-white dark:bg-black/30 border border-slate-300 dark:border-bony-border rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-bony-orange transition mb-5"
                  />
                  <div className="flex justify-end gap-3">
                      <button
                          onClick={() => { setShowCreateModal(false); setNewProjectName(''); }}
                          className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-bony-text transition"
                      >
                          ANNULER
                      </button>
                      <button
                          onClick={confirmCreateProject}
                          disabled={!newProjectName.trim()}
                          className="px-4 py-2 rounded-lg text-sm font-bold bg-bony-gradient text-white hover:opacity-90 transition shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                          CRÉER
                      </button>
                  </div>
              </div>
          </div>
      )}

      {showArchiveConfirm && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="glass-strong glass-sheen relative overflow-hidden rounded-xl p-6 max-w-md w-full shadow-2xl">
                  <div className="flex items-center gap-4 mb-4 text-bony-orange">
                      <AlertTriangle size={32} />
                      <h3 className="text-xl font-title text-bony-text">Confirmer l'archivage ?</h3>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-300 mb-6 leading-relaxed">
                      Vous êtes sur le point d'archiver le projet <strong>{projectToArchive?.name}</strong>.
                      <br/><br/>
                      Il sera déplacé dans la rubrique <strong>"Projets Archivés"</strong> et n'apparaîtra plus dans la liste des projets actifs.
                  </p>
                  <div className="flex justify-end gap-3">
                      <button 
                          onClick={() => { setShowArchiveConfirm(false); setProjectToArchive(null); }}
                          className="px-4 py-2 rounded-lg text-sm font-bold text-slate-500 hover:text-bony-text transition"
                      >
                          ANNULER
                      </button>
                      <button 
                          onClick={confirmArchive}
                          className="px-4 py-2 rounded-lg text-sm font-bold bg-bony-gradient text-white hover:opacity-90 transition shadow-lg"
                      >
                          OUI, ARCHIVER
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* List Panel — full width on mobile, resizable on desktop */}
      <div
        className={`${selectedProject ? 'hidden md:flex' : 'flex'} flex-col gx-glass-panel border-r border-bony-border relative shrink-0`}
        style={{ width: window.innerWidth >= 768 ? `${listWidth}px` : '100%' }}
      >

        <div className="px-3 py-2.5 border-b border-bony-border space-y-2 z-20">
            <div className="flex justify-between items-center">
                <h2 className="text-sm font-bold text-bony-text flex items-center gap-1.5">
                    {viewMode === 'archived' && <Archive size={14} className="text-slate-500"/>}
                    {viewMode === 'archived' ? 'Archives' : 'Projets'}
                </h2>
                <div className="flex gap-1.5">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`relative p-1.5 rounded-lg transition border ${showFilters || activeFilterCount > 0 ? 'bg-bony-orange text-white border-bony-orange' : 'bg-slate-100 dark:bg-black/30 text-slate-500 border-bony-border hover:text-bony-text'}`}
                        title="Filtres avancés"
                    >
                        {showFilters ? <X size={15} /> : <Filter size={15} />}
                        {!showFilters && activeFilterCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-bony-orange text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-bony-panel">{activeFilterCount}</span>
                        )}
                    </button>
                    {viewMode === 'current' && canEdit && (
                        <button
                            onClick={openCreateModal}
                            className="flex items-center gap-1 px-2 py-1 bg-bony-gradient rounded-lg text-white hover:opacity-90 transition text-[11px] font-semibold"
                        >
                            <Plus size={12} /> Nouveau
                        </button>
                    )}
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={viewMode === 'archived' ? "Rechercher une archive..." : "Rechercher un projet..."}
                    className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg pl-8 pr-3 py-1.5 text-[12px] text-bony-text outline-none focus:border-bony-orange transition-colors placeholder-slate-400"
                />
            </div>
        </div>

        {showFilters && (
            <div className="bg-slate-50 dark:bg-black/40 border-b border-bony-border p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">

                {/* Sort row */}
                <div className="flex justify-between items-center pb-2 border-b border-bony-border">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Trier par date</label>
                    <button
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-bony-text bg-white dark:bg-black/30 px-2.5 py-1 rounded border border-bony-border hover:border-bony-orange transition"
                    >
                        {sortOrder === 'desc' ? 'Plus récents' : 'Plus anciens'}
                        {sortOrder === 'desc' ? <ArrowDown size={12}/> : <ArrowUp size={12}/>}
                    </button>
                </div>

                {/* Périmètre */}
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Périmètre</label>
                    <ProjSitePicker selected={filterSites} onChange={setFilterSites} />
                </div>

                {/* Marques */}
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Marques</label>
                    <ProjBrandPicker selected={filterBrands} onChange={setFilterBrands} />
                </div>

                {/* Services */}
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Services</label>
                    <ProjServicePicker selected={filterServices} onChange={setFilterServices} />
                </div>

                {/* Type + Statut */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Objet (Type)</label>
                        <Select
                            size="sm"
                            value={filterType}
                            onChange={(v) => setFilterType(v as any)}
                            options={[{ value: 'All', label: 'TOUS TYPES' }, ...PROJECT_TYPES.map(t => ({ value: t, label: t }))]}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Statut</label>
                        <Select
                            size="sm"
                            value={filterStatus}
                            onChange={(v) => setFilterStatus(v)}
                            options={[
                                { value: 'All', label: 'TOUS STATUTS' },
                                { value: 'Draft', label: 'Brouillon' },
                                { value: 'Active', label: 'Actif' },
                                { value: 'Done', label: 'Terminé' },
                                ...(viewMode === 'archived' ? [{ value: 'Archived', label: 'Archivé' }] : []),
                            ]}
                        />
                    </div>
                </div>

                {/* Période (date de début) */}
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Période (date de début)</label>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Du</span>
                            <DatePicker size="sm" value={filterDateFrom} onChange={setFilterDateFrom} placeholder="Début" />
                        </div>
                        <div className="space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Au</span>
                            <DatePicker size="sm" value={filterDateTo} onChange={setFilterDateTo} placeholder="Fin" />
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-bony-border">
                    <button onClick={resetFilters} className="text-[10px] font-bold text-slate-500 hover:text-bony-text underline">RÉINITIALISER</button>
                    <div className="text-[10px] font-sans text-bony-orange">{filteredProjects.length} RÉSULTAT(S)</div>
                </div>
            </div>
        )}
        
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-bony-border/20">
          {filteredProjects.length > 0 ? filteredProjects.map(project => {
            const isSelected = selectedProject?.id === project.id;
            const brandLabels = project.brands || [];
            const serviceLabels = project.service || [];
            const tagLabels = [...brandLabels, ...serviceLabels];
            const hasProgress = project.tasks.length > 0 || project.budgetActual > 0;
            return (
              <div
                key={project.id}
                onClick={() => { setSelectedProject(project); setShowDeleteConfirm(false); }}
                className={`relative px-4 py-3 cursor-pointer transition-colors group ${
                    isSelected
                        ? 'bg-bony-orange/[0.06] dark:bg-bony-orange/[0.08]'
                        : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                }`}
              >
                {/* Accent gauche vertical (sélection) — sobre mais net */}
                {isSelected && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-gradient-to-b from-bony-orange to-bony-violet" />
                )}

                {/* Ligne 1 : titre (dominant) + PRO+ / statut */}
                <div className="flex items-start justify-between gap-2">
                  <h3
                    className={`text-[13.5px] font-semibold leading-snug truncate transition-colors ${isSelected ? 'text-bony-orange' : 'text-bony-text'}`}
                    title={project.name}
                  >
                    {project.name}
                  </h3>
                  <div className="shrink-0 flex items-center gap-1">
                    {project.proPlus && <span className="text-[8px] font-bold text-white bg-bony-gradient px-1.5 py-0.5 rounded uppercase tracking-wide leading-none">PRO+</span>}
                    {getListStatusBadge(project.status)}
                  </div>
                </div>

                {/* Ligne 2 : site · type (support) + budget à droite */}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-bony-muted">
                  <span className="truncate">
                    {project.site}
                    <span className="mx-1 opacity-40">·</span>
                    {project.projectType}
                  </span>
                  {project.budgetActual > 0 && (
                    <span className="ml-auto shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                      {project.budgetActual.toLocaleString()} €
                    </span>
                  )}
                </div>

                {/* Ligne 3 : marques (puces) + marques/services (texte compact) + avancement discret */}
                {(tagLabels.length > 0 || hasProgress) && (
                  <div className="mt-2 flex items-center gap-2">
                    {tagLabels.length > 0 && (
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {brandLabels.length > 0 && (
                          <div className="flex items-center gap-1 shrink-0">
                            {brandLabels.slice(0, 4).map((b, i) => (
                              <span key={i} className={`w-1.5 h-1.5 rounded-full ${BRAND_DOT[b] || 'bg-slate-400'}`} title={b} />
                            ))}
                          </div>
                        )}
                        <span className="truncate text-[10.5px] text-bony-muted" title={tagLabels.join(' · ')}>
                          {tagLabels.join(' · ')}
                        </span>
                      </div>
                    )}
                    {hasProgress && (
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        <div className="w-10 h-1 rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-bony-orange to-bony-violet" style={{ width: `${project.progress}%` }} />
                        </div>
                        <span className="text-[10px] text-bony-muted tabular-nums w-7 text-right">{project.progress}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }) : (
              <div className="p-8 text-center opacity-50">
                  <FolderKanban className="mx-auto mb-2 text-slate-400" size={32}/>
                  <p className="text-xs font-bold uppercase text-slate-500">Aucun projet trouvé</p>
              </div>
          )}
        </div>

        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-bony-orange/50 transition-colors hidden md:block z-10"
          onMouseDown={handleResizeStart}
        />
      </div>

      {/* Detail Panel — hidden on mobile when no project selected */}
      <div className={`${selectedProject ? 'flex' : 'hidden md:flex'} flex-1 flex-col h-full overflow-hidden`}>
        {selectedProject ? (
          <>
            <div className="h-14 border-b border-bony-border flex items-center justify-between px-3 md:px-6 glass-strong shrink-0 transition-colors">
               <div className="text-sm text-slate-400 flex items-center gap-2 md:gap-3 min-w-0">
                 <button
                   onClick={() => setSelectedProject(null)}
                   className="md:hidden flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 dark:bg-white/10 px-2 py-1.5 rounded-lg shrink-0 min-h-[36px]"
                 >
                   ← Retour
                 </button>
                 <span className="font-sans text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-black/20 px-2 py-1 rounded hidden md:inline">ID: {selectedProject.id}</span>
                 {saving && <span className="text-bony-orange flex items-center text-xs animate-pulse font-bold"><Save size={12} className="mr-1"/> SAUVEGARDE...</span>}
                 {!canEdit && <span className="flex items-center gap-1 text-red-400 text-xs font-bold uppercase border border-red-500/20 bg-red-500/10 px-2 py-0.5 rounded"><Lock size={10}/> Lecture Seule</span>}
               </div>
               {canEdit && (
                   !showDeleteConfirm ? (
                       <button 
                           onClick={() => setShowDeleteConfirm(true)}
                           className="text-red-400 hover:text-red-500 text-sm flex items-center gap-1 opacity-60 hover:opacity-100 transition"
                       >
                         <Trash2 size={14}/> Supprimer
                       </button>
                   ) : (
                       <div className="flex items-center gap-2">
                           <span className="text-xs font-bold text-bony-text">Confirmer ?</span>
                           <button 
                               onClick={() => handleDeleteProject(selectedProject.id)}
                               className="px-2 py-1 rounded text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition shadow-sm"
                           >
                               OUI
                           </button>
                           <button 
                               onClick={() => setShowDeleteConfirm(false)}
                               className="px-2 py-1 rounded text-xs font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10 transition"
                           >
                               NON
                           </button>
                       </div>
                   )
               )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-6 lg:p-10">
                <div className="max-w-6xl mx-auto space-y-10 pb-20">
                    
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-bony-violet tracking-widest uppercase">Titre du projet</label>
                        <input 
                            type="text" 
                            disabled={!canEdit}
                            value={selectedProject.name}
                            onChange={(e) => handleUpdateProject({...selectedProject, name: e.target.value})}
                            className={`w-full bg-transparent text-4xl font-title text-bony-text border-b-2 border-bony-border outline-none pb-2 transition-colors placeholder-slate-400 ${canEdit ? 'focus:border-bony-orange' : 'opacity-80'}`}
                            placeholder="NOM DU PROJET"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
                        
                        {/* LEFT COLUMN: CONTEXT (White Panel in Light Mode) */}
                        <div className="md:col-span-8 gx-glass-panel border border-bony-border rounded-xl p-6 flex flex-col justify-between gap-6 relative overflow-hidden shadow-sm">
                            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-bony-orange to-bony-violet"></div>

                            <div className="flex flex-col md:flex-row gap-6 border-b border-bony-border pb-6">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-2">Statut du Projet</label>
                                    <div className="flex bg-slate-100 dark:bg-black/30 p-1 rounded-lg border border-bony-border">
                                        {(['Draft', 'Active', 'Done'] as const).map(statusOption => {
                                            const isActive = selectedProject.status === statusOption;
                                            return (
                                                <button
                                                    key={statusOption}
                                                    disabled={!canEdit}
                                                    onClick={() => handleStatusChange(statusOption)}
                                                    className={`flex-1 py-2 text-xs font-bold uppercase rounded transition-all ${
                                                        isActive 
                                                        ? 'bg-white dark:bg-white text-black shadow-sm' 
                                                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                                                    } ${!canEdit ? 'cursor-not-allowed opacity-50' : ''}`}
                                                >
                                                    {statusOption === 'Draft' ? 'Brouillon' : (statusOption === 'Active' ? 'Actif' : 'Terminé')}
                                                </button>
                                            );
                                        })}
                                        <button 
                                            disabled={!canEdit}
                                            onClick={() => handleStatusChange(selectedProject.status === 'Archived' ? 'Active' : 'Archived')}
                                            className={`px-4 py-2 text-xs font-bold uppercase rounded transition-all ml-1 ${
                                                selectedProject.status === 'Archived' 
                                                ? 'bg-purple-600 text-white shadow-lg' 
                                                : 'text-slate-500 hover:text-purple-600 hover:bg-white/50'
                                            } ${!canEdit ? 'cursor-not-allowed opacity-50' : ''}`}
                                            title={selectedProject.status === 'Archived' ? "Restaurer" : "Archiver"}
                                        >
                                            <Archive size={16}/>
                                        </button>
                                    </div>
                                </div>
                                <div className="w-full md:w-64">
                                     <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-2">Période</label>
                                     {canEdit ? (
                                         <div className="flex items-center gap-1.5">
                                             <DatePicker size="sm" value={selectedProject.startDate} onChange={(v) => handleUpdateProject({...selectedProject, startDate: v, ...(v && selectedProject.endDate && v > selectedProject.endDate ? { endDate: v } : {})})} placeholder="Début" />
                                             <ArrowRight size={12} className="text-slate-400 shrink-0"/>
                                             <DatePicker size="sm" value={selectedProject.endDate} minDate={selectedProject.startDate} onChange={(v) => handleUpdateProject({...selectedProject, endDate: v})} placeholder="Fin" />
                                         </div>
                                     ) : (
                                         <div className="flex items-center gap-2 bg-[var(--bg-input)] border border-bony-border rounded-2xl px-3 h-[38px] text-xs font-bold text-bony-text">
                                             <span>{selectedProject.startDate ? parseLocalDate(selectedProject.startDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                                             <ArrowRight size={12} className="text-slate-400"/>
                                             <span>{selectedProject.endDate ? parseLocalDate(selectedProject.endDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                                         </div>
                                     )}
                                </div>
                                <div className="w-full md:w-auto">
                                    <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-2">Client B2B</label>
                                    <button
                                        type="button"
                                        disabled={!canEdit}
                                        onClick={() => handleUpdateProject({ ...selectedProject, proPlus: !selectedProject.proPlus })}
                                        className={`flex items-center gap-2 h-[38px] px-3 rounded-lg border text-xs font-bold uppercase tracking-wide transition-all ${
                                            selectedProject.proPlus
                                                ? 'bg-bony-gradient text-white border-transparent shadow'
                                                : 'bg-slate-100 dark:bg-black/30 text-slate-500 border-bony-border hover:text-bony-text'
                                        } ${!canEdit ? 'cursor-not-allowed opacity-50' : ''}`}
                                        title="Marquer ce projet comme PRO+ (B2B)"
                                    >
                                        <span className={`flex items-center justify-center w-4 h-4 rounded border transition-colors ${
                                            selectedProject.proPlus ? 'bg-white/25 border-white/60' : 'border-slate-400 dark:border-slate-500'
                                        }`}>
                                            {selectedProject.proPlus && <Check size={11} strokeWidth={3} />}
                                        </span>
                                        PRO+
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                     <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase">Site / Plaque</label>
                                     <div className="relative">
                                        <button 
                                            onClick={() => setShowSiteDropdown(!showSiteDropdown)}
                                            disabled={!canEdit}
                                            className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg p-2.5 text-bony-text outline-none focus:border-bony-blue text-sm font-bold flex justify-between items-center hover:bg-slate-200 dark:hover:bg-black/30 transition-colors disabled:opacity-50"
                                        >
                                            <span className="truncate">{selectedProject.site || 'Sélectionner...'}</span>
                                            <ChevronDown size={16} className="text-slate-500"/>
                                        </button>
                                        
                                        {showSiteDropdown && (
                                            <div className="absolute top-full left-0 right-0 mt-1 glass-menu rounded-lg z-50 max-h-60 overflow-y-auto custom-scrollbar p-1">
                                                <button
                                                    onClick={() => { updateSiteSelection('GROUPE BONY'); setShowSiteDropdown(false); }}
                                                    className={`w-full text-left px-3 py-2 text-xs font-bold rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between gap-2 ${selectedProject.site === 'GROUPE BONY' ? 'text-bony-orange bg-orange-50 dark:bg-orange-900/20' : 'text-slate-700 dark:text-slate-300'}`}
                                                >
                                                    <span className="truncate min-w-0">GROUPE BONY (GLOBAL)</span>
                                                    {selectedProject.site === 'GROUPE BONY' && <Check size={14} className="shrink-0"/>}
                                                </button>
                                                <button
                                                    onClick={() => { updateSiteSelection('GROUPE BONY (R/N)'); setShowSiteDropdown(false); }}
                                                    className={`w-full text-left px-3 py-2 text-xs font-bold rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between gap-2 ${selectedProject.site === 'GROUPE BONY (R/N)' ? 'text-bony-orange bg-orange-50 dark:bg-orange-900/20' : 'text-slate-700 dark:text-slate-300'}`}
                                                >
                                                    <span className="truncate min-w-0">GROUPE BONY (R/N)</span>
                                                    {selectedProject.site === 'GROUPE BONY (R/N)' && <Check size={14} className="shrink-0"/>}
                                                </button>
                                                
                                                <div className="h-px bg-slate-100 dark:bg-white/10 my-1"></div>

                                                {Object.entries(PLAQUES_STRUCTURE).map(([plaqueName, sites]) => (
                                                    <div key={plaqueName} className="mb-1">
                                                        <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-400">{plaqueName}</div>
                                                        {sites.map(site => {
                                                            const isSelected = (selectedProject.sites || []).includes(site);
                                                            return (
                                                                <button
                                                                    key={site}
                                                                    onClick={() => updateSiteSelection(site)}
                                                                    className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between gap-2 ${isSelected ? 'text-bony-blue font-bold bg-blue-50 dark:bg-blue-900/20' : 'text-slate-600 dark:text-slate-400'}`}
                                                                >
                                                                    <span className="truncate min-w-0">{site}</span>
                                                                    {isSelected && <Check size={14} className="shrink-0"/>}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ))}
                                                <div className="mb-1">
                                                    <div className="px-3 py-1 text-[10px] uppercase font-bold text-red-400/70">SITES NISSAN</div>
                                                    {(['Montluçon', 'Saint-Etienne'] as Site[]).map(site => {
                                                        const isSelected = (selectedProject.sites || []).includes(site);
                                                        return (
                                                            <button
                                                                key={site}
                                                                onClick={() => updateSiteSelection(site)}
                                                                className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between gap-2 ${isSelected ? 'text-bony-blue font-bold bg-blue-50 dark:bg-blue-900/20' : 'text-slate-600 dark:text-slate-400'}`}
                                                            >
                                                                <span className="truncate min-w-0">{site}</span>
                                                                {isSelected && <Check size={14} className="shrink-0"/>}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                     </div>
                                </div>
                                <div className="space-y-2">
                                     <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase">Type de Projet</label>
                                     <Select
                                        value={selectedProject.projectType || 'OP Clients'}
                                        disabled={!canEdit}
                                        onChange={(v) => handleUpdateProject({...selectedProject, projectType: v as any})}
                                        options={PROJECT_TYPES.map(t => ({ value: t, label: t }))}
                                     />
                                </div>
                            </div>

                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-2">Services</label>
                                    <div className="flex flex-wrap gap-2">
                                        {SERVICES.map(s => {
                                            const isSelected = selectedProject.service.includes(s);
                                            return (
                                                <button
                                                    key={s}
                                                    disabled={!canEdit}
                                                    onClick={() => toggleService(s)}
                                                    className={`px-3 py-1.5 rounded text-xs font-bold border transition-all ${
                                                        isSelected 
                                                        ? `bg-bony-gradient border-transparent text-white shadow` 
                                                        : 'bg-slate-100 dark:bg-black/20 border-bony-border text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                                    } ${!canEdit ? 'cursor-not-allowed opacity-50' : ''}`}
                                                >
                                                    {s}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-2">Marques</label>
                                    <div className="flex flex-wrap gap-2">
                                        {BRANDS.filter(b => {
                                            const currentSites = selectedProject.sites || (selectedProject.site ? [selectedProject.site] : []);
                                            if (b === 'Alpine') return currentSites.some(s => ALPINE_SITES.includes(s as Site));
                                            if (b === 'Nissan') return currentSites.some(s => NISSAN_SITES.includes(s as Site));
                                            return true;
                                        }).map(b => {
                                            const isSelected = (selectedProject.brands || []).includes(b);
                                            const colorClass = BRAND_COLORS[b];
                                            return (
                                                <button
                                                    key={b}
                                                    disabled={!canEdit}
                                                    onClick={() => toggleBrand(b)}
                                                    className={`px-3 py-1.5 rounded text-xs font-bold border transition-all ${
                                                        isSelected 
                                                        ? `${colorClass} shadow scale-105` 
                                                        : 'bg-slate-100 dark:bg-black/20 border-bony-border text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                                    } ${!canEdit ? 'cursor-not-allowed opacity-50' : ''}`}
                                                >
                                                    {b}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* TEAM SECTION */}
                            {(() => {
                                const assignedIds = selectedProject.assignedUsers || [];
                                const unassignedUsers = users.filter(u => !assignedIds.includes(u.id));
                                return (
                                    <TeamSection
                                        assignedIds={assignedIds}
                                        unassignedUsers={unassignedUsers}
                                        allUsers={users}
                                        canEdit={canEdit}
                                        showDropdown={showTeamDropdown}
                                        setShowDropdown={setShowTeamDropdown}
                                        onAdd={addAssignedUser}
                                        onRemove={removeAssignedUser}
                                    />
                                );
                            })()}

                            {/* BUDGET ALLOCATION SECTION */}
                            {(selectedProject.sites && selectedProject.sites.length > 1) && (
                                <div className="mt-6 pt-6 border-t border-bony-border animate-in fade-in">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-[10px] font-bold text-slate-500 tracking-widest uppercase flex items-center gap-2">
                                            <PieChart size={14} className="text-bony-orange"/> Répartition Budgétaire
                                        </h4>
                                        {/* Bascule d'affichage/saisie % ↔ € (UI uniquement, stockage en % inchangé) */}
                                        <div className="flex items-center bg-slate-100 dark:bg-black/30 rounded-lg p-0.5 border border-bony-border">
                                            {(['%', '€'] as const).map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => setBudgetDistMode(m)}
                                                    className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition-colors ${budgetDistMode === m ? 'bg-bony-gradient text-white' : 'text-slate-500 hover:text-bony-text'}`}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        {(selectedProject.sites || []).map(site => {
                                            const pct = (selectedProject.budgetDistribution || {})[site] || 0;
                                            const isFixed = selectedProject.site === 'GROUPE BONY' || selectedProject.site === 'GROUPE BONY (R/N)';
                                            const amount = Math.round(selectedProject.budgetActual * (pct / 100));
                                            const euroMode = budgetDistMode === '€';
                                            // En € : conversion immédiate montant → % stocké (garde le modèle en %). Division par zéro gérée.
                                            const euroDisabled = isFixed || !canEdit || !(selectedProject.budgetActual > 0);

                                            return (
                                                <div key={site} className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 w-24 truncate" title={site}>{site}</span>
                                                    <div className="flex-1 flex items-center gap-2 bg-slate-100 dark:bg-black/30 rounded px-2 py-1 border border-bony-border">
                                                        {euroMode ? (
                                                            <input
                                                                type="number"
                                                                value={amount}
                                                                disabled={euroDisabled}
                                                                onChange={(e) => updateBudgetDistribution(site, selectedProject.budgetActual > 0 ? (Number(e.target.value) / selectedProject.budgetActual) * 100 : 0)}
                                                                className="w-full bg-transparent text-xs font-bold text-right outline-none disabled:opacity-50"
                                                            />
                                                        ) : (
                                                            <input
                                                                type="number"
                                                                value={Number(pct.toFixed(2))}
                                                                disabled={isFixed || !canEdit}
                                                                onChange={(e) => updateBudgetDistribution(site, Number(e.target.value))}
                                                                className="w-full bg-transparent text-xs font-bold text-right outline-none disabled:opacity-50"
                                                            />
                                                        )}
                                                        <span className="text-[10px] text-slate-500">{euroMode ? '€' : '%'}</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 w-16 text-right">
                                                        {euroMode ? `${Number(pct.toFixed(1))} %` : `${amount.toLocaleString()} €`}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {budgetDistMode === '€' && !(selectedProject.budgetActual > 0) && (
                                        <div className="mt-2 text-[10px] text-amber-500">Budget réalisé = 0 € : saisie en € indisponible (utilisez le mode %).</div>
                                    )}
                                    
                                    <div className="mt-2 text-right text-[10px] text-slate-400">
                                        Total: <span className={`font-bold ${Math.abs(Object.values(selectedProject.budgetDistribution || {}).reduce((a,b)=>a+b,0) - 100) > 0.1 ? 'text-red-500' : 'text-emerald-500'}`}>
                                            {Object.values(selectedProject.budgetDistribution || {}).reduce((a,b)=>a+b,0).toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT COLUMN: BUDGET CARD (Inverted for Light Mode or Keep Dark?) Let's adapt it properly */}
                        <div className="md:col-span-4 gx-glass-panel border border-bony-border rounded-xl p-6 flex flex-col justify-between relative overflow-hidden group shadow-sm">
                             <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                                 <Coins size={100} className="text-bony-text"/>
                             </div>

                             <div className="space-y-6 relative z-10">
                                 <div>
                                     <h3 className="text-sm font-bold text-bony-text uppercase flex items-center gap-2 mb-1">
                                         <Wallet size={16} className="text-bony-orange"/> Budget
                                     </h3>
                                     <p className="text-[10px] text-slate-500">Pilotage financier en temps réel</p>
                                 </div>

                                 <div className="space-y-1">
                                     <label className="text-[10px] font-bold text-slate-500 uppercase">Budget Prévu</label>
                                     <div className="bg-slate-100 dark:bg-black/30 border border-bony-border rounded-lg flex items-center px-3 py-2">
                                         <input 
                                             type="number" 
                                             disabled={!canEdit}
                                             value={selectedProject.budgetPlanned}
                                             onChange={(e) => handleUpdateProject({...selectedProject, budgetPlanned: Number(e.target.value)})}
                                             className="bg-transparent text-xl font-sans font-bold text-bony-text outline-none w-full placeholder-slate-400 disabled:opacity-50"
                                             placeholder="0"
                                         />
                                         <span className="text-slate-500 font-bold">€</span>
                                     </div>
                                 </div>

                                 <div className="space-y-1">
                                     <label className="text-[10px] font-bold text-slate-500 uppercase">Budget Réel (Auto)</label>
                                     <div className="text-3xl font-sans font-bold text-bony-text">
                                         {selectedProject.budgetActual.toLocaleString()} <span className="text-lg text-slate-500">€</span>
                                     </div>
                                 </div>

                                 {/* Répartition marque / compte RDM — visible seulement sur un
                                     projet mixte (Alpine ou Nissan + Renault/Dacia/Mobilize).
                                     Même condition que `splitShareToBuckets` dans constants.ts,
                                     qui ignore le curseur hors élément mixte.

                                     Le défaut affiché est 100 et non 50 : non renseigné, le calcul
                                     impute TOUT à la marque. Afficher 50 laissait croire à une
                                     répartition qui n'avait pas lieu. */}
                                 {(() => {
                                     const pb = selectedProject.brands || [];
                                     const hasRDM = pb.some(b => (RDM_BRANDS as string[]).includes(b));
                                     if (!hasRDM) return null;
                                     const curseurs = ([
                                         { marque: 'Alpine', champ: 'alpineShare' as const },
                                         { marque: 'Nissan', champ: 'nissanShare' as const },
                                     ]).filter(c => pb.includes(c.marque as any));
                                     if (curseurs.length === 0) return null;
                                     return curseurs.map(({ marque, champ }) => {
                                         const share = selectedProject[champ] ?? 100;
                                         return (
                                         <div key={champ} className="space-y-1 pt-4 border-t border-bony-border animate-in fade-in">
                                             <label className="text-[10px] font-bold text-slate-500 uppercase">Part {marque} (%)</label>
                                             <div className="bg-slate-100 dark:bg-black/30 border border-bony-border rounded-lg flex items-center px-3 py-2 gap-2">
                                                 <input
                                                     type="number"
                                                     min="0"
                                                     max="100"
                                                     disabled={!canEdit}
                                                     value={share}
                                                     onChange={(e) => handleUpdateProject({...selectedProject, [champ]: Math.min(100, Math.max(0, Number(e.target.value)))})}
                                                     className="bg-transparent text-xl font-sans font-bold text-bony-text outline-none w-16 placeholder-slate-400 disabled:opacity-50 text-center"
                                                     placeholder="100"
                                                 />
                                                 <span className="text-slate-500 font-bold">%</span>
                                             </div>
                                             <p className="text-[10px] text-slate-400">{share}% → {marque} · {100 - share}% → compte RDM</p>
                                         </div>
                                         );
                                     });
                                 })()}

                                 <div className="pt-4 border-t border-bony-border">
                                      <div className={`flex items-center gap-2 ${isUnderBudget ? 'text-emerald-500' : 'text-red-500'}`}>
                                          {isUnderBudget ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}
                                          <div className="font-bold text-sm uppercase">
                                              {isUnderBudget ? 'Gain Estimé' : 'Dépassement'}
                                          </div>
                                      </div>
                                      <div className={`text-xs mt-1 font-sans ${isUnderBudget ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                                          {Math.abs(budgetVariance).toLocaleString()} € ({variancePercent}%)
                                      </div>
                                 </div>
                             </div>

                             <div className="mt-6">
                                 <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1 uppercase">
                                     <span>Avancement Tâches</span>
                                     <span className="text-bony-text">{selectedProject.progress}%</span>
                                 </div>
                                 <div className="h-2 bg-slate-200 dark:bg-black/50 rounded-full overflow-hidden">
                                     <div className="h-full bg-bony-gradient transition-all duration-700" style={{width: `${selectedProject.progress}%`}}></div>
                                 </div>
                             </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-bony-border pb-2">
                            <h3 className="font-title text-lg text-bony-text flex items-center gap-2">
                                <Coins size={20} className="text-bony-orange"/>
                                Tâches & Coûts
                            </h3>
                            {canEdit && (
                                <button onClick={addTask} className="text-xs font-bold bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 px-3 py-1 rounded text-bony-text transition">
                                    + AJOUTER UNE TÂCHE
                                </button>
                            )}
                        </div>

                        <div className="gx-glass-panel rounded-xl border border-bony-border overflow-x-auto shadow-sm">
                            <table className="w-full min-w-[760px] text-left">
                                <thead className="bg-slate-100 dark:bg-black/20 text-[10px] uppercase font-bold text-slate-500">
                                    <tr>
                                        <th className="p-3 w-10"></th>
                                        <th className="p-3">Nom de la tâche</th>
                                        <th className="p-3 w-40">Prestataire</th>
                                        <th className="p-3 w-32">Canal</th>
                                        <th className="p-3 w-40">Statut</th>
                                        <th className="p-3 w-36">Assigné</th>
                                        <th className="p-3 w-28 text-right">Coût (€)</th>
                                        <th className="p-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-bony-border">
                                    {selectedProject.tasks.map((task, index) => (
                                        <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition group">
                                            <td className="p-3 text-center text-slate-400 text-xs font-sans">{index + 1}</td>
                                            <td className="p-3">
                                                <input 
                                                    type="text" 
                                                    disabled={!canEdit}
                                                    value={task.name}
                                                    onChange={(e) => updateTask(task.id, 'name', e.target.value)}
                                                    placeholder="Description de la tâche..."
                                                    className="w-full bg-transparent outline-none text-bony-text text-sm placeholder-slate-400 disabled:opacity-50"
                                                />
                                            </td>
                                            <td className="p-3">
                                                <input
                                                    type="text"
                                                    disabled={!canEdit}
                                                    value={task.provider || ''}
                                                    onChange={(e) => updateTask(task.id, 'provider', e.target.value)}
                                                    placeholder="Prestataire..."
                                                    className="w-full bg-transparent outline-none text-bony-text text-sm placeholder-slate-400 disabled:opacity-50"
                                                />
                                            </td>
                                            <td className="p-3">
                                                <Select
                                                    size="sm"
                                                    value={task.channel || ''}
                                                    disabled={!canEdit}
                                                    onChange={(v) => updateTask(task.id, 'channel', v)}
                                                    placeholder="-- Aucun --"
                                                    options={[{ value: '', label: '-- Aucun --' }, ...TASK_CHANNELS.map(c => ({ value: c, label: c }))]}
                                                />
                                            </td>
                                            <td className="p-3">
                                                <Select
                                                    size="sm"
                                                    value={task.status}
                                                    disabled={!canEdit}
                                                    onChange={(v) => updateTask(task.id, 'status', v)}
                                                    options={[
                                                        { value: 'Empty', label: 'Vierge' },
                                                        { value: 'Todo', label: 'À faire (0%)' },
                                                        { value: 'InProgress', label: 'En cours (50%)' },
                                                        { value: 'Programmed', label: 'Programmé (100%)' },
                                                        { value: 'Done', label: 'Terminé (100%)' },
                                                    ]}
                                                />
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-1.5">
                                                    {task.assignedUserId ? (() => {
                                                        const au = users.find(u => u.id === task.assignedUserId);
                                                        return au ? <Avatar userId={au.id} name={au.name} color={au.avatarColor} size={20} /> : null;
                                                    })() : (
                                                        <UserCircle size={20} className="text-slate-300 dark:text-slate-600 shrink-0" />
                                                    )}
                                                    <div className="flex-1">
                                                        <Select
                                                            size="sm"
                                                            value={task.assignedUserId || ''}
                                                            disabled={!canEdit}
                                                            onChange={(v) => updateTask(task.id, 'assignedUserId', v || undefined)}
                                                            placeholder="— Non assigné —"
                                                            options={[{ value: '', label: '— Non assigné —' }, ...users.map(u => ({ value: u.id, label: u.name }))]}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <input
                                                    type="number"
                                                    disabled={!canEdit}
                                                    value={task.cost}
                                                    onChange={(e) => updateTask(task.id, 'cost', Number(e.target.value))}
                                                    className="w-full bg-transparent outline-none text-bony-text text-sm text-right font-sans focus:text-bony-orange disabled:opacity-50"
                                                />
                                            </td>
                                            <td className="p-3 text-center">
                                                {canEdit && (
                                                    <button onClick={() => removeTask(task.id)} className="p-2 text-slate-400 hover:text-red-500 transition opacity-100 md:opacity-0 md:group-hover:opacity-100">
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {selectedProject.tasks.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-slate-500 text-sm italic">
                                                Aucune tâche définie. Ajoutez des tâches pour piloter le budget et l'avancement.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="space-y-2 pt-4">
                        <label className="block text-xs font-bold text-slate-500 tracking-widest uppercase">Description Globale</label>
                        <textarea 
                            value={selectedProject.description}
                            disabled={!canEdit}
                            onChange={(e) => handleUpdateProject({...selectedProject, description: e.target.value})}
                            className="w-full h-32 gx-glass-panel rounded-lg p-4 text-bony-text outline-none focus:border-bony-blue resize-none leading-relaxed text-sm disabled:opacity-50"
                            placeholder="Contexte général du projet..."
                        />
                    </div>
                </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            {viewMode === 'archived' ? (
                <>
                    <Archive size={80} className="mb-4 opacity-20" />
                    <p className="font-title text-xl opacity-50">SÉLECTIONNEZ UNE ARCHIVE</p>
                </>
            ) : (
                <>
                    <FolderKanban size={80} className="mb-4 opacity-20" />
                    <p className="font-title text-xl opacity-50">SÉLECTIONNEZ UN PROJET</p>
                </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Projects;
