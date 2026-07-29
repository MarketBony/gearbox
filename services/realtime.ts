import { useEffect, useRef } from 'react';
import { getSocket, connectSocket } from './socket';

// =====================================================================
// TEMPS RÉEL DES MODULES MÉTIER (hors Chat)
//
// Le backend émet déjà un événement par mutation (`emitEvent` dans
// backend/src/realtime/index.ts) ; jusqu'ici personne ne les écoutait côté
// front, d'où la nécessité d'un F5 pour voir le travail des autres.
//
// Stratégie : INVALIDATION, pas patch de state. À la réception d'un événement
// on rappelle le loader existant de la page (`db.getX()`), et le payload de
// l'événement est volontairement IGNORÉ. Raisons :
//   - le backend émet l'objet Prisma brut (dates ISO complètes) alors que
//     dataService normalise en 'yyyy-MM-dd' via des normaliseurs privés au
//     module — injecter le payload tel quel produirait des dates au mauvais
//     format, donc des bugs d'affichage et de tri silencieux ;
//   - les payloads sont hétérogènes ('expense:deleted' envoie { id }, les
//     autres l'id brut) : les ignorer rend cette incohérence sans objet ;
//   - les volumes sont petits (quelques dizaines de lignes par ressource).
//
// L'auteur d'une modification reçoit aussi son propre événement (io.emit
// diffuse à tous) : il refetch une donnée qu'il vient d'écrire, ce qui est
// inoffensif (les brouillons de formulaire vivent dans un state séparé). Si du
// scintillement apparaissait, on exclurait l'auteur côté serveur.
// =====================================================================

// Noms d'événements émis par le backend, groupés par ressource. SEUL endroit à
// maintenir : les pages composent leurs abonnements à partir d'ici.
export const RT_EVENTS = {
  projects: ['projects:updated', 'projects:deleted'],
  campaigns: ['campaigns:updated', 'campaigns:deleted'],
  budget: ['budget:updated', 'budget:deleted'],
  users: ['users:updated', 'users:deleted'],
  equipment: ['equipment:created', 'equipment:updated', 'equipment:deleted'],
  equipmentBookings: [
    'equipment-booking:created',
    'equipment-booking:updated',
    'equipment-booking:deleted'
  ],
  expenses: ['expense:created', 'expense:updated', 'expense:deleted'],
  fixedExpenses: ['fixed-expense:created', 'fixed-expense:updated', 'fixed-expense:deleted'],
  social: ['social:updated', 'social:deleted'],
  tags: ['tags:updated'],
  activity: ['activity:created'],
  // Émis par le backend mais aucun écran ne lit /contacts aujourd'hui —
  // référencé ici pour le jour où ce sera le cas.
  contacts: ['contacts:updated', 'contacts:deleted']
} as const;

// Fenêtre de regroupement : une seule sauvegarde peut déclencher plusieurs
// événements (ex. projet + tâches). On coalesce pour ne refetcher qu'une fois.
const DEBOUNCE_MS = 300;

/**
 * Rejoue `reload` quand l'un des `events` arrive, et à chaque (re)connexion du
 * socket — ce dernier point rattrape les événements manqués pendant une
 * coupure réseau, que le serveur ne rejoue pas.
 *
 * À appeler en complément du chargement initial de la page, qu'il ne remplace
 * pas. `reload` peut être une fonction non mémoïsée : elle est lue via une ref,
 * donc les listeners ne sont jamais réenregistrés à cause d'elle.
 */
export const useRealtimeSync = (events: readonly string[], reload: () => void) => {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  // Les pages passent souvent un tableau littéral (`[...RT_EVENTS.projects]`),
  // recréé à chaque rendu : on dépend de son contenu, pas de son identité.
  const eventsKey = events.join('|');

  useEffect(() => {
    // Liste vide = abonnement conditionnel désactivé (ex. Settings pour un rôle
    // sans accès à la gestion des utilisateurs). Sans ce garde-fou,
    // ''.split('|') donnerait [''] et on écouterait un événement sans nom.
    if (!eventsKey) return;

    const socket = getSocket() ?? connectSocket(); // idempotent
    if (!socket) return; // pas de session : rien à écouter

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        reloadRef.current();
      }, DEBOUNCE_MS);
    };

    const list = eventsKey.split('|');
    list.forEach(event => socket.on(event, schedule));
    // 'connect' se déclenche au 1er établissement ET après chaque reconnexion.
    // Le montage initial de la page a déjà chargé les données, mais un refetch
    // de plus est préférable à un écran silencieusement périmé.
    socket.on('connect', schedule);

    return () => {
      if (timer) clearTimeout(timer);
      list.forEach(event => socket.off(event, schedule));
      socket.off('connect', schedule);
    };
  }, [eventsKey]);
};
