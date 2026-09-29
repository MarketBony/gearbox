# Export — besoins partagés (à traiter à l'intégration)

## 1. Construction du fichier : UNE seule copie, dans `services/`
- **Quoi** : déplacer `ui2/apps/export/exportXlsx.ts` dans `services/exportXlsx.ts` et faire utiliser
  `buildExport()` + `writeExportFile()` par `pages/Export.tsx` ET par `ExportApp.tsx`.
- **Pourquoi** : la logique vivait dans la page (`handleExport`). Elle est reprise ici À L'IDENTIQUE (filtres,
  colonnes, valeurs brutes, `xlsx-js-style`, styles, nom de fichier), mais deux copies finiront par diverger —
  c'est ce qui a fait diverger Budget et Dashboard quatre fois.
- **Signatures** :
  - `buildExport(projects: Project[], fixedExpenses: FixedExpense[], from: string, to: string): { projects: Cell[][]; expenses: Cell[][] }`
  - `writeExportFile(data, from, to): Promise<void>` ; `exportFileName(from, to)` ; `periodError(from, to)`.

## 2. `EXPORT_ALLOWED_ROLES` dans `constants.ts`
- **Quoi** : la constante est déclarée dans `pages/Export.tsx` (App.tsx l'importe de là) et `Sidebar.tsx:203`
  recopie la liste en dur. La déplacer dans `constants.ts` (avec un `canExport(role)`).
- **Bouchon** : `// BESOIN:` dans `ExportApp.tsx`, qui importe la constante depuis `pages/Export.tsx`.

## 3. Relecture ATTENDABLE d'une ressource partagée
- **Quoi** : `reload(): Promise<void>` sur les ressources de `ui2/store/collections.ts` (ici `fixedExpenses`).
- **Pourquoi** : la page relisait projets ET dépenses fixes au clic. Les projets sont relus
  (`reloadProjects()` de workspace, attendable) ; pour les dépenses, `reloadAll()` est différé de 300 ms et ne
  se laisse pas attendre : on utilise la valeur tenue à jour par le temps réel (chargée si besoin par `ensure`).
- **Bouchon** : `// BESOIN:` dans `ExportApp.tsx` (`generate`).

## 4. Déclaration de la rubrique
- `ui2/apps/ids.ts` : ajouter `'export'` à `PORTED_IDS` ; `ui2/apps/registry.tsx` : `export: ExportApp`.
