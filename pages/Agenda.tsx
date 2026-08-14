
import React, { useState, useEffect, useMemo } from 'react';
import { useSessionState } from '../hooks/useSessionState';
import { db } from '../services/dataService';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { Project, ServiceType, BrandType, ProjectType } from '../types';
import { SERVICE_COLORS, BRANDS, SERVICES, PROJECT_TYPES, BRAND_COLORS } from '../constants';
import { ChevronLeft, ChevronRight, Calendar, Filter, X } from 'lucide-react';
import Select from '../components/Select';
import ProjectSummary from '../components/ProjectSummary';
import CalendarGrid, { EventRenderMeta } from '../components/calendar/CalendarGrid';
import EventBar from '../components/calendar/EventBar';
import { serviceAccent } from '../components/calendar/calendarShared';

type ViewMode = 'Semaine' | 'Mois' | 'Trimestre' | 'Semestre' | 'Année';

// --- DATE UTILS ---

// Normalize a date to 00:00:00 local time to avoid timezone/hour spanning issues
const normalizeDate = (d: Date | string) => {
    const date = new Date(d);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const getStartOfWeek = (date: Date) => {
  const d = normalizeDate(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday (0) -> Mon (1)
  return new Date(d.setDate(diff));
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const getMonthDays = (year: number, month: number) => {
  const date = new Date(year, month, 1);
  const days = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

const isSameDay = (d1: Date, d2: Date) => {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};

const formatDateRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const fmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
    if (s.getTime() === e.getTime()) return fmt.format(s);
    return `${fmt.format(s)} - ${fmt.format(e)}`;
};

const getServiceColor = (services: ServiceType[]) => {
    // UPDATED COLORS FOR BETTER CONTRAST IN LIGHT MODE
    if (!services || services.length === 0) return 'border-slate-500 bg-slate-200 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300';
    const mainSvc = services[0];
    if (mainSvc === 'Tous Services') return 'border-slate-400 bg-slate-300 dark:bg-slate-500/30 text-slate-800 dark:text-slate-200';
    
    const colorClass = SERVICE_COLORS[mainSvc] || '';
    if (colorClass.includes('blue')) return 'border-blue-500 bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-200';
    if (colorClass.includes('orange')) return 'border-orange-500 bg-orange-100 dark:bg-orange-500/20 text-orange-800 dark:text-orange-200';
    if (colorClass.includes('emerald')) return 'border-emerald-500 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200';
    if (colorClass.includes('cyan')) return 'border-cyan-400 bg-cyan-100 dark:bg-cyan-400/20 text-cyan-800 dark:text-cyan-200';
    return 'border-slate-500 bg-slate-200 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300';
};

// NB : la mise en page mois/semaine (packing en lanes) est désormais mutualisée
// dans components/calendar/CalendarGrid.tsx (source unique partagée avec Matériel).
// Les vues Trimestre/Semestre/Année ci-dessous gardent leur propre rendu timeline.

// --- COMPONENTS ---

/** Navigation vers la fiche projet (dispatch d'un événement global). */
const navigateToProject = (project: Project) => {
    // CRITICAL: Set the pending ID in session storage so Projects.tsx sees it on mount
    window.sessionStorage.setItem('pendingProjectId', project.id);
    window.dispatchEvent(new CustomEvent('gearbox-navigate', {
        detail: { tab: 'projects', projectId: project.id },
    }));
};

/** Contenu du tooltip projet — partagé entre la timeline (ProjectPill) et la grille.
 *  Définition unique dans `components/ProjectSummary.tsx` depuis le 06/08/2026 : le
 *  Chat s'en sert aussi pour les projets cités. Cet alias garde les appels d'ici
 *  inchangés. */
const ProjectTooltipContent = ProjectSummary;

const ProjectPill: React.FC<{ 
    project: Project; 
    style?: React.CSSProperties; 
    className?: string;
    showProgress?: boolean;
}> = ({ project, style, className, showProgress = false }) => {
    
    const [isHovered, setIsHovered] = useState(false);
    const baseColorClass = getServiceColor(project.service);

    const handleNavigate = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigateToProject(project);
    };

    return (
        <>
        <div 
            onClick={handleNavigate}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`
                relative border-l-[3px] rounded-r px-2 shadow-sm 
                hover:brightness-125 hover:z-50 transition cursor-pointer overflow-hidden whitespace-nowrap
                flex flex-col justify-center select-none z-10
                ${baseColorClass} ${className}
            `}
            style={style}
        >
           <div className="flex items-center justify-between gap-2 overflow-hidden">
               <span className="font-bold truncate text-[10px] leading-tight">{project.name}</span>
               {showProgress && <span className="text-[9px] font-sans opacity-60 ml-1">{formatDateRange(project.startDate, project.endDate)}</span>}
           </div>

           {/* PROGRESS BAR (Only if showProgress is true - WEEK VIEW) */}
           {showProgress && (
               <div className="mt-1 w-full">
                   <div className="flex justify-between items-center text-[8px] opacity-80 mb-0.5 font-sans">
                        <span>{project.progress}%</span>
                        <span>{project.budgetActual}€</span>
                   </div>
                   <div className="h-1 bg-black/20 rounded-full overflow-hidden w-full">
                       <div className="h-full bg-current opacity-80" style={{width: `${project.progress}%`}}></div>
                   </div>
               </div>
           )}
        </div>

        {/* --- TOOLTIP --- */}
        {isHovered && (
            <div
                className="absolute z-[100] w-64 glass-menu rounded-xl p-4 animate-in fade-in duration-200 pointer-events-none"
                style={{
                    top: '100%',
                    left: style?.left ? style.left : '0%',
                    marginTop: '4px'
                }}
            >
                <ProjectTooltipContent project={project} />
            </div>
        )}
        </>
    );
};

// Generic Bar for Timeline (Quarter/Year)
const ProjectBarGantt: React.FC<{ project: Project, viewStart: Date, totalDays: number }> = ({ project, viewStart, totalDays }) => {
    // Normalization essential for timeline too
    const pStart = normalizeDate(project.startDate);
    const pEnd = normalizeDate(project.endDate);
    const vStart = normalizeDate(viewStart);

    const diffTime = Math.max(0, pStart.getTime() - vStart.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    const durationTime = pEnd.getTime() - pStart.getTime();
    const durationDays = Math.max(1, Math.ceil(durationTime / (1000 * 60 * 60 * 24))); // Min 1 day

    const leftPercent = (diffDays / totalDays) * 100;
    const widthPercent = (durationDays / totalDays) * 100;
    const safeLeft = Math.max(0, Math.min(100, leftPercent));
    const safeWidth = Math.min(100 - safeLeft, widthPercent);

    return (
        <div className="absolute h-full" style={{ left: `${safeLeft}%`, width: `${safeWidth}%`, minWidth: '4px' }}>
            <ProjectPill project={project} className="h-full" showProgress={false} />
        </div>
    );
};

const Agenda: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  // CHANGED: Default view is 'Semaine' and Date is Today (new Date())
  const [view, setView] = useSessionState<ViewMode>('agenda_view', 'Semaine');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterBrand, setFilterBrand] = useSessionState<BrandType | 'All'>('agenda_filterBrand', 'All');
  const [filterService, setFilterService] = useSessionState<ServiceType | 'All'>('agenda_filterService', 'All');
  const [filterType, setFilterType] = useSessionState<ProjectType | 'All'>('agenda_filterType', 'All');

  const loadProjects = async () => {
      const data = await db.getProjects();
      setProjects(data);
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // Temps réel : le planning est une vue des projets.
  useRealtimeSync(RT_EVENTS.projects, () => loadProjects());

  const filteredProjects = useMemo(() => {
      return projects.filter(p => {
          // Brouillon : ne remonte nulle part (règle métier, cf. CLAUDE.md).
          // Cette vue n'avait aucun filtre de statut — les brouillons y
          // apparaissaient par défaut, pas par choix.
          if (p.status === 'Draft') return false;
          if (filterBrand !== 'All' && !(p.brands || []).includes(filterBrand) && !(p.brands || []).includes('Holding')) return false;
          if (filterService !== 'All' && !p.service.includes(filterService) && !p.service.includes('Tous Services')) return false;
          if (filterType !== 'All' && p.projectType !== filterType) return false;
          return true;
      });
  }, [projects, filterBrand, filterService, filterType]);

  // --- NAVIGATION ---
  const handlePrev = () => {
      const d = new Date(currentDate);
      if (view === 'Semaine') d.setDate(d.getDate() - 7);
      else if (view === 'Mois') d.setMonth(d.getMonth() - 1);
      else if (view === 'Trimestre') d.setMonth(d.getMonth() - 3);
      else if (view === 'Semestre') d.setMonth(d.getMonth() - 6);
      else if (view === 'Année') d.setFullYear(d.getFullYear() - 1);
      setCurrentDate(d);
  };

  const handleNext = () => {
      const d = new Date(currentDate);
      if (view === 'Semaine') d.setDate(d.getDate() + 7);
      else if (view === 'Mois') d.setMonth(d.getMonth() + 1);
      else if (view === 'Trimestre') d.setMonth(d.getMonth() + 3);
      else if (view === 'Semestre') d.setMonth(d.getMonth() + 6);
      else if (view === 'Année') d.setFullYear(d.getFullYear() + 1);
      setCurrentDate(d);
  };

  const handleToday = () => setCurrentDate(new Date());

  // --- RENDERERS ---

  // --- ÉVÉNEMENT PROJET (rendu partagé via EventBar, style Digital) ---
  // Le contenu diffère entre Mois (compact) et Semaine (avec progression),
  // mais la coquille visuelle et le comportement viennent du composant partagé.
  const renderProjectEvent = (project: Project, meta: EventRenderMeta) => (
      <EventBar
          accentClass={serviceAccent(project.service)}
          onClick={(e) => { e.stopPropagation(); navigateToProject(project); }}
          tooltip={<ProjectTooltipContent project={project} />}
          clipLeft={meta.clipLeft}
          clipRight={meta.clipRight}
      >
          {meta.view === 'week' ? (
              <div className="w-full overflow-hidden">
                  <div className="flex items-center justify-between gap-2 overflow-hidden">
                      <span className="font-bold truncate text-[11px] leading-tight">{project.name}</span>
                      <span className="text-[9px] opacity-60 shrink-0 font-sans">{formatDateRange(project.startDate, project.endDate)}</span>
                  </div>
                  <div className="mt-1 w-full">
                      <div className="flex justify-between items-center text-[8px] opacity-70 mb-0.5 font-sans">
                          <span>{project.progress}%</span>
                          <span>{project.budgetActual}€</span>
                      </div>
                      <div className="h-1 bg-black/10 dark:bg-white/15 rounded-full overflow-hidden w-full">
                          <div className="h-full bg-current opacity-70" style={{ width: `${project.progress}%` }}></div>
                      </div>
                  </div>
              </div>
          ) : (
              <span className="font-bold truncate text-[10px] leading-tight">{project.name}</span>
          )}
      </EventBar>
  );

  // --- VUE MOIS (grille partagée) ---
  const renderMonthView = () => (
      <CalendarGrid
          view="month"
          currentDate={currentDate}
          items={filteredProjects}
          renderEvent={renderProjectEvent}
      />
  );

  // --- VUE SEMAINE (grille partagée) ---
  const renderWeekView = () => (
      <CalendarGrid
          view="week"
          currentDate={currentDate}
          items={filteredProjects}
          renderEvent={renderProjectEvent}
      />
  );

  // --- VUE TIMELINE (TRIMESTRE/ANNEE) ---
  const renderTimelineView = (monthsCount: number) => {
      const startPeriod = new Date(currentDate.getFullYear(), Math.floor(currentDate.getMonth() / 3) * 3, 1);
      if (view === 'Année') startPeriod.setMonth(0);
      if (view === 'Semestre') startPeriod.setMonth(Math.floor(currentDate.getMonth() / 6) * 6);
      
      const endPeriod = new Date(startPeriod);
      endPeriod.setMonth(endPeriod.getMonth() + monthsCount);
      endPeriod.setDate(0);

      const totalDays = (endPeriod.getTime() - startPeriod.getTime()) / (1000 * 60 * 60 * 24);
      
      const visibleProjects = filteredProjects.filter(p => {
          const pStart = normalizeDate(p.startDate);
          const pEnd = normalizeDate(p.endDate);
          const vStart = normalizeDate(startPeriod);
          const vEnd = normalizeDate(endPeriod);
          return pStart <= vEnd && pEnd >= vStart;
      }).sort((a,b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

      const months = [];
      let tempDate = new Date(startPeriod);
      for(let i=0; i<monthsCount; i++) {
          months.push(new Date(tempDate));
          tempDate.setMonth(tempDate.getMonth() + 1);
      }

      return (
          <div className="flex flex-col h-full bg-slate-50/40 dark:bg-black/10 border border-bony-border rounded-b-xl overflow-hidden">
              <div className="flex border-b border-bony-border h-10 divide-x divide-bony-border shrink-0">
                  {months.map(m => (
                      <div key={m.toISOString()} className="flex-1 flex items-center justify-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                          {m.toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}
                      </div>
                  ))}
              </div>
              <div className="flex-1 relative overflow-y-auto custom-scrollbar bg-slate-50/40 dark:bg-black/10 p-4">
                  <div className="absolute inset-0 flex divide-x divide-bony-border/30 pointer-events-none">
                      {months.map(m => <div key={m.toISOString()} className="flex-1"></div>)}
                  </div>
                  <div className="relative space-y-8 pt-2">
                       {visibleProjects.map((p, i) => (
                           <div key={p.id} className="relative h-6 w-full group">
                               <ProjectBarGantt project={p} viewStart={startPeriod} totalDays={totalDays} />
                           </div>
                       ))}
                  </div>
              </div>
          </div>
      );
  };

  const getTitle = () => {
      const opts = { month: 'long', year: 'numeric' } as const;
      if (view === 'Année') return currentDate.getFullYear().toString();
      if (view === 'Semaine') {
          const start = getStartOfWeek(currentDate);
          const end = addDays(start, 6);
          // Show Week Range in Title
          return `${start.toLocaleDateString('fr-FR', {day:'numeric', month:'long'})} - ${end.toLocaleDateString('fr-FR', {day:'numeric', month:'long'})} ${end.getFullYear()}`.toUpperCase();
      }
      if (view === 'Trimestre' || view === 'Semestre') {
           const start = new Date(currentDate.getFullYear(), Math.floor(currentDate.getMonth() / (view === 'Trimestre' ? 3 : 6)) * (view === 'Trimestre' ? 3 : 6), 1);
           return `${view.toUpperCase()} - DÉBUT ${start.toLocaleDateString('fr-FR', opts).toUpperCase()}`;
      }
      return currentDate.toLocaleDateString('fr-FR', opts).toUpperCase();
  };

  return (
    <div className="h-full flex flex-col p-3 md:p-6 animate-fade-in">
      
      {/* HEADER CONTROLS */}
      <div className="flex flex-col gap-4 mb-4 shrink-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:justify-between lg:items-end">
                <div className="flex flex-wrap items-center gap-3 md:gap-4">
                    <h2 className="text-lg md:text-3xl leading-tight text-slate-900 dark:text-white font-title capitalize">{getTitle()}</h2>
                    <div className="flex gap-1 bg-bony-panel p-1 rounded-lg border border-bony-border">
                        <button onClick={handlePrev} className="p-2 md:p-1 hover:text-bony-orange text-slate-400 transition"><ChevronLeft/></button>
                        <button onClick={handleToday} className="px-3 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition uppercase border-x border-bony-border/50">Aujourd'hui</button>
                        <button onClick={handleNext} className="p-2 md:p-1 hover:text-bony-orange text-slate-400 transition"><ChevronRight/></button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 md:gap-4">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-3 py-1.5 min-h-[44px] rounded-lg transition border ${
                            showFilters 
                            ? 'bg-white text-bony-dark border-white' 
                            : 'bg-bony-panel text-slate-500 dark:text-slate-300 border-bony-border hover:text-slate-900 dark:hover:text-white'
                        }`}
                    >
                        {showFilters ? <X size={14} /> : <Filter size={14} />}
                        <span className="text-[10px] font-bold uppercase">Filtres</span>
                    </button>
                    <div className="flex bg-bony-panel p-1 rounded-lg border border-bony-border overflow-x-auto max-w-full">
                        {(['Semaine', 'Mois', 'Trimestre', 'Semestre', 'Année'] as ViewMode[]).map(v => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                className={`px-3 py-1.5 min-h-[44px] rounded text-[10px] font-bold uppercase tracking-wider transition ${
                                    view === v 
                                    ? 'bg-bony-gradient text-white shadow-lg' 
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                </div>
          </div>

          {/* FILTERS TOOLBAR */}
          {showFilters && (
              <div className="glass-strong glass-sheen relative overflow-hidden rounded-lg p-3 flex flex-wrap gap-4 animate-in slide-in-from-top-2">
                  <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Marque:</span>
                      <Select
                          value={filterBrand}
                          onChange={(v) => setFilterBrand(v as any)}
                          options={[{ value: 'All', label: 'Toutes' }, ...BRANDS.map(b => ({ value: b, label: b }))]}
                          size="sm"
                      />
                  </div>
                  <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Service:</span>
                      <Select
                          value={filterService}
                          onChange={(v) => setFilterService(v as any)}
                          options={[{ value: 'All', label: 'Tous' }, ...SERVICES.map(s => ({ value: s, label: s }))]}
                          size="sm"
                      />
                  </div>
                  <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Objet:</span>
                      <Select
                          value={filterType}
                          onChange={(v) => setFilterType(v as any)}
                          options={[{ value: 'All', label: 'Tous' }, ...PROJECT_TYPES.map(t => ({ value: t, label: t }))]}
                          size="sm"
                      />
                  </div>
              </div>
          )}
      </div>

      {/* VIEW RENDERER */}
      <div className="flex-1 min-h-0 shadow-2xl">
          {view === 'Semaine' && renderWeekView()}
          {view === 'Mois' && renderMonthView()}
          {view === 'Trimestre' && renderTimelineView(3)}
          {view === 'Semestre' && renderTimelineView(6)}
          {view === 'Année' && renderTimelineView(12)}
      </div>

    </div>
  );
};

export default Agenda;
