import { Router } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../auth/middleware';
import { hasSocialFeatures } from '../auth/roles';
import { joinConversationRooms, notifyConversationCreated } from '../realtime';

const router = Router();
const prisma = new PrismaClient();

// REST = chargement initial et historique uniquement.
// La création/édition/suppression/réaction de MESSAGE passe par Socket.IO
// (temps réel) — pas de route REST de secours : aucun consommateur aujourd'hui,
// à réévaluer au branchement frontend si un fallback hors-ligne s'avère utile.

// GET /api/chat/conversations — celles de l'utilisateur + le Chat Général
// (appartenance implicite : visible par tout authentifié SAUF le rôle External,
// aligné sur le gate UI de Chat.tsx).
router.get('/conversations', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const or: Prisma.ChatConversationWhereInput[] = [{ participants: { has: userId } }];
  if (role !== 'External') or.push({ type: 'general' });
  const conversations = await prisma.chatConversation.findMany({
    where: { OR: or },
    orderBy: { updatedAt: 'desc' }
  });
  res.json(conversations);
});

// GET /api/chat/conversations/:id/messages — historique complet trié par date
// (aucun pattern de pagination n'existe dans le backend — liste complète,
// comme le frontend qui charge tout le fil en mémoire).
router.get('/conversations/:id/messages', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const { id } = req.params;

  const conversation = await prisma.chatConversation.findUnique({ where: { id } });
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation introuvable.' });
  }
  // Général : accessible à tout authentifié non-External (appartenance implicite) ;
  // sinon, réservé aux participants.
  const allowed = conversation.type === 'general'
    ? role !== 'External'
    : conversation.participants.includes(userId);
  if (!allowed) {
    return res.status(403).json({ error: "Vous n'êtes pas participant de cette conversation." });
  }

  const messages = await prisma.chatMessage.findMany({
    where: { conversationId: id },
    orderBy: { timestamp: 'asc' }
  });
  res.json(messages);
});

// POST /api/chat/conversations — création privée ou groupe
// (le type 'general' est une conversation système, pas créable par cette route)
router.post('/conversations', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { type, participants, name, adminIds } = req.body;

  if (type !== 'private' && type !== 'group') {
    return res.status(400).json({ error: 'Champ "type" requis : "private" ou "group".' });
  }
  if (!Array.isArray(participants) || !participants.every(p => typeof p === 'string')) {
    return res.status(400).json({ error: 'Champ "participants" requis : tableau d\'ids utilisateur.' });
  }

  // Le créateur est toujours participant (ajouté s'il manque), doublons dédupliqués.
  const allParticipants = Array.from(new Set([...participants, userId]));

  // ⚠️ Aucun participant ne peut être un rôle SANS ACCÈS AU CHAT (chef de site).
  // Sans ce contrôle, on créait une conversation FANTÔME : elle existait en base, elle
  // apparaissait chez l'émetteur, et le destinataire ne la voyait jamais — ni rubrique
  // Chat, ni handlers socket enregistrés pour lui. Filtrer la liste côté écran ne
  // fermait rien : c'est ici que ça se joue.
  // Le contrôle porte sur les rôles réellement en base, jamais sur ce que le client
  // affirme envoyer.
  const profils = await prisma.user.findMany({
    where: { id: { in: allParticipants } },
    select: { id: true, name: true, role: true },
  });
  if (profils.length !== allParticipants.length) {
    return res.status(400).json({ error: 'Un des participants est introuvable.' });
  }
  const sansChat = profils.filter(u => !hasSocialFeatures(u.role));
  if (sansChat.length > 0) {
    return res.status(400).json({
      error: `Impossible : ${sansChat.map(u => u.name).join(', ')} n'a pas accès au chat.`,
    });
  }

  if (type === 'private') {
    if (allParticipants.length !== 2) {
      return res.status(400).json({ error: 'Une conversation privée doit avoir exactement 2 participants.' });
    }
    // Idempotence : si la conversation privée entre ces 2 utilisateurs existe, on la renvoie.
    const existing = await prisma.chatConversation.findFirst({
      where: {
        type: 'private',
        participants: { hasEvery: allParticipants }
      }
    });
    if (existing && existing.participants.length === 2) {
      return res.json(existing);
    }
  }

  if (type === 'group' && (typeof name !== 'string' || name.length === 0)) {
    return res.status(400).json({ error: 'Champ "name" requis pour un groupe (chaîne non vide).' });
  }
  if (adminIds !== undefined && (!Array.isArray(adminIds) || !adminIds.every((a: unknown) => typeof a === 'string'))) {
    return res.status(400).json({ error: 'Champ "adminIds" invalide : tableau d\'ids utilisateur attendu.' });
  }

  const conversation = await prisma.chatConversation.create({
    data: {
      type,
      participants: allParticipants,
      name: name ?? undefined,
      // Groupe : le créateur est admin par défaut (même comportement que createGroup de Chat.tsx)
      adminIds: type === 'group' ? (adminIds ?? [userId]) : [],
      pinnedBy: [],
      unreadCounts: {}
    }
  });

  // Les sockets déjà connectées des participants rejoignent la room de la
  // nouvelle conversation et en sont notifiées.
  await joinConversationRooms(conversation.id, allParticipants);
  notifyConversationCreated(conversation);

  res.json(conversation);
});

export default router;
