
import React from 'react';
import { GameProps } from './gameTypes';

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],             // diagonals
];

function checkWinner(board: (string | null)[]): string | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

const Morpion: React.FC<GameProps> = ({ session, myId, onUpdate }) => {
  const board: (string | null)[] = session.board;
  const isMyTurn = session.currentTurn === myId;
  const isFinished = session.status === 'finished';
  const mySymbol = session.player1Id === myId ? '✕' : '○';
  const oppSymbol = mySymbol === '✕' ? '○' : '✕';
  const myColor = session.player1Id === myId ? 'text-bony-orange' : 'text-bony-violet';

  const winnerCells = (() => {
    for (const line of WIN_LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) return line;
    }
    return [];
  })();

  const handleClick = (idx: number) => {
    if (!isMyTurn || isFinished || board[idx]) return;
    const newBoard = [...board];
    newBoard[idx] = myId;
    const winner = checkWinner(newBoard.map(cell => cell === session.player1Id ? 'p1' : cell === session.player2Id ? 'p2' : null));
    let winnerId: string | undefined;
    if (winner) winnerId = winner === 'p1' ? session.player1Id : session.player2Id;
    const isFull = newBoard.every(c => c !== null);
    const nextTurn = session.player1Id === myId ? session.player2Id : session.player1Id;
    onUpdate(newBoard, winnerId || isFull ? myId : nextTurn, winnerId || (isFull ? 'draw' : undefined));
  };

  const isDraw = !session.winnerId && session.status === 'finished';
  const winner = session.winnerId && session.winnerId !== 'draw' ? (session.winnerId === myId ? 'Vous avez gagné !' : 'Vous avez perdu !') : null;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        {isFinished ? (
          <p className={`font-bold text-lg ${session.winnerId === myId ? 'text-green-400' : isDraw ? 'text-yellow-400' : 'text-red-400'}`}>
            {isDraw ? 'Match nul !' : winner}
          </p>
        ) : (
          <p className="text-slate-700 dark:text-bony-text/70 text-sm">
            {isMyTurn
              ? <span className="text-bony-orange font-semibold">Votre tour — vous jouez <span className={myColor}>{mySymbol}</span></span>
              : <span>En attente de l'adversaire…</span>
            }
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {board.map((cell, idx) => {
          const isWinCell = winnerCells.includes(idx);
          const isP1 = cell === session.player1Id;
          const symbol = cell ? (isP1 ? '✕' : '○') : null;
          const color = isP1 ? 'text-bony-orange' : 'text-bony-violet';
          return (
            <button
              key={idx}
              onClick={() => handleClick(idx)}
              disabled={!!cell || !isMyTurn || isFinished}
              className={`
                w-20 h-20 rounded-xl border-2 flex items-center justify-center text-3xl font-bold transition-all duration-150
                ${isWinCell
                  ? 'border-yellow-400 bg-yellow-100 dark:bg-yellow-400/10'
                  : 'border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/5'}
                ${!cell && isMyTurn && !isFinished
                  ? 'hover:border-bony-orange/60 hover:bg-slate-200 dark:hover:bg-white/10 cursor-pointer'
                  : 'cursor-default'}
                ${color}
              `}
            >
              {symbol}
            </button>
          );
        })}
      </div>

      <div className="flex gap-8 text-sm text-slate-600 dark:text-bony-text/60">
        <div className="flex items-center gap-2">
          <span className="text-bony-orange font-bold">✕</span>
          <span>{session.player1Name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-bony-violet font-bold">○</span>
          <span>{session.player2Name}</span>
        </div>
      </div>
    </div>
  );
};

export default Morpion;
