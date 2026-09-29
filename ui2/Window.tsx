import React, { useRef } from 'react';
import type { Win, WinMode } from './wm';
import { MIN_W, MIN_H } from './wm';
import AppIcon from './AppIcon';

// Une fenêtre de la coque v2.
// ⚠️ Le conteneur de la fenêtre ne porte NI transform, NI filter, NI backdrop-filter,
// NI `contain: paint` : chacun ferait de lui le bloc conteneur des `position: fixed`
// de la page hébergée — les modales des rubriques actuelles (`fixed inset-0`) seraient
// alors coincées dans la fenêtre au lieu de couvrir l'écran. L'effet « Mica » vit sur un
// calque frère (`.gx2-win-mica`), jamais sur un ancêtre du contenu.

type Zone = WinMode | null;

interface Props {
  win: Win;
  title: string;
  active: boolean;
  /** Agrandie ET active : la barre de titre fusionne avec la barre de menus. */
  merged: boolean;
  topInset: number;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMax: () => void;
  onGeometry: (p: Partial<Win>) => void;
  onSnapHint: (z: Zone) => void;
  children: React.ReactNode;
}

const EDGE = 6;
const zoneAt = (x: number, y: number): Zone =>
  y <= EDGE ? 'max' : x <= EDGE ? 'left' : x >= window.innerWidth - EDGE ? 'right' : null;

export function rectOf(win: Win, topInset: number): React.CSSProperties {
  const h = `calc(100% - ${topInset}px)`;
  switch (win.mode) {
    case 'max': return { left: 0, top: topInset, width: '100%', height: h };
    case 'left': return { left: 0, top: topInset, width: '50%', height: h };
    case 'right': return { left: '50%', top: topInset, width: '50%', height: h };
    default: return { left: win.x, top: win.y, width: win.w, height: win.h };
  }
}

const Window: React.FC<Props> = ({
  win, title, active, merged, topInset, onFocus, onClose, onMinimize, onToggleMax, onGeometry, onSnapHint, children,
}) => {
  const el = useRef<HTMLDivElement>(null);

  // Déplacement par la barre de titre, avec ancrage aux bords (Aero Snap).
  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    onFocus();
    const node = el.current!;
    const r = node.getBoundingClientRect();
    let { x, y } = win;
    // Une fenêtre agrandie ou ancrée reprend sa taille normale sous le curseur.
    let dx = e.clientX - r.left, dy = e.clientY - r.top;
    const wasSnapped = win.mode !== 'normal';
    if (wasSnapped) dx = Math.min(dx, win.w / 2) , dy = Math.min(dy, 20);
    let zone: Zone = null, moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
      if (!moved) {
        moved = true;
        node.classList.add('dragging');
        if (wasSnapped) {
          onGeometry({ mode: 'normal' });
          Object.assign(node.style, { width: `${win.w}px`, height: `${win.h}px` });
        }
      }
      x = Math.round(Math.min(Math.max(ev.clientX - dx, 40 - win.w), window.innerWidth - 40));
      y = Math.round(Math.min(Math.max(ev.clientY - dy, topInset), window.innerHeight - 40));
      node.style.left = `${x}px`; node.style.top = `${y}px`;
      const z = zoneAt(ev.clientX, ev.clientY);
      if (z !== zone) { zone = z; onSnapHint(z); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      node.classList.remove('dragging');
      onSnapHint(null);
      if (moved) onGeometry(zone ? { x, y, mode: zone } : { x, y, mode: 'normal' });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Redimensionnement par les 8 bords (mode normal seulement).
  const startResize = (dir: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    onFocus();
    const node = el.current!;
    const s = { x: win.x, y: win.y, w: win.w, h: win.h, px: e.clientX, py: e.clientY };
    let g = { ...s };
    node.classList.add('resizing');
    const move = (ev: PointerEvent) => {
      const ddx = ev.clientX - s.px, ddy = ev.clientY - s.py;
      g = { ...s };
      if (dir.includes('e')) g.w = Math.max(MIN_W, s.w + ddx);
      if (dir.includes('s')) g.h = Math.max(MIN_H, s.h + ddy);
      if (dir.includes('w')) { g.w = Math.max(MIN_W, s.w - ddx); g.x = s.x + s.w - g.w; }
      if (dir.includes('n')) { g.h = Math.max(MIN_H, s.h - ddy); g.y = Math.max(topInset, s.y + s.h - g.h); g.h = s.y + s.h - g.y; }
      Object.assign(node.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.h}px` });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      node.classList.remove('resizing');
      onGeometry({ x: g.x, y: g.y, w: g.w, h: g.h });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const cls = ['gx2-win', active ? 'active' : 'inactive', win.mode !== 'normal' ? `snap-${win.mode}` : '', merged ? 'merged' : '']
    .filter(Boolean).join(' ');

  return (
    <div
      ref={el}
      className={cls}
      style={{ ...rectOf(win, topInset), zIndex: win.z, display: win.min ? 'none' : undefined }}
      onPointerDownCapture={onFocus}
      role="dialog"
      aria-label={title}
    >
      <div className="gx2-win-mica" aria-hidden="true" />
      {!merged && (
        <div className="gx2-titlebar" onPointerDown={startDrag} onDoubleClick={onToggleMax}>
          <WindowLights onClose={onClose} onMinimize={onMinimize} onToggleMax={onToggleMax} />
          <span className="gx2-ttl"><AppIcon id={win.id} size={18} />{title}</span>
        </div>
      )}
      <div className="gx2-win-body">{children}</div>
      {win.mode === 'normal' && ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(d => (
        <div key={d} className={`gx2-rz ${d}`} onPointerDown={startResize(d)} />
      ))}
    </div>
  );
};

export const WindowLights: React.FC<{ onClose: () => void; onMinimize: () => void; onToggleMax: () => void }> = ({ onClose, onMinimize, onToggleMax }) => (
  <span className="gx2-lights">
    <button type="button" className="l-close" aria-label="Fermer" title="Fermer" onClick={onClose}>
      <svg viewBox="0 0 8 8"><path d="M1.5 1.5l5 5M6.5 1.5l-5 5" /></svg>
    </button>
    <button type="button" className="l-min" aria-label="Réduire" title="Réduire" onClick={onMinimize}>
      <svg viewBox="0 0 8 8"><path d="M1.2 4h5.6" /></svg>
    </button>
    <button type="button" className="l-max" aria-label="Agrandir" title="Agrandir / restaurer" onClick={onToggleMax}>
      <svg viewBox="0 0 8 8"><path d="M2 6V2h4M6 2v4H2" /></svg>
    </button>
  </span>
);

export default Window;
