
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { Project, Campaign, BudgetLine, BrandType, PlaqueName, Site, ServiceType, SocialPost } from '../types';
import { db } from '../services/dataService';
import { PLAQUES_STRUCTURE, BRANDS, BRAND_COLORS, SERVICE_COLORS, SOCIAL_STATUS_COLORS } from '../constants';
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
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Area
} from 'recharts';
import { useTheme } from '../contexts/ThemeContext';

// --- DATE HELPERS ---
const toLocalIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatDateBtn = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getPeriodRanges = () => {
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth();
  const day = now.getDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  const mon = new Date(now); mon.setDate(now.getDate() + monOffset);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const q = Math.floor(mo / 3);
  const prevQ = q === 0 ? 3 : q - 1;
  const prevQYear = q === 0 ? y - 1 : y;
  return {
    today:       { start: toLocalIso(now), end: toLocalIso(now) },
    week:        { start: toLocalIso(mon), end: toLocalIso(sun) },
    month:       { start: toLocalIso(new Date(y, mo, 1)), end: toLocalIso(new Date(y, mo + 1, 0)) },
    quarter:     { start: toLocalIso(new Date(y, q * 3, 1)), end: toLocalIso(new Date(y, q * 3 + 3, 0)) },
    prevQuarter: { start: toLocalIso(new Date(prevQYear, prevQ * 3, 1)), end: toLocalIso(new Date(prevQYear, prevQ * 3 + 3, 0)) },
    year:        { start: `${y}-01-01`, end: `${y}-12-31` },
    prevYear:    { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` },
  };
};

// --- COMPONENT: DATE RANGE PICKER ---
interface DateRangePickerProps {
  startDate: string; endDate: string;
  onStartChange: (v: string) => void; onEndChange: (v: string) => void;
}
const DateRangePicker: React.FC<DateRangePickerProps> = ({ startDate, endDate, onStartChange, onEndChange }) => {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, left: rect.left });
    }
    setOpen(v => !v);
    setCustomMode(false);
  };

  const close = () => { setOpen(false); setCustomMode(false); };

  const shortcuts = [
    { label: "Aujourd'hui",         apply: () => { const r = getPeriodRanges(); onStartChange(r.today.start);       onEndChange(r.today.end);       close(); } },
    { label: 'Cette semaine',        apply: () => { const r = getPeriodRanges(); onStartChange(r.week.start);        onEndChange(r.week.end);        close(); } },
    { label: 'Ce mois',              apply: () => { const r = getPeriodRanges(); onStartChange(r.month.start);       onEndChange(r.month.end);       close(); } },
    { label: 'Ce trimestre',         apply: () => { const r = getPeriodRanges(); onStartChange(r.quarter.start);     onEndChange(r.quarter.end);     close(); } },
    { label: 'Le trimestre dernier', apply: () => { const r = getPeriodRanges(); onStartChange(r.prevQuarter.start); onEndChange(r.prevQuarter.end); close(); } },
    { label: 'Cette année',          apply: () => { const r = getPeriodRanges(); onStartChange(r.year.start);        onEndChange(r.year.end);        close(); } },
    { label: "L'année dernière",     apply: () => { const r = getPeriodRanges(); onStartChange(r.prevYear.start);    onEndChange(r.prevYear.end);    close(); } },
    { label: 'Personnalisé',         apply: () => setCustomMode(true) },
  ];

  const shortcutList = (
    <div className="p-1">
      {shortcuts.map(s => (
        <button key={s.label} onClick={s.apply}
          className="w-full text-left px-3 py-2.5 text-xs font-bold text-bony-text hover:bg-white/5 rounded-lg transition flex items-center justify-between">
          {s.label}
          {s.label === 'Personnalisé' && <ChevronRight size={14} className="text-slate-500" />}
        </button>
      ))}
    </div>
  );

  const customForm = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Période personnalisée</span>
        <button onClick={() => setCustomMode(false)} className="text-slate-400 hover:text-bony-text"><X size={14} /></button>
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Du</label>
          <input type="date" value={startDate} onChange={e => onStartChange(e.target.value)}
            className="w-full bg-bony-dark border border-bony-border rounded-lg px-2 py-1.5 text-xs text-bony-text outline-none focus:border-bony-orange transition" />
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Au</label>
          <input type="date" value={endDate} onChange={e => onEndChange(e.target.value)}
            className="w-full bg-bony-dark border border-bony-border rounded-lg px-2 py-1.5 text-xs text-bony-text outline-none focus:border-bony-orange transition" />
        </div>
      </div>
      <button onClick={close} className="w-full py-2 rounded-lg bg-bony-gradient text-white text-xs font-bold mt-1">
        Appliquer
      </button>
    </div>
  );

  return (
    <div ref={triggerRef} className="relative">
      {/* Trigger */}
      <div className="flex items-center gap-1.5">
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Du</span>
          <button onClick={handleOpen}
            className="flex items-center gap-1.5 text-xs font-bold text-bony-text hover:text-bony-orange transition whitespace-nowrap">
            {formatDateBtn(startDate)} <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <span className="text-slate-400 text-xs mt-3">→</span>
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Au</span>
          <button onClick={handleOpen}
            className="flex items-center gap-1.5 text-xs font-bold text-bony-text hover:text-bony-orange transition whitespace-nowrap">
            {formatDateBtn(endDate)} <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <>
          {/* Backdrop — closes dropdown on outside click */}
          <div className="fixed inset-0 z-[9990]" onClick={close} />

          {/* Mobile: bottom sheet */}
          <div className="sm:hidden fixed bottom-0 left-0 right-0 z-[9999] bg-bony-panel border-t border-bony-border rounded-t-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-bony-border">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Période</span>
              <button onClick={close}><X size={16} className="text-slate-400" /></button>
            </div>
            {customMode ? customForm : shortcutList}
          </div>

          {/* Desktop: fixed dropdown */}
          <div
            className="hidden sm:block fixed z-[9999] bg-bony-panel border border-bony-border rounded-xl shadow-2xl overflow-hidden w-52"
            style={{ top: pos.top, left: pos.left }}
          >
            {customMode ? customForm : shortcutList}
          </div>
        </>
      )}
    </div>
  );
};

// --- COMPONENT: SITE CONTEXT PICKER ---
const ALL_PLAQUE_SITES = Object.values(PLAQUES_STRUCTURE).flat();
const SPECIAL_SITES: string[] = ['Alpine', 'Nissan'];

interface SiteContextPickerProps {
  selected: string[];
  onChange: (v: string[]) => void;
}
const SiteContextPicker: React.FC<SiteContextPickerProps> = ({ selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedPlaques, setExpandedPlaques] = useState<Set<string>>(new Set(Object.keys(PLAQUES_STRUCTURE)));
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
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

  const selectAll = () => onChange([...ALL_PLAQUE_SITES, ...SPECIAL_SITES]);
  const clearAll = () => onChange([]);

  const isAll = selected.length === 0;

  const triggerLabel = isAll
    ? 'Tout le réseau'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} sites`;

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, left: rect.left });
    }
    setOpen(v => !v);
  };

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
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[9990]" onClick={() => setOpen(false)} />

          {/* Shared inner content rendered in both mobile and desktop containers */}
          {(() => {
            const inner = (
              <>
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
                  {Object.entries(PLAQUES_STRUCTURE).map(([plaqueName, sites]) => {
                    const filtered = sites.filter(s => !search || s.toLowerCase().includes(search.toLowerCase()));
                    if (search && filtered.length === 0) return null;
                    const expanded = expandedPlaques.has(plaqueName);
                    const allSelected = sites.every(s => selected.includes(s));
                    const someSelected = sites.some(s => selected.includes(s));
                    return (
                      <div key={plaqueName}>
                        <div className="flex items-center px-2 py-1">
                          <button onClick={() => toggleExpandPlaque(plaqueName)}
                            className="flex items-center gap-1 flex-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-bony-text transition">
                            <ChevronRight size={11} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
                            {plaqueName}
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
                            className="w-full flex items-center justify-between pl-6 pr-2 py-1.5 text-xs hover:bg-white/5 transition">
                            <span className={selected.includes(site) ? 'text-bony-text font-bold' : 'text-slate-500'}>{site}</span>
                            {selected.includes(site) && <Check size={12} className="text-bony-orange" />}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                  <div>
                    <div className="px-2 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Entités Spécifiques</div>
                    {SPECIAL_SITES.filter(s => !search || s.toLowerCase().includes(search.toLowerCase())).map(site => (
                      <button key={site} onClick={() => toggle(site)}
                        className="w-full flex items-center justify-between pl-6 pr-2 py-1.5 text-xs hover:bg-white/5 transition">
                        <span className={selected.includes(site) ? 'text-bony-text font-bold' : 'text-slate-500'}>{site}</span>
                        {selected.includes(site) && <Check size={12} className="text-bony-orange" />}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            );
            return (
              <>
                {/* Mobile: bottom sheet */}
                <div className="sm:hidden fixed bottom-0 left-0 right-0 z-[9999] bg-bony-panel border-t border-bony-border shadow-2xl overflow-hidden flex flex-col rounded-t-2xl max-h-[75vh]">
                  {inner}
                </div>
                {/* Desktop: fixed dropdown */}
                <div
                  className="hidden sm:flex fixed z-[9999] bg-bony-panel border border-bony-border rounded-xl shadow-2xl overflow-hidden flex-col w-64 max-h-80"
                  style={{ top: pos.top, left: pos.left }}
                >
                  {inner}
                </div>
              </>
            );
          })()}
        </>
      )}
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
  const [loading, setLoading] = useState(true);

  // --- FILTER STATES ---
  // Default to current year (Jan 1 to Dec 31)
  const currentYear = new Date().getFullYear();
  const [dateStart, setDateStart] = useSessionState<string>('dashboard_dateStart', `${currentYear}-01-01`);
  const [dateEnd, setDateEnd] = useSessionState<string>('dashboard_dateEnd', `${currentYear}-12-31`);

  const [filterContexts, setFilterContexts] = useSessionState<string[]>('dashboard_filterContexts', []);
  const [filterBrands, setFilterBrands] = useSessionState<BrandType[]>('dashboard_filterBrands', []);
  const [filterServices, setFilterServices] = useSessionState<ServiceType[]>('dashboard_filterServices', []);

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
        if (filterContexts.length === 0) return true;
        if (filterContexts.includes('GROUPE BONY')) return true;
        return filterContexts.includes(site);
    };

    const isBrandInScope = (projectBrands: BrandType[]) => {
        if (filterBrands.length === 0) return true;
        return projectBrands.includes('Groupe') || filterBrands.some(b => projectBrands.includes(b));
    };

    const isServiceInScope = (projectServices: string[]) => {
        if (filterServices.length === 0) return true;
        if (projectServices.includes('Tous Services')) return true;
        return filterServices.some(s => projectServices.includes(s));
    };

    // 2. Process BUDGETS
    const chartYear = dStart.getFullYear();

    budgets.forEach(b => {
        if (!isSiteInScope(b.site)) return;

        (['VN', 'VO', 'PR', 'APV'] as const).forEach(svc => {
            if (filterServices.length > 0 && !filterServices.includes(svc as ServiceType)) return;
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

        const pServices = p.service || [];
        if (!isServiceInScope(pServices)) return;

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
             if (filterContexts.length > 0) {
                 const pScope = p.concessions || [];
                 const match = pScope.includes('GROUPE BONY') || filterContexts.some(ctx => pScope.includes(ctx));
                 if (!match) return false;
             }
             // Brand check
             if (filterBrands.length > 0) {
                 if (!p.brands.includes('Groupe') && !filterBrands.some(b => p.brands.includes(b))) return false;
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

  }, [projects, budgets, socialPosts, dateStart, dateEnd, filterContexts, filterBrands, filterServices]);

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
                 <SiteContextPicker selected={filterContexts} onChange={setFilterContexts} />
                 <div className="w-px h-6 bg-bony-border hidden sm:block" />
                 {/* 3. Marques chips */}
                 <BrandPicker selected={filterBrands} onChange={setFilterBrands} />
                 <div className="w-px h-6 bg-bony-border hidden sm:block" />
                 {/* 4. Services chips */}
                 <ServicePicker selected={filterServices} onChange={setFilterServices} />
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
              <div className="bg-bony-panel border border-bony-border rounded-xl p-5 flex flex-col shadow-sm">
                   <h3 className="text-sm font-bold text-bony-text uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Target size={16} className="text-bony-violet"/> Mix Activité
                   </h3>
                   {stats.serviceChartData.length === 0 ? (
                       <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic">Aucune donnée</div>
                   ) : (
                       <ResponsiveContainer width="100%" height={260}>
                           <PieChart>
                               <Pie
                                   data={stats.serviceChartData}
                                   cx="50%"
                                   cy="50%"
                                   outerRadius={90}
                                   dataKey="value"
                                   stroke="none"
                                   labelLine={false}
                                   label={({ percent, x, y, fill }: { percent: number; x: number; y: number; fill: string }) => {
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
                                   contentStyle={{
                                       backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
                                       borderRadius: '8px',
                                       borderColor: theme === 'dark' ? '#333' : '#e2e8f0',
                                       color: theme === 'dark' ? '#fff' : '#0f172a'
                                   }}
                                   formatter={(value: number) => formatCurrency(value)}
                               />
                               <Legend
                                   layout="horizontal"
                                   verticalAlign="bottom"
                                   align="center"
                                   iconType="circle"
                                   iconSize={10}
                                   wrapperStyle={{ fontSize: '12px', paddingTop: '4px' }}
                               />
                           </PieChart>
                       </ResponsiveContainer>
                   )}
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
