-- Commentaires des publications du calendrier editorial (correctif 50, 10/09/2026).
--
-- Demande de l'equipe digitale : laisser une consigne sur un post sans passer par le
-- chat, ou elle se perd. Un fil par publication, avec auteur et horodatage.
--
-- MIGRATION PUREMENT ADDITIVE : une seule table nouvelle, aucune colonne modifiee,
-- aucune donnee touchee. Les publications existantes se retrouvent simplement avec un
-- fil vide. Rollback = DROP TABLE "SocialComment".
--
-- Choix a connaitre avant d'y toucher :
--  - aucun nom ni couleur d'auteur n'est stocke : `authorId` seul, l'identite se resout
--    a l'affichage (une donnee d'identite ne se duplique pas — lecon du correctif 30) ;
--  - ON DELETE CASCADE : supprimer une publication emporte ses commentaires ;
--  - l'index sur "postId" est indispensable, Postgres n'indexe pas les cles etrangeres
--    (c'est l'oubli qu'a coute le correctif 48 sur "Task").

-- CreateTable
CREATE TABLE "SocialComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialComment_postId_idx" ON "SocialComment"("postId");

-- AddForeignKey
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
