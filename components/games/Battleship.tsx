
import React, { useState } from 'react';
import { GameProps } from './gameTypes';

const GRID = 10;
const SHIP_SIZES = [5, 4, 3, 3, 2];
const SHIP_NAMES = ['Porte-avions', 'Croiseur', 'Destroyer', 'Sous-marin', 'Torpilleur'];

type Cell = null | 'ship' | 'hit' | 'miss';
type Grid = Cell[][];
type Direction = 'H' | 'V';

interface BattleshipBoard {
  p1: { grid: Grid; ready: boolean };
  p2: { grid: Grid; ready: boolean };
  p1Shots: Grid;
  p2Shots: Grid;
}

function emptyGrid(): Grid {
  return Array.from({ length: GRID }, () => Array(GRID).fill(null));
}

function canPlace(grid: Grid, row: number, col: number, size: number, dir: Direction): boolean {
  for (let i = 0; i < size; i++) {
    const r = dir === 'V' ? row + i : row;
    const c = dir === 'H' ? col + i : col;
    if (r >= GRID || c >= GRID) return false;
    if (grid[r][c] === 'ship') return false;
  }
  return true;
}

function placeShip(grid: Grid, row: number, col: number, size: number, dir: Direction): Grid {
  const newGrid = grid.map(r => [...r]);
  for (let i = 0; i < size; i++) {
    const r = dir === 'V' ? row + i : row;
    const c = dir === 'H' ? col + i : col;
    newGrid[r][c] = 'ship';
  }
  return newGrid;
}

function countShipCells(grid: Grid): number {
  return grid.flat().filter(c => c === 'ship').length;
}

function allSunk(myGrid: Grid, shots: Grid): boolean {
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (myGrid[r][c] === 'ship' && shots[r][c] !== 'hit') return false;
    }
  }
  return true;
}

const GridDisplay: React.FC<{
  grid: Grid;
  shots?: Grid;
  interactive?: boolean;
  onShoot?: (r: number, c: number) => void;
  showShips?: boolean;
  hoverCell?: [number, number] | null;
  onHover?: (r: number, c: number) => void;
  onLeave?: () => void;
}> = ({ grid, shots, interactive, onShoot, showShips, hoverCell, onHover, onLeave }) => {
  return (
    <div className="inline-block border border-white/10 rounded-lg overflow-hidden" onMouseLeave={onLeave}>
      {Array.from({ length: GRID }, (_, r) => (
        <div key={r} className="flex">
          {Array.from({ length: GRID }, (_, c) => {
            const cell = grid[r][c];
            const shot = shots?.[r]?.[c];
            const isHover = hoverCell?.[0] === r && hoverCell?.[1] === c;
            let bg = 'bg-[#0f1929]';
            if (showShips && cell === 'ship') bg = 'bg-white/20';
            if (shot === 'hit') bg = 'bg-red-500';
            if (shot === 'miss') bg = 'bg-blue-900';
            if (interactive && !shot && isHover) bg = 'bg-white/10';
            return (
              <div
                key={c}
                className={`w-7 h-7 border border-white/5 flex items-center justify-center text-xs cursor-pointer transition-colors ${bg}`}
                onClick={() => interactive && !shot && onShoot?.(r, c)}
                onMouseEnter={() => onHover?.(r, c)}
              >
                {shot === 'hit' && <span className="text-red-200 font-bold">✕</span>}
                {shot === 'miss' && <span className="text-blue-300">·</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const Battleship: React.FC<GameProps> = ({ session, myId, onUpdate }) => {
  const [myGrid, setMyGrid] = useState<Grid>(emptyGrid);
  const [direction, setDirection] = useState<Direction>('H');
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const [shootHover, setShootHover] = useState<[number, number] | null>(null);

  const board: BattleshipBoard = session.board;
  const isP1 = session.player1Id === myId;
  const myKey = isP1 ? 'p1' : 'p2';
  const oppKey = isP1 ? 'p2' : 'p1';
  const myShots = isP1 ? board.p1Shots : board.p2Shots;
  const oppGrid = board[oppKey].grid;
  const amReady = board[myKey].ready;
  const oppReady = board[oppKey].ready;
  const placedCount = countShipCells(myGrid);
  const totalRequired = SHIP_SIZES.reduce((a, b) => a + b, 0);
  const shipsDone = SHIP_SIZES.filter((_, i) =>
    placedCount >= SHIP_SIZES.slice(0, i + 1).reduce((a, b) => a + b, 0)
  ).length;
  const currentShipSize = shipsDone < SHIP_SIZES.length ? SHIP_SIZES[shipsDone] : 0;

  const isMyTurn = session.currentTurn === myId;
  const isFinished = session.status === 'finished';
  const bothReady = amReady && oppReady;

  const handlePlaceClick = (r: number, c: number) => {
    if (amReady || shipsDone >= SHIP_SIZES.length) return;
    if (!canPlace(myGrid, r, c, currentShipSize, direction)) return;
    setMyGrid(prev => placeShip(prev, r, c, currentShipSize, direction));
  };

  const getHoverCells = (): [number, number][] => {
    if (!hoverCell || shipsDone >= SHIP_SIZES.length || amReady) return [];
    const [r, c] = hoverCell;
    const cells: [number, number][] = [];
    for (let i = 0; i < currentShipSize; i++) {
      const nr = direction === 'V' ? r + i : r;
      const nc = direction === 'H' ? c + i : c;
      if (nr < GRID && nc < GRID) cells.push([nr, nc]);
    }
    return cells;
  };

  const handleReady = () => {
    if (placedCount < totalRequired) return;
    const newBoard: BattleshipBoard = {
      ...board,
      [myKey]: { grid: myGrid, ready: true },
    };
    onUpdate(newBoard, session.currentTurn);
  };

  const handleShoot = (r: number, c: number) => {
    if (!isMyTurn || !bothReady || isFinished) return;
    if (myShots[r][c]) return;
    const newShots = myShots.map(row => [...row]);
    const hit = oppGrid[r][c] === 'ship';
    newShots[r][c] = hit ? 'hit' : 'miss';
    const shotsKey = isP1 ? 'p1Shots' : 'p2Shots';
    const sunk = allSunk(oppGrid, newShots);
    const nextTurn = isMyTurn ? (isP1 ? session.player2Id : session.player1Id) : myId;
    const newBoard: BattleshipBoard = { ...board, [shotsKey]: newShots };
    onUpdate(newBoard, sunk ? myId : nextTurn, sunk ? myId : undefined);
  };

  const iWon = session.winnerId === myId;
  const isDraw = session.winnerId === 'draw';

  if (isFinished) {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className={`font-bold text-xl ${iWon ? 'text-green-400' : 'text-red-400'}`}>
          {iWon ? 'Victoire ! Vous avez coulé toute la flotte !' : 'Défaite ! Votre flotte a été coulée.'}
        </p>
        <div className="flex gap-8 flex-wrap justify-center">
          <div>
            <p className="text-xs text-bony-text/50 mb-2 text-center">Votre grille</p>
            <GridDisplay grid={board[myKey].grid} shots={isP1 ? board.p2Shots : board.p1Shots} showShips />
          </div>
          <div>
            <p className="text-xs text-bony-text/50 mb-2 text-center">Grille adverse</p>
            <GridDisplay grid={oppGrid} shots={myShots} showShips />
          </div>
        </div>
      </div>
    );
  }

  // Placement phase
  if (!amReady) {
    const hoverCells = getHoverCells();
    const valid = hoverCells.length === currentShipSize && canPlace(myGrid, hoverCell?.[0] ?? 0, hoverCell?.[1] ?? 0, currentShipSize, direction);
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="text-center">
          <p className="font-semibold text-bony-orange mb-1">Phase de placement</p>
          {shipsDone < SHIP_SIZES.length ? (
            <p className="text-sm text-bony-text/70">
              Placez <strong>{SHIP_NAMES[shipsDone]}</strong> ({currentShipSize} cases) —{' '}
              <button
                onClick={() => setDirection(d => d === 'H' ? 'V' : 'H')}
                className="underline text-bony-orange hover:text-bony-orange/70"
              >
                {direction === 'H' ? 'Horizontal' : 'Vertical'}
              </button>
            </p>
          ) : (
            <p className="text-sm text-green-400">Tous les navires placés !</p>
          )}
        </div>

        <div
          className="inline-block border border-white/10 rounded-lg overflow-hidden"
          onMouseLeave={() => setHoverCell(null)}
        >
          {Array.from({ length: GRID }, (_, r) => (
            <div key={r} className="flex">
              {Array.from({ length: GRID }, (_, c) => {
                const cell = myGrid[r][c];
                const isHovered = hoverCells.some(([hr, hc]) => hr === r && hc === c);
                let bg = 'bg-[#0f1929]';
                if (cell === 'ship') bg = 'bg-white/25';
                else if (isHovered) bg = valid ? 'bg-bony-orange/40' : 'bg-red-500/40';
                return (
                  <div
                    key={c}
                    className={`w-7 h-7 border border-white/5 cursor-pointer transition-colors ${bg}`}
                    onClick={() => handlePlaceClick(r, c)}
                    onMouseEnter={() => setHoverCell([r, c])}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {shipsDone >= SHIP_SIZES.length && (
          <button
            onClick={handleReady}
            className="px-6 py-2 bg-bony-orange text-black font-bold rounded-lg hover:bg-bony-orange/80 transition-colors"
          >
            Prêt !
          </button>
        )}

        {oppReady && <p className="text-xs text-green-400">L'adversaire est prêt.</p>}
      </div>
    );
  }

  // Waiting for opponent
  if (!bothReady) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-bony-text/70">Vous êtes prêt. En attente de l'adversaire…</p>
        <GridDisplay grid={board[myKey].grid} showShips />
      </div>
    );
  }

  // Combat phase
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-center">
        {isMyTurn
          ? <p className="text-bony-orange font-semibold">Votre tour — cliquez sur la grille adverse !</p>
          : <p className="text-bony-text/70 text-sm">En attente du tir adverse…</p>
        }
      </div>

      <div className="flex gap-6 flex-wrap justify-center">
        <div>
          <p className="text-xs text-bony-text/50 mb-2 text-center">Votre flotte</p>
          <GridDisplay
            grid={board[myKey].grid}
            shots={isP1 ? board.p2Shots : board.p1Shots}
            showShips
          />
        </div>
        <div>
          <p className="text-xs text-bony-text/50 mb-2 text-center">
            Grille adverse {isMyTurn && <span className="text-bony-orange">(cliquez !)</span>}
          </p>
          <GridDisplay
            grid={Array.from({ length: GRID }, () => Array(GRID).fill(null))}
            shots={myShots}
            interactive={isMyTurn && !isFinished}
            onShoot={handleShoot}
            hoverCell={shootHover}
            onHover={(r, c) => setShootHover([r, c])}
            onLeave={() => setShootHover(null)}
          />
        </div>
      </div>
    </div>
  );
};

export default Battleship;
