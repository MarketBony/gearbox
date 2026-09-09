-- Correctif 49 (09/09/2026) — module Digital.
--
-- Deux colonnes, toutes deux PUREMENT ADDITIVES et avec une valeur par défaut : aucune
-- donnée existante n'est touchée, aucune ligne ne devient invalide, et un retour arrière
-- se fait par un simple DROP COLUMN.
--
-- 1) SocialPost.mediaNames — le nom d'ORIGINE de chaque visuel, en tableau parallèle à
--    mediaFiles (même longueur, même ordre, l'index fait le lien). Les fichiers sur
--    disque gardent leur uuid : c'est une règle de sécurité de routes/uploads.ts, le nom
--    d'origine ne doit jamais entrer dans un chemin. Les 25 publications qui portent
--    déjà des médias reçoivent un tableau vide et continuent d'afficher le nom uuid.
--
-- 2) DigitalTags.lom — les mentions Loi LOM deviennent éditables depuis l'écran
--    « Gestion des TAGS », comme networks et co2. Troisième et dernière catégorie
--    ouverte : ce sont les seuls champs de SocialPost typés String LIBRE.
--
-- ⚠️ Rappel de contexte, pour qui lira ceci plus tard : jusqu'à ce correctif, l'écran de
-- gestion des tags n'écrivait PAS en base — il écrivait dans le localStorage du
-- navigateur. La table DigitalTags existait et n'était jamais alimentée par le client.

-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN "mediaNames" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "DigitalTags" ADD COLUMN "lom" TEXT[] DEFAULT ARRAY[]::TEXT[];
