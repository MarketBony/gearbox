import React, { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { Project, Task } from '../../../types';
import { isSiteManager } from '../../../constants';
import { useAuth } from '../../../contexts/AuthContext';
import { useWorkspace, workspace, mutateTask } from '../../store/workspace';
import { groupeDuProjet, sitesDuProjet } from '../../../utils/projet';
import { gx, Icon, Seg, PickerBtn, DraftInput, BrandChips, useEngineEvent, useEngineStore } from '../ui/kit';
import { pd, perLabel, shift, buckets, avg, intFmt, volFmt, pctLine, type Period } from './charts';

// =====================================================================
// Rubrique « Campagnes » — transposition de maquettes/v2/js/apps/campaigns.js sur l'espace de travail.
// Parité : maquettes/ux/inventaires/campagnes.md. Il n'y a PAS d'entité « campagne » ici : une campagne
// est une TÂCHE de projet au canal SMS ou E-mail (projets Brouillons exclus, Archivés comptés), datée
// par la date de DÉBUT du projet. Écritures : `mutateTask` (file de sauvegarde + recalculerProjet),
// champs de la liste blanche `TASK_FIELDS` (volumetry, openRate, npaiRate, stopRate, clickRate, codTxt,
// billedAmount). Aucun montant de budget n'est calculé ici.
// =====================================================================

const EDIT = ['Master', 'Administrator', 'Director', 'Coordinator'];                 // Campaigns.tsx (Digital Manager exclu)
const BRANDS = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize'];                  // Holding exclue des choix
const PCT = ['openRate', 'npaiRate', 'stopRate', 'clickRate'] as const;
const MAIL = 'var(--bony-orange)', SMS = 'var(--info)';
const PIE: Record<string, string> = { VN: '#f75632', VO: '#8f12ab', APV: '#293f74', PR: '#06b6d4' };
const CH = 128;
type NumKey = 'volumetry' | typeof PCT[number] | 'billedAmount';
type Metric = 'Volume' | 'Ouverture' | 'Clics';
interface Row { t: Task; p: Project; sites: string[] }

const SS = (k: string) => `gearbox_session_${k}`;
const ssGet = <T,>(k: string, d: T): T => { try { const v = sessionStorage.getItem(SS(k)); return v === null ? d : JSON.parse(v); } catch { return d; } };
const ssSet = (k: string, v: unknown) => { try { sessionStorage.setItem(SS(k), JSON.stringify(v)); } catch { /* navigation privée */ } };

interface Fl { q: string; canal: '' | 'E-mail' | 'SMS'; zone: string; brand: string }
const Y = new Date().getFullYear();
const P0 = (): Period => ({ from: `${Y}-01-01`, to: `${Y}-12-31` });

/** Périmètre global (barre de menus), sur les VRAIS sites du projet. */
function inPer(r: Row) {
  const x: string = gx().ctx.site || gx().ctx.perimetre || 'Tout le réseau'; if (x === 'Tout le réseau') return true;
  if (x === 'Nissan') return (r.p.brands || []).includes('Nissan');
  const pl: string[] | undefined = gx().data.PLAQUES[x];
  return pl ? r.sites.some((s) => pl.includes(s)) : r.sites.includes(x);
}
const siteOf = (r: Row) => groupeDuProjet(r.p) || (r.sites.length ? r.sites[0] + (r.sites.length > 1 ? ` +${r.sites.length - 1}` : '') : '—');
const pctTxt = (v?: number | null) => (v == null ? '-' : String(v).replace('.', ',') + ' %');

const TRow: React.FC<{ r: Row; dis: boolean; onSet: (r: Row, k: keyof Task, v: any) => void }> = React.memo(function TRow({ r, dis, onSet }) {
  const { t, p } = r, mail = t.channel === 'E-mail';
  const next = (e: React.KeyboardEvent, k: string) => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    const tr = (e.currentTarget as HTMLElement).closest('tr'); const n = e.key === 'Enter' ? tr?.nextElementSibling?.querySelector<HTMLInputElement>(`[data-k="${k}"]`) : null;
    if (n) { e.preventDefault(); n.focus(); } else (e.currentTarget as HTMLInputElement).blur();
  };
  const num = (k: NumKey, cls: string) => {
    const pct = (PCT as readonly string[]).includes(k);
    const inp = <DraftInput className={`cmp-in ${cls}`} type="number" empty="null" inputMode="decimal" min={0} max={pct ? 100 : undefined} step={pct ? 0.1 : 1} data-k={k} aria-label={k}
      value={(t as any)[k] ?? null} placeholder={pct ? '-' : '0'} disabled={dis} onFocus={(e: any) => e.target.select?.()} onKeyDown={(e: any) => next(e, k)}
      // Borné au commit (pas à la frappe) : taux 0-100, volumes et montants ≥ 0 ; vide = non renseigné (null, jamais 0).
      onCommit={(v: number | null) => onSet(r, k, v == null ? null : pct ? Math.max(0, Math.min(100, v)) : Math.max(0, v))} />;
    return k === 'billedAmount' ? <span className="cmp-eur">{inp}</span> : inp;
  };
  const open = (e: React.MouseEvent) => gx().wm.open('project', { id: p.id, title: p.name }, { origin: e.currentTarget });
  return (
    <tr data-t={t.id} data-p={p.id}>
      <td className="dt">{p.startDate ? pd(p.startDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'}</td>
      <td><div className="cp"><span className="ic" style={{ '--c': mail ? MAIL : SMS } as React.CSSProperties} data-tip={t.channel}><Icon name={mail ? 'mail' : 'sms'} size="sm" /></span><div style={{ minWidth: 0, flex: 1 }}><div className="pn ellipsis" data-tip={p.name} onClick={open}>{p.name}</div>
        <div className="l2"><span className="tn" data-tip={t.name}>{t.name}</span><span className="badge site">{siteOf(r)}</span><BrandChips brands={p.brands || []} /></div></div></div></td>
      <td className="r num muted" style={{ whiteSpace: 'nowrap' }}>{gx().fmt.n(t.cost || 0)} €</td>
      <td className="r in">{num('volumetry', 'w')}</td>
      {PCT.map((k) => <td key={k} className="r in">{num(k, '')}</td>)}
      <td className="in"><DraftInput className="cmp-in t" data-k="codTxt" aria-label="codTxt" value={t.codTxt ?? ''} placeholder="Code..." disabled={dis} onFocus={(e: any) => e.target.select?.()} onKeyDown={(e: any) => next(e, 'codTxt')} onCommit={(v: string) => onSet(r, 'codTxt', v.trim())} /></td>
      <td className="r in">{num('billedAmount', 'w')}</td>
    </tr>
  );
}, (a, b) => a.r.t === b.r.t && a.r.p === b.r.p && a.dis === b.dis);

export default function CampaignsApp({ win, inst }: AppProps) {
  const { user } = useAuth();
  const projects = useWorkspace((s) => s.projects);
  const ready = useWorkspace((s) => s.ready);
  const saving = useWorkspace((s) => s.saving) > 0;
  const role = user?.role || '';
  // L'accès est refusé par la coque (canOpen) ; garde locale en plus, comme la maquette.
  const allowed = !isSiteManager(role) && role !== 'External';
  const canEdit = EDIT.includes(role) && !gx().ctx.readOnly;

  // --- état persistant (mêmes clés que pages/Campaigns.tsx)
  const [P, setPS] = useState<Period>(() => ({ from: ssGet('campaigns_start', P0().from), to: ssGet('campaigns_end', P0().to) }));
  const setP = (n: Period) => { setPS(n); ssSet('campaigns_start', n.from); ssSet('campaigns_end', n.to); };
  const [fl, setFlS] = useState<Fl>(() => {
    const ch = ssGet<string>('campaigns_filterChannel', 'All'), z = ssGet<string>('campaigns_filterContext', 'All'), b = ssGet<string>('campaigns_filterBrand', 'All');
    return { q: ssGet('campaigns_searchTerm', ''), canal: ch === 'All' ? '' : (ch as any), zone: z === 'All' ? '' : z, brand: b === 'All' ? '' : b };
  });
  const setFl = (n: Fl) => { setFlS(n); ssSet('campaigns_searchTerm', n.q); ssSet('campaigns_filterChannel', n.canal || 'All'); ssSet('campaigns_filterContext', n.zone || 'All'); ssSet('campaigns_filterBrand', n.brand || 'All'); };
  const [dir, setDirS] = useState<number>(() => (ssGet<string>('campaigns_sortOrder', 'desc') === 'asc' ? 1 : -1));
  const setDir = (d: number) => { setDirS(d); ssSet('campaigns_sortOrder', d > 0 ? 'asc' : 'desc'); };
  const [metric, setMetricS] = useState<Metric>(() => ssGet<Metric>('campaigns_c2Metric', 'Volume'));
  const setMetric = (m: Metric) => { setMetricS(m); ssSet('campaigns_c2Metric', m); };
  const [showA, setShowAS] = useState<boolean>(() => ssGet('campaigns_chartsOuverts', true));
  const [showF, setShowF] = useEngineStore<boolean>('cmp.filtres', true);
  const [, setTick] = useState(0);
  useEngineEvent('ctx', () => setTick((n) => n + 1));

  // --- lignes : tâches SMS / E-mail des projets non brouillons
  const base = useMemo(() => {
    const out: Row[] = [];
    for (const p of projects) {
      if (p.status === 'Draft') continue;                                   // Brouillon : ne remonte nulle part
      const sites = sitesDuProjet(p);
      for (const t of p.tasks || []) if (t.channel === 'SMS' || t.channel === 'E-mail') out.push({ t, p, sites });
    }
    return out;
  }, [projects]);
  const fd = useDeferredValue(fl);
  const rows = useMemo(() => {
    const q = fd.q.trim().toLowerCase(), plaques: Record<string, string[]> = gx().data.PLAQUES;
    const zone = !fd.zone ? null : plaques[fd.zone] || [fd.zone];
    return base.filter((r) => { const p = r.p, t = r.t, sd = p.startDate || '';
      return inPer(r) && sd >= P.from && sd <= P.to
        && (!fd.brand || (p.brands || []).includes(fd.brand as any) || (p.brands || []).includes('Holding'))   // Holding remonte sous toute marque
        && (!zone || r.sites.some((x) => zone.includes(x)))
        && (!fd.canal || t.channel === fd.canal)
        && (!q || `${t.name} ${p.name}`.toLowerCase().includes(q)); })
      .sort((x, y) => dir * (x.p.startDate || '').localeCompare(y.p.startDate || '') || x.p.name.localeCompare(y.p.name));
  }, [base, fd, P, dir]); // eslint-disable-line react-hooks/exhaustive-deps
  const nFilters = [fl.canal, fl.zone, fl.brand, fl.q.trim()].filter(Boolean).length;

  // --- graphiques (canal + période : mêmes lignes que la liste)
  const charts = useMemo(() => {
    if (!showA) return null;
    const C = gx().chart, F = gx().fmt;
    const bk = buckets(pd(P.from), pd(P.to)), labels = bk.map((b) => b.l);
    const inB = bk.map((b) => rows.filter(({ p }) => (p.startDate || '') >= b.s && (p.startDate || '') <= b.e));
    const perf = metric === 'Volume'
      ? C.bars({ labels, series: [{ name: 'Volume', values: inB.map((l) => l.reduce((s, { t }) => s + (+(t.volumetry as any) || 0), 0)), color: 'var(--bony-violet)' }], height: CH, fmt: volFmt })
      : pctLine(labels, inB.map((l) => avg(l.map(({ t }) => (metric === 'Ouverture' ? t.openRate : t.clickRate)).filter((v): v is number => v != null && (v as any) !== ''))), 'var(--bony-violet)', CH);
    // Règle de Campaigns.tsx : montant = facturé, à défaut coût ; service = le 1er du projet ;
    // « Tous Services » réparti en 4 parts égales VN / VO / APV / PR.
    const svc: Record<string, number> = { VN: 0, VO: 0, APV: 0, PR: 0 };
    rows.forEach(({ t, p }) => { const amt = +(t.billedAmount as any) || +t.cost || 0, s = (p.service && p.service[0]) || 'Tous Services';
      if (s === 'Tous Services') Object.keys(svc).forEach((k) => (svc[k] += amt / 4)); else if (s in svc) svc[s] += amt; });
    const parts = Object.keys(svc).map((s) => ({ label: s, value: Math.round(svc[s]), color: PIE[s] })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
    const billed = parts.reduce((a, x) => a + x.value, 0);
    return {
      count: C.bars({ labels, series: [{ name: 'Campagnes', values: inB.map((l) => l.length), color: 'var(--bony-orange)' }], height: CH, fmt: intFmt }) as string,
      perf: perf as string,
      donut: parts.length ? (C.donut({ parts, center: F.eurK(billed), sub: 'facturés', size: 116 }) as string) : '', legend: parts.length ? (C.legend(parts, F.eur) as string) : '',
    };
  }, [rows, P, metric, showA]);

  // Rafraîchissement visuel des cartes après une saisie (maquette : `cmp-live`)
  const chartsRef = useRef<HTMLDivElement>(null), live = useRef(false);
  useLayoutEffect(() => { if (!live.current) return; live.current = false; chartsRef.current?.querySelectorAll('.cmp-card').forEach((c) => { c.classList.remove('cmp-live'); void (c as HTMLElement).offsetWidth; c.classList.add('cmp-live'); }); }, [charts]);

  const onSet = React.useCallback((r: Row, k: keyof Task, v: any) => {
    if (!canEdit) return;
    // Refus d'écrire sur une tâche qui n'existe plus (pas de résurrection au départ d'un champ).
    const cur = workspace.getState().byId[r.p.id]; const t = cur?.tasks.find((x) => x.id === r.t.id); if (!cur || !t) return;
    if (((t as any)[k] ?? null) === (v ?? null)) return;
    live.current = true; mutateTask(r.p.id, r.t.id, { [k]: v } as Partial<Task>);
  }, [canEdit]);

  // --- en-tête : période, analyse, filtres
  const h2Ref = useRef<HTMLDivElement>(null), qRef = useRef<HTMLInputElement>(null);
  const toggleFilters = () => {
    const v = !showF; setShowF(v);
    if (v) requestAnimationFrame(() => { if (h2Ref.current) gx().animate(h2Ref.current, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { spring: 'snappy' }); setTimeout(() => qRef.current?.focus(), 60); });
  };
  const toggleAnalyse = () => {
    const c = chartsRef.current;
    if (showA) { if (!c) { setShowAS(false); ssSet('campaigns_chartsOuverts', false); return; } const h = c.offsetHeight; gx().animate(c, [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { spring: 'snappy' }).onfinish = () => { setShowAS(false); ssSet('campaigns_chartsOuverts', false); }; }
    else { setShowAS(true); ssSet('campaigns_chartsOuverts', true); requestAnimationFrame(() => { const el = chartsRef.current; if (el) { const h = el.scrollHeight; gx().animate(el, [{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { spring: 'snappy' }); } }); }
  };
  const resetAll = () => { setFl({ q: '', canal: '', zone: '', brand: '' }); setP(P0()); setDir(-1); };
  const pickZone = (el: HTMLElement) => {
    const PL: Record<string, string[]> = gx().data.PLAQUES;
    gx().ui.pick(el, [{ items: [{ v: '', l: 'Tout le réseau' }] }, { label: 'Plaques', items: Object.keys(PL).map((pl) => ({ v: pl, l: '★ ' + pl, hint: PL[pl].length + ' sites' })) },
      ...Object.entries(PL).map(([pl, ss]) => ({ label: pl, collapsible: true, items: ss.map((s) => ({ v: s, l: s })) }))],
    { multi: false, selected: [fl.zone], title: 'Plaque / Site', width: 290, onChange: ([v]: string[]) => setFl({ ...fl, zone: v || '' }) });
  };
  const pickBrand = (el: HTMLElement) => gx().ui.pick(el, [{ items: [{ v: '', l: 'Toutes marques' }, ...BRANDS.map((b) => ({ v: b, l: b, color: gx().data.brand(b)?.hex }))] }],
    { multi: false, selected: [fl.brand], title: 'Marque', onChange: ([v]: string[]) => setFl({ ...fl, brand: v || '' }) });
  const setPer = (k: string) => {
    const t = gx().today(), y = t.getFullYear(), m = t.getMonth(), dow = (t.getDay() + 6) % 7;
    const R: Record<string, [Date, Date]> = { week: [gx().addDays(t, -dow), gx().addDays(t, 6 - dow)], month: [new Date(y, m, 1), new Date(y, m + 1, 0)], quarter: [new Date(y, m - (m % 3), 1), new Date(y, m - (m % 3) + 3, 0)],
      semester: [new Date(y, m < 6 ? 0 : 6, 1), new Date(y, m < 6 ? 6 : 12, 0)], year: [new Date(y, 0, 1), new Date(y, 11, 31)] };
    setP({ from: gx().iso(R[k][0]), to: gx().iso(R[k][1]) });
  };
  const perBtn = useRef<HTMLButtonElement>(null);
  const openPeriod = (el: HTMLElement) => gx().ui.dateRange(el, { from: P.from, to: P.to }, ({ from, to }: { from?: string; to?: string }) => { if (from && to && from <= to) setP({ from, to }); });

  useEffect(() => { win.setTitle('Campagnes'); }, [win]);
  inst.command = (c: string) => { if (c === 'filters') { if (!showF) toggleFilters(); else qRef.current?.focus(); } };
  inst.menus = () => ({
    'Présentation': [{ label: showA ? 'Masquer l’analyse' : 'Afficher l’analyse', icon: 'barchart', action: toggleAnalyse }, '-',
      { header: 'Période' }, ...[['week', 'Cette semaine'], ['month', 'Ce mois'], ['quarter', 'Ce trimestre'], ['semester', 'Ce semestre'], ['year', 'Cette année']].map(([k, l]) => ({ label: l, action: () => setPer(k) })),
      { label: 'Personnalisé…', icon: 'agenda', action: () => perBtn.current && openPeriod(perBtn.current) }, '-',
      { label: 'Date : plus récentes d’abord', checked: dir < 0, action: () => setDir(-1) }, { label: 'Date : plus anciennes d’abord', checked: dir > 0, action: () => setDir(1) }],
  });

  if (!allowed) return <div className="app"><div className="empty" style={{ height: '100%' }}><Icon name="lock" /><b style={{ color: 'var(--text)', fontSize: 16 }}>Accès restreint</b>Votre rôle n’a pas accès aux Campagnes.</div></div>;

  const per: string = gx().ctx.site || gx().ctx.perimetre || 'Tout le réseau';
  const zl = fl.zone ? (gx().data.PLAQUES[fl.zone] ? '★ ' + fl.zone : fl.zone) : 'Tout le réseau';
  const empty = <div className="empty"><Icon name="campaigns" /><b style={{ color: 'var(--text)' }}>{ready ? 'Aucune campagne trouvée' : 'Chargement…'}</b>{ready ? 'Ajoutez des tâches « SMS » ou « E-mail » dans vos projets.' : ''}</div>;
  const dis = !canEdit;
  return (
    <div className="app">
      <div className="app-head cmp-h"><div className="ah-t"><span className="ah-eye">Com digitale</span><h1>Campagnes</h1><span className="sub">Performance SMS &amp; E-mailing <span className={`cmp-saving ${saving ? '' : 'hide'}`}>ENREGISTREMENT...</span></span></div>
        <div className="ah-f">
          {per !== 'Tout le réseau' ? <button className="chip" data-tip="Périmètre global — barre de menus"><Icon name={gx().ctx.site ? 'lock' : 'pin'} size="sm" />{per}</button> : null}
          <span className="cmp-nav"><button className="icon-btn" data-tip="Période précédente" onClick={() => setP(shift(P, -1))}><Icon name="back" size="sm" /></button><PickerBtn ref={perBtn} icon="agenda" label={perLabel(P.from, P.to)} active={P.from !== P0().from || P.to !== P0().to} onClick={openPeriod} /><button className="icon-btn" data-tip="Période suivante" onClick={() => setP(shift(P, 1))}><Icon name="chevron" size="sm" /></button></span>
          <button className="btn sm" data-tip={showA ? 'Masquer les graphiques pour gagner de la place' : 'Afficher les graphiques d’analyse'} onClick={toggleAnalyse}><Icon name="barchart" size="sm" />{showA ? 'Masquer l’analyse' : 'Afficher l’analyse'}</button>
          <button className={`btn sm ${showF ? 'primary' : ''}`} onClick={toggleFilters}><Icon name={showF ? 'close' : 'filter'} size="sm" />Filtres liste{nFilters ? <> <span className="count">{nFilters}</span></> : null}</button>
        </div></div>
      <div ref={h2Ref} className={`app-head2 ${showF ? '' : 'hide'}`}>
        <div className="cmp-fq"><span className="label">Recherche</span><label className="search" style={{ width: 260 }}><Icon name="search" size="sm" /><input ref={qRef} placeholder="Filtrer la liste..." value={fl.q} onChange={(e) => setFl({ ...fl, q: e.target.value })} /></label></div>
        <span className="cmp-fsep" />
        <div><span className="label">Canal</span><Seg className="cmp-canal" value={fl.canal} options={[['', 'Tout'], ['E-mail', 'E-mail'], ['SMS', 'SMS']]} onChange={(v) => setFl({ ...fl, canal: v })} /></div>
        <div><span className="label">Plaque / Site</span><PickerBtn icon="pin" label={zl} active={!!fl.zone} onClick={pickZone} /></div>
        <div><span className="label">Marque</span><PickerBtn icon="tag" label={fl.brand || 'Toutes marques'} active={!!fl.brand} onClick={pickBrand} /></div>
        <button className="btn sm ghost" style={{ alignSelf: 'flex-end' }} data-tip="Filtres, période (année en cours) et tri (plus récentes d’abord)" onClick={resetAll}><Icon name="refresh" size="sm" />Réinitialiser tout</button>
        <span className="grow" />{canEdit ? null : <span className="badge" style={{ '--c': 'var(--text-3)', alignSelf: 'center' } as React.CSSProperties}>Lecture seule</span>}<span className="cmp-n num" style={{ alignSelf: 'center' }}>{rows.length} résultat{rows.length > 1 ? 's' : ''}</span>
      </div>
      <div className="cmp-root">
        {showA && charts ? <div className="cmp-charts" ref={chartsRef}>
          <div className="card cmp-card" style={{ '--c': 'var(--bony-orange)' } as React.CSSProperties}><h3><Icon name="campaigns" size="sm" />Nb Campagnes<span className="faint num">{rows.length} au total</span></h3><div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: charts.count }} /></div>
          <div className="card cmp-card" style={{ '--c': 'var(--bony-violet)' } as React.CSSProperties}><h3><Icon name="barchart" size="sm" />Performance<Seg value={metric} options={[['Volume', 'Volume'], ['Ouverture', 'Ouverture'], ['Clics', 'Clics']]} onChange={setMetric} /></h3><div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: charts.perf }} /></div>
          <div className="card cmp-card" style={{ '--c': 'var(--info)' } as React.CSSProperties}><h3><Icon name="euro" size="sm" />Facturé / Svc<span className="faint">« Tous Services » réparti</span></h3>
            {charts.donut ? <div className="cmp-donut"><div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: charts.donut }} /><div className="grow gxleg" style={{ minWidth: 140 }} dangerouslySetInnerHTML={{ __html: charts.legend }} /></div> : <div className="empty" style={{ padding: 24 }}>Aucune donnée</div>}</div>
        </div> : null}
        <div className="card cmp-list"><div className="cmp-tscroll">
          {rows.length ? <table className="tbl cmp-tbl"><thead><tr><th className="s" data-tip="Date de début du projet" onClick={() => setDir(-dir)}>Date <span style={{ display: 'inline-block', verticalAlign: -2, transition: 'transform var(--t-med)', transform: `rotate(${dir > 0 ? 180 : 0}deg)` }}><Icon name="chevdown" size="sm" /></span></th><th>Campagne / Projet</th><th className="r">Coût</th><th className="r">Vol.</th><th className="r">Ouv. %</th><th className="r">NPAI %</th><th className="r">STOP %</th><th className="r">Clics %</th><th>COD TXT</th><th className="r">Factu €</th></tr></thead>
            <tbody>{rows.map((r) => <TRow key={`${r.p.id}:${r.t.id}`} r={r} dis={dis} onSet={onSet} />)}</tbody></table> : empty}
        </div></div>
        <div className="cmp-cards">
          {rows.length ? rows.map((r) => { const { t, p } = r, mail = t.channel === 'E-mail'; return (
            <div key={`${p.id}:${t.id}`} className="cmp-mc" style={{ '--c': mail ? MAIL : SMS } as React.CSSProperties} onClick={(e) => gx().wm.open('project', { id: p.id, title: p.name }, { origin: e.currentTarget })}>
              <div className="top"><span style={{ color: 'var(--accent)' }} className="num">{p.startDate ? pd(p.startDate).toLocaleDateString('fr-FR') : '-'}</span><span style={{ color: mail ? MAIL : SMS }}><Icon name={mail ? 'mail' : 'sms'} size="sm" /> {t.channel}</span></div>
              <div className="nm">{t.name || p.name}</div>
              <div className="kv"><span>{siteOf(r)}</span>{t.volumetry != null ? <span>Vol : <b className="num">{gx().fmt.n(t.volumetry)}</b></span> : null}{t.cost ? <span><b className="num">{gx().fmt.eur(t.cost)}</b></span> : null}{t.openRate != null ? <span>Ouv. <b className="num">{pctTxt(t.openRate)}</b></span> : null}{t.billedAmount != null ? <span>Factu <b className="num">{gx().fmt.eur(t.billedAmount)}</b></span> : null}</div>
              <div className="row wrap" style={{ gap: 4 }}><BrandChips brands={p.brands || []} /></div>
            </div>); }) : empty}
        </div>
      </div>
    </div>
  );
}
