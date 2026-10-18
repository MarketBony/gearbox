import React, { useEffect, useRef, useState } from 'react';
import type { GameSession, MoveFeedback } from '../../../../components/games/gameTypes';
import { hud } from '../../ui/kit';
import { CSS_BOWLING } from './style';
import { monterBowling } from './jeu';
import URL_LOGO_BLANC from './assets/logo-bony-white.svg?url';
import URL_LOGO_COULEUR from './assets/logo-bony-color.svg?url';

/**
 * Bowling 3D (v2) — 5e jeu de la rubrique. CHARGÉ À LA DEMANDE (React.lazy dans GamesApp) : three.js, le rendu, le son
 * et le Worker de physique (Rapier) n'alourdissent pas le bundle principal.
 *
 * Deux usages :
 *  - DUEL (`s` fourni) : partie contre un collègue. Le geste devient un lancer { position, angle, vitesse, effet, lacher }
 *    envoyé par `onMove` ; le serveur le rejoue (backend/src/games/bowlingRules.ts) et son plateau fait foi.
 *  - ENTRAÎNEMENT (`s` absent) : le prototype validé, en local — aucun serveur, aucune écriture.
 * Tout (WebGL, AudioContext, Worker, écouteurs) est libéré quand le composant est démonté (fenêtre fermée, retour au lobby).
 *
 * Le HUD est du HTML hors React (repris tel quel du prototype, piloté par jeu.ts) : React ne gère que le montage.
 */
const HUD = `
<canvas id="scene" aria-label="Piste de bowling"></canvas>
<div class="hud" id="haut">
  <div id="marque"><img id="logo" src="${URL_LOGO_BLANC}" alt="Bony auto-mobile"><span class="titre">bowling</span></div>
  <div id="reglages" class="clic">
    <div class="groupe" role="group" aria-label="Thème" data-groupe="theme">
      <button data-theme="bony" class="actif">Bony auto-mobile</button><button data-theme="cgt">Grève CGT</button>
    </div>
    <div class="groupe" role="group" aria-label="Joueurs" data-groupe="joueurs">
      <button data-joueurs="1" class="actif">1 joueur</button><button data-joueurs="2">2 joueurs</button>
    </div>
    <div class="groupe" role="group" aria-label="Frames" data-groupe="frames">
      <button data-frames="10" class="actif">10 frames</button><button data-frames="5">5 frames</button>
    </div>
    <div class="groupe"><button id="bSon" class="seul" aria-pressed="false"></button></div>
    <div class="groupe" data-groupe="nouvelle"><button id="bNouvelle">Nouvelle partie</button></div>
  </div>
</div>
<div class="hud" id="feuille"></div>
<div class="hud" id="etat">
  <svg id="schema" viewBox="0 0 86 78" aria-label="Quilles debout"></svg>
  <div class="infos"><div class="qui" id="qui"></div><div class="ou" id="ou"></div><div class="reste" id="reste">10 quilles debout</div></div>
</div>
<div class="hud" id="bas">
  <div id="pave" class="clic">
    <button data-pas="-1" title="Se décaler à gauche (←)" aria-label="Se décaler à gauche"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
    <button data-pas="1" title="Se décaler à droite (→)" aria-label="Se décaler à droite"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>
    <div class="lecture" id="lectureVisee"></div>
    <button data-vise="-1" title="Viser plus à gauche (Maj + ← ou molette)" aria-label="Viser plus à gauche"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7H5V3"/><path d="M5.6 7A8 8 0 1 1 4 12"/></svg></button>
    <button data-vise="1" title="Viser plus à droite (Maj + → ou molette)" aria-label="Viser plus à droite"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7h4V3"/><path d="M18.4 7A8 8 0 1 0 20 12"/></svg></button>
  </div>
  <div id="aide"></div>
</div>
<div class="hud" id="jauge"><div></div></div>
<div class="hud" id="retour"></div>
<div class="hud" id="annonce"><div class="gros"></div><div class="petit"></div></div>
<div class="hud" id="fin"><div class="boite clic">
  <img id="finLogo" src="${URL_LOGO_COULEUR}" alt="">
  <h2 id="finTitre">partie terminée</h2>
  <div class="vainqueur" id="finVainqueur"></div>
  <div class="scores" id="finScores"></div>
  <button id="bRejouer">Rejouer</button>
  <div class="signature" id="finSignature">Génération auto-mobile</div>
</div></div>
<div id="chargement">
  <div class="boite">
    <img src="${URL_LOGO_BLANC}" alt="Bony auto-mobile">
    <div class="titre">bowling</div>
    <div class="barre"><div id="chBarre"></div></div>
    <div class="etape" id="chEtape">Préparation de la salle…</div>
    <div class="erreur" id="chErreur"></div>
  </div>
</div>`;

type Ctx = { board: any; tour: 'p1' | 'p2' | null; fini: boolean; gagnant?: string };
const ctxDe = (s: GameSession): Ctx => ({
  board: s.board,
  tour: s.status === 'playing' ? (s.currentTurn === s.player1Id ? 'p1' : 'p2') : null,
  fini: s.status === 'finished',
  gagnant: !s.winnerId ? undefined : s.winnerId === 'draw' ? 'draw' : s.winnerId === s.player1Id ? 'p1' : 'p2',
});

type Props = {
  /** Partie en duel ; absent = entraînement local. */
  s?: GameSession;
  onMove?: (m: any) => Promise<MoveFeedback & { error?: string }>;
  nomDe?: (id: string) => string;
  onQuit: () => void;
  /** Entraînement : thème choisi dans le lobby. */
  theme?: 'bony' | 'cgt';
};

const Bowling: React.FC<Props> = ({ s, onMove, nomDe, onQuit, theme }) => {
  const hote = useRef<HTMLDivElement>(null);
  const jeu = useRef<any>(null);
  const dernier = useRef<Ctx | null>(s ? ctxDe(s) : null);
  const onMoveRef = useRef(onMove); onMoveRef.current = onMove;
  const onQuitRef = useRef(onQuit); onQuitRef.current = onQuit;
  const [erreur, setErreur] = useState('');
  const cle = s?.id ?? 'solo';

  useEffect(() => {
    const el = hote.current; if (!el) return;
    el.innerHTML = HUD;
    let fini = false;
    const cfg = s?.board?.cfg;
    monterBowling(el, s ? {
      mode: 'duel',
      theme: cfg?.theme === 'cgt' ? 'cgt' : 'bony',
      frames: Number(cfg?.frames) === 5 ? 5 : 10,
      moi: s.myRole,
      noms: [s.player1Id, s.player2Id].map((id) => (nomDe ? nomDe(id) : 'Joueur').split(' ')[0]),
      initial: dernier.current,
      jouer: (l: any) => (onMoveRef.current ? onMoveRef.current(l) : Promise.resolve({ error: 'Partie indisponible.' })),
      quitter: () => onQuitRef.current(),
      erreur: (m: string) => hud(m),
    } : {
      mode: 'solo', theme: theme === 'cgt' ? 'cgt' : 'bony', frames: 10,
      quitter: () => onQuitRef.current(), erreur: (m: string) => hud(m),
    }).then((j: any) => {
      if (!j) return;
      if (fini) { j.detruire(); return; }
      jeu.current = j;
      if (dernier.current) j.maj(dernier.current); // une mise à jour a pu arriver pendant le chargement
    }).catch((e: unknown) => { if (!fini) setErreur(e instanceof Error ? e.message : String(e)); });
    return () => { fini = true; jeu.current?.detruire(); jeu.current = null; el.innerHTML = ''; };
  }, [cle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chaque nouvelle vue de la partie (coup joué, abandon, fin) : le jeu décide quand l'appliquer (après l'animation).
  useEffect(() => {
    if (!s) return;
    const c = ctxDe(s); dernier.current = c;
    jeu.current?.maj(c);
  }, [s?.board, s?.currentTurn, s?.status, s?.winnerId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <style>{CSS_BOWLING}</style>
      <div ref={hote} className="bw-jeu visee" data-theme={s?.board?.cfg?.theme === 'cgt' || (!s && theme === 'cgt') ? 'cgt' : 'bony'} tabIndex={0} style={{ flex: 1 }} />
      {erreur ? <div className="gme-empty" style={{ position: 'absolute', inset: 'auto 16px 16px', color: 'var(--danger)' }}>Le bowling n’a pas pu démarrer : {erreur}</div> : null}
    </div>
  );
};
export default Bowling;
