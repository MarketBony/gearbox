/* =====================================================================================
   Balayage MESURÉ de physique.js (Node, en parallèle sur tous les cœurs) :
     node test-physique-balayage.mjs <chemin de rapier.mjs> [réglages JSON à essayer]
   1. Visée : pour chaque groupe (poche, nez, Brooklyn…), la boule SEULE est lancée et l'angle est trouvé par
      dichotomie pour qu'elle passe au point x visé à z = 18,05 (juste avant la quille 1) ; cache dans
      test-physique-visees.json (à supprimer si le crochet change).
   2. Les lancers complets sont simulés, et on compte strikes, quilles, quilles restées debout DÉCALÉES, déflexion
      de la boule par les quilles (cm, + = vers la gauche du joueur).

   Mesuré le 16/10/2026 avec les réglages par défaut (236 lancers) — voir le résumé du lot.
   ===================================================================================== */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ici = path.dirname(fileURLToPath(import.meta.url));
const cheminRapier = isMainThread ? process.argv[2] : workerData.cheminRapier;
if (!cheminRapier) { console.error('usage : node test-physique-balayage.mjs <chemin de rapier.mjs> [réglages JSON]'); process.exit(1); }
const RAPIER = (await import(pathToFileURL(path.resolve(cheminRapier)).href)).default;
const PH = await import(pathToFileURL(path.join(ici, 'physique.js')).href);
await PH.initPhysique(RAPIER);
const E = PH.emplacements();

/** x de la boule seule quand elle passe en z (interpolé entre deux images). */
function xEn(l, z, reglages) {
  const r = PH.simuler([], l, { reglages }), im = r.images;
  for (let i = 1; i < im.length; i++) if (im[i].boule[2] >= z) {
    const a = im[i - 1].boule, b = im[i].boule, u = (z - a[2]) / (b[2] - a[2]);
    return { x: a[0] + u * (b[0] - a[0]), gout: r.gouttiere };
  }
  return { x: NaN, gout: r.gouttiere };
}
/** Angle qui amène la boule en x = cible à z = 18,05 (dichotomie), ou null. */
function viser(base, cible, reglages) {
  let lo = -0.08, hi = 0.08;
  const f = (a) => xEn({ ...base, angle: a }, 18.05, reglages).x - cible;
  let flo = f(lo);
  const fhi = f(hi);
  if (Number.isNaN(flo) || Number.isNaN(fhi) || flo * fhi > 0) return null;
  for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2, fm = f(m); if (Number.isNaN(fm)) return null; if (fm * flo > 0) { lo = m; flo = fm; } else hi = m; }
  const a = (lo + hi) / 2, r = xEn({ ...base, angle: a }, 18.05, reglages);
  return !r.gout && Math.abs(r.x - cible) < 0.004 ? a : null;
}

if (!isMainThread) {
  parentPort.on('message', ({ id, l, reglages }) => {
    const t0 = performance.now();
    const r = PH.simuler(E, l, { reglages });
    const ms = performance.now() - t0;
    let defl = null;
    if (r.impactT !== null) {
      const im = r.images, i0 = im.findIndex((m) => m.t >= r.impactT), i1 = im.findIndex((m) => m.boule[2] >= 19.0), ia = Math.max(0, i0 - 3);
      if (i0 > 0 && i1 > i0) {
        const pente = (im[i0].boule[0] - im[ia].boule[0]) / (im[i0].boule[2] - im[ia].boule[2]);
        defl = im[i1].boule[0] - im[i0].boule[0] - pente * (im[i1].boule[2] - im[i0].boule[2]);
      }
    }
    const decalees = r.restent.filter((q) => { const e = E[q.n - 1]; return Math.hypot(q.x - e.x, q.z - e.z) > 0.01; }).length;
    parentPort.postMessage({ id, tombees: r.tombees, restent: r.restent.map((q) => q.n), ms, duree: r.duree, defl, decalees });
  });
} else {
  const reglages = process.argv[3] ? JSON.parse(process.argv[3]) : undefined;
  const CACHE = process.env.CACHE_VISEES || path.join(ici, 'test-physique-visees.json');
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const POCHE = [-0.105, -0.095, -0.085, -0.075, -0.065, -0.055, -0.045]; // entre la 1 (x = 0) et la 3 (x = -0,152)
  const groupes = {
    'poche, effet max': { effet: 1, cibles: POCHE, positions: [0.4, 0.3, 0.2, 0.1, 0.0], vitesses: [7.5, 8.5] },
    'poche, boule droite': { effet: 0, cibles: POCHE, positions: [0.3, 0.15, 0, -0.15, -0.3], vitesses: [7.5, 8.5] },
    'nez, effet max': { effet: 1, cibles: [-0.02, -0.01, 0, 0.01, 0.02], positions: [0.4, 0.25, 0.1], vitesses: [7.5, 8.5] },
    'nez, boule droite': { effet: 0, cibles: [-0.02, -0.01, 0, 0.01, 0.02], positions: [0.3, 0, -0.3], vitesses: [7.5, 8.5] },
    'Brooklyn (1-2)': { effet: 1, cibles: [0.045, 0.055, 0.065, 0.075, 0.085], positions: [0.4, 0.25, 0.1], vitesses: [7.5, 8.5] },
    'poche droite 8 m/s': { effet: 0, cibles: [-0.085, -0.075, -0.065, -0.055], positions: [0.3, 0, -0.3], vitesses: [8] },
    'poche droite 4 m/s': { effet: 0, cibles: [-0.085, -0.075, -0.065, -0.055], positions: [0.3, 0, -0.3], vitesses: [4] },
    'frôle la 10': { effet: 0, cibles: [-0.525, -0.515, -0.505], positions: [-0.3, -0.2, -0.1], vitesses: [8] },
  };
  const lancers = [];
  for (const [g, d] of Object.entries(groupes)) for (const v of d.vitesses) for (const xc of d.cibles) for (const pos of d.positions) {
    const k = `${d.effet}|${v}|${xc}|${pos}`;
    if (!(k in cache)) cache[k] = viser({ position: pos, vitesse: v, effet: d.effet }, xc, reglages);
    if (cache[k] !== null) lancers.push({ g, l: { position: pos, vitesse: v, effet: d.effet, angle: cache[k] } });
  }
  for (const p of [0.40, 0.42, 0.44]) lancers.push({ g: 'gouttière', l: { position: p, vitesse: 8, effet: 0, angle: 0.08 } });
  fs.writeFileSync(CACHE, JSON.stringify(cache));

  const N = Math.max(1, os.cpus().length - 1);
  const workers = Array.from({ length: N }, () => new Worker(fileURLToPath(import.meta.url), { workerData: { cheminRapier } }));
  const res = new Array(lancers.length);
  const t0 = performance.now();
  await new Promise((fin) => {
    let suivant = 0, faits = 0;
    const lancer = (w) => { if (suivant < lancers.length) { const id = suivant++; w.postMessage({ id, l: lancers[id].l, reglages }); } };
    for (const w of workers) {
      w.on('message', (m) => { res[m.id] = m; if (++faits === lancers.length) fin(); else lancer(w); });
      lancer(w);
    }
  });
  for (const w of workers) w.terminate();

  const st = {};
  lancers.forEach((L, i) => {
    const r = res[i], s = (st[L.g] ||= { n: 0, strikes: 0, quilles: 0, laisses: {}, defl: 0, nd: 0, decalees: 0, duree: 0 });
    s.n++; s.strikes += r.tombees === 10; s.quilles += r.tombees; s.decalees += r.decalees; s.duree += r.duree;
    if (r.defl !== null) { s.defl += r.defl; s.nd++; }
    const k = r.restent.join('-') || 'X'; s.laisses[k] = (s.laisses[k] || 0) + 1;
  });
  for (const [g, s] of Object.entries(st)) {
    const top = Object.entries(s.laisses).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, n]) => `${k}:${n}`).join(' ');
    console.log(`${g.padEnd(20)} n=${String(s.n).padStart(3)}  strikes ${String(Math.round(100 * s.strikes / s.n)).padStart(3)} %  quilles ${(s.quilles / s.n).toFixed(2)}  déflexion ${s.nd ? (100 * s.defl / s.nd).toFixed(1) : '-'} cm  debout décalées ${s.decalees}  | ${top}`);
  }
  const ms = res.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`${lancers.length} lancers en ${((performance.now() - t0) / 1000).toFixed(1)} s sur ${N} fils (par lancer, fils en concurrence : médiane ${ms[ms.length >> 1].toFixed(0)} ms)`);
}
