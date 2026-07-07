import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../auth/secret';

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
