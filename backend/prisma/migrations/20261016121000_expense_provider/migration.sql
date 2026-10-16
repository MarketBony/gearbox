-- Prestataire sur les dépenses fixes (16/10/2026) : texte libre, nullable. Additive.
ALTER TABLE "FixedExpense" ADD COLUMN IF NOT EXISTS "provider" TEXT;
