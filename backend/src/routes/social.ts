import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { scopeOf, arrayScopeWhere, redactSiteFields } from '../auth/siteScope';
import { withDates } from '../utils/dates';
import { UPLOADS_ROOT } from './uploads';

const router = Router();
const prisma = new PrismaClient();
// Aligné sur le gating de Digital.tsx (canEdit + External sur le calendrier
// éditorial — pas de granularité par onglet côté API). Corrige au passage
// l'ancien 'DigitalManager' sans espace qui ne matchait jamais le vrai rôle.
const EDIT_ROLES = ['Master', 'Administrator', 'Director', 'Digital Manager', 'External'];

// ⚠️ VALIDATION DE `mediaFiles` — le POST et le PUT passaient jusqu'ici req.body BRUT à
// Prisma : n'importe quel compte des EDIT_ROLES pouvait y écrire `javascript:…`,
// `data:text/html;base64,…` ou `//tiers.example/pixel.gif`, rendu ensuite dans le
// navigateur de tous les collègues. Même risque, même parade que `AVATAR_UPLOAD_PATH`
// (src/realtime/chat.ts) — trou fermé en même temps qu'on ouvre les liens externes.
//
// Deux formes légitimes, et DEUX seulement :
//  - un fichier servi par Gearbox, produit par POST /api/uploads/calendar : le nom est
//    toujours un randomUUID() et l'extension vient de EXT_BY_MIME pour le type
//    `calendar` (jpg|png|webp|mp4|mov) — voir routes/uploads.ts ;
//  - un lien externe http(s), collé par l'utilisateur (WeTransfer, SharePoint, Drive…).
//
// ⚠️ NE PAS élargir à /^\/uploads\// tout court : le dossier `chat/` n'a AUCUN filtre
// de format (uploads.ts), y pointer depuis un post rouvrirait le trou par la bande.
const CALENDAR_UPLOAD_PATH =
  /^\/uploads\/calendar\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|mp4|mov)$/i;

const MEDIA_MAX_ENTREES = 50;
const MEDIA_MAX_LONGUEUR = 2048; // la plus longue url SharePoint observée fait 291 car.

const entreeMediaValide = (u: unknown): boolean => {
  if (typeof u !== 'string' || u.length === 0 || u.length > MEDIA_MAX_LONGUEUR) return false;
  if (CALENDAR_UPLOAD_PATH.test(u)) return true;
  if (!/^https?:\/\//i.test(u)) return false;
  try { new URL(u); return true; } catch { return false; }
};

/**
 * Rend un message d'erreur, ou `null` si c'est bon.
 *
 * ⚠️ `existantes` = les valeurs DÉJÀ en base pour ce post, qui sont TOLÉRÉES telles
 * quelles. Raison : `mediaFiles` n'a jamais été validé (types.ts disait encore
 * « Placeholders for now ») et `migrateSocialPostsIfNeeded` a repoussé vers l'API des
 * posts venus du localStorage. Si une seule ligne de production porte une valeur non
 * conforme, une validation stricte au PUT rendrait la ligne ENTIÈRE insauvegardable :
 * changer un simple statut partirait en 400, l'update optimiste se rollbackerait et
 * l'écran afficherait une erreur incompréhensible. On bloque donc tout AJOUT non
 * conforme sans jamais bloquer l'édition d'un post existant. Le POST, lui, n'a rien à
 * préserver : il valide strictement (`existantes` vide).
 */
const validerMediaFiles = (valeur: unknown, existantes: string[] = []): string | null => {
  if (valeur === undefined) return null;               // champ absent = non modifié
  if (!Array.isArray(valeur)) return 'mediaFiles doit être une liste.';
  if (valeur.length > MEDIA_MAX_ENTREES) return `mediaFiles est limité à ${MEDIA_MAX_ENTREES} entrées.`;
  const connues = new Set(existantes);
  for (const u of valeur) {
    if (connues.has(u as string)) continue;            // valeur héritée : tolérée
    if (!entreeMediaValide(u)) {
      return "Média refusé : seuls un fichier déposé dans Gearbox ou un lien http(s) sont acceptés.";
    }
  }
  return null;
};

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  // Cloisonnement par concession. ⚠️ Le champ s'appelle `concessions` ici (et non
  // `sites`) : c'est le même rôle, un nom différent selon le modèle.
  const scope = await scopeOf(req);
  const posts = await prisma.socialPost.findMany({
    where: arrayScopeWhere('concessions', scope),
  });
  res.json(posts.map(p => redactSiteFields(p, scope, 'concessions')));
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  // Création : rien à préserver, validation stricte.
  const refus = validerMediaFiles(req.body?.mediaFiles);
  if (refus) return res.status(400).json({ error: refus });
  const post = await prisma.socialPost.create({ data: withDates(req.body, ['date']) });
  emitEvent('social:updated', post);
  res.json(post);
});

router.put('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  const data = withDates(req.body, ['date']);

  // archivedAt = ancre de la purge des médias : géré SERVEUR uniquement (jamais le
  // client). On le renseigne quand archived bascule false -> true, on le vide au
  // désarchivage, et on n'y touche pas si l'état d'archivage ne change pas.
  // `mediaFiles` est lu dans le MÊME findUnique (aucune requête supplémentaire) : il
  // sert de liste de tolérance pour les valeurs héritées, cf. validerMediaFiles.
  const existing = await prisma.socialPost.findUnique({
    where: { id },
    select: { archived: true, mediaFiles: true },
  });

  const refus = validerMediaFiles(data.mediaFiles, existing?.mediaFiles ?? []);
  if (refus) return res.status(400).json({ error: refus });

  if (Object.prototype.hasOwnProperty.call(data, 'archived')) {
    if (data.archived === true && existing && !existing.archived) {
      data.archivedAt = new Date();
    } else if (data.archived === false) {
      data.archivedAt = null;
    } else {
      delete data.archivedAt;
    }
  } else {
    delete data.archivedAt;
  }

  const post = await prisma.socialPost.update({ where: { id }, data });
  emitEvent('social:updated', post);
  res.json(post);
});

router.delete('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  // Nettoyage disque : on supprime les fichiers calendar/ liés au post avant de
  // le supprimer (évite les orphelins ; distinct de la purge 30j des archives).
  const existing = await prisma.socialPost.findUnique({ where: { id }, select: { mediaFiles: true } });
  await prisma.socialPost.delete({ where: { id } });
  if (existing) {
    for (const url of existing.mediaFiles) {
      if (!url.startsWith('/uploads/calendar/')) continue;
      const fp = path.join(UPLOADS_ROOT, 'calendar', path.basename(url));
      try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch { /* best-effort */ }
    }
  }
  emitEvent('social:deleted', id);
  res.sendStatus(204);
});

export default router;
