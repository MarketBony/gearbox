import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { authenticateToken, requireRole } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { withDates } from '../utils/dates';
import { UPLOADS_ROOT } from './uploads';

const router = Router();
const prisma = new PrismaClient();
// Aligné sur le gating de Digital.tsx (canEdit + External sur le calendrier
// éditorial — pas de granularité par onglet côté API). Corrige au passage
// l'ancien 'DigitalManager' sans espace qui ne matchait jamais le vrai rôle.
const EDIT_ROLES = ['Master', 'Administrator', 'Director', 'Digital Manager', 'External'];

router.get('/', authenticateToken, async (req, res) => {
  const posts = await prisma.socialPost.findMany();
  res.json(posts);
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
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
  const existing = await prisma.socialPost.findUnique({ where: { id }, select: { archived: true } });
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
