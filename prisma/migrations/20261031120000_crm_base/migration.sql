-- CreateTable
CREATE TABLE "CrmTenantLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'native',
    "externalTenantId" TEXT,
    "externalOrgId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provisioningVersion" INTEGER NOT NULL DEFAULT 1,
    "lastHealthyAt" DATETIME,
    "lastErrorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CrmFeatureState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "flag" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CrmIdentityLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'native',
    "entityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "lastVersion" INTEGER NOT NULL DEFAULT 0,
    "tombstone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CrmBusinessLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "revenueOpportunityId" TEXT,
    "conversationId" TEXT,
    "alertId" TEXT,
    "recoveryItemId" TEXT,
    "sourceEventId" TEXT,
    "sourceVersion" INTEGER,
    "linkKey" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CrmOutboxEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "aggregateVersion" INTEGER NOT NULL DEFAULT 1,
    "payloadJson" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'atenderadar',
    "correlationId" TEXT,
    "traceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" DATETIME,
    "lastErrorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);

-- CreateTable
CREATE TABLE "CrmSyncInbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "consumer" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processed',
    "resultJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CrmSyncCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "cursor" TEXT,
    "lastRunAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "lagSeconds" INTEGER,
    "lastErrorCode" TEXT,
    "statsJson" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CrmIdempotencyKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "responseJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CrmCompany" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "taxId" TEXT,
    "domain" TEXT,
    "segment" TEXT,
    "ownerMemberId" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "importBatchId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CrmPerson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "email" TEXT,
    "emailNorm" TEXT,
    "phoneEncrypted" TEXT,
    "phoneHash" TEXT,
    "phoneLast4" TEXT,
    "phoneKey" TEXT,
    "emailKey" TEXT,
    "companyId" TEXT,
    "ownerMemberId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "mergedIntoId" TEXT,
    "mergeDataJson" TEXT,
    "importBatchId" TEXT,
    "lastInteractionAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrmPerson_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CrmCompany" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmPipeline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "position" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CrmStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "slaDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrmStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmDeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "personId" TEXT,
    "companyId" TEXT,
    "ownerMemberId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceId" TEXT,
    "originKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "amountCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "amountSource" TEXT NOT NULL DEFAULT 'unknown',
    "estimatedAmountCents" INTEGER,
    "confidence" REAL,
    "probability" INTEGER,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "expectedCloseAt" DATETIME,
    "closedAt" DATETIME,
    "lostReasonCode" TEXT,
    "outcomeNote" TEXT,
    "outcomeEvidence" TEXT,
    "nextAction" TEXT,
    "nextActionAt" DATETIME,
    "stageChangedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageLockedByHuman" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrmDeal_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CrmDeal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "CrmStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CrmDeal_personId_fkey" FOREIGN KEY ("personId") REFERENCES "CrmPerson" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CrmDeal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CrmCompany" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmDealEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "actorMemberId" TEXT,
    "actorLabel" TEXT,
    "dataJson" TEXT,
    "dealVersion" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmDealEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dealId" TEXT,
    "personId" TEXT,
    "ownerMemberId" TEXT,
    "dueAt" DATETIME,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "result" TEXT,
    "completedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceId" TEXT,
    "dedupeKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrmActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CrmActivity_personId_fkey" FOREIGN KEY ("personId") REFERENCES "CrmPerson" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dealId" TEXT,
    "conversationId" TEXT,
    "opportunityId" TEXT,
    "alertId" TEXT,
    "agentId" TEXT,
    "ownerMemberId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceJson" TEXT,
    "ruleVersion" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" DATETIME,
    "decisionNote" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmTenantLink_organizationId_key" ON "CrmTenantLink"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmTenantLink_provider_externalTenantId_key" ON "CrmTenantLink"("provider", "externalTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmFeatureState_organizationId_flag_key" ON "CrmFeatureState"("organizationId", "flag");

-- CreateIndex
CREATE UNIQUE INDEX "CrmIdentityLink_organizationId_entityType_sourceId_provider_key" ON "CrmIdentityLink"("organizationId", "entityType", "sourceId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "CrmIdentityLink_organizationId_entityType_externalId_provider_key" ON "CrmIdentityLink"("organizationId", "entityType", "externalId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "CrmBusinessLink_linkKey_key" ON "CrmBusinessLink"("linkKey");

-- CreateIndex
CREATE INDEX "CrmBusinessLink_organizationId_dealId_idx" ON "CrmBusinessLink"("organizationId", "dealId");

-- CreateIndex
CREATE INDEX "CrmBusinessLink_organizationId_conversationId_idx" ON "CrmBusinessLink"("organizationId", "conversationId");

-- CreateIndex
CREATE INDEX "CrmBusinessLink_organizationId_revenueOpportunityId_idx" ON "CrmBusinessLink"("organizationId", "revenueOpportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmOutboxEvent_idempotencyKey_key" ON "CrmOutboxEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CrmOutboxEvent_status_nextAttemptAt_idx" ON "CrmOutboxEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "CrmOutboxEvent_organizationId_aggregateType_aggregateId_aggregateVersion_idx" ON "CrmOutboxEvent"("organizationId", "aggregateType", "aggregateId", "aggregateVersion");

-- CreateIndex
CREATE INDEX "CrmOutboxEvent_organizationId_status_idx" ON "CrmOutboxEvent"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CrmSyncInbox_organizationId_createdAt_idx" ON "CrmSyncInbox"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSyncInbox_consumer_eventId_key" ON "CrmSyncInbox"("consumer", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSyncCheckpoint_organizationId_resource_key" ON "CrmSyncCheckpoint"("organizationId", "resource");

-- CreateIndex
CREATE INDEX "CrmIdempotencyKey_createdAt_idx" ON "CrmIdempotencyKey"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmIdempotencyKey_organizationId_memberId_key_key" ON "CrmIdempotencyKey"("organizationId", "memberId", "key");

-- CreateIndex
CREATE INDEX "CrmCompany_organizationId_status_nameNorm_idx" ON "CrmCompany"("organizationId", "status", "nameNorm");

-- CreateIndex
CREATE UNIQUE INDEX "CrmPerson_phoneKey_key" ON "CrmPerson"("phoneKey");

-- CreateIndex
CREATE UNIQUE INDEX "CrmPerson_emailKey_key" ON "CrmPerson"("emailKey");

-- CreateIndex
CREATE INDEX "CrmPerson_organizationId_status_updatedAt_idx" ON "CrmPerson"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CrmPerson_organizationId_phoneHash_idx" ON "CrmPerson"("organizationId", "phoneHash");

-- CreateIndex
CREATE INDEX "CrmPerson_organizationId_emailNorm_idx" ON "CrmPerson"("organizationId", "emailNorm");

-- CreateIndex
CREATE INDEX "CrmPerson_organizationId_ownerMemberId_idx" ON "CrmPerson"("organizationId", "ownerMemberId");

-- CreateIndex
CREATE INDEX "CrmPerson_organizationId_nameNorm_idx" ON "CrmPerson"("organizationId", "nameNorm");

-- CreateIndex
CREATE INDEX "CrmPerson_organizationId_importBatchId_idx" ON "CrmPerson"("organizationId", "importBatchId");

-- CreateIndex
CREATE INDEX "CrmPipeline_organizationId_status_position_idx" ON "CrmPipeline"("organizationId", "status", "position");

-- CreateIndex
CREATE INDEX "CrmStage_pipelineId_status_position_idx" ON "CrmStage"("pipelineId", "status", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDeal_originKey_key" ON "CrmDeal"("originKey");

-- CreateIndex
CREATE INDEX "CrmDeal_organizationId_status_stageId_idx" ON "CrmDeal"("organizationId", "status", "stageId");

-- CreateIndex
CREATE INDEX "CrmDeal_organizationId_pipelineId_status_idx" ON "CrmDeal"("organizationId", "pipelineId", "status");

-- CreateIndex
CREATE INDEX "CrmDeal_organizationId_ownerMemberId_status_idx" ON "CrmDeal"("organizationId", "ownerMemberId", "status");

-- CreateIndex
CREATE INDEX "CrmDeal_organizationId_personId_idx" ON "CrmDeal"("organizationId", "personId");

-- CreateIndex
CREATE INDEX "CrmDeal_organizationId_updatedAt_idx" ON "CrmDeal"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "CrmDealEvent_dealId_createdAt_idx" ON "CrmDealEvent"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmDealEvent_organizationId_type_createdAt_idx" ON "CrmDealEvent"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmActivity_dedupeKey_key" ON "CrmActivity"("dedupeKey");

-- CreateIndex
CREATE INDEX "CrmActivity_organizationId_status_dueAt_idx" ON "CrmActivity"("organizationId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CrmActivity_organizationId_ownerMemberId_status_idx" ON "CrmActivity"("organizationId", "ownerMemberId", "status");

-- CreateIndex
CREATE INDEX "CrmActivity_dealId_idx" ON "CrmActivity"("dealId");

-- CreateIndex
CREATE INDEX "CrmActivity_personId_idx" ON "CrmActivity"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSuggestion_dedupeKey_key" ON "CrmSuggestion"("dedupeKey");

-- CreateIndex
CREATE INDEX "CrmSuggestion_organizationId_status_createdAt_idx" ON "CrmSuggestion"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CrmSuggestion_organizationId_dealId_idx" ON "CrmSuggestion"("organizationId", "dealId");

