import React, { useState } from 'react';

// =============================================================================
// EventBar — coquille visuelle PARTAGÉE d'un événement de calendrier.
// Calée sur le style Planning Digital : coins arrondis, fond verre, texte
// contrasté, barre d'accent colorée à gauche, tooltip au survol.
// Consommée par Agenda (projets) et Matériel (réservations).
// La logique métier (contenu, tooltip, action au clic) est fournie par
// l'appelant via props — EventBar ne décide de rien côté données.
// =============================================================================

interface EventBarProps {
    /** Classe `bg-*` de la barre d'accent gauche (ex. 'bg-bony-blue'). */
    accentClass: string;
    /** Contenu de l'événement (nom, badges, barre de progression…). */
    children: React.ReactNode;
    /** Tooltip riche affiché au survol (optionnel). */
    tooltip?: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    /** L'événement déborde à gauche de la semaine (barre coupée à gauche). */
    clipLeft?: boolean;
    /** L'événement déborde à droite de la semaine (barre coupée à droite). */
    clipRight?: boolean;
    className?: string;
}

const EventBar: React.FC<EventBarProps> = ({
    accentClass,
    children,
    tooltip,
    onClick,
    clipLeft = false,
    clipRight = false,
    className = '',
}) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="relative h-full"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div
                onClick={onClick}
                className={`
                    relative h-full w-full flex flex-col justify-center overflow-hidden
                    pl-3 pr-2 select-none cursor-pointer transition
                    rounded-md border border-slate-200 dark:border-white/10
                    bg-white/90 dark:bg-black/40 shadow-sm
                    text-slate-800 dark:text-slate-100
                    hover:border-bony-violet hover:shadow-lg hover:z-50 hover:brightness-[1.03]
                    ${clipLeft ? 'rounded-l-none' : ''}
                    ${clipRight ? 'rounded-r-none' : ''}
                    ${className}
                `}
            >
                {/* Barre d'accent colorée à gauche (identifie le service) */}
                <span
                    className={`absolute left-0 top-0 bottom-0 w-1 ${clipLeft ? '' : 'rounded-l-md'} ${accentClass}`}
                    aria-hidden
                />
                {children}
            </div>

            {tooltip && isHovered && (
                <div
                    className="absolute z-[100] w-64 glass-menu rounded-xl p-3 animate-in fade-in duration-200 pointer-events-none"
                    style={{ top: '100%', left: 0, marginTop: 4 }}
                >
                    {tooltip}
                </div>
            )}
        </div>
    );
};

export default EventBar;
