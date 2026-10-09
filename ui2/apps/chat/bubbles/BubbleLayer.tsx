import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChatMessage, User } from '../../../../types';
import type { EngineWin } from '../../types';
import { hasSocialFeatures } from '../../../../constants';
import { useAuth } from '../../../../contexts/AuthContext';
import { getSocket, connectSocket } from '../../../../services/socket';
import { chatStore } from '../../../../services/chatStore';
import { usePresence } from '../../../../services/presenceStore';
import { useWorkspace } from '../../../store/workspace';
import { gx, Icon } from '../../ui/kit';
import { useChatConvs, ConvAv, convName } from '../common';
import Conversation from '../Conversation';
import { BubbleField } from './physics';

// =====================================================================
// BULLES DE DISCUSSION (09/10/2026, PLAN-BULLES.md) — façon Messenger Android, sur ORDINATEUR seulement.
//
// Décisions de Théo : apparition AUTOMATIQUE à chaque message reçu (réglage pour la couper dans Réglages ›
// Notifications) ; bureau seulement ; volet IDENTIQUE au Chat (c'est le même composant, Conversation.tsx) ;
// physique « Apple » réglée sur la planche maquettes/ux/bulles.html.
//
// Règles :
//  - aucune bulle pour un message À SOI, une conversation EN SOURDINE, ou quand la fenêtre Chat est au premier plan ;
//  - rôles : ceux qui ont la rubrique Chat (`GX.shell.canOpen('chat')`) et une vie sociale (pas le chef de site) ;
//  - les envois passent par la boîte d'envoi (dans Conversation.tsx), jamais en direct ;
//  - position et bulles ouvertes : préférence de CE navigateur (`GX.store`), rien sur le serveur.
// =====================================================================

const SIZE = 50, MAX = 5;
const KEY = 'bubbles';

export default React.memo(function BubbleLayer() {
  const { user } = useAuth();
  const meId = user?.id || '', role = user?.role || '', ext = role === 'External';
  const G = gx();

  // --- actif ? (bureau, réglage, rôle) — réévalué quand un réglage change
  const calc = useCallback(() => !!user && hasSocialFeatures(role) && G?.host?.dataset?.shell === 'desktop'
    && G?.shell?.prefs?.bubbles !== false && !!G?.shell?.canOpen?.('chat'), [user, role, G]);
  const [enabled, setEnabled] = useState(calc);
  useEffect(() => { setEnabled(calc()); const off = G?.on?.('prefs', () => setEnabled(calc())); return () => { off?.(); }; }, [calc, G]);

  // --- couche (dans la racine fantôme : elle hérite de la feuille de la coque)
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const body = G?.root?.querySelector('.gx-body') as HTMLElement | null; if (!body) return;
    const el = document.createElement('div'); el.className = 'gxb-layer'; body.append(el); setLayer(el);
    return () => { el.remove(); setLayer(null); };
  }, [enabled, G]);

  const [ids, setIds] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [rect, setRect] = useState<ReturnType<BubbleField['panelRect']> | null>(null);
  const fieldRef = useRef<BubbleField | null>(null);
  const openRef = useRef(open); openRef.current = open;

  const save = useCallback(() => {
    const f = fieldRef.current; if (!f) return;
    const prev = G.store.get(KEY, {}) || {};
    G.store.set(KEY, { ...prev, ids: f.ids() });
  }, [G]);

  // --- le champ de bulles
  useEffect(() => {
    if (!layer) return;
    const f = new BubbleField(layer, {
      size: SIZE, max: MAX,
      bounds: () => {
        const mb = G.root.querySelector('#menubar') as HTMLElement | null;
        const top = mb && !mb.classList.contains('hidden') && !G.host.hasAttribute('data-mbauto') ? mb.getBoundingClientRect().bottom + 8 : 12;
        return { top, bottom: innerHeight - (G.shell?.dockReserve?.() || 0) - 16 };
      },
      calm: () => !!G.eco?.() || (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })(),
      onTap: (id) => setOpen((o) => (o === id ? null : id)),
      onDismiss: (gone) => { setIds(f.ids()); setOpen((o) => (o && gone.includes(o) ? (f.ids()[0] ?? null) : o)); save(); },
      onMoved: (side, y) => { const prev = G.store.get(KEY, {}) || {}; G.store.set(KEY, { ...prev, side, y }); },
    });
    fieldRef.current = f;
    // Rétablit la position et les bulles de la session précédente (préférence de ce navigateur).
    const st = G.store.get(KEY, {}) || {};
    f.restore(st.side === -1 ? -1 : 1, typeof st.y === 'number' ? st.y : 140);
    const visibles = new Set(chatStore.getConversations().map((c) => c.id));
    ([...(st.ids || [])] as string[]).reverse().filter((id) => visibles.has(id)).forEach((id) => f.receive(id));
    setIds(f.ids());
    return () => { f.destroy(); fieldRef.current = null; setIds([]); setOpen(null); };
  }, [layer]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- arrivée d'un message
  useEffect(() => {
    if (!layer) return;
    const s = getSocket() ?? connectSocket(); if (!s) return;
    const onNew = (m: ChatMessage) => {
      const f = fieldRef.current; if (!f || m.senderId === meId) return;
      const c = chatStore.getConversations().find((x) => x.id === m.conversationId);
      if (!c || (c.type === 'general' ? ext : !c.participants.includes(meId))) return;
      if ((c.mutedBy ?? []).includes(meId)) return;                                    // sourdine : jamais de bulle
      const w = G.wm?.active?.();
      if (w && (w.app?.parent || w.appId) === 'chat' && !w.min && document.hasFocus()) return;   // le Chat est déjà sous les yeux
      if (f.receive(c.id)) { setIds(f.ids()); save(); }
    };
    s.on('chat:message:new', onNew);
    return () => { s.off('chat:message:new', onNew); };
  }, [layer, meId, ext, G, save]);

  // --- conversations disparues (sortie d'un groupe) : leur bulle s'en va
  const convs = useChatConvs();
  useEffect(() => {
    const f = fieldRef.current; if (!f) return;
    const ok = new Set(convs.filter((c) => (c.type === 'general' ? !ext : c.participants.includes(meId))).map((c) => c.id));
    const gone = f.ids().filter((id) => !ok.has(id));
    if (convs.length && gone.length) { gone.forEach((id) => f.remove(id)); setIds(f.ids()); if (openRef.current && gone.includes(openRef.current)) setOpen(null); save(); }
  }, [convs, ext, meId, save]);

  // --- volet : ouvert / fermé, position
  useEffect(() => {
    const f = fieldRef.current; if (!f) return;
    f.setOpen(open); setRect(open ? f.panelRect() : null);
    if (!open) return;
    const onResize = () => setRect(fieldRef.current?.panelRect() ?? null);
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, [open]);
  // Échap ou clic en dehors (ni bulle, ni volet, ni menu, ni volet modal) : le volet se referme.
  useEffect(() => {
    if (!open || !G?.root) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !G.root.querySelector('.gxb-panel .sheet')) setOpen(null); };
    const away = (e: Event) => {
      const t = e.composedPath()[0] as HTMLElement | undefined;
      if (!t?.closest || t.closest('.gxb, .gxb-panel, .menu, .gx-ql, .quicklook, .tip')) return;
      setOpen(null);
    };
    addEventListener('keydown', onKey); G.root.addEventListener('pointerdown', away, true);
    return () => { removeEventListener('keydown', onKey); G.root.removeEventListener('pointerdown', away, true); };
  }, [open, G]);

  // --- volets modaux (confirmation, membres, personnalisation…) : posés DANS le volet de la bulle
  const panelRef = useRef<HTMLDivElement>(null);
  const win = useMemo<EngineWin>(() => ({
    params: {}, setTitle: () => {},
    sheet: (html, o) => (panelRef.current ? G.ui.sheet(panelRef.current, html, o) : null),
  }), [G]);

  const users = useWorkspace((s) => s.users);
  const byId = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])) as Record<string, User>, [users]);
  const presence = usePresence(meId);
  const online = useMemo(() => new Set(Object.values(presence).flat().map((p) => p.userId)), [presence]);

  if (!enabled || !layer) return null;
  const f = fieldRef.current;
  const openInChat = (id: string) => { setOpen(null); G.shell?.openWith?.('chat', 'conv:' + id); };
  const openConv = open ? convs.find((c) => c.id === open) : null;

  return (
    <>
      {ids.map((id) => {
        const el = f?.el(id), c = convs.find((x) => x.id === id); if (!el || !c) return null;
        const n = c.unreadCounts?.[meId] ?? 0, name = convName(c, meId, byId);
        el.setAttribute('aria-label', `${name}${n ? ` (${n} non lu${n > 1 ? 's' : ''})` : ''}`); el.dataset.tip = name;
        return createPortal(<>
          <span className="gxb-av"><ConvAv c={c} meId={meId} byId={byId} online={online} /></span>
          {n && open !== id ? <span className="gxb-cnt">{n > 99 ? '99+' : n}</span> : null}
        </>, el, id);
      })}
      {openConv && rect ? createPortal(
        <div className={`gxb-panel ${rect.side > 0 ? 'r' : 'l'}`} ref={panelRef} role="dialog" aria-label={convName(openConv, meId, byId)}
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
          <div className="app">
            <Conversation key={openConv.id} convId={openConv.id} win={win} viewing compact
              headExtra={<>
                <button className="icon-btn" data-tip="Ouvrir dans Chat" aria-label="Ouvrir dans Chat" onClick={() => openInChat(openConv.id)}><Icon name="maximize" /></button>
                <button className="icon-btn" data-tip="Réduire (Échap)" aria-label="Réduire" onClick={() => setOpen(null)}><Icon name="close" /></button>
              </>} />
          </div>
        </div>, layer) : null}
    </>
  );
});
