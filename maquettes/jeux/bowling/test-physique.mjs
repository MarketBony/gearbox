/* =====================================================================================
   Tests de physique.js sous Node : déterminisme, temps de calcul, crochet, contacts, lâcher.
   Rapier n'est PAS installé dans le dépôt : on passe le chemin du paquet installé ailleurs (scratchpad) :
     npm i @dimforge/rapier3d-deterministic-compat@0.21.0   (dans un dossier hors dépôt)
     node test-physique.mjs <dossier>/node_modules/@dimforge/rapier3d-deterministic-compat/dist/rapier.mjs
   Affiche aussi l'empreinte (hash) de lancers de référence : test-physique.html doit afficher LA MÊME dans le
   navigateur (preuve que Node et navigateur calculent au bit près la même chose).
   ===================================================================================== */
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const cheminRapier = process.argv[2];
if (!cheminRapier) { console.error('usage : node test-physique.mjs <chemin de rapier.mjs>'); process.exit(1); }
const RAPIER = (await import(pathToFileURL(path.resolve(cheminRapier)).href)).default;
const ici = path.dirname(fileURLToPath(import.meta.url));
const urlPhysique = pathToFileURL(path.join(ici, 'physique.js')).href;
const PH = await import(urlPhysique);
await PH.initPhysique(RAPIER);
const { REFERENCES, empreinte } = await import(pathToFileURL(path.join(ici, 'test-physique-commun.js')).href);

const E = PH.emplacements();
let echecs = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'ÉCHEC'} ${msg}`); if (!cond) echecs++; };

// ---- 1. Déterminisme : deux appels identiques, puis un second exemplaire du module (import distinct)
console.log('\n== Déterminisme');
const PH2 = await import(urlPhysique + '?second');
await PH2.initPhysique(RAPIER);
for (const l of REFERENCES) {
  const a = PH.simuler(E, l), b = PH.simuler(E, l), c = PH2.simuler(E, l);
  const ha = empreinte(a), hb = empreinte(b), hc = empreinte(c);
  ok(ha === hb && ha === hc && JSON.stringify(a) === JSON.stringify(c),
    `${JSON.stringify(l)} → ${a.tombees} quilles, ${a.images.length} images, empreinte ${ha}`);
}
// lancer après un autre (état du WASM qui a déjà servi) et sur un rack partiel décalé
const rack = [{ n: 7, x: 0.47, z: 19.09, rot: 0.3 }, { n: 10, x: -0.457, z: 19.082 }];
const r1 = PH.simuler(rack, { position: -0.3, angle: 0.03, vitesse: 7, effet: -0.5 });
PH.simuler(E, REFERENCES[0]);
const r2 = PH.simuler(rack, { position: -0.3, angle: 0.03, vitesse: 7, effet: -0.5 });
ok(empreinte(r1) === empreinte(r2), `rack partiel rejoué après un autre lancer : empreinte ${empreinte(r1)}`);

// ---- 2. Temps de calcul (un seul fil, images comprises)
console.log('\n== Temps de calcul (Node, un fil)');
const temps = [];
for (const l of REFERENCES) for (let k = 0; k < 3; k++) {
  const t0 = performance.now(); const r = PH.simuler(E, l); temps.push([performance.now() - t0, r.duree]);
}
temps.sort((a, b) => a[0] - b[0]);
const moy = temps.reduce((s, x) => s + x[0], 0) / temps.length;
console.log(`  moyenne ${moy.toFixed(0)} ms, médiane ${temps[temps.length >> 1][0].toFixed(0)} ms, max ${temps[temps.length - 1][0].toFixed(0)} ms (durée simulée max ${Math.max(...temps.map((x) => x[1])).toFixed(2)} s)`);
ok(temps[temps.length - 1][0] < 400, 'chaque lancer < 400 ms');

// ---- 3. Crochet (boule seule)
console.log('\n== Crochet (boule seule, départ x = -0,3, angle 0)');
const ecart = (l) => {
  const r = PH.simuler([], l), im = r.images;
  const xA = (z) => { for (let i = 1; i < im.length; i++) if (im[i].boule[2] >= z) { const a = im[i - 1].boule, b = im[i].boule, u = (z - a[2]) / (b[2] - a[2]); return a[0] + u * (b[0] - a[0]); } return NaN; };
  const x0 = im[0].boule[0];
  let zRoule = null;
  for (let i = 0; i < r.roulement.length; i++) if (r.roulement[i].zone && r.roulement[i].glisse < 0.05 && im[i].boule[2] > 1) { zRoule = im[i].boule[2]; break; }
  const iP = im.findIndex((m) => m.boule[2] >= 18.29);
  return { huile: xA(11.2) - x0, fin: xA(18.29) - xA(12.29), vP: r.roulement[iP].vitesse, zRoule,
    angle: Math.atan2(im[iP].boule[0] - im[iP - 3].boule[0], im[iP].boule[2] - im[iP - 3].boule[2]) * 180 / Math.PI };
};
for (const [v, e] of [[8, 1], [8, 0.5], [8, 0], [10, 1], [6.5, 1]]) {
  const m = ecart({ position: 0.3, angle: 0, vitesse: v, effet: e });
  console.log(`  v ${v} effet ${e} : dérive dans l'huile (0→11,2 m) ${m.huile.toFixed(3)} m, sur les 6 derniers m ${m.fin.toFixed(3)} m, roule dès z = ${m.zRoule ? m.zRoule.toFixed(1) : '-'} m, ${m.vP} m/s et ${m.angle.toFixed(1)}° aux quilles`);
}
const c = ecart({ position: 0.3, angle: 0, vitesse: 8, effet: 1 });
ok(c.fin >= 0.3 && c.fin <= 0.55 && c.huile < 0.15, 'effet max : crochet 0,3–0,5 m sur la fin, peu dans l\'huile');

// ---- 4. Contacts : rafale d'un strike, frôlement de la 10
console.log('\n== Contacts');
const resume = (r) => {
  const t = {}; for (const x of r.contacts) { const k = x.type; (t[k] ||= [0, 0]); t[k][0]++; t[k][1] = Math.max(t[k][1], x.force); }
  return Object.entries(t).map(([k, [n, f]]) => `${k} ×${n} (max ${f.toFixed(0)} N)`).join(', ');
};
const s = PH.simuler(E, REFERENCES[0]);
console.log(`  poche (${s.tombees} quilles) : ${resume(s)}`);
const d = PH.simuler(E, REFERENCES[5]);
console.log(`  frôle la 10 (${d.tombees} quille(s)) : ${resume(d)}`);
ok(s.contacts.filter((x) => x.type === 'boule-quille' || x.type === 'quille-quille').length >= 8, 'un strike produit une rafale de chocs');
const g = PH.simuler(E, { position: 0.42, angle: 0.08, vitesse: 8, effet: 0 });
ok(g.gouttiere && g.tombees === 0 && !g.contacts.some((x) => x.type === 'boule-quille'), `gouttière : 0 quille, aucun contact boule-quille (${resume(g)})`);

// ---- 5. Lâcher raté : petit rebond, déterministe
console.log('\n== Lâcher');
for (const lacher of [1, 0.6, 0.2]) {
  const r = PH.simuler([], { position: 0, angle: 0, vitesse: 8, effet: 0, lacher });
  const hMax = Math.max(...r.images.slice(5, 60).map((m) => m.boule[1])) - PH.DIMENSIONS.rBoule;
  const rebonds = r.contacts.filter((x) => x.type === 'boule-piste' && x.t < 1);
  console.log(`  lacher ${lacher} : rebond max ${(hMax * 100).toFixed(1)} cm, chocs boule-piste ${rebonds.map((x) => `${x.t.toFixed(2)}s/${x.force.toFixed(0)}N`).join(' ')}`);
}

console.log(echecs ? `\n${echecs} ÉCHEC(S)` : '\nTout est OK');
process.exit(echecs ? 1 : 0);
