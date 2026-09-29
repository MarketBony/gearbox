# Inventaire — Réglages (« Paramètres du Compte »)

Source principale : `pages/Settings.tsx` (966 l.). Composants liés : `components/NotificationsToggle.tsx`, `components/GamesToggle.tsx`, `components/InstallAppModal.tsx`, `components/Avatar.tsx`, `services/appSettings.ts`, `contexts/AuthContext.tsx`.

## 1. Accès et rôles

- [ ] Rubrique `settings` accessible à **tous les rôles** connectés : entrée engrenage en bas de la barre latérale (`components/Sidebar.tsx:502-507`, tablette `:567`), et « Paramètres » dans le menu « Plus » mobile (`Sidebar.tsx:276`, aussi pour External `:272`).
- [ ] External : `settings` est dans `EXTERNAL_ALLOWED_TABS` (`App.tsx:80`), donc profil, photo, anniversaire, mot de passe, Application, Stockage OK ; pas de gestion des comptes.
- [ ] Chef de site (`Site Manager`) : `settings` autorisé en plus des 6 rubriques (`App.tsx:102`) ; il voit profil, Application, Stockage. Pas de gestion des comptes.
- [ ] `canManageUsers` = Master, Administrator, Director (`Settings.tsx:434`), aligné sur `ADMIN_ROLES` de `backend/src/routes/users.ts:16` (POST `/`, PUT `/:id`).
- [ ] `canDeleteUsers` = Master, Administrator (`Settings.tsx:438`), aligné sur `USER_DELETE_ROLES` (`backend/src/auth/roles.ts`, route DELETE `users.ts:121`). Director : pas de corbeille.
- [ ] Rôles attribuables par un Director (`DIRECTOR_ASSIGNABLE`, `Settings.tsx:443`) : Coordinator, Digital Manager, Guest, External. `Site Manager` absent (réservé Master/Administrator, `:444-446`). Master/Administrator : `TOUS_LES_ROLES` = Master, Administrator, Director, Coordinator, Digital Manager, Guest, External, Site Manager (`:447`).
- [ ] `roleOptions(roleActuel)` réinjecte le rôle en place s'il n'est pas attribuable (`:453-457`) pour ne pas afficher un sélecteur vide.
- [ ] Interrupteur Jeux : Master seul (`Settings.tsx:713`) ; refus réel côté serveur `PUT /api/settings/games`.
- [ ] Le compte `Master` n'a jamais de bouton supprimer (`:905`).
- [ ] Le client ne fabrique rien de sensible ; garde-fous réels = serveur (`canAssignRole` sur PUT `/api/users/:id`, `users.ts:87`).

## 2. Structure

Page unique en défilement (pas d'onglets, aucune persistance `useSessionState`) ; blocs empilés, `max-w-4xl` sauf gestion des comptes `max-w-6xl` :

- [ ] Titre « Paramètres du Compte » (`:583`).
- [ ] Bloc 1 — profil (Identité + Sécurité) (`:587`).
- [ ] Bloc 1bis — « Application » : installation PWA, notifications, interrupteur Jeux (Master) (`:685`).
- [ ] Bloc 1ter — « Stockage » (`StorageSection`, `:722`), visible de tous.
- [ ] Bloc 2 — « Gestion des Utilisateurs (Master/Admin) » (si `canManageUsers`, `:725`).
- [ ] Modales : installation (`:922`), photo de profil propre (`:940`), photo d'un autre compte (`:950`).
- [ ] Seule persistance locale : préférence `gearbox_user_prefs_<userId>` = `{ city }` (`:390-403`).

## 3. Filtres et sélecteurs

Aucun filtre. Sélecteurs de formulaire :

- [ ] « Ville de référence (météo) » : liste simple `SITES` (constants.ts) précédée de « — Sélectionner une ville — » (valeur vide) (`:630-635`). Défaut : valeur du localStorage. Alimente la météo de Hello Marketing.
- [ ] « Rang » (tableau) : liste simple, options = `roleOptions` (voir §1) (`:772-777`, `:824-829`).
- [ ] « Ville » (tableau) : simple, `SITES` précédée de « — » (`:786-791`, `:838-843`).
- [ ] « Concessions rattachées » (`SitesPicker`) : MULTIPLE, boutons à bascule sur `SITES`, visible si `isSiteManager(role)` (`:357-388`, `:778`, `:830`).
- [ ] Champ « Date de naissance » : `DatePicker`.

## 4. Affichage

- [ ] Carte profil : avatar 80 px cliquable (survol : icône appareil photo), nom, `RoleBadge`, « ID: <loginId> », lien souligné « Changer la photo de profil » (`:590-615`).
- [ ] `RoleBadge` couleurs : Master violet, Administrator bleu, Director teal, Digital Manager violet clair, Guest gris, External cyan, tout autre (Coordinator, Site Manager) émeraude (`:230-247`).
- [ ] Application : texte « Installe Gearbox comme une application… », sous-texte « Aucun fichier à télécharger, aucun store. » ; bouton « Installer l'application » (`:690-702`).
- [ ] Stockage (`:268-344`) : « Fichiers envoyés dans Gearbox : <taille> » ; « <libre> libres » ; barre du disque (pct = utilisé/total ; rouge ≥ 90 %, ambre ≥ 75 %, sinon orange) ; phrase « Le disque du serveur est utilisé à X % (… sur …). Il est partagé avec le système, ce n'est pas un quota propre à Gearbox. » ; lignes par type : « Chat (pièces jointes) », « Photos de profil », « Digital (médias) » (type inconnu = clé brute) avec « · N fichier(s) » et taille ; note de ménage automatique (médias Digital archivés 30 jours, pièces jointes chat 180 jours, photos jamais). Format octets : `o`, `Ko`, `Mo` (1 décimale < 10 Mo), `Go` (`:254-260`).
- [ ] Tableau des comptes (min 760 px, scroll horizontal) : colonnes (photo), Nom, ID Connexion, Rang (badge), Ville (icône repère, « — » si vide, valeur du **localStorage du poste**), Anniversaire (jour + mois court fr-FR via `parseLocalDate`, « — » si vide), Mot de passe (« •••••• »), Actions (`:746-757`, `:861-912`). Ordre = ordre renvoyé par `GET /api/users`, pas de tri.
- [ ] Actions par ligne visibles au survol en desktop (`md:opacity-0 md:group-hover:opacity-100`), toujours visibles en mobile (`:896`).

## 5. Formulaires

Profil (`handleUpdateProfile`, `:486-513`) :
- [ ] « Nom affiché » — texte, non validé vide côté client.
- [ ] « Ville de référence (météo) » — local uniquement.
- [ ] « Date de naissance » — `DatePicker`, part au serveur (`birthdate`, chaîne vide = effacer).
- [ ] « Ancien mot de passe » (placeholder « Requis pour changer »), « Nouveau mot de passe », « Confirmer » — si l'un des deux premiers est rempli : erreur « Les nouveaux mots de passe ne correspondent pas. » ; « Le mot de passe est trop court. » si < 4 caractères. L'ancien mot de passe n'est PAS envoyé ni vérifié (voir §11).
- [ ] Bouton « Enregistrer mon profil » → `updateProfile` → `PUT /api/auth/me` (name, avatarColor, birthdate, password si saisi) ; succès « Profil mis à jour avec succès. », échec « Échec de la mise à jour (serveur injoignable ?). » ; vide les 3 champs mot de passe.

Photo (`AvatarUploadModal`, `:53-227`) :
- [ ] Titre « Photo de profil » + nom ; zone « Glisser une photo ici / ou cliquer pour parcourir / jpg, png, gif, webp — max 5 Mo » ; contrôle format (« Format non supporté. Utilisez jpg, png, gif ou webp. ») et taille (« Fichier trop lourd (max 5 Mo). »).
- [ ] Recadrage rond 1:1, curseur de zoom 1 à 3 (pas 0,05), lien « Choisir une autre photo ». Sortie 200x200 JPEG 0,88 → `db.uploadFile('avatar', file)` (POST `/api/uploads/avatar`) → `onSave(url)`.
- [ ] Boutons : « Valider » (si image choisie), « Supprimer la photo » (si photo existante), « Annuler » (si rien choisi et pas de photo). Erreurs : message `ApiError` ou « Erreur lors de l'enregistrement. Réessayez. » / « Échec de la suppression. ».
- [ ] Profil propre : `setAvatarPhoto(url)` (PUT `/me` `avatarUrl`). Autre compte : `db.setUserAvatar` + `setAvatarUrl` + événement `gearbox-avatar-updated`.

Création / édition de compte (ligne inline, `saveUser`, `:524-559`) :
- [ ] Nom (placeholder « Nom complet »), ID Connexion (« ID »), Rang, Ville (local), Anniversaire, Mot de passe (placeholder « Mot de passe » en création, « Laisser vide si inchangé » en édition).
- [ ] Obligatoires : nom, loginId, rôle (sinon `saveUser` ne fait rien, sans message) (`:525`).
- [ ] Défauts à la création : rôle `Coordinator`, mot de passe `admin` (`:732`, et `|| 'admin'` `:534`).
- [ ] `avatarColor` aléatoire à la création (`:536`). `sites` envoyé (`[]` par défaut), revalidé serveur.
- [ ] Dépendance : `SitesPicker` seulement si rôle = Site Manager ; message rouge « Aucune concession : ce compte ne verra aucune donnée. » si aucune cochée.
- [ ] Boutons valider (coche) / annuler (croix). Erreur affichée en bandeau rouge (`userMgmtError`) : message de l'API ou « Échec de l'enregistrement (serveur injoignable ?). ». Serveur : POST `/api/users`, PUT `/api/users/:id`.
- [ ] Journal d'activité : « a créé l'utilisateur » / « a modifié l'utilisateur » / « a supprimé l'utilisateur » (`entity: 'user'`).

## 6. Actions

- [ ] Ouvrir la modale photo (avatar ou lien).
- [ ] Enregistrer le profil.
- [ ] « Installer l'application » → `InstallAppModal` (footer = `NotificationsToggle compact` sous le titre « Notifications »).
- [ ] Notifications : voir états ci-dessous.
- [ ] Interrupteur Jeux (Master).
- [ ] « Nouvel Utilisateur » (bouton avec +) ; éditer (crayon) ; supprimer (corbeille, confirmation navigateur `confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')`) ; changer la photo d'un compte (clic sur l'avatar de la ligne).
- [ ] `NotificationsToggle` (`components/NotificationsToggle.tsx`) : état `unsupported` (« Ce navigateur ne gère pas les notifications. Chrome, Edge ou Safari les acceptent. ») ; `ios-needs-install` (message ambre : ajouter Gearbox à l'écran d'accueil) ; `denied` (message ambre : cadenas ou ⓘ → Notifications → Autoriser) ; `granted` (« Notifications activées » + lien « Ne plus recevoir de notifications sur cet appareil » / « Désactivation… ») ; `default` (bouton « Activer les notifications » / « Activation… » + texte « Reçois les messages du chat sur cet appareil… mise en sourdine depuis la rubrique Chat »). Le clic est obligatoire (iOS).
- [ ] `GamesToggle` : ligne « Espace détente » + « · visible de l'équipe » / « · masqué pour tous », interrupteur (`role="switch"`, aria-label « Afficher la rubrique Jeux », title « Masquer / Afficher la rubrique Jeux »). Appelle `db.setGamesEnabled(!actuel)` puis `appSettingsStore.set`. Erreur : message ou « Échec de la modification. ».
- [ ] `InstallAppModal` : titre « Installer Gearbox », « Choisis ton appareil » ; si installée « Déjà installée » ; 3 cartes repliables : « Gearbox pour Windows » (Chrome ou Edge — fonctionne aussi sur Mac), « Gearbox pour Android » (Chrome, Edge, Samsung Internet), « Gearbox pour iOS » (iPhone et iPad — via le menu Partager) ; bouton « Installer maintenant » quand l'invite native est disponible ; message Firefox desktop ; « Installation annulée. Tu peux relancer quand tu veux. » (`components/InstallAppModal.tsx:137-288`).

## 7. Temps réel et chargement

- [ ] `useRealtimeSync(RT_EVENTS.users)` recharge la liste des comptes uniquement si `canManageUsers` (`:472`).
- [ ] `loadAllUsers` (GET `/api/users`) au montage / changement d'`user` si `canManageUsers` (`:459-467`).
- [ ] Stockage : `db.getStorage()` (GET `/api/storage`) au montage ; « Calcul en cours… » pendant le chargement.
- [ ] `GamesToggle` : `useAppSettings` suit la bascule en temps réel (RT_EVENTS.settings écouté dans `App.tsx:51`) ; l'auteur est exclu de la diffusion, mise à jour locale explicite.
- [ ] Événement `gearbox-avatar-updated` écouté par `Avatar.tsx:32` pour rafraîchir les photos.

## 8. États vides et erreurs

- [ ] Stockage injoignable : « Impossible de lire l'espace disque (serveur injoignable ?). »
- [ ] Liste des comptes : « Impossible de charger les utilisateurs. » (ou message `ApiError`, ex. 403/400) ; pas de texte d'état vide pour un tableau vide.
- [ ] Validation mot de passe / profil / photo : voir §5.
- [ ] Rendu `null` si pas d'utilisateur (`:574`).

## 9. Règles métier touchées

- [ ] Rôles cloisonnés : création d'un `Site Manager` réservée Master/Administrator ; `sites[]` transmis, revalidé serveur (`cleanSites`).
- [ ] Jeux : `canSeeGames` (rôles Master, Administrator, Coordinator, Digital Manager + interrupteur) ; l'interrupteur ne fait que piloter.
- [ ] Ville (météo) : donnée locale au poste, non partagée.
- [ ] Anniversaire : champ du modèle `User` (serveur), plus du localStorage (depuis le 04/08/2026).
- [ ] Aucune règle budgétaire (Holding, Draft, Alpine/Nissan) ici.

## 10. Mobile

- [ ] `p-3 md:p-8` ; grille profil 1 colonne < md, 2 colonnes dès md ; Nouveau/Confirmer mot de passe 2 colonnes dès `sm`.
- [ ] Application : bouton empilé sous le texte < sm.
- [ ] Tableau des comptes : `min-w-[760px]` avec défilement horizontal ; boutons d'action toujours visibles.
- [ ] Accès via « Plus » → « Paramètres » (pas d'engrenage dans la barre du bas).

## 11. Défauts et bizarreries relevés

- [ ] **Ancien mot de passe jamais vérifié ni envoyé** : le champ « Requis pour changer » n'est pas requis (`Settings.tsx:490-501`, `AuthContext.tsx:103-115`, `routes/auth.ts:114` hash directement). Un seul champ rempli déclenche la validation mais seul le nouveau part.
- [ ] Soumission vide silencieuse pour nom/ID/rôle manquants lors de la création (`:525`).
- [ ] Ville des comptes affichée depuis le localStorage du poste de l'admin : vide pour tout compte jamais édité depuis ce poste.
- [ ] Mot de passe par défaut `admin` en création et affiché en clair à la saisie (input texte, `:797`).
- [ ] Un Director qui enregistre la fiche d'un compte dont le rôle n'est pas attribuable (ex. Administrator) : le sélecteur le conserve (`:449-452`) mais `canAssignRole` côté serveur (`users.ts:87`) rejette peut-être en 403 ; non vérifié dans `roles.ts`.
- [ ] Alignements de listes de rôles recopiés en dur (`DIRECTOR_ASSIGNABLE`, `TOUS_LES_ROLES`) : risque de divergence avec `backend/src/auth/roles.ts`.
- [ ] `hasExistingPhoto` lit aussi le localStorage legacy (`:63`).
- [ ] Le titre du bloc « Gestion des Utilisateurs (Master/Admin) » ne mentionne pas Director alors qu'il y a accès.
