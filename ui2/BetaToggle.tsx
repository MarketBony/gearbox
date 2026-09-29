import React from 'react';
import { canUseUi2, setUi2Beta, useUi2BetaPref } from './beta';

// Interrupteur « Nouvelle interface (bêta) » des Paramètres (ancienne interface).
// Même gabarit que GamesToggle. Rien n'est écrit en base : préférence locale au compte.
const BetaToggle: React.FC<{ userId: string; role: string }> = ({ userId, role }) => {
  const on = useUi2BetaPref(userId);
  if (!canUseUi2(role)) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-slate-500 dark:text-bony-muted">
          Nouvelle interface (bêta)
          <span className="ml-1.5 text-slate-400 dark:text-slate-600">
            · Gearbox OS, en construction — l'ancienne interface reste accessible à tout moment
          </span>
        </p>
      </div>
      <button
        onClick={() => setUi2Beta(userId, !on)}
        role="switch"
        aria-checked={on}
        aria-label="Activer la nouvelle interface (bêta)"
        title={on ? 'Revenir à l’ancienne interface' : 'Essayer la nouvelle interface'}
        className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${
          on ? 'bg-bony-orange' : 'bg-slate-300 dark:bg-white/15'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};

export default BetaToggle;
