import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../auth/middleware';

const router = Router();

// Racine des uploads = <repo>/backend/uploads, résolue quel que soit le cwd :
// backend/src/index.ts démarre depuis backend/, server.ts depuis la racine du repo.
const cwd = process.cwd();
export const UPLOADS_ROOT = fs.existsSync(path.join(cwd, 'backend', 'src'))
  ? path.join(cwd, 'backend', 'uploads') // cwd = racine du repo
  : path.join(cwd, 'uploads');           // cwd = backend/

export const UPLOAD_TYPES = ['chat', 'avatar', 'calendar'] as const;
export type UploadType = typeof UPLOAD_TYPES[number];

// RÈGLES FIGÉES — formats acceptés + tailles max par type.
const RULES: Record<UploadType, { mimes: string[]; maxBytes: number; label: string }> = {
  avatar: {
    mimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxBytes: 5 * 1024 * 1024, // 5 MB
    label: 'JPEG, PNG, GIF, WebP'
  },
  chat: {
    mimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxBytes: 10 * 1024 * 1024, // 10 MB
    label: 'JPEG, PNG, GIF, WebP'
  },
  calendar: {
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'],
    maxBytes: 2 * 1024 * 1024 * 1024, // 2 GB
    label: 'JPEG, PNG, WebP, MP4, MOV'
  }
};

// Extension déduite du type MIME (jamais le nom d'origine fourni par le client).
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov'
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
    // Nom en uuid + extension déduite du MIME (jamais file.originalname).
    const ext = EXT_BY_MIME[file.mimetype] ?? '';
    cb(null, `${randomUUID()}${ext}`);
  }
});

// POST /api/uploads/:type — upload d'un fichier unique (champ "file").
// Auth JWT obligatoire. multer configuré PAR requête selon le type (les limites
// de taille et formats diffèrent).
router.post('/:type', authenticateToken, (req, res) => {
  const type = req.params.type as UploadType;
  if (!UPLOAD_TYPES.includes(type)) {
    return res.status(400).json({ error: `Type d'upload invalide : "${type}". Attendu : ${UPLOAD_TYPES.join(', ')}.` });
  }
  const rule = RULES[type];

  const upload = multer({
    storage,
    limits: { fileSize: rule.maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
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
