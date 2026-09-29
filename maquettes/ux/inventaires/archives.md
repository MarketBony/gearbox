# Inventaire fonctionnel — Archives (`viewMode="archived"`)

Même composant que Projets : `pages/Projects.tsx`, monté par `App.tsx:153` en `<Projects viewMode="archived" />`.
**Tout ce qui n'est pas listé ici est identique à `projets.md`** (formulaire du détail, tableau des tâches, mode Expert,
temps réel, messages d'erreur, règles métier). Ce fichier ne décrit que les écarts.
Relevé par lecture du code le 29/09/2026 — rien n'a été vérifié dans l'interface.

---

## 1. Accès et rôles

- [ ] **Navigation** : pas dans `allMainItems` ; ajoutée à part :
  - [ ] desktop large (`lg`) : groupe « HISTORIQUE », entrée « Archives » (`components/Sidebar.tsx:353-356`), autorisée par `idsAutorises` sauf chef de site (`Sidebar.tsx:365-368`) ;
  - [ ] desktop compact (`md`–`lg`) : icône Archive seule après un séparateur, masquée pour External et chef de site (`Sidebar.tsx:474-486`) ;
  - [ ] mobile : menu « Plus », entrée « Projets Archivés » (`Sidebar.tsx:272-277`).
- [ ] **External** : aucune entrée (sa nav desktop = `mainItems`, son « Plus » ne contient que Paramètres) ; routage redirigé vers `digital` (`App.tsx:80,90`).
- [ ] **Chef de site** : `archives` n'est PAS dans `SITE_MANAGER_SECTIONS` (`constants.ts:719-721`) → garde `App.tsx:102-104` redirige vers `dashboard`.
- [ ] **Guest** : rubrique visible, lecture seule (comme Projets).
- [ ] Droits d'écriture : identiques à Projets (`EDIT_ROLES`, `Projects.tsx:449`).
- [ ] **Cloisonnement serveur** : aucune route propre — même `GET /api/projects` que Projets, qui renvoie tous les statuts ; le tri courant / archivé est fait **côté client** (`Projects.tsx:1021-1022`).

## 2. Structure

- [ ] Même mise en page liste + détail.
- [ ] Titre de liste « Archives » précédé de l'icône Archive (au lieu de « Projets ») (`Projects.tsx:1186-1189`).
- [ ] Clés de session préfixées `archived` : `gearbox_session_projects_archived_selectedId` (`:376`), `gearbox_session_projects_archived_<filtre>` pour les 11 états de filtre/tri (`:497-507`), défilement `gearbox_session_scroll_projects_archived` (`:618`).
- [ ] **Partagés avec Projets** : largeur de liste (localStorage `gearbox_projects_list_width`) et tri du tableau des tâches (`projects_taskSortField`, `projects_taskSortDir`, non préfixés).
- [ ] Au chargement, le projet mémorisé n'est réouvert que s'il est bien `Archived` (`:680-681`).

## 3. Filtres et sélecteurs

- [ ] Filtre implicite de vue : `status === 'Archived'` uniquement (`:1022`).
- [ ] Recherche : placeholder « Rechercher une archive... » (`:1218`).
- [ ] Statut : options « TOUS STATUTS », « Brouillon », « Actif », « Terminé » **+ « Archivé »** (`Archived`) (`:1285`).
- [ ] Tous les autres filtres identiques (Trier par date, Périmètre, Marques, Services, Utilisateurs, Objet (Type), Période).

## 4. Affichage

- [ ] Liste : chaque ligne porte le badge « archivé » (`getListStatusBadge`, `:1107`).
- [ ] Détail : bouton Archive du sélecteur de statut **surligné en violet** (`bg-purple-600`), infobulle « Restaurer » (`:1497-1502`) ; aucun des segments Brouillon / Actif / Terminé n'est actif.
- [ ] Le reste du détail (budget, tâches, mode Expert, description) est affiché et **éditable** comme dans Projets.

## 5. Formulaires

- [ ] Pas de modale « Nouveau Projet » : le bouton « Nouveau » n'existe qu'en vue courante (`:1201`).
- [ ] Formulaire du détail : identique à Projets.

## 6. Actions

- [ ] **Restaurer** : clic sur l'icône Archive → statut `Active`, projet **désélectionné** immédiatement ; **sans confirmation** ni entrée au journal d'activité (`:1496,810-816`).
- [ ] Clic sur « Brouillon », « Actif » ou « Terminé » : même effet (sort des archives avec ce statut et désélectionne) (`:810-816`).
- [ ] La modale « Confirmer l'archivage ? » n'est pas atteignable depuis cette vue.
- [ ] Supprimer : identique à Projets (confirmation en ligne « Confirmer ? » OUI / NON).
- [ ] Pas de création.

## 7. Temps réel et chargement

- [ ] Identique à Projets. Un projet archivé/restauré par un collègue change de vue au prochain `projects:updated`.

## 8. États vides et erreurs

- [ ] Aucun projet sélectionné : icône Archive + « SÉLECTIONNEZ UNE ARCHIVE » (`:2203-2207`).
- [ ] Liste vide : même texte que Projets, « Aucun projet trouvé ».
- [ ] Erreurs : identiques.

## 9. Règles métier touchées

- [ ] **`Archived` reste compté dans le budget** (classement visuel, pas annulation comptable — CLAUDE.md) : rien dans cet écran ne l'exclut, et la v2 ne doit pas l'exclure des agrégats.
- [ ] Toutes les autres règles : voir `projets.md` § 9.

## 10. Mobile

- [ ] Accès par le menu « Plus » (« Projets Archivés »), pas par la barre du bas.
- [ ] Le reste identique à Projets.

## 11. Défauts et bizarreries relevés (signalés, non corrigés)

- [ ] **Menu « Plus » mobile du chef de site** : `moreNavItems` ajoute « Projets Archivés » sans exclure le chef de site (`Sidebar.tsx:272-277`), alors que les deux navs desktop l'excluent ; le clic renvoie au Dashboard (garde `App.tsx`).
- [ ] Filtre Statut : en vue Archives, « Brouillon », « Actif », « Terminé » ne peuvent jamais correspondre (toutes les lignes sont `Archived`) — options mortes.
- [ ] Restauration asymétrique de l'archivage : ni confirmation ni journal d'activité, alors que l'archivage a les deux.
- [ ] Le chef de site reçoit quand même les projets archivés de son périmètre par l'API (filtrage de vue côté client uniquement) — pas une fuite hors périmètre, mais la rubrique lui est fermée.
- [ ] Libellés incohérents pour la même rubrique : « Archives » (desktop, titre de liste), « Projets Archivés » (mobile, texte de la modale d'archivage).
- [ ] Un projet archivé reste entièrement éditable (budget, tâches) sans avertissement.
