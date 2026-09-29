import type { Project, Task, User } from '../../../types';
import { isMarketingRole } from '../../../constants';
import { groupeDuProjet, sitesDuProjet } from '../../../utils/projet';
import { gx } from '../ui/kit';

// Données dérivées de la rubrique Projets (maquettes/v2/js/apps/projects.js, en-tête), sur le vrai
// modèle. Aucune règle budgétaire ici : les montants viennent de `recalculerProjet` (utils/projet.ts).

export type Mode = 'current' | 'archived' | 'doc';
export const FILTER_BRANDS = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize', 'Holding'];
export const TASK_ORDER: Record<string, number> = { Empty: 0, Todo: 1, InProgress: 2, Programmed: 3, Done: 4 };
/** Libellés du sélecteur de sites du moteur (variante `project`) ⇄ `Project.site`. */
export const GROUP_LABEL: Record<string, string> = { 'GROUPE BONY': 'GROUPE BONY (GLOBAL)', 'GROUPE BONY (R/N)': 'GROUPE BONY (R/N)' };
export const LABEL_GROUP: Record<string, 'GROUPE BONY' | 'GROUPE BONY (R/N)'> = { 'GROUPE BONY (GLOBAL)': 'GROUPE BONY', 'GROUPE BONY (R/N)': 'GROUPE BONY (R/N)' };

export const D = () => gx().data;
export const today = () => gx().iso(gx().today());
export const marketing = (users: User[]) => users.filter((u) => isMarketingRole(u.role));
export const userName = (users: User[], id?: string | null) => (id ? users.find((u) => u.id === id)?.name || '—' : '');
export const brandHex = (b: string) => D().brand(b)?.hex || '#8a8599';

/** Libellé « site » d'une ligne de liste. Un chef de site ne reçoit déjà que ses sites (redactSiteFields). */
export function siteTxt(p: Project) {
  const gm = groupeDuProjet(p); if (gm) return gm;
  const s = sitesDuProjet(p); return s.length > 2 ? `${s[0]} +${s.length - 1}` : s.join(', ');
}

export interface Filters { q: string; sort: 'desc' | 'asc'; sites: string[]; brands: string[]; services: string[]; users: string[]; type: string; status: string; pro: 'all' | 'standard' | 'pro'; from: string; to: string }
export const F0 = (): Filters => ({ q: '', sort: 'desc', sites: [], brands: [], services: [], users: [], type: 'All', status: 'All', pro: 'all', from: '', to: '' });
/** Même décompte que `activeFilterCount` de Projects.tsx (+ le PRO+ du modèle validé). */
export const nFilters = (f: Filters) => f.sites.length + f.brands.length + f.services.length + f.users.length + (f.type !== 'All' ? 1 : 0) + (f.status !== 'All' ? 1 : 0) + (f.pro !== 'all' ? 1 : 0) + (f.from ? 1 : 0) + (f.to ? 1 : 0);

/**
 * Liste filtrée — règles de la maquette validée, sur les VRAIS sites du projet (l'ancien filtre
 * comparait le libellé exact `p.site` : un projet multi-sites ou GROUPE BONY ne sortait sous aucun
 * de ses sites, défaut de l'inventaire). Un projet sans date de début passe toujours la période.
 */
export function listFor(projects: Project[], mode: Mode, f: Filters) {
  const plaques: Record<string, string[]> = D().PLAQUES;
  const q = f.q.trim().toLowerCase();
  const L = projects.filter((p) => {
    if (mode === 'archived' ? p.status !== 'Archived' : p.status === 'Archived') return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    const sites = sitesDuProjet(p);
    if (f.sites.length && !f.sites.some((s) => sites.includes(s) || (plaques[s] && sites.some((x) => plaques[s].includes(x))) || (s === 'Nissan' && (p.brands || []).includes('Nissan')))) return false;
    if (f.services.length && !f.services.some((s) => (p.service || []).includes(s as any) || (p.service || []).includes('Tous Services'))) return false;
    // Comme le vrai filtre : un projet Holding remonte sous n'importe quelle marque ; la puce Holding seule isole les projets Holding.
    if (f.brands.length && !f.brands.some((b) => (p.brands || []).includes(b as any) || (b !== 'Holding' && (p.brands || []).includes('Holding')))) return false;
    if (f.users.length && !f.users.some((u) => (p.assignedUsers || []).includes(u))) return false;
    if (f.type !== 'All' && p.projectType !== f.type) return false;
    if (f.status !== 'All' && p.status !== f.status) return false;
    if (f.pro !== 'all' && (f.pro === 'pro' ? !p.proPlus : !!p.proPlus)) return false;
    if (f.from && p.startDate && p.startDate < f.from) return false;
    if (f.to && p.startDate && p.startDate > f.to) return false;
    return true;
  });
  return L.sort((a, b) => (f.sort === 'asc' ? 1 : -1) * (a.startDate || '').localeCompare(b.startDate || ''));
}

/** Tri du tableau des tâches (`compareTasks` de Projects.tsx). */
export function sortTasks(tasks: Task[], k: string, dir: 'asc' | 'desc', users: User[]) {
  const s = dir === 'asc' ? 1 : -1, txt = (x?: string | null) => (x || '').toLocaleLowerCase('fr');
  return [...tasks].sort((a, b) => {
    switch (k) {
      case 'deadline': return !a.deadline && !b.deadline ? 0 : !a.deadline ? 1 : !b.deadline ? -1 : a.deadline.localeCompare(b.deadline) * s;
      case 'cost': return ((a.cost || 0) - (b.cost || 0)) * s;
      case 'status': return (TASK_ORDER[a.status] - TASK_ORDER[b.status]) * s;
      case 'assignee': { const na = userName(users, a.assignedUserId), nb = userName(users, b.assignedUserId); return !na && !nb ? 0 : !na ? 1 : !nb ? -1 : na.localeCompare(nb, 'fr') * s; }
      default: return txt((a as any)[k]).localeCompare(txt((b as any)[k]), 'fr') * s;
    }
  });
}

// ---------------------------------------------------------------- mode Expert (ExpertKpis.tsx, ExpertGantt.tsx)
/** Tâches ENGAGÉES (tout sauf « Vierge ») ; « finie » = Terminé ou Programmé. */
export const engaged = (p: Project) => (p.tasks || []).filter((t) => t.status !== 'Empty');
export const finished = (t: Task) => t.status === 'Done' || t.status === 'Programmed';
export const isLate = (t: Task, T = today()) => !finished(t) && !!t.deadline && t.deadline < T;
