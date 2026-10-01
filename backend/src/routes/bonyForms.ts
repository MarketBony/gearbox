import { Router, Response } from 'express';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { FORMS_ROLES } from '../auth/roles';
import { ALL_SITES } from '../auth/siteScope';
import { emitEvent } from '../realtime';
import { prisma } from '../db';
import { validate, checkDef, newDef, SCHEMA_VERSION, type BonyFormDef, type Answers, type Field } from '../bonyforms/schema';
import { callWorker, verify, workerConfigured, workerUrl } from '../bonyforms/worker';

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
} as const;

function fail(res: Response, e: unknown, def: string) {
  const msg = e instanceof Error ? e.message : def;
  console.error(`[bony-forms] ${def}`, msg);
  return res.status(502).json({ error: msg || def });
}

/** Places prises par option de créneau, et total, à partir des réponses enregistrées. */
async function takenOf(formId: string, def: BonyFormDef) {
  const slots = def.fields.filter((f) => f.type === 'slot');
  const rows = await prisma.bonyFormResponse.findMany({ where: { formId }, select: { answers: true } });
  const taken: Record<string, Record<string, number>> = {};
  slots.forEach((f) => { taken[f.id] = {}; });
  rows.forEach((r) => slots.forEach((f) => { const v = (r.answers as any)?.[f.id]; if (typeof v === 'string') taken[f.id][v] = (taken[f.id][v] || 0) + 1; }));
  return { taken, total: rows.length };
}

// ---------------------------------------------------------------- routes de Gearbox (FORMS_ROLES)
// GET /api/bony-forms — liste (sans les définitions), avec l'adresse publique et « modifié depuis publication ».
router.get('/', authenticateToken, requireRole(FORMS_ROLES), async (_req, res) => {
  try {
    const rows = await prisma.bonyForm.findMany({ orderBy: { updatedAt: 'desc' }, select: { ...LIST, draft: true, published: true } });
    res.json({
      workerReady: workerConfigured(),
      forms: rows.map(({ draft, published, ...r }) => ({ ...r, url: publicUrl(r.publicId), dirty: !!published && JSON.stringify(draft) !== JSON.stringify(published) })),
    });
  } catch (e) { fail(res, e, 'Lecture des formulaires impossible.'); }
});

// POST /api/bony-forms { title } — nouveau formulaire (brouillon).
router.post('/', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 200) : '';
  if (!title) return res.status(400).json({ error: 'Donnez un titre au formulaire.' });
  try {
    const row = await prisma.bonyForm.create({ data: { publicId: publicIdOf(), title, draft: newDef(title) as any, createdBy: req.user!.id, updatedBy: req.user!.id } });
    emitEvent('bonyforms:changed', null);
    res.status(201).json({ ...row, url: publicUrl(row.publicId) });
  } catch (e) { fail(res, e, 'Création impossible.'); }
});

// GET /api/bony-forms/:id — fiche complète (brouillon + version publiée).
router.get('/:id', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const row = await prisma.bonyForm.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Formulaire introuvable.' });
    res.json({ ...row, url: publicUrl(row.publicId) });
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
    const saved = await prisma.bonyForm.update({ where: { id: row.id }, data: { published: def as any, version, status: 'published', publishedAt: new Date(), syncError: null, updatedBy: req.user!.id }, select: LIST });
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
      prisma.bonyForm.delete({ where: { id: row.id } }),
    ]);
    emitEvent('bonyforms:changed', null);
    res.sendStatus(204);
  } catch (e) { fail(res, e, 'Suppression impossible.'); }
});

// GET /api/bony-forms/:id/responses — réponses (plus récentes d'abord).
router.get('/:id/responses', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const rows = await prisma.bonyFormResponse.findMany({ where: { formId: req.params.id }, orderBy: { submittedAt: 'desc' }, select: { id: true, version: true, answers: true, meta: true, submittedAt: true } });
    res.json(rows);
  } catch (e) { fail(res, e, 'Lecture des réponses impossible.'); }
});

// DELETE /api/bony-forms/:id/responses/:rid — efface UNE réponse (droit à l'effacement d'un répondant, RGPD).
router.delete('/:id/responses/:rid', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const r = await prisma.bonyFormResponse.deleteMany({ where: { id: req.params.rid, formId: req.params.id } });
    if (!r.count) return res.status(404).json({ error: 'Réponse introuvable.' });
    const agg = await prisma.bonyFormResponse.aggregate({ where: { formId: req.params.id }, _count: { _all: true }, _max: { submittedAt: true } });
    await prisma.bonyForm.update({ where: { id: req.params.id }, data: { responseCount: agg._count._all, lastResponseAt: agg._max.submittedAt } });
    emitEvent('bonyforms:changed', null);
    res.sendStatus(204);
  } catch (e) { fail(res, e, 'Effacement impossible.'); }
});

// ---------------------------------------------------------------- routes du Worker (signature HMAC, sans JWT)
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
    if (s.maxResponses && total >= s.maxResponses) { if (!queued) return res.status(409).json({ error: s.closedMessage || 'Le nombre maximal de réponses est atteint.', closed: true }); flags.push('au-delà du maximum'); }
    const v = validate(def, answers as Answers, { taken });
    if (!v.ok && !queued) return res.status(422).json({ error: 'Certaines réponses sont invalides.', errors: v.errors });
    if (!v.ok) flags.push('validation échouée à la réception');
    const uniq = def.fields.find((f) => f.unique && v.clean[f.id] !== undefined);
    const data = {
      id: responseId, formId: form.id, version: form.version,
      answers: (v.ok ? v.clean : answers) as any,
      meta: { ...(meta && typeof meta === 'object' ? meta : {}), ...(flags.length ? { flag: flags.join(' ; ') } : {}) } as any,
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
    const agg = await prisma.bonyFormResponse.aggregate({ where: { formId: form.id }, _count: { _all: true }, _max: { submittedAt: true } });
    await prisma.bonyForm.update({ where: { id: form.id }, data: { responseCount: agg._count._all, lastResponseAt: agg._max.submittedAt } });
    // Maximum atteint : le formulaire se ferme tout seul (le Worker affiche le message de fermeture).
    if (s.maxResponses && agg._count._all >= s.maxResponses && form.status === 'published') {
      await callWorker('/__gearbox/publish', { publicId, status: 'closed', version: form.version, def }).catch(() => {});
      await prisma.bonyForm.update({ where: { id: form.id }, data: { status: 'closed' } });
    }
    emitEvent('bonyforms:response', { formId: form.id });
    emitEvent('bonyforms:changed', null);
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Enregistrement de la réponse impossible.'); }
});

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
