-- CreateTable
CREATE TABLE "GameChallenge" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,
    "currentTurn" TEXT NOT NULL,
    "board" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameChallenge_toUserId_status_idx" ON "GameChallenge"("toUserId", "status");

-- CreateIndex
CREATE INDEX "GameChallenge_fromUserId_status_idx" ON "GameChallenge"("fromUserId", "status");

-- CreateIndex
CREATE INDEX "GameSession_player1Id_status_idx" ON "GameSession"("player1Id", "status");

-- CreateIndex
CREATE INDEX "GameSession_player2Id_status_idx" ON "GameSession"("player2Id", "status");

-- CreateIndex
CREATE INDEX "GameSession_status_idx" ON "GameSession"("status");
