
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

const COL_LABELS = ['1','2','3','4','5','6','7','8','9','10'];
const ROW_LABELS = ['A','B','C','D','E','F','G','H','I','J'];

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
    <div className="inline-block select-none" onMouseLeave={onLeave}>
      {/* Column labels */}
      <div className="flex ml-6 mb-0.5">
        {COL_LABELS.map(l => (
          <div key={l} className="w-7 h-4 flex items-center justify-center text-[9px] text-slate-400 dark:text-white/25">{l}</div>
        ))}
      </div>
      <div className="flex">
        {/* Row labels */}
        <div className="flex flex-col mr-0.5">
          {ROW_LABELS.map(l => (
            <div key={l} className="w-5 h-7 flex items-center justify-center text-[9px] text-slate-400 dark:text-white/25">{l}</div>
          ))}
        </div>
        {/* Grid */}
        <div className="border border-slate-600 dark:border-blue-900 rounded-md overflow-hidden">
          {Array.from({ length: GRID }, (_, r) => (
            <div key={r} className="flex">
              {Array.from({ length: GRID }, (_, c) => {
                const cell = grid[r][c];
                const shot = shots?.[r]?.[c];
                const isHover = hoverCell?.[0] === r && hoverCell?.[1] === c;
                let bg = 'bg-blue-950';
                if (showShips && cell === 'ship') bg = 'bg-slate-500';
                if (shot === 'hit') bg = 'bg-red-700';
                if (shot === 'miss') bg = 'bg-blue-800';
                if (interactive && !shot && isHover) bg = 'bg-blue-700 cursor-crosshair';
                return (
                  <div
                    key={c}
                    className={`w-7 h-7 border border-blue-900/40 flex items-center justify-center cursor-pointer transition-colors ${bg}`}
                    onClick={() => interactive && !shot && onShoot?.(r, c)}
                    onMouseEnter={() => onHover?.(r, c)}
                  >
                    {shot === 'hit' && <span className="text-base leading-none">🔥</span>}
                    {shot === 'miss' && <span className="text-blue-300 font-bold text-sm leading-none">●</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
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
    const nextTurn = sunk ? myId : hit ? myId : (isP1 ? session.player2Id : session.player1Id);
    const newBoard: BattleshipBoard = { ...board, [shotsKey]: newShots };
    onUpdate(newBoard, nextTurn, sunk ? myId : undefined);
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
            <p className="text-xs text-slate-500 dark:text-bony-text/50 mb-2 text-center">Votre grille</p>
            <GridDisplay grid={board[myKey].grid} shots={isP1 ? board.p2Shots : board.p1Shots} showShips />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-bony-text/50 mb-2 text-center">Grille adverse</p>
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
            <p className="text-sm text-slate-700 dark:text-bony-text/70">
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
          className="inline-block border border-slate-300 dark:border-white/10 rounded-lg overflow-hidden"
          onMouseLeave={() => setHoverCell(null)}
        >
          {Array.from({ length: GRID }, (_, r) => (
            <div key={r} className="flex">
              {Array.from({ length: GRID }, (_, c) => {
                const cell = myGrid[r][c];
                const isHovered = hoverCells.some(([hr, hc]) => hr === r && hc === c);
                let bg = 'bg-slate-100 dark:bg-[#0f1929]';
                if (cell === 'ship') bg = 'bg-slate-400 dark:bg-white/25';
                else if (isHovered) bg = valid ? 'bg-bony-orange/40' : 'bg-red-500/40';
                return (
                  <div
                    key={c}
                    className={`w-7 h-7 border border-slate-200 dark:border-white/5 cursor-pointer transition-colors ${bg}`}
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
        <p className="text-slate-700 dark:text-bony-text/70">Vous êtes prêt. En attente de l'adversaire…</p>
        <GridDisplay grid={board[myKey].grid} showShips />
      </div>
    );
  }

  // Combat phase
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-center">
        {isMyTurn
          ? <p className="text-bony-orange font-semibold animate-pulse">⚡ Votre tour — cliquez sur la flotte ennemie !</p>
          : <p className="text-slate-700 dark:text-bony-text/70 text-sm">En attente du tir adverse…</p>
        }
      </div>

      <div className="flex items-center gap-4 flex-wrap justify-center">
        {/* Ma flotte */}
        <div className="flex flex-col items-center gap-2">
          <div className="px-3 py-1 bg-blue-900/40 border border-blue-500/30 rounded-lg text-xs font-bold text-blue-300 uppercase tracking-wider">
            Votre flotte
          </div>
          <GridDisplay
            grid={board[myKey].grid}
            shots={isP1 ? board.p2Shots : board.p1Shots}
            showShips
          />
        </div>

        {/* Séparateur VS */}
        <div className="flex flex-col items-center gap-1 px-2 self-center">
          <div className="w-px h-8 bg-gradient-to-b from-transparent via-bony-orange/40 to-transparent" />
          <span className={`font-black text-xl ${isMyTurn ? 'text-bony-orange animate-pulse' : 'text-white/20'}`}>VS</span>
          <div className="w-px h-8 bg-gradient-to-b from-transparent via-bony-orange/40 to-transparent" />
        </div>

        {/* Flotte ennemie */}
        <div className="flex flex-col items-center gap-2">
          <div className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
            isMyTurn
              ? 'bg-red-900/40 border border-red-500/30 text-red-300 animate-pulse'
              : 'bg-slate-800/40 border border-slate-600/30 text-slate-400'
          }`}>
            Flotte ennemie {isMyTurn && '⚡'}
          </div>
          <div className={isMyTurn ? 'ring-2 ring-red-500/40 ring-offset-2 ring-offset-[#0d1117] rounded-md' : ''}>
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
    </div>
  );
};

export default Battleship;
