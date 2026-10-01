import React, { useCallback, useEffect, useState } from 'react';
import type { ChatConversation, ChatMessage, Project, User } from '../../../types';
import { hasSocialFeatures } from '../../../constants';
import { chatStore } from '../../../services/chatStore';
import { messageEstImageDistante } from '../../../lib/richText';
import { gx, Icon, Avatar } from '../ui/kit';

// =====================================================================
// Chat (interface v2) — briques partagées par la rubrique : formats de date, résumés de
// message, avatars de conversation, épingle locale, abonnement au store temps réel.
// Toute la logique vient de pages/Chat.tsx (mêmes règles, mêmes libellés) ; le balisage vient
// de maquettes/v2/js/apps/chat.js (mêmes classes `cht-*`).
// =====================================================================

export const REACTIONS = ['👍', '❤️', '😂', '😮'];
export const REACTION_LABELS: Record<string, string> = { '👍': 'J’aime', '❤️': 'J’adore', '😂': 'Haha', '😮': 'Waouh' };
/** ⚠️ Aligné sur la règle `chat` de backend/src/routes/uploads.ts (le seul garde-fou réel). */
export const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;
/** Décide seulement si la pièce jointe s'affiche en IMAGE dans le fil (pas une liste d'autorisation). */
export const CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
/** ⚠️ Alignés sur la règle `avatar` de uploads.ts (ce qui part est un JPEG 200×200). */
export const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
export const AVATAR_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
/** ⚠️ Alignés sur la règle `chatbg` de uploads.ts (JPEG / PNG / WebP, 8 Mo). */
export const FOND_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FOND_SIZE = 8 * 1024 * 1024;
/** Au-delà : « Vu par N personnes » (décision de Théo, pensée pour le Général). */
export const VU_PAR_MAX_NOMS = 5;

// ---------------------------------------------------------------- dates (identiques à Chat.tsx)
export const relativeTime = (iso: string): string => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  if (h < 48) return 'hier';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};
export const dayLabel = (iso: string): string => {
  const d = new Date(iso), today = new Date(), y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Aujourd’hui';
  if (d.toDateString() === y.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};
export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

// ---------------------------------------------------------------- messages
/** Image distante (GIF collé / envoyé) : seulement pour un message TEXTE non expiré (Chat.tsx). */
export const imageDistante = (m: ChatMessage): string | null =>
  m.type === 'text' && !m.fileExpiredAt ? messageEstImageDistante(m.content) : null;

/**
 * Résumé d'un message sur UNE ligne (réponse citée, bandeau « Réponse à »).
 * ⚠️ Pendant SERVEUR : `lastMessage` de backend/src/realtime/chat.ts — tout nouveau type se traite aux deux endroits.
 */
export const resumeMessage = (m: ChatMessage, projects: Record<string, Project>, max = 60): string => {
  if (m.deleted) return 'Message supprimé';
  if (m.type === 'image') return '📷 Image';
  if (m.type === 'file') return `📎 ${m.fileName ?? 'Pièce jointe'}`;
  if (m.type === 'audio') return `🎤 Message vocal${m.fileName ? ` (${m.fileName})` : ''}`;
  if (m.type === 'project') return `📋 ${projects[m.content]?.name ?? 'Projet'}`;
  if (imageDistante(m)) return '📷 GIF';
  return m.content.slice(0, max);
};

/** Seul un message TEXTE (hors GIF) se modifie : l'édition d'une image / d'un fichier / d'un vocal / d'un
 *  projet remplacerait son URL ou son id par du texte (défaut relevé dans l'inventaire, corrigé ici). */
export const estModifiable = (m: ChatMessage, meId: string) =>
  m.senderId === meId && !m.deleted && m.type === 'text' && !m.fileExpiredAt && !imageDistante(m);

// ---------------------------------------------------------------- conversations
export const isPrivate = (c: ChatConversation) => c.type === 'private';

/** Membres d'une conversation. Général = tous les comptes ayant le chat, sauf External (même appartenance
 *  implicite que le serveur, et même définition que « Vu par »). */
export const membersOf = (c: ChatConversation, users: User[], byId: Record<string, User>): User[] =>
  c.type === 'general'
    ? users.filter((u) => u.role !== 'External' && hasSocialFeatures(u.role))
    : (c.participants.map((id) => byId[id]).filter(Boolean) as User[]);

/** `getConvName` de Chat.tsx. */
export const convName = (c: ChatConversation, meId: string, byId: Record<string, User>): string => {
  if (c.name) return c.name;
  if (c.type === 'general') return 'Chat Général';
  const others = c.participants.filter((p) => p !== meId).map((p) => byId[p]).filter(Boolean) as User[];
  if (!others.length) return 'Conversation';
  return others.map((u) => u.name).join(', ');
};

/** Conversation privée existante avec cet interlocuteur. Un seul test pour l'ouverture ET pour le badge
 *  « EXISTANTE » (deux tests divergents dans Chat.tsx, relevé dans l'inventaire). */
export const privateWith = (convs: ChatConversation[], meId: string, uid: string) =>
  convs.find((c) => c.type === 'private' && c.participants.length === 2 && c.participants.includes(meId) && c.participants.includes(uid));

/** Store temps réel des conversations (services/chatStore.ts), le même que la Sidebar et DataHub. */
export function useChatConvs(): ChatConversation[] {
  const [c, setC] = useState<ChatConversation[]>(() => chatStore.getConversations());
  useEffect(() => {
    const sync = () => setC(chatStore.getConversations());
    const unsub = chatStore.subscribe(sync); sync();
    return unsub;
  }, []);
  return c;
}

// ---------------------------------------------------------------- épingle (overlay local, comme Chat.tsx)
// ⚠️ Même clé et même forme que pages/Chat.tsx : `{ [convId]: { pinnedBy } }`. Préférence PAR NAVIGATEUR,
// jamais écrite en base ; les anciens champs `name` / `participants` sont ignorés volontairement.
type ConvOverlay = { pinnedBy?: string[] };
const OVERLAY_KEY = 'gearbox_chat_overlay';
const readOverlay = (): Record<string, ConvOverlay> => {
  try { const d = localStorage.getItem(OVERLAY_KEY); return d ? JSON.parse(d) : {}; } catch { return {}; }
};
export function usePins(meId: string) {
  const [ov, setOv] = useState(readOverlay);
  const pinnedBy = useCallback((c: ChatConversation) => ov[c.id]?.pinnedBy ?? c.pinnedBy ?? [], [ov]);
  const isPinned = useCallback((c: ChatConversation) => pinnedBy(c).includes(meId), [pinnedBy, meId]);
  const toggle = useCallback((c: ChatConversation) => {
    const all = readOverlay(), cur = all[c.id]?.pinnedBy ?? c.pinnedBy ?? [];
    all[c.id] = { ...all[c.id], pinnedBy: cur.includes(meId) ? cur.filter((x) => x !== meId) : [...cur, meId] };
    try { localStorage.setItem(OVERLAY_KEY, JSON.stringify(all)); } catch { /* navigation privée : épingle non retenue */ }
    setOv(all);
  }, [meId]);
  return { isPinned, toggle };
}

// ---------------------------------------------------------------- avatars
/**
 * Avatar `.av` de la maquette, avec la pastille de présence `.pres`.
 * BESOIN: l'`Avatar` du kit ne sait pas afficher la présence ni un auteur absent de la liste des
 * utilisateurs (ancien membre) — voir BESOINS.md § 1.
 */
export const Av: React.FC<{ name: string; color?: string; cls?: string; online?: boolean }> = ({ name, color, cls = '', online }) =>
  <Avatar name={name || '?'} color={color} cls={cls} online={online} />;
/** Avatar d'un utilisateur des stores : sa photo (porte `Avatar` du kit), sinon ses initiales. */
export const UserAv: React.FC<{ u: User | undefined; cls?: string; online?: boolean }> = ({ u, cls, online }) =>
  <Avatar user={u} name="Ancien membre" cls={cls} online={online} />;

/** Avatar de conversation (`convAv` de la maquette, règles de `ConvAvatar` de Chat.tsx). */
export const ConvAv: React.FC<{ c: ChatConversation; meId: string; byId: Record<string, User>; online: Set<string>; size?: 'lg' | 'sm' }> =
  ({ c, meId, byId, online, size = 'lg' }) => {
    const sm = size === 'lg' ? '' : 'sm';
    if (c.type === 'general') return <span className={`cht-gav ${sm}`} style={{ background: 'var(--bony-grad)', fontWeight: 800, fontSize: size === 'lg' ? 18 : 14 }}>#</span>;
    if (c.type === 'private') {
      const oid = c.participants.find((p) => p !== meId) || meId;
      return <UserAv u={byId[oid]} cls={size} online={online.has(oid)} />;
    }
    // Groupe : la photo (partagée, en base) est prioritaire sur les avatars empilés.
    if (c.avatarUrl) return <span className={`cht-gav ${sm}`} style={{ background: `center/cover no-repeat url("${encodeURI(c.avatarUrl)}")` }} />;
    const others = c.participants.filter((p) => p !== meId).map((p) => byId[p]).filter(Boolean) as User[];
    if (others.length >= 2) return <span className={`cht-duo ${sm}`}><UserAv u={others[0]} cls="sm" /><UserAv u={others[1]} cls="sm" /></span>;
    if (others.length === 1) return <UserAv u={others[0]} cls={size} />;
    return <span className={`cht-gav ${sm}`} style={{ background: 'var(--bony-violet)' }}><Icon name="users" /></span>;
  };

export const roleLabel = (role: string) => gx().data.ROLES?.[role]?.l || role;
