import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Rooms : une par conversation (diffusion ciblée aux participants, jamais de
// broadcast global) + une par utilisateur (notification de nouvelle conversation
// et abonnement à sa room par les sockets déjà connectées).
const convRoom = (id: string) => `conv:${id}`;
const userRoom = (id: string) => `user:${id}`;

type Ack = ((response: any) => void) | undefined;
const reply = (ack: Ack, data: any) => { if (typeof ack === 'function') ack(data); };

// À la connexion (handshake authentifié déjà passé) : rejoint sa room
// personnelle + les rooms de toutes ses conversations.
export const joinUserRooms = async (socket: Socket) => {
  const userId: string = socket.data.user.id;
  socket.join(userRoom(userId));
  const conversations = await prisma.chatConversation.findMany({
    where: { participants: { has: userId } },
    select: { id: true }
  });
  conversations.forEach(c => socket.join(convRoom(c.id)));
};

// Appelé par la route REST de création : les sockets déjà connectées des
// participants rejoignent la room de la nouvelle conversation.
export const joinConversationRooms = async (io: Server, conversationId: string, participantIds: string[]) => {
  for (const uid of participantIds) {
    io.in(userRoom(uid)).socketsJoin(convRoom(conversationId));
  }
};

export const notifyConversationCreated = (io: Server, conversation: { participants: string[] }) => {
  for (const uid of conversation.participants) {
    io.to(userRoom(uid)).emit('chat:conversation:created', conversation);
  }
};

// Incrémente unreadCounts pour tous les participants sauf l'émetteur
// (même logique que sendMessage de Chat.tsx).
const bumpUnread = (unreadCounts: any, participants: string[], senderId: string) => {
  const counts: Record<string, number> = { ...(unreadCounts ?? {}) };
  for (const uid of participants) {
    if (uid !== senderId) counts[uid] = (counts[uid] ?? 0) + 1;
  }
  return counts;
};

export const registerChatHandlers = (io: Server, socket: Socket) => {
  const userId: string = socket.data.user.id;

  // Envoi d'un message : persiste PUIS diffuse à la room de la conversation.
  socket.on('chat:message:send', async (payload: any, ack: Ack) => {
    try {
      const { conversationId, content, type, replyToId } = payload ?? {};
      if (typeof conversationId !== 'string' || conversationId.length === 0) {
        return reply(ack, { error: 'Champ "conversationId" requis.' });
      }
      if (typeof content !== 'string' || content.length === 0) {
        return reply(ack, { error: 'Champ "content" requis (chaîne non vide).' });
      }
      const msgType = type === 'image' ? 'image' : 'text'; // stockage brut, aucun traitement d'upload ici
      if (replyToId !== undefined && replyToId !== null && typeof replyToId !== 'string') {
        return reply(ack, { error: 'Champ "replyToId" invalide.' });
      }

      const conversation = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
      if (!conversation) return reply(ack, { error: 'Conversation introuvable.' });
      if (!conversation.participants.includes(userId)) {
        return reply(ack, { error: "Vous n'êtes pas participant de cette conversation." });
      }

      // Identité lue en base (on ne fait pas confiance au client pour nom/couleur).
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const now = new Date();

      const message = await prisma.chatMessage.create({
        data: {
          conversationId,
          senderId: userId,
          senderName: user?.name ?? 'Utilisateur',
          senderColor: user?.avatarColor ?? '#64748b',
          content,
          type: msgType,
          timestamp: now,
          edited: false,
          deleted: false,
          reactions: {},
          replyToId: replyToId ?? undefined
        }
      });

      // lastMessage tronqué à 60 / '📷 Image' : même logique que Chat.tsx.
      const updatedConv = await prisma.chatConversation.update({
        where: { id: conversationId },
        data: {
          lastMessage: msgType === 'image' ? '📷 Image' : content.slice(0, 60),
          lastMessageAt: now,
          unreadCounts: bumpUnread(conversation.unreadCounts, conversation.participants, userId)
        }
      });

      io.to(convRoom(conversationId)).emit('chat:message:new', message);
      io.to(convRoom(conversationId)).emit('chat:conversation:updated', updatedConv);
      reply(ack, message);
    } catch (e) {
      reply(ack, { error: "Échec de l'envoi du message." });
    }
  });

  // Édition : auteur uniquement (menu gaté par isMe dans Chat.tsx).
  socket.on('chat:message:edit', async (payload: any, ack: Ack) => {
    try {
      const { messageId, content } = payload ?? {};
      if (typeof messageId !== 'string' || typeof content !== 'string' || content.length === 0) {
        return reply(ack, { error: 'Champs "messageId" et "content" requis.' });
      }
      const existing = await prisma.chatMessage.findUnique({ where: { id: messageId } });
      if (!existing) return reply(ack, { error: 'Message introuvable.' });
      if (existing.senderId !== userId) return reply(ack, { error: 'Seul l\'auteur peut modifier son message.' });
      if (existing.deleted) return reply(ack, { error: 'Message supprimé, modification impossible.' });

      const message = await prisma.chatMessage.update({
        where: { id: messageId },
        data: { content, edited: true, editedAt: new Date() }
      });
      io.to(convRoom(message.conversationId)).emit('chat:message:updated', message);
      reply(ack, message);
    } catch (e) {
      reply(ack, { error: "Échec de la modification." });
    }
  });

  // Suppression : soft delete (deleted=true, content vidé — même forme que Chat.tsx), auteur uniquement.
  socket.on('chat:message:delete', async (payload: any, ack: Ack) => {
    try {
      const { messageId } = payload ?? {};
      if (typeof messageId !== 'string') return reply(ack, { error: 'Champ "messageId" requis.' });
      const existing = await prisma.chatMessage.findUnique({ where: { id: messageId } });
      if (!existing) return reply(ack, { error: 'Message introuvable.' });
      if (existing.senderId !== userId) return reply(ack, { error: 'Seul l\'auteur peut supprimer son message.' });

      const message = await prisma.chatMessage.update({
        where: { id: messageId },
        data: { deleted: true, content: '' }
      });
      io.to(convRoom(message.conversationId)).emit('chat:message:updated', message);
      reply(ack, message);
    } catch (e) {
      reply(ack, { error: 'Échec de la suppression.' });
    }
  });

  // Réaction : toggle de l'userId dans reactions[emoji] (même sémantique que
  // toggleReaction de Chat.tsx, clé conservée même vide) — tout participant.
  socket.on('chat:message:react', async (payload: any, ack: Ack) => {
    try {
      const { messageId, emoji } = payload ?? {};
      if (typeof messageId !== 'string' || typeof emoji !== 'string' || emoji.length === 0) {
        return reply(ack, { error: 'Champs "messageId" et "emoji" requis.' });
      }
      const existing = await prisma.chatMessage.findUnique({ where: { id: messageId } });
      if (!existing) return reply(ack, { error: 'Message introuvable.' });

      const conversation = await prisma.chatConversation.findUnique({ where: { id: existing.conversationId } });
      if (!conversation || !conversation.participants.includes(userId)) {
        return reply(ack, { error: "Vous n'êtes pas participant de cette conversation." });
      }

      const reactions: Record<string, string[]> = { ...((existing.reactions as any) ?? {}) };
      const current = reactions[emoji] ?? [];
      reactions[emoji] = current.includes(userId)
        ? current.filter(id => id !== userId)
        : [...current, userId];

      const message = await prisma.chatMessage.update({
        where: { id: messageId },
        data: { reactions }
      });
      io.to(convRoom(message.conversationId)).emit('chat:message:updated', message);
      reply(ack, message);
    } catch (e) {
      reply(ack, { error: 'Échec de la réaction.' });
    }
  });

  // Ouverture d'une conversation : remise à zéro du compteur non-lu de
  // l'utilisateur (équivalent du markRead de Chat.tsx à la sélection).
  socket.on('chat:conversation:read', async (payload: any, ack: Ack) => {
    try {
      const { conversationId } = payload ?? {};
      if (typeof conversationId !== 'string') return reply(ack, { error: 'Champ "conversationId" requis.' });
      const conversation = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
      if (!conversation) return reply(ack, { error: 'Conversation introuvable.' });
      if (!conversation.participants.includes(userId)) {
        return reply(ack, { error: "Vous n'êtes pas participant de cette conversation." });
      }

      const counts: Record<string, number> = { ...((conversation.unreadCounts as any) ?? {}) };
      counts[userId] = 0;
      const updatedConv = await prisma.chatConversation.update({
        where: { id: conversationId },
        data: { unreadCounts: counts }
      });
      io.to(convRoom(conversationId)).emit('chat:conversation:updated', updatedConv);
      reply(ack, updatedConv);
    } catch (e) {
      reply(ack, { error: 'Échec de la mise à jour de lecture.' });
    }
  });
};
