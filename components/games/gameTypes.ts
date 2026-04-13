
export type GameType = 'morpion' | 'connect4' | 'battleship';

export interface GameChallenge {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserColor: string;
  toUserId: string;
  game: GameType;
  status: 'pending' | 'accepted' | 'refused';
  createdAt: string;
}

export interface GameSession {
  id: string;
  game: GameType;
  player1Id: string;
  player1Name: string;
  player1Color: string;
  player2Id: string;
  player2Name: string;
  player2Color: string;
  currentTurn: string; // userId
  board: any;
  status: 'playing' | 'finished';
  winnerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GameProps {
  session: GameSession;
  myId: string;
  onUpdate: (board: any, nextTurn: string, winnerId?: string) => void;
}
