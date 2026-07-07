import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { authenticateToken, requireRole } from '../auth/middleware';
import { VALID_ROLES, isValidRole } from '../auth/roles';

const router = Router();
const prisma = new PrismaClient();

// Gestion des comptes = action sensible : mutations réservées Master/Administrator.
const ADMIN_ROLES = ['Master', 'Administrator'];

const invalidRoleMessage = (role: unknown) =>
  `Rôle invalide: "${String(role)}". Valeurs acceptées: ${VALID_ROLES.join(', ')}.`;

// GET all users — lecture ouverte à tout utilisateur authentifié (liste utilisée par l'UI)
router.get('/', authenticateToken, async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users.map(u => ({ id: u.id, name: u.name, loginId: u.loginId, role: u.role, avatarColor: u.avatarColor })));
});

// POST create user
router.post('/', authenticateToken, requireRole(ADMIN_ROLES), async (req, res) => {
  const { name, loginId, password, role, avatarColor } = req.body;

  // role est un String libre en base (plus d'enum) : validation explicite obligatoire.
  if (!isValidRole(role)) {
    return res.status(400).json({ error: invalidRoleMessage(role) });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: { name, loginId, passwordHash, role, avatarColor }
    });
    res.json({ id: user.id, name: user.name, loginId: user.loginId, role: user.role, avatarColor: user.avatarColor });
  } catch (e) {
    res.status(400).json({ error: 'User creation failed' });
  }
});

// PUT update user
router.put('/:id', authenticateToken, requireRole(ADMIN_ROLES), async (req, res) => {
  const { id } = req.params;
  const { name, loginId, password, role, avatarColor } = req.body;

  // role optionnel en mise à jour, mais s'il est fourni il doit être valide.
  if (role !== undefined && !isValidRole(role)) {
    return res.status(400).json({ error: invalidRoleMessage(role) });
  }

  const updateData: any = { name, loginId, role, avatarColor };
  if (password) {
    updateData.passwordHash = await bcrypt.hash(password, 10);
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: updateData
    });
    res.json({ id: user.id, name: user.name, loginId: user.loginId, role: user.role, avatarColor: user.avatarColor });
  } catch (e) {
    res.status(400).json({ error: 'User update failed' });
  }
});

// DELETE user
router.delete('/:id', authenticateToken, requireRole(ADMIN_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.user.delete({ where: { id } });
    res.sendStatus(204);
  } catch (e) {
    res.status(400).json({ error: 'User deletion failed' });
  }
});

export default router;
