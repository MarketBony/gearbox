// Rejoue des enregistrements de maquettes/ux/diag-geste.html dans la reconnaissance du balayage
// (ui2/os/engine/gesture-core.ts), sans navigateur : sert à caler les seuils sur de vrais pavés.
//   node scripts/gesture-replay.mjs                      → auto-test sur des gestes synthétiques
//   node scripts/gesture-replay.mjs trace.json [...]     → score par étape (reconnus / demandés)
//   node scripts/gesture-replay.mjs trace.json --opts '{"decayRun":5}'   → essai d'autres réglages
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(tmpdir(), 'gesture-core.mjs');
await build({ entryPoints: [join(root, 'ui2/os/engine/gesture-core.ts')], outfile: out, format: 'esm', bundle: true, logLevel: 'silent' });
const { createSwipeRecognizer } = await import(pathToFileURL(out).href + '?t=' + Date.now());

const args = process.argv.slice(2);
const oi = args.indexOf('--opts'); const opts = oi >= 0 ? JSON.parse(args.splice(oi, 2)[1]) : {};

function run(samples) {
  const ends = []; let begins = 0;
  const r = createSwipeRecognizer({ begin: () => { begins++; return true; }, move() {}, end: (acc, v, reason) => ends.push({ acc: Math.round(acc), v: +v.toFixed(2), reason }) }, opts);
  for (const [t, dx, dy, mode = 0, ctrl = 0] of samples) { if (ctrl) continue; const k = mode === 1 ? 16 : 1; r.feed({ t, dx: dx * k, dy: dy * k }); }
  r.flush(Infinity);
  return { begins, ends };
}

if (!args.length) {
  // Gestes synthétiques : lancé, lent avec pause, enchaînés, vertical.
  let t = 0; const s = [];
  const push = (arr, dt = 16) => { for (const [dx, dy = 0] of arr) { t += dt; s.push([t, dx, dy]); } };
  const flick = (dir) => [...Array(6).fill([dir * 34]), ...Array.from({ length: 40 }, (_, i) => [dir * Math.max(0.4, 31 * Math.pow(0.9, i))])];
  const cases = [
    ['1 lancé', () => push(flick(1)), 1],
    ['1 lent, pause, levé', () => push(Array.from({ length: 30 }, () => [8 + Math.random() * 2])), 1],
    ['3 enchaînés', () => { push(flick(1).slice(0, 18)); t += 40; push(flick(1).slice(0, 18)); t += 40; push(flick(1)); }, 3],
    ['inertie avec saccade de 90 ms', () => { const f = flick(1); push(f.slice(0, 14)); t += 90; push(f.slice(14)); }, 1],
    ['vertical', () => push(Array.from({ length: 30 }, () => [0.5, 12])), 0],
  ];
  let ok = true;
  for (const [name, gen, want] of cases) { s.length = 0; t += 1000; gen(); const { begins } = run(s); const pass = begins === want; ok &&= pass; console.log(`${pass ? 'OK ' : 'KO '} ${name} : ${begins}/${want}`); }
  process.exit(ok ? 0 : 1);
}

for (const f of args) {
  const rec = JSON.parse(readFileSync(f, 'utf8'));
  console.log(`\n${f}\n  ${rec.ua}\n  écran ${rec.screen}, dpr ${rec.dpr}`);
  for (const [id, st] of Object.entries(rec.steps)) {
    const { begins, ends } = run(st.samples);
    const lifts = ends.filter((e) => e.reason === 'lift').length;
    console.log(`  ${begins === st.expected ? 'OK' : 'KO'}  ${id.padEnd(13)} ${String(begins).padStart(2)}/${st.expected}  (${st.samples.length} évts, ${lifts} levers détectés)  ${ends.map((e) => e.acc).join(' ')}`);
  }
}
