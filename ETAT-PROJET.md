# ÉTAT PROJET GEARBOX — synthèse au 29 juillet 2026

> Mémoire de référence sur l'état actuel du projet, à mettre à jour à chaque
> session (comme ETAT-BACKEND.md l'est pour le backend).

## Déploiement
- En ligne : https://gearbox.bonyauto-mobile.com (VPS OVH, vps-58e5eff3.vps.ovh.net,
  51.83.75.181)
- Architecture : 3 conteneurs Docker (api / web / caddy), HTTPS auto via Caddy/Let's
  Encrypt, base Supabase (pas de Postgres local)
- Repo GitHub privé : MarketBony/gearbox — clone sur VPS via deploy key SSH dédiée
  (lecture seule)
- master = prod, synchronisés. Dernier lot **fonctionnel** déployé : `33107c4`
  (Merge feat/realtime-modules, 29 juillet). Des commits de doc ou de backup
  automatique peuvent suivre sans nécessiter de redéploiement.
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

10. **Dépenses ponctuelles branchées, rubrique créée** (`feat/expenses-branchement`,
    29 juillet). `pages/Expenses.tsx` existait mais n'était **routée nulle part** :
    code mort inatteignable, alors que la route `/api/expenses` et le modèle
    Prisma `OneOffExpense` existaient déjà et fonctionnaient. C'était le dernier
    module de données encore sur localStorage.
    - `types.ts` : ajout de `OneOffExpense` (aligné sur le modèle Prisma) et
      **suppression** de l'ancienne interface `Expense` (name/category/parentId,
      ère localStorage) — forme divergente, plus aucun code ne l'utilisait.
    - `dataService.ts` : `getExpenses` bascule sur `/api/expenses` + ajout de
      `createExpense`/`updateExpense`/`deleteExpense`, avec normalisation de date
      (`normalizeOneOffExpense`). Suppression de `saveExpenses` (localStorage).
    - La page ne fabrique plus d'id `temp-...` : POST pour créer, PUT pour
      modifier, l'id vient de la base. Date envoyée en `yyyy-MM-dd` sans
      conversion ISO, qui décalait d'un fuseau une date sans heure.
    - Routage : `case 'expenses'` dans `App.tsx` + entrée « Dépenses Ponctuelles »
      dans le groupe OUTILS de la Sidebar (icône CreditCard), visible partout sauf
      pour les comptes External. Droits inchangés : tout utilisateur authentifié
      peut saisir (`routes/expenses.ts` ne pose pas de `requireRole`).
    - **Agrégation budgétaire** : les dépenses ponctuelles comptent désormais dans
      le consommé de `Budget.tsx` (bloc « 4bis ») et de `Dashboard.tsx` (bloc
      « 3ter »), sur le même motif que les dépenses fixes mais en plus simple
      (un seul site à 100 %, pas de marque donc pas de routage bucket
      Alpine/Nissan, pas d'`isAnnual`). Le garde `if (!siteStats[targetSite])`
      écarte au passage les dépenses saisies sur 'GROUPE BONY' ou une plaque —
      conforme à la règle « Groupe/Holding ne remonte jamais dans le budget ».
    - Vérifié en base réelle : dépense de 1 234 € (Clermont/VN) → consommé
      Dashboard 185 184 → 186 418 €, ligne Clermont du Budget 10 493 → 9 259 € à
      la suppression, et colonne VN seule impactée (−1 234). Les deux écrans se
      sont mis à jour **sans rechargement** (temps réel). Donnée de test supprimée.

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
  les utilitaires Tailwind standards

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
