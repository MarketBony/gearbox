// =====================================================================
// `viewport-fit=cover` — SEULEMENT pour la coque téléphone de Gearbox OS (07/10/2026).
// Sans lui, `env(safe-area-inset-*)` vaut 0 sur iPhone (encoche, barre du bas). On ne le met PAS dans
// index.html : l'ancienne interface (celle par défaut) ne gère aucune marge de sécurité, elle passerait sous
// l'encoche. La coque le pose au démarrage ; le repli vers l'ancienne interface (plantage) le retire.
// =====================================================================
let base: string | null = null;

export function setFitCover(on: boolean): void {
  const m = document.querySelector('meta[name="viewport"]');
  if (!m) return;
  if (base === null) base = (m.getAttribute('content') || '').replace(/,?\s*viewport-fit=[^,]*/g, '');
  m.setAttribute('content', on ? `${base}, viewport-fit=cover` : base);
}
