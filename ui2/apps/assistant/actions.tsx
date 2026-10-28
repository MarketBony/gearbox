import React, { useEffect, useMemo, useState } from 'react';
import type { AssistantActionOutcome, AssistantActionView, Project, Task, TaskStatus, User } from '../../../types';
import { db } from '../../../services/dataService';
import { canEditProjects } from '../../../constants';
import { nouvelleTache, poserAssignes } from '../../../utils/projet';
import { workspace, useWorkspace, mutateProject, mutateTask, createStandalone, updateStandalone, currentRole, echo } from '../../store/workspace';
import { slotOf, minOf } from '../todo/postitLogic';
import { Icon, gx } from '../ui/kit';

// =====================================================================
// mIAouss QUI AGIT (lot 1a, 28/10/2026) — cartes d'action et EXÉCUTEURS, dans le navigateur.
//
// Le serveur PROPOSE (journal `AssistantAction` : une seule exécution, expiration 24 h) ; la personne VALIDE la
// carte ; le navigateur ÉCRIT par les fonctions de l'interface (workspace.ts, db.createPostIt) — mêmes routes, mêmes
// droits, mêmes messages d'échec que les écrans. Séquence : `claim` (champs corrigés) → exécuteur → `result`.
// ⚠️ Un exécuteur ne prétend JAMAIS avoir réussi si l'écriture a échoué : il rend { ok:false, error }.
// Navigation (`ouvrir`) : rien n'est écrit, exécutée toute seule à l'arrivée d'une réponse (ChatPane.send).
//
// Résolution des noms (projet, personnes, tâche) ICI, sur les données déjà cloisonnées du workspace : le modèle ne
// voit aucun identifiant. Ambigu ou introuvable → la carte demande un choix avant « Valider ».
// =====================================================================

/** Même normalisation que tools.ts (accents, casse, ponctuation). */
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: unknown): s is string => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
const frDay = (s: string) => (isDay(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s);
const errMsg = (e: any, d: string) => (e?.message && !/^Erreur \d+$/.test(e.message) ? e.message : d);
const EXPIRY_MS = 24 * 3600_000;   // = ACTION_EXPIRY_MS du serveur (le serveur fait foi : ceci ne fait que griser)

/** Statuts : le modèle parle français, l'interface en `TaskStatus`. On accepte les deux (payload normalisé ou non). */
const STATUT_IN: Record<string, TaskStatus> = { 'a faire': 'Todo', todo: 'Todo', 'en cours': 'InProgress', inprogress: 'InProgress', terminee: 'Done', termine: 'Done', fait: 'Done', faite: 'Done', done: 'Done' };
const STATUT_FR: Partial<Record<TaskStatus, string>> = { Todo: 'à faire', InProgress: 'en cours', Done: 'terminée' };
const toStatus = (v: unknown): TaskStatus | '' => STATUT_IN[norm(v)] || '';

/**
 * Correspondance par nom, du plus sûr au moins sûr : identique, puis début de mot, puis contenu. On rend le
 * PREMIER palier non vide — « Marie » ne ramène pas « Marie-Anne » si une « Marie » existe.
 */
function match<T>(items: T[], label: (x: T) => string, q: unknown, extra?: (x: T) => string[]): T[] {
  const n = norm(q); if (!n) return [];
  const keys = (x: T) => [label(x), ...(extra ? extra(x) : [])].map(norm);
  const exact = items.filter((x) => keys(x).some((k) => k === n)); if (exact.length) return exact;
  const start = items.filter((x) => keys(x).some((k) => k.startsWith(n) || k.split(' ').some((w) => w === n))); if (start.length) return start;
  return items.filter((x) => keys(x).some((k) => k.includes(n)));
}
/** Personnes : nom complet, prénom seul, nom de famille seul. */
const matchUsers = (users: User[], q: unknown) => match(users, (u) => u.name, q, (u) => u.name.split(/\s+/));

// ---------------------------------------------------------------- tâches (pour `modifier_tache`)
interface TaskRef { key: string; task: Task; project?: Project }
const keyOf = (t: Task, p?: Project) => (p ? `p:${p.id}:${t.id}` : `l:${t.id}`);
const taskLabel = (r: TaskRef) => `${r.task.name} — ${r.project ? r.project.name : 'tâche libre'}`;
/** Tâches modifiables : celles des projets non archivés, puis les tâches libres de la To-do. */
function allTasks(projects: Project[], standalone: Task[]): TaskRef[] {
  const L: TaskRef[] = [];
  for (const p of projects) if (p.status !== 'Archived') for (const t of p.tasks || []) L.push({ key: keyOf(t, p), task: t, project: p });
  for (const t of standalone) L.push({ key: keyOf(t), task: t });
  return L;
}
const findTask = (key: string): TaskRef | null => {
  const s = workspace.getState();
  if (key.startsWith('l:')) { const t = s.standalone.find((x) => x.id === key.slice(2)); return t ? { key, task: t } : null; }
  const [, pid, tid] = key.split(':'); const p = s.byId[pid]; const t = p?.tasks?.find((x) => x.id === tid);
  return p && t ? { key, task: t, project: p } : null;
};

// ---------------------------------------------------------------- brouillon de la carte (champs modifiables)
interface Pending { raw: string; hits: User[] }
export interface Draft {
  titre?: string; echeance?: string; statut?: TaskStatus | '';
  /** Projet : id, '' = tâche libre, null = à choisir (nom ambigu ou introuvable). */
  projet?: string | null; projetRaw?: string; projetHits?: Project[];
  assignes?: string[]; pending?: Pending[];
  /** `modifier_tache` : clé de la tâche, null = à choisir. */
  tache?: string | null; tacheRaw?: string; tacheHits?: TaskRef[];
  texte?: string; date?: string; heure?: string; duree?: number; journee?: boolean;
}

function initDraft(a: AssistantActionView, s = workspace.getState(), uid?: string): Draft {
  const p = a.payload || {};
  if (a.type === 'creer_tache') {
    const projets = s.projects.filter((x) => x.status !== 'Archived');
    const hits = p.projet ? match(projets, (x) => x.name, p.projet) : [];
    const pending: Pending[] = [], ids: string[] = [];
    for (const raw of (Array.isArray(p.assignes) ? p.assignes : p.assignes ? [p.assignes] : []).map(String)) {
      const h = matchUsers(s.users, raw);
      if (h.length === 1) { if (!ids.includes(h[0].id)) ids.push(h[0].id); } else pending.push({ raw, hits: h });
    }
    const projet = !p.projet ? '' : hits.length === 1 ? hits[0].id : null;
    // Tâche libre sans personne : invisible dans toute To-do → moi par défaut (même règle que TodoApp.TaskForm).
    if (projet === '' && !ids.length && !pending.length && uid) ids.push(uid);
    return { titre: String(p.titre || ''), echeance: isDay(p.echeance) ? p.echeance : '', statut: toStatus(p.statut) || 'Todo', projet, projetRaw: p.projet ? String(p.projet) : '', projetHits: hits, assignes: ids, pending };
  }
  if (a.type === 'modifier_tache') {
    const hits = match(allTasks(s.projects, s.standalone), (r) => r.task.name, p.tache);
    return { tache: hits.length === 1 ? hits[0].key : null, tacheRaw: String(p.tache || ''), tacheHits: hits, statut: toStatus(p.statut), echeance: isDay(p.echeance) ? p.echeance : '' };
  }
  if (a.type === 'creer_postit') {
    const journee = !!p.journee || !isTime(p.heure);
    return { texte: String(p.texte || ''), date: isDay(p.date) ? p.date : '', heure: isTime(p.heure) ? p.heure : '09:00', duree: Number(p.duree_min) > 0 ? Math.round(Number(p.duree_min)) : 60, journee };
  }
  return {};
}

/** Ce qui manque avant « Valider » (null = prêt). */
function missing(a: AssistantActionView, d: Draft | null): string | null {
  if (a.type === 'ouvrir') return null;
  if (!d) return 'Chargement…';
  const role = currentRole();
  if (a.type === 'creer_tache') {
    if (!canEditProjects(role)) return 'Ton rôle ne permet pas de créer une tâche.';
    if (!d.titre?.trim()) return 'Donne un titre à la tâche.';
    if (d.projet === null) return 'Choisis le projet.';
    if (d.pending?.length) return 'Précise qui assigner.';
    if (d.projet === '' && !d.assignes?.length) return 'Une tâche libre doit avoir au moins une personne.';
    return null;
  }
  if (a.type === 'modifier_tache') {
    if (!d.tache) return d.tacheHits?.length ? 'Choisis la tâche.' : `Tâche « ${d.tacheRaw} » introuvable.`;
    const r = findTask(d.tache);
    if (!r) return 'Cette tâche n’existe plus.';
    if (r.project && !canEditProjects(role)) return 'Ton rôle ne permet pas de modifier cette tâche.';
    if (!d.statut && !d.echeance) return 'Rien à modifier : choisis un statut ou une échéance.';
    return null;
  }
  if (a.type === 'creer_postit') {
    if (!d.texte?.trim()) return 'Le post-it est vide.';
    if (!isDay(d.date)) return 'Choisis la date.';
    if (!d.journee && !isTime(d.heure)) return 'Choisis l’heure.';
    return null;
  }
  return 'Action inconnue de cette version de Gearbox.';
}

/** Champs corrigés renvoyés au `claim`, dans la FORME DES OUTILS du modèle (le serveur les revalide par `checkAction`). */
function payloadOf(a: AssistantActionView, d: Draft): Record<string, unknown> | undefined {
  const s = workspace.getState();
  if (a.type === 'creer_tache') {
    const names = (d.assignes || []).map((id) => s.users.find((u) => u.id === id)?.name).filter(Boolean);
    return { titre: d.titre!.trim(), ...(d.projet ? { projet: s.byId[d.projet]?.name } : {}), ...(d.echeance ? { echeance: d.echeance } : {}), ...(names.length ? { assignes: names } : {}), statut: STATUT_FR[d.statut as TaskStatus] || 'à faire' };
  }
  if (a.type === 'modifier_tache') {
    const r = d.tache ? findTask(d.tache) : null;
    return { tache: r?.task.name || d.tacheRaw, ...(d.statut ? { statut: STATUT_FR[d.statut] } : {}), ...(d.echeance ? { echeance: d.echeance } : {}) };
  }
  if (a.type === 'creer_postit') {
    return { texte: d.texte!.trim(), date: d.date, ...(d.journee ? { journee: true } : { heure: d.heure, duree_min: d.duree || 60 }) };
  }
  return undefined;
}

// ---------------------------------------------------------------- exécuteurs
type Outcome = AssistantActionOutcome;

async function creerTache(d: Draft): Promise<Outcome> {
  if (!canEditProjects(currentRole())) return { ok: false, error: 'Droits insuffisants pour créer une tâche.' };
  const name = d.titre!.trim(), status = (d.statut || 'Todo') as TaskStatus;
  const ids = d.assignes || [];
  if (d.projet) {
    const p = workspace.getState().byId[d.projet];
    if (!p) return { ok: false, error: 'Ce projet n’est plus accessible.' };
    const t: Task = { ...nouvelleTache(), name, status, ...(d.echeance ? { deadline: d.echeance } : {}), ...poserAssignes(ids) };
    mutateProject(p.id, (x) => ({ ...x, tasks: [...(x.tasks || []), t] }));
    // ⚠️ `mutateProject` ne s'attend pas : il affiche tout de suite et confie l'envoi à la FILE de sauvegarde
    // (reprises comprises). On considère l'action faite dès que la tâche est dans l'état local ; un refus du serveur
    // est signalé par la coque (saveError) et l'écran revient à l'état du serveur.
    if (!workspace.getState().byId[p.id]?.tasks?.some((x) => x.id === t.id)) return { ok: false, error: 'La tâche n’a pas pu être ajoutée au projet.' };
    return { ok: true, summary: `Tâche « ${name} » ajoutée au projet « ${p.name} »`, ref: t.id };
  }
  if (!ids.length) return { ok: false, error: 'Une tâche libre doit avoir au moins une personne.' };
  try {
    // Même forme que TodoApp.TaskForm (liste blanche `FIELDS` de /api/tasks) ; le 400 du serveur remonte tel quel.
    const t = await createStandalone({ name, provider: '', channel: '' as any, status, ...poserAssignes(ids), deadline: d.echeance || (null as any), sites: [], brands: [], service: [] });
    if (!t) return { ok: false, error: 'Échec de l’enregistrement.' };
    return { ok: true, summary: `Tâche libre « ${name} » créée`, ref: t.id };
  } catch (e) { return { ok: false, error: errMsg(e, 'Échec de l’enregistrement.') }; }
}

async function modifierTache(d: Draft): Promise<Outcome> {
  const r = d.tache ? findTask(d.tache) : null;
  if (!r) return { ok: false, error: 'Cette tâche n’existe plus.' };
  const patch: Partial<Task> = { ...(d.statut ? { status: d.statut } : {}), ...(d.echeance ? { deadline: d.echeance } : {}) };
  const what = [d.statut ? `statut « ${STATUT_FR[d.statut] || d.statut} »` : '', d.echeance ? `échéance au ${frDay(d.echeance)}` : ''].filter(Boolean).join(', ');
  if (r.project) {
    if (!canEditProjects(currentRole())) return { ok: false, error: 'Droits insuffisants pour modifier ce projet.' };
    mutateTask(r.project.id, r.task.id, patch);   // file de sauvegarde, comme creerTache (pas d'attente possible)
    return { ok: true, summary: `Tâche « ${r.task.name} » (${r.project.name}) : ${what}`, ref: r.task.id };
  }
  try { await updateStandalone(r.task.id, patch); } catch (e) { return { ok: false, error: errMsg(e, 'Échec de l’enregistrement.') }; }
  return { ok: true, summary: `Tâche « ${r.task.name} » : ${what}`, ref: r.task.id };
}

async function creerPostit(d: Draft): Promise<Outcome> {
  // Formats du tableau de post-it (PostItBoard) : journée « AAAA-MM-JJ » (fin incluse), créneau « AAAA-MM-JJTHH:mm ».
  const start = d.journee ? d.date! : `${d.date}T${d.heure}`;
  const end = d.journee ? d.date! : slotOf(d.date!, minOf(start) + (d.duree || 60));
  try {
    const p = await db.createPostIt({ title: d.texte!.trim(), start, end, allDay: !!d.journee, color: 'yellow' });
    echo('postits:changed', null);   // le serveur n'avertit pas l'onglet qui écrit : un tableau ouvert ici se relit
    return { ok: true, summary: `Post-it « ${p.title} » le ${frDay(d.date!)}${d.journee ? '' : ` à ${d.heure}`}`, ref: p.id };
  } catch (e) { return { ok: false, error: errMsg(e, 'Création du post-it impossible.') }; }
}

async function ouvrir(payload: Record<string, any>): Promise<Outcome> {
  const G = gx(), app = String(payload.rubrique || '');
  const nomApp = G?.app?.(app)?.name || app;
  if (payload.projet) {
    if (!G?.shell?.canOpen?.('projects')) return { ok: false, error: 'La rubrique Projets n’est pas accessible avec ton rôle.' };
    const hits = match(workspace.getState().projects, (p) => p.name, payload.projet);
    if (hits.length === 1) {
      return G.shell.openWith('projects', `select:${hits[0].id}`) ? { ok: true, summary: `Projet « ${hits[0].name} » ouvert`, ref: hits[0].id } : { ok: false, error: 'Ouverture refusée.' };
    }
    // Ambigu ou introuvable : on ouvre la liste, sans choisir à la place de la personne.
    if (!G.wm.open('projects')) return { ok: false, error: 'Ouverture refusée.' };
    return { ok: true, summary: hits.length ? `Projets ouverts (${hits.length} projets s’appellent « ${payload.projet} »)` : `Projets ouverts (projet « ${payload.projet} » introuvable)` };
  }
  if (!app || !G?.shell?.canOpen?.(app)) return { ok: false, error: `La rubrique « ${nomApp} » n’est pas accessible avec ton rôle.` };
  return G.wm.open(app) ? { ok: true, summary: `${nomApp} ouvert` } : { ok: false, error: 'Ouverture refusée.' };
}

async function execute(a: AssistantActionView, d: Draft | null): Promise<Outcome> {
  if (a.type === 'ouvrir') return ouvrir(a.payload || {});
  // Sans brouillon (ne devrait pas arriver : seules les cartes validées écrivent), on résout depuis le payload.
  const dd = d || initDraft(a);
  const manque = missing(a, dd); if (manque) return { ok: false, error: manque };
  if (a.type === 'creer_tache') return creerTache(dd);
  if (a.type === 'modifier_tache') return modifierTache(dd);
  if (a.type === 'creer_postit') return creerPostit(dd);
  return { ok: false, error: 'Action inconnue de cette version de Gearbox.' };
}

/**
 * Séquence complète : réservation (une seule exécution, 409 sinon) → écriture → compte rendu au serveur.
 * Ne rejette jamais : rend l'issue (et `error` si la réservation a été refusée).
 */
export async function runAction(a: AssistantActionView, d: Draft | null = null): Promise<Outcome> {
  let claimed: AssistantActionView;
  try { claimed = (await db.assistantClaimAction(a.id, d ? payloadOf(a, d) : undefined)).action || a; }
  catch (e) { return { ok: false, error: errMsg(e, 'Cette action n’est plus disponible.') }; }
  let out: Outcome;
  try { out = await execute(claimed, d); } catch (e) { out = { ok: false, error: errMsg(e, 'Échec inattendu.') }; }
  // Journal : si ce compte rendu se perd, l'action reste « en cours » côté serveur — elle ne sera pas rejouée.
  try { await db.assistantActionResult(a.id, out); } catch { /* rien de plus à faire ici */ }
  return out;
}

// ---------------------------------------------------------------- la carte
const ICON: Record<string, string> = { ouvrir: 'arrowr', creer_tache: 'todo', modifier_tache: 'edit', creer_postit: 'pin' };
const STATE_L: Record<string, string> = { executing: 'En cours…', done: 'Fait', failed: 'Échec', refused: 'Refusée', expired: 'Expirée' };

/** `uid` : compte connecté (assigné par défaut d'une tâche libre). `onChanged` : relire la discussion. */
export const ActionCard: React.FC<{ a: AssistantActionView; uid: string; onChanged: () => void }> = ({ a, uid, onChanged }) => {
  const ready = useWorkspace((s) => s.ready), users = useWorkspace((s) => s.users);
  // Abonnement aux projets ET aux tâches libres : la carte suit l'état (tâche supprimée ailleurs → « n'existe plus »).
  const projects = useWorkspace((s) => s.projects); useWorkspace((s) => s.standalone);
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<'run' | 'refuse' | null>(null);
  const [err, setErr] = useState('');
  const expired = a.status === 'expired' || (a.status === 'proposed' && Date.now() - new Date(a.createdAt).getTime() > EXPIRY_MS);
  const st = busy === 'run' ? 'executing' : expired ? 'expired' : a.status;
  const live = st === 'proposed';
  // Brouillon posé une fois les données chargées (sinon « Marie » ne trouverait personne) ; ensuite, il est à la personne.
  useEffect(() => {
    if (live && !d && ready && users.length) setD(initDraft(a, workspace.getState(), uid));
  }, [live, d, ready, users.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<Draft>) => setD((x) => ({ ...(x || {}), ...p }));
  const manque = live ? missing(a, d) : null;

  const validate = async () => {
    setBusy('run'); setErr('');
    const out = await runAction(a, d);
    if (!out.ok) setErr(out.error || 'Échec.');
    setBusy(null); onChanged();
  };
  const refuse = async () => {
    setBusy('refuse'); setErr('');
    try { await db.assistantRefuseAction(a.id); } catch (e) { setErr(errMsg(e, 'Refus impossible.')); }
    setBusy(null); onChanged();
  };

  const name = (id: string) => users.find((u) => u.id === id)?.name || 'Inconnu';
  const projOptions = useMemo(() => projects.filter((p) => p.status !== 'Archived').sort((x, y) => x.name.localeCompare(y.name)), [projects]);

  const fields = !live || !d ? null : (
    <div className="mia-act-f">
      {a.type === 'creer_tache' && <>
        <label className="full"><span>Titre</span><input className="input" value={d.titre} onChange={(e) => set({ titre: e.target.value })} /></label>
        <label className="full"><span>Projet</span>
          <select className={`select ${d.projet === null ? 'need' : ''}`} value={d.projet ?? '__need'} onChange={(e) => set({ projet: e.target.value })}>
            {d.projet === null && <option value="__need" disabled>{d.projetHits?.length ? `« ${d.projetRaw} » : lequel ?` : `« ${d.projetRaw} » introuvable : choisir`}</option>}
            <option value="">Tâche libre (sans projet)</option>
            {!!d.projetHits?.length && d.projetHits.length > 1 && <optgroup label="Correspondances">{d.projetHits.map((p) => <option key={`h${p.id}`} value={p.id}>{p.name}</option>)}</optgroup>}
            <optgroup label="Projets">{projOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
          </select>
        </label>
        <label><span>Échéance</span><input type="date" className="input" value={d.echeance} onChange={(e) => set({ echeance: e.target.value })} /></label>
        <label><span>Statut</span><select className="select" value={d.statut || 'Todo'} onChange={(e) => set({ statut: e.target.value as TaskStatus })}>{(['Todo', 'InProgress', 'Done'] as TaskStatus[]).map((k) => <option key={k} value={k}>{STATUT_FR[k]}</option>)}</select></label>
        <div className="full"><span>Assignés</span>
          <div className="mia-act-ppl">
            {(d.assignes || []).map((id) => <span key={id} className="mia-act-chip">{name(id)}<button type="button" title="Retirer" onClick={() => set({ assignes: d.assignes!.filter((x) => x !== id) })}><Icon name="close" /></button></span>)}
            {(d.pending || []).map((pd, i) => (
              <select key={`p${i}`} className="select need" value="" onChange={(e) => {
                const v = e.target.value, rest = d.pending!.filter((_, j) => j !== i);
                set({ pending: rest, assignes: v === '__drop' || (d.assignes || []).includes(v) ? d.assignes : [...(d.assignes || []), v] });
              }}>
                <option value="" disabled>{pd.hits.length ? `« ${pd.raw} » : qui ?` : `« ${pd.raw} » introuvable`}</option>
                {(pd.hits.length ? pd.hits : users).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                <option value="__drop">— Ne pas assigner</option>
              </select>
            ))}
            <select className="select add" value="" onChange={(e) => e.target.value && set({ assignes: [...(d.assignes || []), e.target.value] })}>
              <option value="" disabled>+ Personne</option>
              {users.filter((u) => !(d.assignes || []).includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>
      </>}
      {a.type === 'modifier_tache' && <>
        {(!d.tache || (d.tacheHits?.length || 0) > 1) && !!d.tacheHits?.length && (
          <label className="full"><span>Tâche</span>
            <select className={`select ${d.tache ? '' : 'need'}`} value={d.tache || '__need'} onChange={(e) => set({ tache: e.target.value })}>
              {!d.tache && <option value="__need" disabled>« {d.tacheRaw} » : laquelle ?</option>}
              {d.tacheHits.map((r) => <option key={r.key} value={r.key}>{taskLabel(r)}</option>)}
            </select>
          </label>
        )}
        {d.tache && (d.tacheHits?.length || 0) <= 1 && (() => { const r = findTask(d.tache); return r ? <div className="full mia-act-what">{taskLabel(r)}</div> : null; })()}
        <label><span>Statut</span><select className="select" value={d.statut || ''} onChange={(e) => set({ statut: e.target.value as TaskStatus | '' })}><option value="">Inchangé</option>{(['Todo', 'InProgress', 'Done'] as TaskStatus[]).map((k) => <option key={k} value={k}>{STATUT_FR[k]}</option>)}</select></label>
        <label><span>Échéance</span><input type="date" className="input" value={d.echeance} onChange={(e) => set({ echeance: e.target.value })} /></label>
      </>}
      {a.type === 'creer_postit' && <>
        <label className="full"><span>Texte</span><input className="input" value={d.texte} onChange={(e) => set({ texte: e.target.value })} /></label>
        <label><span>Date</span><input type="date" className="input" value={d.date} onChange={(e) => set({ date: e.target.value })} /></label>
        <label className="mia-act-check"><input type="checkbox" checked={!!d.journee} onChange={(e) => set({ journee: e.target.checked })} /><span>Journée</span></label>
        {!d.journee && <>
          <label><span>Heure</span><input type="time" className="input" value={d.heure} step={900} onChange={(e) => set({ heure: e.target.value })} /></label>
          <label><span>Durée</span><select className="select" value={String(d.duree || 60)} onChange={(e) => set({ duree: +e.target.value })}>{[...new Set([15, 30, 45, 60, 90, 120, 180, d.duree || 60])].sort((x, y) => x - y).map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`}</option>)}</select></label>
        </>}
      </>}
    </div>
  );

  const res: string = a.result?.summary || '';
  return (
    <div className={`mia-act is-${st}`}>
      <div className="mia-act-h">
        <Icon name={ICON[a.type] || 'bolt'} />
        <span className="grow">{a.summary}</span>
        {st !== 'proposed' && <span className="mia-act-st">{st === 'executing' ? <span className="mia-spin"><Icon name="refresh" /></span> : null}{STATE_L[st] || st}</span>}
      </div>
      {fields}
      {live && !d && a.type !== 'ouvrir' && <div className="mia-act-note">Chargement des données…</div>}
      {st === 'done' && <div className="mia-act-res">✅ {res || 'C’est fait.'}</div>}
      {st === 'failed' && <div className="mia-act-res bad">⚠️ {a.error || 'Échec.'}</div>}
      {st === 'executing' && busy !== 'run' && <div className="mia-act-note">Exécution en cours ailleurs, ou interrompue (onglet fermé ?) : vérifie dans la rubrique.</div>}
      {err && st !== 'failed' && <div className="mia-act-res bad">⚠️ {err}</div>}
      {live && (
        <div className="mia-act-foot">
          {manque && <span className="mia-act-why">{manque}</span>}
          <span className="grow" />
          <button className="btn sm ghost" disabled={!!busy} onClick={refuse}>{busy === 'refuse' ? '…' : 'Refuser'}</button>
          <button className="btn sm primary" disabled={!!busy || !!manque} onClick={validate}><Icon name="check" />Valider</button>
        </div>
      )}
    </div>
  );
};
