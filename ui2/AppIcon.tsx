import React from 'react';
import { GLYPHS, HUES, ACCENTS, iconKey } from './appIcons';

const JOURS = ['DIM.', 'LUN.', 'MAR.', 'MER.', 'JEU.', 'VEN.', 'SAM.'];

// Tuile d'application style iOS (squircle à dégradé, pictogramme plein en deux tons).
// Agenda : page de calendrier du jour, comme dans la maquette validée.
const AppIcon: React.FC<{ id: string; size?: number }> = ({ id, size = 48 }) => {
  const key = iconKey(id);
  const k = GLYPHS[key] || key === 'agenda' ? key : 'launchpad';
  const [h1, h2] = HUES[k] || HUES.launchpad;
  const style = { '--s': `${size}px`, '--h1': h1, '--h2': h2, '--hx': ACCENTS[k] || h2 } as React.CSSProperties;
  if (k === 'agenda') {
    const d = new Date();
    return (
      <span className="gx2-ico gx2-cal" data-a="agenda" style={style} aria-hidden="true">
        <span className="cd">{JOURS[d.getDay()]}</span><span className="cn">{d.getDate()}</span>
      </span>
    );
  }
  return (
    <span className="gx2-ico" data-a={k} style={style} aria-hidden="true">
      {/* Tracés SVG statiques repris de la maquette (aucune donnée injectée). */}
      <svg className="gl" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: GLYPHS[k] }} />
    </span>
  );
};

export default AppIcon;
