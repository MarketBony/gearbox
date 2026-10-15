/**
 * Requêteur de SPARK — MODE AVANCÉ (15/10/2026) : groupes de conditions « champ · opérateur · valeurs ».
 * Branché sur la seule porte `requete.ts` (lireRequete / construire). Contrat : ui2/apps/crm/CONTRAT-API.md § Mode avancé.
 *
 * ⚠️ Mêmes principes que les briques : CHAMPS et OPÉRATEURS en listes FERMÉES (ci-dessous), toute valeur en PARAMÈTRE,
 * jamais de SQL venu du navigateur. Un seul niveau de groupes (décision de Théo).
 *
 * Portée d'un groupe :
 *   client          les conditions « véhicule » y valent « au moins un véhicule » chacune ;
 *   meme_vehicule   un même achat (ligne de rcu.cv) remplit le groupe — c'est aussi lui qui sort à l'export ;
 *   un_vehicule     chaque condition « véhicule » peut être remplie par un véhicule différent ;
 *   aucun_vehicule  aucun achat du client ne remplit le groupe.
 * `exclure: true` retire du résultat les clients qui remplissent le groupe.
 */

export class AvanceInvalide extends Error {}
type Arg = (v: unknown) => string;

type TypeChamp = 'texte' | 'liste' | 'nombre' | 'date' | 'booleen' | 'tableau';
interface Champ { libelle: string; groupe: string; type: TypeChamp; portee: 'client' | 'vehicule'; sql: (x: string) => string; suggest?: string }

const MOIS_ENTRE = (expr: string) => `(extract(year from age(${expr}, current_date)) * 12 + extract(month from age(${expr}, current_date)))`;

/** Champs du mode avancé. `x` = alias de la ligne d'achat (rcu.cv) ; le client est toujours `c`. */
export const CHAMPS: Record<string, Champ> = {
  // ─── Client
  'client.nom': { libelle: 'Nom / raison sociale', groupe: 'Client', type: 'texte', portee: 'client', sql: () => `upper(unaccent(coalesce(c.nom, '')))`, suggest: 'c.nom' },
  'client.prenom': { libelle: 'Prénom', groupe: 'Client', type: 'texte', portee: 'client', sql: () => `upper(unaccent(coalesce(c.prenom, '')))`, suggest: 'c.prenom' },
  'client.type': { libelle: 'Profil (particulier / professionnel)', groupe: 'Client', type: 'liste', portee: 'client', sql: () => 'c.type' },
  'client.civilite': { libelle: 'Civilité', groupe: 'Client', type: 'liste', portee: 'client', sql: () => 'c.civilite' },
  'client.cp': { libelle: 'Code postal', groupe: 'Client', type: 'texte', portee: 'client', sql: () => `coalesce(c.cp, '')`, suggest: 'c.cp' },
  'client.departement': { libelle: 'Département', groupe: 'Client', type: 'liste', portee: 'client', sql: () => 'left(c.cp, 2)' },
  'client.ville': { libelle: 'Ville', groupe: 'Client', type: 'texte', portee: 'client', sql: () => `upper(unaccent(coalesce(c.ville, '')))`, suggest: 'c.ville' },
  'client.site': { libelle: 'Site du dernier achat', groupe: 'Client', type: 'liste', portee: 'client', sql: () => 'c.site' },
  'client.sites': { libelle: 'Sites où il a acheté', groupe: 'Client', type: 'tableau', portee: 'client', sql: () => 'c.sites' },
  'client.marques': { libelle: 'Marques achetées', groupe: 'Client', type: 'tableau', portee: 'client', sql: () => 'c.marques' },
  'client.sources': { libelle: 'Origine de la fiche (VN, VO, ancienne base)', groupe: 'Client', type: 'tableau', portee: 'client', sql: () => 'c.sources' },
  'client.vendeur_pf': { libelle: 'Vendeur du portefeuille', groupe: 'Client', type: 'texte', portee: 'client', suggest: `(select concat_ws(' ', v.prenom, v.nom) from rcu.portefeuille p join rcu.vendeur v on v.id = p.vendeur_id where p.client_id = c.id)`,
    sql: () => `coalesce((select upper(unaccent(concat_ws(' ', v.prenom, v.nom))) from rcu.portefeuille p join rcu.vendeur v on v.id = p.vendeur_id where p.client_id = c.id), '')` },
  'client.a_rappeler': { libelle: 'Échange « à rappeler » (date du rappel)', groupe: 'Client', type: 'date', portee: 'client', sql: () => `(select min(e.rappel) from rcu.echange e where e.client_id = c.id and e.rappel >= current_date)` },
  'client.vendeur': { libelle: 'Vendeur du dernier achat', groupe: 'Client', type: 'texte', portee: 'client', sql: () => `coalesce(c.vendeur, '')`, suggest: 'c.vendeur' },
  'client.flotte': { libelle: 'Taille de flotte (véhicules au parc)', groupe: 'Client', type: 'nombre', portee: 'client', sql: () => 'c.nb_parc' },
  'client.nb_vehicules': { libelle: 'Véhicules achetés (depuis toujours)', groupe: 'Client', type: 'nombre', portee: 'client', sql: () => 'c.nb_vehicules' },
  'client.anciennete': { libelle: 'Ancienneté (années depuis le 1er achat)', groupe: 'Client', type: 'nombre', portee: 'client', sql: () => 'extract(year from age(current_date, c.premiere_vente))' },
  'client.premiere_vente': { libelle: 'Date du 1er achat', groupe: 'Client', type: 'date', portee: 'client', sql: () => 'c.premiere_vente' },
  'client.derniere_vente': { libelle: 'Date du dernier achat', groupe: 'Client', type: 'date', portee: 'client', sql: () => 'c.derniere_vente' },
  // ─── Coordonnées (valides = jamais une suspecte)
  'coord.email': { libelle: 'E-mail valide', groupe: 'Coordonnées', type: 'booleen', portee: 'client', sql: () => '(c.email is not null)' },
  'coord.domaine': { libelle: 'Domaine de l’e-mail', groupe: 'Coordonnées', type: 'texte', portee: 'client', sql: () => `upper(coalesce(split_part(c.email, '@', 2), ''))`, suggest: `split_part(c.email, '@', 2)` },
  'coord.portable': { libelle: 'Portable valide', groupe: 'Coordonnées', type: 'booleen', portee: 'client', sql: () => '(c.portable is not null)' },
  'coord.telephone': { libelle: 'Téléphone valide (portable ou fixe)', groupe: 'Coordonnées', type: 'booleen', portee: 'client', sql: () => '(coalesce(c.portable, c.fixe) is not null)' },
  'coord.adresse': { libelle: 'Adresse postale complète', groupe: 'Coordonnées', type: 'booleen', portee: 'client', sql: () => 'c.adresse_complete' },
  'coord.suspect': { libelle: 'A une coordonnée suspecte', groupe: 'Coordonnées', type: 'booleen', portee: 'client', sql: () => 'c.suspect' },
  // ─── Véhicule
  'veh.marque': { libelle: 'Marque', groupe: 'Véhicule', type: 'liste', portee: 'vehicule', sql: (x) => `${x}.marque` },
  'veh.modele': { libelle: 'Modèle', groupe: 'Véhicule', type: 'texte', portee: 'vehicule', sql: (x) => `upper(coalesce(${x}.modele, ''))`, suggest: 'modele' },
  'veh.version': { libelle: 'Version', groupe: 'Véhicule', type: 'texte', portee: 'vehicule', sql: (x) => `upper(coalesce(${x}.version, ''))`, suggest: 'version' },
  'veh.energie': { libelle: 'Énergie', groupe: 'Véhicule', type: 'liste', portee: 'vehicule', sql: (x) => `${x}.energie` },
  'veh.genre': { libelle: 'Genre (VP / VU)', groupe: 'Véhicule', type: 'liste', portee: 'vehicule', sql: (x) => `upper(${x}.genre)` },
  'veh.immat': { libelle: 'Immatriculation', groupe: 'Véhicule', type: 'texte', portee: 'vehicule', sql: (x) => `regexp_replace(upper(coalesce(${x}.immat, '')), '[^A-Z0-9]', '', 'g')` },
  'veh.vin': { libelle: 'VIN', groupe: 'Véhicule', type: 'texte', portee: 'vehicule', sql: (x) => `upper(coalesce(${x}.vin, ''))` },
  'veh.date_mec': { libelle: 'Mise en circulation', groupe: 'Véhicule', type: 'date', portee: 'vehicule', sql: (x) => `${x}.date_mec` },
  'veh.age': { libelle: 'Âge du véhicule (ans)', groupe: 'Véhicule', type: 'nombre', portee: 'vehicule', sql: (x) => `extract(year from age(current_date, ${x}.date_mec))` },
  'veh.ct_prochain': { libelle: 'Prochain contrôle technique', groupe: 'Véhicule', type: 'date', portee: 'vehicule', sql: (x) => `${x}.ct_prochain` },
  'veh.au_parc': { libelle: 'Encore au parc (pas revendu)', groupe: 'Véhicule', type: 'booleen', portee: 'vehicule', sql: (x) => `${x}.actuel` },
  // ─── Achat
  'achat.type': { libelle: 'Neuf ou occasion (VN / VO)', groupe: 'Achat', type: 'liste', portee: 'vehicule', sql: (x) => `${x}.type_vh` },
  'achat.source': { libelle: 'Base d’origine (VN, VO, ancienne base)', groupe: 'Achat', type: 'liste', portee: 'vehicule', sql: (x) => `case when ${x}.source = 'BSO' then 'BSO' else ${x}.source end` },
  'achat.date': { libelle: 'Date d’achat (livraison)', groupe: 'Achat', type: 'date', portee: 'vehicule', sql: (x) => `${x}.date_achat` },
  'achat.site': { libelle: 'Site d’achat', groupe: 'Achat', type: 'liste', portee: 'vehicule', sql: (x) => `${x}.site` },
  'achat.vendeur': { libelle: 'Vendeur de l’achat', groupe: 'Achat', type: 'tableau', portee: 'vehicule', sql: (x) => `${x}.vendeurs` },
  'achat.agent': { libelle: 'Agent R2 (intermédiaire)', groupe: 'Achat', type: 'texte', portee: 'vehicule', sql: (x) => `coalesce(${x}.intermediaire, '')`, suggest: 'intermediaire' },
  'achat.type_vente': { libelle: 'Type de vente DCS', groupe: 'Achat', type: 'liste', portee: 'vehicule', sql: (x) => `${x}.type_vente` },
  'achat.montant': { libelle: 'Montant tarif TTC', groupe: 'Achat', type: 'nombre', portee: 'vehicule', sql: (x) => `${x}.montant_tarif` },
  'achat.reprise': { libelle: 'Avec reprise', groupe: 'Achat', type: 'booleen', portee: 'vehicule', sql: (x) => `${x}.reprise` },
  'achat.garantie': { libelle: 'Extension de garantie', groupe: 'Achat', type: 'texte', portee: 'vehicule', sql: (x) => `upper(coalesce(${x}.garantie, ''))`, suggest: 'garantie' },
  // ─── Financement
  'fin.organisme': { libelle: 'Organisme de financement', groupe: 'Financement', type: 'liste', portee: 'vehicule', sql: (x) => `coalesce(${x}.fin_organisme, case when ${x}.fin_famille is null then 'Aucun' end)` },
  'fin.produit': { libelle: 'Produit (LOA, LLD, crédit…)', groupe: 'Financement', type: 'liste', portee: 'vehicule', sql: (x) => `${x}.fin_famille` },
  'fin.debut': { libelle: 'Début du contrat', groupe: 'Financement', type: 'date', portee: 'vehicule', sql: (x) => `${x}.fin_debut` },
  'fin.fin': { libelle: 'Fin du contrat', groupe: 'Financement', type: 'date', portee: 'vehicule', sql: (x) => `${x}.fin_fin` },
  'fin.duree': { libelle: 'Durée (mois)', groupe: 'Financement', type: 'nombre', portee: 'vehicule', sql: (x) => `${x}.fin_duree` },
  'fin.ecoule': { libelle: 'Part du contrat écoulée (%)', groupe: 'Financement', type: 'nombre', portee: 'vehicule', sql: (x) => `(100.0 * (current_date - ${x}.fin_debut) / nullif(${x}.fin_fin - ${x}.fin_debut, 0))` },
  'fin.mois_restants': { libelle: 'Mois restants avant la fin', groupe: 'Financement', type: 'nombre', portee: 'vehicule', sql: (x) => MOIS_ENTRE(`${x}.fin_fin`) },
};

/** Opérateurs autorisés par type de champ. */
export const OPERATEURS: Record<TypeChamp, string[]> = {
  texte: ['est', 'n_est_pas', 'contient', 'ne_contient_pas', 'commence_par', 'finit_par', 'vide', 'non_vide'],
  liste: ['est_un_de', 'aucun_de', 'vide', 'non_vide'],
  tableau: ['contient_un_de', 'aucun_de'],
  nombre: ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'entre', 'vide', 'non_vide'],
  date: ['avant', 'apres', 'entre', 'prochains', 'derniers', 'il_y_a_plus_de', 'mois_annee', 'vide', 'non_vide'],
  booleen: ['vrai', 'faux'],
};

export interface Condition { id?: string; champ: string; op: string; valeurs?: unknown[]; min?: unknown; max?: unknown; de?: unknown; a?: unknown; n?: unknown; unite?: unknown; actif?: boolean }
export interface Groupe { id?: string; portee: 'client' | 'meme_vehicule' | 'un_vehicule' | 'aucun_vehicule'; mode: 'et' | 'ou'; exclure?: boolean; actif?: boolean; conditions: Condition[] }
export interface Liste { type: 'vin' | 'immat' | 'nom' | 'id_spark'; valeurs: string[]; exclure?: boolean }

const PORTEES = ['client', 'meme_vehicule', 'un_vehicule', 'aucun_vehicule'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const textes = (c: Condition): string[] => {
  const v = c.valeurs;
  if (!Array.isArray(v) || !v.length || v.length > 200 || v.some((x) => typeof x !== 'string' || !x.trim() || x.length > 120)) {
    throw new AvanceInvalide(`« ${CHAMPS[c.champ]?.libelle ?? c.champ} » : indiquez au moins une valeur.`);
  }
  return (v as string[]).map((x) => x.trim());
};
const num = (c: Condition, k: 'min' | 'max' | 'n'): number => {
  const n = Number(c[k]);
  if (c[k] === '' || c[k] == null || !Number.isFinite(n) || Math.abs(n) > 1e9) throw new AvanceInvalide(`« ${CHAMPS[c.champ]?.libelle ?? c.champ} » : nombre manquant.`);
  return n;
};
const dat = (c: Condition, k: 'de' | 'a'): string => {
  const v = c[k];
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new AvanceInvalide(`« ${CHAMPS[c.champ]?.libelle ?? c.champ} » : date AAAA-MM-JJ attendue.`);
  return v;
};
const unite = (c: Condition) => (c.unite === 'jours' ? 'days' : c.unite === 'annees' ? 'years' : 'months');

/** Une condition → expression SQL booléenne (jamais NULL : un champ vide ne remplit que « vide »). */
function condition(c: Condition, a: Arg, x: string): string {
  const ch = CHAMPS[c.champ];
  const e = ch.sql(x);
  const pas = (s: string) => `not coalesce(${s}, false)`;
  switch (ch.type) {
    case 'texte': {
      if (c.op === 'vide') return `(${e} = '')`;
      if (c.op === 'non_vide') return `(${e} <> '')`;
      const v = textes(c).map(norm);
      const motif = (s: string) => s.replace(/[%_\\]/g, '');
      if (c.op === 'est') return `${e} = any(${a(v)}::text[])`;
      if (c.op === 'n_est_pas') return pas(`${e} = any(${a(v)}::text[])`);
      if (c.op === 'contient') return `${e} like any(${a(v.map((s) => `%${motif(s)}%`))}::text[])`;
      if (c.op === 'ne_contient_pas') return pas(`${e} like any(${a(v.map((s) => `%${motif(s)}%`))}::text[])`);
      if (c.op === 'commence_par') return `${e} like any(${a(v.map((s) => `${motif(s)}%`))}::text[])`;
      if (c.op === 'finit_par') return `${e} like any(${a(v.map((s) => `%${motif(s)}`))}::text[])`;
      break;
    }
    case 'liste': {
      if (c.op === 'vide') return `(${e} is null)`;
      if (c.op === 'non_vide') return `(${e} is not null)`;
      const v = textes(c);
      if (c.op === 'est_un_de') return `coalesce(${e} = any(${a(v)}::text[]), false)`;
      if (c.op === 'aucun_de') return pas(`${e} = any(${a(v)}::text[])`);
      break;
    }
    case 'tableau': {
      const v = textes(c);
      const arr = `(select coalesce(array_agg(upper(t)), '{}') from unnest(${e}) t)`;
      const vals = `${a(v.map((s) => s.toUpperCase()))}::text[]`;
      if (c.op === 'contient_un_de') return `(${arr} && ${vals})`;
      if (c.op === 'aucun_de') return `not (${arr} && ${vals})`;
      break;
    }
    case 'nombre': {
      if (c.op === 'vide') return `(${e} is null)`;
      if (c.op === 'non_vide') return `(${e} is not null)`;
      const cmp: Record<string, string> = { eq: '=', ne: '<>', gt: '>', ge: '>=', lt: '<', le: '<=' };
      if (c.op in cmp) return `coalesce(${e} ${cmp[c.op]} ${a(num(c, 'n'))}, false)`;
      if (c.op === 'entre') return `coalesce(${e} between ${a(num(c, 'min'))} and ${a(num(c, 'max'))}, false)`;
      break;
    }
    case 'date': {
      if (c.op === 'vide') return `(${e} is null)`;
      if (c.op === 'non_vide') return `(${e} is not null)`;
      if (c.op === 'avant') return `coalesce(${e} < ${a(dat(c, 'de'))}::date, false)`;
      if (c.op === 'apres') return `coalesce(${e} > ${a(dat(c, 'de'))}::date, false)`;
      if (c.op === 'entre') return `coalesce(${e} between ${a(dat(c, 'de'))}::date and ${a(dat(c, 'a'))}::date, false)`;
      const u = unite(c);
      if (c.op === 'prochains') return `coalesce(${e} between current_date + make_interval(${u} => ${a(Math.round(num(c, 'min')))}::int) and current_date + make_interval(${u} => ${a(Math.round(num(c, 'max')))}::int), false)`;
      if (c.op === 'derniers') return `coalesce(${e} between current_date - make_interval(${u} => ${a(Math.round(num(c, 'max')))}::int) and current_date - make_interval(${u} => ${a(Math.round(num(c, 'min')))}::int), false)`;
      if (c.op === 'il_y_a_plus_de') return `coalesce(${e} < current_date - make_interval(${u} => ${a(Math.round(num(c, 'n')))}::int), false)`;
      if (c.op === 'mois_annee') {
        const m = textes(c).map(Number);
        if (m.some((k) => !Number.isInteger(k) || k < 1 || k > 12)) throw new AvanceInvalide('Mois de l’année : de 1 à 12.');
        return `coalesce(extract(month from ${e})::int = any(${a(m)}::int[]), false)`;
      }
      break;
    }
    case 'booleen':
      if (c.op === 'vrai') return `coalesce(${e}, false)`;
      if (c.op === 'faux') return pas(e);
      break;
  }
  throw new AvanceInvalide(`Opérateur « ${c.op} » impossible sur « ${ch.libelle} ».`);
}

const ventesDe = (x: string) => `rcu.client_identite ${x}i join rcu.cv ${x} on ${x}.identite_id = ${x}i.identite_id`;

/** Expression SQL d'un groupe (sur le client `c`). Les conditions inactives sont ignorées ; un groupe vide vaut vrai. */
export function groupeSQL(g: Groupe, a: Arg, k: number): string {
  const conds = g.conditions.filter((c) => c.actif !== false);
  if (!conds.length) return 'true';
  const op = g.mode === 'ou' ? ' or ' : ' and ';
  let s: string;
  if (g.portee === 'meme_vehicule' || g.portee === 'aucun_vehicule') {
    const x = `g${k}`;
    const inner = conds.map((c) => `(${condition(c, a, x)})`).join(op);
    s = `exists (select 1 from ${ventesDe(x)} where ${x}i.client_id = c.id and (${inner}))`;
    if (g.portee === 'aucun_vehicule') s = `not ${s}`;
  } else {
    // client / un_vehicule : chaque condition « véhicule » est remplie par N'IMPORTE QUEL achat du client
    s = conds.map((c, j) => {
      if (CHAMPS[c.champ].portee === 'client') return `(${condition(c, a, 'c')})`;
      const x = `g${k}c${j}`;
      return `exists (select 1 from ${ventesDe(x)} where ${x}i.client_id = c.id and ${condition(c, a, x)})`;
    }).join(op);
  }
  return g.exclure ? `not (${s})` : `(${s})`;
}

/** Pour un groupe « même véhicule » non exclu : expression sur la ligne d'achat retenue (alias `cv`), pour que
 *  l'export et la vue « une ligne par véhicule » montrent CE véhicule. */
export function groupeSurAchat(g: Groupe, a: Arg): string | null {
  if (g.portee !== 'meme_vehicule' || g.exclure || g.actif === false) return null;
  const conds = g.conditions.filter((c) => c.actif !== false);
  if (!conds.length) return null;
  return `(${conds.map((c) => `(${condition(c, a, 'cv')})`).join(g.mode === 'ou' ? ' or ' : ' and ')})`;
}

export function listeSQL(l: Liste, a: Arg): string {
  const v = l.valeurs.map(norm).filter(Boolean);
  let s: string;
  if (l.type === 'id_spark') s = `c.id = any(${a(v.map((x) => Number(x.replace(/^SPK-?/, ''))).filter((n) => Number.isFinite(n)))}::bigint[])`;
  else if (l.type === 'nom') s = `upper(unaccent(concat_ws(' ', c.nom, c.prenom))) = any(${a(v)}::text[]) or upper(unaccent(coalesce(c.nom, ''))) = any(${a(v)}::text[])`;
  else {
    const col = l.type === 'vin' ? 'upper(lx.vin)' : `regexp_replace(upper(coalesce(lx.immat, '')), '[^A-Z0-9]', '', 'g')`;
    const vals = l.type === 'immat' ? v.map((x) => x.replace(/[^A-Z0-9]/g, '')) : v;
    s = `exists (select 1 from ${ventesDe('lx')} where lxi.client_id = c.id and ${col} = any(${a(vals)}::text[]))`;
  }
  return l.exclure ? `not (${s})` : `(${s})`;
}

/** Validation de la partie avancée d'une requête. Rend des objets propres (aucun champ inconnu ne passe). */
export function lireAvance(r: { groupes?: unknown; liste?: unknown }): { groupes: Groupe[]; liste: Liste | null } {
  const groupes: Groupe[] = [];
  if (r.groupes != null) {
    if (!Array.isArray(r.groupes) || r.groupes.length > 12) throw new AvanceInvalide('Groupes : 12 au plus.');
    for (const g0 of r.groupes as Groupe[]) {
      if (!g0 || !PORTEES.includes(g0.portee) || !['et', 'ou'].includes(g0.mode) || !Array.isArray(g0.conditions) || g0.conditions.length > 30) {
        throw new AvanceInvalide('Groupe mal formé (portée, mode ET / OU, 30 conditions au plus).');
      }
      const conditions = g0.conditions.map((c) => {
        const ch = CHAMPS[c?.champ];
        if (!ch) throw new AvanceInvalide(`Champ inconnu : ${String(c?.champ)}.`);
        if (!OPERATEURS[ch.type].includes(c.op)) throw new AvanceInvalide(`Opérateur « ${String(c.op)} » impossible sur « ${ch.libelle} ».`);
        const { champ, op, valeurs, min, max, de, a, n, unite: u, actif, id } = c;
        return { champ, op, valeurs, min, max, de, a, n, unite: u, actif, id };
      });
      groupes.push({ id: g0.id, portee: g0.portee, mode: g0.mode, exclure: !!g0.exclure, actif: g0.actif, conditions });
    }
  }
  let liste: Liste | null = null;
  if (r.liste != null) {
    const l = r.liste as Liste;
    if (!['vin', 'immat', 'nom', 'id_spark'].includes(l?.type) || !Array.isArray(l.valeurs) || l.valeurs.length > 20000
      || l.valeurs.some((v) => typeof v !== 'string' || v.length > 120)) {
      throw new AvanceInvalide('Liste collée : VIN, immatriculations, noms ou identifiants SPARK, 20 000 au plus.');
    }
    if (l.valeurs.length) liste = { type: l.type, valeurs: l.valeurs, exclure: !!l.exclure };
  }
  return { groupes, liste };
}

/** Champs exposés au navigateur (référentiels du mode avancé). */
export const CHAMPS_PUBLICS = Object.entries(CHAMPS).map(([cle, c]) => ({ cle, libelle: c.libelle, groupe: c.groupe, type: c.type, portee: c.portee, operateurs: OPERATEURS[c.type], suggestions: !!c.suggest }));

/** Suggestions de valeurs réelles (+ nombre) pour un champ texte suggérable, liste ou tableau ; sinon null. $1 = motif LIKE. */
export function suggestionsSQL(cle: string): string | null {
  const c = CHAMPS[cle];
  if (!c || !(c.suggest || c.type === 'liste' || c.type === 'tableau')) return null;
  const src = c.portee === 'vehicule' ? 'rcu.cv x' : 'rcu.client c';
  const filtre = c.portee === 'vehicule' ? 'true' : 'c.actif';
  const val = c.type === 'tableau' ? `unnest(${c.sql('x')})` : c.sql('x');
  return `select v, count(*)::int as n from (select (${val})::text as v from ${src} where ${filtre}) t
    where v is not null and v <> '' and upper(unaccent(v)) like $1 group by 1 order by 2 desc limit 30`;
}
