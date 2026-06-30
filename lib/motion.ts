// Variants & presets Framer Motion partagés — animation cohérente sur toute l'app.
import type { Variants, Transition } from 'framer-motion';

export const easeApple: [number, number, number, number] = [0.25, 0.1, 0.25, 1];
export const springSoft: Transition = { type: 'spring', stiffness: 400, damping: 30 };

// ---- Transitions de page (App.tsx avec AnimatePresence mode="wait") ----
export const pageTransition: Transition = { duration: 0.35, ease: easeApple };
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.992 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit:    { opacity: 0, y: -8, scale: 0.992 },
};

// ---- Apparition en cascade (listes/grilles) ----
export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};
export const fadeUpItem: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeApple } },
};
export const scaleInItem: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: easeApple } },
};

// ---- Micro-interaction « lift » au survol ----
export const hoverLift = {
  whileHover: { y: -4, scale: 1.01 },
  whileTap: { scale: 0.985 },
  transition: springSoft,
};

// ---- Modales / overlays ----
export const overlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25, ease: easeApple } },
  exit:    { opacity: 0, transition: { duration: 0.2, ease: easeApple } },
};
export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3, ease: easeApple } },
  exit:    { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.2, ease: easeApple } },
};
