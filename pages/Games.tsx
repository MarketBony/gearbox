
import React, { useState, useEffect, useCallback } from 'react';
import {
  Gamepad2, Swords, X, Check, Trophy, RefreshCw, ArrowLeft,
  Crown, Flame, Star, Skull, Users, TrendingUp, BarChart2, Zap
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/dataService';
import { User } from '../types';
import { GameChallenge, GameSession, GameType } from '../components/games/gameTypes';
import Avatar from '../components/Avatar';
import Morpion from '../components/games/Morpion';
import Connect4 from '../components/games/Connect4';
import Battleship from '../components/games/Battleship';

// ---- Constants ----
const CHALLENGES_KEY = 'gearbox_game_challenges';
const SESSIONS_KEY = 'gearbox_game_sessions';
const GAMES_ALLOWED_ROLES = ['Master', 'Coordinator', 'Digital Manager'];

const GAME_LABELS: Record<GameType, string> = {
  morpion: 'Morpion',
  connect4: 'Puissance 4',
  battleship: 'Bataille Navale',
};
const GAME_ICONS: Record<GameType, string> = {
  morpion: '⊞',
  connect4: '⬤',
  battleship: '⚓',
};

type PageTab = 'lobby' | GameType | 'global';

const PAGE_TABS: { id: PageTab; label: string; icon?: string }[] = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'morpion', label: 'Morpion', icon: '⊞' },
  { id: 'connect4', label: 'Puissance 4', icon: '⬤' },
  { id: 'battleship', label: 'Bataille Navale', icon: '⚓' },
  { id: 'global', label: 'Classement Général' },
];

// ---- Helpers ----
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

function loadChallenges(): GameChallenge[] {
  try { return JSON.parse(localStorage.getItem(CHALLENGES_KEY) || '[]'); } catch { return []; }
}
function saveChallenges(data: GameChallenge[]) {
  localStorage.setItem(CHALLENGES_KEY, JSON.stringify(data));
}
function loadSessions(): GameSession[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]'); } catch { return []; }
}
function saveSessions(data: GameSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(data));
}

function emptyGrid10(): (string | null)[][] {
  return Array.from({ length: 10 }, () => Array(10).fill(null));
}
function initBoard(game: GameType): any {
  if (game === 'morpion') return Array(9).fill(null);
  if (game === 'connect4') return Array.from({ length: 6 }, () => Array(7).fill(null));
  return {
    p1: { grid: emptyGrid10(), ready: false },
    p2: { grid: emptyGrid10(), ready: false },
    p1Shots: emptyGrid10(),
    p2Shots: emptyGrid10(),
  };
}

// ---- Stats types ----
interface PlayerStats {
  userId: string;
  name: string;
  color: string;
  wins: number;
  losses: number;
  draws: number;
  played: number;
  ratio: number;
}

interface Rivalry {
  player1Id: string;
  player1Name: string;
  player1Color: string;
  player1Wins: number;
  player2Id: string;
  player2Name: string;
  player2Color: string;
  player2Wins: number;
  draws: number;
  total: number;
}

interface GlobalPlayerStats extends PlayerStats {
  favoriteGame: GameType | null;
}

// ---- Stats computation ----
function computePlayerStats(sessions: GameSession[], game?: GameType): PlayerStats[] {
  const filtered = game
    ? sessions.filter(s => s.game === game && s.status === 'finished')
    : sessions.filter(s => s.status === 'finished');
  const map = new Map<string, PlayerStats>();

  const ensure = (id: string, name: string, color: string) => {
    if (!map.has(id)) map.set(id, { userId: id, name, color, wins: 0, losses: 0, draws: 0, played: 0, ratio: 0 });
    return map.get(id)!;
  };

  for (const s of filtered) {
    const p1 = ensure(s.player1Id, s.player1Name, s.player1Color);
    const p2 = ensure(s.player2Id, s.player2Name, s.player2Color);
    p1.played++;
    p2.played++;
    if (s.winnerId === 'draw') {
      p1.draws++;
      p2.draws++;
    } else if (s.winnerId === s.player1Id) {
      p1.wins++;
      p2.losses++;
    } else if (s.winnerId === s.player2Id) {
      p2.wins++;
      p1.losses++;
    }
  }

  return Array.from(map.values())
    .map(p => ({ ...p, ratio: p.played > 0 ? Math.round((p.wins / p.played) * 100) : 0 }))
    .sort((a, b) => b.wins - a.wins || b.ratio - a.ratio || a.name.localeCompare(b.name));
}

function computeRivalries(sessions: GameSession[], game?: GameType): Rivalry[] {
  const filtered = game
    ? sessions.filter(s => s.game === game && s.status === 'finished')
    : sessions.filter(s => s.status === 'finished');
  const map = new Map<string, Rivalry>();

  for (const s of filtered) {
    const sorted = [s.player1Id, s.player2Id].sort();
    const key = sorted.join('||');
    const isP1First = sorted[0] === s.player1Id;

    if (!map.has(key)) {
      map.set(key, {
        player1Id: sorted[0],
        player1Name: isP1First ? s.player1Name : s.player2Name,
        player1Color: isP1First ? s.player1Color : s.player2Color,
        player1Wins: 0,
        player2Id: sorted[1],
        player2Name: isP1First ? s.player2Name : s.player1Name,
        player2Color: isP1First ? s.player2Color : s.player1Color,
        player2Wins: 0,
        draws: 0,
        total: 0,
      });
    }
    const r = map.get(key)!;
    r.total++;
    if (s.winnerId === 'draw') r.draws++;
    else if (s.winnerId === r.player1Id) r.player1Wins++;
    else r.player2Wins++;
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function computeConsecutiveStreak(sessions: GameSession[]): {
  userId: string; name: string; color: string; streak: number; game: GameType;
} | null {
  const finished = sessions
    .filter(s => s.status === 'finished' && s.winnerId && s.winnerId !== 'draw')
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

  const players = new Map<string, { name: string; color: string; cur: number; max: number; game: GameType }>();

  for (const s of finished) {
    const ensure = (id: string, name: string, color: string) => {
      if (!players.has(id)) players.set(id, { name, color, cur: 0, max: 0, game: s.game });
      return players.get(id)!;
    };
    const p1 = ensure(s.player1Id, s.player1Name, s.player1Color);
    const p2 = ensure(s.player2Id, s.player2Name, s.player2Color);

    if (s.winnerId === s.player1Id) {
      p1.cur++;
      p2.cur = 0;
      if (p1.cur > p1.max) { p1.max = p1.cur; p1.game = s.game; }
    } else {
      p2.cur++;
      p1.cur = 0;
      if (p2.cur > p2.max) { p2.max = p2.cur; p2.game = s.game; }
    }
  }

  let best: { userId: string; name: string; color: string; streak: number; game: GameType } | null = null;
  for (const [id, p] of players) {
    if (!best || p.max > best.streak) best = { userId: id, name: p.name, color: p.color, streak: p.max, game: p.game };
  }
  return best;
}

function computeNemesis(sessions: GameSession[]): Map<string, { userId: string; name: string; color: string; losses: number }> {
  const finished = sessions.filter(s => s.status === 'finished' && s.winnerId && s.winnerId !== 'draw');
  const lossMap = new Map<string, Map<string, number>>();
  const names = new Map<string, { name: string; color: string }>();

  for (const s of finished) {
    names.set(s.player1Id, { name: s.player1Name, color: s.player1Color });
    names.set(s.player2Id, { name: s.player2Name, color: s.player2Color });
    const loserId = s.winnerId === s.player1Id ? s.player2Id : s.player1Id;
    const winnerId = s.winnerId!;
    if (!lossMap.has(loserId)) lossMap.set(loserId, new Map());
    const m = lossMap.get(loserId)!;
    m.set(winnerId, (m.get(winnerId) ?? 0) + 1);
  }

  const result = new Map<string, { userId: string; name: string; color: string; losses: number }>();
  for (const [loserId, opponents] of lossMap) {
    let maxId = '';
    let maxCount = 0;
    for (const [oppId, count] of opponents) {
      if (count > maxCount) { maxCount = count; maxId = oppId; }
    }
    if (maxId && names.has(maxId)) {
      result.set(loserId, { userId: maxId, ...names.get(maxId)!, losses: maxCount });
    }
  }
  return result;
}

function computeMoveCount(session: GameSession): number {
  try {
    if (session.game === 'morpion') {
      return (session.board as (string | null)[]).filter(Boolean).length;
    }
    if (session.game === 'connect4') {
      return (session.board as (string | null)[][]).flat().filter(Boolean).length;
    }
    if (session.game === 'battleship') {
      const b = session.board as any;
      return [b.p1Shots, b.p2Shots]
        .flatMap((g: (string | null)[][]) => g.flat())
        .filter(c => c === 'hit' || c === 'miss').length;
    }
  } catch { /* */ }
  return 0;
}

function computeFavoriteGame(sessions: GameSession[], userId: string): GameType | null {
  const wins: Record<GameType, number> = { morpion: 0, connect4: 0, battleship: 0 };
  for (const s of sessions) {
    if (s.status === 'finished' && s.winnerId === userId) wins[s.game]++;
  }
  const max = Math.max(...Object.values(wins));
  if (max === 0) return null;
  return (Object.entries(wins).find(([, v]) => v === max)?.[0] as GameType) ?? null;
}

// ---- Sub-components ----

const PodiumSection: React.FC<{ stats: PlayerStats[] }> = ({ stats }) => {
  const top3 = stats.slice(0, 3);
  if (top3.length === 0) return <p className="text-bony-text/40 text-sm text-center py-6">Aucune partie terminée.</p>;

  const order = top3.length >= 2
    ? [top3[1], top3[0], top3[2]].filter(Boolean)
    : [top3[0]];

  const heights = ['h-16', 'h-24', 'h-12'];
  const ranks = top3.length >= 2 ? [2, 1, 3] : [1];
  const rankColors = ['text-slate-300', 'text-yellow-400', 'text-amber-600'];
  const medalIcons = ['🥈', '🥇', '🥉'];

  return (
    <div className="flex items-end justify-center gap-4 pt-4 pb-2">
      {order.map((player, i) => {
        const rank = ranks[i] - 1; // 0-indexed for color/icon
        const pedestalH = heights[i];
        return (
          <div key={player.userId} className="flex flex-col items-center gap-2">
            <span className="text-lg">{medalIcons[rank]}</span>
            <Avatar userId={player.userId} name={player.name} color={player.color} size={rank === 1 ? 48 : 36} />
            <p className="font-semibold text-sm text-center leading-tight max-w-[80px] truncate">{player.name}</p>
            <p className={`text-xs font-bold ${rankColors[rank]}`}>{player.wins} victoire{player.wins !== 1 ? 's' : ''}</p>
            <div className={`${pedestalH} w-20 rounded-t-lg flex items-center justify-center ${
              rank === 1 ? 'bg-yellow-500/20 border-2 border-yellow-500/40' :
              rank === 0 ? 'bg-slate-500/20 border-2 border-slate-500/30' :
              'bg-amber-700/20 border-2 border-amber-700/30'
            }`}>
              <span className={`text-2xl font-black ${rankColors[rank]}`}>{ranks[i]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const LeaderboardTable: React.FC<{ stats: PlayerStats[]; myId: string }> = ({ stats, myId }) => {
  if (stats.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/5 text-bony-text/50 text-xs uppercase tracking-wider">
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Joueur</th>
            <th className="px-3 py-2 text-center">V</th>
            <th className="px-3 py-2 text-center">D</th>
            <th className="px-3 py-2 text-center">N</th>
            <th className="px-3 py-2 text-center">J</th>
            <th className="px-3 py-2 text-center">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {stats.map((p, i) => (
            <tr key={p.userId} className={`transition-colors ${p.userId === myId ? 'bg-bony-orange/5' : 'hover:bg-white/5'}`}>
              <td className="px-3 py-2 text-bony-text/40 font-mono text-xs">{i + 1}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <Avatar userId={p.userId} name={p.name} color={p.color} size={24} />
                  <span className={`font-medium truncate max-w-[100px] ${p.userId === myId ? 'text-bony-orange' : ''}`}>{p.name}</span>
                  {i === 0 && <Crown size={12} className="text-yellow-400 shrink-0" />}
                </div>
              </td>
              <td className="px-3 py-2 text-center text-green-400 font-bold">{p.wins}</td>
              <td className="px-3 py-2 text-center text-red-400">{p.losses}</td>
              <td className="px-3 py-2 text-center text-yellow-400">{p.draws}</td>
              <td className="px-3 py-2 text-center text-bony-text/60">{p.played}</td>
              <td className="px-3 py-2 text-center">
                <span className={`font-semibold ${p.ratio >= 60 ? 'text-green-400' : p.ratio >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {p.ratio}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const RivalriesSection: React.FC<{ rivalries: Rivalry[] }> = ({ rivalries }) => {
  const top3 = rivalries.slice(0, 3);
  if (top3.length === 0) return <p className="text-bony-text/40 text-sm text-center py-4">Pas assez de données.</p>;
  return (
    <div className="flex flex-col gap-2">
      {top3.map((r, i) => {
        const total = r.player1Wins + r.player2Wins + r.draws;
        const p1Pct = total > 0 ? (r.player1Wins / total) * 100 : 50;
        return (
          <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Avatar userId={r.player1Id} name={r.player1Name} color={r.player1Color} size={24} />
              <span className="font-semibold text-sm text-bony-orange">{r.player1Wins}</span>
              <span className="flex-1 text-center text-bony-text/40 text-xs font-bold">—</span>
              <span className="font-semibold text-sm text-bony-violet">{r.player2Wins}</span>
              <Avatar userId={r.player2Id} name={r.player2Name} color={r.player2Color} size={24} />
            </div>
            <div className="flex items-center justify-between text-xs text-bony-text/60 mb-1">
              <span className="truncate max-w-[80px]">{r.player1Name}</span>
              {r.draws > 0 && <span className="text-yellow-400 text-[10px]">{r.draws} nul{r.draws > 1 ? 's' : ''}</span>}
              <span className="truncate max-w-[80px] text-right">{r.player2Name}</span>
            </div>
            {/* Bar */}
            <div className="h-1.5 rounded-full bg-bony-violet/30 overflow-hidden">
              <div
                className="h-full bg-bony-orange rounded-full transition-all duration-500"
                style={{ width: `${p1Pct}%` }}
              />
            </div>
            <p className="text-[10px] text-bony-text/30 mt-1 text-center">{r.total} partie{r.total > 1 ? 's' : ''}</p>
          </div>
        );
      })}
    </div>
  );
};

const RecentGamesSection: React.FC<{ sessions: GameSession[]; myId: string; onResume: (id: string) => void }> = ({ sessions, myId, onResume }) => {
  const recent = sessions
    .filter(s => s.status === 'finished')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);

  if (recent.length === 0) return <p className="text-bony-text/40 text-sm text-center py-4">Aucune partie terminée.</p>;

  return (
    <div className="flex flex-col gap-1.5">
      {recent.map(s => {
        const isDraw = s.winnerId === 'draw';
        const winnerName = s.winnerId && !isDraw
          ? (s.winnerId === s.player1Id ? s.player1Name : s.player2Name)
          : null;
        const isMe = s.player1Id === myId || s.player2Id === myId;
        const iWon = s.winnerId === myId;
        return (
          <button
            key={s.id}
            onClick={() => isMe && onResume(s.id)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg border border-white/5 text-left transition-colors ${isMe ? 'hover:bg-white/10 cursor-pointer' : 'cursor-default'}`}
          >
            <span className="text-base shrink-0">{GAME_ICONS[s.game]}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">
                {s.player1Name} <span className="text-bony-text/40">vs</span> {s.player2Name}
              </p>
              <p className="text-[10px] text-bony-text/40">{relativeTime(s.updatedAt)}</p>
            </div>
            {isDraw ? (
              <span className="text-[10px] font-bold text-yellow-400 shrink-0">Nul</span>
            ) : (
              <span className={`text-[10px] font-bold shrink-0 ${isMe ? (iWon ? 'text-green-400' : 'text-red-400') : 'text-bony-text/50'}`}>
                {isMe ? (iWon ? 'Victoire' : 'Défaite') : `${winnerName} gagne`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

// ---- Game Stats Tab ----
const GameStatsTab: React.FC<{
  game: GameType;
  sessions: GameSession[];
  myId: string;
  onResume: (id: string) => void;
}> = ({ game, sessions, myId, onResume }) => {
  const stats = computePlayerStats(sessions, game);
  const rivalries = computeRivalries(sessions, game);
  const gameSessions = sessions.filter(s => s.game === game);

  return (
    <div className="flex flex-col gap-6">
      {/* Podium */}
      <section>
        <h3 className="text-xs font-bold text-bony-text/50 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Trophy size={12} className="text-yellow-400" /> Podium
        </h3>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <PodiumSection stats={stats} />
        </div>
      </section>

      {/* Leaderboard */}
      {stats.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-bony-text/50 uppercase tracking-widest mb-3 flex items-center gap-2">
            <BarChart2 size={12} className="text-bony-orange" /> Classement
          </h3>
          <LeaderboardTable stats={stats} myId={myId} />
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Rivalries */}
        <section>
          <h3 className="text-xs font-bold text-bony-text/50 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Swords size={12} className="text-bony-violet" /> Rivalités
          </h3>
          <RivalriesSection rivalries={rivalries} />
        </section>

        {/* Recent games */}
        <section>
          <h3 className="text-xs font-bold text-bony-text/50 uppercase tracking-widest mb-3 flex items-center gap-2">
            <RefreshCw size={12} className="text-bony-text/40" /> Dernières parties
          </h3>
          <RecentGamesSection sessions={gameSessions} myId={myId} onResume={onResume} />
        </section>
      </div>
    </div>
  );
};

// ---- Global Stats Tab ----
const GlobalStatsTab: React.FC<{
  sessions: GameSession[];
  users: User[];
  myId: string;
  onResume: (id: string) => void;
}> = ({ sessions, users, myId, onResume }) => {
  const stats = computePlayerStats(sessions);
  const maxWins = stats[0]?.wins ?? 1;
  const streak = computeConsecutiveStreak(sessions);
  const nemesisMap = computeNemesis(sessions);
  const rivalries = computeRivalries(sessions);

  // Most active player
  const mostActive = [...stats].sort((a, b) => b.played - a.played)[0] ?? null;

  // Longest match
  const longestMatch = [...sessions]
    .filter(s => s.status === 'finished')
    .sort((a, b) => computeMoveCount(b) - computeMoveCount(a))[0] ?? null;

  // Global stats with favorite game
  const globalStats: GlobalPlayerStats[] = stats.map(p => ({
    ...p,
    favoriteGame: computeFavoriteGame(sessions, p.userId),
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Global leaderboard */}
      <section>
        <h3 className="text-xs font-bold text-bony-text/50 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Crown size={12} className="text-yellow-400" /> Leaderboard Global
        </h3>
        {globalStats.length === 0 ? (
          <p className="text-bony-text/40 text-sm text-center py-8">Aucune partie terminée.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {globalStats.map((p, i) => (
              <div
                key={p.userId}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                  p.userId === myId ? 'bg-bony-orange/5 border-bony-orange/20' : 'bg-white/5 border-white/10'
                }`}
              >
                <span className="text-bony-text/30 font-mono text-sm w-5 shrink-0">{i + 1}</span>
                <Avatar userId={p.userId} name={p.name} color={p.color} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-sm truncate ${p.userId === myId ? 'text-bony-orange' : ''}`}>{p.name}</span>
                    {i === 0 && <Crown size={11} className="text-yellow-400 shrink-0" />}
                    {p.favoriteGame && (
                      <span className="text-xs bg-white/10 rounded px-1.5 py-0.5 shrink-0">
                        {GAME_ICONS[p.favoriteGame]} {GAME_LABELS[p.favoriteGame]}
                      </span>
                    )}
                  </div>
                  {/* Bar chart */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-bony-gradient rounded-full transition-all duration-700"
                        style={{ width: `${maxWins > 0 ? (p.wins / maxWins) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-bony-text/40 shrink-0 w-12 text-right">
                      {p.wins}V · {p.ratio}%
                    </span>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
                  <div className="text-center">
                    <p className="font-bold text-green-400">{p.wins}</p>
                    <p className="text-bony-text/30">V</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-red-400">{p.losses}</p>
                    <p className="text-bony-text/30">D</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-bony-text/60">{p.played}</p>
                    <p className="text-bony-text/30">J</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Hall of Fame */}
      <section>
        <h3 className="text-xs font-bold text-bony-text/50 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Flame size={12} className="text-bony-orange" /> Hall of Fame
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Meilleure série */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className="text-yellow-400" />
              <p className="text-xs font-bold text-bony-text/60 uppercase">Meilleure série</p>
            </div>
            {streak && streak.streak > 0 ? (
              <div className="flex items-center gap-2 mt-3">
                <Avatar userId={streak.userId} name={streak.name} color={streak.color} size={32} />
                <div>
                  <p className="font-bold text-sm">{streak.name}</p>
                  <p className="text-[10px] text-bony-text/50">{streak.streak} victoires consécutives</p>
                  <p className="text-[10px] text-bony-text/30">{GAME_ICONS[streak.game]} {GAME_LABELS[streak.game]}</p>
                </div>
              </div>
            ) : (
              <p className="text-bony-text/30 text-xs mt-2">—</p>
            )}
          </div>

          {/* Joueur le plus actif */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Star size={14} className="text-bony-violet" />
              <p className="text-xs font-bold text-bony-text/60 uppercase">Plus actif</p>
            </div>
            {mostActive && mostActive.played > 0 ? (
              <div className="flex items-center gap-2 mt-3">
                <Avatar userId={mostActive.userId} name={mostActive.name} color={mostActive.color} size={32} />
                <div>
                  <p className="font-bold text-sm">{mostActive.name}</p>
                  <p className="text-[10px] text-bony-text/50">{mostActive.played} parties jouées</p>
                </div>
              </div>
            ) : (
              <p className="text-bony-text/30 text-xs mt-2">—</p>
            )}
          </div>

          {/* Match le plus long */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} className="text-bony-orange" />
              <p className="text-xs font-bold text-bony-text/60 uppercase">Match le plus long</p>
            </div>
            {longestMatch ? (
              <div className="mt-3">
                <p className="font-bold text-sm">
                  {longestMatch.player1Name} vs {longestMatch.player2Name}
                </p>
                <p className="text-[10px] text-bony-text/50">{computeMoveCount(longestMatch)} coups</p>
                <p className="text-[10px] text-bony-text/30">{GAME_ICONS[longestMatch.game]} {GAME_LABELS[longestMatch.game]}</p>
              </div>
            ) : (
              <p className="text-bony-text/30 text-xs mt-2">—</p>
            )}
          </div>
        </div>
      </section>

      {/* Nemesis */}
      {nemesisMap.size > 0 && (
        <section>
          <h3 className="text-xs font-bold text-bony-text/50 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Skull size={12} className="text-red-400" /> Némésis
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Array.from(nemesisMap.entries()).map(([loserId, nemesis]) => {
              const loserStats = stats.find(p => p.userId === loserId);
              if (!loserStats) return null;
              return (
                <div key={loserId} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
                  <Avatar userId={loserId} name={loserStats.name} color={loserStats.color} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{loserStats.name}</p>
                    <p className="text-[10px] text-bony-text/40">perd souvent contre</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Skull size={10} className="text-red-400" />
                    <Avatar userId={nemesis.userId} name={nemesis.name} color={nemesis.color} size={24} />
                    <div>
                      <p className="text-[10px] font-bold text-red-400">{nemesis.name}</p>
                      <p className="text-[9px] text-bony-text/30">{nemesis.losses}×</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* All rivalries */}
      {rivalries.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-bony-text/50 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Swords size={12} className="text-bony-violet" /> Grandes Rivalités
          </h3>
          <RivalriesSection rivalries={rivalries} />
        </section>
      )}

      {/* Recent all games */}
      <section>
        <h3 className="text-xs font-bold text-bony-text/50 uppercase tracking-widest mb-3 flex items-center gap-2">
          <RefreshCw size={12} className="text-bony-text/40" /> Dernières parties (tous jeux)
        </h3>
        <RecentGamesSection sessions={sessions} myId={myId} onResume={onResume} />
      </section>
    </div>
  );
};

// ---- Main Component ----
const Games: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [challenges, setChallenges] = useState<GameChallenge[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [challengingUserId, setChallengingUserId] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameType>('morpion');
  const [pageTab, setPageTab] = useState<PageTab>('lobby');

  const myId = user?.id ?? '';
  const canAccessGames = GAMES_ALLOWED_ROLES.includes(user?.role ?? '');

  // Redirect unauthorised users immediately
  useEffect(() => {
    if (user && !canAccessGames) {
      window.dispatchEvent(new CustomEvent('gearbox-navigate', { detail: { tab: 'dashboard' } }));
    }
  }, [user, canAccessGames]);

  const refresh = useCallback(() => {
    setChallenges(loadChallenges());
    setSessions(loadSessions());
  }, []);

  useEffect(() => {
    db.getUsers().then(all => setUsers(all.filter(u => GAMES_ALLOWED_ROLES.includes(u.role))));
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  const myPendingReceived = challenges.filter(c => c.toUserId === myId && c.status === 'pending');
  const myPendingSent = challenges.filter(c => c.fromUserId === myId && c.status === 'pending');
  const mySessions = sessions.filter(s => s.player1Id === myId || s.player2Id === myId);
  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null;
  const otherUsers = users.filter(u => u.id !== myId);

  const sendChallenge = (toUserId: string) => {
    const all = loadChallenges();
    if (all.some(c => c.fromUserId === myId && c.toUserId === toUserId && c.status === 'pending')) return;
    const c: GameChallenge = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fromUserId: myId,
      fromUserName: user!.name,
      fromUserColor: user!.avatarColor ?? '#e67e22',
      toUserId,
      game: selectedGame,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    saveChallenges([...all, c]);
    refresh();
    setChallengingUserId(null);
  };

  const refuseChallenge = (challengeId: string) => {
    const all = loadChallenges().map(c => c.id === challengeId ? { ...c, status: 'refused' as const } : c);
    saveChallenges(all);
    refresh();
  };

  const acceptChallenge = (challenge: GameChallenge) => {
    const allC = loadChallenges().map(c => c.id === challenge.id ? { ...c, status: 'accepted' as const } : c);
    saveChallenges(allC);
    const session: GameSession = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      game: challenge.game,
      player1Id: challenge.fromUserId,
      player1Name: challenge.fromUserName,
      player1Color: challenge.fromUserColor,
      player2Id: myId,
      player2Name: user!.name,
      player2Color: user!.avatarColor ?? '#8e44ad',
      currentTurn: challenge.fromUserId,
      board: initBoard(challenge.game),
      status: 'playing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const allS = loadSessions();
    saveSessions([...allS, session]);
    refresh();
    setActiveSessionId(session.id);
  };

  const handleGameUpdate = (sessionId: string, board: any, nextTurn: string, winnerId?: string) => {
    const allS = loadSessions().map(s => {
      if (s.id !== sessionId) return s;
      return {
        ...s,
        board,
        currentTurn: nextTurn,
        status: winnerId ? 'finished' : 'playing',
        winnerId: winnerId || undefined,
        updatedAt: new Date().toISOString(),
      } as GameSession;
    });
    saveSessions(allS);
    refresh();
  };

  // ---- Active game view ----
  if (activeSession) {
    const props = {
      session: activeSession,
      myId,
      onUpdate: (board: any, nextTurn: string, winnerId?: string) =>
        handleGameUpdate(activeSession.id, board, nextTurn, winnerId),
    };
    const GameComponent = activeSession.game === 'morpion' ? Morpion
      : activeSession.game === 'connect4' ? Connect4
      : Battleship;
    const opponent = activeSession.player1Id === myId
      ? { name: activeSession.player2Name, color: activeSession.player2Color, id: activeSession.player2Id }
      : { name: activeSession.player1Name, color: activeSession.player1Color, id: activeSession.player1Id };

    return (
      <div className="h-full overflow-y-auto p-4 md:p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveSessionId(null)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </button>
          <Gamepad2 size={20} className="text-bony-orange" />
          <h2 className="font-bold text-lg">{GAME_LABELS[activeSession.game]}</h2>
          <span className="text-bony-text/50 text-sm">vs {opponent.name}</span>
          {activeSession.status === 'finished' && (
            <span className={`ml-auto text-sm font-semibold flex items-center gap-1 ${
              activeSession.winnerId === 'draw' ? 'text-yellow-400' :
              activeSession.winnerId === myId ? 'text-green-400' : 'text-red-400'
            }`}>
              <Trophy size={14} />
              {activeSession.winnerId === 'draw' ? 'Match nul' : activeSession.winnerId === myId ? 'Victoire' : 'Défaite'}
            </span>
          )}
        </div>
        <div className="flex-1 flex items-start justify-center pt-4">
          <GameComponent {...props} />
        </div>
      </div>
    );
  }

  // ---- Tabs layout ----
  const pendingCount = myPendingReceived.length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 md:px-6 pt-4 pb-3 border-b border-bony-border shrink-0">
        <Gamepad2 size={22} className="text-bony-orange" />
        <h1 className="text-xl font-bold font-title">Jeux</h1>
        {pendingCount > 0 && (
          <span className="ml-1 px-2 py-0.5 bg-bony-orange text-black text-xs font-bold rounded-full">
            {pendingCount} défi{pendingCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 px-4 md:px-6 border-b border-bony-border shrink-0 overflow-x-auto scrollbar-none">
        {PAGE_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setPageTab(tab.id)}
            className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
              pageTab === tab.id
                ? 'border-bony-orange text-bony-orange'
                : 'border-transparent text-bony-text/50 hover:text-bony-text'
            }`}
          >
            {tab.icon && <span className="mr-1">{tab.icon}</span>}
            {tab.label}
            {tab.id === 'lobby' && pendingCount > 0 && (
              <span className="ml-1.5 w-4 h-4 bg-bony-orange text-black text-[9px] font-bold rounded-full inline-flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* ---- LOBBY ---- */}
        {pageTab === 'lobby' && (
          <div className="flex flex-col gap-6">
            {/* Incoming challenges */}
            {myPendingReceived.length > 0 && (
              <div className="bg-bony-orange/10 border border-bony-orange/30 rounded-xl p-4 flex flex-col gap-3">
                <p className="text-bony-orange font-semibold text-sm flex items-center gap-2">
                  <Swords size={16} /> {myPendingReceived.length} défi{myPendingReceived.length > 1 ? 's' : ''} reçu{myPendingReceived.length > 1 ? 's' : ''}
                </p>
                {myPendingReceived.map(c => (
                  <div key={c.id} className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                    <Avatar userId={c.fromUserId} name={c.fromUserName} color={c.fromUserColor} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{c.fromUserName}</p>
                      <p className="text-bony-text/50 text-xs">{GAME_ICONS[c.game]} {GAME_LABELS[c.game]}</p>
                    </div>
                    <button onClick={() => refuseChallenge(c.id)} className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors" title="Refuser">
                      <X size={16} />
                    </button>
                    <button onClick={() => acceptChallenge(c)} className="p-2 hover:bg-green-500/20 text-green-400 rounded-lg transition-colors" title="Accepter">
                      <Check size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Active sessions */}
            {mySessions.filter(s => s.status === 'playing').length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-bony-text/50 uppercase tracking-widest font-semibold">Parties en cours</p>
                {mySessions.filter(s => s.status === 'playing').map(s => {
                  const opp = s.player1Id === myId ? s.player2Name : s.player1Name;
                  const myTurn = s.currentTurn === myId;
                  return (
                    <button key={s.id} onClick={() => setActiveSessionId(s.id)}
                      className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 transition-colors text-left">
                      <span className="text-xl">{GAME_ICONS[s.game]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{GAME_LABELS[s.game]} vs {opp}</p>
                        <p className={`text-xs ${myTurn ? 'text-bony-orange' : 'text-bony-text/40'}`}>
                          {myTurn ? 'À vous de jouer !' : 'En attente…'}
                        </p>
                      </div>
                      <span className="text-bony-text/40 text-xs">Reprendre →</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Challenge a user */}
            <div className="flex flex-col gap-3">
              <p className="text-xs text-bony-text/50 uppercase tracking-widest font-semibold">
                <Users size={11} className="inline mr-1" />Défier un utilisateur
              </p>
              {challengingUserId ? (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                  <p className="text-sm font-medium">Choisissez un jeu :</p>
                  <div className="flex gap-2 flex-wrap">
                    {(['morpion', 'connect4', 'battleship'] as GameType[]).map(g => (
                      <button key={g} onClick={() => setSelectedGame(g)}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          selectedGame === g ? 'bg-bony-orange text-black border-bony-orange' : 'border-white/10 hover:border-white/30'
                        }`}>
                        {GAME_ICONS[g]} {GAME_LABELS[g]}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => sendChallenge(challengingUserId)}
                      className="flex-1 py-2 bg-bony-orange text-black font-bold rounded-lg hover:bg-bony-orange/80 transition-colors text-sm">
                      Envoyer le défi
                    </button>
                    <button onClick={() => setChallengingUserId(null)}
                      className="px-4 py-2 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-sm">
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {otherUsers.map(u => {
                    const hasPendingSent = myPendingSent.some(c => c.toUserId === u.id);
                    const hasActiveSession = mySessions.some(s =>
                      s.status === 'playing' && (s.player1Id === u.id || s.player2Id === u.id)
                    );
                    return (
                      <div key={u.id} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
                        <Avatar userId={u.id} name={u.name} color={u.avatarColor} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{u.name}</p>
                          <p className="text-bony-text/40 text-xs">{u.role}</p>
                        </div>
                        {hasActiveSession ? (
                          <span className="text-xs text-bony-orange">En cours</span>
                        ) : hasPendingSent ? (
                          <span className="text-xs text-bony-text/40 flex items-center gap-1">
                            <RefreshCw size={10} className="animate-spin" /> Envoyé
                          </span>
                        ) : (
                          <button onClick={() => setChallengingUserId(u.id)}
                            className="px-3 py-1 text-xs border border-bony-orange/40 text-bony-orange rounded-lg hover:bg-bony-orange/10 transition-colors">
                            <Swords size={12} className="inline mr-1" />Défier
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Finished sessions */}
            {mySessions.filter(s => s.status === 'finished').length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-bony-text/50 uppercase tracking-widest font-semibold">Mes dernières parties</p>
                {mySessions.filter(s => s.status === 'finished').slice(-10).reverse().map(s => {
                  const opp = s.player1Id === myId ? s.player2Name : s.player1Name;
                  const won = s.winnerId === myId;
                  const draw = s.winnerId === 'draw';
                  return (
                    <button key={s.id} onClick={() => setActiveSessionId(s.id)}
                      className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 transition-colors text-left">
                      <span className="text-xl">{GAME_ICONS[s.game]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{GAME_LABELS[s.game]} vs {opp}</p>
                        <p className="text-[10px] text-bony-text/30">{relativeTime(s.updatedAt)}</p>
                      </div>
                      <span className={`text-xs font-semibold ${won ? 'text-green-400' : draw ? 'text-yellow-400' : 'text-red-400'}`}>
                        {draw ? 'Nul' : won ? 'Victoire' : 'Défaite'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---- GAME STATS TABS ---- */}
        {(pageTab === 'morpion' || pageTab === 'connect4' || pageTab === 'battleship') && (
          <GameStatsTab
            game={pageTab as GameType}
            sessions={sessions}
            myId={myId}
            onResume={setActiveSessionId}
          />
        )}

        {/* ---- GLOBAL STATS ---- */}
        {pageTab === 'global' && (
          <GlobalStatsTab
            sessions={sessions}
            users={users}
            myId={myId}
            onResume={setActiveSessionId}
          />
        )}
      </div>
    </div>
  );
};

export default Games;
