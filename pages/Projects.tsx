
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { Project, Task, TaskStatus, ServiceType, PlaqueName, Site, BrandType, ProjectType, User } from '../types';
import { db } from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';
import { SITES, PLAQUES_STRUCTURE, SERVICES, SERVICE_COLORS, BRANDS, BRAND_COLORS, PROJECT_TYPES, TASK_CHANNELS, DISTRIBUTION_GROUPE_BONY, DISTRIBUTION_GROUPE_BONY_RN, ALPINE_SITES, NISSAN_SITES } from '../constants';
import {
    Plus, Save, Trash2, FolderKanban, CheckCircle2, Circle, PlayCircle,
    CalendarCheck, Coins, TrendingUp, TrendingDown, Search, Filter, X,
    Archive, AlertTriangle, ArrowRight, Wallet, ArrowUp, ArrowDown, Lock, ChevronDown, Check, PieChart, UserCircle
} from 'lucide-react';
import Avatar from '../components/Avatar';

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

  // --- PERMISSIONS ---
  const canEdit = user?.role === 'Master' || user?.role === 'Administrator' || user?.role === 'Coordinator';

  // --- ARCHIVE MODAL STATE ---
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [projectToArchive, setProjectToArchive] = useState<Project | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // --- FILTER STATES ---
  const [showFilters, setShowFilters] = useSessionState<boolean>(`projects_${viewMode}_showFilters`, false);
  const [searchTerm, setSearchTerm] = useSessionState<string>(`projects_${viewMode}_searchTerm`, '');
  const [filterContext, setFilterContext] = useSessionState<string>(`projects_${viewMode}_filterContext`, 'All');
  const [filterService, setFilterService] = useSessionState<ServiceType | 'All'>(`projects_${viewMode}_filterService`, 'All');
  const [filterBrand, setFilterBrand] = useSessionState<BrandType | 'All'>(`projects_${viewMode}_filterBrand`, 'All');
  const [filterType, setFilterType] = useSessionState<ProjectType | 'All'>(`projects_${viewMode}_filterType`, 'All');
  const [filterStatus, setFilterStatus] = useSessionState<string>(`projects_${viewMode}_filterStatus`, 'All');
  const [filterStartDate, setFilterStartDate] = useSessionState<string>(`projects_${viewMode}_filterStartDate`, '');
  const [filterEndDate, setFilterEndDate] = useSessionState<string>(`projects_${viewMode}_filterEndDate`, '');
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

    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    setSelectedProject(updated);
    
    await db.saveProjects(projects.map(p => p.id === updated.id ? updated : p));
    setTimeout(() => setSaving(false), 500);
  }, [projects, canEdit]);

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
          setShowArchiveConfirm(false);
          setProjectToArchive(null);
          setSelectedProject(null);
      }
  };

  const handleDeleteProject = async (id: string) => {
      try {
          const currentProjects = await db.getProjects();
          const updatedProjects = currentProjects.filter(p => p.id !== id);
          await db.saveProjects(updatedProjects);
          setProjects(updatedProjects);
          setSelectedProject(null);
      } catch (error) {
          console.error("Error deleting project:", error);
          alert("Une erreur est survenue lors de la suppression.");
      }
  };

  const createProject = async () => {
    if (!canEdit) return;
    const newProject: Project = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'Nouveau Projet',
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
    const updated = [...projects, newProject];
    setProjects(updated);
    await db.saveProjects(updated);
    setSelectedProject(newProject);
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

      if (b === 'Groupe') {
          newBrands = currentBrands.includes('Groupe') ? [] : ['Groupe'];
      } else {
          let temp = currentBrands.filter(br => br !== 'Groupe');
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
      if (current.length <= 1) return;
      if (!confirm('Retirer cet utilisateur du projet ?')) return;
      handleUpdateProject({ ...selectedProject, assignedUsers: current.filter(id => id !== userId) });
  };

  const filteredProjects = useMemo(() => {
    let result = projects.filter(p => {
        if (viewMode === 'current' && p.status === 'Archived') return false;
        if (viewMode === 'archived' && p.status !== 'Archived') return false;

        if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        
        if (filterContext !== 'All') {
            const isGroup = filterContext === 'GROUPE BONY';
            const isPlaque = Object.keys(PLAQUES_STRUCTURE).includes(filterContext);
            if (!isGroup) {
                if (isPlaque) {
                     const sitesInPlaque = PLAQUES_STRUCTURE[filterContext as PlaqueName];
                     const match = p.site === filterContext || sitesInPlaque.includes(p.site as Site);
                     if (!match) return false;
                } else {
                     if (p.site !== filterContext) return false;
                }
            }
        }

        if (filterService !== 'All') {
            const hasService = p.service.includes(filterService) || p.service.includes('Tous Services');
            if (!hasService) return false;
        }

        if (filterBrand !== 'All') {
             const pBrands = p.brands || [];
             const hasBrand = pBrands.includes(filterBrand) || pBrands.includes('Groupe');
             if (!hasBrand) return false;
        }

        if (filterType !== 'All' && p.projectType !== filterType) return false;
        if (filterStatus !== 'All' && p.status !== filterStatus) return false;
        if (filterStartDate && p.endDate < filterStartDate) return false;
        if (filterEndDate && p.startDate > filterEndDate) return false;

        return true;
    });

    return result.sort((a, b) => {
        const dateA = new Date(a.startDate).getTime();
        const dateB = new Date(b.startDate).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

  }, [projects, viewMode, searchTerm, filterContext, filterService, filterBrand, filterType, filterStatus, filterStartDate, filterEndDate, sortOrder]);

  const budgetVariance = selectedProject ? (selectedProject.budgetPlanned - selectedProject.budgetActual) : 0;
  const isUnderBudget = budgetVariance >= 0;
  const variancePercent = selectedProject && selectedProject.budgetPlanned > 0 
    ? Math.abs((budgetVariance / selectedProject.budgetPlanned) * 100).toFixed(1) 
    : '0.0';

  const resetFilters = () => {
      setSearchTerm('');
      setFilterContext('All');
      setFilterService('All');
      setFilterBrand('All');
      setFilterType('All');
      setFilterStatus('All');
      setFilterStartDate('');
      setFilterEndDate('');
      setSortOrder('desc');
  };

  const getListStatusBadge = (status: string) => {
      switch(status) {
          case 'Draft': return <span className="text-[9px] uppercase font-bold text-slate-500 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2 py-0.5 rounded">Brouillon</span>;
          case 'Active': return <span className="text-[9px] uppercase font-bold text-emerald-600 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-700/50 px-2 py-0.5 rounded">Actif</span>;
          case 'Done': return <span className="text-[9px] uppercase font-bold text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700/50 px-2 py-0.5 rounded">Terminé</span>;
          case 'Archived': return <span className="text-[9px] uppercase font-bold text-slate-500 bg-slate-100 dark:bg-black border border-slate-200 dark:border-white/10 px-2 py-0.5 rounded">Archivé</span>;
          default: return null;
      }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bony-dark relative">
      
      {showArchiveConfirm && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-bony-panel border border-bony-border rounded-xl p-6 max-w-md w-full shadow-2xl">
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

      {/* List Panel — full width on mobile, 1/3 on desktop */}
      <div className={`${selectedProject ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 md:min-w-[350px] border-r border-bony-border flex-col bg-bony-panel`}>
        
        <div className="p-4 border-b border-bony-border space-y-3 bg-bony-panel z-20 shadow-md">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-title text-bony-text flex items-center gap-2">
                    {viewMode === 'archived' && <Archive size={24} className="text-slate-500"/>}
                    {viewMode === 'archived' ? 'Archives' : 'Projets'}
                </h2>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setShowFilters(!showFilters)}
                        className={`p-2 rounded-lg transition border ${showFilters ? 'bg-bony-orange text-white border-bony-orange' : 'bg-slate-100 dark:bg-black/30 text-slate-500 border-bony-border hover:text-bony-text'}`}
                        title="Filtres avancés"
                    >
                        {showFilters ? <X size={20} /> : <Filter size={20} />}
                    </button>
                    {viewMode === 'current' && canEdit && (
                        <button 
                            onClick={createProject} 
                            className="p-2 bg-bony-gradient rounded-lg text-white hover:opacity-90 transition shadow-lg shadow-bony-orange/20"
                        >
                            <Plus size={20} />
                        </button>
                    )}
                </div>
            </div>
            
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={viewMode === 'archived' ? "Rechercher une archive..." : "Rechercher un projet..."}
                    className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg pl-9 pr-3 py-2 text-sm text-bony-text outline-none focus:border-bony-orange transition-colors placeholder-slate-400"
                />
            </div>
        </div>

        {showFilters && (
            <div className="bg-slate-50 dark:bg-black/40 border-b border-bony-border p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                
                <div className="flex justify-between items-center pb-2 border-b border-bony-border">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Trier par date</label>
                    <button 
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="flex items-center gap-2 text-xs font-bold text-bony-text bg-white dark:bg-black/30 px-3 py-1.5 rounded border border-bony-border hover:border-bony-orange transition"
                    >
                        {sortOrder === 'desc' ? 'Plus récents' : 'Plus anciens'}
                        {sortOrder === 'desc' ? <ArrowDown size={12}/> : <ArrowUp size={12}/>}
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Plaque / Site</label>
                        <select value={filterContext} onChange={(e) => setFilterContext(e.target.value)} className="w-full bg-bony-panel border border-bony-border rounded p-2 text-[10px] text-bony-text outline-none focus:border-bony-blue">
                            <option value="All">TOUT LE RÉSEAU</option>
                            {Object.entries(PLAQUES_STRUCTURE).map(([plaqueName, sites]) => (
                                <optgroup key={plaqueName} label={plaqueName}>
                                    <option value={plaqueName}>★ {plaqueName}</option>
                                    {sites.map(site => <option key={site} value={site}>{site}</option>)}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Objet (Type)</label>
                        <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="w-full bg-bony-panel border border-bony-border rounded p-2 text-[10px] text-bony-text outline-none focus:border-bony-blue">
                            <option value="All">TOUS TYPES</option>
                            {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Marque</label>
                        <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value as any)} className="w-full bg-bony-panel border border-bony-border rounded p-2 text-[10px] text-bony-text outline-none focus:border-bony-blue">
                            <option value="All">TOUTES MARQUES</option>
                            {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Service</label>
                        <select value={filterService} onChange={(e) => setFilterService(e.target.value as any)} className="w-full bg-bony-panel border border-bony-border rounded p-2 text-[10px] text-bony-text outline-none focus:border-bony-blue">
                            <option value="All">TOUS SERVICES</option>
                            {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-bony-border">
                    <button onClick={resetFilters} className="text-[10px] font-bold text-slate-500 hover:text-bony-text underline">RÉINITIALISER</button>
                    <div className="text-[10px] font-sans text-bony-orange">{filteredProjects.length} RÉSULTAT(S)</div>
                </div>
            </div>
        )}
        
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredProjects.length > 0 ? filteredProjects.map(project => {
            const isSelected = selectedProject?.id === project.id;
            return (
              <div 
                key={project.id}
                onClick={() => { setSelectedProject(project); setShowDeleteConfirm(false); }}
                className={`p-4 border-b border-bony-border cursor-pointer transition-all group relative ${
                    isSelected ? 'bg-slate-100 dark:bg-white/5' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                 {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-bony-gradient"></div>}

                 <div className="pl-2">
                    <div className="flex justify-between items-start mb-1 gap-2">
                        <h3 className={`font-bold text-sm truncate leading-tight ${isSelected ? 'text-bony-text' : 'text-slate-600 dark:text-slate-300'}`}>{project.name}</h3>
                        <div className="shrink-0">{getListStatusBadge(project.status)}</div>
                    </div>

                    <div className="flex justify-between items-center mb-3">
                         <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 truncate max-w-[150px]">{project.site}</span>
                         {project.tasks.length > 0 && (
                            <div className="flex items-center gap-2">
                                <div className="w-16 h-1 bg-slate-300 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-bony-gradient" style={{width: `${project.progress}%`}}></div>
                                </div>
                                <span className="text-[10px] font-sans text-slate-400">{project.progress}%</span>
                            </div>
                         )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                         <span className="text-[9px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 bg-white dark:bg-black/20">
                            {project.projectType}
                         </span>
                         
                         {project.brands?.slice(0, 2).map(b => (
                             <span key={b} className={`text-[9px] px-1.5 py-0.5 rounded border ${BRAND_COLORS[b] || 'border-slate-300 text-slate-500'}`}>
                                 {b}
                             </span>
                         ))}
                         
                         {project.service.length > 0 && (
                             <span className={`text-[9px] px-1.5 py-0.5 rounded border ${SERVICE_COLORS[project.service[0]]?.replace('bg-', 'bg-opacity-20 bg-') || 'border-slate-300 text-slate-500'}`}>
                                {project.service[0]}
                             </span>
                         )}
                    </div>
                 </div>
              </div>
            );
          }) : (
              <div className="p-8 text-center opacity-50">
                  <FolderKanban className="mx-auto mb-2 text-slate-400" size={32}/>
                  <p className="text-xs font-bold uppercase text-slate-500">Aucun projet trouvé</p>
              </div>
          )}
        </div>
      </div>

      {/* Detail Panel — hidden on mobile when no project selected */}
      <div className={`${selectedProject ? 'flex' : 'hidden md:flex'} flex-1 bg-bony-dark flex-col h-full overflow-hidden`}>
        {selectedProject ? (
          <>
            <div className="h-14 border-b border-bony-border flex items-center justify-between px-3 md:px-6 bg-bony-panel shrink-0 transition-colors">
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
                        <div className="md:col-span-8 bg-bony-panel border border-bony-border rounded-xl p-6 flex flex-col justify-between gap-6 relative overflow-hidden shadow-sm">
                            <div className="absolute top-0 left-0 w-1 h-full bg-bony-gradient"></div>

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
                                     <div className="flex items-center gap-2 bg-slate-100 dark:bg-black/30 border border-bony-border p-1 rounded-lg h-[38px]">
                                         <input 
                                             type="date"
                                             disabled={!canEdit}
                                             value={selectedProject.startDate}
                                             onChange={(e) => handleUpdateProject({...selectedProject, startDate: e.target.value})}
                                             className="bg-transparent text-bony-text text-xs font-bold outline-none flex-1 pl-2 disabled:opacity-50"
                                         />
                                         <ArrowRight size={12} className="text-slate-400"/>
                                         <input 
                                             type="date"
                                             disabled={!canEdit}
                                             value={selectedProject.endDate}
                                             onChange={(e) => handleUpdateProject({...selectedProject, endDate: e.target.value})}
                                             className="bg-transparent text-bony-text text-xs font-bold outline-none flex-1 pl-2 disabled:opacity-50"
                                         />
                                     </div>
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
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-bony-panel border border-bony-border rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar p-1">
                                                <button
                                                    onClick={() => { updateSiteSelection('GROUPE BONY'); setShowSiteDropdown(false); }}
                                                    className={`w-full text-left px-3 py-2 text-xs font-bold rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between ${selectedProject.site === 'GROUPE BONY' ? 'text-bony-orange bg-orange-50 dark:bg-orange-900/20' : 'text-slate-700 dark:text-slate-300'}`}
                                                >
                                                    GROUPE BONY (GLOBAL)
                                                    {selectedProject.site === 'GROUPE BONY' && <Check size={14}/>}
                                                </button>
                                                <button
                                                    onClick={() => { updateSiteSelection('GROUPE BONY (R/N)'); setShowSiteDropdown(false); }}
                                                    className={`w-full text-left px-3 py-2 text-xs font-bold rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between ${selectedProject.site === 'GROUPE BONY (R/N)' ? 'text-bony-orange bg-orange-50 dark:bg-orange-900/20' : 'text-slate-700 dark:text-slate-300'}`}
                                                >
                                                    GROUPE BONY (R/N)
                                                    {selectedProject.site === 'GROUPE BONY (R/N)' && <Check size={14}/>}
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
                                                                    className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between ${isSelected ? 'text-bony-blue font-bold bg-blue-50 dark:bg-blue-900/20' : 'text-slate-600 dark:text-slate-400'}`}
                                                                >
                                                                    {site}
                                                                    {isSelected && <Check size={14}/>}
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
                                                                className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between ${isSelected ? 'text-bony-blue font-bold bg-blue-50 dark:bg-blue-900/20' : 'text-slate-600 dark:text-slate-400'}`}
                                                            >
                                                                {site}
                                                                {isSelected && <Check size={14}/>}
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
                                     <select 
                                        value={selectedProject.projectType || 'OP Clients'}
                                        disabled={!canEdit}
                                        onChange={(e) => handleUpdateProject({...selectedProject, projectType: e.target.value as any})}
                                        className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg p-2.5 text-bony-text outline-none focus:border-bony-blue text-sm font-bold appearance-none cursor-pointer hover:bg-slate-200 dark:hover:bg-black/30 transition-colors disabled:opacity-50"
                                     >
                                        {PROJECT_TYPES.map(t => <option key={t} value={t} className="bg-white dark:bg-bony-panel">{t}</option>)}
                                     </select>
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
                                    <div className="pt-2">
                                        <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-3">Équipe projet</label>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {assignedIds.map(uid => {
                                                const u = users.find(x => x.id === uid);
                                                if (!u) return null;
                                                return (
                                                    <div key={uid} className="relative group/av">
                                                        <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={34} />
                                                        {/* Tooltip */}
                                                        <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover/av:opacity-100 pointer-events-none z-20 shadow-lg">
                                                            {u.name}<br/><span className="text-slate-400">{u.role}</span>
                                                        </div>
                                                        {canEdit && assignedIds.length > 1 && (
                                                            <button
                                                                onClick={() => removeAssignedUser(u.id)}
                                                                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/av:opacity-100 transition shadow"
                                                            >
                                                                <X size={8} className="text-white" />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {canEdit && unassignedUsers.length > 0 && (
                                                <div className="relative">
                                                    {showTeamDropdown && (
                                                        <div className="fixed inset-0 z-[90]" onClick={() => setShowTeamDropdown(false)} />
                                                    )}
                                                    <button
                                                        onClick={() => setShowTeamDropdown(v => !v)}
                                                        className="w-[34px] h-[34px] rounded-full border-2 border-dashed border-bony-border text-slate-400 hover:border-bony-orange hover:text-bony-orange transition flex items-center justify-center"
                                                        title="Ajouter un membre"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                    {showTeamDropdown && (
                                                        <div className="absolute top-full left-0 mt-1.5 bg-white dark:bg-bony-panel border border-bony-border rounded-xl shadow-2xl z-[100] min-w-[180px] overflow-hidden">
                                                            {unassignedUsers.map(u => (
                                                                <button
                                                                    key={u.id}
                                                                    onClick={() => addAssignedUser(u.id)}
                                                                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/5 transition text-left"
                                                                >
                                                                    <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={26} />
                                                                    <div>
                                                                        <p className="text-xs font-bold text-bony-text leading-tight">{u.name}</p>
                                                                        <p className="text-[9px] text-bony-muted">{u.role}</p>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {assignedIds.length === 0 && (
                                                <span className="text-xs text-slate-400 italic">Aucun membre assigné</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* BUDGET ALLOCATION SECTION */}
                            {(selectedProject.sites && selectedProject.sites.length > 1) && (
                                <div className="mt-6 pt-6 border-t border-bony-border animate-in fade-in">
                                    <h4 className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-4 flex items-center gap-2">
                                        <PieChart size={14} className="text-bony-orange"/> Répartition Budgétaire
                                    </h4>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        {(selectedProject.sites || []).map(site => {
                                            const pct = (selectedProject.budgetDistribution || {})[site] || 0;
                                            const isFixed = selectedProject.site === 'GROUPE BONY' || selectedProject.site === 'GROUPE BONY (R/N)';
                                            
                                            return (
                                                <div key={site} className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 w-24 truncate" title={site}>{site}</span>
                                                    <div className="flex-1 flex items-center gap-2 bg-slate-100 dark:bg-black/30 rounded px-2 py-1 border border-bony-border">
                                                        <input 
                                                            type="number" 
                                                            value={Number(pct.toFixed(2))}
                                                            disabled={isFixed || !canEdit}
                                                            onChange={(e) => updateBudgetDistribution(site, Number(e.target.value))}
                                                            className="w-full bg-transparent text-xs font-bold text-right outline-none disabled:opacity-50"
                                                        />
                                                        <span className="text-[10px] text-slate-500">%</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 w-16 text-right">
                                                        {Math.round(selectedProject.budgetActual * (pct/100)).toLocaleString()} €
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    
                                    <div className="mt-2 text-right text-[10px] text-slate-400">
                                        Total: <span className={`font-bold ${Math.abs(Object.values(selectedProject.budgetDistribution || {}).reduce((a,b)=>a+b,0) - 100) > 0.1 ? 'text-red-500' : 'text-emerald-500'}`}>
                                            {Object.values(selectedProject.budgetDistribution || {}).reduce((a,b)=>a+b,0).toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT COLUMN: BUDGET CARD (Inverted for Light Mode or Keep Dark?) Let's adapt it properly */}
                        <div className="md:col-span-4 bg-bony-panel border border-bony-border rounded-xl p-6 flex flex-col justify-between relative overflow-hidden group shadow-sm">
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

                        <div className="bg-bony-panel rounded-xl border border-bony-border overflow-hidden shadow-sm">
                            <table className="w-full text-left">
                                <thead className="bg-slate-100 dark:bg-black/20 text-[10px] uppercase font-bold text-slate-500">
                                    <tr>
                                        <th className="p-3 w-10"></th>
                                        <th className="p-3">Nom de la tâche</th>
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
                                                <select
                                                    value={task.channel || ''}
                                                    disabled={!canEdit}
                                                    onChange={(e) => updateTask(task.id, 'channel', e.target.value)}
                                                    className="w-full bg-slate-100 dark:bg-black/30 border border-bony-border rounded px-2 py-1.5 text-xs text-bony-text outline-none focus:border-bony-blue appearance-none cursor-pointer disabled:opacity-50"
                                                >
                                                    <option value="" className="text-slate-500">-- Aucun --</option>
                                                    {TASK_CHANNELS.map(c => <option key={c} value={c} className="bg-white dark:bg-bony-panel">{c}</option>)}
                                                </select>
                                            </td>
                                            <td className="p-3">
                                                <select 
                                                    value={task.status}
                                                    disabled={!canEdit}
                                                    onChange={(e) => updateTask(task.id, 'status', e.target.value)}
                                                    className="w-full bg-slate-100 dark:bg-black/30 border border-bony-border rounded px-2 py-1.5 text-xs text-bony-text outline-none focus:border-bony-blue appearance-none cursor-pointer disabled:opacity-50"
                                                >
                                                    <option value="Empty" className="bg-white dark:bg-bony-panel">Vierge</option>
                                                    <option value="Todo" className="bg-white dark:bg-bony-panel">À faire (0%)</option>
                                                    <option value="InProgress" className="bg-white dark:bg-bony-panel">En cours (50%)</option>
                                                    <option value="Programmed" className="bg-white dark:bg-bony-panel">Programmé (100%)</option>
                                                    <option value="Done" className="bg-white dark:bg-bony-panel">Terminé (100%)</option>
                                                </select>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-1.5">
                                                    {task.assignedUserId ? (() => {
                                                        const au = users.find(u => u.id === task.assignedUserId);
                                                        return au ? <Avatar userId={au.id} name={au.name} color={au.avatarColor} size={20} /> : null;
                                                    })() : (
                                                        <UserCircle size={20} className="text-slate-300 dark:text-slate-600 shrink-0" />
                                                    )}
                                                    <select
                                                        value={task.assignedUserId || ''}
                                                        disabled={!canEdit}
                                                        onChange={e => updateTask(task.id, 'assignedUserId', e.target.value || undefined)}
                                                        className="flex-1 bg-slate-100 dark:bg-black/30 border border-bony-border rounded px-1.5 py-1.5 text-xs text-bony-text outline-none focus:border-bony-blue appearance-none cursor-pointer disabled:opacity-50"
                                                    >
                                                        <option value="">— Non assigné —</option>
                                                        {users.map(u => (
                                                            <option key={u.id} value={u.id}>{u.name}</option>
                                                        ))}
                                                    </select>
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
                                                    <button onClick={() => removeTask(task.id)} className="text-slate-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100">
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {selectedProject.tasks.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="p-8 text-center text-slate-500 text-sm italic">
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
                            className="w-full h-32 bg-bony-panel border border-bony-border rounded-lg p-4 text-bony-text outline-none focus:border-bony-blue resize-none leading-relaxed text-sm disabled:opacity-50 shadow-sm"
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
