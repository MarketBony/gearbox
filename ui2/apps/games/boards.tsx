import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GameSession, MorpionBoard, Connect4Board, BattleshipBoard, ShipView, MoveFeedback } from '../../../components/games/gameTypes';
import { gx, Icon } from '../ui/kit';
import { FLEET, GRID, key, cellsFor, canPlace, occupiedFrom, randomFleet, type Dir, type Draft } from './logic';

// =====================================================================
// Plateaux de la rubrique Jeux — balisage et classes de la maquette (`gme-*`), données et coups
// RÉELS : le plateau est la vue REDACTÉE renvoyée par le serveur, un coup ne calcule rien (il
// propose, le serveur tranche et renvoie l'effet). Mêmes charges que components/games/* :
// Morpion `{ index }`, Puissance 4 `{ col }`, Bataille navale `{ row, col }` + `game:fleet:place`.
// Couleurs : MOI = croix / pion orange, l'adversaire = cercle / pion violet (maquette).
// =====================================================================

export const ME_C = 'var(--bony-orange)', OP_C = 'var(--bony-violet)';
type Move = (move: any) => Promise<MoveFeedback & { error?: string }>;
type Place = (ships: { name: string; cells: [number, number][] }[]) => Promise<{ error?: string }>;
interface BoardProps { s: GameSession; myId: string; onMove: Move; onPlaceFleet: Place; end: React.ReactNode }

const Turn: React.FC<{ s: GameSession; myId: string; mine?: React.ReactNode }> = ({ s, myId, mine = 'À vous de jouer' }) => {
  const over = s.status === 'finished', me = !over && s.currentTurn === myId;
  return <div className={`gme-turn ${me ? 'on' : ''}`}>{over ? 'Partie terminée' : me ? mine : <><span className="gme-dots"><i /><i /><i /></span>Au tour de votre adversaire…</>}</div>;
};

const X_SVG = () => <svg className="x" viewBox="0 0 40 40"><path className="dr" pathLength={1} d="M11 11 29 29" /><path className="dr" pathLength={1} d="M29 11 11 29" /></svg>;
const O_SVG = () => <svg className="o" viewBox="0 0 40 40"><circle className="dr" pathLength={1} cx="20" cy="20" r="10.5" transform="rotate(-90 20 20)" /></svg>;

// ---------------------------------------------------------------- Morpion
export const Morpion: React.FC<BoardProps & { playRef: React.MutableRefObject<((n: number) => void) | null> }> = ({ s, myId, onMove, end, playRef }) => {
  const b = s.board as MorpionBoard, cells = b?.cells ?? Array(9).fill(null), line = b?.winningLine ?? [];
  const can = s.status !== 'finished' && s.currentTurn === myId;
  const [msg, setMsg] = useState('');
  // Case jouée en dernier (animation du tracé) : la vue serveur ne la donne pas, on la déduit.
  const prev = useRef(cells);
  const last = useMemo(() => cells.findIndex((v, k) => v && !prev.current[k]), [cells]);
  useEffect(() => { prev.current = cells; }, [cells]);
  const play = async (i: number) => { if (!can || cells[i]) return; const r = await onMove({ index: i }); setMsg(r.error ?? ''); };
  playRef.current = (n) => { if (n >= 1 && n <= 9) play([6, 7, 8, 3, 4, 5, 0, 1, 2][n - 1]); };   // pavé numérique
  return (
    <div className="gme-game">{end}<Turn s={s} myId={myId} /><div className="gme-msg">{msg}</div>
      <div className="gme-ttt">{cells.map((v, i) => (
        <button key={i} className={`gme-cell ${!v && can ? 'can' : ''} ${i === last ? 'new' : ''} ${line.includes(i) ? 'win' : ''}`} aria-label={`Case ${i + 1}`} onClick={() => play(i)}>
          {v ? (v === s.myRole ? <X_SVG /> : <O_SVG />) : null}
        </button>
      ))}</div></div>
  );
};

// ---------------------------------------------------------------- Puissance 4
const R = 6, C = 7;
export const Connect4: React.FC<BoardProps & { playRef: React.MutableRefObject<((n: number) => void) | null> }> = ({ s, myId, onMove, end, playRef }) => {
  const b = s.board as Connect4Board;
  const g = b?.cells ?? Array.from({ length: R }, () => Array(C).fill(null));
  const win = new Set((b?.winningLine ?? []).map(([r, c]) => `${r}:${c}`)), lm = b?.lastMove;
  const over = s.status === 'finished', mine = !over && s.currentTurn === myId;
  const can = (c: number) => mine && !g[0][c];
  const [msg, setMsg] = useState(''), [hov, setHov] = useState(-1);
  const boardRef = useRef<HTMLDivElement>(null), seen = useRef(lm ? `${lm[0]}:${lm[1]}` : '');
  // Chute du dernier pion (ressort `bouncy` de la maquette), seulement quand il vient d'arriver.
  useLayoutEffect(() => {
    const k = lm ? `${lm[0]}:${lm[1]}` : ''; if (!k || k === seen.current) return; seen.current = k;
    const d = boardRef.current?.querySelector<HTMLElement>('[data-new]'); const hole = d?.parentElement; if (!d || !hole) return;
    gx().animate(d, [{ transform: `translateY(-${hole.offsetTop + hole.offsetHeight + 12}px)` }, { transform: 'none' }], { spring: 'bouncy' });
  }, [lm?.[0], lm?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const play = async (c: number) => { if (!can(c)) return; const r = await onMove({ col: c }); setMsg(r.error ?? ''); };
  playRef.current = (n) => { if (n >= 1 && n <= 7) play(n - 1); };
  return (
    <div className="gme-game">{end}<Turn s={s} myId={myId} /><div className="gme-msg">{msg}</div>
      <div className="gme-p4wrap"><div className="gme-p4cols">{Array.from({ length: C }, (_, c) => <button key={c} disabled={!can(c)} aria-label={`Jouer colonne ${c + 1}`} onClick={() => play(c)}><Icon name="chevdown" size="sm" /></button>)}</div>
        <div ref={boardRef} className={`gme-p4 ${over ? 'over' : ''}`} onPointerLeave={() => setHov(-1)}>{Array.from({ length: C }, (_, c) => (
          <div key={c} className={`gme-col ${can(c) ? 'can' : ''} ${can(c) && hov === c ? 'hov' : ''}`} onPointerOver={() => setHov(c)} onClick={() => play(c)}>
            {Array.from({ length: R }, (_, r) => { const v = g[r][c], isLast = !!lm && lm[0] === r && lm[1] === c; return (
              <div key={r} className="gme-hole">{v ? <i className={`gme-disc ${win.has(`${r}:${c}`) ? 'win' : ''} ${isLast ? 'last' : ''}`} style={{ '--c': v === s.myRole ? ME_C : OP_C } as React.CSSProperties} {...(isLast ? { 'data-new': '' } : {})} /> : null}</div>
            ); })}
          </div>
        ))}</div></div></div>
  );
};

// ---------------------------------------------------------------- Bataille navale
const ROWS = 'ABCDEFGHIJ';
interface Sq { cls: string; mark?: string }
const Sea: React.FC<{ sq: (r: number, c: number) => Sq; can: boolean; side: string; size?: string; onSq?: (r: number, c: number) => void; onHover?: (r: number, c: number) => void; onLeave?: () => void }> = ({ sq, can, side, size = '', onSq, onHover, onLeave }) => {
  const cells: React.ReactNode[] = [<span key="h" />, ...Array.from({ length: GRID }, (_, c) => <span key={`c${c}`} className="hd">{c + 1}</span>)];
  for (let r = 0; r < GRID; r++) {
    cells.push(<span key={`r${r}`} className="hd">{ROWS[r]}</span>);
    for (let c = 0; c < GRID; c++) { const q = sq(r, c); cells.push(<i key={`${r},${c}`} className={`gme-sq ${q.cls}`} data-tip={`${ROWS[r]}${c + 1}`} onClick={onSq ? () => onSq(r, c) : undefined} onPointerOver={onHover ? () => onHover(r, c) : undefined}>{q.mark || ''}</i>); }
  }
  return <div className={`gme-sea ${size} ${can ? 'can' : ''}`} data-sea={side} onPointerLeave={onLeave}>{cells}</div>;
};

export const Battleship: React.FC<BoardProps> = ({ s, myId, onMove, onPlaceFleet, end }) => {
  const b = s.board as BattleshipBoard;
  const over = s.status === 'finished', mine = !over && s.currentTurn === myId;
  const [drafts, setDrafts] = useState<Draft[]>([]), [dir, setDir] = useState<Dir>('H'), [hover, setHover] = useState<[number, number] | null>(null);
  const [sending, setSending] = useState(false), [msg, setMsg] = useState('');
  const next = FLEET[drafts.length], occupied = useMemo(() => occupiedFrom(drafts), [drafts]);

  // ----- placement
  if (s.status === 'placing') {
    if (b?.me?.ready) return <div className="gme-game"><div className="gme-card gme-wait"><Icon name="flag" size="lg" /><h3>Flotte en position</h3><span className="muted" style={{ fontSize: 13 }}>En attente du placement de votre adversaire… la partie démarrera toute seule, sans rien recharger.</span></div></div>;
    const prevCells = hover && next ? cellsFor(hover[0], hover[1], next.size, dir) : null;
    const prevOk = !!prevCells && canPlace(prevCells, occupied), prevSet = new Set((prevCells || []).map(([r, c]) => key(r, c)));
    const place = (r: number, c: number) => {
      if (!next) return; const cells = cellsFor(r, c, next.size, dir);
      if (!canPlace(cells, occupied)) { setMsg('Placement impossible ici — les navires ne peuvent pas se toucher.'); return; }
      setMsg(''); setDrafts([...drafts, { name: next.name, size: next.size, cells }]); setHover(null);
    };
    const validate = async () => {
      if (drafts.length !== FLEET.length || sending) return;
      setSending(true); setMsg('');
      const r = await onPlaceFleet(drafts.map((d) => ({ name: d.name, cells: d.cells })));   // le serveur revalide tout
      setSending(false); if (r.error) setMsg(r.error);
    };
    return (
      <div className="gme-game"><div className="gme-navbar"><span className="t">{next ? <>Placez le <b>{next.name}</b> ({next.size} cases)</> : <b>Flotte complète — à vous de valider.</b>}</span>
          <button className="btn sm" onClick={() => setDir(dir === 'H' ? 'V' : 'H')}><Icon name="refresh" size="sm" />{dir === 'H' ? 'Horizontal' : 'Vertical'}</button>
          <button className="btn sm" onClick={() => { setDrafts(randomFleet()); setMsg(''); }}><Icon name="bolt" size="sm" />Aléatoire</button>
          <button className="btn sm" disabled={!drafts.length} onClick={() => { setDrafts([]); setMsg(''); }}><Icon name="trash" size="sm" />Effacer</button></div>
        <div style={{ width: 'min(100%,520px)', margin: '0 auto' }}>
          <Sea side="place" can={!!next} onSq={place} onHover={(r, c) => setHover([r, c])} onLeave={() => setHover(null)}
            sq={(r, c) => { const k = key(r, c), cls = [occupied.has(k) ? 'ship' : 'free']; if (prevSet.has(k)) cls.push(prevOk ? 'ok' : 'ko'); return { cls: cls.join(' ') }; }} /></div>
        <div className="gme-chips" style={{ justifyContent: 'center' }}>{FLEET.map((f, i) => <span key={f.name} className={`gme-chip ${i < drafts.length ? 'on' : ''}`}>{f.name} · {f.size}</span>)}</div>
        <div className="gme-msg">{msg}</div>
        <button className="btn primary lg" style={{ justifySelf: 'center' }} disabled={drafts.length !== FLEET.length || sending} onClick={validate}><Icon name="check" size="sm" />{sending ? 'Envoi…' : 'Valider ma flotte'}</button></div>
    );
  }

  // ----- tir
  const foeSunk = new Set((b?.opponent?.sunkShips ?? []).flatMap((x: ShipView) => x.cells.map(([r, c]) => key(r, c))));
  const foeShots = b?.opponent?.shots ?? {}, myShots = b?.me?.shots ?? {};
  const myShip = new Map<string, boolean>();   // case → navire coulé ?
  (b?.me?.ships ?? []).forEach((x: ShipView) => { const sunk = (x.hits ?? 0) >= x.size; x.cells.forEach(([r, c]) => myShip.set(key(r, c), sunk)); });
  const left = b?.opponent?.remaining ?? [];
  const shoot = async (r: number, c: number) => {
    const k = key(r, c); if (!mine || foeShots[k] || foeSunk.has(k)) return;
    const res = await onMove({ row: r, col: c });
    if (res.error) { setMsg(res.error); return; }
    setMsg(res.effect === 'sunk' ? `Coulé — ${res.sunkShipName} !` : res.effect === 'hit' ? 'Touché !' : 'Manqué.');
  };
  return (
    <div className="gme-game">{end}<Turn s={s} myId={myId} mine={<><Icon name="target" size="sm" />À vous de tirer</>} /><div className="gme-msg">{msg}</div>
      <div className="gme-grids">
        <div><div className="gme-gt"><Icon name="target" size="sm" />Grille adverse</div>
          <Sea side="foe" can={mine} onSq={shoot} sq={(r, c) => { const k = key(r, c); if (foeSunk.has(k)) return { cls: 'sunk', mark: '✕' }; const v = foeShots[k]; return v ? { cls: v, mark: v === 'miss' ? '•' : '✕' } : { cls: 'free' }; }} /></div>
        <div><div className="gme-gt"><Icon name="flag" size="sm" />Ma flotte</div>
          <Sea side="me" size="sm" can={false} sq={(r, c) => { const k = key(r, c), v = myShots[k], ship = myShip.get(k), cls: string[] = [];
            if (ship !== undefined) cls.push(ship ? 'sunk' : 'ship'); if (v && !ship) cls.push(v);
            return { cls: cls.join(' '), mark: v ? (v === 'miss' ? '•' : '✕') : '' }; }} /></div>
      </div>
      <div className="gme-chips"><span className="faint" style={{ fontSize: 12.5, marginRight: 2 }}>Reste à couler :</span>{left.length ? left.map((x, i) => <span key={`${x.name}-${i}`} className="gme-chip">{x.name} · {x.size}</span>) : <b style={{ color: 'var(--bony-orange)', fontSize: 12.5 }}>plus rien !</b>}</div></div>
  );
};
