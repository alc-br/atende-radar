import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const conversation = await db.conversation.findUnique({
      where: { id },
      include: {
        contact: { select: { id: true, displayName: true, phoneLast4: true, isGroup: true } },
        agent: { select: { id: true, name: true, email: true, team: true, role: true } },
        connection: { select: { id: true, name: true, phoneLast4: true, status: true, provider: true } },
        messages: {
          orderBy: { occurredAt: 'asc' },
        },
        classifications: {
          orderBy: { createdAt: 'desc' },
        },
        findings: {
          orderBy: { detectedAt: 'desc' },
        },
        opportunities: {
          orderBy: { createdAt: 'desc' },
        },
        openQuestions: {
          orderBy: { askedAt: 'desc' },
        },
        promises: {
          orderBy: { createdAt: 'desc' },
        },
        scores: {
          orderBy: { calculatedAt: 'desc' },
          take: 1,
        },
        alerts: {
          select: { id: true, severity: true, title: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const latestScore = conversation.scores[0]
    const componentScores = latestScore
      ? (JSON.parse(latestScore.componentScores || '{}') as Record<string, number>)
      : {}

    const waitingMs = conversation.waitingSince
      ? Date.now() - new Date(conversation.waitingSince).getTime()
      : 0

    return NextResponse.json({
      id: conversation.id,
      organizationId: conversation.organizationId,
      operationalStatus: conversation.operationalStatus,
      inferredStage: conversation.inferredStage,
      primaryIntent: conversation.primaryIntent,
      urgency: conversation.urgency,
      sentiment: conversation.sentiment,
      score: Math.round(conversation.score),
      riskScore: Math.round(conversation.riskScore * 100) / 100,
      potentialValue: Math.round(conversation.potentialValue),
      confidence: +conversation.confidence.toFixed(2),
      tags: JSON.parse(conversation.tags || '[]') as string[],
      waitingMinutes: Math.floor(waitingMs / 60000),
      openedAt: conversation.openedAt.toISOString(),
      closedAt: conversation.closedAt?.toISOString(),
      lastActivity: (conversation.lastInboundAt || conversation.lastOutboundAt || conversation.updatedAt).toISOString(),

      // Contact
      contact: conversation.contact
        ? {
            id: conversation.contact.id,
            displayName: conversation.contact.displayName || 'Desconhecido',
            phoneLast4: conversation.contact.phoneLast4 || '',
            isGroup: conversation.contact.isGroup,
          }
        : null,

      // Agent
      agent: conversation.agent
        ? {
            id: conversation.agent.id,
            name: conversation.agent.name,
            email: conversation.agent.email,
            team: conversation.agent.team,
            role: conversation.agent.role,
          }
        : null,

      // Connection
      connection: conversation.connection
        ? {
            id: conversation.connection.id,
            name: conversation.connection.name,
            phoneLast4: conversation.connection.phoneLast4,
            status: conversation.connection.status,
            provider: conversation.connection.provider,
          }
        : null,

      // Messages
      messages: conversation.messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        direction: m.direction,
        senderType: m.senderType,
        messageType: m.messageType,
        text: m.text,
        occurredAt: m.occurredAt.toISOString(),
        isAutomatic: m.isAutomatic,
        deliveryStatus: m.deliveryStatus,
      })),

      // Classifications
      classifications: conversation.classifications.map((c) => ({
        id: c.id,
        classificationType: c.classificationType,
        label: c.label,
        confidence: +c.confidence.toFixed(2),
        evidenceMessageId: c.evidenceMessageId,
        rationale: c.rationale,
        source: c.source,
        reviewedStatus: c.reviewedStatus,
        createdAt: c.createdAt.toISOString(),
      })),

      // Findings
      findings: conversation.findings.map((f) => ({
        id: f.id,
        type: f.type,
        severity: f.severity,
        status: f.status,
        detectedAt: f.detectedAt.toISOString(),
        dueAt: f.dueAt?.toISOString(),
        resolvedAt: f.resolvedAt?.toISOString(),
        evidence: f.evidence,
        confidence: +f.confidence.toFixed(2),
        assignedTo: f.assignedTo,
        resolutionReason: f.resolutionReason,
        falsePositive: f.falsePositive,
      })),

      // Opportunities
      opportunities: conversation.opportunities.map((o) => ({
        id: o.id,
        status: o.status,
        intentFactor: o.intentFactor,
        urgencyFactor: o.urgencyFactor,
        lossFactor: o.lossFactor,
        baseTicket: o.baseTicket,
        probability: o.probability,
        expectedValue: o.expectedValue,
        rangeLow: o.rangeLow,
        rangeHigh: o.rangeHigh,
        confidence: +o.confidence.toFixed(2),
        confirmedSaleValue: o.confirmedSaleValue,
        confirmedRecovered: o.confirmedRecovered,
        createdAt: o.createdAt.toISOString(),
      })),

      // Open Questions
      openQuestions: conversation.openQuestions.map((q) => ({
        id: q.id,
        sourceMessage: q.sourceMessage,
        normalizedQuestion: q.normalizedQuestion,
        askedAt: q.askedAt.toISOString(),
        dueAt: q.dueAt?.toISOString(),
        answeredByMessage: q.answeredByMessage,
        status: q.status,
        confidence: +q.confidence.toFixed(2),
      })),

      // Promises
      promises: conversation.promises.map((p) => ({
        id: p.id,
        sourceMessage: p.sourceMessage,
        promisorAgent: p.promisorAgent,
        action: p.action,
        dueAt: p.dueAt?.toISOString(),
        duePrecision: p.duePrecision,
        status: p.status,
        completionMessage: p.completionMessage,
        confidence: +p.confidence.toFixed(2),
      })),

      // Alerts
      alerts: conversation.alerts,

      // Score
      scoreDetail: latestScore
        ? {
            total: Math.round(latestScore.total),
            components: componentScores,
            eligibility: latestScore.eligibility,
            calculatedAt: latestScore.calculatedAt.toISOString(),
          }
        : null,
    })
  } catch (error) {
    console.error('Conversation detail error:', error)
    return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 })
  }
}
