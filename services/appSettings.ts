import { useEffect, useState } from 'react';
import { db } from './dataService';

// =====================================================================
// RÉGLAGES D'APPLICATION — interrupteurs de fonctionnalité pilotés en ligne.
//
// Même motif que presenceStore / chatStore : un petit pub/sub sans dépendance
// (le dépôt n'a pas de bibliothèque d'état).
//
// ⚠️ Le serveur est l'AUTORITÉ. Ce store ne sert qu'à savoir quoi AFFICHER :
// éteindre la rubrique Jeux ici ne ferme rien, c'est `/api/games` qui refuse.
// Ne jamais s'appuyer sur cette valeur pour une décision de sécurité.
//
// ⚠️ Défaut PRUDENT à `false` : tant que la lecture n'a pas abouti (démarrage,
// serveur injoignable), la rubrique reste masquée. Elle apparaît une fois la
// réponse reçue, jamais l'inverse — on ne veut pas la voir clignoter à l'écran
// de quelqu'un pour qui elle devrait être éteinte.
// =====================================================================

export interface AppSettings {
  gamesEnabled: boolean;
}

type Listener = () => void;

let state: AppSettings = { gamesEnabled: false };
const listeners = new Set<Listener>();
const notify = () => listeners.forEach(l => l());

export const appSettingsStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  get(): AppSettings {
    return state;
  },
  set(next: Partial<AppSettings>) {
    state = { ...state, ...next };
    notify();
  },
  /** Recharge depuis le serveur. Échec silencieux : on garde le défaut prudent. */
  async refresh(): Promise<void> {
    try {
      const s = await db.getAppSettings();
      appSettingsStore.set({ gamesEnabled: !!s?.gamesEnabled });
    } catch {
      /* défaut conservé */
    }
  },
};

/** Réglages courants, re-rendus à chaque changement (y compris temps réel). */
export const useAppSettings = (): AppSettings => {
  const [snapshot, setSnapshot] = useState<AppSettings>(() => appSettingsStore.get());
  useEffect(() => appSettingsStore.subscribe(() => setSnapshot(appSettingsStore.get())), []);
  return snapshot;
};
