import type { Project, Task } from '../../../types';
import { SERVICES } from '../../../constants';
import { gx } from '../ui/kit';

// =====================================================================
// To-do — RÈGLES COMMUNES (sorties de TodoApp.tsx le 09/10/2026) : la rubrique, le widget « To-do » du bureau,
// « Mes tâches » et « Ma journée » lisent la MÊME liste. Uniquement les tâches ASSIGNÉES à moi : tâches des projets
// Actifs ou Brouillons dont la fin n'est pas passée (Brouillon inclus : exception voulue, CLAUDE.md) + tâches
// LIBRES, qui ne disparaissent que terminées ET échues ; « Vierge » masqué. Date de référence = échéance de la
// tâche, sinon fin du projet.
// =====================================================================

export type ColKey = 'Todo' | 'InProgress' | 'Programmed' | 'Done';
export const COLS: [ColKey, string, string][] = [['Todo', 'À faire', 'var(--info)'], ['InProgress', 'En cours', 'var(--bony-orange)'], ['Programmed', 'Programmé', 'var(--bony-violet)'], ['Done', 'Terminé', 'var(--ok)']];
export const FILTER_SERVICES = SERVICES.filter((s) => s !== 'Tous Services');          // comme TodoList.tsx
export const FORM_SERVICES = SERVICES as string[];                                       // formulaire : complet
export const brandLabel = (b: string) => (b === 'Holding' ? 'GROUPE BONY' : b);

export interface Item { id: string; t: Task; p: Project | null; sites: string[]; brands: string[]; services: string[]; ref: string; start: string; noDate: boolean }
export interface Filters { q: string; sites: string[]; brands: string[]; services: string[]; from: string; to: string }
export const F0: Filters = { q: '', sites: [], brands: [], services: [], from: '', to: '' };

export const todayIso = () => gx().iso(gx().today());
export const daysTo = (d: string) => Math.round((+new Date(d) - +gx().today()) / 864e5);
export const sitesOf = (p: Project) => (p.sites && p.sites.length ? p.sites : p.site ? [p.site] : []);

export function buildItems(projects: Project[], standalone: Task[], uid: string): Item[] {
  const out: Item[] = [], T = todayIso();
  for (const p of projects) {
    if (!(p.status === 'Active' || p.status === 'Draft') || p.endDate < T) continue;
    for (const t of p.tasks || []) if (t.assignedUserId === uid && t.status !== 'Empty')
      out.push({ id: t.id, t, p, sites: sitesOf(p), brands: p.brands || [], services: p.service || [], ref: t.deadline || p.endDate, start: p.startDate, noDate: false });
  }
  for (const t of standalone) {
    if (t.assignedUserId !== uid) continue;
    if (t.status === 'Done' && t.deadline && t.deadline < T) continue;
    out.push({ id: t.id, t, p: null, sites: t.sites || [], brands: t.brands || [], services: t.service || [], ref: t.deadline || '9999-12-31', start: t.deadline || T, noDate: !t.deadline });
  }
  return out;
}
export function inGlobal(it: Item) {
  const per = gx().ctx.perimetre; if (!per || per === 'Tout le réseau') return true;
  if (per === 'Nissan') return it.brands.includes('Nissan');
  return !it.sites.length || it.sites.includes(per);
}
export function urgency(it: Item) {
  if (it.noDate) return { txt: 'Sans échéance', cls: 'none', edge: '' };
  const d = daysTo(it.ref), left = `${d} j restant${d > 1 ? 's' : ''}`;
  if (d < 0) return { txt: `Expiré il y a ${-d} j`, cls: 'late', edge: 'r' };
  if (d <= 3) return { txt: left, cls: 'crit', edge: 'r' };
  if (d <= 7) return { txt: left, cls: 'warn', edge: 'o' };
  return { txt: gx().fmt.dateY(it.ref), cls: '', edge: '' };
}
/** Filtres de la rubrique (mêmes règles que la maquette et TodoList.tsx). */
export function matches(it: Item, f: Filters) {
  const q = f.q.trim().toLowerCase();
  if (!inGlobal(it)) return false;
  if (q && !`${it.t.name} ${it.p?.name || ''}`.toLowerCase().includes(q)) return false;
  if (f.sites.length && !f.sites.some((s) => (s === 'Nissan' ? it.brands.includes('Nissan') : it.sites.includes(s)))) return false;
  if (f.brands.length && !f.brands.some((b) => it.brands.includes(b))) return false;
  if (f.services.length && !f.services.some((s) => it.services.includes(s))) return false;
  if (f.from && it.ref < f.from) return false;
  if (f.to && it.start > f.to) return false;
  return true;
}
export const sortIt = (a: Item, b: Item) => a.ref.localeCompare(b.ref) || a.t.name.localeCompare(b.t.name);
export const siteLbl = (v: string[]) => (v.length ? `${v.length} site${v.length > 1 ? 's' : ''}` : 'Périmètre');

