// Extrait le CSS EXACT de la maquette validée (maquettes/v2) pour l'interface v2 React.
// La maquette déclare ses styles dans css/*.css ET dans des appels GX.css(`…`) répartis dans
// ses scripts (parfois interpolés). On exécute chaque script dans un bac à sable Node où tout
// est factice sauf GX.css, qui collecte. Aucune réécriture à la main : la fidélité vient de là.
// Usage : node scripts/ui2-extract-css.mjs  → écrit ui2/os/maquette.css (brut, non scopé).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const V2 = path.join(ROOT, 'maquettes', 'v2');
const html = fs.readFileSync(path.join(V2, 'index.html'), 'utf8');
// index.html déclare ses feuilles et scripts dans des tableaux ['css/…', …] / ['js/…', …].
const arrays = [...html.matchAll(/\[([^\]]*'(?:css|js)\/[^\]]*)\]/g)].map(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]));
const links = arrays.flat().filter(f => f.endsWith('.css'));
const scripts = arrays.flat().filter(f => f.endsWith('.js'));

// Proxy « trou noir » : toute propriété, tout appel, toute construction rend un autre trou noir.
const hole = () => {
  const f = function () {};
  return new Proxy(f, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : k === Symbol.iterator ? function* () {} : hole()),
    apply: () => hole(), construct: () => hole(), set: () => true, has: () => true,
  });
};
const chunks = [];
let cur = '';
const sandbox = {};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
sandbox.document = hole(); sandbox.navigator = hole(); sandbox.localStorage = hole(); sandbox.sessionStorage = hole();
sandbox.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
sandbox.addEventListener = () => {}; sandbox.removeEventListener = () => {};
sandbox.requestAnimationFrame = () => 0; sandbox.cancelAnimationFrame = () => {};
sandbox.setTimeout = () => 0; sandbox.setInterval = () => 0; sandbox.clearTimeout = () => {}; sandbox.clearInterval = () => {};
sandbox.innerWidth = 1600; sandbox.innerHeight = 900; sandbox.devicePixelRatio = 1;
sandbox.performance = { now: () => 0 }; sandbox.console = console; sandbox.Math = Math; sandbox.Date = Date; sandbox.JSON = JSON;
sandbox.getComputedStyle = () => hole(); sandbox.location = { search: '', href: '' }; sandbox.URLSearchParams = URLSearchParams;
sandbox.EventTarget = class { addEventListener() {} removeEventListener() {} dispatchEvent() { return true; } };
sandbox.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } };
sandbox.Event = sandbox.CustomEvent; sandbox.Image = class {}; sandbox.ResizeObserver = class { observe() {} disconnect() {} };
sandbox.MutationObserver = sandbox.ResizeObserver; sandbox.IntersectionObserver = sandbox.ResizeObserver;
sandbox.HTMLElement = class {}; sandbox.Element = class {}; sandbox.Node = class {};
vm.createContext(sandbox);

for (const src of scripts) {
  const file = path.join(V2, src);
  let code = fs.readFileSync(file, 'utf8');
  // Après core.js, on remplace GX.css par le collecteur (core.js le définit au chargement).
  if (sandbox.GX && !sandbox.GX.__patched) { sandbox.GX.css = (txt) => { chunks.push({ src: cur, txt: String(txt) }); }; sandbox.GX.__patched = true; }
  cur = src;
  try {
    vm.runInContext(code, sandbox, { filename: src });
  } catch (e) {
    console.warn(`! ${src} : exécution partielle (${e.message.split('\n')[0]})`);
  }
  if (sandbox.GX && !sandbox.GX.__patched) { sandbox.GX.css = (txt) => { chunks.push({ src: cur, txt: String(txt) }); }; sandbox.GX.__patched = true; }
}

let out = '/* ⚠️ FICHIER GÉNÉRÉ par scripts/ui2-extract-css.mjs — ne pas éditer à la main.\n   Source : maquettes/v2 (feuilles + appels GX.css), ordre de chargement de index.html. */\n';
for (const l of links) out += `\n/* ===== ${l} ===== */\n` + fs.readFileSync(path.join(V2, l), 'utf8');
for (const c of chunks) out += `\n/* ===== GX.css — ${c.src} ===== */\n` + c.txt;
fs.mkdirSync(path.join(ROOT, 'ui2', 'os'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'ui2', 'os', 'maquette.raw.css'), out);
console.log(`feuilles : ${links.length} · blocs GX.css : ${chunks.length} (${[...new Set(chunks.map(c => c.src))].length} scripts) · ${out.length} caractères`);
