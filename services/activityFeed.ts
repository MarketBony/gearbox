import { useEffect, useState } from 'react';
import { db } from './dataService';
import { useRealtimeSync, RT_EVENTS } from './realtime';
import { ActivityLog } from '../types';

// Fil d'activité (la « cloche ») — SOURCE UNIQUE partagée par la Sidebar (ancienne
// interface) et le centre de notifications de la coque v2. Extrait de Sidebar.tsx le
// 29/09/2026 : même lecture (`GET /api/activity-log`), même règle de « lu »
// (`gearbox_activity_last_read`, localStorage), même routage au clic.

const LAST_READ_KEY = 'gearbox_activity_last_read';

export const relativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
};

/** Ouvre la rubrique d'une entrée (via `gearbox-navigate`, que les gardes d'App.tsx filtrent). */
export function openActivityEntry(entry: ActivityLog): void {
  const detail: Record<string, string> = {};
  switch (entry.entity) {
    case 'project':
      detail.tab = 'projects';
      if (entry.entityId) {
        window.sessionStorage.setItem('pendingProjectId', entry.entityId);
        detail.projectId = entry.entityId;
      }
      break;
    case 'post':
      detail.tab = 'digital';
      break;
    case 'task':
      detail.tab = 'campaigns';
      if (entry.entityId) {
        window.sessionStorage.setItem('pendingProjectId', entry.entityId);
        detail.projectId = entry.entityId;
      }
      break;
    case 'fixed-expense':
      detail.tab = 'fixed-expenses';
      break;
    case 'equipment':
    case 'booking':
      detail.tab = 'material';
      break;
    case 'user':
      detail.tab = 'settings';
      break;
    default:
      detail.tab = 'dashboard';
  }
  window.dispatchEvent(new CustomEvent('gearbox-navigate', { detail }));
}

export function useActivityFeed() {
  const [entries, setEntries] = useState<ActivityLog[]>([]);
  const [lastReadTs, setLastReadTs] = useState<string | null>(null);

  const load = () => {
    // Best-effort : le fil reste vide si l'API est injoignable.
    db.getActivityLog().then(setEntries).catch(() => { /* ignore */ });
    setLastReadTs(localStorage.getItem(LAST_READ_KEY));
  };

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener('gearbox-activity-updated', h);
    return () => window.removeEventListener('gearbox-activity-updated', h);
  }, []);

  // Temps réel : 'gearbox-activity-updated' est un événement window, limité à l'onglet
  // qui a écrit ; le socket apporte l'activité des autres utilisateurs.
  useRealtimeSync(RT_EVENTS.activity, load);

  const isUnread = (e: ActivityLog) => (lastReadTs ? new Date(e.timestamp) > new Date(lastReadTs) : true);

  /** Tout marquer comme lu (fermeture du panneau). */
  const markAllRead = () => {
    const now = new Date().toISOString();
    localStorage.setItem(LAST_READ_KEY, now);
    setLastReadTs(now);
  };

  return { entries, isUnread, unreadCount: entries.filter(isUnread).length, markAllRead };
}
