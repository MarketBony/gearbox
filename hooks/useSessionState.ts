import { useState, useCallback, useEffect, useRef, Dispatch, SetStateAction } from 'react';

/**
 * Drop-in replacement for useState that persists value to sessionStorage.
 * Automatically restored when the component remounts within the same session.
 * Cleared automatically on logout (AuthContext calls sessionStorage.clear()).
 */
export function useSessionState<T>(key: string, initialState: T): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = `gearbox_session_${key}`;

  const [state, setStateRaw] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      return saved !== null ? (JSON.parse(saved) as T) : initialState;
    } catch {
      return initialState;
    }
  });

  const setState = useCallback((action: SetStateAction<T>) => {
    setStateRaw(prev => {
      const next = typeof action === 'function' ? (action as (p: T) => T)(prev) : action;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [storageKey]) as Dispatch<SetStateAction<T>>;

  return [state, setState];
}

/**
 * Attaches a ref to a scrollable div and persists/restores its scrollTop.
 * Pass `ready=false` while data is loading, then `true` once loaded so the
 * scroll position is only restored after the list has content.
 */
export function useScrollRestore(key: string, ready: boolean = true) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const storageKey = `gearbox_session_scroll_${key}`;
  const hasRestored = useRef(false);

  // Save on scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      sessionStorage.setItem(storageKey, String(Math.round(el.scrollTop)));
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [storageKey]);

  // Restore once ready
  useEffect(() => {
    if (!ready || hasRestored.current) return;
    hasRestored.current = true;
    const el = scrollRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      el.scrollTop = parseInt(saved, 10);
    }
  }, [ready, storageKey]);

  return scrollRef;
}
