import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { authenticateToken, requireRole } from '../auth/middleware';

const router = Router();
const prisma = new PrismaClient();

// Relance du seed = action sensible (reset des mots de passe démo) :
// authentification + rôles Master/Administrator exigés.
router.get('/', authenticateToken, requireRole(['Master', 'Administrator']), async (req, res) => {
  try {
    // Rôles = chaînes libres alignées sur types.ts (l'enum Prisma UserRole a été supprimé).
    const users = [
      { name: 'Théo Labonne', loginId: 'theo', role: 'Master', color: '#f75632' },
      { name: 'Admin User', loginId: 'admin', role: 'Administrator', color: '#8f12ab' },
      { name: 'Coord User', loginId: 'coord', role: 'Coordinator', color: '#293f74' },
      { name: 'Digital Mgr', loginId: 'digital', role: 'Digital Manager', color: '#10b981' },
      { name: 'Guest User', loginId: 'guest', role: 'Guest', color: '#64748b' },
    ];

    for (const u of users) {
      const password = u.loginId === 'theo' ? 'admin' : 'password';
      const hash = await bcrypt.hash(password, 10);
      await prisma.user.upsert({
        where: { loginId: u.loginId },
        update: {
          passwordHash: hash // Update password if user exists
        },
        create: {
          loginId: u.loginId,
          name: u.name,
          passwordHash: hash,
          role: u.role,
          avatarColor: u.color
        }
      });
    }

    // Create initial tags if not exist
    const tags = await prisma.digitalTags.findFirst();
    if (!tags) {
      await prisma.digitalTags.create({
        data: {
          networks: ['Facebook', 'Instagram', 'LinkedIn'],
          co2: ['A', 'B', 'C', 'D', 'E', 'F', 'G']
        }
      });
    }

    res.json({ message: 'Seeding completed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Seeding failed', details: error });
  }
});

export default router;
