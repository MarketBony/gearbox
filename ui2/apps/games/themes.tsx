import React, { useMemo, useRef } from 'react';
import type { GameSession, GameType } from '../../../components/games/gameTypes';
import { Morpion, Connect4, Battleship } from './boards';
import { LOGO_CGT_SRC, PANCARTES, SLOGANS } from './cgt';

// =====================================================================
// Thèmes des plateaux Morpion / Puissance 4 / Bataille navale (16/10/2026, demande de Théo).
// Choisi au pré-lobby par celui qui lance, le MÊME pour les deux joueurs : le serveur le range
// dans le plateau (`board.theme`, voir lireOptionsJeu / applyMove dans backend/src/utils/gameRules.ts).
//  - « bony » : le rendu en partie de la v1 (bandeau en dégradé, cases en verre, pions plats,
//    plateaux compacts) — Théo trouvait le rendu v2 « immonde » en partie ;
//  - « cgt »  : la grève, avec les éléments du minigolf (logo officiel, slogans, pancartes : ./cgt.ts).
// Le minigolf a ses propres ambiances (minigolf/rendu.ts).
// =====================================================================
export type Theme = 'bony' | 'cgt';
export const THEMES: [Theme, string][] = [['bony', 'Bony'], ['cgt', 'Grève CGT']];
export const themeDe = (s: Pick<GameSession, 'board'> | null | undefined): Theme => ((s?.board as any)?.theme === 'cgt' ? 'cgt' : 'bony');
export const themeLabel = (t: string | undefined) => THEMES.find((x) => x[0] === t)?.[1] ?? 'Bony';

const CSS = `
/* ---------- commun : le plateau tient dans la fenêtre ---------- */
.gme-th{min-height:100%;position:relative}
.gme-th .gme-p4wrap{width:min(100%,440px)}
.gme-th .gme-ttt{width:min(100%,340px)}
.gme-th .gme-grids{max-width:860px;margin:0 auto;width:100%}

/* ---------- Bony : le rendu de la v1 ---------- */
.th-bony .gme-turn{border-radius:16px;padding:10px 16px;font-size:12.5px;background:color-mix(in srgb,var(--text) 6%,transparent);color:var(--text-2)}
.th-bony .gme-turn.on{background:var(--bony-grad);color:#fff;box-shadow:0 0 24px -6px var(--bony-orange)}
.th-bony .gme-ttt{gap:8px}
.th-bony .gme-cell{border-radius:16px;background:color-mix(in srgb,var(--text) 3%,transparent);border:1px solid var(--line-2)}
.th-bony .gme-cell.can:hover{border-color:color-mix(in srgb,var(--bony-orange) 60%,transparent);background:color-mix(in srgb,var(--bony-orange) 5%,transparent)}
.th-bony .gme-cell.win{border-color:var(--bony-orange);background:color-mix(in srgb,var(--bony-orange) 10%,transparent);box-shadow:0 0 24px -6px var(--bony-orange)}
.th-bony .gme-cell svg{stroke-width:4}
.th-bony .gme-cell svg.o{width:48%;height:48%}
.th-bony .gme-p4cols button{color:var(--bony-orange)}
.th-bony .gme-p4{gap:6px;padding:6px;border-radius:16px;background:color-mix(in srgb,var(--bony-blue) 16%,transparent);border:1px solid var(--line-2);box-shadow:none}
.th-bony .gme-col{gap:6px}
.th-bony .gme-hole{background:color-mix(in srgb,#000 30%,transparent);box-shadow:none}
.th-bony .gme-disc{background:var(--c);box-shadow:none}
.th-bony .gme-disc.last{box-shadow:0 0 0 1.5px color-mix(in srgb,#fff 60%,transparent)}
.th-bony .gme-disc.win{box-shadow:0 0 0 2px #fff,0 0 18px var(--c)}
.th-bony .gme-sea{gap:2px}
.th-bony .gme-sea .hd{font-size:10px;color:var(--text-3)}
.th-bony .gme-sq{border-radius:3px;background:color-mix(in srgb,var(--bony-blue) 13%,transparent)}
.th-bony .gme-sq.ship{background:var(--bony-blue)}
.th-bony .gme-sq.hit{background:var(--bony-orange);box-shadow:0 0 14px -3px var(--bony-orange)}
.th-bony .gme-sq.miss{background:color-mix(in srgb,var(--text) 10%,transparent);color:var(--text-3)}
.th-bony .gme-gt{font-size:10.5px;letter-spacing:.16em;color:var(--text-3)}

/* ---------- Grève CGT ---------- */
.th-cgt{--cgt:#d20012;--cgt-f:#9e000d;background-color:#44464b;background-image:radial-gradient(rgba(255,255,255,.06) 1px,transparent 1.6px),radial-gradient(rgba(0,0,0,.18) 1px,transparent 1.6px);background-size:7px 7px,11px 11px;background-position:0 0,3px 5px;color:#f1f1ee}
.th-cgt .gme-game{position:relative;z-index:1}
.th-cgt .gme-turn{background:#fbf8ef;color:#2a2a2c;border-radius:3px;font:22px/1.1 "Patrick Hand","Comic Sans MS",cursive;padding:8px 16px;transform:rotate(-.8deg);box-shadow:0 5px 0 rgba(0,0,0,.28)}
.th-cgt .gme-turn.on{background:var(--cgt);color:#fff;font:16px/1.2 "Bowlby One SC",Impact,sans-serif;letter-spacing:.03em;box-shadow:0 5px 0 var(--cgt-f),0 0 26px -6px var(--cgt)}
.th-cgt .gme-turn .gme-dots i{background:#2a2a2c}
.th-cgt .gme-msg{color:#ffd400}
.th-cgt .gme-gt,.th-cgt .gme-navbar,.th-cgt .gme-sea .hd{color:#f1f1ee}
.th-cgt .gme-chip{background:#fbf8ef;color:#2a2a2c;border:0;font:16px/1 "Patrick Hand",cursive;border-radius:3px}
.th-cgt .gme-chip.on{background:var(--cgt);color:#fff}
.th-cgt .faint{color:#cfd0d3}
/* Morpion : des pancartes en carton */
.th-cgt .gme-ttt{gap:10px}
.th-cgt .gme-cell{background:#efe6cf;border:3px solid #26262a;border-radius:4px;box-shadow:0 5px 0 rgba(0,0,0,.3)}
.th-cgt .gme-cell:nth-child(odd){transform:rotate(-1.2deg)}.th-cgt .gme-cell:nth-child(even){transform:rotate(1deg)}
.th-cgt .gme-cell.can:hover{background:#fff;border-color:var(--cgt)}
.th-cgt .gme-cell.win{background:#ffd400;border-color:var(--cgt);box-shadow:0 5px 0 var(--cgt-f),0 0 26px -4px #ffd400}
.th-cgt .cgt-logo{width:52%;height:auto;display:block;filter:drop-shadow(0 2px 0 rgba(0,0,0,.25))}
.th-cgt .gme-cell.new .cgt-logo,.th-cgt .gme-cell.new .cgt-coin{animation:cgt-tampon .32s cubic-bezier(.2,1.6,.4,1) both}
@keyframes cgt-tampon{from{transform:scale(1.8) rotate(-12deg);opacity:0}to{transform:none;opacity:1}}
.cgt-coin{display:grid;place-items:center;border-radius:50%;aspect-ratio:1;background:radial-gradient(circle at 34% 30%,#fff1b8,#e0ad21 52%,#9b720c);color:#6a4a00;font-family:"Bowlby One SC",Impact,sans-serif;box-shadow:inset 0 0 0 3px rgba(106,74,0,.35),inset 0 -3px 0 rgba(0,0,0,.2)}
.th-cgt .gme-cell .cgt-coin{width:54%;font-size:clamp(16px,6cqw,44px)}
/* Puissance 4 : une barrière Vauban, des autocollants CGT contre les pièces du patronat */
.th-cgt .gme-p4cols button{color:#fff}
.th-cgt .gme-p4cols button:not(:disabled):hover{color:#fff;background:var(--cgt)}
.th-cgt .gme-p4{border-radius:6px;padding:9px;gap:6px;background:repeating-linear-gradient(90deg,#d5d9df 0 5px,#b4bac2 5px 7px);border:5px solid #5c636d;box-shadow:0 8px 0 rgba(0,0,0,.3)}
.th-cgt .gme-hole{background:#2b2d31;box-shadow:inset 0 3px 5px rgba(0,0,0,.6)}
.th-cgt .gme-disc{display:grid;place-items:center;box-shadow:inset 0 -3px 4px rgba(0,0,0,.25)}
.th-cgt .gme-disc.mine{background:var(--cgt)}
.th-cgt .gme-disc.mine img{width:56%;height:auto}
.th-cgt .gme-disc.foe{background:radial-gradient(circle at 34% 30%,#fff1b8,#e0ad21 52%,#9b720c);color:#6a4a00;font:clamp(12px,3.4cqw,26px)/1 "Bowlby One SC",Impact,sans-serif}
.th-cgt .gme-disc.win{box-shadow:0 0 0 3px #ffd400,0 0 18px #ffd400}
.th-cgt .gme-disc.last{box-shadow:0 0 0 2px #fff}
/* Bataille navale : le cortège sur le bitume */
.th-cgt .gme-sq{border-radius:2px;background:#56595f;color:#fff}
.th-cgt .gme-sea.can .gme-sq.free:hover{background:color-mix(in srgb,var(--cgt) 70%,#56595f)}
.th-cgt .gme-sq.ship{background:linear-gradient(var(--cgt) 0 34%,#fff 34% 46%,var(--cgt) 46%)}
.th-cgt .gme-sq.ok{background:color-mix(in srgb,var(--cgt) 55%,#56595f);box-shadow:inset 0 0 0 1px #fff}
.th-cgt .gme-sq.hit{background:radial-gradient(circle,#ffd400 0 22%,#ff6a00 55%,#c2000e);box-shadow:0 0 12px -2px #ff6a00}
.th-cgt .gme-sq.sunk{background:#1c1c1f}
.th-cgt .gme-sq.miss{background:#6c6f76;color:#fff}

/* ---------- décor CGT ---------- */
.cgt-band{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:12px;margin:12px auto 0;width:min(calc(100% - 24px),760px);min-height:46px;padding:6px 16px;background:var(--cgt);color:#fff;font:clamp(12px,1.9cqw,17px)/1.15 "Bowlby One SC",Impact,sans-serif;text-align:center;letter-spacing:.02em;box-shadow:0 6px 0 rgba(0,0,0,.28);border-radius:2px}
.cgt-band::before,.cgt-band::after{content:"";position:absolute;top:50%;width:14px;height:3px;background:#d8d2c2}
.cgt-band::before{left:-14px}.cgt-band::after{right:-14px}
.cgt-band img{height:34px;width:auto;flex:none}
.cgt-band.bas{margin:0 auto 14px;transform:rotate(.6deg)}
.cgt-panc{position:absolute;z-index:0;width:110px;padding:10px 8px;background:#fbf8ef;color:#2a2a2c;font:20px/1.05 "Patrick Hand",cursive;text-align:center;border-radius:2px;box-shadow:0 5px 0 rgba(0,0,0,.28)}
.cgt-panc::after{content:"";position:absolute;left:50%;top:100%;width:6px;height:70px;margin-left:-3px;background:#a8794a;box-shadow:inset -2px 0 0 rgba(0,0,0,.2)}
@container app (max-width:1000px){.cgt-panc{display:none}}
`;
export const ThemeStyle: React.FC = () => <style>{CSS}</style>;

const hash = (t: string) => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return Math.abs(h); };
/** Décor de la grève : deux banderoles à slogan (fixées par la partie, pas tirées à chaque rendu) et des pancartes sur les côtés. */
export const CgtBand: React.FC<{ graine: string; bas?: boolean }> = ({ graine, bas }) => {
  const t = SLOGANS[(hash(graine) + (bas ? 3 : 0)) % SLOGANS.length];
  return <div className={`cgt-band ${bas ? 'bas' : ''}`}><img src={LOGO_CGT_SRC} alt="CGT" />{t}<img src={LOGO_CGT_SRC} alt="" /></div>;
};
export const CgtPancartes: React.FC<{ graine: string }> = ({ graine }) => {
  const h = hash(graine);
  const pos = [{ left: '2%', top: '22%', r: -8 }, { right: '2%', top: '30%', r: 7 }, { left: '3%', top: '58%', r: 5 }, { right: '3%', top: '64%', r: -6 }];
  return <>{pos.map((p, i) => <div key={i} className="cgt-panc" style={{ left: p.left, right: p.right, top: p.top, transform: `rotate(${p.r}deg)` }}>{PANCARTES[(h + i) % PANCARTES.length]}</div>)}</>;
};

/** Enveloppe d'une partie : classe du thème + décor. */
export const ThemeCadre: React.FC<{ s: GameSession; children: React.ReactNode }> = ({ s, children }) => {
  const th = themeDe(s);
  return (
    <div className={`gme-th th-${th}`}>
      {th === 'cgt' ? <><CgtPancartes graine={s.id} /><CgtBand graine={s.id} /></> : null}
      {children}
      {th === 'cgt' ? <CgtBand graine={s.id} bas /> : null}
    </div>
  );
};

// ---------------------------------------------------------------- vignettes du pré-lobby
// Les VRAIS plateaux, avec une partie fictive, en miniature et inertes : ce qu'on voit est ce qu'on aura.
const nul = async () => ({});
const g4 = (): (string | null)[][] => { const g = Array.from({ length: 6 }, () => Array(7).fill(null)); g[5][2] = 'p1'; g[5][3] = 'p2'; g[4][3] = 'p1'; g[5][4] = 'p1'; g[4][2] = 'p2'; g[3][3] = 'p2'; return g; };
const flotte = [{ name: 'Porte-avions', size: 5, hits: 2, cells: [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5]] }, { name: 'Destroyer', size: 3, hits: 0, cells: [[4, 7], [5, 7], [6, 7]] }];
const fictive = (game: GameType, theme: Theme): GameSession => ({
  id: `apercu-${game}`, game, player1Id: 'A', player2Id: 'B', opponentId: 'B', currentTurn: 'A', status: 'playing', myRole: 'p1', createdAt: '', updatedAt: '',
  board: game === 'morpion' ? { theme, cells: ['p1', null, 'p2', null, 'p1', null, 'p2', null, null] }
    : game === 'connect4' ? { theme, cells: g4(), lastMove: [3, 3] }
    : { theme, me: { ready: true, ships: flotte, shots: { '1,2': 'hit', '6,2': 'miss' } }, opponent: { shots: { '2,4': 'hit', '2,5': 'hit', '5,1': 'miss', '7,7': 'miss' }, sunkShips: [], remaining: [{ name: 'Croiseur', size: 4 }] } },
} as any);
export const ThemeApercu: React.FC<{ game: GameType; theme: Theme }> = ({ game, theme }) => {
  const s = useMemo(() => fictive(game, theme), [game, theme]);
  const playRef = useRef<((n: number) => void) | null>(null);
  const props = { s, myId: 'A', onMove: nul as any, onPlaceFleet: nul as any, end: null };
  return (
    <div className={`gme-th th-${theme}`} style={{ height: 150, overflow: 'hidden', borderRadius: 6, pointerEvents: 'none', position: 'relative' }} aria-hidden>
      <div style={{ zoom: game === 'battleship' ? 0.3 : game === 'connect4' ? 0.27 : 0.32, paddingTop: theme === 'cgt' ? 0 : 10 }}>
        {theme === 'cgt' ? <CgtBand graine={game} /> : null}
        {game === 'morpion' ? <Morpion {...props} playRef={playRef} /> : game === 'connect4' ? <Connect4 {...props} playRef={playRef} /> : <Battleship {...props} />}
      </div>
    </div>
  );
};
