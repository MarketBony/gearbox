
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { Project, Campaign, BudgetLine, BrandType, PlaqueName, Site, ServiceType, SocialPost, FixedExpense, User } from '../types';
import { db } from '../services/dataService';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { PLAQUES_STRUCTURE, BRANDS, BRAND_COLORS, SERVICE_COLORS, SOCIAL_STATUS_COLORS, isHoldingBrand, resolveBudgetLine, resolveSiteAlias, splitShareToBuckets } from '../constants';
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
}
const SiteContextPicker: React.FC<SiteContextPickerProps> = ({ selected, onChange }) => {
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

  const selectAll = () => onChange([...ALL_PLAQUE_SITES, ...SPECIAL_SITES]);
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
                    {SPECIAL_SITES.filter(s => !search || s.toLowerCase().includes(search.toLowerCase())).map(site => (
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

    // Minuit aujourd'hui, pour détecter les retards. Déclaré AVANT la boucle
    // projets (la section « prochaines échéances » plus bas a sa propre variable).
    const todayMidnightRef = new Date();
    todayMidnightRef.setHours(0, 0, 0, 0);

    // --- Accumulateurs des indicateurs de pilotage (ajoutés le 30/07/2026) ---
    // Tous alimentés depuis la boucle projets, donc soumis aux MÊMES filtres
    // (périmètre, marque, service, PRO+) et aux mêmes règles métier (Draft exclu,
    // Holding hors montants) que le budget consommé. Un indicateur qui ne
    // respecterait pas les filtres afficherait un chiffre incohérent avec le reste.
    const coutParCanal: Record<string, number> = {};
    const coutParSite: Record<string, number> = {};
    const coutParPrestataire: Record<string, { montant: number; taches: number }> = {};
    const chargeParUtilisateur: Record<string, number> = {};
    const ecartsProjets: { nom: string; prevu: number; realise: number; ecart: number }[] = [];
    const projetsEnRetard: { id: string; nom: string; site: string; fin: string; avancement: number }[] = [];
    let sommeAvancement = 0, nbActifsPourAvancement = 0;
    // Performance des campagnes : on cumule les NUMÉRATEURS pondérés par la
    // volumétrie, jamais des moyennes de taux — une moyenne simple de taux issus
    // d'envois de tailles différentes est fausse (piège classique).
    const perf = {
      SMS:     { volume: 0, ouvertures: 0, clics: 0, npai: 0, stop: 0, cout: 0, envois: 0 },
      'E-mail': { volume: 0, ouvertures: 0, clics: 0, npai: 0, stop: 0, cout: 0, envois: 0 }
    };
    
    // Parse filter dates
    const dStart = new Date(dateStart);
    const dEnd = new Date(dateEnd);

    // 1. Filter Logic Helpers
    const isSiteInScope = (site: string) => {
        if (filterContexts.length === 0) return true;
        if (filterContexts.includes('GROUPE BONY')) return true;
        return filterContexts.includes(site);
    };

    // Périmètre d'une LIGNE DE BUDGET, qui peut être un bucket (`Alpine-Clermont`,
    // `Nissan`) et non un site réel. Sans ça, sélectionner « Clermont » masquait
    // l'enveloppe Alpine-Clermont, et le croisement marque × périmètre était
    // impossible (correctif du 03/08/2026, cf. BUGS-CONNUS.md).
    const isBudgetLineInScope = (site: string) => {
        if (filterContexts.length === 0) return true;
        if (filterContexts.includes(site)) return true;        // sélection directe du bucket
        if (filterContexts.includes('GROUPE BONY')) return true;
        const { siteReel, global } = resolveBudgetLine(site);
        // Nissan est GLOBAL : il n'entre dans un périmètre que s'il y est nommé
        // explicitement, sinon on le compterait une fois par site éligible.
        if (global) return false;
        return siteReel !== null && filterContexts.includes(siteReel);
    };

    const isBrandInScope = (projectBrands: BrandType[]) => {
        if (filterBrands.length === 0) return true;
        return projectBrands.includes('Holding') || filterBrands.some(b => projectBrands.includes(b));
    };

    const isServiceInScope = (projectServices: string[]) => {
        if (filterServices.length === 0) return true;
        if (projectServices.includes('Tous Services')) return true;
        return filterServices.some(s => projectServices.includes(s));
    };

    // Filtre PRO+ (B2B) à 3 états — se combine avec les autres filtres. Fallback : absent = non-PRO+.
    const isProPlusInScope = (proPlus?: boolean) =>
        filterProPlus === 'all' || (filterProPlus === 'pro' ? !!proPlus : !proPlus);

    // 2. Process BUDGETS
    const chartYear = dStart.getFullYear();

    budgets.forEach(b => {
        if (!isBudgetLineInScope(b.site)) return;
        // ⚠️ Le filtre de MARQUE manquait ici alors que le consommé l'appliquait :
        // avec MARQUE = Alpine, on comparait 120 295 € consommés à l'enveloppe du
        // GROUPE ENTIER (1 480 800 €). Trois chiffres faux d'un coup — le
        // pourcentage, le « Sur X € » et le Reste à engager, tous dérivés de
        // `totalForecast`. Signalé par Théo le 03/08/2026.
        if (!isBrandInScope(b.brands || [])) return;

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
        // Brouillon : ne remonte NULLE PART. Budget.tsx l'excluait déjà (bloc 3),
        // le Dashboard non — un projet en brouillon portant un coût gonflait donc
        // le consommé, la trajectoire mensuelle, le mix activité et le compteur
        // « campagnes live », sans jamais apparaître dans Budget. Les deux écrans
        // se contredisaient. Corrigé le 30/07/2026.
        // Placé en tête : « projets actifs » et « prochaines échéances » ne testent
        // que status === 'Active', ils ne comptaient donc déjà pas les brouillons.
        if (p.status === 'Draft') return;

        if (!isProPlusInScope(p.proPlus)) return;

        // VENTILATION PAR SITE — corrigé le 30/07/2026, même cause que les dépenses
        // fixes (bloc 3bis). Avant, le test portait sur `p.site` brut : or pour un
        // projet MULTI-SITES ce champ contient le libellé concaténé
        // ("Clermont, Vichy, Moulins"), qui ne correspond à aucun site du filtre —
        // le projet disparaissait donc en totalité dès qu'un périmètre était
        // sélectionné, au lieu de contribuer sa part. Même source de parts que
        // Budget.tsx : budgetDistribution si multi-sites, sinon 100 % sur le site.
        const siteShares: Record<string, number> =
            (p.sites && p.sites.length > 0 && p.budgetDistribution)
                ? p.budgetDistribution
                : { [p.site as string]: 100 };

        // Parts retenues par le filtre de périmètre. Si aucune ne passe, le projet
        // est hors périmètre : il ne compte ni en montant, ni dans les compteurs.
        //
        // Chaque part est d'abord ÉCLATÉE en destinations pondérées (une seule le
        // plus souvent ; deux quand le curseur de répartition Alpine/Nissan scinde
        // un élément mixte), puis chaque destination est testée séparément. Le
        // périmètre porte sur la DESTINATION BUDGÉTAIRE, pas sur le site brut :
        // sans ça, « périmètre = Nissan » ne ramenait rien, puisque le site d'un
        // projet est toujours un site réel, jamais « Nissan ».
        const partsEnScope = Object.entries(siteShares).flatMap(([rawSite, pct]) => {
            if (pct <= 0) return [];
            return splitShareToBuckets(rawSite, p.brands, null, {
                alpineShare: p.alpineShare,
                nissanShare: p.nissanShare,
            })
                .filter(d => isSiteInScope(d.site))
                .map(d => ({ rawSite, pct: pct * d.ratio }));
        });
        if (partsEnScope.length === 0) return;

        const pBrands = p.brands || [];
        if (!isBrandInScope(pBrands)) return;

        const pServices = p.service || [];
        if (!isServiceInScope(pServices)) return;

        // Compteurs : UNE fois par projet, jamais dans la boucle de ventilation —
        // sinon un projet sur 3 sites serait compté 3 fois.
        if (p.status === 'Active') activeProjectsCount++;

        // --- Pilotage projets (indépendant du budget : le Holding est TRACKÉ) ---
        if (p.status === 'Active') {
            sommeAvancement += p.progress || 0;
            nbActifsPourAvancement++;
        }
        // En retard = échéance dépassée et travail inachevé. C'est l'indicateur qui
        // manquait le plus : un projet peut être « Actif » depuis des mois sans que
        // rien ne le signale.
        if (p.status !== 'Archived' && p.endDate && parseLocalDate(p.endDate) < todayMidnightRef && (p.progress || 0) < 100) {
            projetsEnRetard.push({ id: p.id, nom: p.name, site: p.site as string, fin: p.endDate, avancement: p.progress || 0 });
        }
        // Charge d'équipe : tâches encore ouvertes, par personne assignée.
        (p.tasks || []).forEach(t => {
            if ((t.status === 'Todo' || t.status === 'InProgress') && t.assignedUserId) {
                chargeParUtilisateur[t.assignedUserId] = (chargeParUtilisateur[t.assignedUserId] || 0) + 1;
            }
        });

        // Campagnes : on compte les TÂCHES SMS/e-mail programmées, pas les projets
        // qui en contiennent au moins une (le libellé annonçait des envois).
        activeCampaignsCount += p.tasks.filter(
            t => (t.channel === 'SMS' || t.channel === 'E-mail') && t.status === 'Programmed'
        ).length;

        // Tag Holding : tracké mais JAMAIS imputé à un budget (règle métier, cf.
        // CLAUDE.md). Placé ICI volontairement, APRÈS les compteurs « projets
        // actifs » et « campagnes live » : le Holding sort des montants, il ne
        // disparaît pas du suivi.
        if (isHoldingBrand(p.brands)) return;

        // Date de référence = date de DÉBUT du projet (cohérent avec l'agrégation Budget) :
        // le budget réalisé est compté sur le mois/année de startDate, pas de fin.
        const pDate = new Date(p.startDate);
        const coutTotal = p.budgetActual || 0;
        // Seules les parts dans le périmètre contribuent — sans filtre, elles
        // valent 100 % au total, donc le chiffre affiché est inchangé.
        const partEnScope = partsEnScope.reduce((s, { pct }) => s + pct, 0) / 100;
        const cost = coutTotal * partEnScope;

        if (pDate.getFullYear() === chartYear) {
            const monthIdx = pDate.getMonth();
            monthlyTrend[monthIdx].reel += cost;
        }

        if (pDate >= dStart && pDate <= dEnd) {
            totalActual += cost;

            // --- Analyse budgétaire : où part l'argent ---
            // Écart prévu / réalisé : seulement si un prévisionnel a été saisi,
            // sinon l'écart vaudrait -100 % et polluerait le classement.
            if ((p.budgetPlanned || 0) > 0) {
                ecartsProjets.push({
                    nom: p.name, prevu: p.budgetPlanned, realise: coutTotal,
                    ecart: coutTotal - p.budgetPlanned
                });
            }
            // Consommation par site, à partir des parts déjà filtrées. Ce graphe
            // raisonne en SITES RÉELS (et non en destinations budgétaires) : une
            // part Alpine reste affichée sur sa concession. Les alias passent par
            // `resolveSiteAlias`, qui était recopié en dur ici.
            partsEnScope.forEach(({ rawSite, pct }) => {
                const s = resolveSiteAlias(rawSite);
                coutParSite[s] = (coutParSite[s] || 0) + coutTotal * pct / 100;
            });
            // Détail par tâche : canal, prestataire, performance de campagne.
            // Les coûts de tâche sont pris au prorata de la part en périmètre, pour
            // rester cohérents avec le consommé affiché.
            (p.tasks || []).forEach(t => {
                const coutTache = (t.cost || 0) * partEnScope;
                if (t.channel) coutParCanal[t.channel] = (coutParCanal[t.channel] || 0) + coutTache;
                if (t.provider) {
                    const e = coutParPrestataire[t.provider] || { montant: 0, taches: 0 };
                    e.montant += coutTache; e.taches++;
                    coutParPrestataire[t.provider] = e;
                }
                const cible = perf[t.channel as 'SMS' | 'E-mail'];
                if (cible && (t.volumetry || 0) > 0) {
                    const v = t.volumetry as number;
                    cible.volume += v;
                    cible.envois++;
                    cible.cout += coutTache;
                    // Pondération par la volumétrie : on cumule des VOLUMES, pas des taux.
                    cible.ouvertures += v * (t.openRate || 0) / 100;
                    cible.clics     += v * (t.clickRate || 0) / 100;
                    cible.npai      += v * (t.npaiRate || 0) / 100;
                    cible.stop      += v * (t.stopRate || 0) / 100;
                }
            });

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

    // 3bis. Process FIXED EXPENSES (Actuals) — VENTILÉES PAR SITE.
    //
    // Correctif du 29 juillet 2026. Avant, ce bloc testait `isSiteInScope(e.site)`
    // sur le champ `site` brut. Or pour une dépense MULTI-SITES ce champ contient le
    // libellé concaténé ("Clermont, Ussel, Mozac, …"), qui ne correspond à aucun site
    // du filtre : la dépense était donc écartée en totalité dès qu'un périmètre était
    // sélectionné. Mesuré avant correctif : périmètre Clermont → consommé 0 € au
    // Dashboard, alors que Budget affichait 9 259 € pour ce même site.
    //
    // On ventile désormais par site avec la MÊME source de parts que Budget.tsx
    // (bloc 4) : budgetDistribution si la dépense est multi-sites, sinon 100 % sur le
    // site unique (repli legacy). Sans filtre, la somme des parts vaut 100 % → le
    // total affiché est inchangé.
    //
    // Choix assumés, différents de Budget.tsx :
    // - PAS de routage bucket Alpine/Nissan : Budget en a besoin pour placer le coût
    //   dans la bonne LIGNE de son tableau ; ici on ne fait qu'un total comparé au
    //   périmètre choisi, où le site réel est la bonne réponse — cohérent avec le
    //   traitement des projets juste au-dessus.
    // - pourcentages utilisés tels quels, sans renormalisation (comme Budget.tsx).
    fixedExpenses.forEach(e => {
        if (!isProPlusInScope(e.proPlus)) return;

        // Tag Holding : hors budget (voir bloc 3). Champ legacy `brand` inclus.
        if (isHoldingBrand(e.brands, e.brand)) return;

        const eBrands = e.brands || (e.brand ? [e.brand] : []);
        if (!isBrandInScope(eBrands)) return;

        if (!isServiceInScope([e.service])) return;

        const totalCost = e.amount || 0;
        if (totalCost === 0) return;

        const siteShares: Record<string, number> =
            (e.sites && e.sites.length > 0 && e.budgetDistribution)
                ? e.budgetDistribution
                : { [e.site as string]: 100 };

        const expDate = new Date(e.date);
        const expYear = expDate.getFullYear();

        let servicesToHit: string[] = [];
        if (e.service === 'Tous Services') {
            servicesToHit = ['VN', 'VO', 'APV', 'PR'];
        } else if (['VN', 'VO', 'APV', 'PR'].includes(e.service)) {
            servicesToHit = [e.service];
        }

        Object.entries(siteShares).forEach(([rawSite, sharePct]) => {
            if (sharePct <= 0) return;

            // Comme pour les projets : le périmètre s'applique aux destinations
            // budgétaires de la part (bucket Alpine/Nissan ou site réel), sinon un
            // périmètre Nissan ne ramène aucune dépense. Rien en aval ne dépend de
            // la destination elle-même — seule la FRACTION de la part qui tombe
            // dans le périmètre importe (< 1 quand le curseur de répartition
            // envoie le reste sur un site hors périmètre).
            const fractionEnScope = splitShareToBuckets(rawSite, e.brands, e.brand, {
                alpineShare: e.alpineShare,
                nissanShare: e.nissanShare,
            })
                .filter(d => isSiteInScope(d.site))
                .reduce((s, d) => s + d.ratio, 0);
            if (fractionEnScope <= 0) return;

            const cost = totalCost * (sharePct / 100) * fractionEnScope;

            // Dépense ANNUELLE : même principe que l'agrégation Budget.tsx — le mois de
            // expDate est ignoré, le montant contribue cost/12 sur chacun des 12 mois de
            // l'année civile de référence. Dépense mensuelle : tout sur le mois de expDate.
            const monthlyContributions = e.isAnnual
                ? Array.from({ length: 12 }, (_, m) => ({ monthIdx: m, mCost: cost / 12 }))
                : [{ monthIdx: expDate.getMonth(), mCost: cost }];

            monthlyContributions.forEach(({ monthIdx, mCost }) => {
                if (expYear === chartYear) {
                    monthlyTrend[monthIdx].reel += mCost;
                }

                // Fenêtre de période : la contribution mensuelle d'une annuelle est testée
                // au 15 du mois (même convention que la section budgets ci-dessus) ;
                // une mensuelle est testée sur sa date réelle, comme les projets.
                const checkDate = e.isAnnual ? new Date(expYear, monthIdx, 15) : expDate;
                if (checkDate >= dStart && checkDate <= dEnd) {
                    totalActual += mCost;
                    if (servicesToHit.length > 0) {
                        const splitAmount = mCost / servicesToHit.length;
                        servicesToHit.forEach(s => {
                            if (serviceMix[s] !== undefined) serviceMix[s] += splitAmount;
                        });
                    }
                }
            });
        });
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

    // --- Agrégation des indicateurs de pilotage ---
    const trier = (o: Record<string, number>, max: number) =>
        Object.entries(o).map(([name, value]) => ({ name, value: Math.round(value) }))
            .filter(d => d.value > 0).sort((a, b) => b.value - a.value).slice(0, max);

    const budgetParCanal = trier(coutParCanal, 8);
    const topSites = trier(coutParSite, 5);
    const topPrestataires = Object.entries(coutParPrestataire)
        .map(([name, v]) => ({ name, value: Math.round(v.montant), taches: v.taches }))
        .filter(d => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);

    const chargeEquipe = Object.entries(chargeParUtilisateur)
        .map(([userId, taches]) => ({ userId, taches })).sort((a, b) => b.taches - a.taches);

    const ecartsTop = ecartsProjets
        .sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart)).slice(0, 6)
        .map(e => ({ ...e, ecartPct: e.prevu > 0 ? Math.round((e.ecart / e.prevu) * 100) : 0 }));

    const avancementMoyen = nbActifsPourAvancement > 0
        ? Math.round(sommeAvancement / nbActifsPourAvancement) : 0;

    // Taux pondérés : volume d'ouvertures / volume envoyé. Faire la moyenne des
    // taux donnerait un chiffre faux dès que les envois ont des tailles différentes.
    const tauxPondere = (num: number, vol: number) => vol > 0 ? +((num / vol) * 100).toFixed(1) : 0;
    const perfCanal = (['SMS', 'E-mail'] as const).map(canal => {
        const d = perf[canal];
        return {
            canal, envois: d.envois, volume: d.volume, cout: Math.round(d.cout),
            ouverture: tauxPondere(d.ouvertures, d.volume),
            clic: tauxPondere(d.clics, d.volume),
            npai: tauxPondere(d.npai, d.volume),
            stop: tauxPondere(d.stop, d.volume),
            // Coût par contact : l'indicateur d'efficience d'un envoi.
            coutParContact: d.volume > 0 ? +(d.cout / d.volume).toFixed(3) : 0
        };
    }).filter(d => d.volume > 0);

    const volumeTotal = perf.SMS.volume + perf['E-mail'].volume;
    const perfGlobale = {
        volume: volumeTotal,
        envois: perf.SMS.envois + perf['E-mail'].envois,
        ouverture: tauxPondere(perf.SMS.ouvertures + perf['E-mail'].ouvertures, volumeTotal),
        clic: tauxPondere(perf.SMS.clics + perf['E-mail'].clics, volumeTotal),
        npai: tauxPondere(perf.SMS.npai + perf['E-mail'].npai, volumeTotal),
        stop: tauxPondere(perf.SMS.stop + perf['E-mail'].stop, volumeTotal),
        cout: Math.round(perf.SMS.cout + perf['E-mail'].cout),
        coutParContact: volumeTotal > 0 ? +((perf.SMS.cout + perf['E-mail'].cout) / volumeTotal).toFixed(3) : 0
    };

    // Rythme de consommation : le pourcentage de budget consommé ne dit rien seul.
    // Comparé au pourcentage de la période écoulée, il devient une alerte.
    const dureeTotale = dEnd.getTime() - dStart.getTime();
    const ecoule = Math.min(Math.max(Date.now() - dStart.getTime(), 0), dureeTotale);
    const pctTempsEcoule = dureeTotale > 0 ? Math.round((ecoule / dureeTotale) * 100) : 0;
    const pctConsomme = totalForecast > 0 ? Math.round((totalActual / totalForecast) * 100) : 0;

    // 6. Upcoming Deadlines (Projects) — uniquement aujourd'hui ou futur, par date de fin croissante.
    // Comparaison via parse local (anti J+1) ; recalculé à chaque rendu → les échéances passées disparaissent.
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const deadlines = projects
        .filter(p => p.status === 'Active' && isSiteInScope(p.site as string) && isProPlusInScope(p.proPlus)
            && p.endDate && parseLocalDate(p.endDate) >= todayMidnight)
        .sort((a,b) => parseLocalDate(a.endDate).getTime() - parseLocalDate(b.endDate).getTime())
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
                 if (!p.brands.includes('Holding') && !filterBrands.some(b => p.brands.includes(b))) return false;
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
        upcomingPosts,
        // Indicateurs de pilotage
        projetsEnRetard: projetsEnRetard.sort((a, b) => a.fin.localeCompare(b.fin)),
        avancementMoyen,
        ecartsTop,
        budgetParCanal,
        topSites,
        topPrestataires,
        chargeEquipe,
        perfCanal,
        perfGlobale,
        pctTempsEcoule,
        pctConsomme
    };

  }, [projects, budgets, socialPosts, fixedExpenses, dateStart, dateEnd, filterContexts, filterBrands, filterServices, filterProPlus]);

  // --- RENDER HELPERS ---
  const formatCurrency = (val: number) => val.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  const burnRate = stats.totalForecast > 0 ? (stats.totalActual / stats.totalForecast) * 100 : 0;
  const remaining = stats.totalForecast - stats.totalActual;
  // Écart en POINTS entre le budget dépensé et le temps écoulé. Positif = on dépense
  // plus vite que le calendrier ; négatif = on sous-consomme.
  const ecartRythme = stats.pctConsomme - stats.pctTempsEcoule;

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
                  {/* Deux barres superposées : ce qui est dépensé, ce qui est écoulé.
                      La comparaison visuelle vaut mieux qu'une explication. */}
                  <div className="mt-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                          <span className="text-[9px] text-slate-500 w-20 shrink-0">Budget dépensé</span>
                          <div className="flex-1 h-2 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-bony-orange" style={{ width: `${Math.min(stats.pctConsomme, 100)}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-bony-text w-9 text-right shrink-0">{stats.pctConsomme} %</span>
                      </div>
                      <div className="flex items-center gap-2">
                          <span className="text-[9px] text-slate-500 w-20 shrink-0">Année écoulée</span>
                          <div className="flex-1 h-2 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-slate-400 dark:bg-slate-500" style={{ width: `${stats.pctTempsEcoule}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 w-9 text-right shrink-0">{stats.pctTempsEcoule} %</span>
                      </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-400">
                      {ecartRythme > 10
                        ? 'Vous dépensez plus vite que le temps ne passe : le budget risque de manquer avant la fin de la période.'
                        : ecartRythme < -10
                        ? 'Vous dépensez moins vite que le temps ne passe : du budget risque de rester non engagé.'
                        : 'Dépenses au rythme du calendrier.'}
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

          {/* ═══ 5. PERFORMANCE DES CAMPAGNES ═══ */}
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

              {/* Top sites + top prestataires */}
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

              {/* Charge par collaborateur */}
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
          </div>

      </div>
    </div>
  );
};

export default Dashboard;
