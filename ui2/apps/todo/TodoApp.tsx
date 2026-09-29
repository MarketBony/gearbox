import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { Project, Task, TaskStatus } from '../../../types';
import { BRANDS, SERVICES, TASK_CHANNELS, canEditProjects } from '../../../constants';
import { useAuth } from '../../../contexts/AuthContext';
import { useWorkspace, mutateTask, updateStandalone, createStandalone, deleteStandalone } from '../../store/workspace';
import { gx, hud, Icon, Chips, Seg, PickerBtn, ServiceBadge, BrandChips, useSheets, useEngineStore, useEngineEvent } from '../ui/kit';

// =====================================================================
// Rubrique « To-do » — transposition de maquettes/v2/js/apps/todo.js (même balisage, mêmes
// classes, même CSS), sur les VRAIES données de l'espace de travail (ui2/store/workspace.ts).
// Parité avec pages/TodoList.tsx : maquettes/ux/inventaires/todo.md.
//  - uniquement les tâches ASSIGNÉES à moi : tâches des projets Actifs ou Brouillons dont la fin
//    n'est pas passée (Brouillon inclus : exception voulue, CLAUDE.md) + tâches LIBRES, qui ne
//    disparaissent que terminées ET échues ; « Vierge » masqué ;
//  - date de référence = échéance de la tâche, sinon fin du projet ;
//  - déplacer une tâche de projet = une écriture du projet par la file de sauvegarde (plus de
//    relecture de TOUS les projets comme l'ancienne page) ; tâche libre = `/api/tasks`.
// =====================================================================

type ColKey = 'Todo' | 'InProgress' | 'Programmed' | 'Done';
const COLS: [ColKey, string, string][] = [['Todo', 'À faire', 'var(--info)'], ['InProgress', 'En cours', 'var(--bony-orange)'], ['Programmed', 'Programmé', 'var(--bony-violet)'], ['Done', 'Terminé', 'var(--ok)']];
const FILTER_SERVICES = SERVICES.filter((s) => s !== 'Tous Services');          // comme TodoList.tsx
const FORM_SERVICES = SERVICES as string[];                                       // formulaire : complet
const brandLabel = (b: string) => (b === 'Holding' ? 'GROUPE BONY' : b);

interface Item { id: string; t: Task; p: Project | null; sites: string[]; brands: string[]; services: string[]; ref: string; start: string; noDate: boolean }
interface Filters { q: string; sites: string[]; brands: string[]; services: string[]; from: string; to: string }
const F0: Filters = { q: '', sites: [], brands: [], services: [], from: '', to: '' };

const todayIso = () => gx().iso(gx().today());
const daysTo = (d: string) => Math.round((+new Date(d) - +gx().today()) / 864e5);
const sitesOf = (p: Project) => (p.sites && p.sites.length ? p.sites : p.site ? [p.site] : []);

function buildItems(projects: Project[], standalone: Task[], uid: string): Item[] {
  const out: Item[] = [], T = todayIso();
  for (const p of projects) {
    if (!(p.status === 'Active' || p.status === 'Draft') || p.endDate < T) continue;
    for (const t of p.tasks || []) if (t.assignedUserId === uid && t.status !== 'Empty')
      out.push({ id: t.id, t, p, sites: sitesOf(p), brands: p.brands || [], services: p.service || [], ref: t.deadline || p.endDate, start: p.startDate, noDate: false });
  }
  for (const t of standalone) {
    if (t.assignedUserId !== uid) continue;
    if (t.status === 'Done' && t.deadline && t.deadline < T) continue;
    out.push({ id: t.id, t, p: null, sites: t.sites || [], brands: t.brands || [], services: t.service || [], ref: t.deadline || '9999-12-31', start: t.deadline || T, noDate: !t.deadline });
  }
  return out;
}
function inGlobal(it: Item) {
  const per = gx().ctx.perimetre; if (!per || per === 'Tout le réseau') return true;
  if (per === 'Nissan') return it.brands.includes('Nissan');
  return !it.sites.length || it.sites.includes(per);
}
function urgency(it: Item) {
  if (it.noDate) return { txt: 'Sans échéance', cls: 'none', edge: '' };
  const d = daysTo(it.ref), left = `${d} j restant${d > 1 ? 's' : ''}`;
  if (d < 0) return { txt: `Expiré il y a ${-d} j`, cls: 'late', edge: 'r' };
  if (d <= 3) return { txt: left, cls: 'crit', edge: 'r' };
  if (d <= 7) return { txt: left, cls: 'warn', edge: 'o' };
  return { txt: gx().fmt.dateY(it.ref), cls: '', edge: '' };
}
/** Filtres de la rubrique (mêmes règles que la maquette et TodoList.tsx). */
function matches(it: Item, f: Filters) {
  const q = f.q.trim().toLowerCase();
  if (!inGlobal(it)) return false;
  if (q && !`${it.t.name} ${it.p?.name || ''}`.toLowerCase().includes(q)) return false;
  if (f.sites.length && !f.sites.some((s) => (s === 'Nissan' ? it.brands.includes('Nissan') : it.sites.includes(s)))) return false;
  if (f.brands.length && !f.brands.some((b) => it.brands.includes(b))) return false;
  if (f.services.length && !f.services.some((s) => it.services.includes(s))) return false;
  if (f.from && it.ref < f.from) return false;
  if (f.to && it.start > f.to) return false;
  return true;
}
const sortIt = (a: Item, b: Item) => a.ref.localeCompare(b.ref) || a.t.name.localeCompare(b.t.name);
const siteLbl = (v: string[]) => (v.length ? `${v.length} site${v.length > 1 ? 's' : ''}` : 'Périmètre');

// ---------------------------------------------------------------- carte
const Card = React.memo(function Card({ it, ro }: { it: Item; ro: boolean }) {
  const t = it.t, u = urgency(it), si = COLS.findIndex((c) => c[0] === t.status);
  const where = it.sites.length ? (it.sites.length > 2 ? `${it.sites.slice(0, 2).join(', ')} +${it.sites.length - 2}` : it.sites.join(', ')) : '';
  return (
    <article className={`tdo-card ${u.edge} ${t.status === 'Done' ? 'done' : ''}`} data-id={it.id} tabIndex={0}>
      <div className="nm" title={t.name}>{t.name}</div>
      <div className="tdo-l2">
        {it.p
          ? <button className="tdo-pj" data-act="project" data-tip="Ouvrir le projet"><span className="ellipsis" style={{ color: 'var(--text)' }}>{it.p.name}</span><span className="st site">{sitesOf(it.p)[0] || ''}</span>{it.p.status === 'Draft' ? <span className="badge" style={{ '--c': 'var(--text-3)', height: 18 } as React.CSSProperties}>Brouillon</span> : null}<Icon name="arrowr" size="sm" /></button>
          : <button className="tdo-pj" data-act="edit" data-tip={ro ? 'Tâche libre' : 'Modifier cette tâche'}><span className="tdo-libre">Libre</span>{where ? <span className="st">{where}</span> : null}{ro ? null : <Icon name="edit" size="sm" />}</button>}
        <span className={`tdo-dl ${u.cls}`}>{u.cls === 'none' ? null : <Icon name={u.cls === 'late' ? 'alert' : 'clock'} />}{u.txt}</span>
      </div>
      <div className="tdo-tags">{it.services.map((s) => <ServiceBadge key={s} s={s} />)}<BrandChips brands={it.brands} />{t.channel ? <span className="badge ch">{t.channel}</span> : null}{t.cost ? <span className="cost num">{gx().fmt.eur(t.cost)}</span> : null}</div>
      <div className="tdo-mv">
        <button data-mv="-1" disabled={si <= 0 || ro} aria-label="Colonne précédente" data-tip={si > 0 ? `Vers « ${COLS[si - 1][1]} »` : ''}><Icon name="back" size="sm" /></button>
        <button data-mv="1" disabled={si >= COLS.length - 1 || ro} aria-label="Colonne suivante" data-tip={si < COLS.length - 1 ? `Vers « ${COLS[si + 1][1]} »` : ''}><Icon name="chevron" size="sm" /></button>
      </div>
    </article>
  );
}, (a, b) => a.it.t === b.it.t && a.it.p === b.it.p && a.ro === b.ro && a.it.ref === b.it.ref);

// ---------------------------------------------------------------- rubrique
export default function TodoApp({ win, inst }: AppProps) {
  const { user } = useAuth();
  const uid = user?.id || '';
  const projects = useWorkspace((s) => s.projects);
  const standalone = useWorkspace((s) => s.standalone);
  const ready = useWorkspace((s) => s.ready);
  const savingProjects = useWorkspace((s) => s.saving);
  const [f, setF] = useState<Filters>(F0);
  const [hideDone, setHideDone] = useState(false);
  // Filtres dépliés par défaut, sauf fenêtre étroite / téléphone (même règle que la maquette).
  const [open, setOpen] = useEngineStore<boolean>('todo.filters', (() => { const w = (win as any).body?.clientWidth ?? 0; return w === 0 || w >= 720; })());
  const [savingFree, setSavingFree] = useState(0);
  const [, setTick] = useState(0);                       // périmètre global changé (GX.ctx)
  const { open: openSheet, portals } = useSheets(win);
  const ro = !!gx().ctx.readOnly;
  const canCreate = canEditProjects(user?.role) && !ro;
  const appRef = useRef<HTMLDivElement>(null), boardRef = useRef<HTMLDivElement>(null);

  useEngineEvent('ctx', () => setTick((n) => n + 1));

  const items = useMemo(() => buildItems(projects, standalone, uid), [projects, standalone, uid]);
  const fd = useDeferredValue(f);   // saisie instantanée, tableau recalculé juste derrière
  const filtered = useMemo(() => items.filter((it) => matches(it, fd)), [items, fd]);
  const active = (f.q.trim() ? 1 : 0) + (f.sites.length ? 1 : 0) + (f.brands.length ? 1 : 0) + (f.services.length ? 1 : 0) + (f.from || f.to ? 1 : 0);
  const cols = COLS.filter((c) => !(hideDone && c[0] === 'Done'));
  const byCol = useMemo(() => Object.fromEntries(COLS.map(([k]) => [k, filtered.filter((it) => it.t.status === k).sort(sortIt)])) as Record<ColKey, Item[]>, [filtered]);
  const find = useCallback((id: string) => items.find((it) => it.id === id), [items]);

  // --- FLIP : positions relevées AVANT le changement, animées APRÈS le rendu (comme la maquette)
  const flip = useRef<{ rects: Map<string, DOMRect>; moved?: string; from?: DOMRect; focus?: string; pulse?: ColKey } | null>(null);
  const rectsOf = () => new Map([...(boardRef.current?.querySelectorAll<HTMLElement>('.tdo-card') || [])].map((c) => [c.dataset.id!, c.getBoundingClientRect()]));
  const capture = (extra: Partial<NonNullable<typeof flip.current>> = {}) => { flip.current = { rects: rectsOf(), ...extra }; };
  useLayoutEffect(() => {
    const F = flip.current; if (!F || !boardRef.current) return; flip.current = null;
    boardRef.current.querySelectorAll<HTMLElement>('.tdo-card').forEach((c) => {
      const r = c.dataset.id === F.moved && F.from ? F.from : F.rects.get(c.dataset.id!);
      if (r) gx().flip(c, r, { spring: c.dataset.id === F.moved ? 'bouncy' : 'snappy' });
      else gx().animate(c, [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
    });
    if (F.moved) {
      const c = boardRef.current.querySelector<HTMLElement>(`.tdo-card[data-id="${F.moved}"]`);
      if (c) { c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); if (F.focus) c.focus(); }
      if (c && F.pulse === 'Done') gx().animate(c, [{ boxShadow: '0 0 0 0 var(--ok)' }, { boxShadow: '0 0 0 6px transparent' }], { duration: 700, easing: 'ease-out' });
      const cnt = F.pulse && boardRef.current.querySelector(`[data-col="${F.pulse}"] .n`); if (cnt) gx().animate(cnt, [{ transform: 'scale(1.5)' }, { transform: 'none' }], { spring: 'bouncy' });
    }
  }, [byCol, cols.length]);   // seulement quand le tableau change (le filtre est différé)

  // --- changer de colonne
  const setStatus = useCallback((it: Item | undefined, st: ColKey, from?: DOMRect, focus?: boolean) => {
    if (!it || it.t.status === st || ro) return;
    capture({ moved: it.id, from, focus: focus ? it.id : undefined, pulse: st });
    if (hideDone && st === 'Done') setHideDone(false);
    if (it.p) mutateTask(it.p.id, it.t.id, { status: st as TaskStatus });
    else {
      setSavingFree((n) => n + 1);
      updateStandalone(it.t.id, { status: st as TaskStatus })
        .catch(() => hud('Échec de la sauvegarde (serveur injoignable ?).'))
        .finally(() => setSavingFree((n) => n - 1));
    }
  }, [ro, hideDone]);

  const openProject = (it: Item) => gx().openProject(it.p!.id);

  // --- glisser-déposer (souris / stylet), identique à la maquette
  const suppressClick = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.tdo-card');
    if (!card || e.button !== 0 || e.pointerType === 'touch' || (e.target as HTMLElement).closest('button') || ro) return;
    const sx = e.clientX, sy = e.clientY, app = appRef.current!, board = boardRef.current!;
    let drag: { ghost: HTMLElement; ox: number; oy: number; over: HTMLElement | null; item: Item | undefined } | null = null;
    const begin = () => {
      const r = card.getBoundingClientRect(), ar = app.getBoundingClientRect();
      const ghost = card.cloneNode(true) as HTMLElement; ghost.classList.add('tdo-ghost'); ghost.classList.remove('ph');
      Object.assign(ghost.style, { width: r.width + 'px', left: r.left - ar.left + 'px', top: r.top - ar.top + 'px' });
      app.append(ghost); card.classList.add('ph'); gx().menu.close();
      gx().animate(ghost, [{ transform: 'none' }, { transform: 'rotate(2.5deg) scale(1.04)' }], { spring: 'snappy', fill: 'forwards' });
      return { ghost, ox: sx - r.left, oy: sy - r.top, over: null, item: find(card.dataset.id!) };
    };
    const move = (ev: PointerEvent) => {
      if (!drag) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return; drag = begin(); }
      const ar = app.getBoundingClientRect();
      drag.ghost.style.left = ev.clientX - ar.left - drag.ox + 'px'; drag.ghost.style.top = ev.clientY - ar.top - drag.oy + 'px';
      const col = (gx().root.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('.tdo-col') || null;
      if (col !== drag.over) { drag.over?.classList.remove('over'); drag.over = col && board.contains(col) ? col : null; drag.over?.classList.add('over'); }
      const cards = drag.over?.querySelector<HTMLElement>('[data-drop]'); if (cards) { const r = cards.getBoundingClientRect(); if (ev.clientY > r.bottom - 30) cards.scrollTop += 8; else if (ev.clientY < r.top + 30) cards.scrollTop -= 8; }
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (!drag) return; suppressClick.current = true; setTimeout(() => (suppressClick.current = false), 0);
      const { ghost, over, item } = drag; over?.classList.remove('over'); card.classList.remove('ph');
      const gr = ghost.getBoundingClientRect(); ghost.remove();
      if (over && item && over.dataset.col !== item.t.status) setStatus(item, over.dataset.col as ColKey, gr);
      else gx().flip(card, gr, { spring: 'bouncy' });
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  };

  const onBoardClick = (e: React.MouseEvent) => {
    if (suppressClick.current) return;
    const tgt = e.target as HTMLElement, mv = tgt.closest<HTMLElement>('[data-mv]'), card = tgt.closest<HTMLElement>('.tdo-card'); if (!card) return;
    const it = find(card.dataset.id!); if (!it) return;
    if (mv) { const i = COLS.findIndex((c) => c[0] === it.t.status) + +mv.dataset.mv!; if (COLS[i]) setStatus(it, COLS[i][0]); return; }
    if (it.p) openProject(it); else taskSheet(it.t);
  };
  const onBoardKey = (e: React.KeyboardEvent) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.tdo-card'); if (!card || e.target !== card) return; const it = find(card.dataset.id!);
    if (e.key === 'Enter') card.click();
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !ro && it) { e.preventDefault(); const i = COLS.findIndex((c) => c[0] === it.t.status) + (e.key === 'ArrowRight' ? 1 : -1); if (COLS[i]) setStatus(it, COLS[i][0], undefined, true); }
  };
  const onBoardMenu = (e: React.MouseEvent) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.tdo-card'); if (!card) return; e.preventDefault(); const it = find(card.dataset.id!); if (!it) return;
    gx().menu.open([{ header: 'Déplacer vers' }, ...COLS.map(([k, l]) => ({ label: l, checked: it.t.status === k, disabled: ro, action: () => setStatus(it, k) })), '-',
      it.p ? { label: 'Ouvrir le projet', icon: 'projects', action: () => openProject(it) } : { label: 'Modifier la tâche…', icon: 'edit', disabled: ro, action: () => taskSheet(it.t) },
      ...(it.p ? [] : [{ label: 'Supprimer la tâche', icon: 'trash', disabled: ro, action: () => delFree(it.t) }])], { x: e.clientX, y: e.clientY });
  };

  // --- filtres
  const refilter = (next: Partial<Filters>) => { capture(); setF((x) => ({ ...x, ...next })); };
  const clearAll = () => { capture(); setF(F0); };
  const toggleOpen = () => { setOpen(!open); };
  const h2Ref = useRef<HTMLDivElement>(null), wasOpen = useRef(open);
  useLayoutEffect(() => { if (open && !wasOpen.current && h2Ref.current) gx().animate(h2Ref.current, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' }); wasOpen.current = open; }, [open]);

  // --- tâche libre : création / modification / suppression
  const delFree = (t: Task) => {
    if (ro) return; capture(); setSavingFree((n) => n + 1);
    deleteStandalone(t.id).then(() => hud('Tâche supprimée')).catch((e) => hud(e.message)).finally(() => setSavingFree((n) => n - 1));
  };
  const taskSheet = (t: Task | null) => {
    if (t ? ro : !canCreate) { if (t) hud('Lecture seule'); return; }
    openSheet((close) => <TaskForm t={t} uid={uid} close={close} onDelete={() => { close(); delFree(t!); }}
      onSaved={(id, visible) => { capture({ moved: id }); if (!visible) hud(t ? 'Tâche enregistrée — masquée par les filtres actifs' : 'Tâche créée — masquée par les filtres actifs'); }}
      isVisible={(task) => buildItems([], [task], uid).some((it) => matches(it, f))} />, { width: 600 });
  };

  // --- navigation compacte entre colonnes (fenêtre étroite, téléphone)
  const [navCol, setNavCol] = useState<ColKey>('Todo');
  useEffect(() => {
    const board = boardRef.current; if (!board) return; let t = 0;
    const sync = () => {
      if (!board.clientWidth) return;
      const colsEl = [...board.querySelectorAll<HTMLElement>('.tdo-col')], mid = board.scrollLeft + board.clientWidth / 2;
      const i = Math.max(0, colsEl.findIndex((c) => c.offsetLeft <= mid && c.offsetLeft + c.offsetWidth >= mid));
      const k = colsEl[i]?.dataset.col as ColKey | undefined; if (k) setNavCol(k);
    };
    const onScroll = () => { clearTimeout(t); t = window.setTimeout(sync, 90); };
    board.addEventListener('scroll', onScroll, { passive: true });
    const ro2 = new ResizeObserver(sync); ro2.observe(board);
    return () => { board.removeEventListener('scroll', onScroll); ro2.disconnect(); clearTimeout(t); };
  }, []);
  const goCol = (k: ColKey) => { const c = boardRef.current?.querySelector<HTMLElement>(`[data-col="${k}"]`); if (c) boardRef.current!.scrollTo({ left: c.offsetLeft - 12, behavior: 'smooth' }); };

  // --- barre du haut et commandes (contrat du moteur)
  inst.command = (c: string) => { if (c === 'new-task' || c === 'new') taskSheet(null); };
  inst.menus = () => ({
    'Fichier': [{ label: 'Nouvelle tâche…', icon: 'plus', disabled: !canCreate, action: () => taskSheet(null) }],
    'Présentation': [{ label: 'Masquer la colonne « Terminé »', checked: hideDone, action: () => { capture(); setHideDone(!hideDone); } },
      { label: 'Afficher la ligne de filtres', checked: open, action: toggleOpen }, '-',
      { label: 'Effacer tous les filtres', icon: 'close', disabled: !active, action: clearAll }],
  });

  const saving = savingProjects > 0 || savingFree > 0;
  const empty = ready && !filtered.length;
  const n = filtered.length;
  return (
    <div className="app tdo" ref={appRef}>
      <div className="app-head"><div className="ah-t"><span className="ah-eye">Gestion de projets</span><h1>To-do</h1><span className="sub"><b className="num" style={{ color: 'var(--text)' }}>{n}</b> tâche{n !== 1 ? 's' : ''} assignée{n !== 1 ? 's' : ''} · les plus urgentes en haut de chaque colonne</span></div>
        <div className="ah-f"><span className={`tdo-saving ${saving ? '' : 'hide'}`}>Sauvegarde…</span>
          <button className="btn tdo-fbtn" aria-expanded={open} onClick={toggleOpen}><Icon name="filter" size="sm" />Filtres{active ? <span className="count">{active}</span> : null}<Icon name={open ? 'chevup' : 'chevdown'} size="sm" /></button>
          {ro ? <span className="badge" style={{ '--c': 'var(--danger)' } as React.CSSProperties}><Icon name="lock" size="sm" />Lecture seule</span> : null}
          {canCreate ? <button className="btn primary" data-tip="Nouvelle tâche" onClick={() => taskSheet(null)}><Icon name="plus" size="sm" /><span>Nouvelle tâche</span></button> : null}</div></div>
      <div ref={h2Ref} className={`app-head2 tdo-h2 ${open ? '' : 'hide'}`}>
        <div><span className="label">Recherche</span><label className="search"><Icon name="search" size="sm" /><input placeholder="Rechercher une tâche ou un projet…" value={f.q} onChange={(e) => refilter({ q: e.target.value })} /></label></div>
        <div><span className="label">Périmètre</span><PickerBtn icon="pin" label={siteLbl(f.sites)} active={!!f.sites.length} onClick={(el) => gx().ui.sitePicker(el, f.sites, (v: string[]) => refilter({ sites: v }), { variant: 'filter', multi: true, entities: false })} /></div>
        <span className="tdo-sep" /><div><span className="label">Marques</span><Chips values={BRANDS as string[]} selected={f.brands} onChange={(v) => refilter({ brands: v })} all="Toutes" colors={Object.fromEntries(gx().data.BRANDS.map((b: any) => [b.id, b.hex]))} /></div>
        <span className="tdo-sep" /><div><span className="label">Services</span><Chips values={FILTER_SERVICES} selected={f.services} onChange={(v) => refilter({ services: v })} all="Tous" /></div>
        <span className="tdo-sep" /><div><span className="label">Dates</span><PickerBtn icon="agenda" label={gx().ui.periodLabel(f.from, f.to)} active={!!(f.from || f.to)} onClick={(el) => gx().ui.dateRange(el, { from: f.from, to: f.to }, ({ from, to }: { from?: string; to?: string }) => refilter({ from: from || '', to: to || '' }))} /></div>
        <button className={`btn ghost sm tdo-clear ${active ? '' : 'hide'}`} onClick={clearAll}><Icon name="close" size="sm" />Effacer tout</button>
      </div>
      <div className={`tdo-colnav ${empty ? 'hide' : ''}`}><Seg value={navCol} onChange={(k) => { setNavCol(k); goCol(k); }} options={cols.map(([k, l]) => [k, `${l} ${byCol[k].length}`])} /></div>
      <div ref={boardRef} className={`tdo-board scroll ${empty ? 'hide' : ''}`} style={{ '--n': cols.length } as React.CSSProperties}
        onPointerDown={onPointerDown} onClick={onBoardClick} onKeyDown={onBoardKey} onContextMenu={onBoardMenu}>
        {cols.map(([k, l, c]) => (
          <section key={k} className="tdo-col" data-col={k} style={{ '--c': c } as React.CSSProperties}>
            <header><i className="dot" /><b>{l}</b><span className="n num" style={{ marginLeft: 'auto' }}>{byCol[k].length}</span></header>
            <div className="tdo-cards scroll" data-drop={k}>{byCol[k].length ? byCol[k].map((it) => <Card key={it.id} it={it} ro={ro} />) : <div className="tdo-empty">Aucune tâche</div>}</div>
          </section>
        ))}
      </div>
      <div className={`tdo-none ${empty ? '' : 'hide'}`}>{empty ? <><Icon name="todo" /><p>{items.some(inGlobal) ? 'Aucune tâche ne correspond aux filtres sélectionnés.' : 'Aucune tâche ne vous est assignée dans les projets actifs.'}</p>{active ? <button className="btn sm" onClick={clearAll}>Effacer les filtres</button> : null}</> : null}</div>
      {portals}
    </div>
  );
}

// ---------------------------------------------------------------- formulaire de tâche libre
function TaskForm({ t, uid, close, onDelete, onSaved, isVisible }: {
  t: Task | null; uid: string; close: (v?: unknown) => void; onDelete: () => void;
  onSaved: (id: string, visible: boolean) => void; isVisible: (t: Task) => boolean;
}) {
  const providers = useWorkspace((s) => s.projects);
  const provList = useMemo(() => [...new Set(providers.flatMap((p) => (p.tasks || []).map((x) => x.provider || '').filter(Boolean)))], [providers]);
  const [v, setV] = useState(() => ({ name: t?.name || '', provider: t?.provider || '', deadline: t?.deadline || '', channel: (t?.channel as string) || '', status: (t?.status as ColKey) || 'Todo', sites: [...(t?.sites || [])], brands: [...(t?.brands || [])] as string[], services: [...(t?.service || [])] as string[] }));
  const [confirmDel, setConfirmDel] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const toggleBrand = (b: string) => set({ brands: b === 'Holding' ? (v.brands.includes('Holding') ? [] : ['Holding']) : (v.brands.includes(b) ? v.brands.filter((y) => y !== b) : [...v.brands.filter((y) => y !== 'Holding'), b]) });
  const toggleSvc = (s: string) => set({ services: v.services.includes(s) ? v.services.filter((y) => y !== s) : [...v.services, s] });
  const save = async () => {
    const name = v.name.trim(); if (!name) { setErr('Le nom de la tâche est obligatoire.'); return; }
    // Même charge que StandaloneTaskForm (pages/TodoList.tsx) : l'assigné reste celui de la tâche.
    const data: Partial<Task> = { name, provider: v.provider.trim(), channel: v.channel as any, status: v.status as TaskStatus, assignedUserId: t?.assignedUserId || uid, deadline: v.deadline || (null as any), sites: v.sites, brands: v.brands as any, service: v.services as any };
    setBusy(true); setErr('');
    try {
      let id = t?.id || '';
      if (t) await updateStandalone(t.id, data); else id = (await createStandalone(data))?.id || '';
      close(); onSaved(id, isVisible({ ...(t || {} as Task), ...data, id } as Task));
    } catch (e: any) { setErr(e?.message && !/^Erreur \d+$/.test(e.message) ? e.message : 'Échec de l\'enregistrement.'); setBusy(false); }
  };
  const chip = (on: boolean, label: string, onClick: () => void, color?: string) => <button type="button" className="chip" aria-pressed={on} onClick={onClick}>{color ? <i className="brand-dot" style={{ '--c': color } as React.CSSProperties} /> : null}{label}</button>;
  const colors: Record<string, string> = Object.fromEntries(gx().data.BRANDS.map((b: any) => [b.id, b.hex]));
  return (
    <div className="tdo-sheet"><h3>{t ? 'Modifier la tâche' : 'Nouvelle tâche'}</h3><div className="muted">Tâche libre, toujours assignée à vous. Les tâches d’un projet se créent depuis le projet.</div>
      <div className="form-grid">
        <label className="field full"><span className="label">Nom *</span><input className="input" autoFocus value={v.name} placeholder="Ex. Relancer l’imprimeur" onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && v.name.trim()) save(); }} /></label>
        <label className="field"><span className="label">Prestataire</span><input className="input" value={v.provider} list="tdoProv" onChange={(e) => set({ provider: e.target.value })} /><datalist id="tdoProv">{provList.map((p) => <option key={p} value={p} />)}</datalist></label>
        <label className="field"><span className="label">Deadline</span><input type="date" className="input" value={v.deadline} onChange={(e) => set({ deadline: e.target.value })} /></label>
        <label className="field"><span className="label">Canal</span><select className="select" value={v.channel} onChange={(e) => set({ channel: e.target.value })}><option value="">—</option>{TASK_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="field"><span className="label">Statut</span><select className="select" value={v.status} onChange={(e) => set({ status: e.target.value as ColKey })}>{COLS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <div className="field full"><span className="label">Sites</span><div><PickerBtn icon="pin" label={gx().ui.summary(v.sites, { all: 'Choisir des sites', max: 3 })} active={!!v.sites.length} onClick={(el) => gx().ui.sitePicker(el, v.sites, (vals: string[]) => set({ sites: vals }), { variant: 'filter', multi: true, title: 'Sites', entities: false })} /></div></div>
        <div className="field full"><span className="label">Marques</span><div className="chips">{(BRANDS as string[]).map((b) => <React.Fragment key={b}>{chip(v.brands.includes(b), brandLabel(b), () => toggleBrand(b), colors[b])}</React.Fragment>)}</div><span className="faint" style={{ fontSize: 12 }}>GROUPE BONY (Holding) est exclusif : suivi, jamais imputé à un budget.</span></div>
        <div className="field full"><span className="label">Services</span><div className="chips">{FORM_SERVICES.map((s) => <React.Fragment key={s}>{chip(v.services.includes(s), s, () => toggleSvc(s))}</React.Fragment>)}</div></div>
      </div>
      {err ? <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 13, marginTop: 10 }}>{err}</div> : null}
      <div className="foot">
        {t ? <><button className={`btn danger ${confirmDel ? 'primary' : ''}`} onClick={() => (confirmDel ? onDelete() : setConfirmDel(true))}><Icon name="trash" size="sm" />{confirmDel ? 'Confirmer la suppression' : 'Supprimer'}</button><span className="grow" /></> : null}
        <button className="btn" onClick={() => close()}>Annuler</button>
        <button className="btn primary" disabled={!v.name.trim() || busy} onClick={save}>{busy ? 'Enregistrement…' : t ? 'Enregistrer' : 'Créer la tâche'}</button>
      </div>
    </div>
  );
}
