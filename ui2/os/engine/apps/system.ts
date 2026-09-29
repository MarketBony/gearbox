// @ts-nocheck — moteur de la maquette CONVERTI (maquettes/v2/js/apps/system.js), comportement identique.
// Typage fin : second temps, fichier par fichier, une fois le rendu validé identique à la maquette.
// Substitutions mécaniques : scripts/ui2-convert-engine.mjs. Retouches manuelles : balises [GEARBOX].
export function install(): void {
const GX = (window as any).GX; // lu au démarrage (le noyau l'a créé), pas à l'import
/* Fenêtres système (hors Dock) */
GX.registerApp({
  id: 'about', name: 'À propos de Gearbox OS', icon: 'info', tint: ['#3a3548', '#1c1a24'], size: [460, 420], minSize: [380, 360], hidden: true, system: true,
  mount(body) {
    body.innerHTML = `<div class="app" style="align-items:center;justify-content:center;text-align:center;padding:28px;gap:10px">
      <img src="logo-white.svg" alt="Gearbox" style="height:30px;margin-bottom:6px" class="about-logo" />
      <div class="display" style="font-size:13px;letter-spacing:.2em;color:var(--text-2)">OS · maquette 2.0</div>
      <div class="muted" style="max-width:340px;line-height:1.6;margin-top:6px">Refonte « Bureau » : fenêtres façon macOS et Windows, ancrage, bureaux multiples, Mission Control, rubriques simulées sur le fonctionnement réel de Gearbox.</div>
      <div class="card pad" style="width:100%;text-align:left;margin-top:10px;display:grid;gap:6px;font-size:12px">
        <div class="row"><span class="faint grow">Données</span><b>fictives, en mémoire</b></div>
        <div class="row"><span class="faint grow">Rubriques</span><b>${[...GX.apps.values()].filter((a) => !a.hidden && !a.system).length}</b></div>
        <div class="row"><span class="faint grow">Ressorts</span><b>${GX.spring.snappy.ms} / ${GX.spring.soft.ms} ms</b></div>
        <div class="row"><span class="faint grow">Rendu</span><b>${CSS.supports('transition-timing-function', 'linear(0, 1)') ? 'ressorts natifs' : 'courbes de repli'} · ${document.startViewTransition ? 'View Transitions' : 'sans View Transitions'}</b></div>
      </div></div>`;
    if (GX.host.dataset.theme === 'light') body.querySelector('.about-logo').src = 'logo-color.svg';
  },
});

}
