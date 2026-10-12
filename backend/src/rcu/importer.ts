import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PoolClient } from 'pg';
import { rcu } from './db';
import { COLONNES_TAMPON, decouper, lire, Ligne, Source } from './parse';

/**
 * Import d'UN fichier DCS dans la base du RCU — une seule transaction, garde-fous compris.
 *
 * Étapes (RCU-CADRAGE.md § 6) :
 *   1. lecture et contrôles du fichier (titre, colonnes obligatoires, total annoncé) ;
 *   2. lignes normalisées → `rcu.tampon`, par lots ;
 *   3. garde-fou de volume : une chute de plus de 10 % par rapport au dernier import APPLIQUÉ de la même
 *      source refuse l'import (données de la veille conservées), sauf `force` ;
 *   4. mise à jour véhicules → identités → ventes, et marquage des ventes disparues (VN / VO, exports complets) ;
 *   5. journal `rcu.import_run` avec les compteurs du rapport.
 *
 * ⚠️ L'import n'écrit QUE dans la couche DCS (identite_source, vehicule, vente). Jamais dans ce que Bony saisit.
 */

const SEUIL_CHUTE = 0.10;
const TAILLE_LOT = 5000;

export interface ResultatImport {
  runId: number | null;
  source: Source | null;
  statut: 'applique' | 'refuse' | 'erreur' | 'deja_applique';
  message: string;
  stats: Record<string, unknown>;
}

/** Types SQL des colonnes du tampon, pour l'insertion par `unnest`. */
const TYPES: Partial<Record<keyof Ligne, string>> = {
  ligne: 'int', date_commande: 'date', date_immat: 'date', date_mec: 'date', date_livraison: 'date',
  ct_dernier: 'date', ct_prochain: 'date', fin_debut: 'date', fin_fin: 'date', fin_duree: 'int',
  garantie_km: 'int', montant_tarif: 'numeric', montant_reprise: 'numeric',
};

async function remplirTampon(client: PoolClient, runId: number, lignes: Ligne[]): Promise<void> {
  const cols = COLONNES_TAMPON;
  const sql = `insert into rcu.tampon (run_id, ${cols.join(', ')})
    select $1::int, * from unnest(${cols.map((c, i) => `$${i + 2}::${TYPES[c] ?? 'text'}[]`).join(', ')})`;
  for (let i = 0; i < lignes.length; i += TAILLE_LOT) {
    const lot = lignes.slice(i, i + TAILLE_LOT);
    await client.query(sql, [runId, ...cols.map((c) => lot.map((l) => l[c]))]);
  }
}

/** Met à jour la couche DCS à partir du tampon du run. Rend les compteurs du rapport. */
async function appliquer(client: PoolClient, runId: number, source: Source): Promise<Record<string, unknown>> {
  const n = async (sql: string, params: unknown[] = [runId]) => (await client.query(sql, params)).rowCount ?? 0;

  // Résolution : société, site, retenue / motif d'exclusion, financement. Une ligne par clé de vente :
  // le VO répète un dossier par vendeur (347 cas) → vendeurs agrégés, le reste pris sur la 1re ligne.
  await client.query(`
    create temp table r on commit drop as
    with vd as (
      select cle, array_agg(distinct vendeur order by vendeur) filter (where vendeur is not null) as vendeurs
      from rcu.tampon where run_id = $1 group by cle
    ), t as (
      select tp.*, vd.vendeurs, row_number() over (partition by tp.cle order by tp.ligne) as rang
      from rcu.tampon tp join vd on vd.cle = tp.cle where tp.run_id = $1
    )
    select t.*,
      coalesce(a.societe, case when $2::text = 'BSO' then 'BSO' else 'INCONNUE:' || coalesce(t.affaire, '?') end) as societe,
      a.code is not null as affaire_connue,
      case when $2::text = 'BSO' then bc.site
           else coalesce(sl.site, case when sl.affaire is null then a.site_defaut end) end as site,
      case
        when $2::text <> 'BSO' and a.code is not null and not a.retenue then 'Affaire écartée'
        when $2::text = 'VN' and coalesce(tv.retenu, false) = false then 'Type de vente : ' || coalesce(t.type_vente, '(vide)')
        when upper(coalesce(t.civilite, '')) = 'GROUPE BONY' then 'Civilité Groupe Bony'
      end as motif,
      case when $2::text = 'BSO' then
             case when t.fin_lib_org like '%DIAC%' then 'DIAC' when t.fin_lib_org is not null then 'Autre banque' end
           else coalesce(
             (select f.famille from rcu.ref_financement f where f.nature = 'organisme' and f.cle = t.fin_lib_org and t.fin_lib_org <> 'NE PLUS UTILISER'),
             (select f.famille from rcu.ref_financement f where f.nature = 'organisme' and f.cle = t.fin_code_org)) end as fin_organisme,
      coalesce(
        (select f.famille from rcu.ref_financement f where f.nature = 'produit' and f.cle = t.fin_lib_prod and t.fin_lib_prod <> 'NE PLUS UTILISER'),
        (select f.famille from rcu.ref_financement f where f.nature = 'produit' and f.cle = t.fin_code_prod)) as fin_famille,
      case when t.vin is not null and length(t.vin) >= 11 then t.vin
           when t.immat is not null then 'IMMAT:' || t.immat end as cle_vehicule,
      coalesce(t.num_client, 'SANS-NUMERO:' || t.cle) as numero,
      t.empreinte || ':' || coalesce(array_to_string(t.vendeurs, ','), '') as empreinte_vente
    from t
    left join rcu.ref_affaire a on a.code = t.affaire
    left join rcu.ref_site_libelle sl on sl.affaire = t.affaire and sl.libelle = t.site_lib
    left join rcu.ref_compte_bso bc on bc.compte = regexp_replace(coalesce(t.compte_evenement, ''), '_\\d{6}$', '')
    left join rcu.ref_type_vente tv on tv.libelle = t.type_vente
    where t.rang = 1`, [runId, source]);
  await client.query('analyze r');

  const stats: Record<string, unknown> = {};
  stats.ventes = (await client.query('select count(*)::int as c from r')).rows[0].c;
  stats.retenues = (await client.query('select count(*)::int as c from r where motif is null')).rows[0].c;
  stats.exclusions = (await client.query(
    `select motif, count(*)::int as nb from r where motif is not null group by motif order by nb desc`)).rows;
  stats.sitesAClasser = (await client.query(
    `select affaire, site_lib as libelle, compte_evenement, count(*)::int as nb from r
     where site is null and motif is null group by 1, 2, 3 order by nb desc limit 50`)).rows;
  stats.affairesInconnues = (await client.query(
    `select affaire, count(*)::int as nb from r where not affaire_connue and $1::text <> 'BSO' group by 1 order by nb desc`, [source])).rows;

  // Véhicules : attributs de la vente la plus récente du VIN (ou de l'immatriculation à défaut de VIN).
  const vehicules = await client.query(`
    insert into rcu.vehicule as v (cle, vin, immat, marque, modele, version, energie, genre, date_mec, date_immat,
                                   ct_dernier, ct_prochain, derniere_vente, dernier_run)
    select distinct on (cle_vehicule) cle_vehicule, case when cle_vehicule like 'IMMAT:%' then null else vin end,
           immat, marque, modele, version, energie, genre, date_mec, date_immat, ct_dernier, ct_prochain,
           coalesce(date_livraison, date_commande), $1
    from r where cle_vehicule is not null
    order by cle_vehicule, coalesce(date_livraison, date_commande) desc nulls last, ligne desc
    on conflict (cle) do update set
      immat = coalesce(excluded.immat, v.immat), marque = coalesce(excluded.marque, v.marque),
      modele = coalesce(excluded.modele, v.modele), version = coalesce(excluded.version, v.version),
      energie = coalesce(excluded.energie, v.energie), genre = coalesce(excluded.genre, v.genre),
      date_mec = coalesce(excluded.date_mec, v.date_mec), date_immat = coalesce(excluded.date_immat, v.date_immat),
      ct_dernier = coalesce(excluded.ct_dernier, v.ct_dernier), ct_prochain = coalesce(excluded.ct_prochain, v.ct_prochain),
      derniere_vente = greatest(excluded.derniere_vente, v.derniere_vente), dernier_run = excluded.dernier_run
    where excluded.derniere_vente is not distinct from v.derniere_vente
       or excluded.derniere_vente >= coalesce(v.derniere_vente, excluded.derniere_vente)
    returning (xmax = 0) as nouveau`, [runId]);
  stats.vehiculesNouveaux = vehicules.rows.filter((x) => x.nouveau).length;

  // Identités : attributs de la vente la plus récente de (source, société, numéro).
  const identites = await client.query(`
    insert into rcu.identite_source as i (source, societe, numero, civilite, nom_client, nom, prenom, num_rue, type_rue,
      rue, cp, ville, tel_dom, tel_port, email, derniere_vente, premier_run, dernier_run, empreinte)
    select distinct on (societe, numero) $2::text, societe, numero, civilite, nom_client, nom, prenom, num_rue, type_rue,
           rue, cp, ville, tel_dom, tel_port, email, coalesce(date_livraison, date_commande), $1, $1,
           md5(concat_ws('|', civilite, nom_client, nom, prenom, num_rue, type_rue, rue, cp, ville, tel_dom, tel_port, email))
    from r
    order by societe, numero, coalesce(date_livraison, date_commande) desc nulls last, ligne desc
    on conflict (source, societe, numero) do update set
      civilite = excluded.civilite, nom_client = excluded.nom_client, nom = excluded.nom, prenom = excluded.prenom,
      num_rue = excluded.num_rue, type_rue = excluded.type_rue, rue = excluded.rue, cp = excluded.cp,
      ville = excluded.ville, tel_dom = excluded.tel_dom, tel_port = excluded.tel_port, email = excluded.email,
      derniere_vente = excluded.derniere_vente, dernier_run = excluded.dernier_run, empreinte = excluded.empreinte
    returning (xmax = 0) as nouveau`, [runId, source]);
  stats.identitesNouvelles = identites.rows.filter((x) => x.nouveau).length;
  stats.identites = identites.rowCount;

  // Ventes : nouvelles / modifiées comptées AVANT l'écriture (une vente inchangée garde la même empreinte).
  const avant = (await client.query(`
    select count(*) filter (where ve.id is null)::int as nouvelles,
           count(*) filter (where ve.id is not null and ve.empreinte <> r.empreinte_vente)::int as modifiees,
           count(*) filter (where ve.absente_depuis is not null)::int as reapparues
    from r left join rcu.vente ve on ve.source = $1::text and ve.cle = r.cle`, [source])).rows[0];
  stats.ventesNouvelles = avant.nouvelles;
  stats.ventesModifiees = avant.modifiees;
  stats.ventesReapparues = avant.reapparues;
  const ventes = await client.query(`
    insert into rcu.vente as ve (source, cle, type_vh, affaire, societe, site, site_libelle, dossier, identite_id,
      vehicule_id, retenue, motif_exclusion, date_commande, date_livraison, type_vente, vendeurs, intermediaire,
      montant_tarif, montant_reprise, garantie_code, garantie_libelle, garantie_km, fin_organisme, fin_produit,
      fin_famille, fin_debut, fin_fin, fin_duree, fin_duree_calculee, compte_evenement, empreinte, premier_run, dernier_run)
    select $2::text, r.cle, r.type_vh, r.affaire, r.societe, r.site, coalesce(r.site_lib, r.compte_evenement), r.dossier, i.id, v.id,
      r.motif is null, r.motif, r.date_commande, r.date_livraison, r.type_vente, r.vendeurs, r.intermediaire,
      r.montant_tarif, r.montant_reprise, r.garantie_code, r.garantie_libelle, r.garantie_km, r.fin_organisme,
      coalesce(r.fin_lib_prod, r.fin_code_prod), r.fin_famille, r.fin_debut, r.fin_fin,
      -- Durée : celle du fichier si > 0, sinon calculée entre début et fin (la saisie à 0 est la règle au VO).
      case when coalesce(r.fin_duree, 0) > 0 then r.fin_duree
           when r.fin_debut is not null and r.fin_fin > r.fin_debut
             then (extract(year from age(r.fin_fin, r.fin_debut)) * 12 + extract(month from age(r.fin_fin, r.fin_debut)))::int end,
      coalesce(coalesce(r.fin_duree, 0) <= 0 and r.fin_debut is not null and r.fin_fin > r.fin_debut, false),
      r.compte_evenement, r.empreinte_vente, $1, $1
    from r
    join rcu.identite_source i on i.source = $2::text and i.societe = r.societe and i.numero = r.numero
    left join rcu.vehicule v on v.cle = r.cle_vehicule
    on conflict (source, cle) do update set
      type_vh = excluded.type_vh, affaire = excluded.affaire, societe = excluded.societe, site = excluded.site,
      site_libelle = excluded.site_libelle, dossier = excluded.dossier, identite_id = excluded.identite_id,
      vehicule_id = excluded.vehicule_id, retenue = excluded.retenue, motif_exclusion = excluded.motif_exclusion,
      date_commande = excluded.date_commande, date_livraison = excluded.date_livraison, type_vente = excluded.type_vente,
      vendeurs = excluded.vendeurs, intermediaire = excluded.intermediaire, montant_tarif = excluded.montant_tarif,
      montant_reprise = excluded.montant_reprise, garantie_code = excluded.garantie_code,
      garantie_libelle = excluded.garantie_libelle, garantie_km = excluded.garantie_km,
      fin_organisme = excluded.fin_organisme, fin_produit = excluded.fin_produit, fin_famille = excluded.fin_famille,
      fin_debut = excluded.fin_debut, fin_fin = excluded.fin_fin, fin_duree = excluded.fin_duree,
      fin_duree_calculee = excluded.fin_duree_calculee, compte_evenement = excluded.compte_evenement,
      empreinte = excluded.empreinte, dernier_run = excluded.dernier_run, absente_depuis = null
    `, [runId, source]);
  stats.ventesEcrites = ventes.rowCount;

  // Ventes disparues d'un export COMPLET (VN / VO) : jamais supprimées, marquées. L'ancienne base, importée
  // une fois, ne marque rien.
  stats.ventesDisparues = source === 'BSO' ? 0 : await n(
    `update rcu.vente set absente_depuis = now() where source = $2::text and dernier_run <> $1 and absente_depuis is null`,
    [runId, source]);
  return stats;
}

/** Importe un fichier. `force` passe outre le garde-fou de volume (jamais les contrôles de forme). */
export async function importerFichier(chemin: string, opts: { force?: boolean; recuLe?: Date } = {}): Promise<ResultatImport> {
  const brut = fs.readFileSync(chemin);
  const empreinte = crypto.createHash('sha256').update(brut).digest('hex');
  const nom = path.basename(chemin);
  const db = rcu();

  let fichier;
  try {
    fichier = decouper(new TextDecoder('windows-1252').decode(brut));
  } catch (e) {
    return { runId: null, source: null, statut: 'refuse', message: (e as Error).message, stats: {} };
  }
  const { source } = fichier;

  // Déjà appliqué = identique au DERNIER import appliqué de cette source. Pas « appliqué un jour » : après un import
  // forcé partiel, renvoyer le fichier complet de la veille doit le réappliquer, sinon la base resterait amputée.
  const dernier = await db.query(
    `select id, empreinte from rcu.import_run where source = $1 and statut = 'applique' order by id desc limit 1`, [source]);
  if (dernier.rows[0]?.empreinte === empreinte) {
    return { runId: dernier.rows[0].id, source, statut: 'deja_applique', message: `Fichier identique au dernier import appliqué (n° ${dernier.rows[0].id}).`, stats: {} };
  }
  const client = await db.connect();
  let runId: number | null = null;
  const t0 = Date.now();
  try {
    // Un seul import à la fois, même si deux workers tournaient par erreur.
    await client.query('select pg_advisory_lock(hashtext($1))', ['rcu-import']);
    runId = (await client.query(
      `insert into rcu.import_run (source, fichier, empreinte, recu_le, force) values ($1, $2, $3, $4, $5) returning id`,
      [source, nom, empreinte, opts.recuLe ?? null, !!opts.force])).rows[0].id;

    const refuser = async (message: string, stats: Record<string, unknown>): Promise<ResultatImport> => {
      await client.query(`update rcu.import_run set statut = 'refuse', fin = now(), message = $2, stats = $3 where id = $1`,
        [runId, message, stats]);
      return { runId, source, statut: 'refuse', message, stats };
    };

    const stats: Record<string, unknown> = { lignesLues: fichier.lignes.length, totalAnnonce: fichier.totalAnnonce };
    if (!fichier.complet) return await refuser('Ligne de total absente : fichier incomplet (dépôt en cours ou export interrompu).', stats);
    if (fichier.totalAnnonce != null && fichier.totalAnnonce !== fichier.lignes.length) {
      return await refuser(`Le total annoncé (${fichier.totalAnnonce}) ne correspond pas aux lignes lues (${fichier.lignes.length}).`, stats);
    }
    const lecture = lire(fichier);
    if (lecture.colonnesManquantes.length) {
      return await refuser(`Colonnes obligatoires absentes : ${lecture.colonnesManquantes.join(', ')}.`, stats);
    }
    stats.sansClient = lecture.sansClient;
    stats.lignesClient = lecture.lignes.length;

    // Garde-fou de volume, contre le dernier import appliqué de la même source.
    const prec = await client.query(
      `select (stats->>'lignesClient')::int as n from rcu.import_run where source = $1 and statut = 'applique' order by id desc limit 1`,
      [source]);
    const avant = prec.rows[0]?.n as number | undefined;
    if (avant && lecture.lignes.length < avant * (1 - SEUIL_CHUTE) && !opts.force) {
      return await refuser(
        `Volume en chute : ${lecture.lignes.length.toLocaleString('fr-FR')} lignes avec client contre ${avant.toLocaleString('fr-FR')} au dernier import (seuil ${SEUIL_CHUTE * 100} %). `
        + 'Données de la veille conservées. Le Master peut l’appliquer quand même depuis Gearbox si la baisse est réelle.', { ...stats, lignesAvant: avant });
    }

    await client.query('begin');
    await client.query('delete from rcu.tampon where run_id = $1', [runId]);
    await remplirTampon(client, runId!, lecture.lignes);
    // ⚠️ Sans statistiques, le planificateur croit le tampon vide et compare chaque ligne à chaque ligne
    // (360 000² sur l'ancienne base : plus de 10 minutes). ANALYZE après chaque remplissage.
    await client.query('analyze rcu.tampon');
    Object.assign(stats, await appliquer(client, runId!, source));
    await client.query('delete from rcu.tampon where run_id = $1', [runId]);
    stats.dureeSecondes = Math.round((Date.now() - t0) / 100) / 10;
    await client.query(`update rcu.import_run set statut = 'applique', fin = now(), stats = $2 where id = $1`, [runId, stats]);
    await client.query('commit');
    return { runId, source, statut: 'applique', message: 'Import appliqué.', stats };
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    const message = (e as Error).message;
    if (runId != null) {
      await client.query(`update rcu.import_run set statut = 'erreur', fin = now(), message = $2 where id = $1`, [runId, message]).catch(() => undefined);
    }
    return { runId, source, statut: 'erreur', message, stats: {} };
  } finally {
    await client.query('select pg_advisory_unlock(hashtext($1))', ['rcu-import']).catch(() => undefined);
    client.release();
  }
}
