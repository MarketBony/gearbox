import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { BrandType, BudgetLine, ServiceType } from '../../../types';
import { PLAQUES_STRUCTURE, ALPINE_SITES, NISSAN_SITES, allowedSitesFor, BUDGET_PROVISION_EDIT_ROLES, SITES_HORS_PLAQUE } from '../../../constants';
import { useAuth } from '../../../contexts/AuthContext';
import { useWorkspace } from '../../store/workspace';
import { useBudgets, useFixedExpenses, upsertBudget } from '../../store/collections';
import { gx, Icon, Seg, useEngineStore, useEngineEvent } from '../ui/kit';
import { MONTHS, prepareBudgetLines, computeBudgetStats, groupProvisions, getPlaqueForSite, type BudgetMatrixRow } from '../../../services/budgetStats';

// =====================================================================
// Rubrique « Budget » — transposition de maquettes/v2/js/apps/budget.js (même balisage, mêmes
// classes) sur les VRAIES données : lignes de budget et dépenses fixes (ui2/store/collections.ts),
// projets (ui2/store/workspace.ts). Parité : maquettes/ux/inventaires/budget.md.
//  - AUCUN montant calculé ici : tout sort de ./budgetStats.ts, extrait À L'IDENTIQUE de
//    pages/Budget.tsx (à déplacer dans services/ à l'intégration, cf. BESOINS.md) ;
//  - chef de site : lignes reçues du serveur SEULEMENT (aucun bucket recréé côté client),
//    périmètre borné à ses sites (défaut §11 de l'inventaire corrigé, comme dans la maquette) ;
//  - provisions : écriture au DÉPART du champ (plus un POST par frappe), totaux à jour à la frappe.
// =====================================================================

type Svc = 'VN' | 'VO' | 'PR' | 'APV';
type Tab = 'real' | 'prov';
type Pro = 'all' | 'pro' | 'standard';
interface Filters { sites: string[]; brands: string[]; services: string[]; pro: Pro; year: number; m0: number; m1: number }

const SVC: Svc[] = ['VN', 'VO', 'PR', 'APV'];                                  // ordre des colonnes / grilles de Budget.tsx
const SVC_CHIPS = ['VN', 'VO', 'APV', 'PR'];                                   // BUDGET_SERVICE_CHIPS
const BRAND_CHIPS = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize'];      // BUDGET_BRAND_CHIPS (pas de Holding)
const SVC_HEX: Record<string, string> = { VN: '#3a5fc8', VO: '#f75632', APV: '#8f12ab', PR: '#1aa9bd' };
const EDIT_PROV = BUDGET_PROVISION_EDIT_ROLES;                                 // constants.ts (miroir de routes/budget.ts)
const PRO_LABEL: Record<Pro, string> = { all: 'Tout', standard: 'Sans PRO+', pro: 'PRO+ uniquement' };
const Y = new Date().getFullYear(), YEARS = [Y - 2, Y - 1, Y];                  // l'original codait [2024, 2025, 2026] en dur
const ICO_COINS = '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7M3 12v5c0 1.7 2.7 3 6 3 1.3 0 2.5-.2 3.5-.6M15 10.5c3.3 0 6 1.3 6 3s-2.7 3-6 3-6-1.3-6-3"/>';

const SS = (k: string) => `gearbox_session_${k}`;
const ssGet = <T,>(k: string, d: T): T => { try { const v = sessionStorage.getItem(SS(k)); return v === null ? d : JSON.parse(v); } catch { return d; } };
const ssSet = (k: string, v: unknown) => { try { sessionStorage.setItem(SS(k), JSON.stringify(v)); } catch { /* navigation privée */ } };

const tone = (p: number) => (p > 100 ? 'var(--danger)' : p > 80 ? 'var(--warn)' : 'var(--ok)');
const periodLabel = (f: Filters) => (f.m0 === 0 && f.m1 === 11 ? `Annuel ${f.year}` : `Période ${MONTHS[f.m0]} – ${MONTHS[f.m1]} ${f.year}`);
const nAct = (f: Filters) => f.sites.length + f.brands.length + f.services.length + (f.year !== Y ? 1 : 0) + (f.m0 !== 0 || f.m1 !== 11 ? 1 : 0) + (f.pro !== 'all' ? 1 : 0);
const eur = (n: number) => gx().fmt.eur(n);
const brandHex = (b: string) => gx().data.brand(b)?.hex || '#8a8599';

// ---------------------------------------------------------------- champ numérique de la grille
/** Saisie libre tant que le champ a le focus (brouillon texte), valeur normalisée vers le parent à la frappe. */
function Cell({ value, disabled, label, m, onValue, onDone }: { value: number; disabled: boolean; label: string; m: number; onValue: (n: number) => void; onDone: () => void }) {
  const [raw, setRaw] = useState<string | null>(null);
  return (
    <input type="number" min="0" step="100" inputMode="numeric" value={raw ?? String(value)} data-m={m} disabled={disabled} aria-label={label}
      onFocus={(e) => { setRaw(String(value)); e.currentTarget.select(); }}
      onChange={(e) => { setRaw(e.target.value); onValue(Math.max(0, Math.round(+e.target.value || 0))); }}
      onBlur={() => { setRaw(null); onDone(); }} />
  );
}

const cloneEntries = (e: BudgetLine['entries']) => Object.fromEntries(SVC.map((s) => [s, [...(e[s] || new Array(12).fill(0))]])) as Record<Svc, number[]>;
const sameEntries = (a: Record<Svc, number[]>, b: BudgetLine['entries']) => SVC.every((s) => a[s].every((v, i) => v === (b[s] || [])[i]));

// ---------------------------------------------------------------- carte d'enveloppe (Provisions)
const PCard = React.memo(function PCard({ l, open, canProv, onToggle, onSave }: { l: BudgetLine; open: boolean; canProv: boolean; onToggle: (id: string) => void; onSave: (l: BudgetLine) => void }) {
  const [draft, setDraft] = useState(() => cloneEntries(l.entries));
  const focused = useRef(false), wrapRef = useRef<HTMLDivElement>(null), cardRef = useRef<HTMLElement>(null), annRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(open), prevOpen = useRef(open);
  // Mise à jour venue du serveur (autre poste, temps réel) : n'écrase pas une saisie en cours.
  useEffect(() => { if (!focused.current) setDraft(cloneEntries(l.entries)); }, [l.entries]);
  useLayoutEffect(() => {
    const w = wrapRef.current; if (!w || prevOpen.current === open) return; prevOpen.current = open;
    w.getAnimations().forEach((a) => a.cancel());
    if (open) { setShown(true); gx().animate(w, [{ height: '0px', opacity: 0.4 }, { height: w.scrollHeight + 'px', opacity: 1 }], { spring: 'snappy' }); }
    else { const a = gx().animate(w, [{ height: w.offsetHeight + 'px' }, { height: '0px' }], { spring: 'snappy', fill: 'forwards' }); a.onfinish = () => setShown(false); }   // l'animation (fill) est annulée à la prochaine ouverture
  }, [open]);
  const a = SVC.reduce((s, sv) => s + draft[sv].reduce((x, y) => x + y, 0), 0);
  const g = getPlaqueForSite(l.site);
  const flash = () => { const el = annRef.current; if (!el) return; el.classList.remove('bud-flash'); void el.offsetWidth; el.classList.add('bud-flash'); };
  const setVal = (sv: Svc, m: number, n: number) => { if (!canProv) return; setDraft((d) => { if (d[sv][m] === n) return d; const x = { ...d, [sv]: d[sv].map((v, i) => (i === m ? n : v)) }; return x; }); flash(); };
  const commit = () => { if (!canProv || sameEntries(draft, l.entries)) return; onSave({ ...l, entries: { ...l.entries, ...draft } }); };
  const onKey = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    const inp = e.target as HTMLInputElement; if (e.key !== 'Enter' || !inp.matches('input[data-m]')) return; e.preventDefault();
    const card = cardRef.current!, m = +inp.dataset.m!, rows = [...card.querySelectorAll<HTMLElement>('tbody tr')], ri = rows.indexOf(inp.closest('tr')!) + (e.shiftKey ? -1 : 1);
    (rows[ri]?.querySelector<HTMLInputElement>(`input[data-m="${m}"]`) || card.querySelector<HTMLInputElement>(`tbody tr:first-child input[data-m="${Math.min(11, m + 1)}"]`))?.focus();
  };
  return (
    <article ref={cardRef} className={`card bud-pcard ${open ? 'open' : ''}`} data-pl={l.site}
      onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; }}>
      <button className="bud-phead" aria-expanded={open} onClick={() => onToggle(l.site)}>
        <span className="chev"><Icon name="chevron" size="sm" /></span><b className="nm">{l.site}</b><span className="bud-pbadge plqb">{g}</span>
        <span className="bud-dots dots">{(l.brands || []).map((b) => <i key={b} style={{ '--c': brandHex(b) } as React.CSSProperties} data-tip={b} />)}</span><span className="grow" />
        <span className="v avg"><span className="label">Mensuel moy.</span><div className="m">{eur(a / 12)}</div></span>
        <span className="v an"><span className="label">Annuel prévu</span><div className="a" ref={annRef}>{eur(a)}</div></span></button>
      <div className="bud-gwrap" ref={wrapRef}>{open || shown ? (
        <div className="bud-grid"><table><thead><tr><th>Service</th>{MONTHS.map((m) => <th key={m}>{m}</th>)}<th>Total annuel</th></tr></thead>
          <tbody onKeyDown={onKey}>{SVC.map((s) => (
            <tr key={s} data-sv={s}><td><span className="bud-svc" style={{ '--c': SVC_HEX[s] } as React.CSSProperties}>{s}</span></td>
              {draft[s].map((v, m) => <td key={m}><Cell value={v} m={m} disabled={!canProv} label={`${s} ${MONTHS[m]} — ${l.site}`} onValue={(n) => setVal(s, m, n)} onDone={commit} /></td>)}
              <td className="tot">{eur(draft[s].reduce((x, y) => x + y, 0))}</td></tr>))}
          </tbody></table></div>) : null}</div>
    </article>
  );
}, (a, b) => a.l === b.l && a.open === b.open && a.canProv === b.canProv && a.onToggle === b.onToggle && a.onSave === b.onSave);

// ---------------------------------------------------------------- tableau du Suivi
const MatrixRow = React.memo(function MatrixRow({ r, services }: { r: BudgetMatrixRow; services: string[] }) {
  const F = gx().fmt;
  const cell = (s: Svc) => {
    const fc = r.forecast[s], ac = r.actual[s], p = fc > 0 ? (ac / fc) * 100 : 0, dim = services.length > 0 && !services.includes(s);
    return <td key={s} className={dim ? 'dim' : ''}><b style={{ color: fc > 0 ? tone(p) : 'var(--text-3)' }}>{ac > 0 ? F.n(Math.round(ac)) : '-'}</b>{fc > 0 ? <span className="pv">prévu {F.n(Math.round(fc))}</span> : null}</td>;
  };
  return (
    <tr><td><b>{r.site}</b><span className="pv plq">{r.plaque}</span></td>{SVC.map(cell)}
      <td><b>{eur(r.totalActual)}</b></td><td><b style={{ color: tone(r.consumption) }}>{Math.round(r.consumption)} %</b></td></tr>
  );
});

// ---------------------------------------------------------------- rubrique
export default function BudgetApp({ win, inst }: AppProps) {
  const { user } = useAuth();
  const role = user?.role || '';
  const canProv = EDIT_PROV.includes(role);
  // Périmètre imposé (chef de site) ou null. Sert à NE PAS recréer de buckets et à borner le périmètre.
  const scoped = useMemo(() => allowedSitesFor(user), [user]);
  const fromCtx = useCallback((): string[] => { const p = gx().ctx.perimetre; return scoped || !p || p === 'Tout le réseau' ? [] : [p]; }, [scoped]);
  const DEF = (): Filters => ({ sites: [], brands: [], services: [], pro: 'all', year: Y, m0: 0, m1: 11 });

  const rawBudgets = useBudgets();
  const expenses = useFixedExpenses();
  const projects = useWorkspace((s) => s.projects);
  const [tab, setTabState] = useEngineStore<Tab>('bud.tab', 'real');
  const [expanded, setExpanded] = useEngineStore<string[]>('bud.expanded', []);
  const [f, setFState] = useState<Filters>(() => ssGet<Filters | null>('ui2_budget_filters', null) || { ...DEF(), sites: fromCtx() });
  const [fOpen, setFOpen] = useState(false);
  const [saving, setSaving] = useState(0);
  const [, setTick] = useState(0);

  // --- périmètre effectif et disponibilité des marques (BudgetBrandPicker)
  const effSites = useCallback((sites: string[]) => (scoped ? sites.filter((s) => scoped.includes(s)) : sites), [scoped]);
  const availSites = (sites: string[]) => { const e = effSites(sites); return scoped && !e.length ? scoped : e; };
  const brandAvail = (b: string, sites: string[]) => {
    const S = availSites(sites);
    if (b === 'Alpine') return !S.length || S.some((s) => (ALPINE_SITES as string[]).includes(s));
    if (b === 'Nissan') return !S.length || S.some((s) => (NISSAN_SITES as string[]).includes(s)) || S.includes('Nissan');
    return true;
  };
  // Une marque devenue indisponible est retirée du filtre (l'original la gardait active, grisée).
  const setF = (change: (x: Filters) => Filters) => setFState((x) => { const n = change(x); const next = { ...n, brands: n.brands.filter((b) => brandAvail(b, n.sites)) }; ssSet('ui2_budget_filters', next); return next; });
  const reset = () => setF(() => DEF());

  useEngineEvent('ctx', () => { setTick((n) => n + 1); setF((x) => ({ ...x, sites: fromCtx() })); });

  // --- données : lignes telles que la page les affiche (fusion en mémoire, jamais pour un rôle cloisonné)
  const lines = useMemo(() => prepareBudgetLines(rawBudgets || [], scoped).lines, [rawBudgets, scoped]);
  const fd = useDeferredValue(f);
  const scope = useMemo(() => effSites(fd.sites), [fd.sites, effSites]);
  const stats = useMemo(() => computeBudgetStats({
    budgets: lines, projects, fixedExpenses: expenses || [], filterSites: scope,
    filterBrands: fd.brands as BrandType[], filterServices: fd.services as ServiceType[], filterYear: fd.year,
    filterMonthStart: fd.m0, filterMonthEnd: fd.m1, filterProPlus: fd.pro,
  }), [lines, projects, expenses, scope, fd]);
  const prov = useMemo(() => groupProvisions(lines, scope), [lines, scope]);
  // Graphique du moteur (HTML) : régénéré seulement quand les chiffres changent (sinon les barres se réanimeraient à chaque rendu).
  const chartHtml = useMemo(() => gx().chart.bars({ labels: stats.chartData.map((c) => c.name), series: [{ name: 'Réalisé', values: stats.chartData.map((c) => c.Reel), color: '#f75632' }], line: { name: 'Budget prévu', values: stats.chartData.map((c) => c.Prevu), color: '#6d86d6' }, height: 260 }), [stats]);

  // --- onglets
  const setTab = (t: Tab) => { setTabState(t); win.setTitle('Budget', t === 'prov' ? 'Provisions' : 'Suivi réalisé'); };
  useEffect(() => { win.setTitle('Budget', tab === 'prov' ? 'Provisions' : 'Suivi réalisé'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [tab]);

  // --- provisions : dépliage, sauvegarde
  const toggle = useCallback((id: string) => setExpanded(expanded.includes(id) ? expanded.filter((x) => x !== id) : [...expanded, id]), [expanded, setExpanded]);
  const save = useCallback((l: BudgetLine) => {
    if (!canProv) return;
    setSaving((n) => n + 1);
    upsertBudget(l).catch(() => { /* message déjà affiché, relecture faite par la source */ })
      .finally(() => setTimeout(() => setSaving((n) => n - 1), 800));
  }, [canProv]);

  // --- filtres : périmètre
  const pickSites = (el: HTMLElement) => {
    const groups = scoped
      ? [{ items: scoped.map((s) => ({ v: s, l: s })) }]
      : [...Object.entries(PLAQUES_STRUCTURE).map(([pl, ss]) => ({ label: pl, collapsible: true, toggleAll: true, items: (ss as string[]).map((s) => ({ v: s, l: s, hint: [(ALPINE_SITES as string[]).includes(s) && 'Alpine', (NISSAN_SITES as string[]).includes(s) && 'Nissan'].filter(Boolean).join(' · ') })) })),
        { label: 'Hors plaque', collapsible: true, items: (SITES_HORS_PLAQUE as string[]).map((s) => ({ v: s, l: s, hint: 'Nissan' })) },
        { label: 'Entités spécifiques', items: [{ v: 'Nissan', l: 'Nissan', hint: 'enveloppe globale' }] }];
    gx().ui.pick(el, groups, { multi: true, search: true, selected: effSites(f.sites), allLabel: scoped ? 'Tous mes sites' : 'Tout le réseau', title: 'Périmètre', width: 310, onChange: (v: string[]) => setF((x) => ({ ...x, sites: v })) });
  };
  const locked = !!scoped && scoped.length <= 1;
  const shownSites = effSites(f.sites);
  const periBtn = locked
    ? <button className="picker-btn active bud-peri" disabled data-tip="Périmètre imposé (chef de site)"><Icon name="lock" size="sm" /><span className="v">{scoped![0] || 'Aucun site'}</span></button>
    : <button className={`picker-btn bud-peri ${shownSites.length ? 'active' : ''}`} onClick={(e) => {
        const rm = (e.target as HTMLElement).closest<HTMLElement>('[data-rm]');
        if (rm) { e.stopPropagation(); setF((x) => ({ ...x, sites: x.sites.filter((s) => s !== rm.dataset.rm) })); return; }
        pickSites(e.currentTarget);
      }}>
        {shownSites.length ? null : <Icon name="pin" size="sm" />}
        {shownSites.length
          ? <>{shownSites.slice(0, 2).map((x) => <span key={x} className="bud-tag">{x}<i data-rm={x} role="button" aria-label={`Retirer ${x}`}>×</i></span>)}{shownSites.length > 2 ? <span className="faint">+{shownSites.length - 2}</span> : null}</>
          : <span className="v">{scoped ? gx().ui.summary(scoped, { all: 'Tous mes sites' }) : 'Tout le réseau'}</span>}
        <Icon name="chevdown" size="sm" /></button>;
  const chips = (values: string[], selected: string[], all: string, attr: 'data-brands' | 'data-svcs', onChange: (v: string[]) => void, avail?: (v: string) => boolean) => (
    <div className="chips" {...{ [attr]: '' }}>
      <button className="chip" data-v="" aria-pressed={!selected.length} onClick={() => onChange([])}>{all}</button>
      {values.map((v) => { const ok = !avail || avail(v); return (
        <button key={v} className="chip" data-v={v} aria-pressed={selected.includes(v)} disabled={!ok} data-tip={ok ? undefined : `Aucun site ${v} dans le périmètre`}
          onClick={() => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])}>{v}</button>); })}
    </div>
  );
  const n = nAct(f);
  const filters = (
    <div className={`app-head2 bud-f ${fOpen ? 'open' : ''}`}>
      <div><span className="label">Périmètre</span>{periBtn}</div><span className="bud-sep" />
      {tab === 'prov' ? <>
        <div className="bud-dimgrp" aria-disabled="true"><span className="label">Marque · Service · PRO+ · Année · Période</span><div className="row">
          <span className="chip">{f.brands.length ? f.brands.join(', ') : 'Toutes'}</span><span className="chip">{f.services.length ? f.services.join(', ') : 'Tous'}</span>
          <span className="chip">{PRO_LABEL[f.pro]}</span><span className="chip">{f.year}</span><span className="chip">{MONTHS[f.m0]} → {MONTHS[f.m1]}</span></div></div>
        <span className="bud-fnote">Sur les provisions, seul le périmètre s’applique : les enveloppes n’ont pas d’année et le total groupe n’est pas filtré.</span>
      </> : <>
        <div><span className="label">Marque</span>{chips(BRAND_CHIPS, f.brands, 'Toutes', 'data-brands', (v) => setF((x) => ({ ...x, brands: v })), (b) => brandAvail(b, f.sites))}</div><span className="bud-sep" />
        <div><span className="label">Service</span>{chips(SVC_CHIPS, f.services, 'Tous', 'data-svcs', (v) => setF((x) => ({ ...x, services: v })))}</div><span className="bud-sep" />
        <div><span className="label">PRO+ (B2B)</span><select className="select bud-sel-pro" aria-label="PRO+ (B2B)" value={f.pro} onChange={(e) => { const v = e.target.value as Pro; setF((x) => ({ ...x, pro: v })); }}>{(['all', 'standard', 'pro'] as Pro[]).map((v) => <option key={v} value={v}>{PRO_LABEL[v]}</option>)}</select></div>
        <div><span className="label">Année</span><select className="select bud-sel-y" aria-label="Année" value={String(f.year)} onChange={(e) => { const v = +e.target.value; setF((x) => ({ ...x, year: v })); }}>{(YEARS.includes(f.year) ? YEARS : [f.year, ...YEARS]).map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
        <div><span className="label">Période</span><div className="bud-per">
          <select className="select bud-sel-m" aria-label="Mois de début" value={String(f.m0)} onChange={(e) => { const v = +e.target.value; setF((x) => ({ ...x, m0: v, m1: v > x.m1 ? v : x.m1 })); }}>{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select><span>→</span>
          <select className="select bud-sel-m" aria-label="Mois de fin" value={String(f.m1)} onChange={(e) => { const v = +e.target.value; setF((x) => ({ ...x, m1: v, m0: v < x.m0 ? v : x.m0 })); }}>{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select></div></div>
        {n ? <div className="bud-fr"><b>{n} filtre{n > 1 ? 's' : ''} actif{n > 1 ? 's' : ''}</b><button onClick={reset}>Réinitialiser</button></div> : null}
      </>}
    </div>
  );

  // --- Suivi réalisé
  const real = () => {
    const pl = periodLabel(fd), plan = stats.totalForecast, act = stats.totalActual, rem = plan - act, pc = plan > 0 ? (act / plan) * 100 : 0, over = pc > 100;
    const svcTxt = fd.services.length ? fd.services.join(', ') : 'tous services', brTxt = fd.brands.length ? fd.brands.join(', ') : 'toutes marques';
    const kpi = (i: number, label: string, value: React.ReactNode, sub: string, vStyle: React.CSSProperties = {}, extra: React.ReactNode = null, cls = '') => (
      <article className={`card bud-kpi ${cls} enter`} style={{ '--i': i } as React.CSSProperties}><span className="label">{label}</span><div className="bud-kv num" style={vStyle}>{value}</div>{extra}{sub ? <span className="sub">{sub}</span> : null}</article>);
    return (
      <div className="bud-real">
        <section className="bud-kpis">
          {kpi(0, `Budget prévu (${pl})`, eur(plan), `Enveloppes du périmètre · ${svcTxt} · ${brTxt}`)}
          {kpi(1, `Réalisé (${pl})`, eur(act), 'Projets (hors brouillons) + dépenses fixes', { color: 'var(--bony-orange)' }, <span className="deco"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" dangerouslySetInnerHTML={{ __html: ICO_COINS }} /></span>)}
          {kpi(2, 'Reste à engager', eur(rem), rem < 0 ? 'Dépassement sur la période' : 'Prévu − réalisé sur la période', { color: rem < 0 ? 'var(--danger)' : 'var(--ok)' })}
          {kpi(3, 'Consommation', <>{pc.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %{over ? <Icon name="alert" /> : null}</>, over ? `Dépassé de ${eur(act - plan)}` : '', over ? { color: 'var(--danger)' } : {},
            <div className={`bud-cbar ${over ? 'over' : ''}`}><i style={{ width: `${Math.min(100, pc)}%` }} /></div>, over ? 'alert' : '')}
        </section>
        <section className="bud-split">
          <article className="card bud-ccard enter" style={{ '--i': 4 } as React.CSSProperties}><div className="hd"><h2 className="bud-h2">Évolution mensuelle</h2><div className="bud-leg"><span><i />Réalisé</span><span><i className="ln" />Budget prévu</span></div></div>
            <div className="bud-chart" dangerouslySetInnerHTML={{ __html: chartHtml }} /></article>
          <article className="card bud-tcard enter" style={{ '--i': 5 } as React.CSSProperties}><div className="hd"><h2 className="bud-h2">Répartition &amp; performance par site</h2>
              <p>Données filtrées : {pl}. {fd.services.length ? `Services : ${fd.services.join(', ')}.` : 'Tous services.'}{scoped ? ` Périmètre imposé : ${scoped.join(', ') || 'aucun site'}.` : ''}</p></div>
            <div className="bud-tscroll" tabIndex={0} aria-label="Tableau par site"><table className="bud-t"><thead><tr><th>Site / plaque</th>{SVC.map((s) => <th key={s} className={fd.services.length && !fd.services.includes(s) ? 'dim' : ''}>{s}</th>)}<th>Réalisé période</th><th>%</th></tr></thead>
              <tbody>{stats.matrix.length ? stats.matrix.map((r) => <MatrixRow key={r.site} r={r} services={fd.services} />)
                : <tr><td colSpan={7} style={{ position: 'static' }}><div className="empty bud-empty"><Icon name="budget" />{rawBudgets === undefined ? 'Chargement des données budgétaires…' : 'Aucune ligne de budget dans ce périmètre'}</div></td></tr>}</tbody></table></div></article>
        </section>
      </div>
    );
  };

  // --- Provisions (seul le périmètre filtre)
  const provisions = () => {
    if (rawBudgets === undefined) return <div className="bud-prov"><div className="empty">Chargement des données budgétaires…</div></div>;
    return (
      <div className="bud-prov">
        <section className="card bud-hero enter"><div><span className="label">Budget prévisionnel groupe (annuel)</span><div className="kv">{eur(prov.totalAnnualGroup)}</div></div>
          <span className="grow" />
          <span className="bud-pill"><Icon name="budget" size="sm" />Calculé sur {lines.length} site{lines.length > 1 ? 's' : ''}</span>
          {canProv ? null : <span className="bud-pill ro"><Icon name="lock" size="sm" />Lecture seule</span>}</section>
        {prov.groups.length ? prov.groups.map(([g, ls], gi) => (
          <React.Fragment key={g}><div className="bud-plq enter" style={{ '--i': gi + 1 } as React.CSSProperties}>{g}</div>
            {ls.map((l) => <PCard key={l.site} l={l} open={expanded.includes(l.site)} canProv={canProv} onToggle={toggle} onSave={save} />)}</React.Fragment>
        )) : <div className="empty"><Icon name="budget" />Aucune ligne de budget dans ce périmètre</div>}
      </div>
    );
  };

  // --- barre du haut et commandes
  inst.command = (c: string) => { if (c === 'prov' && tab !== 'prov') setTab('prov'); if (c === 'real' && tab !== 'real') setTab('real'); };
  inst.menus = () => ({
    'Fichier': [{ label: 'Exporter vers Excel…', icon: 'export', disabled: !gx().shell?.canOpen?.('export'), action: () => gx().wm.open('export') },
      { label: 'Nouvelle dépense…', icon: 'plus', disabled: !gx().shell?.canOpen?.('fixed') || gx().ctx.readOnly, action: () => { const w = gx().wm.open('fixed'); setTimeout(() => (w || gx().wm.active())?.inst?.command?.('expense'), 450); } }],
    'Présentation': [{ label: 'Suivi réalisé', checked: tab === 'real', action: () => tab !== 'real' && setTab('real') }, { label: 'Provisions', checked: tab === 'prov', action: () => tab !== 'prov' && setTab('prov') }, '-',
      { label: 'Déplier toutes les enveloppes', icon: 'chevdown', disabled: tab !== 'prov', action: () => setExpanded([...new Set([...expanded, ...prov.displayBudgets.map((l) => l.site)])]) },
      { label: 'Replier toutes les enveloppes', icon: 'chevup', disabled: tab !== 'prov', action: () => setExpanded([]) }, '-',
      { label: 'Réinitialiser les filtres', icon: 'refresh', disabled: !n, action: reset }],
  });

  return (
    <div className="app">
      <div className="app-head bud-h"><div className="ah-t"><span className="ah-eye">Outils</span><h1>Budget &amp; prévisionnel</h1><span className="sub">Pilotage financier par concession</span></div>
        <div className="ah-f"><span className={`bud-saving ${saving > 0 ? 'on' : ''}`}><Icon name="cloud" size="sm" />Sauvegarde auto…</span>
          <button className={`btn sm bud-ftog ${fOpen ? 'primary' : ''}`} onClick={() => setFOpen(!fOpen)}><Icon name="filter" size="sm" />Filtres{n ? <> <span className="count">{n}</span></> : null}</button>
          <Seg value={tab} options={[['real', 'Suivi réalisé'], ['prov', 'Provisions']]} onChange={(t) => setTab(t)} /></div></div>
      {filters}
      <div ref={bodyRef} className={`app-body bud-body ${tab === 'prov' ? 't-prov' : ''}`}>{tab === 'real' ? real() : provisions()}</div>
    </div>
  );
}

