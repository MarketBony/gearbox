import fs from 'fs';
import path from 'path';
import { UPLOADS_ROOT } from '../routes/uploads';
import { prisma } from '../db';

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
    select: { id: true, mediaFiles: true, mediaNames: true }
  });

  let filesDeleted = 0;
  for (const post of posts) {
    const remaining: string[] = [];
    const remainingNames: string[] = [];
    // ⚠️ `mediaNames` est un tableau PARALLÈLE à `mediaFiles` : c'est l'INDEX qui fait le
    // lien (voir la garde de `schema.prisma` et `normaliserMediaNames` dans
    // routes/social.ts). Cette purge retire des entrées AU MILIEU du tableau : n'écrire
    // que `mediaFiles` faisait glisser tous les noms suivants d'un cran, et les visuels
    // restants s'affichaient sous le nom de leur voisin — jusqu'au prochain PUT, qui
    // tronquait le surplus par la FIN. Corrigé le 10/09/2026 : on filtre les deux
    // colonnes par les mêmes index, et on les écrit ensemble.
    post.mediaFiles.forEach((url, index) => {
      const conserver = () => {
        remaining.push(url);
        if (post.mediaNames.length) remainingNames.push(post.mediaNames[index] ?? '');
      };
      // On ne purge QUE les fichiers du dossier calendar/.
      if (!url.startsWith('/uploads/calendar/')) { conserver(); return; }
      const filePath = path.join(UPLOADS_ROOT, 'calendar', path.basename(url));
      try {
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); filesDeleted++; }
      } catch (e) {
        console.error('[purge] échec suppression', filePath, (e as Error).message);
        conserver(); // on conserve la référence si la suppression a échoué
      }
    });
    if (remaining.length !== post.mediaFiles.length) {
      // Un `mediaNames` vide est légitime (publications antérieures au correctif 49) :
      // on ne le fabrique pas, on ne le recale que s'il existait.
      const data = post.mediaNames.length
        ? { mediaFiles: remaining, mediaNames: remainingNames }
        : { mediaFiles: remaining };
      await prisma.socialPost.update({ where: { id: post.id }, data });
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
      // ⚠️ Liste à tenir à jour à CHAQUE nouveau type de message porteur d'un
      // fichier. Un type absent d'ici n'est JAMAIS purgé — silencieusement : le
      // fichier reste sur le disque du VPS indéfiniment, sans erreur ni trace.
      // 'audio' (messages vocaux) ajouté le 06/08/2026, même rétention de 180 j.
      // 'project' n'y figure pas et ne doit pas y figurer : son `content` est un id
      // de projet, pas un fichier.
      type: { in: ['image', 'file', 'audio'] },
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
    await purgeOrphanProjectFiles();
  } catch (e) {
    console.error('[purge] erreur (DB injoignable ?):', (e as Error).message);
  } finally {
    running = false;
  }
};

/**
 * Fichiers du mode EXPERT devenus orphelins — ceux de `/uploads/project/` qu'aucune
 * ligne `ProjectFile` ne référence plus.
 *
 * ⚠️⚠️ CE N'EST PAS UNE PURGE PAR ANCIENNETÉ, et il ne faut jamais en faire une ici.
 * Contrairement aux médias calendar (30 j) et aux pièces jointes de chat (180 j), un
 * devis ou un bon à tirer n'a aucune raison de s'évaporer : tant qu'une ligne existe,
 * le fichier reste, quel que soit son âge. Seule la suppression EXPLICITE depuis
 * l'interface retire un fichier.
 *
 * Ce balayage ne ramasse donc que les résidus : suppression en cascade d'un projet ou
 * d'une tâche (la ligne part avec la FK, pas le fichier), et échec de l'`unlink` de la
 * route DELETE. C'est la réponse au défaut « fichiers d'upload orphelins » ouvert dans
 * BUGS-CONNUS.md, appliquée dès l'origine sur ce dossier plutôt qu'après coup.
 *
 * ⚠️ Marge de sécurité d'une heure sur la date du fichier : sans elle, on supprimerait
 * le fichier d'un utilisateur qui vient de le téléverser et dont l'enregistrement de la
 * métadonnée n'est pas encore arrivé — les deux appels sont séparés.
 */
export const purgeOrphanProjectFiles = async () => {
  const dir = path.join(UPLOADS_ROOT, 'project');
  if (!fs.existsSync(dir)) return;

  const connus = new Set(
    (await prisma.projectFile.findMany({ select: { url: true } })).map(f => path.basename(f.url))
  );

  const limite = Date.now() - 60 * 60 * 1000; // 1 h
  let supprimes = 0;
  for (const nom of fs.readdirSync(dir)) {
    if (connus.has(nom)) continue;
    const chemin = path.join(dir, nom);
    try {
      if (fs.statSync(chemin).mtimeMs > limite) continue; // trop récent, on laisse
      fs.unlinkSync(chemin);
      supprimes++;
    } catch (e) {
      console.error('[purge] orphelin projet', chemin, (e as Error).message);
    }
  }
  if (supprimes > 0) console.log(`[purge] ${supprimes} fichier(s) de projet orphelin(s) supprimé(s)`);
};

// Démarre le job : une passe ~15s après le boot, puis toutes les 24h.
// Les trois purges (calendar 30j, chat 180j, orphelins de projet) partagent ce SEUL
// timer — pas de second intervalle à faire vivre, et `running` garantit qu'elles ne se
// chevauchent jamais.
export const startPurgeJob = () => {
  setTimeout(runSafe, 15000);
  setInterval(runSafe, DAY_MS);
};
