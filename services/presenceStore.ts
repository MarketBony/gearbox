import { useEffect, useState } from 'react';

// =====================================================================
// PRÉSENCE — qui est sur quelle rubrique (store partagé)
//
// Même pattern que chatStore : petit pub/sub sans dépendance (le repo n'a pas
// de lib d'état). Alimenté par services/socket.ts sur 'presence:state', lu par
// components/Sidebar.tsx pour afficher les avatars sur chaque rubrique.
//
// Le serveur est l'autorité et diffuse un instantané complet : ce store ne fait
// que le mémoriser, il ne calcule aucun diff.
// =====================================================================

export interface PresenceUser {
  userId: string;
  name: string;
  color: string;
  avatarUrl: string | null;
}

// rubrique (id d'onglet) -> utilisateurs présents
export type PresenceState = Record<string, PresenceUser[]>;

type Listener = () => void;

let state: PresenceState = {};
const listeners = new Set<Listener>();

const notify = () => listeners.forEach(l => l());

export const presenceStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  get(): PresenceState {
    return state;
  },
  set(next: PresenceState) {
    state = next || {};
    notify();
  },
  clear() {
    state = {};
    notify();
  }
};

/**
 * Présence courante, hors soi-même : on sait déjà où on est, et sur mobile
 * chaque avatar économisé est de la place gagnée.
 *
 * Renvoie une nouvelle référence à chaque instantané reçu — les composants qui
 * l'utilisent se re-rendent, ce qui est exactement l'effet voulu.
 */
export const usePresence = (selfUserId?: string): PresenceState => {
  const [snapshot, setSnapshot] = useState<PresenceState>(() => presenceStore.get());

  useEffect(() => {
    const sync = () => setSnapshot(presenceStore.get());
    const unsub = presenceStore.subscribe(sync);
    sync(); // le store peut déjà être peuplé par le socket avant ce montage
    return unsub;
  }, []);

  if (!selfUserId) return snapshot;

  const filtered: PresenceState = {};
  // Annotation explicite : Object.entries élargit la valeur à `unknown` avec la
  // config TS du projet.
  for (const [section, users] of Object.entries(snapshot) as [string, PresenceUser[]][]) {
    const others = users.filter(u => u.userId !== selfUserId);
    if (others.length > 0) filtered[section] = others;
  }
  return filtered;
};
