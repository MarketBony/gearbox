-- Rubrique CONGES (12/09/2026).
--
-- Portage du fichier HTML tenu par le boss de Theo (planning 2026 de l'equipe marketing,
-- 15 collaborateurs, donnees en localStorage sur un seul poste) vers une donnee partagee.
--
-- MIGRATION PUREMENT ADDITIVE : deux tables nouvelles, aucune colonne existante touchee,
-- aucune donnee modifiee. Rollback = DROP TABLE "CongeJour"; DROP TABLE "CongeMembre";
--
-- Deux choix a connaitre avant d'y toucher :
--
--  1. UNE LIGNE = UNE CELLULE (une personne x un jour), et non une plage. C'est la forme
--     de la maquette, ou la saisie se fait au clic sur une case ; une ligne par plage
--     obligerait a decouper et fusionner des intervalles a chaque modification d'un seul
--     jour. Le volume est derisoire : quelques centaines de lignes par an.
--     L'unicite (userId, date) permet l'upsert et empeche deux onglets de creer deux
--     lignes pour la meme cellule.
--
--  2. LE PERIMETRE EST UNE TABLE DEDIEE et non un booleen sur "User" : routes/users.ts
--     destructure ses champs explicitement a plusieurs endroits et publicUser doit suivre
--     -- c'est le piege qui a coute nissanShare puis birthdate. Une table separee se gere
--     par sa propre route.
--     Retirer quelqu'un du perimetre ne supprime AUCUN de ses conges : il disparait du
--     planning, ses lignes restent.
--
-- La date est un TEXT 'YYYY-MM-DD' et non un timestamp : un jour de conge n'a ni heure ni
-- fuseau (meme raison que User.birthdate et Task.deadline).
-- Les index sont explicites : Postgres n'indexe pas les cles etrangeres (lecon du 48).

-- CreateTable
CREATE TABLE "CongeJour" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CongeJour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CongeMembre" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CongeMembre_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CongeJour_userId_date_key" ON "CongeJour"("userId", "date");

-- CreateIndex
CREATE INDEX "CongeJour_date_idx" ON "CongeJour"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CongeMembre_userId_key" ON "CongeMembre"("userId");
