import { useEffect } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { BudgetLine, FixedExpense, SocialPost, SocialComment, DigitalTags, Campaign, Equipment, EquipmentBooking, CongeJour, CongeDroit, CongeType, CongeDemi } from '../../types';
import { db, ApiError } from '../../services/dataService';
import { fileSauvegardePublication } from '../../services/fileSauvegardePublication';
import { getSocket, connectSocket } from '../../services/socket';
import { RT_EVENTS } from '../../services/realtime';
import { echo, isEchoing, notify } from './workspace';

// =====================================================================
// Données PARTAGÉES de l'interface v2, hors projets / tâches / utilisateurs (ceux-là :
// ./workspace.ts). Une ressource = un domaine (budgets, dépenses fixes, publications…).
//  - chargée À LA DEMANDE (première rubrique ou premier widget qui la lit), puis PARTAGÉE :
//    un seul appel réseau quel que soit le nombre de fenêtres qui l'affichent ;
//  - rechargée sur SES événements temps réel (délai groupé de 300 ms) et à la reconnexion.
//    Contrairement aux projets, on ne rapièce pas l'entrée reçue : `dataService` normalise et
//    migre à la lecture (dates, anciens formats) — recopier cette logique ici la dupliquerait ;
//  - écritures : optimistes quand c'est sûr (modifier, supprimer), puis appel de `dataService`
//    (mêmes routes, mêmes listes blanches serveur), écho local pour les pages actuelles ouvertes
//    (le serveur n'envoie rien à l'onglet émetteur), relecture pour revenir à l'état serveur.
//  - le CLOISONNEMENT reste côté serveur : un rôle refusé reçoit une liste vide, jamais la
//    donnée d'un autre périmètre.
// Utilisation dans une rubrique : `const lines = useBudgets();` (undefined tant que non chargé).
// =====================================================================

type Status = 'idle' | 'loading' | 'ready' | 'error';
interface Slot { status: Status; value: unknown }
const data = createStore<Record<string, Slot>>(() => ({}));

interface Resource<T, A extends unknown[]> {
  /** Lecture React : déclenche le chargement au premier appel ; `undefined` tant que non chargé. */
  use: (...args: A) => T | undefined;
  /** Comme `use`, mais ne charge que si `enabled` (rubrique non autorisée : aucun appel réseau). */
  useWhen: (enabled: boolean, ...args: A) => T | undefined;
  /** Lecture hors React (valeur courante, ou undefined). */
  get: (...args: A) => T | undefined;
  ensure: (...args: A) => Promise<void>;
  /** Recharge toutes les variantes chargées (ex. toutes les fenêtres de dates des congés). */
  reloadAll: () => void;
  set: (args: A, change: (v: T) => T) => void;
}

function defineResource<T, A extends unknown[] = []>(name: string, load: (...a: A) => Promise<T>, events: readonly string[], empty: T): Resource<T, A> {
  const keyOf = (a: A) => (a.length ? `${name}|${a.join('|')}` : name);
  const argsOf = new Map<string, A>();
  let bound = false, timer: ReturnType<typeof setTimeout> | undefined;
  const fetchKey = async (k: string) => {
    const a = argsOf.get(k)!;
    data.setState((s) => ({ [k]: { status: s[k]?.status === 'ready' ? 'ready' : 'loading', value: s[k]?.value } }));
    try { const v = await load(...a); data.setState({ [k]: { status: 'ready', value: v } }); }
    catch { data.setState((s) => ({ [k]: { status: 'error', value: s[k]?.value ?? empty } })); }   // rôle refusé, réseau : liste vide
  };
  const reloadAll = () => { clearTimeout(timer); timer = setTimeout(() => { for (const k of argsOf.keys()) void fetchKey(k); }, 300); };
  const bind = () => {
    if (bound) return; const s = getSocket() ?? connectSocket(); if (!s) return; bound = true;
    for (const ev of [...events, 'connect']) s.on(ev, () => { if (!isEchoing()) reloadAll(); });
  };
  const ensure = async (...a: A) => {
    const k = keyOf(a); bind();
    if (argsOf.has(k)) return; argsOf.set(k, a); await fetchKey(k);
  };
  const get = (...a: A) => data.getState()[keyOf(a)]?.value as T | undefined;
  return {
    get, ensure, reloadAll,
    set: (a, change) => { const k = keyOf(a), cur = data.getState()[k]; if (cur) data.setState({ [k]: { ...cur, value: change(cur.value as T) } }); },
    use: (...a: A) => {
      const k = keyOf(a);
      useEffect(() => { void ensure(...a); }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
      return useStore(data, (s) => s[k]?.value as T | undefined);
    },
    useWhen: (enabled: boolean, ...a: A) => {
      const k = keyOf(a);
      useEffect(() => { if (enabled) void ensure(...a); }, [k, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
      return useStore(data, (s) => (enabled ? s[k]?.value as T | undefined : undefined));
    },
  };
}

/** Écriture : optimiste (facultatif) → appel → écho local → relecture. Échec : message + relecture. */
async function write<R>(opts: { res: Resource<any, any>; optimistic?: () => void; call: () => Promise<R>; echo?: (r: R) => [string, unknown]; fail: string }): Promise<R> {
  opts.optimistic?.();
  try {
    const r = await opts.call();
    if (opts.echo) { const [ev, payload] = opts.echo(r); echo(ev, payload); }
    opts.res.reloadAll();
    return r;
  } catch (e: any) {
    notify(e?.message && !/^Erreur \d+$/.test(e.message) && e.message !== 'Serveur injoignable' ? e.message : opts.fail);
    opts.res.reloadAll();
    throw e;
  }
}
const byId = <T extends { id: string }>(list: T[] | undefined, id: string, change: (x: T) => T | null) =>
  (list || []).flatMap((x) => (x.id === id ? (change(x) ? [change(x)!] : []) : [x]));

// ---------------------------------------------------------------- budgets (prévisionnel, une ligne par site)
export const budgets = defineResource<BudgetLine[]>('budgets', () => db.getBudgets(), RT_EVENTS.budget, []);
export const useBudgets = () => budgets.use();
export const upsertBudget = (line: BudgetLine) => write({ res: budgets, optimistic: () => budgets.set([], (L) => (L.some((x) => x.site === line.site) ? L.map((x) => (x.site === line.site ? line : x)) : [...L, line])), call: () => db.upsertBudget(line), echo: (r) => ['budget:updated', r], fail: 'Échec de l’enregistrement du budget.' });
export const deleteBudget = (id: string) => write({ res: budgets, optimistic: () => budgets.set([], (L) => L.filter((x: any) => x.id !== id)), call: () => db.deleteBudget(id), echo: () => ['budget:deleted', id], fail: 'Échec de la suppression.' });

// ---------------------------------------------------------------- dépenses fixes
export const fixedExpenses = defineResource<FixedExpense[]>('fixedExpenses', () => db.getFixedExpenses(), RT_EVENTS.fixedExpenses, []);
export const useFixedExpenses = () => fixedExpenses.use();
export const createFixedExpense = (e: FixedExpense) => write({ res: fixedExpenses, call: () => db.createFixedExpense(e), echo: (r) => ['fixed-expense:created', r], fail: 'Échec de la création de la dépense.' });
export const updateFixedExpense = (e: FixedExpense) => write({ res: fixedExpenses, optimistic: () => fixedExpenses.set([], (L) => byId(L, e.id, () => e)), call: () => db.updateFixedExpense(e), echo: (r) => ['fixed-expense:updated', r], fail: 'Échec de l’enregistrement de la dépense.' });
export const deleteFixedExpense = (id: string) => write({ res: fixedExpenses, optimistic: () => fixedExpenses.set([], (L) => byId(L, id, () => null)), call: () => db.deleteFixedExpense(id), echo: () => ['fixed-expense:deleted', id], fail: 'Échec de la suppression.' });

// ---------------------------------------------------------------- Digital : publications, commentaires, tags
export const socialPosts = defineResource<SocialPost[]>('socialPosts', () => db.getSocialPosts(), [...RT_EVENTS.social, ...RT_EVENTS.socialComments], []);   // commentCount suit les commentaires
export const useSocialPosts = () => socialPosts.use();
export const createSocialPost = (p: Omit<SocialPost, 'id'>) => write({ res: socialPosts, call: () => db.createSocialPost(p), echo: (r) => ['social:updated', r], fail: 'Échec de la création de la publication.' });
/**
 * Modifier une publication : par la FILE `fileSauvegardePublication` (comme pages/Digital.tsx depuis le
 * correctif 49) — UN SEUL PUT en vol par publication, instantanés COMPLETS, ordre garanti. Deux champs
 * modifiés coup sur coup ne peuvent plus s'écraser. L'instantané part de l'état PARTAGÉ (dernier connu),
 * pas d'une copie du composant ; une publication disparue n'est jamais ressuscitée.
 * Se résout au succès (ou au repos de la file, si l'instantané a été remplacé par un plus récent).
 */
export const updateSocialPost = (p: SocialPost) => patchSocialPost(p.id, p);
export function patchSocialPost(id: string, patch: Partial<SocialPost>): Promise<SocialPost> {
  const cur = (socialPosts.get() || []).find((x) => x.id === id);
  if (!cur) return Promise.reject(new Error("Cette publication n'existe plus (supprimée depuis un autre poste ?)."));
  const next = { ...cur, ...patch } as SocialPost;
  socialPosts.set([], (L) => byId(L, id, () => next));
  return new Promise((resolve, reject) => {
    let done = false;
    fileSauvegardePublication.pousser(next, {
      onSucces: (srv) => { if (!done) { done = true; resolve(srv); } },
      onEchec: (e) => { publicationError(e); socialPosts.reloadAll(); if (!done) { done = true; reject(e); } },
      onRepos: () => { if (fileSauvegardePublication.aDesEcrituresEnCours(id)) return; echo('social:updated', next); socialPosts.reloadAll(); if (!done) { done = true; resolve(next); } },
    });
  });
}
/** Messages repris de `onEchecSauvegarde` (pages/Digital.tsx). */
function publicationError(e: unknown) {
  if (!(e instanceof ApiError)) return notify("Échec inattendu de l'enregistrement.");
  switch (e.status) {
    case 0: return notify('Serveur injoignable. Vos modifications ne sont PAS perdues — ne fermez pas cet onglet.');
    case 503: return notify('La base est momentanément saturée. Réessayez dans une minute.');
    case 401: return;
    case 403: return notify('Droits insuffisants pour modifier cette publication.');
    case 404: return notify("Cette publication n'existe plus (supprimée depuis un autre poste ?).");
    default: return notify(e.message && !/^Erreur \d+$/.test(e.message) ? e.message : "Échec de l'enregistrement.");
  }
}
export const deleteSocialPost = (id: string) => write({ res: socialPosts, optimistic: () => socialPosts.set([], (L) => byId(L, id, () => null)), call: () => db.deleteSocialPost(id), echo: () => ['social:deleted', id], fail: 'Échec de la suppression.' });

/** Fil de commentaires d'UNE publication (lu à l'ouverture du panneau, comme Digital.tsx). */
export const socialComments = defineResource<SocialComment[], [string]>('socialComments', (postId) => db.getSocialComments(postId), RT_EVENTS.socialComments, []);
export const useSocialComments = (postId: string) => socialComments.use(postId);
export const addSocialComment = (postId: string, content: string) => write({ res: socialComments, call: () => db.addSocialComment(postId, content), echo: () => ['social-comment:updated', { postId }], fail: 'Échec de l’envoi du commentaire.' });
export const deleteSocialComment = (postId: string, id: string) => write({ res: socialComments, optimistic: () => socialComments.set([postId], (L) => byId(L, id, () => null)), call: () => db.deleteSocialComment(id), echo: () => ['social-comment:deleted', { postId }], fail: 'Échec de la suppression du commentaire.' });

export const digitalTags = defineResource<DigitalTags | null>('digitalTags', () => db.getDigitalTags(), RT_EVENTS.tags, null);
export const useDigitalTags = () => digitalTags.use();
/** ⚠️ Charge PARTIELLE (seules les catégories modifiées) : voir `saveDigitalTags` dans dataService. */
export const saveDigitalTags = (t: Partial<DigitalTags>) => write({ res: digitalTags, call: () => db.saveDigitalTags(t), echo: (r) => ['tags:updated', r], fail: 'Échec de l’enregistrement des tags.' });

// ---------------------------------------------------------------- campagnes (liste lue par le Dashboard)
export const campaigns = defineResource<Campaign[]>('campaigns', () => db.getCampaigns(), RT_EVENTS.campaigns, []);
export const useCampaigns = () => campaigns.use();
export const createCampaign = (c: Campaign) => write({ res: campaigns, call: () => db.createCampaign(c), echo: (r) => ['campaigns:updated', r], fail: 'Échec de la création de la campagne.' });
export const updateCampaign = (c: Campaign) => write({ res: campaigns, optimistic: () => campaigns.set([], (L) => byId(L, c.id, () => c)), call: () => db.updateCampaign(c), echo: (r) => ['campaigns:updated', r], fail: 'Échec de l’enregistrement de la campagne.' });
export const deleteCampaign = (id: string) => write({ res: campaigns, optimistic: () => campaigns.set([], (L) => byId(L, id, () => null)), call: () => db.deleteCampaign(id), echo: () => ['campaigns:deleted', id], fail: 'Échec de la suppression.' });

// ---------------------------------------------------------------- matériel et réservations
export const equipment = defineResource<Equipment[]>('equipment', () => db.getEquipment(), RT_EVENTS.equipment, []);
export const useEquipment = () => equipment.use();
export const createEquipment = (e: Omit<Equipment, 'id'>) => write({ res: equipment, call: () => db.createEquipment(e), echo: (r) => ['equipment:created', r], fail: 'Échec de la création du matériel.' });
export const updateEquipment = (e: Equipment) => write({ res: equipment, optimistic: () => equipment.set([], (L) => byId(L, e.id, () => e)), call: () => db.updateEquipment(e), echo: (r) => ['equipment:updated', r], fail: 'Échec de l’enregistrement du matériel.' });
export const deleteEquipment = (id: string) => write({ res: equipment, optimistic: () => equipment.set([], (L) => byId(L, id, () => null)), call: () => db.deleteEquipment(id), echo: () => ['equipment:deleted', id], fail: 'Échec de la suppression.' });

export const bookings = defineResource<EquipmentBooking[]>('bookings', () => db.getEquipmentBookings(), RT_EVENTS.equipmentBookings, []);
export const useBookings = () => bookings.use();
export const createBooking = (b: Omit<EquipmentBooking, 'id'>) => write({ res: bookings, call: () => db.createEquipmentBooking(b), echo: (r) => ['equipment-booking:created', r], fail: 'Échec de la réservation.' });
export const updateBooking = (b: EquipmentBooking) => write({ res: bookings, optimistic: () => bookings.set([], (L) => byId(L, b.id, () => b)), call: () => db.updateEquipmentBooking(b), echo: (r) => ['equipment-booking:updated', r], fail: 'Échec de l’enregistrement de la réservation.' });
export const deleteBooking = (id: string) => write({ res: bookings, optimistic: () => bookings.set([], (L) => byId(L, id, () => null)), call: () => db.deleteEquipmentBooking(id), echo: () => ['equipment-booking:deleted', id], fail: 'Échec de la suppression.' });

// ---------------------------------------------------------------- congés (fenêtre de dates)
export type CongesData = { jours: CongeJour[]; membres: string[]; droits: CongeDroit[] };
/** Une variante par fenêtre `debut → fin` ('yyyy-MM-dd') ; toutes rechargées sur `conges:updated`. */
export const conges = defineResource<CongesData | null, [string, string]>('conges', (debut, fin) => db.getConges(debut, fin), [...RT_EVENTS.conges, ...RT_EVENTS.users], null);
export const useConges = (debut: string, fin: string) => conges.use(debut, fin);
const congeWrite = <R,>(userId: string, call: () => Promise<R>, fail: string) => write({ res: conges, call, echo: () => ['conges:updated', { userId }], fail });
export const setCongeJour = (userId: string, date: string, type: CongeType | null, demi: CongeDemi = null) => congeWrite(userId, () => db.setCongeJour(userId, date, type, demi), 'Échec de l’enregistrement du congé.');
export const setCongePeriode = (userId: string, jours: string[], type: CongeType | null, demi: CongeDemi = null) => congeWrite(userId, () => db.setCongePeriode(userId, jours, type, demi), 'Échec de l’enregistrement de la période.');
export const setCongeDroit = (userId: string, periode: number, jours: number) => congeWrite(userId, () => db.setCongeDroit(userId, periode, jours), 'Échec de l’enregistrement du droit.');
export const setCongeValidation = (userId: string, date: string, validated: boolean) => congeWrite(userId, () => db.setCongeValidation(userId, date, validated), 'Échec de la validation.');
export const ajouterMembreConges = (userId: string) => congeWrite(userId, () => db.ajouterMembreConges(userId), 'Échec de l’ajout au planning.');
export const retirerMembreConges = (userId: string) => congeWrite(userId, () => db.retirerMembreConges(userId), 'Échec du retrait du planning.');
