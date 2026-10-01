import { Router } from 'express';
import bcrypt from 'bcrypt';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { VALID_ROLES, isValidRole, canAssignRole, forbiddenRoleMessage, USER_DELETE_ROLES, hasSocialFeatures } from '../auth/roles';
import { ALL_SITES } from '../auth/siteScope';
import { emitEvent, notifyUserChanged } from '../realtime';
// Projection publique partagée avec routes/auth.ts — voir utils/publicUser.ts pour
// la règle (ne jamais faire sortir l'objet Prisma brut, il porte `passwordHash`).
import { publicUser } from '../utils/publicUser';
import { prisma } from '../db';

const router = Router();

// Gestion des comptes = action sensible : mutations réservées Master/Administrator/Director
// (Director = parité Administrator, décision du 8 juillet 2026).
const ADMIN_ROLES = ['Master', 'Administrator', 'Director'];

// Périmètre reçu du client : on ne lui fait pas confiance. Seules des valeurs de
// `ALL_SITES` sont retenues — sans ce filtre, on pourrait écrire n'importe quelle
// chaîne, qui ne correspondrait à aucune donnée (périmètre silencieusement vide) ou
// servirait à sonder les valeurs acceptées.
const cleanSites = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((s): s is string => typeof s === 'string' && ALL_SITES.includes(s)))];
};

const invalidRoleMessage = (role: unknown) =>
  `Rôle invalide: "${String(role)}". Valeurs acceptées: ${VALID_ROLES.join(', ')}.`;

// GET all users — lecture ouverte à tout utilisateur authentifié (liste utilisée par
// l'UI pour résoudre les noms, avatars, anniversaires…).
//
// ⚠️ SAUF les rôles sans vie sociale : Théo a explicitement exclu la « consultation des
// autres users » pour un chef de site. Il n'a besoin que de son propre compte, servi par
// `GET /api/auth/me`. On renvoie donc la liste réduite à lui-même plutôt qu'un 403 : les
// écrans partagés (résolution d'un nom d'auteur) continuent de fonctionner sans cas
// particulier côté frontend.
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  if (!hasSocialFeatures(req.user?.role)) {
    const moi = await prisma.user.findUnique({ where: { id: req.user!.id } });
    return res.json(moi ? [publicUser(moi)] : []);
  }
  const users = await prisma.user.findMany();
  res.json(users.map(publicUser));
});

// POST create user
router.post('/', authenticateToken, requireRole(ADMIN_ROLES), async (req: AuthRequest, res) => {
  // ⚠️ Cette route DÉSTRUCTURE explicitement chaque champ : un nouveau champ doit
  // être ajouté ici, dans le PUT, dans `updateData` ET dans `publicUser`. En oublier
  // un fait disparaître la valeur en silence — c'est exactement le piège du
  // `nissanShare` (correctif 24).
  const { name, loginId, password, role, avatarColor, avatarUrl, birthdate, sites } = req.body;

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
      data: { name, loginId, passwordHash, role, avatarColor, avatarUrl, birthdate, sites: cleanSites(sites) }
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
  const { name, loginId, password, role, avatarColor, avatarUrl, birthdate, sites } = req.body;

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
  // Périmètre du chef de site. Même convention : undefined = non modifié.
  if (sites !== undefined) updateData.sites = cleanSites(sites);
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
    // Post-it : données PERSONNELLES, sans FK (style du schéma) — supprimées avec le compte,
    // sinon orphelines à jamais (personne d'autre ne peut les lire ni les effacer).
    await prisma.postIt.deleteMany({ where: { userId: id } });
    emitEvent('users:deleted', id);
    notifyUserChanged(id); // purge la présence du compte supprimé
    res.sendStatus(204);
  } catch (e) {
    res.status(400).json({ error: 'User deletion failed' });
  }
});

export default router;
