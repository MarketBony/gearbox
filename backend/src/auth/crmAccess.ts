import { Response, NextFunction } from 'express';
import { prisma } from '../db';
import { AuthRequest } from './middleware';
import { CRM_INVITABLE_ROLES, CRM_MASTER_ROLES } from './roles';
import { reglagesCrm } from '../settings/appSettings';

// =============================================================================
// ACCÈS À SPARK (rubrique CRM, référentiel client unique) — SEULE PORTE, 26/10/2026.
//
// Données NOMINATIVES de ~180 000 clients. Toute route qui lit ou écrit la base RCU (`rcu/db.ts`) pour un
// utilisateur passe par `requireCrm` (et `requireCrmMaster` pour l'administration des imports). Jamais de liste
// de rôles recopiée dans une route, jamais de lecture directe de `crm.enabled` / `crm.users` pour décider d'un
// accès : même principe que `siteScope.ts` pour le périmètre.
//
// Règle exacte (décisions de Théo, 26/10/2026) :
//   1. interrupteur ÉTEINT → personne, Master compris ;
//   2. interrupteur allumé → le Master d'office ;
//   3. les autres : seulement s'ils sont dans la liste d'invités ET que leur rôle COURANT est invitable
//      (`CRM_INVITABLE_ROLES` : tous les internes sauf le chef de site ; l'External n'est pas interne).
//
// ⚠️ Le rôle est relu EN BASE, pas pris dans le jeton : un JWT vit 24 h, et un invité passé External ou chef de site
// garderait sinon l'accès jusqu'à son expiration. Petit cache mémoire (15 s) pour ne pas payer une requête par appel
// du Requêteur, qui en enchaîne beaucoup ; un compte supprimé n'a plus de rôle, donc plus d'accès.
// =============================================================================

const TTL_ROLE_MS = 15_000;
const cacheRoles = new Map<string, { role: string | null; t: number }>();

/** Rôle COURANT du compte (base), mis en cache 15 s. `null` = compte introuvable. */
export const roleCourant = async (userId: string): Promise<string | null> => {
  const c = cacheRoles.get(userId);
  if (c && Date.now() - c.t < TTL_ROLE_MS) return c.role;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const role = u?.role ?? null;
  cacheRoles.set(userId, { role, t: Date.now() });
  return role;
};

export const estInvitableCrm = (role: string | null | undefined): boolean =>
  !!role && CRM_INVITABLE_ROLES.includes(role);

/** La règle pure, sur un rôle déjà connu. Sert aussi à GET /api/settings (`crmAccess`). */
const regle = (userId: string, role: string | null, enabled: boolean, invites: string[]): boolean => {
  if (!enabled || !role) return false;
  if (CRM_MASTER_ROLES.includes(role)) return true;
  return estInvitableCrm(role) && invites.includes(userId);
};

/** Ce compte peut-il entrer dans SPARK, maintenant ? */
export const peutAccederCrm = async (user: { id: string } | undefined | null): Promise<boolean> => {
  if (!user?.id) return false;
  const { enabled, users } = await reglagesCrm();
  if (!enabled) return false;               // court-circuit : pas de lecture du rôle quand tout est éteint
  return regle(user.id, await roleCourant(user.id), enabled, users);
};

/** Le compte est-il le Master de SPARK (accès + rôle courant Master) ? Administration des imports. */
export const estMasterCrm = async (user: { id: string } | undefined | null): Promise<boolean> => {
  if (!user?.id) return false;
  const { enabled } = await reglagesCrm();
  if (!enabled) return false;
  const role = await roleCourant(user.id);
  return !!role && CRM_MASTER_ROLES.includes(role);
};

const garde = (test: (u: AuthRequest['user']) => Promise<boolean>, message: string) =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (await test(req.user)) return next();
      return res.status(403).json({ error: message });
    } catch (e) {
      console.error('[crm] contrôle d\'accès impossible :', (e as Error).message);
      return res.status(503).json({ error: 'Contrôle d\'accès à SPARK indisponible, réessayez.' });
    }
  };

/** Toute route de SPARK. À poser APRÈS `authenticateToken`. */
export const requireCrm = garde(peutAccederCrm, 'Accès à SPARK refusé.');

/** Administration des imports (journal, « appliquer quand même », classement des sites) : Master seul. */
export const requireCrmMaster = garde(estMasterCrm, 'Réservé au Master.');
