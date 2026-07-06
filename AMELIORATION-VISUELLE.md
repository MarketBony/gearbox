# Amélioration visuelle — glass plus présent + composants de saisie chartés

Deux chantiers :
- A) Intensifier l'effet liquid glass (aujourd'hui trop discret).
- B) Remplacer les `<select>` et `<input type="date">` natifs (rendu "Windows 98", non chartables)
  par deux composants custom chartés : DatePicker (fourni ci-dessous) et Select (à créer).

Contraintes permanentes : charte Bony intacte (couleurs, polices, bony-gradient), ne pas toucher
à pages/Login.tsx, lisibilité préservée en dark ET light, responsive mobile/tablette.

---

## A — INTENSIFIER LE LIQUID GLASS

Le rendu actuel fait "panneau semi-transparent" plutôt que "verre liquide". Trois causes, trois leviers :

1. **Le fond manque de matière** (cause principale). Un verre ne "se voit" que s'il y a quelque chose
   de riche à réfracter derrière. Les washes actuels (opacité ~0.06–0.10) sont trop faibles.
   → Renforcer le fond spatial : des halos de couleur charte (orange #f75632 et violet #8f12ab)
   nettement plus présents et plus larges, positionnés en coins/diagonale, éventuellement 2-3 "blobs"
   flous supplémentaires. Dérive lente optionnelle (animation très douce, respect de prefers-reduced-motion).
   Le fond reste sobre mais doit donner de la profondeur au verre.

2. **Surfaces trop opaques.** `--glass-bg` clair à 0.60 est presque plein.
   → Baisser la translucidité des surfaces verre (viser ~0.40–0.50 en clair, ~0.45–0.55 en sombre),
   augmenter le flou (`--glass-blur` vers 28–36px) et la saturation, pour un vrai effet de dépoli.

3. **Manque de profondeur.** Le verre plat n'a pas de relief.
   → Renforcer : bordure lumineuse (highlight interne haut, ex. inset 0 1px rgba(255,255,255,.6)),
   reflet `.glass-sheen` plus marqué, ombre portée plus profonde et diffuse. Objectif : impression
   de plaque de verre posée au-dessus, pas d'un simple calque gris.

**Étendre l'usage** du verre aux surfaces flottantes encore opaques : barres/headers sticky en haut de page,
toolbars, panneaux latéraux. Le verre reste un accent sur les surfaces qui "flottent".

**Garde-fous (ne pas franchir) :**
- Ne PAS tout rendre transparent. Le contenu dense en texte (tables, formulaires, longues listes) reste
  sur surface lisible (glass-strong ou gx-card opaque). Le texte doit rester parfaitement lisible partout.
- Attention perf : `backdrop-filter` élevé sur de grandes surfaces pendant le scroll peut saccader sur
  des postes modestes. Réserver le fort blur aux surfaces flottantes de taille modérée, pas aux grands
  conteneurs plein écran.
- Charte : les seules couleurs d'accent restent orange/violet/bleu Bony. Pas de nouvelle teinte.

---

## B1 — DatePicker custom (à créer tel quel dans components/DatePicker.tsx)

Portable sans modification : toutes ses classes et variables existent déjà dans ce projet.
API : `value` (string 'YYYY-MM-DD'), `onChange(v)`, `placeholder?`, `className?`, `size?: 'sm'|'md'`.
Le format ISO local (toISO/fromISO) évite le décalage J+1, cohérent avec parseLocalDate.

```tsx
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
          ? <span>{format(selected, 'd MMM yyyy', { locale: fr })}</span>
          : <span className="text-bony-muted">{placeholder}</span>}
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
              className="z-[10000] glass-strong border border-bony-border rounded-3xl shadow-glass-lg p-4"
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
```

---

## B2 — Select custom (à créer, components/Select.tsx)

N'existe pas encore. À écrire en **cohérence stricte avec le DatePicker ci-dessus** (même logique de
portal + positionnement + fermeture au clic extérieur/scroll, même animation framer-motion, même style
charte). Comportement attendu :

- Trigger : bouton pleine largeur, même look que le trigger du DatePicker (bg `--bg-input`, `rounded-2xl`,
  bordure `bony-border`, bordure `bony-orange/60` à l'ouverture), avec chevron à droite qui pivote à l'ouverture.
  Affiche le label de l'option sélectionnée, ou un placeholder en `bony-muted`.
- Panneau d'options via `createPortal` sur `document.body`, positionné sous le trigger (bascule au-dessus si
  pas de place), classes `glass-strong border border-bony-border rounded-2xl shadow-glass-lg`, scrollable
  (`custom-scrollbar`, max-height ~ 280px), animation d'entrée identique au DatePicker.
- Options : chaque option en ligne cliquable, hover `bg-[var(--text-main)]/[0.08]`, option active mise en
  avant (texte `bony-orange` ou petite pastille `gx-gradient`). Fermeture après sélection.
- Si la liste est longue (ex. liste des sites), inclure un champ de recherche en haut du panneau qui filtre
  les options.
- API : `value`, `onChange(v)`, `options: {value, label}[]`, `placeholder?`, `className?`, `size?: 'sm'|'md'`,
  et gérer le cas d'un select multiple existant si présent (valeurs multiples rendues en chips dans le trigger).
- Accessibilité minimale : navigation clavier (flèches + Entrée + Échap) si faisable sans surcoût.

---

## Ordre d'exécution recommandé

1. Étape 1 : intensifier le glass + créer DatePicker et Select, et les câbler sur UNE page témoin
   (ex. Projets) pour valider le rendu.
2. Étape 2 : une fois validés, propager le remplacement natif → custom sur toutes les pages.
