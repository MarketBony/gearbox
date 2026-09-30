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

// ---------------------------------------------------------------- champs à brouillon
/**
 * Champ texte / nombre à BROUILLON LOCAL : écrit au départ du champ (blur) ou sur Entrée, jamais
 * à la frappe — même règle que `components/ChampDiffere.tsx` (un PUT par frappe saturait le
 * pooler, correctif 48). Tant que le champ a le focus, une mise à jour venue du serveur ne
 * l'écrase pas ; il se resynchronise dès qu'il le perd.
 */
export function DraftInput({ value, onCommit, type = 'text', empty = 'zero', multiline, ...rest }: {
  value: string | number | null | undefined; onCommit: (v: any) => void; type?: 'text' | 'number';
  /** Nombre vidé : `zero` → 0, `null` → null (curseurs de part : vide = 100 % marque). */
  empty?: 'zero' | 'null'; multiline?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'type'>) {
  const shown = value === null || value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(shown);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(shown); }, [shown]);
  // Valeur lue DANS LE CHAMP, pas dans l'état : une frappe suivie d'un départ immédiat du champ
  // (avant le rendu suivant) serait sinon perdue.
  const commit = (raw: string) => {
    if (raw === shown) return;
    if (type === 'number') { const t = raw.trim(); onCommit(t === '' ? (empty === 'null' ? null : 0) : Number(t.replace(',', '.')) || 0); }
    else onCommit(raw);
  };
  const common = {
    ...rest, value: draft,
    onFocus: (e: any) => { focused.current = true; (rest as any).onFocus?.(e); },
    onBlur: (e: any) => { focused.current = false; commit(e.target.value); (rest as any).onBlur?.(e); },
    onChange: (e: any) => setDraft(e.target.value),
  };
  if (multiline) return <textarea {...(common as any)} />;
  return <input {...(common as any)} type={type} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); (rest as any).onKeyDown?.(e); }} />;
}

// ---------------------------------------------------------------- pile liste → détail
/**
 * `GX.ui.stack` du moteur en React (fenêtre étroite, téléphone) : même balisage (`.stack`,
 * `.page`, `.stack-head`, `.back`), mêmes ressorts à l'empilement / dépilement.
 */
export function Stack({ pages, onBack }: { pages: { key: string; title: string; noHead?: boolean; content: React.ReactNode }[]; onBack: () => void }) {
  const ref = useRef<HTMLDivElement>(null), depth = useRef(pages.length);
  useLayoutEffect(() => {
    const host = ref.current; if (!host) return;
    const els = [...host.querySelectorAll<HTMLElement>(':scope > .page')];
    if (pages.length > depth.current && els.length > 1) {
      const p = els[els.length - 1], prev = els[els.length - 2];
      gx().animate(p, [{ transform: 'translateX(100%)' }, { transform: 'none' }], { spring: 'snappy' });
      gx().animate(prev, [{ transform: 'none', filter: 'brightness(1)' }, { transform: 'translateX(-28%)', filter: 'brightness(.7)' }], { spring: 'snappy', fill: 'forwards' });
    } else if (pages.length < depth.current && els.length) {
      const prev = els[els.length - 1]; prev.getAnimations().forEach((a) => a.cancel());
      gx().animate(prev, [{ transform: 'translateX(-28%)', filter: 'brightness(.7)' }, { transform: 'none', filter: 'brightness(1)' }], { spring: 'snappy' });
    }
    depth.current = pages.length;
  }, [pages.length]);
  const edge = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = e.currentTarget, r = p.getBoundingClientRect(); if (pages.length < 2 || e.clientX - r.left > 24 || e.pointerType === 'mouse') return;
    const sx = e.clientX; let dx = 0; p.setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => { dx = Math.max(0, ev.clientX - sx); p.style.transform = `translateX(${dx}px)`; };
    const up = () => { p.removeEventListener('pointermove', mv); if (dx > r.width * .33) { p.style.transform = ''; onBack(); } else { gx().animate(p, [{ transform: `translateX(${dx}px)` }, { transform: 'none' }]); p.style.transform = ''; } };
    p.addEventListener('pointermove', mv); p.addEventListener('pointerup', up, { once: true });
  };
  return (
    <div ref={ref} className="app-body stack">
      {pages.map((pg, i) => (
        <div key={pg.key} className="page" onPointerDown={i > 0 ? edge : undefined}>
          {pg.noHead && i === 0 ? null : <div className="stack-head">{i > 0 ? <button className="back" onClick={onBack}><Icon name="back" size="lg" />{pages[i - 1].title}</button> : null}<span className="t ellipsis">{pg.title}</span></div>}
          <div className="scroll" style={{ flex: 1, minHeight: 0 }}>{pg.content}</div>
        </div>
      ))}
    </div>
  );
}

/** `GX.ui.watchWidth` : vrai sous le seuil de largeur du conteneur. */
export function useCompact(ref: React.RefObject<HTMLElement>, threshold: number) {
  const [c, setC] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setC(e.contentRect.width < threshold)); ro.observe(el);
    return () => ro.disconnect();
  }, [threshold]);
  return c;
}

// ---------------------------------------------------------------- balayage au pavé tactile
/**
 * Balayage horizontal au pavé tactile (deux doigts) = UN pas par geste (période suivante / précédente).
 * Un geste = un flux continu d'événements `wheel`, inertie comprise : on avance UNE fois quand le cumul
 * franchit le seuil, puis on verrouille jusqu'à ce que le flux s'arrête (`idle` ms sans événement).
 * L'ancienne règle (la maquette : un pas toutes les 550 ms) faisait 2 à 3 pas sur un pavé Windows, dont
 * l'inertie dure plus d'une seconde (recette 30/09/2026 : « ça m'envoie 3 semaines plus loin »).
 * Un élément qui défile lui-même horizontalement garde son défilement (tableau large, etc.).
 * Dans la coque, le geste passe par la PORTE UNIQUE du moteur (`GX.gesture`, ui2/os/engine/gesture.ts) :
 * l'élément devient le destinataire des gestes commencés au-dessus de lui (pas de bascule de fenêtre
 * par-dessus l'Agenda), et des balayages enchaînés sans pause comptent chacun pour un pas.
 */
export function bindSwipeWheel(el: HTMLElement, onStep: (dir: 1 | -1) => void, { threshold = 70, idle = 200 } = {}) {
  const G = gx()?.gesture;
  if (G) {
    let stepped = false;
    return G.register(el, {
      begin: () => { stepped = false; },
      move: (acc: number) => { if (!stepped && Math.abs(acc) >= threshold) { stepped = true; onStep(acc > 0 ? 1 : -1); } },
    }) as () => void;
  }
  // Hors coque (sans moteur) : reconnaissance locale d'origine.
  let acc = 0, locked = false, t = 0;
  const scrollsX = (target: EventTarget | null, dx: number) => {
    for (let n = target as HTMLElement | null; n && n !== el; n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(n).overflowX)) {
        if (dx > 0 ? n.scrollLeft + n.clientWidth < n.scrollWidth - 1 : n.scrollLeft > 0) return true;
      }
    }
    return false;
  };
  const wheel = (e: WheelEvent) => {
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.3;
    if (!locked && !horizontal) return;
    clearTimeout(t); t = window.setTimeout(() => { acc = 0; locked = false; }, idle);
    if (locked) return;                                   // fin du geste (inertie) : ignorée
    if (scrollsX(e.target, e.deltaX)) { acc = 0; return; }
    acc += e.deltaX;
    if (Math.abs(acc) >= threshold) { locked = true; onStep(acc > 0 ? 1 : -1); acc = 0; }
  };
  el.addEventListener('wheel', wheel, { passive: true });
  return () => { el.removeEventListener('wheel', wheel); clearTimeout(t); };
}
