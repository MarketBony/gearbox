import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { ChatConversation, ChatMessage, User } from '../../../types';
import { hasSocialFeatures } from '../../../constants';
import { useAuth } from '../../../contexts/AuthContext';
import { db, ApiError } from '../../../services/dataService';
import { getSocket, connectSocket, emitWithAck } from '../../../services/socket';
import { sendChatMessage, sendChatFile, retryChatMessage, cancelChatMessage, useOutbox, type OutboxItem } from '../../../services/chatOutbox';
import { chatStore } from '../../../services/chatStore';
import { usePresence } from '../../../services/presenceStore';
import { estCheminLocalImage } from '../../../lib/richText';
import { styleFondChat, bulleDe } from '../../../lib/personnalisationChat';
import { useBridge } from '../../os/bridge';
import { useWorkspace, workspace } from '../../store/workspace';
import { gx, hud, Icon, Stack, useSheets, useCompact } from '../ui/kit';
import {
  REACTIONS, REACTION_LABELS, MAX_UPLOAD_SIZE, CHAT_IMAGE_TYPES, VU_PAR_MAX_NOMS,
  relativeTime, dayLabel, hhmm, resumeMessage, estModifiable, imageDistante, membersOf, convName, privateWith,
  useChatConvs, usePins, ConvAv, UserAv,
} from './common';
import { Msg, type MsgApi, type MsgCtx } from './Message';
import { useVoiceRecorder, formatDuree } from './voice';
import { AlertSheet, ConfirmSheet, NewDmSheet, NewGroupSheet, MembersSheet, GroupPhotoSheet, PaletteSheet, QuoteProjectSheet } from './sheets';

// =====================================================================
// Rubrique « Chat » — transposition de maquettes/v2/js/apps/chat.js (même balisage, mêmes classes
// `cht-*`, même CSS), sur la VRAIE messagerie. Parité : maquettes/ux/inventaires/chat.md.
//
// Temps réel (exception à PORTAGE.md § 4, voulue) : EXACTEMENT les services de pages/Chat.tsx —
//  - conversations : `chatStore` (tenu à jour par services/socket.ts : `chat:conversation:*`) ;
//  - fil de la conversation ouverte : `db.getMessages` (historique complet), puis `chat:message:new`
//    (ajout sans doublon) et `chat:message:updated` (édition, suppression, réactions) ;
//  - rechargement du fil sur `gearbox-chat-reconnected` ;
//  - les MESSAGES par la boîte d'envoi (services/chatOutbox.ts, 08/10/2026) : affichés tout de suite en « Envoi… »,
//    renvoyés à la reconnexion, « Non envoyé · Réessayer » sinon ; l'accusé du serveur est remis à l'écran
//    (`gearbox-chat-delivered`) même si la diffusion s'est perdue ;
//  - les autres écritures par `emitWithAck` (erreur = ack `{ error }`) ;
//  - lu : `chat:conversation:read` à l'ouverture et à chaque message d'autrui reçu dans la conversation
//    qu'on REGARDE (fenêtre étroite : seulement quand le fil est affiché, pas la liste).
// Utilisateurs et projets cités : l'espace de travail (ui2/store/workspace.ts).
// Rien n'est inventé : la simulation de la maquette (« … écrit », réponses fictives) n'existe pas ici.
// =====================================================================

interface DayGroup { key: string; label: string; msgs: ChatMessage[] }
const same = (a: ChatMessage | undefined, b: ChatMessage | undefined) =>
  !!a && !!b && a.senderId === b.senderId && !a.deleted && !b.deleted
  && Math.abs(+new Date(a.timestamp) - +new Date(b.timestamp)) < 5 * 6e4
  && new Date(a.timestamp).toDateString() === new Date(b.timestamp).toDateString();

// ---------------------------------------------------------------- ligne de conversation
interface RowApi { select: (id: string) => void; menu: (c: ChatConversation, e: React.MouseEvent) => void; mute: (c: ChatConversation) => void; pin: (c: ChatConversation) => void }
const Row: React.FC<{ c: ChatConversation; sel: boolean; pinned: boolean; name: string; meId: string; byId: Record<string, User>; online: Set<string>; tick: number; api: RowApi }> =
  React.memo(function Row({ c, sel, pinned, name, meId, byId, online, api }) {
    const unread = c.unreadCounts?.[meId] ?? 0, muted = (c.mutedBy ?? []).includes(meId);
    return (
      <div className={`cht-row ${sel ? 'sel' : ''} ${unread ? 'unread' : ''}`} data-conv={c.id} onClick={() => api.select(c.id)} onContextMenu={(e) => api.menu(c, e)}>
        <span className="cht-avw"><ConvAv c={c} meId={meId} byId={byId} online={online} />{pinned ? <span className="cht-pin"><Icon name="star" /></span> : null}</span>
        <div className="cht-rb">
          <div className="cht-l1"><span className="nm ellipsis">{name}</span>{muted ? <span className="cht-ind"><Icon name="belloff" /></span> : null}<span className="sp" /><span className="cht-when">{c.lastMessageAt ? relativeTime(c.lastMessageAt) : ''}</span></div>
          <div className="cht-l2"><span className="cht-prev ellipsis">{c.lastMessage ?? 'Aucun message'}</span>{unread ? <span className={`count ${muted ? 'muted' : ''}`}>{unread > 99 ? '99+' : unread}</span> : null}</div>
        </div>
        <div className="cht-racts">
          <button className={`icon-btn sm ${muted ? 'on' : ''}`} data-tip={muted ? 'Réactiver les notifications' : 'Mettre en sourdine'} aria-label={muted ? 'Réactiver les notifications' : 'Mettre en sourdine'} onClick={(e) => { e.stopPropagation(); api.mute(c); }}><Icon name="belloff" size="sm" /></button>
          <button className={`icon-btn sm ${pinned ? 'on' : ''}`} data-tip={pinned ? 'Désépingler (préférence de ce navigateur)' : 'Épingler (préférence de ce navigateur)'} aria-label={pinned ? 'Désépingler' : 'Épingler'} onClick={(e) => { e.stopPropagation(); api.pin(c); }}><Icon name="star" size="sm" /></button>
        </div>
      </div>
    );
  });

// ---------------------------------------------------------------- panneau GIF (components/GifPicker.tsx)
function GifPanel({ onPick }: { onPick: (url: string) => void }) {
  const [q, setQ] = useState('');
  const [gifs, setGifs] = useState<{ id: string; apercu: string | null; url: string; description: string }[]>([]);
  const [loading, setLoading] = useState(true), [err, setErr] = useState('');
  useEffect(() => {
    let vivant = true; setLoading(true);
    // Anti-rafale : la recherche part après une pause de frappe (350 ms), comme GifPicker.
    const t = window.setTimeout(() => {
      db.searchGifs(q).then((r) => { if (vivant) { setGifs(r); setErr(''); } })
        .catch((e) => { if (vivant) setErr(e instanceof Error ? e.message : 'Recherche indisponible.'); })
        .finally(() => { if (vivant) setLoading(false); });
    }, q ? 350 : 0);
    return () => { vivant = false; window.clearTimeout(t); };
  }, [q]);
  return (
    <div className="cht-gifs" data-gifs>
      <label className="search"><Icon name="search" size="sm" /><input autoFocus placeholder="Rechercher un GIF…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="cht-gifgrid scroll">
        {err ? <div className="faint" style={{ padding: 10, color: 'var(--danger)' }}>{err}</div>
          : loading ? <div className="faint" style={{ padding: 10 }}>Chargement…</div>
            : !gifs.length ? <div className="faint" style={{ padding: 10 }}>Aucun GIF trouvé.</div>
              : gifs.map((g) => (
                <button key={g.id} className="cht-gif" data-tip={g.description} aria-label={g.description || 'GIF'} onClick={() => onPick(g.url)}>
                  <img src={g.apercu ?? g.url} alt={g.description} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
      </div>
      {/* Mention imposée par la licence Giphy — ne pas retirer. */}
      <div className="faint" style={{ fontSize: 10, marginTop: 6 }}>Powered By GIPHY</div>
    </div>
  );
}

// =====================================================================
/** Message de la boîte d'envoi (pas encore accusé par le serveur) : « Envoi… », progression, « Non envoyé ». */
const PendingMsg = React.memo(function PendingMsg({ o }: { o: OutboxItem }) {
  const etat = o.status === 'failed' ? `Non envoyé${o.error ? ` · ${o.error}` : ''}`
    : o.status === 'uploading' ? `Envoi du fichier… ${Math.round((o.progress || 0) * 100)} %` : 'Envoi…';
  return (
    <div className={`cht-msg me last cht-pending ${o.status}`}>
      <div className="cht-col">
        <div className="cht-bwrap">
          {o.type === 'image' && (o.preview || o.content)
            ? <span className="cht-media"><img src={o.preview || o.content} alt="" /></span>
            : o.type === 'text' ? <div className="cht-b">{o.content}</div>
              : <div className="cht-b cht-file"><Icon name={o.type === 'audio' ? 'mic' : 'file'} size="sm" /><b className="ellipsis">{o.type === 'audio' ? 'Message vocal' : o.fileName || 'Pièce jointe'}</b></div>}
        </div>
        <div className="cht-pstate">{etat}{o.status === 'failed' ? <> · <button onClick={() => retryChatMessage(o.clientId)}>Réessayer</button> · <button onClick={() => cancelChatMessage(o.clientId)}>Annuler</button></> : null}</div>
      </div>
    </div>
  );
});

export default function ChatApp({ win, inst }: AppProps) {
  const { user } = useAuth();
  const meId = user?.id || '', role = user?.role || '';
  const ext = role === 'External';
  // Test partagé avec le serveur : le chef de site n'a aucune vie sociale (ni rubrique, ni socket).
  // Rubrique normalement inatteignable pour lui (navigation) ; si elle l'était, on n'appelle RIEN — l'API
  // REST du Chat Général ne l'exclut pas (défaut serveur relevé dans l'inventaire § 11).
  const social = !!user && hasSocialFeatures(role);
  const sombre = useBridge()?.theme !== 'light';

  const convs = useChatConvs();
  const users = useWorkspace((s) => s.users);
  const byId = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])) as Record<string, User>, [users]);
  const presence = usePresence(meId);
  const online = useMemo(() => new Set(Object.values(presence).flat().map((p) => p.userId)), [presence]);
  const pins = usePins(meId);
  const { open: openSheet, portals } = useSheets(win);

  const rootRef = useRef<HTMLDivElement>(null), scRef = useRef<HTMLDivElement>(null), taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null), fileRef = useRef<HTMLInputElement>(null);
  const compact = useCompact(rootRef as React.RefObject<HTMLElement>, 760);

  const [selId, setSelId] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);          // sélection automatique (grand écran) : ne s'empile pas en étroit
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [text, setText] = useState('');
  const drafts = useRef<Record<string, string>>({});
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [q, setQ] = useState('');
  const qd = useDeferredValue(q);
  const [gifDispo, setGifDispo] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [sending, setSending] = useState(0);
  const voice = useVoiceRecorder();

  const visible = useMemo(() => convs.filter((c) => (c.type === 'general' ? !ext : c.participants.includes(meId))), [convs, ext, meId]);
  const conv = selId ? visible.find((c) => c.id === selId) ?? null : null;
  const viewing = !!conv && (!compact || !auto);
  const viewingId = viewing ? conv!.id : null;

  // --- refs lues par les écouteurs (socket, fenêtre) et par les volets ouverts
  const R = useRef({ selId, viewingId, meId, reply, messages });
  R.current = { selId, viewingId, meId, reply, messages };

  // --- alertes / confirmations (pas de alert() / confirm() natifs)
  const alertSheet = useCallback((title: string, body?: string) => { openSheet((close) => <AlertSheet title={title} body={body} close={close} />, { width: 400 }); }, [openSheet]);
  const confirmSheet = useCallback((title: string, body: string, ok: string, onOk: () => void) => { openSheet((close) => <ConfirmSheet title={title} body={body} ok={ok} close={close} onOk={onOk} />, { width: 420 }); }, [openSheet]);
  const fail = (def: string) => (e: unknown) => alertSheet(e instanceof Error && e.message ? e.message : def);

  // ================================================================ chargement + temps réel
  useEffect(() => {
    if (!social) return;
    const s = getSocket() ?? connectSocket();     // idempotent
    // Refresh REST : le socket recharge aussi au connect ; ceci garantit le chargement en arrivant directement ici.
    db.getConversations().then((c) => chatStore.setConversations(c)).catch(() => {});
    // Le bouton GIF n'existe que si le serveur a une clé (sinon la recherche renverrait 503).
    db.getGifStatus().then((x) => setGifDispo(!!x?.disponible)).catch(() => setGifDispo(false));
    // Purge des photos de groupe base64 de l'ancien mécanisme local (bloc supprimable, comme Chat.tsx).
    try { Object.keys(localStorage).filter((k) => k.startsWith('gearbox_conv_avatar_')).forEach((k) => localStorage.removeItem(k)); } catch { /* stockage indisponible */ }
    if (!s) return;
    const onNew = (msg: ChatMessage) => {
      if (msg.conversationId !== R.current.selId) return;
      const sc = scRef.current;
      pendingScroll.current = { id: msg.id, stick: !sc || sc.scrollHeight - sc.scrollTop - sc.clientHeight < 120 || msg.senderId === R.current.meId };
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      // Je REGARDE cette conversation : mon compteur non-lu retombe à 0.
      if (msg.senderId !== R.current.meId && R.current.viewingId === msg.conversationId) emitWithAck('chat:conversation:read', { conversationId: msg.conversationId }).catch(() => {});
    };
    const onUpdated = (msg: ChatMessage) => {
      if (msg.conversationId !== R.current.selId) return;
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
    };
    // Reconnexion réseau : recharge l'historique de la conversation ouverte.
    const onReconnect = () => { const id = R.current.selId; if (id) db.getMessages(id).then((ms) => { if (R.current.selId === id) setMessages(ms); }).catch(() => {}); };
    // Accusé de la boîte d'envoi : même traitement qu'une diffusion (dédoublonné par id).
    const onDelivered = (e: Event) => onNew((e as CustomEvent<ChatMessage>).detail);
    s.on('chat:message:new', onNew);
    s.on('chat:message:updated', onUpdated);
    window.addEventListener('gearbox-chat-reconnected', onReconnect);
    window.addEventListener('gearbox-chat-delivered', onDelivered);
    return () => { s.off('chat:message:new', onNew); s.off('chat:message:updated', onUpdated); window.removeEventListener('gearbox-chat-reconnected', onReconnect); window.removeEventListener('gearbox-chat-delivered', onDelivered); };
  }, [social]);

  // Heures relatives de la liste (« il y a 5min ») : une mise à jour par minute.
  useEffect(() => { const t = window.setInterval(() => setTick((n) => n + 1), 60000); return () => window.clearInterval(t); }, []);

  // --- ouverture d'une conversation : historique COMPLET (sans pagination, comme le serveur)
  useEffect(() => {
    if (!selId) { setMessages([]); setLoadedFor(null); return; }
    let vivant = true;
    setMessages([]); setLoadedFor(null);
    db.getMessages(selId).then((ms) => { if (vivant) { setMessages(ms); setLoadedFor(selId); } })
      .catch(() => { if (vivant) { setMessages([]); setLoadedFor(selId); } });   // 403 / 404 : fil vide silencieux
    return () => { vivant = false; };
  }, [selId]);
  // --- lu : dès qu'on REGARDE la conversation (le serveur remet le compteur à 0 et pose readAt)
  useEffect(() => { if (viewingId) emitWithAck('chat:conversation:read', { conversationId: viewingId }).catch(() => {}); }, [viewingId]);

  // --- conversation retirée (on m'a sorti d'un groupe) : le fil se referme
  const seenSel = useRef(false);
  useEffect(() => {
    if (!selId) { seenSel.current = false; return; }
    if (conv) { seenSel.current = true; return; }
    if (seenSel.current) { seenSel.current = false; setSelId(null); setAuto(true); setReply(null); setEditing(null); }
  }, [selId, conv]);

  // ================================================================ liste
  const order = useMemo(() => {
    const pin = (c: ChatConversation) => (pins.isPinned(c) ? 1 : 0);
    const s = (a: ChatConversation[]) => [...a].sort((x, y) => pin(y) - pin(x) || (y.lastMessageAt ?? '').localeCompare(x.lastMessageAt ?? ''));
    return {
      general: visible.filter((c) => c.type === 'general'),
      groups: s(visible.filter((c) => c.type === 'group')),
      dms: s(visible.filter((c) => c.type === 'private')),
    };
  }, [visible, pins]);
  const flat = useMemo(() => [...order.general, ...order.groups, ...order.dms], [order]);
  const nameOf = useCallback((c: ChatConversation) => convName(c, meId, byId), [meId, byId]);
  const unreadTotal = visible.reduce((n, c) => n + (c.unreadCounts?.[meId] ?? 0), 0);

  // --- sélection
  const select = useCallback((id: string | null, isAuto = false) => {
    if (!id) return;
    const c = chatStore.getConversations().find((x) => x.id === id);
    // Sécurité (Chat.tsx) : External ne voit pas le Général ; non-participant ne voit pas un privé / groupe.
    if (!c || (c.type === 'general' ? ext : !c.participants.includes(meId))) return;
    if (taRef.current && R.current.selId && !editing) drafts.current[R.current.selId] = taRef.current.value;
    if (id !== R.current.selId) { setReply(null); setEditing(null); setRenaming(null); setGifOpen(false); voice.cancel(); setText(drafts.current[id] || ''); }
    setSelId(id); setAuto(isAuto);
    win.setTitle('Chat', nameOf(c));
    if (!isAuto) setTimeout(() => taRef.current?.focus(), 120);
  }, [ext, meId, editing, nameOf, win, voice]);
  // Grand écran : la première conversation visible s'ouvre d'elle-même (Général, puis groupes, puis privés).
  useEffect(() => { if (!selId && !compact && flat.length) select(flat[0].id, true); }, [selId, compact, flat, select]);
  useEffect(() => { if (!conv) win.setTitle('Chat'); }, [!!conv]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- FLIP de la liste (épingle)
  const flip = useRef<Map<string, DOMRect> | null>(null);
  const capture = () => { flip.current = new Map([...(listRef.current?.querySelectorAll<HTMLElement>('[data-conv]') || [])].map((r) => [r.dataset.conv!, r.getBoundingClientRect()])); };
  useLayoutEffect(() => {
    const F = flip.current; if (!F || !listRef.current) return; flip.current = null;
    listRef.current.querySelectorAll<HTMLElement>('[data-conv]').forEach((r) => { const b = F.get(r.dataset.conv!); if (b) gx().flip(r, b, { spring: 'snappy' }); });
  }, [order]);

  // --- actions de conversation
  const toggleMute = useCallback((c: ChatConversation) => {
    // ⚠️ Par le SERVEUR (seul à décider du push), synchronisée entre appareils. Coupe le push, PAS le compteur.
    const muted = (c.mutedBy ?? []).includes(meId);
    emitWithAck('chat:conversation:mute', { conversationId: c.id, muted: !muted })
      .then(() => hud(muted ? 'Notifications réactivées' : 'Sourdine activée'))
      .catch(() => alertSheet('Échec de la mise en sourdine (serveur injoignable ?).'));
  }, [meId, alertSheet]);
  const togglePin = useCallback((c: ChatConversation) => { capture(); pins.toggle(c); }, [pins]);
  const markRead = (c: ChatConversation) => emitWithAck('chat:conversation:read', { conversationId: c.id }).catch(() => {});
  const markAllRead = () => visible.filter((c) => (c.unreadCounts?.[meId] ?? 0) > 0).forEach(markRead);

  const rowApi = useRef<RowApi>(null as any);
  rowApi.current = {
    select: (id) => select(id),
    mute: toggleMute,
    pin: togglePin,
    menu: (c, e) => {
      e.preventDefault(); const muted = (c.mutedBy ?? []).includes(meId), pinned = pins.isPinned(c), unread = c.unreadCounts?.[meId] ?? 0;
      gx().menu.open([{ label: 'Ouvrir', action: () => select(c.id) }, '-',
        { label: muted ? 'Réactiver les notifications' : 'Mettre en sourdine', icon: 'belloff', action: () => toggleMute(c) },
        { label: pinned ? 'Désépingler' : 'Épingler', icon: 'star', action: () => togglePin(c) },
        ...(unread ? [{ label: 'Marquer comme lu', icon: 'check', action: () => markRead(c) }] : [])], { x: e.clientX, y: e.clientY });
    },
  };
  const stableRowApi = useMemo<RowApi>(() => ({ select: (id) => rowApi.current.select(id), menu: (c, e) => rowApi.current.menu(c, e), mute: (c) => rowApi.current.mute(c), pin: (c) => rowApi.current.pin(c) }), []);

  // --- nouvelles conversations
  // Interlocuteurs : tout le monde sauf moi et sauf les rôles sans vie sociale (chef de site) — même liste pour
  // un privé, un groupe et l'ajout de membre (Chat.tsx). Le refus réel est côté serveur.
  const people = useMemo(() => users.filter((u) => u.id !== meId && hasSocialFeatures(u.role)), [users, meId]);
  const openDM = useCallback(async (uid: string) => {
    if (!meId || uid === meId) return;
    const existing = privateWith(chatStore.getConversations(), meId, uid);
    if (existing) { select(existing.id); return; }
    try {
      // Création REST (idempotente côté serveur) ; le serveur émet aussi `chat:conversation:created`.
      const c = await db.createConversation({ type: 'private', participants: [meId, uid] });
      chatStore.upsertConversation(c); select(c.id);
    } catch (e) { alertSheet(e instanceof ApiError ? e.message : 'Échec de la création de la conversation.'); }
  }, [meId, select, alertSheet]);
  const newDM = () => openSheet((close) => <NewDmSheet meId={meId} people={people} close={close} onPick={openDM} />);
  const newGroup = () => { if (ext) return; openSheet((close) => <NewGroupSheet meId={meId} people={people} close={close} onCreated={(c) => select(c.id)} />); };
  // External : « + » ouvre directement le message privé (il ne crée pas de groupe).
  const newMenu = (el: HTMLElement) => {
    if (ext) return newDM();
    gx().menu.open([{ header: 'Nouvelle conversation' }, { label: 'Message privé — Conversation 1-to-1', icon: 'message', action: newDM }, { label: 'Groupe de travail — 2 membres minimum', icon: 'users', action: newGroup }], el, { align: 'right' });
  };

  // --- en-tête de conversation
  const isAdmin = !!(conv?.type === 'group' && (conv.adminIds ?? []).includes(meId));
  const membersSheet = () => { if (conv?.type !== 'group') return; const id = conv.id; openSheet((close) => <MembersSheet convId={id} meId={meId} people={people} close={close} confirm={confirmSheet} alert={(t) => alertSheet(t)} />); };
  const paletteSheet = () => { if (!conv || conv.type === 'general') return; const id = conv.id; openSheet((close) => <PaletteSheet convId={id} meId={meId} sombre={sombre} close={close} />, { width: 560 }); };
  const photoSheet = () => { if (conv?.type !== 'group') return; const id = conv.id; openSheet((close) => <GroupPhotoSheet convId={id} meId={meId} close={close} />, { width: 420 }); };
  // Un seul envoi par renommage : Entrée puis la perte de focus qui suit ne doivent pas écrire deux fois.
  const renDone = useRef(true);
  const startRename = () => { if (conv && isAdmin) { renDone.current = false; setRenaming(nameOf(conv)); } };
  const commitRename = async (ok: boolean) => {
    if (renDone.current) return; renDone.current = true;
    const v = (renaming ?? '').trim(), c = conv; setRenaming(null);
    if (!ok || !c || !v || v === nameOf(c)) return;
    try { chatStore.upsertConversation(await emitWithAck<ChatConversation>('chat:conversation:rename', { conversationId: c.id, name: v })); }
    catch (e) { alertSheet(e instanceof Error && e.message ? e.message : 'Renommage impossible.'); }
  };
  const convMenu = (el: HTMLElement) => {
    if (!conv) return; const muted = (conv.mutedBy ?? []).includes(meId), pinned = pins.isPinned(conv);
    gx().menu.open([
      ...(conv.type === 'group' ? [{ label: 'Membres…', icon: 'users', action: membersSheet }] : []),
      ...(conv.type !== 'general' ? [{ label: 'Personnaliser la discussion…', icon: 'sliders', action: paletteSheet }] : []),
      { label: muted ? 'Réactiver les notifications' : 'Mettre en sourdine', icon: 'belloff', action: () => toggleMute(conv) },
      { label: pinned ? 'Désépingler' : 'Épingler', icon: 'star', action: () => togglePin(conv) },
    ], el, { align: 'right' });
  };

  // ================================================================ envoi
  /** `piece` porte le nom et le poids d'origine (le fichier sur le serveur est renommé en uuid). */
  const sendMessage = useCallback((content: string, type: 'text' | 'image' | 'file' | 'audio' | 'project' = 'text', piece?: { fileName: string; fileSize: number }) => {
    const id = R.current.selId; if (!id || !content.trim()) return;
    const replyToId = R.current.reply?.id; setReply(null);
    // Boîte d'envoi : affiché tout de suite, renvoyé si la connexion lâche (services/chatOutbox.ts).
    sendChatMessage(id, content, type, { replyToId, ...piece });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const grow = () => { const ta = taRef.current; if (!ta) return; ta.style.height = 'auto'; ta.style.height = `${Math.min(130, ta.scrollHeight)}px`; };
  useLayoutEffect(grow, [text, selId]);

  const submit = () => {
    const t = text.trim();
    if (editing) {
      const m = editing; setEditing(null); setText(drafts.current[selId || ''] || '');
      if (t && t !== m.content) emitWithAck('chat:message:edit', { messageId: m.id, content: t }).catch(fail('Échec de la modification.'));
      return;
    }
    if (!t) return;
    sendMessage(text); setText(''); if (selId) drafts.current[selId] = '';
  };
  const startEdit = useCallback((m: ChatMessage) => {
    if (!estModifiable(m, meId)) return;
    if (!editing && selId) drafts.current[selId] = taRef.current?.value ?? text;
    setEditing(m); setReply(null); setText(m.content);
    setTimeout(() => { const ta = taRef.current; if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }, 0);
  }, [meId, editing, selId, text]);
  const cancelBanner = () => { setReply(null); if (editing) { setEditing(null); setText(drafts.current[selId || ''] || ''); } };

  // --- pièces jointes : upload préalable puis le message transporte l'URL (tous formats, 100 Mo)
  const attach = async (f: File) => {
    if (f.size > MAX_UPLOAD_SIZE) return alertSheet(`Fichier trop lourd (max ${MAX_UPLOAD_SIZE / 1024 / 1024} Mo).`);
    // Un fichier vide passerait le contrôle de taille mais produirait un message inutilisable.
    if (f.size === 0) return alertSheet('Fichier vide.');
    const id = R.current.selId; if (!id) return;
    const replyToId = R.current.reply?.id; setReply(null);
    // Boîte d'envoi : aperçu immédiat, progression, photo réduite si grosse, renvoi si la connexion lâche.
    sendChatFile(id, f, CHAT_IMAGE_TYPES.includes(f.type) ? 'image' : 'file', { replyToId });
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const f = Array.from(e.clipboardData.files as FileList)[0];
    if (f) { e.preventDefault(); attach(f); return; }
    // Le clavier GIF de Windows colle un CHEMIN LOCAL (file:///…) : il ne désigne rien chez les autres.
    const t = e.clipboardData.getData('text/plain');
    if (t && estCheminLocalImage(t)) {
      e.preventDefault();
      alertSheet('Ce GIF est un fichier enregistré sur ton ordinateur, pas un lien : collé tel quel, personne d’autre ne pourrait le voir.',
        'Utilise le bouton image (ou glisse le fichier dans la conversation) pour l’envoyer vraiment.');
    }
  };
  const sendVoice = async () => {
    const r = await voice.take(); if (!r) { voice.cancel(); return; }
    voice.cancel();
    // Même chemin que les pièces jointes (boîte d'envoi) ; durée dans `fileName`.
    const id = R.current.selId; if (id) sendChatFile(id, r.file, 'audio', { fileName: r.duree });
  };
  const quoteProject = () => { if (ext) return; openSheet((close) => <QuoteProjectSheet close={close} onPick={(p) => sendMessage(p.id, 'project')} />, { width: 520 }); };
  const plusMenu = (el: HTMLElement) => gx().menu.open([
    { label: 'Image', icon: 'image', action: () => imgRef.current?.click() },
    { label: 'Fichier', icon: 'paperclip', action: () => fileRef.current?.click() },
    ...(gifDispo ? [{ label: 'GIF animé', icon: 'smile', action: () => setGifOpen(true) }] : []),
    ...(ext ? [] : [{ label: 'Citer un projet', icon: 'projects', action: quoteProject }]),
  ], el);

  // --- panneau GIF : se ferme au clic ailleurs et sur Échap
  useEffect(() => {
    if (!gifOpen) return;
    const root = rootRef.current; if (!root) return;
    const away = (e: Event) => { const t = e.target as HTMLElement; if (!t.closest?.('[data-gifs],[data-gifbtn]')) setGifOpen(false); };
    root.addEventListener('pointerdown', away, true);
    return () => root.removeEventListener('pointerdown', away, true);
  }, [gifOpen]);

  // ================================================================ messages
  const react = useCallback((m: ChatMessage, e: string) => {
    // Bascule gérée par le serveur ; mise à jour reçue via `chat:message:updated`.
    emitWithAck('chat:message:react', { messageId: m.id, emoji: e }).catch(fail('Échec de la réaction.'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const del = (m: ChatMessage) => confirmSheet('Supprimer ce message ?', 'Il est remplacé par « Message supprimé » chez tous les membres.', 'Supprimer',
    () => emitWithAck('chat:message:delete', { messageId: m.id }).catch(fail('Échec de la suppression.')));
  const msgApiRef = useRef<MsgApi>(null as any);
  msgApiRef.current = {
    react,
    reply: (m) => { setReply(m); setEditing(null); taRef.current?.focus(); },
    edit: startEdit,
    goto: (id) => {
      const t = scRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`); if (!t) return;
      t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.remove('cht-flash'); void t.offsetWidth; t.classList.add('cht-flash');
    },
    image: (src, m, el) => {
      const esc = gx().esc, who = m.senderId === meId ? 'vous' : (byId[m.senderId]?.name || m.senderName);
      gx().shell?.quickLook?.({ title: m.type === 'image' ? (m.fileName || 'Image') : 'GIF', origin: el, html: `<img src="${esc(src)}" alt="" style="max-width:100%;border-radius:12px;display:block" /><div class="faint" style="margin-top:8px;font-size:12px">Envoyée par ${esc(who)} · ${esc(hhmm(m.timestamp))}</div>` });
    },
    menu: (m, at) => {
      if (m.deleted) return;
      const mine = m.senderId === meId;
      gx().menu.open([{ header: 'Réagir' }, ...REACTIONS.map((e) => ({ label: `${e}  ${REACTION_LABELS[e]}`, checked: (m.reactions?.[e] || []).includes(meId), action: () => react(m, e) })), '-',
        { label: 'Répondre', icon: 'back', action: () => msgApiRef.current.reply(m) },
        ...(m.type === 'text' && !imageDistante(m) ? [{ label: 'Copier le texte', icon: 'copy', action: () => { try { navigator.clipboard?.writeText(m.content); } catch { /* refusé */ } hud('Texte copié'); } }] : []),
        ...(mine ? ['-', ...(estModifiable(m, meId) ? [{ label: 'Modifier', icon: 'edit', action: () => startEdit(m) }] : []), { label: 'Supprimer', icon: 'trash', action: () => del(m) }] : [])], at);
    },
  };
  const msgApi = useMemo<MsgApi>(() => ({
    react: (m, e) => msgApiRef.current.react(m, e), reply: (m) => msgApiRef.current.reply(m), menu: (m, at) => msgApiRef.current.menu(m, at),
    edit: (m) => msgApiRef.current.edit(m), goto: (id) => msgApiRef.current.goto(id), image: (s, m, el) => msgApiRef.current.image(s, m, el),
  }), []);
  const msgCtx = useMemo<MsgCtx>(() => ({ meId, ext, byId }), [meId, ext, byId]);

  const outbox = useOutbox(selId);
  const msgById = useMemo(() => Object.fromEntries(messages.map((m) => [m.id, m])) as Record<string, ChatMessage>, [messages]);
  const days = useMemo(() => messages.reduce<DayGroup[]>((acc, m) => {
    const label = dayLabel(m.timestamp), last = acc[acc.length - 1];
    if (last && last.label === label) last.msgs.push(m); else acc.push({ key: `${label}-${m.id}`, label, msgs: [m] });
    return acc;
  }, []), [messages]);

  /**
   * « Vu par » sous le DERNIER message non supprimé : lecteurs = membres dont `readAt` (horloge serveur)
   * dépasse son horodatage, hors auteur et hors moi. Général = comptes ayant le chat, sauf External.
   */
  const members = useMemo(() => (conv ? membersOf(conv, users, byId) : []), [conv, users, byId]);
  const vuPar = useMemo(() => {
    if (!conv) return null;
    const dernier = [...messages].reverse().find((m) => !m.deleted); if (!dernier) return null;
    const cand = members.filter((u) => u.id !== dernier.senderId && u.id !== meId); if (!cand.length) return null;
    const lu = conv.readAt ?? {}, t = +new Date(dernier.timestamp);
    const lecteurs = cand.filter((u) => lu[u.id] && +new Date(lu[u.id]) >= t); if (!lecteurs.length) return null;
    const noms = lecteurs.map((u) => u.name);
    const libelle = lecteurs.length === cand.length && cand.length > 1 ? 'Vu par tout le monde'
      : lecteurs.length > VU_PAR_MAX_NOMS ? `Vu par ${lecteurs.length} personnes` : `Vu par ${noms.join(', ')}`;
    return { libelle, noms, aMoi: dernier.senderId === meId };
  }, [conv, messages, members, meId]);

  // --- défilement : en bas à l'ouverture ; à l'arrivée d'un message si on était en bas (ou si c'est le mien)
  const pendingScroll = useRef<{ id: string; stick: boolean } | null>(null);
  useLayoutEffect(() => { const sc = scRef.current; if (sc && loadedFor) sc.scrollTop = sc.scrollHeight; }, [loadedFor, viewing]);
  useLayoutEffect(() => {
    const P = pendingScroll.current, sc = scRef.current; if (!P || !sc) return; pendingScroll.current = null;
    if (P.stick) sc.scrollTop = sc.scrollHeight;
    const el = sc.querySelector<HTMLElement>(`[data-id="${P.id}"]`), b = el?.querySelector<HTMLElement>('.cht-bwrap') || el;
    if (el && b) { b.style.transformOrigin = el.classList.contains('me') ? '100% 100%' : '0 100%'; gx().animate(b, [{ opacity: 0, transform: 'translateY(16px) scale(.86)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy' }); }
  }, [messages]);

  // ================================================================ clavier de la saisie
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any).isComposing) { e.preventDefault(); submit(); return; }
    if (e.key === 'Escape' && (reply || editing)) { e.stopPropagation(); cancelBanner(); return; }
    if (e.key === 'Escape' && gifOpen) { e.stopPropagation(); setGifOpen(false); return; }
    if (e.key === 'ArrowUp' && !text) {
      const mine = [...messages].reverse().find((m) => estModifiable(m, meId));
      if (mine) { e.preventDefault(); startEdit(mine); }
    }
  };

  // ================================================================ barre du haut, commandes
  inst.command = (c: string) => {
    if (typeof c !== 'string') return;
    if (c.startsWith('conv:')) select(c.slice(5));
    if (c.startsWith('dm:')) openDM(c.slice(3));
    if (c === 'new-dm') newDM();
    if (c === 'new-group') newGroup();
  };
  inst.menus = () => ({
    'Fichier': [{ label: 'Nouveau message privé…', icon: 'message', action: newDM }, ...(ext ? [] : [{ label: 'Nouveau groupe de travail…', icon: 'users', action: newGroup }])],
    'Conversation': conv ? [
      ...(conv.type !== 'general' ? [{ label: 'Personnaliser la discussion…', icon: 'sliders', action: paletteSheet }] : []),
      ...(conv.type === 'group' ? [{ label: 'Membres…', icon: 'users', action: membersSheet }, { label: 'Renommer le groupe', icon: 'edit', disabled: !isAdmin, action: startRename }] : []),
      { label: 'Sourdine', checked: (conv.mutedBy ?? []).includes(meId), action: () => toggleMute(conv) },
      { label: 'Épinglée', checked: pins.isPinned(conv), action: () => togglePin(conv) }, '-',
      { label: 'Tout marquer comme lu', icon: 'check', disabled: !unreadTotal, action: markAllRead },
    ] : [],
  });

  // ================================================================ rendu
  if (!social) {
    return <div className="app"><div className="app-body"><div className="empty" style={{ height: '100%' }}><Icon name="chat" /><b style={{ color: 'var(--text)' }}>Chat indisponible</b>Le Chat n’est pas ouvert à ce rôle.</div></div></div>;
  }

  const s = qd.trim().toLowerCase();
  const has = (c: ChatConversation) => !s || nameOf(c).toLowerCase().includes(s) || (c.type !== 'private' && c.type !== 'general' && c.participants.some((p) => (byId[p]?.name || '').toLowerCase().includes(s)));
  const selRow = compact ? null : selId;
  const rows = (arr: ChatConversation[], none: string) => {
    const L = arr.filter(has);
    return L.length ? L.map((c) => <Row key={c.id} c={c} sel={c.id === selRow} pinned={pins.isPinned(c)} name={nameOf(c)} meId={meId} byId={byId} online={online} tick={tick} api={stableRowApi} />)
      : <div className="cht-none">{s ? 'Aucun résultat' : none}</div>;
  };
  const gFiltered = order.general.filter(has), grN = order.groups.filter(has).length, dmN = order.dms.filter(has).length;
  const side = (
    <div className="cht-side">
      <div className="app-head"><div className="ah-t"><span className="ah-eye">Communauté</span><h1>Chat</h1></div>
        <div className="ah-f"><button className="btn primary sm" data-tip="Nouvelle conversation" aria-label="Nouvelle conversation" onClick={(e) => newMenu(e.currentTarget)}><Icon name="plus" size="sm" /></button></div></div>
      <div className="cht-lhead"><label className="search"><Icon name="search" size="sm" /><input placeholder="Rechercher" aria-label="Rechercher une conversation" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
      <div className="cht-list scroll" ref={listRef}>
        {/* Général : jamais pour l'External. */}
        {!ext && gFiltered.length ? <><div className="cht-sec">Général</div>{rows(order.general, '')}</> : null}
        <div className="cht-sec">Groupes{grN ? <> <span>({grN})</span></> : null}</div>{rows(order.groups, 'Aucun groupe')}
        <div className="cht-sec">Messages Privés{dmN ? <> <span>({dmN})</span></> : null}</div>{rows(order.dms, 'Aucune conversation privée')}
      </div>
    </div>
  );

  // --- conversation
  let convView: React.ReactNode;
  if (!conv) {
    convView = <div className="empty" style={{ height: '100%' }}><Icon name="chat" /><b style={{ color: 'var(--text)' }}>Sélectionne une conversation</b>Choisissez une conversation ou créez-en une avec « + »</div>;
  } else {
    const n = members.length, shown = members.slice(0, 5);
    const sub = conv.type === 'private' ? 'Conversation privée' : `${n} membre${n > 1 ? 's' : ''}`;
    // Le Chat Général n'a JAMAIS de thème, même si une valeur traînait en base.
    const themed = conv.type !== 'general';
    const wall = themed ? styleFondChat(conv.background ?? null, sombre) : {};
    const aUnFond = Object.keys(wall).length > 0;
    const bulle = bulleDe(themed ? conv.bubble : null);
    const vars = { '--cht-me': bulle.css, ...(bulle.texteSombre ? { '--cht-me-fg': '#0f172a', '--cht-me-ts': 'none' } : {}) } as React.CSSProperties;
    const banner = editing || reply;
    const bannerName = banner ? (banner.senderId === meId ? 'vous-même' : (byId[banner.senderId]?.name || banner.senderName)) : '';
    const recOn = voice.state !== 'idle';
    const head = (
      <div className="cht-head">
        {conv.type === 'group'
          ? <button className="cht-gbtn" data-tip="Changer la photo du groupe" aria-label="Changer la photo du groupe" onClick={photoSheet}><ConvAv c={conv} meId={meId} byId={byId} online={online} size="sm" /></button>
          : <ConvAv c={conv} meId={meId} byId={byId} online={online} size="sm" />}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="nm">{renaming !== null
            ? <input className="input cht-rename" autoFocus value={renaming} aria-label="Nom du groupe" onFocus={(e) => e.currentTarget.select()} onChange={(e) => setRenaming(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(true); if (e.key === 'Escape') { e.stopPropagation(); commitRename(false); } }} onBlur={() => commitRename(true)} />
            : <><span className="ellipsis">{nameOf(conv)}</span>{isAdmin ? <button className="icon-btn sm" data-tip="Renommer le groupe" aria-label="Renommer le groupe" onClick={startRename}><Icon name="edit" size="sm" /></button> : null}</>}</div>
          <div className="sub">{sub}</div>
        </div>
        <span className="av-stack">{shown.map((u) => <UserAv key={u.id} u={u} cls="sm" online={online.has(u.id)} />)}{n > 5 ? <span className="av sm" style={{ '--c': 'var(--surface-4)', color: 'var(--text-2)' } as React.CSSProperties}>+{n - 5}</span> : null}</span>
        {conv.type === 'group' ? <button className="btn sm" data-tip="Membres du groupe" onClick={membersSheet}><Icon name="users" size="sm" /><span className="cht-hl">Membres</span></button> : null}
        {themed ? <button className="icon-btn" data-tip="Personnaliser la discussion" aria-label="Personnaliser la discussion" onClick={paletteSheet}><Icon name="sliders" /></button> : null}
        <button className="icon-btn" data-tip="Options" aria-label="Options" onClick={(e) => convMenu(e.currentTarget)}><Icon name="more" /></button>
      </div>
    );
    convView = (
      <div className="cht-conv" style={vars}>
        {head}
        <div className="cht-pane">
          {aUnFond ? <div className="cht-wall" style={wall} /> : null}
          <div className="cht-scroll scroll" ref={scRef}>
            <div className="cht-msgs">
              {days.map((d) => (
                <React.Fragment key={d.key}>
                  <div className="cht-day"><span>{d.label}</span></div>
                  {d.msgs.map((m, i) => (
                    <Msg key={m.id} m={m} parent={m.replyToId ? msgById[m.replyToId] || null : null} first={!same(d.msgs[i - 1], m)} last={!same(m, d.msgs[i + 1])} ctx={msgCtx} api={msgApi} />
                  ))}
                </React.Fragment>
              ))}
              {outbox.map((o) => <PendingMsg key={o.clientId} o={o} />)}
              {loadedFor === conv.id && !messages.length && !outbox.length ? <div className="empty" style={{ marginTop: 40 }}><Icon name="chat" /><b style={{ color: 'var(--text)' }}>Aucun message</b>Dites bonjour 👋</div> : null}
              {vuPar ? <div className={`cht-seen ${vuPar.aMoi ? 'me' : ''}`} data-tip={vuPar.noms.join(', ')}><Icon name="check" size="sm" />{vuPar.libelle}</div> : null}
            </div>
          </div>
        </div>
        <div className="cht-compose">
          {gifOpen && gifDispo ? <GifPanel onPick={(url) => { setGifOpen(false); sendMessage(url); }} /> : null}
          <div>{banner ? (
            <div className="cht-banner"><Icon name={editing ? 'edit' : 'back'} size="sm" />
              <div className="grow" style={{ minWidth: 0 }}><b>{editing ? 'Modifier le message' : `Réponse à ${bannerName}`}</b><div className="ellipsis faint">{resumeMessage(banner, workspace.getState().byId, 80)}</div></div>
              <button className="icon-btn sm" data-tip={editing ? 'Annuler (Échap)' : 'Annuler la réponse'} aria-label={editing ? 'Annuler la modification' : 'Annuler la réponse'} onClick={cancelBanner}><Icon name="close" size="sm" /></button></div>
          ) : null}</div>
          <div className={`cht-bar ${recOn ? 'hide' : ''}`}>
            <button className="icon-btn cht-plus" data-tip="Joindre, GIF, citer un projet…" aria-label="Plus d’actions" onClick={(e) => plusMenu(e.currentTarget)}><Icon name="plus" /></button>
            <button className="icon-btn opt" data-tip="Envoyer une image" aria-label="Envoyer une image" onClick={() => imgRef.current?.click()}><Icon name="image" /></button>
            <button className="icon-btn opt" data-tip="Joindre un fichier (tous formats, max 100 Mo)" aria-label="Joindre un fichier" onClick={() => fileRef.current?.click()}><Icon name="paperclip" /></button>
            {gifDispo ? <button className={`icon-btn opt cht-giftxt ${gifOpen ? 'on' : ''}`} data-gifbtn data-tip="Envoyer un GIF" onClick={() => setGifOpen((v) => !v)}>GIF</button> : null}
            <button className="icon-btn" data-tip="Message vocal" aria-label="Message vocal" onClick={() => voice.start()}><Icon name="mic" /></button>
            {ext ? null : <button className="icon-btn opt" data-tip="Citer un projet" aria-label="Citer un projet" onClick={quoteProject}><Icon name="projects" /></button>}
            <div className="cht-input"><textarea ref={taRef} rows={1} value={text} placeholder={compact ? 'Écrire un message…' : 'Écrire un message… (Entrée pour envoyer)'}
              onChange={(e) => { setText(e.target.value); if (!editing && selId) drafts.current[selId] = e.target.value; }} onKeyDown={onKey} onPaste={onPaste} /></div>
            <button className="cht-send" data-tip={sending ? 'Envoi…' : 'Envoyer'} aria-label="Envoyer" disabled={!text.trim()} onClick={submit}><Icon name="arrowup" /></button>
          </div>
          {recOn ? (
            <div className="cht-rec">
              <button className="icon-btn" data-tip="Annuler" aria-label="Annuler l’enregistrement" onClick={() => voice.cancel()}><Icon name="trash" /></button>
              {voice.state === 'error' ? <><span className="grow" style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 600 }}>{voice.error}</span><button className="btn sm" onClick={() => voice.cancel()}>Fermer</button></> : <>
                <i className="dot" style={voice.state === 'done' ? { animation: 'none', opacity: .5 } : undefined} /><b className="num">{formatDuree(voice.secs)}</b>
                <div className="cht-recwave">{voice.state === 'rec' ? Array.from({ length: 48 }, (_, i) => <i key={i} style={{ animationDelay: `${-((i * 137) % 900)}ms`, animationDuration: `${600 + ((i * 53) % 500)}ms` }} />) : null}</div>
                <span className="faint" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{voice.state === 'done' ? 'Enregistrement terminé (5 min max)' : 'Enregistrement… (5 min max)'}</span>
                <button className="cht-send" data-tip="Envoyer" aria-label="Envoyer le message vocal" onClick={sendVoice}><Icon name="arrowup" /></button></>}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="app" ref={rootRef}>
      {compact
        // BESOIN: `Stack` sans en-tête personnalisable — l'en-tête de conversation reste dans la page (BESOINS.md § 3).
        ? <Stack onBack={() => setAuto(true)} pages={[{ key: 'list', title: 'Chat', noHead: true, content: side }, ...(conv && !auto ? [{ key: conv.id, title: '', content: convView }] : [])]} />
        : <div className="app-body"><div className="split" style={{ '--side-w': 'clamp(270px,28%,360px)' } as React.CSSProperties}><div className="side">{side}</div><div className="main">{convView}</div></div></div>}
      <input ref={imgRef} type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); e.target.value = ''; }} />
      <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); e.target.value = ''; }} />
      {portals}
    </div>
  );
}
