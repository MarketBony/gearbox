import { Router } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { jeuxActives, setJeuxActives, reglagesCrm, setCrmActive, setCrmInvites } from '../settings/appSettings';
import { peutAccederCrm, estInvitableCrm } from '../auth/crmAccess';
import { prisma } from '../db';

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
//   `crmEnabled` : interrupteur SPARK (non sensible, visible de tous).
//   `crmAccess`  : CE compte a-t-il accès à SPARK, calculé par la porte unique (auth/crmAccess.ts). Le frontend n'en
//                  fait qu'un AFFICHAGE ; le refus réel est sur chaque route de /api/crm.
// ⚠️ La LISTE des invités n'est jamais ici : elle ne sort que par GET /api/settings/crm, Master seul.
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  const [gamesEnabled, crm, crmAccess] = await Promise.all([jeuxActives(), reglagesCrm(), peutAccederCrm(req.user)]);
  res.json({ gamesEnabled, crmEnabled: crm.enabled, crmAccess });
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

// GET /api/settings/crm — interrupteur SPARK ET liste des invités. Master seul : la liste dit qui lit les données
// nominatives, elle n'a pas à circuler.
router.get('/crm', authenticateToken, requireRole(MASTER_ONLY), async (_req: AuthRequest, res) => {
  const { enabled, users } = await reglagesCrm();
  res.json({ enabled, users });
});

// PUT /api/settings/crm — { enabled?: boolean, users?: string[] }. Master seul.
// `users` REMPLACE la liste : ids dédoublonnés, chacun doit exister et avoir un rôle invitable
// (CRM_INVITABLE_ROLES : interne, ni chef de site, ni Master qui a accès d'office). Un id invalide → 400, rien n'est
// écrit (pas de liste à moitié appliquée).
router.put('/crm', authenticateToken, requireRole(MASTER_ONLY), async (req: AuthRequest, res) => {
  const { enabled, users } = req.body ?? {};
  if (enabled === undefined && users === undefined) {
    return res.status(400).json({ error: 'Champ "enabled" (booléen) ou "users" (liste d’ids) requis.' });
  }
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Champ "enabled" : booléen attendu.' });
  }
  let ids: string[] | undefined;
  if (users !== undefined) {
    if (!Array.isArray(users) || users.some((x) => typeof x !== 'string' || !x)) {
      return res.status(400).json({ error: 'Champ "users" : liste d’identifiants attendue.' });
    }
    ids = [...new Set(users as string[])];
    const comptes = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true } })
      : [];
    const parId = new Map(comptes.map((c) => [c.id, c.role]));
    const inconnus = ids.filter((id) => !parId.has(id));
    if (inconnus.length) return res.status(400).json({ error: `Compte(s) introuvable(s) : ${inconnus.join(', ')}.` });
    const refuses = ids.filter((id) => !estInvitableCrm(parId.get(id)));
    if (refuses.length) {
      return res.status(400).json({ error: 'Rôle non invitable dans SPARK (External, chef de site ou Master) pour : ' + refuses.join(', ') + '.' });
    }
  }
  if (enabled !== undefined) await setCrmActive(enabled, req.user!.id);
  if (ids !== undefined) await setCrmInvites(ids, req.user!.id);
  const crm = await reglagesCrm();
  // Diffusé à TOUS : chaque client relit GET /api/settings et recalcule SON accès (l'icône apparaît ou disparaît sans
  // rechargement). ⚠️ Jamais la liste dans l'événement : `emitEvent` est un broadcast.
  emitEvent('settings:updated', { crmEnabled: crm.enabled });
  res.json({ enabled: crm.enabled, users: crm.users });
});

export default router;
