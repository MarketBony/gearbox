// =====================================================================
// Forms Bony → modèle des statistiques (ui2/apps/forms/stats.ts), 01/10/2026.
// Les statistiques ont été écrites pour Google Forms ; plutôt que d'en faire une seconde version,
// on traduit la définition Bony en `Question[]` et chaque réponse en libellés (`values`), que
// `valuesOf` lit en priorité. Une seule façon de compter, pour les deux familles de formulaires.
// =====================================================================
import { displayValue, type BonyFormDef, type Field } from '../../../../shared/bonyform';
import type { BonyResponse, GFormResponse } from '../../../../types';
import type { Question } from '../stats';

const NO_ANSWER = new Set(['statement', 'section', 'signature', 'file']);

export function bonyQuestions(def: BonyFormDef | null | undefined): Question[] {
  const out: Question[] = [];
  let section = '';
  for (const f of def?.fields || []) {
    if (f.type === 'section') { section = f.label || 'Section'; continue; }
    if (NO_ANSWER.has(f.type)) continue;
    const base = { id: f.id, title: f.label || (f.type === 'hidden' ? `Champ caché (${f.param || f.id})` : 'Question'), section, required: !!f.required };
    if (['choice', 'dropdown', 'slot', 'concession', 'brand'].includes(f.type)) out.push({ ...base, kind: 'choice', options: (f.options || []).map((o) => o.label), hasOther: !!f.allowOther });
    else if (f.type === 'multi') out.push({ ...base, kind: 'choice', multi: true, options: (f.options || []).map((o) => o.label), hasOther: !!f.allowOther });
    else if (f.type === 'consent') out.push({ ...base, title: f.label || 'Consentement', kind: 'choice', options: ['Oui'] });
    else if (f.type === 'scale') out.push({ ...base, kind: 'scale', low: f.min ?? 1, high: f.max ?? 5, lowLabel: f.minLabel, highLabel: f.maxLabel });
    else if (f.type === 'nps') out.push({ ...base, kind: 'scale', low: 0, high: 10, lowLabel: f.minLabel, highLabel: f.maxLabel });
    else if (f.type === 'rating') out.push({ ...base, kind: 'rating', low: 1, high: f.max || 5 });
    else out.push({ ...base, kind: f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text' });
  }
  return out;
}

/** Réponses Bony → forme des réponses Google, avec les libellés déjà calculés. */
export function bonyResponses(def: BonyFormDef | null | undefined, rows: BonyResponse[]): (GFormResponse & { values: Record<string, string[]>; meta: any })[] {
  const fields = new Map<string, Field>((def?.fields || []).map((f) => [f.id, f]));
  return rows.map((r) => {
    const values: Record<string, string[]> = {};
    for (const [id, v] of Object.entries(r.answers || {})) {
      const f = fields.get(id); if (!f) continue;
      if (Array.isArray(v)) values[id] = v.map((x) => displayValue(f, x)).filter(Boolean);
      else { const d = displayValue(f, v as any); if (d !== '') values[id] = [d]; }
    }
    const email = def?.fields.find((f) => f.type === 'email');
    return { id: r.id, submittedAt: r.submittedAt, respondentEmail: email && typeof r.answers?.[email.id] === 'string' ? r.answers[email.id] : null, answers: r.answers, values, meta: r.meta };
  });
}
