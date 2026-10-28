import React, { useEffect, useMemo, useState } from 'react';
import type { AssistantActionOutcome, AssistantActionView, BrandType, DigitalTags, Project, ProjectType, ServiceType, SocialServiceType, SocialTarget, Task, TaskStatus, User } from '../../../types';
import { db } from '../../../services/dataService';
import { canEditProjects, canEditDigital, BRANDS, SERVICES, PROJECT_TYPES, RDM_BRANDS, SOCIAL_SERVICES, DIGITAL_CONCESSIONS, isHoldingBrand, siteSharesOf, splitShareToBuckets, libelleMarqueDigital } from '../../../constants';
import { nouvelleTache, poserAssignes, nouveauProjet, recalculerProjet, poserSites, basculerMarque, basculerService, marqueAutorisee, sitesDuProjet, groupeDuProjet, type GroupeProjet } from '../../../utils/projet';
import { workspace, useWorkspace, mutateProject, mutateTask, createStandalone, updateStandalone, createProject, currentRole, echo } from '../../store/workspace';
import { createSocialPost, digitalTags } from '../../store/collections';
import { slotOf, minOf } from '../todo/postitLogic';
import { resolveSites } from './tools';
import { GROUP_LABEL, LABEL_GROUP, brandHex } from '../projects/common';
import { Icon, gx, hud, PickerBtn } from '../ui/kit';

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
//
// Lot 1b (28/10/2026) : `creer_projet` (ACTIF par défaut — décision de Théo : la carte montre tout ce qui pèse sur
// les chiffres, dont la répartition par enveloppe) et `creer_publication` (statut « Rédigé »).
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

// ---------------------------------------------------------------- projets et publications (lot 1b, 28/10/2026)
// Les règles d'un projet (sites, répartition, marques, services) sont celles de `utils/projet.ts` — les mêmes que la
// fiche projet v2 ; le routage budgétaire de l'aperçu est celui de `constants.ts`. RIEN n'est réécrit ici.

/** Liste d'arguments du modèle : tableau, chaîne seule ou rien. */
const listOf = (v: unknown): string[] => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).trim()).filter(Boolean);

/** Marque canonique (`BRANDS`) ; « GROUPE BONY » / « Groupe » = Holding (libellé Digital, ancienne valeur). */
const brandOf = (raw: string): BrandType | null => {
  const h = match(BRANDS, (b) => b, raw, (b) => (b === 'Holding' ? ['GROUPE BONY', 'Groupe'] : []));
  return h.length === 1 ? h[0] : null;
};
/** Marques dans l'ordre donné, par `basculerMarque` : Holding exclusif (le poser retire les autres, et inversement). */
function marquesDe(raws: string[]): { marques: BrandType[]; ignorees: string[] } {
  let marques: BrandType[] = []; const ignorees: string[] = [];
  for (const raw of raws) {
    const b = brandOf(raw);
    if (!b) ignorees.push(raw); else if (!marques.includes(b)) marques = basculerMarque({ brands: marques } as Project, b).brands;
  }
  return { marques, ignorees };
}

/**
 * « GROUPE BONY » (pondéré global ou R/N) : périmètre groupé du projet. « tout le réseau », « tous les sites » :
 * le modèle n'a pas tranché entre les deux tables de ventilation → '' (choix demandé dans la carte). null : pas un groupe.
 */
const GROUPE_FLOU = /^(tout|toutes|tous|reseau|groupe|tout le reseau|tout le groupe|toutes les concessions|tous les sites|toutes les concessions du groupe)$/;
function groupeDit(raw: string): GroupeProjet | '' | null {
  const n = norm(raw).replace(/^(la |le |les |l )/, '');
  if (n === 'groupe bony r n' || n === 'groupe bony rn') return 'GROUPE BONY (R/N)';
  if (n === 'groupe bony' || n === 'groupe bony global') return 'GROUPE BONY';
  return GROUPE_FLOU.test(n) ? '' : null;
}

/** Curseur reçu du modèle (0-100) ; vide = null = 100 % sur la marque (règle de `splitShareToBuckets`). */
const shareIn = (v: unknown): number | null => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(100, Math.round(Number(v)))));

/**
 * Curseurs Alpine / Nissan AFFICHÉS — même condition que la fiche projet v2 (`shareBrands`, ProjectDetail.tsx) : une
 * marque RDM est présente, et Alpine passe avant Nissan (le curseur Nissan, sans effet, n'est pas montré).
 * ⚠️ Condition jumelle de celle de la fiche : si l'une change, l'autre aussi.
 */
const curseurs = (p: Project): ('Alpine' | 'Nissan')[] => {
  const b = p.brands || [];
  if (!b.some((x) => RDM_BRANDS.includes(x))) return [];
  return (['Alpine', 'Nissan'] as const).filter((x) => b.includes(x)).filter((x, _i, all) => !(x === 'Nissan' && all.includes('Alpine')));
};

/** Projet tel qu'il sera ÉCRIT (et tel que l'aperçu le répartit) : un curseur non affiché n'est pas envoyé. */
function projetFinal(p: Project): Project {
  const shown = curseurs(p);
  const { alpineShare, nissanShare, ...rest } = p;
  return recalculerProjet({
    ...rest, name: (p.name || '').trim(), description: (p.description || '').trim(),
    ...(shown.includes('Alpine') && alpineShare != null ? { alpineShare } : {}),
    ...(shown.includes('Nissan') && nissanShare != null ? { nissanShare } : {}),
  } as Project);
}

/**
 * Aperçu : part (0 → 1) de chaque ENVELOPPE, par les fonctions du Budget et du Dashboard (`isHoldingBrand`,
 * `siteSharesOf`, `splitShareToBuckets` de constants.ts) — même enchaînement que `computeBudgetStats` pour un projet.
 * La carte multiplie par le budget prévu.
 */
function repartition(p: Project): { hors: boolean; lignes: [string, number][] } {
  if (isHoldingBrand(p.brands)) return { hors: true, lignes: [] };
  const acc: Record<string, number> = {};
  for (const [raw, pct] of Object.entries(siteSharesOf(p))) {
    if (!raw || !(pct > 0)) continue;
    for (const { site, ratio } of splitShareToBuckets(raw, p.brands, null, { alpineShare: p.alpineShare, nissanShare: p.nissanShare })) {
      acc[site] = (acc[site] || 0) + (pct / 100) * ratio;
    }
  }
  return { hors: false, lignes: Object.entries(acc).sort((x, y) => y[1] - x[1]) };
}

/** Le Budget n'impute un projet qu'à ses services VN / VO / PR / APV (`computeBudgetStats`, « Tous Services » = les 4). */
const sansServiceBudget = (p: Project) => !(p.service || []).some((s) => ['VN', 'VO', 'PR', 'APV', 'Tous Services'].includes(s));

// ---------------------------------------------------------------- brouillon de la carte (champs modifiables)
interface Pending { raw: string; hits: User[] }
/** Valeur citée par le modèle, à trancher dans la carte (réseau, concession) : correspondances, ou rien. */
interface PendingS { raw: string; hits: string[] }
export interface Draft {
  titre?: string; echeance?: string; statut?: TaskStatus | '';
  /** Projet : id, '' = tâche libre, null = à choisir (nom ambigu ou introuvable). */
  projet?: string | null; projetRaw?: string; projetHits?: Project[];
  assignes?: string[]; pending?: Pending[];
  /** `modifier_tache` : clé de la tâche, null = à choisir. */
  tache?: string | null; tacheRaw?: string; tacheHits?: TaskRef[];
  texte?: string; date?: string; heure?: string; duree?: number; journee?: boolean;
  /** `creer_projet` : le projet en préparation, édité par les règles de utils/projet.ts. */
  prj?: Project;
  /** Concessions citées introuvables, et « tout le réseau » non tranché (groupe global ou R/N ?). */
  inconnus?: string[]; flou?: string;
  /** Marques citées non reconnues, ou retirées faute de site éligible (affichage seul). */
  ignorees?: string[]; retirees?: string[];
  /** `creer_publication`. */
  reseaux?: string[]; reseauxP?: PendingS[]; marques?: BrandType[]; concessions?: string[]; concessionsP?: PendingS[];
  service?: SocialServiceType; cibles?: SocialTarget[]; points?: string[];
  /** Compte connecté (journal d'activité de la publication). */
  uid?: string;
}

function initProjet(p: Record<string, any>, uid?: string): Draft {
  // Sites : « GROUPE BONY » → périmètre groupé ; le reste par `resolveSites` (plaque → ses sites, alias Thiers → Ricoux).
  let groupe: GroupeProjet | null = null, flou = '';
  const sites: string[] = [], inconnus: string[] = [];
  for (const raw of listOf(p.sites)) {
    const g = groupeDit(raw);
    if (g) { groupe = groupe || g; continue; }
    if (g === '') { flou = flou || raw; continue; }
    const r = resolveSites([raw]);
    r.sites.forEach((x) => { if (!sites.includes(x)) sites.push(x); });
    inconnus.push(...r.inconnus);
  }
  const { marques, ignorees } = marquesDe(listOf(p.marques));
  const svc = listOf(p.services).map((raw) => (SERVICES as string[]).find((x) => norm(x) === norm(raw)) || (/^tous/.test(norm(raw)) ? 'Tous Services' : '')).filter(Boolean) as ServiceType[];
  const services = svc.includes('Tous Services') ? ['Tous Services'] as ServiceType[] : [...new Set(svc)];
  const type = (PROJECT_TYPES as string[]).find((t) => norm(t) === norm(p.type)) as ProjectType | undefined;
  const debut = isDay(p.debut) ? p.debut : '', fin = isDay(p.fin) ? p.fin : debut;
  const budget = Number(p.budget);
  // Valeurs par défaut de la création à la main (`nouveauProjet`) pour ce que le modèle n'a pas donné (marque, service,
  // type), puis les règles de la fiche : `poserSites` (répartition à parts égales, ou pondérée d'un groupe) qui retire
  // une marque sans site éligible.
  const base: Project = {
    ...nouveauProjet(String(p.nom || '').trim(), uid),
    ...(marques.length ? { brands: marques } : {}), ...(services.length ? { service: services } : {}), ...(type ? { projectType: type } : {}),
    status: norm(p.statut) === 'brouillon' ? 'Draft' : 'Active',   // décision de Théo (28/10) : actif par défaut
    startDate: debut, endDate: fin && debut && fin < debut ? debut : fin,
    budgetPlanned: Number.isFinite(budget) && budget > 0 ? Math.round(budget * 100) / 100 : 0,
    description: String(p.description || ''),
  };
  const a = shareIn(p.part_alpine), n = shareIn(p.part_nissan);
  if (a !== null) base.alpineShare = a;
  if (n !== null) base.nissanShare = n;
  const prj = groupe ? poserSites(base, { groupe }) : poserSites(base, { sites });
  const retirees = (base.brands || []).filter((b) => !(prj.brands || []).includes(b));
  return { prj, inconnus, flou, ignorees, retirees };
}

function initPublication(p: Record<string, any>, tags: DigitalTags | null | undefined, uid?: string): Draft {
  // Réseaux : tags Digital EXISTANTS seulement (un nom inconnu se choisit dans la liste, jamais créé ici).
  const nets = tags?.networks || [];
  const reseaux: string[] = [], reseauxP: PendingS[] = [];
  for (const raw of listOf(p.reseaux)) {
    const h = match(nets, (x) => x, raw);
    if (h.length === 1) { if (!reseaux.includes(h[0])) reseaux.push(h[0]); } else reseauxP.push({ raw, hits: h });
  }
  // Concessions : liste du Digital (`DIGITAL_CONCESSIONS`), puis plaque → ses sites par `resolveSites`.
  const concessions: string[] = [], concessionsP: PendingS[] = [];
  const add = (x: string) => { if (!concessions.includes(x)) concessions.push(x); };
  for (const raw of listOf(p.concessions)) {
    const h = match(DIGITAL_CONCESSIONS, (x) => x, raw);
    if (h.length === 1) { add(h[0]); continue; }
    const r = resolveSites([raw]), ok = r.sites.filter((x) => DIGITAL_CONCESSIONS.includes(x));
    if (ok.length && !r.inconnus.length) ok.forEach(add); else concessionsP.push({ raw, hits: h });
  }
  const service = (SOCIAL_SERVICES as string[]).find((x) => norm(x) === norm(p.service)) as SocialServiceType | undefined;
  const cibles = (['Internet', 'Collaborateurs'] as SocialTarget[]).filter((c) => listOf(p.cibles).some((x) => norm(x) === norm(c)));
  return {
    titre: String(p.titre || ''), date: isDay(p.date) ? p.date : '', texte: String(p.texte || ''),
    reseaux, reseauxP, marques: marquesDe(listOf(p.marques)).marques, ignorees: marquesDe(listOf(p.marques)).ignorees,
    concessions, concessionsP, service: service || 'Tous Services', cibles, points: listOf(p.points_a_verifier), uid,
  };
}

function initDraft(a: AssistantActionView, s = workspace.getState(), uid?: string): Draft {
  const p = a.payload || {};
  if (a.type === 'creer_projet') return initProjet(p, uid);
  if (a.type === 'creer_publication') return initPublication(p, digitalTags.get(), uid);
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
  if (a.type === 'creer_projet') {
    const p = d.prj;
    if (!canEditProjects(role)) return 'Ton rôle ne permet pas de créer un projet.';
    if (!p) return 'Chargement…';
    if (!p.name?.trim()) return 'Donne un nom au projet.';
    if (p.name.trim().length > 200) return 'Nom trop long (200 caractères max).';
    if (d.flou) return `« ${d.flou} » : choisis le périmètre.`;
    if (d.inconnus?.length) return `Concession inconnue : ${d.inconnus.join(', ')}. Retire-la ou choisis les sites.`;
    if (!sitesDuProjet(p).length && !groupeDuProjet(p)) return 'Choisis au moins un site.';
    if (!isDay(p.startDate) || !isDay(p.endDate)) return 'Choisis les dates.';
    if (p.endDate < p.startDate) return 'La fin précède le début.';
    if (!(p.budgetPlanned >= 0) || p.budgetPlanned > 10_000_000) return 'Budget prévu invalide.';
    return null;
  }
  if (a.type === 'creer_publication') {
    if (!canEditDigital(role) || gx()?.ctx?.readOnly) return 'Ton rôle ne permet pas d’écrire dans le Digital.';
    if (!d.titre?.trim()) return 'Donne un titre à la publication.';
    if (d.titre.trim().length > 200) return 'Titre trop long (200 caractères max).';
    if (!isDay(d.date)) return 'Choisis la date.';
    if (d.reseauxP?.length) return 'Précise les réseaux.';
    if (d.concessionsP?.length) return 'Précise les concessions.';
    if (!d.texte?.trim()) return 'Le texte est vide.';
    if (d.texte.length > 3000) return 'Texte trop long (3 000 caractères max).';
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
  if (a.type === 'creer_projet' && d.prj) {
    const p = projetFinal(d.prj), gm = groupeDuProjet(p);
    // « Tous Services » n'est pas dans l'énumération de l'outil : envoyé comme les 4 services (même effet au Budget).
    // Le projet écrit garde « Tous Services » : c'est le brouillon qui s'exécute, pas ce payload.
    const svc = (p.service || []).includes('Tous Services') ? ['VN', 'VO', 'APV', 'PR'] : p.service || [];
    return {
      nom: p.name, sites: gm ? [gm] : sitesDuProjet(p), marques: p.brands || [], ...(svc.length ? { services: svc } : {}),
      type: p.projectType, debut: p.startDate, fin: p.endDate,
      ...(p.budgetPlanned > 0 || a.payload?.budget !== undefined ? { budget: p.budgetPlanned || 0 } : {}),
      ...(p.description ? { description: p.description } : {}), statut: p.status === 'Draft' ? 'brouillon' : 'actif',
      ...(p.alpineShare != null ? { part_alpine: p.alpineShare } : {}), ...(p.nissanShare != null ? { part_nissan: p.nissanShare } : {}),
    };
  }
  if (a.type === 'creer_publication') {
    return {
      titre: d.titre!.trim(), date: d.date, reseaux: d.reseaux || [], texte: d.texte!.trim(), marques: d.marques || [],
      concessions: d.concessions || [], service: d.service || 'Tous Services', cibles: d.cibles || [],
      ...(d.points?.length ? { points_a_verifier: d.points } : {}),
    };
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

async function creerProjet(d: Draft): Promise<Outcome> {
  if (!canEditProjects(currentRole())) return { ok: false, error: 'Droits insuffisants pour créer un projet.' };
  // Même chemin que « Nouveau projet » de la rubrique : `createProject` (recalcul, écho, journal d'activité). Il rend
  // null en cas d'échec (message déjà affiché par la coque) : on le dit, on ne prétend rien.
  const p = projetFinal(d.prj!);
  const srv = await createProject(p);
  if (!srv) return { ok: false, error: 'Échec de la création du projet (serveur injoignable ?).' };
  return { ok: true, summary: `Projet « ${srv.name} » créé (${srv.status === 'Draft' ? 'brouillon' : 'actif'})`, ref: srv.id };
}

async function creerPublication(d: Draft): Promise<Outcome> {
  if (!canEditDigital(currentRole()) || gx()?.ctx?.readOnly) return { ok: false, error: 'Droits insuffisants pour écrire dans le Digital.' };
  const title = d.titre!.trim();
  try {
    // Valeurs par défaut d'une publication neuve de la rubrique Digital (DigitalApp.newPost), statut « Rédigé ».
    const c = await createSocialPost({
      title, status: 'Rédigé', date: d.date!, targets: d.cibles || [], brands: d.marques || [], service: d.service || 'Tous Services',
      networks: d.reseaux || [], concessions: d.concessions || [], mediaFiles: [], mediaNames: [], link: '', wording: d.texte!.trim(),
      lom: '', co2: '', co2s: [], proPlus: false, archived: false,
    } as any);
    if (!c?.id) return { ok: false, error: 'Échec de la création de la publication.' };
    // Journal d'activité, comme la rubrique (sans effet sur l'issue s'il se perd).
    const u: any = workspace.getState().users.find((x) => x.id === d.uid);
    if (u) Promise.resolve(db.logActivity({ id: `act-${Date.now()}`, userId: u.id, userName: u.name, userColor: u.avatarColor || '#f75632', action: 'a créé la publication', entity: 'post', entityName: title, entityId: c.id, timestamp: new Date().toISOString() } as any)).catch(() => { /* journal seulement */ });
    return { ok: true, summary: `Publication « ${title} » rédigée pour le ${frDay(d.date!)}`, ref: c.id };
  } catch (e) { return { ok: false, error: errMsg(e, 'Échec de la création de la publication.') }; }
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
  if (a.type === 'creer_projet') return creerProjet(dd);
  if (a.type === 'creer_publication') return creerPublication(dd);
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

// ---------------------------------------------------------------- champs des cartes « projet » et « publication »

/** Valeurs choisies (puces) + valeurs citées par le modèle à trancher + ajout depuis la liste. */
const Choix: React.FC<{ values: string[]; pending: PendingS[]; options: string[]; add: string; onChange: (values: string[], pending: PendingS[]) => void }> = ({ values, pending, options, add, onChange }) => (
  <div className="mia-act-ppl">
    {values.map((v) => <span key={v} className="mia-act-chip">{v}<button type="button" title="Retirer" onClick={() => onChange(values.filter((x) => x !== v), pending)}><Icon name="close" /></button></span>)}
    {pending.map((pd, i) => (
      <select key={`p${i}`} className="select need" value="" onChange={(e) => {
        const v = e.target.value, rest = pending.filter((_, j) => j !== i);
        onChange(v === '__drop' || values.includes(v) ? values : [...values, v], rest);
      }}>
        <option value="" disabled>{pd.hits.length ? `« ${pd.raw} » : lequel ?` : `« ${pd.raw} » introuvable`}</option>
        {(pd.hits.length ? pd.hits : options).map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="__drop">— Ignorer</option>
      </select>
    ))}
    <select className="select add" value="" onChange={(e) => e.target.value && onChange([...values, e.target.value], pending)}>
      <option value="" disabled>{add}</option>
      {options.filter((o) => !values.includes(o)).map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

type Upd = (f: (x: Draft) => Draft) => void;
const pctTxt = (f: number) => `${+(f * 100).toFixed(1)} %`.replace('.', ',');
const eur = (n: number) => (gx()?.fmt?.eur ? gx().fmt.eur(Math.round(n)) : `${Math.round(n)} €`);

/** Carte `creer_projet` : tout ce qui pèse sur les chiffres, modifiable, et la répartition par enveloppe. */
const ProjetFields: React.FC<{ d: Draft; upd: Upd }> = ({ d, upd }) => {
  const p = d.prj!;
  const setP = (f: (x: Project) => Project) => upd((x) => ({ ...x, prj: f(x.prj!) }));
  const gm = groupeDuProjet(p), sites = sitesDuProjet(p);
  const siteLbl = gm ? `${gm} · ${sites.length} sites` : sites.join(', ') || 'Choisir…';
  // Sites : `poserSites` (règle de la fiche), qui remet la répartition à parts égales et retire une marque sans site éligible.
  const poser = (choix: { groupe: GroupeProjet } | { sites: string[] }) => upd((x) => {
    const y = poserSites(x.prj!, choix);
    const out = (x.prj!.brands || []).filter((b) => !(y.brands || []).includes(b));
    if (out.length) hud('Marque retirée : aucun site éligible');
    return { ...x, prj: y, flou: '', inconnus: [], retirees: [...new Set([...(x.retirees || []), ...out])] };
  });
  // Même sélecteur que la fiche projet (variante `project` : plaques et périmètres groupés).
  const pickSites = (el: HTMLElement) => gx()?.ui?.sitePicker?.(el, gm ? [GROUP_LABEL[gm]] : sites, (values: string[]) => {
    const picked = values.map((v) => LABEL_GROUP[v]).find((g) => g && g !== gm);
    if (picked) { poser({ groupe: picked }); gx().ui.closePick(); return; }
    const next = values.filter((v) => !LABEL_GROUP[v]);
    if (!next.length) { hud('Un projet garde au moins un site'); return; }
    if (gm) gx().ui.closePick();
    poser({ sites: next });
  }, { variant: 'project', title: 'Site / Plaque' });

  const fin = projetFinal(p), rep = repartition(fin), total = fin.budgetPlanned || 0;
  const notes = [d.ignorees?.length ? `Marque inconnue ignorée : ${d.ignorees.join(', ')}` : '', d.retirees?.length ? `Retirée (aucun site éligible) : ${d.retirees.join(', ')}` : ''].filter(Boolean);
  return <>
    <label className="full"><span>Nom</span><input className="input" value={p.name} onChange={(e) => { const v = e.target.value; setP((x) => ({ ...x, name: v })); }} /></label>
    <div className="full"><span>Sites</span>
      {(d.flou || !!d.inconnus?.length) && <div className="mia-act-ppl">
        {d.flou && (
          <select className="select need" value="" onChange={(e) => { const v = e.target.value; if (LABEL_GROUP[v]) poser({ groupe: LABEL_GROUP[v] }); else upd((x) => ({ ...x, flou: '' })); }}>
            <option value="" disabled>« {d.flou} » : quel périmètre ?</option>
            {Object.keys(LABEL_GROUP).map((l) => <option key={l} value={l}>{l}</option>)}
            <option value="__sites">{sites.length ? 'Seulement les sites cités' : 'Je choisis les sites'}</option>
          </select>
        )}
        {(d.inconnus || []).map((raw) => <span key={raw} className="mia-act-chip bad">« {raw} » introuvable<button type="button" title="Retirer" onClick={() => upd((x) => ({ ...x, inconnus: (x.inconnus || []).filter((r) => r !== raw) }))}><Icon name="close" /></button></span>)}
      </div>}
      <PickerBtn icon={gm ? 'lock' : 'pin'} label={siteLbl} onClick={pickSites} />
    </div>
    <div className="full"><span>Marques</span>
      <div className="mia-act-tags">{BRANDS.filter((b) => marqueAutorisee(sites, b)).map((b) => (
        <button type="button" key={b} className={`mia-act-tog ${(p.brands || []).includes(b) ? 'on' : ''}`} style={{ '--c': brandHex(b) } as React.CSSProperties} onClick={() => setP((x) => basculerMarque(x, b))}>{b}</button>
      ))}</div>
    </div>
    {!!notes.length && <div className="full mia-act-note">{notes.join(' · ')}</div>}
    <div className="full"><span>Services</span>
      <div className="mia-act-tags">{SERVICES.map((s) => <button type="button" key={s} className={`mia-act-tog ${(p.service || []).includes(s) ? 'on' : ''}`} onClick={() => setP((x) => basculerService(x, s))}>{s}</button>)}</div>
    </div>
    <label><span>Type</span><select className="select" value={p.projectType} onChange={(e) => { const v = e.target.value as ProjectType; setP((x) => ({ ...x, projectType: v })); }}>{PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
    <label><span>Statut</span><select className="select" value={p.status} onChange={(e) => { const v = e.target.value as Project['status']; setP((x) => ({ ...x, status: v })); }}><option value="Active">Actif</option><option value="Draft">Brouillon</option></select></label>
    <label><span>Début</span><input type="date" className="input" value={p.startDate} onChange={(e) => { const v = e.target.value; setP((x) => (x.endDate && v > x.endDate ? { ...x, startDate: v, endDate: v } : { ...x, startDate: v })); }} /></label>
    <label><span>Fin</span><input type="date" className="input" min={p.startDate} value={p.endDate} onChange={(e) => { const v = e.target.value; setP((x) => ({ ...x, endDate: x.startDate && v < x.startDate ? x.startDate : v })); }} /></label>
    <label><span>Budget prévu (€)</span><input type="number" min={0} step={100} className="input" value={p.budgetPlanned || ''} placeholder="0" onChange={(e) => { const v = Math.max(0, +e.target.value || 0); setP((x) => ({ ...x, budgetPlanned: v })); }} /></label>
    <div />
    {curseurs(p).map((b) => {
      const k = b === 'Alpine' ? 'alpineShare' : 'nissanShare', v = p[k] ?? 100;   // curseur vide = 100 % sur la marque
      return (
        <div key={k} className="full mia-act-share"><span>Part {b} / RDM : {v} % · {100 - v} %</span>
          <input type="range" min={0} max={100} step={1} value={v} aria-label={`Part ${b} (%)`} onChange={(e) => { const n = Math.max(0, Math.min(100, +e.target.value || 0)); setP((x) => ({ ...x, [k]: n })); }} />
        </div>
      );
    })}
    <label className="full"><span>Description</span><textarea className="textarea" rows={2} value={p.description} onChange={(e) => { const v = e.target.value; setP((x) => ({ ...x, description: v })); }} /></label>
    <div className="full mia-act-rep"><span>Répartition du budget prévu</span>
      {rep.hors ? <div className="mia-act-note">Holding : suivi, mais imputé à <b>aucun</b> budget (hors budget).</div>
        : !rep.lignes.length ? <div className="mia-act-note">Aucun site : rien à répartir.</div>
          : <ul>{rep.lignes.map(([env, f]) => <li key={env}><span className="n">{env}</span><small className="num">{pctTxt(f)}</small><b className="num">{eur(total * f)}</b></li>)}</ul>}
      {p.status === 'Draft' && <div className="mia-act-note">Brouillon : compté dans aucun budget ni tableau de bord tant qu’il n’est pas actif.</div>}
      {!rep.hors && sansServiceBudget(p) && <div className="mia-act-note">Aucun service VN, VO, PR ou APV : le Budget n’imputera rien.</div>}
      {!rep.hors && !!rep.lignes.length && <div className="mia-act-note">Le Budget impute ensuite le réel (coûts des tâches) selon cette répartition.</div>}
    </div>
  </>;
};

/** Carte `creer_publication` : wording rédigé par mIAouss, statut « Rédigé » fixe. */
const PublicationFields: React.FC<{ d: Draft; upd: Upd; tags: DigitalTags | null | undefined }> = ({ d, upd, tags }) => {
  const set = (p: Partial<Draft>) => upd((x) => ({ ...x, ...p }));
  const nets = [...(tags?.networks || []), ...(d.reseaux || []).filter((x) => !(tags?.networks || []).includes(x))];
  const n = (d.texte || '').length;
  return <>
    <label className="full"><span>Titre</span><input className="input" value={d.titre} onChange={(e) => set({ titre: e.target.value })} /></label>
    <label><span>Date</span><input type="date" className="input" value={d.date} onChange={(e) => set({ date: e.target.value })} /></label>
    <label><span>Service</span><select className="select" value={d.service || 'Tous Services'} onChange={(e) => set({ service: e.target.value as SocialServiceType })}>{SOCIAL_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
    <div className="full"><span>Réseaux</span><Choix values={d.reseaux || []} pending={d.reseauxP || []} options={nets} add="+ Réseau" onChange={(v, pd) => set({ reseaux: v, reseauxP: pd })} /></div>
    <label className="full"><span>Texte · <b className={`num ${n > 3000 ? 'mia-act-over' : ''}`}>{n}</b> / 3 000</span><textarea className="textarea" rows={7} value={d.texte} onChange={(e) => set({ texte: e.target.value })} /></label>
    <div className="full"><span>Marques</span>
      <div className="mia-act-tags">{BRANDS.map((b) => (
        <button type="button" key={b} className={`mia-act-tog ${(d.marques || []).includes(b) ? 'on' : ''}`} style={{ '--c': brandHex(b) } as React.CSSProperties}
          onClick={() => upd((x) => ({ ...x, marques: basculerMarque({ brands: x.marques || [] } as Project, b).brands }))}>{libelleMarqueDigital(b)}</button>
      ))}</div>
    </div>
    {!!d.ignorees?.length && <div className="full mia-act-note">Marque inconnue ignorée : {d.ignorees.join(', ')}</div>}
    <div className="full"><span>Concessions</span><Choix values={d.concessions || []} pending={d.concessionsP || []} options={DIGITAL_CONCESSIONS} add="+ Site" onChange={(v, pd) => set({ concessions: v, concessionsP: pd })} /></div>
    <div><span>Cibles</span>
      <div className="mia-act-ppl">{(['Internet', 'Collaborateurs'] as SocialTarget[]).map((c) => (
        <label key={c} className="mia-act-check"><input type="checkbox" checked={(d.cibles || []).includes(c)} onChange={(e) => { const on = e.target.checked; upd((x) => ({ ...x, cibles: on ? [...(x.cibles || []).filter((y) => y !== c), c] : (x.cibles || []).filter((y) => y !== c) })); }} /><span>{c}</span></label>
      ))}</div>
    </div>
    <div><span>Statut</span><div className="mia-act-what">Rédigé</div></div>
    {!!d.points?.length && <div className="full mia-act-todo"><span>Points à vérifier</span><ul>{d.points.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
  </>;
};

// ---------------------------------------------------------------- la carte
const ICON: Record<string, string> = { ouvrir: 'arrowr', creer_tache: 'todo', modifier_tache: 'edit', creer_postit: 'pin', creer_projet: 'projects', creer_publication: 'digital' };
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
  // Tags Digital : chargés pour la seule carte « publication » (les réseaux se choisissent parmi les existants).
  const pub = a.type === 'creer_publication';
  const tags = digitalTags.useWhen(pub && live);
  // Brouillon posé une fois les données chargées (sinon « Marie » ne trouverait personne) ; ensuite, il est à la personne.
  useEffect(() => {
    if (live && !d && ready && users.length && (!pub || tags !== undefined)) setD(initDraft(a, workspace.getState(), uid));
  }, [live, d, ready, users.length, tags === undefined]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<Draft>) => setD((x) => ({ ...(x || {}), ...p }));
  const upd: Upd = (f) => setD((x) => (x ? f(x) : x));
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
    <div className={`mia-act-f ${a.type === 'creer_projet' || pub ? 'long' : ''}`}>
      {a.type === 'creer_projet' && d.prj && <ProjetFields d={d} upd={upd} />}
      {pub && <PublicationFields d={d} upd={upd} tags={tags} />}
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
