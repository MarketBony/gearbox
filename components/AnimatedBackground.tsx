import React from 'react';

/**
 * Fond animé de l'app : 4 grandes formes floues aux couleurs charte (orange, orange→violet,
 * violet, bleu) réparties sur tout le viewport, en dérive lente et désynchronisée.
 * Styles + keyframes définis dans index.html (.gx-bg / .gx-blob*, transform-only, will-change).
 * Monté uniquement dans l'app authentifiée (jamais sur Login). Fixe, derrière le contenu.
 */
const AnimatedBackground: React.FC = () => (
  <div className="gx-bg" aria-hidden="true">
    <div className="gx-blob gx-blob-a" />
    <div className="gx-blob gx-blob-b" />
    <div className="gx-blob gx-blob-c" />
    <div className="gx-blob gx-blob-d" />
  </div>
);

export default AnimatedBackground;
