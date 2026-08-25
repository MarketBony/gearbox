import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../auth/middleware';
import { emitEvent } from '../realtime';

const router = Router();
const prisma = new PrismaClient();
// 'Digital Manager' avec espace (rôle réel en base) — 'DigitalManager' ne matchait jamais.
// ⚠️ 'External' ajouté le 25/08/2026 : Théo lui a donné l'accès TOTAL au Digital,
// tags compris. Sans cette ligne, l'écran lui afficherait des contrôles de tags que
// l'API refuserait en 403 — le motif « l'interface ment » qui a déjà coûté deux passes.
// Doit rester aligné sur `DIGITAL_EDIT_ROLES` de constants.ts et sur social.ts.
const EDIT_ROLES = ['Master', 'Administrator', 'Director', 'Digital Manager', 'External'];

router.get('/', authenticateToken, async (req, res) => {
  const tags = await prisma.digitalTags.findFirst();
  res.json(tags || { networks: [], co2: [] });
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const count = await prisma.digitalTags.count();
  let tags;
  if (count === 0) {
    tags = await prisma.digitalTags.create({ data: req.body });
  } else {
    // Assuming single row for tags
    const first = await prisma.digitalTags.findFirst();
    if (first) {
        tags = await prisma.digitalTags.update({ where: { id: first.id }, data: req.body });
    }
  }
  emitEvent('tags:updated', tags);
  res.json(tags);
});

export default router;
