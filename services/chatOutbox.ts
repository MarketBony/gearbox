import { useSyncExternalStore } from 'react';
import type { ChatMessage } from '../types';
import { getSocket, connectSocket } from './socket';
import { db } from './dataService';

// =====================================================================
// BOÎTE D'ENVOI DU CHAT (08/10/2026) — PORTE UNIQUE des envois de messages, pour les DEUX interfaces
// (pages/Chat.tsx et ui2/apps/chat/ChatApp.tsx).
//
// Pourquoi : « le message disparaît à l'envoi ». Mesuré : aucun doublon en base, et le message de Théo du
// 08/10 dans le Général n'est JAMAIS arrivé au serveur. Le champ se vidait, l'émission partait dans un socket
// à moitié mort (veille, changement de réseau : jusqu'à 45 s où le navigateur le croit vivant) et se perdait
// sans erreur ni accusé — `emitWithAck` n'avait pas de délai.
//
// Ce que fait la boîte :
//  - le message s'affiche TOUT DE SUITE (« Envoi… ») ; il n'est retiré qu'à l'accusé du serveur, qui est alors
//    remis à l'écran par `gearbox-chat-delivered` (même si la diffusion `chat:message:new` s'est perdue) ;
//  - sans accusé en 8 s, ou socket coupé : il est RENVOYÉ à la reconnexion, avec le même `clientId` — le serveur
//    rend le message déjà enregistré au lieu d'en créer un second (anti-doublon, realtime/chat.ts) ;
//  - après 4 essais : « Non envoyé · Réessayer » ; le texte n'est jamais perdu ;
//  - pièces jointes : dépôt avec progression, puis même chemin ; les grosses photos sont réduites avant l'envoi.
// =====================================================================

export type OutboxStatus = 'uploading' | 'sending' | 'failed';
export interface OutboxItem {
  clientId: string;
  conversationId: string;
  type: 'text' | 'image' | 'file' | 'audio' | 'project';
  content: string;            // texte, ou URL une fois le fichier déposé
  replyToId?: string;
  fileName?: string;
  fileSize?: number;
  status: OutboxStatus;
  progress?: number;          // 0..1 pendant le dépôt
  preview?: string;           // aperçu local d'une image (object URL)
  error?: string;
  createdAt: number;
  tries: number;
  /** Numéro de l'essai en cours : la réponse (ou l'expiration) d'un essai DÉPASSÉ est ignorée. */
  attemptId?: number;
  file?: File;                // gardé pour « Réessayer » tant que le dépôt n'a pas réussi
  uploadType?: 'chat';
}

const ACK_MS = 8_000;
const MAX_TRIES = 4;
/** Au-delà, une photo est réduite (côté le plus long) avant le dépôt : 5 à 10 Mo en 4G échouaient. */
const SHRINK_ABOVE = 1.5 * 1024 * 1024, MAX_SIDE = 2048, QUALITY = 0.85;

let items: OutboxItem[] = [];
const subs = new Set<() => void>();
const emit = () => { items = [...items]; subs.forEach((f) => f()); };
const patch = (clientId: string, p: Partial<OutboxItem>) => { const i = items.find((x) => x.clientId === clientId); if (i) { Object.assign(i, p); emit(); } };
const remove = (clientId: string) => { const i = items.find((x) => x.clientId === clientId); if (i?.preview) URL.revokeObjectURL(i.preview); items = items.filter((x) => x.clientId !== clientId); emit(); };

const uid = () => (crypto as any).randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Messages en attente d'une conversation (rendus à la fin du fil, en « Envoi… » / « Non envoyé »). */
export const useOutbox = (conversationId: string | null | undefined): OutboxItem[] =>
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => items)
    .filter((x) => x.conversationId === conversationId);

/** Le serveur a accusé réception : remet le message à l'écran (dédoublonné par id chez les écrans). */
const delivered = (m: ChatMessage) => window.dispatchEvent(new CustomEvent('gearbox-chat-delivered', { detail: m }));

// ---------------------------------------------------------------- émission
function attempt(it: OutboxItem) {
  if (it.status === 'failed' || it.status === 'uploading') return;
  const s = getSocket() ?? connectSocket();
  if (!s || !s.connected) { patch(it.clientId, { status: 'sending' }); return; }   // repartira au `connect`
  it.tries += 1;
  const mine = (it.attemptId = (it.attemptId || 0) + 1);
  const payload = { conversationId: it.conversationId, content: it.content, type: it.type, replyToId: it.replyToId, fileName: it.fileName, fileSize: it.fileSize, clientId: it.clientId };
  s.timeout(ACK_MS).emit('chat:message:send', payload, (err: Error | null, res: any) => {
    if (!items.some((x) => x.clientId === it.clientId)) return;               // annulé entre-temps
    if (it.attemptId !== mine) return;                                         // un essai plus récent est parti
    if (!err && res && !res.error) { remove(it.clientId); delivered(res as ChatMessage); return; }
    if (!err && res?.error) { patch(it.clientId, { status: 'failed', error: res.error }); return; }   // refus du serveur : pas de renvoi
    // Pas d'accusé : connexion morte ou lente. On renvoie (même clientId) ; au bout de MAX_TRIES, on rend la main.
    if (it.tries >= MAX_TRIES) { patch(it.clientId, { status: 'failed', error: 'Pas de réponse du serveur.' }); return; }
    // Le socket peut se croire connecté : on force une reconnexion propre, le `connect` relancera l'envoi.
    if (s.connected) { s.disconnect().connect(); } else setTimeout(() => attempt(it), 1500);
  });
}

/** Relance tout ce qui attend (appelé à chaque (re)connexion, et au retour sur l'onglet). */
function flush() { items.filter((x) => x.status === 'sending').forEach(attempt); }

// Garde-fou : un message qui attend une connexion depuis 45 s sans essai en cours passe en « Non envoyé »
// (le texte reste, « Réessayer » le relance) — jamais d'« Envoi… » éternel.
setInterval(() => {
  const now = Date.now();
  items.filter((x) => x.status === 'sending' && now - x.createdAt > 45_000 && !(getSocket()?.connected)).forEach((x) => patch(x.clientId, { status: 'failed', error: 'Connexion perdue.' }));
}, 5_000);

let bound = false;
function bind() {
  if (bound) return;
  const s = getSocket() ?? connectSocket(); if (!s) return;
  bound = true;
  s.on('connect', flush);
  // Retour sur l'onglet / réseau retrouvé : un socket peut se croire vivant alors qu'il est mort ; on le sonde.
  const probe = () => {
    const so = getSocket(); if (!so) return;
    if (!so.connected) { so.connect(); return; }
    so.timeout(3_000).emit('chat:ping', null, (err: Error | null) => { if (err) so.disconnect().connect(); else flush(); });
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) probe(); });
  window.addEventListener('online', probe);
}

// ---------------------------------------------------------------- API
export function sendChatMessage(conversationId: string, content: string, type: OutboxItem['type'] = 'text', extra: { replyToId?: string; fileName?: string; fileSize?: number } = {}) {
  if (!conversationId || !content.trim()) return;
  bind();
  const it: OutboxItem = { clientId: uid(), conversationId, content, type, ...extra, status: 'sending', createdAt: Date.now(), tries: 0 };
  items = [...items, it]; emit();
  attempt(it);
}

/** Réduit une grosse photo (JPEG / WebP / PNG sans transparence utile) ; rend le fichier d'origine sinon. */
async function shrink(f: File): Promise<File> {
  if (!['image/jpeg', 'image/webp', 'image/png'].includes(f.type) || f.size <= SHRINK_ABOVE) return f;
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); if (!ctx) return f;
    ctx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
    const outType = f.type === 'image/png' ? 'image/webp' : 'image/jpeg';   // WebP garde la transparence d'un PNG
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, outType, QUALITY));
    if (!blob || blob.size >= f.size) return f;
    const name = f.name.replace(/\.[^.]+$/, '') + (outType === 'image/webp' ? '.webp' : '.jpg');
    return new File([blob], name, { type: outType });
  } catch { return f; }   // format illisible par le navigateur : on envoie tel quel
}

async function upload(it: OutboxItem) {
  if (!it.file) return;
  patch(it.clientId, { status: 'uploading', progress: 0, error: undefined });
  try {
    const f = it.type === 'image' ? await shrink(it.file) : it.file;
    const url = await db.uploadFileWithProgress('chat', f, (p) => patch(it.clientId, { progress: p }));
    patch(it.clientId, { content: url, fileSize: f.size, file: undefined, status: 'sending', progress: 1 });
    attempt(it);
  } catch (e: any) {
    patch(it.clientId, { status: 'failed', error: e?.message || 'Échec de l’envoi du fichier.' });
  }
}

/** Pièce jointe : aperçu immédiat, dépôt avec progression, puis envoi du message. */
export function sendChatFile(conversationId: string, file: File, type: 'image' | 'file' | 'audio', extra: { replyToId?: string; fileName?: string } = {}) {
  if (!conversationId) return;
  bind();
  const it: OutboxItem = {
    clientId: uid(), conversationId, content: '', type, replyToId: extra.replyToId,
    fileName: extra.fileName ?? file.name, fileSize: file.size, status: 'uploading', progress: 0,
    preview: type === 'image' ? URL.createObjectURL(file) : undefined, createdAt: Date.now(), tries: 0, file, uploadType: 'chat',
  };
  items = [...items, it]; emit();
  void upload(it);
}

export function retryChatMessage(clientId: string) {
  const it = items.find((x) => x.clientId === clientId); if (!it) return;
  it.tries = 0;
  if (it.file) { void upload(it); return; }
  patch(clientId, { status: 'sending', error: undefined }); attempt(it);
}
export const cancelChatMessage = (clientId: string) => remove(clientId);
