import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Project, Task, TaskStatus, ServiceType, BrandType } from '../../../types';
import { PROJECT_TYPES, TASK_CHANNELS, SERVICES, RDM_BRANDS } from '../../../constants';
import { groupeDuProjet, sitesDuProjet, marqueAutorisee, poserSites, basculerService, basculerMarque, nouvelleTache } from '../../../utils/projet';
import { mutateProject, useWorkspace } from '../../store/workspace';
import { gx, hud, Icon, Seg, PickerBtn, Avatar, DraftInput } from '../ui/kit';
import { D, today, marketing, userName, sortTasks, GROUP_LABEL, LABEL_GROUP, type Mode } from './common';
import { ExpertPanel, TaskFilesBlock } from './ExpertPanel';
import type { EngineWin } from '../types';

// =====================================================================
// Fiche projet — transposition de `detailHTML` / `wireDetail` (maquettes/v2/js/apps/projects.js).
// Toute écriture passe par `mutateProject` (file de sauvegarde, recalcul) et, pour les règles de
// sites / marques / services, par `utils/projet.ts` : AUCUNE règle métier écrite ici.
// Parité : maquettes/ux/inventaires/projets.md (§ 4, 5, 6, 12).
// =====================================================================

const fg = (b: string) => (b === 'Renault' ? '#1b1604' : '#fff');
const TH: [string, string, string?][] = [['name', 'Nom de la tâche'], ['provider', 'Prestataire'], ['channel', 'Canal'], ['status', 'Statut'], ['assignee', 'Assigné'], ['cost', 'Coût (€)', 'r'], ['deadline', 'Échéance']];

export interface DetailApi {
  label: string; mode: Mode; ro: boolean; win: EngineWin;
  openSheet: (render: (close: (v?: unknown) => void) => React.ReactNode, opts?: { width?: number; onClose?: (v?: unknown) => void }) => unknown;
  onWindow: (origin: HTMLElement) => void; onArchive: (p: Project) => void; onRestore: (p: Project, status: Project['status']) => void; onDelete: (p: Project) => void;
  onMore: (p: Project, el: HTMLElement) => void; saving: boolean;
}

export const ProjectDetail: React.FC<{ p: Project; api: DetailApi }> = ({ p, api }) => {
  const { ro } = api;
  const users = useWorkspace((s) => s.users);
  const [sortK, setSortK] = useState('deadline'), [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [frozen, setFrozen] = useState<string[] | null>(null);
  const [distMode, setDistMode] = useState<'%' | '€'>('%');
  const [shares, setShares] = useState<Record<string, number | null>>({});
  const tableRef = useRef<HTMLTableElement>(null), focusLast = useRef(false);

  const set = (patch: Partial<Project>) => mutateProject(p.id, (x) => ({ ...x, ...patch }));
  const setTask = (tid: string, patch: Partial<Task>) => { freeze(); mutateProject(p.id, (x) => ({ ...x, tasks: x.tasks.map((t) => (t.id === tid ? { ...t, ...patch } : t)) })); };

  const actual = p.budgetActual || 0, pr = p.progress || 0, gain = (p.budgetPlanned || 0) - actual, T = today();
  const sites = sitesDuProjet(p), gm = groupeDuProjet(p), dist: Record<string, number> = p.budgetDistribution || {};
  const total = Object.values(dist).reduce((a, b) => a + (+b || 0), 0), done = p.tasks.filter((t) => t.status === 'Done').length;
  const hasRdm = (p.brands || []).some((b) => RDM_BRANDS.includes(b)), shareBrands = hasRdm ? (['Alpine', 'Nissan'] as const).filter((b) => (p.brands || []).includes(b)) : [];
  const expert = !!p.expertMode, arch = p.status === 'Archived', dis = ro;
  const siteLbl = gm ? `${gm} · ${sites.length} sites` : sites.join(', ') || 'Sélectionner…';
  const gainC = gain >= 0 ? 'var(--ok)' : 'var(--danger)';
  const team = p.assignedUsers || [];

  const sorted = useMemo(() => sortTasks(p.tasks, sortK, sortDir, users), [p.tasks, sortK, sortDir, users]);
  const tasks = useMemo(() => {
    if (!frozen) return sorted;
    const by = new Map(p.tasks.map((t) => [t.id, t]));
    return [...frozen.map((id) => by.get(id)).filter(Boolean) as Task[], ...p.tasks.filter((t) => !frozen.includes(t.id))];
  }, [frozen, sorted, p.tasks]);
  // Gel de l'ordre dès qu'une ligne est modifiée (la ligne ne saute pas sous le curseur) ; « Retrier » libère.
  const freeze = () => { if (!frozen) setFrozen(sorted.map((t) => t.id)); };
  const sortBy = (k: string) => { setFrozen(null); if (k === sortK) setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); else { setSortK(k); setSortDir('asc'); } };

  useLayoutEffect(() => {
    if (!focusLast.current) return; focusLast.current = false;
    const rows = tableRef.current?.querySelectorAll<HTMLInputElement>('input[data-tk="name"]'); rows?.[rows.length - 1]?.focus();
  });

  // --- sites (sélecteur du moteur, variante `project`) : règle unique `poserSites`
  const pickSites = (el: HTMLElement) => {
    gx().ui.sitePicker(el, gm ? [GROUP_LABEL[gm]] : sites, (values: string[]) => {
      const picked = values.map((v) => LABEL_GROUP[v]).find((g) => g && g !== gm);
      if (picked) { mutateProject(p.id, (x) => poserSites(x, { groupe: picked })); gx().ui.closePick(); return; }
      const next = values.filter((v) => !LABEL_GROUP[v]);
      if (!next.length) { hud('Un projet garde au moins un site'); return; }
      if (gm) gx().ui.closePick();                                   // sortie du mode groupé : on repart du site choisi
      mutateProject(p.id, (x) => { const y = poserSites(x, { sites: next }); if ((y.brands || []).length < (x.brands || []).length) hud('Marque retirée : aucun site éligible'); return y; });
    }, { variant: 'project', title: 'Site / Plaque' });
  };

  // --- équipe
  const addMember = (el: HTMLElement) => gx().ui.pick(el, [{ label: 'Équipe marketing', items: marketing(users).filter((u) => !team.includes(u.id)).map((u) => ({ v: u.id, l: u.name, hint: D().ROLES[u.role]?.l || u.role })) }],
    { multi: false, title: 'Ajouter un membre', selected: [], search: true, onChange: ([v]: string[]) => { if (v && !team.includes(v)) set({ assignedUsers: [...team, v] }); } });
  const memberMenu = (u: string, el: HTMLElement) => {
    const us = users.find((x) => x.id === u);
    gx().menu.open([{ label: `${us?.name || '—'} · ${D().ROLES[us?.role || '']?.l || us?.role || ''}`, disabled: true }, ...(ro ? [] : ['-', { label: 'Retirer du projet', icon: 'close', action: () => removeMember(u) }])], el);
  };
  const removeMember = (u: string) => {
    const go = () => mutateProject(p.id, (x) => ({ ...x, assignedUsers: (x.assignedUsers || []).filter((y) => y !== u) }));
    if (team.length > 1) return go();
    api.openSheet((close) => <><h3>Retirer le dernier membre ?</h3><div className="muted">{userName(users, u)} est le seul membre du projet. Le retirer quand même ?</div><div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" onClick={() => { close(); go(); }}>Retirer</button></div></>);
  };

  const asgOpts = (t: Task) => { const L = marketing(users).map((u) => u.id); if (t.assignedUserId && !L.includes(t.assignedUserId)) L.unshift(t.assignedUserId); return L; };
  const openTask = (t: Task) => api.openSheet((close) => <TaskDetailSheet projectId={p.id} taskId={t.id} ro={ro} close={close} />, { width: 520 });

  return (
    <div className="prj-detail">
      <div className="prj-crumb">
        <span className="c">{api.mode === 'doc' ? 'Projet' : api.label} <span>/</span> <b className="ellipsis" style={{ maxWidth: 340 }}>{p.name || 'Sans nom'}</b><span className="num hide-s" style={{ marginLeft: 10 }}>ID : {p.id}</span>
          {api.saving ? <span className="tdo-saving" style={{ marginLeft: 10 }}>Sauvegarde…</span> : null}
          {ro ? <span className="badge" style={{ '--c': 'var(--danger)', marginLeft: 8 } as React.CSSProperties}><Icon name="lock" size="sm" />Lecture seule</span> : null}</span>
        <div className="acts">
          <button className="btn" data-tip={api.mode === 'doc' ? 'Revenir à la liste des projets' : 'Ouvrir dans sa propre fenêtre'} onClick={(e) => api.onWindow(e.currentTarget)}><Icon name="copy" size="sm" />{api.mode === 'doc' ? 'Ouvrir la liste' : 'Ouvrir dans une fenêtre'}</button>
          {ro ? null : <><button className="btn" data-tip="Dupliquer, aperçu…" aria-label="Plus d’actions" onClick={(e) => api.onMore(p, e.currentTarget)}><Icon name="more" size="sm" /></button><button className="btn" style={{ color: 'var(--danger)' }} onClick={() => api.onDelete(p)}><Icon name="trash" size="sm" />Supprimer</button></>}
        </div>
      </div>
      <div className="prj-titlebar">
        <div><div className="prj-eye">Titre du projet</div><DraftInput className="prj-title" value={p.name} placeholder="NOM DU PROJET" aria-label="Titre du projet" disabled={dis} onCommit={(v: string) => set({ name: v })} /></div>
        {ro ? (expert ? <span className="badge" style={{ '--c': 'var(--bony-violet)' } as React.CSSProperties}><Icon name="bolt" size="sm" />Mode Expert actif</span> : null)
          : <button className={`btn prj-xbtn ${expert ? 'on' : ''}`} data-tip={expert ? 'Revenir à la vue simple. Aucune donnée n’est supprimée.' : 'Débloquer les indicateurs, le planning et les fichiers'} onClick={() => set({ expertMode: !expert })}><Icon name="bolt" size="sm" />{expert ? 'Mode Expert actif' : 'Activer le mode Expert'}</button>}
      </div>

      <div className="prj-top">
        <section className="card prj-main">
          <div className="prj-r1">
            <div className="prj-fg"><span className="prj-lbl">Statut du projet</span><div className="row" style={{ gap: 8 }}>
              <Seg value={(arch ? '' : p.status) as any} options={(['Draft', 'Active', 'Done'] as const).map((s) => [s, D().PROJECT_STATUS[s].l])} style={ro ? { pointerEvents: 'none', opacity: .6 } : undefined}
                onChange={(s) => { if (ro) return; /* inerte à la souris ET au clavier (Tab + Entrée) */ if (arch) api.onRestore(p, s); else setTimeout(() => set({ status: s }), 160); }} />
              {ro ? (arch ? <span className="badge" style={{ '--c': 'var(--text-3)' } as React.CSSProperties}><Icon name="archives" size="sm" />Archivé</span> : null)
                : <button className={`btn ${arch ? 'primary' : ''}`} style={{ width: 40, padding: 0, justifyContent: 'center' }} data-tip={arch ? 'Restaurer' : 'Archiver'} aria-label={arch ? 'Restaurer' : 'Archiver'} onClick={() => api.onArchive(p)}><Icon name="archives" size="sm" /></button>}</div></div>
            <div className="prj-fg"><span className="prj-lbl">Période</span><div className="row" style={{ gap: 6 }}>
              <input type="date" className="input" value={p.startDate || ''} disabled={dis} onChange={(e) => { const v = e.target.value; set(v > p.endDate ? { startDate: v, endDate: v } : { startDate: v }); }} /><span className="muted">→</span>
              <input type="date" className="input" min={p.startDate} value={p.endDate || ''} disabled={dis} onChange={(e) => { const v = e.target.value; set({ endDate: v < p.startDate ? p.startDate : v }); }} /></div></div>
            <div className="prj-fg"><span className="prj-lbl">Client B2B</span><label className="row" style={{ gap: 10, height: 40, fontSize: 14, fontWeight: 600, cursor: 'pointer' }} data-tip="Marquer ce projet comme PRO+ (B2B)"><input type="checkbox" checked={!!p.proPlus} disabled={dis} onChange={(e) => set({ proPlus: e.target.checked })} />PRO+</label></div>
          </div>
          <div className="prj-hr" />
          <div className="prj-r3">
            <div className="prj-fg"><span className="prj-lbl">Site / plaque</span>{ro ? <div className="picker-btn" style={{ pointerEvents: 'none' }}><Icon name={gm ? 'lock' : 'pin'} size="sm" /><span className="v">{siteLbl}</span></div> : <PickerBtn icon={gm ? 'lock' : 'pin'} label={siteLbl} onClick={pickSites} />}</div>
            <div className="prj-fg"><span className="prj-lbl">Type de projet</span><select className="select" style={{ height: 40 }} value={p.projectType || 'OP Clients'} disabled={dis} onChange={(e) => set({ projectType: e.target.value as any })}>{PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            <div className="prj-fg"><span className="prj-lbl">Équipe projet <span style={{ color: 'var(--text-2)' }}>{team.length}</span></span><div className="prj-team">
              {team.map((u) => <span key={u} data-tip={`${userName(users, u)} · ${D().ROLES[users.find((x) => x.id === u)?.role || '']?.l || ''}`} onClick={(e) => memberMenu(u, e.currentTarget)}><Avatar uid={u} /></span>)}
              {!team.length ? <span className="faint" style={{ fontSize: 13 }}>Aucun membre assigné</span> : null}
              {ro ? null : <button className="prj-add" data-tip="Ajouter un membre" aria-label="Ajouter un membre" onClick={(e) => addMember(e.currentTarget)}><Icon name="plus" size="sm" /></button>}</div></div>
          </div>
          <div className="prj-r2">
            <div className="prj-fg"><span className="prj-lbl">Services</span><div className="prj-chips">{(SERVICES as ServiceType[]).map((s) => <button key={s} className={`prj-tog ${(p.service || []).includes(s) ? 'on' : ''}`} disabled={dis} onClick={() => mutateProject(p.id, (x) => basculerService(x, s))}>{s}</button>)}</div></div>
            <div className="prj-fg"><span className="prj-lbl">Marques</span><div className="prj-chips">{D().BRANDS.filter((b: any) => marqueAutorisee(sites, b.id)).map((b: any) => <button key={b.id} className={`prj-tog brand ${(p.brands || []).includes(b.id) ? 'on' : ''}`} style={{ '--c': b.hex, '--fg': fg(b.id) } as React.CSSProperties} disabled={dis} onClick={() => mutateProject(p.id, (x) => basculerMarque(x, b.id as BrandType))}>{b.id}</button>)}</div></div>
          </div>
          {shareBrands.map((b) => {
            const k = b === 'Alpine' ? 'alpineShare' : 'nissanShare', stored = p[k] ?? null, v = shares[k] !== undefined ? shares[k] ?? 100 : stored ?? 100, ign = b === 'Nissan' && shareBrands.includes('Alpine' as any);
            return (
              <div key={k} className="prj-share" style={ign ? { opacity: .55 } : undefined}><b className="l">Part {b} / RDM</b>
                <input type="range" min={0} max={100} step={1} value={v} disabled={dis || ign} aria-label={`Part ${b} (%)`}
                  onChange={(e) => setShares((s) => ({ ...s, [k]: Math.max(0, Math.min(100, +e.target.value || 0)) }))}
                  onPointerUp={() => { if (shares[k] !== undefined) { set({ [k]: shares[k] } as any); setShares((s) => { const n = { ...s }; delete n[k]; return n; }); } }}
                  onKeyUp={() => { if (shares[k] !== undefined) { set({ [k]: shares[k] } as any); setShares((s) => { const n = { ...s }; delete n[k]; return n; }); } }} />
                <span className="v num">{v} % · {100 - v} %</span>
                <span className="prj-note" style={{ flexBasis: '100%' }}>{ign ? 'Ignorée : Alpine passe avant Nissan.' : `${v} % → ${b} · ${100 - v} % → compte RDM. Curseur vide = 100 % sur la marque.`}</span></div>
            );
          })}
          <div className="prj-note">Alpine seulement avec un site Alpine, Nissan avec un site Nissan. Holding : exclusif, imputé à aucun budget.</div>
          <div className="prj-fg"><span className="prj-lbl">Description globale</span><DraftInput multiline className="textarea" rows={3} disabled={dis} placeholder="Contexte général du projet…" style={{ fontSize: 14, lineHeight: 1.55 }} value={p.description} onCommit={(v: string) => set({ description: v })} /></div>
        </section>

        <aside className="card prj-bud">
          <div><h2 className="prj-h2">Budget</h2><div className="prj-note" style={{ marginTop: 5 }}>Pilotage financier en temps réel</div></div>
          <div className="prj-b2">
            <div className="prj-fg"><span className="prj-lbl">Budget prévu</span><label className="prj-planned"><DraftInput type="number" min={0} placeholder="0" disabled={dis} value={p.budgetPlanned || 0} onCommit={(v: number) => set({ budgetPlanned: Math.max(0, v) })} /><span className="muted" style={{ fontWeight: 700 }}>€</span></label></div>
            <div className="prj-fg"><span className="prj-lbl">Réel (auto)</span><div className="prj-real num">{gx().fmt.eur(actual)}</div></div>
          </div>
          <div className="prj-fg"><div className="row" style={{ justifyContent: 'space-between' }}><span className="prj-lbl">Avancement tâches</span><b className="num" style={{ fontSize: 13.5 }}>{pr} % · {done} / {p.tasks.length}</b></div><div className="bar" style={{ height: 7 }}><i style={{ width: `${pr}%` }} /></div></div>
          <div className="prj-gain" style={{ '--c': gainC } as React.CSSProperties}><div className="prj-lbl" style={{ color: gainC }}><Icon name={gain >= 0 ? 'trending' : 'alert'} size="sm" /> {gain >= 0 ? 'Gain estimé' : 'Dépassement'}</div><b className="num">{gx().fmt.eur(Math.abs(gain))} <span style={{ fontSize: 13, fontWeight: 600 }}>({(p.budgetPlanned ? Math.abs((gain / p.budgetPlanned) * 100) : 0).toFixed(1).replace('.', ',')} %)</span></b></div>
          {sites.length > 1 ? (
            <div className="prj-fg" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="prj-lbl">Répartition budgétaire</span><Seg value={distMode} options={[['%', '%'], ['€', '€']]} onChange={setDistMode} /></div>
              {gm ? <div className="prj-note"><Icon name="lock" size="sm" /> Répartition verrouillée par {gm}.</div> : null}
              <div className="prj-dist scroll" style={{ maxHeight: 300 }}>{sites.map((s) => {
                const pct = +dist[s] || 0, amt = Math.round(actual * pct / 100), eur = distMode === '€';
                return <div key={s}><span className="n" title={s}>{s}</span>
                  <DraftInput className="num" type="number" step={eur ? 1 : 0.01} aria-label={s} disabled={!!gm || ro || (eur && !(actual > 0))} value={eur ? amt : +pct.toFixed(2)}
                    onCommit={(v: number) => mutateProject(p.id, (x) => ({ ...x, budgetDistribution: { ...(x.budgetDistribution || {}), [s]: eur ? (actual > 0 ? (v / actual) * 100 : 0) : v } }))} />
                  <small className="num">{eur ? `${+pct.toFixed(1)} %` : gx().fmt.eurK(amt)}</small></div>;
              })}</div>
              {distMode === '€' && !(actual > 0) ? <div className="prj-note" style={{ color: 'var(--warn)' }}>Budget réalisé = 0 € : saisie en € indisponible (utilisez le mode %).</div> : null}
              <div className="row" style={{ justifyContent: 'flex-end', fontSize: 13 }}>Total : <b className="num" style={{ marginLeft: 6, color: Math.abs(total - 100) > 0.1 ? 'var(--danger)' : 'var(--ok)' }}>{total.toFixed(1)} %</b></div>
            </div>) : null}
        </aside>
      </div>

      <section className="card prj-tcard">
        <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><h2 className="prj-h2">Tâches &amp; coûts <span style={{ color: 'var(--text-3)' }}>{p.tasks.length}</span></h2>
          <div className="row" style={{ gap: 8 }}>{frozen ? <button className="btn sm ghost" onClick={() => setFrozen(null)}><Icon name="sort" size="sm" />Retrier</button> : null}
            {ro ? null : <button className="btn" onClick={() => { freeze(); focusLast.current = true; mutateProject(p.id, (x) => ({ ...x, tasks: [...x.tasks, nouvelleTache()] })); }}><Icon name="plus" size="sm" />Ajouter une tâche</button>}</div></div>
        <div className="scroll"><table ref={tableRef} className="tbl prj-tasks"><colgroup><col style={{ width: 36 }} /><col /><col style={{ width: '17%' }} /><col style={{ width: 150 }} /><col style={{ width: 140 }} /><col style={{ width: 190 }} /><col style={{ width: 120 }} /><col style={{ width: 150 }} /><col style={{ width: expert ? 84 : 44 }} /></colgroup>
          <thead><tr><th style={{ textAlign: 'center' }}>#</th>{TH.map(([k, l, cls]) => <th key={k} className={cls || ''}><button className={sortK === k && !frozen ? 'on' : ''} onClick={() => sortBy(k)}>{l}<Icon name={sortK === k ? (sortDir === 'asc' ? 'chevup' : 'chevdown') : 'sort'} size="sm" /></button></th>)}<th /></tr></thead>
          <tbody>
            {tasks.map((t, i) => {
              const late = !!t.deadline && t.deadline < T && t.status !== 'Done', lateD = late ? Math.round((+new Date(T) - +new Date(t.deadline!)) / 864e5) : 0;
              return (
                <tr key={t.id} className={late ? 'late' : ''}>
                  <td className="faint num" style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td><DraftInput className="cell" data-tk="name" value={t.name} placeholder="Description de la tâche…" disabled={dis} onCommit={(v: string) => setTask(t.id, { name: v })} /></td>
                  <td><DraftInput className="cell" value={t.provider || ''} placeholder="Prestataire…" disabled={dis} onCommit={(v: string) => setTask(t.id, { provider: v })} /></td>
                  <td><select className="cell" value={t.channel || ''} disabled={dis} onChange={(e) => setTask(t.id, { channel: e.target.value as any })}><option value="">-- Aucun --</option>{TASK_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}</select></td>
                  <td><select className="cell st" value={t.status} disabled={dis} style={{ '--c': D().TASK_STATUS[t.status]?.c } as React.CSSProperties} onChange={(e) => setTask(t.id, { status: e.target.value as TaskStatus })}>{Object.entries(D().TASK_STATUS).map(([k, v]: any) => <option key={k} value={k}>{v.l}</option>)}</select></td>
                  <td><div className="asg">{t.assignedUserId ? <Avatar uid={t.assignedUserId} cls="sm" /> : <span className="av sm" style={{ '--c': 'var(--surface-4)' } as React.CSSProperties}>?</span>}
                    <select className="cell" value={t.assignedUserId || ''} disabled={dis} onChange={(e) => setTask(t.id, { assignedUserId: (e.target.value || null) as any })}><option value="">— Non assigné —</option>{asgOpts(t).map((u) => <option key={u} value={u}>{userName(users, u)}</option>)}</select></div></td>
                  <td><DraftInput className="cell num" type="number" style={{ textAlign: 'right' }} disabled={dis} value={t.cost || 0} onCommit={(v: number) => setTask(t.id, { cost: v })} /></td>
                  <td><input className="cell num" type="date" value={t.deadline || ''} disabled={dis} style={late ? { color: 'var(--danger)', fontWeight: 700 } : undefined} data-tip={late ? `Dépassée · ${lateD} j` : undefined} onChange={(e) => setTask(t.id, { deadline: (e.target.value || null) as any })} /></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {expert ? <button className="icon-btn sm" data-tip="Détail : dates, note et fichiers" style={t.notes ? { color: 'var(--bony-violet)' } : undefined} onClick={() => openTask(t)}><Icon name="file" size="sm" /></button> : null}
                    {ro ? null : <button className="icon-btn sm del" data-tip="Supprimer la tâche" aria-label="Supprimer la tâche" onClick={() => mutateProject(p.id, (x) => ({ ...x, tasks: x.tasks.filter((y) => y.id !== t.id) }))}><Icon name="close" size="sm" /></button>}</td>
                </tr>
              );
            })}
            {!tasks.length ? <tr><td colSpan={9}><div className="empty" style={{ padding: 18 }}>Aucune tâche définie. Ajoutez des tâches pour piloter le budget et l’avancement.</div></td></tr> : null}
          </tbody></table></div>
        <div className="prj-total"><span className="muted">Total des tâches</span><b className="num">{gx().fmt.eur(actual)}</b></div>
      </section>
      {expert ? <ExpertPanel p={p} ro={ro} onOpenTask={openTask} /> : null}
    </div>
  );
};

// ---------------------------------------------------------------- détail d'une tâche (mode Expert)
export function TaskDetailSheet({ projectId, taskId, ro, close }: { projectId: string; taskId: string; ro: boolean; close: (v?: unknown) => void }) {
  const p = useWorkspace((s) => s.byId[projectId]);
  const t = p?.tasks.find((x) => x.id === taskId);
  if (!p || !t) return <><h3>Tâche introuvable</h3><div className="foot"><button className="btn primary" onClick={() => close()}>Fermer</button></div></>;
  const setT = (patch: Partial<Task>) => mutateProject(projectId, (x) => ({ ...x, tasks: x.tasks.map((y) => (y.id === taskId ? { ...y, ...patch } : y)) }));
  const help = t.startDate && t.deadline ? 'Les deux dates sont posées : la tâche apparaît en barre dans le planning.' : t.deadline ? 'Sans date de début, la tâche se place en jalon sur son échéance.' : 'Sans échéance, la tâche n’apparaît pas dans le planning.';
  return (
    <>
      <div className="label" style={{ color: 'var(--bony-violet)' }}>Détail de la tâche</div><h3 style={{ margin: '2px 0 6px' }}>{t.name || 'Sans nom'}</h3>
      <div className="row wrap" style={{ gap: 6 }}><span className="badge" style={{ '--c': D().TASK_STATUS[t.status]?.c } as React.CSSProperties}>{D().TASK_STATUS[t.status]?.l}</span>
        {t.assignedUserId ? <><Avatar uid={t.assignedUserId} cls="sm" /><span>{D().user(t.assignedUserId).name}</span></> : <span className="faint">Non assignée</span>}
        {t.channel ? <span className="badge">{t.channel}</span> : null}{t.cost ? <b className="num">{gx().fmt.eur(t.cost)}</b> : null}</div>
      <div className="label" style={{ marginTop: 14 }}><Icon name="agenda" size="sm" /> Fenêtre de réalisation</div>
      <div className="row" style={{ gap: 8, marginTop: 6 }}>
        <label className="field grow"><span className="label">Début</span><input type="date" className="input" value={t.startDate || ''} disabled={ro} onChange={(e) => setT({ startDate: e.target.value || null })} /></label>
        <label className="field grow"><span className="label">Échéance</span><input type="date" className="input" value={t.deadline || ''} disabled={ro} onChange={(e) => setT({ deadline: (e.target.value || null) as any })} /></label></div>
      <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>{help}</div>
      <div className="label" style={{ marginTop: 14 }}><Icon name="edit" size="sm" /> Note</div>
      <DraftInput multiline className="textarea" rows={3} style={{ marginTop: 6 }} disabled={ro} placeholder="Compte rendu, contraintes, points de vigilance, contacts…" value={t.notes || ''}
        onCommit={(v: string) => { const n = v.trim() || null; if (n !== (t.notes || null)) setT({ notes: n }); }} />
      {ro ? null : <div className="faint" style={{ fontSize: 11.5 }}>Enregistrée en quittant le champ.</div>}
      <TaskFilesBlock projectId={projectId} taskId={taskId} ro={ro} />
      <div className="foot"><button className="btn primary" onClick={() => close()}>Fermer</button></div>
    </>
  );
}
