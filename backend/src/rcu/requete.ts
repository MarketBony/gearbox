import { Pool, PoolClient } from 'pg';
import { rcu } from './db';

/**
 * Requêteur de SPARK — SEULE porte qui traduit une requête (JSON envoyé par le navigateur) en SQL.
 * Contrat : ui2/apps/crm/CONTRAT-API.md § « Lot 3 ».
 *
 * ⚠️ Le navigateur n'envoie JAMAIS de SQL. Chaque brique est une entrée d'une liste FERMÉE (CLIENT, VENTE, COORD) ; toute
 * valeur passe en PARAMÈTRE ($n), jamais dans le texte SQL. Une brique inconnue ou mal formée → RequeteInvalide (400).
 * Les garde-fous du canal sont posés ICI, quoi qu'envoie le navigateur.
 *
 * Les briques Véhicule / Achat / Financement portent toutes sur LE MÊME achat (une ligne de `rcu.cv`).
 */

export class RequeteInvalide extends Error {}

type Brique = { id?: string; type: string; actif?: boolean; sauf?: boolean; [k: string]: unknown };
export interface Requete { niveau: 'client' | 'vehicule'; canal: 'tous' | 'email' | 'sms' | 'phoning' | 'courrier'; dedoublonnage: boolean; briques: Brique[] }
type Arg = (v: unknown) => string;

// ─── Lecture prudente des paramètres ─────────────────────────────────────────────
const textes = (b: Brique, k = 'valeurs'): string[] => {
  const v = b[k];
  if (!Array.isArray(v) || !v.length || v.some((x) => typeof x !== 'string' || x.length > 120)) throw new RequeteInvalide(`Brique ${b.type} : « ${k} » attend une liste de textes.`);
  return v as string[];
};
const nombre = (b: Brique, k: string): number | null => {
  if (b[k] == null || b[k] === '') return null;
  const n = Number(b[k]);
  if (!Number.isFinite(n) || Math.abs(n) > 1e9) throw new RequeteInvalide(`Brique ${b.type} : « ${k} » doit être un nombre.`);
  return n;
};
const date = (b: Brique, k: string): string | null => {
  if (b[k] == null || b[k] === '') return null;
  if (typeof b[k] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b[k] as string)) throw new RequeteInvalide(`Brique ${b.type} : « ${k} » doit être une date AAAA-MM-JJ.`);
  return b[k] as string;
};
const booleen = (b: Brique, k = 'valeur'): boolean => {
  if (typeof b[k] !== 'boolean') throw new RequeteInvalide(`Brique ${b.type} : « ${k} » doit valoir vrai ou faux.`);
  return b[k] as boolean;
};
/** Bornes min / max → fragment SQL (au moins une borne exigée). */
const entre = (expr: string, min: number | null, max: number | null, a: Arg, type: string): string => {
  if (min == null && max == null) throw new RequeteInvalide(`Brique ${type} : indiquez au moins une borne.`);
  return [min != null ? `${expr} >= ${a(min)}` : null, max != null ? `${expr} <= ${a(max)}` : null].filter(Boolean).join(' and ');
};
const MOIS = (expr: string) => `((extract(year from age(${expr}, current_date)) * 12 + extract(month from age(${expr}, current_date))))`;

// ─── Briques CLIENT (alias c = rcu.client) ───────────────────────────────────────
const CLIENT: Record<string, (b: Brique, a: Arg) => string> = {
  type_personne: (b, a) => `c.type = any(${a(textes(b))}::text[])`,
  civilite: (b, a) => `c.civilite = any(${a(textes(b))}::text[])`,
  site_client: (b, a) => (b.mode === 'dernier' ? `c.site = any(${a(textes(b))}::text[])` : `c.sites && ${a(textes(b))}::text[]`),
  zone: (b, a) => {
    if (typeof b.concession !== 'string') throw new RequeteInvalide('Brique zone : concession manquante.');
    return `left(c.cp, 2) = any(coalesce((select z.departements from rcu.ref_zone z where z.concession = ${a(b.concession)}), '{}'))`;
  },
  geo: (b, a) => {
    const parts: string[] = [];
    if (Array.isArray(b.departements) && b.departements.length) parts.push(`left(c.cp, 2) = any(${a(textes(b, 'departements'))}::text[])`);
    if (Array.isArray(b.cps) && b.cps.length) parts.push(`c.cp = any(${a(textes(b, 'cps'))}::text[])`);
    if (Array.isArray(b.villes) && b.villes.length) parts.push(`upper(unaccent(c.ville)) = any(${a(textes(b, 'villes').map((v) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()))}::text[])`);
    if (!parts.length) throw new RequeteInvalide('Brique geo : indiquez des départements, des codes postaux ou des villes.');
    return `(${parts.join(' or ')})`;
  },
  anciennete: (b, a) => entre(`extract(year from age(current_date, c.premiere_vente))`, nombre(b, 'min'), nombre(b, 'max'), a, b.type),
  sans_achat_depuis: (b, a) => { const n = nombre(b, 'annees'); if (n == null) throw new RequeteInvalide('Brique sans_achat_depuis : annees manquant.'); return `c.derniere_vente < current_date - make_interval(years => ${a(Math.round(n))}::int)`; },
  nb_vehicules: (b, a) => entre('c.nb_vehicules', nombre(b, 'min'), nombre(b, 'max'), a, b.type),
  // Taille de flotte = véhicules ENCORE au parc (le client en est le dernier acheteur connu), pas tous ceux achetés un jour.
  flotte: (b, a) => entre('c.nb_parc', nombre(b, 'min'), nombre(b, 'max'), a, b.type),
  vendeur_client: (b, a) => `c.vendeur = any(${a(textes(b).map((x) => x.toUpperCase()))}::text[])`,
  sources: (b, a) => `c.sources && ${a(textes(b))}::text[]`,
};

// ─── Briques VÉHICULE / ACHAT / FINANCEMENT (alias x = rcu.cv, une vente retenue) ─
const VENTE: Record<string, (b: Brique, a: Arg, x: string) => string> = {
  marque: (b, a, x) => `${x}.marque = any(${a(textes(b).map((v) => v.toUpperCase()))}::text[])`,
  modele: (b, a, x) => `upper(${x}.modele) like any(${a(textes(b).map((v) => `%${v.toUpperCase().replace(/[%_]/g, '')}%`))}::text[])`,
  energie: (b, a, x) => `${x}.energie = any(${a(textes(b))}::text[])`,
  genre: (b, a, x) => `upper(${x}.genre) = any(${a(textes(b).map((v) => v.toUpperCase()))}::text[])`,
  age_vehicule: (b, a, x) => entre(`extract(year from age(current_date, ${x}.date_mec))`, nombre(b, 'min'), nombre(b, 'max'), a, b.type),
  au_parc: (b, a, x) => (booleen(b) ? `${x}.actuel` : `not ${x}.actuel`),
  ct: (b, a, x) => entre(MOIS(`${x}.ct_prochain`), nombre(b, 'dans_min_mois'), nombre(b, 'dans_max_mois'), a, b.type) + ` and ${x}.ct_prochain >= current_date`,
  achat_type: (b, a, x) => {
    const v = textes(b), parts: string[] = [];
    if (v.includes('VN')) parts.push(`${x}.type_vh = 'VN'`);
    if (v.includes('VO')) parts.push(`${x}.type_vh = 'VO'`);
    if (v.includes('BSO')) parts.push(`${x}.source = 'BSO'`);
    if (!parts.length) throw new RequeteInvalide('Brique achat_type : VN, VO ou BSO.');
    return `(${parts.join(' or ')})`;
  },
  livraison: (b, a, x) => {
    const parts: string[] = [];
    const de = date(b, 'de'), aa = date(b, 'a'), mn = nombre(b, 'il_y_a_min_mois'), mx = nombre(b, 'il_y_a_max_mois');
    if (de) parts.push(`${x}.date_achat >= ${a(de)}::date`);
    if (aa) parts.push(`${x}.date_achat <= ${a(aa)}::date`);
    if (mn != null) parts.push(`${x}.date_achat <= current_date - make_interval(months => ${a(Math.round(mn))}::int)`);
    if (mx != null) parts.push(`${x}.date_achat >= current_date - make_interval(months => ${a(Math.round(mx))}::int)`);
    if (!parts.length) throw new RequeteInvalide('Brique livraison : indiquez une période.');
    return parts.join(' and ');
  },
  anniversaire: (b, a, x) => {
    const n = nombre(b, 'annees'), f = nombre(b, 'fenetre_jours') ?? 15;
    if (n == null) throw new RequeteInvalide('Brique anniversaire : annees manquant.');
    return `abs((${x}.date_achat + make_interval(years => ${a(Math.round(n))}::int))::date - current_date) <= ${a(Math.round(f))}::int`;
  },
  type_vente: (b, a, x) => `${x}.type_vente = any(${a(textes(b).map((v) => v.toUpperCase()))}::text[])`,
  montant: (b, a, x) => entre(`${x}.montant_tarif`, nombre(b, 'min'), nombre(b, 'max'), a, b.type),
  reprise: (b, a, x) => (booleen(b) ? `${x}.reprise` : `not ${x}.reprise`),
  site_achat: (b, a, x) => `${x}.site = any(${a(textes(b))}::text[])`,
  vendeur_achat: (b, a, x) => `${x}.vendeurs && ${a(textes(b).map((v) => v.toUpperCase()))}::text[]`,
  agent: (b, a, x) => {
    if (b.mode === 'sans') return `${x}.intermediaire is null`;
    if (b.mode === 'tous') return `${x}.intermediaire is not null`;
    if (b.mode === 'liste') return `${x}.intermediaire = any(${a(textes(b).map((v) => v.toUpperCase()))}::text[])`;
    throw new RequeteInvalide('Brique agent : mode sans, tous ou liste.');
  },
  fin_organisme: (b, a, x) => {
    const v = textes(b);
    const aucun = v.includes('Aucun') ? ` or (${x}.fin_organisme is null and ${x}.fin_famille is null)` : '';
    return `(${x}.fin_organisme = any(${a(v)}::text[])${aucun})`;
  },
  fin_famille: (b, a, x) => `${x}.fin_famille = any(${a(textes(b))}::text[])`,
  fin_echeance: (b, a, x) => {
    const parts: string[] = [`${x}.fin_fin is not null`];
    const de = date(b, 'de'), aa = date(b, 'a'), mn = nombre(b, 'dans_min_mois'), mx = nombre(b, 'dans_max_mois');
    if (de) parts.push(`${x}.fin_fin >= ${a(de)}::date`);
    if (aa) parts.push(`${x}.fin_fin <= ${a(aa)}::date`);
    if (mn != null) parts.push(`${x}.fin_fin >= current_date + make_interval(months => ${a(Math.round(mn))}::int)`);
    if (mx != null) parts.push(`${x}.fin_fin <= current_date + make_interval(months => ${a(Math.round(mx))}::int)`);
    if (parts.length === 1) throw new RequeteInvalide('Brique fin_echeance : indiquez une période.');
    return parts.join(' and ');
  },
  fin_duree: (b, a, x) => entre(`${x}.fin_duree`, nombre(b, 'min'), nombre(b, 'max'), a, b.type),
  fin_ecoule: (b, a, x) => entre(`(100.0 * (current_date - ${x}.fin_debut) / nullif(${x}.fin_fin - ${x}.fin_debut, 0))`, nombre(b, 'min'), nombre(b, 'max'), a, b.type),
  garantie: (b, a, x) => (booleen(b) ? `${x}.garantie is not null` : `${x}.garantie is null`),
};

// ─── Briques COORDONNÉES (coordonnées VALIDES : jamais une suspecte) ─────────────
const COORD: Record<string, string> = {
  a_email: 'c.email is not null',
  a_portable: 'c.portable is not null',
  a_telephone: 'coalesce(c.portable, c.fixe) is not null',
  a_adresse: 'c.adresse_complete',
  a_portable_ou_email: '(c.portable is not null or c.email is not null)',
};

const GARDE: Record<Requete['canal'], string | null> = {
  tous: null, email: 'c.email is not null', sms: 'c.portable is not null',
  phoning: 'coalesce(c.portable, c.fixe) is not null', courrier: 'c.adresse_complete',
};
const CLE_DOUBLON: Record<Requete['canal'], string | null> = {
  tous: null, email: 'lower(c.email)', sms: 'c.portable', phoning: 'coalesce(c.portable, c.fixe)',
  courrier: `upper(unaccent(concat_ws('|', c.nom, c.num_rue, c.rue, c.cp)))`,
};

export function lireRequete(v: unknown): Requete {
  const r = v as Requete;
  if (!r || typeof r !== 'object') throw new RequeteInvalide('Requête absente.');
  if (r.niveau !== 'client' && r.niveau !== 'vehicule') throw new RequeteInvalide('Niveau : client ou vehicule.');
  if (!(r.canal in GARDE)) throw new RequeteInvalide('Canal inconnu.');
  if (!Array.isArray(r.briques) || r.briques.length > 40) throw new RequeteInvalide('Briques : 40 au plus.');
  for (const b of r.briques) {
    if (!b || typeof b.type !== 'string' || !(b.type in CLIENT || b.type in VENTE || b.type in COORD)) {
      throw new RequeteInvalide(`Brique inconnue : ${String((b as Brique)?.type)}.`);
    }
  }
  return { niveau: r.niveau, canal: r.canal, dedoublonnage: !!r.dedoublonnage, briques: r.briques };
}

/**
 * Construit les CTE de la requête. Rend `{ sql, params }` où `sql` définit :
 *   base   (client_id, vente_id)  : lignes AVANT garde-fous du canal
 *   garde  (client_id, vente_id)  : après garde-fous
 *   r      (client_id, vente_id)  : après dédoublonnage — LE résultat
 * `vente_id` est l'achat retenu (null au niveau client sans brique d'achat).
 */
export function construire(req: Requete, params: unknown[] = []): { sql: string; params: unknown[]; aVente: boolean } {
  const a: Arg = (v) => { params.push(v); return `$${params.length}`; };
  const actives = req.briques.filter((b) => b.actif !== false);
  const condClient: string[] = ['c.actif'];
  const condVente: string[] = [];
  let finConds = false;
  for (const b of actives) {
    if (b.type in CLIENT) { const s = CLIENT[b.type](b, a); condClient.push(b.sauf ? `not coalesce(${s}, false)` : s); }
    else if (b.type in COORD) { const s = COORD[b.type]; condClient.push(b.sauf ? `not (${s})` : s); }
    else if (b.sauf) {
      condClient.push(`not exists (select 1 from rcu.client_identite si join rcu.cv sx on sx.identite_id = si.identite_id
        where si.client_id = c.id and ${VENTE[b.type](b, a, 'sx')})`);
    } else {
      condVente.push(VENTE[b.type](b, a, 'cv'));
      if (b.type.startsWith('fin_')) finConds = true;
    }
  }
  const aVente = condVente.length > 0 || req.niveau === 'vehicule';
  const prio = finConds ? 'cv.fin_fin nulls last, cv.date_achat desc nulls last' : 'cv.date_achat desc nulls last';
  const base = aVente
    ? `select distinct on (c.id${req.niveau === 'vehicule' ? ', coalesce(cv.vehicule_id, -cv.vente_id)' : ''}) c.id as client_id, cv.vente_id
       from rcu.cv cv join rcu.client_identite ci on ci.identite_id = cv.identite_id join rcu.client c on c.id = ci.client_id
       where ${[...condClient, ...condVente].join(' and ')}
       order by c.id${req.niveau === 'vehicule' ? ', coalesce(cv.vehicule_id, -cv.vente_id)' : ''}, ${prio}, cv.vente_id desc`
    : `select c.id as client_id, null::bigint as vente_id from rcu.client c where ${condClient.join(' and ')}`;
  const garde = GARDE[req.canal];
  const cle = req.dedoublonnage ? CLE_DOUBLON[req.canal] : null;
  const sql = `
    base as materialized (${base}),
    garde as materialized (select b.* from base b join rcu.client c on c.id = b.client_id ${garde ? `where ${garde}` : ''}),
    r as materialized (${cle
      ? `select client_id, vente_id from (select g.*, row_number() over (partition by ${cle} order by c.derniere_vente desc nulls last, c.id) as rg
           from garde g join rcu.client c on c.id = g.client_id) d where rg = 1`
      : 'select * from garde'})`;
  return { sql, params, aVente };
}

// ─── Colonnes exportables (alias c = client, m = achat retenu) ───────────────────
interface Colonne { cle: string; libelle: string; groupe: string; sql: string }
const d = (e: string) => `to_char(${e}, 'YYYY-MM-DD')`;
export const COLONNES: Colonne[] = [
  { cle: 'id_spark', libelle: 'Identifiant SPARK', groupe: 'Client', sql: `'SPK-' || lpad(c.id::text, 7, '0')` },
  { cle: 'type', libelle: 'Type', groupe: 'Client', sql: `case c.type when 'societe' then 'Société' else 'Particulier' end` },
  { cle: 'civilite', libelle: 'Civilité', groupe: 'Client', sql: `case c.civilite when 'femme' then 'Madame' when 'homme' then 'Monsieur' when 'couple' then 'Monsieur' end` },
  { cle: 'nom', libelle: 'Nom', groupe: 'Client', sql: 'c.nom' },
  { cle: 'prenom', libelle: 'Prénom', groupe: 'Client', sql: 'c.prenom' },
  { cle: 'adresse', libelle: 'Adresse', groupe: 'Client', sql: `concat_ws(' ', c.num_rue, c.type_rue, c.rue)` },
  { cle: 'cp', libelle: 'Code postal', groupe: 'Client', sql: 'c.cp' },
  { cle: 'ville', libelle: 'Ville', groupe: 'Client', sql: 'c.ville' },
  { cle: 'email', libelle: 'E-mail', groupe: 'Coordonnées', sql: 'c.email' },
  { cle: 'portable', libelle: 'Portable', groupe: 'Coordonnées', sql: 'c.portable' },
  { cle: 'fixe', libelle: 'Téléphone fixe', groupe: 'Coordonnées', sql: 'c.fixe' },
  { cle: 'site', libelle: 'Site (dernier achat)', groupe: 'Client', sql: 'c.site' },
  { cle: 'vendeur', libelle: 'Vendeur (dernier achat)', groupe: 'Client', sql: 'c.vendeur' },
  { cle: 'premiere_vente', libelle: 'Client depuis', groupe: 'Client', sql: d('c.premiere_vente') },
  { cle: 'derniere_vente', libelle: 'Dernier achat', groupe: 'Client', sql: d('c.derniere_vente') },
  { cle: 'nb_vehicules', libelle: 'Véhicules achetés (depuis toujours)', groupe: 'Client', sql: 'c.nb_vehicules' },
  { cle: 'nb_parc', libelle: 'Flotte (véhicules au parc)', groupe: 'Client', sql: 'c.nb_parc' },
  { cle: 'marque', libelle: 'Marque', groupe: 'Véhicule', sql: 'm.marque' },
  { cle: 'modele', libelle: 'Modèle', groupe: 'Véhicule', sql: 'm.modele' },
  { cle: 'version', libelle: 'Version', groupe: 'Véhicule', sql: 'm.version' },
  { cle: 'energie', libelle: 'Énergie', groupe: 'Véhicule', sql: 'm.energie' },
  { cle: 'genre', libelle: 'Genre', groupe: 'Véhicule', sql: 'm.genre' },
  { cle: 'immat', libelle: 'Immatriculation', groupe: 'Véhicule', sql: 'm.immat' },
  { cle: 'vin', libelle: 'VIN', groupe: 'Véhicule', sql: 'm.vin' },
  { cle: 'date_mec', libelle: 'Mise en circulation', groupe: 'Véhicule', sql: d('m.date_mec') },
  { cle: 'age_vehicule', libelle: 'Âge du véhicule (ans)', groupe: 'Véhicule', sql: 'extract(year from age(current_date, m.date_mec))::int' },
  { cle: 'ct_prochain', libelle: 'Prochain contrôle technique', groupe: 'Véhicule', sql: d('m.ct_prochain') },
  { cle: 'au_parc', libelle: 'Encore au parc', groupe: 'Véhicule', sql: `case when m.vente_id is null then null when m.actuel then 'Oui' else 'Non' end` },
  { cle: 'type_achat', libelle: 'Type d’achat', groupe: 'Achat', sql: `case when m.source = 'BSO' then 'Ancienne base ' || m.type_vh else m.type_vh end` },
  { cle: 'date_achat', libelle: 'Date d’achat', groupe: 'Achat', sql: d('m.date_achat') },
  { cle: 'site_achat', libelle: 'Site d’achat', groupe: 'Achat', sql: 'm.site' },
  { cle: 'vendeur_achat', libelle: 'Vendeur de l’achat', groupe: 'Achat', sql: 'm.vendeurs[1]' },
  { cle: 'agent', libelle: 'Agent R2', groupe: 'Achat', sql: 'm.intermediaire' },
  { cle: 'type_vente', libelle: 'Type de vente', groupe: 'Achat', sql: 'm.type_vente' },
  { cle: 'montant_tarif', libelle: 'Montant tarif TTC', groupe: 'Achat', sql: 'm.montant_tarif::float' },
  { cle: 'reprise', libelle: 'Reprise', groupe: 'Achat', sql: `case when m.vente_id is null then null when m.reprise then 'Oui' else 'Non' end` },
  { cle: 'fin_organisme', libelle: 'Organisme de financement', groupe: 'Financement', sql: 'm.fin_organisme' },
  { cle: 'fin_famille', libelle: 'Financement', groupe: 'Financement', sql: 'm.fin_famille' },
  { cle: 'fin_debut', libelle: 'Début du financement', groupe: 'Financement', sql: d('m.fin_debut') },
  { cle: 'fin_fin', libelle: 'Fin du financement', groupe: 'Financement', sql: d('m.fin_fin') },
  { cle: 'fin_duree', libelle: 'Durée (mois)', groupe: 'Financement', sql: 'm.fin_duree' },
  { cle: 'mois_restants', libelle: 'Mois restants', groupe: 'Financement', sql: `case when m.fin_fin >= current_date then ${MOIS('m.fin_fin')}::int end` },
  { cle: 'pct_ecoule', libelle: 'Contrat écoulé (%)', groupe: 'Financement', sql: `round(100.0 * (current_date - m.fin_debut) / nullif(m.fin_fin - m.fin_debut, 0))::int` },
  { cle: 'garantie', libelle: 'Extension de garantie', groupe: 'Financement', sql: 'm.garantie' },
];
/** Colonnes de la vue « Voir les clients » (tableau paginé). */
export const COLONNES_TABLEAU = ['civilite', 'nom', 'prenom', 'ville', 'site', 'marque', 'modele', 'immat', 'fin_famille', 'fin_organisme', 'fin_fin', 'ct_prochain', 'date_achat', 'email', 'portable', 'fixe', 'vendeur', 'nb_parc'];
export const COLONNES_APERCU = ['civilite', 'nom', 'prenom', 'cp', 'ville', 'site', 'marque', 'modele', 'immat', 'fin_famille', 'fin_fin', 'ct_prochain', 'date_achat', 'email', 'portable', 'vendeur'];

/** Lignes du résultat avec les colonnes demandées. L'achat affiché (m) est celui retenu par la requête ; au niveau client
 *  sans brique d'achat, celui dont le financement est en cours, sinon le plus récent. */
/** Ordres de tri de la vue « Voir les clients » (liste fermée). */
export const TRIS: Record<string, string> = {
  recent: 'c.derniere_vente desc nulls last, c.id',
  flotte: 'c.nb_parc desc, c.derniere_vente desc nulls last, c.id',
  nom: 'c.nom nulls last, c.prenom, c.id',
  echeance: 'm.fin_fin nulls last, c.id',
};

export async function lignes(req: Requete, cles: string[], limite: number, pool: Pool = rcu(), decalage = 0, tri = 'recent') {
  const cols = cles.map((k) => COLONNES.find((c) => c.cle === k)).filter((c): c is Colonne => !!c);
  if (!cols.length) throw new RequeteInvalide('Aucune colonne valide.');
  const { sql, params } = construire(req);
  const lim = `$${params.push(limite)}`;
  const off = `$${params.push(decalage)}`;
  const db = await pool.connect();
  try {
  await db.query('begin');
  await db.query(`set local statement_timeout = '120s'`);
  await db.query(`set local work_mem = '64MB'`);
  const res = await db.query(`with ${sql}
    select r.client_id, ${cols.map((c) => `${c.sql} as "${c.cle}"`).join(', ')}
    from r join rcu.client c on c.id = r.client_id
    left join lateral (
      select x.* from rcu.cv x where x.vente_id = r.vente_id
      union all
      select * from (select x.* from rcu.client_identite ci join rcu.cv x on x.identite_id = ci.identite_id
        where r.vente_id is null and ci.client_id = r.client_id
        order by (x.fin_fin >= current_date) desc nulls last, x.date_achat desc nulls last limit 1) y
    ) m on true
    order by ${TRIS[tri] ?? TRIS.recent}
    limit ${lim} offset ${off}`, params);
  await db.query('commit');
  return { colonnes: cols.map(({ cle, libelle, groupe }) => ({ cle, libelle, groupe })), lignes: res.rows };
  } catch (e) { await db.query('rollback').catch(() => undefined); throw e; } finally { db.release(); }
}

/** Compteurs du résultat en direct (contrat : POST /requetes/compter). */
export async function compter(req: Requete, pool: Pool = rcu()) {
  const t0 = Date.now();
  const { sql, params } = construire(req);
  const db = await pool.connect();
  try {
  // Les comptes distincts trient 180 000 lignes : avec 4 Mo de mémoire de tri, ils débordaient sur disque.
  await db.query('begin');
  await db.query(`set local work_mem = '64MB'`);
  // ⚠️ Garde-fou : une requête emballée ne doit JAMAIS tourner indéfiniment (vécu le 12/10 : deux comptes de 13 minutes
  // ont verrouillé rcu.client et bloqué la migration). Au-delà, Postgres l'annule et le navigateur reçoit une erreur.
  await db.query(`set local statement_timeout = '20s'`);
  const res = await db.query(`with ${sql},
    rr as (select r.*, c.site, c.marques, c.email, c.portable, c.fixe, c.adresse_complete, c.vehicule_id as veh_client, c.fin_fin as fin_client,
                  c.energie as energie_client,
                  m.vehicule_id, m.marque, m.energie, m.fin_fin
           from r join rcu.client c on c.id = r.client_id left join rcu.cv m on m.vente_id = r.vente_id),
    bb as (select b.client_id, c.email, c.portable, c.fixe, c.adresse_complete from (select distinct client_id from base) b join rcu.client c on c.id = b.client_id)
    select
      (select count(distinct client_id)::int from rr) as clients,
      (select count(distinct coalesce(vehicule_id, veh_client))::int from rr) as vehicules,
      (select count(*)::int from rr) as lignes,
      (select count(*)::int from bb) as avant_canal,
      (select count(*)::int from garde) - (select count(*)::int from r) as doublons_retires,
      (select json_build_object('total', count(*), 'email', count(email), 'portable', count(portable),
        'telephone', count(coalesce(portable, fixe)), 'adresse', count(*) filter (where adresse_complete)) from bb) as entonnoir,
      (select coalesce(json_agg(x order by x.n desc), '[]') from (select coalesce(site, '—') as cle, count(*)::int as n from rr group by 1 order by 2 desc limit 15) x) as par_site,
      (select coalesce(json_agg(x order by x.n desc), '[]') from (select coalesce(marque, marques[1], '—') as cle, count(*)::int as n from rr group by 1 order by 2 desc limit 10) x) as par_marque,
      (select coalesce(json_agg(x order by x.cle), '[]') from (select to_char(coalesce(fin_fin, fin_client), 'YYYY-MM') as cle, count(*)::int as n from rr
         where coalesce(fin_fin, fin_client) between current_date and current_date + interval '24 months' group by 1) x) as par_mois_echeance,
      -- sans achat retenu par la requête : énergie du dernier véhicule du client, lue sur le VÉHICULE (une jointure par clé
      -- primaire), jamais par une sous-requête sur rcu.cv ligne à ligne (180 000 × 295 000 sans index : des minutes).
      (select coalesce(json_agg(x order by x.n desc), '[]') from (select coalesce(energie, energie_client, '—') as cle, count(*)::int as n
         from rr group by 1 order by 2 desc) x) as par_energie`, params);
  await db.query('commit');
  return { ...res.rows[0], ms: Date.now() - t0 };
  } catch (e) { await db.query('rollback').catch(() => undefined); throw e; } finally { db.release(); }
}

/** Reconstruit `rcu.cv` (table de travail du Requêteur) à partir des ventes. Appelé par le rapprochement. */
export async function rafraichirVentesClients(db: Pool | PoolClient): Promise<number> {
  await db.query('truncate rcu.cv');
  const r = await db.query(`
    insert into rcu.cv
    select v.id, v.identite_id, v.source, v.type_vh, coalesce(v.date_livraison, v.date_commande),
      -- agent rattaché à un autre site que l'affaire (ref_agent), à partir de sa date de rattachement
      case when ra.site is not null and (ra.depuis is null or coalesce(v.date_livraison, v.date_commande) >= ra.depuis) then ra.site else v.site end,
      coalesce(v.vendeurs, '{}'), v.intermediaire, v.type_vente, v.montant_tarif, coalesce(v.montant_reprise, 0) > 100,
      nullif(v.garantie_libelle, 'AUCUN'),
      case when v.fin_organisme = 'Aucun' and (v.fin_famille is not null or v.fin_fin is not null) then null else v.fin_organisme end,
      v.fin_famille, v.fin_debut, v.fin_fin, v.fin_duree,
      vh.id, vh.marque, vh.modele, vh.version, rcu.energie_norm(vh.energie, vh.version, vh.modele), vh.genre,
      coalesce(vh.date_mec, vh.date_immat, case when v.type_vh = 'VN' then coalesce(v.date_livraison, v.date_commande) end),
      vh.ct_prochain, vh.immat, vh.vin,
      coalesce(dern.vente_id = v.id, true)
    from rcu.vente v
    left join rcu.vehicule vh on vh.id = v.vehicule_id
    left join rcu.ref_agent ra on ra.intermediaire = v.intermediaire
    left join (
      select distinct on (vehicule_id) vehicule_id, id as vente_id from rcu.vente where vehicule_id is not null
      order by vehicule_id, coalesce(date_livraison, date_commande) desc nulls last, id desc
    ) dern on dern.vehicule_id = v.vehicule_id
    where v.retenue and v.absente_depuis is null`);
  await db.query('analyze rcu.cv');
  // Taille de flotte : véhicules dont le client est le dernier acheteur connu. N'écrit que ce qui change.
  await db.query(`
    with x as (select ci.client_id, count(distinct cv.vehicule_id)::int as n from rcu.cv cv
               join rcu.client_identite ci on ci.identite_id = cv.identite_id where cv.actuel and cv.vehicule_id is not null group by 1)
    update rcu.client c set nb_parc = coalesce(x.n, 0) from rcu.client c2 left join x on x.client_id = c2.id
    where c.id = c2.id and c.nb_parc is distinct from coalesce(x.n, 0)`);
  return r.rowCount ?? 0;
}
