import webpush from 'web-push';
import { prisma } from '../db';

// =====================================================================
// ENVOI DE NOTIFICATIONS WEB PUSH
//
// Fonctionne sur Windows/Mac (Chrome, Edge), Android, et iOS 16.4+ — sur iPhone
// uniquement si l'app a été ajoutée à l'écran d'accueil, c'est une contrainte
// d'Apple. Le payload est chiffré de bout en bout avec les clés de l'abonnement :
// les serveurs d'Apple et de Google relaient sans pouvoir le lire.
//
// Configuration : VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT.
// ⚠️ Ces variables doivent être À LA FOIS dans le .env du VPS ET déclarées dans
// le bloc `environment:` du service `api` de docker-compose.yml. Sans la
// déclaration, elles n'atteignent pas le conteneur.
// =====================================================================


const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:contact@bonyauto-mobile.com';

export const pushConfigured = Boolean(PUBLIC_KEY && PRIVATE_KEY);

if (pushConfigured) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
} else {
  // Trace explicite au démarrage : sans elle, un push non configuré est
  // indiscernable d'un push qui n'intéresse personne.
  console.warn(
    '[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY absentes : notifications push désactivées.'
  );
}

export const getPublicKey = (): string => PUBLIC_KEY;

export interface PushPayload {
  title: string;
  body: string;
  /** Regroupe les notifications d'une même conversation au lieu de les empiler. */
  tag?: string;
  /** Rubrique à ouvrir au clic (ex. 'chat'). */
  section?: string;
  conversationId?: string;
}

/**
 * Envoie une notification à TOUS les appareils d'un utilisateur.
 * Les abonnements devenus invalides (404/410 : navigateur désinstallé,
 * permission révoquée, abonnement expiré) sont supprimés au passage — sans ça la
 * table se remplit de fantômes et chaque envoi retente dans le vide.
 */
export const sendPushToUser = async (userId: string, payload: PushPayload): Promise<void> => {
  if (!pushConfigured) return;

  const abonnements = await prisma.pushSubscription.findMany({ where: { userId } });
  if (abonnements.length === 0) return;

  const corps = JSON.stringify(payload);

  await Promise.all(
    abonnements.map(async (a) => {
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          corps
        );
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          await prisma.pushSubscription
            .delete({ where: { endpoint: a.endpoint } })
            .catch(() => undefined); // course avec un autre envoi : sans importance
          return;
        }
        // Toute autre erreur (réseau, 5xx du service de push) ne doit pas faire
        // échouer l'envoi du message lui-même : on trace et on continue.
        console.error('[push] échec envoi', code ?? e?.message ?? e);
      }
    })
  );
};

/**
 * Qui doit RÉELLEMENT recevoir une notification pour un nouveau message.
 *
 * Extrait ici plutôt que laissé en ligne dans realtime/chat.ts : ces trois
 * exclusions sont une règle métier, elles méritent un seul endroit et un test.
 *
 *  1. l'émetteur — il sait ce qu'il vient d'écrire ;
 *  2. ceux qui ont mis la conversation en sourdine ;
 *  3. ceux qui sont actuellement SUR la rubrique passée en `onSection` : inutile
 *     de faire sonner un téléphone dont l'écran affiche déjà le chat.
 *
 * Dédoublonne au passage : `unreadTargets` du Général est construit à partir de
 * la liste des utilisateurs et pourrait contenir un doublon.
 */
export const resolvePushRecipients = (params: {
  unreadTargets: string[];
  senderId: string;
  mutedBy: string[];
  onSection: Set<string>;
}): string[] => {
  const { unreadTargets, senderId, mutedBy, onSection } = params;
  const exclus = new Set([senderId, ...mutedBy]);
  const retenus = new Set<string>();
  for (const id of unreadTargets) {
    if (exclus.has(id) || onSection.has(id)) continue;
    retenus.add(id);
  }
  return [...retenus];
};

/** Envoi à plusieurs destinataires, en parallèle et sans qu'un échec bloque les autres. */
export const sendPushToUsers = async (userIds: string[], payload: PushPayload): Promise<void> => {
  if (!pushConfigured || userIds.length === 0) return;
  await Promise.all(userIds.map(id => sendPushToUser(id, payload).catch(() => undefined)));
};
