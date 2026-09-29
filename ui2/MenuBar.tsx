import React, { useEffect, useState } from 'react';
import Menu, { MenuItem } from './Menu';
import { WindowLights } from './Window';
import type { Win } from './wm';

// Barre du haut de la coque v2. Escamotable par défaut (réglage maquette validé) : elle
// ne réserve aucune place et glisse par-dessus quand la souris touche le bord haut.
// Quand la fenêtre active est agrandie, sa barre de titre fusionne ici (feux + titre).

interface Props {
  auto: boolean;
  active: Win | null;
  activeTitle: string;
  merged: boolean;
  gearboxMenu: MenuItem[];
  windowMenu: MenuItem[];
  onLights: { close: () => void; minimize: () => void; toggleMax: () => void };
  right: React.ReactNode;
}

const MenuBar: React.FC<Props> = ({ auto, active, activeTitle, merged, gearboxMenu, windowMenu, onLights, right }) => {
  const [menu, setMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const [peek, setPeek] = useState(false);
  const [hover, setHover] = useState(false);
  const shown = !auto || peek || hover || !!menu;

  const openMenu = (name: string) => (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu(m => (m?.name === name ? null : { name, x: r.left, y: r.bottom + 4 }));
  };

  // Survol du bord haut : la barre descend ; elle remonte quand la souris s'en éloigne.
  useEffect(() => {
    if (!auto) return;
    const move = (e: PointerEvent) => setPeek(p => (e.clientY <= 2 ? true : p && e.clientY < 40));
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [auto]);

  const items = menu?.name === 'gearbox' ? gearboxMenu : menu?.name === 'window' ? windowMenu : null;

  return (
    <>
      <div
        className={`gx2-menubar${shown ? '' : ' hidden'}${merged ? ' merged' : ''}`}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
        <button type="button" className={`gx2-mb-item gx2-mb-logo${menu?.name === 'gearbox' ? ' open' : ''}`} onClick={openMenu('gearbox')} aria-label="Menu Gearbox">
          <img src="/icon-mark.svg" alt="" />
        </button>
        {merged && active && (
          <WindowLights onClose={onLights.close} onMinimize={onLights.minimize} onToggleMax={onLights.toggleMax} />
        )}
        <span className="gx2-mb-item gx2-mb-app">{active ? activeTitle : 'Gearbox'}</span>
        <button type="button" className={`gx2-mb-item${menu?.name === 'window' ? ' open' : ''}`} onClick={openMenu('window')}>
          Fenêtre
        </button>
        <span className="gx2-mb-right">{right}</span>
      </div>
      {items && menu && <Menu items={items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </>
  );
};

export default MenuBar;
