import { Router } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { prisma } from '../db';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// CONGÉS — planning de l'équipe marketing (12/09/2026).
//
// Portage du fichier HTML tenu par le boss de Théo. Deux notions :
//  - `CongeJour`   : une ligne = une cellule (une personne × un jour) ;
//  - `CongeMembre` : le PÉRIMÈTRE, c'est-à-dire qui apparaît dans le planning. Tous les
//    comptes Gearbox ne sont pas du marketing.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rôles qui peuvent LIRE le planning.
 *
 * ⚠️ `Site Manager` et `External` en sont absents, et c'est le VRAI refus : masquer une
 * rubrique dans la navigation ne ferme pas une route — leçon qui a coûté deux passes au
 * lot du chef de site. D'où un `requireRole` même sur le GET, comme `routes/tasks.ts`.
 *
 * ⚠️ Être dans cette liste ne suffit pas à VOIR la rubrique : il faut en plus appartenir
 * au périmètre (ou le gérer). Le rôle ouvre la porte, le périmètre décide.
 */
const LECTURE_ROLES = ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager', 'Guest'];

/**
 * Gestion du périmètre, et saisie POUR AUTRUI.
 *
 * ⚠️ Constante locale au fichier, volontairement : `routes/users.ts` a un `ADMIN_ROLES`
 * de même contenu, mais ce n'est pas la même règle. La convention du dépôt est explicite
 * — coïncidence de valeurs n'est pas identité de règle, on ne les aliase pas.
 */
const GESTION_ROLES = ['Master', 'Administrator', 'Director'];

/**
 * Qui peut poser le ✓ « validé ».
 *
 * ⚠️ **Administrator en est EXCLU** — décision explicite de Théo (11/09/2026). Ce n'est
 * pas une incohérence avec `GESTION_ROLES` : un Administrator organise le planning, il
 * ne valide pas les congés. Ne pas « corriger » en l'ajoutant.
 */
const VALIDATION_ROLES = ['Master', 'Director'];

/**
 * FAMILLES de congé — liste blanche. Le schéma Prisma n'a aucun enum (convention du
 * projet), cette liste est donc le seul garde-fou contre une valeur inventée par un client.
 *
 * ⚠️ 12/09/2026 — les codes 'CPAM'/'CPAPM' ont DISPARU : la demi-journée est un champ à
 * part (`demi`), valable pour toutes les familles. Un vieux client qui enverrait 'CPAM'
 * reçoit un 400, ce qui est le comportement voulu (aucune ligne de ce type n'existe en
 * base, la table était vide au moment de la bascule).
 */
const TYPES_CONGE = ['CP', 'RTT', 'HR', 'CSS', 'CR'];

/** Demi-journées. `null` / absent = jour entier. */
const DEMIS_CONGE = ['AM', 'PM'];

/**
 * Normalise le champ `demi` reçu, ou rend `undefined` s'il est invalide.
 * `null`, `''` et l'absence valent toutes « jour entier ».
 */
const demiValide = (v: unknown): string | null | undefined => {
  if (v === undefined || v === null || v === '') return null;
  return typeof v === 'string' && DEMIS_CONGE.includes(v) ? v : undefined;
};

/**
 * Droit à CP par défaut, en jours ouvrés, quand aucune ligne `CongeDroit` n'existe.
 * Art. L3141-3 : 2,5 jours ouvrables par mois, 30 ouvrables au plus = 25 jours ouvrés.
 * ⚠️ Doit rester égal à `CONGES_DROIT_DEFAUT` dans `constants.ts` (copie d'affichage).
 */
const DROIT_DEFAUT = 25;

/** 'YYYY-MM-DD' — et une vraie date, pas un 2026-02-31. */
const FORMAT_JOUR = /^\d{4}-\d{2}-\d{2}$/;
const jourValide = (v: unknown): v is string => {
  if (typeof v !== 'string' || !FORMAT_JOUR.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/**
 * A-t-on le droit d'écrire sur la ligne de `userId` ?
 *
 * Règle arbitrée par Théo : chacun pose et modifie SA ligne, les gestionnaires posent
 * pour tout le monde.
 *
 * ⚠️ SEULE PORTE de cette règle : les quatre routes d'écriture passent par ici. La
 * recopier dans chaque handler, c'est la garantie qu'une des copies divergera.
 */
const peutEcrirePour = (req: AuthRequest, userId: string): boolean =>
  req.user!.id === userId || GESTION_ROLES.includes(req.user!.role);

/**
 * Le périmètre, ET RIEN QUE LE PÉRIMÈTRE.
 *
 * ⚠️ On refuse d'écrire un congé pour quelqu'un qui n'est pas dans la rubrique : sans ce
 * contrôle, un gestionnaire pourrait créer des lignes pour un compte absent du planning
 * — invisibles à l'écran, mais bien comptées le jour où on l'ajoute.
 */
const estMembre = async (userId: string): Promise<boolean> =>
  !!(await prisma.congeMembre.findUnique({ where: { userId }, select: { id: true } }));

/** Toutes les dates 'YYYY-MM-DD' de `debut` à `fin` incluses. Borne dure à 400 jours. */
const joursEntre = (debut: string, fin: string): string[] => {
  const sortie: string[] = [];
  const d = new Date(`${debut}T00:00:00Z`);
  const f = new Date(`${fin}T00:00:00Z`);
  while (d <= f && sortie.length < 400) {
    sortie.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return sortie;
};

// ───────────────────────────── LECTURE ─────────────────────────────

/**
 * Le planning d'une période + le périmètre, en UNE requête.
 *
 * ⚠️ Les week-ends et les jours fériés ne sont PAS filtrés ici : ils sont exclus de
 * l'affichage et du comptage côté client (`lib/joursFeries.ts`). Dupliquer le calendrier
 * des fériés côté serveur créerait une table de plus à garder synchronisée (après
 * `PLAQUES_STRUCTURE`) pour un gain nul — une ligne posée un dimanche par un appel direct
 * ne serait comptée nulle part. C'est un choix, pas un oubli.
 */
router.get('/', authenticateToken, requireRole(LECTURE_ROLES), async (req: AuthRequest, res) => {
  const { debut, fin } = req.query as { debut?: string; fin?: string };
  const where = (jourValide(debut) && jourValide(fin)) ? { date: { gte: debut, lte: fin } } : {};

  const [jours, membres, droits] = await Promise.all([
    prisma.congeJour.findMany({ where, orderBy: { date: 'asc' } }),
    prisma.congeMembre.findMany({ orderBy: { createdAt: 'asc' } }),
    // Les droits sont peu nombreux (une ligne par personne et par période, et seulement
    // quand le défaut a été modifié) : on les renvoie tous plutôt que de filtrer sur la
    // période demandée, que le tableau de bord fait varier indépendamment du planning.
    prisma.congeDroit.findMany({ select: { userId: true, periode: true, jours: true } }),
  ]);
  res.json({ jours, membres: membres.map(m => m.userId), droits });
});

/**
 * Droit à CP d'une personne sur une période de référence (juin `periode` → mai +1).
 *
 * ⚠️ Écrire le droit par défaut SUPPRIME la ligne au lieu d'en écrire une : l'absence de
 * ligne vaut 25 jours, et garder une ligne « 25 » ferait diverger les deux représentations
 * du même état le jour où le défaut changerait.
 */
router.put('/droit', authenticateToken, requireRole(GESTION_ROLES), async (req: AuthRequest, res) => {
  const { userId, periode, jours } = req.body ?? {};
  if (typeof userId !== 'string' || !userId) return res.status(400).json({ error: 'userId requis.' });
  if (!Number.isInteger(periode) || periode < 2000 || periode > 2100) {
    return res.status(400).json({ error: 'Période invalide (année de début attendue).' });
  }
  if (typeof jours !== 'number' || !Number.isFinite(jours) || jours < 0 || jours > 366) {
    return res.status(400).json({ error: 'Nombre de jours invalide.' });
  }
  if (!(await estMembre(userId))) {
    return res.status(400).json({ error: 'Cette personne ne fait pas partie de la rubrique Congés.' });
  }

  if (jours === DROIT_DEFAUT) {
    await prisma.congeDroit.deleteMany({ where: { userId, periode } });
  } else {
    await prisma.congeDroit.upsert({
      where: { userId_periode: { userId, periode } },
      create: { userId, periode, jours, updatedBy: req.user!.id },
      update: { jours, updatedBy: req.user!.id },
    });
  }
  emitEvent('conges:updated', { userId, periode });
  res.sendStatus(204);
});

// ───────────────────────────── PÉRIMÈTRE ─────────────────────────────

router.post('/membres', authenticateToken, requireRole(GESTION_ROLES), async (req: AuthRequest, res) => {
  const { userId } = req.body ?? {};
  if (typeof userId !== 'string' || !userId) return res.status(400).json({ error: 'userId requis.' });

  // Le compte doit exister ET avoir un rôle qui a accès à la rubrique : ajouter un chef
  // de site au périmètre créerait une ligne de planning que son propre rôle lui interdit
  // de lire.
  const cible = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!cible) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (!LECTURE_ROLES.includes(cible.role)) {
    return res.status(400).json({ error: `Le rôle « ${cible.role} » n'a pas accès à la rubrique Congés.` });
  }

  await prisma.congeMembre.upsert({
    where: { userId },
    create: { userId, addedBy: req.user!.id },
    update: {},
  });
  emitEvent('conges:updated', { userId });
  res.sendStatus(204);
});

/**
 * ⚠️ Retire du PLANNING, ne supprime AUCUN congé. Volontaire : un décochage ne doit pas
 * détruire un historique. Le réajouter fait réapparaître ses lignes telles quelles.
 */
router.delete('/membres/:userId', authenticateToken, requireRole(GESTION_ROLES), async (req: AuthRequest, res) => {
  await prisma.congeMembre.deleteMany({ where: { userId: req.params.userId } });
  emitEvent('conges:updated', { userId: req.params.userId });
  res.sendStatus(204);
});

// ───────────────────────────── ÉCRITURE D'UN JOUR ─────────────────────────────

/**
 * Pose, change ou efface UNE cellule. `type: null` supprime la ligne.
 *
 * ⚠️ La validation n'est PAS touchée ici : changer le type d'un congé déjà validé le
 * laisse validé, et seuls Master/Director peuvent basculer ce drapeau (route dédiée).
 */
router.put('/jour', authenticateToken, requireRole(LECTURE_ROLES), async (req: AuthRequest, res) => {
  const { userId, date, type, demi } = req.body ?? {};
  if (typeof userId !== 'string' || !userId) return res.status(400).json({ error: 'userId requis.' });
  if (!jourValide(date)) return res.status(400).json({ error: 'Date invalide (attendu YYYY-MM-DD).' });
  if (!peutEcrirePour(req, userId)) {
    return res.status(403).json({ error: "Vous ne pouvez modifier que vos propres congés." });
  }
  if (!(await estMembre(userId))) {
    return res.status(400).json({ error: 'Cette personne ne fait pas partie de la rubrique Congés.' });
  }

  if (type === null || type === '') {
    await prisma.congeJour.deleteMany({ where: { userId, date } });
    emitEvent('conges:updated', { userId, date });
    return res.sendStatus(204);
  }
  if (!TYPES_CONGE.includes(type)) return res.status(400).json({ error: 'Type de congé inconnu.' });
  const demiNorm = demiValide(demi);
  if (demiNorm === undefined) return res.status(400).json({ error: 'Demi-journée inconnue (AM, PM ou rien).' });

  const jour = await prisma.congeJour.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, type, demi: demiNorm, createdBy: req.user!.id },
    update: { type, demi: demiNorm },
  });
  emitEvent('conges:updated', { userId, date });
  res.json(jour);
});

/**
 * Pose un type sur une PLAGE de dates.
 *
 * ⚠️ Sans cette route, poser trois semaines demanderait quinze clics — et quinze
 * requêtes. Les week-ends ne sont pas écartés ici (voir le GET) : le client n'envoie que
 * des jours ouvrés, et une ligne parasite ne serait comptée nulle part.
 */
router.put('/periode', authenticateToken, requireRole(LECTURE_ROLES), async (req: AuthRequest, res) => {
  const { userId, debut, fin, type, demi, jours } = req.body ?? {};
  if (typeof userId !== 'string' || !userId) return res.status(400).json({ error: 'userId requis.' });
  if (!peutEcrirePour(req, userId)) {
    return res.status(403).json({ error: "Vous ne pouvez modifier que vos propres congés." });
  }
  if (!(await estMembre(userId))) {
    return res.status(400).json({ error: 'Cette personne ne fait pas partie de la rubrique Congés.' });
  }

  // Le client envoie la liste exacte des jours à écrire (il a déjà retiré week-ends et
  // fériés) ; `debut`/`fin` restent acceptés comme forme de repli.
  const cibles: string[] = Array.isArray(jours)
    ? jours.filter(jourValide)
    : (jourValide(debut) && jourValide(fin) ? joursEntre(debut, fin) : []);
  if (cibles.length === 0) return res.status(400).json({ error: 'Aucun jour valide dans la période.' });
  if (type !== null && type !== '' && !TYPES_CONGE.includes(type)) {
    return res.status(400).json({ error: 'Type de congé inconnu.' });
  }
  const demiNorm = demiValide(demi);
  if (demiNorm === undefined) return res.status(400).json({ error: 'Demi-journée inconnue (AM, PM ou rien).' });

  if (type === null || type === '') {
    await prisma.congeJour.deleteMany({ where: { userId, date: { in: cibles } } });
  } else {
    // ⚠️ Une transaction, pas une boucle de requêtes indépendantes : sur 30 jours, un
    // échec au milieu laisserait la période à moitié posée.
    await prisma.$transaction(
      cibles.map(date => prisma.congeJour.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, type, demi: demiNorm, createdBy: req.user!.id },
        update: { type, demi: demiNorm },
      }))
    );
  }
  emitEvent('conges:updated', { userId });
  res.json({ jours: cibles.length });
});

/**
 * Le ✓ de la maquette.
 *
 * ⚠️ `VALIDATION_ROLES` et non `GESTION_ROLES` : Administrator peut poser un congé pour
 * un collègue mais ne peut pas le valider. C'est la demande de Théo, pas une coquille.
 */
router.put('/jour/validation', authenticateToken, requireRole(VALIDATION_ROLES), async (req: AuthRequest, res) => {
  const { userId, date, validated } = req.body ?? {};
  if (typeof userId !== 'string' || !userId) return res.status(400).json({ error: 'userId requis.' });
  if (!jourValide(date)) return res.status(400).json({ error: 'Date invalide (attendu YYYY-MM-DD).' });
  if (typeof validated !== 'boolean') return res.status(400).json({ error: 'validated doit être un booléen.' });

  const maj = await prisma.congeJour.updateMany({ where: { userId, date }, data: { validated } });
  if (maj.count === 0) return res.status(404).json({ error: 'Aucun congé à cette date.' });
  emitEvent('conges:updated', { userId, date });
  res.sendStatus(204);
});

export default router;
