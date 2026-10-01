// =====================================================================
// Post-it — logique PURE (dates locales, découpage par jour, chevauchements).
// Aucune dépendance au DOM ni au moteur : testable seule.
//
// Formats (mêmes que la route, backend/src/routes/postits.ts) :
//  - créneau horaire : start / end = 'YYYY-MM-DDTHH:mm', fin EXCLUSIVE ;
//  - journée(s) entière(s) : start / end = 'YYYY-MM-DD', fin INCLUSIVE.
// Tout est calculé en heure LOCALE, jamais via `new Date(iso)` (UTC → bug J+1).
// =====================================================================
import type { PostIt, PostItColor } from '../../../types';

export const DAY_MIN = 24 * 60;
export const SNAP = 15;                    // pas d'accroche, en minutes

/** Palette : fond du papier, liseré, et nom affiché. Mêmes clés que POSTIT_COLORS (route). */
export const COLORS: { id: PostItColor; l: string; bg: string; edge: string }[] = [
  { id: 'yellow', l: 'Jaune', bg: '#ffe27a', edge: '#e0b400' },
  { id: 'peach', l: 'Pêche', bg: '#ffc7a3', edge: '#ee8443' },
  { id: 'pink', l: 'Rose', bg: '#ffb8cb', edge: '#e2527b' },
  { id: 'lavender', l: 'Lavande', bg: '#d8c7ff', edge: '#8c68ea' },
  { id: 'sky', l: 'Ciel', bg: '#addaff', edge: '#3a8ee0' },
  { id: 'mint', l: 'Menthe', bg: '#aeedd2', edge: '#2aa87a' },
  { id: 'lime', l: 'Citron vert', bg: '#d7f191', edge: '#82b11d' },
  { id: 'slate', l: 'Ardoise', bg: '#d3d7e0', edge: '#757e92' },
];
export const colorOf = (id: string) => COLORS.find((c) => c.id === id) || COLORS[0];

// ---------------------------------------------------------------- dates locales
const p2 = (n: number) => String(n).padStart(2, '0');
export const fmtDay = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const parseDay = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const d = parseDay(s); d.setDate(d.getDate() + n); return fmtDay(d); };
export const today = () => fmtDay(new Date());
/** Lundi de la semaine qui contient `s`. */
export const mondayOf = (s: string) => { const d = parseDay(s); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return fmtDay(d); };
export const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 864e5);
export const minOf = (slot: string) => (slot.length > 10 ? +slot.slice(11, 13) * 60 + +slot.slice(14, 16) : 0);
export const slotOf = (day: string, min: number) => {
  // min peut valoir 1440 (minuit du lendemain, fin exclusive) ou déborder : on reporte sur le jour.
  const d = Math.floor(min / DAY_MIN), m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${d ? addDays(day, d) : day}T${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
};
export const hhmm = (min: number) => { const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN; return `${p2(Math.floor(m / 60))}:${p2(m % 60)}`; };
export const snap = (min: number, step = SNAP) => Math.round(min / step) * step;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const JOURS_C = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
export const dowOf = (s: string) => (parseDay(s).getDay() + 6) % 7;      // 0 = lundi
export const monthTitle = (s: string) => { const d = parseDay(s); return `${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
/** « 28 septembre – 4 octobre 2026 » (mois et année seulement quand ils changent). */
export const rangeTitle = (a: string, b: string) => {
  const A = parseDay(a), B = parseDay(b);
  if (A.getFullYear() !== B.getFullYear()) return `${A.getDate()} ${MOIS_C[A.getMonth()]} ${A.getFullYear()} – ${B.getDate()} ${MOIS_C[B.getMonth()]} ${B.getFullYear()}`;
  if (A.getMonth() !== B.getMonth()) return `${A.getDate()} ${MOIS[A.getMonth()]} – ${B.getDate()} ${MOIS[B.getMonth()]} ${B.getFullYear()}`;
  return `${A.getDate()} – ${B.getDate()} ${MOIS[B.getMonth()]} ${B.getFullYear()}`;
};
export const dayLabel = (s: string) => { const d = parseDay(s); return `${JOURS[dowOf(s)]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };

/** Libellé de l'horaire d'un post-it (« 09:30 – 11:00 », « Journée entière », « 2 – 4 oct. »). */
export const whenLabel = (p: PostIt) => {
  if (p.allDay) {
    if (p.start === p.end) return 'Journée entière';
    const A = parseDay(p.start), B = parseDay(p.end);
    return A.getMonth() === B.getMonth() ? `${A.getDate()} – ${B.getDate()} ${MOIS_C[B.getMonth()]}` : `${A.getDate()} ${MOIS_C[A.getMonth()]} – ${B.getDate()} ${MOIS_C[B.getMonth()]}`;
  }
  const sd = p.start.slice(0, 10), ed = p.end.slice(0, 10);
  if (sd === ed || (daysBetween(sd, ed) === 1 && minOf(p.end) === 0)) return `${hhmm(minOf(p.start))} – ${hhmm(minOf(p.end))}`;
  const A = parseDay(sd), B = parseDay(ed);
  return `${A.getDate()} ${MOIS_C[A.getMonth()]} ${hhmm(minOf(p.start))} – ${B.getDate()} ${MOIS_C[B.getMonth()]} ${hhmm(minOf(p.end))}`;
};

/** Premier et dernier jour COUVERTS par un post-it (fin exclusive d'un créneau ramenée au bon jour). */
export const spanOf = (p: PostIt): [string, string] => {
  if (p.allDay) return [p.start, p.end];
  const sd = p.start.slice(0, 10); let ed = p.end.slice(0, 10);
  if (minOf(p.end) === 0 && ed > sd) ed = addDays(ed, -1);
  return [sd, ed];
};

// ---------------------------------------------------------------- vue semaine : créneaux horaires
export interface Seg { p: PostIt; day: string; s: number; e: number; head: boolean; tail: boolean; col: number; cols: number }

/** Découpe les créneaux horaires visibles en segments par jour, puis les place côte à côte quand ils se chevauchent. */
export function layoutTimed(items: PostIt[], days: string[]): Map<string, Seg[]> {
  const out = new Map<string, Seg[]>(days.map((d) => [d, []]));
  for (const p of items) {
    if (p.allDay) continue;
    const sd = p.start.slice(0, 10), ed = p.end.slice(0, 10);
    for (const day of days) {
      if (day < sd || day > ed) continue;
      const s = day === sd ? minOf(p.start) : 0;
      const e = day === ed ? minOf(p.end) : DAY_MIN;
      if (e <= s) continue;                                   // fin à minuit pile : rien ce jour-là
      out.get(day)!.push({ p, day, s, e, head: day === sd, tail: day === ed || (e === DAY_MIN && addDays(day, 1) === ed && minOf(p.end) === 0), col: 0, cols: 1 });
    }
  }
  for (const segs of out.values()) {
    segs.sort((a, b) => a.s - b.s || b.e - a.e);
    // Grappes de segments qui se chevauchent : colonnes attribuées au premier libre.
    let cluster: Seg[] = [], cEnd = -1;
    const flush = () => { const n = Math.max(1, ...cluster.map((x) => x.col + 1)); cluster.forEach((x) => (x.cols = n)); cluster = []; };
    for (const sg of segs) {
      if (sg.s >= cEnd && cluster.length) flush();
      const ends: number[] = [];
      cluster.forEach((x) => (ends[x.col] = Math.max(ends[x.col] ?? -1, x.e)));
      let c = 0; while (ends[c] !== undefined && ends[c] > sg.s) c++;
      sg.col = c; cluster.push(sg); cEnd = Math.max(cEnd, sg.e);
    }
    if (cluster.length) flush();
  }
  return out;
}

// ---------------------------------------------------------------- bandes (journée entière, vue mois)
export interface Bar { p: PostIt; a: number; b: number; lane: number; head: boolean; tail: boolean }

/**
 * Barres d'une rangée de jours (`days`, consécutifs) : index de début / fin dans la rangée et
 * couloir (lane) attribué au premier libre. `which` filtre ce qui va dans la bande.
 */
export function layoutBars(items: PostIt[], days: string[], which: (p: PostIt) => boolean): Bar[] {
  const first = days[0], last = days[days.length - 1];
  const bars: Bar[] = [];
  for (const p of items) {
    if (!which(p)) continue;
    const [sd, ed] = spanOf(p);
    if (ed < first || sd > last) continue;
    const a = sd < first ? 0 : daysBetween(first, sd), b = ed > last ? days.length - 1 : daysBetween(first, ed);
    bars.push({ p, a, b, lane: 0, head: sd >= first, tail: ed <= last });
  }
  // Les plus longues d'abord, puis par heure : rendu stable et compact.
  bars.sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a) || (x.p.allDay === y.p.allDay ? x.p.start.localeCompare(y.p.start) : x.p.allDay ? -1 : 1));
  const lanes: number[] = [];                                    // dernier index occupé par couloir
  for (const br of bars) {
    let l = 0; while (lanes[l] !== undefined && lanes[l] >= br.a) l++;
    br.lane = l; lanes[l] = br.b;
  }
  return bars;
}

/** 42 jours (6 semaines) de la grille du mois qui contient `s`, du lundi au dimanche. */
export const monthDays = (s: string) => { const d = parseDay(s); const first = mondayOf(fmtDay(new Date(d.getFullYear(), d.getMonth(), 1))); return Array.from({ length: 42 }, (_, i) => addDays(first, i)); };

// ---------------------------------------------------------------- déplacements
/** Déplace un post-it de `dDays` jours et `dMin` minutes, sans changer sa durée. */
export function moveBy(p: PostIt, dDays: number, dMin = 0): Pick<PostIt, 'start' | 'end'> {
  if (p.allDay) return { start: addDays(p.start, dDays), end: addDays(p.end, dDays) };
  const sd = p.start.slice(0, 10), ed = p.end.slice(0, 10);
  return { start: slotOf(addDays(sd, dDays), minOf(p.start) + dMin), end: slotOf(addDays(ed, dDays), minOf(p.end) + dMin) };
}
/** Durée d'un créneau horaire en minutes. */
export const durationOf = (p: PostIt) => daysBetween(p.start.slice(0, 10), p.end.slice(0, 10)) * DAY_MIN + minOf(p.end) - minOf(p.start);
