import { Router } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { emitToUser } from '../realtime';
import { prisma } from '../db';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// POST-IT — agenda PERSONNEL de la To-do (01/10/2026).
//
// Un post-it n'appartient qu'à son auteur : TOUTES les requêtes filtrent sur
// `userId = req.user.id`, jamais sur une valeur du client, et même le Master ne lit
// pas ceux des autres. Connecté à rien d'autre dans Gearbox.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rôles qui ont un agenda Post-it : ceux qui ont la To-do (services/navigation.ts —
 * tous sauf External et chef de site).
 *
 * ⚠️ Guest y figure ALORS QU'IL EST EN LECTURE SEULE partout ailleurs : décision de Théo
 * (01/10/2026). Ses post-it sont SES données personnelles, pas les données partagées que
 * la lecture seule protège. Ce n'est pas un `EDIT_ROLES` : ne pas s'en servir ailleurs.
 */
const POSTIT_ROLES = ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager', 'Guest'];

/** Palette — liste blanche (le schéma n'a aucun enum). Mêmes clés que ui2/apps/todo/postit. */
export const POSTIT_COLORS = ['yellow', 'peach', 'pink', 'lavender', 'sky', 'mint', 'lime', 'slate'];

/**
 * Champs écrivables — liste blanche, comme `TASK_FIELDS` et `SOCIAL_FIELDS`.
 * ⚠️ Un champ absent d'ici est jeté EN SILENCE : une colonne ajoutée au modèle `PostIt`
 * s'ajoute à cette liste dans le même lot.
 */
const POSTIT_FIELDS = ['title', 'start', 'end', 'allDay', 'color'] as const;

const TITLE_MAX = 200;
const RE_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_SLOT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Date calendaire réelle (refuse le 31/02, 25:00…). */
const validDay = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const isDay = (v: unknown): v is string => {
  const m = typeof v === 'string' ? RE_DAY.exec(v) : null;
  return !!m && validDay(+m[1], +m[2], +m[3]);
};
const isSlot = (v: unknown): v is string => {
  const m = typeof v === 'string' ? RE_SLOT.exec(v) : null;
  return !!m && validDay(+m[1], +m[2], +m[3]) && +m[4] <= 23 && +m[5] <= 59;
};

type PostItInput = { title: string; start: string; end: string; allDay: boolean; color: string };

/** Ne garde que les champs de la liste blanche. */
const pick = (body: any): Partial<PostItInput> => {
  const out: any = {};
  for (const k of POSTIT_FIELDS) if (body && body[k] !== undefined) out[k] = body[k];
  return out;
};

/** Contrôle d'un post-it COMPLET ; rend le message d'erreur ou null. */
const invalid = (p: PostItInput): string | null => {
  if (typeof p.title !== 'string' || !p.title.trim()) return 'Titre requis.';
  if (p.title.trim().length > TITLE_MAX) return `Titre trop long (${TITLE_MAX} caractères maximum).`;
  if (typeof p.allDay !== 'boolean') return 'Champ "allDay" invalide.';
  if (!POSTIT_COLORS.includes(p.color)) return 'Couleur inconnue.';
  if (p.allDay) {
    if (!isDay(p.start) || !isDay(p.end)) return 'Dates attendues au format AAAA-MM-JJ.';
    if (p.end < p.start) return 'La fin précède le début.';
  } else {
    if (!isSlot(p.start) || !isSlot(p.end)) return 'Créneau attendu au format AAAA-MM-JJTHH:mm.';
    if (p.end <= p.start) return 'La fin doit suivre le début.';
  }
  return null;
};

const clean = (p: PostItInput): PostItInput => ({ ...p, title: p.title.trim() });

// GET /api/postits — les post-it de l'utilisateur connecté (tous : volumes personnels).
router.get('/', authenticateToken, requireRole(POSTIT_ROLES), async (req: AuthRequest, res) => {
  try {
    const rows = await prisma.postIt.findMany({ where: { userId: req.user!.id }, orderBy: { start: 'asc' } });
    res.json(rows);
  } catch (e) {
    console.error('GET /postits', e);
    res.status(500).json({ error: 'Lecture des post-it impossible.' });
  }
});

// POST /api/postits
router.post('/', authenticateToken, requireRole(POSTIT_ROLES), async (req: AuthRequest, res) => {
  const p = { allDay: false, color: 'yellow', ...pick(req.body) } as PostItInput;
  const err = invalid(p);
  if (err) return res.status(400).json({ error: err });
  try {
    const row = await prisma.postIt.create({ data: { ...clean(p), userId: req.user!.id } });
    emitToUser(req.user!.id, 'postits:changed');
    res.status(201).json(row);
  } catch (e) {
    console.error('POST /postits', e);
    res.status(500).json({ error: 'Création du post-it impossible.' });
  }
});

// PUT /api/postits/:id — mise à jour partielle, contrôlée sur le post-it COMPLET qui en résulte.
router.put('/:id', authenticateToken, requireRole(POSTIT_ROLES), async (req: AuthRequest, res) => {
  try {
    const cur = await prisma.postIt.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!cur) return res.status(404).json({ error: 'Post-it introuvable.' });   // celui d'un autre = introuvable
    const next = { title: cur.title, start: cur.start, end: cur.end, allDay: cur.allDay, color: cur.color, ...pick(req.body) } as PostItInput;
    const err = invalid(next);
    if (err) return res.status(400).json({ error: err });
    const row = await prisma.postIt.update({ where: { id: cur.id }, data: clean(next) });
    emitToUser(req.user!.id, 'postits:changed');
    res.json(row);
  } catch (e) {
    console.error('PUT /postits', e);
    res.status(500).json({ error: 'Modification du post-it impossible.' });
  }
});

// DELETE /api/postits/:id
router.delete('/:id', authenticateToken, requireRole(POSTIT_ROLES), async (req: AuthRequest, res) => {
  try {
    const r = await prisma.postIt.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    if (!r.count) return res.status(404).json({ error: 'Post-it introuvable.' });
    emitToUser(req.user!.id, 'postits:changed');
    res.sendStatus(204);
  } catch (e) {
    console.error('DELETE /postits', e);
    res.status(500).json({ error: 'Suppression du post-it impossible.' });
  }
});

export default router;
