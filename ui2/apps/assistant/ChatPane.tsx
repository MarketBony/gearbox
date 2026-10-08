import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AssistantMe, AssistantMessage, AssistantTurn } from '../../../types';
import { db } from '../../../services/dataService';
import { getSocket, connectSocket } from '../../../services/socket';
import { useAuth } from '../../../contexts/AuthContext';
import { Icon, gx, hud, useEngineEvent } from '../ui/kit';
import { runTool, TOOL_LABEL, orgaContext } from './tools';
import { Rig, MIAOUSS } from './mascot';

// =====================================================================
// mIAouss — la discussion (P0 08/10/2026 ; P1 : vit dans le VOLET de la mascotte, MascotLayer.tsx — la
// fenêtre de la P0 a été retirée à la demande de Théo). Interface v2 seulement, équipe marketing.
//
// Un tour : la question part au serveur ; s'il répond « outils », on les exécute ICI (tools.ts,
// mêmes portes que les écrans) et on renvoie les résultats, jusqu'à la réponse. Le serveur garde
// l'état du tour : on ne lui renvoie jamais l'historique.
// La discussion vit sur le serveur (tous les appareils) ; « Nouvelle discussion » ou une
// déconnexion volontaire l'effacent (AuthContext.logout). La mémoire est dans Paramètres.
// =====================================================================

const MAX = 2000;
const SUGGESTIONS = [
  'Quels projets sont en retard ?',
  'Où en est le budget de Clermont cette année ?',
  'Qui est absent cette semaine ?',
  'Retiens que je m’occupe surtout de Vichy',
];

/** Rendu d'un texte du modèle : **gras**, listes « - » / « 1. », paragraphes. Jamais de HTML brut. */
function Rich({ text }: { text: string }) {
  const inline = (s: string, k: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={`${k}${i}`}>{part.slice(2, -2)}</b> : <React.Fragment key={`${k}${i}`}>{part}</React.Fragment>);
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list.ordered ? 'ol' : 'ul';
    blocks.push(<L key={`l${blocks.length}`}>{list.items.map((it, i) => <li key={i}>{inline(it, `li${i}`)}</li>)}</L>);
    list = null;
  };
  text.split('\n').forEach((raw, n) => {
    const line = raw.trimEnd();
    const m = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (m) {
      const ordered = !!m[2];
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push(m[3]);
      return;
    }
    flush();
    if (line.trim()) blocks.push(<p key={`p${n}`}>{inline(line.replace(/^#+\s*/, ''), `p${n}`)}</p>);
  });
  flush();
  return <>{blocks}</>;
}

/** Le chat en portrait FIXE (une seule image du moteur : rien ne tourne dans le volet). */
export const CatFace = React.memo(function CatFace({ size = 28, mood = 'happy' }: { size?: number; mood?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const rig: any = new Rig(MIAOUSS, size); rig.update(0.016, { mood, lx: .3, ly: .1 }); el.replaceChildren(rig.el);
  }, [size, mood]);
  return <span ref={ref} className="mia-face" style={{ width: size, height: size }} aria-hidden="true" />;
});

/** Le contenu du volet. `onBusy` : la mascotte réfléchit pendant la réponse. */
export default function ChatPane({ onClose, onBusy }: { onClose?: () => void; onBusy?: (busy: boolean) => void }) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<AssistantMessage[] | null>(null);
  const [me, setMe] = useState<AssistantMe | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);   // libellé de l'étape en cours
  const [err, setErr] = useState<string | null>(null);
  const [undone, setUndone] = useState<string[]>([]);       // notes retirées d'un clic sur « Annuler »
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busyRef = useRef(false);

  useEffect(() => { onBusy?.(!!busy); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { requestAnimationFrame(() => inputRef.current?.focus()); }, []);

  const reload = useCallback(async () => {
    try { setMsgs(await db.assistantConversation()); } catch (e: any) { setErr(e?.message || 'Discussion indisponible.'); setMsgs((m) => m || []); }
  }, []);
  const reloadMe = useCallback(() => { db.assistantMe().then(setMe).catch(() => {}); }, []);

  useEffect(() => { void reload(); reloadMe(); }, [reload, reloadMe]);
  // Autre appareil, autre onglet, « Nouvelle discussion » ailleurs : on relit (sauf pendant un tour).
  useEffect(() => {
    const s = getSocket() ?? connectSocket();
    if (!s) return;
    const onConv = () => { if (!busyRef.current) void reload(); };
    const onMe = () => reloadMe();
    s.on('assistant:conversation', onConv);
    s.on('assistant:notes', onMe);
    return () => { s.off('assistant:conversation', onConv); s.off('assistant:notes', onMe); };
  }, [reload, reloadMe]);

  // Toujours en bas de la discussion.
  useLayoutEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, busy]);

  const send = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q || busyRef.current) return;
    if (q.length > MAX) { setErr(`Message trop long (${MAX} caractères maximum).`); return; }
    busyRef.current = true;
    setErr(null);
    setText('');
    const temp: AssistantMessage = { id: `tmp-${Date.now()}`, role: 'user', content: q, createdAt: new Date().toISOString() };
    setMsgs((m) => [...(m || []), temp]);
    setBusy('mIAouss réfléchit…');
    try {
      let turn: AssistantTurn = await db.assistantAsk(q, orgaContext());
      while (turn.status === 'tools') {
        const calls = turn.calls;
        setBusy(`mIAouss consulte ${[...new Set(calls.map((c) => TOOL_LABEL[c.name] || c.name))].join(', ')}…`);
        const results = await Promise.all(calls.map(async (c) => ({ id: c.id, content: await runTool(c.name, c.args, user as any) })));
        setBusy('mIAouss rédige…');
        turn = await db.assistantToolResults(turn.turnId, results);
      }
      const answer = turn.message;
      setMsgs((m) => [...(m || []).map((x) => (x.id === temp.id ? { ...x, id: turn.userMessageId || x.id } : x)), answer]);
    } catch (e: any) {
      setMsgs((m) => (m || []).filter((x) => x.id !== temp.id));
      setText(q);   // la question n'est pas perdue
      setErr(e?.message || 'mIAouss est injoignable.');
      void reload();
    } finally {
      busyRef.current = false;
      setBusy(null);
      reloadMe();
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [reload, reloadMe, user]);

  // Question posée depuis le widget du bureau : déposée dans `GX.assistantPending` (la fenêtre peut être
  // déjà ouverte, et wm.open ignore alors ses paramètres), consommée une fois la discussion chargée.
  const loaded = msgs !== null;
  const consume = useCallback(() => {
    const q = gx()?.assistantPending;
    if (!loaded || typeof q !== 'string' || !q.trim() || busyRef.current) return;
    gx().assistantPending = null;
    void send(q);
  }, [loaded, send]);
  useEffect(() => { consume(); }, [consume]);
  useEngineEvent('assistant:ask', consume);

  const reset = async () => {
    if (busyRef.current) return;
    try { await db.assistantReset(); setMsgs([]); setErr(null); hud('Nouvelle discussion'); } catch (e: any) { setErr(e?.message || 'Impossible d’effacer la discussion.'); }
  };
  const undo = async (ids: string[]) => {
    try { await Promise.all(ids.map((id) => db.assistantDeleteNote(id))); setUndone((u) => [...u, ...ids]); hud('Note oubliée'); } catch { hud('Note déjà supprimée'); setUndone((u) => [...u, ...ids]); }
  };
  const openMemory = () => { onClose?.(); gx()?.wm?.open?.('settings', { tab: 'miaouss' }); };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); }
  };
  const capLabel = me ? (me.cap === -1 ? `${me.today} question${me.today > 1 ? 's' : ''} aujourd’hui` : `${me.today} / ${me.cap} aujourd’hui`) : '';

  return (
    <div className="mia">
      <div className="mia-head">
        <CatFace size={34} />
        <div className="grow"><b>mIAouss</b><span title="Questions posées aujourd’hui (le compteur repart à minuit)">{busy || capLabel || 'Ton chat mécano'}</span></div>
        <button className="btn sm ghost" onClick={openMemory} title="Mémoire et consommation"><Icon name="sliders" /></button>
        <button className="btn sm ghost" onClick={reset} disabled={!!busy || !msgs?.length} title="Nouvelle discussion"><Icon name="plus" /></button>
        {onClose && <button className="btn sm ghost" onClick={onClose} title="Fermer (Échap)"><Icon name="close" /></button>}
      </div>

      <div className="mia-list" ref={listRef}>
        {msgs === null ? <div className="mia-empty"><span className="mia-dots"><i /><i /><i /></span></div>
          : !msgs.length && !busy ? (
            <div className="mia-empty">
              <CatFace size={72} />
              <b>Salut {(user?.name || '').split(' ')[0]} !</b>
              <span>Pose-moi une question sur tes projets, ton budget ou les absences. Je ne calcule rien moi-même : Gearbox me donne ses chiffres, je te les explique.</span>
              <div className="mia-sugg">{SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>
            </div>
          ) : msgs.map((m) => {
            const noted = (m.meta?.noted || []).filter((id) => !undone.includes(id));
            return (
              <div key={m.id} className={`mia-msg ${m.role === 'user' ? 'me' : 'ai'}`}>
                
                <div className="mia-col">
                  <div className="mia-bub">{m.role === 'user' ? m.content : <Rich text={m.content} />}</div>
                  {m.role !== 'user' && (m.meta?.tools?.length || noted.length) ? (
                    <div className="mia-meta">
                      {!!m.meta?.tools?.length && <span>Calculé par Gearbox : {[...new Set(m.meta.tools.map((t) => TOOL_LABEL[t] || t))].join(', ')}</span>}
                      {!!noted.length && <span className="mia-noted">📝 mIAouss a retenu {noted.length > 1 ? `${noted.length} notes` : 'une note'} · <button onClick={() => undo(noted)}>Annuler</button> · <button onClick={openMemory}>Voir la mémoire</button></span>}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        {busy && <div className="mia-msg ai"><div className="mia-col"><div className="mia-bub typing"><span className="mia-dots"><i /><i /><i /></span></div></div></div>}
      </div>

      {err && <div className="mia-err"><Icon name="alert" /><span>{err}</span></div>}
      <div className="mia-compose">
        <textarea
          ref={inputRef} value={text} rows={1} maxLength={MAX} placeholder="Pose ta question à mIAouss…"
          onChange={(e) => setText(e.target.value)} onKeyDown={onKey} disabled={!!busy}
        />
        <button className="btn primary mia-send" onClick={() => send(text)} disabled={!!busy || !text.trim()} title="Envoyer (Entrée)"><Icon name="arrowup" /></button>
      </div>
    </div>
  );
}
