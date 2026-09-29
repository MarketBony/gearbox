# Inventaire — La coque transverse

Sources : `App.tsx` (199 l.), `components/Sidebar.tsx` (778 l.), `components/FloatingPanel.tsx`, `components/AnimatedBackground.tsx`, `contexts/ThemeContext.tsx`, `index.tsx`, `services/appSettings.ts`, `services/congesAcces.ts`, `public/sw.js`. Les 11 sections du format sont adaptées ; « aucun » quand sans objet.

## 1. Accès et rôles (gardes de rubrique)

Arbre de montage : `index.tsx` (import de `services/pwaInstall` pour effet de bord, avant le rendu ; `React.StrictMode`) > `AuthProvider` > `ThemeProvider` > `InnerApp` (`App.tsx:189-197`).

- [ ] Écran de chargement tant que `loading || !dbReady` : texte « INITIALISATION… » orange pulsé sur fond noir, `h-screen` (`App.tsx:138`). `db.init()` au montage.
- [ ] Non connecté → `<Login />` (`:140`). Le fond animé n'est jamais monté sur Login.
- [ ] Onglet actif : état `activeTab` local, défaut `'dashboard'` (`:36`). **Aucun routeur / pas d'URL** ; l'onglet n'est pas persisté ici (le commentaire `:93` parle d'onglet « mémorisé en session », non vérifié dans ce fichier).
- [ ] Onglet résolu `resolvedTab` (sert de `key` à la transition), cascade de gardes dans cet ordre (`:84-104`) :
  - External : hors `['digital','chat','hello-marketing','settings']` → `digital` (`:80`, `:90`).
  - `games` sans `canSeeGames(role, gamesEnabled)` → `dashboard` (`:91`). `canSeeGames` = interrupteur allumé ET rôle dans `GAMES_ALLOWED_ROLES` = Master, Administrator, Coordinator, Digital Manager (Director et Guest exclus) (`constants.ts:617-667`).
  - `export` sans rôle dans `EXPORT_ALLOWED_ROLES` = Master, Administrator, Director, Coordinator (`pages/Export.tsx:8`) → `dashboard`.
  - `conges` sans `voitConges` → `dashboard`.
  - Chef de site : hors `[...SITE_MANAGER_SECTIONS, 'settings']` → `dashboard`. `SITE_MANAGER_SECTIONS` = dashboard, projects, digital, hello-marketing, budget, agenda (`constants.ts:719`).
  - `default` du switch : External → Digital, sinon Dashboard (`:162`).
- [ ] `voitConges` (`useCongesAcces`) = l'utilisateur est dans `membres` renvoyés par `GET conges` OU `peutGererConges(role)` (Master, Administrator, Director) ; défaut prudent `false` ; 403 = normal (chef de site, External), pas d'erreur console (`services/congesAcces.ts:47-65`). Rafraîchi à chaque changement de `user.id/role` et sur `RT_EVENTS.conges` (`App.tsx:56-59`). Le rôle Guest ne voit Congés que s'il est dans le périmètre.
- [ ] Rubriques vers cibles du switch `renderContent` (`:144-164`) : hello-marketing, games, todo, dashboard, projects (viewMode current), digital, chat, archives (Projects viewMode archived), campaigns, material, agenda, budget, fixed-expenses, export, conges, settings.
- [ ] To-do : masquée pour External (`Sidebar.tsx:214`) ; Archives : non listées pour External (filtré) ni chef de site (voir §4).
- [ ] Le refus réel est côté serveur (mentionné pour Jeux, Congés, Export) ; la coque ne fait que masquer.

## 2. Structure

- [ ] Disposition : `<div flex h-screen>` > `AnimatedBackground` + `Sidebar` + `<main class="flex-1 ml-0 md:ml-20 lg:ml-56 relative overflow-hidden pb-16 md:pb-0">` (`App.tsx:167-184`).
- [ ] Transition de page : `AnimatePresence mode="wait"` + `motion.div key={resolvedTab}` avec `pageVariants` / `pageTransition` (`lib/motion`), `className="h-full"`.
- [ ] Sidebar en trois variantes selon largeur : desktop `lg+` (nav groupée, 224 px = `lg:w-56`), tablette `md` (icônes seules, 80 px = `w-20`), mobile `< md` (barre du bas de 64 px + feuille « Plus »).
- [ ] Persistance : thème par utilisateur en localStorage `gearbox_theme_<userId>` (`ThemeContext.tsx:13`) ; lecture de la cloche `gearbox_activity_last_read` (localStorage) ; `sessionStorage` vidé à la déconnexion (`AuthContext.tsx:98`) ; `pendingProjectId` en sessionStorage pour le saut vers un projet.

## 3. Filtres et sélecteurs

Aucun. (`FloatingPanel` est la brique de menu utilisée par `Select`, `DatePicker`, `DateRangePicker` et plusieurs pages ; voir §5.)

## 4. Affichage — Barre latérale

Ordre de `allMainItems` (`Sidebar.tsx:209-224`), avec icône lucide et libellé :
- [ ] Hello Marketing (`Sparkles`) · Jeux (`Gamepad2`, si `canAccessGames`) · Dashboard (`LayoutDashboard`) · Projets (`FolderKanban`) · To-do (`CheckSquare`, sauf External) · Digital (`Globe`) · Chat (`MessageSquare`) · Campagnes (`Megaphone`) · Matériel (`Package`) · Agenda (`CalendarDays`) · Budget (`PiggyBank`) · Dépenses (`Euro`, id `fixed-expenses`) · Export (`FileSpreadsheet`, si `canExport` = Master/Administrator/Director/Coordinator, dupliqué en dur `:203`) · Congés (`Palmtree`, si `voitConges`).
- [ ] Filtrage par rôle (`mainItems`, `:229-233`) : chef de site → `SITE_MANAGER_SECTIONS` ; External → `['digital','chat','hello-marketing']` ; sinon tout.
- [ ] Nav groupée desktop `lg+`, groupes ÉCRITS EN DUR (`:309-357`) : (sans titre) Dashboard ; « GESTION DE PROJETS » : Projets, To-do ; « COM DIGITALE » : Digital, Campagnes ; « COMMUNAUTÉ » : Hello Marketing, Congés, Jeux (si autorisé), Chat ; « OUTILS » : Budget, Dépenses, Matériel, Agenda, Export (si autorisé) ; « HISTORIQUE » : Archives (`Archive`, libellé « Archives »). External : un seul groupe sans titre = `mainItems`. Filtre final par `idsAutorises` = ids de `mainItems` + `archives` (sauf chef de site) ; groupes vides retirés. Séparateur entre groupes.
- [ ] Logo : `/logo-white.svg` (sombre) ou `/logo-color.svg` (clair), `alt="GEARBOX"`.
- [ ] Élément actif : fond `bg-bony-gradient` + texte blanc ; libellé tronqué ; bulles de présence à droite (`PresenceBubbles` taille 18, max 2).
- [ ] Pastilles : Chat = `chatUnreadCount` (orange, « 99+ » au-delà de 99) ; Jeux = `gamesChallengeCount` (violette, « 9+ » au-delà de 9) = défis `pending` dont `toUserId === user.id`, via `db.getGamesLobby()` (`:94-104`). Affichées desktop, tablette et barre mobile.
- [ ] Zone utilisateur desktop `lg+` : avatar 28 px, nom, rôle, engrenage → `settings` ; bouton « Fil d'actualité » (cloche + badge non lus + « N non lu(s) ») ; bascule thème (« Clair » avec Soleil jaune si sombre, « Sombre » avec Lune si clair) ; « Déconnexion » (rouge, `logout`).
- [ ] Tablette `md` : icônes seules (44x40), Archives en bas séparé (masqué External et chef de site), boutons cloche / thème / engrenage / déconnexion en colonne.
- [ ] Barre du bas mobile (`< md`) : `MOBILE_BAR_IDS` = dashboard, projects, todo, agenda, chat, piochés dans `mainItems` ; repli sur `mainItems.slice(0,5)` si moins de 3 (cas External) ; libellé = premier mot du label (`label.split(' ')[0]`) ; bouton « Plus » (`MoreHorizontal`) avec présence agrégée des rubriques cachées (`hiddenPresence`).
- [ ] Feuille « Plus » (`:692-773`) : titre « Navigation », grille 3 colonnes ; contenu = rubriques hors barre + « Projets Archivés » (`Archive`) + « Paramètres » (`Settings`) ; External : uniquement « Paramètres » ; boutons bas : « Actualités » (cloche + badge, « 9+ »), « Mode Clair » / « Mode Sombre », « Déconnexion ».
- [ ] Bouton « Plus » actif si l'onglet actif est dans `moreNavItems`.

## 4bis. Affichage — Fil d'activité (cloche)

- [ ] Ouverture : « Fil d'actualité » (desktop/tablette) ou « Actualités » (mobile). Réservée si `!isExternal && showSocial` (desktop, tablette) ; le bouton mobile n'est PAS conditionné (voir §11).
- [ ] Panneau latéral droit 320 px (`md:` 384 px) sur fond assombri flou, titre « Fil d'actualité » (`z-[200]`), croix de fermeture, clic sur le fond ferme.
- [ ] Entrée : avatar 30 px, `userName` en gras + `action` + `entityName` (orange), temps relatif (`relativeTime` : « à l'instant », « il y a N min », « il y a Nh », « il y a Nj »), pastille orange si non lue. Ordre = ordre de `GET /api/activity-log` (non retrié côté client).
- [ ] Non lu : `timestamp > gearbox_activity_last_read` (tout est non lu si absent). Fermer le panneau écrit l'heure courante dans ce localStorage (donc marque tout lu). Le badge compte `unreadCount`, « 99+ » desktop, « 9+ » ailleurs.
- [ ] Clic sur une entrée = ferme, puis `gearbox-navigate` selon `entity` : `project` → projects (+ `pendingProjectId` sessionStorage, `detail.projectId`) ; `post` → digital ; `task` → campaigns (+ id projet) ; `fixed-expense` → fixed-expenses ; `equipment` et `booking` → material ; `user` → settings ; autre → dashboard.
- [ ] Vide : icône cloche + « Aucune activité récente. »

## 5. Formulaires / composants globaux

- [ ] `FloatingPanel` (`components/FloatingPanel.tsx`) : panneau portalisé sur `document.body` (`createPortal`), `position: fixed`, `z-[10000]`, classe `glass-menu` (+ `glass-sheen` si `sheen`), attribut `data-floating-panel`. Props : `open`, `onClose`, `triggerRef`, `width` (nombre ou `'trigger'`, défaut `'trigger'`), `minWidth`, `maxWidth`, `maxHeight` (340), `gap` (6), `align` (`start`/`end`), `sheen` (true), `className`, `role`, `onKeyDown`. Placement sous le trigger, au-dessus si moins de 220 px libres et plus de place en haut ; réserve 64 px en bas sous 768 px ; marge 8 px ; hauteur mini 140. Recalcul au scroll (capture) et resize. Fermeture : clic extérieur (sauf autre `[data-floating-panel]`, donc imbrication possible) et Échap. Animation framer 0,18 s (`easeApple`), origine selon placement.
- [ ] `AnimatedBackground` : 4 formes floues `gx-blob-a/b/c/d` dans `div.gx-bg` `aria-hidden`, styles et keyframes dans `index.html` (cycles 34 s, 47 s, 58 s…), monté uniquement connecté ; `prefers-reduced-motion` géré par règle globale d'`index.html:351`.
- [ ] `ThemeContext` : `theme` `'dark' | 'light'`, défaut `'light'` ; clé `gearbox_theme_<userId>` (utilisateur courant, repli `gearbox_auth_user_id`, puis `'default'`) ; recharge au changement d'utilisateur ; ajoute/retire la classe `dark` sur `<html>` ; met à jour `meta[name="theme-color"]` (`#121212` sombre, `#f1f5f9` clair) ; `toggleTheme()` ; `useTheme()` lève une erreur hors provider.
- [ ] Modales globales (ex. photo, install) : `fixed inset-0 z-[200]`.

## 6. Actions

- [ ] Navigation : `setActiveTab` depuis la Sidebar ; événement `window` `gearbox-navigate` (`detail.tab`, optionnellement `detail.projectId`) écouté par `App.tsx:66-72` (et par `Projects.tsx:638`) ; émis par Sidebar (cloche), Agenda, Chat (ouvre un projet), Dashboard (2 sites), Games (retour dashboard), TodoList (ouvre un projet). L'événement n'est pas filtré par rôle : la garde `resolvedTab` le rattrape.
- [ ] Clic sur une notification système : le service worker (`public/sw.js:54-76`) ferme la notification, refocalise une fenêtre de même origine, lui poste `{ type: 'gearbox-notification-click', ...data }` (donc `section`, défaut `'chat'` côté sw `:46`), sinon `openWindow('/')` ; `App.tsx:127-136` fait `setActiveTab(e.data.section)` (soumis aux gardes de `resolvedTab`).
- [ ] Déconnexion : `disconnectSocket`, `clearToken`, `sessionStorage.clear()`, `setUser(null)` (`AuthContext.tsx:95-100`).
- [ ] Réenvoi de l'abonnement push à chaque démarrage si permission déjà accordée : `refreshPushSubscription()` (`App.tsx:121-123`), sans demander la permission.
- [ ] Badge de l'icône PWA = total des non-lus chat (`setAppBadge`, `Sidebar.tsx:85`).

## 7. Temps réel et chargement

- [ ] `appSettingsStore.refresh()` à chaque ouverture de session et sur `RT_EVENTS.settings` (`App.tsx:46-51`). Défaut `gamesEnabled = false` (rubrique masquée tant que non reçu, `appSettings.ts`).
- [ ] `congesAccesStore.refresh` sur session + `RT_EVENTS.conges`.
- [ ] Présence : `setMySection(resolvedTab)` à chaque changement de rubrique RÉELLEMENT affichée (`App.tsx:111-113`, `services/socket.ts:29`) ; `usePresence(user.id)` exclut soi-même ; pour un chef de site la source est neutralisée (`presence = {}`, `Sidebar.tsx:195`).
- [ ] Sidebar : `loadActivity` (GET activity-log) au montage, sur l'événement `gearbox-activity-updated` (window) et `RT_EVENTS.activity` ; `loadChatUnread` sur `gearbox-chat-unread-updated` (source `chatStore.getUnreadTotal`) ; défis de jeux sur `RT_EVENTS.games` (plus de polling).
- [ ] Erreurs de chargement de la cloche ignorées (best-effort), vide affiché.

## 8. États vides et erreurs

- [ ] Chargement initial : « INITIALISATION… ».
- [ ] Cloche vide : « Aucune activité récente. »
- [ ] Défis de jeux : en cas d'échec réseau, la valeur précédente est gardée ; hors droit, compteur remis à 0.
- [ ] Aucune bannière hors-ligne globale ni toast global dans la coque.

## 9. Règles métier touchées

- [ ] Rôles cloisonnés : chef de site = liste fermée de rubriques + `settings`, sans cloche ni présence (`hasSocialFeatures`, `constants.ts:728`), sans Archives.
- [ ] Jeux : `canSeeGames` ; Director exclu.
- [ ] Export : Master/Administrator/Director/Coordinator (liste dupliquée entre `Sidebar.tsx:203`, `Export.tsx:8`).
- [ ] Congés : périmètre + rôles de gestion.
- [ ] Aucune règle budgétaire dans la coque.

## 10. Mobile

- [ ] < md : pas de barre latérale ; barre du bas de 64 px (`main` porte `pb-16`) ; feuille « Plus » (z-60) avec cloche, thème, déconnexion. `md` : icônes seules 80 px de large. `lg+` : nav groupée 224 px.
- [ ] Présence sur mobile : 12 px dans la barre, 14 px dans la feuille « Plus ».
- [ ] Les panneaux `FloatingPanel` réservent 64 px en bas sous 768 px.

## 11. Défauts et bizarreries relevés

- [ ] La nav groupée desktop est écrite en dur (le code lui-même le signale, `Sidebar.tsx:334-337`) : une rubrique ajoutée à `allMainItems` seulement n'apparaît pas sur desktop ; seul le filtrage `idsAutorises` dérive de `mainItems`. Congés est listé en dur même s'il est filtré ensuite.
- [ ] Le bouton « Actualités » de la feuille « Plus » mobile n'est pas conditionné par `showSocial` ni `isExternal` (`Sidebar.tsx:739-751`) : un chef de site ou un External peut ouvrir un fil dont la route répond 403 (le desktop le masque).
- [ ] Feuille « Plus » d'un chef de site : `moreNavItems` inclut « Projets Archivés » sans filtre chef de site (`:274-277`) ; la garde `App.tsx` le renvoie sur Dashboard.
- [ ] Le mobile ne propose pas Archives sous le libellé « Archives » mais « Projets Archivés ».
- [ ] `canExport` en dur dans la Sidebar en plus de `EXPORT_ALLOWED_ROLES` : deux sources.
- [ ] `EXTERNAL_ALLOWED_TABS` (`App.tsx:80`, inclut `settings`) diffère du filtre de menu External (`Sidebar.tsx:232`, sans `settings`, ajouté ailleurs).
- [ ] Racine de l'app en `h-screen` (`App.tsx:138,167`) alors que le CLAUDE.md demande `h-full` pour les racines de pages (la coque est l'exception).
- [ ] Sidebar : dépendances du `useEffect` (`[]`) — `loadGamesChallenges` est appelé une seule fois au montage avec `gamesEnabled` initial (`false`) ; le rafraîchissement dépend ensuite de `RT_EVENTS.games`.
- [ ] `alt` du logo et libellés : « Fil d'actualité » (desktop) vs « Actualités » (mobile) incohérents.
- [ ] Non vérifié : persistance de l'onglet actif en session (commentaire `App.tsx:93`) — `activeTab` est un `useState` simple ici ; à revalider ailleurs.
