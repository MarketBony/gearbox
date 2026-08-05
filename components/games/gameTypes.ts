// ============================================================================
// CONTRAT DE DONNÉES DES JEUX — miroir de la vue serveur
//
// ⚠️ Ces types décrivent ce que renvoie `projectSessionFor()`
// (backend/src/utils/gameView.ts), c'est-à-dire une vue **redactée pour le joueur
// courant** — et non la ligne `GameSession` en base. Concrètement, pour la
// bataille navale, `opponent` n'a **pas** de champ `ships` : les positions de la
// flotte adverse ne sortent jamais du serveur. Ne pas « compléter » ces types en
// croyant qu'il manque quelque chose.
//
// Autre changement de fond du 05/08/2026 : plus de `player1Name` / `player1Color`.
// L'ancienne version recopiait le nom dans chaque partie, si bien qu'un renommage
// laissait l'ancien nom au classement. L'identité se résout par `userId` au rendu,
// depuis la liste des utilisateurs.
// ============================================================================

export type GameType = 'morpion' | 'connect4' | 'battleship';

export const GAME_LABELS: Record<GameType, string> = {
  morpion: 'Morpion',
  connect4: 'Puissance 4',
  battleship: 'Bataille navale',
};

export interface GameChallenge {
  id: string;
  fromUserId: string;
  toUserId: string;
  game: GameType;
  status: 'pending' | 'accepted' | 'refused';
  sessionId?: string | null;
  createdAt: string;
}

// ---- Plateaux ----

export interface MorpionBoard {
  cells: (string | null)[]; // 9 cases, 'p1' | 'p2' | null
  winningLine?: number[];
}

export interface Connect4Board {
  cells: (string | null)[][]; // 6 lignes x 7 colonnes
  winningLine?: [number, number][];
  lastMove?: [number, number];
}

export interface ShipView {
  name: string;
  size: number;
  cells: [number, number][];
  hits?: number;
}

/** Ma flotte : je vois tout, c'est la mienne. */
export interface MyFleetView {
  ready: boolean;
  shots: Record<string, 'hit' | 'miss'>; // tirs REÇUS, clé "r,c"
  ships: ShipView[];
  allSunk: boolean;
}

/** La flotte adverse, telle que le serveur accepte de me la montrer. */
export interface EnemyFleetView {
  ready: boolean;
  shots: Record<string, 'hit' | 'miss'>; // MES tirs sur elle
  sunkShips: ShipView[]; // découverts à la loyale, donc plus secrets
  remaining: { name: string; size: number }[]; // ce qu'il reste, sans position
  allSunk: boolean;
}

export interface BattleshipBoard {
  me: MyFleetView;
  opponent: EnemyFleetView;
}

export interface GameSession {
  id: string;
  game: GameType;
  player1Id: string;
  player2Id: string;
  currentTurn: string;
  status: 'placing' | 'playing' | 'finished';
  winnerId?: string; // userId, ou 'draw'
  board: any; // MorpionBoard | Connect4Board | BattleshipBoard selon `game`
  myRole: 'p1' | 'p2';
  opponentId: string;
  createdAt: string;
  updatedAt: string;
}

/** Partie terminée, sans plateau — sert au classement et à l'historique. */
export interface GameSummary {
  id: string;
  game: GameType;
  player1Id: string;
  player2Id: string;
  status: string;
  winnerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LobbyData {
  challenges: GameChallenge[];
  sessions: GameSession[];
  history: GameSummary[];
}

/** Retour d'un coup, destiné à l'auteur (animation et message). */
export interface MoveFeedback {
  effect?: 'miss' | 'hit' | 'sunk';
  sunkShipName?: string;
}

export interface GameProps {
  session: GameSession;
  myId: string;
  /** Joue un coup. Le serveur valide et renvoie l'effet ; jamais de calcul local. */
  onMove: (move: any) => Promise<MoveFeedback & { error?: string }>;
  /**
   * Envoie sa flotte (bataille navale, phase de placement). Callback distinct de
   * `onMove` à dessein : placer n'est pas jouer, et les deux passent par des
   * événements socket différents. Absent pour les jeux qui n'ont pas de flotte.
   */
  onPlaceFleet?: (ships: { name: string; cells: [number, number][] }[]) => Promise<{ error?: string }>;
}
