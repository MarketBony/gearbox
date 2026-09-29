import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { CongeJour, CongeType, CongeDemi, User } from '../../../types';
import {
  CONGES_LECTURE_ROLES, peutLireConges, peutGererConges, peutValiderConges, congeDecompteSolde,
  periodeCongesDe, bornesPeriodeConges, libellePeriodeConges,
} from '../../../constants';
import { useAuth } from '../../../contexts/AuthContext';
import { useCongesAcces, congesAccesStore } from '../../../services/congesAcces';
import { useWorkspace } from '../../store/workspace';
import {
  conges, setCongeJour, setCongePeriode, setCongeDroit, setCongeValidation, ajouterMembreConges, retirerMembreConges,
  type CongesData,
} from '../../store/collections';
import { gx, hud, Icon, Avatar, Seg, useCompact } from '../ui/kit';
import {
  type Tab, TAB_LABEL, TAB_SESSION, TYPES, typeOf, demiLabel, val, nf, P, isoOf, addM, todayIso, MONTHS, MSHORT, LETTER,
  WEEK_LETTERS, cap, worked, isWE, holiday, joursOuvres, daysOf, monthsOfPeriod, dateLong, droitDefaut, K, AbsAv, TypesGrid, Tabs,
} from './common';
import { PosePanel, ParticipantsPanel } from './panels';

// =====================================================================
// Rubrique « Congés » — transposition de maquettes/v2/js/apps/conges.js (même balisage, mêmes
// classes, CSS déjà chargée), sur les VRAIES données (`conges` de ui2/store/collections.ts).
// Parité avec pages/Conges.tsx : maquettes/ux/inventaires/conges.md.
//  - accès : rôles de `CONGES_LECTURE_ROLES` seulement (chef de site et externe : aucun appel
//    réseau, écran « Accès restreint ») ; rubrique réservée aux MEMBRES du périmètre et aux
//    gestionnaires (même formule que services/congesAcces.ts, store synchronisé après lecture) ;
//  - écriture : chacun SA ligne, les gestionnaires (Master, Administrator, Director) toutes ;
//    validation ✓ : Master et Director seulement (Administrator EXCLU, décision de Théo) ;
//  - comptage : `valeurJourConge`, jours chômés (`estChome`) exclus partout, solde = CP seuls,
//    période de référence juin → mai (`periodeCongesDe`, `bornesPeriodeConges`) ;
//  - fenêtre de lecture en années pleines, comme la page actuelle : changer de mois ne relance rien.
// =====================================================================

const SS = (k: string) => `gearbox_session_${k}`;
const ssGet = <T,>(k: string, d: T): T => { try { const v = sessionStorage.getItem(SS(k)); return v === null ? d : JSON.parse(v); } catch { return d; } };
const ssSet = (k: string, v: unknown) => { try { sessionStorage.setItem(SS(k), JSON.stringify(v)); } catch { /* navigation privée */ } };
const ORDER: Tab[] = ['planning', 'agenda', 'dash'];

type Pop =
  | { id: number; kind: 'cell'; u: string; iso: string; anchor: HTMLElement }
  | { id: number; kind: 'range'; u: string; a: string; b: string; days: string[]; anchor: HTMLElement }
  | { id: number; kind: 'day'; iso: string; anchor: HTMLElement };
type Side = { id: number; kind: 'pose'; pre: { u?: string; from?: string; to?: string } } | { id: number; kind: 'part' };
let seq = 0;

export default function CongesApp({ win, inst }: AppProps) {
  const { user } = useAuth();
  const uid = user?.id || '', role = user?.role;
  const lecture = peutLireConges(role), gestionnaire = peutGererConges(role), validateur = peutValiderConges(role);
  const acces = useCongesAcces();

  // --- navigation (mêmes clés de session que pages/Conges.tsx)
  const [tab, setTabS] = useState<Tab>(() => { const v = ssGet<string>('conges_onglet', 'planning'); return v === 'dashboard' ? 'dash' : v === 'agenda' ? 'agenda' : 'planning'; });
  const [annee, setAnnee] = useState<number>(() => ssGet('conges_annee', new Date().getFullYear()));
  const [mois, setMois] = useState<number>(() => ssGet('conges_mois', new Date().getMonth()));
  const [periode, setPeriode] = useState<number>(() => ssGet('conges_periode', periodeCongesDe(todayIso())));

  // --- données : fenêtre en années pleines couvrant le mois du planning ET la période
  const debut = `${Math.min(annee, periode)}-01-01`, fin = `${Math.max(annee, periode + 1)}-12-31`;
  const fresh = conges.useWhen(lecture, debut, fin);
  const last = useRef<CongesData | null | undefined>(undefined);
  if (fresh !== undefined) last.current = fresh;
  const data = fresh ?? last.current;                       // un changement de fenêtre ne remet pas l'écran en chargement
  const users = useWorkspace((s) => s.users);
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  /** Membres joints à leur fiche, tri alphabétique ; une ligne sans fiche est écartée (comme la page). */
  const lignes = useMemo(() => (data?.membres || []).map((id) => usersById.get(id)).filter((u): u is User => !!u).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [data, usersById]);
  const memberIds = useMemo(() => lignes.map((u) => u.id), [lignes]);
  const index = useMemo(() => {
    const m = new Map<string, Map<string, CongeJour>>();
    for (const j of data?.jours || []) { if (!m.has(j.userId)) m.set(j.userId, new Map()); m.get(j.userId)!.set(j.date, j); }
    return m;
  }, [data]);
  const get = useCallback((u: string, iso: string) => index.get(u)?.get(iso) || null, [index]);
  const droitDe = useCallback((u: string, p: number) => data?.droits?.find((d) => d.userId === u && d.periode === p)?.jours ?? droitDefaut, [data]);
  const peutEcrirePour = (u: string) => lecture && !!uid && (u === uid || gestionnaire);
  const nameOf = (u: string) => usersById.get(u)?.name || gx().data.user(u).name;

  // Même règle que services/congesAcces.ts ; le store de navigation suit ce que l'écran a lu.
  const visible = data ? data.membres.includes(uid) || gestionnaire : (acces.charge ? acces.visible || gestionnaire : true);
  useEffect(() => { if (data) congesAccesStore.set(data.membres, role, uid); }, [data?.membres]); // eslint-disable-line react-hooks/exhaustive-deps

  const appRef = useRef<HTMLDivElement>(null);
  const compact = useCompact(appRef as React.RefObject<HTMLElement>, 640);

  // --- écritures : bloquées pendant l'envoi ET jusqu'à la relecture (sinon le panneau montrerait l'ancien état)
  const [busy, setBusy] = useState(0), [awaiting, setAwaiting] = useState(false);
  const locked = busy > 0 || awaiting;
  const pulses = useRef<[string, string][]>([]);
  useEffect(() => { setAwaiting(false); }, [data]);
  useEffect(() => { if (!awaiting) return; const t = setTimeout(() => setAwaiting(false), 4000); return () => clearTimeout(t); }, [awaiting]);
  const run = async (call: () => Promise<unknown>, okMsg?: string, pulse: [string, string][] = []) => {
    setBusy((n) => n + 1);
    try { await call(); setAwaiting(true); pulses.current = pulse; if (okMsg) hud(okMsg); gx().emit?.('badges'); return true; }
    catch { return false; }                    // message déjà affiché par la couche d'écriture
    finally { setBusy((n) => n - 1); }
  };
  useLayoutEffect(() => {
    const L = pulses.current; if (!L.length || !appRef.current) return; pulses.current = [];
    for (const [u, iso] of L) {
      const k = appRef.current.querySelector(`tr[data-u="${u}"] td[data-d="${iso}"] .cng-k, [data-cell="${u}"][data-d="${iso}"] .cng-k`);
      if (k) gx().animate(k, [{ transform: 'scale(.5)', opacity: 0.3 }, { transform: 'none', opacity: 1 }], { spring: 'bouncy' });
    }
  }, [data]);

  // --- transitions : copie (fantôme) de l'ancienne vue, glissée avec la nouvelle
  const mainPane = useRef<HTMLDivElement>(null), mainGhost = useRef<HTMLDivElement>(null);
  const stagePane = useRef<HTMLDivElement>(null), stageGhost = useRef<HTMLDivElement>(null);
  const slides = useRef<{ which: 'main' | 'stage'; dir: number; old: HTMLElement }[]>([]);
  const prepSlide = (which: 'main' | 'stage', dir: number) => {
    const pane = (which === 'main' ? mainPane : stagePane).current, ghost = (which === 'main' ? mainGhost : stageGhost).current;
    if (!pane || !ghost || !dir) return;
    const old = pane.cloneNode(true) as HTMLElement; old.classList.add('out'); ghost.append(old);
    const src = pane.querySelectorAll<HTMLElement>('.scroll'), dst = old.querySelectorAll<HTMLElement>('.scroll');
    src.forEach((s, i) => { if (dst[i]) { dst[i].scrollTop = s.scrollTop; dst[i].scrollLeft = s.scrollLeft; } });
    slides.current.push({ which, dir, old });
  };
  const navAnim = useRef<{ ref: React.RefObject<HTMLElement>; dir: number } | null>(null);
  useLayoutEffect(() => {
    for (const s of slides.current.splice(0)) {
      const pane = (s.which === 'main' ? mainPane : stagePane).current, old = s.old;
      const a = gx().animate(old, [{ transform: 'none', opacity: 1 }, { transform: `translateX(${-s.dir * 26}%)`, opacity: 0 }], { spring: 'snappy', fill: 'forwards' });
      if (a) a.onfinish = () => old.remove();
      setTimeout(() => old.isConnected && old.remove(), 1200);
      if (pane) { pane.querySelectorAll<HTMLElement>('.scroll').forEach((x) => { x.scrollTop = 0; }); gx().animate(pane, [{ transform: `translateX(${s.dir * 34}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'snappy' }); }
    }
    const N = navAnim.current;
    if (N) { navAnim.current = null; if (N.ref.current) gx().animate(N.ref.current, [{ opacity: 0, transform: `translateX(${N.dir * 10}px)` }, { opacity: 1, transform: 'none' }], { spring: 'soft' }); }
  });

  // --- agenda : calage sur le mois courant (recalé sur quelques images, comme la page actuelle)
  const wantCal = useRef<'auto' | 'smooth' | null>(tab === 'agenda' ? 'auto' : null);
  useEffect(() => {
    const mode = wantCal.current; if (!mode || tab !== 'agenda' || !data) return; wantCal.current = null;
    const pane = mainPane.current; let n = 0;
    const step = () => {
      const c = pane?.querySelector<HTMLElement>('.cng-am.cur'), sc = pane?.querySelector<HTMLElement>('[data-ascroll]'); if (!c || !sc) return;
      if (mode === 'smooth') { sc.scrollTo({ top: c.offsetTop - 4, behavior: 'smooth' }); return; }
      if (Math.abs(sc.scrollTop - (c.offsetTop - 4)) > 2) sc.scrollTop = c.offsetTop - 4;
      if (++n < 5) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // --- panneau d'une case / d'un jour (popover dans la fenêtre)
  const [pop, setPop] = useState<Pop | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const closePop = useCallback(() => {
    const el = popRef.current;
    if (el && appRef.current) {
      const g = el.cloneNode(true) as HTMLElement; g.style.pointerEvents = 'none'; appRef.current.append(g);
      const a = gx().animate(g, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 120, fill: 'forwards' });
      if (a) a.onfinish = () => g.remove(); setTimeout(() => g.isConnected && g.remove(), 400);
    }
    setPop(null);
  }, []);
  useLayoutEffect(() => {
    const el = popRef.current, app = appRef.current; if (!pop || !el || !app) return;
    const r = pop.anchor.getBoundingClientRect(), a = app.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    let top = r.bottom - a.top + 6, below = true; if (top + h > a.height - 8) { top = Math.max(8, r.top - a.top - h - 6); below = false; }
    const left = Math.max(8, Math.min(r.left - a.left + r.width / 2 - w / 2, a.width - w - 8));
    el.style.top = top + 'px'; el.style.left = left + 'px';
    el.style.transformOrigin = `${Math.max(10, Math.min(w - 10, r.left - a.left + r.width / 2 - left))}px ${below ? 0 : '100%'}`;
    gx().animate(el, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy' });
  }, [pop?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pop) return;
    // Racine fantôme : la cible vue par `window` est l'hôte ; on lit le chemin composé.
    const away = (e: PointerEvent) => {
      const path = e.composedPath();
      if (popRef.current && path.includes(popRef.current)) return;
      if (path.some((n) => n instanceof Element && n.matches('.menu,.tip-bubble'))) return;
      closePop();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); } };
    addEventListener('pointerdown', away, true); addEventListener('keydown', key, true);
    return () => { removeEventListener('pointerdown', away, true); removeEventListener('keydown', key, true); };
  }, [pop, closePop]);

  const cellPop = (u: string, iso: string, anchor: HTMLElement) => {
    if (!worked(iso)) { const h = holiday(iso); hud(h ? `${h} — jour férié` : 'Week-end : rien à poser'); return; }
    setPop({ id: ++seq, kind: 'cell', u, iso, anchor });
  };
  const rangePop = (u: string, a: string, b: string, anchor: HTMLElement) => {
    const days = joursOuvres(a, b);
    if (!days.length) { hud('Aucun jour ouvré sur cette sélection'); return; }
    setPop({ id: ++seq, kind: 'range', u, a, b, days, anchor });
  };

  // --- écritures
  const setJour = (u: string, iso: string, type: CongeType | null, demi: CongeDemi) => run(() => setCongeJour(u, iso, type, demi), type ? undefined : 'Congé retiré', type ? [[u, iso]] : []);
  const pose = (u: string, days: string[], type: CongeType) => { const n = days.length; return run(() => setCongePeriode(u, days, type, null), `${n} jour${n > 1 ? 's' : ''} posé${n > 1 ? 's' : ''} · ${typeOf(type)?.s || type}`, days.map((d) => [u, d] as [string, string])); };

  // --- panneau latéral
  const [side, setSide] = useState<Side | null>(null), [sideOn, setSideOn] = useState(false);
  useEffect(() => { if (side && !sideOn) { const r = requestAnimationFrame(() => setSideOn(true)); return () => cancelAnimationFrame(r); } }, [side]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeSide = () => { const id = side?.id; setSideOn(false); setTimeout(() => setSide((s) => (s && s.id === id ? null : s)), 380); };
  const who = useMemo(() => lignes.filter((u) => peutEcrirePour(u.id)).map((u) => ({ id: u.id, name: u.name })), [lignes, uid, gestionnaire, lecture]); // eslint-disable-line react-hooks/exhaustive-deps
  const openPose = (pre: { u?: string; from?: string; to?: string } = {}) => {
    if (!lecture) return;
    if (!who.length) { hud('Vous ne faites pas partie du planning'); return; }
    closePop(); setSideOn(false); setSide({ id: ++seq, kind: 'pose', pre });
  };
  const openParticipants = () => { if (!gestionnaire) return; closePop(); setSideOn(false); setSide({ id: ++seq, kind: 'part' }); };
  const eligible = useMemo(() => users.filter((u) => CONGES_LECTURE_ROLES.includes(u.role)).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [users]);

  // --- navigation
  const mtRef = useRef<HTMLElement>(null), ptRef = useRef<HTMLElement>(null);
  const setMonth = (y: number, m: number) => { setAnnee(y); setMois(m); ssSet('conges_annee', y); ssSet('conges_mois', m); };
  const switchTab = (t: Tab) => {
    if (t === tab) return;
    closePop(); prepSlide('main', ORDER.indexOf(t) >= ORDER.indexOf(tab) ? 1 : -1);
    if (t === 'agenda') wantCal.current = 'auto';
    setTabS(t); ssSet('conges_onglet', TAB_SESSION[t]);
  };
  const goMonth = (dir: number) => {
    closePop();
    const m = new Date(annee, mois + dir, 1);
    if (tab !== 'planning') { setMonth(m.getFullYear(), m.getMonth()); return switchTab('planning'); }
    prepSlide('stage', dir); navAnim.current = { ref: mtRef, dir }; setMonth(m.getFullYear(), m.getMonth());
  };
  const openMonth = (iso: string) => { const d = P(iso); closePop(); setMonth(d.getFullYear(), d.getMonth()); if (tab === 'planning') return; switchTab('planning'); };
  const goPeriod = (dir: number) => {
    closePop(); prepSlide('main', dir); navAnim.current = { ref: ptRef, dir };
    const p = periode + dir; setPeriode(p); ssSet('conges_periode', p);
    if (tab === 'agenda' && p === periodeCongesDe(todayIso())) wantCal.current = 'auto';
  };
  const goTodayPeriod = () => {
    const cur = periodeCongesDe(todayIso());
    if (cur !== periode) { closePop(); prepSlide('main', Math.sign(cur - periode)); navAnim.current = { ref: ptRef, dir: Math.sign(cur - periode) }; setPeriode(cur); ssSet('conges_periode', cur); wantCal.current = 'auto'; }
    else wantCal.current = 'smooth';
  };
  useEffect(() => { win.setTitle('Congés', TAB_LABEL[tab]); }, [tab, win]);

  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input,textarea,select,.cng-side') || tab !== 'planning' || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); goMonth(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goMonth(1); }
  };

  // ================================================================ PLANNING
  const T = todayIso();
  const days = useMemo(() => daysOf(annee, mois), [annee, mois]);
  const dcls = (iso: string) => `${isWE(iso) ? 'we' : ''} ${holiday(iso) ? 'hol' : ''} ${iso === T ? 'today' : ''} ${P(iso).getDay() === 1 ? 'mon' : ''}`;
  const voidEl = (
    <div className="cng-void"><Icon name="users" /><b>Personne dans la rubrique pour l'instant.</b><span>{gestionnaire ? 'Utilisez « Participants » pour choisir qui apparaît dans le planning.' : 'Un administrateur doit vous ajouter au planning.'}</span></div>
  );

  // Glisser sur SA ligne = raccourci « poser une période » (maquette) ; un clic = panneau de la case.
  const onGridDown = (e: React.PointerEvent) => {
    const td = (e.target as HTMLElement).closest<HTMLElement>('td.c'); if (!td || e.button !== 0 || !td.closest('tbody')) return;
    const row = td.parentElement as HTMLElement, u = row.dataset.u!, cells = [...row.querySelectorAll<HTMLElement>('td.c')], i0 = cells.indexOf(td);
    if (!peutEcrirePour(u) || e.pointerType === 'touch') { const up0 = () => { removeEventListener('pointerup', up0); cellPop(u, td.dataset.d!, td); }; addEventListener('pointerup', up0); return; }
    e.preventDefault(); let i1 = i0;
    const paint = () => { const a = Math.min(i0, i1), b = Math.max(i0, i1); cells.forEach((c, i) => { c.classList.toggle('drag', i >= a && i <= b); c.classList.toggle('d0', i === a); c.classList.toggle('d1', i === b); }); };
    const mv = (ev: PointerEvent) => { const el = (gx().root.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('td.c'); if (el && el.parentElement === row) { const i = cells.indexOf(el); if (i !== i1) { i1 = i; paint(); } } };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      const a = Math.min(i0, i1), b = Math.max(i0, i1);
      setTimeout(() => cells.forEach((c) => c.classList.remove('drag', 'd0', 'd1')), a === b ? 0 : 900);
      if (a === b) cellPop(u, cells[a].dataset.d!, cells[a]); else rangePop(u, cells[a].dataset.d!, cells[b].dataset.d!, cells[b]);
    };
    paint(); addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };

  const grid = () => {
    if (!lignes.length) return voidEl;
    if (compact) return cards();
    const absent = days.map((iso) => (worked(iso) ? memberIds.filter((u) => get(u, iso)).length : 0));
    return (
      <div className="cng-gw scroll"><table className="cng-t" style={{ '--n': days.length } as React.CSSProperties}>
        <thead><tr><th className="nm"><span className="label">Collaborateur</span></th>{days.map((iso) => { const h = holiday(iso); return <th key={iso} className={`d ${dcls(iso)}`} data-tip={h || undefined}><span>{LETTER[P(iso).getDay()]}</span><b className="num">{P(iso).getDate()}</b></th>; })}<th className="tot"><span className="label">Total</span></th></tr></thead>
        <tbody onPointerDown={onGridDown}>{lignes.map((us) => {
          const u = us.id, ed = peutEcrirePour(u); let tot = 0;
          const cells = days.map((iso) => { const c = get(u, iso), w = worked(iso); if (c && w) tot += val(c); return <td key={iso} className={`c ${dcls(iso)} ${ed && w ? 'ed' : ''}`} data-d={iso}>{c && w ? <K c={c} /> : null}</td>; });
          return <tr key={u} data-u={u} className={u === uid ? 'me' : ''}><td className="nm"><div className="cng-nm"><Avatar uid={u} cls="sm" /><b className="ellipsis">{us.name}{u === uid ? ' (vous)' : ''}</b></div></td>{cells}<td className="tot num">{tot ? nf(tot) : <span className="faint">—</span>}</td></tr>;
        })}</tbody>
        <tfoot><tr><td className="nm"><span className="label">Absents / jour</span></td>{absent.map((n, i) => <td key={days[i]} className={`c ${dcls(days[i])}`}>{n ? <span className={`cng-abs num ${n >= 4 ? 'hi' : ''}`}>{n}</span> : null}</td>)}<td className="tot" /></tr></tfoot>
      </table></div>
    );
  };

  // --- cartes (fenêtre étroite / téléphone)
  const [openCards, setOpenCards] = useState<Set<string>>(() => new Set([uid]));
  const cardAnim = useRef<{ u: string; h: number } | null>(null);
  useLayoutEffect(() => {
    const A = cardAnim.current; if (!A) return; cardAnim.current = null;
    const nc = appRef.current?.querySelector<HTMLElement>(`.cng-card[data-u="${A.u}"]`);
    if (nc) gx().animate(nc, [{ height: A.h + 'px', overflow: 'hidden' }, { height: nc.offsetHeight + 'px', overflow: 'hidden' }], { spring: 'snappy' });
  });
  const toggleCard = (u: string, el: HTMLElement) => {
    cardAnim.current = { u, h: (el.parentElement as HTMLElement).getBoundingClientRect().height };
    setOpenCards((s) => { const n = new Set(s); if (n.has(u)) n.delete(u); else n.add(u); return n; });
  };
  const runsOf = (u: string) => {
    const out: { type: string; ok: boolean; demi: CongeDemi; a: string; b: string; n: number }[] = []; let cur: typeof out[number] | null = null;
    for (const iso of days) {
      if (!worked(iso)) continue;
      const c = get(u, iso);
      if (c && cur && cur.type === c.type && cur.ok === c.validated && !c.demi && !cur.demi) { cur.b = iso; cur.n += 1; continue; }
      if (cur) out.push(cur); cur = c ? { type: c.type, ok: c.validated, demi: c.demi, a: iso, b: iso, n: val(c) } : null;
    }
    if (cur) out.push(cur);
    return out;
  };
  const cards = () => {
    const lead = (P(days[0]).getDay() + 6) % 7;
    return (
      <div className="cng-cards scroll">{lignes.map((us, i) => {
        const u = us.id, open = openCards.has(u), runs = runsOf(u), tot = runs.reduce((s, r) => s + r.n, 0);
        return (
          <div key={u} className={`card cng-card enter ${open ? 'open' : ''}`} style={{ '--i': i } as React.CSSProperties} data-u={u}>
            <button className="cng-ch" onClick={(e) => toggleCard(u, e.currentTarget)}><Avatar uid={u} /><div className="grow" style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{us.name}{u === uid ? ' (vous)' : ''}</b></div><b className="num" style={{ color: 'var(--accent)' }}>{nf(tot)} j</b><Icon name="chevron" /></button>
            {runs.length ? <div className="cng-runs">{runs.map((r) => { const L = typeOf(r.type); const a = P(r.a), b = P(r.b); return <span key={r.a} className={`badge ${r.ok ? '' : 'pend'}`} style={{ '--c': L?.c } as React.CSSProperties}>{a.getDate()}{r.b > r.a ? '–' + b.getDate() : ''} {MSHORT[a.getMonth()]} · {L?.s || r.type}{r.demi ? ' ' + demiLabel(r.demi).toLowerCase() : ''}{r.ok ? '' : ' · en attente'}</span>; })}</div>
              : <div className="faint" style={{ fontSize: 12.5, fontStyle: 'italic' }}>Aucun congé ce mois-ci.</div>}
            {open ? <div className="cng-mini">{WEEK_LETTERS.map((x, k) => <span key={k}>{x}</span>)}{[...Array(lead)].map((_, k) => <i key={`l${k}`} />)}{days.map((iso) => { const c = get(u, iso); return (
              <button key={iso} className={`cng-mc ${isWE(iso) ? 'we' : ''} ${holiday(iso) ? 'hol' : ''} ${iso === T ? 'today' : ''}`} data-cell={u} data-d={iso} onClick={(e) => cellPop(u, iso, e.currentTarget)}>{P(iso).getDate()}{c && worked(iso) ? <K c={c} tip={false} /> : null}</button>
            ); })}</div> : null}
          </div>
        );
      })}</div>
    );
  };

  // ================================================================ AGENDA (douze mois, tout le monde mêlé)
  const agendaMonths = useMemo(() => monthsOfPeriod(periode).map(([y, m]) => {
    let sum = 0;
    const cells = daysOf(y, m).map((iso) => { const abs = worked(iso) ? memberIds.map((u) => get(u, iso)).filter((c): c is CongeJour => !!c) : []; abs.forEach((c) => (sum += val(c))); return { iso, abs }; });
    return { y, m, cells, sum, lead: (new Date(y, m, 1).getDay() + 6) % 7 };
  }), [periode, memberIds, get]);
  const agenda = () => {
    const now = new Date();
    return (
      <div className="scroll cng-scroll" data-ascroll>{lignes.length ? <div className="cng-agrid">{agendaMonths.map((M, i) => {
        const cur = M.m === now.getMonth() && M.y === now.getFullYear(), key = isoOf(new Date(M.y, M.m, 1));
        return (
          <div key={key} className={`card cng-am enter ${cur ? 'cur' : ''}`} style={{ '--i': i } as React.CSSProperties} data-m={key}>
            <div className="cng-amh"><b>{cap(MONTHS[M.m])} {M.y}</b><span className="faint" style={{ fontSize: 12.5 }}>{M.sum ? `${nf(M.sum)} jour${M.sum > 1 ? 's' : ''} posé${M.sum > 1 ? 's' : ''}` : 'personne d’absent'}</span><span className="grow" /><button className="icon-btn sm" data-tip="Ouvrir le planning du mois" onClick={() => openMonth(key)}><Icon name="chevron" size="sm" /></button></div>
            <div className="cng-amg">{WEEK_LETTERS.map((x, k) => <span key={k}>{x}</span>)}{[...Array(M.lead)].map((_, k) => <i key={`l${k}`} />)}{M.cells.map(({ iso, abs }) => { const hol = holiday(iso); return (
              <button key={iso} className={`cng-ad ${abs.length ? 'has' : ''} ${isWE(iso) ? 'we' : ''} ${hol ? 'hol' : ''} ${iso === T ? 'today' : ''}`} data-day={iso} data-tip={hol || undefined} disabled={!abs.length} onClick={(e) => setPop({ id: ++seq, kind: 'day', iso, anchor: e.currentTarget })}>
                <span className="top"><span className="n num">{P(iso).getDate()}</span>{abs.length ? <span className={`c num ${abs.length >= 4 ? 'hi' : ''}`}>{abs.length}</span> : null}</span>{hol ? <span className="hl">{hol}</span> : null}
                {abs.length ? <span className="cng-avs">{abs.slice(0, 4).map((c) => <AbsAv key={c.userId} c={c} />)}{abs.length > 4 ? <span className="cng-av more">+{abs.length - 4}</span> : null}</span> : null}
              </button>
            ); })}</div>
          </div>
        );
      })}</div> : voidEl}</div>
    );
  };

  // ================================================================ TABLEAU DE BORD (période de référence)
  const stats = useMemo(() => {
    const M = new Set(memberIds), { debut: a, fin: b } = bornesPeriodeConges(periode);
    const E = (data?.jours || []).filter((c) => M.has(c.userId) && c.date >= a && c.date <= b && worked(c.date));
    const byMonth = [...Array(12)].map(() => Object.fromEntries(TYPES.map((l) => [l.id, 0])) as Record<string, number>);
    const byUser: Record<string, Record<string, number>> = {}, cp: Record<string, number> = {}, byDay = new Map<string, CongeJour[]>(); let total = 0;
    for (const c of E) {
      const d = P(c.date), mi = (d.getFullYear() - periode) * 12 + d.getMonth() - 5, v = val(c);
      total += v;
      if (byMonth[mi]) byMonth[mi][c.type] = (byMonth[mi][c.type] || 0) + v;
      (byUser[c.userId] ??= {})[c.type] = (byUser[c.userId][c.type] || 0) + v;
      if (congeDecompteSolde(c.type)) cp[c.userId] = (cp[c.userId] || 0) + v;
      if (!byDay.has(c.date)) byDay.set(c.date, []); byDay.get(c.date)!.push(c);
    }
    const mTot = byMonth.map((o) => Object.values(o).reduce((s, v) => s + v, 0));
    const busiest = mTot.indexOf(Math.max(...mTot));
    const dayList = [...byDay.entries()].sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]));
    return { total, byMonth, mTot, busiest, byUser, cp, peak: dayList[0], heavy: dayList.filter(([, l]) => l.length >= 3).slice(0, 8) };
  }, [data, memberIds, periode]);
  const [editDroit, setEditDroit] = useState<{ u: string; v: string } | null>(null);
  const droitDone = useRef(false);
  const saveDroit = () => {
    if (!editDroit || droitDone.current) return; droitDone.current = true;
    const v = Number(editDroit.v.replace(',', '.')), u = editDroit.u; setEditDroit(null);
    if (Number.isFinite(v) && v >= 0 && v !== droitDe(u, periode)) void run(() => setCongeDroit(u, periode, v), `Droit : ${nf(v)} j`);
  };
  const dash = () => {
    const n = lignes.length; if (!n) return <div className="scroll cng-scroll">{voidEl}</div>;
    const s = stats, now = new Date();
    const kpi = (i: number, ic: string, t: string, v: React.ReactNode, sub: string, col: string) => <div className="card cng-kpi enter" style={{ '--i': i } as React.CSSProperties}><span className="label"><Icon name={ic} size="sm" /> {t}</span><span className="kpi-v num" style={{ color: col }}>{v}</span><span className="faint" style={{ fontSize: 12.5 }}>{sub}</span></div>;
    const bm = addM(new Date(periode, 5, 1), s.busiest), maxM = Math.max(1, ...s.mTot);
    const uTot = (u: string): number => Object.values<number>(s.byUser[u] || {}).reduce((a, b) => a + b, 0), maxU = Math.max(1, ...memberIds.map(uTot));
    const sold = lignes.map((us) => ({ us, taken: s.cp[us.id] || 0, dr: droitDe(us.id, periode) })).sort((a, b) => (a.dr - a.taken) - (b.dr - b.taken));
    return (
      <div className="scroll cng-scroll"><div className="cng-dash">
        <div className="cng-legal">Période de référence légale : du 1<sup>er</sup> juin {periode} au 31 mai {periode + 1}.</div>
        <div className="cng-kpis">
          {kpi(0, 'agenda', 'Jours posés', nf(s.total), `sur ${n} collaborateur${n > 1 ? 's' : ''}`, '#3b82f6')}
          {kpi(1, 'users', 'Moyenne / personne', nf(Math.round((s.total / n) * 10) / 10), 'jours sur la période', '#10b981')}
          {kpi(2, 'barchart', 'Mois le plus chargé', s.mTot[s.busiest] ? cap(MONTHS[bm.getMonth()]) : '—', s.mTot[s.busiest] ? `${nf(s.mTot[s.busiest])} jours posés` : 'aucun congé', '#f59e0b')}
          {kpi(3, 'alert', 'Pic d’absences', s.peak ? s.peak[1].length : '—', s.peak ? `le ${P(s.peak[0]).toLocaleDateString('fr-FR')}` : 'aucun congé', '#f43f5e')}
        </div>
        <div className="cng-g2">
          <div className="card cng-card2"><h3>Solde de congés payés<span className="faint">{droitDefaut} jours ouvrés par défaut{gestionnaire ? ' · modifiable au crayon' : ''} · seuls les CP décomptent</span></h3>
            {sold.map(({ us, taken, dr }) => { const rest = Math.round((dr - taken) * 10) / 10, col = rest < 0 ? 'var(--danger)' : rest <= 3 ? 'var(--warn)' : 'var(--info)', ed = editDroit?.u === us.id; return (
              <div key={us.id} className="cng-sold"><Avatar uid={us.id} cls="sm" /><b className="ellipsis">{us.name}</b>
                <span className="v num"><b style={{ color: 'var(--text)' }}>{nf(taken)}</b> / {ed
                  ? <input className="input num" inputMode="decimal" autoFocus value={editDroit!.v} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setEditDroit({ u: us.id, v: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveDroit(); if (e.key === 'Escape') { e.stopPropagation(); droitDone.current = true; setEditDroit(null); } }} onBlur={saveDroit} />
                  : nf(dr)} · <b style={{ color: rest < 0 ? 'var(--danger)' : 'inherit' }}>{nf(rest)} rest.</b>
                  {gestionnaire && !ed ? <button className="icon-btn sm" data-tip="Modifier le droit à congés payés de cette période" disabled={locked} onClick={() => { droitDone.current = false; setEditDroit({ u: us.id, v: nf(dr) }); }}><Icon name="edit" size="sm" /></button> : null}</span>
                <div className="bar"><i style={{ width: `${Math.min(100, dr > 0 ? (taken / dr) * 100 : 0)}%`, '--c': col } as React.CSSProperties} /></div></div>
            ); })}
          </div>
          <div className="card cng-card2"><h3>Répartition mensuelle<span className="faint">clic → planning du mois</span></h3>
            <div className="cng-mbars">{s.byMonth.map((o, i) => { const m = addM(new Date(periode, 5, 1), i), t = s.mTot[i], cur = m.getMonth() === now.getMonth() && m.getFullYear() === now.getFullYear(); return (
              <button key={i} className={`cng-mcol ${cur ? 'cur' : ''} ${i === s.busiest && t ? 'top' : ''}`} onClick={() => openMonth(isoOf(m))} data-tip={`${cap(MONTHS[m.getMonth()])} ${m.getFullYear()} : ${nf(t)} jours${t ? ' — ' + TYPES.filter((l) => o[l.id]).map((l) => `${l.s} ${nf(o[l.id])}`).join(', ') : ''}`}>
                <span className="v num">{t ? nf(t) : ''}</span><span className="bx"><span className="stk" style={{ height: `${Math.max(1.5, (t / maxM) * 100)}%`, animationDelay: `${i * 30}ms` }}>{TYPES.map((l) => (o[l.id] ? <i key={l.id} style={{ flex: o[l.id], '--c': l.c } as React.CSSProperties} /> : null))}</span></span><span className="l">{cap(MSHORT[m.getMonth()]).replace('.', '')}</span>
              </button>
            ); })}</div>
            <div className="row wrap" style={{ gap: 10, marginTop: 12, fontSize: 'var(--fs-13)' }}>{TYPES.map((l) => <span key={l.id} className="row" style={{ gap: 5 }}><i className="brand-dot" style={{ '--c': l.c } as React.CSSProperties} />{l.l}</span>)}</div>
          </div>
        </div>
        <div className="cng-g2">
          <div className="card cng-card2"><h3>Jours posés par collaborateur<span className="faint">tous types</span></h3>
            {[...lignes].sort((a, b) => uTot(b.id) - uTot(a.id)).map((us, i) => { const o: Record<string, number> = s.byUser[us.id] || {}; return (
              <div key={us.id} className="cng-hb"><div className="row" style={{ fontSize: 13 }}><Avatar uid={us.id} cls="sm" /><span className="grow ellipsis" style={{ fontWeight: 600 }}>{us.name}</span><b className="num">{nf(uTot(us.id))}</b></div>
                <div className="cng-hstk" style={{ width: `${Math.max(2, (uTot(us.id) / maxU) * 100)}%` }}>{TYPES.map((l) => (o[l.id] ? <i key={l.id} style={{ flex: o[l.id], '--c': l.c, animationDelay: `${i * 40}ms` } as React.CSSProperties} data-tip={`${l.l} : ${nf(o[l.id])} j`} /> : null))}</div></div>
            ); })}
          </div>
          <div className="card cng-card2"><h3>Journées les plus chargées<span className="faint">3 absents ou plus</span></h3>
            {s.heavy.length ? s.heavy.map(([iso, l]) => (
              <div key={iso} className="cng-busy" data-tip="Voir le planning du mois" onClick={() => openMonth(iso)}><div style={{ width: 44, textAlign: 'center', flex: 'none' }}><span className="label" style={{ fontSize: 9 }}>{MSHORT[P(iso).getMonth()]}</span><b className="num" style={{ display: 'block', fontSize: 17, lineHeight: 1.1 }}>{P(iso).getDate()}</b></div>
                <div className="grow" style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{cap(P(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div><div className="faint ellipsis" style={{ fontSize: 12.5 }}>{l.map((c) => nameOf(c.userId)).join(', ')}</div></div>
                <span className="badge" style={{ '--c': l.length >= 4 ? 'var(--danger)' : 'var(--accent)' } as React.CSSProperties}>{l.length}</span></div>
            )) : <div className="empty"><Icon name="check" />Aucune journée à 3 absents ou plus.</div>}
          </div>
        </div>
      </div></div>
    );
  };

  // ================================================================ panneaux surgissants
  const popContent = () => {
    if (!pop) return null;
    if (pop.kind === 'cell') {
      const { u, iso } = pop, c = get(u, iso), L = c ? typeOf(c.type) : undefined, ed = peutEcrirePour(u);
      return <>
        <div className="cng-pop-h"><Avatar uid={u} cls="sm" /><div className="grow" style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{nameOf(u)}</b><span className="faint" style={{ fontSize: 12 }}>{dateLong(iso)}</span></div>
          {c ? <span className="badge" style={{ '--c': c.validated ? 'var(--ok)' : 'var(--warn)' } as React.CSSProperties}>{c.validated ? 'Validé' : 'En attente'}</span> : null}</div>
        {ed ? <>
          {/* Changer de famille CONSERVE la demi-journée déjà posée (et le serveur garde la validation). */}
          <TypesGrid sel={c?.type} disabled={locked} onPick={(t) => { void setJour(u, iso, t, c?.demi ?? null); }} />
          {c ? <>
            <Seg value={(c.demi || 'J') as string} options={[['J', 'Journée'], ['AM', 'Matin'], ['PM', 'Après-midi']]} onChange={(v) => { if (!locked) void setJour(u, iso, c.type, v === 'J' ? null : (v as CongeDemi)); }} />
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {validateur ? <button className={`btn sm ${c.validated ? '' : 'primary'} grow`} disabled={locked} onClick={() => { void run(() => setCongeValidation(u, iso, !c.validated), c.validated ? 'Validation retirée' : 'Congé validé', [[u, iso]]); }}><Icon name="check" size="sm" />{c.validated ? 'Retirer la validation' : 'Valider ✓'}</button> : null}
              <button className="btn sm danger grow" disabled={locked} onClick={async () => { if (await setJour(u, iso, null, null)) closePop(); }}><Icon name="trash" size="sm" />Retirer ce congé</button>
            </div>
          </> : null}
        </> : c && L ? <>
          <div className="row" style={{ gap: 8 }}><span className="badge solid" style={{ '--c': L.c } as React.CSSProperties}>{L.s}</span><b>{L.l}</b><span className="faint">{demiLabel(c.demi)}</span></div>
          <div className="faint" style={{ fontSize: 12 }}>Lecture : vous ne pouvez modifier que votre propre ligne.</div>
        </> : <div className="faint">Aucun congé ce jour.</div>}
      </>;
    }
    if (pop.kind === 'range') {
      const { u, a, b, days: ds } = pop, A = P(a), B = P(b);
      return <>
        <div className="cng-pop-h"><Avatar uid={u} cls="sm" /><div className="grow" style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{nameOf(u)}</b><span className="faint" style={{ fontSize: 12 }}>{A.getDate()} {MSHORT[A.getMonth()]} → {B.getDate()} {MSHORT[B.getMonth()]}</span></div><span className="badge" style={{ '--c': 'var(--accent)' } as React.CSSProperties}>{ds.length} j ouvré{ds.length > 1 ? 's' : ''}</span></div>
        <TypesGrid disabled={locked} onPick={(t) => { closePop(); void pose(u, ds, t); }} />
        <div className="faint" style={{ fontSize: 12 }}>Week-ends et jours fériés sont automatiquement ignorés.</div>
      </>;
    }
    const { iso } = pop, h = holiday(iso), list = memberIds.map((u) => get(u, iso)).filter((c): c is CongeJour => !!c);
    return <>
      <div className="cng-pop-h"><div className="grow"><b>{dateLong(iso)}</b><div className="faint" style={{ fontSize: 12 }}>{h ? h + ' · ' : ''}{list.length} absent{list.length > 1 ? 's' : ''} sur {memberIds.length}</div></div></div>
      <div className="cng-list scroll">{list.map((c) => { const L = typeOf(c.type); return <div key={c.userId} className="list-row" style={{ padding: '4px 6px', minHeight: 36 }}><Avatar uid={c.userId} cls="sm" /><span className="grow ellipsis" style={{ fontWeight: 600 }}>{nameOf(c.userId)}</span><span className={`badge ${c.validated ? 'solid' : ''}`} style={{ '--c': L?.c } as React.CSSProperties}>{L?.s || c.type}{c.demi ? ' ' + demiLabel(c.demi).toLowerCase() : ''}</span></div>; })}</div>
      <button className="btn sm" onClick={() => openMonth(iso)}><Icon name="agenda" size="sm" />Voir dans le planning</button>
    </>;
  };

  // ================================================================ barre du haut, commandes
  const canPose = lecture && visible && lignes.length > 0 && (gestionnaire || memberIds.includes(uid));
  inst.command = (c: string) => { if (c === 'conge') openPose(); if (c?.startsWith?.('tab:')) { const t = c.slice(4) === 'dashboard' ? 'dash' : c.slice(4); if (ORDER.includes(t as Tab)) switchTab(t as Tab); } };
  inst.menus = () => ({
    'Fichier': [{ label: 'Poser une période…', icon: 'plus', disabled: !canPose || !who.length, action: () => openPose() }, { label: 'Participants…', icon: 'users', disabled: !gestionnaire, action: openParticipants }],
    'Présentation': [...ORDER.map((t) => ({ label: TAB_LABEL[t], checked: tab === t, action: () => switchTab(t) })), '-',
      { label: 'Mois précédent', icon: 'back', kbd: '←', action: () => goMonth(-1) }, { label: 'Mois suivant', icon: 'chevron', kbd: '→', action: () => goMonth(1) }],
  });

  const n = lignes.length;
  const sub = `${n} collaborateur${n > 1 ? 's' : ''} · ${tab === 'planning' ? `${cap(MONTHS[mois])} ${annee}` : `période ${libellePeriodeConges(periode)}`}`;
  const open = lecture && visible;
  const body = !lecture
    ? <div className="cng-void"><Icon name="lock" /><b>Accès restreint</b><span>Les congés ne sont accessibles ni aux externes ni aux chefs de site.</span></div>
    : data === undefined ? <div className="cng-void"><span>Chargement…</span></div>
      : data === null ? <div className="cng-void"><Icon name="alert" /><b>Congés indisponibles</b><span>Chargement impossible (serveur injoignable ?).</span></div>
        : !visible ? <div className="cng-void"><Icon name="lock" /><b>Vous ne faites pas partie du planning.</b><span>Un administrateur doit vous ajouter au planning.</span></div>
          : tab === 'planning' ? <div className="cng-stage"><div ref={stageGhost} style={{ display: 'contents' }} /><div className="cng-pane" ref={stagePane}>{grid()}</div></div>
            : tab === 'agenda' ? agenda() : dash();

  return (
    <div className="app cng" ref={appRef} tabIndex={-1} onKeyDown={onKey}>
      <div className="app-head cng-h">
        <div className="ah-t"><span className="ah-eye">Communauté</span><h1>Congés</h1><span className="sub">{sub}</span></div>
        <div className="ah-tabs"><Tabs className="cng-tabs" value={tab} onChange={switchTab} options={ORDER.map((t) => [t, TAB_LABEL[t]] as [Tab, React.ReactNode])} /></div>
        <div className="ah-f cng-acts">{open ? <>
          {gestionnaire ? <button className="btn" data-tip="Choisir qui apparaît dans la rubrique" onClick={openParticipants}><Icon name="users" size="sm" /><span className="lbl">Participants</span></button> : null}
          {canPose ? <button className="btn primary" onClick={() => openPose()}><Icon name="plus" size="sm" /><span className="lbl">Poser une période</span></button> : null}
        </> : null}</div>
      </div>
      <div className={`app-head2 cng-h2 ${open ? '' : 'hide'}`}>
        {tab === 'planning'
          ? <div><span className="label">Mois</span><div className="cng-nav"><button className="icon-btn" data-tip="Mois précédent (←)" onClick={() => goMonth(-1)}><Icon name="back" /></button><b ref={mtRef as React.RefObject<HTMLElement>}>{cap(MONTHS[mois])} {annee}</b><button className="icon-btn" data-tip="Mois suivant (→)" onClick={() => goMonth(1)}><Icon name="chevron" /></button></div></div>
          : <div><span className="label">Période de référence</span><div className="cng-nav"><button className="icon-btn" data-tip="Période précédente" onClick={() => goPeriod(-1)}><Icon name="back" /></button><b ref={ptRef as React.RefObject<HTMLElement>}>{libellePeriodeConges(periode)}</b><button className="icon-btn" data-tip="Période suivante" onClick={() => goPeriod(1)}><Icon name="chevron" /></button>{tab === 'agenda' ? <button className="btn sm" onClick={goTodayPeriod}>Aujourd’hui</button> : null}</div></div>}
        <span className="cng-sep" />
        <div className="cng-lgw"><span className="label">Légende · plein = validé</span><div className="cng-legend">
          {TYPES.map((l) => <span key={l.id} data-tip={l.l}><i style={{ '--c': l.c } as React.CSSProperties} />{l.s}<span className="t x">{l.s !== l.l ? '· ' + l.l : ''}</span></span>)}
          <span className="x"><i className="we" />Week-end / férié</span><span className="x"><i className="pend" style={{ '--c': 'var(--text-2)' } as React.CSSProperties} />pâle = en attente</span><span className="x"><i className="half" style={{ '--c': 'var(--text-2)' } as React.CSSProperties} />½ journée</span>
        </div></div>
      </div>
      <div className="cng-body">
        <div className="cng-main"><div ref={mainGhost} style={{ display: 'contents' }} /><div className="cng-pane" ref={mainPane}>{body}</div></div>
        <aside className={`cng-side ${sideOn ? 'on' : ''}`}>{side?.kind === 'pose'
          ? <PosePanel key={side.id} who={who} uid={uid} pre={side.pre} busy={locked} onPose={pose} onClose={closeSide} />
          : side?.kind === 'part' ? <ParticipantsPanel key={side.id} eligible={eligible} membres={data?.membres || []} busy={locked}
            onAdd={(id) => { void run(() => ajouterMembreConges(id)); }} onRemove={(id) => { void run(() => retirerMembreConges(id)); }} onClose={closeSide} /> : null}</aside>
      </div>
      {pop ? <div key={pop.id} className="cng-pop glass glass-strong" ref={popRef}>{popContent()}</div> : null}
    </div>
  );
}
