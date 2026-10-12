import { Router } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { ALL_SITES } from '../auth/siteScope';
import { prisma } from '../db';
import { CRM_ROLES } from '../auth/roles';
import { rcu, rcuConfigured } from '../rcu/db';

/**
 * Rubrique CRM — lecture du RCU (référentiel client unique), base dédiée du VPS.
 *
 * ⚠️ Données NOMINATIVES : chaque route est derrière CRM_ROLES (Master seul pendant la construction).
 * Lot 1 : le journal des imports. Les fiches clients arrivent au lot 2.
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

// GET /api/crm/apercu — volumes de la base (pas de donnée nominative).
router.get('/apercu', async (_req, res) => {
  const { rows } = await rcu().query(`
    select
      (select count(*)::int from rcu.identite_source) as identites,
      (select count(*)::int from rcu.vehicule) as vehicules,
      (select count(*)::int from rcu.vente where retenue and absente_depuis is null) as ventes_retenues,
      (select count(*)::int from rcu.vente where retenue and fin_fin between current_date and current_date + interval '6 months') as fins_financement_6_mois,
      (select json_object_agg(source, n) from (select source, count(*)::int n from rcu.vente group by source) s) as ventes_par_source`);
  res.json(rows[0]);
});

export default router;
