import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfMonth, startOfWeek, addDays, addMonths, isSameMonth, isSameDay, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { easeApple } from '../lib/motion';

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s: string): Date | null => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const WEEKDAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

interface DatePickerProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
}

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, placeholder = 'Choisir une date', className = '', size = 'md' }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const selected = fromISO(value);
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(selected ?? new Date()));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) setViewMonth(startOfMonth(selected));
  }, [value]);

  const computePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const PANEL_W = 300, PANEL_H = 360, GAP = 8;
    let top = r.bottom + GAP;
    if (top + PANEL_H > window.innerHeight && r.top - GAP - PANEL_H > 0) {
      top = r.top - GAP - PANEL_H;
    }
    let left = r.left;
    if (left + PANEL_W > window.innerWidth - 8) left = window.innerWidth - PANEL_W - 8;
    if (left < 8) left = 8;
    setPos({ top, left, width: r.width });
  };

  useLayoutEffect(() => {
    if (open) computePos();
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

  const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();

  const handlePick = (d: Date) => {
    onChange(toISO(d));
    setOpen(false);
  };

  const triggerPad = size === 'sm' ? 'py-1.5 pl-9 pr-3 text-xs' : 'py-3 pl-11 pr-4 text-sm';
  const iconLeft = size === 'sm' ? 'left-2.5' : 'left-3.5';
  const iconSize = size === 'sm' ? 14 : 17;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        className={`relative w-full text-left bg-[var(--bg-input)] border rounded-2xl text-bony-text outline-none transition-all ${triggerPad} ${open ? 'border-bony-orange/60' : 'border-bony-border hover:border-bony-orange/40'} ${className}`}
      >
        <Calendar size={iconSize} className={`absolute ${iconLeft} top-1/2 -translate-y-1/2 ${open ? 'text-bony-orange' : 'text-bony-muted'} transition-colors`} />
        {selected
          ? <span className="block truncate">{format(selected, 'd MMM yyyy', { locale: fr })}</span>
          : <span className="block truncate text-bony-muted">{placeholder}</span>}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={popRef}
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.18, ease: easeApple }}
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: 300, transformOrigin: 'top' }}
              className="z-[10000] glass-menu glass-sheen relative overflow-hidden rounded-3xl p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={() => setViewMonth(m => addMonths(m, -1))} className="p-1.5 rounded-full hover:bg-[var(--text-main)]/[0.08] text-bony-muted hover:text-bony-text transition-colors">
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm font-bold text-bony-text capitalize select-none">
                  {format(viewMonth, 'MMMM yyyy', { locale: fr })}
                </span>
                <button type="button" onClick={() => setViewMonth(m => addMonths(m, 1))} className="p-1.5 rounded-full hover:bg-[var(--text-main)]/[0.08] text-bony-muted hover:text-bony-text transition-colors">
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map(d => (
                  <span key={d} className="text-center text-[10px] font-bold text-bony-muted uppercase py-1">{d}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {days.map((d, i) => {
                  const inMonth = isSameMonth(d, viewMonth);
                  const isSel = selected && isSameDay(d, selected);
                  const isToday = isSameDay(d, today);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handlePick(d)}
                      className={`h-9 rounded-full text-[13px] font-semibold flex items-center justify-center transition-all
                        ${isSel
                          ? 'gx-gradient text-white shadow-glow'
                          : inMonth
                            ? 'text-bony-text hover:bg-[var(--text-main)]/[0.08]'
                            : 'text-bony-muted/40 hover:bg-[var(--text-main)]/[0.05]'}
                        ${isToday && !isSel ? 'ring-1 ring-bony-orange/50' : ''}`}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => handlePick(new Date())}
                className="w-full mt-3 py-2 rounded-full text-xs font-bold text-bony-orange hover:bg-bony-orange/[0.08] transition-colors"
              >
                Aujourd'hui
              </button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

export default DatePicker;
