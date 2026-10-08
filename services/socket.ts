import { io, type Socket } from 'socket.io-client';
import { db, getToken } from './dataService';
import { chatStore } from './chatStore';
import { presenceStore, type PresenceState } from './presenceStore';
import { setCurrentSocketId } from './socketId';

// =====================================================================
// COUCHE SOCKET.IO (étape 7 — branchement Chat)
// Singleton dans le style de `db`. Connexion app-wide (AuthContext) avec le
// JWT au handshake, reconnexion native laissée activée. Maintient le store
// chat partagé à jour via les événements de conversation.
// =====================================================================

let socket: Socket | null = null;

// Dernière rubrique annoncée au serveur. Conservée hors du socket pour pouvoir
// se réannoncer après une reconnexion, et pour absorber les appels émis avant
// que le socket n'existe (au tout premier rendu).
let mySection: string | null = null;

const announcePresence = (section: string) => {
  socket?.emit('presence:set', { section });
};

/**
 * Déclare la rubrique courante de l'utilisateur (appelé par App.tsx sur l'onglet
 * réellement affiché). Idempotent : ne réémet rien si la rubrique n'a pas changé.
 */
export const setMySection = (section: string) => {
  if (section === mySection) return;
  mySection = section;
  announcePresence(section);
};

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
  let dejaConnecte = false;
  socket.on('connect', () => {
    // Toute RE-connexion (automatique, ou forcée par la boîte d'envoi sur un socket à moitié mort) : les écrans du
    // Chat rechargent la conversation ouverte — les messages des autres arrivés pendant la coupure (08/10/2026).
    if (dejaConnecte) window.dispatchEvent(new CustomEvent('gearbox-chat-reconnected'));
    dejaConnecte = true;
    // L'id change à chaque (re)connexion : on le republie pour que le serveur
    // puisse continuer à exclure cet onglet de ses propres événements.
    setCurrentSocketId(socket?.id ?? null);
    refreshConversations();
    // La présence serveur est en mémoire : après une reconnexion (ou un
    // redémarrage de l'api) notre entrée a disparu, on se réannonce.
    if (mySection) announcePresence(mySection);
  });

  // Reconnexion après coupure réseau : recharge aussi l'historique de la conv
  // ouverte côté Chat.tsx (qui écoute cet event).
  // (désormais émis par le `connect` ci-dessus, qui couvre AUSSI les reconnexions forcées)

  // Listeners GLOBAUX de conversation : tiennent le store à jour pour toute
  // l'app (badge Sidebar temps réel même hors page Chat).
  socket.on('chat:conversation:updated', (conv: any) => chatStore.upsertConversation(conv));
  socket.on('chat:conversation:created', (conv: any) => chatStore.upsertConversation(conv));
  socket.on('chat:conversation:removed', (p: { id: string }) => chatStore.removeConversation(p.id));

  // Présence : instantané complet rubrique -> utilisateurs, rediffusé par le
  // serveur à chaque changement (connexion, changement d'onglet, déconnexion).
  socket.on('presence:state', (state: PresenceState) => presenceStore.set(state));

  return socket;
};

// Fermeture propre au logout : pas de connexion fantôme qui traîne.
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  mySection = null; // sinon la prochaine session réannoncerait l'ancienne rubrique
  setCurrentSocketId(null);
  chatStore.clear();
  presenceStore.clear();
};

export const getSocket = (): Socket | null => socket;

// Émet un événement avec ack et résout la réponse ; rejette si l'ack renvoie
// { error } (le backend renvoie ses erreurs uniquement via l'ack).
// ⚠️ Délai de 15 s (08/10/2026) : sans lui, une émission partie dans un socket à moitié mort attendait
// INDÉFINIMENT — ni réponse, ni erreur. Les MESSAGES ne passent plus par ici : services/chatOutbox.ts.
export const emitWithAck = <T = any>(event: string, payload: any): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const s = socket;
    if (!s) return reject(new Error('Socket non connecté.'));
    if (!s.connected) return reject(new Error('Connexion au serveur perdue, réessaie dans un instant.'));
    s.timeout(15_000).emit(event, payload, (err: Error | null, response: any) => {
      if (err) reject(new Error('Le serveur ne répond pas, réessaie dans un instant.'));
      else if (response && response.error) reject(new Error(response.error));
      else resolve(response as T);
    });
  });
};
