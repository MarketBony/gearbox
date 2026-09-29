# Inventaire fonctionnel — Projets (`viewMode="current"`)

Source principale : `pages/Projects.tsx` (monté par `App.tsx:150` en `<Projects viewMode="current" />`).
Composants suivis : `components/ChampDiffere.tsx`, `components/Select`, `components/DatePicker`, `components/FloatingPanel`,
`components/Avatar`, `components/expert/*` (mode Expert, § 12), `utils/projet.ts`, `services/fileSauvegardeProjet.ts`.
La vue Archives (même page, `viewMode="archived"`) est décrite par différence dans `archives.md`.
Relevé par lecture du code le 29/09/2026 — rien n'a été vérifié dans l'interface.

---

## 1. Accès et rôles

- [ ] **Visibilité de la rubrique** : entrée `projects` « Projets » dans `allMainItems` (`components/Sidebar.tsx:213`), groupe desktop « GESTION DE PROJETS » (`Sidebar.tsx:319`), barre du bas mobile (`MOBILE_BAR_IDS`, `Sidebar.tsx:247`).
- [ ] **External** : pas de rubrique (menu limité à `digital`, `chat`, `hello-marketing` — `Sidebar.tsx:231-235`) ; garde de routage → redirigé vers `digital` (`App.tsx:80,90`).
- [ ] **Chef de site (`Site Manager`)** : `projects` fait partie de `SITE_MANAGER_SECTIONS` (`constants.ts:719-721`), rubrique visible, en lecture seule.
- [ ] **Guest** : rubrique visible (aucun filtrage de menu ni de route pour lui), lecture seule.
- [ ] **Écriture** : `EDIT_ROLES = ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager']` (`Projects.tsx:449-450`), aligné sur `EDIT_ROLES` serveur (`backend/src/routes/projects.ts:18`) et `backend/src/routes/projectFiles.ts:17`. `canEdit = !!user && EDIT_ROLES.includes(user.role)`.
- [ ] **Comportement lecture seule** (`!canEdit`) :
  - [ ] badge « Lecture Seule » (icône cadenas) dans l'en-tête du détail (`Projects.tsx:1421`) ;
  - [ ] bouton « Nouveau » masqué (`:1201`), bouton « Supprimer » masqué (`:1423`), « + AJOUTER UNE TÂCHE » masqué (`:1931`), corbeille de tâche masquée (`:2150`) ;
  - [ ] interrupteur du mode Expert **masqué** (pas désactivé) (`:1516`) ;
  - [ ] tous les autres champs rendus `disabled` (opacité 50 %, `cursor-not-allowed`) ;
  - [ ] période affichée en texte (`toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })`, « — » si vide) au lieu des DatePicker (`:1546-1551`) ;
  - [ ] équipe : ni bouton d'ajout ni croix de retrait (`TeamSection`, `:111,131`) ;
  - [ ] `muterProjet` refuse toute écriture si `!canEdit` (`:765`).
- [ ] **Cloisonnement serveur** :
  - [ ] `GET /api/projects` : `scopeOf(req)` + `arrayScopeWhere('sites', scope)` puis `redactSiteFields` (`backend/src/routes/projects.ts:20-34`) — un chef de site ne reçoit que les projets dont `sites[]` croise son périmètre, avec `sites`, `budgetDistribution` filtrés et `site` réécrit en `sites.join(', ')` (`backend/src/auth/siteScope.ts:185-210`).
  - [ ] `POST`, `PUT /:id`, `DELETE /:id` : `requireRole(EDIT_ROLES)` (`projects.ts:36,146,276`).
  - [ ] Fichiers Expert : `GET /api/project-files/:projectId` passe par `projetAutorise` (scope) et rend 404 hors périmètre ; `POST /:projectId` et `DELETE /item/:fileId` en `requireRole(EDIT_ROLES)` (`projectFiles.ts:32-42,61,105`).
- [ ] **Ce que le client complète lui-même** : `progress` et `budgetActual` recalculés côté client à chaque mutation par `recalculerProjet` (`utils/projet.ts`) ; `id` du projet et des tâches générés côté client (`Math.random().toString(36).substr(2, 9)`, `Projects.tsx:858,988`) ; la répartition `budgetDistribution` est calculée côté client (§ 5).
- [ ] **Listes de choix de personnes** restreintes à l'équipe marketing (`isMarketingRole`, `MARKETING_TEAM_ROLES` = Master, Administrator, Director, Coordinator, Digital Manager — `constants.ts:693-702`) ; la liste de **résolution** (`users`) reste complète (`Projects.tsx:519-525`).

## 2. Structure

- [ ] Page en deux panneaux : **liste** (gauche) + **détail** du projet sélectionné (droite) (`Projects.tsx:1113`).
- [ ] Largeur de la liste redimensionnable à la souris (poignée bord droit, desktop), bornée 240–480 px, défaut 320 px, persistée en **localStorage** clé `gearbox_projects_list_width` (`:458-494,1401-1404`).
- [ ] Projet sélectionné persisté en **sessionStorage** clé `gearbox_session_projects_current_selectedId` (`:376,401-406`) ; restauré au chargement (`loadProjects`, `:669-701`).
- [ ] Navigation entrante `gearbox-navigate` avec `detail.projectId` (depuis Agenda, Chat, Dashboard, To-do) : pose `pendingProjectId` en sessionStorage, recharge et sélectionne le projet (`:624-639`).
- [ ] Panneau de filtres repliable, état `useSessionState` clé `gearbox_session_projects_current_showFilters` (défaut `false`) (`:497`). Toutes les clés `useSessionState` sont préfixées `gearbox_session_` (`hooks/useSessionState.ts:9`).
- [ ] Position de défilement de la liste restaurée : `useScrollRestore('projects_current')` → sessionStorage `gearbox_session_scroll_projects_current` (`:618`, `useSessionState.ts:40`).
- [ ] Détail, de haut en bas : en-tête (ID, indicateur de sauvegarde, lecture seule, Supprimer) → Titre → bloc Contexte (col. 8/12) + carte Budget (col. 4/12) → « Tâches & Coûts » → modules Expert (si actif) → « Description Globale » (`:1411-2198`).
- [ ] Modales : « Nouveau Projet » (`:1115-1146`), « Confirmer l'archivage ? » (`:1148-1176`).
- [ ] Surcouche plein écran « Détail de la tâche » (mode Expert uniquement), montée à la racine (`:2224-2241`).
- [ ] Changer de `viewMode` désélectionne le projet (`:653-655`).

## 3. Filtres et sélecteurs

Tous persistés via `useSessionState`, clés `projects_current_<nom>` (`Projects.tsx:497-507`). Compteur de filtres actifs sur le bouton filtre (badge) = `filterSites.length + filterBrands.length + filterServices.length + filterUsers.length + (type ≠ All) + (statut ≠ All) + (du) + (au)` — la recherche et le tri n'y comptent pas (`:1085-1087`).

- [ ] **Recherche** (toujours visible) — placeholder « Rechercher un projet... » ; texte ; défaut `''` ; clé `searchTerm` ; `p.name.toLowerCase().includes(terme.toLowerCase())` (`:1024,1212-1221`).
- [ ] **Bouton filtres** — titre « Filtres avancés », icône Filtre / X quand ouvert ; orange si ouvert ou si filtre actif (`:1191-1200`).
- [ ] **Trier par date** — bouton bascule « Plus récents » (desc, défaut) / « Plus anciens » (asc) ; clé `sortOrder` ; tri sur `new Date(startDate)` (`:1228-1237,1071-1075`).
- [ ] **Périmètre** (`ProjSitePicker`) — MULTIPLE, panneau flottant 256 px :
  - [ ] libellé déclencheur : « Tout le réseau » (aucun) / nom du site (1) / « N sites » ;
  - [ ] champ « Rechercher un site… » ; boutons « Tout le réseau » (vide la sélection) et « Tout sélectionner » (tous les sites des plaques + `Alpine`, `Nissan`) ;
  - [ ] groupes repliables par plaque (`PLAQUES_STRUCTURE` : PLAQUE CENTRE, PLAQUE NORD, PLAQUE SUD, PLAQUE SUD-OUEST, tous dépliés par défaut) avec case de plaque (tout / partiel) ;
  - [ ] section « Entités Spécifiques » : `Alpine`, `Nissan` (`PROJ_SPECIAL_SITES`, `:171`) ;
  - [ ] défaut `[]` ; clé `filterSites` ;
  - [ ] règle (`:1026-1037`) : OU entre sélections ; `'GROUPE BONY'` → toujours vrai ; nom de plaque → `p.site === plaque || sitesDeLaPlaque.includes(p.site)` ; sinon `p.site === sel` (comparaison **exacte** sur le libellé `site`, voir § 11).
- [ ] **Marques** (`ProjBrandPicker`) — MULTIPLE, puces : « Toutes » + `Renault`, `Dacia`, `Alpine`, `Nissan`, `Mobilize` (`PROJ_BRAND_CHIPS`, `:264` — Holding non proposé) ; couleurs `BRAND_COLORS` ; défaut `[]` ; clé `filterBrands` ; règle : OU, `p.brands.includes(b) || p.brands.includes('Holding')` (`:1044-1048`).
- [ ] **Services** (`ProjServicePicker`) — MULTIPLE, puces : « Tous » + `VN`, `VO`, `APV`, `PR` (`:285`) ; couleurs `SERVICE_COLORS` ; défaut `[]` ; clé `filterServices` ; règle : OU, `p.service.includes(s) || p.service.includes('Tous Services')` (`:1039-1042`).
- [ ] **Utilisateurs** (`ProjUserPicker`) — MULTIPLE, panneau flottant ; options = `marketingUsers` (avatar + nom) ; déclencheur « Tous les utilisateurs » / nom (1) / « N utilisateurs » ; recherche « Rechercher une personne… » ; bouton « Tous les utilisateurs » ; vide : « Aucune personne trouvée. » ; défaut `[]` ; clé `filterUsers` ; règle : OU sur `p.assignedUsers` (`:315-366,1053-1056`).
- [ ] **Objet (Type)** — Select simple : « TOUS TYPES » (`All`, défaut) + `PROJECT_TYPES` = Partenariat, Expo/Salon, Animation Co, OP Clients, Contenu, Collaborateurs (`constants.ts:29`) ; clé `filterType` ; `p.projectType === filterType` (`:1266-1272,1058`).
- [ ] **Statut** — Select simple : « TOUS STATUTS » (`All`, défaut), « Brouillon » (`Draft`), « Actif » (`Active`), « Terminé » (`Done`) — « Archivé » seulement en vue Archives ; clé `filterStatus` ; `p.status === filterStatus` (`:1275-1287,1059`).
- [ ] **Période (date de début)** — deux DatePicker « Du » (placeholder « Début ») et « Au » (placeholder « Fin ») ; défaut `''` ; clés `filterDateFrom`, `filterDateTo` ; bornes incluses sur `p.startDate` en parse local ; un projet sans `startDate` passe toujours (`:1061-1066,1292-1304`).
- [ ] Pied du panneau : « RÉINITIALISER » (remet recherche, tous les filtres ET le tri à `desc`) (`:1089-1100,1307`) + compteur « N RÉSULTAT(S) » (`:1308`).
- [ ] Filtre implicite de vue : `status !== 'Archived'` (`:1021`).

## 4. Affichage

**Liste** (`:1313-1398`) — tri par `startDate` décroissant par défaut.
- [ ] Ligne 1 : nom (tronqué, infobulle), orange si sélectionné ; badge « PRO+ » si `proPlus` ; badge de statut : `Draft` « brouillon » (gris), `Active` « actif » (émeraude), `Done` « terminé » (bleu), `Archived` « archivé » (`getListStatusBadge`, `:1102-1110`).
- [ ] Ligne 2 : `site` · `projectType` ; à droite `budgetActual.toLocaleString() €` si > 0.
- [ ] Ligne 3 : puces de couleur des marques (4 max, `BRAND_DOT`, `:25-32`) + texte « marques · services » ; mini-barre d'avancement `progress %` si le projet a des tâches ou un `budgetActual > 0`.
- [ ] Sélection : fond orange léger + liseré vertical dégradé orange→violet à gauche.
- [ ] Le mode Expert n'est pas signalé dans la liste.

**En-tête du détail** (`:1411-1449`)
- [ ] « ID: {id} » (desktop seulement) ; « SAUVEGARDE... » clignotant tant que la file de sauvegarde n'est pas au repos (`saving`) ; « Lecture Seule ».

**Carte Budget** (`:1812-1922`)
- [ ] Titre « Budget », sous-titre « Pilotage financier en temps réel ».
- [ ] « Budget Prévu » (saisi, € ) ; « Budget Réel (Auto) » = `budgetActual.toLocaleString() €` = somme des `task.cost` (`recalculerProjet`).
- [ ] Écart = `budgetPlanned - budgetActual` ; ≥ 0 → « Gain Estimé » vert (flèche montante), < 0 → « Dépassement » rouge ; sous-ligne « |écart| € (x.x%) », % = |écart| / budgetPlanned, « 0.0 » si prévu = 0 (`:1079-1083,1900-1910`).
- [ ] « Avancement Tâches » + `progress %` + barre dégradée. Formule `recalculerProjet` : Done/Programmed = 1, InProgress = 0,5, autres 0, moyenne arrondie × 100 ; 0 sans tâche (`utils/projet.ts:28-42`).

**Tableau « Tâches & Coûts »** (`:1925-2169`)
- [ ] Colonnes : n° de ligne (ordre affiché) · « Nom de la tâche » · « Prestataire » · « Canal » · « Statut » · « Assigné » · « Coût (€) » · « Échéance » · actions. `table-fixed`, `min-w-[1060px]` (1112 px en mode Expert), défilement horizontal.
- [ ] En-têtes triables (`TriTache`) : clic même colonne = inversion, autre colonne = tri croissant ; flèche sur la colonne active seulement ; infobulle « Trier par … ». Tri persisté en session, clés **non préfixées par viewMode** `projects_taskSortField` (défaut `deadline`) et `projects_taskSortDir` (défaut `asc`) (`:516-517`).
- [ ] Règles de tri (`compareTasks`, `:541-572`) : échéance — sans échéance toujours en dernier ; coût numérique ; statut selon `TASK_STATUS_ORDER` Empty 0 < Todo 1 < InProgress 2 < Programmed 3 < Done 4 ; assigné sur le **nom** résolu, non-assignés en dernier ; texte en `localeCompare('fr')`.
- [ ] **Gel de l'ordre** pendant la saisie d'un champ texte (nom, prestataire, coût) : ordre figé au focus, libéré au blur ; les Select et DatePicker ne gèlent pas (`:539,599-603`).
- [ ] Assigné : avatar de la personne (ou icône cercle vide) + Select.
- [ ] En mode Expert, bouton « détail » dans la colonne actions (§ 12).

**Autres**
- [ ] Équipe projet : avatars 34 px, infobulle nom + rôle ; « Aucun membre assigné » si vide (`:96-167`).
- [ ] Bloc « Répartition Budgétaire » affiché seulement si `sites.length > 1` (§ 5).

## 5. Formulaires

**Modale « Nouveau Projet »** (`:1115-1146`)
- [ ] Texte « Donnez un nom à votre projet pour commencer. » ; champ unique placeholder « Nom du projet... », autofocus ; Entrée = créer, Échap = fermer ; boutons « ANNULER » / « CRÉER » (désactivé si nom vide après trim).
- [ ] Valeurs par défaut du projet créé (`:857-875`) : `site: 'Clermont'`, `sites: ['Clermont']`, `budgetDistribution: { Clermont: 100 }`, `service: ['VN']`, `brands: ['Renault']`, `projectType: 'OP Clients'`, `status: 'Draft'`, `startDate` = `endDate` = aujourd'hui (UTC `toISOString`), budgets 0, `progress` 0, `tasks: []`, `assignedUsers: [utilisateur courant]`.

**Détail du projet** — tout champ passe par `muterProjet` (état optimiste + file de sauvegarde, § 6). Les champs texte/nombre sont des `ChampTexte` / `ChampNombre` : brouillon local, **écriture au blur** (et au démontage / onglet caché / fermeture), pas à la frappe (`components/ChampDiffere.tsx:1-35`).
- [ ] **Titre du projet** — texte, placeholder « NOM DU PROJET » (`:1455-1464`).
- [ ] **Statut du Projet** — segmenté « Brouillon » / « Actif » / « Terminé » + bouton icône Archive (infobulle « Archiver » / « Restaurer ») (`:1475-1506`) ; archiver ouvre la modale de confirmation (§ 6).
- [ ] **Période** — DatePicker « Début » → « Fin » ; « Fin » a `minDate = startDate` ; poser un début postérieur à la fin repousse la fin au début (`:1539-1545`).
- [ ] **Client B2B** — case-bouton « PRO+ » (infobulle « Marquer ce projet comme PRO+ (B2B) »), bascule `proPlus` (`:1555-1573`). ⚠️ Marqueur MÉTIER, distinct du mode Expert.
- [ ] **Site / Plaque** — bouton déroulant (texte `site` ou « Sélectionner... ») ; menu (`:1579-1646`) :
  - [ ] « GROUPE BONY (GLOBAL) » → `sites = clés de DISTRIBUTION_GROUPE_BONY`, `budgetDistribution = DISTRIBUTION_GROUPE_BONY`, `site = 'GROUPE BONY'` ; ferme le menu ;
  - [ ] « GROUPE BONY (R/N) » → idem avec `DISTRIBUTION_GROUPE_BONY_RN`, `site = 'GROUPE BONY (R/N)'` ; ferme le menu ;
  - [ ] sites groupés par plaque (`PLAQUES_STRUCTURE`) en **bascule multiple** (menu reste ouvert) ;
  - [ ] groupe « SITES NISSAN » écrit en dur : `Montluçon`, `Saint-Etienne` (`:1629`) ;
  - [ ] règle (`updateSiteSelection`, `:888-947`) : quitter un mode groupe vide d'abord la sélection ; `site` = '' (0), le site (1), ou `sites.join(', ')` (n) ; **toute** bascule manuelle remet la répartition à parts égales `100 / n`.
- [ ] **Type de Projet** — Select `PROJECT_TYPES`, défaut affiché `'OP Clients'` (`:1648-1654`).
- [ ] **Services** — puces `SERVICES` = VN, VO, APV, PR, Tous Services ; « Tous Services » est exclusif (le poser vide les autres, en poser un autre le retire) (`:954-967,1660-1679`).
- [ ] **Marques** — puces `BRANDS` = Renault, Dacia, Alpine, Nissan, Mobilize, Holding, couleurs `BRAND_COLORS` ; **Alpine** proposé seulement si un site du projet ∈ `ALPINE_SITES`, **Nissan** seulement si un site ∈ `NISSAN_SITES` (`:1684-1689`) ; **Holding exclusif** (`toggleBrand`, `:969-984`).
- [ ] **Équipe projet** — bouton « + » (infobulle « Ajouter un membre ») ouvre une liste flottante des `marketingUsers` non encore membres ; croix rouge au survol pour retirer ; retirer le dernier membre demande `confirm('Cet utilisateur est le seul membre du projet. Le retirer quand même ?')` (`:1002-1017,1712-1732`).
- [ ] **Répartition Budgétaire** (si > 1 site) (`:1735-1808`) :
  - [ ] bascule d'affichage « % » / « € » (état local, non persistant, défaut `%`) — le stockage reste en % ;
  - [ ] une ligne par site : champ nombre (`videVaut="zero"`), montant ou % en regard ; en € le montant = `round(budgetActual × pct / 100)` et la saisie est reconvertie en % de `budgetActual` ;
  - [ ] champs **désactivés** en mode GROUPE BONY / R/N (répartition fixe), et en € si `budgetActual` = 0 avec message « Budget réalisé = 0 € : saisie en € indisponible (utilisez le mode %). » ;
  - [ ] « Total: x.x% » vert si |total − 100| ≤ 0,1, rouge sinon (aucun blocage).
- [ ] **Budget Prévu** — `ChampNombre`, `videVaut="zero"`, placeholder « 0 », suffixe € (`:1825-1842`).
- [ ] **Curseurs « Part Alpine (%) » / « Part Nissan (%) »** (`:1859-1898`) — visibles seulement si une marque RDM (`RDM_BRANDS` = Renault, Dacia, Mobilize) est présente **et** Alpine (resp. Nissan) taggué ; `ChampNombre` `videVaut="null"`, borné 0–100 au commit, placeholder « 100 » ; valeur affichée `?? 100` ; légende « {share}% → {marque} · {100 - share}% → compte RDM ».
- [ ] **Description Globale** — `ChampTexte multiligne`, placeholder « Contexte général du projet... » (`:2185-2197`).

**Ligne de tâche** (`:1983-2157`)
- [ ] Nom — texte, placeholder « Description de la tâche... ».
- [ ] Prestataire — texte, placeholder « Prestataire... ».
- [ ] Canal — Select « -- Aucun -- » + `TASK_CHANNELS` = SMS, E-mail, GMB, Radio, Print, Affichage, Presse, Street Market, PLV, Traiteur, Audiovisuel, Mobilier, Lieu (`constants.ts:31`).
- [ ] Statut — Select « Vierge » (`Empty`), « À faire » (`Todo`), « En cours » (`InProgress`), « Programmé » (`Programmed`), « Terminé » (`Done`).
- [ ] Assigné — Select « — Non assigné — » + `marketingUsers` ; l'assigné courant hors équipe marketing est réinjecté dans les options ; désassigner envoie `null` (pas `undefined`).
- [ ] Coût (€) — `ChampNombre` `videVaut="zero"`, centré.
- [ ] Échéance — DatePicker `clearable`, placeholder « — », vidage envoyé en `null`.
- [ ] Liste blanche serveur : `TASK_FIELDS` = name, provider, channel, cost, status, assignedUserId, deadline, startDate, notes, volumetry, openRate, npaiRate, stopRate, clickRate, codTxt, billedAmount (`backend/src/routes/projects.ts:63-67`) — tout autre champ de tâche est jeté en silence. Les champs du **projet** ne passent par aucune liste blanche (`withDates(projectData, …)`), seuls `id`/`createdAt`/`updatedAt` sont retirés (`projects.ts:158-159,183`).

## 6. Actions

- [ ] **Créer** : bouton « Nouveau » (icône +), `canEdit` uniquement → modale → `db.createProject` → ajouté et sélectionné ; journal d'activité « a créé le projet » (`:846-886`).
- [ ] **Éditer** : tout champ → `muterProjet(f)` (`:764-788`) : applique `f` au miroir `projetRef`, **recalcule `progress` et `budgetActual`** (`recalculerProjet`), pose l'état optimiste, pousse l'instantané complet dans `fileSauvegardeProjet` (un seul PUT en vol par projet, coalescence). La réponse serveur n'est réappliquée que si rien n'attend derrière, qu'aucun champ n'a le focus et que le projet est toujours ouvert.
- [ ] **Changer de statut** : bouton segmenté ; aucune entrée au journal d'activité (`:801-819`).
- [ ] **Archiver** : icône Archive → modale « Confirmer l'archivage ? » : « Vous êtes sur le point d'archiver le projet **{nom}**. Il sera déplacé dans la rubrique **"Projets Archivés"** et n'apparaîtra plus dans la liste des projets actifs. » ; « ANNULER » / « OUI, ARCHIVER » → statut `Archived`, journal « a archivé le projet », projet désélectionné (`:821-831,1148-1176`).
- [ ] **Supprimer le projet** : « Supprimer » → confirmation en ligne « Confirmer ? » « OUI » / « NON » (pas de modale) → `db.deleteProject`, journal « a supprimé le projet » ; la confirmation se referme si on change de projet (`:657-659,833-844,1423-1448`).
- [ ] **Ajouter une tâche** : « + AJOUTER UNE TÂCHE » → tâche `{ name: '', channel: '', cost: 0, status: 'Todo' }` ajoutée en fin (`:986-990`).
- [ ] **Supprimer une tâche** : icône corbeille, **sans confirmation** ; visible au survol sur desktop (`:997-1000,2150-2154`).
- [ ] **Trier les tâches** : clic sur en-tête (§ 4).
- [ ] **Ajouter / retirer un membre** (§ 5).
- [ ] **Redimensionner la liste** (glisser la poignée).
- [ ] Pas d'export, pas de duplication, pas d'action en masse, pas de glisser-déposer (hors fichiers Expert), pas de raccourci clavier (hors Entrée/Échap de la modale de création).

## 7. Temps réel et chargement

- [ ] Au montage : `db.getProjects()` + `db.getUsers()` (`:620-622`).
- [ ] `useRealtimeSync(RT_EVENTS.projects, loadProjects)` — événements `projects:updated`, `projects:deleted` (`:644`, `services/realtime.ts:31`).
- [ ] `useRealtimeSync(RT_EVENTS.users, …)` — ne recharge **que** les utilisateurs (`users:updated`, `users:deleted`) (`:651`).
- [ ] `loadProjects` ne réassoit pas le projet ouvert si une écriture est en vol ou si un champ a le focus ; le rattrapage est rejoué quand le dernier champ perd le focus (`:677-697,423-431`).
- [ ] Mode Expert : `RT_EVENTS.projectFiles` (`project-files:updated`) recharge les fichiers (`ExpertPanel.tsx:196`).
- [ ] Aucun état de chargement : la liste affiche l'état vide tant que la requête n'est pas revenue.
- [ ] Indicateur « SAUVEGARDE... » pendant les écritures.

## 8. États vides et erreurs

- [ ] Liste vide : icône dossier + « Aucun projet trouvé » (`:1393-1396`).
- [ ] Aucun projet sélectionné : « SÉLECTIONNEZ UN PROJET » (`:2209-2212`).
- [ ] Aucune tâche : « Aucune tâche définie. Ajoutez des tâches pour piloter le budget et l'avancement. » (`:2161-2163`).
- [ ] Équipe vide : « Aucun membre assigné ».
- [ ] Échec de sauvegarde (`onEchecSauvegarde`, `:717-750`), par `ApiError.status` :
  - [ ] non-`ApiError` : « Échec inattendu de la sauvegarde. »
  - [ ] 0 : « Serveur injoignable. Vos modifications ne sont PAS perdues : elles repartiront à la prochaine sauvegarde — ne fermez pas l'onglet. »
  - [ ] 503 : « La base est momentanément saturée. Plusieurs tentatives ont échoué : réessayez dans une minute. »
  - [ ] 401 : rien (déconnexion gérée par `AuthContext`).
  - [ ] 403 : « Droits insuffisants pour modifier ce projet. »
  - [ ] 404 : « Ce projet n'existe plus (supprimé depuis un autre poste ?). » + désélection + rechargement.
  - [ ] 409 : message serveur ou « Conflit de sauvegarde. Les données ont été rechargées. » + rechargement.
  - [ ] autres : message serveur ou « Échec de la sauvegarde du projet. »
- [ ] Échec de création : « Échec de la création du projet (serveur injoignable ?). » (`:882`).
- [ ] Échec de suppression : « Une erreur est survenue lors de la suppression. » (`:842`).
- [ ] Échec du `GET /api/projects` : non intercepté (pas de message).

## 9. Règles métier touchées

- [ ] **Holding** : tag exclusif dans le formulaire (`toggleBrand`). Dans le filtre Marques, un projet Holding sort sous **toute** marque sélectionnée (`:1046`). L'exclusion des budgets est faite ailleurs (`isHoldingBrand()`, Budget/Dashboard), pas dans cet écran.
- [ ] **Brouillon** : statut par défaut à la création ; l'écran liste les brouillons (filtrable) ; pas d'exclusion ici (la règle « ne remonte nulle part » s'applique aux autres rubriques).
- [ ] **Archivé** : reste compté au budget (classement visuel) — l'écran se contente de filtrer la vue.
- [ ] **Alpine par site / Nissan global** : puces Alpine / Nissan conditionnées à `ALPINE_SITES` / `NISSAN_SITES` (`:1684-1689`) ; la ventilation GROUPE BONY inclut une clé `'Nissan'` (9 %) comme entrée de `sites`/`budgetDistribution` (`constants.ts:546-576`).
- [ ] **Curseurs `alpineShare` / `nissanShare`** : visibles seulement si marque RDM présente, défaut affiché 100, vide = `null` (= 100 % marque). Calcul appliqué par `splitShareToBuckets()` dans `constants.ts` (à réutiliser tel quel).
- [ ] **GROUPE BONY / GROUPE BONY (R/N)** : ventilation pondérée `DISTRIBUTION_GROUPE_BONY` / `_RN` copiée dans `budgetDistribution`, non modifiable. ⚠️ Périmètre de site, à ne pas confondre avec le tag Holding.
- [ ] **PRO+ (`proPlus`) ≠ mode Expert (`expertMode`)** : deux boutons distincts dans le même bloc.
- [ ] Agrégats `progress` / `budgetActual` : source unique `recalculerProjet` (`utils/projet.ts`), à réutiliser en v2.
- [ ] Échéance de tâche = date de référence de la To-do si renseignée (commentaire `:2098-2102`).

## 10. Mobile (sous `md:`)

- [ ] Liste pleine largeur ; masquée quand un projet est ouvert (`hidden md:flex`), détail masqué sinon (`:1180,1408`).
- [ ] Bouton « ← Retour » dans l'en-tête du détail (mobile seulement) (`:1413-1418`) ; « ID: … » masqué.
- [ ] Poignée de redimensionnement masquée ; largeur `100%` (décidée par `window.innerWidth >= 768` au rendu).
- [ ] Grille du détail en une colonne ; statut / période / PRO+ empilés (`flex-col md:flex-row`) ; marges réduites (`p-3 md:p-6 lg:p-10`).
- [ ] Corbeille de tâche toujours visible (au survol seulement sur desktop).
- [ ] Tableau des tâches en défilement horizontal (min 1060 px).
- [ ] Rubrique dans la barre du bas (`MOBILE_BAR_IDS`).

## 11. Défauts et bizarreries relevés (signalés, non corrigés)

- [ ] **Filtre Périmètre à comparaison exacte sur `p.site`** (`:1026-1037`) : un projet multi-sites (`site` = « Clermont, Vichy ») ne sort sous aucun de ses sites ; un projet GROUPE BONY ne sort sous aucun site. Même défaut que la fiche Dépenses du 29/09 de `BUGS-CONNUS.md`.
- [ ] **Entités « Alpine » / « Nissan » du filtre Périmètre ne correspondent à aucun projet** (aucun `site` ne vaut `Alpine`) — pseudo-site Alpine global contraire à la règle « Alpine PAR SITE » (même famille que la fiche Matériel du 29/09).
- [ ] Branches mortes du filtre Périmètre : `'GROUPE BONY'` et les noms de plaque ne peuvent pas être sélectionnés par le picker (il ne pose que des sites).
- [ ] Montluçon et Saint-Etienne proposés à la saisie (« SITES NISSAN », en dur `:1629`) mais absents du filtre Périmètre.
- [ ] **Échéance de tâche non désactivée en lecture seule** : le DatePicker (`:2104-2110`) n'a pas `disabled={!canEdit}` ; la saisie est ignorée en silence par `updateTask`.
- [ ] **Tag Alpine/Nissan orphelin** : retirer le dernier site éligible masque la puce, mais la marque reste dans `brands` et ne peut plus être retirée depuis l'écran.
- [ ] **Alpine + Nissan + RDM : les deux curseurs s'affichent**, alors que la règle 3 (Alpine gagne, `nissanShare` ignoré) rend le curseur Nissan sans effet.
- [ ] Toute bascule manuelle de site **écrase** la répartition saisie (remise à parts égales).
- [ ] Répartition en € calculée sur le **budget réel** (`budgetActual`), pas sur le prévu.
- [ ] `BRAND_DOT` a encore une clé `Groupe` (ancien nom) et pas `Holding` : la puce Holding tombe sur `bg-slate-400` (`:25-32`).
- [ ] `handleNavigation` (`gearbox-navigate`) sélectionne le projet trouvé sans vérifier qu'il correspond à la vue (un projet archivé peut s'ouvrir en vue courante) (`:629-635`).
- [ ] Message d'échec de création resté générique « serveur injoignable ? » alors que la sauvegarde distingue les statuts.
- [ ] Largeur de liste lue sur `window.innerWidth` au rendu, non réactive au redimensionnement de la fenêtre (`:1181`).
- [ ] `GET /api/projects` sans contrôle de rôle (fiche ouverte `BUGS-CONNUS.md:89`).
- [ ] Barre de filtres inline, non migrée vers `CollapsibleFilters` (fiche `BUGS-CONNUS.md:53`).
- [ ] `startDate`/`endDate` du nouveau projet en date UTC (`toISOString`) : décalage possible autour de minuit.

---

## 12. Mode Expert (`Project.expertMode`)

⚠️ Marqueur d'**INTERFACE** : il n'entre dans aucune agrégation et ne change aucun montant. Rien à voir avec `proPlus` (PRO+ B2B, marqueur métier) — `types.ts:115-126`.

### 12.1 Accès et activation
- [ ] Bouton sous le statut : « Activer le mode Expert » (bordure violette) / « Mode Expert actif » (dégradé), icône étincelles ; infobulles « Débloquer les indicateurs, le planning et les fichiers » / « Revenir à la vue simple. Aucune donnée n'est supprimée. » (`Projects.tsx:1516-1536`).
- [ ] Bascule `expertMode` via `muterProjet` (même PUT que le reste) ; **visible uniquement si `canEdit`** ; un rôle en lecture seule voit les modules si le mode est allumé.
- [ ] Éteint : aucun module monté, aucune requête de fichiers (`useProjectFiles` rend `[]`, `ExpertPanel.tsx:185-199`).
- [ ] Changer de projet ou éteindre le mode ferme le détail de tâche (`Projects.tsx:613-616`).

### 12.2 Ajouts dans le tableau des tâches
- [ ] Colonne actions élargie (`w-[92px]`), `min-w` 1112 px (`:1968,1979`).
- [ ] Bouton détail par ligne (icône agrandir) — visible même en lecture seule ; affiche trombone + nombre de fichiers de la tâche et une icône note si `task.notes` ; infobulle « Détail : dates, note et fichiers — N fichier(s) — une note » (`:2126-2149`).

### 12.3 Panneau Expert (`components/expert/ExpertPanel.tsx`)
- [ ] En-tête « MODE EXPERT » + « Pilotage avancé — indicateurs, planning et pièces jointes de ce projet. »
- [ ] Onglets (état local, non persisté, défaut `pilotage`) : « Pilotage », « Planning », « Fichiers » (badge = nombre total de fichiers si > 0) (`:35,47-51`).

### 12.4 Onglet Pilotage (`ExpertKpis.tsx`)
- [ ] Périmètre : tâches dont `status !== 'Empty'` ; « finie » = Done ou Programmed ; aujourd'hui en date locale.
- [ ] Vide : « Aucune tâche engagée : les indicateurs apparaîtront dès la première tâche non « Vierge ». »
- [ ] **À traiter** (sur les tâches restantes) — catégories dépliables, une ouverte à la fois, chaque ligne ouvre la tâche (infobulle « Ouvrir la tâche pour la corriger ») :
  - [ ] « en retard » (rouge) : `deadline < aujourd'hui`, détail = échéance ;
  - [ ] « sans personne assignée » (orange) ;
  - [ ] « à faire sans date » (orange) : sans `deadline` ;
  - [ ] compteur à 0 → coche verte, non cliquable ;
  - [ ] pied : « Rien à corriger : tout est assigné, daté et à jour. » ou « Cliquez un compteur pour dérouler, puis une ligne pour ouvrir la tâche et la corriger. »
- [ ] **Qui fait quoi** (toutes les tâches actives, faites comprises) : par personne avatar, nom (« Non assignées » en orange, toujours en dernier), « faites/total faite(s) », badge « N en retard », barre = faites/total, somme des coûts en € si > 0 ; tri par total décroissant puis € ; pied « Toutes les tâches de chacun, terminées comprises — la barre montre ce qui est fait. »
- [ ] **Où part l'argent** : total € « engagé sur les tâches » ; « % sur les 3 plus grosses lignes » (orange si ≥ 70 %) ; top 4 prestataires (montant + part %, « — non renseigné — » en italique) ; sinon « Aucun coût saisi sur les tâches. » Format `Math.round(n).toLocaleString('fr-FR') €`.

### 12.5 Onglet Planning (`ExpertGantt.tsx`)
- [ ] Tâches `status !== 'Empty'` ; plaçables = `deadline` ou `startDate` ; une **ligne par personne** (tri alphabétique `fr`, non-assignées en dernier) avec nombre de tâches.
- [ ] Barre si `startDate` et `deadline` distinctes ; sinon **jalon** (losange). Fenêtre = min/max des dates de tâches ET des bornes du projet, ± 2 jours ; graduations au 1er de chaque mois (« janv. 26 » …) ; trait orange « aujourd'hui ».
- [ ] Couleurs : rouge = en retard (non finie, échéance passée), vert = terminée, dégradé / violet sinon.
- [ ] Libellés de jalons placés sur 4 crans (−17, 17, −32, 32 px) sans collision, largeur mesurée au canvas, max 150 px ; masqué si aucun cran libre (infobulle seulement).
- [ ] Infobulle : « nom — du {début} au {échéance} (en retard) ». Clic barre / losange / libellé = ouvre la tâche.
- [ ] Légende : « Barre : début → échéance », « Jalon : échéance seule », « Terminé », « En retard », « Aujourd'hui ».
- [ ] Encadré « N tâche(s) sans date — absente(s) du planning » avec boutons par tâche.
- [ ] Vide : « Aucune tâche datée. Renseignez une échéance — et, pour une vraie barre, une date de début — dans le détail d'une tâche. »
- [ ] Largeur min 680 px, défilement horizontal.

### 12.6 Onglet Fichiers (`ExpertPanel.tsx:110-170`, `ExpertFiles.tsx`)
- [ ] « Fichiers du projet » (fichiers sans `taskId`) : zone de dépôt (si `canEdit`) « Choisir un fichier ou glisser-déposer », « Tous formats, 100 Mo maximum », sélection multiple.
- [ ] « Fichiers rattachés à une tâche » + compteur : groupes par tâche (nom cliquable → ouvre la tâche), listés en lecture (`canEdit={false}`), pied « Pour en ajouter ou en retirer un, ouvrez la tâche concernée. »
- [ ] Carte fichier : vignette si image, sinon icône de famille (pdf, tableur, document, archive, media, autre) ; nom, poids (`formatPoids`), avatar + nom du déposant ; « Télécharger » (nom d'origine) ; « Supprimer définitivement » si `canEdit`, avec `confirm('Supprimer définitivement « {nom} » ?')`.
- [ ] Envoi en deux appels : `db.uploadFile('project', f)` (route uploads) puis `db.addProjectFile(projectId, { url, fileName, fileSize, taskId })` ; contrôle client 100 Mo (`MAX_OCTETS`, aligné sur `backend/src/routes/uploads.ts`).
- [ ] Messages : « Envoi de N fichier(s)… », « « {nom} » dépasse 100 Mo et n'a pas été envoyé. », « Échec de l'envoi de « {nom} ». », « Échec de la suppression (serveur injoignable ?). », vide « Aucun fichier pour le moment. » (éditeur) / « Aucun fichier déposé. » (lecture).
- [ ] Échec de chargement de la liste : silencieux (liste vide).

### 12.7 Détail de la tâche (`TaskDetailPanel.tsx`)
- [ ] Panneau latéral droit 420 px (plein écran < `sm`), voile cliquable qui ferme, bouton X.
- [ ] En-tête : « Détail de la tâche », nom (« Sans nom »), assigné (avatar + nom ou « Non assignée »), coût en € si > 0.
- [ ] « Fenêtre de réalisation » : DatePicker « Début » (`startDate`) et « Échéance » (`deadline`), `clearable`, vidage → `null` ; aide : « Les deux dates sont posées : la tâche apparaît en barre dans le planning. » / « Sans date de début, la tâche se place en jalon sur son échéance. » / « Sans échéance, la tâche n'apparaît pas dans le planning. »
- [ ] « Note » : textarea, placeholder « Compte rendu, contraintes, points de vigilance, contacts… », enregistrée **au blur** (trim, `null` si vide, pas d'envoi si inchangée) ; « Enregistrée en quittant le champ. » si `canEdit`.
- [ ] « Fichiers de la tâche » + compteur : `ExpertFiles` compact avec `taskId`.
- [ ] Écriture via `updateTask` de la page → `muterProjet` ; `startDate` et `notes` sont dans `TASK_FIELDS`. Ces champs ne sont lus nulle part ailleurs (ni To-do, Agenda, Campagnes, Export — `types.ts:80-83`).

### 12.8 Bizarreries du mode Expert
- [ ] DatePicker « Début » / « Échéance » du détail **non désactivés en lecture seule** (saisie ignorée en silence).
- [ ] Une tâche avec `startDate` seule est placée en jalon sur sa date de début, alors que l'aide dit « Sans échéance, la tâche n'apparaît pas dans le planning. »
- [ ] Si aucune tâche n'est plaçable, le Planning affiche le message vide **sans** l'encadré des tâches sans date (retour anticipé `ExpertGantt.tsx:223`).
- [ ] L'onglet actif du panneau Expert n'est pas réinitialisé au changement de projet (composant non remonté).
- [ ] Commentaire d'en-tête de `TaskDetailPanel.tsx:16-19` périmé (parle d'un PUT à chaque frappe, supprimé par `ChampDiffere`).
- [ ] Deux comptes « sans date » différents dans le même écran (Pilotage : à faire sans échéance ; Planning : toutes tâches sans aucune date) — assumé dans le code (`ExpertKpis.tsx:194-197`).
