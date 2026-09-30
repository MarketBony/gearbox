import type { GameSummary, GameType } from '../../../components/games/gameTypes';

// =====================================================================
// Calculs CLIENT de la rubrique Jeux, repris À L'IDENTIQUE de la page et du composant actuels :
//  - `computeStats`, `computeRivalries`, `computeStreak` : pages/Games.tsx (fonctions privées) ;
//  - `cellsFor`, `canPlace`, `randomFleet`, `FLEET` : components/games/Battleship.tsx (privées).
// BESOIN: aucune n'est exportée, d'où cette copie (BESOINS.md, point 2). À remplacer par des
// imports dès qu'elles le seront. Aucune RÈGLE DE JEU ici : coups, victoire, tirs et validation
// de la flotte sont tranchés par le serveur (`utils/gameView.ts`, handlers socket `game:*`).
// =====================================================================

export interface PlayerStats { userId: string; played: number; wins: number; losses: number; draws: number; ratio: number }
export interface Rivalry { aId: string; bId: string; aWins: number; bWins: number; draws: number; total: number }

export const computeStats = (history: GameSummary[], game?: GameType): PlayerStats[] => {
  const rows = game ? history.filter((h) => h.game === game) : history;
  const map = new Map<string, PlayerStats>();
  const ensure = (id: string) => { if (!map.has(id)) map.set(id, { userId: id, played: 0, wins: 0, losses: 0, draws: 0, ratio: 0 }); return map.get(id)!; };
  for (const s of rows) {
    const p1 = ensure(s.player1Id), p2 = ensure(s.player2Id);
    p1.played++; p2.played++;
    if (s.winnerId === 'draw') { p1.draws++; p2.draws++; }
    else if (s.winnerId === s.player1Id) { p1.wins++; p2.losses++; }
    else if (s.winnerId === s.player2Id) { p2.wins++; p1.losses++; }
  }
  return [...map.values()].map((p) => ({ ...p, ratio: p.played > 0 ? Math.round((p.wins / p.played) * 100) : 0 })).sort((a, b) => b.wins - a.wins || b.ratio - a.ratio);
};

export const computeRivalries = (history: GameSummary[], game?: GameType): Rivalry[] => {
  const rows = game ? history.filter((h) => h.game === game) : history;
  const map = new Map<string, Rivalry>();
  for (const s of rows) {
    const [aId, bId] = [s.player1Id, s.player2Id].sort();
    const k = `${aId}||${bId}`;
    if (!map.has(k)) map.set(k, { aId, bId, aWins: 0, bWins: 0, draws: 0, total: 0 });
    const r = map.get(k)!;
    r.total++;
    if (s.winnerId === 'draw') r.draws++; else if (s.winnerId === aId) r.aWins++; else if (s.winnerId === bId) r.bWins++;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
};

export const computeStreak = (history: GameSummary[]): { userId: string; streak: number } | null => {
  const finis = [...history].filter((s) => s.winnerId && s.winnerId !== 'draw').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const cur = new Map<string, number>(), max = new Map<string, number>();
  for (const s of finis) {
    const gagnant = s.winnerId!, perdant = gagnant === s.player1Id ? s.player2Id : s.player1Id;
    const n = (cur.get(gagnant) ?? 0) + 1;
    cur.set(gagnant, n); cur.set(perdant, 0);
    if (n > (max.get(gagnant) ?? 0)) max.set(gagnant, n);
  }
  let best: { userId: string; streak: number } | null = null;
  max.forEach((streak, userId) => { if (!best || streak > best.streak) best = { userId, streak }; });
  return best && (best as { streak: number }).streak > 1 ? best : null;
};

// ---------------------------------------------------------------- bataille navale : placement
export const GRID = 10;
export const FLEET = [
  { name: 'Porte-avions', size: 5 }, { name: 'Croiseur', size: 4 }, { name: 'Destroyer', size: 3 },
  { name: 'Sous-marin', size: 3 }, { name: 'Torpilleur', size: 2 },
];
export type Dir = 'H' | 'V';
export interface Draft { name: string; size: number; cells: [number, number][] }
export const key = (r: number, c: number) => `${r},${c}`;
const inGrid = (r: number, c: number) => r >= 0 && r < GRID && c >= 0 && c < GRID;
export const cellsFor = (r: number, c: number, size: number, dir: Dir): [number, number][] =>
  Array.from({ length: size }, (_, i) => (dir === 'H' ? [r, c + i] : [r + i, c]) as [number, number]);
/** Un navire ne peut pas en toucher un autre, même en diagonale (règle du jeu de référence). */
export const canPlace = (cells: [number, number][], occupied: Set<string>): boolean =>
  cells.every(([r, c]) => {
    if (!inGrid(r, c)) return false;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (occupied.has(key(r + dr, c + dc))) return false;
    return true;
  });
export const occupiedFrom = (drafts: Draft[]): Set<string> => new Set(drafts.flatMap((d) => d.cells.map(([r, c]) => key(r, c))));
/** Placement aléatoire complet ; boucle bornée (un tirage peut échouer : on repart de zéro). */
export const randomFleet = (): Draft[] => {
  for (let essai = 0; essai < 200; essai++) {
    const drafts: Draft[] = [], occupied = new Set<string>(); let ok = true;
    for (const f of FLEET) {
      let pose = false;
      for (let k = 0; k < 300 && !pose; k++) {
        const dir: Dir = Math.random() < 0.5 ? 'H' : 'V';
        const cells = cellsFor(Math.floor(Math.random() * GRID), Math.floor(Math.random() * GRID), f.size, dir);
        if (!canPlace(cells, occupied)) continue;
        cells.forEach(([rr, cc]) => occupied.add(key(rr, cc)));
        drafts.push({ name: f.name, size: f.size, cells }); pose = true;
      }
      if (!pose) { ok = false; break; }
    }
    if (ok) return drafts;
  }
  return [];
};
