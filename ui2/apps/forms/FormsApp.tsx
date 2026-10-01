import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { GForm, GFormDetail, GFormResponse } from '../../../types';
import { db } from '../../../services/dataService';
import { getSocket } from '../../../services/socket';
import { writeSheetFile } from '../../../services/exportXlsx';
import { gx, hud, Icon, Seg, useSheets, useEngineStore, useCompact } from '../ui/kit';
import { useGoogleStatus, GoogleAccountCard } from './GoogleAccount';
import { questionsOf, statOf, overview, exportRows, valuesOf, type QStat, type Question } from './stats';
import Editor from './Editor';

// =====================================================================
// Rubrique « Forms » (interface v2 SEULEMENT, 01/10/2026 — lots G1 + G2). Google Forms du compte marketing
// partagé, par les routes /api/forms (FORMS_ROLES, le serveur garde le jeton Google).
//  - Formulaires : catalogue Gearbox — création depuis Gearbox (le formulaire y entre tout seul) ou
//    import par lien d'édition pour ceux qui existaient avant (l'API Google ne sait pas lister un
//    compte) ; état de publication, réponses, duplication, retrait de Gearbox.
//  - Éditeur maison (Editor.tsx) : tout ce que l'API permet ; thème et couleurs ne sont PAS dans l'API
//    (vérifié dans la doc le 01/10) → éditeur Google dans une fenêtre dédiée.
//  - Statistiques : synthèse par question (graphiques du moteur), réponses une par une, export Excel.
// =====================================================================

type Tab = 'forms' | 'stats';
const D = 864e5;
const rel = (iso: string | null) => {
  if (!iso) return '—';
  const t = new Date(iso).getTime(), diff = Date.now() - t;
  if (diff < 60_000) return 'à l’instant';
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < D) return `il y a ${Math.floor(diff / 3_600_000)} h`;
  if (diff < 7 * D) return `il y a ${Math.floor(diff / D)} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};
const dateTime = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const editUrl = (f: GForm, email?: string | null) => `https://docs.google.com/forms/d/${f.formId}/edit${email ? `?authuser=${encodeURIComponent(email)}` : ''}`;
const statusOf = (f: GForm) => !f.isPublished ? { l: 'Non publié', c: 'var(--text-3)' } : f.acceptingResponses ? { l: 'Ouvert aux réponses', c: 'var(--ok)' } : { l: 'Réponses fermées', c: 'var(--warn)' };
const plural = (n: number, s: string) => `${n.toLocaleString('fr-FR')} ${s}${n > 1 ? 's' : ''}`;

export default function FormsApp({ win, inst }: AppProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const compact = useCompact(rootRef, 760);
  const { st, err: stErr, reload: reloadStatus } = useGoogleStatus();
  const [tab, setTab] = useEngineStore<Tab>('forms.tab', 'forms');
  const [list, setList] = useState<GForm[] | null>(null);
  const [listErr, setListErr] = useState('');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useEngineStore<string>('forms.sel', '');
  const [editId, setEditId] = useState<string | null>(null);
  const { open: openSheet, portals } = useSheets(win);

  const load = useCallback(() => db.getForms().then((v) => { setList(v); setListErr(''); }).catch((e) => { setList((x) => x || []); setListErr(e?.message || 'Lecture impossible.'); }), []);
  useEffect(() => { if (st?.connected) load(); }, [st?.connected, load]);
  useEffect(() => { const s = getSocket(); s?.on('forms:changed', load); return () => { s?.off('forms:changed', load); }; }, [load]);

  const shown = useMemo(() => (list || []).filter((f) => !q.trim() || f.title.toLowerCase().includes(q.trim().toLowerCase())), [list, q]);
  const sel = (list || []).find((f) => f.id === selId) || (tab === 'stats' ? (list || [])[0] : undefined);

  const openStats = (f: GForm) => { setEditId(null); setSelId(f.id); setTab('stats'); };
  const openEditor = (f: GForm) => { setTab('forms'); setEditId(f.id); };
  const importSheet = () => openSheet((close) => <ImportSheet close={close} onDone={(f) => { close(); load(); if (f) openEditor(f); }} />, { width: 560 });
  const newSheet = () => openSheet((close) => <NewSheet close={close} onDone={(f) => { close(); load(); openEditor(f); }} />, { width: 480 });
  const duplicate = async (f: GForm) => {
    hud('Duplication en cours…');
    try {
      const r = await db.duplicateForm(f.id);
      hud(r.skipped ? `Copie créée (${r.skipped} élément${r.skipped > 1 ? 's' : ''} non recopiable${r.skipped > 1 ? 's' : ''} : image ou envoi de fichier)` : 'Copie créée');
      load(); openEditor(r.form);
    } catch (e: any) { hud(e?.message || 'Duplication impossible.'); }
  };
  const copyLink = (f: GForm) => {
    if (!f.responderUri) return hud('Ce formulaire n’a pas encore de lien de réponse (non publié).');
    navigator.clipboard?.writeText(f.responderUri).then(() => hud('Lien du formulaire copié'), () => hud(f.responderUri!));
  };
  const remove = (f: GForm, el: HTMLElement) => gx().menu.open([
    { header: `Retirer « ${f.title} » de Gearbox ?` },
    { label: 'Retirer (le formulaire reste intact dans Google)', icon: 'trash', action: async () => {
      try { await db.removeForm(f.id); hud('Formulaire retiré de Gearbox'); if (selId === f.id) setSelId(''); load(); }
      catch (e: any) { hud(e?.message || 'Retrait impossible.'); }
    } },
    { label: 'Annuler', action: () => {} },
  ], el, { align: 'right' });
  const formMenu = (f: GForm, el: HTMLElement) => gx().menu.open([
    { header: f.title },
    { label: 'Modifier', icon: 'edit', action: () => openEditor(f) },
    { label: 'Statistiques', icon: 'trending', action: () => openStats(f) },
    { label: 'Dupliquer', icon: 'copy', action: () => duplicate(f) },
    { label: 'Ouvrir dans Google', icon: 'arrowr', action: () => window.open(editUrl(f, st?.email), '_blank', 'noopener') },
    { label: 'Copier le lien de réponse', icon: 'link', disabled: !f.responderUri, action: () => copyLink(f) },
    { label: 'Actualiser', icon: 'refresh', action: () => db.syncForm(f.id).then(() => { hud('Formulaire actualisé'); load(); }, (e) => hud(e?.message || 'Actualisation impossible.')) },
    '-', { label: 'Retirer de Gearbox…', icon: 'trash', action: () => remove(f, el) },
  ], el, { align: 'right' });

  inst.command = (c: string) => { if (c === 'new') newSheet(); else if (c === 'import') importSheet(); };
  inst.menus = () => ({
    'Fichier': [{ label: 'Nouveau formulaire…', icon: 'plus', disabled: !st?.connected, action: newSheet }, { label: 'Importer des formulaires…', icon: 'link', disabled: !st?.connected, action: importSheet }],
    'Présentation': [{ label: 'Formulaires', checked: tab === 'forms', action: () => setTab('forms') }, { label: 'Statistiques', checked: tab === 'stats', action: () => setTab('stats') }],
  });

  // Bascule d'onglet : fondu glissé, du côté de l'onglet.
  const bodyRef = useRef<HTMLDivElement>(null), firstTab = useRef(true);
  useLayoutEffect(() => {
    if (firstTab.current) { firstTab.current = false; return; }
    gx().animate(bodyRef.current, [{ opacity: 0, transform: `translateX(${tab === 'stats' ? 24 : -24}px)` }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
  }, [tab]);

  const connected = !!st?.connected;
  return (
    <div className="app frm" ref={rootRef}>
      <div className="app-head">
        <div className="ah-t"><span className="ah-eye">Com digitale</span><h1>Forms</h1>
          <span className="sub">{connected ? <>{list ? plural(list.length, 'formulaire') : 'Chargement…'}{st?.email ? <> · compte <b style={{ color: 'var(--text)' }}>{st.email}</b></> : null}</> : 'Google Forms du compte marketing'}</span></div>
        <div className="ah-f">
          {connected ? <Seg value={tab} onChange={setTab} options={[['forms', 'Formulaires'], ['stats', 'Statistiques']]} /> : null}
          {connected ? <button className="btn" data-tip="Ajouter des formulaires existants par leur lien" onClick={importSheet}><Icon name="link" size="sm" /><span>Importer</span></button> : null}
          {connected ? <button className="btn primary" data-tip="Créer un formulaire Google depuis Gearbox" onClick={newSheet}><Icon name="plus" size="sm" /><span>Nouveau</span></button> : null}
        </div>
      </div>
      <div className="frm-body" ref={bodyRef}>
        {!st ? <div className="frm-empty">{stErr || 'Chargement…'}</div>
          : !connected || st.lastError ? <div className="frm-connect"><GoogleAccountCard st={st} onChanged={reloadStatus} /></div>
          : tab === 'forms' && editId && (list || []).some((f) => f.id === editId) ? (
            <React.Fragment key={editId}><Editor row={(list || []).find((f) => f.id === editId)!} email={st.email} openSheet={openSheet}
              onBack={() => setEditId(null)} onStats={() => openStats((list || []).find((f) => f.id === editId)!)} onChanged={load} /></React.Fragment>
          ) : tab === 'forms' ? (
            <div className="frm-list scroll">
              <div className="frm-tools"><label className="search"><Icon name="search" size="sm" /><input placeholder="Rechercher un formulaire…" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
              {listErr ? <div className="frm-err">{listErr}</div> : null}
              {list && !list.length ? (
                <div className="frm-empty big"><span className="frm-emo"><Icon name="forms" /></span><b>Aucun formulaire dans Gearbox</b>
                  <span>Créez votre premier formulaire, ou importez ceux qui existent déjà avec le lien de leur éditeur (l’API Google ne permet pas de les lister).</span>
                  <div className="row" style={{ gap: 8 }}><button className="btn primary" onClick={newSheet}><Icon name="plus" size="sm" />Nouveau formulaire</button><button className="btn" onClick={importSheet}><Icon name="link" size="sm" />Importer</button></div></div>
              ) : (
                <div className="frm-grid">{shown.map((f, i) => {
                  const s = statusOf(f);
                  return (
                    <article key={f.id} className="frm-card" style={{ '--i': i } as React.CSSProperties} onClick={() => openEditor(f)}>
                      <div className="frm-card-top"><span className="frm-ic"><Icon name="forms" /></span>
                        <span className="badge" style={{ '--c': s.c } as React.CSSProperties}><i className="dot" />{s.l}</span>
                        <button className="icon-btn sm" aria-label="Actions" onClick={(e) => { e.stopPropagation(); formMenu(f, e.currentTarget); }}><Icon name="more" size="sm" /></button></div>
                      <b className="frm-t">{f.title}</b>
                      {f.description ? <p className="frm-d">{f.description}</p> : null}
                      <div className="frm-meta">
                        <span><b className="num">{f.responseCount.toLocaleString('fr-FR')}</b> réponse{f.responseCount > 1 ? 's' : ''}</span>
                        <span>Dernière : {rel(f.lastResponseAt)}</span>
                      </div>
                      {f.syncError ? <div className="frm-err sm" title={f.syncError}><Icon name="alert" size="sm" />{f.syncError}</div> : null}
                      <div className="frm-act" onClick={(e) => e.stopPropagation()}>
                        <button className="btn sm" onClick={() => openEditor(f)}><Icon name="edit" size="sm" />Modifier</button>
                        <button className="btn sm" onClick={() => openStats(f)}><Icon name="trending" size="sm" />Statistiques</button>
                        <button className="icon-btn sm" aria-label="Copier le lien" data-tip="Copier le lien de réponse" disabled={!f.responderUri} onClick={() => copyLink(f)}><Icon name="link" size="sm" /></button>
                      </div>
                    </article>
                  );
                })}</div>
              )}
            </div>
          ) : (
            <div className={`frm-stats ${compact ? 'compact' : ''}`}>
              {compact ? null : (
                <aside className="frm-side scroll">{(list || []).map((f) => (
                  <button key={f.id} className={`frm-si ${sel?.id === f.id ? 'on' : ''}`} onClick={() => setSelId(f.id)}>
                    <b className="ellipsis">{f.title}</b><span>{plural(f.responseCount, 'réponse')}</span></button>))}
                  {list && !list.length ? <div className="frm-empty">Importez d’abord un formulaire.</div> : null}
                </aside>
              )}
              {sel ? <React.Fragment key={sel.id}><StatsView f={sel} email={st.email} compact={compact} list={list || []} onPick={setSelId} onSynced={load} /></React.Fragment> : <div className="frm-empty">{list ? 'Aucun formulaire à analyser.' : 'Chargement…'}</div>}
            </div>
          )}
      </div>
      {portals}
    </div>
  );
}

// =====================================================================
// Import par lien d'édition
// =====================================================================
function ImportSheet({ close, onDone }: { close: () => void; onDone: (f: GForm | null) => void }) {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ url: string; ok: boolean; msg: string }[]>([]);
  const inp = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { inp.current?.focus(); }, []);
  const urls = text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  // Un lien après l'autre (le serveur relit chaque formulaire et ses réponses chez Google).
  const go = async () => {
    if (!urls.length || busy) return;
    setBusy(true); setRes([]);
    let first: GForm | null = null, ok = 0;
    for (const url of urls) {
      try { const f = await db.importForm(url); first = first || f; ok++; setRes((r) => [...r, { url, ok: true, msg: f.title }]); }
      catch (e: any) { setRes((r) => [...r, { url, ok: false, msg: e?.message || 'Import impossible.' }]); }
    }
    setBusy(false);
    if (ok && ok === urls.length) { hud(ok > 1 ? `${ok} formulaires ajoutés` : `« ${first!.title} » ajouté`); onDone(ok === 1 ? first : null); }
  };
  return (
    <div className="frm-sheet">
      <h3>Importer des formulaires existants</h3>
      <p className="muted">Pour chaque formulaire, ouvrez-le dans Google Forms et copiez l’adresse de l’<b>éditeur</b> (elle se termine par <code>/edit</code>). Collez-en autant que vous voulez, <b>un par ligne</b>. Les formulaires doivent appartenir au compte marketing ou lui être partagés en édition. Un formulaire créé depuis Gearbox n’a pas besoin d’être importé.</p>
      <label className="frm-field"><span className="label">Liens des éditeurs</span>
        <textarea ref={inp} rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'https://docs.google.com/forms/d/…/edit\nhttps://docs.google.com/forms/d/…/edit'} /></label>
      {res.length ? <div className="frm-res">{res.map((r, k) => <div key={k} className={r.ok ? 'ok' : 'ko'}><Icon name={r.ok ? 'check' : 'alert'} size="sm" /><span className="ellipsis">{r.ok ? r.msg : `${r.url.slice(0, 60)} — ${r.msg}`}</span></div>)}</div> : null}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn" onClick={() => { if (res.some((r) => r.ok)) onDone(null); else close(); }}>{res.some((r) => r.ok) ? 'Terminer' : 'Annuler'}</button>
        <button className="btn primary" disabled={!urls.length || busy} onClick={go}>{busy ? `Import ${res.length + 1}/${urls.length}…` : urls.length > 1 ? `Importer ${urls.length} formulaires` : 'Importer'}</button>
      </div>
    </div>
  );
}

function NewSheet({ close, onDone }: { close: () => void; onDone: (f: GForm) => void }) {
  const [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { inp.current?.focus(); }, []);
  const go = async () => {
    if (!title.trim() || busy) return;
    setBusy(true); setErr('');
    try { const f = await db.createForm(title.trim()); hud(`« ${f.title} » créé`); onDone(f); }
    catch (e: any) { setErr(e?.message || 'Création impossible.'); setBusy(false); }
  };
  return (
    <div className="frm-sheet">
      <h3>Nouveau formulaire</h3>
      <p className="muted">Créé chez Google avec le compte marketing, <b>non publié et fermé aux réponses</b> : vous le publiez avec le bouton « Publier » quand il est prêt.</p>
      <label className="frm-field"><span className="label">Titre</span>
        <input ref={inp} value={title} maxLength={300} onChange={(e) => { setTitle(e.target.value); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} placeholder="Ex. Inscription soirée portes ouvertes" /></label>
      {err ? <div className="frm-err">{err}</div> : null}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn" onClick={close}>Annuler</button>
        <button className="btn primary" disabled={!title.trim() || busy} onClick={go}>{busy ? 'Création chez Google…' : 'Créer et modifier'}</button>
      </div>
    </div>
  );
}

// =====================================================================
// Statistiques d'un formulaire
// =====================================================================
function StatsView({ f, email, compact, list, onPick, onSynced }: { f: GForm; email: string | null; compact: boolean; list: GForm[]; onPick: (id: string) => void; onSynced: () => void }) {
  const [d, setD] = useState<GFormDetail | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'summary' | 'one'>('summary');
  const [idx, setIdx] = useState(0);
  const load = useCallback(() => db.getFormDetail(f.id).then((v) => { setD(v); setErr(''); }).catch((e) => setErr(e?.message || 'Lecture impossible.')), [f.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = window.setInterval(load, 3 * 60_000); return () => window.clearInterval(t); }, [load]);   // suit les nouvelles réponses fenêtre ouverte

  const qs = useMemo(() => questionsOf(d?.form.structure), [d]);
  const rs = d?.responses || [];
  const ov = useMemo(() => overview(rs), [rs]);
  const stats = useMemo(() => qs.map((q) => statOf(q, rs)), [qs, rs]);
  const timeline = useMemo(() => gx().chart.bars({
    labels: ov.series.map((s, i) => (i % 5 === 0 || i === ov.series.length - 1 ? `${s.d.getDate()}/${s.d.getMonth() + 1}` : '')),
    series: [{ name: 'Réponses', values: ov.series.map((s) => s.n) }], height: 150, fmt: (n: number) => String(Math.round(n)),
  }), [ov]);

  const refresh = async () => {
    setBusy(true);
    try { await db.syncForm(f.id); await load(); onSynced(); hud('Réponses actualisées'); }
    catch (e: any) { hud(e?.message || 'Actualisation impossible.'); }
    finally { setBusy(false); }
  };
  const exportXlsx = async () => {
    if (!rs.length) return hud('Aucune réponse à exporter.');
    const { headers, rows } = exportRows(qs, rs);
    const safe = f.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'formulaire';
    await writeSheetFile(`GEARBOX_Forms_${safe}.xlsx`, f.title, headers, rows);
  };
  const s = statusOf(f), cur = rs[Math.min(idx, rs.length - 1)];
  return (
    <div className="frm-main scroll">
      <div className="frm-sh">
        {compact ? (
          <select className="frm-pick" value={f.id} onChange={(e) => onPick(e.target.value)}>{list.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
        ) : <h2 className="ellipsis">{f.title}</h2>}
        <span className="badge" style={{ '--c': s.c } as React.CSSProperties}><i className="dot" />{s.l}</span>
        <span className="grow" />
        <button className="btn sm" disabled={busy} onClick={refresh} data-tip="Relire toutes les réponses chez Google"><Icon name="refresh" size="sm" />{busy ? 'Actualisation…' : 'Actualiser'}</button>
        <button className="btn sm" onClick={exportXlsx}><Icon name="download" size="sm" />Excel</button>
        <button className="btn sm" onClick={() => window.open(editUrl(f, email), '_blank', 'noopener')}><Icon name="arrowr" size="sm" />Google</button>
      </div>
      {err ? <div className="frm-err">{err}</div> : null}
      {d?.form.syncError ? <div className="frm-err sm"><Icon name="alert" size="sm" />Dernière synchronisation : {d.form.syncError}</div> : null}
      {!d ? <div className="frm-empty">Lecture des réponses…</div> : (
        <>
          <div className="frm-kpis">
            <Kpi l="Réponses" v={ov.total} i={0} />
            <Kpi l="7 derniers jours" v={ov.last7} i={1} />
            <Kpi l="30 derniers jours" v={ov.last30} i={2} />
            <div className="frm-kpi" style={{ '--i': 3 } as React.CSSProperties}><span>Dernière réponse</span><b className="sm">{rel(d.form.lastResponseAt)}</b></div>
          </div>
          <section className="frm-block"><div className="frm-bh"><b>Réponses par jour</b><span className="faint">30 derniers jours</span></div>
            <div className="frm-chart" dangerouslySetInnerHTML={{ __html: timeline }} /></section>
          <div className="frm-viewsw"><Seg value={view} onChange={setView} options={[['summary', 'Résumé'], ['one', 'Réponse par réponse']]} />
            <span className="faint">{d.form.lastSyncedAt ? `Synchronisé ${rel(d.form.lastSyncedAt)}` : ''}</span></div>
          {!rs.length ? <div className="frm-empty">Aucune réponse pour l’instant.</div>
            : view === 'summary' ? (
              <div className="frm-qs">{stats.map((x, i) => <React.Fragment key={x.q.id}><QCard s={x} total={rs.length} i={i} prevSection={i ? stats[i - 1].q.section : ''} /></React.Fragment>)}</div>
            ) : (
              <OneResponse qs={qs} r={cur} idx={Math.min(idx, rs.length - 1)} n={rs.length} onIdx={setIdx} />
            )}
        </>
      )}
    </div>
  );
}

function Kpi({ l, v, i }: { l: string; v: number; i: number }) {
  // Le chiffre « compte » jusqu'à sa valeur (une fois, à l'arrivée des données).
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || v < 2) { el.textContent = v.toLocaleString('fr-FR'); return; }
    const t0 = performance.now(), dur = 700; let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(v * e).toLocaleString('fr-FR'); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <div className="frm-kpi" style={{ '--i': i } as React.CSSProperties}><span>{l}</span><b className="num" ref={ref}>{v.toLocaleString('fr-FR')}</b></div>;
}

const KIND: Record<string, string> = { choice: 'Choix', text: 'Texte', scale: 'Échelle', rating: 'Note', date: 'Date', time: 'Heure', file: 'Fichier', grid: 'Grille' };
function QCard({ s, total, i, prevSection }: { s: QStat; total: number; i: number; prevSection: string }) {
  const { q } = s;
  const [all, setAll] = useState(false);
  const pct = (n: number, base: number) => (base ? Math.round((n / base) * 100) : 0);
  const max = Math.max(1, ...(s.counts || []).map((c) => c.n));
  return (
    <>
      {q.section && q.section !== prevSection ? <div className="frm-sec">{q.section}</div> : null}
      <article className="frm-q" style={{ '--i': Math.min(i, 8) } as React.CSSProperties}>
        <div className="frm-qh"><b>{q.title}{q.required ? <span className="req"> *</span> : null}</b>
          <span className="faint">{KIND[q.kind]}{q.multi ? ' · plusieurs réponses' : ''} · {plural(s.answered, 'réponse')}{s.answered < total ? ` sur ${total}` : ''}</span></div>
        {s.counts ? (
          <div className="frm-bars">{s.counts.map((c, k) => (
            <div key={c.label + k} className={`frm-bar ${c.other ? 'other' : ''}`}>
              <span className="l ellipsis" title={c.label}>{q.kind === 'scale' && k === 0 && q.lowLabel ? `${c.label} · ${q.lowLabel}` : q.kind === 'scale' && k === s.counts!.length - 1 && q.highLabel ? `${c.label} · ${q.highLabel}` : c.label}</span>
              <span className="t"><i style={{ width: `${(c.n / max) * 100}%`, '--k': k } as React.CSSProperties} /></span>
              <span className="v num">{c.n} <span className="faint">· {pct(c.n, s.answered)} %</span></span>
            </div>))}
            {s.avg !== undefined ? <div className="frm-avg">Moyenne <b className="num">{s.avg.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</b> / {q.high ?? Math.max(...(q.options || []).map(Number))}</div> : null}
            {s.others?.length ? <details className="frm-others"><summary>Voir les réponses « Autre » ({s.others.length})</summary><ul>{s.others.slice(0, 200).map((o, k) => <li key={k}>{o}</li>)}</ul></details> : null}
          </div>
        ) : s.grid ? (
          <div className="frm-grid-t scroll"><table><thead><tr><th />{(q.options || []).map((o) => <th key={o}>{o}</th>)}</tr></thead>
            <tbody>{s.grid.map((row) => { const m = Math.max(1, ...row.counts); return (
              <tr key={row.label}><th>{row.label}</th>{row.counts.map((n, k) => <td key={k}><span className="cell" style={{ '--a': n / m } as React.CSSProperties}>{n}</span></td>)}</tr>); })}</tbody></table></div>
        ) : (
          <div className="frm-texts">
            {(all ? s.texts! : s.texts!.slice(0, 6)).map((t, k) => <div key={k} className="frm-tx"><span>{t.v}</span><span className="faint">{rel(t.at)}</span></div>)}
            {s.texts!.length > 6 ? <button className="btn sm" onClick={() => setAll(!all)}>{all ? 'Réduire' : `Voir les ${s.texts!.length} réponses`}</button> : null}
          </div>
        )}
      </article>
    </>
  );
}

function OneResponse({ qs, r, idx, n, onIdx }: { qs: Question[]; r: GFormResponse; idx: number; n: number; onIdx: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null), last = useRef(idx);
  useLayoutEffect(() => {
    const dir = idx > last.current ? 1 : -1; last.current = idx;
    gx().animate(ref.current, [{ opacity: 0, transform: `translateX(${dir * 22}px)` }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
  }, [idx]);
  return (
    <div className="frm-one">
      <div className="frm-onenav">
        <button className="icon-btn" disabled={idx <= 0} aria-label="Réponse précédente" onClick={() => onIdx(idx - 1)}><Icon name="chevleft" size="sm" /></button>
        <span className="num"><b>{idx + 1}</b> / {n}</span>
        <button className="icon-btn" disabled={idx >= n - 1} aria-label="Réponse suivante" onClick={() => onIdx(idx + 1)}><Icon name="chevright" size="sm" /></button>
        <span className="faint">Reçue le {dateTime(r.submittedAt)}{r.respondentEmail ? ` · ${r.respondentEmail}` : ''}</span>
      </div>
      <div className="frm-onebody" ref={ref}>{qs.map((q) => (
        <div key={q.id} className="frm-oa"><span className="q">{q.title}</span>
          {q.kind === 'grid' ? <div className="a">{(q.rows || []).map((row) => <div key={row.id}><span className="faint">{row.label} : </span>{valuesOf(r, row.id).join(', ') || '—'}</div>)}</div>
            : <div className="a">{valuesOf(r, q.id).join(', ') || <span className="faint">Sans réponse</span>}</div>}
        </div>))}</div>
    </div>
  );
}
