
import React, { useState } from 'react';
import { GameProps } from './gameTypes';

const ROWS = 6;
const COLS = 7;

function dropRow(board: (string | null)[][], col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (!board[r][col]) return r;
  }
  return -1;
}

function checkWinner(board: (string | null)[][]): string | null {
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      if (!cell) continue;
      for (const [dr, dc] of directions) {
        let count = 1;
        for (let i = 1; i < 4; i++) {
          const nr = r + dr * i;
          const nc = c + dc * i;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== cell) break;
          count++;
        }
        if (count === 4) return cell;
      }
    }
  }
  return null;
}

const Connect4: React.FC<GameProps> = ({ session, myId, onUpdate }) => {
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const board: (string | null)[][] = session.board;
  const isMyTurn = session.currentTurn === myId;
  const isFinished = session.status === 'finished';
  const isP1 = session.player1Id === myId;

  const getWinCells = (): Set<string> => {
    const directions = [[0,1],[1,0],[1,1],[1,-1]];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (!cell) continue;
        for (const [dr, dc] of directions) {
          const cells: [number,number][] = [[r,c]];
          for (let i = 1; i < 4; i++) {
            const nr = r + dr * i;
            const nc = c + dc * i;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== cell) break;
            cells.push([nr, nc]);
          }
          if (cells.length === 4) return new Set(cells.map(([rr,cc]) => `${rr}-${cc}`));
        }
      }
    }
    return new Set();
  };

  const winCells = isFinished ? getWinCells() : new Set<string>();

  const handleColClick = (col: number) => {
    if (!isMyTurn || isFinished) return;
    const row = dropRow(board, col);
    if (row === -1) return;
    const newBoard = board.map(r => [...r]);
    newBoard[row][col] = myId;
    const winner = checkWinner(newBoard);
    const isFull = newBoard.every(r => r.every(c => c !== null));
    const nextTurn = isP1 ? session.player2Id : session.player1Id;
    onUpdate(newBoard, winner ? myId : nextTurn, winner ? myId : (isFull ? 'draw' : undefined));
  };

  const isDraw = session.winnerId === 'draw';
  const iWon = session.winnerId === myId;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-center">
        {isFinished ? (
          <p className={`font-bold text-lg ${iWon ? 'text-green-400' : isDraw ? 'text-yellow-400' : 'text-red-400'}`}>
            {isDraw ? 'Match nul !' : iWon ? 'Vous avez gagné !' : 'Vous avez perdu !'}
          </p>
        ) : (
          <p className="text-bony-text/70 text-sm">
            {isMyTurn
              ? <span className="text-bony-orange font-semibold">Votre tour</span>
              : <span>En attente de l'adversaire…</span>
            }
          </p>
        )}
      </div>

      {/* Column hover arrows */}
      <div className="flex gap-1">
        {Array.from({ length: COLS }, (_, c) => (
          <div key={c} className="w-10 h-5 flex items-center justify-center">
            {isMyTurn && !isFinished && hoverCol === c && (
              <div className={`w-0 h-0 border-l-4 border-r-4 border-t-8 border-l-transparent border-r-transparent ${isP1 ? 'border-t-bony-orange' : 'border-t-bony-violet'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div
        className="rounded-xl overflow-hidden border border-white/10"
        onMouseLeave={() => setHoverCol(null)}
      >
        {board.map((row, r) => (
          <div key={r} className="flex">
            {row.map((cell, c) => {
              const key = `${r}-${c}`;
              const isWin = winCells.has(key);
              const isP1Cell = cell === session.player1Id;
              const isPreview = !cell && isMyTurn && !isFinished && hoverCol === c && dropRow(board, c) === r;
              return (
                <div
                  key={c}
                  className="w-10 h-10 p-1 bg-[#1a2540] cursor-pointer"
                  onClick={() => handleColClick(c)}
                  onMouseEnter={() => setHoverCol(c)}
                >
                  <div className={`
                    w-full h-full rounded-full transition-all duration-150
                    ${cell
                      ? (isP1Cell
                          ? `${isWin ? 'bg-yellow-400' : 'bg-bony-orange'}`
                          : `${isWin ? 'bg-yellow-400' : 'bg-bony-violet'}`)
                      : isPreview
                        ? (isP1 ? 'bg-bony-orange/30' : 'bg-bony-violet/30')
                        : 'bg-[#0f1929]'
                    }
                  `} />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex gap-8 text-sm text-bony-text/60">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-bony-orange" />
          <span>{session.player1Name}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-bony-violet" />
          <span>{session.player2Name}</span>
        </div>
      </div>
    </div>
  );
};

export default Connect4;
