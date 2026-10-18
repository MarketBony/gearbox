// ============================================================================
// BOWLING — règles côté serveur (même principe que minigolfRules.ts : le client propose, le serveur décide).
//
// Le navigateur envoie SEULEMENT le geste traduit en lancer : { position, angle, vitesse, effet, lacher }.
// Le serveur SIMULE le lancer avec le moteur partagé (games/bowling/physique.ts, copie de shared/bowling/) sur
// les quilles debout de SON plateau, en tire le nombre de quilles tombées, les quilles restantes (positions
// réelles), applique le score officiel (games/bowling/regles.ts), l'alternance et le vainqueur.
//
// Ce qui est STOCKÉ (léger, aucune image) : les lancers de chaque joueur (quilles tombées), les quilles debout
// pour le prochain lancer, et le DERNIER lancer (entrées du moteur + quilles debout AVANT) : l'adversaire le
// re-simule chez lui avec le même moteur pour voir l'animation — même résultat au bit près, garanti par le
// déterminisme de Rapier (paquet « deterministic », version exacte des deux côtés).
// L'auteur du lancer, lui, simule localement en parallèle (animation immédiate) et contrôle que son résultat est
// celui du serveur ; en cas d'écart (qui ne devrait jamais arriver), c'est le plateau du serveur qui fait foi.
//
// Règles (prototype validé par Théo, 17/10/2026) : chacun joue une FRAME entière (1 ou 2 lancers, 3 à la
// dernière en cas de strike ou spare), puis la main passe ; 5 ou 10 frames ; le plus gros total gagne
// (égalité = match nul).
// ============================================================================
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { emplacements, initPhysique, simuler } from './bowling/physique';
import { position, tableau } from './bowling/regles';
import { IllegalMoveError } from '../utils/gameRules';

export type Marque = 'p1' | 'p2';
export interface OptionsBowling { theme: 'bony' | 'cgt'; frames: 5 | 10 }
export interface Quille { n: number; x: number; z: number; rot: number }
export interface LancerBowling { position: number; angle: number; vitesse: number; effet: number; lacher: number }
export interface PlateauBowling {
  cfg: OptionsBowling;
  /** Thème recopié à plat : c'est la clé que lisent applyMove et le cadre des autres jeux. */
  theme: 'bony' | 'cgt';
  /** Quilles tombées à chaque lancer, par joueur (entrée de `tableau` / `position`). */
  lancers: Record<Marque, number[]>;
  /** Quilles debout pour le PROCHAIN lancer (positions réelles : une quille poussée sans tomber reste où elle est). */
  debout: Quille[];
  /** Nombre de lancers joués dans la partie (sert au client à reconnaître un lancer qu'il n'a pas encore vu). */
  n: number;
  /** Le dernier lancer, pour que l'adversaire le rejoue : entrées du moteur + quilles debout AVANT + résultat. */
  dernier: null | { n: number; joueur: Marque; lancer: LancerBowling; debout: Quille[]; tombees: number; restent: number[]; gouttiere: boolean };
}

const THEMES_OK = ['bony', 'cgt'];
/** Options choisies par celui qui lance le défi. Tout ce qui n'est pas reconnu prend la valeur par défaut. */
export const lireOptionsBowling = (o: any): OptionsBowling => ({
  theme: THEMES_OK.includes(o?.theme) ? o.theme : 'bony',
  frames: Number(o?.frames) === 5 ? 5 : 10,
});

/** Les 10 quilles sur leurs emplacements (même construction que le client : RACK de jeu.ts). */
const rack = (): Quille[] => emplacements().map(({ n, x, z }: any) => ({ n, x, z, rot: 0 }));

export const plateauInitialBowling = (options: any): PlateauBowling => {
  const cfg = lireOptionsBowling(options);
  return { cfg, theme: cfg.theme, lancers: { p1: [], p2: [] }, debout: rack(), n: 0, dernier: null };
};

// ---- Rapier : chargé UNE fois, à la première partie de bowling (pas au démarrage du serveur) ----------------
let chargement: Promise<unknown> | null = null;
export const assurerPhysiqueBowling = () => {
  if (!chargement) chargement = initPhysique(RAPIER).catch((e: unknown) => { chargement = null; throw e; });
  return chargement;
};

// ---- Validation du geste : bornes du contrat (CONTRAT.md), nombres finis, rien d'autre n'est lu ------------
const BORNES: Record<keyof LancerBowling, [number, number]> = {
  position: [-0.45, 0.45], angle: [-0.08, 0.08], vitesse: [3, 10.5], effet: [-1, 1], lacher: [0, 1],
};
export const lireLancer = (m: any): LancerBowling => {
  const out: any = {};
  for (const k of Object.keys(BORNES) as (keyof LancerBowling)[]) {
    const brut = m?.[k] === undefined && k === 'lacher' ? 1 : m?.[k];
    const v = typeof brut === 'number' ? brut : NaN;
    const [a, b] = BORNES[k];
    if (!Number.isFinite(v) || v < a || v > b) throw new IllegalMoveError('Lancer invalide.');
    out[k] = v;
  }
  return out as LancerBowling;
};

/** Quille debout telle qu'elle sera STOCKÉE : arrondie comme le moteur (1e-5) et sans « -0 » (le JSON le perd). */
const propre = (v: number) => Math.round(v * 1e5) / 1e5 + 0;

interface Session { player1Id: string; player2Id: string; board: any }
/** ⚠️ Appeler `assurerPhysiqueBowling()` avant (realtime/games.ts) : la simulation est synchrone. */
export const appliquerLancerBowling = (session: Session, marque: Marque, move: any) => {
  const b: PlateauBowling = JSON.parse(JSON.stringify(session.board));
  const nf = b.cfg.frames;
  if (position(b.lancers[marque], nf).fini) throw new IllegalMoveError('Votre partie est terminée.');
  const lancer = lireLancer(move);

  // Le serveur fait foi : simulation SUR SES quilles debout, en mode léger (sans images : même résultat, plus vite).
  const avant = b.debout.map(({ n, x, z, rot }) => ({ n, x, z, rot }));
  const res = simuler(avant, lancer, { leger: true });
  const restent: Quille[] = res.restent.map((q: any) => ({ n: q.n, x: propre(q.x), z: propre(q.z), rot: propre(q.rot) }));

  const posAvant = position(b.lancers[marque], nf);
  b.lancers[marque].push(res.tombees);
  b.n += 1;
  b.dernier = { n: b.n, joueur: marque, lancer, debout: avant, tombees: res.tombees, restent: restent.map((q) => q.n), gouttiere: !!res.gouttiere };

  // Qui joue ensuite, et sur quelles quilles (même enchaînement que suite() du prototype) ?
  const apres = position(b.lancers[marque], nf);
  let prochain: Marque | null = marque;
  if (apres.fini || apres.frame !== posAvant.frame) {
    const autre: Marque = marque === 'p1' ? 'p2' : 'p1';
    prochain = [autre, marque].find((m) => !position(b.lancers[m], nf).fini) ?? null;
  }
  const idDe = (m: Marque) => (m === 'p1' ? session.player1Id : session.player2Id);
  if (!prochain) {
    const t1 = tableau(b.lancers.p1, nf).total, t2 = tableau(b.lancers.p2, nf).total;
    b.debout = rack();
    return { board: b, nextTurn: idDe(marque), status: 'finished' as const, winnerId: t1 === t2 ? 'draw' : t1 > t2 ? session.player1Id : session.player2Id };
  }
  const pos = position(b.lancers[prochain], nf);
  b.debout = pos.rack ? rack() : restent;
  return { board: b, nextTurn: idDe(prochain), status: 'playing' as const };
};
