-- Tâches autonomes (sans projet) créées depuis la To-do.
-- `projectId` devient nullable : c'est ce qui distingue une tâche autonome d'une
-- tâche de projet. Opération de catalogue (DROP NOT NULL), pas de réécriture de table.
-- Les 4 colonnes ajoutées sont ce dont une tâche autonome a besoin et qu'une tâche de
-- projet hérite aujourd'hui de son projet.

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_projectId_fkey";

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "deadline" TEXT,
ADD COLUMN     "sites" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "brands" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "service" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
