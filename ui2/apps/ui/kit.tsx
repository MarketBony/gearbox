import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EngineWin } from '../types';

// =====================================================================
// Primitives de la maquette en React — MÊME balisage, MÊMES classes que les générateurs HTML du
// moteur (engine/pickers.ts `GX.ui.chips` / `pickerBtn`, engine/core.ts `.seg`, engine/r.ts).
// La CSS de la maquette s'applique donc telle quelle. La LOGIQUE est contrôlée par React :
//  - puces : pas d'attribut `data-multi` (sinon la délégation globale du moteur les basculerait
//    en même temps que React) ;
//  - segmenté : le curseur `.thumb` est rendu ici et placé ici (même calcul que `placeThumb`).
// Les fenêtres surgissantes (sélecteurs, calendrier, menus, volets) restent celles du MOTEUR,
// appelées impérativement : ce sont elles qui portent le mouvement de la maquette.
// =====================================================================

export const gx = (): any => (window as any).GX;
export const hud = (msg: string) => gx()?.shell?.hud?.(msg);

// ---------------------------------------------------------------- icônes
const iconCache = new Map<string, { cls: string; viewBox: string; inner: string }>();
function iconParts(name: string, size: string) {
  const k = `${name}|${size}`; let v = iconCache.get(k);
  if (!v) {
    const html: string = gx().icon(name, size);
    const m = /^<svg([^>]*)>([\s\S]*)<\/svg>$/.exec(html.trim());
    const attr = (a: string) => new RegExp(`${a}="([^"]*)"`).exec(m?.[1] || '')?.[1] || '';
    v = { cls: attr('class'), viewBox: attr('viewBox') || '0 0 24 24', inner: m?.[2] || '' };
    iconCache.set(k, v);
  }
  return v;
}
/** `GX.icon(name, size)` en élément React : le même `<svg class="i …">`. */
export const Icon = React.memo(function Icon({ name, size = '' }: { name: string; size?: string }) {
  const p = iconParts(name, size);
  return <svg className={p.cls} viewBox={p.viewBox} dangerouslySetInnerHTML={{ __html: p.inner }} />;
});

// ---------------------------------------------------------------- rendus partagés (engine/r.ts)
const D = () => gx().data;
export const Avatar: React.FC<{ uid: string; cls?: string }> = ({ uid, cls = '' }) => {
  const u = D().user(uid);
  return <span className={`av ${cls}`} style={{ '--c': u.color } as React.CSSProperties} data-tip={u.name}>{u.initials}</span>;
};
export const ServiceBadge: React.FC<{ s: string }> = ({ s }) => {
  const c = D().SERVICE_COLOR[s];
  return <span className="badge svc" style={{ '--c': c === '#293f74' ? '#5b7fd6' : c || '#8a8599' } as React.CSSProperties}>{s}</span>;
};
/** `GX.r.brandChips` : étiquettes pleines, texte foncé sur Renault. Séparées par une espace, comme l'original. */
export function BrandChips({ brands }: { brands: string[] }) {
  return <>{brands.map((b, i) => (
    <React.Fragment key={b}>{i > 0 && ' '}<span className="badge brand" style={{ '--c': D().brand(b)?.hex, ...(b === 'Renault' ? { color: '#1b1604' } : {}) } as React.CSSProperties}>{b}</span></React.Fragment>
  ))}</>;
}
export const ProPlus = () => <span className="badge solid" style={{ '--c': 'var(--bony-violet)' } as React.CSSProperties}>PRO+</span>;

// ---------------------------------------------------------------- contrôles
/** `GX.ui.chips` : « Toutes » (valeur vide) exclusif ; rend le tableau des valeurs cochées. */
export function Chips({ values, selected, onChange, all = 'Toutes', colors = {}, label = (v: string) => v }: {
  values: string[]; selected: string[]; onChange: (v: string[]) => void; all?: string; colors?: Record<string, string>; label?: (v: string) => string;
}) {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="chips">
      <button className="chip" aria-pressed={!selected.length} onClick={() => onChange([])}>{all}</button>
      {values.map((v) => (
        <button key={v} className="chip" aria-pressed={selected.includes(v)} onClick={() => toggle(v)}>
          {colors[v] ? <i className="brand-dot" style={{ '--c': colors[v] } as React.CSSProperties} /> : null}{label(v)}
        </button>
      ))}
    </div>
  );
}

/** Contrôle segmenté `.seg` avec son curseur à ressort. */
export function Seg<T extends string>({ value, options, onChange, className = '', style }: {
  value: T; options: [T, React.ReactNode][]; onChange: (v: T) => void; className?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null), first = useRef(true);
  useLayoutEffect(() => {
    const seg = ref.current; if (!seg) return;
    const b = seg.querySelector<HTMLElement>(':scope > button[aria-pressed="true"]'), t = seg.querySelector<HTMLElement>(':scope > .thumb');
    if (!b || !t) return;
    const anim = !first.current; first.current = false;
    if (!anim) t.style.transition = 'none';
    t.style.width = b.offsetWidth + 'px'; t.style.transform = `translateX(${b.offsetLeft}px)`;
    if (!anim) requestAnimationFrame(() => (t.style.transition = ''));
  });
  return (
    <div ref={ref} className={`seg ${className}`} style={style}>
      <span className="thumb" />
      {options.map(([v, l]) => <button key={v} data-v={v} aria-pressed={v === value} onClick={(e) => { e.stopPropagation(); if (v !== value) onChange(v); }}>{l}</button>)}
    </div>
  );
}

/** `GX.ui.pickerBtn` : bouton qui ouvre un sélecteur du moteur. */
export const PickerBtn = React.forwardRef<HTMLButtonElement, { icon?: string; label: string; active?: boolean; onClick: (el: HTMLButtonElement) => void }>(
  function PickerBtn({ icon, label, active, onClick }, ref) {
    return (
      <button ref={ref} className={`picker-btn ${active ? 'active' : ''}`} onClick={(e) => onClick(e.currentTarget)}>
        {icon ? <Icon name={icon} size="sm" /> : null}<span className="v">{label}</span><Icon name="chevdown" size="sm" />
      </button>
    );
  },
);

// ---------------------------------------------------------------- moteur
/** Abonnement à un événement du moteur (`GX.on`) pour la durée du composant. */
export function useEngineEvent(name: string, handler: (...a: any[]) => void) {
  const h = useRef(handler); h.current = handler;
  useEffect(() => gx().on(name, (...a: any[]) => h.current(...a)), [name]);
}

/** Valeur persistée dans le stockage du moteur (`GX.store`, propre à chaque compte). */
export function useEngineStore<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => gx().store.get(key, initial));
  const set = useCallback((n: T) => { gx().store.set(key, n); setV(n); }, [key]);
  return [v, set];
}

interface SheetEntry { id: number; host: HTMLElement; render: (close: (v?: unknown) => void) => React.ReactNode; close: (v?: unknown) => void }
let sheetSeq = 0;
/**
 * Volets de la fenêtre (`win.sheet` du moteur : voile, animation, Échap) avec un contenu React.
 * Rendre `portals` dans le composant ; `open(render, opts)` ouvre un volet.
 */
export function useSheets(win: EngineWin) {
  const [list, setList] = useState<SheetEntry[]>([]);
  const open = useCallback((render: SheetEntry['render'], opts: { width?: number; onClose?: (v?: unknown) => void } = {}) => {
    const id = ++sheetSeq;
    const sh = win.sheet('<div class="gx-sheet-root" style="display:contents"></div>', {
      width: opts.width,
      onClose: (v: unknown) => { opts.onClose?.(v); setTimeout(() => setList((L) => L.filter((x) => x.id !== id)), 380); },
    });
    if (!sh) return null;
    const host = sh.el.querySelector<HTMLElement>('.gx-sheet-root')!;
    setList((L) => [...L, { id, host, render, close: sh.close }]);
    return sh;
  }, [win]);
  const portals = list.map((s) => createPortal(<>{s.render(s.close)}</>, s.host, `sheet-${s.id}`));
  return { open, portals };
}
