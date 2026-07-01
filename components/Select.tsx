import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { easeApple } from '../lib/motion';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string | string[];
  onChange: (v: any) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
  multiple?: boolean;
  disabled?: boolean;
  /** Force le champ de recherche (sinon auto si > 8 options). */
  searchable?: boolean;
}

const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Sélectionner…',
  className = '',
  size = 'md',
  multiple = false,
  disabled = false,
  searchable,
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; flip: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedValues: string[] = multiple
    ? (Array.isArray(value) ? value : [])
    : (value ? [value as string] : []);

  const showSearch = searchable ?? options.length > 8;

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const computePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const PANEL_H = 300, GAP = 6;
    const flip = r.bottom + GAP + PANEL_H > window.innerHeight && r.top - GAP - PANEL_H > 0;
    const top = flip ? r.top - GAP : r.bottom + GAP;
    let left = r.left;
    const width = Math.max(r.width, 200);
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    setPos({ top, left, width, flip });
  };

  useLayoutEffect(() => {
    if (open) computePos();
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      const sel = filtered.findIndex(o => selectedValues.includes(o.value));
      setActiveIndex(sel >= 0 ? sel : 0);
      if (showSearch) requestAnimationFrame(() => searchRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    const onScrollOrResize = () => setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open]);

  const commit = (v: string) => {
    if (multiple) {
      const cur = Array.isArray(value) ? value : [];
      onChange(cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]);
      // reste ouvert pour la multi-sélection
    } else {
      onChange(v);
      setOpen(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) commit(opt.value);
    }
  };

  const triggerPad = size === 'sm' ? 'py-1.5 pl-3 pr-9 text-xs min-h-[34px]' : 'py-3 pl-4 pr-11 text-sm min-h-[46px]';
  const chevronRight = size === 'sm' ? 'right-2.5' : 'right-3.5';
  const chevronSize = size === 'sm' ? 14 : 17;

  const singleLabel = !multiple
    ? options.find(o => o.value === value)?.label
    : undefined;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={onKeyDown}
        className={`relative w-full text-left bg-[var(--bg-input)] border rounded-2xl text-bony-text outline-none transition-all ${triggerPad} ${open ? 'border-bony-orange/60' : 'border-bony-border hover:border-bony-orange/40'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      >
        {multiple ? (
          selectedValues.length > 0 ? (
            <span className="flex flex-wrap gap-1 items-center">
              {selectedValues.map(v => {
                const opt = options.find(o => o.value === v);
                return (
                  <span key={v} className="inline-flex items-center gap-1 gx-gradient text-white rounded-full pl-2 pr-1 py-0.5 text-[11px] font-semibold">
                    {opt?.label ?? v}
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); commit(v); }}
                      className="hover:bg-white/25 rounded-full p-0.5 leading-none transition-colors"
                    >
                      <X size={11} />
                    </span>
                  </span>
                );
              })}
            </span>
          ) : (
            <span className="text-bony-muted">{placeholder}</span>
          )
        ) : (
          singleLabel
            ? <span className="block truncate">{singleLabel}</span>
            : <span className="block truncate text-bony-muted">{placeholder}</span>
        )}

        <ChevronDown
          size={chevronSize}
          className={`absolute ${chevronRight} top-1/2 -translate-y-1/2 transition-all ${open ? 'rotate-180 text-bony-orange' : 'text-bony-muted'}`}
        />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={popRef}
              role="listbox"
              onKeyDown={onKeyDown}
              initial={{ opacity: 0, y: pos.flip ? 6 : -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.flip ? 6 : -6, scale: 0.97 }}
              transition={{ duration: 0.18, ease: easeApple }}
              style={{
                position: 'fixed',
                left: pos.left,
                width: pos.width,
                transformOrigin: pos.flip ? 'bottom' : 'top',
                ...(pos.flip ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
              }}
              className="z-[10000] glass-menu glass-sheen relative overflow-hidden rounded-2xl p-1.5"
            >
              {showSearch && (
                <div className="relative mb-1.5">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bony-muted" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
                    onKeyDown={onKeyDown}
                    placeholder="Rechercher…"
                    className="w-full bg-[var(--bg-input)] border border-bony-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-bony-text outline-none focus:border-bony-orange/60"
                  />
                </div>
              )}

              <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                {filtered.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-bony-muted italic">Aucun résultat.</div>
                ) : (
                  filtered.map((opt, i) => {
                    const isSel = selectedValues.includes(opt.value);
                    const isActive = i === activeIndex;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => commit(opt.value)}
                        className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors
                          ${isActive ? 'bg-[var(--text-main)]/[0.08]' : ''}
                          ${isSel ? 'text-bony-orange font-bold' : 'text-bony-text'}`}
                      >
                        <span className="flex items-center gap-2 min-w-0 flex-1">
                          {isSel && <span className="w-1.5 h-1.5 rounded-full gx-gradient shrink-0" />}
                          <span className="truncate">{opt.label}</span>
                        </span>
                        {isSel && <Check size={15} className="text-bony-orange shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

export default Select;
