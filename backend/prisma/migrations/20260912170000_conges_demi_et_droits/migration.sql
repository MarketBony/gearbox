-- CONGES v2 (12/09/2026) : demi-journee separee de la famille, et droits a CP par periode.
--
-- MIGRATION ADDITIVE : une colonne nullable ajoutee, une table nouvelle. Aucune donnee
-- existante modifiee. Rollback =
--   ALTER TABLE "CongeJour" DROP COLUMN "demi"; DROP TABLE "CongeDroit";
--
-- 1. "CongeJour"."demi" -- La famille de conge ne porte plus la demi-journee. Le
--    correctif 54 codait les demi-journees DANS le type ('CPAM' = CP matin, 'CPAPM' = CP
--    apres-midi) ; ajouter "heures de recup matin" et "conge sans solde" demandes par
--    Theo aurait impose 'HRAM', 'HRAPM', 'CSSAM'..., soit une combinatoire qui double a
--    chaque nouveau type. On separe : "type" = la famille, "demi" = 'AM' | 'PM' | NULL.
--    NULLABLE, donc aucune valeur par defaut a ecrire ; et la table etait VIDE en
--    production au moment de cette migration (les donnees du correctif 54 etaient des
--    donnees de recette, supprimees en fin de lot), il n'y a donc AUCUNE ligne 'CPAM' ou
--    'CPAPM' a convertir. Verifie avant d'ecrire cette migration.
--
-- 2. "CongeDroit" -- Le droit a conges payes d'une personne pour une periode de reference.
--    La periode legale court du 1er juin au 31 mai (art. L3141-3 : 2,5 jours ouvrables par
--    mois travaille, 30 ouvrables au maximum, soit 25 jours ouvres). Elle est identifiee
--    par son annee de DEBUT : 2026 = 1er juin 2026 -> 31 mai 2027.
--    Une ligne n'existe QUE si le droit a ete modifie : l'absence de ligne vaut 25 jours
--    (CONGES_DROIT_DEFAUT dans constants.ts). C'est ce qui evite de devoir creer une ligne
--    par personne chaque 1er juin, donc de dependre d'une tache planifiee qui n'existe pas.
--    Ne concerne QUE les CP : RTT, heures de recup, sans solde et revision sont suivis
--    mais ne decomptent aucun solde.
--
-- Les index sont explicites : Postgres n'indexe pas les cles etrangeres (lecon du 48).

-- AlterTable
ALTER TABLE "CongeJour" ADD COLUMN "demi" TEXT;

-- CreateTable
CREATE TABLE "CongeDroit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periode" INTEGER NOT NULL,
    "jours" DOUBLE PRECISION NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CongeDroit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CongeDroit_userId_periode_key" ON "CongeDroit"("userId", "periode");
