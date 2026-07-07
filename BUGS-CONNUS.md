# BUGS CONNUS

Suivi des bugs identifiés, non corrigés à ce jour. Cocher quand résolu (avec référence du commit).

- [x] Dashboard n'agrège pas les FixedExpense dans "Budget Consommé" — corrigé sur la branche `fix/dashboard-fixed-expenses` (bloc "3bis. Process FIXED EXPENSES" dans pages/Dashboard.tsx, concordance Dashboard/Budget vérifiée)
- [ ] Page `Expenses.tsx` appelle `db.saveExpense`/`db.deleteExpense` qui n'existent pas dans `dataService.ts` — page cassée à l'exécution, indépendamment de la migration backend (+ import du type `OneOffExpense` introuvable dans `../types`, erreur tsc)
- [x] `backend/src/routes/projects.ts` : le PUT recrée les tâches (`deleteMany` + `createMany`) au lieu de les mettre à jour — perte des IDs de tâches à chaque sauvegarde. **Corrigé** (branche `feat/backend-projects-put-fix`) : diff transactionnel update/create/delete, IDs stables vérifiés sur 2 PUT successifs.
- [ ] `backend/src/routes/projects.ts` (POST et PUT) : les dates du body sont passées brutes à Prisma — une date `yyyy-MM-dd` (format frontend) est rejetée (`Expected ISO-8601 DateTime`) et le handler crashe sans réponse (ECONNRESET côté client, pas de middleware d'erreur Express). Préexistant, découvert en testant le fix PUT — à traiter à l'étape 7 (conversion `new Date()` comme dans expenses.ts + middleware d'erreur).
- [ ] Dashboard : avec un filtre site actif, écart possible vs Budget sur les entités multi-sites — le Dashboard attribue le montant plein via le site principal, Budget ventile par site. Asymétrie préexistante (déjà vraie pour les projets), volontairement pas corrigée pour rester cohérent avec le niveau de détail actuel du Dashboard.
- [ ] EquipmentBooking : aucune vérification de chevauchement/disponibilité côté serveur. Deux utilisateurs réservant simultanément le même matériel sur la même période peuvent créer une sur-réservation. À traiter avec une contrainte transactionnelle serveur au moment du branchement frontend↔backend (étape 7), pas avant.
