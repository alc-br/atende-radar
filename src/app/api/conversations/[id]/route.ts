import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { maskSensitive } from '@/lib/mask-sensitive'
import { guard, conversationScope, badRequest } from '@/lib/api-auth'
import { opportunityBreakdown, revenueSettings } from '@/lib/analysis/opportunity'
import { readJson } from '@/lib/json-body'

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard('conversations.manage')
    if (!g.ok) return g.res
    const { id } = await params
    const j = await readJson(request)
    if (!j.ok) return j.res
    const body = j.body
    const { agentId, addTag, markReviewed } = body as { agentId?: string; addTag?: string; markReviewed?: boolean }

    const existing = await db.conversation.findFirst({ where: { id, organizationId: g.auth.orgId }, select: { tags: true } })
    if (!existing) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    if (agentId && !(await db.agent.findFirst({ where: { id: agentId, organizationId: g.auth.orgId }, select: { id: true } }))) {
      return badRequest('agentId inválido')
    }

    const data: Record<string, unknown> = { updatedAt: new Date() }
    if (agentId !== undefined) {
      // P5: escolha manual vale mais que identidade/sugestão; tirar o atendente devolve a conversa às identidades
      data.agentId = agentId || null
      data.agentAttribution = agentId ? 'manual' : null
      data.suggestedAgentId = null
    }
    if (markReviewed) data.reviewedAt = new Date()
    if (addTag) {
      const currentTags = safeJsonParse<string[]>(existing.tags, [])
      if (!currentTags.includes(addTag)) {
        data.tags = JSON.stringify([...currentTags, addTag])
      }
    }

    data.needsAnalysisAt = new Date()
    const updated = await db.conversation.update({ where: { id }, data })

    return NextResponse.json({ success: true, conversation: updated })
  } catch (error) {
    console.error('Conversation PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 })
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard('conversations.view')
    if (!g.ok) return g.res
    const { id } = await params

    const conversation = await db.conversation.findFirst({
      where: { id, ...conversationScope(g.auth) },
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
          orderBy: { dueAt: 'desc' },
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
    // LGPD: quem abriu o conteúdo de qual conversa (sem texto, sem telefone, sem nome do cliente)
    void audit(g.auth, { action: 'conversation.viewed', targetType: 'conversation', targetId: conversation.id })

    const latestScore = conversation.scores[0]
    const componentScores = latestScore
      ? safeJsonParse<Record<string, number>>(latestScore.componentScores, {})
      : {}

    // P6 · "Como calculamos" o valor em risco: o MESMO cálculo do motor, com as Configurações atuais da empresa.
    // Só sai quando bate com o valor exibido (se as Configurações mudaram depois de a conversa encerrar, não inventa).
    const potentialValue = Math.round(conversation.potentialValue)
    const org = await db.organization.findUnique({ where: { id: conversation.organizationId }, select: { settingsJson: true } })
    const { avgTicket, conversionRate } = revenueSettings(safeJsonParse<Record<string, unknown>>(org?.settingsJson, {}))
    const breakdown = potentialValue > 0 ? opportunityBreakdown(conversation.primaryIntent, avgTicket, conversionRate) : null
    const valueExplanation = breakdown && breakdown.expectedValue === potentialValue
      ? {
          intent: breakdown.intent,
          classificationConfidence: +conversation.confidence.toFixed(2),
          avgTicket: breakdown.baseTicket,
          conversionRate: breakdown.conversionRate,
          intentFactor: breakdown.intentFactor,
          rawProbability: breakdown.rawProbability,
          probability: breakdown.probability,
          capped: breakdown.capped,
          expectedValue: breakdown.expectedValue,
          rangeSpread: breakdown.rangeSpread,
          rangeLow: breakdown.rangeLow,
          rangeHigh: breakdown.rangeHigh,
        }
      : null

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
      potentialValue,
      valueExplanation,
      confidence: +conversation.confidence.toFixed(2),
      tags: safeJsonParse<string[]>(conversation.tags, []),
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
      // P5: identity = vínculo confirmado · manual = escolhido na tela · null = sem atendente (pode haver sugestão)
      agentAttribution: conversation.agentAttribution,
      suggestedAgent: !conversation.agent && conversation.suggestedAgentId
        ? await db.agent.findFirst({ where: { id: conversation.suggestedAgentId, organizationId: conversation.organizationId }, select: { id: true, name: true } })
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
        text: maskSensitive(m.text), // rede de segurança para mensagens gravadas antes da máscara na entrada
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
        evidence: maskSensitive(f.evidence),
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
        ticketSource: o.ticketSource,
        probability: o.probability,
        probabilitySource: o.probabilitySource,
        expectedValue: o.expectedValue,
        rangeLow: o.rangeLow,
        rangeHigh: o.rangeHigh,
        confidence: +o.confidence.toFixed(2),
        confirmedSaleValue: o.confirmedSaleValue,
        confirmedRecovered: o.confirmedRecovered,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      })),

      // Open Questions
      openQuestions: conversation.openQuestions.map((q) => ({
        id: q.id,
        sourceMessage: q.sourceMessage,
        normalizedQuestion: maskSensitive(q.normalizedQuestion),
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
        action: maskSensitive(p.action),
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
