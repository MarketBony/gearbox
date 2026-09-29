import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { SocialPost, DigitalTags } from '../../../types';
import { SOCIAL_SERVICES, canEditDigital, isSiteManager } from '../../../constants';
import { db } from '../../../services/dataService';
import { useAuth } from '../../../contexts/AuthContext';
import { useSocialPosts, socialPosts, createSocialPost, updateSocialPost, deleteSocialPost, useDigitalTags, saveDigitalTags } from '../../store/collections';
import { gx, hud, Icon, PickerBtn, useSheets, useEngineEvent, useCompact } from '../ui/kit';
import { D, F0, TABS, TARGETS, type Filters, type TabId, listPosts, inPeri, tabOfLabel, labelOfTab, ssGet, ssSet, pd, todayIso, esc, stBadgeHTML, brandChipsHTML, netIcHTML, stLabel, brandLabel, estLienExterne } from './common';
import { EditoRow, type RowApi, type PickKey } from './EditoRow';
import { Planning, type Plan, type PlanApi } from './Planning';
import { TagsView } from './TagsView';
import { NewPostSheet, WordingSheet, MediaSheet, CommentsSheet } from './sheets';

// =====================================================================
// Rubrique « Digital & Social » — transposition de maquettes/v2/js/apps/digital.js sur les VRAIES
// publications (ui2/store/collections.ts). Parité : maquettes/ux/inventaires/digital.md.
//  - droits : `canEditDigital` (DIGITAL_EDIT_ROLES, External compris), le reste en lecture seule ;
//  - chef de site : onglet « Planning Digital » SEUL (et retour forcé), lecture seule ; le serveur
//    a déjà cloisonné les publications (scopeOf + redactSiteFields) ;
//  - chaque contrôle écrit UN champ, relu depuis l'état COURANT de la source (jamais une closure) ;
//  - filtres, tri, onglet, vue du Planning : mêmes clés de session que pages/Digital.tsx.
// =====================================================================

interface Pending { id: string; k: keyof SocialPost; v: any }
const same = (a: unknown, b: unknown) => (Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a || []) === JSON.stringify(b || []) : (a ?? '') === (b ?? ''));
const SERVICE_FILTER = (SOCIAL_SERVICES as string[]).filter((s) => s !== 'Tous Services');    // une seule option « Tous Services »

export default function DigitalApp({ win, inst }: AppProps) {
  const { user } = useAuth();
  const posts = useSocialPosts();
  const tags = useDigitalTags();
  const sm = isSiteManager(user?.role);
  const ed = canEditDigital(user?.role) && !gx().ctx.readOnly;
  const isAdmin = user?.role === 'Master' || user?.role === 'Administrator';
  const smSite: string | null = sm ? (gx().ctx.site || (user as any)?.sites?.[0] || null) : null;

  // --- état persistant (mêmes clés que pages/Digital.tsx)
  const [tab, setTabS] = useState<TabId>(() => (sm ? 'plan' : tabOfLabel(ssGet('digital_activeTab', 'Calendrier Editorial'))));
  const setTab = (t: TabId) => { if (sm) t = 'plan'; setTabS(t); ssSet('digital_activeTab', labelOfTab(t)); };
  const [f, setFS] = useState<Filters>(() => ({ q: ssGet('digital_searchTerm', ''), brand: ssGet<string>('digital_filterBrand', 'All') === 'All' ? '' : ssGet('digital_filterBrand', ''), service: ssGet<string>('digital_filterService', 'All') === 'All' ? '' : ssGet('digital_filterService', '') }));
  const setF = (n: Filters) => { setFS(n); ssSet('digital_searchTerm', n.q); ssSet('digital_filterBrand', n.brand || 'All'); ssSet('digital_filterService', n.service || 'All'); };
  const [sortAsc, setSortS] = useState(() => ssGet<string>('digital_sortOrder', 'asc') === 'asc');
  const setSort = (asc: boolean) => { flipNext.current = true; setSortS(asc); ssSet('digital_sortOrder', asc ? 'asc' : 'desc'); };
  const [plan, setPlanS] = useState<Plan>(() => ({ mode: ssGet<string>('digital_calendarView', 'Mois') === 'Semaine' ? 'week' : 'month', anchor: gx().today(), site: ssGet<string>('digital_filterConcession', 'All') === 'All' ? '' : ssGet('digital_filterConcession', '') }));
  const setPlan = (p: Plan) => { setPlanS(p); ssSet('digital_calendarView', p.mode === 'week' ? 'Semaine' : 'Mois'); ssSet('digital_filterConcession', p.site || 'All'); };

  const [saving, setSaving] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());
  const [, setTick] = useState(0);
  useEngineEvent('ctx', () => { gx().ui.closePick(); setTick((n) => n + 1); });
  useEffect(() => { if (sm && tab !== 'plan') setTab('plan'); }, [sm, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const appRef = useRef<HTMLDivElement>(null), bodyRef = useRef<HTMLDivElement>(null), tabsRef = useRef<HTMLDivElement>(null);
  const compact = useCompact(appRef as React.RefObject<HTMLElement>, 720);
  const { open: openSheet, portals } = useSheets(win);

  const all = posts || [];
  const fd = useDeferredValue(f);
  const L = useMemo(() => (tab === 'cal' || tab === 'arch' ? listPosts(all, tab === 'arch', fd, sortAsc) : []), [all, tab, fd, sortAsc]);
  const filtersOn = !!(f.q.trim() || f.brand || f.service);

  // ---------------------------------------------------------------- écritures
  const track = <T,>(pr: Promise<T>) => { setSaving((n) => n + 1); return pr.finally(() => setSaving((n) => n - 1)); };
  const current = (id: string) => socialPosts.get()?.find((x) => x.id === id);
  // BESOIN: journal d'activité partagé (voir BESOINS.md).
  const logAct = (action: string, p: { id?: string; title?: string }) => {
    if (!user) return;
    db.logActivity({ id: `act-${Date.now()}`, userId: user.id, userName: user.name, userColor: (user as any).avatarColor || '#f75632', action, entity: 'post', entityName: p.title || '(sans titre)', entityId: p.id, timestamp: new Date().toISOString() } as any);
  };
  /** Écrit UN champ ; refuse si la publication n'existe plus (pas de résurrection) ou si rien ne change. */
  const setField = useCallback((id: string, k: keyof SocialPost, v: any) => {
    if (!ed) return;
    const cur = current(id); if (!cur || same((cur as any)[k], v)) return;
    // BESOIN: file de sauvegarde par publication (fileSauvegardePublication) dans updateSocialPost — voir BESOINS.md.
    track(updateSocialPost({ ...cur, [k]: v } as SocialPost)).catch(() => { /* message déjà affiché, état serveur relu */ });
    if (k === 'archived' && v === true) logAct('a archivé la publication', cur);
  }, [ed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sélecteurs MULTI : la valeur est montrée tout de suite, écrite à la fermeture du menu (ou après une
  // pause) — un PUT par coche saturait la route.
  const pendRef = useRef<Pending | null>(null), pendT = useRef(0);
  const flush = useCallback(() => { clearTimeout(pendT.current); const p = pendRef.current; pendRef.current = null; setPending(null); if (p) setField(p.id, p.k, p.v); }, [setField]);
  const stage = (id: string, k: keyof SocialPost, v: any) => { if (pendRef.current && (pendRef.current.id !== id || pendRef.current.k !== k)) flush(); pendRef.current = { id, k, v }; setPending({ id, k, v }); clearTimeout(pendT.current); pendT.current = window.setTimeout(flush, 800); };
  useEffect(() => () => flush(), [flush]);

  const tagList = (k: 'networks' | 'co2' | 'lom') => ((tags as DigitalTags | null | undefined)?.[k] || []) as string[];
  const openPick = (el: HTMLElement, id: string, k: PickKey) => {
    if (!ed) return;
    const p0 = current(id); if (!p0) return;
    const p = pending && pending.id === id ? { ...p0, [pending.k]: pending.v } : p0;
    if (k === 'concessions') return gx().ui.sitePicker(el, p.concessions, (v: string[]) => stage(id, 'concessions', v), { variant: 'digital', multi: true, title: 'Sites' });
    if (k === 'status' || k === 'service' || k === 'lom') {
      const groups = k === 'status' ? [{ items: D().SOCIAL_STATUS.map((s: any) => ({ v: s.id, l: stLabel(s.id), color: s.strike ? 'var(--surface-4)' : s.c })) }]
        : k === 'service' ? [{ items: (SOCIAL_SERVICES as string[]).map((s) => ({ v: s, l: s, color: D().SERVICE_COLOR[s] })) }]
        : [{ items: [{ v: '', l: 'Aucune' }, ...[...tagList('lom'), ...(p.lom && !tagList('lom').includes(p.lom) ? [p.lom] : [])].map((l) => ({ v: l, l }))] }];
      return gx().ui.pick(el, groups, { multi: false, search: false, selected: [(p as any)[k] || ''], title: k === 'status' ? 'Statut' : k === 'service' ? 'Service' : 'Loi LOM', width: k === 'lom' ? 340 : undefined,
        onChange: ([v]: string[]) => {
          setField(id, k, v || '');
          if (k === 'status') requestAnimationFrame(() => { const r = el.closest('.dig-row')?.querySelector('.dig-rail'); if (r) gx().animate(r, [{ transform: 'scaleY(.2)' }, { transform: 'none' }], { spring: 'bouncy' }); });
        } });
    }
    const vals: string[] = (p as any)[k] || [];
    const groups = k === 'brands' ? [{ items: D().BRANDS.map((b: any) => ({ v: b.id, l: b.label || b.id, color: b.hex })) }]
      : k === 'networks' ? [{ items: [...tagList('networks'), ...vals.filter((x) => !tagList('networks').includes(x))].map((n) => ({ v: n, l: n, color: D().network(n)?.c })) }]
      : [{ items: [...tagList('co2'), ...vals.filter((x) => !tagList('co2').includes(x))].map((c) => ({ v: c, l: c })) }];
    gx().ui.pick(el, groups, { multi: true, selected: vals, title: k === 'brands' ? 'Marques' : k === 'networks' ? 'Réseaux' : 'Classes CO²', allLabel: k === 'networks' ? 'Aucun' : 'Aucune',
      width: k === 'co2s' ? 280 : undefined, search: k === 'co2s' ? true : undefined,
      onChange: (v: string[]) => {
        // Holding (GROUPE BONY) : tag marque EXCLUSIF (CLAUDE.md) — Digital.tsx ne l'appliquait pas.
        if (k === 'brands' && v.length > 1 && v.includes('Holding')) {
          const cur = pendRef.current?.id === id && pendRef.current.k === 'brands' ? pendRef.current.v : p.brands;
          v = cur.includes('Holding') ? v.filter((x) => x !== 'Holding') : ['Holding'];
          stage(id, k, v); gx().ui.closePick(); hud('GROUPE BONY est exclusif des autres marques'); return;
        }
        stage(id, k, v);
      },
      onClose: flush });
  };

  // --- animations de liste : FLIP au tri / à la date, surbrillance
  const flipNext = useRef(false), rects = useRef<Map<string, DOMRect> | null>(null), reveal = useRef<string | null>(null);
  const snap = () => { rects.current = new Map([...(bodyRef.current?.querySelectorAll<HTMLElement>('.dig-row') || [])].map((r) => [r.dataset.id!, r.getBoundingClientRect()])); };
  if (flipNext.current && !rects.current) snap();
  const flash = (el: Element | null | undefined) => { if (!el) return; el.classList.remove('dig-hl'); void (el as HTMLElement).offsetWidth; el.classList.add('dig-hl'); setTimeout(() => el.classList.remove('dig-hl'), 1900); };
  useLayoutEffect(() => {
    flipNext.current = false;
    const R = rects.current; rects.current = null;
    if (R) bodyRef.current?.querySelectorAll<HTMLElement>('.dig-row').forEach((r) => { const x = R.get(r.dataset.id!); if (x) gx().flip(r, x, { spring: 'soft' }); });
    const id = reveal.current;
    if (id) {
      const el = bodyRef.current?.querySelector(`.dig-row[data-id="${id}"], .dig-chip[data-id="${id}"], .dig-ag-it[data-id="${id}"]`);
      if (el) { reveal.current = null; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (el.classList.contains('dig-row')) flash(el); else setTimeout(() => gx().animate(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'none' }], { spring: 'bouncy' }), 250); }
    }
  });
  const setDate = (id: string, v: string) => { flipNext.current = true; reveal.current = id; setField(id, 'date', v); };

  const collapse = (el: HTMLElement | null, done: () => void) => {
    if (!el) return done();
    const h = el.offsetHeight; el.style.overflow = 'hidden';
    gx().animate(el, [{ height: h + 'px', opacity: 1, transform: 'none' }, { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginBottom: '-8px', transform: 'scale(.98)' }], { spring: 'snappy', fill: 'forwards' }).onfinish = () => {
      done();
      // Écriture refusée (la ligne revient après relecture) : ne pas la laisser écrasée à 0 px.
      setTimeout(() => { if (el.isConnected) { el.getAnimations().forEach((a) => a.cancel()); el.style.overflow = ''; } }, 600);
    };
  };
  const archive = (id: string, row: HTMLElement | null) => {
    const p = current(id); if (!p || !ed) return;
    const v = !p.archived;
    collapse(row, () => { setField(id, 'archived', v); hud(v ? 'Publication archivée' : 'Publication désarchivée'); });
  };
  const remove = (id: string, row: HTMLElement | null) => {
    const p = current(id); if (!p || !ed) return;
    collapse(row, () => { track(deleteSocialPost(id)).then(() => { hud('Publication supprimée'); logAct('a supprimé la publication', p); }).catch(() => { /* message affiché, liste relue */ }); });
  };

  // ---------------------------------------------------------------- volets
  const newPost = (date?: string) => {
    if (!ed) { hud('Lecture seule : création impossible'); return; }
    openSheet((close) => <NewPostSheet date={date} close={close} onCreate={async (title) => {
      const d = date || todayIso();
      try {
        const c = await track(createSocialPost({ title, status: 'À venir', date: d, targets: [], brands: [], service: 'Tous Services', networks: [], concessions: [], mediaFiles: [], mediaNames: [], link: '', wording: '', lom: '', co2: '', co2s: [], proPlus: false, archived: false } as any));
        logAct('a créé la publication', c);
        reveal.current = c.id; setTick((n) => n + 1);
        gx().shell?.notify?.({ app: 'digital', title: 'Publication créée', body: `« ${title} » — À venir, ${gx().fmt.date(pd(d))}.`, silent: true });
      } catch { /* « Échec de la création… » déjà affiché */ }
    }} />);
  };
  const openWording = (id: string) => {
    const p = current(id); if (!p) return;
    const draft = { v: p.wording || '' };
    openSheet((close) => <WordingSheet p={p} ed={ed} draft={draft} close={close} />, { width: 620, onClose: () => { if (ed && draft.v !== (current(id)?.wording || '')) setField(id, 'wording', draft.v); } });
  };
  const openMedia = (id: string) => openSheet((close) => <MediaSheet postId={id} canEdit={ed} close={close} lbHost={(win as any).body || null} />, { width: 680 });
  const openComments = (id: string) => { const p = current(id); if (p) openSheet((close) => <CommentsSheet p={p} ed={ed} uid={user?.id || ''} isAdmin={isAdmin} close={close} />, { width: 540 }); };

  const goReveal = (id: string) => {
    const p = current(id); if (!p) return;
    if (!inPeri(p)) hud(`Publication hors du périmètre « ${gx().ctx.perimetre} »`);
    reveal.current = id;
    if (sm || tab === 'plan') { setPlan({ ...plan, anchor: pd(p.date) }); setTab('plan'); setTick((n) => n + 1); return; }
    const want: TabId = p.archived ? 'arch' : 'cal';
    if (!listPosts([p], !!p.archived, f, true).length) setF(F0);
    setTab(want); setTick((n) => n + 1);
  };
  const quickLook = (p: SocialPost, origin?: Element | null) => {
    const c = p.concessions || [], M = p.mediaFiles || [];
    const ql = gx().shell?.quickLook?.({ title: p.title || 'Sans titre', origin, html: `<div style="display:grid;gap:12px">
      <div class="row wrap">${stBadgeHTML(p.status)}${gx().r.service(p.service)}${brandChipsHTML(p.brands)}${p.proPlus ? gx().r.proPlus() : ''}${p.archived ? '<span class="badge">Archivée</span>' : ''}</div>
      <div class="muted">${p.date ? gx().fmt.dateLong(pd(p.date)) : '—'} · ${TARGETS.filter(([t]) => (p.targets || []).includes(t as any)).map(([, l]) => l).join(' + ') || 'Diffusion non définie'}</div>
      <div class="card pad" style="white-space:pre-wrap;font-size:12.5px;line-height:1.55">${p.wording ? esc(p.wording) : '<span class="faint">Aucun wording</span>'}</div>
      <div class="row wrap" style="gap:6px">${p.networks.map((n) => `<span class="chip" style="cursor:default">${netIcHTML(n)}${esc(n)}</span>`).join('') || '<span class="faint">Aucun réseau</span>'}</div>
      <div class="faint" style="font-size:12px">${gx().icon('pin', 'sm')} ${esc(c.join(', ') || '—')}${(p.co2s || []).length ? ' · CO² : ' + esc(p.co2s.join(', ')) : ''}</div>
      <div class="row"><span class="faint grow" style="font-size:12px">${M.length} média(s)${M.some(estLienExterne) ? ' dont liens' : ''} · ${p.commentCount || 0} commentaire(s)</span>${sm ? '' : `<button class="btn sm primary" data-ql-open>${p.archived ? 'Voir dans les Archives' : 'Voir dans le calendrier'}</button>`}</div></div>` });
    gx().root.querySelector('.ql [data-ql-open]')?.addEventListener('click', () => { ql?.close(); reveal.current = p.id; setTab(p.archived ? 'arch' : 'cal'); if (!listPosts([p], !!p.archived, f, true).length) setF(F0); });
  };
  const duplicate = async (p: SocialPost) => {
    // Copie sans les FICHIERS hébergés : supprimer une des deux publications effacerait le fichier
    // du disque pour l'autre (routes/social.ts). Les liens externes sont gardés.
    const keep = (p.mediaFiles || []).map((u, i) => [u, (p.mediaNames || [])[i] ?? ''] as const).filter(([u]) => estLienExterne(u));
    const { id: _i, commentCount: _c, archivedAt: _a, ...rest } = p as any;
    try {
      const c = await track(createSocialPost({ ...rest, title: (p.title || '') + ' (copie)', status: 'À venir', archived: false, mediaFiles: keep.map((x) => x[0]), mediaNames: keep.map((x) => x[1]) }));
      logAct('a créé la publication', c); reveal.current = c.id; setTick((n) => n + 1);
    } catch { /* message affiché */ }
  };
  const ctxMenu = (p: SocialPost, el: HTMLElement, x: number, y: number, isChip: boolean) => {
    const setSt = D().SOCIAL_STATUS.map((s: any) => ({ label: stLabel(s.id), checked: p.status === s.id, action: () => setField(p.id, 'status', s.id) }));
    gx().menu.open([
      { label: 'Aperçu rapide', icon: 'quicklook', action: () => quickLook(p, el) },
      ...(isChip && !sm ? [{ label: p.archived ? 'Voir dans les Archives' : 'Voir dans le calendrier', icon: 'list', action: () => { reveal.current = p.id; setTab(p.archived ? 'arch' : 'cal'); if (!listPosts([p], !!p.archived, f, true).length) setF(F0); } }] : []),
      ...(!isChip ? [{ label: 'Médias…', icon: 'image', action: () => openMedia(p.id) }, { label: 'Commentaires…', icon: 'message', action: () => openComments(p.id) }] : []),
      ...(ed ? ['-', { header: 'Statut' }, ...setSt, '-',
        ...(isChip ? [{ label: 'Replanifier au lendemain', icon: 'arrowr', action: () => setField(p.id, 'date', gx().iso(gx().addDays(pd(p.date), 1))) }] : []),
        { label: 'Dupliquer', icon: 'copy', action: () => duplicate(p) },
        ...(!isChip ? [{ label: p.archived ? 'Désarchiver' : 'Archiver', icon: 'archives', action: () => archive(p.id, el) }] : [])] : []),
    ], { x, y });
  };

  // --- API stables des lignes et du Planning (les composants mémoïsés lisent `.current`)
  const rowApi = useRef<RowApi>(null as any);
  rowApi.current = {
    set: (id, k, v) => (k === 'date' ? setDate(id, v) : setField(id, k, v)), pick: openPick, wording: openWording, media: openMedia, comments: openComments,
    archive, del: remove, toggleOpen: (id) => setOpenRows((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }),
  };
  const planApi = useRef<PlanApi>(null as any);
  planApi.current = {
    quickLook: (p, el) => quickLook(p, el), newPost: (d) => newPost(d), menu: (p, el, x, y) => ctxMenu(p, el, x, y, true),
    move: (p, date, from) => {
      const old = p.date; setField(p.id, 'date', date);
      requestAnimationFrame(() => { const nc = bodyRef.current?.querySelector<HTMLElement>(`.dig-chip[data-id="${p.id}"]`); if (nc) gx().flip(nc, from, { spring: 'bouncy' }); });
      hud(`Replanifiée : ${gx().fmt.date(pd(old))} → ${gx().fmt.date(pd(date))}`);
    },
  };
  const onRowsMenu = (e: React.MouseEvent) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.dig-row'); if (!row || (e.target as HTMLElement).closest('input,textarea')) return;
    const p = current(row.dataset.id!); if (!p) return; e.preventDefault(); ctxMenu(p, row, e.clientX, e.clientY, false);
  };

  // --- onglets : le moteur pose le trait (.ink) au clic ; on le replace si l'onglet change autrement
  const tabClick = useRef(false);
  useLayoutEffect(() => { if (tabClick.current) { tabClick.current = false; return; } const h = tabsRef.current; if (h) requestAnimationFrame(() => gx().ui.refresh(h.parentElement || h)); }, [tab]);
  const bodyAnim = useRef(false);
  useLayoutEffect(() => { if (!bodyAnim.current) { bodyAnim.current = true; return; } if (tab === 'plan' || tab === 'tags') { const el = bodyRef.current?.firstElementChild; if (el) gx().animate(el, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' }); } }, [tab]);
  useEffect(() => { gx().ui.closePick(); win.setTitle('Digital', labelOfTab(tab)); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- barre du haut, commandes
  const tabs = sm ? TABS.filter((t) => t[0] === 'plan') : TABS;
  inst.command = (c: string) => {
    if (c === 'new-post' || c === 'new') { if (!ed) return hud('Lecture seule : création impossible'); if (tab !== 'cal' && tab !== 'plan') setTab('cal'); newPost(); }
    else if (typeof c === 'string' && c.startsWith('post:')) goReveal(c.slice(5));
  };
  inst.menus = () => ({
    'Fichier': [{ label: 'Nouvelle publication…', icon: 'plus', disabled: !ed, action: () => { if (tab !== 'cal' && tab !== 'plan') setTab('cal'); newPost(); } }],
    'Présentation': [
      ...tabs.map(([v, l]) => ({ label: l, checked: tab === v, action: () => setTab(v) })), '-',
      { label: 'Tri par date croissante', checked: sortAsc, disabled: tab === 'plan' || tab === 'tags', action: () => setSort(true) },
      { label: 'Tri par date décroissante', checked: !sortAsc, disabled: tab === 'plan' || tab === 'tags', action: () => setSort(false) }, '-',
      { label: 'Planning : mois', checked: plan.mode === 'month', action: () => { setPlan({ ...plan, mode: 'month' }); setTab('plan'); } },
      { label: 'Planning : semaine', checked: plan.mode === 'week', action: () => { setPlan({ ...plan, mode: 'week' }); setTab('plan'); } },
      { label: 'Revenir à aujourd’hui', icon: 'agenda', action: () => { setPlan({ ...plan, anchor: gx().today() }); setTab('plan'); } },
    ],
  });

  // ---------------------------------------------------------------- rendu
  const per = gx().ctx.perimetre && gx().ctx.perimetre !== 'Tout le réseau' && !sm ? gx().ctx.perimetre : null;
  const pickBar = (k: 'brand' | 'service', el: HTMLElement) => {
    const groups = k === 'brand'
      ? [{ items: [{ v: '', l: 'Toutes Marques' }, ...D().BRANDS.map((x: any) => ({ v: x.id, l: x.label || x.id, color: x.hex }))] }]
      : [{ items: [{ v: '', l: 'Tous Services' }, ...SERVICE_FILTER.map((s) => ({ v: s, l: s, color: D().SERVICE_COLOR[s] }))] }];
    gx().ui.pick(el, groups, { multi: false, search: false, selected: [f[k]], title: k === 'brand' ? 'Marque' : 'Service', onChange: ([v]: string[]) => setF({ ...f, [k]: v || '' }) });
  };
  const bar = tab === 'cal' || tab === 'arch' ? (
    <div className="app-head2">
      <div className="dig-fq"><span className="label">Recherche</span><label className="search"><Icon name="search" size="sm" /><input placeholder="Rechercher..." value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label></div>
      <span className="dig-fsep" />
      <div><span className="label">Marque</span><PickerBtn icon="tag" label={f.brand ? brandLabel(f.brand) : 'Toutes Marques'} active={!!f.brand} onClick={(el) => pickBar('brand', el)} /></div>
      <div><span className="label">Service</span><PickerBtn icon="layers" label={f.service || 'Tous Services'} active={!!f.service} onClick={(el) => pickBar('service', el)} /></div>
      {per ? <div><span className="label">Périmètre</span><span className="chip" style={{ cursor: 'default', height: 36 }} data-tip="Périmètre global (barre de menus)"><Icon name="pin" size="sm" />{per}</span></div> : null}
      {filtersOn ? <button className="btn ghost sm" onClick={() => setF(F0)}><Icon name="close" size="sm" />Effacer</button> : null}
      <span className="grow" /><span className="faint num" style={{ fontSize: 13, alignSelf: 'center' }}>{posts ? `${L.length} publication${L.length > 1 ? 's' : ''}` : ''}</span>
      {tab === 'cal' && ed ? <button className="btn primary" onClick={() => newPost()}><Icon name="plus" size="sm" />Ajouter</button> : null}
    </div>
  ) : null;

  let body: React.ReactNode;
  if (!posts && tab !== 'tags') body = <div className="empty" style={{ height: '100%' }}>Chargement…</div>;
  else if (tab === 'cal' || tab === 'arch') body = <>
    <div className="dig-cols"><span>Contenu du post</span><button className={`dig-sort ${sortAsc ? '' : 'desc'}`} data-tip="Inverser le tri par date" onClick={() => setSort(!sortAsc)}>Réglages · Tri par date <Icon name="arrowup" size="sm" /></button><span className="r">Média / Actions</span></div>
    <div className="dig-list" onContextMenu={onRowsMenu}>
      {tab === 'arch' ? <div className="dig-note"><Icon name="info" size="sm" /><span>Les fichiers des publications archivées sont purgés du serveur 30 jours après l’archivage ; les liens externes (WeTransfer, SharePoint, Drive…) sont conservés. Médias en lecture seule ici.</span></div> : null}
      {L.length ? L.map((p, i) => <EditoRow key={p.id} p={pending && pending.id === p.id ? { ...p, [pending.k]: pending.v } : p} i={i} ed={ed} open={openRows.has(p.id)} api={rowApi} />)
        : <div className="empty"><Icon name={tab === 'arch' ? 'archives' : 'digital'} /><b style={{ color: 'var(--text)' }}>Aucune publication trouvée dans {tab === 'arch' ? 'Archives' : 'Calendrier Editorial'}.</b>{filtersOn ? 'Aucun résultat pour ces filtres.' : ''}</div>}
    </div></>;
  else if (tab === 'plan') body = <Planning posts={all} plan={plan} setPlan={setPlan} ed={ed} compact={compact} smSite={smSite} appRef={appRef} api={planApi} />;
  else body = <TagsView tags={tags} posts={all} ed={ed} save={(patch) => { if (!ed) return; track(saveDigitalTags(patch)).catch(() => { /* message affiché, tags relus */ }); }} />;

  return (
    <div className="app dig" ref={appRef}>
      <div className="app-head"><div className="ah-t"><span className="ah-eye">Com digitale</span><h1>Digital &amp; Social</h1><span className="sub">Gestion Editoriale &amp; Réseaux</span><span className={`dig-saving ${saving > 0 ? '' : 'hide'}`}>ENREGISTREMENT...</span></div>
        <div className="ah-tabs"><div className="tabs" ref={tabsRef}>{tabs.map(([v, l, ic]) => <button key={v} data-v={v} aria-selected={tab === v} onClick={() => { if (tab !== v) { tabClick.current = true; setTab(v); } }}><Icon name={ic} size="sm" />{l}</button>)}</div></div>
        <div className="ah-f">{ed ? null : <span className="badge" style={{ '--c': 'var(--danger)' } as React.CSSProperties}><Icon name="lock" size="sm" />Lecture Seule</span>}</div></div>
      {bar}
      <div className={`dig-body ${tab !== 'plan' ? 'scroll' : ''}`} ref={bodyRef} onScroll={() => gx().ui.closePick()}>{body}</div>
      {portals}
    </div>
  );
}
