import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { Project } from '../../../types';
import { BRANDS, SERVICES, PROJECT_TYPES } from '../../../constants';
import { sitesDuProjet, groupeDuProjet } from '../../../utils/projet';
import { ferieDe } from '../../../lib/joursFeries';
import { useWorkspace, workspace } from '../../store/workspace';
import { gx, Icon, Seg, PickerBtn, useEngineStore, useEngineEvent, useCompact } from '../ui/kit';

// =====================================================================
// Rubrique « Agenda » — transposition de maquettes/v2/js/apps/agenda.js (même balisage, mêmes
// classes, CSS déjà chargée), sur les VRAIS projets de l'espace de travail (ui2/store/workspace.ts).
// Parité avec pages/Agenda.tsx : maquettes/ux/inventaires/agenda.md.
//  - LECTURE SEULE pour tout le monde : aucune écriture ; seule action = ouvrir le projet ;
//  - brouillons EXCLUS (CLAUDE.md) ; un projet Holding passe tous les filtres Marque, un projet
//    « Tous Services » tous les filtres Service (règles exactes de la page actuelle) ;
//  - cloisonnement : les projets viennent de `GET /projects`, déjà filtrés ET redactés par le
//    serveur pour un chef de site. Rien n'est filtré « par site » ici en plus pour lui ; le
//    périmètre GLOBAL de la coque (choix de l'utilisateur) s'applique comme dans la To-do ;
//  - montants et avancement = valeurs SERVEUR (`budgetActual`, `progress`), jamais recalculés ;
//  - fériés : `lib/joursFeries.ts` (la maquette en recopiait la liste).
// =====================================================================

// ---------------------------------------------------------------- dates
const P = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const okIso = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}/.test(s);
const addD = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addM = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const diff = (a: Date, b: Date) => Math.round((+a - +b) / 864e5);
const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const monday = (d: Date) => addD(d, -((d.getDay() + 6) % 7));
const isWE = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const holiday = (d: Date) => ferieDe(isoOf(d));
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MSHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DOW = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const isoWeek = (d: Date) => { const t = addD(d, 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(t.getFullYear(), 0, 4); return 1 + Math.round((diff(t, w1) - 3 + ((w1.getDay() + 6) % 7)) / 7); };
const today = (): Date => gx().today();

// ---------------------------------------------------------------- vues
type View = 'week' | 'month' | 'quarter' | 'semester' | 'year';
const VIEWS: Record<View, { l: string; s: string; n?: number }> = { week: { l: 'Semaine', s: 'Sem.' }, month: { l: 'Mois', s: 'Mois' }, quarter: { l: 'Trimestre', s: 'Trim.', n: 3 }, semester: { l: 'Semestre', s: '6 mois', n: 6 }, year: { l: 'Année', s: 'An' } };
const ORDER = Object.keys(VIEWS) as View[];
/** Même clé de session que pages/Agenda.tsx (`agenda_view`, libellés français). */
const FR_VIEW: Record<string, View> = { Semaine: 'week', Mois: 'month', Trimestre: 'quarter', Semestre: 'semester', 'Année': 'year' };
const BRAND_F = BRANDS as string[];                    // Renault, Dacia, Alpine, Nissan, Mobilize, Holding
const SERVICE_F = SERVICES as string[];                // VN, VO, APV, PR, Tous Services
const TYPE_F = PROJECT_TYPES as string[];

interface Per { s: Date; e: Date; m0?: Date; m1?: Date; kicker: string; title: string }
function period(view: View, a: Date): Per {
  if (view === 'week') {
    const s = monday(a), e6 = addD(s, 6);
    const title = s.getMonth() === e6.getMonth() ? `${s.getDate()} – ${e6.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`
      : s.getFullYear() === e6.getFullYear() ? `${s.getDate()} ${MSHORT[s.getMonth()]} – ${e6.getDate()} ${MSHORT[e6.getMonth()]} ${s.getFullYear()}`
        : `${s.getDate()} ${MSHORT[s.getMonth()]} ${s.getFullYear()} – ${e6.getDate()} ${MSHORT[e6.getMonth()]} ${e6.getFullYear()}`;
    return { s, e: addD(s, 7), kicker: `Semaine ${isoWeek(s)}`, title };
  }
  if (view === 'month') {
    const m0 = new Date(a.getFullYear(), a.getMonth(), 1), m1 = addM(m0, 1);
    return { s: monday(m0), e: addD(monday(addD(m1, -1)), 7), m0, m1, kicker: 'Mois', title: `${cap(MONTHS[m0.getMonth()])} ${m0.getFullYear()}` };
  }
  if (view === 'year') { const y = a.getFullYear(); return { s: new Date(y, 0, 1), e: new Date(y + 1, 0, 1), kicker: 'Janvier → décembre', title: `Année ${y}` }; }
  // Comme pages/Agenda.tsx : trimestre CALENDAIRE, semestre en janvier ou juillet.
  const n = VIEWS[view].n!, s = new Date(a.getFullYear(), Math.floor(a.getMonth() / n) * n, 1), last = addM(s, n - 1);
  return { s, e: addM(s, n), kicker: `${cap(MONTHS[s.getMonth()])}${s.getFullYear() !== last.getFullYear() ? ' ' + s.getFullYear() : ''} → ${MONTHS[last.getMonth()]} ${last.getFullYear()}`,
    title: `${view === 'quarter' ? 'Trimestre' : 'Semestre'} · début ${MONTHS[s.getMonth()]} ${s.getFullYear()}` };
}
/** Avancer d'une période ; si la période visée contient aujourd'hui, on s'y ancre. */
function shift(a: Date, view: View, dir: number) {
  let n: Date;
  if (view === 'week') n = addD(a, 7 * dir);
  else if (view === 'month') n = addM(a, dir);
  else if (view === 'year') n = new Date(a.getFullYear() + dir, 0, 1);
  else { const k = VIEWS[view].n!; n = addM(new Date(a.getFullYear(), Math.floor(a.getMonth() / k) * k, 1), dir * k); }
  const T = today(), p = period(view, n);
  return T >= p.s && T < p.e && view !== 'week' ? T : n;
}

// ---------------------------------------------------------------- données
interface It { p: Project; s: Date; e: Date; c: string }
interface Sg { it: It; a: number; b: number; vb: number; cl: boolean; cr: boolean; lane: number; wide?: boolean }
/** Rangement en couloirs : une barre prend le premier couloir libre (minSpan : largeur mini, frise). */
function pack(items: It[], s0: Date, e0: Date, minSpan = 1) {
  const N = diff(e0, s0);
  const segs: Sg[] = items.filter((it) => it.e >= s0 && it.s < e0).map((it) => {
    const a = Math.max(0, diff(it.s, s0)), b = Math.min(N - 1, diff(it.e, s0));
    return { it, a, b, vb: Math.min(N - 1, Math.max(b, a + minSpan - 1)), cl: it.s < s0, cr: it.e >= e0, lane: 0 };
  }).sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a) || x.it.p.name.localeCompare(y.it.p.name));
  const ends: number[] = [];
  segs.forEach((sg) => { let l = ends.findIndex((e) => e < sg.a); if (l < 0) { l = ends.length; ends.push(-1); } ends[l] = sg.vb; sg.lane = l; });
  return { segs, lanes: ends.length };
}
const D = () => gx().data;
const colorOf = (p: Project) => D().SERVICE_COLOR[(p.service || [])[0]] || D().SERVICE_COLOR['Tous Services'];
const sitesTxt = (p: Project) => groupeDuProjet(p) || sitesDuProjet(p).join(', ');
const actual = (p: Project) => p.budgetActual || 0;           // valeur serveur (somme des tâches)
const progress = (p: Project) => p.progress || 0;             // valeur serveur
const tipOf = (p: Project) => `${p.name} · ${gx().fmt.date(p.startDate)} → ${gx().fmt.date(p.endDate)} · ${(p.service || []).join(', ')} · ${sitesTxt(p)} · ${progress(p)} % · ${gx().fmt.eur(actual(p))}`;
const Check = ({ p }: { p: Project }) => (p.status === 'Done' || p.status === 'Archived' ? <Icon name="check" size="sm" /> : null);

interface Filters { brand: string | null; service: string | null; type: string | null }
/** Périmètre GLOBAL de la coque (même règle que la To-do). Chef de site : le serveur a déjà borné. */
function inGlobal(p: Project) {
  if (gx().ctx.site) return true;
  const per = gx().ctx.perimetre; if (!per || per === 'Tout le réseau') return true;
  if (per === 'Nissan') return (p.brands || []).includes('Nissan');
  const s = sitesDuProjet(p), plaque: string[] | undefined = D().PLAQUES[per];
  return !s.length || s.includes(per) || (!!plaque && s.some((x) => plaque.includes(x)));
}
function buildItems(projects: Project[], f: Filters): It[] {
  const out: It[] = [];
  for (const p of projects) {
    if (p.status === 'Draft') continue;                                        // brouillon : nulle part
    if (!inGlobal(p)) continue;
    if (f.brand && !(p.brands || []).includes(f.brand as any) && !(p.brands || []).includes('Holding')) continue;
    if (f.service && !(p.service || []).includes(f.service as any) && !(p.service || []).includes('Tous Services')) continue;
    if (f.type && p.projectType !== f.type) continue;
    if (!okIso(p.startDate) && !okIso(p.endDate)) continue;                    // sans date : aucune place dans le temps
    let s = P(okIso(p.startDate) ? p.startDate : p.endDate), e = P(okIso(p.endDate) ? p.endDate : p.startDate);
    if (e < s) [s, e] = [e, s];
    out.push({ p, s, e, c: colorOf(p) });
  }
  return out;
}

// ---------------------------------------------------------------- session (clés de pages/Agenda.tsx)
const SS = (k: string) => `gearbox_session_${k}`;
const ssGet = <T,>(k: string, d: T): T => { try { const v = sessionStorage.getItem(SS(k)); return v === null ? d : JSON.parse(v); } catch { return d; } };
const ssSet = (k: string, v: unknown) => { try { sessionStorage.setItem(SS(k), JSON.stringify(v)); } catch { /* navigation privée */ } };
const F_KEYS: Record<keyof Filters, string> = { brand: 'agenda_filterBrand', service: 'agenda_filterService', type: 'agenda_filterType' };
const fromAll = (v: string) => (v && v !== 'All' ? v : null);

// ---------------------------------------------------------------- barres
const Bar: React.FC<{ sg: Sg; kind: 'wk' | 'mo' | 'fr'; style: React.CSSProperties }> = ({ sg, kind, style }) => {
  const { p, c } = sg.it, pr = progress(p);
  return (
    <button className={`agd-bar ${kind} ${sg.cl ? 'cl' : ''} ${sg.cr ? 'cr' : ''}`} data-id={p.id} data-k={`${p.id}:${sg.a}`} style={{ '--c': c, ...style } as React.CSSProperties} data-tip={tipOf(p)}>
      {kind === 'wk' ? <>
        <span className="n"><span className="ellipsis">{p.name}</span><Check p={p} /></span>
        <span className="m ellipsis num">{gx().fmt.date(p.startDate)} → {gx().fmt.date(p.endDate)}</span>
        <span className="agd-pr"><span className="bar"><i style={{ width: `${pr}%`, '--c': c } as React.CSSProperties} /></span><b className="num">{pr} %</b><span className="num ellipsis">{gx().fmt.eur(actual(p))}</span></span>
      </> : kind === 'fr' ? <><span className="ellipsis">{p.name}</span>{sg.wide ? <span className="pc num">{pr} %</span> : null}</>
        : <span className="ellipsis">{p.name}</span>}
    </button>
  );
};

function Empty({ txt, its, per }: { txt: string; its: It[]; per: Per }) {
  const next = its.filter((it) => it.s >= per.e).sort((a, b) => +a.s - +b.s)[0], prev = its.filter((it) => it.e < per.s).sort((a, b) => +b.e - +a.e)[0];
  return (
    <div className="agd-empty"><Icon name="agenda" /><b>{txt}</b><span>{its.length ? 'Aucun projet ne tombe sur cette période.' : 'Aucun projet ne correspond aux filtres.'}</span>
      <div className="row">{prev ? <button className="btn sm" data-jump={isoOf(prev.s)}><Icon name="back" size="sm" />Précédent</button> : null}{next ? <button className="btn sm" data-jump={isoOf(next.s)}>Prochain projet <Icon name="chevron" size="sm" /></button> : null}</div></div>
  );
}

function WeekPane({ per, its }: { per: Per; its: It[] }) {
  const T = today(), days = [...Array(7)].map((_, i) => addD(per.s, i));
  const { segs, lanes } = pack(its, per.s, per.e);
  return <>
    <div className="agd-dh agd-7">{days.map((d, i) => { const h = holiday(d); return <div key={i} className={`agd-dhc ${isWE(d) ? 'we' : ''} ${same(d, T) ? 'today' : ''}`}><span>{DOW[i]}</span><b className="num">{d.getDate()}</b>{h ? <span className="hol" data-tip={h}>{h}</span> : null}</div>; })}</div>
    <div className="agd-wbody scroll"><div className="agd-wrap"><div className="agd-cols agd-7">{days.map((d, i) => <i key={i} className={`${isWE(d) || holiday(d) ? 'we' : ''} ${same(d, T) ? 'today' : ''}`} />)}</div>
      <div className="agd-wl" style={{ gridTemplateRows: `repeat(${Math.max(1, lanes)},74px)` }}>{segs.map((sg) => <Bar key={`${sg.it.p.id}:${sg.a}`} sg={sg} kind="wk" style={{ gridColumn: `${sg.a + 1}/${sg.b + 2}`, gridRow: sg.lane + 1 }} />)}</div></div></div>
    {segs.length ? null : <Empty txt="Aucun projet cette semaine" its={its} per={per} />}
  </>;
}

function MonthPane({ per, its, fit }: { per: Per; its: It[]; fit: number }) {
  const T = today(), weeks = Math.round(diff(per.e, per.s) / 7);
  let any = false;
  const rows = [...Array(weeks)].map((_, w) => {
    const s = addD(per.s, 7 * w), e = addD(s, 7), { segs, lanes } = pack(its, s, e);
    if (segs.length) any = true;
    let shown = segs; const more: React.ReactNode[] = [];
    if (lanes > fit) {
      const capL = fit - 1; shown = segs.filter((x) => x.lane < capL);
      for (let d = 0; d < 7; d++) { const n = segs.filter((x) => x.lane >= capL && x.a <= d && x.b >= d).length; if (n) more.push(<button key={`m${d}`} className="agd-more" data-more={isoOf(addD(s, d))} style={{ gridColumn: d + 1, gridRow: capL + 1 }}>+{n} autre{n > 1 ? 's' : ''}</button>); }
    }
    return (
      <div key={w} className="agd-mr"><div className="agd-mbg agd-7">{[...Array(7)].map((_, d) => {
        const x = addD(s, d), out = x < per.m0! || x >= per.m1!, hol = holiday(x);
        return <div key={d} className={`agd-mc ${isWE(x) ? 'we' : ''} ${out ? 'out' : ''} ${hol ? 'hol' : ''} ${same(x, T) ? 'today' : ''}`}><button className="agd-dn num" data-zoom={isoOf(x)} data-tip={`${hol ? hol + ' · ' : ''}Voir la semaine`}>{x.getDate() === 1 ? `1 ${MSHORT[x.getMonth()]}` : x.getDate()}</button></div>;
      })}</div><div className="agd-mb">{shown.map((sg) => <Bar key={`${sg.it.p.id}:${sg.a}`} sg={sg} kind="mo" style={{ gridColumn: `${sg.a + 1}/${sg.b + 2}`, gridRow: sg.lane + 1 }} />)}{more}</div></div>
    );
  });
  return <>
    <div className="agd-mh agd-7">{DOW.map((d) => <span key={d}>{d}</span>)}</div>
    <div className="agd-mg" style={{ '--weeks': weeks } as React.CSSProperties}>{rows}</div>
    {any ? null : <Empty txt="Aucun projet ce mois-ci" its={its} per={per} />}
  </>;
}

function FrisePane({ per, its, w }: { per: Per; its: It[]; w: number }) {
  const T = today(), N = diff(per.e, per.s), ppd = (w || 900) / N, minSpan = Math.max(1, Math.ceil(46 / ppd));
  const { segs, lanes } = pack(its, per.s, per.e, minSpan);
  const head: React.ReactNode[] = [], bg: React.ReactNode[] = [];
  let k = 0;
  for (let m = new Date(per.s); m < per.e; m = addM(m, 1), k++) {
    const a = diff(m, per.s), len = diff(addM(m, 1), m), px = len * ppd;
    const isCur = m.getMonth() === T.getMonth() && m.getFullYear() === T.getFullYear();
    head.push(<button key={k} className={`agd-fm ${isCur ? 'cur' : ''}`} data-month={isoOf(m)} style={{ left: `${(a / N) * 100}%`, width: `${(len / N) * 100}%` }} data-tip={`Voir ${MONTHS[m.getMonth()]} ${m.getFullYear()}`}>{px < 84 ? cap(MSHORT[m.getMonth()]) : cap(MONTHS[m.getMonth()])}<small>{m.getFullYear()}</small></button>);
    bg.push(<i key={`m${k}`} className={k % 2 ? 'alt' : ''} style={{ left: `${(a / N) * 100}%`, width: `${(len / N) * 100}%` }} />);
  }
  if (ppd >= 7) for (let i = 0; i < N; i++) { const d = addD(per.s, i); if (isWE(d) || holiday(d)) bg.push(<i key={`d${i}`} className="we" style={{ left: `${(i / N) * 100}%`, width: `${(1 / N) * 100}%` }} />); }
  const now = T >= per.s && T < per.e ? <div className="agd-now" style={{ left: `${((diff(T, per.s) + 0.5) / N) * 100}%` }} data-tip="Aujourd’hui" /> : null;
  return <>
    <div className="agd-fh">{head}</div>
    <div className="agd-fb scroll"><div className="agd-wrap"><div className="agd-fbg">{bg}{now}</div><div className="agd-fl" style={{ height: Math.max(1, lanes) * 34 }}>
      {segs.map((sg) => { const span = sg.vb - sg.a + 1; sg.wide = span * ppd > 120; return <Bar key={`${sg.it.p.id}:${sg.a}`} sg={sg} kind="fr" style={{ left: `calc(${(sg.a / N) * 100}% + 2px)`, width: `calc(${(span / N) * 100}% - 4px)`, top: sg.lane * 34 }} />; })}
    </div></div></div>
    {segs.length ? null : <Empty txt="Aucun projet sur la période" its={its} per={per} />}
  </>;
}

/** Fenêtre étroite / téléphone : liste chronologique (comme la liste mobile de CalendarGrid). */
function ListPane({ per, its, view }: { per: Per; its: It[]; view: View }) {
  const T = today();
  const row = (it: It, sub: string, key: string) => {
    const p = it.p, pr = progress(p);
    return (
      <button key={key} className="agd-li" data-id={p.id} data-k={key} style={{ '--c': it.c } as React.CSSProperties}>
        <div className="grow" style={{ minWidth: 0 }}><div className="row" style={{ gap: 6, fontWeight: 700 }}><span className="ellipsis">{p.name}</span><Check p={p} /></div><div className="faint ellipsis" style={{ fontSize: 12 }}>{sub}</div></div>
        <div style={{ textAlign: 'right', flex: 'none' }}><b className="num">{pr} %</b><div className="bar"><i style={{ width: `${pr}%`, '--c': it.c } as React.CSSProperties} /></div><div className="faint num" style={{ fontSize: 11, marginTop: 3 }}>{gx().fmt.eur(actual(p))}</div></div>
      </button>
    );
  };
  const out: React.ReactNode[] = [];
  if (view === 'week' || view === 'month') {
    const s = view === 'month' ? per.m0! : per.s, e = view === 'month' ? per.m1! : per.e;
    for (let d = s; d < e; d = addD(d, 1)) {
      const act = its.filter((it) => it.s <= d && it.e >= d).sort((a, b) => +a.s - +b.s || a.p.name.localeCompare(b.p.name));
      // La semaine montre ses 7 jours (« — » si vide), le mois seulement les jours occupés.
      if (!act.length && view !== 'week') continue;
      const t = same(d, T), hol = holiday(d), k = isoOf(d);
      out.push(<div key={`h${k}`} className={`agd-lh ${t ? 'today' : ''}`}>{t ? 'Aujourd’hui' : cap(d.toLocaleDateString('fr-FR', { weekday: 'long' }))}<span className="faint">{d.getDate()} {MONTHS[d.getMonth()]}{hol ? ' · ' + hol : ''}</span></div>);
      if (!act.length) { out.push(<div key={`n${k}`} className="agd-none">—</div>); continue; }
      for (const it of act) { const n = diff(it.e, it.s) + 1; out.push(row(it, `${n > 1 ? `Jour ${diff(d, it.s) + 1}/${n} · ` : ''}${(it.p.service || []).join(', ')} · ${sitesTxt(it.p)}`, `${it.p.id}:${k}`)); }
    }
  } else {
    for (let m = new Date(per.s); m < per.e; m = addM(m, 1)) {
      const m1 = addM(m, 1), act = its.filter((it) => it.s < m1 && it.e >= m).sort((a, b) => +a.s - +b.s);
      if (!act.length) continue;
      const k = isoOf(m);
      out.push(<div key={`h${k}`} className="agd-lh" data-month={k}>{cap(MONTHS[m.getMonth()])}<span className="faint">{m.getFullYear()} · {act.length} projet{act.length > 1 ? 's' : ''}</span></div>);
      for (const it of act) out.push(row(it, `${gx().fmt.date(it.p.startDate)} → ${gx().fmt.date(it.p.endDate)} · ${(it.p.service || []).join(', ')} · ${sitesTxt(it.p)}`, `${it.p.id}:${k}`));
    }
  }
  return out.length ? <div className="scroll" style={{ flex: 1, minHeight: 0 }}><div className="agd-list">{out}</div></div> : <Empty txt="Aucun événement sur cette période." its={its} per={per} />;
}

// ---------------------------------------------------------------- rubrique
type Kind = 'slide' | 'zoom' | 'inplace' | 'quiet';
const fitOf = (h: number, weeks: number) => Math.max(1, Math.floor(((h ? (h - 31) / weeks : 110) - 31) / 21));

export default function AgendaApp({ win, inst }: AppProps) {
  const projects = useWorkspace((s) => s.projects);
  const ready = useWorkspace((s) => s.ready);
  const [view, setViewS] = useState<View>(() => FR_VIEW[ssGet<string>('agenda_view', 'Semaine')] || 'week');
  // Date courante NON persistée : retour à aujourd'hui à chaque ouverture (comme la page actuelle).
  const [anchor, setAnchor] = useState<Date>(() => today());
  const [f, setF] = useState<Filters>(() => ({ brand: fromAll(ssGet('agenda_filterBrand', 'All')), service: fromAll(ssGet('agenda_filterService', 'All')), type: fromAll(ssGet('agenda_filterType', 'All')) }));
  const [showF, setShowF] = useEngineStore<boolean>('agd.filters', true);
  const [ctxTick, setCtxTick] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null), stageRef = useRef<HTMLDivElement>(null), paneRef = useRef<HTMLDivElement>(null), ghostRef = useRef<HTMLDivElement>(null), titleRef = useRef<HTMLSpanElement>(null);
  const compact = useCompact(rootRef as React.RefObject<HTMLElement>, 600);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const hovered = useRef<HTMLElement | null>(null), swiped = useRef(false);

  // --- transitions : l'ancienne vue est COPIÉE (fantôme) avant le changement, puis animée avec la nouvelle
  const trans = useRef<{ kind: Kind; dir: number; origin?: HTMLElement | null; old?: HTMLElement } | null>(null);
  const flipRects = useRef<Map<string, DOMRect> | null>(null);
  const titleAnim = useRef(false);
  const prepare = (kind: Kind, dir = 1, origin?: HTMLElement | null) => {
    const pane = paneRef.current, ghost = ghostRef.current; titleAnim.current = kind !== 'quiet';
    if (kind === 'quiet') return;
    if (!pane || !ghost) return;
    if (kind === 'inplace') { flipRects.current = new Map([...pane.querySelectorAll<HTMLElement>('[data-k]')].map((el) => [el.dataset.k!, el.getBoundingClientRect()])); return; }
    trans.current?.old?.remove();
    const old = pane.cloneNode(true) as HTMLElement; old.classList.add('out');
    old.style.transform = pane.style.transform; old.style.opacity = pane.style.opacity;
    pane.style.transform = ''; pane.style.opacity = '';
    ghost.append(old);
    const src = pane.querySelectorAll<HTMLElement>('.scroll'), dst = old.querySelectorAll<HTMLElement>('.scroll');
    src.forEach((s, i) => { if (dst[i]) dst[i].scrollTop = s.scrollTop; });
    trans.current = { kind, dir, origin, old };
  };
  useLayoutEffect(() => {
    const pane = paneRef.current, stage = stageRef.current;
    const T = trans.current;
    if (T && T.old && pane && stage) {
      trans.current = null;
      const old = T.old, from = old.style.transform || 'none';
      pane.querySelectorAll<HTMLElement>('.scroll').forEach((s) => (s.scrollTop = 0));
      let a: any;
      if (T.kind === 'slide') {
        a = gx().animate(old, [{ transform: from, opacity: 1 }, { transform: `translateX(${-T.dir * 32}%)`, opacity: 0 }], { spring: 'snappy', fill: 'forwards' });
        gx().animate(pane, [{ transform: `translateX(${T.dir * 42}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'snappy' });
      } else {
        if (T.origin && T.origin.isConnected !== false) { const r = T.origin.getBoundingClientRect(), s = stage.getBoundingClientRect(); const o = `${r.left + r.width / 2 - s.left}px ${r.top + r.height / 2 - s.top}px`; pane.style.transformOrigin = o; old.style.transformOrigin = o; }
        if (T.dir < 0) {   // vers une vue plus fine : la nouvelle vue jaillit de l'élément cliqué
          a = gx().animate(old, [{ transform: 'none', opacity: 1 }, { transform: 'scale(1.35)', opacity: 0 }], { spring: 'soft', fill: 'forwards' });
          gx().animate(pane, [{ transform: 'scale(.35)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'soft' });
        } else {           // vers une vue plus large : la vue actuelle se replie
          a = gx().animate(old, [{ transform: 'none', opacity: 1 }, { transform: 'scale(.72)', opacity: 0 }], { spring: 'soft', fill: 'forwards' });
          gx().animate(pane, [{ transform: 'scale(1.18)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'soft' });
        }
      }
      if (a) a.onfinish = () => old.remove();
      setTimeout(() => old.isConnected && old.remove(), 1400);
    }
    const F = flipRects.current;
    if (F && pane) {
      flipRects.current = null;
      pane.querySelectorAll<HTMLElement>('[data-k]').forEach((el, i) => {
        const r = F.get(el.dataset.k!);
        if (r) gx().flip(el, r, { spring: 'soft' });
        else gx().animate(el, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy', delay: Math.min(i, 12) * 12, fill: 'backwards' });
      });
    }
  });

  // --- périmètre global changé, données : re-rendu sur place
  useEngineEvent('ctx', () => { prepare('quiet'); setCtxTick((n) => n + 1); });
  const prevProjects = useRef(projects);
  if (prevProjects.current !== projects) { prevProjects.current = projects; if (paneRef.current && !trans.current && !flipRects.current) flipRects.current = new Map([...paneRef.current.querySelectorAll<HTMLElement>('[data-k]')].map((el) => [el.dataset.k!, el.getBoundingClientRect()])); }

  // --- taille de la scène : le mois dépend de sa hauteur, la frise de sa largeur (seuils de la maquette)
  useLayoutEffect(() => {
    const st = stageRef.current; if (!st) return; let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = st.clientWidth, h = st.clientHeight;
        setSize((pv) => {
          const nw = Math.abs(pv.w - w) > 30 || !pv.w ? w : pv.w;
          const nh = fitOf(pv.h, 5) !== fitOf(h, 5) || fitOf(pv.h, 6) !== fitOf(h, 6) ? h : pv.h;
          return nw === pv.w && nh === pv.h ? pv : { w: nw, h: nh };
        });
        gx().ui.refresh(rootRef.current?.querySelector('.agd-h'));
      });
    });
    ro.observe(st);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  const per = useMemo(() => period(view, anchor), [view, anchor]);
  const its = useMemo(() => buildItems(projects, f), [projects, f, ctxTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const nF = [f.brand, f.service, f.type].filter(Boolean).length;
  const inPer = useMemo(() => pack(its, per.m0 || per.s, per.m1 || per.e).segs.length, [its, per]);
  const weeks = Math.round(diff(per.e, per.s) / 7);
  const fit = fitOf(size.h, weeks);

  // --- en-tête
  const label = `${per.title} · ${per.kicker}`;
  const lastLabel = useRef(label);
  useLayoutEffect(() => {
    if (lastLabel.current !== label && titleAnim.current && titleRef.current) gx().animate(titleRef.current, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
    lastLabel.current = label; titleAnim.current = false;
  }, [label]);
  useEffect(() => { win.setTitle('Agenda', VIEWS[view].l); }, [view, win]);

  // --- actions
  const nav = (dir: number) => { prepare('slide', dir); setAnchor(shift(anchor, view, dir)); };
  const goToday = () => {
    const T = today();
    if (T >= per.s && T < per.e) { setAnchor(T); if (titleRef.current) gx().animate(titleRef.current, [{ transform: 'scale(1.06)' }, { transform: 'none' }], { spring: 'bouncy' }); return; }
    prepare('slide', T < per.s ? -1 : 1); setAnchor(T);
  };
  const setView = (v: View, origin?: HTMLElement | null, at?: Date) => {
    if (!VIEWS[v]) return;
    if (v === view) { if (at) { prepare('slide', 1); setAnchor(at); } return; }
    prepare('zoom', ORDER.indexOf(v) > ORDER.indexOf(view) ? 1 : -1, origin);
    if (at) setAnchor(at);
    setViewS(v); ssSet('agenda_view', VIEWS[v].l);
  };
  const jumpTo = (d: Date) => { prepare('slide', d < per.s ? -1 : 1); setAnchor(d); };
  const setFilter = (k: keyof Filters, v: string | null) => { prepare('inplace'); setF((x) => ({ ...x, [k]: v })); ssSet(F_KEYS[k], v || 'All'); };
  const resetFilters = () => { prepare('inplace'); setF({ brand: null, service: null, type: null }); (Object.keys(F_KEYS) as (keyof Filters)[]).forEach((k) => ssSet(F_KEYS[k], 'All')); };
  const toggleF = () => { prepare('quiet'); setShowF(!showF); };
  const navRef = useRef(nav); navRef.current = nav;

  /** Ouvre la fiche du projet dans sa fenêtre (« document » de la rubrique Projets). */
  const openProject = (id: string, el?: HTMLElement | null) => {
    const p = workspace.getState().byId[id]; if (!p) return;
    gx().wm.open('project', { id: p.id, title: p.name }, { origin: el });
  };
  const quickLook = (id: string, el?: HTMLElement | null) => {
    const p = workspace.getState().byId[id]; if (!p) return;
    const esc = gx().esc, F = gx().fmt, r = gx().r, pr = progress(p), c = colorOf(p);
    gx().shell?.quickLook?.({ title: p.name, origin: el, html: `<div style="display:grid;gap:12px">
      <div class="row wrap">${r.pStatus(p.status)}${(p.service || []).map((s) => r.service(s)).join('')}${r.brandChips(p.brands || [])}</div>
      <div class="muted">${esc(p.projectType)} · ${esc(sitesTxt(p))}</div>
      <div class="row" style="gap:10px"><div class="card pad grow"><div class="label">Dates</div><b>${F.dateY(p.startDate)} → ${F.dateY(p.endDate)}</b></div><div class="card pad grow"><div class="label">Budget réel</div><b class="num">${F.eur(actual(p))}</b> <span class="faint num">/ ${F.eur(p.budgetPlanned || 0)}</span></div></div>
      <div><div class="row"><span class="label grow">Avancement</span><b class="num">${pr} %</b></div><div class="bar" style="margin-top:6px"><i style="width:${pr}%;--c:${c}"></i></div></div>
      <div class="faint" style="font-size:12px">${(p.tasks || []).length} tâches · Espace ou Échap pour fermer · clic sur la barre pour ouvrir le projet</div></div>` });
  };
  const dayMenu = (iso: string, el: HTMLElement) => {
    const d = P(iso), act = its.filter((it) => it.s <= d && it.e >= d).sort((a, b) => +a.s - +b.s);
    gx().menu.open([{ header: cap(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })) + ` · ${act.length} projet${act.length > 1 ? 's' : ''}` },
      ...act.map((it) => ({ label: `${it.p.name}${(it.p.service || [])[0] ? ` (${it.p.service[0]})` : ''}`, action: () => openProject(it.p.id, el) })), '-',
      { label: 'Voir la semaine', icon: 'agenda', action: () => setView('week', el, d) }], el);
  };

  // --- filtres : sélecteurs MONO (comme les <Select> de la page actuelle)
  const FILTERS: Record<keyof Filters, { title: string; all: string; items: { v: string; l: string; color?: string; hint?: string }[] }> = {
    brand: { title: 'Marque', all: 'Toutes', items: BRAND_F.map((b) => ({ v: b, l: b, color: D().brand(b)?.hex, hint: b === 'Holding' ? 'toujours affiché' : '' })) },
    service: { title: 'Service', all: 'Tous', items: SERVICE_F.map((s) => ({ v: s, l: s, color: D().SERVICE_COLOR[s], hint: s === 'Tous Services' ? 'toujours affiché' : '' })) },
    type: { title: 'Objet', all: 'Tous', items: TYPE_F.map((t) => ({ v: t, l: t })) },
  };
  const openFilter = (k: keyof Filters, btn: HTMLElement) => {
    const F = FILTERS[k];
    gx().ui.pick(btn, [{ items: [{ v: '', l: F.all }, ...F.items] }], { multi: false, search: false, title: F.title, selected: [f[k] || ''], onChange: (v: string[]) => setFilter(k, v[0] || null) });
  };

  // --- scène : clics, menus, balayages
  const onStageClick = (e: React.MouseEvent) => {
    if (swiped.current) return;
    const t = e.target as HTMLElement;
    const bar = t.closest<HTMLElement>('[data-id]'); if (bar) return openProject(bar.dataset.id!, bar);
    const z = t.closest<HTMLElement>('[data-zoom]'); if (z) return setView('week', z, P(z.dataset.zoom!));
    const m = t.closest<HTMLElement>('[data-month]'); if (m) { const d = P(m.dataset.month!), T = today(); return setView('month', m, d.getMonth() === T.getMonth() && d.getFullYear() === T.getFullYear() ? T : d); }
    const mo = t.closest<HTMLElement>('[data-more]'); if (mo) return dayMenu(mo.dataset.more!, mo);
    const j = t.closest<HTMLElement>('[data-jump]'); if (j) return jumpTo(P(j.dataset.jump!));
  };
  const onStageMenu = (e: React.MouseEvent) => {
    const bar = (e.target as HTMLElement).closest<HTMLElement>('[data-id]'); e.preventDefault();
    if (!bar) return gx().menu.open([{ header: 'Présentation' }, ...ORDER.map((v, i) => ({ label: VIEWS[v].l, kbd: String(i + 1), checked: view === v, action: () => setView(v) })), '-', { label: 'Aujourd’hui', kbd: 'T', icon: 'agenda', action: goToday }], { x: e.clientX, y: e.clientY });
    const p = workspace.getState().byId[bar.dataset.id!]; if (!p) return;
    const svc = (p.service || [])[0];
    gx().menu.open([{ header: p.name }, { label: 'Ouvrir le projet', icon: 'projects', action: () => openProject(p.id, bar) }, { label: 'Aperçu rapide', icon: 'quicklook', kbd: 'Espace', action: () => quickLook(p.id, bar) }, '-',
      { label: 'Aller à la semaine de début', icon: 'agenda', disabled: !okIso(p.startDate), action: () => setView('week', bar, P(p.startDate)) }, { label: 'Aller au mois de début', disabled: !okIso(p.startDate), action: () => setView('month', bar, P(p.startDate)) },
      ...(svc ? ['-', { label: `Filtrer sur ${svc}`, icon: 'filter', action: () => setFilter('service', svc) }] : [])], { x: e.clientX, y: e.clientY });
  };
  useEffect(() => {
    const stage = stageRef.current; if (!stage) return;
    // Pavé tactile : balayage horizontal = période suivante / précédente
    let acc = 0, accT = 0, wheelAt = 0;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.3) return;
      acc += e.deltaX; clearTimeout(accT); accT = window.setTimeout(() => (acc = 0), 180);
      if (Math.abs(acc) > 110 && Date.now() - wheelAt > 550) { navRef.current(acc > 0 ? 1 : -1); acc = 0; wheelAt = Date.now(); }
    };
    // Doigt : la vue suit le doigt, puis bascule (ou revient en ressort)
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const pane = paneRef.current; if (!pane) return;
      const sx = e.clientX, sy = e.clientY; let dx = 0, on = false, dead = false;
      const mv = (ev: PointerEvent) => {
        const x = ev.clientX - sx, y = ev.clientY - sy;
        if (!on && !dead) { if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) dead = true; else if (Math.abs(x) > 12) { on = true; try { stage.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ } } }
        if (on) { dx = x; pane.style.transform = `translateX(${dx}px)`; pane.style.opacity = String(1 - Math.min(0.45, Math.abs(dx) / 700)); }
      };
      const up = () => {
        stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerup', up); stage.removeEventListener('pointercancel', up);
        if (!on) return; swiped.current = true; setTimeout(() => (swiped.current = false), 60);
        if (Math.abs(dx) > 64) navRef.current(dx < 0 ? 1 : -1);
        else { gx().animate(pane, [{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { spring: 'bouncy' }); pane.style.transform = ''; pane.style.opacity = ''; }
      };
      stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    };
    stage.addEventListener('wheel', wheel, { passive: true }); stage.addEventListener('pointerdown', down);
    return () => { stage.removeEventListener('wheel', wheel); stage.removeEventListener('pointerdown', down); clearTimeout(accT); };
  }, []);
  useEffect(() => () => gx().ui.closePick?.(), []);

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); nav(1); }
    else if (e.key === 't' || e.key === 'T') goToday();
    else if (/^[1-5]$/.test(e.key)) setView(ORDER[+e.key - 1]);
    else if (e.key === ' ' && hovered.current?.isConnected) { e.preventDefault(); quickLook(hovered.current.dataset.id!, hovered.current); }
  };

  // --- barre du haut et commandes (contrat du moteur)
  inst.command = (c: string) => {
    if (c === 'today') goToday();
    if (c?.startsWith?.('view:')) setView(c.slice(5) as View);
    if (c?.startsWith?.('date:') && okIso(c.slice(5))) { prepare('slide', 1); setAnchor(P(c.slice(5))); }
  };
  inst.menus = () => ({
    'Présentation': [...ORDER.map((v, i) => ({ label: VIEWS[v].l, kbd: String(i + 1), checked: view === v, action: () => setView(v) })), '-',
      { label: 'Aujourd’hui', icon: 'agenda', kbd: 'T', action: goToday }, { label: 'Période précédente', icon: 'back', kbd: '←', action: () => nav(-1) }, { label: 'Période suivante', icon: 'chevron', kbd: '→', action: () => nav(1) }, '-',
      { label: 'Afficher les filtres', icon: 'filter', checked: showF, action: toggleF }],
    'Filtres': [{ header: 'Marque' }, ...BRAND_F.map((b) => ({ label: b, checked: f.brand === b, action: () => setFilter('brand', f.brand === b ? null : b) })), '-',
      { header: 'Service' }, ...SERVICE_F.map((s) => ({ label: s, checked: f.service === s, action: () => setFilter('service', f.service === s ? null : s) })), '-',
      { header: 'Objet' }, ...TYPE_F.map((t) => ({ label: t, checked: f.type === t, action: () => setFilter('type', f.type === t ? null : t) })), '-',
      { label: 'Réinitialiser les filtres', icon: 'refresh', disabled: !nF, action: resetFilters }],
  });

  const site: string | null = gx().ctx.site;
  const content = !ready
    ? <div className="agd-empty"><Icon name="agenda" /><b>Chargement…</b></div>
    : compact ? <ListPane per={per} its={its} view={view} />
      : view === 'week' ? <WeekPane per={per} its={its} />
        : view === 'month' ? <MonthPane per={per} its={its} fit={fit} />
          : <FrisePane per={per} its={its} w={size.w} />;

  return (
    <div className="app agd" ref={rootRef} tabIndex={-1} onKeyDown={onKey}>
      <div className="app-head agd-h">
        <div className="ah-t"><span className="ah-eye">Outils</span><h1>Agenda</h1><span className="sub" ref={titleRef}>{label}</span></div>
        <div className="ah-tabs"><Seg className="agd-seg" value={view} onChange={(v) => setView(v)} options={ORDER.map((v) => [v, <><span className="l">{VIEWS[v].l}</span><span className="s">{VIEWS[v].s}</span></>] as [View, React.ReactNode])} /></div>
        <div className="ah-f"><div className="agd-nav"><button className="icon-btn" data-tip="Période précédente (←)" onClick={() => nav(-1)}><Icon name="back" /></button><button className="btn sm" onClick={goToday}>Aujourd’hui</button><button className="icon-btn" data-tip="Période suivante (→)" onClick={() => nav(1)}><Icon name="chevron" /></button></div>
          <button className="btn sm agd-ftog" aria-pressed={showF} data-tip="Afficher / masquer les filtres" onClick={toggleF}><Icon name="filter" size="sm" /><span className="lbl">Filtres</span>{nF ? <span className="count">{nF}</span> : null}</button></div>
      </div>
      <div className={`app-head2 agd-sub ${showF ? '' : 'hide'}`}>
        <div><span className="label">Marque</span><PickerBtn icon="car" label={f.brand || 'Toutes'} active={!!f.brand} onClick={(el) => openFilter('brand', el)} /></div>
        <div><span className="label">Service</span><PickerBtn icon="layers" label={f.service || 'Tous'} active={!!f.service} onClick={(el) => openFilter('service', el)} /></div>
        <div><span className="label">Objet</span><PickerBtn icon="target" label={f.type || 'Tous'} active={!!f.type} onClick={(el) => openFilter('type', el)} /></div>
        {nF ? <button className="btn sm ghost" onClick={resetFilters}><Icon name="close" size="sm" />Effacer</button> : null}
        <span className="agd-sep" />
        <div className="agd-lgw"><span className="label">Couleur des barres = service</span><div className="agd-lgs">{SERVICE_F.map((s) => (
          <button key={s} className="agd-lg" aria-pressed={f.service === s} data-tip={`Clic : filtrer sur ${s}`} style={{ '--c': D().SERVICE_COLOR[s] } as React.CSSProperties} onClick={() => setFilter('service', f.service === s ? null : s)}><i /><span>{s}</span></button>
        ))}</div></div>
        <div className="agd-cntw"><span className="label">{site ? `${site} · lecture seule` : 'Sur la période'}</span><span className="agd-cnt"><b className="num">{inPer}</b>projet{inPer > 1 ? 's' : ''} · brouillons exclus</span></div>
      </div>
      <div className="agd-stage" ref={stageRef} onClick={onStageClick} onContextMenu={onStageMenu} onPointerOver={(e) => { hovered.current = (e.target as HTMLElement).closest<HTMLElement>('[data-id]'); }}>
        <div ref={ghostRef} style={{ display: 'contents' }} />
        <div className="agd-pane" ref={paneRef}>{content}</div>
      </div>
    </div>
  );
}
