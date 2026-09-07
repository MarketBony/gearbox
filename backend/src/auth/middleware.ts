import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET as SECRET } from './secret';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Authentification requise.' });

  jwt.verify(token, SECRET, (err: any, user: any) => {
    if (err) {
      // ⚠️ 401 ET NON 403, corrigé le 07/09/2026 (correctif 48). Deux défauts sur cette
      // seule ligne :
      //  1. `403` signifie « authentifié mais pas autorisé » — c'est ce que rend
      //     `requireRole` ci-dessous, à juste titre. Un jeton EXPIRÉ n'est pas un
      //     problème de droit, c'est une absence d'authentification. Or le frontend ne
      //     déconnecte que sur 401 (`apiFetch`, services/dataService.ts) : rendre 403
      //     laissait la session paraître VIVANTE à l'écran, chaque sauvegarde échouait
      //     avec l'alerte générique « serveur injoignable ? », et rien ne proposait
      //     jamais de se reconnecter. Le jeton durant 24 h, c'était garanti quotidien.
      //  2. `sendStatus` envoie un corps TEXTE (« Forbidden »), donc le `res.json()` du
      //     client échoue et le message se dégradait en « Erreur 403 ».
      // ⚠️ Portée : `requireRole` continue de rendre 403 pour un vrai refus de rôle.
      // Rien de légitimement « interdit » ne change de statut.
      const expire = err?.name === 'TokenExpiredError';
      return res.status(401).json({ error: expire ? 'Session expirée.' : 'Jeton invalide.' });
    }
    req.user = user;
    next();
  });
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
};
