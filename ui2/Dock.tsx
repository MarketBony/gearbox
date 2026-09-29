import React, { useEffect, useState } from 'react';
import AppIcon from './AppIcon';
import Menu from './Menu';

// Dock de la coque v2. La liste des rubriques vient de `computeNav` (services/
// navigation.ts), la même source que la Sidebar : aucune règle de rôle ici.

export interface DockEntry { id: string; label: string; badge?: string }

interface Props {
  main: DockEntry[];
  extra: DockEntry[];            // après le séparateur (Archives, Paramètres)
  running: Set<string>;
  hidden: boolean;
  onOpen: (id: string) => void;
  onClose: (id: string) => void;
}

const Dock: React.FC<Props> = ({ main, extra, running, hidden, onOpen, onClose }) => {
  const [hover, setHover] = useState(false);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const shown = !hidden || hover || !!ctx;

  // Dock effacé : il revient quand le pointeur touche le bord bas, et repart quand il
  // s'en éloigne. Calculé sur la POSITION du pointeur (pointerenter/leave restaient
  // bloqués quand le Dock disparaissait sous le curseur).
  useEffect(() => {
    if (!hidden) { setHover(false); return; }
    const move = (e: PointerEvent) => {
      const h = window.innerHeight;
      setHover(v => (e.clientY >= h - 6 ? true : v && e.clientY > h - 110));
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [hidden]);

  const tile = (e: DockEntry) => (
    <button
      key={e.id}
      type="button"
      className={`gx2-dk${running.has(e.id) ? ' running' : ''}`}
      onClick={() => onOpen(e.id)}
      onContextMenu={ev => {
        ev.preventDefault();
        const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
        setCtx({ id: e.id, x: r.left, y: r.top - 8 });
      }}
      aria-label={e.badge ? `${e.label} (${e.badge})` : e.label}
    >
      <AppIcon id={e.id} size={48} />
      {e.badge && <span className="gx2-count">{e.badge}</span>}
      <span className="gx2-run" />
      <span className="gx2-tip">{e.label}</span>
    </button>
  );

  return (
    <>
      <div className={`gx2-dock-wrap${shown ? '' : ' hidden'}`}>
        <nav className="gx2-dock" aria-label="Rubriques">
          {main.map(tile)}
          {extra.length > 0 && <span className="gx2-dock-sep" />}
          {extra.map(tile)}
        </nav>
      </div>
      {ctx && (
        <Menu
          up
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            { label: running.has(ctx.id) ? 'Afficher' : 'Ouvrir', action: () => onOpen(ctx.id) },
            ...(running.has(ctx.id) ? ['-' as const, { label: 'Fermer', action: () => onClose(ctx.id) }] : []),
          ]}
        />
      )}
    </>
  );
};

export default Dock;
