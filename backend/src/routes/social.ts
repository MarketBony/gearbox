import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { withDates } from '../utils/dates';

const router = Router();
const prisma = new PrismaClient();
const EDIT_ROLES = ['Master', 'Administrator', 'DigitalManager'];

router.get('/', authenticateToken, async (req, res) => {
  const posts = await prisma.socialPost.findMany();
  res.json(posts);
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const post = await prisma.socialPost.create({ data: withDates(req.body, ['date']) });
  emitEvent('social:updated', post);
  res.json(post);
});

router.put('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  const post = await prisma.socialPost.update({ where: { id }, data: withDates(req.body, ['date']) });
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
