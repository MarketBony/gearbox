import express, { Router, Response } from 'express';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { FORMS_ROLES } from '../auth/roles';
import { ALL_SITES } from '../auth/siteScope';
import { emitEvent, emitToUser } from '../realtime';
import { sendPushToUsers } from '../utils/pushSender';
import { getUserIdsOnSection } from '../realtime/presence';
import { prisma } from '../db';
import { validate, checkDef, newDef, endingOf, isLayout, SCHEMA_VERSION, type BonyFormDef, type Answers, type Field } from '../bonyforms/schema';
import { callWorker, verify, verifyMessage, workerConfigured, workerUrl } from '../bonyforms/worker';
import { savePending, claim, tokenId, pendingExists, readFile, listFiles, removeFiles } from '../bonyforms/files';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// FORMS BONY (01/10/2026, lot F1) — formulaires MAISON. Édition dans Gearbox (FORMS_ROLES),
// affichage public par le Worker Cloudflare `forms` (bonyforms/worker.ts), réponses reçues ici.
//
// ⚠️ Deux familles de routes :
//  - routes de Gearbox : JWT + `requireRole(FORMS_ROLES)` sur CHACUNE ;
//  - routes du Worker (`/ingest`, `/state`) : AUCUN JWT, mais signature HMAC obligatoire
//    (`verify`, secret partagé, horodatage ±5 min). Sans signature valide : 401, rien n'est lu.
// Une réponse est revalidée ICI par la même fonction que dans le Worker (`validate`, format partagé) :
// le serveur ne fait jamais confiance au navigateur, ni au Worker sur les places restantes.
// ═══════════════════════════════════════════════════════════════════════════

const BRANDS = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize'];   // Holding : jamais proposée au public
const MAX_DEF = 400_000;                                                  // octets d'une définition

/** Identifiant public : 10 caractères [a-z0-9] (≈ 3,6·10¹⁵ combinaisons : impossible à deviner). */
const publicIdOf = () => { const A = 'abcdefghijklmnopqrstuvwxyz0123456789', b = crypto.randomBytes(10); return Array.from(b, (x) => A[x % 36]).join(''); };
const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'option';

/** Listes tenues par Gearbox (concessions, marques) : remplies AU MOMENT DE LA PUBLICATION. */
function enrich(def: BonyFormDef): BonyFormDef {
  const d: BonyFormDef = JSON.parse(JSON.stringify(def));
  d.fields.forEach((f: Field) => {
    if (f.type === 'concession') f.options = ALL_SITES.map((s) => ({ id: slugify(s), label: s }));
    if (f.type === 'brand') f.options = BRANDS.map((b) => ({ id: slugify(b), label: b }));
  });
  return d;
}

const publicUrl = (publicId: string) => (workerUrl() ? `${workerUrl()}/${publicId}` : null);
const LIST = {
  id: true, publicId: true, title: true, status: true, version: true, publishedAt: true, syncError: true,
  responseCount: true, lastResponseAt: true, createdBy: true, updatedBy: true, createdAt: true, updatedAt: true,
  projectId: true, sites: true, brands: true, service: true, followers: true,
} as const;

// ---------------------------------------------------------------- F4 : projet et tags
// Un formulaire RATTACHÉ à un projet en hérite les tags, lus EN DIRECT (le projet change, le formulaire suit) ;
// non rattaché : ses propres tags. Listes alignées sur constants.ts (SITES via ALL_SITES, BRANDS, SERVICES).
// Holding = tag marque EXCLUSIF (règle de constants.ts) : posé seul ou pas du tout.
const TAG_BRANDS = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize', 'Holding'];
const TAG_SERVICES = ['VN', 'VO', 'APV', 'PR', 'Tous Services'];
type Tagged = { projectId: string | null; sites: string[]; brands: string[]; service: string[] };
/** Tags EFFECTIFS de formulaires (projet rattaché lu en une requête). Ajoute `project` (id, nom) ou null. */
async function withTags<T extends Tagged>(rows: T[]) {
  const ids = [...new Set(rows.map((r) => r.projectId).filter(Boolean))] as string[];
  const projects = ids.length ? await prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, sites: true, brands: true, service: true } }) : [];
  const by = new Map(projects.map((p) => [p.id, p]));
  return rows.map((r) => {
    const p = r.projectId ? by.get(r.projectId) : null;
    return { ...r, project: p ? { id: p.id, name: p.name } : r.projectId ? { id: r.projectId, name: 'Projet supprimé' } : null,
      tags: p ? { sites: p.sites || [], brands: p.brands || [], service: p.service || [] } : { sites: r.sites, brands: r.brands, service: r.service } };
  });
}

function fail(res: Response, e: unknown, def: string) {
  const msg = e instanceof Error ? e.message : def;
  console.error(`[bony-forms] ${def}`, msg);
  return res.status(502).json({ error: msg || def });
}

/** Places prises par option de créneau et par créneau d'essai, et total, à partir des réponses enregistrées.
 *  Prise d'essai : clé `voiture@date` (exemplaires) ET `*@date` (voitures en même temps, tous modèles). */
async function takenOf(formId: string, def: BonyFormDef) {
  const slots = def.fields.filter((f) => f.type === 'slot' || f.type === 'testdrive');
  const rows = await prisma.bonyFormResponse.findMany({ where: { formId }, select: { answers: true } });
  const taken: Record<string, Record<string, number>> = {};
  slots.forEach((f) => { taken[f.id] = {}; });
  rows.forEach((r) => slots.forEach((f) => {
    const v = (r.answers as any)?.[f.id]; if (typeof v !== 'string') return;
    taken[f.id][v] = (taken[f.id][v] || 0) + 1;
    if (f.type === 'testdrive') { const at = v.split('@')[1]; if (at) taken[f.id][`*@${at}`] = (taken[f.id][`*@${at}`] || 0) + 1; }
  }));
  return { taken, total: rows.length };
}

// ---------------------------------------------------------------- routes de Gearbox (FORMS_ROLES)
// GET /api/bony-forms — liste (sans les définitions), avec l'adresse publique et « modifié depuis publication ».
router.get('/', authenticateToken, requireRole(FORMS_ROLES), async (_req, res) => {
  try {
    const rows = await prisma.bonyForm.findMany({ orderBy: { updatedAt: 'desc' }, select: { ...LIST, draft: true, published: true } });
    const tagged = await withTags(rows.map(({ draft, published, ...r }) => ({ ...r, url: publicUrl(r.publicId), dirty: !!published && JSON.stringify(draft) !== JSON.stringify(published) })));
    res.json({ workerReady: workerConfigured(), workerUrl: workerUrl() || null, forms: tagged });
  } catch (e) { fail(res, e, 'Lecture des formulaires impossible.'); }
});

// POST /api/bony-forms { title } — nouveau formulaire (brouillon).
router.post('/', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 200) : '';
  if (!title) return res.status(400).json({ error: 'Donnez un titre au formulaire.' });
  try {
    const row = await prisma.bonyForm.create({ data: { publicId: publicIdOf(), title, draft: newDef(title) as any, createdBy: req.user!.id, updatedBy: req.user!.id, followers: [req.user!.id] } });
    emitEvent('bonyforms:changed', null);
    res.status(201).json({ ...row, url: publicUrl(row.publicId) });
  } catch (e) { fail(res, e, 'Création impossible.'); }
});

// ---------------------------------------------------------------- kits de marque et images (F2a)
// ⚠️ Déclarées AVANT `GET /:id` : sinon Express prendrait « kits » pour un identifiant de formulaire.
const KIT_MAX = 60_000;

// GET /api/bony-forms/kits — kits de marque, partagés par toute l'équipe.
router.get('/kits', authenticateToken, requireRole(FORMS_ROLES), async (_req, res) => {
  try {
    const rows = await prisma.bonyThemeKit.findMany({ orderBy: { createdAt: 'desc' } });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdBy))] } }, select: { id: true, name: true } });
    const name = new Map(users.map((u) => [u.id, u.name]));
    res.json(rows.map((r) => ({ ...r, author: name.get(r.createdBy) || 'Ancien membre' })));
  } catch (e) { fail(res, e, 'Lecture des kits impossible.'); }
});

// POST /api/bony-forms/kits { name, theme }
router.post('/kits', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  const theme = req.body?.theme;
  if (!name) return res.status(400).json({ error: 'Donnez un nom au kit.' });
  if (!theme || typeof theme !== 'object' || typeof theme.primary !== 'string' || JSON.stringify(theme).length > KIT_MAX) return res.status(400).json({ error: 'Thème invalide.' });
  try {
    const { layout: _l, ...rest } = theme;                       // un kit = l'apparence, pas la présentation
    const row = await prisma.bonyThemeKit.create({ data: { name, theme: rest, createdBy: req.user!.id } });
    emitEvent('bonyforms:kits', null);
    res.status(201).json(row);
  } catch (e) { fail(res, e, 'Enregistrement du kit impossible.'); }
});

// DELETE /api/bony-forms/kits/:kid
router.delete('/kits/:kid', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const r = await prisma.bonyThemeKit.deleteMany({ where: { id: req.params.kid } });
    if (!r.count) return res.status(404).json({ error: 'Kit introuvable.' });
    emitEvent('bonyforms:kits', null);
    res.sendStatus(204);
  } catch (e) { fail(res, e, 'Suppression du kit impossible.'); }
});

// POST /api/bony-forms/assets { type, data } — image (déjà compressée par Gearbox, base64) déposée CHEZ
// CLOUDFLARE (KV du Worker), jamais sur le VPS : servie au public par le Worker, cache d'un an.
// Identifiant = empreinte du contenu (la même image envoyée deux fois n'est stockée qu'une fois).
const ASSET_TYPES = ['image/webp', 'image/png', 'image/jpeg', 'image/gif', 'font/woff2', 'font/woff', 'font/otf', 'font/ttf'];
router.post('/assets', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  const { type, data } = req.body || {};
  if (!ASSET_TYPES.includes(type) || typeof data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(data)) return res.status(400).json({ error: 'Fichier invalide (image WebP, PNG, JPEG, GIF ou police WOFF2, WOFF, OTF, TTF).' });
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > 1_400_000) return res.status(413).json({ error: 'Fichier trop lourd (1,4 Mo au plus).' });   // base64 ≈ +33 % : reste sous la limite JSON de 2 Mo
  try {
    const id = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32);
    const r = await callWorker('/__gearbox/asset', { id, type, data });
    res.status(201).json({ url: `${workerUrl()}${r.path}` });
  } catch (e) { fail(res, e, 'Envoi de l’image impossible.'); }
});

// ---------------------------------------------------------------- polices de marque (bibliothèque partagée)
// Fichier déjà déposé chez Cloudflare par POST /assets ; on ne garde ici que famille, graisse, style et adresse.
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/;
router.get('/fonts', authenticateToken, requireRole(FORMS_ROLES), async (_req, res) => {
  try { res.json(await prisma.bonyFont.findMany({ orderBy: [{ family: 'asc' }, { weight: 'asc' }] })); }
  catch (e) { fail(res, e, 'Lecture des polices impossible.'); }
});
router.post('/fonts', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  const family = typeof req.body?.family === 'string' ? req.body.family.trim() : '';
  const weight = Math.round(Number(req.body?.weight) / 100) * 100, style = req.body?.style === 'italic' ? 'italic' : 'normal';
  const url = typeof req.body?.url === 'string' ? req.body.url : '', fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.slice(0, 120) : 'police';
  const base = workerUrl();
  if (!FAMILY.test(family)) return res.status(400).json({ error: 'Nom de police invalide (lettres, chiffres, espaces, 40 caractères).' });
  if (!(weight >= 100 && weight <= 900)) return res.status(400).json({ error: 'Graisse invalide (100 à 900).' });
  if (!base || !url.startsWith(`${base}/a/`) || !/^\/a\/[a-z0-9]{16,64}$/.test(url.slice(base.length))) return res.status(400).json({ error: 'Adresse de fichier invalide.' });
  try {
    const row = await prisma.bonyFont.upsert({ where: { family_weight_style: { family, weight, style } }, update: { url, fileName, createdBy: req.user!.id }, create: { family, weight, style, url, fileName, createdBy: req.user!.id } });
    emitEvent('bonyforms:fonts', null);
    res.status(201).json(row);
  } catch (e) { fail(res, e, 'Enregistrement de la police impossible.'); }
});
router.delete('/fonts/:fid', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const r = await prisma.bonyFont.deleteMany({ where: { id: req.params.fid } });
    if (!r.count) return res.status(404).json({ error: 'Police introuvable.' });
    emitEvent('bonyforms:fonts', null);
    res.sendStatus(204);
  } catch (e) { fail(res, e, 'Suppression de la police impossible.'); }
});

// ---------------------------------------------------------------- F4 : projet, tags, abonnement, versions, tirages
// PUT /api/bony-forms/:id/meta { projectId | null, sites, brands, service } — rattachement et tags (champs NOMMÉS).
router.put('/:id/meta', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  const b = req.body || {};
  const list = (v: unknown, ok: string[]) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ok.includes(x)))] : []);
  const projectId = typeof b.projectId === 'string' && b.projectId ? b.projectId : null;
  let brands = list(b.brands, TAG_BRANDS);
  if (brands.includes('Holding') && brands.length > 1) brands = ['Holding'];        // Holding : exclusif
  try {
    if (projectId && !(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }))) return res.status(404).json({ error: 'Projet introuvable.' });
    const row = await prisma.bonyForm.update({ where: { id: req.params.id }, data: projectId ? { projectId } : { projectId: null, sites: list(b.sites, ALL_SITES), brands, service: list(b.service, TAG_SERVICES) }, select: LIST });
    emitEvent('bonyforms:changed', null);
    res.json((await withTags([row]))[0]);
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Formulaire introuvable.' });
    fail(res, e, 'Enregistrement des tags impossible.');
  }
});

// POST /api/bony-forms/:id/follow { on } — suivre / ne plus suivre (notifications de réponse).
router.post('/:id/follow', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const row = await prisma.bonyForm.findUnique({ where: { id: req.params.id }, select: { followers: true } });
    if (!row) return res.status(404).json({ error: 'Formulaire introuvable.' });
    const me = req.user!.id, set = new Set(row.followers);
    if (req.body?.on) set.add(me); else set.delete(me);
    const saved = await prisma.bonyForm.update({ where: { id: req.params.id }, data: { followers: [...set] }, select: { followers: true } });
    res.json(saved);
  } catch (e) { fail(res, e, 'Abonnement impossible.'); }
});

// GET /api/bony-forms/:id/versions — publications successives (sans leur contenu), avec le nombre de réponses.
router.get('/:id/versions', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const form = await prisma.bonyForm.findUnique({ where: { id: req.params.id }, select: { id: true, version: true, published: true, publishedAt: true, updatedBy: true } });
    if (!form) return res.status(404).json({ error: 'Formulaire introuvable.' });
    // Formulaires publiés avant F4 : la version en ligne est inscrite à la première consultation.
    if (form.published && form.version > 0 && !(await prisma.bonyFormVersion.findUnique({ where: { formId_version: { formId: form.id, version: form.version } } }))) {
      await prisma.bonyFormVersion.create({ data: { formId: form.id, version: form.version, def: form.published as any, publishedBy: form.updatedBy, publishedAt: form.publishedAt || new Date() } });
    }
    const [rows, counts] = await Promise.all([
      prisma.bonyFormVersion.findMany({ where: { formId: form.id }, orderBy: { version: 'desc' }, select: { id: true, version: true, publishedAt: true, publishedBy: true } }),
      prisma.bonyFormResponse.groupBy({ by: ['version'], where: { formId: form.id }, _count: { _all: true } }),
    ]);
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.publishedBy))] } }, select: { id: true, name: true } });
    const name = new Map(users.map((u) => [u.id, u.name])), n = new Map(counts.map((c) => [c.version, c._count._all]));
    res.json(rows.map((r) => ({ ...r, author: name.get(r.publishedBy) || 'Ancien membre', responses: n.get(r.version) || 0 })));
  } catch (e) { fail(res, e, 'Lecture des versions impossible.'); }
});
// GET /api/bony-forms/:id/versions/:v — contenu d'une version.
router.get('/:id/versions/:v', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const v = await prisma.bonyFormVersion.findUnique({ where: { formId_version: { formId: req.params.id, version: Number(req.params.v) || 0 } } });
    if (!v) return res.status(404).json({ error: 'Version introuvable.' });
    res.json(v);
  } catch (e) { fail(res, e, 'Lecture de la version impossible.'); }
});
// POST /api/bony-forms/:id/versions/:v/restore — remet une version dans le BROUILLON (rien n'est publié).
router.post('/:id/versions/:v/restore', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const v = await prisma.bonyFormVersion.findUnique({ where: { formId_version: { formId: req.params.id, version: Number(req.params.v) || 0 } } });
    if (!v) return res.status(404).json({ error: 'Version introuvable.' });
    const def = v.def as any;
    const row = await prisma.bonyForm.update({ where: { id: req.params.id }, data: { draft: def, title: String(def?.title || 'Sans titre').slice(0, 200), updatedBy: req.user!.id }, select: LIST });
    emitEvent('bonyforms:changed', null);
    res.json(row);
  } catch (e) { fail(res, e, 'Restauration impossible.'); }
});

// ---- tirage au sort
/** Libellé d'un participant pour le procès-verbal : prénom / nom (2 premiers « réponse courte »), sinon e-mail. */
function labelOf(def: BonyFormDef, a: Record<string, any>) {
  const short = def.fields.filter((f) => f.type === 'short').slice(0, 2).map((f) => a[f.id]).filter((x) => typeof x === 'string' && x.trim());
  const email = def.fields.find((f) => f.type === 'email'), em = email && typeof a[email.id] === 'string' ? a[email.id] : '';
  const masked = em ? em.replace(/^(.{2}).*(@.*)$/, '$1•••$2') : '';
  return [short.join(' '), masked].filter(Boolean).join(' · ') || 'Participant';
}
// GET /api/bony-forms/:id/draws — procès-verbaux.
router.get('/:id/draws', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const rows = await prisma.bonyFormDraw.findMany({ where: { formId: req.params.id }, orderBy: { drawnAt: 'desc' } });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.drawnBy))] } }, select: { id: true, name: true } });
    const name = new Map(users.map((u) => [u.id, u.name]));
    res.json(rows.map((r) => ({ ...r, author: name.get(r.drawnBy) || 'Ancien membre' })));
  } catch (e) { fail(res, e, 'Lecture des tirages impossible.'); }
});
/**
 * POST /api/bony-forms/:id/draw { winners, alternates, consentField?, uniqueField?, excludePrevious }
 * Tirage FAIT PAR LE SERVEUR (crypto.randomInt, Fisher-Yates) et inscrit au procès-verbal : règles, nombre
 * d'éligibles, gagnants puis suppléants, empreinte SHA-256 de la liste des éligibles (preuve qu'elle n'a pas changé).
 */
router.post('/:id/draw', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  const b = req.body || {};
  const winners = Math.max(1, Math.min(50, Math.round(Number(b.winners) || 1))), alternates = Math.max(0, Math.min(20, Math.round(Number(b.alternates) || 0)));
  try {
    const form = await prisma.bonyForm.findUnique({ where: { id: req.params.id } });
    if (!form) return res.status(404).json({ error: 'Formulaire introuvable.' });
    const def = (form.published || form.draft) as unknown as BonyFormDef;
    const consent = typeof b.consentField === 'string' ? def.fields.find((f) => f.id === b.consentField && f.type === 'consent') : null;
    const uniq = typeof b.uniqueField === 'string' ? def.fields.find((f) => f.id === b.uniqueField && !isLayout(f)) : null;
    let pool = await prisma.bonyFormResponse.findMany({ where: { formId: form.id }, orderBy: { submittedAt: 'asc' }, select: { id: true, answers: true, meta: true } });
    pool = pool.filter((r) => !(r.meta as any)?.flag);                         // réponses signalées (doublon, après fermeture…) écartées
    if (consent) pool = pool.filter((r) => (r.answers as any)?.[consent.id] === true);
    if (uniq) { const seen = new Set<string>(); pool = pool.filter((r) => { const k = String((r.answers as any)?.[uniq.id] ?? '').trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; }); }
    if (b.excludePrevious) {
      const prev = await prisma.bonyFormDraw.findMany({ where: { formId: form.id }, select: { winners: true } });
      const out = new Set(prev.flatMap((d) => ((d.winners as any[]) || []).filter((w) => !w.alternate).map((w) => w.responseId)));
      pool = pool.filter((r) => !out.has(r.id));
    }
    if (!pool.length) return res.status(422).json({ error: 'Aucune participation éligible avec ces règles.' });
    const ids = pool.map((r) => r.id).sort();
    const proof = crypto.createHash('sha256').update(ids.join('\n')).digest('hex');
    const order = pool.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    const picked = order.slice(0, winners + alternates).map((r, k) => ({ rank: k + 1, alternate: k >= winners, responseId: r.id, label: labelOf(def, r.answers as any) }));
    const draw = await prisma.bonyFormDraw.create({ data: { formId: form.id, drawnBy: req.user!.id, rules: { winners, alternates, consentField: consent?.id || null, consentLabel: consent?.label || null, uniqueField: uniq?.id || null, uniqueLabel: uniq?.label || null, excludePrevious: !!b.excludePrevious } as any, eligible: pool.length, winners: picked as any, proof } });
    // Liste des noms pour l'animation (masqués comme au procès-verbal), sans identifiant de réponse.
    res.status(201).json({ ...draw, reel: order.slice(0, 60).map((r) => labelOf(def, r.answers as any)) });
  } catch (e) { fail(res, e, 'Tirage impossible.'); }
});

// GET /api/bony-forms/:id — fiche complète (brouillon + version publiée).
router.get('/:id', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const row = await prisma.bonyForm.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Formulaire introuvable.' });
    res.json({ ...(await withTags([row]))[0], url: publicUrl(row.publicId) });
  } catch (e) { fail(res, e, 'Lecture impossible.'); }
});

// PUT /api/bony-forms/:id/draft { draft } — enregistre le BROUILLON (rien ne change pour le public).
router.put('/:id/draft', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  const draft = req.body?.draft as BonyFormDef;
  if (!draft || typeof draft !== 'object' || draft.v !== SCHEMA_VERSION || !Array.isArray(draft.fields) || typeof draft.title !== 'string' || !draft.theme || !draft.settings) {
    return res.status(400).json({ error: 'Brouillon invalide.' });
  }
  if (JSON.stringify(draft).length > MAX_DEF) return res.status(413).json({ error: 'Formulaire trop volumineux.' });
  try {
    const row = await prisma.bonyForm.update({ where: { id: req.params.id }, data: { draft: draft as any, title: draft.title.trim().slice(0, 200) || 'Sans titre', updatedBy: req.user!.id }, select: LIST });
    emitEvent('bonyforms:changed', null);
    res.json(row);
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Formulaire introuvable.' });
    fail(res, e, 'Enregistrement impossible.');
  }
});

// POST /api/bony-forms/:id/publish — met le brouillon EN LIGNE (copie figée, envoyée au Worker).
router.post('/:id/publish', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const row = await prisma.bonyForm.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Formulaire introuvable.' });
    const problems = checkDef(row.draft as any);
    if (problems.length) return res.status(422).json({ error: 'Le formulaire ne peut pas être publié en l’état.', problems });
    const def = enrich(row.draft as any), version = row.version + 1;
    // Le Worker d'abord : s'il est injoignable, rien n'est marqué « en ligne » à tort.
    await callWorker('/__gearbox/publish', { publicId: row.publicId, status: 'open', version, def });
    const [saved] = await prisma.$transaction([
      prisma.bonyForm.update({ where: { id: row.id }, data: { published: def as any, version, status: 'published', publishedAt: new Date(), syncError: null, updatedBy: req.user!.id }, select: LIST }),
      prisma.bonyFormVersion.upsert({ where: { formId_version: { formId: row.id, version } }, update: { def: def as any, publishedBy: req.user!.id }, create: { formId: row.id, version, def: def as any, publishedBy: req.user!.id } }),
    ]);
    emitEvent('bonyforms:changed', null);
    res.json({ ...saved, url: publicUrl(saved.publicId) });
  } catch (e) { fail(res, e, 'Publication impossible.'); }
});

// POST /api/bony-forms/:id/close — dépublie : le Worker affiche « ce formulaire n'accepte plus de réponses ».
router.post('/:id/close', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const row = await prisma.bonyForm.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Formulaire introuvable.' });
    if (row.status !== 'published') return res.status(409).json({ error: 'Ce formulaire n’est pas en ligne.' });
    await callWorker('/__gearbox/publish', { publicId: row.publicId, status: 'closed', version: row.version, def: row.published });
    const saved = await prisma.bonyForm.update({ where: { id: row.id }, data: { status: 'closed', updatedBy: req.user!.id }, select: LIST });
    emitEvent('bonyforms:changed', null);
    res.json(saved);
  } catch (e) { fail(res, e, 'Fermeture impossible.'); }
});

// DELETE /api/bony-forms/:id — supprime le formulaire ET ses réponses (données personnelles), retiré du Worker.
router.delete('/:id', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const row = await prisma.bonyForm.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Formulaire introuvable.' });
    if (row.version > 0) await callWorker('/__gearbox/remove', { publicId: row.publicId });
    await prisma.$transaction([
      prisma.bonyFormResponse.deleteMany({ where: { formId: row.id } }),
      prisma.bonyFormVersion.deleteMany({ where: { formId: row.id } }),
      prisma.bonyFormDraw.deleteMany({ where: { formId: row.id } }),
      prisma.bonyForm.delete({ where: { id: row.id } }),
    ]);
    removeFiles(row.id);                                          // fichiers des répondants (volume privé)
    emitEvent('bonyforms:changed', null);
    res.sendStatus(204);
  } catch (e) { fail(res, e, 'Suppression impossible.'); }
});

// GET /api/bony-forms/:id/responses — réponses (plus récentes d'abord).
router.get('/:id/responses', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const rows = await prisma.bonyFormResponse.findMany({ where: { formId: req.params.id }, orderBy: { submittedAt: 'desc' }, select: { id: true, version: true, answers: true, meta: true, submittedAt: true } });
    res.json(rows.map((r) => ({ ...r, files: listFiles(req.params.id, r.id) })));
  } catch (e) { fail(res, e, 'Lecture des réponses impossible.'); }
});

// DELETE /api/bony-forms/:id/responses/:rid — efface UNE réponse (droit à l'effacement d'un répondant, RGPD).
router.delete('/:id/responses/:rid', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const r = await prisma.bonyFormResponse.deleteMany({ where: { id: req.params.rid, formId: req.params.id } });
    if (!r.count) return res.status(404).json({ error: 'Réponse introuvable.' });
    removeFiles(req.params.id, req.params.rid);
    // Droit à l'effacement : le procès-verbal garde le rang, plus l'identité.
    const draws = await prisma.bonyFormDraw.findMany({ where: { formId: req.params.id } });
    for (const d of draws) {
      const w = (d.winners as any[]) || [];
      if (w.some((x) => x.responseId === req.params.rid)) await prisma.bonyFormDraw.update({ where: { id: d.id }, data: { winners: w.map((x) => (x.responseId === req.params.rid ? { ...x, label: 'Réponse effacée (RGPD)' } : x)) as any } });
    }
    const agg = await prisma.bonyFormResponse.aggregate({ where: { formId: req.params.id }, _count: { _all: true }, _max: { submittedAt: true } });
    await prisma.bonyForm.update({ where: { id: req.params.id }, data: { responseCount: agg._count._all, lastResponseAt: agg._max.submittedAt } });
    emitEvent('bonyforms:changed', null);
    res.sendStatus(204);
  } catch (e) { fail(res, e, 'Effacement impossible.'); }
});

// GET /api/bony-forms/:id/responses/:rid/files/:fid — fichier déposé par un répondant (téléchargement forcé).
router.get('/:id/responses/:rid/files/:fid', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const f = readFile(req.params.id, req.params.rid, req.params.fid);
    if (!f) return res.status(404).json({ error: 'Fichier introuvable.' });
    res.setHeader('Content-Type', f.meta.type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.meta.name)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(f.file);
  } catch (e) { fail(res, e, 'Lecture du fichier impossible.'); }
});

// ---------------------------------------------------------------- routes du Worker (signature HMAC, sans JWT)
/**
 * POST /api/bony-forms/files — fichier déposé par un répondant, relayé par le Worker (corps BINAIRE).
 * Signature sur `publicId.id.type.nom.sha256` (en-têtes x-bf-*). Rangé « en attente » jusqu'à la réponse.
 */
const FILE_TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/;
router.post('/files', express.raw({ type: 'application/octet-stream', limit: '11mb' }), async (req, res) => {
  const h = (k: string) => String(req.headers[k] || '');
  const publicId = h('x-bf-form'), id = h('x-bf-id'), type = h('x-bf-type'), name = decodeURIComponent(h('x-bf-name') || 'fichier');
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  if (!verifyMessage(req.headers['x-gearbox-ts'], req.headers['x-gearbox-sig'], `${publicId}.${id}.${type}.${h('x-bf-name')}.${hash}`)) return res.status(401).json({ error: 'Signature invalide.' });
  if (!FILE_TYPES.test(type) || !body.length) return res.status(400).json({ error: 'Type de fichier refusé (images ou PDF).' });
  try {
    const form = await prisma.bonyForm.findUnique({ where: { publicId }, select: { id: true, status: true } });
    if (!form || form.status !== 'published') return res.status(404).json({ error: 'Formulaire fermé ou inconnu.' });
    savePending(form.id, id, name, type, body);
    res.status(201).json({ ok: true });
  } catch (e) { fail(res, e, 'Dépôt du fichier impossible.'); }
});

const signed = (req: any) => verify(req.headers['x-gearbox-ts'], req.headers['x-gearbox-sig'], req.body);

/**
 * POST /api/bony-forms/ingest — réponse transmise par le Worker.
 * `queued: true` = réponse acceptée par le Worker pendant une indisponibilité de Gearbox, renvoyée
 * depuis sa file : elle est ENREGISTRÉE même si elle ne passe plus la validation (formulaire modifié,
 * créneau complet entre-temps) — marquée dans `meta.flag` plutôt que perdue.
 */
router.post('/ingest', async (req, res) => {
  if (!signed(req)) return res.status(401).json({ error: 'Signature invalide.' });
  const { publicId, responseId, answers, meta, submittedAt, queued } = req.body || {};
  if (typeof publicId !== 'string' || typeof responseId !== 'string' || !/^[0-9a-f-]{36}$/.test(responseId) || !answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Réponse mal formée.' });
  }
  try {
    const form = await prisma.bonyForm.findUnique({ where: { publicId } });
    if (!form || !form.published) return res.status(404).json({ error: 'Formulaire inconnu.' });
    if (await prisma.bonyFormResponse.findUnique({ where: { id: responseId }, select: { id: true } })) return res.json({ ok: true, duplicate: true });
    const def = form.published as unknown as BonyFormDef;
    const now = new Date(), s = def.settings;
    const flags: string[] = [];
    const closed = form.status !== 'published' || (s.closeAt && now > new Date(s.closeAt)) || (s.openAt && now < new Date(s.openAt));
    if (closed) { if (!queued) return res.status(409).json({ error: s.closedMessage || 'Ce formulaire n’accepte plus de réponses.', closed: true }); flags.push('reçue après fermeture'); }
    const { taken, total } = await takenOf(form.id, def);
    // Fichiers : jeton signé par le Worker ET dépôt présent sur le disque (sinon « fichier inconnu »).
    const files: Record<string, string[]> = {}, fileIds: string[] = [];
    def.fields.filter((f) => f.type === 'file').forEach((f) => {
      const list = Array.isArray((answers as any)[f.id]) ? (answers as any)[f.id] : [];
      files[f.id] = list.filter((t: unknown) => { const id = tokenId(publicId, t); if (id && pendingExists(form.id, id)) { fileIds.push(id); return true; } return false; });
    });
    if (s.maxResponses && total >= s.maxResponses) { if (!queued) return res.status(409).json({ error: s.closedMessage || 'Le nombre maximal de réponses est atteint.', closed: true }); flags.push('au-delà du maximum'); }
    const v = validate(def, answers as Answers, { taken, files });
    if (!v.ok && !queued) return res.status(422).json({ error: 'Certaines réponses sont invalides.', errors: v.errors });
    if (!v.ok) flags.push('validation échouée à la réception');
    const uniq = def.fields.find((f) => f.unique && v.clean[f.id] !== undefined);
    const data = {
      id: responseId, formId: form.id, version: form.version,
      answers: (v.ok ? v.clean : answers) as any,
      meta: { ...(meta && typeof meta === 'object' ? meta : {}), ...(flags.length ? { flag: flags.join(' ; ') } : {}), ending: endingOf(def, v.clean)?.name || endingOf(def, v.clean)?.title || null } as any,
      uniqueKey: uniq ? `${uniq.id}:${String(v.clean[uniq.id]).toLowerCase()}` : null,
      submittedAt: submittedAt && !isNaN(new Date(submittedAt).getTime()) ? new Date(submittedAt) : now,
    };
    try { await prisma.bonyFormResponse.create({ data }); }
    catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        if (!queued) return res.status(409).json({ error: 'Une réponse a déjà été envoyée avec cette adresse.', errors: uniq ? { [uniq.id]: 'Une réponse a déjà été envoyée avec cette adresse.' } : undefined });
        await prisma.bonyFormResponse.create({ data: { ...data, uniqueKey: null, meta: { ...data.meta, flag: [data.meta.flag, 'doublon'].filter(Boolean).join(' ; ') } } });
      } else throw e;
    }
    const missing = claim(form.id, responseId, fileIds);
    if (missing.length) console.warn(`[bony-forms] réponse ${responseId} : ${missing.length} fichier(s) introuvable(s)`);
    const agg = await prisma.bonyFormResponse.aggregate({ where: { formId: form.id }, _count: { _all: true }, _max: { submittedAt: true } });
    await prisma.bonyForm.update({ where: { id: form.id }, data: { responseCount: agg._count._all, lastResponseAt: agg._max.submittedAt } });
    // Maximum atteint : le formulaire se ferme tout seul (le Worker affiche le message de fermeture).
    if (s.maxResponses && agg._count._all >= s.maxResponses && form.status === 'published') {
      await callWorker('/__gearbox/publish', { publicId, status: 'closed', version: form.version, def }).catch(() => {});
      await prisma.bonyForm.update({ where: { id: form.id }, data: { status: 'closed' } });
    }
    emitEvent('bonyforms:response', { formId: form.id });
    emitEvent('bonyforms:changed', null);
    notifyFollowers(form.id, form.title, form.followers);
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Enregistrement de la réponse impossible.'); }
});

/**
 * F4 — Abonnés prévenus d'une réponse : bannière Gearbox (toujours) et notification push (au plus une par minute et
 * par formulaire, et jamais à qui a déjà la rubrique Forms ouverte). Best-effort : n'échoue jamais la réception.
 */
const lastPush = new Map<string, number>();
function notifyFollowers(formId: string, title: string, followers: string[]) {
  if (!followers?.length) return;
  followers.forEach((u) => emitToUser(u, 'bonyforms:notify', { formId, title }));
  const now = Date.now();
  if (now - (lastPush.get(formId) || 0) < 60_000) return;
  lastPush.set(formId, now);
  void (async () => {
    try {
      const away = followers.filter((u) => !getUserIdsOnSection('forms').has(u));
      if (away.length) await sendPushToUsers(away, { title: 'Nouvelle réponse', body: title, tag: `bonyform-${formId}`, section: 'forms' });
    } catch (e) { console.error('[bony-forms] notification push', e); }
  })();
}

// POST /api/bony-forms/state { publicId } — places prises (créneaux) et total, pour l'affichage public.
router.post('/state', async (req, res) => {
  if (!signed(req)) return res.status(401).json({ error: 'Signature invalide.' });
  try {
    const form = await prisma.bonyForm.findUnique({ where: { publicId: String(req.body?.publicId || '') } });
    if (!form || !form.published) return res.status(404).json({ error: 'Formulaire inconnu.' });
    res.json({ status: form.status, ...(await takenOf(form.id, form.published as any)) });
  } catch (e) { fail(res, e, 'Lecture de l’état impossible.'); }
});

export default router;
