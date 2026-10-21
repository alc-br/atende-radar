-- CreateTable
CREATE TABLE "AiClassification" (
    "conversationId" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiClassification_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AiClassification_organizationId_updatedAt_idx" ON "AiClassification"("organizationId", "updatedAt");
