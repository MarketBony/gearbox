-- Réglages d'application modifiables en ligne (premier usage : interrupteur de la
-- rubrique Jeux). Table NEUVE, purement additive : aucun ALTER sur l'existant,
-- aucune donnée semée — une table vide signifie « tout aux valeurs par défaut ».

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
