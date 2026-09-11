-- Fond de discussion du Chat, par utilisateur (11/09/2026).
--
-- Demande de Theo : pouvoir choisir un fond de chat, comme sur WhatsApp et Messenger,
-- soit dans un catalogue genere proceduralement, soit une image importee.
--
-- MIGRATION PUREMENT ADDITIVE : une colonne nullable, aucune donnee touchee. Les comptes
-- existants restent a NULL, c'est-a-dire au fond par defaut de l'application.
-- Rollback = ALTER TABLE "User" DROP COLUMN "chatBackground".
--
-- Pourquoi en base et pas en localStorage : la preference doit suivre l'utilisateur d'un
-- appareil a l'autre (poste, iPhone, Pixel, PWA installee). Une valeur rangee dans le
-- navigateur serait a refaire partout -- lecon de la date de naissance (correctif 26) et
-- des tags Digital (correctif 49), qui ont chacun coute un correctif.
--
-- La valeur est validee cote serveur (routes/auth.ts) : `proc:<id>` ou
-- `/uploads/chatbg/<uuid>.<ext>`, rien d'autre.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "chatBackground" TEXT;
