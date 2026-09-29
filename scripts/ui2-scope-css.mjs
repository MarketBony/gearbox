// Met le CSS extrait de la maquette (ui2/os/maquette.raw.css) en portée Shadow DOM :
// la coque v2 vit dans une racine fantôme, donc `:root`, `html` et `body` deviennent `:host`.
// Transformation MÉCANIQUE, sélecteur par sélecteur — aucune règle n'est réécrite à la main.
//   :root                      → :host
//   :root[a]…  / :root:is(…)…  → :host([a]…) / :host(:is(…)…)   (partie « composée » collée à :root)
//   html, body                 → :host
//   body.x / body[x]           → :host(.x) / :host([x])
// Usage : node scripts/ui2-scope-css.mjs  → écrit ui2/os/maquette.css
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const src = fs.readFileSync(path.join(ROOT, 'ui2', 'os', 'maquette.raw.css'), 'utf8');

/** Découpe une liste de sélecteurs aux virgules de premier niveau (pas celles de :is(…)). */
function splitList(sel) {
  const out = []; let depth = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Lit la partie composée qui suit un sélecteur de racine (attributs, pseudo-classes, classes). */
function takeCompound(s, i) {
  let j = i, depth = 0;
  while (j < s.length) {
    const ch = s[j];
    if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) break;
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    j++;
  }
  return j;
}

function scopeOne(sel) {
  let s = sel;
  // html / body en tête du sélecteur
  const m = s.match(/^(html|body)(?![\w-])/);
  if (m) {
    const end = takeCompound(s, m[0].length);
    const comp = s.slice(m[0].length, end);
    return (comp ? `:host(${comp})` : ':host') + s.slice(end);
  }
  // :root (partout, en pratique toujours en tête)
  return s.replace(/:root(?![\w-])/g, (_x, off) => {
    const end = takeCompound(s, off + 5);
    const comp = s.slice(off + 5, end);
    // on marque pour remplacer d'un bloc après coup
    return `\u0000${comp}\u0001`;
  }).replace(/\u0000([^\u0001]*)\u0001/g, (_x, comp) => (comp ? `:host(${comp})` : ':host'))
    // la partie composée a été dupliquée dans :host(...) : on la retire derrière
    ;
}

// scopeOne ci-dessus laisse la partie composée à la fois dans :host(…) et derrière : on corrige.
function scopeSelector(sel) {
  const m = sel.match(/^(html|body)(?![\w-])/);
  if (m) return scopeOne(sel);
  const i = sel.indexOf(':root');
  if (i < 0) return sel;
  const end = takeCompound(sel, i + 5);
  const comp = sel.slice(i + 5, end);
  // « :root[x] body » : body EST l'hôte, il disparaît derrière :host(…)
  const rest = sel.slice(end).replace(/^\s+(html|body)(?![\w-])/, '');
  return sel.slice(0, i) + (comp ? `:host(${comp})` : ':host') + rest;
}

let changed = 0;
const res = postcss([{
  postcssPlugin: 'gx2-host',
  Rule(rule) {
    if (rule.parent && rule.parent.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
    const next = splitList(rule.selector).map(s => {
      // « html, body » : chaque élément de liste devient :host
      const t = scopeSelector(s);
      if (t !== s) changed++;
      return t;
    });
    rule.selector = [...new Set(next)].join(',\n');
  },
}]).process(src, { from: undefined });

const out = res.css.replace('ne pas éditer à la main.', 'ne pas éditer à la main (mis en portée :host par scripts/ui2-scope-css.mjs).');
fs.writeFileSync(path.join(ROOT, 'ui2', 'os', 'maquette.css'), out);
const leftovers = (out.match(/:root|(^|[\s,}])(html|body)[\s.#:[{,]/gm) || []).length;
console.log(`sélecteurs transformés : ${changed} · restes :root/html/body : ${leftovers} · ${out.length} caractères`);
