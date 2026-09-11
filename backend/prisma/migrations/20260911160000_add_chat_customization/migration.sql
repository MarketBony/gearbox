-- Personnalisation du Chat PAR CONVERSATION (11/09/2026).
--
-- Demande de Theo apres un premier jet global : "je veux que la personnalisation soit
-- propre a chaque discussion". Les colonnes User.chatBackground / User.chatBubble sont
-- conservees et deviennent le DEFAUT des conversations sans reglage propre.
--
-- MIGRATION PUREMENT ADDITIVE : une table nouvelle, aucune colonne existante touchee,
-- aucune donnee modifiee. Rollback = DROP TABLE "ChatCustomization".
--
-- L'unicite (userId, conversationId) est ce qui permet l'upsert et empeche les doublons
-- si deux onglets enregistrent en meme temps. L'index sur userId sert le chargement en
-- une requete a l'ouverture du Chat (Postgres n'indexe pas les cles etrangeres, lecon du
-- correctif 48).

-- CreateTable
CREATE TABLE "ChatCustomization" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "background" TEXT,
    "bubble" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatCustomization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatCustomization_userId_conversationId_key" ON "ChatCustomization"("userId", "conversationId");

-- CreateIndex
CREATE INDEX "ChatCustomization_userId_idx" ON "ChatCustomization"("userId");

-- AddForeignKey
ALTER TABLE "ChatCustomization" ADD CONSTRAINT "ChatCustomization_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
