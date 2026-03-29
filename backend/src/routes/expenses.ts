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
    const { date, service, site, comment, amount } = req.body;
    const expense = await prisma.oneOffExpense.create({
      data: {
        date: new Date(date),
        service,
        site,
        comment,
        amount: parseFloat(amount)
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
    const { date, service, site, comment, amount } = req.body;
    const expense = await prisma.oneOffExpense.update({
      where: { id },
      data: {
        date: new Date(date),
        service,
        site,
        comment,
        amount: parseFloat(amount)
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
