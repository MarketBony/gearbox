
import React, { useState, useEffect, useMemo } from 'react';
import { useSessionState } from '../hooks/useSessionState';
import { db } from '../services/dataService';
import { Project, ServiceType, BrandType, ProjectType } from '../types';
import { SERVICE_COLORS, BRANDS, SERVICES, PROJECT_TYPES, BRAND_COLORS } from '../constants';
import { ChevronLeft, ChevronRight, Calendar, Filter, X } from 'lucide-react';
import Select from '../components/Select';

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

// --- LAYOUT ENGINE (Calculates lanes to avoid overlap) ---
interface LayoutItem {
    project: Project;
    startCol: number;
    span: number;
    lane: number;
}

const calculateLayout = (projects: Project[], startDate: Date, endDate: Date, totalCols: number): LayoutItem[] => {
    // Normalize Grid Boundaries to 00:00:00
    const gridStart = normalizeDate(startDate);
    const gridEnd = normalizeDate(endDate);

    // 1. Filter and clip projects to the view range
    const items = projects.map(p => {
        // Normalize Project Dates to 00:00:00
        const pStart = normalizeDate(p.startDate);
        const pEnd = normalizeDate(p.endDate);

        // Check intersection
        if (pEnd < gridStart || pStart > gridEnd) return null;

        const effectiveStart = pStart < gridStart ? gridStart : pStart;
        const effectiveEnd = pEnd > gridEnd ? gridEnd : pEnd;

        // Calculate columns based on DAY DIFFERENCE (Math.round to handle DST 23h/25h days safe)
        const msPerDay = 1000 * 60 * 60 * 24;
        const startCol = Math.round((effectiveStart.getTime() - gridStart.getTime()) / msPerDay);
        const endCol = Math.round((effectiveEnd.getTime() - gridStart.getTime()) / msPerDay);
        
        // Span must be at least 1
        const span = Math.max(1, endCol - startCol + 1);

        return { project: p, startCol, span, lane: -1 };
    }).filter(Boolean) as LayoutItem[];

    // 2. Sort by start date, then duration (longest first)
    items.sort((a, b) => {
        if (a.startCol !== b.startCol) return a.startCol - b.startCol;
        return b.span - a.span;
    });

    // 3. Assign lanes
    const lanes: number[] = []; // Stores the end column index of the last item in this lane

    items.forEach(item => {
        let placed = false;
        // Try to find an existing lane that is free
        for (let i = 0; i < lanes.length; i++) {
            // If the lane's last item ends before this item starts
            if (lanes[i] < item.startCol) {
                item.lane = i;
                lanes[i] = item.startCol + item.span - 1;
                placed = true;
                break;
            }
        }
        // If not placed, add a new lane
        if (!placed) {
            item.lane = lanes.length;
            lanes.push(item.startCol + item.span - 1);
        }
    });

    return items;
};

// --- COMPONENTS ---

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
        // CRITICAL: Set the pending ID in session storage so Projects.tsx sees it on mount
        window.sessionStorage.setItem('pendingProjectId', project.id);
        
        const event = new CustomEvent('gearbox-navigate', { 
            detail: { tab: 'projects', projectId: project.id } 
        });
        window.dispatchEvent(event);
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
                <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{project.name}</h4>
                    <span className="text-[10px] bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-300">{project.progress}%</span>
                </div>
                
                <div className="space-y-2 mb-3">
                    <div className="flex flex-wrap gap-1">
                        <span className="text-[9px] bg-blue-100 dark:bg-bony-blue/20 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-bony-blue/30 px-1.5 rounded">{project.site}</span>
                        <span className="text-[9px] bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-white/10 px-1.5 rounded">{project.projectType}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {project.brands?.map(b => (
                            <span key={b} className={`text-[8px] px-1.5 rounded border ${BRAND_COLORS[b]}`}>{b}</span>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-bony-border pt-2">
                    <div>
                        <span className="block text-slate-500 font-bold uppercase">Dates</span>
                        <span className="text-slate-800 dark:text-white font-sans">{formatDateRange(project.startDate, project.endDate)}</span>
                    </div>
                    <div>
                        <span className="block text-slate-500 font-bold uppercase">Budget</span>
                        <span className="text-slate-800 dark:text-white font-sans">{project.budgetActual} €</span>
                    </div>
                </div>
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

  useEffect(() => {
    const load = async () => {
        const data = await db.getProjects();
        setProjects(data);
    };
    load();
  }, []);

  const filteredProjects = useMemo(() => {
      return projects.filter(p => {
          if (filterBrand !== 'All' && !(p.brands || []).includes(filterBrand) && !(p.brands || []).includes('Groupe')) return false;
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

  const renderGridHeader = (days: string[]) => {
      return (
          <div className="grid grid-cols-7 border-b border-bony-border bg-[var(--bg-panel)] shrink-0">
              {days.map(d => (
                  <div key={d} className="p-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest border-r border-bony-border last:border-r-0">
                      {d}
                  </div>
              ))}
          </div>
      );
  };

  // --- VUE MOIS ---
  const renderMonthView = () => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      
      const firstDayOfMonth = normalizeDate(new Date(year, month, 1));
      // Adjust start day to Monday (0=Sun -> 6, 1=Mon -> 0)
      const startDayIndex = (firstDayOfMonth.getDay() + 6) % 7;
      
      const daysInMonth = getMonthDays(year, month);
      
      // Build Cells
      const cells = [];
      const prevMonthLastDay = new Date(year, month, 0).getDate();
      for(let i = 0; i < startDayIndex; i++) {
          cells.push({ date: new Date(year, month - 1, prevMonthLastDay - startDayIndex + 1 + i), isCurrentMonth: false });
      }
      daysInMonth.forEach(d => cells.push({ date: d, isCurrentMonth: true }));
      const remaining = 7 - (cells.length % 7);
      if (remaining < 7) {
          for(let i = 1; i <= remaining; i++) {
              cells.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
          }
      }

      // Chunk into Weeks
      const weeks = [];
      for (let i = 0; i < cells.length; i += 7) {
          weeks.push(cells.slice(i, i + 7));
      }

      const daysHeader = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

      return (
          <div className="flex flex-col h-full gx-glass-panel border border-bony-border rounded-b-xl overflow-hidden">
              {renderGridHeader(daysHeader)}
              <div className="flex-1 flex flex-col bg-bony-border gap-[1px] overflow-y-auto custom-scrollbar">
                  {weeks.map((week, weekIdx) => {
                      const weekStart = week[0].date;
                      const weekEnd = week[6].date;
                      
                      // Calculate Layout for this week row
                      const placedProjects = calculateLayout(filteredProjects, weekStart, weekEnd, 7);

                      // Determine Row Height dynamically
                      const maxLane = placedProjects.reduce((max, p) => Math.max(max, p.lane), -1);
                      const itemHeight = 24; 
                      const headerHeight = 28; 
                      const minHeight = 110; 
                      const contentHeight = Math.max(minHeight, headerHeight + (maxLane + 1) * itemHeight + 10);

                      return (
                          <div key={weekIdx} className="relative bg-bony-dark w-full" style={{ height: `${contentHeight}px` }}>
                              {/* Grid Background */}
                              <div className="absolute inset-0 grid grid-cols-7 divide-x divide-bony-border/30">
                                  {week.map((day, dIdx) => {
                                      const isToday = isSameDay(day.date, new Date());
                                      return (
                                          <div key={dIdx} className={`h-full ${!day.isCurrentMonth ? 'bg-slate-100 dark:bg-black/20' : 'bg-white dark:bg-transparent'} ${isToday ? 'bg-bony-blue/5' : ''}`}>
                                              <div className={`text-right text-xs font-sans font-bold p-1 ${isToday ? 'text-bony-orange' : 'text-slate-500'}`}>
                                                  {day.date.getDate()}
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>

                              {/* Projects Layer */}
                              <div className="absolute inset-0 top-7 px-1 grid grid-cols-7 pointer-events-none">
                                   {placedProjects.map((item, idx) => (
                                       <div 
                                           key={item.project.id + weekIdx + idx}
                                           className="relative pointer-events-auto"
                                           style={{
                                               gridColumnStart: item.startCol + 1,
                                               gridColumnEnd: `span ${item.span}`,
                                               marginTop: `${item.lane * itemHeight}px`
                                           }}
                                       >
                                           <ProjectPill 
                                               project={item.project} 
                                               showProgress={false} // NO PROGRESS BAR IN MONTH VIEW
                                               className={`
                                                  h-[22px]
                                                  ${item.startCol === 0 && normalizeDate(item.project.startDate) < normalizeDate(weekStart) ? 'rounded-l-none border-l-0 opacity-80' : ''}
                                                  ${(item.startCol + item.span) === 7 && normalizeDate(item.project.endDate) > normalizeDate(weekEnd) ? 'rounded-r-none' : ''}
                                               `}
                                           />
                                       </div>
                                   ))}
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      );
  };

  // --- VUE SEMAINE ---
  const renderWeekView = () => {
    const startOfWeek = getStartOfWeek(currentDate);
    const endOfWeek = addDays(startOfWeek, 6);
    
    // Header labels with Date
    const daysHeader = [];
    for(let i=0; i<7; i++) {
        const d = addDays(startOfWeek, i);
        daysHeader.push(d.toLocaleDateString('fr-FR', {weekday: 'short', day: 'numeric'}).toUpperCase());
    }

    // Calculate Layout for the single week
    const placedProjects = calculateLayout(filteredProjects, startOfWeek, endOfWeek, 7);

    // Dynamic height calculation
    const maxLane = placedProjects.reduce((max, p) => Math.max(max, p.lane), -1);
    const itemHeight = 44; // TALLER for Week View to show progress bar
    const totalHeight = Math.max(500, (maxLane + 1) * (itemHeight + 4) + 20);

    return (
        <div className="flex flex-col h-full gx-glass-panel border border-bony-border rounded-b-xl overflow-hidden">
             {renderGridHeader(daysHeader)}
             <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-bony-dark">
                 {/* Columns Background */}
                 <div className="absolute inset-0 grid grid-cols-7 divide-x divide-bony-border/30 h-full" style={{minHeight: totalHeight}}>
                      {Array.from({length: 7}).map((_, i) => {
                          const day = addDays(startOfWeek, i);
                          const isToday = isSameDay(day, new Date());
                          return (
                              <div key={i} className={`h-full ${isToday ? 'bg-bony-blue/5' : ''}`}></div>
                          );
                      })}
                 </div>

                 {/* Projects Layer */}
                 <div className="absolute inset-0 top-2 px-1 grid grid-cols-7 pointer-events-none" style={{height: totalHeight}}>
                     {placedProjects.map((item, idx) => (
                         <div 
                             key={item.project.id + idx}
                             className="relative pointer-events-auto"
                             style={{
                                 gridColumnStart: item.startCol + 1,
                                 gridColumnEnd: `span ${item.span}`,
                                 marginTop: `${item.lane * (itemHeight + 4)}px`, // +4 for spacing
                                 height: `${itemHeight}px`
                             }}
                         >
                              <ProjectPill 
                                   project={item.project} 
                                   showProgress={true} // YES PROGRESS BAR IN WEEK VIEW
                                   className={`
                                      h-full
                                      ${item.startCol === 0 && normalizeDate(item.project.startDate) < normalizeDate(startOfWeek) ? 'rounded-l-none border-l-0 opacity-80' : ''}
                                      ${(item.startCol + item.span) === 7 && normalizeDate(item.project.endDate) > normalizeDate(endOfWeek) ? 'rounded-r-none' : ''}
                                   `}
                               />
                         </div>
                     ))}
                 </div>
             </div>
        </div>
    );
  };

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
          <div className="flex flex-col h-full gx-glass-panel border border-bony-border rounded-b-xl overflow-hidden">
              <div className="flex border-b border-bony-border bg-[var(--bg-panel)] h-10 divide-x divide-bony-border shrink-0">
                  {months.map(m => (
                      <div key={m.toISOString()} className="flex-1 flex items-center justify-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                          {m.toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}
                      </div>
                  ))}
              </div>
              <div className="flex-1 relative overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-black/20 p-4">
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
    <div className="h-screen flex flex-col p-3 md:p-6 animate-fade-in">
      
      {/* HEADER CONTROLS */}
      <div className="flex flex-col gap-4 mb-4 shrink-0">
          <div className="flex justify-between items-end">
                <div className="flex items-center gap-4">
                    <h2 className="text-3xl text-slate-900 dark:text-white font-title capitalize">{getTitle()}</h2>
                    <div className="flex gap-1 bg-bony-panel p-1 rounded-lg border border-bony-border">
                        <button onClick={handlePrev} className="p-1 hover:text-bony-orange text-slate-400 transition"><ChevronLeft/></button>
                        <button onClick={handleToday} className="px-3 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition uppercase border-x border-bony-border/50">Aujourd'hui</button>
                        <button onClick={handleNext} className="p-1 hover:text-bony-orange text-slate-400 transition"><ChevronRight/></button>
                    </div>
                </div>

                <div className="flex gap-4">
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
                    <div className="flex bg-bony-panel p-1 rounded-lg border border-bony-border">
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
