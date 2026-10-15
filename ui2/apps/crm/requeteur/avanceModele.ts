/**
 * Mode avancé du Requêteur — modèle (contrat : ../CONTRAT-API.md § « Mode avancé du Requêteur (15/10/2026) »).
 * Groupes de conditions (ET entre groupes, ET / OU dans un groupe, UN seul niveau), liste collée. Le serveur tient la
 * liste FERMÉE des champs et opérateurs (`referentiels.champs`) ; ici, seulement les libellés, la complétude et l'envoi.
 * ⚠️ Pas d'import de valeurs depuis ./modele (il importe ce fichier) : seulement des types.
 */

export type Portee = 'client' | 'meme_vehicule' | 'un_vehicule' | 'aucun_vehicule';
export type TypeChamp = 'texte' | 'liste' | 'tableau' | 'nombre' | 'date' | 'booleen';
export interface Champ { cle: string; libelle: string; groupe: string; type: TypeChamp; portee: 'client' | 'vehicule'; operateurs: string[]; suggestions: boolean }
export interface Condition {
  id: string; champ: string; op: string; actif?: boolean;
  valeurs?: string[]; n?: number | string; min?: number | string; max?: number | string; de?: string; a?: string; unite?: 'jours' | 'mois' | 'annees';
}
export interface Groupe { id: string; portee: Portee; mode: 'et' | 'ou'; exclure?: boolean; actif?: boolean; conditions: Condition[] }
export interface Liste { type: 'vin' | 'immat' | 'nom' | 'id_spark'; valeurs: string[]; exclure?: boolean }
export interface Details { base: number; groupes: { apres: number; conditions: number[] }[]; liste: number | null }

/** Champs du serveur (`referentiels.champs`), inscrits au chargement des référentiels : `toRequete` en a besoin. */
let CHAMPS: Champ[] = [];
export const setChamps = (c: Champ[] | undefined) => { if (c?.length) CHAMPS = c; };
export const champsConnus = () => CHAMPS;

let seq = 0;
export const aid = (p = 'g') => `${p}${Date.now().toString(36)}${++seq}`;
const has = (x: unknown) => x !== null && x !== undefined && x !== '';

// ---------------------------------------------------------------- libellés
export const PORTEE_L: Record<Portee, string> = { client: 'le client', meme_vehicule: 'le même véhicule', un_vehicule: 'au moins un véhicule', aucun_vehicule: 'aucun véhicule' };
export const LISTE_L: Record<Liste['type'], string> = { vin: 'VIN', immat: 'Immatriculations', nom: 'Noms', id_spark: 'Identifiants SPARK' };
export const UNITE_L: Record<string, string> = { jours: 'jours', mois: 'mois', annees: 'années' };
export const MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const OP_L: Record<string, string> = {
  est: 'est', n_est_pas: 'n’est pas', contient: 'contient', ne_contient_pas: 'ne contient pas', commence_par: 'commence par', finit_par: 'finit par',
  vide: 'est vide', non_vide: 'n’est pas vide', est_un_de: 'est l’un de', aucun_de: 'n’est aucun de', contient_un_de: 'contient l’un de',
  eq: '=', ne: '≠', gt: '>', ge: '≥', lt: '<', le: '≤', entre: 'entre', avant: 'avant le', apres: 'après le',
  prochains: 'dans les prochains', derniers: 'il y a entre', il_y_a_plus_de: 'il y a plus de', mois_annee: 'tombe en (mois)', vrai: 'oui', faux: 'non',
};
export const opL = (op: string, type?: TypeChamp) => (op === 'entre' && type === 'date' ? 'entre le … et le' : op === 'aucun_de' && type === 'tableau' ? 'ne contient aucun de' : OP_L[op] || op);

// ---------------------------------------------------------------- complétude et envoi
const VALS = ['est', 'n_est_pas', 'contient', 'ne_contient_pas', 'commence_par', 'finit_par', 'est_un_de', 'aucun_de', 'contient_un_de', 'mois_annee'];
const NUL = ['vide', 'non_vide', 'vrai', 'faux'];
/** Une condition incomplète n'est PAS envoyée (le serveur répondrait 400) : elle s'affiche « à compléter ». */
export function complete(c: Condition, ch: Champ | undefined): boolean {
  if (!ch || !ch.operateurs.includes(c.op)) return false;
  if (NUL.includes(c.op)) return true;
  if (VALS.includes(c.op)) return !!(c.valeurs || []).some((x) => String(x).trim());
  if (['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'il_y_a_plus_de'].includes(c.op)) return has(c.n);
  if (c.op === 'entre') return ch.type === 'date' ? !!(c.de && c.a) : has(c.min) && has(c.max);
  if (c.op === 'avant' || c.op === 'apres') return !!c.de;
  if (c.op === 'prochains' || c.op === 'derniers') return has(c.min) && has(c.max);
  return false;
}
/** Condition → contrat : seulement les paramètres de son opérateur. */
function nette(c: Condition, ch: Champ): Condition {
  const o: Condition = { id: c.id, champ: c.champ, op: c.op, actif: c.actif !== false };
  if (VALS.includes(c.op)) o.valeurs = (c.valeurs || []).map((x) => String(x).trim()).filter(Boolean);
  if (['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'il_y_a_plus_de'].includes(c.op)) o.n = Number(c.n);
  if (c.op === 'entre' && ch.type !== 'date') { o.min = Number(c.min); o.max = Number(c.max); }
  if (c.op === 'entre' && ch.type === 'date') { o.de = c.de; o.a = c.a; }
  if (c.op === 'avant' || c.op === 'apres') o.de = c.de;
  if (c.op === 'prochains' || c.op === 'derniers') { o.min = Number(c.min); o.max = Number(c.max); }
  if (['prochains', 'derniers', 'il_y_a_plus_de'].includes(c.op)) o.unite = c.unite || 'mois';
  return o;
}
/** Où se trouve chaque groupe / condition de l'écran dans ce qui part au serveur (pour lire `details`). */
export interface Carte { g: Record<string, { i: number; c: Record<string, number> }> }
/** Groupes envoyés : conditions complètes seulement ; un groupe sans condition complète ne part pas (vide = vrai, et
 *  « exclure » d'un groupe vide retirerait TOUT le monde). */
export function envoi(groupes: Groupe[] | undefined, champs: Champ[] | undefined = CHAMPS): { groupes: Groupe[]; carte: Carte } {
  // Champs pas encore chargés : on renvoie les groupes tels quels plutôt que de les perdre (enregistrement d'une requête).
  if (!champs?.length) return { groupes: (groupes || []).filter((g) => g.conditions.length), carte: { g: {} } };
  const by = new Map((champs || []).map((c) => [c.cle, c])), out: Groupe[] = [], carte: Carte = { g: {} };
  for (const g of groupes || []) {
    const cs: Condition[] = [], m: Record<string, number> = {};
    for (const c of g.conditions) { const ch = by.get(c.champ); if (complete(c, ch)) { m[c.id] = cs.length; cs.push(nette(c, ch!)); } }
    if (!cs.length) continue;
    carte.g[g.id] = { i: out.length, c: m };
    out.push({ id: g.id, portee: g.portee, mode: g.mode, exclure: !!g.exclure, actif: g.actif !== false, conditions: cs });
  }
  return { groupes: out, carte };
}
/** Contrat → écran : identifiants garantis. */
export const lireGroupes = (gs: Groupe[] | undefined): Groupe[] => (gs || []).map((g) => ({
  ...g, id: g.id || aid('g'), mode: g.mode === 'ou' ? 'ou' : 'et', conditions: (g.conditions || []).map((c) => ({ ...c, id: c.id || aid('c') })),
}));
export const nouvelleCondition = (): Condition => ({ id: aid('c'), champ: '', op: '', actif: true });
export const nouveauGroupe = (exclure = false): Groupe => ({ id: aid('g'), portee: exclure ? 'un_vehicule' : 'meme_vehicule', mode: 'et', exclure, actif: true, conditions: [nouvelleCondition()] });

// ---------------------------------------------------------------- phrase (résumé)
const dFR = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '…');
const ou = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} ou ${a[a.length - 1]}`);
export function condPhrase(c: Condition, ch: Champ | undefined): string {
  if (!ch) return '';
  const l = ch.libelle.charAt(0).toLowerCase() + ch.libelle.slice(1), u = UNITE_L[c.unite || 'mois'];
  switch (c.op) {
    case 'vrai': return l;
    case 'faux': return `sans ${l}`;
    case 'vide': return `${l} vide`;
    case 'non_vide': return `${l} renseigné`;
    case 'mois_annee': return `${l} en ${ou((c.valeurs || []).map((m) => MOIS_L[+m - 1] || m))}`;
    case 'entre': return ch.type === 'date' ? `${l} entre le ${dFR(c.de)} et le ${dFR(c.a)}` : `${l} entre ${c.min} et ${c.max}`;
    case 'avant': case 'apres': return `${l} ${opL(c.op)} ${dFR(c.de)}`;
    case 'prochains': return `${l} dans les ${c.min} à ${c.max} prochains ${u}`;
    case 'derniers': return `${l} il y a ${c.min} à ${c.max} ${u}`;
    case 'il_y_a_plus_de': return `${l} il y a plus de ${c.n} ${u}`;
  }
  if (VALS.includes(c.op)) return `${l} ${opL(c.op, ch.type)} ${ou(c.valeurs || [])}`;
  return `${l} ${opL(c.op, ch.type)} ${c.n ?? ''}`.trim();
}
/** Une phrase par groupe actif (« un même véhicule dont le modèle commence par CLIO ou CAPTUR, … »). */
export function groupesPhrase(groupes: Groupe[] | undefined, champs: Champ[] | undefined = CHAMPS, liste: Liste | null | undefined): string[] {
  const by = new Map((champs || []).map((c) => [c.cle, c])), out: string[] = [];
  for (const g of groupes || []) {
    if (g.actif === false) continue;
    const cs = g.conditions.filter((c) => c.actif !== false && complete(c, by.get(c.champ))).map((c) => condPhrase(c, by.get(c.champ)));
    if (!cs.length) continue;
    const corps = cs.join(g.mode === 'ou' ? ' OU ' : ', ');
    const sujet = g.portee === 'meme_vehicule' ? 'un même véhicule' : g.portee === 'un_vehicule' ? 'au moins un véhicule' : g.portee === 'aucun_vehicule' ? 'aucun véhicule' : '';
    out.push(g.exclure ? `sauf ceux dont ${sujet || 'la fiche'} remplit : ${corps}` : sujet ? `${sujet} dont ${corps}` : corps);
  }
  if (liste?.valeurs.length) out.push(`${liste.exclure ? 'hors' : 'parmi'} une liste de ${liste.valeurs.length.toLocaleString('fr-FR')} ${LISTE_L[liste.type].toLowerCase()}`);
  return out;
}
