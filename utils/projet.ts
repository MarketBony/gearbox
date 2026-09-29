import { Project, Task, BrandType, ServiceType } from '../types';
import { ALPINE_SITES, NISSAN_SITES, DISTRIBUTION_GROUPE_BONY, DISTRIBUTION_GROUPE_BONY_RN } from '../constants';

/**
 * Agrégats DÉRIVÉS d'un projet — avancement et budget réel.
 *
 * ⚠️ SOURCE UNIQUE de cette formule. Elle vivait en DEUX copies : `handleUpdateProject`
 * dans `pages/Projects.tsx` et `recalcProject` dans `pages/TodoList.tsx`. Même doctrine
 * que `constants.ts` pour le routage budgétaire, `TASK_FIELDS` pour l'écriture d'une
 * tâche ou `siteScope.ts` pour le cloisonnement : une règle qui décide de chiffres
 * affichés dans Budget et Dashboard ne se réimplémente pas par écran. C'est exactement
 * cette classe de duplication qui a fait diverger Budget et Dashboard quatre fois.
 *
 * ⚠️ NE MUTE PAS son argument — l'ancienne version de `TodoList` écrivait dans l'objet
 * reçu (`project.progress = …`), donc modifiait au passage l'élément du tableau d'état
 * React dont il provenait. Un état muté en place ne déclenche pas de rendu et rend les
 * comparaisons de référence inutilisables : ici la file de sauvegarde compare des
 * instantanés, elle a besoin d'objets neufs.
 *
 * ⚠️ Ces deux champs sont RECALCULÉS À CHAQUE SAUVEGARDE, quel que soit le champ
 * modifié. Ce n'est pas un bug, c'est voulu — mais la conséquence, documentée dans
 * `ETAT-PROJET.md`, est que l'avancement importé de l'Excel est écrasé au premier
 * passage de l'équipe sur chaque projet. Les montants, eux, ne bougent pas (vérifié le
 * 04/08/2026 : les 97 projets ont déjà `budgetActual` = somme des coûts de leurs tâches).
 *
 * Pondération des statuts, inchangée depuis l'origine : `Done` et `Programmed` comptent
 * pour 1, `InProgress` pour 0,5, le reste pour 0.
 */
export const recalculerProjet = (projet: Project): Project => {
  const taches = projet.tasks ?? [];

  let poids = 0;
  for (const t of taches) {
    if (t.status === 'Done' || t.status === 'Programmed') poids += 1;
    else if (t.status === 'InProgress') poids += 0.5;
  }

  return {
    ...projet,
    progress: taches.length > 0 ? Math.round((poids / taches.length) * 100) : 0,
    budgetActual: taches.reduce((somme, t) => somme + (t.cost || 0), 0),
  };
};

// =====================================================================
// Règles d'ÉDITION d'un projet — sorties de `pages/Projects.tsx` (updateSiteSelection,
// toggleService, toggleBrand, création) le 29/09/2026 pour l'interface v2 (ui2/apps/projects).
// Même doctrine que `recalculerProjet` : une règle qui décide des sites, de la répartition et
// des marques d'un projet — donc de chiffres du Budget et du Dashboard — n'existe qu'une fois.
// Fonctions PURES : elles rendent un projet neuf, jamais ne modifient leur argument.
// `pages/Projects.tsx` garde provisoirement ses copies jusqu'à son retrait.
// =====================================================================

/** Libellé `Project.site` des deux périmètres groupés (répartition pondérée, verrouillée). */
export const GROUPES_PROJET = { 'GROUPE BONY': DISTRIBUTION_GROUPE_BONY, 'GROUPE BONY (R/N)': DISTRIBUTION_GROUPE_BONY_RN } as const;
export type GroupeProjet = keyof typeof GROUPES_PROJET;
export const groupeDuProjet = (p: Project): GroupeProjet | null => (p.site in GROUPES_PROJET ? (p.site as GroupeProjet) : null);

/** Sites réels d'un projet (les projets anciens n'ont que `site`). */
export const sitesDuProjet = (p: Project): string[] => (p.sites && p.sites.length ? p.sites : p.site && !(p.site in GROUPES_PROJET) ? [p.site] : []);

/** Alpine seulement avec un site Alpine, Nissan seulement avec un site Nissan. */
export const marqueAutorisee = (sites: string[], b: BrandType): boolean =>
  b === 'Alpine' ? sites.some(s => (ALPINE_SITES as string[]).includes(s)) : b === 'Nissan' ? sites.some(s => (NISSAN_SITES as string[]).includes(s)) : true;

/**
 * Pose un périmètre groupé, ou une liste de sites. Liste de sites : `site` = le site (1) ou
 * `sites.join(', ')` (n), répartition remise à PARTS ÉGALES (règle d'origine). Une marque qui
 * n'a plus de site éligible est retirée — elle restait sinon collée au projet sans pouvoir être
 * décochée (défaut relevé à l'inventaire, `BUGS-CONNUS.md`).
 */
export const poserSites = (p: Project, choix: { groupe: GroupeProjet } | { sites: string[] }): Project => {
  let next: Project;
  if ('groupe' in choix) {
    const d = GROUPES_PROJET[choix.groupe];
    next = { ...p, site: choix.groupe, sites: Object.keys(d), budgetDistribution: { ...d } };
  } else {
    const sites = [...choix.sites];
    const part = sites.length ? 100 / sites.length : 0;
    next = { ...p, site: sites.length === 0 ? '' : sites.length === 1 ? sites[0] : sites.join(', '), sites, budgetDistribution: Object.fromEntries(sites.map(s => [s, part])) };
  }
  const brands = (next.brands || []).filter(b => marqueAutorisee(next.sites || [], b));
  return brands.length === (next.brands || []).length ? next : { ...next, brands };
};

/** « Tous Services » est exclusif. */
export const basculerService = (p: Project, s: ServiceType): Project => {
  const cur = p.service || [];
  if (s === 'Tous Services') return { ...p, service: cur.includes('Tous Services') ? [] : ['Tous Services'] };
  const t = cur.filter(x => x !== 'Tous Services');
  return { ...p, service: t.includes(s) ? t.filter(x => x !== s) : [...t, s] };
};

/** Holding est un TAG EXCLUSIF : le poser retire les autres marques, en poser une autre le retire. */
export const basculerMarque = (p: Project, b: BrandType): Project => {
  const cur = p.brands || [];
  if (b === 'Holding') return { ...p, brands: cur.includes('Holding') ? [] : ['Holding'] };
  const t = cur.filter(x => x !== 'Holding');
  return { ...p, brands: t.includes(b) ? t.filter(x => x !== b) : [...t, b] };
};

const isoLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const idClient = () => Math.random().toString(36).slice(2, 11);

/** Projet neuf, valeurs par défaut de l'origine. Date LOCALE (l'origine prenait l'UTC : veille entre 0 h et 2 h). */
export const nouveauProjet = (name: string, userId?: string): Project => ({
  id: idClient(), name, site: 'Clermont', sites: ['Clermont'], budgetDistribution: { Clermont: 100 },
  service: ['VN'], brands: ['Renault'], projectType: 'OP Clients', status: 'Draft',
  startDate: isoLocal(), endDate: isoLocal(), budgetPlanned: 0, budgetActual: 0, description: '', progress: 0,
  tasks: [], assignedUsers: userId ? [userId] : [],
});

/** Tâche neuve (même forme que « + AJOUTER UNE TÂCHE »). */
export const nouvelleTache = (): Task => ({ id: idClient(), name: '', channel: '' as any, cost: 0, status: 'Todo' });
