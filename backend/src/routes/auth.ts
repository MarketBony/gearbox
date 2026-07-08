import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { JWT_SECRET as SECRET } from '../auth/secret';

const router = Router();
const prisma = new PrismaClient();

router.post('/login', async (req, res) => {
  const { loginId, password } = req.body;

  // Body vide ou partiel (scanner, client mal formé) : 400 explicite plutôt
  // qu'un 500 Prisma (findUnique refuse un where sans loginId).
  if (!loginId || !password) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
  }

  const user = await prisma.user.findUnique({ where: { loginId } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, avatarColor: user.avatarColor, avatarUrl: user.avatarUrl } });
});

router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET, async (err: any, decoded: any) => {
    if (err) return res.sendStatus(403);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.sendStatus(404);
    res.json({ id: user.id, name: user.name, role: user.role, avatarColor: user.avatarColor, avatarUrl: user.avatarUrl });
  });
});

router.put('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET, async (err: any, decoded: any) => {
    if (err) return res.sendStatus(403);
    const { name, password, avatarColor, avatarUrl } = req.body;

    // avatarUrl : undefined = champ absent (non modifié) ; null = suppression de la photo.
    const updateData: any = { name, avatarColor };
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: decoded.id },
      data: updateData
    });

    res.json({ id: updatedUser.id, name: updatedUser.name, role: updatedUser.role, avatarColor: updatedUser.avatarColor, avatarUrl: updatedUser.avatarUrl });
  });
});

export default router;
