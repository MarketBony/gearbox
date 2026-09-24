/**
 * Validation des valeurs de personnalisation du Chat — SEULE PORTE.
 *
 * ⚠️ Extrait de `routes/auth.ts` le 11/09/2026, quand la personnalisation est devenue
 * PAR CONVERSATION : deux routes écrivent désormais ces valeurs (`PUT /api/auth/me` pour
 * le défaut global, `PUT /api/chat/conversations/:id/customization` pour une discussion).
 * Deux copies de ces expressions régulières auraient divergé — c'est exactement ce que le
 * dépôt reproche aux `where` de site recopiés et aux listes de boutons dupliquées.
 *
 * ℹ️ Depuis le 24/09/2026, la route par discussion est remplacée par le handler socket
 * `chat:conversation:theme` (thème PARTAGÉ, `realtime/chat.ts`), qui passe ici aussi.
 */

/**
 * Chemin d'un fond IMPORTÉ, produit par `POST /api/uploads/chatbg`.
 *
 * ⚠️ On ne fait confiance ni au client ni au type MIME qu'il déclare : on reconnaît un
 * chemin que NOUS avons écrit. Le nom est toujours un `randomUUID()` et l'extension vient
 * d'`EXT_BY_MIME` pour le type `chatbg`.
 *
 * ⚠️ NE PAS élargir à `/^\/uploads\//` : `chat/` et `project/` n'ont AUCUN filtre de
 * format, y pointer rouvrirait ce trou par la bande.
 */
export const CHATBG_UPLOAD_PATH =
  /^\/uploads\/chatbg\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

/** Fond du catalogue : `proc:<id>`. La liste des ids vit côté frontend (voir ci-dessous). */
export const FOND_PROCEDURAL = /^proc:[a-z0-9-]{1,40}$/;

/**
 * Couleur de bulle : un IDENTIFIANT, jamais une couleur CSS.
 *
 * ⚠️ La valeur est injectée dans un attribut `style` côté client. Accepter `#f00` ou
 * `linear-gradient(...)` laisserait un compte écrire une déclaration de style dans la
 * page de l'application.
 */
export const BULLE_ID = /^[a-z0-9-]{1,30}$/;

/**
 * Normalise une valeur reçue, ou rend `false` si elle est refusée.
 *
 * Convention partagée par les deux routes : `undefined` = champ absent, on ne touche à
 * rien ; chaîne vide = retour au défaut (on écrit `null`).
 *
 * ⚠️ Le serveur valide la FORME, pas l'appartenance au catalogue : celui-ci vit dans
 * `lib/personnalisationChat.ts`, que le backend ne peut pas importer (compilé dans le
 * seul bundle web, même raison que `PLAQUES_STRUCTURE`). Un id inconnu est inoffensif —
 * le client retombe sur le fond ou le dégradé par défaut.
 */
export const normaliserFond = (valeur: unknown): string | null | false => {
  const v = typeof valeur === 'string' ? valeur.trim() : '';
  if (!v) return null;
  return (FOND_PROCEDURAL.test(v) || CHATBG_UPLOAD_PATH.test(v)) ? v : false;
};

export const normaliserBulle = (valeur: unknown): string | null | false => {
  const v = typeof valeur === 'string' ? valeur.trim() : '';
  if (!v) return null;
  return BULLE_ID.test(v) ? v : false;
};
