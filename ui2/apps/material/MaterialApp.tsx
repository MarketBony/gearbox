import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { Equipment, EquipmentBooking } from '../../../types';
import { useAuth } from '../../../contexts/AuthContext';
import { db } from '../../../services/dataService';
import { useEquipment, useBookings, updateBooking, deleteEquipment, bookings as bookingsRes } from '../../store/collections';
import { gx, hud, Icon, Seg, PickerBtn, useSheets, useCompact, useEngineEvent, bindSwipeWheel } from '../ui/kit';
import {
  P, addD, addM, diff, same, isWE, iso, isoAdd, MONTHS, DOW, cap, range, period, pack, colorOf, perOk,
  canManageCatalog, canBook as canBookRole, available, buildUsage, usedFrom,
  type View, type Period, type Item, type Seg as BarSeg, type Usage,
} from './logic';
import { BookingForm, EquipmentForm, type BookingPre, type Log } from './forms';

// =====================================================================
// Rubrique « Matériel » (Gestion Matériel) — transposition de maquettes/v2/js/apps/material.js
// (même balisage, mêmes classes), sur les VRAIES données : `useEquipment()` / `useBookings()`
// (ui2/store/collections.ts, rechargées sur leurs événements temps réel).
// Parité avec pages/Material.tsx : maquettes/ux/inventaires/materiel.md.
//  - onglets Planning / Inventaire, vue Semaine / Mois, filtre « Tout le matériel » ou un matériel :
//    MÊMES clés de session que la page actuelle (material_activeTab, _viewMode, _selectedEquipmentId) ;
//  - disponibilité : `getAvailability` de la page, reprise à l'identique (./logic.ts) ; le serveur
//    refait le contrôle (409) et fait foi ;
//  - réservations ouvertes à tout utilisateur qui a la rubrique ; catalogue : Master, Administrator,
//    Director (MANAGE_ROLES de routes/equipment.ts) ;
//  - le périmètre global de la coque filtre l'AFFICHAGE, jamais le calcul de disponibilité ;
//  - raccourcis de la maquette : glisser sur plusieurs jours = réservation pré-remplie, glisser une
//    barre = déplacement (même contrôle de stock que le formulaire, puis écriture PUT).
// =====================================================================

const SS = (k: string) => `gearbox_session_${k}`;
const ssGet = <T,>(k: string, d: T): T => { try { const v = sessionStorage.getItem(SS(k)); return v === null ? d : JSON.parse(v); } catch { return d; } };
const ssSet = (k: string, v: unknown) => { try { sessionStorage.setItem(SS(k), JSON.stringify(v)); } catch { /* navigation privée */ } };

type Tab = 'planning' | 'inventory';
interface PaneSpec { id: number; anchor: Date; view: View; enter?: { kind: 'slide' | 'zoom'; dir: number } }
interface Panes { cur: PaneSpec; old?: PaneSpec & { exit: { kind: 'slide' | 'zoom'; dir: number } } }
type Panel = { kind: 'booking'; pre: BookingPre; edit: EquipmentBooking | null; n: number } | { kind: 'equipment'; e: Equipment | null; n: number };
let paneSeq = 0, panelSeq = 0;

// ---------------------------------------------------------------- données communes aux vues
interface Ctx { eqById: Record<string, Equipment>; equipment: Equipment[]; eqSel: Equipment | undefined; usage: Usage; book: boolean }

/** Jauge du jour : un matériel filtré → libres / stock ; sinon unités sorties sur tout le catalogue. */
const Gauge: React.FC<{ day: string; withText: boolean; x: Ctx }> = ({ day, withText, x }) => {
  if (x.eqSel) {
    const eq = x.eqSel, used = usedFrom(x.usage, eq.id, day), tot = eq.totalQuantity || 1, free = Math.max(0, eq.totalQuantity - used);
    const cls = free === 0 ? 'full' : free <= Math.max(1, Math.floor(eq.totalQuantity / 4)) ? 'low' : 'ok';
    return <span className={`mat-g ${cls}`} data-tip={`${eq.name} : ${free} disponible${free > 1 ? 's' : ''} sur ${eq.totalQuantity}`}><span className="bar"><i style={{ width: `${Math.min(100, (used / tot) * 100)}%` }} /></span>{withText ? <span className="num">{free}/{eq.totalQuantity}</span> : null}</span>;
  }
  let used = 0, tot = 0; const out: string[] = [];
  for (const eq of x.equipment) { const u = usedFrom(x.usage, eq.id, day); used += Math.min(u, eq.totalQuantity); tot += eq.totalQuantity; if (u >= eq.totalQuantity) out.push(eq.name); }
  const p = tot ? (used / tot) * 100 : 0;
  return <span className={`mat-g ${out.length ? 'full' : p > 50 ? 'low' : 'ok'}`} data-tip={`${used} / ${tot} unités sorties${out.length ? ' · épuisé : ' + out.join(', ') : ''}`}><span className="bar"><i style={{ width: `${p}%` }} /></span>{out.length ? <span className="x">{out.length}</span> : withText ? <span className="num">{Math.round(p)} %</span> : null}</span>;
};

/** Barre de réservation : contenu de l'EventBar réel (« 2x Nom », site · service / « - site »). */
const Bar: React.FC<{ sg: BarSeg; kind: 'wk' | 'mo'; x: Ctx }> = ({ sg, kind, x }) => {
  const { b, c } = sg.it, name = x.eqById[b.equipmentId]?.name || 'Inconnu';
  const tip = `${name}${b.description ? ' · ' + b.description : ''} · ${b.site} · ${b.service} · ${range(b.startDate, b.endDate)} · ${b.quantity} unité${b.quantity > 1 ? 's' : ''}`;
  return (
    <div className={`mat-bar ${kind} ${sg.cl ? 'cl' : ''} ${sg.cr ? 'cr' : ''} ${x.book ? '' : 'ro'}`} data-bk={b.id} data-k={`${b.id}:${sg.a}`} data-tip={tip}
      style={{ '--c': c, gridColumn: `${sg.a + 1}/${sg.b + 2}`, gridRow: sg.lane + 1 } as React.CSSProperties}>
      {kind === 'mo'
        ? <><b className="ellipsis" style={{ fontSize: 12.5, display: 'inline' }}>{b.quantity}x {name}</b><span className="m ellipsis">- {b.site}</span></>
        : <><b className="ellipsis">{b.quantity}x {name}</b><span className="m ellipsis">{b.site} · {b.service}</span></>}
    </div>
  );
};

function WeekView({ per, its, x }: { per: Period; its: Item[]; x: Ctx }) {
  const T = gx().today(), days = [...Array(7)].map((_, i) => addD(per.s, i)), { segs, lanes } = pack(its, per.s, per.e);
  return (<>
    <div className="mat-dh mat-7">{days.map((d, i) => <div key={i} className={`mat-dhc ${same(d, T) ? 'today' : ''}`}><div className="t"><span>{DOW[i]}</span><b className="num">{d.getDate()}</b></div><Gauge day={iso(d)} withText x={x} /></div>)}</div>
    <div className="mat-wbody scroll"><div className={`mat-wrap ${x.book ? 'mat-ed' : ''}`}>
      <div className="mat-cols mat-7">{days.map((d) => <div key={iso(d)} className={`mat-col ${isWE(d) ? 'we' : ''} ${same(d, T) ? 'today' : ''}`} data-d={iso(d)} />)}</div>
      <div className="mat-wl" style={{ gridTemplateRows: `repeat(${Math.max(1, lanes)},50px)` }}>{segs.map((sg) => <Bar key={`${sg.it.b.id}:${sg.a}`} sg={sg} kind="wk" x={x} />)}</div>
    </div></div>
  </>);
}

function MonthView({ per, its, x, h }: { per: Period; its: Item[]; x: Ctx; h: number }) {
  const T = gx().today(), weeks = Math.round(diff(per.e, per.s) / 7), fit = Math.max(1, Math.floor(((h ? (h - 31) / weeks : 110) - 33) / 24));
  return (<>
    <div className="mat-mh mat-7">{DOW.map((d) => <span key={d}>{d}</span>)}</div>
    <div className="mat-mg" style={{ '--weeks': weeks } as React.CSSProperties}>
      {[...Array(weeks)].map((_, w) => {
        const s = addD(per.s, 7 * w), e = addD(s, 7), { segs, lanes } = pack(its, s, e);
        let shown = segs; const more: React.ReactNode[] = [];
        if (lanes > fit) {
          const capL = fit - 1; shown = segs.filter((q) => q.lane < capL);
          for (let d = 0; d < 7; d++) { const n = segs.filter((q) => q.lane >= capL && q.a <= d && q.b >= d).length; if (n) more.push(<button key={d} className="mat-more" data-more={iso(addD(s, d))} style={{ gridColumn: d + 1, gridRow: capL + 1 }}>+{n} autre{n > 1 ? 's' : ''}</button>); }
        }
        return (
          <div key={w} className="mat-mr">
            <div className={`mat-mbg mat-7 ${x.book ? 'mat-ed' : ''}`}>{[...Array(7)].map((__, d) => { const dd = addD(s, d), k = iso(dd); return <div key={k} className={`mat-mc ${isWE(dd) ? 'we' : ''} ${dd < per.m0! || dd >= per.m1! ? 'out' : ''} ${same(dd, T) ? 'today' : ''}`} data-d={k}><span className="dn num">{dd.getDate()}</span><Gauge day={k} withText={false} x={x} /></div>; })}</div>
            <div className="mat-mb">{shown.map((sg) => <Bar key={`${sg.it.b.id}:${sg.a}`} sg={sg} kind="mo" x={x} />)}{more}</div>
          </div>
        );
      })}
    </div>
  </>);
}

/** Liste (fenêtre étroite / téléphone) : la semaine montre ses 7 jours, le mois ses jours occupés. */
function ListView({ per, view, its, x }: { per: Period; view: View; its: Item[]; x: Ctx }) {
  const T = gx().today(), s = view === 'month' ? per.m0! : per.s, e = view === 'month' ? per.m1! : per.e, out: React.ReactNode[] = [];
  for (let d = s; d < e; d = addD(d, 1)) {
    const k = iso(d), act = its.filter((it) => it.s <= d && it.e >= d);
    if (!act.length && view === 'month' && !same(d, T)) continue;
    out.push(<div key={`h${k}`} className={`mat-lh ${same(d, T) ? 'today' : ''}`}><span className="grow">{same(d, T) ? 'Aujourd’hui' : cap(d.toLocaleDateString('fr-FR', { weekday: 'long' }))} <span className="faint" style={{ fontWeight: 500 }}>{d.getDate()} {MONTHS[d.getMonth()]}</span></span><Gauge day={k} withText x={x} />{x.book ? <button className="icon-btn sm" data-add={k} data-tip="Réserver ce jour"><Icon name="plus" size="sm" /></button> : null}</div>);
    if (act.length) act.forEach((it) => { const b = it.b; out.push(<button key={`${k}${b.id}`} className="mat-li" data-bkl={b.id} style={{ '--c': it.c } as React.CSSProperties}><div className="grow" style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{b.quantity}x {x.eqById[b.equipmentId]?.name}</b><div className="faint ellipsis" style={{ fontSize: 12 }}>{b.site} · {b.service} · {range(b.startDate, b.endDate)}{b.description ? ' · ' + b.description : ''}</div></div></button>); });
    else out.push(x.book ? <button key={`f${k}`} className="mat-free" data-add={k}>Libre — toucher pour réserver</button> : <div key={`f${k}`} className="mat-free">Aucun événement sur cette période.</div>);
  }
  return <div className="scroll" style={{ flex: 1, minHeight: 0 }}><div className="mat-list">{out.length ? out : <div className="empty"><Icon name="material" />Aucun événement sur cette période.</div>}</div></div>;
}

/** Volet du calendrier ; entre et sort avec les ressorts de la maquette (`swap`). */
const Pane: React.FC<{ spec: PaneSpec; exit?: { kind: 'slide' | 'zoom'; dir: number }; onGone: () => void; children: React.ReactNode }> = ({ spec, exit, onGone, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current, en = spec.enter; if (!el || !en) return;
    if (en.kind === 'zoom') gx().animate(el, [{ transform: `scale(${en.dir > 0 ? 1.08 : 0.92})`, opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'soft' });
    else gx().animate(el, [{ transform: `translateX(${en.dir * 40}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'snappy' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current; if (!el || !exit) return;
    const a = exit.kind === 'zoom'
      ? gx().animate(el, [{ transform: 'none', opacity: 1 }, { transform: `scale(${exit.dir > 0 ? 0.9 : 1.1})`, opacity: 0 }], { spring: 'soft', fill: 'forwards' })
      : gx().animate(el, [{ transform: 'none', opacity: 1 }, { transform: `translateX(${-exit.dir * 30}%)`, opacity: 0 }], { spring: 'snappy', fill: 'forwards' });
    if (a) a.onfinish = onGone;
    const t = setTimeout(onGone, 1300);
    return () => clearTimeout(t);
  }, [exit]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} className={`mat-pane ${exit ? 'out' : ''}`}>{children}</div>;
};

// ---------------------------------------------------------------- rubrique
export default function MaterialApp({ win, inst }: AppProps) {
  const { user } = useAuth();
  const role = user?.role, uid = user?.id || '';
  const mgr = canManageCatalog(role), book = canBookRole(role);
  const equipmentL = useEquipment(), bookingsL = useBookings();
  const equipment = equipmentL || [], bookings = bookingsL || [];

  const [tab, setTabS] = useState<Tab>(() => (ssGet<string>('material_activeTab', 'planning') === 'inventory' ? 'inventory' : 'planning'));
  const [eqRaw, setEqRaw] = useState<string>(() => ssGet<string>('material_selectedEquipmentId', 'All'));
  const [panes, setPanes] = useState<Panes>(() => ({ cur: { id: ++paneSeq, anchor: gx().today(), view: ssGet<string>('material_viewMode', 'week') === 'month' ? 'month' : 'week' } }));
  const [panel, setPanel] = useState<Panel | null>(null), [sideOn, setSideOn] = useState(false);
  const [stageH, setStageH] = useState(0);
  const { open: openSheet, portals } = useSheets(win);
  const rootRef = useRef<HTMLDivElement>(null), mainRef = useRef<HTMLDivElement>(null), stageRef = useRef<HTMLDivElement | null>(null), h2Ref = useRef<HTMLDivElement>(null), tabsRef = useRef<HTMLDivElement>(null);
  const compact = useCompact(rootRef as React.RefObject<HTMLElement>, 600);
  const { anchor, view } = panes.cur;
  const per = useMemo(() => period(anchor, view), [anchor, view]);

  const eqById = useMemo(() => Object.fromEntries(equipment.map((e) => [e.id, e])), [equipment]);
  // Filtre persistant sur un matériel supprimé : l'ancienne page affichait un planning vide sans
  // explication (inventaire § 11) — on revient à « Tout le matériel ».
  const eq = eqRaw !== 'All' && equipmentL && !eqById[eqRaw] ? '' : eqRaw === 'All' ? '' : eqRaw;
  const setEq = (v: string) => { setEqRaw(v || 'All'); ssSet('material_selectedEquipmentId', v || 'All'); };
  const usage = useMemo(() => buildUsage(bookings), [bookings]);
  const [tick, setTickV] = useState(0);
  const items = useMemo<Item[]>(() => bookings.filter((b) => eqById[b.equipmentId] && (!eq || b.equipmentId === eq) && perOk(b))
    .map((b) => ({ b, s: P(b.startDate), e: P(b.endDate < b.startDate ? b.startDate : b.endDate), c: colorOf(b) })), [bookings, eqById, eq, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const x: Ctx = { eqById, equipment, eqSel: eq ? eqById[eq] : undefined, usage, book };
  const findB = (id: string) => bookings.find((b) => b.id === id);

  // --- journal d'activité (mêmes libellés et entités que la page actuelle)
  // BESOIN: `logActivity(action, entity, entityName)` partagé (ui2/store/workspace.ts n'exporte que
  // celui des projets) — en attendant, même appel que pages/Material.tsx (écriture, pas lecture).
  const log: Log = useCallback((action, entity, entityName) => {
    if (user) db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: user.avatarColor || '#f75632', action, entity, entityName, timestamp: new Date().toISOString() } as any);
  }, [user]);

  // --- périmètre global changé : on referme le panneau et on redessine (maquette)
  useEngineEvent('ctx', () => { closePanel(); setTickV((n) => n + 1); });

  // --- hauteur du calendrier (nombre de lignes visibles par semaine en vue Mois)
  const roStage = useRef<ResizeObserver | null>(null);
  const stageCb = useCallback((el: HTMLDivElement | null) => {
    roStage.current?.disconnect(); stageRef.current = el; if (!el) return;
    roStage.current = new ResizeObserver(([e]) => setStageH(Math.round(e.contentRect.height))); roStage.current.observe(el);
  }, []);
  useEffect(() => () => roStage.current?.disconnect(), []);

  // --- FLIP des barres quand le contenu change sur place (filtre, enregistrement)
  const flip = useRef<Map<string, DOMRect> | null>(null);
  const curPane = () => stageRef.current?.querySelector<HTMLElement>('.mat-pane:not(.out)') || null;
  const capture = () => { const m = new Map<string, DOMRect>(); curPane()?.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => m.set(el.dataset.k!, el.getBoundingClientRect())); flip.current = m; };
  useLayoutEffect(() => {
    const F = flip.current; if (!F) return; flip.current = null;
    curPane()?.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => { const r = F.get(el.dataset.k!); if (r) gx().flip(el, r, { spring: 'soft' }); else gx().animate(el, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy' }); });
  }, [items]);

  // --- titre de période : même animation que `updTitle`
  const titleDir = useRef(0), titleEl = useRef<HTMLElement>(null), firstTitle = useRef(true);
  useLayoutEffect(() => {
    if (firstTitle.current) { firstTitle.current = false; return; }
    if (titleEl.current) gx().animate(titleEl.current, [{ opacity: 0, transform: `translateX(${titleDir.current * 10}px)` }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
  }, [per.title]);

  // --- navigation
  const go = (a: Date, v: View, kind: 'slide' | 'zoom', dir: number) => {
    titleDir.current = dir;
    setPanes(({ cur }) => ({ old: { ...cur, exit: { kind, dir } }, cur: { id: ++paneSeq, anchor: a, view: v, enter: { kind, dir } } }));
  };
  const nav = (dir: number) => {
    let n: Date;
    if (view === 'week') n = addD(anchor, 7 * dir);
    else { n = addM(anchor, dir); const T = gx().today(); if (n.getMonth() === T.getMonth() && n.getFullYear() === T.getFullYear()) n = T; }
    go(n, view, 'slide', dir);
  };
  // Pavé tactile : balayage horizontal à deux doigts = période suivante / précédente, comme l'Agenda
  // (demande de Théo, recette 30/09/2026) — UN pas par geste (kit).
  const navRef = useRef(nav); navRef.current = nav;
  useEffect(() => { const el = mainRef.current; if (!el || tab !== 'planning') return; return bindSwipeWheel(el, (d) => navRef.current(d)); }, [tab]);
  const goToday = () => {
    const T = gx().today(), p = per;
    if (T >= p.s && T < p.e && (!p.m0 || (T >= p.m0 && T < p.m1!))) {
      setPanes(({ cur, old }) => ({ old, cur: { ...cur, anchor: T } }));
      if (titleEl.current) gx().animate(titleEl.current, [{ transform: 'scale(1.06)' }, { transform: 'none' }], { spring: 'bouncy' });
      return;
    }
    go(T, view, 'slide', T < p.s ? -1 : 1);
  };
  const setView = (v: View) => { if (v === view) return; ssSet('material_viewMode', v); go(anchor, v, 'zoom', v === 'month' ? 1 : -1); };
  const switchTab = (t: Tab) => {
    if (t === tab) return; const dir = t === 'inventory' ? 1 : -1;
    setTabS(t); ssSet('material_activeTab', t); closePanel();
    setPanes(({ cur }) => ({ cur: { id: ++paneSeq, anchor: cur.anchor, view: cur.view } }));
    requestAnimationFrame(() => { const el = mainRef.current?.firstElementChild; if (el) gx().animate(el, [{ opacity: 0, transform: `translateX(${dir * 24}px)` }, { opacity: 1, transform: 'none' }], { spring: 'snappy' }); });
  };
  useLayoutEffect(() => { if (tabsRef.current?.parentElement) gx().ui.refresh(tabsRef.current.parentElement); }, [tab]);
  const filterEq = (v: string) => { capture(); setEq(v); };

  // --- panneau latéral
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const openPanel = (p: Panel) => { clearTimeout(closeTimer.current); setPanel(p); requestAnimationFrame(() => setSideOn(true)); };
  function closePanel() { setSideOn(false); clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setPanel(null), 380); }
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const quick = (b: EquipmentBooking, origin?: Element | null) => {
    const e = eqById[b.equipmentId], esc = gx().esc; if (!e) return;
    gx().shell?.quickLook?.({ title: `${b.quantity}x ${e.name}`, origin, html: `<div style="display:grid;gap:10px"><div class="row wrap">${gx().r.service(b.service)}${e.category ? `<span class="badge">${esc(e.category)}</span>` : ''}</div>
      <div class="row" style="gap:10px"><div class="card pad grow"><div class="label">Période</div><b>${esc(range(b.startDate, b.endDate))}</b></div><div class="card pad grow"><div class="label">Site</div><b>${esc(b.site)}</b></div></div>
      ${b.description ? `<div class="muted">${esc(b.description)}</div>` : ''}</div>` });
  };
  const openBooking = (pre: BookingPre = {}) => {
    const edit = pre.edit ? findB(pre.edit) : undefined;
    if (!book) { if (edit) quick(edit); else hud('Lecture seule'); return; }
    if (!equipment.length) { hud('Ajoutez d’abord du matériel dans l’Inventaire'); return; }
    if (pre.edit && !edit) return;
    // L'enregistrement est COPIÉ à l'ouverture (comme la modale) : supprimé ailleurs entre-temps, le
    // panneau reste une modification (le serveur répondra 404), jamais une création déguisée.
    openPanel({ kind: 'booking', pre, edit: edit || null, n: ++panelSeq });
  };
  const openEquipment = (id?: string) => { if (mgr) openPanel({ kind: 'equipment', e: (id && eqById[id]) || null, n: ++panelSeq }); };
  const afterCreate = (b: EquipmentBooking) => {
    // La nouvelle réservation est hors de la période affichée : on s'y rend (maquette).
    capture();
    if (!eq || eq === b.equipmentId) { if (P(b.startDate) >= per.e || P(b.endDate) < per.s) go(P(b.startDate), view, 'slide', 1); }
  };
  const removeEquipment = (id: string) => {
    const e = eqById[id]; if (!mgr || !e) return; const n = bookings.filter((b) => b.equipmentId === id).length;
    openSheet((close) => (<>
      <h3>Supprimer « {e.name} » ?</h3><div className="muted">Êtes-vous sûr de vouloir supprimer ce matériel ? Les réservations liées seront aussi supprimées{n ? ` (${n} réservation${n > 1 ? 's' : ''})` : ''}.</div>
      <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" style={{ background: 'var(--danger)' }} onClick={async () => {
        close();
        try {
          await deleteEquipment(id);
          // Cascade FK côté serveur : les réservations liées disparaissent aussi (comme la page).
          bookingsRes.set([], (L) => L.filter((b) => b.equipmentId !== id)); bookingsRes.reloadAll();
          log('a supprimé le matériel', 'equipment', e.name);
          if (eq === id) setEq(''); if (panel?.kind === 'equipment' && panel.e?.id === id) closePanel();
          hud('Matériel supprimé');
        } catch { /* message déjà affiché par la ressource */ }
      }}>Supprimer</button></div></>));
  };

  // --- gestes du planning (raccourcis de la maquette)
  const cellAt = (cx: number, cy: number) => (gx().root.elementFromPoint(cx, cy) as HTMLElement | null)?.closest?.<HTMLElement>('.mat-pane:not(.out) [data-d]') || null;
  const hl = (a: string, b: string, cls: 'sel' | 'tgt' | 'bad' | null) => {
    const p = curPane(); if (!p) return;
    (['sel', 'tgt', 'bad'] as const).forEach((c) => c !== cls && p.querySelectorAll('.' + c).forEach((q) => q.classList.remove(c)));
    p.querySelectorAll<HTMLElement>('[data-d]').forEach((q) => q.classList.toggle(cls || 'sel', !!cls && q.dataset.d! >= a && q.dataset.d! <= b));
  };
  const startCreate = (e: React.PointerEvent, cell: HTMLElement) => {
    const a = cell.dataset.d!; let b = a, moved = false;
    if (e.pointerType === 'touch') { addEventListener('pointerup', () => openBooking({ start: a, end: a }), { once: true }); return; }
    e.preventDefault(); stageRef.current?.classList.add('dragging'); hl(a, a, 'sel');
    const mv = (ev: PointerEvent) => { const c = cellAt(ev.clientX, ev.clientY); if (c && c.dataset.d !== b) { b = c.dataset.d!; moved = true; hl(a < b ? a : b, a < b ? b : a, 'sel'); } };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); stageRef.current?.classList.remove('dragging');
      const s = a < b ? a : b, en = a < b ? b : a; setTimeout(() => hl('', '', null), moved ? 500 : 0); openBooking({ start: s, end: en });
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
  const startMove = (e: React.PointerEvent, bar: HTMLElement) => {
    const b = findB(bar.dataset.bk!); if (!b) return;
    const sx = e.clientX, sy = e.clientY, can = book && e.pointerType !== 'touch';
    let moved = false, off = 0, ok = true, grab = '';
    const mv = (ev: PointerEvent) => {
      if (!can) return;
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      if (!moved) { moved = true; bar.classList.add('lift'); stageRef.current?.classList.add('dragging'); grab = cellAt(sx, sy)?.dataset.d || b.startDate; }
      const c = cellAt(ev.clientX, ev.clientY); if (!c) return;
      off = diff(P(c.dataset.d!), P(grab)); const ns = isoAdd(b.startDate, off), ne = isoAdd(b.endDate, off);
      ok = off === 0 || available(bookings, eqById[b.equipmentId], ns, ne, b.id) >= b.quantity; hl(ns, ne, ok ? 'tgt' : 'bad');
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      stageRef.current?.classList.remove('dragging'); bar.classList.remove('lift'); hl('', '', null);
      if (!moved) { if (book) openBooking({ edit: b.id }); else quick(b, bar); return; }
      if (!off) return;
      const ns = isoAdd(b.startDate, off), ne = isoAdd(b.endDate, off), e2 = eqById[b.equipmentId];
      if (!ok) {
        const d = available(bookings, e2, ns, ne, b.id);
        gx().animate(bar, [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'none' }], { duration: 380, easing: 'ease-out' });
        hud(`Stock insuffisant ! Disponible : ${d} / ${e2?.totalQuantity}`); return;
      }
      capture();
      updateBooking({ ...b, startDate: ns, endDate: ne })
        .then(() => { log('a modifié une réservation matériel', 'booking', e2?.name || 'Matériel'); hud(`Déplacée : ${range(ns, ne)}`); })
        .catch(() => { /* message déjà affiché ; la ressource revient à l'état serveur */ });
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    if (can) e.preventDefault();
  };
  const onMainDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (e.button !== 0 || compact || tab !== 'planning' || !t.closest('.mat-stage')) return;
    const bar = t.closest<HTMLElement>('[data-bk]'); if (bar) return startMove(e, bar);
    const cell = t.closest<HTMLElement>('[data-d]'); if (cell && book) startCreate(e, cell);
  };
  const onMainClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const ad = t.closest<HTMLElement>('[data-add]'); if (ad) return openBooking({ start: ad.dataset.add, end: ad.dataset.add });
    const bl = t.closest<HTMLElement>('[data-bkl]'); if (bl) { const b = findB(bl.dataset.bkl!); if (b) { if (book) openBooking({ edit: b.id }); else quick(b, bl); } return; }
    const mo = t.closest<HTMLElement>('[data-more]');
    if (mo) {
      const day = mo.dataset.more!, list = items.filter((it) => it.b.startDate <= day && it.b.endDate >= day);
      gx().menu.open([{ header: cap(gx().fmt.dateLong(P(day))) }, ...list.map((it) => ({ label: `${it.b.quantity}x ${eqById[it.b.equipmentId]?.name} · ${it.b.site}`, action: () => (book ? openBooking({ edit: it.b.id }) : quick(it.b, mo)) })),
        ...(book ? ['-', { label: 'Réserver ce jour…', icon: 'plus', action: () => openBooking({ start: day, end: day }) }] : [])], mo);
    }
  };
  const onMainMenu = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement, bar = t.closest<HTMLElement>('[data-bk]');
    if (bar) {
      e.preventDefault(); const b = findB(bar.dataset.bk!); if (!b) return; const nm = eqById[b.equipmentId]?.name;
      gx().menu.open([{ header: `${b.quantity}x ${nm}` }, { label: 'Aperçu rapide', icon: 'quicklook', action: () => quick(b, bar) }, { label: 'Modifier…', icon: 'edit', disabled: !book, action: () => openBooking({ edit: b.id }) },
        { label: `Voir seulement « ${nm} »`, icon: 'filter', action: () => filterEq(b.equipmentId) }, '-', { label: 'Supprimer…', icon: 'trash', disabled: !book, action: () => openBooking({ edit: b.id, askDelete: true }) }], { x: e.clientX, y: e.clientY });
    }
  };
  const onRowMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    gx().menu.open([{ label: 'Réserver…', icon: 'plus', disabled: !book, action: () => { switchTab('planning'); openBooking({ eq: id }); } }, { label: 'Voir le planning', icon: 'agenda', action: () => { setEq(id); switchTab('planning'); } }, '-',
      { label: 'Modifier…', icon: 'edit', disabled: !mgr, action: () => openEquipment(id) }, { label: 'Supprimer…', icon: 'trash', disabled: !mgr, action: () => removeEquipment(id) }], { x: e.clientX, y: e.clientY });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,textarea,select,.mat-side') || tab !== 'planning' || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); } if (e.key === 'ArrowRight') { e.preventDefault(); nav(1); }
    if (e.key === 't' || e.key === 'T') goToday();
  };
  const openEqPick = (el: HTMLElement) => {
    const cats = [...new Set(equipment.map((e) => e.category || 'Autre'))].sort((a, b) => a.localeCompare(b));
    gx().ui.pick(el, [{ items: [{ v: '', l: 'Tout le matériel' }] }, ...cats.map((c) => ({ label: c, items: equipment.filter((e) => (e.category || 'Autre') === c).map((e) => ({ v: e.id, l: e.name, hint: `stock ${e.totalQuantity}` })) }))],
      { multi: false, title: 'Matériel', selected: [eq], width: 290, onChange: (v: string[]) => filterEq(v[0] || '') });
  };

  // --- titre de la fenêtre, barre du haut, commandes
  useEffect(() => { win.setTitle('Matériel', tab === 'inventory' ? 'Inventaire' : view === 'week' ? 'Planning · semaine' : 'Planning · mois'); }, [tab, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const bookCmd = () => { if (tab !== 'planning') switchTab('planning'); openBooking(); };
  inst.command = (c: string) => { if (c === 'book' || c === 'new') bookCmd(); };
  inst.menus = () => ({
    'Fichier': [{ label: 'Réserver du matériel…', icon: 'plus', disabled: !book, action: bookCmd }, { label: 'Ajouter matériel…', icon: 'material', disabled: !mgr, action: () => { switchTab('inventory'); openEquipment(); } }],
    'Présentation': [{ label: 'Planning', checked: tab === 'planning', action: () => switchTab('planning') }, { label: 'Inventaire', checked: tab === 'inventory', action: () => switchTab('inventory') }, '-',
      { label: 'Semaine', checked: view === 'week', disabled: tab !== 'planning', action: () => setView('week') }, { label: 'Mois', checked: view === 'month', disabled: tab !== 'planning', action: () => setView('month') }, '-',
      { label: 'Aujourd’hui', icon: 'agenda', kbd: 'T', disabled: tab !== 'planning', action: goToday }, { label: 'Tout le matériel', checked: !eq, disabled: tab !== 'planning', action: () => filterEq('') }],
  });

  // --- rendu
  const filtered = gx().ctx.perimetre && gx().ctx.perimetre !== 'Tout le réseau';
  const paneContent = (spec: PaneSpec) => {
    const p = spec.id === panes.cur.id ? per : period(spec.anchor, spec.view);
    if (compact) return <ListView per={p} view={spec.view} its={items} x={x} />;
    return spec.view === 'week' ? <WeekView per={p} its={items} x={x} /> : <MonthView per={p} its={items} x={x} h={stageH} />;
  };
  const units = equipment.reduce((s, e) => s + e.totalQuantity, 0);
  const inv = (
    <div className="mat-inv scroll"><div className="mat-card enter">
      <div className="mat-card-h"><h2 className="mat-sec">Catalogue</h2><span className="faint">{mgr ? 'Ajout, modification et suppression : Master, Administrateur, Directeur' : 'Consultation · la gestion du catalogue est réservée aux Master, Administrateurs et Directeurs'}</span><span className="n"><b className="num">{equipment.length}</b>matériel{equipment.length > 1 ? 's' : ''} · {units} unités</span></div>
      <table className="tbl mat-tbl"><thead><tr><th>Nom du matériel</th><th className="cat">Catégorie</th><th className="c">Quantité Totale</th><th className="r">Actions</th></tr></thead><tbody>
        {equipment.length ? equipment.map((e, i) => (
          <tr key={e.id} className="enter" style={{ '--i': i } as React.CSSProperties} data-tip="Voir son planning" onClick={() => { setEq(e.id); switchTab('planning'); }} onContextMenu={(ev) => onRowMenu(ev, e.id)}>
            <td><b>{e.name}</b><div className="catm">{e.category || ''}</div></td><td className="cat">{e.category ? <span className="badge">{e.category}</span> : null}</td>
            <td className="c"><span className="qty num">{e.totalQuantity}</span></td>
            <td className="r">{mgr ? <span className="acts"><button className="icon-btn sm" data-tip="Modifier" onClick={(ev) => { ev.stopPropagation(); openEquipment(e.id); }}><Icon name="edit" size="sm" /></button><button className="icon-btn sm" data-tip="Supprimer" style={{ color: 'var(--danger)' }} onClick={(ev) => { ev.stopPropagation(); removeEquipment(e.id); }}><Icon name="trash" size="sm" /></button></span> : null}</td></tr>))
          : <tr><td colSpan={4}><div className="empty"><Icon name="material" />{equipmentL ? 'Aucun matériel dans le catalogue' : 'Chargement…'}</div></td></tr>}
      </tbody></table></div></div>
  );
  return (
    <div className="app mat" ref={rootRef} tabIndex={-1} onKeyDown={onKey}>
      <div className="app-head mat-h"><div className="ah-t"><span className="ah-eye">Outils</span><h1>Gestion Matériel</h1><span className="sub">Logistique événementielle · stock commun à tout le réseau</span></div>
        <div className="ah-tabs"><div className="tabs mat-tabs" ref={tabsRef}>
          <button data-v="planning" aria-selected={tab === 'planning'} onClick={() => switchTab('planning')}><Icon name="agenda" size="sm" /> Planning</button>
          <button data-v="inv" aria-selected={tab === 'inventory'} onClick={() => switchTab('inventory')}><Icon name="material" size="sm" /> Inventaire</button><span className="ink" /></div></div>
        <div className="ah-f acts">{tab === 'planning'
          ? (book ? <button className="btn primary" onClick={() => openBooking()}><Icon name="plus" size="sm" /><span className="lbl">Réserver</span></button> : <span className="badge" style={{ '--c': 'var(--danger)' } as React.CSSProperties}>Lecture seule</span>)
          : (mgr ? <button className="btn primary" onClick={() => openEquipment()}><Icon name="plus" size="sm" /><span className="lbl">Ajouter matériel</span></button> : null)}</div></div>
      <div ref={h2Ref} className={`app-head2 mat-h2 ${tab !== 'planning' ? 'hide' : ''}`}>{tab === 'planning' ? <>
        <div><span className="label">Période</span><div className="mat-per"><button className="icon-btn" data-tip="Précédent (←)" onClick={() => nav(-1)}><Icon name="back" /></button><button className="btn sm" onClick={goToday}>Aujourd’hui</button><b ref={titleEl}>{per.title}</b><button className="icon-btn" data-tip="Suivant (→)" onClick={() => nav(1)}><Icon name="chevron" /></button></div></div>
        <div><span className="label">Vue</span><Seg value={view} onChange={(v) => setView(v)} options={[['week', 'Semaine'], ['month', 'Mois']]} /></div>
        <span className="mat-sep" />
        <div><span className="label">Matériel</span><PickerBtn icon="filter" label={eq ? eqById[eq]?.name || 'Tout le matériel' : 'Tout le matériel'} active={!!eq} onClick={openEqPick} /></div>
        <div className="mat-notew"><span className="label">Disponibilité</span><span className="mat-note"><Icon name="info" size="sm" />{filtered ? `Périmètre ${gx().ctx.perimetre} · la jauge compte tout le réseau` : book ? 'Clic sur un jour pour réserver · jauge = unités sorties' : 'Lecture seule'}</span></div></> : null}</div>
      <div className="mat-body">
        <div className="mat-main" ref={mainRef} onPointerDown={onMainDown} onClick={onMainClick} onContextMenu={onMainMenu}>
          {tab === 'inventory' ? inv : <div className="mat-stage" ref={stageCb}>
            {panes.old ? <Pane key={panes.old.id} spec={panes.old} exit={panes.old.exit} onGone={() => setPanes((s) => (s.old ? { cur: s.cur } : s))}>{paneContent(panes.old)}</Pane> : null}
            <Pane key={panes.cur.id} spec={panes.cur} onGone={() => undefined}>{paneContent(panes.cur)}</Pane>
          </div>}
        </div>
        <aside className={`mat-side ${sideOn ? 'on' : ''}`}>
          {panel?.kind === 'booking' ? <BookingForm key={panel.n} pre={panel.pre} edit={panel.edit} equipment={equipment} bookings={bookings} defaultEq={eq} uid={uid} log={log} onClose={closePanel} onCreated={afterCreate} /> : null}
          {panel?.kind === 'equipment' ? <EquipmentForm key={panel.n} e={panel.e} equipment={equipment} log={log} onClose={closePanel} /> : null}
        </aside>
      </div>
      {portals}
    </div>
  );
}
