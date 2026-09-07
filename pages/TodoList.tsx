
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckSquare, ChevronLeft, ChevronRight, Filter, Search, X,
  ExternalLink, Calendar, Tag, Banknote, Radio, ChevronDown, ChevronUp,
  Plus, Pencil, Trash2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import DatePicker from '../components/DatePicker';
import Select from '../components/Select';
import { db } from '../services/dataService';
import { recalculerProjet } from '../utils/projet';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { Project, Task, TaskStatus, TaskChannel, BrandType, ServiceType, PlaqueName } from '../types';
import { BRAND_COLORS, SERVICE_COLORS, PLAQUES_STRUCTURE, BRANDS, SERVICES, TASK_CHANNELS } from '../constants';

// ---- Types ----
// Une carte de la To-do, quelle que soit sa nature. Les champs `project*` sont
// SYNTHÉTISÉS pour une tâche autonome à partir de ses propres colonnes (deadline,
// sites, brands, service) : tout le reste de l'écran — filtres, tri, urgence,
// rendu — continue ainsi de fonctionner sans être dupliqué par nature de tâche.
interface TodoTask extends Task {
  projectId: string;          // '' pour une tâche autonome
  standalone: boolean;
  taskSites: string[];        // sites réels, pour le filtre (le projet peut être multi-sites)
  projectName: string;
  projectSite: string;
  projectBrands: BrandType[];
  projectService: ServiceType[];
  projectStartDate: string;
  // Date qui pilote TOUT l'affichage d'une carte : urgence, couleur, libellé, tri, et le
  // filtre de plage de dates. Elle s'appelait `projectEndDate` jusqu'au 26/08/2026, nom
  // devenu mensonger depuis que l'échéance de la TÂCHE prend le dessus quand elle est
  // renseignée — une tâche de projet retombe sur la fin de son projet, une tâche
  // autonome sur sa propre deadline (ou une sentinelle très lointaine).
  dateReference: string;
}

interface KanbanCol {
  status: TaskStatus;
  label: string;
  color: string;
  headerBg: string;
  dot: string;
}

// ---- Constants ----
const KANBAN_COLS: KanbanCol[] = [
  { status: 'Todo',       label: 'À faire',    color: 'text-blue-500',       headerBg: 'bg-blue-500/10 border-blue-400/30',       dot: 'bg-blue-500' },
  { status: 'InProgress', label: 'En cours',   color: 'text-bony-orange',    headerBg: 'bg-bony-orange/10 border-bony-orange/30', dot: 'bg-bony-orange' },
  { status: 'Programmed', label: 'Programmé',  color: 'text-bony-violet',    headerBg: 'bg-bony-violet/10 border-bony-violet/30', dot: 'bg-bony-violet' },
  { status: 'Done',       label: 'Terminé',    color: 'text-green-500',      headerBg: 'bg-green-500/10 border-green-500/30',     dot: 'bg-green-500' },
];
const KANBAN_ORDER: TaskStatus[] = ['Todo', 'InProgress', 'Programmed', 'Done'];

const PLAQUE_NAMES = Object.keys(PLAQUES_STRUCTURE) as PlaqueName[];

// ---- Helpers ----
function today(): string {
  return new Date().toISOString().split('T')[0];
}

function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function projectSites(p: Project): string[] {
  return p.sites?.length ? p.sites : [p.site];
}

function matchesSiteFilter(p: Project, selected: string[]): boolean {
  if (!selected.length) return true;
  const pSites = projectSites(p);
  for (const ctx of selected) {
    if (ctx in PLAQUES_STRUCTURE) {
      const plaqueSites: string[] = PLAQUES_STRUCTURE[ctx as PlaqueName];
      if (pSites.some(s => plaqueSites.includes(s))) return true;
    } else {
      if (pSites.includes(ctx)) return true;
    }
  }
  return false;
}

// ⚠️ La formule d'avancement / budget réel vit désormais dans `utils/projet.ts`, en UNE
// seule copie. Elle était dupliquée ici et dans `pages/Projects.tsx` — et cette version
// MUTAIT son argument (`project.progress = …`), donc écrivait dans l'objet d'état React
// dont il provenait. Voir l'en-tête de `utils/projet.ts` pour le pourquoi.
const recalcProject = recalculerProjet;

// ---- Site filter dropdown ----
// Réutilisé à DEUX endroits : la barre de filtres de la To-do, et le choix des sites
// du formulaire de tâche autonome. `placeholder` n'existe que pour ça — le libellé
// « Périmètre » de la barre de filtres reste le défaut, donc inchangé.
const SiteFilterDropdown: React.FC<{
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}> = ({ selected, onChange, placeholder = 'Périmètre' }) => {
  const [open, setOpen] = useState(false);
  const [expandedPlaques, setExpandedPlaques] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (ctx: string) => {
    onChange(selected.includes(ctx) ? selected.filter(s => s !== ctx) : [...selected, ctx]);
  };

  const togglePlaque = (plaque: PlaqueName) => {
    const sites = PLAQUES_STRUCTURE[plaque];
    const allSelected = sites.every(s => selected.includes(s));
    if (allSelected) {
      onChange(selected.filter(s => !sites.includes(s as any) && s !== plaque));
    } else {
      const newSel = [...selected.filter(s => !sites.includes(s as any) && s !== plaque), ...sites];
      onChange([...new Set(newSel)]);
    }
  };

  const toggleExpandPlaque = (plaque: string) => {
    setExpandedPlaques(prev => {
      const next = new Set(prev);
      next.has(plaque) ? next.delete(plaque) : next.add(plaque);
      return next;
    });
  };

  const label = selected.length === 0 ? placeholder : `${selected.length} site${selected.length > 1 ? 's' : ''}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
          selected.length > 0
            ? 'bg-bony-orange/10 border-bony-orange/40 text-bony-orange'
            : 'border-bony-border text-bony-text/70 hover:border-bony-orange/40'
        }`}
      >
        <Tag size={13} />
        <span>{label}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-60 glass-menu rounded-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-bony-border">
            <span className="text-xs font-bold text-bony-text/50 uppercase tracking-wider">Périmètre</span>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="text-[10px] text-bony-orange hover:underline">Tout effacer</button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {PLAQUE_NAMES.map(plaque => {
              const sites = PLAQUES_STRUCTURE[plaque];
              const expanded = expandedPlaques.has(plaque);
              const allSelected = sites.every(s => selected.includes(s));
              const someSelected = sites.some(s => selected.includes(s));
              return (
                <div key={plaque}>
                  <div className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 cursor-pointer" onClick={() => toggleExpandPlaque(plaque)}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                      onChange={() => togglePlaque(plaque)}
                      onClick={e => e.stopPropagation()}
                      className="accent-bony-orange"
                    />
                    <span className="flex-1 text-sm font-semibold text-bony-text/80">{plaque}</span>
                    {expanded ? <ChevronUp size={12} className="text-bony-text/40" /> : <ChevronDown size={12} className="text-bony-text/40" />}
                  </div>
                  {expanded && sites.map(site => (
                    <label key={site} className="flex items-center gap-2 pl-8 pr-3 py-1.5 hover:bg-white/5 cursor-pointer text-sm text-bony-text/70">
                      <input
                        type="checkbox"
                        checked={selected.includes(site)}
                        onChange={() => toggle(site)}
                        className="accent-bony-orange shrink-0"
                      />
                      <span className="truncate min-w-0">{site}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ---- Task Card ----
const TaskCard: React.FC<{
  task: TodoTask;
  colIndex: number;
  onMove: (id: string, projectId: string, newStatus: TaskStatus) => void;
  onNavigate: () => void;
  onEdit: () => void;
}> = ({ task, colIndex, onMove, onNavigate, onEdit }) => {
  // Une tâche autonome SANS deadline porte une date sentinelle très lointaine : elle
  // ne doit jamais s'afficher comme urgente, ni comme datée.
  const sansEcheance = task.standalone && !task.deadline;
  const days = daysUntil(task.dateReference);
  const urgency = sansEcheance ? 'ok' : days < 0 ? 'overdue' : days <= 3 ? 'critical' : days <= 7 ? 'warning' : 'ok';

  const urgencyBorder = urgency === 'overdue' || urgency === 'critical' ? 'border-l-red-500' : urgency === 'warning' ? 'border-l-bony-orange' : 'border-l-transparent';

  const canGoLeft = colIndex > 0;
  const canGoRight = colIndex < KANBAN_ORDER.length - 1;

  return (
    // Carte compacte : 3 rangées d'information au lieu de 5. Les rangées « projet »
    // et « date » d'une part, « badges » et « coût » d'autre part, occupaient chacune
    // une ligne entière pour quelques caractères — à 5 tâches la colonne était pleine.
    // Rien n'est retiré, tout est regroupé. Mesuré : ~155 px -> ~105 px en desktop.
    <div className={`gx-card px-3 py-2 flex flex-col gap-1.5 border-l-4 ${urgencyBorder} transition-all hover:shadow-md`}>
      {/* Nom — borné à 2 lignes : un libellé à rallonge ne doit pas faire enfler la carte */}
      <p className="font-semibold text-sm text-slate-900 dark:text-bony-text leading-snug line-clamp-2">{task.name}</p>

      {/* Projet + échéance sur la MÊME ligne (la date part à droite via ml-auto).
          Le bouton reste limité au projet : la date ne doit pas être cliquable.
          Une tâche AUTONOME n'a pas de projet où naviguer : elle affiche à la place
          un bouton d'édition, seul moyen de la modifier ou de la supprimer. */}
      <div className="flex items-center gap-2">
        {task.standalone ? (
          <button onClick={onEdit} className="flex items-center gap-1.5 text-left group min-w-0" title="Modifier cette tâche">
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-bony-violet/30 bg-bony-violet/10 text-bony-violet font-semibold shrink-0">
              Libre
            </span>
            {task.projectSite && (
              <span className="text-[10px] text-bony-text/40 dark:text-bony-text/30 truncate">{task.projectSite}</span>
            )}
            <Pencil size={10} className="text-bony-text/30 group-hover:text-bony-orange transition-colors shrink-0" />
          </button>
        ) : (
          <button onClick={onNavigate} className="flex items-center gap-1.5 text-left group min-w-0">
            <span className="text-xs text-bony-text/60 dark:text-bony-text/50 group-hover:text-bony-orange transition-colors truncate">
              {task.projectName}
            </span>
            <span className="text-[10px] text-bony-text/40 dark:text-bony-text/30 shrink-0">{task.projectSite}</span>
            <ExternalLink size={10} className="text-bony-text/30 group-hover:text-bony-orange transition-colors shrink-0" />
          </button>
        )}
        <span className={`flex items-center gap-1 text-[10px] ml-auto shrink-0 font-medium ${
          urgency === 'overdue' ? 'text-red-500' :
          urgency === 'critical' ? 'text-red-400' :
          urgency === 'warning' ? 'text-bony-orange' :
          'text-slate-500 dark:text-bony-text/40'
        }`}>
          {!sansEcheance && <Calendar size={10} />}
          {sansEcheance
            ? 'Sans échéance'
            : urgency === 'overdue'
            ? `Expiré il y a ${Math.abs(days)}j`
            : urgency === 'critical'
            ? `${days}j restant${days > 1 ? 's' : ''}`
            : formatDate(task.dateReference)}
        </span>
      </div>

      {/* Badges + coût sur la même ligne, le coût poussé à droite */}
      <div className="flex flex-wrap items-center gap-1">
        {task.projectService.map(s => (
          <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${SERVICE_COLORS[s]}`}>{s}</span>
        ))}
        {task.projectBrands.map(b => (
          <span key={b} className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${BRAND_COLORS[b]}`}>{b}</span>
        ))}
        {task.channel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-white/10 text-slate-600 dark:text-bony-text/50 bg-slate-100 dark:bg-white/5">
            {task.channel}
          </span>
        )}
        {task.cost > 0 && (
          <span className="flex items-center gap-1 text-[10px] ml-auto shrink-0 text-slate-500 dark:text-bony-text/50">
            <Banknote size={11} />
            {task.cost.toLocaleString('fr-FR')} €
          </span>
        )}
      </div>

      {/* Déplacement de colonne. ⚠️ La hauteur mobile (`py-2.5`) n'est PAS réduite :
          elle est déjà sous le seuil tactile des 44 px, l'amincir aggraverait le
          défaut. Seul le desktop, qui est ce que Théo regarde, passe à `md:py-0.5`. */}
      <div className="flex gap-1 pt-1 border-t border-slate-100 dark:border-white/5">
        <button
          onClick={() => canGoLeft && onMove(task.id, task.projectId, KANBAN_ORDER[colIndex - 1])}
          disabled={!canGoLeft}
          className="flex-1 flex items-center justify-center gap-1 py-2.5 md:py-0.5 rounded text-xs text-slate-500 dark:text-bony-text/50 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={13} />
        </button>
        <button
          onClick={() => canGoRight && onMove(task.id, task.projectId, KANBAN_ORDER[colIndex + 1])}
          disabled={!canGoRight}
          className="flex-1 flex items-center justify-center gap-1 py-2.5 md:py-0.5 rounded text-xs text-slate-500 dark:text-bony-text/50 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
};

// ---- Formulaire d'une tâche AUTONOME ----
// ⚠️ Pas de champ COÛT, volontairement : une tâche autonome n'a pas de budget
// (décision de Théo). Le serveur force `cost = 0` et n'accepte pas ce champ en
// entrée — l'absence ici n'est donc pas la seule garantie.
// ⚠️ Pas de champ « Assigné à » non plus : une tâche créée ici est TOUJOURS pour soi
// (décision de Théo). L'assignation reste stockée — la To-do ne montre que les tâches
// de l'utilisateur courant, il faut donc bien la renseigner — mais elle n'est pas
// proposée à la saisie. À l'édition on préserve la valeur existante.
const StandaloneTaskForm: React.FC<{
  task: Task | null;                       // null = création
  meId: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ task, meId, onClose, onSaved }) => {
  const [name, setName] = useState(task?.name ?? '');
  const [provider, setProvider] = useState(task?.provider ?? '');
  const [channel, setChannel] = useState<TaskChannel>(task?.channel ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'Todo');
  const assignedUserId = task?.assignedUserId ?? meId;
  const [deadline, setDeadline] = useState(task?.deadline ?? '');
  const [sites, setSites] = useState<string[]>(task?.sites ?? []);
  const [brands, setBrands] = useState<BrandType[]>(task?.brands ?? []);
  const [service, setService] = useState<ServiceType[]>(task?.service ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = <T,>(list: T[], v: T, set: (x: T[]) => void) =>
    set(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  const submit = async () => {
    if (!name.trim()) { setError('Le nom de la tâche est obligatoire.'); return; }
    setSaving(true);
    setError('');
    const payload = { name: name.trim(), provider, channel, status, assignedUserId, deadline, sites, brands, service };
    try {
      if (task) await db.updateStandaloneTask(task.id, payload);
      else await db.createStandaloneTask(payload);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'enregistrement.");
      setSaving(false);
    }
  };

  const supprimer = async () => {
    if (!task || !confirm('Supprimer définitivement cette tâche ?')) return;
    setSaving(true);
    try {
      await db.deleteStandaloneTask(task.id);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la suppression.');
      setSaving(false);
    }
  };

  const puce = (actif: boolean, couleur: string) =>
    `text-[10px] px-2 py-1 rounded border font-semibold transition ${actif ? couleur : 'border-bony-border text-bony-text/40 hover:text-bony-text/70'}`;

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && onClose()}>
      <div className="glass-strong rounded-2xl w-full max-w-lg shadow-glass-lg overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-bony-border shrink-0">
          <h3 className="font-title text-bony-text flex items-center gap-2">
            <CheckSquare size={18} className="text-bony-orange" />
            {task ? 'Modifier la tâche' : 'Nouvelle tâche'}
          </h3>
          <button onClick={onClose} disabled={saving} className="text-slate-400 hover:text-bony-text transition disabled:opacity-40"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
          <div>
            <label className="text-[11px] font-bold text-bony-muted uppercase tracking-wide">Nom *</label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              className="w-full mt-1 bg-[var(--bg-input)] border border-bony-border rounded-xl px-3 py-2 text-sm text-bony-text outline-none focus:border-bony-orange/60" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-bony-muted uppercase tracking-wide">Prestataire</label>
              <input value={provider} onChange={e => setProvider(e.target.value)}
                className="w-full mt-1 bg-[var(--bg-input)] border border-bony-border rounded-xl px-3 py-2 text-sm text-bony-text outline-none focus:border-bony-orange/60" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-bony-muted uppercase tracking-wide">Deadline</label>
              <DatePicker value={deadline} onChange={setDeadline} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-bony-muted uppercase tracking-wide">Canal</label>
              <Select value={channel} onChange={v => setChannel(v as TaskChannel)}
                options={[{ value: '', label: '—' }, ...TASK_CHANNELS.map(c => ({ value: c, label: c }))]} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-bony-muted uppercase tracking-wide">Statut</label>
              <Select value={status} onChange={v => setStatus(v as TaskStatus)}
                options={KANBAN_COLS.map(c => ({ value: c.status, label: c.label }))} />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-bony-muted uppercase tracking-wide">Sites</label>
            {/* Même menu déroulant que la barre de filtres de la To-do (plaques
                repliables, cases à cocher) plutôt qu'une liste à plat de 19 boutons. */}
            <div className="mt-1">
              <SiteFilterDropdown selected={sites} onChange={setSites} placeholder="Choisir des sites" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-bony-muted uppercase tracking-wide">Marques</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {BRANDS.map(b => (
                <button key={b} onClick={() => toggle(brands, b, setBrands)}
                  className={puce(brands.includes(b), BRAND_COLORS[b])}>{b}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-bony-muted uppercase tracking-wide">Services</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {SERVICES.map(s => (
                <button key={s} onClick={() => toggle(service, s, setService)}
                  className={puce(service.includes(s), SERVICE_COLORS[s])}>{s}</button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-bony-border shrink-0">
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-bony-gradient text-white text-sm font-bold hover:opacity-90 transition disabled:opacity-60">
            {saving ? 'Enregistrement…' : task ? 'Enregistrer' : 'Créer la tâche'}
          </button>
          {task && (
            <button onClick={supprimer} disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 text-sm font-bold hover:bg-red-500/20 transition disabled:opacity-60">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ---- Main page ----
const TodoList: React.FC = () => {
  const { user } = useAuth();
  const [allTasks, setAllTasks] = useState<TodoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterSites, setFilterSites] = useState<string[]>([]);
  const [filterBrands, setFilterBrands] = useState<BrandType[]>([]);
  const [filterServices, setFilterServices] = useState<ServiceType[]>([]);
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Mobile kanban tab
  const [mobileCol, setMobileCol] = useState(0);

  // Tâches autonomes : formulaire de création/édition
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  // Même liste de rôles que `EDIT_ROLES` de `backend/src/routes/tasks.ts`. ⚠️ Simple
  // commodité d'affichage : le refus réel est côté serveur, et c'est lui qui compte.
  const canCreate = !!user && ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager'].includes(user.role);

  const todayStr = today();

  // ---- Load tasks ----
  const loadTasks = useCallback(async () => {
    if (!user) return;
    const projects = await db.getProjects();
    const active = projects.filter(p =>
      (p.status === 'Active' || p.status === 'Draft') && p.endDate >= todayStr
    );
    const tasks: TodoTask[] = [];
    for (const p of active) {
      for (const t of p.tasks) {
        if (t.assignedUserId === user.id && t.status !== 'Empty') {
          tasks.push({
            ...t,
            projectId: p.id,
            standalone: false,
            taskSites: projectSites(p),
            projectName: p.name,
            projectSite: p.site,
            projectBrands: p.brands,
            projectService: p.service,
            projectStartDate: p.startDate,
            // L'échéance de la TÂCHE prend le dessus ; à défaut, la fin du projet
            // (comportement d'avant le 26/08/2026). Le fallback est délibéré : les
            // tâches importées n'ont pas d'échéance, elles gardent donc exactement la
            // date, l'urgence et la place dans le tri qu'elles avaient.
            // ⚠️ La VISIBILITÉ, elle, reste pilotée par le projet (`p.endDate >=
            // todayStr` au filtre ci-dessus) : une tâche dont l'échéance est dépassée
            // dans un projet encore actif reste affichée, en « Expiré il y a Xj ».
            // C'est précisément l'intérêt de l'échéance par tâche.
            dateReference: t.deadline || p.endDate,
          });
        }
      }
    }

    // Tâches AUTONOMES : elles n'ont pas de projet, donc pas de `project.endDate`
    // pour les faire disparaître. Leur règle est différente, et c'est voulu (arbitrage
    // de Théo) : une tâche autonome ne disparaît que si elle est TERMINÉE **et** que sa
    // deadline est atteinte. Une tâche en retard non faite reste donc visible — alors
    // qu'une tâche de projet, elle, disparaît dès que le projet est échu, terminée ou
    // non. Deux comportements distincts dans la même colonne, assumés.
    const libres = await db.getStandaloneTasks();
    for (const t of libres) {
      if (t.assignedUserId !== user.id || t.status === 'Empty') continue;
      const echue = !!t.deadline && t.deadline < todayStr;
      if (echue && t.status === 'Done') continue;
      const sites = t.sites ?? [];
      tasks.push({
        ...t,
        projectId: '',
        standalone: true,
        taskSites: sites,
        projectName: '',
        projectSite: sites.join(', '),
        projectBrands: t.brands ?? [],
        projectService: t.service ?? [],
        // Sans deadline, la tâche ne doit jamais paraître urgente ni expirée : on la
        // place très loin dans le futur plutôt que de laisser `daysUntil` recevoir ''
        // (qui donnerait NaN, donc `days < 0` faux mais un affichage cassé).
        projectStartDate: t.deadline || todayStr,
        dateReference: t.deadline || '9999-12-31',
      });
    }

    // Sort by end date asc
    tasks.sort((a, b) => a.dateReference.localeCompare(b.dateReference));
    setAllTasks(tasks);
    setLoading(false);
  }, [user, todayStr]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Temps réel : les tâches affichées sont celles des projets. Remplace le
  // polling toutes les 30 s qui compensait l'absence de temps réel — la mise à
  // jour est maintenant immédiate, et sans requête quand rien ne bouge.
  useRealtimeSync([...RT_EVENTS.projects, ...RT_EVENTS.tasks], () => loadTasks());

  // ---- Update task status ----
  // ⚠️ Deux chemins d'écriture selon la nature de la tâche, et il ne faut pas les
  // mélanger : une tâche de projet se sauvegarde par un PUT du PROJET entier (qui
  // recalcule au passage progression et budget), une tâche autonome par sa propre
  // route. Un `projectId` vide identifie la seconde.
  const moveTask = useCallback(async (taskId: string, projectId: string, newStatus: TaskStatus) => {
    setSaving(true);
    try {
      if (!projectId) {
        await db.updateStandaloneTask(taskId, { status: newStatus });
      } else {
        const projects = await db.getProjects();
        const target = projects.find(p => p.id === projectId);
        if (target) {
          const newTasks = target.tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t);
          // PUT unitaire du seul projet concerné (API réelle).
          await db.updateProject(recalcProject({ ...target, tasks: newTasks }));
        }
      }
    } catch (error) {
      console.error('Task move failed:', error);
      alert('Échec de la sauvegarde (serveur injoignable ?).');
    }
    setSaving(false);
    await loadTasks();
  }, [loadTasks]);

  // ---- Navigate to project ----
  const navigateToProject = (projectId: string) => {
    window.sessionStorage.setItem('pendingProjectId', projectId);
    window.dispatchEvent(new CustomEvent('gearbox-navigate', { detail: { tab: 'projects', projectId } }));
  };

  // ---- Filtered tasks ----
  const filteredTasks = allTasks.filter(t => {
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !t.projectName.toLowerCase().includes(q)) return false;
    }
    if (filterSites.length) {
      // Réutilise `matchesSiteFilter` (qui gère les plaques) via un objet projet
      // minimal. ⚠️ On lui passe `taskSites`, les sites RÉELS : `projectSite` est un
      // libellé d'affichage, concaténé quand il y en a plusieurs, et il ne
      // correspondrait à aucune valeur de site connue.
      const fakeProject = { site: t.taskSites[0] ?? '', sites: t.taskSites } as any;
      if (!matchesSiteFilter(fakeProject, filterSites)) return false;
    }
    if (filterBrands.length && !filterBrands.some(b => t.projectBrands.includes(b))) return false;
    if (filterServices.length && !filterServices.some(s => t.projectService.includes(s))) return false;
    if (filterDateStart && t.dateReference < filterDateStart) return false;
    if (filterDateEnd && t.projectStartDate > filterDateEnd) return false;
    return true;
  });

  const tasksByStatus = (status: TaskStatus) => filteredTasks.filter(t => t.status === status);

  const activeFilterCount =
    (filterSites.length > 0 ? 1 : 0) +
    (filterBrands.length > 0 ? 1 : 0) +
    (filterServices.length > 0 ? 1 : 0) +
    (filterDateStart || filterDateEnd ? 1 : 0) +
    (search ? 1 : 0);

  const resetFilters = () => {
    setSearch('');
    setFilterSites([]);
    setFilterBrands([]);
    setFilterServices([]);
    setFilterDateStart('');
    setFilterDateEnd('');
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-bony-orange animate-pulse font-title text-sm">
        Chargement…
      </div>
    );
  }

  // ---- Filter panel (shared desktop/mobile) ----
  const FilterPanel = (
    <div className="flex flex-col md:flex-row md:flex-wrap gap-3 p-3 bg-slate-50 dark:bg-black/20 rounded-xl border border-slate-200 dark:border-bony-border">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px]">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bony-text/40" />
        <input
          type="text"
          placeholder="Rechercher une tâche ou un projet…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-bony-border rounded-lg text-slate-900 dark:text-bony-text placeholder-slate-400 dark:placeholder-bony-text/30 focus:outline-none focus:border-bony-orange/60"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-bony-text/30 hover:text-bony-text">
            <X size={12} />
          </button>
        )}
      </div>

      <div className="w-px bg-slate-200 dark:bg-bony-border hidden md:block" />

      {/* Site filter */}
      <SiteFilterDropdown selected={filterSites} onChange={setFilterSites} />

      <div className="w-px bg-slate-200 dark:bg-bony-border hidden md:block" />

      {/* Brands chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {BRANDS.map(b => (
          <button
            key={b}
            onClick={() => setFilterBrands(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])}
            className={`text-[10px] px-2 py-1 rounded border font-semibold transition-all ${
              filterBrands.includes(b) ? BRAND_COLORS[b] : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-bony-text/40 hover:border-slate-400 dark:hover:border-white/30'
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="w-px bg-slate-200 dark:bg-bony-border hidden md:block" />

      {/* Services chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {SERVICES.filter(s => s !== 'Tous Services').map(s => (
          <button
            key={s}
            onClick={() => setFilterServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
            className={`text-[10px] px-2 py-1 rounded border font-semibold transition-all ${
              filterServices.includes(s) ? SERVICE_COLORS[s] : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-bony-text/40 hover:border-slate-400 dark:hover:border-white/30'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="w-px bg-slate-200 dark:bg-bony-border hidden md:block" />

      {/* Date range */}
      <div className="flex items-center gap-2">
        <Calendar size={13} className="text-bony-text/40 shrink-0" />
        <DatePicker
          value={filterDateStart}
          onChange={v => setFilterDateStart(v)}
          size="sm"
        />
        <span className="text-bony-text/30 text-xs">→</span>
        <DatePicker
          value={filterDateEnd}
          onChange={v => setFilterDateEnd(v)}
          size="sm"
        />
      </div>

      {activeFilterCount > 0 && (
        <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-500 transition-colors">
          <X size={12} /> Effacer tout
        </button>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 md:px-6 pt-4 pb-3 border-b border-bony-border shrink-0">
        <CheckSquare size={22} className="text-bony-orange" />
        <h1 className="text-xl font-bold font-title">To-do</h1>
        <span className="text-bony-text/40 text-sm">
          {filteredTasks.length} tâche{filteredTasks.length !== 1 ? 's' : ''} assignée{filteredTasks.length !== 1 ? 's' : ''}
        </span>
        {saving && <span className="ml-auto text-xs text-bony-orange animate-pulse">Sauvegarde…</span>}
        {canCreate && (
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className={`${saving ? '' : 'ml-auto'} flex items-center gap-1.5 px-3 min-h-[44px] md:min-h-[34px] rounded-xl bg-bony-gradient text-white text-xs font-bold hover:opacity-90 transition shrink-0`}
          >
            <Plus size={14} /> Nouvelle tâche
          </button>
        )}
      </div>

      {/* Filter bar — desktop: always visible | mobile: collapsible */}
      <div className="px-4 md:px-6 py-3 border-b border-bony-border shrink-0">
        {/* Mobile toggle */}
        <div className="md:hidden mb-2 flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              activeFilterCount > 0
                ? 'bg-bony-orange/10 border-bony-orange/40 text-bony-orange'
                : 'border-bony-border text-bony-text/70'
            }`}
          >
            <Filter size={14} />
            Filtres
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 bg-bony-orange text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
            {showFilters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-xs text-red-400 hover:text-red-500">
              Tout effacer
            </button>
          )}
        </div>

        {/* Desktop: always show | Mobile: conditional */}
        <div className={`${showFilters ? 'block' : 'hidden'} md:block`}>
          {FilterPanel}
        </div>
      </div>

      {/* Mobile: column tab selector */}
      <div className="md:hidden flex border-b border-bony-border shrink-0 overflow-x-auto">
        {KANBAN_COLS.map((col, i) => {
          const count = tasksByStatus(col.status).length;
          return (
            <button
              key={col.status}
              onClick={() => setMobileCol(i)}
              className={`flex-1 flex flex-col items-center py-2 px-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors min-w-[80px] ${
                mobileCol === i
                  ? `border-current ${col.color}`
                  : 'border-transparent text-bony-text/50'
              }`}
            >
              <span>{col.label}</span>
              <span className={`text-[10px] font-bold mt-0.5 ${mobileCol === i ? col.color : 'text-bony-text/30'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredTasks.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-bony-text/40 p-8">
          <CheckSquare size={40} strokeWidth={1} />
          <p className="text-sm text-center">
            {allTasks.length === 0
              ? 'Aucune tâche ne vous est assignée dans les projets actifs.'
              : 'Aucune tâche ne correspond aux filtres sélectionnés.'}
          </p>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-xs text-bony-orange hover:underline">
              Effacer les filtres
            </button>
          )}
        </div>
      )}

      {/* Kanban board */}
      {filteredTasks.length > 0 && (
        <div className="flex-1 overflow-hidden">
          {/* Desktop: 4 columns side by side */}
          <div className="hidden md:grid md:grid-cols-4 gap-4 h-full p-4 md:p-6 overflow-hidden">
            {KANBAN_COLS.map((col, colIndex) => {
              const tasks = tasksByStatus(col.status);
              return (
                <div key={col.status} className="flex flex-col overflow-hidden">
                  {/* Column header */}
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border ${col.headerBg} shrink-0`}>
                    <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>{col.label}</span>
                    <span className={`ml-auto text-xs font-bold ${col.color} opacity-70`}>{tasks.length}</span>
                  </div>
                  {/* Tasks */}
                  <div className="flex-1 overflow-y-auto bg-slate-100/50 dark:bg-white/[0.02] border-x border-b border-slate-200 dark:border-bony-border/30 rounded-b-xl p-2 space-y-2">
                    {tasks.length === 0 ? (
                      <div className="flex items-center justify-center py-8 text-bony-text/20 text-xs">
                        Aucune tâche
                      </div>
                    ) : (
                      tasks.map(task => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          colIndex={colIndex}
                          onMove={moveTask}
                          onNavigate={() => navigateToProject(task.projectId)}
                          onEdit={() => { setEditing(task); setShowForm(true); }}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile: single column */}
          <div className="md:hidden h-full overflow-y-auto p-3 space-y-2">
            {(() => {
              const col = KANBAN_COLS[mobileCol];
              const tasks = tasksByStatus(col.status);
              if (tasks.length === 0) {
                return (
                  <div className="flex items-center justify-center py-12 text-bony-text/30 text-sm">
                    Aucune tâche dans cette colonne
                  </div>
                );
              }
              return tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  colIndex={mobileCol}
                  onMove={moveTask}
                  onNavigate={() => navigateToProject(task.projectId)}
                  onEdit={() => { setEditing(task); setShowForm(true); }}
                />
              ));
            })()}
          </div>
        </div>
      )}

      {showForm && (
        <StandaloneTaskForm
          task={editing}
          meId={user?.id ?? ''}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={loadTasks}
        />
      )}
    </div>
  );
};

export default TodoList;
