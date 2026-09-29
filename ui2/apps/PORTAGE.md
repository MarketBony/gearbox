# Porter une rubrique dans l'interface v2 (Gearbox OS)

Mode d'emploi pour transposer une rubrique de la maquette en React, à l'identique, sur les vraies
données. **Modèles à lire en premier :** `todo/TodoApp.tsx` (rubrique simple) et `projects/`
(rubrique complexe : liste + fiche + volets). Tout ce qui suit y est appliqué.

## 1. Ce qu'on attend

- **Rendu identique à la maquette** : même balisage, mêmes classes, même texte. La CSS de la maquette
  est déjà chargée (`ui2/os/maquette.css`, générée) : on n'écrit AUCUNE CSS, on reprend les classes.
- **Fonctionnalités réelles complètes** : la liste de contrôle est l'inventaire de la rubrique,
  `maquettes/ux/inventaires/<rubrique>.md` (champs, filtres, actions, messages, rôles, défauts connus).
  La maquette est le modèle VISUEL ; ses données et sa logique métier sont FICTIVES et simplifiées.
- **Fluidité** : aucune tâche longue à l'ouverture ou à l'interaction courante (voir § 6).

## 2. Sources à lire (et seulement celles-là)

| Quoi | Où |
|---|---|
| Maquette de la rubrique (balisage, comportements) | `maquettes/v2/js/apps/<id>.js` |
| Parité fonctionnelle (liste de contrôle) | `maquettes/ux/inventaires/<rubrique>.md` |
| Page actuelle (vérité fonctionnelle, messages exacts) | `pages/<Page>.tsx` |
| Correspondance champs maquette ⇄ vrais champs | `ui2/os/data.ts` (`mapProject`, `mapPost`…) |
| Règles métier | `constants.ts`, `utils/projet.ts`, `services/dashboardStats.ts` |
| Règles du projet (à respecter absolument) | `CLAUDE.md` (racine) |

## 3. Fichiers : ce que vous créez, ce que vous ne touchez PAS

- **Vous créez uniquement** `ui2/apps/<id>/` : un composant par défaut `<Nom>App.tsx` qui reçoit
  `AppProps` (`ui2/apps/types.ts` : `win`, `inst`), plus des fichiers internes si besoin.
- **Vous ne modifiez PAS** : `ui2/apps/ids.ts`, `ui2/apps/registry.tsx`, `ui2/apps/ui/kit.tsx`,
  `ui2/store/*`, `ui2/os/*`, `constants.ts`, `utils/*`, `services/*`, `types.ts`, `backend/*`, les
  pages actuelles. L'intégration (déclaration de la rubrique, ajouts partagés) est faite ensuite.
- **S'il vous manque quelque chose de partagé** (une primitive, une donnée, une règle à extraire),
  n'improvisez pas une copie locale : écrivez-le dans `ui2/apps/<id>/BESOINS.md` (quoi, pourquoi,
  signature proposée) et avancez avec un bouchon clairement marqué `// BESOIN:`.

## 4. Données et écritures

- **Projets, tâches, tâches libres, utilisateurs** : `ui2/store/workspace.ts`
  (`useWorkspace(s => s.projects)`, `mutateProject`, `mutateTask`, `createProject`…).
- **Budgets, dépenses fixes, publications Digital (+ commentaires, tags), campagnes, matériel,
  réservations, congés** : `ui2/store/collections.ts` (`useBudgets()`, `useFixedExpenses()`,
  `useSocialPosts()`, `useConges(debut, fin)`… et les fonctions d'écriture à côté). `undefined` =
  pas encore chargé. Les écritures REJETTENT en cas d'échec (le message est déjà affiché) : `catch`.
- **INTERDIT** : appeler `db.*` directement pour lire (on perdrait le partage et le temps réel),
  `useRealtimeSync` (la source s'en charge), recalculer un montant (budget, réel, avancement,
  répartition) : ils viennent de `recalculerProjet`, `computeDashboardStats` et des fonctions de
  `constants.ts` (`resolveBudgetLine`, `splitShareToBuckets`, `resolveSiteAlias`, `isHoldingBrand`).
- **Règles non négociables** (détail dans `CLAUDE.md`) : Brouillon ne remonte nulle part sauf To-do et
  prochains événements Hello ; Archivé reste compté au budget ; Holding exclusif et jamais imputé ;
  Alpine PAR SITE, Nissan GLOBAL ; curseurs de part : vide = 100 % marque, lus seulement si une
  marque RDM est présente, Alpine passe avant Nissan.
- **Rôles** : droits d'écriture = ceux de la page actuelle (souvent `canEditProjects(role)` ou une
  liste de `constants.ts`). Lecture seule = champs `disabled`, boutons d'écriture absents. Le
  cloisonnement est côté serveur : ne filtrez jamais par site « pour faire propre », et ne fabriquez
  jamais côté client une donnée que le serveur n'a pas envoyée.

## 5. Interface : primitives et moteur

- **Primitives React** (`ui2/apps/ui/kit.tsx`) — même balisage que le moteur :
  `Icon`, `Avatar`, `ServiceBadge`, `BrandChips`, `ProPlus`, `Chips` (multi, « Toutes » exclusif),
  `Seg` (segmenté avec curseur), `PickerBtn`, `DraftInput` (texte / nombre / multiligne : écrit au
  départ du champ, jamais à la frappe), `Stack` + `useCompact` (liste → détail en fenêtre étroite),
  `useSheets(win)` (volets à contenu React), `useEngineStore` (préférence persistée),
  `useEngineEvent`, `gx()`, `hud()`.
- **Fenêtres surgissantes du moteur**, appelées impérativement (elles portent le mouvement) :
  `gx().ui.sitePicker(el, valeurs, cb, { variant })`, `gx().ui.dateRange(el, {from,to}, cb)`,
  `gx().ui.pick(el, groupes, opts)`, `gx().menu.open(items, el | {x,y})`,
  `gx().shell.quickLook({ title, html, origin })`, `gx().shell.notify(...)`, `hud(msg)`.
  `<select className="select">` et `<input type="date">` ouvrent AUTOMATIQUEMENT le menu et le
  calendrier du moteur : utilisez les éléments natifs, rien à brancher.
- **Animations** : `gx().animate(el, keyframes, { spring })`, `gx().flip(el, rectAvant, { spring })`
  — les mêmes ressorts que la coque. Pas de bibliothèque d'animation.
- **Barre du haut et Spotlight** : remplissez `inst.menus = () => ({ 'Fichier': [...], ... })` et
  `inst.command = (c) => ...` à chaque rendu (voir To-do).
- **En-tête** : rendez vous-même `<span className="ah-eye">Catégorie</span>` au-dessus du `<h1>`.
- La rubrique vit dans une racine FANTÔME : `document.querySelector`, `document.activeElement`,
  `document.elementFromPoint` ne voient rien. Utilisez des `ref` React, ou `gx().root.*`.
- **Pas de `confirm()`, `alert()`, `prompt()` natifs** (bloquants, hors charte) : volet de
  confirmation (`useSheets`) ou bouton en deux clics ; messages par `hud()`.

## 6. Fluidité (mesurée en build de prod, onglet au premier plan)

- Lignes de liste en `React.memo` avec comparaison des références (`Item` de Projets, `Card` de To-do).
- Filtres et recherche via `useDeferredValue` (la frappe reste instantanée).
- Calculs dérivés en `useMemo` ; jamais de travail proportionnel à toutes les données à chaque rendu.
- Sélecteurs Zustand qui rendent une valeur STABLE (un champ de l'état), jamais un tableau recalculé.
- Le premier rendu est déjà découpé (transition, `OsHost.tsx`) : ne pas le contourner.

## 7. Avant de rendre

- `npx tsc --noEmit` : **9 erreurs de référence** à la racine, aucune dans `ui2/`. `npx vite build` passe.
  ⚠️ Pas de `@types/react` : un composant qui reçoit `key` doit être typé `React.FC<Props>`.
- Parcourez l'inventaire ligne à ligne : chaque point est couvert, ou listé dans votre rapport comme
  écart VOULU (défaut d'origine corrigé par la maquette) ou MANQUANT (avec la raison).
- **Pas de navigateur, pas d'écriture en base** : le test réel est fait à l'intégration.
- Rapport final : fichiers créés, couverture de l'inventaire, écarts, `BESOINS.md`, points incertains.
  Ne déclarez rien « testé » : vous ne pouvez que compiler.
