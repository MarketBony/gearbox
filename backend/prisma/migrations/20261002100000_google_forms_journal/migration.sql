-- GOOGLE FORMS, lot G2 (01/10/2026) : edition depuis Gearbox -> journal "qui a modifie quoi".
--
-- MIGRATION ADDITIVE : deux colonnes nullables, une table nouvelle. Rollback =
--   ALTER TABLE "GoogleForm" DROP COLUMN "lastEditedBy", DROP COLUMN "lastEditedAt"; DROP TABLE "GoogleFormLog";
-- Cote Google, toutes les modifications apparaissent faites par le compte partage : le journal
-- Gearbox est la seule attribution. Les changements faits directement dans Google n'y figurent pas.

-- AlterTable
ALTER TABLE "GoogleForm" ADD COLUMN "lastEditedBy" TEXT, ADD COLUMN "lastEditedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GoogleFormLog" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleFormLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoogleFormLog_formId_at_idx" ON "GoogleFormLog"("formId", "at");
