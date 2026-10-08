import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { canUseAssistant } from '../../../constants';
import { gx } from '../ui/kit';
import { Buddy } from './mascot';
import ChatPane from './ChatPane';

// =====================================================================
// mIAouss P1 (08/10/2026) — la MASCOTTE et son VOLET de discussion, consultables de partout.
//
// Décision de Théo : pas de fenêtre. On clique sur le petit chat (posé sur le Dock, ou perché sur la pilule du
// téléphone) et un petit volet s'ouvre au-dessus de lui ; il reste ouvert pendant qu'on travaille.
//
// Porte unique `GX.assistant` (le widget, la recherche et la mascotte passent tous par elle) :
//   GX.assistant.available · open(question?) · close() · toggle()
// Équipe marketing seulement (`canUseAssistant`) : pour les autres rôles, ni mascotte ni porte.
// =====================================================================

const W = 380;

function findTrack(): { host: HTMLElement; track: HTMLElement; mobile: boolean; hidden: () => boolean; watch: HTMLElement } | null {
  const G = gx(); const root: ShadowRoot | undefined = G?.root; if (!root) return null;
  const mobile = G.host?.dataset?.shell === 'mobile';
  if (mobile) {
    const pill = root.getElementById('mpill') as HTMLElement | null, mroot = root.getElementById('mroot') as HTMLElement | null;
    if (!pill || !mroot) return null;
    return { host: pill, track: pill, mobile, watch: mroot, hidden: () => mroot.classList.contains('pill-off') };
  }
  const wrap = root.getElementById('dockWrap') as HTMLElement | null, dock = root.getElementById('dock') as HTMLElement | null;
  if (!wrap || !dock) return null;
  return { host: wrap, track: dock, mobile, watch: wrap, hidden: () => wrap.classList.contains('hidden') };
}

const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export default React.memo(function MascotLayer() {
  const { user } = useAuth();
  const allowed = canUseAssistant(user?.role);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const buddyRef = useRef<any>(null);

  // --- couche (dans la racine fantôme : elle hérite de la feuille de la coque)
  useLayoutEffect(() => {
    if (!allowed) return;
    const G = gx(); const body = G?.root?.querySelector('.gx-body') as HTMLElement | null; if (!body) return;
    const el = document.createElement('div'); el.className = 'mia-layer'; body.append(el); setLayer(el);
    return () => { el.remove(); setLayer(null); };
  }, [allowed]);

  const place = useCallback(() => {
    const b = buddyRef.current, vw = innerWidth, vh = innerHeight;
    const r = b?.el?.getBoundingClientRect?.();
    if (!r || !r.width || r.top > vh) { setAnchor({ left: Math.max(12, vw - W - 24), bottom: 96 }); return; }   // piste rangée : coin bas droit
    setAnchor({ left: Math.round(Math.min(Math.max(12, r.left + r.width / 2 - W / 2), vw - W - 12)), bottom: Math.round(vh - r.top + 6) });
  }, []);

  const doOpen = useCallback((q?: string) => {
    const G = gx();
    if (typeof q === 'string' && q.trim()) G.assistantPending = q.trim();
    place(); setOpen(true); setTimeout(place, 450);   // recalé une fois le saut retombé
    buddyRef.current?.setListening(true);
    if (q) setTimeout(() => G.emit?.('assistant:ask'), 0);   // volet déjà ouvert : la question part tout de suite
  }, [place]);
  const doClose = useCallback(() => { setOpen(false); buddyRef.current?.setListening(false); }, []);

  // --- la mascotte sur sa piste
  useEffect(() => {
    if (!allowed) return;
    let buddy: any = null, mo: MutationObserver | null = null, mo2: MutationObserver | null = null, tries = 0, stop = false, offPrefs: any = null;
    const start = () => {
      if (stop) return;
      const t = findTrack();
      if (!t) { if (tries++ < 60) setTimeout(start, 250); return; }
      setMobile(t.mobile);
      const G = gx();
      buddy = new Buddy(t.host, t.track, {
        size: t.mobile ? 52 : 64, mobile: t.mobile,
        name: (user?.name || '').split(' ')[0],
        isHidden: t.hidden,
        isCalm: () => !!G.eco?.() || reducedMotion(),
        isDnd: () => !!G.shell?.prefs?.dnd,
        onClick: () => { if (buddyRef.current?.listening) doClose(); else doOpen(); },
      });
      buddyRef.current = buddy;
      // La piste revient (plein écran quitté, pilule réaffichée), un réglage change : on relance la boucle.
      mo = new MutationObserver(() => buddy.wake()); mo.observe(t.watch, { attributes: true, attributeFilter: ['class'] });
      // ⚠️ Téléphone : la coque RECONSTRUIT la pilule (`pill.innerHTML = …`, engine/mobile.ts) à chaque mise à jour des
      // favoris — ce qui effaçait la mascotte. On la raccroche aussitôt (le Dock, lui, ne touche pas à #dockWrap).
      if (t.mobile) { mo2 = new MutationObserver(() => { if (!t.host.contains(buddy.el)) { t.host.append(buddy.el); buddy.wake(); } }); mo2.observe(t.host, { childList: true }); }
      offPrefs = G.on?.('prefs', () => buddy.wake());
    };
    start();
    return () => { stop = true; mo?.disconnect(); mo2?.disconnect(); offPrefs?.(); buddy?.destroy(); buddyRef.current = null; };
  }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- porte unique
  useEffect(() => {
    const G = gx(); if (!G) return;
    if (!allowed) { G.assistant = { available: false, open() {}, close() {}, toggle() {} }; return; }
    G.assistant = { available: true, open: doOpen, close: doClose, toggle: () => (buddyRef.current?.listening ? doClose() : doOpen()) };
    return () => { G.assistant = { available: false, open() {}, close() {}, toggle() {} }; };
  }, [allowed, doOpen, doClose]);

  // --- Échap ferme ; la fenêtre redimensionnée replace le volet
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); doClose(); } };
    const onResize = () => place();
    window.addEventListener('keydown', onKey, true); window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); };
  }, [open, doClose, place]);

  if (!allowed || !layer || !open) return null;
  const onBusy = (b: boolean) => buddyRef.current?.setThinking(b);
  return createPortal(
    mobile ? (
      <div className="mia-sheet-veil" onPointerDown={(e) => { if (e.target === e.currentTarget) doClose(); }}>
        <div className="mia-sheet glass glass-strong" role="dialog" aria-label="mIAouss"><div className="mia-grab" /><ChatPane onClose={doClose} onBusy={onBusy} /></div>
      </div>
    ) : (
      <div className="mia-pop glass glass-strong" role="dialog" aria-label="mIAouss"
        style={{ left: anchor?.left ?? 24, bottom: anchor?.bottom ?? 96, width: W }}>
        <ChatPane onClose={doClose} onBusy={onBusy} />
      </div>
    ),
    layer,
  );
});
