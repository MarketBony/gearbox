// ============================================================================
// MINIGOLF — règles côté serveur (même principe que gameRules.ts : le client propose, le serveur décide).
//
// Le navigateur envoie seulement { angle, puissance, horloge } ; le serveur SIMULE le coup avec le moteur
// partagé (games/minigolf.ts, copie de shared/minigolf.ts) et en tire la nouvelle position des balles, le
// nombre de coups, le trou suivant et le vainqueur. Le navigateur rejoue la trajectoire pour l'animation,
// mais la position finale affichée est toujours celle du plateau renvoyé ici.
//
// Règles (celles du prototype validé par Théo, 15/10/2026) :
//  - on joue À TOUR DE RÔLE, coup par coup ; celui qui a rentré sa balle laisse la main ;
//  - balle à l'eau : elle revient à sa place, 1 coup de pénalité ;
//  - au-delà de par + 4 coups, la balle est ramassée (score = par + 4) ;
//  - au trou suivant, l'honneur : celui qui a le mieux joué commence ;
//  - fin de partie : le plus petit total gagne (égalité = match nul).
// ============================================================================
import { DIFFS, MAX_COUPS, TROUS, TROU_PAR_ID, simuler } from './minigolf';
import { IllegalMoveError } from '../utils/gameRules';

export type Marque = 'p1' | 'p2';
export interface OptionsMinigolf { diff: 'facile' | 'normal' | 'expert'; nb: 3 | 6 | 9; amb: 'ete' | 'mer' | 'nuit' | 'manif'; choc: boolean }
export interface BalleMg { x: number; y: number; dedans: boolean; pose: boolean }
export interface PlateauMinigolf {
  cfg: OptionsMinigolf;
  trous: string[];
  i: number;
  horloge: number;
  balles: Record<Marque, BalleMg>;
  enCours: Record<Marque, number>;
  fini: Record<Marque, boolean>;
  coups: Record<Marque, number[]>;
  ordre: Marque[];
  /** Le dernier coup, pour que l'adversaire le voie rejoué : entrées du moteur + état AVANT le coup. */
  dernier: null | { joueur: Marque; i: number; angle: number; puissance: number; horloge: number; avant: Record<Marque, BalleMg>; eau: number; rentre: boolean; ramasse: boolean };
}

const DIFF_OK = ['facile', 'normal', 'expert'], AMB_OK = ['ete', 'mer', 'nuit', 'manif'];
/** Options choisies par celui qui lance le défi (pré-lobby). Tout ce qui n'est pas reconnu prend la valeur par défaut. */
export const lireOptions = (o: any): OptionsMinigolf => ({
  diff: DIFF_OK.includes(o?.diff) ? o.diff : 'normal',
  nb: [3, 6, 9].includes(Number(o?.nb)) ? (Number(o.nb) as 3 | 6 | 9) : 6,
  amb: AMB_OK.includes(o?.amb) ? o.amb : 'ete',
  choc: o?.choc !== false,
});

const melanger = <T,>(a: T[]) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
/** Tirage des trous selon la difficulté : la difficulté choisie d'abord, complétée par la suivante si besoin. */
export const tirerTrous = (diff: OptionsMinigolf['diff'], nb: number): string[] => {
  const tiers: string[] = DIFFS[diff].tirage;
  let pool = melanger(TROUS.filter((h: any) => h.diff === tiers[0]));
  if (pool.length < nb && tiers[1]) pool = pool.concat(melanger(TROUS.filter((h: any) => h.diff === tiers[1])));
  if (pool.length < nb) pool = pool.concat(melanger(TROUS.filter((h: any) => !pool.includes(h))));
  return pool.slice(0, nb).map((h: any) => h.id);
};

const ballesDepart = (id: string): Record<Marque, BalleMg> => {
  const h = TROU_PAR_ID[id];
  return { p1: { x: h.depart[0], y: h.depart[1], dedans: false, pose: false }, p2: { x: h.depart[0], y: h.depart[1], dedans: false, pose: false } };
};
export const plateauInitial = (options: any): PlateauMinigolf => {
  const cfg = lireOptions(options), trous = tirerTrous(cfg.diff, cfg.nb);
  return { cfg, trous, i: 0, horloge: 0, balles: ballesDepart(trous[0]), enCours: { p1: 0, p2: 0 }, fini: { p1: false, p2: false }, coups: { p1: [], p2: [] }, ordre: ['p1', 'p2'], dernier: null };
};

interface Session { player1Id: string; player2Id: string; board: any }
export const appliquerCoupMinigolf = (session: Session, marque: Marque, move: any) => {
  const b: PlateauMinigolf = JSON.parse(JSON.stringify(session.board));
  const angle = Number(move?.angle), puissance = Number(move?.puissance), horloge = Number(move?.horloge);
  if (!Number.isFinite(angle) || !Number.isFinite(puissance) || puissance <= 0 || puissance > 1) throw new IllegalMoveError('Coup invalide.');
  // L'horloge fait tourner les obstacles (moulins, portes) : on accepte l'instant du lâcher choisi par le joueur,
  // pourvu qu'il ne remonte pas le temps et reste dans l'heure.
  if (!Number.isFinite(horloge) || horloge < b.horloge - 0.001 || horloge > b.horloge + 3600) throw new IllegalMoveError('Horloge invalide.');
  if (b.fini[marque]) throw new IllegalMoveError('Votre balle est déjà dans le trou.');
  const h = TROU_PAR_ID[b.trous[b.i]];
  if (!h) throw new IllegalMoveError('Trou inconnu.');
  const ordre: Marque[] = ['p1', 'p2'], idx = ordre.indexOf(marque);
  const avant = JSON.parse(JSON.stringify(b.balles));
  // Une balle pas encore posée (l'adversaire n'a pas joué ce trou) n'est pas sur la piste.
  const etat = { balles: ordre.map((m) => ({ x: b.balles[m].x, y: b.balles[m].y, dedans: b.balles[m].dedans || b.fini[m] || (!b.balles[m].pose && m !== marque) })), horloge };
  const res = simuler(h, etat, { balle: idx, angle, puissance }, { choc: b.cfg.choc });
  b.balles[marque].pose = true;
  ordre.forEach((m, i) => {
    if (!b.balles[m].pose) return;
    const f = res.final.balles[i];
    b.balles[m].x = f.x; b.balles[m].y = f.y;
    if (f.dedans && !b.balles[m].dedans) { b.balles[m].dedans = true; b.fini[m] = true; }
  });
  b.enCours[marque] += 1 + res.eau;
  let ramasse = false;
  ordre.forEach((m) => { if (!b.fini[m] && b.enCours[m] >= MAX_COUPS(h)) { b.fini[m] = true; b.enCours[m] = MAX_COUPS(h); if (m === marque) ramasse = true; } });
  b.horloge = res.final.horloge;
  b.dernier = { joueur: marque, i: b.i, angle, puissance, horloge, avant, eau: res.eau, rentre: b.balles[marque].dedans, ramasse };

  const idDe = (m: Marque) => (m === 'p1' ? session.player1Id : session.player2Id);
  const autre: Marque = marque === 'p1' ? 'p2' : 'p1';
  if (!(b.fini.p1 && b.fini.p2)) {
    return { board: b, nextTurn: idDe(b.fini[autre] ? marque : autre), status: 'playing' as const };
  }
  // Trou terminé : on inscrit les scores, puis trou suivant ou fin de partie.
  ordre.forEach((m) => b.coups[m].push(b.enCours[m]));
  if (b.i + 1 >= b.trous.length) {
    const t1 = b.coups.p1.reduce((x, y) => x + y, 0), t2 = b.coups.p2.reduce((x, y) => x + y, 0);
    return { board: b, nextTurn: idDe(marque), status: 'finished' as const, winnerId: t1 === t2 ? 'draw' : t1 < t2 ? session.player1Id : session.player2Id };
  }
  const s1 = b.coups.p1[b.i], s2 = b.coups.p2[b.i];
  b.ordre = s1 === s2 ? b.ordre : s1 < s2 ? ['p1', 'p2'] : ['p2', 'p1'];
  b.i++; b.horloge = 0; b.balles = ballesDepart(b.trous[b.i]); b.enCours = { p1: 0, p2: 0 }; b.fini = { p1: false, p2: false };
  return { board: b, nextTurn: idDe(b.ordre[0]), status: 'playing' as const };
};
