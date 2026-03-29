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
