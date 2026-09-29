import type { PortedInst } from '../os/bridge';

/** Fenêtre du moteur (engine/wm.ts) ou écran mobile (engine/mobile.ts) qui héberge la rubrique. */
export interface EngineWin {
  params: Record<string, any>;
  setTitle: (title: string, sub?: string) => void;
  sheet: (html: string, opts?: Record<string, unknown>) => { el: HTMLElement; close: (v?: unknown) => void } | null;
  isCompact?: () => boolean;
  close?: () => void;
}

export interface AppProps {
  win: EngineWin;
  /** À remplir par la rubrique : menus de la barre du haut, commandes. */
  inst: PortedInst;
}
