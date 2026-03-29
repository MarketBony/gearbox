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
