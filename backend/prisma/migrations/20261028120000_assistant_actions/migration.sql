-- mIAouss qui agit (lot 1a, 28/10/2026) : journal des actions PROPOSEES par l'assistant et validees (ou non) par
-- la personne. Reservation atomique (une action ne s'execute qu'une fois), expiration a 24 h calculee a la lecture.
--
-- MIGRATION ADDITIVE : une table nouvelle, aucune donnee existante touchee.
-- Retour arriere : DROP TABLE "AssistantAction";
--
-- "userId" : reference libre sans FK, style des autres tables Assistant*. Index (userId, createdAt) : toutes les
-- lectures filtrent sur l'interlocuteur.

-- CreateTable
CREATE TABLE "AssistantAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantAction_userId_createdAt_idx" ON "AssistantAction"("userId", "createdAt");
