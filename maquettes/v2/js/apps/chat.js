/* =====================================================================
   Rubrique « Chat » (miroir de pages/Chat.tsx), façon Messages de macOS
   - 3 sections : Général (invisible pour External), Groupes, Messages Privés
   - sourdine / épingle, « + » : message privé ou groupe de travail
   - thème PARTAGÉ par conversation (fond + couleur des bulles)
   - texte (aperçu de lien), image, fichier, vocal, projet cité, GIF
   - réactions, réponse citée, modifier / supprimer, « Vu par »
   - simulation : « … est en train d'écrire » puis réponse fictive
   - large = split liste / conversation ; étroit = pile liste → détail
   v2.2 (parité Chat.tsx + arbitrage du lot 3) :
   - thème (fond + bulles) PARTAGÉ par tous les membres, jamais sur le Chat
     Général (inviolable : ni bouton, ni menu) ; import d'une image de fond
     (JPEG/PNG/WebP, 8 Mo) ; couleurs de bulles réelles (Or, Menthe : texte foncé)
   - « Vu par » sous le dernier message : lecteurs hors auteur et hors moi ;
     « Vu par tout le monde » ; au-delà de 5 lecteurs, « Vu par N personnes »
     (liste complète en infobulle)
   - sections toujours affichées (« Aucun groupe », « Aucune conversation
     privée »), compteur 99+, épingle sur l'avatar, horodatage « il y a 5min »
   - External : pas de Général, « + » ouvre directement le message privé,
     pas de « Citer un projet », carte projet neutre « Projet cité »
   - Citer un projet : projets ACTIFS non échus, triés par échéance
   - pièces jointes : 100 Mo max, fichier vide refusé, coller un fichier,
     « Pièce jointe expirée » (ménage à 180 jours)
   - groupe : photo partagée (glisser-déposer, zoom), renommage et membres
     par l'admin, retrait confirmé ; pas de promotion d'admin (absente de Gearbox)
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt, ME = 'me';
  const REACTS = ['👍', '❤️', '😂', '😮'];

  /* Thèmes partagés : ce sont des DONNÉES (nom → rendu), pas des couleurs d'interface */
  const BGS = {
    Couleurs: {
      'Miami': 'linear-gradient(160deg,#ff5fa2 0%,#ff9a6b 40%,#36d1dc 100%)',
      'Aurore boréale': 'radial-gradient(80% 60% at 20% 10%,rgba(52,211,153,.8),transparent 60%),radial-gradient(70% 60% at 85% 35%,rgba(139,92,246,.75),transparent 65%),radial-gradient(60% 50% at 50% 100%,rgba(34,211,238,.55),transparent 70%),#0b1026',
      'Agrumes': 'linear-gradient(135deg,#ffd000 0%,#ff8a00 48%,#a3e635 100%)',
      'Lagon': 'radial-gradient(90% 70% at 30% 0%,#5eead4,transparent 60%),linear-gradient(180deg,#06b6d4,#0e7490)',
      'Holographique': 'conic-gradient(from 210deg at 50% 50%,#ffd6f5,#c4b5fd,#a5f3fc,#bbf7d0,#fef08a,#fbcfe8,#ffd6f5)',
      'Synthwave': 'radial-gradient(circle at 50% 36%,#ffb347 0 11%,transparent 11.5%),repeating-linear-gradient(0deg,rgba(255,64,200,.4) 0 2px,transparent 2px 38px),repeating-linear-gradient(90deg,rgba(255,64,200,.4) 0 2px,transparent 2px 38px),linear-gradient(180deg,#1a0536 0%,#5b0f7a 55%,#ff2e88 100%)',
    },
    Motifs: {
      'Terrazzo': 'radial-gradient(circle at 20% 30%,#e76f51 0 6px,transparent 7px) 0 0/92px 92px,radial-gradient(circle at 70% 62%,#2a9d8f 0 5px,transparent 6px) 0 0/92px 92px,radial-gradient(circle at 44% 82%,#e9c46a 0 4px,transparent 5px) 0 0/92px 92px,radial-gradient(circle at 86% 14%,#264653 0 3px,transparent 4px) 0 0/92px 92px,#f3ece4',
      'Confettis': 'radial-gradient(circle,#f75632 2.5px,transparent 3px) 0 0/38px 38px,radial-gradient(circle,#22c3d6 2px,transparent 2.5px) 19px 12px/38px 38px,radial-gradient(circle,#ffcc33 2px,transparent 2.5px) 8px 27px/38px 38px,radial-gradient(circle,#b36bff 2px,transparent 2.5px) 29px 31px/38px 38px,#1c1530',
      'Memphis': 'radial-gradient(circle,#111 1.5px,transparent 2px) 0 0/18px 18px,linear-gradient(135deg,#ff6fb5 25%,transparent 25%) 0 0/60px 60px,linear-gradient(225deg,#3ec5ff 25%,transparent 25%) 30px 30px/60px 60px,#ffe45c',
      'Bulles néon': 'radial-gradient(circle at 20% 30%,transparent 18px,#ff2fd1 19px 21px,transparent 22px) 0 0/120px 120px,radial-gradient(circle at 70% 70%,transparent 10px,#2ff3ff 11px 13px,transparent 14px) 0 0/120px 120px,radial-gradient(circle at 80% 20%,transparent 6px,#b6ff2f 7px 8px,transparent 9px) 0 0/90px 90px,#0d0620',
    },
    Sobres: {
      'Grille technique': 'linear-gradient(rgba(120,170,255,.16) 1px,transparent 1px) 0 0/22px 22px,linear-gradient(90deg,rgba(120,170,255,.16) 1px,transparent 1px) 0 0/22px 22px,linear-gradient(rgba(120,170,255,.32) 1px,transparent 1px) 0 0/110px 110px,linear-gradient(90deg,rgba(120,170,255,.32) 1px,transparent 1px) 0 0/110px 110px,#0f1f3d',
      'Ardoise': 'radial-gradient(120% 80% at 0% 0%,rgba(255,255,255,.08),transparent 60%),linear-gradient(160deg,#2b3038,#1a1d22)',
    },
  };
  const BG = Object.assign({}, ...Object.values(BGS));
  const BUBBLES = {
    'Bony': 'linear-gradient(135deg,#f75632,#8f12ab)', 'Océan': 'linear-gradient(135deg,#0ea5e9,#2563eb)', 'Lagon': 'linear-gradient(135deg,#06b6d4,#14b8a6)',
    'Forêt': 'linear-gradient(135deg,#22c55e,#15803d)', 'Coucher': 'linear-gradient(135deg,#fb7185,#f97316)', 'Violine': 'linear-gradient(135deg,#a855f7,#6366f1)',
    'Framboise': 'linear-gradient(135deg,#ec4899,#be123c)', 'Nuit': 'linear-gradient(135deg,#334155,#0f172a)', 'Or': 'linear-gradient(135deg,#fbbf24,#f59e0b)',
    'Menthe': 'linear-gradient(135deg,#a7f3d0,#5eead4)', 'Graphite': '#3f3f46', 'Orange uni': '#f75632',
  };
  const DARK_TEXT = ['Or', 'Menthe'];                 // texteSombre : texte foncé sur ces bulles
  const VU_PAR_MAX_NOMS = 5;                           // au-delà : « Vu par N personnes » (décision de Théo)
  const MAX_UPLOAD = 100 * 1024 * 1024, IMG_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const poids = (o) => (!o ? '' : o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`);
  const GIFS = [
    ['Bravo !', '👏', '#f75632', '#ffcc33'], ['On y va !', '🚀', '#293f74', '#22c3d6'], ['Merci', '🙏', '#8f12ab', '#f472b6'], ['Mdr', '😂', '#f59e0b', '#ef4444'],
    ['Café ?', '☕', '#78350f', '#d97706'], ['Top', '👌', '#16a34a', '#a3e635'], ['Wow', '🤩', '#7c3aed', '#22d3ee'], ['Vendredi !', '🎉', '#e11d74', '#f97316'],
    ['Au boulot', '💪', '#0f172a', '#64748b'], ['Bien joué', '🏆', '#b45309', '#fde047'],
  ];

  GX.css(`
  .cht-side{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;overflow:hidden}
  .cht-side > .app-head{padding:18px 16px 10px;background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;flex-wrap:nowrap}
  .cht-side > .app-head .ah-t h1{font-size:20px!important}
  .cht-lhead{padding:0 12px 8px;display:grid;gap:8px}
  .cht-none{padding:4px 10px 8px;font-size:12.5px;color:var(--text-3);font-style:italic}
  .cht-pin{position:absolute;right:-3px;top:-3px;width:16px;height:16px;border-radius:50%;display:grid;place-items:center;background:var(--warn);color:#fff;box-shadow:0 0 0 2px var(--surface-1)}
  .cht-pin svg.i{width:9px;height:9px;fill:currentColor}
  .cht-avw{position:relative;flex:none;display:grid}
  .cht-exp{display:flex;align-items:center;gap:10px;font-style:normal}
  .cht-exp span{display:block;font-size:12px;opacity:.8}
  .cht-time{font-size:11.5px;color:var(--text-2);margin:2px 6px 0}
  .cht-seen svg.i{width:13px;height:13px;vertical-align:-2px;margin-right:4px}
  .cht-list{flex:1;min-height:0;padding:0 10px 14px;overflow-x:hidden}
  .cht-sec{display:flex;align-items:center;gap:6px;padding:14px 8px 6px;font-family:var(--font-display);font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text)}
  .cht-sec span{font-family:var(--font-ui);letter-spacing:0;color:var(--text-2)}
  /* Ligne de conversation : avatar | bloc (nom + heure / aperçu + pastille), tout reste DANS la colonne */
  .cht-row{display:flex;align-items:center;gap:10px;width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:8px 10px;border-radius:12px;cursor:pointer;position:relative;overflow:hidden;transition:background var(--t-fast)}
  .cht-rb{flex:1 1 auto;min-width:0;display:grid;gap:2px}
  .cht-l1,.cht-l2{display:flex;align-items:center;gap:6px;min-width:0}
  .cht-l1 .nm{flex:0 1 auto;min-width:0}
  .cht-l1 .sp{flex:1 1 0;min-width:4px}
  .cht-l2 .cht-prev{flex:1 1 auto;min-width:0}
  .cht-l2 .count{flex:none}
  .cht-row .cht-ind{flex:none}
  .cht-row+.cht-row{margin-top:1px}
  .cht-row:hover{background:var(--surface-3)}
  .cht-row.sel{background:var(--bony-grad);color:#fff}
  .cht-row.sel .cht-prev,.cht-row.sel .cht-when,.cht-row.sel .cht-ind{color:rgba(255,255,255,.86)}
  .cht-row.sel .cht-prev.typ{color:#fff}
  .cht-row.sel .count{background:#fff;color:var(--bony-orange)}
  .cht-row .nm{font-weight:650;font-size:var(--fs-14)}.cht-row.unread .nm{font-weight:800}
  .cht-row .cht-when{flex:none;font-size:12px;color:var(--text-2);white-space:nowrap;font-variant-numeric:tabular-nums}
  .cht-prev{font-size:var(--fs-13);color:var(--text-2);line-height:1.35}
  .cht-row.unread .cht-prev{color:var(--text)}
  .cht-prev.typ{color:var(--accent);font-style:italic}
  .cht-row .count.muted{background:var(--surface-4);color:var(--text-2)}
  .cht-ind{color:var(--text-3);display:inline-flex}
  .cht-ind svg.i{width:12px;height:12px}
  .cht-racts{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:flex;gap:2px;padding:2px;border-radius:9px;background:var(--surface-2);box-shadow:var(--shadow-1);opacity:0;pointer-events:none;transition:opacity var(--t-fast)}
  .cht-row:hover .cht-racts{opacity:1;pointer-events:auto}
  .cht-racts .on svg.i{fill:currentColor}
  .cht-gav{--s:40px;width:var(--s);height:var(--s);border-radius:50%;display:grid;place-items:center;color:#fff;flex:none}
  .cht-gav.sm{--s:30px}.cht-gav svg.i{width:48%;height:48%}
  .cht-gbtn{position:relative;border-radius:50%;flex:none;display:grid}
  .cht-gbtn::after{content:"";position:absolute;right:-2px;bottom:-2px;width:13px;height:13px;border-radius:50%;background:var(--accent) center/9px no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 8h3l2-3h6l2 3h3v11H4z'/%3E%3Ccircle cx='12' cy='13' r='3.5'/%3E%3C/svg%3E");box-shadow:0 0 0 2px var(--surface-1)}
  .cht-gbtn:hover{filter:brightness(1.1)}
  .cht-duo{position:relative;width:40px;height:40px;flex:none}
  .cht-duo .av{position:absolute;--s:27px;box-shadow:0 0 0 2px var(--surface-0)}
  .cht-duo .av:first-child{left:0;top:0}.cht-duo .av:last-child{right:0;bottom:0}
  .cht-duo.sm{width:30px;height:30px}.cht-duo.sm .av{--s:20px}
  .cht-row .av.lg{--s:40px}

  .cht-conv{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0}
  .cht-head{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--line);flex:none;min-width:0;background:var(--surface-1)}
  .stack-head .cht-head{border:0;padding:0;flex:1;background:none;gap:8px}
  .cht-head .nm{font-weight:700;font-size:15px;display:flex;align-items:center;gap:4px;min-width:0}
  .cht-head > .btn,.cht-head > .icon-btn,.cht-head > .av-stack,.cht-head > .cht-gbtn{flex:none}
  .cht-head .sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cht-head .sub{font-size:12.5px;color:var(--text-2)}
  .cht-rename{height:28px;font-weight:700;font-size:14px}
  .cht-pane{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;background:var(--surface-1)}
  .cht-wall{position:absolute;inset:0;pointer-events:none;transition:opacity var(--t-med)}
  .cht-wall::after{content:"";position:absolute;inset:0;background:color-mix(in srgb,var(--surface-1) 42%,transparent)}
  .cht-scroll{position:relative;flex:1;min-height:0;padding:14px 20px 10px}
  /* Pleine largeur du panneau, comme une vraie messagerie : les autres à gauche, moi à droite */
  .cht-msgs{width:100%;display:flex;flex-direction:column}
  .cht-day{align-self:center;margin:14px 0 8px;font-size:12px;font-weight:700;color:var(--text-2)}
  .cht-day span{padding:3px 11px;border-radius:99px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line)}
  .cht-sys{align-self:center;margin:6px 0;font-size:12.5px;color:var(--text-2);text-align:center;padding:3px 11px;border-radius:99px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line)}
  .cht-msg{display:flex;align-items:flex-end;gap:8px;margin-top:2px}
  .cht-msg.first{margin-top:10px}
  .cht-msg.me{flex-direction:row-reverse}
  .cht-msg .av{--s:28px}
  .cht-avsp{width:28px;flex:none}
  .cht-col{display:flex;flex-direction:column;align-items:flex-start;max-width:68%;min-width:0}
  .cht-msg.me .cht-col{align-items:flex-end}
  .cht-author{font-size:12px;font-weight:700;margin:0 0 2px 12px;color:var(--text-2)}
  .cht-bwrap{position:relative;display:flex;max-width:100%}
  /* Bulles : les autres = surface opaque + contour (lisibles sur n'importe quel thème de fond) ; moi = dégradé partagé, texte blanc ombré */
  .cht-b{padding:7px 12px;border-radius:18px;background:var(--surface-3);color:var(--text);font-size:var(--fs-14);line-height:1.42;overflow-wrap:anywhere;white-space:pre-wrap;box-shadow:inset 0 0 0 1px var(--line),0 1px 2px rgba(0,0,0,.12);min-width:0}
  :root[data-theme="light"] .cht-b{background:#fff;box-shadow:inset 0 0 0 1px var(--line-2),0 1px 2px rgba(20,16,30,.08)}
  .cht-msg.me .cht-b{background:var(--cht-me);color:var(--cht-me-fg,#fff);box-shadow:0 1px 2px rgba(0,0,0,.14);text-shadow:var(--cht-me-ts,0 1px 1px rgba(0,0,0,.22))}
  .cht-msg:not(.me):not(.first) .cht-b,.cht-msg:not(.me):not(.first) .cht-media{border-top-left-radius:6px}
  .cht-msg:not(.me):not(.last) .cht-b,.cht-msg:not(.me):not(.last) .cht-media{border-bottom-left-radius:6px}
  .cht-msg.me:not(.first) .cht-b,.cht-msg.me:not(.first) .cht-media{border-top-right-radius:6px}
  .cht-msg.me:not(.last) .cht-b,.cht-msg.me:not(.last) .cht-media{border-bottom-right-radius:6px}
  .cht-b a{color:inherit;text-decoration:underline;text-underline-offset:2px}
  .cht-ed{font-size:12.5px;opacity:.8;margin-left:6px;white-space:nowrap}
  .cht-b.del{font-style:italic;color:var(--text-2);background:color-mix(in srgb,var(--surface-2) 80%,transparent);text-shadow:none;box-shadow:inset 0 0 0 1px var(--line-2);display:flex;align-items:center;gap:6px}
  .cht-msg.me .cht-b.del{background:color-mix(in srgb,var(--surface-2) 80%,transparent);color:var(--text-2)}
  .cht-quote{display:grid;gap:1px;text-align:left;max-width:100%;margin:2px 0 3px;padding:5px 10px;border-radius:12px;font-size:12.5px;color:var(--text-2);background:var(--surface-2);box-shadow:inset 3px 0 0 var(--accent),inset 0 0 0 1px var(--line)}
  .cht-quote b{font-size:12px;color:var(--text)}
  .cht-lp{display:grid;gap:2px;margin-top:6px;padding:8px 10px;border-radius:12px;background:rgba(0,0,0,.16);font-size:12.5px;white-space:normal;text-shadow:none}
  .cht-msg:not(.me) .cht-lp{background:var(--surface-2)}
  .cht-lp .d{font-size:12.5px;opacity:.8;text-transform:uppercase;letter-spacing:.04em}
  .cht-media{border-radius:18px;overflow:hidden;display:block;cursor:zoom-in;transition:transform var(--t-fast) var(--ease-out)}
  .cht-media:active{transform:scale(.98)}
  .cht-photo{width:240px;max-width:100%;aspect-ratio:4/3;position:relative;display:grid;place-items:center;color:rgba(255,255,255,.9);
    background:radial-gradient(circle at 78% 22%,rgba(255,255,255,.75) 0 7%,transparent 7.5%),linear-gradient(180deg,transparent 58%,rgba(0,0,0,.35) 58%),linear-gradient(160deg,hsl(var(--h) 75% 62%),hsl(calc(var(--h) + 50) 60% 34%))}
  .cht-photo svg.i{width:64px;height:64px;stroke-width:1.3;transform:translateY(16%)}
  .cht-photo em{position:absolute;left:10px;bottom:8px;font-size:12.5px;font-style:normal;opacity:.85}
  .cht-media img{display:block;max-width:260px;max-height:260px;object-fit:cover}
  .cht-file{display:flex;align-items:center;gap:10px;white-space:normal}
  .cht-file .fi{width:34px;height:40px;border-radius:7px;display:grid;place-items:center;background:rgba(255,255,255,.18);flex:none}
  .cht-msg:not(.me) .cht-file .fi{background:var(--surface-4)}
  .cht-file span{display:block;font-size:12px;opacity:.8}
  .cht-voice{display:flex;align-items:center;gap:10px;min-width:210px}
  .cht-voice .pl{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.22);flex:none}
  .cht-msg:not(.me) .cht-voice .pl{background:var(--surface-4)}
  .cht-voice .pl svg.i{width:13px;height:13px;fill:currentColor;stroke:none}
  .cht-wave{display:flex;align-items:center;gap:2px;height:26px;flex:1;--p:0}
  .cht-wave i{flex:1;min-width:2px;border-radius:2px;background:currentColor;opacity:.4;transition:opacity 80ms}
  .cht-wave i.on{opacity:1}
  .cht-proj{display:flex;gap:10px;align-items:center;text-align:left;width:280px;max-width:100%;padding:10px 12px;border-radius:16px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line-2),var(--shadow-1);transition:transform var(--t-fast) var(--ease-out),box-shadow var(--t-fast)}
  .cht-proj:hover{box-shadow:inset 0 0 0 1px var(--accent),var(--shadow-1)}.cht-proj:active{transform:scale(.97)}
  .cht-proj .ic{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--bony-grad);color:#fff;flex:none}
  .cht-proj .grow{display:grid;gap:3px}
  .cht-gif{width:200px;max-width:100%;aspect-ratio:1.25;position:relative;display:grid;place-items:center;color:#fff;border-radius:18px;overflow:hidden;
    background:linear-gradient(135deg,var(--g1),var(--g2),var(--g1));background-size:300% 300%;animation:cht-gif 2.4s ease-in-out infinite}
  .cht-gif .e{font-size:54px;animation:cht-bob 1.1s var(--ease-out) infinite alternate;filter:drop-shadow(0 6px 10px rgba(0,0,0,.3))}
  .cht-gif b{position:absolute;bottom:10px;left:0;right:0;text-align:center;font-size:15px;text-shadow:0 2px 8px rgba(0,0,0,.45);letter-spacing:.02em}
  .cht-gif .tag{position:absolute;top:8px;left:8px;padding:1px 6px;border-radius:5px;font-size:10px;font-weight:800;background:rgba(0,0,0,.4)}
  @keyframes cht-gif{50%{background-position:100% 100%}}
  @keyframes cht-bob{to{transform:translateY(-8px) rotate(-6deg) scale(1.08)}}
  .cht-reacts{display:flex;gap:4px;margin-top:3px;flex-wrap:wrap}
  .cht-react{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:99px;font-size:13px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line-2);transition:transform var(--t-fast) var(--ease-out)}
  .cht-react span{font-size:12px;font-weight:700;color:var(--text)}
  .cht-react.mine{background:var(--sel);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 55%,transparent)}
  .cht-react.mine span{color:var(--accent)}
  .cht-react:active{transform:scale(.88)}
  .cht-tools{position:absolute;bottom:calc(100% + 4px);left:0;z-index:3;display:flex;align-items:center;gap:1px;padding:3px;border-radius:99px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line-2),var(--shadow-2);
    opacity:0;transform:translateY(4px) scale(.92);transform-origin:bottom left;pointer-events:none;transition:opacity var(--t-fast),transform var(--t-med) var(--spring-snappy)}
  .cht-msg.me .cht-tools{left:auto;right:0;transform-origin:bottom right}
  .cht-msg:hover .cht-tools{opacity:1;transform:none;pointer-events:auto;transition-delay:120ms}
  .cht-tools button{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:15px;color:var(--text-2);transition:transform var(--t-fast) var(--ease-out),background var(--t-fast)}
  .cht-tools button:hover{background:var(--surface-4);transform:scale(1.18)}
  .cht-seen{font-size:12px;color:var(--text-2);margin:3px 4px 0;align-self:flex-start;animation:ui-fade-up var(--t-med) var(--spring-soft) both}
  .cht-seen.me{align-self:flex-end}
  /* Sur un thème de fond, les micro-textes (auteur, « Vu par », « écrit… ») reçoivent une pastille pour rester lisibles */
  .cht-pane:has(.cht-wall:not([style*="display:none"])) :is(.cht-seen,.cht-author,.cht-typl){padding:1px 8px;border-radius:99px;background:color-mix(in srgb,var(--surface-1) 78%,transparent);width:fit-content}
  .cht-flash .cht-b,.cht-flash .cht-media,.cht-flash .cht-proj{animation:cht-flash 1.1s ease}
  @keyframes cht-flash{30%{box-shadow:0 0 0 3px var(--accent)}}
  .cht-typing .cht-b{display:flex;gap:4px;align-items:center;height:34px;padding:0 13px}
  .cht-typing .cht-b i{width:7px;height:7px;border-radius:50%;background:var(--text-3);animation:cht-dot 1.2s infinite ease-in-out}
  .cht-typing .cht-b i:nth-child(2){animation-delay:.15s}.cht-typing .cht-b i:nth-child(3){animation-delay:.3s}
  @keyframes cht-dot{0%,60%,100%{transform:none;opacity:.5}30%{transform:translateY(-4px);opacity:1}}
  .cht-typl{font-size:12px;color:var(--text-2);margin:3px 0 0 36px}

  .cht-compose{position:relative;flex:none;padding:8px 12px 10px;border-top:1px solid var(--line);background:var(--surface-1)}
  .cht-banner{display:flex;align-items:center;gap:8px;margin:0 0 7px;padding:6px 8px 6px 10px;border-radius:10px;background:var(--surface-2);box-shadow:inset 3px 0 0 var(--accent);font-size:var(--fs-13);animation:ui-fade-up var(--t-med) var(--spring-snappy) both}
  .cht-bar{display:flex;align-items:flex-end;gap:2px;width:100%}
  .cht-bar .icon-btn{height:36px;width:34px}
  .cht-giftxt{font-size:11.5px;font-weight:800;letter-spacing:.02em}
  .cht-input{flex:1;min-width:0;min-height:36px;display:flex;align-items:flex-end;margin-left:4px;border-radius:18px;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow var(--t-fast)}
  .cht-input:focus-within{box-shadow:inset 0 0 0 1px var(--accent),0 0 0 3px var(--focus)}
  .cht-input textarea{flex:1;min-width:0;border:0;outline:0;background:transparent;resize:none;padding:8px 12px;line-height:20px;max-height:130px;font:inherit;font-size:var(--fs-14);color:var(--text)}
  .cht-input textarea::placeholder{color:var(--text-3)}
  .cht-send{width:36px;height:36px;margin-left:6px;border-radius:50%;display:grid;place-items:center;flex:none;background:var(--cht-me,var(--bony-grad));color:#fff;transition:transform var(--t-med) var(--spring-bouncy),opacity var(--t-fast)}
  .cht-send[disabled]{opacity:.35;transform:scale(.85);pointer-events:none}
  .cht-send svg.i{stroke-width:2.4}
  .cht-plus{display:none}
  .cht-rec{display:flex;align-items:center;gap:10px;height:36px}
  .cht-rec .dot{width:10px;height:10px;border-radius:50%;background:var(--danger);animation:cht-rec 1s infinite}
  @keyframes cht-rec{50%{opacity:.25}}
  .cht-recwave{flex:1;display:flex;align-items:center;gap:3px;height:28px;overflow:hidden;min-width:0}
  .cht-recwave i{flex:none;width:3px;border-radius:2px;background:var(--danger);animation:cht-bar .9s ease-in-out infinite alternate}
  @keyframes cht-bar{from{height:4px}to{height:26px}}
  .cht-gifs{position:absolute;left:12px;right:12px;bottom:calc(100% + 6px);z-index:5;max-width:420px;padding:10px;border-radius:16px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line-2),var(--shadow-3);animation:ui-pop var(--t-med) var(--spring-snappy) both;transform-origin:bottom left}
  .cht-gifgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px;margin-top:8px;max-height:220px}
  .cht-gifgrid .cht-gif{width:100%;border-radius:12px;cursor:pointer}
  .cht-gifgrid .cht-gif .e{font-size:30px}.cht-gifgrid .cht-gif b{font-size:11px;bottom:6px}
  .cht-pick{max-height:min(46vh,340px);margin-top:10px;display:grid;gap:2px}
  .cht-pick .list-row{cursor:pointer}
  .cht-bggrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;margin:6px 0 12px}
  .cht-bgt{display:grid;gap:5px;font-size:12px;font-weight:600;color:var(--text-2);text-align:center}
  .cht-bgt>span{height:54px;border-radius:12px;box-shadow:inset 0 0 0 1px var(--line-2);transition:box-shadow var(--t-fast),transform var(--t-fast) var(--ease-out)}
  .cht-bgt:hover>span{transform:scale(1.04)}
  .cht-bgt.on>span{box-shadow:0 0 0 2px var(--surface-1),0 0 0 4px var(--accent)}
  .cht-bgt.on{color:var(--text)}
  .cht-sw{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 4px}
  .cht-sw button{width:30px;height:30px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2);transition:transform var(--t-fast) var(--ease-out),box-shadow var(--t-fast)}
  .cht-sw button:hover{transform:scale(1.12)}
  .cht-sw button.on{box-shadow:0 0 0 2px var(--surface-1),0 0 0 4px var(--accent)}
  .cht-prev-box{position:relative;height:92px;border-radius:14px;overflow:hidden;margin-top:12px;padding:12px;display:flex;flex-direction:column;justify-content:center;gap:6px;box-shadow:inset 0 0 0 1px var(--line-2)}
  .cht-prev-box .b{position:relative;max-width:70%;padding:6px 11px;border-radius:16px;font-size:13px}
  .cht-prev-box .b.o{background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line)}
  :root[data-theme="light"] .cht-prev-box .b.o{background:#fff}
  .cht-prev-box .b.m{align-self:flex-end;color:#fff}
  @container app (max-width:520px){
    .cht-bar .opt{display:none}.cht-plus{display:inline-grid}
    .cht-col{max-width:82%}.cht-scroll{padding:10px 10px 8px}
    .cht-head .av-stack,.cht-hl{display:none}
    .cht-scroll{padding:10px 10px 8px}
    .cht-compose{padding:7px 8px 9px}
  }
  `);

  /* ---------------- Données dérivées ---------------- */
  const role = () => GX.ctx.role;
  const visible = () => D.CONVS.filter((c) => c.members.includes(ME) && !(c.kind === 'general' && role() === 'External'));
  const msgs = (c) => (D.MESSAGES[c.id] ||= []);
  const lastOf = (c) => { const a = msgs(c); return a[a.length - 1]; };
  const other = (c) => c.members.find((u) => u !== ME) || ME;
  const title = (c) => (c.kind === 'dm' ? D.user(other(c)).name : c.name);
  const first = (uid) => (uid === ME ? 'vous' : D.user(uid).name.split(' ')[0]);
  const isAdmin = (c) => c.kind === 'group' && (c.admins || []).includes(ME);
  const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  /* La sourdine coupe le push, PAS le compteur non lu (comportement Messenger, comme Gearbox) */
  const badge = () => visible().reduce((s, c) => s + (c.unread || 0), 0);
  const order = () => { const v = visible(); const s = (a) => a.sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0) || (lastOf(y)?.at || 0) - (lastOf(x)?.at || 0)); return [...v.filter((c) => c.kind === 'general'), ...s(v.filter((c) => c.kind === 'group')), ...s(v.filter((c) => c.kind === 'dm'))]; };

  /* Une pièce jointe expirée (ménage automatique à 180 jours) dans « Salon de Rodez » */
  if (D.MESSAGES.c1 && !D.MESSAGES.c1.some((m) => m.id === 'c1exp')) {
    const ref = D.MESSAGES.c1[0];
    D.MESSAGES.c1.unshift({ id: 'c1exp', u: 'u2', t: '', at: (ref?.at || Date.now()) - 190 * 864e5, type: 'file', file: 'Devis stand 2025.pdf · 840 Ko', expired: true, r: {} });
  }
  /* Un exemple de lien dans « Team Digital », pour l'aperçu de lien */
  if (D.MESSAGES.c2 && !D.MESSAGES.c2.some((m) => m.id === 'c2link')) {
    const ref = D.MESSAGES.c2[1];
    D.MESSAGES.c2.splice(2, 0, { id: 'c2link', u: 'u3', t: 'Le brief de la campagne est ici : https://www.bony-automobiles.fr/offres', at: (ref?.at || Date.now()) + 20 * 6e4, type: 'text', r: { '👍': ['u7'] } });
  }

  /* relativeTime() de Chat.tsx */
  function when(at) {
    const min = Math.floor((Date.now() - at) / 6e4);
    if (min < 1) return 'à l’instant'; if (min < 60) return `il y a ${min}min`;
    const h = Math.floor(min / 60); if (h < 24) return `il y a ${h}h`; if (h < 48) return 'hier';
    return new Date(at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
  /* dayLabel() de Chat.tsx : Aujourd'hui, Hier, sinon « 12 septembre 2026 » */
  function dayLabel(at) {
    const d = new Date(at), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return 'Aujourd’hui';
    if (d.toDateString() === y.toDateString()) return 'Hier';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  const hhmm = (at) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  function preview(c, m) {
    if (!m) return 'Aucun message';
    if (m.type === 'sys') return m.t;
    const who = m.u === ME ? 'Vous : ' : c.kind !== 'dm' ? first(m.u) + ' : ' : '';
    if (m.deleted) return who + 'Message supprimé';
    const b = { image: '📷 Image', file: '📎 ' + String(m.file || 'Pièce jointe').split(' · ')[0], voice: `🎤 Message vocal${m.dur ? ` (${m.dur})` : ''}`, project: '📋 ' + (D.project(m.project)?.name || 'Projet'), gif: '📷 GIF' }[m.type];
    return who + (b ?? m.t);
  }
  function convAv(c, size = 'lg') {
    if (c.kind === 'dm') { const u = D.user(other(c)); return `<span class="av ${size}" style="--c:${u.color}">${u.initials}${u.online ? '<i class="pres"></i>' : ''}</span>`; }
    if (c.kind === 'general') return `<span class="cht-gav ${size === 'lg' ? '' : 'sm'}" style="background:var(--bony-grad);font-weight:800;font-size:${size === 'lg' ? 18 : 14}px">#</span>`;
    if (c.photo) return `<span class="cht-gav ${size === 'lg' ? '' : 'sm'}" style="background:${c.photo}"></span>`;
    const [a, b] = c.members.filter((u) => u !== ME);
    return `<span class="cht-duo ${size === 'lg' ? '' : 'sm'}">${GX.r.av(a || ME, 'sm')}${GX.r.av(b || ME, 'sm')}</span>`;
  }
  /* Membres réels d'une conversation : le Général = tous les comptes ayant le chat, sauf External (hasSocialFeatures) */
  const membersOf = (c) => (c.kind === 'general' ? D.USERS.filter((u) => u.role !== 'External' && u.role !== 'Site Manager').map((u) => u.id) : c.members);
  const seenOf = (c, m) => m.seen ?? (m.seen = (() => { const o = membersOf(c).filter((u) => u !== m.u); return c.kind === 'general' ? o.filter((u, i) => i % 3 !== 2) : o; })());
  /* vuPar() de Chat.tsx : candidats = membres hors auteur ET hors moi (je l'ai vu, je le regarde) */
  function seen(c, m) {
    const cand = membersOf(c).filter((u) => u !== m.u && u !== ME); if (!cand.length) return null;
    const rd = seenOf(c, m).filter((u) => cand.includes(u)); if (!rd.length) return null;
    const noms = rd.map((u) => D.user(u).name);
    const l = rd.length === cand.length && cand.length > 1 ? 'Vu par tout le monde' : rd.length > VU_PAR_MAX_NOMS ? `Vu par ${rd.length} personnes` : `Vu par ${noms.join(', ')}`;
    return { l, noms };
  }
  function linkify(t) { return GX.esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" data-a="link">$1</a>'); }
  function linkPreview(t) {
    const u = /(https?:\/\/[^\s<]+)/.exec(t || ''); if (!u) return '';
    let host = ''; try { host = new URL(u[1]).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
    const ttl = host.includes('bony') ? 'Offres du moment — Bony Automobiles' : host;
    return `<div class="cht-lp"><span class="d">${GX.esc(host)}</span><b>${GX.esc(ttl)}</b><span style="opacity:.75">Neuf, occasion, entretien : toutes les offres de vos concessions.</span></div>`;
  }
  const bars = (id, n = 30) => { const h = hash(id); return Array.from({ length: n }, (_, i) => 18 + ((h >> (i % 24)) % 7) * 12 + (i % 5 === 0 ? 10 : 0)); };

  /* ---------------- Rendu d'un message ---------------- */
  function bodyHTML(m) {
    if (m.deleted) return `<div class="cht-b del">${GX.icon('trash', 'sm')}Message supprimé</div>`;
    if (m.expired) return `<div class="cht-b del cht-exp">${GX.icon('file', 'sm')}<div style="min-width:0"><b class="ellipsis" style="display:block">${GX.esc(String(m.file || 'Pièce jointe').split(' · ')[0])}</b><span>Pièce jointe expirée</span></div></div>`;
    switch (m.type) {
      case 'image': return `<button class="cht-media" data-a="img">${m.src ? `<img src="${GX.esc(m.src)}" alt="" />` : `<span class="cht-photo" style="--h:${hash(m.id) % 360}">${GX.icon('car')}<em>IMG_${2000 + (hash(m.id) % 900)}.jpg</em></span>`}</button>`;
      case 'file': { const [n, s] = String(m.file || 'Document').split(' · '); return `<div class="cht-b cht-file"><span class="fi">${GX.icon('file')}</span><div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${GX.esc(n)}</b><span>${GX.esc(s || '—')} · ${GX.esc((n.split('.').pop() || '').toUpperCase())}</span></div>${GX.icon('download', 'sm')}</div>`; }
      case 'voice': return `<div class="cht-b cht-voice"><button class="pl" data-a="voice" data-tip="Écouter">${GX.icon('play')}</button><div class="cht-wave" data-wave>${bars(m.id).map((h) => `<i style="height:${h}%"></i>`).join('')}</div><span class="num" data-dur>${GX.esc(m.dur || '0:05')}</span></div>`;
      case 'project': { if (role() === 'External') return `<div class="cht-proj" style="cursor:default"><span class="ic">${GX.icon('projects')}</span><b>Projet cité</b></div>`;   // cloisonnement : External n'a pas les Projets
        const p = D.project(m.project); if (!p) return `<div class="cht-b del">${GX.icon('projects', 'sm')}Projet introuvable</div>`; const pr = D.projectProgress(p);
        return `<button class="cht-proj" data-a="proj" data-p="${p.id}"><span class="ic">${GX.icon('projects')}</span><span class="grow" style="min-width:0"><span class="label">Projet cité</span><b class="ellipsis">${GX.esc(p.name)}</b><span class="row" style="gap:6px;font-size:12px;color:var(--text-2)">${GX.r.pStatus(p.status)}<span class="ellipsis">${GX.esc(p.sites.join(', '))}</span></span><span class="row" style="gap:6px"><span class="bar grow" style="height:4px"><i style="width:${pr}%"></i></span><span class="num faint" style="font-size:11.5px">${pr} %</span></span></span></button>`; }
      case 'gif': { const g = GIFS.find((x) => x[0] === m.gif) || GIFS[0]; return `<div class="cht-gif cht-media" style="--g1:${g[2]};--g2:${g[3]};cursor:default"><span class="tag">GIF</span><span class="e">${g[1]}</span><b>${GX.esc(g[0])}</b></div>`; }
      default: return `<div class="cht-b">${linkify(m.t)}${m.edited ? '<span class="cht-ed">(modifié)</span>' : ''}${linkPreview(m.t)}</div>`;
    }
  }
  function msgHTML(c, m, isFirst, isLast) {
    const mine = m.u === ME, u = D.user(m.u), showAv = !mine;
    const q = m.replyTo && msgs(c).find((x) => x.id === m.replyTo);
    const reacts = Object.entries(m.r || {}).filter(([, us]) => us.length);
    return `<div class="cht-msg ${mine ? 'me' : ''} ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}" data-id="${m.id}">
      ${showAv ? (isLast ? GX.r.av(m.u) : '<span class="cht-avsp"></span>') : ''}
      <div class="cht-col">
        ${showAv && isFirst && !m.deleted ? `<div class="cht-author"><span style="color:${u.color}">${GX.esc(u.name)}</span> · ${hhmm(m.at)}</div>` : ''}
        ${q ? `<button class="cht-quote" data-a="goto" data-to="${q.id}"><b>${GX.esc(q.u === ME ? 'Vous' : D.user(q.u).name)}</b><span class="ellipsis">${GX.esc(preview({ kind: 'dm' }, q))}</span></button>` : ''}
        <div class="cht-bwrap">${bodyHTML(m)}
          ${m.deleted ? '' : `<div class="cht-tools">${REACTS.map((e) => `<button data-a="react" data-e="${e}">${e}</button>`).join('')}<button data-a="reply" data-tip="Répondre">${GX.icon('back', 'sm')}</button>${mine ? `<button data-a="msgmore" data-tip="Plus">${GX.icon('more', 'sm')}</button>` : ''}</div>`}
        </div>
        ${reacts.length && !m.deleted ? `<div class="cht-reacts">${reacts.map(([e, us]) => { const noms = [...(us.includes(ME) ? ['Vous'] : []), ...us.filter((x) => x !== ME).map((x) => D.user(x)?.name || 'Ancien membre')]; return `<button class="cht-react ${us.includes(ME) ? 'mine' : ''}" data-a="rchip" data-e="${e}" data-tip="${GX.esc(noms.join(', '))}" aria-label="${e} : ${GX.esc(noms.join(', '))}">${e}<span>${us.length}</span></button>`; }).join('')}</div>` : ''}
        ${mine && !m.deleted && isLast ? `<div class="cht-time">${hhmm(m.at)}</div>` : ''}
      </div></div>`;
  }
  function msgsHTML(c, typingUid) {
    const arr = msgs(c); let out = '', prev = null;
    const same = (a, b) => a && b && a.type !== 'sys' && b.type !== 'sys' && a.u === b.u && Math.abs(a.at - b.at) < 5 * 6e4;
    arr.forEach((m, i) => {
      if (!prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString()) { out += `<div class="cht-day"><span>${dayLabel(m.at)}</span></div>`; prev = null; }
      if (m.type === 'sys') out += `<div class="cht-sys" data-id="${m.id}">${GX.esc(m.t)}</div>`;
      else out += msgHTML(c, m, !same(prev, m), !same(m, arr[i + 1]));
      prev = m;
    });
    if (!arr.length) out += `<div class="empty" style="margin-top:40px">${GX.icon('chat')}<b style="color:var(--text)">Aucun message</b>Dites bonjour 👋</div>`;
    const lm = [...arr].reverse().find((m) => m.type !== 'sys' && !m.deleted);
    out += seenHTML(c, lm);
    return out;
  }

  function seenHTML(c, lm) { const v = lm && seen(c, lm); return v ? `<div class="cht-seen ${lm.u === ME ? 'me' : ''}" data-seen data-tip="${GX.esc(v.noms.join(', '))}">${GX.icon('check', 'sm')}${GX.esc(v.l)}</div>` : '<div data-seen hidden></div>'; }

  /* ---------------- Liste ---------------- */
  function rowHTML(c, sel, typingUid) {
    const m = lastOf(c);
    return `<div class="cht-row ${sel ? 'sel' : ''} ${c.unread ? 'unread' : ''}" data-conv="${c.id}">
      <span class="cht-avw">${convAv(c)}${c.pinned ? `<span class="cht-pin">${GX.icon('star')}</span>` : ''}</span>
      <div class="cht-rb">
        <div class="cht-l1"><span class="nm ellipsis">${GX.esc(title(c))}</span>${c.muted ? `<span class="cht-ind">${GX.icon('belloff')}</span>` : ''}<span class="sp"></span><span class="cht-when">${m ? when(m.at) : ''}</span></div>
        <div class="cht-l2"><span class="cht-prev ellipsis ${typingUid ? 'typ' : ''}">${typingUid ? `${GX.esc(first(typingUid))} écrit…` : GX.esc(preview(c, m))}</span>${c.unread ? `<span class="count ${c.muted ? 'muted' : ''}">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}</div>
      </div>
      <div class="cht-racts"><button class="icon-btn sm ${c.muted ? 'on' : ''}" data-a="mute" data-tip="${c.muted ? 'Réactiver les notifications' : 'Mettre en sourdine'}">${GX.icon('belloff', 'sm')}</button><button class="icon-btn sm ${c.pinned ? 'on' : ''}" data-a="pin" data-tip="${c.pinned ? 'Désépingler (préférence de ce navigateur)' : 'Épingler (préférence de ce navigateur)'}">${GX.icon('star', 'sm')}</button></div>
    </div>`;
  }

  /* ---------------- Montage ---------------- */
  function mount(body, win) {
    body.innerHTML = `<div class="app"><div class="app-body" data-root></div><input type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden data-fimg /><input type="file" hidden data-ffile /></div>`;
    const root = body.querySelector('[data-root]');
    let compact = false, stack = null, selId = null, auto = true, q = '', listHost = null, convHost = null;
    let reply = null, editing = null, rec = null, playing = null, palette = null;
    const draft = {}, typing = {}, pending = {}, timers = new Set();
    const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const conv = () => D.CONVS.find((c) => c.id === selId);
    const isOpen = (id) => selId === id && convHost?.isConnected && (!compact || stack?.depth() > 1);
    const $ = (s) => body.querySelector(s);
    const ro = () => false; // le chat reste ouvert à tous les rôles qui y ont accès (Invité compris)

    /* --- construction : large (split) ou compact (pile) --- */
    function build() {
      stopVoice(); stopRec(true);
      if (selId && !visible().some((c) => c.id === selId)) selId = null;
      if (!selId && !compact) { selId = order()[0]?.id || null; auto = true; }
      if (compact) {
        stack = GX.ui.stack(root); listHost = stack.push('Chat', '', { noHead: true }); convHost = null; renderList();
        if (selId && !auto) openCompact();
      } else {
        stack = null; root.classList.remove('stack');
        root.innerHTML = `<div class="split" style="--side-w:clamp(270px,28%,360px)"><div class="side" data-side></div><div class="main" data-main></div></div>`;
        listHost = root.querySelector('[data-side]'); convHost = root.querySelector('[data-main]');
        renderList(); renderConv();
        if (selId) markRead(conv());
      }
    }
    function sideHTML() {
      return `<div class="cht-side"><div class="app-head"><div class="ah-t"><h1>Chat</h1></div><div class="ah-f"><button class="btn primary sm" data-a="new" data-tip="Nouvelle conversation">${GX.icon('plus', 'sm')}</button></div></div><div class="cht-lhead">
        <label class="search">${GX.icon('search', 'sm')}<input data-q placeholder="Rechercher" value="${GX.esc(q)}" /></label></div>
        <div class="cht-list scroll" data-list>${listInner()}</div></div>`;
    }
    function listInner() {
      const has = (c) => !q || title(c).toLowerCase().includes(q) || (c.kind !== 'dm' && c.members.some((u) => D.user(u).name.toLowerCase().includes(q)));
      const all = order().filter(has), sel = compact ? null : selId;
      const g = all.filter((c) => c.kind === 'general'), gr = all.filter((c) => c.kind === 'group'), dm = all.filter((c) => c.kind === 'dm');
      const sec = (label, arr, n, none) => `<div class="cht-sec">${label}${n ? ` <span>(${n})</span>` : ''}</div>${arr.length ? arr.map((c) => rowHTML(c, c.id === sel, null)).join('') : `<div class="cht-none">${q ? 'Aucun résultat' : none}</div>`}`;
      return (role() !== 'External' && g.length ? sec('Général', g, 0, '') : '') + sec('Groupes', gr, gr.length, 'Aucun groupe') + sec('Messages Privés', dm, dm.length, 'Aucune conversation privée');
    }
    function renderList() { if (!listHost) return; listHost.innerHTML = sideHTML(); }
    function refreshList(flip) {
      const l = listHost?.querySelector('[data-list]'); if (!l) return;
      const rects = flip ? new Map([...l.querySelectorAll('[data-conv]')].map((r) => [r.dataset.conv, r.getBoundingClientRect()])) : null;
      const sc = l.scrollTop; l.innerHTML = listInner(); l.scrollTop = sc;
      if (rects) l.querySelectorAll('[data-conv]').forEach((r) => GX.flip(r, rects.get(r.dataset.conv), { spring: 'snappy' }));
    }
    function markRead(c) { if (c && c.unread) { c.unread = 0; GX.emit('badges'); refreshList(); } }

    function select(id) {
      const c = D.CONVS.find((x) => x.id === id); if (!c || !visible().includes(c)) return;
      saveDraft();
      if (selId !== id) { reply = null; editing = null; }
      selId = id; auto = false; markRead(c); stopVoice(); stopRec(true);
      if (compact) { if (stack.depth() > 1) { stack.pop(); setTimeout(openCompact, 60); } else openCompact(); return; }
      refreshList(); renderConv(true);
    }
    function openCompact() { const c = conv(); if (!c || !stack) return; convHost = stack.push(title(c), ''); convHost.style.overflow = 'hidden'; renderConv(); markRead(c); }

    /* --- conversation --- */
    function headHTML(c) {
      const mem = membersOf(c), n = mem.length, shown = mem.slice(0, 5);
      const sub = c.kind === 'dm' ? 'Conversation privée' : `${n} membre${n > 1 ? 's' : ''}`;
      /* Groupe : clic sur l'avatar = photo du groupe (partagée par tous les membres, comme dans Gearbox) */
      return `<div class="cht-head">${c.kind === 'group' ? `<button class="cht-gbtn" data-a="gphoto" data-tip="Changer la photo du groupe">${convAv(c, 'sm')}</button>` : convAv(c, 'sm')}
        <div class="grow" style="min-width:0"><div class="nm" data-name><span class="ellipsis">${GX.esc(title(c))}</span>${isAdmin(c) ? `<button class="icon-btn sm" data-a="rename" data-tip="Renommer le groupe">${GX.icon('edit', 'sm')}</button>` : ''}</div><div class="sub">${sub}</div></div>
        <span class="av-stack">${shown.map((u) => GX.r.av(u, 'sm')).join('')}${n > 5 ? `<span class="av sm" style="--c:var(--surface-4);color:var(--text-2)">+${n - 5}</span>` : ''}</span>
        ${c.kind === 'group' ? `<button class="btn sm" data-a="members" data-tip="Membres du groupe">${GX.icon('users', 'sm')}<span class="cht-hl">Membres</span></button>` : ''}
        ${c.kind !== 'general' ? `<button class="icon-btn" data-a="palette" data-tip="Personnaliser la discussion">${GX.icon('sliders')}</button>` : ''}
        <button class="icon-btn" data-a="convmore" data-tip="Options">${GX.icon('more')}</button></div>`;
    }
    function composeHTML() {
      const ext = role() === 'External';
      return `<div class="cht-compose" data-compose>
        <div data-banner></div>
        <div class="cht-bar" data-bar>
          <button class="icon-btn cht-plus" data-a="plus" data-tip="Joindre, GIF, citer un projet…" aria-label="Plus d’actions">${GX.icon('plus')}</button>
          <button class="icon-btn opt" data-a="tool" data-tool="image" data-tip="Envoyer une image">${GX.icon('image')}</button>
          <button class="icon-btn opt" data-a="tool" data-tool="file" data-tip="Joindre un fichier (tous formats, max 100 Mo)">${GX.icon('paperclip')}</button>
          <button class="icon-btn opt cht-giftxt" data-a="tool" data-tool="gif" data-tip="Envoyer un GIF">GIF</button>
          <button class="icon-btn" data-a="tool" data-tool="voice" data-tip="Message vocal">${GX.icon('mic')}</button>
          ${ext ? '' : `<button class="icon-btn opt" data-a="tool" data-tool="project" data-tip="Citer un projet">${GX.icon('projects')}</button>`}
          <div class="cht-input"><textarea rows="1" data-ta placeholder="${compact ? 'Écrire un message…' : 'Écrire un message… (Entrée pour envoyer)'}"></textarea></div>
          <button class="cht-send" data-a="send" disabled data-tip="Envoyer">${GX.icon('arrowup')}</button>
        </div></div>`;
    }
    /* Le Chat Général n'a jamais de thème, même si une valeur traînait */
    const themeOf = (c) => (c.kind === 'general' ? null : c.theme);
    const wallStyle = (c) => { const t = themeOf(c); return t && t.startsWith('img:') ? `background:center/cover no-repeat url("${t.slice(4)}")` : t && BG[t] ? `background:${BG[t]}` : 'display:none'; };
    const bubbleVars = (c) => { const b = c.kind === 'general' ? 'Bony' : c.bubble || 'Bony'; return `--cht-me:${BUBBLES[b] || BUBBLES.Bony}${DARK_TEXT.includes(b) ? ';--cht-me-fg:#0f172a;--cht-me-ts:none' : ''}`; };
    function renderConv(anim) {
      if (!convHost) return;
      const c = conv();
      if (!c) { convHost.innerHTML = `<div class="empty" style="height:100%">${GX.icon('chat')}<b style="color:var(--text)">Aucune conversation</b>Choisissez une conversation ou créez-en une avec « + »</div>`; win.setTitle('Chat'); return; }
      convHost.innerHTML = `<div class="cht-conv" data-conv-root style="${bubbleVars(c)}">${headHTML(c)}
        <div class="cht-pane"><div class="cht-wall" data-wall style="${wallStyle(c)}"></div><div class="cht-scroll scroll" data-scroll><div class="cht-msgs" data-msgs>${msgsHTML(c, typing[c.id])}</div></div></div>
        ${composeHTML()}</div>`;
      if (compact) { const head = convHost.parentElement.querySelector('.stack-head'); head.querySelector('.t')?.remove(); head.querySelector('.cht-head')?.remove(); head.append(convHost.querySelector('.cht-head')); }
      const ta = $('[data-ta]'); if (ta) { ta.value = draft[c.id] || ''; grow(ta); }
      renderBanner(); scrollBottom();
      if (anim) GX.animate(convHost.querySelector('.cht-pane'), [{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
      win.setTitle('Chat', title(c));
    }
    const headEl = () => (compact ? convHost?.parentElement : convHost)?.querySelector('.cht-head');
    function scrollBottom() { const sc = $('[data-scroll]'); if (sc) sc.scrollTop = sc.scrollHeight; }
    function renderMsgs(animId) {
      const c = conv(), box = $('[data-msgs]'), sc = $('[data-scroll]'); if (!c || !box || !sc) return;
      const near = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 120;
      stopVoice(); box.innerHTML = msgsHTML(c, typing[c.id]);
      if (near || (animId && msgs(c).find((m) => m.id === animId)?.u === ME)) sc.scrollTop = sc.scrollHeight;
      if (animId) {
        const el = box.querySelector(`[data-id="${animId}"]`); const b = el?.querySelector('.cht-bwrap') || el;
        if (b) { b.style.transformOrigin = el.classList.contains('me') ? '100% 100%' : '0 100%'; GX.animate(b, [{ opacity: 0, transform: 'translateY(16px) scale(.86)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy' }); }
      }
    }
    function saveDraft() { const ta = $('[data-ta]'); if (ta && selId && !editing) draft[selId] = ta.value; }
    function grow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(130, ta.scrollHeight) + 'px'; const s = $('[data-a=send]'); if (s) s.disabled = !ta.value.trim(); }
    function renderBanner() {
      const b = $('[data-banner]'); if (!b) return; const c = conv();
      const m = editing ? msgs(c).find((x) => x.id === editing) : reply;
      b.innerHTML = m ? `<div class="cht-banner">${GX.icon(editing ? 'edit' : 'back', 'sm')}<div class="grow" style="min-width:0"><b>${editing ? 'Modifier le message' : 'Réponse à ' + GX.esc(m.u === ME ? 'vous-même' : D.user(m.u).name)}</b><div class="ellipsis faint">${GX.esc(preview({ kind: 'dm' }, m))}</div></div><button class="icon-btn sm" data-a="unbanner" data-tip="Annuler (Échap)">${GX.icon('close', 'sm')}</button></div>` : '';
    }

    /* --- envoi & simulation --- */
    function send(part) {
      const c = conv(); if (!c) return;
      const m = { id: GX.uid('m'), u: ME, at: Date.now(), type: 'text', r: {}, seen: [], ...part };
      if (reply) { m.replyTo = reply.id; reply = null; renderBanner(); }
      msgs(c).push(m); renderMsgs(m.id); refreshList();
      GX.emit('chat:message', { conv: c.id, msg: m, from: 'chat' });   // le widget « Chat » du bureau suit la conversation
      later(1400, () => { m.seen = membersOf(c).filter((u) => u !== ME && (c.kind !== 'general' || D.user(u).online)); if (isOpen(c.id)) updateSeen(); });
      scheduleReply(c, m);
    }
    function updateSeen() { const c = conv(), el = $('[data-seen]'); if (!c || !el) return renderMsgs(); const lm = [...msgs(c)].reverse().find((m) => m.type !== 'sys' && !m.deleted); el.outerHTML = seenHTML(c, lm); }
    function replyText(m) {
      const t = (m.t || '').toLowerCase(), pick = (a) => a[Math.floor(Math.random() * a.length)];
      if (m.type === 'image' || m.type === 'gif') return pick(['Top 😍', 'Haha excellent', 'Ça rend super bien !', 'Trop bien 🔥']);
      if (m.type === 'project') return pick(['Je regarde le projet 👀', 'Ok, je mets à jour mes tâches', 'Merci, je m’en occupe']);
      if (m.type === 'voice') return pick(['Bien reçu, je te rappelle', 'Ok noté 👍']);
      if (m.type === 'file') return pick(['Merci pour le fichier !', 'Reçu, je relis ça']);
      if (t.includes('merci')) return pick(['Avec plaisir !', 'De rien 😊', 'Quand tu veux']);
      if (t.includes('?')) return pick(['Oui, je regarde ça 👍', 'Je te dis ça dans l’heure', 'Bonne question, je vérifie avec la concession']);
      return pick(['Parfait, merci !', 'Ça marche 👌', 'Je m’en occupe', 'Noté ✅', 'Super, on en parle au point de jeudi']);
    }
    function scheduleReply(c, m) {
      if (c.kind === 'general' || pending[c.id]) return;
      const pool = c.members.filter((u) => u !== ME && D.user(u).role !== 'Site Manager'); if (!pool.length) return;
      const online = pool.filter((u) => D.user(u).online), src = online.length ? online : pool;
      const who = c.kind === 'dm' ? pool[0] : src[Math.floor(Math.random() * src.length)];
      pending[c.id] = true;
      later(2900 + Math.min(1800, (m.t || '').length * 30), () => {
        delete typing[c.id]; delete pending[c.id];
        const r = { id: GX.uid('m'), u: who, t: replyText(m), at: Date.now(), type: 'text', r: {} };
        msgs(c).push(r);
        if (!isOpen(c.id)) { c.unread = (c.unread || 0) + 1; if (!c.muted) GX.shell?.notify?.({ app: 'chat', u: who, title: c.kind === 'dm' ? D.user(who).name : `${D.user(who).name} · ${c.name}`, body: r.t, onClick: () => { const w = GX.wm.open('chat'); setTimeout(() => (w || GX.wm.active())?.inst?.command?.('conv:' + c.id), 300); } }); }
        GX.emit('chat:message', { conv: c.id, msg: r }); GX.emit('badges');
      });
    }
    function submit() {
      const ta = $('[data-ta]'); if (!ta) return; const t = ta.value.trim(), c = conv();
      if (editing) { const m = msgs(c).find((x) => x.id === editing); if (m && t && t !== m.t) { m.t = t; m.edited = true; } editing = null; ta.value = draft[c.id] || ''; grow(ta); renderBanner(); renderMsgs(); refreshList(); return; }
      if (!t) return; ta.value = ''; draft[c.id] = ''; grow(ta); send({ type: 'text', t });
    }
    function startEdit(m) { if (!m || m.u !== ME || m.deleted || m.type !== 'text') return; saveDraft(); editing = m.id; reply = null; const ta = $('[data-ta]'); ta.value = m.t; grow(ta); renderBanner(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    function del(m) {
      win.sheet(`<h3>Supprimer ce message ?</h3><div class="muted">Il est remplacé par « Message supprimé » chez tous les membres.</div><div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" style="background:var(--danger)">Supprimer</button></div>`,
        { onClose: (v) => { if (v !== 'ok') return; m.deleted = true; m.r = {}; renderMsgs(); refreshList(); } });
    }
    function react(m, e) {
      m.r ||= {}; const us = (m.r[e] ||= []); const i = us.indexOf(ME); if (i >= 0) us.splice(i, 1); else us.push(ME);
      renderMsgs(); const chip = $(`[data-id="${m.id}"] .cht-react[data-e="${e}"]`); if (chip) GX.animate(chip, [{ transform: 'scale(.4)' }, { transform: 'none' }], { spring: 'bouncy' });
    }
    /* Gearbox n'écrit pas de message système dans le fil : les changements (thème, membres, nom) s'appliquent en silence */
    function sys() {}

    /* --- pièces jointes --- */
    function tool(k, origin) {
      const c = conv(); if (!c) return;
      if (k === 'image') return GX.menu.open([{ label: 'Choisir une image…', icon: 'upload', action: () => $('[data-fimg]').click() }, { label: 'Photo de démonstration', icon: 'image', action: () => send({ type: 'image' }) }], origin);
      if (k === 'file') return GX.menu.open([{ label: 'Choisir un fichier…', icon: 'upload', action: () => $('[data-ffile]').click() }, { label: 'Document de démonstration', icon: 'file', action: () => send({ type: 'file', file: 'Brief campagne.pdf · 1,2 Mo' }) }], origin);
      if (k === 'gif') return toggleGifs();
      if (k === 'voice') return startRec();
      if (k === 'project') return quoteProject();
    }
    function toggleGifs(force) {
      const box = $('[data-compose]'); if (!box) return; const cur = box.querySelector('.cht-gifs');
      if (cur || force === false) { cur?.remove(); return; }
      box.insertAdjacentHTML('afterbegin', `<div class="cht-gifs" data-gifs><label class="search">${GX.icon('search', 'sm')}<input data-gq placeholder="Rechercher un GIF" /></label><div class="cht-gifgrid scroll" data-ggrid>${gifGrid('')}</div></div>`);
      setTimeout(() => box.querySelector('[data-gq]')?.focus(), 30);
    }
    const gifGrid = (s) => GIFS.filter((g) => !s || g[0].toLowerCase().includes(s)).map((g) => `<button class="cht-gif" data-a="gif" data-g="${GX.esc(g[0])}" style="--g1:${g[2]};--g2:${g[3]}"><span class="e">${g[1]}</span><b>${GX.esc(g[0])}</b></button>`).join('') || '<div class="faint" style="padding:10px">Aucun GIF</div>';
    function startRec() {
      if (rec) return; const bar = $('[data-bar]'); if (!bar) return;
      bar.classList.add('hide');
      bar.insertAdjacentHTML('afterend', `<div class="cht-rec" data-rec><button class="icon-btn" data-a="rec-cancel" data-tip="Annuler">${GX.icon('trash')}</button><i class="dot"></i><b class="num" data-rtime>0:00</b><div class="cht-recwave">${Array.from({ length: 48 }, (_, i) => `<i style="animation-delay:${-((i * 137) % 900)}ms;animation-duration:${600 + ((i * 53) % 500)}ms"></i>`).join('')}</div><span class="faint" style="font-size:11px;white-space:nowrap">Enregistrement…</span><button class="cht-send" data-a="rec-send" data-tip="Envoyer">${GX.icon('arrowup')}</button></div>`);
      const t0 = Date.now(); rec = { t0, iv: setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); const el = $('[data-rtime]'); if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s >= 60) stopRec(false); }, 250) };
    }
    function stopRec(cancel) {
      if (!rec) return; clearInterval(rec.iv); const s = Math.max(1, Math.round((Date.now() - rec.t0) / 1000)); rec = null;
      $('[data-rec]')?.remove(); $('[data-bar]')?.classList.remove('hide');
      if (!cancel) send({ type: 'voice', dur: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` });
    }
    function playVoice(btn) {
      const msgEl = btn.closest('[data-id]'), m = msgs(conv()).find((x) => x.id === msgEl.dataset.id); if (!m) return;
      if (playing?.id === m.id) return stopVoice();
      stopVoice();
      const [mm, ss] = String(m.dur || '0:05').split(':').map(Number), total = (mm * 60 + ss) * 1000, wave = msgEl.querySelector('[data-wave]'), dur = msgEl.querySelector('[data-dur]'), is = [...wave.children];
      btn.innerHTML = GX.icon('pause'); const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / total); is.forEach((i, k) => i.classList.toggle('on', k / is.length < p));
        const left = Math.ceil((total * (1 - p)) / 1000); dur.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        if (p < 1) playing.raf = requestAnimationFrame(step); else stopVoice();
      };
      playing = { id: m.id, btn, m, dur, is, raf: requestAnimationFrame(step) };
    }
    function stopVoice() { if (!playing) return; cancelAnimationFrame(playing.raf); if (playing.btn.isConnected) { playing.btn.innerHTML = GX.icon('play'); playing.is.forEach((i) => i.classList.remove('on')); playing.dur.textContent = playing.m.dur; } playing = null; }
    function quoteProject() {
      /* projetsActifs : status Active et échéance non dépassée, tri par échéance, 50 max (même définition que la To-do) */
      const today = GX.iso(GX.today());
      const list = (s) => D.PROJECTS.filter((p) => p.status === 'Active' && p.endDate >= today && (!s || p.name.toLowerCase().includes(s) || (p.sites || []).join(' ').toLowerCase().includes(s))).sort((a, b) => a.endDate.localeCompare(b.endDate)).slice(0, 50).map((p) => `<div class="list-row" data-s-p="${p.id}"><span class="cht-gav sm" style="background:var(--bony-grad);border-radius:9px">${GX.icon('projects')}</span><div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${GX.esc(p.name)}</b><span class="faint ellipsis" style="display:block;font-size:12.5px">${GX.esc((p.sites || [])[0] || '')} · échéance ${F.date(p.endDate)}</span></div></div>`).join('') || '<div class="empty">Aucun projet actif trouvé.</div>';
      const sh = win.sheet(`<h3>Citer un projet</h3><div class="muted">Projets actifs, par échéance la plus proche. Une carte cliquable apparaît dans la conversation.</div>
        <label class="search" style="margin-top:12px">${GX.icon('search', 'sm')}<input data-s-q placeholder="Rechercher un projet…" /></label><div class="cht-pick scroll" data-s-list>${list('')}</div>
        <div class="foot"><button class="btn" data-sheet="">Annuler</button></div>`, {});
      sh.el.addEventListener('input', (e) => { if (e.target.matches('[data-s-q]')) sh.el.querySelector('[data-s-list]').innerHTML = list(e.target.value.toLowerCase()); });
      sh.el.addEventListener('click', (e) => { const r = e.target.closest('[data-s-p]'); if (r) { sh.close(); send({ type: 'project', project: r.dataset.sP }); } });
    }

    /* --- nouvelles conversations --- */
    const people = () => D.USERS.filter((u) => u.id !== ME && u.role !== 'Site Manager');
    function newMenu(origin) {
      if (role() === 'External') return newDM();                          // External : directement le message privé
      GX.menu.open([{ header: 'Nouvelle conversation' }, { label: 'Message privé — Conversation 1-to-1', icon: 'message', action: newDM }, { label: 'Groupe de travail — 2 membres minimum', icon: 'users', action: newGroup }], origin, { align: 'right' });
    }
    function newDM() {
      const rows = (s) => people().filter((u) => !s || u.name.toLowerCase().includes(s)).map((u) => { const ex = D.CONVS.some((c) => c.kind === 'dm' && c.members.includes(u.id) && c.members.includes(ME));
        return `<div class="list-row" data-s-user="${u.id}">${GX.r.av(u.id)}<div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${GX.esc(u.name)}</b><span class="faint" style="font-size:12.5px">${D.ROLES[u.role].l}</span></div>${ex ? '<span class="badge" style="--c:var(--info)">EXISTANTE</span>' : ''}</div>`; }).join('') || '<div class="empty">Personne</div>';
      const sh = win.sheet(`<h3>Message privé</h3><div class="muted">Conversation 1-to-1</div><label class="search" style="margin-top:12px">${GX.icon('search', 'sm')}<input data-s-q placeholder="Rechercher un collègue" /></label><div class="cht-pick scroll" data-s-list>${rows('')}</div><div class="foot"><button class="btn" data-sheet="">Annuler</button></div>`, {});
      sh.el.addEventListener('input', (e) => { if (e.target.matches('[data-s-q]')) sh.el.querySelector('[data-s-list]').innerHTML = rows(e.target.value.toLowerCase()); });
      sh.el.addEventListener('click', (e) => { const r = e.target.closest('[data-s-user]'); if (r) { sh.close(); openDM(r.dataset.sUser); } });
    }
    function openDM(uid) {
      if (!D.USERS.some((u) => u.id === uid) || uid === ME) return;
      let c = D.CONVS.find((x) => x.kind === 'dm' && x.members.includes(uid) && x.members.includes(ME));
      if (!c) { c = { id: GX.uid('c'), kind: 'dm', name: D.user(uid).name, members: [ME, uid], unread: 0 }; D.CONVS.push(c); refreshList(); }
      select(c.id); setTimeout(() => $('[data-ta]')?.focus(), 120);
    }
    function newGroup() {
      const chosen = new Set();
      const html = () => `<h3>Nouveau groupe</h3><div class="muted">Groupe de travail · vous en serez l’administrateur.</div>
        <label class="field" style="margin-top:14px"><span class="label">Nom du groupe</span><input class="input" data-s-name placeholder="Ex: Équipe comm Renault…" /></label>
        <div class="row" style="margin-top:12px"><span class="label grow" data-s-n>Membres (0 sélectionné) — 2 minimum</span></div>
        <div class="cht-pick scroll">${people().map((u) => `<label class="list-row" style="cursor:pointer"><input type="checkbox" class="check" data-s-m="${u.id}" />${GX.r.av(u.id, 'sm')}<span class="grow ellipsis">${GX.esc(u.name)}</span><span class="faint" style="font-size:12.5px">${D.ROLES[u.role].l}</span></label>`).join('')}</div>
        <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-s-create disabled>Créer le groupe</button></div>`;
      const sh = win.sheet(html(), {});
      const check = () => { const n = sh.el.querySelector('[data-s-name]').value.trim(); sh.el.querySelector('[data-s-n]').textContent = `Membres (${chosen.size} sélectionné${chosen.size > 1 ? 's' : ''}) — 2 minimum`; sh.el.querySelector('[data-s-create]').disabled = !(n && chosen.size >= 2); };
      sh.el.addEventListener('input', check);
      sh.el.addEventListener('change', (e) => { const b = e.target.closest('[data-s-m]'); if (b) { b.checked ? chosen.add(b.dataset.sM) : chosen.delete(b.dataset.sM); check(); } });
      sh.el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-s-create]')) return; const name = sh.el.querySelector('[data-s-name]').value.trim(); if (!name || chosen.size < 2) return;
        const c = { id: GX.uid('c'), kind: 'group', name, members: [ME, ...chosen], unread: 0, admins: [ME] }; D.CONVS.push(c);
        sys(c, `Vous avez créé le groupe « ${name} »`); sh.close(); refreshList(); select(c.id);
      });
    }

    /* --- en-tête : renommer, membres, personnaliser --- */
    function rename() {
      const c = conv(), box = headEl()?.querySelector('[data-name]'); if (!c || !box || !isAdmin(c)) return;
      box.innerHTML = `<input class="input cht-rename" data-rn value="${GX.esc(c.name)}" />`; const i = box.firstElementChild; i.focus(); i.select();
      let done = false; const commit = (ok) => { if (done) return; done = true; const v = i.value.trim(); if (ok && v && v !== c.name) { c.name = v; sys(c, `Vous avez renommé le groupe « ${v} »`); } renderConv(); refreshList(); };
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(true); if (e.key === 'Escape') { e.stopPropagation(); commit(false); } });
      i.addEventListener('blur', () => commit(true));
    }
    function groupPhoto() {
      const c = conv(); if (!c || c.kind !== 'group') return;
      let src = null, zoom = 1;
      const html = () => `<h3>Photo du groupe</h3><div class="muted">${GX.esc(c.name)} · visible par tous les membres</div>
        ${!src ? `<div data-gdrop tabindex="0" style="margin-top:14px;height:170px;border-radius:14px;border:2px dashed var(--line-2);display:grid;place-content:center;justify-items:center;gap:6px;text-align:center;cursor:pointer">${GX.icon('upload', 'lg')}<b>Glisser une photo ici</b><span class="muted" style="font-size:12.5px">ou cliquer pour parcourir</span><span class="faint" style="font-size:11.5px">jpg, png, gif, webp — max 5 Mo</span></div>`
          : `<div style="margin-top:14px;height:230px;border-radius:14px;background:#000;display:grid;place-items:center;overflow:hidden"><div data-gc style="width:190px;height:190px;border-radius:50%;background:center/${zoom * 100}% no-repeat url('${src}');box-shadow:0 0 0 999px rgba(0,0,0,.55)"></div></div><div class="row" style="margin-top:10px">${GX.icon('search', 'sm')}<input type="range" class="grow" min="1" max="3" step="0.05" value="${zoom}" data-gz /></div>`}
        <input type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp" data-gfile /><div data-gerr style="color:var(--danger);font-size:12.5px;font-weight:600;margin-top:8px"></div>
        <div class="foot">${src ? `<button class="btn primary" data-gok>${GX.icon('check', 'sm')}Valider</button>` : ''}${c.photo ? `<button class="btn danger" data-grm>${GX.icon('trash', 'sm')}Supprimer la photo</button>` : ''}<button class="btn" data-sheet="">Annuler</button></div>`;
      const sh = win.sheet(html(), { width: 420 }), el = sh.el, re = () => { el.innerHTML = html(); };
      const take = (f) => { if (!f) return; if (!IMG_TYPES.includes(f.type)) { el.querySelector('[data-gerr]').textContent = 'Format non supporté. Utilisez jpg, png, gif ou webp.'; return; } if (f.size > 5 * 1024 * 1024) { el.querySelector('[data-gerr]').textContent = 'Fichier trop lourd (max 5 Mo).'; return; } const rd = new FileReader(); rd.onload = () => { src = rd.result; zoom = 1; re(); }; rd.readAsDataURL(f); };
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-gdrop]')) el.querySelector('[data-gfile]').click();
        if (e.target.closest('[data-gok]')) { c.photo = `center/${zoom * 100}% no-repeat url("${src}")`; sh.close(); renderConv(); refreshList(); GX.shell?.hud?.('Photo du groupe mise à jour'); }
        if (e.target.closest('[data-grm]')) { c.photo = null; sh.close(); renderConv(); refreshList(); }
      });
      el.addEventListener('change', (e) => { if (e.target.matches('[data-gfile]')) take(e.target.files?.[0]); });
      el.addEventListener('input', (e) => { if (e.target.matches('[data-gz]')) { zoom = +e.target.value; el.querySelector('[data-gc]').style.backgroundSize = zoom * 100 + '%'; } });
      el.addEventListener('dragover', (e) => { if (e.target.closest('[data-gdrop]')) e.preventDefault(); });
      el.addEventListener('drop', (e) => { if (e.target.closest('[data-gdrop]')) { e.preventDefault(); take(e.dataTransfer.files[0]); } });
    }
    function membersSheet() {
      const c = conv(); if (!c || c.kind !== 'group') return;
      const html = () => { const adm = isAdmin(c), out = people().filter((u) => !c.members.includes(u.id)); return `<h3>Membres (${c.members.length})</h3><div class="muted">${GX.esc(c.name)}${adm ? '' : ' · seul un administrateur du groupe peut ajouter ou retirer des membres'}</div>
        <div class="cht-pick scroll">${c.members.map((u) => { const us = D.user(u), a = (c.admins || []).includes(u);
          return `<div class="list-row">${GX.r.av(u)}<div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${GX.esc(us.name)}${u === ME ? ' (moi)' : ''}</b><span class="faint" style="font-size:12.5px">${a ? '★ Admin' : D.ROLES[us.role].l}</span></div>
            ${adm && !a && u !== ME ? `<button class="btn sm danger" data-s-rm="${u}" data-tip="Retirer">Retirer</button>` : ''}</div>`; }).join('')}</div>
        ${adm && out.length ? `<div class="label" style="margin-top:14px">Ajouter</div><div class="cht-pick scroll" style="margin-top:6px">${out.map((u) => `<button class="list-row" data-s-add="${u.id}" style="width:100%;text-align:left">${GX.r.av(u.id, 'sm')}<div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${GX.esc(u.name)}</b><span class="faint" style="font-size:12.5px">${D.ROLES[u.role].l}</span></div>${GX.icon('plus', 'sm')}</button>`).join('')}</div>` : ''}
        <div class="foot"><button class="btn primary" data-sheet="">Terminé</button></div>`; };
      const sh = win.sheet(html(), { onClose: () => { renderConv(); refreshList(); } });
      const re = () => { const sc = sh.el.scrollTop; sh.el.innerHTML = html(); sh.el.scrollTop = sc; };
      sh.el.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-s-rm]'), ad = e.target.closest('[data-s-add]');
        if (rm) { const u = rm.dataset.sRm; win.sheet(`<h3>Retirer ${GX.esc(D.user(u).name)} du groupe ?</h3><div class="muted">Cette personne n’y aura plus accès.</div><div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" style="background:var(--danger)">Retirer</button></div>`, { width: 420, onClose: (v) => { if (v !== 'ok') return; c.members = c.members.filter((x) => x !== u); c.admins = (c.admins || []).filter((x) => x !== u); re(); } }); }
        if (ad) { const u = ad.dataset.sAdd; if (!c.members.includes(u)) c.members.push(u); re(); }
      });
    }
    function paletteSheet() {
      const c = conv(); if (!c || c.kind === 'general') return;
      const before = [c.theme, c.bubble];
      const imported = c.theme && c.theme.startsWith('img:') ? c.theme.slice(4) : null;
      const html = () => `<h3>Personnaliser la discussion</h3><div class="muted">« ${GX.esc(title(c))} » — visible par tous les membres de la discussion.</div>
        <div class="cht-prev-box"><div class="cht-wall" style="${wallStyle(c)}"></div><div class="b o">On part sur 3 véhicules ?</div><div class="b m" style="background:${BUBBLES[c.bubble] || BUBBLES.Bony};${DARK_TEXT.includes(c.bubble) ? 'color:#0f172a' : ''}">Oui, et l’A290 en vitrine 🚗</div></div>
        ${Object.entries(BGS).map(([fam, set]) => `<div class="label" style="margin-top:14px">${fam}</div><div class="cht-bggrid">${Object.entries(set).map(([n, bg]) => `<button class="cht-bgt ${c.theme === n ? 'on' : ''}" data-s-bg="${GX.esc(n)}"><span style="background:${bg}"></span>${GX.esc(n)}</button>`).join('')}</div>`).join('')}
        <div class="label" style="margin-top:16px">Couleur des bulles</div><div class="cht-sw">${Object.entries(BUBBLES).map(([n, b]) => `<button class="${(c.bubble || 'Bony') === n ? 'on' : ''}" data-s-bub="${GX.esc(n)}" data-tip="${GX.esc(n)}" style="background:${b}"></button>`).join('')}</div>
        <div class="faint" style="font-size:12px">Partagée : chaque membre voit ses propres messages dans cette couleur.</div>
        <div class="label" style="margin-top:16px">Une image</div>
        <div class="row" style="margin-top:6px;gap:10px"><button class="btn" data-s-imp data-tip="Importer une image (JPEG, PNG ou WebP, 8 Mo max)">${GX.icon('upload', 'sm')}Importer</button>${(c.theme || '').startsWith('img:') ? `<span data-tip="Image actuelle de la discussion" style="width:64px;height:40px;border-radius:9px;background:center/cover url('${c.theme.slice(4)}');box-shadow:0 0 0 2px var(--accent)"></span>` : ''}<input type="file" hidden accept="image/jpeg,image/png,image/webp" data-s-file /></div>
        <div class="faint" style="font-size:12px;margin-top:4px">JPEG, PNG ou WebP — 8 Mo maximum.</div><div data-s-err style="color:var(--danger);font-size:12.5px;font-weight:600"></div>
        <div class="foot"><button class="btn" data-s-bg="" ${c.theme ? '' : 'disabled'}>Aucun fond</button><span class="grow"></span><button class="btn primary" data-sheet="">Terminé</button></div>`;
      void imported;
      palette = win.sheet(html(), { width: 560, onClose: () => {
        palette = null;
        if (before[0] !== c.theme || before[1] !== c.bubble) { renderMsgs(); refreshList(); }
      } });
      palette.el.addEventListener('change', (e) => {
        if (!e.target.matches('[data-s-file]')) return; const f = e.target.files?.[0]; if (!f) return;
        if (!f.type.startsWith('image/')) { palette.el.querySelector('[data-s-err]').textContent = 'Choisissez une image (JPEG, PNG ou WebP).'; return; }
        if (f.size > 8 * 1024 * 1024) { palette.el.querySelector('[data-s-err]').textContent = 'Image trop lourde : 8 Mo maximum.'; return; }
        c.theme = 'img:' + URL.createObjectURL(f); const sc = palette.el.scrollTop; palette.el.innerHTML = html(); palette.el.scrollTop = sc; applyTheme(c);
      });
      palette.el.addEventListener('click', (e) => {
        if (e.target.closest('[data-s-imp]')) { palette.el.querySelector('[data-s-file]').click(); return; }
        const bg = e.target.closest('[data-s-bg]'), bu = e.target.closest('[data-s-bub]'); if (!bg && !bu) return;
        if (bg) c.theme = bg.dataset.sBg || null; if (bu) c.bubble = bu.dataset.sBub;
        const sc = palette.el.scrollTop; palette.el.innerHTML = html(); palette.el.scrollTop = sc; applyTheme(c);
      });
    }
    function applyTheme(c) { const w = $('[data-wall]'), r = $('[data-conv-root]'); if (w) w.setAttribute('style', wallStyle(c)); if (r) r.setAttribute('style', bubbleVars(c)); }
    function convMenu(origin) {
      const c = conv(); if (!c) return;
      GX.menu.open([
        ...(c.kind === 'group' ? [{ label: 'Membres…', icon: 'users', action: membersSheet }] : []),
        ...(c.kind !== 'general' ? [{ label: 'Personnaliser la discussion…', icon: 'sliders', action: paletteSheet }] : []),
        { label: c.muted ? 'Réactiver les notifications' : 'Mettre en sourdine', icon: 'belloff', action: () => { c.muted = !c.muted; GX.emit('badges'); refreshList(); } },
        { label: c.pinned ? 'Désépingler' : 'Épingler', icon: 'star', action: () => { c.pinned = !c.pinned; refreshList(true); } },
      ], origin, { align: 'right' });
    }
    const profileHTML = (uid) => { const u = D.user(uid); return `<div style="display:grid;justify-items:center;gap:8px;text-align:center"><span class="av xl" style="--c:${u.color}">${u.initials}</span><b style="font-size:16px">${GX.esc(u.name)}</b><span class="badge">${D.ROLES[u.role].l}</span><span class="muted">${GX.esc(u.city)} · ${u.online ? 'en ligne' : 'hors ligne'}</span></div>`; };
    function msgMenu(m, at) {
      if (m.deleted) return;
      GX.menu.open([{ header: 'Réagir' }, ...REACTS.map((e) => ({ label: `${e}  ${{ '👍': 'J’aime', '❤️': 'J’adore', '😂': 'Haha', '😮': 'Waouh' }[e]}`, checked: (m.r?.[e] || []).includes(ME), action: () => react(m, e) })), '-',
        { label: 'Répondre', icon: 'back', action: () => { reply = m; editing = null; renderBanner(); $('[data-ta]')?.focus(); } },
        ...(m.type === 'text' ? [{ label: 'Copier le texte', icon: 'copy', action: () => { try { navigator.clipboard?.writeText(m.t); } catch (e) {} GX.shell?.hud?.('Texte copié'); } }] : []),
        ...(m.u === ME ? ['-', ...(m.type === 'text' ? [{ label: 'Modifier', icon: 'edit', action: () => startEdit(m) }] : []), { label: 'Supprimer', icon: 'trash', action: () => del(m) }] : [])], at);
    }

    /* --- délégation d'événements (une seule fois par fenêtre) --- */
    const msgOf = (el) => { const id = el.closest('[data-id]')?.dataset.id; const c = conv(); return c && msgs(c).find((m) => m.id === id); };
    body.addEventListener('click', (e) => {
      if (e.target.closest('.sheet')) return;
      const a = e.target.closest('[data-a]'); const k = a?.dataset.a;
      if (!e.target.closest('[data-gifs],[data-tool="gif"]')) toggleGifs(false);
      if (!a) { const r = e.target.closest('[data-conv]'); if (r) select(r.dataset.conv); return; }
      e.preventDefault();
      const row = a.closest('[data-conv]'), c = row ? D.CONVS.find((x) => x.id === row.dataset.conv) : conv();
      switch (k) {
        case 'mute': c.muted = !c.muted; GX.shell?.hud?.(c.muted ? 'Sourdine activée' : 'Notifications réactivées'); GX.emit('badges'); refreshList(); break;
        case 'pin': c.pinned = !c.pinned; refreshList(true); break;
        case 'new': newMenu(a); break;
        case 'rename': rename(); break;
        case 'gphoto': groupPhoto(); break;
        case 'members': membersSheet(); break;
        case 'palette': paletteSheet(); break;
        case 'convmore': convMenu(a); break;
        case 'react': react(msgOf(a), a.dataset.e); break;
        case 'rchip': react(msgOf(a), a.dataset.e); break;
        case 'reply': reply = msgOf(a); editing = null; renderBanner(); $('[data-ta]')?.focus(); break;
        case 'msgmore': msgMenu(msgOf(a), a); break;
        case 'unbanner': reply = null; if (editing) { editing = null; const ta = $('[data-ta]'); ta.value = draft[selId] || ''; grow(ta); } renderBanner(); break;
        case 'goto': { const t = $(`[data-id="${a.dataset.to}"]`); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.remove('cht-flash'); void t.offsetWidth; t.classList.add('cht-flash'); } break; }
        case 'img': { const m = msgOf(a); GX.shell?.quickLook?.({ title: m.src ? 'Image' : `IMG_${2000 + (hash(m.id) % 900)}.jpg`, origin: a, html: m.src ? `<img src="${GX.esc(m.src)}" alt="" style="max-width:100%;border-radius:12px;display:block" />` : `<span class="cht-photo" style="--h:${hash(m.id) % 360};width:100%;border-radius:12px">${GX.icon('car')}</span><div class="faint" style="margin-top:8px;font-size:12px">Envoyée par ${GX.esc(m.u === ME ? 'vous' : D.user(m.u).name)} · ${F.time(m.at)}</div>` }); break; }
        case 'voice': playVoice(a); break;
        case 'proj': { const p = D.project(a.dataset.p); if (p) GX.wm.open('project', { id: p.id, title: p.name }, { origin: a }); break; }
        case 'link': GX.shell?.hud?.('Lien externe — non ouvert dans la maquette'); break;
        case 'tool': tool(a.dataset.tool, a); break;
        case 'plus': GX.menu.open([{ label: 'Image', icon: 'image', action: () => tool('image', a) }, { label: 'Fichier', icon: 'paperclip', action: () => tool('file', a) }, { label: 'GIF animé', icon: 'smile', action: () => tool('gif', a) }, ...(role() === 'External' ? [] : [{ label: 'Citer un projet', icon: 'projects', action: () => tool('project', a) }])], a); break;
        case 'gif': toggleGifs(false); send({ type: 'gif', gif: a.dataset.g }); break;
        case 'send': submit(); break;
        case 'rec-cancel': stopRec(true); break;
        case 'rec-send': stopRec(false); break;
      }
    });
    body.addEventListener('dblclick', (e) => { const b = e.target.closest('.cht-msg.me .cht-b'); if (b) startEdit(msgOf(b)); });
    body.addEventListener('contextmenu', (e) => {
      const b = e.target.closest('.cht-msg:not(.cht-typing) .cht-bwrap'); if (b) { e.preventDefault(); return msgMenu(msgOf(b), { x: e.clientX, y: e.clientY }); }
      const r = e.target.closest('[data-conv]'); if (r) { e.preventDefault(); const c = D.CONVS.find((x) => x.id === r.dataset.conv);
        GX.menu.open([{ label: 'Ouvrir', action: () => select(c.id) }, '-', { label: c.muted ? 'Réactiver les notifications' : 'Mettre en sourdine', icon: 'belloff', action: () => { c.muted = !c.muted; GX.emit('badges'); refreshList(); } }, { label: c.pinned ? 'Désépingler' : 'Épingler', icon: 'star', action: () => { c.pinned = !c.pinned; refreshList(true); } }, ...(c.unread ? [{ label: 'Marquer comme lu', icon: 'check', action: () => markRead(c) }] : [])], { x: e.clientX, y: e.clientY }); }
    });
    body.addEventListener('input', (e) => {
      if (e.target.matches('[data-q]')) { q = e.target.value.toLowerCase().trim(); refreshList(); }
      if (e.target.matches('[data-ta]')) { grow(e.target); if (!editing) draft[selId] = e.target.value; }
      if (e.target.matches('[data-gq]')) body.querySelector('[data-ggrid]').innerHTML = gifGrid(e.target.value.toLowerCase().trim());
    });
    body.addEventListener('keydown', (e) => {
      if (e.target.matches('[data-ta]')) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
        if (e.key === 'Escape' && (reply || editing)) { e.stopPropagation(); reply = null; if (editing) { editing = null; e.target.value = draft[selId] || ''; grow(e.target); } renderBanner(); }
        if (e.key === 'ArrowUp' && !e.target.value) { const mine = [...msgs(conv())].reverse().find((m) => m.u === ME && m.type === 'text' && !m.deleted); if (mine) { e.preventDefault(); startEdit(mine); } }
      }
      if (e.key === 'Escape' && $('[data-gifs]')) { e.stopPropagation(); toggleGifs(false); }
    });
    /* handleAttachment() : 100 Mo max, fichier vide refusé, image en ligne sinon carte de pièce jointe */
    function attach(f) {
      if (f.size > MAX_UPLOAD) return alertSheet('Fichier trop lourd (max 100 Mo).');
      if (f.size === 0) return alertSheet('Fichier vide.');
      if (IMG_TYPES.includes(f.type)) send({ type: 'image', src: URL.createObjectURL(f) });
      else send({ type: 'file', file: `${f.name} · ${poids(f.size)}` });
    }
    const alertSheet = (t) => { win.sheet(`<h3>${GX.esc(t)}</h3><div class="foot"><button class="btn primary" data-sheet="">OK</button></div>`, { width: 380 }); };
    body.addEventListener('paste', (e) => { if (!e.target.matches?.('[data-ta]')) return; const f = e.clipboardData?.files?.[0]; if (f) { e.preventDefault(); attach(f); } });
    body.addEventListener('change', (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      if (e.target.matches('[data-fimg]')) attach(f);
      if (e.target.matches('[data-ffile]')) attach(f);
      e.target.value = '';
    });

    const stopW = GX.ui.watchWidth(body, 760, (cp) => { saveDraft(); compact = cp; build(); });
    const off = [
      GX.on('ctx', () => build()),
      GX.on('chat:read', () => refreshList()),                         // lu depuis le widget du bureau
      GX.on('chat:message', (det) => {
        const { conv: id, msg, from } = det;
        if (from === 'chat') return;                                   // mon propre envoi : déjà rendu
        const c = D.CONVS.find((x) => x.id === id); if (!c) return;
        if (from === 'widget-react') { if (isOpen(id)) renderMsgs(); return; }   // réaction posée depuis le widget du bureau
        /* Message écrit depuis le widget du bureau : l'app prend la suite (« Vu par », réponse simulée) */
        if (from === 'widget' && msg.u === ME) {
          det.handled = true;
          later(1400, () => { msg.seen = membersOf(c).filter((u) => u !== ME && (c.kind !== 'general' || D.user(u).online)); if (isOpen(c.id)) updateSeen(); });
          scheduleReply(c, msg);
        }
        if (typing[id] === msg.u) delete typing[id];
        if (isOpen(id)) { if (c.unread) { c.unread = 0; GX.emit('badges'); } renderMsgs(msg.id); }
        refreshList();
        if (!isOpen(id)) { const r = listHost?.querySelector(`[data-conv="${id}"] .count`); if (r) GX.animate(r, [{ transform: 'scale(.3)' }, { transform: 'none' }], { spring: 'bouncy' }); }
      }),
    ];
    const minuteTick = setInterval(() => refreshList(), 60000);
    return {
      destroy() { stopW(); off.forEach((o) => o()); timers.forEach(clearTimeout); clearInterval(minuteTick); stopVoice(); if (rec) clearInterval(rec.iv); },
      command(cmd) {
        if (typeof cmd !== 'string') return;
        if (cmd.startsWith('conv:')) select(cmd.slice(5));
        if (cmd.startsWith('dm:')) openDM(cmd.slice(3));
        if (cmd === 'new-dm') newDM(); if (cmd === 'new-group') newGroup();
      },
      menus: () => {
        const c = conv();
        return {
          'Fichier': [{ label: 'Nouveau message privé…', icon: 'message', action: newDM }, { label: 'Nouveau groupe de travail…', icon: 'users', action: newGroup }],
          'Conversation': c ? [
            ...(c.kind !== 'general' ? [{ label: 'Personnaliser la discussion…', icon: 'sliders', action: paletteSheet }] : []),
            ...(c.kind === 'group' ? [{ label: 'Membres…', icon: 'users', action: membersSheet }, { label: 'Renommer le groupe', icon: 'edit', disabled: !isAdmin(c), action: rename }] : []),
            { label: 'Sourdine', checked: !!c.muted, action: () => { c.muted = !c.muted; GX.emit('badges'); refreshList(); } },
            { label: 'Épinglée', checked: !!c.pinned, action: () => { c.pinned = !c.pinned; refreshList(true); } }, '-',
            { label: 'Tout marquer comme lu', icon: 'check', disabled: !badge(), action: () => { visible().forEach((x) => (x.unread = 0)); GX.emit('badges'); refreshList(); } },
          ] : [],
        };
      },
    };
  }

  GX.registerApp({ id: 'chat', name: 'Chat', icon: 'chat', tint: ['#34c7ff', '#1e6fd9'], size: [980, 660], minSize: [360, 320], badge, mount });
})();
