import { useEffect, useState } from 'react';
import { db } from './dataService';
import { chatStore } from './chatStore';
import { useRealtimeSync, RT_EVENTS } from './realtime';
import { setAppBadge } from './pushNotifications';
import { canSeeGames } from '../constants';

// Pastilles de navigation (Chat non lus, défis de Jeux reçus) — SOURCE UNIQUE partagée
// par la Sidebar (ancienne interface) et le Dock de l'interface v2. Extraite de
// Sidebar.tsx le 29/09/2026 : la Sidebar n'est pas montée dans la coque v2, et recopier
// ce calcul aurait fait diverger les deux compteurs (et le badge de l'icône PWA).
// ⚠️ À monter UNE seule fois à la fois (Sidebar OU coque v2), comme avant.
export function useNavBadges(user: { id: string; role: string } | null, gamesEnabled: boolean) {
  const [chatUnread, setChatUnread] = useState(0);
  const [gamesChallenges, setGamesChallenges] = useState(0);

  const loadChatUnread = () => {
    if (!user) return;
    // Source unique : le store chat alimenté par le socket (temps réel).
    const total = chatStore.getUnreadTotal(user.id);
    setChatUnread(total);
    // PWA : même compteur sur l'icône de l'application installée.
    setAppBadge(total);
  };

  // Défis reçus : lus côté serveur (jamais localStorage — cf. 05/08/2026), rafraîchis
  // par l'événement socket, sans polling.
  const loadGamesChallenges = () => {
    if (!user || !canSeeGames(user.role, gamesEnabled)) {
      setGamesChallenges(0);
      return;
    }
    db.getGamesLobby()
      .then(d => setGamesChallenges(
        d.challenges.filter(c => c.toUserId === user.id && c.status === 'pending').length
      ))
      .catch(() => { /* réseau : on garde la valeur précédente */ });
  };

  useEffect(() => {
    loadChatUnread();
    const chatHandler = () => loadChatUnread();
    window.addEventListener('gearbox-chat-unread-updated', chatHandler);
    return () => window.removeEventListener('gearbox-chat-unread-updated', chatHandler);
  }, [user?.id]);

  useEffect(() => { loadGamesChallenges(); }, [user?.id, user?.role, gamesEnabled]);
  useRealtimeSync(RT_EVENTS.games, loadGamesChallenges);

  return { chatUnread, gamesChallenges };
}
