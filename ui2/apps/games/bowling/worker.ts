// =====================================================================================
// BOWLING — la PHYSIQUE dans un Web Worker (repris de maquettes/jeux/bowling/worker-physique.js).
// Une simulation Rapier bloque 50–300 ms (la toute première ~860 ms : compilation WASM et JIT) : sur le fil
// principal, elle gèlerait le geste du Mii et la caméra juste après le lâcher. Même module que le serveur
// (shared/bowling/physique.ts), même paquet Rapier, même résultat au bit près.
//
// Messages reçus : { type: 'init' } ; { type: 'simuler', id, debout, lancer }
// Messages émis  : { type: 'pret', ms, msChauffe } ; { type: 'resultat', id, res, ms } ; { type: 'erreur', id?, message }
// =====================================================================================
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { emplacements, initPhysique, simuler } from '../../../../shared/bowling/physique';

let chargement: Promise<void> | null = null;
const initialiser = () => chargement || (chargement = charger());
const poste = (m: unknown) => (self as unknown as { postMessage: (m: unknown) => void }).postMessage(m);

async function charger() {
  const t0 = performance.now();
  await initPhysique(RAPIER);
  const t1 = performance.now();
  // Préchauffage : un premier lancer complet (la 1re simulation coûte ~860 ms ; les suivantes 50–300 ms).
  simuler(emplacements().map(({ n, x, z }: any) => ({ n, x, z })), { position: 0.1, angle: -0.01, vitesse: 7.5, effet: 0.4 }, { leger: true });
  poste({ type: 'pret', ms: Math.round(t1 - t0), msChauffe: Math.round(performance.now() - t1) });
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data || {};
  try {
    if (m.type === 'init') await initialiser();
    else if (m.type === 'simuler') {
      await initialiser();
      const t0 = performance.now();
      const res = simuler(m.debout, m.lancer);
      poste({ type: 'resultat', id: m.id, res, ms: Math.round(performance.now() - t0) });
    }
  } catch (err: any) {
    poste({ type: 'erreur', id: m.id, message: String((err && err.message) || err) });
  }
};
