import React from 'react';
import Avatar from './Avatar';
import type { PresenceUser } from '../services/presenceStore';

// =====================================================================
// BULLES DE PRÉSENCE — avatars des utilisateurs présents sur une rubrique
//
// Affiche au maximum `max` avatars superposés, puis une pastille "+N".
// Utilisé dans les trois rendus de nav de la Sidebar (desktop groupé, tablette
// icônes seules, barre mobile) avec des tailles différentes.
//
// Rappel technique projet : Tailwind est chargé en CDN Play, donc PAS de
// variantes responsive (md:/lg:) sur les classes custom. Ici on n'utilise que
// des utilitaires standards et des styles inline pour les tailles, et c'est la
// Sidebar qui choisit la variante via ses propres conteneurs md:/lg: déjà
// présents — jamais une classe custom conditionnée par un breakpoint.
// =====================================================================

interface PresenceBubblesProps {
  users: PresenceUser[];
  size?: number;
  max?: number;
  /** Bordure autour des avatars, pour les détacher du fond de la rubrique active. */
  ring?: boolean;
}

const PresenceBubbles: React.FC<PresenceBubblesProps> = ({
  users,
  size = 16,
  max = 2,
  ring = true
}) => {
  if (!users || users.length === 0) return null;

  const shown = users.slice(0, max);
  const overflow = users.length - shown.length;

  // Titre natif : au survol on lit qui est là, y compris les débordements.
  const title = users.map(u => u.name).join(', ');

  return (
    <div
      className="flex items-center shrink-0 pointer-events-none"
      title={title}
      aria-label={`Présents : ${title}`}
    >
      {shown.map((u, i) => (
        <div
          key={u.userId}
          className={ring ? 'rounded-full ring-2 ring-white dark:ring-bony-dark' : ''}
          // Superposition légère : chaque avatar mord sur le précédent.
          style={{ marginLeft: i === 0 ? 0 : -Math.round(size * 0.3), zIndex: shown.length - i }}
        >
          <Avatar userId={u.userId} name={u.name} color={u.color} size={size} />
        </div>
      ))}

      {overflow > 0 && (
        <span
          className="rounded-full bg-slate-600 dark:bg-slate-500 text-white font-bold flex items-center justify-center px-1 leading-none"
          style={{
            height: size,
            minWidth: size,
            fontSize: Math.max(Math.round(size * 0.42), 8),
            marginLeft: -Math.round(size * 0.2),
            zIndex: 0
          }}
        >
          +{overflow > 9 ? '9' : overflow}
        </span>
      )}
    </div>
  );
};

export default PresenceBubbles;
