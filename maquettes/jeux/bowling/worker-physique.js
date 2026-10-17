// =====================================================================================
// Bowling Gearbox — la PHYSIQUE dans un Web Worker (prototype v2, 17/10/2026).
// Une simulation Rapier bloque 50–300 ms (la toute première ~860 ms, compilation WASM et JIT) : sur le fil
// principal, elle gèlerait le geste de suivi du Mii et la caméra au pire moment, juste après le lâcher. Ici elle
// tourne à côté ; jeu.js n'attend que le résultat. Même module physique.js, même déterminisme.
//
// Messages reçus : { type: 'init' } ; { type: 'simuler', id, debout, lancer }
// Messages émis  : { type: 'pret', ms, msChauffe } ; { type: 'resultat', id, res, ms } ; { type: 'erreur', id?, message }
// =====================================================================================
const V = new URL(import.meta.url).search; // même « version » que la page (cache du serveur de maquettes)
let P = null, chargement = null;
const initialiser = () => chargement || (chargement = charger());

async function charger() {
  const t0 = performance.now();
  const mod = await import('./physique.js' + V);
  await mod.initPhysique();
  P = mod;
  const t1 = performance.now();
  // Préchauffage : un premier lancer complet (la 1re simulation coûte ~860 ms ; les suivantes 50–300 ms).
  P.simuler(P.emplacements().map(({ n, x, z }) => ({ n, x, z })), { position: 0.1, angle: -0.01, vitesse: 7.5, effet: 0.4 }, { leger: true });
  postMessage({ type: 'pret', ms: Math.round(t1 - t0), msChauffe: Math.round(performance.now() - t1) });
}

self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.type === 'init') await initialiser();
    else if (m.type === 'simuler') {
      await initialiser();
      const t0 = performance.now();
      const res = P.simuler(m.debout, m.lancer);
      postMessage({ type: 'resultat', id: m.id, res, ms: Math.round(performance.now() - t0) });
    }
  } catch (err) {
    postMessage({ type: 'erreur', id: m.id, message: String(err && err.message || err) });
  }
};
