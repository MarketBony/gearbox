# Besoins partagés — Agenda (`agenda`)

1. **Intégration** (hors de ce dossier) : ajouter `'agenda'` à `PORTED_IDS` (`ui2/apps/ids.ts`) et
   `agenda: AgendaApp` à `PORTED_APPS` (`ui2/apps/registry.tsx`). Rien d'autre : aucune donnée nouvelle
   (projets = `useWorkspace`), aucune écriture.
2. **`Seg` (kit) : infobulle par bouton.** La maquette pose `data-tip="Semaine (1)"`… sur chaque vue du
   sélecteur ; `Seg` n'accepte qu'un libellé. Proposition : option `tips?: Partial<Record<T, string>>`
   (ou un 3e élément dans `options`). En attendant : pas d'infobulle sur les vues (raccourcis 1-5 actifs).
3. **Ouverture d'un projet** : la rubrique ouvre la fenêtre `project` (`GX.wm.open('project', { id, title }, { origin })`),
   comme la maquette, et non plus la page Projets (`pendingProjectId`). À confirmer à l'intégration que
   c'est bien la fenêtre voulue pour tous les rôles (chef de site compris).
