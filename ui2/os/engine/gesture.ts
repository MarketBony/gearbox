// @ts-nocheck — module du moteur (même style que les fichiers convertis).
// =====================================================================
// [GEARBOX] PORTE UNIQUE du balayage 2 doigts (pavé tactile) dans la coque v2.
// Un seul écouteur `wheel` pour toute la coque : la reconnaissance (gesture-core.ts) découpe le flux en
// gestes, et CHAQUE GESTE entier appartient à un seul destinataire, choisi à son début d'après
// l'élément sous le curseur, du plus proche au plus lointain :
//   1. un élément qui a son propre balayage (Agenda, planning du Matériel…) : `GX.gesture.register` ;
//   2. un élément qui défile horizontalement ET peut encore défiler dans ce sens : défilement natif ;
//   3. une fenêtre : passage d'une fenêtre à l'autre (`owners.windows`, engine/winswipe.ts) ;
//   4. ailleurs (fond, Dock, barre du haut) : changement de bureau (`owners.spaces`, engine/wm.ts).
// Le destinataire le garde jusqu'au bout (inertie comprise) : un tableau arrivé en bout de course ne
// fait pas basculer de fenêtre en plein geste. Les fenêtres surgissantes (menus, sélecteurs, volets)
// n'ont aucun balayage.
// Ne jamais ajouter un second écouteur `wheel` horizontal ailleurs : s'enregistrer ici.
// =====================================================================
import { createSwipeRecognizer } from './gesture-core';

export function install(): void {
  const GX = (window as any).GX;
  const POPOVERS = '.menu,.pick,.gx-datecal,.panel,.ql,.shortcuts,.snap-assist,.snap-layouts,.switcher,.wgal,.sheet,.sheet-veil,.mc-spaces';
  const G = (GX.gesture = { owners: {}, reg: new WeakMap(), debug: null });

  /** Enregistre un élément qui a son propre balayage. `h` : { begin?(), move(acc, v), end?(acc, v, reason) }. */
  G.register = (el, h) => { G.reg.set(el, h); el.dataset.swipe = ''; return () => { if (G.reg.get(el) === h) { G.reg.delete(el); delete el.dataset.swipe; } }; };

  const canScrollX = (n, dx) => n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(n).overflowX)
    && (dx > 0 ? n.scrollLeft + n.clientWidth < n.scrollWidth - 1 : n.scrollLeft > 0);

  function resolve(t, dx) {
    if (!t || !t.closest || t.closest(POPOVERS)) return null;
    for (let n = t; n && n !== GX.host; n = n.parentElement) {
      const h = G.reg.get(n); if (h) return h;
      if (canScrollX(n, dx)) return null;                       // défilement natif
      if (n.classList?.contains('win')) {
        const w = G.owners.windows;
        if (w && w.enabled()) return w;
        // Balayage entre fenêtres désactivé : comportement d'origine (barre de titre = bureaux, contenu = rien).
        return t.closest('.win-body') ? null : G.owners.spaces || null;
      }
    }
    return G.owners.spaces || null;
  }

  let ev = null, owner = null, timer = 0;
  const rec = createSwipeRecognizer({
    begin() {
      owner = resolve(ev.target, ev.deltaX);
      if (!owner) return false;
      if (owner.begin && owner.begin(ev) === false) { owner = null; return false; }
      return true;
    },
    move(acc, v) { owner?.move?.(acc, v); },
    end(acc, v, reason) { const o = owner; try { o?.end?.(acc, v, reason); } finally { if (reason !== 'lift') owner = null; } },
  });
  G.recognizer = rec;

  const onWheel = (e) => {
    if (e.ctrlKey) return;                                     // pincer pour zoomer : au navigateur
    ev = e;
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerWidth : 1;
    const st = rec.feed({ t: e.timeStamp, dx: e.deltaX * k, dy: e.deltaY * k });
    if (st === 'rest') owner = null;
    // Geste à nous (suivi ou inertie avalée) : ni défilement, ni retour arrière du navigateur.
    if (st === 'track' || st === 'coast') e.preventDefault();
    G.debug?.(e, st);
    clearTimeout(timer); arm(rec.opts.idle + 10);
  };
  // Minuterie de fin : réarmée tant que le geste n'est pas conclu (l'inertie se conclut plus tard).
  const arm = (ms) => { timer = setTimeout(() => { rec.flush(performance.now()); if (rec.state() === 'rest') owner = null; else arm(100); }, ms); };
  GX.win(window, 'wheel', onWheel, { passive: false });

  // Le balayage horizontal en bout de page déclenche le retour arrière de Chrome / Edge (sortie de
  // Gearbox) : coupé pour tout le document dès que la coque v2 a démarré (inoffensif pour une appli d'une page).
  document.documentElement.style.overscrollBehaviorX = 'none';
  document.body.style.overscrollBehaviorX = 'none';
}
