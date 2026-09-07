
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { Project, Task, Site, ServiceType, BrandType, PlaqueName, TaskChannel, ActivityLog } from '../types';
import { db, ApiError } from '../services/dataService';
import { fileSauvegardeProjet } from '../services/fileSauvegardeProjet';
import { recalculerProjet } from '../utils/projet';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { useAuth } from '../contexts/AuthContext';
import { PLAQUES_STRUCTURE, BRANDS, BRAND_COLORS, SERVICE_COLORS } from '../constants';
import { Search, Filter, X, Mail, MessageSquare, Megaphone, Save, Euro, BarChart3, Percent, Hash, FileText, Calendar, ArrowUpDown, ArrowUp, ArrowDown, ChevronUp, ChevronDown } from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList 
} from 'recharts';
import { useTheme } from '../contexts/ThemeContext';
import Select from '../components/Select';
import DateRangePicker from '../components/DateRangePicker';
import { ChampTexte, ChampNombre } from '../components/ChampDiffere';

// --- TYPES ---
interface CampaignTask extends Task {
  parentProjectId: string;
  parentProjectName: string;
  parentProjectSite: string;
  parentBrands: BrandType[];
  parentServices: ServiceType[];
  parentStartDate: string;
}

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

// Date sur UNE seule ligne (10/09/26) pour les lignes desktop : la version
// jour/mois + année sur deux lignes coûtait de la hauteur pour rien.
const formatDateCompact = (dateString: string) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
};

const Campaigns: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * ⚠️ MIROIR DE LA LISTE DE PROJETS — c'est LUI que lit la couche réseau. Même défaut et
   * même parade que dans `pages/Projects.tsx` (correctif 48) : `updateTaskField` lisait
   * `projects` dans la closure de son rendu, donc deux saisies rapprochées repartaient du
   * même état et la seconde écrasait la première. Cet écran écrit dans la MÊME route
   * (`PUT /api/projects/:id`, projet entier + toutes ses tâches), avec le même diff
   * transactionnel côté serveur : la course y est identique.
   */
  const projetsRef = useRef<Project[]>([]);

  /** SEULE porte d'écriture de la liste : elle pose aussi le miroir. */
  const poserProjets = useCallback((data: Project[]) => {
    projetsRef.current = data;
    setProjects(data);
  }, []);

  /** Nombre de champs ayant le focus — interdit d'écraser une saisie vive. */
  const champsFocalisesRef = useRef(0);
  const suivreFocusChamp = useCallback((focus: boolean) => {
    champsFocalisesRef.current = Math.max(0, champsFocalisesRef.current + (focus ? 1 : -1));
  }, []);

  const canEdit = user?.role === 'Master' || user?.role === 'Administrator' || user?.role === 'Director' || user?.role === 'Coordinator';

  // --- FILTRES UNIFIÉS (refonte du 30/07/2026) ---
  // Avant : DEUX périodes indépendantes (chartStartDate/chartEndDate pour les
  // graphiques, filterStartDate/filterEndDate pour la liste) et DEUX filtres de
  // canal (globalType pour les graphiques, filterChannel pour la liste) sur le
  // même écran. Un seul jeu pilote désormais les deux.
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useSessionState<string>('campaigns_start', `${currentYear}-01-01`);
  const [endDate, setEndDate] = useSessionState<string>('campaigns_end', `${currentYear}-12-31`);
  const [filterChannel, setFilterChannel] = useSessionState<'All' | 'SMS' | 'E-mail'>('campaigns_filterChannel', 'All');

  // Réglage d'AFFICHAGE du graphique 2 : ne filtre rien, reste près du graphique.
  const [c2Metric, setC2Metric] = useSessionState<MetricFilter>('campaigns_c2Metric', 'Volume');

  // Graphiques repliables : ils vivent maintenant DANS la zone de défilement, donc
  // ils s'effacent au scroll ; ce réglage permet en plus de les masquer d'emblée.
  const [chartsOuverts, setChartsOuverts] = useSessionState<boolean>('campaigns_chartsOuverts', true);

  const [searchTerm, setSearchTerm] = useSessionState<string>('campaigns_searchTerm', '');
  const [filterContext, setFilterContext] = useSessionState<string>('campaigns_filterContext', 'All');
  const [filterService, setFilterService] = useSessionState<ServiceType | 'All'>('campaigns_filterService', 'All');
  const [filterBrand, setFilterBrand] = useSessionState<BrandType | 'All'>('campaigns_filterBrand', 'All');
  const [sortOrder, setSortOrder] = useSessionState<'asc' | 'desc'>('campaigns_sortOrder', 'desc');

  const scrollRef = useScrollRestore('campaigns');

  useEffect(() => {
    loadData();
  }, []);

  // Temps réel : les campagnes sont dérivées des tâches SMS/E-mail des projets.
  useRealtimeSync(RT_EVENTS.projects, () => loadData());

  const loadData = async () => {
    const data = await db.getProjects();
    poserProjets(data);
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

  /**
   * Écriture d'un champ de tâche depuis l'écran Campagnes.
   *
   * ⚠️ Part du MIROIR (`projetsRef`) et non de `projects` capturé au rendu, et passe par
   * `fileSauvegardeProjet` pour qu'un seul PUT soit en vol par projet. Ne jamais rappeler
   * `db.updateProject` directement ici : ce serait rouvrir la course que la file ferme.
   *
   * ⚠️ Refuse d'écrire sur une tâche qui n'existe PLUS dans l'état courant — c'est ce qui
   * empêche le flush au démontage de `ChampDiffere` de faire ressusciter une ligne
   * disparue (filtre modifié, tâche supprimée depuis un autre poste).
   */
  const updateTaskField = useCallback((projectId: string, taskId: string, field: keyof Task, value: any) => {
    if (!canEdit) return;

    const courant = projetsRef.current;
    const projetCourant = courant.find(p => p.id === projectId);
    const tacheCourante = projetCourant?.tasks.find(t => t.id === taskId);
    if (!projetCourant || !tacheCourante) return;

    const suivant = recalculerProjet({
        ...projetCourant,
        tasks: projetCourant.tasks.map(t => (t.id === taskId ? { ...t, [field]: value } : t)),
    });

    poserProjets(courant.map(p => (p.id === projectId ? suivant : p)));
    setSaving(true);

    fileSauvegardeProjet.pousser(suivant, {
        onSucces: (projetServeur) => {
            // Réponse appliquée seulement si rien n'attend derrière et qu'aucun champ n'a
            // le focus : sinon elle est plus ancienne que la saisie en cours.
            if (fileSauvegardeProjet.aDesEcrituresEnCours(projetServeur.id)) return;
            if (champsFocalisesRef.current > 0) return;
            poserProjets(projetsRef.current.map(p => (p.id === projetServeur.id ? projetServeur : p)));
        },
        // ⚠️ Message choisi d'après le STATUT, et plus de rechargement destructif après
        // n'importe quel échec : sur une saturation passagère il suffit de réessayer, et
        // recharger effaçait le travail non sauvegardé.
        onEchec: (erreur) => {
            console.error('Task field update failed:', erreur);
            if (!(erreur instanceof ApiError)) { alert('Échec inattendu de la sauvegarde.'); return; }
            if (erreur.status === 0) { alert('Serveur injoignable. Vos modifications ne sont PAS perdues — ne fermez pas cet onglet.'); return; }
            if (erreur.status === 503) { alert('La base est momentanément saturée. Réessayez dans une minute.'); return; }
            if (erreur.status === 401) return; // apiFetch a déjà déclenché la déconnexion
            if (erreur.status === 403) { alert('Droits insuffisants pour modifier cette campagne.'); return; }
            if (erreur.status === 404 || erreur.status === 409) { alert(erreur.message || 'Données périmées : rechargement.'); loadData(); return; }
            alert(erreur.message || 'Échec de la sauvegarde.');
        },
        onRepos: () => setSaving(false),
    });

    if (field === 'status' && user) {
        db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: `a changé le statut de la tâche`, entity: 'task', entityName: tacheCourante.name || taskId, timestamp: new Date().toISOString() });
    }
  }, [canEdit, user, poserProjets]);

  // --- CHART HELPERS --- (Simplified for brevity, logic unchanged)
  // ... (Chart logic remains identical to previous file, reused here)
  // Le canal vient désormais du filtre UNIQUE de la page ('All' | 'SMS' | 'E-mail'),
  // plus d'un sélecteur propre aux graphiques ('Tout' | 'SMS' | 'E-mail').
  const filterChartData = (tasks: CampaignTask[], start: string, end: string, type: 'All' | 'SMS' | 'E-mail') => {
      const dStart = new Date(start);
      const dEnd = new Date(end);
      dEnd.setHours(23, 59, 59, 999);

      return tasks.filter(t => {
          const tDate = new Date(t.parentStartDate);
          const typeMatch = type === 'All' ? true : t.channel === type;
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
      const filtered = filterChartData(allCampaigns, startDate, endDate, filterChannel);
      const groups: Record<string, number> = {};
      const formatOpts = getDateFormatOptions(startDate, endDate);
      const format = new Intl.DateTimeFormat('fr-FR', formatOpts);

      filtered.sort((a,b) => new Date(a.parentStartDate).getTime() - new Date(b.parentStartDate).getTime());

      filtered.forEach(t => {
          const dateKey = format.format(new Date(t.parentStartDate));
          groups[dateKey] = (groups[dateKey] || 0) + 1;
      });

      return Object.entries(groups).map(([name, value]) => ({ name, value }));
  }, [allCampaigns, startDate, endDate, filterChannel]);

  // --- CHART 2 DATA GENERATOR (Performance) ---
  const chart2Data = useMemo(() => {
      const filtered = filterChartData(allCampaigns, startDate, endDate, filterChannel);
      const groups: Record<string, { sum: number, count: number }> = {};
      const formatOpts = getDateFormatOptions(startDate, endDate);
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
  }, [allCampaigns, startDate, endDate, filterChannel, c2Metric]);

  // --- CHART 3 DATA GENERATOR (Budget Pie) ---
  const chart3Data = useMemo(() => {
      const filtered = filterChartData(allCampaigns, startDate, endDate, filterChannel);
      
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
  }, [allCampaigns, startDate, endDate, filterChannel]);


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

        if (startDate && item.parentStartDate < startDate) return false;
        if (endDate && item.parentStartDate > endDate) return false;

        return true;
    });

    return result.sort((a, b) => {
        const dateA = new Date(a.parentStartDate).getTime();
        const dateB = new Date(b.parentStartDate).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }, [allCampaigns, searchTerm, filterChannel, filterContext, filterService, filterBrand, startDate, endDate, sortOrder]);

  const resetFilters = () => {
      setSearchTerm('');
      setFilterContext('All');
      setFilterService('All');
      setFilterBrand('All');
      setFilterChannel('All');
      // La période revient à l'année en cours (défaut), et non à une valeur vide :
      // elle pilote aussi les graphiques, qui ont besoin de bornes.
      setStartDate(`${currentYear}-01-01`);
      setEndDate(`${currentYear}-12-31`);
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
      
      {/* --- EN-TÊTE : période unique + repli des graphiques ---
           Une seule période pilote désormais les graphiques ET la liste. Le
           sélecteur est celui du Dashboard (components/DateRangePicker), avec ses
           raccourcis semaine / mois / trimestre / semestre / année / personnalisé.
           L'ancien filtre « Type » a disparu : il faisait doublon avec le filtre
           Canal de la liste, qui pilote maintenant les deux. */}
      <div className="px-3 md:px-6 py-2 glass-strong border-b border-bony-border flex flex-wrap items-center justify-between gap-3 shrink-0">
         <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
         />
         <button
            onClick={() => setChartsOuverts(!chartsOuverts)}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg border border-bony-border text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-bony-text hover:bg-white/5 transition"
            title={chartsOuverts ? 'Masquer les graphiques pour gagner de la place' : 'Afficher les graphiques d\'analyse'}
         >
            <BarChart3 size={13} className="text-bony-violet" />
            <span className="hidden sm:inline">{chartsOuverts ? 'Masquer l\'analyse' : 'Afficher l\'analyse'}</span>
            {chartsOuverts ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
         </button>
      </div>



      {/* HEADER & FILTERS
           Recherche, témoin d'enregistrement et bouton de filtres sur UNE ligne :
           le titre « LISTING & ÉDITION EN MASSE » occupait une ligne entière pour
           une information que la page donne déjà. ~40 px de mobilier fixe gagnés. */}
      <div className="px-3 md:px-6 py-2 border-b border-bony-border glass-strong glass-sheen relative overflow-hidden z-20 shadow-md shrink-0">
          <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Filtrer la liste..."
                        className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet transition-colors"
                    />
                </div>
                {saving && <span className="hidden md:flex text-bony-orange items-center text-[10px] animate-pulse font-bold shrink-0"><Save size={10} className="mr-1"/> ENREGISTREMENT...</span>}
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`shrink-0 flex items-center gap-2 px-3 py-1.5 min-h-[44px] rounded-lg transition border ${
                        showFilters
                        ? 'bg-bony-orange text-white border-bony-orange'
                        : 'bg-slate-100 dark:bg-black/30 text-slate-500 dark:text-slate-300 border-bony-border hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                    {showFilters ? <X size={14} /> : <Filter size={14} />}
                    <span className="text-[10px] font-bold uppercase hidden sm:inline">Filtres Liste</span>
                </button>
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
                    {/* La « Période Liste » a été retirée le 30/07/2026 : elle
                        faisait doublon avec la période de l'en-tête, qui pilote
                        désormais les graphiques ET la liste. */}
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

      {/* CAMPAIGN LIST - ROWS */}
      {/* Padding vertical HAUT à zéro, et paddings écrits sans raccourci `p-*` :
          `p-3 md:p-6 pt-2` donnait en réalité 24 px en haut (md:p-6 est émis
          APRÈS pt-2 et l'écrasait), et l'en-tête de colonnes `sticky top-0` se
          collait donc 24 px trop bas — les lignes défilaient au-dessus de lui. */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-3 md:px-6 pt-0 pb-3 md:pb-6">
          {/* Graphiques DANS la zone de défilement : ils s'effacent dès qu'on
              scrolle, au lieu d'occuper 28 % de l'écran en permanence. Le bouton
              de l'en-tête permet en plus de les masquer d'emblée. */}
          {chartsOuverts && (
      <div className="pt-3 md:pt-4 pb-4 mb-2 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-bony-border md:h-64 h-auto">
          
          {/* CHART 1: Nb Campagnes */}
          <div className="gx-card p-3 flex flex-col relative">
               <div className="flex justify-between items-center min-h-[34px] mb-1 z-10">
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
               {/* `items-center` et largeur bornée sur le sélecteur : le composant
                   Select est en `w-full`, donc en enfant de flex il s'étirait sur
                   toute la place restante et débordait sous le titre. */}
               <div className="flex justify-between items-center gap-2 min-h-[34px] mb-1 z-10">
                   <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1 min-w-0 truncate">
                       <BarChart3 size={12} className="text-bony-violet shrink-0"/> Performance
                   </h3>
                   <div className="w-[104px] shrink-0">
                       <FilterSelect value={c2Metric} onChange={setC2Metric} options={['Volume', 'Ouverture', 'Clics']} />
                   </div>
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
               <div className="flex justify-between items-center min-h-[34px] mb-1 z-10">
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
          )}

      {/* `gx-sticky-head` (index.html) et non un fond plein : le noir opaque
          tranchait sur le thème liquid glass. La classe custom n'est pas
          préfixée `md:` (impossible en CDN Play) — inutile ici, l'élément n'est
          affiché qu'à partir de md. */}
      <div className="hidden md:flex sticky top-0 z-10 -mx-6 px-6 py-2 mb-2 gx-sticky-head gap-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
          <button 
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="w-[87px] text-center flex items-center justify-center gap-1 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          >
              Date
              {sortOrder === 'asc' ? <ArrowUp size={10}/> : <ArrowDown size={10}/>}
          </button>
          <div className="w-[25%]">Campagne / Projet</div>
          <div className="flex-1 grid grid-cols-9 gap-2 text-center">
              <div className="col-span-2 flex items-center justify-center gap-1"><Euro size={10}/> Coût</div>
              <div className="flex items-center justify-center gap-1"><BarChart3 size={10}/> Vol.</div>
              <div className="flex items-center justify-center gap-1"><Percent size={10}/> Ouv.</div>
              <div className="flex items-center justify-center gap-1"><Percent size={10}/> NPAI</div>
              <div className="flex items-center justify-center gap-1"><Percent size={10}/> STOP</div>
              <div className="flex items-center justify-center gap-1"><Percent size={10}/> Clics</div>
              <div className="flex items-center justify-center gap-1"><Hash size={10}/> COD TXT</div>
              <div className="flex items-center justify-center gap-1"><FileText size={10}/> Factu</div>
          </div>
      </div>
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
              <div className="hidden md:block space-y-1.5">
                {filteredCampaigns.map((task, idx) => {
                    const isEmail = task.channel === 'E-mail';
                    const ChannelIcon = isEmail ? Mail : MessageSquare;
                    const accentColor = isEmail ? 'text-bony-orange' : 'text-blue-400';
                    const borderHover = isEmail ? 'hover:border-bony-orange/50' : 'hover:border-bony-blue/50';

                    return (
                        <div key={`${task.parentProjectId}-${task.id}-${idx}`} className={`gx-glass-panel border border-bony-border rounded-lg px-3 py-2 flex items-center gap-4 transition-all group ${borderHover}`}>

                            {/* DATE COLUMN — `font-sans` et NON `font-title` :
                                Syncopate (la police de titre) rend « 10/09/26 » sur
                                71,6 px pour une colonne de 64 → le texte débordait. */}
                            <div className="w-[74px] flex items-center justify-center border-r border-bony-border pr-3 shrink-0">
                                <span className="text-[13px] font-sans font-bold text-slate-900 dark:text-white whitespace-nowrap tabular-nums">{formatDateCompact(task.parentStartDate)}</span>
                            </div>

                            {/* INFO BLOCK (25%) — deux lignes : projet, puis tâche + badges */}
                            <div className="w-[25%] flex items-center gap-2 shrink-0">
                                <div className={`p-1.5 rounded bg-slate-100 dark:bg-black/30 border border-bony-border ${accentColor} shrink-0`}>
                                    <ChannelIcon size={14} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    {/* Ligne 1 = nom du projet. `font-sans` explicite : la règle
                                        globale h1..h6 impose Syncopate, illisible et 32 % plus
                                        large dans une ligne de tableau dense (350 px contre 237
                                        pour le même libellé). Syncopate reste sur les vrais titres. */}
                                    <h3 className="text-slate-900 dark:text-white font-sans font-bold truncate text-[13px] leading-snug tracking-normal" title={task.parentProjectName}>
                                        {task.parentProjectName}
                                    </h3>
                                    {/* Ligne 2 = nom de la tâche + badges site/marque, sur la MÊME ligne :
                                        c'est la troisième ligne qui coûtait le plus de hauteur. */}
                                    <div className="flex items-center gap-1 min-w-0 leading-snug">
                                        <span className="text-[11px] text-slate-500 font-medium truncate min-w-0" title={task.name}>
                                            {task.name}
                                        </span>
                                        <span className="text-[8px] font-sans text-slate-500 bg-slate-100 dark:bg-black/40 px-1 rounded border border-bony-border shrink-0 whitespace-nowrap">{task.parentProjectSite}</span>
                                        {task.parentBrands?.map(b => (
                                            <span key={b} className={`text-[8px] px-1 rounded border shrink-0 whitespace-nowrap ${BRAND_COLORS[b] || 'border-slate-600 text-slate-500'}`}>
                                                {b}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT: DATA BLOCKS (Flex-1)
                                9 colonnes dont 2 pour le Coût : il affiche un montant complet
                                (« 11425 € ») là où les 7 autres n'ont que 2 à 5 caractères.
                                ⚠️ On reste sur les classes Tailwind standard (grid-cols-9) et NON
                                sur un gabarit arbitraire : grid-cols-N vaut minmax(0,1fr), alors
                                qu'un « 1fr » écrit à la main vaut minmax(auto,1fr) — et les
                                <input> imposent alors leur largeur intrinsèque (~147 px), ce qui
                                fait exploser la grille. Même gabarit dans l'en-tête. */}
                            <div className="flex-1 grid grid-cols-9 gap-2 items-center">
                                {/* 1. Coût (lecture seule) — whitespace-nowrap OBLIGATOIRE :
                                    sans lui « 600 € » passe à la ligne dans une colonne de 51 px
                                    et c'est CETTE case qui imposait 80 px à toute la ligne. */}
                                <div className="col-span-2 bg-slate-100 dark:bg-black/40 border border-bony-border rounded px-2 py-1.5 text-right overflow-hidden">
                                    <span className="block text-slate-700 dark:text-white font-sans text-xs font-bold whitespace-nowrap truncate" title={`${task.cost} €`}>{task.cost} €</span>
                                </div>

                                {/* 2. Volumétrie (Number) */}
                                {/* ⚠️ `videVaut="null"` sur les SIX indicateurs et sur la facturation : ce sont
                                    des `Float?` en base. Avant le correctif 48, `Number(e.target.value)` rendait
                                    0 pour une chaîne vide — effacer un taux écrivait donc « zéro pour cent » au
                                    lieu de « non renseigné », et l'indicateur était écrasé en silence.
                                    Le bornage 0-100 des quatre taux est appliqué AU COMMIT et non à chaque
                                    frappe : sinon taper « 100 » restait bloqué à 1 dès le premier caractère. */}
                                <ChampNombre
                                    cle={`${task.id}:volumetry`}
                                    disabled={!canEdit}
                                    placeholder="0"
                                    valeur={task.volumetry}
                                    videVaut="null"
                                    onValider={(v) => updateTaskField(task.parentProjectId, task.id, 'volumetry', v)}
                                    onFocusChange={suivreFocusChamp}
                                    className="bg-slate-100 dark:bg-black/20 gx-num-tight border border-bony-border rounded px-1.5 py-1.5 text-right text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet focus:bg-white dark:focus:bg-black/40 transition-colors disabled:opacity-50"
                                />

                                {/* 3. % Ouverture (0-100) */}
                                <div className="relative">
                                    <ChampNombre
                                        cle={`${task.id}:openRate`}
                                        disabled={!canEdit}
                                        placeholder="-"
                                        valeur={task.openRate}
                                        videVaut="null"
                                        borne={[0, 100]}
                                        onValider={(v) => updateTaskField(task.parentProjectId, task.id, 'openRate', v)}
                                        onFocusChange={suivreFocusChamp}
                                        className="w-full bg-slate-100 dark:bg-black/20 gx-num-tight border border-bony-border rounded px-1.5 py-1.5 text-right text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet focus:bg-white dark:focus:bg-black/40 transition-colors disabled:opacity-50"
                                    />
                                </div>

                                {/* 4. % NPAI */}
                                <div className="relative">
                                    <ChampNombre
                                        cle={`${task.id}:npaiRate`}
                                        disabled={!canEdit}
                                        placeholder="-"
                                        valeur={task.npaiRate}
                                        videVaut="null"
                                        borne={[0, 100]}
                                        onValider={(v) => updateTaskField(task.parentProjectId, task.id, 'npaiRate', v)}
                                        onFocusChange={suivreFocusChamp}
                                        className="w-full bg-slate-100 dark:bg-black/20 gx-num-tight border border-bony-border rounded px-1.5 py-1.5 text-right text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet focus:bg-white dark:focus:bg-black/40 transition-colors disabled:opacity-50"
                                    />
                                </div>

                                {/* 5. % STOP */}
                                <div className="relative">
                                    <ChampNombre
                                        cle={`${task.id}:stopRate`}
                                        disabled={!canEdit}
                                        placeholder="-"
                                        valeur={task.stopRate}
                                        videVaut="null"
                                        borne={[0, 100]}
                                        onValider={(v) => updateTaskField(task.parentProjectId, task.id, 'stopRate', v)}
                                        onFocusChange={suivreFocusChamp}
                                        className="w-full bg-slate-100 dark:bg-black/20 gx-num-tight border border-bony-border rounded px-1.5 py-1.5 text-right text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet focus:bg-white dark:focus:bg-black/40 transition-colors disabled:opacity-50"
                                    />
                                </div>

                                {/* 6. % Clics */}
                                <div className="relative">
                                    <ChampNombre
                                        cle={`${task.id}:clickRate`}
                                        disabled={!canEdit}
                                        placeholder="-"
                                        valeur={task.clickRate}
                                        videVaut="null"
                                        borne={[0, 100]}
                                        onValider={(v) => updateTaskField(task.parentProjectId, task.id, 'clickRate', v)}
                                        onFocusChange={suivreFocusChamp}
                                        className="w-full bg-slate-100 dark:bg-black/20 gx-num-tight border border-bony-border rounded px-1.5 py-1.5 text-right text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet focus:bg-white dark:focus:bg-black/40 transition-colors disabled:opacity-50"
                                    />
                                </div>

                                {/* 7. COD TXT (Text) */}
                                <ChampTexte
                                    cle={`${task.id}:codTxt`}
                                    disabled={!canEdit}
                                    placeholder="Code..."
                                    valeur={task.codTxt || ''}
                                    onValider={(v) => updateTaskField(task.parentProjectId, task.id, 'codTxt', v)}
                                    onFocusChange={suivreFocusChamp}
                                    className="bg-slate-100 dark:bg-black/20 border border-bony-border rounded px-1.5 py-1.5 text-center text-xs text-slate-900 dark:text-white outline-none focus:border-bony-violet focus:bg-white dark:focus:bg-black/40 transition-colors font-sans disabled:opacity-50"
                                />

                                {/* 8. Facturation (Number) */}
                                <div className="relative">
                                    <ChampNombre
                                        cle={`${task.id}:billedAmount`}
                                        disabled={!canEdit}
                                        placeholder="0"
                                        valeur={task.billedAmount}
                                        videVaut="null"
                                        onValider={(v) => updateTaskField(task.parentProjectId, task.id, 'billedAmount', v)}
                                        onFocusChange={suivreFocusChamp}
                                        className="w-full bg-slate-100 dark:bg-black/20 gx-num-tight border border-bony-border rounded px-1.5 py-1.5 text-right text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-bony-orange focus:bg-white dark:focus:bg-black/40 transition-colors disabled:opacity-50"
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
