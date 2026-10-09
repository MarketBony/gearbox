import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { PostIt } from '../../../types';
import { useAuth } from '../../../contexts/AuthContext';
import { db } from '../../../services/dataService';
import { useWorkspace } from '../../store/workspace';
import { gx, hud, Icon, useEngineEvent } from '../ui/kit';
import { buildItems, urgency, sortIt } from '../todo/board';
import { colorOf, hhmm, minOf, today as todayIso } from '../todo/postitLogic';

/**
 * Widget « Ma journée » (09/10/2026) : ce qui compte AUJOURD'HUI, au même endroit —
 *  - mes post-it du jour (agenda personnel de la To-do), et l'ajout d'un post-it en une ligne ;
 *  - mes tâches dues aujourd'hui ou en retard (règles de la To-do), à cocher ;
 *  - les publications du jour (Digital) et les absents du jour (Congés), si le rôle y a accès.
 * Aucune règle recopiée : tâches par ui2/apps/todo/board.ts, post-it par /api/postits, le reste par GX.data.
 */
export default function MyDayWidget() {
  const { user } = useAuth();
  const uid = user?.id || '';
  const G = gx();
  const T = todayIso();

  // --- post-it du jour
  const [postits, setPostits] = useState<PostIt[] | null>(null);
  const [postitOk, setPostitOk] = useState(true);
  const load = useCallback(() => db.getPostIts().then((l) => { setPostits(l); setPostitOk(true); }).catch(() => { setPostits([]); setPostitOk(false); }), []);
  useEffect(() => {
    load();
    const t = window.setInterval(() => { if (!document.hidden) load(); }, 120000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);
  const todays = useMemo(() => (postits || [])
    .filter((p) => p.start.slice(0, 10) <= T && p.end.slice(0, 10) >= T)
    .sort((a, b) => (a.allDay ? 0 : 1) - (b.allDay ? 0 : 1) || minOf(a.start) - minOf(b.start)), [postits, T]);
  const [draft, setDraft] = useState('');
  const add = () => {
    const title = draft.trim(); if (!title) return;
    setDraft('');
    db.createPostIt({ title, start: T, end: T, allDay: true, color: 'yellow' })
      .then((p) => { setPostits((l) => [...(l || []), p]); hud('Post-it ajouté'); })
      .catch(() => { setDraft(title); hud('Échec de l’ajout du post-it.'); });
  };

  // --- tâches dues aujourd'hui ou en retard
  const projects = useWorkspace((s) => s.projects), standalone = useWorkspace((s) => s.standalone);
  const tasks = useMemo(() => buildItems(projects, standalone, uid).filter((it) => it.t.status !== 'Done' && !it.noDate && it.ref <= T).sort(sortIt), [projects, standalone, uid, T]);
  const canEdit = !!G.todo?.canEdit?.();

  // --- publications et absents du jour (GX.data, tenu par DataHub)
  const [, setTick] = useState(0);
  useEngineEvent('data', () => setTick((n) => n + 1));
  const posts = G.shell.canOpen('digital') ? (G.data.POSTS || []).filter((p: any) => p.date === T && !p.archived) : [];
  const off: string[] = G.shell.canOpen('conges') ? [...new Set<string>((G.data.CONGES || []).filter((c: any) => c.date === T).map((c: any) => c.u))] : [];

  const open = (app: string, cmd?: string) => (cmd ? G.shell.openWith(app, cmd) : G.wm.open(app));
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const empty = postits !== null && !todays.length && !tasks.length && !posts.length;

  return (
    <div className="myd">
      <div className="wt myd-h"><Icon name="todo" size="sm" /><span className="ellipsis grow">Ma journée <span className="faint">· {date}</span></span></div>
      <div className="myd-body scroll" data-wc-zone>
        {postitOk ? (
          <section>
            <h4>Post-it</h4>
            {todays.map((p) => (
              <button key={p.id} className="myd-pi" style={{ '--pi': colorOf(p.color).bg, '--pe': colorOf(p.color).edge } as React.CSSProperties}
                onClick={() => { G.store.set('todo.sub', 'postit'); open('todo'); }} data-tip="Ouvrir mes post-it">
                <span className="myd-pt num">{p.allDay ? 'Journée' : hhmm(minOf(p.start))}</span><span className="ellipsis">{p.title || 'Sans titre'}</span>
              </button>
            ))}
            <label className="myd-add"><Icon name="plus" size="sm" /><input value={draft} placeholder="Ajouter un post-it pour aujourd’hui…" maxLength={200}
              onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); }} /></label>
          </section>
        ) : null}
        <section>
          <h4>Tâches du jour <span className="faint">{tasks.length || ''}</span></h4>
          {tasks.length ? tasks.map((it) => {
            const u = urgency(it);
            return (
              <div key={it.id} className="myd-row">
                <input type="checkbox" className="check" disabled={!canEdit} aria-label={`Terminer « ${it.t.name} »`} onChange={(e) => { e.currentTarget.checked = false; G.todo?.complete(it.id); }} />
                <button className="myd-tx" onClick={() => (it.p ? G.openProject(it.p.id) : open('todo'))}>
                  <span className="ellipsis">{it.t.name}</span><span className="faint ellipsis">{it.p ? it.p.name : 'Tâche libre'}</span>
                </button>
                <span className={`wdl-u ${u.cls}`}>{u.cls === 'late' ? u.txt : 'Aujourd’hui'}</span>
              </div>
            );
          }) : <div className="faint myd-none">Rien d’urgent aujourd’hui</div>}
        </section>
        {posts.length ? (
          <section>
            <h4>Publications du jour</h4>
            {posts.map((p: any) => (
              <button key={p.id} className="myd-row myd-tx" onClick={() => open('digital', 'post:' + p.id)}>
                <i className="brand-dot" style={{ '--c': G.data.socialStatus(p.status).c } as React.CSSProperties} /><span className="ellipsis grow">{p.title}</span><span className="faint">{p.status}</span>
              </button>
            ))}
          </section>
        ) : null}
        {off.length ? (
          <section>
            <h4>Absents aujourd’hui</h4>
            <div className="myd-off">{off.map((u) => <span key={u} className="myd-who" dangerouslySetInnerHTML={{ __html: G.r.av(u, 'sm') + `<span>${G.esc(G.data.user(u).name.split(' ')[0])}</span>` }} />)}</div>
          </section>
        ) : null}
        {empty ? <div className="faint myd-none">Journée calme : aucun post-it, aucune tâche due.</div> : null}
      </div>
    </div>
  );
}
