import type { EngineWin } from '../types';
import { gx } from '../ui/kit';

/**
 * Fenêtre « virtuelle » pour un composant monté HORS d'une fenêtre (widget du bureau) : ses volets modaux
 * (formulaire de tâche, confirmation…) s'ouvrent au centre du bureau, sur un calque plein écran dédié.
 * Même mécanique que les fenêtres (`GX.ui.sheet`), aucune copie.
 */
let host: HTMLElement | null = null;
function layer(): HTMLElement {
  if (host && host.isConnected) return host;
  const body = gx().root.querySelector('.gx-body') as HTMLElement;
  host = document.createElement('div'); host.className = 'wrs-host'; body.append(host);
  return host;
}
export const desktopWin = (title = ''): EngineWin => ({
  params: {},
  setTitle: () => {},
  sheet: (html, o) => gx().ui.sheet(layer(), html, { ...(o || {}), title }),
});
