import { Router } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { ALL_SITES } from '../auth/siteScope';
import { prisma } from '../db';
import { CRM_ROLES } from '../auth/roles';
import { PoolClient } from 'pg';
import { rcu, rcuConfigured } from '../rcu/db';
import { majResumes } from '../rcu/resume';
import { CHAMPS_PUBLICS, suggestionsSQL } from '../rcu/avance';
import { compterDetails } from '../rcu/requete';
import { COLONNES, COLONNES_APERCU, COLONNES_TABLEAU, TRIS, Requete, RequeteInvalide, compter, lignes, lireRequete } from '../rcu/requete';

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

// ─── Requêteur (lot 3) ────────────────────────────────────────────────────────────
// Toute la traduction requête → SQL est dans `rcu/requete.ts` (liste fermée de briques, valeurs en paramètres).

const requeteDe = (req: AuthRequest, res: any): Requete | null => {
  try { return lireRequete(req.body?.requete); } catch (e) {
    if (e instanceof RequeteInvalide) { res.status(400).json({ error: e.message }); return null; }
    throw e;
  }
};
const repondre = async (res: any, f: () => Promise<unknown>) => {
  try { res.json(await f()); } catch (e) {
    if (e instanceof RequeteInvalide) return res.status(400).json({ error: e.message });
    // 57014 = annulée par statement_timeout (garde-fou de rcu/requete.ts)
    if ((e as { code?: string }).code === '57014') return res.status(408).json({ error: 'La requête a pris trop de temps. Ajoutez un critère pour la resserrer.' });
    throw e;
  }
};

// GET /api/crm/requetes/referentiels — listes de choix des briques et colonnes exportables.
router.get('/requetes/referentiels', async (_req, res) => {
  const q = (sql: string) => rcu().query(sql).then((r) => r.rows.map((x) => x.v));
  const [zones, agents, vendeurs, marques, familles, types, sites] = await Promise.all([
    rcu().query(`select concession, departements from rcu.ref_zone order by concession`).then((r) => r.rows),
    q(`select intermediaire as v from rcu.cv where intermediaire is not null group by 1 order by count(*) desc, 1`),
    q(`select v from (select unnest(vendeurs) as v from rcu.cv where date_achat >= current_date - interval '3 years') x group by 1 having count(*) >= 5 order by 1`),
    q(`select marque as v from rcu.cv where marque is not null group by 1 order by count(*) desc`),
    q(`select fin_famille as v from rcu.cv where fin_famille is not null group by 1 order by count(*) desc`),
    q(`select type_vente as v from rcu.cv where type_vente is not null group by 1 order by count(*) desc`),
    q(`select site as v from rcu.cv where site is not null group by 1 order by 1`),
  ]);
  res.json({ zones, agents, vendeurs, marques, familles, types_vente: types, sites, champs: CHAMPS_PUBLICS,
    colonnes: COLONNES.map(({ cle, libelle, groupe }) => ({ cle, libelle, groupe })) });
});

// POST /api/crm/requetes/compter { requete } — le résultat en direct.
// Cache de 15 min, clé = requête + dernier rapprochement : la base ne bouge qu'à l'import du soir, et l'écran relance
// les mêmes comptes (estimations des recettes, impact de chaque « Sauf »), qui coûtent jusqu'à quelques secondes.
const cacheComptes = new Map<string, { t: number; v: unknown }>();
router.post('/requetes/compter', async (req: AuthRequest, res) => {
  const r = requeteDe(req, res); if (!r) return;
  await repondre(res, async () => {
    const run = (await rcu().query(`select max(id) as id from rcu.rapprochement_run where fin is not null`)).rows[0].id;
    const cle = `${run}|${JSON.stringify({ ...r, briques: r.briques.map(({ id, ...b }) => b) })}`;
    const c = cacheComptes.get(cle);
    if (c && Date.now() - c.t < 15 * 60 * 1000) return c.v;
    const v = await compter(r);
    if (cacheComptes.size > 500) cacheComptes.delete(cacheComptes.keys().next().value as string);
    cacheComptes.set(cle, { t: Date.now(), v });
    return v;
  });
});

// POST /api/crm/requetes/lignes { requete, page } — vue « Voir les clients » : 50 lignes par page, mêmes règles que l'export.
router.post('/requetes/lignes', async (req: AuthRequest, res) => {
  const r = requeteDe(req, res); if (!r) return;
  const page = Math.max(0, Math.min(2000, Math.floor(Number(req.body?.page) || 0)));
  const tri = typeof req.body?.tri === 'string' && req.body.tri in TRIS ? req.body.tri : 'recent';
  await repondre(res, async () => ({ page, taille: 50, tri, ...(await lignes(r, COLONNES_TABLEAU, 50, undefined, page * 50, tri)) }));
});

// POST /api/crm/requetes/details { requete } — mode avancé : clients après chaque groupe et chaque condition.
router.post('/requetes/details', async (req: AuthRequest, res) => {
  const r = requeteDe(req, res); if (!r) return;
  await repondre(res, () => compterDetails(r));
});

// GET /api/crm/requetes/valeurs?champ=veh.modele&q=cli — valeurs réelles d'un champ (mode avancé), avec leur nombre.
router.get('/requetes/valeurs', async (req, res) => {
  const sql = suggestionsSQL(String(req.query.champ ?? ''));
  if (!sql) return res.status(400).json({ error: 'Ce champ ne propose pas de valeurs.' });
  const q = String(req.query.q ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[%_\\]/g, '').slice(0, 60);
  const { rows } = await rcu().query(sql, [`${q}%`]);
  res.json(rows);
});

// POST /api/crm/requetes/apercu { requete } — 20 lignes, colonnes par défaut.
router.post('/requetes/apercu', async (req: AuthRequest, res) => {
  const r = requeteDe(req, res); if (!r) return;
  await repondre(res, async () => ({ lignes: (await lignes(r, COLONNES_APERCU, 20)).lignes }));
});

// POST /api/crm/requetes/export — lignes à mettre en fichier (le navigateur fabrique le fichier). TOUJOURS journalisé,
// avec la liste des clients exportés (lot 4 : « déjà ciblés »). Ouvert à tous les rôles du CRM (décision de Théo).
const FORMATS = ['excel', 'sarbacane', 'allmysms', 'phoning', 'courrier'];
router.post('/requetes/export', async (req: AuthRequest, res) => {
  const r = requeteDe(req, res); if (!r) return;
  const { colonnes, format, fichier, requete_id, requete_nom } = req.body ?? {};
  if (!Array.isArray(colonnes) || !FORMATS.includes(format) || typeof fichier !== 'string' || !fichier || fichier.length > 200) {
    return res.status(400).json({ error: 'Colonnes, format ou nom de fichier invalides.' });
  }
  const auteur = await nomDe(req);
  await repondre(res, async () => {
    const out = await lignes(r, colonnes.map(String), 100000);
    const db = await rcu().connect();
    try {
      await db.query('begin');
      const id = Number((await db.query(`insert into rcu.export_journal (auteur_id, auteur, format, fichier, requete_id, requete_nom, spec, nb_lignes)
        values ($1, $2, $3, $4, (select id from rcu.requete where id = $5), $6, $7, $8) returning id`,
      [req.user!.id, auteur, format, fichier, Number(requete_id) || null, typeof requete_nom === 'string' ? requete_nom.slice(0, 200) : null, r, out.lignes.length])).rows[0].id);
      const ids = [...new Set(out.lignes.map((l) => Number(l.client_id)))];
      await db.query(`insert into rcu.export_client (export_id, client_id) select $1, unnest($2::bigint[])`, [id, ids]);
      await db.query('commit');
      return { export_id: id, ...out };
    } catch (e) { await db.query('rollback').catch(() => undefined); throw e; } finally { db.release(); }
  });
});

// GET /api/crm/exports — journal (200 derniers).
router.get('/exports', async (_req, res) => {
  const { rows } = await rcu().query(`select id, cree_le, auteur, format, fichier, requete_nom, nb_lignes
    from rcu.export_journal order by id desc limit 200`);
  res.json(rows);
});

// Requêtes enregistrées : les miennes + les partagées. Modifier / supprimer : l'auteur seulement.
router.get('/requetes', async (req: AuthRequest, res) => {
  const { rows } = await rcu().query(`select id, nom, spec as requete, partagee, auteur, auteur_id, cree_le, maj_le, dernier_compte, dernier_lancement
    from rcu.requete where auteur_id = $1 or partagee order by maj_le desc`, [req.user!.id]);
  res.json(rows);
});
const corpsRequete = (req: AuthRequest, res: any) => {
  const { nom, partagee } = req.body ?? {};
  if (typeof nom !== 'string' || !nom.trim() || nom.length > 120) { res.status(400).json({ error: 'Nom de requête invalide.' }); return null; }
  const r = requeteDe(req, res); if (!r) return null;
  return { nom: nom.trim(), partagee: !!partagee, r };
};
router.post('/requetes', async (req: AuthRequest, res) => {
  const c = corpsRequete(req, res); if (!c) return;
  const { rows } = await rcu().query(`insert into rcu.requete (nom, spec, partagee, auteur_id, auteur) values ($1, $2, $3, $4, $5) returning id`,
    [c.nom, c.r, c.partagee, req.user!.id, await nomDe(req)]);
  res.json({ id: rows[0].id });
});
router.put('/requetes/:id', async (req: AuthRequest, res) => {
  const c = corpsRequete(req, res); if (!c) return;
  const r = await rcu().query(`update rcu.requete set nom = $1, spec = $2, partagee = $3, maj_le = now() where id = $4 and auteur_id = $5`,
    [c.nom, c.r, c.partagee, Number(req.params.id), req.user!.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Requête introuvable, ou vous n’en êtes pas l’auteur.' });
  res.json({ ok: true });
});
router.delete('/requetes/:id', async (req: AuthRequest, res) => {
  const r = await rcu().query(`delete from rcu.requete where id = $1 and auteur_id = $2`, [Number(req.params.id), req.user!.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Requête introuvable, ou vous n’en êtes pas l’auteur.' });
  res.json({ ok: true });
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
