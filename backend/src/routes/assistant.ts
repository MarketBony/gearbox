import { Router, Response } from 'express';
import crypto from 'crypto';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { ASSISTANT_ROLES, ASSISTANT_TEAM_ROLES, ASSISTANT_CAP_ROLES } from '../auth/roles';
import { emitToUser } from '../realtime';
import { prisma } from '../db';
import { complete, AssistantUnavailable, anyProviderConfigured, type ChatMsg, type ToolCall, type LlmReply } from '../assistant/providers';
import { TOOLS, CLIENT_TOOLS, systemPrompt } from '../assistant/prompt';
import { record, capOf, questionsSince, parisMidnight, personalUsage, capacity, UNLIMITED } from '../assistant/usage';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// ASSISTANT IA « mIAouss » (P0, 08/10/2026).
//
// Réservé à l'ÉQUIPE MARKETING (`ASSISTANT_ROLES`) sur TOUTES les routes, lecture comprise.
// Tout appartient à l'interlocuteur : chaque requête filtre sur `req.user.id`, jamais sur une
// valeur du client ; même le Master ne lit ni la discussion ni la mémoire des autres (il voit
// seulement les COMPTEURS de l'équipe, et règle les plafonds).
//
// Déroulé d'un tour (Gearbox calcule, l'IA rédige) :
//   POST /chat { message }        → { status:'done', message }  ou  { status:'tools', turnId, calls }
//   POST /chat/tools { turnId, results } → idem (le navigateur a exécuté les outils de lecture)
// L'état d'un tour en attente d'outils reste SUR LE SERVEUR (`pending`) : le client ne renvoie
// que des résultats, jamais l'historique — il ne peut pas réécrire la conversation ni le prompt.
// ═══════════════════════════════════════════════════════════════════════════

router.use(authenticateToken, requireRole(ASSISTANT_ROLES));

const MESSAGE_MAX = 2_000;
const NOTE_MAX = 200;
const NOTES_MAX = 40;
/** Mémoire injectée à chaque appel : au plus ~400 jetons (les plus récentes d'abord). */
const NOTES_PROMPT_CHARS = 1_600;
/** Échanges précédents relus à chaque question (chacun tronqué). */
const HISTORY_MESSAGES = 8;
const HISTORY_CHARS = 1_200;
const TOOL_RESULT_CHARS = 8_000;
const TOOL_ROUNDS_MAX = 3;
const PENDING_TTL = 3 * 60_000;

interface Pending { userId: string; question: string; forced: boolean; messages: ChatMsg[]; calls: ToolCall[]; rounds: number; counted: boolean; noted: string[]; tools: string[]; at: number }
const pending = new Map<string, Pending>();
const sweep = () => { const now = Date.now(); for (const [k, v] of pending) if (now - v.at > PENDING_TTL) pending.delete(k); };

/**
 * La question porte-t-elle sur des DONNÉES de Gearbox ? Mesuré le 08/10 : à « Qui est absent cette semaine ? »,
 * Qwen a répondu sans appeler d'outil… avec deux collègues INVENTÉS. Le prompt ne suffit pas : si la question
 * vise des données et que le modèle répond sans outil, on jette sa réponse et on repose la question avec
 * `tool_choice: required`. Liste volontairement large : un faux positif coûte un appel, un faux négatif ment.
 */
const DATA_INTENT = /\b(projets?|budgets?|enveloppes?|consomm|d[ée]penses?|absents?|absences?|cong[ée]s?|vacances|rtt|retards?|[ée]ch[ée]ances?|qui|combien|liste|total|chiffres?|concessions?|sites?)\b|consomm/i;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

async function settingsOf(userId: string) {
  return prisma.assistantUser.findUnique({ where: { userId } });
}

/** Notes de mémoire pour le prompt (null = mémoire en pause). */
async function promptNotes(userId: string, paused: boolean): Promise<string[] | null> {
  if (paused) return null;
  const notes = await prisma.assistantNote.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: NOTES_MAX });
  const out: string[] = [];
  let len = 0;
  for (const n of notes) { if (len + n.content.length > NOTES_PROMPT_CHARS) break; out.push(n.content); len += n.content.length; }
  return out;
}

const fail503 = (res: Response, e: AssistantUnavailable) => {
  const at = e.nextAt ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(e.nextAt)) : null;
  return res.status(503).json({ error: at ? `mIAouss fait la sieste : les fournisseurs gratuits sont épuisés ou saturés. Réessaie vers ${at}.` : 'mIAouss est injoignable pour le moment. Réessaie dans un instant.', nextAt: e.nextAt });
};

/**
 * Fait avancer un tour : appelle le modèle, exécute `retenir` sur place, rend la main au
 * navigateur pour les outils de lecture, ou termine en enregistrant la réponse.
 */
async function advance(req: AuthRequest, res: Response, st: Pending) {
  const userId = req.user!.id;
  for (;;) {
    const lastRound = st.rounds >= TOOL_ROUNDS_MAX;
    let reply: LlmReply;
    const kind = st.counted ? 'suite' : 'question';
    try {
      reply = await complete(st.messages, lastRound ? null : TOOLS, {
        toolChoice: st.forced && st.rounds === 0 ? 'required' : 'auto',
        onFailure: (f) => void record(userId, { provider: f.provider, model: f.model, kind, ms: f.ms, ok: false, error: f.error }),
      });
    } catch (e) {
      if (e instanceof AssistantUnavailable) return { unavailable: e };
      throw e;
    }
    await record(userId, { provider: reply.provider, model: reply.model, kind, inTokens: reply.inTokens, outTokens: reply.outTokens, ms: reply.ms, ok: true });
    st.counted = true;

    if (!reply.toolCalls.length && st.rounds === 0 && !st.forced && DATA_INTENT.test(st.question)) {
      st.forced = true;   // réponse sans outil à une question de données : jetée, on oblige l'outil
      continue;
    }
    if (!reply.toolCalls.length) {
      const content = reply.content.trim() || "Je n'ai pas de réponse à te donner là-dessus.";
      const saved = await prisma.assistantMessage.create({
        data: { userId, role: 'assistant', content, meta: { provider: reply.provider, tools: st.tools, noted: st.noted } },
      });
      emitToUser(userId, 'assistant:conversation');
      return { done: { id: saved.id, role: 'assistant', content, meta: saved.meta, createdAt: saved.createdAt } };
    }

    st.rounds += 1;
    st.messages.push({ role: 'assistant', content: reply.content || '', tool_calls: reply.toolCalls });
    const clientCalls: ToolCall[] = [];
    for (const c of reply.toolCalls) {
      if (c.function.name === 'retenir') {
        st.messages.push({ role: 'tool', tool_call_id: c.id, content: await retenir(userId, c.function.arguments, st) });
      } else if ((CLIENT_TOOLS as readonly string[]).includes(c.function.name)) {
        clientCalls.push(c);
        st.tools.push(c.function.name);
      } else {
        st.messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ erreur: 'Outil inconnu.' }) });
      }
    }
    if (clientCalls.length) {
      sweep();
      const turnId = crypto.randomUUID();
      st.calls = clientCalls;
      st.at = Date.now();
      pending.set(turnId, st);
      return { tools: { turnId, calls: clientCalls.map((c) => ({ id: c.id, name: c.function.name, args: safeJson(c.function.arguments) })) } };
    }
  }
}

const safeJson = (s: string) => { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

/** Outil serveur : n'écrit QUE dans la mémoire de l'interlocuteur, et jamais en pause. */
async function retenir(userId: string, args: string, st: Pending): Promise<string> {
  const note = String(safeJson(args).note || '').trim().slice(0, NOTE_MAX);
  if (!note) return JSON.stringify({ erreur: 'Note vide.' });
  const s = await settingsOf(userId);
  if (s?.memoryPaused) return JSON.stringify({ erreur: 'Mémoire en pause : rien n’a été retenu.' });
  const n = await prisma.assistantNote.count({ where: { userId } });
  if (n >= NOTES_MAX) return JSON.stringify({ erreur: `Mémoire pleine (${NOTES_MAX} notes) : demande de faire le tri dans Paramètres.` });
  const created = await prisma.assistantNote.create({ data: { userId, content: note, source: 'ia' } });
  st.noted.push(created.id);
  emitToUser(userId, 'assistant:notes');
  return JSON.stringify({ ok: true, retenu: note });
}

// ---------------------------------------------------------------- discussion
router.post('/chat', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const message = String(req.body?.message ?? '').trim();
    // Organisation du groupe envoyée par le navigateur (lue dans constants.ts). Bornée : elle n'engage que la session
    // de l'interlocuteur, mais chaque caractère est payé sur le quota gratuit.
    const orga = typeof req.body?.orga === 'string' ? req.body.orga.slice(0, 1_500) : '';
    if (!message) return res.status(400).json({ error: 'Message vide.' });
    if (message.length > MESSAGE_MAX) return res.status(400).json({ error: `Message trop long (${MESSAGE_MAX} caractères maximum).` });
    if (!anyProviderConfigured()) return res.status(503).json({ error: 'mIAouss n’est pas configuré sur ce serveur.' });

    const [me, s] = await Promise.all([prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true } }), settingsOf(userId)]);
    if (!me) return res.status(401).json({ error: 'Compte introuvable.' });
    const cap = capOf(me.role, s?.dailyCap);
    if (cap !== UNLIMITED && (await questionsSince(userId, parisMidnight())) >= cap) {
      return res.status(429).json({ error: cap === 0 ? 'mIAouss est en pause pour toi (plafond à 0, réglé par le Master).' : `Tu as posé tes ${cap} questions du jour. Le compteur repart à minuit.`, cap });
    }

    const [history, notes] = await Promise.all([
      prisma.assistantMessage.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: HISTORY_MESSAGES }),
      promptNotes(userId, !!s?.memoryPaused),
    ]);
    const userMsg = await prisma.assistantMessage.create({ data: { userId, role: 'user', content: message } });

    const st: Pending = {
      userId, question: message, forced: false, rounds: 0, counted: false, noted: [], tools: [], calls: [], at: Date.now(),
      messages: [
        { role: 'system', content: systemPrompt(me, notes, orga) },
        ...history.reverse().map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clip(m.content, HISTORY_CHARS) } as ChatMsg)),
        { role: 'user', content: message },
      ],
    };
    const out = await advance(req, res, st);
    if (out.unavailable) {
      // La question n'a pas abouti : on la retire de la discussion (le navigateur la garde dans le champ).
      await prisma.assistantMessage.delete({ where: { id: userMsg.id } }).catch(() => {});
      return fail503(res, out.unavailable);
    }
    emitToUser(userId, 'assistant:conversation');
    if (out.tools) return res.json({ status: 'tools', userMessageId: userMsg.id, ...out.tools });
    return res.json({ status: 'done', userMessageId: userMsg.id, message: out.done });
  } catch (e) {
    console.error('[assistant] chat :', e);
    res.status(500).json({ error: 'Erreur interne de mIAouss.' });
  }
});

router.post('/chat/tools', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const turnId = String(req.body?.turnId || '');
    const st = pending.get(turnId);
    // Un tour appartient à son auteur : un turnId d'autrui se comporte comme un tour expiré.
    if (!st || st.userId !== userId || Date.now() - st.at > PENDING_TTL) {
      pending.delete(turnId);
      return res.status(410).json({ error: 'Cette question a expiré. Repose-la.' });
    }
    pending.delete(turnId);
    const results: any[] = Array.isArray(req.body?.results) ? req.body.results : [];
    for (const c of st.calls) {
      const r = results.find((x) => x && x.id === c.id);
      const content = r == null ? JSON.stringify({ erreur: 'Résultat indisponible.' }) : clip(typeof r.content === 'string' ? r.content : JSON.stringify(r.content), TOOL_RESULT_CHARS);
      st.messages.push({ role: 'tool', tool_call_id: c.id, content });
    }
    const out = await advance(req, res, st);
    if (out.unavailable) return fail503(res, out.unavailable);
    if (out.tools) return res.json({ status: 'tools', ...out.tools });
    return res.json({ status: 'done', message: out.done });
  } catch (e) {
    console.error('[assistant] chat/tools :', e);
    res.status(500).json({ error: 'Erreur interne de mIAouss.' });
  }
});

router.get('/conversation', async (req: AuthRequest, res) => {
  const rows = await prisma.assistantMessage.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 60 });
  res.json(rows.reverse().map((m) => ({ id: m.id, role: m.role, content: m.content, meta: m.meta, createdAt: m.createdAt })));
});

/** « Nouvelle discussion » ET déconnexion volontaire (AuthContext.logout). La mémoire, elle, reste. */
router.delete('/conversation', async (req: AuthRequest, res) => {
  await prisma.assistantMessage.deleteMany({ where: { userId: req.user!.id } });
  for (const [k, v] of pending) if (v.userId === req.user!.id) pending.delete(k);
  emitToUser(req.user!.id, 'assistant:conversation');
  res.status(204).end();
});

// ---------------------------------------------------------------- mémoire
const noteOut = (n: { id: string; content: string; source: string; createdAt: Date; updatedAt: Date }) => ({ id: n.id, content: n.content, source: n.source, createdAt: n.createdAt, updatedAt: n.updatedAt });

router.get('/notes', async (req: AuthRequest, res) => {
  const notes = await prisma.assistantNote.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: 'desc' } });
  res.json(notes.map(noteOut));
});

router.post('/notes', async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const content = String(req.body?.content ?? '').trim().slice(0, NOTE_MAX);
  if (!content) return res.status(400).json({ error: 'Note vide.' });
  if ((await prisma.assistantNote.count({ where: { userId } })) >= NOTES_MAX) return res.status(400).json({ error: `Mémoire pleine (${NOTES_MAX} notes).` });
  const n = await prisma.assistantNote.create({ data: { userId, content, source: 'user' } });
  emitToUser(userId, 'assistant:notes');
  res.status(201).json(noteOut(n));
});

router.put('/notes/:id', async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const content = String(req.body?.content ?? '').trim().slice(0, NOTE_MAX);
  if (!content) return res.status(400).json({ error: 'Note vide.' });
  const r = await prisma.assistantNote.updateMany({ where: { id: req.params.id, userId }, data: { content } });
  if (!r.count) return res.status(404).json({ error: 'Note introuvable.' });
  emitToUser(userId, 'assistant:notes');
  res.json(noteOut((await prisma.assistantNote.findUnique({ where: { id: req.params.id } }))!));
});

router.delete('/notes/:id', async (req: AuthRequest, res) => {
  const r = await prisma.assistantNote.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
  if (!r.count) return res.status(404).json({ error: 'Note introuvable.' });
  emitToUser(req.user!.id, 'assistant:notes');
  res.status(204).end();
});

router.delete('/notes', async (req: AuthRequest, res) => {
  await prisma.assistantNote.deleteMany({ where: { userId: req.user!.id } });
  emitToUser(req.user!.id, 'assistant:notes');
  res.status(204).end();
});

// ---------------------------------------------------------------- réglages et compteurs
async function meOut(userId: string, role: string) {
  const [s, u] = await Promise.all([settingsOf(userId), personalUsage(userId)]);
  const cap = capOf(role, s?.dailyCap);
  return { memoryPaused: !!s?.memoryPaused, cap, ...u, remaining: cap === UNLIMITED ? null : Math.max(0, cap - u.today) };
}

router.get('/me', async (req: AuthRequest, res) => {
  res.json(await meOut(req.user!.id, req.user!.role));
});

router.put('/prefs', async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const memoryPaused = !!req.body?.memoryPaused;
  await prisma.assistantUser.upsert({ where: { userId }, create: { userId, memoryPaused }, update: { memoryPaused } });
  emitToUser(userId, 'assistant:notes');
  res.json(await meOut(userId, req.user!.role));
});

/** Capacité de l'équipe (tous) + détail par personne (Master et Administrator). */
router.get('/usage', async (req: AuthRequest, res) => {
  try {
    const cap = await capacity();
    if (!ASSISTANT_TEAM_ROLES.includes(req.user!.role)) return res.json({ capacity: cap });
    const users = await prisma.user.findMany({ where: { role: { in: ASSISTANT_ROLES } }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } });
    const [settings, today, month] = await Promise.all([
      prisma.assistantUser.findMany({ where: { userId: { in: users.map((u) => u.id) } } }),
      prisma.assistantUsage.groupBy({ by: ['userId'], where: { kind: 'question', ok: true, createdAt: { gte: parisMidnight() } }, _count: true }),
      prisma.assistantUsage.groupBy({ by: ['userId'], where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600_000) } }, _sum: { inTokens: true, outTokens: true }, _count: true }),
    ]);
    const months = await prisma.assistantUsage.groupBy({ by: ['userId'], where: { kind: 'question', ok: true, createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600_000) } }, _count: true });
    const team = users.map((u) => {
      const s = settings.find((x) => x.userId === u.id);
      const t = month.find((x) => x.userId === u.id);
      return {
        userId: u.id, name: u.name, role: u.role,
        cap: capOf(u.role, s?.dailyCap), customCap: s?.dailyCap ?? null,
        today: today.find((x) => x.userId === u.id)?._count ?? 0,
        last30: months.find((x) => x.userId === u.id)?._count ?? 0,
        tokens30: (t?._sum.inTokens || 0) + (t?._sum.outTokens || 0),
      };
    });
    res.json({ capacity: cap, team, canSetCaps: ASSISTANT_CAP_ROLES.includes(req.user!.role) });
  } catch (e) {
    console.error('[assistant] usage :', e);
    res.status(500).json({ error: 'Compteurs indisponibles.' });
  }
});

/** Plafond quotidien d'une personne : Master seul. `cap` = null (défaut), -1 (sans limite) ou 0..500. */
router.put('/caps/:userId', requireRole(ASSISTANT_CAP_ROLES), async (req: AuthRequest, res) => {
  const raw = req.body?.cap;
  const cap = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  if (cap !== null && !(Number.isInteger(cap) && (cap === UNLIMITED || (cap >= 0 && cap <= 500)))) {
    return res.status(400).json({ error: 'Plafond invalide (0 à 500, ou sans limite).' });
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, role: true } });
  if (!target || !ASSISTANT_ROLES.includes(target.role)) return res.status(404).json({ error: 'Personne introuvable dans l’équipe marketing.' });
  await prisma.assistantUser.upsert({ where: { userId: target.id }, create: { userId: target.id, dailyCap: cap }, update: { dailyCap: cap } });
  emitToUser(target.id, 'assistant:notes');
  res.json({ userId: target.id, cap: capOf(target.role, cap), customCap: cap });
});

export default router;
