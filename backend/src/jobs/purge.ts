import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { UPLOADS_ROOT } from '../routes/uploads';

const prisma = new PrismaClient();
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Purge des médias CALENDAR liés à des posts archivés depuis PLUS DE 30 JOURS.
// Ancrée sur archivedAt (PAS sur la date de création des fichiers). Aucune purge
// pour chat et avatar. Les références purgées sont retirées de mediaFiles pour
// éviter les images cassées et les re-scans inutiles.
export const purgeArchivedCalendarMedia = async () => {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  const posts = await prisma.socialPost.findMany({
    where: { archived: true, archivedAt: { not: null, lt: cutoff } },
    select: { id: true, mediaFiles: true }
  });

  let filesDeleted = 0;
  for (const post of posts) {
    const remaining: string[] = [];
    for (const url of post.mediaFiles) {
      // On ne purge QUE les fichiers du dossier calendar/.
      if (!url.startsWith('/uploads/calendar/')) { remaining.push(url); continue; }
      const filePath = path.join(UPLOADS_ROOT, 'calendar', path.basename(url));
      try {
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); filesDeleted++; }
      } catch (e) {
        console.error('[purge] échec suppression', filePath, (e as Error).message);
        remaining.push(url); // on conserve la référence si la suppression a échoué
      }
    }
    if (remaining.length !== post.mediaFiles.length) {
      await prisma.socialPost.update({ where: { id: post.id }, data: { mediaFiles: remaining } });
    }
  }

  if (posts.length) {
    console.log(`[purge] calendar : ${filesDeleted} fichier(s) supprimé(s) sur ${posts.length} post(s) archivé(s) > 30j.`);
  }
  return { posts: posts.length, filesDeleted };
};

let running = false;
const runSafe = async () => {
  if (running) return;
  running = true;
  try {
    await purgeArchivedCalendarMedia();
  } catch (e) {
    console.error('[purge] erreur (DB injoignable ?):', (e as Error).message);
  } finally {
    running = false;
  }
};

// Démarre le job : une passe ~15s après le boot, puis toutes les 24h.
export const startPurgeJob = () => {
  setTimeout(runSafe, 15000);
  setInterval(runSafe, DAY_MS);
};
