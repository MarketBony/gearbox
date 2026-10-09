import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { ChatConversation, User } from '../../../types';
import { hasSocialFeatures } from '../../../constants';
import { useAuth } from '../../../contexts/AuthContext';
import { db, ApiError } from '../../../services/dataService';
import { getSocket, connectSocket, emitWithAck } from '../../../services/socket';
import { chatStore } from '../../../services/chatStore';
import { usePresence } from '../../../services/presenceStore';
import { useWorkspace } from '../../store/workspace';
import { gx, hud, Icon, Stack, useSheets, useCompact } from '../ui/kit';
import { relativeTime, convName, privateWith, useChatConvs, usePins, ConvAv } from './common';
import { AlertSheet, NewDmSheet, NewGroupSheet } from './sheets';
import Conversation, { type ConvHandle } from './Conversation';

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
// La CONVERSATION elle-même (fil, saisie, volets) vit dans Conversation.tsx depuis le 09/10/2026 : c'est le même
// composant que dans les bulles de discussion (ui2/apps/chat/bubbles/). Ici : la liste, la sélection, la création.
// Utilisateurs et projets cités : l'espace de travail (ui2/store/workspace.ts).
// Rien n'est inventé : la simulation de la maquette (« … écrit », réponses fictives) n'existe pas ici.
// =====================================================================

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

export default function ChatApp({ win, inst }: AppProps) {
  const { user } = useAuth();
  const meId = user?.id || '', role = user?.role || '';
  const ext = role === 'External';
  // Test partagé avec le serveur : le chef de site n'a aucune vie sociale (ni rubrique, ni socket).
  // Rubrique normalement inatteignable pour lui (navigation) ; si elle l'était, on n'appelle RIEN — l'API
  // REST du Chat Général ne l'exclut pas (défaut serveur relevé dans l'inventaire § 11).
  const social = !!user && hasSocialFeatures(role);

  const convs = useChatConvs();
  const users = useWorkspace((s) => s.users);
  const byId = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])) as Record<string, User>, [users]);
  const presence = usePresence(meId);
  const online = useMemo(() => new Set(Object.values(presence).flat().map((p) => p.userId)), [presence]);
  const pins = usePins(meId);
  const { open: openSheet, portals } = useSheets(win);

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const convHandle = useRef<ConvHandle | null>(null);
  const compact = useCompact(rootRef as React.RefObject<HTMLElement>, 760);

  const [selId, setSelId] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);          // sélection automatique (grand écran) : ne s'empile pas en étroit
  const [q, setQ] = useState('');
  const qd = useDeferredValue(q);
  const [tick, setTick] = useState(0);

  const visible = useMemo(() => convs.filter((c) => (c.type === 'general' ? !ext : c.participants.includes(meId))), [convs, ext, meId]);
  const conv = selId ? visible.find((c) => c.id === selId) ?? null : null;
  const viewing = !!conv && (!compact || !auto);

  const alertSheet = useCallback((title: string, body?: string) => { openSheet((close) => <AlertSheet title={title} body={body} close={close} />, { width: 400 }); }, [openSheet]);

  // ================================================================ chargement
  useEffect(() => {
    if (!social) return;
    getSocket() ?? connectSocket();     // idempotent
    // Refresh REST : le socket recharge aussi au connect ; ceci garantit le chargement en arrivant directement ici.
    db.getConversations().then((c) => chatStore.setConversations(c)).catch(() => {});
    // Purge des photos de groupe base64 de l'ancien mécanisme local (bloc supprimable, comme Chat.tsx).
    try { Object.keys(localStorage).filter((k) => k.startsWith('gearbox_conv_avatar_')).forEach((k) => localStorage.removeItem(k)); } catch { /* stockage indisponible */ }
  }, [social]);

  // Heures relatives de la liste (« il y a 5min ») : une mise à jour par minute.
  useEffect(() => { const t = window.setInterval(() => setTick((n) => n + 1), 60000); return () => window.clearInterval(t); }, []);

  // --- conversation retirée (on m'a sorti d'un groupe) : le fil se referme
  const seenSel = useRef(false);
  useEffect(() => {
    if (!selId) { seenSel.current = false; return; }
    if (conv) { seenSel.current = true; return; }
    if (seenSel.current) { seenSel.current = false; setSelId(null); setAuto(true); }
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
    setSelId(id); setAuto(isAuto);
    win.setTitle('Chat', nameOf(c));
    if (!isAuto) setTimeout(() => convHandle.current?.focus(), 120);
  }, [ext, meId, nameOf, win]);
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

  // --- actions de conversation (liste)
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
    'Conversation': conv ? [...(convHandle.current?.menus() || []), '-', { label: 'Tout marquer comme lu', icon: 'check', disabled: !unreadTotal, action: markAllRead }] : [],
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

  const convView = conv
    ? <Conversation key={conv.id} convId={conv.id} win={win} viewing={viewing} compact={compact} onTogglePin={togglePin} handle={convHandle} />
    : <div className="empty" style={{ height: '100%' }}><Icon name="chat" /><b style={{ color: 'var(--text)' }}>Sélectionne une conversation</b>Choisissez une conversation ou créez-en une avec « + »</div>;

  return (
    <div className="app" ref={rootRef}>
      {compact
        // BESOIN: `Stack` sans en-tête personnalisable — l'en-tête de conversation reste dans la page (BESOINS.md § 3).
        ? <Stack onBack={() => setAuto(true)} pages={[{ key: 'list', title: 'Chat', noHead: true, content: side }, ...(conv && !auto ? [{ key: conv.id, title: '', content: convView }] : [])]} />
        : <div className="app-body"><div className="split" style={{ '--side-w': 'clamp(270px,28%,360px)' } as React.CSSProperties}><div className="side">{side}</div><div className="main">{convView}</div></div></div>}
      {portals}
    </div>
  );
}
