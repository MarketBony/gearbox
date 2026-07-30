// =====================================================================
// INSTALLATION DE LA PWA — détection de plateforme et invite native
//
// Ce module est importé pour SON EFFET DE BORD par index.tsx, avant le rendu :
// l'événement `beforeinstallprompt` est émis très tôt par le navigateur, et il
// ne se rejoue pas. Un écouteur posé à l'ouverture de la modale arriverait trop
// tard et le bouton d'installation ne fonctionnerait jamais.
//
// Rappel de ce qui est possible selon la plateforme (vérifié en juillet 2026) :
//   - Windows/Mac/Linux (Chrome, Edge) : invite native via `prompt()`.
//     Firefox ordinateur ne gère pas les manifests — aucune installation.
//   - Android (Chrome, Edge, Samsung…) : invite native.
//   - iOS/iPadOS : AUCUNE API. `beforeinstallprompt` n'existe pas. L'utilisateur
//     doit passer par Partager → Sur l'écran d'accueil (Safari depuis toujours,
//     autres navigateurs depuis iOS 16.4).
// =====================================================================

export type Platform = 'ios' | 'android' | 'desktop';

// L'événement n'est pas encore dans les types du DOM.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let invite: BeforeInstallPromptEvent | null = null;
const abonnes = new Set<() => void>();

const notifier = () => abonnes.forEach(fn => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // Sans preventDefault, Chrome affiche sa propre mini-infobar et nous prive
    // de la main sur le moment où l'invite apparaît.
    e.preventDefault();
    invite = e as BeforeInstallPromptEvent;
    notifier();
  });

  // L'app vient d'être installée : le bouton doit cesser de la proposer.
  window.addEventListener('appinstalled', () => {
    invite = null;
    notifier();
  });
}

/** S'abonne aux changements de disponibilité de l'invite. Retourne le désabonnement. */
export const onInstallStateChange = (fn: () => void): (() => void) => {
  abonnes.add(fn);
  return () => abonnes.delete(fn);
};

/** Vrai si le navigateur nous a donné une invite native exploitable. */
export const canPrompt = (): boolean => invite !== null;

/**
 * Déclenche l'invite native. Retourne 'accepted', 'dismissed', ou 'unavailable'
 * si aucune invite n'a été captée (iOS, Firefox ordinateur, déjà installée).
 */
export const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
  if (!invite) return 'unavailable';
  const e = invite;
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    // Une invite est à usage unique : la conserver donnerait un bouton mort.
    invite = null;
    notifier();
    return outcome;
  } catch {
    invite = null;
    notifier();
    return 'unavailable';
  }
};

/** Vrai si l'app tourne dans sa fenêtre installée (et non dans un onglet). */
export const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  // `navigator.standalone` est la SEULE voie sur iOS : Safari n'expose pas
  // display-mode: standalone de façon fiable pour les apps de l'écran d'accueil.
  const iosStandalone = (window.navigator as any).standalone === true;
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone;
};

export const getPlatform = (): Platform => {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13+ se déclare « Macintosh » : sans ce test, un iPad recevrait les
  // instructions Windows, qui ne s'appliquent pas du tout.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
  return 'desktop';
};

/** Firefox ordinateur : pas de gestion des manifests, l'installation est impossible. */
export const isFirefoxDesktop = (): boolean =>
  typeof navigator !== 'undefined' &&
  /Firefox/i.test(navigator.userAgent) &&
  getPlatform() === 'desktop';
