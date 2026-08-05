import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole, AuthRequest } from '../auth/middleware';
import { GAMES_ROLES } from '../auth/roles';
import { isGameType, initBoard, initStatus } from '../utils/gameRules';
import { projectSessionFor, projectSessionSummary } from '../utils/gameView';
import { notifyChallenge, notifySessionToPlayers } from '../realtime';

const router = Router();
const prisma = new PrismaClient();

// Toutes les routes de jeu sont réservées aux rôles autorisés (règle métier :
// Director en est exclu, contrairement à ses autres droits d'Administrator).
router.use(authenticateToken, requireRole(GAMES_ROLES));

// GET /api/games/lobby — tout ce dont le lobby a besoin, en un appel.
router.get('/lobby', async (req: AuthRequest, res) => {
  const me = req.user!.id;

  const [challenges, mySessions, finished] = await Promise.all([
    prisma.gameChallenge.findMany({
      where: { status: 'pending', OR: [{ toUserId: me }, { fromUserId: me }] },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.gameSession.findMany({
      where: { OR: [{ player1Id: me }, { player2Id: me }] },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    // Classement : TOUTES les parties terminées, pas seulement les miennes —
    // c'est ce qui manquait, le « classement global » ne voyait que le
    // localStorage du poste courant.
    prisma.gameSession.findMany({
      where: { status: 'finished' },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    }),
  ]);

  res.json({
    challenges,
    // Mes parties : vue redactée, elles peuvent être en cours.
    sessions: mySessions.map(s => projectSessionFor(me, s)),
    // Historique global : aucun plateau, donc rien de secret.
    history: finished.map(projectSessionSummary),
  });
});

// GET /api/games/sessions/:id — une partie précise, redactée pour l'appelant.
router.get('/sessions/:id', async (req: AuthRequest, res) => {
  const me = req.user!.id;
  const session = await prisma.gameSession.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ error: 'Partie introuvable.' });
  if (session.player1Id !== me && session.player2Id !== me) {
    // 403 et non 404 : l'existence d'une partie n'est pas un secret, son
    // contenu si — et surtout on ne renvoie jamais le plateau d'autrui.
    return res.status(403).json({ error: "Vous ne participez pas à cette partie." });
  }
  res.json(projectSessionFor(me, session));
});

// POST /api/games/challenges — défier un collègue.
router.post('/challenges', async (req: AuthRequest, res) => {
  const me = req.user!.id;
  const { toUserId, game } = req.body ?? {};

  if (typeof toUserId !== 'string' || !toUserId) {
    return res.status(400).json({ error: 'Destinataire requis.' });
  }
  if (toUserId === me) return res.status(400).json({ error: 'Vous ne pouvez pas vous défier vous-même.' });
  if (!isGameType(game)) return res.status(400).json({ error: 'Jeu inconnu.' });

  // La cible doit exister ET avoir accès aux Jeux — sinon on créerait un défi
  // que personne ne pourra jamais voir ni accepter.
  const cible = await prisma.user.findUnique({ where: { id: toUserId } });
  if (!cible) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (!GAMES_ROLES.includes(cible.role)) {
    return res.status(400).json({ error: `${cible.name} n'a pas accès aux Jeux.` });
  }

  // Un seul défi en attente par couple (émetteur, destinataire, jeu) : sans ça
  // un clic répété inonderait le lobby de l'adversaire.
  const existant = await prisma.gameChallenge.findFirst({
    where: { fromUserId: me, toUserId, game, status: 'pending' },
  });
  if (existant) return res.json(existant);

  const challenge = await prisma.gameChallenge.create({
    data: { fromUserId: me, toUserId, game, status: 'pending' },
  });

  // Événement ciblé + notification push : c'est précisément ce qui manquait,
  // « il ne reçoit jamais l'invitation ».
  notifyChallenge(challenge, me);
  res.json(challenge);
});

// POST /api/games/challenges/:id/refuse
router.post('/challenges/:id/refuse', async (req: AuthRequest, res) => {
  const me = req.user!.id;
  const challenge = await prisma.gameChallenge.findUnique({ where: { id: req.params.id } });
  if (!challenge) return res.status(404).json({ error: 'Défi introuvable.' });
  // Seul le destinataire refuse ; l'émetteur, lui, peut annuler (même route,
  // même effet : le défi sort des listes des deux côtés).
  if (challenge.toUserId !== me && challenge.fromUserId !== me) {
    return res.status(403).json({ error: 'Ce défi ne vous concerne pas.' });
  }
  if (challenge.status !== 'pending') return res.json(challenge);

  const maj = await prisma.gameChallenge.update({
    where: { id: challenge.id },
    data: { status: 'refused' },
  });
  notifyChallenge(maj, me);
  res.json(maj);
});

// POST /api/games/challenges/:id/accept — crée la partie.
router.post('/challenges/:id/accept', async (req: AuthRequest, res) => {
  const me = req.user!.id;
  const challenge = await prisma.gameChallenge.findUnique({ where: { id: req.params.id } });
  if (!challenge) return res.status(404).json({ error: 'Défi introuvable.' });
  // ⚠️ SEUL le destinataire accepte : sans ce contrôle, l'émetteur pourrait
  // accepter son propre défi et démarrer une partie que l'autre n'a pas voulue.
  if (challenge.toUserId !== me) {
    return res.status(403).json({ error: "Seule la personne défiée peut accepter." });
  }
  if (challenge.status === 'accepted' && challenge.sessionId) {
    const deja = await prisma.gameSession.findUnique({ where: { id: challenge.sessionId } });
    if (deja) return res.json(projectSessionFor(me, deja));
  }
  if (challenge.status !== 'pending') return res.status(400).json({ error: 'Défi déjà traité.' });
  if (!isGameType(challenge.game)) return res.status(400).json({ error: 'Jeu inconnu.' });

  const session = await prisma.gameSession.create({
    data: {
      game: challenge.game,
      // L'émetteur du défi est joueur 1 et commence — convention explicite.
      player1Id: challenge.fromUserId,
      player2Id: me,
      currentTurn: challenge.fromUserId,
      board: initBoard(challenge.game) as any,
      status: initStatus(challenge.game),
    },
  });
  await prisma.gameChallenge.update({
    where: { id: challenge.id },
    data: { status: 'accepted', sessionId: session.id },
  });

  // Les DEUX joueurs sont prévenus, chacun avec SA vue redactée.
  notifySessionToPlayers(session, 'game:session:started');
  res.json(projectSessionFor(me, session));
});

export default router;
