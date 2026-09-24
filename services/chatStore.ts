import { ChatConversation } from '../types';

// =====================================================================
// STORE CHAT PARTAGÉ (étape 7 — branchement Chat)
// Petit pub/sub sans dépendance (le repo n'a pas de lib d'état). Source
// UNIQUE des conversations, alimentée par le socket (services/socket.ts) et
// consommée à la fois par pages/Chat.tsx (liste) et components/Sidebar.tsx
// (badge de non-lus temps réel, même hors de la page Chat).
// =====================================================================

type Listener = () => void;

let conversations: ChatConversation[] = [];
const listeners = new Set<Listener>();

const notify = () => {
  listeners.forEach(l => l());
  // Réutilise le bus d'événements existant : la Sidebar écoute déjà cet event.
  window.dispatchEvent(new CustomEvent('gearbox-chat-unread-updated'));
};

export const chatStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getConversations(): ChatConversation[] {
    return conversations;
  },
  setConversations(convs: ChatConversation[]) {
    conversations = convs;
    notify();
  },
  // Insère ou remplace une conversation par id (nouvelle référence de tableau
  // à chaque changement pour un rendu React fiable).
  upsertConversation(conv: ChatConversation) {
    const idx = conversations.findIndex(c => c.id === conv.id);
    conversations = idx === -1
      ? [conv, ...conversations]
      : conversations.map(c => (c.id === conv.id ? conv : c));
    notify();
  },
  // Retrait d'un membre (24/09/2026) : la conversation disparaît de sa liste sans
  // rechargement — le serveur l'a déjà sorti de la room.
  removeConversation(id: string) {
    if (!conversations.some(c => c.id === id)) return;
    conversations = conversations.filter(c => c.id !== id);
    notify();
  },
  getUnreadTotal(userId: string): number {
    return conversations.reduce((sum, c) => sum + (c.unreadCounts?.[userId] ?? 0), 0);
  },
  clear() {
    conversations = [];
    notify();
  }
};
