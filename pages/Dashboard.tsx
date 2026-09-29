
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { Project, Campaign, BudgetLine, BrandType, PlaqueName, Site, ServiceType, SocialPost, FixedExpense, User } from '../types';
import { db } from '../services/dataService';
import { computeDashboardStats } from '../services/dashboardStats';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { PLAQUES_STRUCTURE, BRANDS, BRAND_COLORS, SERVICE_COLORS, SOCIAL_STATUS_COLORS, hasSocialFeatures, allowedSitesFor } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import {
  TrendingUp,
  Wallet,
  Megaphone,
  Target,
  Calendar,
  Layers,
  Activity,
  ArrowRight,
  Globe,
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
  MapPin,
  Video,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Search,
  AlertTriangle,
  Gauge,
  Radio,
  Users,
  Briefcase,
  Send,
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Area
} from 'recharts';
import { useTheme } from '../contexts/ThemeContext';
import Select from '../components/Select';
import Avatar from '../components/Avatar';
import FloatingPanel from '../components/FloatingPanel';
import DateRangePicker, { toLocalIso, parseLocalDate, getPeriodRanges } from '../components/DateRangePicker';
import CollapsibleFilters from '../components/CollapsibleFilters';

// Les aides de date et le sélecteur de période vivent désormais dans
// components/DateRangePicker.tsx : la page Campagnes en a besoin aussi, et les
// raccourcis semestre y ont été ajoutés au passage (30/07/2026).


// --- COMPONENT: SITE CONTEXT PICKER ---
const ALL_PLAQUE_SITES = Object.values(PLAQUES_STRUCTURE).flat();
// `Alpine` retiré le 03/08/2026 : il n'existe AUCUNE ligne de budget « Alpine »
// (elles s'appellent Alpine-Clermont, Alpine-Vichy, Alpine-Le Puy, Alpine-Rodez),
// donc ce pseudo-site ne filtrait rien et faussait le budget affiché. Alpine étant
// réellement par site, on l'obtient en croisant le tag MARQUE Alpine avec le
// périmètre. Nissan reste ici : son enveloppe est bien une entité unique globale.
const SPECIAL_SITES: string[] = ['Nissan'];

interface SiteContextPickerProps {
  selected: string[];
  onChange: (v: string[]) => void;
  /**
   * Périmètre imposé, ou `null` s'il n'y en a pas. Pour un chef de site, le
   * sélecteur ne propose QUE ses concessions : il peut filtrer **entre** elles s'il
   * en a plusieurs, jamais en dehors. ⚠️ Ce n'est qu'un confort d'interface — le
   * serveur ne lui enverrait de toute façon rien d'autre (auth/siteScope.ts).
   */
  restrictTo?: string[] | null;
}
const SiteContextPicker: React.FC<SiteContextPickerProps> = ({ selected, onChange, restrictTo = null }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedPlaques, setExpandedPlaques] = useState<Set<string>>(new Set(Object.keys(PLAQUES_STRUCTURE)));
  const triggerRef = useRef<HTMLDivElement>(null);

  const toggle = (site: string) =>
    onChange(selected.includes(site) ? selected.filter(s => s !== site) : [...selected, site]);

  const togglePlaque = (plaqueSites: string[]) => {
    const allSelected = plaqueSites.every(s => selected.includes(s));
    if (allSelected) onChange(selected.filter(s => !plaqueSites.includes(s)));
    else onChange([...selected.filter(s => !plaqueSites.includes(s)), ...plaqueSites]);
  };

  const toggleExpandPlaque = (p: string) => {
    const next = new Set(expandedPlaques);
    next.has(p) ? next.delete(p) : next.add(p);
    setExpandedPlaques(next);
  };

  const selectAll = () => onChange(restrictTo ?? [...ALL_PLAQUE_SITES, ...SPECIAL_SITES]);
  const clearAll = () => onChange([]);

  const isAll = selected.length === 0;

  const triggerLabel = isAll
    ? 'Tout le réseau'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} sites`;

  const handleOpen = () => setOpen(v => !v);

  return (
    <div ref={triggerRef} className="relative">
      {/* Trigger */}
      <div className="flex flex-col">
        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Périmètre</span>
        <button
          onClick={handleOpen}
          className="flex items-center gap-1.5 text-xs font-bold text-bony-orange hover:text-bony-violet transition whitespace-nowrap"
        >
          {triggerLabel}
          <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Dropdown */}
      <FloatingPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} width={256} maxHeight={340} className="rounded-xl">
                <div className="p-2 border-b border-bony-border shrink-0">
                  <div className="flex items-center gap-2 bg-bony-dark border border-bony-border rounded-lg px-2 py-1.5">
                    <Search size={13} className="text-slate-500 shrink-0" />
                    <input
                      type="text" value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Rechercher un site…"
                      className="flex-1 bg-transparent text-xs text-bony-text outline-none placeholder-bony-muted"
                    />
                    {search && <button onClick={() => setSearch('')}><X size={12} className="text-slate-400" /></button>}
                  </div>
                </div>
                <div className="flex gap-1 px-2 py-1.5 border-b border-bony-border shrink-0">
                  <button onClick={clearAll} className={`flex-1 text-[10px] font-bold py-1 rounded transition ${isAll ? 'bg-bony-orange/20 text-bony-orange border border-bony-orange/40' : 'text-slate-500 hover:text-bony-text hover:bg-white/5'}`}>
                    Tout le réseau
                  </button>
                  <button onClick={selectAll} className="flex-1 text-[10px] font-bold py-1 rounded text-slate-500 hover:text-bony-text hover:bg-white/5 transition">
                    Tout sélectionner
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
                  {Object.entries(PLAQUES_STRUCTURE).map(([plaqueName, sitesBrutes]) => {
                    // Périmètre imposé : on retire d'emblée les concessions interdites,
                    // et une plaque qui n'en contient plus aucune disparaît.
                    const sites = restrictTo ? sitesBrutes.filter(s => restrictTo.includes(s)) : sitesBrutes;
                    if (sites.length === 0) return null;
                    const filtered = sites.filter(s => !search || s.toLowerCase().includes(search.toLowerCase()));
                    if (search && filtered.length === 0) return null;
                    const expanded = expandedPlaques.has(plaqueName);
                    const allSelected = sites.every(s => selected.includes(s));
                    const someSelected = sites.some(s => selected.includes(s));
                    return (
                      <div key={plaqueName}>
                        <div className="flex items-center px-2 py-1">
                          <button onClick={() => toggleExpandPlaque(plaqueName)}
                            className="flex items-center gap-1 flex-1 min-w-0 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-bony-text transition">
                            <ChevronRight size={11} className={`shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                            <span className="truncate min-w-0">{plaqueName}</span>
                          </button>
                          <button onClick={() => togglePlaque(sites as string[])}
                            className={`w-4 h-4 rounded border flex items-center justify-center transition ${
                              allSelected ? 'bg-bony-orange border-bony-orange' : someSelected ? 'bg-bony-orange/30 border-bony-orange/50' : 'border-bony-border hover:border-bony-orange/50'
                            }`}>
                            {(allSelected || someSelected) && <Check size={10} className="text-white" />}
                          </button>
                        </div>
                        {(expanded || search) && (search ? filtered : sites).map(site => (
                          <button key={site} onClick={() => toggle(site)}
                            className="w-full flex items-center justify-between gap-2 min-w-0 pl-6 pr-2 py-1.5 text-xs hover:bg-white/5 transition">
                            <span className={`truncate min-w-0 ${selected.includes(site) ? 'text-bony-text font-bold' : 'text-slate-500'}`}>{site}</span>
                            {selected.includes(site) && <Check size={12} className="text-bony-orange shrink-0" />}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                  <div>
                    <div className="px-2 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Entités Spécifiques</div>
                    {/* Nissan est une enveloppe GLOBALE, ventilée sur aucun site : elle
                        n'est jamais proposée à un chef de site (décision de Théo). */}
                    {(restrictTo ? [] : SPECIAL_SITES).filter(s => !search || s.toLowerCase().includes(search.toLowerCase())).map(site => (
                      <button key={site} onClick={() => toggle(site)}
                        className="w-full flex items-center justify-between gap-2 min-w-0 pl-6 pr-2 py-1.5 text-xs hover:bg-white/5 transition">
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

// --- COMPONENT: BRAND PICKER ---
const BRAND_CHIPS: BrandType[] = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize'];
interface BrandPickerProps { selected: BrandType[]; onChange: (v: BrandType[]) => void; }
const BrandPicker: React.FC<BrandPickerProps> = ({ selected, onChange }) => {
  const isAll = selected.length === 0;
  const toggle = (b: BrandType) =>
    onChange(selected.includes(b) ? selected.filter(x => x !== b) : [...selected, b]);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Marque</span>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onChange([])}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
            isAll
              ? 'bg-bony-gradient border-transparent text-white shadow'
              : 'bg-transparent border-bony-border text-slate-500 hover:border-bony-orange/50 dark:hover:text-white hover:text-slate-900'
          }`}
        >
          Toutes
        </button>
        {BRAND_CHIPS.map(b => {
          const active = selected.includes(b);
          return (
            <button
              key={b}
              onClick={() => toggle(b)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                active ? `${BRAND_COLORS[b]} scale-105 shadow` : 'bg-transparent border-bony-border text-slate-500 hover:border-bony-orange/50 dark:hover:text-white hover:text-slate-900'
              }`}
            >
              {b}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// --- COMPONENT: SERVICE PICKER ---
const SERVICE_CHIPS: ServiceType[] = ['VN', 'VO', 'APV', 'PR'];
interface ServicePickerProps { selected: ServiceType[]; onChange: (v: ServiceType[]) => void; }
const ServicePicker: React.FC<ServicePickerProps> = ({ selected, onChange }) => {
  const isAll = selected.length === 0;
  const toggle = (s: ServiceType) =>
    onChange(selected.includes(s) ? selected.filter(x => x !== s) : [...selected, s]);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Service</span>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onChange([])}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
            isAll
              ? 'bg-bony-gradient border-transparent text-white shadow'
              : 'bg-transparent border-bony-border text-slate-500 hover:border-bony-orange/50 dark:hover:text-white hover:text-slate-900'
          }`}
        >
          Tous
        </button>
        {SERVICE_CHIPS.map(s => {
          const active = selected.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggle(s)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                active ? `${SERVICE_COLORS[s]} scale-105 shadow` : 'bg-transparent border-bony-border text-slate-500 hover:border-bony-orange/50 dark:hover:text-white hover:text-slate-900'
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
};

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
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  // Pour afficher les noms et avatars dans « Charge de l'Équipe ».
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // --- FILTER STATES ---
  const { user } = useAuth();

  // Default to current year (Jan 1 to Dec 31)
  const currentYear = new Date().getFullYear();
  const [dateStart, setDateStart] = useSessionState<string>('dashboard_dateStart', `${currentYear}-01-01`);
  const [dateEnd, setDateEnd] = useSessionState<string>('dashboard_dateEnd', `${currentYear}-12-31`);

  const [filterContexts, setFilterContexts] = useSessionState<string[]>('dashboard_filterContexts', []);
  const [filterBrands, setFilterBrands] = useSessionState<BrandType[]>('dashboard_filterBrands', []);
  const [filterServices, setFilterServices] = useSessionState<ServiceType[]>('dashboard_filterServices', []);
  const [filterProPlus, setFilterProPlus] = useSessionState<'all' | 'pro' | 'standard'>('dashboard_filterProPlus', 'all');

  const scrollRef = useScrollRestore('dashboard', !loading);

  // `silent` : rafraîchissement temps réel (aucun squelette de chargement, la
  // page reste affichée pendant le refetch).
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [pData, cData, bData, sData, feData, uData] = await Promise.all([
      db.getProjects(),
      db.getCampaigns(),
      db.getBudgets(),
      db.getSocialPosts(),
      db.getFixedExpenses(),
      db.getUsers()
    ]);
    setProjects(pData);
    setCampaigns(cData);
    setBudgets(bData);
    setSocialPosts(sData);
    setFixedExpenses(feData);
    setUsers(uData);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Temps réel : le Dashboard agrège 5 ressources, il se rafraîchit dès que
  // l'une d'elles bouge chez un autre utilisateur.
  useRealtimeSync(
    [
      ...RT_EVENTS.projects,
      ...RT_EVENTS.campaigns,
      ...RT_EVENTS.budget,
      ...RT_EVENTS.social,
      ...RT_EVENTS.fixedExpenses
    ],
    () => load(true)
  );

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
  // Calcul extrait dans services/dashboardStats.ts (source unique, partagée avec
  // les widgets de l'interface v2). Mêmes entrées, mêmes dépendances.
  const stats = useMemo(() => computeDashboardStats({
    projects, budgets, socialPosts, fixedExpenses,
    dateStart, dateEnd, filterContexts, filterBrands, filterServices, filterProPlus
  }), [projects, budgets, socialPosts, fixedExpenses, dateStart, dateEnd, filterContexts, filterBrands, filterServices, filterProPlus]);

  // --- RENDER HELPERS ---
  const formatCurrency = (val: number) => val.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  const burnRate = stats.totalForecast > 0 ? (stats.totalActual / stats.totalForecast) * 100 : 0;
  const remaining = stats.totalForecast - stats.totalActual;
  // Écart en POINTS entre l'engagé À DATE et le temps écoulé. Positif = on engage
  // plus vite que le calendrier ; négatif = on sous-consomme. Comparer l'engagé de
  // toute la période (`pctEngagePeriode`) au temps écoulé serait faux — voir le
  // commentaire du bloc « Rythme de consommation » dans l'agrégation.
  const ecartRythme = stats.pctEngageADate - stats.pctTempsEcoule;

  // Blocs réservés à l'équipe marketing, masqués au chef de site (demande de Théo) :
  // performance des campagnes, top consommateurs et charge de l'équipe. Les deux
  // premiers supposent de comparer les concessions entre elles, le troisième nomme
  // des collègues avec qui il n'a aucune interaction.
  const montrerBlocsMarketing = hasSocialFeatures(user?.role);
  // Périmètre imposé (chef de site) ou `null`. Borne le sélecteur de périmètre.
  const perimetreImpose = allowedSitesFor(user);

  // --- Résumé des filtres, pour la barre repliée sur mobile ---
  // Un filtre « actif » = un filtre qui restreint réellement les chiffres. Les
  // dates n'en font PAS partie : elles valent toujours quelque chose, les compter
  // afficherait « 1 filtre » en permanence et la pastille ne voudrait plus rien dire.
  const filtresActifs =
    (filterContexts.length > 0 ? 1 : 0) +
    (filterBrands.length > 0 ? 1 : 0) +
    (filterServices.length > 0 ? 1 : 0) +
    (filterProPlus !== 'all' ? 1 : 0);

  // Résumé lisible d'un coup d'œil : la période d'abord (c'est ce qui cadre tous
  // les montants), puis chaque filtre restrictif. On abrège au-delà de deux
  // valeurs pour tenir sur une ligne à 320 px.
  const abrege = (liste: string[]) =>
    liste.length <= 2 ? liste.join(', ') : `${liste[0]} +${liste.length - 1}`;
  const resumeFiltres = [
    dateStart && dateEnd
      ? (dateStart.slice(0, 4) === dateEnd.slice(0, 4) && dateStart.endsWith('-01-01') && dateEnd.endsWith('-12-31')
          ? dateStart.slice(0, 4)
          : `${dateStart.slice(8, 10)}/${dateStart.slice(5, 7)} → ${dateEnd.slice(8, 10)}/${dateEnd.slice(5, 7)}`)
      : null,
    filterContexts.length > 0 ? abrege(filterContexts) : 'Tout le réseau',
    filterBrands.length > 0 ? abrege(filterBrands) : null,
    filterServices.length > 0 ? abrege(filterServices) : null,
    filterProPlus === 'pro' ? 'PRO+ seul' : filterProPlus === 'standard' ? 'Sans PRO+' : null,
  ].filter(Boolean).join(' · ');

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
    <div className="flex flex-col h-full overflow-hidden animate-fade-in font-sans">
      
      {/* --- HEADER: PILOTAGE BAR --- */}
      <div className="px-6 py-5 glass-strong border-b border-bony-border shrink-0 z-20 shadow-md transition-colors">
         <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
             <div>
                 <h2 className="text-lg md:text-2xl text-bony-text font-title mb-1 flex items-center gap-2">
                     <Activity className="text-bony-orange"/> Cockpit Général
                 </h2>
                 <p className="text-xs text-bony-muted font-sans tracking-wide">
                     VUE CONSOLIDÉE ET ANALYSE DE LA PERFORMANCE
                 </p>
             </div>

             {/* FILTERS — repliés derrière une barre fine sur mobile (voir
                 components/CollapsibleFilters.tsx) : ces six blocs empilés
                 occupaient tout l'écran avant la première carte. Rendu desktop
                 strictement inchangé. */}
             <CollapsibleFilters
               storageKey="dashboard"
               activeCount={filtresActifs}
               summary={resumeFiltres}
             >
             <div className="flex flex-wrap items-center gap-3 bg-slate-100 dark:bg-black/30 px-3 py-2.5 rounded-xl border border-bony-border/50">
                 {/* 1. Date Range */}
                 <DateRangePicker
                   startDate={dateStart}
                   endDate={dateEnd}
                   onStartChange={setDateStart}
                   onEndChange={setDateEnd}
                 />
                 <div className="w-px h-6 bg-bony-border hidden sm:block" />
                 {/* 2. Périmètre multi-select */}
                 <SiteContextPicker selected={filterContexts} onChange={setFilterContexts} restrictTo={perimetreImpose} />
                 <div className="w-px h-6 bg-bony-border hidden sm:block" />
                 {/* 3. Marques chips */}
                 <BrandPicker selected={filterBrands} onChange={setFilterBrands} />
                 <div className="w-px h-6 bg-bony-border hidden sm:block" />
                 {/* 4. Services chips */}
                 <ServicePicker selected={filterServices} onChange={setFilterServices} />
                 <div className="w-px h-6 bg-bony-border hidden sm:block" />
                 {/* 5. Filtre PRO+ (B2B) — 3 états */}
                 <div className="flex flex-col gap-1">
                     <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">PRO+ (B2B)</span>
                     <Select
                         value={filterProPlus}
                         onChange={(v) => setFilterProPlus(v as 'all' | 'pro' | 'standard')}
                         size="sm"
                         options={[
                             { value: 'all', label: 'Tout' },
                             { value: 'standard', label: 'Sans PRO+' },
                             { value: 'pro', label: 'PRO+ uniquement' },
                         ]}
                     />
                 </div>
             </div>
             </CollapsibleFilters>
         </div>
      </div>

      {/* --- CONTENT SCROLL AREA --- */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-6 space-y-6 pb-20">
          
          {/* 1. KPI CARDS */}
          {/* 6 cartes : 3 par ligne en lg plutôt que 6 serrées — lisibilité d'abord. */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* BUDGET */}
              <div className="gx-card p-5 relative overflow-hidden group hover:border-bony-orange/30 transition-all">
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
              <div className="gx-card p-5 relative overflow-hidden group hover:border-bony-blue/30 transition-all">
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
              <div className="gx-card p-5 relative overflow-hidden group hover:border-slate-300 dark:hover:border-white/20 transition-all">
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
              <div className="gx-card p-5 relative overflow-hidden group hover:border-bony-violet/30 transition-all">
                  <div className="flex justify-between items-start">
                      <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Campagnes Programmées</p>
                          <h3 className="text-3xl font-title text-bony-text">{stats.activeCampaignsCount}</h3>
                      </div>
                      <div className="p-2 bg-bony-violet/10 rounded-lg text-bony-violet">
                          <Megaphone size={20} />
                      </div>
                  </div>
                  <div className="mt-4 text-xs text-slate-400">
                      Envois SMS / E-mail au statut « programmé ».
                  </div>
              </div>

              {/* PROJETS EN RETARD — échéance dépassée et travail inachevé */}
              <div className={`gx-card p-5 relative overflow-hidden group transition-all ${stats.projetsEnRetard.length > 0 ? 'hover:border-red-500/40' : 'hover:border-emerald-500/30'}`}>
                  <div className="flex justify-between items-start">
                      <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Projets en Retard</p>
                          <h3 className={`text-3xl font-title ${stats.projetsEnRetard.length > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                              {stats.projetsEnRetard.length}
                          </h3>
                      </div>
                      <div className={`p-2 rounded-lg ${stats.projetsEnRetard.length > 0 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                          <AlertTriangle size={20} />
                      </div>
                  </div>
                  <div className="mt-4 text-xs text-slate-400">
                      Échéance dépassée, avancement &lt; 100 %.
                  </div>
              </div>

              {/* RYTHME DE CONSOMMATION — le % consommé ne dit rien seul ; comparé au
                  % de la période écoulée, il devient une alerte exploitable. */}
              <div className="gx-card p-5 relative overflow-hidden group hover:border-bony-blue/30 transition-all">
                  <div className="flex justify-between items-start">
                      <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Avance / Retard de Budget</p>
                          {/* On affiche l'ÉCART en points, pas deux pourcentages côte à
                              côte : « 10 % / 58 % » demandait au lecteur de faire la
                              soustraction lui-même et n'était pas compris (retour de
                              Théo, 30/07/2026). L'écart, lui, se lit directement. */}
                          <h3 className={`text-2xl font-title ${ecartRythme > 10 ? 'text-red-500' : (ecartRythme < -10 ? 'text-amber-500' : 'text-emerald-500')}`}>
                              {ecartRythme > 0 ? '+' : ''}{ecartRythme} <span className="text-sm text-slate-400">points</span>
                          </h3>
                      </div>
                      <div className="p-2 bg-bony-blue/10 rounded-lg text-bony-blue">
                          <Gauge size={20} />
                      </div>
                  </div>
                  {/* Deux barres superposées : ce qui est engagé À DATE, ce qui est
                      écoulé. La comparaison visuelle vaut mieux qu'une explication.
                      « Budget dépensé » a été renommé : cette barre n'a jamais montré
                      du dépensé, et elle montre maintenant explicitement l'engagé à
                      date. « Année écoulée » → « Période écoulée » : le libellé était
                      faux dès qu'on filtrait sur un semestre ou un trimestre. */}
                  <div className="mt-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                          <span className="text-[9px] text-slate-500 w-20 shrink-0">Engagé à date</span>
                          <div className="flex-1 h-2 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-bony-orange" style={{ width: `${Math.min(stats.pctEngageADate, 100)}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-bony-text w-9 text-right shrink-0">{stats.pctEngageADate} %</span>
                      </div>
                      <div className="flex items-center gap-2">
                          <span className="text-[9px] text-slate-500 w-20 shrink-0">Période écoulée</span>
                          <div className="flex-1 h-2 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-slate-400 dark:bg-slate-500" style={{ width: `${stats.pctTempsEcoule}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 w-9 text-right shrink-0">{stats.pctTempsEcoule} %</span>
                      </div>
                      {/* Sans barre, volontairement : l'engagé sur toute la période est
                          une INFORMATION (le récurrent de l'année est déjà saisi), pas
                          un terme de la comparaison ci-dessus. Lui donner une barre
                          inviterait à la comparer à « Période écoulée », c'est-à-dire
                          exactement l'erreur que ce correctif supprime. */}
                      <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-[9px] text-slate-500 shrink-0">Engagé sur la période</span>
                          <span className="text-[10px] font-bold text-slate-500 tabular-nums">{stats.pctEngagePeriode} %</span>
                      </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-400">
                      {ecartRythme > 10
                        ? 'Vous engagez plus vite que le temps ne passe : le budget risque de manquer avant la fin de la période.'
                        : ecartRythme < -10
                        ? 'Vous engagez moins vite que le temps ne passe : du budget risque de rester non engagé.'
                        : 'Engagements au rythme du calendrier.'}
                  </div>
              </div>
          </div>

          {/* 2. CHARTS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* LEFT: TREND (2/3) */}
              <div className="lg:col-span-2 gx-card p-5 flex flex-col h-[400px]">
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
              <div className="gx-card p-5 flex flex-col">
                   <h3 className="text-sm font-bold text-bony-text uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Target size={16} className="text-bony-violet"/> Mix Activité
                   </h3>
                   {stats.serviceChartData.length === 0 ? (
                       <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic">Aucune donnée</div>
                   ) : (() => {
                       const total = stats.serviceChartData.reduce((s, d) => s + d.value, 0);
                       return (
                           <div className="flex items-center gap-2 mt-1">
                               {/* Camembert */}
                               <div style={{ width: '60%' }}>
                                   <ResponsiveContainer width="100%" height={220}>
                                       <PieChart>
                                           <Pie
                                               data={stats.serviceChartData}
                                               cx="50%"
                                               cy="50%"
                                               outerRadius={90}
                                               dataKey="value"
                                               stroke="none"
                                               labelLine={false}
                                               label={({ percent, x, y }: { percent: number; x: number; y: number }) => {
                                                   if (percent < 0.05) return null;
                                                   return (
                                                       <text
                                                           x={x} y={y}
                                                           textAnchor="middle"
                                                           dominantBaseline="central"
                                                           style={{ fontWeight: 600, fontSize: 13, fill: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                                                       >
                                                           {`${Math.round(percent * 100)}%`}
                                                       </text>
                                                   );
                                               }}
                                           >
                                               {stats.serviceChartData.map(entry => (
                                                   <Cell key={entry.name} fill={PIE_COLORS[entry.name] || COLORS.slate} />
                                               ))}
                                           </Pie>
                                           <Tooltip
                                               contentStyle={{ background: theme === 'dark' ? '#1e1e1e' : '#ffffff', border: '1px solid', borderColor: theme === 'dark' ? '#333' : '#e2e8f0', color: theme === 'dark' ? '#e2e8f0' : '#0f172a', borderRadius: '8px' }}
                                               labelStyle={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a', fontWeight: 600 }}
                                               itemStyle={{ color: theme === 'dark' ? '#cbd5e1' : '#334155' }}
                                               formatter={(value: number) => formatCurrency(value)}
                                           />
                                       </PieChart>
                                   </ResponsiveContainer>
                               </div>
                               {/* Légende custom */}
                               <div className="flex flex-col gap-2" style={{ width: '40%' }}>
                                   {stats.serviceChartData.map(d => {
                                       const pct = total > 0 ? Math.round(d.value / total * 100) : 0;
                                       return (
                                           <div key={d.name} className="flex items-start gap-1.5">
                                               <span className="mt-0.5 shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[d.name] || COLORS.slate }} />
                                               <div className="min-w-0">
                                                   <span className="text-[13px] text-bony-text">{d.name}</span>
                                                   <div className="text-[12px]">
                                                       <span className="font-semibold text-bony-text">{formatCurrency(d.value)}</span>
                                                       {' '}
                                                       <span className="text-bony-muted">{pct}%</span>
                                                   </div>
                                               </div>
                                           </div>
                                       );
                                   })}
                               </div>
                           </div>
                       );
                   })()}
              </div>
          </div>

          {/* 3. DETAILS ROW (Upcoming Deadlines & Social Posts) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:h-[400px]">
              
              {/* LEFT: PROJECT DEADLINES */}
              {/* min-h-0 + overflow-hidden INDISPENSABLES : un élément de grille a
                  min-height:auto, il refuse donc de descendre sous la hauteur de son
                  contenu et déborde de la rangée de 400px. Le débordement tombait
                  dans du vide avant l'ajout des sections de pilotage — il recouvrait
                  ensuite la suivante de plus de 200 px (constaté le 30/07/2026). */}
              <div className="gx-card p-5 flex flex-col h-full min-h-0 overflow-hidden">
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
                                    <span className="text-[9px] text-slate-500 font-bold uppercase">{parseLocalDate(p.endDate).toLocaleString('fr-FR', {month:'short'})}</span>
                                    <span className="text-sm font-bold text-bony-text leading-none">{parseLocalDate(p.endDate).getDate()}</span>
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
              {/* min-h-0 + overflow-hidden INDISPENSABLES : un élément de grille a
                  min-height:auto, il refuse donc de descendre sous la hauteur de son
                  contenu et déborde de la rangée de 400px. Le débordement tombait
                  dans du vide avant l'ajout des sections de pilotage — il recouvrait
                  ensuite la suivante de plus de 200 px (constaté le 30/07/2026). */}
              <div className="gx-card p-5 flex flex-col h-full min-h-0 overflow-hidden">
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

          {/* ═══ 4. PILOTAGE PROJETS ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Écart prévu / réalisé — trié par écart absolu décroissant */}
              <div className="gx-card p-5">
                  <h3 className="text-sm font-bold text-bony-text uppercase tracking-wider mb-1 flex items-center gap-2">
                      <Briefcase size={16} className="text-bony-orange"/> Écart Prévu / Réalisé
                  </h3>
                  <p className="text-[10px] text-bony-muted mb-4">
                      Projets dont un budget prévisionnel a été saisi. Avancement moyen des projets actifs : <strong className="text-bony-text">{stats.avancementMoyen} %</strong>
                  </p>
                  {stats.ecartsTop.length > 0 ? (
                      <div className="space-y-3">
                          {stats.ecartsTop.map(e => {
                              const max = Math.max(e.prevu, e.realise) || 1;
                              return (
                                  <div key={e.nom}>
                                      <div className="flex items-center justify-between gap-2 mb-1">
                                          <span className="text-xs font-semibold text-bony-text truncate min-w-0" title={e.nom}>{e.nom}</span>
                                          <span className={`text-[10px] font-bold shrink-0 ${e.ecart > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                              {e.ecart > 0 ? '+' : ''}{e.ecartPct} %
                                          </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                          <div className="flex-1 h-2 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                                              <div className="h-full bg-slate-400 dark:bg-slate-500" style={{ width: `${(e.prevu / max) * 100}%` }} />
                                          </div>
                                          <span className="text-[9px] text-slate-500 w-16 text-right shrink-0">{formatCurrency(e.prevu)}</span>
                                      </div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                          <div className="flex-1 h-2 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                                              <div className={`h-full ${e.ecart > 0 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${(e.realise / max) * 100}%` }} />
                                          </div>
                                          <span className="text-[9px] text-bony-text font-bold w-16 text-right shrink-0">{formatCurrency(e.realise)}</span>
                                      </div>
                                  </div>
                              );
                          })}
                          <p className="text-[9px] text-bony-muted pt-1">Barre grise : prévu · barre colorée : réalisé</p>
                      </div>
                  ) : (
                      <div className="text-center text-slate-600 py-10 text-sm italic border border-dashed border-bony-border rounded-xl">
                          Aucun budget prévisionnel saisi sur les projets du périmètre.
                      </div>
                  )}
              </div>

              {/* Projets en retard — cliquables vers la fiche projet */}
              <div className="gx-card p-5">
                  <h3 className="text-sm font-bold text-bony-text uppercase tracking-wider mb-1 flex items-center gap-2">
                      <AlertTriangle size={16} className="text-red-500"/> Projets en Retard
                  </h3>
                  <p className="text-[10px] text-bony-muted mb-4">Échéance dépassée et avancement incomplet. Triés du plus ancien retard.</p>
                  {stats.projetsEnRetard.length > 0 ? (
                      <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                          {stats.projetsEnRetard.map(p => (
                              <button
                                  key={p.id}
                                  onClick={() => handleNavigateToProject(p.id)}
                                  className="w-full text-left flex items-center gap-3 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20 hover:bg-red-500/10 transition-colors min-h-[44px]"
                              >
                                  <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-bony-text truncate">{p.nom}</p>
                                      <p className="text-[10px] text-slate-500 truncate">{p.site} · échéance {p.fin.split('-').reverse().join('/')}</p>
                                  </div>
                                  <div className="shrink-0 text-right">
                                      <span className="text-xs font-bold text-red-500">{p.avancement} %</span>
                                      <p className="text-[9px] text-slate-500">avancé</p>
                                  </div>
                              </button>
                          ))}
                      </div>
                  ) : (
                      <div className="text-center text-emerald-600 dark:text-emerald-500 py-10 text-sm italic border border-dashed border-emerald-500/30 rounded-xl">
                          Aucun projet en retard. 👌
                      </div>
                  )}
              </div>
          </div>

          {/* ═══ 5. PERFORMANCE DES CAMPAGNES ═══
              Masqué au chef de site : les campagnes sont un outil marketing, et il
              n'a pas accès à la rubrique Campagnes (demande de Théo). */}
          {montrerBlocsMarketing && (
          <div className="gx-card p-5">
              <h3 className="text-sm font-bold text-bony-text uppercase tracking-wider mb-1 flex items-center gap-2">
                  <Send size={16} className="text-bony-blue"/> Performance des Campagnes
              </h3>
              <p className="text-[10px] text-bony-muted mb-4">
                  Envois SMS et e-mail du périmètre. <strong>Taux pondérés par la volumétrie</strong> — une moyenne simple des taux serait faussée par les écarts de volume entre envois.
              </p>
              {stats.perfGlobale.volume > 0 ? (
                  <>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
                          {[
                              { label: 'Contacts touchés', valeur: stats.perfGlobale.volume.toLocaleString('fr-FR'), sous: `${stats.perfGlobale.envois} envois` },
                              { label: "Taux d'ouverture", valeur: `${stats.perfGlobale.ouverture} %`, sous: 'pondéré' },
                              { label: 'Taux de clic', valeur: `${stats.perfGlobale.clic} %`, sous: 'pondéré' },
                              { label: 'Coût / contact', valeur: `${stats.perfGlobale.coutParContact.toFixed(3)} €`, sous: formatCurrency(stats.perfGlobale.cout) },
                              { label: 'NPAI', valeur: `${stats.perfGlobale.npai} %`, sous: 'adresses invalides' },
                              { label: 'Désabonnements', valeur: `${stats.perfGlobale.stop} %`, sous: 'STOP / désinscrits' },
                          ].map(k => (
                              <div key={k.label} className="bg-slate-100 dark:bg-black/20 rounded-lg p-3 border border-bony-border">
                                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 truncate" title={k.label}>{k.label}</p>
                                  <p className="text-lg font-title text-bony-text">{k.valeur}</p>
                                  <p className="text-[9px] text-slate-500 truncate">{k.sous}</p>
                              </div>
                          ))}
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-xs min-w-[520px]">
                              <thead>
                                  <tr className="text-[9px] font-bold text-slate-500 uppercase tracking-widest border-b border-bony-border">
                                      <th className="text-left py-2">Canal</th><th className="text-right py-2">Envois</th>
                                      <th className="text-right py-2">Contacts</th><th className="text-right py-2">Ouverture</th>
                                      <th className="text-right py-2">Clic</th><th className="text-right py-2">Coût</th>
                                      <th className="text-right py-2">Coût / contact</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {stats.perfCanal.map(c => (
                                      <tr key={c.canal} className="border-b border-bony-border/50">
                                          <td className="py-2 font-semibold text-bony-text">{c.canal}</td>
                                          <td className="py-2 text-right text-slate-500">{c.envois}</td>
                                          <td className="py-2 text-right text-bony-text">{c.volume.toLocaleString('fr-FR')}</td>
                                          <td className="py-2 text-right text-bony-text">{c.ouverture} %</td>
                                          <td className="py-2 text-right text-bony-text">{c.clic} %</td>
                                          <td className="py-2 text-right text-slate-500">{formatCurrency(c.cout)}</td>
                                          <td className="py-2 text-right font-bold text-bony-orange">{c.coutParContact.toFixed(3)} €</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  </>
              ) : (
                  <div className="text-center text-slate-600 py-10 text-sm italic border border-dashed border-bony-border rounded-xl">
                      Aucune volumétrie saisie. Renseignez volumétrie et taux dans les tâches SMS / E-mail des projets pour activer ces indicateurs.
                  </div>
              )}
          </div>
          )}

          {/* ═══ 6. OÙ PART L'ARGENT, ET QUI PORTE LA CHARGE ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Budget par canal */}
              <div className="gx-card p-5">
                  <h3 className="text-sm font-bold text-bony-text uppercase tracking-wider mb-1 flex items-center gap-2">
                      <Radio size={16} className="text-bony-violet"/> Budget par Canal
                  </h3>
                  <p className="text-[10px] text-bony-muted mb-4">Coûts des tâches, par canal de diffusion.</p>
                  {stats.budgetParCanal.length > 0 ? (
                      <div className="space-y-2.5">
                          {stats.budgetParCanal.map((c, i) => {
                              const max = stats.budgetParCanal[0].value || 1;
                              return (
                                  <div key={c.name}>
                                      <div className="flex justify-between text-xs mb-1">
                                          <span className="font-semibold text-bony-text truncate min-w-0">{c.name}</span>
                                          <span className="text-slate-500 shrink-0 ml-2">{formatCurrency(c.value)}</span>
                                      </div>
                                      <div className="h-2 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                                          <div className="h-full bg-bony-gradient" style={{ width: `${(c.value / max) * 100}%`, opacity: 1 - i * 0.09 }} />
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  ) : (
                      <div className="text-center text-slate-600 py-10 text-sm italic border border-dashed border-bony-border rounded-xl">
                          Aucun canal renseigné sur les tâches.
                      </div>
                  )}
              </div>

              {/* Top sites + top prestataires — masqué au chef de site : classer les
                  concessions entre elles suppose de voir les autres. */}
              {montrerBlocsMarketing && (
              <div className="gx-card p-5">
                  <h3 className="text-sm font-bold text-bony-text uppercase tracking-wider mb-1 flex items-center gap-2">
                      <MapPin size={16} className="text-bony-orange"/> Top Consommateurs
                  </h3>
                  <p className="text-[10px] text-bony-muted mb-4">Sites et prestataires, montants ventilés.</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Sites</p>
                  <div className="space-y-1.5 mb-4">
                      {stats.topSites.length > 0 ? stats.topSites.map(s => (
                          <div key={s.name} className="flex justify-between text-xs">
                              <span className="font-semibold text-bony-text truncate min-w-0">{s.name}</span>
                              <span className="text-slate-500 shrink-0 ml-2">{formatCurrency(s.value)}</span>
                          </div>
                      )) : <p className="text-xs text-slate-500 italic">Aucune donnée.</p>}
                  </div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Prestataires</p>
                  <div className="space-y-1.5">
                      {stats.topPrestataires.length > 0 ? stats.topPrestataires.map(p => (
                          <div key={p.name} className="flex justify-between text-xs">
                              <span className="font-semibold text-bony-text truncate min-w-0">{p.name} <span className="text-slate-500 font-normal">({p.taches})</span></span>
                              <span className="text-slate-500 shrink-0 ml-2">{formatCurrency(p.value)}</span>
                          </div>
                      )) : <p className="text-xs text-slate-500 italic">Aucun prestataire renseigné sur les tâches.</p>}
                  </div>
              </div>
              )}

              {/* Charge par collaborateur — masqué au chef de site : il nomme les
                  membres de l'équipe marketing, avec qui il n'a aucune interaction.
                  Et sa liste d'utilisateurs est de toute façon réduite à lui-même. */}
              {montrerBlocsMarketing && (
              <div className="gx-card p-5">
                  <h3 className="text-sm font-bold text-bony-text uppercase tracking-wider mb-1 flex items-center gap-2">
                      <Users size={16} className="text-bony-blue"/> Charge de l'Équipe
                  </h3>
                  <p className="text-[10px] text-bony-muted mb-4">Tâches encore ouvertes (à faire ou en cours), par personne.</p>
                  {stats.chargeEquipe.length > 0 ? (
                      <div className="space-y-2.5">
                          {stats.chargeEquipe.map(c => {
                              const u = users.find(x => x.id === c.userId);
                              const max = stats.chargeEquipe[0].taches || 1;
                              return (
                                  <div key={c.userId} className="flex items-center gap-2.5">
                                      <Avatar userId={c.userId} name={u?.name || '?'} color={u?.avatarColor} size={26} />
                                      <div className="flex-1 min-w-0">
                                          <p className="text-xs font-semibold text-bony-text truncate">{u?.name || 'Utilisateur inconnu'}</p>
                                          <div className="h-1.5 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden mt-1">
                                              <div className="h-full bg-bony-blue" style={{ width: `${(c.taches / max) * 100}%` }} />
                                          </div>
                                      </div>
                                      <span className="text-xs font-bold text-bony-text shrink-0">{c.taches}</span>
                                  </div>
                              );
                          })}
                      </div>
                  ) : (
                      <div className="text-center text-slate-600 py-10 text-sm italic border border-dashed border-bony-border rounded-xl">
                          Aucune tâche ouverte assignée.
                      </div>
                  )}
              </div>
              )}
          </div>

      </div>
    </div>
  );
};

export default Dashboard;
