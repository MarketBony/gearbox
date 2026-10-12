import { Router } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { ALL_SITES } from '../auth/siteScope';
import { prisma } from '../db';
import { CRM_ROLES } from '../auth/roles';
import { PoolClient } from 'pg';
import { rcu, rcuConfigured } from '../rcu/db';
import { majResumes } from '../rcu/resume';

/**
 * Rubrique CRM — lecture du RCU (référentiel client unique), base dédiée du VPS.
 *
 * ⚠️ Données NOMINATIVES : chaque route est derrière CRM_ROLES (Master seul pendant la construction).
 * Lot 1 : journal des imports. Lot 2 : clients (liste paginée, fiche), arbitrage, séparation.
 * Contrat d'API : ui2/apps/crm/CONTRAT-API.md.
 */
const router = Router();

router.use(authenticateToken, requireRole(CRM_ROLES));
router.use((_req, res, next) => {
  if (!rcuConfigured()) return res.status(503).json({ error: 'La base du CRM n\'est pas configurée sur ce serveur.' });
  next();
});

// GET /api/crm/imports — les 100 derniers imports, toutes sources, avec leurs compteurs, et la demande
// « appliquer quand même » en attente le cas échéant.
router.get('/imports', async (_req, res) => {
  const { rows } = await rcu().query(
    `select r.id, r.source, r.fichier, r.empreinte, r.recu_le, r.debut, r.fin, r.statut, r.force, r.stats, r.message,
            d.cree_le as force_demande_le, d.demandeur as force_demandeur
     from rcu.import_run r
     left join rcu.import_demande d on d.run_id = r.id and d.traitee_le is null
     order by r.id desc limit 100`);
  res.json(rows);
});

const nomDe = async (req: AuthRequest) =>
  (await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } }))?.name ?? req.user!.id;

// POST /api/crm/imports/:id/forcer — « Appliquer quand même » un import REFUSÉ par le garde-fou de volume.
// Seul le worker a le fichier (archive du VPS) : on inscrit une demande, qu'il traite dans la minute.
router.post('/imports/:id/forcer', async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const run = (await rcu().query(`select statut, stats from rcu.import_run where id = $1`, [id])).rows[0];
  if (!run) return res.status(404).json({ error: 'Import introuvable.' });
  // Seul un refus de VOLUME se force : un fichier sans total, au total faux ou sans colonne obligatoire n'est pas lisible.
  if (run.statut !== 'refuse' || run.stats?.lignesAvant == null) {
    return res.status(400).json({ error: 'Seul un import refusé pour baisse de volume peut être appliqué de force.' });
  }
  await rcu().query(
    `insert into rcu.import_demande (run_id, demandeur) values ($1, $2) on conflict do nothing`, [id, await nomDe(req)]);
  res.json({ ok: true });
});

// POST /api/crm/sites — « Classer… » un libellé de site inconnu. Effet au prochain import.
//   VN / VO : { affaire, libelle, site } → ref_site_libelle ; ancienne base : { compte, site } → ref_compte_bso.
router.post('/sites', async (req: AuthRequest, res) => {
  const { affaire, libelle, compte, site } = req.body ?? {};
  if (typeof site !== 'string' || !ALL_SITES.includes(site)) return res.status(400).json({ error: 'Site Gearbox inconnu.' });
  const auteur = await nomDe(req);
  if (typeof compte === 'string' && compte) {
    const cle = compte.toUpperCase().replace(/_\d{6}$/, '');
    await rcu().query(
      `insert into rcu.ref_compte_bso (compte, site, note) values ($1, $2, $3)
       on conflict (compte) do update set site = excluded.site, note = excluded.note`, [cle, site, `Classé par ${auteur}`]);
    return res.json({ ok: true });
  }
  if (typeof affaire !== 'string' || typeof libelle !== 'string' || !affaire || !libelle) {
    return res.status(400).json({ error: 'Affaire et libellé requis.' });
  }
  const connue = await rcu().query(`select 1 from rcu.ref_affaire where code = $1`, [affaire.toUpperCase()]);
  if (!connue.rowCount) return res.status(400).json({ error: `Affaire ${affaire} absente de la table des affaires.` });
  await rcu().query(
    `insert into rcu.ref_site_libelle (affaire, libelle, site, ajoute_par, ajoute_le) values ($1, $2, $3, $4, now())
     on conflict (affaire, libelle) do update set site = excluded.site, ajoute_par = excluded.ajoute_par, ajoute_le = now()`,
    [affaire.toUpperCase(), libelle.toUpperCase(), site, auteur]);
  res.json({ ok: true });
});

// GET /api/crm/apercu — volumes (aucune donnée nominative).
router.get('/apercu', async (_req, res) => {
  const { rows } = await rcu().query(`
    select
      (select count(*)::int from rcu.client where actif) as clients,
      (select count(*)::int from rcu.client where actif and type = 'societe') as societes,
      (select count(*)::int from rcu.vehicule) as vehicules,
      (select count(*)::int from rcu.client where actif and fin_fin < current_date + interval '6 months') as fins_6_mois,
      (select count(*)::int from rcu.candidat ca join rcu.client a on a.id = ca.client_a and a.actif
         join rcu.client b on b.id = ca.client_b and b.actif) as a_arbitrer,
      (select count(*)::int from rcu.client where actif and suspect) as suspects,
      (select count(*)::int from rcu.identite_source) as identites,
      (select json_agg(x) from (select distinct on (source) source, id, statut, fin from rcu.import_run order by source, id desc) x) as imports`);
  res.json(rows[0]);
});

// ─── Clients ──────────────────────────────────────────────────────────────────────

/** Colonnes d'une ligne de liste (`ClientRow` du contrat). */
const COLS_CLIENT = `c.id, c.type, c.civilite, c.civilite_dcs, c.nom, c.prenom, c.cp, c.ville, c.site, c.sites, c.marques,
  to_char(c.derniere_vente, 'YYYY-MM-DD') as derniere_vente, c.source_derniere,
  case when v.id is null then null else json_build_object('marque', v.marque, 'modele', v.modele, 'immat', v.immat) end as vehicule,
  c.nb_vehicules, c.vendeur,
  case when c.fin_fin is null then null else json_build_object('famille', c.fin_famille, 'organisme', c.fin_organisme,
    'fin', to_char(c.fin_fin, 'YYYY-MM-DD')) end as fin,
  c.suspect`;

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
/** Termes de recherche. Téléphone, plaque, VIN se cherchent COMPACTS (forme stockée dans `recherche`) ; un nom mot par
 *  mot (« jean dupont » trouve « DUPONT JEAN »). */
export function termesRecherche(q: string): string[] {
  const brut = q.trim();
  if (!brut) return [];
  const compact = sansAccents(brut).replace(/[\s.\-]/g, '');
  if (/^\+?\d{6,}$/.test(compact)) return [compact.replace(/^\+33/, '0').replace(/^0033/, '0')];
  if (brut.includes('@')) return [sansAccents(brut)];
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(compact) || /^\d{1,4}[A-Z]{1,3}\d{2,3}$/.test(compact)) return [compact];
  if (/^[A-Z0-9]{8,17}$/.test(compact) && /\d/.test(compact) && /[A-Z]/.test(compact)) return [compact];
  return sansAccents(brut).split(/[^A-Z0-9@.]+/).filter((t) => t.length >= 2);
}

const liste = (v: unknown) => (typeof v === 'string' && v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);

// GET /api/crm/clients — liste paginée PAR LE SERVEUR (50 lignes), recherche et filtres.
router.get('/clients', async (req, res) => {
  const p: unknown[] = [];
  const w: string[] = ['c.actif'];
  const arg = (v: unknown) => { p.push(v); return `$${p.length}`; };
  for (const t of termesRecherche(String(req.query.q ?? ''))) w.push(`c.recherche like ${arg(`%${t}%`)}`);
  const sites = liste(req.query.sites); if (sites.length) w.push(`c.sites && ${arg(sites)}::text[]`);
  const marques = liste(req.query.marques).map((m) => m.toUpperCase()); if (marques.length) w.push(`c.marques && ${arg(marques)}::text[]`);
  if (req.query.type === 'particulier' || req.query.type === 'societe') w.push(`c.type = ${arg(req.query.type)}`);
  if (['VN', 'VO', 'BSO'].includes(String(req.query.vh))) w.push(`${arg(req.query.vh)} = any(c.sources)`);
  const fam = liste(req.query.fam); if (fam.length) w.push(`c.fin_famille = any(${arg(fam)}::text[])`);
  const ech = Number(req.query.ech); if ([3, 6, 12].includes(ech)) w.push(`c.fin_fin < current_date + make_interval(months => ${arg(ech)}::int)`);
  if (req.query.suspect === '1' || req.query.suspect === 'true') w.push('c.suspect');
  const ordre = req.query.sort === 'nom' ? 'c.nom, c.prenom, c.id'
    : req.query.sort === 'fin' ? 'c.fin_fin nulls last, c.id' : 'c.derniere_vente desc nulls last, c.id';
  const page = Math.max(0, Math.floor(Number(req.query.page) || 0)), taille = 50;
  const where = w.join(' and ');
  const [total, rows] = await Promise.all([
    rcu().query(`select count(*)::int as n from rcu.client c where ${where}`, p),
    rcu().query(`select ${COLS_CLIENT} from rcu.client c left join rcu.vehicule v on v.id = c.vehicule_id
                 where ${where} order by ${ordre} limit ${taille} offset ${page * taille}`, p),
  ]);
  res.json({ total: total.rows[0].n, page, taille, rows: rows.rows });
});

/** Fiche complète d'un client. null si inconnu ; { redirect } s'il a été absorbé par un autre. */
async function fiche(id: number): Promise<any> {
  const db = rcu();
  const c = (await db.query(`select ${COLS_CLIENT}, c.num_rue, c.type_rue, c.rue, c.actif, c.fusionne_dans
    from rcu.client c left join rcu.vehicule v on v.id = c.vehicule_id where c.id = $1`, [id])).rows[0];
  if (!c) return null;
  if (!c.actif && c.fusionne_dans) return { redirect: Number(c.fusionne_dans) };
  const [contacts, vehicules, ventes, identites] = await Promise.all([
    db.query(`
      with i as (
        select i.* from rcu.client_identite ci join rcu.identite_source i on i.id = ci.identite_id where ci.client_id = $1
      ), k as (
        select case when tel_port ~ '^0[67]' then 'portable' else 'fixe' end as type, tel_port as valeur, source, derniere_vente from i where tel_port is not null
        union all select case when tel_dom ~ '^0[67]' then 'portable' else 'fixe' end, tel_dom, source, derniere_vente from i where tel_dom is not null
        union all select 'email', email, source, derniere_vente from i where email is not null
      )
      select k.type, k.valeur, case when s.valeur is null then 'valide' else 'suspect' end as etat, s.motif,
             array_agg(distinct k.source) as sources, to_char(max(k.derniere_vente), 'YYYY-MM-DD') as derniere_vue
      from k left join rcu.contact_suspect s on s.type = (case when k.type = 'email' then 'email' else 'tel' end) and s.valeur = k.valeur
      group by k.type, k.valeur, s.valeur, s.motif order by max(k.derniere_vente) desc nulls last`, [id]),
    db.query(`
      with mes as (select distinct v.vehicule_id from rcu.vente v join rcu.client_identite ci on ci.identite_id = v.identite_id
                   where ci.client_id = $1 and v.vehicule_id is not null),
      derniere as (select distinct on (v.vehicule_id) v.vehicule_id, ci.client_id from rcu.vente v
                   join mes on mes.vehicule_id = v.vehicule_id left join rcu.client_identite ci on ci.identite_id = v.identite_id
                   order by v.vehicule_id, coalesce(v.date_livraison, v.date_commande) desc nulls last, v.id desc)
      select vh.id, vh.vin, vh.immat, vh.marque, vh.modele, vh.version, vh.energie, vh.genre,
             to_char(vh.date_mec, 'YYYY-MM-DD') as date_mec, to_char(vh.ct_dernier, 'YYYY-MM-DD') as ct_dernier,
             to_char(vh.ct_prochain, 'YYYY-MM-DD') as ct_prochain, coalesce(d.client_id = $1, false) as actuel,
             to_char(vh.derniere_vente, 'YYYY-MM-DD') as derniere_vente
      from mes join rcu.vehicule vh on vh.id = mes.vehicule_id join derniere d on d.vehicule_id = mes.vehicule_id
      order by coalesce(d.client_id = $1, false) desc, vh.derniere_vente desc nulls last`, [id]),
    db.query(`
      select v.id, v.source, v.type_vh, to_char(v.date_commande, 'YYYY-MM-DD') as date_commande,
             to_char(v.date_livraison, 'YYYY-MM-DD') as date_livraison, v.affaire, v.dossier, v.site, coalesce(v.vendeurs, '{}') as vendeurs,
             v.intermediaire, v.type_vente, v.montant_tarif::float as montant_tarif, v.montant_reprise::float as montant_reprise,
             v.vehicule_id, v.retenue, v.motif_exclusion, v.absente_depuis,
             case when v.fin_organisme is null and v.fin_famille is null and v.fin_fin is null then null else json_build_object(
               'organisme', case when v.fin_organisme = 'Aucun' and (v.fin_famille is not null or v.fin_fin is not null) then null else v.fin_organisme end, 'famille', v.fin_famille, 'produit', v.fin_produit, 'debut', to_char(v.fin_debut, 'YYYY-MM-DD'),
               'fin', to_char(v.fin_fin, 'YYYY-MM-DD'), 'duree', v.fin_duree, 'duree_calculee', v.fin_duree_calculee) end as fin,
             case when v.garantie_libelle is null or v.garantie_libelle = 'AUCUN' then null else json_build_object(
               'code', v.garantie_code, 'libelle', v.garantie_libelle, 'km', v.garantie_km) end as garantie
      from rcu.vente v join rcu.client_identite ci on ci.identite_id = v.identite_id
      where ci.client_id = $1 order by coalesce(v.date_livraison, v.date_commande) desc nulls last, v.id desc`, [id]),
    db.query(`
      select i.id, i.source, i.societe, i.numero, i.nom, i.prenom, i.cp, i.ville, ci.regle
      from rcu.client_identite ci join rcu.identite_source i on i.id = ci.identite_id
      where ci.client_id = $1 order by i.derniere_vente desc nulls last, i.id`, [id]),
  ]);
  delete c.actif; delete c.fusionne_dans;
  return { client: c, contacts: contacts.rows, vehicules: vehicules.rows, ventes: ventes.rows, identites: identites.rows };
}

// GET /api/crm/clients/:id
router.get('/clients/:id', async (req, res) => {
  const f = await fiche(Number(req.params.id));
  if (!f) return res.status(404).json({ error: 'Client introuvable.' });
  res.json(f);
});

// ─── Arbitrage ────────────────────────────────────────────────────────────────────

const identitesDe = async (db: PoolClient, client: number): Promise<number[]> =>
  (await db.query(`select identite_id from rcu.client_identite where client_id = $1 order by identite_id`, [client])).rows.map((r) => Number(r.identite_id));

/** Inscrit une décision par paire d'identités (a < b) ; chaque rapprochement la rejoue. */
async function decider(db: PoolClient, as: number[], bs: number[], decision: 'fusion' | 'separation', auteur: string) {
  const pa: number[] = [], pb: number[] = [];
  for (const x of as) for (const y of bs) { pa.push(Math.min(x, y)); pb.push(Math.max(x, y)); }
  await db.query(`insert into rcu.decision (identite_a, identite_b, decision, auteur)
    select x.a, x.b, $3::text, $4::text from unnest($1::bigint[], $2::bigint[]) as x(a, b)
    on conflict (identite_a, identite_b) do update set decision = excluded.decision, auteur = excluded.auteur, cree_le = now()`,
  [pa, pb, decision, auteur]);
}

// GET /api/crm/arbitrage?offset=0 — 5 paires proposées (même nom, prénom et CP, sans coordonnée commune).
router.get('/arbitrage', async (req, res) => {
  const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
  const base = `from rcu.candidat ca join rcu.client a on a.id = ca.client_a and a.actif join rcu.client b on b.id = ca.client_b and b.actif`;
  const total = (await rcu().query(`select count(*)::int as n ${base}`)).rows[0].n;
  const paires = (await rcu().query(`select ca.client_a, ca.client_b, ca.raison ${base} order by ca.client_a, ca.client_b limit 5 offset $1`, [offset])).rows;
  const out = [];
  for (const p of paires) {
    const [a, b] = await Promise.all([fiche(Number(p.client_a)), fiche(Number(p.client_b))]);
    if (a && b && !a.redirect && !b.redirect) out.push({ a, b, raison: p.raison });
  }
  res.json({ total, paires: out });
});

// POST /api/crm/arbitrage { a, b, decision } — effet immédiat, rejoué à chaque rapprochement.
router.post('/arbitrage', async (req: AuthRequest, res) => {
  const a = Number(req.body?.a), b = Number(req.body?.b), decision = req.body?.decision;
  if (!a || !b || a === b || !['fusion', 'separation'].includes(decision)) return res.status(400).json({ error: 'Paire ou décision invalide.' });
  const auteur = await nomDe(req);
  const db = await rcu().connect();
  try {
    await db.query('begin');
    const actifs = (await db.query(`select id from rcu.client where id = any($1::bigint[]) and actif`, [[a, b]])).rowCount;
    if (actifs !== 2) { await db.query('rollback'); return res.status(409).json({ error: 'Un des deux clients a déjà changé : rechargez.' }); }
    const [ia, ib] = [await identitesDe(db, a), await identitesDe(db, b)];
    await decider(db, ia, ib, decision, auteur);
    await db.query(`delete from rcu.candidat where client_a = least($1::bigint, $2::bigint) and client_b = greatest($1::bigint, $2::bigint)`, [a, b]);
    let garde = a;
    if (decision === 'fusion') {
      garde = Math.min(a, b); const absorbe = Math.max(a, b); // le plus ancien survit
      await db.query(`update rcu.client_identite set client_id = $1, regle = 'Fusion décidée à la main' where client_id = $2`, [garde, absorbe]);
      await db.query(`update rcu.client set actif = false, fusionne_dans = $1 where id = $2`, [garde, absorbe]);
      await db.query(`delete from rcu.candidat where client_a = $1 or client_b = $1`, [absorbe]);
      await majResumes(db, [garde]);
    }
    await db.query('commit');
    res.json({ ok: true, client: garde });
  } catch (e) {
    await db.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    db.release();
  }
});

// POST /api/crm/clients/:id/separer { identite } — sort une identité de son client (nouveau client), décision rejouée.
router.post('/clients/:id/separer', async (req: AuthRequest, res) => {
  const id = Number(req.params.id), identite = Number(req.body?.identite);
  const auteur = await nomDe(req);
  const db = await rcu().connect();
  try {
    await db.query('begin');
    const autres = (await identitesDe(db, id)).filter((x) => x !== identite);
    const lien = (await db.query(`select 1 from rcu.client_identite where client_id = $1 and identite_id = $2`, [id, identite])).rowCount;
    if (!lien || !autres.length) { await db.query('rollback'); return res.status(400).json({ error: 'Cette identité ne peut pas être séparée de ce client.' }); }
    await decider(db, [identite], autres, 'separation', auteur);
    const nouveau = Number((await db.query(`insert into rcu.client default values returning id`)).rows[0].id);
    await db.query(`update rcu.client_identite set client_id = $1, regle = 'Séparée à la main' where identite_id = $2`, [nouveau, identite]);
    await majResumes(db, [id, nouveau]);
    await db.query('commit');
    res.json({ ok: true, client: nouveau });
  } catch (e) {
    await db.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    db.release();
  }
});

export default router;
