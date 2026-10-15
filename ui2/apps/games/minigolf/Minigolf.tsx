import React, { useEffect, useRef, useState } from 'react';
import type { GameSession, MoveFeedback } from '../../../../components/games/gameTypes';
import { Icon, hud } from '../../ui/kit';
import { TROU_PAR_ID } from '../../../../shared/minigolf';
import { AMBIANCES, demonter, maj, monter, reglerSon } from './rendu';

/**
 * Partie de minigolf (v2) : le parcours occupe la fenêtre, une barre donne le trou, le par et les coups.
 * Le rendu (rendu.ts) est piloté par le plateau du serveur ; un coup part par `onMove({ angle, puissance, horloge })`
 * et c'est le serveur qui le calcule (backend/src/games/minigolfRules.ts).
 */
const ORDRE = ['p1', 'p2'] as const;
const COUL = ['#ffffff', '#ffd23f'];
const DIFF_L: Record<string, string> = { facile: 'Facile', normal: 'Normal', expert: 'Expert' };

export const Minigolf: React.FC<{ s: GameSession; myId: string; onMove: (m: any) => Promise<MoveFeedback & { error?: string }>; end: React.ReactNode; nomDe: (id: string) => string }> = ({ s, myId, onMove, end, nomDe }) => {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const annRef = useRef<HTMLDivElement>(null);
  const [carte, setCarte] = useState(false);
  const [son, setSon] = useState(false);
  const b = s.board;
  const ids = [s.player1Id, s.player2Id], noms = ids.map((id) => nomDe(id).split(' ')[0]);
  const tour = s.status === 'playing' ? (s.currentTurn === s.player1Id ? 'p1' : 'p2') : null;
  const onMoveRef = useRef(onMove); onMoveRef.current = onMove;

  useEffect(() => {
    if (!cvRef.current) return;
    let t = 0;
    monter(cvRef.current, {
      jouer: (m: any) => onMoveRef.current(m),
      erreur: (msg: string) => hud(msg),
      annonce: (titre: string, sous?: string) => {
        const el = annRef.current; if (!el) return;
        el.innerHTML = ''; const h = document.createElement('div'); h.textContent = titre; el.append(h);
        if (sous) { const p = document.createElement('small'); p.textContent = sous; el.append(p); }
        el.classList.remove('vu'); void el.offsetWidth; el.classList.add('vu'); clearTimeout(t); t = window.setTimeout(() => el.classList.remove('vu'), 1800);
      },
    });
    return () => { clearTimeout(t); demonter(); };
  }, [s.id]);
  useEffect(() => { maj(b, { moi: s.myRole, tour, joueurs: noms, fini: s.status === 'finished' }); }, [b, tour, s.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reglerSon(son); }, [son]);

  if (!b?.trous) return <div className="gme-empty">Partie illisible.</div>;
  const h = TROU_PAR_ID[b.trous[b.i]], fini = s.status === 'finished';
  const total = (m: 'p1' | 'p2') => b.coups[m].reduce((x: number, y: number) => x + y, 0) + (fini ? 0 : b.enCours[m]);
  const parTot = b.trous.reduce((x: number, id: string) => x + TROU_PAR_ID[id].par, 0);
  const moi = s.myRole, aMoi = tour === moi && !b.fini[moi];

  return (
    <div className="mg-jeu" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 440 }}>
      <style>{`
        .mg-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--line)}
        .mg-bar b.t{font-family:var(--font-display);font-size:15px;letter-spacing:.04em}
        .mg-chip{display:flex;align-items:center;gap:7px;padding:4px 10px 4px 6px;border-radius:999px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line);font-size:13px}
        .mg-chip.on{box-shadow:inset 0 0 0 2px var(--bony-orange)}
        .mg-chip i{width:12px;height:12px;border-radius:50%;box-shadow:inset -2px -2px 3px rgba(0,0,0,.35)}
        .mg-chip .n{font-weight:700;font-variant-numeric:tabular-nums}
        .mg-scene{position:relative;flex:1;min-height:0;overflow:hidden;border-radius:0 0 12px 12px}
        .mg-scene canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block}
        .mg-ann{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%) scale(.85) rotate(-3deg);font:clamp(26px,5vw,52px)/1 "Bowlby One SC",Impact,sans-serif;color:#fff;text-shadow:0 3px 0 rgba(0,0,0,.4),0 0 26px rgba(0,0,0,.55);opacity:0;pointer-events:none;transition:opacity .25s,transform .45s cubic-bezier(.2,1.6,.4,1);text-align:center;white-space:nowrap}
        .mg-ann small{display:block;font:700 16px/1.3 var(--font);margin-top:8px}
        .mg-ann.vu{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(-3deg)}
        .mg-info{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);background:rgba(8,16,12,.78);color:#e8efe9;padding:6px 14px;border-radius:999px;font-size:13px;pointer-events:none;white-space:nowrap;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis}
        .mg-over{position:absolute;inset:0;display:grid;place-items:center;background:rgba(10,14,12,.55);padding:16px;z-index:2;overflow:auto}
        .mg-card{background:#fbfbf6;color:#34363b;border-radius:8px;box-shadow:0 18px 50px rgba(0,0,0,.45);width:min(760px,100%);overflow:hidden}
        .mg-card header{background:#1f6b45;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px}
        .mg-card header b{font:20px/1 "Bowlby One SC",Impact,sans-serif;flex:1}
        .mg-card table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
        .mg-card th,.mg-card td{border:1px solid #b7d1c1;padding:5px 7px;text-align:center;font-size:13px}
        .mg-card th{background:#e7f2eb;color:#1f6b45;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
        .mg-card td.nom{text-align:left;white-space:nowrap;font-weight:700}
        .mg-card .cercle{display:inline-block;border:2px solid #d9472b;border-radius:50%;width:1.6em;height:1.6em;line-height:1.45em}
        .mg-card .tot{font-weight:700;background:#f3f8f5}
      `}</style>
      <div className="mg-bar">
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}><b className="t">{fini ? 'Partie terminée' : `Trou ${b.i + 1}/${b.trous.length} · Par ${h.par}`}</b>
          <span className="faint" style={{ fontSize: 12.5 }}>{fini ? `${b.trous.length} trous · par ${parTot}` : `${h.nom} · ${DIFF_L[b.cfg.diff]} · ${AMBIANCES[b.cfg.amb] || ''}`}</span></div>
        <span className="grow" />
        {ORDRE.map((m, i) => (
          <span key={m} className={`mg-chip ${tour === m ? 'on' : ''}`} data-tip={`Coups sur ce trou : ${b.enCours[m]} · total ${total(m)}`}>
            <i style={{ background: COUL[i] }} />{noms[i]}{ids[i] === myId ? ' (vous)' : ''}<span className="n">{fini ? total(m) : b.enCours[m]}</span><span className="faint" style={{ fontSize: 12 }}>{fini ? '' : `· ${total(m)}`}</span></span>
        ))}
        <button className="btn sm" onClick={() => setCarte(true)}><Icon name="list" size="sm" />Score</button>
        <button className="btn sm ghost" aria-label="Son" data-tip={son ? 'Couper le son' : 'Activer le son'} onClick={() => setSon(!son)}><Icon name={son ? 'music' : 'belloff'} size="sm" /></button>
      </div>
      <div className="mg-scene">
        <canvas ref={cvRef} />
        <div className="mg-ann" ref={annRef} />
        {!fini ? <div className="mg-info">{aMoi ? 'À vous : tirez en arrière depuis n’importe où, relâchez pour frapper.' : `Au tour de ${tour ? noms[ORDRE.indexOf(tour)] : '…'}`}</div> : null}
        {carte || fini ? (
          <div className="mg-over" onClick={(e) => { if (e.target === e.currentTarget && !fini) setCarte(false); }}>
            <div style={{ display: 'grid', gap: 12, width: 'min(760px,100%)', justifyItems: 'center' }}>
              <div className="mg-card"><header><b>{fini ? 'Carte de score' : `Carte de score · trou ${b.i + 1}`}</b>{!fini ? <button className="btn sm" onClick={() => setCarte(false)}>Fermer</button> : null}</header>
                <div style={{ overflowX: 'auto', padding: 12 }}><table><thead><tr><th>Trou</th>{b.trous.map((_: string, i: number) => <th key={i}>{i + 1}</th>)}<th>Total</th></tr></thead><tbody>
                  <tr><td className="nom">Par</td>{b.trous.map((id: string, i: number) => <td key={i}>{TROU_PAR_ID[id].par}</td>)}<td className="tot">{parTot}</td></tr>
                  {ORDRE.map((m, j) => <tr key={m}><td className="nom">{noms[j]}</td>{b.trous.map((id: string, i: number) => {
                    const v = b.coups[m][i] ?? (i === b.i && !fini ? `${b.enCours[m]}…` : ''), par = TROU_PAR_ID[id].par;
                    return <td key={i}>{typeof v === 'number' && v < par ? <span className="cercle">{v}</span> : v}</td>; })}<td className="tot">{total(m)}</td></tr>)}
                </tbody></table><p style={{ margin: '8px 0 0', fontSize: 12, color: '#6a716c' }}>Chiffre entouré : sous le par. Maximum par trou : par + 4. Balle à l’eau : retour à sa place, 1 coup de pénalité.</p></div></div>
              {fini ? end : null}
            </div>
          </div>) : null}
      </div>
    </div>
  );
};
