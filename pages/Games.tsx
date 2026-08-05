import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Gamepad2, Swords, X, Check, Trophy, ArrowLeft, Crown, Flame,
  Users, BarChart2, Clock, Circle, Anchor, Grid3x3, Flag, Loader2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db, ApiError } from '../services/dataService';
import { useRealtimeSync, RT_EVENTS } from '../services/realtime';
import { emitWithAck, getSocket } from '../services/socket';
import { User } from '../types';
import { GAMES_ALLOWED_ROLES } from '../constants';
import {
  GameChallenge, GameSession, GameSummary, GameType, GAME_LABELS, MoveFeedback
} from '../components/games/gameTypes';
import Avatar from '../components/Avatar';
import Morpion from '../components/games/Morpion';
import Connect4 from '../components/games/Connect4';
import Battleship from '../components/games/Battleship';

// ============================================================================
// JEUX — refonte du 05/08/2026
//
// ⚠️ CHANGEMENT DE FOND : plus une ligne de `localStorage`. Défis et parties
// vivent sur le serveur (`/api/games`, événements socket `game:*`), et les
// parties reçues sont des vues REDACTÉES — la flotte adverse n'y figure pas.
// Avant, tout était local : défier un collègue était structurellement impossible,
// et le « classement global » ne classait que les parties d'un seul navigateur.
//
// ⚠️ Le polling 3 s a disparu : les événements socket le remplacent.
//
// ⚠️ L'identité des joueurs (nom, couleur, avatar) se résout par `userId` depuis
// la liste des utilisateurs. Ne JAMAIS la stocker dans une partie : c'est ce que
// faisait l'ancienne version, et un renommage laissait l'ancien nom au classement.
// ============================================================================

type PageTab = 'lobby' | GameType | 'global';

const TABS: { id: PageTab; label: string; icon: React.ReactNode }[] = [
  { id: 'lobby', label: 'Lobby', icon: <Gamepad2 size={13} /> },
  { id: 'morpion', label: 'Morpion', icon: <Grid3x3 size={13} /> },
  { id: 'connect4', label: 'Puissance 4', icon: <Circle size={13} /> },
  { id: 'battleship', label: 'Bataille navale', icon: <Anchor size={13} /> },
  { id: 'global', label: 'Classement', icon: <Trophy size={13} /> },
];

const GAME_META: Record<GameType, { icon: React.ReactNode; pitch: string; accent: string }> = {
  morpion: { icon: <Grid3x3 size={22} />, pitch: 'Trois cases alignées. Deux minutes, pas plus.', accent: 'text-bony-orange' },
  connect4: { icon: <Circle size={22} />, pitch: 'Quatre pions, la gravité en plus.', accent: 'text-bony-violet' },
  battleship: { icon: <Anchor size={22} />, pitch: 'Placez votre flotte, coulez la sienne.', accent: 'text-bony-blue' },
};

// ---- Statistiques -----------------------------------------------------------

interface PlayerStats {
  userId: string; played: number; wins: number; losses: number; draws: number; ratio: number;
}
interface Rivalry {
  aId: string; bId: string; aWins: number; bWins: number; draws: number; total: number;
}

// Calculs volontairement identiques à l'ancienne version : ils étaient justes,
// c'est leur SOURCE qui était fausse (localStorage au lieu du serveur).
const computeStats = (history: GameSummary[], game?: GameType): PlayerStats[] => {
  const rows = game ? history.filter(h => h.game === game) : history;
  const map = new Map<string, PlayerStats>();
  const ensure = (id: string) => {
    if (!map.has(id)) map.set(id, { userId: id, played: 0, wins: 0, losses: 0, draws: 0, ratio: 0 });
    return map.get(id)!;
  };
  for (const s of rows) {
    const p1 = ensure(s.player1Id), p2 = ensure(s.player2Id);
    p1.played++; p2.played++;
    if (s.winnerId === 'draw') { p1.draws++; p2.draws++; }
    else if (s.winnerId === s.player1Id) { p1.wins++; p2.losses++; }
    else if (s.winnerId === s.player2Id) { p2.wins++; p1.losses++; }
  }
  return [...map.values()]
    .map(p => ({ ...p, ratio: p.played > 0 ? Math.round((p.wins / p.played) * 100) : 0 }))
    .sort((a, b) => b.wins - a.wins || b.ratio - a.ratio);
};

const computeRivalries = (history: GameSummary[], game?: GameType): Rivalry[] => {
  const rows = game ? history.filter(h => h.game === game) : history;
  const map = new Map<string, Rivalry>();
  for (const s of rows) {
    const [aId, bId] = [s.player1Id, s.player2Id].sort();
    const k = `${aId}||${bId}`;
    if (!map.has(k)) map.set(k, { aId, bId, aWins: 0, bWins: 0, draws: 0, total: 0 });
    const r = map.get(k)!;
    r.total++;
    if (s.winnerId === 'draw') r.draws++;
    else if (s.winnerId === aId) r.aWins++;
    else if (s.winnerId === bId) r.bWins++;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
};

const computeStreak = (history: GameSummary[]): { userId: string; streak: number } | null => {
  const finis = [...history]
    .filter(s => s.winnerId && s.winnerId !== 'draw')
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const cur = new Map<string, number>();
  const max = new Map<string, number>();
  for (const s of finis) {
    const gagnant = s.winnerId!;
    const perdant = gagnant === s.player1Id ? s.player2Id : s.player1Id;
    const n = (cur.get(gagnant) ?? 0) + 1;
    cur.set(gagnant, n);
    cur.set(perdant, 0);
    if (n > (max.get(gagnant) ?? 0)) max.set(gagnant, n);
  }
  let best: { userId: string; streak: number } | null = null;
  max.forEach((streak, userId) => { if (!best || streak > best.streak) best = { userId, streak }; });
  return best && best.streak > 1 ? best : null;
};

// ---- Petits composants ------------------------------------------------------

/** Identité d'un joueur, résolue par id. Le cœur du correctif « noms périmés ». */
const Joueur: React.FC<{ id: string; users: User[]; size?: number; className?: string; prenomSeul?: boolean }> =
({ id, users, size = 28, className = '', prenomSeul }) => {
  const u = users.find(x => x.id === id);
  const nom = u?.name ?? 'Joueur retiré';
  return (
    <span className={`flex items-center gap-2 min-w-0 ${className}`}>
      <Avatar userId={id} name={nom} color={u?.avatarColor} size={size} />
      <span className="truncate text-xs font-bold text-bony-text">
        {prenomSeul ? nom.split(' ')[0] : nom}
      </span>
    </span>
  );
};

const Podium: React.FC<{ stats: PlayerStats[]; users: User[] }> = ({ stats, users }) => {
  const top = stats.slice(0, 3);
  if (top.length === 0) return null;
  // Ordre visuel 2 - 1 - 3, hauteurs décroissantes.
  const ordre = [top[1], top[0], top[2]].filter(Boolean);
  const hauteurs = ['h-16', 'h-24', 'h-12'];
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-5">
      {ordre.map((p, i) => {
        const rang = p === top[0] ? 1 : p === top[1] ? 2 : 3;
        return (
          <div key={p.userId} className="flex flex-col items-center gap-2 min-w-0">
            {rang === 1 && <Crown size={16} className="text-bony-orange" />}
            <Joueur id={p.userId} users={users} size={rang === 1 ? 44 : 34} prenomSeul />
            <div className={`${hauteurs[i]} w-14 sm:w-20 rounded-t-xl flex items-start justify-center pt-1.5 ${
              rang === 1 ? 'gx-gradient' : 'bg-white/10'
            }`}>
              <span className={`text-[11px] font-title ${rang === 1 ? 'text-white' : 'text-bony-text'}`}>{p.wins}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Classement: React.FC<{ stats: PlayerStats[]; users: User[]; myId: string }> = ({ stats, users, myId }) => {
  if (!stats.length) {
    return <p className="text-xs text-bony-muted text-center py-6">Aucune partie terminée pour l'instant.</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-xs min-w-[380px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-widest text-bony-muted">
            <th className="text-left py-2 pl-2">Joueur</th>
            <th className="py-2">J</th><th className="py-2">V</th><th className="py-2">D</th>
            <th className="py-2">N</th><th className="py-2 pr-2">%</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((p, i) => (
            <tr key={p.userId} className={`border-t border-bony-border ${p.userId === myId ? 'bg-bony-orange/5' : ''}`}>
              <td className="py-2 pl-2">
                <span className="flex items-center gap-2">
                  <span className="w-4 text-[10px] text-bony-muted tabular-nums">{i + 1}</span>
                  <Joueur id={p.userId} users={users} size={24} />
                </span>
              </td>
              <td className="text-center tabular-nums text-bony-muted">{p.played}</td>
              <td className="text-center tabular-nums font-bold text-bony-text">{p.wins}</td>
              <td className="text-center tabular-nums text-bony-muted">{p.losses}</td>
              <td className="text-center tabular-nums text-bony-muted">{p.draws}</td>
              <td className="text-center tabular-nums font-bold text-bony-orange pr-2">{p.ratio}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Rivalites: React.FC<{ rivalries: Rivalry[]; users: User[] }> = ({ rivalries, users }) => {
  if (!rivalries.length) return null;
  return (
    <div className="space-y-2">
      {rivalries.slice(0, 5).map(r => (
        <div key={`${r.aId}-${r.bId}`} className="flex items-center gap-2 bg-white/[0.03] border border-bony-border rounded-xl p-2.5">
          <Joueur id={r.aId} users={users} size={24} className="flex-1" prenomSeul />
          <span className="text-xs font-title tabular-nums shrink-0">
            <span className={r.aWins > r.bWins ? 'text-bony-orange' : 'text-bony-muted'}>{r.aWins}</span>
            <span className="text-bony-muted/50 mx-1">–</span>
            <span className={r.bWins > r.aWins ? 'text-bony-orange' : 'text-bony-muted'}>{r.bWins}</span>
          </span>
          <Joueur id={r.bId} users={users} size={24} className="flex-1 justify-end flex-row-reverse" prenomSeul />
        </div>
      ))}
    </div>
  );
};

// ============================================================================

const Games: React.FC = () => {
  const { user } = useAuth();
  const myId = user?.id ?? '';
  const canAccess = GAMES_ALLOWED_ROLES.includes(user?.role ?? '');

  const [users, setUsers] = useState<User[]>([]);
  const [challenges, setChallenges] = useState<GameChallenge[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [history, setHistory] = useState<GameSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<PageTab>('lobby');
  const [cible, setCible] = useState<string | null>(null);
  const [jeuChoisi, setJeuChoisi] = useState<GameType>('morpion');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    if (user && !canAccess) {
      window.dispatchEvent(new CustomEvent('gearbox-navigate', { detail: { tab: 'dashboard' } }));
    }
  }, [user, canAccess]);

  const chargerLobby = useCallback(async () => {
    try {
      const d = await db.getGamesLobby();
      setChallenges(d.challenges);
      setSessions(d.sessions);
      setHistory(d.history);
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Impossible de charger les jeux.');
    } finally {
      setChargement(false);
    }
  }, []);

  const chargerUsers = useCallback(() => {
    db.getUsers().then(all => setUsers(all)).catch(() => {});
  }, []);

  useEffect(() => { if (canAccess) { chargerUsers(); chargerLobby(); } }, [canAccess, chargerUsers, chargerLobby]);

  // Invalidation sur les événements de jeu et sur les mutations d'utilisateur —
  // plus aucun polling.
  useRealtimeSync(canAccess ? RT_EVENTS.games : [], chargerLobby);
  useRealtimeSync(canAccess ? RT_EVENTS.users : [], chargerUsers);

  // ⚠️ En plus de l'invalidation ci-dessus, l'écran de jeu consomme la CHARGE de
  // `game:session:updated` : elle contient déjà la vue redactée à jour, et
  // attendre le refetch ferait clignoter le plateau à chaque coup.
  useEffect(() => {
    const s = getSocket();
    if (!s || !canAccess) return;
    const maj = (payload: GameSession) => {
      setSessions(prev => {
        const i = prev.findIndex(x => x.id === payload.id);
        return i < 0 ? [payload, ...prev] : prev.map(x => (x.id === payload.id ? payload : x));
      });
    };
    const demarre = (payload: GameSession) => { maj(payload); setActiveId(payload.id); };
    s.on('game:session:updated', maj);
    s.on('game:session:started', demarre);
    return () => { s.off('game:session:updated', maj); s.off('game:session:started', demarre); };
  }, [canAccess]);

  const active = sessions.find(s => s.id === activeId) ?? null;
  const recus = challenges.filter(c => c.toUserId === myId && c.status === 'pending');
  const envoyes = challenges.filter(c => c.fromUserId === myId && c.status === 'pending');
  const enCours = sessions.filter(s => s.status !== 'finished');
  const adversaires = users.filter(u => u.id !== myId && GAMES_ALLOWED_ROLES.includes(u.role));

  // ---- Actions ----
  const defier = async (toUserId: string) => {
    try {
      await db.sendGameChallenge(toUserId, jeuChoisi);
      setCible(null);
      await chargerLobby();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Échec de l'envoi du défi.");
    }
  };
  const refuser = async (id: string) => {
    try { await db.refuseGameChallenge(id); await chargerLobby(); } catch { /* ignoré */ }
  };
  const accepter = async (id: string) => {
    try {
      const s = await db.acceptGameChallenge(id);
      setSessions(prev => [s, ...prev.filter(x => x.id !== s.id)]);
      setActiveId(s.id);
      await chargerLobby();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Échec de l'acceptation.");
    }
  };

  // Un coup ne calcule RIEN : il propose, le serveur tranche et renvoie l'effet.
  const jouer = useCallback(async (move: any): Promise<MoveFeedback & { error?: string }> => {
    if (!activeId) return { error: 'Aucune partie active.' };
    try {
      const r = await emitWithAck<any>('game:move', { sessionId: activeId, move });
      if (r?.session) setSessions(prev => prev.map(x => (x.id === r.session.id ? r.session : x)));
      return { effect: r?.effect, sunkShipName: r?.sunkShipName };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Coup refusé.' };
    }
  }, [activeId]);

  const placerFlotte = useCallback(async (ships: { name: string; cells: [number, number][] }[]) => {
    if (!activeId) return { error: 'Aucune partie active.' };
    try {
      const r = await emitWithAck<any>('game:fleet:place', { sessionId: activeId, ships });
      if (r?.session) setSessions(prev => prev.map(x => (x.id === r.session.id ? r.session : x)));
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Placement refusé.' };
    }
  }, [activeId]);

  const abandonner = async () => {
    if (!activeId || !confirm('Abandonner la partie ? La victoire ira à votre adversaire.')) return;
    try { await emitWithAck('game:forfeit', { sessionId: activeId }); } catch { /* ignoré */ }
  };

  if (!user) return null;
  if (!canAccess) return null;

  // ===== Écran de jeu =====
  if (active) {
    const Comp = active.game === 'morpion' ? Morpion : active.game === 'connect4' ? Connect4 : Battleship;
    const gagne = active.winnerId === myId;
    const nul = active.winnerId === 'draw';
    return (
      <div className="flex flex-col h-full overflow-hidden animate-fade-in font-sans">
        <header className="px-3 md:px-6 pt-4 pb-3 shrink-0 flex items-center gap-3">
          <button onClick={() => setActiveId(null)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-white/5 text-bony-muted hover:text-bony-text transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-title text-base md:text-lg text-bony-text truncate">{GAME_LABELS[active.game]}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Joueur id={myId} users={users} size={20} prenomSeul />
              <span className="text-[10px] text-bony-muted">vs</span>
              <Joueur id={active.opponentId} users={users} size={20} prenomSeul />
            </div>
          </div>
          {active.status !== 'finished' && (
            <button onClick={abandonner}
              className="min-h-[44px] px-3 rounded-xl text-[11px] font-bold text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1.5">
              <Flag size={13} /> <span className="hidden sm:inline">Abandonner</span>
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 md:px-6 pb-8">
          <div className="max-w-3xl mx-auto space-y-4">
            {active.status === 'finished' && (
              <div className={`gx-card p-5 text-center space-y-1.5 ${gagne ? 'border-bony-orange/40' : ''}`}>
                {gagne && <Trophy size={26} className="mx-auto text-bony-orange" />}
                <p className="font-title text-lg text-bony-text">
                  {nul ? 'Match nul' : gagne ? 'Victoire !' : 'Défaite'}
                </p>
                {!nul && !gagne && <p className="text-xs text-bony-muted">La revanche est un clic dans le lobby.</p>}
              </div>
            )}
            <Comp session={active} myId={myId} onMove={jouer} onPlaceFleet={placerFlotte} />
          </div>
        </div>
      </div>
    );
  }

  // ===== Lobby et classements =====
  const statsOnglet = computeStats(history, tab === 'global' || tab === 'lobby' ? undefined : tab);
  const rivalitesOnglet = computeRivalries(history, tab === 'global' || tab === 'lobby' ? undefined : tab);
  const serie = computeStreak(history);

  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-in font-sans">
      <header className="px-3 md:px-6 pt-4 pb-2 shrink-0">
        <h1 className="font-title text-lg md:text-xl text-bony-text flex items-center gap-2">
          <Gamepad2 size={20} className="text-bony-orange" /> Jeux
        </h1>
        <p className="text-[11px] text-bony-muted mt-0.5">
          Défiez un collègue — il reçoit l'invitation instantanément, où qu'il soit.
        </p>
        {/* Onglets à défilement horizontal : cinq onglets ne tiennent pas à 320 px. */}
        <div className="flex gap-1.5 mt-3 overflow-x-auto custom-scrollbar -mx-1 px-1 pb-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 min-h-[36px] px-3 rounded-xl text-[11px] font-bold transition-colors flex items-center gap-1.5 ${
                tab === t.id ? 'gx-gradient text-white' : 'bg-white/5 text-bony-muted hover:text-bony-text'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 md:px-6 pb-20 space-y-5">
        {erreur && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{erreur}</p>}
        {chargement && (
          <p className="text-xs text-bony-muted flex items-center gap-2 justify-center py-6">
            <Loader2 size={14} className="animate-spin" /> Chargement…
          </p>
        )}

        {tab === 'lobby' && !chargement && (
          <>
            {/* Défis reçus, tout en haut : c'est l'information la plus périssable. */}
            {recus.length > 0 && (
              <section className="gx-card p-4 border-bony-orange/40 space-y-2">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-bony-orange flex items-center gap-1.5">
                  <Swords size={12} /> On vous défie ({recus.length})
                </h2>
                {recus.map(c => (
                  <div key={c.id} className="flex items-center gap-2 bg-white/[0.03] rounded-xl p-2.5">
                    <Joueur id={c.fromUserId} users={users} className="flex-1" />
                    <span className="text-[10px] text-bony-muted shrink-0 hidden sm:inline">{GAME_LABELS[c.game]}</span>
                    <button onClick={() => refuser(c.id)} aria-label="Refuser"
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-red-400 hover:bg-red-500/15 transition-colors">
                      <X size={16} />
                    </button>
                    <button onClick={() => accepter(c.id)} aria-label="Accepter"
                      className="min-h-[40px] px-3 rounded-xl gx-gradient text-white text-[11px] font-bold flex items-center gap-1.5">
                      <Check size={14} /> Jouer
                    </button>
                  </div>
                ))}
              </section>
            )}

            {/* Parties en cours */}
            {enCours.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-bony-muted flex items-center gap-1.5">
                  <Clock size={12} /> Parties en cours ({enCours.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {enCours.map(s => {
                    const aMoi = s.currentTurn === myId && s.status === 'playing';
                    return (
                      <button key={s.id} onClick={() => setActiveId(s.id)}
                        className={`gx-card p-3 text-left flex items-center gap-2.5 transition-colors ${
                          aMoi ? 'border-bony-orange/50' : 'hover:border-bony-border'
                        }`}>
                        <span className={GAME_META[s.game].accent}>{GAME_META[s.game].icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-bold text-bony-text truncate">{GAME_LABELS[s.game]}</span>
                          <Joueur id={s.opponentId} users={users} size={18} prenomSeul />
                        </span>
                        <span className={`text-[9px] font-bold shrink-0 ${aMoi ? 'text-bony-orange' : 'text-bony-muted'}`}>
                          {s.status === 'placing' ? 'PLACEMENT' : aMoi ? 'À VOUS' : 'ATTENTE'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Lancer un défi */}
            <section className="space-y-3">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-bony-muted flex items-center gap-1.5">
                <Swords size={12} /> Lancer un défi
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(Object.keys(GAME_META) as GameType[]).map(g => (
                  <button key={g} onClick={() => setJeuChoisi(g)}
                    className={`gx-card p-3.5 text-left transition-colors ${
                      jeuChoisi === g ? 'border-bony-orange' : 'hover:border-bony-border'
                    }`}>
                    <span className={GAME_META[g].accent}>{GAME_META[g].icon}</span>
                    <span className="block font-title text-xs text-bony-text mt-2">{GAME_LABELS[g]}</span>
                    <span className="block text-[10px] text-bony-muted mt-0.5 leading-snug">{GAME_META[g].pitch}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {adversaires.map(u => {
                  const dejaDefie = envoyes.some(c => c.toUserId === u.id);
                  return (
                    <div key={u.id} className="gx-card p-2.5 flex items-center gap-2">
                      <Joueur id={u.id} users={users} className="flex-1" />
                      {dejaDefie ? (
                        <span className="text-[10px] text-bony-muted shrink-0 px-2">Défi envoyé</span>
                      ) : cible === u.id ? (
                        <button onClick={() => defier(u.id)}
                          className="min-h-[40px] px-3 rounded-xl gx-gradient text-white text-[11px] font-bold shrink-0">
                          {GAME_LABELS[jeuChoisi]} !
                        </button>
                      ) : (
                        <button onClick={() => setCible(u.id)}
                          className="min-h-[40px] px-3 rounded-xl bg-white/5 hover:bg-white/10 text-bony-text text-[11px] font-bold shrink-0 transition-colors">
                          Défier
                        </button>
                      )}
                    </div>
                  );
                })}
                {adversaires.length === 0 && (
                  <p className="text-xs text-bony-muted col-span-full">Aucun collègue n'a accès aux Jeux.</p>
                )}
              </div>
            </section>

            {serie && (
              <section className="gx-card p-3.5 flex items-center gap-3">
                <Flame size={20} className="text-bony-orange shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-bony-muted">Meilleure série</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Joueur id={serie.userId} users={users} size={22} prenomSeul />
                    <span className="text-xs font-title text-bony-orange">{serie.streak} victoires d'affilée</span>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {tab !== 'lobby' && !chargement && (
          <>
            <section className="gx-card p-4 space-y-4">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-bony-muted flex items-center gap-1.5">
                <Trophy size={12} className="text-bony-orange" />
                {tab === 'global' ? 'Classement toutes catégories' : `Classement — ${GAME_LABELS[tab as GameType]}`}
              </h2>
              <Podium stats={statsOnglet} users={users} />
              <Classement stats={statsOnglet} users={users} myId={myId} />
            </section>

            {rivalitesOnglet.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-bony-muted flex items-center gap-1.5">
                  <Users size={12} /> Face-à-face
                </h2>
                <Rivalites rivalries={rivalitesOnglet} users={users} />
              </section>
            )}

            <p className="text-[10px] text-bony-muted flex items-center gap-1.5">
              <BarChart2 size={11} />
              Classement calculé sur les parties enregistrées côté serveur — identique pour tout le monde.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Games;
