import { Router, Response } from 'express';
import crypto from 'crypto';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { ASSISTANT_ROLES, ASSISTANT_TEAM_ROLES, ASSISTANT_CAP_ROLES } from '../auth/roles';
import { requireAssistant } from '../auth/assistantAccess';
import { emitToUser } from '../realtime';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import { complete, AssistantUnavailable, anyProviderConfigured, type ChatMsg, type ToolCall, type LlmReply } from '../assistant/providers';
import { CLIENT_TOOLS, systemPrompt, consignesRedaction } from '../assistant/prompt';
import { DATA_INTENT, ANNONCE_FAITE, toolsFor, isActionTool, isAutoAction, checkAction, describeProposed, openTarget, ACTION_EXPIRY_MS, ACTIONS_PER_TURN, STATUS_FR } from '../assistant/actions';
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
//
// ACTIONS (lot 1a « mIAouss qui agit », 28/10/2026) : un appel d'outil d'action (assistant/actions.ts)
// n'écrit RIEN de métier ici. Il crée une ligne `AssistantAction` `proposed`, rattachée au message de
// réponse (`meta.actions`) ; la carte s'affiche, la personne valide, le NAVIGATEUR écrit par les routes
// habituelles (mêmes droits) en encadrant l'écriture de :
//   POST /actions/:id/claim  → `executing`, UNE SEULE FOIS (réservation atomique), 24 h maximum
//   POST /actions/:id/result → `done` | `failed` + note « ✅ … » / « ⚠️ Échec : … » dans la discussion
//   POST /actions/:id/refuse → `refused` + note « ❌ Refusé : … »
// ═══════════════════════════════════════════════════════════════════════════

// Équipe marketing ET non coupé par le Master (27/10/2026) : porte unique `auth/assistantAccess.ts`.
router.use(authenticateToken, requireAssistant);

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

interface Pending { userId: string; question: string; forced: boolean; messages: ChatMsg[]; calls: ToolCall[]; rounds: number; counted: boolean; noted: string[]; tools: string[]; actions: string[]; at: number; redaction?: boolean }
const pending = new Map<string, Pending>();
const sweep = () => { const now = Date.now(); for (const [k, v] of pending) if (now - v.at > PENDING_TTL) pending.delete(k); };

// `DATA_INTENT` (réponse sans outil jetée, outil obligatoire) vit dans assistant/actions.ts depuis le 28/10/2026 :
// le lanceur d'evals l'importe, une copie dériverait sans prévenir.

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Résultat d'un outil de LECTURE renvoyé au modèle, balisé (règle 7 du prompt : donnée, jamais instruction).
 * ⚠️ Le contenu vient de Gearbox mais a pu être SAISI par n'importe qui (nom de projet, note…) : une balise
 * fermante recopiée dedans ferait sortir la suite du cadre, on la neutralise.
 */
const wrapData = (tool: string, content: string) =>
  `<donnees_gearbox outil="${tool}">${content.replace(/<\/?donnees_gearbox/gi, '‹donnees_gearbox')}</donnees_gearbox>`;

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
 * Fait avancer un tour : appelle le modèle, exécute `retenir` et `consignes_redaction` sur place, rend la main au
 * navigateur pour les outils de lecture, ou termine en enregistrant la réponse.
 */
async function advance(req: AuthRequest, res: Response, st: Pending) {
  const userId = req.user!.id;
  const role = req.user!.role;
  const tools = toolsFor(role);
  for (;;) {
    const lastRound = st.rounds >= TOOL_ROUNDS_MAX;
    let reply: LlmReply;
    const kind = st.counted ? 'suite' : 'question';
    try {
      // 2 000 jetons (28/10/2026) : la réflexion de Groq (providers.ts) se paie sur la sortie.
      // Consignes de rédaction déjà lues (`st.redaction`) : le tour suivant n'a plus qu'à écrire → seul l'outil
      // `creer_publication`. Mesuré le 28/10 : une publication coûtait ~7 300 jetons en deux appels rapprochés, pour un
      // plafond Groq de 8 000/min partagé par l'équipe — saturé dès qu'un collègue écrivait en même temps.
      const offered = st.redaction ? tools.filter((t) => t.function.name === 'creer_publication') : tools;
      reply = await complete(st.messages, lastRound ? null : offered, {
        maxTokens: 2_000,
        toolChoice: st.forced && st.rounds === 0 ? 'required' : 'auto',
        onFailure: (f) => void record(userId, { provider: f.provider, model: f.model, kind, ms: f.ms, ok: false, error: f.error }),
      });
    } catch (e) {
      if (e instanceof AssistantUnavailable) { await dropActions(userId, st); return { unavailable: e }; }
      throw e;
    }
    await record(userId, { provider: reply.provider, model: reply.model, kind, inTokens: reply.inTokens, outTokens: reply.outTokens, ms: reply.ms, ok: true });
    st.counted = true;

    // Réponse sans outil à une question de DONNÉES, ou qui ANNONCE une action faite sans l'avoir proposée (28/10/2026) :
    // jetée, on oblige l'outil (une seule fois).
    if (!reply.toolCalls.length && st.rounds === 0 && !st.forced && (DATA_INTENT.test(st.question) || ANNONCE_FAITE.test(reply.content || ''))) {
      st.forced = true;
      continue;
    }
    if (!reply.toolCalls.length) {
      const content = reply.content.trim() || (st.actions.length ? 'Voici ce que je te propose :' : "Je n'ai pas de réponse à te donner là-dessus.");
      return { done: await finish(userId, st, reply.provider, content) };
    }

    st.rounds += 1;
    // ⚠️ Jamais la réflexion du modèle dans l'historique : `content` arrive déjà nettoyé (providers.ts, stripThink).
    st.messages.push({ role: 'assistant', content: reply.content || '', tool_calls: reply.toolCalls });
    const clientCalls: ToolCall[] = [];
    let proposed = 0, actionErrors = 0, others = 0, readsServer = 0;
    const opened: string[] = [];
    for (const c of reply.toolCalls) {
      const name = c.function.name;
      if (name === 'retenir') {
        st.messages.push({ role: 'tool', tool_call_id: c.id, content: await retenir(userId, c.function.arguments, st) });
      } else if (name === 'consignes_redaction') {
        // Lot 1b (28/10/2026) : consignes lues sur le serveur, sans aller-retour navigateur. Contenu DE CONFIANCE (fichiers
        // du dépôt) : PAS balisé <donnees_gearbox>. Refusé au rôle qui ne l'a pas reçu (il ne peut pas publier).
        const allowed = tools.some((t) => t.function.name === name);
        st.messages.push({ role: 'tool', tool_call_id: c.id, content: allowed ? consignesRedaction(safeJson(c.function.arguments)) : JSON.stringify({ erreur: 'Outil non disponible pour ton rôle.' }) });
        if (allowed) { readsServer += 1; st.tools.push(name); st.redaction = true; } else others += 1;
      } else if ((CLIENT_TOOLS as readonly string[]).includes(name)) {
        clientCalls.push(c);
        st.tools.push(name);
      } else if (isActionTool(name)) {
        const out = await proposeAction(userId, role, c, st);
        st.messages.push({ role: 'tool', tool_call_id: c.id, content: out.content });
        if (out.ok) { proposed += 1; if (out.open) opened.push(out.open); } else actionErrors += 1;
      } else {
        others += 1;
        st.messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ erreur: 'Outil inconnu.' }) });
      }
    }
    // Raccourci : un tour fait UNIQUEMENT d'actions acceptées (aucun outil de lecture, aucune erreur à corriger)
    // se termine sans rappeler le modèle — il n'a rien de neuf à lire, et chaque appel est payé sur le quota.
    // ⚠️ Pas si le tour a lu `consignes_redaction` (28/10/2026) : le modèle doit encore ÉCRIRE le texte avec.
    if (!clientCalls.length && proposed && !actionErrors && !others && !readsServer) {
      const content = reply.content.trim()
        || (opened.length === proposed ? `J'ouvre ${opened.join(' et ')}.` : 'Voici ce que je te propose :');
      return { done: await finish(userId, st, reply.provider, content) };
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

/** Enregistre la réponse finale du tour et y rattache ses actions proposées. */
async function finish(userId: string, st: Pending, provider: string, content: string) {
  const meta: Record<string, unknown> = { provider, tools: st.tools, noted: st.noted, ...(st.actions.length ? { actions: st.actions } : {}) };
  const saved = await prisma.assistantMessage.create({ data: { userId, role: 'assistant', content, meta: meta as Prisma.InputJsonValue } });
  if (st.actions.length) await prisma.assistantAction.updateMany({ where: { id: { in: st.actions }, userId }, data: { messageId: saved.id } });
  emitToUser(userId, 'assistant:conversation');
  const [withActions] = await attachActions(userId, [saved]);
  return withActions;
}

/** Appel d'un outil d'action : validé par `checkAction` (seule porte), puis journalisé `proposed`. */
async function proposeAction(userId: string, role: string, c: ToolCall, st: Pending): Promise<{ ok: boolean; content: string; open?: string }> {
  if (st.actions.length >= ACTIONS_PER_TURN) {
    return { ok: false, content: JSON.stringify({ erreur: `Au plus ${ACTIONS_PER_TURN} actions par question : propose les autres ensuite.` }) };
  }
  const chk = checkAction(c.function.name, safeJson(c.function.arguments), role);
  if (chk.ok === false) return { ok: false, content: JSON.stringify({ erreur: chk.error }) };
  const row = await prisma.assistantAction.create({
    data: { userId, type: chk.type, payload: chk.payload as Prisma.InputJsonValue, summary: chk.summary, status: 'proposed' },
  });
  st.actions.push(row.id);
  return { ok: true, content: describeProposed(chk.summary, chk.auto), ...(chk.auto ? { open: openTarget(chk.payload) } : {}) };
}

/**
 * Tour interrompu (fournisseurs épuisés) : ses actions n'ont pas de message porteur et ne s'afficheraient jamais.
 * On les clôt (`expired`) plutôt que de laisser des lignes réservables par leur seul id.
 */
async function dropActions(userId: string, st: Pending) {
  if (!st.actions.length) return;
  await prisma.assistantAction.updateMany({ where: { id: { in: st.actions }, userId, status: 'proposed' }, data: { status: 'expired', error: 'Tour interrompu.' } }).catch(() => {});
  st.actions = [];
}

// ---------------------------------------------------------------- vues des actions
type ActionRow = { id: string; type: string; payload: unknown; summary: string; status: string; error: string | null; result: unknown; createdAt: Date };
const expiryCutoff = () => new Date(Date.now() - ACTION_EXPIRY_MS);

/** Expiration PARESSEUSE : les `proposed` de plus de 24 h passent `expired` au moment où on les lit. */
async function expireStale(userId: string) {
  await prisma.assistantAction.updateMany({ where: { userId, status: 'proposed', createdAt: { lte: expiryCutoff() } }, data: { status: 'expired' } });
}

/** `AssistantActionView` du contrat (types.ts côté client). Le statut est recalculé : la base peut avoir un temps de retard. */
const actionView = (a: ActionRow) => ({
  id: a.id, type: a.type, payload: a.payload, summary: a.summary,
  status: a.status === 'proposed' && a.createdAt <= expiryCutoff() ? 'expired' : a.status,
  error: a.error ?? null, result: a.result ?? null, createdAt: a.createdAt, auto: isAutoAction(a.type),
});
type ActionView = ReturnType<typeof actionView>;

/** Ajoute `actions` aux messages qui en portent (`meta.actions`), dans l'ordre de proposition. */
async function attachActions<T extends { id: string; role: string; content: string; meta: unknown; createdAt: Date }>(userId: string, msgs: T[]) {
  const ids = msgs.flatMap((m) => metaActions(m.meta));
  let rows: ActionRow[] = [];
  if (ids.length) {
    await expireStale(userId);
    rows = await prisma.assistantAction.findMany({ where: { id: { in: ids }, userId } });
  }
  return msgs.map((m) => {
    const mine = metaActions(m.meta).map((id) => rows.find((r) => r.id === id)).filter(Boolean) as ActionRow[];
    const out: { id: string; role: string; content: string; meta: unknown; createdAt: Date; actions?: ActionView[] } = { id: m.id, role: m.role, content: m.content, meta: m.meta, createdAt: m.createdAt };
    if (mine.length) out.actions = mine.map(actionView);
    return out;
  });
}
const metaActions = (meta: unknown): string[] => {
  const a = meta && typeof meta === 'object' ? (meta as any).actions : null;
  return Array.isArray(a) ? a.filter((x: unknown): x is string => typeof x === 'string') : [];
};

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

    // Le modèle relit l'ÉTAT de ses actions passées (28/10/2026) : sans ça, une carte jamais validée passerait,
    // au tour suivant, pour une chose faite. Les notes « ✅ / ❌ / ⚠️ » (meta.kind='action') sont dans l'historique.
    const past = await attachActions(userId, history.reverse());
    const st: Pending = {
      userId, question: message, forced: false, rounds: 0, counted: false, noted: [], tools: [], actions: [], calls: [], at: Date.now(),
      messages: [
        { role: 'system', content: systemPrompt(me, notes, orga, cleanBotName((s?.look as any)?.name)) },
        ...past.map((m) => {
          const etat = m.actions?.length ? `\n[Actions : ${m.actions.map((a) => `« ${a.summary} » ${STATUS_FR[a.status] || a.status}`).join(' ; ')}]` : '';
          return { role: m.role === 'assistant' ? 'assistant' : 'user', content: clip(m.content, HISTORY_CHARS) + etat } as ChatMsg;
        }),
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
      st.messages.push({ role: 'tool', tool_call_id: c.id, content: wrapData(c.function.name, content) });
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
  res.json(await attachActions(req.user!.id, rows.reverse()));
});

/**
 * « Nouvelle discussion » ET déconnexion volontaire (AuthContext.logout). La mémoire, elle, reste.
 * Le journal des actions reste aussi (28/10/2026), mais les cartes encore `proposed` sont closes : leur
 * message disparaît, elles ne doivent plus être réservables.
 */
router.delete('/conversation', async (req: AuthRequest, res) => {
  await prisma.assistantMessage.deleteMany({ where: { userId: req.user!.id } });
  await prisma.assistantAction.updateMany({ where: { userId: req.user!.id, status: 'proposed' }, data: { status: 'expired', error: 'Discussion effacée.' } });
  for (const [k, v] of pending) if (v.userId === req.user!.id) pending.delete(k);
  emitToUser(req.user!.id, 'assistant:conversation');
  res.status(204).end();
});

// ---------------------------------------------------------------- actions (lot 1a, 28/10/2026)
// ⚠️ Ces routes n'écrivent AUCUNE donnée métier : le navigateur le fait entre `claim` et `result`, par les routes
// habituelles, avec leurs propres contrôles de droits. Elles ne gardent que le journal et la règle « une seule fois ».
// Tout est filtré sur `req.user.id` : l'action d'autrui se comporte comme une action introuvable.

/** Pourquoi une action n'est plus réservable / refusable (409). */
const whyNot = (a: { status: string; createdAt: Date } | null) => {
  if (!a) return 'Action introuvable.';
  if (a.status === 'proposed' && a.createdAt <= expiryCutoff()) return 'Action expirée (plus de 24 h) : redemande-la à mIAouss.';
  return ({ executing: 'Action déjà en cours.', done: 'Action déjà faite.', failed: 'Action déjà tentée (échec).', refused: 'Action refusée.', expired: 'Action expirée : redemande-la à mIAouss.' } as Record<string, string>)[a.status] || 'Action indisponible.';
};

/** Note d'action dans la discussion (meta.kind='action') : relue par le modèle au tour suivant. */
// ⚠️ Écrite dans la MÊME transaction que le changement de statut (`tx`) : mesuré le 28/10 sur une 5G instable, la
// connexion a coupé entre les deux — statut « refusée » écrit, note perdue, et le modèle ne l'aurait jamais su.
// L'événement temps réel part APRÈS la transaction (`emitToUser` par l'appelant).
async function actionNote(tx: Prisma.TransactionClient, userId: string, actionId: string, content: string) {
  await tx.assistantMessage.create({ data: { userId, role: 'assistant', content: clip(content, 600), meta: { kind: 'action', actions: [actionId] } } });
}

/**
 * Réservation : `proposed` → `executing`, UNE SEULE FOIS (`updateMany` conditionnel = atomique : deux onglets qui
 * valident ensemble, un seul passe). `payload` facultatif = la carte corrigée, REVALIDÉE par `checkAction` (mêmes
 * clés que les arguments de l'outil) — le rôle est relu sur le jeton, pas sur la ligne.
 */
router.post('/actions/:id/claim', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = String(req.params.id);
    const row = await prisma.assistantAction.findFirst({ where: { id, userId } });
    if (!row || row.status !== 'proposed' || row.createdAt <= expiryCutoff()) {
      if (row && row.status === 'proposed') await expireStale(userId);
      return res.status(409).json({ error: whyNot(row) });
    }
    const raw = req.body?.payload;
    if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) return res.status(400).json({ error: 'Champs invalides.' });
    // Sans correction, le droit est quand même revérifié sur la ligne : le rôle a pu changer depuis la proposition.
    const chk = checkAction(row.type, raw ?? ((row.payload as Record<string, unknown>) || {}), req.user!.role);
    if (chk.ok === false) return res.status(400).json({ error: chk.error });
    const r = await prisma.assistantAction.updateMany({
      where: { id, userId, status: 'proposed', createdAt: { gt: expiryCutoff() } },
      data: { status: 'executing', payload: chk.payload as Prisma.InputJsonValue, summary: chk.summary },
    });
    const fresh = await prisma.assistantAction.findFirst({ where: { id, userId } });
    if (!r.count || !fresh) return res.status(409).json({ error: whyNot(fresh) });
    emitToUser(userId, 'assistant:conversation');
    res.json({ action: actionView(fresh) });
  } catch (e) {
    console.error('[assistant] claim :', e);
    res.status(500).json({ error: 'Erreur interne de mIAouss.' });
  }
});

/** Compte rendu du navigateur : seulement depuis `executing`, vers `done` ou `failed`. */
router.post('/actions/:id/result', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = String(req.params.id);
    const ok = req.body?.ok === true;
    const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '');
    const summary = str(req.body?.summary, 300);
    const ref = str(req.body?.ref, 120);
    const error = ok ? null : (str(req.body?.error, 300) || 'Échec sans détail.');
    // Statut + note dans UNE transaction : les deux, ou rien (voir actionNote).
    const fresh = await prisma.$transaction(async (tx) => {
      const r = await tx.assistantAction.updateMany({
        where: { id, userId, status: 'executing' },
        data: { status: ok ? 'done' : 'failed', error, result: { ...(summary ? { summary } : {}), ...(ref ? { ref } : {}) } },
      });
      const row = await tx.assistantAction.findFirst({ where: { id, userId } });
      if (!r.count || !row) return { refus: row ? 'Action pas en cours d’exécution.' : 'Action introuvable.' } as const;
      // Navigation réussie (`ouvrir`, automatique) : pas de note « ✅ » — la fenêtre ouverte se voit, la ligne ne serait
      // que du bruit dans la discussion (arbitrage du 28/10). Un échec, lui, reste noté.
      if (!(ok && isAutoAction(row.type))) await actionNote(tx, userId, id, ok ? `✅ ${summary || row.summary}` : `⚠️ Échec : ${row.summary} — ${error}`);
      return { row } as const;
    });
    if ('refus' in fresh) return res.status(409).json({ error: fresh.refus });
    emitToUser(userId, 'assistant:conversation');
    res.json({ action: actionView(fresh.row) });
  } catch (e) {
    console.error('[assistant] result :', e);
    res.status(500).json({ error: 'Erreur interne de mIAouss.' });
  }
});

/** Refus de la carte : seulement depuis `proposed` (non expirée). */
router.post('/actions/:id/refuse', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = String(req.params.id);
    // Statut + note dans UNE transaction (voir actionNote).
    const out = await prisma.$transaction(async (tx) => {
      const r = await tx.assistantAction.updateMany({ where: { id, userId, status: 'proposed', createdAt: { gt: expiryCutoff() } }, data: { status: 'refused' } });
      const row = await tx.assistantAction.findFirst({ where: { id, userId } });
      if (r.count && row) await actionNote(tx, userId, id, `❌ Refusé : ${row.summary}`);
      return { ok: !!(r.count && row), row };
    });
    if (!out.ok) {
      if (out.row?.status === 'proposed') await expireStale(userId);
      return res.status(409).json({ error: whyNot(out.row) });
    }
    emitToUser(userId, 'assistant:conversation');
    res.json({ action: actionView(out.row!) });
  } catch (e) {
    console.error('[assistant] refuse :', e);
    res.status(500).json({ error: 'Erreur interne de mIAouss.' });
  }
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

// ---------------------------------------------------------------- apparence personnelle (27/10/2026)
// Chacun habille SON mIAouss (Réglages › mIAouss). Le serveur ne connaît pas le catalogue (il vit côté client,
// ui2/apps/assistant/look.ts) : il garde seulement une LISTE BLANCHE de clés, des identifiants courts et un prénom
// propre. Un identifiant inconnu du catalogue est ramené au défaut par le client, il ne casse rien.
// ⚠️ Route à part de PUT /prefs, qui réécrit `memoryPaused` à chaque appel.
const LOOK_KEYS = ['fur', 'motif', 'ears', 'eyes', 'pupil', 'outfit', 'outfitColor', 'hat', 'glasses', 'neck'] as const;
const LOOK_ID = /^[a-z0-9-]{1,24}$/;
const NAME_MAX = 16;
/** Prénom affiché : lettres (accents compris), espaces, tirets, apostrophes ; vide = « mIAouss ». */
export const cleanBotName = (v: unknown): string => {
  const s = typeof v === 'string' ? v.replace(/[^\p{L}\p{N} '’-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  return s;
};
function cleanLook(raw: any): Record<string, string> | null {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Apparence invalide.');
  const out: Record<string, string> = {};
  for (const k of LOOK_KEYS) {
    const v = raw[k];
    if (v === undefined) continue;
    if (typeof v !== 'string' || !LOOK_ID.test(v)) throw new Error(`Valeur invalide pour « ${k} ».`);
    out[k] = v;
  }
  const name = cleanBotName(raw.name);
  if (name) out.name = name;
  return out;
}

router.get('/look', async (req: AuthRequest, res) => {
  const s = await settingsOf(req.user!.id);
  res.json({ look: (s?.look as any) ?? null });
});

router.put('/look', async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  let look: Record<string, string> | null;
  try { look = cleanLook(req.body?.look); } catch (e) { return res.status(400).json({ error: (e as Error).message }); }
  const value = look === null ? Prisma.DbNull : look;
  await prisma.assistantUser.upsert({ where: { userId }, create: { userId, look: value }, update: { look: value } });
  // Ses autres onglets / appareils relisent leur mascotte (événement PRIVÉ : c'est son chat à lui).
  emitToUser(userId, 'assistant:look');
  res.json({ look });
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
