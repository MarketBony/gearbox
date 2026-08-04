import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { JWT_SECRET as SECRET } from '../auth/secret';
import { publicUser } from '../utils/publicUser';
import { emitEvent, notifyUserChanged } from '../realtime';

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
  res.json({ token, user: publicUser(user) });
});

// ⚠️ RÈGLE À NE PAS ENFREINDRE ICI : jamais d'accès base dans un rappel passé à
// une API non promise (`jwt.verify(token, secret, cb)`, `setTimeout`, un handler
// socket sans try/catch). Un tel rappel s'exécute APRÈS que le handler Express a
// rendu la main : la promesse qu'il renvoie n'est attendue par personne, donc ni
// express-async-errors ni middleware/errorHandler.ts ne peuvent la voir. Node la
// classe en « unhandled rejection » et TERMINE le process — une coupure Supabase
// de deux secondes a ainsi tué l'API le 30/07/2026.
// On utilise donc la forme SYNCHRONE de jwt.verify (elle lève si le jeton est
// invalide) et on garde l'accès base dans le handler async, sous le filet.
const decodeToken = (req: { headers: Record<string, any> }): { id: string; role: string } | null => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET) as { id: string; role: string };
  } catch {
    return null; // jeton absent, malformé ou expiré
  }
};

router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  const decoded = decodeToken(req);
  if (!decoded) return res.sendStatus(403);

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) return res.sendStatus(404);
  res.json(publicUser(user));
});

router.put('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  const decoded = decodeToken(req);
  if (!decoded) return res.sendStatus(403);

  const { name, password, avatarColor, avatarUrl, birthdate } = req.body;

  // avatarUrl : undefined = champ absent (non modifié) ; null = suppression de la photo.
  const updateData: any = { name, avatarColor };
  if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
  // Même convention : undefined = non modifié ; vide = anniversaire effacé.
  if (birthdate !== undefined) updateData.birthdate = birthdate || null;
  if (password) {
    updateData.passwordHash = await bcrypt.hash(password, 10);
  }

  const updatedUser = await prisma.user.update({
    where: { id: decoded.id },
    data: updateData
  });

  // ⚠️ Cette route n'émettait RIEN et n'appelait pas notifyUserChanged, alors que
  // routes/users.ts fait les deux. Conséquence : modifier son propre profil (nom,
  // avatar, et maintenant anniversaire) ne rafraîchissait ni les autres clients ni
  // le cache de présence — il fallait un F5. Manque préexistant, corrigé ici parce
  // que le bloc « Anniversaires » de Hello Marketing en dépend directement.
  emitEvent('users:updated', publicUser(updatedUser));
  notifyUserChanged(decoded.id);

  res.json(publicUser(updatedUser));
});

export default router;
