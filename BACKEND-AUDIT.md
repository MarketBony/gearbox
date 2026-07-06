# BACKEND-AUDIT.md

> Audit factuel de l'état réel du backend au **6 juillet 2026**, avant préparation de la migration.
> Objectif : image fidèle, pas optimiste. Aucun fichier existant n'a été modifié pour produire ce document.

## TL;DR — état global (à lire en premier)

- **Le backend n'a jamais tourné depuis ce dépôt.** Preuves matérielles :
  - `backend/node_modules/` **ABSENT** → les dépendances backend n'ont jamais été installées ici.
  - `backend/node_modules/.prisma/` **ABSENT** → `prisma generate` jamais exécuté → le client Prisma n'existe pas.
  - `backend/dist/` **ABSENT** → jamais buildé (`tsc`).
  - `prisma/migrations/migration_lock.toml` **ABSENT** → `prisma migrate dev` n'a jamais été lancé (cette commande crée ce fichier automatiquement).
- **Il n'existe AUCUNE migration d'initialisation** (`CREATE TABLE`). La seule migration présente est un `ALTER TABLE` additif (`add_proplus_b2b`) qui **suppose que les tables existent déjà**. Appliquée telle quelle sur une base vierge via `prisma migrate deploy`, elle **échouerait** (ALTER sur des tables inexistantes).
- **Le schéma n'a donc été appliqué nulle part de façon traçable par Prisma.** La base pointée par `DATABASE_URL` (`postgresql://…@db:5432/gearbox`, hôte `db` = style docker-compose) n'est pas confirmée comme existante/peuplée.
- **Le code des routes est RÉEL** (elles interrogent toutes Prisma, aucune ne renvoie de mock), **mais non exécutable en l'état** (client Prisma non généré, base non migrée, deps non installées).
- **Le frontend n'est pas branché à ce backend** : il persiste via `localStorage` (`services/dataService.ts`). Ce backend est un socle écrit mais dormant.
- **Trous fonctionnels majeurs** : pas de modèle `FixedExpense` (la fonctionnalité « Dépenses Fixes » n'a AUCUN backend), pas de Chat, pas d'ActivityLog, pas d'Equipment/Booking, pas d'upload de fichiers, routes `users`/`seed` **sans authentification**.

---

## 1) SCHÉMA DE DONNÉES

Un schéma Prisma existe : `backend/prisma/schema.prisma`. Contenu intégral :

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum UserRole {
  Master
  Administrator
  Coordinator
  DigitalManager
  Guest
}

model User {
  id           String   @id @default(uuid())
  loginId      String   @unique
  passwordHash String
  name         String
  role         UserRole
  avatarColor  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Project {
  id            String   @id @default(uuid())
  name          String
  site          String
  service       String[] // Stored as array of strings
  brands        String[]
  projectType   String
  status        String
  startDate     DateTime
  endDate       DateTime
  budgetPlanned Float
  budgetActual  Float
  description   String
  progress      Float
  proPlus       Boolean  @default(false) // PRO+ (B2B) — additif, défaut false
  tasks         Task[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Task {
  id           String   @id @default(uuid())
  projectId    String
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name         String
  channel      String
  cost         Float
  status       String
  volumetry    Float?
  openRate     Float?
  npaiRate     Float?
  stopRate     Float?
  clickRate    Float?
  codTxt       String?
  billedAmount Float?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Campaign {
  id            String   @id @default(uuid())
  name          String
  site          String
  service       String[]
  type          String
  startDate     DateTime
  endDate       DateTime
  budgetPlanned Float
  status        String
  roi           Float?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model SocialPost {
  id          String   @id @default(uuid())
  title       String
  status      String
  date        DateTime
  targets     String[]
  brands      String[]
  service     String
  networks    String[]
  concessions String[]
  mediaFiles  String[]
  link        String
  wording     String
  lom         String
  co2         String
  archived    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model DigitalTags {
  id       String   @id @default(uuid())
  networks String[]
  co2      String[]
}

model Contact {
  id              String   @id @default(uuid())
  firstName       String
  lastName        String
  email           String
  phone           String
  site            String
  service         String
  type            String
  rgpdConsent     Boolean
  tags            String[]
  lastContactDate DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model BudgetLine {
  id        String   @id @default(uuid())
  site      String
  brands    String[]
  year      Int
  // Storing entries as JSON because it's a fixed structure of arrays in the frontend
  // { VN: number[], VO: number[], ... }
  entries   Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([site, year])
}

model OneOffExpense {
  id        String   @id @default(uuid())
  date      DateTime
  service   String
  site      String
  comment   String?
  amount    Float
  proPlus   Boolean  @default(false) // PRO+ (B2B) — additif, défaut false
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Modèles définis :** `User`, `Project`, `Task`, `Campaign`, `SocialPost`, `DigitalTags`, `Contact`, `BudgetLine`, `OneOffExpense` (9 modèles) + enum `UserRole` (5 valeurs).

**Absents du schéma (mais présents/attendus côté frontend) :** `FixedExpense`, `ChatConversation`, `ChatMessage`, `ActivityLog`, `Equipment`, `EquipmentBooking`. Voir §8.

---

## 2) MIGRATIONS

Contenu réel de `backend/prisma/migrations/` :

| Dossier | Type | Remarque |
|---|---|---|
| `20260630000000_add_proplus_b2b/` | `ALTER TABLE` additif (ajoute `proPlus` à `Project` et `OneOffExpense`) | **Suppose que les tables existent déjà** |

- **Une seule migration**, additive. **Aucune migration `init`/baseline** créant les tables → le schéma complet n'est reconstructible par aucune migration.
- `migration_lock.toml` **ABSENT** → aucune preuve que `prisma migrate dev` ait jamais été exécuté (il génère ce fichier au premier run).
- Nom de dossier daté `20260630000000` → horodatage **manuel** rond (minuit pile), pas un timestamp généré par Prisma (Prisma produit des timestamps à la seconde près, ex. `20260630163245`). Fort indice d'une migration **écrite à la main**, non issue de `prisma migrate`.

**Verdict migrations :** `prisma migrate` n'a, selon toute preuve matérielle disponible dans le dépôt, **jamais été exécuté contre une base réelle**. Le schéma n'a été appliqué nulle part de façon traçable. Un `prisma migrate deploy` sur base vierge **échouerait** faute de migration `init`. Il faudra générer une migration baseline avant toute chose.

---

## 3) ROUTES BACKEND — UNE SECTION PAR FICHIER

> Rappel transversal : **toutes** ces routes appellent réellement Prisma (aucun mock/tableau factice codé en dur). Le verdict « RÉEL » porte sur le **code**. En pratique, **rien ne peut s'exécuter aujourd'hui** (client Prisma non généré, base non migrée, deps non installées — voir TL;DR). Les caveats par route ci-dessous sont des défauts réels du code, pas des suppositions.

### 3.1 — `backend/src/routes/auth.ts`

**Verdict : RÉEL (interroge Prisma/la base).** bcrypt pour comparer/hacher les mots de passe, JWT (24 h) pour le token.
**Caveats honnêtes :**
- `/me` (GET) et `/me` (PUT) **réimplémentent la vérification du token en inline** au lieu d'utiliser le middleware `authenticateToken` → duplication et divergence possibles.
- Secret JWT `process.env.JWT_SECRET || 'secret'` → **fallback trivial `'secret'`** si la variable d'env manque.
- Pas de refresh token, pas de révocation, pas de rate-limiting sur `/login`.

```ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const router = Router();
const prisma = new PrismaClient();
const SECRET = process.env.JWT_SECRET || 'secret';

router.post('/login', async (req, res) => {
  const { loginId, password } = req.body;
  const user = await prisma.user.findUnique({ where: { loginId } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, avatarColor: user.avatarColor } });
});

router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET, async (err: any, decoded: any) => {
    if (err) return res.sendStatus(403);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.sendStatus(404);
    res.json({ id: user.id, name: user.name, role: user.role, avatarColor: user.avatarColor });
  });
});

router.put('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET, async (err: any, decoded: any) => {
    if (err) return res.sendStatus(403);
    const { name, password, avatarColor } = req.body;
    
    const updateData: any = { name, avatarColor };
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: decoded.id },
      data: updateData
    });

    res.json({ id: updatedUser.id, name: updatedUser.name, role: updatedUser.role, avatarColor: updatedUser.avatarColor });
  });
});

export default router;
```

### 3.2 — `backend/src/routes/projects.ts`

**Verdict : RÉEL (interroge Prisma/la base) — mais avec bugs latents sérieux.**
**Caveats honnêtes :**
- Le **PUT** synchronise les tâches par `deleteMany` + `createMany` → **perte des IDs de tâches** à chaque édition (le commentaire dans le code le reconnaît lui-même : « Ideally we should upsert »). Toute référence externe à un `taskId` serait cassée.
- **Incompatibilité de schéma bloquante** : le frontend envoie `Project.sites[]`, `budgetDistribution`, `assignedUsers[]`, `alpineShare` et `Task.assignedUserId`/`provider`, qui **n'existent pas** dans les modèles Prisma. `prisma.project.create({ data: { ...projectData } })` / `update` **lèvera une erreur** sur ces clés inconnues (Prisma rejette les champs hors schéma). En l'état, création/édition d'un projet depuis le frontend réel **planterait**.
- Protégé par `authenticateToken` + `requireRole(['Master','Administrator','Coordinator'])` sur POST/PUT/DELETE. GET seulement authentifié.

```ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { emitEvent } from '../realtime';

const router = Router();
const prisma = new PrismaClient();

// Roles allowed to edit
const EDIT_ROLES = ['Master', 'Administrator', 'Coordinator'];

router.get('/', authenticateToken, async (req, res) => {
  const projects = await prisma.project.findMany({ include: { tasks: true } });
  res.json(projects);
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { tasks, ...projectData } = req.body;
  const project = await prisma.project.create({
    data: {
      ...projectData,
      tasks: {
        create: tasks
      }
    },
    include: { tasks: true }
  });
  emitEvent('projects:updated', project);
  res.json(project);
});

router.put('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  const { tasks, ...projectData } = req.body;

  // Transaction to update project and tasks
  const project = await prisma.$transaction(async (tx) => {
    // Update project fields
    const p = await tx.project.update({
      where: { id },
      data: projectData
    });

    // Handle tasks: upsert or delete
    // Simplification: Delete all and recreate is easiest for full sync, but upsert is better for IDs.
    // Given the frontend sends full object, we can try to smart update.
    // For MVP/Speed: Delete all tasks for project and recreate.
    await tx.task.deleteMany({ where: { projectId: id } });
    if (tasks && tasks.length > 0) {
        await tx.task.createMany({
            data: tasks.map((t: any) => ({
                ...t,
                projectId: id,
                id: undefined // Let DB generate new ID or use provided if we want to keep it? 
                              // If we delete, we lose IDs. Ideally we should upsert.
                              // Let's iterate for upsert.
            }))
        });
    }
    
    return await tx.project.findUnique({ where: { id }, include: { tasks: true } });
  });

  emitEvent('projects:updated', project);
  res.json(project);
});

router.delete('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  await prisma.project.delete({ where: { id } });
  emitEvent('projects:deleted', id);
  res.sendStatus(204);
});

export default router;
```

### 3.3 — `backend/src/routes/campaigns.ts`

**Verdict : RÉEL (interroge Prisma/la base).** CRUD minimal complet (GET/POST/PUT/DELETE), protégé par `requireRole(['Master','Administrator','Coordinator'])` sur les mutations.
**Caveats :** POST/PUT font `data: req.body` **sans validation ni filtrage** → toute clé hors schéma ferait échouer Prisma ; aucun contrôle de type/format.

```ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../auth/middleware';
import { emitEvent } from '../realtime';

const router = Router();
const prisma = new PrismaClient();
const EDIT_ROLES = ['Master', 'Administrator', 'Coordinator'];

router.get('/', authenticateToken, async (req, res) => {
  const campaigns = await prisma.campaign.findMany();
  res.json(campaigns);
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const campaign = await prisma.campaign.create({ data: req.body });
  emitEvent('campaigns:updated', campaign);
  res.json(campaign);
});

router.put('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  const campaign = await prisma.campaign.update({ where: { id }, data: req.body });
  emitEvent('campaigns:updated', campaign);
  res.json(campaign);
});

router.delete('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  await prisma.campaign.delete({ where: { id } });
  emitEvent('campaigns:deleted', id);
  res.sendStatus(204);
});

export default router;
```

### 3.4 — `backend/src/routes/social.ts`

**Verdict : RÉEL (interroge Prisma/la base).** CRUD minimal sur `SocialPost`, `requireRole(['Master','Administrator','DigitalManager'])` sur mutations.
**Caveats :** `data: req.body` non validé (idem campaigns). Le champ `mediaFiles` est un `String[]` — **aucun upload réel** derrière (voir §6), ce ne sont que des chaînes/placeholders.

```ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../auth/middleware';
import { emitEvent } from '../realtime';

const router = Router();
const prisma = new PrismaClient();
const EDIT_ROLES = ['Master', 'Administrator', 'DigitalManager'];

router.get('/', authenticateToken, async (req, res) => {
  const posts = await prisma.socialPost.findMany();
  res.json(posts);
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const post = await prisma.socialPost.create({ data: req.body });
  emitEvent('social:updated', post);
  res.json(post);
});

router.put('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  const post = await prisma.socialPost.update({ where: { id }, data: req.body });
  emitEvent('social:updated', post);
  res.json(post);
});

router.delete('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  await prisma.socialPost.delete({ where: { id } });
  emitEvent('social:deleted', id);
  res.sendStatus(204);
});

export default router;
```

### 3.5 — `backend/src/routes/budget.ts`

**Verdict : PARTIEL (interroge Prisma, mais couverture incomplète).** GET (liste) + POST (upsert par `site_year`). `requireRole(['Master','Administrator'])`.
**Ce qui manque :** **pas de PUT, pas de DELETE**. Le champ `entries` (JSON) est stocké tel quel sans validation de structure (`{VN:[],VO:[],PR:[],APV:[]}`).

```ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../auth/middleware';
import { emitEvent } from '../realtime';

const router = Router();
const prisma = new PrismaClient();
const EDIT_ROLES = ['Master', 'Administrator'];

router.get('/', authenticateToken, async (req, res) => {
  const budgets = await prisma.budgetLine.findMany();
  res.json(budgets);
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  // Upsert logic usually for budgets
  const { site, year, entries, brands } = req.body;
  const budget = await prisma.budgetLine.upsert({
    where: { site_year: { site, year } },
    update: { entries, brands },
    create: { site, year, entries, brands }
  });
  emitEvent('budget:updated', budget);
  res.json(budget);
});

export default router;
```

### 3.6 — `backend/src/routes/contacts.ts`

**Verdict : RÉEL (interroge Prisma/la base).** CRUD complet sur `Contact`, `requireRole(['Master','Administrator','Coordinator'])`.
**Caveats :** `data: req.body` non validé (dont `rgpdConsent`, `lastContactDate`). **Aucune interface `Contact` typée côté frontend** (`types.ts` n'en contient pas) → le contrat de données n'est pas fixé côté client.

```ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../auth/middleware';
import { emitEvent } from '../realtime';

const router = Router();
const prisma = new PrismaClient();
const EDIT_ROLES = ['Master', 'Administrator', 'Coordinator'];

router.get('/', authenticateToken, async (req, res) => {
  const contacts = await prisma.contact.findMany();
  res.json(contacts);
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const contact = await prisma.contact.create({ data: req.body });
  emitEvent('contacts:updated', contact);
  res.json(contact);
});

router.put('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  const contact = await prisma.contact.update({ where: { id }, data: req.body });
  emitEvent('contacts:updated', contact);
  res.json(contact);
});

router.delete('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  await prisma.contact.delete({ where: { id } });
  emitEvent('contacts:deleted', id);
  res.sendStatus(204);
});

export default router;
```

### 3.7 — `backend/src/routes/tags.ts`

**Verdict : RÉEL (interroge Prisma/la base).** Gère un **unique enregistrement** `DigitalTags` (GET renvoie le premier ou `{networks:[],co2:[]}` par défaut ; POST crée si aucun, sinon met à jour le premier). `requireRole(['Master','Administrator','DigitalManager'])`.
**Caveats :** pattern « singleton » implicite non garanti au niveau base (rien n'empêche plusieurs lignes).

```ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../auth/middleware';
import { emitEvent } from '../realtime';

const router = Router();
const prisma = new PrismaClient();
const EDIT_ROLES = ['Master', 'Administrator', 'DigitalManager'];

router.get('/', authenticateToken, async (req, res) => {
  const tags = await prisma.digitalTags.findFirst();
  res.json(tags || { networks: [], co2: [] });
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const count = await prisma.digitalTags.count();
  let tags;
  if (count === 0) {
    tags = await prisma.digitalTags.create({ data: req.body });
  } else {
    // Assuming single row for tags
    const first = await prisma.digitalTags.findFirst();
    if (first) {
        tags = await prisma.digitalTags.update({ where: { id: first.id }, data: req.body });
    }
  }
  emitEvent('tags:updated', tags);
  res.json(tags);
});

export default router;
```

### 3.8 — `backend/src/routes/expenses.ts`

**Verdict : RÉEL (interroge Prisma/la base) — MAIS attention au périmètre.** CRUD complet sur `OneOffExpense` (dépense **ponctuelle/one-off**), avec `try/catch`.
**Caveat critique :** cette route gère `OneOffExpense`, **PAS** la `FixedExpense` du module « Dépenses Fixes » du frontend. **La fonctionnalité Dépenses Fixes (celle avec `budgetDistribution`, `isAnnual`, multi-sites, routage Alpine/Nissan) n'a AUCUN modèle ni AUCUNE route backend.** De plus, mutations autorisées à **tout utilisateur authentifié** (pas de `requireRole`).

```ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../auth/middleware';
import { emitEvent } from '../realtime';

const router = Router();
const prisma = new PrismaClient();

// Allow all authenticated users to view expenses
router.get('/', authenticateToken, async (req, res) => {
  try {
    const expenses = await prisma.oneOffExpense.findMany({
      orderBy: { date: 'desc' }
    });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// Allow creating expenses
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { date, service, site, comment, amount, proPlus } = req.body;
    const expense = await prisma.oneOffExpense.create({
      data: {
        date: new Date(date),
        service,
        site,
        comment,
        amount: parseFloat(amount),
        proPlus: proPlus ?? false
      }
    });
    emitEvent('expense:created', expense);
    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// Allow updating expenses
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, service, site, comment, amount, proPlus } = req.body;
    const expense = await prisma.oneOffExpense.update({
      where: { id },
      data: {
        date: new Date(date),
        service,
        site,
        comment,
        amount: parseFloat(amount),
        proPlus: proPlus ?? false
      }
    });
    emitEvent('expense:updated', expense);
    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// Allow deleting expenses
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.oneOffExpense.delete({ where: { id } });
    emitEvent('expense:deleted', { id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

export default router;
```

### 3.9 — `backend/src/routes/users.ts`

**Verdict : RÉEL (interroge Prisma/la base) — MAIS FAILLE DE SÉCURITÉ.** CRUD complet sur `User`, bcrypt au create/update. **AUCUN `authenticateToken`, AUCUN `requireRole` sur aucune route.**
**Caveat critique :** n'importe quel appelant **non authentifié** peut lister les utilisateurs, en **créer** (avec le rôle de son choix, y compris `Master`), en **modifier** (dont mot de passe et rôle) et en **supprimer**. À corriger impérativement avant toute mise en ligne.

```ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const router = Router();
const prisma = new PrismaClient();

// GET all users
router.get('/', async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users.map(u => ({ id: u.id, name: u.name, loginId: u.loginId, role: u.role, avatarColor: u.avatarColor })));
});

// POST create user
router.post('/', async (req, res) => {
  const { name, loginId, password, role, avatarColor } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: { name, loginId, passwordHash, role, avatarColor }
    });
    res.json({ id: user.id, name: user.name, loginId: user.loginId, role: user.role, avatarColor: user.avatarColor });
  } catch (e) {
    res.status(400).json({ error: 'User creation failed' });
  }
});

// PUT update user
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, loginId, password, role, avatarColor } = req.body;
  
  const updateData: any = { name, loginId, role, avatarColor };
  if (password) {
    updateData.passwordHash = await bcrypt.hash(password, 10);
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: updateData
    });
    res.json({ id: user.id, name: user.name, loginId: user.loginId, role: user.role, avatarColor: user.avatarColor });
  } catch (e) {
    res.status(400).json({ error: 'User update failed' });
  }
});

// DELETE user
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.user.delete({ where: { id } });
    res.sendStatus(204);
  } catch (e) {
    res.status(400).json({ error: 'User deletion failed' });
  }
});

export default router;
```

### 3.10 — `backend/src/routes/seed.ts`

**Verdict : RÉEL (interroge Prisma/la base) — MAIS exposé sans protection.** `GET /api/seed` upsert 5 utilisateurs de démo (mots de passe en clair dans le code : `theo`/`admin`, les autres `password`) + crée les `DigitalTags` par défaut.
**Caveat critique :** endpoint **GET non authentifié** → n'importe qui peut déclencher le (re)seed, ce qui **réinitialise les mots de passe** des comptes de démo. Duplique la logique de `prisma/seed.ts` (voir §4/seed).

```ts
import { Router } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const users = [
      { name: 'Théo Labonne', loginId: 'theo', role: UserRole.Master, color: '#f75632' },
      { name: 'Admin User', loginId: 'admin', role: UserRole.Administrator, color: '#8f12ab' },
      { name: 'Coord User', loginId: 'coord', role: UserRole.Coordinator, color: '#293f74' },
      { name: 'Digital Mgr', loginId: 'digital', role: UserRole.DigitalManager, color: '#10b981' },
      { name: 'Guest User', loginId: 'guest', role: UserRole.Guest, color: '#64748b' },
    ];

    for (const u of users) {
      const password = u.loginId === 'theo' ? 'admin' : 'password';
      const hash = await bcrypt.hash(password, 10);
      await prisma.user.upsert({
        where: { loginId: u.loginId },
        update: {
          passwordHash: hash // Update password if user exists
        },
        create: {
          loginId: u.loginId,
          name: u.name,
          passwordHash: hash,
          role: u.role,
          avatarColor: u.color
        }
      });
    }

    // Create initial tags if not exist
    const tags = await prisma.digitalTags.findFirst();
    if (!tags) {
      await prisma.digitalTags.create({
        data: {
          networks: ['Facebook', 'Instagram', 'LinkedIn'],
          co2: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
        }
      });
    }

    res.json({ message: 'Seeding completed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Seeding failed', details: error });
  }
});

export default router;
```

### Récap routes

| Route | Verdict | Auth | Rôles (mutations) | Manques / risques clés |
|---|---|---|---|---|
| `auth` | RÉEL | — (émet le token) | — | `/me` inline hors middleware ; secret fallback `'secret'` |
| `projects` | RÉEL (bugs latents) | ✅ | Master/Admin/Coord | perte IDs tâches au PUT ; champs frontend hors schéma → crash |
| `campaigns` | RÉEL | ✅ | Master/Admin/Coord | `req.body` non validé |
| `social` | RÉEL | ✅ | Master/Admin/DigitalMgr | `mediaFiles` = strings, pas d'upload |
| `budget` | PARTIEL | ✅ | Master/Admin | pas de PUT/DELETE |
| `contacts` | RÉEL | ✅ | Master/Admin/Coord | pas de type frontend `Contact` |
| `tags` | RÉEL | ✅ | Master/Admin/DigitalMgr | singleton non garanti |
| `expenses` | RÉEL | ✅ (pas de rôle) | *(aucun)* | gère `OneOffExpense`, **pas** `FixedExpense` |
| `users` | RÉEL | ❌ **AUCUNE** | *(aucun)* | **CRUD utilisateurs 100 % public** |
| `seed` | RÉEL | ❌ **AUCUNE** | *(aucun)* | reseed/reset public des comptes |

---

## 4) TEMPS RÉEL

Fichier : `backend/src/realtime/index.ts` (le module s'appelle `realtime/index.ts`, importé via `./realtime`). Contenu intégral :

```ts
import { Server } from 'socket.io';

let io: Server;

export const setupRealtime = (socketIo: Server) => {
  io = socketIo;
  io.on('connection', (socket) => {
    console.log('Client connected', socket.id);
    socket.on('disconnect', () => {
      console.log('Client disconnected', socket.id);
    });
  });
};

export const emitEvent = (event: string, data: any) => {
  if (io) {
    io.emit(event, data);
  }
};
```

**Ce qui est réellement branché :**
- **Écouté côté serveur :** uniquement `connection` puis `disconnect` (juste des `console.log`). **Aucun événement client custom n'est écouté** (`socket.on(...)` custom : néant).
- **Émis vers les clients :** via le helper générique `emitEvent`, appelé **par les routes** (pas définis dans le module realtime lui-même). Inventaire réel des noms émis dans le code des routes :

| Événement émis | Depuis |
|---|---|
| `projects:updated`, `projects:deleted` | `routes/projects.ts` |
| `campaigns:updated`, `campaigns:deleted` | `routes/campaigns.ts` |
| `social:updated`, `social:deleted` | `routes/social.ts` |
| `budget:updated` | `routes/budget.ts` |
| `contacts:updated`, `contacts:deleted` | `routes/contacts.ts` |
| `tags:updated` | `routes/tags.ts` |
| `expense:created`, `expense:updated`, `expense:deleted` | `routes/expenses.ts` |

**Verdict temps réel : SQUELETTE de broadcast unidirectionnel.**
- Diffusion **globale** (`io.emit`) à **tous** les clients : pas de rooms, pas de ciblage par site/rôle, pas de namespaces.
- **Aucune authentification sur la socket** (le handshake Socket.IO n'est pas vérifié — n'importe qui peut se connecter et recevoir tous les événements).
- **Aucun flux entrant** (le serveur n'agit sur aucun message client). Le Chat frontend (`ChatMessage`/`ChatConversation`) n'a donc **aucun support temps réel ni persistance** ici.
- CORS socket : `origin: '*'`.

---

## 5) AUTHENTIFICATION ET RÔLES

- **Mécanisme :** JWT (`jsonwebtoken`), algorithme par défaut **HS256**, payload `{ id, role }`, expiration **24 h**. Secret = `process.env.JWT_SECRET || 'secret'` (**fallback dangereux**).
- **Mots de passe :** **bcrypt**, 10 rounds (`bcrypt.hash(..., 10)` / `bcrypt.compare`). ✅
- **Sessions :** aucune (stateless JWT). Pas de refresh token, pas de blacklist/révocation.
- **Middleware de rôles :** **il existe** (`requireRole`) et il est appliqué sur la plupart des mutations… **sauf** `users.ts` et `seed.ts` (aucune protection) et `expenses.ts` (authentifié mais sans rôle).
- **Incohérence de rôles frontend ↔ base (importante) :**
  - `types.ts` définit **7 rôles** : `Master | Administrator | Director | Coordinator | Digital Manager | Guest | External`.
  - L'enum Prisma `UserRole` n'en définit que **5** : `Master | Administrator | Coordinator | DigitalManager | Guest`.
  - **Manquants en base :** `Director`, `External`.
  - **Divergence de nommage :** `Digital Manager` (avec espace, frontend) vs `DigitalManager` (sans espace, base). Un token portant `'Digital Manager'` ne matcherait jamais `requireRole(['DigitalManager'])`.

Contenu intégral du middleware `backend/src/auth/middleware.ts` :

```ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'secret';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
};
```

---

## 6) UPLOADS DE FICHIERS

**Aucune gestion d'upload de fichiers n'existe.**
- **Pas de `multer`** (ni équivalent) : absent de `backend/package.json` (§7) et absent du code.
- **Pas de route/endpoint d'upload**, pas de `express.static`, pas de stockage disque/S3/bucket.
- Les champs liés aux médias ne sont que des **chaînes de caractères** :
  - `SocialPost.mediaFiles: String[]` → placeholders (le commentaire frontend dit lui-même « Placeholders for now »).
  - `User.avatarColor` → une couleur hexadécimale, **pas** une photo de profil.
  - **Chat images** (`ChatMessage.type: 'image'`) : aucun backend (ni modèle, ni upload).
  - **Médias calendrier / Material** : aucun backend.

**Conclusion : à construire intégralement** (choix stockage, endpoint multipart, validation MIME/taille, service de fichiers) si le besoin images chat / photos de profil / médias est confirmé.

---

## 7) DÉPENDANCES BACKEND

Contenu intégral de `backend/package.json` :

```json
{
  "name": "gearbox-backend",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "start": "node dist/index.js",
    "dev": "nodemon src/index.ts",
    "build": "tsc",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate deploy",
    "seed": "ts-node prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.10.2",
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.2",
    "socket.io": "^4.7.4"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/node": "^20.11.24",
    "nodemon": "^3.1.0",
    "prisma": "^5.10.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
```

**Observations :**
- Stack cohérente (Express 4, Prisma 5.10, socket.io 4.7, bcrypt, jsonwebtoken, dotenv, cors).
- `prisma:migrate` = `prisma migrate deploy` (mode production, applique les migrations existantes) — **or il n'existe pas de migration `init`** → un `deploy` sur base vierge échouerait (§2).
- **Aucune** dépendance de : validation (zod/joi), upload (multer), logging, tests, rate-limiting, helmet/sécurité HTTP.
- `dist/` n'est jamais généré (script `build` jamais lancé), `node_modules` jamais installé (§ TL;DR).

---

## 8) ÉCART AVEC LE FRONTEND (`types.ts` ↔ schéma Prisma)

Comparaison des interfaces frontend avec les modèles Prisma. **C'est un constat, pas une correction.**

### 8.1 Entités frontend SANS aucun modèle en base

| Entité frontend (`types.ts`) | État backend |
|---|---|
| **`FixedExpense`** (Dépenses Fixes) | ❌ Aucun modèle. `OneOffExpense` est une entité différente (one-off). Toute la feature Dépenses Fixes est hors base. |
| `ChatConversation` | ❌ Aucun modèle (Chat sans backend). |
| `ChatMessage` | ❌ Aucun modèle. |
| `ActivityLog` | ❌ Aucun modèle (le `db.logActivity` frontend n'a pas de destination serveur). |
| `Equipment` | ❌ Aucun modèle (module Material/réservations). |
| `EquipmentBooking` | ❌ Aucun modèle. |
| `Expense` (one-off, avec `name`/`parentId`/`category`) | ⚠️ `OneOffExpense` existe mais **structure différente** (voir 8.3). |

### 8.2 Champs frontend sans équivalent en base (sur entités qui, elles, existent)

| Champ frontend | Entité | En base ? | Note |
|---|---|---|---|
| `budgetDistribution` (`Record<string,number>`) | `Project` **et** `FixedExpense` | ❌ Non | Répartition multi-sites en %. Absente du modèle `Project` ; `FixedExpense` n'existe pas du tout. |
| `sites: string[]` | `Project` (et `FixedExpense`) | ❌ Non | Le modèle `Project` n'a que `site: String` (mono). |
| `assignedUsers: string[]` | `Project` | ❌ Non | Aucune relation projet↔utilisateurs. |
| `alpineShare` | `Project` **et** `FixedExpense` (usage runtime dans `Projects.tsx` / `FixedExpenses.tsx`) | ❌ Non | **Même pas déclaré dans `types.ts`** — champ dynamique non typé côté front, et absent en base. |
| `isAnnual` | `FixedExpense` | ❌ Non | Nouveau flag (dépense annuelle) — pas de modèle FixedExpense pour l'accueillir. |
| `provider` | `Task` | ❌ Non | Prestataire (texte libre). |
| `assignedUserId` | `Task` | ❌ Non | Assignation de tâche non persistée ; de plus le PUT projet recrée les tâches (perte). |
| `proPlus` (le « isPro » de la demande) | — | ⚠️ Partiel | **Le champ s'appelle `proPlus`, pas `isPro`.** Présent en base **seulement** sur `Project` et `OneOffExpense`. Absent de `Campaign`, `SocialPost`, et (inexistant) `FixedExpense`. |

> Note terminologique : la demande citait `isPro` — ce champ **n'existe nulle part**. Le champ réel est **`proPlus`** (PRO+ B2B), couvert en base uniquement pour `Project` et `OneOffExpense`.

### 8.3 `Expense` (frontend) vs `OneOffExpense` (base) — divergence de structure

| Frontend `Expense` | Prisma `OneOffExpense` |
|---|---|
| `name: string` | `comment: String?` (pas de `name`) |
| `category: string` | ❌ absent |
| `parentId?: string` | ❌ absent |
| *(pas de proPlus)* | `proPlus: Boolean` |
| `site: Site` (typé) / `service: ServiceType` | `site: String` / `service: String` (non contraints) |

### 8.4 Enum `UserRole`

- Frontend : 7 valeurs (`Master, Administrator, Director, Coordinator, Digital Manager, Guest, External`).
- Base : 5 valeurs (`Master, Administrator, Coordinator, DigitalManager, Guest`).
- **Manquent en base :** `Director`, `External`. **Nommage divergent :** `Digital Manager` (front) vs `DigitalManager` (base). Voir §5.

### 8.5 Entités bien alignées (pour équilibrer le constat)

- **`SocialPost`** : alignement quasi complet (tous les champs présents des deux côtés).
- **`BudgetLine`** : aligné (le `entries` JSON reflète `{VN,VO,PR,APV: number[]}`), avec contrainte `@@unique([site, year])`.
- **`Campaign`** : structure proche (petites différences d'unions de types, stockées en `String`).
- **`User`** (hors enum de rôles) : aligné.

---

## Synthèse des chantiers à prévoir (hors périmètre de cet audit — non implémentés)

1. **Rendre le backend exécutable** : `npm install` (backend), `prisma generate`, créer une **migration `init` baseline** (les tables n'ont aucune migration de création), puis `migrate deploy` + seed.
2. **Combler les entités manquantes** : `FixedExpense` (avec `budgetDistribution`, `isAnnual`, multi-sites, marques/routage), Chat (`Conversation`/`Message` + temps réel + persistance), `ActivityLog`, `Equipment`/`Booking`.
3. **Champs manquants** sur entités existantes : `Project.sites`/`budgetDistribution`/`assignedUsers`/`alpineShare`, `Task.provider`/`assignedUserId` ; réconcilier `Expense` ↔ `OneOffExpense`.
4. **Sécurité** : protéger `users` et `seed` (auth + rôles), retirer le fallback `JWT_SECRET='secret'`, sécuriser la socket, valider les `req.body` (zod/joi), envisager helmet + rate-limiting.
5. **Rôles** : aligner l'enum (`Director`, `External`) et le nommage (`Digital Manager` vs `DigitalManager`).
6. **Uploads** : tout construire (stockage + endpoint multipart + validation) pour images chat / photos de profil / médias.
7. **Robustesse routes** : corriger le PUT projets (upsert des tâches au lieu de delete/recreate), compléter `budget` (PUT/DELETE).

---

*Fin de l'audit. Ce document reflète l'état du code au moment de sa génération ; aucun fichier source n'a été modifié.*
