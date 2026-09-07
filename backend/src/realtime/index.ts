import { Server, Socket } from 'socket.io';
import { AsyncLocalStorage } from 'async_hooks';
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../auth/secret';
import {
  joinUserRooms,
  registerChatHandlers,
  ensureGeneralConversation,
  joinConversationRooms as chatJoinConversationRooms,
  notifyConversationCreated as chatNotifyConversationCreated
} from './chat';
import { registerPresenceHandlers, handleUserChanged, getUserIdsOnSection } from './presence';
import { registerGameHandlers, emitSessionToPlayers } from './games';
import { hasSocialFeatures } from '../auth/roles';
import { invalidateUserScope } from '../auth/siteScope';
import { sendPushToUsers } from '../utils/pushSender';
import { prisma } from '../db';

let io: Server;
// Sert uniquement à résoudre le nom de l'auteur d'un défi pour la notification.

// Extrait le JWT du handshake : socket.handshake.auth.token (convention socket.io-client)
// avec repli sur le header Authorization: Bearer <token>.
const extractToken = (socket: Socket): string | undefined => {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.length > 0) return authToken;

  const header = socket.handshake.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);

  return undefined;
};

export const setupRealtime = (socketIo: Server) => {
  io = socketIo;

  // Seed idempotent du Chat Général (une seule ligne système, appartenance implicite).
  ensureGeneralConversation().catch(err => console.error('ensureGeneralConversation failed', err));

  // Authentification au handshake : aucune connexion socket acceptée sans JWT valide.
  // Couche transport uniquement — la logique métier (chat, rooms) viendra plus tard,
  // mais l'identification est exigée dès maintenant.
  io.use((socket, next) => {
    const token = extractToken(socket);
    if (!token) {
      return next(new Error('Authentication required: missing token'));
    }

    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
      if (err) {
        return next(new Error('Authentication failed: invalid or expired token'));
      }
      // Identité disponible pour la future logique métier (rooms, chat...).
      socket.data.user = { id: decoded.id, role: decoded.role };
      next();
    });
  });

  io.on('connection', (socket) => {
    console.log('Client connected', socket.id, `(user ${socket.data.user?.id})`);

    // ⚠️ Les rôles sans vie sociale (chef de site) n'ont NI chat NI présence, et la
    // porte est fermée au TRANSPORT et pas seulement dans l'interface : sans ce test,
    // il rejoignait le Chat Général (appartenance implicite) et sa présence était
    // diffusée à tous. Même motif que `registerGameHandlers`, qui ne s'enregistre pas
    // hors des rôles autorisés.
    const social = hasSocialFeatures(socket.data.user?.role);

    // Détermine si ce socket reçoit les payloads complets ou seulement les noms
    // d'événements (voir emitEvent plus bas).
    assignEmitRoom(socket);

    if (social) {
      // Chat : rejoint sa room personnelle + celles de ses conversations,
      // puis enregistre les handlers temps réel (voir ./chat).
      joinUserRooms(socket).catch(err => console.error('joinUserRooms failed', err));
      registerChatHandlers(io, socket);

      // Présence : le client annonce sa rubrique via 'presence:set' (au connect
      // puis à chaque changement d'onglet) et reçoit 'presence:state'.
      registerPresenceHandlers(io, socket);
    }

    // Jeux : placement de flotte, coups et abandon. Les handlers ne sont pas
    // enregistrés du tout pour un rôle sans accès aux Jeux.
    registerGameHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log('Client disconnected', socket.id);
    });
  });
};

// =====================================================================
// EXCLUSION DE L'AUTEUR
//
// Jusqu'au 30/07/2026, emitEvent diffusait à TOUS les clients, auteur inclus.
// Conséquence observée : l'auteur d'une mutation recevait son propre événement,
// son écran refetchait 300 ms plus tard (services/realtime.ts) et écrasait son
// état local — dans pages/Projects.tsx, une puce de marque qu'il venait de
// cliquer se dé-sélectionnait, obligeant à cliquer plusieurs fois.
//
// Le client envoie son `socket.id` dans l'en-tête `x-socket-id` (voir
// services/socketId.ts + apiFetch). On le stocke pour la durée de la requête
// via AsyncLocalStorage : les ~35 appels à emitEvent restent inchangés, et
// aucune route n'a besoin de connaître le socket.
//
// Dégradation sûre : sans en-tête (client hors socket, outil externe, curl),
// on retombe sur une diffusion à tous, le comportement d'avant.
// =====================================================================
const emitterStore = new AsyncLocalStorage<{ socketId?: string }>();

export const withEmitterContext: RequestHandler = (req, _res, next) => {
  const header = req.headers['x-socket-id'];
  const socketId = typeof header === 'string' && header.length > 0 ? header : undefined;
  emitterStore.run({ socketId }, () => next());
};

// ⚠️⚠️ CLOISONNEMENT DU TEMPS RÉEL (05/08/2026)
//
// `emitEvent` diffusait l'objet Prisma BRUT à TOUS les clients (`io.emit`). Avec le
// rôle « chef de site », cela percait le cloisonnement : le projet d'une autre
// concession lui arrivait en clair dans le socket, alors même que la route `GET`
// venait de le filtrer. Le frontend ignore ce payload par convention
// (services/realtime.ts : stratégie d'invalidation, pas de patch de state) — mais il
// transitait sur le fil, et c'est ce qui compte.
//
// Parade : ces rôles reçoivent l'événement **sans sa charge**. Ils rappellent alors
// leur loader, qui passe par la route filtrée. Comportement inchangé pour tous les
// autres rôles.
const scopedRoom = 'scoped-clients';

/** Range un socket dans la room des clients à charge réduite, selon son rôle. */
export const assignEmitRoom = (socket: Socket) => {
  if (!hasSocialFeatures(socket.data.user?.role)) socket.join(scopedRoom);
};

export const emitEvent = (event: string, data: any) => {
  if (!io) return;
  const socketId = emitterStore.getStore()?.socketId;
  const base = socketId && io.sockets.sockets.has(socketId) ? io.except(socketId) : io;
  // Tout le monde sauf les clients cloisonnés : payload complet, comme avant.
  base.except(scopedRoom).emit(event, data);
  // Clients cloisonnés : le nom de l'événement suffit à déclencher leur refetch.
  base.to(scopedRoom).emit(event, null);
};

// Helpers chat exposés aux routes REST (création de conversation) —
// no-op si le serveur socket n'est pas initialisé.
export const joinConversationRooms = async (conversationId: string, participantIds: string[]) => {
  if (io) await chatJoinConversationRooms(io, conversationId, participantIds);
};

export const notifyConversationCreated = (conversation: { participants: string[] }) => {
  if (io) chatNotifyConversationCreated(io, conversation);
};

// ---------------------------------------------------------------------------
// JEUX — helpers exposés aux routes REST
// ---------------------------------------------------------------------------

const NOMS_JEUX: Record<string, string> = {
  morpion: 'Morpion',
  connect4: 'Puissance 4',
  battleship: 'Bataille navale',
};

/**
 * Notifie un défi (créé, refusé, annulé) aux DEUX intéressés, dans leur room
 * personnelle — jamais en broadcast : un défi ne concerne personne d'autre.
 *
 * Un défi créé déclenche en plus une notification push chez le destinataire.
 * C'est le manque signalé par Théo : « impossible de défier un utilisateur, il ne
 * reçoit jamais l'invitation ». On ne pousse PAS si la personne est déjà sur la
 * rubrique Jeux (elle le voit arriver en direct), même logique que le chat.
 */
export const notifyChallenge = (
  challenge: { id: string; fromUserId: string; toUserId: string; game: string; status: string },
  auteurId: string
) => {
  if (!io) return;
  io.to(`user:${challenge.toUserId}`).emit('game:challenge:updated', challenge);
  io.to(`user:${challenge.fromUserId}`).emit('game:challenge:updated', challenge);

  if (challenge.status !== 'pending' || auteurId !== challenge.fromUserId) return;

  // Best-effort : l'échec d'un push ne doit jamais faire échouer la création du
  // défi (et `sendPushToUsers` purge déjà les abonnements morts).
  void (async () => {
    try {
      // `getUserIdsOnSection` renvoie un Set, pas un tableau.
      if (getUserIdsOnSection('games').has(challenge.toUserId)) return;
      const auteur = await prisma.user.findUnique({ where: { id: auteurId }, select: { name: true } });
      await sendPushToUsers([challenge.toUserId], {
        title: `${auteur?.name ?? 'Un collègue'} vous défie !`,
        body: `${NOMS_JEUX[challenge.game] ?? challenge.game} — à vous de relever le gant.`,
        tag: `game-challenge-${challenge.id}`,
        section: 'games',
      });
    } catch (e) {
      console.error('[games] notification push du défi', e);
    }
  })();
};

/** Diffuse une partie aux deux joueurs, chacun avec SA vue redactée. */
export const notifySessionToPlayers = (session: any, event: string) => {
  if (io) emitSessionToPlayers(io, session, event);
};

// Appelé par routes/users.ts après une mutation de compte : recharge l'identité
// d'affichage utilisée par la présence (nom/couleur/photo), ou purge les
// présences du compte s'il a été supprimé. Best-effort : n'interrompt jamais la
// réponse HTTP de la route appelante.
export const notifyUserChanged = (userId: string) => {
  // ⚠️ Invalide AUSSI le périmètre en cache (auth/siteScope.ts). C'est ce qui rend un
  // changement de sites effectif IMMÉDIATEMENT, sans attendre l'expiration du jeton :
  // le périmètre n'est volontairement pas dans le JWT, qui vit 24 h — retirer un site
  // à quelqu'un doit prendre effet tout de suite.
  invalidateUserScope(userId);
  handleUserChanged(io, userId).catch(err =>
    console.error('notifyUserChanged failed', err)
  );
};
