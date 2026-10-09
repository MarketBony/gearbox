import { Router } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { VALID_ROLES } from '../auth/roles';
import { prisma } from '../db';

const router = Router();

// ═════════════════════════════════════════════════════════════════
// BUREAU de l'interface v2 — disposition des widgets PAR UTILISATEUR (09/10/2026, lot W3 de la refonte des widgets).
//
// Avant : seulement dans le navigateur (`GX.store`), perdue en changeant de poste. Ici : une ligne `UserWidgets` par
// compte, deux dispositions (bureau, téléphone). Comme les post-it, TOUT est filtré sur `userId = req.user.id` —
// jamais sur une valeur du client, et même le Master ne lit pas le bureau des autres.
//
// Tous les rôles ont un bureau (chef de site et External compris) : `requireRole([...VALID_ROLES])` est volontairement LARGE
// et ne donne accès qu'à ses propres données. Ce n'est pas un EDIT_ROLES.
// ═════════════════════════════════════════════════════════════════

/**
 * Champs écrivables — liste blanche, comme `TASK_FIELDS`, `SOCIAL_FIELDS`, `POSTIT_FIELDS`.
 * ⚠️ Un champ absent d'ici est jeté EN SILENCE : une colonne ajoutée à `UserWidgets` s'ajoute ici dans le même lot.
 */
const WIDGET_FIELDS = ['desktop', 'phone'] as const;

const MAX_ITEMS = 80;
const MAX_CFG = 8000;          // réglages d'un widget (texte d'une ancienne note rapide compris)
const RE_TYPE = /^[a-z0-9-]{1,40}$/;
const RE_SIZE = /^(?:[A-Z0-9]{1,4}|\d{1,2}x\d{1,2})$/;   // nom historique (S…XXW) ou « LxH » en cases
const RE_ID = /^[A-Za-z0-9_-]{1,60}$/;

/** Une disposition valide, nettoyée (champs connus seulement), ou `null` si elle est refusée. */
function clean(v: unknown): unknown[] | null {
  if (!Array.isArray(v) || v.length > MAX_ITEMS) return null;
  const out: unknown[] = [];
  for (const w of v) {
    if (!w || typeof w !== 'object') return null;
    const { id, type, size, x, y, cfg } = w as Record<string, unknown>;
    if (typeof id !== 'string' || !RE_ID.test(id) || typeof type !== 'string' || !RE_TYPE.test(type) || typeof size !== 'string' || !RE_SIZE.test(size)) return null;
    if (!Number.isInteger(x) || !Number.isInteger(y) || (x as number) < 0 || (y as number) < 0 || (x as number) > 500 || (y as number) > 500) return null;
    const item: Record<string, unknown> = { id, type, size, x, y };
    if (cfg !== undefined && cfg !== null) {
      if (typeof cfg !== 'object' || Array.isArray(cfg) || JSON.stringify(cfg).length > MAX_CFG) return null;
      item.cfg = cfg;
    }
    out.push(item);
  }
  return out;
}

// GET /api/widgets — mes deux dispositions (null si jamais enregistrées).
router.get('/', authenticateToken, requireRole([...VALID_ROLES]), async (req: AuthRequest, res) => {
  const row = await prisma.userWidgets.findUnique({ where: { userId: req.user!.id } });
  res.json({ desktop: row?.desktop ?? null, phone: row?.phone ?? null, updatedAt: row?.updatedAt ?? null });
});

// PUT /api/widgets — remplace une ou deux dispositions (les champs absents ne bougent pas).
router.put('/', authenticateToken, requireRole([...VALID_ROLES]), async (req: AuthRequest, res) => {
  const data: Record<string, unknown> = {};
  for (const k of WIDGET_FIELDS) {
    if (req.body?.[k] === undefined) continue;
    const v = clean(req.body[k]);
    if (!v) return res.status(400).json({ error: `Disposition « ${k} » invalide.` });
    data[k] = v;
  }
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Rien à enregistrer.' });
  const userId = req.user!.id;
  const row = await prisma.userWidgets.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  res.json({ updatedAt: row.updatedAt });
});

export default router;
