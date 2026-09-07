-- Index sur Task.projectId (correctif 48, 07/09/2026).
--
-- Postgres n'indexe PAS automatiquement une colonne de clé étrangère : la contrainte
-- posée par la migration initiale ne crée aucun index. Or `task.findMany({ where: {
-- projectId } })` est appelé à chaque PUT de projet, dans la transaction.
--
-- ⚠️ Purement ADDITIVE : aucune donnée touchée, aucun ALTER de colonne. Réversible par
-- un simple DROP INDEX.
--
-- ⚠️ Pas de CONCURRENTLY : Prisma exécute ses migrations dans une transaction, où
-- CREATE INDEX CONCURRENTLY est illégal. À quelques centaines de lignes le verrou est
-- instantané ; si la table atteignait un jour des millions de lignes, il faudrait le
-- faire à la main hors migration.
--
-- ⚠️ HONNÊTETÉ SUR LE GAIN : ce n'est pas cet index qui corrige les échecs de
-- sauvegarde mesurés (saturation du pooler, cf. correctif 48). C'est une assurance pour
-- la croissance, pas la cause traitée.

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
