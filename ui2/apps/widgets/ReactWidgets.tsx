import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { TaskStatus } from '../../../types';
import { canEditProjects } from '../../../constants';
import { useAuth } from '../../../contexts/AuthContext';
import { db } from '../../../services/dataService';
import { getSocket, connectSocket } from '../../../services/socket';
import { GAME_LABELS } from '../../../components/games/gameTypes';
import { useWorkspace, workspace, mutateTask, updateStandalone } from '../../store/workspace';
import { gx, hud } from '../ui/kit';
import { buildItems, urgency } from '../todo/board';
import TodoWidget from './TodoWidget';
import MyDayWidget from './MyDayWidget';
import FormsWidget from './FormsWidget';

// =====================================================================
// Widgets du bureau EN REACT (09/10/2026, refonte des widgets) — le moteur (engine/widgets.ts) pose un hôte
// persistant par widget (`GX.widgets.react`) ; ce calque y rend le composant par portail. Monté par OsHost.tsx.
//
// Fournit aussi au moteur les PORTES dont ses widgets HTML ont besoin, sans recopier aucune règle :
//  - `GX.todo` : mes tâches (règles de la To-do, ui2/apps/todo/board.ts), urgence, et « Terminer » (routes normales :
//    file de sauvegarde du projet, ou /api/tasks pour une tâche libre), avec annulation ;
//  - `GX.games` : accepter / refuser un défi (mêmes appels que la rubrique Jeux).
// =====================================================================

const EMPTY: { wid: string; host: HTMLElement; kind: string }[] = [];

export default React.memo(function ReactWidgets() {
  const { user } = useAuth();
  const uid = user?.id || '', role = user?.role || '';
  const G = gx();
  const list = useSyncExternalStore(G?.widgets?.react?.subscribe || (() => () => {}), G?.widgets?.react?.snapshot || (() => EMPTY));

  // --- porte GX.todo (lue par « Mes tâches », « Prochaines échéances », l'Indicateur)
  const projects = useWorkspace((s) => s.projects), standalone = useWorkspace((s) => s.standalone);
  const items = useMemo(() => buildItems(projects, standalone, uid), [projects, standalone, uid]);
  useEffect(() => {
    if (!G) return;
    const canEdit = () => canEditProjects(role) && !G.ctx?.readOnly;
    const setStatus = (id: string, st: TaskStatus) => {
      const it = buildItems(workspace.getState().projects, workspace.getState().standalone, uid).find((x) => x.id === id);
      if (!it || !canEdit()) return Promise.resolve(false);
      if (it.p) { mutateTask(it.p.id, it.t.id, { status: st }); return Promise.resolve(true); }
      return updateStandalone(it.t.id, { status: st }).then(() => true).catch(() => { hud('Échec de la sauvegarde (serveur injoignable ?).'); return false; });
    };
    G.todo = {
      items: () => buildItems(workspace.getState().projects, workspace.getState().standalone, uid),
      urgency,
      canEdit,
      complete(id: string) {
        const it = buildItems(workspace.getState().projects, workspace.getState().standalone, uid).find((x) => x.id === id); if (!it) return;
        const before = it.t.status;
        setStatus(id, 'Done').then((ok) => {
          if (!ok) return;
          // Annulation : un clic sur la notification remet l'ancien statut.
          G.shell?.notify?.({ app: 'todo', title: 'Tâche terminée', body: `« ${it.t.name} » — cliquer pour annuler`, onClick: () => setStatus(id, before).then((b) => b && hud('Tâche rétablie')) });
        });
      },
    };
    return () => { if (G.todo) G.todo = null; };
  }, [G, uid, role]);
  // Les widgets HTML suivent les tâches (projets ET tâches libres) : un événement par changement.
  useEffect(() => { G?.emit?.('data:tasks'); }, [items, G]);

  // --- Jeux : bannière à l'arrivée d'un défi et quand c'est à moi de jouer (09/10/2026, Théo : « pas de notifs sur les
  // jeux, c'est relou »). Rien si la fenêtre Jeux est déjà au premier plan, ni pour un rôle sans Jeux.
  useEffect(() => {
    if (!G || !uid) return;
    const s = getSocket() ?? connectSocket(); if (!s) return;
    const shown = () => { const w = G.wm?.active?.(); return !!w && (w.app?.parent || w.appId) === 'games' && !w.min && document.hasFocus(); };
    const name = (id: string) => (G.data.user(id)?.name || '').split(' ')[0] || 'Quelqu’un';
    const label = (g: string) => (GAME_LABELS as Record<string, string>)[g] || g;
    const onChallenge = (c: any) => {
      if (!G.shell?.canOpen?.('games') || c?.toUserId !== uid || c.status !== 'pending' || shown()) return;
      G.shell.notify?.({ app: 'games', u: c.fromUserId, title: 'Nouveau défi', body: `${name(c.fromUserId)} te défie au ${label(c.gameType || c.game)}`, onClick: () => G.wm.open('games') });
    };
    const last: Record<string, string> = {};
    const onSession = (p: any) => {
      if (!G.shell?.canOpen?.('games') || !p?.id) return;
      const key = `${p.status}:${p.currentTurn}`; if (last[p.id] === key) return; last[p.id] = key;
      if (p.status !== 'playing' || p.currentTurn !== uid || shown()) return;
      G.shell.notify?.({ app: 'games', u: p.opponentId, title: 'À toi de jouer', body: `${label(p.game)} contre ${name(p.opponentId)}`, onClick: () => G.shell.openWith('games', `play:${p.game}:${p.opponentId}`) });
    };
    s.on('game:challenge:updated', onChallenge); s.on('game:session:updated', onSession);
    return () => { s.off('game:challenge:updated', onChallenge); s.off('game:session:updated', onSession); };
  }, [G, uid]);

  // --- porte GX.games
  useEffect(() => {
    if (!G) return;
    G.games = {
      label: (g: string) => (GAME_LABELS as Record<string, string>)[g] || g,
      // La rubrique Jeux s'ouvre d'abord : c'est elle qui lance la partie à `game:session:started`.
      accept(id: string) { G.wm?.open?.('games'); setTimeout(() => { db.acceptGameChallenge(id).catch(() => hud('Échec de l’acceptation du défi.')); }, 650); },
      refuse(id: string) { db.refuseGameChallenge(id).then(() => hud('Défi refusé')).catch(() => hud('Échec du refus du défi.')); },
    };
    G.reactWidgets = true; G.widgets?.render?.();
    return () => { G.games = null; G.reactWidgets = false; };
  }, [G]);

  // --- W3 : bureau enregistré sur le SERVEUR (une ligne par compte, routes/widgets.ts). Au démarrage, la disposition du
  // serveur fait foi ; s'il n'en a pas encore, celle du navigateur y monte (reprise : personne ne perd son bureau).
  // Ensuite chaque changement part 1,5 s après le dernier geste (aussitôt si l'onglet passe en arrière-plan).
  useEffect(() => {
    if (!G?.widgets) return;
    const FIELD: Record<string, 'desktop' | 'phone'> = { widgets: 'desktop', 'widgets.m': 'phone' };
    let alive = true, ready = false;
    const pending: Record<string, unknown[]> = {}, timers: Record<string, number> = {};
    const flush = (k: string) => {
      const v = pending[k]; if (!v) return; delete pending[k]; window.clearTimeout(timers[k]);
      db.saveMyWidgets({ [FIELD[k]]: v }).catch(() => { if (alive) pending[k] = pending[k] || v; });   // nouvel essai au prochain geste
    };
    const flushAll = () => Object.keys(pending).forEach(flush);
    G.widgetsSync = {
      push(k: string, v: unknown[]) {
        if (!FIELD[k]) return; pending[k] = JSON.parse(JSON.stringify(v));
        if (!ready) return; window.clearTimeout(timers[k]); timers[k] = window.setTimeout(() => flush(k), 1500);
      },
    };
    db.getMyWidgets().then((srv) => {
      if (!alive) return;
      const up: { desktop?: unknown[]; phone?: unknown[] } = {};
      for (const [k, f] of Object.entries(FIELD)) {
        if (pending[k]) continue;                                   // modifié pendant le chargement : le geste local gagne
        const remote = srv[f], local = G.store.get(k);
        if (Array.isArray(remote)) G.store.set(k, remote);
        else if (Array.isArray(local) && local.length) up[f] = local;
      }
      if (up.desktop || up.phone) db.saveMyWidgets(up).catch(() => {});
      ready = true; flushAll();
      G.widgets.reload?.();
    }).catch(() => { ready = true; flushAll(); });
    const onHide = () => { if (document.hidden) flushAll(); };
    document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', flushAll);
    return () => { alive = false; flushAll(); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flushAll); G.widgetsSync = null; };
  }, [G]);

  if (!G) return null;
  return <>{list.map(({ wid, host, kind }) => createPortal(
    kind === 'todo' ? <TodoWidget /> : kind === 'myday' ? <MyDayWidget /> : kind === 'forms' ? <FormsWidget /> : null,
    host, wid))}</>;
});
