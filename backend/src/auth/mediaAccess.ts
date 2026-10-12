import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET as SECRET } from './secret';
import { CHAT_ROLES, INTERNAL_ROLES } from './roles';

// ============================================================================
// FICHIERS DÉPOSÉS (`/uploads/…`) — SEULE porte de lecture. Lot sécurité serveur, 12/10/2026.
//
// Avant : `express.static` SANS connexion — qui connaissait l'URL d'un devis du mode Expert, d'une pièce jointe de
// chat ou d'une photo la téléchargeait sans compte. Un `<img src>` / `<video src>` ne peut pas porter l'en-tête
// `Authorization` : le jeton voyage donc AUSSI dans un cookie, limité à `/uploads`.
//  - `httpOnly` : illisible par le JavaScript de la page (le jeton reste dans `localStorage` pour l'API, comme avant) ;
//  - `SameSite=Strict` : jamais envoyé depuis un autre site — un lien vers un fichier n'ouvre rien hors de Gearbox ;
//  - posé à la connexion ET à chaque `GET /api/auth/me` (démarrage de l'appli) : une session déjà ouverte l'obtient
//    sans se reconnecter ; effacé par `POST /api/auth/logout`. Même durée que le jeton (24 h), qu'il contient.
// Web et API partagent la même origine (Caddy en prod, proxy Vite en dev) : c'est ce qui rend le cookie possible.
//
// Droits PAR DOSSIER, alignés sur les routes de lecture : un rôle qui n'a pas le Chat n'ouvre pas ses fichiers, un
// External n'ouvre pas les fichiers des projets. Le cloisonnement FICHIER PAR FICHIER (participant d'une conversation,
// concession d'un projet) n'est PAS fait ici : il demanderait une requête en base par image — noté au backlog.
// ============================================================================

export const MEDIA_COOKIE = 'gx_media';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/uploads',
});

export const setMediaCookie = (res: Response, token: string) => {
  res.cookie(MEDIA_COOKIE, token, { ...cookieOptions(), maxAge: MAX_AGE_MS });
};

export const clearMediaCookie = (res: Response) => {
  res.clearCookie(MEDIA_COOKIE, cookieOptions());
};

/** Rôles autorisés par dossier. Un dossier absent de cette carte n'est servi à PERSONNE. */
const DIR_ROLES: Record<string, readonly string[] | 'all'> = {
  avatar: 'all',     // photos de profil et de groupe : affichées partout
  calendar: 'all',   // médias des publications (Digital) : External et chef de site ont le Planning
  chat: CHAT_ROLES,
  chatbg: CHAT_ROLES,
  project: INTERNAL_ROLES,
};

const readCookie = (req: Request, name: string): string | undefined => {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
};

export const requireMediaAccess = (req: Request, res: Response, next: NextFunction) => {
  // Cookie d'abord (balises <img>/<video>) ; l'en-tête Bearer reste accepté (téléchargement par `fetch`).
  const bearer = req.headers.authorization?.split(' ')[1];
  const token = readCookie(req, MEDIA_COOKIE) || bearer;
  if (!token) return res.status(401).end();
  let role: string | undefined;
  try {
    role = (jwt.verify(token, SECRET) as { role?: string }).role;
  } catch {
    return res.status(401).end();
  }
  // `req.path` est relatif au montage : « /chat/<uuid>.jpg ».
  const dir = req.path.split('/')[1] || '';
  const allowed = DIR_ROLES[dir];
  if (!allowed || (allowed !== 'all' && !(role && allowed.includes(role)))) return res.status(403).end();
  next();
};
