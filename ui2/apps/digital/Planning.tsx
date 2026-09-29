import React, { useLayoutEffect, useMemo, useRef } from 'react';
import type { SocialPost } from '../../../types';
import { gx, Icon, Seg, PickerBtn } from '../ui/kit';
import { D, BrandDots, Nets, StBadge, stColor, stOf, pd, monday, iso, todayIso, planPosts, esc, brandLabel, stBadgeHTML, netIcHTML } from './common';

// « Planning Digital » — `renderPlan` de la maquette : mois / semaine, filtre de site MONO (★ plaque ou
// site), info-bulle riche au survol, liste chronologique en fenêtre étroite, glisser une publication
// d'un jour à l'autre pour la replanifier (éditeurs, pointeur fin).

export interface Plan { mode: 'month' | 'week'; anchor: Date; site: string }
export interface PlanApi {
  quickLook: (p: SocialPost, el: HTMLElement) => void;
  newPost: (date: string) => void;
  move: (p: SocialPost, date: string, from: DOMRect) => void;
  menu: (p: SocialPost, el: HTMLElement, x: number, y: number) => void;
}

export function planRange(plan: Plan): [Date, Date, Date, Date] {
  if (plan.mode === 'week') { const s = monday(plan.anchor); return [s, gx().addDays(s, 6), s, gx().addDays(s, 6)]; }
  const first = new Date(plan.anchor.getFullYear(), plan.anchor.getMonth(), 1), last = new Date(plan.anchor.getFullYear(), plan.anchor.getMonth() + 1, 0);
  return [monday(first), gx().addDays(monday(last), 6), first, last];
}
const ORDER = (s: string) => D().SOCIAL_STATUS.findIndex((x: any) => x.id === s);

const Chip: React.FC<{ p: SocialPost; week: boolean }> = React.memo(function Chip({ p, week }) {
  const s = stOf(p.status);
  const nets = <span className="nets"><Nets list={p.networks} max={3} moreCls="pl" /></span>;
  return week
    ? <div className={`dig-chip ${s.strike ? 'strike' : ''} ${p.archived ? 'arch' : ''}`} data-id={p.id} style={{ '--c': stColor(p.status) } as React.CSSProperties}><div className="wk"><BrandDots brands={p.brands} /><span className="grow" />{nets}</div><span className="t">{p.title || 'Sans titre'}</span><div><StBadge id={p.status} /></div></div>
    : <div className={`dig-chip ${s.strike ? 'strike' : ''} ${p.archived ? 'arch' : ''}`} data-id={p.id} style={{ '--c': stColor(p.status) } as React.CSSProperties}>{nets}<span className="t">{p.title || 'Sans titre'}</span></div>;
}, (a, b) => a.p === b.p && a.week === b.week);

export function Planning({ posts, plan, setPlan, ed, compact, smSite, appRef, api }: {
  posts: SocialPost[]; plan: Plan; setPlan: (p: Plan) => void; ed: boolean; compact: boolean; smSite: string | null;
  appRef: React.RefObject<HTMLDivElement>; api: React.MutableRefObject<PlanApi>;
}) {
  const [a, b, first, last] = planRange(plan);
  const drag = ed && !compact;
  const P = useMemo(() => planPosts(posts, smSite ? '' : plan.site), [posts, plan.site, smSite]);
  const byId = useMemo(() => new Map(P.map((p) => [p.id, p])), [P]);
  const byDay = useMemo(() => { const m: Record<string, SocialPost[]> = {}; P.forEach((p) => (m[(p.date || '').slice(0, 10)] ??= []).push(p)); Object.values(m).forEach((l) => l.sort((x, y) => ORDER(x.status) - ORDER(y.status))); return m; }, [P]);
  const days: Date[] = []; for (let d = new Date(a); d <= b; d = gx().addDays(d, 1)) days.push(new Date(d));
  const from = iso(first), to = iso(last);
  const inRange = P.filter((p) => (p.date || '') >= from && (p.date || '').slice(0, 10) <= to);
  const title = plan.mode === 'week' ? `Semaine du ${gx().fmt.date(a)}` : plan.anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const today = todayIso();
  const hostRef = useRef<HTMLDivElement>(null), navDir = useRef<number | null>(null);
  useLayoutEffect(() => {
    const n = navDir.current; navDir.current = null; if (n === null) return;
    const g = hostRef.current?.querySelector('.dig-grid, .dig-agenda'); if (g && n !== 999) gx().animate(g, [{ opacity: 0, transform: `translateX(${n * 24}px)` }, { opacity: 1, transform: 'none' }], { spring: 'snappy' });
  }, [plan.anchor, plan.mode]);

  const nav = (n: number) => {
    navDir.current = n;
    setPlan({ ...plan, anchor: n === 0 ? gx().today() : plan.mode === 'week' ? gx().addDays(plan.anchor, 7 * n) : new Date(plan.anchor.getFullYear(), plan.anchor.getMonth() + n, 1) });
  };
  const pickSite = (el: HTMLElement) => {
    const groups = [{ items: [{ v: '', l: 'Tous Sites' }] }, ...Object.entries(D().PLAQUES as Record<string, string[]>).map(([pl, ss]) => ({ label: pl, collapsible: true, items: [{ v: pl, l: '★ ' + pl, hint: 'toute la plaque' }, ...ss.map((s) => ({ v: s, l: s }))] }))];
    gx().ui.pick(el, groups, { multi: false, selected: [plan.site], title: 'Sites', width: 280, onChange: ([v]: string[]) => setPlan({ ...plan, site: v || '' }) });
  };

  // --- info-bulle riche (survol) : balisage de la maquette, posée dans l'app
  const hc = useRef<{ el: HTMLElement | null; t: number }>({ el: null, t: 0 });
  const hideHC = () => { clearTimeout(hc.current.t); hc.current.el?.remove(); hc.current.el = null; };
  useLayoutEffect(() => hideHC, []);
  const showHC = (chip: HTMLElement) => {
    const p = byId.get(chip.dataset.id!), app = appRef.current; if (!p || !app || !chip.isConnected) return; hideHC();
    const el = document.createElement('div'); el.className = 'dig-hc glass glass-strong';
    const c = p.concessions || [];
    el.innerHTML = `<div class="row" style="gap:6px;flex-wrap:wrap">${p.brands.map((x) => `<span class="dig-bp" style="font-size:11px"><i class="brand-dot" style="--c:${D().brand(x)?.hex}"></i>${esc(brandLabel(x))}</span>`).join('') || '<span class="faint" style="font-size:11px">Aucune marque</span>'}<span class="grow"></span>${stBadgeHTML(p.status)}</div>
      <b class="t">${esc(p.title || 'Sans titre')}</b><span class="faint">${p.date ? gx().fmt.dateLong(pd(p.date)) : ''}</span>
      ${p.wording ? `<span class="muted" style="line-height:1.45">${esc(p.wording.length > 120 ? p.wording.slice(0, 118) + '…' : p.wording)}</span>` : ''}
      <div class="row wrap" style="gap:4px">${c.slice(0, 3).map((s) => `<span class="badge">${esc(s)}</span>`).join('')}${c.length > 3 ? `<span class="badge">+${c.length - 3}</span>` : ''}</div>
      <div class="row" style="gap:6px">${p.networks.map(netIcHTML).join('') || '<span class="faint">Aucun réseau</span>'}</div>`;
    app.append(el);
    const ar = app.getBoundingClientRect(), r = chip.getBoundingClientRect();
    let x = r.right - ar.left + 8, y = r.top - ar.top - 6;
    if (x + el.offsetWidth > ar.width - 6) x = r.left - ar.left - el.offsetWidth - 8;
    if (x < 6) x = Math.max(6, Math.min(r.left - ar.left, ar.width - el.offsetWidth - 6));
    y = Math.max(6, Math.min(y, ar.height - el.offsetHeight - 6));
    Object.assign(el.style, { left: x + 'px', top: y + 'px' }); hc.current.el = el;
  };
  const onOver = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const c = (e.target as HTMLElement).closest<HTMLElement>('.dig-chip'); if (!c || c.contains(e.relatedTarget as Node)) return;
    clearTimeout(hc.current.t); hc.current.t = window.setTimeout(() => showHC(c), 280);
  };
  const onOut = (e: React.PointerEvent) => { const c = (e.target as HTMLElement).closest('.dig-chip'); if (c && !c.contains(e.relatedTarget as Node)) hideHC(); };

  // --- clic = aperçu ; glisser = replanifier
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const chip = (e.target as HTMLElement).closest<HTMLElement>('.dig-chip'); const app = appRef.current; if (!chip || !app) return;
    const p = byId.get(chip.dataset.id!); if (!p) return;
    const sx = e.clientX, sy = e.clientY, can = drag && e.pointerType !== 'touch';
    let ghost: HTMLElement | null = null, over: HTMLElement | null = null, off = { x: 0, y: 0, ax: 0, ay: 0 };
    const move = (ev: PointerEvent) => {
      if (!ghost) {
        if (!can || Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        hideHC(); const r = chip.getBoundingClientRect(), ar = app.getBoundingClientRect();
        ghost = chip.cloneNode(true) as HTMLElement; ghost.classList.add('dig-ghost'); ghost.style.width = r.width + 'px';
        off = { x: sx - r.left, y: sy - r.top, ax: ar.left, ay: ar.top }; app.append(ghost); chip.classList.add('lift'); app.classList.add('dig-grab');
        gx().animate(ghost, [{ transform: 'none' }, { transform: 'rotate(-2deg) scale(1.06)' }], { spring: 'bouncy' });
      }
      ghost.style.left = ev.clientX - off.x - off.ax + 'px'; ghost.style.top = ev.clientY - off.y - off.ay + 'px';
      const d = (gx().root.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('.dig-day') || null;
      if (d !== over) { over?.classList.remove('drop'); over = d; over?.classList.add('drop'); }
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (!ghost) { api.current.quickLook(p, chip); return; }
      app.classList.remove('dig-grab'); over?.classList.remove('drop');
      const g = ghost, fromR = g.getBoundingClientRect();
      if (over && over.dataset.date && over.dataset.date !== p.date) { g.remove(); chip.classList.remove('lift'); api.current.move(p, over.dataset.date, fromR); }
      else {
        const toR = chip.getBoundingClientRect();
        gx().animate(g, [{ left: g.style.left, top: g.style.top }, { left: toR.left - off.ax + 'px', top: toR.top - off.ay + 'px', transform: 'none' }], { spring: 'snappy', fill: 'forwards' }).onfinish = () => { g.remove(); chip.classList.remove('lift'); };
      }
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  };
  const onDbl = (e: React.MouseEvent) => { if ((e.target as HTMLElement).closest('.dig-chip')) return; const d = (e.target as HTMLElement).closest<HTMLElement>('.dig-day'); if (d && ed) api.current.newPost(d.dataset.date!); };
  const onMenu = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.dig-chip, .dig-ag-it'); if (!el) return; const p = byId.get(el.dataset.id!); if (!p) return;
    e.preventDefault(); hideHC(); api.current.menu(p, el, e.clientX, e.clientY);
  };

  let grid: React.ReactNode;
  if (compact) {
    const groups: Record<string, SocialPost[]> = {};
    inRange.slice().sort((x, y) => (x.date || '').localeCompare(y.date || '')).forEach((p) => (groups[p.date.slice(0, 10)] ??= []).push(p));
    grid = (
      <div className="scroll grow dig-agenda" style={{ minHeight: 0 }} onClick={(e) => { const it = (e.target as HTMLElement).closest<HTMLElement>('.dig-ag-it'); const p = it && byId.get(it.dataset.id!); if (it && p) api.current.quickLook(p, it); }} onContextMenu={onMenu}>
        {Object.keys(groups).length ? Object.entries(groups).map(([d, ps]) => (
          <React.Fragment key={d}><div className={`dig-ag-d ${d === today ? 'today' : ''}`}>{d === today ? 'Aujourd’hui · ' : ''}{gx().fmt.dateLong(pd(d))}</div>
            {ps.map((p) => <div key={p.id} className="dig-ag-it" data-id={p.id} style={{ '--c': stColor(p.status) } as React.CSSProperties}><div className="grow" style={{ minWidth: 0 }}><div className="ellipsis" style={{ fontWeight: 600, ...(stOf(p.status).strike ? { textDecoration: 'line-through' } : {}) }}>{p.title || 'Sans titre'}</div><div className="row" style={{ gap: 4, marginTop: 3 }}><BrandDots brands={p.brands} /><span className="dig-nets"><Nets list={p.networks} max={4} /></span></div></div><StBadge id={p.status} /></div>)}</React.Fragment>
        )) : <div className="empty"><Icon name="agenda" />Aucune publication sur la période</div>}
      </div>
    );
  } else {
    grid = <>
      <div className="dig-dows">{['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d, i) => <span key={d}>{plan.mode === 'week' ? `${d} ${days[i].getDate()}` : d}</span>)}</div>
      <div className={`dig-grid ${plan.mode === 'week' ? 'week' : ''} ${drag ? 'dig-edit' : ''}`} onPointerOver={onOver} onPointerOut={onOut} onPointerDown={onDown} onDoubleClick={onDbl} onContextMenu={onMenu}>
        {days.map((d) => {
          const k = iso(d), l = byDay[k] || [], out = plan.mode === 'month' && d.getMonth() !== plan.anchor.getMonth();
          return <div key={k} className={`dig-day ${out ? 'out' : ''} ${k === today ? 'today' : ''}`} data-date={k}><div className="dn"><b>{d.getDate() === 1 && plan.mode === 'month' ? gx().fmt.date(d) : d.getDate()}</b>{l.length ? <span className="n">{l.length}</span> : null}</div><div className="dl">{l.map((p) => <Chip key={p.id} p={p} week={plan.mode === 'week'} />)}</div></div>;
        })}
      </div></>;
  }
  return (
    <div className="dig-plan" ref={hostRef} onScroll={hideHC}>
      <div className="dig-ph">
        <h2 className="grow">{title}</h2>
        <div className="row" style={{ gap: 4 }}><button className="icon-btn" data-tip="Précédent" onClick={() => nav(-1)}><Icon name="back" /></button><button className="btn sm" onClick={() => nav(0)}>Auj.</button><button className="icon-btn" data-tip="Suivant" onClick={() => nav(1)}><Icon name="chevron" /></button></div>
        <Seg value={plan.mode} options={[['month', 'Mois'], ['week', 'Sem.']]} onChange={(m) => { navDir.current = 999; setPlan({ ...plan, mode: m }); }} />
        {smSite
          ? <button className="picker-btn active" disabled><Icon name="pin" size="sm" /><span className="v">{smSite}</span><Icon name="chevdown" size="sm" /></button>
          : <PickerBtn icon="pin" label={plan.site ? (D().PLAQUES[plan.site] ? '★ ' + plan.site : plan.site) : 'Tous Sites'} active={!!plan.site} onClick={pickSite} />}
        <span className="badge num" style={{ '--c': 'var(--info)' } as React.CSSProperties}>{inRange.length} post{inRange.length > 1 ? 's' : ''}</span>
        {drag ? <span className="dig-prop" data-tip="Glisser une publication sur un autre jour pour changer sa date"><Icon name="bolt" size="sm" />Proposition · glisser pour replanifier</span> : null}
      </div>
      {grid}
    </div>
  );
}
