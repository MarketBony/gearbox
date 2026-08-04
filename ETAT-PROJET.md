# ÉTAT PROJET GEARBOX — synthèse au 4 août 2026

> Mémoire de référence sur l'état actuel du projet, à mettre à jour à chaque
> session (comme ETAT-BACKEND.md l'est pour le backend).

## Déploiement
- En ligne : https://gearbox.bonyauto-mobile.com (VPS OVH, vps-58e5eff3.vps.ovh.net,
  51.83.75.181)
- Architecture : 3 conteneurs Docker (api / web / caddy), HTTPS auto via Caddy/Let's
  Encrypt, base Supabase (pas de Postgres local)
- Repo GitHub privé : MarketBony/gearbox — clone sur VPS via deploy key SSH dédiée
  (lecture seule)
- master = prod, synchronisés. Dernier lot déployé : **correctif 26** (page blanche de
  l'écran de connexion + fuite du glitch, 4 août) — `web` **seul**. Le correctif 25
  (KPI de rythme de consommation) est déployé aussi, `web` seul également. Le
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

## Backlog en attente (rien d'urgent, le site fonctionne)
- ~~⚠️ Corriger le KPI « Rythme de consommation »~~ — **fait le 04/08** (correctif 25).
  À retenir : la cause inscrite ici (« le récurrent est engagé d'avance ») était
  **fausse**, ou plus exactement n'était qu'un révélateur — la formule comparait un
  total de fin de période au temps écoulé à ce jour, elle était erronée par
  construction. Il reste un biais structurel assumé de +8 à +12 points, documenté au
  correctif 25.
- **Build local NON représentatif du build déployé** (constaté le 30/07) : Docker
  construit le front avec **node:18-alpine** et un `npm install` (pas `npm ci`),
  alors que le poste de Théo est en **Node 24**. Résultat mesuré sur le même code :
  bundle local **2 012 Ko** contre **1 363 Ko** en production. Le déploiement n'est
  donc pas reproductible à l'identique en local. Sans gravité (la prod fonctionne),
  mais à savoir avant de conclure quoi que ce soit d'une mesure de bundle locale.
  Correctif propre : aligner la version de Node et passer à `npm ci`.
- **4 vulnérabilités npm dans le backend** (1 critique, 2 hautes, 1 basse au
  30/07), toutes **préexistantes** et venant de `bcrypt` (→ `@mapbox/node-pre-gyp`
  → `tar`, `rimraf` → `glob` → `minimatch` → `brace-expansion`), `nodemon` (dev) et
  `express` (→ `body-parser`). `web-push`, ajouté ce jour, n'a **aucune** dépendance
  transitive. La `tar` critique n'est utilisée qu'à l'**installation** de bcrypt,
  pas à l'exécution. `npm audit fix` risquerait de casser bcrypt : à traiter
  explicitement, pas au passage.
- ~~Nettoyage des branches locales mergées~~ — **fait le 30/07** : 27 branches
  supprimées après vérification qu'aucune n'était non mergée. Il ne reste que
  `master`.
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
- ~~Composant `Select` à 34 px~~ — **corrigé le 30/07** (correctif 21) : 44 px sur
  mobile, 34 px conservés à partir de `md`. Un select de 44 px sur ordinateur
  gonflerait les barres de filtres denses (en-têtes de graphiques Campagnes,
  filtres du Dashboard) calibrées autour de 34 px.

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

## Contraintes d'environnement toujours actives
- Réseau bureau bloque les ports sortants 22 (SSH) et 5432/6543 (Postgres/Supabase)
  → hotspot 4G obligatoire pour toute opération VPS ou DB depuis ce poste
