// =====================================================================
// FORMS BONY — FORMAT DE DÉFINITION D'UN FORMULAIRE (source canonique, 01/10/2026)
//
// ⚠️ FICHIER PARTAGÉ, recopié À L'IDENTIQUE dans backend/src/bonyforms/schema.ts (contrôle :
// scripts/check-bonyform-sync.mjs, branché sur predev / prebuild). Ce module est lu par :
//  - l'éditeur de Gearbox (ui2/apps/forms/bony/*) ;
//  - le Worker public (forms-worker/, Cloudflare) : affichage + validation des réponses ;
//  - le serveur de Gearbox (routes/bonyForms.ts) : validation à la publication ET à la réception.
// Une réponse est donc validée par la MÊME fonction partout. Aucune dépendance (ni DOM, ni Node).
// Ne jamais modifier la copie du backend : modifier ce fichier, puis recopier.
// =====================================================================

export const SCHEMA_VERSION = 1;

export type FieldType =
  // saisie
  | 'short' | 'long' | 'email' | 'phone' | 'number' | 'postal'
  // choix
  | 'choice' | 'multi' | 'dropdown' | 'slot'
  // échelles
  | 'scale' | 'rating' | 'nps'
  // dates
  | 'date' | 'time'
  // Bony (listes tenues par Gearbox)
  | 'concession' | 'brand'
  // spéciaux
  | 'consent' | 'file' | 'signature' | 'calc' | 'hidden'
  // mise en page (pas de réponse)
  | 'statement' | 'section';

/** Types qui ne portent pas de réponse. */
export const LAYOUT_TYPES: FieldType[] = ['statement', 'section'];
export const CHOICE_TYPES: FieldType[] = ['choice', 'multi', 'dropdown', 'slot', 'concession', 'brand'];

export interface Option {
  id: string;
  label: string;
  /** Places d'un créneau (`slot`) ; absent = illimité. */
  capacity?: number;
  /** Points de l'option (champ calculé de type « score »). */
  score?: number;
  /** F2b : tuile illustrée — un emoji, ou une image (servie par le Worker). L'image l'emporte. */
  emoji?: string;
  image?: string | null;
}

export type Op = 'eq' | 'neq' | 'in' | 'nin' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'filled' | 'empty';
export interface Rule { field: string; op: Op; value?: string | number | (string | number)[] }
/** Condition d'affichage : TOUTES les règles (`all`) ou AU MOINS UNE (`any`). */
export interface Condition { mode: 'all' | 'any'; rules: Rule[] }

export interface Field {
  id: string;                 // identifiant stable (clé des réponses)
  type: FieldType;
  label: string;
  help?: string;
  required?: boolean;
  placeholder?: string;
  // choix
  options?: Option[];
  allowOther?: boolean;       // « Autre… » (choice, multi)
  minChoices?: number;        // multi
  maxChoices?: number;        // multi
  shuffle?: boolean;
  /** F2b (choice, multi) : liste classique ou tuiles illustrées, sur 1 à 4 colonnes. */
  display?: 'list' | 'tiles';
  columns?: 1 | 2 | 3 | 4;
  // saisie
  maxLength?: number;
  min?: number;               // number, scale (bas), rating (toujours 1)
  max?: number;               // number, scale (haut), rating (niveaux)
  step?: number;
  minLabel?: string;          // scale, nps
  maxLabel?: string;
  icon?: 'star' | 'heart' | 'thumb';   // rating
  // fichiers
  accept?: string[];          // ex. ['image/*', 'application/pdf']
  maxSizeMb?: number;         // par fichier (défaut 10)
  maxFiles?: number;          // défaut 1
  // consentement
  consentText?: string;       // texte légal (RGPD) affiché à côté de la case
  // préremplissage / champ caché
  param?: string;             // nom du paramètre d'adresse (?email=…) qui préremplit le champ
  lockPrefill?: boolean;      // valeur préremplie non modifiable
  // calcul
  formula?: { kind: 'score' | 'sum'; fields: string[] };
  // une participation par valeur (e-mail en général)
  unique?: boolean;
  // logique
  showIf?: Condition;
  /** F2b : demi-largeur (deux questions côte à côte sur ordinateur, présentation « page »). */
  width?: 'full' | 'half';
}

/** Polices proposées (servies par Bunny Fonts, sans traceur). Albert Sans et Syncopate = typographies Bony. */
export const FONTS = ['Albert Sans', 'Syncopate', 'Inter', 'Poppins', 'Montserrat', 'Playfair Display', 'Space Grotesk', 'Red Hat Display', 'Barlow', 'Chakra Petch'] as const;
export type FontName = typeof FONTS[number];
/** Fichier d'une police de MARQUE importée (bibliothèque partagée de Gearbox, servi par le Worker /a/<id>).
 *  Les polices officielles (NouvelR, Dacia Block, AlpineNewAlps, NissanBrand…) ne sont servies par aucun service
 *  libre : l'équipe les importe depuis ses kits de charte. Le thème EMBARQUE ses fichiers : un formulaire publié
 *  ne dépend pas de la bibliothèque (qu'on la vide ou non, il garde sa police). */
export interface FontFile { family: string; weight: number; style?: 'normal' | 'italic'; url: string }
/** Nom de famille sûr (il part dans du CSS). */
export const isFamily = (f: unknown): f is string => typeof f === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/.test(f);

export type Logo = 'bony' | 'renault' | 'dacia' | 'alpine' | 'nissan' | 'mobilize' | null;

/** Arrière-plan de la page. */
export interface Background {
  kind: 'solid' | 'gradient' | 'image' | 'pattern' | 'animated';
  colors?: string[];          // dégradé : 2 ou 3 couleurs ; motif / animé : couleur des formes
  angle?: number;             // dégradé, en degrés
  image?: string | null;      // image : adresse (servie par le Worker, /a/<id>)
  overlay?: number;           // image : voile de la couleur de fond, 0 à 0.9
  blur?: number;              // image : flou, 0 à 20 px
  pattern?: 'dots' | 'grid' | 'chevrons' | 'waves';
  animation?: 'aurora' | 'grain' | 'bubbles';
}
/** En-tête du formulaire. */
export interface Header {
  style: 'band' | 'banner' | 'hero' | 'split' | 'none';
  image?: string | null;      // bannière / plein écran / écran partagé
  overlay?: number;           // plein écran : voile sous le titre, 0 à 0.9
  logoAlign?: 'left' | 'center';
}
export interface Typo {
  scale: number;              // taille d'ensemble, 0.9 à 1.25
  headingWeight: 400 | 500 | 600 | 700 | 800;
  headingCase: 'none' | 'upper' | 'lower';
  headingSpacing: number;     // espacement des lettres des titres, en em (-0.04 à 0.2)
}
export interface Buttons { style: 'solid' | 'outline' | 'gradient' | 'pill'; label?: string; nextLabel?: string; /** casse des boutons ; absente = celle des titres */ case?: 'none' | 'upper' | 'lower'; /** espacement des lettres, en em */ spacing?: number }
export interface Motion { level: 'none' | 'soft' | 'lively'; entrance: 'fade' | 'slide' | 'spring'; confetti: boolean; confettiColors?: string[] }

export interface Theme {
  preset: string;             // ambiance d'origine (THEMES) ; 'perso' dès qu'on retouche
  primary: string;            // couleur principale (#hex)
  background: string;         // couleur de fond (et du voile des images)
  surface: string;            // fond des cartes
  text: string;
  font: string;               // texte : une police de FONTS, ou une famille de `fontFiles`
  /** Police des titres (titre du formulaire, sections) ; absente = celle du texte. */
  headingFont?: string | null;
  /** Polices de marque embarquées (voir FontFile). */
  fontFiles?: FontFile[];
  radius: number;             // arrondi des cartes, en px
  /** Ancien emplacement de l'image d'en-tête (F1) : relu par resolveTheme, remplacé par header.image. */
  headerImage?: string | null;
  logo?: Logo;
  /** Logo importé (image servie par le Worker) : remplace `logo` quand il est posé. */
  logoImage?: string | null;
  layout: 'page' | 'steps';   // page classique ou une question par écran
  // --- F2a : studio de personnalisation (tout est facultatif : resolveTheme complète)
  bg?: Background;
  header?: Header;
  typo?: Typo;
  fields?: 'cards' | 'flat' | 'lines';      // cartes, sans cartes, lignes
  inputs?: 'outline' | 'filled' | 'underline';
  shadow?: 0 | 1 | 2 | 3;
  buttons?: Buttons;
  motion?: Motion;
}
/** Thème COMPLET (valeurs par défaut posées) : ce que lisent le Worker, le client et l'aperçu. */
export type FullTheme = Required<Omit<Theme, 'headerImage' | 'headingFont' | 'logo' | 'logoImage'>> & { headingFont: string | null; logo: Logo; logoImage: string | null };

const DEF_BG: Background = { kind: 'solid' };
const DEF_HEADER: Header = { style: 'band', image: null, overlay: 0.45, logoAlign: 'left' };
const DEF_TYPO: Typo = { scale: 1, headingWeight: 700, headingCase: 'none', headingSpacing: -0.01 };
const DEF_BUTTONS: Buttons = { style: 'solid', label: 'Envoyer', nextLabel: 'Suivant' };
const DEF_MOTION: Motion = { level: 'soft', entrance: 'spring', confetti: true };

/** Complète un thème partiel. Un formulaire publié avant F2a garde EXACTEMENT son aspect. */
export function resolveTheme(t: Partial<Theme> | null | undefined): FullTheme {
  const b = THEMES.bony;
  const x = t || {};
  const header = { ...DEF_HEADER, ...(x.header || {}) };
  if (!x.header && x.headerImage) { header.style = 'banner'; header.image = x.headerImage; }
  return {
    preset: x.preset || 'bony', primary: x.primary || b.primary!, background: x.background || b.background!, surface: x.surface || b.surface!, text: x.text || b.text!,
    font: x.font || 'Albert Sans', headingFont: x.headingFont ?? null, fontFiles: Array.isArray(x.fontFiles) ? x.fontFiles.slice(0, 8) : [], radius: x.radius ?? 16, logo: x.logo === undefined ? 'bony' : x.logo, logoImage: x.logoImage ?? null, layout: x.layout || 'page',
    bg: { ...DEF_BG, ...(x.bg || {}) }, header, typo: { ...DEF_TYPO, ...(x.typo || {}) },
    fields: x.fields || 'cards', inputs: x.inputs || 'outline', shadow: x.shadow ?? 1,
    buttons: { ...DEF_BUTTONS, ...(x.buttons || {}) }, motion: { ...DEF_MOTION, ...(x.motion || {}) },
  };
}

/** Ambiances : chacune règle tout d'un coup (on affine ensuite). `l` = nom affiché. */

export interface Settings {
  closeAt?: string | null;    // ISO : fermeture automatique
  openAt?: string | null;     // ISO : ouverture différée
  maxResponses?: number | null;
  thankYou: { title: string; message: string; redirectUrl?: string | null;
    /** F2b : bouton d'action sous le message (ex. « Voir nos offres »). */
    button?: { label: string; url: string } | null;
    image?: string | null };
  /** F2b : écran d'accueil avant la première question. */
  welcome?: { enabled: boolean; title?: string; message?: string; button?: string; image?: string | null };
  /** F2b : aperçu du lien partagé (WhatsApp, Facebook, LinkedIn, SMS…). Vide = titre, description, image d'en-tête. */
  share?: { title?: string; description?: string; image?: string | null };
  /** Accusé de réception par e-mail (F4) : champ e-mail destinataire. */
  confirmEmail?: { enabled: boolean; field?: string; subject?: string; message?: string };
  /** Notification à l'équipe dans Gearbox à chaque réponse (F4). */
  notify?: boolean;
  /** Message affiché quand le formulaire est fermé ou complet. */
  closedMessage?: string;
}

export interface BonyFormDef {
  v: number;                  // SCHEMA_VERSION
  title: string;
  description?: string;
  fields: Field[];
  theme: Theme;
  settings: Settings;
}

/** Valeur d'une réponse : texte, liste (multi, fichiers), nombre, booléen (consentement). */
export type Value = string | number | boolean | string[] | null;
export type Answers = Record<string, Value>;

// ---------------------------------------------------------------- valeurs par défaut
export const THEMES: Record<string, Partial<Theme> & { l: string; bf?: string; bhf?: string }> = {
  bony: { l: 'Bony', preset: 'bony', primary: '#f75632', background: '#f6f4fa', surface: '#ffffff', text: '#1d1a24', font: 'Albert Sans', headingFont: 'Syncopate', radius: 16, logo: 'bony',
    bg: { kind: 'solid' }, header: { style: 'band', logoAlign: 'left' }, typo: { scale: 1, headingWeight: 700, headingCase: 'none', headingSpacing: -0.01 }, fields: 'cards', inputs: 'outline', shadow: 1, buttons: { style: 'solid' }, motion: { level: 'soft', entrance: 'spring', confetti: true } },
  // Marques : relevées sur les sites officiels le 01/10/2026 (couleurs, casse, angles, boutons). `bf` / `bhf` =
  // police officielle, appliquée par le Studio si elle est dans la bibliothèque ; sinon la police libre la plus proche.
  renault: { l: 'Renault', preset: 'renault', bf: 'NouvelR', primary: '#000000', background: '#ffffff', surface: '#f1f1f2', text: '#000000', font: 'Red Hat Display', headingFont: null, radius: 0, logo: 'renault',
    bg: { kind: 'solid' }, header: { style: 'none', logoAlign: 'left' }, typo: { scale: 1, headingWeight: 700, headingCase: 'lower', headingSpacing: 0 }, fields: 'cards', inputs: 'outline', shadow: 0, buttons: { style: 'solid', case: 'lower' }, motion: { level: 'soft', entrance: 'fade', confetti: true, confettiColors: ['#000000', '#6a6c72', '#d9d9d6'] } },
  dacia: { l: 'Dacia', preset: 'dacia', bf: 'Read', bhf: 'Dacia Block', primary: '#646b52', background: '#ffffff', surface: '#f1f2f2', text: '#000000', font: 'Barlow', headingFont: 'Chakra Petch', radius: 0, logo: 'dacia',
    bg: { kind: 'solid' }, header: { style: 'none', logoAlign: 'left' }, typo: { scale: 1, headingWeight: 700, headingCase: 'upper', headingSpacing: 0 }, fields: 'cards', inputs: 'outline', shadow: 0, buttons: { style: 'solid', case: 'lower' }, motion: { level: 'soft', entrance: 'fade', confetti: true, confettiColors: ['#646b52', '#ec6528', '#000000'] } },
  alpine: { l: 'Alpine', preset: 'alpine', bf: 'AlpineNewAlps', primary: '#ffffff', background: '#0a0a0a', surface: '#101a24', text: '#ffffff', font: 'Montserrat', headingFont: null, radius: 0, logo: 'alpine',
    bg: { kind: 'gradient', colors: ['#0a0a0a', '#0c1d2c'], angle: 170 }, header: { style: 'none', logoAlign: 'center' }, typo: { scale: 1, headingWeight: 700, headingCase: 'upper', headingSpacing: 0.04 }, fields: 'cards', inputs: 'underline', shadow: 0, buttons: { style: 'outline', case: 'upper' }, motion: { level: 'soft', entrance: 'slide', confetti: true, confettiColors: ['#ffffff', '#5db0d7', '#0c1d2c'] } },
  nissan: { l: 'Nissan', preset: 'nissan', bf: 'NissanBrand', primary: '#343434', background: '#ffffff', surface: '#f6f6f6', text: '#000000', font: 'Barlow', headingFont: null, radius: 0, logo: 'nissan',
    bg: { kind: 'solid' }, header: { style: 'none', logoAlign: 'left' }, typo: { scale: 1, headingWeight: 400, headingCase: 'none', headingSpacing: 0.05 }, fields: 'cards', inputs: 'filled', shadow: 0, buttons: { style: 'pill', case: 'upper', spacing: 0.12 }, motion: { level: 'soft', entrance: 'fade', confetti: true, confettiColors: ['#343434', '#c1c1c1', '#000000'] } },
  nuit: { l: 'Nuit', preset: 'nuit', primary: '#a78bfa', background: '#0f0d17', surface: '#1a1726', text: '#f4f2f8', font: 'Albert Sans', headingFont: 'Syncopate', radius: 18, logo: 'bony',
    bg: { kind: 'animated', animation: 'aurora', colors: ['#7c4dff', '#f75632'] }, header: { style: 'band', logoAlign: 'left' }, typo: { scale: 1, headingWeight: 700, headingCase: 'none', headingSpacing: 0 }, fields: 'cards', inputs: 'filled', shadow: 2, buttons: { style: 'gradient' }, motion: { level: 'lively', entrance: 'spring', confetti: true } },
  verre: { l: 'Verre', preset: 'verre', primary: '#f75632', background: '#e9e4f5', surface: 'rgba(255,255,255,0.68)', text: '#1d1a24', font: 'Albert Sans', headingFont: 'Syncopate', radius: 24, logo: 'bony',
    bg: { kind: 'animated', animation: 'bubbles', colors: ['#f75632', '#7c4dff', '#2fb7ff'] }, header: { style: 'none', logoAlign: 'center' }, typo: { scale: 1.05, headingWeight: 700, headingCase: 'none', headingSpacing: 0 }, fields: 'cards', inputs: 'filled', shadow: 2, buttons: { style: 'pill' }, motion: { level: 'lively', entrance: 'spring', confetti: true } },
  editorial: { l: 'Éditorial', preset: 'editorial', primary: '#111111', background: '#fbfaf7', surface: '#fbfaf7', text: '#141414', font: 'Albert Sans', headingFont: 'Playfair Display', radius: 0, logo: 'bony',
    bg: { kind: 'solid' }, header: { style: 'none', logoAlign: 'left' }, typo: { scale: 1.15, headingWeight: 700, headingCase: 'none', headingSpacing: -0.02 }, fields: 'lines', inputs: 'underline', shadow: 0, buttons: { style: 'outline' }, motion: { level: 'soft', entrance: 'fade', confetti: false } },
  showroom: { l: 'Showroom', preset: 'showroom', primary: '#f75632', background: '#0c0c10', surface: '#16161c', text: '#f5f5f7', font: 'Albert Sans', headingFont: 'Syncopate', radius: 14, logo: 'bony',
    bg: { kind: 'solid' }, header: { style: 'hero', overlay: 0.5, logoAlign: 'left' }, typo: { scale: 1.05, headingWeight: 700, headingCase: 'upper', headingSpacing: 0.04 }, fields: 'flat', inputs: 'filled', shadow: 0, buttons: { style: 'pill' }, motion: { level: 'lively', entrance: 'slide', confetti: true } },
  minimal: { l: 'Minimal', preset: 'minimal', primary: '#1d1a24', background: '#ffffff', surface: '#ffffff', text: '#1d1a24', font: 'Inter', headingFont: null, radius: 10, logo: null,
    bg: { kind: 'solid' }, header: { style: 'none', logoAlign: 'left' }, typo: { scale: 1, headingWeight: 600, headingCase: 'none', headingSpacing: -0.02 }, fields: 'flat', inputs: 'outline', shadow: 0, buttons: { style: 'solid' }, motion: { level: 'soft', entrance: 'fade', confetti: false } },
};
/** Applique une ambiance à un thème (garde la présentation choisie). */
export function applyAmbiance(t: Theme, id: string): Theme {
  const { l: _l, bf: _bf, bhf: _bhf, ...a } = THEMES[id] || THEMES.bony;
  return { ...t, ...a, fontFiles: [], headerImage: null, header: { ...DEF_HEADER, ...(a.header || {}), image: t.header?.image ?? t.headerImage ?? null }, bg: { ...DEF_BG, ...(a.bg || {}), image: t.bg?.image ?? null }, layout: t.layout } as Theme;
}

// ---------------------------------------------------------------- couleurs
/** Luminance relative (WCAG) d'une couleur #hex. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return 1;
  const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Couleur du texte posé sur la couleur principale (boutons, choix actifs). Blanc tant qu'il atteint 3 : 1
 *  (seuil WCAG du texte gras : boutons et choix le sont) — l'orange Bony garde ainsi son texte blanc ; sinon noir
 *  (jaune Renault, couleurs claires). */
export const onColor = (hex: string) => (contrast(hex, '#ffffff') >= 2.95 ? '#ffffff' : '#111111');

export function newDef(title: string): BonyFormDef {
  return {
    v: SCHEMA_VERSION,
    title,
    description: '',
    fields: [],
    theme: (() => { const { l: _l, ...a } = THEMES.bony; return { ...a, layout: 'page' } as Theme; })(),
    settings: { thankYou: { title: 'Merci !', message: 'Votre réponse a bien été enregistrée.' }, closedMessage: 'Ce formulaire n’accepte plus de réponses.' },
  };
}

// ---------------------------------------------------------------- utilitaires
const str = (v: Value) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v));
const isEmpty = (v: Value) => v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0);
const asList = (v: Value): string[] => (Array.isArray(v) ? v.map(String) : isEmpty(v) ? [] : [String(v)]);
export const isLayout = (f: Field) => LAYOUT_TYPES.includes(f.type);
export const normEmail = (s: string) => s.trim().toLowerCase();

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_PHONE = /^\+?[0-9 .()-]{8,20}$/;
const RE_POSTAL = /^\d{5}$/;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_TIME = /^\d{2}:\d{2}$/;

// ---------------------------------------------------------------- logique d'affichage
/** Une règle est-elle satisfaite par les réponses courantes ? */
export function ruleOk(r: Rule, a: Answers): boolean {
  const v = a[r.field];
  const list = asList(v), s = str(v), n = Number(s);
  const vals = Array.isArray(r.value) ? r.value.map(String) : r.value === undefined ? [] : [String(r.value)];
  switch (r.op) {
    case 'filled': return !isEmpty(v);
    case 'empty': return isEmpty(v);
    case 'eq': return list.length ? list.includes(vals[0]) : s === vals[0];
    case 'neq': return !(list.length ? list.includes(vals[0]) : s === vals[0]);
    case 'in': return list.some((x) => vals.includes(x));
    case 'nin': return !list.some((x) => vals.includes(x));
    case 'contains': return s.toLowerCase().includes((vals[0] || '').toLowerCase());
    case 'gt': return Number.isFinite(n) && s !== '' && n > Number(vals[0]);
    case 'gte': return Number.isFinite(n) && s !== '' && n >= Number(vals[0]);
    case 'lt': return Number.isFinite(n) && s !== '' && n < Number(vals[0]);
    case 'lte': return Number.isFinite(n) && s !== '' && n <= Number(vals[0]);
  }
  return true;
}

/**
 * Champs VISIBLES pour des réponses données (dans l'ordre). Un champ masqué l'est aussi pour la
 * suite : une règle qui lit un champ masqué le voit vide (pas de réponse fantôme). Une section
 * masquée masque tout ce qu'elle contient jusqu'à la section suivante.
 */
export function visibleFields(def: BonyFormDef, a: Answers): Field[] {
  const seen: Answers = {};
  const out: Field[] = [];
  let sectionHidden = false;
  for (const f of def.fields) {
    if (f.type === 'section') sectionHidden = !!f.showIf && !condOk(f.showIf, seen);
    const ok = !sectionHidden && (f.type === 'section' || !f.showIf || condOk(f.showIf, seen));
    if (ok) { out.push(f); if (!isLayout(f)) seen[f.id] = a[f.id] ?? null; }
  }
  return out;
}
export const condOk = (c: Condition, a: Answers) => !c.rules.length || (c.mode === 'any' ? c.rules.some((r) => ruleOk(r, a)) : c.rules.every((r) => ruleOk(r, a)));

// ---------------------------------------------------------------- calculs
/** Valeur d'un champ calculé : score (points des options choisies) ou somme de champs numériques. */
export function calcValue(f: Field, def: BonyFormDef, a: Answers): number {
  if (!f.formula) return 0;
  let total = 0;
  for (const id of f.formula.fields) {
    const src = def.fields.find((x) => x.id === id); if (!src) continue;
    if (f.formula.kind === 'score' && src.options) {
      asList(a[id]).forEach((v) => { const o = src.options!.find((x) => x.id === v || x.label === v); if (o?.score) total += o.score; });
    } else {
      const n = Number(str(a[id]).replace(',', '.'));
      if (Number.isFinite(n)) total += n;
    }
  }
  return Math.round(total * 100) / 100;
}

// ---------------------------------------------------------------- validation
export interface Ctx {
  /** Places déjà prises par option de créneau : { [fieldId]: { [optionId]: n } }. */
  taken?: Record<string, Record<string, number>>;
  /** Fichiers déjà déposés pour cette réponse (identifiants), par champ. */
  files?: Record<string, string[]>;
}
export interface Result { ok: boolean; errors: Record<string, string>; clean: Answers }

/**
 * Valide des réponses contre la définition. Rend les erreurs PAR CHAMP (messages pour le
 * répondant) et les réponses NETTOYÉES : seulement les champs visibles, valeurs normalisées,
 * champs calculés recalculés (jamais la valeur envoyée par le navigateur).
 */
export function validate(def: BonyFormDef, raw: Answers, ctx: Ctx = {}): Result {
  const errors: Record<string, string> = {};
  const clean: Answers = {};
  const vis = visibleFields(def, raw);
  for (const f of vis) {
    if (isLayout(f)) continue;
    if (f.type === 'calc') continue;                      // recalculé plus bas
    let v: Value = raw[f.id] ?? null;
    if (typeof v === 'string') v = v.trim();
    const empty = isEmpty(v);
    if (empty) {
      if (f.required && f.type !== 'hidden') errors[f.id] = f.type === 'consent' ? 'Votre accord est nécessaire pour continuer.' : 'Cette question est obligatoire.';
      continue;
    }
    const s = str(v);
    switch (f.type) {
      case 'short': case 'long': case 'hidden': {
        const max = f.maxLength || (f.type === 'long' ? 5000 : 500);
        if (s.length > max) errors[f.id] = `${max} caractères au maximum.`; else clean[f.id] = s;
        break;
      }
      case 'email':
        if (!RE_EMAIL.test(s) || s.length > 200) errors[f.id] = 'Adresse e-mail invalide.'; else clean[f.id] = normEmail(s);
        break;
      case 'phone':
        if (!RE_PHONE.test(s)) errors[f.id] = 'Numéro de téléphone invalide.'; else clean[f.id] = s.replace(/[^\d+]/g, '');
        break;
      case 'postal':
        if (!RE_POSTAL.test(s)) errors[f.id] = 'Code postal à 5 chiffres.'; else clean[f.id] = s;
        break;
      case 'number': {
        const n = Number(s.replace(',', '.'));
        if (!Number.isFinite(n)) errors[f.id] = 'Nombre attendu.';
        else if (f.min !== undefined && n < f.min) errors[f.id] = `Au moins ${f.min}.`;
        else if (f.max !== undefined && n > f.max) errors[f.id] = `Au plus ${f.max}.`;
        else clean[f.id] = n;
        break;
      }
      case 'scale': case 'rating': case 'nps': {
        const n = Number(s), lo = f.type === 'nps' ? 0 : f.type === 'rating' ? 1 : f.min ?? 1, hi = f.type === 'nps' ? 10 : f.max ?? 5;
        if (!Number.isInteger(n) || n < lo || n > hi) errors[f.id] = 'Valeur hors de l’échelle.'; else clean[f.id] = n;
        break;
      }
      case 'date':
        if (!RE_DATE.test(s)) errors[f.id] = 'Date invalide.'; else clean[f.id] = s;
        break;
      case 'time':
        if (!RE_TIME.test(s)) errors[f.id] = 'Heure invalide.'; else clean[f.id] = s;
        break;
      case 'consent':
        if (v !== true && s !== 'true' && s !== 'on') errors[f.id] = 'Votre accord est nécessaire pour continuer.'; else clean[f.id] = true;
        break;
      case 'choice': case 'dropdown': case 'slot': case 'concession': case 'brand': {
        const ids = (f.options || []).map((o) => o.id);
        if (ids.includes(s)) {
          if (f.type === 'slot') {
            const o = f.options!.find((x) => x.id === s)!, taken = ctx.taken?.[f.id]?.[s] || 0;
            if (o.capacity !== undefined && taken >= o.capacity) { errors[f.id] = 'Ce créneau est complet, choisissez-en un autre.'; break; }
          }
          clean[f.id] = s;
        } else if (f.allowOther && f.type === 'choice' && s.startsWith('other:') && s.length > 6 && s.length <= 300) clean[f.id] = s;
        else errors[f.id] = 'Choix invalide.';
        break;
      }
      case 'multi': {
        const ids = (f.options || []).map((o) => o.id), list = asList(v);
        const bad = list.filter((x) => !ids.includes(x) && !(f.allowOther && x.startsWith('other:') && x.length > 6 && x.length <= 300));
        if (bad.length) errors[f.id] = 'Choix invalide.';
        else if (f.minChoices && list.length < f.minChoices) errors[f.id] = `Choisissez-en au moins ${f.minChoices}.`;
        else if (f.maxChoices && list.length > f.maxChoices) errors[f.id] = `${f.maxChoices} choix au maximum.`;
        else clean[f.id] = [...new Set(list)];
        break;
      }
      case 'file': {
        const list = asList(v), known = ctx.files?.[f.id];
        if (list.length > (f.maxFiles || 1)) errors[f.id] = `${f.maxFiles || 1} fichier(s) au maximum.`;
        else if (known && list.some((x) => !known.includes(x))) errors[f.id] = 'Fichier inconnu : déposez-le à nouveau.';
        else clean[f.id] = list;
        break;
      }
      case 'signature':
        // Image PNG en data URL (dessinée dans le navigateur), plafonnée à ~200 Ko.
        if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s) || s.length > 280_000) errors[f.id] = 'Signature invalide.'; else clean[f.id] = s;
        break;
    }
  }
  for (const f of vis) if (f.type === 'calc') clean[f.id] = calcValue(f, def, clean);
  return { ok: !Object.keys(errors).length, errors, clean };
}

/** Contrôle d'une DÉFINITION (publication) : rend la liste des problèmes bloquants. */
export function checkDef(def: BonyFormDef): string[] {
  const out: string[] = [];
  if (!def || def.v !== SCHEMA_VERSION) return ['Format de formulaire inconnu.'];
  if (!def.title?.trim()) out.push('Le formulaire n’a pas de titre.');
  const ids = new Set<string>();
  const answerable = def.fields.filter((f) => !isLayout(f));
  if (!answerable.length) out.push('Le formulaire ne contient aucune question.');
  def.fields.forEach((f, i) => {
    const name = f.label?.trim() || `élément ${i + 1}`;
    if (!/^[a-z0-9_-]{2,40}$/i.test(f.id)) out.push(`Identifiant invalide pour « ${name} ».`);
    if (ids.has(f.id)) out.push(`Identifiant en double : « ${name} ».`); ids.add(f.id);
    if (!isLayout(f) && f.type !== 'hidden' && !f.label?.trim()) out.push(`Une question n’a pas d’intitulé (position ${i + 1}).`);
    if (CHOICE_TYPES.includes(f.type) && f.type !== 'concession' && f.type !== 'brand' && !(f.options || []).length) out.push(`« ${name} » n’a aucune option.`);
    if (f.type === 'calc' && !(f.formula?.fields || []).length) out.push(`Le calcul « ${name} » ne lit aucun champ.`);
    if (f.showIf) f.showIf.rules.forEach((r) => {
      const at = def.fields.findIndex((x) => x.id === r.field);
      if (at < 0) out.push(`La condition de « ${name} » vise une question supprimée.`);
      else if (at >= i) out.push(`La condition de « ${name} » vise une question placée après elle.`);
    });
  });
  if (def.settings.confirmEmail?.enabled && !def.fields.some((f) => f.id === def.settings.confirmEmail!.field && f.type === 'email')) out.push('L’accusé de réception vise un champ e-mail absent.');
  const b = def.settings.thankYou?.button;
  if (b && (!b.label?.trim() || !/^https?:\/\/\S+$/.test(b.url || ''))) out.push('Le bouton de l’écran de fin doit avoir un libellé et une adresse https://…');
  if (def.settings.welcome?.enabled && !(def.settings.welcome.title || '').trim()) out.push('L’écran d’accueil n’a pas de titre.');
  return out;
}

/** Libellé lisible d'une valeur (statistiques, export) : identifiant d'option → son libellé. */
export function displayValue(f: Field, v: Value): string {
  if (v === null || v === undefined) return '';
  if (f.type === 'consent') return v ? 'Oui' : '';
  if (f.type === 'signature') return v ? '[signature]' : '';
  const label = (x: string) => (x.startsWith('other:') ? `Autre : ${x.slice(6)}` : f.options?.find((o) => o.id === x)?.label ?? x);
  if (Array.isArray(v)) return v.map(label).join(', ');
  return f.options ? label(String(v)) : String(v);
}
