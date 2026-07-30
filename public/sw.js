/* =====================================================================
 * SERVICE WORKER GEARBOX — NOTIFICATIONS PUSH UNIQUEMENT
 *
 * ⚠️ CE FICHIER N'INTERCEPTE VOLONTAIREMENT PAS `fetch`. NE PAS EN AJOUTER.
 *
 * C'est la décision structurante de ce fichier. Un service worker qui met les
 * requêtes en cache fige les utilisateurs sur une ancienne version de l'app, et
 * on ne peut alors plus les corriger à distance : ils gardent le vieux code
 * jusqu'à ce qu'ils vident eux-mêmes leur cache. Sans gestionnaire `fetch`,
 * toutes les requêtes partent au réseau comme si ce fichier n'existait pas, et
 * les en-têtes Cache-Control de nginx (index.html en no-cache, /assets/ en
 * immutable avec noms hachés) continuent de piloter seuls la fraîcheur.
 *
 * Rappel : un service worker n'est PAS requis pour qu'une PWA soit installable.
 * Celui-ci n'existe que parce que l'API Push l'exige — c'est le seul endroit où
 * un message poussé par le serveur peut être reçu quand l'app est fermée.
 * ===================================================================== */

// Prend le contrôle sans attendre la fermeture des onglets existants : sinon un
// utilisateur qui vient d'accorder la permission ne recevrait rien jusqu'à ce
// qu'il ferme tous ses onglets Gearbox.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Payload illisible : on notifie quand même. `userVisibleOnly: true` nous
    // engage à afficher quelque chose, faute de quoi le navigateur peut finir
    // par révoquer l'abonnement.
    data = {};
  }

  const titre = data.title || 'GEARBOX';
  const options = {
    body: data.body || 'Nouveau message',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Regroupe les messages d'une même conversation au lieu d'empiler N
    // notifications pour une seule discussion.
    tag: data.tag || 'gearbox',
    renotify: true,
    data: {
      section: data.section || 'chat',
      conversationId: data.conversationId || null
    }
  };

  event.waitUntil(self.registration.showNotification(titre, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const cible = event.notification.data || {};

  event.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      // Réutiliser une fenêtre déjà ouverte plutôt qu'en ouvrir une seconde :
      // sinon un clic sur la notification duplique l'application.
      for (const fenetre of fenetres) {
        if (new URL(fenetre.url).origin === self.location.origin) {
          await fenetre.focus();
          // L'app écoute ce message pour basculer sur la bonne rubrique.
          fenetre.postMessage({ type: 'gearbox-notification-click', ...cible });
          return;
        }
      }

      await self.clients.openWindow('/');
    })()
  );
});
