import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BonyFormDetail } from '../../../../types';
import { db } from '../../../../services/dataService';
import { gx, hud, Icon, Seg, useEngineStore } from '../../ui/kit';
import { checkDef, isLayout, CHOICE_TYPES, driveDays, type Condition, type BonyFormDef, type Field, type FieldType } from '../../../../shared/bonyform';
import { TYPES, typeDef, newField, newOption, copyField, bonyOptions } from './catalog';
import { StudioPanel, StudioPreview, pickImage } from './Studio';
import Share from './Share';
import DriveEditor from './DriveEditor';
import { Framed, FrameEditor, FrameToggle } from './Frame';
import { ProjectTags, VersionsSheet } from './F4';

// =====================================================================
// Éditeur Forms Bony (lot F1, 01/10/2026). Le BROUILLON s'enregistre tout seul (rien ne change pour
// le public) ; « Publier » met en ligne une copie figée (Worker Cloudflare). Le serveur refuse une
// publication incomplète (`checkDef`, même contrôle affiché ici en direct).
// Colonne de gauche : le formulaire en cartes ; panneau de droite : réglages du champ actif, ou du
// formulaire (remerciement, fermeture). Mode « Studio » (F2a) : aperçu en direct + apparence (Studio.tsx).
// =====================================================================

type Save = 'idle' | 'saving' | 'saved' | 'error';
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const anim = (el: Element | null | undefined, kf: Keyframe[], o: Record<string, unknown> = {}) => (el && !reduced() ? gx().animate(el, kf, o) : null);
const STATUS: Record<string, { l: string; c: string }> = { draft: { l: 'Brouillon', c: 'var(--text-3)' }, published: { l: 'En ligne', c: 'var(--ok)' }, closed: { l: 'Fermé', c: 'var(--warn)' } };

export default function BonyEditor({ id, workerUrl, openSheet, onBack, onStats, onChanged, onOpenForm }: { id: string; workerUrl: string | null; openSheet: (render: (close: (v?: unknown) => void) => React.ReactNode, opts?: any) => void; onBack: () => void; onStats: () => void; onChanged: () => void; onOpenForm?: (id: string) => void }) {
  const [row, setRow] = useState<BonyFormDetail | null>(null);
  const [def, setDef] = useState<BonyFormDef | null>(null);
  const [err, setErr] = useState('');
  const [save, setSave] = useState<Save>('idle');
  const [focus, setFocus] = useState<string | null>(null);
  const [panel, setPanel] = useState<'field' | 'form'>('form');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useEngineStore<'build' | 'studio' | 'share'>('bony.mode', 'build');
  const timer = useRef(0), pending = useRef<BonyFormDef | null>(null), changedRef = useRef(onChanged); changedRef.current = onChanged;
  const listRef = useRef<HTMLDivElement>(null), fresh = useRef(new Set<string>());

  const load = useCallback(() => db.getBonyForm(id).then((r) => { setRow(r); setDef(r.draft); setErr(''); }).catch((e) => setErr(e?.message || 'Lecture impossible.')), [id]);
  useEffect(() => { load(); }, [load]);

  // ---------------------------------------------------------------- enregistrement du brouillon (regroupé)
  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const d = pending.current; if (!d) return;
    pending.current = null; setSave('saving');
    try { const r = await db.saveBonyDraft(id, d); setRow((x) => (x ? { ...x, ...r, draft: d } : x)); setSave('saved'); changedRef.current(); }
    catch (e: any) { setSave('error'); hud(e?.message || 'Enregistrement impossible.'); }
  }, [id]);
  useEffect(() => () => { if (pending.current) flush(); }, [flush]);
  const update = (mut: (d: BonyFormDef) => void, soon = false) => setDef((cur) => {
    if (!cur) return cur;
    const n = clone(cur); mut(n);
    pending.current = n; setSave('saving');
    window.clearTimeout(timer.current); timer.current = window.setTimeout(flush, soon ? 50 : 800);
    return n;
  });
  const setField = (fid: string, patch: Partial<Field> | ((f: Field) => void)) => update((d) => {
    const f = d.fields.find((x) => x.id === fid); if (!f) return;
    if (typeof patch === 'function') patch(f); else Object.assign(f, patch);
  });

  const problems = useMemo(() => (def ? checkDef(def) : []), [def]);
  const dirty = !!row?.published && !!def && JSON.stringify(def) !== JSON.stringify(row.published);

  // ---------------------------------------------------------------- structure
  const addField = (t: FieldType) => {
    const f = newField(t), at = focus ? (def!.fields.findIndex((x) => x.id === focus) + 1 || def!.fields.length) : def!.fields.length;
    fresh.current.add(f.id);
    update((d) => { d.fields.splice(at, 0, f); }, true);
    setFocus(f.id); setPanel('field');
  };
  const removeField = (fid: string) => {
    const el = listRef.current?.querySelector(`[data-fid="${fid}"]`);
    const go = () => { update((d) => { d.fields = d.fields.filter((x) => x.id !== fid); d.fields.forEach((x) => { if (x.showIf) x.showIf.rules = x.showIf.rules.filter((r) => r.field !== fid); }); }, true); if (focus === fid) { setFocus(null); setPanel('form'); } };
    const a = anim(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-28px) scale(.96)' }], { duration: 240, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'forwards' });
    if (a) a.onfinish = go; else go();
  };
  const move = (fid: string, d: number) => update((x) => { const i = x.fields.findIndex((f) => f.id === fid), j = i + d; if (i < 0 || j < 0 || j >= x.fields.length) return; const [f] = x.fields.splice(i, 1); x.fields.splice(j, 0, f); }, true);
  const duplicate = (fid: string) => { const src = def!.fields.find((f) => f.id === fid); if (!src) return; const c = copyField(src); fresh.current.add(c.id); update((d) => { d.fields.splice(d.fields.findIndex((f) => f.id === fid) + 1, 0, c); }, true); setFocus(c.id); };

  useLayoutEffect(() => {
    if (!fresh.current.size) return;
    fresh.current.forEach((fid) => { const el = listRef.current?.querySelector(`[data-fid="${fid}"]`); anim(el, [{ opacity: 0, transform: 'translateY(14px) scale(.97)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy', duration: 520 }); (el as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); });
    fresh.current.clear();
  });

  // Glisser une carte pour la déplacer (mêmes gestes que l'éditeur Google : FLIP à la pose).
  const dragDown = (e: React.PointerEvent, fid: string) => {
    if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
    const cards = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-fid]') || [])];
    const from = cards.findIndex((c) => c.dataset.fid === fid); if (from < 0) return;
    const me = cards[from], rects = cards.map((c) => c.getBoundingClientRect()), hgt = rects[from].height + 12, sy = e.clientY; let to = from;
    me.classList.add('drag');
    const mv = (ev: PointerEvent) => {
      const dy = ev.clientY - sy, mid = rects[from].top + rects[from].height / 2 + dy; to = from;
      rects.forEach((r, k) => { if (k < from && mid < r.top + r.height / 2) to = Math.min(to, k); if (k > from && mid > r.top + r.height / 2) to = Math.max(to, k); });
      me.style.transform = `translateY(${dy}px) scale(1.02) rotate(${Math.max(-1.2, Math.min(1.2, dy / 300))}deg)`;
      cards.forEach((c, k) => { if (k === from) return; const s = from < to && k > from && k <= to ? -hgt : from > to && k < from && k >= to ? hgt : 0; c.style.transform = s ? `translateY(${s}px)` : ''; });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      const before = cards.map((c) => c.getBoundingClientRect()); me.classList.remove('drag'); cards.forEach((c) => { c.style.transform = ''; });
      if (to === from) return;
      update((d) => { const [f] = d.fields.splice(from, 1); d.fields.splice(to, 0, f); }, true);
      requestAnimationFrame(() => requestAnimationFrame(() => [...(listRef.current?.querySelectorAll<HTMLElement>('[data-fid]') || [])].forEach((c) => {
        const k = cards.findIndex((x) => x.dataset.fid === c.dataset.fid); if (k < 0) return;
        const dy = before[k].top - c.getBoundingClientRect().top; if (Math.abs(dy) > 1) anim(c, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { spring: c.dataset.fid === fid ? 'bouncy' : 'snappy' });
      })));
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  // ---------------------------------------------------------------- publication
  const publish = async (el: HTMLElement) => {
    if (problems.length) { gx().menu.open([{ header: 'À corriger avant de publier' }, ...problems.slice(0, 10).map((p) => ({ label: p, icon: 'alert', action: () => {} }))], el, { align: 'right' }); return; }
    setBusy(true);
    try { await flush(); const r = await db.publishBonyForm(id); setRow((x) => (x ? { ...x, ...r, published: clone(def) } : x)); hud(row?.version ? 'Modifications publiées' : 'Formulaire en ligne'); onChanged(); await load(); }
    catch (e: any) { hud(e?.message || 'Publication impossible.'); }
    finally { setBusy(false); }
  };
  const close = async () => {
    setBusy(true);
    try { const r = await db.closeBonyForm(id); setRow((x) => (x ? { ...x, ...r } : x)); hud('Formulaire fermé : il n’accepte plus de réponses'); onChanged(); }
    catch (e: any) { hud(e?.message || 'Fermeture impossible.'); }
    finally { setBusy(false); }
  };
  const copyLink = () => { if (!row?.url) return; navigator.clipboard?.writeText(row.url).then(() => hud('Lien du formulaire copié'), () => hud(row.url!)); };
  const me = gx().ctx?.uid as string | undefined, following = !!me && !!row?.followers?.includes(me);
  const follow = async () => {
    try { const r = await db.followBonyForm(id, !following); setRow((x) => (x ? { ...x, followers: r.followers } : x)); hud(!following ? 'Vous serez prévenu de chaque réponse' : 'Vous ne suivez plus ce formulaire'); }
    catch (e: any) { hud(e?.message || 'Abonnement impossible.'); }
  };
  const versions = () => openSheet((close) => <VersionsSheet formId={id} close={() => close()} onRestored={() => { load(); changedRef.current(); }} />, { width: 620 });
  // Dupliquer : brouillon en cours enregistré d'abord (la copie part du brouillon du serveur), puis ouverture de la copie.
  const duplicateForm = async () => { try { await flush(); const c = await db.duplicateBonyForm(id); hud('Copie créée'); onChanged(); onOpenForm?.(c.id); } catch (e: any) { hud(e?.message || 'Duplication impossible.'); } };
  const remove = (el: HTMLElement) => gx().menu.open([
    { label: 'Dupliquer le formulaire', icon: 'copy', action: duplicateForm },
    { label: 'Historique des versions…', icon: 'clock', action: versions },
    '-',
    { header: `Supprimer « ${def?.title} » ?` },
    { label: `Supprimer définitivement${row?.responseCount ? ` (et ses ${row.responseCount} réponses)` : ''}`, icon: 'trash', action: async () => { try { await db.deleteBonyForm(id); hud('Formulaire supprimé'); onChanged(); onBack(); } catch (e: any) { hud(e?.message || 'Suppression impossible.'); } } },
    { label: 'Annuler', action: () => {} },
  ], el, { align: 'right' });

  // ---------------------------------------------------------------- rendu
  if (err && !def) return <div className="frm-ed"><div className="frm-edbar"><button className="btn sm" onClick={onBack}><Icon name="chevleft" size="sm" />Formulaires</button></div><div className="frm-err">{err}</div></div>;
  if (!def || !row) return <div className="frm-ed"><div className="frm-empty">Chargement…</div></div>;
  const st = STATUS[row.status] || STATUS.draft, cur = def.fields.find((f) => f.id === focus) || null;
  const saveTxt = save === 'saving' ? 'Enregistrement…' : save === 'saved' ? 'Brouillon enregistré' : save === 'error' ? 'Échec de l’enregistrement' : '';
  return (
    <div className="frm-ed bfe">
      <div className="frm-edbar">
        <button className="btn sm" onClick={onBack}><Icon name="chevleft" size="sm" />Formulaires</button>
        <b className="ellipsis frm-edt">{def.title || 'Sans titre'}</b>
        <span className="badge" style={{ '--c': st.c } as React.CSSProperties}><i className="dot" />{st.l}</span>
        {dirty ? <span className="badge" style={{ '--c': 'var(--warn)' } as React.CSSProperties}>Modifications non publiées</span> : null}
        <span className={`frm-save ${save}`}>{save === 'saving' ? <i className="spin" /> : save === 'saved' ? <Icon name="check" size="sm" /> : null}<span className="frm-savet">{saveTxt}</span></span>
        <span className="grow" />
        <Seg value={mode} onChange={setMode} options={[['build', 'Construire'], ['studio', 'Studio'], ['share', 'Partager']]} />
        {row.status !== 'draft' && row.url ? <>
          <button className="btn sm" onClick={copyLink} data-tip={row.url}><Icon name="link" size="sm" />Copier le lien</button>
          <button className="btn sm" onClick={() => window.open(row.url!, '_blank', 'noopener')}><Icon name="eye" size="sm" />Ouvrir</button>
        </> : null}
        <button className="btn sm" onClick={onStats}><Icon name="trending" size="sm" />Réponses</button>
        {row.status === 'published' ? <button className="btn sm" disabled={busy} onClick={close}>Fermer</button> : null}
        <button className="btn sm primary" disabled={busy || (row.status === 'published' && !dirty)} onClick={(e) => publish(e.currentTarget)} data-tip={problems.length ? `${problems.length} point(s) à corriger` : undefined}>
          <Icon name="send" size="sm" />{busy ? 'Publication…' : row.status === 'draft' ? 'Publier' : row.status === 'closed' ? 'Rouvrir et publier' : 'Publier les modifications'}{problems.length ? <span className="count">{problems.length}</span> : null}</button>
        <button className={`icon-btn sm ${following ? 'on' : ''}`} aria-label={following ? 'Ne plus suivre' : 'Suivre'} aria-pressed={following} data-tip={following ? 'Vous êtes prévenu de chaque réponse (cliquer pour ne plus suivre)' : 'Suivre : être prévenu de chaque réponse'} onClick={follow}><Icon name={following ? 'bell' : 'belloff'} size="sm" /></button>
        <button className="icon-btn sm" aria-label="Plus" onClick={(e) => remove(e.currentTarget)}><Icon name="more" size="sm" /></button>
      </div>
      {mode === 'share' ? (
        <div className="bfe-body bsh-body"><Share def={def} row={row} update={update} /></div>
      ) : mode === 'studio' ? (
        <div className="bfe-body bst-body">
          <StudioPreview def={def} workerUrl={workerUrl} onEditField={(fid) => { setMode('build'); setFocus(fid); setPanel('field'); requestAnimationFrame(() => listRef.current?.querySelector(`[data-fid="${fid}"]`)?.scrollIntoView({ block: 'center' })); }} />
          <aside className="bfe-side scroll"><StudioPanel def={def} update={update} /></aside>
        </div>
      ) : (
      <div className="bfe-body">
        <div className="frm-edscroll scroll">
          <div className="frm-edcol">
            <section className={`frm-hcard bfe-head ${panel === 'form' && !focus ? 'on' : ''}`} onPointerDown={() => { setFocus(null); setPanel('form'); }} style={{ '--bp': def.theme.primary } as React.CSSProperties}>
              <AutoInput cls="frm-htitle" value={def.title} placeholder="Titre du formulaire" onChange={(v) => update((d) => { d.title = v; })} />
              <AutoInput cls="frm-hdesc" multiline value={def.description || ''} placeholder="Description (facultatif)" onChange={(v) => update((d) => { d.description = v; })} />
            </section>
            <div className="frm-items" ref={listRef}>
              {def.fields.map((f, i) => (
                <React.Fragment key={f.id}><FieldCard f={f} i={i} n={def.fields.length} on={focus === f.id} def={def}
                  onFocus={() => { setFocus(f.id); setPanel('field'); }} set={(p) => setField(f.id, p)}
                  onMove={(d) => move(f.id, d)} onDup={() => duplicate(f.id)} onDel={() => removeField(f.id)} onDrag={(e) => dragDown(e, f.id)} /></React.Fragment>
              ))}
              {!def.fields.length ? <div className="frm-empty">Formulaire vide : ajoutez une première question ci-dessous.</div> : null}
            </div>
            <AddBar onAdd={addField} />
          </div>
        </div>
        <aside className="bfe-side scroll">
          <Seg value={cur && panel === 'field' ? 'field' : 'form'} onChange={(v) => setPanel(v as 'field' | 'form')} options={[['field', 'Champ'], ['form', 'Formulaire']]} />
          {cur && panel === 'field' ? <FieldSettings f={cur} def={def} set={(p) => setField(cur.id, p)} /> : <><ProjectTags row={row} onSaved={(r) => { setRow((x) => (x ? { ...x, ...r } : x)); changedRef.current(); }} /><FormSettings def={def} update={update} /></>}
          {problems.length ? <div className="bfe-probs"><b><Icon name="alert" size="sm" />Avant de publier</b>{problems.map((p, k) => <span key={k}>{p}</span>)}</div> : null}
        </aside>
      </div>
      )}
    </div>
  );
}

// =====================================================================
// Pièces
// =====================================================================
function AutoInput({ value, onChange, placeholder, cls = '', multiline = false }: { value: string; onChange: (v: string) => void; placeholder?: string; cls?: string; multiline?: boolean }) {
  const [v, setV] = useState(value);
  const editing = useRef(false), ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!editing.current) setV(value); }, [value]);
  useLayoutEffect(() => { const t = ref.current; if (t) { t.style.height = '0px'; t.style.height = `${t.scrollHeight}px`; } }, [v]);
  const p = { value: v, placeholder, className: cls, onFocus: () => (editing.current = true), onBlur: () => { editing.current = false; }, onChange: (e: any) => { setV(e.target.value); onChange(e.target.value); } };
  return multiline ? <textarea ref={ref} rows={1} {...p} /> : <input {...p} />;
}

function AddBar({ onAdd }: { onAdd: (t: FieldType) => void }) {
  const open = (el: HTMLElement) => {
    const groups = [...new Set(TYPES.map((t) => t.g))];
    gx().menu.open(groups.flatMap((g, k) => [...(k ? ['-'] : []), { header: g }, ...TYPES.filter((t) => t.g === g).map((t) => ({ label: t.l, icon: t.icon, action: () => onAdd(t.t) }))]), el, {});
  };
  return (
    <div className="frm-add">
      <button className="btn primary" onClick={() => onAdd('short')}><Icon name="plus" size="sm" />Question</button>
      <button className="btn" onClick={() => onAdd('choice')}><Icon name="target" size="sm" />Choix</button>
      <button className="btn" onClick={() => onAdd('section')}><Icon name="layers" size="sm" />Section</button>
      <button className="btn" onClick={(e) => open(e.currentTarget)}><Icon name="grid" size="sm" />Tous les types…</button>
    </div>
  );
}

function FieldCard({ f, i, n, on, def, onFocus, set, onMove, onDup, onDel, onDrag }: {
  f: Field; i: number; n: number; on: boolean; def: BonyFormDef; onFocus: () => void; set: (p: Partial<Field> | ((f: Field) => void)) => void;
  onMove: (d: number) => void; onDup: () => void; onDel: () => void; onDrag: (e: React.PointerEvent) => void;
}) {
  const td = typeDef(f.type);
  const cond = f.showIf?.rules.length ? f.showIf.rules.map((r) => def.fields.find((x) => x.id === r.field)?.label || '?').join(f.showIf.mode === 'any' ? ' ou ' : ' et ') : null;
  return (
    <article className={`frm-item bfe-item ${on ? 'on' : ''} ${f.type === 'section' ? 'sec' : ''}`} data-fid={f.id} onPointerDown={() => !on && onFocus()}>
      <div className="frm-drag" onPointerDown={onDrag} data-tip="Glisser pour déplacer"><i /><i /><i /></div>
      <div className="frm-ih">
        <span className="bfe-ty" data-tip={td.l}><Icon name={td.icon} size="sm" /></span>
        <AutoInput cls="frm-ititle" multiline value={f.label} placeholder={f.type === 'section' ? 'Titre de la section' : f.type === 'hidden' ? 'Nom du champ caché' : 'Intitulé de la question'} onChange={(v) => set({ label: v })} />
        {f.required ? <span className="bfe-req" data-tip="Obligatoire">*</span> : null}
      </div>
      {f.type !== 'section' && (on || f.help) ? <AutoInput cls="frm-idesc" multiline value={f.help || ''} placeholder={f.type === 'statement' ? 'Texte affiché' : 'Aide (facultatif)'} onChange={(v) => set((x) => { if (v) x.help = v; else delete x.help; })} /> : null}
      <Preview f={f} on={on} set={set} />
      {cond || f.param ? <div className="bfe-tags">
        {cond ? <span className="badge" style={{ '--c': 'var(--info)' } as React.CSSProperties}><Icon name="filter" size="sm" />Si {cond}</span> : null}
        {f.param ? <span className="badge" style={{ '--c': 'var(--bony-violet)' } as React.CSSProperties}><Icon name="link" size="sm" />?{f.param}=…</span> : null}
      </div> : null}
      {on ? (
        <div className="frm-ifoot">
          <span className="faint" style={{ fontSize: 12 }}>{td.l}</span>
          <span className="grow" />
          <button className="icon-btn sm" aria-label="Monter" disabled={i === 0} onClick={() => onMove(-1)}><Icon name="arrowup" size="sm" /></button>
          <button className="icon-btn sm" aria-label="Descendre" disabled={i === n - 1} onClick={() => onMove(1)}><Icon name="arrowdown" size="sm" /></button>
          <button className="icon-btn sm" aria-label="Dupliquer" data-tip="Dupliquer" onClick={onDup}><Icon name="copy" size="sm" /></button>
          <button className="icon-btn sm danger" aria-label="Supprimer" data-tip="Supprimer" onClick={onDel}><Icon name="trash" size="sm" /></button>
          {!isLayout(f) && f.type !== 'hidden' ? <><span className="frm-sep" /><label className="frm-req"><span>Obligatoire</span><input type="checkbox" checked={!!f.required} onChange={(e) => set({ required: e.target.checked })} /><span className="sw" /></label></> : null}
        </div>
      ) : null}
    </article>
  );
}

/** Aperçu du champ dans la carte ; les options d'un choix s'éditent ici. */
function Preview({ f, on, set }: { f: Field; on: boolean; set: (p: Partial<Field> | ((f: Field) => void)) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]), focusNext = useRef<number | null>(null);
  useEffect(() => { if (focusNext.current !== null) { refs.current[focusNext.current]?.focus(); refs.current[focusNext.current]?.select(); focusNext.current = null; } });
  if (f.type === 'concession' || f.type === 'brand') return <div className="frm-fake">{(f.options || bonyOptions(f.type) || []).slice(0, 4).map((o) => o.label).join(' · ')}{(f.options || []).length > 4 ? ' …' : ''} <span className="faint">(liste tenue par Gearbox)</span></div>;
  if (f.type === 'testdrive' && f.drive) { const n = driveDays(f.drive).length; return <div className="frm-fake">🚗 {f.drive.cars.map((c) => `${c.label} ×${c.count}`).join(' · ')} — créneaux de {f.drive.slot} min, {n} jour{n > 1 ? 's' : ''} à venir</div>; }
  if (f.type === 'signature') return <div className="frm-fake paragraph">✍️ Zone de signature</div>;
  if (f.type === 'file') return <div className="frm-fake">📎 Dépôt de {f.maxFiles || 1} fichier{(f.maxFiles || 1) > 1 ? 's' : ''} ({(f.accept || []).includes('application/pdf') ? 'images ou PDF' : 'images'}, {f.maxSizeMb || 10} Mo au plus)</div>;
  if (f.type === 'calc') return <div className="frm-fake">{f.formula?.kind === 'sum' ? 'Σ Somme' : '★ Score'} de {(f.formula?.fields || []).length} question{(f.formula?.fields || []).length > 1 ? 's' : ''}{f.calcHidden ? ' · caché au répondant' : ' · affiché'}</div>;
  if (['choice', 'multi', 'dropdown', 'slot'].includes(f.type)) {
    const opts = f.options || [], mark = f.type === 'multi' ? 'sq' : f.type === 'dropdown' ? 'num' : 'rd';
    return (
      <div className="frm-opts">
        {opts.map((o, j) => (
          <div key={o.id} className="frm-opt">
            <span className={`mk ${mark}`}>{mark === 'num' ? `${j + 1}.` : null}</span>
            {on ? <input ref={(el) => (refs.current[j] = el)} className="frm-optin" value={o.label} placeholder={`Option ${j + 1}`}
              onChange={(e) => set((x) => { x.options![j].label = e.target.value; })}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext.current = j + 1; set((x) => { x.options!.splice(j + 1, 0, newOption(`Option ${x.options!.length + 1}`)); }); } }} />
              : <span className="frm-optv">{o.label}</span>}
            {f.type === 'slot' ? <span className="faint bfe-cap">{o.capacity ?? '∞'} pl.</span> : null}
            {on && opts.length > 1 ? <button className="icon-btn sm" aria-label="Retirer l’option" onClick={() => set((x) => { x.options!.splice(j, 1); })}><Icon name="close" size="sm" /></button> : null}
          </div>
        ))}
        {f.allowOther ? <div className="frm-opt other"><span className={`mk ${mark}`} /><span className="frm-other">Autre…</span></div> : null}
        {on ? <div className="frm-optadd"><button className="btn sm" onClick={() => { focusNext.current = opts.length; set((x) => { x.options = [...(x.options || []), newOption(`Option ${(x.options || []).length + 1}`)]; }); }}><Icon name="plus" size="sm" />Option</button></div> : null}
      </div>
    );
  }
  if (f.type === 'scale' || f.type === 'nps') { const lo = f.type === 'nps' ? 0 : f.min ?? 1, hi = f.type === 'nps' ? 10 : f.max ?? 5; return <div className="frm-scale">{f.minLabel ? <span className="faint">{f.minLabel}</span> : null}{Array.from({ length: hi - lo + 1 }, (_, k) => <span key={k} className="dot">{lo + k}</span>)}{f.maxLabel ? <span className="faint">{f.maxLabel}</span> : null}</div>; }
  if (f.type === 'rating') return <div className="frm-rating"><span className="ico">{Array.from({ length: f.max || 5 }, (_, k) => <i key={k}>{f.icon === 'heart' ? '♥' : f.icon === 'thumb' ? '👍' : '★'}</i>)}</span></div>;
  if (f.type === 'consent') return <div className="bfe-consent"><span className="mk sq" />{f.consentText}</div>;
  if (f.type === 'hidden') return <div className="frm-fake">Invisible pour le répondant · rempli par <b>?{f.param || '…'}=</b> dans le lien</div>;
  if (f.type === 'statement' || f.type === 'section') return null;
  const ph: Record<string, string> = { short: 'Réponse courte', long: 'Réponse longue', email: 'nom@exemple.fr', phone: '06 12 34 56 78', number: '0', postal: '63000', date: 'jj/mm/aaaa', time: 'hh:mm' };
  return <div className={`frm-fake ${f.type === 'long' ? 'paragraph' : ''}`}>{f.placeholder || ph[f.type] || ''}</div>;
}

// ---------------------------------------------------------------- réglages d'un champ
function FieldSettings({ f, def, set }: { f: Field; def: BonyFormDef; set: (p: Partial<Field> | ((f: Field) => void)) => void }) {
  const num = (k: 'min' | 'max' | 'maxLength' | 'minChoices' | 'maxChoices', v: string) => set((x) => { if (v === '') delete (x as any)[k]; else (x as any)[k] = Number(v); });
  const prev = def.fields.slice(0, def.fields.findIndex((x) => x.id === f.id)).filter((x) => !isLayout(x));
  const [frK, setFrK] = useState<number | null>(null);     // F5 : tuile dont on règle le cadrage
  const frO = frK !== null ? f.options?.[frK] : undefined;
  return (
    <div className="bfe-set">
      <div className="bfe-gt">{typeDef(f.type).l}</div>
      {!isLayout(f) && f.type !== 'consent' && f.type !== 'hidden' && !['choice', 'multi', 'scale', 'rating', 'nps', 'slot', 'calc', 'file', 'signature', 'testdrive'].includes(f.type) ? <Txt l="Texte d’exemple" v={f.placeholder || ''} on={(v) => set((x) => { if (v) x.placeholder = v; else delete x.placeholder; })} /> : null}
      {f.type === 'short' || f.type === 'long' ? <Num l="Longueur maximale" v={f.maxLength} on={(v) => num('maxLength', v)} /> : null}
      {f.type === 'number' ? <div className="bfe-row"><Num l="Minimum" v={f.min} on={(v) => num('min', v)} /><Num l="Maximum" v={f.max} on={(v) => num('max', v)} /></div> : null}
      {f.type === 'scale' ? <>
        <div className="bfe-row"><Sel l="De" v={String(f.min ?? 1)} opts={[['0', '0'], ['1', '1']]} on={(v) => set({ min: Number(v) })} /><Sel l="À" v={String(f.max ?? 5)} opts={[3, 4, 5, 6, 7, 8, 9, 10].map((n) => [String(n), String(n)])} on={(v) => set({ max: Number(v) })} /></div>
      </> : null}
      {f.type === 'scale' || f.type === 'nps' ? <div className="bfe-row"><Txt l="Libellé du bas" v={f.minLabel || ''} on={(v) => set((x) => { if (v) x.minLabel = v; else delete x.minLabel; })} /><Txt l="Libellé du haut" v={f.maxLabel || ''} on={(v) => set((x) => { if (v) x.maxLabel = v; else delete x.maxLabel; })} /></div> : null}
      {f.type === 'rating' ? <div className="bfe-row"><Sel l="Niveaux" v={String(f.max || 5)} opts={[3, 4, 5, 6, 7, 8, 9, 10].map((n) => [String(n), String(n)])} on={(v) => set({ max: Number(v) })} /><Sel l="Symbole" v={f.icon || 'star'} opts={[['star', '★ Étoiles'], ['heart', '♥ Cœurs'], ['thumb', '👍 Pouces']]} on={(v) => set({ icon: v as any })} /></div> : null}
      {f.type === 'choice' || f.type === 'multi' ? <>
        <div className="bfe-gt">Présentation des options</div>
        <Seg value={f.display || 'list'} onChange={(v) => set((x) => { if (v === 'tiles') { x.display = 'tiles'; x.columns = x.columns || 2; } else { delete x.display; delete x.columns; } })} options={[['list', 'Liste'], ['tiles', 'Tuiles illustrées']]} />
        {f.display === 'tiles' ? <>
          <Sel l="Colonnes" v={String(f.columns || 2)} opts={[['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']]} on={(v) => set({ columns: Number(v) as any })} />
          <div className="bfe-tiles">{(f.options || []).map((o, k) => (
            <div key={o.id} className="bfe-tile">
              {o.image ? <Framed url={o.image} frame={o.frame} ratio={4 / 3} className="bfe-tprev" /> : <span className="bfe-tprev">{o.emoji || '·'}</span>}
              <span className="ellipsis bfe-tlab">{o.label || `Option ${k + 1}`}</span>
              <input className="bfe-in bfe-emoji" value={o.emoji || ''} placeholder="😀" maxLength={8} aria-label="Emoji" onChange={(e) => set((x) => { const v = [...e.target.value].slice(0, 2).join(''); if (v) x.options![k].emoji = v; else delete x.options![k].emoji; })} />
              <button className="icon-btn sm" aria-label="Image" data-tip={o.image ? 'Remplacer l’image' : 'Ajouter une image'} onClick={async () => { const u = await pickImage(900); if (u) set((x) => { x.options![k].image = u; }); }}><Icon name="image" size="sm" /></button>
              {o.image ? <button className={`icon-btn sm ${frK === k ? 'on' : ''}`} aria-label="Cadrer" data-tip="Cadrer l’image" onClick={() => setFrK(frK === k ? null : k)}><Icon name="target" size="sm" /></button> : null}
              {o.image ? <button className="icon-btn sm" aria-label="Retirer l’image" onClick={() => set((x) => { delete x.options![k].image; delete x.options![k].frame; })}><Icon name="close" size="sm" /></button> : null}
            </div>))}</div>
          {frO?.image ? <FrameEditor url={frO.image} frame={frO.frame} ratio={4 / 3} label={`Cadrage — ${frO.label || `Option ${frK! + 1}`}`} onClose={() => setFrK(null)}
            onChange={(fr) => set((x) => { const o = x.options?.[frK!]; if (!o) return; if (fr) o.frame = fr; else delete o.frame; })} /> : null}
          <div className="bfe-hint">Une image l’emporte sur l’emoji. Images recadrées en 4:3 ; sur téléphone, deux colonnes au plus.</div>
        </> : null}
        <Chk l="Proposer « Autre » (réponse libre)" v={!!f.allowOther} on={(v) => set({ allowOther: v })} />
      </> : null}
      {f.type === 'testdrive' ? <DriveEditor f={f} set={set} /> : null}
      {f.type === 'slot' ? <>
        <div className="bfe-gt">Places par créneau</div>
        <div className="bfe-tiles">{(f.options || []).map((o, k) => (
          <div key={o.id} className="bfe-tile"><span className="ellipsis bfe-tlab">{o.label || `Créneau ${k + 1}`}</span>
            <input className="bfe-in bfe-emoji" type="number" min={1} value={o.capacity ?? ''} placeholder="∞" aria-label="Places" onChange={(e) => set((x) => { const n = Number(e.target.value); if (e.target.value && n >= 1) x.options![k].capacity = n; else delete x.options![k].capacity; })} /></div>))}</div>
        <div className="bfe-hint">Vide = illimité. Les places restantes s’affichent aux répondants ; un créneau complet est grisé.</div>
      </> : null}
      {def.fields.some((x) => x.type === 'calc' && x.formula?.kind === 'score' && x.formula.fields.includes(f.id)) && f.options ? <>
        <div className="bfe-gt">Points (pour le score)</div>
        <div className="bfe-tiles">{f.options.map((o, k) => (
          <div key={o.id} className="bfe-tile"><span className="ellipsis bfe-tlab">{o.label || `Option ${k + 1}`}</span>
            <input className="bfe-in bfe-emoji" type="number" value={o.score ?? ''} placeholder="0" aria-label="Points" onChange={(e) => set((x) => { const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n)) x.options![k].score = n; else delete x.options![k].score; })} /></div>))}</div>
      </> : null}
      {f.type === 'calc' ? <CalcSettings f={f} def={def} set={set} /> : null}
      {f.type === 'file' ? <>
        <div className="bfe-row">
          <Sel l="Types acceptés" v={(f.accept || []).includes('application/pdf') ? 'both' : 'img'} opts={[['both', 'Images et PDF'], ['img', 'Images seulement']]} on={(v) => set({ accept: v === 'both' ? ['image/*', 'application/pdf'] : ['image/*'] })} />
          <Sel l="Fichiers" v={String(f.maxFiles || 1)} opts={[1, 2, 3, 4, 5].map((n) => [String(n), String(n)])} on={(v) => set({ maxFiles: Number(v) })} />
          <Sel l="Taille max." v={String(f.maxSizeMb || 10)} opts={[2, 5, 10].map((n) => [String(n), `${n} Mo`])} on={(v) => set({ maxSizeMb: Number(v) })} />
        </div>
        <div className="bfe-hint">Les fichiers sont gardés sur le serveur de Gearbox (jamais publics) et téléchargeables dans « Réponses ». Effacés avec la réponse.</div>
      </> : null}
      {f.type === 'multi' ? <div className="bfe-row"><Num l="Choix minimum" v={f.minChoices} on={(v) => num('minChoices', v)} /><Num l="Choix maximum" v={f.maxChoices} on={(v) => num('maxChoices', v)} /></div> : null}
      {CHOICE_TYPES.includes(f.type) && f.type !== 'concession' && f.type !== 'brand' ? <Chk l="Ordre aléatoire des options" v={!!f.shuffle} on={(v) => set({ shuffle: v })} /> : null}
      {f.type === 'consent' ? <Txt l="Texte légal (RGPD)" multiline v={f.consentText || ''} on={(v) => set({ consentText: v })} /> : null}
      {f.type === 'email' ? <Chk l="Une seule réponse par adresse" v={!!f.unique} on={(v) => set({ unique: v })} /> : null}
      {!isLayout(f) && !['consent', 'calc', 'file', 'signature', 'testdrive'].includes(f.type) ? <>
        <div className="bfe-gt">Préremplissage depuis le lien</div>
        <Txt l={f.type === 'hidden' ? 'Paramètre du lien (obligatoire)' : 'Paramètre du lien (facultatif)'} v={f.param || ''} placeholder="ex. email, concession, source" on={(v) => set((x) => { const p = v.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30); if (p) x.param = p; else delete x.param; })} />
        {f.param ? <div className="bfe-hint">Lien d’e-mailing : <code>…/{'{id}'}?{f.param}=valeur</code>. Avec Sarbacane ou Brevo, mettez la variable du contact (ex. <code>?{f.param}={'{{EMAIL}}'}</code>).</div> : null}
        {f.param && f.type !== 'hidden' ? <Chk l="Valeur préremplie non modifiable" v={!!f.lockPrefill} on={(v) => set({ lockPrefill: v })} /> : null}
      </> : null}
      {f.type !== 'section' && f.type !== 'hidden' && def.theme.layout !== 'steps' ? <Chk l="Demi-largeur (côte à côte avec la voisine, sur ordinateur)" v={f.width === 'half'} on={(v) => set((x) => { if (v) x.width = 'half'; else delete x.width; })} /> : null}
      <div className="bfe-gt">Afficher seulement si…</div>
      <Logic f={f} prev={prev} set={set} />
    </div>
  );
}

/** Condition d'affichage : règles sur les questions PRÉCÉDENTES (le format refuse les autres). */
function Logic({ f, prev, set }: { f: Field; prev: Field[]; set: (p: Partial<Field> | ((f: Field) => void)) => void }) {
  if (!prev.length) return <div className="bfe-hint">Aucune question avant celle-ci : rien à conditionner.</div>;
  return <CondEditor cond={f.showIf} fields={prev} onChange={(c) => set((x) => { if (c) x.showIf = c; else delete x.showIf; })} />;
}
const OPS_ALL: [string, string][] = [['eq', 'est'], ['neq', 'n’est pas'], ['in', 'est l’un de'], ['nin', 'n’est aucun de'], ['filled', 'est rempli'], ['empty', 'est vide'], ['contains', 'contient'], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤']];
/** Éditeur de condition (toutes / au moins une règle), sur une liste de champs donnée. `null` = aucune règle. */
function CondEditor({ cond, fields, onChange }: { cond?: Condition; fields: Field[]; onChange: (c: Condition | null) => void }) {
  const c = cond || { mode: 'all' as const, rules: [] };
  const upd = (fn: (x: Condition) => void) => { const n: Condition = JSON.parse(JSON.stringify(c)); fn(n); onChange(n.rules.length ? n : null); };
  const ops = (src?: Field) => OPS_ALL.filter(([v]) => (src?.options ? !['contains', 'gt', 'gte', 'lt', 'lte'].includes(v) : !['in', 'nin'].includes(v)));
  return (
    <div className="bfe-logic">
      {c.rules.length > 1 ? <Seg value={c.mode} onChange={(v) => upd((x) => { x.mode = v as any; })} options={[['all', 'Toutes les conditions'], ['any', 'Au moins une']]} /> : null}
      {c.rules.map((r, k) => { const src = fields.find((x) => x.id === r.field); const vals = Array.isArray(r.value) ? r.value.map(String) : []; return (
        <div key={k} className="bfe-rule">
          <select value={r.field} onChange={(e) => upd((x) => { const nf = fields.find((y) => y.id === e.target.value); x.rules[k] = { field: e.target.value, op: nf?.options ? 'eq' : nf?.type === 'calc' || nf?.type === 'number' ? 'gte' : 'filled', value: '' }; })}>{fields.map((x) => <option key={x.id} value={x.id}>{x.label || typeDef(x.type).l}</option>)}</select>
          <select value={r.op} onChange={(e) => upd((x) => { x.rules[k].op = e.target.value as any; x.rules[k].value = ['in', 'nin'].includes(e.target.value) ? [] : ''; })}>{ops(src).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {r.op === 'filled' || r.op === 'empty' ? <span /> : (r.op === 'in' || r.op === 'nin') && src?.options ? (
            <span className="bfe-multi">{src.options.map((o) => <label key={o.id} className={vals.includes(o.id) ? 'on' : ''}><input type="checkbox" checked={vals.includes(o.id)} onChange={(e) => upd((x) => { const v = new Set(vals); if (e.target.checked) v.add(o.id); else v.delete(o.id); x.rules[k].value = [...v]; })} />{o.label}</label>)}</span>
          ) : src?.options ? (
            <select value={String(r.value ?? '')} onChange={(e) => upd((x) => { x.rules[k].value = e.target.value; })}><option value="">—</option>{src.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          ) : <input value={String(r.value ?? '')} inputMode={['gt', 'gte', 'lt', 'lte'].includes(r.op) ? 'decimal' : undefined} onChange={(e) => upd((x) => { x.rules[k].value = e.target.value; })} placeholder="valeur" />}
          <button className="icon-btn sm" aria-label="Retirer" onClick={() => upd((x) => { x.rules.splice(k, 1); })}><Icon name="close" size="sm" /></button>
        </div>); })}
      <button className="btn sm" onClick={() => upd((x) => { const last = fields[fields.length - 1]; x.rules.push({ field: last.id, op: last.options ? 'eq' : last.type === 'calc' || last.type === 'number' ? 'gte' : 'filled', value: '' }); })}><Icon name="plus" size="sm" />Condition</button>
    </div>
  );
}

/** Réglages d'un champ calculé : score (points des options) ou somme (nombres, notes, échelles). */
function CalcSettings({ f, def, set }: { f: Field; def: BonyFormDef; set: (p: Partial<Field> | ((f: Field) => void)) => void }) {
  const kind = f.formula?.kind || 'score', ids = f.formula?.fields || [];
  const src = def.fields.filter((x) => x.id !== f.id && (kind === 'score' ? !!x.options && x.type !== 'concession' && x.type !== 'brand' : ['number', 'scale', 'rating', 'nps'].includes(x.type)));
  return (
    <>
      <Seg value={kind} onChange={(v) => set((x) => { x.formula = { kind: v as any, fields: [] }; })} options={[['score', 'Score (points des réponses)'], ['sum', 'Somme de nombres']]} />
      <div className="bfe-gt">{kind === 'score' ? 'Questions comptées' : 'Nombres additionnés'}</div>
      {src.length ? <div className="bfe-multi col">{src.map((x) => <label key={x.id} className={ids.includes(x.id) ? 'on' : ''}><input type="checkbox" checked={ids.includes(x.id)} onChange={(e) => set((y) => { const n = new Set(y.formula?.fields || []); if (e.target.checked) n.add(x.id); else n.delete(x.id); y.formula = { kind, fields: def.fields.filter((z) => n.has(z.id)).map((z) => z.id) }; })} />{x.label || typeDef(x.type).l}</label>)}</div>
        : <div className="bfe-hint">{kind === 'score' ? 'Ajoutez d’abord une question à choix.' : 'Ajoutez d’abord un nombre, une échelle ou une note.'}</div>}
      {kind === 'score' && ids.length ? <div className="bfe-hint">Les points se règlent sur chaque question cochée (panneau « Champ » de la question).</div> : null}
      <Chk l="Cacher le résultat au répondant" v={!!f.calcHidden} on={(v) => set({ calcHidden: v })} />
      <div className="bfe-hint">Utilisable dans les conditions (« Score ≥ 8 ») et pour choisir l’écran de fin.</div>
    </>
  );
}

// ---------------------------------------------------------------- réglages du formulaire
function FormSettings({ def, update }: { def: BonyFormDef; update: (mut: (d: BonyFormDef) => void, soon?: boolean) => void }) {
  const s = def.settings;
  return (
    <div className="bfe-set">
      <div className="bfe-hint">Couleurs, fond, images, polices, boutons et animations : onglet <b>Studio</b>, en haut.</div>
      <div className="bfe-gt">Écran d’accueil</div>
      <Chk l="Afficher un écran d’accueil avant la première question" v={!!s.welcome?.enabled} on={(v) => update((d) => { d.settings.welcome = { title: d.title, button: 'Commencer', ...(d.settings.welcome || {}), enabled: v }; }, true)} />
      {s.welcome?.enabled ? <>
        <Txt l="Titre" v={s.welcome.title || ''} on={(v) => update((d) => { d.settings.welcome!.title = v; })} />
        <Txt l="Message" multiline v={s.welcome.message || ''} placeholder="ex. 2 minutes pour gagner un week-end en Alpine A290" on={(v) => update((d) => { d.settings.welcome!.message = v; })} />
        <Txt l="Bouton" v={s.welcome.button || ''} placeholder="Commencer" on={(v) => update((d) => { d.settings.welcome!.button = v.slice(0, 40); })} />
        <ImgPick l="Image" url={s.welcome.image || null} on={(u) => update((d) => { d.settings.welcome!.image = u; delete d.settings.welcome!.frame; }, true)} />
        <FrameToggle url={s.welcome.image || null} frame={s.welcome.frame} ratio={3.8} label="Cadrage de l’image d’accueil" onChange={(fr, soon) => update((d) => { if (fr) d.settings.welcome!.frame = fr; else delete d.settings.welcome!.frame; }, soon)} />
      </> : null}
      <div className="bfe-gt">Après l’envoi</div>
      <Txt l="Titre du remerciement" v={s.thankYou.title} on={(v) => update((d) => { d.settings.thankYou.title = v; })} />
      <Txt l="Message" multiline v={s.thankYou.message} on={(v) => update((d) => { d.settings.thankYou.message = v; })} />
      <ImgPick l="Image (facultatif)" url={s.thankYou.image || null} on={(u) => update((d) => { d.settings.thankYou.image = u; delete d.settings.thankYou.frame; }, true)} />
      <FrameToggle url={s.thankYou.image || null} frame={s.thankYou.frame} ratio={3.8} label="Cadrage de l’image de fin" onChange={(fr, soon) => update((d) => { if (fr) d.settings.thankYou.frame = fr; else delete d.settings.thankYou.frame; }, soon)} />
      <div className="bfe-row">
        <Txt l="Bouton (facultatif)" v={s.thankYou.button?.label || ''} placeholder="ex. Voir nos offres" on={(v) => update((d) => { const b = d.settings.thankYou.button || { label: '', url: '' }; b.label = v.slice(0, 40); d.settings.thankYou.button = b.label || b.url ? b : null; })} />
        <Txt l="Adresse du bouton" v={s.thankYou.button?.url || ''} placeholder="https://…" on={(v) => update((d) => { const b = d.settings.thankYou.button || { label: '', url: '' }; b.url = v.trim(); d.settings.thankYou.button = b.label || b.url ? b : null; })} />
      </div>
      <Txt l="Rediriger vers (facultatif)" v={s.thankYou.redirectUrl || ''} placeholder="https://www.bonyauto-mobile.com" on={(v) => update((d) => { d.settings.thankYou.redirectUrl = /^https?:\/\//.test(v) ? v : null; })} />
      <Endings def={def} update={update} />
      <div className="bfe-gt">Programmation</div>
      <div className="bfe-row">
        <label className="bfe-f"><span>Ouverture (facultatif)</span><input className="bfe-in" type="datetime-local" value={toLocal(s.openAt)} onChange={(e) => update((d) => { d.settings.openAt = e.target.value ? new Date(e.target.value).toISOString() : null; })} /></label>
        <label className="bfe-f"><span>Fermeture (facultatif)</span><input className="bfe-in" type="datetime-local" value={toLocal(s.closeAt)} onChange={(e) => update((d) => { d.settings.closeAt = e.target.value ? new Date(e.target.value).toISOString() : null; })} /></label>
      </div>
      <Num l="Nombre maximal de réponses (facultatif)" v={s.maxResponses ?? undefined} on={(v) => update((d) => { const n = Number(v); d.settings.maxResponses = v && n >= 1 ? Math.round(n) : null; })} />
      {s.openAt && s.closeAt && s.closeAt <= s.openAt ? <div className="bfe-probs"><b><Icon name="alert" size="sm" />La fermeture est avant l’ouverture.</b></div> : null}
      <div className="bfe-hint">Avant l’ouverture, le lien affiche « Ce formulaire ouvrira le … ». Fermeture ou maximum atteint : le message ci-dessous.</div>
      <div className="bfe-gt">Fermeture</div>
      <Txt l="Message quand le formulaire est fermé" multiline v={s.closedMessage || ''} on={(v) => update((d) => { d.settings.closedMessage = v; })} />
    </div>
  );
}

/** datetime-local ← ISO (heure du poste, Paris pour l'équipe). */
const toLocal = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d.getTime())) return ''; const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

/** Écrans de fin SELON la réponse (F3) : le premier dont la condition est remplie s'affiche. */
function Endings({ def, update }: { def: BonyFormDef; update: (mut: (d: BonyFormDef) => void, soon?: boolean) => void }) {
  const list = def.settings.endings || [], fields = def.fields.filter((f) => !isLayout(f) && f.type !== 'file' && f.type !== 'signature');
  const upd = (k: number, fn: (e: NonNullable<BonyFormDef['settings']['endings']>[number]) => void, soon = false) => update((d) => { fn(d.settings.endings![k]); }, soon);
  return (
    <>
      <div className="bfe-gt">Écrans de fin selon la réponse</div>
      {list.map((e, k) => (
        <div key={e.id} className="bfe-end">
          <div className="bfe-endh"><b>{k + 1}.</b><input className="bfe-in" value={e.name || ''} placeholder={`Écran ${k + 1} (nom interne)`} onChange={(ev) => upd(k, (x) => { x.name = ev.target.value.slice(0, 40); })} />
            <button className="icon-btn sm" aria-label="Monter" disabled={k === 0} onClick={() => update((d) => { const a = d.settings.endings!; [a[k - 1], a[k]] = [a[k], a[k - 1]]; }, true)}><Icon name="arrowup" size="sm" /></button>
            <button className="icon-btn sm danger" aria-label="Supprimer" onClick={() => update((d) => { d.settings.endings!.splice(k, 1); if (!d.settings.endings!.length) delete d.settings.endings; }, true)}><Icon name="trash" size="sm" /></button></div>
          <span className="faint" style={{ fontSize: 12 }}>S’affiche si…</span>
          {fields.length ? <CondEditor cond={e.when} fields={fields} onChange={(c) => upd(k, (x) => { x.when = c || { mode: 'all', rules: [] }; }, true)} /> : <div className="bfe-hint">Ajoutez d’abord des questions.</div>}
          <Txt l="Titre" v={e.title} on={(v) => upd(k, (x) => { x.title = v; })} />
          <Txt l="Message" multiline v={e.message} on={(v) => upd(k, (x) => { x.message = v; })} />
          <div className="bfe-row">
            <Txt l="Bouton (facultatif)" v={e.button?.label || ''} on={(v) => upd(k, (x) => { const b = x.button || { label: '', url: '' }; b.label = v.slice(0, 40); x.button = b.label || b.url ? b : null; })} />
            <Txt l="Adresse" v={e.button?.url || ''} placeholder="https://…" on={(v) => upd(k, (x) => { const b = x.button || { label: '', url: '' }; b.url = v.trim(); x.button = b.label || b.url ? b : null; })} />
          </div>
        </div>))}
      <button className="btn sm" onClick={() => update((d) => { d.settings.endings = [...(d.settings.endings || []), { id: 'e' + Date.now().toString(36), when: { mode: 'all', rules: [] }, title: 'Merci !', message: '' }]; }, true)}><Icon name="plus" size="sm" />Écran de fin conditionnel</button>
      <div className="bfe-hint">Quiz, jeu, qualification : « Score ≥ 8 → Bravo », « Projet = Occasion → message de l’équipe VO ». Aucun ne correspond : le remerciement ci-dessus.</div>
    </>
  );
}

// ---------------------------------------------------------------- petits champs
function ImgPick({ l, url, on }: { l: string; url: string | null; on: (u: string | null) => void }) {
  return (
    <div className="bfe-f"><span>{l}</span>
      <div className="bfe-img" style={url ? { backgroundImage: `url("${url}")` } : undefined}>
        <button className="btn sm" onClick={async () => { const u = await pickImage(1600); if (u) on(u); }}><Icon name="image" size="sm" />{url ? 'Remplacer' : 'Choisir'}</button>
        {url ? <button className="icon-btn sm" aria-label="Retirer" onClick={() => on(null)}><Icon name="close" size="sm" /></button> : null}
      </div>
    </div>
  );
}
function Txt({ l, v, on, multiline, placeholder }: { l: string; v: string; on: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  return <label className="bfe-f"><span>{l}</span><AutoInput cls="bfe-in" multiline={multiline} value={v} placeholder={placeholder} onChange={on} /></label>;
}
function Num({ l, v, on }: { l: string; v?: number; on: (v: string) => void }) {
  return <label className="bfe-f"><span>{l}</span><input className="bfe-in" type="number" value={v ?? ''} onChange={(e) => on(e.target.value)} /></label>;
}
function Sel({ l, v, opts, on }: { l: string; v: string; opts: string[][]; on: (v: string) => void }) {
  return <label className="bfe-f"><span>{l}</span><select className="bfe-in" value={v} onChange={(e) => on(e.target.value)}>{opts.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>;
}
function Chk({ l, v, on }: { l: string; v: boolean; on: (v: boolean) => void }) {
  return <label className="frm-tg"><input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} /><span className="sw" /><span>{l}</span></label>;
}
