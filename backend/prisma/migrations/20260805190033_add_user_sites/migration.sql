-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sites" TEXT[] DEFAULT ARRAY[]::TEXT[];
