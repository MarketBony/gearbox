import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PostIt, PostItColor } from '../../../types';
import { db } from '../../../services/dataService';
import { getSocket } from '../../../services/socket';
import { gx, hud, Icon, Seg, useEngineStore, useCompact, bindSwipeWheel } from '../ui/kit';
import {
  COLORS, colorOf, DAY_MIN, SNAP, fmtDay, addDays, today, mondayOf, daysBetween, minOf, slotOf, hhmm, snap, clamp,
  JOURS_C, dowOf, monthTitle, rangeTitle, dayLabel, whenLabel, spanOf, layoutTimed, layoutBars, monthDays, moveBy, durationOf, parseDay,
} from './postitLogic';

// =====================================================================
// POST-IT — sous-rubrique de la To-do (01/10/2026) : agenda PERSONNEL façon Outlook.
// Semaine (lundi → dimanche, défaut) ou mois ; 3 jours en fenêtre étroite. Cliquer-glisser
// pour poser un créneau, glisser pour déplacer, bords pour étirer, double-clic pour éditer,
// Suppr pour supprimer (bandeau « Annuler »). Connecté à RIEN d'autre dans Gearbox.
//
// Données : routes /api/postits (filtrées sur l'utilisateur connecté côté serveur), écritures
// optimistes puis réponse du serveur ; autres onglets du même compte : `postits:changed`.
//
// Mouvement — le cœur du lot. Tout passe par `transform` / `opacity` (jamais la géométrie
// pendant une animation) et par les ressorts du moteur (`GX.spring`) :
//  - pose : la feuille « se colle » (rebond + rotation qui se redresse) ;
//  - glisser : la feuille se soulève et S'INCLINE selon la vitesse du pointeur, un fantôme
//    pointillé montre où elle atterrira ; relâchée, elle vole jusqu'à sa place et se pose ;
//  - étirer : l'heure suit le pointeur, micro-rebond à chaque cran de 15 min ;
//  - supprimer : la feuille se décolle et tombe ; « Annuler » la recolle ;
//  - semaine ↔ mois : chaque post-it voyage de son créneau vers sa case (FLIP) ;
//  - chevauchements, changements : les voisins glissent à leur nouvelle place (FLIP).
// `prefers-reduced-motion` coupe tout le mouvement décoratif.
// =====================================================================

type View = 'week' | 'month';
type Draft = Omit<PostIt, 'id'> & { id?: string };
type Edge = 'top' | 'bottom' | 'left' | 'right';
const H = 48;                                  // hauteur d'une heure, en px (15 min = 12 px)
const NEW = '__new';                           // post-it en cours de création (pas encore en base)
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const anim = (el: Element | null | undefined, kf: Keyframe[], o: Record<string, unknown> = {}): Animation | null => (el && !reduced() ? gx().animate(el, kf, o) : null);

/** Contrôle client, mêmes règles que la route (le serveur reste juge). */
function invalid(d: Draft): string | null {
  if (!d.title.trim()) return 'Donnez un titre à ce post-it.';
  if (d.title.trim().length > 200) return 'Titre trop long (200 caractères maximum).';
  if (d.allDay ? d.end < d.start : d.end <= d.start) return 'La fin doit suivre le début.';
  return null;
}
const strip = (p: PostIt): Draft => { const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = p; return rest; };

export default function PostItBoard({ switcher }: { switcher: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null), stageRef = useRef<HTMLDivElement>(null), paneRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null), gridRef = useRef<HTMLDivElement>(null), monthRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<PostIt[] | null>(null);
  const [view, setViewRaw] = useEngineStore<View>('postit.view', 'week');
  const [lastColor, setLastColor] = useEngineStore<PostItColor>('postit.color', 'yellow');
  const [anchor, setAnchor] = useState(today);
  const compact = useCompact(rootRef, 640);
  const [sel, setSel] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ draft: Draft; rect: DOMRect; isNew: boolean } | null>(null);
  const [toast, setToast] = useState<{ p: PostIt; k: number } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [rowH, setRowH] = useState(110);
  // Aperçu pendant un geste : le post-it concerné est rendu à sa position PROVISOIRE.
  const [preview, setPreview] = useState<PostIt | null>(null);
  const previewRef = useRef<PostIt | null>(null); previewRef.current = preview;
  const [float, setFloat] = useState<{ p: PostIt; w: number; h: number } | null>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const fresh = useRef(new Set<string>());     // à faire « coller » au prochain rendu
  const landing = useRef<{ id: string; rect: DOMRect; rot: number } | null>(null);
  const morph = useRef(false);                 // prochain rendu = bascule semaine ↔ mois
  const slide = useRef(0);                     // prochain rendu = navigation (-1 / 1)
  const rects = useRef(new Map<string, DOMRect>());

  // ---------------------------------------------------------------- données
  const load = useCallback(() => db.getPostIts().then(setItems).catch(() => setItems((v) => v || [])), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const s = getSocket(); if (!s) return;
    const h = () => load();
    s.on('postits:changed', h);
    window.addEventListener('gearbox-chat-reconnected', h);
    return () => { s.off('postits:changed', h); window.removeEventListener('gearbox-chat-reconnected', h); };
  }, [load]);
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(t); }, []);

  const list = useMemo(() => {
    const base = (items || []).filter((p) => p.id !== preview?.id);
    return preview ? [...base, preview] : base;
  }, [items, preview]);

  // ---------------------------------------------------------------- période affichée
  const nDays = view === 'week' ? (compact ? 3 : 7) : 7;
  const days = useMemo(() => {
    if (view === 'month') return monthDays(anchor);
    const first = compact ? anchor : mondayOf(anchor);
    return Array.from({ length: nDays }, (_, i) => addDays(first, i));
  }, [view, anchor, compact, nDays]);
  const title = view === 'month' ? monthTitle(anchor) : rangeTitle(days[0], days[days.length - 1]);
  const todayS = fmtDay(now);

  const setView = (v: View) => { if (v === view) return; captureRects(true); morph.current = true; setSel(null); setViewRaw(v); };
  const nav = (d: 1 | -1) => {
    slide.current = d; setSel(null);
    setAnchor((a) => (view === 'month' ? fmtDay(new Date(parseDay(a).getFullYear(), parseDay(a).getMonth() + d, 1)) : addDays(a, d * nDays)));
  };
  const navRef = useRef(nav); navRef.current = nav;
  const pulseToday = () => anim(rootRef.current?.querySelector('.pst-dh.today .n, .pst-mcell.today .n'), [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { spring: 'bouncy', duration: 520 });
  const goToday = () => {
    const t = today();
    const visible = view === 'week' ? days.includes(t) : parseDay(t).getMonth() === parseDay(anchor).getMonth() && parseDay(t).getFullYear() === parseDay(anchor).getFullYear();
    if (visible) { pulseToday(); return; }
    slide.current = t > anchor ? 1 : -1; setAnchor(t);
  };

  // Grille horaire, mesurée en direct (ResizeObserver) :
  //  - largeur de SA barre de défilement → `--pst-sb`, réservée à droite de l'en-tête et de la bande
  //    « Journée » : sans elle, les colonnes de la grille sont plus étroites que celles des dates et
  //    le décalage grandit vers la droite (10 px de barre = 9 px d'écart sur dimanche, recette du 01/10) ;
  //  - ouverture sur la journée de travail (7 h, ou l'heure courante si plus tard), posée dès que la
  //    grille a une HAUTEUR : fenêtre encore masquée = scrollTop ramené à 0 (ouverture à minuit vue en recette).
  useLayoutEffect(() => {
    const sc = scrollRef.current, root = rootRef.current; if (view !== 'week' || !sc || !root) return;
    let placed = false;
    const ro = new ResizeObserver(() => {
      root.style.setProperty('--pst-sb', `${sc.offsetWidth - sc.clientWidth}px`);
      if (!placed && sc.clientHeight > 0) { placed = true; const h = new Date().getHours(); sc.scrollTop = Math.max(0, (h >= 17 ? h - 6 : 7) * H - 8); }
    });
    ro.observe(sc);
    return () => ro.disconnect();
  }, [view, items === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vue mois : nombre de couloirs visibles selon la hauteur réelle d'une rangée (mesurée).
  useLayoutEffect(() => {
    const el = monthRef.current; if (!el) return;
    const ro = new ResizeObserver(() => { const r = el.querySelector<HTMLElement>('.pst-mrow'); if (r) setRowH(r.offsetHeight); }); ro.observe(el);
    return () => ro.disconnect();
  }, [view, items === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pavé tactile : balayage horizontal = période suivante / précédente (porte unique du moteur).
  useEffect(() => { const st = stageRef.current; if (!st) return; return bindSwipeWheel(st, (d) => navRef.current(d)); }, []);

  // ---------------------------------------------------------------- mouvement : FLIP, pose, navigation
  function captureRects(byId = false) {
    const m = new Map<string, DOMRect>();
    rootRef.current?.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      const k = byId ? el.dataset.pid! : el.dataset.flip!;
      if (!m.has(k)) m.set(k, el.getBoundingClientRect());
    });
    rects.current = m;
  }
  useLayoutEffect(() => {
    const root = rootRef.current; if (!root) return;
    const els = [...root.querySelectorAll<HTMLElement>('[data-flip]')];
    // 1. Navigation : la nouvelle période glisse depuis le côté d'où l'on vient.
    if (slide.current) {
      const d = slide.current; slide.current = 0;
      anim(paneRef.current, [{ transform: `translateX(${d * 46}px)`, opacity: 0.2 }, { transform: 'none', opacity: 1 }], { spring: 'soft' });
    }
    // 2. Bascule semaine ↔ mois : chaque post-it part de son ancienne place.
    else if (morph.current) {
      morph.current = false;
      const seen = new Set<string>();
      els.forEach((el) => {
        const id = el.dataset.pid!, from = rects.current.get(id), to = el.getBoundingClientRect();
        if (seen.has(id) || !from || !to.width) { anim(el, [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }], { spring: 'soft', delay: 90 }); return; }
        seen.add(id);
        el.style.transformOrigin = 'top left';
        const a = anim(el, [{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` }, { transform: 'none' }], { spring: 'soft' });
        if (a) a.onfinish = () => { el.style.transformOrigin = ''; }; else el.style.transformOrigin = '';
      });
    }
    // 3. Mise à jour sur place : ce qui a bougé (voisins, fantôme d'un glissé) glisse à sa nouvelle place.
    else {
      els.forEach((el) => {
        const from = rects.current.get(el.dataset.flip!); if (!from || el.dataset.pid === landing.current?.id) return;
        const to = el.getBoundingClientRect(), dx = from.left - to.left, dy = from.top - to.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) anim(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { spring: 'snappy' });
      });
    }
    // 4. Feuille relâchée : elle vole de la position du pointeur jusqu'à sa place, puis se pose.
    const L = landing.current;
    if (L) {
      landing.current = null;
      const el = root.querySelector<HTMLElement>(`[data-pid="${L.id}"]`);
      if (el) {
        const to = el.getBoundingClientRect();
        el.style.transformOrigin = 'top left'; el.style.zIndex = '30';
        const done = () => { el.style.transformOrigin = ''; el.style.zIndex = ''; };
        const a = anim(el, [
          { transform: `translate(${L.rect.left - to.left}px, ${L.rect.top - to.top}px) scale(${L.rect.width / to.width}, ${L.rect.height / to.height}) rotate(${L.rot}deg)`, boxShadow: 'var(--pst-lift)' },
          { transform: 'none', boxShadow: 'var(--pst-shadow)' },
        ], { spring: 'bouncy' });
        if (a) a.onfinish = done; else done();
      }
    }
    // 5. Nouvelles feuilles : elles se collent (léger rebond, rotation qui se redresse).
    if (fresh.current.size) {
      fresh.current.forEach((id) => root.querySelectorAll<HTMLElement>(`[data-pid="${id}"]`).forEach((el, i) => {
        anim(el, [{ transform: 'scale(.55) rotate(-7deg)', opacity: 0 }, { transform: 'scale(1.05) rotate(1.5deg)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { spring: 'bouncy', duration: 620, delay: i * 40 });
      }));
      fresh.current.clear();
    }
    captureRects();
  });

  // ---------------------------------------------------------------- écritures (optimistes)
  const upsert = (p: PostIt) => setItems((v) => [...(v || []).filter((x) => x.id !== p.id), p]);
  const save = (p: PostIt, patch: Partial<PostIt>) => {
    upsert({ ...p, ...patch });
    db.updatePostIt(p.id, patch).then(upsert).catch((e) => { upsert(p); hud(e?.message || 'Modification impossible.'); });
  };
  const create = (d: Draft) => {
    const tmp = { ...d, id: `tmp-${Date.now()}`, title: d.title.trim() } as PostIt;
    fresh.current.add(tmp.id);
    upsert(tmp); setLastColor(d.color);
    db.createPostIt({ title: tmp.title, start: d.start, end: d.end, allDay: d.allDay, color: d.color })
      .then((row) => setItems((v) => (v || []).map((x) => (x.id === tmp.id ? row : x))))
      .catch((e) => { setItems((v) => (v || []).filter((x) => x.id !== tmp.id)); hud(e?.message || 'Création impossible.'); });
  };
  const remove = (p: PostIt) => {
    setSel(null); setEditor(null); setPreview(null);
    const els = [...(rootRef.current?.querySelectorAll<HTMLElement>(`[data-pid="${p.id}"]`) || [])];
    const go = () => {
      setItems((v) => (v || []).filter((x) => x.id !== p.id));
      setToast({ p, k: Date.now() });
      if (!p.id.startsWith('tmp-')) db.deletePostIt(p.id).catch((e) => { upsert(p); hud(e?.message || 'Suppression impossible.'); });
    };
    if (!els.length || reduced()) { go(); return; }
    // La feuille se décolle par un coin et tombe.
    let n = els.length;
    els.forEach((el) => {
      el.style.transformOrigin = 'top left'; el.style.pointerEvents = 'none'; el.style.zIndex = '30';
      gx().animate(el, [
        { transform: 'none', opacity: 1 },
        { transform: 'rotate(-4deg) translateY(-6px) scale(1.04)', opacity: 1, offset: 0.25 },
        { transform: 'rotate(14deg) translate(18px, 64px) scale(.8)', opacity: 0 },
      ], { duration: 480, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'forwards' }).onfinish = () => { if (--n === 0) go(); };
    });
  };
  const undo = () => { const t = toast; if (!t) return; setToast(null); create(strip(t.p)); };
  useEffect(() => { if (!toast) return; const k = toast.k; const t = window.setTimeout(() => setToast((x) => (x?.k === k ? null : x)), 6500); return () => window.clearTimeout(t); }, [toast]);

  // ---------------------------------------------------------------- éditeur (bulle)
  const openEditor = (draft: Draft, el: Element | null, isNew: boolean) => {
    const rect = (el || rootRef.current!).getBoundingClientRect();
    setSel(isNew ? null : draft.id || null);
    setEditor({ draft, rect, isNew });
  };
  const closeEditor = (commit?: Draft) => {
    const ed = editor; setEditor(null); setPreview(null);
    if (!ed || !commit) return;
    if (ed.isNew) { create(commit); return; }
    const cur = (items || []).find((x) => x.id === ed.draft.id); if (!cur) return;
    const patch: Partial<PostIt> = {};
    (['title', 'start', 'end', 'allDay', 'color'] as const).forEach((k) => { const v = k === 'title' ? commit.title.trim() : commit[k]; if (cur[k] !== v) (patch as any)[k] = v; });
    if (Object.keys(patch).length) save(cur, patch);
    if (patch.color) setLastColor(patch.color);
  };
  /** Ouvre la bulle d'édition sur le fantôme du post-it en cours de création (après son rendu). */
  const editGhost = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    const g = previewRef.current; if (!g || g.id !== NEW) return;
    openEditor({ ...g, id: undefined }, rootRef.current?.querySelector(`[data-pid="${NEW}"]`) || null, true);
  }));
  /** Nouveau post-it à l'heure ronde suivante (bouton « Post-it », touche N). */
  const quickNew = () => {
    if (editor) closeEditor();
    const d = new Date(), t = fmtDay(d), m = clamp((d.getHours() + 1) * 60, 0, DAY_MIN - 60);
    if (view === 'month') { setPreview({ id: NEW, title: '', start: t, end: t, allDay: true, color: lastColor }); }
    else {
      setPreview({ id: NEW, title: '', start: slotOf(t, m), end: slotOf(t, m + 60), allDay: false, color: lastColor });
      scrollRef.current?.scrollTo({ top: Math.max(0, (m / 60 - 2) * H), behavior: 'smooth' });
    }
    if (!days.includes(t)) { slide.current = t > anchor ? 1 : -1; setAnchor(t); }
    editGhost();
  };

  // ---------------------------------------------------------------- gestes (pointeur)
  const colRects = () => [...(paneRef.current?.querySelectorAll<HTMLElement>('[data-day]') || [])].map((el) => ({ day: el.dataset.day!, r: el.getBoundingClientRect() }));
  const dayAt = (cols: { day: string; r: DOMRect }[], x: number, y?: number) => {
    const hit = cols.find((c) => x >= c.r.left && x < c.r.right && (y === undefined || (y >= c.r.top && y < c.r.bottom)));
    if (hit) return hit.day;
    // Hors des colonnes : la plus proche (on ne perd jamais la feuille).
    let best = cols[0], bd = Infinity;
    cols.forEach((c) => { const dd = Math.abs(x - (c.r.left + c.r.right) / 2) + (y === undefined ? 0 : Math.abs(y - (c.r.top + c.r.bottom) / 2)); if (dd < bd) { bd = dd; best = c; } });
    return best?.day;
  };
  const minAt = (y: number) => { const g = gridRef.current!.getBoundingClientRect(); return clamp(((y - g.top) / H) * 60, 0, DAY_MIN); };
  /** Défilement automatique quand le pointeur frôle le haut ou le bas de la grille. */
  const autoScroll = (y: number) => {
    const sc = scrollRef.current; if (!sc) return 0;
    const r = sc.getBoundingClientRect(), edge = 36;
    const v = y < r.top + edge ? -(r.top + edge - y) : y > r.bottom - edge ? y - (r.bottom - edge) : 0;
    if (v) sc.scrollTop += clamp(v, -edge, edge) * 0.5;
    return v;
  };
  /**
   * Geste générique : seuil de 4 px avant de démarrer, boucle rAF tant que le geste dure
   * (défilement auto + inclinaison), `up(moved)` au relâchement.
   */
  const gesture = (e: React.PointerEvent, h: { start?: () => void; move: (x: number, y: number) => void; frame?: (x: number, y: number, vx: number) => void; up: (moved: boolean) => void }) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    rootRef.current?.focus({ preventScroll: true });
    const sx = e.clientX, sy = e.clientY; let x = sx, y = sy, lx = sx, vx = 0, moved = false, raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); vx = vx * 0.82 + (x - lx) * 0.18; lx = x; if (autoScroll(y)) h.move(x, y); h.frame?.(x, y, vx); };
    const mv = (ev: PointerEvent) => {
      x = ev.clientX; y = ev.clientY;
      if (!moved && Math.hypot(x - sx, y - sy) < 4) return;
      if (!moved) { moved = true; h.start?.(); raf = requestAnimationFrame(loop); }
      h.move(x, y);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      cancelAnimationFrame(raf); h.up(moved);
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  // Micro-rebond de l'étiquette horaire à chaque cran franchi (étirer, tracer).
  const tick = () => requestAnimationFrame(() => anim(rootRef.current?.querySelector('.pst-it.live .pst-time'), [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { spring: 'bouncy', duration: 260 }));

  /** Cliquer-glisser dans la grille horaire : trace un nouveau créneau (un simple clic = 1 h). */
  const onGridDown = (e: React.PointerEvent, day: string) => {
    if (e.button !== 0) return;
    if (editor) { closeEditor(); return; }
    setSel(null);
    const a = Math.floor(minAt(e.clientY) / SNAP) * SNAP;
    const mk = (s0: number, e0: number): PostIt => ({ id: NEW, title: '', start: slotOf(day, s0), end: slotOf(day, e0), allDay: false, color: lastColor });
    let last = '';
    gesture(e, {
      move: (_x, y) => {
        const b = snap(minAt(y)), p = b < a ? mk(b, a + SNAP) : mk(a, Math.max(b, a + SNAP)), k = p.start + p.end;
        if (k !== last) { last = k; setPreview(p); tick(); }
      },
      up: (moved) => {
        if (!moved) { const s0 = clamp(Math.floor(a / 30) * 30, 0, DAY_MIN - 60); setPreview(mk(s0, s0 + 60)); }
        editGhost();
      },
    });
  };

  /** Cliquer-glisser sur des JOURS (bande « journée entière », cases du mois) : nouveau post-it journée entière. */
  const onDaysDown = (e: React.PointerEvent, day: string) => {
    if (e.button !== 0) return;
    if (editor) { closeEditor(); return; }
    setSel(null);
    const cols = colRects(), mk = (b: string): PostIt => ({ id: NEW, title: '', start: b < day ? b : day, end: b < day ? day : b, allDay: true, color: lastColor });
    let last = day;
    gesture(e, {
      move: (x, y) => { const b = dayAt(cols, x, view === 'month' ? y : undefined); if (b && b !== last) { last = b; setPreview(mk(b)); } },
      up: () => { if (!previewRef.current) setPreview(mk(day)); editGhost(); },
    });
    setPreview(mk(day));
  };

  /** Feuille saisie : elle se soulève, suit le pointeur en s'inclinant ; un fantôme pointillé montre la cible. */
  const onItemDown = (e: React.PointerEvent, p: PostIt, mode: 'move' | Edge) => {
    if (e.button !== 0) return;
    if (editor) closeEditor();
    if (p.id.startsWith('tmp-')) { e.stopPropagation(); return; }    // pas encore en base
    const el = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-pid]')!;
    const r0 = el.getBoundingClientRect(), gx0 = e.clientX - r0.left, gy0 = e.clientY - r0.top;
    const cols = colRects(), inGrid = !p.allDay && view === 'week' && !!gridRef.current && !!el.dataset.sday;
    const sd0 = p.allDay ? p.start : p.start.slice(0, 10);
    const grabDay = el.dataset.sday || dayAt(cols, e.clientX, view === 'month' ? e.clientY : undefined) || sd0;
    const dur = p.allDay ? daysBetween(p.start, p.end) : durationOf(p);
    // Minute saisie, comptée depuis le DÉBUT du post-it (un créneau peut commencer un jour plus tôt).
    const grabOff = inGrid ? minAt(e.clientY) + daysBetween(sd0, grabDay) * DAY_MIN - minOf(p.start) : 0;
    const grabDayOff = daysBetween(sd0, grabDay);
    let target: PostIt = p, rot = 0, key = '';
    setSel(p.id);
    const compute = (x: number, y: number): PostIt => {
      const day = dayAt(cols, x, view === 'month' ? y : undefined) || grabDay;
      if (mode === 'move') {
        if (inGrid) { const s = snap(minAt(y) - grabOff); return { ...p, start: slotOf(day, s), end: slotOf(day, s + dur) }; }
        const ns = addDays(day, -grabDayOff);
        return p.allDay ? { ...p, start: ns, end: addDays(ns, dur) } : { ...p, ...moveBy(p, daysBetween(sd0, ns)) };
      }
      if (mode === 'top' || mode === 'bottom') {
        // Minutes comptées depuis le jour de DÉBUT (bas) ou de FIN (haut) : un créneau peut s'étirer sur la nuit.
        const m = snap(minAt(y)), ed = p.end.slice(0, 10);
        if (mode === 'bottom') return { ...p, end: slotOf(sd0, Math.max(minOf(p.start) + SNAP, daysBetween(sd0, day) * DAY_MIN + m)) };
        const endAbs = daysBetween(day, ed) * DAY_MIN + minOf(p.end);
        return { ...p, start: slotOf(day, Math.min(m, endAbs - SNAP)) };
      }
      // Bords d'une barre (journée entière, mois) : on étire en jours.
      const [sd, ed] = spanOf(p);
      if (mode === 'left') { const ns = day > ed ? ed : day; return p.allDay ? { ...p, start: ns } : { ...p, start: slotOf(ns, minOf(p.start)) }; }
      const ne = day < sd ? sd : day; return p.allDay ? { ...p, end: ne } : { ...p, end: slotOf(ne, minOf(p.end) || DAY_MIN) };
    };
    gesture(e, {
      start: () => { if (mode === 'move') setFloat({ p, w: r0.width, h: r0.height }); setPreview({ ...p }); },
      move: (x, y) => {
        target = compute(x, y);
        const k = target.start + target.end;
        if (k !== key) { key = k; setPreview(target); if (mode !== 'move') tick(); }
      },
      frame: (x, y, vx) => {
        const f = floatRef.current; if (mode !== 'move' || !f) return;
        const host = rootRef.current!.getBoundingClientRect();
        rot = rot * 0.8 + clamp(vx * 0.9, -9, 9) * 0.2;
        f.style.transform = `translate(${x - gx0 - host.left}px, ${y - gy0 - host.top}px) rotate(${rot.toFixed(2)}deg) scale(1.05)`;
      },
      up: (moved) => {
        const fr = floatRef.current?.getBoundingClientRect();
        setFloat(null); setPreview(null);
        if (!moved) return;
        if (mode === 'move' && fr) landing.current = { id: p.id, rect: fr, rot };
        if (target.start !== p.start || target.end !== p.end) save(p, { start: target.start, end: target.end });
      },
    });
  };
  const onItemDbl = (e: React.MouseEvent, p: PostIt) => { e.stopPropagation(); if (!p.id.startsWith('tmp-')) openEditor({ ...p }, e.currentTarget as Element, false); };
  const onItemMenu = (e: React.MouseEvent, p: PostIt) => {
    e.preventDefault(); e.stopPropagation(); setSel(p.id);
    if (p.id.startsWith('tmp-')) return;
    const el = e.currentTarget as Element;
    gx().menu.open([
      { header: p.title },
      { label: 'Modifier…', icon: 'edit', kbd: '↵', action: () => openEditor({ ...p }, el, false) },
      { label: 'Dupliquer le lendemain', icon: 'copy', action: () => create({ ...strip(p), ...moveBy(p, 1) }) },
      '-', { header: 'Couleur' },
      ...COLORS.map((c) => ({ label: c.l, checked: p.color === c.id, action: () => { save(p, { color: c.id }); setLastColor(c.id); } })),
      '-', { label: 'Supprimer', icon: 'trash', kbd: 'Suppr', action: () => remove(p) },
    ], { x: e.clientX, y: e.clientY });
  };

  // ---------------------------------------------------------------- clavier
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const p = sel ? (items || []).find((x) => x.id === sel) : null;
    if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); nav(1); }
    else if (e.key === 't' || e.key === 'T') goToday();
    else if (e.key === 's' || e.key === 'S') setView('week');
    else if (e.key === 'm' || e.key === 'M') setView('month');
    else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); quickNew(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && p) { e.preventDefault(); remove(p); }
    else if (e.key === 'Enter' && p) { e.preventDefault(); openEditor({ ...p }, rootRef.current?.querySelector(`[data-pid="${p.id}"]`) || null, false); }
    else if (e.key === 'Escape') setSel(null);
  };

  // ---------------------------------------------------------------- rendu : une feuille
  // ⚠️ Fonction, PAS un composant (<Paper/>) : déclaré dans le rendu, un composant serait REMONTÉ à
  // chaque rendu — nœuds DOM recréés, plus aucune animation FLIP possible.
  const paper = ({ k, p, cls, style, flip, day, resize, children }: { k: string; p: PostIt; cls: string; style: React.CSSProperties; flip: string; day?: string; resize: Edge[]; children: React.ReactNode }) => {
    const c = colorOf(p.color), ghost = p.id === NEW;
    return (
      <div key={k} className={`${cls} ${ghost ? 'ghost' : ''} ${preview?.id === p.id ? 'live' : ''} ${sel === p.id ? 'sel' : ''} ${float?.p.id === p.id ? 'lifted' : ''}`}
        data-pid={p.id} data-flip={flip} data-sday={day}
        style={{ ...style, '--pc': c.bg, '--pe': c.edge } as React.CSSProperties}
        onPointerDown={ghost ? (e) => e.stopPropagation() : (e) => onItemDown(e, p, 'move')} onDoubleClick={ghost ? undefined : (e) => onItemDbl(e, p)}
        onContextMenu={ghost ? undefined : (e) => onItemMenu(e, p)} title={ghost || float ? undefined : `${p.title}\n${whenLabel(p)}`}>
        {children}
        {ghost ? null : resize.map((r) => <i key={r} className={`pst-rz ${r}`} onPointerDown={(e) => onItemDown(e, p, r)} />)}
      </div>
    );
  };
  const label = (p: PostIt) => p.title || 'Nouveau post-it';

  // ---------------------------------------------------------------- rendu : semaine
  const renderWeek = () => {
    const timed = layoutTimed(list, days);
    const bars = layoutBars(list, days, (p) => p.allDay);
    const lanes = Math.max(1, ...bars.map((b) => b.lane + 1));
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return (
      <div className="pst-week" style={{ '--n': days.length } as React.CSSProperties}>
        <div className="pst-wh">
          <div className="pst-gut" />
          {days.map((d) => (
            <div key={d} className={`pst-dh ${d === todayS ? 'today' : ''} ${dowOf(d) >= 5 ? 'we' : ''}`}>
              <span className="w">{JOURS_C[dowOf(d)]}</span><span className="n">{parseDay(d).getDate()}</span>
            </div>
          ))}
        </div>
        <div className="pst-band" style={{ '--lanes': lanes } as React.CSSProperties}>
          <div className="pst-gut lbl">Journée</div>
          {days.map((d) => <div key={d} className={`pst-bc ${dowOf(d) >= 5 ? 'we' : ''} ${d === todayS ? 'today' : ''}`} data-day={d} onPointerDown={(e) => onDaysDown(e, d)} />)}
          <div className="pst-bars">
            {bars.map((b) => paper({
              k: b.p.id, p: b.p, flip: `${b.p.id}|band`, cls: `pst-bar paper ${b.head ? 'h' : ''} ${b.tail ? 't' : ''}`,
              style: { left: `calc(${(b.a / days.length) * 100}% + 3px)`, width: `calc(${((b.b - b.a + 1) / days.length) * 100}% - 6px)`, top: 4 + b.lane * 26 },
              resize: [...(b.head ? ['left' as const] : []), ...(b.tail ? ['right' as const] : [])],
              children: <span className="pst-t">{label(b.p)}</span>,
            }))}
          </div>
        </div>
        <div className="pst-scroll scroll" ref={scrollRef}>
          <div className="pst-grid" ref={gridRef} style={{ height: 24 * H }}>
            <div className="pst-hours">{Array.from({ length: 23 }, (_, i) => <span key={i} style={{ top: (i + 1) * H }}>{`${String(i + 1).padStart(2, '0')}:00`}</span>)}</div>
            {days.map((d) => (
              <div key={d} className={`pst-col ${d === todayS ? 'today' : ''} ${dowOf(d) >= 5 ? 'we' : ''}`} data-day={d} onPointerDown={(e) => onGridDown(e, d)}>
                {timed.get(d)!.map((s) => {
                  const hgt = ((s.e - s.s) / 60) * H;
                  return paper({
                    k: s.p.id + d, p: s.p, day: d, flip: `${s.p.id}|${d}`, cls: `pst-it paper ${s.head ? 'h' : ''} ${s.tail ? 't' : ''} ${hgt < 40 ? 'sm' : ''}`,
                    style: { top: (s.s / 60) * H + 1, height: Math.max(hgt - 2, 10), left: `calc(${(s.col / s.cols) * 100}% + 2px)`, width: `calc(${100 / s.cols}% - ${s.cols > 1 ? 3 : 6}px)` },
                    resize: [...(s.head ? ['top' as const] : []), ...(s.tail ? ['bottom' as const] : [])],
                    children: <><span className="pst-t">{label(s.p)}</span><span className="pst-time">{hhmm(s.head ? minOf(s.p.start) : 0)} – {hhmm(s.tail ? minOf(s.p.end) : 0)}</span></>,
                  });
                })}
                {d === todayS ? <div className="pst-now" style={{ top: (nowMin / 60) * H }}><i /></div> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------- rendu : mois
  const renderMonth = () => {
    const m = parseDay(anchor).getMonth(), maxL = Math.max(1, Math.floor((rowH - 30) / 22));
    const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7));
    return (
      <div className="pst-month" ref={monthRef}>
        <div className="pst-mh">{JOURS_C.map((j, i) => <span key={j} className={i >= 5 ? 'we' : ''}>{j}</span>)}</div>
        <div className="pst-mgrid">
          {weeks.map((wk) => {
            const bars = layoutBars(list, wk, () => true);
            const hidden = wk.map((_, i) => bars.filter((b) => b.lane >= maxL && b.a <= i && b.b >= i).length);
            return (
              <div key={wk[0]} className="pst-mrow">
                {wk.map((d, i) => (
                  <div key={d} className={`pst-mcell ${d === todayS ? 'today' : ''} ${parseDay(d).getMonth() !== m ? 'out' : ''} ${dowOf(d) >= 5 ? 'we' : ''}`} data-day={d} onPointerDown={(e) => onDaysDown(e, d)}>
                    <span className="n">{parseDay(d).getDate()}</span>
                    {hidden[i] ? <button className="pst-more" onPointerDown={(e) => e.stopPropagation()} onClick={() => { setAnchor(d); setView('week'); }}>+{hidden[i]}</button> : null}
                  </div>
                ))}
                <div className="pst-mbars">
                  {bars.filter((b) => b.lane < maxL).map((b) => {
                    const filled = b.p.allDay || b.b > b.a;
                    return paper({
                      k: b.p.id, p: b.p, flip: `${b.p.id}|m${wk[0]}`, cls: `pst-bar ${filled ? 'paper' : 'dot'} ${b.head ? 'h' : ''} ${b.tail ? 't' : ''}`,
                      style: { left: `calc(${(b.a / 7) * 100}% + 3px)`, width: `calc(${((b.b - b.a + 1) / 7) * 100}% - 6px)`, top: 26 + b.lane * 22 },
                      resize: b.p.allDay ? [...(b.head ? ['left' as const] : []), ...(b.tail ? ['right' as const] : [])] : [],
                      children: <>{filled ? null : <i className="pst-dot" />}{!b.p.allDay && b.head ? <span className="pst-h">{hhmm(minOf(b.p.start))}</span> : null}<span className="pst-t">{label(b.p)}</span></>,
                    });
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------- rendu
  const count = (items || []).length;
  return (
    <div className="app pst" ref={rootRef} tabIndex={-1} onKeyDown={onKey}>
      <div className="app-head pst-head">
        <div className="ah-t"><span className="ah-eye">Gestion de projets</span><h1>To-do</h1>
          <span className="sub">Post-it · votre agenda personnel{count ? <> · <b className="num" style={{ color: 'var(--text)' }}>{count}</b> post-it</> : null}</span></div>
        <div className="ah-f">{switcher}
          <button className="btn primary" data-tip="Nouveau post-it (N)" onClick={quickNew}><Icon name="plus" size="sm" /><span>Post-it</span></button></div>
      </div>
      <div className="pst-nav">
        <button className="btn sm" onClick={goToday} data-tip="Aujourd’hui (T)">Aujourd’hui</button>
        <button className="icon-btn" aria-label="Période précédente" data-tip="Précédent (←)" onClick={() => nav(-1)}><Icon name="chevleft" size="sm" /></button>
        <button className="icon-btn" aria-label="Période suivante" data-tip="Suivant (→)" onClick={() => nav(1)}><Icon name="chevright" size="sm" /></button>
        <h2 className="pst-title" key={title}>{title}</h2>
        <span className="grow" />
        <Seg value={view} onChange={setView} options={[['week', compact ? '3 jours' : 'Semaine'], ['month', 'Mois']]} />
      </div>
      <div className="pst-stage" ref={stageRef}>
        <div className="pst-pane" ref={paneRef}>
          {items === null ? <div className="pst-load">Chargement…</div> : view === 'week' ? renderWeek() : renderMonth()}
        </div>
        {items && !count && !preview && !editor ? <div className="pst-hint"><Icon name="edit" size="sm" />Cliquez-glissez dans l’agenda pour poser votre premier post-it</div> : null}
      </div>
      {float ? (
        <div className="pst-float paper" ref={floatRef} style={{ width: float.w, height: float.h, '--pc': colorOf(float.p.color).bg, '--pe': colorOf(float.p.color).edge } as React.CSSProperties}>
          <span className="pst-t">{label(float.p)}</span><span className="pst-time">{whenLabel(preview || float.p)}</span>
        </div>
      ) : null}
      {editor ? <React.Fragment key={editor.draft.id || 'new'}><Editor ed={editor} root={rootRef.current!}
        onPreview={(d) => setPreview({ ...d, id: editor.isNew ? NEW : editor.draft.id } as PostIt)}
        onClose={closeEditor} onDelete={editor.isNew ? undefined : () => { const p = (items || []).find((x) => x.id === editor.draft.id); if (p) remove(p); }} /></React.Fragment> : null}
      {toast ? (
        <div className="pst-toast" key={toast.k}>
          <Icon name="trash" size="sm" /><span className="ellipsis">« {toast.p.title} » supprimé</span>
          <button className="btn sm" onClick={undo}>Annuler</button><i className="pst-toast-bar" />
        </div>
      ) : null}
    </div>
  );
}

// =====================================================================
// Bulle d'édition — titre, couleur, journée entière, horaires. Entrée valide, Échap annule.
// Chaque modification se voit aussitôt sur la feuille (aperçu) ; rien n'est écrit avant « Coller » / « OK ».
// =====================================================================
function Editor({ ed, root, onPreview, onClose, onDelete }: { ed: { draft: Draft; rect: DOMRect; isNew: boolean }; root: HTMLElement; onPreview: (d: Draft) => void; onClose: (commit?: Draft) => void; onDelete?: () => void }) {
  const [d, setD] = useState<Draft>(ed.draft);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null), inp = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Draft>) => { const n = { ...d, ...patch }; setD(n); setErr(null); onPreview(n); };
  // Position : à droite de la feuille si la place le permet, sinon à gauche ; bornée verticalement.
  const [pos, setPos] = useState<{ x: number; y: number; side: 'l' | 'r' } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const host = root.getBoundingClientRect(), r = ed.rect, w = el.offsetWidth, h = el.offsetHeight;
    const right = r.right + 12 + w <= host.right - 8;
    const x = right ? r.right + 12 : Math.max(host.left + 8, r.left - 12 - w);
    const y = clamp(r.top + Math.min(r.height, 60) / 2 - 40, host.top + 8, host.bottom - h - 8);
    setPos({ x: x - host.left, y: y - host.top, side: right ? 'r' : 'l' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!pos) return;
    anim(ref.current, [{ opacity: 0, transform: `translateX(${pos.side === 'r' ? -12 : 12}px) scale(.9)` }, { opacity: 1, transform: 'none' }], { spring: 'snappy' });
    inp.current?.focus({ preventScroll: true }); if (!ed.isNew) inp.current?.select();
  }, [!!pos]); // eslint-disable-line react-hooks/exhaustive-deps
  // Clic hors de la bulle = annuler (comme Échap) ; l'agenda gère lui-même ses propres clics.
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const away = (e: PointerEvent) => { const t = e.composedPath()[0] as HTMLElement; if (ref.current && !ref.current.contains(t) && !t.closest?.('.menu, .pst-it, .pst-bar, .pst-col, .pst-bc, .pst-mcell')) closeRef.current(); };
    const t = window.setTimeout(() => window.addEventListener('pointerdown', away, true));
    return () => { window.clearTimeout(t); window.removeEventListener('pointerdown', away, true); };
  }, []);
  const ok = () => {
    const e = invalid(d);
    if (e) { setErr(e); anim(ref.current, [{ transform: 'none' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 340 }); inp.current?.focus(); return; }
    onClose(d);
  };
  const key = (e: React.KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); ok(); } else if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
  // Bascule journée entière ↔ créneau en gardant des dates cohérentes.
  const toggleAll = (all: boolean) => {
    if (all === d.allDay) return;
    if (all) { const sd = d.start.slice(0, 10); let e2 = d.end.slice(0, 10); if (minOf(d.end) === 0 && e2 > sd) e2 = addDays(e2, -1); set({ allDay: true, start: sd, end: e2 < sd ? sd : e2 }); }
    else set({ allDay: false, start: `${d.start}T09:00`, end: `${d.end}T10:00` });
  };
  const dayOf = (v: string) => v.slice(0, 10), timeOf = (v: string) => (v.length > 10 ? v.slice(11, 16) : '09:00');
  const setStartDay = (nd: string) => {
    if (d.allDay) { const span = daysBetween(d.start, d.end); set({ start: nd, end: addDays(nd, span) }); return; }
    const keep = durationOf(d as PostIt), st = `${nd}T${timeOf(d.start)}`; set({ start: st, end: slotOf(nd, minOf(st) + keep) });
  };
  const setStartTime = (t: string) => { const keep = durationOf(d as PostIt), st = `${dayOf(d.start)}T${t}`; set({ start: st, end: slotOf(dayOf(d.start), minOf(st) + keep) }); };
  const c = colorOf(d.color);
  return (
    <div className={`pst-ed glass glass-strong side-${pos?.side || 'r'}`} ref={ref} style={{ left: pos?.x ?? -9999, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden', '--pc': c.bg, '--pe': c.edge } as React.CSSProperties}
      onKeyDown={key} onPointerDown={(e) => e.stopPropagation()}>
      <div className="pst-ed-strip" />
      <input ref={inp} className="pst-ed-title" placeholder="Titre du post-it" value={d.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
      <div className="pst-sw">{COLORS.map((k) => (
        <button key={k.id} className={d.color === k.id ? 'on' : ''} style={{ '--c': k.bg, '--e': k.edge } as React.CSSProperties} aria-label={k.l} data-tip={k.l}
          onClick={(e) => { set({ color: k.id }); anim(e.currentTarget, [{ transform: 'scale(.7)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { spring: 'bouncy', duration: 420 }); }} />
      ))}</div>
      <label className="pst-all"><input type="checkbox" checked={d.allDay} onChange={(e) => toggleAll(e.target.checked)} /><span className="sw" /><span>Journée(s) entière(s)</span></label>
      <div className={`pst-when ${d.allDay ? 'all' : ''}`}>
        <span className="lbl">Début</span>
        <input type="date" value={dayOf(d.start)} onChange={(e) => e.target.value && setStartDay(e.target.value)} />
        {d.allDay ? null : <input type="time" step={900} value={timeOf(d.start)} onChange={(e) => e.target.value && setStartTime(e.target.value)} />}
        <span className="lbl">Fin</span>
        <input type="date" value={dayOf(d.end)} onChange={(e) => e.target.value && set(d.allDay ? { end: e.target.value } : { end: `${e.target.value}T${timeOf(d.end)}` })} />
        {d.allDay ? null : <input type="time" step={900} value={timeOf(d.end)} onChange={(e) => e.target.value && set({ end: `${dayOf(d.end)}T${e.target.value}` })} />}
      </div>
      <div className="pst-ed-when">{dayLabel(dayOf(d.start))} · {whenLabel(d as PostIt)}</div>
      {err ? <div className="pst-ed-err">{err}</div> : null}
      <div className="pst-ed-act">
        {onDelete ? <button className="icon-btn danger" aria-label="Supprimer" data-tip="Supprimer (Suppr)" onClick={onDelete}><Icon name="trash" size="sm" /></button> : null}
        <span className="grow" />
        <button className="btn sm" onClick={() => onClose()}>Annuler</button>
        <button className="btn sm primary" onClick={ok}>{ed.isNew ? 'Coller' : 'OK'}</button>
      </div>
    </div>
  );
}
