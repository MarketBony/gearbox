import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../auth/secret';
import {
  joinUserRooms,
  registerChatHandlers,
  ensureGeneralConversation,
  joinConversationRooms as chatJoinConversationRooms,
  notifyConversationCreated as chatNotifyConversationCreated
} from './chat';
import { registerPresenceHandlers, handleUserChanged } from './presence';

let io: Server;

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

    // Chat : rejoint sa room personnelle + celles de ses conversations,
    // puis enregistre les handlers temps réel (voir ./chat).
    joinUserRooms(socket).catch(err => console.error('joinUserRooms failed', err));
    registerChatHandlers(io, socket);

    // Présence : le client annonce sa rubrique via 'presence:set' (au connect
    // puis à chaque changement d'onglet) et reçoit 'presence:state'.
    registerPresenceHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log('Client disconnected', socket.id);
    });
  });
};

export const emitEvent = (event: string, data: any) => {
  if (io) {
    io.emit(event, data);
  }
};

// Helpers chat exposés aux routes REST (création de conversation) —
// no-op si le serveur socket n'est pas initialisé.
export const joinConversationRooms = async (conversationId: string, participantIds: string[]) => {
  if (io) await chatJoinConversationRooms(io, conversationId, participantIds);
};

export const notifyConversationCreated = (conversation: { participants: string[] }) => {
  if (io) chatNotifyConversationCreated(io, conversation);
};

// Appelé par routes/users.ts après une mutation de compte : recharge l'identité
// d'affichage utilisée par la présence (nom/couleur/photo), ou purge les
// présences du compte s'il a été supprimé. Best-effort : n'interrompt jamais la
// réponse HTTP de la route appelante.
export const notifyUserChanged = (userId: string) => {
  handleUserChanged(io, userId).catch(err =>
    console.error('notifyUserChanged failed', err)
  );
};
