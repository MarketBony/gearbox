import { BattleshipBoard, Fleet, Ship, fleetSunk } from './gameRules';

// ============================================================================
// VUE D'UNE PARTIE POUR UN JOUEUR DONNÉ — SEULE FORME QUI SORT DU BACKEND
//
// ⚠️ RÈGLE À NE JAMAIS ENFREINDRE, au même titre que `publicUser` pour
// `passwordHash` : aucune route et aucun événement socket ne renvoie une
// `GameSession` brute. Elle contient la position des navires des DEUX joueurs ;
// l'envoyer telle quelle suffirait à gagner toute partie de bataille navale en
// ouvrant l'onglet Réseau du navigateur.
//
// C'était sans conséquence tant que les parties vivaient dans le localStorage
// (on jouait seul contre soi-même). Ça devient une faille dès que la partie est
// partagée — d'où ce module, créé avec le lot du 05/08/2026.
// ============================================================================

export interface SessionRow {
  id: string;
  game: string;
  player1Id: string;
  player2Id: string;
  currentTurn: string;
  board: any;
  status: string;
  winnerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Ce qu'un joueur a le droit de savoir de la flotte ADVERSE : les tirs qu'il y a
// déjà portés, le nombre de navires restants, et les navires effectivement
// coulés (leurs positions sont alors connues de lui, donc plus secrètes).
const redactEnemyFleet = (fleet: Fleet) => ({
  ready: fleet.ready,
  shots: fleet.shots,
  // Navires coulés uniquement : le joueur les a découverts à la loyale.
  sunkShips: fleet.ships
    .filter(s => s.hits >= s.size)
    .map(s => ({ name: s.name, size: s.size, cells: s.cells })),
  // Combien il reste à couler, et de quelles tailles — information que le site
  // de référence affiche aussi, et qui ne révèle aucune position.
  remaining: fleet.ships.filter(s => s.hits < s.size).map(s => ({ name: s.name, size: s.size })),
  allSunk: fleetSunk(fleet),
});

// Ma propre flotte : je vois tout, c'est la mienne.
const ownFleet = (fleet: Fleet) => ({
  ready: fleet.ready,
  shots: fleet.shots,
  ships: fleet.ships.map((s: Ship) => ({ name: s.name, size: s.size, cells: s.cells, hits: s.hits })),
  allSunk: fleetSunk(fleet),
});

const redactBattleship = (board: BattleshipBoard, jeSuisP1: boolean) => {
  const mien = jeSuisP1 ? board.p1 : board.p2;
  const sien = jeSuisP1 ? board.p2 : board.p1;
  // Volontairement nommé « me / opponent » et non « p1 / p2 » : le frontend n'a
  // pas à savoir quel numéro il porte pour dessiner ses grilles, et ça rend une
  // fuite plus visible à la lecture.
  return { me: ownFleet(mien), opponent: redactEnemyFleet(sien) };
};

export const projectSessionFor = (userId: string, session: SessionRow) => {
  const jeSuisP1 = session.player1Id === userId;

  // Morpion et puissance 4 : le plateau est intégralement public par nature (les
  // deux joueurs voient la même grille), aucune redaction nécessaire.
  const board =
    session.game === 'battleship'
      ? redactBattleship(session.board as BattleshipBoard, jeSuisP1)
      : session.board;

  return {
    id: session.id,
    game: session.game,
    player1Id: session.player1Id,
    player2Id: session.player2Id,
    currentTurn: session.currentTurn,
    status: session.status,
    winnerId: session.winnerId ?? undefined,
    board,
    // Confort de rendu : évite au frontend de recomparer les ids partout.
    myRole: jeSuisP1 ? 'p1' : 'p2',
    opponentId: jeSuisP1 ? session.player2Id : session.player1Id,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
};

// Vue « historique » pour le classement : aucune information de plateau, donc
// rien de secret. Sert aux listes de parties terminées et aux statistiques.
export const projectSessionSummary = (session: SessionRow) => ({
  id: session.id,
  game: session.game,
  player1Id: session.player1Id,
  player2Id: session.player2Id,
  status: session.status,
  winnerId: session.winnerId ?? undefined,
  createdAt: session.createdAt.toISOString(),
  updatedAt: session.updatedAt.toISOString(),
});
