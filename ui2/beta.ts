import { useSyncExternalStore } from 'react';

// Interrupteur « Nouvelle interface (bêta) » — chantier Gearbox OS (interface v2).
// Préférence PAR COMPTE et par navigateur (localStorage) : la clé porte l'id du compte,
// pour qu'un poste partagé ne fasse pas passer la bêta d'un compte à l'autre.
// ⚠️ Jusqu'au lot 1 (coque réelle), l'interrupteur n'est proposé qu'au Master : un
// correctif déployé entre-temps embarquerait sinon une coque vide pour tout le monde.
// Au lot 1 : ouvrir à tous les rôles (décision du plan de déploiement v2).
export const UI2_BETA_ROLES = ['Master'];

const KEY = (userId: string) => `gearbox_ui2_beta:${userId}`;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function read(userId: string | undefined): boolean {
  if (!userId) return false;
  try { return localStorage.getItem(KEY(userId)) === '1'; } catch { return false; }
}

// Filet de secours : `?ui=classic` force l'ancienne interface, quelle que soit la préférence.
let forcedClassic = (() => {
  try { return new URLSearchParams(window.location.search).get('ui') === 'classic'; } catch { return false; }
})();

export function canUseUi2(role: string | undefined): boolean {
  return !!role && UI2_BETA_ROLES.includes(role);
}

export function setUi2Beta(userId: string, on: boolean): void {
  // Activer la bêta lève le filet `?ui=classic` : sinon l'interrupteur s'allumait et
  // rien ne se passait (constaté en recette le 29/09/2026).
  if (on && forcedClassic) {
    forcedClassic = false;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('ui');
      window.history.replaceState(window.history.state, '', url);
    } catch { /* adresse non modifiable : la bêta s'active quand même */ }
  }
  try {
    if (on) localStorage.setItem(KEY(userId), '1');
    else localStorage.removeItem(KEY(userId));
  } catch { /* stockage indisponible : la préférence ne tient pas, l'ancienne interface reste */ }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Un autre onglet du même compte qui bascule : on suit.
  const onStorage = (e: StorageEvent) => { if (e.key?.startsWith('gearbox_ui2_beta:')) cb(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
}

/** Préférence EFFECTIVE (ce que l'interrupteur affiche) : éteinte tant que `?ui=classic`
 *  force l'ancienne interface — sinon l'interrupteur s'affichait allumé sans effet. */
export function useUi2BetaPref(userId: string | undefined): boolean {
  return useSyncExternalStore(subscribe, () => !forcedClassic && read(userId));
}


/** La nouvelle interface doit-elle être montée ? */
export function useUi2Active(user: { id: string; role: string } | null): boolean {
  const pref = useUi2BetaPref(user?.id);
  return pref && canUseUi2(user?.role);
}
