import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { easeApple } from '../lib/motion';

/**
 * Brique commune de panneau flottant pour TOUS les menus/dropdowns/popovers/calendriers.
 * - Portalisé sur document.body → immunisé aux ancêtres transformés (transitions de page),
 *   donc le `position: fixed` reste bien relatif au viewport (corrige les panneaux qui
 *   flottaient au milieu de l'écran).
 * - Ancré précisément sous le trigger (ou au-dessus si pas de place), recalculé au
 *   scroll/resize → le panneau reste collé à son bouton.
 * - Rendu verre dépoli dense unique (.glass-menu + reflet), fermeture au clic extérieur / Échap.
 */
export interface FloatingPanelProps {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  /** Largeur : nombre (px), 'trigger' (= largeur du trigger). Défaut 'trigger'. */
  width?: number | 'trigger';
  minWidth?: number;
  maxWidth?: number;
  maxHeight?: number;
  gap?: number;
  align?: 'start' | 'end';
  sheen?: boolean;
  className?: string;
  role?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

interface Pos { top?: number; bottom?: number; left: number; width: number; maxHeight: number; placement: 'bottom' | 'top'; }

const VIEWPORT_MARGIN = 8;

const FloatingPanel: React.FC<FloatingPanelProps> = ({
  open, onClose, triggerRef, children,
  width = 'trigger', minWidth, maxWidth, maxHeight = 340, gap = 6,
  align = 'start', sheen = true, className = '', role, onKeyDown,
}) => {
  const [pos, setPos] = useState<Pos | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const compute = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const M = VIEWPORT_MARGIN;

    // Largeur
    let w = width === 'trigger' ? r.width : width;
    if (minWidth) w = Math.max(w, minWidth);
    if (maxWidth) w = Math.min(w, maxWidth);
    w = Math.min(w, vw - M * 2);

    // Position horizontale (alignée au trigger, bornée au viewport)
    let left = align === 'end' ? r.right - w : r.left;
    left = Math.min(left, vw - M - w);
    left = Math.max(M, left);

    // Vertical : sous le trigger, ou au-dessus si plus de place.
    // Sur mobile (< md), la nav fixe en bas occupe 64px : on les réserve pour
    // que le panneau ne s'ouvre pas par-dessus la barre.
    const bottomNavReserve = vw < 768 ? 64 : 0;
    const spaceBelow = vh - bottomNavReserve - r.bottom - gap - M;
    const spaceAbove = r.top - gap - M;
    const placeTop = spaceBelow < Math.min(maxHeight, 220) && spaceAbove > spaceBelow;
    const avail = placeTop ? spaceAbove : spaceBelow;
    const maxH = Math.max(140, Math.min(maxHeight, avail));

    if (placeTop) {
      setPos({ bottom: vh - r.top + gap, left, width: w, maxHeight: maxH, placement: 'top' });
    } else {
      setPos({ top: r.bottom + gap, left, width: w, maxHeight: maxH, placement: 'bottom' });
    }
  }, [triggerRef, width, minWidth, maxWidth, maxHeight, gap, align]);

  useLayoutEffect(() => {
    if (open) compute();
  }, [open, compute]);

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(compute); };
    const onDocPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current && panelRef.current.contains(t)) return;
      if (triggerRef.current && triggerRef.current.contains(t)) return;
      // Ne pas fermer si le clic est dans un AUTRE panneau flottant (menu imbriqué,
      // ex. DatePicker portalisé ouvert depuis un dropdown parent).
      if (t instanceof Element && t.closest('[data-floating-panel]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // capture:true → suit aussi le scroll des conteneurs internes
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, compute, onClose, triggerRef]);

  return createPortal(
    <AnimatePresence>
      {open && pos && (
        <motion.div
          ref={panelRef}
          data-floating-panel=""
          role={role}
          onKeyDown={onKeyDown}
          initial={{ opacity: 0, y: pos.placement === 'top' ? 6 : -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: pos.placement === 'top' ? 6 : -6, scale: 0.97 }}
          transition={{ duration: 0.18, ease: easeApple }}
          style={{
            position: 'fixed',
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxHeight,
            transformOrigin: pos.placement === 'top' ? 'bottom' : 'top',
            ...(pos.placement === 'top' ? { bottom: pos.bottom } : { top: pos.top }),
          }}
          className={`z-[10000] flex flex-col overflow-hidden glass-menu ${sheen ? 'glass-sheen relative' : ''} ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default FloatingPanel;
