import { Server, Socket } from 'socket.io';
import { prisma } from '../db';

// =====================================================================
// PRÉSENCE EN TEMPS RÉEL — qui est sur quelle rubrique de l'ERP
//
// État volontairement EN MÉMOIRE (pas de table Prisma) : la présence est par
// nature éphémère et liée à la durée de vie d'une connexion socket. Un
// redémarrage du conteneur `api` la vide, et les clients la reconstruisent
// d'eux-mêmes en réémettant `presence:set` sur l'événement 'connect'.
//
// Le serveur est la seule autorité : il diffuse un instantané complet
// (`presence:state`) à chaque changement. Pas de diffs — le volume est de
// l'ordre de la dizaine d'utilisateurs, un instantané coûte moins cher à
// raisonner qu'une synchronisation incrémentale.
// =====================================================================


interface Entry {
  userId: string;
  section: string;
  at: number; // horodatage du dernier presence:set, arbitre entre onglets
}

// socket.id -> présence de ce socket. Un utilisateur avec plusieurs onglets a
// plusieurs entrées ; l'instantané ne le montre que dans UNE rubrique (la plus
// récente), sinon il apparaîtrait à deux endroits à la fois.
const bySocket = new Map<string, Entry>();

// Identité d'affichage (nom / couleur / photo), lue une fois par connexion.
// Le JWT ne porte que { id, role } — insuffisant pour rendre un avatar, et la
// Sidebar ne charge pas la liste des utilisateurs.
const identities = new Map<string, { name: string; avatarColor: string | null; avatarUrl: string | null }>();

const MAX_SECTION_LEN = 40;

// La section vient du client : on la borne (chaîne courte) sans imposer une
// liste blanche, pour ne pas avoir à resynchroniser ce fichier à chaque
// nouvelle rubrique ajoutée au frontend.
const sanitizeSection = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || s.length > MAX_SECTION_LEN) return null;
  return s;
};

export interface PresenceUser {
  userId: string;
  name: string;
  color: string;
  avatarUrl: string | null;
}

// Instantané : rubrique -> utilisateurs présents (uniques par userId).
const buildSnapshot = (): Record<string, PresenceUser[]> => {
  // 1. Un utilisateur = une seule rubrique, celle de son onglet le plus récent.
  const latestByUser = new Map<string, Entry>();
  for (const entry of bySocket.values()) {
    const current = latestByUser.get(entry.userId);
    if (!current || entry.at > current.at) latestByUser.set(entry.userId, entry);
  }

  // 2. Regroupement par rubrique.
  const snapshot: Record<string, PresenceUser[]> = {};
  for (const entry of latestByUser.values()) {
    const identity = identities.get(entry.userId);
    if (!identity) continue; // identité pas encore résolue : ignoré, le prochain broadcast le rattrapera
    (snapshot[entry.section] ||= []).push({
      userId: entry.userId,
      name: identity.name,
      color: identity.avatarColor || '#64748b',
      avatarUrl: identity.avatarUrl
    });
  }

  // Ordre stable (par nom) pour éviter que les avatars sautent d'une place à
  // l'autre entre deux instantanés.
  for (const list of Object.values(snapshot)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return snapshot;
};

const broadcast = (io: Server) => {
  io.emit('presence:state', buildSnapshot());
};

/**
 * Utilisateurs actuellement sur une rubrique donnée (ex. 'chat').
 * Sert à ne PAS envoyer de notification push à quelqu'un qui a déjà l'écran
 * sous les yeux. Même règle de dédoublonnage que l'instantané : un utilisateur
 * compte pour sa rubrique la plus récente, pas pour tous ses onglets.
 *
 * Limite assumée : la présence connaît la rubrique, pas la conversation ouverte.
 * Quelqu'un dans une AUTRE conversation du Chat ne recevra pas de push, mais
 * verra le compteur non-lu se mettre à jour immédiatement.
 */
export const getUserIdsOnSection = (section: string): Set<string> => {
  const latestByUser = new Map<string, Entry>();
  for (const entry of bySocket.values()) {
    const current = latestByUser.get(entry.userId);
    if (!current || entry.at > current.at) latestByUser.set(entry.userId, entry);
  }
  const ids = new Set<string>();
  for (const entry of latestByUser.values()) {
    if (entry.section === section) ids.add(entry.userId);
  }
  return ids;
};

// Charge l'identité d'affichage si absente du cache.
const ensureIdentity = async (userId: string) => {
  if (identities.has(userId)) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, avatarColor: true, avatarUrl: true }
  });
  if (user) identities.set(userId, user);
};

export const registerPresenceHandlers = (io: Server, socket: Socket) => {
  const userId: string | undefined = socket.data.user?.id;
  if (!userId) return; // handshake déjà refusé sans JWT valide, garde défensive

  socket.on('presence:set', async (payload: any) => {
    const section = sanitizeSection(payload?.section);
    if (!section) return;

    try {
      await ensureIdentity(userId);
    } catch (err) {
      console.error('presence: lecture identité échouée', err);
      return; // sans identité on ne peut pas rendre l'avatar : on n'annonce rien
    }

    bySocket.set(socket.id, { userId, section, at: Date.now() });
    broadcast(io);
  });

  socket.on('disconnect', () => {
    if (bySocket.delete(socket.id)) broadcast(io);
  });
};

// Le cache d'identités doit suivre les mutations de compte, sinon un avatar de
// présence resterait figé sur un ancien nom/photo jusqu'au redémarrage.
// Traite d'un coup les deux cas, qui n'ont pas le même effet :
//  - profil modifié  -> on recharge l'identité, les présences sont conservées
//  - compte supprimé -> on purge ses présences (sinon un fantôme resterait)
export const handleUserChanged = async (io: Server | undefined, userId: string) => {
  identities.delete(userId);

  let stillExists = false;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, avatarColor: true, avatarUrl: true }
    });
    if (user) {
      identities.set(userId, user);
      stillExists = true;
    }
  } catch (err) {
    console.error('presence: rechargement identité échoué', err);
    return; // on ne casse pas l'état courant sur une erreur de lecture
  }

  if (!stillExists) {
    for (const [socketId, entry] of bySocket) {
      if (entry.userId === userId) bySocket.delete(socketId);
    }
  }

  if (io) broadcast(io);
};
