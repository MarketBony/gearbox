import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { UPLOADS_ROOT } from '../routes/uploads';

const prisma = new PrismaClient();
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Rétention des pièces jointes de chat, arbitrée par Théo le 05/08/2026.
const CHAT_RETENTION_MS = 180 * DAY_MS;

// Purge des médias CALENDAR liés à des posts archivés depuis PLUS DE 30 JOURS.
// Ancrée sur archivedAt (PAS sur la date de création des fichiers). Les références
// purgées sont retirées de mediaFiles pour éviter les images cassées et les re-scans
// inutiles.
// ⚠️ « Archivé » = une PUBLICATION Digital (`SocialPost`), pas un projet — confusion
// courante. Le désarchivage remet `archivedAt` à null et annule donc le décompte.
// Les pièces jointes de CHAT ont leur propre purge à 180 jours (voir plus bas) ;
// les AVATARS n'en ont aucune, volontairement.
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

// Purge des PIÈCES JOINTES DE CHAT de plus de 180 jours.
//
// Le fichier est supprimé du disque, mais **le MESSAGE reste** : on ne réécrit pas
// l'historique d'une conversation pour libérer de l'espace. `fileExpiredAt` sert de
// marqueur, l'interface affiche alors « pièce jointe expirée ».
//
// Ancré sur `timestamp` (la date du message), qui est la seule date pertinente ici :
// contrairement aux médias Digital, une pièce jointe de chat n'a pas d'événement
// « archivage » sur lequel se raccrocher.
//
// ⚠️ `fileExpiredAt: null` dans le filtre est ce qui rend le job IDEMPOTENT : sans
// lui, chaque passage retenterait la suppression de fichiers déjà partis et
// journaliserait à vide indéfiniment.
export const purgeOldChatFiles = async () => {
  const cutoff = new Date(Date.now() - CHAT_RETENTION_MS);
  const messages = await prisma.chatMessage.findMany({
    where: {
      type: { in: ['image', 'file'] },
      fileExpiredAt: null,
      timestamp: { lt: cutoff }
    },
    select: { id: true, content: true }
  });

  let filesDeleted = 0;
  for (const msg of messages) {
    // `content` porte l'URL relative du fichier. On ne purge QUE le dossier chat/ —
    // un message dont le contenu pointerait ailleurs (ou nulle part) est simplement
    // marqué expiré sans toucher au disque.
    if (msg.content.startsWith('/uploads/chat/')) {
      const filePath = path.join(UPLOADS_ROOT, 'chat', path.basename(msg.content));
      try {
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); filesDeleted++; }
      } catch (e) {
        console.error('[purge] échec suppression', filePath, (e as Error).message);
        continue; // on NE marque pas expiré : le prochain passage réessaiera
      }
    }
    await prisma.chatMessage.update({ where: { id: msg.id }, data: { fileExpiredAt: new Date() } });
  }

  if (messages.length) {
    console.log(`[purge] chat : ${filesDeleted} fichier(s) supprimé(s) sur ${messages.length} message(s) > 180j.`);
  }
  return { messages: messages.length, filesDeleted };
};

let running = false;
const runSafe = async () => {
  if (running) return;
  running = true;
  try {
    await purgeArchivedCalendarMedia();
    await purgeOldChatFiles();
  } catch (e) {
    console.error('[purge] erreur (DB injoignable ?):', (e as Error).message);
  } finally {
    running = false;
  }
};

// Démarre le job : une passe ~15s après le boot, puis toutes les 24h.
// Les deux purges (calendar 30j, chat 180j) partagent ce SEUL timer — pas de second
// intervalle à faire vivre, et `running` garantit qu'elles ne se chevauchent jamais.
export const startPurgeJob = () => {
  setTimeout(runSafe, 15000);
  setInterval(runSafe, DAY_MS);
};
