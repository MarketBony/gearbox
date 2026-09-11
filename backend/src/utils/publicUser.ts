// Projection publique d'un utilisateur : SEULE forme d'un `User` qui sort du
// backend, que ce soit en réponse HTTP ou en événement Socket.IO.
//
// ⚠️ RÈGLE À NE JAMAIS ENFREINDRE : ne jamais renvoyer ni émettre l'objet Prisma
// brut — il contient `passwordHash`, et `emitEvent` est un broadcast global
// (`io.emit`), donc le hash serait diffusé à tous les clients connectés.
//
// Extrait de `routes/users.ts` le 04/08/2026 pour être partagé avec
// `routes/auth.ts` : `PUT /me` doit lui aussi émettre `users:updated` (sinon un
// anniversaire qu'on saisit soi-même n'apparaît chez les autres qu'après un F5).
// Un helper unique vaut mieux que deux projections à garder synchronisées.
export const publicUser = (u: any) => ({
  id: u.id,
  name: u.name,
  loginId: u.loginId,
  role: u.role,
  avatarColor: u.avatarColor,
  avatarUrl: u.avatarUrl,
  birthdate: u.birthdate,
  // Préférence d'affichage personnelle (fond du Chat). Sans conséquence pour les autres
  // comptes, mais ils la reçoivent comme le reste : `publicUser` est une projection, pas
  // un filtre par destinataire.
  chatBackground: u.chatBackground,
  chatBubble: u.chatBubble,
  // Périmètre du chef de site. Vide pour tous les autres rôles. Non sensible en
  // soi (ce sont des noms de concession), et nécessaire au frontend pour borner
  // ses sélecteurs de périmètre.
  sites: u.sites ?? []
});
