-- Minigolf (15/10/2026) : réglages du défi choisis par celui qui lance. Additive, nullable.
ALTER TABLE "GameChallenge" ADD COLUMN IF NOT EXISTS "options" JSONB;
