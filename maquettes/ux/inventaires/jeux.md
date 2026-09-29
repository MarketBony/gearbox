# Inventaire fonctionnel — Jeux

Source : `pages/Games.tsx` (573 l.), `components/games/{Morpion,Connect4,Battleship,gameTypes}.ts(x)`, `components/GamesToggle.tsx`, `services/appSettings.ts`, `constants.ts:605-667`, `backend/src/routes/games.ts`, `backend/src/routes/settings.ts`, `backend/src/settings/appSettings.ts`, `backend/src/auth/roles.ts`.
Titre : « Jeux » ; sous-titre : « Défiez un collègue — il reçoit l'invitation instantanément, où qu'il soit. » (`Games.tsx:398-402`).

## 1. Accès et rôles

- [ ] **Deux conditions cumulatives** : interrupteur `gamesEnabled` allumé ET rôle dans `GAMES_ALLOWED_ROLES` = `Master`, `Administrator`, `Coordinator`, `Digital Manager` (`constants.ts:617`, test `canSeeGames`, `:666`).
- [ ] **Director EXCLU volontairement** (seule exception à « Director = Administrator »). Ne pas l'ajouter. Idem Guest, External, Site Manager.
- [ ] Défaut de l'interrupteur : **éteint** (`state = { gamesEnabled: false }`, `appSettings.ts:26` ; absence de ligne en base = éteint, `backend/settings/appSettings.ts`).
- [ ] Interrupteur piloté par le **Master seul** : `PUT /api/settings/games` (`requireRole(['Master'])`), lecture `GET /api/settings` ouverte à tout compte authentifié. Composant `GamesToggle` affiché dans Paramètres pour `user?.role === 'Master'` uniquement (`Settings.tsx:711-716`).
- [ ] Navigation : entrée « Jeux » (icône Gamepad2) ajoutée seulement si `canSeeGames` — liste principale (`Sidebar.tsx:211`) et groupe « COMMUNAUTÉ » du menu desktop (`:339`). Pastille rouge de défis en attente sur l'entrée (`9+` au-delà de 9) — 3 emplacements (`Sidebar.tsx:408, 459, 605`).
- [ ] Garde de routage : `App.tsx:91` redirige `games` vers `dashboard` si `!canAccessGames` ; `Games.tsx` redirige aussi via l'événement `gearbox-navigate` et rend `null` si rôle non autorisé (`:233-237, 341`).
- [ ] Garde serveur : `router.use(authenticateToken, requireRole(GAMES_ROLES))` puis 403 « La rubrique Jeux est désactivée. » si l'interrupteur est éteint (`routes/games.ts:14-27`). `GAMES_ROLES` (`auth/roles.ts:51`) doit rester aligné sur `GAMES_ALLOWED_ROLES`.
- [ ] Cloisonnement site : sans objet (aucune donnée de site). Le chef de site est exclu par le rôle.
- [ ] Vues de partie **redactées** côté serveur (`utils/gameView.ts`) : la flotte adverse n'est jamais envoyée au client.
- [ ] Le client ne fabrique aucune donnée de partie ; il résout les identités par `userId` depuis `db.getUsers()`.

## 2. Structure

- [ ] Onglets de page (`PageTab`, état local `useState`, **non persistés**, défaut `lobby`) : « Lobby », « Morpion », « Puissance 4 », « Bataille navale », « Classement » (`Games.tsx:38-44`). Défilement horizontal sur petit écran.
- [ ] Vue « écran de jeu » : remplace toute la page dès qu'une partie est active (`activeId`, état local non persisté) ; bouton retour (flèche) → `setActiveId(null)`.
- [ ] `cible` (adversaire pré-sélectionné) et `jeuChoisi` (défaut `morpion`) : états locaux.
- [ ] Aucune clé `useSessionState` / localStorage (« plus une ligne de localStorage », en-tête du fichier).

## 3. Filtres et sélecteurs

- [ ] **Choix du jeu** (« Lancer un défi ») : 3 cartes à sélection unique — Morpion, Puissance 4, Bataille navale ; défaut Morpion ; bordure orange sur la sélection.
- [ ] **Choix de l'adversaire** : liste de cartes joueurs = utilisateurs avec `id ≠ moi` ET `role ∈ GAMES_ALLOWED_ROLES` (`:286`). Pas de recherche ni de tri (ordre de `db.getUsers()`).
- [ ] **Classement par jeu** : les onglets Morpion / Puissance 4 / Bataille navale filtrent l'historique sur `h.game === onglet` ; « Classement » et « Lobby » = tous jeux confondus.
- [ ] Aucun filtre de période ni de joueur.

## 4. Affichage

### Lobby
- [ ] Bloc « On vous défie (N) » (bordure orange, en tête, si N>0) : par défi reçu (`toUserId === moi`, `status === 'pending'`) — avatar + nom de l'émetteur, nom du jeu (masqué sous `sm`), boutons Refuser (croix, `aria-label="Refuser"`) et « Jouer » (coche, `aria-label="Accepter"`).
- [ ] Bloc « Parties en cours (N) » (si N>0) : cartes cliquables (grille 1 col / 2 col dès `sm`) — icône colorée du jeu (Morpion orange, Puissance 4 violet, Bataille navale bleu), nom du jeu, adversaire ; badge de droite : `PLACEMENT` (statut `placing`), `À VOUS` (mon tour et statut `playing`, bordure orange), sinon `ATTENTE`. Parties = statut ≠ `finished`.
- [ ] Bloc « Lancer un défi » : cartes de jeu avec slogans — Morpion « Trois cases alignées. Deux minutes, pas plus. », Puissance 4 « Quatre pions, la gravité en plus. », Bataille navale « Placez votre flotte, coulez la sienne. » ; puis cartes joueurs.
- [ ] Carte joueur : bouton « Défier » → au clic devient « {Jeu} ! » (confirmation) ; « Défi envoyé » (texte inerte) si un défi `pending` de moi vers lui existe.
- [ ] Bloc « Meilleure série » (si série > 1) : avatar + « N victoires d'affilée » (`computeStreak` : plus longue série de victoires consécutives d'un joueur, parties décidées triées par `updatedAt`, nul ignoré, toutes parties confondues).
- [ ] Joueur inconnu : « Joueur retiré ».

### Classement (onglets Morpion / Puissance 4 / Bataille navale / Classement)
- [ ] Titre : « Classement toutes catégories » ou « Classement — {jeu} ».
- [ ] Podium 2-1-3 (top 3 par victoires, couronne sur le 1er, prénom seul, hauteur des marches h-16/h-24/h-12, nombre de victoires dans la marche).
- [ ] Tableau : Joueur (rang + avatar + nom), J (joués), V (victoires), D (défaites), N (nuls), % (`round(V/J×100)`) ; ma ligne surlignée. Tri : victoires décroissantes puis %.
- [ ] « Face-à-face » : 5 duels max, triés par nombre total de parties, score « a – b » (le plus haut en orange) ; ordre des deux joueurs = tri alphabétique des ids.
- [ ] Note de bas : « Classement calculé sur les parties enregistrées côté serveur — identique pour tout le monde. »
- [ ] Source des stats : `history` du lobby (`GameSummary[]`), calcul 100 % client (`computeStats`, `computeRivalries`).

### Écran de partie
- [ ] En-tête : titre du jeu, « moi vs adversaire » (avatars, prénoms), bouton « Abandonner » (icône drapeau, libellé masqué sous `sm`) tant que non terminée.
- [ ] Fin de partie : carte « Victoire ! » (trophée, bordure orange) / « Défaite » (+ « La revanche est un clic dans le lobby. ») / « Match nul ».
- [ ] Morpion : grille 3×3 ; statut « À vous de jouer » / « Au tour de votre adversaire… » / « Partie terminée » ; ligne gagnante (`winningLine`).
- [ ] Puissance 4 : 6 lignes × 7 colonnes, indicateurs de colonne (chevron), dernier coup et ligne gagnante ; mêmes statuts.
- [ ] Bataille navale : phase de placement puis de tir (détail en section 5/6).

## 5. Formulaires

- [ ] Aucun formulaire de saisie textuelle. Seuls contrôles : choix du jeu, choix de l'adversaire (deux temps : « Défier » puis « {Jeu} ! »).
- [ ] Bataille navale, placement : flotte fixe — Porte-avions (5), Croiseur (4), Destroyer (3), Sous-marin (3), Torpilleur (2) ; consigne « Placez le {navire} ({taille} cases) » ; boutons d'orientation (« Horizontal » / « Vertical »), « Aléatoire », « Effacer » (désactivé si rien posé), « Valider ma flotte » (désactivé tant que la flotte n'est pas complète ; « Envoi… » pendant l'envoi) ; message « Flotte complète — à vous de valider. » ; attente « En attente du placement de votre adversaire… » ; puces de la flotte cochées au fur et à mesure.
- [ ] Bataille navale, tir : deux grilles « Grille adverse » (clic = tir, désactivée hors tour) et « Ma flotte » ; messages « Touché ! », « Manqué. », « Coulé — {navire} ! » ; « Reste à couler : » + puces `{nom} · {taille}` (« plus rien ! » si vide).
- [ ] Validation serveur : destinataire requis (400), pas de défi à soi-même (400 « Vous ne pouvez pas vous défier vous-même. »), jeu connu (400 « Jeu inconnu. »), destinataire existant (404) et éligible (400 « {nom} n'a pas accès aux Jeux. »).

## 6. Actions

- [ ] Envoyer un défi : `POST /api/games/challenges` (`db.sendGameChallenge(toUserId, game)`) ; déclenche une **notification push** chez le collègue (cf. commentaire `constants.ts:628-631`).
- [ ] Refuser un défi : `POST /api/games/challenges/:id/refuse` (erreur ignorée silencieusement ; 403 « Ce défi ne vous concerne pas. »).
- [ ] Accepter un défi : `POST /api/games/challenges/:id/accept` → ouvre directement la partie ; seule la personne défiée peut accepter (403), défi déjà traité (400 « Défi déjà traité. »).
- [ ] Ouvrir une partie en cours : clic sur la carte ; retour au lobby par la flèche.
- [ ] Jouer un coup : socket `game:move` (`emitWithAck`) — le client propose, le serveur tranche et renvoie `effect`, `sunkShipName`, session redactée ; échec : « Coup refusé. ».
- [ ] Placer la flotte : socket `game:fleet:place` ; échec : « Placement refusé. ».
- [ ] Abandonner : `confirm()` « Abandonner la partie ? La victoire ira à votre adversaire. » puis socket `game:forfeit` ; erreur ignorée.
- [ ] Basculer l'interrupteur (Master, Paramètres) : ligne « Espace détente · visible de l'équipe / masqué pour tous », commutateur `role="switch"` (titre « Masquer la rubrique Jeux » / « Afficher la rubrique Jeux »), désactivé pendant l'envoi, erreur en rouge « Échec de la modification. » ; l'auteur met à jour son propre état localement (exclu de la diffusion).
- [ ] Pas d'export, ni de duplication, ni de suppression de partie/défi côté UI.

## 7. Temps réel et chargement

- [ ] `useRealtimeSync(RT_EVENTS.games, chargerLobby)` : `game:challenge:updated`, `game:session:started`, `game:session:updated` (`realtime.ts:77`) ; `useRealtimeSync(RT_EVENTS.users, chargerUsers)` pour les identités.
- [ ] Écoute socket directe de `game:session:updated` (met à jour la partie depuis la charge, sans refetch) et de `game:session:started` (ouvre automatiquement la partie pour le joueur qui vient d'être accepté) (`Games.tsx:267-280`).
- [ ] Chargement : `db.getGamesLobby()` → `{ challenges, sessions, history }` ; texte « Chargement… » avec spinner tant que `chargement`.
- [ ] Interrupteur : événement `settings:updated` (`RT_EVENTS.settings`) diffusé à tous les clients : extinction immédiate sans rechargement ; `appSettingsStore.refresh` lit `GET /api/settings` (défaut conservé si échec).
- [ ] Sidebar : `loadGamesChallenges` (compte des défis reçus en attente) rechargé sur `RT_EVENTS.games`.
- [ ] Plus de polling (remplacé par les événements socket).

## 8. États vides et erreurs

- [ ] « Aucune partie terminée pour l'instant. » (classement vide).
- [ ] « Aucun collègue n'a accès aux Jeux. » (aucun adversaire éligible).
- [ ] Erreur lobby : bandeau rouge, message de l'`ApiError` ou « Impossible de charger les jeux. » ; erreur défi : « Échec de l'envoi du défi. » ; acceptation : « Échec de l'acceptation. ».
- [ ] 403 « La rubrique Jeux est désactivée. » (interrupteur éteint) et 403 rôle : l'écran ne devrait pas être atteignable (garde), sinon bandeau d'erreur.
- [ ] Partie inaccessible : 404 « Partie introuvable. », 403 « Vous ne participez pas à cette partie. ».

## 9. Règles métier touchées

- [ ] Règle d'accès Jeux : `canSeeGames()` / `GAMES_ALLOWED_ROLES` de `constants.ts` — à réutiliser telle quelle, ne pas recopier la liste (la Sidebar en avait une copie en dur, corrigée).
- [ ] « Director = Administrator sauf Jeux » : appliquée ici.
- [ ] Aucune règle budgétaire (Alpine/Nissan, Holding, Brouillon, GROUPE BONY) : module sans donnée financière.
- [ ] Rôles cloisonnés : chef de site sans accès (rôle absent + rubrique hors `SITE_MANAGER_SECTIONS`).

## 10. Mobile

- [ ] Onglets à défilement horizontal (« cinq onglets ne tiennent pas à 320 px »), hauteur 44 px sous `md`, 36 px au-delà.
- [ ] Boutons `min-h-[40px]`/`[44px]` ; libellé « Abandonner » masqué sous `sm` (icône drapeau seule) ; nom du jeu d'un défi reçu masqué sous `sm`.
- [ ] Grilles 1 colonne sous `sm` (cartes de jeu : 3 colonnes dès `sm` ; joueurs et parties : 2 colonnes dès `sm`).
- [ ] Tableau de classement `min-w-[380px]` avec défilement horizontal.
- [ ] Marges `px-3 md:px-6`, `pb-20` pour la barre inférieure.

## 11. Défauts et bizarreries relevés

- [ ] Onglet actif non persisté (revient à « Lobby » à chaque retour), contrairement à la plupart des rubriques.
- [ ] `refuser` et `abandonner` avalent les erreurs sans retour utilisateur.
- [ ] Le classement est calculé côté client sur tout l'historique renvoyé par le lobby : pas de pagination, coût croissant.
- [ ] `computeStreak` n'est pas filtré par jeu (calculé sur l'historique complet même dans les onglets par jeu, et affiché seulement dans le Lobby).
- [ ] Le rôle est testé deux fois en local dans `Games.tsx` (`GAMES_ALLOWED_ROLES.includes` sans l'interrupteur) alors que `App.tsx` utilise `canSeeGames` : si l'interrupteur est éteint la page reste accessible côté composant tant que `App.tsx` ne la masque pas — protection réelle = serveur.
- [ ] Le filtre `adversaires` s'appuie sur `db.getUsers()` : un compte non éligible n'apparaît pas, mais la liste inclut des comptes éligibles sans notion de présence ou de désactivation.
- [ ] Aucune fiche `BUGS-CONNUS.md` du 29/09 relevée pour ce module (non vérifié fiche par fiche).
