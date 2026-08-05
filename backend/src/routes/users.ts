import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { VALID_ROLES, isValidRole, canAssignRole, forbiddenRoleMessage, USER_DELETE_ROLES } from '../auth/roles';
import { emitEvent, notifyUserChanged } from '../realtime';
// Projection publique partagée avec routes/auth.ts — voir utils/publicUser.ts pour
// la règle (ne jamais faire sortir l'objet Prisma brut, il porte `passwordHash`).
import { publicUser } from '../utils/publicUser';

const router = Router();
const prisma = new PrismaClient();

// Gestion des comptes = action sensible : mutations réservées Master/Administrator/Director
// (Director = parité Administrator, décision du 8 juillet 2026).
const ADMIN_ROLES = ['Master', 'Administrator', 'Director'];

const invalidRoleMessage = (role: unknown) =>
  `Rôle invalide: "${String(role)}". Valeurs acceptées: ${VALID_ROLES.join(', ')}.`;

// GET all users — lecture ouverte à tout utilisateur authentifié (liste utilisée par l'UI)
router.get('/', authenticateToken, async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users.map(publicUser));
});

// POST create user
router.post('/', authenticateToken, requireRole(ADMIN_ROLES), async (req: AuthRequest, res) => {
  // ⚠️ Cette route DÉSTRUCTURE explicitement chaque champ : un nouveau champ doit
  // être ajouté ici, dans le PUT, dans `updateData` ET dans `publicUser`. En oublier
  // un fait disparaître la valeur en silence — c'est exactement le piège du
  // `nissanShare` (correctif 24).
  const { name, loginId, password, role, avatarColor, avatarUrl, birthdate } = req.body;

  // role est un String libre en base (plus d'enum) : validation explicite obligatoire.
  if (!isValidRole(role)) {
    return res.status(400).json({ error: invalidRoleMessage(role) });
  }
  // Un Director ne peut pas CRÉER un compte Master/Administrator/Director — sinon la
  // restriction du PUT se contournerait en créant directement le compte voulu.
  if (!canAssignRole(req.user?.role, role)) {
    return res.status(403).json({ error: forbiddenRoleMessage(role) });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: { name, loginId, passwordHash, role, avatarColor, avatarUrl, birthdate }
    });
    emitEvent('users:updated', publicUser(user));
    res.json(publicUser(user));
  } catch (e) {
    res.status(400).json({ error: 'User creation failed' });
  }
});

// PUT update user
router.put('/:id', authenticateToken, requireRole(ADMIN_ROLES), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { name, loginId, password, role, avatarColor, avatarUrl, birthdate } = req.body;

  // role optionnel en mise à jour, mais s'il est fourni il doit être valide.
  if (role !== undefined && !isValidRole(role)) {
    return res.status(400).json({ error: invalidRoleMessage(role) });
  }
  // ⚠️ LE garde-fou de l'escalade de privilège. Sans lui, un Director s'attribuait
  // Administrator ou Master en un PUT sur son propre id. Le contrôle porte sur le rôle
  // DEMANDÉ, quelle que soit la cible : soi-même comme un complice.
  if (role !== undefined && !canAssignRole(req.user?.role, role)) {
    return res.status(403).json({ error: forbiddenRoleMessage(role) });
  }

  const updateData: any = { name, loginId, role, avatarColor };
  if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl; // null = suppression
  // Même convention qu'avatarUrl : undefined = champ absent (non modifié) ;
  // chaîne vide ou null = l'anniversaire est effacé.
  if (birthdate !== undefined) updateData.birthdate = birthdate || null;
  if (password) {
    updateData.passwordHash = await bcrypt.hash(password, 10);
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: updateData
    });
    emitEvent('users:updated', publicUser(user));
    notifyUserChanged(id); // nom/couleur/photo affichés par la présence
    res.json(publicUser(user));
  } catch (e) {
    res.status(400).json({ error: 'User update failed' });
  }
});

// DELETE user — ⚠️ PAS `ADMIN_ROLES` : la suppression est réservée à Master et
// Administrator (`USER_DELETE_ROLES`). Un Director ne supprime aucun compte, pas même
// un Coordinator : il ne peut déjà plus promouvoir personne, lui laisser l'effacement
// serait incohérent, et c'est irréversible.
router.delete('/:id', authenticateToken, requireRole(USER_DELETE_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.user.delete({ where: { id } });
    emitEvent('users:deleted', id);
    notifyUserChanged(id); // purge la présence du compte supprimé
    res.sendStatus(204);
  } catch (e) {
    res.status(400).json({ error: 'User deletion failed' });
  }
});

export default router;
