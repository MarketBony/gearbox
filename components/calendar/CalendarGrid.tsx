import React from 'react';
import {
    CalendarSpan,
    PlacedItem,
    calculateLayout,
    normalizeDate,
    getStartOfWeek,
    addDays,
    getMonthDays,
    isSameDay,
    LANE_HEIGHT_MONTH,
    LANE_HEIGHT_WEEK,
} from './calendarShared';

// =============================================================================
// CalendarGrid — grille de calendrier PARTAGÉE (mois + semaine), style Gantt.
// SOURCE UNIQUE DE VÉRITÉ du rendu visuel + de la mise en page pour Agenda et
// Matériel. Style calé sur Planning Digital : cellules-jour arrondies et
// espacées (verre), accent orange sur le jour courant, et surtout une hauteur
// de ligne QUI S'ÉTIRE au contenu (aucun débordement, quel que soit le nombre
// d'événements empilés).
//
// L'appelant fournit :
//   - items       : ses données (doivent exposer id/startDate/endDate)
//   - renderEvent : le contenu d'un événement (nom, badges, tooltip, onClick…)
//   - onDayClick  : action au clic sur une cellule vide (optionnel)
// La logique métier reste donc chez l'appelant ; seule la grille est mutualisée.
// =============================================================================

const WEEKDAY_LABELS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

export interface EventRenderMeta {
    view: 'week' | 'month';
    clipLeft: boolean;  // l'événement commence avant la semaine visible
    clipRight: boolean; // l'événement finit après la semaine visible
}

interface CalendarGridProps<T extends CalendarSpan> {
    view: 'week' | 'month';
    currentDate: Date;
    items: T[];
    renderEvent: (item: T, meta: EventRenderMeta) => React.ReactNode;
    /** Clic sur une cellule-jour vide (ex. créer une réservation). */
    onDayClick?: (date: Date) => void;
    /** Ref optionnelle sur le conteneur scrollable (restauration de scroll). */
    scrollRef?: React.RefObject<HTMLDivElement>;
}

// Classe commune d'une cellule-jour (fond verre teinté + accent jour courant),
// alignée sur le rendu Planning Digital.
const dayCellClass = (opts: { isToday: boolean; isCurrentMonth: boolean; clickable: boolean }) => {
    const { isToday, isCurrentMonth, clickable } = opts;
    return [
        'rounded-lg border transition-colors',
        isCurrentMonth ? 'bg-white/45 dark:bg-white/[0.04]' : 'bg-slate-100/40 dark:bg-white/[0.02]',
        isToday
            ? 'border-bony-orange/60 ring-1 ring-bony-orange/25 bg-bony-orange/[0.06] dark:bg-bony-orange/[0.12]'
            : 'border-bony-border',
        clickable ? 'cursor-pointer hover:border-slate-400 dark:hover:border-white/20 hover:bg-black/[0.03] dark:hover:bg-white/[0.06]' : '',
    ].join(' ');
};

function CalendarGrid<T extends CalendarSpan>({ view, currentDate, items, renderEvent, onDayClick, scrollRef }: CalendarGridProps<T>) {

    // Positionne un événement placé dans la couche d'overlay.
    // FIX débordement : chaque événement force `gridRow: 1` pour que TOUS les
    // items partagent la même ligne de grille et que l'empilement vertical
    // dépende UNIQUEMENT de `marginTop` (= lane × hauteur). Sans cela, l'auto-
    // placement CSS repoussait les items chevauchants sur de nouvelles lignes,
    // ajoutant un décalage vertical imprévu -> les événements débordaient de la
    // hauteur calculée. Ici la hauteur de ligne colle exactement au contenu.
    const renderPlacedEvent = (
        placed: PlacedItem<T>,
        weekStart: Date,
        weekEnd: Date,
        laneHeight: number,
        barHeight: number,
        keySuffix: string,
    ) => {
        const clipLeft = placed.startCol === 0 && normalizeDate(placed.item.startDate) < normalizeDate(weekStart);
        const clipRight = (placed.startCol + placed.span) === 7 && normalizeDate(placed.item.endDate) > normalizeDate(weekEnd);

        return (
            <div
                key={placed.item.id + keySuffix}
                className="pointer-events-auto"
                style={{
                    gridColumnStart: placed.startCol + 1,
                    gridColumnEnd: `span ${placed.span}`,
                    gridRow: 1,
                    marginTop: `${placed.lane * laneHeight}px`,
                    height: `${barHeight}px`,
                }}
            >
                {renderEvent(placed.item, { view, clipLeft, clipRight })}
            </div>
        );
    };

    // ------------------------------------------------------------------ MOIS
    const renderMonth = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        const firstDay = normalizeDate(new Date(year, month, 1));
        const startDayIndex = (firstDay.getDay() + 6) % 7; // lundi = 0
        const daysInMonth = getMonthDays(year, month);

        const cells: { date: Date; isCurrentMonth: boolean }[] = [];
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = 0; i < startDayIndex; i++) {
            cells.push({ date: new Date(year, month - 1, prevMonthLastDay - startDayIndex + 1 + i), isCurrentMonth: false });
        }
        daysInMonth.forEach(d => cells.push({ date: d, isCurrentMonth: true }));
        const remaining = 7 - (cells.length % 7);
        if (remaining < 7) {
            for (let i = 1; i <= remaining; i++) cells.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
        }

        const weeks: { date: Date; isCurrentMonth: boolean }[][] = [];
        for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

        const dayNumberOffset = 24; // hauteur réservée au numéro de jour

        return (
            <div className="flex flex-col h-full bg-slate-50/40 dark:bg-black/10 border border-bony-border rounded-xl overflow-hidden">
                {/* En-tête jours */}
                <div className="grid grid-cols-7 gap-1.5 px-1.5 pt-1.5 shrink-0">
                    {WEEKDAY_LABELS.map(d => (
                        <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest py-1">
                            {d}
                        </div>
                    ))}
                </div>

                {/* Lignes semaines : chaque ligne s'étire à son contenu */}
                <div ref={scrollRef} className="flex-1 flex flex-col gap-1.5 p-1.5 overflow-y-auto custom-scrollbar">
                    {weeks.map((week, weekIdx) => {
                        const weekStart = week[0].date;
                        const weekEnd = week[6].date;
                        const placed = calculateLayout(items, weekStart, weekEnd);

                        const maxLane = placed.reduce((m, p) => Math.max(m, p.lane), -1);
                        const minHeight = 96;
                        const contentHeight = Math.max(minHeight, dayNumberOffset + (maxLane + 1) * LANE_HEIGHT_MONTH + 8);

                        return (
                            <div key={weekIdx} className="relative w-full" style={{ height: `${contentHeight}px` }}>
                                {/* Fond : cellules-jour arrondies (style Digital) */}
                                <div className="absolute inset-0 grid grid-cols-7 gap-1.5">
                                    {week.map((day, dIdx) => {
                                        const isToday = isSameDay(day.date, new Date());
                                        return (
                                            <div
                                                key={dIdx}
                                                className={dayCellClass({ isToday, isCurrentMonth: day.isCurrentMonth, clickable: !!onDayClick })}
                                                onClick={onDayClick ? () => onDayClick(day.date) : undefined}
                                            >
                                                <div className={`text-right text-[11px] font-bold px-1.5 pt-1 ${isToday ? 'text-bony-orange' : day.isCurrentMonth ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400/60'}`}>
                                                    {day.date.getDate()}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Couche événements (barres multi-jours packées en lanes) */}
                                <div
                                    className="absolute inset-0 grid grid-cols-7 gap-1.5 px-0 pointer-events-none"
                                    style={{ paddingTop: `${dayNumberOffset}px` }}
                                >
                                    {placed.map((p, idx) =>
                                        renderPlacedEvent(p, weekStart, weekEnd, LANE_HEIGHT_MONTH, 22, `-m-${weekIdx}-${idx}`),
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // --------------------------------------------------------------- SEMAINE
    const renderWeek = () => {
        const startOfWeek = getStartOfWeek(currentDate);
        const endOfWeek = addDays(startOfWeek, 6);
        const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek, i));

        const placed = calculateLayout(items, startOfWeek, endOfWeek);
        const maxLane = placed.reduce((m, p) => Math.max(m, p.lane), -1);
        const barHeight = LANE_HEIGHT_WEEK - 6;
        const totalHeight = Math.max(480, (maxLane + 1) * LANE_HEIGHT_WEEK + 16);

        return (
            <div className="flex flex-col h-full bg-slate-50/40 dark:bg-black/10 border border-bony-border rounded-xl overflow-hidden">
                {/* En-tête jours + date */}
                <div className="grid grid-cols-7 gap-1.5 px-1.5 pt-1.5 shrink-0">
                    {days.map((day, i) => {
                        const isToday = isSameDay(day, new Date());
                        return (
                            <div key={i} className="text-center py-1">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    {day.toLocaleDateString('fr-FR', { weekday: 'short' })}
                                </div>
                                <div className={`text-lg font-title font-bold ${isToday ? 'text-bony-orange' : 'text-slate-700 dark:text-white'}`}>
                                    {day.getDate()}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Zone scrollable : hauteur s'étire au nombre de lanes */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-1.5">
                    <div className="relative w-full" style={{ minHeight: `${totalHeight}px` }}>
                        {/* Fond : colonnes-jour arrondies */}
                        <div className="absolute inset-0 grid grid-cols-7 gap-1.5">
                            {days.map((day, i) => {
                                const isToday = isSameDay(day, new Date());
                                return (
                                    <div
                                        key={i}
                                        className={dayCellClass({ isToday, isCurrentMonth: true, clickable: !!onDayClick })}
                                        onClick={onDayClick ? () => onDayClick(day) : undefined}
                                    />
                                );
                            })}
                        </div>

                        {/* Couche événements */}
                        <div className="absolute inset-0 grid grid-cols-7 gap-1.5 pt-2 pointer-events-none">
                            {placed.map((p, idx) =>
                                renderPlacedEvent(p, startOfWeek, endOfWeek, LANE_HEIGHT_WEEK, barHeight, `-w-${idx}`),
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return view === 'month' ? renderMonth() : renderWeek();
}

export default CalendarGrid;
