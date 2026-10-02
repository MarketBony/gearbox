-- FORMS BONY F4 (02/10/2026) : rattachement a un projet + tags, abonnes, versions publiees, tirages au sort.
-- MIGRATION ADDITIVE : colonnes nouvelles (valeurs par defaut) et deux tables nouvelles. Rien n'est modifie ni supprime.
-- Rollback : DROP TABLE "BonyFormDraw"; DROP TABLE "BonyFormVersion";
--            ALTER TABLE "BonyForm" DROP COLUMN "projectId", DROP COLUMN "sites", DROP COLUMN "brands", DROP COLUMN "service", DROP COLUMN "followers";

-- AlterTable
ALTER TABLE "BonyForm" ADD COLUMN "projectId" TEXT;
ALTER TABLE "BonyForm" ADD COLUMN "sites" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "BonyForm" ADD COLUMN "brands" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "BonyForm" ADD COLUMN "service" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "BonyForm" ADD COLUMN "followers" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "BonyForm_projectId_idx" ON "BonyForm"("projectId");

-- CreateTable
CREATE TABLE "BonyFormVersion" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "def" JSONB NOT NULL,
    "publishedBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonyFormVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BonyFormVersion_formId_version_key" ON "BonyFormVersion"("formId", "version");

-- CreateTable
CREATE TABLE "BonyFormDraw" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "drawnBy" TEXT NOT NULL,
    "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rules" JSONB NOT NULL,
    "eligible" INTEGER NOT NULL,
    "winners" JSONB NOT NULL,
    "proof" TEXT NOT NULL,

    CONSTRAINT "BonyFormDraw_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BonyFormDraw_formId_idx" ON "BonyFormDraw"("formId");
