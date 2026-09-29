import React, { useEffect, useRef } from 'react';

// Menu déroulant charté de la coque (barre de menus, clic droit sur le Dock).
// Aucun menu natif : même principe que la maquette validée.

export type MenuItem =
  | '-'
  | { label: string; action?: () => void; disabled?: boolean; checked?: boolean; kbd?: string; danger?: boolean };

interface Props {
  items: MenuItem[];
  x: number;
  y: number;
  /** Ouvre vers le haut (menus du Dock). */
  up?: boolean;
  onClose: () => void;
}

const Menu: React.FC<Props> = ({ items, x, y, up, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // Au prochain tour : le clic qui a ouvert le menu ne doit pas le refermer.
    const t = setTimeout(() => window.addEventListener('pointerdown', down, true));
    window.addEventListener('keydown', key);
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key); };
  }, [onClose]);

  // Garde le menu dans l'écran.
  const left = Math.max(6, Math.min(x, window.innerWidth - 250));
  const style: React.CSSProperties = up ? { left, bottom: window.innerHeight - y } : { left, top: y };

  return (
    <div ref={ref} className="gx2-menu" style={style} role="menu">
      {items.map((it, i) =>
        it === '-' ? <div key={i} className="gx2-menu-sep" role="separator" /> : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`gx2-mi${it.danger ? ' danger' : ''}`}
            disabled={it.disabled}
            onClick={() => { onClose(); it.action?.(); }}
          >
            <span className="gx2-mi-check">{it.checked ? '✓' : ''}</span>
            <span className="gx2-mi-label">{it.label}</span>
            {it.kbd && <span className="gx2-mi-kbd">{it.kbd}</span>}
          </button>
        ),
      )}
    </div>
  );
};

export default Menu;
