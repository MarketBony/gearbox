# ÉTAT BACKEND — synthèse au 8 juillet 2026 (ÉTAT FINAL)

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

## ✅ Uploads de fichiers (`feat/backend-uploads`) — vérifiés en base + sur disque

- **`POST /api/uploads/:type`** (`chat|avatar|calendar`), auth JWT, `multer` disque, nom **uuid**,
  renvoie `{ url: "/uploads/<type>/<uuid>.<ext>" }`. **`GET /uploads/...`** en `express.static`.
  Monté sur les 2 entrypoints (`backend/src/index.ts` + `server.ts`), proxy Vite `/uploads`.
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

## 🔜 Seul chantier restant

- **Déploiement VPS** — rien côté code applicatif. Prévoir : build (`vite build` + `tsc` backend),
  service backend, `express.static` du `dist/` (déjà géré par `server.ts` en prod), reverse-proxy
  (Caddyfile présent), volume persistant pour `backend/uploads/` (gitignoré), variables `.env`.

## Rappels d'environnement (contrainte TOUJOURS active)

- **Réseau bureau : ports PostgreSQL 5432/6543 bloqués → hotspot 4G obligatoire** pour toucher
  Supabase (migrations, seed, tout accès DB). Ouverture des ports par l'IT toujours en attente.
- `DIRECT_URL` = Session pooler (5432, requis par `prisma migrate`) ; `DATABASE_URL` = transaction
  pooler (6543, `?pgbouncer=true`, utilisé par le client Prisma à l'exécution).
- `backend/.env` non versionné : si absent après une manœuvre git → `cp .env backend/.env`.
- `backend/uploads/` gitignoré (données runtime, recréées au démarrage par la route uploads).
