import { Router, Response } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { FORMS_ROLES, GOOGLE_CONNECT_ROLES } from '../auth/roles';
import { emitEvent } from '../realtime';
import { prisma } from '../db';
import { forms, googleConfigured, authUrl, completeAuth, disconnect, GoogleAuthError, GoogleApiError } from '../google/client';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// FORMS — rubrique Google Forms de l'interface v2 (01/10/2026). G1 : connexion, catalogue,
// statistiques. G2 : création, édition (liste blanche d'opérations + contrôle de version),
// publication, duplication, journal « qui a modifié quoi ».
//
// ⚠️ `requireRole(FORMS_ROLES)` sur CHAQUE route, lecture comprise : tout passe par le compte
// Google partagé, cette liste est la seule porte. Seul le retour d'autorisation Google
// (`/google/callback`, navigation du navigateur sans jeton Gearbox) en est exempt : il est
// protégé par l'`state` à usage unique émis pour le Master qui a cliqué « Connecter ».
// ═══════════════════════════════════════════════════════════════════════════

/** Champs du catalogue (sans `structure`, lourde) — Prisma 5.10 ne connaît pas l'option d'exclusion. */
const CATALOGUE = {
  id: true, formId: true, title: true, description: true, responderUri: true, isPublished: true, acceptingResponses: true,
  revisionId: true, responseCount: true, lastResponseAt: true, lastSyncedAt: true, syncError: true, addedBy: true, createdAt: true, updatedAt: true,
  lastEditedBy: true, lastEditedAt: true,
} as const;

/**
 * Opérations d'édition acceptées (`forms.batchUpdate`) — LISTE BLANCHE, comme TASK_FIELDS / POSTIT_FIELDS :
 * une requête qui n'en porte pas exactement une est refusée (400), jamais transmise à Google.
 */
const EDIT_OPS = ['createItem', 'updateItem', 'deleteItem', 'moveItem', 'updateFormInfo', 'updateSettings'] as const;
const MAX_OPS = 200;

/** Journal Gearbox + auteur de la dernière modification (côté Google, tout est fait par le compte partagé). */
async function journal(formId: string, userId: string, action: string, detail?: string) {
  await prisma.googleFormLog.create({ data: { formId, userId, action, detail: detail?.slice(0, 500) || null } }).catch(() => {});
  if (action !== 'remove') await prisma.googleForm.update({ where: { formId }, data: { lastEditedBy: userId, lastEditedAt: new Date() } }).catch(() => {});
}

const SYNC_TTL = 2 * 60_000;        // synchro automatique au plus toutes les 2 minutes par formulaire
const PAGE = 5000;                   // taille de page maximale de responses.list

/** Erreurs Google → réponse HTTP lisible. 409 = compte à (re)connecter. */
function fail(res: Response, e: unknown, def: string) {
  if (e instanceof GoogleAuthError) return res.status(409).json({ error: e.message, reconnect: true });
  if (e instanceof GoogleApiError) {
    // Contrôle de version : le formulaire a changé depuis sa lecture (autre onglet, éditeur Google).
    if (e.status === 400 && /revision/i.test(e.message)) return res.status(409).json({ error: 'Ce formulaire a été modifié ailleurs entre-temps : il vient d’être rechargé.', conflict: true });
    return res.status(e.status === 400 || e.status === 403 || e.status === 404 ? 422 : 502).json({ error: e.message });
  }
  console.error(def, e);
  return res.status(500).json({ error: def });
}

/** Identifiant Google d'un formulaire à partir de son lien d'ÉDITION (ou de l'identifiant seul). */
function formIdOf(input: unknown): string | { error: string } {
  const v = typeof input === 'string' ? input.trim() : '';
  if (!v) return { error: 'Collez le lien du formulaire.' };
  if (/\/forms\/d\/e\//.test(v) || /forms\.gle\//.test(v)) {
    return { error: 'C’est le lien de RÉPONSE du formulaire. Ouvrez le formulaire dans Google et copiez le lien de la barre d’adresse de l’éditeur (il se termine par /edit).' };
  }
  const m = /\/forms\/d\/([\w-]{20,})/.exec(v);
  if (m) return m[1];
  if (/^[\w-]{20,}$/.test(v)) return v;
  return { error: 'Lien non reconnu : copiez l’adresse de l’éditeur du formulaire (docs.google.com/forms/d/…/edit).' };
}

/** Champs du catalogue tirés d'un `forms.get`. */
function metaOf(f: any) {
  const ps = f.publishSettings?.publishState;
  return {
    title: f.info?.title || f.info?.documentTitle || 'Sans titre',
    description: f.info?.description || null,
    responderUri: f.responderUri || null,
    // Formulaire antérieur aux réglages de publication (juin 2026) : publié et ouvert.
    isPublished: ps ? !!ps.isPublished : true,
    acceptingResponses: ps ? !!ps.isAcceptingResponses : true,
    revisionId: f.revisionId || null,
    structure: { items: f.items || [], settings: f.settings || {} },
  };
}

// ---------------------------------------------------------------- synchronisation (une à la fois par formulaire)
const running = new Map<string, Promise<void>>();

/**
 * Relit la structure du formulaire, puis ses réponses : seulement les NOUVELLES (filtre sur la
 * dernière date connue) ou TOUTES (`full`, bouton « Actualiser » : rattrape aussi les réponses
 * supprimées dans Google).
 */
function syncForm(formId: string, full = false): Promise<void> {
  const cur = running.get(formId);
  if (cur) return cur;
  const p = (async () => {
    const row = await prisma.googleForm.findUnique({ where: { formId } });
    if (!row) return;
    try {
      const f = await forms(`/forms/${formId}`);
      const since = full || !row.lastResponseAt ? null : row.lastResponseAt;
      const got: any[] = [];
      let token: string | undefined;
      do {
        const q = new URLSearchParams({ pageSize: String(PAGE) });
        if (token) q.set('pageToken', token);
        if (since) q.set('filter', `timestamp >= ${since.toISOString()}`);
        const page: any = await forms(`/forms/${formId}/responses?${q}`);
        got.push(...(page?.responses || []));
        token = page?.nextPageToken;
      } while (token);
      const data = got.map((r) => ({
        id: r.responseId, formId, submittedAt: new Date(r.lastSubmittedTime || r.createTime),
        respondentEmail: r.respondentEmail || null, answers: r.answers || {},
      }));
      // Remplacement par lots : une réponse MODIFIÉE dans Google revient avec le même identifiant.
      const ops: any[] = [full ? prisma.googleFormResponse.deleteMany({ where: { formId } }) : prisma.googleFormResponse.deleteMany({ where: { id: { in: data.map((d) => d.id) } } })];
      for (let i = 0; i < data.length; i += 1000) ops.push(prisma.googleFormResponse.createMany({ data: data.slice(i, i + 1000) }));
      await prisma.$transaction(ops);
      const agg = await prisma.googleFormResponse.aggregate({ where: { formId }, _count: { _all: true }, _max: { submittedAt: true } });
      await prisma.googleForm.update({ where: { formId }, data: {
        ...metaOf(f), responseCount: agg._count._all, lastResponseAt: agg._max.submittedAt, lastSyncedAt: new Date(), syncError: null,
      } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Synchronisation impossible.';
      await prisma.googleForm.update({ where: { formId }, data: { syncError: msg, lastSyncedAt: new Date() } }).catch(() => {});
      throw e;
    }
  })().finally(() => running.delete(formId));
  running.set(formId, p);
  return p;
}

// ---------------------------------------------------------------- connexion du compte Google
// GET /api/forms/google/status
router.get('/google/status', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const row = await prisma.googleConnection.findUnique({ where: { id: 'google' } });
    const by = row ? await prisma.user.findUnique({ where: { id: row.connectedBy }, select: { name: true } }) : null;
    res.json({
      configured: googleConfigured(),
      connected: !!row,
      email: row?.email || null,
      connectedAt: row?.connectedAt || null,
      connectedBy: by?.name || null,
      lastError: row?.lastError || null,
      canConnect: GOOGLE_CONNECT_ROLES.includes(req.user!.role),
    });
  } catch (e) { fail(res, e, 'Lecture de la connexion Google impossible.'); }
});

// POST /api/forms/google/connect — adresse de l'écran d'autorisation Google (Master).
router.post('/google/connect', authenticateToken, requireRole(GOOGLE_CONNECT_ROLES), (req: AuthRequest, res) => {
  if (!googleConfigured()) return res.status(503).json({ error: 'Google n’est pas configuré sur ce serveur (variables GOOGLE_* absentes).' });
  res.json({ url: authUrl(req.user!.id) });
});

// GET /api/forms/google/callback — retour de Google (navigation du navigateur, sans jeton Gearbox).
router.get('/google/callback', async (req, res) => {
  const back = (q: string) => res.redirect(`/?gx-google=${q}`);
  if (typeof req.query.error === 'string') return back('annule');
  if (typeof req.query.state !== 'string' || typeof req.query.code !== 'string') return back('erreur');
  try {
    await completeAuth(req.query.state, req.query.code);
    emitEvent('forms:changed', null);
    back('ok');
  } catch (e) {
    console.error('[google] connexion refusée :', e instanceof Error ? e.message : e);
    back(e instanceof GoogleAuthError ? 'refus' : 'erreur');
  }
});

// POST /api/forms/google/disconnect (Master)
router.post('/google/disconnect', authenticateToken, requireRole(GOOGLE_CONNECT_ROLES), async (_req, res) => {
  try { await disconnect(); emitEvent('forms:changed', null); res.sendStatus(204); }
  catch (e) { fail(res, e, 'Déconnexion impossible.'); }
});

// ---------------------------------------------------------------- catalogue
// GET /api/forms — formulaires suivis (sans la structure ni les réponses).
router.get('/', authenticateToken, requireRole(FORMS_ROLES), async (_req, res) => {
  try {
    const rows = await prisma.googleForm.findMany({ orderBy: { updatedAt: 'desc' }, select: CATALOGUE });
    res.json(rows);
  } catch (e) { fail(res, e, 'Lecture des formulaires impossible.'); }
});

// POST /api/forms/import { url } — ajoute un formulaire existant par son lien d'édition.
router.post('/import', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  const id = formIdOf(req.body?.url);
  if (typeof id !== 'string') return res.status(400).json({ error: id.error });
  try {
    const exists = await prisma.googleForm.findUnique({ where: { formId: id } });
    if (exists) return res.status(409).json({ error: `« ${exists.title} » est déjà dans Gearbox.`, id: exists.id });
    const f = await forms(`/forms/${id}`);                 // vérifie l'accès avant d'enregistrer
    const row = await prisma.googleForm.create({ data: { formId: id, addedBy: req.user!.id, ...metaOf(f) } });
    await syncForm(id, true).catch(() => {});              // première synchro : l'erreur reste visible sur la fiche
    await journal(id, req.user!.id, 'import');
    emitEvent('forms:changed', null);
    res.status(201).json(await prisma.googleForm.findUnique({ where: { id: row.id }, select: CATALOGUE }));
  } catch (e) { fail(res, e, 'Import du formulaire impossible.'); }
});

// POST /api/forms { title } — CRÉE un formulaire chez Google (non publié par défaut depuis juin 2026)
// et l'ajoute au catalogue : plus besoin de coller un lien pour un formulaire né dans Gearbox.
router.post('/', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 300) : '';
  if (!title) return res.status(400).json({ error: 'Donnez un titre au formulaire.' });
  try {
    const created = await forms('/forms', { method: 'POST', body: { info: { title, documentTitle: title } } });
    // Fermé d'office (décision de Théo, 01/10/2026) : contrairement à la doc Google, un formulaire créé
    // par l'API sortait DÉJÀ publié et ouvert aux réponses. On le publie avec le bouton « Publier ».
    await closeNew(created.formId);
    const f = await forms(`/forms/${created.formId}`);
    const row = await prisma.googleForm.create({ data: { formId: f.formId, addedBy: req.user!.id, ...metaOf(f), lastSyncedAt: new Date() } });
    await journal(f.formId, req.user!.id, 'create', title);
    emitEvent('forms:changed', null);
    res.status(201).json(await prisma.googleForm.findUnique({ where: { id: row.id }, select: CATALOGUE }));
  } catch (e) { fail(res, e, 'Création du formulaire impossible.'); }
});

// GET /api/forms/:id/form — structure EN DIRECT (éditeur) : `forms.get`, catalogue mis à jour au passage.
router.get('/:id/form', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const row = await prisma.googleForm.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Formulaire introuvable.' });
    const f = await forms(`/forms/${row.formId}`);
    await prisma.googleForm.update({ where: { id: row.id }, data: metaOf(f) });
    const by = row.lastEditedBy ? await prisma.user.findUnique({ where: { id: row.lastEditedBy }, select: { name: true } }) : null;
    res.json({ form: f, lastEditedBy: by?.name || null, lastEditedAt: row.lastEditedAt });
  } catch (e) { fail(res, e, 'Lecture du formulaire impossible.'); }
});

// POST /api/forms/:id/batch { requests, revisionId, summary } — modifications de l'éditeur maison.
// `requiredRevisionId` : Google refuse si le formulaire a bougé depuis la dernière lecture (→ 409,
// le client recharge au lieu d'écraser). Réponse : le formulaire à jour (nouvelle révision).
router.post('/:id/batch', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  const { requests, revisionId, summary } = req.body || {};
  if (!Array.isArray(requests) || !requests.length || requests.length > MAX_OPS) return res.status(400).json({ error: `Entre 1 et ${MAX_OPS} modifications attendues.` });
  const bad = requests.find((r: any) => !r || typeof r !== 'object' || Object.keys(r).length !== 1 || !(EDIT_OPS as readonly string[]).includes(Object.keys(r)[0]));
  if (bad) return res.status(400).json({ error: 'Modification non autorisée.' });
  if (typeof revisionId !== 'string' || !revisionId) return res.status(400).json({ error: 'Révision du formulaire manquante : rechargez-le.' });
  try {
    const row = await prisma.googleForm.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Formulaire introuvable.' });
    const out: any = await forms(`/forms/${row.formId}:batchUpdate`, { method: 'POST', body: { requests, includeFormInResponse: true, writeControl: { requiredRevisionId: revisionId } } });
    if (out?.form) await prisma.googleForm.update({ where: { id: row.id }, data: metaOf(out.form) });
    await journal(row.formId, req.user!.id, 'edit', typeof summary === 'string' ? summary : `${requests.length} modification(s)`);
    emitEvent('forms:changed', null);
    res.json({ form: out?.form || null });
  } catch (e) { fail(res, e, 'Enregistrement impossible.'); }
});

// POST /api/forms/:id/publish { isPublished, isAcceptingResponses }
router.post('/:id/publish', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  const { isPublished, isAcceptingResponses } = req.body || {};
  if (typeof isPublished !== 'boolean' || typeof isAcceptingResponses !== 'boolean') return res.status(400).json({ error: 'État de publication invalide.' });
  try {
    const row = await prisma.googleForm.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Formulaire introuvable.' });
    // Un formulaire non publié n'accepte pas de réponses : on ne laisse pas Google trancher en silence.
    const state = { isPublished, isAcceptingResponses: isPublished && isAcceptingResponses };
    try {
      await forms(`/forms/${row.formId}:setPublishSettings`, { method: 'POST', body: { publishSettings: { publishState: state }, updateMask: 'publishState' } });
    } catch (e) {
      if (e instanceof GoogleApiError && e.status === 400) return res.status(422).json({ error: 'Ce formulaire est ancien (antérieur aux réglages de publication de Google) : ouvrez-le dans Google pour gérer ses réponses.' });
      throw e;
    }
    const f = await forms(`/forms/${row.formId}`);
    await prisma.googleForm.update({ where: { id: row.id }, data: metaOf(f) });
    await journal(row.formId, req.user!.id, 'publish', !state.isPublished ? 'Non publié' : state.isAcceptingResponses ? 'Ouvert aux réponses' : 'Réponses fermées');
    emitEvent('forms:changed', null);
    res.json(await prisma.googleForm.findUnique({ where: { id: row.id }, select: CATALOGUE }));
  } catch (e) { fail(res, e, 'Publication impossible.'); }
});

/** Formulaire neuf (création, copie) : non publié, réponses fermées. Échec sans gravité (journalisé). */
async function closeNew(formId: string) {
  try { await forms(`/forms/${formId}:setPublishSettings`, { method: 'POST', body: { publishSettings: { publishState: { isPublished: false, isAcceptingResponses: false } }, updateMask: 'publishState' } }); }
  catch (e) { console.error('[forms] fermeture du nouveau formulaire impossible :', e instanceof Error ? e.message : e); }
}

/** Élément recopiable par l'API (duplication) : sans images (URL temporaires en lecture), sans envoi de fichier. */
function copyable(it: any): any | null {
  if (it.imageItem || it.questionItem?.question?.fileUploadQuestion) return null;
  const c = JSON.parse(JSON.stringify(it));
  if (c.questionItem) delete c.questionItem.image;
  if (c.questionGroupItem) delete c.questionGroupItem.image;
  const opts = c.questionItem?.question?.choiceQuestion?.options;
  if (opts) opts.forEach((o: any) => delete o.image);
  return c;
}

// POST /api/forms/:id/duplicate — copie du formulaire (questions, sections, logique, quiz). Les mêmes
// identifiants sont réutilisés dans le nouveau formulaire : les aiguillages entre sections restent valides.
router.post('/:id/duplicate', authenticateToken, requireRole(FORMS_ROLES), async (req: AuthRequest, res) => {
  try {
    const row = await prisma.googleForm.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Formulaire introuvable.' });
    const src = await forms(`/forms/${row.formId}`);
    const title = `Copie de ${src.info?.title || row.title}`.slice(0, 300);
    const created = await forms('/forms', { method: 'POST', body: { info: { title, documentTitle: title } } });
    const items = (src.items || []).map(copyable);
    const skipped = items.filter((x: any) => !x).length;
    const requests: any[] = [];
    if (src.info?.description) requests.push({ updateFormInfo: { info: { description: src.info.description }, updateMask: 'description' } });
    if (src.settings?.quizSettings?.isQuiz) requests.push({ updateSettings: { settings: { quizSettings: { isQuiz: true } }, updateMask: 'quizSettings.isQuiz' } });
    items.filter(Boolean).forEach((item: any, i: number) => requests.push({ createItem: { item, location: { index: i } } }));
    if (requests.length) await forms(`/forms/${created.formId}:batchUpdate`, { method: 'POST', body: { requests } });
    await closeNew(created.formId);                       // une copie part fermée, comme une création
    const f = await forms(`/forms/${created.formId}`);
    const copy = await prisma.googleForm.create({ data: { formId: f.formId, addedBy: req.user!.id, ...metaOf(f), lastSyncedAt: new Date() } });
    await journal(f.formId, req.user!.id, 'duplicate', `Copie de « ${row.title} »`);
    emitEvent('forms:changed', null);
    res.status(201).json({ form: await prisma.googleForm.findUnique({ where: { id: copy.id }, select: CATALOGUE }), skipped });
  } catch (e) { fail(res, e, 'Duplication impossible.'); }
});

// GET /api/forms/:id/log — journal Gearbox des 50 dernières actions sur ce formulaire.
router.get('/:id/log', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const row = await prisma.googleForm.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Formulaire introuvable.' });
    const logs = await prisma.googleFormLog.findMany({ where: { formId: row.formId }, orderBy: { at: 'desc' }, take: 50 });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.userId))] } }, select: { id: true, name: true } });
    const name = new Map(users.map((u) => [u.id, u.name]));
    res.json(logs.map((l) => ({ id: l.id, action: l.action, detail: l.detail, at: l.at, user: name.get(l.userId) || 'Ancien membre' })));
  } catch (e) { fail(res, e, 'Lecture du journal impossible.'); }
});

// GET /api/forms/:id — fiche complète pour les statistiques : structure + réponses en cache
// (synchronisées d'abord si la dernière synchro date de plus de 2 minutes).
router.get('/:id', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    let row = await prisma.googleForm.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Formulaire introuvable.' });
    if (!row.lastSyncedAt || Date.now() - row.lastSyncedAt.getTime() > SYNC_TTL) {
      await syncForm(row.formId).catch(() => {});          // hors ligne Google : on sert le cache, erreur affichée
      row = (await prisma.googleForm.findUnique({ where: { id: row.id } }))!;
    }
    const responses = await prisma.googleFormResponse.findMany({
      where: { formId: row.formId }, orderBy: { submittedAt: 'desc' },
      select: { id: true, submittedAt: true, respondentEmail: true, answers: true },
    });
    res.json({ form: row, responses });
  } catch (e) { fail(res, e, 'Lecture du formulaire impossible.'); }
});

// POST /api/forms/:id/sync — « Actualiser » : resynchronisation COMPLÈTE.
router.post('/:id/sync', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const row = await prisma.googleForm.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Formulaire introuvable.' });
    await syncForm(row.formId, true);
    emitEvent('forms:changed', null);
    res.json(await prisma.googleForm.findUnique({ where: { id: row.id }, select: CATALOGUE }));
  } catch (e) { fail(res, e, 'Synchronisation impossible.'); }
});

// DELETE /api/forms/:id — RETIRE le formulaire de Gearbox (il reste intact dans Google) et
// purge ses réponses en cache (données personnelles des répondants) et son journal.
router.delete('/:id', authenticateToken, requireRole(FORMS_ROLES), async (req, res) => {
  try {
    const row = await prisma.googleForm.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Formulaire introuvable.' });
    // Retirer = plus aucune trace dans Gearbox : réponses en cache ET journal (plus aucun écran ne le montrerait).
    await prisma.$transaction([
      prisma.googleFormResponse.deleteMany({ where: { formId: row.formId } }),
      prisma.googleFormLog.deleteMany({ where: { formId: row.formId } }),
      prisma.googleForm.delete({ where: { id: row.id } }),
    ]);
    console.log(`[forms] « ${row.title} » retiré de Gearbox par ${(req as AuthRequest).user!.id}`);
    emitEvent('forms:changed', null);
    res.sendStatus(204);
  } catch (e) { fail(res, e, 'Retrait du formulaire impossible.'); }
});

export default router;
