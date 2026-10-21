-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "attribution" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "attribution" TEXT;

-- CreateTable
CREATE TABLE "ConversionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "organizationId" TEXT,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME
);

-- CreateIndex
CREATE INDEX "ConversionEvent_status_nextAttemptAt_idx" ON "ConversionEvent"("status", "nextAttemptAt");
