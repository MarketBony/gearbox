-- FORMS BONY F2a (01/10/2026) : kits de marque partages (themes enregistres sous un nom).
-- MIGRATION ADDITIVE : une table nouvelle. Rollback = DROP TABLE "BonyThemeKit";

-- CreateTable
CREATE TABLE "BonyThemeKit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "theme" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonyThemeKit_pkey" PRIMARY KEY ("id")
);
