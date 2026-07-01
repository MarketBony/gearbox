import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfMonth, startOfWeek, addDays, addMonths, isSameMonth, isSameDay, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import FloatingPanel from './FloatingPanel';

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
  /** Date minimale sélectionnable (ISO 'YYYY-MM-DD') — les jours antérieurs sont désactivés. */
  minDate?: string;
}

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, placeholder = 'Choisir une date', className = '', size = 'md', minDate }) => {
  const [open, setOpen] = useState(false);
  const selected = fromISO(value);
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(selected ?? new Date()));
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selected) setViewMonth(startOfMonth(selected));
  }, [value]);

  const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();

  const isDisabled = (d: Date) => !!minDate && toISO(d) < minDate;

  const handlePick = (d: Date) => {
    if (isDisabled(d)) return;
    onChange(toISO(d));
    setOpen(false);
  };
  const todayDisabled = isDisabled(new Date());

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

      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        width={300}
        maxHeight={380}
        className="rounded-3xl p-4"
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
                  const disabled = isDisabled(d);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={disabled}
                      onClick={() => handlePick(d)}
                      className={`h-9 rounded-full text-[13px] font-semibold flex items-center justify-center transition-all
                        ${disabled
                          ? 'text-bony-muted/25 cursor-not-allowed line-through decoration-1'
                          : isSel
                            ? 'gx-gradient text-white shadow-glow'
                            : inMonth
                              ? 'text-bony-text hover:bg-[var(--text-main)]/[0.08]'
                              : 'text-bony-muted/40 hover:bg-[var(--text-main)]/[0.05]'}
                        ${isToday && !isSel && !disabled ? 'ring-1 ring-bony-orange/50' : ''}`}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={todayDisabled}
                onClick={() => handlePick(new Date())}
                className={`w-full mt-3 py-2 rounded-full text-xs font-bold transition-colors shrink-0 ${todayDisabled ? 'text-bony-muted/30 cursor-not-allowed' : 'text-bony-orange hover:bg-bony-orange/[0.08]'}`}
              >
                Aujourd'hui
              </button>
      </FloatingPanel>
    </>
  );
};

export default DatePicker;
