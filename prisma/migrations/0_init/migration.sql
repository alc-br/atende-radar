-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "cnpj" TEXT,
    "segment" TEXT NOT NULL DEFAULT 'geral',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" TEXT NOT NULL DEFAULT 'active',
    "logoUrl" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "adminEmail" TEXT,
    "settingsJson" TEXT,
    "deletionRequestedAt" DATETIME,
    "deletionScheduledFor" DATETIME,
    "deletionRequestedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WhatsAppConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'baileys',
    "phoneNumber" TEXT NOT NULL,
    "phoneLast4" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "statusReason" TEXT,
    "lastSeenAt" DATETIME,
    "lastEventAt" DATETIME,
    "lastSyncAt" DATETIME,
    "pairedAt" DATETIME,
    "disabledAt" DATETIME,
    "qrCode" TEXT,
    "qrUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WhatsAppConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'atendente',
    "team" TEXT,
    "externalRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Agent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "displayName" TEXT,
    "phoneHash" TEXT,
    "phoneEncrypted" TEXT,
    "phoneLast4" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "contactId" TEXT,
    "agentId" TEXT,
    "agentAttribution" TEXT,
    "suggestedAgentId" TEXT,
    "operationalStatus" TEXT NOT NULL DEFAULT 'new',
    "inferredStage" TEXT NOT NULL DEFAULT 'discovery',
    "primaryIntent" TEXT,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "sentiment" TEXT NOT NULL DEFAULT 'neutral',
    "score" REAL NOT NULL DEFAULT 0,
    "riskScore" REAL NOT NULL DEFAULT 0,
    "potentialValue" REAL NOT NULL DEFAULT 0,
    "confidence" REAL NOT NULL DEFAULT 0,
    "lastInboundAt" DATETIME,
    "lastOutboundAt" DATETIME,
    "waitingSince" DATETIME,
    "needsAnalysisAt" DATETIME,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "Conversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Conversation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Conversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "senderType" TEXT NOT NULL DEFAULT 'customer',
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'delivered',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectionId" TEXT,
    "externalId" TEXT,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversationClassification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "classificationType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0,
    "evidenceMessageId" TEXT,
    "rationale" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "reviewedStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationClassification_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'new',
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" DATETIME,
    "resolvedAt" DATETIME,
    "evidence" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0,
    "assignedTo" TEXT,
    "resolutionReason" TEXT,
    "falsePositive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditFinding_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RevenueOpportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "intentFactor" REAL NOT NULL DEFAULT 0.5,
    "urgencyFactor" REAL NOT NULL DEFAULT 0.5,
    "lossFactor" REAL NOT NULL DEFAULT 0.5,
    "baseTicket" REAL NOT NULL DEFAULT 0,
    "ticketSource" TEXT NOT NULL DEFAULT 'global_average',
    "probability" REAL NOT NULL DEFAULT 0.18,
    "probabilitySource" TEXT NOT NULL DEFAULT 'default_conservative',
    "expectedValue" REAL NOT NULL DEFAULT 0,
    "rangeLow" REAL NOT NULL DEFAULT 0,
    "rangeHigh" REAL NOT NULL DEFAULT 0,
    "confidence" REAL NOT NULL DEFAULT 0,
    "confirmedSaleValue" REAL,
    "confirmedRecovered" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RevenueOpportunity_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT,
    "findingId" TEXT,
    "ruleName" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "customerName" TEXT,
    "agentName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "potentialValue" REAL,
    "confidence" REAL,
    "assignedTo" TEXT,
    "dismissedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Alert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Alert_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecoveryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "conversationId" TEXT,
    "agentId" TEXT,
    "reason" TEXT,
    "priorityScore" REAL NOT NULL DEFAULT 0,
    "assignedTo" TEXT,
    "dueAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'new',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT,
    "recoveredValue" REAL,
    "completedAt" DATETIME,
    "customerName" TEXT,
    "originalAgentName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecoveryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecoveryItem_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "RevenueOpportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RecoveryItem_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "recipientEmails" TEXT NOT NULL DEFAULT '[]',
    "filePath" TEXT,
    "contentJson" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "error" TEXT,
    "emailStatus" TEXT,
    "emailedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConnectionSessionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "reasonCode" TEXT,
    "sanitizedDetails" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConnectionSessionEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RawChannelEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStatus" TEXT NOT NULL DEFAULT 'pending',
    "errorCode" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RawChannelEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT,
    "displayName" TEXT NOT NULL,
    "externalRef" TEXT,
    "connectionId" TEXT NOT NULL,
    "team" TEXT,
    "associationStatus" TEXT NOT NULL DEFAULT 'unconfirmed',
    "confidence" REAL NOT NULL DEFAULT 0,
    "validFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" DATETIME,
    "confirmedBy" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'signature',
    "suggestedAgentId" TEXT,
    "suggestionReason" TEXT,
    "confirmedAt" DATETIME,
    "conversationCount" INTEGER NOT NULL DEFAULT 0,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" DATETIME,
    "lastSeenAt" DATETIME,
    CONSTRAINT "AgentIdentity_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentIdentity_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversationIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    CONSTRAINT "ConversationIdentity_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConversationIdentity_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "AgentIdentity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpenQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "sourceMessage" TEXT NOT NULL,
    "normalizedQuestion" TEXT,
    "askedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" DATETIME,
    "answeredByMessage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "confidence" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "OpenQuestion_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Promise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "sourceMessage" TEXT NOT NULL,
    "promisorAgent" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "dueAt" DATETIME,
    "duePrecision" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "completionMessage" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "Promise_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversationScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "total" REAL NOT NULL DEFAULT 0,
    "componentScores" TEXT NOT NULL DEFAULT '{}',
    "eligibility" BOOLEAN NOT NULL DEFAULT true,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationScore_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "scopeConnections" TEXT NOT NULL DEFAULT '[]',
    "scopeTeams" TEXT NOT NULL DEFAULT '[]',
    "daysAndHours" TEXT NOT NULL DEFAULT '{}',
    "limitMinutes" INTEGER,
    "notificationChannels" TEXT NOT NULL DEFAULT '["in_app"]',
    "recipients" TEXT NOT NULL DEFAULT '[]',
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 30,
    "autoCloseMinutes" INTEGER,
    "exceptions" TEXT NOT NULL DEFAULT '[]',
    "minConfidence" REAL NOT NULL DEFAULT 0.5,
    CONSTRAINT "AlertRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "connectionId" TEXT,
    "teamId" TEXT,
    "conversationsStarted" INTEGER NOT NULL DEFAULT 0,
    "customersWaiting" INTEGER NOT NULL DEFAULT 0,
    "medianFirstResponse" REAL NOT NULL DEFAULT 0,
    "opportunitiesDetected" INTEGER NOT NULL DEFAULT 0,
    "opportunitiesAtRisk" INTEGER NOT NULL DEFAULT 0,
    "overduePromises" INTEGER NOT NULL DEFAULT 0,
    "potentialValueAtRisk" REAL NOT NULL DEFAULT 0,
    "overallScore" REAL NOT NULL DEFAULT 0,
    "messagesReceived" INTEGER NOT NULL DEFAULT 0,
    "messagesSent" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DailyMetric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "conversations" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTime" REAL NOT NULL DEFAULT 0,
    "score" REAL NOT NULL DEFAULT 0,
    "opportunitiesHandled" INTEGER NOT NULL DEFAULT 0,
    "opportunitiesLost" INTEGER NOT NULL DEFAULT 0,
    "promisesKept" INTEGER NOT NULL DEFAULT 0,
    "promisesTotal" INTEGER NOT NULL DEFAULT 0,
    "questionsAnswered" INTEGER NOT NULL DEFAULT 0,
    "questionsTotal" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AgentMetric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AgentMetric_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schedule" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "daysOfWeek" TEXT NOT NULL DEFAULT '[]',
    "recipients" TEXT NOT NULL DEFAULT '[]',
    "channels" TEXT NOT NULL DEFAULT '["email"]',
    "sendEmpty" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" DATETIME,
    CONSTRAINT "ReportDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClassificationFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "previousValue" TEXT,
    "correctedValue" TEXT,
    "justification" TEXT,
    "userId" TEXT,
    "appliedToMetrics" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassificationFeedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "data" TEXT NOT NULL DEFAULT '{}',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "team" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastAccessAt" DATETIME,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "seenToursJson" TEXT,
    "systemTourJson" TEXT,
    "invitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedBy" TEXT,
    "passwordHash" TEXT,
    "emailVerifiedAt" DATETIME,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "termsVersion" TEXT,
    "privacyVersion" TEXT,
    "termsAcceptedAt" DATETIME,
    "alertEmails" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "attachments" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME,
    "headers" TEXT,
    "kind" TEXT,
    "organizationId" TEXT
);

-- CreateTable
CREATE TABLE "AlertEmailItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "outboxId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "unitId" TEXT,
    "supervisorId" TEXT,
    "connectionIds" TEXT NOT NULL DEFAULT '[]',
    "slaConfig" TEXT NOT NULL DEFAULT '{}',
    "goals" TEXT NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPrice" REAL NOT NULL DEFAULT 0,
    "annualPrice" REAL NOT NULL DEFAULT 0,
    "stripePriceIds" TEXT NOT NULL DEFAULT '{}',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "maxConnections" INTEGER NOT NULL DEFAULT 1,
    "maxAgents" INTEGER NOT NULL DEFAULT 1,
    "maxConversationsMonthly" INTEGER NOT NULL DEFAULT 100,
    "maxMessagesMonthly" INTEGER NOT NULL DEFAULT 500,
    "maxAudioMinutes" INTEGER NOT NULL DEFAULT 0,
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "maxExports" INTEGER NOT NULL DEFAULT 5,
    "maxAlertRules" INTEGER NOT NULL DEFAULT 5,
    "features" TEXT NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "highlight" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentPeriodStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEnd" DATETIME,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billingProvider" TEXT,
    "billingMode" TEXT,
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "pendingProviderSubscriptionId" TEXT,
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "paymentMethod" TEXT,
    "cardBrand" TEXT,
    "cardLast4" TEXT,
    "lastPaymentError" TEXT,
    "lastSyncedAt" DATETIME,
    CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'pagarme',
    "providerInvoiceId" TEXT NOT NULL,
    "providerSubscriptionId" TEXT NOT NULL,
    "providerChargeId" TEXT,
    "planId" TEXT,
    "planName" TEXT,
    "billingCycle" TEXT,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "dueAt" DATETIME,
    "paidAt" DATETIME,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "failureMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BillingInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL DEFAULT 'pagarme',
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "providerSubscriptionId" TEXT,
    "organizationId" TEXT,
    "outcome" TEXT,
    "error" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "secret" TEXT NOT NULL,
    "events" TEXT NOT NULL DEFAULT '["alert.created","alert.resolved"]',
    "lastStatus" TEXT,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "lastEvent" TEXT,
    "lastAttemptAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "actorMemberId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "memberId" TEXT,
    "name" TEXT NOT NULL,
    "props" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProductMilestone" (
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reachedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("organizationId", "name")
);

-- CreateTable
CREATE TABLE "PageViewDaily" (
    "day" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("day", "page")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costBrl" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "appVersion" TEXT,
    "screen" TEXT,
    "userAgent" TEXT,
    "screenshot" BLOB,
    "screenshotType" TEXT,
    "screenshotSize" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" DATETIME,
    "resolvedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupportTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Contact_organizationId_phoneHash_idx" ON "Contact"("organizationId", "phoneHash");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_updatedAt_idx" ON "Conversation"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_riskScore_idx" ON "Conversation"("organizationId", "riskScore");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_openedAt_idx" ON "Conversation"("organizationId", "openedAt");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_operationalStatus_idx" ON "Conversation"("organizationId", "operationalStatus");

-- CreateIndex
CREATE INDEX "Conversation_contactId_idx" ON "Conversation"("contactId");

-- CreateIndex
CREATE INDEX "Conversation_agentId_idx" ON "Conversation"("agentId");

-- CreateIndex
CREATE INDEX "Conversation_connectionId_contactId_idx" ON "Conversation"("connectionId", "contactId");

-- CreateIndex
CREATE INDEX "Message_conversationId_occurredAt_idx" ON "Message"("conversationId", "occurredAt");

-- CreateIndex
CREATE INDEX "Message_occurredAt_idx" ON "Message"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_connectionId_externalId_key" ON "Message"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "ConversationClassification_conversationId_idx" ON "ConversationClassification"("conversationId");

-- CreateIndex
CREATE INDEX "AuditFinding_conversationId_idx" ON "AuditFinding"("conversationId");

-- CreateIndex
CREATE INDEX "RevenueOpportunity_conversationId_idx" ON "RevenueOpportunity"("conversationId");

-- CreateIndex
CREATE INDEX "Alert_organizationId_createdAt_idx" ON "Alert"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_organizationId_status_idx" ON "Alert"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Alert_conversationId_idx" ON "Alert"("conversationId");

-- CreateIndex
CREATE INDEX "RecoveryItem_organizationId_priorityScore_idx" ON "RecoveryItem"("organizationId", "priorityScore");

-- CreateIndex
CREATE INDEX "RecoveryItem_conversationId_idx" ON "RecoveryItem"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "RawChannelEvent_eventId_key" ON "RawChannelEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "RawChannelEvent_idempotencyKey_key" ON "RawChannelEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentIdentity_connectionId_externalRef_idx" ON "AgentIdentity"("connectionId", "externalRef");

-- CreateIndex
CREATE INDEX "ConversationIdentity_identityId_idx" ON "ConversationIdentity"("identityId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationIdentity_conversationId_identityId_key" ON "ConversationIdentity"("conversationId", "identityId");

-- CreateIndex
CREATE INDEX "OpenQuestion_conversationId_idx" ON "OpenQuestion"("conversationId");

-- CreateIndex
CREATE INDEX "Promise_conversationId_idx" ON "Promise"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationScore_conversationId_idx" ON "ConversationScore"("conversationId");

-- CreateIndex
CREATE INDEX "DailyMetric_organizationId_date_idx" ON "DailyMetric"("organizationId", "date");

-- CreateIndex
CREATE INDEX "AgentMetric_agentId_date_idx" ON "AgentMetric"("agentId", "date");

-- CreateIndex
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "AlertEmailItem_status_organizationId_idx" ON "AlertEmailItem"("status", "organizationId");

-- CreateIndex
CREATE INDEX "AlertEmailItem_memberId_ruleId_status_sentAt_idx" ON "AlertEmailItem"("memberId", "ruleId", "status", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

-- CreateIndex
CREATE INDEX "Subscription_providerSubscriptionId_idx" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_providerInvoiceId_key" ON "BillingInvoice"("providerInvoiceId");

-- CreateIndex
CREATE INDEX "BillingInvoice_organizationId_createdAt_idx" ON "BillingInvoice"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingInvoice_providerSubscriptionId_idx" ON "BillingInvoice"("providerSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEndpoint_organizationId_key" ON "WebhookEndpoint"("organizationId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_organizationId_createdAt_idx" ON "WebhookDelivery"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_action_idx" ON "AuditLog"("organizationId", "action");

-- CreateIndex
CREATE INDEX "ProductEvent_name_createdAt_idx" ON "ProductEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "ProductEvent_organizationId_createdAt_idx" ON "ProductEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductEvent_createdAt_idx" ON "ProductEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ProductMilestone_name_reachedAt_idx" ON "ProductMilestone"("name", "reachedAt");

-- CreateIndex
CREATE INDEX "AiUsage_organizationId_createdAt_idx" ON "AiUsage"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_organizationId_createdAt_idx" ON "SupportTicket"("organizationId", "createdAt");

