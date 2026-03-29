import { Router } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const users = [
      { name: 'Théo Labonne', loginId: 'theo', role: UserRole.Master, color: '#f75632' },
      { name: 'Admin User', loginId: 'admin', role: UserRole.Administrator, color: '#8f12ab' },
      { name: 'Coord User', loginId: 'coord', role: UserRole.Coordinator, color: '#293f74' },
      { name: 'Digital Mgr', loginId: 'digital', role: UserRole.DigitalManager, color: '#10b981' },
      { name: 'Guest User', loginId: 'guest', role: UserRole.Guest, color: '#64748b' },
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
