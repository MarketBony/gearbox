import { Router } from 'express';
import { authenticateToken, requireRole } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { prisma } from '../db';

const router = Router();

// Catalogue matériel : gestion réservée Master/Administrator/Director,
// aligné sur canManageCatalog de Material.tsx (Director = parité Administrator).
const MANAGE_ROLES = ['Master', 'Administrator', 'Director'];

// Contrat aligné sur le frontend (types.ts Equipment + pages/Material.tsx) :
// { name, totalQuantity, category? }. Stockage brut, aucun calcul de
// disponibilité côté serveur (le frontend calcule tout en mémoire).

const isPositiveInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0;

router.get('/', authenticateToken, async (req, res) => {
  const equipment = await prisma.equipment.findMany({ orderBy: { name: 'asc' } });
  res.json(equipment);
});

router.post('/', authenticateToken, requireRole(MANAGE_ROLES), async (req, res) => {
  const { name, totalQuantity, category } = req.body;

  if (typeof name !== 'string' || name.length === 0) {
    return res.status(400).json({ error: 'Champ "name" requis (chaîne non vide).' });
  }
  if (!isPositiveInt(totalQuantity)) {
    return res.status(400).json({ error: 'Champ "totalQuantity" requis (entier positif).' });
  }
  if (category !== undefined && category !== null && typeof category !== 'string') {
    return res.status(400).json({ error: 'Champ "category" invalide : chaîne attendue.' });
  }

  const equipment = await prisma.equipment.create({
    data: { name, totalQuantity, category: category ?? undefined }
  });
  emitEvent('equipment:created', equipment);
  res.json(equipment);
});

// PUT /:id — mise à jour partielle (pattern fixedExpenses.ts)
router.put('/:id', authenticateToken, requireRole(MANAGE_ROLES), async (req, res) => {
  const { id } = req.params;
  const { name, totalQuantity, category } = req.body;

  if (name !== undefined && (typeof name !== 'string' || name.length === 0)) {
    return res.status(400).json({ error: 'Champ "name" invalide (chaîne non vide attendue).' });
  }
  if (totalQuantity !== undefined && !isPositiveInt(totalQuantity)) {
    return res.status(400).json({ error: 'Champ "totalQuantity" invalide (entier positif attendu).' });
  }
  if (category !== undefined && category !== null && typeof category !== 'string') {
    return res.status(400).json({ error: 'Champ "category" invalide : chaîne attendue.' });
  }

  try {
    const equipment = await prisma.equipment.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(totalQuantity !== undefined ? { totalQuantity } : {}),
        ...(category !== undefined ? { category } : {})
      }
    });
    emitEvent('equipment:updated', equipment);
    res.json(equipment);
  } catch (e) {
    res.status(404).json({ error: 'Matériel introuvable.' });
  }
});

// DELETE /:id — la cascade FK supprime aussi les réservations liées (même
// pattern que Project→Task dans projects.ts : suppression directe, pas de blocage).
router.delete('/:id', authenticateToken, requireRole(MANAGE_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.equipment.delete({ where: { id } });
    emitEvent('equipment:deleted', id);
    res.sendStatus(204);
  } catch (e) {
    res.status(404).json({ error: 'Matériel introuvable.' });
  }
});

export default router;
