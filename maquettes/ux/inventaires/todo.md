# Inventaire fonctionnel — To-do

Sources : `pages/TodoList.tsx` (915 l., contient aussi `SiteFilterDropdown` et `StandaloneTaskForm`), `backend/src/routes/tasks.ts`, `App.tsx`, `components/Sidebar.tsx`, `constants.ts`. Voir `_FORMAT.md`.

## 1. Accès et rôles

- [ ] Entrée de menu « To-do » (icône CheckSquare) masquée pour `External` uniquement : `Sidebar.tsx:214`. Dans le menu regroupé, elle est sous « GESTION DE PROJETS » (`Sidebar.tsx:320`). Présente aussi dans la barre mobile (`MOBILE_BAR_IDS`, `Sidebar.tsx:247`).
- [ ] Garde `External` : `EXTERNAL_ALLOWED_TABS = ['digital','chat','hello-marketing','settings']` → `todo` redirigé vers `digital` (`App.tsx:80,90`).
- [ ] Garde `Site Manager` : `todo` absent de `SITE_MANAGER_SECTIONS` (`constants.ts:719`) → redirigé vers `dashboard` (`App.tsx:102`). Côté serveur, `/api/tasks` refuse aussi le rôle (`EDIT_ROLES`, `tasks.ts:28`).
- [ ] Bouton « Nouvelle tâche » visible seulement si rôle ∈ `['Master','Administrator','Director','Coordinator','Digital Manager']` (`TodoList.tsx:495`). Simple confort d'affichage ; refus réel serveur.
- [ ] Serveur : les 4 routes `/api/tasks` (GET, POST, PUT, DELETE) exigent `requireRole(EDIT_ROLES)` avec la même liste (`tasks.ts:49,54,66,85`). Écriture d'une tâche de projet : `PUT /api/projects/:id`, `EDIT_ROLES` identique (`projects.ts:18,146`).
- [ ] Lecture des projets : `GET /api/projects` cloisonné par `scopeOf` + `redactSiteFields` (`projects.ts:20-33`) — non concerné pour la To-do en pratique (Site Manager n'a pas la rubrique).
- [ ] Guest : voit la rubrique mais ne peut pas créer ; voir défaut n°1 en section 11 (GET `/tasks` en 403).
- [ ] Le client fabrique : les tâches « autonomes » et « de projet » sont fusionnées en un type `TodoTask` avec champs `project*` synthétisés (`TodoList.tsx:22-37, 546-560`).
- [ ] Périmètre affiché : uniquement les tâches assignées à l'utilisateur connecté (`assignedUserId === user.id`, `status !== 'Empty'`) (`TodoList.tsx:509, 542`).

## 2. Structure

- [ ] Une seule vue : kanban 4 colonnes, ordre `Todo`, `InProgress`, `Programmed`, `Done` (`KANBAN_COLS`, l.48-54) : « À faire » (bleu), « En cours » (orange), « Programmé » (violet), « Terminé » (vert).
- [ ] Desktop (`md:`) : 4 colonnes côte à côte, `md:grid-cols-4` (l.841). Mobile : onglets de colonne + une seule colonne visible (l.798-818, 877-899).
- [ ] Onglet mobile actif : `mobileCol`, état local `useState(0)` — NON persistant. Panneau de filtres replié : `showFilters` local, non persistant.
- [ ] Aucun `useSessionState` / localStorage dans la page : filtres, recherche et onglet mobile sont perdus à la navigation.
- [ ] Modale « Nouvelle tâche » / « Modifier la tâche » (`StandaloneTaskForm`), `z-[300]`, fermeture par clic sur le fond (sauf pendant l'enregistrement) (l.382).

## 3. Filtres et sélecteurs

Tous en état local, valeurs par défaut vides. Bouton « Effacer tout » (desktop, dans la barre) / « Tout effacer » (mobile) si au moins un filtre actif (`activeFilterCount`, l.634-648) ; le compteur ne compte la plage de dates que pour 1.

- [ ] **Recherche** : placeholder « Rechercher une tâche ou un projet… », texte libre, croix d'effacement. Règle : `name` de la tâche OU `projectName`, insensible à la casse, `includes` (l.612-616). Une tâche autonome a `projectName = ''` : seul son nom compte.
- [ ] **Périmètre** (`SiteFilterDropdown`, libellé du bouton « Périmètre », ou « N site(s) ») : MULTIPLE, cases à cocher. Source : `PLAQUES_STRUCTURE` (4 plaques : PLAQUE CENTRE, PLAQUE NORD, PLAQUE SUD, PLAQUE SUD-OUEST, chacune repliable avec ses sites, `constants.ts:5-10`). Case plaque = sélectionne/désélectionne tous ses sites (état indéterminé possible) (l.101-205). Lien « Tout effacer » dans le menu. Règle : `matchesSiteFilter` sur `taskSites` (sites RÉELS, pas `projectSite`) : vrai si au moins un site de la tâche est dans les sites sélectionnés ou dans une plaque sélectionnée (l.77-89, 617-624). Une tâche autonome sans site ne passe donc jamais dès qu'un site est sélectionné.
- [ ] **Marques** : puces MULTIPLES, options = `BRANDS` : Renault, Dacia, Alpine, Nissan, Mobilize, Holding (`constants.ts:27`), couleur `BRAND_COLORS`. Règle : `some` marque sélectionnée ∈ `projectBrands` (l.625).
- [ ] **Services** : puces MULTIPLES, options = `SERVICES` sans « Tous Services » : VN, VO, APV, PR (l.704), couleur `SERVICE_COLORS`. Règle : `some` service ∈ `projectService` (l.626). Une tâche taguée « Tous Services » ne matche donc aucune puce individuelle.
- [ ] **Plage de dates** : deux `DatePicker` (taille `sm`) séparés par « → » (l.720-733). Début : garde si `dateReference >= début` ; fin : garde si `projectStartDate <= fin` (l.627-628). Attention, asymétrie : la borne de début porte sur la date de référence (échéance), la borne de fin sur `projectStartDate` (début du projet, ou échéance pour une autonome).
- [ ] Barre de filtres : toujours visible en desktop, repliable en mobile (bouton « Filtres » + pastille du nombre de filtres actifs).

## 4. Affichage

- [ ] En-tête : icône, titre « To-do », compteur `N tâche(s) assignée(s)` (pluriel selon N, calculé sur les tâches FILTRÉES) ; « Sauvegarde… » clignotant pendant un déplacement (l.746-752).
- [ ] Colonne : pastille couleur, libellé en majuscules, compteur de tâches filtrées de la colonne ; corps défilant ; « Aucune tâche » si vide (l.847-857).
- [ ] Tri : unique, par `dateReference` croissante (`localeCompare`), appliqué au chargement (l.564). Aucun tri proposé à l'utilisateur.
- [ ] Carte de tâche (`TaskCard`, l.208-318), 3 rangées + boutons :
  - Nom, borné à 2 lignes.
  - Tâche de PROJET : bouton avec `projectName`, `projectSite`, icône ExternalLink → navigation vers le projet. Tâche AUTONOME : puce « Libre » (violet) + sites joints par « , » + icône crayon → ouvre le formulaire d'édition (titre « Modifier cette tâche »).
  - Échéance à droite, format `formatDate` (`fr-FR`, jour 2 chiffres, mois court, année) ; ou « Expiré il y a Nj » (retard), ou « Nj restant(s) » (0 à 3 j) ; ou « Sans échéance » (autonome sans deadline, sans icône calendrier).
  - Urgence (`daysUntil(dateReference)`) : `overdue` (< 0), `critical` (≤ 3), `warning` (≤ 7), sinon `ok`. Liseré gauche rouge pour overdue/critical, orange pour warning, transparent sinon. Texte de date : rouge (overdue), rouge clair (critical), orange (warning), gris (ok). Jamais d'urgence pour une autonome sans deadline.
  - Badges : services (`SERVICE_COLORS`), marques (`BRAND_COLORS`), canal (`task.channel`, gris), coût `N €` (`toLocaleString('fr-FR')`) si `cost > 0`, poussé à droite avec icône Banknote.
  - Deux boutons chevrons gauche/droite pour changer de colonne (désactivés en bord).
- [ ] Date de référence : `t.deadline || p.endDate` pour une tâche de projet ; `t.deadline || '9999-12-31'` pour une autonome (l.528, 559).
- [ ] Couleurs porteuses de sens : colonnes par statut (voir plus haut), liseré d'urgence, puce « Libre » violette, marques et services.
- [ ] Aucun KPI, aucune formule `constants.ts` dans l'affichage (le coût est celui de la tâche).

## 5. Formulaires

`StandaloneTaskForm` (l.328-468), création ET édition d'une tâche AUTONOME uniquement. Une tâche de projet ne se modifie pas ici (aucun formulaire).

- [ ] **Nom \*** : texte, obligatoire, `autoFocus`. Validation client : « Le nom de la tâche est obligatoire. » ; validation serveur : 400 identique (`tasks.ts:56`). `trim()` appliqué.
- [ ] **Prestataire** : texte libre, optionnel.
- [ ] **Deadline** : `DatePicker`, optionnel (vide = « Sans échéance »).
- [ ] **Canal** : `Select`, options « — » (vide) puis `TASK_CHANNELS` : SMS, E-mail, GMB, Radio, Print, Affichage, Presse, Street Market, PLV, Traiteur, Audiovisuel, Mobilier, Lieu (`constants.ts:31`). Défaut vide.
- [ ] **Statut** : `Select`, options = libellés des 4 colonnes (À faire, En cours, Programmé, Terminé). Défaut `Todo`.
- [ ] **Sites** : `SiteFilterDropdown` réutilisé, placeholder « Choisir des sites », multiple, même arborescence par plaques. Défaut vide.
- [ ] **Marques** : puces multiples `BRANDS` (6). **Services** : puces multiples `SERVICES` (5, « Tous Services » INCLUS ici, contrairement au filtre).
- [ ] Pas de champ Coût (le serveur force `cost = 0`, `tasks.ts:41-45`). Pas de champ « Assigné à » : création = utilisateur courant, édition = valeur existante conservée (l.324-338).
- [ ] Payload envoyé : `name, provider, channel, status, assignedUserId, deadline, sites, brands, service` (l.353).
- [ ] Liste blanche serveur `FIELDS` (`tasks.ts:33-36`) : mêmes 9 champs ; tout autre est jeté en silence ; `cost` toujours forcé à 0. Création : `channel ?? ''`, `status ?? 'Todo'`.
- [ ] Boutons : « Créer la tâche » / « Enregistrer » (« Enregistrement… » pendant l'envoi) ; corbeille rouge (édition seulement) ; croix de fermeture.
- [ ] Pas de sélecteur de type Brouillon / de curseur `alpineShare` / `nissanShare` sur ce formulaire.

## 6. Actions

- [ ] Créer une tâche autonome : `POST /api/tasks`, puis rechargement (`onSaved = loadTasks`) et fermeture.
- [ ] Modifier une tâche autonome : clic sur la puce « Libre » / crayon → `PUT /api/tasks/:id` (`updateMany` avec `projectId: null`, une tâche de projet ne peut pas être touchée par cette route).
- [ ] Supprimer une tâche autonome : corbeille dans le formulaire, `confirm('Supprimer définitivement cette tâche ?')`, `DELETE /api/tasks/:id` (204, 404 si introuvable).
- [ ] Changer le statut par les chevrons : tâche autonome → `PUT /api/tasks/:id { status }` ; tâche de projet → relit `db.getProjects()`, remplace le statut de la tâche, `recalculerProjet` (recalcule `progress` / `budgetActual`, `utils/projet.ts`), puis `PUT /api/projects/:id` du projet entier (l.583-603). Rechargement systématique ensuite.
- [ ] Naviguer vers le projet : clic sur le nom du projet → `sessionStorage.pendingProjectId` + événement `gearbox-navigate { tab: 'projects', projectId }` (l.606-609).
- [ ] Déplacement de colonne uniquement par boutons chevrons (pas de glisser-déposer). On ne peut aller que d'une colonne à l'adjacente.
- [ ] Pas d'export, pas d'action en masse, pas de raccourci clavier, pas de duplication, pas d'archivage.

## 7. Temps réel et chargement

- [ ] `useRealtimeSync([...RT_EVENTS.projects, ...RT_EVENTS.tasks], loadTasks)` : `projects:updated`, `projects:deleted`, `tasks:updated`, `tasks:deleted` (l.576, `realtime.ts:31,37`). Remplace un ancien polling à 30 s.
- [ ] Chargement initial : écran plein « Chargement… » (orange, clignotant) tant que `loading` (l.650-656). Rechargement complet (projets + tâches autonomes) à chaque événement et après chaque action.
- [ ] Deux requêtes : `db.getProjects()` puis `db.getStandaloneTasks()`, en séquence.

## 8. États vides et erreurs

- [ ] Aucune tâche du tout : « Aucune tâche ne vous est assignée dans les projets actifs. » (icône CheckSquare grande).
- [ ] Tâches existantes mais filtrées à zéro : « Aucune tâche ne correspond aux filtres sélectionnés. » + lien « Effacer les filtres » (si filtres actifs).
- [ ] Colonne vide desktop : « Aucune tâche » ; colonne vide mobile : « Aucune tâche dans cette colonne ».
- [ ] Échec d'un déplacement : `alert('Échec de la sauvegarde (serveur injoignable ?).')` puis rechargement.
- [ ] Échec création/édition : message `Error.message` sous les champs (rouge, gras), sinon « Échec de l'enregistrement. » ; échec suppression : « Échec de la suppression. ».
- [ ] Pas de traitement spécifique du 403 / réseau au chargement (voir défaut n°1).

## 9. Règles métier touchées

- [ ] **Brouillon** : les tâches des projets `Draft` SONT affichées (`p.status === 'Active' || p.status === 'Draft'`, l.503-505). Exception explicite et voulue par CLAUDE.md (« la To-do reste incluse pour préparer un projet »). À conserver.
- [ ] **Projets échus** : un projet dont `endDate < aujourd'hui` disparaît (avec toutes ses tâches, faites ou non) ; les statuts autres qu'Active/Draft (ex. Archived) sont exclus.
- [ ] **Tâche autonome** : masquée seulement si `Done` ET deadline dépassée ; une tâche en retard non faite reste visible (arbitrage de Théo, l.534-544).
- [ ] Holding : marque affichée comme badge et filtrable, sans effet budgétaire ici (aucun montant agrégé).
- [ ] Alpine / Nissan / curseurs de répartition / GROUPE BONY : non applicables (pas de routage budgétaire). Le filtre de site lit `taskSites` sans passer par `resolveSiteAlias`.
- [ ] Recalcul projet à chaque changement de statut d'une tâche de projet : `recalculerProjet` (`utils/projet.ts`, ne mute pas son argument). À réutiliser tel quel en v2.

## 10. Mobile

- [ ] Sous `md:` : barre de filtres repliable (bouton « Filtres » + pastille), onglets de colonnes (libellé + compteur, défilement horizontal, min 80 px) et une seule colonne affichée.
- [ ] Séparateurs verticaux de la barre de filtres masqués (`hidden md:block`) ; panneau en colonne.
- [ ] Bouton « Nouvelle tâche » : hauteur `min-h-[44px]` mobile, `md:min-h-[34px]` desktop. Chevrons de carte `py-2.5` mobile (`md:py-0.5`), sous le seuil tactile de 44 px (commenté l.297-299).
- [ ] Navigation mobile : « To-do » fait partie des 5 entrées de la barre basse.

## 11. Défauts et bizarreries relevés

1. **Guest (et tout rôle hors `EDIT_ROLES` qui voit la rubrique)** : `db.getStandaloneTasks()` appelle `GET /api/tasks`, réservé à `EDIT_ROLES` (`tasks.ts:49`). `loadTasks` n'a pas de `try/catch` et `setLoading(false)` n'est atteint qu'après cet appel : un 403 laisserait très probablement l'écran sur « Chargement… » sans message. À vérifier avec un vrai compte Guest ; non testé.
2. Filtre de dates asymétrique (début sur `dateReference`, fin sur `projectStartDate`) : une tâche peut apparaître alors que son échéance dépasse la borne de fin.
3. Filtre Services sans « Tous Services » : une tâche taguée uniquement « Tous Services » n'apparaît que sans filtre service actif.
4. Aucune persistance des filtres (contrairement à Campagnes qui utilise `useSessionState`).
5. `moveTask` pour une tâche de projet relit tous les projets puis renvoie le projet entier (PUT lourd) ; échec silencieux si le projet n'est plus trouvé (`if (target)`), suivi d'un simple rechargement.
6. Coût des tâches de projet visible dans la carte (`cost > 0`), alors que les tâches autonomes n'en ont jamais.
7. Le libellé du compteur (« assignée(s) ») et l'état vide (« dans les projets actifs ») ne mentionnent pas les tâches autonomes.
8. Le commentaire d'`EDIT_ROLES` (`tasks.ts:22-27`) dit « aligné sur projects.ts » : effectivement identique ce jour (5 rôles).
