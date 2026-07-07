import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../auth/middleware';
import { emitEvent } from '../realtime';

const router = Router();
const prisma = new PrismaClient();
const EDIT_ROLES = ['Master', 'Administrator'];

// Contrat aligné sur le frontend (types.ts BudgetLine + db.saveBudgets) :
// une ligne de prévisionnel par site/bucket, identifiée par `site` (unique en base),
// entries = { VN: number[12], VO: number[12], PR: number[12], APV: number[12] }.
// Cette route ne fait que stocker/renvoyer les valeurs brutes — toute l'agrégation
// (buckets Alpine/Nissan, filtres...) reste côté frontend.

router.get('/', authenticateToken, async (req, res) => {
  const budgets = await prisma.budgetLine.findMany();
  res.json(budgets);
});

// POST / — upsert par site (le frontend n'a pas d'id : l'identité d'une ligne est son site)
router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { site, entries, brands } = req.body;

  if (typeof site !== 'string' || site.length === 0) {
    return res.status(400).json({ error: 'Champ "site" requis (chaîne non vide).' });
  }
  if (entries === undefined || entries === null || typeof entries !== 'object') {
    return res.status(400).json({ error: 'Champ "entries" requis (objet { VN, VO, PR, APV } de 12 valeurs mensuelles).' });
  }

  const budget = await prisma.budgetLine.upsert({
    where: { site },
    update: { entries, brands: brands ?? [] },
    create: { site, entries, brands: brands ?? [] }
  });
  emitEvent('budget:updated', budget);
  res.json(budget);
});

// PUT /:id — mise à jour partielle par id (les ids sont renvoyés par le GET)
router.put('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  const { site, entries, brands } = req.body;

  if (site !== undefined && (typeof site !== 'string' || site.length === 0)) {
    return res.status(400).json({ error: 'Champ "site" invalide (chaîne non vide attendue).' });
  }

  try {
    const budget = await prisma.budgetLine.update({
      where: { id },
      data: {
        ...(site !== undefined ? { site } : {}),
        ...(entries !== undefined ? { entries } : {}),
        ...(brands !== undefined ? { brands } : {})
      }
    });
    emitEvent('budget:updated', budget);
    res.json(budget);
  } catch (e) {
    res.status(404).json({ error: 'Ligne de budget introuvable.' });
  }
});

// DELETE /:id
router.delete('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.budgetLine.delete({ where: { id } });
    emitEvent('budget:deleted', id);
    res.sendStatus(204);
  } catch (e) {
    res.status(404).json({ error: 'Ligne de budget introuvable.' });
  }
});

export default router;
