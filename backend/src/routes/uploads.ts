import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { authenticateToken, requireRole } from '../auth/middleware';
import { VALID_ROLES, SITE_MANAGER_ROLE } from '../auth/roles';


// Tous les rôles SAUF ceux en lecture seule. Écrit en soustraction volontairement :
// un futur rôle sera autorisé par défaut, ce qui est le comportement d'avant — le
// durcissement ne concerne que les rôles explicitement en lecture seule.
const UPLOAD_ROLES = (VALID_ROLES as readonly string[]).filter(r => r !== SITE_MANAGER_ROLE);

const router = Router();

// Racine des uploads = <repo>/backend/uploads, résolue quel que soit le cwd :
// backend/src/index.ts démarre depuis backend/, server.ts depuis la racine du repo.
const cwd = process.cwd();
export const UPLOADS_ROOT = fs.existsSync(path.join(cwd, 'backend', 'src'))
  ? path.join(cwd, 'backend', 'uploads') // cwd = racine du repo
  : path.join(cwd, 'uploads');           // cwd = backend/

export const UPLOAD_TYPES = ['chat', 'avatar', 'calendar', 'project'] as const;
export type UploadType = typeof UPLOAD_TYPES[number];

// RÈGLES FIGÉES — formats acceptés + tailles max par type.
// `mimes: null` = AUCUNE restriction de format (voir le cas `chat` ci-dessous).
// ⚠️ Ces valeurs sont dupliquées côté client (`pages/Chat.tsx`) pour afficher un
// message d'erreur immédiat. Le contrôle client est un confort, **celui-ci est le seul
// garde-fou réel** : toute modification doit être reportée des deux côtés.
const RULES: Record<UploadType, { mimes: string[] | null; maxBytes: number; label: string }> = {
  avatar: {
    mimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxBytes: 5 * 1024 * 1024, // 5 MB
    label: 'JPEG, PNG, GIF, WebP'
  },
  chat: {
    // Pièces jointes de toute nature (décision de Théo, 05/08/2026) : on n'impose plus
    // de liste de formats. La sécurité ne repose donc PLUS sur le filtrage à l'entrée
    // mais sur la façon de SERVIR les fichiers — voir l'option `setHeaders` du
    // `express.static` de `index.ts` : `nosniff` systématique et téléchargement forcé
    // pour tout ce qui n'est pas une image ou un PDF. Sans cela, un `.html` ou un
    // `.svg` déposé ici s'exécuterait dans la session de celui qui l'ouvre (XSS
    // stocké), puisque les fichiers sont servis depuis le domaine de Gearbox.
    mimes: null,
    maxBytes: 100 * 1024 * 1024, // 100 MB
    label: 'tous formats'
  },
  calendar: {
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'],
    maxBytes: 2 * 1024 * 1024 * 1024, // 2 GB
    label: 'JPEG, PNG, WebP, MP4, MOV'
  },
  // Pièces jointes du mode EXPERT (projet et tâche), 27/08/2026. Même choix que `chat`
  // et pour la même raison : un projet reçoit des devis, des BAT, des plans, des
  // tableurs — imposer une liste de formats reviendrait à la rouvrir chaque mois.
  // ⚠️ La sécurité ne repose donc PAS sur le filtrage à l'entrée mais sur la façon de
  // SERVIR les fichiers : l'`express.static` d'`index.ts` applique `nosniff` à tout et
  // force le téléchargement de ce qui n'est ni image ni PDF ni média — sans quoi un
  // `.html` ou un `.svg` déposé ici s'exécuterait dans la session de qui l'ouvre, les
  // fichiers étant servis depuis le domaine de Gearbox. Ce sous-dossier est couvert
  // automatiquement, il n'y a rien à y ajouter.
  project: {
    mimes: null,
    maxBytes: 100 * 1024 * 1024, // 100 MB, comme le chat
    label: 'tous formats'
  }
};

// Extension déduite du type MIME quand le format est dans une liste blanche.
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov'
};

// Extension de SECOURS, tirée du nom fourni par le client, quand le type MIME n'est
// pas dans la liste blanche (cas des pièces jointes de chat, tous formats acceptés).
//
// ⚠️ RÈGLE ABSOLUE : le nom d'origine ne doit JAMAIS entrer dans un chemin de fichier.
// C'est une donnée contrôlée par l'utilisateur ; un `../` suffirait à écrire hors du
// dossier de destination. On n'en extrait donc qu'une extension, réduite à
// `[a-z0-9]{1,8}` — ni point, ni séparateur, ni caractère de contrôle ne survit. Le
// nom réel est conservé en base (`ChatMessage.fileName`), pas sur le disque.
const safeExtFromName = (originalName: string): string => {
  const dot = originalName.lastIndexOf('.');
  if (dot < 0 || dot === originalName.length - 1) return '';
  const brut = originalName.slice(dot + 1).toLowerCase();
  const propre = brut.replace(/[^a-z0-9]/g, '');
  return propre.length > 0 && propre.length <= 8 ? `.${propre}` : '';
};

// Crée les dossiers de destination au démarrage.
for (const t of UPLOAD_TYPES) {
  fs.mkdirSync(path.join(UPLOADS_ROOT, t), { recursive: true });
}

// Erreur typée pour distinguer le rejet de format (415) des autres échecs.
class UnsupportedTypeError extends Error {}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    cb(null, path.join(UPLOADS_ROOT, req.params.type as UploadType));
  },
  filename: (_req, file, cb) => {
    // Nom en uuid, jamais `file.originalname`. L'extension vient du MIME quand il est
    // connu, sinon d'une extraction assainie du nom d'origine (pièces jointes de chat).
    const ext = EXT_BY_MIME[file.mimetype] ?? safeExtFromName(file.originalname || '');
    cb(null, `${randomUUID()}${ext}`);
  }
});

// POST /api/uploads/:type — upload d'un fichier unique (champ "file").
// Auth JWT obligatoire. multer configuré PAR requête selon le type (les limites
// de taille et formats diffèrent).
// ⚠️ Cette route n'avait AUCUN contrôle de rôle jusqu'au 05/08/2026 : tout compte
// authentifié pouvait déposer un fichier, donc consommer le disque du VPS. Sans
// conséquence tant que tous les rôles écrivaient quelque part, mais le chef de site
// est en lecture seule — lui laisser l'upload ouvert serait la seule écriture qu'il
// pourrait faire, et la plus coûteuse. On refuse donc explicitement les rôles sans
// droit d'écriture.
router.post('/:type', authenticateToken, requireRole(UPLOAD_ROLES), (req, res) => {
  const type = req.params.type as UploadType;
  if (!UPLOAD_TYPES.includes(type)) {
    return res.status(400).json({ error: `Type d'upload invalide : "${type}". Attendu : ${UPLOAD_TYPES.join(', ')}.` });
  }
  const rule = RULES[type];

  const upload = multer({
    storage,
    // ⚠️ `+ 1` volontaire, et load-bearing. La limite de multer/busboy est atteinte
    // dès que la taille reçue ÉGALE `fileSize` : mesuré, un fichier de 104 857 599
    // octets passait mais 104 857 600 (100 Mio pile) partait en 413, alors que le
    // message d'erreur annonce « max 100 Mo ». `maxBytes` est donc traité comme un
    // maximum INCLUSIF, ce que l'utilisateur comprend, et multer reçoit la première
    // valeur interdite. Vaut aussi pour l'avatar (5 Mo) et le calendrier (2 Go).
    limits: { fileSize: rule.maxBytes + 1, files: 1 },
    fileFilter: (_req, file, cb) => {
      // `mimes === null` = tous formats acceptés (chat). Voir le commentaire de RULES :
      // la protection se joue alors à la lecture, pas à l'écriture.
      if (rule.mimes === null) return cb(null, true);
      if (!rule.mimes.includes(file.mimetype)) {
        return cb(new UnsupportedTypeError(
          `Format non accepté pour "${type}" (${file.mimetype}). Formats autorisés : ${rule.label}.`
        ));
      }
      cb(null, true);
    }
  }).single('file');

  upload(req, res, (err: any) => {
    if (err instanceof UnsupportedTypeError) {
      return res.status(415).json({ error: err.message });
    }
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      const mb = rule.maxBytes >= 1024 * 1024 * 1024
        ? `${Math.round(rule.maxBytes / 1024 / 1024 / 1024)} Go`
        : `${Math.round(rule.maxBytes / 1024 / 1024)} Mo`;
      return res.status(413).json({ error: `Fichier trop volumineux pour "${type}" (max ${mb}).` });
    }
    if (err) {
      return res.status(400).json({ error: "Échec de l'upload du fichier." });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier reçu (champ "file" attendu).' });
    }
    // URL relative servie par express.static('/uploads', UPLOADS_ROOT).
    res.json({ url: `/uploads/${type}/${req.file.filename}` });
  });
});

export default router;
