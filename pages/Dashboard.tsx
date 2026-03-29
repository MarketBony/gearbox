
import React, { useEffect, useState, useMemo } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { Project, Campaign, BudgetLine, BrandType, PlaqueName, Site, ServiceType, SocialPost } from '../types';
import { db } from '../services/dataService';
import { PLAQUES_STRUCTURE, BRANDS, SERVICES, BRAND_COLORS, SERVICE_COLORS, SOCIAL_STATUS_COLORS } from '../constants';
import { 
  TrendingUp, 
  Wallet, 
  Megaphone,
  AlertTriangle,
  Target,
  Filter,
  Calendar,
  Layers,
  Activity,
  ArrowRight,
  Info,
  Globe,
  Share2,
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
  MapPin,
  Video
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, 
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Legend, Area
} from 'recharts';
import { useTheme } from '../contexts/ThemeContext';

// --- COLORS ---
const COLORS = {
  orange: '#f75632',
  violet: '#8f12ab',
  blue: '#293f74',
  green: '#10b981',
  slate: '#64748b',
  grid: '#333333',
  bgPanel: '#1E1E1E'
};

const PIE_COLORS: Record<string, string> = {
  VN: '#f75632',  // Orange Bony
  VO: '#8f12ab',  // Violet Bony
  APV: '#293f74', // Bleu Nuit
  PR: '#06b6d4',  // Cyan
};

const Dashboard: React.FC = () => {
  const { theme } = useTheme();
  // --- DATA STATES ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [budgets, setBudgets] = useState<BudgetLine[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]); // New State
  const [loading, setLoading] = useState(true);

  // --- FILTER STATES ---
  // Default to current year (Jan 1 to Dec 31)
  const currentYear = new Date().getFullYear();
  const [dateStart, setDateStart] = useSessionState<string>('dashboard_dateStart', `${currentYear}-01-01`);
  const [dateEnd, setDateEnd] = useSessionState<string>('dashboard_dateEnd', `${currentYear}-12-31`);

  const [filterContext, setFilterContext] = useSessionState<string>('dashboard_filterContext', 'All'); // Plaque or Site
  const [filterBrand, setFilterBrand] = useSessionState<BrandType | 'All'>('dashboard_filterBrand', 'All');

  const scrollRef = useScrollRestore('dashboard', !loading);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [pData, cData, bData, sData] = await Promise.all([
        db.getProjects(),
        db.getCampaigns(),
        db.getBudgets(),
        db.getSocialPosts()
      ]);
      setProjects(pData);
      setCampaigns(cData);
      setBudgets(bData);
      setSocialPosts(sData);
      setLoading(false);
    };
    load();
  }, []);

  // --- NAVIGATION HELPER ---
  const handleNavigateToProject = (projectId: string) => {
      window.sessionStorage.setItem('pendingProjectId', projectId);
      const event = new CustomEvent('gearbox-navigate', { 
          detail: { tab: 'projects', projectId: projectId } 
      });
      window.dispatchEvent(event);
  };

  const handleNavigateToDigital = () => {
      const event = new CustomEvent('gearbox-navigate', { 
          detail: { tab: 'digital' } 
      });
      window.dispatchEvent(event);
  };

  // --- AGGREGATION ENGINE ---
  const stats = useMemo(() => {
    // 0. Init
    let totalForecast = 0;
    let totalActual = 0;
    let activeProjectsCount = 0;
    let activeCampaignsCount = 0;
    
    // Arrays for charts
    const monthlyTrend = Array.from({length: 12}, (_, i) => ({ 
        month: new Date(0, i).toLocaleString('fr-FR', {month:'short'}), 
        prevu: 0, 
        reel: 0, 
        cumulReel: 0 
    }));

    // Specific structure for mix (VN/VO/APV/PR only)
    const serviceMix: Record<string, number> = { VN: 0, VO: 0, APV: 0, PR: 0 };
    
    // Parse filter dates
    const dStart = new Date(dateStart);
    const dEnd = new Date(dateEnd);

    // 1. Filter Logic Helpers
    const isSiteInScope = (site: string) => {
        if (filterContext === 'All') return true;
        if (filterContext === 'GROUPE BONY') return true;
        if (PLAQUES_STRUCTURE[filterContext as PlaqueName]) {
            return PLAQUES_STRUCTURE[filterContext as PlaqueName].includes(site as Site) || site === filterContext;
        }
        return site === filterContext;
    };

    const isBrandInScope = (projectBrands: BrandType[]) => {
        if (filterBrand === 'All') return true;
        return projectBrands.includes(filterBrand) || projectBrands.includes('Groupe');
    };

    // 2. Process BUDGETS
    const chartYear = dStart.getFullYear();

    budgets.forEach(b => {
        if (!isSiteInScope(b.site)) return;
        
        (['VN', 'VO', 'PR', 'APV'] as const).forEach(svc => {
            b.entries[svc].forEach((val, monthIdx) => {
                monthlyTrend[monthIdx].prevu += val;
                const checkDate = new Date(chartYear, monthIdx, 15);
                if (checkDate >= dStart && checkDate <= dEnd) {
                    totalForecast += val;
                }
            });
        });
    });

    // 3. Process PROJECTS (Actuals)
    projects.forEach(p => {
        let pSite = p.site;
        if (pSite === 'Thiers' || pSite === 'Ambert') pSite = 'Ricoux';
        if ((pSite as string) === 'Riom') pSite = 'Mozac';
        if (!isSiteInScope(pSite as string)) return;

        const pBrands = p.brands || [];
        if (!isBrandInScope(pBrands)) return;

        if (p.status === 'Active') activeProjectsCount++;
        
        const hasCampaign = p.tasks.some(t => (t.channel === 'SMS' || t.channel === 'E-mail') && t.status === 'Programmed');
        if (hasCampaign) activeCampaignsCount++;

        const pDate = new Date(p.endDate);
        const cost = p.budgetActual || 0;

        if (pDate.getFullYear() === chartYear) {
            const monthIdx = pDate.getMonth();
            monthlyTrend[monthIdx].reel += cost;
        }

        if (pDate >= dStart && pDate <= dEnd) {
            totalActual += cost;
            const svcs = p.service || [];
            let servicesToHit: string[] = [];

            if (svcs.includes('Tous Services')) {
                servicesToHit = ['VN', 'VO', 'APV', 'PR'];
            } else {
                servicesToHit = svcs.filter(s => ['VN', 'VO', 'APV', 'PR'].includes(s));
            }

            if (servicesToHit.length > 0) {
                const splitAmount = cost / servicesToHit.length;
                servicesToHit.forEach(s => {
                    if (serviceMix[s] !== undefined) serviceMix[s] += splitAmount;
                });
            }
        }
    });

    let accReel = 0;
    monthlyTrend.forEach(m => {
        accReel += m.reel;
        m.cumulReel = Math.round(accReel);
        m.prevu = Math.round(m.prevu);
        m.reel = Math.round(m.reel);
    });

    const serviceChartData = Object.entries(serviceMix)
        .map(([name, value]) => ({ name, value: Math.round(value) }))
        .filter(d => d.value > 0)
        .sort((a,b) => b.value - a.value);

    // 6. Upcoming Deadlines (Projects)
    const deadlines = projects
        .filter(p => p.status === 'Active' && isSiteInScope(p.site as string))
        .sort((a,b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
        .slice(0, 10);

    // 7. Upcoming Social Posts
    // Filter: Future dates or today, not archived, not published yet
    const today = new Date();
    today.setHours(0,0,0,0);

    const upcomingPosts = socialPosts
        .filter(p => {
             // Scope Check for Social
             if (filterContext !== 'All') {
                 // Simplistic check for social scope (assuming concessions array)
                 const pScope = p.concessions || [];
                 const match = pScope.includes(filterContext) || pScope.includes('GROUPE BONY') || (PLAQUES_STRUCTURE[filterContext as PlaqueName] && pScope.some(s => PLAQUES_STRUCTURE[filterContext as PlaqueName].includes(s as Site)));
                 if (!match) return false;
             }
             // Brand check
             if (filterBrand !== 'All') {
                 if (!p.brands.includes(filterBrand) && !p.brands.includes('Groupe')) return false;
             }

             if (p.archived) return false;
             if (p.status === 'Publié' || p.status === 'Abandonné') return false;
             return new Date(p.date) >= today;
        })
        .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 10);

    return {
        totalForecast,
        totalActual,
        activeProjectsCount,
        activeCampaignsCount,
        monthlyTrend,
        serviceChartData,
        deadlines,
        upcomingPosts
    };

  }, [projects, budgets, socialPosts, dateStart, dateEnd, filterContext, filterBrand]);

  // --- RENDER HELPERS ---
  const formatCurrency = (val: number) => val.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  const burnRate = stats.totalForecast > 0 ? (stats.totalActual / stats.totalForecast) * 100 : 0;
  const remaining = stats.totalForecast - stats.totalActual;

  const getNetworkIcon = (networkName: string) => {
      const n = networkName.toLowerCase();
      if (n.includes('instagram')) return <Instagram size={14} className="text-[#E1306C]" />;
      if (n.includes('facebook')) return <Facebook size={14} className="text-[#1877F2]" />;
      if (n.includes('linkedin')) return <Linkedin size={14} className="text-[#0077B5]" />;
      if (n.includes('youtube')) return <Youtube size={14} className="text-[#FF0000]" />;
      if (n.includes('gmb')) return <MapPin size={14} className="text-[#4285F4]" />;
      if (n.includes('tiktok')) return <Video size={14} className="text-slate-900 dark:text-white" />;
      return <Globe size={14} className="text-slate-500" />;
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bony-dark animate-fade-in font-sans">
      
      {/* --- HEADER: PILOTAGE BAR --- */}
      <div className="px-6 py-5 bg-bony-panel border-b border-bony-border shrink-0 z-20 shadow-md transition-colors">
         <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
             <div>
                 <h2 className="text-lg md:text-2xl text-bony-text font-title mb-1 flex items-center gap-2">
                     <Activity className="text-bony-orange"/> Cockpit Général
                 </h2>
                 <p className="text-xs text-bony-muted font-sans tracking-wide">
                     VUE CONSOLIDÉE ET ANALYSE DE LA PERFORMANCE
                 </p>
             </div>

             {/* FILTERS */}
             <div className="flex items-center gap-3 bg-slate-100 dark:bg-black/30 p-1.5 rounded-xl border border-bony-border/50">
                 
                 {/* DATE RANGE */}
                 <div className="px-2 flex gap-2">
                     <div>
                        <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Du</label>
                        <input 
                            type="date"
                            value={dateStart}
                            onChange={(e) => setDateStart(e.target.value)}
                            className="bg-transparent text-xs font-bold text-bony-text outline-none cursor-pointer border-b border-bony-border pb-0.5"
                        />
                     </div>
                     <div className="pt-4 text-slate-500">→</div>
                     <div>
                        <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Au</label>
                        <input 
                            type="date"
                            value={dateEnd}
                            onChange={(e) => setDateEnd(e.target.value)}
                            className="bg-transparent text-xs font-bold text-bony-text outline-none cursor-pointer border-b border-bony-border pb-0.5"
                        />
                     </div>
                 </div>
                 <div className="w-px h-6 bg-bony-border"></div>

                 {/* Context */}
                 <div className="px-2">
                     <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Périmètre</label>
                     <select 
                        value={filterContext} onChange={(e) => setFilterContext(e.target.value)}
                        className="bg-transparent text-xs font-bold text-bony-orange outline-none cursor-pointer max-w-[120px] truncate"
                     >
                         <option value="All">TOUT LE RÉSEAU</option>
                         {Object.entries(PLAQUES_STRUCTURE).map(([plaque, sites]) => (
                             <optgroup key={plaque} label={plaque}>
                                 <option value={plaque}>★ {plaque}</option>
                                 {sites.map(s => <option key={s} value={s}>{s}</option>)}
                             </optgroup>
                         ))}
                         <option value="Alpine">Alpine</option>
                         <option value="Nissan">Nissan</option>
                     </select>
                 </div>
                 <div className="w-px h-6 bg-bony-border"></div>

                 {/* Brand */}
                 <div className="px-2">
                     <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Marque</label>
                     <select 
                        value={filterBrand} onChange={(e) => setFilterBrand(e.target.value as any)}
                        className="bg-transparent text-xs font-bold text-bony-text outline-none cursor-pointer"
                     >
                         <option value="All">Toutes</option>
                         {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                     </select>
                 </div>
             </div>
         </div>
      </div>

      {/* --- CONTENT SCROLL AREA --- */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-6 space-y-6 pb-20">
          
          {/* 1. KPI CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* BUDGET */}
              <div className="bg-bony-panel rounded-xl border border-bony-border p-5 relative overflow-hidden group hover:border-bony-orange/30 transition-all shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                      <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Budget Consommé</p>
                          <h3 className="text-2xl font-title text-bony-text">{formatCurrency(stats.totalActual)}</h3>
                      </div>
                      <div className="p-2 bg-bony-orange/10 rounded-lg text-bony-orange">
                          <Wallet size={20} />
                      </div>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-black/50 h-1.5 rounded-full overflow-hidden mb-2">
                      <div className={`h-full ${burnRate > 100 ? 'bg-red-500' : 'bg-bony-gradient'}`} style={{width: `${Math.min(burnRate, 100)}%`}}></div>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Sur {formatCurrency(stats.totalForecast)} (Période)</span>
                      <span className={`font-bold ${burnRate > 100 ? 'text-red-500' : 'text-emerald-500 dark:text-emerald-400'}`}>{burnRate.toFixed(1)}%</span>
                  </div>
              </div>

              {/* REMAINING */}
              <div className="bg-bony-panel rounded-xl border border-bony-border p-5 relative overflow-hidden group hover:border-bony-blue/30 transition-all shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                      <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Reste à Engager</p>
                          <h3 className={`text-2xl font-title ${remaining < 0 ? 'text-red-500' : 'text-bony-text'}`}>{formatCurrency(remaining)}</h3>
                      </div>
                      <div className="p-2 bg-bony-blue/20 rounded-lg text-blue-500 dark:text-blue-400">
                          <Target size={20} />
                      </div>
                  </div>
                  <div className="text-xs text-slate-400 mt-4">
                      {remaining < 0 
                        ? "Dépassement budgétaire sur la période." 
                        : "Disponible pour nouveaux projets."}
                  </div>
              </div>

              {/* PROJECTS */}
              <div className="bg-bony-panel rounded-xl border border-bony-border p-5 relative overflow-hidden group hover:border-slate-300 dark:hover:border-white/20 transition-all shadow-sm">
                  <div className="flex justify-between items-start">
                      <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Projets Actifs</p>
                          <h3 className="text-3xl font-title text-bony-text">{stats.activeProjectsCount}</h3>
                      </div>
                      <div className="p-2 bg-slate-100 dark:bg-white/5 rounded-lg text-slate-400 dark:text-slate-300">
                          <Layers size={20} />
                      </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                      <span className="flex w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="text-xs text-emerald-500 dark:text-emerald-400 font-bold">En cours de réalisation</span>
                  </div>
              </div>

              {/* CAMPAIGNS */}
              <div className="bg-bony-panel rounded-xl border border-bony-border p-5 relative overflow-hidden group hover:border-bony-violet/30 transition-all shadow-sm">
                  <div className="flex justify-between items-start">
                      <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Campagnes Live</p>
                          <h3 className="text-3xl font-title text-bony-text">{stats.activeCampaignsCount}</h3>
                      </div>
                      <div className="p-2 bg-bony-violet/10 rounded-lg text-bony-violet">
                          <Megaphone size={20} />
                      </div>
                  </div>
                  <div className="mt-4 text-xs text-slate-400">
                      SMS / E-mails programmés ou en cours d'envoi.
                  </div>
              </div>
          </div>

          {/* 2. CHARTS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* LEFT: TREND (2/3) */}
              <div className="lg:col-span-2 bg-bony-panel border border-bony-border rounded-xl p-5 flex flex-col h-[400px] shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-sm font-bold text-bony-text uppercase tracking-wider flex items-center gap-2">
                          <TrendingUp size={16} className="text-bony-orange"/> Trajectoire Mensuelle ({new Date(dateStart).getFullYear()})
                      </h3>
                      <div className="flex gap-4 text-[10px] font-bold uppercase">
                          <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-bony-blue/20 border border-bony-blue rounded-sm"></div> Budget Mensuel</div>
                          <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-bony-orange rounded-sm"></div> Réalisé Mensuel</div>
                      </div>
                  </div>
                  <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={stats.monthlyTrend} margin={{top: 10, right: 10, left: 0, bottom: 0}}>
                              <defs>
                                  <linearGradient id="colorPrevu" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor={COLORS.blue} stopOpacity={0.3}/>
                                      <stop offset="95%" stopColor={COLORS.blue} stopOpacity={0}/>
                                  </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#333' : '#e2e8f0'} vertical={false} />
                              <XAxis dataKey="month" stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} />
                              <YAxis yAxisId="left" stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val/1000}k`} />
                              <Tooltip 
                                  contentStyle={{
                                      backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff', 
                                      borderColor: theme === 'dark' ? '#333' : '#e2e8f0', 
                                      fontSize: '11px', 
                                      color: theme === 'dark' ? '#fff' : '#0f172a'
                                  }} 
                                  itemStyle={{color: theme === 'dark' ? '#fff' : '#0f172a'}}
                                  formatter={(val: number) => val.toLocaleString() + ' €'}
                              />
                              {/* Forecast Area */}
                              <Area yAxisId="left" type="monotone" dataKey="prevu" stroke="none" fill="url(#colorPrevu)" />
                              {/* Actual Bar */}
                              <Bar yAxisId="left" dataKey="reel" fill={COLORS.orange} barSize={16} radius={[2,2,0,0]} />
                          </ComposedChart>
                      </ResponsiveContainer>
                  </div>
              </div>

              {/* RIGHT: MIX SERVICE (1/3) */}
              <div className="bg-bony-panel border border-bony-border rounded-xl p-5 flex flex-col h-[400px] shadow-sm">
                   <h3 className="text-sm font-bold text-bony-text uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Target size={16} className="text-bony-violet"/> Mix Activité
                   </h3>
                   <div className="flex-1 relative">
                       <ResponsiveContainer width="100%" height="100%">
                           <PieChart>
                               <Pie
                                   data={stats.serviceChartData}
                                   cx="50%" cy="50%"
                                   innerRadius={80} // Bigger
                                   outerRadius={110} // Bigger
                                   paddingAngle={2}
                                   dataKey="value"
                                   stroke="none"
                               >
                                   {stats.serviceChartData.map((entry, index) => (
                                       <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.name] || COLORS.slate} />
                                   ))}
                               </Pie>
                               <Tooltip 
                                    contentStyle={{
                                        backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff', 
                                        borderRadius: '8px', 
                                        borderColor: theme === 'dark' ? '#333' : '#e2e8f0', 
                                        color: theme === 'dark' ? '#fff' : '#0f172a'
                                    }} 
                                    formatter={(value: number) => formatCurrency(value)}
                               />
                           </PieChart>
                       </ResponsiveContainer>
                   </div>
                   <div className="mt-2 space-y-2">
                       {stats.serviceChartData.map(d => (
                           <div key={d.name} className="flex items-center justify-between text-xs border-b border-bony-border pb-1">
                               <div className="flex items-center gap-2">
                                   <div className={`w-3 h-3 rounded-full shadow`} style={{backgroundColor: PIE_COLORS[d.name] || COLORS.slate}}></div>
                                   <span className="text-slate-700 dark:text-slate-200 font-bold">{d.name}</span>
                               </div>
                               <span className="text-bony-text font-sans">{formatCurrency(d.value)}</span>
                           </div>
                       ))}
                       {stats.serviceChartData.length === 0 && (
                           <div className="text-center text-slate-500 text-xs italic">Aucune donnée</div>
                       )}
                   </div>
              </div>
          </div>

          {/* 3. DETAILS ROW (Upcoming Deadlines & Social Posts) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:h-[400px]">
              
              {/* LEFT: PROJECT DEADLINES */}
              <div className="bg-bony-panel border border-bony-border rounded-xl p-5 flex flex-col h-full shadow-sm">
                  <h3 className="text-sm font-bold text-bony-text uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Calendar size={16} className="text-bony-text"/> Prochaines Échéances (Projets)
                  </h3>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3 min-h-0">
                      {stats.deadlines.length > 0 ? (
                          stats.deadlines.map(p => (
                            <div 
                                key={p.id} 
                                onClick={() => handleNavigateToProject(p.id)}
                                className="relative flex items-center gap-4 p-3 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg hover:border-bony-orange/50 hover:bg-slate-200 dark:hover:bg-white/10 transition-all cursor-pointer group"
                            >
                                <div className="flex flex-col items-center justify-center w-10 h-10 bg-white dark:bg-black/30 rounded border border-bony-border shrink-0">
                                    <span className="text-[9px] text-slate-500 font-bold uppercase">{new Date(p.endDate).toLocaleString('fr-FR', {month:'short'})}</span>
                                    <span className="text-sm font-bold text-bony-text leading-none">{new Date(p.endDate).getDate()}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate group-hover:text-bony-text transition-colors">{p.name}</h4>
                                    <div className="flex gap-2 mt-1">
                                        <span className="text-[9px] bg-bony-blue/10 text-blue-500 dark:text-blue-300 px-1.5 py-0.5 rounded border border-bony-blue/20">{p.site}</span>
                                        {p.service.includes('Tous Services') ? (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-500 text-slate-500 dark:text-slate-400">Multi</span>
                                        ) : (
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${SERVICE_COLORS[p.service[0]] || 'border-slate-600'}`}>{p.service[0]}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <ArrowRight size={16} className="text-slate-400 dark:text-slate-600 group-hover:text-bony-orange transition-colors"/>
                                </div>
                            </div>
                          ))
                      ) : (
                          <div className="text-center text-slate-600 py-12 text-sm italic border border-dashed border-bony-border rounded-xl">
                              Aucune échéance à venir.
                          </div>
                      )}
                  </div>
              </div>

              {/* RIGHT: DIGITAL POSTS DEADLINES */}
              <div className="bg-bony-panel border border-bony-border rounded-xl p-5 flex flex-col h-full shadow-sm">
                  <h3 className="text-sm font-bold text-bony-text uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Globe size={16} className="text-bony-violet"/> Prochaines Publications (Digital)
                  </h3>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3 min-h-0">
                      {stats.upcomingPosts.length > 0 ? (
                          stats.upcomingPosts.map(post => {
                            const statusColor = SOCIAL_STATUS_COLORS[post.status] || 'border-slate-600';

                            return (
                                <div 
                                    key={post.id} 
                                    onClick={handleNavigateToDigital}
                                    className={`relative flex items-center gap-4 p-3 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg hover:border-bony-violet/50 hover:bg-slate-200 dark:hover:bg-white/10 transition-all cursor-pointer group`}
                                >
                                    <div className="flex flex-col items-center justify-center w-10 h-10 bg-white dark:bg-black/30 rounded border border-bony-border shrink-0">
                                        <span className="text-[9px] text-slate-500 font-bold uppercase">{new Date(post.date).toLocaleString('fr-FR', {month:'short'})}</span>
                                        <span className="text-sm font-bold text-bony-text leading-none">{new Date(post.date).getDate()}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate group-hover:text-bony-text transition-colors">{post.title}</h4>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {post.brands.slice(0,2).map(b => (
                                                <span key={b} className={`text-[9px] px-1.5 py-0.5 rounded border ${BRAND_COLORS[b]}`}>{b}</span>
                                            ))}
                                            <span className="text-[9px] bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/10">{post.status}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-1.5 bg-white dark:bg-black/20 p-1.5 rounded-lg border border-bony-border">
                                        {post.networks.length > 0 ? (
                                            post.networks.slice(0, 3).map(n => (
                                                <div key={n} title={n}>
                                                    {getNetworkIcon(n)}
                                                </div>
                                            ))
                                        ) : (
                                            <Globe size={14} className="text-slate-600"/>
                                        )}
                                        {post.networks.length > 3 && (
                                            <span className="text-[9px] text-slate-500 font-bold">+{post.networks.length - 3}</span>
                                        )}
                                    </div>
                                </div>
                            );
                          })
                      ) : (
                          <div className="text-center text-slate-600 py-12 text-sm italic border border-dashed border-bony-border rounded-xl">
                              Aucune publication planifiée.
                          </div>
                      )}
                  </div>
              </div>
          </div>

      </div>
    </div>
  );
};

export default Dashboard;
