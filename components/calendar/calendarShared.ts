import { ServiceType } from '../../types';

// =============================================================================
// SOURCE UNIQUE DE VÉRITÉ — utilitaires calendrier partagés (Agenda + Matériel)
// Le rendu (grille + événements) vit dans CalendarGrid.tsx / EventBar.tsx.
// Ces deux modules affichent des barres multi-jours (startDate → endDate)
// packées en "lanes" ; c'est ici que vit la logique de placement commune.
// =============================================================================

// --- DATE UTILS ---

/** Ramène une date à 00:00:00 local pour éviter les décalages horaires/UTC. */
export const normalizeDate = (d: Date | string): Date => {
    const date = new Date(d);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

/** Lundi de la semaine contenant `date`. */
export const getStartOfWeek = (date: Date): Date => {
    const d = normalizeDate(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // dimanche (0) -> lundi
    return new Date(d.setDate(diff));
};

export const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

export const getMonthDays = (year: number, month: number): Date[] => {
    const date = new Date(year, month, 1);
    const days: Date[] = [];
    while (date.getMonth() === month) {
        days.push(new Date(date));
        date.setDate(date.getDate() + 1);
    }
    return days;
};

export const isSameDay = (d1: Date, d2: Date): boolean =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

// --- LAYOUT ENGINE (calcule les lanes pour éviter les chevauchements) ---

/** Contrat minimal qu'un item doit respecter pour être placé dans la grille. */
export interface CalendarSpan {
    id: string;
    startDate: string | Date;
    endDate: string | Date;
}

export interface PlacedItem<T extends CalendarSpan> {
    item: T;
    startCol: number; // 0-6 (colonne de début dans la semaine)
    span: number;     // nombre de colonnes occupées (>= 1)
    lane: number;     // ligne verticale d'empilement (0 = première)
}

/**
 * Place les items sur la grille [gridStart, gridEnd] (7 colonnes) en assignant
 * une "lane" à chaque item pour qu'aucun ne se chevauche visuellement.
 */
export const calculateLayout = <T extends CalendarSpan>(
    items: T[],
    startDate: Date,
    endDate: Date,
): PlacedItem<T>[] => {
    const gridStart = normalizeDate(startDate);
    const gridEnd = normalizeDate(endDate);
    const msPerDay = 1000 * 60 * 60 * 24;

    const placed = items.map((item): PlacedItem<T> | null => {
        const iStart = normalizeDate(item.startDate);
        const iEnd = normalizeDate(item.endDate);

        // Pas d'intersection avec la fenêtre visible
        if (iEnd < gridStart || iStart > gridEnd) return null;

        const effectiveStart = iStart < gridStart ? gridStart : iStart;
        const effectiveEnd = iEnd > gridEnd ? gridEnd : iEnd;

        // Math.round : robuste aux jours de 23h/25h (changement d'heure)
        const startCol = Math.round((effectiveStart.getTime() - gridStart.getTime()) / msPerDay);
        const span = Math.max(1, Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / msPerDay) + 1);

        return { item, startCol, span, lane: -1 };
    }).filter(Boolean) as PlacedItem<T>[];

    // Tri : par colonne de départ, puis durée décroissante (les plus longues d'abord)
    placed.sort((a, b) => {
        if (a.startCol !== b.startCol) return a.startCol - b.startCol;
        return b.span - a.span;
    });

    // Assignation des lanes : stocke la dernière colonne occupée par lane
    const lanes: number[] = [];
    placed.forEach(p => {
        let assigned = false;
        for (let i = 0; i < lanes.length; i++) {
            if (lanes[i] < p.startCol) {
                p.lane = i;
                lanes[i] = p.startCol + p.span - 1;
                assigned = true;
                break;
            }
        }
        if (!assigned) {
            p.lane = lanes.length;
            lanes.push(p.startCol + p.span - 1);
        }
    });

    return placed;
};

// --- COULEURS D'ACCENT PAR SERVICE (source unique, cohérente avec Digital) ---
// Digital identifie les événements par une barre d'accent colorée à gauche +
// texte contrasté. On applique la même grammaire visuelle ici : classe `bg-*`
// utilisée pour la barre d'accent des EventBar.
export const SERVICE_ACCENT: Record<ServiceType, string> = {
    VN: 'bg-bony-blue',
    VO: 'bg-bony-orange',
    APV: 'bg-bony-violet',
    PR: 'bg-cyan-500',
    'Tous Services': 'bg-slate-400',
};

/** Retourne la classe `bg-*` d'accent pour un (ou plusieurs) service(s). */
export const serviceAccent = (service: ServiceType | ServiceType[] | undefined): string => {
    if (!service) return SERVICE_ACCENT['Tous Services'];
    const main = Array.isArray(service) ? service[0] : service;
    return SERVICE_ACCENT[main] || SERVICE_ACCENT['Tous Services'];
};

// --- HAUTEURS DE LANE (partagées pour un rendu identique) ---
export const LANE_HEIGHT_MONTH = 24; // barre 22px + 2px de respiration
export const LANE_HEIGHT_WEEK = 46;  // plus haut : affiche la barre de progression
