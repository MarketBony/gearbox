import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { GAMES_ROLES } from '../auth/roles';
import { applyMove, validateFleet, IllegalMoveError, BattleshipBoard } from '../utils/gameRules';
import { projectSessionFor, SessionRow } from '../utils/gameView';

const prisma = new PrismaClient();

// Même convention de room que le chat : une room par utilisateur. Une partie ne
// concerne que deux personnes, on ne diffuse donc JAMAIS en global — chaque
// joueur reçoit sa propre vue redactée dans sa room.
const userRoom = (id: string) => `user:${id}`;

type Ack = ((response: any) => void) | undefined;
const reply = (ack: Ack, data: any) => { if (typeof ack === 'function') ack(data); };

// Envoie à chaque joueur SA vue de la partie. ⚠️ Deux `emit` distincts et non un
// `io.to(a).to(b)` : le payload diffère par destinataire, c'est toute la raison
// d'être de `projectSessionFor`. Un émetteur commun renverrait à l'un les navires
// de l'autre.
export const emitSessionToPlayers = (io: Server, session: SessionRow, event: string) => {
  io.to(userRoom(session.player1Id)).emit(event, projectSessionFor(session.player1Id, session));
  io.to(userRoom(session.player2Id)).emit(event, projectSessionFor(session.player2Id, session));
};

const chargerPartie = async (sessionId: unknown, userId: string) => {
  if (typeof sessionId !== 'string' || !sessionId) throw new IllegalMoveError('Partie requise.');
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new IllegalMoveError('Partie introuvable.');
  if (session.player1Id !== userId && session.player2Id !== userId) {
    throw new IllegalMoveError('Vous ne participez pas à cette partie.');
  }
  return session;
};

export const registerGameHandlers = (io: Server, socket: Socket) => {
  const userId: string = socket.data.user.id;
  const role: string | undefined = socket.data.user.role;
  // Un rôle sans accès aux Jeux n'a aucun handler enregistré : la porte est
  // fermée au transport, pas seulement dans l'interface.
  if (!role || !GAMES_ROLES.includes(role)) return;

  // ---- Placement de flotte (bataille navale) ----
  socket.on('game:fleet:place', async (payload: any, ack: Ack) => {
    try {
      const session = await chargerPartie(payload?.sessionId, userId);
      if (session.game !== 'battleship') throw new IllegalMoveError('Ce jeu n\'a pas de flotte.');
      if (session.status !== 'placing') throw new IllegalMoveError('Le placement est terminé.');

      // ⚠️ La flotte reçue est validée intégralement (tailles, alignement,
      // contiguïté, chevauchements, limites de grille) : sans ce contrôle on
      // pourrait envoyer une flotte de deux cases et devenir imbattable.
      const ships = validateFleet(payload?.ships);

      const board: BattleshipBoard = JSON.parse(JSON.stringify(session.board));
      const maFlotte = session.player1Id === userId ? board.p1 : board.p2;
      if (maFlotte.ready) throw new IllegalMoveError('Votre flotte est déjà placée.');
      maFlotte.ships = ships;
      maFlotte.ready = true;

      // La partie ne démarre que quand LES DEUX flottes sont posées.
      const lesDeuxPretes = board.p1.ready && board.p2.ready;
      const maj = await prisma.gameSession.update({
        where: { id: session.id },
        data: { board: board as any, status: lesDeuxPretes ? 'playing' : 'placing' },
      });

      emitSessionToPlayers(io, maj, 'game:session:updated');
      reply(ack, { ok: true, session: projectSessionFor(userId, maj) });
    } catch (e) {
      reply(ack, { error: e instanceof IllegalMoveError ? e.message : 'Échec du placement.' });
      if (!(e instanceof IllegalMoveError)) console.error('[games] fleet:place', e);
    }
  });

  // ---- Coup joué ----
  socket.on('game:move', async (payload: any, ack: Ack) => {
    try {
      const session = await chargerPartie(payload?.sessionId, userId);

      // TOUTE la validation est ici, côté serveur : tour, case libre, coup légal,
      // et c'est le serveur qui désigne le vainqueur. Le client ne propose qu'une
      // case — un `winnerId` envoyé par lui serait purement ignoré.
      const r = applyMove(session, userId, payload?.move);

      const maj = await prisma.gameSession.update({
        where: { id: session.id },
        data: {
          board: r.board,
          currentTurn: r.nextTurn,
          status: r.status,
          winnerId: r.winnerId ?? null,
        },
      });

      emitSessionToPlayers(io, maj, 'game:session:updated');
      // L'effet du tir (manqué / touché / coulé) ne concerne que l'auteur : il
      // sert à l'animation et au message, l'adversaire le déduit de sa grille.
      reply(ack, {
        ok: true,
        effect: r.effect,
        sunkShipName: r.sunkShipName,
        session: projectSessionFor(userId, maj),
      });
    } catch (e) {
      reply(ack, { error: e instanceof IllegalMoveError ? e.message : 'Coup refusé.' });
      if (!(e instanceof IllegalMoveError)) console.error('[games] move', e);
    }
  });

  // ---- Abandon ----
  socket.on('game:forfeit', async (payload: any, ack: Ack) => {
    try {
      const session = await chargerPartie(payload?.sessionId, userId);
      if (session.status === 'finished') return reply(ack, { ok: true });
      const adversaire = session.player1Id === userId ? session.player2Id : session.player1Id;
      const maj = await prisma.gameSession.update({
        where: { id: session.id },
        data: { status: 'finished', winnerId: adversaire },
      });
      emitSessionToPlayers(io, maj, 'game:session:updated');
      reply(ack, { ok: true });
    } catch (e) {
      reply(ack, { error: e instanceof IllegalMoveError ? e.message : "Échec de l'abandon." });
    }
  });
};
