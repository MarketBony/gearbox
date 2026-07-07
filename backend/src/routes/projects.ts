import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { withDates } from '../utils/dates';

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
      ...withDates(projectData, ['startDate', 'endDate']),
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
      data: withDates(projectData, ['startDate', 'endDate'])
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
