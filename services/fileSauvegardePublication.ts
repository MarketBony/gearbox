import { SocialPost } from '../types';
import { db } from './dataService';
import { creerFileSauvegarde } from './fileSauvegarde';

/**
 * File de sauvegarde des PUBLICATIONS Digital — un seul `PUT /api/social/:id` en vol par
 * publication.
 *
 * ⚠️ POURQUOI ELLE EST NÉCESSAIRE ICI AUSSI. Avant le correctif 49, chaque frappe dans le
 * wording (ou le titre, ou le lien) envoyait la publication ENTIÈRE. Deux envois
 * rapprochés partis d'instantanés différents se réécrasaient donc champ par champ, et
 * chacun déclenchait en plus un `emitEvent('social:updated')` qui faisait recharger toute
 * la liste chez tous les collègues. La saisie différée supprime la rafale ; cette file
 * garantit qu'il ne reste jamais deux envois concurrents sur la même publication.
 *
 * ⚠️ Invariants (coalescence, reprises) : voir `services/fileSauvegarde.ts`. Celui qui
 * engage cet appelant : la charge doit être un INSTANTANÉ COMPLET de la publication, relu
 * depuis le miroir `postsRef` de l'écran Digital — jamais l'objet capturé dans la closure
 * d'un champ, qui peut être périmé au moment du flush.
 */
export const fileSauvegardePublication = creerFileSauvegarde<SocialPost>(
  'publication',
  (post) => db.updateSocialPost(post)
);
