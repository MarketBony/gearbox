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
