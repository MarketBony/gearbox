import React, { useState } from 'react';
import { db } from '../services/dataService';
import { appSettingsStore, useAppSettings } from '../services/appSettings';

// =============================================================================
// INTERRUPTEUR DE LA RUBRIQUE JEUX — réservé au Master.
//
// Volontairement DISCRET : une ligne en pied de section, texte atténué, pas de
// titre ni d'encadré. Gearbox sert dans un cadre professionnel ; la rubrique est
// éteinte par défaut et ce réglage n'a pas à s'imposer visuellement.
//
// ⚠️ Ce composant ne fait que PILOTER. Le refus réel est côté serveur :
// `PUT /api/settings/games` n'accepte que le Master, et `/api/games` refuse tout
// quand c'est éteint. Masquer ce bouton ne fermerait rien.
// =============================================================================

const GamesToggle: React.FC = () => {
  const { gamesEnabled } = useAppSettings();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const basculer = async () => {
    if (envoi) return;
    setEnvoi(true);
    setErreur('');
    try {
      const r = await db.setGamesEnabled(!gamesEnabled);
      // L'auteur est exclu de la diffusion temps réel : on met son état à jour ici.
      appSettingsStore.set({ gamesEnabled: !!r?.gamesEnabled });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de la modification.');
    }
    setEnvoi(false);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-slate-500 dark:text-bony-muted">
          Espace détente
          <span className="ml-1.5 text-slate-400 dark:text-slate-600">
            {gamesEnabled ? '· visible de l’équipe' : '· masqué pour tous'}
          </span>
        </p>
        {erreur && <p className="text-[10px] text-red-500 font-bold mt-0.5">{erreur}</p>}
      </div>
      <button
        onClick={basculer}
        disabled={envoi}
        role="switch"
        aria-checked={gamesEnabled}
        aria-label="Afficher la rubrique Jeux"
        title={gamesEnabled ? 'Masquer la rubrique Jeux' : 'Afficher la rubrique Jeux'}
        className={`relative shrink-0 w-9 h-5 rounded-full transition-colors disabled:opacity-50 ${
          gamesEnabled ? 'bg-bony-orange' : 'bg-slate-300 dark:bg-white/15'
        }`}
      >
        {/* ⚠️ `left-0.5` est indispensable : sans propriété de position, un élément
            `absolute` part de sa position DANS LE FLUX et non du bord du parent —
            le curseur débordait alors à droite. Piste : 36 px de large, pastille de
            16 px, donc 2 px de marge à gauche et 2 + 16 = 18 px une fois poussée. */}
        <span
          className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            gamesEnabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};

export default GamesToggle;
