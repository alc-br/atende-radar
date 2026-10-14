import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, conversationScope } from '@/lib/api-auth'
import { Prisma } from '@prisma/client'
import { pageParams } from '@/lib/pagination'
import { financialSettings } from '@/lib/analysis/revenue-params'
import { contactIdsMatching, hasLikeWildcard } from '@/lib/search'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const period = searchParams.get('period')
    const agentId = searchParams.get('agentId')
    const intent = searchParams.get('intent')
    const urgency = searchParams.get('urgency')
    const sentiment = searchParams.get('sentiment')
    const stage = searchParams.get('stage')
    const status = searchParams.get('status')
    const hasAlerts = searchParams.get('hasAlerts')
    const minValue = searchParams.get('minValue')
    const maxValue = searchParams.get('maxValue')
    const minScore = searchParams.get('minScore')
    const { page, limit } = pageParams(searchParams, 15)

    const g = await guard('conversations.view')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    // Build where clause
    const where: Prisma.ConversationWhereInput = { AND: [conversationScope(g.auth)] }

    if (search && hasLikeWildcard(search)) {
      // "%" e "_" seriam curingas no LIKE (trariam tudo): busca literal, só entre os contatos desta empresa
      where.contactId = { in: await contactIdsMatching(org.id, search) }
    } else if (search) {
      where.OR = [
        { contact: { displayName: { contains: search } } },
        { contact: { phoneLast4: { contains: search } } },
      ]
    }

    if (period) {
      const now = new Date()
      let since: Date
      switch (period) {
        case 'today':
          since = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          where.createdAt = { gte: since } // antes o filtro "Hoje" calculava a data e não aplicava
          break
        case 'yesterday':
          since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
          where.createdAt = { gte: since, lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()) }
          break
        case '7d':
          since = new Date(now.getTime() - 7 * 86400000)
          where.createdAt = { gte: since }
          break
        case '30d':
          since = new Date(now.getTime() - 30 * 86400000)
          where.createdAt = { gte: since }
          break
      }
    }

    if (agentId) where.agentId = agentId
    if (intent) where.primaryIntent = intent
    if (urgency) where.urgency = urgency
    if (sentiment) where.sentiment = sentiment
    if (stage) where.inferredStage = stage
    if (status) where.operationalStatus = status
    if (hasAlerts === 'true') {
      where.alerts = { some: {} }
    }
    if (minValue) {
      where.potentialValue = { ...(where.potentialValue as Prisma.FloatFilter | undefined), gte: parseFloat(minValue) }
    }
    if (maxValue) {
      where.potentialValue = { ...(where.potentialValue as Prisma.FloatFilter | undefined), lte: parseFloat(maxValue) }
    }
    if (minScore) {
      where.score = { gte: parseFloat(minScore) }
    }

    const [conversations, total] = await Promise.all([
      db.conversation.findMany({
        where,
        include: {
          contact: { select: { displayName: true, phoneLast4: true } },
          agent: { select: { id: true, name: true, team: true } },
          connection: { select: { id: true, name: true } },
          alerts: { select: { id: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.conversation.count({ where }),
    ])
    // T15 · total de mensagens só das conversas desta página: o `_count` do Prisma agregava a tabela Message inteira
    const counts = conversations.length
      ? await db.message.groupBy({ by: ['conversationId'], where: { conversationId: { in: conversations.map((c) => c.id) } }, _count: { _all: true } })
      : []
    const messagesCount = new Map(counts.map((m) => [m.conversationId, m._count._all]))

    // P5: nome do atendente SUGERIDO (identidade ainda sem confirmação) — aparece como "sugerido", não conta nos indicadores
    const suggestedIds = [...new Set(conversations.filter((c) => !c.agent && c.suggestedAgentId).map((c) => c.suggestedAgentId!))]
    const suggestedNames = new Map(
      suggestedIds.length
        ? (await db.agent.findMany({ where: { id: { in: suggestedIds }, organizationId: org.id }, select: { id: true, name: true } })).map((a) => [a.id, a.name])
        : []
    )

    // P2 · "Exibir estimativas de valor nas conversas" desligado: a lista não mostra valor estimado
    const orgRow = await db.organization.findUnique({ where: { id: org.id }, select: { settingsJson: true } })
    const estimatesHidden = !financialSettings((() => { try { return JSON.parse(orgRow?.settingsJson || '{}') as Record<string, unknown> } catch { return {} } })()).showEstimates

    const formatted = conversations.map((c) => {
      const waitingMs = c.waitingSince
        ? Date.now() - new Date(c.waitingSince).getTime()
        : 0
      return {
        id: c.id,
        customerName: c.contact?.displayName || 'Desconhecido',
        customerPhone: c.contact?.phoneLast4
          ? `*****${c.contact.phoneLast4}`
          : '******',
        connectionName: c.connection?.name || '',
        agentId: c.agent?.id,
        agentName: c.agent?.name || 'Sem agente',
        agentTeam: c.agent?.team || '',
        agentAttribution: c.agentAttribution,
        suggestedAgentId: c.agent ? null : c.suggestedAgentId,
        suggestedAgentName: c.agent || !c.suggestedAgentId ? null : suggestedNames.get(c.suggestedAgentId) ?? null,
        operationalStatus: c.operationalStatus,
        inferredStage: c.inferredStage,
        primaryIntent: c.primaryIntent,
        urgency: c.urgency,
        sentiment: c.sentiment,
        score: Math.round(c.score),
        potentialValue: estimatesHidden ? 0 : Math.round(c.potentialValue),
        confidence: +c.confidence.toFixed(2),
        messagesCount: messagesCount.get(c.id) ?? 0,
        lastActivity: (c.lastInboundAt || c.lastOutboundAt || c.updatedAt).toISOString(),
        waitingMinutes: c.operationalStatus === 'waiting_company' ? Math.floor(waitingMs / 60000) : 0,
        alertCount: c.alerts.length,
        tags: (() => { try { return JSON.parse(c.tags || '[]') as string[] } catch { return [] } })(),
        hasOpportunity: !estimatesHidden && c.potentialValue > 0,
      }
    })

    return NextResponse.json({
      conversations: formatted,
      estimatesHidden,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Conversations GET error:', error)
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 })
  }
}
