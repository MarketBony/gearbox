import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project, ProjectFile, Task } from '../../../types';
import { db } from '../../../services/dataService';
import { getSocket } from '../../../services/socket';
import { formatPoids, estImage } from '../../../utils/fichiers';
import { useWorkspace } from '../../store/workspace';
import { gx, hud, Icon, Avatar } from '../ui/kit';
import { D, today, engaged, finished, isLate } from './common';

// =====================================================================
// Mode Expert (Project.expertMode) — marqueur d'INTERFACE : ne change aucun montant.
// Présentation : maquette (`expertHTML` / `ganttHTML`, maquettes/v2/js/apps/projects.js).
// Règles : les VRAIES (components/expert/ExpertKpis.tsx, ExpertGantt.tsx, ExpertFiles.tsx —
// inventaire § 12) : tâches engagées = tout sauf « Vierge », « finie » = Terminé ou Programmé.
// =====================================================================

type Tab = 'pilotage' | 'planning' | 'fichiers';
const MAX_OCTETS = 100 * 1024 * 1024;   // aligné sur backend/src/routes/uploads.ts (comme ExpertFiles.tsx)

/** Fichiers d'un projet, rechargés sur `project-files:updated` (RT_EVENTS.projectFiles). */
export function useProjectFiles(projectId: string, enabled = true) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const load = useCallback(() => { if (enabled) db.getProjectFiles(projectId).then(setFiles).catch(() => setFiles([])); }, [projectId, enabled]);
  useEffect(() => {
    load(); if (!enabled) return;
    const s = getSocket(); let t = 0;
    const h = () => { clearTimeout(t); t = window.setTimeout(load, 300); };
    s?.on('project-files:updated', h);
    return () => { s?.off('project-files:updated', h); clearTimeout(t); };
  }, [load, enabled]);
  return { files, reload: load };
}

export function ExpertPanel({ p, ro, onOpenTask }: { p: Project; ro: boolean; onOpenTask: (t: Task) => void }) {
  const [tab, setTab] = useState<Tab>('pilotage');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { setTab('pilotage'); setOpen(null); }, [p.id]);      // l'onglet se réinitialise au changement de projet
  const { files, reload } = useProjectFiles(p.id);
  return (
    <div className="prj-x" data-expert>
      <div className="prj-xhead"><Icon name="bolt" /><div><h2 className="prj-h2">Mode Expert</h2><div className="prj-note" style={{ marginTop: 4 }}>Pilotage avancé — indicateurs, planning et pièces jointes de ce projet. Ne change aucun montant.</div></div>
        <div className="prj-xtabs">{([['pilotage', 'Pilotage', 'target'], ['planning', 'Planning', 'gantt'], ['fichiers', 'Fichiers', 'paperclip']] as [Tab, string, string][]).map(([k, l, ic]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon name={ic} size="sm" />{l}{k === 'fichiers' && files.length ? <> <span className="num">{files.length}</span></> : null}</button>))}</div></div>
      {tab === 'pilotage' ? <Pilotage p={p} open={open} setOpen={setOpen} onOpenTask={onOpenTask} />
        : tab === 'planning' ? <Gantt p={p} onOpenTask={onOpenTask} />
        : <Fichiers p={p} ro={ro} files={files} reload={reload} onOpenTask={onOpenTask} />}
    </div>
  );
}

// ---------------------------------------------------------------- Pilotage (ExpertKpis.tsx)
function Pilotage({ p, open, setOpen, onOpenTask }: { p: Project; open: string | null; setOpen: (k: string | null) => void; onOpenTask: (t: Task) => void }) {
  const users = useWorkspace((s) => s.users);
  const T = today(), eng = engaged(p), rest = eng.filter((t) => !finished(t));
  if (!eng.length) return <div className="empty" style={{ padding: 24 }}>Aucune tâche engagée : les indicateurs apparaîtront dès la première tâche non « Vierge ».</div>;
  const cats: [string, Task[], string, string][] = [
    ['late', rest.filter((t) => isLate(t, T)), 'en retard', 'var(--danger)'],
    ['noOne', rest.filter((t) => !t.assignedUserId), 'sans personne assignée', 'var(--warn)'],
    ['noDate', rest.filter((t) => !t.deadline), 'à faire sans date', 'var(--warn)'],
  ];
  const clean = cats.every(([, l]) => !l.length);
  const who = new Map<string, { n: number; d: number; late: number; amt: number }>();
  eng.forEach((t) => { const k = t.assignedUserId || ''; const w = who.get(k) || { n: 0, d: 0, late: 0, amt: 0 }; w.n++; if (finished(t)) w.d++; if (isLate(t, T)) w.late++; w.amt += t.cost || 0; who.set(k, w); });
  const whoList = [...who.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : b[1].n - a[1].n || b[1].amt - a[1].amt));
  const total = eng.reduce((s, t) => s + (t.cost || 0), 0), top3 = [...eng].sort((a, b) => (b.cost || 0) - (a.cost || 0)).slice(0, 3).reduce((s, t) => s + (t.cost || 0), 0);
  const prov = new Map<string, number>(); eng.forEach((t) => prov.set(t.provider || '— non renseigné —', (prov.get(t.provider || '— non renseigné —') || 0) + (t.cost || 0)));
  const pct3 = total ? Math.round((top3 / total) * 100) : 0;
  const hbars = total ? gx().chart.hbars({ items: [...prov.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label, value]) => ({ label, value })) }) : '';
  return (
    <div className="prj-xgrid">
      <div className="prj-xbloc"><div className="prj-lbl" style={{ marginBottom: 6 }}><Icon name="alert" size="sm" /> À traiter</div>
        {cats.map(([key, list, lbl, tone]) => (
          <React.Fragment key={key}>
            <div className="prj-xline" onClick={() => list.length && setOpen(open === key ? null : key)} style={list.length ? undefined : { cursor: 'default' }}>
              <b className="num" style={{ color: list.length ? tone : 'var(--ok)' }}>{list.length || <Icon name="check" size="sm" />}</b><span className="grow">{lbl}</span>{list.length ? <Icon name={open === key ? 'chevup' : 'chevdown'} size="sm" /> : null}</div>
            {open === key && list.length ? <div className="prj-xsub">{list.map((t) => <div key={t.id} data-tip="Ouvrir la tâche pour la corriger" onClick={() => onOpenTask(t)}><span className="ellipsis grow">{t.name || 'Sans nom'}</span><span className="faint num">{t.deadline ? gx().fmt.date(t.deadline) : ''}</span></div>)}</div> : null}
          </React.Fragment>
        ))}
        <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>{clean ? 'Rien à corriger : tout est assigné, daté et à jour.' : 'Cliquez un compteur pour dérouler, puis une ligne pour ouvrir la tâche et la corriger.'}</div></div>
      <div className="prj-xbloc"><div className="prj-lbl" style={{ marginBottom: 8 }}><Icon name="users" size="sm" /> Qui fait quoi</div>
        {whoList.map(([u, w]) => (
          <div key={u || '-'} className="row" style={{ fontSize: 13.5, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            {u ? <Avatar uid={u} cls="sm" /> : <span className="av sm" style={{ '--c': 'var(--surface-4)' } as React.CSSProperties}>?</span>}
            <span className="grow ellipsis" style={u ? undefined : { color: 'var(--warn)' }}>{u ? users.find((x) => x.id === u)?.name || '—' : 'Non assignées'}</span>
            <span className="faint num">{w.d}/{w.n}</span>{w.late ? <span className="badge solid" style={{ '--c': 'var(--danger)' } as React.CSSProperties}>{w.late}</span> : null}
            <b className="num" style={{ minWidth: 58, textAlign: 'right' }}>{w.amt > 0 ? gx().fmt.eurK(w.amt) : ''}</b></div>))}
        <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Toutes les tâches de chacun, terminées comprises.</div></div>
      <div className="prj-xbloc"><div className="prj-lbl"><Icon name="euro" size="sm" /> Où part l’argent</div>
        <div className="num" style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 2px' }}>{gx().fmt.eur(total)}</div>
        <div className="faint" style={{ fontSize: 12.5, marginBottom: 10 }}>Les 3 plus grosses lignes : <span style={pct3 >= 70 ? { color: 'var(--bony-orange)', fontWeight: 700 } : undefined}>{pct3} %</span></div>
        {total ? <div dangerouslySetInnerHTML={{ __html: hbars }} /> : <div className="faint">Aucun coût saisi sur les tâches.</div>}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Planning (ExpertGantt.tsx)
function Gantt({ p, onOpenTask }: { p: Project; onOpenTask: (t: Task) => void }) {
  const users = useWorkspace((s) => s.users);
  const T = today(), eng = engaged(p);
  const placed = eng.filter((t) => t.deadline || t.startDate), orph = eng.filter((t) => !t.deadline && !t.startDate);
  const orphans = orph.length ? <div className="faint" style={{ fontSize: 12.5, margin: '10px 20px 18px 22px' }}>{orph.length} tâche{orph.length > 1 ? 's' : ''} sans date — absente{orph.length > 1 ? 's' : ''} du planning : {orph.map((t, i) => <React.Fragment key={t.id}>{i ? ', ' : ''}<button style={{ textDecoration: 'underline' }} onClick={() => onOpenTask(t)}>{t.name || 'Sans nom'}</button></React.Fragment>)}</div> : null;
  if (!placed.length) return <><div className="empty" style={{ padding: 24 }}>Aucune tâche datée. Renseignez une échéance — et, pour une vraie barre, une date de début — dans le détail d’une tâche.</div>{orphans}</>;
  const ms = (d: string) => +new Date(d);
  const dates = placed.flatMap((t) => [t.startDate, t.deadline].filter(Boolean) as string[]).concat([p.startDate, p.endDate].filter(Boolean));
  const t0 = Math.min(...dates.map(ms), +gx().today()) - 864e5 * 2, t1 = Math.max(...dates.map(ms), +gx().today()) + 864e5 * 2;
  const x = (d: string | Date) => ((+new Date(d) - t0) / (t1 - t0)) * 100;
  const grads: Date[] = []; for (let d = new Date(new Date(t0).getFullYear(), new Date(t0).getMonth() + 1, 1); +d < t1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) grads.push(d);
  const byU = new Map<string, Task[]>(); placed.forEach((t) => { const k = t.assignedUserId || ''; byU.set(k, [...(byU.get(k) || []), t]); });
  const nameOf = (u: string) => users.find((x) => x.id === u)?.name || '—';
  const rows = [...byU.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : nameOf(a[0]).localeCompare(nameOf(b[0]), 'fr')));
  const color = (t: Task) => (isLate(t, T) ? 'var(--danger)' : t.status === 'Done' ? 'var(--ok)' : undefined);
  const tip = (t: Task) => `${t.name || 'Sans nom'} — ${t.startDate && t.deadline ? `du ${gx().fmt.date(t.startDate)} au ${gx().fmt.date(t.deadline)}` : `jalon ${gx().fmt.date(t.deadline || t.startDate!)}`}${isLate(t, T) ? ' (en retard)' : ''}`;
  return (
    <>
      <div className="gantt"><div className="g-in"><div className="g-scale">{grads.map((d) => <span key={+d} style={{ left: `${x(d)}%` }}>{d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')} {String(d.getFullYear()).slice(2)}</span>)}</div>
        <div style={{ position: 'absolute', left: 150, right: 0, top: 0, bottom: 0, pointerEvents: 'none' }}><div className="g-today" style={{ left: `${x(gx().today())}%` }} /></div>
        {rows.map(([u, ts]) => (
          <div key={u || '-'} className="g-row"><div className="row" style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{u ? <Avatar uid={u} cls="sm" /> : null}<span className="ellipsis">{u ? nameOf(u) : 'Non assigné'}</span><span className="faint num">{ts.length}</span></div>
            <div className="g-track">{ts.map((t, i) => t.startDate && t.deadline && t.startDate < t.deadline
              ? <div key={t.id} className={`g-bar ${t.status === 'Done' ? 'done' : ''}`} data-tip={tip(t)} onClick={() => onOpenTask(t)} style={{ left: `${x(t.startDate)}%`, width: `${Math.max(1.5, x(t.deadline) - x(t.startDate))}%`, animationDelay: `${i * 40}ms`, ...(color(t) ? { background: color(t) } : {}) }}>{t.name}</div>
              : <div key={t.id} className="g-ms" data-tip={tip(t)} onClick={() => onOpenTask(t)} style={{ left: `${x(t.deadline || t.startDate!)}%`, ...(color(t) ? { background: color(t) } : {}) }} />)}</div></div>))}</div>
        <div className="row wrap faint" style={{ gap: 14, fontSize: 12, marginTop: 10 }}><span>Barre : début → échéance</span><span>◆ Jalon : échéance seule</span><span style={{ color: 'var(--ok)' }}>Terminé</span><span style={{ color: 'var(--danger)' }}>En retard</span><span style={{ color: 'var(--danger)' }}>| Aujourd’hui</span></div></div>
      {orphans}
    </>
  );
}

// ---------------------------------------------------------------- Fichiers (ExpertFiles.tsx)
const FileRow: React.FC<{ f: ProjectFile; ro: boolean; onDeleted: () => void }> = ({ f, ro, onDeleted }) => {
  const users = useWorkspace((s) => s.users);
  // Confirmation en DEUX clics (pas de `confirm()` natif : il bloque la page et sort de la charte).
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  const del = () => {
    if (!armed) { setArmed(true); return; }
    db.deleteProjectFile(f.id).then(onDeleted).catch(() => hud('Échec de la suppression (serveur injoignable ?).'));
  };
  return (
    <div className="list-row" style={{ background: 'var(--surface-3)' }}>
      {estImage(f.fileName) ? <img src={f.url} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} /> : <Icon name="file" />}
      <b className="grow ellipsis" title={f.fileName}>{f.fileName}</b><span className="faint">{formatPoids(f.fileSize)}</span>
      {f.uploadedBy ? <span data-tip={users.find((u) => u.id === f.uploadedBy)?.name || ''}><Avatar uid={f.uploadedBy} cls="sm" /></span> : null}
      <a className="icon-btn sm" href={f.url} download={f.fileName} data-tip="Télécharger"><Icon name="download" size="sm" /></a>
      {ro ? null : <button className="icon-btn sm" data-tip={armed ? 'Cliquer encore pour supprimer définitivement' : 'Supprimer définitivement'} style={armed ? { color: '#fff', background: 'var(--danger)' } : undefined} onClick={del}><Icon name="trash" size="sm" /></button>}
    </div>
  );
};

function DropZone({ projectId, taskId, onDone }: { projectId: string; taskId: string | null; onDone: () => void }) {
  const [over, setOver] = useState(false), [busy, setBusy] = useState(0), [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const send = async (list: FileList | null) => {
    if (!list?.length) return; setErr('');
    const ok = [...list].filter((f) => { if (f.size > MAX_OCTETS) { setErr(`« ${f.name} » dépasse 100 Mo et n'a pas été envoyé.`); return false; } return true; });
    setBusy((n) => n + ok.length);
    for (const f of ok) {
      try { const url = await db.uploadFile('project', f); await db.addProjectFile(projectId, { url, fileName: f.name, fileSize: f.size, taskId }); }
      catch { setErr(`Échec de l'envoi de « ${f.name} ».`); }
      finally { setBusy((n) => n - 1); }
    }
    onDone();
  };
  return (
    <>
      <div className={`dropzone ${over ? 'over' : ''}`} style={{ cursor: 'pointer' }} onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}>
        <Icon name="upload" size="lg" /><div style={{ marginTop: 6 }}>{busy ? `Envoi de ${busy} fichier${busy > 1 ? 's' : ''}…` : 'Choisir un fichier ou glisser-déposer · tous formats, 100 Mo maximum'}</div>
        <input ref={input} type="file" multiple hidden onChange={(e) => { send(e.target.files); e.target.value = ''; }} /></div>
      {err ? <div style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 700 }}>{err}</div> : null}
    </>
  );
}

function Fichiers({ p, ro, files, reload, onOpenTask }: { p: Project; ro: boolean; files: ProjectFile[]; reload: () => void; onOpenTask: (t: Task) => void }) {
  const own = files.filter((f) => !f.taskId);
  const byTask = useMemo(() => { const m = new Map<string, ProjectFile[]>(); files.filter((f) => f.taskId).forEach((f) => m.set(f.taskId!, [...(m.get(f.taskId!) || []), f])); return m; }, [files]);
  const nTask = files.length - own.length;
  return (
    <div style={{ padding: '18px 20px 20px 22px', display: 'grid', gap: 10 }}>
      <div className="prj-lbl">Fichiers du projet</div>
      {own.map((f) => <FileRow key={f.id} f={f} ro={ro} onDeleted={reload} />)}
      {!own.length ? <div className="faint">{ro ? 'Aucun fichier déposé.' : 'Aucun fichier pour le moment.'}</div> : null}
      {ro ? null : <DropZone projectId={p.id} taskId={null} onDone={reload} />}
      {nTask ? <>
        <div className="prj-lbl" style={{ marginTop: 8 }}>Fichiers rattachés à une tâche <span style={{ color: 'var(--bony-violet)' }}>{nTask}</span></div>
        {[...byTask.entries()].map(([tid, fl]) => { const t = p.tasks.find((x) => x.id === tid); return (
          <React.Fragment key={tid}>
            <button className="row" style={{ fontWeight: 600, fontSize: 13 }} onClick={() => t && onOpenTask(t)}><Icon name="paperclip" size="sm" />{t?.name || 'Tâche supprimée'} <Icon name="chevron" size="sm" /></button>
            {fl.map((f) => <FileRow key={f.id} f={f} ro onDeleted={reload} />)}
          </React.Fragment>); })}
        <div className="faint" style={{ fontSize: 12 }}>Pour en ajouter ou en retirer un, ouvrez la tâche concernée.</div>
      </> : null}
    </div>
  );
}

/** Fichiers d'UNE tâche (volet de détail de la tâche). */
export function TaskFilesBlock({ projectId, taskId, ro }: { projectId: string; taskId: string; ro: boolean }) {
  const { files, reload } = useProjectFiles(projectId);
  const mine = files.filter((f) => f.taskId === taskId);
  return (
    <>
      <div className="label" style={{ marginTop: 14 }}><Icon name="paperclip" size="sm" /> Fichiers de la tâche {mine.length ? <span style={{ color: 'var(--bony-violet)' }}>{mine.length}</span> : null}</div>
      <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>{mine.map((f) => <FileRow key={f.id} f={f} ro={ro} onDeleted={reload} />)}</div>
      {ro ? null : <div style={{ marginTop: 6 }}><DropZone projectId={projectId} taskId={taskId} onDone={reload} /></div>}
    </>
  );
}
