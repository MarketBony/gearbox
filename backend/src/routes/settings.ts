import { Router } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { jeuxActives, setJeuxActives } from '../settings/appSettings';

const router = Router();

// =============================================================================
// RÉGLAGES D'APPLICATION exposés au frontend.
//
// LECTURE ouverte à tout compte authentifié : chaque client doit savoir quoi
// afficher. Aucun secret ici, uniquement des interrupteurs de fonctionnalité.
//
// ⚠️ ÉCRITURE RÉSERVÉE AU MASTER, et le contrôle est ICI. La page Paramètres se
// contente de masquer le bouton aux autres — masquer un bouton ne ferme pas une
// route, leçon qui a coûté deux passes au lot du chef de site.
// =============================================================================

const MASTER_ONLY = ['Master'];

// GET /api/settings — état des interrupteurs, pour tous.
router.get('/', authenticateToken, async (_req: AuthRequest, res) => {
  res.json({ gamesEnabled: await jeuxActives() });
});

// PUT /api/settings/games — allumer/éteindre la rubrique Jeux.
router.put('/games', authenticateToken, requireRole(MASTER_ONLY), async (req: AuthRequest, res) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Champ "enabled" requis (booléen).' });
  }
  const actives = await setJeuxActives(enabled, req.user!.id);
  // Diffusé à TOUS les clients : l'extinction doit être immédiate partout, sans
  // rechargement.
  emitEvent('settings:updated', { gamesEnabled: actives });
  res.json({ gamesEnabled: actives });
});

export default router;
