import React from 'react';
import { gx } from '../../ui/kit';
import { FAM_C, brandHex, brandName, dFR } from '../common';

/**
 * Requêteur de SPARK — modèle : types du contrat (CONTRAT-API.md § « Lot 3 »), catalogue des briques, canaux, recettes.
 * Maquette validée : maquettes/crm/v2/requeteur.js (TY, CANAL, RECIPES).
 *
 * ⚠️ Le serveur ne connaît qu'une liste FERMÉE de briques : ce qui part (`toRequete`) est EXACTEMENT le format du contrat
 * (type + paramètres nommés comme dans le contrat). L'état d'écran (`UB.p`) garde en plus les modes d'édition (« Il y a… /
 * Anniversaire / Entre deux dates »…) ; `out` le traduit, `inn` le relit (requêtes enregistrées, recettes).
 * Une brique incomplète (liste vide, aucune borne) n'est PAS envoyée : elle ne filtre rien (« peu importe »), et le
 * serveur la refuserait (400).
 */

// ---------------------------------------------------------------- contrat
export type Canal = 'tous' | 'email' | 'sms' | 'phoning' | 'courrier';
export type Format = 'excel' | 'sarbacane' | 'allmysms' | 'phoning' | 'courrier';
export interface Brique { id: string; type: string; actif: boolean; sauf?: boolean; [k: string]: unknown }
export interface Requete { niveau: 'client' | 'vehicule'; canal: Canal; dedoublonnage: boolean; briques: Brique[] }
export interface Colonne { cle: string; libelle: string; groupe: string }
export interface Referentiels {
  zones: { concession: string; departements: string[] }[]; agents: string[]; vendeurs: string[]; marques: string[];
  familles: string[]; types_vente: string[]; sites: string[]; colonnes: Colonne[];
}
export interface KN { cle: string; n: number }
export interface Compte {
  clients: number; vehicules: number; lignes: number;
  entonnoir: { total: number; email: number; portable: number; telephone: number; adresse: number };
  avant_canal: number; doublons_retires: number;
  par_site: KN[]; par_marque: KN[]; par_mois_echeance: KN[]; par_energie: KN[]; ms: number;
}
export type Ligne = { client_id: number; [cle: string]: any };
export interface ExportJ { id: number; cree_le: string; auteur: string; format: Format; fichier: string; requete_nom: string | null; nb_lignes: number }
export interface Enregistree {
  id: number; nom: string; requete: Requete; partagee: boolean; auteur: string; auteur_id: string | number;
  cree_le: string; maj_le: string; dernier_compte: number | null; dernier_lancement: string | null;
}

// ---------------------------------------------------------------- état d'écran
export type Fam = 'client' | 'veh' | 'achat' | 'fin' | 'coord' | 'sauf';
/** Brique à l'écran : `t` = type du contrat (ou brique d'écran : generic, lot4_*), `p` = paramètres d'édition. */
export interface UB { id: string; t: string; p: Record<string, any>; on: boolean; sauf?: boolean; per?: boolean }
export interface Q { name: string; bricks: UB[]; level: 'client' | 'vehicule'; canal: Canal; dedupe: boolean; savedId: number | null; from: string | null }

let seq = 0;
export const nid = () => `b${Date.now().toString(36)}${++seq}`;

// ---------------------------------------------------------------- petits rendus de phrase
export const has = (x: unknown) => x !== null && x !== undefined && x !== '';
const b_ = (v: React.ReactNode) => <b>{v}</b>;
const ou = (a: string[], map: (x: string) => string = (x) => x) => a.map((x, i) => (
  <React.Fragment key={i}>{i ? (i === a.length - 1 ? ' ou ' : ', ') : ''}<b>{map(x)}</b></React.Fragment>
));
const span = (a: any, b: any, u: string) => (has(a) && has(b) ? (+a === +b ? `${a} ${u}` : `de ${a} à ${b} ${u}`) : has(a) ? `plus de ${a} ${u}` : has(b) ? `moins de ${b} ${u}` : 'peu importe');
const dans = (a: any, b: any, u: string) => ((!has(a) || +a === 0) && has(b) ? `dans les ${b} ${u}` : has(a) && has(b) ? `dans ${a} à ${b} ${u}` : has(a) ? `dans plus de ${a} ${u}` : 'à n’importe quelle date');
const n0 = (x: any) => (has(x) ? Number(x).toLocaleString('fr-FR') : '');
const num = (x: any) => (has(x) ? Number(x) : undefined);
const lst = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const rng = (p: any, a = 'min', b = 'max', ka = 'min', kb = 'max', k = 1) => (has(p[a]) || has(p[b]) ? clean({ [ka]: has(p[a]) ? +p[a] * k : undefined, [kb]: has(p[b]) ? +p[b] * k : undefined }) : null);
const vals = (p: any) => (p.v?.length ? { valeurs: p.v } : null);

// ---------------------------------------------------------------- libellés
export const RULE_AGENT = <><b>Règle Bony :</b> pour un événement en concession, on ne prend <b>que les clients sans agent</b> ; pour une opération chez un agent, <b>uniquement ses clients</b>. On n’envoie pas nos clients chez les agents.</>;
export const CIV_L: Record<string, string> = { femme: 'Madame', homme: 'Monsieur', couple: 'Couple', societe: 'Professionnel' };
export const SRC_L: Record<string, string> = { VN: 'VN', VO: 'VO', BSO: 'Ancienne base' };
const DEPS: Record<string, string> = { '03': 'Allier', '07': 'Ardèche', 12: 'Aveyron', 15: 'Cantal', 19: 'Corrèze', 23: 'Creuse', 42: 'Loire', 43: 'Haute-Loire', 46: 'Lot', 48: 'Lozère', 58: 'Nièvre', 63: 'Puy-de-Dôme', 71: 'Saône-et-Loire', 81: 'Tarn', 82: 'Tarn-et-Garonne' };
export const depL = (d: string) => (DEPS[d] ? `${d} ${DEPS[d]}` : d);
const depOpts = (R: Referentiels | null) => [...new Set([...Object.keys(DEPS).map((k) => k.padStart(2, '0')), ...(R?.zones || []).flatMap((z) => z.departements || [])])].sort();
const TV_L: Record<string, string> = { 'VENTE A PARTICU': 'À un particulier', 'VENTE A SOCIETE': 'À une société' };
const tvL = (v: string) => TV_L[v] || v;
const lower1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const FAMS_DEF = ['LOA', 'LLD', 'Crédit', 'Crédit-bail', 'Crédit ballon'];

export const FAMS: Record<Fam, { l: string; i: string; c: string }> = {
  client: { l: 'Client', i: 'user', c: '#5b7fd6' },
  veh: { l: 'Véhicule', i: 'car', c: '#14b8a6' },
  achat: { l: 'Achat', i: 'tag', c: '#f75632' },
  fin: { l: 'Financement', i: 'euro', c: '#8b5cf6' },
  coord: { l: 'Coordonnées', i: 'mail', c: '#d97706' },
  sauf: { l: 'Sauf', i: 'minus', c: 'var(--danger)' },
};
export const FAM_ORDER = Object.keys(FAMS) as Fam[];

// ---------------------------------------------------------------- champs d'édition
type R_ = Referentiels | null;
type Show = (p: any) => boolean;
export interface PickItem { v: string; l: string; hint?: string; color?: string }
export interface PickGroup { label?: string; collapsible?: boolean; toggleAll?: boolean; items: PickItem[] }
export type Field =
  | { t: 'chips'; k: string; l: string; opts: (R: R_) => string[]; all?: string; colors?: (R: R_) => Record<string, string>; label?: (v: string) => string; show?: Show }
  | { t: 'seg'; k: string; l: string; opts: [string, string][]; show?: Show }
  | { t: 'pick1'; k: string; l: string; i: string; opts: (R: R_) => PickItem[]; show?: Show }
  | { t: 'pick'; k: string; l: string; i: string; groups: (R: R_) => PickGroup[]; all?: string; show?: Show }
  | { t: 'sites'; k: string; l: string; show?: Show }
  | { t: 'range'; a: string; b: string; l: string; u: string; show?: Show }
  | { t: 'num'; k: string; l: string; u: string; show?: Show }
  | { t: 'dates'; a: string; b: string; l: string; show?: Show }
  | { t: 'text'; k: string; l: string; ph: (p: any) => string; show?: Show };

/** Sites du référentiel SPARK, rangés par plaque de la coque (le reste dans « Autres sites »). */
export const siteGroups = (R: R_): PickGroup[] => {
  const ref = R?.sites || [], left = new Set(ref), out: PickGroup[] = [];
  const plaques: Record<string, string[]> = gx()?.data?.PLAQUES || {};
  Object.entries(plaques).forEach(([pl, sites]) => {
    const items = sites.filter((s) => left.has(s)); items.forEach((s) => left.delete(s));
    if (items.length) out.push({ label: pl, collapsible: true, toggleAll: true, items: items.map((s) => ({ v: s, l: s })) });
  });
  if (left.size) out.push({ label: out.length ? 'Autres sites' : undefined, items: [...left].map((s) => ({ v: s, l: s })) });
  return out;
};
const flat = (a: string[] | undefined): PickGroup[] => [{ items: (a || []).map((v) => ({ v, l: v })) }];

export interface TDef {
  fam: Fam; l: string; scope: 'client' | 'line';
  def: (R: R_) => Record<string, any>;
  fields: Field[];
  say: (p: any) => React.ReactNode;
  /** Phrase quand la brique EXCLUT (`sauf`). */
  sayS?: (p: any) => React.ReactNode;
  /** Paramètres du contrat ; `null` = incomplète, non envoyée. */
  out?: (p: any) => Record<string, unknown> | null;
  /** Type du contrat quand il dépend du mode (livraison / anniversaire). */
  type?: (p: any) => string;
  /** Contrat → paramètres d'édition. */
  inn?: (B: Brique) => Record<string, any>;
  note?: React.ReactNode;
  /** Brique d'écran, jamais envoyée : `soon` = lot 4 (grisée), `locked` = appliquée d'office par le serveur. */
  ui?: 'soon' | 'locked'; lot?: string;
}
const innV = (B: Brique) => clean({ v: Array.isArray(B.valeurs) ? B.valeurs : undefined });
const innR = (B: Brique) => clean({ min: B.min ?? undefined, max: B.max ?? undefined });
const seg1 = (B: Brique) => clean({ v: Array.isArray(B.valeurs) ? (B.valeurs as string[])[0] : undefined });
const bool = (B: Brique) => ({ v: B.valeur === false ? 'non' : 'oui' });

export const TY: Record<string, TDef> = {
  // ------------------------------------------------------------ Client
  type_personne: { fam: 'client', l: 'Particulier ou professionnel', scope: 'client', def: () => ({ v: 'particulier' }),
    fields: [{ k: 'v', t: 'seg', l: 'Type de client', opts: [['particulier', 'Particulier'], ['societe', 'Professionnel']] }],
    say: (p) => <>Client {b_(p.v === 'societe' ? 'professionnel' : 'particulier')}</>,
    sayS: (p) => <>Sauf les {b_(p.v === 'societe' ? 'professionnels' : 'particuliers')}</>,
    out: (p) => ({ valeurs: [p.v] }), inn: seg1 },
  civilite: { fam: 'client', l: 'Civilité', scope: 'client', def: () => ({ v: ['femme', 'homme'] }),
    fields: [{ k: 'v', t: 'chips', l: 'Civilité (normalisée)', opts: () => Object.keys(CIV_L), label: (v) => CIV_L[v] || v, all: 'Toutes' }],
    say: (p) => (p.v.length ? <>Civilité : {ou(p.v, (x) => CIV_L[x] || x)}</> : 'Toutes civilités'), out: vals, inn: innV },
  site_client: { fam: 'client', l: 'Site du client', scope: 'client', def: (R) => ({ v: R?.sites.includes('Clermont') ? ['Clermont'] : [], mode: 'dernier' }),
    fields: [{ k: 'mode', t: 'seg', l: 'Rattachement', opts: [['dernier', 'Dernier achat sur ce site'], ['achat', 'A déjà acheté sur ce site']] },
      { k: 'v', t: 'sites', l: 'Site(s)' }],
    say: (p) => (!p.v.length ? 'Client de n’importe quel site' : p.mode === 'achat' ? <>A déjà acheté à {ou(p.v)}</> : <>Client du site de {ou(p.v)}</>),
    sayS: (p) => (!p.v.length ? 'Sauf… (aucun site choisi)' : p.mode === 'achat' ? <>Sauf les clients ayant acheté à {ou(p.v)}</> : <>Sauf les clients de {ou(p.v)}</>),
    out: (p) => (p.v.length ? { valeurs: p.v, mode: p.mode === 'achat' ? 'achat' : 'dernier' } : null),
    inn: (B) => clean({ v: B.valeurs, mode: B.mode === 'achat' ? 'achat' : 'dernier' }) },
  geo: { fam: 'client', l: 'Lieu d’habitation', scope: 'client', def: () => ({ mode: 'dep', deps: ['63'], txt: '' }),
    fields: [{ k: 'mode', t: 'seg', l: 'Chercher par', opts: [['dep', 'Département'], ['cp', 'Code postal'], ['ville', 'Ville']] },
      { k: 'deps', t: 'chips', l: 'Départements', opts: depOpts, label: depL, all: 'Tous', show: (p) => p.mode === 'dep' },
      { k: 'txt', t: 'text', l: 'Valeurs (séparées par des virgules)', ph: (p) => (p.mode === 'cp' ? '63000, 63100, 03200' : 'Riom, Vichy, Rodez'), show: (p) => p.mode !== 'dep' }],
    say: (p) => { const L = lst(p.txt || '');
      return p.mode === 'dep' ? (p.deps.length ? <>Habite dans le {ou(p.deps, depL)}</> : 'Habite n’importe où') : !L.length ? 'Habite n’importe où' : p.mode === 'cp' ? <>Code postal {ou(L)}</> : <>Habite à {ou(L)}</>; },
    out: (p) => { if (p.mode === 'dep') return p.deps.length ? { departements: p.deps } : null; const L = lst(p.txt || ''); return L.length ? (p.mode === 'cp' ? { cps: L } : { villes: L }) : null; },
    inn: (B) => (Array.isArray(B.cps) && B.cps.length ? { mode: 'cp', txt: (B.cps as string[]).join(', ') } : Array.isArray(B.villes) && B.villes.length ? { mode: 'ville', txt: (B.villes as string[]).join(', ') } : { mode: 'dep', deps: B.departements || [] }) },
  zone: { fam: 'client', l: 'Zone de la concession', scope: 'client', def: (R) => ({ v: R?.zones.find((z) => z.concession === 'Clermont')?.concession || R?.zones[0]?.concession || 'Clermont' }),
    fields: [{ k: 'v', t: 'pick1', l: 'Concession (sa zone de chalandise s’applique d’office)', i: 'pin', opts: (R) => (R?.zones || []).map((z) => ({ v: z.concession, l: z.concession, hint: (z.departements || []).join(', ') })) }],
    say: (p) => <>Client domicilié dans la zone de {b_(p.v || '…')}</>,
    out: (p) => (p.v ? { concession: p.v } : null), inn: (B) => clean({ v: B.concession }) },
  anciennete: { fam: 'client', l: 'Ancienneté du client', scope: 'client', def: () => ({ min: 10, max: '' }),
    fields: [{ t: 'range', a: 'min', b: 'max', l: 'Client depuis', u: 'ans' }],
    say: (p) => <>Client depuis {b_(span(p.min, p.max, 'ans'))}</>, out: (p) => rng(p), inn: innR },
  flotte: { fam: 'client', l: 'Taille de flotte', scope: 'client', def: () => ({ min: 3, max: '' }),
    fields: [{ t: 'range', a: 'min', b: 'max', l: 'Véhicules encore au parc (achetés chez nous, pas revendus)', u: 'véhicules' }],
    say: (p) => (has(p.min) && !has(p.max) ? <>Flotte de {b_(`${p.min} véhicule${p.min > 1 ? 's' : ''} ou plus`)} au parc</> : <>Flotte de {b_(span(p.min, p.max, 'véhicules'))} au parc</>),
    out: (p) => rng(p), inn: innR },
  nb_vehicules: { fam: 'client', l: 'Véhicules achetés (depuis toujours)', scope: 'client', def: () => ({ min: 2, max: '' }),
    fields: [{ t: 'range', a: 'min', b: 'max', l: 'Véhicules achetés par le client', u: 'véhicules' }],
    say: (p) => (has(p.min) && !has(p.max) ? <>Possède {b_(`${p.min} véhicule${p.min > 1 ? 's' : ''} ou plus`)}</> : <>Possède {b_(span(p.min, p.max, 'véhicules'))}</>),
    out: (p) => rng(p), inn: innR },
  vendeur_client: { fam: 'client', l: 'Vendeur référent', scope: 'client', def: () => ({ v: [] }),
    fields: [{ k: 'v', t: 'pick', l: 'Vendeur référent (celui de la dernière vente)', i: 'user', groups: (R) => flat(R?.vendeurs), all: 'Tous les vendeurs' }],
    say: (p) => (p.v.length ? <>Suivi par {ou(p.v)}</> : 'Suivi par n’importe quel vendeur'), out: vals, inn: innV },
  sources: { fam: 'client', l: 'Origine (VN, VO, ancienne base)', scope: 'client', def: () => ({ v: ['BSO'] }),
    fields: [{ k: 'v', t: 'chips', l: 'Connu par', opts: () => ['VN', 'VO', 'BSO'], label: (v) => SRC_L[v] || v, all: 'Toutes' }],
    say: (p) => (p.v.length ? <>Connu par {ou(p.v, (x) => (x === 'BSO' ? 'l’ancienne base Sud-Ouest' : `le ${x}`))}</> : 'Connu par n’importe quelle source'),
    sayS: (p) => (p.v.length ? <>Sauf les clients connus par {ou(p.v, (x) => (x === 'BSO' ? 'l’ancienne base' : `le ${x}`))}</> : 'Sauf… (aucune origine choisie)'),
    out: vals, inn: innV },

  // ------------------------------------------------------------ Véhicule
  marque: { fam: 'veh', l: 'Marque', scope: 'line', def: (R) => ({ v: R?.marques.includes('RENAULT') ? ['RENAULT'] : [] }),
    fields: [{ k: 'v', t: 'chips', l: 'Marque du véhicule', opts: (R) => R?.marques || [], label: brandName, colors: (R) => Object.fromEntries((R?.marques || []).map((m) => [m, brandHex(m)])), all: 'Toutes' }],
    say: (p) => (p.v.length ? <>Véhicule {ou(p.v, brandName)}</> : 'Véhicule de toute marque'), out: vals, inn: innV },
  modele: { fam: 'veh', l: 'Modèle', scope: 'line', def: () => ({ txt: 'CLIO' }),
    fields: [{ k: 'txt', t: 'text', l: 'Modèles (séparés par des virgules ; « CLIO » trouve aussi « CLIO V »)', ph: () => 'CLIO, CAPTUR, SANDERO' }],
    say: (p) => { const L = lst(p.txt || ''); return L.length ? <>Modèle {ou(L)}</> : 'Tous modèles'; },
    out: (p) => { const L = lst(p.txt || ''); return L.length ? { valeurs: L } : null; },
    inn: (B) => ({ txt: Array.isArray(B.valeurs) ? (B.valeurs as string[]).join(', ') : '' }) },
  energie: { fam: 'veh', l: 'Énergie', scope: 'line', def: () => ({ v: ['Électrique', 'Hybride'] }),
    fields: [{ k: 'v', t: 'chips', l: 'Énergie', opts: () => ['Essence', 'Diesel', 'Hybride', 'Électrique', 'GPL'], all: 'Toutes' }],
    say: (p) => (p.v.length ? <>Motorisation {ou(p.v, (x) => x.toLowerCase())}</> : 'Toute motorisation'), out: vals, inn: innV },
  genre: { fam: 'veh', l: 'Genre (VP / VU)', scope: 'line', def: () => ({ v: 'VU' }),
    fields: [{ k: 'v', t: 'seg', l: 'Genre', opts: [['VP', 'Particulier (VP)'], ['VU', 'Utilitaire (VU)']] }],
    say: (p) => (p.v === 'VU' ? <>Véhicule {b_('utilitaire (VU)')}</> : <>Véhicule {b_('particulier (VP)')}</>), out: (p) => ({ valeurs: [p.v] }), inn: seg1 },
  age_vehicule: { fam: 'veh', l: 'Âge du véhicule', scope: 'line', def: () => ({ min: 6, max: '' }),
    fields: [{ t: 'range', a: 'min', b: 'max', l: 'Âge depuis la 1re mise en circulation', u: 'ans' }],
    say: (p) => <>Véhicule de {b_(span(p.min, p.max, 'ans'))}</>, out: (p) => rng(p), inn: innR },
  au_parc: { fam: 'veh', l: 'Encore au parc ou revendu', scope: 'line', def: () => ({ v: 'oui' }),
    fields: [{ k: 'v', t: 'seg', l: 'Le client l’a-t-il encore ?', opts: [['oui', 'Encore au parc'], ['non', 'Revendu ou repris']] }],
    say: (p) => (p.v === 'oui' ? <>Véhicule {b_('encore au parc')} du client</> : <>Véhicule {b_('revendu ou repris')}</>), out: (p) => ({ valeur: p.v === 'oui' }), inn: bool },
  ct: { fam: 'veh', l: 'Prochain contrôle technique', scope: 'line', def: () => ({ min: 0, max: 2 }),
    fields: [{ t: 'range', a: 'min', b: 'max', l: 'Prochain CT dans', u: 'mois' }],
    say: (p) => <>Prochain contrôle technique {b_(dans(p.min, p.max, 'mois'))}</>,
    out: (p) => rng(p, 'min', 'max', 'dans_min_mois', 'dans_max_mois'), inn: (B) => clean({ min: B.dans_min_mois ?? undefined, max: B.dans_max_mois ?? undefined }) },

  // ------------------------------------------------------------ Achat
  achat_type: { fam: 'achat', l: 'Neuf ou occasion (VN, VO, ancienne base)', scope: 'line', def: () => ({ v: ['VN'] }),
    fields: [{ k: 'v', t: 'chips', l: 'Type d’achat', opts: () => ['VN', 'VO', 'BSO'], label: (v) => SRC_L[v] || v, all: 'Tous' }],
    say: (p) => (p.v.length ? <>Acheté en {ou(p.v, (x) => SRC_L[x] || x)}</> : 'Acheté en VN, VO ou ancienne base'), out: vals, inn: innV },
  livraison: { fam: 'achat', l: 'Date de livraison', scope: 'line', def: () => ({ mode: 'ago', min: 3, max: 4, n: 3, f: 30, from: '', to: '' }),
    fields: [{ k: 'mode', t: 'seg', l: 'Livré', opts: [['ago', 'Il y a…'], ['anniv', 'Anniversaire'], ['entre', 'Entre deux dates']] },
      { t: 'range', a: 'min', b: 'max', l: 'Il y a', u: 'ans', show: (p) => p.mode === 'ago' },
      { t: 'num', k: 'n', l: 'Anniversaire de livraison', u: 'ans', show: (p) => p.mode === 'anniv' },
      { t: 'num', k: 'f', l: 'À plus ou moins', u: 'jours', show: (p) => p.mode === 'anniv' },
      { t: 'dates', a: 'from', b: 'to', l: 'Livré entre le … et le …', show: (p) => p.mode === 'entre' }],
    say: (p) => (p.mode === 'anniv' ? <>Livré il y a {b_(`${has(p.n) ? p.n : '?'} ans`)}, anniversaire {b_(`à ± ${has(p.f) ? p.f : 30} jours`)}</>
      : p.mode === 'entre' ? <>Livré {p.from || p.to ? <>entre le {b_(dFR(p.from))} et le {b_(dFR(p.to))}</> : 'à n’importe quelle date'}</> : <>Livré il y a {b_(span(p.min, p.max, 'ans'))}</>),
    type: (p) => (p.mode === 'anniv' ? 'anniversaire' : 'livraison'),
    out: (p) => (p.mode === 'anniv' ? (has(p.n) ? { annees: +p.n, fenetre_jours: has(p.f) ? +p.f : 30 } : null)
      : p.mode === 'entre' ? (p.from || p.to ? clean({ de: p.from || undefined, a: p.to || undefined }) : null)
      : rng(p, 'min', 'max', 'il_y_a_min_mois', 'il_y_a_max_mois', 12)),
    inn: (B) => (B.type === 'anniversaire' ? clean({ mode: 'anniv', n: B.annees, f: B.fenetre_jours })
      : B.de || B.a ? { mode: 'entre', from: B.de || '', to: B.a || '' }
      : { mode: 'ago', min: has(B.il_y_a_min_mois) ? Math.round(+(B.il_y_a_min_mois as number) / 12 * 10) / 10 : '', max: has(B.il_y_a_max_mois) ? Math.round(+(B.il_y_a_max_mois as number) / 12 * 10) / 10 : '' }) },
  sans_achat_depuis: { fam: 'achat', l: 'Sans achat depuis…', scope: 'client', def: () => ({ n: 5 }),
    fields: [{ t: 'num', k: 'n', l: 'Dernier achat il y a plus de', u: 'ans' }],
    say: (p) => <>Dernier achat il y a {b_(`plus de ${has(p.n) ? p.n : '?'} ans`)}</>,
    out: (p) => (has(p.n) ? { annees: +p.n } : null), inn: (B) => clean({ n: B.annees }) },
  type_vente: { fam: 'achat', l: 'Type de vente', scope: 'line', def: (R) => ({ v: R?.types_vente.includes('VENTE A SOCIETE') ? ['VENTE A SOCIETE'] : [] }),
    fields: [{ k: 'v', t: 'chips', l: 'Type de vente DCS', opts: (R) => R?.types_vente || [], label: tvL, all: 'Tous' }],
    say: (p) => (p.v.length ? <>Vente {ou(p.v, (x) => lower1(tvL(x)))}</> : 'Tout type de vente'), out: vals, inn: innV },
  montant: { fam: 'achat', l: 'Montant tarif TTC', scope: 'line', def: () => ({ min: 30000, max: '' }),
    fields: [{ t: 'range', a: 'min', b: 'max', l: 'Montant tarif TTC (colonne DCS)', u: '€' }],
    say: (p) => <>Montant tarif TTC de {b_(span(has(p.min) ? n0(p.min) : '', has(p.max) ? n0(p.max) : '', '€'))}</>, out: (p) => rng(p), inn: innR },
  reprise: { fam: 'achat', l: 'Avec ou sans reprise', scope: 'line', def: () => ({ v: 'oui' }),
    fields: [{ k: 'v', t: 'seg', l: 'Reprise', opts: [['oui', 'Avec reprise'], ['non', 'Sans reprise']] }],
    say: (p) => <>Acheté {b_(p.v === 'oui' ? 'avec une reprise' : 'sans reprise')}</>, out: (p) => ({ valeur: p.v === 'oui' }), inn: bool },
  site_achat: { fam: 'achat', l: 'Site de l’achat', scope: 'line', def: (R) => ({ v: R?.sites.includes('Clermont') ? ['Clermont'] : [] }),
    fields: [{ k: 'v', t: 'sites', l: 'Site où le véhicule a été vendu' }],
    say: (p) => (p.v.length ? <>Acheté à {ou(p.v)}</> : 'Acheté sur n’importe quel site'), out: vals, inn: innV },
  vendeur_achat: { fam: 'achat', l: 'Vendeur de l’achat', scope: 'line', def: () => ({ v: [] }),
    fields: [{ k: 'v', t: 'pick', l: 'Vendeur de la vente', i: 'user', groups: (R) => flat(R?.vendeurs), all: 'Tous' }],
    say: (p) => (p.v.length ? <>Vendu par {ou(p.v)}</> : 'Vendu par n’importe quel vendeur'), out: vals, inn: innV },
  agent: { fam: 'achat', l: 'Vendu en direct ou par un agent', scope: 'line', note: RULE_AGENT, def: () => ({ mode: 'sans', v: [] }),
    fields: [{ k: 'mode', t: 'seg', l: 'Vente', opts: [['sans', 'Sans agent (en concession)'], ['liste', 'Par un agent précis'], ['tous', 'Par n’importe quel agent']] },
      { k: 'v', t: 'pick', l: 'Agent(s) R2', i: 'building', groups: (R) => flat(R?.agents), all: 'Choisir…', show: (p) => p.mode === 'liste' }],
    say: (p) => (p.mode === 'sans' ? <>Vendu {b_('sans agent')} (vente en concession)</> : p.mode === 'liste' ? (p.v.length ? <>Vendu par l’agent {ou(p.v)}</> : 'Vendu par l’agent… (à choisir)') : <>Vendu {b_('par un agent R2')}, n’importe lequel</>),
    out: (p) => (p.mode === 'liste' ? (p.v.length ? { mode: 'liste', valeurs: p.v } : null) : { mode: p.mode === 'tous' ? 'tous' : 'sans' }),
    inn: (B) => ({ mode: B.mode === 'liste' || B.mode === 'tous' ? B.mode : 'sans', v: Array.isArray(B.valeurs) ? B.valeurs : [] }) },

  // ------------------------------------------------------------ Financement
  fin_famille: { fam: 'fin', l: 'Famille de financement', scope: 'line', def: () => ({ v: ['LOA'] }),
    fields: [{ k: 'v', t: 'chips', l: 'Famille de produit', opts: (R) => (R?.familles?.length ? R.familles : FAMS_DEF), colors: () => FAM_C, all: 'Toutes' }],
    say: (p) => (p.v.length ? <>Financement {ou(p.v)}</> : <>Financement {b_('de toute famille')}</>), out: vals, inn: innV },
  fin_organisme: { fam: 'fin', l: 'Organisme de financement', scope: 'line', def: () => ({ v: ['DIAC'] }),
    fields: [{ k: 'v', t: 'chips', l: 'Organisme', opts: () => ['DIAC', 'Autre banque', 'Aucun'], label: (v) => (v === 'Aucun' ? 'Aucun (comptant)' : v), all: 'Tous' }],
    say: (p) => (p.v.length === 1 && p.v[0] === 'Aucun' ? <>Payé {b_('comptant')}, sans financement connu</> : p.v.length ? <>Financement chez {ou(p.v, (x) => (x === 'Aucun' ? 'aucun organisme' : x))}</> : 'Financement chez n’importe quel organisme'),
    out: vals, inn: innV },
  fin_echeance: { fam: 'fin', l: 'Fin du contrat de financement', scope: 'line', def: () => ({ when: 'dans', min: 3, max: 6, from: '', to: '' }),
    fields: [{ k: 'when', t: 'seg', l: 'Fin du contrat', opts: [['dans', 'Dans…'], ['entre', 'Entre deux dates'], ['cours', 'En cours']] },
      { t: 'range', a: 'min', b: 'max', l: 'Se termine dans', u: 'mois', show: (p) => p.when === 'dans' },
      { t: 'dates', a: 'from', b: 'to', l: 'Se termine entre le … et le …', show: (p) => p.when === 'entre' }],
    say: (p) => (p.when === 'entre' ? <>Financement qui se termine entre le {b_(dFR(p.from))} et le {b_(dFR(p.to))}</> : p.when === 'cours' ? <>Financement {b_('encore en cours')}</> : <>Financement qui se termine {b_(dans(p.min, p.max, 'mois'))}</>),
    out: (p) => (p.when === 'cours' ? { dans_min_mois: 0 } : p.when === 'entre' ? (p.from || p.to ? clean({ de: p.from || undefined, a: p.to || undefined }) : null) : rng(p, 'min', 'max', 'dans_min_mois', 'dans_max_mois')),
    inn: (B) => (B.de || B.a ? { when: 'entre', from: B.de || '', to: B.a || '' }
      : B.dans_min_mois === 0 && !has(B.dans_max_mois) ? { when: 'cours' }
      : { when: 'dans', min: B.dans_min_mois ?? '', max: B.dans_max_mois ?? '' }) },
  fin_duree: { fam: 'fin', l: 'Durée du contrat', scope: 'line', def: () => ({ min: 36, max: 48 }),
    fields: [{ t: 'range', a: 'min', b: 'max', l: 'Durée (fournie par DCS, sinon calculée)', u: 'mois' }],
    say: (p) => <>Contrat de {b_(span(p.min, p.max, 'mois'))}</>, out: (p) => rng(p), inn: innR },
  fin_ecoule: { fam: 'fin', l: 'Part du contrat écoulée', scope: 'line', def: () => ({ min: 80, max: '' }),
    fields: [{ t: 'range', a: 'min', b: 'max', l: 'Part écoulée', u: '%' }],
    say: (p) => <>Contrat écoulé à {b_(span(p.min, p.max, '%'))}</>, out: (p) => rng(p), inn: innR },
  garantie: { fam: 'fin', l: 'Extension de garantie', scope: 'line', def: () => ({ v: 'oui' }),
    fields: [{ k: 'v', t: 'seg', l: 'Garantie', opts: [['oui', 'Avec extension'], ['non', 'Sans extension']] }],
    say: (p) => <>Acheté {b_(p.v === 'oui' ? 'avec une extension de garantie' : 'sans extension de garantie')}</>, out: (p) => ({ valeur: p.v === 'oui' }), inn: bool },

  // ------------------------------------------------------------ Coordonnées (sans paramètre)
  a_portable_ou_email: { fam: 'coord', l: 'Joignable (portable ou e-mail)', scope: 'client', def: () => ({}), fields: [], say: () => <>A un {b_('portable ou un e-mail valide')}</>, out: () => ({}) },
  a_email: { fam: 'coord', l: 'A un e-mail valide', scope: 'client', def: () => ({}), fields: [], say: () => <>A une {b_('adresse e-mail valide')}</>, sayS: () => <>Sauf les clients {b_('avec un e-mail valide')}</>, out: () => ({}) },
  a_portable: { fam: 'coord', l: 'A un portable valide', scope: 'client', def: () => ({}), fields: [], say: () => <>A un {b_('portable valide')}</>, out: () => ({}) },
  a_telephone: { fam: 'coord', l: 'A un téléphone valide', scope: 'client', def: () => ({}), fields: [], say: () => <>A un {b_('téléphone valide')} (portable ou fixe)</>, out: () => ({}) },
  a_adresse: { fam: 'coord', l: 'A une adresse postale complète', scope: 'client', def: () => ({}), fields: [], say: () => <>A une {b_('adresse postale complète')}</>, out: () => ({}) },

  // ------------------------------------------------------------ Sauf : briques d'écran (jamais envoyées)
  generic: { fam: 'sauf', l: 'Identités génériques', scope: 'client', ui: 'locked', def: () => ({}), fields: [],
    say: () => <>Sauf les {b_('identités génériques')} (garages, loueurs, la concession : plus de 20 véhicules)</> },
  lot4_cible: { fam: 'sauf', l: 'Déjà ciblés récemment', scope: 'client', ui: 'soon', lot: 'lot 4', def: () => ({ n: 30 }), fields: [],
    say: (p) => <>Sauf les clients {b_(`déjà ciblés depuis ${p.n || '?'} jours`)}</> },
  lot4_nplc: { fam: 'sauf', l: '« Ne plus contacter »', scope: 'client', ui: 'soon', lot: 'lot 4', def: () => ({}), fields: [],
    say: () => <>Sauf les clients {b_('« ne plus contacter »')}</> },
};

/** Famille d'affichage : une brique `sauf` va dans « Sauf », quel que soit son type. */
export const famOf = (b: UB): Fam => (b.sauf ? 'sauf' : TY[b.t]?.fam || 'client');
export const sayOf = (b: UB): React.ReactNode => { const T = TY[b.t]; if (!T) return b.t; return b.sauf ? (T.sayS ? T.sayS(b.p) : <>Sauf : {T.say(b.p)}</>) : T.say(b.p); };

/** Entrées du menu « Ajouter » par famille (maquette : `addMenu`). */
export interface MenuEntry { t: string; l: string; p?: Record<string, any>; sauf?: boolean; off?: string }
export const MENU: Record<Fam, MenuEntry[]> = {
  client: ['type_personne', 'civilite', 'site_client', 'geo', 'anciennete', 'flotte', 'nb_vehicules', 'vendeur_client', 'zone', 'sources'].map((t) => ({ t, l: TY[t].l })),
  veh: ['marque', 'modele', 'energie', 'genre', 'age_vehicule', 'au_parc', 'ct'].map((t) => ({ t, l: TY[t].l })),
  achat: [...['achat_type', 'livraison', 'sans_achat_depuis', 'montant', 'reprise', 'site_achat', 'vendeur_achat', 'agent'].map((t) => ({ t, l: TY[t].l }))],
  fin: [{ t: 'fin_famille', l: TY.fin_famille.l }, { t: 'fin_organisme', l: TY.fin_organisme.l }, { t: 'fin_echeance', l: TY.fin_echeance.l },
    { t: 'fin_organisme', l: 'Sans financement (comptant)', p: { v: ['Aucun'] } }, { t: 'fin_duree', l: TY.fin_duree.l }, { t: 'fin_ecoule', l: TY.fin_ecoule.l }, { t: 'garantie', l: TY.garantie.l }],
  coord: ['a_portable_ou_email', 'a_email', 'a_portable', 'a_adresse'].map((t) => ({ t, l: TY[t].l })),
  sauf: [{ t: 'lot4_cible', l: 'Déjà ciblés récemment (lot 4)', off: 'lot 4' }, { t: 'lot4_nplc', l: '« Ne plus contacter » (lot 4)', off: 'lot 4' },
    { t: 'generic', l: 'Identités génériques (toujours retirées)', off: 'toujours' },
    { t: 'type_personne', l: 'Les professionnels', p: { v: 'societe' }, sauf: true }, { t: 'site_client', l: 'Un ou des sites', p: { v: [], mode: 'dernier' }, sauf: true },
    { t: 'sources', l: 'Une origine (VN, VO, ancienne base)', p: { v: ['BSO'] }, sauf: true }],
};

export const mk = (t: string, R: R_, p: Record<string, any> = {}, o: Partial<UB> = {}): UB => ({ id: nid(), t, p: { ...TY[t].def(R), ...p }, on: true, ...o });
export const SAUF0 = (R: R_): UB[] => [mk('generic', R), mk('lot4_cible', R), mk('lot4_nplc', R)];

// ---------------------------------------------------------------- conversions
/** Écran → contrat. Les briques d'écran et les briques incomplètes ne partent pas. */
export function toRequete(q: Q): Requete {
  const briques: Brique[] = [];
  for (const b of q.bricks) {
    const T = TY[b.t]; if (!T || T.ui || !T.out) continue;
    const o = T.out(b.p); if (!o) continue;
    briques.push({ id: b.id, type: T.type ? T.type(b.p) : b.t, actif: b.on, ...(b.sauf ? { sauf: true } : {}), ...o });
  }
  return { niveau: q.level, canal: q.canal, dedoublonnage: q.dedupe, briques };
}
/** Contrat → écran (recettes, requêtes enregistrées). Les briques « Sauf » d'écran sont rajoutées. */
export function fromRequete(r: Requete, R: R_, o: Partial<Q> = {}): Q {
  const bricks: UB[] = [];
  for (const B of r.briques || []) {
    const t = B.type === 'anniversaire' ? 'livraison' : B.type, T = TY[t];
    if (!T || T.ui) continue;
    bricks.push({ id: typeof B.id === 'string' && B.id ? B.id : nid(), t, p: { ...T.def(R), ...(T.inn ? T.inn(B) : {}) }, on: B.actif !== false, ...(B.sauf ? { sauf: true } : {}) });
  }
  return { name: 'Nouvelle requête', bricks: [...bricks, ...SAUF0(R)], level: r.niveau === 'vehicule' ? 'vehicule' : 'client', canal: r.canal || 'tous', dedupe: r.dedoublonnage !== false, savedId: null, from: null, ...o };
}
/** Périmètre de la barre de menus → brique Site préremplie (comme le filtre de l'onglet Clients). */
export function applyPer(q: Q, site: string | null): Q {
  const i = q.bricks.findIndex((b) => b.per);
  if (!site) return i < 0 ? q : { ...q, bricks: q.bricks.filter((b) => !b.per) };
  if (i >= 0) return { ...q, bricks: q.bricks.map((b, j) => (j === i ? { ...b, p: { ...b.p, v: [site] } } : b)) };
  return { ...q, bricks: [{ id: nid(), t: 'site_client', p: { v: [site], mode: 'dernier' }, on: true, per: true }, ...q.bricks] };
}
export const cloneQ = (q: Q): Q => ({ ...q, bricks: q.bricks.map((b) => ({ ...b, id: nid(), p: JSON.parse(JSON.stringify(b.p)) })) });

// ---------------------------------------------------------------- canaux
export interface CanalDef { l: string; icon: string; key?: 'email' | 'portable' | 'telephone' | 'adresse'; coord?: string; dd?: string; say?: React.ReactNode }
export const CANAL: Record<Canal, CanalDef> = {
  tous: { l: 'Tous', icon: 'list' },
  email: { l: 'E-mailing', icon: 'mail', key: 'email', coord: 'e-mail', dd: 'Un seul envoi par adresse e-mail', say: <>A une {b_('adresse e-mail valide')}, ni suspecte ni au domaine Bony</> },
  sms: { l: 'SMS', icon: 'sms', key: 'portable', coord: 'portable', dd: 'Un seul SMS par numéro de portable', say: <>A un {b_('portable valide')} (06 / 07), non suspect</> },
  phoning: { l: 'Phoning', icon: 'phone', key: 'telephone', coord: 'téléphone', dd: 'Un seul appel par numéro', say: <>A un {b_('téléphone valide')} (portable, sinon fixe), non suspect</> },
  courrier: { l: 'Courrier', icon: 'letter', key: 'adresse', coord: 'adresse', dd: 'Un seul courrier par foyer (même adresse)', say: <>A une {b_('adresse postale complète')} (numéro, voie, code postal, ville)</> },
};

// ---------------------------------------------------------------- recettes (format Requete du contrat, en dur)
export interface Recette { id: string; l: string; d: string; i: string; c: string; q: (zone: string) => Requete }
const rq = (briques: Omit<Brique, 'id' | 'actif'>[], o: Partial<Requete> = {}): Requete => ({ niveau: 'client', canal: 'tous', dedoublonnage: true, ...o, briques: briques.map((b) => ({ id: nid(), actif: true, ...b })) as Brique[] });
export const RECIPES: Recette[] = [
  { id: 'r0', l: 'Invitation événement concession', d: 'Zone de la concession, sans agent, joignable', i: 'flag', c: '#f75632',
    q: (zone) => rq([{ type: 'zone', concession: zone }, { type: 'agent', mode: 'sans' }, { type: 'a_portable_ou_email' }]) },
  { id: 'r1', l: 'Fins de LOA / LLD dans 3 à 6 mois', d: 'Proposer le renouvellement avant l’échéance', i: 'euro', c: FAM_C.LOA,
    q: () => rq([{ type: 'fin_famille', valeurs: ['LOA', 'LLD'] }, { type: 'fin_echeance', dans_min_mois: 3, dans_max_mois: 6 }, { type: 'au_parc', valeur: true }]) },
  { id: 'r2', l: 'Fins de crédit DIAC dans 6 mois', d: 'Crédit classique et ballon, DIAC seulement', i: 'euro', c: FAM_C['Crédit'],
    q: () => rq([{ type: 'fin_famille', valeurs: ['Crédit', 'Crédit ballon'] }, { type: 'fin_organisme', valeurs: ['DIAC'] }, { type: 'fin_echeance', dans_min_mois: 0, dans_max_mois: 6 }, { type: 'au_parc', valeur: true }]) },
  { id: 'r3', l: 'Contrôle technique dans les 2 mois (VO)', d: 'Rappel CT pour les clients VO', i: 'clock', c: '#f59e0b',
    q: () => rq([{ type: 'achat_type', valeurs: ['VO'] }, { type: 'au_parc', valeur: true }, { type: 'ct', dans_min_mois: 0, dans_max_mois: 2 }], { canal: 'sms' }) },
  { id: 'r4', l: 'Véhicule de plus de 6 ans encore au parc', d: 'Candidats à la reprise', i: 'car', c: '#14b8a6',
    q: () => rq([{ type: 'age_vehicule', min: 6 }, { type: 'au_parc', valeur: true }]) },
  { id: 'r5', l: 'Anniversaire VN 3 ans, sans financement', d: 'Clients comptant : leur proposer une offre', i: 'gift', c: '#e11d74',
    q: () => rq([{ type: 'achat_type', valeurs: ['VN'] }, { type: 'anniversaire', annees: 3, fenetre_jours: 30 }, { type: 'fin_organisme', valeurs: ['Aucun'] }], { canal: 'email' }) },
  { id: 'r6', l: 'Clients sans achat depuis 5 ans', d: 'Réactiver les clients endormis', i: 'refresh', c: '#94a3b8',
    q: () => rq([{ type: 'sans_achat_depuis', annees: 5 }], { canal: 'courrier' }) },
  { id: 'r7', l: 'Clients électriques et hybrides', d: 'Évènements, bornes, nouveautés E-Tech', i: 'bolt', c: '#16a34a',
    q: () => rq([{ type: 'energie', valeurs: ['Électrique', 'Hybride'] }, { type: 'au_parc', valeur: true }], { canal: 'email' }) },
  { id: 'r8', l: 'Professionnels avec 3 véhicules ou plus', d: 'Flottes : rendez-vous pro', i: 'building', c: '#5b7fd6',
    q: () => rq([{ type: 'type_personne', valeurs: ['societe'] }, { type: 'flotte', min: 3 }], { canal: 'phoning' }) },
  { id: 'r9', l: 'Clients R2 (vendus par un agent)', d: 'Clients finaux passés par un agent', i: 'handshake', c: '#8f12ab',
    q: () => rq([{ type: 'agent', mode: 'tous' }]) },
  { id: 'r10', l: 'Ancienne base Sud-Ouest jamais revenue', d: 'Connus avant le 01/10/2025, aucun achat depuis', i: 'globe', c: '#8a8599',
    q: () => rq([{ type: 'sources', valeurs: ['BSO'] }, { type: 'sources', valeurs: ['VN', 'VO'], sauf: true }], { canal: 'courrier' }) },
];
export const RECIPE_NAMES: Record<string, string> = {
  r0: 'Invitation événement concession', r1: 'Fins de LOA / LLD dans 3 à 6 mois', r2: 'Fins de crédit DIAC dans 6 mois', r3: 'Contrôle technique dans les 2 mois (VO)',
  r4: 'Véhicule de plus de 6 ans au parc', r5: 'Anniversaire de livraison VN 3 ans sans financement', r6: 'Clients sans achat depuis 5 ans', r7: 'Clients électriques et hybrides',
  r8: 'Professionnels (flottes) de 3 véhicules ou plus', r9: 'Clients R2 (vendus par un agent)', r10: 'Ancienne base Sud-Ouest jamais revenue',
};
/** Zone par défaut d'une recette « événement » : celle du périmètre s'il a une zone, sinon Clermont. */
export const zoneFor = (R: R_, site: string | null) => (site && R?.zones.some((z) => z.concession === site) ? site : R?.zones.find((z) => z.concession === 'Clermont')?.concession || R?.zones[0]?.concession || 'Clermont');
export function recipeQ(r: Recette, R: R_, site: string | null): Q {
  return applyPer(fromRequete(r.q(zoneFor(R, site)), R, { name: RECIPE_NAMES[r.id] || r.l, from: r.id }), site);
}

// ---------------------------------------------------------------- formats d'export
export const hasT = (q: Q, ...t: string[]) => q.bricks.some((b) => b.on && !b.sauf && t.includes(b.t));
export const hasFin = (q: Q) => hasT(q, 'fin_echeance', 'fin_famille', 'fin_duree', 'fin_ecoule') || q.bricks.some((b) => b.on && !b.sauf && b.t === 'fin_organisme' && b.p.v?.some((x: string) => x !== 'Aucun'));
