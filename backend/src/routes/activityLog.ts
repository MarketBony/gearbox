import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../auth/middleware';
import { emitEvent } from '../realtime';

const router = Router();
const prisma = new PrismaClient();

// Journal d'activité : immuable (pas de PUT/DELETE, le modèle n'a pas d'updatedAt).
// Règles répliquées de dataService.logActivity (côté écriture, comme au frontend) :
// - les actions du rôle Master ne sont PAS journalisées (skip silencieux)
// - plafond 200 : appliqué à la lecture (take 200, récent d'abord) — l'équivalent
//   du slice(0,200) frontend ; pas de purge à l'écriture (rotation à décider plus tard)

router.get('/', authenticateToken, async (req, res) => {
  const entries = await prisma.activityLog.findMany({
    orderBy: { timestamp: 'desc' },
    take: 200
  });
  res.json(entries);
});

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  // Règle Master exclu — basée sur le rôle du JWT (l'acteur authentifié),
  // plus fiable que le userId du body. Réponse 204 : accepté mais non journalisé,
  // même comportement silencieux que le return du frontend.
  if (req.user!.role === 'Master') {
    return res.sendStatus(204);
  }

  const { userId, userName, userColor, action, entity, entityName, entityId, timestamp } = req.body;

  for (const [field, value] of Object.entries({ userId, userName, userColor, action, entity, entityName })) {
    if (typeof value !== 'string' || value.length === 0) {
      return res.status(400).json({ error: `Champ "${field}" requis (chaîne non vide).` });
    }
  }
  if (entityId !== undefined && entityId !== null && typeof entityId !== 'string') {
    return res.status(400).json({ error: 'Champ "entityId" invalide : chaîne attendue.' });
  }
  if (timestamp !== undefined && (typeof timestamp !== 'string' || isNaN(new Date(timestamp).getTime()))) {
    return res.status(400).json({ error: 'Champ "timestamp" invalide (date valide attendue).' });
  }

  const entry = await prisma.activityLog.create({
    data: {
      userId,
      userName,
      userColor,
      action,
      entity,
      entityName,
      entityId: entityId ?? undefined,
      timestamp: timestamp ? new Date(timestamp) : new Date()
    }
  });
  emitEvent('activity:created', entry);
  res.json(entry);
});

export default router;
