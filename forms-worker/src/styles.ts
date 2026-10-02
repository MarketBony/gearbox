// =====================================================================
// FORMS BONY — feuille de style des formulaires publics (F2a, 01/10/2026).
// Lit les variables CSS et les attributs posés par theme.ts sur <html> :
//   data-bg (solid|gradient|image|pattern|animated) + data-anim, data-header (band|banner|hero|split|none),
//   data-logo, data-fields (cards|flat|lines), data-inputs (outline|filled|underline), data-btn (solid|outline|
//   gradient|pill), data-motion (none|soft|lively), data-enter (fade|slide|spring), data-glass, data-layout.
// Tout mouvement passe par transform / opacity ; `prefers-reduced-motion` et data-motion="none" le coupent.
// =====================================================================
export const CSS = `
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;--dur:1}
html[data-motion="lively"]{--dur:1.25}html[data-motion="none"]{--dur:0}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--tx);font:calc(16px*var(--scale)) / 1.55 var(--font);-webkit-font-smoothing:antialiased;position:relative}
::selection{background:color-mix(in srgb,var(--p) 30%,transparent)}

/* ---------- calque de fond */
.bf-bg{position:fixed;inset:0;z-index:-1;overflow:hidden;background:var(--bg-layer)}
.bf-bg::before{content:"";position:absolute;inset:0;background:var(--bg-pattern)}
.bf-bg i{display:none;position:absolute;border-radius:50%}
[data-bg="image"] .bf-bg::before{inset:calc(var(--bg-blur)*-2);background:var(--bg-img) center/cover no-repeat;filter:blur(var(--bg-blur))}
[data-bg="image"] .bf-bg::after{content:"";position:absolute;inset:0;background:var(--bg);opacity:var(--bg-overlay)}
[data-anim="aurora"] .bf-bg i{display:block;width:70vmax;height:70vmax;filter:blur(90px);opacity:.42;animation:bf-aur calc(26s/max(var(--dur),.01)) ease-in-out infinite alternate}
[data-anim="aurora"] .bf-bg i:nth-child(1){background:var(--c1);top:-30vmax;left:-20vmax}
[data-anim="aurora"] .bf-bg i:nth-child(2){background:var(--c2);bottom:-35vmax;right:-25vmax;animation-delay:-8s}
[data-anim="aurora"] .bf-bg i:nth-child(3){background:var(--c3);top:20vh;left:30vw;width:45vmax;height:45vmax;opacity:.25;animation-delay:-15s}
@keyframes bf-aur{0%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(8vw,6vh,0) scale(1.12)}100%{transform:translate3d(-6vw,10vh,0) scale(.95)}}
[data-anim="bubbles"] .bf-bg i{display:block;width:34vmax;height:34vmax;filter:blur(60px);opacity:.5;animation:bf-bub calc(20s/max(var(--dur),.01)) ease-in-out infinite alternate}
[data-anim="bubbles"] .bf-bg i:nth-child(1){background:var(--c1);top:5%;left:-8%}
[data-anim="bubbles"] .bf-bg i:nth-child(2){background:var(--c2);top:45%;right:-10%;animation-delay:-6s}
[data-anim="bubbles"] .bf-bg i:nth-child(3){background:var(--c3);bottom:-10%;left:25%;animation-delay:-12s}
@keyframes bf-bub{to{transform:translate3d(6vw,-8vh,0) scale(1.15)}}
[data-anim="grain"] .bf-bg::after{content:"";position:absolute;inset:-50%;opacity:.12;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");animation:bf-grain 1s steps(6) infinite}
@keyframes bf-grain{0%{transform:translate(0,0)}20%{transform:translate(-4%,3%)}40%{transform:translate(3%,-5%)}60%{transform:translate(-2%,6%)}80%{transform:translate(5%,2%)}100%{transform:translate(0,0)}}

/* ---------- mise en page */
.bf-wrap{max-width:720px;margin:0 auto;padding:28px 16px 80px;position:relative}
.bf-card{background:var(--sf);border-radius:var(--r);padding:24px;box-shadow:var(--shadow);border:1px solid color-mix(in srgb,var(--tx) 8%,transparent)}
[data-glass="1"] .bf-card{-webkit-backdrop-filter:blur(24px) saturate(1.6);backdrop-filter:blur(24px) saturate(1.6);border-color:color-mix(in srgb,#fff 45%,transparent)}
h1,h2,.bf-h{font-family:var(--hfont);font-weight:var(--hw);text-transform:var(--hcase);letter-spacing:var(--hls)}
h1{font-size:clamp(calc(24px*var(--scale)),5vw,calc(34px*var(--scale)));line-height:1.12;margin:0 0 10px}
.bf-desc{margin:0;opacity:.8;white-space:pre-wrap}

/* ---------- en-têtes */
.bf-head{position:relative;overflow:hidden;padding:0}
.bf-head .bf-band{height:10px;background:var(--grad)}
.bf-head .bf-ban{height:200px;background:var(--h-img) center/cover no-repeat}
.bf-head .bf-hin{padding:22px 24px 24px}
.bf-logo{height:30px;color:var(--tx);margin-bottom:16px;display:flex}.bf-logo svg{height:100%;width:auto}.bf-logo.img img{height:100%;width:auto;max-width:220px;object-fit:contain}
.bf-logo.txt{font-weight:800;letter-spacing:.16em;text-transform:uppercase;font-size:17px;align-items:center}
[data-logo="center"] .bf-logo{justify-content:center}[data-logo="center"] .bf-hin,[data-logo="center"] .bf-plain{text-align:center}
[data-header="none"] .bf-head{background:none;box-shadow:none;border:0;-webkit-backdrop-filter:none;backdrop-filter:none}
[data-header="none"] .bf-head .bf-hin{padding:18px 4px 6px}
[data-header="none"] h1{font-size:clamp(calc(28px*var(--scale)),6vw,calc(44px*var(--scale)))}
.bf-hero{position:relative;min-height:62vh;display:flex;align-items:flex-end;background:var(--h-img) center/cover no-repeat;color:#fff;margin-bottom:-60px}
.bf-hero::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,var(--h-overlay)) 55%,rgba(0,0,0,calc(var(--h-overlay) + .2)) 100%)}
.bf-hero .bf-hin{position:relative;max-width:720px;width:100%;margin:0 auto;padding:40px 20px 96px}
.bf-hero .bf-logo{color:#fff}.bf-hero h1{font-size:clamp(calc(30px*var(--scale)),7vw,calc(56px*var(--scale)));text-shadow:0 2px 24px rgba(0,0,0,.35)}
.bf-hero .bf-desc{opacity:.92;max-width:560px}
[data-logo="center"] .bf-hero .bf-hin{text-align:center}[data-logo="center"] .bf-hero .bf-desc{margin:0 auto}
.bf-side{display:none}[data-header="split"] .bf-side{display:block;position:relative}
@media (min-width:900px){
  [data-header="split"] body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  [data-header="split"] .bf-side{position:sticky;top:0;height:100vh;background:var(--h-img) center/cover no-repeat}
  [data-header="split"] .bf-side::before{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,var(--h-overlay)),transparent 60%)}
  [data-header="split"] #app{grid-column:2;min-height:100vh}
  [data-header="split"] .bf-wrap{padding-top:48px}
}
@media (max-width:899px){[data-header="split"] .bf-side{height:220px;background:var(--h-img) center/cover no-repeat}}

/* ---------- questions */
.bf-list{display:flex;flex-direction:column;gap:14px;margin-top:14px}
.bf-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
.bf-q label.bf-l{display:block;font-weight:650;font-size:1.03em;margin-bottom:4px}
.bf-req{color:var(--p);margin-left:3px}
.bf-help{font-size:.88em;opacity:.72;margin:0 0 12px;white-space:pre-wrap}
[data-fields="flat"] .bf-list{background:var(--sf);border-radius:var(--r);box-shadow:var(--shadow);padding:10px 26px;gap:0;border:1px solid color-mix(in srgb,var(--tx) 8%,transparent)}
[data-glass="1"][data-fields="flat"] .bf-list{-webkit-backdrop-filter:blur(24px) saturate(1.6);backdrop-filter:blur(24px) saturate(1.6)}
[data-fields="flat"] .bf-list .bf-q,[data-fields="lines"] .bf-list .bf-q{background:none;box-shadow:none;border:0;border-radius:0;padding:18px 0;-webkit-backdrop-filter:none;backdrop-filter:none}
[data-fields="lines"] .bf-list{gap:0}
[data-fields="lines"] .bf-list .bf-fold{border-bottom:1px solid color-mix(in srgb,var(--tx) 14%,transparent)}
[data-fields="lines"] .bf-list .bf-q{padding:22px 2px}
.bf-list>.bf-fold.off{margin-top:-14px}[data-fields="flat"] .bf-list>.bf-fold.off,[data-fields="lines"] .bf-list>.bf-fold.off{margin-top:0;border:0}

/* apparition */
.bf-in{animation:bf-enter calc(.6s*var(--dur)) cubic-bezier(.22,1,.36,1) both;animation-delay:calc(var(--i,0)*55ms*var(--dur))}
[data-enter="fade"] .bf-in{animation-name:bf-fade}[data-enter="slide"] .bf-in{animation-name:bf-slide}
[data-enter="spring"] .bf-in{animation-timing-function:cubic-bezier(.34,1.56,.64,1)}
@keyframes bf-enter{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}
@keyframes bf-fade{from{opacity:0}to{opacity:1}}
@keyframes bf-slide{from{opacity:0;transform:translateX(-26px)}to{opacity:1;transform:none}}
.bf-fold{display:grid;grid-template-rows:1fr;transition:grid-template-rows calc(.4s*var(--dur)) cubic-bezier(.22,1,.36,1),opacity calc(.3s*var(--dur))}
.bf-fold>div{min-height:0}.bf-fold.off>div,.bf-fold.anim>div{overflow:hidden}.bf-fold.off{grid-template-rows:0fr;opacity:0;pointer-events:none}

/* ---------- saisies */
input.bf-t,textarea.bf-t,select.bf-t{width:100%;font:inherit;color:var(--tx);outline:0;padding:12px 14px;border-radius:calc(var(--r)*.6);transition:border-color .2s,box-shadow .2s,background .2s}
[data-inputs="outline"] .bf-t{background:color-mix(in srgb,var(--tx) 3%,var(--sf));border:1.5px solid color-mix(in srgb,var(--tx) 14%,transparent)}
[data-inputs="filled"] .bf-t{background:color-mix(in srgb,var(--tx) 7%,transparent);border:1.5px solid transparent}
[data-inputs="underline"] .bf-t{background:transparent;border:0;border-bottom:2px solid color-mix(in srgb,var(--tx) 22%,transparent);border-radius:0;padding-left:2px;padding-right:2px}
textarea.bf-t{min-height:110px;resize:vertical}
.bf-t:focus{border-color:var(--p)!important;box-shadow:0 0 0 4px color-mix(in srgb,var(--p) 20%,transparent)}
[data-inputs="underline"] .bf-t:focus{box-shadow:0 2px 0 0 var(--p)}
select.bf-t{color-scheme:light dark}

/* ---------- choix */
.bf-opts{display:grid;gap:8px}
.bf-opt{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:calc(var(--r)*.6);border:1.5px solid color-mix(in srgb,var(--tx) 12%,transparent);cursor:pointer;transition:border-color .2s,background .2s,transform calc(.2s*var(--dur)) cubic-bezier(.34,1.56,.64,1);user-select:none;position:relative}
[data-inputs="filled"] .bf-opt{border-color:transparent;background:color-mix(in srgb,var(--tx) 6%,transparent)}
.bf-opt:hover{border-color:color-mix(in srgb,var(--p) 55%,transparent)}
[data-motion="lively"] .bf-opt:hover{transform:translateY(-2px)}
.bf-opt:active{transform:scale(.985)}
.bf-opt input{position:absolute;opacity:0;pointer-events:none}
.bf-mk{width:22px;height:22px;flex:none;border:2px solid color-mix(in srgb,var(--tx) 30%,transparent);border-radius:50%;display:grid;place-items:center;transition:all .2s}
.bf-opt.sq .bf-mk{border-radius:6px}
.bf-mk::after{content:"";width:10px;height:10px;border-radius:inherit;background:var(--on-p);transform:scale(0);transition:transform calc(.25s*var(--dur)) cubic-bezier(.34,1.56,.64,1)}
.bf-opt.on{border-color:var(--p);background:color-mix(in srgb,var(--p) 11%,transparent)}
.bf-opt.on .bf-mk{background:var(--p);border-color:var(--p)}.bf-opt.on .bf-mk::after{transform:scale(1)}
.bf-other{margin-top:8px}
.bf-scale{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.bf-scale button{min-width:46px;height:46px;border-radius:calc(var(--r)*.6);border:1.5px solid color-mix(in srgb,var(--tx) 14%,transparent);background:transparent;color:var(--tx);font:inherit;font-weight:650;cursor:pointer;transition:all calc(.2s*var(--dur)) cubic-bezier(.34,1.56,.64,1)}
.bf-scale button:hover{border-color:var(--p);transform:translateY(-2px)}
.bf-scale button.on{background:var(--p);border-color:var(--p);color:var(--on-p);transform:scale(1.08)}
.bf-scale-l{display:flex;justify-content:space-between;font-size:.82em;opacity:.65;margin-top:6px}
.bf-stars{display:flex;gap:6px}.bf-stars button{font-size:34px;line-height:1;background:none;border:0;cursor:pointer;color:color-mix(in srgb,var(--tx) 22%,transparent);transition:transform calc(.2s*var(--dur)) cubic-bezier(.34,1.56,.64,1),color .2s;padding:2px}
.bf-stars button.on{color:var(--p)}.bf-stars button:hover{transform:scale(1.2) rotate(-6deg)}
.bf-consent{display:flex;gap:12px;align-items:flex-start;cursor:pointer;font-size:.92em}
.bf-consent .bf-mk{border-radius:6px;margin-top:2px}
.bf-err{color:#e5484d;font-size:.85em;margin-top:8px;display:flex;gap:6px;align-items:center;animation:bf-enter .3s both}
.bf-q.bad .bf-t,.bf-q.bad .bf-opt{border-color:#e5484d}
.bf-q.shake{animation:bf-shake .4s}@keyframes bf-shake{20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(2px)}}
.bf-sec{padding-top:12px}.bf-sec h2{font-size:1.32em;margin:0 0 4px}
.bf-stmt{white-space:pre-wrap}

/* ---------- boutons */
.bf-act{display:flex;align-items:center;gap:12px;margin-top:22px;flex-wrap:wrap}
.bf-btn{font:inherit;font-weight:700;font-size:1em;color:var(--on-p);background:var(--p);border:2px solid transparent;border-radius:calc(var(--r)*.7);padding:14px 28px;cursor:pointer;box-shadow:0 10px 24px -12px var(--p);transition:transform calc(.22s*var(--dur)) cubic-bezier(.34,1.56,.64,1),box-shadow .2s,opacity .2s,background .3s;display:inline-flex;align-items:center;gap:10px;text-transform:var(--bcase);letter-spacing:var(--bls)}
.bf-btn:hover{transform:translateY(-2px);box-shadow:0 16px 30px -12px var(--p)}.bf-btn:active{transform:scale(.97)}
[data-btn="outline"] .bf-btn:not(.ghost){background:transparent;color:var(--tx);border-color:var(--p);box-shadow:none}
[data-btn="outline"] .bf-btn:not(.ghost):hover{background:var(--p);color:var(--on-p)}
[data-btn="gradient"] .bf-btn:not(.ghost){background-color:var(--p);background-image:var(--grad);background-size:160% 100%;background-origin:border-box;background-repeat:no-repeat;background-position:0 0;color:var(--on-p);transition:transform calc(.22s*var(--dur)) cubic-bezier(.34,1.56,.64,1),box-shadow .2s,opacity .2s,background-position .5s}
[data-btn="gradient"] .bf-btn:not(.ghost):hover{background-position:100% 0}
[data-btn="pill"] .bf-btn{border-radius:999px;padding:15px 34px}
.bf-btn[disabled]{opacity:.6;cursor:wait;transform:none}
.bf-btn.ghost{background:transparent;color:var(--tx);box-shadow:none;border-color:color-mix(in srgb,var(--tx) 18%,transparent)}
.bf-spin{width:16px;height:16px;border-radius:50%;border:2.5px solid currentColor;border-right-color:transparent;animation:bf-rot .7s linear infinite}@keyframes bf-rot{to{transform:rotate(360deg)}}
.bf-gerr{color:#e5484d;font-weight:600;font-size:.9em}
.bf-hp{position:absolute!important;left:-9999px;width:1px;height:1px;opacity:0}

/* ---------- une question par écran */
.bf-prog{position:sticky;top:0;z-index:5;height:5px;background:color-mix(in srgb,var(--tx) 8%,transparent)}
.bf-prog i{display:block;height:100%;background:var(--grad);transform-origin:left;transition:transform calc(.45s*var(--dur)) cubic-bezier(.22,1,.36,1)}
.bf-step{min-height:58vh;display:flex;flex-direction:column;justify-content:center}
.bf-step .bf-q label.bf-l{font-size:1.38em}
.bf-stepnav{font-size:.82em;opacity:.6;margin-bottom:10px}
.bf-slide-in{animation:bf-sl calc(.5s*var(--dur)) cubic-bezier(.22,1,.36,1) both}@keyframes bf-sl{from{opacity:0;transform:translateY(34px)}to{opacity:1;transform:none}}
.bf-slide-back{animation:bf-sb calc(.5s*var(--dur)) cubic-bezier(.22,1,.36,1) both}@keyframes bf-sb{from{opacity:0;transform:translateY(-34px)}to{opacity:1;transform:none}}

/* ---------- fin, confettis, avis */
.bf-thanks{text-align:center;padding:48px 24px}
.bf-check{width:84px;height:84px;margin:0 auto 18px}
.bf-check circle{stroke:var(--p);stroke-width:4;fill:none;stroke-dasharray:252;stroke-dashoffset:252;animation:bf-draw calc(.7s*var(--dur)) cubic-bezier(.65,0,.35,1) forwards}
.bf-check path{stroke:var(--p);stroke-width:5;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;stroke-dashoffset:60;animation:bf-draw calc(.45s*var(--dur)) calc(.55s*var(--dur)) cubic-bezier(.65,0,.35,1) forwards}
@keyframes bf-draw{to{stroke-dashoffset:0}}
.bf-conf{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:9}
.bf-conf i{position:absolute;top:-12px;width:9px;height:14px;border-radius:2px;animation:bf-fall linear forwards}
@keyframes bf-fall{to{transform:translate3d(var(--dx),110vh,0) rotate(var(--rot));opacity:.9}}
.bf-notice{min-height:100vh;display:grid;place-items:center;padding:24px}.bf-notice .bf-card{max-width:460px;text-align:center}
.bf-ico{width:52px;height:52px;border-radius:50%;margin:0 auto 14px;display:grid;place-items:center;background:color-mix(in srgb,var(--p) 14%,transparent);color:var(--p);font-weight:800;font-size:24px}
.bf-foot{text-align:center;font-size:12px;opacity:.45;margin-top:26px}
.bf-pv{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:20;background:#111;color:#fff;font-size:12.5px;padding:8px 14px;border-radius:999px;box-shadow:0 8px 24px -8px rgba(0,0,0,.5);animation:bf-enter .3s both}
html[data-preview="1"] [data-f]{cursor:pointer}
html[data-preview="1"] [data-f].pv-on{outline:2px dashed var(--p);outline-offset:4px}

@media (max-width:560px){.bf-card{padding:18px}.bf-head .bf-hin{padding:18px}.bf-head .bf-ban{height:140px}.bf-scale button{min-width:40px;height:42px}.bf-row{grid-template-columns:minmax(0,1fr)}[data-fields="flat"] .bf-list{padding:6px 18px}}
html[data-motion="none"] *,html[data-motion="none"] *::before,html[data-motion="none"] *::after{animation:none!important;transition:none!important}
/* ---- F2b : demi-largeur (grille de deux colonnes, page seulement) */
.bf-list{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:14px;row-gap:14px}
.bf-list>.bf-fold{grid-column:1/-1}
.bf-list>.bf-fold.half{grid-column:auto}
[data-fields="flat"] .bf-list,[data-fields="lines"] .bf-list{column-gap:26px;row-gap:0}
@media (max-width:600px){.bf-list>.bf-fold.half{grid-column:1/-1}}
/* ---- F2b : tuiles illustrées */
.bf-opts.tiles{grid-template-columns:repeat(var(--cols),minmax(0,1fr))}
.bf-opts.tiles .bf-opt{flex-direction:column;align-items:stretch;gap:10px;padding:10px;text-align:center}
.bf-opts.tiles .bf-opt .bf-mk,.bf-opts.tiles .bf-opt .bf-key{position:absolute;top:10px;left:10px;z-index:1;background:var(--sf)}
.bf-opts.tiles .bf-opt.on .bf-mk{background:var(--p)}
.bf-tmedia{display:block;aspect-ratio:4/3;border-radius:calc(var(--r)*.45);background:center/cover no-repeat color-mix(in srgb,var(--tx) 6%,transparent);transition:transform calc(.35s*var(--dur)) cubic-bezier(.34,1.56,.64,1)}
.bf-temoji{display:grid;place-items:center;height:clamp(64px,11vw,92px);font-size:clamp(32px,6vw,46px);line-height:1;border-radius:calc(var(--r)*.45);background:color-mix(in srgb,var(--tx) 5%,transparent);transition:transform calc(.35s*var(--dur)) cubic-bezier(.34,1.56,.64,1)}
.bf-opts.tiles .bf-ol{font-weight:600;padding:2px 4px 4px}
.bf-opts.tiles .bf-opt:hover .bf-tmedia,.bf-opts.tiles .bf-opt:hover .bf-temoji{transform:scale(1.03)}
.bf-opts.tiles .bf-opt.on .bf-temoji{background:color-mix(in srgb,var(--p) 16%,transparent)}
@media (max-width:560px){.bf-opts.tiles{grid-template-columns:repeat(min(var(--cols),2),minmax(0,1fr))}}
.bf-ol{flex:1;min-width:0}
/* ---- F2b : raccourcis clavier (une question par écran) */
.bf-key{width:24px;height:24px;flex:none;display:grid;place-items:center;font-size:12px;font-weight:700;border-radius:6px;border:1.5px solid color-mix(in srgb,var(--tx) 25%,transparent);color:color-mix(in srgb,var(--tx) 70%,transparent);transition:all .2s}
.bf-opt.on .bf-key{background:var(--p);border-color:var(--p);color:var(--on-p)}
.bf-opt.kick{animation:bf-kick calc(.32s*var(--dur)) cubic-bezier(.34,1.56,.64,1)}
@keyframes bf-kick{40%{transform:scale(.96)}}
html[data-layout="steps"] .bf-step .bf-l{font-size:calc(22px*var(--scale));font-family:var(--hfont);font-weight:var(--hw);letter-spacing:var(--hls);line-height:1.25}
html[data-layout="steps"] .bf-step .bf-card{padding:30px}
/* ---- F2b : accueil et fin */
.bf-welcome{text-align:center;padding:34px 28px;margin-top:14px}
a.bf-btn{text-decoration:none}
.bf-welcome h2{font-size:calc(26px*var(--scale));margin:4px 0 10px}
.bf-endimg{height:180px;margin:-10px -10px 18px;border-radius:calc(var(--r)*.7);background:center/cover no-repeat}
.bf-hint{margin-top:12px;font-size:13px;opacity:.6}
/* ---- F3 : prise d'essai */
.bf-drive{display:grid;gap:12px}
.bf-dstep{display:flex;align-items:center;gap:8px;font-weight:700;font-size:.92em;margin-top:4px}
.bf-dstep b{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;background:var(--p);color:var(--on-p)}
.bf-days{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 8px;scroll-snap-type:x proximity}
.bf-day{flex:none;scroll-snap-align:start;display:grid;justify-items:center;gap:1px;min-width:62px;padding:8px 6px;border-radius:calc(var(--r)*.6);border:1.5px solid color-mix(in srgb,var(--tx) 14%,transparent);background:transparent;color:var(--tx);font:inherit;cursor:pointer;transition:all .2s}
.bf-day span{font-size:12px;opacity:.7;text-transform:capitalize}
.bf-day b{font-size:20px;line-height:1.1}
.bf-day:hover:not(:disabled){border-color:var(--p)}
.bf-day.on{background:var(--p);border-color:var(--p);color:var(--on-p)}
.bf-day.on span{opacity:.9}
.bf-day:disabled{opacity:.35;cursor:not-allowed}
.bf-times{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:8px}
.bf-time{padding:10px 0;border-radius:calc(var(--r)*.6);border:1.5px solid color-mix(in srgb,var(--tx) 14%,transparent);background:transparent;color:var(--tx);font:inherit;font-weight:600;cursor:pointer;transition:all .2s}
.bf-time:hover:not(:disabled){border-color:var(--p);transform:translateY(-1px)}
.bf-time.on{background:var(--p);border-color:var(--p);color:var(--on-p)}
.bf-time:disabled{opacity:.3;cursor:not-allowed;text-decoration:line-through}
.bf-dok{padding:10px 12px;border-radius:calc(var(--r)*.6);background:color-mix(in srgb,var(--p) 12%,transparent);font-weight:600;animation:bf-enter calc(.3s*var(--dur)) both}
/* ---- F3 : signature et fichiers */
.bf-sigw{display:grid;gap:6px}
.bf-sig{width:100%;aspect-ratio:3/1;border-radius:calc(var(--r)*.6);border:1.5px dashed color-mix(in srgb,var(--tx) 25%,transparent);background:color-mix(in srgb,var(--tx) 3%,var(--sf));touch-action:none;cursor:crosshair}
.bf-sigf{display:flex;justify-content:space-between;align-items:center;font-size:13px;opacity:.75}
.bf-btn.bf-sm{padding:6px 12px;font-size:13px;box-shadow:none}
.bf-files{display:grid;gap:8px}
.bf-file{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:calc(var(--r)*.6);background:color-mix(in srgb,var(--tx) 5%,transparent);animation:bf-enter calc(.25s*var(--dur)) both}
.bf-file.busy{opacity:.7}
.bf-drop{justify-content:center;border-style:dashed!important;width:100%}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;
