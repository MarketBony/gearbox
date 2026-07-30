
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { Project, Task, Site, ServiceType, BrandType, PlaqueName, TaskChannel, ActivityLog } from '../types';
import { db } from '../services/dataService';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { useAuth } from '../contexts/AuthContext';
import { PLAQUES_STRUCTURE, BRANDS, BRAND_COLORS, SERVICE_COLORS } from '../constants';
import { Search, Filter, X, Mail, MessageSquare, Megaphone, Save, Euro, BarChart3, Percent, Hash, FileText, Calendar, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList 
} from 'recharts';
import { useTheme } from '../contexts/ThemeContext';
import Select from '../components/Select';
import DatePicker from '../components/DatePicker';

// --- TYPES ---
interface CampaignTask extends Task {
  parentProjectId: string;
  parentProjectName: string;
  parentProjectSite: string;
  parentBrands: BrandType[];
  parentServices: ServiceType[];
  parentStartDate: string;
}

type ChartTypeFilter = 'Tout' | 'SMS' | 'E-mail';
type MetricFilter = 'Volume' | 'Ouverture' | 'Clics';

// --- COLORS ---
const COLORS = {
  orange: '#f75632',
  violet: '#8f12ab',
  blue: '#293f74',
  green: '#10b981',
  slate: '#64748b',
  grid: '#333333'
};

const PIE_COLORS: Record<string, string> = {
  'VN': '#f75632',      // Orange
  'VO': '#8f12ab',      // Violet
  'APV': '#293f74',     // Bleu Nuit
  'PR': '#06b6d4',      // Cyan
  'Tous Services': '#64748b' // Slate
};

// --- HELPERS ---
const formatDateShort = (dateString: string) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(date);
};

const formatYear = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.getFullYear().toString();
};

const Campaigns: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [saving, setSaving] = useState(false);

  const canEdit = user?.role === 'Master' || user?.role === 'Administrator' || user?.role === 'Director' || user?.role === 'Coordinator';

  // --- GLOBAL CHART FILTERS ---
  const currentYear = new Date().getFullYear();
  const [chartStartDate, setChartStartDate] = useSessionState<string>('campaigns_chartStartDate', `${currentYear}-01-01`);
  const [chartEndDate, setChartEndDate] = useSessionState<string>('campaigns_chartEndDate', `${currentYear}-12-31`);
  const [globalType, setGlobalType] = useSessionState<ChartTypeFilter>('campaigns_globalType', 'Tout');

  // Specific toggle for Chart 2 metric
  const [c2Metric, setC2Metric] = useSessionState<MetricFilter>('campaigns_c2Metric', 'Volume');

  // --- MAIN LIST FILTER STATES ---
  const [searchTerm, setSearchTerm] = useSessionState<string>('campaigns_searchTerm', '');
  const [filterContext, setFilterContext] = useSessionState<string>('campaigns_filterContext', 'All');
  const [filterService, setFilterService] = useSessionState<ServiceType | 'All'>('campaigns_filterService', 'All');
  const [filterBrand, setFilterBrand] = useSessionState<BrandType | 'All'>('campaigns_filterBrand', 'All');
  const [filterChannel, setFilterChannel] = useSessionState<'All' | 'SMS' | 'E-mail'>('campaigns_filterChannel', 'All');
  const [filterStartDate, setFilterStartDate] = useSessionState<string>('campaigns_filterStartDate', '');
  const [filterEndDate, setFilterEndDate] = useSessionState<string>('campaigns_filterEndDate', '');
  const [sortOrder, setSortOrder] = useSessionState<'asc' | 'desc'>('campaigns_sortOrder', 'desc');

  const scrollRef = useScrollRestore('campaigns');

  useEffect(() => {
    loadData();
  }, []);

  // Temps réel : les campagnes sont dérivées des tâches SMS/E-mail des projets.
  useRealtimeSync(RT_EVENTS.projects, () => loadData());

  const loadData = async () => {
    const data = await db.getProjects();
    setProjects(data);
  };

  // --- DATA PREPARATION ---

  const allCampaigns: CampaignTask[] = useMemo(() => {
    const tasks: CampaignTask[] = [];
    projects.forEach(p => {
        // Brouillon : ne remonte nulle part (règle métier, cf. CLAUDE.md).
        // Aucun filtre de statut n'existait ici — les tâches d'un projet en
        // brouillon remontaient comme des campagnes réelles.
        if (p.status === 'Draft') return;
        p.tasks.forEach(t => {
            if (t.channel === 'SMS' || t.channel === 'E-mail') {
                tasks.push({
                    ...t,
                    parentProjectId: p.id,
                    parentProjectName: p.name,
                    parentProjectSite: p.site,
                    parentBrands: p.brands,
                    parentServices: p.service,
                    parentStartDate: p.startDate
                });
            }
        });
    });
    return tasks;
  }, [projects]);

  // --- ACTIONS ---

  const updateTaskField = useCallback(async (projectId: string, taskId: string, field: keyof Task, value: any) => {
    if (!canEdit) return;
    setSaving(true);
    const updatedProjects = projects.map(p => {
        if (p.id !== projectId) return p;
        const updatedTasks = p.tasks.map(t => {
            if (t.id !== taskId) return t;
            return { ...t, [field]: value };
        });
        return { ...p, tasks: updatedTasks };
    });
    setProjects(updatedProjects);
    // PUT unitaire du seul projet modifié (API réelle — le diff des tâches est géré côté serveur).
    const changed = updatedProjects.find(p => p.id === projectId);
    if (changed) {
        try {
            await db.updateProject(changed);
        } catch (error) {
            console.error('Task field update failed:', error);
            alert('Échec de la sauvegarde (serveur injoignable ?).');
            const fresh = await db.getProjects().catch(() => null);
            if (fresh) setProjects(fresh);
        }
    }
    if (field === 'status' && user) {
        const project = projects.find(p => p.id === projectId);
        const task = project?.tasks.find(t => t.id === taskId);
        if (task) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: `a changé le statut de la tâche`, entity: 'task', entityName: task.name || taskId, timestamp: new Date().toISOString() });
    }
    setTimeout(() => setSaving(false), 500);
  }, [projects, canEdit, user]);

  // --- CHART HELPERS --- (Simplified for brevity, logic unchanged)
  // ... (Chart logic remains identical to previous file, reused here)
  const filterChartData = (tasks: CampaignTask[], start: string, end: string, type: ChartTypeFilter) => {
      const dStart = new Date(start);
      const dEnd = new Date(end);
      dEnd.setHours(23, 59, 59, 999);
      
      return tasks.filter(t => {
          const tDate = new Date(t.parentStartDate);
          const typeMatch = type === 'Tout' ? true : t.channel === type;
          return tDate >= dStart && tDate <= dEnd && typeMatch;
      });
  };

  const getDateFormatOptions = (start: string, end: string): Intl.DateTimeFormatOptions => {
      const d1 = new Date(start);
      const d2 = new Date(end);
      const diffDays = (d2.getTime() - d1.getTime()) / (1000 * 3600 * 24);
      if (diffDays > 60) return { month: 'short' }; 
      return { day: '2-digit', month: '2-digit' };
  };

  // --- CHART 1 DATA GENERATOR (Count campaigns over time) ---
  const chart1Data = useMemo(() => {
      const filtered = filterChartData(allCampaigns, chartStartDate, chartEndDate, globalType);
      const groups: Record<string, number> = {};
      const formatOpts = getDateFormatOptions(chartStartDate, chartEndDate);
      const format = new Intl.DateTimeFormat('fr-FR', formatOpts);

      filtered.sort((a,b) => new Date(a.parentStartDate).getTime() - new Date(b.parentStartDate).getTime());

      filtered.forEach(t => {
          const dateKey = format.format(new Date(t.parentStartDate));
          groups[dateKey] = (groups[dateKey] || 0) + 1;
      });

      return Object.entries(groups).map(([name, value]) => ({ name, value }));
  }, [allCampaigns, chartStartDate, chartEndDate, globalType]);

  // --- CHART 2 DATA GENERATOR (Performance) ---
  const chart2Data = useMemo(() => {
      const filtered = filterChartData(allCampaigns, chartStartDate, chartEndDate, globalType);
      const groups: Record<string, { sum: number, count: number }> = {};
      const formatOpts = getDateFormatOptions(chartStartDate, chartEndDate);
      const format = new Intl.DateTimeFormat('fr-FR', formatOpts);

      filtered.sort((a,b) => new Date(a.parentStartDate).getTime() - new Date(b.parentStartDate).getTime());

      filtered.forEach(t => {
          const dateKey = format.format(new Date(t.parentStartDate));
          if (!groups[dateKey]) groups[dateKey] = { sum: 0, count: 0 };
          
          let val = 0;
          if (c2Metric === 'Volume') val = t.volumetry || 0;
          else if (c2Metric === 'Ouverture') val = t.openRate || 0;
          else if (c2Metric === 'Clics') val = t.clickRate || 0;

          groups[dateKey].sum += val;
          groups[dateKey].count += 1;
      });

      return Object.entries(groups).map(([name, data]) => ({
          name,
          value: c2Metric === 'Volume' ? data.sum : Math.round(data.sum / data.count) 
      }));
  }, [allCampaigns, chartStartDate, chartEndDate, globalType, c2Metric]);

  // --- CHART 3 DATA GENERATOR (Budget Pie) ---
  const chart3Data = useMemo(() => {
      const filtered = filterChartData(allCampaigns, chartStartDate, chartEndDate, globalType);
      
      const groups: Record<string, number> = { 'VN': 0, 'VO': 0, 'APV': 0, 'PR': 0 };
      let total = 0;

      filtered.forEach(t => {
          const amount = t.billedAmount || t.cost || 0;
          const rawSvc = t.parentServices && t.parentServices.length > 0 ? t.parentServices[0] : 'Tous Services';
          
          if (rawSvc === 'Tous Services') {
              const splitAmount = amount / 4;
              groups['VN'] += splitAmount;
              groups['VO'] += splitAmount;
              groups['APV'] += splitAmount;
              groups['PR'] += splitAmount;
          } else if (groups[rawSvc] !== undefined) {
              groups[rawSvc] += amount;
          }
          total += amount;
      });

      return Object.entries(groups)
        .map(([name, value]) => ({ 
            name, 
            value: Math.round(value), 
            percent: total > 0 ? ((value / total) * 100).toFixed(0) : '0'
        }))
        .filter(d => d.value > 0)
        .sort((a, b) => b.value - a.value); 
  }, [allCampaigns, chartStartDate, chartEndDate, globalType]);


  // --- MAIN LIST FILTERING & SORTING ---
  const filteredCampaigns = useMemo(() => {
    let result = allCampaigns.filter(item => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            if (!item.name.toLowerCase().includes(term) && !item.parentProjectName.toLowerCase().includes(term)) return false;
        }
        if (filterChannel !== 'All' && item.channel !== filterChannel) return false;
        
        if (filterContext !== 'All') {
            const isGroup = filterContext === 'GROUPE BONY';
            const isPlaque = Object.keys(PLAQUES_STRUCTURE).includes(filterContext);
            if (!isGroup) {
                if (isPlaque) {
                     const sitesInPlaque = PLAQUES_STRUCTURE[filterContext as PlaqueName];
                     const match = item.parentProjectSite === filterContext || sitesInPlaque.includes(item.parentProjectSite as Site);
                     if (!match) return false;
                } else {
                     if (item.parentProjectSite !== filterContext) return false;
                }
            }
        }
        
        if (filterService !== 'All') {
            const hasService = item.parentServices.includes(filterService) || item.parentServices.includes('Tous Services');
            if (!hasService) return false;
        }
        
        if (filterBrand !== 'All') {
             const hasBrand = item.parentBrands.includes(filterBrand) || item.parentBrands.includes('Holding');
             if (!hasBrand) return false;
        }

        if (filterStartDate && item.parentStartDate < filterStartDate) return false;
        if (filterEndDate && item.parentStartDate > filterEndDate) return false;

        return true;
    });

    return result.sort((a, b) => {
        const dateA = new Date(a.parentStartDate).getTime();
        const dateB = new Date(b.parentStartDate).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }, [allCampaigns, searchTerm, filterChannel, filterContext, filterService, filterBrand, filterStartDate, filterEndDate, sortOrder]);

  const resetFilters = () => {
      setSearchTerm('');
      setFilterContext('All');
      setFilterService('All');
      setFilterBrand('All');
      setFilterChannel('All');
      setFilterStartDate('');
      setFilterEndDate('');
      setSortOrder('desc');
  };

  const FilterSelect = ({value, onChange, options}: {value: string, onChange: (v: any) => void, options: string[]}) => (
      <Select
        value={value}
        onChange={(v) => onChange(v)}
        options={options.map(o => ({ value: o, label: o }))}
        size="sm"
      />
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      
      {/* --- GLOBAL CHART CONTROLS --- */}
      <div className="px-3 md:px-6 py-2 glass-strong border-b border-bony-border flex flex-wrap items-center justify-between gap-2 shrink-0">
         <div className="flex flex-wrap items-center gap-2 md:gap-4">
             {/* DATE PICKERS */}
             <div className="flex flex-wrap items-center gap-2 bg-slate-100 dark:bg-black/30 p-1 rounded border border-bony-border">
                 <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-1">Du</span>
                 <div className="w-32 md:w-36">
                     <DatePicker
                        value={chartStartDate}
                        onChange={(v) => setChartStartDate(v)}
                        size="sm"
                     />
                 </div>
                 <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Au</span>
                 <div className="w-32 md:w-36">
                     <DatePicker
                        value={chartEndDate}
                        onChange={(v) => setChartEndDate(v)}
                        size="sm"
                     />
                 </div>
             </div>
             
             <div className="w-px h-4 bg-bony-border hidden md:block"></div>

             <div className="flex items-center gap-2">
                 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Type</span>
                 <FilterSelect value={globalType} onChange={setGlobalType} options={['Tout', 'SMS', 'E-mail']} />
             </div>
         </div>
         <div className="text-[9px] text-slate-600 font-sans hidden sm:block">
            ANALYSE STATISTIQUE
         </div>
      </div>

      {/* --- DASHBOARD GRAPHIQUE (Fixed Height) --- */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-bony-border shrink-0 md:h-64 h-auto">
          
          {/* CHART 1: Nb Campagnes */}
          <div className="gx-card p-3 flex flex-col relative">
               <div className="flex justify-between items-start mb-2 z-10">
                   <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1">
                       <Megaphone size={12} className="text-bony-orange"/> Nb Campagnes
                   </h3>
               </div>
               <div className="flex-1 w-full min-h-0">
                   <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={chart1Data} margin={{top: 20}}>
                           <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? COLORS.grid : '#e2e8f0'} vertical={false} />
                           <XAxis dataKey="name" stroke={theme === 'dark' ? COLORS.slate : '#64748b'} fontSize={10} tickLine={false} axisLine={false} />
                           <YAxis stroke={theme === 'dark' ? COLORS.slate : '#64748b'} fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                           <Tooltip 
                                contentStyle={{
                                    backgroundColor: theme === 'dark' ? '#1e1e1e' : '#fff', 
                                    borderColor: theme === 'dark' ? '#333' : '#e2e8f0', 
                                    fontSize: '10px', 
                                    color: theme === 'dark' ? '#fff' : '#0f172a'
                                }} 
                                itemStyle={{color: theme === 'dark' ? '#fff' : '#0f172a'}}
                                cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                           />
                           <Bar dataKey="value" fill={COLORS.orange} radius={[4, 4, 0, 0]} name="Campagnes" barSize={30}>
                                <LabelList dataKey="value" position="top" fill={theme === 'dark' ? "#fff" : "#0f172a"} fontSize={10} fontWeight="bold" />
                           </Bar>
                       </BarChart>
                   </ResponsiveContainer>
               </div>
          </div>

          {/* CHART 2: Performance */}
          <div className="gx-card p-3 flex flex-col relative">
               <div className="flex justify-between items-start mb-2 z-10">
                   <div className="flex items-center gap-2">
                       <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1">
                           <BarChart3 size={12} className="text-bony-violet"/> Performance
                       </h3>
                   </div>
                   <FilterSelect value={c2Metric} onChange={setC2Metric} options={['Volume', 'Ouverture', 'Clics']} />
               </div>
               <div className="flex-1 w-full min-h-0">
                   <ResponsiveContainer width="100%" height="100%">
                       {c2Metric === 'Volume' ? (
                           <BarChart data={chart2Data} margin={{top: 20}}>
                               <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? COLORS.grid : '#e2e8f0'} vertical={false} />
                               <XAxis dataKey="name" stroke={theme === 'dark' ? COLORS.slate : '#64748b'} fontSize={10} tickLine={false} axisLine={false} />
                               <YAxis stroke={theme === 'dark' ? COLORS.slate : '#64748b'} fontSize={10} tickLine={false} axisLine={false} />
                               <Tooltip 
                                    contentStyle={{
                                        backgroundColor: theme === 'dark' ? '#1e1e1e' : '#fff', 
                                        borderColor: theme === 'dark' ? '#333' : '#e2e8f0', 
                                        fontSize: '10px', 
                                        color: theme === 'dark' ? '#fff' : '#0f172a'
                                    }} 
                                    itemStyle={{color: theme === 'dark' ? '#fff' : '#0f172a'}}
                                    cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                               />
                               <Bar dataKey="value" fill={COLORS.violet} radius={[4, 4, 0, 0]} name="Volume" barSize={30}>
                                    <LabelList dataKey="value" position="top" fill={theme === 'dark' ? "#fff" : "#0f172a"} fontSize={10} fontWeight="bold" />
                               </Bar>
                           </BarChart>
                       ) : (
                           <LineChart data={chart2Data} margin={{top: 20}}>
                               <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? COLORS.grid : '#e2e8f0'} vertical={false} />
                               <XAxis dataKey="name" stroke={theme === 'dark' ? COLORS.slate : '#64748b'} fontSize={10} tickLine={false} axisLine={false} />
                               <YAxis stroke={theme === 'dark' ? COLORS.slate : '#64748b'} fontSize={10} tickLine={false} axisLine={false} unit="%" />
                               <Tooltip 
                                    contentStyle={{
                                        backgroundColor: theme === 'dark' ? '#1e1e1e' : '#fff', 
                                        borderColor: theme === 'dark' ? '#333' : '#e2e8f0', 
                                        fontSize: '10px', 
                                        color: theme === 'dark' ? '#fff' : '#0f172a'
                                    }} 
                                    itemStyle={{color: theme === 'dark' ? '#fff' : '#0f172a'}}
                               />
                               <Line type="monotone" dataKey="value" stroke={COLORS.violet} strokeWidth={2} dot={{r: 3}} activeDot={{r: 5}} name="%">
                                   <LabelList dataKey="value" position="top" fill={theme === 'dark' ? "#fff" : "#0f172a"} fontSize={10} fontWeight="bold" formatter={(val: number) => val + '%'} />
                               </Line>
                           </LineChart>
                       )}
                   </ResponsiveContainer>
               </div>
          </div>

          {/* CHART 3: Répartition Budget */}
          <div className="gx-card p-3 flex flex-col relative">
               <div className="flex justify-between items-start mb-2 z-10">
                   <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1">
                       <Euro size={12} className="text-blue-400"/> Facturé / Svc
                   </h3>
               </div>
               <div className="flex-1 w-full min-h-0 flex items-center">
                   {/* Left: Pie */}
                   <div className="w-1/2 h-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chart3Data}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={30} // Reduced
                                    outerRadius={50} // Reduced to fit without overlap
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {chart3Data.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.name] || COLORS.slate} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{
                                        backgroundColor: theme === 'dark' ? '#1e1e1e' : '#fff', 
                                        borderColor: theme === 'dark' ? '#333' : '#e2e8f0', 
                                        fontSize: '10px', 
                                        color: theme === 'dark' ? '#fff' : '#0f172a'
                                    }} 
                                    itemStyle={{color: theme === 'dark' ? '#fff' : '#0f172a'}}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                   </div>
                   
                   {/* Right: Custom Legend List */}
                   <div className="w-1/2 h-full overflow-y-auto custom-scrollbar pr-2 flex flex-col justify-center">
                        {chart3Data.length > 0 ? (
                            <div className="space-y-2">
                                {chart3Data.map(d => (
                                    <div key={d.name} className="flex items-center justify-between text-[10px] border-b border-bony-border pb-1 last:border-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor: PIE_COLORS[d.name]}}></span>
                                            <span className="font-bold text-slate-700 dark:text-slate-300">{d.name}</span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-slate-900 dark:text-white font-sans">{d.value}€</div>
                                            <div className="text-slate-500 font-bold text-[9px]">{d.percent}%</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center text-[10px] text-slate-600">Aucune donnée</div>
                        )}
                   </div>
               </div>
          </div>
      </div>


      {/* HEADER & FILTERS */}
      <div className="px-6 py-4 border-b border-bony-border glass-strong glass-sheen relative overflow-hidden z-20 shadow-md shrink-0">
          <div className="flex justify-between items-end mb-2">
              <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3">
                      <p className="text-xs text-slate-400 font-sans">LISTING & ÉDITION EN MASSE</p>
                      {saving && <span className="text-bony-orange flex items-center text-[10px] animate-pulse font-bold"><Save size={10} className="mr-1"/> ENREGISTREMENT...</span>}
                  </div>
              </div>
              <div className="flex gap-2">
                  <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`flex items-center gap-2 px-3 py-1.5 min-h-[44px] rounded-lg transition border ${
                          showFilters
                          ? 'bg-bony-orange text-white border-bony-orange'
                          : 'bg-slate-100 dark:bg-black/30 text-slate-500 dark:text-slate-300 border-bony-border hover:text-slate-900 dark:hover:text-white'
                      }`}
                  >
                      {showFilters ? <X size={14} /> : <Filter size={14} />}
                      <span className="text-[10px] font-bold uppercase">Filtres Liste</span>
                  </button>
              </div>
          </div>

          {/* SEARCH & ACTIVE FILTERS */}
          <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrer la liste..."
                    className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet transition-colors"
                />
          </div>

          {/* EXPANDABLE FILTER PANEL */}
          {showFilters && (
            <div className="bg-slate-50 dark:bg-black/40 border border-bony-border rounded-lg p-4 mt-2 space-y-4 animate-in slide-in-from-top-2 duration-200">
                {/* Filters Content (Same as before) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Canal */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Canal</label>
                        <div className="flex gap-2">
                             <button onClick={() => setFilterChannel('All')} className={`flex-1 py-1.5 text-[10px] font-bold rounded border ${filterChannel === 'All' ? 'bg-white dark:bg-white text-black border-slate-300' : 'bg-transparent text-slate-500 border-slate-300 dark:border-slate-700'}`}>TOUT</button>
                             <button onClick={() => setFilterChannel('E-mail')} className={`flex-1 py-1.5 text-[10px] font-bold rounded border ${filterChannel === 'E-mail' ? 'bg-bony-orange/20 text-bony-orange border-bony-orange' : 'bg-transparent text-slate-500 border-slate-300 dark:border-slate-700'}`}>E-MAIL</button>
                             <button onClick={() => setFilterChannel('SMS')} className={`flex-1 py-1.5 text-[10px] font-bold rounded border ${filterChannel === 'SMS' ? 'bg-bony-blue/20 text-blue-400 border-bony-blue' : 'bg-transparent text-slate-500 border-slate-300 dark:border-slate-700'}`}>SMS</button>
                        </div>
                    </div>
                    {/* Context */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Plaque / Site</label>
                        <Select
                            value={filterContext}
                            onChange={(v) => setFilterContext(v)}
                            size="sm"
                            options={[
                                { value: 'All', label: 'TOUT LE RÉSEAU' },
                                ...Object.entries(PLAQUES_STRUCTURE).flatMap(([plaqueName, sites]) => [
                                    { value: plaqueName, label: `★ ${plaqueName}` },
                                    ...sites.map(site => ({ value: site, label: site })),
                                ]),
                            ]}
                        />
                    </div>
                    {/* Dates */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Période Liste</label>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <DatePicker
                                    value={filterStartDate}
                                    onChange={(v) => setFilterStartDate(v)}
                                    size="sm"
                                />
                            </div>
                            <div className="flex-1">
                                <DatePicker
                                    value={filterEndDate}
                                    onChange={(v) => setFilterEndDate(v)}
                                    size="sm"
                                />
                            </div>
                        </div>
                    </div>
                    {/* Brand */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Marque</label>
                        <div className="flex flex-wrap gap-1">
                            <button onClick={() => setFilterBrand('All')} className={`px-2 py-1 text-[9px] font-bold rounded border ${filterBrand === 'All' ? 'bg-white text-black border-slate-300' : 'border-slate-300 dark:border-slate-700 text-slate-500'}`}>TOUT</button>
                            {BRANDS.filter(b => b !== 'Holding').map(b => (
                                <button key={b} onClick={() => setFilterBrand(b)} className={`px-2 py-1 text-[9px] font-bold rounded border ${filterBrand === b ? 'bg-bony-panel text-bony-orange border-bony-orange' : 'border-slate-300 dark:border-slate-700 text-slate-500'}`}>{b}</button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-bony-border">
                    <button onClick={resetFilters} className="text-[10px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white underline">
                        RÉINITIALISER TOUT
                    </button>
                    <div className="text-[10px] font-sans text-bony-violet">
                        {filteredCampaigns.length} RÉSULTAT(S)
                    </div>
                </div>
            </div>
          )}
      </div>

      {/* CAMPAIGN LIST - TABLE HEADER */}
      <div className="hidden md:flex px-6 py-2 border-b border-bony-border bg-slate-100 dark:bg-black/20 gap-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest shrink-0">
          <button 
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="w-20 text-center flex items-center justify-center gap-1 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          >
              Date
              {sortOrder === 'asc' ? <ArrowUp size={10}/> : <ArrowDown size={10}/>}
          </button>
          <div className="w-[25%]">Campagne / Projet</div>
          <div className="flex-1 grid grid-cols-8 gap-2 text-center">
              <div className="flex items-center justify-center gap-1"><Euro size={10}/> Coût</div>
              <div className="flex items-center justify-center gap-1"><BarChart3 size={10}/> Vol.</div>
              <div className="flex items-center justify-center gap-1"><Percent size={10}/> Ouv.</div>
              <div className="flex items-center justify-center gap-1"><Percent size={10}/> NPAI</div>
              <div className="flex items-center justify-center gap-1"><Percent size={10}/> STOP</div>
              <div className="flex items-center justify-center gap-1"><Percent size={10}/> Clics</div>
              <div className="flex items-center justify-center gap-1"><Hash size={10}/> COD TXT</div>
              <div className="flex items-center justify-center gap-1"><FileText size={10}/> Factu</div>
          </div>
      </div>

      {/* CAMPAIGN LIST - ROWS */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-6 pt-2">
          {filteredCampaigns.length > 0 ? (
            <>
              {/* Mobile card view */}
              <div className="md:hidden space-y-2">
                {filteredCampaigns.map(c => (
                  <div key={c.id} className="gx-glass-panel border border-bony-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-bony-orange">{new Date(c.parentStartDate).toLocaleDateString('fr-FR')}</span>
                      <span className="text-xs font-bold text-slate-500">{c.channel}</span>
                    </div>
                    <p className="text-sm font-medium text-bony-text truncate">{c.name || c.parentProjectName}</p>
                    <div className="flex gap-3 text-xs text-slate-500">
                      <span>{c.parentProjectSite}</span>
                      {c.volumetry && <span>Vol: {c.volumetry}</span>}
                      {c.cost && <span>{c.cost.toLocaleString('fr-FR')}€</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table view */}
              <div className="hidden md:block space-y-2">
                {filteredCampaigns.map((task, idx) => {
                    const isEmail = task.channel === 'E-mail';
                    const ChannelIcon = isEmail ? Mail : MessageSquare;
                    const accentColor = isEmail ? 'text-bony-orange' : 'text-blue-400';
                    const borderHover = isEmail ? 'hover:border-bony-orange/50' : 'hover:border-bony-blue/50';

                    return (
                        <div key={`${task.parentProjectId}-${task.id}-${idx}`} className={`gx-glass-panel border border-bony-border rounded-lg p-3 flex items-center gap-4 transition-all group ${borderHover}`}>
                            
                            {/* DATE COLUMN */}
                            <div className="w-20 flex flex-col items-center justify-center border-r border-bony-border pr-4 shrink-0">
                                <span className="text-sm font-title font-bold text-slate-900 dark:text-white">{formatDateShort(task.parentStartDate)}</span>
                                <span className="text-[9px] text-slate-500 font-sans">{formatYear(task.parentStartDate)}</span>
                            </div>

                            {/* INFO BLOCK (25%) */}
                            <div className="w-[25%] flex items-start gap-3 shrink-0">
                                <div className={`mt-1 p-2 rounded bg-slate-100 dark:bg-black/30 border border-bony-border ${accentColor}`}>
                                    <ChannelIcon size={16} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    {/* Main Title = Project Name */}
                                    <h3 className="text-slate-900 dark:text-white font-bold truncate text-sm leading-tight mb-0.5" title={task.parentProjectName}>
                                        {task.parentProjectName}
                                    </h3>
                                    {/* Subtitle = Task Name */}
                                    <p className="text-xs text-slate-500 font-medium truncate mb-1" title={task.name}>
                                        {task.name}
                                    </p>
                                    
                                    {/* Badges */}
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        <span className="text-[9px] font-sans text-slate-500 bg-slate-100 dark:bg-black/40 px-1 rounded border border-bony-border">{task.parentProjectSite}</span>
                                        {task.parentBrands?.map(b => (
                                            <span key={b} className={`text-[8px] px-1 rounded border ${BRAND_COLORS[b] || 'border-slate-600 text-slate-500'} scale-90 origin-left`}>
                                                {b}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT: DATA BLOCKS (Flex-1) */}
                            <div className="flex-1 grid grid-cols-8 gap-2 items-center">
                                {/* 1. Coût (Read Only) */}
                                <div className="bg-slate-100 dark:bg-black/40 border border-bony-border rounded px-2 py-1.5 text-right">
                                    <span className="text-slate-700 dark:text-white font-sans text-xs font-bold">{task.cost} €</span>
                                </div>

                                {/* 2. Volumétrie (Number) */}
                                <input 
                                    type="number"
                                    disabled={!canEdit}
                                    placeholder="0"
                                    value={task.volumetry || ''}
                                    onChange={(e) => updateTaskField(task.parentProjectId, task.id, 'volumetry', Number(e.target.value))}
                                    className="bg-slate-100 dark:bg-black/20 border border-bony-border rounded px-2 py-1.5 text-right text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet focus:bg-white dark:focus:bg-black/40 transition-colors disabled:opacity-50"
                                />

                                {/* 3. % Ouverture (0-100) */}
                                <div className="relative">
                                    <input 
                                        type="number"
                                        disabled={!canEdit}
                                        placeholder="-"
                                        min="0" max="100"
                                        value={task.openRate || ''}
                                        onChange={(e) => updateTaskField(task.parentProjectId, task.id, 'openRate', Number(e.target.value))}
                                        className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded px-2 py-1.5 text-right text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet focus:bg-white dark:focus:bg-black/40 transition-colors disabled:opacity-50"
                                    />
                                    <span className="absolute right-1 top-1.5 text-[8px] text-slate-500 pointer-events-none">%</span>
                                </div>

                                {/* 4. % NPAI */}
                                <div className="relative">
                                    <input 
                                        type="number"
                                        disabled={!canEdit}
                                        placeholder="-"
                                        min="0" max="100"
                                        value={task.npaiRate || ''}
                                        onChange={(e) => updateTaskField(task.parentProjectId, task.id, 'npaiRate', Number(e.target.value))}
                                        className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded px-2 py-1.5 text-right text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet focus:bg-white dark:focus:bg-black/40 transition-colors disabled:opacity-50"
                                    />
                                    <span className="absolute right-1 top-1.5 text-[8px] text-slate-500 pointer-events-none">%</span>
                                </div>

                                {/* 5. % STOP */}
                                <div className="relative">
                                    <input 
                                        type="number"
                                        disabled={!canEdit}
                                        placeholder="-"
                                        min="0" max="100"
                                        value={task.stopRate || ''}
                                        onChange={(e) => updateTaskField(task.parentProjectId, task.id, 'stopRate', Number(e.target.value))}
                                        className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded px-2 py-1.5 text-right text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet focus:bg-white dark:focus:bg-black/40 transition-colors disabled:opacity-50"
                                    />
                                    <span className="absolute right-1 top-1.5 text-[8px] text-slate-500 pointer-events-none">%</span>
                                </div>

                                {/* 6. % Clics */}
                                <div className="relative">
                                    <input 
                                        type="number"
                                        disabled={!canEdit}
                                        placeholder="-"
                                        min="0" max="100"
                                        value={task.clickRate || ''}
                                        onChange={(e) => updateTaskField(task.parentProjectId, task.id, 'clickRate', Number(e.target.value))}
                                        className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded px-2 py-1.5 text-right text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet focus:bg-white dark:focus:bg-black/40 transition-colors disabled:opacity-50"
                                    />
                                    <span className="absolute right-1 top-1.5 text-[8px] text-slate-500 pointer-events-none">%</span>
                                </div>

                                {/* 7. COD TXT (Text) */}
                                <input 
                                    type="text"
                                    disabled={!canEdit}
                                    placeholder="Code..."
                                    value={task.codTxt || ''}
                                    onChange={(e) => updateTaskField(task.parentProjectId, task.id, 'codTxt', e.target.value)}
                                    className="bg-slate-100 dark:bg-black/20 border border-bony-border rounded px-2 py-1.5 text-center text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet focus:bg-white dark:focus:bg-black/40 transition-colors font-sans disabled:opacity-50"
                                />

                                {/* 8. Facturation (Number) */}
                                <div className="relative">
                                    <input 
                                        type="number"
                                        disabled={!canEdit}
                                        placeholder="0"
                                        value={task.billedAmount || ''}
                                        onChange={(e) => updateTaskField(task.parentProjectId, task.id, 'billedAmount', Number(e.target.value))}
                                        className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded px-2 py-1.5 text-right text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-bony-orange focus:bg-white dark:focus:bg-black/40 transition-colors disabled:opacity-50"
                                    />
                                    <span className="absolute right-6 top-1.5 text-[8px] text-slate-500 pointer-events-none">€</span>
                                </div>

                            </div>
                        </div>
                    );
                })}
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                <Megaphone size={64} className="mb-4 text-slate-400 dark:text-slate-700"/>
                <p className="font-title text-xl">AUCUNE CAMPAGNE TROUVÉE</p>
                <p className="text-sm mt-2 font-sans">Ajoutez des tâches "SMS" ou "E-mail" dans vos projets.</p>
            </div>
          )}
      </div>
    </div>
  );
};

export default Campaigns;
