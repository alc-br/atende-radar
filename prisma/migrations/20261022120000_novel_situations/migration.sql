-- CreateTable
CREATE TABLE "NovelSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "clusterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NovelSignal_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NovelSignal_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "NovelCluster" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NovelCluster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "conversations" INTEGER NOT NULL DEFAULT 0,
    "lastRunConversations" INTEGER NOT NULL DEFAULT 0,
    "orgIdsJson" TEXT NOT NULL DEFAULT '[]',
    "examplesJson" TEXT NOT NULL DEFAULT '[]',
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    "decidedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "NovelSignal_clusterId_createdAt_idx" ON "NovelSignal"("clusterId", "createdAt");

-- CreateIndex
CREATE INDEX "NovelSignal_conversationId_idx" ON "NovelSignal"("conversationId");

-- CreateIndex
CREATE INDEX "NovelCluster_status_lastSeenAt_idx" ON "NovelCluster"("status", "lastSeenAt");
