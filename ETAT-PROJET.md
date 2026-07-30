# ÉTAT PROJET GEARBOX — synthèse au 30 juillet 2026

> Mémoire de référence sur l'état actuel du projet, à mettre à jour à chaque
> session (comme ETAT-BACKEND.md l'est pour le backend).

## Déploiement
- En ligne : https://gearbox.bonyauto-mobile.com (VPS OVH, vps-58e5eff3.vps.ovh.net,
  51.83.75.181)
- Architecture : 3 conteneurs Docker (api / web / caddy), HTTPS auto via Caddy/Let's
  Encrypt, base Supabase (pas de Postgres local)
- Repo GitHub privé : MarketBony/gearbox — clone sur VPS via deploy key SSH dédiée
  (lecture seule)
- master = prod, synchronisés. Dernier lot **fonctionnel** déployé : correctif 17
  (`feat/dashboard-pilotage`, 30 juillet — Dashboard). Le correctif 18
  (`feat/campagnes-ergonomie`) est prêt en local, **service `web` seul** à
  reconstruire (aucun changement backend). Le SHA
  exact se lit avec `git log --oneline -1` plutôt que d'être recopié ici, où il
  devenait périmé à chaque lot. Des commits de doc ou de backup automatique
  peuvent suivre sans nécessiter de redéploiement.
- Procédure complète de déploiement à jour dans DEPLOIEMENT.md
- Sauvegardes automatiques : `.github/workflows/backup.yml` pousse un dump Supabase
  dans `backups/` chaque semaine (commits `github-actions[bot]`) — penser à
  `git pull` avant de pousser, le local est vite en retard de quelques commits

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

    ⚠️ **JEU DE DONNÉES DE DÉMO EN BASE** — 10 projets, 28 tâches, 6 dépenses fixes
    et 3 réservations matériel, tous préfixés **`DEMO — `**, créés le 30/07/2026 à
    la demande de Théo pour faire vivre les widgets. **Ces montants comptent dans
    le budget consommé réel** (~72 400 € de coûts projets + 18 700 € de dépenses).
    Ne pas les prendre pour des données de production. Pour les retirer : supprimer
    tous les projets/dépenses/réservations dont le nom, commentaire ou description
    commence par `DEMO — `.

## Backlog en attente (rien d'urgent, le site fonctionne)
- **Catalogue matériel dupliqué en base** : 16 noms uniques mais 32 lignes, chaque
  équipement en double depuis le 8 juillet ~22:07 (double exécution de
  `migrateEquipmentIfNeeded`). Nettoyage délicat — les `EquipmentBooking` pointent
  sur l'un des deux ids via une FK. Voir BUGS-CONNUS.md.
- PWA (manifest.json + service worker) — prévu "juste avant déploiement" dans le
  brief d'origine, jamais fait, toujours pertinent (HTTPS dispo, condition remplie)
- Nettoyage des branches locales déjà mergées (`git branch` en liste une dizaine :
  feat/backend-*, feat/frontend-wire-*, fix/backend-dates-and-errors,
  chore/supabase-safety, chore/versionne-claude-md, feat/realtime-modules)
- Réactions emoji du Chat non accessibles sur mobile (masquées au survol) — laissé
  de côté volontairement lors du lot responsive, nécessite un appui long ou un menu
- Vues Trimestre/Semestre/Année de l'Agenda : pas de vue mobile dédiée (contrairement
  à Semaine/Mois) — les barres Gantt compressent sans déborder, jugé acceptable
- Point technique à garder en tête : Tailwind est chargé en CDN Play → les variantes
  md:/lg: ne fonctionnent pas sur les classes custom (gx-*, glass-*), seulement sur
  les utilitaires Tailwind standards. Deux pièges confirmés le 30/07 sur Campagnes :
  les **valeurs arbitraires contenant `repeat(...)`** ne sont pas générées, et un
  raccourci `p-*` **écrase** un `pt-*` écrit après lui dès qu'il est préfixé `md:`
  (l'ordre des règles générées ne suit pas l'ordre des classes)
- Composant `Select` à 34 px de haut : sous les 44 px tactiles recommandés. Seul
  élément restant sous le seuil sur Campagnes et le Dashboard (mesuré le 30/07)

## Pièges connus qui font perdre du temps (à relire avant de débugger)
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

## Contraintes d'environnement toujours actives
- Réseau bureau bloque les ports sortants 22 (SSH) et 5432/6543 (Postgres/Supabase)
  → hotspot 4G obligatoire pour toute opération VPS ou DB depuis ce poste
