import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const router = Router();
const prisma = new PrismaClient();

// GET all users
router.get('/', async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users.map(u => ({ id: u.id, name: u.name, loginId: u.loginId, role: u.role, avatarColor: u.avatarColor })));
});

// POST create user
router.post('/', async (req, res) => {
  const { name, loginId, password, role, avatarColor } = req.body;
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
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, loginId, password, role, avatarColor } = req.body;
  
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
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.user.delete({ where: { id } });
    res.sendStatus(204);
  } catch (e) {
    res.status(400).json({ error: 'User deletion failed' });
  }
});

export default router;
