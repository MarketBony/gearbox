import { isStandalone, getPlatform } from './pwaInstall';

// =====================================================================
// NOTIFICATIONS PUSH — côté client
//
// Contraintes à connaître avant de toucher à ce fichier :
//
//  - La permission ne peut être demandée QUE depuis un vrai geste utilisateur.
//    Apple l'impose formellement ; sur iOS un appel automatique au chargement
//    échoue en silence. D'où l'absence totale d'appel spontané ici.
//  - Sur iOS, l'abonnement n'est possible que depuis l'app AJOUTÉE À L'ÉCRAN
//    D'ACCUEIL. Dans un onglet Safari, l'API existe mais ne donnera jamais rien :
//    mieux vaut l'annoncer que d'afficher un bouton qui ne marche pas.
//  - Un refus est définitif côté page : seul l'utilisateur peut revenir en
//    arrière depuis les réglages du navigateur ou du système.
// =====================================================================

export type PushState =
  | 'unsupported'      // navigateur sans API Push
  | 'ios-needs-install' // iOS dans un onglet : installer d'abord
  | 'default'          // jamais demandé
  | 'granted'          // accordé
  | 'denied';          // refusé (irréversible depuis la page)

const supporte = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export const getPushState = (): PushState => {
  if (!supporte()) return 'unsupported';
  // Sur iPhone/iPad hors app installée, inutile de proposer quoi que ce soit.
  if (getPlatform() === 'ios' && !isStandalone()) return 'ios-needs-install';
  const p = Notification.permission;
  if (p === 'granted') return 'granted';
  if (p === 'denied') return 'denied';
  return 'default';
};

/** La clé VAPID vient du serveur (source unique de vérité), pas du build. */
const getVapidKey = async (): Promise<string> => {
  const r = await fetch('/api/push/public-key');
  if (!r.ok) throw new Error('Clé VAPID indisponible côté serveur.');
  const { publicKey } = await r.json();
  return publicKey;
};

// `applicationServerKey` attend un Uint8Array, pas la chaîne base64url du serveur.
const base64UrlVersUint8 = (base64Url: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const brut = atob(base64);
  const sortie = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) sortie[i] = brut.charCodeAt(i);
  return sortie;
};

const enregistrerSW = async (): Promise<ServiceWorkerRegistration> => {
  const reg = await navigator.serviceWorker.register('/sw.js');
  // `ready` garantit qu'un worker est actif : s'abonner sur un worker en cours
  // d'installation échoue.
  await navigator.serviceWorker.ready;
  return reg;
};

const envoyerAuServeur = async (sub: PushSubscription): Promise<void> => {
  const token = localStorage.getItem('gearbox_token');
  const r = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(sub.toJSON())
  });
  if (!r.ok) throw new Error("Le serveur a refusé l'abonnement.");
};

/**
 * À APPELER DEPUIS UN CLIC. Demande la permission puis abonne ce navigateur.
 * Retourne l'état résultant.
 */
export const subscribeToPush = async (): Promise<PushState> => {
  const etat = getPushState();
  if (etat === 'unsupported' || etat === 'ios-needs-install' || etat === 'denied') return etat;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default';

  const reg = await enregistrerSW();
  const cle = await getVapidKey();

  // Réutilise l'abonnement existant s'il y en a un : en créer un second pour le
  // même navigateur ferait sonner deux fois.
  const existant = await reg.pushManager.getSubscription();
  const sub =
    existant ??
    (await reg.pushManager.subscribe({
      // Obligatoire, et pas seulement par politesse : sans affichage visible, le
      // navigateur peut révoquer l'abonnement.
      userVisibleOnly: true,
      applicationServerKey: base64UrlVersUint8(cle)
    }));

  await envoyerAuServeur(sub);
  return 'granted';
};

/** Désabonne ce navigateur (les autres appareils de l'utilisateur restent abonnés). */
export const unsubscribeFromPush = async (): Promise<void> => {
  if (!supporte()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;

  const token = localStorage.getItem('gearbox_token');
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint: sub.endpoint })
  }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
};

/**
 * Au démarrage, si la permission est DÉJÀ accordée : réenregistre le service
 * worker et renvoie l'abonnement au serveur.
 *
 * Ce n'est pas redondant. Un navigateur peut renouveler un abonnement de sa
 * propre initiative (`pushsubscriptionchange`) ; l'ancien endpoint devient alors
 * muet sans que personne ne le sache. Comme le serveur fait un upsert sur
 * l'endpoint, ce rafraîchissement au chargement répare ce cas silencieusement,
 * et ne demande AUCUNE permission (elle est déjà accordée).
 */
export const refreshPushSubscription = async (): Promise<void> => {
  if (!supporte() || Notification.permission !== 'granted') return;
  try {
    const reg = await enregistrerSW();
    const cle = await getVapidKey();
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlVersUint8(cle)
      }));
    await envoyerAuServeur(sub);
  } catch {
    // Silencieux : un échec ici ne doit pas gêner l'utilisation de l'app.
  }
};

/**
 * Badge sur l'icône de l'app (compteur de non-lus), façon Messenger.
 * Supporté sur ordinateur, Android, et iOS 16.4+ pour les apps installées.
 * Ignoré ailleurs — d'où les gardes silencieuses.
 */
export const setAppBadge = (count: number): void => {
  const nav = navigator as any;
  if (typeof nav.setAppBadge !== 'function') return;
  if (count > 0) nav.setAppBadge(count).catch(() => undefined);
  else nav.clearAppBadge?.().catch(() => undefined);
};
