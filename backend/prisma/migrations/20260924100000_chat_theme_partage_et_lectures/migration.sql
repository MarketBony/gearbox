-- Thème de discussion PARTAGÉ et accusés de lecture (correctif 57, 24/09/2026).
-- Purement additif : trois colonnes, aucune suppression. `ChatCustomization` reste en
-- place (obsolète) pour permettre un retour arrière sans perte.

ALTER TABLE "ChatConversation" ADD COLUMN "background" TEXT;
ALTER TABLE "ChatConversation" ADD COLUMN "bubble" TEXT;
ALTER TABLE "ChatConversation" ADD COLUMN "readAt" JSONB NOT NULL DEFAULT '{}';

-- Reprise : la personnalisation personnelle la plus RÉCENTE de chaque conversation devient
-- son thème partagé. Fond et bulle repris séparément (valeur non nulle la plus récente de
-- chacun). Jamais sur le Chat Général, inviolable.
UPDATE "ChatConversation" c
SET "background" = x."background"
FROM (
  SELECT DISTINCT ON ("conversationId") "conversationId", "background"
  FROM "ChatCustomization"
  WHERE "background" IS NOT NULL AND "background" <> ''
  ORDER BY "conversationId", "updatedAt" DESC
) x
WHERE c."id" = x."conversationId" AND c."type" <> 'general';

UPDATE "ChatConversation" c
SET "bubble" = x."bubble"
FROM (
  SELECT DISTINCT ON ("conversationId") "conversationId", "bubble"
  FROM "ChatCustomization"
  WHERE "bubble" IS NOT NULL AND "bubble" <> ''
  ORDER BY "conversationId", "updatedAt" DESC
) x
WHERE c."id" = x."conversationId" AND c."type" <> 'general';
