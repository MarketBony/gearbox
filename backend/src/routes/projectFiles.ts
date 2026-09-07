import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { scopeOf, arrayScopeWhere } from '../auth/siteScope';
import { UPLOADS_ROOT } from './uploads';
import { prisma } from '../db';

const router = Router();

// Même liste que `projects.ts` : déposer un fichier sur un projet, c'est le modifier.
// ⚠️ 'Digital Manager' AVEC l'espace — c'est la valeur réelle en base.
// Le rôle « Site Manager » en est absent : il CONSULTE le mode Expert de ses projets
// mais n'y écrit rien. Un rôle en lecture seule l'est par ABSENCE de cette liste, ne
// l'y ajoutez jamais « pour faire propre ».
const EDIT_ROLES = ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager'];

/**
 * Le projet demandé, SI le demandeur a le droit de le voir.
 *
 * ⚠️⚠️ SEULE porte d'accès de cette route. Le cloisonnement par concession ne se
 * recopie pas ici en `where` maison : on réutilise `scopeOf` + `arrayScopeWhere` de
 * `auth/siteScope.ts`, exactement comme `GET /api/projects`. Sans ce contrôle, un chef
 * de site pourrait lister — et télécharger — les devis d'un projet d'une autre
 * concession en connaissant son id : filtrer la rubrique Projets sans filtrer celle-ci
 * aurait laissé la porte de derrière ouverte.
 *
 * Rend `null` si le projet n'existe pas OU s'il est hors périmètre — volontairement
 * indiscernables, pour ne pas transformer cette route en révélateur d'existence.
 */
const projetAutorise = async (req: AuthRequest, projectId: string) => {
  const scope = await scopeOf(req);
  return prisma.project.findFirst({
    where: { id: projectId, ...arrayScopeWhere('sites', scope) },
    select: { id: true }
  });
};

// GET /api/project-files/:projectId — tous les fichiers du projet, ceux des tâches
// comprises (`taskId` distingue les deux côté client, en une seule requête).
router.get('/:projectId', authenticateToken, async (req: AuthRequest, res) => {
  const { projectId } = req.params;
  if (!(await projetAutorise(req, projectId))) {
    return res.status(404).json({ error: 'Projet introuvable.' });
  }
  const files = await prisma.projectFile.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' }
  });
  res.json(files);
});

// POST /api/project-files/:projectId — enregistre la métadonnée d'un fichier DÉJÀ
// téléversé par POST /api/uploads/project.
//
// ⚠️ Deux appels et non un seul, volontairement : `uploads.ts` est le seul endroit qui
// écrit sur le disque, avec ses règles de taille, d'extension et de nommage en uuid.
// Refaire un multer ici aurait dupliqué ces garde-fous — et c'est la duplication qui
// les fait diverger.
router.post('/:projectId', authenticateToken, requireRole(EDIT_ROLES), async (req: AuthRequest, res) => {
  const { projectId } = req.params;
  const { url, fileName, fileSize, taskId } = req.body;

  if (typeof url !== 'string' || typeof fileName !== 'string' || typeof fileSize !== 'number') {
    return res.status(400).json({ error: 'Champs "url", "fileName" et "fileSize" requis.' });
  }
  // ⚠️ L'url est écrite par le client : elle doit désigner un fichier de CE dossier et
  // rien d'autre. Sans ce contrôle, on enregistrerait une url externe (rendue ensuite
  // chez tous les collègues) ou un chemin vers un autre dossier d'uploads. Même risque
  // que celui fermé sur la photo de groupe.
  if (!/^\/uploads\/project\/[A-Za-z0-9._-]+$/.test(url) || url.includes('..')) {
    return res.status(400).json({ error: 'Chemin de fichier invalide.' });
  }
  if (!(await projetAutorise(req, projectId))) {
    return res.status(404).json({ error: 'Projet introuvable.' });
  }
  // Une tâche citée doit appartenir à CE projet, sinon on rattacherait un fichier à la
  // tâche d'un autre projet — et il deviendrait lisible hors périmètre.
  if (taskId != null) {
    const t = await prisma.task.findFirst({ where: { id: taskId, projectId }, select: { id: true } });
    if (!t) return res.status(400).json({ error: 'Tâche introuvable dans ce projet.' });
  }

  const file = await prisma.projectFile.create({
    data: {
      projectId,
      taskId: taskId ?? null,
      url,
      fileName: fileName.slice(0, 255),
      fileSize,
      uploadedBy: req.user?.id ?? ''
    }
  });
  emitEvent('project-files:updated', { projectId });
  res.json(file);
});

// DELETE /api/project-files/item/:fileId — retire la ligne ET le fichier du disque.
//
// ⚠️ Les deux, toujours. Ne supprimer que la ligne recréerait le défaut « fichiers
// d'upload orphelins » déjà ouvert dans BUGS-CONNUS.md : le fichier resterait sur le
// VPS, invisible et non collecté. Le préfixe `/item/` évite toute ambiguïté avec
// `/:projectId` des routes ci-dessus.
router.delete('/item/:fileId', authenticateToken, requireRole(EDIT_ROLES), async (req: AuthRequest, res) => {
  const { fileId } = req.params;
  const file = await prisma.projectFile.findUnique({ where: { id: fileId } });
  if (!file) return res.status(404).json({ error: 'Fichier introuvable.' });
  if (!(await projetAutorise(req, file.projectId))) {
    return res.status(404).json({ error: 'Fichier introuvable.' });
  }

  await prisma.projectFile.delete({ where: { id: fileId } });

  // `basename` et non l'url brute : le nom ne doit jamais pouvoir sortir du dossier,
  // même si une url douteuse avait franchi la validation du POST.
  try {
    const chemin = path.join(UPLOADS_ROOT, 'project', path.basename(file.url));
    if (fs.existsSync(chemin)) fs.unlinkSync(chemin);
  } catch (e) {
    // La ligne est déjà partie : on journalise et on rend 200. Un fichier resté sur le
    // disque sera ramassé par le balayage des orphelins de `jobs/purge.ts` — inutile
    // de renvoyer une erreur pour une suppression qui a réussi côté utilisateur.
    console.error('[project-files] suppression disque échouée', file.url, (e as Error).message);
  }

  emitEvent('project-files:updated', { projectId: file.projectId });
  res.json({ ok: true });
});

export default router;
