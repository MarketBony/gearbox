# Dashboard (v2) — besoins partagés à traiter à l'intégration

Tous les montants, compteurs et listes affichés viennent de `computeDashboardStats`
(`services/dashboardStats.ts`), appelé tel quel avec les filtres de la rubrique. Aucun calcul
métier n'a été recopié. Seuls les dérivés d'AFFICHAGE de la page actuelle sont faits dans le
composant, à l'identique de `pages/Dashboard.tsx` : `burnRate`, `remaining`, `ecartRythme`.

## 1. `id` du projet dans `ecartsTop` (Écart prévu / réalisé)

**Quoi.** `ecartsProjets.push({ nom, prevu, realise, ecart })` ne garde pas l'identifiant du
projet. La maquette rend chaque écart cliquable (ouvre la fiche du projet) ; la page actuelle ne le
faisait pas (et utilisait `nom` comme clé React : doublon possible, inventaire §11).

**Signature proposée.** Ajouter `id: p.id` à l'objet poussé (bloc « Analyse budgétaire » de la
boucle projets) : `ecartsTop: { id: string; nom: string; prevu: number; realise: number; ecart: number; ecartPct: number }[]`.
Additif, sans effet sur la page actuelle.

**Bouchon.** `ui2/apps/dashboard/besoins.ts` → `projectIdOfGap(projects, nom)` : retrouve le projet
par son nom SEULEMENT s'il est unique parmi les non-brouillons à prévisionnel saisi ; sinon la ligne
n'est pas cliquable. À remplacer par `g.id` (et supprimer le fichier) une fois le service complété.

## 2. Pour information (pas de changement partagé demandé)

- **Campagnes non chargées.** La page lit `GET /api/campaigns` (non cloisonné) sans s'en servir ;
  la rubrique v2 ne l'appelle pas (`useCampaigns` non utilisé). Le cloisonnement de la route reste
  à trancher côté backend (inventaire §11).
- **`GX.data.user(id)` retombe sur l'utilisateur connecté** pour un id inconnu (`ui2/os/data.ts`) :
  la « Charge de l'équipe » lit donc directement `useWorkspace(s => s.users)` pour afficher
  « Utilisateur inconnu » au lieu de son propre nom. Le repli de `GX.data.user` mériterait un
  utilisateur neutre plutôt que « moi ».
