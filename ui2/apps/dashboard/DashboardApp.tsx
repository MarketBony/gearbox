import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { BrandType, ServiceType, SocialPost, User } from '../../../types';
import { allowedSitesFor, canEditProjects, hasSocialFeatures, libelleMarqueDigital, libelleStatutSocial } from '../../../constants';
import { parseLocalDate } from '../../../components/DateRangePicker';
import { useAuth } from '../../../contexts/AuthContext';
import { computeDashboardStats } from '../../../services/dashboardStats';
import { useWorkspace } from '../../store/workspace';
import { useBudgets, useFixedExpenses, useSocialPosts } from '../../store/collections';
import { gx, Icon, Chips, Seg, PickerBtn, useEngineEvent } from '../ui/kit';
import { projectIdOfGap } from './besoins';

// =====================================================================
// Rubrique « Dashboard » (Cockpit général) — transposition de maquettes/v2/js/apps/dashboard.js
// (même balisage, mêmes classes, CSS déjà chargée) sur les VRAIES données. Parité avec
// pages/Dashboard.tsx : maquettes/ux/inventaires/dashboard.md.
//  - AUCUN montant, compteur ni liste calculé ici : tout sort de `computeDashboardStats`
//    (services/dashboardStats.ts), le moteur de la page actuelle — mêmes filtres, mêmes règles
//    (brouillon exclu, Holding tracké jamais imputé, périmètre testé sur la DESTINATION budgétaire,
//    Nissan jamais implicite, curseurs Alpine/Nissan, taux pondérés). Ce composant ne fait que
//    mettre en forme (pourcentages d'affichage, arrondis de libellé, tris déjà faits) ;
//  - LECTURE SEULE pour tous : aucune écriture. Actions = ouvrir un projet / Digital / Export /
//    Nouveau projet (dans leurs rubriques, avec leurs propres droits) ;
//  - chef de site : données déjà cloisonnées par le serveur ; périmètre borné à SES concessions,
//    jamais « Nissan » ; blocs marketing (performance, top consommateurs, charge) masqués
//    (`hasSocialFeatures`). Les campagnes ne sont plus chargées : la page les lisait sans s'en
//    servir, sans cloisonnement serveur (inventaire §11) ;
//  - filtres persistés dans les MÊMES clés de session que la page (`gearbox_session_dashboard_*`).
// =====================================================================

type Pro = 'all' | 'pro' | 'standard';
interface Filters { from: string; to: string; ctxs: string[]; brands: string[]; services: string[]; pro: Pro }

const BRANDS = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize'];                   // Holding non proposé (page)
const SERVICES = ['VN', 'VO', 'APV', 'PR'];                                               // « Tous Services » non proposé
const MIX_COLOR: Record<string, string> = { VN: '#f75632', VO: '#8f12ab', APV: '#5b7fd6', PR: '#06b6d4' };   // maquette
const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const PRO_OPTS: [Pro, string][] = [['all', 'Tout'], ['standard', 'Sans PRO+'], ['pro', 'PRO+ uniquement']];

// ---------------------------------------------------------------- session (mêmes clés que pages/Dashboard.tsx)
const SS = (k: string) => `gearbox_session_${k}`;
const ssGet = <T,>(k: string, d: T): T => { try { const v = sessionStorage.getItem(SS(k)); return v === null ? d : JSON.parse(v); } catch { return d; } };
const ssSet = (k: string, v: unknown) => { try { sessionStorage.setItem(SS(k), JSON.stringify(v)); } catch { /* navigation privée */ } };
const KEYS: Record<keyof Filters, string> = { from: 'dashboard_dateStart', to: 'dashboard_dateEnd', ctxs: 'dashboard_filterContexts', brands: 'dashboard_filterBrands', services: 'dashboard_filterServices', pro: 'dashboard_filterProPlus' };
const saveFilters = (f: Filters) => (Object.keys(KEYS) as (keyof Filters)[]).forEach((k) => ssSet(KEYS[k], f[k]));

// ---------------------------------------------------------------- formats
const F = () => gx().fmt;
const Y = new Date().getFullYear();
const yearFilters = (y: number) => ({ from: `${y}-01-01`, to: `${y}-12-31` });
const isYear = (f: Filters) => f.from.endsWith('-01-01') && f.to.endsWith('-12-31') && f.from.slice(0, 4) === f.to.slice(0, 4);
const days = (d: string) => Math.round((+parseLocalDate(d) - +gx().today()) / 864e5);
const sitesTxt = (sites: string[]) => (sites.length > 2 ? `${sites[0]} +${sites.length - 1}` : sites.join(', '));
const pctTxt = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

// ---------------------------------------------------------------- rendus
const DateBox: React.FC<{ d: string }> = ({ d }) => {
  const x = parseLocalDate(d);
  return <div className="dsh-date"><span>{x.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</span><b className="num">{x.getDate()}</b></div>;
};
const Empty: React.FC<{ t: string; style?: React.CSSProperties }> = ({ t, style }) => <div className="dsh-empty" style={style}>{t}</div>;
const Head: React.FC<{ title: React.ReactNode; hint?: React.ReactNode; right?: React.ReactNode }> = ({ title, hint, right }) => (
  <div className="dsh-h"><div style={{ minWidth: 0 }}><h2 className="dsh-h2">{title}</h2>{hint ? <div className="dsh-hint">{hint}</div> : null}</div>{right}</div>
);
/** HTML du moteur (`gx().chart.*`) inséré sans enveloppe visible : même arbre que la maquette. */
const Html: React.FC<{ html: string }> = ({ html }) => <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
/** `GX.r.av` sur le VRAI utilisateur (GX.data.user retomberait sur « moi » pour un inconnu). */
const Av: React.FC<{ u?: User }> = ({ u }) => {
  const name = u?.name || 'Utilisateur inconnu';
  const ini = name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return <span className="av sm" style={{ '--c': u?.avatarColor || '#8a8599' } as React.CSSProperties} data-tip={name}>{u ? ini : '?'}</span>;
};
/** `GX.r.net` ; un réseau hors catalogue (ajouté dans les Tags) = globe, comme la page. */
const Net: React.FC<{ id: string }> = ({ id }) => {
  const n = gx().data.network(id);
  return <span style={{ color: n ? n.c : 'var(--text-3)' }} data-tip={id}><Icon name={n ? n.icon : 'globe'} size="sm" /></span>;
};
/** `GX.r.sStatus`, libellé réel (« Programmed » stocké, « Programmé » affiché, comme Digital). */
const Status: React.FC<{ id: string }> = ({ id }) => {
  const s = gx().data.socialStatus(id);
  return <span className={`badge ${s.solid ? 'solid' : ''}`} style={{ '--c': s.strike ? 'var(--text-3)' : s.c, ...(s.strike ? { textDecoration: 'line-through' } : {}) } as React.CSSProperties}>{libelleStatutSocial(id)}</span>;
};
/** `GX.r.brandChips`, Holding affiché « GROUPE BONY » (comme Digital). */
const Brands: React.FC<{ brands: string[] }> = ({ brands }) => <>{brands.map((b, i) => (
  <React.Fragment key={b}>{i > 0 && ' '}<span className="badge brand" style={{ '--c': gx().data.brand(b)?.hex, ...(b === 'Renault' ? { color: '#1b1604' } : {}) } as React.CSSProperties}>{libelleMarqueDigital(b)}</span></React.Fragment>
))}</>;
const Rb: React.FC<{ l: string; p: number; col: string; strong?: boolean }> = ({ l, p, col, strong }) => (
  <div className="dsh-rb"><span>{l}</span><div className="bar" style={{ height: 7 }}><i style={{ width: `${Math.min(100, Math.max(0, p))}%`, '--c': col } as React.CSSProperties} /></div><b className="num" style={strong ? {} : { color: 'var(--text-3)' }}>{p} %</b></div>
);

// ---------------------------------------------------------------- rubrique
export default function DashboardApp({ win, inst }: AppProps) {
  const { user } = useAuth();
  const role = user?.role || '';
  const sm = !hasSocialFeatures(role);                                         // chef de site
  const scoped = useMemo(() => allowedSitesFor(user), [user]);                 // null = voit tout
  const canNew = canEditProjects(role) && gx().shell?.canOpen?.('projects') !== false;
  const canExport = !!gx().shell?.canOpen?.('export');
  const canDigital = gx().shell?.canOpen?.('digital') !== false;

  // --- données (sources partagées ; déjà cloisonnées par le serveur)
  const projects = useWorkspace((s) => s.projects);
  const byId = useWorkspace((s) => s.byId);
  const ready = useWorkspace((s) => s.ready);
  const users = useWorkspace((s) => s.users);
  const budgets = useBudgets();
  const fixed = useFixedExpenses();
  const posts = useSocialPosts();
  const loaded = ready && !!budgets && !!fixed && !!posts;

  // --- filtres
  /** Périmètre global de la barre de menus (un site, « Nissan » ou « Tout le réseau »). Jamais pour un chef de site. */
  const fromCtx = useCallback((): string[] => { const p = gx().ctx.perimetre; return scoped || !p || p === 'Tout le réseau' ? [] : [p]; }, [scoped]);
  const def = useCallback((): Filters => ({ ...yearFilters(Y), ctxs: fromCtx(), brands: [], services: [], pro: 'all' }), [fromCtx]);
  const [f, setFState] = useState<Filters>(() => {
    const d = def();
    const ctxs = ssGet<string[] | null>(KEYS.ctxs, null);
    // Chef de site : une valeur de session hors de SES concessions est écartée (pur confort : le serveur borne déjà).
    return { from: ssGet(KEYS.from, d.from), to: ssGet(KEYS.to, d.to), ctxs: (ctxs ?? d.ctxs).filter((s) => !scoped || scoped.includes(s)), brands: ssGet(KEYS.brands, d.brands), services: ssGet(KEYS.services, d.services), pro: ssGet<Pro>(KEYS.pro, 'all') };
  });
  const setF = (change: (x: Filters) => Filters) => setFState((x) => { const n = change(x); saveFilters(n); return n; });
  const reset = () => setF(() => def());
  const [showF, setShowFState] = useState<boolean>(() => ssGet('ui2_dashboard_filtersOpen', !win.isCompact?.()));
  const setShowF = (v: boolean) => { ssSet('ui2_dashboard_filtersOpen', v); setShowFState(v); };

  // Périmètre global : resynchronisé seulement s'il a CHANGÉ (même logique que la maquette).
  const lastPer = useRef(gx().ctx.perimetre);
  useEngineEvent('ctx', () => {
    const p = gx().ctx.perimetre; if (p === lastPer.current) return; lastPer.current = p;
    if (!scoped) setF((x) => ({ ...x, ctxs: fromCtx() }));
  });

  // --- moteur : UNE source, la même que la page actuelle
  const fd = useDeferredValue(f);
  const stats = useMemo(() => computeDashboardStats({
    projects: loaded ? projects : [], budgets: budgets || [], socialPosts: posts || [], fixedExpenses: fixed || [],
    dateStart: fd.from, dateEnd: fd.to, filterContexts: fd.ctxs,
    filterBrands: fd.brands as BrandType[], filterServices: fd.services as ServiceType[], filterProPlus: fd.pro,
  }), [loaded, projects, budgets, posts, fixed, fd]);

  // --- « mise à jour il y a … » : horodatage de la dernière donnée reçue
  const [stamp, setStamp] = useState(Date.now());
  const [, setTick] = useState(0);
  useEffect(() => { if (loaded) setStamp(Date.now()); }, [loaded, projects, budgets, posts, fixed]);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(t); }, []);

  // --- défilement : même clé que la page (`useScrollRestore('dashboard')`)
  const bodyRef = useRef<HTMLDivElement>(null), restored = useRef(false);
  useLayoutEffect(() => {
    const el = bodyRef.current; if (!el || restored.current || !loaded) return; restored.current = true;
    const v = +(sessionStorage.getItem(SS('scroll_dashboard')) || 0); if (v) el.scrollTop = v;
  }, [loaded]);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => { try { sessionStorage.setItem(SS('scroll_dashboard'), String(Math.round(e.currentTarget.scrollTop))); } catch { /* */ } };

  // --- graphiques du moteur : régénérés seulement quand leurs chiffres changent (sinon réanimés à chaque rendu)
  const mixParts = useMemo(() => stats.serviceChartData.map((d) => ({ label: d.name, value: d.value, color: MIX_COLOR[d.name] })), [stats]);
  const mixTot = mixParts.reduce((s, p) => s + p.value, 0) || 1;
  const charts = useMemo(() => ({
    trend: gx().chart.bars({ labels: MONTHS, series: [{ name: 'Réalisé mensuel', values: stats.monthlyTrend.map((m) => m.reel) }], line: { name: 'Budget mensuel', values: stats.monthlyTrend.map((m) => m.prevu) }, height: 280 }),
    mix: mixParts.length ? gx().chart.donut({ parts: mixParts, size: 190, thickness: 24, center: F().eurK(stats.totalActual), sub: 'engagés' }) : '',
    canal: stats.budgetParCanal.length ? gx().chart.hbars({ items: stats.budgetParCanal.map((d) => ({ label: d.name, value: d.value, color: 'var(--bony-violet)' })) }) : '',
    sites: stats.topSites.length ? gx().chart.hbars({ items: stats.topSites.map((d) => ({ label: d.name, value: d.value })) }) : '',
    provs: stats.topPrestataires.length ? gx().chart.hbars({ items: stats.topPrestataires.map((d) => ({ label: `${d.name} · ${d.taches} tâche${d.taches > 1 ? 's' : ''}`, value: d.value, color: 'var(--info)' })) }) : '',
  }), [stats, mixParts]);

  // --- navigation
  const openIn = (app: string, cmd?: string | null, origin?: HTMLElement | null) => {
    const w = gx().wm.open(app, {}, { origin });
    if (cmd) setTimeout(() => (w || gx().wm.active())?.inst?.command?.(cmd), 450);
  };
  const openProject = (id: string, name: string, origin: HTMLElement) => gx().wm.open('project', { id, title: name }, { origin });

  // --- sélecteurs du moteur
  const pickPeriod = (el: HTMLElement) => gx().ui.dateRange(el, { from: f.from, to: f.to }, ({ from, to }: { from?: string; to?: string }) => {
    if (!from || !to) return; setF((x) => ({ ...x, from, to: to < from ? from : to }));
  });
  const pickPeri = (el: HTMLElement) => {
    if (scoped) {
      if (!scoped.length) return;
      return gx().ui.pick(el, [{ label: 'Mes concessions', items: scoped.map((s) => ({ v: s, l: s })) }], { title: 'Périmètre', selected: f.ctxs, allLabel: 'Toutes mes concessions', onChange: (v: string[]) => setF((x) => ({ ...x, ctxs: v })) });
    }
    gx().ui.sitePicker(el, f.ctxs, (v: string[]) => setF((x) => ({ ...x, ctxs: v })), { variant: 'filter' });
  };

  // --- libellés de filtres
  const n = (f.ctxs.length ? 1 : 0) + (f.brands.length ? 1 : 0) + (f.services.length ? 1 : 0) + (f.pro !== 'all' ? 1 : 0);   // la période ne compte pas
  const allLbl = scoped ? (scoped.length === 1 ? scoped[0] : scoped.length ? 'Toutes mes concessions' : 'Aucun site') : 'Tout le réseau';
  const summary = [isYear(f) ? f.from.slice(0, 4) : gx().ui.periodLabel(f.from, f.to), f.ctxs.length ? gx().ui.summary(f.ctxs) : allLbl,
    f.brands.length && gx().ui.summary(f.brands), f.services.length && gx().ui.summary(f.services), f.pro === 'pro' ? 'PRO+ seul' : f.pro === 'standard' ? 'Sans PRO+' : null].filter(Boolean).join(' · ');
  const brandHex = useMemo(() => Object.fromEntries(BRANDS.map((b) => [b, gx().data.brand(b)?.hex || '#8a8599'])), []);

  // --- chiffres d'affichage (dérivés des totaux du moteur, comme la page : burnRate, remaining, ecartRythme)
  const burn = stats.totalForecast > 0 ? (stats.totalActual / stats.totalForecast) * 100 : 0;
  const rest = stats.totalForecast - stats.totalActual;
  const gap = stats.pctEngageADate - stats.pctTempsEcoule;
  const gapC = gap > 10 ? 'var(--danger)' : gap < -10 ? 'var(--warn)' : 'var(--ok)';
  const late = stats.projetsEnRetard;
  const chartYear = parseLocalDate(fd.from).getFullYear();
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const sitesOf = (id: string, fallback: string) => { const p = byId[id]; return p ? sitesTxt(p.sites && p.sites.length ? p.sites : [p.site]) : fallback; };

  let ki = 0;
  const kpi = (ic: string, col: string, t: string, v: React.ReactNode, unit: string, foot: React.ReactNode, extra: React.ReactNode = null, vColor = '') => (
    <div className="card dsh-kpi enter" style={{ '--i': ki++, '--kc': col } as React.CSSProperties}>
      <div className="top"><span className="dsh-lbl">{t}</span><span className="ic"><Icon name={ic} size="sm" /></span></div>
      <div className="dsh-kv num" style={vColor ? { color: vColor } : {}}>{v}{unit ? <small>{unit}</small> : null}</div>{extra}<p className="foot" style={{ marginBottom: 0 }}>{foot}</p>
    </div>
  );

  // --- barre du haut et commandes
  inst.command = (c: string) => { if (c === 'filters') setShowF(true); };
  inst.menus = () => ({
    'Fichier': [
      ...(canNew ? [{ label: 'Nouveau projet…', icon: 'plus', action: () => openIn('projects', 'new-project') }] : []),
      ...(canExport ? [{ label: 'Exporter…', icon: 'download', action: () => openIn('export') }] : []),
    ],
    'Présentation': [
      { label: showF ? 'Masquer les filtres' : 'Afficher les filtres', icon: 'filter', action: () => setShowF(!showF) },
      { label: 'Réinitialiser les filtres', icon: 'refresh', action: reset }, '-',
      { label: 'Année en cours', checked: isYear(f) && f.from.startsWith(String(Y)), action: () => setF((x) => ({ ...x, ...yearFilters(Y) })) },
      ...(scoped ? [] : [{ label: 'Reprendre le périmètre global', icon: 'pin', action: () => setF((x) => ({ ...x, ctxs: fromCtx() })) }]),
    ],
  });

  const G = stats.perfGlobale;
  return (
    <div className="app">
      <div className="app-head">
        <div className="ah-t"><span className="ah-eye">Tableau de bord</span><h1 className="display">Cockpit général</h1>
          <span className="sub"><span className="dsh-hsub">Vue consolidée et analyse de la performance · </span>{loaded ? `mise à jour ${F().ago(stamp)}` : 'chargement…'}</span></div>
        <div className="ah-f">
          <button className={`btn ${showF ? '' : 'primary'}`} data-tip={summary} onClick={() => setShowF(!showF)}><Icon name="filter" size="sm" />Filtres{n ? <> <span className="count">{n}</span></> : null}</button>
          {canExport ? <button className="btn dsh-head-x" onClick={(e) => openIn('export', null, e.currentTarget)}><Icon name="download" size="sm" />Exporter</button> : null}
          {canNew ? <button className="btn primary" onClick={(e) => openIn('projects', 'new-project', e.currentTarget)}><Icon name="plus" size="sm" />Nouveau projet</button> : null}
        </div>
      </div>
      <div className={`app-head2 ${showF ? '' : 'hide'}`}>
        <div><span className="label">Période</span><PickerBtn icon="agenda" label={isYear(f) ? `Année ${f.from.slice(0, 4)}` : gx().ui.periodLabel(f.from, f.to)} active={!isYear(f)} onClick={pickPeriod} /></div>
        <div><span className="label">Périmètre</span><PickerBtn icon="pin" label={gx().ui.summary(f.ctxs, { all: allLbl })} active={!!f.ctxs.length} onClick={pickPeri} /></div>
        <div><span className="label">Client B2B (PRO+)</span><Seg value={f.pro} options={PRO_OPTS} onChange={(v) => setF((x) => ({ ...x, pro: v }))} /></div>
        <div className="dsh-fstate"><span>{n ? `${n} filtre${n > 1 ? 's' : ''} actif${n > 1 ? 's' : ''}` : 'Aucun filtre actif'}</span><button className="dsh-link" onClick={reset}>Réinitialiser</button></div>
        <div className="dsh-break" />
        <div><span className="label">Marque</span><Chips values={BRANDS} selected={f.brands} colors={brandHex} onChange={(v) => setF((x) => ({ ...x, brands: v }))} /></div>
        <div><span className="label">Service</span><Chips values={SERVICES} selected={f.services} all="Tous" onChange={(v) => setF((x) => ({ ...x, services: v }))} /></div>
      </div>
      <div ref={bodyRef} className="app-body scroll" onScroll={onScroll}><div className="dsh-body">
        <div className="dsh-kpis">
          {kpi('budget', 'var(--bony-orange)', 'Budget consommé', F().n(Math.round(stats.totalActual)), '€',
            <>Sur {F().eur(stats.totalForecast)} prévus sur la période · <b style={{ color: burn > 100 ? 'var(--danger)' : 'var(--ok)' }}>{pctTxt(burn)} %</b></>,
            <div className={`bar ${burn > 100 ? 'over' : ''}`} style={{ height: 6 }}><i style={{ width: `${Math.min(100, burn)}%`, ...(burn > 100 ? { '--c': 'var(--danger)' } : {}) } as React.CSSProperties} /></div>)}
          {kpi('target', 'var(--info)', 'Reste à engager', F().n(Math.round(rest)), '€', rest < 0 ? 'Dépassement budgétaire sur la période.' : 'Disponible pour de nouveaux projets.', null, rest < 0 ? 'var(--danger)' : '')}
          {kpi('layers', 'var(--ok)', 'Projets actifs', stats.activeProjectsCount, '', <><span style={{ color: 'var(--ok)', fontWeight: 700 }}>● En cours de réalisation</span> sur le périmètre.</>)}
          {kpi('campaigns', 'var(--bony-violet)', 'Campagnes programmées', stats.activeCampaignsCount, '', 'Envois SMS / e-mail au statut « programmé ».')}
          {kpi('alert', late.length ? 'var(--danger)' : 'var(--ok)', 'Projets en retard', late.length, '', 'Échéance dépassée, avancement inférieur à 100 %.', null, late.length ? 'var(--danger)' : 'var(--ok)')}
          {kpi('trending', gapC, 'Avance / retard de budget', `${gap > 0 ? '+' : gap < 0 ? '−' : ''}${Math.abs(gap)}`, 'points',
            `Engagé ${stats.pctEngageADate} % pour ${stats.pctTempsEcoule} % de la période écoulée : ${gap > 10 ? 'vous engagez plus vite que le temps ne passe, le budget risque de manquer.' : gap < -10 ? 'le budget risque de rester non engagé.' : 'engagements au rythme du calendrier.'}`,
            <div style={{ display: 'grid', gap: 6 }}><Rb l="Engagé à date" p={stats.pctEngageADate} col="var(--bony-orange)" strong /><Rb l="Période écoulée" p={stats.pctTempsEcoule} col="var(--text-3)" />
              <div className="dsh-rb" style={{ gridTemplateColumns: 'auto 1fr' }}><span>Engagé sur la période</span><b className="num" style={{ textAlign: 'left', color: 'var(--text-2)' }}>{stats.pctEngagePeriode} %</b></div></div>, gapC)}
        </div>

        <div className="dsh-g21">
          <div className="card dsh-card"><Head title={`Trajectoire mensuelle ${chartYear}`} hint="Réalisé ventilé des projets et dépenses, face à l’enveloppe du périmètre."
            right={<div className="dsh-legend"><span><i className="dash" />Budget mensuel</span><span><i style={{ background: 'var(--bony-orange)' }} />Réalisé</span></div>} />
            <Html html={charts.trend} /></div>
          <div className="card dsh-card"><Head title="Mix activité" hint="Réalisé de la période, par service." />
            {mixParts.length ? <>
              <div className="dsh-mix" dangerouslySetInnerHTML={{ __html: charts.mix }} />
              <div className="dsh-mixl">{mixParts.map((p) => (
                <div key={p.label} className="row"><i style={{ background: p.color }} /><b>{p.label}</b><span className="grow" /><span className="muted num">{F().eurK(p.value)}</span><b className="num" style={{ width: 44, textAlign: 'right' }}>{Math.round((p.value / mixTot) * 100)} %</b></div>))}</div>
            </> : <Empty t="Aucune donnée" />}</div>
        </div>

        <div className="dsh-g2">
          <div className="card dsh-card"><Head title="Prochaines échéances" hint="Projets actifs dont la fin approche." right={<button className="dsh-link" onClick={(e) => openIn('projects', null, e.currentTarget)}>Tous les projets →</button>} />
            <div className="dsh-list">{stats.deadlines.length ? stats.deadlines.map((p) => { const d = days(p.endDate); return (
              <div key={p.id} className="dsh-row" onClick={(e) => openProject(p.id, p.name, e.currentTarget)}><DateBox d={p.endDate} />
                <div className="grow" style={{ minWidth: 0 }}><div className="t ellipsis">{p.name}</div><div className="s ellipsis">{sitesTxt(p.sites && p.sites.length ? p.sites : [p.site])} · {p.projectType}</div></div>
                <span className="in" style={{ color: d <= 7 ? 'var(--warn)' : 'var(--text-2)' }}>{F().rel(parseLocalDate(p.endDate))}</span></div>); })
              : <Empty t="Aucune échéance à venir" />}</div></div>
          <div className="card dsh-card"><Head title="Prochaines publications" hint="Publications à venir, hors publiées et abandonnées." right={canDigital ? <button className="dsh-link" onClick={(e) => openIn('digital', null, e.currentTarget)}>Calendrier éditorial →</button> : null} />
            <div className="dsh-list">{stats.upcomingPosts.length ? stats.upcomingPosts.map((p: SocialPost) => (
              <div key={p.id} className="dsh-row" onClick={(e) => canDigital && openIn('digital', 'post:' + p.id, e.currentTarget)}><DateBox d={(p.date || '').slice(0, 10)} />
                <div className="grow" style={{ minWidth: 0 }}><div className="t ellipsis">{p.title}</div>
                  <div className="s row" style={{ gap: 6, flexWrap: 'wrap' }}>{(p.networks || []).slice(0, 4).map((nw) => <Net key={nw} id={nw} />)}{(p.networks || []).length > 4 ? <span className="faint">+{p.networks.length - 4}</span> : null}<Brands brands={p.brands || []} /></div></div>
                <Status id={p.status} /></div>))
              : <Empty t="Aucune publication à venir" />}</div></div>
        </div>

        <div className="card dsh-card"><Head title="Écart prévu / réalisé" hint={<>Projets avec un budget prévisionnel · avancement moyen des projets actifs : <b style={{ color: 'var(--text)' }}>{stats.avancementMoyen} %</b></>}
          right={<div className="dsh-legend"><span><i style={{ background: 'var(--text-3)' }} />Prévu</span><span><i style={{ background: 'var(--danger)' }} />Dépassement</span><span><i style={{ background: 'var(--ok)' }} />Sous budget</span></div>} />
          {stats.ecartsTop.length ? <div className="dsh-gaps">{stats.ecartsTop.map((g, i) => {
            const m = Math.max(g.prevu, g.realise) || 1, col = g.ecart > 0 ? 'var(--danger)' : 'var(--ok)';
            const pid = projectIdOfGap(projects, g.nom);                            // BESOIN: `id` dans ecartsTop
            return (
              <div key={`${i}:${g.nom}`} className="dsh-gap" onClick={(e) => pid && openProject(pid, g.nom, e.currentTarget)}>
                <div className="row" style={{ gap: 10, fontSize: 14 }}><b className="ellipsis grow">{g.nom}</b><b className="num" style={{ color: col }}>{g.ecart > 0 ? '+' : g.ecart < 0 ? '−' : ''}{Math.abs(g.ecartPct)} %</b></div>
                <div className="bar"><i style={{ width: `${(g.prevu / m) * 100}%`, '--c': 'var(--text-3)' } as React.CSSProperties} /></div>
                <div className="bar"><i style={{ width: `${(g.realise / m) * 100}%`, '--c': col } as React.CSSProperties} /></div>
                <div className="ft num"><span>Prévu {F().eur(g.prevu)}</span><span>Réalisé {F().eur(g.realise)}</span></div></div>); })}</div>
            : <Empty t="Aucun prévisionnel saisi sur la période" />}</div>

        <div className="dsh-g2">
          <div className="card dsh-card"><Head title={<>Projets en retard{late.length ? <> <span className="badge solid" style={{ '--c': 'var(--danger)' } as React.CSSProperties}>{late.length}</span></> : null}</>} hint="Échéance dépassée et avancement incomplet. Triés du plus ancien retard." />
            <div className="dsh-list">{late.length ? late.map((p) => (
              <div key={p.id} className="dsh-row dsh-late" onClick={(e) => openProject(p.id, p.nom, e.currentTarget)}>
                <div className="grow" style={{ minWidth: 0 }}><div className="t ellipsis">{p.nom}</div><div className="s">{sitesOf(p.id, p.site)} · <span style={{ color: 'var(--danger)', fontWeight: 600 }}>fin {F().date(parseLocalDate(p.fin))} · {F().rel(parseLocalDate(p.fin))}</span></div></div>
                <div style={{ width: 110, flex: 'none' }}><div className="bar" style={{ height: 6 }}><i style={{ width: `${Math.min(100, p.avancement)}%` }} /></div><div className="num faint" style={{ fontSize: 12, textAlign: 'right', marginTop: 4 }}>{p.avancement} %</div></div></div>))
              : <Empty t="Aucun projet en retard 🎉" style={{ color: 'var(--ok)' }} />}</div></div>
          <div className="card dsh-card"><Head title="Budget par canal" hint="Coûts des tâches, par canal de diffusion." />{charts.canal ? <Html html={charts.canal} /> : <Empty t="Aucun canal renseigné sur les tâches." />}</div>
        </div>

        {sm ? null : <>
          <div className="card dsh-card"><Head title="Performance des campagnes" hint={<>Envois SMS et e-mail du périmètre. <b style={{ color: 'var(--text)' }}>Taux pondérés par la volumétrie</b> — une moyenne simple des taux serait faussée par les écarts de volume entre envois.</>} />
            {G.volume ? <>
              <div className="dsh-tiles">{([['Contacts touchés', F().n(G.volume), `${G.envois} envois`], ['Taux d’ouverture', `${pctTxt(G.ouverture)} %`, 'pondéré'], ['Taux de clic', `${pctTxt(G.clic)} %`, 'pondéré'],
                ['Coût / contact', `${pctTxt(G.coutParContact, 3)} €`, F().eur(G.cout)], ['NPAI', `${pctTxt(G.npai)} %`, 'adresses invalides'], ['Désabonnements', `${pctTxt(G.stop)} %`, 'STOP / désinscrits']] as [string, string, string][])
                .map(([l, v, s]) => <div key={l} className="dsh-tile"><div className="dsh-lbl ellipsis">{l}</div><b className="num">{v}</b><div className="faint ellipsis">{s}</div></div>)}</div>
              <div className="scroll"><table className="tbl zebra" style={{ minWidth: 560 }}><thead><tr><th>Canal</th><th className="r">Envois</th><th className="r">Contacts</th><th className="r">Ouverture</th><th className="r">Clic</th><th className="r">Coût</th><th className="r">Coût / contact</th></tr></thead>
                <tbody>{stats.perfCanal.map((x) => (
                  <tr key={x.canal}><td><b><Icon name={x.canal === 'SMS' ? 'sms' : 'mail'} size="sm" /> {x.canal}</b></td><td className="r num muted">{x.envois}</td><td className="r num">{F().n(x.volume)}</td><td className="r num">{pctTxt(x.ouverture)} %</td><td className="r num">{pctTxt(x.clic)} %</td>
                    <td className="r num muted">{F().eur(x.cout)}</td><td className="r num" style={{ color: 'var(--bony-orange)', fontWeight: 700 }}>{pctTxt(x.coutParContact, 3)} €</td></tr>))}</tbody></table></div>
            </> : <Empty t="Aucune volumétrie saisie. Renseignez volumétrie et taux dans les tâches SMS / E-mail des projets pour activer ces indicateurs." />}</div>
          <div className="dsh-g2">
            <div className="card dsh-card"><Head title="Top consommateurs" hint="Sites et prestataires, montants ventilés." />
              <div className="dsh-sub"><Icon name="building" size="sm" /> Sites</div>{charts.sites ? <Html html={charts.sites} /> : <Empty t="Aucune donnée." />}
              <div className="dsh-sub"><Icon name="handshake" size="sm" /> Prestataires</div>{charts.provs ? <Html html={charts.provs} /> : <Empty t="Aucun prestataire renseigné sur les tâches." />}</div>
            <div className="card dsh-card"><Head title="Charge de l’équipe" hint="Tâches encore ouvertes (à faire ou en cours), par personne." />
              {stats.chargeEquipe.length ? <div>{stats.chargeEquipe.map(({ userId, taches }) => { const u = userById[userId]; return (
                <div key={userId} className="dsh-team"><Av u={u} /><b className="ellipsis" style={{ fontSize: 14 }}>{u ? u.name : 'Utilisateur inconnu'}</b>
                  <div className="bar" style={{ height: 7 }}><i style={{ width: `${(taches / stats.chargeEquipe[0].taches) * 100}%` }} /></div><b className="num" style={{ textAlign: 'right' }}>{taches}</b></div>); })}</div>
                : <Empty t="Aucune tâche ouverte assignée." />}</div>
          </div>
        </>}
      </div></div>
    </div>
  );
}
