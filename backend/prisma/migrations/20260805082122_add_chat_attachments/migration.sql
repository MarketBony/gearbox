-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "fileExpiredAt" TIMESTAMP(3),
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileSize" INTEGER;
