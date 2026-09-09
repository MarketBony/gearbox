import { Project } from '../types';
import { db } from './dataService';
import { creerFileSauvegarde } from './fileSauvegarde';

/**
 * File de sauvegarde des PROJETS — un seul `PUT /api/projects/:id` en vol par projet.
 *
 * ⚠️ La mécanique (coalescence, reprises, fenêtre de course) vit dans
 * `services/fileSauvegarde.ts` depuis le correctif 49, parce que le Digital a exactement
 * le même besoin et qu'une deuxième copie aurait divergé. **Les invariants sont
 * documentés là-bas — les lire avant de toucher à quoi que ce soit ici.**
 *
 * ⚠️ Rappel de l'invariant qui engage CET appelant : la charge poussée doit être un
 * INSTANTANÉ COMPLET du projet, construit depuis le miroir `projetRef` de l'écran. Un
 * delta partiel ferait perdre des modifications en silence à la coalescence.
 *
 * L'interface publique (`pousser`, `aDesEcrituresEnCours`) n'a pas changé : `Projects.tsx`
 * et `Campaigns.tsx` n'ont pas été touchés par la généralisation.
 */
export const fileSauvegardeProjet = creerFileSauvegarde<Project>(
  'projet',
  (projet) => db.updateProject(projet)
);
