import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import { useAuth } from '../../../contexts/AuthContext';
// BESOIN: `EXPORT_ALLOWED_ROLES` vit dans pages/Export.tsx (App.tsx l'importe de là) : à déplacer dans constants.ts.
import { EXPORT_ALLOWED_ROLES } from '../../../constants';
import { useWorkspace, workspace, reloadProjects } from '../../store/workspace';
import { fixedExpenses } from '../../store/collections';
import { gx, Icon } from '../ui/kit';
import { buildExport, writeExportFile, exportFileName, periodError, PROJ_HEADERS, EXP_HEADERS, type ExportData, type Cell } from '../../../services/exportXlsx';

// =====================================================================
// Rubrique « Export » (Export Excel) — transposition de maquettes/v2/js/apps/export.js (même
// balisage, mêmes classes), sur les VRAIES données. Parité : maquettes/ux/inventaires/export.md.
//  - réservé à EXPORT_ALLOWED_ROLES (Master, Administrator, Director, Coordinator), sinon écran
//    « Accès restreint » (texte réel) ; les dépenses fixes ne sont même pas chargées sinon ;
//  - le FICHIER est celui de la page actuelle, octet pour octet (./exportXlsx.ts : mêmes filtres,
//    colonnes, valeurs brutes, `xlsx-js-style`, nom `GEARBOX_Export_<du>_<au>.xlsx`) ;
//  - au clic, les projets sont RELUS (`reloadProjects`, ordre de l'API comme la page) ; les dépenses
//    fixes viennent de la ressource partagée, tenue à jour par le temps réel ;
//  - l'aperçu façon tableur montre exactement les lignes écrites dans le fichier (plus de CSV de
//    démonstration : il n'existait que dans la maquette).
// =====================================================================

type Sheet = 'Projets' | 'Dépenses';
const COLS: Record<Sheet, string[]> = { Projets: PROJ_HEADERS, Dépenses: EXP_HEADERS };
const MONEY = new Set(['Budget prévisionnel', 'Budget réalisé', 'Montant']);
const NUM = new Set([...MONEY, 'Avancement (%)']);
const WIDE: Record<string, number> = { Nom: 200, Description: 320, Commentaire: 220, 'Site(s)': 150 };
const STEPS = ['Lecture des projets…', 'Lecture des dépenses fixes…', 'Mise en forme des onglets…', 'Écriture du classeur…'];
const STEP_W = [8, 42, 72, 94];
const colL = (i: number) => String.fromCharCode(65 + i);
const fmtCell = (col: string, v: Cell) => (MONEY.has(col) ? gx().fmt.eur(v) : col === 'Avancement (%)' ? `${v} %` : String(v));
const plural = (n: number, s: string) => `${n} ${s}${n > 1 ? 's' : ''}`;
const rowsOf = (d: ExportData, s: Sheet) => (s === 'Projets' ? d.projects : d.expenses);

interface Gen { du: string; au: string; data: ExportData; projects: unknown; expenses: unknown }

/** Grille de l'aperçu : rendue une fois par onglet ; la sélection de cellule est posée sans re-rendu. */
const Grid = React.memo(function Grid({ cols, rows }: { cols: string[]; rows: Cell[][] }) {
  return (
    <table><colgroup><col style={{ width: 40 }} />{cols.map((c, i) => <col key={i} style={{ width: WIDE[c] || (NUM.has(c) ? 124 : 108) }} />)}</colgroup>
      <thead><tr><th />{cols.map((_, i) => <th key={i} data-ch={i}>{colL(i)}</th>)}</tr></thead>
      <tbody><tr className="h"><th data-rh={0}>1</th>{cols.map((c, i) => <td key={i} data-c={i} data-r={0}>{c}</td>)}</tr>
        {rows.map((r, ri) => <tr key={ri}><th data-rh={ri + 1}>{ri + 2}</th>{r.map((v, i) => <td key={i} className={NUM.has(cols[i]) ? 'n' : ''} data-c={i} data-r={ri + 1}>{fmtCell(cols[i], v)}</td>)}</tr>)}</tbody></table>
  );
});

export default function ExportApp({ win, inst }: AppProps) {
  const { user } = useAuth();
  const allowed = EXPORT_ALLOWED_ROLES.includes(user?.role ?? '');
  const projects = useWorkspace((s) => s.projects);
  const ready = useWorkspace((s) => s.ready);
  const expenses = fixedExpenses.useWhen(allowed);
  const Y = new Date().getFullYear();
  const [du, setDu] = useState(`${Y}-01-01`), [au, setAu] = useState(`${Y}-12-31`);
  const [busy, setBusy] = useState(false), [step, setStep] = useState(0);
  const [msg, setMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [gen, setGen] = useState<Gen | null>(null);
  const [sheet, setSheet] = useState<Sheet>('Projets');
  const prevRef = useRef<HTMLElement>(null), gridHost = useRef<HTMLDivElement>(null), refEl = useRef<HTMLSpanElement>(null), valEl = useRef<HTMLSpanElement>(null);
  const selC = useRef<[number, number]>([1, 0]);

  const bad = periodError(du, au);
  // « Sur la période » : même filtre que le fichier, sur les données déjà chargées.
  const live = useMemo(() => (bad ? { projects: [], expenses: [] } : buildExport(projects, expenses || [], du, au)), [projects, expenses, du, au, bad]);
  const datesChanged = !!gen && (gen.du !== du || gen.au !== au);
  const dataChanged = !!gen && (gen.projects !== projects || (expenses !== undefined && gen.expenses !== expenses));
  const stale = datesChanged || dataChanged;
  const data = gen?.data;

  const generate = async () => {
    if (busy || !allowed) return;
    setMsg(null);
    if (bad) { setMsg({ type: 'error', text: bad }); return; }
    setBusy(true); setStep(0);
    try {
      await reloadProjects();                                                   // relecture, comme la page (données fraîches)
      setStep(1);
      if (fixedExpenses.get() === undefined) await fixedExpenses.ensure();
      // BESOIN: relecture ATTENDABLE d'une ressource (collections.ts) — `reloadAll` est différé de 300 ms
      // et ne se laisse pas attendre ; la page relisait aussi `/fixed-expenses` au clic.
      const P = workspace.getState().projects, E = fixedExpenses.get() || [];
      setStep(2);
      const d = buildExport(P, E, du, au);
      if (d.projects.length === 0 && d.expenses.length === 0) {
        setMsg({ type: 'info', text: 'Aucune donnée (projet ou dépense fixe) sur la période sélectionnée.' });
        return;
      }
      setStep(3);
      await writeExportFile(d, du, au);
      const first = !gen;
      setGen({ du, au, data: d, projects: P, expenses: E }); setSheet(d.projects.length ? 'Projets' : 'Dépenses'); selC.current = [1, 0];
      if (first) requestAnimationFrame(() => { if (prevRef.current) gx().animate(prevRef.current, [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' }); });
      gx().shell?.notify?.({ app: 'export', title: 'Export prêt', body: `${exportFileName(du, au)} — ${plural(d.projects.length, 'projet')} · ${d.expenses.length} dépenses fixes`, silent: true });
    } catch (err) {
      console.error('Export error:', err);
      setMsg({ type: 'error', text: 'Une erreur est survenue lors de la génération du fichier.' });
    } finally {
      setBusy(false);
    }
  };

  // --- aperçu façon tableur : sélection de cellule (mêmes gestes que la maquette)
  const selectCell = (r: number, c: number, scroll = true) => {
    const host = gridHost.current; if (!host || !data) return;
    const cols = COLS[sheet], rows = rowsOf(data, sheet); selC.current = [r, c];
    host.querySelectorAll('td.sel, th.on').forEach((q) => q.classList.remove('sel', 'on'));
    const td = host.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"]`); if (!td) return;
    td.classList.add('sel'); host.querySelector(`th[data-ch="${c}"]`)?.classList.add('on'); host.querySelector(`th[data-rh="${r}"]`)?.classList.add('on');
    if (refEl.current) refEl.current.textContent = colL(c) + (r + 1);
    const raw = r === 0 ? cols[c] : rows[r - 1][c];
    if (valEl.current) valEl.current.textContent = r > 0 && NUM.has(cols[c]) ? String(raw).replace('.', ',') : String(raw);
    if (scroll) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  useLayoutEffect(() => { if (data) selectCell(Math.min(selC.current[0], rowsOf(data, sheet).length), selC.current[1], false); }, [data, sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  const onGridKey = (e: React.KeyboardEvent) => {
    if (!data) return;
    const mv = ({ ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1], Enter: [1, 0], Tab: [0, e.shiftKey ? -1 : 1] } as Record<string, [number, number]>)[e.key]; if (!mv) return;
    e.preventDefault(); const rows = rowsOf(data, sheet), cols = COLS[sheet];
    selectCell(Math.max(0, Math.min(rows.length, selC.current[0] + mv[0])), Math.max(0, Math.min(cols.length - 1, selC.current[1] + mv[1])));
  };
  const switchSheet = (s: Sheet) => { if (!data || s === sheet) return; selC.current = [1, 0]; setSheet(s); };

  useEffect(() => { win.setTitle('Export Excel', allowed && data ? sheet : ''); }, [allowed, !!data, sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  inst.command = (c: string) => { if (c === 'generate' && allowed) void generate(); };
  inst.menus = () => ({
    'Fichier': [{ label: 'Générer le fichier Excel', icon: 'download', disabled: !allowed || busy, action: () => void generate() }],
    'Présentation': data ? (Object.keys(COLS) as Sheet[]).map((s) => ({ label: 'Onglet ' + s, checked: sheet === s, action: () => switchSheet(s) })) : [{ label: 'Générez d’abord le fichier', disabled: true }],
  });

  if (!allowed) {
    return (
      <div className="app"><div className="exp-deny"><span className="lk"><Icon name="lock" size="lg" /></span><h2 style={{ fontSize: 18, color: 'var(--text)' }}>Accès restreint</h2>
        <div style={{ maxWidth: 380, fontSize: 13.5 }}>L’export des données est réservé aux rôles de gestion (Master, Administrateur, Directeur, Coordinateur).</div>
        <div className="faint" style={{ fontSize: 12.5 }}>Rôle actuel : {gx().data.ROLES[user?.role || '']?.l || user?.role}</div></div></div>
    );
  }

  const onDu = (v: string) => { setDu(v); if (v && au && v > au) setAu(v); setMsg(null); };   // comme DatePicker : « Au » suit « Du »
  const onAu = (v: string) => { setAu(v); setMsg(null); };
  const nP = live.projects.length, nE = live.expenses.length;
  let status: React.ReactNode;
  if (busy) status = <><div className="exp-prog"><i style={{ width: `${STEP_W[step]}%` }} /></div><div className="exp-sum">{STEPS[step]}</div></>;
  else if (msg) status = <div className={`exp-msg ${msg.type === 'error' ? 'err' : 'info'}`}><Icon name="alert" size="sm" /><span>{msg.text}</span></div>;
  else if (data && !stale) {
    const n = data.projects.length, m = data.expenses.length;
    status = <div className="exp-msg ok"><Icon name="check" size="sm" /><div><b>Export généré avec succès.</b><div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{plural(n, 'projet')} · {plural(m, 'dépense')} fixe{m > 1 ? 's' : ''}.</div></div></div>;
  } else if (stale) status = <div className="exp-msg info"><Icon name="info" size="sm" /><span>{datesChanged ? 'Période modifiée : générez à nouveau le fichier.' : 'Données modifiées depuis la génération : générez à nouveau le fichier.'}</span></div>;
  else status = <div className="exp-sum">Aucun fichier généré pour l’instant. Choisissez la période puis cliquez sur « Générer le fichier Excel ».</div>;

  const rows = data ? rowsOf(data, sheet) : [];
  return (
    <div className="app">
      <div className="app-head exp-h"><div className="ah-t"><span className="ah-eye">Outils</span><h1>Export Excel</h1><span className="sub">Projets et dépenses fixes sur une période, au format .xlsx</span></div>
        <div className="ah-f"><button className="btn primary" disabled={busy} onClick={() => void generate()}><Icon name="download" size="sm" /><span>{busy ? 'Génération en cours…' : data && !stale ? 'Régénérer le fichier Excel' : 'Générer le fichier Excel'}</span></button></div></div>
      <div className="app-head2 exp-f">
        <div><span className="label">Du</span><input type="date" className="input" value={du} onChange={(e) => onDu(e.target.value)} /></div>
        <div><span className="label">Au</span><input type="date" className="input" value={au} min={du} onChange={(e) => onAu(e.target.value)} /></div>
        <div className="exp-f-sep" />
        <div className="exp-note">{bad ? <span className="exp-err"><Icon name="alert" size="sm" />{bad}</span>
          : <>Les <b>projets</b> sont filtrés sur leur date de début, les <b>dépenses</b> sur leur date. Le fichier contient 2 onglets : <em>Projets</em> et <em>Dépenses</em>.</>}</div>
      </div>
      <div className="exp scroll">
        <section className="exp-cards">
          <article className="exp-card"><h2><Icon name="export" size="sm" />Classeur</h2>
            <div className="exp-book"><span className="exp-doc"><b>XLSX</b></span><div style={{ minWidth: 0, display: 'grid', gap: 8 }}><div className="exp-fname">{exportFileName(du, au)}</div>
              <div className="exp-tabsum"><span>Projets <b>{COLS.Projets.length} col.</b></span><span>Dépenses <b>{COLS.Dépenses.length} col.</b></span></div></div></div>
            <div className="exp-sum">En-têtes à la charte, filtre automatique, montants sommables. Les tâches des projets ne sont pas exportées.</div></article>
          <article className="exp-card"><h2><Icon name="agenda" size="sm" />Sur la période</h2>
            <div className="exp-big"><div><b>{ready ? nP : '…'}</b><span>{nP > 1 ? 'projets' : 'projet'}</span></div><div><b>{expenses === undefined ? '…' : nE}</b><span>{nE > 1 ? 'dépenses fixes' : 'dépense fixe'}</span></div></div>
            <div className="exp-sum">{du && au ? `Du ${gx().fmt.dateY(du)} au ${gx().fmt.dateY(au)} · brouillons exclus` : 'Période ouverte · brouillons exclus'}</div></article>
          <article className="exp-card"><h2><Icon name="check" size="sm" />Résultat</h2><div>{status}</div></article>
        </section>
        <section className={`exp-prev ${stale ? 'stale' : ''}`} ref={prevRef}>
          {!data ? <div className="empty"><Icon name="grid" /><b style={{ color: 'var(--text)' }}>Aperçu du classeur</b>Les onglets Projets et Dépenses s’afficheront ici une fois le fichier généré.</div> : <>
            <div className="exp-fx"><span className="ref" ref={refEl} /><span className="fx">fx</span><span className="val ellipsis" ref={valEl} /></div>
            <div className="exp-grid scroll" tabIndex={0} ref={gridHost} onKeyDown={onGridKey}
              onClick={(e) => { const td = (e.target as HTMLElement).closest<HTMLElement>('td'); if (td) selectCell(+td.dataset.r!, +td.dataset.c!); }}>
              <Grid key={sheet} cols={COLS[sheet]} rows={rows} /></div>
            <div className="exp-tabs">{(Object.keys(COLS) as Sheet[]).map((s) => <button key={s} className={s === sheet ? 'on' : ''} onClick={() => switchSheet(s)}>{s}</button>)}
              <span className="faint">{plural(rows.length, 'ligne')} · {gen!.du ? gx().fmt.dateY(gen!.du) : 'début'} → {gen!.au ? gx().fmt.dateY(gen!.au) : 'fin'}</span></div></>}
        </section>
      </div>
    </div>
  );
}
// Aucun effet de bord sur les données : lecture seule (le seul appel réseau est la relecture des projets).
