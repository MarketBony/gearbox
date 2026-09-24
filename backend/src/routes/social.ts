import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { scopeOf, arrayScopeWhere, redactSiteFields } from '../auth/siteScope';
import { withDates } from '../utils/dates';
import { UPLOADS_ROOT } from './uploads';
import { publicUser } from '../utils/publicUser';
import { prisma } from '../db';

const router = Router();
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

const NOM_MEDIA_MAX_LONGUEUR = 160;

/**
 * Normalise `mediaNames` pour qu'il ait EXACTEMENT la longueur de `mediaFiles`.
 *
 * ⚠️ SEULE PORTE de cohérence entre les deux tableaux. `mediaNames` est un tableau
 * PARALLÈLE : c'est l'index qui associe un nom d'origine à une url. Rien, côté base, ne
 * garantit que les deux restent alignés — un client ancien, un script, ou un simple oubli
 * d'un appelant les ferait diverger, et les visuels afficheraient alors le nom d'un
 * autre. On recale donc ici, et nulle part ailleurs : on complète par une chaîne vide
 * (l'écran retombe sur le nom uuid) et on tronque le surplus.
 *
 * ⚠️ Le nom d'origine est une donnée d'AFFICHAGE, jamais un chemin. On retire donc tout
 * séparateur de chemin et toute séquence `..` avant de stocker : même si la seule
 * consommation prévue est un `alt` et un nom de téléchargement, la règle absolue de
 * `routes/uploads.ts` veut qu'un nom fourni par l'utilisateur ne puisse jamais servir à
 * construire un chemin. On borne aussi la longueur.
 */
const normaliserMediaNames = (noms: unknown, urls: string[]): string[] => {
  const bruts = Array.isArray(noms) ? noms : [];
  return urls.map((_, i) => {
    const n = bruts[i];
    if (typeof n !== 'string') return '';
    return n
      .replace(/[\\/]/g, '_')       // aucun séparateur de chemin
      .replace(/\.\./g, '_')         // aucune remontée de répertoire
      .replace(/[\x00-\x1f]/g, '')   // aucun caractère de contrôle
      .trim()
      .slice(0, NOM_MEDIA_MAX_LONGUEUR);
  });
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

/**
 * ⚠️⚠️ SEULE PORTE D'ÉCRITURE des champs d'une publication (10/09/2026).
 *
 * Avant, le POST et le PUT passaient `req.body` **brut** à Prisma. Ça a tenu tant que le
 * client renvoyait exactement les colonnes du modèle — mais le client renvoie la
 * publication ENTIÈRE à chaque sauvegarde (`services/dataService.ts`, `stripMeta`), donc
 * le jour où la réponse du GET porte un champ de plus (ici `commentCount`, dérivé et non
 * stocké), ce champ repart au PUT et Prisma refuse l'argument inconnu : **toutes** les
 * sauvegardes tombent. Le tri se fait donc ici, une fois, comme `TASK_FIELDS` le fait
 * pour les tâches de projet (`routes/projects.ts`).
 *
 * ⚠️ MÊME PIÈGE QUE `TASK_FIELDS` : un champ absent de cette liste est jeté **en
 * silence** — la valeur part, le serveur répond 200, elle a disparu au rechargement, et
 * il n'y a d'erreur ni côté client ni dans les logs. Toute colonne ajoutée à
 * `SocialPost` doit être ajoutée ICI dans le même lot.
 *
 * Exclus volontairement : `archivedAt` (posé par le serveur seul, ancre de la purge
 * 30 j), `createdAt` / `updatedAt` (gérés par Prisma), et `id` — sauf au POST, voir
 * ci-dessous.
 */
const SOCIAL_FIELDS = [
  'title', 'status', 'date', 'targets', 'brands', 'service', 'networks',
  'concessions', 'mediaFiles', 'mediaNames', 'link', 'wording', 'lom', 'co2', 'co2s', 'proPlus', 'archived',
] as const;

/**
 * Aplatit le `_count` de Prisma en `commentCount`.
 *
 * ⚠️ Appliqué au GET **et** aux deux écritures, à dessein : le client remplace sa copie
 * locale par la réponse du PUT (`fileSauvegardePublication`, `pages/Digital.tsx`). Sans
 * le compteur dans cette réponse, la pastille de commentaires d'une ligne tomberait à
 * zéro dès qu'on y change un statut, jusqu'au prochain rechargement complet.
 */
const avecCompteur = <T extends { _count?: { comments: number } }>(p: T) => {
  const { _count, ...reste } = p;
  return { ...reste, commentCount: _count?.comments ?? 0 };
};

const COMMENT_COUNT_INCLUDE = { _count: { select: { comments: true } } } as const;

const pickSocialData = (corps: any): Record<string, any> => {
  const data: Record<string, any> = {};
  if (!corps || typeof corps !== 'object') return data;
  for (const champ of SOCIAL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(corps, champ)) data[champ] = corps[champ];
  }
  // Classes CO² multiples (24/09/2026). Nettoyées ici plutôt que confiées à Prisma, qui
  // rendrait un 500 sur une valeur mal formée. `co2` (hérité, une seule valeur) est
  // RECALCULÉ comme première classe : le client renvoie la publication entière, donc
  // avec l'ancien `co2` — sans cette ligne, les deux colonnes divergeraient.
  if (Object.prototype.hasOwnProperty.call(data, 'co2s')) {
    const liste = Array.isArray(data.co2s) ? data.co2s : [];
    data.co2s = [...new Set(liste.filter((v: unknown): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean))].slice(0, 20);
    data.co2 = data.co2s[0] ?? '';
  }
  if (Object.prototype.hasOwnProperty.call(data, 'proPlus')) data.proPlus = data.proPlus === true;
  return data;
};

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  // Cloisonnement par concession. ⚠️ Le champ s'appelle `concessions` ici (et non
  // `sites`) : c'est le même rôle, un nom différent selon le modèle.
  const scope = await scopeOf(req);
  // `commentCount` est DÉRIVÉ (aucune colonne) : il alimente la pastille du bouton
  // Commentaires de chaque ligne, sans charger les fils eux-mêmes.
  // ⚠️ Ce champ en trop dans la réponse est précisément ce qui a rendu `SOCIAL_FIELDS`
  // obligatoire : le client renvoie la publication entière au PUT.
  const posts = await prisma.socialPost.findMany({
    where: arrayScopeWhere('concessions', scope),
    include: COMMENT_COUNT_INCLUDE,
  });
  res.json(posts.map(p => redactSiteFields(avecCompteur(p), scope, 'concessions')));
});

// ---------------------------------------------------------------------------------
// COMMENTAIRES D'UNE PUBLICATION (correctif 50)
//
// ⚠️ CES TROIS ROUTES SONT DÉCLARÉES AVANT `/:id` — et ce n'est pas cosmétique :
// `DELETE /comments/:commentId` serait sinon capturée par `DELETE /:id`, qui
// SUPPRIMERAIT LA PUBLICATION dont l'id vaudrait « comments ». Express résout dans
// l'ordre de déclaration.
//
// Lecture pour quiconque voit la publication (le chef de site lit son périmètre),
// écriture réservée aux EDIT_ROLES : un rôle en lecture seule l'est par ABSENCE de
// cette liste, on ne l'y ajoute pas « pour faire propre ».
// ---------------------------------------------------------------------------------

const COMMENT_MAX_LONGUEUR = 2000;

/**
 * Rend `true` si le demandeur a le droit de VOIR cette publication.
 * ⚠️ Le périmètre passe par `scopeOf` / `arrayScopeWhere` — jamais un `where` de site
 * recopié dans une route (`auth/siteScope.ts` est la seule porte).
 */
const publicationVisible = async (req: AuthRequest, postId: string): Promise<boolean> => {
  const scope = await scopeOf(req);
  const post = await prisma.socialPost.findFirst({
    where: { id: postId, ...arrayScopeWhere('concessions', scope) },
    select: { id: true },
  });
  return !!post;
};

router.get('/:id/comments', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!(await publicationVisible(req, id))) return res.status(404).json({ error: 'Publication introuvable.' });
  const comments = await prisma.socialComment.findMany({
    where: { postId: id },
    orderBy: { createdAt: 'asc' },
  });

  // ⚠️ L'IDENTITÉ DE L'AUTEUR EST RÉSOLUE ICI, à la lecture, et non stockée sur le
  // commentaire : un renommage ne doit pas laisser l'ancien nom dans tout l'historique
  // (leçon du correctif 30 sur les parties de jeu). C'est le serveur qui la résout et
  // non l'écran, parce qu'un rôle cloisonné ne reçoit de `GET /api/users` que sa propre
  // fiche — il lirait sinon « Utilisateur » à la place de chaque nom.
  //
  // ⚠️ On passe par `publicUser`, seule forme d'un User qui sort du backend
  // (`passwordHash`), avant de ne garder que les trois champs d'affichage.
  const auteurs = await prisma.user.findMany({
    where: { id: { in: [...new Set(comments.map(c => c.authorId))] } },
  });
  const parId = new Map(auteurs.map(publicUser).map(u => [u.id, { id: u.id, name: u.name, avatarColor: u.avatarColor }]));

  res.json(comments.map(c => ({ ...c, author: parId.get(c.authorId) ?? null })));
});

router.post('/:id/comments', authenticateToken, requireRole(EDIT_ROLES), async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!(await publicationVisible(req, id))) return res.status(404).json({ error: 'Publication introuvable.' });

  const contenu = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!contenu) return res.status(400).json({ error: 'Le commentaire est vide.' });
  if (contenu.length > COMMENT_MAX_LONGUEUR) {
    return res.status(400).json({ error: `Le commentaire est limité à ${COMMENT_MAX_LONGUEUR} caractères.` });
  }

  const comment = await prisma.socialComment.create({
    // ⚠️ L'auteur vient du JETON, jamais du corps : un `authorId` envoyé par le client
    // permettrait de signer au nom d'un collègue.
    data: { postId: id, authorId: req.user!.id, content: contenu },
  });
  emitEvent('social-comment:updated', { postId: id });
  res.json(comment);
});

router.delete('/comments/:commentId', authenticateToken, requireRole(EDIT_ROLES), async (req: AuthRequest, res) => {
  const { commentId } = req.params;
  const comment = await prisma.socialComment.findUnique({ where: { id: commentId } });
  if (!comment) return res.status(404).json({ error: 'Commentaire introuvable.' });

  // Son propre commentaire, ou l'arbitrage d'un administrateur. Un Director ne supprime
  // pas celui d'un autre : il n'arbitre pas les comptes (cf. `USER_DELETE_ROLES`).
  const estAdmin = req.user?.role === 'Master' || req.user?.role === 'Administrator';
  if (comment.authorId !== req.user?.id && !estAdmin) {
    return res.status(403).json({ error: 'Seul l\'auteur peut supprimer ce commentaire.' });
  }

  await prisma.socialComment.delete({ where: { id: commentId } });
  emitEvent('social-comment:deleted', { postId: comment.postId });
  res.sendStatus(204);
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  // Création : rien à préserver, validation stricte.
  const refus = validerMediaFiles(req.body?.mediaFiles);
  if (refus) return res.status(400).json({ error: refus });
  const data = withDates(pickSocialData(req.body), ['date']);
  // ⚠️ `id` toléré À LA CRÉATION SEULEMENT : la migration one-shot des publications
  // venues du localStorage conserve les ids d'origine (`migrateSocialPostsIfNeeded`,
  // services/dataService.ts) parce que les médias y étaient rangés sous une clé dérivée
  // de l'id. Elle ne joue plus que sur une base vide, mais la retirer changerait un
  // contrat sans nécessité.
  if (typeof req.body?.id === 'string') data.id = req.body.id;
  const post = avecCompteur(await prisma.socialPost.create({ data: data as any, include: COMMENT_COUNT_INCLUDE }));
  emitEvent('social:updated', post);
  res.json(post);
});

router.put('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  const data = withDates(pickSocialData(req.body), ['date']);

  // archivedAt = ancre de la purge des médias : géré SERVEUR uniquement (jamais le
  // client). On le renseigne quand archived bascule false -> true, on le vide au
  // désarchivage, et on n'y touche pas si l'état d'archivage ne change pas.
  // `mediaFiles` est lu dans le MÊME findUnique (aucune requête supplémentaire) : il
  // sert de liste de tolérance pour les valeurs héritées, cf. validerMediaFiles.
  const existing = await prisma.socialPost.findUnique({
    where: { id },
    select: { archived: true, mediaFiles: true, mediaNames: true },
  });

  const refus = validerMediaFiles(data.mediaFiles, existing?.mediaFiles ?? []);
  if (refus) return res.status(400).json({ error: refus });

  // ⚠️ Recalage des noms de médias — voir `normaliserMediaNames`. On le fait dès que
  // l'un OU l'autre des deux tableaux est présent dans le corps : envoyer `mediaFiles`
  // sans `mediaNames` (un client qui ne connaît pas encore le champ) ne doit pas laisser
  // en base des noms qui pointent sur les mauvais fichiers.
  const envoieMedias = Object.prototype.hasOwnProperty.call(data, 'mediaFiles')
    || Object.prototype.hasOwnProperty.call(data, 'mediaNames');
  if (envoieMedias) {
    const urls: string[] = Array.isArray(data.mediaFiles) ? data.mediaFiles : (existing?.mediaFiles ?? []);
    const noms = Object.prototype.hasOwnProperty.call(data, 'mediaNames')
      ? data.mediaNames
      : (existing?.mediaNames ?? []);
    data.mediaNames = normaliserMediaNames(noms, urls);
  } else {
    delete data.mediaNames;
  }

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

  const post = avecCompteur(await prisma.socialPost.update({ where: { id }, data, include: COMMENT_COUNT_INCLUDE }));
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
