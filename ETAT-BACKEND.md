# ÉTAT BACKEND — synthèse au 7 juillet 2026

État de référence après merge de `feat/backend-routes` dans `master` (`ba20dd4`).
Le backend compile intégralement (`tsc --noEmit` sur `backend/src/` : zéro erreur), schéma Prisma appliqué sur Supabase (migration `20260706160559_init`), seed exécuté.

## ✅ Routes existantes et TESTÉES (round-trips réels contre Supabase)

| Ressource | Routes | Rôles mutations | Testé |
|---|---|---|---|
| `/api/budget` | GET, POST (upsert par site), PUT/:id, DELETE/:id | Master/Admin | tsc + contrat vérifié (upsert par site conforme au schéma) |
| `/api/fixed-expenses` | GET, POST, PUT/:id (partiel), DELETE/:id | Master/Admin | **11/11** — round-trip isAnnual + budgetDistribution multi-sites |
| `/api/equipment` | GET, POST, PUT/:id, DELETE/:id (cascade réservations) | Master/Admin | **9/9** (avec test cascade FK) |
| `/api/equipment-bookings` | GET, POST, PUT/:id, DELETE/:id | tout authentifié (comme l'UI) | idem (9/9 conjoint) |
| `/api/chat` | GET conversations (scopées user), GET :id/messages, POST conversations (private idempotent/group) | tout authentifié | **17/17** — scénario 2 clients temps réel |
| Chat Socket.IO | `chat:message:send/edit/delete/react`, `chat:conversation:read` (écoutés) ; `chat:message:new/updated`, `chat:conversation:updated/created` (émis, rooms ciblées) | auteur/participant vérifiés serveur | idem (17/17) |

## ✅ Déjà en place depuis l'étape sécurité (confirmé)

- `/api/auth` : login (JWT 24h, bcrypt), GET/PUT `/me` — fonctionnel.
- `/api/users` : CRUD complet, auth sur tout, mutations Master/Admin, **validation des 7 rôles** (`auth/roles.ts`).
- `/api/seed` : verrouillé Master/Admin, rôles en chaînes.
- `JWT_SECRET` obligatoire (fail-fast au démarrage, `auth/secret.ts`), handshake Socket.IO authentifié.
- Routes historiques fonctionnelles : `/api/projects` (⚠️ bug PUT, voir Lot F), `/api/campaigns`, `/api/social`, `/api/contacts`, `/api/tags`, `/api/expenses` (OneOffExpense).

## 🔜 Reste à faire AVANT l'étape 7 (branchement frontend↔backend)

1. **Lot E — ActivityLog** : aucune route. Modèle Prisma prêt. Le frontend logge via `db.logActivity` (localStorage, plafond 200 entrées, actions Master exclues — répliquer ces règles côté serveur).
2. **Lot F — bug PUT projets** (`backend/src/routes/projects.ts`, dans BUGS-CONNUS.md) : le PUT fait `deleteMany`+`createMany` sur les tâches → perte des IDs à chaque sauvegarde. Passer à un upsert par tâche.
3. **Uploads** : rien n'existe (pas de multer). Besoins : images chat (`type:'image'` actuellement stocké brut en base64 dans content), photos de profil (localStorage côté front), médias calendrier/social (`mediaFiles` placeholders).

## Limites connues assumées (voir BUGS-CONNUS.md)

- Sur-réservation EquipmentBooking possible (pas de contrôle de chevauchement serveur) → contrainte transactionnelle à l'étape 7.
- Chat : pin + gestion des membres de groupe non couverts (à ajouter à l'étape 7 selon besoin) ; incrément unreadCounts non transactionnel.
- Page frontend Expenses.tsx cassée (`db.saveExpense` inexistant) — chantier frontend, indépendant.
- Token invalide → 403 (choix historique du middleware ; convention stricte = 401, one-liner si souhaité).

## Rappels d'environnement (voir aussi mémoire de session)

- **Réseau bureau : ports PostgreSQL 5432/6543 bloqués** → hotspot 4G obligatoire pour toucher Supabase. Ouverture des ports par l'IT toujours en attente.
- `DIRECT_URL` = Session pooler (hôte direct IPv6-only). `DATABASE_URL` = transaction pooler + `?pgbouncer=true`.
- `backend/.env` non versionné : si absent après une manœuvre git → `cp .env backend/.env`.
