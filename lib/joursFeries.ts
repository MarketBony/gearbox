/**
 * JOURS FÉRIÉS FRANÇAIS — calculés, jamais saisis.
 *
 * La maquette du boss de Théo ne les connaissait pas : un 14 juillet posé comptait comme
 * un jour de congé, et une semaine à férié était surestimée d'un jour. On les calcule
 * donc, ce qui évite une table à maintenir tous les ans.
 *
 * ⚠️ UN SEUL férié est réellement calculé : Pâques. Les dix autres en découlent (lundi de
 * Pâques, Ascension, lundi de Pentecôte) ou sont à date fixe. C'est donc la seule ligne
 * qui mérite d'être vérifiée sur plusieurs années.
 *
 * ⚠️ Alsace-Moselle (Vendredi saint, 26 décembre) n'est PAS incluse : le groupe Bony est
 * en Auvergne, Occitanie et Rhône-Alpes. À ajouter le jour où une concession y ouvre —
 * ce serait alors un férié PAR SITE, donc un autre sujet.
 */

/** Une date locale en 'YYYY-MM-DD', sans passer par l'UTC (piège du décalage J-1). */
const cle = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Dimanche de Pâques — algorithme de Meeus/Jones/Butcher (calendrier grégorien).
 *
 * ⚠️ Ne pas « simplifier » : chaque terme compte, et une erreur se verrait une année sur
 * dix seulement. Vérifié sur 2026 (5 avril) et 2027 (28 mars).
 */
const paques = (annee: number): Date => {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = avril
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour);
};

const decale = (d: Date, jours: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + jours);
  return r;
};

/** Cache par année : le calcul est trivial, mais il est appelé par cellule de planning. */
const cache = new Map<number, Map<string, string>>();

/** Les 11 fériés d'une année, indexés par 'YYYY-MM-DD' → libellé. */
export const feriesDe = (annee: number): Map<string, string> => {
  const connu = cache.get(annee);
  if (connu) return connu;

  const p = paques(annee);
  const m = new Map<string, string>([
    [`${annee}-01-01`, 'Jour de l’an'],
    [cle(decale(p, 1)), 'Lundi de Pâques'],
    [`${annee}-05-01`, 'Fête du Travail'],
    [`${annee}-05-08`, 'Victoire 1945'],
    [cle(decale(p, 39)), 'Ascension'],
    [cle(decale(p, 50)), 'Lundi de Pentecôte'],
    [`${annee}-07-14`, 'Fête nationale'],
    [`${annee}-08-15`, 'Assomption'],
    [`${annee}-11-01`, 'Toussaint'],
    [`${annee}-11-11`, 'Armistice 1918'],
    [`${annee}-12-25`, 'Noël'],
  ]);
  cache.set(annee, m);
  return m;
};

/** Libellé du férié, ou `null`. Accepte 'YYYY-MM-DD'. */
export const ferieDe = (jour: string): string | null => {
  const annee = Number(jour.slice(0, 4));
  if (!Number.isFinite(annee)) return null;
  return feriesDe(annee).get(jour) ?? null;
};

/** Samedi ou dimanche. Construit la date en LOCAL, jamais en UTC (décalage J-1). */
export const estWeekend = (jour: string): boolean => {
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(a, m - 1, j).getDay();
  return d === 0 || d === 6;
};

/**
 * Jour NON travaillé : week-end ou férié.
 *
 * ⚠️ SEULE PORTE du comptage et de l'affichage. Un jour chômé n'est ni cliquable, ni
 * compté — si cette fonction et le comptage divergeaient, le total d'une ligne ne
 * correspondrait plus à ce que l'écran montre.
 */
export const estChome = (jour: string): boolean => estWeekend(jour) || ferieDe(jour) !== null;

/** Les jours ouvrés d'une plage 'YYYY-MM-DD' incluse, week-ends et fériés retirés. */
export const joursOuvres = (debut: string, fin: string): string[] => {
  const sortie: string[] = [];
  const [a, m, j] = debut.split('-').map(Number);
  const d = new Date(a, m - 1, j);
  const [af, mf, jf] = fin.split('-').map(Number);
  const f = new Date(af, mf - 1, jf);
  while (d <= f && sortie.length < 400) {
    const k = cle(d);
    if (!estChome(k)) sortie.push(k);
    d.setDate(d.getDate() + 1);
  }
  return sortie;
};
