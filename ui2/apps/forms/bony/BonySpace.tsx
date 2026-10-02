import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../../types';
import type { BonyFormRow, BonyFormDetail, BonyResponse } from '../../../../types';
import { db } from '../../../../services/dataService';
import { getSocket } from '../../../../services/socket';
import { writeSheetFile } from '../../../../services/exportXlsx';
import { gx, hud, Icon, Seg, useSheets, useEngineStore, useCompact } from '../../ui/kit';
import { statOf, overview, exportRows } from '../stats';
import { Kpi, QCard, OneResponse, rel } from '../FormsApp';
import { bonyQuestions, bonyResponses } from './adapter';
import BonyEditor from './BonyEditor';
import { TEMPLATES } from './templates';
import { parseDrive } from '../../../../shared/bonyform';
import { DrawSheet } from './F4';
import { SITES, BRANDS, SERVICES } from '../../../../constants';
import { useWorkspace } from '../../../store/workspace';

// =====================================================================
// Espace « Forms Bony » de la rubrique Forms (lot F1, 01/10/2026) : formulaires MAISON, édités ici
// et servis au public par le Worker Cloudflare (forms.bonyauto-mobile.workers.dev/<id>).
//  - Formulaires : liste (brouillon / en ligne / fermé, modifications non publiées), création, éditeur.
//  - Réponses : mêmes statistiques que Google Forms (adapter.ts), réponse par réponse, export Excel,
//    effacement d'une réponse (droit à l'effacement d'un répondant).
// =====================================================================

const STATUS: Record<string, { l: string; c: string }> = { draft: { l: 'Brouillon', c: 'var(--text-3)' }, published: { l: 'En ligne', c: 'var(--ok)' }, closed: { l: 'Fermé', c: 'var(--warn)' } };
const plural = (n: number, s: string) => `${n.toLocaleString('fr-FR')} ${s}${n > 1 ? 's' : ''}`;

export default function BonySpace({ win, inst, switcher }: AppProps & { switcher: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const compact = useCompact(rootRef, 760);
  const [tab, setTab] = useEngineStore<'forms' | 'stats'>('bony.tab', 'forms');
  const [list, setList] = useState<BonyFormRow[] | null>(null);
  const [ready, setReady] = useState(true);
  const [workerUrl, setWorkerUrl] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [selId, setSelId] = useEngineStore<string>('bony.sel', '');
  const [q, setQ] = useState('');
  const { open: openSheet, portals } = useSheets(win);

  const load = useCallback(() => db.getBonyForms().then((r) => { setList(r.forms); setReady(r.workerReady); setWorkerUrl(r.workerUrl || null); setErr(''); }).catch((e) => { setList((x) => x || []); setErr(e?.message || 'Lecture impossible.'); }), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const s = getSocket(); s?.on('bonyforms:changed', load); s?.on('bonyforms:response', load); window.addEventListener('gearbox-chat-reconnected', load); return () => { s?.off('bonyforms:changed', load); s?.off('bonyforms:response', load); window.removeEventListener('gearbox-chat-reconnected', load); }; }, [load]);

  // F4 : filtres par projet et par tags (tags EFFECTIFS : ceux du projet rattaché, sinon ceux du formulaire).
  const [fProj, setFProj] = useEngineStore<string>('bony.fProj', '');
  const [fSite, setFSite] = useEngineStore<string>('bony.fSite', '');
  const [fBrand, setFBrand] = useEngineStore<string>('bony.fBrand', '');
  const [fServ, setFServ] = useEngineStore<string>('bony.fServ', '');
  const projects = useWorkspace((s) => s.projects);
  const usedProjects = useMemo(() => { const m = new Map<string, string>(); (list || []).forEach((f) => { if (f.project) m.set(f.project.id, f.project.name); }); return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr')); }, [list]);
  const shown = useMemo(() => (list || []).filter((f) => {
    const t = f.tags || { sites: [], brands: [], service: [] };
    if (q.trim() && !f.title.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (fProj === '__none' ? !!f.projectId : fProj && f.projectId !== fProj) return false;
    if (fSite && !t.sites.includes(fSite)) return false;
    if (fBrand && !t.brands.includes(fBrand)) return false;
    if (fServ && !t.service.includes(fServ)) return false;
    return true;
  }), [list, q, fProj, fSite, fBrand, fServ]);
  const filtering = !!(fProj || fSite || fBrand || fServ);
  const sel = (list || []).find((f) => f.id === selId) || (tab === 'stats' ? (list || [])[0] : undefined);
  const openEditor = (f: BonyFormRow) => { setTab('forms'); setEditId(f.id); };
  const openStats = (f: BonyFormRow) => { setEditId(null); setSelId(f.id); setTab('stats'); };
  const newSheet = () => openSheet((close) => <NewSheet close={close} onDone={(f) => { close(); load(); openEditor(f); }} />, { width: 620 });
  const copyLink = (f: BonyFormRow) => { if (!f.url) return; navigator.clipboard?.writeText(f.url).then(() => hud('Lien du formulaire copié'), () => hud(f.url!)); };

  const runCmd = (c: string) => {
    if (c === 'new' || c === 'bnew') return newSheet();
    const m = /^(edit|stats):(.+)$/.exec(c); if (!m) return;
    const f = (list || []).find((x) => x.id === m[2]);
    if (m[1] === 'edit') { setTab('forms'); setEditId(m[2]); } else if (f) openStats(f); else { setSelId(m[2]); setTab('stats'); setEditId(null); }
  };
  inst.command = runCmd;
  // Commande laissée par une autre rubrique (fiche projet) avant l'ouverture de cet espace.
  useEffect(() => { if (!list) return; const c = gx().store.get('bony.cmd', ''); if (c) { gx().store.set('bony.cmd', ''); runCmd(c); } }, [list]); // eslint-disable-line react-hooks/exhaustive-deps
  inst.menus = () => ({
    'Fichier': [{ label: 'Nouveau formulaire Bony…', icon: 'plus', action: newSheet }],
    'Présentation': [{ label: 'Formulaires', checked: tab === 'forms', action: () => setTab('forms') }, { label: 'Réponses', checked: tab === 'stats', action: () => setTab('stats') }],
  });

  return (
    <div className="app frm" ref={rootRef}>
      <div className="app-head">
        <div className="ah-t"><span className="ah-eye">Com digitale</span><h1>Forms</h1>
          <span className="sub">{list ? `${list.length} formulaire${list.length > 1 ? 's' : ''} Bony` : 'Chargement…'} · formulaires maison, hébergés chez Cloudflare</span></div>
        <div className="ah-f">{switcher}
          <Seg value={tab} onChange={(v) => { setEditId(null); setTab(v); }} options={[['forms', 'Formulaires'], ['stats', 'Réponses']]} />
          <button className="btn primary" onClick={newSheet}><Icon name="plus" size="sm" /><span>Nouveau</span></button>
        </div>
      </div>
      <div className="frm-body">
        {!ready ? <div className="frm-err">Le Worker Cloudflare n’est pas configuré sur ce serveur (FORMS_WORKER_URL / FORMS_WORKER_SECRET) : la publication est impossible.</div> : null}
        {err ? <div className="frm-err">{err}</div> : null}
        {tab === 'forms' && editId ? (
          <React.Fragment key={editId}><BonyEditor id={editId} workerUrl={workerUrl} openSheet={openSheet} onBack={() => setEditId(null)} onStats={() => { const f = (list || []).find((x) => x.id === editId); if (f) openStats(f); }} onChanged={load} /></React.Fragment>
        ) : tab === 'forms' ? (
          <div className="frm-list scroll">
            <div className="frm-tools"><label className="search"><Icon name="search" size="sm" /><input placeholder="Rechercher un formulaire…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
              <select className="bf4-flt" value={fProj} onChange={(e) => setFProj(e.target.value)}><option value="">Tous les projets</option><option value="__none">Non rattachés</option>{usedProjects.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
              <select className="bf4-flt" value={fSite} onChange={(e) => setFSite(e.target.value)}><option value="">Toutes concessions</option>{(SITES as string[]).map((s) => <option key={s} value={s}>{s}</option>)}</select>
              <select className="bf4-flt" value={fBrand} onChange={(e) => setFBrand(e.target.value)}><option value="">Toutes marques</option>{(BRANDS as string[]).map((s) => <option key={s} value={s}>{s}</option>)}</select>
              <select className="bf4-flt" value={fServ} onChange={(e) => setFServ(e.target.value)}><option value="">Tous services</option>{(SERVICES as string[]).map((s) => <option key={s} value={s}>{s}</option>)}</select>
              {filtering ? <button className="btn sm" onClick={() => { setFProj(''); setFSite(''); setFBrand(''); setFServ(''); }}>Effacer les filtres</button> : null}
            </div>
            {filtering && list?.length && !shown.length ? <div className="frm-empty">Aucun formulaire avec ces filtres.</div> : null}
            {list && !list.length ? (
              <div className="frm-empty big"><span className="frm-emo bony"><Icon name="forms" /></span><b>Aucun formulaire Bony</b>
                <span>Créez un formulaire à vos couleurs : il sera en ligne sur Cloudflare, prêt à être glissé derrière un bouton d’e-mailing.</span>
                <button className="btn primary" onClick={newSheet}><Icon name="plus" size="sm" />Nouveau formulaire</button></div>
            ) : (
              <div className="frm-grid">{shown.map((f, i) => {
                const s = STATUS[f.status] || STATUS.draft;
                return (
                  <article key={f.id} className="frm-card bony" style={{ '--i': i } as React.CSSProperties} onClick={() => openEditor(f)}>
                    <div className="frm-card-top"><span className="frm-ic bony"><Icon name="forms" /></span>
                      <span className="badge" style={{ '--c': s.c } as React.CSSProperties}><i className="dot" />{s.l}</span>
                      {f.dirty ? <span className="badge" style={{ '--c': 'var(--warn)' } as React.CSSProperties} data-tip="Modifications non publiées">●</span> : null}</div>
                    <b className="frm-t">{f.title}</b>
                    <div className="frm-meta"><span><b className="num">{f.responseCount.toLocaleString('fr-FR')}</b> réponse{f.responseCount > 1 ? 's' : ''}</span><span>Dernière : {rel(f.lastResponseAt)}</span></div>
                    {f.project || f.tags?.sites.length || f.tags?.brands.length || f.tags?.service.length ? <div className="bf4-tags">
                      {f.project ? <span className="badge" style={{ '--c': 'var(--bony-violet)' } as React.CSSProperties}><Icon name="projects" size="sm" />{f.project.name}</span> : null}
                      {[...(f.tags?.sites || []).slice(0, 3), ...(f.tags?.brands || []), ...(f.tags?.service || [])].map((t) => <span key={t} className="badge">{t}</span>)}
                      {(f.tags?.sites.length || 0) > 3 ? <span className="faint">+{(f.tags!.sites.length) - 3}</span> : null}
                    </div> : null}
                    <div className="frm-act" onClick={(e) => e.stopPropagation()}>
                      <button className="btn sm" onClick={() => openEditor(f)}><Icon name="edit" size="sm" />Modifier</button>
                      <button className="btn sm" onClick={() => openStats(f)}><Icon name="trending" size="sm" />Réponses</button>
                      {f.status !== 'draft' && f.url ? <button className="icon-btn sm" aria-label="Copier le lien" data-tip="Copier le lien" onClick={() => copyLink(f)}><Icon name="link" size="sm" /></button> : null}
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
                <button key={f.id} className={`frm-si ${sel?.id === f.id ? 'on' : ''}`} onClick={() => setSelId(f.id)}><b className="ellipsis">{f.title}</b><span>{plural(f.responseCount, 'réponse')}</span></button>))}
                {list && !list.length ? <div className="frm-empty">Aucun formulaire.</div> : null}</aside>
            )}
            {sel ? <React.Fragment key={sel.id}><BonyStats win={win} row={sel} list={list || []} compact={compact} onPick={setSelId} onEdit={() => openEditor(sel)} onChanged={load} /></React.Fragment> : <div className="frm-empty">{list ? 'Aucun formulaire à analyser.' : 'Chargement…'}</div>}
          </div>
        )}
      </div>
      {portals}
    </div>
  );
}

function NewSheet({ close, onDone }: { close: () => void; onDone: (f: BonyFormRow) => void }) {
  const [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const [tpl, setTpl] = useState('blank');
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { inp.current?.focus(); }, []);
  const go = async () => {
    if (!title.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      const f = await db.createBonyForm(title.trim());
      const m = TEMPLATES.find((x) => x.id === tpl);
      if (m && m.id !== 'blank') await db.saveBonyDraft(f.id, m.build(f.title));   // modèle : le brouillon est remplacé aussitôt
      hud(`« ${f.title} » créé`); onDone(f);
    }
    catch (e: any) { setErr(e?.message || 'Création impossible.'); setBusy(false); }
  };
  return (
    <div className="frm-sheet">
      <h3>Nouveau formulaire Bony</h3>
      <p className="muted">Créé en <b>brouillon</b> : personne ne le voit tant qu’il n’est pas publié.</p>
      <label className="frm-field"><span className="label">Titre</span>
        <input ref={inp} value={title} maxLength={200} onChange={(e) => { setTitle(e.target.value); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} placeholder="Ex. Jeu-concours Salon de l’auto 2026" /></label>
      <span className="label" style={{ display: 'block', margin: '12px 0 6px' }}>Partir de</span>
      <div className="frm-tpls">{TEMPLATES.map((m) => (
        <button key={m.id} className={tpl === m.id ? 'on' : ''} onClick={() => setTpl(m.id)}>
          <Icon name={m.icon} size="sm" /><b>{m.l}</b><span>{m.d}</span></button>))}</div>
      {err ? <div className="frm-err">{err}</div> : null}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn" onClick={close}>Annuler</button>
        <button className="btn primary" disabled={!title.trim() || busy} onClick={go}>{busy ? 'Création…' : 'Créer et modifier'}</button>
      </div>
    </div>
  );
}

// =====================================================================
// F3 — fichiers et signature d'une réponse ; planning des essais réservés.
// =====================================================================
function Extras({ def, formId, r }: { def: any; formId: string; r: BonyResponse | null }) {
  if (!r || !def) return null;
  const sigs = (def.fields || []).filter((f: any) => f.type === 'signature' && typeof r.answers?.[f.id] === 'string');
  const files = r.files || [];
  if (!sigs.length && !files.length) return null;
  const get = async (fid: string, name: string) => {
    try { const b = await db.getBonyFile(formId, r.id, fid); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
    catch (e: any) { hud(e?.message || 'Téléchargement impossible.'); }
  };
  return (
    <div className="bfs-extras">
      {sigs.map((f: any) => <div key={f.id} className="bfs-sig"><span className="faint">{f.label || 'Signature'}</span><img src={r.answers[f.id]} alt="Signature" /></div>)}
      {files.length ? <div className="bfs-files"><span className="faint">Fichiers déposés</span>{files.map((x) => (
        <button key={x.id} className="btn sm" onClick={() => get(x.id, x.name)}><Icon name="download" size="sm" /><span className="ellipsis">{x.name}</span><span className="faint">{x.size >= 1048576 ? `${(x.size / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(x.size / 1024))} Ko`}</span></button>))}</div> : null}
    </div>
  );
}
function Drives({ def, raw }: { def: any; raw: BonyResponse[] }) {
  const fields = (def?.fields || []).filter((f: any) => f.type === 'testdrive');
  if (!fields.length) return null;
  const who = (r: BonyResponse) => {
    const fs = def.fields || [], txt = (t: string) => fs.filter((f: any) => f.type === t).map((f: any) => r.answers?.[f.id]).filter((v: any) => typeof v === 'string' && v.trim());
    const name = fs.filter((f: any) => f.type === 'short').slice(0, 2).map((f: any) => r.answers?.[f.id]).filter(Boolean).join(' ');
    return [name, txt('phone')[0], txt('email')[0]].filter(Boolean).join(' · ') || 'Répondant';
  };
  const rows = raw.flatMap((r) => fields.map((f: any) => { const p = parseDrive(r.answers?.[f.id]); return p ? { p, car: f.drive?.cars.find((c: any) => c.id === p.car)?.label || p.car, who: who(r), id: r.id + f.id } : null; }).filter(Boolean) as any[])
    .sort((a, b) => `${a.p.date}T${a.p.time}`.localeCompare(`${b.p.date}T${b.p.time}`));
  const today = new Date().toISOString().slice(0, 10);
  const byDay = new Map<string, any[]>(); rows.forEach((x) => { byDay.set(x.p.date, [...(byDay.get(x.p.date) || []), x]); });
  return (
    <section className="frm-block">
      <div className="frm-bh"><b>Essais réservés</b><span className="faint">{rows.length} réservation{rows.length > 1 ? 's' : ''}</span></div>
      {!rows.length ? <div className="frm-empty">Aucun essai réservé pour l’instant.</div> : <div className="bfs-drives">{[...byDay.entries()].map(([day, xs]) => (
        <div key={day} className={`bfs-dday ${day < today ? 'past' : ''}`}>
          <b>{new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</b>
          {xs.map((x) => <div key={x.id} className="bfs-dr"><span className="num">{x.p.time.replace(':', 'h')}</span><span className="badge">{x.car}</span><span className="ellipsis">{x.who}</span></div>)}
        </div>))}</div>}
    </section>
  );
}

// =====================================================================
// D'où viennent les réponses (F2b) : utm_source / utm_campaign du lien (onglet « Partager »), sinon le site
// d'où vient le clic, sinon « Direct ». Lu dans meta, rempli par le Worker.
// =====================================================================
const SRC_L: Record<string, string> = { email: 'E-mailing', sms: 'SMS', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', site: 'Site Bony', qr: 'QR code', showroom: 'Showroom' };
function Sources({ raw }: { raw: BonyResponse[] }) {
  const by = (key: (r: BonyResponse) => string) => { const m = new Map<string, number>(); raw.forEach((r) => { const k = key(r); m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8); };
  const src = by((r) => { const u = r.meta?.params?.utm_source; return u ? SRC_L[u] || u : r.meta?.ref ? `Lien depuis ${r.meta.ref}` : 'Direct / inconnu'; });
  const camp = by((r) => r.meta?.params?.utm_campaign || '').filter(([k]) => k);
  if (!raw.length || (src.length === 1 && src[0][0] === 'Direct / inconnu' && !camp.length)) return null;
  const Bars = ({ rows }: { rows: [string, number][] }) => <div className="bfs-src">{rows.map(([k, n], i) => (
    <div key={k} className="bfs-sr" style={{ '--i': i } as React.CSSProperties}><span className="ellipsis">{k}</span><i style={{ '--w': `${(n / raw.length) * 100}%` } as React.CSSProperties} /><b className="num">{n}</b><span className="faint">{Math.round((n / raw.length) * 100)} %</span></div>))}</div>;
  return (
    <section className="frm-block">
      <div className="frm-bh"><b>D’où viennent les réponses</b><span className="faint">liens de l’onglet « Partager »</span></div>
      <div className="bfs-srcs"><div><div className="bfe-gt">Source</div><Bars rows={src} /></div>{camp.length ? <div><div className="bfe-gt">Campagne</div><Bars rows={camp} /></div> : null}</div>
    </section>
  );
}

// =====================================================================
// Réponses d'un formulaire Bony
// =====================================================================
function BonyStats({ row, list, compact, onPick, onEdit, onChanged, win }: { row: BonyFormRow; list: BonyFormRow[]; compact: boolean; onPick: (id: string) => void; onEdit: () => void; onChanged: () => void; win: any }) {
  const [d, setD] = useState<BonyFormDetail | null>(null);
  const [raw, setRaw] = useState<BonyResponse[] | null>(null);
  const [view, setView] = useState<'summary' | 'one'>('summary');
  const [idx, setIdx] = useState(0);
  const load = useCallback(() => Promise.all([db.getBonyForm(row.id), db.getBonyResponses(row.id)]).then(([a, b]) => { setD(a); setRaw(b); }).catch((e) => hud(e?.message || 'Lecture impossible.')), [row.id]);
  useEffect(() => { load(); }, [load]);
  // Temps réel : une réponse arrivée sur le Worker apparaît aussitôt.
  useEffect(() => { const s = getSocket(); const h = (p: any) => { if (!p || p.formId === row.id) load(); }; s?.on('bonyforms:response', h); return () => { s?.off('bonyforms:response', h); }; }, [load, row.id]);

  const def = d?.published || d?.draft;
  const qs = useMemo(() => bonyQuestions(def), [def]);
  const rs = useMemo(() => bonyResponses(def, raw || []), [def, raw]);
  const ov = useMemo(() => overview(rs), [rs]);
  const stats = useMemo(() => qs.map((x) => statOf(x, rs)), [qs, rs]);
  const timeline = useMemo(() => gx().chart.bars({
    labels: ov.series.map((x, i) => (i % 5 === 0 || i === ov.series.length - 1 ? `${x.d.getDate()}/${x.d.getMonth() + 1}` : '')),
    series: [{ name: 'Réponses', values: ov.series.map((x) => x.n) }], height: 150, fmt: (n: number) => String(Math.round(n)),
  }), [ov]);
  const exportXlsx = async () => {
    if (!rs.length) return hud('Aucune réponse à exporter.');
    const { headers, rows } = exportRows(qs, rs);
    const params = [...new Set(rs.flatMap((r) => Object.keys(r.meta?.params || {})))];
    const safe = row.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'formulaire';
    await writeSheetFile(`GEARBOX_FormsBony_${safe}.xlsx`, row.title, [...headers, ...params.map((p) => `Lien : ${p}`), 'Site d’origine'], rows.map((r, k) => [...r, ...params.map((p) => rs[k].meta?.params?.[p] || ''), rs[k].meta?.ref || '']));
  };
  const cur = rs[Math.min(idx, rs.length - 1)];
  const { open: openSheet, portals } = useSheets(win);
  const openDraw = () => openSheet((close) => <DrawSheet row={row} def={(def as any) || null} close={close} />, { width: 620 });
  const eraseOne = (el: HTMLElement) => gx().menu.open([
    { header: 'Effacer cette réponse ?' }, { label: 'Effacer définitivement (droit à l’effacement)', icon: 'trash', action: async () => { try { await db.deleteBonyResponse(row.id, cur.id); hud('Réponse effacée'); setIdx(Math.max(0, idx - 1)); load(); onChanged(); } catch (e: any) { hud(e?.message || 'Effacement impossible.'); } } },
    { label: 'Annuler', action: () => {} }], el, { align: 'right' });
  const s = STATUS[row.status] || STATUS.draft;
  return (
    <div className="frm-main scroll">
      {portals}
      <div className="frm-sh">
        {compact ? <select className="frm-pick" value={row.id} onChange={(e) => onPick(e.target.value)}>{list.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select> : <h2 className="ellipsis">{row.title}</h2>}
        <span className="badge" style={{ '--c': s.c } as React.CSSProperties}><i className="dot" />{s.l}</span>
        <span className="grow" />
        <button className="btn sm" onClick={() => openDraw()}><Icon name="gift" size="sm" />Tirage au sort</button>
        <button className="btn sm" onClick={exportXlsx}><Icon name="download" size="sm" />Excel</button>
        <button className="btn sm" onClick={onEdit}><Icon name="edit" size="sm" />Modifier</button>
      </div>
      {!d ? <div className="frm-empty">Lecture des réponses…</div> : (
        <>
          <div className="frm-kpis">
            <Kpi l="Réponses" v={ov.total} i={0} />
            <Kpi l="7 derniers jours" v={ov.last7} i={1} />
            <Kpi l="30 derniers jours" v={ov.last30} i={2} />
            <div className="frm-kpi" style={{ '--i': 3 } as React.CSSProperties}><span>Dernière réponse</span><b className="sm">{rel(row.lastResponseAt)}</b></div>
          </div>
          <section className="frm-block"><div className="frm-bh"><b>Réponses par jour</b><span className="faint">30 derniers jours · en direct</span></div><div className="frm-chart" dangerouslySetInnerHTML={{ __html: timeline }} /></section>
          <Sources raw={raw || []} />
          <Drives def={def} raw={raw || []} />
          <div className="frm-viewsw"><Seg value={view} onChange={setView} options={[['summary', 'Résumé'], ['one', 'Réponse par réponse']]} /></div>
          {!rs.length ? <div className="frm-empty">{row.status === 'draft' ? 'Formulaire pas encore publié.' : 'Aucune réponse pour l’instant.'}</div>
            : view === 'summary' ? <div className="frm-qs">{stats.map((x, i) => <React.Fragment key={x.q.id}><QCard s={x} total={rs.length} i={i} prevSection={i ? stats[i - 1].q.section : ''} /></React.Fragment>)}</div>
            : <>
                <OneResponse qs={qs} r={cur} idx={Math.min(idx, rs.length - 1)} n={rs.length} onIdx={setIdx} />
                <Extras def={def} formId={row.id} r={raw?.find((x) => x.id === cur.id) || null} />
                <div className="bfs-meta">
                  {cur.meta?.ending ? <span className="badge" style={{ '--c': 'var(--info)' } as React.CSSProperties}>Fin : {cur.meta.ending}</span> : null}
                  {cur.meta?.flag ? <span className="badge" style={{ '--c': 'var(--warn)' } as React.CSSProperties}>{cur.meta.flag}</span> : null}
                  {Object.entries(cur.meta?.params || {}).map(([k, v]) => <span key={k} className="badge" style={{ '--c': 'var(--bony-violet)' } as React.CSSProperties}>{k} = {String(v)}</span>)}
                  {cur.meta?.durationMs ? <span className="faint">Rempli en {Math.max(1, Math.round(cur.meta.durationMs / 1000))} s</span> : null}
                  <span className="grow" />
                  <button className="btn sm danger" onClick={(e) => eraseOne(e.currentTarget)}><Icon name="trash" size="sm" />Effacer cette réponse</button>
                </div>
              </>}
        </>
      )}
    </div>
  );
}
