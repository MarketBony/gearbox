import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { emitEvent } from '../realtime';

const router = Router();
const prisma = new PrismaClient();

// ============================================================================
// TÂCHES AUTONOMES — tâches de la To-do qui n'appartiennent à AUCUN projet.
//
// ⚠️ PÉRIMÈTRE STRICT : cette route ne voit et ne touche QUE les tâches dont
// `projectId` est null. Toutes les requêtes portent `projectId: null`, sans
// exception. Les tâches de projet continuent de passer exclusivement par
// `/api/projects` (diff transactionnel du PUT) — deux chemins d'écriture vers les
// mêmes lignes seraient exactement la duplication qui a fait diverger Budget et
// Dashboard quatre fois.
//
// ⚠️ Réciproquement, le diff de `projects.ts` ne peut pas atteindre ces lignes : son
// `deleteMany` est borné par `where: { projectId: id }`, et `null` n'y matche jamais.
// ============================================================================

// Rôles autorisés à créer/supprimer une tâche autonome. Aligné sur les `EDIT_ROLES`
// de `projects.ts`.
// ⚠️ Le rôle « Site Manager » n'a PAS la rubrique To-do (`SITE_MANAGER_SECTIONS`,
// auth/roles.ts). Il est donc absent de cette liste — mais ce n'est pas parce que
// l'interface la lui masque : masquer une rubrique ne ferme pas une route, leçon qui
// a coûté deux passes au lot du chef de site. Le refus est ici, côté serveur.
const EDIT_ROLES = ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager'];

// Champs acceptés en écriture — liste blanche, comme `TASK_FIELDS` de projects.ts :
// le frontend renvoie des objets issus d'un GET, `id`/`createdAt`/`projectId` ne sont
// pas des données d'entrée.
const FIELDS = [
  'name', 'provider', 'channel', 'status', 'assignedUserId',
  'deadline', 'sites', 'brands', 'service',
] as const;

const pick = (t: any) => {
  const data: any = {};
  for (const f of FIELDS) if (t[f] !== undefined) data[f] = t[f];
  // ⚠️ `cost` est volontairement ABSENT de la liste blanche : une tâche autonome n'a
  // pas de budget (décision de Théo). La colonne étant non-nullable, on force 0 —
  // sans quoi elle remonterait dans les agrégations comme une valeur non initialisée.
  data.cost = 0;
  return data;
};

// GET /api/tasks — les tâches autonomes uniquement.
router.get('/', authenticateToken, requireRole(EDIT_ROLES), async (_req: AuthRequest, res) => {
  const tasks = await prisma.task.findMany({ where: { projectId: null } });
  res.json(tasks);
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const data = pick(req.body);
  if (typeof data.name !== 'string' || !data.name.trim()) {
    return res.status(400).json({ error: 'Le nom de la tâche est obligatoire.' });
  }
  const task = await prisma.task.create({
    data: { ...data, projectId: null, channel: data.channel ?? '', status: data.status ?? 'Todo' },
  });
  emitEvent('tasks:updated', task);
  res.json(task);
});

router.put('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    // `updateMany` avec `projectId: null` plutôt qu'`update` par id : c'est ce qui
    // garantit qu'un id de tâche DE PROJET envoyé ici ne peut rien modifier (il ne
    // matche pas le where et l'update porte sur 0 ligne).
    const { count } = await prisma.task.updateMany({
      where: { id, projectId: null },
      data: pick(req.body),
    });
    if (count === 0) return res.status(404).json({ error: 'Tâche autonome introuvable.' });
  } catch (e) {
    return res.status(404).json({ error: 'Tâche autonome introuvable.' });
  }
  const task = await prisma.task.findUnique({ where: { id } });
  emitEvent('tasks:updated', task);
  res.json(task);
});

router.delete('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  const { count } = await prisma.task.deleteMany({ where: { id: req.params.id, projectId: null } });
  if (count === 0) return res.status(404).json({ error: 'Tâche autonome introuvable.' });
  emitEvent('tasks:deleted', id);
  res.sendStatus(204);
});

export default router;
