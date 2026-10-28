import { Router } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { prisma } from '../db';
import { TODO_ROLES, TASK_EDIT_ROLES } from '../auth/roles';
import { normaliserAssignes, nouveauxAssignes, verifierNouveauxAssignes, AssigneInvalideError } from '../utils/taskAssignees';

const router = Router();

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
const EDIT_ROLES = TASK_EDIT_ROLES;   // source unique : auth/roles.ts (28/10/2026)

// Champs acceptés en écriture — liste blanche, comme `TASK_FIELDS` de projects.ts :
// le frontend renvoie des objets issus d'un GET, `id`/`createdAt`/`projectId` ne sont
// pas des données d'entrée.
// ⚠️ `assignedUserIds` ajouté le 16/10/2026 (multi-assignés), dans le même lot que la colonne. La cohérence
// avec `assignedUserId` (= premier de la liste) est tenue par `normaliserAssignes` (utils/taskAssignees.ts).
const FIELDS = [
  'name', 'provider', 'channel', 'status', 'assignedUserId', 'assignedUserIds',
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
// ⚠️ LECTURE ouverte aux rôles qui ont la To-do (`TODO_ROLES`, donc le Guest) depuis le 16/10/2026 : une tâche libre
// peut désormais être attribuée à n'importe quel rôle de la To-do, et un Guest assigné ne l'aurait jamais vue.
// L'ÉCRITURE reste à EDIT_ROLES. Ni External ni chef de site (pas de To-do).
// Un rôle de la To-do qui n'ÉDITE pas (Guest…) ne reçoit que les tâches libres qui lui sont attribuées (Théo, 16/10/2026) :
// filtré ICI, côté serveur — un filtre front laisserait les autres lisibles dans l'onglet Réseau.
router.get('/', authenticateToken, requireRole(TODO_ROLES), async (req: AuthRequest, res) => {
  const mine = EDIT_ROLES.includes(req.user!.role) ? {} : { assignedUserIds: { has: req.user!.id } };
  const tasks = await prisma.task.findMany({ where: { projectId: null, ...mine } });
  res.json(tasks);
});

/** Attribution refusée → 400 avec son message fixe ; toute autre erreur suit son cours. */
const refusAssigne = (res: any, e: unknown) => {
  if (e instanceof AssigneInvalideError) { res.status(400).json({ error: e.message }); return true; }
  return false;
};

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const data = normaliserAssignes(pick(req.body));
  if (typeof data.name !== 'string' || !data.name.trim()) {
    return res.status(400).json({ error: 'Le nom de la tâche est obligatoire.' });
  }
  try { await verifierNouveauxAssignes(prisma, nouveauxAssignes(data)); } catch (e) { if (refusAssigne(res, e)) return; throw e; }
  const task = await prisma.task.create({
    data: { ...data, projectId: null, channel: data.channel ?? '', status: data.status ?? 'Todo' },
  });
  emitEvent('tasks:updated', task);
  res.json(task);
});

router.put('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  // La ligne en base est lue AVANT l'écriture : c'est l'état de référence de `normaliserAssignes` (qui, de la liste
  // ou du premier assigné, a changé ?) et de la vérification des seuls assignés AJOUTÉS.
  const ancienne = await prisma.task.findFirst({ where: { id, projectId: null }, select: { assignedUserId: true, assignedUserIds: true } });
  if (!ancienne) return res.status(404).json({ error: 'Tâche autonome introuvable.' });
  const data = normaliserAssignes(pick(req.body), ancienne);
  try { await verifierNouveauxAssignes(prisma, nouveauxAssignes(data, ancienne)); } catch (e) { if (refusAssigne(res, e)) return; throw e; }
  try {
    // `updateMany` avec `projectId: null` plutôt qu'`update` par id : c'est ce qui
    // garantit qu'un id de tâche DE PROJET envoyé ici ne peut rien modifier (il ne
    // matche pas le where et l'update porte sur 0 ligne).
    const { count } = await prisma.task.updateMany({
      where: { id, projectId: null },
      data,
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
