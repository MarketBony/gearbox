# Budget (v2) — besoins partagés à traiter à l'intégration

## 1. Extraire le moteur d'agrégation de `pages/Budget.tsx` dans `services/budgetStats.ts`

**Quoi.** La logique qui produit TOUS les montants du Budget vit dans la page (`useMemo`
« AGGREGATION ENGINE », l.366-662, et la fusion des buckets de `loadData`, l.261-308) — pas dans
`constants.ts`. La rubrique v2 ne doit pas en avoir une seconde copie.

**Fourni.** `ui2/apps/budget/budgetStats.ts`, extrait À L'IDENTIQUE (même ordre d'opérations,
mêmes tests, mêmes arrondis), marqué « à déplacer dans services/ ». Signatures :

```ts
prepareBudgetLines(budgets: BudgetLine[], perimetreImpose: string[] | null)
  : { lines: BudgetLine[]; missing: BudgetLine[]; generic: BudgetLine | null }
computeBudgetStats(input: {
  budgets; projects; fixedExpenses; filterSites: string[]; filterBrands: BrandType[];
  filterServices: ServiceType[]; filterYear: number; filterMonthStart: number;
  filterMonthEnd: number; filterProPlus: 'all' | 'pro' | 'standard';
}): { chartData; matrix: BudgetMatrixRow[]; totalForecast: number; totalActual: number }
groupProvisions(budgets: BudgetLine[], filterSites: string[])
  : { totalAnnualGroup; displayBudgets; groups: [plaque, BudgetLine[]][] }
getPlaqueForSite(site), annualOf(line), MONTHS, SPECIFIC_ENTITIES
```

**À faire.** Déplacer le fichier dans `services/budgetStats.ts` (modèle : `services/dashboardStats.ts`)
et faire appeler `computeBudgetStats` / `prepareBudgetLines` / `groupProvisions` par
`pages/Budget.tsx` DANS LE MÊME LOT — sinon deux copies coexistent et divergeront (c'est
exactement l'historique Budget/Dashboard de CLAUDE.md). Puis changer l'import de `BudgetApp.tsx`.
Contrôle conseillé avant bascule : mêmes filtres, mêmes totaux (KPI + chaque ligne du tableau)
entre l'ancienne page et la v2, en PRODUCTION réelle (lecture seule).

## 2. Migration des buckets Alpine-* / Nissan (écriture au montage)

**Quoi.** `pages/Budget.tsx` ÉCRIT en base, au montage et pour les éditeurs (Master, Administrator,
Director), les lignes `Alpine-Clermont`, `Alpine-Vichy`, `Alpine-Le Puy`, `Alpine-Rodez`, `Nissan`
manquantes et SUPPRIME la ligne générique `Alpine`.

**En v2.** Seule la fusion EN MÉMOIRE est reprise (`prepareBudgetLines` : même affichage, mêmes
totaux ; jamais pour un rôle cloisonné). Aucune écriture : une migration déclenchée par chaque
fenêtre ouverte, en parallèle de l'ancienne page, n'est pas souhaitable.

**Proposition.** Une migration serveur ponctuelle (ou au démarrage du conteneur `api`), ou à
défaut une fonction `ensureBudgetBuckets()` dans `ui2/store/collections.ts`, appelée une fois par
session pour un éditeur, à partir de `prepareBudgetLines(...).missing / .generic`. Probablement
déjà sans objet en production (les buckets existent depuis août) : à vérifier en base.

## 3. Rien d'autre

Données : `useBudgets`, `upsertBudget`, `useFixedExpenses` (collections), `projects` (workspace).
Aucun `db.*` direct.
