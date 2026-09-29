import { useCallback, useEffect, useRef, useState } from 'react';

// Gestionnaire de fenêtres de la coque v2. Une fenêtre par rubrique (l'id de la
// fenêtre EST l'id de la rubrique) : une page ne se monte jamais deux fois, donc ses
// abonnements temps réel et son état de session ne se dédoublent pas.
// Session (fenêtres ouvertes, positions) : localStorage par compte, rien en base.

export type WinMode = 'normal' | 'max' | 'left' | 'right';
export interface Win {
  id: string;
  x: number; y: number; w: number; h: number;   // géométrie en mode « normal »
  mode: WinMode;
  min: boolean;
  z: number;
}

export const MIN_W = 420, MIN_H = 300;
const SESSION_KEY = (userId: string) => `gearbox_ui2_session:${userId}`;

function load(userId: string): Win[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY(userId)) || '[]');
    return Array.isArray(raw) ? raw.filter(w => w && typeof w.id === 'string') : [];
  } catch { return []; }
}

/** Géométrie d'ouverture : centrée, en cascade, bornée à l'écran. */
function initialRect(n: number) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(1280, Math.max(MIN_W, vw - 160)), h = Math.min(820, Math.max(MIN_H, vh - 160));
  const off = (n % 6) * 28;
  return { x: Math.max(8, (vw - w) / 2 + off - 70), y: Math.max(36, (vh - h) / 2 + off - 50), w, h };
}

export function useWindows(userId: string) {
  const [wins, setWins] = useState<Win[]>(() => load(userId));
  const zRef = useRef(wins.reduce((m, w) => Math.max(m, w.z), 10));

  useEffect(() => {
    try { localStorage.setItem(SESSION_KEY(userId), JSON.stringify(wins)); } catch { /* stockage plein ou bloqué */ }
  }, [wins, userId]);

  const patch = useCallback((id: string, p: Partial<Win>) =>
    setWins(ws => ws.map(w => (w.id === id ? { ...w, ...p } : w))), []);

  const focus = useCallback((id: string) =>
    setWins(ws => {
      const top = ws.reduce((m, w) => Math.max(m, w.z), 0);
      const cur = ws.find(w => w.id === id);
      if (cur && cur.z === top && !cur.min) return ws;
      zRef.current = top + 1;
      return ws.map(w => (w.id === id ? { ...w, z: zRef.current, min: false } : w));
    }), []);

  /** Ouvre (ou ramène) la fenêtre d'une rubrique. `max` : agrandie d'emblée. */
  const open = useCallback((id: string, max = true) =>
    setWins(ws => {
      zRef.current = ws.reduce((m, w) => Math.max(m, w.z), zRef.current) + 1;
      if (ws.some(w => w.id === id)) return ws.map(w => (w.id === id ? { ...w, z: zRef.current, min: false } : w));
      return [...ws, { id, ...initialRect(ws.length), mode: max ? 'max' : 'normal', min: false, z: zRef.current }];
    }), []);

  const close = useCallback((id: string) => setWins(ws => ws.filter(w => w.id !== id)), []);
  const minimize = useCallback((id: string) => patch(id, { min: true }), [patch]);
  const minimizeAll = useCallback(() => setWins(ws => ws.map(w => ({ ...w, min: true }))), []);
  const setMode = useCallback((id: string, mode: WinMode) => patch(id, { mode }), [patch]);
  const toggleMax = useCallback((id: string) =>
    setWins(ws => ws.map(w => (w.id === id ? { ...w, mode: w.mode === 'normal' ? 'max' : 'normal' } : w))), []);

  /** Fenêtre active = la plus haute non réduite. */
  const active = wins.filter(w => !w.min).sort((a, b) => b.z - a.z)[0] || null;

  return { wins, active, open, close, focus, minimize, minimizeAll, setMode, toggleMax, patch };
}
