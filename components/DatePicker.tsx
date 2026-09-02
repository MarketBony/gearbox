import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
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
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

// Le panneau a trois modes. Avant, il n'avait que deux flèches ±1 mois : atteindre
// une date de naissance demandait de remonter mois par mois — 2026 → 1998 faisait
// **336 clics**. On passe par une grille d'années puis de mois.
type Mode = 'jours' | 'mois' | 'annees';

// 24 années par page, en 4 colonnes × 6 lignes, sur des pages FIXES alignées sur des
// multiples de 24. Ce nombre n'est pas esthétique, il est calculé : la page qui
// contient l'année courante (2016-2039 en 2026) est voisine de celle qui contient les
// années de naissance courantes (1992-2015), donc une seule flèche suffit à y aller.
// Une pagination plutôt qu'une liste bornée : pas de « à partir de 1930 » à maintenir.
const ANNEES_PAR_PAGE = 24;
const debutPageAnnees = (annee: number) => Math.floor(annee / ANNEES_PAR_PAGE) * ANNEES_PAR_PAGE;

interface DatePickerProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
  /** Date minimale sélectionnable (ISO 'YYYY-MM-DD') — les jours antérieurs sont désactivés. */
  minDate?: string;
  /**
   * Affiche un bouton « Effacer » quand une date est posée (renvoie '' à `onChange`).
   * Opt-in DÉLIBÉRÉ : le composant n'offrait aucun moyen de vider un champ, ce qui
   * convient aux dates OBLIGATOIRES (début/fin de projet, date de dépense) mais pas à
   * une échéance de tâche, qui est optionnelle. Laisser le défaut à `false` garde les
   * usages existants inchangés — un bouton « Effacer » sur une date obligatoire
   * inviterait à créer un état interdit.
   */
  clearable?: boolean;
  /**
   * Affiche « 01/09/2026 » au lieu de « 1 sept. 2026 ». Opt-in : le format long reste
   * le defaut partout ailleurs. Utile la ou la largeur est comptee — une ligne de
   * calendrier editorial en aligne neuf cote a cote.
   */
  compact?: boolean;
}

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, placeholder = 'Choisir une date', className = '', size = 'md', minDate, clearable = false, compact = false }) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('jours');
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

  const anneeVue = viewMonth.getFullYear();
  const moisVu = viewMonth.getMonth();
  const pageAnnees = debutPageAnnees(anneeVue);
  const annees = Array.from({ length: ANNEES_PAR_PAGE }, (_, i) => pageAnnees + i);

  // `minDate` doit rester respecté à tous les niveaux : sans ça on offrirait un
  // chemin vers une date interdite. Un mois est désactivé si son DERNIER jour est
  // déjà trop tôt (et non son premier), une année si son 31 décembre l'est.
  const moisDesactive = (annee: number, mois: number) =>
    !!minDate && toISO(new Date(annee, mois + 1, 0)) < minDate;
  const anneeDesactivee = (annee: number) =>
    !!minDate && toISO(new Date(annee, 11, 31)) < minDate;

  // Ouvrir le panneau remet toujours le mode « jours » : l'usage courant est de
  // choisir une date proche, il ne doit pas être ralenti par le nouveau chemin.
  const basculer = () => {
    setOpen(o => {
      if (!o) setMode('jours');
      return !o;
    });
  };

  // Les flèches suivent le mode affiché : un mois, un an, ou une page d'années.
  const reculer = () => {
    if (mode === 'jours') setViewMonth(m => addMonths(m, -1));
    else if (mode === 'mois') setViewMonth(new Date(anneeVue - 1, moisVu, 1));
    else setViewMonth(new Date(anneeVue - ANNEES_PAR_PAGE, moisVu, 1));
  };
  const avancer = () => {
    if (mode === 'jours') setViewMonth(m => addMonths(m, 1));
    else if (mode === 'mois') setViewMonth(new Date(anneeVue + 1, moisVu, 1));
    else setViewMonth(new Date(anneeVue + ANNEES_PAR_PAGE, moisVu, 1));
  };

  const libelleEntete =
    mode === 'jours' ? format(viewMonth, 'MMMM yyyy', { locale: fr })
    : mode === 'mois' ? String(anneeVue)
    : `${pageAnnees} – ${pageAnnees + ANNEES_PAR_PAGE - 1}`;

  // Cliquer l'en-tête descend d'un niveau de zoom : jours → années → (choix) → mois.
  // En mode « années », il n'y a rien de plus large, on redescend donc aux jours.
  const clicEntete = () => setMode(m => (m === 'jours' ? 'annees' : m === 'mois' ? 'annees' : 'jours'));

  // Style commun aux cellules mois/année : même vocabulaire visuel que les jours
  // (sélection en dégradé charte, survol discret, anneau pour le repère « courant »).
  const celluleClasses = (actif: boolean, courant: boolean, desactive: boolean) =>
    `min-h-[44px] md:min-h-[36px] rounded-2xl text-[13px] font-semibold flex items-center justify-center transition-all ${
      desactive
        ? 'text-bony-muted/25 cursor-not-allowed line-through decoration-1'
        : actif
          ? 'gx-gradient text-white shadow-glow'
          : 'text-bony-text hover:bg-[var(--text-main)]/[0.08]'
    } ${courant && !actif && !desactive ? 'ring-1 ring-bony-orange/50' : ''}`;

  const triggerPad = size === 'sm' ? 'py-1.5 pl-9 pr-3 text-xs' : 'py-3 pl-11 pr-4 text-sm';
  const iconLeft = size === 'sm' ? 'left-2.5' : 'left-3.5';
  const iconSize = size === 'sm' ? 14 : 17;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={basculer}
        className={`relative w-full text-left bg-[var(--bg-input)] border rounded-2xl text-bony-text outline-none transition-all ${triggerPad} ${open ? 'border-bony-orange/60' : 'border-bony-border hover:border-bony-orange/40'} ${className}`}
      >
        <Calendar size={iconSize} className={`absolute ${iconLeft} top-1/2 -translate-y-1/2 ${open ? 'text-bony-orange' : 'text-bony-muted'} transition-colors`} />
        {selected
          ? <span className="block truncate">{format(selected, compact ? 'dd/MM/yyyy' : 'd MMM yyyy', { locale: fr })}</span>
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
                <button type="button" onClick={reculer} aria-label="Précédent" className="p-1.5 rounded-full hover:bg-[var(--text-main)]/[0.08] text-bony-muted hover:text-bony-text transition-colors">
                  <ChevronLeft size={18} />
                </button>
                {/* L'en-tête est un BOUTON : c'est lui qui ouvre le choix de l'année.
                    Le chevron indique qu'il est actionnable — sans repère visuel,
                    personne ne devine qu'un titre est cliquable. */}
                <button
                  type="button"
                  onClick={clicEntete}
                  aria-label="Changer d'année"
                  className="flex items-center gap-1 px-2 py-1 rounded-xl text-sm font-bold text-bony-text capitalize hover:bg-[var(--text-main)]/[0.08] transition-colors"
                >
                  {libelleEntete}
                  <ChevronDown size={14} className={`text-bony-muted transition-transform ${mode === 'jours' ? '' : 'rotate-180'}`} />
                </button>
                <button type="button" onClick={avancer} aria-label="Suivant" className="p-1.5 rounded-full hover:bg-[var(--text-main)]/[0.08] text-bony-muted hover:text-bony-text transition-colors">
                  <ChevronRight size={18} />
                </button>
              </div>

              {mode === 'annees' && (
                <div className="grid grid-cols-4 gap-1">
                  {annees.map(a => (
                    <button
                      key={a}
                      type="button"
                      disabled={anneeDesactivee(a)}
                      onClick={() => { setViewMonth(new Date(a, moisVu, 1)); setMode('mois'); }}
                      className={celluleClasses(!!selected && selected.getFullYear() === a, a === today.getFullYear(), anneeDesactivee(a))}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              )}

              {mode === 'mois' && (
                <div className="grid grid-cols-3 gap-1">
                  {MOIS_COURTS.map((nom, i) => (
                    <button
                      key={nom}
                      type="button"
                      disabled={moisDesactive(anneeVue, i)}
                      onClick={() => { setViewMonth(new Date(anneeVue, i, 1)); setMode('jours'); }}
                      className={celluleClasses(
                        !!selected && selected.getFullYear() === anneeVue && selected.getMonth() === i,
                        anneeVue === today.getFullYear() && i === today.getMonth(),
                        moisDesactive(anneeVue, i)
                      )}
                    >
                      {nom}
                    </button>
                  ))}
                </div>
              )}

              {mode === 'jours' && (<>
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
              </>)}

              {/* Pied de panneau : « Aujourd'hui », et « Effacer » quand le champ est
                  effaçable ET rempli. Le bouton d'effacement est ICI et non dans le
                  déclencheur : celui-ci est un <button>, un bouton imbriqué dans un
                  bouton est du HTML invalide, et le restructurer casserait le
                  `triggerRef` dont FloatingPanel se sert pour se positionner. */}
              <div className="flex items-center gap-2 mt-3 shrink-0">
                <button
                  type="button"
                  disabled={todayDisabled}
                  onClick={() => handlePick(new Date())}
                  className={`flex-1 py-2 rounded-full text-xs font-bold transition-colors ${todayDisabled ? 'text-bony-muted/30 cursor-not-allowed' : 'text-bony-orange hover:bg-bony-orange/[0.08]'}`}
                >
                  Aujourd'hui
                </button>
                {clearable && !!value && (
                  <button
                    type="button"
                    onClick={() => { onChange(''); setOpen(false); }}
                    className="flex-1 py-2 rounded-full text-xs font-bold text-bony-muted hover:text-red-500 hover:bg-red-500/[0.08] transition-colors"
                  >
                    Effacer
                  </button>
                )}
              </div>
      </FloatingPanel>
    </>
  );
};

export default DatePicker;
