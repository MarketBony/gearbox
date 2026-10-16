-- Taches multi-assignees (16/10/2026). ADDITIVE : nouvelle colonne liste ; `assignedUserId` est conserve
-- et tenu = premier de la liste par backend/src/utils/taskAssignees.ts (l'ancienne interface ne lit que lui).
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "assignedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Reprise des donnees : une tache deja assignee recoit sa personne comme unique element de la liste.
-- Rejouable sans effet : ne touche que les listes encore vides.
UPDATE "Task"
SET "assignedUserIds" = ARRAY["assignedUserId"]
WHERE "assignedUserId" IS NOT NULL
  AND "assignedUserId" <> ''
  AND cardinality("assignedUserIds") = 0;
