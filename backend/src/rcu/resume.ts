import { Pool, PoolClient } from 'pg';

/**
 * Résumé des clients RCU (colonnes de `rcu.client`) — SEULE porte de ce calcul, appelée par le rapprochement (tous les
 * clients) et par les décisions d'arbitrage (les clients touchés). Ensembliste : quelques secondes pour 150 000 clients.
 *
 * Règles (RCU-CADRAGE.md) : seules les ventes RETENUES et non disparues comptent ; identité affichée = celle de la vente la
 * plus récente ; site / vendeur / véhicule = ceux de la dernière vente ; financement = celui en cours dont le terme est le
 * plus proche ; civilité et type = fonctions `rcu.civilite_norm` / `rcu.type_personne` (003_clients.sql).
 * `recherche` = texte majuscule sans accents (noms, ville, CP, téléphones, e-mails, immatriculations compactées, VIN).
 */
export async function majResumes(db: Pool | PoolClient, ids: number[] | null = null): Promise<number> {
  const filtre = ids ? 'where ci.client_id = any($1::bigint[])' : '';
  const r = await db.query(`
    with ci as (
      select ci.client_id, i.* from rcu.client_identite ci join rcu.identite_source i on i.id = ci.identite_id ${filtre}
    ), iden as (
      select distinct on (client_id) client_id, civilite, nom, prenom, num_rue, type_rue, rue, cp, ville
      from ci order by client_id, derniere_vente desc nulls last, id desc
    ), ve as (
      select ci.client_id, v.* from ci join rcu.vente v on v.identite_id = ci.id where v.retenue and v.absente_depuis is null
    ), dern as (
      select distinct on (client_id) client_id, site, source, vehicule_id,
             (select x from unnest(vendeurs) x limit 1) as vendeur, coalesce(date_livraison, date_commande) as d
      from ve order by client_id, coalesce(date_livraison, date_commande) desc nulls last, id desc
    ), agg as (
      select client_id, array_remove(array_agg(distinct site), null) as sites, array_agg(distinct source) as sources,
             count(distinct vehicule_id)::int as nbv
      from ve group by client_id
    ), mq as (
      select ve.client_id, array_remove(array_agg(distinct vh.marque), null) as marques,
             string_agg(distinct concat_ws(' ', regexp_replace(vh.immat, '[^A-Z0-9]', '', 'g'), vh.vin), ' ') as rech
      from ve join rcu.vehicule vh on vh.id = ve.vehicule_id group by ve.client_id
    ), fin as (
      -- « Aucun » organisme avec un produit ou une échéance : saisie DCS incohérente (104 ventes) → organisme inconnu.
      select distinct on (client_id) client_id, fin_famille, nullif(fin_organisme, 'Aucun') as fin_organisme, fin_fin
      from ve where fin_fin >= current_date order by client_id, fin_fin
    ), sus as (
      -- trois jointures d'égalité (un OR dans la condition de jointure interdit l'index)
      select ci.client_id from ci join rcu.contact_suspect s on s.type = 'tel' and s.valeur = ci.tel_port
      union select ci.client_id from ci join rcu.contact_suspect s on s.type = 'tel' and s.valeur = ci.tel_dom
      union select ci.client_id from ci join rcu.contact_suspect s on s.type = 'email' and s.valeur = ci.email
    ), rech as (
      select client_id, string_agg(distinct concat_ws(' ', nom, prenom, nom_client, ville, cp, tel_port, tel_dom, email), ' ') as t
      from ci group by client_id
    ), n as (
      select iden.client_id,
        rcu.type_personne(iden.civilite, iden.nom, iden.prenom) as type,
        case when rcu.type_personne(iden.civilite, iden.nom, iden.prenom) = 'societe' then 'societe'
             else rcu.civilite_norm(iden.civilite) end as civilite,
        iden.civilite as civilite_dcs, iden.nom, iden.prenom, iden.num_rue, iden.type_rue, iden.rue, iden.cp, iden.ville,
        dern.site, coalesce(agg.sites, '{}') as sites, coalesce(mq.marques, '{}') as marques, coalesce(agg.sources, '{}') as sources,
        dern.d as derniere_vente, dern.source as source_derniere, dern.vehicule_id, coalesce(agg.nbv, 0) as nb_vehicules,
        dern.vendeur, fin.fin_famille, fin.fin_organisme, fin.fin_fin, sus.client_id is not null as suspect,
        upper(unaccent(concat_ws(' ', rech.t, mq.rech))) as recherche
      from iden
      left join dern on dern.client_id = iden.client_id
      left join agg on agg.client_id = iden.client_id
      left join mq on mq.client_id = iden.client_id
      left join fin on fin.client_id = iden.client_id
      left join sus on sus.client_id = iden.client_id
      left join rech on rech.client_id = iden.client_id
    )
    -- N'écrit que les lignes qui CHANGENT : réécrire 180 000 lignes chaque nuit recalculerait l'index trigramme pour rien.
    update rcu.client c set
      type = n.type, civilite = n.civilite, civilite_dcs = n.civilite_dcs, nom = n.nom, prenom = n.prenom, num_rue = n.num_rue,
      type_rue = n.type_rue, rue = n.rue, cp = n.cp, ville = n.ville, site = n.site, sites = n.sites, marques = n.marques,
      sources = n.sources, derniere_vente = n.derniere_vente, source_derniere = n.source_derniere, vehicule_id = n.vehicule_id,
      nb_vehicules = n.nb_vehicules, vendeur = n.vendeur, fin_famille = n.fin_famille, fin_organisme = n.fin_organisme,
      fin_fin = n.fin_fin, suspect = n.suspect, recherche = n.recherche
    from n
    where c.id = n.client_id
      and (c.type, c.civilite, c.civilite_dcs, c.nom, c.prenom, c.num_rue, c.type_rue, c.rue, c.cp, c.ville, c.site, c.sites,
           c.marques, c.sources, c.derniere_vente, c.source_derniere, c.vehicule_id, c.nb_vehicules, c.vendeur, c.fin_famille,
           c.fin_organisme, c.fin_fin, c.suspect, c.recherche)
      is distinct from
          (n.type, n.civilite, n.civilite_dcs, n.nom, n.prenom, n.num_rue, n.type_rue, n.rue, n.cp, n.ville, n.site, n.sites,
           n.marques, n.sources, n.derniere_vente, n.source_derniere, n.vehicule_id, n.nb_vehicules, n.vendeur, n.fin_famille,
           n.fin_organisme, n.fin_fin, n.suspect, n.recherche)`, ids ? [ids] : []);
  return r.rowCount ?? 0;
}
