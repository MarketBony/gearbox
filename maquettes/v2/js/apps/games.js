/* =====================================================================
   Rubrique « Jeux » (miroir de pages/Games.tsx + components/games/*)
   - Accès : Master, Administrator, Coordinator, Digital Manager (GAMES_ALLOWED_ROLES),
     et seulement si le Master a laissé l'« Espace détente » visible (Réglages).
   - Onglets : Lobby · Morpion · Puissance 4 · Bataille navale · Classement.
     Les trois onglets de jeu sont des CLASSEMENTS par jeu (comme dans Gearbox) ;
     on joue dans l'écran de partie, ouvert depuis un défi ou une partie en cours.
   - Lobby : « On vous défie (n) » (refuser / Jouer), « Parties en cours (n) »
     (PLACEMENT / À VOUS / ATTENTE), « Lancer un défi » (3 jeux, puis Défier →
     « <Jeu> ! » → « Défi envoyé »), « Meilleure série » (≥ 2 victoires d'affilée).
   - Classement : podium 2-1-3 (victoires), tableau J V D N %, Face-à-face (5).
     Statistiques calculées comme computeStats / computeRivalries / computeStreak.
   - Partie : retour, « Moi vs X », Abandonner (confirmation réelle), bandeau de
     tour « À vous de jouer » / « Au tour de votre adversaire… » / « Partie
     terminée », carte Victoire ! / Défaite / Match nul. Morpion : croix orange,
     cercle violet. Bataille navale : placement manuel (Horizontal/Vertical,
     Aléatoire, Effacer, Valider ma flotte), « Flotte en position », deux grilles,
     Touché ! / Manqué. / Coulé — X !, « Reste à couler ».
   - Maquette : le collègue est simulé (il accepte vos défis et joue ses coups).
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt, G = D.GAMES, ME = 'me';
  const GAMES = [
    { id: 'morpion', l: 'Morpion', pitch: 'Trois cases alignées. Deux minutes, pas plus.', c: 'var(--bony-orange)', icon: 'grid' },
    { id: 'p4', l: 'Puissance 4', pitch: 'Quatre pions, la gravité en plus.', c: 'var(--bony-violet)', icon: 'target' },
    { id: 'naval', l: 'Bataille navale', pitch: 'Placez votre flotte, coulez la sienne.', c: 'var(--bony-blue)', icon: 'flag' },
  ];
  const TABS = [['lobby', 'Lobby'], ['morpion', 'Morpion'], ['p4', 'Puissance 4'], ['naval', 'Bataille navale'], ['board', 'Classement']];
  const gOf = (x) => GAMES.find((g) => g.id === x || g.l === x) || GAMES[0];
  const FLEET = [['Porte-avions', 5], ['Croiseur', 4], ['Destroyer', 3], ['Sous-marin', 3], ['Torpilleur', 2]];
  const ME_C = 'var(--bony-orange)', OP_C = 'var(--bony-violet)';
  const badge = () => G.challenges.length;

  /* Historique des parties terminées (miroir de GameSummary) — fictif, déterministe */
  const P = { sent: {}, sess: {}, hist: null };
  function history() {
    if (P.hist) return P.hist;
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ids = [ME, ...D.USERS.filter((u) => u.id !== ME && ['Master', 'Administrator', 'Coordinator', 'Digital Manager'].includes(u.role)).map((u) => u.id)];
    const skill = Object.fromEntries(ids.map((id, i) => [id, [0.62, 0.5, 0.58, 0.66, 0.42, 0.47, 0.55, 0.4][i % 8]]));
    const out = []; const t0 = Date.now() - 60 * 864e5;
    for (let k = 0; k < 64; k++) {
      const a = ids[Math.floor(rnd() * ids.length)]; let b = ids[Math.floor(rnd() * ids.length)]; if (a === b) b = ids[(ids.indexOf(a) + 1) % ids.length];
      const game = GAMES[Math.floor(rnd() * 3)].id, r = rnd();
      const pa = skill[a] / (skill[a] + skill[b]);
      const winner = game === 'morpion' && r < 0.18 ? 'draw' : game === 'p4' && r < 0.05 ? 'draw' : rnd() < pa ? a : b;
      out.push({ id: 'h' + k, game, p1: a, p2: b, winner, at: t0 + k * 22 * 36e5 });
    }
    return (P.hist = out);
  }
  /* computeStats() de Games.tsx */
  function stats(game) {
    const rows = game ? history().filter((h) => h.game === game) : history(), map = new Map();
    const ens = (id) => (map.has(id) || map.set(id, { id, played: 0, wins: 0, losses: 0, draws: 0 }), map.get(id));
    for (const s of rows) {
      const a = ens(s.p1), b = ens(s.p2); a.played++; b.played++;
      if (s.winner === 'draw') { a.draws++; b.draws++; } else if (s.winner === s.p1) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
    }
    return [...map.values()].map((p) => ({ ...p, ratio: p.played ? Math.round((p.wins / p.played) * 100) : 0 })).sort((x, y) => y.wins - x.wins || y.ratio - x.ratio);
  }
  /* computeRivalries() */
  function rivalries(game) {
    const rows = game ? history().filter((h) => h.game === game) : history(), map = new Map();
    for (const s of rows) {
      const [a, b] = [s.p1, s.p2].sort(), k = a + '|' + b;
      if (!map.has(k)) map.set(k, { a, b, aw: 0, bw: 0, n: 0, total: 0 });
      const r = map.get(k); r.total++; if (s.winner === 'draw') r.n++; else if (s.winner === a) r.aw++; else r.bw++;
    }
    return [...map.values()].sort((x, y) => y.total - x.total);
  }
  /* computeStreak() : meilleure série de victoires, seulement si > 1 */
  function streak() {
    const cur = new Map(), max = new Map();
    for (const s of [...history()].filter((h) => h.winner !== 'draw').sort((a, b) => a.at - b.at)) {
      const w = s.winner, l = w === s.p1 ? s.p2 : s.p1, n = (cur.get(w) || 0) + 1; cur.set(w, n); cur.set(l, 0);
      if (n > (max.get(w) || 0)) max.set(w, n);
    }
    let best = null; max.forEach((n, id) => { if (!best || n > best.n) best = { id, n }; });
    return best && best.n > 1 ? best : null;
  }

  GX.css(`
  .gme-head .ah-tabs{min-width:0;max-width:100%;overflow-x:auto;scrollbar-width:none;padding:2px 0}
  .gme-head .seg > button{height:28px;padding:0 13px;font-size:13px;display:inline-flex;align-items:center;gap:6px}
  .gme-head .seg .count{height:16px;min-width:16px;font-size:10px}
  .gme-back{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--surface-3);flex:none;align-self:center}
  .gme-back:hover{background:var(--surface-4)}
  .gme-vs{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13.5px;font-weight:600;flex-wrap:wrap}
  .gme-vs .faint{font-size:12px}
  .gme-pane{flex:1;min-height:0;position:relative;overflow-x:hidden}
  .gme-wrap{padding:4px 22px 28px;display:grid;gap:22px}
  .gme-sec{display:grid;gap:12px;min-width:0}
  .gme-h2{font-family:var(--font-display);font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:center;gap:9px;color:var(--text)}
  .gme-h2 svg.i{color:var(--accent)}
  .gme-h2 .faint{font-family:var(--font-ui);letter-spacing:0;text-transform:none;font-weight:600}
  .gme-card{background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-lg);padding:20px 22px;min-width:0}
  .gme-top{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}
  .gme-top > .solo{grid-column:1 / -1}
  .gme-dare{border-color:color-mix(in srgb,var(--bony-orange) 45%,var(--line));background:color-mix(in srgb,var(--bony-orange) 6%,var(--surface-2))}
  .gme-dare .gme-h2{color:var(--bony-orange)}
  .gme-list{display:grid;gap:8px}
  .gme-lrow{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--surface-3) 55%,transparent);border:1px solid var(--line);min-width:0}
  .gme-lrow .t{flex:1;min-width:0;display:grid;gap:1px}.gme-lrow .t b{font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gme-lrow .t small{font-size:12.5px;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .gme-runs{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
  .gme-run{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:14px;background:var(--surface-2);border:1px solid var(--line);text-align:left;transition:border-color var(--t-fast),transform var(--t-fast) var(--ease-out)}
  .gme-run:hover{border-color:var(--line-2);transform:translateY(-1px)}
  .gme-run.mine{border-color:color-mix(in srgb,var(--bony-orange) 60%,transparent);box-shadow:inset 3px 0 0 var(--bony-orange)}
  .gme-run .st{font-size:11px;font-weight:800;letter-spacing:.06em;flex:none;color:var(--text-2)}
  .gme-run.mine .st{color:var(--bony-orange)}
  .gme-gico{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;flex:none;color:#fff;background:var(--c)}
  .gme-gico svg.i{width:22px;height:22px}
  .gme-games{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
  .gme-gcard{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;align-items:center;padding:18px;border-radius:16px;background:var(--surface-2);border:1px solid var(--line);text-align:left;transition:border-color var(--t-fast),transform var(--t-med) var(--spring-bouncy),background var(--t-fast)}
  .gme-gcard:hover{transform:translateY(-2px);border-color:var(--line-2)}
  .gme-gcard[aria-pressed="true"]{border-color:var(--bony-orange);background:color-mix(in srgb,var(--bony-orange) 8%,var(--surface-2));box-shadow:0 0 0 3px color-mix(in srgb,var(--bony-orange) 18%,transparent)}
  .gme-gcard .gme-gico{grid-row:span 2}
  .gme-gcard .nm{font-family:var(--font-display);font-size:13.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
  .gme-gcard .ds{font-size:13px;color:var(--text-2);line-height:1.4}
  .gme-opps{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
  .gme-empty{padding:14px 4px;color:var(--text-2);font-size:13.5px}
  .gme-streak{display:flex;align-items:center;gap:16px}
  .gme-streak .fl{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:var(--bony-grad);color:#fff;flex:none}
  .gme-streak .big{font-family:var(--font-display);font-weight:700;color:var(--bony-orange);font-size:14px;letter-spacing:.03em}

  .gme-board{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:22px;align-items:start}
  .gme-podium{display:flex;align-items:flex-end;justify-content:center;gap:18px;padding:8px 0 4px}
  .gme-step{display:grid;justify-items:center;gap:8px;min-width:0}
  .gme-step .av{--s:40px;box-shadow:0 0 0 3px var(--surface-2)}.gme-step.p1 .av{--s:52px;box-shadow:0 0 0 3px var(--bony-orange)}
  .gme-step .nm{font-weight:700;font-size:13.5px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gme-step .crown{color:var(--bony-orange);height:18px}
  .gme-block{width:90px;border-radius:14px 14px 0 0;display:grid;place-items:start center;padding-top:8px;font-family:var(--font-display);font-weight:700;font-size:16px;transform-origin:bottom;background:var(--surface-4);color:var(--text)}
  .gme-step.p1 .gme-block{background:var(--bony-grad);color:#fff}
  .gme-tbl td{height:46px}.gme-tbl tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--surface-3) 35%,transparent)}
  .gme-tbl .me td{background:color-mix(in srgb,var(--bony-orange) 9%,transparent)!important}
  .gme-tbl th.c,.gme-tbl td.c{text-align:center}
  .gme-rk{width:22px;display:inline-block;color:var(--text-2);font-variant-numeric:tabular-nums;font-size:12.5px}
  .gme-riv{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--surface-3) 55%,transparent);border:1px solid var(--line)}
  .gme-riv .sd{display:flex;align-items:center;gap:8px;min-width:0;font-weight:700;font-size:13.5px}.gme-riv .sd.r{justify-content:flex-end}
  .gme-riv .sd span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gme-riv .sc{font-family:var(--font-display);font-weight:700;font-size:14px;font-variant-numeric:tabular-nums}
  .gme-riv .sc .w{color:var(--bony-orange)}.gme-riv .sc .l{color:var(--text-2)}
  .gme-foot{font-size:12.5px;color:var(--text-2);display:flex;align-items:center;gap:6px}

  .gme-game{padding:4px 22px 24px;display:grid;gap:16px;max-width:900px;margin:0 auto;width:100%}
  .gme-turn{border-radius:16px;padding:12px 16px;text-align:center;font-weight:700;font-size:14px;background:var(--surface-3);color:var(--text-2);display:flex;align-items:center;justify-content:center;gap:8px}
  .gme-turn.on{background:var(--bony-grad);color:#fff;box-shadow:0 10px 26px -14px var(--bony-orange)}
  .gme-dots{display:inline-flex;gap:3px}.gme-dots i{width:5px;height:5px;border-radius:50%;background:currentColor;animation:gme-blink 1s infinite}.gme-dots i:nth-child(2){animation-delay:.15s}.gme-dots i:nth-child(3){animation-delay:.3s}
  @keyframes gme-blink{0%,100%{opacity:.25}50%{opacity:1}}
  .gme-msg{text-align:center;font-size:13px;font-weight:600;color:var(--bony-orange);min-height:18px}
  .gme-end{position:relative;overflow:hidden;text-align:center;display:grid;justify-items:center;gap:6px}
  .gme-end.win{border-color:color-mix(in srgb,var(--bony-orange) 45%,var(--line))}
  .gme-end h3{font-family:var(--font-display);font-size:19px;letter-spacing:.04em;text-transform:uppercase}
  .gme-end .tr{color:var(--bony-orange)}.gme-end .tr svg.i{width:28px;height:28px}
  .gme-confetti{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:6}
  .gme-confetti i{position:absolute;top:-14px;left:var(--x);width:var(--w);height:calc(var(--w) * .45);border-radius:2px;background:var(--c);animation:gme-fall var(--d) cubic-bezier(.2,.6,.4,1) var(--dl) forwards}
  @keyframes gme-fall{to{transform:translate(var(--dx),var(--h)) rotate(var(--r));opacity:.2}}

  .gme-ttt{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:min(100%,420px);margin:0 auto}
  .gme-cell{aspect-ratio:1;border-radius:18px;background:var(--surface-2);border:1px solid var(--line-2);display:grid;place-items:center;transition:background var(--t-fast),border-color var(--t-fast),transform var(--t-fast) var(--ease-out)}
  .gme-cell.can{cursor:pointer}.gme-cell.can:hover{border-color:color-mix(in srgb,var(--bony-orange) 60%,transparent);background:color-mix(in srgb,var(--bony-orange) 6%,var(--surface-2))}
  .gme-cell.can:active{transform:scale(.95)}
  .gme-cell svg{width:58%;height:58%;fill:none;stroke-width:5;stroke-linecap:round}
  .gme-cell svg.x{stroke:${ME_C}}.gme-cell svg.o{stroke:${OP_C}}
  .gme-cell svg .dr{stroke-dasharray:1;stroke-dashoffset:0}
  .gme-cell.new svg .dr{animation:gme-draw .38s var(--ease-out) both}.gme-cell.new svg .dr+.dr{animation-delay:.12s}
  @keyframes gme-draw{from{stroke-dashoffset:1}}
  .gme-cell.win{border-color:var(--bony-orange);background:color-mix(in srgb,var(--bony-orange) 12%,var(--surface-2));box-shadow:0 0 18px -6px var(--bony-orange)}

  .gme-p4wrap{width:min(100%,560px);margin:0 auto;display:grid;gap:6px}
  .gme-p4cols{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;padding:0 10px}
  .gme-p4cols button{height:26px;border-radius:8px;display:grid;place-items:center;color:var(--text-3)}
  .gme-p4cols button:not(:disabled):hover{color:var(--bony-orange);background:color-mix(in srgb,var(--bony-orange) 10%,transparent)}
  .gme-p4cols button:disabled{opacity:.3}
  .gme-p4{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;padding:10px;border-radius:20px;background:linear-gradient(180deg,color-mix(in srgb,var(--bony-blue) 82%,#fff),var(--bony-blue));box-shadow:var(--shadow-2),inset 0 1px 0 rgba(255,255,255,.25)}
  .gme-col{display:grid;gap:6px;border-radius:12px;transition:background var(--t-fast)}
  .gme-col.can{cursor:pointer}.gme-col.can:hover,.gme-col.hov{background:rgba(255,255,255,.1)}
  .gme-hole{position:relative;aspect-ratio:1;border-radius:50%;background:var(--surface-1);box-shadow:inset 0 3px 6px rgba(0,0,0,.45)}
  .gme-disc{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 34% 30%,color-mix(in srgb,var(--c) 55%,#fff),var(--c) 58%);box-shadow:inset 0 -3px 5px rgba(0,0,0,.25),0 2px 4px rgba(0,0,0,.3)}
  .gme-disc.last{box-shadow:0 0 0 2px #fff,inset 0 -3px 5px rgba(0,0,0,.25)}
  .gme-p4.over .gme-disc:not(.win){opacity:.45}
  .gme-disc.win{box-shadow:0 0 0 3px #fff,0 0 18px var(--c);animation:gme-pulse 1.1s ease-in-out infinite}
  @keyframes gme-pulse{50%{transform:scale(.9)}}

  .gme-navbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .gme-navbar .t{flex:1;min-width:180px;font-size:13.5px;color:var(--text-2)}.gme-navbar .t b{color:var(--text)}
  .gme-grids{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:20px;align-items:start}
  .gme-gt{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-2);display:flex;align-items:center;gap:6px;margin-bottom:8px}
  .gme-sea{display:grid;grid-template-columns:18px repeat(10,1fr);gap:3px;user-select:none}
  .gme-sea.sm{gap:2px}
  .gme-sea .hd{font-size:11px;font-weight:700;color:var(--text-2);display:grid;place-items:center}
  .gme-sq{position:relative;aspect-ratio:1;border-radius:4px;background:color-mix(in srgb,var(--bony-blue) 16%,var(--surface-2));display:grid;place-items:center;font-size:12px;font-weight:800;color:#fff;transition:background var(--t-fast),transform var(--t-fast)}
  .gme-sea.can .gme-sq.free{cursor:crosshair}.gme-sea.can .gme-sq.free:hover{background:color-mix(in srgb,var(--bony-orange) 40%,var(--surface-2));transform:scale(1.08)}
  .gme-sq.ship{background:var(--bony-blue)}
  .gme-sq.ok{background:color-mix(in srgb,var(--bony-blue) 55%,var(--surface-2));box-shadow:inset 0 0 0 1px var(--bony-orange)}
  .gme-sq.ko{background:color-mix(in srgb,var(--danger) 30%,var(--surface-2));box-shadow:inset 0 0 0 1px var(--danger)}
  .gme-sq.hit{background:var(--bony-orange);box-shadow:0 0 8px -2px var(--bony-orange)}
  .gme-sq.sunk{background:var(--bony-violet)}
  .gme-sq.miss{background:color-mix(in srgb,var(--text-3) 22%,var(--surface-2));color:var(--text-2)}
  .gme-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .gme-chip{height:26px;padding:0 9px;border-radius:8px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;border:1px solid var(--line-2);color:var(--text-2)}
  .gme-chip.on{border-color:color-mix(in srgb,var(--bony-blue) 50%,transparent);background:color-mix(in srgb,var(--bony-blue) 15%,transparent);color:var(--text)}
  .gme-wait{display:grid;justify-items:center;gap:8px;text-align:center;padding:30px 20px}
  .gme-wait h3{font-family:var(--font-display);font-size:15px;letter-spacing:.04em;text-transform:uppercase}

  @container app (max-width:1000px){.gme-games{grid-template-columns:1fr}.gme-board{grid-template-columns:1fr}}
  @container app (max-width:900px){.gme-head .sub{display:none}}
  @container app (max-width:760px){.gme-top{grid-template-columns:1fr}.gme-head .ah-tabs{flex:1 1 100%}.gme-grids{grid-template-columns:1fr}}
  @container app (max-width:560px){.gme-wrap,.gme-game{padding:4px 10px 20px;gap:16px}.gme-card{padding:16px}.gme-block{width:64px}.gme-podium{gap:10px}.gme-tbl .opt{display:none}.gme-runs,.gme-opps{grid-template-columns:1fr}}
  `);

  /* ---------------- Petits rendus ---------------- */
  const colleagues = () => D.USERS.filter((u) => u.id !== ME && (D.ACCESS[u.role] || []).includes('games'));
  const uName = (id) => (id === ME ? D.user(ME).name : D.user(id)?.name || 'Joueur retiré');
  const first = (id) => uName(id).split(' ')[0];
  const X_SVG = () => `<svg class="x" viewBox="0 0 40 40"><path class="dr" pathLength="1" d="M11 11 29 29"/><path class="dr" pathLength="1" d="M29 11 11 29"/></svg>`;
  const O_SVG = () => `<svg class="o" viewBox="0 0 40 40"><circle class="dr" pathLength="1" cx="20" cy="20" r="10.5" transform="rotate(-90 20 20)"/></svg>`;
  const player = (id, cls = 'sm') => `<span class="row" style="gap:8px;min-width:0">${GX.r.av(id, cls)}<b class="ellipsis">${GX.esc(uName(id))}</b></span>`;
  function confetti(host) {
    if (GX.eco()) return;
    const cols = ['var(--bony-orange)', 'var(--bony-violet)', 'var(--ok)', 'var(--warn)', 'var(--info)', 'var(--cyan)'];
    const box = document.createElement('div'); box.className = 'gme-confetti';
    const h = (host.clientHeight || 300) + 30;
    box.innerHTML = Array.from({ length: 44 }, (_, i) => `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--dx:${Math.round((Math.random() - .5) * 180)}px;--r:${Math.round(Math.random() * 900 - 450)}deg;--d:${(1.3 + Math.random() * 1.2).toFixed(2)}s;--dl:${(Math.random() * .25).toFixed(2)}s;--c:${cols[i % cols.length]};--w:${(6 + Math.random() * 5).toFixed(1)}px;--h:${h}px"></i>`).join('');
    host.append(box); setTimeout(() => box.remove(), 3000);
  }

  /* ---------------- Logique des jeux (pure) — l'adversaire est simulé ---------------- */
  const L3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  function tttWin(b) { for (const l of L3) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { p: b[l[0]], line: l }; return b.every(Boolean) ? { p: 'draw' } : null; }
  function tttAI(b) {
    const empty = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    for (const p of ['O', 'X']) for (const i of empty) { const c = [...b]; c[i] = p; if (tttWin(c)?.p === p) return i; }
    if (!b[4]) return 4;
    const corners = [0, 2, 6, 8].filter((i) => !b[i]);
    return corners.length && Math.random() < .7 ? rand(corners) : rand(empty);
  }
  const R = 6, C = 7;
  const p4Drop = (g, c) => { for (let r = R - 1; r >= 0; r--) if (!g[r][c]) return r; return -1; };
  function p4Line(g, r, c) {
    const p = g[r][c]; if (!p) return null;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [[r, c]];
      for (const s of [1, -1]) { let rr = r + dr * s, cc = c + dc * s; while (rr >= 0 && rr < R && cc >= 0 && cc < C && g[rr][cc] === p) { cells.push([rr, cc]); rr += dr * s; cc += dc * s; } }
      if (cells.length >= 4) return cells;
    }
    return null;
  }
  function p4AI(g) {
    const valid = [...Array(C).keys()].filter((c) => p4Drop(g, c) >= 0);
    const tryWin = (p) => valid.find((c) => { const r = p4Drop(g, c); g[r][c] = p; const w = p4Line(g, r, c); g[r][c] = null; return w; });
    let c = tryWin('O'); if (c !== undefined) return c;
    c = tryWin('X'); if (c !== undefined) return c;
    const safe = valid.filter((cc) => { const r = p4Drop(g, cc); g[r][cc] = 'O'; let ok = true; if (r > 0) { g[r - 1][cc] = 'X'; ok = !p4Line(g, r - 1, cc); g[r - 1][cc] = null; } g[r][cc] = null; return ok; });
    const pool = safe.length ? safe : valid, order = [3, 2, 4, 1, 5, 0, 6].filter((x) => pool.includes(x));
    return Math.random() < .7 ? order[0] : rand(order.slice(0, 3));
  }
  const around = (i) => { const r = Math.floor(i / 10), c = i % 10, out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 10 && cc >= 0 && cc < 10) out.push(rr * 10 + cc); } return out; };
  const coord = (i) => 'ABCDEFGHIJ'[Math.floor(i / 10)] + ((i % 10) + 1);
  const cellsFor = (i, s, dir) => { const r = Math.floor(i / 10), c = i % 10; const out = []; for (let k = 0; k < s; k++) { const rr = r + (dir === 'V' ? k : 0), cc = c + (dir === 'H' ? k : 0); if (rr > 9 || cc > 9) return null; out.push(rr * 10 + cc); } return out; };
  const canPlace = (cells, occ) => !!cells && cells.every((i) => around(i).every((j) => occ[j] < 0));
  function toFleet(drafts) { const occ = new Array(100).fill(-1); const ships = drafts.map((d, k) => { d.cells.forEach((i) => (occ[i] = k)); return { n: d.n, s: d.s, cells: d.cells, hits: 0 }; }); return { ships, occ }; }
  function randomDrafts() {
    for (let t = 0; t < 200; t++) {
      const occ = new Array(100).fill(-1), out = []; let ok = true;
      for (const [n, s] of FLEET) {
        let placed = false;
        for (let k = 0; k < 300 && !placed; k++) { const cells = cellsFor(Math.floor(Math.random() * 100), s, Math.random() < .5 ? 'H' : 'V'); if (canPlace(cells, occ)) { cells.forEach((i) => (occ[i] = out.length)); out.push({ n, s, cells }); placed = true; } }
        if (!placed) { ok = false; break; }
      }
      if (ok) return out;
    }
    return [];
  }
  function navAI(shots) {
    const un = (i) => shots[i] === undefined;
    const hits = Object.keys(shots).filter((k) => shots[k] === 'hit').map(Number), cands = [];
    for (const h of hits) for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const r = Math.floor(h / 10) + dr, c = (h % 10) + dc; if (r < 0 || r > 9 || c < 0 || c > 9 || !un(r * 10 + c)) continue;
      const or = Math.floor(h / 10) - dr, oc = (h % 10) - dc;
      cands.push({ j: r * 10 + c, w: or >= 0 && or <= 9 && oc >= 0 && oc <= 9 && shots[or * 10 + oc] === 'hit' ? 2 : 1 });
    }
    if (cands.length) { const best = Math.max(...cands.map((x) => x.w)); return rand(cands.filter((x) => x.w === best)).j; }
    const blocked = new Set(); Object.keys(shots).forEach((k) => shots[k] === 'sunk' && around(+k).forEach((j) => blocked.add(j)));
    const all = [...Array(100).keys()];
    let pool = all.filter((i) => un(i) && !blocked.has(i) && (Math.floor(i / 10) + (i % 10)) % 2 === 0);
    if (!pool.length) pool = all.filter((i) => un(i) && !blocked.has(i));
    if (!pool.length) pool = all.filter(un);
    return rand(pool);
  }
  function shoot(fl, shots, i) {
    const si = fl.occ[i];
    if (si < 0) { shots[i] = 'miss'; return { kind: 'miss' }; }
    const sh = fl.ships[si]; sh.hits++; shots[i] = 'hit';
    if (sh.hits >= sh.s) { sh.cells.forEach((c) => (shots[c] = 'sunk')); return { kind: 'sunk', ship: sh }; }
    return { kind: 'hit', ship: sh };
  }

  /* Une partie (GameSession simplifiée) : clé jeu:adversaire */
  function newSession(gid, opp, meFirst) {
    const s = { gid, opp, over: null, turn: meFirst ? 'me' : 'op', msg: '', last: -1 };
    if (gid === 'morpion') s.b = Array(9).fill(null);
    if (gid === 'p4') s.g = Array.from({ length: R }, () => Array(C).fill(null));
    if (gid === 'naval') Object.assign(s, { phase: 'placing', drafts: [], dir: 'H', hover: -1, ready: false, foe: toFleet(randomDrafts()), myShots: {}, foeShots: {} });
    return (P.sess[gid + ':' + opp] = s);
  }
  const runState = (s) => (s.gid === 'naval' && s.phase === 'placing' ? 'PLACEMENT' : s.turn === 'me' ? 'À VOUS' : 'ATTENTE');
  function syncRun(s) {
    const g = gOf(s.gid).l, ex = G.running.find((x) => x.vs === s.opp && x.game === g);
    if (s.over) { G.running = G.running.filter((x) => x !== ex); return; }
    if (ex) ex.state = runState(s); else G.running.unshift({ vs: s.opp, game: g, state: runState(s) });
  }

  /* ---------------- Montage ---------------- */
  function mount(body, win) {
    let tab = 'lobby', pick = 'morpion', target = null, active = null;   // active = session ouverte
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    body.innerHTML = `<div class="app"><div data-head></div><div class="gme-pane scroll" data-pane></div></div>`;
    const headEl = body.querySelector('[data-head]'), pane = body.querySelector('[data-pane]');
    const $ = (s) => pane.querySelector(s);

    function renderHead() {
      if (active) {
        const s = active, live = !s.over;
        headEl.innerHTML = `<div class="app-head gme-head"><button class="gme-back" data-back data-tip="Retour au lobby">${GX.icon('back')}</button><div class="ah-t"><h1>${gOf(s.gid).l}</h1><span class="sub gme-vs">${player(ME)}<span class="faint">vs</span>${player(s.opp)}</span></div>
          <div class="ah-f">${live ? `<button class="btn ghost" data-abandon style="color:var(--danger)">${GX.icon('flag', 'sm')}Abandonner</button>` : ''}</div></div>`;
        headEl.querySelector('[data-back]').onclick = () => { active = null; render(true); };
        headEl.querySelector('[data-abandon]')?.addEventListener('click', abandon);
        return;
      }
      headEl.innerHTML = `<div class="app-head gme-head"><div class="ah-t"><h1>Jeux</h1><span class="sub">Défiez un collègue — il reçoit l’invitation instantanément, où qu’il soit.</span></div>
        <div class="ah-tabs"><div class="seg" data-tabs>${TABS.map(([v, l]) => `<button data-v="${v}" aria-pressed="${v === tab}">${l}${v === 'lobby' ? `<span class="count" data-cnt style="${badge() ? '' : 'display:none'}">${badge()}</span>` : ''}</button>`).join('')}</div></div></div>`;
      headEl.querySelector('[data-tabs]').addEventListener('change', (e) => { tab = e.detail; render(true); });
    }
    function render(anim) {
      const sc = anim ? 0 : pane.scrollTop;
      if (!GX.shell.canOpen('games')) { active = null; headEl.innerHTML = ''; pane.innerHTML = `<div class="empty" style="height:100%">${GX.icon('lock')}<b style="color:var(--text)">Accès restreint</b>Les Jeux sont réservés aux rôles Master, Administrateur, Coordinateur et Digital Manager.</div>`; win.setTitle('Jeux'); return; }
      renderHead();
      pane.innerHTML = active ? gameHTML(active) : tab === 'lobby' ? lobbyHTML() : boardHTML(tab === 'board' ? null : tab);
      pane.scrollTop = sc;
      wire();
      win.setTitle('Jeux', active ? gOf(active.gid).l : TABS.find((t) => t[0] === tab)[1]);
      if (anim) GX.animate(pane.firstElementChild, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
      if (anim && !active && tab !== 'lobby') pane.querySelectorAll('.gme-block').forEach((b, i) => GX.animate(b, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { spring: 'soft', delay: [140, 0, 260][i] ?? 0, fill: 'backwards' }));
    }
    const setCount = () => { const c = headEl.querySelector('[data-cnt]'); if (c) { c.textContent = badge(); c.style.display = badge() ? '' : 'none'; } };

    /* ---------- Lobby ---------- */
    function lobbyHTML() {
      const ch = G.challenges, run = G.running, st = streak();
      const opps = colleagues();
      const dareBox = ch.length ? `<section class="gme-card gme-dare gme-sec enter ${run.length ? '' : 'solo'}"><h2 class="gme-h2">${GX.icon('flag', 'sm')}On vous défie <span class="faint">(${ch.length})</span></h2><div class="gme-list">
          ${ch.map((c, i) => `<div class="gme-lrow" data-ch="${i}">${GX.r.av(c.from)}<div class="t"><b>${GX.esc(uName(c.from))}</b><small>${gOf(c.game).l} · ${F.ago(c.at)}</small></div>
            <button class="icon-btn" data-refuse aria-label="Refuser" data-tip="Refuser" style="color:var(--danger)">${GX.icon('close', 'sm')}</button><button class="btn primary" data-accept aria-label="Accepter">${GX.icon('check', 'sm')}Jouer</button></div>`).join('')}</div></section>` : '';
      const runBox = run.length ? `<section class="gme-card gme-sec enter ${ch.length ? '' : 'solo'}" style="--i:1"><h2 class="gme-h2">${GX.icon('clock', 'sm')}Parties en cours <span class="faint">(${run.length})</span></h2><div class="gme-runs">
          ${run.map((r, i) => { const g = gOf(r.game), mine = r.state === 'À VOUS'; return `<button class="gme-run ${mine ? 'mine' : ''}" data-run="${i}"><span class="gme-gico" style="--c:${g.c}">${GX.icon(g.icon)}</span><span class="grow" style="min-width:0;display:grid;gap:3px"><b style="font-size:14px">${g.l}</b>${player(r.vs)}</span><span class="st">${r.state}</span></button>`; }).join('')}</div></section>` : '';
      return `<div class="gme-wrap">
        ${dareBox || runBox ? `<div class="gme-top">${dareBox}${runBox}</div>` : ''}
        <section class="gme-sec enter" style="--i:2"><h2 class="gme-h2">${GX.icon('target', 'sm')}Lancer un défi</h2>
          <div class="gme-games">${GAMES.map((g) => `<button class="gme-gcard" data-game="${g.id}" aria-pressed="${pick === g.id}"><span class="gme-gico" style="--c:${g.c}">${GX.icon(g.icon)}</span><span class="nm">${g.l}</span><span class="ds">${g.pitch}</span></button>`).join('')}</div>
          <div class="gme-opps">${opps.map((u) => { const sent = P.sent[u.id];
            return `<div class="gme-lrow">${GX.r.av(u.id)}<div class="t"><b>${GX.esc(u.name)}</b><small>${D.ROLES[u.role].l}${u.online ? ' · en ligne' : ''}</small></div>
              ${sent ? '<span class="faint" style="font-size:12.5px;padding:0 6px">Défi envoyé</span>' : target === u.id ? `<button class="btn primary" data-dare="${u.id}">${gOf(pick).l} !</button>` : `<button class="btn" data-target="${u.id}">Défier</button>`}</div>`; }).join('') || '<div class="gme-empty">Aucun collègue n’a accès aux Jeux.</div>'}</div>
        </section>
        ${st ? `<section class="gme-card gme-streak enter" style="--i:3"><span class="fl">${GX.icon('bolt')}</span><div style="display:grid;gap:4px;min-width:0"><span class="label">Meilleure série</span><span class="row" style="gap:10px;flex-wrap:wrap">${player(st.id)}<span class="big">${st.n} victoires d’affilée</span></span></div></section>` : ''}
      </div>`;
    }

    /* ---------- Classements ---------- */
    function boardHTML(game) {
      const S = stats(game), riv = rivalries(game).slice(0, 5), top = S.slice(0, 3), order = [top[1], top[0], top[2]].filter(Boolean), H = { 1: 96, 2: 64, 3: 48 };
      const podium = top.length ? `<div class="gme-podium">${order.map((p) => { const rk = p === top[0] ? 1 : p === top[1] ? 2 : 3; return `<div class="gme-step p${rk}"><span class="crown">${rk === 1 ? GX.icon('star', 'sm') : ''}</span>${GX.r.av(p.id)}<span class="nm">${GX.esc(first(p.id))}</span><div class="gme-block" style="height:${H[rk]}px">${p.wins}</div></div>`; }).join('')}</div>` : '';
      const table = S.length ? `<div class="scroll"><table class="tbl gme-tbl"><thead><tr><th>Joueur</th><th class="c">J</th><th class="c">V</th><th class="c">D</th><th class="c opt">N</th><th class="c">%</th></tr></thead><tbody>
          ${S.map((p, i) => `<tr class="${p.id === ME ? 'me' : ''}"><td><span class="row" style="gap:8px"><span class="gme-rk">${i + 1}</span>${player(p.id)}</span></td><td class="c num muted">${p.played}</td><td class="c num"><b>${p.wins}</b></td><td class="c num muted">${p.losses}</td><td class="c num muted opt">${p.draws}</td><td class="c num"><b style="color:var(--bony-orange)">${p.ratio}%</b></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="gme-empty" style="text-align:center">Aucune partie terminée pour l’instant.</div>';
      return `<div class="gme-wrap"><div class="gme-board">
        <section class="gme-card gme-sec enter"><h2 class="gme-h2">${GX.icon('star', 'sm')}${game ? `Classement — ${gOf(game).l}` : 'Classement toutes catégories'}</h2>${podium}${table}</section>
        ${riv.length ? `<section class="gme-card gme-sec enter" style="--i:1"><h2 class="gme-h2">${GX.icon('users', 'sm')}Face-à-face</h2><div class="gme-list">${riv.map((r) => `<div class="gme-riv"><span class="sd">${GX.r.av(r.a, 'sm')}<span>${GX.esc(first(r.a))}</span></span><span class="sc"><span class="${r.aw > r.bw ? 'w' : 'l'}">${r.aw}</span><span class="faint"> – </span><span class="${r.bw > r.aw ? 'w' : 'l'}">${r.bw}</span></span><span class="sd r"><span>${GX.esc(first(r.b))}</span>${GX.r.av(r.b, 'sm')}</span></div>`).join('')}</div></section>` : ''}
        </div><div class="gme-foot">${GX.icon('barchart', 'sm')}Classement calculé sur les parties enregistrées côté serveur — identique pour tout le monde.</div></div>`;
    }

    /* ---------- Écran de partie ---------- */
    const turnHTML = (s, mineTxt = 'À vous de jouer') => `<div class="gme-turn ${!s.over && s.turn === 'me' ? 'on' : ''}">${s.over ? 'Partie terminée' : s.turn === 'me' ? mineTxt : `<span class="gme-dots"><i></i><i></i><i></i></span>Au tour de votre adversaire…`}</div>`;
    const endHTML = (s) => !s.over ? '' : `<div class="gme-card gme-end ${s.over === 'win' ? 'win' : ''}" data-end>${s.over === 'win' ? `<span class="tr">${GX.icon('star')}</span>` : ''}<h3>${s.over === 'draw' ? 'Match nul' : s.over === 'win' ? 'Victoire !' : 'Défaite'}</h3>${s.over === 'lose' ? '<span class="muted" style="font-size:13px">La revanche est un clic dans le lobby.</span>' : ''}<button class="btn" data-back2 style="margin-top:6px">${GX.icon('back', 'sm')}Retour au lobby</button></div>`;
    function gameHTML(s) {
      if (s.gid === 'morpion') {
        const w = tttWin(s.b), line = w?.line || [];
        return `<div class="gme-game">${endHTML(s)}${turnHTML(s)}<div class="gme-msg">${GX.esc(s.msg)}</div>
          <div class="gme-ttt" data-ttt>${s.b.map((v, i) => `<button class="gme-cell ${!v && !s.over && s.turn === 'me' ? 'can' : ''} ${i === s.last ? 'new' : ''} ${line.includes(i) ? 'win' : ''}" data-i="${i}" aria-label="Case ${i + 1}">${v === 'X' ? X_SVG() : v === 'O' ? O_SVG() : ''}</button>`).join('')}</div></div>`;
      }
      if (s.gid === 'p4') {
        const win = new Set((s.line || []).map(([r, c]) => r + ':' + c)), can = (c) => !s.over && s.turn === 'me' && !s.g[0][c];
        return `<div class="gme-game">${endHTML(s)}${turnHTML(s)}<div class="gme-msg">${GX.esc(s.msg)}</div>
          <div class="gme-p4wrap"><div class="gme-p4cols">${Array.from({ length: C }, (_, c) => `<button data-col="${c}" ${can(c) ? '' : 'disabled'} aria-label="Jouer colonne ${c + 1}">${GX.icon('chevdown', 'sm')}</button>`).join('')}</div>
          <div class="gme-p4 ${s.over ? 'over' : ''}" data-p4>${Array.from({ length: C }, (_, c) => `<div class="gme-col ${can(c) ? 'can' : ''}" data-c="${c}">${Array.from({ length: R }, (_, r) => { const v = s.g[r][c]; return `<div class="gme-hole">${v ? `<i class="gme-disc ${win.has(r + ':' + c) ? 'win' : ''} ${s.lastRC && s.lastRC[0] === r && s.lastRC[1] === c ? 'last' : ''}" style="--c:${v === 'X' ? ME_C : OP_C}" ${s.lastRC && s.lastRC[0] === r && s.lastRC[1] === c ? 'data-new' : ''}></i>` : ''}</div>`; }).join('')}</div>`).join('')}</div></div></div>`;
      }
      /* Bataille navale */
      if (s.phase === 'placing') {
        if (s.ready) return `<div class="gme-game"><div class="gme-card gme-wait">${GX.icon('flag', 'lg')}<h3>Flotte en position</h3><span class="muted" style="font-size:13px">En attente du placement de votre adversaire… la partie démarrera toute seule, sans rien recharger.</span></div></div>`;
        const next = FLEET[s.drafts.length];
        return `<div class="gme-game"><div class="gme-navbar"><span class="t">${next ? `Placez le <b>${next[0]}</b> (${next[1]} cases)` : '<b>Flotte complète — à vous de valider.</b>'}</span>
            <button class="btn sm" data-dir>${GX.icon('refresh', 'sm')}${s.dir === 'H' ? 'Horizontal' : 'Vertical'}</button><button class="btn sm" data-rnd>${GX.icon('bolt', 'sm')}Aléatoire</button><button class="btn sm" data-clr ${s.drafts.length ? '' : 'disabled'}>${GX.icon('trash', 'sm')}Effacer</button></div>
          <div style="width:min(100%,520px);margin:0 auto">${seaHTML(s, 'place')}</div>
          <div class="gme-chips" style="justify-content:center">${FLEET.map(([n, sz], i) => `<span class="gme-chip ${i < s.drafts.length ? 'on' : ''}">${n} · ${sz}</span>`).join('')}</div>
          <div class="gme-msg">${GX.esc(s.msg)}</div>
          <button class="btn primary lg" data-valid style="justify-self:center" ${s.drafts.length === FLEET.length ? '' : 'disabled'}>${GX.icon('check', 'sm')}Valider ma flotte</button></div>`;
      }
      const left = s.foe.ships.filter((x) => x.hits < x.s);
      return `<div class="gme-game">${endHTML(s)}${turnHTML(s, `${GX.icon('target', 'sm')}À vous de tirer`)}<div class="gme-msg">${GX.esc(s.msg)}</div>
        <div class="gme-grids"><div><div class="gme-gt">${GX.icon('target', 'sm')}Grille adverse</div>${seaHTML(s, 'foe')}</div><div><div class="gme-gt">${GX.icon('flag', 'sm')}Ma flotte</div>${seaHTML(s, 'me', 'sm')}</div></div>
        <div class="gme-chips"><span class="faint" style="font-size:12.5px;margin-right:2px">Reste à couler :</span>${left.length ? left.map((x) => `<span class="gme-chip">${x.n} · ${x.s}</span>`).join('') : '<b style="color:var(--bony-orange);font-size:12.5px">plus rien !</b>'}</div></div>`;
    }
    function seaHTML(s, side, size = '') {
      let h = `<span></span>${Array.from({ length: 10 }, (_, c) => `<span class="hd">${c + 1}</span>`).join('')}`;
      const can = side === 'foe' ? !s.over && s.turn === 'me' : side === 'place' && s.drafts.length < FLEET.length;
      let prev = null;
      if (side === 'place' && s.hover >= 0 && FLEET[s.drafts.length]) { const cells = cellsFor(s.hover, FLEET[s.drafts.length][1], s.dir), occ = toFleet(s.drafts).occ; prev = { cells: cells || [s.hover], ok: canPlace(cells, occ) }; }
      const occMe = side !== 'foe' ? (side === 'place' ? toFleet(s.drafts).occ : s.me.occ) : null;
      for (let r = 0; r < 10; r++) {
        h += `<span class="hd">${'ABCDEFGHIJ'[r]}</span>`;
        for (let c = 0; c < 10; c++) {
          const i = r * 10 + c, cls = []; let mark = '';
          if (side === 'foe') { const v = s.myShots[i]; if (v) { cls.push(v); mark = v === 'miss' ? '•' : '✕'; } else cls.push('free'); }
          else if (side === 'me') { const v = s.foeShots[i]; if (occMe[i] >= 0) cls.push(v === 'sunk' ? 'sunk' : 'ship'); if (v) { if (v !== 'sunk') cls.push(v); mark = v === 'miss' ? '•' : '✕'; } }
          else { if (occMe[i] >= 0) cls.push('ship'); else cls.push('free'); if (prev?.cells.includes(i)) cls.push(prev.ok ? 'ok' : 'ko'); }
          h += `<i class="gme-sq ${cls.join(' ')}" data-sq="${i}" data-tip="${coord(i)}">${mark}</i>`;
        }
      }
      return `<div class="gme-sea ${size} ${can ? 'can' : ''}" data-sea="${side}">${h}</div>`;
    }

    /* ---------- Déroulé ---------- */
    function open(s) { active = s; render(true); if (s.turn === 'op' && !s.over) opMove(s); }
    function finish(s, res) {
      if (s.over) return; s.over = res; s.turn = null;
      history().push({ id: GX.uid('h'), game: s.gid, p1: ME, p2: s.opp, winner: res === 'draw' ? 'draw' : res === 'win' ? ME : s.opp, at: Date.now() });
      delete P.sess[s.gid + ':' + s.opp]; syncRun(s);
      if (active === s) { render(false); if (res === 'win') { const e = $('[data-end]'); if (e) confetti(e); } }
      else GX.shell?.notify?.({ app: 'games', u: s.opp, title: `${gOf(s.gid).l} · ${res === 'win' ? 'Victoire !' : res === 'lose' ? 'Défaite' : 'Match nul'}`, body: `Contre ${uName(s.opp)}`, silent: true });
    }
    function afterMove(s) { syncRun(s); if (active === s) render(false); }
    function opMove(s) {
      if (s.over || s.turn !== 'op' || s.pending || (s.gid === 'naval' && s.phase !== 'playing')) return;
      s.pending = true;
      later(() => {
        s.pending = false;
        if (s.over || s.turn !== 'op') return;
        if (s.gid === 'morpion') { const i = tttAI(s.b); s.b[i] = 'O'; s.last = i; const w = tttWin(s.b); s.turn = 'me'; if (w) return finish(s, w.p === 'draw' ? 'draw' : 'lose'); }
        if (s.gid === 'p4') { const c = p4AI(s.g), r = p4Drop(s.g, c); s.g[r][c] = 'O'; s.lastRC = [r, c]; const line = p4Line(s.g, r, c); s.turn = 'me'; if (line) { s.line = line; return finish(s, 'lose'); } if (s.g[0].every(Boolean)) return finish(s, 'draw'); }
        if (s.gid === 'naval') { const j = navAI(s.foeShots), res = shoot(s.me, s.foeShots, j); s.turn = 'me'; if (res.kind === 'sunk') GX.shell.hud(`Votre ${res.ship.n.toLowerCase()} est coulé`); if (s.me.ships.every((x) => x.hits >= x.s)) return finish(s, 'lose'); }
        afterMove(s); if (active === s) dropAnim(s);
      }, s.gid === 'naval' ? 800 : 650);
    }
    function play(s, arg) {
      if (s.over || s.turn !== 'me') return;
      s.msg = '';
      if (s.gid === 'morpion') { if (s.b[arg]) return; s.b[arg] = 'X'; s.last = arg; const w = tttWin(s.b); s.turn = 'op'; if (w) return finish(s, w.p === 'draw' ? 'draw' : 'win'); }
      if (s.gid === 'p4') { const r = p4Drop(s.g, arg); if (r < 0) return; s.g[r][arg] = 'X'; s.lastRC = [r, arg]; const line = p4Line(s.g, r, arg); s.turn = 'op'; if (line) { s.line = line; afterMove(s); dropAnim(s); return later(() => finish(s, 'win'), 600); } if (s.g[0].every(Boolean)) return finish(s, 'draw'); }
      if (s.gid === 'naval') { if (s.myShots[arg]) return; const res = shoot(s.foe, s.myShots, arg); s.msg = res.kind === 'sunk' ? `Coulé — ${res.ship.n} !` : res.kind === 'hit' ? 'Touché !' : 'Manqué.'; s.turn = 'op'; if (s.foe.ships.every((x) => x.hits >= x.s)) return finish(s, 'win'); }
      afterMove(s); if (s.gid === 'p4') dropAnim(s); opMove(s);
    }
    function dropAnim(s) {
      if (s.gid !== 'p4') return; const d = $('[data-new]'); if (!d) return;
      const hole = d.parentElement, dy = hole.offsetTop + hole.offsetHeight + 12;
      GX.animate(d, [{ transform: `translateY(-${dy}px)` }, { transform: 'none' }], { spring: 'bouncy' });
    }
    function abandon() {
      const s = active; if (!s || s.over) return;
      win.sheet(`<h3>Abandonner la partie ?</h3><div class="muted">La victoire ira à votre adversaire.</div>
        <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" style="background:var(--danger)">Abandonner</button></div>`, { width: 420, onClose: (v) => { if (v === 'ok') finish(s, 'lose'); } });
    }
    function startFromChallenge(c) {
      G.challenges.splice(G.challenges.indexOf(c), 1); GX.emit('badges');
      const gid = gOf(c.game).id, s = newSession(gid, c.from, false);   // le lanceur du défi commence
      if (gid === 'naval') s.turn = 'op';
      syncRun(s); open(s);
    }
    function openRun(r) {
      const gid = gOf(r.game).id; let s = P.sess[gid + ':' + r.vs];
      if (!s) { s = newSession(gid, r.vs, r.state !== 'ATTENTE'); if (r.state !== 'PLACEMENT' && gid === 'naval') { s.phase = 'playing'; s.me = toFleet(randomDrafts()); } syncRun(s); }
      open(s);
    }

    /* ---------- Câblage ---------- */
    function wire() {
      pane.querySelectorAll('[data-back2]').forEach((b) => (b.onclick = () => { active = null; render(true); }));
      if (active) return wireGame(active);
      if (tab !== 'lobby') return;
      pane.querySelectorAll('[data-ch]').forEach((el) => {
        const c = G.challenges[+el.dataset.ch];
        el.querySelector('[data-refuse]').onclick = () => {
          GX.animate(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(24px)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).onfinish = () => { G.challenges.splice(G.challenges.indexOf(c), 1); GX.emit('badges'); render(false); };
        };
        el.querySelector('[data-accept]').onclick = () => startFromChallenge(c);
      });
      pane.querySelectorAll('[data-run]').forEach((b) => (b.onclick = () => openRun(G.running[+b.dataset.run])));
      pane.querySelectorAll('[data-game]').forEach((b) => (b.onclick = () => { pick = b.dataset.game; render(false); }));
      pane.querySelectorAll('[data-target]').forEach((b) => (b.onclick = () => { target = b.dataset.target; render(false); }));
      pane.querySelectorAll('[data-dare]').forEach((b) => (b.onclick = () => {
        const uid = b.dataset.dare, g = gOf(pick); P.sent[uid] = g.id; target = null; render(false);
        GX.shell.hud(`Défi envoyé à ${first(uid)} · ${g.l}`);
        /* Simulation : le collègue accepte, la partie démarre toute seule (game:session:started) */
        later(() => {
          delete P.sent[uid];
          const s = newSession(g.id, uid, true); syncRun(s);
          GX.shell.notify({ app: 'games', u: uid, title: `${uName(uid)} a accepté votre défi`, body: `${g.l} · la partie démarre`, silent: true });
          if (!active) open(s); else if (tab === 'lobby') render(false);
        }, 3500 + Math.random() * 2500);
      }));
    }
    function wireGame(s) {
      if (s.gid === 'morpion') $('[data-ttt]')?.addEventListener('click', (e) => { const c = e.target.closest('[data-i]'); if (c) play(s, +c.dataset.i); });
      if (s.gid === 'p4') {
        pane.querySelectorAll('[data-col]').forEach((b) => (b.onclick = () => play(s, +b.dataset.col)));
        const board = $('[data-p4]');
        board?.addEventListener('click', (e) => { const col = e.target.closest('.gme-col.can'); if (col) play(s, +col.dataset.c); });
        board?.addEventListener('pointerover', (e) => { const col = e.target.closest('.gme-col'); board.querySelectorAll('.hov').forEach((x) => x.classList.remove('hov')); if (col?.classList.contains('can')) col.classList.add('hov'); });
      }
      if (s.gid === 'naval') {
        if (s.phase === 'placing') {
          /* La grille est redessinée au survol (aperçu ok / impossible) : son hôte garde les écouteurs */
          const host = $('[data-sea="place"]')?.parentElement;
          if (host) {
            host.addEventListener('pointerover', (e) => { const q = e.target.closest('[data-sq]'); if (!q || s.hover === +q.dataset.sq) return; s.hover = +q.dataset.sq; host.innerHTML = seaHTML(s, 'place'); });
            host.addEventListener('pointerleave', () => { s.hover = -1; host.innerHTML = seaHTML(s, 'place'); });
            host.addEventListener('click', (e) => {
              const q = e.target.closest('[data-sq]'), next = FLEET[s.drafts.length]; if (!q || !next) return;
              const cells = cellsFor(+q.dataset.sq, next[1], s.dir);
              if (!canPlace(cells, toFleet(s.drafts).occ)) { s.msg = 'Placement impossible ici — les navires ne peuvent pas se toucher.'; render(false); return; }
              s.msg = ''; s.drafts.push({ n: next[0], s: next[1], cells }); s.hover = -1; render(false);
            });
          }
          $('[data-dir]')?.addEventListener('click', () => { s.dir = s.dir === 'H' ? 'V' : 'H'; render(false); });
          $('[data-rnd]')?.addEventListener('click', () => { s.drafts = randomDrafts(); s.msg = ''; render(false); });
          $('[data-clr]')?.addEventListener('click', () => { s.drafts = []; s.msg = ''; render(false); });
          $('[data-valid]')?.addEventListener('click', () => {
            if (s.drafts.length !== FLEET.length) return;
            s.me = toFleet(s.drafts); s.ready = true; render(false);
            later(() => { s.phase = 'playing'; s.ready = false; syncRun(s); if (active === s) render(false); if (s.turn === 'op') opMove(s); }, 1600);
          });
        } else $('[data-sea="foe"]')?.addEventListener('click', (e) => { const q = e.target.closest('[data-sq]'); if (q && !s.myShots[+q.dataset.sq]) play(s, +q.dataset.sq); });
      }
    }

    /* Clavier : 1–9 au Morpion (pavé numérique), 1–7 au Puissance 4 */
    body.addEventListener('keydown', (e) => {
      if (!active || e.target.closest('input,select,textarea')) return;
      const n = parseInt(e.key, 10); if (!n) return;
      if (active.gid === 'morpion' && n <= 9) play(active, [6, 7, 8, 3, 4, 5, 0, 1, 2][n - 1]);
      if (active.gid === 'p4' && n <= 7) play(active, n - 1);
    });
    body.tabIndex = -1;

    render(false);
    let lastCount = badge();
    const off = [
      GX.on('badges', () => { setCount(); if (badge() !== lastCount) { lastCount = badge(); if (!active && tab === 'lobby') render(false); } }),
      GX.on('ctx', () => render(false)),
    ];
    return {
      destroy() { off.forEach((o) => o()); timers.forEach(clearTimeout); timers.clear(); },
      command(c) {
        if (typeof c !== 'string') return;
        if (c.startsWith('tab:')) { const t = c.slice(4); if (TABS.some((x) => x[0] === t)) { active = null; tab = t; render(true); } return; }
        if (!c.startsWith('play:')) return;
        const [, gid, uid] = c.split(':'); if (!GAMES.some((g) => g.id === gid) || !uid) return;
        const s = P.sess[gid + ':' + uid]; if (s) open(s);
      },
      menus: () => ({
        'Partie': [
          { label: 'Retour au lobby', icon: 'back', disabled: !active, action: () => { active = null; tab = 'lobby'; render(true); } },
          { label: 'Abandonner…', icon: 'flag', disabled: !active || !!active.over, action: abandon },
        ],
        'Présentation': TABS.map(([v, l]) => ({ label: l, checked: !active && tab === v, action: () => { active = null; tab = v; render(true); } })),
      }),
    };
  }

  GX.registerApp({ id: 'games', name: 'Jeux', icon: 'games', tint: ['#b36bff', '#6a2bd9'], size: [1100, 740], minSize: [360, 320], badge, mount });
})();
