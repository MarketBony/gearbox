import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { sendPushToUsers, resolvePushRecipients } from '../utils/pushSender';
import { getUserIdsOnSection } from './presence';

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
  const role: string | undefined = socket.data.user.role;
  socket.join(userRoom(userId));
  const conversations = await prisma.chatConversation.findMany({
    where: { participants: { has: userId } },
    select: { id: true }
  });
  conversations.forEach(c => socket.join(convRoom(c.id)));
  // Chat Général : appartenance implicite — tout socket authentifié non-External
  // rejoint sa room à la connexion (aucun participants[] à synchroniser).
  if (role !== 'External') socket.join(convRoom('general'));
};

// Seed idempotent du Chat Général : une seule conversation système, créée au
// premier démarrage. participants reste vide — l'accès est géré par type='general'
// dans les handlers socket et les routes REST (appartenance implicite).
export const ensureGeneralConversation = async () => {
  await prisma.chatConversation.upsert({
    where: { id: 'general' },
    create: {
      id: 'general',
      type: 'general',
      name: 'Chat Général',
      participants: [],
      adminIds: [],
      pinnedBy: [],
      unreadCounts: {}
    },
    update: {}
  });
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
  const role: string | undefined = socket.data.user.role;

  // Envoi d'un message : persiste PUIS diffuse à la room de la conversation.
  socket.on('chat:message:send', async (payload: any, ack: Ack) => {
    try {
      const { conversationId, content, type, replyToId, fileName, fileSize } = payload ?? {};
      if (typeof conversationId !== 'string' || conversationId.length === 0) {
        return reply(ack, { error: 'Champ "conversationId" requis.' });
      }
      if (typeof content !== 'string' || content.length === 0) {
        return reply(ack, { error: 'Champ "content" requis (chaîne non vide).' });
      }
      // stockage brut, aucun traitement d'upload ici : le fichier est déjà déposé par
      // POST /api/uploads/chat, `content` n'en porte que l'URL relative.
      const msgType = type === 'image' ? 'image' : type === 'file' ? 'file' : 'text';
      if (replyToId !== undefined && replyToId !== null && typeof replyToId !== 'string') {
        return reply(ack, { error: 'Champ "replyToId" invalide.' });
      }
      // Métadonnées de pièce jointe. Bornées volontairement : `fileName` vient du
      // client et sert à l'AFFICHAGE et au nom de téléchargement — il ne touche jamais
      // au disque (le fichier y porte un uuid), mais un nom de 10 Mo n'a aucune raison
      // d'entrer en base. 260 caractères = la limite de chemin usuelle sous Windows.
      const nomFichier = typeof fileName === 'string' && fileName.length > 0
        ? fileName.slice(0, 260)
        : null;
      const tailleFichier = Number.isInteger(fileSize) && fileSize > 0 && fileSize <= 100 * 1024 * 1024
        ? fileSize
        : null;

      const conversation = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
      if (!conversation) return reply(ack, { error: 'Conversation introuvable.' });
      const isGeneral = conversation.type === 'general';
      // Général : appartenance implicite (tout non-External) ; sinon check participant.
      if (isGeneral ? role === 'External' : !conversation.participants.includes(userId)) {
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
          fileName: msgType === 'file' ? nomFichier : null,
          fileSize: msgType === 'file' || msgType === 'image' ? tailleFichier : null,
          timestamp: now,
          edited: false,
          deleted: false,
          reactions: {},
          replyToId: replyToId ?? undefined
        }
      });

      // Cibles unread : participants normaux, ou tous les utilisateurs non-External
      // (sauf l'émetteur) pour le Général — qui n'a pas de liste de participants.
      let unreadTargets = conversation.participants;
      if (isGeneral) {
        const allUsers = await prisma.user.findMany({ select: { id: true, role: true } });
        unreadTargets = allUsers.filter(u => u.role !== 'External').map(u => u.id);
      }

      // lastMessage tronqué à 60 / '📷 Image' / '📎 <nom>' : même logique que Chat.tsx.
      // ℹ️ Sert AUSSI de corps à la notification push (voir plus bas, `body:`) : il n'y
      // a donc rien de plus à faire pour que les notifications de pièce jointe soient
      // correctes.
      const apercu = msgType === 'image'
        ? '📷 Image'
        : msgType === 'file'
          ? `📎 ${nomFichier ?? 'Pièce jointe'}`.slice(0, 60)
          : content.slice(0, 60);
      const updatedConv = await prisma.chatConversation.update({
        where: { id: conversationId },
        data: {
          lastMessage: apercu,
          lastMessageAt: now,
          unreadCounts: bumpUnread(conversation.unreadCounts, unreadTargets, userId)
        }
      });

      io.to(convRoom(conversationId)).emit('chat:message:new', message);
      io.to(convRoom(conversationId)).emit('chat:conversation:updated', updatedConv);
      reply(ack, message);

      // --- NOTIFICATIONS PUSH (ajouté le 30/07/2026) ---
      // Après la réponse au client : un service de push lent ou en échec ne doit
      // jamais retarder l'envoi du message lui-même.
      //
      // Destinataires = `unreadTargets` (déjà privé de l'émetteur), moins :
      //   - la sourdine posée sur cette conversation (`mutedBy`) ;
      //   - les personnes actuellement SUR la rubrique Chat, qui n'ont pas
      //     besoin qu'on fasse sonner leur téléphone.
      // L'aperçu réutilise volontairement la troncature de `lastMessage`
      // ci-dessus, pour ne pas entretenir deux règles d'affichage divergentes.
      const aNotifier = resolvePushRecipients({
        unreadTargets,
        senderId: userId,
        mutedBy: conversation.mutedBy,
        onSection: getUserIdsOnSection('chat')
      });
      if (aNotifier.length > 0) {
        const titre = isGeneral
          ? `${user?.name ?? 'Message'} — Chat Général`
          : (user?.name ?? 'Nouveau message');
        void sendPushToUsers(aNotifier, {
          title: titre,
          body: updatedConv.lastMessage ?? 'Nouveau message',
          tag: `chat-${conversationId}`,
          section: 'chat',
          conversationId
        });
      }
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
      if (!conversation) return reply(ack, { error: "Vous n'êtes pas participant de cette conversation." });
      // Général : appartenance implicite (tout non-External) ; sinon check participant.
      if (conversation.type === 'general' ? role === 'External' : !conversation.participants.includes(userId)) {
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
      // Général : appartenance implicite (tout non-External) ; sinon check participant.
      if (conversation.type === 'general' ? role === 'External' : !conversation.participants.includes(userId)) {
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

  // Sourdine d'une conversation, par utilisateur. Calqué sur
  // `chat:conversation:read` : même contrôle d'appartenance, même émission.
  //
  // ⚠️ Contrairement à l'épinglage (`pinnedBy`), qui est un overlay localStorage
  // côté client, la sourdine passe VRAIMENT par le serveur : c'est lui qui
  // décide d'envoyer le push. Effet de bord bienvenu, elle est synchronisée
  // entre tous les appareils de l'utilisateur.
  //
  // Elle coupe le push, PAS le compteur non-lu (comportement Messenger) : la
  // conversation reste visible comme non lue dans l'application.
  socket.on('chat:conversation:mute', async (payload: any, ack: Ack) => {
    try {
      const { conversationId, muted } = payload ?? {};
      if (typeof conversationId !== 'string') return reply(ack, { error: 'Champ "conversationId" requis.' });
      if (typeof muted !== 'boolean') return reply(ack, { error: 'Champ "muted" requis (booléen).' });

      const conversation = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
      if (!conversation) return reply(ack, { error: 'Conversation introuvable.' });
      if (conversation.type === 'general' ? role === 'External' : !conversation.participants.includes(userId)) {
        return reply(ack, { error: "Vous n'êtes pas participant de cette conversation." });
      }

      const dejaEnSourdine = conversation.mutedBy.includes(userId);
      // Idempotent : réémettre le même état ne doit pas dupliquer l'id.
      const mutedBy = muted
        ? (dejaEnSourdine ? conversation.mutedBy : [...conversation.mutedBy, userId])
        : conversation.mutedBy.filter(id => id !== userId);

      const updatedConv = await prisma.chatConversation.update({
        where: { id: conversationId },
        data: { mutedBy }
      });
      io.to(convRoom(conversationId)).emit('chat:conversation:updated', updatedConv);
      reply(ack, updatedConv);
    } catch (e) {
      reply(ack, { error: 'Échec de la mise à jour de la sourdine.' });
    }
  });
};
