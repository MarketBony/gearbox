// =====================================================================
// Forms — modèle de l'éditeur maison (G2, 01/10/2026) : logique PURE sur les éléments (items) de
// l'API Google Forms. Aucune dépendance au DOM.
//
// Principe : l'éditeur fabrique LUI-MÊME les identifiants des éléments et questions qu'il crée
// (l'API l'autorise s'ils ne sont pas déjà pris dans le formulaire, vérifié dans la doc le 01/10).
// Pas d'attente d'identifiant serveur entre deux modifications, pas de correspondance à tenir.
// =====================================================================

export type Kind =
  | 'short' | 'paragraph' | 'radio' | 'checkbox' | 'dropdown' | 'scale' | 'rating' | 'date' | 'time' | 'gridRadio' | 'gridCheckbox'
  | 'section' | 'text' | 'image' | 'video' | 'file' | 'unknown';

/** Types de question proposés (ordre et libellés de Google Forms). */
export const QUESTION_KINDS: { k: Kind; l: string; icon: string }[] = [
  { k: 'short', l: 'Réponse courte', icon: 'edit' },
  { k: 'paragraph', l: 'Paragraphe', icon: 'list' },
  { k: 'radio', l: 'Choix multiples', icon: 'target' },
  { k: 'checkbox', l: 'Cases à cocher', icon: 'kanban' },
  { k: 'dropdown', l: 'Liste déroulante', icon: 'chevron' },
  { k: 'scale', l: 'Échelle linéaire', icon: 'sliders' },
  { k: 'rating', l: 'Note', icon: 'star' },
  { k: 'gridRadio', l: 'Grille à choix multiples', icon: 'grid' },
  { k: 'gridCheckbox', l: 'Grille de cases à cocher', icon: 'grid' },
  { k: 'date', l: 'Date', icon: 'agenda' },
  { k: 'time', l: 'Heure', icon: 'clock' },
];
export const kindLabel = (k: Kind) => QUESTION_KINDS.find((x) => x.k === k)?.l
  || ({ section: 'Section', text: 'Titre et description', image: 'Image', video: 'Vidéo', file: 'Importation de fichier', unknown: 'Élément' } as Record<string, string>)[k] || 'Élément';
/** Éléments que l'API ne sait pas créer ni modifier correctement : affichés, déplaçables, supprimables, édités dans Google. */
export const READ_ONLY: Kind[] = ['image', 'video', 'file', 'unknown'];

/** Identifiant d'élément / de question : 8 chiffres hexadécimaux d'un entier 32 bits POSITIF (premier chiffre
 *  0 à 7, comme ceux que Google attribue). Au-delà, Google répond « Invalid ID » (constaté le 01/10/2026). */
export const newId = () => { const b = crypto.getRandomValues(new Uint8Array(4)); b[0] &= 0x7f; return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function kindOf(it: any): Kind {
  if (it.pageBreakItem) return 'section';
  if (it.textItem) return 'text';
  if (it.imageItem) return 'image';
  if (it.videoItem) return 'video';
  const q = it.questionItem?.question;
  if (q) {
    if (q.choiceQuestion) return ({ RADIO: 'radio', CHECKBOX: 'checkbox', DROP_DOWN: 'dropdown' } as Record<string, Kind>)[q.choiceQuestion.type] || 'radio';
    if (q.scaleQuestion) return 'scale';
    if (q.ratingQuestion) return 'rating';
    if (q.dateQuestion) return 'date';
    if (q.timeQuestion) return 'time';
    if (q.fileUploadQuestion) return 'file';
    return q.textQuestion?.paragraph ? 'paragraph' : 'short';
  }
  const g = it.questionGroupItem;
  if (g?.grid) return g.grid.columns?.type === 'CHECKBOX' ? 'gridCheckbox' : 'gridRadio';
  return 'unknown';
}
export const isQuestion = (k: Kind) => QUESTION_KINDS.some((x) => x.k === k) || k === 'file';
export const isChoice = (k: Kind) => k === 'radio' || k === 'checkbox' || k === 'dropdown';
export const isGrid = (k: Kind) => k === 'gridRadio' || k === 'gridCheckbox';
const CHOICE_TYPE: Record<string, string> = { radio: 'RADIO', checkbox: 'CHECKBOX', dropdown: 'DROP_DOWN' };

/** Élément vierge d'un type donné (identifiants neufs). */
export function blank(k: Kind, base: { title?: string; description?: string; required?: boolean } = {}): any {
  const itemId = newId(), title = base.title ?? (k === 'section' ? 'Nouvelle section' : k === 'text' ? 'Titre' : 'Question sans titre');
  const it: any = { itemId, title, ...(base.description ? { description: base.description } : {}) };
  if (k === 'section') return { ...it, pageBreakItem: {} };
  if (k === 'text') return { ...it, textItem: {} };
  const required = !!base.required;
  if (isGrid(k)) {
    return { ...it, questionGroupItem: { questions: [{ questionId: newId(), required, rowQuestion: { title: 'Ligne 1' } }], grid: { columns: { type: k === 'gridCheckbox' ? 'CHECKBOX' : 'RADIO', options: [{ value: 'Colonne 1' }] } } } };
  }
  const question: any = { questionId: newId(), required };
  if (isChoice(k)) question.choiceQuestion = { type: CHOICE_TYPE[k], options: [{ value: 'Option 1' }] };
  else if (k === 'scale') question.scaleQuestion = { low: 1, high: 5 };
  else if (k === 'rating') question.ratingQuestion = { ratingScaleLevel: 5, iconType: 'STAR' };
  else if (k === 'date') question.dateQuestion = { includeYear: true };
  else if (k === 'time') question.timeQuestion = { duration: false };
  else question.textQuestion = { paragraph: k === 'paragraph' };
  return { ...it, questionItem: { question } };
}

/**
 * Changement de type. Même famille (choix ↔ choix, courte ↔ paragraphe, grille ↔ grille) : l'élément
 * est MODIFIÉ (mêmes identifiants, réponses existantes conservées). Familles différentes : un NOUVEL
 * élément remplace l'ancien (`replaced`), les réponses déjà reçues à l'ancienne question ne lui sont
 * plus rattachées — l'éditeur prévient avant.
 */
export function convert(it: any, to: Kind): { item: any; replaced: boolean } {
  const from = kindOf(it);
  if (isChoice(from) && isChoice(to)) {
    const c = clone(it), cq = c.questionItem.question.choiceQuestion;
    cq.type = CHOICE_TYPE[to];
    if (to === 'dropdown') cq.options = cq.options.filter((o: any) => !o.isOther);
    if (to === 'checkbox') cq.options.forEach((o: any) => { delete o.goToAction; delete o.goToSectionId; });
    return { item: c, replaced: false };
  }
  if ((from === 'short' || from === 'paragraph') && (to === 'short' || to === 'paragraph')) {
    const c = clone(it); c.questionItem.question.textQuestion = { paragraph: to === 'paragraph' };
    return { item: c, replaced: false };
  }
  if (isGrid(from) && isGrid(to)) {
    const c = clone(it); c.questionGroupItem.grid.columns.type = to === 'gridCheckbox' ? 'CHECKBOX' : 'RADIO';
    return { item: c, replaced: false };
  }
  const req = !!(it.questionItem?.question?.required || it.questionGroupItem?.questions?.some((q: any) => q.required));
  const item = blank(to, { title: it.title, description: it.description, required: req });
  // Les choix tapés survivent au passage vers un autre type à choix… depuis une grille (colonnes).
  if (isChoice(to) && isGrid(from)) item.questionItem.question.choiceQuestion.options = clone(it.questionGroupItem.grid.columns.options);
  return { item, replaced: true };
}

/** Copie d'un élément avec des identifiants neufs (bouton « Dupliquer » d'une question). */
export function duplicateItem(it: any): any {
  const c = clone(it);
  c.itemId = newId();
  if (c.questionItem?.question) c.questionItem.question.questionId = newId();
  if (c.questionGroupItem?.questions) c.questionGroupItem.questions.forEach((q: any) => (q.questionId = newId()));
  return c;
}

/** La question est-elle obligatoire (grille : au moins une ligne) ? */
export const isRequired = (it: any) => !!(it.questionItem?.question?.required || it.questionGroupItem?.questions?.some((q: any) => q.required));
export function setRequired(it: any, v: boolean) {
  const c = clone(it);
  if (c.questionItem?.question) c.questionItem.question.required = v;
  if (c.questionGroupItem?.questions) c.questionGroupItem.questions.forEach((q: any) => (q.required = v));
  return c;
}

/** Sections du formulaire (cibles possibles d'un aiguillage). */
export const sectionsOf = (items: any[]) => items.filter((it) => it.pageBreakItem).map((it) => ({ id: it.itemId as string, title: (it.title as string) || 'Section sans titre' }));
