-- Couleur des bulles de message du Chat, par utilisateur (11/09/2026).
--
-- Demande de Theo, apres avoir vu les fonds : "la possibilite de changer la couleur des
-- chats aussi dans la personnalisation, parce que le degrade on peut vite s'en lasser".
--
-- MIGRATION PUREMENT ADDITIVE : une colonne nullable, aucune donnee touchee. NULL = le
-- degrade Bony historique (orange -> violet), ecrit en dur jusqu'ici dans pages/Chat.tsx.
-- Rollback = ALTER TABLE "User" DROP COLUMN "chatBubble".
--
-- La valeur est un IDENTIFIANT du catalogue (lib/personnalisationChat.ts), jamais une
-- couleur CSS libre : accepter du CSS arbitraire venu du client reviendrait a injecter
-- une declaration de style dans la page. Le serveur valide la forme, le client resout
-- l'id -- un id inconnu retombe sur le degrade par defaut.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "chatBubble" TEXT;
