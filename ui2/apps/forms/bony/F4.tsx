import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BonyFormRow, BonyFormDetail } from '../../../../types';
import { db } from '../../../../services/dataService';
import { SITES, BRANDS, SERVICES } from '../../../../constants';
import { useWorkspace } from '../../../store/workspace';
import { gx, hud, Icon } from '../../ui/kit';
import type { BonyFormDef } from '../../../../shared/bonyform';

// =====================================================================
// Forms Bony — lot F4 (02/10/2026) : rattachement à un projet et tags, versions publiées, tirage au sort,
// formulaires liés sur la fiche d'un projet. Règles : constants.ts (SITES, BRANDS, SERVICES ; Holding exclusif),
// tags d'un formulaire rattaché = ceux du PROJET, lus en direct par le serveur (`withTags`).
// =====================================================================

const STATUS: Record<string, { l: string; c: string }> = { draft: { l: 'Brouillon', c: 'var(--text-3)' }, published: { l: 'En ligne', c: 'var(--ok)' }, closed: { l: 'Fermé', c: 'var(--warn)' } };
const dt = (s: string) => new Date(s).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// ---------------------------------------------------------------- projet et tags
export function ProjectTags({ row, onSaved }: { row: BonyFormDetail; onSaved: (r: Partial<BonyFormRow>) => void }) {
  const projects = useWorkspace((s) => s.projects);
  const [busy, setBusy] = useState(false);
  const opts = useMemo(() => projects.filter((p: any) => p.status !== 'Archived').slice().sort((a: any, b: any) => a.name.localeCompare(b.name, 'fr')), [projects]);
  const linked = !!row.projectId, tags = row.tags || { sites: [], brands: [], service: [] };
  const save = async (patch: { projectId?: string | null; sites?: string[]; brands?: string[]; service?: string[] }) => {
    setBusy(true);
    try { const r = await db.setBonyMeta(row.id, { projectId: row.projectId || null, sites: row.sites || [], brands: row.brands || [], service: row.service || [], ...patch }); onSaved(r); }
    catch (e: any) { hud(e?.message || 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  };
  const toggle = (k: 'sites' | 'brands' | 'service', v: string) => {
    const cur = new Set<string>(row[k] || []);
    if (cur.has(v)) cur.delete(v); else cur.add(v);
    let next = [...cur];
    if (k === 'brands') next = v === 'Holding' && cur.has('Holding') ? ['Holding'] : next.filter((x) => x !== 'Holding' || v === 'Holding');   // Holding : exclusif
    save({ [k]: next } as any);
  };
  return (
    <div className="bfe-set">
      <div className="bfe-gt">Projet et tags</div>
      <label className="bfe-f"><span>Projet rattaché</span>
        <select className="bfe-in" value={row.projectId || ''} disabled={busy} onChange={(e) => save({ projectId: e.target.value || null })}>
          <option value="">Non rattaché à un projet</option>
          {row.projectId && !opts.some((p: any) => p.id === row.projectId) ? <option value={row.projectId}>{row.project?.name || 'Projet'}</option> : null}
          {opts.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
      {linked ? (
        <div className="bfe-hint">Tags hérités du projet <b>{row.project?.name}</b> (ils suivent le projet) :{' '}
          {[...tags.sites, ...tags.brands, ...tags.service].join(' · ') || 'aucun'}.</div>
      ) : <>
        <TagChips l="Concessions" all={SITES as string[]} on={row.sites || []} toggle={(v) => toggle('sites', v)} busy={busy} />
        <TagChips l="Marques" all={BRANDS as string[]} on={row.brands || []} toggle={(v) => toggle('brands', v)} busy={busy} />
        <TagChips l="Services" all={SERVICES as string[]} on={row.service || []} toggle={(v) => toggle('service', v)} busy={busy} />
        <div className="bfe-hint">Holding est exclusif : il retire les autres marques (et inversement).</div>
      </>}
    </div>
  );
}
function TagChips({ l, all, on, toggle, busy }: { l: string; all: string[]; on: string[]; toggle: (v: string) => void; busy: boolean }) {
  return <div className="bfe-f"><span>{l}</span><div className="bst-chips">{all.map((v) => <button key={v} disabled={busy} className={on.includes(v) ? 'on' : ''} onClick={() => toggle(v)}>{v}</button>)}</div></div>;
}

// ---------------------------------------------------------------- versions publiées
export function VersionsSheet({ formId, close, onRestored }: { formId: string; close: () => void; onRestored: () => void }) {
  const [list, setList] = useState<any[] | null>(null);
  const [open, setOpen] = useState<{ v: number; def: BonyFormDef } | null>(null);
  useEffect(() => { db.getBonyVersions(formId).then(setList).catch((e) => { hud(e?.message || 'Lecture impossible.'); setList([]); }); }, [formId]);
  const show = async (v: number) => { try { const r = await db.getBonyVersion(formId, v); setOpen({ v, def: r.def }); } catch (e: any) { hud(e?.message || 'Lecture impossible.'); } };
  const restore = (v: number, el: HTMLElement) => gx().menu.open([
    { header: `Remettre la version ${v} dans le brouillon ?` },
    { label: 'Remplacer le brouillon (rien n’est publié)', icon: 'refresh', action: async () => { try { await db.restoreBonyVersion(formId, v); hud(`Version ${v} remise dans le brouillon`); onRestored(); close(); } catch (e: any) { hud(e?.message || 'Restauration impossible.'); } } },
    { label: 'Annuler', action: () => {} },
  ], el, { align: 'right' });
  return (
    <div className="frm-sheet bf4">
      <h3>Historique des versions</h3>
      <p className="muted">Chaque publication est gardée. Restaurer remplace le BROUILLON : vous publiez ensuite si c’est bon.</p>
      {!list ? <div className="frm-empty">Lecture…</div> : !list.length ? <div className="frm-empty">Pas encore publié.</div> : (
        <div className="bf4-vers">{list.map((x) => (
          <div key={x.id} className={`bf4-ver ${open?.v === x.version ? 'on' : ''}`}>
            <b>v{x.version}</b><span className="grow">{dt(x.publishedAt)} · {x.author}</span><span className="faint">{x.responses} réponse{x.responses > 1 ? 's' : ''}</span>
            <button className="btn sm" onClick={() => show(x.version)}><Icon name="eye" size="sm" />Voir</button>
            <button className="btn sm" onClick={(e) => restore(x.version, e.currentTarget)}><Icon name="refresh" size="sm" />Restaurer</button>
          </div>))}</div>)}
      {open ? (
        <div className="bf4-vdef">
          <b>v{open.v} — {open.def.title}</b>
          <ol>{open.def.fields.map((f) => <li key={f.id}><span className="faint">{f.type}</span> {f.label || '—'}{f.required ? ' *' : ''}</li>)}</ol>
        </div>) : null}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={close}>Fermer</button></div>
    </div>
  );
}

// ---------------------------------------------------------------- tirage au sort
export function DrawSheet({ row, def, close }: { row: BonyFormRow; def: BonyFormDef | null; close: () => void }) {
  const consents = (def?.fields || []).filter((f) => f.type === 'consent');
  const uniqs = (def?.fields || []).filter((f) => f.type === 'email' || f.type === 'phone');
  const [winners, setWinners] = useState(1), [alternates, setAlternates] = useState(2);
  const [consentField, setConsent] = useState(consents[0]?.id || ''), [uniqueField, setUnique] = useState(uniqs[0]?.id || '');
  const [excludePrevious, setExclude] = useState(true), [busy, setBusy] = useState(false);
  const [draws, setDraws] = useState<any[] | null>(null), [show, setShow] = useState<any | null>(null);
  const load = () => db.getBonyDraws(row.id).then(setDraws).catch(() => setDraws([]));
  useEffect(() => { load(); }, [row.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => {
    setBusy(true);
    try { const d = await db.drawBony(row.id, { winners, alternates, consentField: consentField || null, uniqueField: uniqueField || null, excludePrevious }); setShow(d); load(); }
    catch (e: any) { hud(e?.message || 'Tirage impossible.'); }
    finally { setBusy(false); }
  };
  const pv = (d: any) => [
    `PROCÈS-VERBAL DE TIRAGE AU SORT — ${row.title}`, `Date : ${dt(d.drawnAt)} — tiré par ${d.author || 'moi'} dans Gearbox (tirage aléatoire par le serveur).`,
    `Participations éligibles : ${d.eligible}${d.rules?.consentLabel ? ` (case « ${d.rules.consentLabel} » cochée)` : ''}${d.rules?.uniqueLabel ? `, une par « ${d.rules.uniqueLabel} »` : ''}${d.rules?.excludePrevious ? ', gagnants des tirages précédents exclus' : ''}.`,
    `Empreinte de la liste des éligibles (SHA-256) : ${d.proof}`, '',
    ...(d.winners as any[]).map((w) => `${w.alternate ? 'Suppléant' : 'Gagnant'} n°${w.alternate ? w.rank - d.rules.winners : w.rank} : ${w.label}`),
  ].join('\n');
  const copy = (d: any) => navigator.clipboard?.writeText(pv(d)).then(() => hud('Procès-verbal copié'), () => hud('Copie impossible'));
  if (show) return <DrawShow d={show} onDone={() => setShow(null)} onCopy={() => copy(show)} />;
  return (
    <div className="frm-sheet bf4">
      <h3>Tirage au sort</h3>
      <p className="muted">Le tirage est fait par le serveur (aléatoire cryptographique) et inscrit au procès-verbal : règles, nombre d’éligibles, gagnants, empreinte de la liste. Il ne se refait pas en douce : chaque tirage est gardé.</p>
      <div className="row" style={{ gap: 10 }}>
        <label className="frm-field grow"><span className="label">Gagnants</span><input type="number" min={1} max={50} value={winners} onChange={(e) => setWinners(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} /></label>
        <label className="frm-field grow"><span className="label">Suppléants</span><input type="number" min={0} max={20} value={alternates} onChange={(e) => setAlternates(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} /></label>
      </div>
      <label className="frm-field"><span className="label">Seulement si cette case est cochée</span>
        <select value={consentField} onChange={(e) => setConsent(e.target.value)}><option value="">Aucune condition</option>{consents.map((f) => <option key={f.id} value={f.id}>{f.label || 'Consentement'}</option>)}</select></label>
      <label className="frm-field"><span className="label">Une participation par</span>
        <select value={uniqueField} onChange={(e) => setUnique(e.target.value)}><option value="">Pas de dédoublonnage</option>{uniqs.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
      <label className="frm-tg" style={{ margin: '6px 0 12px' }}><input type="checkbox" checked={excludePrevious} onChange={(e) => setExclude(e.target.checked)} /><span className="sw" /><span>Exclure les gagnants des tirages précédents</span></label>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button className="btn" onClick={close}>Fermer</button><button className="btn primary" disabled={busy || !row.responseCount} onClick={go}><Icon name="gift" size="sm" />{busy ? 'Tirage…' : 'Lancer le tirage'}</button></div>
      {draws?.length ? <>
        <div className="bfe-gt" style={{ marginTop: 16 }}>Procès-verbaux</div>
        <div className="bf4-vers">{draws.map((d) => (
          <div key={d.id} className="bf4-ver"><b>{dt(d.drawnAt)}</b><span className="grow ellipsis">{(d.winners as any[]).filter((w) => !w.alternate).map((w) => w.label).join(', ')}</span><span className="faint">{d.eligible} éligibles · {d.author}</span>
            <button className="btn sm" onClick={() => copy(d)}><Icon name="copy" size="sm" />Copier le PV</button></div>))}</div>
      </> : null}
    </div>
  );
}
/** Révélation animée (plein écran de la fenêtre) : les noms défilent, ralentissent, le gagnant s'arrête. */
function DrawShow({ d, onDone, onCopy }: { d: any; onDone: () => void; onCopy: () => void }) {
  const ws = d.winners as any[], reel: string[] = d.reel?.length ? d.reel : ws.map((w) => w.label);
  const [k, setK] = useState(0), [name, setName] = useState(reel[0] || ''), [landed, setLanded] = useState(false);
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timer = useRef(0);
  useEffect(() => {
    if (k >= ws.length) return;
    setLanded(false);
    if (reduced) { setName(ws[k].label); setLanded(true); return; }
    let i = 0, delay = 45;
    const tick = () => {
      i++; setName(reel[(i + k * 7) % reel.length]);
      delay *= 1.11;
      if (delay > 420) { setName(ws[k].label); setLanded(true); return; }
      timer.current = window.setTimeout(tick, delay);
    };
    timer.current = window.setTimeout(tick, delay);
    return () => window.clearTimeout(timer.current);
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = ws[Math.min(k, ws.length - 1)], done = k >= ws.length - 1 && landed;
  return (
    <div className="bf4-show">
      <div className="bf4-rank">{w?.alternate ? `Suppléant n°${w.rank - d.rules.winners}` : `Gagnant${ws.filter((x) => !x.alternate).length > 1 ? ` n°${w?.rank}` : ''}`}</div>
      <div className={`bf4-name ${landed ? 'landed' : ''}`}>{name}</div>
      {landed && !w?.alternate ? <div className="bf4-conf" aria-hidden="true">{Array.from({ length: 40 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 10) * 0.05}s`, background: ['#f75632', '#7c4dff', '#ffd166', '#06d6a0'][i % 4] }} />)}</div> : null}
      <div className="bf4-list">{ws.slice(0, landed ? k + 1 : k).map((x) => <span key={x.rank} className={x.alternate ? 'alt' : ''}>{x.alternate ? 'S' : ''}{x.alternate ? x.rank - d.rules.winners : x.rank}. {x.label}</span>)}</div>
      <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
        {landed && !done ? <button className="btn primary" onClick={() => setK(k + 1)}>Suivant</button> : null}
        {done ? <><button className="btn" onClick={onCopy}><Icon name="copy" size="sm" />Copier le procès-verbal</button><button className="btn primary" onClick={onDone}>Terminer</button></> : null}
      </div>
      <div className="faint bf4-proof">{d.eligible} participations éligibles · empreinte {String(d.proof).slice(0, 16)}…</div>
    </div>
  );
}

// ---------------------------------------------------------------- formulaires liés (fiche projet)
export function LinkedForms({ projectId }: { projectId: string }) {
  const [list, setList] = useState<BonyFormRow[] | null>(null);
  useEffect(() => { let on = true; db.getBonyForms().then((r) => { if (on) setList(r.forms.filter((f) => f.projectId === projectId)); }).catch(() => on && setList([])); return () => { on = false; }; }, [projectId]);
  // Une seule voie : la commande d'ouverture (l'espace Google, s'il est affiché, la renvoie vers Forms Bony).
  const open = (id: string, what: 'edit' | 'stats') => { gx().shell.openWith('forms', `${what}:${id}`); };
  if (!list) return null;
  return (
    <section className="card bf4-linked">
      <div className="row" style={{ alignItems: 'center', gap: 8 }}><Icon name="forms" size="sm" /><b>Formulaires liés</b><span className="faint">{list.length}</span><span className="grow" />
        <button className="btn sm" onClick={() => gx().shell.openWith('forms', 'bnew')}><Icon name="plus" size="sm" />Nouveau</button></div>
      {!list.length ? <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>Aucun formulaire rattaché : dans Forms, onglet Formulaire, choisissez ce projet.</div> : (
        <div className="bf4-lf">{list.map((f) => { const s = STATUS[f.status] || STATUS.draft; return (
          <div key={f.id} className="bf4-lfr"><span className="badge" style={{ '--c': s.c } as React.CSSProperties}><i className="dot" />{s.l}</span><span className="grow ellipsis">{f.title}</span>
            <span className="faint">{f.responseCount} réponse{f.responseCount > 1 ? 's' : ''}</span>
            <button className="btn sm" onClick={() => open(f.id, 'stats')}><Icon name="trending" size="sm" />Réponses</button>
            <button className="btn sm" onClick={() => open(f.id, 'edit')}><Icon name="edit" size="sm" />Modifier</button></div>); })}</div>)}
    </section>
  );
}
