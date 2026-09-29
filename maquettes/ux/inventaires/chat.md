# Inventaire fonctionnel — Chat

Source : `pages/Chat.tsx` (2 190 lignes), `services/chatStore.ts`, `services/socket.ts`, `lib/personnalisationChat.ts`,
`backend/src/routes/chat.ts`, `backend/src/realtime/chat.ts`, `backend/src/realtime/index.ts`, `backend/src/routes/uploads.ts`,
`backend/src/utils/personnalisationChat.ts`, `App.tsx`, `components/Sidebar.tsx`, `constants.ts`.
Relevé le 29/09/2026 sur `feat/ui2-lot0`, lecture du code uniquement.

## 1. Accès et rôles

- [ ] **Rubrique `chat`** : visible de tous les rôles sauf `Site Manager` (absente de `SITE_MANAGER_SECTIONS`, `constants.ts:719-721`) ; garde de routage `App.tsx:102` renvoie le chef de site sur `dashboard`.
- [ ] **External** : `chat` fait partie d'`EXTERNAL_ALLOWED_TABS` (`App.tsx:80`) et de sa nav (`Sidebar.tsx:232`).
- [ ] **Test partagé « vie sociale »** : `hasSocialFeatures(role)` = `!isSiteManager(role)` (`constants.ts:728`), aligné sur `backend/src/auth/roles.ts:75-77` (`NO_SOCIAL_ROLES = ['Site Manager']`).
- [ ] **Transport fermé au chef de site** : `joinUserRooms` + `registerChatHandlers` ne sont enregistrés que si `hasSocialFeatures` (`backend/src/realtime/index.ts:68-83`).
- [ ] **Chat Général** : appartenance implicite pour tout non-External — client `filterVisible` (`Chat.tsx:733-739`), `openConversation` (`:768`), REST `GET /conversations` (`routes/chat.ts:20-28`), `GET /messages` (`:44-49`), room socket `conv:general` (`realtime/chat.ts:44`), handlers send/react/read/mute (`:131`, `:294`, `:324`, `:364`).
- [ ] **Privé / groupe** : réservés aux `participants` (client `:737`, `:769` ; serveur mêmes lignes).
- [ ] **Écriture de messages** : tout membre (aucun `EDIT_ROLES`) ; Guest compris.
- [ ] **Modifier / supprimer un message** : auteur uniquement — menu gaté `isMe` (`Chat.tsx:1559`, double-clic `:1400`), refus serveur « Seul l'auteur peut modifier son message. » / « Seul l'auteur peut supprimer son message. » (`realtime/chat.ts:246`, `:267`).
- [ ] **Renommer un groupe** : `adminIds` uniquement — crayon gaté `isGroupAdmin` (`Chat.tsx:835`, `:1314`) ; serveur « Seul un administrateur du groupe peut le renommer. » (`realtime/chat.ts:492-494`).
- [ ] **Ajouter / retirer des membres** : `adminIds` uniquement (`Chat.tsx:1852`, `:1862` ; `realtime/chat.ts:527-529`). Ni soi-même ni un admin ne peuvent être retirés (`:530-533`).
- [ ] **Photo de groupe** : TOUT participant (décision Théo, `realtime/chat.ts:388-391`) ; bouton sur l'avatar d'en-tête pour tout membre d'un groupe (`Chat.tsx:1273-1293`).
- [ ] **Thème (fond + bulle)** : TOUT participant d'un privé ou groupe ; **jamais le Général** — bouton masqué (`Chat.tsx:1350`), `themeModifiable` (`:576`), refus serveur « Le thème du Chat Général ne se modifie pas. » (`realtime/chat.ts:462-464`).
- [ ] **External — spécificités** : pas de section/entrée Général (`Chat.tsx:1128`) ; « + » ouvre directement la modale « Message privé » sans étape de choix (`:1117`), donc ne crée pas de groupe ; section Groupes AFFICHÉE (il peut y être ajouté, `:1169-1175`) ; action « Citer un projet » masquée (`:649`, `:1726`) ; carte projet reçue remplacée par un libellé neutre « Projet cité », non cliquable (`ProjectChatCard`, `:219-231`).
- [ ] **Projets chargés pour TOUS, External compris** (`db.getProjects()`, `:609-613`) — la restriction est dans l'affichage seulement.
- [ ] **Interlocuteurs proposés** (privé, groupe, ajout de membre) : `users` sauf moi et sauf rôles sans `hasSocialFeatures` (`:1090-1096`). Refus serveur à la création : « Impossible : <noms> n'a pas accès au chat. » (`routes/chat.ts:96-101`) et à l'ajout (`realtime/chat.ts:539-542`).
- [ ] **Uploads** : `POST /api/uploads/:type` avec `requireRole(UPLOAD_ROLES)` = tous les rôles sauf chef de site (`routes/uploads.ts:13`, `:141`).
- [ ] **Cloisonnement `siteScope`** : aucun — le chat n'est pas rattaché à un site.
- [ ] **Ce que le client fabrique** : l'épingle (`pinnedBy`) est un overlay localStorage (voir §2) ; la liste des membres du Général = tous les `users` (`getConvMembers`, `:744`).

## 2. Structure

- [ ] Deux panneaux : **liste des conversations** (gauche, 280 px) + **fenêtre de conversation** (droite) ; panneau **Membres** en colonne à droite (groupe seulement).
- [ ] Liste en trois sections, dans cet ordre : « Général » (masquée External), « Groupes (n) », « Messages Privés (n) » (`:1130`, `:1178`, `:1221`).
- [ ] Modales : choix (`'choice'`), « Message privé » (`'private'`), « Nouveau groupe » (`'group'`) — état `showNewModal` (`:460`) ; « Photo du groupe » ; « Personnaliser la discussion » ; visionneuse (lightbox).
- [ ] Menus flottants (`FloatingPanel`) : GIF, « citer un projet », menu « + » mobile.
- [ ] **Persistance** : aucun `useSessionState`. Conversation active NON mémorisée ; à l'arrivée, ouverture automatique de la 1re conversation visible (`:705-710`, ordre : Général, puis groupes, puis privés).
- [ ] localStorage `gearbox_chat_overlay` : `{ [convId]: { pinnedBy } }` — épingle personnelle par navigateur (`:87-105`). Anciens champs `name`/`participants` ignorés volontairement.
- [ ] Purge au montage des clés héritées `gearbox_conv_avatar_*` (`:724-730`, bloc supprimable).

## 3. Filtres et sélecteurs

- [ ] Aucun filtre sur la liste de conversations ni sur les messages.
- [ ] **Recherche de projet à citer** (menu « citer un projet ») : placeholder « Rechercher un projet… », texte libre, sous-chaîne insensible à la casse sur `name` OU `site` ; base = projets `status === 'Active'` ET `endDate >= aujourd'hui` ; tri `endDate` croissant ; 50 max (`:618-626`). Remise à vide après envoi. Non persistée.
- [ ] **Sélecteur de membres** (création de groupe) : MULTIPLE, cases rondes cochées, options = `usersForGroup` ; aucun préselectionné ; minimum 2 (`:1997-2021`).
- [ ] **Sélecteur d'interlocuteur** (privé) : simple, clic = création/ouverture ; badge « EXISTANTE » si une conversation privée existe déjà (`:1950-1964`).
- [ ] **Recherche GIF** : placeholder « Rechercher un GIF… » (`components/GifPicker.tsx:47`).

## 4. Affichage

- [ ] **Ligne de conversation** : avatar (`ConvAvatar`, 38 px), nom, heure relative de `lastMessageAt`, aperçu `lastMessage` (sinon « Aucun message »), badge non-lus orange (`> 99` → « 99+ »), bouton sourdine (Bell/BellOff, orange si active) et épingle (Star/StarOff), pastille étoile sur l'avatar si épinglée (`:1138-1163`). Ligne active = fond `bg-bony-gradient`.
- [ ] **Nom de conversation** (`getConvName`, `:755-761`) : `conv.name` ; sinon « Chat Général » ; sinon noms des autres membres joints par « , » ; sinon « Conversation ».
- [ ] **Avatar** (`:133-198`) : Général = pastille orange « # » ; privé = avatar de l'autre ; groupe = `avatarUrl` prioritaire, sinon 2 avatars empilés, sinon icône Users violette.
- [ ] **Tri** des groupes et privés (`sortByDate`, `:1056-1061`) : épinglées d'abord, puis `lastMessageAt` décroissant. Pas de tri proposé.
- [ ] **Heure relative** (`relativeTime`, `:108-117`) : « à l'instant », « il y a Nmin », « il y a Nh », « hier », puis `fr-FR` `{ day: 'numeric', month: 'short' }`.
- [ ] **En-tête** : nom (+ crayon admin), sous-titre « N membres » (Général : `users.length`), « N membre(s) » (groupe), « Conversation privée » (`:1325-1331`) ; pile de 5 avatars + « +N » (≥ `sm`) ; bouton Palette « Personnaliser la discussion » (hors Général) ; bouton « Membres » (groupe, libellé ≥ `lg`).
- [ ] **Séparateurs de jour** (`dayLabel`, `:119-127`) : « Aujourd'hui », « Hier », sinon `{ day: 'numeric', month: 'long', year: 'numeric' }`. Messages groupés par jour (`:1067-1075`), ordre chronologique serveur (`timestamp asc`).
- [ ] **Message reçu** : avatar 28 px, « <Nom> · HH:MM » (`msgTime`, `fr-FR` 2-digit). **Message à moi** : aligné à droite, heure sous la bulle. Largeur max 70 %.
- [ ] **Réponse citée** : liseré orange, italique, « <auteur>: <résumé> » (`resumeMessage`, `:64-74` : « 📷 Image », « 📎 <nom|Pièce jointe> », « 🎤 Message vocal (durée) », « 📋 <projet|Projet> », « 📷 GIF », sinon 60 car.).
- [ ] **Types de message** (`:1440-1521`) : `fileExpiredAt` → carte « Pièce jointe expirée » ; `image` → vignette 240×200 cliquable (lightbox) ; `file` → carte nom + poids (`formatPoids`, sinon « Fichier ») + Download, lien `download` au nom d'origine ; `audio` → lecteur `<audio controls preload="none">` + durée (portée par `fileName`) ; `project` → `ProjectChatCard` (`ProjectSummary` + « Ouvrir le projet ») ; texte dont l'URL est une image distante → image (GIF) ; sinon bulle texte `renduTexteRiche` + « (modifié) » + aperçu du PREMIER lien (`LinkPreview`).
- [ ] **Couleur des bulles** : seules MES bulles prennent la couleur du thème (`bulleDe(convTheme?.bubble)`, défaut « Bony » dégradé `#f75632 → #8f12ab`), texte sombre `#0f172a` si `texteSombre` ; celles des autres restent neutres (`:596`, `:1506-1511`).
- [ ] **Fond** : `styleFondChat(fondActuel, sombre)` sur le conteneur (fixe au défilement), voile `voileFondChat` seulement si un style est réellement résolu (`:589-590`, `:1381-1384`).
- [ ] **Réactions** : pastilles « <emoji> <n> », orange si j'ai réagi ; infobulle « qui a réagi » (« Vous » en tête, « Ancien membre » si inconnu) au survol ou appui long 450 ms (`:748-753`, `:1577-1626`).
- [ ] **« Vu par »** sous le DERNIER message non supprimé (`:804-825`, `:1637-1644`) : lecteurs = membres avec `readAt[uid] >= timestamp`, hors auteur et hors moi ; membres du Général = `users` non-External avec `hasSocialFeatures`. Libellés : « Vu par tout le monde » (tous et > 1 candidat), « Vu par N personnes » (> 5), sinon « Vu par <noms> » ; icône CheckCheck ; liste complète en infobulle. Aligné à droite sous mes messages.
- [ ] **Panneau Membres** : « Membres (n) », avatar, « <nom> (moi) », sous-ligne « ★ Admin » ou rôle ; section « Ajouter » (admin) avec les non-membres (`:1834-1883`).
- [ ] **Badge Sidebar** : total non-lus `chatStore.getUnreadTotal` (`Sidebar.tsx:80`), « 99+ » au-delà.

## 5. Formulaires

- [ ] **Saisie de message** : textarea 1 ligne auto-extensible jusqu'à 128 px (`:869-876`) ; placeholder « Écrire un message… (Entrée pour envoyer) », mobile « Écrire un message… » ; Entrée = envoi, Maj+Entrée = retour ligne ; envoi refusé si vide après `trim` ; bouton Envoyer désactivé si vide.
- [ ] **Édition de message** : textarea (min 60 px), Entrée = valider, Échap = annuler, boutons Check / X (`:1423-1434`).
- [ ] **Nouveau groupe** : « Nom du groupe » (texte, obligatoire, placeholder « Ex: Équipe comm Renault… ») ; « Membres (n sélectionné(s)) — 2 minimum » ; bouton « Créer le groupe » désactivé si nom vide ou < 2 membres ; créateur ajouté d'office et `adminIds: [me.id]` (`:1000-1018`). Serveur : `name` non vide requis pour un groupe (`routes/chat.ts:123-125`).
- [ ] **Renommer un groupe** : champ en ligne dans l'en-tête, Entrée = valider, Échap = annuler ; serveur : non vide, 80 caractères max (« Nom trop long : 80 caractères maximum. », `realtime/chat.ts:485-487`).
- [ ] **Photo du groupe** (`GroupAvatarCropModal`, `:296-428`) : glisser-déposer ou parcourir, jpg/png/gif/webp, 5 Mo max (« Format non supporté. Utilisez jpg, png, gif ou webp. », « Fichier trop lourd (max 5 Mo). ») ; recadrage rond, zoom 1–3 pas 0,05 ; « Choisir une autre photo » ; « Valider » / « Enregistrement… » ; « Supprimer la photo » / « Suppression… » si photo existante ; « Annuler ». Sortie : JPEG 200×200 → `POST /api/uploads/avatar` → `chat:conversation:avatar`. Serveur n'accepte que `/uploads/avatar/<uuid>.(jpg|png|gif|webp)` ou `null` (`realtime/chat.ts:28-29`, `:402-407`).
- [ ] **Personnaliser la discussion** (`:2044-2157`) : sous-titre « « <nom> » — visible par tous les membres de la discussion. » ; fonds par famille dérivée du catalogue (`FONDS_CHAT`) — Couleurs : Miami, Aurore boréale, Agrumes, Lagon, Holographique, Synthwave ; Motifs : Terrazzo, Confettis, Memphis, Bulles néon ; Sobres : Grille technique, Ardoise (`lib/personnalisationChat.ts:44-285`) ; valeur stockée `proc:<id>`. « Couleur des bulles » : Bony, Océan, Lagon, Forêt, Coucher, Violine, Framboise, Nuit, Or, Menthe, Graphite, Orange uni (`:308-320`), défaut `bony`, note « Partagée : chaque membre voit ses propres messages dans cette couleur. ». « Une image » : « Importer » (JPEG, PNG ou WebP — 8 Mo maximum), vignette de l'image actuelle. « Aucun fond » (désactivé s'il n'y en a pas). Choisir un fond ferme la modale ; « Aucun fond » et les bulles la laissent ouverte.
- [ ] Validation fond côté serveur : forme uniquement (`proc:` ou `/uploads/chatbg/<uuid>.(jpg|png|webp)`), `''` = retrait (`utils/personnalisationChat.ts:50-60`) ; message « Fond refusé : seuls un fond du catalogue ou une image déposée dans Gearbox sont acceptés. » / « Couleur de bulle refusée. ».
- [ ] **Pièces jointes** : tous formats, 100 Mo max, fichier vide refusé (« Fichier vide. ») (`:940-955`) ; image si MIME jpeg/png/gif/webp, sinon `file`. Bouton image : `accept` jpeg/png/gif/webp. Serveur règle `chat` : `mimes: null`, 100 Mo (`routes/uploads.ts:38-48`) ; `fileName` tronqué à 260 car., `fileSize` ≤ 100 Mo (`realtime/chat.ts:120-125`).
- [ ] **Message vocal** (`VoiceRecorder`) : 5 min max (« Enregistrement… (5 min max) » / « Prêt à enregistrer ») ; erreurs « Accès au micro refusé. Autorise-le dans les réglages du navigateur pour ce site. », « Impossible de démarrer l'enregistrement. » ; envoyé en `audio` avec la durée dans `fileName`.
- [ ] **Liste blanche serveur des types** : `TYPES_CONNUS = ['image', 'file', 'project', 'audio']`, tout le reste → `text` (`realtime/chat.ts:111-112`).

## 6. Actions

- [ ] **Nouvelle conversation** (« + », titre « Nouvelle conversation ») → « Message privé » (« Conversation 1-to-1 ») ou « Groupe de travail » (« 2 membres minimum »).
- [ ] **Créer / ouvrir un privé** : réutilise l'existante, sinon `POST /api/chat/conversations` (idempotent côté serveur, `routes/chat.ts:108-119`).
- [ ] **Envoyer** texte / image / fichier / vocal / GIF (URL Tenor en `text`) / projet cité (`content` = id) via `chat:message:send` ; ajout à la liste à la réception de `chat:message:new` (pas d'optimisme).
- [ ] **Coller** : 1er fichier du presse-papiers envoyé en pièce jointe ; chemin local `file:///…` d'image intercepté avec l'alerte « Ce GIF est un fichier enregistré sur ton ordinateur, pas un lien… » (`:958-976`).
- [ ] **Répondre** (icône Reply) : barre « <auteur> — <résumé 80> », « Annuler la réponse ».
- [ ] **Réagir** : 4 emojis `👍 ❤️ 😂 😮` (`:31`) ; clic = bascule (ajout/retrait) ; `chat:message:react`.
- [ ] **Modifier** (menu ⋯ ou double-clic, auteur) → `chat:message:edit`, marque `edited`.
- [ ] **Supprimer** (menu ⋯, auteur) : confirmation native « Supprimer ce message ? » → suppression douce (`deleted`, `content` vidé), affichage « Message supprimé ».
- [ ] **Épingler** : localStorage seul, par navigateur (`:908-918`).
- [ ] **Sourdine** (`chat:conversation:mute`) : coupe le push, pas le compteur ; synchronisée entre appareils ; titres « Mettre en sourdine » / « Réactiver les notifications ».
- [ ] **Marquer lu** à l'ouverture et à chaque message reçu d'autrui dans la conversation ouverte (`chat:conversation:read`, remet `unreadCounts[moi]=0` et pose `readAt[moi]` horloge serveur).
- [ ] **Groupe** : renommer, ajouter (clic sur un non-membre), retirer (confirmation « Retirer <nom> du groupe ? Cette personne n'y aura plus accès. »), photo, thème.
- [ ] **Ouvrir le projet cité** : `sessionStorage.pendingProjectId` + événement `gearbox-navigate` `{ tab: 'projects', projectId }` (`:244-247`).
- [ ] **Lightbox** image : clic pour fermer, bouton X.
- [ ] Aucun export, aucune action en masse, aucune suppression ni quitter de conversation, pas de glisser-déposer de pièce jointe dans le fil (seulement dans la modale photo).
- [ ] **Push** (effet de bord serveur) : destinataires = cibles non-lus − émetteur − `mutedBy` − personnes présentes sur la rubrique chat ; titre « <nom> — Chat Général » ou « <nom> » ; corps = `lastMessage` (`realtime/chat.ts:214-231`).

## 7. Temps réel et chargement

- [ ] Montage : `db.getUsers()`, `connectSocket()` idempotent, abonnement `chatStore`, `db.getConversations()` → store (`:481-520`) ; `db.getGifStatus()` (bouton GIF seulement si `disponible`, `:604-606`) ; `db.getProjects()`.
- [ ] Ouverture de conversation : `db.getMessages(id)` — historique COMPLET, sans pagination (`routes/chat.ts:36-60`).
- [ ] Socket écouté dans la page : `chat:message:new` (ajout sans doublon + défilement + lu), `chat:message:updated` (édition, suppression, réactions).
- [ ] Socket écouté par `services/socket.ts:76-78` → store : `chat:conversation:updated`, `chat:conversation:created`, `chat:conversation:removed` (retiré d'un groupe → la conversation ouverte se referme, `Chat.tsx:829-834`).
- [ ] Événement fenêtre `gearbox-chat-reconnected` → recharge les messages de la conversation ouverte.
- [ ] `RT_EVENTS.users` → recharge des utilisateurs ; `RT_EVENTS.projects` → recharge des projets.
- [ ] Les écritures passent par `emitWithAck` ; erreur = ack `{ error }` ; « Socket non connecté. » si pas de socket (`services/socket.ts:103-111`).
- [ ] Aucun état de chargement visible (pas de squelette ni spinner), hormis « Enregistrement… » / « Suppression… » de la photo et `fondEnCours` qui désactive la modale de thème.

## 8. États vides et erreurs

- [ ] « Sélectionne une conversation » (aucune conversation active).
- [ ] « Aucun groupe », « Aucune conversation privée », « Aucun message » (aperçu).
- [ ] « Aucun projet actif trouvé. », « Projet introuvable », « Projet cité » (External).
- [ ] « Pièce jointe expirée » (purge 180 j), « Message supprimé ».
- [ ] Erreurs en `alert()` natif : « Échec de l'envoi du message. », « Échec de la modification. », « Échec de la suppression. », « Échec de la réaction. », « Échec de la mise en sourdine (serveur injoignable ?). », « Fichier trop lourd (max 100 Mo). », « Échec de l'envoi du fichier. », « Échec de la création de la conversation. », « Échec de la création du groupe. », « Mise à jour des membres impossible. », « Renommage impossible. », « Choisissez une image (JPEG, PNG ou WebP). », « Image trop lourde : 8 Mo maximum. », « Import du fond impossible. », « Enregistrement impossible. » — le message serveur remplace le texte générique quand il existe.
- [ ] Erreurs de la modale photo affichées en ligne (rouge), modale conservée.
- [ ] 403/404 sur `GET /messages` : fil vide silencieux (`:777-779`). Échec `getUsers`/`getProjects`/`getGifStatus` : silencieux.

## 9. Règles métier touchées

- [ ] **Brouillon** : exclu du sélecteur « citer un projet » par le filtre `status === 'Active'` (`:622`), même définition que la To-do. Une carte d'un projet déjà cité s'affiche quel que soit son statut.
- [ ] **Holding / Alpine / Nissan / curseurs / GROUPE BONY** : aucune (pas de montant). `ProjectSummary` affiche les infos du projet (y compris budget selon le commentaire `:210`) — à réutiliser tel quel.
- [ ] **Chef de site** : aucune vie sociale (`hasSocialFeatures`) — ni rubrique, ni socket, ni sélection comme interlocuteur.
- [ ] **External** : pas de Général, pas de citation de projet, carte projet neutralisée.

## 10. Mobile (sous `md:`)

- [ ] Un seul panneau à la fois : liste OU conversation (`showMobileChat`, `:1107`, `:1264`) ; flèche retour dans l'en-tête.
- [ ] Sourdine et épingle toujours visibles (survol seulement ≥ `md`).
- [ ] Barre de saisie : actions repliées sous « + » (menu portalisé : Image, Fichier, GIF animé, Citer un projet) ; micro à droite tant que le champ est vide, remplacé par Envoyer dès qu'on tape ; zones tactiles 44 px.
- [ ] Réactions : bouton SmilePlus ouvrant un sélecteur 44 px (la rangée directe est `hidden md:flex`) ; « qui a réagi » par appui long.
- [ ] Photo de groupe : badge appareil photo permanent (overlay au survol sur ordinateur).
- [ ] Panneau Membres en surimpression (`absolute`, 300 px max) au lieu d'une colonne.
- [ ] Pile d'avatars de l'en-tête masquée sous `sm` ; libellé « Membres » masqué sous `lg`.
- [ ] Placeholder raccourci (détection `matchMedia('(max-width: 767px)')`, `:563-570`).

## 11. Défauts et bizarreries relevés

- [ ] ⚠️ **Cloisonnement : un chef de site peut LIRE le Chat Général par l'API.** `GET /api/chat/conversations` et `GET /conversations/:id/messages` n'excluent que l'External (`routes/chat.ts:21-23`, `:46-48`), sans `hasSocialFeatures`. Le socket lui est fermé, pas le REST. `POST` non plus n'a pas de garde de rôle pour l'émetteur (seulement pour les participants).
- [ ] ⚠️ Compteur non-lu et **push du Général** ciblent « tous les non-External » (`realtime/chat.ts:163-166`), chefs de site compris ; à vérifier dans `resolvePushRecipients` qu'un chef de site ne reçoit pas de notification du Général.
- [ ] Sous-titre « N membres » du Général = `users.length` (External et chefs de site compris, `:1327`), alors que « Vu par » et le serveur les excluent.
- [ ] « Modifier » est proposé sur TOUT message à moi, y compris image / fichier / vocal / projet (`:1400`, `:1566`) : l'édition remplacerait l'URL ou l'id par du texte.
- [ ] L'épingle reste un overlay localStorage par navigateur (non synchronisé) ; `pinnedBy` serveur toujours `[]`.
- [ ] Aucune suppression de conversation ni « quitter le groupe » (fiche ouverte `BUGS-CONNUS.md:69`).
- [ ] Deux tests « conversation privée existante » divergents : `participants.length === 2` dans `startPrivateConv` (`:982`), absent pour le badge « EXISTANTE » (`:1951`).
- [ ] `importerFond` accepte tout `image/*` côté client (GIF compris) alors que le serveur n'accepte que JPEG/PNG/WebP — le refus remonte en alerte serveur (l'`accept` de l'input limite déjà le cas).
- [ ] `hasSocialFeatures` client renvoie `true` pour un rôle vide, le serveur `false` (`constants.ts:728` vs `roles.ts:76-77`).
- [ ] Barre d'actions au survol d'un message reçu qui déborde de 8 à 19 px vers 800 px de large (`BUGS-CONNUS.md:153`, ouvert).
- [ ] `GET /api/projects` sans contrôle de rôle : l'External peut lire les projets par l'API malgré la carte neutralisée (`BUGS-CONNUS.md:89`, ouvert).
- [ ] Pièces jointes servies par `/uploads` sans authentification (protégées par uuid seulement, `BUGS-CONNUS.md:101`).
- [ ] Historique chargé en entier sans pagination (`routes/chat.ts:33-35`).
- [ ] Code mort à terme : purge `gearbox_conv_avatar_*` (`:724-730`) ; table `ChatCustomization` obsolète en base (`routes/chat.ts:30-35`).
- [ ] Les trois rendus de ligne de conversation (Général, Groupes, Privés) sont trois copies du même JSX (`:1138-1163`, `:1188-1213`, `:1231-1256`) — à factoriser au portage.
