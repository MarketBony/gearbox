# ÉTAT BACKEND — synthèse au 29 juillet 2026

Étape 7 (branchement frontend↔backend) **terminée**. Tous les modules de données **et** la
gestion des fichiers uploadés sont branchés sur le backend Express/Supabase et **vérifiés en
base réelle**. Le frontend ne lit/écrit **plus** `localStorage` pour ces entités.

Migrations Prisma appliquées sur Supabase : `20260706160559_init` + `20260708114830_add_avatar_and_archived_at`.
`tsc --noEmit` backend : 0 erreur. `vite build` frontend : OK.

## ✅ Modules de données branchés (frontend → REST/Socket.IO, vérifiés en base)

1. **Auth** — `/api/auth` login (JWT 24h, bcrypt), GET/PUT `/me` (+ `avatarUrl`).
2. **Projets** — `/api/projects` CRUD (PUT = diff transactionnel des tâches, IDs préservés — Lot F corrigé).
3. **Budget** — `/api/budget` (lignes, upsert par site) + `/api/fixed-expenses` (dépenses fixes).
4. **Utilisateurs** — `/api/users` CRUD, mutations Master/Admin, validation des 7 rôles (+ `avatarUrl`).
5. **Matériel** — `/api/equipment` + `/api/equipment-bookings` (delete cascade FK).
   **Disponibilité contrôlée côté serveur** depuis le 30/07/2026 sur POST et PUT
   (`src/utils/availability.ts`) — voir la section dédiée plus bas.
6. **Campagnes** — `/api/campaigns` CRUD.
7. **Digital / Social** — `/api/social` CRUD ; `mediaFiles` = URLs de fichiers uploadés (voir Uploads).
8. **Journal d'activité** — `/api/activity-log` (GET plafonné 200, POST fire-and-forget, Master non journalisé).
9. **Chat** — `/api/chat` REST (chargement) + Socket.IO temps réel (`chat:message:send/edit/delete/react`,
   `chat:conversation:read`, **`chat:conversation:mute`** → `chat:message:new/updated`,
   `chat:conversation:updated/created`). Chat Général = appartenance implicite
   (seed idempotent, non-External). Un message envoyé déclenche aussi les
   **notifications push** — voir la section dédiée plus bas.
10. **Notifications push** — `/api/push` (clé publique VAPID + abonnements) et
    `PushSubscription`. Voir la section dédiée.

### Curseurs de répartition marque / RDM — `alpineShare` et `nissanShare` (04/08/2026)

Migration `20260804110458_add_nissan_share` : `nissanShare Float?` ajouté sur
`Project` **et** `FixedExpense`, à côté d'`alpineShare` qui existait déjà. Deux
colonnes nullables, purement additives — aucune donnée touchée, `migrate deploy`
après relecture du SQL généré en `--create-only` (ne pas lancer `migrate dev` sur
la base de prod).

Sémantique : **`null` = 100 % sur la marque**, pas 50/50. C'est ce qui permet
d'activer la fonction sans déplacer un euro des données existantes. Tout le calcul
vit côté frontend dans `splitShareToBuckets` (`constants.ts`) ; le backend ne fait
que stocker et valider.

Côté routes, deux comportements distincts à connaître :
- `projects.ts` fait `const { tasks, ...projectData } = req.body` puis passe le
  reste à Prisma → **un nouveau champ transite sans modification de code**, mais
  n'est pas validé non plus.
- `fixedExpenses.ts` **déstructure explicitement** chaque champ → il a fallu
  ajouter `nissanShare` en **trois** endroits : `optionalFieldsError` (validation
  `isFiniteNumber`), le `create` et le `update`. Oublier l'un des trois fait
  disparaître la valeur silencieusement.

Le frontend utilise la couche unique `services/dataService.ts` (`apiFetch` + JWT). Résidus
`localStorage` **assumés et hors périmètre** (pas des données serveur) : overlay client-only chat
(épingle / renommage / membres de groupe), avatars de groupe du chat, prefs UI (ville/anniversaire),
et fallback des anciennes photos de profil base64 (avant bascule uploads).

## 🔒 Disponibilité du matériel — anti sur-réservation (30/07/2026)

`src/utils/availability.ts`, appelé par le POST et le PUT de
`routes/equipmentBookings.ts`. Deux règles indissociables, à ne pas simplifier :

1. **Le besoin se mesure en pic jour par jour, pas en somme des chevauchements.**
   Deux réservations qui croisent la période demandée sans se croiser entre elles
   ne s'additionnent pas. Sommer naïvement refuserait des réservations
   légitimes — vérifié : une demande de 1 sur 01→11, avec 1 unité prise sur
   01→02 et 1 sur 10→11 pour un stock de 2, passe (pic = 1) alors qu'une somme
   donnerait 2 et refuserait. Même règle que `getAvailability()` dans
   `pages/Material.tsx`, volontairement : le serveur est le garde-fou, pas une
   seconde règle divergente.
   Optimisation : seuls les **jours critiques** sont testés (début de la période
   + premier jour de chaque réservation qui y entre), l'utilisation ne pouvant
   monter qu'à ces dates — une réservation d'un an ne coûte pas 365 itérations.

2. **Verrou consultatif transactionnel par matériel**, sinon le contrôle est
   décoratif. `pg_advisory_xact_lock(1, hash32(equipmentId))` en tête de la
   transaction : en isolation Read Committed, deux transactions lisent le même
   état et valident toutes les deux. **Mesuré** sur 6 requêtes simultanées avec
   un stock de 2 : sans le verrou **6 acceptées et 6 unités engagées**
   (sur-réservation de 300 %) ; avec, exactement **2 acceptées, 4 refusées**.
   - Verrou `_xact_` (relâché au commit) et **non** de session : le pooler
     Supabase est en mode transaction (`pgbouncer=true`, port 6543), un verrou de
     session n'y survivrait pas.
   - `$executeRaw` et non `$queryRaw` : la fonction renvoie `void`, que Prisma ne
     sait pas désérialiser (P2010 « Failed to deserialize column of type 'void' »).

Réponses : **409** en cas de dépassement, avec un message reprenant demandé /
disponible / stock — affiché tel quel à l'utilisateur (`alert` dans
`Material.tsx`, qui lit déjà `ApiError.message`, aucun changement frontend requis).
Le POST conserve **400** pour un `equipmentId` inconnu (statut d'avant, quand
c'était la violation de clé étrangère qui le produisait).

Corrigé au passage : un **PUT partiel ne portant que `endDate`** pouvait la placer
avant `startDate`, le contrôle croisé n'existant que dans le POST. La
disponibilité est désormais évaluée sur les valeurs **effectives après fusion**,
et non sur le corps de la requête.

## 🔔 Notifications push (Web Push) — 30/07/2026

`/api/push` (`src/routes/push.ts`) + `src/utils/pushSender.ts`. Fonctionne sur
Windows/Mac (Chrome, Edge), Android, et **iOS 16.4+ mais uniquement si l'app est
ajoutée à l'écran d'accueil** — contrainte d'Apple, pas un choix. Le payload est
chiffré avec les clés de l'abonnement : Apple et Google relaient sans pouvoir lire.

**Modèle `PushSubscription`** : un abonnement appartient à un **navigateur**, pas à
un utilisateur (autant de lignes que d'appareils installés). `endpoint` est
`@unique` — c'est la clé naturelle, un navigateur qui se réabonne renvoie le même
endpoint. Sans cette contrainte, chaque rechargement créerait un doublon et
l'utilisateur recevrait N fois la même notification.

**Routes** : `GET /public-key` (non authentifiée, la clé publique l'est par
nature), `POST /subscribe` (upsert sur `endpoint`, réaffecte le `userId` — un poste
partagé change de titulaire), `DELETE /subscribe` (idempotent).

**Configuration — piège à deux temps.** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et
`VAPID_SUBJECT` doivent être **à la fois** :
1. valorisées dans `~/gearbox/.env` sur le VPS (hors git, permissions `600`) ;
2. **déclarées dans le bloc `environment:` du service `api`** de
   `docker-compose.yml`.
Une variable présente dans le `.env` mais absente de cette liste **n'atteint pas le
conteneur**. `pushSender.ts` trace un avertissement au démarrage si les clés
manquent — sans lui, un push non configuré est indiscernable d'un push qui
n'intéresse personne.

**Qui reçoit quoi** : `resolvePushRecipients()` (dans `pushSender.ts`, extrait pour
être testable) applique trois exclusions à `unreadTargets` — l'émetteur, ceux qui
ont mis la conversation en sourdine (`ChatConversation.mutedBy`), et ceux que
`presence.ts` voit sur la rubrique `chat`. Limite assumée : la présence connaît la
rubrique, pas la conversation ouverte ; quelqu'un dans une autre conversation ne
reçoit pas de push mais voit le compteur non-lu.

**Nettoyage automatique** : un envoi qui répond **404 ou 410** (navigateur
désinstallé, abonnement expiré) supprime la ligne. Sans ça la table se remplit de
fantômes et chaque envoi retente dans le vide. Toute autre erreur est tracée sans
faire échouer l'envoi du message lui-même.

**Sourdine — `chat:conversation:mute`** (`{conversationId, muted}`), calqué sur
`chat:conversation:read` : même contrôle d'appartenance, puis
`chat:conversation:updated`. ⚠️ Ne pas confondre avec `pinnedBy`, qui existe en
colonne mais **n'est jamais écrit** (l'épinglage est un overlay `localStorage` côté
client). La sourdine, elle, est bien en base : c'est le serveur qui décide d'envoyer
le push. Elle coupe le push, **pas** le compteur non-lu (comportement Messenger).

**Service worker** (`public/sw.js`, servi par le front) : `push` +
`notificationclick` uniquement, **aucun gestionnaire `fetch`**. C'est délibéré et à
ne pas modifier — un service worker qui met en cache fige les utilisateurs sur une
vieille version qu'on ne peut plus corriger à distance. Sans `fetch`, les en-têtes
`Cache-Control` de nginx pilotent seuls la fraîcheur.

## ⚠️ Route DORMANTE — `/api/expenses` (modèle `OneOffExpense`)

Route CRUD complète et fonctionnelle (émissions `expense:*` incluses), mais
**aucun écran ne l'utilise et la table est vide**. Les dépenses ponctuelles se
saisissent comme une `FixedExpense` avec `isAnnual = false` : le montant n'est
imputé que sur le mois de sa date, et ce modèle offre en plus le multi-sites, la
répartition %/€, les marques et PRO+.

Une rubrique dédiée a été créée puis retirée le 29 juillet 2026 : c'était un
second chemin plus pauvre vers un besoin déjà couvert (voir correctif 10 dans
`ETAT-PROJET.md`). **Ne pas rebrancher sans arbitrage produit.** Route et modèle
conservés en l'état, sans migration.

## ✅ Uploads de fichiers (`feat/backend-uploads`) — vérifiés en base + sur disque

- **`POST /api/uploads/:type`** (`chat|avatar|calendar`), auth JWT, `multer` disque, nom **uuid**,
  renvoie `{ url: "/uploads/<type>/<uuid>.<ext>" }`. **`GET /uploads/...`** en `express.static`.
  Monté sur l'entrypoint `backend/src/index.ts`, proxy Vite `/uploads`.
- Formats/tailles **figés** : avatar jpeg/png/gif/webp 5 Mo · chat idem 10 Mo · calendar
  jpeg/png/webp/mp4/mov 2 Go. Refus → 415 (format) / 413 (taille) / 400 (type) / 401 (sans token).
- **Purge automatique CALENDAR uniquement, ancrée sur `SocialPost.archivedAt`** (jamais la date du
  fichier). `archivedAt` renseigné serveur à la bascule `archived` false→true, remis à `null` au
  désarchivage. Job (`backend/src/jobs/purge.ts`) : démarrage +15 s puis 24 h ; supprime les fichiers
  `/uploads/calendar/` des posts `archivedAt > 30 j` et vide leurs `mediaFiles`. **Aucune purge
  chat/avatar.** `DELETE /api/social/:id` nettoie aussi les fichiers du post supprimé.
- Branchements front : Chat (upload → URL dans le message socket), Settings (upload → PUT avatarUrl),
  Digital (upload → `mediaFiles`). Plus de base64 pour ces médias.
- Vérifié en base réelle (8/8) : `User.avatarUrl` persisté, `SocialPost.mediaFiles` persisté,
  `archivedAt` set à l'archivage / null au désarchivage, purge supprime fichier disque + référence
  base, taille > limite → 413. Données de test nettoyées.

## ✅ Diffusion temps réel des mutations (29 juillet 2026)

Chaque route métier émet un événement Socket.IO via `emitEvent` (`src/realtime/index.ts`,
`io.emit` = **broadcast global**, tous clients authentifiés confondus) :

| Ressource | Événements |
|---|---|
| projects · campaigns · budget · contacts · social | `<res>:updated`, `<res>:deleted` |
| users | `users:updated`, `users:deleted` |
| equipment · equipment-booking · expense · fixed-expense | `<res>:created`, `:updated`, `:deleted` |
| tags | `tags:updated` |
| activity | `activity:created` |

Nommage volontairement laissé hétérogène (pluriel/singulier, `created` présent ou non) :
le front ignore le payload et ne se sert que du nom, la table de référence côté
consommateur est `services/realtime.ts` (`RT_EVENTS`).

⚠️ **`users.ts` : ne jamais émettre l'objet Prisma brut** — il contient `passwordHash`,
qui serait diffusé à tous les clients connectés. Le helper `publicUser` est la seule
forme qui sort du module, réponse HTTP comme événement socket.

✅ **L'auteur d'une mutation est EXCLU de la diffusion** (depuis le 30/07/2026). Le
client envoie son `socket.id` dans l'en-tête `x-socket-id` ; `withEmitterContext`
(monté avant les routes dans `index.ts`) le mémorise pour la durée de la requête via
`AsyncLocalStorage` ; `emitEvent` diffuse alors en `io.except(socketId)`. Les ~35
sites d'appel sont inchangés et aucune route n'a besoin de connaître le socket.

Pourquoi : sans exclusion, l'auteur refetchait sa propre écriture 300 ms plus tard
(`services/realtime.ts`) et écrasait son état local — une puce de marque cliquée dans
`Projects.tsx` se dé-sélectionnait. Dégradation sûre : sans en-tête (curl, outil
externe, client hors socket), on retombe sur une diffusion à tous.

## ✅ Présence en temps réel (29 juillet 2026)

`src/realtime/presence.ts` — état **en mémoire uniquement**, aucune table Prisma : la
présence est éphémère et liée à la durée de vie d'une connexion socket.

| Sens | Événement | Charge |
|---|---|---|
| client → serveur | `presence:set` | `{ section: string }` (borné à 40 caractères, pas de liste blanche pour ne pas resynchroniser ce fichier à chaque nouvelle rubrique du frontend) |
| serveur → tous | `presence:state` | instantané complet `{ [section]: PresenceUser[] }` |

- **Un utilisateur = une seule rubrique** : plusieurs onglets produisent plusieurs
  entrées `socket.id`, l'instantané ne retient que la plus récente (`at`).
- **Identité résolue serveur** (`name`, `avatarColor`, `avatarUrl`) et mise en cache :
  le JWT ne porte que `{ id, role }`, insuffisant pour rendre un avatar.
  `routes/users.ts` appelle `notifyUserChanged(userId)` après PUT et DELETE →
  recharge le cache, ou purge les présences si le compte n'existe plus.
- **Pas de persistance volontaire** : au redémarrage du conteneur `api` l'état est
  vide, les clients se réannoncent sur leur événement `connect`.
- Pas de diffs, uniquement des instantanés complets : à l'échelle d'une dizaine
  d'utilisateurs c'est moins coûteux à raisonner qu'une synchro incrémentale.

## ✅ Déploiement VPS — FAIT (8 juillet 2026, en production depuis)

En ligne sur https://gearbox.bonyauto-mobile.com. Détail de l'architecture ci-dessous,
procédure opérationnelle dans `DEPLOIEMENT.md`, état global dans `ETAT-PROJET.md`.

- Architecture conteneurisée split : `api`
  (backend/Dockerfile multi-stage, `prisma migrate deploy` au démarrage) + `web` (nginx servant
  le build Vite) + `caddy` (reverse-proxy `/api`, `/socket.io`, `/uploads` → api, reste → web,
  HTTPS auto). Volume persistant `uploads_data` pour les uploads, variables dans `.env` racine
  (voir `.env.example`). `server.ts` (ancien monolithe racine) supprimé — code mort.

## ✅ Proxy de contenus externes — `/api/feeds` et `/api/music` (30 juillet 2026)

Hello Marketing a besoin de contenus que le navigateur **ne peut pas** aller chercher
lui-même (CORS) : flux RSS et playlist Deezer. Le frontend passait par le proxy tiers
`corsproxy.io`, dont l'offre gratuite est réservée à localhost — d'où des blocs qui
ne fonctionnaient jamais en production. On proxifie donc nous-mêmes.

| Route | Rôle |
|---|---|
| `GET /api/feeds` | liste `[{ key, name, color, category }]` — **jamais les URL** |
| `GET /api/feeds/:key` | contenu brut du flux, `Content-Type` d'origine |
| `GET /api/music/tracks` | passe-plat JSON de la playlist Deezer |

⚠️ **RÈGLE : jamais de proxy acceptant une URL fournie par le client.** Le registre
des flux (`backend/src/routes/feeds.ts`) est la seule source des URL, et le client
n'envoie qu'une **clé**. Un paramètre `?url=` transformerait l'API en relais capable
d'atteindre le réseau interne Docker ou des endpoints de métadonnées cloud (SSRF).
Clé inconnue → 404 **sans aucune requête sortante**. Routes protégées par
`authenticateToken` pour ne pas offrir un relais anonyme.

Autres garde-fous : cache mémoire (15 min les flux, 30 min Deezer), timeout 8 s via
`AbortController`, en-têtes sortants de navigateur (`User-Agent` + `Accept`) — sans
eux, Usine Digitale renvoie 403. Échec amont → **502**, le frontend dégrade déjà
proprement (`Promise.allSettled`).

Bénéfice opérationnel : un flux RSS meurt régulièrement (4 sur 8 l'étaient le
30/07/2026). Le corriger ne demande plus qu'un redéploiement de `api`, sans toucher
au frontend.

## ⚠️ Règle de robustesse — accès base et rappels détachés

**Ne JAMAIS faire d'accès base (ni aucun `await` susceptible d'échouer) dans un
rappel passé à une API qui ne l'attend pas** : `jwt.verify(token, secret, cb)`,
`setTimeout`, `setInterval`, un handler Socket.IO sans `try/catch`.

Pourquoi : un tel rappel s'exécute **après** que le handler Express a rendu la
main. La promesse qu'il renvoie n'est attendue par personne — ni Express, ni
`express-async-errors`, ni `middleware/errorHandler.ts` ne peuvent la voir. Node
la classe en *unhandled rejection* et **termine le process** (défaut depuis Node
15). Une coupure Supabase de deux secondes a ainsi tué l'API le 30/07/2026, et
chaque redémarrage coupe **toutes** les connexions Socket.IO des utilisateurs.

Formes correctes :
- `jwt.verify` **synchrone** dans un `try/catch` (voir le helper `decodeToken` de
  `routes/auth.ts`), puis l'accès base dans le handler async ;
- handler Socket.IO : `try/catch` couvrant tout le corps (c'est déjà le cas des
  5 handlers de `realtime/chat.ts` et de `realtime/presence.ts`) ;
- timer : encapsuler dans une fonction qui gère ses erreurs (`runSafe` de
  `jobs/purge.ts`).

Filet de dernier recours dans `index.ts` : `process.on('unhandledRejection')`
journalise sans tuer le process. **Ce n'est pas une excuse** pour ne pas traiter
l'erreur à la source. Pas de handler `uncaughtException` volontairement : une
exception synchrone non rattrapée laisse un état imprévisible, et là redémarrer
est le bon comportement (`restart: always` côté Docker).

## Rappels d'environnement (contrainte TOUJOURS active)

- **Réseau bureau : ports PostgreSQL 5432/6543 bloqués → hotspot 4G obligatoire** pour toucher
  Supabase (migrations, seed, tout accès DB). Ouverture des ports par l'IT toujours en attente.
- `DIRECT_URL` = Session pooler (5432, requis par `prisma migrate`) ; `DATABASE_URL` = transaction
  pooler (6543, `?pgbouncer=true`, utilisé par le client Prisma à l'exécution).
- `backend/.env` non versionné : si absent après une manœuvre git → `cp .env backend/.env`.
- `backend/uploads/` gitignoré (données runtime, recréées au démarrage par la route uploads).
