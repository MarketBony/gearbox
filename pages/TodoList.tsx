
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckSquare, ChevronLeft, ChevronRight, Filter, Search, X,
  ExternalLink, Calendar, Tag, Banknote, Radio, ChevronDown, ChevronUp
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import DatePicker from '../components/DatePicker';
import { db } from '../services/dataService';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { Project, Task, TaskStatus, BrandType, ServiceType, PlaqueName } from '../types';
import { BRAND_COLORS, SERVICE_COLORS, PLAQUES_STRUCTURE, BRANDS, SERVICES } from '../constants';

// ---- Types ----
interface TodoTask extends Task {
  projectId: string;
  projectName: string;
  projectSite: string;
  projectBrands: BrandType[];
  projectService: ServiceType[];
  projectStartDate: string;
  projectEndDate: string;
}

interface KanbanCol {
  status: TaskStatus;
  label: string;
  color: string;
  headerBg: string;
  dot: string;
}

// ---- Constants ----
const KANBAN_COLS: KanbanCol[] = [
  { status: 'Todo',       label: 'À faire',    color: 'text-blue-500',       headerBg: 'bg-blue-500/10 border-blue-400/30',       dot: 'bg-blue-500' },
  { status: 'InProgress', label: 'En cours',   color: 'text-bony-orange',    headerBg: 'bg-bony-orange/10 border-bony-orange/30', dot: 'bg-bony-orange' },
  { status: 'Programmed', label: 'Programmé',  color: 'text-bony-violet',    headerBg: 'bg-bony-violet/10 border-bony-violet/30', dot: 'bg-bony-violet' },
  { status: 'Done',       label: 'Terminé',    color: 'text-green-500',      headerBg: 'bg-green-500/10 border-green-500/30',     dot: 'bg-green-500' },
];
const KANBAN_ORDER: TaskStatus[] = ['Todo', 'InProgress', 'Programmed', 'Done'];

const PLAQUE_NAMES = Object.keys(PLAQUES_STRUCTURE) as PlaqueName[];

// ---- Helpers ----
function today(): string {
  return new Date().toISOString().split('T')[0];
}

function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function projectSites(p: Project): string[] {
  return p.sites?.length ? p.sites : [p.site];
}

function matchesSiteFilter(p: Project, selected: string[]): boolean {
  if (!selected.length) return true;
  const pSites = projectSites(p);
  for (const ctx of selected) {
    if (ctx in PLAQUES_STRUCTURE) {
      const plaqueSites: string[] = PLAQUES_STRUCTURE[ctx as PlaqueName];
      if (pSites.some(s => plaqueSites.includes(s))) return true;
    } else {
      if (pSites.includes(ctx)) return true;
    }
  }
  return false;
}

function recalcProject(project: Project): Project {
  let totalWeight = 0;
  if (project.tasks.length > 0) {
    project.tasks.forEach(t => {
      if (t.status === 'Done' || t.status === 'Programmed') totalWeight += 1;
      else if (t.status === 'InProgress') totalWeight += 0.5;
    });
    project.progress = Math.round((totalWeight / project.tasks.length) * 100);
  } else {
    project.progress = 0;
  }
  project.budgetActual = project.tasks.reduce((sum, t) => sum + (t.cost || 0), 0);
  return project;
}

// ---- Site filter dropdown ----
const SiteFilterDropdown: React.FC<{
  selected: string[];
  onChange: (v: string[]) => void;
}> = ({ selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [expandedPlaques, setExpandedPlaques] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (ctx: string) => {
    onChange(selected.includes(ctx) ? selected.filter(s => s !== ctx) : [...selected, ctx]);
  };

  const togglePlaque = (plaque: PlaqueName) => {
    const sites = PLAQUES_STRUCTURE[plaque];
    const allSelected = sites.every(s => selected.includes(s));
    if (allSelected) {
      onChange(selected.filter(s => !sites.includes(s as any) && s !== plaque));
    } else {
      const newSel = [...selected.filter(s => !sites.includes(s as any) && s !== plaque), ...sites];
      onChange([...new Set(newSel)]);
    }
  };

  const toggleExpandPlaque = (plaque: string) => {
    setExpandedPlaques(prev => {
      const next = new Set(prev);
      next.has(plaque) ? next.delete(plaque) : next.add(plaque);
      return next;
    });
  };

  const label = selected.length === 0 ? 'Périmètre' : `${selected.length} site${selected.length > 1 ? 's' : ''}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
          selected.length > 0
            ? 'bg-bony-orange/10 border-bony-orange/40 text-bony-orange'
            : 'border-bony-border text-bony-text/70 hover:border-bony-orange/40'
        }`}
      >
        <Tag size={13} />
        <span>{label}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-60 glass-menu rounded-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-bony-border">
            <span className="text-xs font-bold text-bony-text/50 uppercase tracking-wider">Périmètre</span>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="text-[10px] text-bony-orange hover:underline">Tout effacer</button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {PLAQUE_NAMES.map(plaque => {
              const sites = PLAQUES_STRUCTURE[plaque];
              const expanded = expandedPlaques.has(plaque);
              const allSelected = sites.every(s => selected.includes(s));
              const someSelected = sites.some(s => selected.includes(s));
              return (
                <div key={plaque}>
                  <div className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 cursor-pointer" onClick={() => toggleExpandPlaque(plaque)}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                      onChange={() => togglePlaque(plaque)}
                      onClick={e => e.stopPropagation()}
                      className="accent-bony-orange"
                    />
                    <span className="flex-1 text-sm font-semibold text-bony-text/80">{plaque}</span>
                    {expanded ? <ChevronUp size={12} className="text-bony-text/40" /> : <ChevronDown size={12} className="text-bony-text/40" />}
                  </div>
                  {expanded && sites.map(site => (
                    <label key={site} className="flex items-center gap-2 pl-8 pr-3 py-1.5 hover:bg-white/5 cursor-pointer text-sm text-bony-text/70">
                      <input
                        type="checkbox"
                        checked={selected.includes(site)}
                        onChange={() => toggle(site)}
                        className="accent-bony-orange shrink-0"
                      />
                      <span className="truncate min-w-0">{site}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ---- Task Card ----
const TaskCard: React.FC<{
  task: TodoTask;
  colIndex: number;
  onMove: (id: string, projectId: string, newStatus: TaskStatus) => void;
  onNavigate: () => void;
}> = ({ task, colIndex, onMove, onNavigate }) => {
  const days = daysUntil(task.projectEndDate);
  const urgency = days < 0 ? 'overdue' : days <= 3 ? 'critical' : days <= 7 ? 'warning' : 'ok';

  const urgencyBorder = urgency === 'overdue' || urgency === 'critical' ? 'border-l-red-500' : urgency === 'warning' ? 'border-l-bony-orange' : 'border-l-transparent';

  const canGoLeft = colIndex > 0;
  const canGoRight = colIndex < KANBAN_ORDER.length - 1;

  return (
    <div className={`gx-card p-3 flex flex-col gap-2 border-l-4 ${urgencyBorder} transition-all hover:shadow-md`}>
      {/* Task name */}
      <p className="font-semibold text-sm text-slate-900 dark:text-bony-text leading-snug">{task.name}</p>

      {/* Project badge */}
      <button
        onClick={onNavigate}
        className="flex items-center gap-1.5 text-left group"
      >
        <span className="text-xs text-bony-text/60 dark:text-bony-text/50 group-hover:text-bony-orange transition-colors truncate max-w-[180px]">
          {task.projectName}
        </span>
        <span className="text-[10px] text-bony-text/40 dark:text-bony-text/30 shrink-0">{task.projectSite}</span>
        <ExternalLink size={10} className="text-bony-text/30 group-hover:text-bony-orange transition-colors shrink-0" />
      </button>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1">
        {task.projectService.map(s => (
          <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${SERVICE_COLORS[s]}`}>{s}</span>
        ))}
        {task.projectBrands.map(b => (
          <span key={b} className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${BRAND_COLORS[b]}`}>{b}</span>
        ))}
        {task.channel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-white/10 text-slate-600 dark:text-bony-text/50 bg-slate-100 dark:bg-white/5">
            {task.channel}
          </span>
        )}
      </div>

      {/* Cost + date */}
      <div className="flex items-center justify-between gap-2">
        {task.cost > 0 && (
          <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-bony-text/50">
            <Banknote size={11} />
            {task.cost.toLocaleString('fr-FR')} €
          </span>
        )}
        <span className={`flex items-center gap-1 text-[10px] ml-auto font-medium ${
          urgency === 'overdue' ? 'text-red-500' :
          urgency === 'critical' ? 'text-red-400' :
          urgency === 'warning' ? 'text-bony-orange' :
          'text-slate-500 dark:text-bony-text/40'
        }`}>
          <Calendar size={10} />
          {urgency === 'overdue'
            ? `Expiré il y a ${Math.abs(days)}j`
            : urgency === 'critical'
            ? `${days}j restant${days > 1 ? 's' : ''}`
            : formatDate(task.projectEndDate)}
        </span>
      </div>

      {/* Move buttons */}
      <div className="flex gap-1 pt-1 border-t border-slate-100 dark:border-white/5">
        <button
          onClick={() => canGoLeft && onMove(task.id, task.projectId, KANBAN_ORDER[colIndex - 1])}
          disabled={!canGoLeft}
          className="flex-1 flex items-center justify-center gap-1 py-2.5 md:py-1 rounded text-xs text-slate-500 dark:text-bony-text/50 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={13} />
        </button>
        <button
          onClick={() => canGoRight && onMove(task.id, task.projectId, KANBAN_ORDER[colIndex + 1])}
          disabled={!canGoRight}
          className="flex-1 flex items-center justify-center gap-1 py-2.5 md:py-1 rounded text-xs text-slate-500 dark:text-bony-text/50 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
};

// ---- Main page ----
const TodoList: React.FC = () => {
  const { user } = useAuth();
  const [allTasks, setAllTasks] = useState<TodoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterSites, setFilterSites] = useState<string[]>([]);
  const [filterBrands, setFilterBrands] = useState<BrandType[]>([]);
  const [filterServices, setFilterServices] = useState<ServiceType[]>([]);
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Mobile kanban tab
  const [mobileCol, setMobileCol] = useState(0);

  const todayStr = today();

  // ---- Load tasks ----
  const loadTasks = useCallback(async () => {
    if (!user) return;
    const projects = await db.getProjects();
    const active = projects.filter(p =>
      (p.status === 'Active' || p.status === 'Draft') && p.endDate >= todayStr
    );
    const tasks: TodoTask[] = [];
    for (const p of active) {
      for (const t of p.tasks) {
        if (t.assignedUserId === user.id && t.status !== 'Empty') {
          tasks.push({
            ...t,
            projectId: p.id,
            projectName: p.name,
            projectSite: p.site,
            projectBrands: p.brands,
            projectService: p.service,
            projectStartDate: p.startDate,
            projectEndDate: p.endDate,
          });
        }
      }
    }
    // Sort by end date asc
    tasks.sort((a, b) => a.projectEndDate.localeCompare(b.projectEndDate));
    setAllTasks(tasks);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Temps réel : les tâches affichées sont celles des projets. Remplace le
  // polling toutes les 30 s qui compensait l'absence de temps réel — la mise à
  // jour est maintenant immédiate, et sans requête quand rien ne bouge.
  useRealtimeSync(RT_EVENTS.projects, () => loadTasks());

  // ---- Update task status ----
  const moveTask = useCallback(async (taskId: string, projectId: string, newStatus: TaskStatus) => {
    setSaving(true);
    const projects = await db.getProjects();
    const target = projects.find(p => p.id === projectId);
    if (target) {
      const newTasks = target.tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t);
      // PUT unitaire du seul projet concerné (API réelle).
      try {
        await db.updateProject(recalcProject({ ...target, tasks: newTasks }));
      } catch (error) {
        console.error('Task move failed:', error);
        alert('Échec de la sauvegarde (serveur injoignable ?).');
      }
    }
    setSaving(false);
    await loadTasks();
  }, [loadTasks]);

  // ---- Navigate to project ----
  const navigateToProject = (projectId: string) => {
    window.sessionStorage.setItem('pendingProjectId', projectId);
    window.dispatchEvent(new CustomEvent('gearbox-navigate', { detail: { tab: 'projects', projectId } }));
  };

  // ---- Filtered tasks ----
  const filteredTasks = allTasks.filter(t => {
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !t.projectName.toLowerCase().includes(q)) return false;
    }
    if (filterSites.length) {
      // Build a temp project-like object to reuse matchesSiteFilter
      const fakeProject = { site: t.projectSite, sites: [t.projectSite] } as any;
      if (!matchesSiteFilter(fakeProject, filterSites)) return false;
    }
    if (filterBrands.length && !filterBrands.some(b => t.projectBrands.includes(b))) return false;
    if (filterServices.length && !filterServices.some(s => t.projectService.includes(s))) return false;
    if (filterDateStart && t.projectEndDate < filterDateStart) return false;
    if (filterDateEnd && t.projectStartDate > filterDateEnd) return false;
    return true;
  });

  const tasksByStatus = (status: TaskStatus) => filteredTasks.filter(t => t.status === status);

  const activeFilterCount =
    (filterSites.length > 0 ? 1 : 0) +
    (filterBrands.length > 0 ? 1 : 0) +
    (filterServices.length > 0 ? 1 : 0) +
    (filterDateStart || filterDateEnd ? 1 : 0) +
    (search ? 1 : 0);

  const resetFilters = () => {
    setSearch('');
    setFilterSites([]);
    setFilterBrands([]);
    setFilterServices([]);
    setFilterDateStart('');
    setFilterDateEnd('');
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-bony-orange animate-pulse font-title text-sm">
        Chargement…
      </div>
    );
  }

  // ---- Filter panel (shared desktop/mobile) ----
  const FilterPanel = (
    <div className="flex flex-col md:flex-row md:flex-wrap gap-3 p-3 bg-slate-50 dark:bg-black/20 rounded-xl border border-slate-200 dark:border-bony-border">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px]">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bony-text/40" />
        <input
          type="text"
          placeholder="Rechercher une tâche ou un projet…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-bony-border rounded-lg text-slate-900 dark:text-bony-text placeholder-slate-400 dark:placeholder-bony-text/30 focus:outline-none focus:border-bony-orange/60"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-bony-text/30 hover:text-bony-text">
            <X size={12} />
          </button>
        )}
      </div>

      <div className="w-px bg-slate-200 dark:bg-bony-border hidden md:block" />

      {/* Site filter */}
      <SiteFilterDropdown selected={filterSites} onChange={setFilterSites} />

      <div className="w-px bg-slate-200 dark:bg-bony-border hidden md:block" />

      {/* Brands chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {BRANDS.map(b => (
          <button
            key={b}
            onClick={() => setFilterBrands(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])}
            className={`text-[10px] px-2 py-1 rounded border font-semibold transition-all ${
              filterBrands.includes(b) ? BRAND_COLORS[b] : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-bony-text/40 hover:border-slate-400 dark:hover:border-white/30'
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="w-px bg-slate-200 dark:bg-bony-border hidden md:block" />

      {/* Services chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {SERVICES.filter(s => s !== 'Tous Services').map(s => (
          <button
            key={s}
            onClick={() => setFilterServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
            className={`text-[10px] px-2 py-1 rounded border font-semibold transition-all ${
              filterServices.includes(s) ? SERVICE_COLORS[s] : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-bony-text/40 hover:border-slate-400 dark:hover:border-white/30'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="w-px bg-slate-200 dark:bg-bony-border hidden md:block" />

      {/* Date range */}
      <div className="flex items-center gap-2">
        <Calendar size={13} className="text-bony-text/40 shrink-0" />
        <DatePicker
          value={filterDateStart}
          onChange={v => setFilterDateStart(v)}
          size="sm"
        />
        <span className="text-bony-text/30 text-xs">→</span>
        <DatePicker
          value={filterDateEnd}
          onChange={v => setFilterDateEnd(v)}
          size="sm"
        />
      </div>

      {activeFilterCount > 0 && (
        <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-500 transition-colors">
          <X size={12} /> Effacer tout
        </button>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 md:px-6 pt-4 pb-3 border-b border-bony-border shrink-0">
        <CheckSquare size={22} className="text-bony-orange" />
        <h1 className="text-xl font-bold font-title">To-do</h1>
        <span className="text-bony-text/40 text-sm">
          {filteredTasks.length} tâche{filteredTasks.length !== 1 ? 's' : ''} assignée{filteredTasks.length !== 1 ? 's' : ''}
        </span>
        {saving && <span className="ml-auto text-xs text-bony-orange animate-pulse">Sauvegarde…</span>}
      </div>

      {/* Filter bar — desktop: always visible | mobile: collapsible */}
      <div className="px-4 md:px-6 py-3 border-b border-bony-border shrink-0">
        {/* Mobile toggle */}
        <div className="md:hidden mb-2 flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              activeFilterCount > 0
                ? 'bg-bony-orange/10 border-bony-orange/40 text-bony-orange'
                : 'border-bony-border text-bony-text/70'
            }`}
          >
            <Filter size={14} />
            Filtres
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 bg-bony-orange text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
            {showFilters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-xs text-red-400 hover:text-red-500">
              Tout effacer
            </button>
          )}
        </div>

        {/* Desktop: always show | Mobile: conditional */}
        <div className={`${showFilters ? 'block' : 'hidden'} md:block`}>
          {FilterPanel}
        </div>
      </div>

      {/* Mobile: column tab selector */}
      <div className="md:hidden flex border-b border-bony-border shrink-0 overflow-x-auto">
        {KANBAN_COLS.map((col, i) => {
          const count = tasksByStatus(col.status).length;
          return (
            <button
              key={col.status}
              onClick={() => setMobileCol(i)}
              className={`flex-1 flex flex-col items-center py-2 px-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors min-w-[80px] ${
                mobileCol === i
                  ? `border-current ${col.color}`
                  : 'border-transparent text-bony-text/50'
              }`}
            >
              <span>{col.label}</span>
              <span className={`text-[10px] font-bold mt-0.5 ${mobileCol === i ? col.color : 'text-bony-text/30'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredTasks.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-bony-text/40 p-8">
          <CheckSquare size={40} strokeWidth={1} />
          <p className="text-sm text-center">
            {allTasks.length === 0
              ? 'Aucune tâche ne vous est assignée dans les projets actifs.'
              : 'Aucune tâche ne correspond aux filtres sélectionnés.'}
          </p>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-xs text-bony-orange hover:underline">
              Effacer les filtres
            </button>
          )}
        </div>
      )}

      {/* Kanban board */}
      {filteredTasks.length > 0 && (
        <div className="flex-1 overflow-hidden">
          {/* Desktop: 4 columns side by side */}
          <div className="hidden md:grid md:grid-cols-4 gap-4 h-full p-4 md:p-6 overflow-hidden">
            {KANBAN_COLS.map((col, colIndex) => {
              const tasks = tasksByStatus(col.status);
              return (
                <div key={col.status} className="flex flex-col overflow-hidden">
                  {/* Column header */}
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border ${col.headerBg} shrink-0`}>
                    <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>{col.label}</span>
                    <span className={`ml-auto text-xs font-bold ${col.color} opacity-70`}>{tasks.length}</span>
                  </div>
                  {/* Tasks */}
                  <div className="flex-1 overflow-y-auto bg-slate-100/50 dark:bg-white/[0.02] border-x border-b border-slate-200 dark:border-bony-border/30 rounded-b-xl p-2 space-y-2">
                    {tasks.length === 0 ? (
                      <div className="flex items-center justify-center py-8 text-bony-text/20 text-xs">
                        Aucune tâche
                      </div>
                    ) : (
                      tasks.map(task => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          colIndex={colIndex}
                          onMove={moveTask}
                          onNavigate={() => navigateToProject(task.projectId)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile: single column */}
          <div className="md:hidden h-full overflow-y-auto p-3 space-y-2">
            {(() => {
              const col = KANBAN_COLS[mobileCol];
              const tasks = tasksByStatus(col.status);
              if (tasks.length === 0) {
                return (
                  <div className="flex items-center justify-center py-12 text-bony-text/30 text-sm">
                    Aucune tâche dans cette colonne
                  </div>
                );
              }
              return tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  colIndex={mobileCol}
                  onMove={moveTask}
                  onNavigate={() => navigateToProject(task.projectId)}
                />
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default TodoList;
