-- Refonte des widgets v2, lot W3 (09/10/2026) : bureau enregistré sur le serveur, par utilisateur. Additive.
CREATE TABLE "UserWidgets" (
    "userId" TEXT NOT NULL,
    "desktop" JSONB,
    "phone" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWidgets_pkey" PRIMARY KEY ("userId")
);
