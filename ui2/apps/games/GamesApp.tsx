import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { User } from '../../../types';
import { GAMES_ALLOWED_ROLES, canSeeGames } from '../../../constants';
import { useAuth } from '../../../contexts/AuthContext';
import { db, ApiError } from '../../../services/dataService';
import { useRealtimeSync, RT_EVENTS } from '../../../services/realtime';
import { emitWithAck, getSocket } from '../../../services/socket';
import { useAppSettings } from '../../../services/appSettings';
import { GAME_LABELS, type GameChallenge, type GameSession, type GameSummary, type GameType } from '../../../components/games/gameTypes';
import { useWorkspace } from '../../store/workspace';
import { gx, hud, Icon, Seg, useEngineEvent } from '../ui/kit';
import { computeStats, computeRivalries, computeStreak } from './logic';
import { Morpion, Connect4, Battleship } from './boards';

// =====================================================================
// Rubrique « Jeux » — transposition de maquettes/v2/js/apps/games.js (même balisage, mêmes
// classes `gme-*`), sur les VRAIES parties. Parité : maquettes/ux/inventaires/jeux.md.
//  - accès : `canSeeGames(rôle, gamesEnabled)` (Master, Administrator, Coordinator, Digital
//    Manager ; Director EXCLU) — le seul garde réel reste le serveur (`/api/games`, 403) ;
//  - défis, parties, historique : `/api/games` et les événements socket `game:*`, EXACTEMENT
//    comme pages/Games.tsx (lobby rechargé sur `RT_EVENTS.games`, vue de partie remplacée par la
//    charge de `game:session:updated`, ouverture auto sur `game:session:started`) ;
//  - identités résolues par `userId` depuis l'espace de travail (jamais stockées dans une partie).
// =====================================================================

type Tab = 'lobby' | GameType | 'global';
const TABS: [Tab, string][] = [['lobby', 'Lobby'], ['morpion', 'Morpion'], ['connect4', 'Puissance 4'], ['battleship', 'Bataille navale'], ['global', 'Classement']];
const GAMES: { id: GameType; pitch: string; c: string; icon: string }[] = [
  { id: 'morpion', pitch: 'Trois cases alignées. Deux minutes, pas plus.', c: 'var(--bony-orange)', icon: 'grid' },
  { id: 'connect4', pitch: 'Quatre pions, la gravité en plus.', c: 'var(--bony-violet)', icon: 'target' },
  { id: 'battleship', pitch: 'Placez votre flotte, coulez la sienne.', c: 'var(--bony-blue)', icon: 'flag' },
];
const gOf = (id: GameType) => GAMES.find((g) => g.id === id) || GAMES[0];
const PODIUM_H: Record<number, number> = { 1: 96, 2: 64, 3: 48 };

const initials = (name: string) => name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError && e.message && !/^Erreur \d+$/.test(e.message) ? e.message : fallback);

function confetti(host: HTMLElement) {
  if (gx().eco?.()) return;
  const cols = ['var(--bony-orange)', 'var(--bony-violet)', 'var(--ok)', 'var(--warn)', 'var(--info)', 'var(--cyan)'];
  const box = document.createElement('div'); box.className = 'gme-confetti';
  const h = (host.clientHeight || 300) + 30;
  box.innerHTML = Array.from({ length: 44 }, (_, i) => `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--dx:${Math.round((Math.random() - .5) * 180)}px;--r:${Math.round(Math.random() * 900 - 450)}deg;--d:${(1.3 + Math.random() * 1.2).toFixed(2)}s;--dl:${(Math.random() * .25).toFixed(2)}s;--c:${cols[i % cols.length]};--w:${(6 + Math.random() * 5).toFixed(1)}px;--h:${h}px"></i>`).join('');
  host.append(box); setTimeout(() => box.remove(), 3000);
}

export default function GamesApp({ win, inst }: AppProps) {
  const { user } = useAuth();
  const myId = user?.id ?? '', role = user?.role;
  const { gamesEnabled } = useAppSettings();
  const canAccess = canSeeGames(role, gamesEnabled);
  const users = useWorkspace((s) => s.users);

  const [challenges, setChallenges] = useState<GameChallenge[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [history, setHistory] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('lobby');           // non persisté (comme la page)
  const [pick, setPick] = useState<GameType>('morpion');
  const [target, setTarget] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);   // défi refusé en train de sortir
  const paneRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  useEngineEvent('ctx', () => setTick((n) => n + 1));

  // ---------------------------------------------------------------- données (comme pages/Games.tsx)
  const loadLobby = useCallback(async () => {
    try {
      const d = await db.getGamesLobby();
      setChallenges(d.challenges); setSessions(d.sessions); setHistory(d.history); setError('');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Impossible de charger les jeux.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canAccess) loadLobby(); }, [canAccess, loadLobby]);
  useRealtimeSync(canAccess ? RT_EVENTS.games : [], loadLobby);
  // La charge de `game:session:updated` est déjà la vue redactée à jour : attendre le rechargement
  // ferait clignoter le plateau à chaque coup. `game:session:started` ouvre la partie acceptée.
  useEffect(() => {
    const s = getSocket(); if (!s || !canAccess) return;
    const maj = (p: GameSession) => setSessions((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev]));
    const demarre = (p: GameSession) => { maj(p); setActiveId(p.id); };
    s.on('game:session:updated', maj); s.on('game:session:started', demarre);
    return () => { s.off('game:session:updated', maj); s.off('game:session:started', demarre); };
  }, [canAccess]);

  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const uName = (id: string) => byId.get(id)?.name ?? 'Joueur retiré';
  const first = (id: string) => uName(id).split(' ')[0];
  // Rendus (fonctions, pas composants : un composant déclaré ici serait remonté à chaque rendu).
  const av = (id: string, cls = '') => <span className={`av ${cls}`} style={{ '--c': byId.get(id)?.avatarColor || '#8a8599' } as React.CSSProperties} data-tip={uName(id)}>{initials(uName(id))}</span>;
  const player = (id: string, firstOnly = false, cls = 'sm') => <span className="row" style={{ gap: 8, minWidth: 0 }}>{av(id, cls)}<b className="ellipsis">{firstOnly ? first(id) : uName(id)}</b></span>;

  const active = sessions.find((s) => s.id === activeId) ?? null;
  const received = challenges.filter((c) => c.toUserId === myId && c.status === 'pending');
  const sent = challenges.filter((c) => c.fromUserId === myId && c.status === 'pending');
  const running = sessions.filter((s) => s.status !== 'finished');
  const opponents = users.filter((u) => u.id !== myId && GAMES_ALLOWED_ROLES.includes(u.role));
  const scope = tab === 'lobby' || tab === 'global' ? undefined : tab;
  const stats = useMemo(() => computeStats(history, scope), [history, scope]);
  const rivals = useMemo(() => computeRivalries(history, scope).slice(0, 5), [history, scope]);
  const streak = useMemo(() => computeStreak(history), [history]);

  // ---------------------------------------------------------------- actions
  const dare = async (to: string) => {
    try {
      await db.sendGameChallenge(to, pick);
      setTarget(null); hud(`Défi envoyé à ${first(to)} · ${GAME_LABELS[pick]}`);
      await loadLobby();
    } catch (e) { setError(errMsg(e, "Échec de l'envoi du défi.")); }
  };
  const refuse = (c: GameChallenge, el: HTMLElement | null) => {
    const go = async () => {
      try { await db.refuseGameChallenge(c.id); } catch { hud('Échec du refus du défi.'); }
      setLeaving(null); await loadLobby();
    };
    setLeaving(c.id);
    const a = el ? gx().animate(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(24px)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }) : null;
    if (a) a.onfinish = go; else go();
  };
  const accept = async (c: GameChallenge) => {
    try {
      const s = await db.acceptGameChallenge(c.id);
      setSessions((prev) => [s, ...prev.filter((x) => x.id !== s.id)]); openGame(s.id);
      await loadLobby();
    } catch (e) { setError(errMsg(e, "Échec de l'acceptation.")); }
  };
  const move = useCallback(async (m: any) => {
    if (!activeId) return { error: 'Aucune partie active.' };
    try {
      const r = await emitWithAck<any>('game:move', { sessionId: activeId, move: m });
      if (r?.session) setSessions((prev) => prev.map((x) => (x.id === r.session.id ? r.session : x)));
      return { effect: r?.effect, sunkShipName: r?.sunkShipName };
    } catch (e) { return { error: e instanceof Error ? e.message : 'Coup refusé.' }; }
  }, [activeId]);
  const placeFleet = useCallback(async (ships: { name: string; cells: [number, number][] }[]) => {
    if (!activeId) return { error: 'Aucune partie active.' };
    try {
      const r = await emitWithAck<any>('game:fleet:place', { sessionId: activeId, ships });
      if (r?.session) setSessions((prev) => prev.map((x) => (x.id === r.session.id ? r.session : x)));
      return {};
    } catch (e) { return { error: e instanceof Error ? e.message : 'Placement refusé.' }; }
  }, [activeId]);
  // Abandon : volet de confirmation du moteur (pas de `confirm()` natif), puis `game:forfeit`.
  const abandon = () => {
    const s = active; if (!s || s.status === 'finished') return;
    win.sheet(`<h3>Abandonner la partie ?</h3><div class="muted">La victoire ira à votre adversaire.</div>
      <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" style="background:var(--danger)">Abandonner</button></div>`,
    { width: 420, onClose: (v: unknown) => { if (v === 'ok') emitWithAck('game:forfeit', { sessionId: s.id }).catch(() => hud('Abandon refusé.')); } });
  };

  // ---------------------------------------------------------------- navigation + animations
  const anim = useRef(false);
  const openGame = (id: string | null) => { anim.current = true; setActiveId(id); };
  const goTab = (t: Tab) => { anim.current = true; setActiveId(null); setTab(t); };
  useLayoutEffect(() => {
    if (!anim.current) return; anim.current = false;
    const pane = paneRef.current, el = pane?.firstElementChild as HTMLElement | null; if (!el) return;
    pane!.scrollTop = 0;
    gx().animate(el, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
    if (!active && tab !== 'lobby') pane!.querySelectorAll<HTMLElement>('.gme-block').forEach((b, i) => gx().animate(b, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { spring: 'soft', delay: [140, 0, 260][i] ?? 0, fill: 'backwards' }));
  });
  // Confettis à la victoire, au moment où la partie ouverte se termine (pas à la réouverture).
  const wasOver = useRef<Record<string, boolean>>({});
  useLayoutEffect(() => {
    if (!active) return; const over = active.status === 'finished', before = wasOver.current[active.id];
    wasOver.current[active.id] = over;
    if (over && before === false && active.winnerId === myId) { const e = paneRef.current?.querySelector<HTMLElement>('[data-end]'); if (e) confetti(e); }
  }, [active?.id, active?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { win.setTitle('Jeux', active ? GAME_LABELS[active.game] : TABS.find((t) => t[0] === tab)![1]); }, [active?.game, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clavier : 1–9 au Morpion (pavé numérique), 1–7 au Puissance 4
  const playKey = useRef<((n: number) => void) | null>(null);
  const onKey = (e: React.KeyboardEvent) => {
    if (!active || (e.target as HTMLElement).closest('input,select,textarea')) return;
    const n = parseInt(e.key, 10); if (n && playKey.current) playKey.current(n);
  };

  // ---------------------------------------------------------------- barre du haut
  inst.command = (c: string) => {
    if (typeof c !== 'string') return;
    if (c.startsWith('tab:')) { const t = c.slice(4) as Tab; if (TABS.some((x) => x[0] === t)) goTab(t); return; }
    if (c.startsWith('play:')) {
      const [, gid, uid] = c.split(':');
      const s = sessions.find((x) => x.game === gid && x.opponentId === uid && x.status !== 'finished'); if (s) openGame(s.id);
    }
  };
  inst.menus = () => (canAccess ? {
    'Partie': [
      { label: 'Retour au lobby', icon: 'back', disabled: !active, action: () => goTab('lobby') },
      { label: 'Abandonner…', icon: 'flag', disabled: !active || active.status === 'finished', action: abandon },
    ],
    'Présentation': TABS.map(([v, l]) => ({ label: l, checked: !active && tab === v, action: () => goTab(v) })),
  } : {});

  // ---------------------------------------------------------------- accès refusé
  if (!canAccess) return (
    <div className="app"><div className="gme-pane scroll"><div className="empty" style={{ height: '100%' }}><Icon name="lock" /><b style={{ color: 'var(--text)' }}>Accès restreint</b>
      {role && GAMES_ALLOWED_ROLES.includes(role) ? 'La rubrique Jeux est désactivée.' : 'Les Jeux sont réservés aux rôles Master, Administrateur, Coordinateur et Digital Manager.'}</div></div></div>
  );

  // ---------------------------------------------------------------- écran de partie
  if (active) {
    const over = active.status === 'finished', won = active.winnerId === myId, draw = active.winnerId === 'draw';
    const end = over ? <div className={`gme-card gme-end ${won ? 'win' : ''}`} data-end>
      {won ? <span className="tr"><Icon name="star" /></span> : null}<h3>{draw ? 'Match nul' : won ? 'Victoire !' : 'Défaite'}</h3>
      {!won && !draw ? <span className="muted" style={{ fontSize: 13 }}>La revanche est un clic dans le lobby.</span> : null}
      <button className="btn" style={{ marginTop: 6 }} onClick={() => openGame(null)}><Icon name="back" size="sm" />Retour au lobby</button></div> : null;
    const props = { s: active, myId, onMove: move, onPlaceFleet: placeFleet, end };
    return (
      <div className="app" onKeyDown={onKey} tabIndex={-1}>
        <div className="app-head gme-head"><button className="gme-back" data-tip="Retour au lobby" aria-label="Retour au lobby" onClick={() => openGame(null)}><Icon name="back" /></button>
          <div className="ah-t"><span className="ah-eye">Détente</span><h1>{GAME_LABELS[active.game]}</h1><span className="sub gme-vs">{player(myId, true)}<span className="faint">vs</span>{player(active.opponentId, true)}</span></div>
          <div className="ah-f">{!over ? <button className="btn ghost" style={{ color: 'var(--danger)' }} onClick={abandon}><Icon name="flag" size="sm" />Abandonner</button> : null}</div></div>
        <div className="gme-pane scroll" ref={paneRef}>
          {active.game === 'morpion' ? <Morpion key={active.id} {...props} playRef={playKey} /> : active.game === 'connect4' ? <Connect4 key={active.id} {...props} playRef={playKey} /> : <Battleship key={active.id} {...props} />}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- lobby et classements
  const cnt = received.length;
  const head = (
    <div className="app-head gme-head"><div className="ah-t"><span className="ah-eye">Détente</span><h1>Jeux</h1><span className="sub">Défiez un collègue — il reçoit l’invitation instantanément, où qu’il soit.</span></div>
      <div className="ah-tabs"><Seg value={tab} onChange={goTab} options={TABS.map(([v, l]) => [v, <>{l}{v === 'lobby' && cnt ? <span className="count">{cnt}</span> : null}</>])} /></div></div>
  );
  const banner = error ? <div className="gme-card" style={{ borderColor: 'color-mix(in srgb,var(--danger) 45%,var(--line))', color: 'var(--danger)', fontWeight: 600, fontSize: 13.5 }}>{error}</div> : null;

  let body: React.ReactNode;
  if (loading) body = <div className="gme-wrap"><div className="gme-empty" style={{ textAlign: 'center' }}>Chargement…</div></div>;
  else if (tab === 'lobby') {
    const dareBox = received.length ? (
      <section className={`gme-card gme-dare gme-sec enter ${running.length ? '' : 'solo'}`}><h2 className="gme-h2"><Icon name="flag" size="sm" />On vous défie <span className="faint">({received.length})</span></h2><div className="gme-list">
        {received.map((c) => (
          <div key={c.id} className="gme-lrow" data-ch={c.id}>{av(c.fromUserId)}<div className="t"><b>{uName(c.fromUserId)}</b><small>{GAME_LABELS[c.game]} · {gx().fmt.ago(new Date(c.createdAt).getTime())}</small></div>
            <button className="icon-btn" aria-label="Refuser" data-tip="Refuser" style={{ color: 'var(--danger)' }} disabled={leaving === c.id} onClick={(e) => refuse(c, e.currentTarget.closest('.gme-lrow'))}><Icon name="close" size="sm" /></button>
            <button className="btn primary" aria-label="Accepter" disabled={leaving === c.id} onClick={() => accept(c)}><Icon name="check" size="sm" />Jouer</button></div>
        ))}</div></section>) : null;
    const runBox = running.length ? (
      <section className={`gme-card gme-sec enter ${received.length ? '' : 'solo'}`} style={{ '--i': 1 } as React.CSSProperties}><h2 className="gme-h2"><Icon name="clock" size="sm" />Parties en cours <span className="faint">({running.length})</span></h2><div className="gme-runs">
        {running.map((s) => { const g = gOf(s.game), mine = s.currentTurn === myId && s.status === 'playing'; return (
          <button key={s.id} className={`gme-run ${mine ? 'mine' : ''}`} onClick={() => openGame(s.id)}><span className="gme-gico" style={{ '--c': g.c } as React.CSSProperties}><Icon name={g.icon} /></span>
            <span className="grow" style={{ minWidth: 0, display: 'grid', gap: 3 }}><b style={{ fontSize: 14 }}>{GAME_LABELS[s.game]}</b>{player(s.opponentId, true)}</span>
            <span className="st">{s.status === 'placing' ? 'PLACEMENT' : mine ? 'À VOUS' : 'ATTENTE'}</span></button>); })}</div></section>) : null;
    body = (
      <div className="gme-wrap">{banner}
        {dareBox || runBox ? <div className="gme-top">{dareBox}{runBox}</div> : null}
        <section className="gme-sec enter" style={{ '--i': 2 } as React.CSSProperties}><h2 className="gme-h2"><Icon name="target" size="sm" />Lancer un défi</h2>
          <div className="gme-games">{GAMES.map((g) => (
            <button key={g.id} className="gme-gcard" aria-pressed={pick === g.id} onClick={() => setPick(g.id)}><span className="gme-gico" style={{ '--c': g.c } as React.CSSProperties}><Icon name={g.icon} /></span><span className="nm">{GAME_LABELS[g.id]}</span><span className="ds">{g.pitch}</span></button>
          ))}</div>
          <div className="gme-opps">{opponents.length ? opponents.map((u: User) => {
            const already = sent.some((c) => c.toUserId === u.id), online = gx().data.USERS?.find((x: any) => x.id === u.id)?.online;
            return (
              <div key={u.id} className="gme-lrow">{av(u.id)}<div className="t"><b>{u.name}</b><small>{gx().data.ROLES?.[u.role]?.l || u.role}{online ? ' · en ligne' : ''}</small></div>
                {already ? <span className="faint" style={{ fontSize: 12.5, padding: '0 6px' }}>Défi envoyé</span>
                  : target === u.id ? <button className="btn primary" onClick={() => dare(u.id)}>{GAME_LABELS[pick]} !</button>
                  : <button className="btn" onClick={() => setTarget(u.id)}>Défier</button>}</div>
            ); }) : <div className="gme-empty">Aucun collègue n’a accès aux Jeux.</div>}</div>
        </section>
        {streak ? <section className="gme-card gme-streak enter" style={{ '--i': 3 } as React.CSSProperties}><span className="fl"><Icon name="bolt" /></span><div style={{ display: 'grid', gap: 4, minWidth: 0 }}><span className="label">Meilleure série</span><span className="row" style={{ gap: 10, flexWrap: 'wrap' }}>{player(streak.userId, true)}<span className="big">{streak.streak} victoires d’affilée</span></span></div></section> : null}
      </div>
    );
  } else {
    const top = stats.slice(0, 3), order = [top[1], top[0], top[2]].filter(Boolean);
    body = (
      <div className="gme-wrap">{banner}<div className="gme-board">
        <section className="gme-card gme-sec enter"><h2 className="gme-h2"><Icon name="star" size="sm" />{scope ? `Classement — ${GAME_LABELS[scope]}` : 'Classement toutes catégories'}</h2>
          {top.length ? <div className="gme-podium">{order.map((p) => { const rk = p === top[0] ? 1 : p === top[1] ? 2 : 3; return (
            <div key={p.userId} className={`gme-step p${rk}`}><span className="crown">{rk === 1 ? <Icon name="star" size="sm" /> : null}</span>{av(p.userId)}<span className="nm">{first(p.userId)}</span><div className="gme-block" style={{ height: PODIUM_H[rk] }}>{p.wins}</div></div>); })}</div> : null}
          {stats.length ? <div className="scroll"><table className="tbl gme-tbl"><thead><tr><th>Joueur</th><th className="c">J</th><th className="c">V</th><th className="c">D</th><th className="c opt">N</th><th className="c">%</th></tr></thead><tbody>
            {stats.map((p, i) => <tr key={p.userId} className={p.userId === myId ? 'me' : ''}><td><span className="row" style={{ gap: 8 }}><span className="gme-rk">{i + 1}</span>{player(p.userId)}</span></td><td className="c num muted">{p.played}</td><td className="c num"><b>{p.wins}</b></td><td className="c num muted">{p.losses}</td><td className="c num muted opt">{p.draws}</td><td className="c num"><b style={{ color: 'var(--bony-orange)' }}>{p.ratio}%</b></td></tr>)}
          </tbody></table></div> : <div className="gme-empty" style={{ textAlign: 'center' }}>Aucune partie terminée pour l’instant.</div>}
        </section>
        {rivals.length ? <section className="gme-card gme-sec enter" style={{ '--i': 1 } as React.CSSProperties}><h2 className="gme-h2"><Icon name="users" size="sm" />Face-à-face</h2><div className="gme-list">{rivals.map((r) => (
          <div key={`${r.aId}|${r.bId}`} className="gme-riv"><span className="sd">{av(r.aId, 'sm')}<span>{first(r.aId)}</span></span>
            <span className="sc"><span className={r.aWins > r.bWins ? 'w' : 'l'}>{r.aWins}</span><span className="faint"> – </span><span className={r.bWins > r.aWins ? 'w' : 'l'}>{r.bWins}</span></span>
            <span className="sd r"><span>{first(r.bId)}</span>{av(r.bId, 'sm')}</span></div>))}</div></section> : null}
      </div><div className="gme-foot"><Icon name="barchart" size="sm" />Classement calculé sur les parties enregistrées côté serveur — identique pour tout le monde.</div></div>
    );
  }
  return <div className="app">{head}<div className="gme-pane scroll" ref={paneRef}>{body}</div></div>;
}
