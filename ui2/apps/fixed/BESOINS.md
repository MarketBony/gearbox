# Dépenses (v2) — besoins partagés à traiter à l'intégration

La rubrique ne calcule aucun agrégat budgétaire (elle saisit ce que Budget et Dashboard routent) :
pas d'extraction de logique nécessaire.

## 1. Journal d'activité — `logActivity` exporté par `ui2/store/workspace.ts`

**Quoi.** La page journalise « a créé / a modifié / a supprimé une dépense fixe » (entité
`fixed-expense`, nom = commentaire, sinon site, sinon « Dépense fixe »). `workspace.ts` a déjà un
`logActivity` interne (projets) mais ne l'exporte pas.

**Signature proposée.**
`export function logActivity(action: string, entity: string, entityName: string, entityId?: string): void`
(utilisateur = celui posé par `startWorkspace`).

**Bouchon.** `FixedApp.tsx`, fonction `logActivity` marquée `// BESOIN:` : appelle
`db.logActivity` avec exactement l'entrée de la page. À remplacer par l'export ci-dessus.

## 2. Liste des rôles d'écriture des dépenses dans `constants.ts`

**Quoi.** La page code en dur `['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager']`
(= `EDIT_ROLES` de `backend/src/routes/fixedExpenses.ts`). Recopiée à l'identique dans `FixedApp.tsx`
(marquée `BESOIN:`).

**Proposition.** `export const FIXED_EXPENSE_EDIT_ROLES` + `canEditFixedExpenses(role)` dans
`constants.ts`, utilisés par la page ET la v2 (même principe que `canEditProjects`).
Idem pour le Budget : `['Master', 'Administrator', 'Director']` (`canEditProvisions`) est en dur
dans `pages/Budget.tsx` et dans `ui2/apps/budget/BudgetApp.tsx`.
