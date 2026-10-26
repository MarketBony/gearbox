import { Router } from 'express';
import { PoolClient } from 'pg';
import { authenticateToken, AuthRequest } from '../auth/middleware';
import { requireCrm } from '../auth/crmAccess';
import { rcu, rcuConfigured } from '../rcu/db';
import { CANAUX, TYPES_ECHANGE } from '../rcu/bony';
import { chargerVendeurs, majAlias, recalculer } from '../rcu/portefeuille';
import { norm } from '../rcu/rapprochement';
import { nomDe } from './crm';

/**
 * SPARK lot 4 — onglet Équipes (référentiel vendeurs, noms DCS, règles, à attribuer) et couche Bony de la fiche client
 * (portefeuille, ne plus contacter, échanges). Monté sur /api/crm, derrière `requireCrm` (auth/crmAccess.ts) comme le reste de SPARK.
 * Toute décision de portefeuille passe par `rcu/portefeuille.ts` (seule porte) ; ici on n'écrit que des choix humains.
 */
const router = Router();
router.use(authenticateToken, requireCrm);
router.use((_req, res, next) => {
  if (!rcuConfigured()) return res.status(503).json({ error: 'La base du CRM n\'est pas configurée sur ce serveur.' });
  next();
});

const MARQUES = ['RENAULT', 'DACIA', 'ALPINE', 'NISSAN', 'MOBILIZE'];
const FONCTIONS = ['hall', 'secteur', 'societes', 'magasin', 'alternant'];
const ROLES_ENC = ['chef_de_site', 'chef_de_vente_vn', 'chef_de_vente_vo'];
const ZONE = /^([0-9]{2}|2[AB])([0-9]{3})?$/;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
class Invalide extends Error {}
const txt = (v: unknown, max = 120, req = false): string | null => {
  if (v == null || v === '') { if (req) throw new Invalide('Champ obligatoire manquant.'); return null; }
  if (typeof v !== 'string' || v.length > max) throw new Invalide('Texte invalide.');
  return v.trim() || (req ? (() => { throw new Invalide('Champ obligatoire manquant.'); })() : null);
};
const jour = (v: unknown): string | null => { if (v == null || v === '') return null; if (typeof v !== 'string' || !JOUR.test(v)) throw new Invalide('Date AAAA-MM-JJ attendue.'); return v; };
const ids = (v: unknown, max = 5000): number[] => {
  if (!Array.isArray(v) || !v.length || v.length > max || v.some((x) => !Number.isInteger(Number(x)))) throw new Invalide('Liste de clients invalide.');
  return v.map(Number);
};
/** Exécute une route et traduit les erreurs de saisie en 400. */
const route = (f: (req: AuthRequest, res: any) => Promise<unknown>) => async (req: AuthRequest, res: any) => {
  try { const r = await f(req, res); if (!res.headersSent) res.json(r ?? { ok: true }); } catch (e) {
    if (e instanceof Invalide) return res.status(400).json({ error: e.message });
    if ((e as { code?: string }).code === '23503') return res.status(400).json({ error: 'Référence inconnue (site, vendeur).' });
    throw e;
  }
};
/** Après un changement du référentiel : noms DCS puis portefeuilles (si le calcul est activé). Rend le résultat. */
const recalcul = async (declencheur = 'référentiel') => { await majAlias(rcu()); return recalculer({ declencheur }); };
const journal = (db: PoolClient | ReturnType<typeof rcu>, id: number, texte: string, par: string) =>
  db.query(`insert into rcu.vendeur_journal (vendeur_id, texte, par) values ($1, $2, $3)`, [id, texte, par]);

// ─── Organisation ────────────────────────────────────────────────────────────────────

// GET /api/crm/equipes — sites, encadrement, vendeurs (avec portefeuille), réglages, compteurs des files.
router.get('/equipes', route(async () => {
  const db = rcu();
  const [sites, enc, vend, alias, param, att, run] = await Promise.all([
    db.query(`select site, plaque, ordre from rcu.equipe_site where archive_le is null order by plaque, ordre, site`),
    db.query(`select site, role, nom, user_id from rcu.encadrement`),
    chargerVendeurs(db),
    db.query(`select vendeur_id, array_agg(libelle order by libelle) as noms from rcu.vendeur_alias where vendeur_id is not null and etat in ('auto', 'valide') group by 1`),
    db.query(`select actif, anciennete_ans, maj_le, maj_par from rcu.portefeuille_param where id = 1`),
    db.query(`select c.site, count(*)::int as n from rcu.portefeuille p join rcu.client c on c.id = p.client_id where p.vendeur_id is null group by 1`),
    db.query(`select id, fin, changements from rcu.portefeuille_run where fin is not null order by id desc limit 1`),
  ]);
  const pf = (await db.query(`select p.vendeur_id, count(*)::int as n, count(x.intermediaire)::int as agent,
      count(*) filter (where p.origine not in ('achat', 'garde', 'manuel'))::int as reattrib
    from rcu.portefeuille p left join rcu.cv x on x.vente_id = p.vente_ref where p.vendeur_id is not null group by 1`)).rows;
  const det = (await db.query(`select id, ipn, telephone, email, note, archive_le from rcu.vendeur`)).rows;
  const noms = new Map(alias.rows.map((r) => [r.vendeur_id, r.noms]));
  const pfm = new Map(pf.map((r) => [r.vendeur_id, r])), dm = new Map(det.map((r) => [r.id, r]));
  const aValider = (await db.query(`select count(*)::int as n from rcu.vendeur_alias where etat = 'propose'`)).rows[0].n;
  return {
    sites: sites.rows, encadrement: enc.rows, parametres: param.rows[0], dernier_calcul: run.rows[0] ?? null,
    a_valider: aValider, a_attribuer: att.rows,
    vendeurs: vend.map((v) => ({ ...v, ...dm.get(v.id), noms_dcs: noms.get(v.id) ?? [], portefeuille: pfm.get(v.id)?.n ?? 0,
      via_agent: pfm.get(v.id)?.agent ?? 0, reattribues: pfm.get(v.id)?.reattrib ?? 0 })),
  };
}));

// GET /api/crm/equipes/vendeurs/:id — fiche : journal, portefeuille par marque et par origine.
router.get('/equipes/vendeurs/:id', route(async (req, res) => {
  const id = Number(req.params.id), db = rcu();
  const v = (await db.query(`select id from rcu.vendeur where id = $1`, [id])).rows[0];
  if (!v) return res.status(404).json({ error: 'Vendeur introuvable.' });
  const [j, m, o] = await Promise.all([
    db.query(`select texte, par, le from rcu.vendeur_journal where vendeur_id = $1 order by le desc, id desc limit 50`, [id]),
    db.query(`select coalesce(x.marque, '—') as cle, count(*)::int as n from rcu.portefeuille p left join rcu.cv x on x.vente_id = p.vente_ref
              where p.vendeur_id = $1 group by 1 order by 2 desc`, [id]),
    db.query(`select origine as cle, count(*)::int as n from rcu.portefeuille where vendeur_id = $1 group by 1 order by 2 desc`, [id]),
  ]);
  return { journal: j.rows, par_marque: m.rows, par_origine: o.rows };
}));

/** Champs d'un vendeur lus du corps de la requête (création et modification). */
function lireVendeur(b: any) {
  const v = {
    nom: txt(b?.nom, 80, true)!.toUpperCase(), prenom: txt(b?.prenom, 80) ?? '', site: txt(b?.site, 60, true)!,
    service: b?.service, fonction: b?.fonction, recoit: b?.recoit !== false,
    marques: Array.isArray(b?.marques) ? b.marques.map((x: unknown) => String(x).toUpperCase()) : [],
    ipn: txt(b?.ipn, 12)?.toUpperCase() ?? null, telephone: txt(b?.telephone, 30), email: txt(b?.email, 120), note: txt(b?.note, 500),
    entree: jour(b?.entree), sortie: jour(b?.sortie), remplacant_id: b?.remplacant_id ? Number(b.remplacant_id) : null,
    zones: Array.isArray(b?.zones) ? [...new Set(b.zones.map((z: unknown) => String(z).trim().toUpperCase()))] as string[] : [],
  };
  if (!['VN', 'VO'].includes(v.service)) throw new Invalide('Service : VN ou VO.');
  if (!FONCTIONS.includes(v.fonction)) throw new Invalide('Fonction inconnue.');
  if (v.marques.some((m: string) => !MARQUES.includes(m))) throw new Invalide('Marque inconnue.');
  if (v.zones.length > 200 || v.zones.some((z) => !ZONE.test(z))) throw new Invalide('Secteur : codes postaux (5 chiffres) ou départements (2).');
  if (v.entree && v.sortie && v.sortie < v.entree) throw new Invalide('La sortie précède l’entrée.');
  return v;
}
/** Deux vendeurs Secteur présents ne peuvent pas avoir la même zone sur le même site, service et marque. */
async function conflitSecteur(db: PoolClient, id: number, v: ReturnType<typeof lireVendeur>) {
  if (v.fonction !== 'secteur' || !v.zones.length) return;
  const r = (await db.query(`select z.zone, concat_ws(' ', o.prenom, o.nom) as qui from rcu.vendeur_secteur z join rcu.vendeur o on o.id = z.vendeur_id
    where o.id <> $1 and o.archive_le is null and (o.sortie is null or o.sortie >= current_date) and o.fonction = 'secteur'
      and o.site = $2 and o.service = $3 and z.zone = any($4::text[]) and (o.marques = '{}' or $5::text[] = '{}' or o.marques && $5::text[]) limit 1`,
  [id, v.site, v.service, v.zones, v.marques])).rows[0];
  if (r) throw new Invalide(`${r.zone} est déjà dans le secteur de ${r.qui} (même site, service et marque).`);
}

// POST /api/crm/equipes/vendeurs — créer.
router.post('/equipes/vendeurs', route(async (req) => {
  const v = lireVendeur(req.body), par = await nomDe(req), db = await rcu().connect();
  try {
    await db.query('begin');
    await conflitSecteur(db, 0, v);
    const id = Number((await db.query(`insert into rcu.vendeur (nom, prenom, site, service, fonction, marques, recoit, ipn, telephone, email, note, entree, sortie, remplacant_id, cree_par, maj_par)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15) returning id`,
    [v.nom, v.prenom, v.site, v.service, v.fonction, v.marques, v.recoit, v.ipn, v.telephone, v.email, v.note, v.entree, v.sortie, v.remplacant_id, par])).rows[0].id);
    if (v.zones.length) await db.query(`insert into rcu.vendeur_secteur (vendeur_id, zone) select $1, unnest($2::text[])`, [id, v.zones]);
    await journal(db, id, `Créé (${v.site}, ${v.service}, ${v.fonction})`, par);
    await db.query('commit');
    return { id, calcul: await recalcul() };
  } catch (e) { await db.query('rollback').catch(() => undefined); throw e; } finally { db.release(); }
}));

const LIB: Record<string, string> = { nom: 'Nom', prenom: 'Prénom', site: 'Site', service: 'Service', fonction: 'Fonction', marques: 'Marques', recoit: 'Reçoit des clients',
  ipn: 'IPN', telephone: 'Téléphone', email: 'E-mail', note: 'Note', entree: 'Entrée', sortie: 'Sortie', remplacant_id: 'Remplaçant', zones: 'Secteur' };
// PUT /api/crm/equipes/vendeurs/:id — modifier (tous les champs, secteur compris). Chaque changement est journalisé.
router.put('/equipes/vendeurs/:id', route(async (req, res) => {
  const id = Number(req.params.id), v = lireVendeur(req.body), par = await nomDe(req);
  if (v.remplacant_id === id) throw new Invalide('Un vendeur ne peut pas se remplacer lui-même.');
  const db = await rcu().connect();
  try {
    await db.query('begin');
    const old = (await db.query(`select nom, prenom, site, service, fonction, marques, recoit, ipn, telephone, email, note, to_char(entree, 'YYYY-MM-DD') as entree,
      to_char(sortie, 'YYYY-MM-DD') as sortie, remplacant_id, coalesce((select array_agg(zone order by zone) from rcu.vendeur_secteur where vendeur_id = $1), '{}') as zones
      from rcu.vendeur where id = $1 for update`, [id])).rows[0];
    if (!old) { await db.query('rollback'); return res.status(404).json({ error: 'Vendeur introuvable.' }); }
    await conflitSecteur(db, id, v);
    await db.query(`update rcu.vendeur set nom = $2, prenom = $3, site = $4, service = $5, fonction = $6, marques = $7, recoit = $8, ipn = $9, telephone = $10,
      email = $11, note = $12, entree = $13, sortie = $14, remplacant_id = $15, maj_le = now(), maj_par = $16 where id = $1`,
    [id, v.nom, v.prenom, v.site, v.service, v.fonction, v.marques, v.recoit, v.ipn, v.telephone, v.email, v.note, v.entree, v.sortie, v.remplacant_id, par]);
    await db.query(`delete from rcu.vendeur_secteur where vendeur_id = $1`, [id]);
    if (v.zones.length) await db.query(`insert into rcu.vendeur_secteur (vendeur_id, zone) select $1, unnest($2::text[])`, [id, v.zones]);
    const fmt = (k: string, x: any) => (x == null || x === '' ? '—' : Array.isArray(x) ? (x.length ? [...x].sort().join(', ') : '—') : typeof x === 'boolean' ? (x ? 'oui' : 'non') : String(x));
    const ch = Object.keys(LIB).filter((k) => fmt(k, (old as any)[k]) !== fmt(k, (v as any)[k]));
    for (const k of ch) await journal(db, id, `${LIB[k]} : ${fmt(k, (old as any)[k])} → ${fmt(k, (v as any)[k])}`, par);
    await db.query('commit');
    return { ok: true, calcul: ch.length ? await recalcul() : null };
  } catch (e) { await db.query('rollback').catch(() => undefined); throw e; } finally { db.release(); }
}));

// POST /api/crm/equipes/vendeurs/:id/archiver { archive } — masque (réversible) ; ses clients sont réattribués.
router.post('/equipes/vendeurs/:id/archiver', route(async (req) => {
  const id = Number(req.params.id), a = req.body?.archive !== false, par = await nomDe(req);
  await rcu().query(`update rcu.vendeur set archive_le = ${a ? 'now()' : 'null'}, maj_le = now(), maj_par = $2 where id = $1`, [id, par]);
  await journal(rcu(), id, a ? 'Archivé' : 'Désarchivé', par);
  return { ok: true, calcul: await recalcul() };
}));

// POST /api/crm/equipes/vendeurs/:id/apercu-depart { remplacant_id? } — où iraient ses clients s'il partait (rien n'est écrit).
router.post('/equipes/vendeurs/:id/apercu-depart', route(async (req) => {
  const id = Number(req.params.id);
  if (req.body?.remplacant_id) return { remplacant: true };
  const r = await recalculer({ ecrire: false, forcer: true, absents: [id] });
  const V = new Map((await chargerVendeurs()).map((v) => [v.id, v]));
  return { destinations: (r?.destinations ?? []).map((d) => ({ ...d, vendeur: d.vendeur_id ? `${V.get(d.vendeur_id)?.prenom} ${V.get(d.vendeur_id)?.nom}`.trim() : null })) };
}));

// POST /api/crm/equipes/vendeurs/:id/transferer { vers, zones?, marque?, verrou } — donne une partie de son portefeuille, tout de suite.
router.post('/equipes/vendeurs/:id/transferer', route(async (req) => {
  const id = Number(req.params.id), vers = Number(req.body?.vers), par = await nomDe(req);
  if (!vers || vers === id) throw new Invalide('Vendeur destinataire invalide.');
  const zones: string[] = Array.isArray(req.body?.zones) ? req.body.zones.map(String).filter((z: string) => ZONE.test(z)) : [];
  const marque = req.body?.marque ? String(req.body.marque).toUpperCase() : null;
  const cl = (await rcu().query(`select p.client_id from rcu.portefeuille p join rcu.client c on c.id = p.client_id left join rcu.cv x on x.vente_id = p.vente_ref
    where p.vendeur_id = $1 and ($2::text[] = '{}' or left(c.cp, 5) = any($2::text[]) or left(c.cp, 2) = any($2::text[])) and ($3::text is null or x.marque = $3)`,
  [id, zones, marque])).rows.map((r) => Number(r.client_id));
  if (cl.length) await attribuer(cl, vers, !!req.body?.verrou, par, 'Transfert manuel');
  return { clients: cl.length };
}));

// PUT /api/crm/equipes/encadrement { site, role, nom } — nom vide = retirer.
router.put('/equipes/encadrement', route(async (req) => {
  const site = txt(req.body?.site, 60, true), role = req.body?.role, nom = txt(req.body?.nom, 80), par = await nomDe(req);
  if (!ROLES_ENC.includes(role)) throw new Invalide('Rôle inconnu.');
  if (!nom) await rcu().query(`delete from rcu.encadrement where site = $1 and role = $2`, [site, role]);
  else await rcu().query(`insert into rcu.encadrement (site, role, nom, maj_par) values ($1, $2, $3, $4)
    on conflict (site, role) do update set nom = excluded.nom, maj_le = now(), maj_par = excluded.maj_par`, [site, role, nom, par]);
}));

// ─── Noms DCS ────────────────────────────────────────────────────────────────────────

// GET /api/crm/equipes/noms-dcs — noms de vendeur vus dans les ventes (5 dernières années) ou déjà classés.
router.get('/equipes/noms-dcs', route(async () => {
  const db = rcu();
  const [ventes, alias] = await Promise.all([
    db.query(`select x as nom, count(*)::int as n, max(date_achat) as d, (array_agg(distinct site))[1:3] as sites from rcu.cv, unnest(vendeurs) x group by 1`),
    db.query(`select a.libelle, a.etat, a.vendeur_id, concat_ws(' ', v.prenom, v.nom) as vendeur, v.site as vendeur_site, a.maj_par, a.maj_le
              from rcu.vendeur_alias a left join rcu.vendeur v on v.id = a.vendeur_id`),
  ]);
  const m = new Map<string, { libelle: string; ventes: number; derniere: string | null; sites: string[] }>();
  for (const r of ventes.rows) {
    const k = norm(r.nom); if (!k) continue;
    const x = m.get(k) || { libelle: k, ventes: 0, derniere: null, sites: [] };
    x.ventes += r.n; const d = r.d ? new Date(r.d).toISOString().slice(0, 10) : null;
    if (d && (!x.derniere || d > x.derniere)) x.derniere = d;
    x.sites = [...new Set([...x.sites, ...(r.sites || []).filter(Boolean)])].slice(0, 3);
    m.set(k, x);
  }
  const am = new Map(alias.rows.map((a) => [a.libelle, a]));
  const limite = new Date(Date.now() - 5 * 365 * 864e5).toISOString().slice(0, 10);
  return [...m.values()].filter((x) => am.has(x.libelle) || (x.derniere && x.derniere >= limite))
    .map((x) => { const a = am.get(x.libelle); return { ...x, etat: a?.etat ?? 'inconnu', vendeur_id: a?.vendeur_id ?? null, vendeur: a?.vendeur || null, vendeur_site: a?.vendeur_site ?? null, maj_par: a?.maj_par ?? null }; })
    .sort((a, b) => b.ventes - a.ventes);
}));

// PUT /api/crm/equipes/noms-dcs { libelle, etat: valide|ancien|pas_vendeur|inconnu, vendeur_id? }
router.put('/equipes/noms-dcs', route(async (req) => {
  const libelle = norm(txt(req.body?.libelle, 120, true)), etat = req.body?.etat, par = await nomDe(req);
  if (etat === 'inconnu') await rcu().query(`delete from rcu.vendeur_alias where libelle = $1`, [libelle]);
  else {
    if (!['valide', 'ancien', 'pas_vendeur'].includes(etat)) throw new Invalide('État inconnu.');
    const vid = etat === 'valide' ? Number(req.body?.vendeur_id) : null;
    if (etat === 'valide' && !vid) throw new Invalide('Vendeur manquant.');
    await rcu().query(`insert into rcu.vendeur_alias (libelle, vendeur_id, etat, maj_par) values ($1, $2, $3, $4)
      on conflict (libelle) do update set vendeur_id = excluded.vendeur_id, etat = excluded.etat, maj_le = now(), maj_par = excluded.maj_par`, [libelle, vid, etat, par]);
  }
  return { ok: true, calcul: await recalculer({ declencheur: 'référentiel' }) };
}));

// ─── Règles, réglages, recalculs ─────────────────────────────────────────────────────

router.get('/equipes/regles', route(async () => (await rcu().query(`select r.id, r.ordre, r.actif, r.site, r.service, r.type, r.valeurs, r.vendeur_id,
  concat_ws(' ', v.prenom, v.nom) as vendeur, r.note, r.cree_par, r.cree_le from rcu.regle_portefeuille r join rcu.vendeur v on v.id = r.vendeur_id order by r.ordre, r.id`)).rows));
const lireRegle = (b: any) => {
  const r = { site: txt(b?.site, 60, true), service: b?.service || null, type: b?.type, vendeur_id: Number(b?.vendeur_id), note: txt(b?.note, 200),
    valeurs: Array.isArray(b?.valeurs) ? b.valeurs.map((x: unknown) => String(x).trim().toUpperCase()).filter(Boolean) : [], actif: b?.actif !== false };
  if (!['cp', 'agent', 'ancien_vendeur'].includes(r.type)) throw new Invalide('Type de règle inconnu.');
  if (r.service && !['VN', 'VO'].includes(r.service)) throw new Invalide('Service : VN ou VO.');
  if (!r.valeurs.length || r.valeurs.length > 200 || r.valeurs.some((x: string) => x.length > 80)) throw new Invalide('Valeurs manquantes.');
  if (r.type === 'cp' && r.valeurs.some((x: string) => !ZONE.test(x))) throw new Invalide('Codes postaux ou départements attendus.');
  if (!r.vendeur_id) throw new Invalide('Vendeur manquant.');
  return r;
};
router.post('/equipes/regles', route(async (req) => {
  const r = lireRegle(req.body);
  await rcu().query(`insert into rcu.regle_portefeuille (ordre, actif, site, service, type, valeurs, vendeur_id, note, cree_par)
    values ((select coalesce(max(ordre), 0) + 1 from rcu.regle_portefeuille), $1, $2, $3, $4, $5, $6, $7, $8)`,
  [r.actif, r.site, r.service, r.type, r.valeurs, r.vendeur_id, r.note, await nomDe(req)]);
  return { ok: true, calcul: await recalcul() };
}));
router.put('/equipes/regles/:id', route(async (req) => {
  const r = lireRegle(req.body);
  await rcu().query(`update rcu.regle_portefeuille set actif = $2, site = $3, service = $4, type = $5, valeurs = $6, vendeur_id = $7, note = $8 where id = $1`,
    [Number(req.params.id), r.actif, r.site, r.service, r.type, r.valeurs, r.vendeur_id, r.note]);
  return { ok: true, calcul: await recalcul() };
}));
router.delete('/equipes/regles/:id', route(async (req) => {
  await rcu().query(`delete from rcu.regle_portefeuille where id = $1`, [Number(req.params.id)]);
  return { ok: true, calcul: await recalcul() };
}));

// GET /api/crm/equipes/recalculs — 20 derniers recalculs.
router.get('/equipes/recalculs', route(async () => (await rcu().query(`select id, debut, fin, declencheur, changements, stats from rcu.portefeuille_run order by id desc limit 20`)).rows));
// POST /api/crm/equipes/recalcul { simuler } — simulation (rien n'est écrit) ou recalcul immédiat.
router.post('/equipes/recalcul', route(async (req) => {
  await majAlias(rcu());
  return recalculer({ ecrire: !req.body?.simuler, forcer: true, declencheur: 'manuel' });
}));
// PUT /api/crm/equipes/parametres { actif, anciennete_ans } — activer le calcul automatique (premier calcul compris).
router.put('/equipes/parametres', route(async (req) => {
  const a = req.body?.anciennete_ans, ans = a == null || a === '' ? null : Number(a);
  if (ans != null && (!Number.isInteger(ans) || ans < 1 || ans > 50)) throw new Invalide('Ancienneté : de 1 à 50 ans, ou vide.');
  await rcu().query(`update rcu.portefeuille_param set actif = $1, anciennete_ans = $2, maj_le = now(), maj_par = $3 where id = 1`, [!!req.body?.actif, ans, await nomDe(req)]);
  return { ok: true, calcul: req.body?.actif ? await recalcul('activation') : null };
}));

// ─── À attribuer ─────────────────────────────────────────────────────────────────────

// GET /api/crm/equipes/a-attribuer?site=&page= — 50 clients sans vendeur, avec la raison.
router.get('/equipes/a-attribuer', route(async (req) => {
  const site = typeof req.query.site === 'string' && req.query.site ? req.query.site : null, page = Math.max(0, Math.floor(Number(req.query.page) || 0));
  const w = `p.vendeur_id is null and c.actif and ($1::text is null or c.site = $1)`;
  const [n, rows] = await Promise.all([
    rcu().query(`select count(*)::int as n from rcu.portefeuille p join rcu.client c on c.id = p.client_id where ${w}`, [site]),
    rcu().query(`select c.id, c.type, c.nom, c.prenom, c.cp, c.ville, c.site, to_char(x.date_achat, 'YYYY-MM-DD') as date_achat, x.type_vh, x.marque, p.detail
      from rcu.portefeuille p join rcu.client c on c.id = p.client_id left join rcu.cv x on x.vente_id = p.vente_ref
      where ${w} order by c.site, x.date_achat desc nulls last, c.id limit 50 offset $2`, [site, page * 50]),
  ]);
  return { total: n.rows[0].n, page, rows: rows.rows };
}));

/** Attribution manuelle (seul chemin d'écriture humaine du portefeuille) : historique + ligne, verrou facultatif. */
async function attribuer(clients: number[], vendeurId: number | null, verrou: boolean, par: string, detail: string) {
  const db = await rcu().connect();
  try {
    await db.query('begin');
    await db.query(`
      with l as (select distinct on (ci.client_id) ci.client_id, cv.vente_id from rcu.cv cv join rcu.client_identite ci on ci.identite_id = cv.identite_id
                 where ci.client_id = any($1::bigint[]) order by ci.client_id, cv.date_achat desc nulls last, cv.vente_id desc),
      h as (insert into rcu.portefeuille_histo (client_id, de, vers, origine, detail, par)
            select c.id, p.vendeur_id, $2, 'manuel', $5, $4 from unnest($1::bigint[]) c(id) left join rcu.portefeuille p on p.client_id = c.id
            where p.vendeur_id is distinct from $2::int)
      insert into rcu.portefeuille as p (client_id, vendeur_id, origine, detail, verrou, vente_ref, depuis, par)
      select c.id, $2, case when $2::int is null then 'a_attribuer' else 'manuel' end, $5, $3, l.vente_id, now(), $4
      from unnest($1::bigint[]) c(id) left join l on l.client_id = c.id
      on conflict (client_id) do update set vendeur_id = excluded.vendeur_id, origine = excluded.origine, detail = excluded.detail,
        verrou = excluded.verrou, vente_ref = excluded.vente_ref, depuis = now(), par = excluded.par`, [clients, vendeurId, verrou, par, detail]);
    await db.query('commit');
  } catch (e) { await db.query('rollback').catch(() => undefined); throw e; } finally { db.release(); }
}

// POST /api/crm/equipes/attribuer { clients, vendeur_id, verrou }
router.post('/equipes/attribuer', route(async (req) => {
  const cl = ids(req.body?.clients), v = Number(req.body?.vendeur_id);
  if (!v) throw new Invalide('Vendeur manquant.');
  await attribuer(cl, v, !!req.body?.verrou, await nomDe(req), 'Attribué à la main');
  return { clients: cl.length };
}));

// ─── Fiche client : portefeuille, ne plus contacter, échanges ─────────────────────────

// PUT /api/crm/clients/:id/portefeuille { vendeur_id, verrou }
router.put('/clients/:id/portefeuille', route(async (req) => {
  const id = Number(req.params.id), v = req.body?.vendeur_id ? Number(req.body.vendeur_id) : null;
  if (!(await rcu().query(`select 1 from rcu.client where id = $1 and actif`, [id])).rowCount) throw new Invalide('Client introuvable.');
  await attribuer([id], v, !!req.body?.verrou, await nomDe(req), req.body?.verrou ? 'Choisi à la main (verrouillé)' : 'Choisi à la main');
}));

// PUT /api/crm/clients/:id/refus { canaux: ['tout'|'email'|'sms'|'tel'|'courrier'], motif } — remplace la liste.
router.put('/clients/:id/refus', route(async (req) => {
  const id = Number(req.params.id), par = await nomDe(req), motif = txt(req.body?.motif, 200);
  const canaux: string[] = Array.isArray(req.body?.canaux) ? [...new Set(req.body.canaux.map(String))] as string[] : [];
  if (canaux.some((c) => !(CANAUX as readonly string[]).includes(c))) throw new Invalide('Canal inconnu.');
  const db = await rcu().connect();
  try {
    await db.query('begin');
    await db.query(`delete from rcu.contact_refus where client_id = $1 and not (canal = any($2::text[]))`, [id, canaux]);
    if (canaux.length) await db.query(`insert into rcu.contact_refus (client_id, canal, motif, par) select $1, unnest($2::text[]), $3, $4
      on conflict (client_id, canal) do update set motif = excluded.motif, par = excluded.par, le = now()`, [id, canaux, motif, par]);
    await db.query('commit');
  } catch (e) { await db.query('rollback').catch(() => undefined); throw e; } finally { db.release(); }
}));

// POST /api/crm/clients/:id/echanges { type, le, resultat, rappel, texte }
router.post('/clients/:id/echanges', route(async (req) => {
  const id = Number(req.params.id), b = req.body ?? {};
  if (!(TYPES_ECHANGE as readonly string[]).includes(b.type)) throw new Invalide('Type d’échange inconnu.');
  const le = jour(b.le) ?? new Date().toISOString().slice(0, 10);
  const r = await rcu().query(`insert into rcu.echange (client_id, type, le, resultat, rappel, texte, auteur_id, auteur) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [id, b.type, le, txt(b.resultat, 60), jour(b.rappel), txt(b.texte, 4000) ?? '', String(req.user!.id), await nomDe(req)]);
  return { id: Number(r.rows[0].id) };
}));
// DELETE /api/crm/clients/:id/echanges/:eid — l'auteur seulement (ou le Master).
router.delete('/clients/:id/echanges/:eid', route(async (req, res) => {
  const r = await rcu().query(`delete from rcu.echange where id = $1 and client_id = $2 and (auteur_id = $3 or $4)`,
    [Number(req.params.eid), Number(req.params.id), String(req.user!.id), req.user!.role === 'Master']);
  if (!r.rowCount) return res.status(404).json({ error: 'Échange introuvable, ou vous n’en êtes pas l’auteur.' });
}));

export default router;
