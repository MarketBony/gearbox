# Inventaire fonctionnel — Hello Marketing

Sources : `pages/HelloMarketing.tsx` (tout est dans ce fichier), `components/Avatar`, `components/DateRangePicker` (`parseLocalDate`), `App.tsx`, `Sidebar.tsx`, `constants.ts`, `backend/src/routes/{feeds,music,users,projects}.ts`, `pages/Settings.tsx` (ville météo).
Rubrique de LECTURE : aucun formulaire ni écriture serveur. Page d'accueil « ambiance » : météo, musique, viennoiseries, anniversaires, prochains événements, deux fils d'actus.

## 1. Accès et rôles
- [ ] Rubrique `hello-marketing`, libellé « Hello Marketing », icône Sparkles, PREMIÈRE entrée du menu (`Sidebar.tsx:210`, `App.tsx:146`). Visible de tous les rôles.
- [ ] External : rubrique autorisée (`EXTERNAL_ALLOWED_TABS`, `App.tsx:80` ; menu `Sidebar.tsx:232`). Il voit TOUS les blocs (`hasSocialFeatures` vrai pour lui).
- [ ] Chef de site : rubrique dans `SITE_MANAGER_SECTIONS` (`constants.ts:720`). Il perd les blocs « rituels d'équipe » : Musique du Jour, Viennoiseries, Anniversaires (`blocsEquipe = hasSocialFeatures(role)`, `:1207`, appliqué `:1259` et `:1272`). Il garde Météo, Prévisions, Prochains Événements et les deux fils d'actus.
- [ ] Aucune liste d'écriture : lecture seule pour tous. Guest : aucune restriction particulière trouvée.
- [ ] Cloisonnement serveur : `Prochains Événements` appelle `GET /projects`, filtré par `scopeOf` pour le chef de site (`projects.ts:20-34`). `GET /users` renvoie SEULEMENT le compte du chef de site (`users.ts:38-42`, `hasSocialFeatures`) — les blocs qui listent les utilisateurs lui sont de toute façon masqués.
- [ ] Routes `GET /feeds`, `GET /feeds/:key`, `GET /music/tracks` : `authenticateToken` seul, pas de rôle ni de périmètre (`feeds.ts:69,81`, `music.ts:28`).
- [ ] Le client fabrique : sélection de la piste du jour (`jour de l'année % nb pistes`), désignation des viennoiseries (déterministe), calcul des anniversaires et des compteurs J-.

## 2. Structure
- [ ] Une seule page, pas d'onglets, aucun état de session (`useSessionState` non utilisé). Défilement vertical (`h-full overflow-y-auto`, `pb-20`).
- [ ] En-tête : icône Sparkles + titre « Hello Marketing » + date du jour (`weekday jour mois année`, 1re lettre majuscule) (`:1218-1229`).
- [ ] Zone haute : grille 1 col (mobile) / 2 cols (`md`) « 2×2 », `items-stretch` :
  - haut gauche : Météo du jour ; haut droite : Prévisions 5 jours ;
  - bas gauche (si `blocsEquipe`) : Musique du Jour (hauteur fixe h-40) au-dessus de Viennoiseries de la semaine ;
  - bas droite : Anniversaires (si `blocsEquipe`, h-48) au-dessus de Prochains Événements.
- [ ] Zone basse : grille 1 col / 2 cols (`lg`) : « Actu Auto » (`NewsSection`) et « Marketing & Tech » (`MarketingNewsSection`).
- [ ] Persistance localStorage (pas de sessionStorage) : caches `gearbox_rss_cache` (vidé à chaque montage, cf. §11), `gearbox_rss_marketing_cache`, `gearbox_deezer_cache`, `gearbox_weather_cache_<ville>`, `gearbox_forecast_cache_<ville>`, préférence ville `gearbox_user_prefs_<userId>` (lue ici, écrite dans Settings).

## 3. Filtres et sélecteurs
aucun (aucun filtre, tri ou recherche proposés à l'utilisateur).
- [ ] Seul « réglage » indirect : la ville de référence météo, choisie dans Paramètres (`Settings.tsx:628` « Ville de référence (météo) », clé `gearbox_user_prefs_<id>`, propre à ce navigateur). Défaut `Clermont-Ferrand` (`:70`) ; la valeur passe par `CITY_MAPPING` (`:23-50`) qui traduit les sites Bony vers un nom OpenWeather (ex. Clermont/Mozac/Massagettes/Alpine/Nissan → Clermont-Ferrand ; Ricoux/Thiers → Thiers ; Villefranche → Villefranche-de-Rouergue ; Montluçon → Montlucon ; liste complète : Vichy, Moulins, Ussel, Issoire, Brioude, Le Puy-en-Velay, Mende, Albi, Rodez, Millau, Aurillac, Figeac, Gaillac, Carmaux, Lavaur, Ambert, Saint-Etienne). Ville absente du mapping = utilisée telle quelle.

## 4. Affichage
- [ ] **Météo du jour** (`WeatherTodayCard`, `:630`) : carte dégradé selon icône OpenWeather (`getWeatherBg` : 01 ciel/bleu, 02, 03, 04 gris, 09/10 bleus pluie, 11 orage violet, 13 neige, 50 brume ; défaut bleu) ; ville (`d.name`), date « Jour J mois », température `N°` arrondie, icône `wn/<icon>@2x`, description (capitalize), « Ressenti N° ». Bouton rafraîchir (title « Rafraîchir »). Données aussi calculées mais NON affichées : humidité, vent (km/h), pression.
- [ ] **Prévisions 5 jours** (`:677`) : titre « Prévisions 5 jours » ; par jour : jour abrégé fr (majuscule, point retiré), icône de la mesure de midi (12:00:00 sinon élément central), max en gras, min en clair (`N°`). Jours strictement après aujourd'hui (comparaison sur `toISOString` UTC), 5 max. Bloc entièrement masqué si liste vide.
- [ ] **Musique du Jour** (`:706`, chef de site exclu) : pochette 72 px, titre, artiste, lecteur d'extrait (bouton lecture/pause, barre de progression cliquable via `input range`, temps `m:ss` courant / durée, durée par défaut 30 s). Sans extrait : « Aperçu non disponible. » Piste = `tracks[jourDeLAnnée % tracks.length]`.
- [ ] **Anniversaires** (`:826`, chef de site exclu) : pour chaque utilisateur ayant `birthdate` : avatar 36 px, PRÉNOM seul (`name.split(' ')[0]`), `N ans` (âge à la prochaine échéance), « dans Nj » / « demain » / « Auj. ! » (rose, pulsant) + pastille gâteau sur l'avatar si aujourd'hui. Tri par `daysUntil` croissant, défilement horizontal, cartes 72 px min.
- [ ] **Prochains Événements** (`:921`) : jusqu'à 3 projets ; compteur `J-N` + « jours » (ou « Auj. » si 0), nom (tronqué), pastille type (couleurs `EVENT_TYPE_COLORS` : Expo/Salon orange, Animation Co bleu, OP Clients émeraude, Collaborateurs violet ; gris sinon), site (icône MapPin), date de début « J mois » (1re lettre majuscule). Tri par `startDate` croissante. Compteur rafraîchi toutes les 60 s.
- [ ] **Viennoiseries de la semaine** (`:1056`, chef de site exclu) : emoji 🥐, titre « Viennoiseries de la semaine », accroche (`ACCROCHE_LIST[semaine % 4]` : « Et c'est... », « Le grand gagnant est... », « Roulement de tambour... », « Cette semaine le bonheur c'est... »), avatar 96 px (animation bounce 1 s à l'apparition), nom, rôle en orange, badge (`BADGE_LIST[semaine % 4]` : « Champion du croissant 🏆 », « Roi de la brioche 👑 », « Maître des pains au chocolat 🎖️ », « Légende du bureau 🌟 »). Pied : « Semaine N · Change le <prochain lundi> » et bouton « 4 sem. précédentes » ouvrant un menu « Historique » (avatar 22 px, nom, `S<n>`).
  - Désigné = `eligible[(année*100 + semaineISO) mod nbEligibles]` avec éligibles = utilisateurs de rôle Master, Administrator, Coordinator, Digital Manager (`VIENNOISERIES_ROLES`, `:1023`), dans l'ordre renvoyé par `/users`.
- [ ] **Actu Auto** et **Marketing & Tech** (`:224`, `:378`) : titre (icônes Car orange / Lightbulb violet), « Mis à jour à HH:MM », bouton rafraîchir (title « Rafraîchir », désactivé pendant le chargement). Grille 1/2/3 colonnes (`sm`, `lg`) de cartes-lien (nouvel onglet, `noopener noreferrer`) : vignette 140 px (image du flux ; repli dégradé + initiale de la source), badge source en majuscules coloré (couleur fournie par l'API, gris `bg-slate-600` par défaut), titre (2 lignes), description (nettoyée du HTML, 180 car., 2 lignes), date relative (« à l'instant », « il y a N min », « il y a Nh », « hier », « il y a Nj », puis « J mois »), lien « Voir » au survol. 12 articles max, tri par `pubDate` décroissante (sans date = fin).
  - Sources (serveur, `feeds.ts:29-45`) — auto : AutoPlus, AutoMoto, Caradisiac, Autoactu ; marketing : BDM, JDN, Influencia, Usine Digitale. Filtrage par `category` (`auto` / `marketing`).

## 5. Formulaires
aucun

## 6. Actions
- [ ] Rafraîchir la météo (force, ignore le cache 30 min) ; rafraîchir chaque fil d'actus (force, ignore le cache 24 h).
- [ ] Musique : lecture/pause, déplacement dans la barre (seek).
- [ ] Viennoiseries : ouvrir/fermer l'historique (fermeture au clic extérieur).
- [ ] Ouvrir un article dans un nouvel onglet.
- [ ] Aucune navigation vers un projet depuis « Prochains Événements » (éléments non cliquables). Pas de création/suppression/export.

## 7. Temps réel et chargement
- [ ] `RT_EVENTS.users` : Anniversaires (`:867`) et Viennoiseries (recalcul de la désignation) rechargent leur liste.
- [ ] `RT_EVENTS.projects` : Prochains Événements recharge (`:951`).
- [ ] Aucun temps réel pour météo, musique, actus.
- [ ] Chargements indépendants par bloc (`Spinner` avec libellé : « Chargement météo... » dans les deux emplacements météo, « Chargement des flux RSS... » pour les fils ; spinner sans texte ailleurs).
- [ ] Caches : météo et prévisions 30 min par ville (`localStorage`) ; musique 24 h ; actus marketing 24 h ; actus auto 24 h en théorie mais purgées au montage (donc rechargées à chaque visite). Serveur : cache mémoire 15 min par flux (`feeds.ts`).
- [ ] Météo : appels directs du navigateur à `api.openweathermap.org` (`weather` + `forecast`, `units=metric`, `lang=fr`), clé en dur dans le client (`:20`). Vent converti m/s → km/h.
- [ ] Musique : `db.getMusicTracks()` → `/music/tracks` (proxy Deezer, l'id de playlist est côté serveur).

## 8. États vides et erreurs
- [ ] Météo en échec ou absente : carte « `<message d'erreur>` » en rouge, sinon « Données météo indisponibles. » ; message d'erreur type « Météo indisponible (<code>) — <ville> » ou « Erreur météo. ». Prévisions : bloc absent.
- [ ] Musique : « Impossible de charger la musique du jour. » (rouge) ; internes : « Impossible de joindre l'API Deezer. », « Playlist vide. » ; « Aperçu non disponible. ».
- [ ] Anniversaires vides : « Aucun anniversaire renseigné. » (icône gâteau).
- [ ] Prochains Événements vides : « Aucun événement à venir. » + « Créez un projet pour commencer. » (le second texte s'affiche aussi à un rôle en lecture seule).
- [ ] Viennoiseries : « Aucun utilisateur éligible. » (à noter : si `eligible` est vide, `designated` reste `null`).
- [ ] Fils d'actus : « Aucun article disponible. » (icône nuage) ; échec d'un flux = ignoré (`console.warn`), les autres s'affichent ; liste de sources indisponible = badges gris.
- [ ] 403 : non géré spécifiquement ; les `catch` avalent les erreurs. `getUsers`/`getProjects` sans try/catch dans Anniversaires/Événements/Viennoiseries (rejet non géré, `loading` reste vrai → spinner permanent).

## 9. Règles métier touchées
- [ ] Brouillon : `Prochains Événements` INCLUT volontairement `Draft` (`status Active || Draft`, `:934`) — dérogation explicitement listée dans CLAUDE.md (« prochains événements de Hello Marketing »). Ne pas « corriger ».
- [ ] Filtre événements : `projectType` dans `['Expo/Salon','Animation Co','OP Clients','Collaborateurs']` (`EVENT_PROJECT_TYPES`, `:912`) ET `startDate` ≥ aujourd'hui (minuit local). `Archived` et `Completed`-like exclus (seuls Active/Draft passent).
- [ ] Holding, Alpine/Nissan, curseurs de répartition, GROUPE BONY : sans objet (aucun montant, aucune ventilation). Un projet Holding apparaît normalement.
- [ ] Rôles cloisonnés : voir §1 (blocs équipe masqués au chef de site, projets filtrés par site côté serveur).
- [ ] Anniversaires : date lue via `parseLocalDate` (jamais `new Date('YYYY-MM-DD')`, décalage UTC) — à conserver.

## 10. Mobile
- [ ] Grilles à 1 colonne sous `md` (haute) et sous `lg` (basse) ; actus 1 col → 2 (`sm`) → 3 (`lg`).
- [ ] Marges `px-4` / `px-5` → `md:px-8`, titre `text-2xl` → `md:text-3xl`. Aucun composant spécifique mobile. Rubrique « Plus » de la barre du bas (hors `MOBILE_BAR_IDS` : dashboard, projects, todo, agenda, chat) — sauf External, pour qui elle est dans la barre (repli `Sidebar.tsx:255-262`).

## 11. Défauts et bizarreries relevés
- [ ] Clé API OpenWeather écrite en clair dans le code client (`:20`) ; à traiter en v2 (proxy serveur) — signaler, ne pas recopier.
- [ ] Violation de l'ordre des hooks : `if (!user) return null` (`:1208`) est placé AVANT `useWeatherData(user.id)` (`:1210`) — inoffensif tant que `user` est toujours défini sous la garde d'`App.tsx`.
- [ ] `NewsSection` supprime son propre cache 24 h à chaque montage (`removeItem`, ~`:316`) : le cache « auto » ne sert jamais, contrairement à « marketing ». Incohérence entre les deux fils.
- [ ] Code dupliqué : `NewsSection` et `MarketingNewsSection` sont deux copies (seules couleurs/catégorie/clé de cache changent).
- [ ] Cache météo par nom de ville mappé (partagé entre utilisateurs du même poste). La ville de référence est stockée en localStorage : elle ne suit pas le compte d'un poste à l'autre.
- [ ] Météo : humidité, vent, pression récupérés mais jamais affichés (champs morts). `Prévisions` : comparaison `todayKey` en UTC, décalage possible autour de minuit ; le texte des jours fourni par OWM est en heure UTC.
- [ ] Historique des viennoiseries : `w += 52` quand semaine ≤ 0 (les années à 53 semaines ne sont pas gérées) ; désignation dépendante de l'ordre de `/users` et de la liste des éligibles (elle change si un compte est ajouté/retiré).
- [ ] Prochains Événements : `new Date(project.startDate + 'T12:00:00')` (`:1000`) suppose `startDate` au format `YYYY-MM-DD` ; le calcul `computeDays` utilise `new Date(startDate)` (UTC pour ce format).
- [ ] External : voit les Prochains Événements issus de `GET /projects` non cloisonné (aucun `scopeOf` limitant les External) et la liste complète des utilisateurs (anniversaires). À vérifier côté serveur avant portage.
- [ ] « Créez un projet pour commencer. » affiché même à un rôle qui ne peut pas créer de projet.
- [ ] Non vérifié : renvois aux fiches du 29/09 de `BUGS-CONNUS.md` (non consultées).
