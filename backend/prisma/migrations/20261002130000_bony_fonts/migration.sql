-- FORMS BONY F2a (01/10/2026) : bibliotheque partagee des polices de marque (NouvelR, Dacia Block...).
-- Le fichier vit chez Cloudflare (KV du Worker) ; la table ne garde que la famille, la graisse et l'adresse.
-- MIGRATION ADDITIVE : une table nouvelle. Rollback = DROP TABLE "BonyFont";

-- CreateTable
CREATE TABLE "BonyFont" (
    "id" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 400,
    "style" TEXT NOT NULL DEFAULT 'normal',
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonyFont_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BonyFont_family_weight_style_key" ON "BonyFont"("family", "weight", "style");
