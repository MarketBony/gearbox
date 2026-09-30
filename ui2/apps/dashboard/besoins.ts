import type { Project } from '../../../types';

// =====================================================================
// BOUCHONS de la rubrique Dashboard — à SUPPRIMER à l'intégration (voir BESOINS.md).
// Aucun montant ici : uniquement de quoi rendre cliquable une ligne que le moteur ne relie pas
// encore à son projet.
// =====================================================================

/**
 * BESOIN: `computeDashboardStats().ecartsTop` ne porte pas l'`id` du projet (seulement `nom`),
 * alors que la maquette rend chaque écart cliquable (ouvre la fiche). En attendant que le service
 * ajoute `id: p.id` dans `ecartsProjets.push(...)` (services/dashboardStats.ts, bloc « Écart prévu /
 * réalisé »), on retrouve le projet par son nom, et SEULEMENT s'il est unique parmi les projets
 * éligibles (non brouillon, prévisionnel saisi) — sinon la ligne n'est pas cliquable, plutôt que
 * d'ouvrir le mauvais projet. À remplacer par `g.id` puis supprimer ce fichier.
 */
export function projectIdOfGap(projects: Project[], nom: string): string | null {
  let found: string | null = null;
  for (const p of projects) {
    if (p.name !== nom || p.status === 'Draft' || !((p.budgetPlanned || 0) > 0)) continue;
    if (found) return null;                  // homonymes : ambigu
    found = p.id;
  }
  return found;
}
