import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

const prisma = new PrismaClient();

async function main() {
  // Rôles = chaînes libres alignées sur types.ts (UserRole frontend, 7 valeurs valides,
  // dont "Digital Manager" avec espace) — l'enum Prisma a été supprimé du schéma.
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

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
