// =====================================================================
// OUTILS DE LECTURE de mIAouss (08/10/2026) — exécutés DANS LE NAVIGATEUR.
//
// Règle validée par Théo : GEARBOX CALCULE, L'IA RÉDIGE. Le modèle demande un outil, ce fichier
// calcule avec les MÊMES portes que les écrans, et renvoie un résultat déjà exact que le modèle
// se contente de reformuler :
//   - projets  → workspace (données déjà cloisonnées par le serveur), recalculerProjet, sitesDuProjet ;
//   - budget   → prepareBudgetLines + computeBudgetStats (mêmes chiffres que l'écran Budget) ;
//   - absences → ressource `conges` (mêmes droits que la rubrique Congés).
// ⚠️ Ne JAMAIS recopier ici une règle de calcul : si un chiffre diffère de l'écran, c'est l'appel
// qui est faux, pas la règle (même doctrine que constants.ts).
//
// Les résultats vont au modèle : ils ne portent que les champs utiles (chaque jeton est pris sur
// un quota gratuit) et aucun identifiant technique.
// =====================================================================

import type { BrandType, Project } from '../../../types';
import { SITES, PLAQUES_STRUCTURE, ALPINE_SITES, NISSAN_SITES, resolveSiteAlias, allowedSitesFor, peutLireConges, CONGES_TYPES } from '../../../constants';
import { prepareBudgetLines, computeBudgetStats } from '../../../services/budgetStats';
import { computeDashboardStats } from '../../../services/dashboardStats';
import { recalculerProjet, sitesDuProjet, groupeDuProjet, GROUPES_PROJET } from '../../../utils/projet';
import { workspace } from '../../store/workspace';
import { budgets, fixedExpenses, conges } from '../../store/collections';

type Me = { id: string; role: string; sites?: string[] } | null | undefined;
type Args = Record<string, any>;

const MAX_PROJETS = 25;
const STATUT: Record<string, Project['status']> = { actif: 'Active', 'terminé': 'Done', 'archivé': 'Archived', brouillon: 'Draft' };
const STATUT_FR: Record<string, string> = { Active: 'actif', Done: 'terminé', Archived: 'archivé', Draft: 'brouillon' };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** Les dates des projets arrivent en ISO complet (« 2026-09-18T00:00:00.000Z ») : on compare le JOUR. */
const day = (s?: string | null) => (s ? s.slice(0, 10) : '');
const round = (n: number) => Math.round(n);

/** Plaques de Gearbox (PLAQUES_STRUCTURE), de la plus précise à la moins précise (« sud ouest » avant « sud »). */
const PLAQUES = Object.entries(PLAQUES_STRUCTURE).map(([p, s]) => ({ key: norm(p.replace(/^PLAQUE\s+/i, '')), sites: s as string[] })).sort((a, b) => b.key.length - a.key.length);

/**
 * « Clermont », « clermont-ferrand », « Le Puy », « Thiers », « plaque Centre », « Sud-Ouest » → sites de Gearbox.
 * Mesuré le 08/10 : « la plaque centre » ressortait en concession inconnue et le modèle listait TOUT le réseau.
 * « tout le réseau », « groupe » → aucun filtre (tout le périmètre de l'utilisateur).
 */
export function resolveSites(input: unknown): { sites: string[]; inconnus: string[] } {
  const list = (Array.isArray(input) ? input : input ? String(input).split(/[,;]| et /) : []).map((x) => String(x).trim()).filter(Boolean);
  const sites: string[] = [], inconnus: string[] = [];
  for (const raw of list) {
    const n = norm(raw).replace(/^(la |le |les |l )/, '');
    if (/^(tout|toutes|tous|reseau|groupe|groupe bony|tout le reseau|tout le groupe)( .*)?$/.test(n)) continue;
    const pl = PLAQUES.find((p) => n === p.key || n === `plaque ${p.key}` || n.endsWith(`plaque ${p.key}`));
    if (pl) { pl.sites.forEach((s) => { if (!sites.includes(s)) sites.push(s); }); continue; }
    const hit = (SITES as string[]).find((s) => norm(s) === n)
      || (SITES as string[]).find((s) => n.startsWith(norm(s)) || norm(s).startsWith(n))
      || (['Thiers', 'Ambert', 'Riom'].find((a) => norm(a) === n) ? resolveSiteAlias(['Thiers', 'Ambert', 'Riom'].find((a) => norm(a) === n)!) : undefined);
    if (hit) { if (!sites.includes(hit)) sites.push(hit); } else inconnus.push(raw);
  }
  return { sites, inconnus };
}

const userName = (id: string) => workspace.getState().users.find((u) => u.id === id)?.name || '';

// ---------------------------------------------------------------- projets
function projets(a: Args) {
  const { sites, inconnus } = resolveSites(a.site);
  if (inconnus.length) return { erreur: `Concession inconnue : ${inconnus.join(', ')}.`, concessions: SITES };
  const statut = a.statut ? STATUT[a.statut] : undefined;
  const brouillons = !!a.inclureBrouillons || statut === 'Draft';
  const archives = !!a.inclureArchives || statut === 'Archived';
  const resp = a.responsable ? norm(String(a.responsable)) : '';
  const mot = a.recherche ? norm(String(a.recherche)) : '';
  // « En retard » = la règle du Dashboard, appliquée PAR le Dashboard (même périmètre, même marque) :
  // jamais une copie de la règle ici, sinon les deux chiffres finiraient par diverger.
  const retard = a.enRetard ? new Set(computeDashboardStats({
    projects: workspace.getState().projects, budgets: [], socialPosts: [], fixedExpenses: [],
    dateStart: '2000-01-01', dateEnd: '2100-12-31', filterContexts: sites,
    filterBrands: a.marque ? [a.marque as BrandType] : [], filterServices: [], filterProPlus: 'all',
  }).projetsEnRetard.map((x) => x.id)) : null;

  const rows = workspace.getState().projects.map(recalculerProjet).filter((p) => {
    // Brouillon : ne remonte nulle part, sauf demande explicite (règle de Gearbox, décision de Théo).
    if (p.status === 'Draft' && !brouillons) return false;
    if (p.status === 'Archived' && !archives) return false;
    if (statut && p.status !== statut) return false;
    if (sites.length) {
      const g = groupeDuProjet(p);
      const ps = g ? Object.keys(GROUPES_PROJET[g]) : sitesDuProjet(p);
      if (!sites.some((s) => ps.includes(s))) return false;
    }
    if (a.marque && !(p.brands || []).includes(a.marque as BrandType)) return false;
    if (resp && !(p.assignedUsers || []).some((id) => norm(userName(id)).includes(resp))) return false;
    if (mot && !norm(p.name).includes(mot)) return false;
    if (retard && !retard.has(p.id)) return false;
    if (isDate(a.echeanceDu) && !(p.endDate && day(p.endDate) >= a.echeanceDu)) return false;
    if (isDate(a.echeanceAu) && !(p.endDate && day(p.endDate) <= a.echeanceAu)) return false;
    return true;
  }).sort((x, y) => (x.endDate || '').localeCompare(y.endDate || ''));

  // Sous-totaux PRÊTS À LIRE : mesuré le 08/10, le modèle recompte mal une liste (« les 4 actifs » suivis de 5)
  // et fait ses propres soustractions. Tout chiffre qu'il pourrait vouloir dire est calculé ici.
  const prevu = round(rows.reduce((s, p) => s + (p.budgetPlanned || 0), 0));
  const reel = round(rows.reduce((s, p) => s + (p.budgetActual || 0), 0));
  const parStatut: Record<string, number> = {};
  for (const p of rows) { const k = STATUT_FR[p.status] || p.status; parStatut[k] = (parStatut[k] || 0) + 1; }
  return {
    nombre: rows.length,
    parStatut,
    budgetPrevuTotal: prevu,
    budgetReelTotal: reel,
    ecartReelMoinsPrevu: reel - prevu,
    ...(rows.length > MAX_PROJETS ? { note: `Seuls les ${MAX_PROJETS} premiers (par échéance) sont détaillés.` } : {}),
    projets: rows.slice(0, MAX_PROJETS).map((p) => ({
      nom: p.name,
      statut: STATUT_FR[p.status] || p.status,
      // Libellé explicite : « GROUPE BONY (R/N) » seul a été reformulé en « Clermont, R/D » par le modèle (08/10).
      concessions: groupeDuProjet(p) ? `tout le groupe Bony (${groupeDuProjet(p)}, ${Object.keys(GROUPES_PROJET[groupeDuProjet(p)!]).length} concessions)` : sitesDuProjet(p).join(', ') || p.site,
      marques: (p.brands || []).join(', '),
      debut: day(p.startDate) || null,
      echeance: day(p.endDate) || null,
      budgetPrevu: round(p.budgetPlanned || 0),
      budgetReel: round(p.budgetActual || 0),
      ...((p.budgetActual || 0) > (p.budgetPlanned || 0) && p.budgetPlanned ? { depassement: round(p.budgetActual - p.budgetPlanned) } : {}),
      avancement: `${p.progress} %`,
      resteAFaire: `${100 - (p.progress || 0)} %`,
      responsables: (p.assignedUsers || []).map(userName).filter(Boolean).join(', '),
    })),
  };
}

// ---------------------------------------------------------------- budget
async function budget(a: Args, me: Me) {
  await Promise.all([budgets.ensure(), fixedExpenses.ensure()]);
  const scoped = allowedSitesFor(me as any);
  const { sites, inconnus } = resolveSites(a.sites);
  if (inconnus.length) return { erreur: `Concession inconnue : ${inconnus.join(', ')}.`, concessions: SITES };
  // Même bornage que l'écran Budget : un rôle cloisonné ne sort jamais de son périmètre.
  const scope = scoped ? (sites.length ? sites.filter((s) => scoped.includes(s)) : []) : sites;
  const year = Number.isInteger(a.annee) ? a.annee : Number(today().slice(0, 4));
  const m0 = Number.isInteger(a.moisDebut) ? Math.min(12, Math.max(1, a.moisDebut)) - 1 : 0;
  const m1 = Number.isInteger(a.moisFin) ? Math.min(12, Math.max(1, a.moisFin)) - 1 : 11;
  const stats = computeBudgetStats({
    budgets: prepareBudgetLines(budgets.get() || [], scoped).lines,
    projects: workspace.getState().projects,
    fixedExpenses: fixedExpenses.get() || [],
    filterSites: scope,
    filterBrands: a.marque ? [a.marque as BrandType] : [],
    filterServices: [],
    filterYear: year,
    filterMonthStart: m0,
    filterMonthEnd: Math.max(m0, m1),
    filterProPlus: 'all',
  });
  // Une décimale, comme l'écran Budget (« 94,7 % »).
  const pct = (x: number, y: number) => (y > 0 ? `${(Math.round((x / y) * 1000) / 10).toLocaleString('fr-FR')} %` : '—');
  return {
    perimetre: scope.length ? scope.join(', ') : 'tout le périmètre visible',
    marque: a.marque || 'toutes',
    periode: `${String(m0 + 1).padStart(2, '0')}/${year} à ${String(Math.max(m0, m1) + 1).padStart(2, '0')}/${year}`,
    enveloppePrevue: round(stats.totalForecast),
    consomme: round(stats.totalActual),
    reste: round(stats.totalForecast - stats.totalActual),
    tauxConsommation: pct(stats.totalActual, stats.totalForecast),
    parConcession: stats.matrix
      .filter((r) => r.totalForecast || r.totalActual)
      .sort((x, y) => y.totalActual - x.totalActual)
      .slice(0, 20)
      .map((r) => ({ concession: r.site, prevu: round(r.totalForecast), consomme: round(r.totalActual), taux: pct(r.totalActual, r.totalForecast), ...(r.totalActual > r.totalForecast ? { depassement: round(r.totalActual - r.totalForecast) } : { reste: round(r.totalForecast - r.totalActual) }) })),
  };
}

// ---------------------------------------------------------------- absences
async function absences(a: Args, me: Me) {
  if (!peutLireConges(me?.role)) return { erreur: "Tu n'as pas accès aux congés." };
  if (!isDate(a.du) || !isDate(a.au) || a.au < a.du) return { erreur: 'Période invalide (du et au au format AAAA-MM-JJ).' };
  await conges.ensure(a.du, a.au);
  const d = conges.get(a.du, a.au);
  if (!d) return { erreur: 'Congés indisponibles pour le moment.' };
  const who = a.personne ? norm(String(a.personne)) : '';
  const byUser = new Map<string, { date: string; type: string; demi: string | null }[]>();
  for (const j of d.jours) {
    if (j.date < a.du || j.date > a.au) continue;
    if (who && !norm(userName(j.userId)).includes(who)) continue;
    const l = byUser.get(j.userId) || [];
    l.push({ date: j.date, type: CONGES_TYPES[j.type]?.label || j.type, demi: j.demi === 'AM' ? 'matin' : j.demi === 'PM' ? 'après-midi' : null });
    byUser.set(j.userId, l);
  }
  const personnes = [...byUser.entries()].map(([id, jours]) => {
    jours.sort((x, y) => x.date.localeCompare(y.date));
    return {
      nom: userName(id) || 'Collègue',
      jours: jours.reduce((s, j) => s + (j.demi ? 0.5 : 1), 0),
      detail: jours.map((j) => `${j.date} ${j.type}${j.demi ? ` (${j.demi})` : ''}`),
    };
  }).sort((x, y) => x.nom.localeCompare(y.nom));
  return { periode: `${a.du} au ${a.au}`, nombreDePersonnes: personnes.length, personnes };
}

/** Les schémas sont tolérants (voir backend/src/assistant/prompt.ts) : « true », « 2026 », « renault »… */
const MARQUES: BrandType[] = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize', 'Holding'];
function normalize(raw: Args): Args {
  const a: Args = { ...(raw || {}) };
  for (const k of ['enRetard', 'inclureBrouillons', 'inclureArchives']) if (typeof a[k] === 'string') a[k] = /^(true|oui|1|vrai)$/i.test(a[k].trim());
  for (const k of ['annee', 'moisDebut', 'moisFin']) if (typeof a[k] === 'string' && a[k].trim()) a[k] = Number.parseInt(a[k], 10);
  if (typeof a.marque === 'string') a.marque = MARQUES.find((m) => norm(m) === norm(a.marque)) || undefined;
  if (typeof a.statut === 'string') a.statut = Object.keys(STATUT).find((s) => norm(s) === norm(a.statut)) || (/cours/.test(norm(a.statut)) ? 'actif' : undefined);
  if (typeof a.sites === 'string') a.sites = a.sites.split(/[,;]/).map((x: string) => x.trim()).filter(Boolean);
  return a;
}

/** Exécute un outil demandé par le modèle. Ne lève jamais : une erreur devient un résultat lisible. */
export async function runTool(name: string, rawArgs: Args, me: Me): Promise<string> {
  const args = normalize(rawArgs);
  try {
    const r = name === 'projets' ? projets(args) : name === 'budget' ? await budget(args, me) : name === 'absences' ? await absences(args, me) : { erreur: 'Outil inconnu.' };
    return JSON.stringify(r);
  } catch (e) {
    console.error('[mIAouss] outil', name, e);
    return JSON.stringify({ erreur: 'Calcul impossible dans Gearbox.' });
  }
}

/**
 * L'organisation du groupe, lue dans constants.ts et envoyée au serveur avec chaque question : le backend ne compile pas
 * constants.ts, et une copie côté serveur finirait par diverger (même doctrine que les règles de calcul).
 */
export function orgaContext(): string {
  const NL = '\n';
  const plaques = Object.entries(PLAQUES_STRUCTURE).map(([p, s]) => `- ${p} : ${(s as string[]).join(', ')}`).join(NL);
  const horsPlaque = (SITES as string[]).filter((s) => !Object.values(PLAQUES_STRUCTURE).some((l) => (l as string[]).includes(s)));
  return [
    `Concessions du groupe, par plaque :${NL}${plaques}`,
    horsPlaque.length ? `- Hors plaque : ${horsPlaque.join(', ')}` : '',
    `Alpine n'existe que sur ${(ALPINE_SITES as string[]).join(', ')} (une enveloppe par site : Alpine-Clermont…). Nissan est présent à ${(NISSAN_SITES as string[]).join(', ')} mais n'a qu'UNE enveloppe globale.`,
    `Au budget, Thiers et Ambert sont regroupés sous Ricoux, Riom sous Mozac.`,
  ].filter(Boolean).join(NL);
}

export const TOOL_LABEL: Record<string, string> = { projets: 'Projets', budget: 'Budget', absences: 'Congés' };
