// Feuille de style du bowling — reprise de maquettes/jeux/bowling/index.html (charte Bony auto-mobile / Grève CGT),
// portée dans la fenêtre v2 : tout est préfixé par `.bw-jeu`, `fixed` → `absolute`, et les règles d'écran (vw,
// @media) deviennent des règles de CONTENEUR (cqw, @container) : c'est la taille de la fenêtre qui compte.
export const CSS_BOWLING = `
  /* ---------------------------------------------------------------- charte : Bony auto-mobile (défaut) */
  .bw-jeu {
    --orange: #f75632; --violet: #8f12ab; --nuit: #293f74; --nuit-fonce: #1a2a52; --noir: #000;
    --deg: linear-gradient(90deg, #f75632 0%, #8f12ab 100%);
    --panneau: rgba(20, 31, 64, .86); --panneau-bord: rgba(255, 255, 255, .14);
    --carte: #ffffff; --carte-texte: #293f74; --carte-trait: #dfe4ef; --carte-pale: #f3f5fa;
    --accent: #f75632; --accent2: #8f12ab;
    --titre: 'Syncopate', 'Arial Black', Arial, sans-serif; --texte: 'Albert Sans', Arial, sans-serif;
    --case: clamp(30px, 3.3cqw, 52px);
  }
  /* ---------------------------------------------------------------- thème Grève CGT */
  .bw-jeu[data-theme="cgt"] {
    --deg: linear-gradient(90deg, #e3001b 0%, #b30015 100%);
    --panneau: rgba(40, 8, 12, .88); --panneau-bord: rgba(255, 255, 255, .2);
    --carte-texte: #2b2d31; --carte-trait: #f0d6d9; --carte-pale: #fbf1f2;
    --accent: #e3001b; --accent2: #e3001b; --nuit: #b30015; --nuit-fonce: #8f0010;
    --titre: 'Bowlby One SC', Impact, 'Arial Black', sans-serif;
  }
  .bw-jeu * { box-sizing: border-box; }
  .bw-jeu { position: relative; height: 100%; min-height: 420px; overflow: hidden; background: #0d1328; color: #fff; font-family: var(--texte); -webkit-user-select: none; user-select: none; container: bw / size; outline: none; }
  .bw-jeu #scene { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
  .bw-jeu.geste #scene { cursor: grabbing; }
  .bw-jeu .hud { position: absolute; pointer-events: none; z-index: 2; }
  .bw-jeu .hud .clic { pointer-events: auto; }
  .bw-jeu button { font: 600 13px var(--texte); color: inherit; cursor: pointer; }

  /* ---------------------------------------------------------------- bandeau du haut : marque + réglages */
  .bw-jeu #haut { left: 12px; right: 12px; top: 10px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .bw-jeu #marque { display: flex; align-items: center; gap: 12px; background: var(--panneau); border: 1px solid var(--panneau-bord); border-radius: 14px; padding: 8px 14px; }
  .bw-jeu #marque img { height: 26px; width: auto; display: block; }
  .bw-jeu[data-theme="cgt"] #marque img { height: 34px; }
  .bw-jeu #marque .titre { font: 700 13px var(--titre); letter-spacing: .5px; text-transform: lowercase; background: var(--deg); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .bw-jeu[data-theme="cgt"] #marque .titre { text-transform: uppercase; color: #fff; background: none; font-size: 15px; letter-spacing: .3px; }
  .bw-jeu #reglages { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; max-width: 70cqw; }
  .bw-jeu .groupe { display: flex; background: var(--panneau); border: 1px solid var(--panneau-bord); border-radius: 999px; padding: 3px; }
  .bw-jeu .groupe button { border: 0; background: transparent; border-radius: 999px; padding: 6px 12px; white-space: nowrap; color: rgba(255,255,255,.82); }
  .bw-jeu .groupe button:hover { color: #fff; background: rgba(255,255,255,.08); }
  .bw-jeu .groupe button.actif { background: var(--deg); color: #fff; }
  .bw-jeu .groupe button.seul { display: flex; align-items: center; gap: 6px; }
  .bw-jeu .groupe svg { width: 16px; height: 16px; display: block; }

  /* ---------------------------------------------------------------- feuille de score */
  .bw-jeu #feuille { left: 50%; top: 64px; transform: translateX(-50%); display: grid; gap: 4px; }
  .bw-jeu .ligne { display: flex; align-items: stretch; background: var(--carte); color: var(--carte-texte); border-radius: 10px; overflow: hidden; box-shadow: 0 6px 18px rgba(0,0,0,.28); opacity: .8; transition: opacity .25s, transform .25s; }
  .bw-jeu .ligne.actif { opacity: 1; transform: scale(1.0); box-shadow: 0 0 0 2px var(--accent), 0 8px 22px rgba(0,0,0,.35); }
  .bw-jeu .ligne .nom { width: calc(var(--case) * 2.3); display: flex; align-items: center; gap: 6px; padding: 0 10px; font-weight: 800; font-size: clamp(11px, 1cqw, 15px); background: var(--nuit); color: #fff; white-space: nowrap; }
  .bw-jeu .ligne.actif .nom { background: var(--deg); }
  .bw-jeu .ligne .nom i { width: 8px; height: 8px; border-radius: 50%; background: #fff; opacity: 0; flex: none; }
  .bw-jeu .ligne.actif .nom i { opacity: 1; animation: bw-pouls 1.2s ease-in-out infinite; }
  @keyframes bw-pouls { 50% { transform: scale(.55); } }
  .bw-jeu .fr { width: var(--case); border-left: 1px solid var(--carte-trait); display: flex; flex-direction: column; }
  .bw-jeu .fr.der { width: calc(var(--case) * 1.5); }
  .bw-jeu .fr .num { font-size: 10px; font-weight: 600; text-align: center; color: #fff; background: var(--nuit-fonce); line-height: 15px; opacity: .85; }
  .bw-jeu .fr .ls { display: flex; justify-content: flex-end; height: calc(var(--case) * .44); }
  .bw-jeu .fr .ls span { width: calc(var(--case) * .46); border-left: 1px solid var(--carte-trait); border-bottom: 1px solid var(--carte-trait); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: clamp(11px, 1cqw, 15px); }
  .bw-jeu .fr.der .ls span { width: calc(var(--case) * .5); }
  .bw-jeu .fr .ls span.x { color: var(--accent); }
  .bw-jeu .fr .ls span.sp { color: var(--accent2); }
  .bw-jeu .fr .cu { flex: 1; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: clamp(13px, 1.25cqw, 19px); min-height: calc(var(--case) * .48); }
  .bw-jeu .fr.cour { background: var(--carte-pale); box-shadow: inset 0 -3px 0 var(--accent); }
  .bw-jeu .ligne .tot { width: calc(var(--case) * 1.35); display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--nuit); color: #fff; font-weight: 800; font-size: clamp(16px, 1.6cqw, 24px); border-left: 1px solid var(--carte-trait); }
  .bw-jeu .ligne .tot small { font-size: 9px; font-weight: 600; opacity: .7; text-transform: uppercase; letter-spacing: .6px; }

  /* ---------------------------------------------------------------- bas gauche : quilles restantes, frame, joueur */
  .bw-jeu #etat { left: 12px; bottom: 12px; display: flex; gap: 12px; align-items: center; background: var(--panneau); border: 1px solid var(--panneau-bord); border-radius: 16px; padding: 10px 14px; }
  .bw-jeu #schema { width: 86px; height: 78px; display: block; }
  .bw-jeu #schema circle { transition: fill .25s, stroke .25s, opacity .25s; }
  .bw-jeu #schema .debout { fill: #fff; stroke: var(--accent); stroke-width: 2.5; }
  .bw-jeu #schema .tombee { fill: transparent; stroke: rgba(255,255,255,.28); stroke-width: 1.5; }
  .bw-jeu #schema .vient { fill: var(--accent); stroke: #fff; stroke-width: 1.5; opacity: .9; }
  .bw-jeu #etat .infos { display: grid; gap: 2px; min-width: 120px; }
  .bw-jeu #etat .qui { font-weight: 800; font-size: 17px; }
  .bw-jeu #etat .ou { font-size: 13px; opacity: .8; }
  .bw-jeu #etat .ou b { font-weight: 800; opacity: 1; }
  .bw-jeu #etat .reste { font-size: 12px; opacity: .65; }

  /* ---------------------------------------------------------------- bas centre : visée et aide */
  .bw-jeu #bas { left: 50%; bottom: 12px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: calc(100cqw - 24px); }
  .bw-jeu #pave { display: flex; gap: 6px; align-items: center; background: var(--panneau); border: 1px solid var(--panneau-bord); border-radius: 999px; padding: 4px; transition: opacity .25s; }
  .bw-jeu #pave button { width: 36px; height: 36px; border-radius: 50%; border: 0; background: rgba(255,255,255,.1); display: grid; place-items: center; }
  .bw-jeu #pave button:hover { background: rgba(255,255,255,.2); }
  .bw-jeu #pave button svg { width: 18px; height: 18px; }
  .bw-jeu #pave .lecture { font-size: 12px; min-width: 150px; text-align: center; line-height: 1.25; opacity: .9; }
  .bw-jeu #pave .lecture b { font-weight: 800; }
  .bw-jeu #pave .sep { width: 1px; height: 22px; background: rgba(255,255,255,.2); }
  .bw-jeu #aide { font-size: 13px; background: rgba(0,0,0,.42); border-radius: 999px; padding: 6px 14px; text-align: center; transition: opacity .3s; }
  .bw-jeu #aide b { font-weight: 800; }
  .bw-jeu:not(.visee) #pave { opacity: 0; pointer-events: none; }

  /* ---------------------------------------------------------------- bas droite : jauge du geste */
  .bw-jeu #jauge { right: 16px; bottom: 16px; width: 14px; height: 150px; border-radius: 999px; background: rgba(0,0,0,.4); border: 1px solid var(--panneau-bord); overflow: hidden; opacity: 0; transition: opacity .2s; }
  .bw-jeu #jauge div { position: absolute; left: 0; right: 0; bottom: 0; height: 0; background: linear-gradient(0deg, var(--accent), var(--accent2)); }
  .bw-jeu.geste #jauge { opacity: 1; }

  /* ---------------------------------------------------------------- retour après le lâcher */
  .bw-jeu #retour { left: 50%; top: 58%; transform: translate(-50%, 0) scale(.9); opacity: 0; transition: opacity .25s, transform .35s cubic-bezier(.2,1.5,.4,1); background: var(--panneau); border: 1px solid var(--panneau-bord); border-radius: 16px; padding: 10px 18px; display: flex; gap: 16px; align-items: center; white-space: nowrap; }
  .bw-jeu #retour.vu { opacity: 1; transform: translate(-50%, 0) scale(1); }
  .bw-jeu #retour .kmh { font: 800 30px var(--texte); line-height: 1; }
  .bw-jeu #retour .kmh small { font-size: 13px; font-weight: 600; opacity: .7; margin-left: 3px; }
  .bw-jeu #retour .det { display: grid; gap: 2px; font-size: 13px; }
  .bw-jeu #retour .det b { font-weight: 800; }
  .bw-jeu #retour .barre { width: 120px; height: 5px; border-radius: 3px; background: rgba(255,255,255,.18); position: relative; margin-top: 3px; }
  .bw-jeu #retour .barre i { position: absolute; top: -3px; width: 11px; height: 11px; border-radius: 50%; background: #fff; margin-left: -5.5px; box-shadow: 0 0 0 2px var(--accent); }
  .bw-jeu #retour .barre::after { content: ''; position: absolute; left: 50%; top: -2px; width: 1px; height: 9px; background: rgba(255,255,255,.5); }

  /* ---------------------------------------------------------------- annonce */
  .bw-jeu #annonce { left: 50%; top: 38%; transform: translate(-50%, -50%); text-align: center; pointer-events: none; }
  .bw-jeu #annonce .gros { font: 700 clamp(40px, 7.5cqw, 104px) var(--titre); letter-spacing: 1px; text-transform: lowercase; background: var(--deg); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 4px 0 rgba(255,255,255,.9)) drop-shadow(0 10px 24px rgba(0,0,0,.45)); opacity: 0; transform: scale(.3); line-height: 1.05; white-space: nowrap; }
  .bw-jeu[data-theme="cgt"] #annonce .gros { text-transform: uppercase; background: none; color: #fff; -webkit-text-stroke: 3px #e3001b; paint-order: stroke fill; filter: drop-shadow(0 6px 0 #8f0010) drop-shadow(0 12px 26px rgba(0,0,0,.5)); }
  .bw-jeu #annonce .petit { margin-top: 8px; font: 800 clamp(16px, 2cqw, 24px) var(--texte); text-shadow: 0 2px 10px rgba(0,0,0,.6); opacity: 0; }
  .bw-jeu[data-theme="cgt"] #annonce .petit { display: inline-block; margin-top: 12px; padding: 6px 16px; background: #e3001b; color: #fff; border-radius: 6px; font: 400 clamp(15px, 1.8cqw, 24px) 'Bowlby One SC', Impact, sans-serif; letter-spacing: .3px; text-shadow: none; box-shadow: 0 6px 18px rgba(0,0,0,.35); max-width: 80cqw; white-space: normal; }
  .bw-jeu[data-theme="cgt"] #annonce .petit:empty { display: none; }
  .bw-jeu #annonce.vu .gros { animation: bw-pop .55s cubic-bezier(.2,1.6,.4,1) forwards; }
  .bw-jeu #annonce.vu .petit { animation: bw-fondu .4s .2s forwards; }
  .bw-jeu #annonce.part .gros, .bw-jeu #annonce.part .petit { animation: bw-sortie .35s forwards; }
  @keyframes bw-pop { from { opacity: 0; transform: scale(.3) rotate(-4deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
  @keyframes bw-fondu { to { opacity: 1; } }
  @keyframes bw-sortie { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(1.15); } }

  /* ---------------------------------------------------------------- écran de fin */
  .bw-jeu #fin { inset: 0; display: grid; place-items: center; background: rgba(8, 12, 28, .55); opacity: 0; pointer-events: none; transition: opacity .4s; z-index: 5; }
  .bw-jeu #fin.vu { opacity: 1; pointer-events: auto; }
  .bw-jeu #fin .boite { background: #fff; color: var(--carte-texte); border-radius: 22px; padding: 26px 34px 24px; min-width: min(420px, 90cqw); text-align: center; box-shadow: 0 24px 60px rgba(0,0,0,.45); position: relative; overflow: hidden; }
  .bw-jeu #fin .boite::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 8px; background: var(--deg); }
  .bw-jeu #fin img { height: 30px; margin-bottom: 10px; }
  .bw-jeu[data-theme="cgt"] #fin img { height: 46px; }
  .bw-jeu #fin h2 { margin: 0 0 4px; font: 700 22px var(--titre); text-transform: lowercase; background: var(--deg); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .bw-jeu[data-theme="cgt"] #fin h2 { text-transform: uppercase; color: #e3001b; background: none; font-size: 26px; }
  .bw-jeu #fin .vainqueur { font-size: 20px; font-weight: 800; margin: 6px 0 14px; }
  .bw-jeu #fin .scores { display: grid; gap: 6px; margin-bottom: 18px; }
  .bw-jeu #fin .scores div { display: flex; justify-content: space-between; gap: 30px; padding: 8px 14px; border-radius: 10px; background: var(--carte-pale); font-weight: 600; }
  .bw-jeu #fin .scores div.gagne { background: var(--deg); color: #fff; font-weight: 800; }
  .bw-jeu #fin .scores b { font-weight: 800; }
  .bw-jeu #fin button { border: 0; border-radius: 999px; padding: 11px 28px; background: var(--deg); color: #fff; font-weight: 800; font-size: 15px; }
  .bw-jeu #fin .signature { margin-top: 14px; font-size: 11px; opacity: .6; letter-spacing: .4px; }

  /* ---------------------------------------------------------------- chargement */
  .bw-jeu #chargement { position: absolute; inset: 0; z-index: 10; display: grid; place-items: center; background: radial-gradient(circle at 50% 40%, #22346a, #0d1328 70%); transition: opacity .5s; }
  .bw-jeu #chargement.fini { opacity: 0; pointer-events: none; }
  .bw-jeu #chargement .boite { display: grid; justify-items: center; gap: 16px; text-align: center; }
  .bw-jeu #chargement img { width: 220px; height: auto; }
  .bw-jeu #chargement .titre { font: 700 18px 'Syncopate', Arial, sans-serif; letter-spacing: 1px; background: linear-gradient(90deg, #f75632, #8f12ab); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .bw-jeu #chargement .barre { width: 240px; height: 6px; border-radius: 3px; background: rgba(255,255,255,.12); overflow: hidden; }
  .bw-jeu #chargement .barre div { height: 100%; width: 0; background: linear-gradient(90deg, #f75632, #8f12ab); transition: width .4s; }
  .bw-jeu #chargement .etape { font-size: 13px; opacity: .75; min-height: 18px; }
  .bw-jeu #chargement .erreur { color: #ffb4a6; font-size: 13px; max-width: 360px; }

  /* ---------------------------------------------------------------- petits écrans */
  @container bw (max-width: 1250px) { .bw-jeu #feuille { top: 108px; } }
  @container bw (max-height: 520px) {
    .bw-jeu #feuille { --case: 30px; }
    .bw-jeu #etat { padding: 6px 10px; } .bw-jeu #schema { width: 56px; height: 51px; } .bw-jeu #etat .reste { display: none; }
    .bw-jeu #aide { display: none; }
  }
  @container bw (max-width: 900px) and (orientation: portrait) {
    .bw-jeu #feuille { top: auto; bottom: 150px; }
  }
  @container bw (max-width: 900px) {
    .bw-jeu #reglages .groupe button { padding: 6px 9px; font-size: 12px; }
    .bw-jeu #marque .titre { display: none; }
  }
  @container bw (max-width: 640px) {
    .bw-jeu #etat { padding: 8px 10px; gap: 8px; bottom: 96px; }
    .bw-jeu #schema { width: 62px; height: 56px; }
    .bw-jeu #etat .infos { min-width: 0; }
    .bw-jeu #etat .qui { font-size: 14px; }
    .bw-jeu #aide { font-size: 11px; }
    .bw-jeu #feuille { bottom: 190px; }
  }

  /* ---------------------------------------------------------------- intégration v2 (fenêtre Gearbox) */
  .bw-jeu .ligne .nom small { font-weight: 600; opacity: .75; }
  .bw-jeu [hidden] { display: none !important; }
`;
