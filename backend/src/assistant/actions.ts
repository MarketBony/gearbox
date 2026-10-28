import type { ToolDef } from './providers';
import { TOOLS, CONSIGNES_TOOL } from './prompt';
import { ASSISTANT_ROLES, TASK_EDIT_ROLES, POSTIT_ROLES, PROJECT_EDIT_ROLES, SOCIAL_EDIT_ROLES } from '../auth/roles';

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS de mIAouss (lot 1a « mIAouss qui agit », 28/10/2026) — SEULE PORTE de validation.
//
// mIAouss PROPOSE, la personne VALIDE une carte, le NAVIGATEUR écrit par les mêmes fonctions que
// l'interface (mêmes routes, mêmes droits : le serveur n'écrit RIEN de métier ici). Ce module :
//   - décrit au modèle les outils d'action permis au rôle (`actionTools`),
//   - valide et NORMALISE les arguments (`checkAction`) : types, dates réelles, longueurs, statuts,
//     rubriques ; le résultat (`payload`) garde les MÊMES CLÉS que les arguments, pour repasser tel
//     quel dans `checkAction` quand la carte a été corrigée (POST /actions/:id/claim),
//   - rédige le message `tool` renvoyé au modèle (`describeProposed`).
// La résolution des noms (projet, tâche, personnes) se fait CÔTÉ CLIENT, sur les données déjà
// cloisonnées par rôle : ici on ne vérifie que la forme.
//
// ⚠️ Pas de base ni de Prisma dans ce fichier : les evals (assistant/evals/) l'importent hors serveur.
// ⚠️ Schémas d'outils VOLONTAIREMENT tolérants (cf. prompt.ts, 08/10) : Groq refuse tout l'appel (400)
// quand Qwen écrit `"true"` pour `true`. La rigueur est ICI, à la main (pas de zod dans le backend).
// ⚠️ Chaque jeton des descriptions est payé à CHAQUE appel : rester court.
// ═══════════════════════════════════════════════════════════════════════════

/** Une action `proposed` plus vieille que ça est `expired` (calculé à la lecture). */
export const ACTION_EXPIRY_MS = 24 * 3600_000;
/** Au plus N actions proposées par question (au-delà : erreur renvoyée au modèle). */
export const ACTIONS_PER_TURN = 5;

const TEXT_MAX = 200;
const NAME_MAX = 80;
const ASSIGNES_MAX = 5;

export type CheckResult =
  | { ok: true; type: string; payload: Record<string, unknown>; summary: string; auto: boolean }
  | { ok: false; error: string };

// ---------------------------------------------------------------- rubriques de `ouvrir`
/** Id de la coque v2 → libellé affiché, puis alias français (comparés sans accent ni casse). */
const RUBRIQUES: Record<string, { label: string; alias: string[] }> = {
  dashboard: { label: 'le Dashboard', alias: ['tableau de bord', 'cockpit', 'accueil'] },
  projects: { label: 'Projets', alias: ['projets', 'projet'] },
  todo: { label: 'la To-do', alias: ['to-do', 'to do', 'taches', 'tache', 'post-it', 'post-its', 'postit', 'postits'] },
  digital: { label: 'Digital', alias: ['planning', 'calendrier editorial', 'publications', 'publication'] },
  hello: { label: 'Hello Marketing', alias: ['hello marketing'] },
  agenda: { label: "l'Agenda", alias: [] },
  budget: { label: 'le Budget', alias: ['budgets'] },
  fixed: { label: 'les Dépenses fixes', alias: ['depenses', 'depenses fixes', 'depense', 'depense fixe'] },
  material: { label: 'le Matériel', alias: ['materiel'] },
  conges: { label: 'les Congés', alias: ['conge', 'absences', 'absence'] },
  forms: { label: 'Forms', alias: ['formulaires', 'formulaire', 'form'] },
  crm: { label: 'SPARK', alias: ['spark'] },
  chat: { label: 'le Chat', alias: ['messages', 'messagerie'] },
  export: { label: "l'Export", alias: [] },
  settings: { label: 'les Réglages', alias: ['reglages', 'parametres', 'reglage', 'parametre'] },
  games: { label: 'les Jeux', alias: ['jeux', 'jeu'] },
};

/** Sans accent, minuscules, tirets/apostrophes → espaces, articles de tête retirés. */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[-_'’.]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/^(la |le |les |l |rubrique |la rubrique |l onglet |onglet )+/, '').trim();

const RUBRIQUE_INDEX = new Map<string, string>();
for (const [id, r] of Object.entries(RUBRIQUES)) {
  RUBRIQUE_INDEX.set(fold(id), id);
  for (const a of r.alias) RUBRIQUE_INDEX.set(fold(a), id);
}

// ---------------------------------------------------------------- petits contrôles
/** Texte : chaîne obligatoire, caractères de contrôle retirés, espaces resserrés. */
function text(v: unknown, field: string, max: number, required: boolean): string | undefined | { error: string } {
  if (v === undefined || v === null || v === '') return required ? { error: `Champ « ${field} » manquant.` } : undefined;
  if (typeof v !== 'string') return { error: `« ${field} » doit être un texte.` };
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return required ? { error: `Champ « ${field} » vide.` } : undefined;
  if (s.length > max) return { error: `« ${field} » trop long (${max} caractères maximum).` };
  return s;
}

/** AAAA-MM-JJ et date RÉELLE du calendrier (refuse 2026-02-30). */
function isoDate(v: unknown, field: string, required: boolean): string | undefined | { error: string } {
  if (v === undefined || v === null || v === '') return required ? { error: `Champ « ${field} » manquant (AAAA-MM-JJ).` } : undefined;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return { error: `« ${field} » doit être une date AAAA-MM-JJ.` };
  const s = v.trim();
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { error: `« ${field} » : la date ${s} n'existe pas.` };
  if (y < 2000 || y > 2100) return { error: `« ${field} » : année hors limites.` };
  return s;
}

const isErr = (x: unknown): x is { error: string } => !!x && typeof x === 'object' && 'error' in (x as any);

/** Booléen tolérant (`true` ou `"true"`, cf. en-tête). */
function bool(v: unknown, field: string): boolean | undefined | { error: string } {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string' && /^(true|vrai|oui)$/i.test(v.trim())) return true;
  if (typeof v === 'string' && /^(false|faux|non)$/i.test(v.trim())) return false;
  return { error: `« ${field} » doit valoir true ou false.` };
}

/** Entier tolérant (`60` ou `"60"`) borné. */
function int(v: unknown, field: string, min: number, max: number): number | undefined | { error: string } {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) return { error: `« ${field} » doit être un entier de ${min} à ${max}.` };
  return n;
}

/** Statut de tâche : libellé français CANONIQUE (le client mappe à faire=Todo, en cours=InProgress, terminée=Done). */
const STATUTS: Record<string, string> = {
  'a faire': 'à faire', todo: 'à faire', 'pas commence': 'à faire', 'pas commencee': 'à faire', 'non commence': 'à faire', 'non commencee': 'à faire',
  'en cours': 'en cours', inprogress: 'en cours', 'in progress': 'en cours', commence: 'en cours', commencee: 'en cours', demarre: 'en cours', demarree: 'en cours',
  terminee: 'terminée', termine: 'terminée', fait: 'terminée', faite: 'terminée', fini: 'terminée', finie: 'terminée', done: 'terminée',
};
function statut(v: unknown): string | undefined | { error: string } {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') return { error: '« statut » doit être un texte.' };
  const s = STATUTS[fold(v)];
  return s || { error: `Statut « ${v} » inconnu : à faire, en cours ou terminée.` };
}

/** Personnes : liste de prénoms/noms (une chaîne « A, B et C » est acceptée), dédoublonnée, au plus 5. */
function assignes(v: unknown): string[] | undefined | { error: string } {
  if (v === undefined || v === null || v === '') return undefined;
  const raw = typeof v === 'string' ? v.split(/\s*(?:,|;|\bet\b)\s*/i) : Array.isArray(v) ? v : null;
  if (!raw) return { error: '« assignes » doit être une liste de prénoms.' };
  const out: string[] = [];
  for (const x of raw) {
    const t = text(x, 'assignes', NAME_MAX, false);
    if (isErr(t)) return t;
    if (t && !out.some((o) => fold(o) === fold(t))) out.push(t);
  }
  if (out.length > ASSIGNES_MAX) return { error: `Au plus ${ASSIGNES_MAX} personnes assignées.` };
  return out.length ? out : undefined;
}

// ---------------------------------------------------------------- contrôles du lot 1b (28/10/2026)
/** Liste de libellés (une chaîne « A, B et C » est acceptée), dédoublonnée, bornée. Aucune résolution de nom ici. */
function list(v: unknown, field: string, max: number, itemMax = NAME_MAX): string[] | undefined | { error: string } {
  if (v === undefined || v === null || v === '') return undefined;
  const raw = typeof v === 'string' ? v.split(/\s*(?:,|;|\bet\b)\s*/i) : Array.isArray(v) ? v : null;
  if (!raw) return { error: `« ${field} » doit être une liste.` };
  const out: string[] = [];
  for (const x of raw) {
    const t = text(x, field, itemMax, false);
    if (isErr(t)) return t;
    if (t && !out.some((o) => fold(o) === fold(t))) out.push(t);
  }
  if (out.length > max) return { error: `« ${field} » : ${max} éléments maximum.` };
  return out.length ? out : undefined;
}

/** Valeur prise dans une liste CANONIQUE (comparée sans accent ni casse), renvoyée sous sa forme canonique. */
function oneOf(v: unknown, field: string, values: readonly string[], alias: Record<string, string> = {}): string | undefined | { error: string } {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') return { error: `« ${field} » doit être un texte.` };
  const f = fold(v);
  const hit = values.find((x) => fold(x) === f) || alias[f];
  return hit || { error: `« ${field} » : « ${v} » inconnu (${values.join(', ')}).` };
}

/** Texte LONG (wording d'une publication) : sauts de ligne GARDÉS, autres caractères de contrôle retirés. */
function longText(v: unknown, field: string, max: number): string | { error: string } {
  if (v === undefined || v === null || v === '') return { error: `Champ « ${field} » manquant.` };
  if (typeof v !== 'string') return { error: `« ${field} » doit être un texte.` };
  const s = v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!s) return { error: `Champ « ${field} » vide.` };
  if (s.length > max) return { error: `« ${field} » trop long (${max} caractères maximum).` };
  return s;
}

const fmtEuros = (n: number) => `${n.toLocaleString('fr-FR', Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, ' ')} €`;

/** Montant en euros, tolérant (`3000`, `"3 000 €"`, `"2500,50"`), borné. */
function euros(v: unknown, field: string, max: number): number | undefined | { error: string } {
  if (v === undefined || v === null || v === '') return undefined;
  let n = NaN;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\s*\d[\d   .]*(,\d{1,2})?\s*(€|eur|euros?)?\s*$/i.test(v)) {
    // Espaces et points = séparateurs de milliers (« 3 000 », « 3.000 ») ; la virgule = décimales.
    n = Number(v.replace(/€|euros?|eur/gi, '').replace(/[\s  .]/g, '').replace(',', '.'));
  }
  if (!Number.isFinite(n) || n < 0 || n > max) return { error: `« ${field} » doit être un montant de 0 à ${fmtEuros(max)}.` };
  return Math.round(n * 100) / 100;
}

/** Services : forme canonique de types.ts (ServiceType) ; « RH » n'existe QUE dans le Digital (SocialServiceType). */
const SERVICES = ['VN', 'VO', 'APV', 'PR', 'Tous Services'] as const;
const SERVICE_ALIAS: Record<string, string> = {
  'vehicules neufs': 'VN', neuf: 'VN', neufs: 'VN', 'vehicules d occasion': 'VO', occasion: 'VO', occasions: 'VO',
  'apres vente': 'APV', atelier: 'APV', 'pieces de rechange': 'PR', pieces: 'PR', tous: 'Tous Services', 'tous les services': 'Tous Services',
};
const PROJECT_TYPES = ['Partenariat', 'Expo/Salon', 'Animation Co', 'OP Clients', 'Contenu', 'Collaborateurs'] as const;
const PROJECT_TYPE_ALIAS: Record<string, string> = {
  salon: 'Expo/Salon', expo: 'Expo/Salon', exposition: 'Expo/Salon', 'expo salon': 'Expo/Salon',
  animation: 'Animation Co', 'animation commerciale': 'Animation Co', 'operation clients': 'OP Clients', 'op client': 'OP Clients',
};
const CIBLES = ['Internet', 'Collaborateurs'] as const;
const CIBLE_ALIAS: Record<string, string> = { externe: 'Internet', public: 'Internet', clients: 'Internet', interne: 'Collaborateurs', salaries: 'Collaborateurs' };
const STATUT_PROJET: Record<string, 'actif' | 'brouillon'> = { actif: 'actif', active: 'actif', 'en cours': 'actif', brouillon: 'brouillon', draft: 'brouillon' };

const PROJET_NOM_MAX = 200;
const DESCRIPTION_MAX = 1000;
const PUB_TEXTE_MAX = 3000;
const SITES_MAX = 20;
const MARQUES_MAX = 6;
const RESEAUX_MAX = 10;
const POINTS_MAX = 10;
const BUDGET_MAX = 10_000_000;

const frDate = (iso: string) => iso.split('-').reverse().join('/');
const fmtNames = (n: string[]) => (n.length > 1 ? `${n.slice(0, -1).join(', ')} et ${n[n.length - 1]}` : n[0]);

// ---------------------------------------------------------------- catalogue
interface ActionDef { roles: string[]; auto: boolean; tool: ToolDef; check: (a: Record<string, unknown>) => { payload: Record<string, unknown>; summary: string } | { error: string } }

const DATE = { type: 'string', description: 'AAAA-MM-JJ' };
const STATUT = { type: 'string', description: 'à faire | en cours | terminée' };
const INT_SCHEMA = (description: string) => ({ type: ['integer', 'string'], description });
const LISTE = (description: string) => ({ type: ['array', 'string'], items: { type: 'string' }, description });
const MARQUES = LISTE('Renault, Dacia, Alpine, Nissan, Mobilize, Holding');

/** Cible d'un `ouvrir` en toutes lettres (« Projets », « le projet « X » ») : résumé et réponse « J'ouvre … ». */
export const openTarget = (p: Record<string, unknown>) =>
  p.projet ? `le projet « ${p.projet} »` : RUBRIQUES[String(p.rubrique)]?.label || String(p.rubrique);

const ACTIONS: Record<string, ActionDef> = {
  ouvrir: {
    roles: ASSISTANT_ROLES, auto: true,
    tool: {
      type: 'function',
      function: {
        name: 'ouvrir',
        description: "Ouvre une rubrique de Gearbox à l'écran (ou un projet). Rien n'est modifié.",
        parameters: {
          type: 'object',
          properties: {
            rubrique: { type: 'string', description: 'dashboard, projets, to-do, digital, hello marketing, agenda, budget, dépenses fixes, matériel, congés, forms, spark, chat, export, réglages, jeux' },
            projet: { type: 'string', description: 'Nom du projet à ouvrir (rubrique projets)' },
          },
          required: ['rubrique'],
        },
      },
    },
    check: (a) => {
      const projet = text(a.projet, 'projet', TEXT_MAX, false);
      if (isErr(projet)) return projet;
      const r = text(a.rubrique, 'rubrique', 60, !projet);
      if (isErr(r)) return r;
      const id = r ? RUBRIQUE_INDEX.get(fold(r)) : 'projects';
      if (!id) return { error: `Rubrique « ${r} » inconnue. Rubriques : ${Object.values(RUBRIQUES).map((x) => x.label.replace(/^(le |la |les |l')/, '')).join(', ')}.` };
      // Un projet ne s'ouvre que dans Projets : ailleurs, il est ignoré (la rubrique demandée prime).
      const payload: Record<string, unknown> = { rubrique: id, ...(projet && id === 'projects' ? { projet } : {}) };
      return { payload, summary: `Ouvrir ${openTarget(payload)}` };
    },
  },
  creer_tache: {
    roles: TASK_EDIT_ROLES, auto: false,
    tool: {
      type: 'function',
      function: {
        name: 'creer_tache',
        description: "PROPOSE une tâche (l'utilisateur valide). Sans projet : tâche libre de la To-do.",
        parameters: {
          type: 'object',
          properties: {
            titre: { type: 'string', description: '200 caractères maximum' },
            projet: { type: 'string', description: 'Nom du projet, tel que dit' },
            echeance: DATE,
            assignes: { type: ['array', 'string'], items: { type: 'string' }, description: 'Prénoms ou noms (5 maximum)' },
            statut: STATUT,
          },
          required: ['titre'],
        },
      },
    },
    check: (a) => {
      const titre = text(a.titre, 'titre', TEXT_MAX, true); if (isErr(titre)) return titre;
      if (TITRE_BIDON.test(titre as string)) return { error: 'Titre manquant : demande à l’utilisateur ce que la tâche doit dire, au lieu d’en inventer un.' };
      const projet = text(a.projet, 'projet', TEXT_MAX, false); if (isErr(projet)) return projet;
      const echeance = isoDate(a.echeance, 'echeance', false); if (isErr(echeance)) return echeance;
      const qui = assignes(a.assignes); if (isErr(qui)) return qui;
      const st = statut(a.statut); if (isErr(st)) return st;
      const payload: Record<string, unknown> = { titre, ...(projet ? { projet } : {}), ...(echeance ? { echeance } : {}), ...(qui ? { assignes: qui } : {}), ...(st ? { statut: st } : {}) };
      let summary = `Créer la tâche « ${titre} » (${projet || 'To-do'})`;
      if (echeance) summary += `, échéance ${frDate(echeance)}`;
      if (qui) summary += `, pour ${fmtNames(qui)}`;
      if (st && st !== 'à faire') summary += `, ${st}`;
      return { payload, summary };
    },
  },
  modifier_tache: {
    roles: TASK_EDIT_ROLES, auto: false,
    tool: {
      type: 'function',
      function: {
        name: 'modifier_tache',
        description: "PROPOSE de changer le statut et/ou l'échéance d'une tâche existante (l'utilisateur valide).",
        parameters: {
          type: 'object',
          properties: {
            tache: { type: 'string', description: 'Nom de la tâche, tel que dit' },
            statut: STATUT,
            echeance: DATE,
          },
          required: ['tache'],
        },
      },
    },
    check: (a) => {
      const tache = text(a.tache, 'tache', TEXT_MAX, true); if (isErr(tache)) return tache;
      const st = statut(a.statut); if (isErr(st)) return st;
      const echeance = isoDate(a.echeance, 'echeance', false); if (isErr(echeance)) return echeance;
      if (!st && !echeance) return { error: 'Rien à modifier : donne un statut ou une échéance.' };
      const payload: Record<string, unknown> = { tache, ...(st ? { statut: st } : {}), ...(echeance ? { echeance } : {}) };
      const summary = st && echeance ? `Modifier la tâche « ${tache} » : ${st}, échéance ${frDate(echeance)}`
        : st ? (st === 'terminée' ? `Marquer la tâche « ${tache} » terminée` : `Passer la tâche « ${tache} » ${st === 'en cours' ? 'en cours' : 'à faire'}`)
        : `Décaler l'échéance de la tâche « ${tache} » au ${frDate(echeance!)}`;
      return { payload, summary };
    },
  },
  creer_postit: {
    roles: POSTIT_ROLES, auto: false,
    tool: {
      type: 'function',
      function: {
        name: 'creer_postit',
        description: "PROPOSE un post-it dans l'agenda personnel (rappel, créneau). L'utilisateur valide.",
        parameters: {
          type: 'object',
          properties: {
            texte: { type: 'string', description: '200 caractères maximum' },
            date: DATE,
            heure: { type: 'string', description: 'HH:MM (sans heure : journée entière)' },
            duree_min: { type: ['integer', 'string'], description: 'Minutes, défaut 60' },
            journee: { type: ['boolean', 'string'], description: 'Journée entière' },
          },
          required: ['texte', 'date'],
        },
      },
    },
    check: (a) => {
      const texte = text(a.texte, 'texte', TEXT_MAX, true); if (isErr(texte)) return texte;
      if (TITRE_BIDON.test(texte as string)) return { error: 'Texte manquant : demande à l’utilisateur ce que le post-it doit dire.' };
      const date = isoDate(a.date, 'date', true); if (isErr(date)) return date;
      const j = bool(a.journee, 'journee'); if (isErr(j)) return j;
      let heure: string | undefined;
      if (a.heure !== undefined && a.heure !== null && a.heure !== '') {
        const m = typeof a.heure === 'string' ? a.heure.trim().match(/^(\d{1,2})[:hH](\d{2})?$/) : null;
        if (!m || Number(m[1]) > 23 || Number(m[2] || 0) > 59) return { error: '« heure » doit être au format HH:MM.' };
        heure = `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
      }
      // Journée entière : demandée, ou déduite de l'absence d'heure. Une heure fournie avec journee=true est ignorée.
      const journee = j ?? !heure;
      if (journee) return { payload: { texte, date, journee: true }, summary: `Créer le post-it « ${texte} » le ${frDate(date!)} (journée)` };
      if (!heure) return { error: 'Donne une heure (HH:MM) ou une journée entière.' };
      const duree = int(a.duree_min, 'duree_min', 5, 1440); if (isErr(duree)) return duree;
      const d = duree ?? 60;
      const [h, mn] = heure.split(':').map(Number);
      // ⚠️ Un post-it ne déborde pas sur le lendemain : le client compose `end` le même jour.
      if (h * 60 + mn + d > 24 * 60) return { error: 'Le créneau déborde sur le lendemain : raccourcis la durée.' };
      return { payload: { texte, date, heure, duree_min: d, journee: false }, summary: `Créer le post-it « ${texte} » le ${frDate(date!)} à ${heure} (${d} min)` };
    },
  },
  // ⚠️ Lot 1b (28/10/2026, décision de Théo) : un projet proposé est ACTIF par défaut — la validation de la carte est la
  // décision humaine, et la carte montre tout ce qui pèse sur les chiffres (dont la répartition par enveloppe, calculée
  // côté client par constants.ts). Ici : la FORME seulement ; sites, plaques et marques sont résolus par le client.
  creer_projet: {
    roles: PROJECT_EDIT_ROLES, auto: false,
    tool: {
      type: 'function',
      function: {
        name: 'creer_projet',
        description: "PROPOSE un projet (l'utilisateur valide). Budget seulement s'il est donné.",
        parameters: {
          type: 'object',
          properties: {
            nom: { type: 'string' },
            sites: LISTE('Concessions ou plaques, telles que dites'),
            marques: MARQUES,
            services: LISTE('VN, VO, APV, PR'),
            type: { type: 'string', description: 'Partenariat | Expo/Salon | Animation Co | OP Clients | Contenu | Collaborateurs' },
            debut: DATE,
            fin: DATE,
            budget: { type: ['number', 'string'], description: '€ prévu' },
            description: { type: 'string' },
            statut: { type: 'string', description: 'actif (défaut) | brouillon' },
            part_alpine: INT_SCHEMA('% Alpine si Alpine + Renault/Dacia/Mobilize'),
            part_nissan: INT_SCHEMA('% Nissan si Nissan + Renault/Dacia/Mobilize'),
          },
          required: ['nom', 'sites', 'marques', 'debut', 'fin'],
        },
      },
    },
    check: (a) => {
      const nom = text(a.nom, 'nom', PROJET_NOM_MAX, true); if (isErr(nom)) return nom;
      if (TITRE_BIDON.test(nom as string)) return { error: 'Nom manquant : demande à l’utilisateur comment s’appelle le projet, au lieu d’en inventer un.' };
      const sites = list(a.sites, 'sites', SITES_MAX); if (isErr(sites)) return sites;
      if (!sites) return { error: 'Champ « sites » manquant : demande sur quelles concessions porte le projet.' };
      // « Projet Vichy » pour « crée-moi un projet à Vichy » : nom FABRIQUÉ à partir du site (mesuré aux evals du 28/10,
      // deux fois sur deux malgré la règle 8 du prompt). Refusé : le modèle doit demander le nom… et ne pas deviner la marque.
      const sansMot = String(nom).toLowerCase().replace(/^\s*(le\s+)?projet\s+(de\s+|du\s+|à\s+|a\s+)?/, '').trim();
      if (sansMot !== String(nom).toLowerCase().trim() && (sites as string[]).some((s) => s.toLowerCase().trim() === sansMot)) {
        return { error: 'Nom manquant : « Projet + site » n’est pas un nom. Demande à l’utilisateur le nom du projet (et sa marque si elle n’est pas dite), au lieu de les inventer.' };
      }
      const marques = list(a.marques, 'marques', MARQUES_MAX); if (isErr(marques)) return marques;
      if (!marques) return { error: 'Champ « marques » manquant : demande pour quelles marques est le projet.' };
      const sv = list(a.services, 'services', SERVICES.length); if (isErr(sv)) return sv;
      const services: string[] = [];
      for (const x of sv || []) { const v = oneOf(x, 'services', SERVICES, SERVICE_ALIAS); if (isErr(v)) return v; if (v && !services.includes(v)) services.push(v); }
      const type = oneOf(a.type, 'type', PROJECT_TYPES, PROJECT_TYPE_ALIAS); if (isErr(type)) return type;
      const debut = isoDate(a.debut, 'debut', true); if (isErr(debut)) return debut;
      const fin = isoDate(a.fin, 'fin', true); if (isErr(fin)) return fin;
      if ((fin as string) < (debut as string)) return { error: '« fin » est avant « debut ».' };
      const budget = euros(a.budget, 'budget', BUDGET_MAX); if (isErr(budget)) return budget;
      const description = text(a.description, 'description', DESCRIPTION_MAX, false); if (isErr(description)) return description;
      let statut: 'actif' | 'brouillon' = 'actif';
      if (a.statut !== undefined && a.statut !== null && a.statut !== '') {
        const s = typeof a.statut === 'string' ? STATUT_PROJET[fold(a.statut)] : undefined;
        if (!s) return { error: '« statut » : actif ou brouillon.' };
        statut = s;
      }
      const pa = int(a.part_alpine, 'part_alpine', 0, 100); if (isErr(pa)) return pa;
      const pn = int(a.part_nissan, 'part_nissan', 0, 100); if (isErr(pn)) return pn;
      // Un curseur n'a de sens qu'avec SA marque (le client applique ensuite la règle complète : marque RDM requise,
      // curseur vide = 100 % marque, Alpine avant Nissan — constants.ts).
      const has = (m: string) => marques.some((x) => fold(x) === m);
      const payload: Record<string, unknown> = {
        nom, sites, marques, ...(services.length ? { services } : {}), ...(type ? { type } : {}), debut, fin,
        ...(budget !== undefined ? { budget } : {}), ...(description ? { description } : {}), statut,
        ...(pa !== undefined && has('alpine') ? { part_alpine: pa } : {}), ...(pn !== undefined && has('nissan') ? { part_nissan: pn } : {}),
      };
      const d0 = debut as string, d1 = fin as string;
      const periode = d0 === d1 ? frDate(d0) : `${d0.slice(0, 4) === d1.slice(0, 4) ? frDate(d0).slice(0, 5) : frDate(d0)} → ${frDate(d1)}`;
      let summary = `Créer le projet « ${nom} » (${statut}) — ${fmtNames(sites)}, ${marques.join('/')}, ${periode}`;
      if (budget !== undefined) summary += `, ${fmtEuros(budget)}`;
      return { payload, summary };
    },
  },
  // Publication du Digital, statut « Rédigé » fixe (posé par le client). Le texte est rédigé APRÈS `consignes_redaction`.
  creer_publication: {
    roles: SOCIAL_EDIT_ROLES, auto: false,
    tool: {
      type: 'function',
      function: {
        name: 'creer_publication',
        description: "PROPOSE une publication rédigée au planning Digital (l'utilisateur valide).",
        parameters: {
          type: 'object',
          properties: {
            titre: { type: 'string' },
            date: DATE,
            reseaux: LISTE('Facebook, Instagram, LinkedIn…'),
            texte: { type: 'string', description: 'Le texte rédigé' },
            marques: MARQUES,
            concessions: LISTE('Concessions ou plaques'),
            service: { type: 'string', description: 'VN | VO | APV | PR | RH' },
            cibles: LISTE('Internet | Collaborateurs'),
            points_a_verifier: LISTE("Ce que l'utilisateur doit confirmer"),
          },
          required: ['titre', 'date', 'reseaux', 'texte'],
        },
      },
    },
    check: (a) => {
      const titre = text(a.titre, 'titre', TEXT_MAX, true); if (isErr(titre)) return titre;
      if (TITRE_BIDON.test(titre as string)) return { error: 'Titre manquant : demande à l’utilisateur le sujet de la publication.' };
      const date = isoDate(a.date, 'date', true); if (isErr(date)) return date;
      const reseaux = list(a.reseaux, 'reseaux', RESEAUX_MAX); if (isErr(reseaux)) return reseaux;
      if (!reseaux) return { error: 'Champ « reseaux » manquant : demande sur quels réseaux publier.' };
      const texte = longText(a.texte, 'texte', PUB_TEXTE_MAX); if (isErr(texte)) return texte;
      const marques = list(a.marques, 'marques', MARQUES_MAX); if (isErr(marques)) return marques;
      const concessions = list(a.concessions, 'concessions', SITES_MAX); if (isErr(concessions)) return concessions;
      const service = oneOf(a.service, 'service', [...SERVICES, 'RH'], SERVICE_ALIAS); if (isErr(service)) return service;
      const cl = list(a.cibles, 'cibles', CIBLES.length); if (isErr(cl)) return cl;
      const cibles: string[] = [];
      for (const x of cl || []) { const v = oneOf(x, 'cibles', CIBLES, CIBLE_ALIAS); if (isErr(v)) return v; if (v && !cibles.includes(v)) cibles.push(v); }
      const points = list(a.points_a_verifier, 'points_a_verifier', POINTS_MAX, TEXT_MAX); if (isErr(points)) return points;
      const payload: Record<string, unknown> = {
        titre, date, reseaux, texte, ...(marques ? { marques } : {}), ...(concessions ? { concessions } : {}),
        ...(service ? { service } : {}), ...(cibles.length ? { cibles } : {}), ...(points ? { points_a_verifier: points } : {}),
      };
      let summary = `Créer la publication « ${titre} » le ${frDate(date!)} — ${reseaux.join(', ')} (rédigée, ${texte.length} caractères)`;
      if (points) summary += `, ${points.length} point${points.length > 1 ? 's' : ''} à vérifier`;
      return { payload, summary };
    },
  },
};

// ---------------------------------------------------------------- exports
export const isActionTool = (name: string): boolean => Object.prototype.hasOwnProperty.call(ACTIONS, name);
export const isAutoAction = (name: string): boolean => !!ACTIONS[name]?.auto;

/** Outils d'action PERMIS au rôle : mIAouss ne propose jamais ce que la personne ne pourrait pas faire elle-même. */
export const actionTools = (role: string): ToolDef[] => Object.values(ACTIONS).filter((a) => a.roles.includes(role)).map((a) => a.tool);

/**
 * Outils de lecture (prompt.ts) + actions du rôle : la liste donnée au modèle. `consignes_redaction` (28/10/2026)
 * seulement si le rôle peut créer une publication : inutile ailleurs, et chaque outil se paie à chaque appel.
 */
export const toolsFor = (role: string): ToolDef[] => [
  ...TOOLS, ...(ACTIONS.creer_publication.roles.includes(role) ? [CONSIGNES_TOOL] : []), ...actionTools(role),
];

/**
 * Valide et normalise un appel d'action. Seule porte : la boucle (proposition) ET la réservation
 * (carte corrigée) passent ici. ⚠️ Refuse si le rôle n'a pas le droit, même si l'outil a été appelé.
 */
export function checkAction(name: string, args: Record<string, unknown>, role: string): CheckResult {
  const def = isActionTool(name) ? ACTIONS[name] : null;
  if (!def) return { ok: false, error: 'Action inconnue.' };
  if (!def.roles.includes(role)) return { ok: false, error: "Ton rôle ne permet pas cette action : dis-le simplement à l'utilisateur." };
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: 'Arguments invalides.' };
  const r = def.check(args);
  if (isErr(r)) return { ok: false, error: r.error };
  return { ok: true, type: name, payload: r.payload, summary: r.summary, auto: def.auto };
}

/** Texte du message `tool` renvoyé au modèle après une proposition acceptée. */
export function describeProposed(summary: string, auto: boolean): string {
  if (auto) return `Ouverture faite côté écran : ${summary}. Rien n'a été modifié.`;
  return `Action PROPOSÉE : ${summary}. Elle N'EST PAS faite : elle attend que l'utilisateur la valide sur la carte affichée sous ta réponse. Ne l'annonce jamais comme faite ; invite-le à la vérifier puis à valider.`;
}

/** Statut d'une action en clair, pour l'historique relu par le modèle. */
export const STATUS_FR: Record<string, string> = {
  proposed: "proposée, en attente de validation (PAS faite)",
  executing: 'en cours d’exécution',
  done: 'faite',
  failed: 'échouée (pas faite)',
  refused: "refusée par l'utilisateur (pas faite)",
  expired: 'expirée (pas faite)',
};

/**
 * La question porte-t-elle sur des DONNÉES de Gearbox ? Mesuré le 08/10 : à « Qui est absent cette semaine ? »,
 * Qwen a répondu sans appeler d'outil… avec deux collègues INVENTÉS. Le prompt ne suffit pas : si la question
 * vise des données et que le modèle répond sans outil, on jette sa réponse et on repose la question avec
 * `tool_choice: required`. Liste volontairement large : un faux positif coûte un appel, un faux négatif ment.
 */
// ⚠️ MESURÉ le 28/10 (evals) : élargie aux VERBES D'ACTION, elle forçait un outil à tort — « tu peux me RAPPELER ce
// que veut dire APV ? » → outil absences hors sujet ; « crée-moi une tâche » → tâche inventée « Créer une tâche » au lieu
// d'une question. Elle ne vise donc QUE les données. Le vrai risque d'une action (l'annoncer faite sans outil) est tenu
// par `ANNONCE_FAITE` ci-dessous, sur la RÉPONSE et non sur la question.
export const DATA_INTENT = /\b(projets?|budgets?|enveloppes?|consomm|d[ée]penses?|absents?|absences?|cong[ée]s?|vacances|rtt|retards?|[ée]ch[ée]ances?|qui|combien|liste|total|chiffres?|concessions?|sites?)\b|consomm/i;

/**
 * La réponse ANNONCE-t-elle une action comme faite ? Une réponse sans outil qui dit « c'est fait » / « j'ai créé la
 * tâche » ment : rien n'est écrit sans carte validée. Même traitement que `DATA_INTENT` : réponse jetée, outil obligatoire.
 */
export const ANNONCE_FAITE = /c['’]est (fait|not[ée]|cr[ée]{1,2}|ajout[ée]|programm[ée])|j['’]ai (cr[ée]{1,2}|ajout[ée]|programm[ée]|planifi[ée]|d[ée]cal[ée]|mis|plac[ée]|enregistr[ée])\b|(t[âa]che|post-?it)s? (a|ont) [ée]t[ée] (cr[ée]{1,2}|ajout[ée])/i;

/** Titre bidon (« Créer une tâche », « Nouvelle tâche ») : le modèle a comblé un manque au lieu de poser la question. */
// Élargi aux projets et publications le 28/10/2026 (« Nouveau projet », « Une publication »…).
export const TITRE_BIDON = /^\s*(cr[ée]{1,2}r?|nouvelle|nouveau|une|un|ma|mon|la|le|ajouter)?\s*(une\s+|un\s+)?(t[âa]che|post-?it|rappel|projet|publication|post)s?\s*[.!]?\s*$/i;
