import React, { useMemo, useState } from 'react';
import { Anchor, Crosshair, RotateCw, Shuffle, Trash2, Ship as ShipIcon, Waves } from 'lucide-react';
import { GameProps, BattleshipBoard, ShipView } from './gameTypes';

// ============================================================================
// BATAILLE NAVALE — réécrite le 05/08/2026
//
// L'ancienne version stockait une grille de cellules anonymes ('ship' | 'hit' |
// 'miss') : impossible de dire QUEL navire venait d'être coulé, donc impossible
// d'annoncer « coulé » ou de marquer le pourtour. Le modèle est désormais une
// liste de navires identifiés, côté serveur comme ici.
//
// ⚠️ Ce composant ne connaît PAS la flotte adverse : `board.opponent` n'a pas de
// champ `ships` (voir gameTypes.ts). Il n'y a donc rien à cacher côté client —
// l'information n'y est simplement jamais arrivée. Et aucune règle n'est calculée
// ici : le serveur valide le tir et renvoie l'effet.
// ============================================================================

const GRID = 10;
const FLEET = [
  { name: 'Porte-avions', size: 5 },
  { name: 'Croiseur', size: 4 },
  { name: 'Destroyer', size: 3 },
  { name: 'Sous-marin', size: 3 },
  { name: 'Torpilleur', size: 2 },
];
const COLS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

const key = (r: number, c: number) => `${r},${c}`;
const inGrid = (r: number, c: number) => r >= 0 && r < GRID && c >= 0 && c < GRID;

type Dir = 'H' | 'V';
interface Draft { name: string; size: number; cells: [number, number][] }

const cellsFor = (r: number, c: number, size: number, dir: Dir): [number, number][] =>
  Array.from({ length: size }, (_, i) => (dir === 'H' ? [r, c + i] : [r + i, c]) as [number, number]);

// Un navire ne peut pas toucher un autre, même en diagonale : c'est la règle du
// jeu de référence, et c'est aussi ce qui rend le marquage automatique du
// pourtour cohérent (les cases adjacentes à un coulé sont forcément vides).
const canPlace = (cells: [number, number][], occupied: Set<string>): boolean =>
  cells.every(([r, c]) => {
    if (!inGrid(r, c)) return false;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (occupied.has(key(r + dr, c + dc))) return false;
      }
    }
    return true;
  });

const occupiedFrom = (drafts: Draft[]): Set<string> =>
  new Set(drafts.flatMap(d => d.cells.map(([r, c]) => key(r, c))));

// Placement aléatoire complet. Boucle bornée : sur une grille 10x10 avec la
// contrainte de non-contact, un tirage peut échouer — on repart de zéro plutôt
// que de risquer une boucle infinie.
const randomFleet = (): Draft[] => {
  for (let essai = 0; essai < 200; essai++) {
    const drafts: Draft[] = [];
    const occupied = new Set<string>();
    let ok = true;
    for (const f of FLEET) {
      let pose = false;
      for (let k = 0; k < 300 && !pose; k++) {
        const dir: Dir = Math.random() < 0.5 ? 'H' : 'V';
        const r = Math.floor(Math.random() * GRID);
        const c = Math.floor(Math.random() * GRID);
        const cells = cellsFor(r, c, f.size, dir);
        if (!canPlace(cells, occupied)) continue;
        cells.forEach(([rr, cc]) => occupied.add(key(rr, cc)));
        drafts.push({ name: f.name, size: f.size, cells });
        pose = true;
      }
      if (!pose) { ok = false; break; }
    }
    if (ok) return drafts;
  }
  return [];
};

// ---------------------------------------------------------------------------
// Grille — une seule implémentation pour les deux camps
//
// Cellules en CSS grid `aspect-square` dimensionnées par le conteneur : l'ancienne
// version utilisait `w-7` en dur, ce qui débordait sous 375 px.
// ---------------------------------------------------------------------------

interface CellState { ship?: boolean; sunk?: boolean; hit?: boolean; miss?: boolean; preview?: 'ok' | 'ko' }

const Grille: React.FC<{
  etats: Map<string, CellState>;
  onCell?: (r: number, c: number) => void;
  onHover?: (r: number, c: number) => void;
  onLeave?: () => void;
  disabled?: boolean;
  compact?: boolean;
}> = ({ etats, onCell, onHover, onLeave, disabled, compact }) => (
  <div className="w-full" onMouseLeave={onLeave}>
    {/* En-tête de colonnes : `ml-[8.5%]` réserve la gouttière des lettres de ligne,
        en pourcentage pour rester aligné à toutes les largeurs. */}
    <div className="flex ml-[8.5%] mb-0.5">
      {COLS.map(l => (
        <div key={l} className="flex-1 text-center text-[8px] sm:text-[9px] text-bony-muted/60 tabular-nums">{l}</div>
      ))}
    </div>
    <div className="flex">
      <div className="w-[8.5%] flex flex-col">
        {ROWS.map(l => (
          <div key={l} className="flex-1 aspect-square flex items-center justify-center text-[8px] sm:text-[9px] text-bony-muted/60">{l}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-10 gap-[2px]">
        {Array.from({ length: GRID * GRID }, (_, i) => {
          const r = Math.floor(i / GRID), c = i % GRID;
          const s = etats.get(key(r, c)) ?? {};
          const cliquable = !!onCell && !disabled && !s.hit && !s.miss;
          return (
            <button
              key={i}
              type="button"
              disabled={!cliquable}
              onClick={() => cliquable && onCell!(r, c)}
              onMouseEnter={() => onHover?.(r, c)}
              aria-label={`${ROWS[r]}${COLS[c]}`}
              className={[
                'aspect-square rounded-[3px] transition-all duration-150 relative',
                compact ? 'min-h-0' : 'min-h-[24px] sm:min-h-0',
                // Fond « mer » par défaut, en bleu de charte.
                s.hit ? 'bg-bony-orange shadow-glow'
                  : s.miss ? 'bg-slate-400/25 dark:bg-white/10'
                  : s.sunk ? 'bg-bony-violet'
                  : s.ship ? 'bg-bony-blue'
                  : s.preview === 'ok' ? 'bg-bony-blue/50 ring-1 ring-bony-orange'
                  : s.preview === 'ko' ? 'bg-red-500/30 ring-1 ring-red-500'
                  : 'bg-bony-blue/10 dark:bg-white/[0.04]',
                cliquable ? 'hover:bg-bony-orange/40 cursor-crosshair' : '',
                s.hit || s.sunk ? '' : '',
              ].join(' ')}
            >
              {/* Repères de lecture : un point pour l'eau, une croix pour un touché.
                  Sans eux, la grille se lit mal en niveaux de gris ou en cas de
                  daltonisme — la couleur seule ne doit pas porter l'information. */}
              {s.miss && <span className="absolute inset-0 flex items-center justify-center text-[7px] text-bony-muted">•</span>}
              {(s.hit || s.sunk) && <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white">✕</span>}
            </button>
          );
        })}
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------

const Battleship: React.FC<GameProps> = ({ session, myId, onMove, onPlaceFleet }) => {
  const board = session.board as BattleshipBoard;
  const monTour = session.currentTurn === myId;
  const fini = session.status === 'finished';

  // --- Phase de placement ---
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dir, setDir] = useState<Dir>('H');
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [msg, setMsg] = useState<string>('');

  const prochain = FLEET[drafts.length];
  const occupied = useMemo(() => occupiedFrom(drafts), [drafts]);

  const etatsPlacement = useMemo(() => {
    const m = new Map<string, CellState>();
    drafts.forEach(d => d.cells.forEach(([r, c]) => m.set(key(r, c), { ship: true })));
    if (hover && prochain) {
      const cells = cellsFor(hover[0], hover[1], prochain.size, dir);
      const ok = canPlace(cells, occupied);
      cells.forEach(([r, c]) => { if (inGrid(r, c)) m.set(key(r, c), { ...(m.get(key(r, c)) ?? {}), preview: ok ? 'ok' : 'ko' }); });
    }
    return m;
  }, [drafts, hover, dir, prochain, occupied]);

  const poser = (r: number, c: number) => {
    if (!prochain) return;
    const cells = cellsFor(r, c, prochain.size, dir);
    if (!canPlace(cells, occupied)) { setMsg('Placement impossible ici — les navires ne peuvent pas se toucher.'); return; }
    setMsg('');
    setDrafts([...drafts, { name: prochain.name, size: prochain.size, cells }]);
  };

  const valider = async () => {
    if (!onPlaceFleet) return;
    setEnvoi(true);
    setMsg('');
    // Le serveur revalide tout : tailles, alignement, contiguïté, chevauchements.
    const r = await onPlaceFleet(drafts.map(d => ({ name: d.name, cells: d.cells })));
    setEnvoi(false);
    if (r.error) setMsg(r.error);
  };

  // --- Phase de jeu ---
  const etatsMoi = useMemo(() => {
    const m = new Map<string, CellState>();
    (board?.me?.ships ?? []).forEach((s: ShipView) => {
      const coule = (s.hits ?? 0) >= s.size;
      s.cells.forEach(([r, c]) => m.set(key(r, c), coule ? { sunk: true } : { ship: true }));
    });
    Object.entries(board?.me?.shots ?? {}).forEach(([k, v]) => {
      const prec = m.get(k) ?? {};
      m.set(k, v === 'hit' ? { ...prec, hit: true } : { ...prec, miss: true });
    });
    return m;
  }, [board]);

  const etatsAdversaire = useMemo(() => {
    const m = new Map<string, CellState>();
    // Navires coulés : découverts à la loyale, le serveur accepte de les montrer.
    (board?.opponent?.sunkShips ?? []).forEach((s: ShipView) =>
      s.cells.forEach(([r, c]) => m.set(key(r, c), { sunk: true }))
    );
    Object.entries(board?.opponent?.shots ?? {}).forEach(([k, v]) => {
      const prec = m.get(k) ?? {};
      m.set(k, v === 'hit' ? { ...prec, hit: true } : { ...prec, miss: true });
    });
    return m;
  }, [board]);

  const tirer = async (r: number, c: number) => {
    if (!monTour || fini) return;
    const res = await onMove({ row: r, col: c });
    if (res.error) { setMsg(res.error); return; }
    setMsg(
      res.effect === 'sunk' ? `Coulé — ${res.sunkShipName} !`
        : res.effect === 'hit' ? 'Touché !'
        : 'Manqué.'
    );
  };

  // ===== Rendu : placement =====
  if (session.status === 'placing') {
    const maFlottePosee = board?.me?.ready;
    return (
      <div className="space-y-4">
        {maFlottePosee ? (
          <div className="gx-card p-6 text-center space-y-2">
            <Waves size={28} className="mx-auto text-bony-blue" />
            <p className="font-title text-sm text-bony-text">Flotte en position</p>
            <p className="text-xs text-bony-muted">
              En attente du placement de votre adversaire… la partie démarrera tout
              seule, sans rien recharger.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-2 text-xs text-bony-muted">
                <Anchor size={14} className="text-bony-blue shrink-0" />
                {prochain
                  ? <span>Placez le <strong className="text-bony-text">{prochain.name}</strong> ({prochain.size} cases)</span>
                  : <span className="text-bony-text font-bold">Flotte complète — à vous de valider.</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setDir(d => (d === 'H' ? 'V' : 'H'))}
                  className="px-2.5 min-h-[36px] rounded-xl text-[11px] font-bold bg-bony-blue/10 text-bony-blue hover:bg-bony-blue/20 transition flex items-center gap-1.5">
                  <RotateCw size={13} /> {dir === 'H' ? 'Horizontal' : 'Vertical'}
                </button>
                <button onClick={() => { setDrafts(randomFleet()); setMsg(''); }}
                  className="px-2.5 min-h-[36px] rounded-xl text-[11px] font-bold bg-white/5 text-bony-text hover:bg-white/10 border border-bony-border transition flex items-center gap-1.5">
                  <Shuffle size={13} /> Aléatoire
                </button>
                <button onClick={() => { setDrafts([]); setMsg(''); }} disabled={!drafts.length}
                  className="px-2.5 min-h-[36px] rounded-xl text-[11px] font-bold text-red-400 hover:bg-red-500/10 disabled:opacity-30 transition flex items-center gap-1.5">
                  <Trash2 size={13} /> Effacer
                </button>
              </div>
            </div>

            <div className="max-w-md mx-auto">
              <Grille etats={etatsPlacement} onCell={poser} onHover={(r, c) => setHover([r, c])} onLeave={() => setHover(null)} />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {FLEET.map((f, i) => (
                <span key={f.name} className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                  i < drafts.length ? 'bg-bony-blue/15 border-bony-blue/40 text-bony-blue' : 'border-bony-border text-bony-muted'
                }`}>{f.name} · {f.size}</span>
              ))}
            </div>

            <button onClick={valider} disabled={drafts.length !== FLEET.length || envoi}
              className="w-full min-h-[44px] rounded-2xl gx-gradient text-white font-bold text-sm disabled:opacity-40 transition-opacity hover:opacity-90">
              {envoi ? 'Envoi…' : 'Valider ma flotte'}
            </button>
          </>
        )}
        {msg && <p className="text-[11px] text-center text-bony-orange">{msg}</p>}
      </div>
    );
  }

  // ===== Rendu : jeu =====
  const restants = board?.opponent?.remaining ?? [];
  return (
    <div className="space-y-4">
      {/* Bandeau de tour : sans ambiguïté, c'est le reproche fait au jeu d'avant. */}
      <div className={`rounded-2xl px-4 py-2.5 text-center text-xs font-bold transition-colors ${
        fini ? 'bg-white/5 text-bony-muted'
          : monTour ? 'gx-gradient text-white shadow-glow'
          : 'bg-white/5 text-bony-muted'
      }`}>
        {fini ? 'Partie terminée'
          : monTour ? <span className="flex items-center justify-center gap-2"><Crosshair size={14} /> À vous de tirer</span>
          : "Au tour de votre adversaire…"}
      </div>

      {msg && <p className="text-[11px] text-center font-bold text-bony-orange">{msg}</p>}

      {/* Deux grilles côte à côte sur large écran, empilées sur mobile. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-bony-muted flex items-center gap-1.5">
            <Crosshair size={12} className="text-bony-orange" /> Grille adverse
          </h4>
          <Grille etats={etatsAdversaire} onCell={tirer} disabled={!monTour || fini} />
        </div>
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-bony-muted flex items-center gap-1.5">
            <ShipIcon size={12} className="text-bony-blue" /> Ma flotte
          </h4>
          <Grille etats={etatsMoi} compact />
        </div>
      </div>

      {/* Flotte adverse restante — le serveur donne les tailles, jamais les positions. */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="text-[10px] text-bony-muted mr-1">Reste à couler :</span>
        {restants.length === 0
          ? <span className="text-[10px] font-bold text-bony-orange">plus rien !</span>
          : restants.map((s, i) => (
              <span key={`${s.name}-${i}`} className="px-2 py-1 rounded-lg text-[10px] font-bold border border-bony-border text-bony-text">
                {s.name} · {s.size}
              </span>
            ))}
      </div>
    </div>
  );
};

export default Battleship;
