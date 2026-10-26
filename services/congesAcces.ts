import { useSyncExternalStore } from 'react';
import { db, ApiError } from './dataService';
import { peutGererConges, peutLireConges } from '../constants';

// =====================================================================
// ACCÈS À LA RUBRIQUE CONGÉS — qui la voit dans la navigation.
//
// Même motif que `services/appSettings.ts` : un petit pub/sub sans dépendance (le dépôt
// n'a pas de bibliothèque d'état).
//
// ⚠️ Tous les comptes Gearbox ne sont pas du marketing. La rubrique n'est donc visible
// que pour les MEMBRES DU PÉRIMÈTRE et pour ceux qui le gèrent (Master/Administrator/
// Director). C'est une décision d'AFFICHAGE : le refus réel est
// `backend/src/routes/conges.ts`, qui répond 403 même sur le GET.
//
// ⚠️ Défaut PRUDENT à `false` : tant que la lecture n'a pas abouti (démarrage, serveur
// injoignable), la rubrique reste masquée. Elle apparaît une fois la réponse reçue,
// jamais l'inverse — on ne veut pas la voir clignoter chez quelqu'un qui n'y a pas droit.
// =====================================================================

interface EtatAcces {
  /** La rubrique doit-elle apparaître dans la navigation ? */
  visible: boolean;
  /** Le périmètre, réutilisé par la page pour dessiner une ligne par membre. */
  membres: string[];
  /** La lecture a-t-elle abouti au moins une fois ? Sert à ne pas conclure trop tôt. */
  charge: boolean;
}

type Listener = () => void;

let state: EtatAcces = { visible: false, membres: [], charge: false };
const listeners = new Set<Listener>();
const notify = () => listeners.forEach(l => l());

export const congesAccesStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  get(): EtatAcces {
    return state;
  },
  /**
   * Recharge depuis le serveur.
   *
   * ⚠️ Un **403** n'est pas une erreur ici : c'est la réponse normale pour un rôle sans
   * accès (chef de site, External). On le traite donc comme « pas visible », sans bruit
   * dans la console — sinon chaque chef de site verrait une erreur à chaque chargement.
   */
  async refresh(role?: string, userId?: string): Promise<void> {
    // Rôle sans la rubrique (chef de site, External) : réponse connue d'avance, on n'appelle pas le serveur (12/10/2026).
    if (!userId || !peutLireConges(role)) { state = { visible: false, membres: [], charge: true }; notify(); return; }
    // Gestionnaires (Master, Administrator, Director) : la rubrique leur est TOUJOURS ouverte — c'est eux qui gèrent le
    // périmètre. On l'affiche donc tout de suite, sans attendre la lecture : avant, un aller-retour lent, un jeton expiré
    // ou une erreur passagère la masquaient (« je suis Master et je n'ai pas accès aux Congés », Théo, 26/10/2026).
    if (peutGererConges(role) && !state.visible) { state = { ...state, visible: true }; notify(); }
    try {
      // Période volontairement vide de sens : on ne veut que le périmètre. Une fenêtre
      // d'un jour évite de tirer l'année entière juste pour savoir si l'onglet s'affiche.
      const aujourdhui = new Date().toISOString().slice(0, 10);
      const { membres } = await db.getConges(aujourdhui, aujourdhui);
      state = {
        membres,
        visible: membres.includes(userId) || peutGererConges(role),
        charge: true,
      };
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 403) {
        console.error('Congés : accès non déterminé', e);
      }
      // Un échec de lecture ne retire pas la rubrique à un gestionnaire (son droit ne dépend pas du périmètre) ; un
      // membre simple la perd jusqu'à la prochaine lecture réussie (défaut prudent, voir l'en-tête).
      state = { visible: peutGererConges(role), membres: [], charge: true };
    }
    notify();
  },
  /** Mise à jour locale après une modification du périmètre faite depuis l'écran. */
  set(membres: string[], role?: string, userId?: string) {
    state = { membres, visible: !!userId && (membres.includes(userId) || peutGererConges(role)), charge: true };
    notify();
  },
};

/**
 * ⚠️ `useSyncExternalStore`, pas `useState` + abonnement dans un `useEffect` (corrigé le 26/10/2026) : avec l'ancien motif,
 * une notification arrivée ENTRE le premier rendu et l'abonnement était perdue — le composant restait figé sur l'état du
 * premier rendu (« rubrique masquée ») jusqu'à la notification suivante. C'est ce qui retirait les Congés au Master dans
 * la v2 (Dock et `canOpen` lisent la navigation calculée par OsHost avec ce crochet).
 */
export const useCongesAcces = (): EtatAcces => useSyncExternalStore(congesAccesStore.subscribe, congesAccesStore.get);
