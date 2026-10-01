-- GOOGLE FORMS (01/10/2026) : rubrique "Forms" de l'interface v2.
--
-- MIGRATION ADDITIVE : trois tables nouvelles, aucune donnee existante touchee. Rollback =
--   DROP TABLE "GoogleFormResponse"; DROP TABLE "GoogleForm"; DROP TABLE "GoogleConnection";
--
-- "GoogleConnection" : une seule ligne (id = 'google'), jeton de rafraichissement CHIFFRE
--   (AES-256-GCM, cle GOOGLE_TOKEN_KEY hors base).
-- "GoogleForm" : catalogue des formulaires suivis (import par lien, creation en G2).
-- "GoogleFormResponse" : cache des reponses, DONNEES PERSONNELLES des repondants, purge au
--   retrait du formulaire. Index (formId, submittedAt) : lectures par formulaire et synchro
--   incrementale sur la derniere date.

-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" TEXT NOT NULL DEFAULT 'google',
    "email" TEXT,
    "refreshTokenEnc" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "connectedBy" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleForm" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "responderUri" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "acceptingResponses" BOOLEAN NOT NULL DEFAULT false,
    "revisionId" TEXT,
    "structure" JSONB,
    "responseCount" INTEGER NOT NULL DEFAULT 0,
    "lastResponseAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleFormResponse" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "respondentEmail" TEXT,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleFormResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleForm_formId_key" ON "GoogleForm"("formId");

-- CreateIndex
CREATE INDEX "GoogleFormResponse_formId_submittedAt_idx" ON "GoogleFormResponse"("formId", "submittedAt");
