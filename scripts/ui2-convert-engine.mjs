// Convertit le MOTEUR de la maquette (maquettes/v2/js) en modules TypeScript pour la coque v2.
// But : un rendu et un comportement IDENTIQUES à la maquette — on ne réécrit pas, on déplace.
// Seules des substitutions MÉCANIQUES sont faites ici (la coque vit dans un Shadow DOM) :
//   document.documentElement / document.body.{classList,dataset,style} → GX.host (l'hôte)
//   document.body.{append,insertAdjacentHTML,appendChild,contains}     → GX.body (conteneur de la coque)
//   document.querySelector(All) / getElementById / activeElement        → GX.root (la racine fantôme)
//   écouteurs sur window / document                                     → GX.win / GX.unwin, qui rendent
//     à l'événement sa VRAIE cible (e.target d'un événement sorti d'un Shadow DOM vaut l'hôte)
// Les adaptations métier sont faites À LA MAIN dans les fichiers produits, balisées [GEARBOX].
// ⚠️ Relancer ce script ÉCRASE ces retouches : il ne sert qu'à la conversion initiale.
// Usage : node scripts/ui2-convert-engine.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SRC = path.join(ROOT, 'maquettes', 'v2', 'js');
const OUT = path.join(ROOT, 'ui2', 'os', 'engine');
// Ordre de maquettes/v2/index.html (data.js est remplacé par l'adaptateur de vraies données).
const FILES = ['core', 'charts', 'pickers', 'controls', 'icons', 'wallpapers', 'widgets', 'wm', 'shell', 'mobile', 'apps/system'];

function convert(src) {
  let s = src;
  const n = {};
  const rep = (re, to, key) => { s = s.replace(re, (...m) => { n[key] = (n[key] || 0) + 1; return typeof to === 'function' ? to(...m) : to.replace(/\$(\d)/g, (_x, i) => m[+i]); }); };
  rep(/document\.documentElement/g, 'GX.host', 'html→host');
  rep(/document\.body\.(classList|dataset|style)/g, 'GX.host.$1', 'body.classList→host');
  rep(/document\.body\.(append|insertAdjacentHTML|appendChild|contains|querySelector)/g, 'GX.body.$1', 'body.append→body');
  rep(/document\.(querySelectorAll|querySelector|getElementById)\(/g, 'GX.root.$1(', 'document.query→root');
  rep(/document\.activeElement/g, 'GX.root.activeElement', 'activeElement→root');
  // Écouteurs globaux : window.addEventListener, document.addEventListener et l'appel nu addEventListener(…)
  rep(/(?<![\w.$])(?:window\.)?addEventListener\(/g, 'GX.win(window, ', 'window.on→GX.win');
  rep(/(?<![\w.$])(?:window\.)?removeEventListener\(/g, 'GX.unwin(window, ', 'window.off→GX.unwin');
  rep(/(?<![\w.$])document\.addEventListener\('visibilitychange'/g, "document.addEventListener('visibilitychange'", 'visibility(inchangé)');
  rep(/(?<![\w.$])document\.addEventListener\(/g, 'GX.win(document, ', 'document.on→GX.win');
  rep(/(?<![\w.$])document\.removeEventListener\(/g, 'GX.unwin(document, ', 'document.off→GX.unwin');
  // $ (sélecteur local de shell.js / mobile.js) : racine par défaut = la racine fantôme
  rep(/\(s, r = document\) => r\.querySelector\(s\)/g, '(s, r = GX.root) => r.querySelector(s)', '$→root');
  return { s, n };
}

fs.mkdirSync(path.join(OUT, 'apps'), { recursive: true });
for (const f of FILES) {
  const src = fs.readFileSync(path.join(SRC, f + '.js'), 'utf8');
  const { s, n } = convert(src);
  const head = `// @ts-nocheck — moteur de la maquette CONVERTI (maquettes/v2/js/${f}.js), comportement identique.\n` +
    `// Typage fin : second temps, fichier par fichier, une fois le rendu validé identique à la maquette.\n` +
    `// Substitutions mécaniques : scripts/ui2-convert-engine.mjs. Retouches manuelles : balises [GEARBOX].\n` +
    (f === 'core' ? '' : `const GX = (window as any).GX;\n`) +
    `export function install(): void {\n`;
  fs.writeFileSync(path.join(OUT, f + '.ts'), head + s + `\n}\n`);
  console.log(f.padEnd(12), JSON.stringify(n));
}
