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
6. **Campagnes** — `/api/campaigns` CRUD.
7. **Digital / Social** — `/api/social` CRUD ; `mediaFiles` = URLs de fichiers uploadés (voir Uploads).
8. **Journal d'activité** — `/api/activity-log` (GET plafonné 200, POST fire-and-forget, Master non journalisé).
9. **Chat** — `/api/chat` REST (chargement) + Socket.IO temps réel (`chat:message:send/edit/delete/react`,
   `chat:conversation:read` → `chat:message:new/updated`, `chat:conversation:updated/created`). Chat
   Général = appartenance implicite (seed idempotent, non-External).

Le frontend utilise la couche unique `services/dataService.ts` (`apiFetch` + JWT). Résidus
`localStorage` **assumés et hors périmètre** (pas des données serveur) : overlay client-only chat
(épingle / renommage / membres de groupe), avatars de groupe du chat, prefs UI (ville/anniversaire),
et fallback des anciennes photos de profil base64 (avant bascule uploads).

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

⚠️ Les routes émettent **aussi vers l'auteur** de la mutation (pas d'exclusion du
socket émetteur). Assumé : l'auteur refetch une donnée qu'il vient d'écrire. Si du
scintillement apparaît côté UI, la piste est un header `x-socket-id` + `io.except(id)`,
avec un `AsyncLocalStorage` pour éviter de toucher les ~35 sites d'appel.

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

## Rappels d'environnement (contrainte TOUJOURS active)

- **Réseau bureau : ports PostgreSQL 5432/6543 bloqués → hotspot 4G obligatoire** pour toucher
  Supabase (migrations, seed, tout accès DB). Ouverture des ports par l'IT toujours en attente.
- `DIRECT_URL` = Session pooler (5432, requis par `prisma migrate`) ; `DATABASE_URL` = transaction
  pooler (6543, `?pgbouncer=true`, utilisé par le client Prisma à l'exécution).
- `backend/.env` non versionné : si absent après une manœuvre git → `cp .env backend/.env`.
- `backend/uploads/` gitignoré (données runtime, recréées au démarrage par la route uploads).
