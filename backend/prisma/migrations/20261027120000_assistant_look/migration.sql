-- mIAouss personnalisable (correctif 102, 27/10/2026) : l'apparence choisie par chaque personne
-- (pelage, yeux, tenue, accessoires, prénom). JSON libre côté base, validé par la liste blanche LOOK_KEYS de
-- routes/assistant.ts ; null = le mIAouss d'origine. ADDITIVE.
-- Retour arrière : ALTER TABLE "AssistantUser" DROP COLUMN "look";
ALTER TABLE "AssistantUser" ADD COLUMN "look" JSONB;
