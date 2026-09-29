import { gx } from '../ui/kit';

// Période et graphiques de la rubrique Campagnes (maquettes/v2/js/apps/campaigns.js, en-tête).
// Les graphiques sont les générateurs HTML du moteur (`GX.chart`) : même balisage que la maquette.

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
export const pd = (s: string) => { const [y, m, d] = (s || '').slice(0, 10).split('-').map(Number); return new Date(y || 1970, (m || 1) - 1, d || 1); };
const lastDay = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const monthSpan = (a: Date, b: Date) => (a.getDate() === 1 && b.getDate() === lastDay(b) ? (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1 : 0);

export interface Period { from: string; to: string }
export function perLabel(from: string, to: string) {
  const a = pd(from), b = pd(to), n = monthSpan(a, b);
  if (n === 12 && a.getMonth() === 0) return String(a.getFullYear());
  if (n === 6 && a.getMonth() % 6 === 0) return `S${a.getMonth() < 6 ? 1 : 2} ${a.getFullYear()}`;
  if (n === 3 && a.getMonth() % 3 === 0) return `T${a.getMonth() / 3 + 1} ${a.getFullYear()}`;
  if (n === 1) { const s = a.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return s[0].toUpperCase() + s.slice(1); }
  return gx().ui.periodLabel(from, to);
}
/** Période précédente / suivante de même longueur (mois entiers conservés). */
export function shift(P: Period, dir: number): Period {
  const a = pd(P.from), b = pd(P.to), n = monthSpan(a, b), I = (d: Date) => gx().iso(d);
  if (n) return { from: I(new Date(a.getFullYear(), a.getMonth() + dir * n, 1)), to: I(new Date(b.getFullYear(), b.getMonth() + dir * n + 1, 0)) };
  const len = Math.round((+b - +a) / 864e5) + 1;
  return { from: I(gx().addDays(a, dir * len)), to: I(gx().addDays(b, dir * len)) };
}
export interface Bucket { l: string; s: string; e: string }
export function buckets(a: Date, b: Date): Bucket[] {
  const F = gx().fmt, I = (d: Date) => gx().iso(d), days = Math.round((+b - +a) / 864e5) + 1, out: Bucket[] = [];
  if (days <= 31) for (let i = 0; i < days; i++) { const d = gx().addDays(a, i); out.push({ l: days <= 7 ? F.day(d) + ' ' + d.getDate() : String(d.getDate()), s: I(d), e: I(d) }); }
  else if (days <= 120) for (let d = new Date(a); d <= b; d = gx().addDays(d, 7)) { const e = gx().addDays(d, 6); out.push({ l: F.date(d).replace('.', ''), s: I(d), e: I(e > b ? b : e) }); }
  else for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d <= b; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) { const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); out.push({ l: MONTHS[d.getMonth()], s: I(d < a ? a : d), e: I(e > b ? b : e) }); }
  return out;
}
export const avg = (arr: number[]) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null);
export const intFmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
export const volFmt = (v: number) => (v >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k' : String(Math.round(v)));

/** Courbe de pourcentages : une période sans valeur renseignée reste VIDE (jamais comptée à 0). */
export function pctLine(labels: string[], vals: (number | null)[], color: string, H: number) {
  const esc = gx().esc, W = 600, pl = 40, pb = 20, pt = 8, iw = W - pl - 10, ih = H - pt - pb, bw = iw / Math.max(1, labels.length);
  const x = (i: number) => pl + i * bw + bw / 2, y = (v: number) => pt + ih - (v / 100) * ih;
  const grid = [0, 50, 100].map((v) => `<line x1="${pl}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" /><text x="${pl - 6}" y="${y(v) + 3}" text-anchor="end" font-size="11" fill="var(--text-3)">${v} %</text>`).join('');
  const segs: [number, number, number, number][][] = []; let cur: [number, number, number, number][] = [];
  vals.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(v), v, i]); }); if (cur.length) segs.push(cur);
  const path = segs.map((s) => s.map(([px, py], k) => `${k ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')).join(' ');
  const area = segs.filter((s) => s.length > 1).map((s) => `M${s[0][0].toFixed(1)},${y(0)} ` + s.map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join(' ') + ` L${s[s.length - 1][0].toFixed(1)},${y(0)} Z`).join(' ');
  const step = Math.ceil(labels.length / 12);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;overflow:visible">
      <defs><linearGradient id="cmpA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#cmpA)" />
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" style="animation:ch-draw 900ms var(--ease-out) both" />
      ${segs.flat().map(([px, py, v, i]) => `<circle cx="${px}" cy="${py}" r="3.2" fill="var(--surface-1)" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" data-tip="${esc(labels[i])} : ${v.toFixed(1)} %" />`).join('')}
      ${labels.map((l, i) => (i % step ? '' : `<text x="${x(i)}" y="${H - 5}" text-anchor="middle" font-size="11" fill="var(--text-3)">${esc(l)}</text>`)).join('')}
      ${segs.length ? '' : `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="12" fill="var(--text-3)">Aucune donnée renseignée</text>`}</svg>`;
}
