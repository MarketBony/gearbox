// ============================================================================
// RÈGLES DES JEUX — CÔTÉ SERVEUR, ET C'EST LE POINT ESSENTIEL
//
// Avant le 05/08/2026 les règles n'existaient QUE dans les composants React, et
// les parties vivaient dans le localStorage : chacun jouait seul contre soi-même,
// donc tricher n'avait aucun sens. Dès que la partie est partagée, tout ce qui
// n'est pas validé ici est falsifiable par le client — un `winnerId` forgé, un
// coup joué à la place de l'autre, deux tirs de suite.
//
// Ce module est donc la SOURCE DE VÉRITÉ : il valide le coup, applique la
// transition et calcule lui-même le vainqueur. Le frontend ne fait que proposer
// une case ; il ne décide de rien.
// ============================================================================

export type GameType = 'morpion' | 'connect4' | 'battleship';
export const GAME_TYPES: GameType[] = ['morpion', 'connect4', 'battleship'];
export const isGameType = (v: unknown): v is GameType =>
  typeof v === 'string' && (GAME_TYPES as string[]).includes(v);

// Résultat d'un coup : le nouveau plateau, à qui de jouer, et l'issue éventuelle.
export interface MoveResult {
  board: any;
  nextTurn: string;
  // undefined = la partie continue ; 'draw' = match nul ; sinon userId du vainqueur.
  winnerId?: string;
  status: 'placing' | 'playing' | 'finished';
  // Retour destiné à l'auteur du coup (bataille navale) : 'miss' | 'hit' | 'sunk'.
  effect?: 'miss' | 'hit' | 'sunk';
  sunkShipName?: string;
}

export class IllegalMoveError extends Error {}

const autre = (session: { player1Id: string; player2Id: string }, userId: string) =>
  userId === session.player1Id ? session.player2Id : session.player1Id;

// ---------------------------------------------------------------------------
// MORPION — grille 3x3, valeurs 'p1' | 'p2' | null
// ---------------------------------------------------------------------------

export const emptyMorpion = () => ({ cells: Array(9).fill(null) as (string | null)[] });

const MORPION_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // lignes
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // colonnes
  [0, 4, 8], [2, 4, 6],            // diagonales
];

// Renvoie aussi la ligne gagnante : le frontend la met en valeur, il n'a pas à
// la recalculer (et deux calculs séparés finiraient par divergerm comme l'ont
// montré Budget et Dashboard).
export const morpionWinner = (cells: (string | null)[]): { mark: string; line: number[] } | null => {
  for (const line of MORPION_LINES) {
    const [a, b, c] = line;
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) {
      return { mark: cells[a]!, line };
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// PUISSANCE 4 — 6 lignes x 7 colonnes, gravité : on joue une COLONNE
// ---------------------------------------------------------------------------

export const C4_ROWS = 6;
export const C4_COLS = 7;
export const emptyConnect4 = () => ({
  cells: Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(null)) as (string | null)[][],
});

// Première ligne libre en partant du bas, ou -1 si la colonne est pleine.
const c4DropRow = (cells: (string | null)[][], col: number): number => {
  for (let r = C4_ROWS - 1; r >= 0; r--) if (!cells[r][col]) return r;
  return -1;
};

export const connect4Winner = (
  cells: (string | null)[][]
): { mark: string; line: [number, number][] } | null => {
  const dirs: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const mark = cells[r][c];
      if (!mark) continue;
      for (const [dr, dc] of dirs) {
        const line: [number, number][] = [[r, c]];
        for (let k = 1; k < 4; k++) {
          const rr = r + dr * k, cc = c + dc * k;
          if (rr < 0 || rr >= C4_ROWS || cc < 0 || cc >= C4_COLS) break;
          if (cells[rr][cc] !== mark) break;
          line.push([rr, cc]);
        }
        if (line.length === 4) return { mark, line };
      }
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// BATAILLE NAVALE
//
// ⚠️ CHANGEMENT DE MODÈLE. L'ancienne version stockait une grille de cellules
// ('ship' | 'hit' | 'miss'), sans identité de navire : impossible de dire QUEL
// navire venait d'être coulé, ni de marquer les cases autour. Chaque flotte est
// désormais une LISTE DE NAVIRES qui connaissent leurs cases et leurs touches.
// ---------------------------------------------------------------------------

export const BS_GRID = 10;
export const FLEET: { name: string; size: number }[] = [
  { name: 'Porte-avions', size: 5 },
  { name: 'Croiseur', size: 4 },
  { name: 'Destroyer', size: 3 },
  { name: 'Sous-marin', size: 3 },
  { name: 'Torpilleur', size: 2 },
];

export interface Ship {
  name: string;
  size: number;
  cells: [number, number][];
  hits: number;
}
export interface Fleet {
  ships: Ship[];
  ready: boolean;
  // Tirs REÇUS sur cette flotte : 'hit' | 'miss'. C'est la seule partie de la
  // flotte adverse qu'un joueur a le droit de voir.
  shots: Record<string, 'hit' | 'miss'>;
}
export interface BattleshipBoard {
  p1: Fleet;
  p2: Fleet;
}

export const cellKey = (r: number, c: number) => `${r},${c}`;
export const emptyFleet = (): Fleet => ({ ships: [], ready: false, shots: {} });
export const emptyBattleship = (): BattleshipBoard => ({ p1: emptyFleet(), p2: emptyFleet() });

const inGrid = (r: number, c: number) => r >= 0 && r < BS_GRID && c >= 0 && c < BS_GRID;

// Valide une flotte proposée par un client. On ne fait JAMAIS confiance au
// placement reçu : sans ce contrôle, on pourrait envoyer une flotte de 2 cases,
// ou des navires superposés, et devenir presque impossible à couler.
export const validateFleet = (ships: unknown): Ship[] => {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) {
    throw new IllegalMoveError(`Flotte invalide : ${FLEET.length} navires attendus.`);
  }
  const attendu = [...FLEET].sort((a, b) => b.size - a.size).map(s => s.size);
  const recu = ships.map((s: any) => (Array.isArray(s?.cells) ? s.cells.length : -1)).sort((a, b) => b - a);
  if (JSON.stringify(attendu) !== JSON.stringify(recu)) {
    throw new IllegalMoveError('Flotte invalide : tailles de navires incorrectes.');
  }

  const occupees = new Set<string>();
  // Cases des navires DÉJÀ validés — sert au contrôle de non-contact plus bas.
  // Distinct d'`occupees`, qui contient aussi les cases du navire en cours d'examen.
  const precedents = new Set<string>();
  const propres: Ship[] = [];
  for (const s of ships as any[]) {
    if (typeof s?.name !== 'string' || !FLEET.some(f => f.name === s.name)) {
      throw new IllegalMoveError('Flotte invalide : nom de navire inconnu.');
    }
    const cells: [number, number][] = [];
    for (const cell of s.cells) {
      const r = Number(cell?.[0]), c = Number(cell?.[1]);
      if (!Number.isInteger(r) || !Number.isInteger(c) || !inGrid(r, c)) {
        throw new IllegalMoveError('Flotte invalide : case hors grille.');
      }
      const k = cellKey(r, c);
      if (occupees.has(k)) throw new IllegalMoveError('Flotte invalide : navires superposés.');
      occupees.add(k);
      cells.push([r, c]);
    }
    // Les cases doivent être contiguës sur une seule ligne ou une seule colonne :
    // un navire « en escalier » serait indétectable et injouable.
    const rows = new Set(cells.map(x => x[0])), cols = new Set(cells.map(x => x[1]));
    const aligne = rows.size === 1 || cols.size === 1;
    const axe = rows.size === 1 ? cells.map(x => x[1]) : cells.map(x => x[0]);
    axe.sort((a, b) => a - b);
    const contigu = axe.every((v, i) => i === 0 || v === axe[i - 1] + 1);
    if (!aligne || !contigu) {
      throw new IllegalMoveError('Flotte invalide : navire non aligné ou discontinu.');
    }
    // ⚠️ NON-CONTACT — deux navires ne peuvent pas se toucher, même en diagonale.
    // Ce contrôle manquait côté serveur alors que le client l'applique déjà
    // (`canPlace` dans components/games/Battleship.tsx), et il n'est pas cosmétique :
    // c'est l'invariant dont dépend TOUT le marquage automatique des cases déduites
    // vides. Sans lui, une flotte adjacente forgée hors interface rendait la partie
    // INGAGNABLE — couler le navire A marque des cases du navire B en 'miss', et
    // `applyMove` refuse ensuite de tirer sur une case déjà tirée : B devenait
    // insubmersible et `fleetSunk` jamais vrai.
    for (const [r, c] of cells) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (precedents.has(cellKey(r + dr, c + dc))) {
            throw new IllegalMoveError('Flotte invalide : deux navires se touchent.');
          }
        }
      }
    }
    cells.forEach(([r, c]) => precedents.add(cellKey(r, c)));
    propres.push({ name: s.name, size: cells.length, cells, hits: 0 });
  }
  return propres;
};

// Cases adjacentes (8 voisins) d'un navire coulé : elles ne peuvent contenir
// aucun autre navire, on les marque donc automatiquement en « manqué » — c'est
// le confort du site de référence, et ça évite des tirs qu'on sait perdus.
export const neighboursOf = (ship: Ship): [number, number][] => {
  const out: [number, number][] = [];
  const propre = new Set(ship.cells.map(([r, c]) => cellKey(r, c)));
  for (const [r, c] of ship.cells) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (!inGrid(rr, cc) || propre.has(cellKey(rr, cc))) continue;
        out.push([rr, cc]);
      }
    }
  }
  return out;
};

export const fleetSunk = (fleet: Fleet) => fleet.ships.every(s => s.hits >= s.size);

// ---------------------------------------------------------------------------
// APPLICATION D'UN COUP — point d'entrée unique
// ---------------------------------------------------------------------------

interface SessionLike {
  game: string;
  player1Id: string;
  player2Id: string;
  currentTurn: string;
  board: any;
  status: string;
  winnerId: string | null;
}

export const applyMove = (session: SessionLike, userId: string, move: any): MoveResult => {
  if (session.status === 'finished') throw new IllegalMoveError('Cette partie est terminée.');
  if (userId !== session.player1Id && userId !== session.player2Id) {
    throw new IllegalMoveError("Vous ne participez pas à cette partie.");
  }
  if (session.status !== 'playing') throw new IllegalMoveError("La partie n'a pas commencé.");
  // LE contrôle qui empêche de jouer à la place de l'autre.
  if (session.currentTurn !== userId) throw new IllegalMoveError("Ce n'est pas votre tour.");

  const marque = userId === session.player1Id ? 'p1' : 'p2';
  const suivant = autre(session, userId);

  if (session.game === 'morpion') {
    const idx = Number(move?.index);
    const cells: (string | null)[] = [...(session.board?.cells ?? [])];
    if (!Number.isInteger(idx) || idx < 0 || idx > 8) throw new IllegalMoveError('Case invalide.');
    if (cells[idx]) throw new IllegalMoveError('Case déjà jouée.');
    cells[idx] = marque;
    const gagnant = morpionWinner(cells);
    const plein = cells.every(c => c !== null);
    return {
      board: { cells, winningLine: gagnant?.line },
      nextTurn: gagnant || plein ? userId : suivant,
      winnerId: gagnant ? userId : plein ? 'draw' : undefined,
      status: gagnant || plein ? 'finished' : 'playing',
    };
  }

  if (session.game === 'connect4') {
    const col = Number(move?.col);
    if (!Number.isInteger(col) || col < 0 || col >= C4_COLS) throw new IllegalMoveError('Colonne invalide.');
    const cells: (string | null)[][] = (session.board?.cells ?? []).map((r: any[]) => [...r]);
    const row = c4DropRow(cells, col);
    if (row < 0) throw new IllegalMoveError('Colonne pleine.');
    cells[row][col] = marque;
    const gagnant = connect4Winner(cells);
    const plein = cells[0].every(c => c !== null);
    return {
      board: { cells, winningLine: gagnant?.line, lastMove: [row, col] },
      nextTurn: gagnant || plein ? userId : suivant,
      winnerId: gagnant ? userId : plein ? 'draw' : undefined,
      status: gagnant || plein ? 'finished' : 'playing',
    };
  }

  if (session.game === 'battleship') {
    const r = Number(move?.row), c = Number(move?.col);
    if (!Number.isInteger(r) || !Number.isInteger(c) || !inGrid(r, c)) {
      throw new IllegalMoveError('Case hors grille.');
    }
    const board: BattleshipBoard = JSON.parse(JSON.stringify(session.board));
    // On tire sur la flotte de l'ADVERSAIRE.
    const cible: Fleet = marque === 'p1' ? board.p2 : board.p1;
    const k = cellKey(r, c);
    if (cible.shots[k]) throw new IllegalMoveError('Case déjà tirée.');

    const navire = cible.ships.find(s => s.cells.some(([sr, sc]) => sr === r && sc === c));
    if (!navire) {
      cible.shots[k] = 'miss';
      return { board, nextTurn: suivant, status: 'playing', effect: 'miss' };
    }

    cible.shots[k] = 'hit';
    navire.hits++;
    const coule = navire.hits >= navire.size;
    if (coule) {
      // Marquage automatique du pourtour : ces cases sont forcément vides.
      for (const [nr, nc] of neighboursOf(navire)) {
        const nk = cellKey(nr, nc);
        if (!cible.shots[nk]) cible.shots[nk] = 'miss';
      }
    } else {
      // Touché mais pas coulé : seules les DIAGONALES sont déductibles, et il ne
      // faut SURTOUT pas marquer les 4 cases orthogonales — elles peuvent être la
      // suite du navire qu'on vient de toucher, les griser le rendrait
      // insubmersible. Une diagonale, elle, est forcément vide : un navire est une
      // ligne droite (donc ce n'est pas sa suite) et deux navires ne se touchent
      // jamais (donc ce n'en est pas un autre) — invariant garanti par
      // `validateFleet`.
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
        const nr = r + dr, nc = c + dc;
        if (!inGrid(nr, nc)) continue;
        const nk = cellKey(nr, nc);
        // Ne jamais écraser un tir réel (un 'hit' notamment) : même garde que le
        // marquage du pourtour ci-dessus.
        if (!cible.shots[nk]) cible.shots[nk] = 'miss';
      }
    }
    const fini = fleetSunk(cible);
    return {
      board,
      // Toucher (ou couler) REDONNE la main : on rejoue jusqu'à manquer, règle
      // classique de la bataille navale.
      // ⚠️ Inversé le 06/08/2026 à la demande de Théo. Le lot 30 passait le tour à
      // chaque tir (« règle symétrique », calquée sur un site de référence) — ce
      // n'était pas un bug mais un arbitrage, revu depuis. Ne pas le « rétablir ».
      // Le cas `fini` donne la même valeur : le gagnant reste `currentTurn`, comme
      // en morpion et puissance 4, et `applyMove` refuse tout coup ensuite.
      nextTurn: userId,
      winnerId: fini ? userId : undefined,
      status: fini ? 'finished' : 'playing',
      effect: coule ? 'sunk' : 'hit',
      sunkShipName: coule ? navire.name : undefined,
    };
  }

  throw new IllegalMoveError('Jeu inconnu.');
};

// Plateau initial selon le jeu. La bataille navale commence en 'placing'.
export const initBoard = (game: GameType) =>
  game === 'morpion' ? emptyMorpion() : game === 'connect4' ? emptyConnect4() : emptyBattleship();
export const initStatus = (game: GameType): 'placing' | 'playing' =>
  game === 'battleship' ? 'placing' : 'playing';
