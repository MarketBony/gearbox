-- FORMS BONY (01/10/2026) : formulaires maison (edites dans Gearbox, servis par le Worker Cloudflare).
--
-- MIGRATION ADDITIVE : deux tables nouvelles, aucune donnee existante touchee. Rollback =
--   DROP TABLE "BonyFormResponse"; DROP TABLE "BonyForm";
-- "BonyFormResponse" contient des DONNEES PERSONNELLES (consentement recueilli par le formulaire).
-- Index unique (formId, uniqueKey) : "une participation par e-mail" sans course possible
-- (uniqueKey NULL = pas de champ unique : Postgres autorise plusieurs NULL).

-- CreateTable
CREATE TABLE "BonyForm" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "responseCount" INTEGER NOT NULL DEFAULT 0,
    "lastResponseAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BonyForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonyFormResponse" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "meta" JSONB,
    "uniqueKey" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonyFormResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BonyForm_publicId_key" ON "BonyForm"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "BonyFormResponse_formId_uniqueKey_key" ON "BonyFormResponse"("formId", "uniqueKey");

-- CreateIndex
CREATE INDEX "BonyFormResponse_formId_submittedAt_idx" ON "BonyFormResponse"("formId", "submittedAt");
