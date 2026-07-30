// =====================================================================
// ID DU SOCKET COURANT — module volontairement minuscule et isolé
//
// `apiFetch` (services/dataService.ts) envoie cet id dans l'en-tête
// `x-socket-id` pour que le serveur n'émette PAS l'événement de mutation vers
// son auteur (voir backend/src/realtime/index.ts). Sans ça, l'auteur refetche
// sa propre écriture et écrase son état local en cours de saisie.
//
// Pourquoi un fichier à part plutôt qu'un export de services/socket.ts :
// socket.ts importe déjà `db` depuis dataService. Si dataService importait en
// retour depuis socket.ts, on créerait un cycle d'imports. Ce module ne dépend
// de rien, les deux côtés peuvent l'utiliser sans risque.
// =====================================================================

let currentSocketId: string | null = null;

export const setCurrentSocketId = (id: string | null) => {
  currentSocketId = id;
};

export const getCurrentSocketId = (): string | null => currentSocketId;
