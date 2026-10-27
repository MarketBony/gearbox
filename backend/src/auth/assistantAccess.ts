import { Response, NextFunction } from 'express';
import { AuthRequest } from './middleware';
import { ASSISTANT_ROLES } from './roles';
import { roleCourant } from './crmAccess';
import { reglagesAssistant } from '../settings/appSettings';

// =============================================================================
// ACCÈS À mIAouss (assistant IA) — SEULE PORTE, 27/10/2026.
//
// Toute route de /api/assistant passe par `requireAssistant`. Jamais de lecture directe de `assistant.enabled` /
// `assistant.off` pour décider d'un accès : même principe que `crmAccess.ts` pour SPARK.
//
// Règle exacte (décision de Théo, 27/10/2026 : « activer / désactiver au cas par cas, certains se sont plaints ») :
//   1. interrupteur ÉTEINT → personne, Master compris (comme SPARK) ;
//   2. rôle COURANT hors de l'équipe marketing (`ASSISTANT_ROLES`) → refus, comme avant ;
//   3. le Master d'office (il ne peut pas se couper lui-même) ;
//   4. les autres : sauf s'ils sont dans la liste des personnes coupées.
// Le rôle est relu en base (cache 15 s, `roleCourant`) : un JWT vit 24 h.
// =============================================================================

/** La règle pure, sur un rôle déjà connu. Sert aussi à GET /api/settings (`assistantAccess`). */
const regle = (userId: string, role: string | null, enabled: boolean, off: string[]): boolean => {
  if (!enabled || !role || !ASSISTANT_ROLES.includes(role)) return false;
  if (role === 'Master') return true;
  return !off.includes(userId);
};

/** Ce compte peut-il parler à mIAouss, maintenant ? */
export const peutUtiliserAssistant = async (user: { id: string } | undefined | null): Promise<boolean> => {
  if (!user?.id) return false;
  const { enabled, off } = await reglagesAssistant();
  if (!enabled) return false;
  return regle(user.id, await roleCourant(user.id), enabled, off);
};

/** Peut-on couper ce rôle depuis les Réglages ? (équipe marketing, hors Master qui a accès d'office) */
export const estCoupableAssistant = (role: string | null | undefined): boolean =>
  !!role && role !== 'Master' && ASSISTANT_ROLES.includes(role);

/** Toute route de mIAouss. À poser APRÈS `authenticateToken`. */
export const requireAssistant = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (await peutUtiliserAssistant(req.user)) return next();
    return res.status(403).json({ error: 'mIAouss n’est pas activé pour votre compte.' });
  } catch (e) {
    console.error('[assistant] contrôle d\'accès impossible :', (e as Error).message);
    return res.status(503).json({ error: 'Contrôle d\'accès à mIAouss indisponible, réessayez.' });
  }
};
