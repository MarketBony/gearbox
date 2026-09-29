# Besoins partagés — rubrique Campagnes (lot 3)

## 1. Messages d'échec propres à la rubrique (store/workspace.ts `saveError`)

- `mutateTask` affiche les messages des Projets (« Droits insuffisants pour modifier ce projet. », « Conflit de
  sauvegarde… »). Campaigns.tsx disait « Droits insuffisants pour modifier cette campagne. » (403) et « Données périmées :
  rechargement. » (404 / 409). Écart de libellé seulement ; si on y tient : un paramètre facultatif
  `mutateTask(projectId, taskId, patch, { entity: 'campagne' })`.

## 2. Droits d'écriture : Digital Manager

- `mutateTask` laisse écrire `canEditProjects(role)` (Digital Manager compris, comme le serveur), mais l'écran reprend la
  liste de Campaigns.tsx (Master, Administrator, Director, Coordinator) : les champs sont grisés pour un Digital Manager.
  Incohérence d'origine (inventaire § 11.3) à arbitrer par Théo ; aucune constante partagée n'existe (`CAMPAIGNS_EDIT_ROLES`
  à créer dans `constants.ts` si on la garde).
