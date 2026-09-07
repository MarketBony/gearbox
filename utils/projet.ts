import { Project } from '../types';

/**
 * Agrégats DÉRIVÉS d'un projet — avancement et budget réel.
 *
 * ⚠️ SOURCE UNIQUE de cette formule. Elle vivait en DEUX copies : `handleUpdateProject`
 * dans `pages/Projects.tsx` et `recalcProject` dans `pages/TodoList.tsx`. Même doctrine
 * que `constants.ts` pour le routage budgétaire, `TASK_FIELDS` pour l'écriture d'une
 * tâche ou `siteScope.ts` pour le cloisonnement : une règle qui décide de chiffres
 * affichés dans Budget et Dashboard ne se réimplémente pas par écran. C'est exactement
 * cette classe de duplication qui a fait diverger Budget et Dashboard quatre fois.
 *
 * ⚠️ NE MUTE PAS son argument — l'ancienne version de `TodoList` écrivait dans l'objet
 * reçu (`project.progress = …`), donc modifiait au passage l'élément du tableau d'état
 * React dont il provenait. Un état muté en place ne déclenche pas de rendu et rend les
 * comparaisons de référence inutilisables : ici la file de sauvegarde compare des
 * instantanés, elle a besoin d'objets neufs.
 *
 * ⚠️ Ces deux champs sont RECALCULÉS À CHAQUE SAUVEGARDE, quel que soit le champ
 * modifié. Ce n'est pas un bug, c'est voulu — mais la conséquence, documentée dans
 * `ETAT-PROJET.md`, est que l'avancement importé de l'Excel est écrasé au premier
 * passage de l'équipe sur chaque projet. Les montants, eux, ne bougent pas (vérifié le
 * 04/08/2026 : les 97 projets ont déjà `budgetActual` = somme des coûts de leurs tâches).
 *
 * Pondération des statuts, inchangée depuis l'origine : `Done` et `Programmed` comptent
 * pour 1, `InProgress` pour 0,5, le reste pour 0.
 */
export const recalculerProjet = (projet: Project): Project => {
  const taches = projet.tasks ?? [];

  let poids = 0;
  for (const t of taches) {
    if (t.status === 'Done' || t.status === 'Programmed') poids += 1;
    else if (t.status === 'InProgress') poids += 0.5;
  }

  return {
    ...projet,
    progress: taches.length > 0 ? Math.round((poids / taches.length) * 100) : 0,
    budgetActual: taches.reduce((somme, t) => somme + (t.cost || 0), 0),
  };
};
