// Rubriques PORTÉES en React (ui2/apps/<id>/). Le moteur (engine/boot.ts) leur fournit une
// fenêtre ; les autres rubriques continuent d'afficher la page actuelle de Gearbox.
// Liste séparée du registre des composants : le moteur n'importe pas React.
export const PORTED_IDS: readonly string[] = ['todo', 'projects', 'archives', 'project', 'budget', 'fixed'];

/** Apps qui n'existent pas dans la navigation (APP_META) : fenêtre d'un projet (« document »). */
export const PORTED_EXTRA_META: Record<string, { id: string; name: string; icon: string; tint: [string, string]; size: [number, number]; minSize: [number, number]; hidden?: boolean; parent?: string }> = {
  project: { id: 'project', name: 'Projet', icon: 'projects', tint: ['#8f12ab', '#5b1bd1'], size: [1100, 800], minSize: [360, 380], hidden: true, parent: 'projects' },
};
