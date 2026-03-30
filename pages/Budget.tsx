
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { BudgetLine, ServiceType, BrandType, Project, PlaqueName, Site, FixedExpense } from '../types';
import { db } from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';
import { Save, ChevronDown, ChevronRight, Calculator, PieChart, TrendingUp, TrendingDown, AlertTriangle, Filter, Coins, Calendar, Lock } from 'lucide-react';
import { SERVICE_COLORS, BRAND_COLORS, PLAQUES_STRUCTURE, SITES, SERVICES } from '../constants';
import { 
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { useTheme } from '../contexts/ThemeContext';

type Tab = 'Provisions' | 'Suivi';

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const YEARS = [2024, 2025, 2026];

const Budget: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useSessionState<Tab>('budget_activeTab', 'Suivi');
  const [budgets, setBudgets] = useState<BudgetLine[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // expandedSites persisted as string[] in session, exposed as Set<string>
  const [expandedSitesArr, setExpandedSitesArr] = useSessionState<string[]>('budget_expandedSites', []);
  const expandedSites = useMemo(() => new Set(expandedSitesArr), [expandedSitesArr]);
  const setExpandedSites = useCallback((s: Set<string>) => setExpandedSitesArr([...s]), [setExpandedSitesArr]);

  // Permissions
  const canEditProvisions = user?.role === 'Master' || user?.role === 'Administrator';

  // --- FILTERS ---
  const [filterPlaque, setFilterPlaque] = useSessionState<string>('budget_filterPlaque', 'All');
  const [filterBrand, setFilterBrand] = useSessionState<BrandType | 'All'>('budget_filterBrand', 'All');
  const [filterService, setFilterService] = useSessionState<ServiceType | 'All'>('budget_filterService', 'All');
  const [filterYear, setFilterYear] = useSessionState<number>('budget_filterYear', new Date().getFullYear());
  const [filterMonthStart, setFilterMonthStart] = useSessionState<number>('budget_filterMonthStart', 0); // 0 = Jan
  const [filterMonthEnd, setFilterMonthEnd] = useSessionState<number>('budget_filterMonthEnd', 11);   // 11 = Dec

  const scrollRef = useScrollRestore('budget', !loading);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [budgetData, projectData, fixedExpensesData] = await Promise.all([
        db.getBudgets(),
        db.getProjects(),
        db.getFixedExpenses()
    ]);
    
    // Sort by site name
    budgetData.sort((a, b) => a.site.localeCompare(b.site));
    setBudgets(budgetData);
    setProjects(projectData);
    setFixedExpenses(fixedExpensesData);
    setLoading(false);
  };

  const handleSave = async (newData: BudgetLine[]) => {
      setSaving(true);
      setBudgets(newData);
      await db.saveBudgets(newData);
      setTimeout(() => setSaving(false), 800);
  };

  const updateBudgetEntry = (site: string, service: 'VN'|'VO'|'PR'|'APV', monthIndex: number, value: number) => {
      if (!canEditProvisions) return;
      const newData = budgets.map(b => {
          if (b.site === site) {
              const newEntries = { ...b.entries };
              const newMonthValues = [...newEntries[service]];
              newMonthValues[monthIndex] = value;
              newEntries[service] = newMonthValues;
              return { ...b, entries: newEntries };
          }
          return b;
      });
      handleSave(newData);
  };

  const toggleSite = (site: string) => {
      const newSet = new Set(expandedSites);
      if (newSet.has(site)) newSet.delete(site);
      else newSet.add(site);
      setExpandedSites(newSet);
  };

  const getPlaqueForSite = (site: string): string => {
    for (const [plaque, sites] of Object.entries(PLAQUES_STRUCTURE)) {
        if (sites.includes(site as any)) return plaque;
    }
    return 'ENTITÉS SPÉCIFIQUES';
  };

  // --- LOGIC: AGGREGATION ENGINE ---

  const aggregatedData = useMemo(() => {
      // 1. Initialize Structure
      const siteStats: Record<string, { 
          forecast: Record<string, number>, 
          actual: Record<string, number>,
          forecastMonthly: number[], // Array of 12
          actualMonthly: number[]    // Array of 12
      }> = {};

      // Init
      budgets.forEach(b => {
          siteStats[b.site] = { 
              forecast: { VN: 0, VO: 0, PR: 0, APV: 0 }, 
              actual: { VN: 0, VO: 0, PR: 0, APV: 0 },
              forecastMonthly: new Array(12).fill(0),
              actualMonthly: new Array(12).fill(0)
          };
      });

      // Define which services to aggregate
      let servicesToProcess: ('VN'|'VO'|'PR'|'APV')[];
      if (filterService === 'All' || filterService === 'Tous Services') {
          servicesToProcess = ['VN', 'VO', 'PR', 'APV'];
      } else {
          // Explicit cast to 'VN'|'VO'|'PR'|'APV'
          servicesToProcess = [filterService as any];
      }

      // 2. Process FORECASTS (Budgets)
      budgets.forEach(b => {
          const s = siteStats[b.site];
          if (!s) return;

          // Brand Filter
          if (filterBrand !== 'All' && !b.brands.includes(filterBrand) && !b.brands.includes('Groupe')) {
             // Simplification: keep budget if brand is present
          }

          servicesToProcess.forEach(svc => {
              // Iterate over months
              if (b.entries[svc]) {
                  b.entries[svc].forEach((val, monthIdx) => {
                      // Only include if within selected month range
                      if (monthIdx >= filterMonthStart && monthIdx <= filterMonthEnd) {
                          s.forecast[svc] += val;
                          s.forecastMonthly[monthIdx] += val;
                      }
                  });
              }
          });
      });

      // 3. Process ACTUALS (Projects)
      projects.forEach(p => {
          if (p.status === 'Draft' || p.status === 'Archived') return; 

          // Determine Sites and Shares
          let siteShares: Record<string, number> = {};
          if (p.sites && p.sites.length > 0 && p.budgetDistribution) {
              siteShares = p.budgetDistribution;
          } else {
              // Legacy fallback
              siteShares = { [p.site as string]: 100 };
          }

          Object.entries(siteShares).forEach(([rawSite, sharePct]) => {
              if (sharePct <= 0) return;

              // Site Mapping
              let targetSite = rawSite;
              if (targetSite === 'Thiers' || targetSite === 'Ambert') targetSite = 'Ricoux';
              if (targetSite === 'Riom') targetSite = 'Mozac';

              // Alpine/Nissan brand routing: override target to entity bucket
              const pBrands = p.brands || [];
              if (pBrands.includes('Alpine') && siteStats['Alpine']) {
                  targetSite = 'Alpine';
              } else if (pBrands.includes('Nissan') && siteStats['Nissan']) {
                  targetSite = 'Nissan';
              }

              if (!siteStats[targetSite]) return;

              // Brand Filter
              if (filterBrand !== 'All') {
                  if (!pBrands.includes(filterBrand) && !pBrands.includes('Groupe')) return;
              }

              // Year Filter
              const pDate = new Date(p.endDate);
              if (pDate.getFullYear() !== filterYear) return;

              // Cost Calculation for this Site
              const totalProjectCost = p.budgetActual || 0;
              if (totalProjectCost === 0) return;
              
              const siteCost = totalProjectCost * (sharePct / 100);

              // Month Mapping
              const monthIdx = pDate.getMonth();
              
              // Only process if within date range
              if (monthIdx < filterMonthStart || monthIdx > filterMonthEnd) return;

              // Service Dispatch
              const services = p.service || [];
              let servicesToHit: string[] = [];

              if (services.includes('Tous Services')) {
                  servicesToHit = ['VN', 'VO', 'PR', 'APV'];
              } else {
                  servicesToHit = services.filter(s => ['VN', 'VO', 'PR', 'APV'].includes(s));
              }

              if (servicesToHit.length > 0) {
                  const costPerSvc = siteCost / servicesToHit.length;
                  
                  servicesToHit.forEach(svc => {
                      if (servicesToProcess.includes(svc as any)) {
                          if (siteStats[targetSite].actual[svc] !== undefined) {
                              siteStats[targetSite].actual[svc] += costPerSvc;
                          }
                          siteStats[targetSite].actualMonthly[monthIdx] += costPerSvc;
                      }
                  });
              }
          });
      });

      // 4. Process FIXED EXPENSES
      fixedExpenses.forEach(exp => {
          // Determine Sites and Shares
          let siteShares: Record<string, number> = {};
          if (exp.sites && exp.sites.length > 0 && exp.budgetDistribution) {
              siteShares = exp.budgetDistribution;
          } else {
              // Legacy fallback
              siteShares = { [exp.site as string]: 100 };
          }

          Object.entries(siteShares).forEach(([rawSite, sharePct]) => {
              if (sharePct <= 0) return;

              // Site Mapping
              let targetSite = rawSite;
              if (targetSite === 'Thiers' || targetSite === 'Ambert') targetSite = 'Ricoux';
              if (targetSite === 'Riom') targetSite = 'Mozac';

              // Alpine/Nissan brand routing: override target to entity bucket
              if (exp.brand === 'Alpine' && siteStats['Alpine']) {
                  targetSite = 'Alpine';
              } else if (exp.brand === 'Nissan' && siteStats['Nissan']) {
                  targetSite = 'Nissan';
              }

              if (!siteStats[targetSite]) return;

              // Year Filter
              const expDate = new Date(exp.date);
              if (expDate.getFullYear() !== filterYear) return;

              // Cost Calculation for this Site
              const totalCost = exp.amount || 0;
              if (totalCost === 0) return;
              
              const siteCost = totalCost * (sharePct / 100);

              // Month Mapping
              const monthIdx = expDate.getMonth();
              
              // Only process if within date range
              if (monthIdx < filterMonthStart || monthIdx > filterMonthEnd) return;

              // Service Dispatch
              let servicesToHit: string[] = [];
              if (exp.service === 'Tous Services') {
                  servicesToHit = ['VN', 'VO', 'PR', 'APV'];
              } else if (['VN', 'VO', 'PR', 'APV'].includes(exp.service)) {
                  servicesToHit = [exp.service];
              }

              if (servicesToHit.length > 0) {
                  const costPerSvc = siteCost / servicesToHit.length;
                  
                  servicesToHit.forEach(svc => {
                      if (servicesToProcess.includes(svc as any)) {
                          if (siteStats[targetSite].actual[svc] !== undefined) {
                              siteStats[targetSite].actual[svc] += costPerSvc;
                          }
                          siteStats[targetSite].actualMonthly[monthIdx] += costPerSvc;
                      }
                  });
              }
          });
      });

      // 5. Final Aggregation
      let finalForecastMonthly = new Array(12).fill(0);
      let finalActualMonthly = new Array(12).fill(0);
      let matrix: any[] = [];

      let totalForecast = 0;
      let totalActual = 0;

      Object.entries(siteStats).forEach(([site, stats]) => {
          const plaque = getPlaqueForSite(site);
          
          // Filter by Plaque
          if (filterPlaque !== 'All') {
              const isGroup = filterPlaque === 'GROUPE BONY';
              if (!isGroup && plaque !== filterPlaque && site !== filterPlaque) return;
          }
          
          stats.forecastMonthly.forEach((v, i) => finalForecastMonthly[i] += v);
          stats.actualMonthly.forEach((v, i) => finalActualMonthly[i] += v);
          
          const siteTotalForecast = Object.values(stats.forecast).reduce((a,b)=>a+b,0);
          const siteTotalActual = Object.values(stats.actual).reduce((a,b)=>a+b,0);
          
          totalForecast += siteTotalForecast;
          totalActual += siteTotalActual;

          matrix.push({
              site,
              plaque,
              forecast: stats.forecast,
              actual: stats.actual,
              totalForecast: siteTotalForecast,
              totalActual: siteTotalActual,
              consumption: siteTotalForecast > 0 ? (siteTotalActual / siteTotalForecast) * 100 : 0
          });
      });

      // Slice Data for Chart to show only selected period
      const chartData = finalForecastMonthly.map((f, i) => ({
          name: MONTHS[i],
          Prevu: i >= filterMonthStart && i <= filterMonthEnd ? Math.round(f) : 0,
          Reel: i >= filterMonthStart && i <= filterMonthEnd ? Math.round(finalActualMonthly[i]) : 0,
          amt: Math.round(f)
      })).slice(filterMonthStart, filterMonthEnd + 1);

      return {
          chartData,
          matrix,
          totalForecast,
          totalActual
      };
  }, [budgets, projects, fixedExpenses, filterPlaque, filterBrand, filterService, filterYear, filterMonthStart, filterMonthEnd]);


  // --- RENDERERS ---

  const renderProvisions = () => {
      if (loading) return <div className="text-slate-500 p-8">Chargement des données budgétaires...</div>;

      const totalAnnualGroup = budgets.reduce((acc, b) => {
          const sumSite = Object.values(b.entries).flat().reduce((s, v) => s + v, 0);
          return acc + sumSite;
      }, 0);

      // Group Budgets by Plaque
      const groupedBudgets: Record<string, BudgetLine[]> = {};
      Object.keys(PLAQUES_STRUCTURE).forEach(p => groupedBudgets[p] = []);
      groupedBudgets['ENTITÉS SPÉCIFIQUES'] = [];

      budgets.forEach(b => {
          const plaque = getPlaqueForSite(b.site);
          if (groupedBudgets[plaque]) {
              groupedBudgets[plaque].push(b);
          } else {
              if (!groupedBudgets['ENTITÉS SPÉCIFIQUES']) groupedBudgets['ENTITÉS SPÉCIFIQUES'] = [];
              groupedBudgets['ENTITÉS SPÉCIFIQUES'].push(b);
          }
      });

      return (
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar pb-20 p-3 md:p-0">
             <div className="bg-bony-panel border border-bony-border p-6 rounded-xl mb-6 flex items-center justify-between shadow-lg">
                 <div>
                     <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">Budget Prévisionnel Groupe (Annuel)</h3>
                     <div className="text-4xl font-title text-slate-900 dark:text-white">{totalAnnualGroup.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</div>
                 </div>
                 <div className="flex items-center gap-4">
                     {!canEditProvisions && (
                         <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg text-red-400">
                             <Lock size={16}/>
                             <span className="text-xs font-bold uppercase">Lecture Seule</span>
                         </div>
                     )}
                     <div className="flex items-center gap-2 bg-slate-100 dark:bg-black/20 px-4 py-2 rounded-lg border border-bony-border">
                         <Calculator className="text-bony-orange" size={20}/>
                         <span className="text-xs text-slate-500">Calculé sur {budgets.length} sites</span>
                     </div>
                 </div>
             </div>

             <div className="space-y-8">
                 {Object.entries(groupedBudgets).map(([plaqueName, siteBudgets]) => {
                     if (siteBudgets.length === 0) return null;

                     return (
                         <div key={plaqueName} className="space-y-3">
                             <div className="flex items-center gap-3 mb-2 px-1">
                                 <div className="h-px bg-bony-border flex-1"></div>
                                 <h3 className="text-sm font-bold text-bony-orange font-title uppercase tracking-widest">{plaqueName}</h3>
                                 <div className="h-px bg-bony-border flex-1"></div>
                             </div>

                             {siteBudgets.map((budget) => {
                                 const isExpanded = expandedSites.has(budget.site);
                                 const totalAnnualSite = Object.values(budget.entries).flat().reduce((s, v) => s + v, 0);
                                 
                                 return (
                                     <div key={budget.site} className="bg-bony-panel border border-bony-border rounded-lg overflow-hidden transition-all hover:border-bony-violet/30">
                                         <div 
                                            onClick={() => toggleSite(budget.site)}
                                            className="p-4 flex items-center justify-between cursor-pointer bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
                                         >
                                             <div className="flex items-center gap-4">
                                                 {isExpanded ? <ChevronDown size={18} className="text-bony-orange"/> : <ChevronRight size={18} className="text-slate-500"/>}
                                                 <div>
                                                     <div className="flex items-baseline gap-2">
                                                         <h4 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-wide">{budget.site}</h4>
                                                         <span className="text-[9px] font-bold text-slate-500 bg-slate-200 dark:bg-black/40 px-1.5 rounded uppercase border border-bony-border">
                                                             {plaqueName}
                                                         </span>
                                                     </div>
                                                     <div className="flex gap-2 mt-1">
                                                         {budget.brands.map(brand => (
                                                             <span key={brand} className={`text-[9px] px-1.5 rounded border ${BRAND_COLORS[brand]}`}>
                                                                 {brand}
                                                             </span>
                                                         ))}
                                                     </div>
                                                 </div>
                                             </div>
                                             <div className="flex items-center gap-8 text-right">
                                                 <div>
                                                     <div className="text-[10px] text-slate-500 uppercase font-bold">Mensuel Moy.</div>
                                                     <div className="text-sm font-sans text-slate-600 dark:text-slate-300">{(totalAnnualSite/12).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</div>
                                                 </div>
                                                 <div>
                                                     <div className="text-[10px] text-slate-500 uppercase font-bold">Annuel Prévu</div>
                                                     <div className="text-xl font-sans font-bold text-bony-gradient-text bg-clip-text text-transparent bg-bony-gradient">
                                                         {totalAnnualSite.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                                                     </div>
                                                 </div>
                                             </div>
                                         </div>
                                         {isExpanded && (
                                             <div className="p-4 bg-slate-100 dark:bg-black/20 border-t border-bony-border animate-in slide-in-from-top-2">
                                                 <div className="overflow-x-auto">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="text-xs text-slate-500 uppercase font-bold text-center">
                                                                <th className="p-2 text-left w-24">Service</th>
                                                                {MONTHS.map(m => <th key={m} className="p-2 min-w-[80px]">{m}</th>)}
                                                                <th className="p-2 w-32 text-right">Total Annuel</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-white/5">
                                                            {(['VN', 'VO', 'PR', 'APV'] as const).map(svc => {
                                                                const rowValues = budget.entries[svc];
                                                                const rowTotal = rowValues.reduce((a,b) => a+b, 0);
                                                                const colorClass = SERVICE_COLORS[svc === 'PR' ? 'PR' : svc as ServiceType];
                                                                return (
                                                                    <tr key={svc} className="hover:bg-white/5 transition-colors">
                                                                        <td className="p-2 font-bold">
                                                                            <span className={`px-2 py-1 rounded border text-xs ${colorClass.replace('bg-opacity-10', 'bg-opacity-20')}`}>
                                                                                {svc}
                                                                            </span>
                                                                        </td>
                                                                        {rowValues.map((val, idx) => (
                                                                            <td key={idx} className="p-1">
                                                                                <input 
                                                                                    type="number" 
                                                                                    disabled={!canEditProvisions}
                                                                                    value={val}
                                                                                    onChange={(e) => updateBudgetEntry(budget.site, svc, idx, Number(e.target.value))}
                                                                                    className={`w-full bg-white dark:bg-bony-dark border border-bony-border rounded px-2 py-1 text-right text-xs text-slate-700 dark:text-slate-200 outline-none transition-colors 
                                                                                        ${canEditProvisions ? 'focus:border-bony-orange focus:text-slate-900 dark:focus:text-white' : 'opacity-50 cursor-not-allowed border-transparent bg-transparent'}
                                                                                    `}
                                                                                />
                                                                            </td>
                                                                        ))}
                                                                        <td className="p-2 text-right font-sans font-bold text-slate-900 dark:text-white">
                                                                            {rowTotal.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                 </div>
                                             </div>
                                         )}
                                     </div>
                                 );
                             })}
                         </div>
                     );
                 })}
             </div>
          </div>
      );
  };

  const renderSuivi = () => {
      const { chartData, matrix, totalForecast, totalActual } = aggregatedData;
      const consumedPercent = totalForecast > 0 ? (totalActual / totalForecast) * 100 : 0;
      const remaining = totalForecast - totalActual;

      const isFullYear = filterMonthStart === 0 && filterMonthEnd === 11;
      const periodLabel = isFullYear ? `Annuel ${filterYear}` : `Période ${MONTHS[filterMonthStart]} - ${MONTHS[filterMonthEnd]} ${filterYear}`;

      return (
          <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* FILTERS BAR */}
              <div className="mb-4 flex flex-wrap gap-2 items-center bg-bony-panel p-3 rounded-xl border border-bony-border shrink-0">
                  <div className="flex items-center gap-2">
                       <Filter size={14} className="text-bony-orange"/>
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Périmètre :</span>
                       <select 
                            value={filterPlaque}
                            onChange={(e) => setFilterPlaque(e.target.value)}
                            className="bg-slate-100 dark:bg-black/30 border border-bony-border rounded px-2 py-1 text-xs text-slate-900 dark:text-white outline-none focus:border-bony-orange"
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
                  <div className="w-px h-4 bg-bony-border"></div>
                  <div className="flex items-center gap-2">
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Service :</span>
                       <select 
                            value={filterService}
                            onChange={(e) => setFilterService(e.target.value as any)}
                            className="bg-slate-100 dark:bg-black/30 border border-bony-border rounded px-2 py-1 text-xs text-slate-900 dark:text-white outline-none focus:border-bony-orange"
                       >
                            <option value="All">TOUS SERVICES</option>
                            <option value="VN">VN</option>
                            <option value="VO">VO</option>
                            <option value="APV">APV</option>
                            <option value="PR">PR</option>
                       </select>
                  </div>
                  <div className="w-px h-4 bg-bony-border"></div>
                  {/* DATE FILTERS */}
                  <div className="flex items-center gap-2">
                       <Calendar size={14} className="text-bony-violet"/>
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Année :</span>
                       <select 
                            value={filterYear}
                            onChange={(e) => setFilterYear(Number(e.target.value))}
                            className="bg-slate-100 dark:bg-black/30 border border-bony-border rounded px-2 py-1 text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet font-sans"
                       >
                           {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                       </select>
                  </div>
                  <div className="flex items-center gap-2">
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Mois :</span>
                       <div className="flex items-center bg-slate-100 dark:bg-black/30 border border-bony-border rounded">
                           <select 
                                value={filterMonthStart}
                                onChange={(e) => {
                                    const v = Number(e.target.value);
                                    setFilterMonthStart(v);
                                    if(v > filterMonthEnd) setFilterMonthEnd(v);
                                }}
                                className="bg-transparent px-2 py-1 text-xs text-slate-900 dark:text-white outline-none"
                           >
                               {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                           </select>
                           <span className="text-slate-500 px-1">→</span>
                           <select 
                                value={filterMonthEnd}
                                onChange={(e) => {
                                    const v = Number(e.target.value);
                                    setFilterMonthEnd(v);
                                    if(v < filterMonthStart) setFilterMonthStart(v);
                                }}
                                className="bg-transparent px-2 py-1 text-xs text-slate-900 dark:text-white outline-none"
                           >
                               {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                           </select>
                       </div>
                  </div>
              </div>

              {/* KPIS ROW */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4 shrink-0">
                  <div className="bg-bony-panel p-4 rounded-xl border border-bony-border flex flex-col justify-between">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Budget Prévu ({periodLabel})</div>
                      <div className="text-2xl font-title text-slate-900 dark:text-white">{totalForecast.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</div>
                  </div>
                  <div className="bg-bony-panel p-4 rounded-xl border border-bony-border flex flex-col justify-between relative overflow-hidden">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest relative z-10">Réalisé ({periodLabel})</div>
                      <div className="text-2xl font-title text-bony-orange relative z-10">{totalActual.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</div>
                      <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4">
                          <Coins size={80} className="text-bony-orange"/>
                      </div>
                  </div>
                  <div className="bg-bony-panel p-4 rounded-xl border border-bony-border flex flex-col justify-between">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reste à Engager</div>
                      <div className={`text-2xl font-title ${remaining < 0 ? 'text-red-500' : 'text-emerald-500 dark:text-emerald-400'}`}>
                          {remaining.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                      </div>
                  </div>
                  <div className="bg-bony-panel p-4 rounded-xl border border-bony-border flex flex-col justify-between relative">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Consommation</div>
                      <div className="flex items-end gap-2">
                          <div className={`text-3xl font-title ${consumedPercent > 100 ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                              {consumedPercent.toFixed(1)}%
                          </div>
                          {consumedPercent > 100 && <AlertTriangle className="text-red-500 mb-1" size={20}/>}
                      </div>
                      <div className="w-full h-1 bg-slate-200 dark:bg-black/50 rounded-full mt-2 overflow-hidden">
                          <div className={`h-full ${consumedPercent > 100 ? 'bg-red-500' : 'bg-bony-gradient'}`} style={{ width: `${Math.min(consumedPercent, 100)}%` }}></div>
                      </div>
                  </div>
              </div>

              {/* MAIN CONTENT SPLIT */}
              <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 overflow-auto md:overflow-hidden">

                  {/* LEFT: CHART (COMPOSED) */}
                  <div className="md:w-1/3 bg-bony-panel border border-bony-border rounded-xl p-4 flex flex-col">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                          <TrendingUp size={14} className="text-bony-violet"/> Évolution Mensuelle
                      </h3>
                      <div className="flex-1 min-h-[200px]">
                          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                              <ComposedChart data={chartData} margin={{top:10, right:10, left:-20, bottom:0}}>
                                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#333' : '#e2e8f0'} vertical={false}/>
                                  <XAxis dataKey="name" stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false}/>
                                  <YAxis stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false}/>
                                  <Tooltip 
                                    contentStyle={{
                                        backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff', 
                                        borderColor: theme === 'dark' ? '#333' : '#e2e8f0', 
                                        fontSize: '12px', 
                                        color: theme === 'dark' ? '#fff' : '#0f172a'
                                    }} 
                                    itemStyle={{color: theme === 'dark' ? '#fff' : '#0f172a'}}
                                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                                  />
                                  <Legend wrapperStyle={{fontSize: '10px', color: theme === 'dark' ? '#fff' : '#000'}}/>
                                  {/* ACTUAL = BARS */}
                                  <Bar dataKey="Reel" fill="#f75632" radius={[4,4,0,0]} name="Réalisé" barSize={20} />
                                  {/* FORECAST = LINE */}
                                  <Line type="monotone" dataKey="Prevu" stroke="#293f74" strokeWidth={3} dot={{r:3, strokeWidth:1, fill: theme === 'dark' ? '#1e1e1e' : '#fff'}} activeDot={{r:5}} name="Budget Prévu" />
                              </ComposedChart>
                          </ResponsiveContainer>
                      </div>
                  </div>

                  {/* RIGHT: MATRIX */}
                  <div className="flex-1 bg-bony-panel border border-bony-border rounded-xl flex flex-col overflow-hidden">
                      <div className="p-4 border-b border-bony-border shrink-0">
                           <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                               <PieChart size={14} className="text-bony-orange"/> Répartition & Performance par Site
                           </h3>
                           <p className="text-[10px] text-slate-500 mt-1">
                               Données filtrées : {periodLabel}. Service : {filterService}.
                           </p>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scrollbar">
                          <table className="w-full text-left border-collapse">
                              <thead className="bg-slate-100 dark:bg-black/20 text-[10px] uppercase font-bold text-slate-500 sticky top-0 z-10 backdrop-blur-sm">
                                  <tr>
                                      <th className="p-3 border-b border-bony-border">Site / Plaque</th>
                                      <th className="p-3 border-b border-bony-border text-center w-24">VN</th>
                                      <th className="p-3 border-b border-bony-border text-center w-24">VO</th>
                                      <th className="p-3 border-b border-bony-border text-center w-24">PR</th>
                                      <th className="p-3 border-b border-bony-border text-center w-24">APV</th>
                                      <th className="p-3 border-b border-bony-border text-right w-32">Réalisé Période</th>
                                      <th className="p-3 border-b border-bony-border text-right w-20">%</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-xs">
                                  {matrix.map((row, idx) => {
                                      const isAlert = row.consumption > 100;
                                      const isWarn = row.consumption > 80 && row.consumption <= 100;
                                      
                                      const renderCell = (svc: string) => {
                                          const forecast = row.forecast[svc];
                                          const actual = row.actual[svc];
                                          const pct = forecast > 0 ? (actual / forecast) * 100 : 0;
                                          
                                          let color = 'text-slate-500';
                                          if (forecast > 0) {
                                              if (pct > 100) color = 'text-red-500 font-bold';
                                              else if (pct > 80) color = 'text-bony-orange font-medium';
                                              else color = 'text-emerald-500 dark:text-emerald-400';
                                          }
                                          
                                          // If service filtered, dim non-selected cols? Or simple show.
                                          const dimmed = filterService !== 'All' && filterService !== svc && filterService !== 'Tous Services';

                                          return (
                                              <div className={`flex flex-col items-center ${dimmed ? 'opacity-20' : ''}`}>
                                                  <span className={`${color} tabular-nums`}>{actual > 0 ? Math.round(actual) : '-'}</span>
                                                  {forecast > 0 && <span className="text-[8px] text-slate-600 dark:text-slate-400 scale-90">{Math.round(forecast)}</span>}
                                              </div>
                                          );
                                      };

                                      return (
                                          <tr key={row.site} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                                              <td className="p-3 border-r border-slate-100 dark:border-white/5">
                                                  <div className="font-bold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white">{row.site}</div>
                                                  <div className="text-[9px] text-slate-500 uppercase">{row.plaque}</div>
                                              </td>
                                              <td className="p-2 border-r border-slate-100 dark:border-white/5">{renderCell('VN')}</td>
                                              <td className="p-2 border-r border-slate-100 dark:border-white/5">{renderCell('VO')}</td>
                                              <td className="p-2 border-r border-slate-100 dark:border-white/5">{renderCell('PR')}</td>
                                              <td className="p-2 border-r border-slate-100 dark:border-white/5">{renderCell('APV')}</td>
                                              <td className="p-3 text-right font-sans font-bold text-slate-900 dark:text-white border-r border-slate-100 dark:border-white/5">
                                                  {Math.round(row.totalActual).toLocaleString()} €
                                              </td>
                                              <td className="p-3 text-right">
                                                  <div className={`font-bold ${isAlert ? 'text-red-500' : (isWarn ? 'text-bony-orange' : 'text-emerald-500 dark:text-emerald-400')}`}>
                                                      {row.consumption.toFixed(0)}%
                                                  </div>
                                              </td>
                                          </tr>
                                      );
                                  })}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="p-3 md:p-6 h-screen flex flex-col overflow-hidden animate-fade-in bg-bony-dark">
      {/* Header */}
      <div className="flex justify-between items-end mb-6 border-b border-bony-border pb-4 shrink-0">
          <div>
            <h2 className="text-3xl text-slate-900 dark:text-white mb-1">Budget & Prévisionnel</h2>
            <p className="text-xs text-slate-500 font-sans">PILOTAGE FINANCIER PAR CONCESSION</p>
          </div>
          <div className="flex items-center gap-4">
              {saving && (
                  <span className="text-bony-orange flex items-center text-xs animate-pulse font-bold mr-4">
                      <Save size={14} className="mr-1"/> SAUVEGARDE AUTO...
                  </span>
              )}
              {/* Tabs */}
              <div className="bg-bony-panel p-1 rounded-lg border border-bony-border flex">
                  <button 
                    onClick={() => setActiveTab('Suivi')}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${activeTab === 'Suivi' ? 'bg-bony-gradient text-white shadow-lg' : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                  >
                      Suivi Réalisé
                  </button>
                  <button 
                    onClick={() => setActiveTab('Provisions')}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${activeTab === 'Provisions' ? 'bg-bony-gradient text-white shadow-lg' : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                  >
                      Provisions
                  </button>
              </div>
          </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col">
          {activeTab === 'Provisions' ? renderProvisions() : renderSuivi()}
      </div>
    </div>
  );
};

export default Budget;
