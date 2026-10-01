import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GForm, GFormLog } from '../../../types';
import { db } from '../../../services/dataService';
import { gx, hud, Icon } from '../ui/kit';
import {
  QUESTION_KINDS, READ_ONLY, kindOf, kindLabel, isQuestion, isChoice, isGrid, blank, convert, duplicateItem, isRequired, setRequired, sectionsOf, newId, type Kind,
} from './model';

// =====================================================================
// Éditeur maison d'un formulaire Google (G2, 01/10/2026). Tout ce que l'API Forms permet :
// titre et description, questions de tous les types courants, options, « Autre », obligatoire,
// sections, aiguillage selon la réponse, ordre (glisser), quiz (points, bonnes réponses), publication.
// Thème, couleurs, images, vidéos, envoi de fichier : PAS dans l'API → « Thème et couleurs » ouvre
// l'éditeur Google dans une fenêtre dédiée, le formulaire est relu à sa fermeture.
//
// Enregistrement : chaque modification est appliquée tout de suite à la copie locale, puis envoyée
// par lots (`/api/forms/:id/batch`) avec la révision connue. Google refuse si le formulaire a changé
// ailleurs entre-temps (409) : l'éditeur recharge au lieu d'écraser. Les frappes sont regroupées
// (600 ms) ; un changement de structure part aussitôt, derrière les frappes en attente (ordre gardé :
// les positions envoyées restent justes).
// =====================================================================

type Save = 'idle' | 'saving' | 'saved' | 'error';
type Op = { req: any; key?: string; label: string };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const anim = (el: Element | null | undefined, kf: Keyframe[], o: Record<string, unknown> = {}) => (el && !reduced() ? gx().animate(el, kf, o) : null);
const rel = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = Date.now() - new Date(iso).getTime();
  return d < 60_000 ? 'à l’instant' : d < 3_600_000 ? `il y a ${Math.floor(d / 60_000)} min` : d < 864e5 ? `il y a ${Math.floor(d / 3_600_000)} h` : new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};
const editUrl = (formId: string, email?: string | null) => `https://docs.google.com/forms/d/${formId}/edit${email ? `?authuser=${encodeURIComponent(email)}` : ''}`;

export default function Editor({ row, email, onBack, onStats, onChanged, openSheet }: {
  row: GForm; email: string | null; onBack: () => void; onStats: () => void; onChanged: () => void;
  openSheet: (render: (close: (v?: unknown) => void) => React.ReactNode, opts?: { width?: number }) => unknown;
}) {
  const [f, setF] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [save, setSave] = useState<Save>('idle');
  const [focus, setFocus] = useState<string | null>(null);
  const [last, setLast] = useState<{ by: string | null; at: string | null }>({ by: null, at: null });
  const [pub, setPub] = useState({ p: row.isPublished, a: row.acceptingResponses });
  const R = useRef({ f: null as any, rev: '', queue: [] as Op[], inflight: false, timer: 0, dead: false });
  const listRef = useRef<HTMLDivElement>(null);
  const fresh = useRef(new Set<string>());
  // ⚠️ Par référence : `onChanged` est recréé à chaque rendu du parent ; en dépendance de `flush`, il
  // relancerait le nettoyage « fermeture de l'éditeur » à chaque rendu (frappes envoyées sans attendre).
  const changedRef = useRef(onChanged); changedRef.current = onChanged;

  // ---------------------------------------------------------------- lecture
  const load = useCallback(async (quiet = false) => {
    try {
      const r = await db.getFormLive(row.id);
      R.current.f = r.form; R.current.rev = r.form.revisionId; R.current.queue = [];
      setF(r.form); setErr('');
      const ps = r.form.publishSettings?.publishState;
      setPub({ p: ps ? !!ps.isPublished : true, a: ps ? !!ps.isAcceptingResponses : true });
      setLast({ by: r.lastEditedBy, at: r.lastEditedAt });
      if (!quiet) setSave('idle');
    } catch (e: any) { setErr(e?.message || 'Lecture du formulaire impossible.'); }
  }, [row.id]);
  // `dead` remis à zéro au (re)montage : en mode strict, React démonte puis remonte chaque effet en dev —
  // sans cette ligne, l'éditeur se croyait fermé et n'envoyait plus rien (constaté au test du 01/10).
  useEffect(() => { R.current.dead = false; load(); return () => { R.current.dead = true; }; }, [load]);

  // ---------------------------------------------------------------- enregistrement par lots
  const flush = useCallback(async () => {
    const S = R.current;
    window.clearTimeout(S.timer);
    if (S.inflight || !S.queue.length || S.dead) return;
    const batch = S.queue.splice(0);
    S.inflight = true; setSave('saving');
    const summary = [...new Set(batch.map((b) => b.label))].join(' ; ').slice(0, 480);
    try {
      const r = await db.batchForm(row.id, batch.map((b) => b.req), S.rev, summary);
      if (r.form) {
        S.rev = r.form.revisionId;
        // Rien n'a été modifié pendant l'envoi : la version du serveur devient la référence.
        if (!S.queue.length) { S.f = r.form; setF(r.form); }
      }
      setSave('saved'); setLast({ by: 'vous', at: new Date().toISOString() }); changedRef.current();
    } catch (e: any) {
      S.queue = []; setSave('error');
      hud(e?.message || 'Enregistrement impossible : formulaire rechargé.');
      await load(true);
    } finally {
      S.inflight = false;
      if (S.queue.length) flush();
    }
  }, [row.id, load]);

  /**
   * Applique une modification : `mutate` sur la copie locale (rendu immédiat), `ops` à envoyer.
   * `key` regroupe les frappes successives sur le même champ (seule la dernière part).
   */
  const apply = (mutate: (items: any[], form: any) => void, ops: Op[], soon = false) => {
    const S = R.current; if (!S.f) return;
    const next = clone(S.f); next.items = next.items || [];
    mutate(next.items, next);
    S.f = next; setF(next);
    ops.forEach((op) => {
      const lastOp = S.queue[S.queue.length - 1];
      if (op.key && lastOp?.key === op.key) S.queue[S.queue.length - 1] = op; else S.queue.push(op);
    });
    window.clearTimeout(S.timer);
    if (soon) flush(); else S.timer = window.setTimeout(flush, 600);
    setSave('saving');
  };
  // Quitter l'éditeur avec des frappes en attente : on les envoie (`flush` est stable : row.id, load).
  useEffect(() => () => { if (R.current.queue.length) { R.current.dead = false; flush(); } }, [flush]);

  const items: any[] = f?.items || [];
  const idx = (id: string) => (R.current.f?.items || []).findIndex((x: any) => x.itemId === id);
  /** Remplace l'élément `id` par `item` (requête updateItem avec l'élément complet). */
  const updateItem = (id: string, item: any, label: string, typing = false) => {
    const i = idx(id); if (i < 0) return;
    apply((L) => { L[i] = item; }, [{ req: { updateItem: { item, location: { index: i }, updateMask: '*' } }, key: typing ? `u:${id}` : undefined, label }], !typing);
  };
  const addItem = (item: any, at: number, label: string) => {
    fresh.current.add(item.itemId);
    apply((L) => { L.splice(at, 0, item); }, [{ req: { createItem: { item, location: { index: at } } }, label }], true);
    setFocus(item.itemId);
  };
  const removeItem = (id: string) => {
    const i = idx(id); if (i < 0) return;
    const it = R.current.f.items[i];
    const go = () => apply((L) => { L.splice(i, 1); }, [{ req: { deleteItem: { location: { index: i } } }, label: `« ${it.title || kindLabel(kindOf(it))} » supprimé` }], true);
    const el = listRef.current?.querySelector(`[data-item="${id}"]`);
    const a = anim(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-30px) scale(.96)' }], { duration: 260, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'forwards' });
    if (a) a.onfinish = go; else go();
  };
  const moveItem = (from: number, to: number) => {
    if (from === to || to < 0 || to >= (R.current.f.items || []).length) return;
    const it = R.current.f.items[from];
    apply((L) => { const [x] = L.splice(from, 1); L.splice(to, 0, x); }, [{ req: { moveItem: { originalLocation: { index: from }, newLocation: { index: to } } }, label: `« ${it.title || 'Élément'} » déplacé` }], true);
  };
  const setInfo = (patch: { title?: string; description?: string }) => {
    apply((_L, form) => { form.info = { ...form.info, ...patch }; }, [{ req: { updateFormInfo: { info: patch, updateMask: Object.keys(patch).join(',') } }, key: `info:${Object.keys(patch).join(',')}`, label: patch.title !== undefined ? 'Titre du formulaire' : 'Description du formulaire' }]);
  };
  const setQuiz = (on: boolean) => {
    apply((_L, form) => { form.settings = { ...form.settings, quizSettings: { isQuiz: on } }; }, [{ req: { updateSettings: { settings: { quizSettings: { isQuiz: on } }, updateMask: 'quizSettings.isQuiz' } }, label: on ? 'Mode quiz activé' : 'Mode quiz désactivé' }], true);
  };

  // ---------------------------------------------------------------- publication
  const setPublish = async (p: boolean, a: boolean) => {
    const prev = pub; setPub({ p, a: p && a });
    try { await db.publishForm(row.id, p, a); onChanged(); hud(!p ? 'Formulaire dépublié' : a ? 'Formulaire publié, ouvert aux réponses' : 'Réponses fermées'); }
    catch (e: any) { setPub(prev); hud(e?.message || 'Publication impossible.'); }
  };

  // ---------------------------------------------------------------- éditeur Google (thème, couleurs…)
  const openGoogle = () => {
    flush();
    const w = window.open(editUrl(row.formId, email), 'gx-forms-google', 'popup=yes,width=1280,height=860');
    if (!w) { window.open(editUrl(row.formId, email), '_blank', 'noopener'); return; }
    hud('Éditeur Google ouvert : le formulaire sera relu à sa fermeture');
    const t = window.setInterval(() => { if (w.closed) { window.clearInterval(t); load(true).then(() => hud('Formulaire relu depuis Google')); onChanged(); } }, 700);
  };
  const preview = () => {
    if (!f?.responderUri) return hud('Aperçu indisponible : le formulaire n’a pas encore de lien de réponse.');
    openSheet((close) => (
      <div className="frm-prev"><div className="row"><h3 className="grow">Aperçu</h3>{pub.p ? null : <span className="badge" style={{ '--c': 'var(--warn)' } as React.CSSProperties}>Non publié</span>}<button className="icon-btn" onClick={() => close()} aria-label="Fermer"><Icon name="close" size="sm" /></button></div>
        <iframe title="Aperçu du formulaire" src={`${f.responderUri}${f.responderUri.includes('?') ? '&' : '?'}embedded=true`} /></div>
    ), { width: 760 });
  };
  const showLog = (el: HTMLElement) => db.getFormLog(row.id).then((L: GFormLog[]) => gx().menu.open(
    [{ header: 'Modifications faites depuis Gearbox' }, ...(L.length ? L.slice(0, 14).map((l) => ({ label: `${l.user} · ${l.detail || l.action} · ${rel(l.at)}`, action: () => {} })) : [{ label: 'Aucune modification enregistrée', disabled: true }])],
    el, { align: 'right' }), (e) => hud(e?.message || 'Journal indisponible.'));

  // ---------------------------------------------------------------- animations : nouveaux éléments
  useLayoutEffect(() => {
    if (!fresh.current.size) return;
    fresh.current.forEach((id) => {
      const el = listRef.current?.querySelector(`[data-item="${id}"]`);
      anim(el, [{ opacity: 0, transform: 'translateY(14px) scale(.97)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy', duration: 520 });
      (el as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    });
    fresh.current.clear();
  });

  // ---------------------------------------------------------------- glisser pour réordonner
  const dragDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const list = listRef.current; if (!list) return;
    const cards = [...list.querySelectorAll<HTMLElement>('[data-item]')];
    const from = cards.findIndex((c) => c.dataset.item === id); if (from < 0) return;
    const me = cards[from], rects = cards.map((c) => c.getBoundingClientRect()), h = rects[from].height + 12;
    const sy = e.clientY; let to = from;
    me.classList.add('drag');
    const mv = (ev: PointerEvent) => {
      const dy = ev.clientY - sy, mid = rects[from].top + rects[from].height / 2 + dy;
      to = from;
      rects.forEach((r, k) => { if (k < from && mid < r.top + r.height / 2) to = Math.min(to, k); if (k > from && mid > r.top + r.height / 2) to = Math.max(to, k); });
      me.style.transform = `translateY(${dy}px) scale(1.02) rotate(${Math.max(-1.2, Math.min(1.2, dy / 300))}deg)`;
      cards.forEach((c, k) => { if (k === from) return; const shift = from < to && k > from && k <= to ? -h : from > to && k < from && k >= to ? h : 0; c.style.transform = shift ? `translateY(${shift}px)` : ''; });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      const before = cards.map((c) => c.getBoundingClientRect());
      me.classList.remove('drag');
      cards.forEach((c) => { c.style.transform = ''; });
      if (to !== from) {
        moveItem(from, to);
        // FLIP : chaque carte part de sa position visuelle et se pose à sa nouvelle place.
        requestAnimationFrame(() => cards.forEach((c, k) => {
          const now = c.getBoundingClientRect(), dy = before[k].top - now.top;
          if (Math.abs(dy) > 1) anim(c, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { spring: k === from ? 'bouncy' : 'snappy' });
        }));
      }
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  // ---------------------------------------------------------------- rendu
  if (err && !f) return <div className="frm-ed"><EdBar onBack={onBack} title={row.title} /><div className="frm-err">{err}</div></div>;
  if (!f) return <div className="frm-ed"><EdBar onBack={onBack} title={row.title} /><div className="frm-empty">Lecture du formulaire chez Google…</div></div>;
  const sections = sectionsOf(items);
  const quiz = !!f.settings?.quizSettings?.isQuiz;
  const insertAt = () => { const i = focus ? idx(focus) : -1; return i >= 0 ? i + 1 : items.length; };
  return (
    <div className="frm-ed">
      <EdBar onBack={onBack} title={f.info?.title || row.title} save={save} last={last}>
        <button className="btn sm" onClick={preview} data-tip="Le formulaire tel que le voient les répondants"><Icon name="eye" size="sm" />Aperçu</button>
        <button className="btn sm" onClick={openGoogle} data-tip="Thème, couleurs, images, vidéos, envoi de fichier"><Icon name="contrast" size="sm" />Thème et couleurs</button>
        <button className="btn sm" onClick={onStats}><Icon name="trending" size="sm" />Statistiques</button>
        <button className="icon-btn sm" aria-label="Plus" onClick={(e) => { const el = e.currentTarget; gx().menu.open([
          { label: 'Copier le lien de réponse', icon: 'link', disabled: !f.responderUri, action: () => navigator.clipboard?.writeText(f.responderUri).then(() => hud('Lien copié')) },
          { label: 'Journal des modifications', icon: 'clock', action: () => showLog(el) },
          { label: 'Relire depuis Google', icon: 'refresh', action: () => load().then(() => hud('Formulaire relu')) },
          { label: 'Ouvrir dans un onglet Google', icon: 'arrowr', action: () => window.open(editUrl(row.formId, email), '_blank', 'noopener') },
        ], el, { align: 'right' }); }}><Icon name="more" size="sm" /></button>
      </EdBar>
      <div className="frm-edscroll scroll">
        <div className="frm-edcol">
          {!pub.p ? (
            <div className="frm-publish">
              <span className="grow"><b>Formulaire non publié</b><span>Personne ne peut y répondre. Publiez-le quand il est prêt : il s’ouvrira aux réponses.</span></span>
              <button className="btn primary" onClick={() => setPublish(true, true)}><Icon name="send" size="sm" />Publier</button>
            </div>
          ) : null}
          <div className="frm-pubbar">
            <Toggle on={pub.p} onChange={(v) => setPublish(v, v ? true : false)} label={pub.p ? 'Publié' : 'Non publié'} />
            <Toggle on={pub.a} disabled={!pub.p} onChange={(v) => setPublish(true, v)} label={pub.a ? 'Accepte les réponses' : 'Réponses fermées'} />
            <span className="grow" />
            <Toggle on={quiz} onChange={setQuiz} label="Quiz" />
          </div>
          <section className="frm-hcard">
            <AutoInput cls="frm-htitle" value={f.info?.title || ''} placeholder="Titre du formulaire" onChange={(v) => setInfo({ title: v })} />
            <AutoInput cls="frm-hdesc" multiline value={f.info?.description || ''} placeholder="Description du formulaire" onChange={(v) => setInfo({ description: v })} />
          </section>
          <div className="frm-items" ref={listRef}>
            {items.map((it, i) => (
              <React.Fragment key={it.itemId}><ItemCard it={it} i={i} n={items.length} focused={focus === it.itemId} quiz={quiz} sections={sections}
                onFocus={() => setFocus(it.itemId)} onUpdate={(item, label, typing) => updateItem(it.itemId, item, label, typing)}
                onConvert={(k) => {
                  const r = convert(it, k);
                  if (!r.replaced) return updateItem(it.itemId, r.item, `Type de « ${it.title} » → ${kindLabel(k)}`);
                  const go = () => { const at = idx(it.itemId); apply((L) => { L.splice(at, 1, r.item); }, [{ req: { deleteItem: { location: { index: at } } }, label: 'Type changé' }, { req: { createItem: { item: r.item, location: { index: at } } }, label: `Type de « ${it.title} » → ${kindLabel(k)}` }], true); setFocus(r.item.itemId); };
                  if (row.responseCount > 0) gx().menu.open([{ header: 'Changer de type de question ?' }, { label: 'Les réponses déjà reçues à cette question ne lui seront plus rattachées', disabled: true }, { label: `Passer en « ${kindLabel(k)} »`, action: go }, { label: 'Annuler', action: () => {} }], listRef.current?.querySelector(`[data-item="${it.itemId}"] .frm-type`) as HTMLElement, {});
                  else go();
                }}
                onDuplicate={() => addItem(duplicateItem(it), i + 1, `« ${it.title} » dupliqué`)}
                onRemove={() => removeItem(it.itemId)} onMove={(d) => moveItem(i, i + d)} onDrag={(e) => dragDown(e, it.itemId)} /></React.Fragment>
            ))}
            {!items.length ? <div className="frm-empty">Formulaire vide : ajoutez une première question.</div> : null}
          </div>
          <div className="frm-add">
            <button className="btn primary" onClick={() => addItem(blank('radio'), insertAt(), 'Question ajoutée')}><Icon name="plus" size="sm" />Question</button>
            <button className="btn" onClick={() => addItem(blank('text'), insertAt(), 'Titre ajouté')}><Icon name="edit" size="sm" />Titre et description</button>
            <button className="btn" onClick={() => addItem(blank('section'), insertAt(), 'Section ajoutée')}><Icon name="layers" size="sm" />Section</button>
          </div>
          <div className="frm-note">Thème, couleurs, images, vidéos et questions d’envoi de fichier se règlent dans l’éditeur Google (bouton « Thème et couleurs ») : l’API Google ne les propose pas.</div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Pièces de l'éditeur
// =====================================================================
function EdBar({ onBack, title, save, last, children }: { onBack: () => void; title: string; save?: Save; last?: { by: string | null; at: string | null }; children?: React.ReactNode }) {
  const st = save === 'saving' ? 'Enregistrement…' : save === 'saved' ? 'Enregistré dans Google' : save === 'error' ? 'Échec — rechargé' : last?.at ? `Modifié ${last.by ? `par ${last.by} ` : ''}${rel(last.at)}` : '';
  return (
    <div className="frm-edbar">
      <button className="btn sm" onClick={onBack}><Icon name="chevleft" size="sm" />Formulaires</button>
      <b className="ellipsis frm-edt">{title}</b>
      <span className={`frm-save ${save || ''}`}>{save === 'saving' ? <i className="spin" /> : save === 'saved' ? <Icon name="check" size="sm" /> : null}{st}</span>
      <span className="grow" />
      {children}
    </div>
  );
}

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <label className={`frm-tg ${disabled ? 'dis' : ''}`}><input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span className="sw" /><span>{label}</span></label>;
}

/** Champ texte « au fil de la frappe » : valeur locale, remontée à chaque frappe (regroupée par l'éditeur). */
function AutoInput({ value, onChange, placeholder, cls = '', multiline = false }: { value: string; onChange: (v: string) => void; placeholder?: string; cls?: string; multiline?: boolean }) {
  const [v, setV] = useState(value);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setV(value); }, [value]);
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { const t = ref.current; if (t) { t.style.height = '0px'; t.style.height = `${t.scrollHeight}px`; } }, [v]);
  const props = { value: v, placeholder, className: cls, onFocus: () => (editing.current = true), onBlur: () => { editing.current = false; }, onChange: (e: any) => { setV(e.target.value); onChange(e.target.value); } };
  return multiline ? <textarea ref={ref} rows={1} {...props} /> : <input {...props} />;
}

function ItemCard({ it, i, n, focused, quiz, sections, onFocus, onUpdate, onConvert, onDuplicate, onRemove, onMove, onDrag }: {
  it: any; i: number; n: number; focused: boolean; quiz: boolean; sections: { id: string; title: string }[];
  onFocus: () => void; onUpdate: (item: any, label: string, typing?: boolean) => void; onConvert: (k: Kind) => void;
  onDuplicate: () => void; onRemove: () => void; onMove: (d: number) => void; onDrag: (e: React.PointerEvent) => void;
}) {
  const k = kindOf(it), ro = READ_ONLY.includes(k), q = it.questionItem?.question;
  const set = (mut: (c: any) => void, label: string, typing = false) => { const c = clone(it); mut(c); onUpdate(c, label, typing); };
  const name = it.title || kindLabel(k);
  const typeMenu = (el: HTMLElement) => gx().menu.open([{ header: 'Type de question' }, ...QUESTION_KINDS.map((x) => ({ label: x.l, icon: x.icon, checked: x.k === k, action: () => x.k !== k && onConvert(x.k) }))], el, {});
  return (
    <article className={`frm-item k-${k} ${focused ? 'on' : ''} ${k === 'section' ? 'sec' : ''}`} data-item={it.itemId} onPointerDown={() => !focused && onFocus()}>
      <div className="frm-drag" onPointerDown={onDrag} data-tip="Glisser pour déplacer"><i /><i /><i /></div>
      {k === 'section' ? <div className="frm-secno">Section</div> : null}
      <div className="frm-ih">
        {ro ? <b className="frm-ititle-ro">{name}</b> : <AutoInput cls="frm-ititle" multiline value={it.title || ''} placeholder={k === 'section' ? 'Titre de la section' : k === 'text' ? 'Titre' : 'Question'} onChange={(v) => set((c) => { c.title = v; }, `Titre de « ${name} »`, true)} />}
        {isQuestion(k) && !ro ? <button className="btn sm frm-type" onClick={(e) => typeMenu(e.currentTarget)}><Icon name={QUESTION_KINDS.find((x) => x.k === k)?.icon || 'edit'} size="sm" />{kindLabel(k)}<Icon name="chevdown" size="sm" /></button>
          : <span className="badge" style={{ '--c': 'var(--text-3)' } as React.CSSProperties}>{kindLabel(k)}</span>}
      </div>
      {ro ? <div className="frm-ro"><Icon name="lock" size="sm" />Élément modifiable seulement dans l’éditeur Google (bouton « Thème et couleurs »). Il peut être déplacé ou supprimé ici.</div> : (
        <>
          {focused || it.description ? <AutoInput cls="frm-idesc" multiline value={it.description || ''} placeholder="Description (facultatif)" onChange={(v) => set((c) => { if (v) c.description = v; else delete c.description; }, `Description de « ${name} »`, true)} /> : null}
          {isChoice(k) ? <ChoiceEditor it={it} k={k} focused={focused} quiz={quiz} sections={sections} set={set} /> : null}
          {isGrid(k) ? <GridEditor it={it} focused={focused} set={set} /> : null}
          {k === 'scale' ? <ScaleEditor q={q} focused={focused} set={set} /> : null}
          {k === 'rating' ? <RatingEditor q={q} focused={focused} set={set} /> : null}
          {k === 'short' || k === 'paragraph' ? <div className={`frm-fake ${k}`}>{k === 'short' ? 'Réponse courte' : 'Réponse longue'}</div> : null}
          {k === 'date' ? <div className="frm-fake">Jour, mois{q.dateQuestion?.includeYear === false ? '' : ', année'}{q.dateQuestion?.includeTime ? ', heure' : ''}</div> : null}
          {k === 'time' ? <div className="frm-fake">{q.timeQuestion?.duration ? 'Durée' : 'Heure'}</div> : null}
        </>
      )}
      {focused ? (
        <div className="frm-ifoot">
          {quiz && isChoice(k) ? <PointsInput q={q} set={set} /> : null}
          <span className="grow" />
          <button className="icon-btn sm" aria-label="Monter" disabled={i === 0} onClick={() => onMove(-1)}><Icon name="arrowup" size="sm" /></button>
          <button className="icon-btn sm" aria-label="Descendre" disabled={i === n - 1} onClick={() => onMove(1)}><Icon name="arrowdown" size="sm" /></button>
          {!ro ? <button className="icon-btn sm" aria-label="Dupliquer" data-tip="Dupliquer" onClick={onDuplicate}><Icon name="copy" size="sm" /></button> : null}
          <button className="icon-btn sm danger" aria-label="Supprimer" data-tip="Supprimer" onClick={onRemove}><Icon name="trash" size="sm" /></button>
          {isQuestion(k) && !ro ? <><span className="frm-sep" /><label className="frm-req"><span>Obligatoire</span><input type="checkbox" checked={isRequired(it)} onChange={(e) => onUpdate(setRequired(it, e.target.checked), `« ${name} » ${e.target.checked ? 'obligatoire' : 'facultative'}`)} /><span className="sw" /></label></> : null}
        </div>
      ) : null}
    </article>
  );
}

function ChoiceEditor({ it, k, focused, quiz, sections, set }: { it: any; k: Kind; focused: boolean; quiz: boolean; sections: { id: string; title: string }[]; set: (mut: (c: any) => void, label: string, typing?: boolean) => void }) {
  const cq = it.questionItem.question.choiceQuestion, opts: any[] = cq.options || [];
  const name = it.title || 'Question';
  const logic = opts.some((o) => o.goToAction || o.goToSectionId);
  const correct: string[] = (it.questionItem.question.grading?.correctAnswers?.answers || []).map((a: any) => a.value);
  const mark = k === 'checkbox' ? 'sq' : k === 'dropdown' ? 'num' : 'rd';
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focusNext = useRef<number | null>(null);
  useEffect(() => { if (focusNext.current !== null) { refs.current[focusNext.current]?.focus(); refs.current[focusNext.current]?.select(); focusNext.current = null; } });
  const optOps = (fn: (o: any[]) => void, label: string, typing = false) => set((c) => { fn(c.questionItem.question.choiceQuestion.options); }, label, typing);
  const toggleCorrect = (v: string) => set((c) => {
    const qq = c.questionItem.question, cur = new Set((qq.grading?.correctAnswers?.answers || []).map((a: any) => a.value));
    if (k === 'checkbox') { if (cur.has(v)) cur.delete(v); else cur.add(v); } else { cur.clear(); cur.add(v); }
    qq.grading = { pointValue: qq.grading?.pointValue ?? 1, correctAnswers: { answers: [...cur].map((value) => ({ value })) } };
  }, `Bonne réponse de « ${name} »`);
  return (
    <div className="frm-opts">
      {opts.map((o, j) => (
        <div key={j} className={`frm-opt ${o.isOther ? 'other' : ''}`}>
          <span className={`mk ${mark}`}>{mark === 'num' ? `${j + 1}.` : null}</span>
          {o.isOther ? <span className="frm-other">Autre…</span> : focused
            ? <input ref={(el) => (refs.current[j] = el)} className="frm-optin" value={o.value} placeholder={`Option ${j + 1}`}
                onChange={(e) => optOps((L) => { L[j].value = e.target.value; }, `Options de « ${name} »`, true)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext.current = j + 1; optOps((L) => { L.splice(j + 1, 0, { value: `Option ${L.filter((x) => !x.isOther).length + 1}` }); }, `Option ajoutée à « ${name} »`); } }} />
            : <span className="frm-optv">{o.value}</span>}
          {quiz && focused && !o.isOther ? <button className={`frm-ok ${correct.includes(o.value) ? 'on' : ''}`} data-tip="Bonne réponse" onClick={() => toggleCorrect(o.value)}><Icon name="star" size="sm" /></button> : null}
          {logic && focused && k !== 'checkbox' ? (
            <select className="frm-goto" value={o.goToSectionId || o.goToAction || 'NEXT_SECTION'} onChange={(e) => optOps((L) => {
              const v = e.target.value; delete L[j].goToAction; delete L[j].goToSectionId;
              if (v === 'NEXT_SECTION' || v === 'SUBMIT_FORM' || v === 'RESTART_FORM') L[j].goToAction = v; else L[j].goToSectionId = v;
            }, `Aiguillage de « ${name} »`)}>
              <option value="NEXT_SECTION">Section suivante</option>
              {sections.map((s) => <option key={s.id} value={s.id}>Aller à « {s.title} »</option>)}
              <option value="SUBMIT_FORM">Envoyer le formulaire</option>
            </select>
          ) : null}
          {focused && (opts.length > 1 || o.isOther) ? <button className="icon-btn sm" aria-label="Retirer l’option" onClick={() => optOps((L) => { L.splice(j, 1); }, `Option retirée de « ${name} »`)}><Icon name="close" size="sm" /></button> : null}
        </div>
      ))}
      {focused ? (
        <div className="frm-optadd">
          <button className="btn sm" onClick={() => { focusNext.current = opts.filter((x) => !x.isOther).length; optOps((L) => { const at = L.findIndex((x) => x.isOther); L.splice(at < 0 ? L.length : at, 0, { value: `Option ${L.filter((x) => !x.isOther).length + 1}` }); }, `Option ajoutée à « ${name} »`); }}><Icon name="plus" size="sm" />Option</button>
          {k !== 'dropdown' && !opts.some((x) => x.isOther) ? <button className="btn sm" onClick={() => optOps((L) => { L.push({ isOther: true }); }, `« Autre » ajouté à « ${name} »`)}>Ajouter « Autre »</button> : null}
          {k !== 'checkbox' ? <label className="frm-tg sm"><input type="checkbox" checked={logic} onChange={(e) => optOps((L) => { L.forEach((x) => { if (e.target.checked) x.goToAction = x.goToAction || (x.goToSectionId ? undefined : 'NEXT_SECTION'); else { delete x.goToAction; delete x.goToSectionId; } }); }, e.target.checked ? `Aiguillage activé sur « ${name} »` : `Aiguillage retiré de « ${name} »`)} /><span className="sw" /><span>Aller à une section selon la réponse</span></label> : null}
          <label className="frm-tg sm"><input type="checkbox" checked={!!cq.shuffle} onChange={(e) => set((c) => { c.questionItem.question.choiceQuestion.shuffle = e.target.checked; }, `Ordre aléatoire sur « ${name} »`)} /><span className="sw" /><span>Ordre aléatoire</span></label>
        </div>
      ) : null}
    </div>
  );
}

function GridEditor({ it, focused, set }: { it: any; focused: boolean; set: (mut: (c: any) => void, label: string, typing?: boolean) => void }) {
  const g = it.questionGroupItem, rows: any[] = g.questions || [], cols: any[] = g.grid.columns.options || [];
  const name = it.title || 'Grille';
  const req = rows.some((r) => r.required);
  const list = (title: string, L: any[], get: (x: any) => string, setv: (c: any, j: number, v: string) => void, add: (c: any) => void, del: (c: any, j: number) => void) => (
    <div className="frm-gl"><span className="label">{title}</span>
      {L.map((x, j) => (
        <div key={j} className="frm-opt">{focused ? <input className="frm-optin" value={get(x)} onChange={(e) => set((c) => setv(c, j, e.target.value), `${title} de « ${name} »`, true)} /> : <span className="frm-optv">{get(x)}</span>}
          {focused && L.length > 1 ? <button className="icon-btn sm" aria-label="Retirer" onClick={() => set((c) => del(c, j), `${title} de « ${name} »`)}><Icon name="close" size="sm" /></button> : null}</div>))}
      {focused ? <button className="btn sm" onClick={() => set((c) => add(c), `${title} de « ${name} »`)}><Icon name="plus" size="sm" />Ajouter</button> : null}
    </div>
  );
  return (
    <div className="frm-gridedit">
      {list('Lignes', rows, (r) => r.rowQuestion?.title || '', (c, j, v) => { c.questionGroupItem.questions[j].rowQuestion = { title: v }; },
        (c) => { c.questionGroupItem.questions.push({ questionId: newId(), required: req, rowQuestion: { title: `Ligne ${c.questionGroupItem.questions.length + 1}` } }); },
        (c, j) => { c.questionGroupItem.questions.splice(j, 1); })}
      {list('Colonnes', cols, (o) => o.value, (c, j, v) => { c.questionGroupItem.grid.columns.options[j].value = v; },
        (c) => { c.questionGroupItem.grid.columns.options.push({ value: `Colonne ${c.questionGroupItem.grid.columns.options.length + 1}` }); },
        (c, j) => { c.questionGroupItem.grid.columns.options.splice(j, 1); })}
    </div>
  );
}

function ScaleEditor({ q, focused, set }: { q: any; focused: boolean; set: (mut: (c: any) => void, label: string, typing?: boolean) => void }) {
  const s = q.scaleQuestion;
  const span = Array.from({ length: s.high - s.low + 1 }, (_, i) => s.low + i);
  if (!focused) return <div className="frm-scale">{s.lowLabel ? <span className="faint">{s.lowLabel}</span> : null}{span.map((n) => <span key={n} className="dot">{n}</span>)}{s.highLabel ? <span className="faint">{s.highLabel}</span> : null}</div>;
  return (
    <div className="frm-scaleed">
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <select value={s.low} onChange={(e) => set((c) => { c.questionItem.question.scaleQuestion.low = +e.target.value; }, 'Échelle modifiée')}><option value={0}>0</option><option value={1}>1</option></select>
        <span className="faint">à</span>
        <select value={s.high} onChange={(e) => set((c) => { c.questionItem.question.scaleQuestion.high = +e.target.value; }, 'Échelle modifiée')}>{[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select>
      </div>
      <input className="frm-optin" placeholder={`Libellé de ${s.low} (facultatif)`} value={s.lowLabel || ''} onChange={(e) => set((c) => { const v = e.target.value, sq = c.questionItem.question.scaleQuestion; if (v) sq.lowLabel = v; else delete sq.lowLabel; }, 'Libellés de l’échelle', true)} />
      <input className="frm-optin" placeholder={`Libellé de ${s.high} (facultatif)`} value={s.highLabel || ''} onChange={(e) => set((c) => { const v = e.target.value, sq = c.questionItem.question.scaleQuestion; if (v) sq.highLabel = v; else delete sq.highLabel; }, 'Libellés de l’échelle', true)} />
    </div>
  );
}

const ICONS: Record<string, string> = { STAR: '★', HEART: '♥', THUMB_UP: '👍' };
function RatingEditor({ q, focused, set }: { q: any; focused: boolean; set: (mut: (c: any) => void, label: string) => void }) {
  const r = q.ratingQuestion;
  return (
    <div className="frm-rating">
      <span className="ico">{Array.from({ length: r.ratingScaleLevel }, (_, i) => <i key={i}>{ICONS[r.iconType] || '★'}</i>)}</span>
      {focused ? <>
        <select value={r.ratingScaleLevel} onChange={(e) => set((c) => { c.questionItem.question.ratingQuestion.ratingScaleLevel = +e.target.value; }, 'Note modifiée')}>{[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} niveaux</option>)}</select>
        <select value={r.iconType} onChange={(e) => set((c) => { c.questionItem.question.ratingQuestion.iconType = e.target.value; }, 'Note modifiée')}><option value="STAR">Étoiles</option><option value="HEART">Cœurs</option><option value="THUMB_UP">Pouces</option></select>
      </> : null}
    </div>
  );
}

function PointsInput({ q, set }: { q: any; set: (mut: (c: any) => void, label: string, typing?: boolean) => void }) {
  return (
    <label className="frm-pts"><span>Points</span>
      <input type="number" min={0} max={100} value={q.grading?.pointValue ?? 0} onChange={(e) => set((c) => {
        const qq = c.questionItem.question, n = Math.max(0, Math.min(100, Math.round(+e.target.value || 0)));
        qq.grading = { ...(qq.grading || { correctAnswers: { answers: [] } }), pointValue: n };
      }, 'Points du quiz', true)} /></label>
  );
}
