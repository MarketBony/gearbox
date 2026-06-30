-- Migration ADDITIVE et NON DESTRUCTIVE : ajout du booléen PRO+ (B2B).
-- ADD COLUMN avec DEFAULT false → toutes les lignes existantes deviennent non-PRO+.
-- Aucune donnée existante n'est modifiée ou supprimée.

ALTER TABLE "Project" ADD COLUMN "proPlus" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OneOffExpense" ADD COLUMN "proPlus" BOOLEAN NOT NULL DEFAULT false;
