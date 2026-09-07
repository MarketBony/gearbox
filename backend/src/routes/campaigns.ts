import { Router } from 'express';
import { authenticateToken, requireRole } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { withDates } from '../utils/dates';
import { prisma } from '../db';

const router = Router();
const EDIT_ROLES = ['Master', 'Administrator', 'Director', 'Coordinator'];

router.get('/', authenticateToken, async (req, res) => {
  const campaigns = await prisma.campaign.findMany();
  res.json(campaigns);
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const campaign = await prisma.campaign.create({ data: withDates(req.body, ['startDate', 'endDate']) });
  emitEvent('campaigns:updated', campaign);
  res.json(campaign);
});

router.put('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  const campaign = await prisma.campaign.update({ where: { id }, data: withDates(req.body, ['startDate', 'endDate']) });
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
