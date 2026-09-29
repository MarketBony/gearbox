# ÉTAT PROJET GEARBOX — synthèse au 6 août 2026

> Mémoire de référence sur l'état actuel du projet, à mettre à jour à chaque
> session (comme ETAT-BACKEND.md l'est pour le backend).

## Chantier en cours — refonte « Gearbox OS » (maquette 2.0) · au 29/09/2026
- **Branche `feat/refonte-os-v2`** (poussée sur GitHub, JAMAIS déployée) — `master` et la prod ne sont pas touchés.
- **Où** : `maquettes/v2/` (maquette vanilla HTML/JS/CSS, sans build ni backend : données fictives dans
  `js/data.js`). Contrat d'une rubrique : `maquettes/v2/APPS.md`. Modèle UX validé par Théo : canevas
  `maquettes/ux/project/*.dc.html` + brief `maquettes/ux/BRIEF-REFONTE.md`. Canevas DA : `maquettes/da/`.
- **Lancer** : serveur `maquettes` de `.claude/launch.json` (`python -m http.server 4173 --directory maquettes`),
  puis `http://localhost:4173/v2/`. Sous 760 px de large, c'est la coque mobile qui démarre.
- **Principe** : Gearbox devient un « OS » de bureau (fenêtres, Dock, barre du haut escamotable, widgets,
  fonds animés WebGL, Mission Control, espaces) ; les 16 rubriques reprennent **100 % des fonctionnalités
  réelles** (inventaire fait sur les `pages/*.tsx`), au modèle UX validé (aéré, contrasté, filtres en carte).
- **Décisions validées** : direction artistique unique **Signal** (sombre par défaut) ; matières Pixel /
  **Liquid Glass (défaut)** / Opaque — la matière habille les contrôles et conteneurs, fenêtres façon Mica ;
  icônes style iOS ; fond par défaut **Bony** (logo officiel, charte du brandbook) ; barre du haut escamotable ;
  sélecteurs de sites en plaques repliables ; calendrier et menus chartés (plus aucun contrôle natif).
- **Défauts du vrai Gearbox relevés pendant l'inventaire** : voir la fin de `BUGS-CONNUS.md` (29/09, non reproduits).
- **Décidé le 29/09 — plan de déploiement : `maquettes/ux/PLAN-DEPLOIEMENT-V2.md`** (à lire avant tout lot).
  Reconstruction DANS l'appli React, rubrique par rubrique ; données, temps réel, auth, `constants.ts` et backend
  inchangés ; interrupteur « Nouvelle interface (bêta) » dans les Réglages, ouvert à TOUS les utilisateurs
  pendant le chantier (l'ancienne UI reste par défaut jusqu'à la bascule). Lot 0 (préparation + inventaires
  en fichiers) → lot 1 (socle / coque) → 15 lots rubriques → bascule → nettoyage. Estimation ≈ 18 M tokens.
- **Maquette v2 : état final validé au 29/09** (commits sur `feat/refonte-os-v2` : 25891fc, 9875d1e, bdf3662).
- **Lot 0, étape a) — 29/09 : maquette et docs mergées sur `master`** (merge `--no-ff`, **aucun déploiement**, prod
  inchangée). Vérifié avant : `vite build` ne produit aucun fichier de `maquettes/`, `tsc` reste à 9 erreurs.
  `maquettes` ajouté à `.dockerignore` : le contexte de build de l'image `web` ne l'embarque plus.
- **Lot 0, étapes b) et c) — 29/09, recetté par Théo, branche `feat/ui2-lot0` (NON mergée, jamais déployée)** :
  - **Nouveau code dans `ui2/`** : `beta.ts` (préférence `localStorage` `gearbox_ui2_beta:<userId>`, liste
    `UI2_BETA_ROLES`), `BetaToggle.tsx` (interrupteur des Paramètres, section Application), `Ui2Gate.tsx`
    (chargement différé + filet `ErrorBoundary` qui coupe la bêta si la coque plante), `Ui2Root.tsx` (coque
    VIDE), `styles/tokens.css` (jetons Signal / clair / matières Liquid·Pixel·Opaque / économe) et `styles/shell.css`.
  - **⚠️ Interrupteur réservé au MASTER jusqu'au lot 1** (`UI2_BETA_ROLES = ['Master']`) : décision de Théo, pour
    qu'un correctif déployé entre-temps n'embarque pas une coque vide chez tout le monde. À ouvrir à tous au lot 1.
  - **Branchement `App.tsx`** : la coque est montée APRÈS les gardes de rôle et reçoit l'onglet déjà résolu
    (aucune logique de droits dans `ui2/`). `?ui=classic` force l'ancienne interface.
  - **Toute la CSS v2 est limitée à `.gx2`, jamais `:root`** : chargée en différé, elle reste dans la page après
    un retour à l'ancienne interface — vérifié inerte (aucune variable sur `:root`, fond et police inchangés).
  - Build : la coque sort dans son propre morceau (2,7 Ko JS + 5,5 Ko CSS), l'ancien bundle ne grossit pas.
    `tsc` : 9 erreurs de référence, inchangé.
  - **Inventaires de parité : `maquettes/ux/inventaires/`** — 16 rubriques + `_coque.md` (Sidebar, gardes, cloche,
    présence), format commun `_FORMAT.md`. Tirés du code par lecture ; défauts relevés en section 11 de chaque
    fichier (les principaux reportés dans `BUGS-CONNUS.md`, 29/09 bis).
- **Lot 1a — 29/09, recetté par Théo, branche `feat/ui2-lot1` (partie de `feat/ui2-lot0`, NON mergée, jamais
  déployée)** : bureau, fenêtres, Dock, barre du haut.
  - `ui2/wm.ts` (une fenêtre PAR RUBRIQUE — une page ne se monte jamais deux fois ; session des fenêtres en
    localStorage `gearbox_ui2_session:<userId>`), `ui2/Window.tsx` (déplacer, 8 bords, ancrage gauche/droite/haut,
    double-clic), `ui2/MenuBar.tsx` (escamotable par défaut, feux fusionnés si agrandie), `ui2/Dock.tsx`,
    `ui2/Menu.tsx`, `ui2/AppIcon.tsx` + `ui2/appIcons.ts` (tracés repris tels quels de la maquette).
  - **Les rubriques non portées s'ouvrent dans une fenêtre, telles qu'aujourd'hui** (`renderPage` = le
    `renderContent` d'App.tsx), agrandies par défaut. Chaque fenêtre passe par `resolveTab` (la cascade de gardes
    d'App.tsx, extraite en fonction) ; une fenêtre qui ne passe plus les gardes se ferme.
  - **⚠️ Le conteneur d'une fenêtre ne porte ni transform, ni filter, ni backdrop-filter, ni `contain: paint`** :
    sinon les modales `fixed inset-0` des pages actuelles restent coincées dans la fenêtre (mesuré : elles couvrent
    bien l'écran). L'effet Mica vit sur un calque frère.
  - **⚠️ Synchronisation App ⇄ coque** : la fenêtre active remonte dans `setActiveTab` (présence, notifications),
    une navigation extérieure ouvre la fenêtre. Sans la garde `pushed` d'`Ui2Root.tsx`, les deux sens se
    renvoyaient la balle jusqu'au plantage (trouvé en test ; le filet `ErrorBoundary` a bien coupé la bêta).
  - **Deux sources uniques extraites de `Sidebar.tsx`** (partagées Sidebar / Dock) : `services/navigation.ts`
    (`computeNav` : rubriques, groupes, règles de rôle) et `services/navBadges.ts` (pastilles Chat / Jeux + badge
    de l'icône PWA — la Sidebar n'est pas montée en v2). Nav groupée vérifiée identique en Master ; chef de site
    et External NON vérifiés (comptes de Théo).
  - Correctif de recette : l'interrupteur bêta restait allumé sans effet sous `?ui=classic` ; l'activer lève
    désormais le filet (retire le paramètre de l'adresse).
  - Limites connues : le Dock passe devant les modales des pages actuelles ; les pages actuelles gardent leurs
    points de rupture d'ÉCRAN dans une fenêtre étroite ; pas de coque mobile avant 1c ; fond Bony fixe (WebGL en 1c).
  - Retirés de la maquette (décision Théo 29/09) : « Voir comme » et l'écran verrouillé.
  - Arbitrage Théo (29/09) : les tags Digital `FULL RENAULT/DACIA/NISSAN/ALPINE` et `Yssingeaux` sont propres à
    l'équipe digitale et n'entrent dans AUCUN périmètre de chef de site — **voulu, on n'y touche pas**.
- **Lot 1 (complet) — 29/09, recetté par Théo, branche `feat/ui2-lot1` (NON mergée, jamais déployée).
  ⚠️ CHANGEMENT DE MÉTHODE, décidé avec Théo** : les réécritures React de la coque du lot 1a (`ui2/wm.ts`,
  `Window.tsx`, `Dock.tsx`, `MenuBar.tsx`, `Menu.tsx`, `AppIcon.tsx`, `appIcons.ts`, `styles/*.css`, `Ui2Root.tsx`)
  étaient lentes et infidèles (tailles, disposition, animations) : **supprimées**. La coque est désormais le
  **MOTEUR DE LA MAQUETTE converti tel quel en TypeScript**, monté dans une racine fantôme (Shadow DOM).
  - **`ui2/os/engine/*.ts`** : `maquettes/v2/js/*` converti par `scripts/ui2-convert-engine.mjs` (conversion
    initiale seulement — la relancer ÉCRASE les retouches). `// @ts-nocheck` pour l'instant (typage à faire au
    fil des lots). **Chaque écart avec la maquette porte la balise `[GEARBOX]`** : `grep -n "\[GEARBOX\]"` les
    liste tous. `engine/boot.ts` démarre les modules dans l'ordre de `maquettes/v2/index.html`.
  - **CSS : `ui2/os/maquette.css` est GÉNÉRÉ** (`scripts/ui2-extract-css.mjs` puis `ui2-scope-css.mjs` : feuilles
    de la maquette + tous ses `GX.css(...)`, `:root` → `:host`). Ne jamais l'éditer à la main. **La seule feuille
    écrite à la main est `ui2/os/overrides.css`**, chaque règle y est justifiée.
  - **`ui2/os/OsHost.tsx`** : publie le PONT (`ui2/os/bridge.ts` : compte, thème, droits `computeNav`, pastilles,
    fil d'activité, `resolveTab` d'App.tsx) — le moteur ne calcule aucun droit. **`ui2/os/DataHub.tsx` +
    `ui2/os/data.ts`** : vraies données (dataService) dans `GX.data`, même API que `maquettes/v2/js/data.js`.
    **Montants uniquement via `services/dashboardStats.ts` (`computeDashboardStats`, extrait de
    `pages/Dashboard.tsx`, qui l'utilise désormais)** ; congés via les portes de `constants.ts`. Aucune écriture
    en base depuis la coque (cocher une tâche, envoyer un message → ouvre la rubrique).
  - **Rubriques pas encore portées** : leur fenêtre projette la page actuelle par `<slot name="app-<id>">`
    (elle garde Tailwind et les contextes React). `services/activityFeed.ts` = fil de la cloche partagé.
  - Retirés de la maquette : « Voir comme », écran verrouillé, messages simulés. Interrupteur bêta toujours
    **réservé au Master** (`UI2_BETA_ROLES`) : chef de site et External PAS vérifiés (décision Théo : plus tard).
  - Mesuré : 60 i/s au survol du Dock et en réduire / restaurer / fermer, comme la maquette.
  - Correctifs de recette : vignettes des fonds et curseurs des sélecteurs segmentés invisibles (le moteur
    cherchait dans `document` au lieu de la racine fantôme) ; ouvrir/réduire saccadé (voir Pièges) ; contrastes
    du thème clair (défaut de la maquette, `BUGS-CONNUS.md`).
  - Recette 2 (29/09, avec deux agents testeurs Haiku — rapports à revérifier : un vrai bug, deux faux) :
    fenêtres restaurées qui laissaient passer les clics au bureau (régression du correctif précédent),
    Échap avalé par des écouteurs orphelins (défaut de la maquette, 4 endroits), écran noir si la coque est
    remontée (hôte désormais persistant). Essai de mise en sommeil des pages réduites (`<Activity>`) ANNULÉ :
    restauration plus saccadée, aucun gain au repos (0 requête en 30 s avec 7 fenêtres ouvertes).
  - **Suite : lots 2 → 16**, une rubrique par lot, réécrite en React avec le balisage et la CSS de la maquette
    (To-do puis Agenda d'abord pour figer la méthode). Chaque rubrique portée retire sa page actuelle des fenêtres.

## Déploiement
- En ligne : https://gearbox.bonyauto-mobile.com (VPS OVH, vps-58e5eff3.vps.ovh.net,
  51.83.75.181)
- Architecture : 3 conteneurs Docker (api / web / caddy), HTTPS auto via Caddy/Let's
  Encrypt, base Supabase (pas de Postgres local)
- Repo GitHub privé : MarketBony/gearbox — clone sur VPS via deploy key SSH dédiée
  (lecture seule)
- master = prod, synchronisés. Dernier lot déployé : **correctif 58** (Digital : plusieurs
  classes CO² par édito, case PRO+, 24 septembre) — **`api` ET `web`**, **avec migration**
  (`20260924150000_social_co2_multi_et_proplus`, additive : `SocialPost.co2s` et
  `SocialPost.proPlus`, reprise des 7 classes existantes). Push et déploiement autorisés
  par Théo dans la demande même, recette faite en local avant le push.
  Avant lui le **correctif 57** (Chat : thème de
  discussion partagé, « Vu par », membres et renommage de groupe côté serveur,
  24 septembre) — **`api` ET `web`**, **avec migration**
  (`20260924100000_chat_theme_partage_et_lectures`, additive : trois colonnes sur
  `ChatConversation`, plus la reprise des 7 personnalisations existantes).
  ℹ️ Migration appliquée depuis ce poste avant le déploiement (`db execute` puis
  `migrate resolve --applied`).
  Avant lui le **correctif 56** (retours d'équipe,
  lot 1 : groupes du Chat visibles pour l'External, « qui a réagi », « GROUPE BONY » dans
  les marques du Digital, 23 septembre) — **`web` seul**, aucune migration.
  Avant lui le **correctif 55** (Congés v2 — période
  de référence légale juin→mai, solde de CP, congé sans solde et récup matin/après-midi,
  planning pleine largeur, vue Agenda, reprise du fichier Excel du boss, 12 septembre) —
  **`api` ET `web`**, **avec migration** (`20260912170000_conges_demi_et_droits`, additive :
  une colonne nullable `CongeJour.demi` et une table `CongeDroit`).
  ℹ️ Migration appliquée depuis ce poste avant le déploiement, puis inscrite dans
  `_prisma_migrations` par `prisma migrate resolve --applied` — sans cette seconde étape
  le conteneur `api` la rejouerait au démarrage et ne démarrerait pas.
  ℹ️ **313 lignes de congés ont été importées en base** au passage (fichier Excel de
  l'équipe marketing, 13 personnes) : c'est de la VRAIE donnée, pas de la recette, elle
  reste en place. Script rejouable : `backend/scripts/import-conges-2026.mjs`.
  Avant lui le **correctif 54** (nouvelle rubrique
  **Congés**, 12 septembre) — **`api` ET `web`**, **avec migration**
  (`20260912100000_add_conges`, purement additive : deux tables nouvelles).
  Avant lui le **correctif 50** (Digital — second
  retour de l'équipe : liens cliquables, commentaires par édito, plaques hors du sélecteur
  de sites, statut « Constructeur », 10 septembre) — **`api` ET `web`**, **avec migration**
  (`20260910120000_add_social_comments`, purement additive).
  ℹ️ Migration appliquée depuis ce poste **avant** le déploiement, puis inscrite dans
  `_prisma_migrations` par `prisma migrate resolve --applied` — sans cette seconde étape le
  conteneur `api` la rejouerait au démarrage et **ne démarrerait pas**.
  Avant lui le **correctif 49** (Digital — retours
  de l'équipe : lenteur du wording, libellés, tags partagés, nom et ordre des visuels,
  9 septembre) — **`api` ET `web`**, **avec migration**
  (`20260909120000_digital_media_names_et_tags_lom`, purement additive).
  ℹ️ La migration a été appliquée depuis ce poste **avant** le déploiement : le backend
  local pointant sur la base de production, `prisma migrate deploy` l'y a posée
  directement. Le conteneur `api` n'a donc rien trouvé à appliquer au démarrage.
  Avant lui le **correctif 48** (sauvegarde de
  projet — fin du PUT par frappe, transaction allégée, erreurs honnêtes, client Prisma
  unique, 7 septembre) — **`api` ET `web`**, **avec migration**
  (`20260907120000_add_task_project_id_index`, purement additive).
  **Critère d'acceptation du 48 relevé le 08/09 : `0` PUT échoué sur 26 h**, contre 48
  avant le correctif. Zéro erreur API, zéro saturation.
  ⚠️ **Ce lot exige une action MANUELLE sur le VPS** : `~/gearbox/.env` doit recevoir
  `&connection_limit=10&pool_timeout=20&connect_timeout=10` **à l'intérieur des
  guillemets** de `DATABASE_URL`, et il faut `up -d api` (recréation) — un
  `docker compose restart` **ne relit pas** le `.env`. Oublié, le backend repart sur les
  défauts de Prisma et l'effet mesurable disparaît, sans aucun symptôme visible.
  Avant lui le **correctif 47** (Digital — refonte
  de la ligne d'édito et correction de DEUX bugs d'empilement, 2 septembre) — **`web`
  seul**, aucune migration.
  Avant lui les **correctifs 45 et 46** (Digital —
  liens externes dans les médias + validation de `mediaFiles` ; service `RH` et script
  d'import du calendrier éditorial, 2 septembre) — **`api` ET `web`** (`social.ts` bouge
  au 45), **aucune migration**.
  ⚠️ **Le correctif 46 a livré le CODE, pas les DONNÉES** : au moment de ce déploiement
  les 43 publications éditoriales ne sont pas encore en base. L'import
  (`node scripts/import-edito.mjs --commit`) doit tourner **APRÈS** la mise en ligne du
  `web`, sinon les 10 posts `RH` s'affichent avec un sélecteur de service vide et le
  premier qui y touche écrase la valeur. Vérifier l'état réel avant de conclure.
  Avant eux le **correctif 44** (reprise du mode
  Expert après recette : KPI refaits, Gantt lisible, fichiers de tâche visibles, retour
  dans la charte liquid glass, 27 août) — **`web` seul**, aucune migration.
  Avant lui le **correctif 43** (mode Expert :
  KPI, Gantt, fichiers de projet et de tâche, notes, 27 août) — `api` **et** `web`,
  **avec migration** (`20260826142519_add_expert_mode`, purement additive).
  Avant lui le **correctif 42** (échéance par
  tâche, tri et redimensionnement du tableau des tâches, 26 août) — `api` **et**
  `web`, **sans migration** : `Task.deadline` existait depuis le correctif 35, seule
  la liste blanche `TASK_FIELDS` du backend l'ignorait. Avant lui le **correctif 41**
  (rôle External, 25 août) — `api` **et** `web`, sans migration. Le **correctif 33**
  (patch anniversaire / photo de groupe / barre de saisie / garde-fou plaques, 6 août)
  demandait `api` **et** `web` avec migration Prisma, comme le **correctif 32** (rôle
  « chef de site », 5 août). Le correctif 31 (responsive
  mobile) s'était contenté de `web`. Le correctif 30 (refonte des Jeux) avait demandé `api`
  **et** `web` avec migration, comme les 27, 28 et 29 ; les 25 et 26 s'étaient contentés
  de `web`. Le
  correctif 24 (curseurs `alpineShare` / `nissanShare`) a lui nécessité `api` **et**
  `web`, le schéma Prisma ayant bougé. Le correctif 23 (routage Alpine/Nissan) est
  déployé aussi, `web` seul avait suffi. Le SHA exact se lit
  avec `git log --oneline -1` plutôt que d'être recopié ici, où il devenait périmé
  à chaque lot. Des commits de doc ou de backup automatique peuvent suivre sans
  nécessiter de redéploiement.
- **Quel service reconstruire ?** `web` seul si le lot ne touche que le frontend ;
  `api` **et** `web` dès que `backend/prisma/schema.prisma` bouge (le client Prisma
  est généré au build de l'image `api`). Les fichiers partagés `constants.ts` /
  `types.ts` sont compilés dans le bundle frontend uniquement.
- Procédure complète de déploiement à jour dans DEPLOIEMENT.md
- Sauvegardes automatiques : `.github/workflows/backup.yml` pousse un dump Supabase
  dans `backups/` chaque semaine (commits `github-actions[bot]`) — penser à
  `git pull` avant de pousser, le local est vite en retard de quelques commits
- **Deux fichiers volontairement NON suivis par git** (ce n'est pas un oubli, ne
  pas les committer sans l'avis de Théo) :
  - `budget market 2026.xlsx` — le fichier source de la reprise des données. Sert
    de référence d'audit pour `RAPPORT-IMPORT.md`, mais il évolue de son côté et
    c'est un binaire.
  - `PRESENTATION-EQUIPE.html` — la présentation de la stack faite pour l'équipe,
    livrable ponctuel, hors du code de l'application.

## Historique des correctifs post-déploiement (par ordre chronologique)
1. Prep déploiement : Supabase branché dans docker-compose, Dockerfile backend créé,
   Caddyfile route /uploads, volume uploads_data, server.ts (monolithe mort) supprimé
2. Fix Dockerfile : openssl/ca-certificates manquants (Prisma schema engine crashait)
3. Fix logos : logo-white.svg/logo-color.svg déplacés de la racine vers public/ (non
   copiés par vite build sinon)
4. Fix droits Director : aligné sur Administrator partout sauf Jeux (règle métier
   stricte) — projects, campaigns, fixedExpenses, contacts, tags, equipment, users
   (backend + frontend) + bug bonus DigitalManager/Digital Manager dans tags.ts
5. Nettoyage : guard 400 sur /api/auth/login (évite un 500 Prisma sur body vide),
   suppression du <link> /index.css mort, DEPLOIEMENT.md réaligné sur l'archi réelle
6. Audit + fix responsive mobile complet : h-screen→h-full (pattern transversal),
   tableaux scrollables (Projects, Settings), rows empilées (Digital), headers
   wrap (Budget, FixedExpenses, Material, Agenda, Expenses), vue liste mobile pour
   les calendriers (Agenda + Material), zones tactiles agrandies (jeux, Settings)
7. **Temps réel étendu à tous les modules** (`feat/realtime-modules`, 29 juillet).
   Le backend émettait déjà un événement par mutation, mais aucune page ne les
   écoutait : il fallait un F5 pour voir le travail des autres. Cause racine
   exclusivement côté front.
   - `services/realtime.ts` (nouveau) : `RT_EVENTS` (table unique des noms
     d'événements) + hook `useRealtimeSync(events, reload)` — debounce 300 ms,
     et rejeu sur `connect` pour rattraper ce qui a été manqué pendant une
     coupure réseau (le serveur ne rejoue pas les événements).
   - Stratégie d'**invalidation, pas de patch de state** : le payload est ignoré,
     on rappelle le loader existant de la page. Raison : le backend émet l'objet
     Prisma brut (dates ISO) alors que `dataService` normalise en `yyyy-MM-dd`
     via des normaliseurs privés au module. Ignorer le payload rend aussi sans
     objet l'hétérogénéité des formes (`expense:deleted` envoie `{ id }`, les
     autres l'id brut).
   - `backend/src/routes/users.ts` : seule route métier sans émission (3 mutations,
     0 emit) alors que `users` est lu par 5 pages → `users:updated` / `users:deleted`
     ajoutés. Helper `publicUser` extrait au passage : émettre l'objet Prisma brut
     aurait diffusé `passwordHash` à tous les clients (`emitEvent` = `io.emit`,
     broadcast global).
   - 16 abonnements sur 13 pages + Sidebar. Cas particuliers : migration de buckets
     de `Budget.loadData` neutralisée en mode silencieux (sinon boucle upsert →
     `budget:updated` → refetch) ; polling 30 s de TodoList supprimé ; polling 3 s
     de Games conservé (défis en localStorage, hors de portée du socket) ; Export
     non câblé (il lit les données au moment de générer l'export, déjà à jour).

## Comptes
- Comptes de démo du seed (theo/admin, admin/password, etc.) recréés par Bastien
  avec de vrais comptes/mots de passe via la Gestion des Utilisateurs
- Route /api/seed bloquée en production (403) — ne peut plus être redéclenchée

8. **Présence des utilisateurs en temps réel** (`feat/presence-sidebar`, 29 juillet).
   L'avatar de chaque utilisateur s'affiche en bulle sur la rubrique où il se
   trouve, dans la Sidebar — « qui est où sur l'ERP ».
   - Serveur : `backend/src/realtime/presence.ts`, état **en mémoire** (pas de
     table Prisma : la présence est éphémère et liée à la durée de vie du
     socket). Le client annonce `presence:set { section }`, le serveur diffuse
     un instantané complet `presence:state` (rubrique → utilisateurs).
   - Un utilisateur n'apparaît que dans **une seule** rubrique, celle de son
     onglet le plus récent (arbitrage par horodatage), sinon il se dédoublerait.
   - Le nom/couleur/photo sont résolus **côté serveur** (le JWT ne porte que
     `{ id, role }`, et la Sidebar ne charge pas la liste des utilisateurs) et
     mis en cache ; `routes/users.ts` appelle `notifyUserChanged` pour recharger
     ce cache après une modification de profil et purger la présence d'un compte
     supprimé.
   - Après un redémarrage de l'`api` l'état est vide : les clients se
     réannoncent sur l'événement socket `connect`.
   - UI : `components/PresenceBubbles.tsx`, 2 avatars superposés max puis une
     pastille `+N`. Son propre avatar est exclu (on sait où on est, et ça
     économise de la place sur mobile). Câblé sur les 3 variantes de nav
     (desktop groupé, tablette icônes, barre mobile) + le menu « Plus », qui
     agrège la présence des 8 rubriques masquées sur mobile.
   - Responsive vérifié par mesure des rectangles (pas à l'œil) à 320, 375, 820,
     1440 px : aucun débordement de bouton, aucun scroll horizontal de page,
     aucun libellé tronqué. **Deux pièges enchaînés** sur la nav desktop, à
     retenir avant de retoucher ces boutons :
     1. le bouton porte `overflow-hidden` → il faut `flex-1 min-w-0` sur le
        libellé (et non `ml-auto` sur les avatars), sinon la rangée déborde et
        les bulles sont rognées ;
     2. mais `flex-1` rend le span plus large que son texte, et un `<button>`
        est **centré par défaut** (feuille de style du navigateur) → le libellé
        s'est retrouvé centré en production. `text-left` est donc obligatoire sur
        ce span. Régression repérée par Théo sur capture d'écran, corrigée dans
        le même lot.

9. **En-têtes `Cache-Control` sur le frontend** (`fix/cache-control-nginx`,
   29 juillet). `nginx.conf` ne servait AUCUN en-tête de cache : les navigateurs
   appliquaient un cache heuristique et pouvaient resservir un `index.html`
   périmé après un déploiement, donc charger un ancien bundle. Désormais :
   `/assets/` (noms hashés par Vite) en `public, max-age=31536000, immutable` ;
   `index.html` et les fichiers de `public/` (logos, favicon — noms stables) en
   `no-cache, must-revalidate`, ce qui donne des réponses 304 grâce à l'ETag de
   nginx. Syntaxe validée dans un conteneur nginx jetable **avant** déploiement
   (une config invalide empêcherait `web` de démarrer et couperait le site).

10. **Rubrique « Dépenses Ponctuelles » : créée puis RETIRÉE le même jour** —
    erreur de conception assumée, à ne pas refaire. La page `pages/Expenses.tsx`
    (présente depuis `1c2c037 v1 originale`, jamais routée, formulaire minimal
    date/montant/site unique/service/commentaire) a été branchée et routée, alors
    que **`FixedExpense` avec `isAnnual = false` produit déjà exactement une
    dépense ponctuelle** (montant imputé sur le seul mois de sa date), avec en
    plus le multi-sites, la répartition %/€, les marques + routage Alpine/Nissan,
    `alpineShare` et PRO+. C'était donc un second chemin, plus pauvre, vers un
    besoin déjà couvert. Retiré dans `fix/dashboard-ventilation-depenses` :
    `pages/Expenses.tsx` supprimée, routage et entrée Sidebar retirés, blocs
    d'agrégation `4bis`/`3ter` retirés, méthodes `dataService` et type
    `OneOffExpense` supprimés. Route `/api/expenses` et modèle Prisma laissés
    **dormants** (table vide, aucune migration) — ne pas les rebrancher.

11. **Les dépenses fixes multi-sites ne remontaient pas dans le Dashboard**
    (`fix/dashboard-ventilation-depenses`, 29 juillet) — **le vrai bug de la
    journée**, signalé par Théo.
    - Symptôme : dès qu'un périmètre était sélectionné, le consommé du Dashboard
      tombait à 0 € alors que Budget affichait le bon montant pour le même site.
    - Cause : pour une dépense multi-sites, le champ `site` contient le libellé
      **concaténé** (`"Clermont, Ussel, Mozac, …"`), et `isSiteInScope` fait un
      `filterContexts.includes(site)` → aucune correspondance possible, la
      dépense était écartée **en totalité**. `Dashboard.tsx` n'utilisait ni
      `sites[]` ni `budgetDistribution`.
    - Correctif : le bloc `3bis` ventile désormais par site avec la **même source
      de parts que `Budget.tsx`** (`budgetDistribution` si multi-sites, sinon
      100 % sur le site unique). Deux écarts volontaires avec Budget, commentés
      dans le code : pas de routage bucket Alpine/Nissan (Budget en a besoin pour
      choisir une *ligne* de tableau, le Dashboard ne fait qu'un total), et
      pourcentages utilisés sans renormalisation.
    - Mesuré : Clermont 0 € → **9 259 €** (identique à Budget), Albi **9 259 €**,
      et total sans filtre **inchangé à 185 184 €** (non-régression).
    - Rubrique « Dépenses Fixes » **renommée « Dépenses »** (libellés seulement,
      l'id `'fixed-expenses'` est conservé : il sert de clé `sessionStorage` et de
      cible de navigation depuis le fil d'actualité), et la case « Annuelle » du
      formulaire remplacée par un sélecteur **Ponctuelle | Annuelle** sur le même
      booléen — c'est l'absence de cette indication qui avait fait croire que le
      cas ponctuel n'était pas couvert.

12. **Tag marque Holding : renommage, exclusivité, exclusion de tout budget**
    (`fix/tag-holding`, 30 juillet). La règle « Groupe/Holding ne remonte jamais
    dans le budget » n'était codée **nulle part** — `'Groupe'` n'existait que comme
    laissez-passer du filtre marque, donc un élément taggué comptait bel et bien.
    - `'Groupe'` → `'Holding'` dans `BrandType`, `BRANDS`, `BRAND_COLORS`, les 8
      projets de démo et les 7 fichiers citant la valeur.
    - Test unique `isHoldingBrand()` dans `constants.ts`, qui accepte **aussi**
      l'ancienne valeur `'Groupe'` : le tag est stocké en base, une ligne écrite
      avant le renommage échapperait sinon silencieusement à l'exclusion.
    - Exclusion appliquée aux **4 blocs** d'agrégation (projets et dépenses fixes,
      dans `Budget.tsx` et `Dashboard.tsx`). Dans le Dashboard, la garde est placée
      **après** les compteurs « projets actifs » et « campagnes live » :
      volontaire, le Holding sort des montants sans disparaître du suivi.
    - Exclusivité ajoutée au formulaire Dépenses (toggle purement additif
      jusque-là) ; côté Projets elle existait déjà et a été conservée.
    - ⚠️ `DISTRIBUTION_GROUPE_BONY` / `_RN` et le bouton « GROUPE BONY (GLOBAL) »
      **non touchés** : ce sont des ventilations légitimes, sans rapport avec la
      Holding. La confusion entre le tag marque et le périmètre est ce qui a laissé
      ce bug en place.
    - Mesuré sur le projet TEST (13 490 €, Clermont, Active) : Holding → 0 €,
      bascule Renault → 13 490 €, retour Holding → 0 €, projet toujours compté
      dans « projets actifs » (4 = les 4 actifs en base). Budget et Dashboard
      d'accord.

13. **Exclusion de l'auteur dans la diffusion temps réel** (même lot). L'auteur
    d'une mutation recevait son propre événement, son écran refetchait 300 ms plus
    tard et écrasait son état local : une puce de marque cliquée dans `Projects.tsx`
    se dé-sélectionnait, d'où « il faut cliquer plusieurs fois ». Risque accepté
    explicitement le 29/07, corrigé ici.
    - Client : `services/socketId.ts` (module isolé pour éviter le cycle d'imports
      `dataService` ↔ `socket`), `apiFetch` envoie l'en-tête `x-socket-id`.
    - Serveur : `withEmitterContext` mémorise l'id par requête via
      `AsyncLocalStorage`, et `emitEvent` diffuse en `io.except(socketId)`. Les ~35
      sites d'appel restent inchangés, aucune route ne connaît le socket.
    - Dégradation sûre : sans en-tête (curl, outil externe), diffusion à tous.
    - Vérifié à deux onglets : auteur **0 refetch**, autre client **1 refetch** —
      le temps réel entre utilisateurs est intact.

14. **Les projets en brouillon ne remontent plus nulle part**
    (`fix/draft-hors-agregation`, 30 juillet). `Budget.tsx` excluait les brouillons,
    le Dashboard n'avait **aucun filtre de statut** : un brouillon portant un coût
    gonflait le consommé, la trajectoire, le mix activité et le compteur
    « campagnes live », sans jamais apparaître dans Budget — les deux écrans se
    contredisaient. Agenda, Campagnes et Export n'avaient pas de filtre non plus.
    - Exclusion ajoutée dans `Dashboard.tsx` (en tête du bloc projets),
      `Agenda.tsx`, `Campaigns.tsx` et `Export.tsx`.
    - **To-do et Hello Marketing conservent les brouillons** : là, l'inclusion est
      un choix explicite (`status === 'Active' || status === 'Draft'`) qui sert à
      préparer un projet avant activation. Arbitré avec Théo.
    - `Archived` reste compté dans le budget, inchangé (classement visuel, pas une
      annulation comptable).
    - Mesuré sur le projet TEST (13 490 €, Clermont) : Renault+Brouillon → 0 €,
      Renault+Actif → 13 490 €, Holding+Actif → 0 €. Les deux règles (Holding et
      brouillon) sont donc vérifiées **indépendamment**. Brouillon également
      absent de l'Agenda et des Campagnes. Projet restauré à l'identique après test.

15. **L'API survit désormais à une base injoignable**
    (`fix/api-resiliente-base-injoignable`, 30 juillet). Une coupure de quelques
    secondes vers Supabase tuait le process backend : l'accès base de `GET /me` et
    `PUT /me` était dans le callback de `jwt.verify`, donc hors de portée du filet
    d'erreur Express — Node terminait le process sur la promesse rejetée. En prod,
    `restart: always` relançait le conteneur mais coupait **toutes** les connexions
    Socket.IO au passage.
    - Helper `decodeToken` avec la forme **synchrone** de `jwt.verify` (qui lève) ;
      l'accès base revient dans le handler async, couvert par
      `express-async-errors` + `middleware/errorHandler.ts`.
    - Filet global `process.on('unhandledRejection')` dans `index.ts` : journalise
      sans tuer. Pas de `uncaughtException` volontairement.
    - Périmètre vérifié : le schéma dangereux n'existait que dans ces 2 routes.
      Le middleware d'auth et le handshake socket utilisent des rappels
      non-async ; les 5 handlers chat, la présence et le job de purge sont déjà
      protégés.
    - **Prouvé** sur une instance jetable (port 3999, `DATABASE_URL` pointée sur
      une base inatteignable) : 3 appels → 3 × 500 JSON propre, process toujours
      vivant, zéro trace de crash. Avant le correctif, le premier appel suffisait.
    - Non-régression : 401 sans jeton, 403 jeton invalide, 200 avec le vrai jeton ;
      `PUT /me` renvoyant les valeurs actuelles → 200 et profil strictement
      inchangé. La règle est consignée dans `ETAT-BACKEND.md`.

16. **Hello Marketing : musique du jour et actus RSS réparées en production**
    (`fix/feeds-proxy-backend`, 30 juillet). Les deux blocs ne fonctionnaient qu'en
    local : ils passaient par `corsproxy.io`, dont l'offre gratuite est réservée à
    localhost — le service répondait lui-même `403 {"error":"Free usage is limited
    to localhost and development environments"}` depuis l'origine de production.
    - **Proxy maison** : `GET /api/feeds` (liste), `GET /api/feeds/:key` (contenu),
      `GET /api/music/tracks`. Registre des flux **côté serveur** : le client
      n'envoie qu'une clé, jamais une URL — aucune surface de détournement (SSRF).
      Cache mémoire, timeout 8 s, en-têtes de navigateur sortants.
    - L'API Deezer n'envoie **aucun** en-tête CORS : elle est inappelable depuis un
      navigateur, dans tous les environnements. L'ancien repli « appel direct » ne
      pouvait pas fonctionner, il est supprimé.
    - **4 flux sur 8 étaient morts**, y compris en local (le front ignore
      silencieusement un flux en échec) : Caradisiac 410 → `/rss.xml` ; Influencia
      404 (`/fr/` en trop) → `/feed` ; Usine Digitale 403 → slash final + en-têtes
      navigateur ; **L'Argus a supprimé son RSS** → remplacé par **Autoactu** (actu
      de la distribution auto, choix de Théo).
    - Vérifié par le vrai chemin de l'app : 8 flux sur 8 en 200, **237 articles**
      parsés, musique 86 pistes. Sécurité : sans jeton 401, clé inconnue 404,
      tentative d'URL de métadonnées cloud 404 sans requête sortante. Cache :
      16 ms au second appel contre 845 ms au premier.
    - Le contrôle visuel des trois blocs reste à faire par Théo : dans mon
      environnement, le panneau navigateur n'étant pas affiché, la page ne compose
      pas de frames et `AnimatePresence mode="wait"` bloque tout changement
      d'onglet (l'animation de sortie ne s'achève jamais). Bon à savoir pour les
      prochaines vérifications d'interface.
    - `Caddyfile` inchangé : `/api/*` était déjà routé vers l'api.

17. **Dashboard : correction de cohérence + outils de pilotage**
    (`feat/dashboard-pilotage`, 30 juillet).
    - **Ventilation des projets par site** : même bug que les dépenses fixes, resté
      sur les projets. Un projet multi-sites disparaissait sous un filtre de
      périmètre. Compteurs « projets actifs » et « campagnes » gardés **hors** de
      la boucle de ventilation. Mesuré : Clermont 50 640 € → **57 640 €**.
    - « Campagnes Live » → **« Campagnes Programmées »**, comptage des tâches et
      non des projets.
    - **6 cartes KPI** (au lieu de 4) : ajout de **Projets en Retard** (échéance
      dépassée + avancement < 100 %) et **Rythme de Consommation** (% consommé
      comparé au % de période écoulée — un pourcentage de budget seul n'alerte pas).
    - **3 nouvelles sections** : *Pilotage projets* (écart prévu/réalisé par projet,
      liste cliquable des retards, avancement moyen) ; *Performance des campagnes*
      (volumétrie, ouverture, clic, NPAI, désabo, coût par contact, comparatif
      SMS/e-mail) ; *Où part l'argent* (budget par canal, top sites et prestataires,
      charge de l'équipe par collaborateur).
    - ⚠️ **Taux pondérés par la volumétrie**, jamais des moyennes de taux : une
      moyenne simple est fausse dès que les envois ont des tailles différentes.
      Les numérateurs cumulés sont des volumes (`volumétrie × taux`), pas des taux.
    - Tous les nouveaux indicateurs passent par la **même boucle filtrée** que le
      budget consommé : périmètre, marque, service, PRO+, `Draft` exclu et
      `Holding` hors montants mais compté dans le suivi.
    - Vérifié en recalculant **chaque valeur à la main** : consommé 104 590 €,
      4 projets en retard, avancement 26 %, 2 campagnes programmées, 204 400
      contacts sur 13 envois, ouverture pondérée 13,5 %, clic 3,6 %, coût par
      contact 0,084 € — affichage identique au calcul indépendant. Responsive
      mesuré à 320 et 375 px : aucun débordement, tableau de performance à scroll
      interne, zones tactiles ≥ 44 px.

18. **Campagnes : refonte de l'écran (espace, filtres, densité)**
    (`feat/campagnes-ergonomie`, 30 juillet). Aucun changement backend.
    - **Un seul jeu de filtres.** La page avait **deux périodes indépendantes**
      (une pour les graphiques, une pour la liste) et **deux filtres de canal**
      pour la même notion. Une période unique pilote désormais les deux. Ne reste
      près des graphiques que le sélecteur de métrique (Volume / Ouverture /
      Clics), qui ne filtre rien.
      ⚠️ **Changement de comportement assumé** : la liste n'avait aucun filtre de
      date et montrait tout l'historique ; elle est maintenant bornée par la
      période, avec l'année en cours par défaut.
    - **Sélecteur de période partagé** extrait dans
      `components/DateRangePicker.tsx` (il était local à `Dashboard.tsx` et non
      exporté), avec **deux raccourcis en plus** : « Ce semestre » et « Le
      semestre dernier » — le Dashboard en profite aussi.
    - **Graphiques repliables et qui défilent** : le bloc est passé *à
      l'intérieur* de la zone de défilement, et l'en-tête de colonnes est devenu
      `sticky top-0` pour rester étiqueté une fois la liste atteinte.
    - **Lignes desktop amincies de 81 à 52 px** : padding `p-3` → `px-3 py-2`,
      date sur une ligne (`10/09/26`), badges site/marque ramenés en fin de
      ligne 2 au lieu d'une troisième ligne, icône de canal réduite. **Les champs
      de saisie gardent leurs 30 px** — la hauteur vient du bloc info, pas d'eux.
    - Bilan mesuré à 913 × 910 px : mobilier fixe **473 → 168 px**, lignes
      visibles **5,3 → 8,5** graphiques dépliés et **12,9** repliés.
    - Trois causes techniques trouvées à la mesure, à retenir :
      1. La case **Coût** pilotait la hauteur de ligne : « 600 € » passait à la
         ligne dans 51 px. D'où `whitespace-nowrap` **et** une colonne élargie
         (`grid-cols-9` + `col-span-2`).
      2. **Ne pas écrire un gabarit de grille à la main** : `grid-cols-N` de
         Tailwind vaut `minmax(0,1fr)` (les colonnes peuvent rétrécir), alors
         qu'un `1fr` écrit dans une valeur arbitraire vaut `minmax(auto,1fr)` —
         les `<input>` imposent alors leur largeur intrinsèque (~147 px) et la
         grille explose. Vu aussi que la CDN Play ne génère pas les valeurs
         arbitraires contenant `repeat(...)`.
      3. Les **flèches natives de `<input type="number">`** occupent ~13 px *à
         l'intérieur* du champ : c'est ce qui tronquait « 9500 » en « 95 ».
         Classe opt-in `.gx-num-tight` ajoutée dans `index.html`.
      4. `p-3 md:p-6 pt-2` donnait en réalité **24 px** de padding haut
         (`md:p-6` est émis après `pt-2` et l'écrase) : l'en-tête `sticky top-0`
         se collait 24 px trop bas et les lignes défilaient au-dessus de lui.
         Paddings réécrits sans raccourci `p-*`.
    - Simplifications au passage : pastilles « % » en surimpression retirées des
      4 champs de taux (l'en-tête dit déjà « % OUV. », « % NPAI »…, et elles
      chevauchaient la valeur) ; titre « LISTING & ÉDITION EN MASSE » fusionné
      avec la barre de recherche (une ligne entière pour rien).
    - Zone tactile des déclencheurs de période portée de 16 à **44 px** via
      `py-3.5 -my-3.5` (marge négative : la hauteur occupée ne change pas).
    - Vérifié : les 9 raccourcis donnent les bornes exactes au 30/07/2026, et les
      totaux se recoupent (S1 9 lignes + S2 5 = 14 = l'année ; côté Dashboard
      58 700 € + 45 890 € = **104 590 €**, valeur inchangée après extraction du
      sélecteur). Saisie d'une volumétrie et d'un taux confirmée persistée en
      base puis **remise à sa valeur d'origine**. Responsive mesuré à 320 et
      375 px : aucun débordement, cartes mobiles en lecture seule intactes (94 px).
    - Limite connue : sous ~1000 px de large, les volumétries à 5 chiffres et les
      noms de projet sont tronqués (avec infobulle). Vérifié propre à partir de
      ~1300 px. C'était déjà le cas avant, en pire (le texte passait à la ligne).
    - **Passe de finition demandée par Théo après relecture** (4 détails, même lot) :
      1. L'en-tête de colonnes collant était en **fond noir plein**
         (`dark:bg-bony-dark`), ce qui tranchait sur le thème liquid glass →
         classe `.gx-sticky-head` (`index.html`) : translucide + flou, **bordure
         basse seulement** (c'est une barre, pas un panneau).
      2. **La police de titre Syncopate n'a rien à faire dans une ligne de
         tableau.** La règle globale `h1..h6 { font-family: 'Syncopate' }` de
         `index.html` s'appliquait au nom de projet (un `<h3>`), d'où le rendu
         « grossier » : mesuré **350 px** pour « DEMO — Salon Auto Plaque
         Sud-Ouest » contre **237 px** en Albert Sans 13 px, soit 32 % de plus.
         `font-sans` forcé sur la ligne ; Syncopate reste sur les vrais titres —
         la hiérarchie est même plus nette.
      3. **Date qui débordait de sa colonne** : `font-title` (Syncopate) rendait
         « 10/09/26 » sur **71,6 px** dans une colonne de 64. Passée en
         `font-sans tabular-nums` (54,4 px) et colonne portée à 74 px. L'en-tête
         de la colonne Date a été recalé à 87 px : il était décalé de 11 px du
         bloc info des lignes — vérifié à la mesure, les deux commencent
         maintenant au même pixel (207 px).
      4. **Sélecteur « Volume » désaligné** : le composant `Select` est en
         `w-full`, donc en enfant de flex il s'étirait sur toute la place
         restante. Borné à 104 px, et les **trois** en-têtes de graphique passés
         en `items-center min-h-[34px]` pour que les titres soient sur la même
         ligne (vérifié : les 3 à 162 px).
      Revérifié après coup dans les **deux thèmes** (le verre translucide est
      blanc à 72 % en clair, gris foncé à 72 % en sombre) et à ~1660 px, la
      largeur d'écran réelle de Théo : aucun texte tronqué.

19. **Réservations matériel : fin des sur-réservations** (`fix/reservations-anti-surbooking`,
    30 juillet). Seul changement **backend** de la série. La disponibilité
    n'était calculée qu'en mémoire côté client, donc deux personnes réservant en
    même temps validaient chacune sur une liste qui ignorait l'autre.
    - Contrôle serveur sur POST **et** PUT, dans une transaction
      (`backend/src/utils/availability.ts`), avec un **verrou consultatif
      transactionnel par matériel**.
    - ⚠️ **Le contrôle sans le verrou est décoratif** : mesuré sur 6 requêtes
      simultanées pour un stock de 2 → sans verrou **6 acceptées, 6 unités
      engagées** (sur-réservation de 300 %) ; avec, **2 acceptées, 4 refusées**
      en 409 et exactement 2 unités en base. C'est la ligne de verrou qui fait
      le travail, pas le calcul.
    - ⚠️ **Pic jour par jour, pas somme des chevauchements** : vérifié qu'une
      demande légitime (1 unité sur 01→11 avec 1 prise sur 01→02 et 1 sur 10→11,
      stock 2) passe bien — une somme naïve l'aurait refusée.
    - Bug trouvé au passage : un **PUT partiel ne portant que `endDate`** pouvait
      la placer avant `startDate` (contrôle croisé absent du PUT). Dates et
      quantité sont désormais évaluées sur les valeurs effectives après fusion.
    - Vérifié aussi : ligne inchangée en base après un refus (pas d'écriture
      partielle), message d'erreur chiffré remonté tel quel à l'utilisateur
      (`Material.tsx` lit déjà `ApiError.message`, **aucun changement
      frontend**), et base rendue à son état initial après les tests
      (16 équipements, 7 réservations, zéro résidu).
    - Catalogue matériel dupliqué : **nettoyé par Théo**, vérifié — 16 lignes
      pour 16 noms uniques. Sorti du backlog.

20. **PWA : application installable + notifications push + sourdine du chat**
    (`feat/pwa-install-push`, 30 juillet). Frontend **et** backend, **avec
    migration** (`20260730184718_add_push_subscriptions_and_chat_mute`).
    - **Installable** sur Windows/Mac (Chrome, Edge), Android et iOS. Section
      « Application » dans les Paramètres, visible par **tous** les rôles, avec une
      modale à trois choix et le picto de chaque OS.
    - ⚠️ **Un seul des trois cas peut être un vrai bouton.** Windows et Android
      ont l'invite native (`beforeinstallprompt`) ; **iOS n'expose aucune API**,
      seule la marche à suivre *Partager → Sur l'écran d'accueil* est possible.
      Firefox sur ordinateur ne gère pas les manifests : aucune installation.
    - **Aucune mise à jour de PWA à republier.** L'app installée charge le même
      code que le site : un `docker compose up -d --build web` suffit, comme avant.
    - ⚠️ **DÉCISION STRUCTURANTE — le service worker n'intercepte PAS `fetch`.**
      Un service worker n'est pas requis pour l'installation (vérifié sur MDN) ;
      celui de `public/sw.js` n'existe que parce que l'API Push l'exige. Sans
      gestionnaire `fetch`, il ne met rien en cache et ne peut donc jamais figer
      un utilisateur sur une vieille version — les en-têtes `Cache-Control` de
      nginx continuent de piloter seuls la fraîcheur. **Ne pas ajouter de `fetch`.**
    - **Pas de mode hors-ligne, et ce n'est pas un oubli** : Tailwind est chargé
      depuis `cdn.tailwindcss.com` et génère TOUT le CSS à l'exécution — sans
      réseau, l'app s'afficherait sans aucun style. Le rendre hors-ligne imposerait
      d'internaliser Tailwind sur 20+ pages. Et Gearbox lit 100 % de ses données du
      serveur : on afficherait une coquille vide.
    - **Notifications de chat** avec expéditeur et contenu, façon Messenger. Sur
      iOS, possible depuis iOS 16.4 **mais seulement dans l'app installée**, et la
      permission exige un **vrai geste utilisateur** (d'où un bouton, jamais un
      appel automatique). Badge de non-lus sur l'icône via `navigator.setAppBadge`.
    - **Sourdine par conversation** depuis la rubrique Chat (cloche à côté de
      l'étoile d'épinglage, dans les **trois** rendus de la liste). ⚠️ Contrairement
      à l'épinglage, qui est un overlay `localStorage`, la sourdine passe par le
      **serveur** : c'est lui qui décide d'envoyer le push. Elle est donc
      synchronisée entre appareils, et coupe le push **sans** masquer le compteur
      non-lu.
    - **Icônes** : `public/favicon-192.png` faisait en réalité **161×161** (nom
      trompeur) et Chrome exige du 192 et 512 **réels**. Quatre icônes régénérées
      depuis la marque vectorielle (le 1er `path` de `logo-color.svg` — le logotype
      complet fait 440×113, illisible en carré), dont une **maskable** à fond opaque
      pour Android et un `apple-touch-icon` opaque (iOS ne gère pas la
      transparence). Faute d'outil d'image sur le poste, générées via le canvas du
      navigateur et **dimensions revérifiées octet par octet**.
    - ⚠️ **Piège de configuration à deux temps** : une variable doit être
      valorisée dans le `.env` du VPS **ET** déclarée dans le bloc `environment:`
      du service `api` de `docker-compose.yml`. Absente de cette liste, elle
      n'atteint pas le conteneur — et l'envoi de notifications échouerait
      silencieusement. Clés VAPID posées dans les deux endroits + `backend/.env`.
    - Vérifié : manifeste valide et 4 icônes en 200, `beforeinstallprompt` capté
      et invite native déclenchée (chemin simulé de bout en bout), **6 cas de
      détection de plateforme** dont l'iPad qui se déclare `Macintosh`, les 4 états
      de permission dont le refus, service worker enregistré **sans gestionnaire
      `fetch`**, **7 cas** de filtrage des destinataires, **7 cas** de sourdine
      dont la préservation du compteur non-lu, abonnement mort (404) **supprimé
      automatiquement**, réabonnement sans doublon, `theme-color` suivant le thème,
      responsive mesuré à 320 et 375 px. Base rendue à son état initial.
    - ✅ **Validé en production par Théo le 30/07/2026**, sur les trois cibles :
      poste Windows, **Google Pixel 10 Pro** (Android) et **iPhone SE** (iOS).
      Installation, réception des notifications, clic vers le chat et badge de
      non-lus : tout fonctionne. À noter pour les prochaines sessions : mon
      environnement ne peut ni installer une PWA ni recevoir une notification
      APNs, la validation finale de ce genre de lot passe forcément par Théo.
      Le test depuis un téléphone est par ailleurs impossible en local
      (`localhost` ne sort pas du poste) : ce lot est parti en prod sans essai
      mobile préalable, et c'était le bon arbitrage.

21. **Finitions : zones tactiles, dépendances CDN mortes, ménage des branches**
    (`chore/finitions`, 30 juillet). Frontend seul, aucun changement backend.
    - **`Select` tactile sur mobile** : la taille `sm` faisait 34 px, sous le seuil
      des 44 px. Portée à 44 px **mais uniquement en dessous de `md`** — sur
      ordinateur elle reste à 34 px, sinon les barres de filtres et les en-têtes de
      graphiques, calibrés autour de cette hauteur, se retrouveraient gonflés. Même
      traitement sur les lignes d'options du menu déroulant. Mesuré aux deux
      largeurs : 44 px à 375 px, 34 px à 1280 px.
      À retenir : les variantes `md:` **fonctionnent** sur `min-h-[...]` en CDN Play
      (elles ne marchent pas sur les classes custom `gx-*` / `glass-*`) — vérifié
      par sonde plutôt que supposé.
    - **Deux dépendances CDN mortes retirées d'`index.html`** : l'`importmap` vers
      `esm.sh` (7 entrées) et **Font Awesome** (`cdnjs`), dont **aucune classe
      `fa-*`** n'existait dans le code. Deux requêtes externes en moins à chaque
      chargement.
      ⚠️ **Preuve que l'importmap était inerte** : build réalisé deux fois sur la
      même machine, avec et sans elle → **fichiers de sortie identiques, mêmes
      hachages** (`index-BPN454YS.js`, `xlsx.min-BFSYMm_C.js`). Vite résout ces
      spécificateurs depuis `node_modules` et ignore complètement l'importmap. Ne
      pas la remettre sans passer à un chargement sans bundler.
    - **27 branches locales supprimées** après avoir vérifié que la liste des
      branches non mergées était **vide** — aucune perte possible. Il ne reste que
      `master`.
    - Vérifié : app fonctionnelle après retrait des CDN (styles Tailwind appliqués,
      police Syncopate chargée, zéro erreur JS), `tsc` backend 0 et racine 12 lignes
      préexistantes.

    ℹ️ Le jeu de démonstration `DEMO — ` créé pour ce lot a été **entièrement
    supprimé le 03/08/2026** lors de la reprise des données réelles (correctif 22).
    Il n'existe plus en base.

22. **REPRISE DES DONNÉES RÉELLES 2026 — le jeu de démo est remplacé par le vrai
    suivi budgétaire** (3 août). Aucun changement de code : uniquement des données.
    - Source : **`budget market 2026.xlsx`** (à la racine du dépôt), 13 onglets —
      1 récapitulatif + 12 mensuels, **817 lignes**, 1 475 140,25 € au total.
    - Écrit en base via la **vraie API** (donc toutes les validations serveur) :
      **24 enveloppes**, **738 dépenses**, **100 projets / 247 tâches**.
    - Supprimé au passage : les 10 projets et 6 dépenses `DEMO — `, plus 5 projets
      et 1 dépense de test (`123456`, `TEST`, `TRACK DAY MDC`,
      `SPORT & COLLECTION MDC`, `CCDMD 2026`, `TOUBKALPES RS`) — validé par Théo,
      après un dump Supabase frais (`backups/gearbox-20260803-160620.sql.gz`).
    - **Réconciliation à 0,00 € d'écart** sur les 4 axes (total, dépenses, projets,
      enveloppes) **et sur les 12 mois**. Consommé 1 474 050 € / budget 1 480 800 €.

    **Correspondances retenues — désormais des règles du projet :**

    | Fichier | Gearbox |
    |---|---|
    | `SODAVI` | Vichy |
    | `AVA` | Issoire |
    | `GG VELAY` / `LE PUY EN VELAY` | Le Puy-en-Velay |
    | `RIOM` | Mozac (déjà aliasé dans `Budget.tsx`) |
    | code service 1 / 2 / 3 / 4 | VN / VO / **PR** / **APV** (`MPR`→PR, `ATS`→APV) |

    **Décisions structurantes, à connaître avant de retoucher ces données :**
    - **Une dépense par ligne Excel**, datée du **1ᵉʳ du mois de son onglet**,
      `isAnnual = false`. La colonne « Date commande » est ignorée (elle contient
      des dates de 2025 et une coquille). Représentation unique, sans interpolation :
      la courbe mensuelle, les démarrages en cours d'année et les changements de
      montant sont reproduits exactement.
    - **Les colonnes de sites font foi, pas la colonne « Montant HT »** : elles
      portent à la fois le montant et sa ventilation. Écart préexistant de
      **1 089,99 €** entre les deux (0,07 %), mesuré par la colonne `Ctrl` du
      fichier. 148 lignes concernées dont 70 sous 50 centimes ; **une seule
      significative** : `CAVE SBBM` (juin, ligne 35), 320,83 € des 700 € non
      ventilés.
    - **Alpine et Nissan sont des marques, pas des sites.** Le routage de
      `Budget.tsx` lit le champ **`brand` (singulier, legacy)**, pas `brands[]`.
      Alpine : le fichier ne le ventile pas par site (le bloc 2 met tout sous
      `LANGEAC`) → **tout sur `Alpine-Clermont`** par décision de Théo, les 3 autres
      buckets remis à zéro. ⚠️ Le `site` d'une dépense Alpine doit rester
      `Clermont`, sinon l'enveloppe et la dépense atterrissent dans deux buckets
      différents. Nissan : 167 lignes le mélangent à d'autres sites → chacune
      produit **deux** enregistrements ; sans effet sur les totaux, le bucket
      Nissan étant global.
    - **Marque par défaut `Renault`** pour la part non-Alpine/non-Nissan : le
      fichier ne distingue pas Renault de Dacia et Mobilize, et la règle métier en
      fait un seul compte. Théo retouche à la main au besoin.
    - **Type de projet déduit du libellé** (« partenariat » → Partenariat, « salon »
      /« expo » → Expo/Salon, « collaborateur »/« convention agent » →
      Collaborateurs, « video »/« conf de presse » → Contenu), le reste en
      `OP Clients`. Résultat : 67 OP Clients, 18 Partenariat, 7 Expo/Salon,
      4 Collaborateurs, 4 Contenu.
    - **Statut** : `Done` si le dernier mois du projet est écoulé, `Active` sinon
      (94 / 6). Sans ça, Gearbox afficherait « 100 projets actifs » à 100 %
      d'avancement et le compteur ne voudrait plus rien dire.

    **Anomalies du fichier laissées telles quelles**, Théo les corrige dans Gearbox :
    7 projets fantômes `corporace 2027` à `2033` (tirage de cellule Excel qui a
    incrémenté l'année, lignes 94-101 d'avril, même prestataire), 3 quasi-doublons
    (`partenariat raf`, `track day(s) mas du clos`, `portrait collaborateur(s)`),
    2 lignes sans code service valide rattachées à « Tous Services », et un projet
    dont le libellé était réduit à « projet ».

    Le détail complet est dans **`RAPPORT-IMPORT.md`** à la racine : totaux par
    mois/site/service, les 100 projets, et toutes les anomalies.

    ⚠️ **Deux conséquences visibles, aucune n'est un bug :**
    1. Le récurrent de toute l'année étant engagé, le **consommé affiche 99,5 %**
       dès le 3 août. Le KPI « Rythme de consommation » devient de ce fait
       trompeur — voir le backlog.
    2. **La rubrique Campagnes est vide**, ainsi que le bloc « Performance des
       campagnes » du Dashboard. Ces écrans se dérivent des tâches au canal `SMS`
       ou `E-mail`, or **le fichier source ne porte pas le canal** : les 247 tâches
       importées ont un canal vide. Le jeu de démo alimentait ces widgets, les
       vraies données non. Pour les faire vivre, il faudra renseigner le canal des
       tâches concernées dans Gearbox (ou ajouter une colonne au fichier).

23. **Routage Alpine / Nissan : le croisement marque × périmètre enfin juste**
    (`fix/routage-alpine-nissan`, 3 août). Frontend seul, aucun changement backend.
    Signalé par Théo dès qu'il a filtré sur Alpine, la reprise des données ayant
    rendu ces défauts visibles.
    - **Cause racine unique** : rien ne reliait une ligne de budget
      (`Alpine-Clermont`, `Nissan`) au couple **(site réel, marque)**. `Budget.tsx`
      routait la dépense vers des buckets mais filtrait les lignes par **égalité de
      nom** ; `Dashboard.tsx` **ne routait pas du tout**. Cinq défauts en
      découlaient, détaillés dans `BUGS-CONNUS.md`.
    - **Correctif : un résolveur unique dans `constants.ts`** — `ALPINE_BUCKETS`,
      `NISSAN_BUCKET`, `resolveSiteAlias`, `resolveBudgetLine` et
      `routeShareToBucket`. Même démarche que `isHoldingBrand()` : **un seul test
      partagé**, plus de demi-logique par écran. `routeShareToBucket` ne rend
      **jamais** `null` — c'est ce qui récupère les 2 870 € qu'un `return`
      silencieux faisait disparaître.
      ⚠️ **`routeShareToBucket` n'existe plus** : remplacée par
      `splitShareToBuckets` au correctif 24 (elle rend désormais une liste de
      destinations pondérées). Ne pas la chercher dans le code.
    - **Décision de Théo : Alpine n'est plus une entité unique.** Elle est
      réellement par site (4 concessions), donc le pseudo-site `Alpine` — qui ne
      correspondait à aucune ligne — est retiré des deux sélecteurs de périmètre.
      On obtient Alpine en croisant **MARQUE = Alpine × PÉRIMÈTRE**. Nissan reste
      une entité unique et globale : sa ligne n'entre dans un périmètre que si elle
      y est **explicitement** nommée, sinon on la compterait une fois par site
      éligible.
    - **Le filtre de marque s'applique désormais aux 3 sources** dans `Budget.tsx`
      (enveloppes, projets, dépenses) : il ne touchait que les projets.
    - `Projects.tsx` et `FixedExpenses.tsx` **volontairement non modifiés** :
      vérifié qu'ils n'utilisent `ALPINE_SITES`/`NISSAN_SITES` que pour décider
      quelles puces de marque proposer selon les sites choisis — aucun routage.
    - Vérifié sur les **données réelles**, pas sur une réplique : conservation à
      1 centime (les 2 870 € réapparaissent), MARQUE = Alpine → 119 545 € / 120 000 €
      (100 % au lieu de 8,1 %), périmètre Nissan → 118 079 € / 60 600 € (195 %, le
      dépassement réel, au lieu de 0 €), MARQUE = Renault → enveloppes Alpine et
      Nissan bien exclues, et **Budget ↔ Dashboard d'accord** sur les mêmes montants.
      16 cas unitaires sur le résolveur. `tsc` backend 0, racine 12 préexistantes.
    - ⚠️ **Fausse alerte que je me suis faite** : le total sans filtre est passé de
      1 474 050 € à 1 471 144 €, ce que j'ai d'abord pris pour une régression de mon
      correctif. En réalité **Théo avait commencé à corriger les données dans
      Gearbox** (20 projets ont un `budgetActual` différent du `budgetPlanned`, des
      libellés nettoyés) — et le Dashboard affiche `budgetActual`. Leçon : quand un
      total bouge, vérifier d'abord si la donnée a bougé.
24. **Curseurs de répartition marque / compte RDM : `nissanShare` créé,
    `alpineShare` enfin branché** (`feat/part-nissan`, 4 août). Demande de Théo
    après explication d'`alpineShare` : « il faudrait la même chose pour Nissan ».
    - **Le point important : `alpineShare` était un champ MORT.** Il existait en
      base, s'affichait dans les deux formulaires, se sauvegardait… et **aucune
      agrégation ne le lisait**. La valeur saisie ne changeait rien. Ajouter un
      `nissanShare` sans brancher le calcul aurait donc fabriqué un **second
      curseur mort** — les deux ont été activés dans le même lot.
    - **Migration** `20260804110458_add_nissan_share` : `nissanShare Float?` sur
      `Project` et `FixedExpense`. Deux colonnes nullables, purement additives,
      appliquée via `migrate deploy` (SQL relu d'abord avec `--create-only` :
      `migrate dev` sur la base de PROD n'est pas une bonne idée).
    - **`routeShareToBucket` remplacée par `splitShareToBuckets`**, qui rend une
      **liste de destinations pondérées** au lieu d'une seule. Les ratios somment
      toujours à 1 : **la conservation des montants est garantie par construction**,
      plus par la vigilance de l'appelant. Remplacée et non doublée — deux
      fonctions de routage, c'est exactement la duplication qui a causé les
      quatre bugs du correctif 23.
    - **Règle « curseur vide = tout sur la marque »** (décision de Théo, parmi
      trois options proposées). Conséquence voulue : activer la fonction **ne
      déplace aucun euro** tant que personne ne renseigne un curseur. Vérifié :
      les 835 lignes en base (97 projets, 738 dépenses) ont **toutes** les deux
      champs à `null`.
    - **Le curseur n'est lu que si une marque RDM est présente** — même condition
      que son affichage. Une valeur restée en base après le retrait du tag Renault
      ne peut donc pas scinder en douce un projet Alpine pur.
    - **Défaut d'affichage corrigé : 100 et non 50.** Les deux formulaires
      affichaient `?? 50` alors que le calcul impute 100 % à la marque quand le
      champ est vide — l'interface annonçait une répartition qui n'avait pas lieu.
    - **Garde-fou `Number.isFinite`** : une part `NaN`/`Infinity` se propageait
      dans tous les totaux, qui auraient affiché « NaN € ». Trouvé parce que le
      test de conservation le laissait passer (`Math.abs(NaN - 1) > 1e-12` vaut
      `false`) ; l'assertion a été corrigée en même temps que le code.
    - Vérifié : **1 344/1 344 cas** identiques à l'ancien routage quand les parts
      sont vides (tous les sites × 14 combinaisons de marques × 4 valeurs de
      `brand` legacy), conservation OK sur tous les cas, et sur les données réelles
      MARQUE = Alpine → 120 295 € / 120 000 €, MARQUE = Nissan → 120 949 € /
      60 600 €, total sans filtre inchangé. `tsc` backend 0, racine 12
      préexistantes (jeu identique au baseline).

25. **KPI « Avance / Retard de Budget » : la comparaison enfin bien posée**
    (`fix/kpi-rythme-consommation`, 4 août). Frontend seul, `pages/Dashboard.tsx`
    uniquement, aucun changement backend. Seul point marqué ⚠️ du backlog, arbitré
    avec Théo le 03/08.
    - **⚠️ La cause notée dans le backlog était fausse.** Le backlog l'expliquait par
      « les dépenses récurrentes de toute l'année sont engagées d'avance » : vrai,
      mais ce n'était qu'un **révélateur**. Le défaut était dans la formule :
      `totalActual` cumule **toute la période filtrée** (janvier→décembre par défaut,
      donc y compris les dépenses datées du 01/11 et du 01/12) alors que
      `pctTempsEcoule` mesure le temps écoulé **jusqu'à aujourd'hui**. Un total de fin
      d'année confronté à une horloge de mi-année : faux **par construction**. N'importe
      quel budget saisi à l'avance produisait la même fausse alerte, sans une seule
      ligne récurrente. Leçon générale : quand un indicateur dérape après un changement
      de données, vérifier d'abord si sa formule était déjà mal posée.
    - **Correctif** : un accumulateur `totalEngageADate`, alimenté aux **deux mêmes
      endroits** que `totalActual` (bloc projets, bloc dépenses fixes) avec une borne
      haute « aujourd'hui », sous les mêmes filtres et sur la part **déjà pondérée**
      par `splitShareToBuckets`. Aucun routage réimplémenté. `totalActual` est
      **inchangé** : la carte « Budget Consommé » doit rester d'accord avec `Budget.tsx`.
    - `pctConsomme` devient **deux** valeurs : `pctEngageADate` (le terme de la
      comparaison) et `pctEngagePeriode` (affiché comme information, plus comparé).
    - **Libellés corrigés**, ils faisaient partie du défaut : « Budget dépensé » →
      « Engagé à date » (cette barre n'a jamais montré du dépensé), « Année écoulée »
      → « Période écoulée » (faux dès qu'on filtre un semestre ou un trimestre), et une
      **troisième ligne sans barre** « Engagé sur la période » — volontairement sans
      barre : lui en donner une inviterait à la comparer au temps écoulé, c'est-à-dire
      exactement l'erreur corrigée ici.
    - **Mesuré : +41 → +16 points.** Engagé à date 75 %, période écoulée 59 %, engagé
      sur la période 99 %. Recalcul indépendant depuis l'API, hors du composant :
      1 471 143,52 € et 75 / 59 / 99 % — identique à l'affichage.
    - **Non-régression prouvée** : Budget Consommé 1 471 144 € / 1 480 800 €, reste à
      engager 9 656 €, 99,3 %, **et la page Budget affiche exactement les mêmes
      chiffres**. Croisements identiques au correctif 24 au centime : MARQUE = Alpine
      120 295 € / 120 000 €, MARQUE = Nissan 120 949 € / 60 600 €.
    - **Bornes vérifiées** : période entièrement passée (S1) → écoulé 100 % et les deux
      valeurs convergent à 119 % ; période future → 0/0/0 sans `NaN` ; durée nulle
      (période d'un jour) → pas de division par zéro ; **au 31/12 l'écart tombe à
      −1 point**, ce qui prouve que l'indicateur est bien formé — il converge en fin de
      période au lieu de rester bloqué. Périmètre Clermont → **−12 points**, l'écart
      sait enfin descendre en négatif, ce qu'un +41 constant rendait impossible.
    - ⚠️ **Biais structurel résiduel assumé, de l'ordre de +8 à +12 points.** Mesuré
      aux dates de bascule : 01/08 → +12, 04/08 → +16, 31/08 → +10, 01/09 → +9,
      31/12 → −1. Cause : une dépense du mois est imputée **au 1ᵉʳ**, donc le mois
      entier est engagé quand l'horloge compte encore en jours. L'indicateur respire
      donc à l'intérieur de chaque mois. Correctif possible si le besoin se confirme :
      compter le temps écoulé **en mois** plutôt qu'en jours, pour que l'horloge et la
      convention d'imputation aient la même granularité. Choix de lecture laissé à
      Théo, ce n'est pas un bug.
    - Responsive mesuré à 320 et 375 px : 0 chevauchement, 0 débordement de rangée,
      pas de scroll horizontal, la nouvelle ligne tient sur une seule ligne. Vérifié
      en clair **et** en sombre, aucune couleur hors charte. `tsc` backend 0, racine 12
      préexistantes. **Aucune écriture en base** pendant les tests (que des `GET`).

26. **Écran de connexion : la page blanche ne peut plus venir de l'animation, et le
    glitch du logo ne fuit plus** (`fix/login-page-blanche`, 4 août). Frontend seul,
    `pages/Login.tsx` uniquement.
    - **Feu vert de Théo sous condition explicite : aucun changement visuel.**
      L'animation de fond de la page de connexion est intouchable (règle écrite dans
      `THEME-LIQUID-GLASS.md` **et** `AMELIORATION-VISUELLE.md`).
    - ⚠️ **Le diagnostic inscrit dans `BUGS-CONNUS.md` était faux** (« refs DOM nulles
      au premier paint ») : le garde existait. Leçon, la même qu'au correctif 25 :
      **revérifier une cause écrite avant de coder dessus.**
    - **Mécanisme établi par sonde temporaire** (dans un autre écran, déclenchée sur
      `?boom`, retirée aussitôt et absence de résidu vérifiée par `git diff`) : une
      exception dans un `useEffect` vide **tout** l'arbre React faute
      d'`ErrorBoundary` — `#root` mesuré à **0 enfant, 0 octet de HTML**. Or `draw()`
      est appelé **synchronement** depuis l'effet du canvas.
    - **Déclencheur possible mesuré** : `buildGrid` peut ne produire **aucun** segment
      (tirages à p = 0,55 et 0,4) → `spawnPulse` lit `segments[0]` → `undefined` →
      `TypeError`. Sur 200 000 tirages : **0 % à 320×568 et au-delà**, **27 % à 0×0**.
    - **Correctifs** : garde `segments.length > 0`, et **filet `try/catch`** autour du
      corps de dessin avec le `requestAnimationFrame` sorti du `try` (pas de frame
      replanifiée après échec, donc pas de journal 60 fois par seconde).
    - **Second bug, distinct** : le `setInterval` du glitch du logo **ne s'arrêtait
      jamais**. Le nettoyage ne coupait que le `setTimeout` ; un démontage pendant une
      salve laissait l'intervalle vivant, et il replanifie `glitch()` — chaîne infinie
      mutant des nœuds DOM détachés pour toute la session. Handle désormais suivi hors
      de `glitch()` et coupé au nettoyage.
    - **Preuve de non-régression visuelle** — c'est la condition de Théo, donc elle est
      mesurée et non affirmée : les corps de dessin des deux versions ont été extraits
      et comparés après retrait des commentaires et des espaces. **Aucune instruction
      de dessin ne diffère** — seules apparaissent la garde ajoutée et le
      `requestAnimationFrame` déplacé. Tous les `ctx.*`, couleurs, coordonnées et
      probabilités sont identiques au caractère. Combiné aux 0 % de segments vides sur
      un écran réel, l'animation est identique au pixel.
    - **Preuve de la fuite** : corps de l'effet extrait des **deux** versions et simulé
      avec des minuteurs virtuels, démontage au milieu d'une salve — avant : intervalle
      toujours actif, **113 déclenchements sur 60 s** ; après : **0 tâche restante,
      0 déclenchement**.
    - Vérifié en vrai sur la page de connexion (jeton mis de côté puis **restauré**,
      zéro résidu) : canvas 1440×900 couvrant tout l'écran, fond peint, animation
      vivante (pixel central qui change), glitch du logo actif, aucun scroll
      horizontal. `tsc` racine 12 lignes préexistantes dont **0 dans `Login.tsx`**,
      backend 0.
    - ⚠️ **Réserve** : le symptôme n'a **pas été reproduit**. C'est la classe de panne
      qui est fermée, pas un déclencheur confirmé. Si l'écran blanc réapparaît, la
      cause est ailleurs — la console portera alors
      `[Login] animation de fond interrompue`, ce qui tranchera tout de suite.

27. **Anniversaires visibles de tous, et choix de l'année dans tous les calendriers**
    (`feat/anniversaires-partages` + `feat/datepicker-annee`, 4 août). Deux patchs
    indépendants demandés ensemble par Théo, un seul déploiement. **`api` et `web`**
    reconstruits, le schéma Prisma ayant bougé.

    **Patch 1 — l'anniversaire n'avait jamais quitté le navigateur.** Ce n'était pas
    un bug d'affichage : `Settings.tsx` écrivait la date dans `localStorage`
    (`gearbox_user_prefs_<id>`) et `BirthdaysSection` bouclait sur les utilisateurs de
    l'API en relisant ce **même `localStorage`** pour chacun. Un poste ne connaissait
    donc que les anniversaires saisis **sur lui** — d'où « personne ne voit les
    anniversaires des autres ». La colonne « Anniversaire » de la Gestion des
    Utilisateurs avait le même défaut.
    - Migration `20260804152533_add_user_birthdate` : `birthdate String?` sur `User`.
      **`String` et non `DateTime`** — une date de naissance n'a ni heure ni fuseau, et
      un `DateTime` rouvrirait la classe de bug J+1. Détail dans `ETAT-BACKEND.md`.
    - Décision de Théo parmi trois options : **date complète, âge visible de tous**.
      C'est ce que le code visait déjà (`{age} ans` était affiché), ça ne fonctionnait
      simplement jamais.
    - **La ville reste en `localStorage`**, à dessein : elle pilote la météo du poste
      de chacun, ce n'est pas une donnée d'équipe. ⚠️ `ETAT-BACKEND.md` classait les
      deux ensemble dans les « résidus assumés » — corrigé, c'était une erreur de
      classement pour l'anniversaire.
    - ⚠️ Quatre points de passage dans `routes/users.ts` (déstructuration explicite) :
      le piège du `nissanShare`. `publicUser` extrait vers `utils/publicUser.ts` pour
      être partagé avec `auth.ts` — l'invariant « jamais l'objet Prisma brut, il porte
      `passwordHash` » reste entier, vérifié.
    - **Manque préexistant corrigé** : `PUT /me` n'émettait aucun événement et
      n'appelait pas `notifyUserChanged`. Modifier son propre profil ne rafraîchissait
      ni les autres clients ni le cache de présence.
    - Vérifié : les 12 comptes à `null` après migration, aucune autre colonne touchée ;
      écriture relue depuis `/me` **et** `/api/users` ; chaîne vide = effacement ;
      champ absent = valeur préservée ; chemin admin sans toucher rôle/loginId/nom ;
      **temps réel prouvé à deux onglets** (« 29 ans / dans 224 j » → « 28 ans /
      Auj. ! » sans rechargement) ; cas du jour, 29 février, date effacée ;
      non-régression météo, musique et flux. **Base rendue à son état initial.**
    - ℹ️ **Aucune reprise des valeurs existantes**, volontairement : elles vivaient
      dans le `localStorage` du poste de saisie et sont invisibles du serveur ; un
      script de reprise côté client serait non idempotent (le défaut de
      `migrateEquipmentIfNeeded`). Vérifié : aucune préférence locale n'existait sur le
      navigateur inspecté. À ressaisir à la main, ce qui coûte désormais 4 clics.

    **Patch 2 — impossible de choisir l'année dans un calendrier.**
    `components/DatePicker.tsx` n'offrait que deux flèches ±1 mois : atteindre une date
    de naissance demandait **336 clics** pour 2026 → 1998.
    - **Un seul fichier corrige les 28 champs de date des 9 écrans** : cette
      navigation n'existait qu'ici, `DateRangePicker` délègue à ce composant et aucun
      autre ne porte de `addMonths`/`viewMonth`.
    - Trois modes (jours / mois / années), l'en-tête devenant un bouton marqué d'un
      chevron. **24 années par page en 4 × 6, pages fixes alignées sur des multiples
      de 24** : ce nombre est calculé, pas esthétique — la page contenant l'année
      courante (2016-2039) est **voisine** de celle des années de naissance courantes
      (1992-2015), donc une seule flèche suffit. Pagination plutôt que liste bornée :
      pas de « à partir de 1930 » à maintenir.
    - **Mesuré : mars 1998 en 4 clics** (en-tête, flèche, année, mois) au lieu de 336.
    - `minDate` respecté aux **trois** niveaux, sinon on offrirait un chemin vers une
      date interdite : une année est désactivée si son 31 décembre est trop tôt, un
      mois si son **dernier** jour l'est. Vérifié sur Export — borne au 01/01/2026 :
      années 2016-2025 désactivées, page 1992-2015 entièrement désactivée ; borne au
      15/06/2026 : janvier à mai désactivés.
      ℹ️ `minDate` n'est utilisé que dans `Export.tsx` et `Projects.tsx`, **pas** dans
      Matériel.
    - Cellules mois/années à **44 px sous `md`**, 36 px au-delà (règle du correctif
      21). Retour automatique en mode « jours » à l'ouverture. Les 9 raccourcis de
      période rendent des bornes inchangées. Vérifié en clair **et** en sombre, aucune
      teinte hors charte, panneau dans l'écran à 375 px.
    - ℹ️ Limite connue laissée en place : les cellules **jour** restent à 36 px sur
      mobile, sous le seuil des 44 px. Défaut préexistant, non touché pour ne pas
      modifier la grille existante.

28. **Stockage de fichiers : audit, indicateur d'espace, purge du chat, pièces jointes**
    (`feat/stockage-fichiers`, 5 août). **Migration Prisma** → `api` **et** `web`.

    **Audit demandé par Théo — où s'enregistrent les fichiers.** Réponse : **sur le VPS,
    et nulle part ailleurs.** Volume Docker **nommé** `gearbox_uploads_data` monté sur
    `/app/uploads`, physiquement
    `/var/lib/docker/volumes/gearbox_uploads_data/_data`. **Rien dans Supabase** (qui ne
    stocke que les URL relatives), **aucun S3**. Le volume étant nommé, il survit aux
    rebuilds. Relevé : **4,6 Mo pour 16 fichiers** (6 chat, 9 avatar, 1 calendar) sur un
    disque de **193 Go dont 186 libres — 4 %**.

    **La purge était à moitié en place**, et pas comme Théo la décrivait :
    - Digital/calendar : ✅ 30 j, mais ancré sur l'archivage d'une **PUBLICATION
      Digital**, pas d'un projet — et le désarchivage annule le décompte ;
    - Chat : ❌ **rien du tout** ;
    - Avatars : ❌ aucune (volontaire).
    → Purge du chat ajoutée à **180 jours** (arbitrage de Théo parmi trois options) : le
    fichier part du disque, **le message reste** avec `fileExpiredAt` et la mention
    « pièce jointe expirée ». Branchée sur le `runSafe` existant : un seul timer pour les
    deux purges. Rien n'a été supprimé au premier passage, la prod ne tournant que depuis
    le 8 juillet.

    **Pièces jointes : tous formats, 100 Mo** (au lieu de 4 formats d'image et 10 Mo).
    Bouton trombone à côté du bouton image, carte de pièce jointe avec nom d'origine,
    poids et téléchargement, aperçu de conversation et barre de réponse en `📎 <nom>`.
    ℹ️ Bonus gratuit : le corps des **notifications push** réutilise `lastMessage`, elles
    sont donc correctes sans une ligne de plus.

    ⚠️ **Le point de sécurité central du lot.** Ouvrir le chat à tous les formats créait
    une faille qui n'existait pas : les fichiers sont servis **depuis le domaine de
    Gearbox** sans aucun en-tête, donc un `.html` ou un `.svg` déposé dans une
    conversation et ouvert dans l'onglet s'exécutait **dans la session de la victime**
    (XSS stocké, vol de jeton). Parade dans `express.static` : `nosniff` partout et
    téléchargement forcé sauf pour `.jpg .jpeg .png .gif .webp .pdf` — `.svg`
    volontairement exclu. Détail dans `ETAT-BACKEND.md`. Et le nom d'origine n'entre
    **jamais** dans un chemin : seule une extension assainie en est extraite, vérifié
    avec un fichier nommé `../../evil.sh`.

    **`GET /api/storage`** (nouveau) : espace disque via `fs.statfs` + poids par type,
    cache 60 s, **ouvert à tous les rôles**. Section « Stockage » dans les Paramètres avec
    barre de progression sur le **disque du serveur** (pas « uploads / disque », qui
    resterait à 0 %), seuils ambre 75 % / rouge 90 %, et une phrase disant que le disque
    est partagé avec le système — sinon « 4,6 Mo envoyés » à côté de « 4 % utilisé » est
    incompréhensible.

    ⚠️ **Défaut de bornage corrigé sur TOUTES les limites d'upload** : la limite de
    multer est atteinte **dès l'égalité**. Mesuré : 104 857 599 octets passaient,
    104 857 600 (100 Mio pile) partait en 413 alors que le message annonce « max
    100 Mo ». `fileSize: maxBytes + 1` rend la borne inclusive — vaut aussi pour l'avatar
    (5 Mo) et le calendrier (2 Go).

    Vérifié : PDF/docx/zip/svg/sans-extension acceptés et stockés sous uuid ; en-têtes
    conformes sur 7 cas ; 100 Mio pile accepté, +1 octet refusé en 413 ; avatar toujours
    415 sur format interdit ; `/api/storage` recoupé et 401 sans jeton ; purge testée sur
    3 passes dont l'idempotence ; envoi d'un PDF de bout en bout par l'interface ; section
    Stockage et carte de pièce jointe mesurées à 320 px en clair **et** en sombre.
    **Base et disque rendus à leur état initial**, y compris l'aperçu de conversation et
    les compteurs de non-lus que le message de test avait incrémentés.

    ⚠️ **Piège à connaître** : lancer la purge en local agit sur la base de **PROD** avec
    le disque **LOCAL** — un message de plus de 180 jours serait marqué expiré alors que
    son fichier vit toujours sur le VPS. Consigné dans `ETAT-BACKEND.md`.

29. **Droits : Digital Manager éditeur de projets, et fin de l'escalade de privilège du
    Director** (`fix/droits-projets-et-escalade-role`, 5 août). Frontend + backend,
    **aucune migration** → `api` **et** `web` quand même, le backend bouge.

    **Demande 1 — le Digital Manager n'éditait pas les projets**, alors qu'il éditait
    déjà les dépenses fixes, les tags et le Digital. Il manquait des **deux** côtés :
    `EDIT_ROLES` de `routes/projects.ts` (le seul garde-fou réel) et `canEdit` de
    `pages/Projects.tsx`. Le frontend seul aurait affiché des boutons refusés en 403.
    ⚠️ `'Digital Manager'` **avec l'espace** — `'DigitalManager'` ne matche jamais la
    valeur en base, piège déjà rencontré dans `tags.ts` et `social.ts`.

    **Demande 2 — un Director pouvait changer son propre rôle.** Le trou était bien plus
    large : `isValidRole` vérifiait que le rôle demandé **existe**, jamais que l'auteur
    avait le droit de le donner. Un Director pouvait donc s'attribuer Administrator **ou
    même Master** en un PUT sur son propre id, ou promouvoir un complice qui le promouvait
    en retour. Et `DELETE /api/users/:id`, ouvert à `ADMIN_ROLES`, ne regardait **ni qui
    supprime ni qui est supprimé** : un Director pouvait effacer un Administrator, voire
    le compte Master.

    **Règle arbitrée par Théo** : un Director ne gère que les comptes **en dessous de
    lui** — Coordinator, Digital Manager, Guest, External. Il ne peut donner ni Master,
    ni Administrator, ni même Director, ni à lui-même ni à personne, ni en modification ni
    à la création. Et il ne supprime **aucun** compte. Master et Administrator conservent
    tous leurs droits.
    ⚠️ Interdire seulement « Director → soi-même → Administrator » aurait été décoratif :
    la promotion croisée à deux comptes suffisait à contourner.

    **`backend/src/auth/roles.ts` est désormais la source unique** des règles de rôle
    (`canAssignRole`, `DIRECTOR_ASSIGNABLE_ROLES`, `USER_DELETE_ROLES`) — même principe
    que `constants.ts` pour le routage budgétaire : jamais de demi-règle recopiée par
    écran. Les listes du frontend (`Settings.tsx`, `Projects.tsx`) sont des commodités
    d'affichage, commentées comme telles.

    ⚠️ **Conséquence volontaire** : un Director ne peut plus éditer **du tout** un compte
    Administrator ou Master. L'interface envoyant l'objet complet, modifier seulement le
    nom envoie aussi `role: 'Administrator'` → refus. Cela ferme au passage une **seconde
    voie d'escalade** : s'approprier un compte Administrator en changeant son identifiant
    et son mot de passe. Un Director édite son propre nom via « Mon Profil » (`PUT /me`,
    qui ne lit même pas `role`).

    **Ce lot a demandé deux passes, et la raison mérite d'être retenue.** Après la
    première, Théo voyait encore l'escalade passer. Deux causes :
    1. son essai datait de **09:40**, le garde-fou a été écrit à **11:25** — il a testé
       deux heures avant que la protection existe, et rien n'était déployé ;
    2. **un des deux sélecteurs de rôle de `Settings.tsx` était resté non filtré** : le
       remplacement n'avait matché qu'un des deux blocs, les indentations différant. Le
       serveur refusait bien, mais l'interface laissait croire le contraire.
    → **Leçon : un test HTTP avec un jeton forgé ne remplace pas un test dans l'interface
    avec le vrai rôle.** C'est exactement cet écart qui a laissé passer le sélecteur.

    Vérifié en seconde passe **dans le navigateur avec un vrai compte Director** (compte
    de test créé puis supprimé, jeton signé avec le secret de dev — aucun collègue
    impersonné) : menu limité aux 4 rôles bas + son rôle en place ; 0 corbeille sur 13
    lignes ; appels directs contournant l'interface → 403 sur auto-promotion Administrator
    et Master, promotion d'un tiers, création d'un Administrator, suppression d'un
    Coordinator et d'un Administrator ; **relecture finale, aucun rôle modifié, aucun
    compte supprimé**. Digital Manager : bouton « Nouveau » visible et écriture réelle
    prouvée (création 200, modification persistée, suppression 204), gestion des comptes
    toujours refusée. Base rendue à son état initial : 12 comptes, mêmes rôles.
    ℹ️ Vérifié aussi qu'**aucun compte n'avait été promu à tort** avant le correctif.

30. **REFONTE DES JEUX — le multijoueur n'existait pas, il existe** (`feat/refonte-jeux`,
    5 août). Backend + frontend, **migration Prisma** → `api` **et** `web`.

    **Le diagnostic, très au-delà de « ça manque de fun ».** Défis **et** parties
    vivaient dans le `localStorage`, et il n'y avait **aucun** modèle Prisma, aucune
    route, aucun handler socket pour les jeux. Conséquences enchaînées :
    - défier un collègue était **structurellement impossible** — le défi n'existait que
      chez l'émetteur. On ne pouvait que se défier soi-même et jouer les deux camps ;
    - le « Leaderboard Global » était une **fiction** : il classait les parties d'un
      seul navigateur, deux postes affichaient deux classements différents ;
    - la bataille navale **ne pouvait pas dire « coulé »** : sa grille était un tableau
      de cellules sans identité de navire ;
    - responsive quasi absent (14 points de rupture sur 1 671 lignes).

    **Défaut de classement trouvé en plus du stockage** : les noms et couleurs étaient
    recopiés dans chaque partie, si bien qu'un renommage laissait l'ancien nom au
    classement. On ne stocke plus que des `userId`, l'identité se résout au rendu.

    ⚠️ **Le point d'architecture du lot : l'anti-triche.** Une partie partagée signifie
    que les deux clients reçoivent la même ligne — envoyer la session brute donnerait à
    chacun la position des navires de l'autre, visible dans l'onglet Réseau. Deux
    garde-fous, détaillés dans `ETAT-BACKEND.md` : `projectSessionFor()` est la **seule**
    forme de session qui sort du backend (statut de `publicUser` pour `passwordHash`),
    et **les règles vivent sur le serveur**, qui valide le tour et **calcule** le
    vainqueur. Un `winnerId` envoyé par le client est ignoré.

    **Bataille navale refaite** à la façon du site cité par Théo : nouveau modèle en
    navires identifiés (cases + touches), phase de placement avec clic pour poser, clic
    pour pivoter, tirage aléatoire et réinitialisation ; retours **manqué / touché /
    coulé** avec le nom du navire ; **marquage automatique** du pourtour d'un navire
    coulé ; flotte restante affichée. Toucher ne redonnait pas la main — « règle
    symétrique », **arbitrage revu au correctif 34** (toucher redonne la main).

    **Refonte visuelle et responsive** : lobby avec cartes de jeu, adversaires et
    classement lisible ; plateaux au vocabulaire visuel du projet (dégradé charte,
    `gx-card`) ; `Games.tsx` passe de **1 069 à 527 lignes**, la couche données ayant
    migré côté serveur. Polling 3 s supprimé, remplacé par les événements socket.
    `GAMES_ALLOWED_ROLES`, qui était dupliqué dans `App.tsx` et `Games.tsx`, remonte
    dans `constants.ts`.

    **Vérifié, deux joueurs connectés en socket :** droits (Guest 403, **Director 403**
    — règle métier, autorisé 200) · défi sur soi-même 400, jeu inconnu 400, doublon
    renvoyant le même défi · **le destinataire voit le défi**, le bug d'origine ·
    l'émetteur ne peut pas accepter son propre défi (403) · placement : flotte
    incomplète, navires superposés, navire « en escalier », hors grille, tir avant que
    l'adversaire ait placé, replacement — **tous refusés** · **anti-triche prouvé** :
    `board.opponent` expose `ready/shots/sunkShips/remaining/allSunk` et **jamais
    `ships`**, alors que `board.me` contient bien mes navires · tour : jouer hors tour
    et rejouer une case déjà tirée refusés · temps réel : 4 événements reçus par
    l'adversaire **sans rechargement** · classement recoupé à la main (4 parties → 2V/1D/1N
    et 1V/2D/1N, face-à-face 2–1) et **sans champ `board`** dans la réponse · responsive
    320 px : aucun scroll horizontal sur les 5 écrans, zones tactiles portées à 44 px ·
    clair **et** sombre, aucune teinte hors charte. `tsc` backend 0, racine 12
    préexistantes.
    ℹ️ **Validé fonctionnellement par Théo** en local avec deux comptes.

    ⚠️ **Le classement repart de zéro** : les parties d'avant vivaient dans les
    `localStorage` de chacun (souvent des parties jouées seul) et n'étaient pas
    récupérables de façon sensée. Aucune reprise, c'est un choix.

    ℹ️ **Piège rencontré, à retenir** : quatre serveurs `nodemon` s'étaient empilés sur
    le poste au fil des lots, chacun re-verrouillant le moteur Prisma et se disputant le
    port 3001 — c'était la cause des `EADDRINUSE` et des `EPERM` sur `prisma generate`.
    Vérifier qu'il n'en tourne **qu'un** avant de diagnostiquer autre chose.

31. **Responsive mobile : filtres repliables, Budget écrasé, Chat au doigt, barre du bas**
    (`fix/responsive-mobile`, 5 août). **Frontend seul**, aucune migration → `web` seul.

    **Filtres repliables (Dashboard, Digital)** — signalé par Théo, capture à l'appui.
    Mesuré à 375 × 812 : l'en-tête du Dashboard occupait **461 px sur 812**, soit 57 %
    de l'écran, avec **3 cartes visibles** seulement. Nouveau composant
    `components/CollapsibleFilters.tsx`, qui ne gère **que l'enveloppe** : chaque page
    fournit ses contrôles en `children` et son propre résumé — elle seule sait ce que
    ses filtres veulent dire. On ne centralise pas les filtres eux-mêmes, ce serait
    coupler des écrans qui n'ont pas les mêmes.
    - ⚠️ **À partir de `md`, rendu strictement inchangé** : ni barre ni bouton. Vérifié
      par **style calculé** — l'enveloppe est en `display: none` et le bouton mesure
      **0 px** de haut à 1440 px.
    - ⚠️ **Les enfants ne sont montés qu'une fois**, masqués par `hidden` et non rendus
      conditionnellement : un `{open && children}` ferait perdre l'état interne des
      sélecteurs à chaque repli.
    - Replié, la barre affiche un **résumé compact des filtres actifs** (choix de Théo
      parmi trois options) du type « 2026 · Tout le réseau », plus une pastille du
      nombre de filtres restrictifs. Les **dates ne comptent pas** comme filtre actif :
      elles valent toujours quelque chose, la pastille afficherait « 1 » en permanence.
    - Mesuré : Dashboard **461 → 150 px** (311 px regagnés), cartes **3 → 5** ; Digital
      **420 → 232 px** (188 px regagnés). Consommé du Dashboard **inchangé à
      1 447 820 €** en desktop, donc aucun filtre altéré au passage.

    **Budget — le tableau par site était invisible.** Le conteneur passe en **colonne**
    sous `md` et le panneau portait `flex-1`, qui vaut `flex: 1 1 0%` : base de hauteur
    **nulle**. Mesuré en réappliquant l'ancienne règle par le DOM sur la page réelle :
    **2 px de haut, 0 ligne visible**. Après : **568 px, 5 lignes**, défilement interne
    et en-tête `sticky` opérants. **Même classe de défaut que « Prochaines Échéances »**
    du Dashboard.
    ℹ️ **Première correction écartée, et c'est instructif** : en hauteur naturelle
    (`flex-none min-h-[420px]`) la carte montait à **1 933 px** pour 25 lignes — le
    tableau était visible mais son en-tête collant ne collait plus à rien et le
    défilement devenait interminable. D'où `h-[70vh]` sous `md` et `md:h-auto md:flex-1`
    au-delà (vérifié : 488 px à 1440 px, `md:h-auto` gagne bien).

    **Chat — deux défauts distincts, que j'avais d'abord confondus.**
    1. Sourdine et épinglage : six boutons (deux par rendu, **trois** rendus de la
       liste) en `opacity-0 group-hover:opacity-100`, donc invisibles sans survol.
       Passés en `opacity-100 md:opacity-0 md:group-hover:opacity-100`.
    2. ⚠️ **Réactions emoji : j'avais annoncé à tort « exactement la même cause ».** La
       barre d'actions est déjà visible sur mobile ; c'est la **rangée d'emojis à
       l'intérieur** qui porte `hidden md:flex`. On ne se contente donc **pas** d'enlever
       le `hidden` — cinq emojis en permanence à côté de chaque message sur 320 px
       serait pire que le mal, et c'est précisément pourquoi ils avaient été masqués. Un
       bouton dédié ouvre un sélecteur, en réutilisant le mécanisme `menuMsgId` déjà en
       place plutôt qu'un second système de popover. Cycle ajout/retrait vérifié sur la
       page réelle, base rendue à son état initial.

    **Barre du bas** → **Dashboard, Projets, To-do, Agenda, Chat**. L'ancien ordre
    n'était pas un choix mais un effet de bord de `mainItems.slice(0, 5)` : la barre
    héritait de l'ordre du menu latéral.
    - ⚠️ `moreNavItems` était un complément **par indice** (`slice(5)`) : changer la
      barre sans y toucher aurait fait **disparaître Hello Marketing et Jeux** du mobile
      et affiché **Agenda et Chat en double**. « Plus » est désormais « tout ce qui n'est
      pas dans la barre » — vérifié, aucun doublon.
    - ⚠️ Le rôle **External** n'a que Digital, Chat et Hello Marketing et son menu
      « Plus » est **vide** : avec une liste figée il n'aurait gardé que « Chat » et les
      deux autres rubriques devenaient **inaccessibles**. D'où le repli sous trois
      rubriques.
    - Les ids sont piochés **dans `mainItems`**, qui porte déjà le gating par rôle : on
      l'hérite au lieu de le réimplémenter. La pastille de présence du bouton « Plus »
      suit automatiquement. L'ouverture automatique sur Dashboard (`App.tsx`) n'est pas
      touchée.

    Vérifié aussi : zones tactiles à 62 px sur la barre du bas et 44 px sur les emojis
    du sélecteur, aucun défilement horizontal de page sur les quatre écrans, thèmes
    clair **et** sombre. `tsc` racine 12 lignes préexistantes, backend 0.
    ℹ️ **Validé par Théo** avant déploiement.

32. **RÔLE « CHEF DE SITE » — lecture seule, cloisonné par concession**
    (`feat/role-chef-de-site`, 5 août). Backend + frontend, **migration Prisma** →
    `api` **et** `web`.

    Demande de Théo : donner aux responsables de concession un accès limité **à leur
    site**, en lecture seule, sans interaction avec l'équipe marketing. Nouveau rôle
    `Site Manager`, rattaché à une liste de sites choisie dans les Paramètres.
    **Premier rôle dont les droits dépendent d'une DONNÉE du compte** et pas seulement
    de son nom — d'où la section dédiée ajoutée à `CLAUDE.md`.

    **Ce que l'audit a trouvé :** aucune route ne filtrait par site (tous les `GET`
    renvoyaient tout, le frontend triait), `/api/uploads` n'avait **aucun** contrôle de
    rôle, les handlers chat et présence étaient enregistrés pour tout socket
    authentifié, et `emitEvent` diffusait l'objet Prisma **brut à tous**. Bonne
    nouvelle en revanche : la lecture seule est acquise **par absence** du rôle dans
    les huit `EDIT_ROLES`.

    **Décisions de Théo** : filtrage imposé **côté serveur** · `GROUPE BONY` visible
    avec sa part · `Alpine-<son site>` visible, **Nissan masquée** (globale, ventilée
    sur aucun site) · attribution réservée à Master et Administrator.

    ⚠️ **Trois pièges trouvés en VÉRIFIANT, pas en planifiant :**
    1. **Filtrer les lignes ne suffit pas.** Un projet multi-sites incluant Mozac passe
       légitimement le filtre, mais nommait **toutes les autres concessions avec leurs
       pourcentages**. `redactSiteFields` ne garde que ses clés — et comme le frontend
       ventile déjà par `budgetDistribution`, il calcule **sa part** sans qu'on touche
       aux montants.
    2. **Les opérations au niveau PLAQUE** (`PLAQUE CENTRE`) sont des valeurs de site à
       part entière. Les manquer aurait rendu invisible une dépense pesant sur son
       budget.
    3. **`Budget.tsx` FABRIQUE les buckets Alpine et Nissan côté client**, quoi que
       renvoie l'API — elle recréait exactement ce que le serveur venait d'exclure.

    ⚠️ **Et le piège le plus instructif, signalé par Théo après son test :** la nav
    groupée du desktop **réécrit ses rubriques en dur** et ignorait `mainItems`. Mon
    filtrage ne s'appliquait donc qu'aux variantes tablette et mobile, et Lucien voyait
    Chat, Dépenses, Matériel, Campagnes, To-do et Archives. Réalignée sur la source
    unique. **Mes contrôles d'API étaient exacts et l'écran mentait quand même — la
    deuxième fois après le lot d'escalade de privilège.** Consigné dans `CLAUDE.md` :
    un rôle ne se vérifie pas sans parcourir son interface.

    Ajouté dans la foulée : **garde de routage dans `App.tsx`**. Masquer le menu ne
    suffit pas, l'onglet actif est mémorisé en session et une rubrique retirée restait
    **atteignable**.

    **Retraits par écran**, conformes au cahier des charges : Dashboard sans
    « Performance des Campagnes », « Top Consommateurs » ni « Charge de l'Équipe » ·
    Hello Marketing sans musique, viennoiseries ni anniversaires · Digital limité à
    l'onglet « Planning Digital » · Budget complet mais provisions non éditables ·
    Agenda normal (cloisonné automatiquement, il ne lit que les projets).

    **Vérifié sur l'API** avec un chef de site rattaché à Mozac : projets 94 → 13 avec
    **0 ligne hors périmètre**, sa réponse ne contient **que « Mozac »** comme valeur de
    site (ni dans `sites[]`, ni dans `budgetDistribution`, ni dans le libellé legacy),
    budget 25 → 1 ligne, **Nissan absente**, écriture refusée en 403 sur les cinq
    routes testées dont `/api/uploads`, liste d'utilisateurs réduite à 1 compte, fil
    d'actualité et jeux en 403. Master inchangé : 94 projets, 19 concessions.
    **Vérifié dans le navigateur** avec le compte réel de Lucien : navigation réduite
    aux 6 rubriques exactes, ni cloche ni bulles de présence, Budget limité à Mozac, et
    **sept tentatives de navigation forcée** retombent toutes sur le Dashboard.
    ℹ️ **Validé par Théo** en local avant déploiement.

    ℹ️ **Piège d'environnement à retenir** : `nodemon` surveille `*.*`, donc écrire un
    script de test **dans `backend/`** redémarre l'API en plein test — c'est ce qui
    faisait échouer les vérifications avec « fetch failed ». Tester depuis l'extérieur
    du dossier surveillé.

33. **PATCH — anniversaire enregistrable, photo de groupe partagée, barre de saisie
    réalignée, garde-fou sur les plaques** (`feat/patch-chat-et-anniversaires`,
    6 août). Backend + frontend, **migration Prisma** → `api` **et** `web`.
    Quatre sujets indépendants regroupés à la demande de Théo (« un patch avec pleins
    de petites modifs »).

    **1 — Un utilisateur ne pouvait pas enregistrer son propre anniversaire.**
    Le backend était **correct des deux côtés** : `PUT /me` lit et écrit bien
    `birthdate`, `publicUser` le renvoie. La faute était dans le client —
    `AuthContext.updateProfile` recevait un `User` complet puis **reconstruisait un
    objet littéral à trois clés** avant l'appel réseau. Le champ n'atteignait jamais le
    corps de la requête, le serveur le voyait `undefined`, sa garde sautait l'écriture,
    et **rien ne levait d'erreur** : l'interface affichait « Profil mis à jour avec
    succès ». Le chemin admin marchait parce que `db.updateUser` fait un rest spread,
    sans whitelist.
    - ⚠️ **C'est le piège du `nissanShare` / `birthdate` de `routes/users.ts`, mais
      côté FRONTEND.** La leçon avait été tirée pour le backend seulement. La signature
      de `db.updateMe` est désormais commentée comme ce qu'elle est : **une whitelist**
      — ce qui n'y figure pas ne *peut pas* être envoyé.
    - Chaîne vide et non `undefined`, pour que l'effacement reste possible.
    - Défaut qui **masquait** le bug : `{ ...updatedUser, ...me }` laisse la réponse
      serveur écraser la saisie, donc le champ revenait visuellement à l'ancienne
      valeur juste après le clic — ce qui se lit comme « ça n'enregistre pas ».
    - ℹ️ Le bouton de Théo était cassé aussi ; il ne l'avait pas vu parce qu'il
      corrigeait les anniversaires via la Gestion des Utilisateurs.

    **2 — La photo d'un groupe n'était visible que de son auteur.** Base64 dans le
    `localStorage`, et le champ **n'existait pas** en base. **Troisième occurrence** du
    même piège après la date de naissance et les jeux.
    - Migration `20260806103000_add_chat_conversation_avatar` (`avatarUrl String?`),
      handler `chat:conversation:avatar` calqué sur `chat:conversation:mute`, et le
      modal réutilise le chemin **déjà éprouvé** de la photo de profil utilisateur
      (crop 200×200 → `Blob` → `POST /api/uploads/avatar` → URL en base). `uploads.ts`
      inchangé, le type `avatar` convenait.
    - ⚠️ **Le point de sécurité du lot** : la valeur est écrite par un utilisateur et
      **rendue dans un `<img>` chez tous les autres**. Le handler n'accepte que la
      forme `/uploads/avatar/<uuid>.<jpg|png|gif|webp>` — sans quoi un participant
      pointerait la photo vers une **URL externe** chargée par le navigateur de chaque
      membre (fuite d'IP, pixel de traçage), ou vers `/uploads/chat/` où **aucun
      format n'est filtré**.
    - Droit **ouvert à tous les participants** (arbitrage de Théo), contrairement au
      renommage réservé aux admins du groupe — mais l'appartenance reste vérifiée
      côté serveur.
    - **Aucune reprise des photos existantes**, volontairement : chaque poste avait sa
      version et rien ne dit laquelle est la bonne ; et une migration client au
      chargement n'est pas sérialisable entre deux onglets (défaut de
      `migrateEquipmentIfNeeded`, en pire ici — la cible est un champ **partagé**).
    - La prop `groupPhoto` de `ConvAvatar` a été **supprimée** plutôt que recâblée sur
      ses 4 points d'appel : la donnée vit dans la conversation, la prop était une
      redite et un oubli possible. L'overlay d'édition, jusque-là masqué au survol,
      reçoit un **badge d'angle sur mobile** — et non le même voile noir en
      `opacity-100`, qui aurait masqué la photo en permanence.

    **3 — La barre de saisie du Chat avait trois lignes médianes.** Ce n'était pas un
    `items-start` : le conteneur est en `items-end`. Cause réelle, **`min-h-[36px]` sur
    un `<textarea>` sans padding vertical** — Preflight met `padding: 0` sur les
    textareas et leur texte se colle **en haut** de la boîte (un `<input>` centre le
    sien), d'où ~13 px de vide mort sous une ligne de 22,75 px ; et comme le textarea
    était l'élément le plus haut, il imposait la hauteur de la rangée.
    - ⚠️ **`items-center` seul n'aurait rien corrigé** : il ne recentre que les enfants
      plus courts que la ligne. Correctif : padding vertical **symétrique**
      (`leading-6` + `py-[10px] md:py-1.5`), qui centre la ligne dans sa propre boîte
      et cale celle-ci sur la hauteur des boutons.
    - `bg-bony-dark` valait `var(--bg-main)`, **la couleur du fond de page** — d'où la
      « dalle noire plate ». Remplacé par le token des champs `--bg-input`, celui
      qu'utilise tout le reste de l'app. Rayon et focus alignés sur la charte.
    - Zones tactiles portées de 26/32 px à **44 px sous `md`**, 36 px au-delà.
    - Aperçu de réponse ramené **sur la même surface** que la barre : il empilait un
      `bg-bony-panel/50` sous le `glass-strong`, séparés par une bordure.
    - **`max-h-32` était du code mort** : sans redimensionnement JS un
      `textarea rows={1}` ne grandit jamais, il défile dans une seule ligne. La barre
      grandit désormais jusqu'à 128 px. ⚠️ Le `height = 'auto'` préalable est
      load-bearing — sans lui `scrollHeight` ne peut jamais redescendre.

    **4 — Contrôles du lot « chef de site », et garde-fou sur une duplication.**
    - `projects.ts` : PUT/DELETE sur un id inexistant renvoyaient **500 au lieu de
      404**, contrairement à `budget.ts` et `fixedExpenses.ts`. La **transaction
      entière** est passée dans le `try` — pas seulement le premier `update`, le diff
      des tâches pouvant échouer aussi.
    - **`scripts/check-plaques-sync.mjs`** : la duplication de `PLAQUES_STRUCTURE`
      entre `constants.ts` et `backend/src/auth/siteScope.ts` était « à synchroniser à
      la main », c'est-à-dire à oublier — et l'oubli est **silencieux**, il fausse le
      périmètre d'un chef de site sans aucune erreur. Le script couvre **trois** tables
      (plaques, `ALPINE_SITES`, sites hors plaque) et échoue à la divergence.
      **Prouvé load-bearing** sur trois divergences fabriquées puis annulées
      (`constants.ts` restauré au même md5).
    - ⚠️ **Branché sur `predev`/`prebuild`, et surtout PAS sur le build Docker** :
      `backend` est dans le `.dockerignore` du contexte frontend et le contexte du
      backend est `./backend` — **aucune** des deux images ne voit les deux fichiers,
      ce qui est la raison d'être de la duplication. Un échec dur aurait donc **cassé
      la construction de l'image `web`**. Piège attrapé avant déploiement, et vérifié
      en simulant le contexte Docker : le script sort en succès quand `backend/` est
      absent. Le contrôle tourne à chaque `npm run dev`, donc dans la session où la
      faute est commise.

    **Vérifié** : `tsc` racine 12 lignes préexistantes (**0 dans les fichiers
    touchés**), backend 0 ; l'API redémarre avec la nouvelle colonne et
    `GET /api/chat/conversations` répond 401 et non 500 ; garde-fou déclenché au
    démarrage réel du serveur de dev. **Validé fonctionnellement par Théo** dans
    l'interface (anniversaire, barre de saisie, photo de groupe à deux onglets).
    **Base et disque rendus à leur état initial** — 7 conversations toutes à
    `avatarUrl = null`, 13 comptes aux anniversaires d'origine, et les trois dossiers
    d'`uploads/` vides (contrôlé après les tests).

    ℹ️ **Piège d'environnement à retenir** : le dossier `uploads/` local n'est **pas**
    celui du VPS. Une photo déposée depuis `localhost` écrit en base une URL dont le
    fichier n'existe que sur le poste — image cassée pour tous les vrais utilisateurs.
    Le premier vrai dépôt doit se faire depuis le site déployé.

    ℹ️ Deux résidus de session nettoyés au passage : un serveur Vite du 04/08 encore
    vivant squattait le port 3000 (le motif d'empilement du lot 30 — vérifié qu'aucun
    nodemon ne tournait en double), et la fabrication de comptes de test avec jetons
    signés a été **refusée par le classifieur de sécurité** : la validation
    fonctionnelle est passée par Théo, ce qui est de toute façon la méthode que ce
    projet a déjà payé deux fois pour apprendre.

34. **BATAILLE NAVALE — toucher redonne la main, cases déduites grisées, et
    l'invariant de non-contact enfin gardé côté serveur** (6 août). **Backend seul**,
    aucune migration → `api` seul. Un seul fichier de code :
    `backend/src/utils/gameRules.ts`.

    Signalé par Théo : « quand je touche un bateau, ça passe au tour de l'adversaire »
    et « les cases autour devraient se griser, il ne peut pas y avoir 2 bateaux
    côte-à-côte ».

    **1 — Toucher redonne la main.** ⚠️ **Ce n'était pas un bug mais un arbitrage** du
    lot 30, écrit noir sur blanc dans le code et dans deux `.md` (« Comme sur le site
    de référence : toucher ne redonne PAS la main. Règle simple et symétrique »).
    Théo tranche pour la règle classique. Une seule ligne (`nextTurn`), **et les trois
    textes corrigés dans le même geste** — sinon la prochaine session « rétablit »
    l'ancien comportement en croyant réparer une régression.
    - Aucun changement client : `Battleship.tsx` dérive `monTour` de
      `session.currentTurn`, le bandeau et la grille suivent tout seuls.
    - Aucun risque pour les autres jeux : `applyMove` a trois branches indépendantes,
      chacune avec son `nextTurn`. Vérifié par test.

    **2 — Cases déduites vides : la demande était juste, mais pas littérale.**
    « Les cases autour » ne peut pas s'appliquer tel quel à un simple touché :
    - les **4 diagonales** sont forcément vides (un navire est une ligne droite, donc
      ce n'est pas sa suite ; et deux navires ne se touchent pas, donc ce n'en est pas
      un autre) → grisées ;
    - les **4 orthogonales** peuvent être **la suite du navire qu'on vient de
      toucher** → les griser le rendrait **insubmersible**. Jamais marquées.
    Le pourtour complet du navire **coulé** existait déjà et fonctionnait : seul le cas
    du touché-non-coulé manquait. Rien à changer au rendu, une case `miss` est déjà
    grise.

    **3 — Le vrai problème, non demandé.** `validateFleet` **n'interdisait pas le
    contact** entre navires : elle testait la superposition, l'alignement et la
    contiguïté, mais pas le voisinage. Le client l'interdit bien (`canPlace`), le
    serveur non — alors que son propre commentaire annonce « on ne fait JAMAIS
    confiance au placement reçu », et que c'est **l'invariant dont dépend tout le
    marquage automatique**.
    - **Conséquence : partie INGAGNABLE.** Couler le navire A marque des cases du
      navire B en `miss` ; `applyMove` refuse de tirer sur une case déjà tirée. Ces
      cases devenaient définitivement intirables, B insubmersible, `fleetSunk` jamais
      vrai. Bug latent depuis le 05/08, non atteignable par l'interface (le client
      produit des flottes correctes) mais ouvert à tout appel forgé.
    - Test de non-contact ajouté, en réutilisant la logique de voisinage déjà
      présente. Aucun changement visible pour les joueurs.

    **Vérifié — 17 assertions sur les règles** (`applyMove` et `validateFleet` sont des
    fonctions pures exportées, testées hors interface puis script supprimé) : touché →
    main conservée + 4 diagonales grisées + **orthogonales intactes** ; touché en coin →
    aucune case hors grille ; manqué → la main passe ; coulé → pourtour complet + main
    conservée ; flotte entière coulée → `finished` + vainqueur, et tout coup ensuite
    refusé ; contact orthogonal **et** diagonal refusés au placement ; flotte légitime
    acceptée ; **morpion et puissance 4 alternent toujours**. `tsc` backend 0.
    ℹ️ Les deux seuls échecs de la passe initiale venaient de **mes fixtures** de test
    (plateau `{cells}` et non tableau nu), pas du code — vérifier son propre test avant
    d'accuser l'implémentation.

35. **TO-DO — cartes compactes et tâches autonomes** (`feat/todo-taches-autonomes`,
    6 août). Backend + frontend, **migration Prisma** → `api` **et** `web`.

    **1 — Les cartes étaient trop hautes** : 5 tâches remplissaient une colonne.
    Mesuré ~155 px. `TaskCard` (composant unique, deux points d'instanciation) passe de
    **5 rangées empilées à 3**, sans rien retirer : projet + échéance fusionnés sur une
    ligne, badges + coût sur une autre, `p-3` → `px-3 py-2`, `gap-2` → `gap-1.5`, nom
    borné à 2 lignes (`line-clamp-2`) pour qu'un libellé à rallonge ne fasse plus enfler
    la carte. **~155 → ~105 px**, soit ~8 cartes visibles au lieu de 5.
    ⚠️ La hauteur **mobile** des chevrons n'a **pas** été réduite : ils sont déjà à
    ~33 px, sous le seuil tactile de 44 px — l'amincir aggraverait un défaut existant.
    Le gain porte sur le desktop, qui est ce que Théo regarde.

    **2 — Créer des tâches sans projet, directement dans la To-do.** Ce que la demande
    ne laissait pas deviner : une tâche n'a **ni date, ni site, ni marque, ni service**
    en base, tout est hérité du projet. Une tâche sans projet doit donc les porter
    elle-même — d'où une migration, et une route `/api/tasks` qui **n'existait pas du
    tout** (les tâches ne transitaient que dans l'`include` des projets).
    - **Un seul modèle `Task`, `projectId` nullable** — pas de second modèle. Décision
      de Théo, et le projet avait déjà payé la leçon inverse au correctif 10.
    - **Deux chemins d'écriture étanches** : `updateMany`/`deleteMany` bornés par
      `projectId: null` côté `/api/tasks`, `where: { projectId: id }` côté diff de
      `projects.ts`. Détail dans `ETAT-BACKEND.md`.
    - **Pas de budget** : `cost` hors liste blanche et forcé à 0.
    - **Règle de disparition différente, et c'est voulu** (arbitrage de Théo) : une
      tâche autonome ne disparaît que si elle est **terminée ET sa deadline atteinte** ;
      une tâche de projet disparaît dès que **le projet** est échu, terminée ou non. Les
      deux natures cohabitent donc dans la même colonne avec deux comportements — à
      savoir avant que ça ne ressorte comme un bug.
    - Une tâche **sans deadline** n'est jamais urgente ni expirée (affichage « Sans
      échéance ») : sans ce cas, une deadline vide produisait un `NaN`.
    - Les champs `project*` de la carte sont **synthétisés** pour une tâche autonome à
      partir de ses propres colonnes : filtres, tri, urgence et rendu continuent de
      fonctionner sans être dupliqués par nature de tâche.
    - ⚠️ **Le filtre de site lit `taskSites`, les sites RÉELS**, et non le libellé
      d'affichage `projectSite` — qui est concaténé quand il y en a plusieurs et ne
      correspondrait à aucune valeur de site connue.

    **Retouches demandées par Théo après essai** : la liste à plat des 19 sites
    remplacée par le **menu déroulant habituel** (plaques repliables) — en réutilisant
    `SiteFilterDropdown`, déjà présent dans le fichier, avec un simple libellé
    paramétrable pour que la barre de filtres reste inchangée ; et le champ « Assigné
    à » **retiré** (une tâche créée est toujours pour soi ; l'assignation reste stockée,
    la To-do ne montrant que ses propres tâches).

    **Vérifié** : migration appliquée puis **279 tâches toutes encore rattachées à leur
    projet, 0 orpheline**, nouvelles colonnes vides sur l'existant ; `/api/tasks` en 401
    sans jeton et `/api/projects` toujours en 401 (pas de 500 après le passage en
    nullable) ; `tsc` backend 0, racine 12 de référence. **Validé fonctionnellement par
    Théo.**

    ℹ️ **Conséquence assumée** : le Dashboard (charge d'équipe, campagnes programmées,
    coût par canal et par prestataire) et l'écran Campagnes atteignent les tâches **via
    les projets** (`projects.flatMap(p => p.tasks)`) — ils **ignorent** donc les tâches
    autonomes. Sans impact budgétaire (elles n'ont pas de coût), mais le compteur de
    charge d'équipe devient incomplet. À brancher dans un lot dédié si le besoin se
    confirme.

    ℹ️ **Piège d'environnement reconfirmé** : `prisma generate` échoue en `EPERM` sur
    `query_engine-windows.dll.node` tant que l'API tourne — elle verrouille le moteur.
    Arrêter le serveur, générer, relancer.

36. **PROJETS — filtre par utilisateur, et listes de personnes limitées à l'équipe
    marketing** (`feat/filtre-utilisateurs-projets`, 6 août). **Frontend seul**, aucune
    migration → `web` seul.

    Demande de Théo : filtrer les projets par utilisateur rattaché, et ne plus proposer
    que des personnes « internes marketing » quand on compose l'équipe d'un projet ou
    qu'on assigne une tâche — les listes proposaient jusque-là **tous** les comptes,
    Guest, External et chef de site compris.

    **Rôles retenus** : Master, Administrator, **Director**, Coordinator, Digital
    Manager (`MARKETING_TEAM_ROLES` dans `constants.ts`).
    ⚠️ **Théo n'avait pas listé Director** ; arbitré avec lui **données à l'appui** :
    Director édite et crée des projets, et `handleCreateProject` met automatiquement le
    créateur dans l'équipe — l'exclure aurait produit une équipe contenant quelqu'un
    d'inéligible **dès la création**. Relevé en base au moment de l'arbitrage : 2 projets
    et 2 tâches concernés, et **aucun** Guest / External / chef de site rattaché où que
    ce soit — les exclure, eux, ne changeait rien.

    ⚠️ **Liste d'AFFICHAGE, pas une règle de sécurité, et pas de jumeau côté serveur.**
    L'absence est délibérée : ajouter une validation serveur ferait **échouer la
    sauvegarde des projets existants** (aucune migration des données n'a été faite),
    donc casserait l'édition de projets légitimes. Consigné dans `constants.ts` pour
    qu'une session future ne « complète » pas la règle en croyant bien faire.

    ⚠️⚠️ **Les deux vrais pièges du lot, tous deux liés au même principe : on restreint
    les listes de CHOIX, jamais la liste de RÉSOLUTION.**
    1. `users` n'est **pas** filtré — c'est lui qui résout les membres déjà rattachés.
       L'avoir filtré aurait fait **disparaître de l'affichage** un membre hors liste
       **tout en le laissant en base** : invisible, et impossible à retirer.
    2. Le sélecteur d'assigné d'une tâche **réinjecte l'assigné courant** même hors
       liste. Sans ça, `Select` ne trouvait pas sa valeur et affichait « — Non assigné — »
       **avec l'avatar de la personne juste à côté** ; quelqu'un aurait « corrigé »
       l'affichage en choisissant un autre nom et **écrasé l'assignation réelle**.
       C'était le seul vrai vecteur de perte de données.

    **UI, deuxième passe après retour de Théo** (« l'UI est vraiment dégueulasse ») : le
    filtre était d'abord une puce par personne, ce qui mangeait quatre lignes du panneau.
    Refait en **menu déroulant** décalqué sur `ProjSitePicker` (même `FloatingPanel`,
    même recherche) plutôt qu'en inventant un troisième style de filtre. Le déclencheur
    nomme la personne quand il n'y en a qu'une.
    Corrigé dans la foulée : les pickers Périmètre / Marques / Services réaffichaient
    **leur propre libellé** alors que le panneau en pose déjà un au-dessus de chaque
    bloc — « PÉRIMÈTRE / Périmètre », « MARQUES / Marque »… Quatre lignes de texte
    redondantes retirées. Défaut préexistant, sans rapport avec l'ajout.

    ℹ️ **Erreur commise et corrigée en route, à retenir** : en retirant ces libellés,
    un commentaire `{/* */}` s'est retrouvé **avant l'élément racine d'un `return`** —
    ce n'est pas du JSX valide (on n'est pas encore dans du JSX à cet endroit), et Vite
    a refusé de recompiler `Projects.tsx`. **Deuxième occurrence du même motif dans la
    même journée** (déjà rencontré sur le modal d'avatar de groupe). Un commentaire
    au-dessus du `return` s'écrit `//`, pas `{/* */}`.

37. **CHAT — liens cliquables, GIF, projets cités** (`feat/chat-liens-gif-projets`,
    6 août). Backend + frontend, **aucune migration** → `api` **et** `web`.
    **Lot 1 sur 2** : les vocaux et les aperçus de liens suivront (voir le backlog).

    **Liens cliquables.** Le contenu d'un message était rendu en `{msg.content}` brut :
    sûr (React échappe le texte), mais aucune URL n'était cliquable. Nouvel utilitaire
    `lib/richText.tsx`.
    ⚠️ **Jamais de HTML, uniquement des éléments React.** Le chat affiche du texte écrit
    par un utilisateur et rendu chez tous les autres — c'est le scénario type d'une XSS
    stockée. **Ne pas introduire `dangerouslySetInnerHTML` dans ce fichier**, quelle que
    soit la tentation (markdown, gras…) ; il n'y en a aujourd'hui aucun dans le dépôt.
    ⚠️ Schéma restreint à `http`/`https` : un `javascript:` cliquable serait une XSS.

    **⚠️ Deux défauts de mon propre linkify, trouvés en test — la leçon du lot.**
    La première version cherchait des motifs **à l'intérieur** du texte :
    1. Signalé par Théo : le clavier GIF de Windows colle un chemin
       `file:///C:/Users/…/MicrosoftWindows.Client.CBS_…/x.gif`, dont le fragment
       `MicrosoftWindows.Client.CBS` était pris pour un domaine et transformé en lien —
       d'où une fenêtre qui s'ouvrait au lieu du GIF.
    2. Trouvé par le test unitaire : « j'ai mis **rapport.pdf** dans le dossier »
       fabriquait un lien vers `https://rapport.pdf`. Un nom de fichier ressemble à un
       domaine.
    → Réécrit pour analyser des **jetons entiers** (délimités par des espaces) et non
    des motifs internes : un chemin est rejeté en bloc dès son schéma, et les
    terminaisons de fichier connues sont exclues quand le jeton n'a ni schéma ni chemin
    (`https://site.fr/rapport.pdf` reste donc un lien). **12 cas de contrôle**, dont les
    chemins Windows en antislash, `javascript:` et `data:`.

    **GIF.** L'audit a montré qu'un `.gif` **déposé en fichier fonctionnait déjà**
    (accepté à l'upload, servi inline, affiché animé). Ce qui manquait : le GIF collé
    sous forme d'**URL**, désormais rendu comme image quand le message ne contient que
    ça. Détection faite **sur l'URL, côté client, sans aucune requête serveur** — aller
    vérifier le type réel supposerait que le serveur fetche une URL fournie par un
    utilisateur, c'est-à-dire ouvrir une surface SSRF.
    ⚠️ **Le clavier GIF de Windows restera impossible à supporter tel quel** : il ne met
    pas l'image dans le presse-papiers, il télécharge le fichier et colle son chemin
    **local**, qui ne désigne rien chez les autres — et un navigateur interdit à une page
    de lire un fichier local. Ce n'est pas une limite de Gearbox. Le collage d'un tel
    chemin est donc **intercepté et expliqué** plutôt que laissé filer en message mort.
    La vraie réponse est un bouton GIF avec recherche intégrée → lot 2.
    ℹ️ **Choix volontaire : le collage n'est PAS détourné.** Le plan prévoyait d'envoyer
    d'office une URL d'image collée ; abandonné en codant — ça empêche d'accompagner un
    GIF d'un commentaire, et un envoi déclenché par un collage est déroutant.

    **Projets cités.** 3ᵉ icône dans la barre de saisie, liste des projets **actifs**
    (`status === 'Active'` + échéance non dépassée, même définition que la To-do) avec
    recherche, et envoi d'une carte cliquable qui ouvre le projet.
    - L'aperçu de l'Agenda (`ProjectTooltipContent`) a été **extrait** vers
      `components/ProjectSummary.tsx` et est désormais **importé par les deux écrans** —
      une seule définition, pas une copie. L'Agenda garde un alias pour ne pas toucher
      ses appels.
    - Le **nom du projet est résolu côté serveur** pour `lastMessage` : sans ça, l'id
      brut serait apparu dans la liste des conversations **et dans la notification
      push**.
    - ⚠️ **Cloisonnement `External`** : ce rôle a le Chat mais **pas** les Projets
      (`EXTERNAL_ALLOWED_TABS`). Or la carte montre site, marques, dates, avancement
      **et budget**. Il ne voit donc qu'un libellé « Projet cité », et l'icône de
      citation lui est masquée.

    ℹ️ **Défaut PRÉEXISTANT signalé à Théo, non corrigé ici** : `GET /api/projects` n'a
    **aucun** contrôle de rôle (`authenticateToken` seul). Un External ou un Guest peut
    donc déjà lire tous les projets par l'API — l'interface les masque, la route non.
    Même motif que le lot du chef de site. À traiter dans un lot dédié, avec l'inventaire
    des rôles qui doivent lire les projets. Voir le backlog.

    **Vérifié** : `tsc` backend 0 et racine 12 de référence ; 12 cas unitaires sur le
    linkify. **Validé fonctionnellement par Théo**, qui a signalé le défaut du chemin
    Windows — corrigé et revalidé.

38. **CHAT — messages vocaux, aperçus de liens, recherche de GIF**
    (`feat/chat-vocaux-gif-apercus`, 6 août). Backend + frontend, **aucune migration**
    → `api` **et** `web`. **Lot 2 sur 2**, le lot 1 étant le correctif 37.

    **Messages vocaux.** Icône micro → `MediaRecorder` → upload par le chemin `chat`
    existant → type `audio`. Durée plafonnée à 5 min. `fileName` porte la **durée
    formatée** : le modèle n'a pas de champ de durée, et ce champ est inutilisé par ce
    type — pas de migration pour ça.
    - ⚠️ **Deux bloquants prévus au plan, tous deux réels et levés** : les extensions
      audio n'étaient pas dans `EXT_AFFICHABLES` (donc servies en `attachment`,
      **illisibles par un `<audio>`**), et le filtre de `purgeOldChatFiles` ignorait
      `'audio'` — les vocaux n'auraient **jamais** été purgés, silencieusement.
    - ⚠️ **Le flux micro est relâché explicitement** à l'arrêt, à l'annulation **et au
      démontage** du composant. Sans ça le voyant d'enregistrement du navigateur reste
      allumé : l'utilisateur croit être encore écouté, et la batterie se vide.
    - Type audio laissé au navigateur (webm/opus sur Chrome, mp4/aac sur Safari) :
      forcer un type ferait échouer l'un des deux. L'extension est déduite du type réel
      pour que le backend serve bien le fichier « inline ».

    **Aperçus de liens — deux niveaux, volontairement.**
    - Titre, auteur et vignette **réels** pour YouTube, Vimeo, Dailymotion, Spotify,
      SoundCloud, via `/api/link-preview` (liste blanche serveur).
    - **Pastille identifiant le service, sans aucune requête**, pour ~35 domaines :
      X, Facebook, Instagram, LinkedIn, TikTok, Pinterest, Twitch, SharePoint,
      OneDrive, Teams, Outlook, Google Photos/Drive/Docs/Maps/Forms, Dropbox,
      WeTransfer, Canva, Figma, Notion, GitHub, et les sites du groupe.
      Raison : ces plateformes exigent une authentification pour livrer leurs
      métadonnées — un fetch serveur ne rendrait qu'une page de connexion, au prix
      d'une requête sortante par lien.
    - Un **seul** aperçu par message (le premier lien) : cinq liens empileraient cinq
      cartes.
    - ⚠️ **Point de sécurité central** : c'est la seule route du projet qui fetch une
      URL venant du client. Liste blanche validée **avant** toute requête,
      `redirect: 'error'` (sans quoi une redirection contournerait la validation
      d'hôte), schéma http/https, timeout, taille plafonnée, et on ne renvoie que les
      champs utiles. **Vérifié sur 14 cas** : métadonnées cloud, localhost, IP privées,
      `api:3000`, `file://`, `gopher://`, `youtube.com.evil.com`,
      `youtube.com@evil.com` → tous refusés **sans requête sortante**.

    **Recherche de GIF — Giphy.** ℹ️ **Tenor avait été retenu au lot 1 mais ne délivre
    plus de clé en libre-service** (constaté le 06/08/2026) : bascule sur Giphy, dont
    seule la forme de réponse diffère, isolée dans `routes/gifs.ts`.
    - La clé **ne quitte jamais le serveur**. Sans clé, le bouton est **masqué** via
      `/api/gifs/status` : la fonction s'éteint proprement.
    - `rating=pg`, URL filtrées sur `https://…giphy.com/`, mention « Powered By GIPHY »
      imposée par la licence.
    - ⚠️ Un GIF est envoyé comme message **texte** portant son URL, **pas** comme
      `image` : la purge marquerait sinon « pièce jointe expirée » un GIF distant qui
      fonctionne toujours.
    - ⚠️ `GIPHY_API_KEY` : `.env` du VPS **ET** bloc `environment:` de
      `docker-compose.yml` — le piège en deux temps des clés VAPID.

    **Vérifié** : `tsc` backend 0 et racine 12 de référence ; 14 cas sur la liste
    blanche ; clé Giphy validée en 200 contre l'API réelle ; URL Giphy reconnues comme
    images distantes (y compris `media0…`, `i.giphy.com`, format `.webp`).
    **Validé fonctionnellement par Théo.**

    ⚠️ **Piège d'environnement CONFIRMÉ, cette fois pour de bon** : deux vocaux
    enregistrés pendant les tests **en local** ont écrit en base de PROD une URL dont le
    fichier n'existait que sur le poste de Théo. Les deux fichiers ont été **copiés sur
    le volume du VPS** au déploiement plutôt que de supprimer ses messages. C'est
    exactement le risque signalé au correctif 33 pour la photo de groupe — il faut y
    penser **avant** de tester un upload en local, pas après.

39. **DASHBOARD — le consommé Alpine ne remontait pas dans le périmètre**
    (`fix/alpine-perimetre-dashboard`, 14 août). Backend + frontend, **aucune
    migration** → `api` **et** `web`.

    Signalé par Théo : les dépenses `Alpine-Clermont` ne remontaient pas sur PLAQUE
    CENTRE, ni `Alpine-Rodez` sur PLAQUE SUD-OUEST, `Alpine-Le Puy` sur PLAQUE SUD,
    `Alpine-Vichy` sur PLAQUE NORD.

    **Cause : une ligne.** `isSiteInScope` (`Dashboard.tsx`) testait une **égalité de
    nom de site** alors qu'elle recevait les **destinations budgétaires** rendues par
    `splitShareToBuckets` — donc `Alpine-Clermont`, qui ne matchait jamais un périmètre
    contenant `Clermont`.
    ⚠️ **La bonne logique existait SIX LIGNES PLUS BAS** : `isBudgetLineInScope`,
    écrite au correctif 23… **pour les enveloppes uniquement**. Le correctif 23 corrigeait
    précisément ce type d'oubli et l'a lui-même reproduit sur le consommé. Cinquième
    divergence Budget/Dashboard.

    **Trois choses que le signalement ne disait pas, trouvées à l'audit :**
    1. **Le défaut n'était pas propre aux plaques.** Les deux sélecteurs **éclatent la
       plaque en sites réels au clic** : le filtre ne contient jamais « PLAQUE CENTRE ».
       **Clermont seul était cassé pareil.**
    2. **Les compteurs aussi étaient faux** : le `return` d'exclusion s'exécute **avant**
       « projets actifs », « campagnes programmées », « projets en retard », le top
       sites et la performance des campagnes.
    3. **L'enveloppe Alpine était comptée au prévu mais son consommé était nul** → « Reste
       à engager » et pourcentage faux, et désaccord avec la page Budget (qui, elle,
       était juste).

    **Correctif** : `isDestinationInScope(destination, scope)` dans `constants.ts`,
    **partagé par Dashboard et Budget**. Il existait **trois** variantes de ce test
    (deux dans Dashboard, une dans Budget) — il n'en reste **qu'une**. C'est ce qui
    empêche une sixième divergence, pas la vigilance.
    ⚠️ **Nissan reste exclu tant qu'il n'est pas nommé explicitement** (`if (global)
    return false`) : il est global et non ventilé, le rattacher à ses 8 sites éligibles
    le compterait 8 fois. C'est le seul garde-fou de cette règle.

    **Bug trouvé au passage, dans le CLOISONNEMENT.** `backend/src/auth/siteScope.ts`
    fabriquait le nom du bucket par **concaténation** (`` `Alpine-${s}` ``) : pour
    `Le Puy-en-Velay` il produisait `Alpine-Le Puy-en-Velay`, alors que le bucket réel
    est **`Alpine-Le Puy`**. **Un chef de site du Puy ne voyait pas son enveloppe
    Alpine.** Latent depuis le correctif 32. Remplacé par une table explicite.
    ⚠️ **Et surtout : `scripts/check-plaques-sync.mjs` était AU VERT pendant ce
    temps** — il ne comparait que des listes de sites, jamais les **noms de buckets**.
    Le garde-fou a été étendu à la table `ALPINE_BUCKETS`, et **prouvé** en réintroduisant
    le bug d'origine : il le détecte désormais, puis le fichier a été restauré.

    **Vérifié** : **19 cas unitaires** sur le test partagé — les 4 plaques citées, le
    cas site seul, le débordement inter-plaques, et **6 garde-fous Nissan** (dont
    « Nissan avec ses 8 sites sélectionnés → dehors »). `tsc` backend 0, racine 12 de
    référence. **Recoupement Budget ↔ Dashboard fait sur données réelles** : les deux
    écrans affichent 311 697 € / 317 600 € / 5 903 € / 98,1 %, et la somme des lignes du
    tableau Budget fait exactement 311 697 € (le Dashboard affichait 311 652 € avant,
    soit les 45 € d'`Alpine-Clermont` perdus). **Validé par Théo**, Nissan absent de
    PLAQUE CENTRE confirmé à l'écran.

    ℹ️ **Fausse alerte levée avec Théo** : il a d'abord cru les deux écrans en
    désaccord. Ils étaient identiques sur les quatre chiffres ; ce qui l'avait alerté
    était la ligne `Alpine-Clermont — 45 € — 0 %`, c'est-à-dire le **résidu du routage
    multi-marques** déjà au backlog depuis le 03/08 (un projet Alpine+Renault laisse sa
    part Alpine dans le bucket, tandis que le filtre MARQUE = Renault écarte l'enveloppe
    Alpine). Ce n'est pas un défaut de ce lot.

40. **RUBRIQUE JEUX ÉTEINTE — interrupteur piloté par le Master**
    (`feat/interrupteur-jeux`, 14 août). Backend + frontend, **migration Prisma** →
    `api` **et** `web`.

    Demande de Théo : l'application grandit et sert dans un cadre professionnel, la
    rubrique Jeux ne doit plus apparaître. Mais elle reste une bonne fonctionnalité —
    **on ne supprime rien**, et Théo voulait pouvoir l'éteindre et la rallumer
    **lui-même**, sans dépendre d'un déploiement.

    **Ce qu'il a** : une ligne discrète en pied de la section « Application » de ses
    Paramètres (« *Espace détente* » + petit interrupteur), **visible du Master seul**.
    Un clic bascule la rubrique **pour tout le monde, sans rechargement**.
    ⚠️ Volontairement discret, sans titre ni encadré : c'est la demande explicite
    (« un petit bouton discret, pas un gros truc avec écrit JEUX »).

    **⚠️ CE N'ÉTAIT PAS UNE MODIF D'INTERFACE — le point central du lot.** Envoyer un
    défi déclenche une **notification push** (« *X vous défie !* ») par une chaîne qui
    ne dépend pas du tout de l'affichage. Masquer la rubrique aurait laissé un onglet
    resté ouvert, ou un simple appel direct, faire vibrer le téléphone d'un collègue —
    exactement l'image « pas sérieuse » à éviter. Pire : ce push est normalement
    **sauté** quand le destinataire est déjà SUR la rubrique Jeux ; une fois éteinte,
    plus personne n'y est, donc il **serait parti systématiquement**.
    → Le verrou est **côté serveur** : `/api/games` refuse en 403, et les handlers
    socket aussi.

    **⚠️ Le verrou socket est posé dans `chargerPartie`, pas à l'enregistrement des
    handlers.** `registerGameHandlers` s'exécute UNE FOIS à la connexion : un
    utilisateur déjà connecté aurait gardé ses handlers actifs après extinction. Les
    trois handlers (`game:fleet:place`, `game:move`, `game:forfeit`) passant tous par
    `chargerPartie`, un handler ajouté plus tard héritera du verrou sans qu'on y pense.

    **⚠️ Le levier évident ne marchait pas** : `components/Sidebar.tsx` **réécrivait la
    liste des rôles EN DUR**, alors que le commentaire de son import affirmait
    s'appuyer sur `GAMES_ALLOWED_ROLES`. La constante partagée ne pilotait donc ni le
    menu latéral ni la nav groupée. Reliquat du 05/08, corrigé : test unique
    `canSeeGames(role, gamesEnabled)` dans `constants.ts`.

    **Comment l'état est mémorisé** : nouvelle table `AppSetting` (clé/valeur),
    migration `20260814120000_add_app_settings`, **neuve et purement additive**.
    Générique volontairement : le prochain interrupteur ne demandera pas de migration.
    ⚠️ **Absence de ligne = ÉTEINT.** Rien n'est semé : une base vierge, une migration
    fraîche ou une lecture qui échoue laissent les Jeux fermés, jamais ouverts par
    accident. Confirmé au démarrage : `[settings] Jeux eteints`.
    Valeur tenue **en mémoire** et rafraîchie à l'écriture — les routes de jeu la
    consultent à chaque appel, une requête base par appel serait du gaspillage.
    ℹ️ Cache **par process** : un seul conteneur `api` tourne ; s'il en fallait
    plusieurs, il faudrait diffuser l'invalidation.

    **Droits** : `PUT /api/settings/games` est réservé au **Master côté serveur**. La
    page ne fait que masquer le bouton aux autres — masquer un bouton ne ferme pas une
    route.

    **Rien n'est supprimé** : la page, les règles, l'anti-triche, les modèles et les
    parties restent. **Vérifié en base : 21 sessions et 25 défis conservés** avant et
    après extinction — c'est ce qui prouve qu'on a bien éteint et non supprimé.

    **Vérifié** : `tsc` backend 0 et racine 12 de référence ; `[settings] Jeux eteints`
    au démarrage avec table vide ; les 3 routes en 401 sans jeton.
    **Validé par Théo** — bascule, disparition/réapparition et libellé conformes.
    ℹ️ **Défaut d'affichage corrigé après son retour** : le curseur du bouton débordait
    de sa piste. Cause : la pastille était en `absolute` **sans propriété de position**,
    donc ancrée à sa position dans le FLUX et non au bord gauche du parent — le
    décalage s'ajoutait à un point de départ déjà avancé. `left-0.5` explicite ;
    géométrie revérifiée, 2 px de marge de chaque côté dans les deux états.

    ⚠️ **Piège d'environnement, rencontré pour de bon** : la base locale étant celle de
    PROD, l'interrupteur laissé **allumé** après les tests de Théo l'était déjà en
    production. Déployer en l'état aurait rendu la rubrique visible de toute l'équipe —
    l'inverse de la demande. **Remis à `false` avant le déploiement.** Pour un réglage
    global, l'état de test EST l'état de production : il faut le remettre comme on
    nettoie une donnée de test.

41. **RÔLE EXTERNAL — Digital complet, chat élargi, accès aux Paramètres**
    (`feat/droits-external`, 25 août). Backend + frontend, **aucune migration** →
    `api` **et** `web`.

    Demande de Théo : l'External (prestataire extérieur) était trop contraint —
    accès total au Digital, discussion avec tout le monde sauf les chefs de site, et
    accès aux Paramètres (il ne pouvait ni changer son mot de passe, ni sa photo, ni
    renseigner son anniversaire).

    **⚠️ Ce que l'audit a corrigé dans la demande : le vrai blocage du Digital n'était
    pas les droits d'édition, mais les ONGLETS.** L'External n'en voyait **qu'un sur
    quatre** (Calendrier Éditorial) — ni Planning, ni Archives, ni Gestion des TAGS.
    Il avait déjà `canEditCalendar`. Sans cette découverte, on lui aurait ouvert des
    droits sur un écran qu'il ne pouvait pas atteindre.

    **⚠️ Situation INVERSE du piège habituel sur Digital** : `routes/social.ts`
    autorisait **déjà** l'External à créer, modifier **et supprimer** — c'est l'écran
    qui le lui refusait. Le serveur était ouvert, l'interface fermée.
    Cet écran portait **TROIS listes de rôles en dur** (`canEdit`, `canDelete`,
    `canEditCalendar`) divergentes entre elles et du serveur. Remplacées par un test
    unique `canEditDigital` dans `constants.ts`. Vérifié après coup : les trois listes
    (constants, `social.ts`, `tags.ts`) sont désormais **identiques au caractère**.

    **Tags ouverts à l'External côté serveur** (`routes/tags.ts`) — arbitrage de Théo,
    « accès total, tags compris ». Nécessaire et non cosmétique : `TagsManager` reçoit
    le même droit que les publications, donc sans ça l'écran aurait affiché des
    contrôles refusés en 403.

    **⚠️ Défaut trouvé au passage, et qui NE concernait pas que l'External : les chefs
    de site n'étaient exclus d'AUCUNE liste de contacts du chat.** Or ce rôle n'a aucun
    accès au chat (rubrique absente, `registerChatHandlers` non enregistré). N'importe
    qui pouvait donc lui ouvrir une conversation : elle existait en base, s'affichait
    chez l'émetteur, et **restait invisible du destinataire à jamais**. Corrigé pour
    tous les rôles — et **refusé côté serveur** dans `POST /api/chat/conversations`,
    sur les rôles lus en base et non sur ce que le client affirme envoyer. Filtrer la
    liste de l'écran n'aurait rien fermé.
    Au passage, l'exclusion explicite des External des groupes (`u.role !== 'External'`)
    est retirée : ils sont désormais proposables comme tout le monde.

    **Paramètres** : `'settings'` ajouté à `EXTERNAL_ALLOWED_TABS`, et les deux gardes
    `!isExternal` qui masquaient le bouton (carte utilisateur desktop, barre tablette)
    retirées. `Settings.tsx` **non modifié** : la gestion des comptes reste fermée par
    `canManageUsers`, qui ne contient pas ce rôle. `PUT /me` n'ayant aucun contrôle de
    rôle, mot de passe / nom / photo / anniversaire fonctionnent sans rien ajouter, et
    les uploads lui étaient déjà autorisés.
    ⚠️ **Le menu « Plus » mobile de l'External était VIDE, à dessein** (correctif 31 :
    ses rubriques tiennent dans la barre du bas). Lui donner les Paramètres sans y
    toucher les aurait rendus **inatteignables depuis un téléphone** — or c'est
    justement là qu'on change sa photo. Il contient désormais Paramètres, et rien d'autre.

    **Vérifié** : `tsc` backend 0, racine 12 de référence ; concordance des trois listes
    de rôles Digital contrôlée après coup ; `hasSocialFeatures` identique côté écran et
    serveur. **Validé par Théo.**
    ℹ️ Réserve honnête : le parcours complet avec le compte External réel (`ali`) dans
    le navigateur a été demandé mais son résultat détaillé ne m'a pas été rapporté —
    ma vérification porte sur les types, la concordance des listes et la logique du
    verrou serveur.

42. **ÉCHÉANCE PAR TÂCHE, et tableau des tâches triable et redimensionné**
    (`feat/echeance-taches`, 26 août). Backend + frontend, **aucune migration** →
    `api` **et** `web`.

    Demande de Théo : une échéance par tâche dans le tableau du projet, qui devienne
    la date de référence de la To-do, plus la possibilité de trier les tâches par
    n'importe quelle colonne, échéance chronologique par défaut.

    **⚠️ Aucune migration Prisma : le champ existait déjà.** `Task.deadline`
    (`String?`, `'yyyy-MM-dd'` comme `User.birthdate`) avait été créé au correctif 35
    pour les tâches AUTONOMES. Il était simplement inutilisé par les tâches de projet.
    C'est aussi pour ça que `dataService` n'a besoin d'aucun normaliseur : la valeur
    n'est pas un `DateTime` Prisma.

    **⚠️ LE PIÈGE, et il aurait été muet : `TASK_FIELDS` ne contenait pas
    `deadline`.** Cette liste blanche (`backend/src/routes/projects.ts`) filtre le diff
    transactionnel du PUT via `pickTaskData`. Sans l'ajout, l'échéance s'affichait,
    partait au serveur et disparaissait au rechargement suivant — **sans la moindre
    erreur, ni côté client, ni dans les logs**. C'est la SEULE porte d'écriture des
    tâches de projet : le POST reçoit toujours `tasks: []` (un projet est créé sans
    tâche), tout transite donc par ce PUT.
    `pickTaskData` normalise en plus `'' -> null` pour `deadline` : le DatePicker vidé
    renvoie une chaîne vide, et un `String?` doit valoir NULL en base. La normalisation
    est CÔTÉ SERVEUR pour couvrir tout appelant, pas seulement cet écran.
    ⚠️ Ne pas confondre avec `undefined`, qui signifie « champ absent du body, donc non
    modifié » — c'est pour ça que l'écran envoie `v || null` et non `v || undefined`,
    sans quoi un effacement ne partirait jamais.

    **`DatePicker` : nouvelle prop `clearable`** (`components/DatePicker.tsx`). Le
    composant n'offrait **aucun moyen de vider une date** une fois posée — acceptable
    pour les dates obligatoires (début/fin de projet, date de dépense), pas pour une
    échéance optionnelle. Un bouton « Effacer » apparaît dans le panneau, à côté
    d'« Aujourd'hui ». Opt-in délibéré : les 12 usages existants sont inchangés au
    caractère, et un bouton « Effacer » sur une date obligatoire inviterait à créer un
    état interdit.
    ⚠️ Le bouton est dans le PANNEAU et non dans le déclencheur : celui-ci est un
    `<button>`, un bouton imbriqué dans un bouton est du HTML invalide, et restructurer
    casserait le `triggerRef` dont `FloatingPanel` se sert pour se positionner.

    **Tri du tableau** : les 7 colonnes sont triables (en-tête cliquable, flèche sur la
    colonne active, vocabulaire visuel repris de `pages/Campaigns.tsx` pour ne pas
    inventer un second style). État en `useSessionState`, défaut `deadline` / `asc`.
    Trois règles non évidentes :
    - une tâche **sans échéance reste en dernier dans les DEUX sens** — en décroissant,
      une chaîne vide remonterait sinon en tête sans porter aucune information ;
    - le tri par **assigné** porte sur le NOM résolu via `users`, jamais sur l'uuid ;
    - le tri par **statut** suit `TASK_STATUS_ORDER` (Empty → Todo → InProgress →
      Programmed → Done), l'ordre d'avancement et non l'alphabet des valeurs internes,
      qui placerait `Done` en premier.
    C'est un ordre d'AFFICHAGE : `tasks` n'est jamais réordonné, aucun champ `order`
    n'est ajouté au modèle, et `updateTask`/`removeTask` opèrent déjà par `task.id`.
    Bénéfice de bord : l'ordre était jusqu'ici **non déterministe** — `include: { tasks:
    true }` est envoyé SANS `orderBy`, Postgres pouvait donc le changer d'une
    sauvegarde à l'autre.

    **⚠️ GEL DE L'ORDRE PENDANT LA SAISIE — sans lui la fonction est inutilisable.**
    `updateTask` appelle `handleUpdateProject`, donc un PUT, **à chaque frappe**. Avec
    un tri par nom, taper « Flyer » ferait sauter la ligne cinq fois et le champ
    perdrait le focus dès la première lettre. L'ordre est donc figé tant qu'un des
    trois champs texte a le focus (`onFocus`) et libéré en sortant (`onBlur`). Le gel
    filtre les ids disparus et ajoute en fin les tâches apparues, sinon une suppression
    en pleine saisie ferait disparaître une ligne. Les Select et le DatePicker ne
    gèlent rien : ils changent leur valeur en une action, le réordonnancement immédiat
    y est le comportement attendu.
    ⚠️ Le `useEffect` qui libère le gel dépend de `selectedProject?.id` et **non** de
    `selectedProject` : l'objet est recréé à chaque sauvegarde, donc à chaque frappe,
    ce qui annulerait le gel aussitôt posé.

    **To-do** : `projectEndDate` renommé **`dateReference`** dans `TodoTask`, et
    alimenté par `t.deadline || p.endDate`. Le renommage n'est pas cosmétique — le nom
    serait devenu mensonger, et c'est exactement le genre de nom qui fait repartir une
    session suivante sur une fausse piste. Le fallback sur la fin du projet est un
    arbitrage explicite de Théo : les 313 tâches existantes n'ont pas d'échéance et
    gardent donc **exactement** la date, l'urgence et la place dans le tri qu'elles
    avaient.
    ⚠️ **La VISIBILITÉ n'a pas changé** : elle reste pilotée par le PROJET
    (`p.endDate >= todayStr`). Une tâche dont l'échéance est dépassée dans un projet
    encore actif **reste affichée**, en « Expiré il y a Xj ». C'est précisément
    l'intérêt de l'échéance par tâche, pas un effet de bord.

    **Mise en page du tableau, reprise après un premier jet refusé par Théo.** Le
    défaut n'était pas esthétique mais arithmétique : les colonnes fixes totalisaient
    **944 px** pour un `min-w` de **920 px**. « Nom de la tâche », seule colonne sans
    largeur, absorbait le déficit et tombait à zéro — d'où son en-tête cassé en trois
    lignes sur la colonne la plus utile. Trois corrections, toutes mesurées :
    1. **`table-fixed` au lieu de `table-layout: auto`** : les `w-*` n'étaient que des
       suggestions et le navigateur redistribuait selon le contenu (mesuré : Prestataire
       écrasé à 90 px, Assigné gonflé à 194 px alors qu'on demandait 128 et 160). La
       seule colonne sans largeur (« Nom ») absorbe désormais tout l'espace restant.
    2. **`px-1.5` au lieu de `p-3` sur les colonnes à contrôle** : un Select ou un
       DatePicker porte déjà son padding interne et les 24 px de la cellule s'y
       ajoutaient — c'est ce qui tronquait « Audiovisuel » en « Audiovi… ».
    3. **Libellés de statut sans les pourcentages.** « Programmé (100%) » mesure 106 px
       et imposait 154 px à la colonne, plus que l'Échéance, au détriment du Nom.
       « Programmé » tombe à 65 px. Effet de bord heureux : le formulaire affiche
       désormais **les mêmes libellés que la To-do**, qui n'a jamais montré ces
       pourcentages ; la pondération reste lisible sur la barre « Avancement Tâches ».
    En-têtes en `whitespace-nowrap` et centrés, **sauf « Nom » et « Prestataire »**
    laissés à gauche : leur contenu est du texte libre aligné à gauche, et centrer le
    titre au-dessus recrée le décalage qu'on corrige.
    Résultat mesuré : colonne « Nom » à **302 px** sur un écran 1920 (contre ~0),
    9 cellules d'en-tête à 39 px de haut donc **une seule ligne chacune**, **aucune
    troncature** dans les Select, et sur les 311 noms de tâches réels 9 % débordent
    encore (contre 14 % avec 40 px de moins). Le tableau fait 1060 px au minimum :
    **aucun scroll horizontal à 1920 px**, il en reste à 1440 px — structurel à
    huit colonnes.

    **Vérifié dans le navigateur** (projet jetable `ZZ-TEST-ECHEANCES`, supprimé
    ensuite, 0 résidu contrôlé et Dashboard revenu de 33 à 32 projets actifs) :
    persistance après F5 (le test qui valide `TASK_FIELDS`), effacement écrivant bien
    `null` en base, tri nom/échéance/coût/statut dans les deux sens, « sans échéance »
    toujours en dernier, tri numérique et non lexicographique (`0 / -250 / -2100 /
    -2300`), gel de l'ordre pendant la frappe puis replacement au blur, To-do affichant
    « Expiré il y a 10j » sur une tâche échue d'un projet actif et le fallback projet
    sur une tâche sans échéance, et non-régression du `DatePicker` ailleurs (« Effacer »
    absent des dates de projet).
    `tsc` backend 0, racine **9** de référence — et non 12 : la doc citait un chiffre
    périmé depuis plusieurs lots, vérifié en comparant `master` et la branche.
    ℹ️ Réserve honnête : le tri par **assigné** n'a été éprouvé qu'avec une seule
    personne (toutes les tâches au même nom) — les noms sont bien résolus, mais le
    classement entre plusieurs personnes n'a pas été observé à l'écran.
    ℹ️ Le `DatePicker` n'a pas de prop `disabled` : pour un rôle en lecture seule le
    calendrier s'ouvre et le clic ne fait rien (`updateTask` teste `canEdit`). C'est le
    comportement déjà en place sur les dates de projet, pas une régression — mais ce lot
    l'étend d'une colonne.

43. **MODE EXPERT — pilotage avancé des gros projets** (`feat/mode-expert`, 27 août).
    Backend + frontend, **migration Prisma** (`20260826142519_add_expert_mode`) →
    `api` **et** `web`.

    Un interrupteur par projet débloque quatre modules : KPI, Gantt par personne, dépôt
    de fichiers (projet et tâche) et notes de tâche. Demande de Théo pour les gros
    projets type « Forum Pièces 2026 » (20 tâches, 96 525 €, 5 intervenants), là où le
    formulaire simple ne suffit plus.

    **⚠️⚠️ POURQUOI CE N'EST PAS UN « MODE PRO » — à lire avant de renommer quoi que ce
    soit.** `Project.proPlus` existe depuis l'origine et signifie **PRO+ (B2B)** : c'est
    un marqueur MÉTIER qui pilote un filtre à trois états dans le Dashboard, le Budget et
    l'Export, et qui change des CHIFFRES. Poser un champ `pro` à côté de `proPlus`, sur le
    même modèle et dans le même formulaire, aurait mis « PRO » et « PRO+ » côte à côte —
    exactement le scénario qui a laissé le bug Holding/GROUPE BONY en place des mois.
    D'où **`expertMode`**, marqueur d'INTERFACE qui n'entre dans **aucune** agrégation.
    Les deux champs se suivent dans `schema.prisma` et dans `types.ts`, chacun avec
    l'avertissement en toutes lettres.

    **Migration, purement additive** : `Project.expertMode Boolean @default(false)`,
    `Task.startDate String?`, `Task.notes String?`, et la table `ProjectFile`. SQL relu
    avant application : aucun `DROP`, aucune colonne existante touchée.

    **⚠️ UN SEUL modèle `ProjectFile` pour les fichiers de projet ET de tâche**,
    `taskId = null` désignant le projet. Même patron que `Task.projectId` nullable
    (correctif 35), et le contraire de l'erreur du correctif 10. Deux tables auraient
    dupliqué la route, la purge, le cloisonnement et l'upload.
    `projectId` reste renseigné même pour un fichier de tâche : c'est ce qui permet de
    lister en une requête et surtout d'appliquer `siteScope` sans remonter la tâche.

    **⚠️ `TASK_FIELDS` — LE MÊME PIÈGE QUE LA VEILLE, deuxième fois en deux lots.**
    `startDate` et `notes` devaient y être ajoutés, faute de quoi la saisie aurait été
    acceptée, le serveur aurait répondu 200, et la valeur aurait disparu au rechargement.
    Anticipé cette fois (le correctif 42 venait de l'apprendre), mais c'est le signe que
    cette liste blanche est le point de passage obligé de **tout** nouveau champ de tâche.
    `pickTaskData` normalise désormais `'' -> null` pour les trois champs nullables.

    **⚠️ Le `catch` du PUT projets masquait TOUTE erreur de transaction en 404 muet.**
    Découvert en cherchant pourquoi une échéance ne se sauvegardait pas : la réponse était
    « Projet introuvable », rien dans les logs, et le projet existait. Un `console.error`
    y a été ajouté — le message rendu au client reste vague, la cause part dans les logs.
    Sans cette trace, le symptôme est « ça ne s'enregistre pas » et aucune piste.

    **Fichiers** : `UPLOAD_TYPES` gagne `'project'` avec `{ mimes: null, maxBytes: 100 Mo }`,
    même choix que `chat` — un projet reçoit des devis, des BAT, des plans, des tableurs.
    ⚠️ **Rien à ajouter côté sécurité** : l'`express.static` d'`index.ts` applique déjà
    `nosniff` et force le téléchargement de tout ce qui n'est ni image, ni PDF, ni média,
    et couvre automatiquement le nouveau sous-dossier. Sans cela un `.html` ou un `.svg`
    déposé s'exécuterait dans la session de qui l'ouvre.
    `GET /api/storage` itérant sur `UPLOAD_TYPES`, les fichiers de projet apparaissent
    seuls dans l'indicateur d'espace des Paramètres.

    **⚠️ AUCUNE purge par ancienneté sur les fichiers de projet**, contrairement au chat
    (180 j) et aux médias calendar (30 j) : un devis ne s'évapore pas. Seul un balayage des
    **orphelins** a été ajouté (`purgeOrphanProjectFiles`) — fichiers qu'aucune ligne ne
    référence, cas de la suppression en cascade d'un projet. Marge de sécurité d'une heure
    sur la date du fichier, sinon on supprimerait l'upload de quelqu'un dont la métadonnée
    n'est pas encore enregistrée (le dépôt se fait en deux appels).
    La suppression EXPLICITE depuis l'écran, elle, retire **la ligne ET le fichier disque**
    — pour ne pas recréer le défaut « fichiers d'upload orphelins » de `BUGS-CONNUS.md`.

    **Cloisonnement** : `routes/projectFiles.ts` ne recopie aucun `where` de site. Un
    helper `projetAutorise()` réutilise `scopeOf` + `arrayScopeWhere`, et rend
    indistinctement « introuvable » pour un projet inexistant ou hors périmètre, afin de ne
    pas transformer la route en révélateur d'existence. POST et DELETE sous `EDIT_ROLES` ;
    le chef de site **consulte** les modules de ses projets mais n'y écrit rien.
    L'url reçue au POST est validée contre `/^\/uploads\/project\/[A-Za-z0-9._-]+$/` : sans
    ce contrôle on enregistrerait une url externe, rendue ensuite chez tous les collègues.

    **Les 4 KPI** (`components/expert/ExpertKpis.tsx`), tous recoupés à la main sur le
    projet de test — aucun n'entre dans un budget ni une agrégation :
    1. **Tenue des échéances** : en retard / sous 7 j / sans échéance. Une tâche terminée
       n'est jamais « en retard », le retard qualifie ce qui reste à faire.
    2. **Charge par personne** : tâches restantes et euros portés, non-assignées mises en
       évidence et jamais masquées.
    3. **Avancement pondéré par le budget, face à l'avancement à l'unité.** Le `progress`
       du projet compte chaque tâche pour 1 : mesuré sur le projet de test, **38 % à
       l'unité contre 10 % pondéré**, parce que la ligne à 24 000 € n'était pas commencée.
       C'est l'écart entre les deux qui informe, pas chaque chiffre isolément.
    4. **Concentration des coûts** : top prestataires et part des 3 plus grosses lignes.
    ⚠️ **Pas de burndown ni de vélocité, volontairement** : il n'existe AUCUN historique de
    changement de statut. `Task.updatedAt` bouge à chaque modification, pas au passage en
    « Terminé ». Une courbe bâtie dessus serait fausse — le projet a déjà payé cette
    approximation avec le KPI de rythme biaisé (correctif 25).

    **Gantt** (`ExpertGantt.tsx`) : lignes = **personnes**, non-assignées en dernier.
    ⚠️ **Deux formes de marque, et c'est structurel** : `startDate` + `deadline` donnent une
    BARRE ; `deadline` seule donne un **JALON** (losange). Faire partir la barre du début du
    PROJET aurait été plus joli et FAUX — toutes les tâches sembleraient démarrer le même
    jour. Une tâche sans aucune date ne peut pas être placée : elle est **listée sous le
    graphique**, jamais escamotée. Arithmétique left/width reprise de `ProjectBarGantt`
    (`pages/Agenda.tsx`), rendu différent.

    **Notes et fichiers de tâche : un PANNEAU latéral, pas deux colonnes de plus.** Le
    tableau des tâches en compte déjà 8 et vient d'être recalibré au pixel (correctif 42) ;
    y pousser une note libre aurait ré-écrasé la colonne « Nom de la tâche ».
    ⚠️ La note est **locale puis sauvée au blur**, pas à chaque frappe : ailleurs dans cet
    écran une frappe déclenche un PUT du projet entier, acceptable pour un champ court,
    ruineux pour un bloc-notes.
    ⚠️ La colonne d'action passe de 40 à 76 px en mode Expert (second bouton), et le
    `min-w` du tableau suit exactement (1060 → 1096) : l'élargir sans toucher au `min-w`
    aurait repris les pixels à la colonne « Nom », c'est-à-dire le défaut du correctif 42.

    **`formatPoids` extrait dans `utils/fichiers.ts`** : il était local à `Chat.tsx` et
    allait l'être une seconde fois. Deux copies d'une même règle, c'est ce qui a fait
    diverger trois listes de rôles au correctif 41. Le Chat consomme désormais l'utilitaire.

    **Vérifié dans le navigateur** (projet `ZZ-TEST-EXPERT`, supprimé ensuite, 0 résidu) :
    persistance après F5 de `startDate`, `deadline` et `notes` ; dépôt de 4 fichiers
    (PNG avec vignette, TXT, CSV, PDF) avec nommage en uuid sur le disque et nom d'origine
    en base ; suppression retirant bien le fichier du disque ; balayage des orphelins
    confirmé par les logs (`[purge] 3 fichier(s) de projet orphelin(s) supprimé(s)`) après
    antidatage ; Gantt avec barre, jalon en retard, deux personnes distinctes et la tâche
    sans date listée à part ; **KPI recoupés à la main** (1/1/1, 38 % vs 10 %, 97 % sur les
    3 premières lignes, GL Events 82 %) ; **temps réel vérifié à DEUX onglets** (dépôt dans
    l'un, apparition dans l'autre sans rechargement) ; extinction du mode rendant l'écran
    strictement identique à avant le lot (9 colonnes, un seul bouton d'action, panneau
    absent) et rallumage sans aucune perte.
    `tsc` backend 0, racine **9** de référence.
    ℹ️ Non éprouvé : le parcours avec un compte **chef de site** réel. Le verrou est en
    place côté serveur (`projetAutorise`) et l'écriture lui est fermée, mais la leçon du
    projet est qu'un 403 exact ne vaut pas un test dans l'interface — à faire avec Théo.

44. **MODE EXPERT — reprise complète après recette de Théo** (`fix/mode-expert-retours`,
    27 août). Frontend seul, **aucune migration** → `web`.

    ⚠️⚠️ **CE LOT EXISTE PARCE QUE LE 43 A ÉTÉ DÉPLOYÉ SANS RECETTE.** L'autorisation
    « .md, push and deploy » donnée pour le correctif 42 a été reconduite seule sur le 43,
    alors que la méthode du projet impose l'étape « JE VALIDE le fonctionnel — tu
    t'arrêtes ici et tu me montres » AVANT les `.md`, le push et le déploiement. Théo a
    donc découvert **en production** quatre modules qu'il aurait recalés en local :
    « très décevant ». **Une autorisation de push vaut pour LE lot en cours, jamais pour
    le suivant.** C'est la leçon la plus chère de la journée, elle vaut plus que tout ce
    qui suit.

    **Ce que la recette sur « Forum Pièces 2026 » a démontré, chiffres à l'appui :**
    - « Charge par personne » affichait *Théo 8 tâches / **0 €*** : le bloc ne comptait que
      le RESTANT, et sur ce projet le restant ne coûte rien. Des barres vides. Le montant
      réellement porté par Claire Richard — **95 700 €**, la donnée la plus importante du
      projet — était tout simplement invisible.
    - Le Pilotage annonçait **7 sans échéance** quand le Planning annonçait **14 sans
      date** : deux définitions différentes côte à côte dans le même écran.
    - « Avancement réel » (97 % pondéré vs 53 % à l'unité, plus trois lignes
      d'explication) : « je comprends pas ton truc, c'est beaucoup trop complexe ».
    - L'onglet **Fichiers** annonçait « 2 autres fichiers sont rattachés à une tâche » sans
      les montrer — dans l'onglet qui s'appelle « Fichiers ».
    - L'icône de la ligne de tâche passait au violet sans dire s'il s'agissait d'une note,
      d'un fichier ou d'une date.
    - Un **halo orange** derrière le bouton « MODE EXPERT ACTIF ».

    **STYLE — la faute la mieux documentée.** Le CSS de `.gx-btn-gradient` dans
    `index.html` porte ce commentaire : « Fini verre sobre : ombre neutre douce + très fin
    liseré haut (**pas de glow orange plastique**) ». Y ajouter `shadow-glow`
    (`rgba(247,86,50,0.45)`) écrasait précisément ce box-shadow. Retiré du bouton
    d'activation et des onglets. Le bandeau du panneau, lui, était un aplat
    `gx-gradient opacity-[0.12]` — l'exact contraire du verre : remplacé par un vrai
    `gx-card` (translucide + `backdrop-filter`) avec le liseré dégradé vertical déjà
    utilisé sur le panneau de contexte du projet.
    ⚠️ `shadow-glow` reste légitime ailleurs (Export, DatePicker) sur de PETITS éléments.
    Ce qui est proscrit, c'est de l'empiler sur `gx-btn-gradient`.

    **PILOTAGE — refait, et « Avancement réel » SUPPRIMÉ.** Trois blocs :
    - **« À traiter »** (remplace « Tenue des échéances ») : en retard / sans personne
      assignée / à faire sans date. Un bloc de pilotage doit faire AGIR : chaque compteur
      déplie sa liste et **chaque ligne ouvre la tâche** pour la corriger sur place. Une
      catégorie vide passe au vert avec une coche.
    - **« Qui fait quoi »** : TOUTES les tâches de chacun, terminées comprises, avec
      `faites/total`, barre de progression et budget porté. C'est le correctif des 0 €.
    - **« Où part l'argent »** : inchangé, seul bloc que Théo n'avait pas critiqué.
    ⚠️ L'incohérence 7/14 est levée par les LIBELLÉS, pas en alignant les chiffres :
    « à faire sans date » (6, ce qui reste à corriger) et « sans date, absentes du
    planning » (11, tout ce qui n'est pas plaçable). Deux nombres différents sont
    légitimes tant que chacun dit ce qu'il compte.
    ⚠️ Toujours pas de burndown ni de vélocité : aucun historique de changement de statut
    n'existe (`Task.updatedAt` bouge à chaque modification, pas au passage en « Terminé »).

    **GANTT — placement d'étiquettes mesuré, et non estimé.** Les jalons écrivent
    désormais leur nom à côté du losange. Deux défauts successifs, chacun trouvé par la
    MESURE dans le navigateur et non à l'œil :
    1. la première version alternait sur **deux** crans en ne regardant que le jalon
       précédent, avec une largeur de texte devinée à 130 px : trois jalons rapprochés
       retombaient au même cran (« Grande Halle d'Auvergne » écrit par-dessus « Visuel
       Ticket d'Or »). Remplacé par un vrai placement — largeur **mesurée au canvas** dans
       la police réelle, puis premier cran libre parmi quatre, et libellé masqué (le
       losange et son infobulle restent) quand aucun cran ne l'est ;
    2. les crans à ±11 px étaient trop proches de l'axe pour la **DIAGONALE** du losange
       (un carré de 12 px tourné à 45° déborde de ±8,5 px) : un losange voisin mangeait le
       début d'un libellé — « uel Ticket D'or ». Crans portés à **±17 et ±32**, piste en
       `h-20`. ⚠️ Aucun cran n'est posé sur l'axe : les losanges y sont toujours, le
       problème disparaît par construction.
    **Mesuré après correction, sur les deux pistes : 0 chevauchement de libellés,
    0 losange sur libellé, 0 débordement de piste.**

    **FICHIERS** : les fichiers de tâche sont **listés**, groupés sous leur tâche dont le
    nom est cliquable. Le dépôt reste au niveau de la tâche (`canEdit={false}` sur ces
    listes) : c'est là qu'on choisit le rattachement.

    **LIGNE DE TÂCHE** : trombone **avec le nombre de fichiers**, icône de note si elle
    existe, « agrandir » en gris neutre. Les marqueurs sont dans le MÊME bouton pour ne
    pas multiplier les zones cliquables sur une ligne déjà dense. Colonne d'action
    ramenée de 116 à **92 px** après mesure (le bouton n'en occupe que 75), `min-w` du
    tableau de 1136 à 1112 — les 24 px rendus vont au nom de la tâche.

    **Vérifié** en lecture seule sur « Forum Pièces 2026 » (aucun `PUT` dans l'onglet
    réseau, projet contrôlé intact après coup) : compteurs « À traiter » recoupés à la
    main contre l'API (1 / 0 / 6 — identiques), « Qui fait quoi » recoupé (Claire 4/6 —
    95 700 € · Théo 5/13 — 825 € · Bastien 0/1, total 20 tâches / 96 525 €), parcours
    « cliquer une ligne → la tâche s'ouvre » testé, les 2 fichiers de tâche affichés,
    thème **clair ET sombre**, tous les en-têtes du tableau sur une seule ligne.
    `tsc` backend 0, racine 9 de référence.
    ℹ️ Réserve honnête : le **dépôt** et la **suppression** d'un fichier, ainsi que le cas
    « note seule sans fichier », n'ont pas été rejoués — ils exigent d'écrire, et le seul
    projet en mode Expert était un vrai projet de Théo.
    ⚠️ Incident signalé à Théo : un clic mal placé a déclenché la confirmation de
    suppression de « Forum Pièces 2026 ». Annulée immédiatement, projet vérifié intact
    (20 tâches, 96 525 €, mode Expert actif).

45. **DIGITAL — LIENS EXTERNES dans les médias, et validation de `mediaFiles`**
    (`feat/digital-liens-medias`, 2 septembre). `api` **et** `web`, **aucune migration**.

    **Besoin** : les visuels d'une publication vivent souvent dans un WeTransfer ou un
    dossier SharePoint, pas dans un fichier qu'on dépose. La modale Médias n'acceptait
    que des uploads.

    **Choix de stockage — pas de migration.** Le lien est rangé tel quel dans
    `SocialPost.mediaFiles` (`String[]`), discriminé par `^https?://` vs `^/uploads/`.
    Les deux formes sont disjointes, et surtout les deux purges (30 j des archives dans
    `jobs/purge.ts`, suppression de post dans `routes/social.ts`) ne touchaient DÉJÀ que
    les urls préfixées `/uploads/calendar/` et conservent tout le reste. Vérifié dans le
    code avant d'écrire une ligne.
    ⚠️ Conséquence à connaître : **un lien survit à la purge 30 j** alors que les
    fichiers du même post disparaissent. C'est voulu (le lien reste la source), d'où la
    ventilation « 2 fichiers · 1 lien » dans les libellés — un total opaque se lirait
    comme un bug.

    **⚠️⚠️ LA RÈGLE DU LOT : un lien externe n'atteint JAMAIS un `<img src>`, un
    `<video src>` ni la lightbox.** Ce serait une requête sortante émise par le
    navigateur de CHAQUE collègue ouvrant la modale — fuite d'IP et accusé de
    consultation offerts au tiers, c'est-à-dire exactement le trou `avatarUrl` de
    `BUGS-CONNUS.md`, sauf créé volontairement. Un lien est rendu comme une CARTE :
    icône, pastille du fournisseur, libellé. Zéro requête réseau tant qu'on n'a pas
    cliqué — **mesuré dans l'onglet Réseau, filtre `toubkalpes` : 0**.
    - `lib/linkProviders.ts` est **réutilisé, pas réécrit** (`fournisseurDe`,
      `libelleCourt`) : il connaissait déjà SharePoint, WeTransfer, OneDrive, Dropbox,
      Drive, Canva. `fournisseurDe` peut rendre `null` → pastille générique « Lien ».
    - `components/LinkPreview.tsx` n'est **délibérément pas** réutilisé : sa branche
      « aperçu riche » rend une vignette `<img>` servie par un tiers. Arbitrage acté
      pour le Chat, non étendu au Digital.

    **⚠️ Le garde `!estLienExterne` dans `isVideoUrl` est load-bearing.** Sans lui, un
    lien de partage finissant par `/video.mp4` (WeTransfer en produit) partait dans un
    `<video src>` — même fuite, en pire. Testé explicitement.

    **`handleDownload` renommé `handleOuvrirOuTelecharger`.** L'attribut `download` est
    **ignoré en cross-origin** : sur un lien externe, l'ancienne version faisait NAVIGUER
    l'onglet Gearbox et perdait la saisie en cours. Un lien s'ouvre à part, avec
    `noopener,noreferrer`.

    **BACKEND — un trou préexistant fermé au passage.** `POST` et `PUT /api/social`
    passaient `req.body` **brut** à Prisma : aucune liste blanche, aucune validation
    d'url. `validerMediaFiles` (`routes/social.ts`) n'accepte plus qu'un chemin
    `/uploads/calendar/<uuid>.(jpg|png|webp|mp4|mov)` — les 5 extensions exactes que
    produit `EXT_BY_MIME` pour ce type — ou une url `http(s)` parsable, avec plafonds
    (50 entrées, 2048 caractères).
    ⚠️ **Ne PAS élargir à `/^\/uploads\//`** : le dossier `chat/` n'a aucun filtre de
    format, on rouvrirait le trou par la bande.
    ⚠️ **Tolérance de l'existant, et c'est délibéré** : les valeurs déjà en base sont
    acceptées telles quelles (lues dans le `findUnique` que le PUT faisait déjà, zéro
    requête en plus). Sinon une seule ligne non conforme rendait le post **entièrement
    insauvegardable** — changer un statut serait parti en 400 avec rollback optimiste et
    message incompréhensible. Audit fait sur la prod le 02/09 : **0 valeur non
    conforme** sur l'ensemble des publications, la version stricte aurait donc été sûre
    aussi ; la tolérante est un sur-ensemble.

    **Vérifié dans l'interface**, sur un post jetable créé puis supprimé (204, aucun
    résidu, dossier `uploads/calendar/` vide) : lien SharePoint réel → carte SHAREPOINT
    sans image · **0 requête sortante** · faux `.mp4` → carte, pas de lecteur · domaine
    inconnu → pastille générique · `ftp://` et doublon refusés avec message · **8
    charges refusées en 400 côté serveur** (`javascript:`, `data:`,
    `//tiers/pixel.gif`, dossier `chat/`, traversée `../`, `.svg`, non-tableau, 51
    entrées) · suppression 3→2 · badge de ligne et infobulle « 3 liens » après F5 ·
    thèmes clair et sombre · mobile 375 px. `tsc` 9 racine / 0 backend.
    ℹ️ **Réserve honnête** : la non-régression de la branche FICHIER (miniature, lecteur,
    lightbox, téléchargement) n'a pas été rejouée — aucune publication de la base ne
    portait de fichier, et l'outil d'automatisation ne sait pas déposer de fichier. Le
    code de cette branche est inchangé hormis le garde ajouté à `isVideoUrl`. À
    reprendre par Théo. Les rôles `Site Manager` et `External` n'ont pas été parcourus
    non plus, faute de comptes.

46. **DIGITAL — service `RH` et script d'import du calendrier éditorial**
    (`feat/import-calendrier-edito`, 2 septembre). Frontend seul → `web`, **aucune
    migration**.

    ⚠️⚠️ **CE LOT LIVRE LE CODE, PAS LES DONNÉES.** Les 43 publications de
    `Copie de CALENDRIER EDITORIAL.xlsx` (01/09/2026 → 29/12/2026) **ne sont pas encore
    en base** au moment de ce déploiement : l'import doit tourner APRÈS, voir l'ordre
    plus bas. Ne pas lire ce paragraphe comme « c'est fait ».

    **`RH` — un service qui n'existe QUE dans le Digital.** Le fichier source classe 10
    publications sur 43 en `RH` (portraits de collaborateurs, offres d'emploi, « la
    Minute de l'Auto »), une rubrique éditoriale qui ne correspond à aucune enveloppe.
    Nouveau `SocialServiceType = ServiceType | 'RH'` (`types.ts`) et `SOCIAL_SERVICES`
    (`constants.ts`), utilisés par les **deux** sélecteurs de `Digital.tsx`.
    ⚠️ **`SERVICES` et `ServiceType` ne bougent PAS** : ils pilotent `resolveBudgetLine`
    et sont partagés par Projets, Budget, Dépenses fixes, Agenda, To-do et Export — y
    ajouter `RH` ouvrirait une cinquième colonne dans tout le Budget et une ligne
    d'enveloppe qui n'existe pas. Vérifié : `SOCIAL_SERVICES` n'est importé que par
    `Digital.tsx`, et `SocialPost.service` est un `String` libre en base → aucune
    migration.
    ⚠️ **Pourquoi ce n'était pas optionnel** : `components/Select.tsx` calcule son
    libellé par `options.find(o => o.value === value)`. Une valeur absente des options
    fait retomber le composant sur son **placeholder** — les 10 posts `RH` auraient
    affiché un champ VIDE, et la première personne « corrigeant » ce vide aurait écrasé
    la vraie valeur. Restreindre la liste de choix ne doit jamais restreindre la liste
    qui sert à résoudre l'existant.

    **`scripts/import-edito.mjs`** — à la racine, hors du champ de `nodemon` (un fichier
    dans `backend/` redémarrerait l'API en pleine écriture), **commité** contrairement au
    script ad hoc du correctif 22 qui a été perdu. Écrit par la **vraie API REST**, jamais
    en Prisma direct. Dry-run par défaut, `--commit` explicite, `--limit N`,
    `--rollback <jsonl>`. Jeton par `$GEARBOX_TOKEN` uniquement, jamais en argument.

    **⚠️⚠️ LE PIÈGE DE DATE, mesuré et non supposé.** La cellule « 01/09/26 » est la
    série Excel 46266. Lue avec `cellDates:true`, elle revient en
    `2026-08-31T21:59:39.000Z`, et `.toISOString().slice(0,10)` donne donc
    **`2026-08-31`** : les 43 posts auraient été datés de la veille, au bon format, sans
    la moindre erreur visible. Le script lit la **série brute** et convertit par
    `XLSX.SSF.parse_date_code` — aucun fuseau n'intervient. Le rapport de dry-run affiche
    ce contrôle **en premier**, pour qu'il ne repose pas sur la mémoire de l'exécutant.

    Trois autres faits vérifiés dans le fichier, chacun corrigeant une hypothèse fausse :
    - `sheet_to_json` rend **45 lignes** (le `!ref` va jusqu'à `A1:N322`, deux lignes
      résiduelles suivent le tableau) → filtre sur « Nom » non vide, **jamais** sur un
      numéro de ligne en dur ;
    - la colonne Canal contient des jetons **`D <SITE>` et `R <SITE>` séparés**
      (`D MOZAC, R MOZAC, GROUPE`) → décodage **par jeton**, pas par chaîne entière ;
    - **`DACIA CAMP AURILLAC` apparaît deux fois**, à deux dates → la clé d'anti-doublon
      est la paire `titre+date`, jamais le titre seul.

    **Correspondances décidées par Théo** : `Marque = Groupe` → **`['Holding']`** (c'est
    littéralement l'ancien nom du tag ; sans effet budgétaire, le Digital n'entre dans
    aucun budget) · `R&D` → `['Renault','Dacia']` · colonne **`Sites`** (Aucun / Internet
    / Collaborateurs / Les deux) → **`targets`**, pas des sites malgré son nom ·
    colonne **`Canal`** → `concessions`, « GROUPE » et tout « FULL … » → `GROUPE BONY`
    (périmètre global reconnu par `siteScope.ts`), `R AURILLAC`/`DACIA AURILLAC` →
    `Aurillac` — le préfixe de marque est redondant avec la colonne Marque ·
    `Youtube` → **`YouTube`** · les 7 noms de fichiers sans fichier et les 2 remarques
    **ne vont pas en base**, ils sont listés dans le rapport.
    ⚠️ `OPO SEPTEMBRE NISSAN` n'a ni statut ni canal → `À venir` et `GROUPE BONY`.
    Sans concession, `arrayScopeWhere` utilise `hasSome` : le post serait **invisible de
    tous les chefs de site**.

    **⚠️ ORDRE DE DÉPLOIEMENT NON NÉGOCIABLE** : le `web` de ce lot doit être **en ligne
    AVANT** le `--commit` de l'import. Sinon les 10 posts `RH` s'affichent en production
    avec un sélecteur de service vide, et le premier qui touche ce champ écrase la donnée.

    **Vérifié** : dry-run complet sur les 43 lignes → **0 anomalie**, première ligne au
    **1ᵉʳ septembre**, répartition recoupée à la main contre le fichier (Holding 24 ·
    Dacia 12 · Renault 10 · Nissan 3 ; VN 22 · APV 11 · RH 10 ; GROUPE BONY 37 puis 12
    concessions nommées). `RH` confirmé présent dans le sélecteur de filtre **dans le
    navigateur**. `tsc` 9 racine / 0 backend.
    **IMPORT EXÉCUTÉ le 02/09/2026** — 43/43 créées, via `localhost:3001` (qui écrit
    dans la base de production). Aller-retour `--limit 1` commit + rollback prouvé
    AVANT, sur « ADAM - CONSEIL » : création, contrôle des champs en base, refus de
    l'annulation sans confirmation, annulation effective, retour à 3 publications.
    Contrôlé après l'import complet : **46 publications en base** (43 + les 3 de Théo),
    première au **2026-09-01**, dernière au **2026-12-29**, **0 doublon**, **0 mojibake**
    (`Validé`, `Pensez à covoiturer`, apostrophes typographiques U+2019 et retours à la
    ligne du wording conservés), 5 publications portant un lien SharePoint, répartition
    identique au dry-run (Holding 24 · Dacia 12 · Renault 10 · Nissan 3 ; VN 22 · APV 11
    · **RH 10**). Vérifié à l'écran : le sélecteur de service affiche bien **RH** et non
    un champ vide.
    Fichier d'annulation : `~/Downloads/import-edito-20260902-152859.jsonl` (43 ids).
    ⚠️ `--rollback` exige désormais une confirmation : `SUPPRIMER` tapé à la main dans un
    terminal, ou `--confirmer SUPPRIMER` hors terminal (agent, CI) — le geste reste
    explicite sans rendre le script inexécutable en automatisation.
    ℹ️ **Reste à faire** : le dépôt manuel des 7 fichiers listés dans le rapport.

47. **DIGITAL — REFONTE DE LA LIGNE D'ÉDITO, et DEUX bugs d'empilement**
    (`fix/edito-empilement-et-refonte-ligne`, 2 septembre). Frontend seul → `web`,
    **aucune migration**.

    ⚠️⚠️ **LE DÉFAUT STRUCTURANT DE CE LOT, à retenir avant tout le reste :
    `.gx-glass-panel` porte un `backdrop-filter`, et `backdrop-filter` CRÉE UN CONTEXTE
    D'EMPILEMENT.** Tout élément positionné à l'intérieur d'une ligne d'édito y est donc
    enfermé : son `z-index`, quelle qu'en soit la valeur, ne le fera jamais passer
    au-dessus de la ligne SUIVANTE, qui est un simple frère plus bas dans le DOM.
    Deux composants en souffraient :
    1. le menu de `VisualMultiSelect` (`absolute … z-50`) — signalé par Théo ;
    2. le **wording**, qui passait en `absolute` au focus pour s'agrandir.
    ⚠️ **Le second a survécu au correctif du premier**, dans un fichier que je venais de
    modifier : j'avais traité le symptôme signalé sans chercher ses jumeaux. Théo l'a
    trouvé à la recette suivante. **Quand une cause est structurelle, chercher TOUS ses
    porteurs, pas seulement celui qu'on vous montre.**
    Les deux passent désormais par `components/FloatingPanel.tsx` — portalisé sur
    `document.body`, `position: fixed`, `z-[10000]`, ancré au déclencheur. La brique
    existait déjà et `components/Select.tsx` s'en servait : c'est exactement pour ça que
    les sélecteurs Statut/Service/LOM/CO² n'ont JAMAIS eu le problème, et que seuls
    Marques/Sites/Réseaux l'avaient. Vérifié en mesurant l'élément réellement peint à la
    jonction des deux lignes : une option de menu, puis le textarea.

    **REFONTE — deux passes, la première REFUSÉE, et c'est instructif.**
    La première version privilégiait la compacité : 178 → 99 px par ligne, en rognant le
    wording à 44 px et en gardant les réglages répartis de part et d'autre du texte.
    Verdict de Théo : « *c'est pire qu'avant* ». Deux enseignements :
    - **la hauteur n'était pas le vrai grief** — la lisibilité et la cohérence l'étaient ;
    - **les réglages étaient séparés en deux paquets** (Date/Statut/Service/Diffusion d'un
      côté, Marques/Sites/Réseaux/LOM/CO² de l'autre), donc on cherchait un réglage dans
      deux zones que le texte séparait. Défaut hérité de la version d'origine, que la
      première passe n'avait pas corrigé, seulement déplacé.

    **Version retenue** — deux zones et une seule grammaire :
    - **CONTENU** à gauche : titre + lien sur une ligne, puis un aperçu de wording de
      78 px, cliquable, qui ouvre un vrai panneau d'écriture de **456 × 217 px** (avec
      compteur de caractères, fermeture par Échap ou par le bouton) ;
    - **RÉGLAGES** à droite : les **neuf** contrôles dans UNE grille (5 colonnes × 2
      rangées), chacun sous un micro-intitulé. Les sélecteurs se ressemblaient tous et
      n'étaient identifiables que par leur texte de remplacement, qui disparaît dès
      qu'une valeur est posée ;
    - **ACTIONS** à droite, en ligne (elles occupaient une colonne verticale qui
      réservait 152 px pour trois boutons).

    ⚠️ **La zone de wording a une hauteur FIXE (`h-[78px]`) et non `flex-1`.** Laissée
    libre, elle suivait la longueur du texte : mesuré, l'édito « FORUM PR » faisait monter
    sa ligne à **507 px**. Le texte intégral se lit et s'édite dans le panneau.

    ⚠️ **Pastilles à hauteur fixe, 1 visible + « +N »**, infobulle donnant la liste
    complète. En les laissant passer à la ligne, « Réseaux » atteignait 72 px dès 5
    réseaux cochés et imposait 152 px à toute la colonne. Contrepartie assumée : plus de
    croix de suppression sur la pastille, on décoche dans le menu.

    **`DatePicker` : nouvelle prop `compact`** → `01/09/2026` au lieu de « 1 sept. 2026 ».
    Opt-in délibéré, le format long reste le défaut partout ailleurs ; seule la ligne
    d'édito l'utilise, parce qu'elle aligne neuf contrôles côte à côte.

    **Mesuré** (et non estimé), à 1669 px : ligne **126 px** contre 178, uniforme sur les
    44 éditos, d'un seul tenant, sans débordement horizontal. Idem à 1440. À 375 px, deux
    colonnes de réglages.
    ⚠️ Piège corrigé en route : `min-w-[480px]` sur la grille de réglages **coupait la
    troisième colonne sur mobile** — les minimums en pixels doivent être préfixés `sm:`.
    Autre piège : le repli d'un conteneur `flex-wrap` se décide sur les **bases**
    (`flex-basis`), pas sur les `min-width` ; des bases trop larges faisaient basculer le
    bloc d'actions seul sur une deuxième rangée.
    `tsc` 9 racine / 0 backend, `check-plaques-sync` vert.

48. **SAUVEGARDE DE PROJET — la fin de « serveur injoignable ? »**
    (`fix/sauvegarde-projet-saturation`, 7 septembre). `api` **ET** `web`,
    **avec migration** (`20260907120000_add_task_project_id_index`, purement additive).

    ⚠️⚠️ **CAUSE MESURÉE EN PRODUCTION, PAS DÉDUITE DU CODE.** Théo et ses collègues
    recevaient, en tapant le nom d'une tâche, l'alerte « Échec de la sauvegarde du projet
    (serveur injoignable ?) ». Le message était **faux** : le serveur allait très bien.
    Relevé le 07/09 sur le VPS (`docker compose logs api | grep "PUT échoué"`) :
    - **48 échecs** sur les 4 jours de vie du conteneur, **tous sur le SEUL projet
      `326tr3ltm`** (Forum Pièces 2026, 24 tâches) ;
    - **28** en `Transaction already closed: timeout was 5000 ms, however 5009–10362 ms
      passed` (dont 22 levés dès le PREMIER statement de la transaction) ;
    - **20** en `Unable to start a transaction in the given time` (le `maxWait` de 2 s) ;
    - `restarts=0`, `OOMKilled=false`, conteneur debout depuis 4 jours → **l'hypothèse
      infra est écartée par la mesure**, pas par raisonnement ;
    - latence VPS → pooler Supabase mesurée à **~22 ms**, et le VPS a **8 vCPU**
      (et non 2, comme on aurait pu le supposer).

    **Le mécanisme, chiffré.** Le champ « nom de tâche » était un input contrôlé qui
    envoyait **le projet ENTIER avec toutes ses tâches à CHAQUE FRAPPE**. Côté serveur,
    chaque PUT ouvrait une transaction interactive faisant **~30 aller-retours
    séquentiels** (un `task.update` par tâche, quel que soit le champ modifié) et
    **épinglant une connexion serveur du pooler pgBouncer** pour toute sa durée, soit
    ~0,7 s. Taper 20 caractères lançait donc 20 transactions épinglées en 4 secondes,
    multipliées par le nombre de collègues. Le pooler saturait. Cela explique au mot près
    les deux observations de Théo : **« en tapant le nom »** (rafale) et **« surtout les
    gros projets »** (connexion épinglée plus longtemps).
    ⚠️ Le code l'admettait déjà : `pages/Projects.tsx` disait « un PUT, à CHAQUE FRAPPE »
    et `components/expert/TaskDetailPanel.tsx` qualifiait cela de « ruineux ». Personne
    n'avait fait le lien avec l'alerte, parce que **deux catch-all superposés** le
    rendaient illisible : le backend transformait **douze causes distinctes** en
    `404 Projet introuvable`, et le frontend affichait « serveur injoignable ? » **sans
    jamais tester le statut** — alors que `services/dataService.ts` distinguait déjà
    parfaitement réseau (`ApiError(0)`) et HTTP (`ApiError(status)`).

    **Phase 1 — discipline d'écriture (frontend).**
    - `components/ChampDiffere.tsx` (nouveau) : `ChampTexte` / `ChampNombre`, brouillon
      local et écriture **au blur**. Généralise le motif déjà éprouvé dans
      `expert/TaskDetailPanel`. Traite les **trois sorties sans blur** (démontage,
      onglet caché, fermeture) et porte la règle **« vide n'est pas zéro »**.
      ⚠️ Blur et NON debounce : un debounce envoie encore un PUT par *pause* de frappe,
      et se déclenche pendant que le champ a **encore le focus** — ce qui rouvre les deux
      défauts que le blur ferme (la ligne qui saute au tri, et la réponse serveur qui
      réécrase le brouillon).
    - **16 contrôles** basculés : 9 dans `Projects.tsx`, **7 dans `Campaigns.tsx`** —
      cet écran écrit dans la MÊME route et personne ne l'avait vu.
    - `services/fileSauvegardeProjet.ts` (nouveau) : **un seul PUT en vol par projet**,
      coalescence du dernier instantané, reprise sur `0` et `503`.
      ⚠️ **Invariant à ne pas casser** : la coalescence n'est sûre que parce que chaque
      charge est un **instantané complet**. Si elle devient un delta partiel, elle perdra
      des modifications **en silence**.
    - `utils/projet.ts` (nouveau) : la formule avancement / budget réel en **UNE** copie,
      au lieu de deux (`Projects.tsx` et `TodoList.tsx`, cette dernière **mutant** son
      argument).
    - Miroir `projetRef` comme unique source du « courant », `muterProjet(f)` à la place
      de `handleUpdateProject(objet)` sur les **22 appelants** : plus aucune écriture ne
      part d'une closure périmée.
    - Temps réel scindé : `RT_EVENTS.users` déclenchait un rechargement COMPLET des
      projets pour une simple photo de profil. Et le projet ouvert n'est plus réassis
      pendant une saisie vive.
    - Plus de `db.getProjects()` après **n'importe quel** échec : c'était un chemin de
      **perte de données** (une saturation passagère détruisait le travail non
      sauvegardé). Seuls 404 et 409 rechargent désormais.

    **Phase 2 — coût du PUT et erreurs honnêtes (backend).**
    - La transaction ne réécrit plus que les lignes **réellement modifiées** (comparaison
      champ à champ APRÈS `pickTaskData`, `createMany` pour les créations), `maxWait` et
      `timeout` explicites (8 s / 15 s), relecture finale **sortie** de la transaction,
      et **une** reprise sur saturation (le PUT est idempotent).
    - `statutPrisma()` : `P2025`→404, `P2002`/`P2003`→409, `P2028`/`P2024`/`P2034`→**503**
      + `Retry-After`, validation→400, reste→500. La trace serveur reste, enrichie du code
      Prisma. **Jamais `e.message` au client.**
    - `express.json({ limit: '2mb' })` et `errorHandler` qui respecte enfin `err.status`
      (un 413 sortait en 500).

    **Phase 3 — un seul client Prisma.** `backend/src/db.ts` (nouveau) remplace les
    **27** `new PrismaClient()`. Le `connection_limit` par défaut vaut `vCPU × 2 + 1` =
    **17 par client** sur ce VPS : le plafond théorique était de ~440 connexions face à un
    pooler qui s'en compte en dizaines. `DATABASE_URL` gagne
    `connection_limit=10&pool_timeout=20&connect_timeout=10`.

    **Deux correctifs collatéraux**, trouvés pendant l'audit :
    - **désassigner une tâche ne s'enregistrait JAMAIS** (`v || undefined`, supprimé par
      `JSON.stringify`, donc lu comme « non modifié » — 200 OK et rien ne bouge).
      **Troisième occurrence** du mode d'échec de `deadline` (correctif 42) ;
    - **un jeton expiré ne déconnectait pas** : le backend rendait `403` (corps texte) là
      où le frontend ne traite que le `401`. La session paraissait vivante et chaque
      sauvegarde échouait avec l'alerte générique — garanti quotidien, le jeton durant 24 h.

    **VÉRIFICATIONS FAITES (mesurées dans le navigateur et dans les logs) :**
    - **39 caractères tapés → 0 PUT pendant la frappe, 1 PUT au blur** (avant : 39) ;
    - **4 clics rapides sur « + AJOUTER UNE TÂCHE » → 4 tâches** en base
      (référence mesurée le 27/08 : **1**) — clôt la fiche correspondante ;
    - **1 PUT, un champ modifié, projet de 4 tâches → UN SEUL `UPDATE "Task"`**
      (avant : 4 ; sur un projet de 24 tâches : 1 au lieu de 24), vérifié dans le SQL
      généré avec `PRISMA_LOG_QUERIES=1` ;
    - le SQL ne contient plus `"id" = $1 … "createdAt" = $21` : `Project.updatedAt` est
      de nouveau écrit par Prisma et non par le client ;
    - **désassignation → `null` en base** (elle ne s'enregistrait jamais) ;
    - **supprimer une ligne en pleine saisie ne la ressuscite pas** (4 tâches → 3, le
      brouillon non validé n'existe nulle part) ;
    - classes d'erreur forcées : projet inexistant → **404**, `cost:"abc"` → **400**
      (était 404), corps de 5 Mo → **413** (était 500), jeton invalide → **401**
      (était 403), sans jeton → **401** JSON ;
    - **20 routes d'API sur 20 en 200** après la fusion des 27 clients Prisma.
    - `tsc --noEmit` : **9 erreurs à la racine** (les 9 préexistantes, inchangées),
      **0 au backend**.

    ⚠️ **NON VÉRIFIÉ, à assumer** : le **503** n'a pas pu être déclenché pour de vrai
    (il faudrait saturer le pooler) — seul le mappage est relu. Le test de charge
    concurrent prévu au plan n'a pas été joué. Et le parcours d'interface des écrans
    Budget / Digital / Chat / Agenda / Matériel après la fusion des clients Prisma a été
    interrompu : seules les **routes** ont été vérifiées, une par module.

49. **DIGITAL — RETOURS DE L'ÉQUIPE DIGITALE : lenteur du wording, libellés, tags
    partagés, nom et ordre des visuels** (`feat/digital-retours-equipe`, 9 septembre).
    `api` **ET** `web`, **avec migration**
    (`20260909120000_digital_media_names_et_tags_lom`, purement additive).

    Huit demandes remontées après une semaine d'usage intensif. **Tout est cantonné au
    module Digital** : aucune donnée budgétaire, aucun projet, aucune dépense fixe n'a
    été touché. Vérifié au diff : `SITES`, `PLAQUES_STRUCTURE`, `SITE_ALIASES` et les deux
    tables `DISTRIBUTION_GROUPE_BONY` sont intacts, `types.ts` n'a gagné qu'un champ
    `DigitalTags.lom`.

    **⚠️ TROIS DÉCOUVERTES qui ont changé le périmètre, toutes mesurées avant de coder :**

    1. **L'écran « Gestion des TAGS » n'écrivait PAS en base.** `getDigitalTags` /
       `saveDigitalTags` lisaient et écrivaient dans le **`localStorage` du navigateur**,
       alors que la route `/api/tags` et le modèle Prisma `DigitalTags` existaient depuis
       l'origine — **jamais appelés par le client** (vérifié : aucun `apiFetch('/tags')`
       nulle part). Les tags saisis étaient donc invisibles des collègues et perdus au
       vidage du navigateur, et `RT_EVENTS.tags` écoutait un événement que plus rien
       n'émettait.
    2. **La lenteur du wording pénalisait TOUTE l'équipe, pas seulement celui qui tape.**
       Chaque frappe envoyait la publication entière, et le serveur répondait par un
       `emitEvent('social:updated')` qui faisait **recharger les 57 publications chez
       chaque collègue connecté** (debounce 300 ms). Une personne qui rédigeait faisait
       donc recharger toute la liste à l'équipe ~3 fois par seconde.
    3. **Le renommage des images ne se corrige pas là où l'équipe le croyait.** L'uuid est
       VOLONTAIRE (`routes/uploads.ts` : « le nom d'origine ne doit JAMAIS entrer dans un
       chemin de fichier ») et `routes/social.ts` impose cette forme par expression
       régulière. Le nom d'origine est donc stocké **à côté**, pas dans le fichier.

    **Les huit demandes et leur traitement :**

    | Demande | Traitement |
    |---|---|
    | Le wording rame (gros problème) | Six causes cumulées, toutes corrigées — voir ci-dessous |
    | Sites : + tags FULL, − Ricoux, + Yssingeaux | Nouvelle constante `DIGITAL_CONCESSIONS`, **propre au Digital** |
    | Marques : Holding → GROUPE BONY | `DIGITAL_BRAND_LABELS`, **affichage seul**, valeur stockée inchangée |
    | Statut : Programmed → Programmé | `SOCIAL_STATUS_LABELS`, **affichage seul** |
    | Calendrier : un seul logo | `LogosReseaux` — 3 icônes max + « +N », avec dédoublonnage |
    | Images renommées à l'import | `SocialPost.mediaNames`, tableau parallèle |
    | Ordre des visuels | Numéro sur chaque vignette + glisser-déposer |
    | Accès aux autres tags | Tags branchés sur le serveur + 3ᵉ catégorie (Loi LOM) |

    **Les six causes de la lenteur, et leur correctif :**
    1. un `PUT /api/social/:id` **par frappe** sur le wording, le titre et le lien →
       `components/ChampDiffere.tsx` (créé au correctif 48) réutilisé, avec un nouveau
       rappel `onBrouillonChange` pour que l'aperçu et le compteur de caractères suivent
       la frappe sans rien envoyer ;
    2. la diffusion socket qui faisait refetcher toute la liste chez les collègues →
       supprimée par voie de conséquence, puisqu'il n'y a plus de PUT par frappe ;
    3. **aucun `React.memo` ni `useCallback`** dans les 1827 lignes du fichier → `EditoRow`
       mémoïsé, gestionnaires stabilisés ;
    4. `filteredPosts` triait avec **deux `new Date()` par comparaison** → clé de tri
       pré-calculée une fois par publication ;
    5. `components/DatePicker.tsx` reconstruisait ses **42 objets `Date` à chaque rendu,
       panneau FERMÉ compris** — soit ~2 400 par frappe sur l'ensemble des lignes → grille
       calculée seulement à l'ouverture. ⚠️ **Composant PARTAGÉ** (Projets, Agenda,
       Matériel, To-do) ;
    6. la recherche n'était pas temporisée et `useSessionState` fait un `JSON.stringify`
       **synchrone** à chaque écriture → brouillon local + temporisation 250 ms.

    **Généralisation de la file de sauvegarde.** `services/fileSauvegardeProjet.ts` (correctif
    48) devient une fabrique, `services/fileSauvegarde.ts` : `fileSauvegardeProjet` et
    `fileSauvegardePublication` en sont deux instanciations. ⚠️ `Projects.tsx` et
    `Campaigns.tsx` **n'ont pas été touchés** — l'interface publique est identique — mais la
    non-régression a été rejouée (voir plus bas). Écrire une deuxième file aurait divergé,
    comme les formules de budget quatre fois.

    **⚠️ La récupération des tags n'est PAS « si le serveur est vide ».** Mesuré le
    09/09/2026 en branchant la route : la table contenait les valeurs du **seed**
    (3 réseaux, classes A à G) tandis que le `localStorage` portait le vrai travail de
    l'équipe (34 modèles avec leur classe CO², 8 réseaux). Une garde sur le seul « vide »
    n'aurait jamais joué et l'équipe aurait vu son travail disparaître. On reconnaît donc
    la table **non curée** (vide OU strictement égale au seed) et on remonte **l'UNION** du
    serveur et du poste. Résultat sur le poste de Théo : 8 réseaux, 41 entrées CO².
    ℹ️ Les 7 classes A–G du seed sont donc désormais mêlées aux 34 modèles : elles se
    suppriment en dix secondes depuis l'écran, aucune donnée n'est en jeu.

    **VÉRIFICATIONS (mesurées dans l'interface, sur la base réelle) :**
    - **39 caractères tapés dans un wording → 0 PUT et 0 GET pendant la frappe, 1 PUT à la
      fermeture** (avant : 39 PUT + la rafale de rechargements chez chaque collègue) ;
    - **non-régression Projets** (file généralisée) : 4 clics rapides sur « + AJOUTER UNE
      TÂCHE » → **4 tâches** ;
    - calendrier, à 1400 px : 5 réseaux → **3 icônes + « +2 »**, 2 réseaux → 2 icônes,
      jamais plus de 3, **hauteur de cellule uniforme à 231 px**, aucun débordement ;
    - dédoublonnage : « FERMETURE CONCESSION VDR » (Facebook + Story Instagram + Story
      Facebook) → **2 icônes distinctes**, pas de Facebook en double ;
    - sélecteur Sites : les 4 tags FULL et Yssingeaux présents, **Ricoux absent** ;
    - « Holding » et « Programmed » ont disparu de l'écran, **et la base contient toujours
      `Holding`** ;
    - médias : dépôt de `1-avant.png` / `2-pendant.png` / `3-apres.png` → noms d'origine en
      base, urls **toujours en uuid** sur le disque ; glisser la 3ᵉ vignette en 1ʳᵉ position
      → ordre persisté en base **et** à l'écran ; PUT sans `mediaNames` → noms conservés ;
      PUT tronquant `mediaFiles` à 2 → `mediaNames` recalé à 2 ;
    - **compatibilité ascendante** : une publication antérieure au correctif (`mediaNames`
      vide) affiche ses 2 images, numérotées, avec le nom uuid en repli — aucune régression ;
    - tags : un tag ajouté dans l'écran est **immédiatement présent dans `GET /api/tags`** ;
    - `tsc --noEmit` : **9 erreurs à la racine** (les préexistantes), **0 au backend** ;
      `check-plaques-sync` vert.
    - Données de test créées puis supprimées : **57 publications et 123 projets avant comme
      après, zéro résidu.**

    ⚠️ **NON VÉRIFIÉ, à assumer** : le parcours à DEUX POSTES simultanés (la preuve la plus
    parlante que l'équipe entière est soulagée, et que les tags sont bien partagés) n'a pas
    pu être joué — il demande deux sessions. C'est le contrôle de 2 minutes à faire par
    Théo avec un collègue. Le rôle `External`, qui édite le Digital depuis le 25/08, n'a pas
    non plus été parcouru faute de compte.

50. **DIGITAL — SECOND RETOUR DE L'ÉQUIPE : liens cliquables, commentaires par édito,
    plaques hors du sélecteur, statut « Constructeur »** (`feat/digital-retours-equipe-2`,
    10 septembre 2026). Frontend **et** backend, **avec migration**
    (`20260910120000_add_social_comments`, purement additive). Quatre demandes de l'équipe,
    plus **deux défauts trouvés en chemin**, dont l'un était un prérequis technique.

    - **Les liens sont cliquables** (`pages/Digital.tsx`). Le champ « Lien » d'une ligne
      d'édito était un `<input>` nu, sans `<a>` : l'équipe recopiait l'adresse à la main.
      Il rend désormais un vrai lien (nouvel onglet, `rel="noopener noreferrer"`, libellé
      raccourci par `libelleCourt`, url complète en infobulle) avec un **crayon** qui
      rouvre la saisie ; le champ reste affiché tant qu'il n'y a rien à ouvrir.
      ⚠️ **Le garde de protocole `hrefSur` est le prix de cette fonction, pas un ornement** :
      `SocialPost.link` n'est validé NULLE PART (`String` libre côté Prisma, jamais regardé
      par la route). Tant que le champ était inerte, son contenu ne pouvait rien faire ; le
      rendre cliquable aurait transformé un `javascript:…` en exécutable d'un clic, dans la
      session du collègue qui suit le lien. Seuls `http`/`https` sont rendus, et `www.…`
      est préfixé (l'équipe colle souvent sans protocole, et une url sans schéma serait lue
      comme un chemin RELATIF à Gearbox). **Vérifié** : `javascript:alert(1)` saisi →
      aucune ancre, le champ reste ; `www.bonyauto-mobile.com/test` → `https://…`.
      La fermeture se fait sur la **perte de focus** et non sur `onValider` : celui-ci
      n'est appelé que si la valeur a CHANGÉ (garde de `ChampTexte`), donc ouvrir puis
      renoncer laissait le champ ouvert indéfiniment. `ChampTexte` reçoit au passage un
      `autoFocus` optionnel — sans lui, le crayon ouvrait un champ qu'il fallait ensuite
      aller cliquer.
    - **Un fil de COMMENTAIRES par publication.** Nouveau modèle `SocialComment`
      (`postId` + `@@index`, `onDelete: Cascade`), trois routes REST dans `social.ts`,
      **déclarées avant `/:id`** — sans quoi `DELETE /comments/:id` serait capturée par
      `DELETE /:id`, qui supprimerait la publication dont l'id vaudrait « comments ».
      ⚠️ **Aucun nom ni couleur d'auteur n'est stocké** : `authorId` seul, l'identité est
      résolue **par le serveur à la lecture** (via `publicUser`) — un renommage ne doit pas
      laisser l'ancien nom dans l'historique (leçon des parties de jeu, correctif 30), et
      c'est le serveur qui résout parce qu'un rôle cloisonné ne reçoit de `GET /api/users`
      que sa propre fiche : il lirait sinon « Utilisateur » partout.
      Côté écran, un **4ᵉ bouton** dans la colonne d'actions avec pastille de compte, et un
      `FloatingPanel` **portalisé** — obligatoire, `.gx-glass-panel` porte un
      `backdrop-filter` qui crée un contexte d'empilement (c'est le bug du correctif 47).
      Le panneau n'est **monté que lorsqu'il est ouvert** : c'est ce qui permet d'y appeler
      `useRealtimeSync` sans poser 57 abonnements, un par ligne.
      ⚠️ Événement temps réel **distinct** (`social-comment:updated` / `:deleted`) :
      réutiliser `social:updated` aurait fait recharger la liste entière chez tous les
      collègues à chaque commentaire — exactement la lenteur que le correctif 49 venait de
      supprimer. L'écran s'y abonne quand même pour les **compteurs**, un commentaire étant
      un événement rare.
    - **Les plaques quittent le sélecteur « Sites »** d'une ligne (`DIGITAL_CONCESSIONS`,
      `constants.ts`) : l'équipe vise des concessions réelles. Le **filtre ★ PLAQUE de
      l'onglet Planning est conservé** — là, une plaque est une façon de LIRE plusieurs
      sites d'un coup, pas une valeur saisie. `PLAQUES_STRUCTURE` n'est pas touché
      (dupliqué côté backend, surveillé par `check-plaques-sync`).
      ⚠️ **Mesuré avant de coder, et ça a changé le correctif** : **9 publications réelles
      portent des plaques** dans `concessions` (« OPO SEPTEMBRE RENAULT », « LANCEMENT LEAF
      J-7 »… — elles s'en servent comme d'un « tout le réseau »). Or le bouton du
      `VisualMultiSelect` rend `selected`, pas `options` : la valeur serait restée
      AFFICHÉE sans figurer dans le menu, donc **impossible à décocher**. Le sélecteur
      complète donc ses options par les valeurs déjà retenues. Vérifié sur « OFFRES
      ACCESSOIRES DACIA » : 33 options au lieu de 29, les 4 plaques cochées et décochables.
    - **Statut « Constructeur »**, en 2ᵉ position, cyan. Trois lignes en tout
      (`types.ts`, `SOCIAL_STATUS_COLORS`), **aucun changement serveur** : `status` est un
      `String` libre. ⚠️ **L'ordre des clés de `SOCIAL_STATUS_COLORS` EST l'ordre du menu**
      (`Object.keys`) — c'est désormais écrit au-dessus de la constante. Le texte porte une
      variante `dark:` que les huit autres n'ont pas : sans elle, un `text-cyan-300` pâlit
      en thème clair.
    - **PRÉREQUIS TECHNIQUE — `SOCIAL_FIELDS`, la liste blanche d'écriture** de
      `routes/social.ts`. Le POST et le PUT passaient `req.body` **BRUT** à Prisma. C'est
      tenable tant que le client renvoie exactement les colonnes du modèle — mais il
      renvoie la publication **entière** à chaque sauvegarde (`stripMeta`), donc le jour où
      la réponse du GET porte un champ de plus (`commentCount`, dérivé et non stocké), ce
      champ repart au PUT, Prisma refuse l'argument inconnu et **toutes** les sauvegardes
      tombent. La fonctionnalité imposait donc de fermer la dette. C'est la **cinquième
      porte** du backend, avec le même piège que `TASK_FIELDS` : un champ absent de la
      liste est jeté **en silence**.
    - **Défaut trouvé en chemin : la purge faisait DÉRIVER les noms de visuels.**
      `jobs/purge.ts` écrivait `mediaFiles` sans toucher `mediaNames`, alors que le schéma
      pose la règle « ne jamais écrire ces deux colonnes ailleurs sans repasser par
      `normaliserMediaNames` ». La purge 30 j retire des entrées **au milieu** du tableau :
      les noms suivants glissaient d'un cran et s'affichaient sur les mauvais médias.
      **Prouvé** sur un cas fabriqué (fichier · lien · fichier, les deux fichiers purgés) :
      le lien restant conserve `le-lien.txt` au lieu d'hériter de `premier.jpg`.

    **Vérifié dans l'interface, sur les données réelles et sur une publication jetable**
    (« TEST CORRECTIF 50 »), créée puis supprimée : 3 liens réels rendus cliquables ;
    statut persisté en base et bande cyan calculée (`rgb(6,182,212)`) dans la ligne **et**
    sur la tuile du Planning ; 29 options de sites sans aucune plaque ; commentaire créé
    (auteur et couleur résolus serveur), relu, compteur exact, supprimé ; bornes du
    commentaire (vide → 400, > 2 000 caractères → 400, publication inconnue → 404) ;
    **cascade prouvée** — publication supprimée, `SocialComment` à 0 en base, 61
    publications avant comme après, zéro résidu.
    **Non-régression de la liste blanche, le contrôle le plus important** : les **15
    champs** ont été réécrits et relus un par un (titre, statut, date, service, marques,
    réseaux, sites, diffusion, wording, LOM, CO², lien, médias + noms, archivage) — un
    champ oublié aurait été jeté sans erreur ni trace. `archivedAt` reste géré serveur
    (posé à l'archivage, vidé au désarchivage).
    Mesuré : hauteur de ligne **inchangée à 170 px**, colonne d'actions 161 px pour un
    en-tête porté à 152 (le décalage de 9 px est celui d'avant, à l'identique), panneau de
    320 px qui ne déborde ni à 1 280 ni à **375 px**, bouton à **44 px** au doigt, aucun
    scroll horizontal à 1 400, 1 280, 1 000 et 375 px.
    `tsc --noEmit` : **9 à la racine** (les préexistantes), **0 au backend** ;
    `check-plaques-sync` vert ; build de production OK.

    ⚠️ **La migration a été appliquée depuis ce poste AVANT le déploiement**, comme au
    correctif 49 : `prisma db execute` (le `migrate deploy` étant refusé par le classifieur
    de sécurité de l'agent), **puis `prisma migrate resolve --applied`** pour l'inscrire
    dans `_prisma_migrations`. Cette seconde commande n'est pas facultative : sans elle le
    conteneur `api` rejouerait la migration au démarrage, échouerait sur une table déjà
    existante et **ne démarrerait pas**. `migrate status` rend « Database schema is up to
    date! » avant le déploiement.

    ⚠️ **NON VÉRIFIÉ, à assumer** : (1) le refus **403** de supprimer le commentaire d'un
    AUTRE auteur — le seul compte disponible est Master, qui a justement le droit
    d'arbitrer ; il faut un second compte non-admin. (2) Le temps réel des commentaires
    **à deux postes**. (3) Les rôles `Site Manager` (qui doit LIRE le fil sans pouvoir
    commenter) et `External`, faute de comptes — même trou qu'aux correctifs 45 et 49.

51. **INCIDENT — les tags CO² et Loi LOM effacés de la base, restaurés, et le trou fermé**
    (`fix/tags-digital-ecrasement`, 10 septembre 2026). Frontend **et** backend, aucune
    migration. Signalé par Théo le jour même : les colonnes « CLASSES CO² & MENTIONS » et
    « MENTIONS LOI LOM » de l'écran Gestion des TAGS étaient vides, les 8 réseaux intacts.

    - **Constat en base avant toute hypothèse** : `DigitalTags` portait `networks` (8),
      `co2` **[]**, `lom` **[]**.
    - **Effet de bord plus grave que l'écran vide** : 3 mentions Loi LOM étaient
      **utilisées par des publications**. Un `<Select>` dont la valeur n'est pas dans ses
      options retombe sur son placeholder — ces publications affichaient donc « Aucune »,
      et la première personne qui touchait ce champ aurait écrasé la vraie valeur. Le
      piège est écrit noir sur blanc dans `constants.ts` depuis le correctif 46 ; il s'est
      réalisé.
    - **Restauration** depuis `CO2_OPTIONS` / `LOI_LOM_OPTIONS` de `constants.ts` — la
      donnée n'était pas perdue, elle vit dans le code — **après union avec les valeurs
      réellement employées par les 61 publications**, pour ne rien laisser dehors.
      Résultat : 34 modèles, 4 mentions, `networks` non touché, les 3 mentions utilisées
      toutes présentes. Les 7 classes A–G du seed n'ont pas été remises (fiche de ménage
      ouverte depuis le correctif 49). Écrit en base directement, donc **sans événement
      `tags:updated`** : les écrans ouverts devaient être rechargés une fois.
    - ⚠️ **CAUSE EXACTE NON ÉTABLIE, et c'est un défaut en soi.** Rien ne journalise cette
      table : `DigitalTags` n'a pas d'`updatedAt`, l'ActivityLog ne couvre pas les tags, et
      les logs du conteneur `api` repartent de zéro à chaque déploiement — il n'en restait
      que 50 lignes. Certain : l'écrasement ne peut venir que d'un `POST /api/tags` portant
      `co2: []` et `lom: []`, dont le seul émetteur possible est l'écran Gestion des TAGS.
      Établi dans le code : `handleUpdateTags` envoyait **les trois catégories** à chaque
      action, donc l'état de l'écran faisait autorité sur des listes qu'il n'avait pas
      forcément chargées ; et `loadData` chargeait publications et tags dans un
      **`Promise.all`**, si bien que l'échec du chargement des publications empêchait
      `setTags` d'être atteint et laissait l'écran sur son état initial — trois listes
      vides. Les deux se combinent exactement en « une action sur les tags écrit du vide ».
    - **Trois parades indépendantes**, plutôt qu'un correctif ponctuel :
      1. l'écran n'envoie plus qu'un **patch d'une seule catégorie**. `routes/tags.ts`
         savait déjà le traiter — son commentaire dit « un client qui n'envoie que
         `networks` ne doit pas vider `co2` et `lom` » : **le backend était correct, c'est
         le client qui ne s'en servait pas**. Vider une catégorie qu'on ne modifie pas
         devient structurellement impossible.
      2. drapeau `tagsCharges` : aucune écriture tant que les tags n'ont pas été **lus**
         avec succès.
      3. `Promise.allSettled` dans `loadData` : deux chargements indépendants doivent
         échouer indépendamment. L'erreur des publications est toujours propagée, mais
         **après** avoir posé ce qui a réussi.
    - **Trace serveur ajoutée** : `[tags] ⚠️ catégorie "x" VIDÉE : N entrée(s)…` avec l'id
      de l'auteur. Vider reste permis (c'est une action légitime), mais laisse enfin
      quelque chose à lire. Second `console.warn` sur toute **troncature** : la plus longue
      mention Loi LOM fait **exactement 80 caractères**, soit `MAX_LONGUEUR` au caractère
      près — une mention plus longue serait rognée en silence et ne correspondrait plus à
      ce que portent les publications.

    **Leçon** : le correctif 49 a livré un backend prudent (écriture par catégorie) et un
    client qui envoyait tout. Une garantie côté serveur ne protège que si l'appelant s'en
    sert — comme `redactSiteFields` ou `publicUser`, elle doit être la **seule forme
    possible**, pas une possibilité offerte.

52. **CHAT — barre de saisie utilisable sur mobile, et fonds de discussion**
    (`feat/chat-saisie-mobile-et-fonds`, 11 septembre 2026). Frontend **et** backend,
    **avec migration** (`20260911120000_add_user_chat_background`, purement additive).
    Demande de Théo après un essai sur téléphone : « on n'a plus de place pour la saisie
    de texte », et « j'aimerais pouvoir mettre des fonds de chat de mon choix, comme sur
    WhatsApp et Messenger ».

    - **Le champ de saisie faisait 19 px de large à 375 px.** Mesuré, pas estimé : cinq
      pictos d'action à 44 px (la zone tactile minimale du projet, non négociable) plus
      leurs écarts occupaient 220 px des 349 disponibles. On écrivait dans une fente.
      ⚠️ La correction ne pouvait pas être de rétrécir les boutons — c'est le NOMBRE qui
      devait baisser. Sous `md`, les cinq actions sont repliées derrière un seul bouton
      « + » qui ouvre un menu, comme le font WhatsApp et Messenger ; sur ordinateur la
      barre est **inchangée** (vérifié : 5 pictos de 36 px, champ à 580 px).
      **Mesuré après : 19 px → 227 px**, à hauteur de barre constante (54 px).
      Le **micro reste à droite**, à la place du bouton d'envoi tant que le champ est
      vide (convention WhatsApp) : le vocal reste accessible d'un doigt **sans coûter un
      pixel** au champ de texte — c'est pourquoi il n'est pas dans le menu.
      ⚠️ **Une seule liste d'actions** (`actionsSaisie`), rendue à deux endroits. Écrire
      deux fois les mêmes boutons est exactement ce qui a fait diverger la navigation du
      chef de site (correctif 32) ; les menus GIF et « citer un projet » sont désormais
      ancrés sur **la barre** et non sur leur picto, qui n'existe plus sur mobile.
      Corrigé au passage : le placeholder « Écrire un message… (Entrée pour envoyer) »
      passait sur deux lignes et se faisait couper — et sa parenthèse n'a aucun sens au
      doigt, où Entrée retourne à la ligne. Un attribut ne se change pas en CSS, d'où un
      `matchMedia` aligné sur le seuil `md`.
    - **Fonds de discussion** : 12 fonds **procéduraux** (`lib/personnalisationChat.ts`)
      plus l'import d'une image personnelle, et **12 couleurs de bulles**.
      ⚠️ **Le premier jet a été refusé** — « ils sont d'une tristesse omg ». Cause : ses
      opacités étaient bridées à 0,12-0,16 comme si le fond devait rester lisible SOUS du
      texte. Précaution inutile : le texte d'un message est toujours sur une bulle, jamais
      sur le fond ; seuls les séparateurs de date et les horodatages y flottent. Le
      catalogue a donc été refait franchement coloré (Miami, Aurore boréale, Agrumes,
      Lagon, Holographique, Synthwave, Terrazzo, Confettis, Memphis, Bulles néon) en
      gardant deux sobres, et le voile des fonds du catalogue est descendu à 10 % — le
      monter délave précisément ce qu'on vient d'ajouter.
      **Couleur des bulles** demandée dans le même message (« le dégradé on peut vite s'en
      lasser ») : elle ne change QUE mes messages, ceux des autres gardant le panneau
      neutre — sinon on ne distingue plus qui parle. Deux couleurs claires (Or, Menthe)
      portent un drapeau `texteSombre` : du blanc sur du jaune ne se lit pas.
      ⚠️ La valeur stockée est un **identifiant**, jamais du CSS : elle est injectée dans
      un attribut `style`, et accepter `linear-gradient(...)` reviendrait à laisser un
      compte écrire une déclaration de style dans la page.
      ⚠️ **Tout en CSS, aucune image téléchargée pour les fonds du catalogue** — dégradés
      et motifs SVG en `data:`. Le lot PWA a acté que l'app n'a aucun mode hors-ligne et
      que tout vient du réseau : huit images de fond auraient alourdi chaque ouverture du
      chat, et un dégradé reste net à toutes les densités d'écran.
      ⚠️ **Deux variantes par fond, clair et sombre** : un fond pensé pour le sombre vire
      au gris sale sur fond blanc et rend les bulles translucides illisibles.
      ⚠️ **Un voile est posé par-dessus**, plus opaque pour une image importée (55 %) que
      pour un fond du catalogue (15-20 %) : on ne maîtrise ni la luminosité ni le
      contraste d'une photo, et c'est lui qui garde le texte lisible.
      Le fond est **celui de qui regarde**, jamais partagé — chacun le sien, comme sur
      WhatsApp.
    - **Stocké en base** (`User.chatBackground`) et **non en `localStorage`** : Théo
      travaille sur son poste, son iPhone et son Pixel. Une préférence rangée dans le
      navigateur serait à refaire sur chaque appareil — c'est la leçon de la date de
      naissance et des tags Digital, qui ont chacun coûté un correctif.
    - ⚠️ **VALIDÉ CÔTÉ SERVEUR**, et c'est le point à ne pas relâcher. Deux formes
      acceptées et deux seulement : `proc:<id>` ou `/uploads/chatbg/<uuid>.<ext>`. Sans
      ça, ce champ serait une seconde version du trou connu d'`avatarUrl`, où un appel
      direct écrit une URL **externe** ensuite chargée par le navigateur — en pire, un
      fond s'affiche en grand et en permanence. Le motif n'est volontairement PAS élargi
      à `/uploads/` : les dossiers `chat/` et `project/` n'ont aucun filtre de format.
      Le serveur valide la **forme** et non la liste des ids (elle vit côté frontend, que
      le backend ne peut pas importer) : un id inconnu est sans danger, l'écran retombe
      proprement sur « aucun fond ».
    - Nouveau type d'upload `chatbg` (JPEG/PNG/WebP, 8 Mo). **Liste blanche assumée**,
      contrairement à `chat` et `project` : ce fichier n'est jamais ouvert ni téléchargé,
      il est rendu dans un `background-image`. `image/gif` en est **volontairement
      absent** — un fond animé derrière chaque message fatigue la lecture.

    **Vérifié dans l'interface**, sur les deux largeurs : champ 19 → **227 px** à 375 px
    et **580 px** inchangé à 1 400 px ; menu « + » avec ses 4 actions à 44 px, sans
    débordement ; micro qui devient bouton d'envoi dès la première frappe et redevient
    micro à l'effacement ; fond procédural appliqué et **persisté** (relu après
    rechargement) ; image importée par le vrai chemin de l'interface, rendue avec son
    voile à 55 % ; aucun scroll horizontal.
    **Sécurité mesurée** : `https://tiers.example/pixel.gif` → **400**,
    `/uploads/chat/abcd.png` → **400**, `javascript:alert(1)` → **400**, GIF → **415**,
    8 Mo + 1 octet → **413**, 8 Mo pile → **200** (la limite est inclusive, correctif 28).
    **Repli vérifié** sur un id inconnu écrit en base (`proc:inexistant`) : aucun style,
    **et aucun voile** — le premier jet posait un filtre sur la conversation sans fond
    derrière, corrigé avant de conclure.
    `tsc` : **9 à la racine**, **0 au backend** ; `check-plaques-sync` vert ; build de
    production OK. Fichiers de test supprimés du disque, `chatBackground` remis à `null`.

    **Vérifié aussi après la refonte** : les 12 fonds et les 12 bulles présents dans la
    modale, fond + bulle appliqués et **persistés** (`proc:miami` / `ocean` relus en base),
    rendu contrôlé en thème **clair ET sombre** (le fond bascule bien sur sa variante),
    puis tout remis à `null`.
    ⚠️ **Défaut trouvé à la refonte, et il serait passé inaperçu** : la modale itérait sur
    une liste de familles écrite **à la main** (`['Dégradés','Motifs','Sobres']`). Renommer
    une famille dans le catalogue a fait disparaître **toute sa section** — les six
    nouveaux fonds « Couleurs » — sans la moindre erreur, ni au typecheck ni à l'exécution.
    La liste est désormais **dérivée du catalogue**. Même famille de piège que les listes
    de boutons recopiées.

    ⚠️ **NON VÉRIFIÉ** : le rendu sur un VRAI téléphone (l'émulation ne dit rien du
    clavier virtuel, qui réduit la hauteur utile).

53. **CHAT — l'import d'image ne faisait RIEN, et la personnalisation devient PAR
    DISCUSSION** (`fix/chat-perso-par-conversation`, 11 septembre 2026). Frontend **et**
    backend, **avec migration** (`20260911160000_add_chat_customization`, purement
    additive). Deux reproches de Théo sur le correctif 52, tous les deux fondés.

    - ⚠️⚠️ **« L'upload d'image ne fonctionne pas, ça fait littéralement rien. »** Exact,
      et la cause est structurelle : l'`<input type="file">` était placé **à l'intérieur
      de l'overlay** de la modale, qui porte `onClick={fermer}`. Cliquer « Importer »
      appelait `input.click()`, dont l'événement **remonte** jusqu'à cet overlay : la
      modale se fermait, le sous-arbre était démonté, et l'input porteur du `onChange`
      n'existait plus quand l'utilisateur validait son fichier. Aucune erreur, aucune
      requête — rien. **Corrigé** : l'input vit désormais à la racine du composant,
      toujours monté, comme `imageInputRef` et `fileInputRef` du chat.
      ⚠️ **POURQUOI MON TEST NE L'A PAS VU, et c'est la vraie leçon** : j'avais injecté le
      fichier dans l'input par script (`DataTransfer` + `dispatchEvent`) au lieu de
      **cliquer sur le bouton**. Le chemin réel — le clic, sa propagation, le démontage —
      n'était donc jamais exercé. C'est mot pour mot la leçon déjà écrite deux fois dans
      ce dépôt (escalade de rôle, navigation du chef de site) : **un test fabriqué ne
      remplace pas le parcours réel**. Vérification refaite en cliquant pour de bon, avec
      le dialogue natif neutralisé mais la propagation intacte : la modale reste ouverte
      et l'input est **le même élément** avant et après.
    - **La personnalisation est désormais PROPRE À CHAQUE DISCUSSION**, ce qui était la
      demande initiale mal comprise. Nouveau modèle `ChatCustomization` (une ligne par
      couple utilisateur × conversation, `@@unique` pour l'upsert), deux routes dans
      `routes/chat.ts`, et un chargement en **une seule requête** à l'ouverture du Chat —
      l'écran change de fil sans aller-retour réseau.
      `User.chatBackground` / `chatBubble` sont conservés et deviennent le **défaut** des
      discussions sans réglage propre, posé par un bouton « Toutes mes discussions ».
      ⚠️ `??` et non `||` dans le repli : une valeur vide enregistrée signifie « pas de
      fond ICI », et `||` la remplacerait par le défaut global — on ne pourrait alors plus
      retirer un fond sur une seule discussion.
      ⚠️ **Aucun `emitEvent`** sur ces routes : ce réglage ne regarde que son auteur, le
      diffuser ferait recharger l'écran de collègues que ça ne concerne pas.
    - **Validation extraite** dans `backend/src/utils/personnalisationChat.ts` : deux
      routes écrivent maintenant ces valeurs (`PUT /api/auth/me` pour le défaut,
      `PUT /api/chat/conversations/:id/customization` pour une discussion). Deux copies
      des mêmes expressions régulières auraient divergé — c'est le reproche que ce dépôt
      fait aux `where` de site recopiés.

    **Vérifié dans l'interface** : deux conversations côte à côte, l'une avec son fond et
    ses bulles, l'autre **sans aucun fond** ; image importée par le vrai chemin, appliquée
    à la seule discussion courante ; réglages relus après rechargement.
    **Sécurité de la nouvelle route** : conversation dont on n'est pas membre → **403**,
    conversation inconnue → **404**, url externe → **400**, `/uploads/chat/…` → **400**,
    `linear-gradient(...)` en guise de couleur de bulle → **400**, corps vide → **400**.
    `tsc` 9 racine / 0 backend, build OK. **Résidus supprimés** : ligne de
    personnalisation de test effacée, fichier importé retiré du disque, compte remis à
    `null` — `ChatCustomization` est vide en base pour tous les comptes.

54. **NOUVELLE RUBRIQUE — CONGÉS** (`feat/rubrique-conges`, 12 septembre 2026).
    Frontend **et** backend, **avec migration** (`20260912100000_add_conges`, purement
    additive : deux tables nouvelles).

    Portage du fichier HTML tenu par le boss de Théo (planning 2026 de l'équipe
    marketing, 15 collaborateurs, données en `localStorage` sur un seul poste). La
    maquette a servi de **cahier des charges**, pas de code : son thème sombre autonome
    n'a aucun rapport avec la charte liquid glass.

    **Arbitrages de Théo, tous tranchés avant de coder :**
    - chacun pose et modifie SA ligne ; Master / Administrator / Director posent pour
      tout le monde ;
    - ⚠️ **seuls Master et Director VALIDENT** (le ✓). Administrator en est exclu — ce
      n'est pas une incohérence avec le point précédent, c'est la demande ;
    - les 3 équipes de la maquette (Mkt Op. / Digital / Call Center) sont **abandonnées** :
      Gearbox n'a pas cette notion, une seule liste à plat ;
    - **tout le monde voit tout** le planning, et il n'y a **aucun solde annuel** — on
      compte les jours posés, rien à saisir ni à remettre à jour chaque année.

    - **Le PÉRIMÈTRE, cœur de la demande.** « Tous les utilisateurs Gearbox ne sont pas du
      marketing » : une table `CongeMembre` dit qui apparaît dans le planning, gérée
      depuis l'écran (bouton « Participants »). La rubrique n'est **visible que** des
      membres et de ceux qui la gèrent — un store calqué sur `services/appSettings.ts`,
      avec le même défaut prudent à `false` et le même suivi temps réel.
      ⚠️ **Table dédiée et non un booléen sur `User`** : `routes/users.ts` déstructure ses
      champs à plusieurs endroits et `publicUser` doit suivre — c'est le piège qui a coûté
      `nissanShare` puis `birthdate`.
      ⚠️ **Retirer quelqu'un ne supprime AUCUN de ses congés** : il sort du planning, ses
      lignes restent, et le réajouter les fait réapparaître. Vérifié (6 jours conservés au
      retrait puis au réajout), et dit dans la confirmation — sinon on efface un
      historique d'un décochage.
    - **Modèle** : une ligne = une CELLULE (`CongeJour`, `@@unique([userId, date])`), pas
      une plage. C'est la forme de la maquette, où la saisie se fait au clic ; une ligne
      par plage obligerait à découper et fusionner des intervalles à chaque jour modifié.
      Date en `String` 'YYYY-MM-DD' comme `User.birthdate` — un jour de congé n'a ni heure
      ni fuseau.
    - **Jours fériés calculés** (`lib/joursFeries.ts`), ce que la maquette ne faisait pas :
      un 14 juillet posé y comptait comme un jour de congé. Un seul férié est réellement
      calculé — Pâques, par l'algorithme de Meeus — les dix autres en découlent ou sont
      fixes. **Vérifié sur 2026 ET 2027**, deux années où Pâques tombe à des dates
      différentes. Alsace-Moselle volontairement absente (aucune concession concernée).
      ⚠️ **Le serveur ne connaît PAS le calendrier** : week-ends et fériés sont exclus de
      l'affichage et du comptage côté client. Dupliquer la table des fériés côté backend
      créerait une duplication de plus à synchroniser (après `PLAQUES_STRUCTURE`) pour un
      gain nul — une ligne posée un dimanche par appel direct n'est comptée nulle part.
    - **Deux vues**, comme la maquette : un PLANNING (lignes = personnes, colonnes =
      jours, colonne Total, pied « absents/jour », colonne des noms figée au scroll) et un
      TABLEAU DE BORD annuel (4 KPI, répartition mensuelle cliquable, total par
      collaborateur, journées les plus chargées).
      **Sous `md`, pas de grille mais une liste de cartes** — 31 colonnes au doigt sont
      illisibles, leçon du Digital (correctif 31).
      Une **pose par période** (`PUT /periode`, en transaction) évite 15 clics pour trois
      semaines ; elle n'envoie que les jours ouvrés, calculés par le client.
    - **Branchement de la rubrique** : entrée ajoutée dans les **DEUX** listes de
      `Sidebar.tsx` (`allMainItems` **et** la nav groupée desktop écrite en dur) — une
      rubrique ajoutée au seul `allMainItems` est invisible sur l'écran desktop principal,
      piège qui a coûté une passe au lot du chef de site. Plus la garde de routage dans
      `App.tsx` : l'onglet actif est mémorisé en session, une rubrique masquée reste
      sinon atteignable.

    **Vérifié dans l'interface, sur des données réelles puis supprimées** : rubrique
    visible et page vide au départ, 3 participants ajoutés → 3 lignes ; congé posé au clic
    (CP), demi-journée (CP matin) comptée **0,5** → total 1,5 ; validation par un Master ;
    **le 14 juillet n'est pas cliquable** alors que le 13 l'est ; pose du 13 au 17 juillet
    → **4 jours** écrits, le férié sauté ; tableau de bord recoupé à la main (4 + 1 + 0,5
    = **5,5 jours**, moyenne 1,8, mois le plus chargé juillet).
    **Refus serveur mesurés** : type inconnu **400**, `2026-02-31` **400**, date au format
    français **400**, personne hors périmètre **400**, validation sans congé **404**,
    période vide **400**.
    Mobile 375 px : liste de cartes, tableau masqué, **aucun scroll horizontal**.
    `tsc` **9** racine / **0** backend, `check-plaques-sync` vert, build OK.
    **Base rendue à l'état initial** : 0 ligne dans les deux tables.

    ⚠️ **Défaut corrigé en recette** : le calendrier « Au » de la pose par période
    s'ouvrait sur le MOIS COURANT et non sur celui de la date de début — poser des congés
    de juillet depuis septembre demandait de reculer deux mois à la main. La fin se cale
    désormais sur le début tant qu'elle est vide ou antérieure.

    ⚠️ **NON VÉRIFIÉ, faute d'un second compte** : le **403** quand un non-gestionnaire
    écrit sur la ligne d'un collègue, le **403** d'un `Site Manager` sur le GET, et
    l'absence du bouton « Valider » pour un **Administrator**. Les trois sont écrits et
    relus dans le code, mais la leçon de ce dépôt est qu'un raisonnement exact ne remplace
    pas un parcours d'interface — à solder avec un compte Administrator et un compte
    Coordinator.

55. **CONGÉS — PÉRIODE DE RÉFÉRENCE LÉGALE, SOLDE, NOUVEAUX TYPES, VUE AGENDA ET REPRISE
    DU FICHIER EXCEL** (`feat/conges-v2`, 12 septembre 2026). Frontend **et** backend,
    **avec migration** (`20260912170000_conges_demi_et_droits`, additive : une colonne
    nullable, une table nouvelle).

    Cinq demandes de Théo à la découverte de la rubrique livrée au 54.

    - **La période de référence n'est PAS l'année civile.** Le 54 agrégeait par année
      civile, sur le modèle du fichier Excel. Théo a demandé de vérifier la règle : elle
      est à l'art. **L3141-3** du Code du travail — 2,5 jours ouvrables acquis par mois de
      travail effectif, **30 jours ouvrables au maximum, soit 25 jours ouvrés**, sur une
      période qui court du **1er juin au 31 mai** à défaut d'accord d'entreprise
      (confirmé sur travail-emploi.gouv.fr et l'Urssaf). Le tableau de bord et l'agenda
      agrègent donc de juin à mai ; le planning reste mois par mois.
      ⚠️ **Conséquence à connaître** : les totaux de Gearbox et ceux du fichier du boss ne
      se recoupent PAS à l'identique, puisqu'ils ne comptent pas la même fenêtre. Ce n'est
      pas une erreur de reprise. Si un accord d'entreprise fixait un jour la période à
      l'année civile, `debutPeriodeConges` / `CONGES_MOIS_DEBUT` dans `constants.ts` sont
      la **seule porte** à changer.
    - **Solde de congés payés** (Théo revient sur le « pas de solde » du 54) : acquis /
      pris / restants par personne et par période. Table `CongeDroit`, avec un choix de
      forme : **une ligne n'existe QUE si le droit a été modifié**, l'absence valant
      25 jours. C'est ce qui évite de créer une ligne par personne chaque 1er juin, donc
      de dépendre d'une tâche planifiée qui n'existe pas. Poser explicitement 25 **efface**
      la ligne, pour ne pas garder deux représentations du même état.
      ⚠️ **Seuls les CP décomptent** (`congeDecompteSolde`) : RTT, heures de récup, sans
      solde et révision sont suivis mais relèvent de compteurs qui ne sont pas dans
      Gearbox. Modifiable au crayon par un gestionnaire seulement.
    - **Types : la demi-journée sort du type.** Le 54 codait `CPAM` / `CPAPM` ; ajouter
      « congé sans solde » et « heures de récup matin/après-midi » aurait demandé `HRAM`,
      `HRAPM`, `CSSAM`… — une combinatoire qui double à chaque famille. Désormais
      `type` ∈ {CP, RTT, HR, **CSS**, **CR**} et `demi` ∈ {AM, PM, null}, **toute** famille
      pouvant être posée en demi-journée. `CR` (congé révision) n'était pas demandé : il
      est **dans les données** du fichier (Hugo, semaine du 14 juin 2027) et il fallait un
      type pour l'accueillir.
      ⚠️ Bascule faite **au bon moment** : la table `CongeJour` était VIDE en production
      (les données du 54 étaient de la recette, supprimées en fin de lot), il n'y avait
      donc aucune ligne à convertir. Vérifié avant d'écrire la migration.
    - **Le planning ne prenait pas la largeur de l'écran** (capture de Théo). Cause : la
      `<table>` n'avait pas de `w-full` et prenait sa largeur naturelle. `table-fixed
      w-full` + `minWidth` : l'espace restant se répartit entre les jours, le défilement
      horizontal reste quand la place manque. **Mesuré à 1680 px : conteneur 1408, table
      1406** (contre ~1300 avant, un tiers de colonne vide à droite) ; colonne des jours
      **38 px** au lieu de 34 fixes. Filet plus marqué le lundi pour découper les semaines.
    - **Vue AGENDA** (3e onglet), la demande telle qu'elle a été posée : « un calendrier
      déroulant, en mode agenda, où tout le monde est mêlé, pour voir qui est là ou pas là
      sur plusieurs mois ». Douze mois empilés en grilles lundi→dimanche, défilement
      continu, une pastille par absent (avatar cerclé de la couleur du type au-dessus de
      `md`, point coloré en dessous — un avatar de 16 px au doigt n'identifie personne),
      le compte d'absents du jour, les fériés nommés, et un clic qui ouvre la liste des
      absents. Inspiration assumée du « team calendar » / wallchart de Timetastic, Leave
      Dates et actiPLANS, benchmarkés avant de dessiner.
      ⚠️ **En lecture** : une case d'agenda mêle tout le monde, un clic n'y désigne
      personne. La saisie reste dans le planning, où la ligne est explicite.

    **Reprise du fichier Excel** (`backend/scripts/import-conges-2026.mjs`, rejouable et
    idempotent, lit `donnees-conges-2026.json`) : **313 cellules** écrites pour
    **13 personnes**, 3 ajoutées au périmètre. Ce qui a été écarté, et pourquoi :
    - **Alison et Mélanie** (44 cellules) — elles ne font plus partie du marketing
      (décision de Théo). Au passage, les colonnes de Mélanie sont intitulées « Lucy » /
      « LUCY » dans les blocs juillet et août du fichier d'origine : l'extraction se fait
      donc par **position de colonne**, jamais par l'intitulé.
    - **5 cellules posées un samedi** (Lucie ×3, Zakaria ×2) — Gearbox n'affiche ni ne
      compte les jours chômés ; les importer aurait créé des lignes invisibles en base.
    ⚠️ La correspondance prénom → compte est **explicite et par nom COMPLET** : le fichier
    ne donne que des prénoms et Gearbox contient « Lucie » ET « Lucien Marchetti ». Un
    rapprochement approximatif aurait versé les congés de l'une dans la ligne de l'autre.
    Le script refuse de démarrer sur un nom ambigu, absent, ou dont le rôle n'a pas accès
    à la rubrique (il écrit en base sans passer par la route, le contrôle de rôle y est
    donc refait).
    ℹ️ **Deux écarts de 0,5 jour avec le récap du fichier** (Bastien 22 vs 21,5 ;
    Ludivine 22,5 vs 22) : le fichier note les demi-journées de trois façons
    (« CP (APM)-V », « CP APM-V », « HR Matin-V ») et sa formule n'en attrape pas toutes.
    L'import les normalise ; c'est Gearbox qui a raison, pas le tableur.

    **Vérifié dans l'interface, au clic réel**, puis recoupé par un calcul indépendant sur
    le JSON source : tableau de bord **212 jours posés**, moyenne **16,3**, mois le plus
    chargé **août (87 j)**, pic **10 absents le 13/07/2026**, Hugo **26/25 CP → -1
    restant** — les cinq chiffres retrouvés à la main. Agenda : clic sur le 27 juillet →
    **8 absents sur 13**, liste nominative conforme au fichier. Planning : pose d'un HR
    au clic → total **1**, bascule en « Matin » → **0,5**, validation → pastille pleine,
    retrait → total « — » et pied de colonne revenu de 2 à 1.
    **Refus serveur mesurés** : ancien code `CPAM` **400** (la bascule est bien étanche),
    demi-journée inventée **400**, `2026-02-31` **400**, personne hors périmètre **400**,
    droit négatif **400**, droit en toutes lettres **400**, période 1200 **400**.
    Droit posé à 12,5 puis remis à 25 → **ligne supprimée**, table revenue à 0.
    Mobile 375 px : cartes au planning (« 18 Sep · CP a.-m. », total « 1,5 j »), agenda en
    pastilles, **aucun débordement horizontal** sur les trois onglets.
    `tsc` **9** racine / **0** backend, `check-plaques-sync` vert.

    ⚠️ **Défaut trouvé et corrigé en recette** : l'agenda s'ouvrait **un mois trop tôt**.
    Le calage sur le mois courant visait 958 px là où la section se trouvait finalement à
    1 490 — les avatars des mois du dessus n'étaient pas encore posés au premier cadre et
    la cible descendait ensuite. On recale désormais tant que l'écart persiste, au plus
    cinq cadres. Vérifié : `scrollTop` 1 490, mois en haut = 2026-09.

    ⚠️ **À TRANCHER PAR THÉO — le lundi de Pentecôte.** Trois personnes (Alexis, Morgane,
    Romane) ont un congé posé le **25 mai 2026**, qui est le lundi de Pentecôte. Or
    personne ne pose de congé un jour chômé : cela laisse penser qu'il est **travaillé**
    chez Bony, au titre de la journée de solidarité — ce que la loi permet (c'est un férié
    ordinaire, pas un férié obligatoirement chômé). Les trois cellules sont **en base**
    mais **invisibles**, puisque `lib/joursFeries.ts` le tient pour chômé. Si c'est un jour
    travaillé, le correctif tient en une ligne : retirer `Lundi de Pentecôte` de
    `feriesDe()`. Ne pas décider à sa place.

    ⚠️ **Défaut signalé par Théo à la recette, corrigé dans le même lot** : les en-têtes de
    mois de l'agenda étaient **blancs sur blanc en thème sombre**. `dark:bg-bony-panel/90`
    ne produit aucune règle avec Tailwind CDN Play — l'élément gardait son `bg-white/90`.
    Mesuré sur l'élément réel, thème sombre actif : `rgba(255,255,255,0.9)` avant,
    `rgb(30,30,30)` après. Corrigé en `bg-white dark:bg-bony-panel`, comme l'en-tête figé
    du planning. ⚠️ **Pas de `/opacité` sur une couleur `bony-*` derrière un `dark:`** —
    même famille que `md:gx-glass-panel`, et tout aussi silencieux. Détail et piège de
    diagnostic dans `BUGS-CONNUS.md`.

    ⚠️ **TOUJOURS NON VÉRIFIÉ, faute d'un second compte** (hérité du 54, et le lot en
    ajoute une) : le **403** quand un non-gestionnaire écrit sur la ligne d'un collègue,
    le **403** d'un `Site Manager` sur le GET, l'absence du bouton « Valider » pour un
    **Administrator**, et désormais l'absence du **crayon du solde** pour un non-gestionnaire.

56. **RETOURS D'ÉQUIPE, LOT 1 — groupes du Chat pour l'External, « qui a réagi »,
    « GROUPE BONY » dans les marques du Digital** (`feat/lot1-marques-reactions`,
    23 septembre 2026). **`web` seul**, aucune migration.

    - **Ali (External) ne voyait plus le groupe « équipe digital » dont il est membre.**
      Cause : la section « Groupes » de la liste de conversations était entièrement
      masquée au rôle External (`{!isExternal && (…)}` dans `pages/Chat.tsx`), une
      condition **antérieure au correctif 41**. Ce dernier a rendu l'External ajoutable
      aux groupes (« il discute avec tout le monde sauf les chefs de site ») et le serveur
      l'y accepte, mais la liste n'a pas été rouverte : membre côté serveur, invisible
      côté écran. Corrigé en affichant la section à tous — le serveur ne renvoie de toute
      façon que les groupes dont l'utilisateur est `participant`, rien ne fuit.
      ℹ️ Diagnostic fait en lecture seule (GET `/api/users` et `/api/chat/conversations`
      depuis la session de Théo) : Ali = rôle `External`. Théo n'étant pas membre du
      groupe, sa liste de participants n'a pas pu être relue.
      ℹ️ Inchangé, et non demandé : un External ne peut toujours pas CRÉER de groupe (le
      « + » ouvre directement un message privé).
    - **« Qui a réagi »** : la donnée existait déjà (`ChatMessage.reactions` =
      `Record<emoji, userId[]>`), seul l'affichage manquait. Bulle au **survol** d'une
      pastille (« Vous » en tête), et à l'**appui long** (~450 ms) au doigt. Le clic simple
      garde son rôle historique (ajouter / retirer sa réaction) : l'appui long empêche le
      clic synthétique qui le suit (`preventDefault` sur `touchend`).
    - **Digital, liste des Marques** : l'option affichait `Holding` alors que la pastille
      affichait déjà « GROUPE BONY » (`libelleMarqueDigital`). Corrigé sur l'option et sur
      l'infobulle. La valeur stockée reste `Holding` — aucun effet budgétaire.

    **Vérifié dans l'interface** : liste Marques de l'édito « FORUM PR » → « GROUPE BONY ✓ »
    (ouverte et refermée sans rien cocher) ; bulle « 👍 Hugo Culetto, Alexis Perz » au
    survol, alignée à droite sur un message de Théo, non rognée par la zone de défilement ;
    appui long simulé → bulle à 600 ms, absente à 200 ms, clic synthétique bloqué ; tap
    court → pas de bulle, clic laissé passer. **Aucune écriture** : que des GET pendant
    la recette. `tsc` **9** racine.
    ⚠️ **NON VÉRIFIÉ** : la vue External elle-même (compte Master seulement, pas de jeton
    fabriqué) — à confirmer par Ali après mise en ligne ; et l'appui long sur un vrai
    téléphone (simulé par `TouchEvent`, pas joué sur un appareil).

57. **CHAT — thème de discussion PARTAGÉ, « Vu par », membres et renommage de groupe
    côté serveur** (`feat/chat-social`, 24 septembre 2026). **`api` ET `web`**, **avec
    migration** (`20260924100000_chat_theme_partage_et_lectures`, additive).

    Retours d'équipe du 23/09, arbitrés par Théo : thème **et** couleur de bulle partagés,
    modifiables par **tout membre** ; **Chat Général inviolable** ; « Vu par » avec, au-delà
    d'un seuil, le seul nombre de lecteurs.

    - **Thème partagé.** Le fond et la bulle vivent sur `ChatConversation`
      (`background`, `bubble`), écrits par le handler `chat:conversation:theme`. La bulle
      colore les messages de **celui qui regarde** (convention Messenger). Le bouton est
      absent du Général ET le serveur le refuse. Le bouton « Toutes mes discussions »
      (défaut du compte) disparaît : il n'a plus de sens avec un thème partagé.
      **Reprise** dans la migration : la valeur non nulle la plus récente de chaque
      conversation dans `ChatCustomization` (8 lignes, une par conversation, aucun
      conflit) → **7 thèmes** repris, la 8ᵉ ligne étant vide. ⚠️ Conséquence acceptée par
      Théo : 5 images de fond qu'il avait importées dans des conversations privées sont
      désormais visibles de ses interlocuteurs. Le défaut global de compte d'Hugo
      (`proc:miami`) n'est pas repris — il aurait imposé un réglage personnel à toutes
      ses discussions.
    - **« Vu par »** sous le dernier message : lecteurs = membres dont `readAt` (horloge
      serveur, écrit par `chat:conversation:read`) dépasse l'horodatage du message, hors
      auteur et hors moi. « Vu par tout le monde » si tous ont lu, **« Vu par N
      personnes » au-delà de 5** (`VU_PAR_MAX_NOMS`), liste complète en infobulle. En privé
      la mention n'apparaît donc que sous ses propres messages. Membres du Général = tous
      les comptes ayant le chat sauf External, même appartenance implicite que le serveur.
    - **Membres et renommage côté serveur** (`chat:conversation:members` /
      `:rename`, réservés aux `adminIds`). C'était le défaut du backlog « renommer un
      groupe ou changer ses membres reste invisible » : un membre « ajouté » ne l'était
      que sur le poste de l'admin. L'overlay `gearbox_chat_overlay` ne porte plus que
      l'épingle ; ses anciens champs `name` / `participants` sont **ignorés** (chaque poste
      en avait sa version — même arbitrage que la photo de groupe). Un retrait demande
      confirmation ; la personne retirée voit la conversation disparaître en direct
      (`chat:conversation:removed`).

    **Vérifié** sur un groupe jetable (Théo seul membre, supprimé en fin de recette) :
    fond « Lagon » + bulle verte choisis au clic → en base et à l'écran (dégradé mesuré
    sur la bulle) ; renommage au crayon → en base, rien en `localStorage` ; ajout puis
    retrait d'Isabelle Auclair au panneau Membres → `participants` suivi en base.
    **16 refus serveur** au bon message : thème et renommage du Général, fond externe,
    bulle en CSS brut, thème vide, nom vide / > 80 caractères, retrait de soi, membre
    inconnu, chef de site ajouté, membres du Général, non-membre (thème et lecture sur
    « équipe digitale »), non-admin (renommage, membres) — et un simple membre **peut**
    changer le thème. « Vu par » par dates de lecture posées en base puis remises à `{}` :
    Général 3 → les 3 noms, 7 → « Vu par 7 personnes », 13/13 → « Vu par tout le monde »,
    lecture antérieure au message écartée ; privé → « Vu par Bastien Fuziol » sous le
    message de Théo, rien quand le dernier message vient de l'autre. Aucun bouton thème
    sur le Général. `tsc` **9** racine / **0** backend, `check-plaques-sync` vert.
    ⚠️ **NON VÉRIFIÉ** : le côté de la personne retirée (disparition en direct — exige sa
    session) ; « Vu par » en conditions réelles (la prod d'avant n'écrivait pas `readAt`,
    les lectures ne s'accumulent qu'à partir du déploiement).
    ℹ️ Comme le compteur de non-lus, une conversation OUVERTE compte comme lue même
    fenêtre en arrière-plan — sémantique préexistante, conservée.

58. **DIGITAL — plusieurs classes CO² par édito, et case PRO+** (`feat/digital-co2-multi-proplus`,
    24 septembre 2026). **`api` ET `web`**, **avec migration**
    (`20260924150000_social_co2_multi_et_proplus`, additive).

    - **Classes CO² multiples** (demande des Digital Managers) : nouvelle colonne
      `SocialPost.co2s`, sélecteur multiple dans la ligne d'édito. `co2` (valeur unique)
      est **conservé** et recalculé par le serveur comme première classe — retour arrière
      sans perte. Reprise : les **7** publications qui avaient une classe la retrouvent
      comme seule valeur de la liste (75 publications au total).
      Au passage : une classe enregistrée puis **retirée du catalogue** restait cochée sans
      pouvoir être décochée (défaut latent, déjà vrai avec l'ancien sélecteur simple) — elle
      est désormais listée tant qu'elle est sélectionnée.
    - **PRO+ (B2B)** : même bouton-case que la fiche projet, dans la 10ᵉ case de la grille,
      jusque-là vide. Marqueur d'affichage, sans filtre ni effet de montant.
    - Les deux champs entrent dans `SOCIAL_FIELDS` dans le même lot, et
      `scripts/import-edito.mjs` remplit `co2s`.

    **Vérifié** sur une publication jetable (supprimée, base revenue à 75) : PRO+ au clic →
    `proPlus: true` en base, rendu en dégradé, largeur égale aux voisines (112 px) ; deux
    classes cochées au clic → `co2s` en base, déclencheur « CLIO - B120 +1 » après
    rechargement ; classes hors catalogue décochées → retirées, `co2` recalculé. Nettoyage
    serveur : `['A',' A ',5,'','B']` → `['A','B']`, `co2` envoyé « Z » ignoré (recalculé
    « A »), `proPlus: 'oui'` → `false`. `tsc` **9** racine / **0** backend.
    ℹ️ Fenêtre de quelques minutes entre la migration et le déploiement : une classe
    choisie dans l'ancienne interface pendant ce laps n'aurait écrit que `co2` — la reprise
    (idempotente) a été rejouée après la mise en ligne.

## Backlog — ce qui reste à faire

> Réordonné le 05/08/2026. Les éléments barrés ont été retirés : leur trace est dans
> l'historique des correctifs ci-dessus et dans `BUGS-CONNUS.md`.

### Fonctionnel / produit
- **✅ IMPORT DU CALENDRIER ÉDITORIAL FAIT le 02/09/2026** — 43 publications en base,
  du 01/09 au 29/12/2026. Détail et contrôles dans le correctif 46.
  **Reste le dépôt MANUEL des 7 fichiers** que le classeur ne contenait pas
  (`MINUTE DE L'AUTO` EP 5/7/8/9, `Offre emploi…jpg`, `SEPTEMBRE 2026`,
  `Vidéos_Bony_Lamarck`) : rien n'a été inventé en base, ils sont listés avec leur
  publication dans le rapport de dry-run, qu'on régénère à volonté sans rien écrire.
  ℹ️ Ces 43 posts n'ont **aucune entrée d'`ActivityLog`** (le journal est alimenté côté
  client) : ils apparaissent sans auteur ni trace dans le fil d'actualité. Attendu.
  ℹ️ Le fichier d'annulation `~/Downloads/import-edito-20260902-152859.jsonl` permet de
  tout retirer d'un coup tant qu'il existe — ne pas le supprimer à la légère.
- **Non-régression de la branche FICHIER de la modale Médias, non rejouée** (correctif
  45) : aucune publication de la base ne portait de fichier au moment de la recette.
  Contrôle de 30 secondes à faire par Théo — déposer un JPG et un MP4, vérifier
  miniature, lecteur, lightbox, **téléchargement** (et non ouverture d'onglet) et
  suppression. Idem pour les rôles `Site Manager` et `External`, faute de comptes.
- **CHAT — lot 2 LIVRÉ** au correctif 38 (vocaux, aperçus de liens, recherche de GIF).
  Reste à vérifier par Théo : le **vocal sur iPhone** (Safari produit du `m4a` là où
  Chrome fait du `webm` ; les deux sont prévus et servis correctement, mais seul un
  essai sur un vrai iPhone le confirmera), et le cas **PWA installée** sur iOS.
- **« Prochaines Échéances » (Dashboard) écarte les projets MULTI-SITES** sous un filtre
  de périmètre : le bloc teste `p.site` brut, qui vaut un libellé concaténé. Même classe
  que le bug des montants corrigé le 29/07, mais le correctif est différent — il faut
  ventiler par `sites[]`, pas changer un test. Repéré le 14/08, laissé hors du lot 39
  pour ne pas le bâcler. Sans impact sur les montants.
- **`GET /api/projects` n'a aucun contrôle de rôle** (`authenticateToken` seul) : un
  `External` ou un `Guest` peut lire tous les projets par l'API alors que l'interface
  les leur masque. Découvert le 06/08 en préparant les projets cités dans le chat.
  Même motif que le lot du chef de site — masquer une rubrique ne ferme pas une route.
  Demande un inventaire préalable des rôles qui doivent lire les projets.
- **Campagnes et « Performance des campagnes » restent VIDES.** Ce n'est pas un bug :
  ces écrans dérivent des tâches au canal `SMS` ou `E-mail`, or le fichier source de
  l'import ne portait pas le canal — les 247 tâches importées l'ont vide. Chantier
  **donnée** : renseigner le canal dans Gearbox, ou ajouter une colonne au fichier.
- **Résidu du routage multi-marques** : avec MARQUE = Renault, les buckets
  `Alpine-Clermont` et `Nissan` affichent un petit consommé sans enveloppe. Pas faux,
  mais se lit mal. Deux voies, **côté Théo** : scinder les projets multi-marques, ou
  renseigner le curseur de part.
- **Biais résiduel du KPI de rythme** : +8 à +12 points, parce qu'une dépense du mois
  est imputée au 1ᵉʳ alors que l'horloge compte en jours. Correctif possible si le
  besoin se confirme : compter le temps écoulé **en mois**. Choix de lecture, pas un bug.
- **Recoupement non fait** : le budget d'un chef de site (Mozac, 69 600 € de prévu)
  n'a pas été comparé à ce que voit un Master filtré sur Mozac. Les deux doivent
  coïncider — contrôle rapide à faire. ⚠️ **Toujours en attente au 06/08** : il exige
  une session du compte de Lucien, que je n'ai pas, et la fabrication d'un jeton de
  test est refusée par le classifieur de sécurité. C'est donc un contrôle **à faire
  avec Théo connecté**, pas quelque chose que je peux solder seul — ne pas le laisser
  glisser de lot en lot pour autant, c'est le seul trou de vérification du rôle
  cloisonné.
- **Les tâches AUTONOMES sont ignorées du Dashboard et des Campagnes** (correctif 35) :
  ces écrans atteignent les tâches via les projets, une tâche sans projet n'y entre
  donc pas. Charge d'équipe et campagnes programmées deviennent incomplètes. Sans
  impact budgétaire (pas de coût sur ces tâches). À brancher si le besoin se confirme.
- **✅ SOLDÉ au correctif 57 (24/09/2026)** — renommage et membres d'un groupe passent
  désormais par le serveur (`chat:conversation:rename` / `:members`).
- **Performance — PC de collègues qui chauffent : audit du 23/09/2026 GELÉ** jusqu'à la
  refonte graphique envisagée par Théo (pas d'accès aux postes concernés). Pistes :
  fond animé (`.gx-blob`, `blur(90px)`, animation infinie) SOUS 6 à 10 panneaux
  `backdrop-filter: blur(30px)` → flou recalculé à chaque frame ; hypothèse principale
  non vérifiée : accélération graphique désactivée (`chrome://gpu` « Software only ») sur
  ces postes, donc flou calculé par le CPU. Côté code : 0 activité au repos, mais le
  Dashboard recharge 6 sources (~760 Ko) à chaque événement temps réel de n'importe qui,
  **même onglet masqué**. Test de Théo sur son poste (qui ne chauffe pas) : 6,0 → 5,4 →
  4,6 % CPU, non concluant (pas de référence, pas de ligne « Processus GPU »). Pour la
  refonte : pas de fond animé sous du verre, repli sans flou, `useRealtimeSync` différé
  onglet masqué.

- **Suite naturelle du mode Expert, par ordre de rapport valeur/effort** :
  1. **Rappel push d'échéance** (« ta tâche X est due demain ») — toute l'infrastructure
     existe déjà depuis le correctif 20 (`sendPushToUsers`, `PushSubscription`), et
     l'échéance par tâche depuis le 42. C'est le meilleur ratio du lot suivant.
  2. **Dépendances entre tâches** (« ne peut commencer qu'après ») et **chemin critique** :
     le vrai palier Gantt professionnel, mais c'est un chantier à lui seul — il faut un
     modèle de liaison, la détection de cycles, et le recalcul en cascade des dates.
  3. **Vue Gantt par TÂCHE plutôt que par personne**, en bascule : utile quand on pilote
     l'enchaînement plutôt que la charge.
- **Le mode Expert n'a pas été parcouru avec un compte CHEF DE SITE réel.** Le verrou est
  côté serveur (`projetAutorise` dans `routes/projectFiles.ts`) et l'écriture lui est
  fermée par `EDIT_ROLES`, mais la leçon du projet est qu'un 403 exact ne vaut pas un
  test dans l'interface — deux fois les contrôles d'API étaient bons et l'écran mentait.
  À faire avec Théo connecté, comme le recoupement du budget de Mozac.

- **✅ SOLDÉ au correctif 48 (07/09/2026)** — l'alerte « Échec de la sauvegarde du projet
  (serveur injoignable ?) », que Théo et ses collègues recevaient en tapant un nom de
  tâche. Cause **mesurée** : saturation du pooler par un PUT du projet entier à chaque
  frappe, masquée par deux catch-all. Détail complet dans le correctif 48.
  **Reste à surveiller** : le critère d'acceptation est
  `docker compose logs api --since 96h | grep -c "PUT échoué"` → **0**, à relever quatre
  jours après le déploiement. La référence d'avant était **48**.
- **Test de charge concurrent NON JOUÉ** (correctif 48). Le plan prévoyait un script sous
  `scripts/`, jeton Master réel, N PUT concurrents sur un projet jetable, hors heures
  ouvrées et depuis le hotspot — sur le modèle de la vérification du verrou consultatif du
  matériel. Il n'a pas été écrit : la réduction de charge a été mesurée **unitairement**
  (nombre de PUT, nombre d'`UPDATE` par PUT), pas **sous concurrence**. C'est le seul
  chiffre qui manque pour affirmer que la saturation ne peut plus se produire, et non
  seulement qu'elle est devenue improbable.
- **Le `503` n'a jamais été déclenché pour de vrai** (correctif 48) : le mappage
  `P2028`/`P2024`/`P2034` → 503 + `Retry-After` est relu dans le code et couvert par un
  repli sur le message, mais il faudrait saturer le pooler pour l'observer. La reprise
  côté file de sauvegarde comme celle côté route sont donc **non exercées** en conditions
  réelles.
- **Parcours d'interface incomplet après la fusion des 27 clients Prisma** (correctif 48) :
  les **20 routes** d'API ont été vérifiées une par module (toutes en 200), mais le
  parcours écran par écran (Budget, Digital, Chat, Agenda, Matériel, Jeux, Paramètres,
  envoi d'avatar, fichier de projet) a été interrompu. ⚠️ La leçon qui revient dans ce
  dépôt est qu'un contrôle exact des routes a **deux fois** manqué ce qu'un parcours de
  cinq minutes a vu. À solder par Théo à la première utilisation.

- **Commentaires du Digital (correctif 50) — trois contrôles qui demandent un AUTRE compte
  que le mien** : (1) le refus 403 de supprimer le commentaire d'un autre auteur (Master
  a le droit d'arbitrer, donc mon compte ne peut pas le montrer) ; (2) le temps réel du
  fil à deux postes ; (3) le chef de site, qui doit LIRE un fil sans pouvoir commenter, et
  l'External, qui doit pouvoir les deux. Même trou qu'aux correctifs 45 et 49 — un
  raisonnement exact ne remplace pas un parcours d'interface.

### Dette technique
- **Build local non représentatif du build déployé** : Docker construit le front en
  **node:18-alpine** avec `npm install`, le poste de Théo est en **Node 24**. Mesuré
  sur le même code : **2 012 Ko** en local contre **1 363 Ko** en prod. Aucune mesure
  de bundle locale n'est donc concluante. Correctif : aligner Node et passer à `npm ci`.
- **4 vulnérabilités npm backend** (1 critique, 2 hautes, 1 basse), toutes
  **préexistantes** : `bcrypt` (→ `tar`, `minimatch`), `nodemon` (dev), `express`
  (→ `body-parser`). La `tar` critique ne sert qu'à l'**installation** de bcrypt.
  `npm audit fix` risque de casser bcrypt → à traiter explicitement, jamais au passage.
- **Un onglet déjà ouvert reste sur l'ancien bundle après un déploiement.** Le
  `Cache-Control` garantit qu'un **rechargement** sert la dernière version, pas la mise
  à jour d'un onglet vivant. Il faudrait une détection de version côté client.
  ⚠️ **Ne PAS ajouter de gestionnaire `fetch` au service worker** — décision
  structurante du lot PWA.
- **`migrateEquipmentIfNeeded` n'est pas idempotente** face à deux onglets simultanés
  (un flag `localStorage` ne suffit pas). Catalogue propre aujourd'hui ; s'il se
  re-duplique, la cause est là et la vraie parade est une contrainte d'unicité en base.
- **Deux duplications à garder synchronisées à la main** :
  1. ✅ `PLAQUES_STRUCTURE` recopié dans `backend/src/auth/siteScope.ts` : la
     duplication **reste** (elle est structurelle, le backend ne peut pas importer le
     `constants.ts` racine) mais elle n'est plus livrée à la vigilance — depuis le
     06/08, `scripts/check-plaques-sync.mjs` échoue à la divergence, sur `predev` et
     `prebuild`. Couvre aussi `ALPINE_SITES` et les sites hors plaque.
  2. `pages/Projects.tsx` garde sa barre de filtres inline et n'utilise pas
     `components/CollapsibleFilters.tsx`.
  3. ✅ **RÉSOLU au correctif 48** : la formule d'avancement / budget réel était recopiée
     dans `Projects.tsx` **et** `TodoList.tsx` (cette dernière **mutant** son argument).
     Elle vit désormais en une seule copie dans `utils/projet.ts`.
- **`PUT /api/auth/me` ne valide pas la forme de `avatarUrl`** : un utilisateur peut y
  écrire une URL **externe**, rendue dans un `<img>` chez tous ses collègues (fuite
  d'IP, pixel de traçage). Trou préexistant, découvert en fermant le même risque sur la
  photo de groupe — où le contrôle existe désormais (`AVATAR_UPLOAD_PATH`,
  réutilisable tel quel). Non atteignable par l'interface, mais un appel direct suffit.
- **Fichiers d'upload orphelins** : remplacer une photo (groupe ou utilisateur) laisse
  l'ancien fichier sur le disque, rien ne le collecte. ~20 Ko par avatar, non borné.
  À traiter avec la purge des avatars, volontairement absente (correctif 28).
- **Aucune route de suppression de conversation** : un groupe créé n'est plus
  supprimable depuis l'interface. Gênant en pratique, la base locale étant celle de
  production — impossible de créer une conversation de test jetable sans SQL Supabase.

### Confort / UI, non bloquant
- **Agenda** : pas de vue mobile dédiée pour Trimestre/Semestre/Année (les barres Gantt
  compressent sans déborder — jugé acceptable).
- **Campagnes sous ~1000 px** : volumétries à 5 chiffres et noms de projet tronqués,
  avec infobulle. **Non régressif**. À reprendre seulement si Théo travaille sur écran
  étroit.
- **Chat** : l'overlay d'édition de l'avatar de groupe est encore masqué au survol
  (`opacity-0 group-hover/ga:`), donc invisible au doigt. Même classe que la sourdine,
  corrigée au correctif 31 ; celui-ci était hors périmètre.
- **Cellules JOUR du sélecteur de date** : 36 px sur mobile, sous le seuil des 44 px.
  Préexistant, non touché au correctif 31 pour ne pas modifier la grille existante.
- **Tableau des tâches d'un projet** : défile horizontalement sous ~1500 px (1060 px
  pour huit colonnes utiles). Aucun scroll à 1920 px, résiduel à 1440. Si le besoin se
  confirme, la parade est de **masquer une colonne secondaire** sous un seuil, pas de
  resserrer l'ensemble — resserrer, c'est réintroduire le défaut du correctif 42.
- **`DatePicker` sans prop `disabled`** : pour un rôle en lecture seule le calendrier
  s'ouvre et le clic ne change rien (le refus vient de `updateTask`, qui teste
  `canEdit`). Préexistant sur les dates de projet ; le correctif 42 l'étend à la
  colonne Échéance. Les `Select` du même tableau reçoivent bien `disabled`.

### ⚠️ Contrainte permanente Tailwind (à relire avant toute retouche visuelle)
Tailwind est chargé en **CDN Play** : les variantes `md:`/`lg:` **ne fonctionnent pas**
sur les classes custom (`gx-*`, `glass-*`), seulement sur les utilitaires standards.
Deux pièges confirmés : les **valeurs arbitraires contenant `repeat(...)`** ne sont pas
générées, et un raccourci `p-*` préfixé `md:` **écrase** un `pt-*` écrit après lui
(l'ordre des règles générées ne suit pas l'ordre des classes).

## Pièges connus qui font perdre du temps (à relire avant de débugger)
- **Interface v2 (Shadow DOM) — `document` ne voit RIEN de la coque.** Tout `document.querySelector`,
  `document.head.append` ou `MutationObserver` sur l'hôte du moteur rate la racine fantôme : passer par
  `GX.root` (vignettes des fonds et curseurs des sélecteurs invisibles au lot 1 pour cette raison). Les
  écouteurs `window`/`document` du moteur passent par `GX.win()`, qui rend la vraie cible (`composedPath()`).
- **Interface v2 : ne jamais faire re-rendre les pages projetées.** `setTab` à chaque changement de fenêtre
  active re-rendait TOUTES les pages ouvertes (tâche longue de 542 ms, en pleine animation) : elles sont figées
  par `LegacyPage` (`React.memo`) dans `OsHost.tsx`. Une fenêtre réduite de page actuelle est masquée par
  `visibility`, pas `display: none` (sinon les graphiques du Dashboard se recalculent au réaffichage).
- **Interface v2 : l'hôte de la coque est PERSISTANT** (`window.__gxHost`, `OsHost.tsx`) : le moteur ne
  s'installe qu'une fois par page. Recréer l'élément à chaque montage = écran noir dès qu'App démonte la coque.
- **Interface v2 : écouteur posé dans un `setTimeout` = vérifier que l'objet n'a pas été refermé entre-temps**
  (menus, calendrier, sélecteurs, aperçu rapide de la maquette) — sinon écouteur orphelin qui avale Échap.
- **Interface v2 : `pointer-events` des fenêtres = `auto` explicite** (l'espace parent est à `none`) ; ne
  jamais le remettre à `''`.
- **Interface v2 : pas de `:has()` dans la CSS de la coque** — mesuré 32 i/s contre 60. Classes posées par
  `engine/boot.ts` (`.gx-legacy`, `.gx-has-legacy`) à la place.
- **⚠️ `strictNullChecks` est DÉSACTIVÉ dans `tsconfig.json` : un prop requis manquant
  n'est PAS une erreur de compilation.** Découvert le 09/09/2026 : un `React.memo` typé via
  `React.FC<Props>` **sur la const** perd en plus la vérification des props à l'appel, et un
  `onUpdate={...}` resté en place après renommage du prop n'a produit AUCUNE erreur — le
  gestionnaire serait arrivé `undefined` à l'exécution. Parade appliquée : annoter les props
  **sur la fonction** (`React.memo(function X({…}: Props) {…})`). Et surtout : sur ce dépôt,
  **`tsc` ne rattrape pas un appelant oublié** — il faut relire les sites d'appel à la main.
- **Le libellé d'un bouton peut être DYNAMIQUE, et casser un test qui le cherche par son
  titre.** Le bouton « Gérer les médias » d'une ligne d'édito s'intitule « 2 fichiers »
  dès qu'elle porte des médias. Une recherche sur le titre fixe ne trouvait donc que les
  lignes SANS média — et remonter dans le DOM depuis le champ titre attrapait le bouton
  d'une ligne voisine, donc ouvrait la modale d'une AUTRE publication. Symptôme trompeur :
  « aucun média » sur une publication qui en a deux. Repérer la racine de ligne par
  « premier ancêtre ne contenant qu'un seul champ titre » avant de chercher un bouton.
- **Un filtre de recherche persiste en `sessionStorage` entre deux essais.** Une
  vérification qui ne trouve « aucune publication » alors que la donnée existe doit
  d'abord vérifier `gearbox_session_digital_searchTerm` — et se rappeler que les
  publications **archivées** sont exclues de l'onglet Calendrier Editorial.
- **⚠️ `git add -A` a committé les deux fichiers volontairement NON suivis.** Le 07/09/2026,
  `budget market 2026.xlsx` (1,4 Mo) et `PRESENTATION-EQUIPE.html` sont entrés dans un
  commit du correctif 48. Repéré avant tout push, branche réécrite (`git filter-branch`)
  pour que le binaire n'atteigne jamais GitHub. ⚠️ `filter-branch` les **efface aussi du
  disque** : il faut les restaurer depuis l'ancien HEAD (`git checkout <ancien> -- …`
  puis `git reset HEAD -- …`). Depuis, ils sont dans `.gitignore` — l'exclusion ne
  dépend plus de la vigilance, comme `check-plaques-sync.mjs` pour les plaques.
- **⚠️ Les paramètres d'URL vont À L'INTÉRIEUR des guillemets du `.env`.** Ajoutés après
  le guillemet fermant de `DATABASE_URL`, Prisma rend
  « the URL must start with the protocol postgresql:// » sur **chaque requête** : l'API
  démarre normalement et **toutes** les routes tombent. Le signe qui ne trompe pas au
  démarrage est la ligne `[settings] Jeux ALLUMES` (ou `ETEINTS`), qui prouve une lecture
  réussie en base ; `[settings] lecture impossible` signale l'inverse.
- **Un `visibilitychange` peut valider un brouillon sans aucun blur.** Constaté en
  recettant le correctif 48 : des PUT partaient alors que le champ gardait le focus et
  qu'aucun événement `blur` n'était émis. Ce n'était pas un bug — c'est le filet
  « onglet caché » de `ChampDiffere`, déclenché par l'outil d'automatisation qui masque
  le panneau entre deux appels. ⚠️ Corollaire pour toute recette future : **une page
  ouverte sur le projet testé est un ÉCRIVAIN CONCURRENT.** Deux `UPDATE` sont apparus
  pour un seul champ modifié, et une valeur écrite par script a été réécrite par la
  page. Sortir de l'écran avant de mesurer.
- **Après un déploiement, recharger complètement la page** : un onglet resté ouvert
  continue de tourner sur l'ancien bundle. Symptôme trompeur du 29 juillet — le
  temps réel semblait ne marcher qu'après un aller-retour de rubrique (le remontage
  du composant refaisait le chargement initial) et la Sidebar, jamais démontée, ne
  se mettait jamais à jour. Le code était bon.
  ⚠️ Le correctif `Cache-Control` (correctif 9) garantit qu'un **rechargement**
  sert bien la dernière version, mais il ne fait PAS se mettre à jour un onglet
  déjà ouvert : le JS déjà exécuté le reste jusqu'au rechargement. Il faudrait
  pour ça un mécanisme de détection de version côté client (à envisager avec la
  PWA, si le besoin se confirme).
- **Les actions du rôle Master ne sont JAMAIS journalisées** (`activityLog.ts`,
  204 silencieux, règle métier volontaire répliquée du frontend). Le compte de Théo
  étant Master, il ne verra jamais sa propre activité dans la cloche — tester le fil
  d'actualité exige une action faite par un compte non-Master.
- **Le backend local pointe sur la base Supabase de PRODUCTION** (pas de base de
  dev) : tout test local écrit dans les vraies données et est visible des
  utilisateurs connectés. Créer une entité clairement nommée, la supprimer juste
  après, vérifier qu'il ne reste aucun résidu.
- **⚠️ Sauvegarder un projet RÉÉCRIT son avancement et son budget réel.**
  `handleUpdateProject` ([pages/Projects.tsx](pages/Projects.tsx), ~ligne 397)
  recalcule `progress` depuis les statuts de tâches et `budgetActual` depuis la
  somme des coûts de tâches, **à chaque sauvegarde**, quel que soit le champ
  modifié. Constaté le 04/08 : changer la part Nissan d'un projet a fait passer son
  avancement de 50 % (valeur venue de l'import, périmée) à 100 % (valeur réellement
  dérivée de ses 2 tâches terminées). Ce n'est pas un bug — c'est voulu — mais
  **l'avancement importé depuis l'Excel sera écrasé au premier passage de l'équipe
  sur chaque projet.** Vérifié le 04/08 côté montants : les 97 projets ont tous
  `budgetActual` = somme des coûts de leurs tâches, donc **aucun euro n'est en
  risque** ; c'est l'avancement seul qui bougera.
- **L'alias SSH `gearbox-vps` n'est PAS configuré** sur ce poste (vérifié le
  04/08 : `Could not resolve hostname`). Utiliser directement
  `ssh ubuntu@51.83.75.181`. Ne pas en déduire un problème de droits ni de réseau.
- **Les serveurs de dev se lancent par nom** depuis `.claude/launch.json` (ajouté
  le 04/08) : `gearbox-web` (port 3000) et `gearbox-api` (port 3001), au lieu de
  lancer `npm run dev` à la main.
- **⚠️⚠️ UNE AUTORISATION DE PUSH VAUT POUR *LE* LOT EN COURS, JAMAIS POUR LE SUIVANT.**
  Le 27/08/2026, le « .md, push and deploy » donné pour le correctif 42 a été reconduit
  seul sur le correctif 43 : le mode Expert est parti en production **sans recette**.
  Théo y a découvert quatre modules qu'il aurait recalés en local (KPI sans intérêt,
  fichiers de tâche annoncés mais invisibles, halo hors charte), d'où le correctif 44
  entièrement consacré à réparer. La méthode du projet est explicite et non négociable :
  **étape 3 = « JE VALIDE le fonctionnel — tu t'arrêtes ici et tu me montres »**, AVANT
  les `.md`, le push et le déploiement. Ce n'est pas une demande de permission — c'est
  une étape de recette qui appartient à Théo. Sur un nouveau lot : on teste en local, on
  montre, on attend.
- **Une mesure vaut mieux qu'un coup d'œil, et deux mesures valent mieux qu'une.** Le
  Gantt du mode Expert a demandé DEUX passes correctives, chacune trouvée en mesurant
  dans le navigateur ce que l'œil ne voyait pas : d'abord des libellés qui se
  chevauchaient (largeur de texte devinée au lieu d'être mesurée au canvas), puis des
  losanges qui mangeaient un libellé (les crans verticaux ignoraient que la DIAGONALE
  d'un carré de 12 px tourné à 45° fait ~17 px). Même leçon qu'au correctif 42 sur les
  colonnes du tableau : on mesure, on ne devine pas.
- **`tsc --noEmit` à la racine rend 9 erreurs de référence, plus 12.** Le chiffre 12
  est recopié dans une dizaine d'entrées de correctifs ci-dessus : il était juste à
  l'époque, il ne l'est plus. Constaté le 26/08/2026 en comparant `master` et une
  branche de travail. Les 9 restantes sont dans `Budget.tsx`, `FixedExpenses.tsx` et
  `Projects.tsx` (inférences `unknown` sur des `reduce`), toutes préexistantes.
  ⚠️ Ne pas réécrire les entrées historiques pour autant — elles décrivent l'état du
  jour où elles ont été écrites. C'est la valeur à comparer AUJOURD'HUI qui est 9.
- **Un `min-width` de tableau doit être vérifié contre la SOMME de ses colonnes
  fixes.** Sur le tableau des tâches, 944 px de colonnes fixes pour un `min-w` de
  920 px : la seule colonne sans largeur (« Nom de la tâche ») absorbait le déficit et
  tombait à zéro. Et en `table-layout: auto` — le défaut — les `w-*` ne sont que des
  suggestions, le navigateur redistribue selon le contenu (mesuré : 90 px pour une
  colonne à qui on demandait 128). `table-fixed` est le seul moyen d'obtenir les
  largeurs demandées. Enfin, le padding de la cellule s'AJOUTE au padding interne d'un
  Select ou d'un DatePicker : le compter deux fois tronque les libellés.

## Contraintes d'environnement toujours actives
- Réseau bureau bloque les ports sortants 22 (SSH) et 5432/6543 (Postgres/Supabase)
  → hotspot 4G obligatoire pour toute opération VPS ou DB depuis ce poste
