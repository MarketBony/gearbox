import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../auth/middleware';
import { getPublicKey, pushConfigured } from '../utils/pushSender';

const router = Router();
const prisma = new PrismaClient();

// =====================================================================
// ABONNEMENTS WEB PUSH
//
// Un abonnement appartient à un NAVIGATEUR, pas à un utilisateur : le même
// utilisateur en a autant qu'il a d'appareils installés. La clé naturelle est
// `endpoint`, fourni par le service de push du navigateur.
//
// La clé publique VAPID est servie par l'API plutôt que figée dans le build du
// frontend : une seule source de vérité, et une rotation de clés ne demande pas
// de reconstruire le front.
// =====================================================================

/** GET /api/push/public-key — non authentifié : la clé publique est publique par nature. */
router.get('/public-key', (_req, res) => {
  if (!pushConfigured) {
    return res.status(503).json({ error: 'Notifications push non configurées sur ce serveur.' });
  }
  res.json({ publicKey: getPublicKey() });
});

/**
 * POST /api/push/subscribe — enregistre (ou rafraîchit) l'abonnement du navigateur.
 * Upsert sur `endpoint` : un navigateur qui se réabonne renvoie le même endpoint,
 * et sans upsert on créerait un doublon qui ferait sonner deux fois.
 * Le `userId` est réaffecté à chaque fois : un poste partagé change de titulaire.
 */
router.post('/subscribe', authenticateToken, async (req, res) => {
  const userId = (req as any).user?.id as string | undefined;
  if (!userId) return res.status(401).json({ error: 'Non authentifié.' });

  const { endpoint, keys } = req.body ?? {};
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    return res.status(400).json({ error: 'Champ "endpoint" requis (chaîne non vide).' });
  }
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    return res.status(400).json({ error: 'Champs "keys.p256dh" et "keys.auth" requis.' });
  }

  // Tronqué : en-tête client, sert seulement à identifier l'appareil à l'œil nu.
  const userAgent = typeof req.headers['user-agent'] === 'string'
    ? req.headers['user-agent'].slice(0, 255)
    : '';

  const abonnement = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent }
  });

  res.json({ id: abonnement.id });
});

/**
 * DELETE /api/push/subscribe — retire l'abonnement de CE navigateur.
 * Idempotent : un endpoint déjà absent renvoie 204, pas une erreur.
 */
router.delete('/subscribe', authenticateToken, async (req, res) => {
  const { endpoint } = req.body ?? {};
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    return res.status(400).json({ error: 'Champ "endpoint" requis (chaîne non vide).' });
  }
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  res.sendStatus(204);
});

export default router;
