import { io, type Socket } from 'socket.io-client';
import { db, getToken } from './dataService';
import { chatStore } from './chatStore';

// =====================================================================
// COUCHE SOCKET.IO (étape 7 — branchement Chat)
// Singleton dans le style de `db`. Connexion app-wide (AuthContext) avec le
// JWT au handshake, reconnexion native laissée activée. Maintient le store
// chat partagé à jour via les événements de conversation.
// =====================================================================

let socket: Socket | null = null;

// Recharge la liste des conversations dans le store. Appelé au connect ET à
// chaque reconnexion (rattrape les événements manqués pendant une coupure).
const refreshConversations = async () => {
  try {
    const convs = await db.getConversations();
    chatStore.setConversations(convs);
  } catch {
    // best-effort : le store conserve son état si l'API est momentanément injoignable.
  }
};

export const connectSocket = (): Socket | null => {
  if (socket) return socket;            // idempotent
  if (!getToken()) return null;         // pas de connexion sans session

  socket = io({
    // Même origine (Vite proxifie /socket.io -> :3001). JWT au handshake ;
    // `auth` en fonction pour relire un token frais à chaque (re)connexion.
    auth: (cb: (data: { token: string | null }) => void) => cb({ token: getToken() })
    // reconnexion automatique : défaut socket.io-client, volontairement conservée.
  });

  // 'connect' se déclenche au 1er établissement ET après chaque reconnexion.
  socket.on('connect', () => { refreshConversations(); });

  // Reconnexion après coupure réseau : recharge aussi l'historique de la conv
  // ouverte côté Chat.tsx (qui écoute cet event).
  socket.io.on('reconnect', () => {
    window.dispatchEvent(new CustomEvent('gearbox-chat-reconnected'));
  });

  // Listeners GLOBAUX de conversation : tiennent le store à jour pour toute
  // l'app (badge Sidebar temps réel même hors page Chat).
  socket.on('chat:conversation:updated', (conv: any) => chatStore.upsertConversation(conv));
  socket.on('chat:conversation:created', (conv: any) => chatStore.upsertConversation(conv));

  return socket;
};

// Fermeture propre au logout : pas de connexion fantôme qui traîne.
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  chatStore.clear();
};

export const getSocket = (): Socket | null => socket;

// Émet un événement avec ack et résout la réponse ; rejette si l'ack renvoie
// { error } (le backend renvoie ses erreurs uniquement via l'ack).
export const emitWithAck = <T = any>(event: string, payload: any): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const s = socket;
    if (!s) return reject(new Error('Socket non connecté.'));
    s.emit(event, payload, (response: any) => {
      if (response && response.error) reject(new Error(response.error));
      else resolve(response as T);
    });
  });
};
