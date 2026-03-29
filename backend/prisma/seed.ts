import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

const prisma = new PrismaClient();

async function main() {
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
