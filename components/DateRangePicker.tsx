import React, { useState, useRef } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import DatePicker from './DatePicker';
import FloatingPanel from './FloatingPanel';

// =====================================================================
// SÉLECTEUR DE PÉRIODE PARTAGÉ
//
// Extrait de pages/Dashboard.tsx le 30/07/2026 pour être réutilisé par la page
// Campagnes, qui avait ses propres champs de dates (et même DEUX périodes
// indépendantes : une pour les graphiques, une pour la liste).
//
// Les raccourcis SEMESTRE ont été ajoutés à cette occasion — ils manquaient, et
// les deux pages en profitent.
// =====================================================================

export const toLocalIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const formatDateBtn = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Parse local (anti-décalage J+1) : 'YYYY-MM-DD' → Date à minuit local.
export const parseLocalDate = (iso: string): Date => {
  const [y, m, d] = (iso || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const getPeriodRanges = () => {
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth();
  const day = now.getDay();
  const monOffset = day === 0 ? -6 : 1 - day;   // semaine du lundi au dimanche
  const mon = new Date(now); mon.setDate(now.getDate() + monOffset);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const q = Math.floor(mo / 3);
  const prevQ = q === 0 ? 3 : q - 1;
  const prevQYear = q === 0 ? y - 1 : y;
  // Semestre : S1 = janvier-juin, S2 = juillet-décembre.
  const s = mo < 6 ? 0 : 1;
  const prevS = s === 0 ? 1 : 0;
  const prevSYear = s === 0 ? y - 1 : y;
  return {
    today:       { start: toLocalIso(now), end: toLocalIso(now) },
    week:        { start: toLocalIso(mon), end: toLocalIso(sun) },
    month:       { start: toLocalIso(new Date(y, mo, 1)), end: toLocalIso(new Date(y, mo + 1, 0)) },
    quarter:     { start: toLocalIso(new Date(y, q * 3, 1)), end: toLocalIso(new Date(y, q * 3 + 3, 0)) },
    prevQuarter: { start: toLocalIso(new Date(prevQYear, prevQ * 3, 1)), end: toLocalIso(new Date(prevQYear, prevQ * 3 + 3, 0)) },
    semester:    { start: toLocalIso(new Date(y, s * 6, 1)), end: toLocalIso(new Date(y, s * 6 + 6, 0)) },
    prevSemester:{ start: toLocalIso(new Date(prevSYear, prevS * 6, 1)), end: toLocalIso(new Date(prevSYear, prevS * 6 + 6, 0)) },
    year:        { start: `${y}-01-01`, end: `${y}-12-31` },
    prevYear:    { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` },
  };
};

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({ startDate, endDate, onStartChange, onEndChange }) => {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => {
    setOpen(v => !v);
    setCustomMode(false);
  };

  const close = () => { setOpen(false); setCustomMode(false); };

  const appliquer = (cle: keyof ReturnType<typeof getPeriodRanges>) => () => {
    const r = getPeriodRanges()[cle];
    onStartChange(r.start);
    onEndChange(r.end);
    close();
  };

  const shortcuts: { label: string; apply: () => void }[] = [
    { label: "Aujourd'hui",         apply: appliquer('today') },
    { label: 'Cette semaine',        apply: appliquer('week') },
    { label: 'Ce mois',              apply: appliquer('month') },
    { label: 'Ce trimestre',         apply: appliquer('quarter') },
    { label: 'Le trimestre dernier', apply: appliquer('prevQuarter') },
    { label: 'Ce semestre',          apply: appliquer('semester') },
    { label: 'Le semestre dernier',  apply: appliquer('prevSemester') },
    { label: 'Cette année',          apply: appliquer('year') },
    { label: "L'année dernière",     apply: appliquer('prevYear') },
    { label: 'Personnalisé',         apply: () => setCustomMode(true) },
  ];

  const shortcutList = (
    <div className="p-1">
      {shortcuts.map(s => (
        <button key={s.label} onClick={s.apply}
          className="w-full text-left px-3 py-2.5 text-xs font-bold text-bony-text hover:bg-white/5 rounded-lg transition flex items-center justify-between gap-2 min-w-0">
          <span className="truncate min-w-0">{s.label}</span>
          {s.label === 'Personnalisé' && <ChevronRight size={14} className="text-slate-500 shrink-0" />}
        </button>
      ))}
    </div>
  );

  const customForm = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Période personnalisée</span>
        <button onClick={() => setCustomMode(false)} className="text-slate-400 hover:text-bony-text"><X size={14} /></button>
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Du</label>
          <DatePicker value={startDate} onChange={v => onStartChange(v)} size="sm" />
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Au</label>
          <DatePicker value={endDate} onChange={v => onEndChange(v)} size="sm" />
        </div>
      </div>
      <button onClick={close} className="w-full py-2 rounded-lg bg-bony-gradient text-white text-xs font-bold mt-1">
        Appliquer
      </button>
    </div>
  );

  return (
    <div ref={triggerRef} className="relative">
      {/* `py-3.5 -my-3.5` : la zone tactile passe de 16 à 44 px SANS changer la
          hauteur occupée (la marge négative compense le padding). Les deux
          déclencheurs faisaient 16 px de haut, inatteignables au doigt. */}
      <div className="flex items-center gap-1.5">
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Du</span>
          <button onClick={handleOpen}
            className="flex items-center gap-1.5 py-3.5 -my-3.5 text-xs font-bold text-bony-text hover:text-bony-orange transition whitespace-nowrap">
            {formatDateBtn(startDate)} <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <span className="text-slate-400 text-xs mt-3">→</span>
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Au</span>
          <button onClick={handleOpen}
            className="flex items-center gap-1.5 py-3.5 -my-3.5 text-xs font-bold text-bony-text hover:text-bony-orange transition whitespace-nowrap">
            {formatDateBtn(endDate)} <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* 10 raccourcis désormais : hauteur du panneau relevée en conséquence. */}
      <FloatingPanel open={open} onClose={close} triggerRef={triggerRef} width={208} maxHeight={420} className="rounded-xl">
        {customMode ? customForm : shortcutList}
      </FloatingPanel>
    </div>
  );
};

export default DateRangePicker;
