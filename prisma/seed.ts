import { PrismaClient } from '@prisma/client'
import {
  org,
  connections,
  agents,
  contacts,
  conversations,
  getMessagesForConversation,
  getClassificationsForConversation,
  getFindingsForConversation,
  getOpportunitiesForConversation,
  getAlertsForConversation,
  getRecoveryItems,
  getScoresForConversation,
  getOpenQuestions,
  getPromises,
  reportDefinitions,
  reportRuns,
  alertRules,
  getDailyMetrics,
  getAgentMetrics,
  orgMembers,
  teams,
  plans,
  subscription,
  connectionSessionEvents,
  rawChannelEvents,
  agentIdentities,
  classificationFeedbacks,
  notifications,
} from '../src/lib/seed-data'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  // 1. Organization
  console.log('  Creating Organization...')
  await prisma.organization.upsert({
    where: { id: org.id },
    update: { name: org.name, displayName: org.displayName, updatedAt: new Date() },
    create: {
      id: org.id,
      name: org.name,
      displayName: org.displayName,
      cnpj: org.cnpj,
      segment: org.segment,
      timezone: org.timezone,
      currency: org.currency,
      status: org.status,
      phone: org.phone,
      adminEmail: org.adminEmail,
      website: org.website,
    },
  })

  // 2. Plans (no org dependency)
  console.log('  Creating Plans...')
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: { name: plan.name, monthlyPrice: plan.monthlyPrice, annualPrice: plan.annualPrice },
      create: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        stripePriceIds: plan.stripePriceIds,
        currency: plan.currency,
        trialDays: plan.trialDays,
        maxConnections: plan.maxConnections,
        maxAgents: plan.maxAgents,
        maxConversationsMonthly: plan.maxConversationsMonthly,
        maxMessagesMonthly: plan.maxMessagesMonthly,
        maxAudioMinutes: plan.maxAudioMinutes,
        retentionDays: plan.retentionDays,
        maxExports: plan.maxExports,
        maxAlertRules: plan.maxAlertRules,
        features: plan.features,
        active: plan.active,
        sortOrder: plan.sortOrder,
        highlight: plan.highlight,
      },
    })
  }

  // 3. WhatsApp Connections
  console.log('  Creating WhatsApp Connections...')
  for (const conn of connections) {
    await prisma.whatsAppConnection.upsert({
      where: { id: conn.id },
      update: { status: conn.status, statusReason: conn.statusReason, lastSeenAt: conn.lastSeenAt, lastEventAt: conn.lastEventAt, lastSyncAt: conn.lastSyncAt, updatedAt: new Date() },
      create: {
        id: conn.id,
        organizationId: conn.organizationId,
        name: conn.name,
        provider: conn.provider,
        phoneNumber: conn.phoneNumber,
        phoneLast4: conn.phoneLast4,
        status: conn.status,
        statusReason: conn.statusReason,
        lastSeenAt: conn.lastSeenAt,
        lastEventAt: conn.lastEventAt,
        lastSyncAt: conn.lastSyncAt,
        pairedAt: conn.pairedAt,
        disabledAt: conn.disabledAt,
      },
    })
  }

  // 4. Agents
  console.log('  Creating Agents...')
  for (const agent of agents) {
    await prisma.agent.upsert({
      where: { id: agent.id },
      update: { name: agent.name, updatedAt: new Date() },
      create: {
        id: agent.id,
        organizationId: agent.organizationId,
        name: agent.name,
        email: agent.email,
        role: agent.role,
        team: agent.team,
        externalRef: agent.externalRef,
        status: agent.status,
      },
    })
  }

  // 5. Contacts
  console.log('  Creating Contacts...')
  for (const contact of contacts) {
    await prisma.contact.upsert({
      where: { id: contact.id },
      update: { lastSeenAt: contact.lastSeenAt, updatedAt: new Date() },
      create: {
        id: contact.id,
        organizationId: contact.organizationId,
        connectionId: contact.connectionId,
        displayName: contact.displayName,
        phoneHash: contact.phoneHash,
        phoneLast4: contact.phoneLast4,
        firstSeenAt: contact.firstSeenAt,
        lastSeenAt: contact.lastSeenAt,
      },
    })
  }

  // 6. Conversations
  console.log('  Creating Conversations...')
  for (const conv of conversations) {
    await prisma.conversation.upsert({
      where: { id: conv.id },
      update: {
        operationalStatus: conv.operationalStatus,
        inferredStage: conv.inferredStage,
        urgency: conv.urgency,
        sentiment: conv.sentiment,
        updatedAt: new Date(),
      },
      create: {
        id: conv.id,
        organizationId: conv.organizationId,
        connectionId: conv.connectionId,
        contactId: conv.contactId,
        agentId: conv.agentId,
        operationalStatus: conv.operationalStatus,
        inferredStage: conv.inferredStage,
        primaryIntent: conv.primaryIntent,
        urgency: conv.urgency,
        sentiment: conv.sentiment,
        score: conv.score,
        riskScore: conv.riskScore,
        potentialValue: conv.potentialValue,
        confidence: conv.confidence,
        lastInboundAt: conv.lastInboundAt,
        lastOutboundAt: conv.lastOutboundAt,
        waitingSince: conv.waitingSince,
        openedAt: conv.openedAt,
        tags: conv.tags,
      },
    })
  }

  // 7. Messages (4-8 per conversation)
  console.log('  Creating Messages...')
  let msgCount = 0
  for (let i = 0; i < 15; i++) {
    const msgs = getMessagesForConversation(i)
    for (const msg of msgs) {
      await prisma.message.upsert({
        where: { id: msg.id },
        update: { deliveryStatus: msg.deliveryStatus },
        create: {
          id: msg.id,
          conversationId: msg.conversationId,
          direction: msg.direction,
          senderType: msg.senderType,
          messageType: msg.messageType,
          text: msg.text,
          occurredAt: msg.occurredAt,
          isAutomatic: msg.isAutomatic,
          deliveryStatus: msg.deliveryStatus,
        },
      })
      msgCount++
    }
  }
  console.log(`    Created ${msgCount} messages`)

  // 8. ConversationClassifications
  console.log('  Creating ConversationClassifications...')
  let classCount = 0
  for (let i = 0; i < 15; i++) {
    const cls = getClassificationsForConversation(i)
    for (const c of cls) {
      await prisma.conversationClassification.upsert({
        where: { id: c.id },
        update: { reviewedStatus: c.reviewedStatus },
        create: {
          id: c.id,
          conversationId: c.conversationId,
          classificationType: c.classificationType,
          label: c.label,
          confidence: c.confidence,
          evidenceMessageId: c.evidenceMessageId,
          rationale: c.rationale,
          source: c.source,
          reviewedStatus: c.reviewedStatus,
        },
      })
      classCount++
    }
  }
  console.log(`    Created ${classCount} classifications`)

  // 9. AuditFindings
  console.log('  Creating AuditFindings...')
  let findingCount = 0
  for (let i = 0; i < 15; i++) {
    const findings = getFindingsForConversation(i)
    for (const f of findings) {
      await prisma.auditFinding.upsert({
        where: { id: f.id },
        update: { status: f.status, assignedTo: f.assignedTo },
        create: {
          id: f.id,
          conversationId: f.conversationId,
          type: f.type,
          severity: f.severity,
          status: f.status,
          detectedAt: f.detectedAt,
          dueAt: f.dueAt,
          evidence: f.evidence,
          confidence: f.confidence,
          assignedTo: f.assignedTo,
          falsePositive: f.falsePositive,
        },
      })
      findingCount++
    }
  }
  console.log(`    Created ${findingCount} findings`)

  // 10. RevenueOpportunities
  console.log('  Creating RevenueOpportunities...')
  let oppCount = 0
  for (let i = 0; i < 15; i++) {
    const opps = getOpportunitiesForConversation(i)
    for (const o of opps) {
      await prisma.revenueOpportunity.upsert({
        where: { id: o.id },
        update: { status: o.status, confirmedSaleValue: o.confirmedSaleValue },
        create: {
          id: o.id,
          conversationId: o.conversationId,
          status: o.status,
          intentFactor: o.intentFactor,
          urgencyFactor: o.urgencyFactor,
          lossFactor: o.lossFactor,
          baseTicket: o.baseTicket,
          ticketSource: o.ticketSource,
          probability: o.probability,
          probabilitySource: o.probabilitySource,
          expectedValue: o.expectedValue,
          rangeLow: o.rangeLow,
          rangeHigh: o.rangeHigh,
          confidence: o.confidence,
          confirmedSaleValue: o.confirmedSaleValue,
          confirmedRecovered: o.confirmedRecovered,
        },
      })
      oppCount++
    }
  }
  console.log(`    Created ${oppCount} opportunities`)

  // 11. Alerts (from findings)
  console.log('  Creating Alerts...')
  let alertCount = 0
  for (let i = 0; i < 15; i++) {
    const alerts = getAlertsForConversation(i)
    for (const a of alerts) {
      await prisma.alert.upsert({
        where: { id: a.id },
        update: { status: a.status },
        create: {
          id: a.id,
          organizationId: a.organizationId,
          conversationId: a.conversationId,
          findingId: a.findingId,
          ruleName: a.ruleName,
          severity: a.severity,
          title: a.title,
          description: a.description,
          customerName: a.customerName,
          agentName: a.agentName,
          status: a.status,
          potentialValue: a.potentialValue,
          confidence: a.confidence,
        },
      })
      alertCount++
    }
  }
  console.log(`    Created ${alertCount} alerts`)

  // 12. RecoveryItems
  console.log('  Creating RecoveryItems...')
  const recoveries = getRecoveryItems()
  for (const r of recoveries) {
    await prisma.recoveryItem.upsert({
      where: { id: r.id },
      update: { status: r.status, attempts: r.attempts },
      create: {
        id: r.id,
        organizationId: r.organizationId,
        opportunityId: r.opportunityId,
        conversationId: r.conversationId,
        agentId: r.agentId,
        reason: r.reason,
        priorityScore: r.priorityScore,
        assignedTo: r.assignedTo,
        dueAt: r.dueAt,
        status: r.status,
        attempts: r.attempts,
        outcome: r.outcome,
        recoveredValue: r.recoveredValue,
        customerName: r.customerName,
        originalAgentName: r.originalAgentName,
      },
    })
  }
  console.log(`    Created ${recoveries.length} recovery items`)

  // 13. ReportDefinitions
  console.log('  Creating ReportDefinitions...')
  for (const rd of reportDefinitions) {
    await prisma.reportDefinition.upsert({
      where: { id: rd.id },
      update: { lastRunAt: rd.lastRunAt },
      create: {
        id: rd.id,
        organizationId: rd.organizationId,
        reportType: rd.reportType,
        name: rd.name,
        description: rd.description,
        schedule: rd.schedule,
        timezone: rd.timezone,
        daysOfWeek: rd.daysOfWeek,
        recipients: rd.recipients,
        channels: rd.channels,
        sendEmpty: rd.sendEmpty,
        lastRunAt: rd.lastRunAt,
      },
    })
  }

  // 14. ReportRuns
  console.log('  Creating ReportRuns...')
  for (const rr of reportRuns) {
    await prisma.reportRun.upsert({
      where: { id: rr.id },
      update: { status: rr.status, filePath: rr.filePath },
      create: {
        id: rr.id,
        organizationId: rr.organizationId,
        reportType: rr.reportType,
        status: rr.status,
        periodStart: rr.periodStart,
        periodEnd: rr.periodEnd,
        recipientEmails: rr.recipientEmails,
        filePath: rr.filePath,
      },
    })
  }

  // 15. AlertRules
  console.log('  Creating AlertRules...')
  for (const ar of alertRules) {
    await prisma.alertRule.upsert({
      where: { id: ar.id },
      update: { active: ar.active },
      create: {
        id: ar.id,
        organizationId: ar.organizationId,
        name: ar.name,
        type: ar.type,
        active: ar.active,
        severity: ar.severity,
        scopeConnections: ar.scopeConnections,
        scopeTeams: ar.scopeTeams,
        daysAndHours: ar.daysAndHours,
        limitMinutes: ar.limitMinutes,
        notificationChannels: ar.notificationChannels,
        recipients: ar.recipients,
        cooldownMinutes: ar.cooldownMinutes,
        autoCloseMinutes: ar.autoCloseMinutes,
        exceptions: ar.exceptions,
        minConfidence: ar.minConfidence,
      },
    })
  }

  // 16. DailyMetrics (14 days)
  console.log('  Creating DailyMetrics...')
  const dailyMetrics = getDailyMetrics()
  for (const dm of dailyMetrics) {
    await prisma.dailyMetric.upsert({
      where: { id: dm.id },
      update: { overallScore: dm.overallScore },
      create: {
        id: dm.id,
        organizationId: dm.organizationId,
        date: dm.date,
        connectionId: dm.connectionId,
        teamId: dm.teamId,
        conversationsStarted: dm.conversationsStarted,
        customersWaiting: dm.customersWaiting,
        medianFirstResponse: dm.medianFirstResponse,
        opportunitiesDetected: dm.opportunitiesDetected,
        opportunitiesAtRisk: dm.opportunitiesAtRisk,
        overduePromises: dm.overduePromises,
        potentialValueAtRisk: dm.potentialValueAtRisk,
        overallScore: dm.overallScore,
        messagesReceived: dm.messagesReceived,
        messagesSent: dm.messagesSent,
      },
    })
  }
  console.log(`    Created ${dailyMetrics.length} daily metrics`)

  // 17. AgentMetrics (5 agents × 14 days)
  console.log('  Creating AgentMetrics...')
  const agentMetrics = getAgentMetrics()
  for (const am of agentMetrics) {
    await prisma.agentMetric.upsert({
      where: { id: am.id },
      update: { score: am.score, conversations: am.conversations },
      create: {
        id: am.id,
        organizationId: am.organizationId,
        agentId: am.agentId,
        date: am.date,
        conversations: am.conversations,
        avgResponseTime: am.avgResponseTime,
        score: am.score,
        opportunitiesHandled: am.opportunitiesHandled,
        opportunitiesLost: am.opportunitiesLost,
        promisesKept: am.promisesKept,
        promisesTotal: am.promisesTotal,
        questionsAnswered: am.questionsAnswered,
        questionsTotal: am.questionsTotal,
      },
    })
  }
  console.log(`    Created ${agentMetrics.length} agent metrics`)

  // 18. OrganizationMembers
  console.log('  Creating OrganizationMembers...')
  for (const m of orgMembers) {
    await prisma.organizationMember.upsert({
      where: { id: m.id },
      update: { lastAccessAt: m.lastAccessAt },
      create: {
        id: m.id,
        organizationId: m.organizationId,
        userId: m.userId,
        name: m.name,
        email: m.email,
        role: m.role,
        team: m.team,
        status: m.status,
        lastAccessAt: m.lastAccessAt,
        mfaEnabled: m.mfaEnabled,
        invitedAt: m.invitedAt,
        invitedBy: m.invitedBy,
      },
    })
  }

  // 19. Teams
  console.log('  Creating Teams...')
  for (const t of teams) {
    await prisma.team.upsert({
      where: { id: t.id },
      update: { active: t.active },
      create: {
        id: t.id,
        organizationId: t.organizationId,
        name: t.name,
        code: t.code,
        unitId: t.unitId,
        supervisorId: t.supervisorId,
        connectionIds: t.connectionIds,
        slaConfig: t.slaConfig,
        goals: t.goals,
        active: t.active,
      },
    })
  }

  // 20. Subscription
  console.log('  Creating Subscription...')
  await prisma.subscription.upsert({
    where: { id: subscription.id },
    update: { status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd },
    create: {
      id: subscription.id,
      organizationId: subscription.organizationId,
      planId: subscription.planId,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEnd: subscription.trialEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    },
  })

  // 21. ConversationScores
  console.log('  Creating ConversationScores...')
  for (let i = 0; i < 15; i++) {
    const scores = getScoresForConversation(i)
    for (const s of scores) {
      await prisma.conversationScore.upsert({
        where: { id: s.id },
        update: { total: s.total },
        create: {
          id: s.id,
          conversationId: s.conversationId,
          version: s.version,
          total: s.total,
          componentScores: s.componentScores,
          eligibility: s.eligibility,
        },
      })
    }
  }

  // 22. OpenQuestions
  console.log('  Creating OpenQuestions...')
  const openQuestions = getOpenQuestions()
  for (const oq of openQuestions) {
    await prisma.openQuestion.upsert({
      where: { id: oq.id },
      update: { status: oq.status, answeredByMessage: oq.answeredByMessage },
      create: {
        id: oq.id,
        conversationId: oq.conversationId,
        sourceMessage: oq.sourceMessage,
        normalizedQuestion: oq.normalizedQuestion,
        askedAt: oq.askedAt,
        dueAt: oq.dueAt,
        answeredByMessage: oq.answeredByMessage,
        status: oq.status,
        confidence: oq.confidence,
      },
    })
  }

  // 23. Promises
  console.log('  Creating Promises...')
  const promises = getPromises()
  for (const p of promises) {
    await prisma.promise.upsert({
      where: { id: p.id },
      update: { status: p.status, completionMessage: p.completionMessage },
      create: {
        id: p.id,
        conversationId: p.conversationId,
        sourceMessage: p.sourceMessage,
        promisorAgent: p.promisorAgent,
        action: p.action,
        dueAt: p.dueAt,
        duePrecision: p.duePrecision,
        status: p.status,
        completionMessage: p.completionMessage,
        confidence: p.confidence,
      },
    })
  }

  // 24. ConnectionSessionEvents
  console.log('  Creating ConnectionSessionEvents...')
  for (const cse of connectionSessionEvents) {
    await prisma.connectionSessionEvent.upsert({
      where: { id: cse.id },
      update: { newStatus: cse.newStatus },
      create: {
        id: cse.id,
        connectionId: cse.connectionId,
        eventType: cse.eventType,
        previousStatus: cse.previousStatus,
        newStatus: cse.newStatus,
        reasonCode: cse.reasonCode,
        sanitizedDetails: cse.sanitizedDetails,
        occurredAt: cse.occurredAt,
      },
    })
  }

  // 25. RawChannelEvents
  console.log('  Creating RawChannelEvents...')
  for (const rce of rawChannelEvents) {
    await prisma.rawChannelEvent.upsert({
      where: { id: rce.id },
      update: { processingStatus: rce.processingStatus },
      create: {
        id: rce.id,
        connectionId: rce.connectionId,
        eventId: rce.eventId,
        idempotencyKey: rce.idempotencyKey,
        schemaVersion: rce.schemaVersion,
        eventType: rce.eventType,
        payload: rce.payload,
        occurredAt: rce.occurredAt,
        receivedAt: rce.receivedAt,
        processingStatus: rce.processingStatus,
        errorCode: rce.errorCode,
        attempts: rce.attempts,
      },
    })
  }

  // 26. AgentIdentities
  console.log('  Creating AgentIdentities...')
  for (const ai of agentIdentities) {
    await prisma.agentIdentity.upsert({
      where: { id: ai.id },
      update: { associationStatus: ai.associationStatus },
      create: {
        id: ai.id,
        agentId: ai.agentId,
        displayName: ai.displayName,
        externalRef: ai.externalRef,
        connectionId: ai.connectionId,
        team: ai.team,
        associationStatus: ai.associationStatus,
        confidence: ai.confidence,
        validFrom: ai.validFrom,
        validTo: ai.validTo,
        confirmedBy: ai.confirmedBy,
      },
    })
  }

  // 27. ClassificationFeedbacks
  console.log('  Creating ClassificationFeedbacks...')
  for (const cfb of classificationFeedbacks) {
    await prisma.classificationFeedback.upsert({
      where: { id: cfb.id },
      update: { appliedToMetrics: cfb.appliedToMetrics },
      create: {
        id: cfb.id,
        organizationId: cfb.organizationId,
        targetId: cfb.targetId,
        targetType: cfb.targetType,
        previousValue: cfb.previousValue,
        correctedValue: cfb.correctedValue,
        justification: cfb.justification,
        userId: cfb.userId,
        appliedToMetrics: cfb.appliedToMetrics,
      },
    })
  }

  // 28. Notifications
  console.log('  Creating Notifications...')
  for (const n of notifications) {
    await prisma.notification.upsert({
      where: { id: n.id },
      update: { read: n.read },
      create: {
        id: n.id,
        organizationId: n.organizationId,
        userId: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data,
        read: n.read,
      },
    })
  }

  console.log('✅ Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
