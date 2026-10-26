import { useSyncExternalStore } from 'react';
import { db } from './dataService';

// =====================================================================
// RÉGLAGES D'APPLICATION — interrupteurs de fonctionnalité pilotés en ligne.
//
// Même motif que presenceStore / chatStore : un petit pub/sub sans dépendance
// (le dépôt n'a pas de bibliothèque d'état).
//
// ⚠️ Le serveur est l'AUTORITÉ. Ce store ne sert qu'à savoir quoi AFFICHER :
// éteindre la rubrique Jeux ici ne ferme rien, c'est `/api/games` qui refuse ; masquer
// SPARK ne ferme rien, c'est `/api/crm` (auth/crmAccess.ts) qui refuse.
// Ne jamais s'appuyer sur ces valeurs pour une décision de sécurité.
//
// ⚠️ Défaut PRUDENT à `false` : tant que la lecture n'a pas abouti (démarrage,
// serveur injoignable), la rubrique reste masquée. Elle apparaît une fois la
// réponse reçue, jamais l'inverse — on ne veut pas la voir clignoter à l'écran
// de quelqu'un pour qui elle devrait être éteinte.
//
// SPARK (26/10/2026) : `crmAccess` est calculé PAR LE SERVEUR pour le compte connecté (interrupteur + invités + rôle
// courant). Seule entorse au défaut prudent : le dernier accès CONFIRMÉ est retenu dans ce navigateur, pour CE compte
// (`crmPour`), et sert d'amorce au démarrage. Sans elle, la coque v2 démarre avant la réponse du serveur et refuse de
// restaurer une fenêtre SPARK ouverte la veille (« Accès restreint ») — c'était immédiat avant, quand l'accès ne
// dépendait que du rôle Master. L'amorce est corrigée dès la première lecture ; elle ne donne accès à aucune donnée.
// =====================================================================

export interface AppSettings {
  gamesEnabled: boolean;
  /** Interrupteur SPARK (Réglages du Master). */
  crmEnabled: boolean;
  /** Accès SPARK du compte `crmPour`, calculé par le serveur. Lire avec `aAccesCrm`, jamais seul. */
  crmAccess: boolean;
  /** Compte pour lequel `crmAccess` a été calculé. */
  crmPour: string | null;
}

type Listener = () => void;

const CLE_AMORCE_CRM = 'gearbox_crm_acces';
const lireAmorce = (): string | null => { try { return localStorage.getItem(CLE_AMORCE_CRM); } catch { return null; } };
const ecrireAmorce = (uid: string | null) => {
  try { if (uid) localStorage.setItem(CLE_AMORCE_CRM, uid); else localStorage.removeItem(CLE_AMORCE_CRM); } catch { /* stockage indisponible */ }
};

const amorce = lireAmorce();
let state: AppSettings = { gamesEnabled: false, crmEnabled: false, crmAccess: !!amorce, crmPour: amorce };
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
  /** Recharge depuis le serveur pour le compte `userId`. Échec silencieux : on garde l'état courant. */
  async refresh(userId?: string | null): Promise<void> {
    try {
      const s = await db.getAppSettings();
      const pour = userId ?? null;
      const crmAccess = !!pour && !!s?.crmAccess;
      ecrireAmorce(crmAccess ? pour : null);
      appSettingsStore.set({ gamesEnabled: !!s?.gamesEnabled, crmEnabled: !!s?.crmEnabled, crmAccess, crmPour: pour });
    } catch {
      /* état conservé */
    }
  },
};

/** SPARK visible pour ce compte ? (`crmAccess` ne vaut que pour le compte où il a été calculé.) */
export const aAccesCrm = (s: AppSettings, userId: string | null | undefined): boolean =>
  !!userId && s.crmAccess && s.crmPour === userId;

/**
 * Réglages courants, re-rendus à chaque changement (y compris temps réel).
 * ⚠️ `useSyncExternalStore`, pas `useState` + abonnement dans un `useEffect` : une notification arrivée entre le
 * premier rendu et l'abonnement serait perdue (bug des Congés, corrigé le 26/10/2026 dans services/congesAcces.ts).
 */
export const useAppSettings = (): AppSettings => useSyncExternalStore(appSettingsStore.subscribe, appSettingsStore.get);
