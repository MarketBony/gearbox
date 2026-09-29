import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { Project } from '../../../types';
import { PROJECT_TYPES, SERVICES, canEditProjects } from '../../../constants';
import { useAuth } from '../../../contexts/AuthContext';
import { useWorkspace, workspace, mutateProject, createProject, deleteProject, archiveProject } from '../../store/workspace';
import { nouveauProjet, sitesDuProjet } from '../../../utils/projet';
import { gx, hud, Icon, Chips, Seg, PickerBtn, ProPlus, Stack, useSheets, useCompact } from '../ui/kit';
import { D, F0, nFilters, listFor, siteTxt, marketing, brandHex, FILTER_BRANDS, type Filters, type Mode } from './common';
import { ProjectDetail, type DetailApi } from './ProjectDetail';

// =====================================================================
// Rubriques « Projets » et « Archives » + fenêtre de projet (« doc ») — transposition de
// maquettes/v2/js/apps/projects.js (mount / listHTML / build / select…) sur l'espace de travail.
// Parité : maquettes/ux/inventaires/projets.md et archives.md.
//  - sélection mémorisée en session (même clé que Projects.tsx) ; filtres mémorisés en session ;
//  - ouverture depuis la cloche, l'Agenda, le Chat, la To-do : `pendingProjectId` / `gearbox-navigate`
//    (GX.openProject). Un projet archivé demandé depuis « Projets » s'ouvre dans « Archives » ;
//  - archiver : confirmation + journal ; restaurer : immédiat (comme l'origine).
// =====================================================================

const SS = (k: string) => `gearbox_session_${k}`;
const ssGet = <T,>(k: string, d: T): T => { try { const v = sessionStorage.getItem(SS(k)); return v === null ? d : JSON.parse(v); } catch { return d; } };
const ssSet = (k: string, v: unknown) => { try { sessionStorage.setItem(SS(k), JSON.stringify(v)); } catch { /* navigation privée */ } };

const Item = React.memo(function Item({ p, sel }: { p: Project; sel: boolean }) {
  const st = D().PROJECT_STATUS[p.status], amt = p.budgetActual || 0, tags = [...(p.brands || []), ...(p.service || [])];
  return (
    <div className={`prj-item ${sel ? 'sel' : ''}`} data-id={p.id} tabIndex={-1}>
      <div className="n"><span className="t" title={p.name}>{p.name}</span>{p.proPlus ? <ProPlus /> : null}<span className="prj-pill" style={{ '--c': st.c } as React.CSSProperties}>{st.l}</span></div>
      <div className="s"><span className="ellipsis grow">{siteTxt(p)} · {p.projectType}</span>{amt > 0 ? <b className="num" style={{ color: 'var(--text)', flex: 'none' }}>{gx().fmt.eur(amt)}</b> : null}</div>
      <div className="m"><span className="dots">{(p.brands || []).slice(0, 4).map((b) => <i key={b} style={{ '--c': brandHex(b) } as React.CSSProperties} data-tip={b} />)}</span><span className="ellipsis grow" title={tags.join(' · ')}>{tags.join(' · ')}</span>
        {p.tasks.length || amt > 0 ? <><span className="prj-pbar"><i style={{ width: `${p.progress || 0}%` }} /></span><span className="num" style={{ width: 34, textAlign: 'right' }}>{p.progress || 0} %</span></> : null}</div>
    </div>
  );
}, (a, b) => a.p === b.p && a.sel === b.sel);

export default function ProjectsApp({ win, inst, mode }: AppProps & { mode: Mode }) {
  const { user } = useAuth();
  const projects = useWorkspace((s) => s.projects);
  const byId = useWorkspace((s) => s.byId);
  const users = useWorkspace((s) => s.users);
  const saving = useWorkspace((s) => s.saving) > 0;
  const ro = !canEditProjects(user?.role);
  const label = mode === 'archived' ? 'Archives' : 'Projets';
  const key = mode === 'archived' ? 'archived' : 'current';
  const [f, setFState] = useState<Filters>(() => (mode === 'doc' ? F0() : { ...F0(), ...ssGet<Partial<Filters>>(`ui2_projects_${key}_filters`, {}) }));
  const setF = (next: Filters) => { setFState(next); ssSet(`ui2_projects_${key}_filters`, next); };
  const [selId, setSel] = useState<string | null>(() => (mode === 'doc' ? win.params.id : ssGet<string | null>(`projects_${key}_selectedId`, null)));
  const [autoSel, setAutoSel] = useState(false);
  const [showF, setShowF] = useState(() => ssGet<boolean>(`projects_${key}_showFilters`, !(win.isCompact?.() ?? false)));
  const rootRef = useRef<HTMLDivElement>(null), listRef = useRef<HTMLDivElement>(null), detailRef = useRef<HTMLDivElement>(null);
  const compact = useCompact(rootRef as React.RefObject<HTMLElement>, 900) && mode !== 'doc';
  const { open: openSheet, portals } = useSheets(win);

  // Filtres DIFFÉRÉS : la saisie reste instantanée, la liste se recalcule juste derrière sans bloquer la frappe.
  const fd = useDeferredValue(f);
  const L = useMemo(() => (mode === 'doc' ? [] : listFor(projects, mode, fd)), [projects, mode, fd]);
  const n = nFilters(f);
  const p = selId ? byId[selId] : undefined;

  const select = useCallback((id: string | null | undefined, anim = true) => {
    if (!id) return; setSel(id); setAutoSel(false);
    if (mode !== 'doc') ssSet(`projects_${key}_selectedId`, id);
    const pr = workspace.getState().byId[id]; win.setTitle(label, pr?.name);
    if (anim) requestAnimationFrame(() => { const h = detailRef.current?.firstElementChild as HTMLElement | null; if (h) { gx().animate(h, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' }); } });
  }, [mode, key, label, win]);

  // Première sélection automatique (grand écran) ; titre de la fenêtre « doc »
  // (une seule fois, à l'ouverture, comme la maquette : après un archivage on reste sur « Sélectionnez un projet »)
  const autoDone = useRef(false);
  useEffect(() => { if (autoDone.current || mode === 'doc' || !L.length) return; autoDone.current = true; if (!selId || !byId[selId]) { setSel(L[0].id); setAutoSel(true); } }, [L]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!p) return; if (mode === 'doc') win.setTitle(p.name, 'Projet'); else win.setTitle(label, p.name); }, [mode, p?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  // L'élément sélectionné reste visible dans la liste
  useLayoutEffect(() => { if (selId) listRef.current?.querySelector(`.prj-item[data-id="${selId}"]`)?.scrollIntoView({ block: 'nearest' }); }, [selId]);

  // --- ouverture demandée ailleurs (cloche, Agenda, Chat, To-do…) : GX.openProject
  const openRequested = useCallback((id: string) => {
    const pr = workspace.getState().byId[id]; if (!pr || mode === 'doc') return false;
    if ((pr.status === 'Archived') !== (mode === 'archived')) {
      // Mauvaise rubrique : la bonne s'en charge (l'origine l'ouvrait dans la mauvaise vue).
      const w = gx().wm.open(pr.status === 'Archived' ? 'archives' : 'projects');
      setTimeout(() => (w || gx().wm.active())?.inst?.command?.(`select:${id}`), 60); return true;
    }
    if (f.status !== 'All' || n) setF(F0());
    select(id); return true;
  }, [mode, f, n, select]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = useWorkspace((s) => s.ready);
  useEffect(() => {
    if (!ready || mode !== 'current') return;
    const id = sessionStorage.getItem('pendingProjectId'); if (!id) return;
    sessionStorage.removeItem('pendingProjectId'); openRequested(id);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode !== 'current') return;
    const h = (e: Event) => { const id = (e as CustomEvent).detail?.projectId; if (!id) return; sessionStorage.removeItem('pendingProjectId'); openRequested(id); };
    window.addEventListener('gearbox-navigate', h);
    return () => window.removeEventListener('gearbox-navigate', h);
  }, [openRequested, mode]);

  // --- actions
  const openWindow = (id: string, origin?: HTMLElement | null) => { const pr = byId[id]; if (pr) gx().wm.open('project', { id, title: pr.name }, { origin }); };
  const moved = (pr: Project, msg: string) => {
    if (mode !== 'doc') { setSel(null); ssSet(`projects_${key}_selectedId`, null); }
    gx().shell?.notify?.({ app: 'archives', title: msg, body: `« ${pr.name} »`, silent: true });
  };
  const archive = (pr: Project) => {
    if (pr.status === 'Archived') { mutateProject(pr.id, (x) => ({ ...x, status: 'Active' })); return moved(pr, 'Projet restauré dans Projets'); }
    openSheet((close) => (
      <><div className="row" style={{ gap: 12, color: 'var(--bony-orange)' }}><Icon name="alert" size="lg" /><h3 style={{ margin: 0, color: 'var(--text)' }}>Confirmer l’archivage ?</h3></div>
        <div className="muted" style={{ marginTop: 10, lineHeight: 1.55 }}>Vous êtes sur le point d’archiver le projet <b style={{ color: 'var(--text)' }}>{pr.name}</b>.<br /><br />Il sera déplacé dans la rubrique <b style={{ color: 'var(--text)' }}>« Projets archivés »</b> et n’apparaîtra plus dans la liste des projets actifs. Il reste compté dans le budget : l’archivage est un classement, pas une annulation.</div>
        <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" onClick={() => { close(); archiveProject(pr.id); moved(pr, 'Projet archivé'); }}>Oui, archiver</button></div></>));
  };
  const restore = (pr: Project, status: Project['status']) => { mutateProject(pr.id, (x) => ({ ...x, status })); moved(pr, 'Projet restauré dans Projets'); };
  const duplicate = async (pr: Project) => {
    const base = nouveauProjet(`${pr.name} (copie)`, user?.id);
    // Copie PROPRE : seuls les champs de tâche d'entrée (liste `TASK_FIELDS` de backend/src/routes/projects.ts)
    // — `projectId`, `createdAt`… feraient échouer la création imbriquée de Prisma.
    const TASK_KEYS = ['name', 'provider', 'channel', 'cost', 'status', 'assignedUserId', 'deadline', 'startDate', 'notes', 'volumetry', 'openRate', 'npaiRate', 'stopRate', 'clickRate', 'codTxt', 'billedAmount'] as const;
    const tasks = pr.tasks.map((t) => ({ id: Math.random().toString(36).slice(2, 11), ...Object.fromEntries(TASK_KEYS.filter((k) => (t as any)[k] !== undefined).map((k) => [k, (t as any)[k]])) }) as any);
    const { createdAt: _c, updatedAt: _u, ...rest } = pr as any;
    const c: Project = { ...rest, id: base.id, name: base.name, status: 'Draft', tasks };
    const srv = await createProject(c); if (srv) { if (mode === 'archived') gx().wm.open('projects'); else select(srv.id); }
  };
  const remove = (pr: Project) => openSheet((close) => (
    <><h3>Supprimer « {pr.name} » ?</h3><div className="muted">Cette action est définitive.</div>
      <div className="foot"><button className="btn" onClick={() => close()}>Non</button><button className="btn primary" style={{ background: 'var(--danger)' }} onClick={async () => { close(); const ok = await deleteProject(pr.id); if (!ok) return; if (mode === 'doc') return win.close?.(); setSel(null); }}>Oui, supprimer</button></div></>));
  const quickLook = (pr: Project | undefined, origin?: Element | null) => {
    if (!pr) return; const esc = gx().esc, F = gx().fmt, r = gx().r;
    gx().shell?.quickLook?.({ title: pr.name, origin, html: `<div style="display:grid;gap:12px"><div class="row wrap">${r.pStatus(pr.status)}${pr.proPlus ? r.proPlus() : ''}${r.brandChips(pr.brands || [])}</div>
      <div class="muted">${esc(siteTxt(pr))} · ${esc(pr.projectType)} · ${esc((pr.service || []).join(', '))}</div>
      <div class="row" style="gap:10px"><div class="card grow" style="padding:11px 12px"><span class="label">Dates</span><b style="font-size:14px;display:block;margin-top:3px">${F.date(pr.startDate)} → ${F.date(pr.endDate)}</b></div><div class="card grow" style="padding:11px 12px"><span class="label">Budget</span><b class="num" style="font-size:14px;display:block;margin-top:3px">${F.eur(pr.budgetActual || 0)} / ${F.eur(pr.budgetPlanned || 0)}</b></div></div>
      <div><div class="row"><span class="label grow">Avancement</span><b class="num">${pr.progress || 0} %</b></div><div class="bar" style="margin-top:6px"><i style="width:${pr.progress || 0}%"></i></div></div>
      <div class="faint" style="font-size:12px">${pr.tasks.length} tâches · ${(pr.assignedUsers || []).length} personnes · Espace ou Échap pour fermer</div></div>` });
  };
  const more = (pr: Project, el: HTMLElement) => gx().menu.open([{ label: 'Dupliquer', icon: 'copy', action: () => duplicate(pr) }, { label: 'Aperçu rapide', icon: 'quicklook', kbd: 'Espace', action: () => quickLook(pr, el) }, '-', { label: pr.status === 'Archived' ? 'Restaurer' : 'Archiver…', icon: 'archives', action: () => archive(pr) }], el);
  const newProject = () => {
    if (ro || mode !== 'current') return;
    openSheet((close) => <NewProjectForm close={close} onCreate={async (name) => { const srv = await createProject(nouveauProjet(name, user?.id)); if (srv) { setF({ ...f, status: 'All' }); select(srv.id); gx().shell?.notify?.({ app: 'projects', title: 'Projet créé', body: `« ${name} » est en brouillon.`, silent: true }); } }} />);
  };

  // --- liste
  const onItems = (e: React.MouseEvent) => { const it = (e.target as HTMLElement).closest<HTMLElement>('.prj-item'); if (!it) return; if (e.ctrlKey || e.metaKey) return openWindow(it.dataset.id!, it); select(it.dataset.id!); };
  const onItemsDbl = (e: React.MouseEvent) => { const it = (e.target as HTMLElement).closest<HTMLElement>('.prj-item'); if (it) openWindow(it.dataset.id!, it); };
  const onItemsMenu = (e: React.MouseEvent) => {
    const it = (e.target as HTMLElement).closest<HTMLElement>('.prj-item'); if (!it) return; e.preventDefault(); const pr = byId[it.dataset.id!]; if (!pr) return;
    gx().menu.open([{ label: 'Ouvrir', action: () => select(pr.id) }, { label: 'Ouvrir dans une nouvelle fenêtre', icon: 'copy', action: () => openWindow(pr.id, it) }, { label: 'Aperçu rapide', icon: 'quicklook', kbd: 'Espace', action: () => quickLook(pr, it) }, '-',
      ...(ro ? [] : [{ label: pr.status === 'Archived' ? 'Restaurer' : 'Archiver…', icon: 'archives', action: () => archive(pr) }, { label: 'Dupliquer', icon: 'copy', action: () => duplicate(pr) }])], { x: e.clientX, y: e.clientY });
  };
  const toggleF = () => { const v = !showF; setShowF(v); ssSet(`projects_${key}_showFilters`, v); };
  const reset = () => setF(F0());
  const pickUsers = (el: HTMLElement) => gx().ui.pick(el, [{ items: marketing(users).map((u) => ({ v: u.id, l: u.name, hint: D().ROLES[u.role]?.l || u.role })) }], { title: 'Utilisateurs rattachés', selected: f.users, allLabel: 'Tous', search: true, onChange: (v: string[]) => setF({ ...f, users: v }) });
  const pickType = (el: HTMLElement) => gx().ui.pick(el, [{ items: [{ v: 'All', l: 'Tous types' }, ...PROJECT_TYPES.map((t) => ({ v: t, l: t }))] }], { multi: false, title: 'Objet (type)', selected: [f.type], onChange: (v: string[]) => setF({ ...f, type: v[0] }) });
  const pickStatus = (el: HTMLElement) => gx().ui.pick(el, [{ items: [{ v: 'All', l: 'Tous statuts' }, ...['Draft', 'Active', 'Done', ...(mode === 'archived' ? ['Archived'] : [])].map((s) => ({ v: s, l: D().PROJECT_STATUS[s].l, color: D().PROJECT_STATUS[s].c }))] }], { multi: false, title: 'Statut', selected: [f.status], onChange: (v: string[]) => setF({ ...f, status: v[0] }) });

  const list = (
    <div className="prj-list scroll" ref={listRef}>
      <div className="app-head"><div className="ah-t"><span className="ah-eye">Gestion de projets</span><h1 className="display">{label}</h1><span className="sub">{L.length} {mode === 'archived' ? `archive${L.length > 1 ? 's' : ''}` : `projet${L.length > 1 ? 's' : ''}`}</span></div>
        <div className="ah-f">{mode === 'current' && !ro ? <button className="btn primary" onClick={newProject}><Icon name="plus" size="sm" />Nouveau</button> : null}</div></div>
      <div className="prj-search"><label className="search"><Icon name="search" size="sm" /><input placeholder={mode === 'archived' ? 'Rechercher une archive…' : 'Rechercher un projet…'} aria-label={mode === 'archived' ? 'Rechercher une archive' : 'Rechercher un projet'} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
        <button className={`btn prj-ftog ${showF ? 'on' : ''}`} data-tip={showF ? 'Masquer les filtres' : 'Filtres avancés'} aria-label={showF ? 'Masquer les filtres' : 'Filtres avancés'} onClick={toggleF}><Icon name={showF ? 'close' : 'filter'} size="sm" />{!showF && n ? <span className="count">{n}</span> : null}</button></div>
      {showF ? <div className="card prj-fcard">
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="prj-lbl">Trier par date</span><button className="btn sm" onClick={() => setF({ ...f, sort: f.sort === 'desc' ? 'asc' : 'desc' })}>{f.sort === 'desc' ? 'Plus récents' : 'Plus anciens'} <Icon name={f.sort === 'desc' ? 'chevdown' : 'chevup'} size="sm" /></button></div>
        <div className="prj-f2">
          <div className="prj-fg"><span className="prj-lbl">Périmètre</span><PickerBtn icon="pin" label={gx().ui.summary(f.sites, { all: 'Tout le réseau' })} active={!!f.sites.length} onClick={(el) => gx().ui.sitePicker(el, f.sites, (v: string[]) => setF({ ...f, sites: v }), { variant: 'filter' })} /></div>
          <div className="prj-fg"><span className="prj-lbl">Utilisateurs</span><PickerBtn icon="users" label={f.users.length ? gx().ui.summary(f.users.map((u) => users.find((x) => x.id === u)?.name || '—')) : 'Tous'} active={!!f.users.length} onClick={pickUsers} /></div></div>
        <div className="prj-fg"><span className="prj-lbl">Marques</span><Chips values={FILTER_BRANDS} selected={f.brands} onChange={(v) => setF({ ...f, brands: v })} colors={Object.fromEntries(FILTER_BRANDS.map((b) => [b, brandHex(b)]))} /></div>
        <div className="prj-fg"><span className="prj-lbl">Services</span><Chips values={SERVICES.filter((s) => s !== 'Tous Services')} selected={f.services} onChange={(v) => setF({ ...f, services: v })} all="Tous" /></div>
        <div className="prj-f2">
          <div className="prj-fg"><span className="prj-lbl">Objet (type)</span><PickerBtn icon="tag" label={f.type === 'All' ? 'Tous types' : f.type} active={f.type !== 'All'} onClick={pickType} /></div>
          <div className="prj-fg"><span className="prj-lbl">Statut</span><PickerBtn icon="flag" label={f.status === 'All' ? 'Tous statuts' : D().PROJECT_STATUS[f.status].l} active={f.status !== 'All'} onClick={pickStatus} /></div></div>
        <div className="prj-fg"><span className="prj-lbl">PRO+ (B2B)</span><Seg value={f.pro} options={[['all', 'Tout'], ['standard', 'Sans PRO+'], ['pro', 'PRO+ uniquement']]} onChange={(v) => setF({ ...f, pro: v })} /></div>
        <div className="prj-fg"><span className="prj-lbl">Période (date de début)</span><div className="prj-fdates"><input type="date" className="input" value={f.from} aria-label="Du" title="Du" onChange={(e) => { const v = e.target.value || ''; setF({ ...f, from: v, to: f.to && v && f.to < v ? v : f.to }); }} /><span className="muted">→</span><input type="date" className="input" value={f.to} min={f.from} aria-label="Au" title="Au" onChange={(e) => setF({ ...f, to: e.target.value || '' })} /></div></div>
        <div className="prj-ffoot"><button className="prj-link" onClick={reset}>Réinitialiser</button><span className="prj-rescount">{L.length} résultat{L.length > 1 ? 's' : ''}</span></div>
      </div> : null}
      <div className="prj-items" onClick={onItems} onDoubleClick={onItemsDbl} onContextMenu={onItemsMenu}>
        {L.length ? L.map((x) => <Item key={x.id} p={x} sel={x.id === selId && !(compact && autoSel)} />) : <div className="empty"><Icon name={mode === 'archived' ? 'archives' : 'projects'} />Aucun projet trouvé</div>}
      </div>
    </div>
  );

  const api: DetailApi = { label, mode, ro, win, openSheet, saving, onArchive: archive, onRestore: restore, onDelete: remove, onMore: more,
    onWindow: (origin) => (mode === 'doc' ? gx().wm.open('projects') : p && openWindow(p.id, origin)) };
  const placeholder = <div className="empty" style={{ height: '100%' }}><Icon name={mode === 'archived' ? 'archives' : 'projects'} /><b className="display" style={{ color: 'var(--text)', fontSize: 15 }}>{mode === 'archived' ? 'Sélectionnez une archive' : 'Sélectionnez un projet'}</b>↑ ↓ pour naviguer · Espace pour l’aperçu · double-clic pour une fenêtre</div>;
  const detail = p ? <ProjectDetail key={p.id} p={p} api={api} /> : placeholder;

  // --- clavier : ↑ ↓ naviguer, Entrée = fenêtre, Espace = aperçu
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,textarea,select') || mode === 'doc') return;
    const i = L.findIndex((x) => x.id === selId);
    if (e.key === 'ArrowDown') { e.preventDefault(); select(L[Math.min(L.length - 1, i + 1)]?.id); }
    if (e.key === 'ArrowUp') { e.preventDefault(); select(L[Math.max(0, i - 1)]?.id); }
    if (e.key === ' ' && selId) { e.preventDefault(); quickLook(p, listRef.current?.querySelector(`.prj-item[data-id="${selId}"]`)); }
    if (e.key === 'Enter' && selId) openWindow(selId, listRef.current?.querySelector(`.prj-item[data-id="${selId}"]`) as HTMLElement);
  };

  inst.command = (c: string) => { if (c === 'new-project') newProject(); if (c.startsWith?.('select:')) openRequested(c.slice(7)) || select(c.slice(7)); };
  inst.menus = () => ({
    'Fichier': [...(mode === 'current' && !ro ? [{ label: 'Nouveau projet…', icon: 'plus', action: newProject }] : []), { label: 'Ouvrir dans une nouvelle fenêtre', icon: 'copy', disabled: !selId || mode === 'doc', action: () => selId && openWindow(selId) }, { label: 'Aperçu rapide', icon: 'quicklook', kbd: 'Espace', disabled: !p, action: () => quickLook(p) },
      ...(!ro && p ? ['-', { label: p.status === 'Archived' ? 'Restaurer le projet' : 'Archiver le projet…', icon: 'archives', action: () => archive(p) }] : [])],
    'Présentation': [{ label: 'Plus récents d’abord', checked: f.sort === 'desc', action: () => setF({ ...f, sort: 'desc' }) }, { label: 'Plus anciens d’abord', checked: f.sort === 'asc', action: () => setF({ ...f, sort: 'asc' }) }, '-',
      { label: showF ? 'Masquer les filtres avancés' : 'Afficher les filtres avancés', icon: 'filter', disabled: mode === 'doc', action: toggleF },
      { label: 'Réinitialiser les filtres', icon: 'refresh', disabled: mode === 'doc', action: reset }],
  });

  return (
    <div className="app" ref={rootRef} tabIndex={-1} onKeyDown={onKey}>
      {mode === 'doc'
        ? <div className="app-body"><div className="scroll prj-dhost" style={{ height: '100%' }} ref={detailRef}>{p ? detail : <div className="empty" style={{ height: '100%' }}><Icon name="projects" />Ce projet n’existe plus.</div>}</div></div>
        : compact
          ? <Stack onBack={() => { setSel(null); setAutoSel(false); }} pages={[{ key: 'list', title: label, noHead: true, content: list }, ...(p && !autoSel ? [{ key: p.id, title: p.name, content: <div className="prj-dhost" ref={detailRef}>{detail}</div> }] : [])]} />
          : <div className="app-body"><div className="split prj-split"><div className="side">{list}</div><div className="main scroll prj-dhost" ref={detailRef}>{detail}</div></div></div>}
      {portals}
    </div>
  );
}

function NewProjectForm({ close, onCreate }: { close: (v?: unknown) => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  const ok = () => { const n = name.trim(); if (!n) return; close(); onCreate(n); };
  return (
    <><h3>Nouveau projet</h3><div className="muted">Donnez un nom à votre projet pour commencer. Il naît en brouillon (Clermont, VN, Renault, OP Clients) : invisible des budgets tant qu’il n’est pas actif.</div>
      <label className="field" style={{ marginTop: 14 }}><span className="label">Nom du projet</span><input className="input" autoFocus placeholder="Nom du projet…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ok(); }} /></label>
      <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" disabled={!name.trim()} onClick={ok}>Créer</button></div></>
  );
}
