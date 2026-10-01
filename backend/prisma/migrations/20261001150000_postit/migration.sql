-- POST-IT (01/10/2026) : agenda personnel de la To-do (sous-rubrique "Post-it").
--
-- MIGRATION ADDITIVE : une table nouvelle, aucune donnee existante touchee. Rollback =
--   DROP TABLE "PostIt";
--
-- Un post-it n'appartient qu'a son auteur ("userId", reference libre sans FK, style du
-- schema). Dates en TEXTE local ('YYYY-MM-DDTHH:mm', ou 'YYYY-MM-DD' pour une journee
-- entiere) : pas de fuseau, pas de bug J+1. Index explicite sur "userId" : toutes les
-- lectures filtrent dessus (Postgres n'indexe pas les references, lecon du 48).

-- CreateTable
CREATE TABLE "PostIt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL DEFAULT 'yellow',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostIt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostIt_userId_idx" ON "PostIt"("userId");
