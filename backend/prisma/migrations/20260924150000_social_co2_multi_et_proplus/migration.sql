-- Digital : plusieurs classes CO² par publication, et marqueur PRO+ (correctif 58, 24/09/2026).
-- Purement additif. `co2` (une seule valeur) est CONSERVÉ : la route le recalcule comme
-- première valeur de `co2s`, ce qui garde un retour arrière sans perte.

ALTER TABLE "SocialPost" ADD COLUMN "co2s" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SocialPost" ADD COLUMN "proPlus" BOOLEAN NOT NULL DEFAULT false;

-- Reprise : la classe unique existante devient la première (et seule) de la liste.
-- Rejouable sans risque : ne touche que les lignes dont la liste est encore vide.
UPDATE "SocialPost"
SET "co2s" = ARRAY["co2"]
WHERE "co2" IS NOT NULL AND "co2" <> '' AND ("co2s" IS NULL OR cardinality("co2s") = 0);
