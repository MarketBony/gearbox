# BUGS CONNUS

Suivi des bugs identifiés, non corrigés à ce jour. Cocher quand résolu (avec référence du commit).

- [ ] Dashboard n'agrège pas les FixedExpense dans "Budget Consommé" (en cours de fix, branche `fix/dashboard-fixed-expenses`)
- [ ] Page `Expenses.tsx` appelle `db.saveExpense`/`db.deleteExpense` qui n'existent pas dans `dataService.ts` — page cassée à l'exécution, indépendamment de la migration backend (+ import du type `OneOffExpense` introuvable dans `../types`, erreur tsc)
- [ ] `backend/src/routes/projects.ts` : le PUT recrée les tâches (`deleteMany` + `createMany`) au lieu de les mettre à jour — perte des IDs de tâches à chaque sauvegarde
