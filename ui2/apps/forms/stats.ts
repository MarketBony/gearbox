// =====================================================================
// Forms — logique PURE des statistiques (01/10/2026) : structure Google (`forms.get`) + réponses
// en cache → questions à plat et agrégats. Aucune dépendance au DOM ni au moteur.
//
// Rappels de l'API Google Forms :
//  - une question = `questionItem.question` (questionId, choiceQuestion / textQuestion / scaleQuestion /
//    ratingQuestion / dateQuestion / timeQuestion / fileUploadQuestion) ;
//  - une grille = `questionGroupItem` : une question PAR LIGNE (rowQuestion), colonnes partagées ;
//  - une réponse = `answers[questionId]` → `textAnswers.answers[].value` (tout est du texte, même
//    une échelle ou une date) ou `fileUploadAnswers.answers[]`.
// =====================================================================
import type { GFormResponse } from '../../../types';

export type QKind = 'choice' | 'text' | 'scale' | 'rating' | 'date' | 'time' | 'file' | 'grid';
export interface Question {
  id: string;                    // questionId (ou itemId pour une grille)
  title: string;
  section: string;               // titre de la section qui la contient ('' = première page)
  kind: QKind;
  required: boolean;
  multi?: boolean;               // cases à cocher (plusieurs réponses)
  options?: string[];            // choix, colonnes d'une grille
  hasOther?: boolean;
  low?: number; high?: number; lowLabel?: string; highLabel?: string;
  paragraph?: boolean;
  rows?: { id: string; label: string }[];   // grille
}

/** Questions dans l'ordre du formulaire (textes, images, vidéos ignorés). */
export function questionsOf(structure: { items?: any[] } | null | undefined): Question[] {
  const out: Question[] = [];
  let section = '';
  for (const it of structure?.items || []) {
    if (it.pageBreakItem) { section = it.title || 'Section sans titre'; continue; }
    const q = it.questionItem?.question;
    if (q) {
      const base = { id: q.questionId, title: it.title || 'Question sans titre', section, required: !!q.required };
      if (q.choiceQuestion) {
        const opts = (q.choiceQuestion.options || []).filter((o: any) => !o.isOther).map((o: any) => o.value);
        out.push({ ...base, kind: 'choice', multi: q.choiceQuestion.type === 'CHECKBOX', options: opts, hasOther: (q.choiceQuestion.options || []).some((o: any) => o.isOther) });
      } else if (q.scaleQuestion) {
        out.push({ ...base, kind: 'scale', low: q.scaleQuestion.low ?? 1, high: q.scaleQuestion.high ?? 5, lowLabel: q.scaleQuestion.lowLabel, highLabel: q.scaleQuestion.highLabel });
      } else if (q.ratingQuestion) {
        out.push({ ...base, kind: 'rating', low: 1, high: q.ratingQuestion.ratingScaleLevel || 5 });
      } else if (q.dateQuestion) out.push({ ...base, kind: 'date' });
      else if (q.timeQuestion) out.push({ ...base, kind: 'time' });
      else if (q.fileUploadQuestion) out.push({ ...base, kind: 'file' });
      else out.push({ ...base, kind: 'text', paragraph: !!q.textQuestion?.paragraph });
      continue;
    }
    const g = it.questionGroupItem;
    if (g?.grid) {
      out.push({
        id: it.itemId, title: it.title || 'Grille sans titre', section, kind: 'grid', required: (g.questions || []).some((x: any) => x.required),
        multi: g.grid.columns?.type === 'CHECKBOX', options: (g.grid.columns?.options || []).map((o: any) => o.value),
        rows: (g.questions || []).map((x: any) => ({ id: x.questionId, label: x.rowQuestion?.title || '' })),
      });
    }
  }
  return out;
}

/** Valeurs texte d'une réponse à une question (fichiers : leurs noms). */
export function valuesOf(r: GFormResponse, qid: string): string[] {
  const a = r.answers?.[qid];
  if (!a) return [];
  if (a.textAnswers) return (a.textAnswers.answers || []).map((x: any) => String(x.value ?? '')).filter((v: string) => v !== '');
  if (a.fileUploadAnswers) return (a.fileUploadAnswers.answers || []).map((x: any) => x.fileName || 'Fichier');
  return [];
}

export interface Count { label: string; n: number; other?: boolean }
export interface QStat {
  q: Question;
  answered: number;              // répondants ayant répondu à cette question
  counts?: Count[];              // choix, échelle, note
  others?: string[];             // réponses « Autre »
  avg?: number;                  // échelle, note
  texts?: { v: string; at: string }[];  // réponses libres (texte, date, heure, fichier), plus récentes d'abord
  grid?: { label: string; counts: number[] }[];
}

/** Agrégats d'une question sur l'ensemble des réponses. */
export function statOf(q: Question, rs: GFormResponse[]): QStat {
  if (q.kind === 'grid') {
    const rows = (q.rows || []).map((row) => {
      const counts = (q.options || []).map(() => 0);
      rs.forEach((r) => valuesOf(r, row.id).forEach((v) => { const i = (q.options || []).indexOf(v); if (i >= 0) counts[i]++; }));
      return { label: row.label, counts };
    });
    const answered = rs.filter((r) => (q.rows || []).some((row) => valuesOf(r, row.id).length)).length;
    return { q, answered, grid: rows };
  }
  const withVal = rs.map((r) => ({ r, v: valuesOf(r, q.id) })).filter((x) => x.v.length);
  const answered = withVal.length;
  if (q.kind === 'choice') {
    const map = new Map<string, number>((q.options || []).map((o) => [o, 0]));
    const others: string[] = [];
    withVal.forEach(({ v }) => v.forEach((x) => { if (map.has(x)) map.set(x, map.get(x)! + 1); else others.push(x); }));
    const counts: Count[] = [...map].map(([label, n]) => ({ label, n }));
    if (others.length || q.hasOther) counts.push({ label: 'Autre', n: others.length, other: true });
    // Choix tous numériques (« note sur 10 » faite avec une liste) : moyenne, comme une échelle.
    const nums = (q.options || []).map(Number);
    let avg: number | undefined;
    if (!q.multi && nums.length > 1 && nums.every(Number.isFinite)) {
      let sum = 0, nb = 0;
      counts.forEach((c) => { if (!c.other) { sum += Number(c.label) * c.n; nb += c.n; } });
      avg = nb ? sum / nb : undefined;
    }
    return { q, answered, counts, others, avg };
  }
  if (q.kind === 'scale' || q.kind === 'rating') {
    const lo = q.low ?? 1, hi = q.high ?? 5;
    const counts: Count[] = Array.from({ length: hi - lo + 1 }, (_, i) => ({ label: String(lo + i), n: 0 }));
    let sum = 0, nb = 0;
    withVal.forEach(({ v }) => { const n = Number(v[0]); if (Number.isFinite(n) && n >= lo && n <= hi) { counts[n - lo].n++; sum += n; nb++; } });
    return { q, answered, counts, avg: nb ? sum / nb : undefined };
  }
  return { q, answered, texts: withVal.map(({ r, v }) => ({ v: v.join(', '), at: r.submittedAt })) };
}

// ---------------------------------------------------------------- vue d'ensemble
const p2 = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** Total, 7 et 30 derniers jours, et réponses par jour sur les `days` derniers jours (heure locale). */
export function overview(rs: GFormResponse[], days = 30, now = new Date()) {
  const t = now.getTime(), D = 864e5;
  const last7 = rs.filter((r) => t - new Date(r.submittedAt).getTime() <= 7 * D).length;
  const last30 = rs.filter((r) => t - new Date(r.submittedAt).getTime() <= 30 * D).length;
  const byDay = new Map<string, number>();
  rs.forEach((r) => { const k = dayKey(new Date(r.submittedAt)); byDay.set(k, (byDay.get(k) || 0) + 1); });
  const series = Array.from({ length: days }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - (days - 1 - i)); const k = dayKey(d); return { k, d, n: byDay.get(k) || 0 }; });
  return { total: rs.length, last7, last30, series };
}

/** Lignes d'export : date, e-mail (si collecté), puis une colonne par question (lignes de grille éclatées). */
export function exportRows(qs: Question[], rs: GFormResponse[]) {
  const cols: { title: string; id: string }[] = [];
  qs.forEach((q) => { if (q.kind === 'grid') (q.rows || []).forEach((r) => cols.push({ title: `${q.title} [${r.label}]`, id: r.id })); else cols.push({ title: q.title, id: q.id }); });
  const withEmail = rs.some((r) => r.respondentEmail);
  const headers = ['Date', ...(withEmail ? ['E-mail'] : []), ...cols.map((c) => c.title)];
  const rows = rs.map((r) => {
    const d = new Date(r.submittedAt);
    return [`${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`, ...(withEmail ? [r.respondentEmail || ''] : []), ...cols.map((c) => valuesOf(r, c.id).join('; '))];
  });
  return { headers, rows };
}
