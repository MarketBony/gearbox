
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import { Project, Task, TaskStatus, ServiceType, PlaqueName, Site, BrandType, ProjectType, User, UserRole, ActivityLog } from '../types';
import { db, ApiError } from '../services/dataService';
import { fileSauvegardeProjet } from '../services/fileSauvegardeProjet';
import { recalculerProjet } from '../utils/projet';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { useAuth } from '../contexts/AuthContext';
import { SITES, PLAQUES_STRUCTURE, SERVICES, SERVICE_COLORS, BRANDS, BRAND_COLORS, PROJECT_TYPES, TASK_CHANNELS, DISTRIBUTION_GROUPE_BONY, DISTRIBUTION_GROUPE_BONY_RN, ALPINE_SITES, NISSAN_SITES, RDM_BRANDS, isMarketingRole } from '../constants';
import {
    Plus, Save, Trash2, FolderKanban, CheckCircle2, Circle, PlayCircle,
    CalendarCheck, Coins, TrendingUp, TrendingDown, Search, Filter, X,
    Archive, AlertTriangle, ArrowRight, Wallet, ArrowUp, ArrowDown, Lock, ChevronDown, ChevronRight, Check, PieChart, UserCircle, Sparkles, Maximize2, Paperclip, StickyNote
} from 'lucide-react';
import Avatar from '../components/Avatar';
import DatePicker from '../components/DatePicker';
import Select from '../components/Select';
import FloatingPanel from '../components/FloatingPanel';
import ExpertPanel, { useProjectFiles } from '../components/expert/ExpertPanel';
import TaskDetailPanel from '../components/expert/TaskDetailPanel';
import { ChampTexte, ChampNombre } from '../components/ChampDiffere';

// Puces marque minimalistes (mêmes teintes que BRAND_COLORS, charte identique)
const BRAND_DOT: Record<string, string> = {
  Renault: 'bg-[#ffcc33]',
  Dacia: 'bg-[#6a7551]',
  Alpine: 'bg-[#0055a4]',
  Nissan: 'bg-[#c3002f]',
  Mobilize: 'bg-purple-500',
  Groupe: 'bg-slate-500',
};

// Parse local (anti-décalage J+1) : 'YYYY-MM-DD' → Date à minuit local.
const parseLocalDate = (iso: string): Date => {
    const [y, m, d] = (iso || '').split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
};

// --- TRI DU TABLEAU DES TÂCHES ---------------------------------------------------
// Colonnes triables, dans l'ordre du tableau.
type TaskSortField = 'name' | 'provider' | 'channel' | 'status' | 'assignedUserId' | 'cost' | 'deadline';

// Ordre d'avancement des statuts, et NON l'ordre alphabétique : trier par statut doit
// suivre la progression du travail (« En cours » avant « Terminé »), pas l'alphabet, qui
// donnerait Programmé → Terminé → À faire → En cours.
// ℹ️ Volontairement local à cet écran : c'est un ordre d'AFFICHAGE, il n'a rien d'une
// règle métier et n'a donc pas sa place dans `constants.ts`.
const TASK_STATUS_ORDER: Record<string, number> = {
    Empty: 0, Todo: 1, InProgress: 2, Programmed: 3, Done: 4,
};

// En-tête de colonne cliquable. Reprend le vocabulaire visuel déjà en place sur l'en-tête
// triable de `pages/Campaigns.tsx` (libellé + flèche à 10 px), pour ne pas inventer un
// second style de tri dans l'application.
// La flèche n'apparaît que sur la colonne ACTIVE : afficher une double flèche grise sur
// les six autres surchargerait une ligne d'en-tête déjà dense.
// ⚠️ `whitespace-nowrap` OBLIGATOIRE : « NOM DE LA TÂCHE » mesure 91 px et se cassait
// en trois lignes quand sa colonne était comprimée, ce qui déformait toute la rangée
// d'en-tête. Le nowrap force la colonne à réclamer sa place au lieu de se replier.
// L'alignement suit le CONTENU de la colonne (centré pour les contrôles, à gauche pour
// le texte libre) : un titre centré au-dessus d'un champ texte aligné à gauche produit
// exactement le décalage qu'on cherche à corriger.
const TriTache: React.FC<{
    champ: TaskSortField;
    libelle: string;
    actif: TaskSortField;
    sens: 'asc' | 'desc';
    onTri: (c: TaskSortField) => void;
    align?: 'left' | 'center' | 'right';
}> = ({ champ, libelle, actif, sens, onTri, align = 'center' }) => (
    <button
        type="button"
        onClick={() => onTri(champ)}
        title={`Trier par ${libelle.toLowerCase()}`}
        className={`w-full flex items-center gap-1 uppercase whitespace-nowrap transition-colors hover:text-slate-900 dark:hover:text-white ${
            align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : ''
        } ${champ === actif ? 'text-slate-900 dark:text-white' : ''}`}
    >
        {libelle}
        {champ === actif && (sens === 'asc' ? <ArrowUp size={10} className="shrink-0" /> : <ArrowDown size={10} className="shrink-0" />)}
    </button>
);

// --- TEAM SECTION COMPONENT (extracted to use its own ref for fixed dropdown) ---
interface TeamSectionProps {
    assignedIds: string[];
    unassignedUsers: User[];
    allUsers: User[];
    canEdit: boolean;
    showDropdown: boolean;
    setShowDropdown: (v: boolean) => void;
    onAdd: (userId: string) => void;
    onRemove: (userId: string) => void;
}
const TeamSection: React.FC<TeamSectionProps> = ({
    assignedIds, unassignedUsers, allUsers, canEdit,
    showDropdown, setShowDropdown, onAdd, onRemove,
}) => {
    const btnRef = useRef<HTMLButtonElement>(null);

    const handleOpenDropdown = () => setShowDropdown(!showDropdown);

    return (
        <div className="pt-2">
            <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-3">Équipe projet</label>
            <div className="flex items-center gap-2 flex-wrap">
                {assignedIds.map(uid => {
                    const u = allUsers.find(x => x.id === uid);
                    if (!u) return null;
                    const canRemove = canEdit;
                    return (
                        <div key={uid} className="relative group/av">
                            <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={34} />
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover/av:opacity-100 pointer-events-none z-20 shadow-lg">
                                {u.name}<br /><span className="text-slate-400">{u.role}</span>
                            </div>
                            {canRemove && (
                                <button
                                    onClick={() => onRemove(u.id)}
                                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/av:opacity-100 transition shadow"
                                >
                                    <X size={8} className="text-white" />
                                </button>
                            )}
                        </div>
                    );
                })}

                {canEdit && unassignedUsers.length > 0 && (
                    <>
                        <button
                            ref={btnRef}
                            onClick={handleOpenDropdown}
                            className="w-[34px] h-[34px] rounded-full border-2 border-dashed border-bony-border text-slate-400 hover:border-bony-orange hover:text-bony-orange transition flex items-center justify-center"
                            title="Ajouter un membre"
                        >
                            <Plus size={14} />
                        </button>
                        <FloatingPanel open={showDropdown} onClose={() => setShowDropdown(false)} triggerRef={btnRef} width={220} minWidth={180} maxHeight={300} className="rounded-xl">
                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                {unassignedUsers.map(u => (
                                    <button
                                        key={u.id}
                                        onClick={() => onAdd(u.id)}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/5 transition text-left"
                                    >
                                        <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={26} />
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-bony-text leading-tight truncate">{u.name}</p>
                                            <p className="text-[9px] text-bony-muted truncate">{u.role}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </FloatingPanel>
                    </>
                )}

                {assignedIds.length === 0 && (
                    <span className="text-xs text-slate-400 italic">Aucun membre assigné</span>
                )}
            </div>
        </div>
    );
};

// --- FILTER COMPONENTS ---
const ALL_PROJ_PLAQUE_SITES = Object.values(PLAQUES_STRUCTURE).flat() as string[];
const PROJ_SPECIAL_SITES: string[] = ['Alpine', 'Nissan'];

interface ProjSitePickerProps { selected: string[]; onChange: (v: string[]) => void; }
const ProjSitePicker: React.FC<ProjSitePickerProps> = ({ selected, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [expandedPlaques, setExpandedPlaques] = useState<Set<string>>(new Set(Object.keys(PLAQUES_STRUCTURE)));
    const triggerRef = useRef<HTMLDivElement>(null);

    const toggle = (site: string) =>
        onChange(selected.includes(site) ? selected.filter(s => s !== site) : [...selected, site]);
    const togglePlaque = (plaqueSites: string[]) => {
        const allSel = plaqueSites.every(s => selected.includes(s));
        if (allSel) onChange(selected.filter(s => !plaqueSites.includes(s)));
        else onChange([...selected.filter(s => !plaqueSites.includes(s)), ...plaqueSites]);
    };
    const toggleExpandPlaque = (p: string) => {
        const next = new Set(expandedPlaques);
        next.has(p) ? next.delete(p) : next.add(p);
        setExpandedPlaques(next);
    };
    const selectAll = () => onChange([...ALL_PROJ_PLAQUE_SITES, ...PROJ_SPECIAL_SITES]);
    const clearAll = () => onChange([]);
    const isAll = selected.length === 0;

    const triggerLabel = isAll ? 'Tout le réseau' : selected.length === 1 ? selected[0] : `${selected.length} sites`;

    const handleOpen = () => setOpen(v => !v);

    return (
        <div ref={triggerRef} className="relative">
            {/* Pas de libellé ici : le panneau de filtres en pose déjà un au-dessus
                de chaque bloc, on affichait donc « PÉRIMÈTRE » deux fois de suite. */}
            <div className="flex flex-col">
                <button onClick={handleOpen} className="flex items-center gap-1.5 text-xs font-bold text-bony-orange hover:text-bony-violet transition whitespace-nowrap">
                    {triggerLabel}
                    <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
            </div>
            <FloatingPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} width={256} maxHeight={340} className="rounded-xl">
                                <div className="p-2 border-b border-bony-border shrink-0">
                                    <div className="flex items-center gap-2 bg-bony-dark border border-bony-border rounded-lg px-2 py-1.5">
                                        <Search size={13} className="text-slate-500 shrink-0" />
                                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un site…" className="flex-1 bg-transparent text-xs text-bony-text outline-none placeholder-bony-muted" />
                                        {search && <button onClick={() => setSearch('')}><X size={12} className="text-slate-400" /></button>}
                                    </div>
                                </div>
                                <div className="flex gap-1 px-2 py-1.5 border-b border-bony-border shrink-0">
                                    <button onClick={clearAll} className={`flex-1 text-[10px] font-bold py-1 rounded transition ${isAll ? 'bg-bony-orange/20 text-bony-orange border border-bony-orange/40' : 'text-slate-500 hover:text-bony-text hover:bg-white/5'}`}>Tout le réseau</button>
                                    <button onClick={selectAll} className="flex-1 text-[10px] font-bold py-1 rounded text-slate-500 hover:text-bony-text hover:bg-white/5 transition">Tout sélectionner</button>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
                                    {Object.entries(PLAQUES_STRUCTURE).map(([plaqueName, sites]) => {
                                        const filtered = sites.filter(s => !search || s.toLowerCase().includes(search.toLowerCase()));
                                        if (search && filtered.length === 0) return null;
                                        const expanded = expandedPlaques.has(plaqueName);
                                        const allSel = sites.every(s => selected.includes(s));
                                        const someSel = sites.some(s => selected.includes(s));
                                        return (
                                            <div key={plaqueName}>
                                                <div className="flex items-center px-2 py-1">
                                                    <button onClick={() => toggleExpandPlaque(plaqueName)} className="flex items-center gap-1 flex-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-bony-text transition">
                                                        <ChevronRight size={11} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
                                                        {plaqueName}
                                                    </button>
                                                    <button onClick={() => togglePlaque(sites as string[])} className={`w-4 h-4 rounded border flex items-center justify-center transition ${allSel ? 'bg-bony-orange border-bony-orange' : someSel ? 'bg-bony-orange/30 border-bony-orange/50' : 'border-bony-border hover:border-bony-orange/50'}`}>
                                                        {(allSel || someSel) && <Check size={10} className="text-white" />}
                                                    </button>
                                                </div>
                                                {(expanded || search) && (search ? filtered : sites).map(site => (
                                                    <button key={site} onClick={() => toggle(site)} className="w-full flex items-center justify-between gap-2 pl-6 pr-2 py-1.5 text-xs hover:bg-white/5 transition">
                                                        <span className={`truncate min-w-0 ${selected.includes(site) ? 'text-bony-text font-bold' : 'text-slate-500'}`}>{site}</span>
                                                        {selected.includes(site) && <Check size={12} className="text-bony-orange shrink-0" />}
                                                    </button>
                                                ))}
                                            </div>
                                        );
                                    })}
                                    <div>
                                        <div className="px-2 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Entités Spécifiques</div>
                                        {PROJ_SPECIAL_SITES.filter(s => !search || s.toLowerCase().includes(search.toLowerCase())).map(site => (
                                            <button key={site} onClick={() => toggle(site)} className="w-full flex items-center justify-between gap-2 pl-6 pr-2 py-1.5 text-xs hover:bg-white/5 transition">
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

const PROJ_BRAND_CHIPS: BrandType[] = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize'];
interface ProjBrandPickerProps { selected: BrandType[]; onChange: (v: BrandType[]) => void; }
const ProjBrandPicker: React.FC<ProjBrandPickerProps> = ({ selected, onChange }) => {
    const isAll = selected.length === 0;
    const toggle = (b: BrandType) => onChange(selected.includes(b) ? selected.filter(x => x !== b) : [...selected, b]);
    // Libellé retiré : le panneau de filtres affiche déjà « Marques » juste au-dessus.
    return (
        <div className="flex flex-col gap-1">
            <div className="flex flex-wrap gap-1.5">
                <button onClick={() => onChange([])} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${isAll ? 'bg-bony-gradient border-transparent text-white shadow' : 'bg-transparent border-bony-border text-slate-500 hover:border-bony-orange/50 dark:hover:text-white hover:text-slate-900'}`}>Toutes</button>
                {PROJ_BRAND_CHIPS.map(b => {
                    const active = selected.includes(b);
                    return (
                        <button key={b} onClick={() => toggle(b)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${active ? `${BRAND_COLORS[b]} scale-105 shadow` : 'bg-transparent border-bony-border text-slate-500 hover:border-bony-orange/50 dark:hover:text-white hover:text-slate-900'}`}>{b}</button>
                    );
                })}
            </div>
        </div>
    );
};

const PROJ_SERVICE_CHIPS: ServiceType[] = ['VN', 'VO', 'APV', 'PR'];
interface ProjServicePickerProps { selected: ServiceType[]; onChange: (v: ServiceType[]) => void; }
const ProjServicePicker: React.FC<ProjServicePickerProps> = ({ selected, onChange }) => {
    const isAll = selected.length === 0;
    const toggle = (s: ServiceType) => onChange(selected.includes(s) ? selected.filter(x => x !== s) : [...selected, s]);
    // Libellé retiré : le panneau de filtres affiche déjà « Services » juste au-dessus.
    return (
        <div className="flex flex-col gap-1">
            <div className="flex flex-wrap gap-1.5">
                <button onClick={() => onChange([])} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${isAll ? 'bg-bony-gradient border-transparent text-white shadow' : 'bg-transparent border-bony-border text-slate-500 hover:border-bony-orange/50 dark:hover:text-white hover:text-slate-900'}`}>Tous</button>
                {PROJ_SERVICE_CHIPS.map(s => {
                    const active = selected.includes(s);
                    return (
                        <button key={s} onClick={() => toggle(s)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${active ? `${SERVICE_COLORS[s]} scale-105 shadow` : 'bg-transparent border-bony-border text-slate-500 hover:border-bony-orange/50 dark:hover:text-white hover:text-slate-900'}`}>{s}</button>
                    );
                })}
            </div>
        </div>
    );
};

// Filtre « Utilisateur rattaché ».
// ⚠️ En DROPDOWN et non en puces comme les marques et les services : une puce par
// personne occupait quatre lignes du panneau à elle seule, et la liste grandit avec
// l'équipe alors que marques et services sont des listes courtes et figées. On décalque
// donc `ProjSitePicker` (même FloatingPanel, même recherche, mêmes conventions
// visuelles) plutôt que d'inventer un troisième style de filtre.
// ⚠️ Ne propose que l'ÉQUIPE MARKETING (voir MARKETING_TEAM_ROLES) : proposer un Guest
// ou un chef de site n'aurait aucun sens, ils ne sont jamais rattachés à un projet.
// La liste reçue est déjà filtrée par l'appelant, pour ne pas refaire le test ici.
interface ProjUserPickerProps { users: User[]; selected: string[]; onChange: (v: string[]) => void; }
const ProjUserPicker: React.FC<ProjUserPickerProps> = ({ users, selected, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const triggerRef = useRef<HTMLDivElement>(null);

    const isAll = selected.length === 0;
    const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
    const visibles = users.filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()));

    // Un seul sélectionné : on nomme la personne plutôt que d'afficher « 1 utilisateur ».
    const triggerLabel = isAll
        ? 'Tous les utilisateurs'
        : selected.length === 1
            ? (users.find(u => u.id === selected[0])?.name ?? '1 utilisateur')
            : `${selected.length} utilisateurs`;

    return (
        <div ref={triggerRef} className="relative">
            <div className="flex flex-col">
                <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 text-xs font-bold text-bony-orange hover:text-bony-violet transition whitespace-nowrap">
                    {triggerLabel}
                    <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
            </div>
            <FloatingPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} width={256} maxHeight={340} className="rounded-xl">
                <div className="p-2 border-b border-bony-border shrink-0">
                    <div className="flex items-center gap-2 bg-bony-dark border border-bony-border rounded-lg px-2 py-1.5">
                        <Search size={13} className="text-slate-500 shrink-0" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une personne…" className="flex-1 bg-transparent text-xs text-bony-text outline-none placeholder-bony-muted" />
                        {search && <button onClick={() => setSearch('')}><X size={12} className="text-slate-400" /></button>}
                    </div>
                </div>
                <div className="flex gap-1 px-2 py-1.5 border-b border-bony-border shrink-0">
                    <button onClick={() => onChange([])} className={`flex-1 text-[10px] font-bold py-1 rounded transition ${isAll ? 'bg-bony-orange/20 text-bony-orange border border-bony-orange/40' : 'text-slate-500 hover:text-bony-text hover:bg-white/5'}`}>Tous les utilisateurs</button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
                    {visibles.length === 0 && (
                        <div className="px-3 py-4 text-center text-[11px] text-slate-500">Aucune personne trouvée.</div>
                    )}
                    {visibles.map(u => (
                        <button key={u.id} onClick={() => toggle(u.id)} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-white/5 transition">
                            <Avatar userId={u.id} name={u.name} color={u.avatarColor} size={20} />
                            <span className={`flex-1 text-left truncate min-w-0 ${selected.includes(u.id) ? 'text-bony-text font-bold' : 'text-slate-500'}`}>{u.name}</span>
                            {selected.includes(u.id) && <Check size={12} className="text-bony-orange shrink-0" />}
                        </button>
                    ))}
                </div>
            </FloatingPanel>
        </div>
    );
};

interface ProjectsProps {
    viewMode?: 'current' | 'archived';
}

const Projects: React.FC<ProjectsProps> = ({ viewMode = 'current' }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProjectRaw] = useState<Project | null>(null);
  const SESSION_SELECTED_KEY = `gearbox_session_projects_${viewMode}_selectedId`;

  /**
   * ⚠️ MIROIR DU PROJET OUVERT — c'est LUI que lit la couche réseau, jamais la closure
   * d'un rendu. Avant le correctif 48, `addTask` et `updateTask` construisaient leur
   * corps depuis le `selectedProject` capturé au rendu où l'événement s'était produit :
   * deux modifications parties avant le retour du premier PUT portaient donc chacune une
   * liste de tâches incomplète, et le diff transactionnel du serveur SUPPRIMAIT la tâche
   * créée par l'autre (mesuré le 27/08/2026 : 4 clics rapides sur « + AJOUTER UNE
   * TÂCHE » ne donnaient qu'UNE ligne).
   *
   * ⚠️ Un `setState(prev => …)` seul ne suffit pas : la charge doit être ENVOYÉE, donc
   * l'objet doit être lisible HORS de l'updater — un `fetch` dans un updater est un effet
   * de bord dans un réducteur, rejoué deux fois en StrictMode. Le miroir n'est pas un
   * raccourci pour éviter l'état fonctionnel, c'est le seul endroit où la couche réseau
   * peut lire un « courant » cohérent.
   */
  const projetRef = useRef<Project | null>(null);

  /**
   * ⚠️ SEULE PORTE d'écriture du projet sélectionné — même doctrine que `TASK_FIELDS`
   * côté serveur ou `constants.ts` pour le routage budgétaire. Le miroir doit être posé
   * ICI et NULLE PART ailleurs, sinon il diverge de l'état React et la couche réseau
   * envoie un instantané périmé.
   */
  const setSelectedProject = useCallback((p: Project | null) => {
    projetRef.current = p;
    setSelectedProjectRaw(p);
    if (p) sessionStorage.setItem(SESSION_SELECTED_KEY, p.id);
    else sessionStorage.removeItem(SESSION_SELECTED_KEY);
  }, [SESSION_SELECTED_KEY]);

  /**
   * Nombre de champs de saisie ayant actuellement le focus (alimenté par
   * `ChampDiffere`). ⚠️ Sert à interdire au temps réel de réasseoir le projet ouvert
   * pendant une frappe : la réponse serveur est par construction PLUS ANCIENNE que le
   * brouillon en cours.
   */
  const champsFocalisesRef = useRef(0);
  /** Rattrapage différé : id du projet dont la réinstallation a été refusée. */
  const reseatEnAttenteRef = useRef<string | null>(null);

  /**
   * Passé à chaque `ChampDiffere` comme `onFocusChange`. Plomberie explicite plutôt
   * qu'un `document.activeElement.closest(...)` : ce dernier marcherait sans câblage mais
   * coupleraient l'écran à la structure du DOM, en douce.
   */
  const suivreFocusChamp = useCallback((focus: boolean) => {
    champsFocalisesRef.current = Math.max(0, champsFocalisesRef.current + (focus ? 1 : -1));
    // Le dernier champ quitté libère le rattrapage mis de côté pendant la saisie.
    if (champsFocalisesRef.current === 0 && reseatEnAttenteRef.current) {
      const id = reseatEnAttenteRef.current;
      reseatEnAttenteRef.current = null;
      if (!fileSauvegardeProjet.aDesEcrituresEnCours(id)) rechargerProjetsRef.current?.();
    }
  }, []);

  /** Miroir de `loadProjects` : `suivreFocusChamp` est stable et ne doit pas se recréer. */
  const rechargerProjetsRef = useRef<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  // Répartition budgétaire : bascule d'affichage/saisie (UI only) — le modèle reste en %
  const [budgetDistMode, setBudgetDistMode] = useState<'%' | '€'>('%');

  // --- PERMISSIONS ---
  // ⚠️ Doit rester aligné sur `EDIT_ROLES` de `backend/src/routes/projects.ts`, seul
  // garde-fou réel : si l'interface est plus permissive, les boutons partent en 403 ;
  // si elle est plus restrictive, le droit existe mais reste inaccessible — c'était
  // exactement le cas du Digital Manager avant le 05/08/2026.
  const EDIT_ROLES: UserRole[] = ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager'];
  const canEdit = !!user && EDIT_ROLES.includes(user.role);

  // --- ARCHIVE MODAL STATE ---
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [projectToArchive, setProjectToArchive] = useState<Project | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // --- LIST WIDTH (resizable) ---
  const LIST_WIDTH_KEY = 'gearbox_projects_list_width';
  const [listWidth, setListWidth] = useState<number>(() => {
    const saved = localStorage.getItem(LIST_WIDTH_KEY);
    return saved ? Math.min(480, Math.max(240, parseInt(saved, 10))) : 320;
  });
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = listWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = ev.clientX - startX.current;
      const next = Math.min(480, Math.max(240, startWidth.current + delta));
      setListWidth(next);
    };
    const onUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setListWidth(prev => {
        localStorage.setItem(LIST_WIDTH_KEY, String(prev));
        return prev;
      });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [listWidth]);

  // --- FILTER STATES ---
  const [showFilters, setShowFilters] = useSessionState<boolean>(`projects_${viewMode}_showFilters`, false);
  const [searchTerm, setSearchTerm] = useSessionState<string>(`projects_${viewMode}_searchTerm`, '');
  const [filterSites, setFilterSites] = useSessionState<string[]>(`projects_${viewMode}_filterSites`, []);
  const [filterBrands, setFilterBrands] = useSessionState<BrandType[]>(`projects_${viewMode}_filterBrands`, []);
  const [filterServices, setFilterServices] = useSessionState<ServiceType[]>(`projects_${viewMode}_filterServices`, []);
  const [filterUsers, setFilterUsers] = useSessionState<string[]>(`projects_${viewMode}_filterUsers`, []);
  const [filterType, setFilterType] = useSessionState<ProjectType | 'All'>(`projects_${viewMode}_filterType`, 'All');
  const [filterStatus, setFilterStatus] = useSessionState<string>(`projects_${viewMode}_filterStatus`, 'All');
  const [filterDateFrom, setFilterDateFrom] = useSessionState<string>(`projects_${viewMode}_filterDateFrom`, '');
  const [filterDateTo, setFilterDateTo] = useSessionState<string>(`projects_${viewMode}_filterDateTo`, '');
  const [sortOrder, setSortOrder] = useSessionState<'asc' | 'desc'>(`projects_${viewMode}_sortOrder`, 'desc');

  // --- Tri du tableau des TÂCHES (interne au projet ouvert) ---
  // Clé NON préfixée par `viewMode` : c'est une préférence d'affichage du tableau, elle
  // n'a pas de raison de différer entre les projets courants et les archives.
  // Défaut « échéance croissante » = ce que l'équipe doit traiter en premier. Avant ce
  // lot il n'y avait aucun tri du tout : `include: { tasks: true }` est envoyé SANS
  // `orderBy`, l'ordre renvoyé par Postgres n'était donc même pas stable d'une
  // sauvegarde à l'autre.
  const [taskSortField, setTaskSortField] = useSessionState<TaskSortField>('projects_taskSortField', 'deadline');
  const [taskSortDir, setTaskSortDir] = useSessionState<'asc' | 'desc'>('projects_taskSortDir', 'asc');

  // Équipe marketing : la seule liste PROPOSÉE au choix (filtre, ajout à l'équipe,
  // assignation d'une tâche).
  // ⚠️ NE JAMAIS filtrer `users` lui-même : c'est lui qui RÉSOUT les personnes déjà
  // rattachées. Un membre d'équipe dont le rôle sortirait de la liste disparaîtrait
  // alors de l'affichage tout en restant en base — invisible et impossible à retirer.
  // On restreint donc les listes de CHOIX, jamais la liste de RÉSOLUTION.
  const marketingUsers = useMemo(() => users.filter(u => isMarketingRole(u.role)), [users]);

  // --- ORDRE D'AFFICHAGE DES TÂCHES ------------------------------------------------
  // ⚠️ GEL PENDANT LA SAISIE — À CONSERVER, MAIS SA RAISON A CHANGÉ AU CORRECTIF 48.
  // Avant : `updateTask` déclenchait un PUT à CHAQUE FRAPPE, donc avec un tri par nom,
  // taper « Flyer » faisait sauter la ligne cinq fois et le champ perdait le focus dès la
  // première lettre. Depuis le correctif 48 la saisie est différée (`ChampDiffere`) : la
  // clé de tri ne bouge plus pendant la frappe, et c'est précisément ce qui rend tentant
  // de SUPPRIMER ce gel. Ne pas le faire — il reste le seul garde-fou contre le retri
  // déclenché par la modification d'un COLLÈGUE pendant qu'on tape, qui sortirait la
  // ligne de sous le curseur. On fige donc l'ordre tant qu'un champ texte est en cours
  // d'édition (onFocus), et on le libère en sortant (onBlur).
  // Les Select et le DatePicker ne gèlent rien — ils changent leur valeur en une seule
  // action, le réordonnancement immédiat y est le comportement attendu.
  const [ordreGele, setOrdreGele] = useState<string[] | null>(null);

  const compareTasks = useCallback((a: Task, b: Task): number => {
    const sens = taskSortDir === 'asc' ? 1 : -1;
    const texte = (x?: string) => (x || '').toLocaleLowerCase('fr');
    switch (taskSortField) {
      case 'deadline': {
        // Une tâche SANS échéance reste toujours en dernier, dans les DEUX sens : en
        // décroissant, une chaîne vide remonterait sinon en tête du tableau alors
        // qu'elle ne porte aucune information de date.
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline) * sens;
      }
      case 'cost':
        return ((a.cost || 0) - (b.cost || 0)) * sens;
      case 'status':
        return ((TASK_STATUS_ORDER[a.status] ?? 0) - (TASK_STATUS_ORDER[b.status] ?? 0)) * sens;
      case 'assignedUserId': {
        // Tri sur le NOM résolu, jamais sur l'uuid : un classement par identifiant
        // technique est illisible. Les non-assignés partent en dernier, comme les
        // tâches sans échéance.
        const nom = (id?: string) => (id ? users.find(u => u.id === id)?.name || '' : '');
        const na = nom(a.assignedUserId), nb = nom(b.assignedUserId);
        if (!na && !nb) return 0;
        if (!na) return 1;
        if (!nb) return -1;
        return na.localeCompare(nb, 'fr') * sens;
      }
      default:
        return texte(a[taskSortField] as string).localeCompare(texte(b[taskSortField] as string), 'fr') * sens;
    }
  }, [taskSortField, taskSortDir, users]);

  const tachesAffichees = useMemo(() => {
    const taches = selectedProject?.tasks ?? [];
    if (ordreGele) {
      // Ordre figé : on rejoue les ids mémorisés, en écartant ceux qui ont disparu et
      // en ajoutant en fin ceux qui sont apparus depuis. Sans ces deux précautions,
      // supprimer ou ajouter une tâche en pleine saisie ferait disparaître une ligne.
      const parId = new Map(taches.map(t => [t.id, t]));
      const ordonnees = ordreGele.map(id => parId.get(id)).filter((t): t is Task => !!t);
      const vues = new Set(ordonnees.map(t => t.id));
      return [...ordonnees, ...taches.filter(t => !vues.has(t.id))];
    }
    // `tasks` n'est jamais réordonné en place : c'est un ordre d'AFFICHAGE. `updateTask`
    // et `removeTask` opèrent par `task.id`, jamais par index — le tri ne peut donc pas
    // faire modifier la mauvaise ligne.
    return [...taches].sort(compareTasks);
  }, [selectedProject?.tasks, ordreGele, compareTasks]);

  // Clic sur un en-tête : même colonne = inversion du sens, autre colonne = tri
  // croissant sur elle. Libère le gel au passage (on ne trie pas un ordre figé).
  const trierTaches = useCallback((field: TaskSortField) => {
    setOrdreGele(null);
    if (field === taskSortField) setTaskSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setTaskSortField(field); setTaskSortDir('asc'); }
  }, [taskSortField, setTaskSortField, setTaskSortDir]);

  // Gèle l'ordre courant à l'entrée dans un champ texte (sans écraser un gel déjà posé,
  // le passage d'un champ à l'autre enchaînant blur puis focus).
  const gelerOrdre = useCallback(() => {
    setOrdreGele(prev => prev ?? tachesAffichees.map(t => t.id));
  }, [tachesAffichees]);

  // --- MODE EXPERT ---------------------------------------------------------------
  // ⚠️ Le hook ne charge RIEN tant que le mode est éteint : `useProjectFiles` rend une
  // liste vide sans appeler l'API. Un projet ordinaire ne paie donc pas une requête de
  // plus, et l'écran reste strictement celui d'avant ce lot.
  const modeExpert = !!selectedProject?.expertMode;
  const { fichiers, rechargerFichiers } = useProjectFiles(selectedProject?.id ?? null, modeExpert);
  const [tacheOuverte, setTacheOuverte] = useState<string | null>(null);

  // Changer de projet ferme le détail de tâche : son id ne désigne rien dans le nouveau.
  useEffect(() => { setTacheOuverte(null); }, [selectedProject?.id]);
  // Éteindre le mode ferme aussi le panneau, qui n'aurait plus de raison d'être ouvert.
  useEffect(() => { if (!modeExpert) setTacheOuverte(null); }, [modeExpert]);

  const scrollRef = useScrollRestore(`projects_${viewMode}`);

  useEffect(() => {
    loadProjects();
    db.getUsers().then(setUsers);

    const handleNavigation = (e: CustomEvent) => {
        if (e.detail && e.detail.projectId) {
            const targetId = e.detail.projectId;
            window.sessionStorage.setItem('pendingProjectId', targetId);
            
            db.getProjects().then(data => {
                setProjects(data);
                const found = data.find(p => p.id === targetId);
                if (found) {
                    setSelectedProject(found);
                }
            });
        }
    };
    window.addEventListener('gearbox-navigate' as any, handleNavigation);
    return () => window.removeEventListener('gearbox-navigate' as any, handleNavigation);
  }, []);

  // Temps réel : projets. `loadProjects` re-synchronise aussi le projet ouvert par son
  // id, donc la sélection n'est pas perdue quand un collègue modifie ce projet.
  useRealtimeSync(RT_EVENTS.projects, () => { loadProjects(); });

  // ⚠️ ABONNEMENT SÉPARÉ, et c'est le point. `RT_EVENTS.users` était branché sur le MÊME
  // rappel que les projets : une simple modification de profil ou de photo d'un collègue
  // déclenchait donc un rechargement COMPLET des projets, et pouvait réasseoir le projet
  // ouvert en pleine saisie. Or cet écran ne lit `users` que pour résoudre les noms des
  // personnes assignées — il n'a aucune raison de recharger les projets pour ça.
  useRealtimeSync(RT_EVENTS.users, () => { db.getUsers().then(setUsers).catch(() => {}); });

  useEffect(() => {
      setSelectedProject(null);
  }, [viewMode]);

  useEffect(() => {
      setShowDeleteConfirm(false);
  }, [selectedProject]);

  // Changer de PROJET libère le gel de l'ordre des tâches : celui de l'ancien projet ne
  // désigne aucune tâche du nouveau, et un gel orphelin annulerait le tri.
  // ⚠️ Dépendance sur l'`id` et non sur `selectedProject` : l'objet est recréé à chaque
  // sauvegarde (donc à chaque frappe), ce qui libérerait le gel aussitôt qu'il est posé.
  useEffect(() => {
      setOrdreGele(null);
  }, [selectedProject?.id]);

  const loadProjects = async () => {
    const data = await db.getProjects();
    setProjects(data);

    const pendingId = window.sessionStorage.getItem('pendingProjectId');
    const savedId = window.sessionStorage.getItem(`gearbox_session_projects_${viewMode}_selectedId`);
    const targetId = pendingId || savedId;

    if (targetId) {
        const found = data.find(p => p.id === targetId);
        if (found) {
            const isArchived = found.status === 'Archived';
            if ((viewMode === 'archived' && isArchived) || (viewMode === 'current' && !isArchived)) {
                // ⚠️ ON NE RÉASSOIT PAS le projet ouvert si une écriture est en vol ou si un
                // champ a le focus : la réponse serveur est par construction PLUS ANCIENNE
                // que le brouillon en cours de saisie, et la réassoir écraserait la frappe.
                // Même règle que l'exclusion de l'auteur côté socket
                // (backend/src/realtime/index.ts), pour la même raison : ce qui vient du
                // serveur ne gagne jamais contre une saisie vive. Le rattrapage n'est pas
                // perdu — `suivreFocusChamp` le rejoue dès que le focus est relâché.
                if (fileSauvegardeProjet.aDesEcrituresEnCours(found.id) || champsFocalisesRef.current > 0) {
                    reseatEnAttenteRef.current = found.id;
                } else {
                    // Passe par la porte unique, qui pose AUSSI le miroir : `setSelectedProjectRaw`
                    // seul le laissait diverger de l'état React, et la couche réseau envoyait
                    // alors un instantané périmé.
                    setSelectedProject(found);
                }
            }
        }
        if (pendingId) window.sessionStorage.removeItem('pendingProjectId');
    }
  };
  // Rattachement du miroir, pour que `suivreFocusChamp` (stable) puisse rejouer le
  // rechargement mis de côté pendant une saisie sans se recréer à chaque rendu.
  rechargerProjetsRef.current = loadProjects;

  /**
   * Message d'échec de sauvegarde, choisi d'après le STATUT.
   *
   * ⚠️ `apiFetch` (services/dataService.ts) DISTINGUE DÉJÀ les cas : `ApiError(0)` pour un
   * réseau injoignable, `ApiError(status)` pour une réponse HTTP. C'est l'appelant qui
   * jetait la distinction, et qui affichait « serveur injoignable ? » pour un 403, un
   * 404, un 500 et une coupure réseau indifféremment — donc le message le plus important
   * de l'application était aussi le moins fiable, et un problème de CONCURRENCE a passé
   * pour une panne réseau pendant des mois. Même branchement que `pages/Material.tsx` et
   * `pages/Digital.tsx`, qui lisent bien `ApiError.status`.
   */
  const onEchecSauvegarde = useCallback((erreur: unknown) => {
    console.error('Project update failed:', erreur);
    if (!(erreur instanceof ApiError)) { alert('Échec inattendu de la sauvegarde.'); return; }
    switch (erreur.status) {
      case 0:
        alert('Serveur injoignable. Vos modifications ne sont PAS perdues : elles repartiront à la prochaine sauvegarde — ne fermez pas l\'onglet.');
        return;
      case 503:
        alert('La base est momentanément saturée. Plusieurs tentatives ont échoué : réessayez dans une minute.');
        return;
      // `apiFetch` a déjà purgé le jeton et émis 'gearbox-auth-expired' : AuthContext
      // déconnecte proprement, une alerte de plus n'apporterait rien.
      case 401: return;
      case 403:
        alert('Droits insuffisants pour modifier ce projet.');
        return;
      // ⚠️ SEULS le 404 et le 409 justifient un rechargement : là, l'état local est
      // réellement faux. Recharger après N'IMPORTE QUEL échec — ce que faisait cet écran
      // — détruisait le travail non sauvegardé sur une simple saturation passagère, alors
      // qu'il suffisait de réessayer.
      case 404:
        alert('Ce projet n\'existe plus (supprimé depuis un autre poste ?).');
        setSelectedProject(null);
        loadProjects();
        return;
      case 409:
        alert(erreur.message || 'Conflit de sauvegarde. Les données ont été rechargées.');
        loadProjects();
        return;
      default:
        // 400 / 413 / 500 : le serveur rend déjà un message français précis.
        alert(erreur.message || 'Échec de la sauvegarde du projet.');
    }
  }, [setSelectedProject]);

  /**
   * Applique `f` à l'état COURANT (le miroir), recalcule les agrégats dérivés, pose
   * l'état optimiste et met la sauvegarde EN FILE.
   *
   * ⚠️ Remplace l'ancien `handleUpdateProject(objet)`, qui recevait un objet construit
   * depuis la closure du rendu — donc périmé dès qu'une deuxième modification partait
   * avant le retour du premier PUT. Ici `f` reçoit toujours le projet réellement à jour.
   *
   * ⚠️ La sauvegarde passe par `fileSauvegardeProjet` : UN SEUL PUT en vol par projet.
   * Ne jamais rappeler `db.updateProject` directement depuis cet écran, ce serait
   * rouvrir la course que la file existe pour fermer.
   */
  const muterProjet = useCallback((f: (p: Project) => Project) => {
    if (!canEdit) return;
    const courant = projetRef.current;
    if (!courant) return;

    const suivant = recalculerProjet(f(courant));
    setSelectedProject(suivant);
    setProjects(prev => prev.map(p => (p.id === suivant.id ? suivant : p)));
    setSaving(true);

    fileSauvegardeProjet.pousser(suivant, {
      onSucces: (projetServeur) => {
        // ⚠️ La réponse n'est appliquée que si RIEN n'attend derrière et qu'aucun champ
        // n'a le focus : sinon elle est plus ancienne que ce que l'utilisateur est en
        // train de taper, et l'appliquer écraserait sa saisie.
        if (fileSauvegardeProjet.aDesEcrituresEnCours(projetServeur.id)) return;
        if (champsFocalisesRef.current > 0) return;
        if (projetRef.current?.id !== projetServeur.id) return;
        setSelectedProject(projetServeur);
        setProjects(prev => prev.map(p => (p.id === projetServeur.id ? projetServeur : p)));
      },
      onEchec: onEchecSauvegarde,
      onRepos: () => setSaving(false),
    });
  }, [canEdit, setSelectedProject, onEchecSauvegarde]);

  /**
   * Écriture d'un champ de TÂCHE venue d'un champ à sauvegarde différée.
   * ⚠️ Refuse l'écriture si la tâche n'existe PLUS dans l'état courant : c'est ce qui
   * empêche le flush au démontage de `ChampDiffere` de faire RESSUSCITER une ligne qu'on
   * vient de supprimer en pleine saisie.
   */
  const validerChampTache = useCallback((taskId: string, champ: keyof Task, valeur: any) => {
    if (!projetRef.current?.tasks.some(t => t.id === taskId)) return;
    muterProjet(p => ({ ...p, tasks: p.tasks.map(t => (t.id === taskId ? { ...t, [champ]: valeur } : t)) }));
  }, [muterProjet]);

  const handleStatusChange = async (newStatus: string) => {
      if (!selectedProject || !canEdit) return;

      if (newStatus === 'Archived') {
          setProjectToArchive({ ...selectedProject, status: 'Archived' });
          setShowArchiveConfirm(true);
          return;
      }

      if (selectedProject.status === 'Archived' && newStatus !== 'Archived') {
          // ⚠️ Plus d'`await` : la file de sauvegarde detient deja son instantane, donc
          // deselectionner juste apres ne l'affecte pas.
          muterProjet(p => ({ ...p, status: newStatus as any }));
          setSelectedProject(null);
          return;
      }

      muterProjet(p => ({ ...p, status: newStatus as any }));
  };

  const confirmArchive = async () => {
      if (projectToArchive && canEdit) {
          // ⚠️ On archive l'etat COURANT et non `projectToArchive`, capture au clic :
          // entre le clic et la confirmation, l'utilisateur a pu modifier le projet.
          muterProjet(p => ({ ...p, status: 'Archived' }));
          if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a archivé le projet', entity: 'project', entityName: projectToArchive.name, entityId: projectToArchive.id, timestamp: new Date().toISOString() });
          setShowArchiveConfirm(false);
          setProjectToArchive(null);
          setSelectedProject(null);
      }
  };

  const handleDeleteProject = async (id: string) => {
      try {
          const deletedProject = projects.find(p => p.id === id);
          await db.deleteProject(id);
          setProjects(prev => prev.filter(p => p.id !== id));
          setSelectedProject(null);
          if (user && deletedProject) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a supprimé le projet', entity: 'project', entityName: deletedProject.name, entityId: deletedProject.id, timestamp: new Date().toISOString() });
      } catch (error) {
          console.error("Error deleting project:", error);
          alert("Une erreur est survenue lors de la suppression.");
      }
  };

  const openCreateModal = () => {
    if (!canEdit) return;
    setNewProjectName('');
    setShowCreateModal(true);
  };

  const confirmCreateProject = async () => {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    setShowCreateModal(false);
    setNewProjectName('');
    const newProject: Project = {
      id: Math.random().toString(36).substr(2, 9),
      name: trimmed,
      site: 'Clermont',
      sites: ['Clermont'],
      budgetDistribution: { 'Clermont': 100 },
      service: ['VN'],
      brands: ['Renault'],
      projectType: 'OP Clients',
      status: 'Draft',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      budgetPlanned: 0,
      budgetActual: 0,
      description: '',
      progress: 0,
      tasks: [],
      assignedUsers: user ? [user.id] : [],
    };
    try {
      const created = await db.createProject(newProject);
      setProjects(prev => [...prev, created]);
      setSelectedProject(created);
    } catch (error) {
      console.error('Project creation failed:', error);
      alert('Échec de la création du projet (serveur injoignable ?).');
      return;
    }
    if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action: 'a créé le projet', entity: 'project', entityName: newProject.name, entityId: newProject.id, timestamp: new Date().toISOString() });
  };

  const updateSiteSelection = (newSite: string) => {
      if (!selectedProject || !canEdit) return;

      // ⚠️ Tout le calcul se fait DANS le mutateur, donc sur le projet reellement a jour.
      // Le derouler avant l'appel le ferait repartir de la closure du rendu — c'est
      // exactement le defaut que le correctif 48 ferme.
      muterProjet(projetCourant => {
      let newSites = [...(projetCourant.sites || [])];
      // If sites was undefined (legacy), init with current site
      if (!projetCourant.sites && projetCourant.site) {
          newSites = [projetCourant.site];
      }

      let newDistribution = { ...(projetCourant.budgetDistribution || {}) };
      let mainSite = projetCourant.site;

      const isGroupMode = (s: string) => s === 'GROUPE BONY' || s === 'GROUPE BONY (R/N)';

      if (newSite === 'GROUPE BONY') {
          newSites = Object.keys(DISTRIBUTION_GROUPE_BONY);
          newDistribution = { ...DISTRIBUTION_GROUPE_BONY };
          mainSite = 'GROUPE BONY';
      } else if (newSite === 'GROUPE BONY (R/N)') {
          newSites = Object.keys(DISTRIBUTION_GROUPE_BONY_RN);
          newDistribution = { ...DISTRIBUTION_GROUPE_BONY_RN };
          mainSite = 'GROUPE BONY (R/N)';
      } else {
          // If we were in a group mode, clear everything first
          if (isGroupMode(mainSite)) {
              newSites = [];
          }

          // Toggle site
          if (newSites.includes(newSite)) {
              newSites = newSites.filter(s => s !== newSite);
          } else {
              newSites.push(newSite);
          }

          // Update mainSite for display
          if (newSites.length === 0) mainSite = '';
          else if (newSites.length === 1) mainSite = newSites[0];
          else mainSite = newSites.join(', ');

          // Recalculate distribution for manual mode (Equal split by default)
          if (newSites.length > 0) {
              // Preserve existing values if possible? No, user said "Par défaut la répartition est égale"
              // But if I uncheck one site, I should rebalance others?
              // Simple approach: Reset to equal split whenever selection changes in manual mode.
              const equalShare = 100 / newSites.length;
              newDistribution = {};
              newSites.forEach(s => newDistribution[s] = equalShare);
          } else {
              newDistribution = {};
          }
      }

      return { ...projetCourant, site: mainSite, sites: newSites, budgetDistribution: newDistribution };
      });
  };

  const updateBudgetDistribution = (site: string, value: number) => {
      if (!selectedProject || !canEdit) return;
      muterProjet(p => ({ ...p, budgetDistribution: { ...(p.budgetDistribution || {}), [site]: value } }));
  };

  const toggleService = (s: ServiceType) => {
      if (!selectedProject || !canEdit) return;
      muterProjet(p => {
          const currentServices = p.service || [];
          let newServices: ServiceType[] = [];
          if (s === 'Tous Services') {
              newServices = currentServices.includes('Tous Services') ? [] : ['Tous Services'];
          } else {
              const temp = currentServices.filter(svc => svc !== 'Tous Services');
              newServices = temp.includes(s) ? temp.filter(svc => svc !== s) : [...temp, s];
          }
          return { ...p, service: newServices };
      });
  };

  const toggleBrand = (b: BrandType) => {
      if (!selectedProject || !canEdit) return;
      muterProjet(p => {
          const currentBrands = p.brands || [];
          let newBrands: BrandType[] = [];
          // ⚠️ Holding est un TAG EXCLUSIF (regle metier, CLAUDE.md) : le poser retire
          // toute autre marque, et poser une autre marque le retire. Ne pas y toucher.
          if (b === 'Holding') {
              newBrands = currentBrands.includes('Holding') ? [] : ['Holding'];
          } else {
              const temp = currentBrands.filter(br => br !== 'Holding');
              newBrands = temp.includes(b) ? temp.filter(br => br !== b) : [...temp, b];
          }
          return { ...p, brands: newBrands };
      });
  };

  const addTask = () => {
      if (!selectedProject || !canEdit) return;
      const newTask: Task = { id: Math.random().toString(36).substr(2, 9), name: '', channel: '', cost: 0, status: 'Todo' };
      muterProjet(p => ({ ...p, tasks: [...p.tasks, newTask] }));
  };

  const updateTask = (taskId: string, field: keyof Task, value: any) => {
      if (!selectedProject || !canEdit) return;
      muterProjet(p => ({ ...p, tasks: p.tasks.map(t => (t.id === taskId ? { ...t, [field]: value } : t)) }));
  };

  const removeTask = (taskId: string) => {
      if (!selectedProject || !canEdit) return;
      muterProjet(p => ({ ...p, tasks: p.tasks.filter(t => t.id !== taskId) }));
  };

  const addAssignedUser = (userId: string) => {
      if (!selectedProject || !canEdit) return;
      const current = selectedProject.assignedUsers || [];
      if (current.includes(userId)) return;
      muterProjet(p => ({ ...p, assignedUsers: [...(p.assignedUsers || []), userId] }));
      setShowTeamDropdown(false);
  };

  const removeAssignedUser = (userId: string) => {
      if (!selectedProject || !canEdit) return;
      const current = selectedProject.assignedUsers || [];
      if (current.length <= 1) {
          if (!confirm('Cet utilisateur est le seul membre du projet. Le retirer quand même ?')) return;
      }
      muterProjet(p => ({ ...p, assignedUsers: (p.assignedUsers || []).filter(id => id !== userId) }));
  };

  const filteredProjects = useMemo(() => {
    let result = projects.filter(p => {
        if (viewMode === 'current' && p.status === 'Archived') return false;
        if (viewMode === 'archived' && p.status !== 'Archived') return false;

        if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;

        if (filterSites.length > 0) {
            const matchesSite = filterSites.some(sel => {
                if (sel === 'GROUPE BONY') return true;
                const isPlaque = Object.keys(PLAQUES_STRUCTURE).includes(sel);
                if (isPlaque) {
                    const sitesInPlaque = PLAQUES_STRUCTURE[sel as PlaqueName];
                    return p.site === sel || sitesInPlaque.includes(p.site as Site);
                }
                return p.site === sel;
            });
            if (!matchesSite) return false;
        }

        if (filterServices.length > 0) {
            const hasService = filterServices.some(s => p.service.includes(s) || p.service.includes('Tous Services'));
            if (!hasService) return false;
        }

        if (filterBrands.length > 0) {
            const pBrands = p.brands || [];
            const hasBrand = filterBrands.some(b => pBrands.includes(b) || pBrands.includes('Holding'));
            if (!hasBrand) return false;
        }

        // Utilisateurs rattachés : OU entre les personnes sélectionnées (un projet
        // remonte s'il compte AU MOINS un des utilisateurs choisis), comme les filtres
        // marque et service juste au-dessus.
        if (filterUsers.length > 0) {
            const equipe = p.assignedUsers || [];
            if (!filterUsers.some(id => equipe.includes(id))) return false;
        }

        if (filterType !== 'All' && p.projectType !== filterType) return false;
        if (filterStatus !== 'All' && p.status !== filterStatus) return false;

        // Filtre période sur la date de début (parse local anti J+1, bornes incluses, vide = tous)
        if ((filterDateFrom || filterDateTo) && p.startDate) {
            const pStart = parseLocalDate(p.startDate).getTime();
            if (filterDateFrom && pStart < parseLocalDate(filterDateFrom).getTime()) return false;
            if (filterDateTo && pStart > parseLocalDate(filterDateTo).getTime()) return false;
        }

        return true;
    });

    return result.sort((a, b) => {
        const dateA = new Date(a.startDate).getTime();
        const dateB = new Date(b.startDate).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

  }, [projects, viewMode, searchTerm, filterSites, filterServices, filterBrands, filterUsers, filterType, filterStatus, filterDateFrom, filterDateTo, sortOrder]);

  const budgetVariance = selectedProject ? (selectedProject.budgetPlanned - selectedProject.budgetActual) : 0;
  const isUnderBudget = budgetVariance >= 0;
  const variancePercent = selectedProject && selectedProject.budgetPlanned > 0 
    ? Math.abs((budgetVariance / selectedProject.budgetPlanned) * 100).toFixed(1) 
    : '0.0';

  const activeFilterCount = filterSites.length + filterBrands.length + filterServices.length + filterUsers.length
      + (filterType !== 'All' ? 1 : 0) + (filterStatus !== 'All' ? 1 : 0)
      + (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0);

  const resetFilters = () => {
      setSearchTerm('');
      setFilterSites([]);
      setFilterBrands([]);
      setFilterServices([]);
      setFilterUsers([]);
      setFilterType('All');
      setFilterStatus('All');
      setFilterDateFrom('');
      setFilterDateTo('');
      setSortOrder('desc');
  };

  const getListStatusBadge = (status: string) => {
      switch(status) {
          case 'Draft':    return <span className="text-[9px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded-full">brouillon</span>;
          case 'Active':   return <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded-full">actif</span>;
          case 'Done':     return <span className="text-[9px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-1.5 py-0.5 rounded-full">terminé</span>;
          case 'Archived': return <span className="text-[9px] font-medium text-slate-400 bg-slate-100 dark:bg-black/40 px-1.5 py-0.5 rounded-full">archivé</span>;
          default: return null;
      }
  };

  return (
    <div className="flex h-full overflow-hidden relative">
      
      {showCreateModal && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="glass-strong glass-sheen relative overflow-hidden rounded-xl p-6 max-w-sm w-full shadow-2xl">
                  <h3 className="text-lg font-title text-bony-text mb-1">Nouveau Projet</h3>
                  <p className="text-xs text-bony-muted mb-4">Donnez un nom à votre projet pour commencer.</p>
                  <input
                      type="text"
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmCreateProject(); if (e.key === 'Escape') setShowCreateModal(false); }}
                      placeholder="Nom du projet..."
                      autoFocus
                      className="w-full bg-white dark:bg-black/30 border border-slate-300 dark:border-bony-border rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-bony-orange transition mb-5"
                  />
                  <div className="flex justify-end gap-3">
                      <button
                          onClick={() => { setShowCreateModal(false); setNewProjectName(''); }}
                          className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-bony-text transition"
                      >
                          ANNULER
                      </button>
                      <button
                          onClick={confirmCreateProject}
                          disabled={!newProjectName.trim()}
                          className="px-4 py-2 rounded-lg text-sm font-bold bg-bony-gradient text-white hover:opacity-90 transition shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                          CRÉER
                      </button>
                  </div>
              </div>
          </div>
      )}

      {showArchiveConfirm && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="glass-strong glass-sheen relative overflow-hidden rounded-xl p-6 max-w-md w-full shadow-2xl">
                  <div className="flex items-center gap-4 mb-4 text-bony-orange">
                      <AlertTriangle size={32} />
                      <h3 className="text-xl font-title text-bony-text">Confirmer l'archivage ?</h3>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-300 mb-6 leading-relaxed">
                      Vous êtes sur le point d'archiver le projet <strong>{projectToArchive?.name}</strong>.
                      <br/><br/>
                      Il sera déplacé dans la rubrique <strong>"Projets Archivés"</strong> et n'apparaîtra plus dans la liste des projets actifs.
                  </p>
                  <div className="flex justify-end gap-3">
                      <button 
                          onClick={() => { setShowArchiveConfirm(false); setProjectToArchive(null); }}
                          className="px-4 py-2 rounded-lg text-sm font-bold text-slate-500 hover:text-bony-text transition"
                      >
                          ANNULER
                      </button>
                      <button 
                          onClick={confirmArchive}
                          className="px-4 py-2 rounded-lg text-sm font-bold bg-bony-gradient text-white hover:opacity-90 transition shadow-lg"
                      >
                          OUI, ARCHIVER
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* List Panel — full width on mobile, resizable on desktop */}
      <div
        className={`${selectedProject ? 'hidden md:flex' : 'flex'} flex-col gx-glass-panel border-r border-bony-border relative shrink-0`}
        style={{ width: window.innerWidth >= 768 ? `${listWidth}px` : '100%' }}
      >

        <div className="px-3 py-2.5 border-b border-bony-border space-y-2 z-20">
            <div className="flex justify-between items-center">
                <h2 className="text-sm font-bold text-bony-text flex items-center gap-1.5">
                    {viewMode === 'archived' && <Archive size={14} className="text-slate-500"/>}
                    {viewMode === 'archived' ? 'Archives' : 'Projets'}
                </h2>
                <div className="flex gap-1.5">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`relative p-1.5 rounded-lg transition border ${showFilters || activeFilterCount > 0 ? 'bg-bony-orange text-white border-bony-orange' : 'bg-slate-100 dark:bg-black/30 text-slate-500 border-bony-border hover:text-bony-text'}`}
                        title="Filtres avancés"
                    >
                        {showFilters ? <X size={15} /> : <Filter size={15} />}
                        {!showFilters && activeFilterCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-bony-orange text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-bony-panel">{activeFilterCount}</span>
                        )}
                    </button>
                    {viewMode === 'current' && canEdit && (
                        <button
                            onClick={openCreateModal}
                            className="flex items-center gap-1 px-2 py-1 bg-bony-gradient rounded-lg text-white hover:opacity-90 transition text-[11px] font-semibold"
                        >
                            <Plus size={12} /> Nouveau
                        </button>
                    )}
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={viewMode === 'archived' ? "Rechercher une archive..." : "Rechercher un projet..."}
                    className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg pl-8 pr-3 py-1.5 text-[12px] text-bony-text outline-none focus:border-bony-orange transition-colors placeholder-slate-400"
                />
            </div>
        </div>

        {showFilters && (
            <div className="bg-slate-50 dark:bg-black/40 border-b border-bony-border p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">

                {/* Sort row */}
                <div className="flex justify-between items-center pb-2 border-b border-bony-border">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Trier par date</label>
                    <button
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-bony-text bg-white dark:bg-black/30 px-2.5 py-1 rounded border border-bony-border hover:border-bony-orange transition"
                    >
                        {sortOrder === 'desc' ? 'Plus récents' : 'Plus anciens'}
                        {sortOrder === 'desc' ? <ArrowDown size={12}/> : <ArrowUp size={12}/>}
                    </button>
                </div>

                {/* Périmètre */}
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Périmètre</label>
                    <ProjSitePicker selected={filterSites} onChange={setFilterSites} />
                </div>

                {/* Marques */}
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Marques</label>
                    <ProjBrandPicker selected={filterBrands} onChange={setFilterBrands} />
                </div>

                {/* Services */}
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Services</label>
                    <ProjServicePicker selected={filterServices} onChange={setFilterServices} />
                </div>

                {/* Utilisateurs rattachés */}
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Utilisateurs</label>
                    <ProjUserPicker users={marketingUsers} selected={filterUsers} onChange={setFilterUsers} />
                </div>

                {/* Type + Statut */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Objet (Type)</label>
                        <Select
                            size="sm"
                            value={filterType}
                            onChange={(v) => setFilterType(v as any)}
                            options={[{ value: 'All', label: 'TOUS TYPES' }, ...PROJECT_TYPES.map(t => ({ value: t, label: t }))]}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Statut</label>
                        <Select
                            size="sm"
                            value={filterStatus}
                            onChange={(v) => setFilterStatus(v)}
                            options={[
                                { value: 'All', label: 'TOUS STATUTS' },
                                { value: 'Draft', label: 'Brouillon' },
                                { value: 'Active', label: 'Actif' },
                                { value: 'Done', label: 'Terminé' },
                                ...(viewMode === 'archived' ? [{ value: 'Archived', label: 'Archivé' }] : []),
                            ]}
                        />
                    </div>
                </div>

                {/* Période (date de début) */}
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Période (date de début)</label>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Du</span>
                            <DatePicker size="sm" value={filterDateFrom} onChange={setFilterDateFrom} placeholder="Début" />
                        </div>
                        <div className="space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Au</span>
                            <DatePicker size="sm" value={filterDateTo} onChange={setFilterDateTo} placeholder="Fin" />
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-bony-border">
                    <button onClick={resetFilters} className="text-[10px] font-bold text-slate-500 hover:text-bony-text underline">RÉINITIALISER</button>
                    <div className="text-[10px] font-sans text-bony-orange">{filteredProjects.length} RÉSULTAT(S)</div>
                </div>
            </div>
        )}
        
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-bony-border/20">
          {filteredProjects.length > 0 ? filteredProjects.map(project => {
            const isSelected = selectedProject?.id === project.id;
            const brandLabels = project.brands || [];
            const serviceLabels = project.service || [];
            const tagLabels = [...brandLabels, ...serviceLabels];
            const hasProgress = project.tasks.length > 0 || project.budgetActual > 0;
            return (
              <div
                key={project.id}
                onClick={() => { setSelectedProject(project); setShowDeleteConfirm(false); }}
                className={`relative px-4 py-3 cursor-pointer transition-colors group ${
                    isSelected
                        ? 'bg-bony-orange/[0.06] dark:bg-bony-orange/[0.08]'
                        : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                }`}
              >
                {/* Accent gauche vertical (sélection) — sobre mais net */}
                {isSelected && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-gradient-to-b from-bony-orange to-bony-violet" />
                )}

                {/* Ligne 1 : titre (dominant) + PRO+ / statut */}
                <div className="flex items-start justify-between gap-2">
                  <h3
                    className={`text-[13.5px] font-semibold leading-snug truncate transition-colors ${isSelected ? 'text-bony-orange' : 'text-bony-text'}`}
                    title={project.name}
                  >
                    {project.name}
                  </h3>
                  <div className="shrink-0 flex items-center gap-1">
                    {project.proPlus && <span className="text-[8px] font-bold text-white bg-bony-gradient px-1.5 py-0.5 rounded uppercase tracking-wide leading-none">PRO+</span>}
                    {getListStatusBadge(project.status)}
                  </div>
                </div>

                {/* Ligne 2 : site · type (support) + budget à droite */}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-bony-muted">
                  <span className="truncate">
                    {project.site}
                    <span className="mx-1 opacity-40">·</span>
                    {project.projectType}
                  </span>
                  {project.budgetActual > 0 && (
                    <span className="ml-auto shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                      {project.budgetActual.toLocaleString()} €
                    </span>
                  )}
                </div>

                {/* Ligne 3 : marques (puces) + marques/services (texte compact) + avancement discret */}
                {(tagLabels.length > 0 || hasProgress) && (
                  <div className="mt-2 flex items-center gap-2">
                    {tagLabels.length > 0 && (
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {brandLabels.length > 0 && (
                          <div className="flex items-center gap-1 shrink-0">
                            {brandLabels.slice(0, 4).map((b, i) => (
                              <span key={i} className={`w-1.5 h-1.5 rounded-full ${BRAND_DOT[b] || 'bg-slate-400'}`} title={b} />
                            ))}
                          </div>
                        )}
                        <span className="truncate text-[10.5px] text-bony-muted" title={tagLabels.join(' · ')}>
                          {tagLabels.join(' · ')}
                        </span>
                      </div>
                    )}
                    {hasProgress && (
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        <div className="w-10 h-1 rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-bony-orange to-bony-violet" style={{ width: `${project.progress}%` }} />
                        </div>
                        <span className="text-[10px] text-bony-muted tabular-nums w-7 text-right">{project.progress}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }) : (
              <div className="p-8 text-center opacity-50">
                  <FolderKanban className="mx-auto mb-2 text-slate-400" size={32}/>
                  <p className="text-xs font-bold uppercase text-slate-500">Aucun projet trouvé</p>
              </div>
          )}
        </div>

        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-bony-orange/50 transition-colors hidden md:block z-10"
          onMouseDown={handleResizeStart}
        />
      </div>

      {/* Detail Panel — hidden on mobile when no project selected */}
      <div className={`${selectedProject ? 'flex' : 'hidden md:flex'} flex-1 flex-col h-full overflow-hidden`}>
        {selectedProject ? (
          <>
            <div className="h-14 border-b border-bony-border flex items-center justify-between px-3 md:px-6 glass-strong shrink-0 transition-colors">
               <div className="text-sm text-slate-400 flex items-center gap-2 md:gap-3 min-w-0">
                 <button
                   onClick={() => setSelectedProject(null)}
                   className="md:hidden flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 dark:bg-white/10 px-2 py-1.5 rounded-lg shrink-0 min-h-[36px]"
                 >
                   ← Retour
                 </button>
                 <span className="font-sans text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-black/20 px-2 py-1 rounded hidden md:inline">ID: {selectedProject.id}</span>
                 {saving && <span className="text-bony-orange flex items-center text-xs animate-pulse font-bold"><Save size={12} className="mr-1"/> SAUVEGARDE...</span>}
                 {!canEdit && <span className="flex items-center gap-1 text-red-400 text-xs font-bold uppercase border border-red-500/20 bg-red-500/10 px-2 py-0.5 rounded"><Lock size={10}/> Lecture Seule</span>}
               </div>
               {canEdit && (
                   !showDeleteConfirm ? (
                       <button 
                           onClick={() => setShowDeleteConfirm(true)}
                           className="text-red-400 hover:text-red-500 text-sm flex items-center gap-1 opacity-60 hover:opacity-100 transition"
                       >
                         <Trash2 size={14}/> Supprimer
                       </button>
                   ) : (
                       <div className="flex items-center gap-2">
                           <span className="text-xs font-bold text-bony-text">Confirmer ?</span>
                           <button 
                               onClick={() => handleDeleteProject(selectedProject.id)}
                               className="px-2 py-1 rounded text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition shadow-sm"
                           >
                               OUI
                           </button>
                           <button 
                               onClick={() => setShowDeleteConfirm(false)}
                               className="px-2 py-1 rounded text-xs font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10 transition"
                           >
                               NON
                           </button>
                       </div>
                   )
               )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-6 lg:p-10">
                <div className="max-w-6xl mx-auto space-y-10 pb-20">
                    
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-bony-violet tracking-widest uppercase">Titre du projet</label>
                        <ChampTexte
                            cle={`${selectedProject.id}:name`}
                            disabled={!canEdit}
                            valeur={selectedProject.name}
                            onValider={(v) => muterProjet(p => ({ ...p, name: v }))}
                            onFocusChange={suivreFocusChamp}
                            className={`w-full bg-transparent text-4xl font-title text-bony-text border-b-2 border-bony-border outline-none pb-2 transition-colors placeholder-slate-400 ${canEdit ? 'focus:border-bony-orange' : 'opacity-80'}`}
                            placeholder="NOM DU PROJET"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
                        
                        {/* LEFT COLUMN: CONTEXT (White Panel in Light Mode) */}
                        <div className="md:col-span-8 gx-glass-panel border border-bony-border rounded-xl p-6 flex flex-col justify-between gap-6 relative overflow-hidden shadow-sm">
                            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-bony-orange to-bony-violet"></div>

                            <div className="flex flex-col md:flex-row gap-6 border-b border-bony-border pb-6">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-2">Statut du Projet</label>
                                    <div className="flex bg-slate-100 dark:bg-black/30 p-1 rounded-lg border border-bony-border">
                                        {(['Draft', 'Active', 'Done'] as const).map(statusOption => {
                                            const isActive = selectedProject.status === statusOption;
                                            return (
                                                <button
                                                    key={statusOption}
                                                    disabled={!canEdit}
                                                    onClick={() => handleStatusChange(statusOption)}
                                                    className={`flex-1 py-2 text-xs font-bold uppercase rounded transition-all ${
                                                        isActive 
                                                        ? 'bg-white dark:bg-white text-black shadow-sm' 
                                                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                                                    } ${!canEdit ? 'cursor-not-allowed opacity-50' : ''}`}
                                                >
                                                    {statusOption === 'Draft' ? 'Brouillon' : (statusOption === 'Active' ? 'Actif' : 'Terminé')}
                                                </button>
                                            );
                                        })}
                                        <button 
                                            disabled={!canEdit}
                                            onClick={() => handleStatusChange(selectedProject.status === 'Archived' ? 'Active' : 'Archived')}
                                            className={`px-4 py-2 text-xs font-bold uppercase rounded transition-all ml-1 ${
                                                selectedProject.status === 'Archived' 
                                                ? 'bg-purple-600 text-white shadow-lg' 
                                                : 'text-slate-500 hover:text-purple-600 hover:bg-white/50'
                                            } ${!canEdit ? 'cursor-not-allowed opacity-50' : ''}`}
                                            title={selectedProject.status === 'Archived' ? "Restaurer" : "Archiver"}
                                        >
                                            <Archive size={16}/>
                                        </button>
                                    </div>

                                    {/* INTERRUPTEUR DU MODE EXPERT.
                                        ⚠️ Rien à voir avec le marqueur PRO+ (B2B) plus bas dans ce
                                        même formulaire : celui-ci ne change AUCUN montant et n'entre
                                        dans aucune agrégation — il ne fait qu'ouvrir des modules
                                        d'affichage sur ce projet.
                                        Masqué (et non désactivé) pour un rôle en lecture seule : lui
                                        montrer un interrupteur mort n'apporte rien, alors qu'il voit
                                        bien les modules une fois le mode allumé par quelqu'un. */}
                                    {canEdit && (
                                        <button
                                            onClick={() => muterProjet(p => ({ ...p, expertMode: !p.expertMode }))}
                                            title={selectedProject.expertMode
                                                ? "Revenir à la vue simple. Aucune donnée n'est supprimée."
                                                : 'Débloquer les indicateurs, le planning et les fichiers'}
                                            // ⚠️ PAS de `shadow-glow` ici. `gx-btn-gradient` porte déjà son
                                            // ombre dans index.html, et son commentaire est explicite :
                                            // « Fini verre sobre […] pas de glow orange plastique ». Ajouter
                                            // `shadow-glow` écrasait ce box-shadow par un halo orange —
                                            // signalé par Théo le 27/08/2026 comme hors charte.
                                            className={`mt-2 w-full py-2 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-all ${
                                                selectedProject.expertMode
                                                    ? 'gx-btn-gradient text-white'
                                                    : 'border border-bony-violet/40 text-bony-violet hover:bg-bony-violet/10'
                                            }`}
                                        >
                                            <Sparkles size={13} />
                                            {selectedProject.expertMode ? 'Mode Expert actif' : 'Activer le mode Expert'}
                                        </button>
                                    )}
                                </div>
                                <div className="w-full md:w-64">
                                     <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-2">Période</label>
                                     {canEdit ? (
                                         <div className="flex items-center gap-1.5">
                                             <DatePicker size="sm" value={selectedProject.startDate} onChange={(v) => muterProjet(p => ({ ...p, startDate: v, ...(v && p.endDate && v > p.endDate ? { endDate: v } : {}) }))} placeholder="Début" />
                                             <ArrowRight size={12} className="text-slate-400 shrink-0"/>
                                             <DatePicker size="sm" value={selectedProject.endDate} minDate={selectedProject.startDate} onChange={(v) => muterProjet(p => ({ ...p, endDate: v }))} placeholder="Fin" />
                                         </div>
                                     ) : (
                                         <div className="flex items-center gap-2 bg-[var(--bg-input)] border border-bony-border rounded-2xl px-3 h-[38px] text-xs font-bold text-bony-text">
                                             <span>{selectedProject.startDate ? parseLocalDate(selectedProject.startDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                                             <ArrowRight size={12} className="text-slate-400"/>
                                             <span>{selectedProject.endDate ? parseLocalDate(selectedProject.endDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                                         </div>
                                     )}
                                </div>
                                <div className="w-full md:w-auto">
                                    <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-2">Client B2B</label>
                                    <button
                                        type="button"
                                        disabled={!canEdit}
                                        onClick={() => muterProjet(p => ({ ...p, proPlus: !p.proPlus }))}
                                        className={`flex items-center gap-2 h-[38px] px-3 rounded-lg border text-xs font-bold uppercase tracking-wide transition-all ${
                                            selectedProject.proPlus
                                                ? 'bg-bony-gradient text-white border-transparent shadow'
                                                : 'bg-slate-100 dark:bg-black/30 text-slate-500 border-bony-border hover:text-bony-text'
                                        } ${!canEdit ? 'cursor-not-allowed opacity-50' : ''}`}
                                        title="Marquer ce projet comme PRO+ (B2B)"
                                    >
                                        <span className={`flex items-center justify-center w-4 h-4 rounded border transition-colors ${
                                            selectedProject.proPlus ? 'bg-white/25 border-white/60' : 'border-slate-400 dark:border-slate-500'
                                        }`}>
                                            {selectedProject.proPlus && <Check size={11} strokeWidth={3} />}
                                        </span>
                                        PRO+
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                     <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase">Site / Plaque</label>
                                     <div className="relative">
                                        <button 
                                            onClick={() => setShowSiteDropdown(!showSiteDropdown)}
                                            disabled={!canEdit}
                                            className="w-full bg-slate-100 dark:bg-black/20 border border-bony-border rounded-lg p-2.5 text-bony-text outline-none focus:border-bony-blue text-sm font-bold flex justify-between items-center hover:bg-slate-200 dark:hover:bg-black/30 transition-colors disabled:opacity-50"
                                        >
                                            <span className="truncate">{selectedProject.site || 'Sélectionner...'}</span>
                                            <ChevronDown size={16} className="text-slate-500"/>
                                        </button>
                                        
                                        {showSiteDropdown && (
                                            <div className="absolute top-full left-0 right-0 mt-1 glass-menu rounded-lg z-50 max-h-60 overflow-y-auto custom-scrollbar p-1">
                                                <button
                                                    onClick={() => { updateSiteSelection('GROUPE BONY'); setShowSiteDropdown(false); }}
                                                    className={`w-full text-left px-3 py-2 text-xs font-bold rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between gap-2 ${selectedProject.site === 'GROUPE BONY' ? 'text-bony-orange bg-orange-50 dark:bg-orange-900/20' : 'text-slate-700 dark:text-slate-300'}`}
                                                >
                                                    <span className="truncate min-w-0">GROUPE BONY (GLOBAL)</span>
                                                    {selectedProject.site === 'GROUPE BONY' && <Check size={14} className="shrink-0"/>}
                                                </button>
                                                <button
                                                    onClick={() => { updateSiteSelection('GROUPE BONY (R/N)'); setShowSiteDropdown(false); }}
                                                    className={`w-full text-left px-3 py-2 text-xs font-bold rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between gap-2 ${selectedProject.site === 'GROUPE BONY (R/N)' ? 'text-bony-orange bg-orange-50 dark:bg-orange-900/20' : 'text-slate-700 dark:text-slate-300'}`}
                                                >
                                                    <span className="truncate min-w-0">GROUPE BONY (R/N)</span>
                                                    {selectedProject.site === 'GROUPE BONY (R/N)' && <Check size={14} className="shrink-0"/>}
                                                </button>
                                                
                                                <div className="h-px bg-slate-100 dark:bg-white/10 my-1"></div>

                                                {Object.entries(PLAQUES_STRUCTURE).map(([plaqueName, sites]) => (
                                                    <div key={plaqueName} className="mb-1">
                                                        <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-400">{plaqueName}</div>
                                                        {sites.map(site => {
                                                            const isSelected = (selectedProject.sites || []).includes(site);
                                                            return (
                                                                <button
                                                                    key={site}
                                                                    onClick={() => updateSiteSelection(site)}
                                                                    className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between gap-2 ${isSelected ? 'text-bony-blue font-bold bg-blue-50 dark:bg-blue-900/20' : 'text-slate-600 dark:text-slate-400'}`}
                                                                >
                                                                    <span className="truncate min-w-0">{site}</span>
                                                                    {isSelected && <Check size={14} className="shrink-0"/>}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ))}
                                                <div className="mb-1">
                                                    <div className="px-3 py-1 text-[10px] uppercase font-bold text-red-400/70">SITES NISSAN</div>
                                                    {(['Montluçon', 'Saint-Etienne'] as Site[]).map(site => {
                                                        const isSelected = (selectedProject.sites || []).includes(site);
                                                        return (
                                                            <button
                                                                key={site}
                                                                onClick={() => updateSiteSelection(site)}
                                                                className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between gap-2 ${isSelected ? 'text-bony-blue font-bold bg-blue-50 dark:bg-blue-900/20' : 'text-slate-600 dark:text-slate-400'}`}
                                                            >
                                                                <span className="truncate min-w-0">{site}</span>
                                                                {isSelected && <Check size={14} className="shrink-0"/>}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                     </div>
                                </div>
                                <div className="space-y-2">
                                     <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase">Type de Projet</label>
                                     <Select
                                        value={selectedProject.projectType || 'OP Clients'}
                                        disabled={!canEdit}
                                        onChange={(v) => muterProjet(p => ({ ...p, projectType: v as any }))}
                                        options={PROJECT_TYPES.map(t => ({ value: t, label: t }))}
                                     />
                                </div>
                            </div>

                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-2">Services</label>
                                    <div className="flex flex-wrap gap-2">
                                        {SERVICES.map(s => {
                                            const isSelected = selectedProject.service.includes(s);
                                            return (
                                                <button
                                                    key={s}
                                                    disabled={!canEdit}
                                                    onClick={() => toggleService(s)}
                                                    className={`px-3 py-1.5 rounded text-xs font-bold border transition-all ${
                                                        isSelected 
                                                        ? `bg-bony-gradient border-transparent text-white shadow` 
                                                        : 'bg-slate-100 dark:bg-black/20 border-bony-border text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                                    } ${!canEdit ? 'cursor-not-allowed opacity-50' : ''}`}
                                                >
                                                    {s}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-2">Marques</label>
                                    <div className="flex flex-wrap gap-2">
                                        {BRANDS.filter(b => {
                                            const currentSites = selectedProject.sites || (selectedProject.site ? [selectedProject.site] : []);
                                            if (b === 'Alpine') return currentSites.some(s => ALPINE_SITES.includes(s as Site));
                                            if (b === 'Nissan') return currentSites.some(s => NISSAN_SITES.includes(s as Site));
                                            return true;
                                        }).map(b => {
                                            const isSelected = (selectedProject.brands || []).includes(b);
                                            const colorClass = BRAND_COLORS[b];
                                            return (
                                                <button
                                                    key={b}
                                                    disabled={!canEdit}
                                                    onClick={() => toggleBrand(b)}
                                                    className={`px-3 py-1.5 rounded text-xs font-bold border transition-all ${
                                                        isSelected 
                                                        ? `${colorClass} shadow scale-105` 
                                                        : 'bg-slate-100 dark:bg-black/20 border-bony-border text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                                    } ${!canEdit ? 'cursor-not-allowed opacity-50' : ''}`}
                                                >
                                                    {b}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* TEAM SECTION */}
                            {(() => {
                                const assignedIds = selectedProject.assignedUsers || [];
                                // ⚠️ `unassignedUsers` (ce qu'on PROPOSE d'ajouter) est restreint à
                                // l'équipe marketing, mais `allUsers` (ce qui RÉSOUT les membres déjà
                                // en place) reste complet : un membre hors liste continue donc de
                                // s'afficher et de pouvoir être retiré, au lieu de disparaître
                                // silencieusement en restant en base.
                                const unassignedUsers = marketingUsers.filter(u => !assignedIds.includes(u.id));
                                return (
                                    <TeamSection
                                        assignedIds={assignedIds}
                                        unassignedUsers={unassignedUsers}
                                        allUsers={users}
                                        canEdit={canEdit}
                                        showDropdown={showTeamDropdown}
                                        setShowDropdown={setShowTeamDropdown}
                                        onAdd={addAssignedUser}
                                        onRemove={removeAssignedUser}
                                    />
                                );
                            })()}

                            {/* BUDGET ALLOCATION SECTION */}
                            {(selectedProject.sites && selectedProject.sites.length > 1) && (
                                <div className="mt-6 pt-6 border-t border-bony-border animate-in fade-in">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-[10px] font-bold text-slate-500 tracking-widest uppercase flex items-center gap-2">
                                            <PieChart size={14} className="text-bony-orange"/> Répartition Budgétaire
                                        </h4>
                                        {/* Bascule d'affichage/saisie % ↔ € (UI uniquement, stockage en % inchangé) */}
                                        <div className="flex items-center bg-slate-100 dark:bg-black/30 rounded-lg p-0.5 border border-bony-border">
                                            {(['%', '€'] as const).map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => setBudgetDistMode(m)}
                                                    className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition-colors ${budgetDistMode === m ? 'bg-bony-gradient text-white' : 'text-slate-500 hover:text-bony-text'}`}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        {(selectedProject.sites || []).map(site => {
                                            const pct = (selectedProject.budgetDistribution || {})[site] || 0;
                                            const isFixed = selectedProject.site === 'GROUPE BONY' || selectedProject.site === 'GROUPE BONY (R/N)';
                                            const amount = Math.round(selectedProject.budgetActual * (pct / 100));
                                            const euroMode = budgetDistMode === '€';
                                            // En € : conversion immédiate montant → % stocké (garde le modèle en %). Division par zéro gérée.
                                            const euroDisabled = isFixed || !canEdit || !(selectedProject.budgetActual > 0);

                                            return (
                                                <div key={site} className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 w-24 truncate" title={site}>{site}</span>
                                                    <div className="flex-1 flex items-center gap-2 bg-slate-100 dark:bg-black/30 rounded px-2 py-1 border border-bony-border">
                                                        {euroMode ? (
                                                            <ChampNombre
                                                                cle={`${selectedProject.id}:dist-eur:${site}`}
                                                                valeur={amount}
                                                                videVaut="zero"
                                                                disabled={euroDisabled}
                                                                onValider={(v) => updateBudgetDistribution(site, selectedProject.budgetActual > 0 ? ((v ?? 0) / selectedProject.budgetActual) * 100 : 0)}
                                                                onFocusChange={suivreFocusChamp}
                                                                className="w-full bg-transparent text-xs font-bold text-right outline-none disabled:opacity-50"
                                                            />
                                                        ) : (
                                                            <ChampNombre
                                                                cle={`${selectedProject.id}:dist-pct:${site}`}
                                                                valeur={Number(pct.toFixed(2))}
                                                                videVaut="zero"
                                                                disabled={isFixed || !canEdit}
                                                                onValider={(v) => updateBudgetDistribution(site, v ?? 0)}
                                                                onFocusChange={suivreFocusChamp}
                                                                className="w-full bg-transparent text-xs font-bold text-right outline-none disabled:opacity-50"
                                                            />
                                                        )}
                                                        <span className="text-[10px] text-slate-500">{euroMode ? '€' : '%'}</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 w-16 text-right">
                                                        {euroMode ? `${Number(pct.toFixed(1))} %` : `${amount.toLocaleString()} €`}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {budgetDistMode === '€' && !(selectedProject.budgetActual > 0) && (
                                        <div className="mt-2 text-[10px] text-amber-500">Budget réalisé = 0 € : saisie en € indisponible (utilisez le mode %).</div>
                                    )}
                                    
                                    <div className="mt-2 text-right text-[10px] text-slate-400">
                                        Total: <span className={`font-bold ${Math.abs(Object.values(selectedProject.budgetDistribution || {}).reduce((a,b)=>a+b,0) - 100) > 0.1 ? 'text-red-500' : 'text-emerald-500'}`}>
                                            {Object.values(selectedProject.budgetDistribution || {}).reduce((a,b)=>a+b,0).toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT COLUMN: BUDGET CARD (Inverted for Light Mode or Keep Dark?) Let's adapt it properly */}
                        <div className="md:col-span-4 gx-glass-panel border border-bony-border rounded-xl p-6 flex flex-col justify-between relative overflow-hidden group shadow-sm">
                             <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                                 <Coins size={100} className="text-bony-text"/>
                             </div>

                             <div className="space-y-6 relative z-10">
                                 <div>
                                     <h3 className="text-sm font-bold text-bony-text uppercase flex items-center gap-2 mb-1">
                                         <Wallet size={16} className="text-bony-orange"/> Budget
                                     </h3>
                                     <p className="text-[10px] text-slate-500">Pilotage financier en temps réel</p>
                                 </div>

                                 <div className="space-y-1">
                                     <label className="text-[10px] font-bold text-slate-500 uppercase">Budget Prévu</label>
                                     <div className="bg-slate-100 dark:bg-black/30 border border-bony-border rounded-lg flex items-center px-3 py-2">
                                         {/* ⚠️ `videVaut="zero"` : `Project.budgetPlanned` est un `Float` NON
                                             nullable en base — un champ vide y vaut 0, pas null. */}
                                         <ChampNombre
                                             cle={`${selectedProject.id}:budgetPlanned`}
                                             disabled={!canEdit}
                                             valeur={selectedProject.budgetPlanned}
                                             videVaut="zero"
                                             onValider={(v) => muterProjet(p => ({ ...p, budgetPlanned: v ?? 0 }))}
                                             onFocusChange={suivreFocusChamp}
                                             className="bg-transparent text-xl font-sans font-bold text-bony-text outline-none w-full placeholder-slate-400 disabled:opacity-50"
                                             placeholder="0"
                                         />
                                         <span className="text-slate-500 font-bold">€</span>
                                     </div>
                                 </div>

                                 <div className="space-y-1">
                                     <label className="text-[10px] font-bold text-slate-500 uppercase">Budget Réel (Auto)</label>
                                     <div className="text-3xl font-sans font-bold text-bony-text">
                                         {selectedProject.budgetActual.toLocaleString()} <span className="text-lg text-slate-500">€</span>
                                     </div>
                                 </div>

                                 {/* Répartition marque / compte RDM — visible seulement sur un
                                     projet mixte (Alpine ou Nissan + Renault/Dacia/Mobilize).
                                     Même condition que `splitShareToBuckets` dans constants.ts,
                                     qui ignore le curseur hors élément mixte.

                                     Le défaut affiché est 100 et non 50 : non renseigné, le calcul
                                     impute TOUT à la marque. Afficher 50 laissait croire à une
                                     répartition qui n'avait pas lieu. */}
                                 {(() => {
                                     const pb = selectedProject.brands || [];
                                     const hasRDM = pb.some(b => (RDM_BRANDS as string[]).includes(b));
                                     if (!hasRDM) return null;
                                     const curseurs = ([
                                         { marque: 'Alpine', champ: 'alpineShare' as const },
                                         { marque: 'Nissan', champ: 'nissanShare' as const },
                                     ]).filter(c => pb.includes(c.marque as any));
                                     if (curseurs.length === 0) return null;
                                     return curseurs.map(({ marque, champ }) => {
                                         const share = selectedProject[champ] ?? 100;
                                         return (
                                         <div key={champ} className="space-y-1 pt-4 border-t border-bony-border animate-in fade-in">
                                             <label className="text-[10px] font-bold text-slate-500 uppercase">Part {marque} (%)</label>
                                             <div className="bg-slate-100 dark:bg-black/30 border border-bony-border rounded-lg flex items-center px-3 py-2 gap-2">
                                                 {/* ⚠️ `videVaut="null"` et NON "zero" : la regle metier est
                                                     « curseur vide = 100 % sur la marque » (CLAUDE.md). Ecrire 0
                                                     deplacerait TOUT le montant sur le compte RDM — l'inverse de
                                                     ce que l'utilisateur demande en vidant le champ.
                                                     Le bornage 0-100 est applique AU COMMIT : l'appliquer a chaque
                                                     frappe empechait de taper « 100 » (bloque a 1 au premier
                                                     caractere). */}
                                                 <ChampNombre
                                                     cle={`${selectedProject.id}:${champ}`}
                                                     disabled={!canEdit}
                                                     valeur={share}
                                                     videVaut="null"
                                                     borne={[0, 100]}
                                                     onValider={(v) => muterProjet(p => ({ ...p, [champ]: v }))}
                                                     onFocusChange={suivreFocusChamp}
                                                     className="bg-transparent text-xl font-sans font-bold text-bony-text outline-none w-16 placeholder-slate-400 disabled:opacity-50 text-center"
                                                     placeholder="100"
                                                 />
                                                 <span className="text-slate-500 font-bold">%</span>
                                             </div>
                                             <p className="text-[10px] text-slate-400">{share}% → {marque} · {100 - share}% → compte RDM</p>
                                         </div>
                                         );
                                     });
                                 })()}

                                 <div className="pt-4 border-t border-bony-border">
                                      <div className={`flex items-center gap-2 ${isUnderBudget ? 'text-emerald-500' : 'text-red-500'}`}>
                                          {isUnderBudget ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}
                                          <div className="font-bold text-sm uppercase">
                                              {isUnderBudget ? 'Gain Estimé' : 'Dépassement'}
                                          </div>
                                      </div>
                                      <div className={`text-xs mt-1 font-sans ${isUnderBudget ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                                          {Math.abs(budgetVariance).toLocaleString()} € ({variancePercent}%)
                                      </div>
                                 </div>
                             </div>

                             <div className="mt-6">
                                 <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1 uppercase">
                                     <span>Avancement Tâches</span>
                                     <span className="text-bony-text">{selectedProject.progress}%</span>
                                 </div>
                                 <div className="h-2 bg-slate-200 dark:bg-black/50 rounded-full overflow-hidden">
                                     <div className="h-full bg-bony-gradient transition-all duration-700" style={{width: `${selectedProject.progress}%`}}></div>
                                 </div>
                             </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-bony-border pb-2">
                            <h3 className="font-title text-lg text-bony-text flex items-center gap-2">
                                <Coins size={20} className="text-bony-orange"/>
                                Tâches & Coûts
                            </h3>
                            {canEdit && (
                                <button onClick={addTask} className="text-xs font-bold bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 px-3 py-1 rounded text-bony-text transition">
                                    + AJOUTER UNE TÂCHE
                                </button>
                            )}
                        </div>

                        <div className="gx-glass-panel rounded-xl border border-bony-border overflow-x-auto shadow-sm">
                            {/* LARGEURS CALIBRÉES SUR LE CONTENU RÉEL (mesuré en Albert Sans, 26/08/2026)
                                — un Select `sm` occupe la largeur du texte + 48 px (pl-3 + pr-9 du chevron) :
                                  Canal « Street Market » 74 → 122 · Statut « Programmé » 65 → 113 ·
                                  Échéance « 21 août 2026 » 72 + 48 → 120 · Assigné « — Non assigné — » 95 + avatar.
                                ⚠️ Le défaut d'avant : les colonnes FIXES totalisaient 944 px pour un
                                `min-w` de 920 px. La colonne « Nom », seule sans largeur, absorbait le
                                déficit et tombait à zéro — d'où son en-tête cassé en trois lignes alors
                                que c'est la colonne la plus utile. Elle a désormais un plancher explicite
                                (260 px) et récupère TOUT l'espace disponible au-delà du `min-w`.
                                Somme des fixes = 832 px, et « Nom » prend TOUT le reste au-delà.
                                Calibré sur les 311 noms de tâches réels : médiane 140 px, et la colonne
                                obtient ~318 px sur un écran 1920 — 9 % des libellés défilent encore dans
                                leur champ, contre 14 % avec 40 px de moins.
                                ⚠️ Les colonnes à CONTRÔLE (Canal → Échéance) sont en `px-1.5` et non `p-3` :
                                un Select ou un DatePicker porte déjà son propre padding interne, et les
                                24 px de la cellule s'ajoutaient par-dessus. C'est ce qui tronquait
                                « Audiovisuel » en « Audiovi… » — 12 px repris par colonne, rendus au Nom.
                                ⚠️ `table-fixed` est INDISPENSABLE : en `table-layout: auto` (le défaut), les
                                `w-*` ne sont que des suggestions et le navigateur redistribue selon le
                                contenu — mesuré le 26/08 : Prestataire écrasé à 90 px et Assigné gonflé à
                                194 px alors qu'on demandait 128 et 160. En `table-fixed` les largeurs de la
                                première rangée sont respectées à la lettre, et la seule colonne SANS
                                largeur (« Nom ») absorbe l'espace restant. */}
                            {/* ⚠️ Le mode Expert ajoute un second bouton dans la dernière colonne :
                                elle passe de 40 à 76 px, et le `min-w` suit exactement (1060 -> 1096).
                                Sans cet ajustement les deux boutons se chevaucheraient — et surtout,
                                élargir la colonne SANS toucher au `min-w` reprendrait les 36 px à la
                                colonne « Nom de la tâche », c'est-à-dire le défaut corrigé au
                                correctif 42. */}
                            <table className={`w-full table-fixed text-left ${modeExpert ? 'min-w-[1112px]' : 'min-w-[1060px]'}`}>
                                <thead className="bg-slate-100 dark:bg-black/20 text-[10px] uppercase font-bold text-slate-500">
                                    <tr>
                                        <th className="p-3 w-10"></th>
                                        <th className="p-3"><TriTache champ="name" libelle="Nom de la tâche" actif={taskSortField} sens={taskSortDir} onTri={trierTaches} align="left" /></th>
                                        <th className="p-3 w-32"><TriTache champ="provider" libelle="Prestataire" actif={taskSortField} sens={taskSortDir} onTri={trierTaches} align="left" /></th>
                                        <th className="px-1.5 py-3 w-36"><TriTache champ="channel" libelle="Canal" actif={taskSortField} sens={taskSortDir} onTri={trierTaches} /></th>
                                        <th className="px-1.5 py-3 w-32"><TriTache champ="status" libelle="Statut" actif={taskSortField} sens={taskSortDir} onTri={trierTaches} /></th>
                                        <th className="px-1.5 py-3 w-36"><TriTache champ="assignedUserId" libelle="Assigné" actif={taskSortField} sens={taskSortDir} onTri={trierTaches} /></th>
                                        <th className="px-1.5 py-3 w-20"><TriTache champ="cost" libelle="Coût (€)" actif={taskSortField} sens={taskSortDir} onTri={trierTaches} /></th>
                                        <th className="px-1.5 py-3 w-36"><TriTache champ="deadline" libelle="Échéance" actif={taskSortField} sens={taskSortDir} onTri={trierTaches} /></th>
                                        <th className={modeExpert ? 'p-3 w-[92px]' : 'p-3 w-10'}></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-bony-border">
                                    {tachesAffichees.map((task, index) => (
                                        <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition group">
                                            {/* Numéro de ligne : suit l'ordre AFFICHÉ, ce n'est pas un identifiant. */}
                                            <td className="p-3 text-center text-slate-400 text-xs font-sans">{index + 1}</td>
                                            <td className="p-3">
                                                <ChampTexte
                                                    cle={`${task.id}:name`}
                                                    disabled={!canEdit}
                                                    valeur={task.name}
                                                    onValider={(v) => validerChampTache(task.id, 'name', v)}
                                                    onFocusChange={suivreFocusChamp}
                                                    onFocusPlus={gelerOrdre}
                                                    onBlurPlus={() => setOrdreGele(null)}
                                                    placeholder="Description de la tâche..."
                                                    className="w-full bg-transparent outline-none text-bony-text text-sm placeholder-slate-400 disabled:opacity-50"
                                                />
                                            </td>
                                            <td className="p-3">
                                                <ChampTexte
                                                    cle={`${task.id}:provider`}
                                                    disabled={!canEdit}
                                                    valeur={task.provider || ''}
                                                    onValider={(v) => validerChampTache(task.id, 'provider', v)}
                                                    onFocusChange={suivreFocusChamp}
                                                    onFocusPlus={gelerOrdre}
                                                    onBlurPlus={() => setOrdreGele(null)}
                                                    placeholder="Prestataire..."
                                                    className="w-full bg-transparent outline-none text-bony-text text-sm placeholder-slate-400 disabled:opacity-50"
                                                />
                                            </td>
                                            <td className="px-1.5 py-3">
                                                <Select
                                                    size="sm"
                                                    value={task.channel || ''}
                                                    disabled={!canEdit}
                                                    onChange={(v) => updateTask(task.id, 'channel', v)}
                                                    placeholder="-- Aucun --"
                                                    options={[{ value: '', label: '-- Aucun --' }, ...TASK_CHANNELS.map(c => ({ value: c, label: c }))]}
                                                />
                                            </td>
                                            <td className="px-1.5 py-3">
                                                <Select
                                                    size="sm"
                                                    value={task.status}
                                                    disabled={!canEdit}
                                                    onChange={(v) => updateTask(task.id, 'status', v)}
                                                    // Libellés SANS les pourcentages depuis le 26/08/2026 : « Programmé (100%) »
                                                    // mesure 106 px, ce qui imposait 154 px à la colonne — plus que l'Échéance,
                                                    // et pris sur le Nom de la tâche. Retirés, le maximum tombe à 65 px et la
                                                    // colonne rentre dans 128 px. La pondération qu'ils annonçaient reste
                                                    // lisible là où elle sert : la barre « Avancement Tâches » du projet.
                                                    options={[
                                                        { value: 'Empty', label: 'Vierge' },
                                                        { value: 'Todo', label: 'À faire' },
                                                        { value: 'InProgress', label: 'En cours' },
                                                        { value: 'Programmed', label: 'Programmé' },
                                                        { value: 'Done', label: 'Terminé' },
                                                    ]}
                                                />
                                            </td>
                                            <td className="px-1.5 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    {task.assignedUserId ? (() => {
                                                        const au = users.find(u => u.id === task.assignedUserId);
                                                        return au ? <Avatar userId={au.id} name={au.name} color={au.avatarColor} size={20} /> : null;
                                                    })() : (
                                                        <UserCircle size={20} className="text-slate-300 dark:text-slate-600 shrink-0" />
                                                    )}
                                                    <div className="flex-1">
                                                        <Select
                                                            size="sm"
                                                            value={task.assignedUserId || ''}
                                                            disabled={!canEdit}
                                                            /* ⚠️ `v || null` et NON `|| undefined` : `undefined` est SUPPRIME par
                                                               JSON.stringify, donc `pickTaskData` le lit comme « champ absent du body,
                                                               donc non modifie » — la DESASSIGNATION ne partait jamais, et le serveur
                                                               repondait 200. Troisieme occurrence du mode d'echec de `deadline`
                                                               (correctif 42) ; la regle est ecrite en commentaire deux colonnes plus
                                                               loin, sur l'echeance. */
                                                            onChange={(v) => updateTask(task.id, 'assignedUserId', v || null)}
                                                            placeholder="— Non assigné —"
                                                            // ⚠️ L'assigné COURANT est réinjecté même si son rôle n'est plus
                                                            // dans l'équipe marketing. Sans ça, `Select` ne trouve pas la
                                                            // valeur dans ses options et affiche « — Non assigné — » alors
                                                            // que la tâche EST assignée — avec l'avatar de la personne juste
                                                            // à côté. Quelqu'un « corrigerait » cet affichage en choisissant
                                                            // un autre nom, et écraserait l'assignation réelle : c'est le
                                                            // seul vrai vecteur de perte de données de ce lot.
                                                            options={[
                                                                { value: '', label: '— Non assigné —' },
                                                                ...(task.assignedUserId && !marketingUsers.some(u => u.id === task.assignedUserId)
                                                                    ? users.filter(u => u.id === task.assignedUserId)
                                                                    : []),
                                                                ...marketingUsers,
                                                            ].map(o => ('id' in o ? { value: o.id, label: o.name } : o))}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-1.5 py-3">
                                                {/* ⚠️ `videVaut="zero"` : `Task.cost` est un `Float` NON nullable. */}
                                                <ChampNombre
                                                    cle={`${task.id}:cost`}
                                                    disabled={!canEdit}
                                                    valeur={task.cost}
                                                    videVaut="zero"
                                                    onValider={(v) => validerChampTache(task.id, 'cost', v ?? 0)}
                                                    onFocusChange={suivreFocusChamp}
                                                    onFocusPlus={gelerOrdre}
                                                    onBlurPlus={() => setOrdreGele(null)}
                                                    // Centré (et non plus à droite) pour se caler sous son en-tête : ce sont
                                                    // des champs de saisie courts, pas une colonne de totaux à aligner.
                                                    className="w-full bg-transparent outline-none text-bony-text text-sm text-center font-sans focus:text-bony-orange disabled:opacity-50"
                                                />
                                            </td>
                                            {/* Échéance de la TÂCHE — date de référence de la To-do quand elle est
                                                renseignée (sinon la To-do retombe sur la fin du projet).
                                                ⚠️ `v || null` et non `|| undefined` : côté serveur, `undefined`
                                                signifie « champ absent du body, donc non modifié », un effacement
                                                ne partirait donc jamais. Voir pickTaskData dans routes/projects.ts. */}
                                            <td className="px-1.5 py-3">
                                                <DatePicker
                                                    size="sm"
                                                    clearable
                                                    value={task.deadline || ''}
                                                    onChange={(v) => updateTask(task.id, 'deadline', v || null)}
                                                    placeholder="—"
                                                />
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex items-center justify-center gap-0.5">
                                                    {/* Détail de la tâche — mode Expert seulement : c'est là que
                                                        vivent la date de début, la note et les fichiers. En mode
                                                        simple le bouton n'existe pas, il n'ouvrirait rien d'utile.
                                                        Visible aussi en lecture seule : on consulte une note et on
                                                        télécharge une pièce jointe sans droit d'écriture. */}
                                                    {/* ⚠️ Le bouton doit dire CE QU'IL Y A DANS la tâche, pas seulement
                                                        qu'il y a « quelque chose ». La première version se contentait de
                                                        passer l'icône en violet : impossible de savoir s'il s'agissait
                                                        d'une note, d'un fichier ou d'une date (relevé par Théo le
                                                        27/08/2026). On affiche donc des marqueurs DISTINCTS — trombone
                                                        + nombre de fichiers, et une note — dans le même bouton, pour ne
                                                        pas multiplier les zones cliquables sur une ligne déjà dense. */}
                                                    {modeExpert && (() => {
                                                        const nbFichiers = fichiers.filter(f => f.taskId === task.id).length;
                                                        const aNote = !!task.notes;
                                                        return (
                                                            <button
                                                                onClick={() => setTacheOuverte(task.id)}
                                                                title={[
                                                                    'Détail : dates, note et fichiers',
                                                                    nbFichiers > 0 ? `${nbFichiers} fichier${nbFichiers > 1 ? 's' : ''}` : null,
                                                                    aNote ? 'une note' : null
                                                                ].filter(Boolean).join(' — ')}
                                                                className="px-1.5 py-2 rounded-lg flex items-center gap-1 text-slate-400 hover:text-bony-violet hover:bg-bony-violet/10 transition"
                                                            >
                                                                <Maximize2 size={14} className="shrink-0" />
                                                                {nbFichiers > 0 && (
                                                                    <span className="flex items-center gap-0.5 text-bony-violet shrink-0">
                                                                        <Paperclip size={12} />
                                                                        <span className="text-[10px] font-bold font-sans">{nbFichiers}</span>
                                                                    </span>
                                                                )}
                                                                {aNote && <StickyNote size={12} className="text-bony-violet shrink-0" />}
                                                            </button>
                                                        );
                                                    })()}
                                                    {canEdit && (
                                                        <button onClick={() => removeTask(task.id)} className="p-2 text-slate-400 hover:text-red-500 transition opacity-100 md:opacity-0 md:group-hover:opacity-100">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {selectedProject.tasks.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="p-8 text-center text-slate-500 text-sm italic">
                                                Aucune tâche définie. Ajoutez des tâches pour piloter le budget et l'avancement.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* MODULES DU MODE EXPERT — montés UNIQUEMENT si le mode est actif.
                        Le mode est additif : éteint, rien de ce bloc n'existe, et l'écran
                        est celui d'avant ce lot au caractère près. */}
                    {modeExpert && selectedProject && (
                        <ExpertPanel
                            projet={selectedProject}
                            users={users}
                            canEdit={canEdit}
                            fichiers={fichiers}
                            onFichiersChange={rechargerFichiers}
                            onOuvrirTache={setTacheOuverte}
                        />
                    )}

                    <div className="space-y-2 pt-4">
                        <label className="block text-xs font-bold text-slate-500 tracking-widest uppercase">Description Globale</label>
                        <ChampTexte
                            multiligne
                            cle={`${selectedProject.id}:description`}
                            valeur={selectedProject.description || ''}
                            disabled={!canEdit}
                            onValider={(v) => muterProjet(p => ({ ...p, description: v }))}
                            onFocusChange={suivreFocusChamp}
                            className="w-full h-32 gx-glass-panel rounded-lg p-4 text-bony-text outline-none focus:border-bony-blue resize-none leading-relaxed text-sm disabled:opacity-50"
                            placeholder="Contexte général du projet..."
                        />
                    </div>
                </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            {viewMode === 'archived' ? (
                <>
                    <Archive size={80} className="mb-4 opacity-20" />
                    <p className="font-title text-xl opacity-50">SÉLECTIONNEZ UNE ARCHIVE</p>
                </>
            ) : (
                <>
                    <FolderKanban size={80} className="mb-4 opacity-20" />
                    <p className="font-title text-xl opacity-50">SÉLECTIONNEZ UN PROJET</p>
                </>
            )}
          </div>
        )}
      </div>

      {/* DÉTAIL D'UNE TÂCHE — surcouche plein écran, donc montée à la RACINE et non dans
          le flux du panneau : à l'intérieur, l'`overflow-y-auto` du conteneur la
          rognerait et son voile ne couvrirait que la colonne de droite.
          La tâche est relue dans `selectedProject.tasks` à chaque rendu plutôt que
          copiée dans l'état : une modification faite depuis le panneau se reflète ainsi
          immédiatement, sans second exemplaire à garder synchronisé. */}
      {(() => {
        if (!tacheOuverte || !selectedProject || !modeExpert) return null;
        const t = selectedProject.tasks.find(x => x.id === tacheOuverte);
        // La tâche a pu être supprimée entre-temps (ici ou par un collègue).
        if (!t) return null;
        return (
          <TaskDetailPanel
            tache={t}
            projectId={selectedProject.id}
            fichiers={fichiers}
            users={users}
            canEdit={canEdit}
            onFermer={() => setTacheOuverte(null)}
            onChangerTache={updateTask}
            onFichiersChange={rechargerFichiers}
          />
        );
      })()}
    </div>
  );
};

export default Projects;
