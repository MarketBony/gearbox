import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { BrandType, FixedExpense, ServiceType } from '../../../types';
import { PLAQUES_STRUCTURE, SERVICES, BRANDS, ALPINE_SITES, NISSAN_SITES, DISTRIBUTION_GROUPE_BONY, DISTRIBUTION_GROUPE_BONY_RN, HOLDING_BRAND, RDM_BRANDS, FIXED_EXPENSE_EDIT_ROLES, isSiteManager } from '../../../constants';
import { useAuth } from '../../../contexts/AuthContext';
import { fixedExpenses as fixedRes, createFixedExpense, updateFixedExpense, deleteFixedExpense } from '../../store/collections';
import { logActivity as logFeed } from '../../store/workspace';
import { gx, hud, Icon, Seg, PickerBtn, useSheets, useEngineEvent } from '../ui/kit';

// =====================================================================
// Rubrique « Dépenses » — transposition de maquettes/v2/js/apps/fixed.js (même balisage, mêmes
// classes) sur les VRAIES dépenses fixes (ui2/store/collections.ts). Parité :
// maquettes/ux/inventaires/depenses.md, règles et messages de pages/FixedExpenses.tsx.
//  - la rubrique ne calcule AUCUN agrégat budgétaire : elle saisit ce que Budget et Dashboard
//    routent (splitShareToBuckets). « Total période » = somme brute des montants filtrés ;
//  - écriture : mêmes routes et même charge utile que la page (objet complet, brand = brands[0]) ;
//    les champs de routage (sites, répartition) ne sont réécrits QUE si l'utilisateur change
//    la sélection de sites — une dépense ancienne n'est jamais « complétée » en douce ;
//  - chef de site : rubrique refusée (SITE_MANAGER_SECTIONS) — aucun appel réseau ici.
// =====================================================================

type Sort = { k: 'date' | 'site' | 'service' | 'comment' | 'amount'; dir: 'asc' | 'desc' };
interface Filters { q: string; site: string; service: string; from: string; to: string }
const F0: Filters = { q: '', site: 'All', service: 'All', from: '', to: '' };

// Écritures : FIXED_EXPENSE_EDIT_ROLES (constants.ts, miroir de backend/src/routes/fixedExpenses.ts).
const EDIT_ROLES = FIXED_EXPENSE_EDIT_ROLES;
const BRAND_BG: Record<string, [string, string]> = { Renault: ['#ffcc33', '#1a1400'], Dacia: ['#6a7551', '#fff'], Alpine: ['#0055a4', '#fff'], Nissan: ['#c3002f', '#fff'], Mobilize: ['#7b3fe4', '#fff'], Holding: ['#475569', '#fff'] };
const SVC_HEX: Record<string, string> = { VN: '#3a5fc8', VO: '#f75632', APV: '#8f12ab', PR: '#1aa9bd', 'Tous Services': '#6b6880' };
const DIST: Record<string, Record<string, number>> = { 'GROUPE BONY': DISTRIBUTION_GROUPE_BONY, 'GROUPE BONY (R/N)': DISTRIBUTION_GROUPE_BONY_RN };
const GROUPS = Object.keys(DIST);
/** Libellés du sélecteur de sites du moteur (variante `project`) ⇄ `FixedExpense.site`. */
const GROUP_LABEL: Record<string, string> = { 'GROUPE BONY': 'GROUPE BONY (GLOBAL)', 'GROUPE BONY (R/N)': 'GROUPE BONY (R/N)' };
const LABEL_GROUP: Record<string, string> = { 'GROUPE BONY (GLOBAL)': 'GROUPE BONY', 'GROUPE BONY (R/N)': 'GROUPE BONY (R/N)' };

const SS = (k: string) => `gearbox_session_${k}`;
const ssGet = <T,>(k: string, d: T): T => { try { const v = sessionStorage.getItem(SS(k)); return v === null ? d : JSON.parse(v); } catch { return d; } };
const ssSet = (k: string, v: unknown) => { try { sessionStorage.setItem(SS(k), JSON.stringify(v)); } catch { /* navigation privée */ } };

const dateFr = (d: string) => new Date(d).toLocaleDateString('fr-FR');
const amountFr = (n: unknown) => (+(n as number) || 0).toLocaleString('fr-FR') + ' €';
const brandsOf = (e: Partial<FixedExpense>) => (e.brands || (e.brand ? [e.brand] : [])) as string[];
const per = () => gx().ctx.site || gx().ctx.perimetre || 'Tout le réseau';
/** Périmètre GLOBAL de la barre de menus (propre à l'interface v2, comme To-do). */
const inPer = (e: FixedExpense) => { const p = per(); if (p === 'Tout le réseau') return true; if (p === 'Nissan') return brandsOf(e).includes('Nissan'); return (e.sites || []).includes(p) || e.site === p; };
/** `getAvailableBrands` de la page. */
const brandAvail = (sites: string[], b: string) => (b === 'Alpine' ? sites.some((s) => (ALPINE_SITES as string[]).includes(s)) : b === 'Nissan' ? sites.some((s) => (NISSAN_SITES as string[]).includes(s)) : true);

/** Filtres et tri : règles EXACTES de FixedExpenses.tsx (l.219-250), dont le filtre Site à égalité stricte. */
function listOf(all: FixedExpense[], f: Filters, sort: Sort) {
  const q = f.q.toLowerCase();
  return all.filter((e) => inPer(e)
    && ((e.comment || '').toLowerCase().includes(q) || (e.site || '').toLowerCase().includes(q) || (e.service || '').toLowerCase().includes(q))
    && (f.site === 'All' || e.site === f.site) && (f.service === 'All' || e.service === f.service)
    && (!f.from || new Date(e.date) >= new Date(f.from)) && (!f.to || new Date(e.date) <= new Date(f.to)))
    .sort((a, b) => {
      let x: any = (a as any)[sort.k], y: any = (b as any)[sort.k];
      if (typeof x === 'string' && typeof y === 'string') { x = x.toLowerCase(); y = y.toLowerCase(); }
      if (x < y) return sort.dir === 'asc' ? -1 : 1;
      if (x > y) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
}

// Journal d'activité : porte commune (ui2/store/workspace.ts), même entrée que la page.
const logActivity = (_user: unknown, action: string, name: string) => logFeed('fixed-expense', action, name);
const nameOf = (e: Partial<FixedExpense>) => e.comment || e.site || 'Dépense fixe';

// ---------------------------------------------------------------- lignes
const Acts = ({ style }: { style?: React.CSSProperties }) => (
  <span className="fix-act" style={style}><button className="icon-btn sm" data-act="edit" data-tip="Modifier" aria-label="Modifier"><Icon name="edit" size="sm" /></button><button className="icon-btn sm del" data-act="del" data-tip="Supprimer" aria-label="Supprimer"><Icon name="trash" size="sm" /></button></span>
);
const svcBadge = (s: string) => <span className="fix-b svc" style={{ '--c': SVC_HEX[s] || '#6b6880' } as React.CSSProperties}>{s}</span>;

const Row = React.memo(function Row({ e, flash, cur, canEdit }: { e: FixedExpense; flash: boolean; cur: boolean; canEdit: boolean }) {
  return (
    <tr data-id={e.id} className={`${flash ? 'fix-flash' : ''} ${cur ? 'cur' : ''}`}>
      <td><span className="fix-dt">{dateFr(e.date)}</span>{e.isAnnual ? <span className="fix-b an" style={{ marginLeft: 8 }}>Annuelle</span> : null}</td>
      <td><span className="fix-b site" data-tip={e.site}>{e.site}</span></td>
      <td>{svcBadge(e.service)}</td>
      <td>{e.proPlus ? <span className="fix-b pro">PRO+</span> : null}{e.comment || ''}</td>
      <td className="r"><span className="fix-amt">{amountFr(e.amount)}</span></td>
      <td className="r">{canEdit ? <Acts /> : null}</td>
    </tr>
  );
});
const MCard = React.memo(function MCard({ e, flash, canEdit }: { e: FixedExpense; flash: boolean; canEdit: boolean }) {
  return (
    <article className={`card fix-mc ${flash ? 'fix-flash' : ''}`} data-id={e.id}><div className="top"><span className="fix-dt">{dateFr(e.date)}</span>{e.isAnnual ? <span className="fix-b an">Annuelle</span> : null}<span className="grow" /><span className="fix-amt">{amountFr(e.amount)}</span></div>
      <div className="meta"><span>{e.site}</span><span>·</span><span>{e.service}</span>{e.proPlus ? <><span className="grow" /><span className="fix-b pro" style={{ margin: 0 }}>PRO+</span></> : null}</div>
      {e.comment ? <div className="cm">{e.comment}</div> : null}{canEdit ? <div className="acts"><Acts style={{ opacity: 1 }} /></div> : null}</article>
  );
});

// ---------------------------------------------------------------- rubrique
export default function FixedApp({ win, inst }: AppProps) {
  const { user } = useAuth();
  const role = user?.role || '';
  const allowed = !isSiteManager(role);
  const canEdit = EDIT_ROLES.includes(role);
  const expenses = fixedRes.useWhen(allowed);
  const [f, setFState] = useState<Filters>(() => ({ ...F0, ...ssGet<Partial<Filters>>('ui2_fixed_filters', {}) }));
  const setF = (n: Filters) => { setFState(n); ssSet('ui2_fixed_filters', n); };
  const [sort, setSortState] = useState<Sort>(() => ssGet<Sort>('ui2_fixed_sort', { k: 'date', dir: 'desc' }));
  const setSort = (k: Sort['k']) => { const n: Sort = sort.k === k ? { k, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { k, dir: 'desc' }; setSortState(n); ssSet('ui2_fixed_sort', n); };
  const [form, setForm] = useState<{ src: FixedExpense | null; seq: number; closing?: boolean } | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const { open: openSheet, portals } = useSheets(win);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { win.setTitle('Dépenses'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEngineEvent('ctx', () => { setTick((n) => n + 1); if (!EDIT_ROLES.includes(gx().ctx.role)) setForm(null); });
  useEffect(() => { if (!flashId) return; const t = setTimeout(() => setFlashId(null), 1500); return () => clearTimeout(t); }, [flashId, expenses]);
  useLayoutEffect(() => { if (flashId) bodyRef.current?.querySelector(`tr[data-id="${flashId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [flashId, expenses]);

  const fd = useDeferredValue(f);
  const L = useMemo(() => listOf(expenses || [], fd, sort), [expenses, fd, sort]);
  const total = useMemo(() => L.reduce((s, e) => s + (e.amount || 0), 0), [L]);
  const nFilters = (f.q ? 1 : 0) + (f.site !== 'All' ? 1 : 0) + (f.service !== 'All' ? 1 : 0) + (f.from ? 1 : 0) + (f.to ? 1 : 0);
  const byId = useCallback((id: string) => (expenses || []).find((x) => x.id === id), [expenses]);

  // --- formulaire (panneau latéral)
  const openForm = (src?: FixedExpense | null) => {
    if (!canEdit) { hud('Lecture seule : création et modification réservées aux éditeurs'); return; }
    setForm((x) => ({ src: src || null, seq: (x?.seq || 0) + 1 }));
  };
  const closeForm = () => { setForm((x) => (x ? { ...x, closing: true } : x)); setTimeout(() => setForm((x) => (x?.closing ? null : x)), 180); };
  const onSaved = (id: string, edit: boolean) => { setForm(null); setFlashId(id); hud(edit ? 'Dépense modifiée' : 'Dépense enregistrée'); };

  // --- suppression (volet de confirmation, comme la maquette ; plus de confirm() natif)
  const askDelete = (e: FixedExpense) => {
    if (!canEdit) return;
    openSheet((close) => (
      <><h3>Supprimer la dépense</h3><p className="muted" style={{ margin: '8px 0 0' }}>Êtes-vous sûr de vouloir supprimer cette dépense ?</p><p style={{ margin: '10px 0 0', fontWeight: 600 }}>{nameOf(e)} · {amountFr(e.amount)}</p>
        <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" style={{ background: 'var(--danger)' }} onClick={() => {
          close(); if (form?.src?.id === e.id) closeForm();
          deleteFixedExpense(e.id).then(() => { logActivity(user, 'a supprimé une dépense fixe', nameOf(e)); hud('Dépense supprimée'); }).catch(() => { /* message déjà affiché, liste relue */ });
        }}>Supprimer</button></div></>), { width: 420 });
  };

  // --- délégation sur la liste (tableau + cartes)
  const onListClick = (ev: React.MouseEvent) => {
    const t = ev.target as HTMLElement, act = t.closest<HTMLElement>('[data-act]'), el = t.closest<HTMLElement>('[data-id]'); if (!act || !el) return;
    const e = byId(el.dataset.id!); if (!e) return;
    if (act.dataset.act === 'edit') openForm(e); else askDelete(e);
  };
  const onListDbl = (ev: React.MouseEvent) => { const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-id]'); const e = el && byId(el.dataset.id!); if (e && canEdit) openForm(e); };
  const onListMenu = (ev: React.MouseEvent) => {
    if (!canEdit) return; const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-id]'); const e = el && byId(el.dataset.id!); if (!e) return; ev.preventDefault();
    gx().menu.open([{ header: e.comment || 'Dépense fixe' }, { label: 'Modifier…', icon: 'edit', action: () => openForm(e) }, '-', { label: 'Supprimer…', icon: 'trash', action: () => askDelete(e) }], { x: ev.clientX, y: ev.clientY });
  };

  // --- filtres
  const pickSite = (el: HTMLElement) => gx().ui.pick(el, [{ items: [{ v: 'All', l: 'Tous sites' }, { v: 'GROUPE BONY', l: 'GROUPE BONY' }] },
    ...Object.entries(PLAQUES_STRUCTURE).map(([pl, ss]) => ({ label: pl, collapsible: true, items: (ss as string[]).map((s) => ({ v: s, l: s })) }))],
  { multi: false, search: true, selected: [f.site], title: 'Site', width: 280, onChange: ([v]: string[]) => setF({ ...f, site: v || 'All' }) });
  const pickSvc = (el: HTMLElement) => gx().ui.pick(el, [{ items: [{ v: 'All', l: 'Tous services' }, ...SERVICES.map((s) => ({ v: s, l: s, color: SVC_HEX[s] }))] }],
    { multi: false, selected: [f.service], title: 'Service', onChange: ([v]: string[]) => setF({ ...f, service: v || 'All' }) });
  const perim = per();

  inst.command = (c: string) => {
    if (c === 'expense' || c === 'new-expense') openForm();
    if (c?.startsWith?.('edit:')) { const e = byId(c.slice(5)); if (e) { setFlashId(e.id); openForm(e); } }
  };
  inst.menus = () => ({
    'Fichier': [{ label: 'Nouvelle dépense…', icon: 'plus', disabled: !canEdit, action: () => openForm() }, { label: 'Exporter vers Excel…', icon: 'export', disabled: !gx().shell?.canOpen?.('export'), action: () => gx().wm.open('export') }],
    'Présentation': [{ header: 'Trier par' }, ...([['date', 'Date'], ['site', 'Site / plaque'], ['service', 'Service'], ['comment', 'Commentaire'], ['amount', 'Montant']] as [Sort['k'], string][]).map(([k, l]) => ({ label: l, checked: sort.k === k, action: () => setSort(k) })), '-',
      { label: 'Réinitialiser les filtres', icon: 'refresh', disabled: !nFilters, action: () => setF(F0) }],
  });

  if (!allowed) return <div className="app"><div className="app-body"><div className="empty" style={{ height: '100%' }}><Icon name="lock" />Rubrique non disponible pour votre rôle.</div></div></div>;

  const th = (k: Sort['k'], l: string, cls = '') => <th className={cls} data-sort={k} onClick={() => setSort(k)}>{l}{sort.k === k ? <span className="ar"><Icon name={sort.dir === 'asc' ? 'arrowup' : 'arrowdown'} size="sm" /></span> : null}</th>;
  const empty = <div className="empty fix-empty"><Icon name="search" />{expenses === undefined ? 'Chargement…' : 'Aucune dépense fixe trouvée.'}</div>;
  return (
    <div className="app"><div className="fix-shell"><div className="fix-main">
      <div className="app-head fix-h"><div className="ah-t"><span className="ah-eye">Outils</span><h1>Dépenses</h1><span className="sub">Dépenses fixes ponctuelles ou annuelles, imputées au budget</span></div>
        <div className="ah-f">{!canEdit ? <span className="badge" style={{ '--c': 'var(--danger)' } as React.CSSProperties}>Lecture seule</span> : null}
          <div className="fix-tot"><span className="label">Total période</span><b>{amountFr(total)}</b></div>
          {canEdit ? <button className="btn primary fix-new" onClick={() => openForm()}><Icon name="plus" size="sm" /><span className="lbl">Nouvelle dépense</span></button> : null}</div></div>
      <div className="app-head2 fix-f">
        <label className="search"><Icon name="search" size="sm" /><input placeholder="Rechercher…" aria-label="Rechercher" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
        {perim !== 'Tout le réseau' ? <button className="chip" data-tip="Périmètre global — barre de menus" onClick={() => gx().root?.querySelector?.('#mbPeri')?.click()}><Icon name={gx().ctx.site ? 'lock' : 'pin'} size="sm" />{perim}</button> : null}
        <PickerBtn icon="pin" label={f.site === 'All' ? 'Tous sites' : f.site} active={f.site !== 'All'} onClick={pickSite} />
        <PickerBtn icon="layers" label={f.service === 'All' ? 'Tous services' : f.service} active={f.service !== 'All'} onClick={pickSvc} />
        <span className="fix-il">Du</span><input type="date" value={f.from} aria-label="Du" onChange={(e) => setF({ ...f, from: e.target.value || '' })} />
        <span className="fix-il">Au</span><input type="date" value={f.to} aria-label="Au" onChange={(e) => setF({ ...f, to: e.target.value || '' })} />
        {nFilters ? <button className="btn sm ghost" onClick={() => setF(F0)}><Icon name="refresh" size="sm" />Réinitialiser</button> : null}
        <span className="fix-cnt">{L.length} dépense{L.length > 1 ? 's' : ''}</span>
      </div>
      <div className="app-body fix-body" ref={bodyRef}>
        <div className="card fix-card" onClick={onListClick} onDoubleClick={onListDbl} onContextMenu={onListMenu}>
          <div className="fix-scroll" tabIndex={0} aria-label="Dépenses"><table className="fix-t"><thead><tr>{th('date', 'Date')}{th('site', 'Site / plaque')}{th('service', 'Service')}{th('comment', 'Commentaire')}{th('amount', 'Montant (€)', 'r')}<th className="r" style={{ width: 90 }}>Actions</th></tr></thead>
            <tbody>{L.length ? L.map((e) => <Row key={e.id} e={e} flash={flashId === e.id} cur={!!form && !form.closing && form.src?.id === e.id} canEdit={canEdit} />) : <tr><td colSpan={6}>{empty}</td></tr>}</tbody></table></div>
          <div className="fix-cards">{L.length ? L.map((e) => <MCard key={e.id} e={e} flash={flashId === e.id} canEdit={canEdit} />) : empty}</div>
        </div>
      </div></div>
      <div style={{ display: 'contents' }}>{form ? <ExpenseForm key={form.seq} src={form.src} closing={!!form.closing} onClose={closeForm} onSaved={onSaved} user={user} /> : null}</div>
    </div>{portals}</div>
  );
}

// ---------------------------------------------------------------- panneau de saisie
type Draft = Partial<FixedExpense> & { brands: BrandType[]; amountRaw: string };

/** Champ numérique : texte libre tant qu'il a le focus, valeur remontée à chaque frappe. */
function Num({ value, onValue, ...rest }: { value: number; onValue: (n: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [raw, setRaw] = useState<string | null>(null);
  return <input {...rest} type="number" value={raw ?? String(value)} onFocus={() => setRaw(String(value))} onBlur={() => setRaw(null)} onChange={(e) => { setRaw(e.target.value); onValue(+e.target.value || 0); }} />;
}

const ExpenseForm: React.FC<{ src: FixedExpense | null; closing: boolean; onClose: () => void; onSaved: (id: string, edit: boolean) => void; user: any }> = ({ src, closing, onClose, onSaved, user }) => {
  const edit = !!src;
  // Valeurs initiales : celles de la page (openModal, l.117-140). En édition, copie telle quelle.
  const [v, setV] = useState<Draft>(() => src
    ? { ...src, brands: [...brandsOf(src)] as BrandType[], amountRaw: String(src.amount ?? '') }
    : { date: gx().iso(gx().today()), service: 'VN', site: 'Clermont', sites: ['Clermont'], budgetDistribution: { Clermont: 100 }, amount: 0, comment: '', brand: undefined, brands: [], amountRaw: '0' });
  const [mode, setMode] = useState<'%' | '€'>('%');
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState('');
  const errRef = useRef<HTMLSpanElement>(null), amtRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Draft>) => setV((x) => ({ ...x, ...p }));
  useEffect(() => { const t = setTimeout(() => amtRef.current?.focus(), 80); return () => clearTimeout(t); }, []);

  const sitesView = v.sites || (v.site ? [v.site] : []);
  const isGroup = GROUPS.includes(v.site || '');
  const hasRdm = v.brands.some((b) => (RDM_BRANDS as string[]).includes(b));
  const amountNum = v.amountRaw === '' ? NaN : Number(v.amountRaw);
  const ok = !!v.date && v.amountRaw !== '' && !isNaN(amountNum) && !!v.site && !!v.service;

  // --- sites (updateSiteSelection de la page, piloté par le sélecteur multiple du moteur)
  const setSites = (site: string, sites: string[], dist: Record<string, number>) =>
    setV((x) => ({ ...x, site, sites, budgetDistribution: dist, brands: x.brands.filter((b) => brandAvail(sites, b)) }));
  const pickSites = (el: HTMLElement) => {
    const cur = isGroup ? [GROUP_LABEL[v.site!]] : [...sitesView];
    const prev = cur.map((s) => LABEL_GROUP[s] || s), wasGroup = prev.some((s) => GROUPS.includes(s));
    gx().ui.sitePicker(el, cur, (vals: string[]) => {
      const val = vals.map((s) => LABEL_GROUP[s] || s);
      const added = val.filter((s) => !prev.includes(s)), g = added.find((s) => GROUPS.includes(s));
      if (g) { setSites(g, Object.keys(DIST[g]), { ...DIST[g] }); gx().ui.closePick(); return; }
      const ss = wasGroup ? added : val.filter((s) => !GROUPS.includes(s));            // quitter un mode groupe repart de zéro
      setSites(ss.length === 1 ? ss[0] : ss.join(', '), ss, ss.length ? Object.fromEntries(ss.map((s) => [s, 100 / ss.length])) : {});
      if (wasGroup) gx().ui.closePick();
    }, { variant: 'project', title: 'Site / plaque' });
  };

  // --- marques (Holding exclusif ; brand legacy = première marque)
  const toggleBrand = (b: BrandType) => setV((x) => {
    const on = x.brands.includes(b);
    const next = (b === HOLDING_BRAND ? (on ? [] : [HOLDING_BRAND]) : on ? x.brands.filter((y) => y !== b) : [...x.brands.filter((y) => y !== HOLDING_BRAND), b]) as BrandType[];
    return { ...x, brands: next, brand: next[0] };
  });
  const aOk = brandAvail(sitesView, 'Alpine'), nOk = brandAvail(sitesView, 'Nissan');
  // Curseurs : dépense mixte seulement (marque RDM présente), défaut affiché 100 (= tout sur la marque).
  const shares = hasRdm ? ([['Alpine', 'alpineShare'], ['Nissan', 'nissanShare']] as const).filter(([b]) => v.brands.includes(b as BrandType)) : [];

  // --- répartition
  const base = Number(v.amountRaw) || 0, euro = mode === '€', euroOff = isGroup || !(base > 0);
  const dist: Record<string, number> = v.budgetDistribution || {};
  const distTotal = Object.values(dist).reduce((a, b) => a + b, 0);
  const setDist = (s: string, n: number) => setV((x) => ({ ...x, budgetDistribution: { ...(x.budgetDistribution || {}), [s]: mode === '€' ? (base > 0 ? (n / base) * 100 : 0) : n } }));

  const save = async () => {
    if (!ok) { if (errRef.current) gx().animate(errRef.current, [{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { spring: 'snappy' }); return; }
    const { amountRaw: _r, ...rest } = v;
    const saveBrands = v.brands || [];
    const data = { ...rest, amount: amountNum, brands: saveBrands, brand: saveBrands[0] } as FixedExpense;   // même charge que handleSave
    setBusy(true); setFailed('');
    try {
      const r = edit && src?.id ? await updateFixedExpense(data) : await createFixedExpense(data);
      logActivity(user, edit ? 'a modifié une dépense fixe' : 'a créé une dépense fixe', nameOf(data));
      onSaved(r?.id || src?.id || '', edit);
    } catch {
      // Le panneau reste ouvert : la saisie n'est pas perdue (comme la page).
      setFailed('Échec de la sauvegarde (serveur injoignable ou droits insuffisants ?).'); setBusy(false);
    }
  };

  return (
    <>
      {closing ? null : <div className="fix-scrim" onClick={onClose} />}
      <aside className={`fix-panel ${closing ? 'out' : ''}`} role="dialog" aria-label={edit ? 'Modifier la dépense' : 'Nouvelle dépense fixe'} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
        <div className="fix-ph"><span className="ic" style={{ '--c': edit ? '#5b8cff' : 'var(--accent)' } as React.CSSProperties}><Icon name={edit ? 'edit' : 'plus'} size="sm" /></span><h2 className="grow">{edit ? 'Modifier la dépense' : 'Nouvelle dépense fixe'}</h2><button className="icon-btn" aria-label="Fermer" data-tip="Fermer (Échap)" onClick={onClose}><Icon name="close" /></button></div>
        <div className="fix-pb">
          <div className="fix-2"><div className="fix-fld"><span className="label">Date *</span><div className={v.isAnnual ? 'fix-dis' : ''}><input type="date" value={v.date || ''} aria-label="Date" onChange={(e) => set({ date: e.target.value })} /></div></div>
            <div className="fix-fld"><span className="label">Imputation</span><Seg value={v.isAnnual ? '1' : '0'} options={[['0', <span key="p" title="Montant imputé sur le seul mois de la date choisie.">Ponctuelle</span>], ['1', <span key="a" title="Montant total réparti sur les 12 mois de l'année (calcul au Budget uniquement).">Annuelle</span>]]} onChange={(x) => set({ isAnnual: x === '1' })} /></div></div>
          {v.isAnnual && v.date ? <span className="fix-hint">Réparti sur toute l'année {new Date(v.date).getFullYear()} (montant total ci-contre).</span> : null}
          <div className="fix-2"><div className="fix-fld"><span className="label">Montant *</span><div className="fix-amtin"><input ref={amtRef} type="number" className="input" step="0.01" value={v.amountRaw} placeholder="0.00" aria-label="Montant" onChange={(e) => set({ amountRaw: e.target.value })} /><span>€</span></div></div>
            <div className="fix-fld"><span className="label">Service *</span><select className="select" aria-label="Service" value={v.service || ''} onChange={(e) => set({ service: e.target.value as ServiceType })}>{SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div></div>
          <div className="fix-fld"><span className="label">Site / plaque *</span><div><button className="picker-btn fix-sitebtn" onClick={(e) => pickSites(e.currentTarget)}><span className="v">{v.site || 'Sélectionner...'}</span><Icon name="chevdown" size="sm" /></button></div><span className="fix-note">GROUPE BONY (global) · GROUPE BONY (R/N) · sites par plaque · sites Nissan</span></div>
          <div className="fix-fld"><span className="label">Marque(s) — routage budgétaire</span>
            <div className="fix-brands">{(BRANDS as BrandType[]).map((b) => { const avail = brandAvail(sitesView, b); return (
              <button key={b} className="chip" aria-pressed={v.brands.includes(b)} style={{ '--bg': BRAND_BG[b][0], '--fg': BRAND_BG[b][1] } as React.CSSProperties} disabled={!avail} data-tip={avail ? undefined : `${b} : aucun site éligible`} onClick={() => toggleBrand(b)}>{b}</button>); })}</div>
            <span className="fix-note">{!aOk && !nOk ? 'Sélectionnez un site Alpine ou Nissan pour activer ces marques.' : 'Holding est exclusif et n’est imputé à aucun budget.'}</span></div>
          <div style={{ display: 'contents' }}>
            {shares.map(([b, k]) => { const val = (v as any)[k] ?? 100; return (
              <div key={k} className="fix-share"><div className="row"><span className="label">Part {b} (%)</span><b>{val} % → {b} · {100 - val} % → compte RDM</b></div>
                <input type="range" min="0" max="100" value={val} aria-label={`Part ${b}`} style={{ '--p': `${val}%` } as React.CSSProperties} onChange={(e) => set({ [k]: Number(e.target.value) } as any)} /></div>); })}
            {shares.length === 2 ? <span className="fix-note" style={{ marginTop: -8 }}>Alpine + Nissan + RDM : Alpine passe avant, la part Nissan est ignorée au calcul du budget.</span> : null}
          </div>
          <div>{(v.sites || []).length > 1 ? (
            <div className="fix-dist"><div className="hd"><span className="label">Répartition budgétaire{isGroup ? ' · verrouillée' : ''}</span><Seg value={mode} options={[['%', '%'], ['€', '€']]} onChange={setMode} /></div>
              {(v.sites || []).map((s) => { const pct = dist[s] || 0, amt = Math.round(base * (pct / 100)); return (
                <div key={s} className="fix-drow"><span className="n" data-tip={s}>{s}</span>
                  {euro ? <Num className="input num" value={amt} disabled={euroOff} onValue={(n) => setDist(s, n)} /> : <Num className="input num" min="0" max="100" value={Number(pct.toFixed(2))} disabled={isGroup} onValue={(n) => setDist(s, n)} />}
                  <span className="u">{euro ? '€' : '%'}</span><span className="alt">{euro ? `${Number(pct.toFixed(1))} %` : amountFr(amt)}</span></div>); })}
              {euro && !(base > 0) ? <span className="fix-note" style={{ color: 'var(--warn)' }}>Montant = 0 € : saisie en € indisponible (utilisez le mode %).</span> : null}
              <div className="fix-dtot" style={{ color: Math.abs(distTotal - 100) < 0.01 ? 'var(--ok)' : 'var(--danger)' }}>Total : {Math.round(distTotal)} %</div></div>) : null}</div>
          <div className="fix-fld"><span className="label">Commentaire</span><textarea className="textarea" placeholder="Description de la dépense..." value={v.comment || ''} onChange={(e) => set({ comment: e.target.value })} /></div>
          <label className="fix-pro"><input type="checkbox" checked={!!v.proPlus} onChange={(e) => set({ proPlus: e.target.checked })} />Type client : PRO+ (B2B)</label>
        </div>
        <div className="fix-pf"><span className="fix-err" ref={errRef}>{failed || (ok ? '' : 'Veuillez remplir tous les champs obligatoires (Date, Montant, Site, Service)')}</span><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>
      </aside>
    </>
  );
};
