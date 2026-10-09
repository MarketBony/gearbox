import type { Equipment, EquipmentBooking } from '../../../types';
import { PLAQUES_STRUCTURE, SITES_HORS_PLAQUE } from '../../../constants';
import { gx } from '../ui/kit';

// =====================================================================
// Rubrique « Matériel » : dates, empilement des barres, DISPONIBILITÉ.
// Aucune règle budgétaire ici : le matériel n'entre dans aucun budget (inventaire materiel.md § 9).
// =====================================================================

// ---------------------------------------------------------------- dates (repères locaux, jamais UTC)
export const DAY = 864e5;
/** 'yyyy-MM-dd' → Date à minuit local (anti-décalage J+1). */
export const P = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const addD = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addM = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const diff = (a: Date, b: Date) => Math.round((+a - +b) / DAY);
export const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const monday = (d: Date) => addD(d, -((d.getDay() + 6) % 7));
export const isWE = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
export const iso = (d: Date): string => gx().iso(d);
export const isoAdd = (s: string, n: number) => iso(addD(P(s), n));
export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MSHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const DOW = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const range = (a: string, b: string) => (a === b ? gx().fmt.date(P(a)) : `${gx().fmt.date(P(a))} → ${gx().fmt.date(P(b))}`);

export type View = 'week' | 'month';
export interface Period { s: Date; e: Date; m0?: Date; m1?: Date; title: string }
/** Période affichée (semaine du lundi au dimanche ; mois = semaines entières qui le couvrent). */
export function period(a: Date, view: View): Period {
  if (view === 'week') {
    const s = monday(a), e6 = addD(s, 6);
    const title = s.getMonth() === e6.getMonth() ? `${s.getDate()} – ${e6.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}` : `${s.getDate()} ${MSHORT[s.getMonth()]} – ${e6.getDate()} ${MSHORT[e6.getMonth()]} ${e6.getFullYear()}`;
    return { s, e: addD(s, 7), title };
  }
  const m0 = new Date(a.getFullYear(), a.getMonth(), 1), m1 = addM(m0, 1);
  return { s: monday(m0), e: addD(monday(addD(m1, -1)), 7), m0, m1, title: `${cap(MONTHS[m0.getMonth()])} ${m0.getFullYear()}` };
}

// ---------------------------------------------------------------- règles d'accès (routes/equipment.ts, routes/equipmentBookings.ts)
/** Catalogue : `canManageCatalog` de pages/Material.tsx = `MANAGE_ROLES` de routes/equipment.ts. */
export const canManageCatalog = (role?: string) => role === 'Master' || role === 'Administrator' || role === 'Director';
/** Réservations : BOOKING_ROLES du serveur (auth/roles.ts, 09/10/2026) — le Guest reste en lecture seule. */
export const canBook = (role?: string) => ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager'].includes(role || '');

// ---------------------------------------------------------------- champ Site d'une réservation
/**
 * Options du champ Site : GROUPE BONY, les sites des 4 plaques (`PLAQUES_STRUCTURE`, même ordre que
 * la page actuelle), puis Nissan (entité GLOBALE).
 * ⚠️ ÉCART VOULU (maquette) : la page actuelle propose aussi un pseudo-site « Alpine », contraire à la
 * règle « Alpine PAR SITE » (CLAUDE.md, BUGS-CONNUS.md) — retiré. Une réservation existante qui le
 * porte encore l'affiche (option conservée en tête) : on ne réécrit jamais une valeur en silence.
 */
export const PLAQUES: Record<string, string[]> = PLAQUES_STRUCTURE as any;
export const KNOWN_SITES = ['GROUPE BONY', ...Object.values(PLAQUES).flat(), ...(SITES_HORS_PLAQUE as string[]), 'Nissan'];

// ---------------------------------------------------------------- DISPONIBILITÉ
/**
 * `getAvailability` de pages/Material.tsx, repris À L'IDENTIQUE (même règle, mêmes bornes incluses) :
 *  1. on ne garde que les réservations du MÊME matériel qui CHEVAUCHENT [début, fin], hors la
 *     réservation éditée ;
 *  2. pour chaque jour de la plage, on somme leurs quantités ; `maxUsed` = maximum journalier.
 * Disponible = max(0, stock − maxUsed). Les dates sont des jours 'yyyy-MM-dd' : l'ordre des
 * chaînes est celui des jours (la page les normalisait à minuit local, même résultat).
 * Seule différence : fin < début ne lève plus d'exception (`eachDayOfInterval` plantait l'écran,
 * inventaire § 11) — la plage est ramenée à son premier jour, comme la maquette.
 * Le serveur refait le contrôle dans une transaction (409) : il fait foi.
 */
export function getAvailability(bookings: EquipmentBooking[], equipmentId: string, startDateStr: string, endDateStr: string, excludeBookingId?: string) {
  const start = startDateStr, end = endDateStr < startDateStr ? startDateStr : endDateStr;
  const relevant = bookings.filter((b) => {
    if (b.equipmentId !== equipmentId) return false;
    if (excludeBookingId && b.id === excludeBookingId) return false;
    return start <= b.endDate && end >= b.startDate;
  });
  let maxUsed = 0;
  for (let d = start, n = 0; d <= end && n < 3700; d = isoAdd(d, 1), n++) {
    let usedOnDay = 0;
    for (const b of relevant) if (d >= b.startDate && d <= b.endDate) usedOnDay += b.quantity;
    if (usedOnDay > maxUsed) maxUsed = usedOnDay;
  }
  return { maxUsed };
}
export const available = (bookings: EquipmentBooking[], eq: Equipment | undefined, start: string, end: string, exclude?: string) =>
  eq && start ? Math.max(0, eq.totalQuantity - getAvailability(bookings, eq.id, start, end || start, exclude).maxUsed) : 0;
/** Quantité réservée d'un matériel un jour donné (bande « jour par jour » du formulaire). */
export const usedOn = (bookings: EquipmentBooking[], eqId: string, day: string, exclude?: string) =>
  bookings.reduce((s, b) => (b.equipmentId === eqId && b.id !== exclude && b.startDate <= day && b.endDate >= day ? s + b.quantity : s), 0);

/**
 * Occupation par matériel et par jour, calculée UNE fois par liste de réservations (jauges du
 * calendrier : sinon matériel × jours × réservations à chaque rendu). Même somme que `usedOn`.
 * Le stock est commun à tout le réseau : jamais filtré par le périmètre.
 */
export type Usage = Map<string, Map<string, number>>;
export function buildUsage(bookings: EquipmentBooking[]): Usage {
  const u: Usage = new Map();
  for (const b of bookings) {
    if (!b.startDate || !b.endDate) continue;
    let m = u.get(b.equipmentId); if (!m) u.set(b.equipmentId, (m = new Map()));
    for (let d = b.startDate, n = 0; d <= b.endDate && n < 3700; d = isoAdd(d, 1), n++) m.set(d, (m.get(d) || 0) + b.quantity);
  }
  return u;
}
export const usedFrom = (u: Usage, eqId: string, day: string) => u.get(eqId)?.get(day) || 0;

// ---------------------------------------------------------------- empilement des barres (même algorithme que la maquette)
export interface Item { b: EquipmentBooking; s: Date; e: Date; c: string }
export interface Seg { it: Item; a: number; b: number; cl: boolean; cr: boolean; lane: number }
export function pack(items: Item[], s0: Date, e0: Date) {
  const N = diff(e0, s0);
  const segs: Seg[] = items.filter((it) => it.e >= s0 && it.s < e0).map((it) => ({ it, a: Math.max(0, diff(it.s, s0)), b: Math.min(N - 1, diff(it.e, s0)), cl: it.s < s0, cr: it.e >= e0, lane: 0 }))
    .sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a));
  const ends: number[] = [];
  segs.forEach((sg) => { let l = ends.findIndex((e) => e < sg.a); if (l < 0) { l = ends.length; ends.push(-1); } ends[l] = sg.b; sg.lane = l; });
  return { segs, lanes: ends.length };
}

/** Couleur d'accent = SERVICE de la réservation (`serviceAccent` de la page actuelle). */
export const colorOf = (b: EquipmentBooking): string => gx().data.SERVICE_COLOR[b.service] || gx().data.SERVICE_COLOR['Tous Services'];

/** Périmètre global de la coque : filtre l'AFFICHAGE seulement (maquette), jamais la disponibilité. */
export function perOk(b: EquipmentBooking) {
  const per = gx().ctx.perimetre; if (!per || per === 'Tout le réseau') return true;
  if (per === 'Nissan') return b.site === 'Nissan' || (gx().data.NISSAN_ONLY as string[]).includes(b.site);
  // [GEARBOX] 09/10/2026 : une réservation « GROUPE BONY » concerne tout le réseau — visible sous chaque périmètre.
  return b.site === per || b.site === 'GROUPE BONY';
}
