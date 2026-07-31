import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

interface DashboardSummary {
  conversationsStarted: number
  conversationsStartedChange: number
  customersWaiting: number
  customersWaitingChange: number
  medianFirstResponse: number
  medianFirstResponseChange: number
  opportunitiesDetected: number
  opportunitiesDetectedChange: number
  opportunitiesAtRisk: number
  opportunitiesAtRiskChange: number
  overduePromises: number
  overduePromisesChange: number
  potentialValueAtRisk: number
  potentialValueAtRiskChange: number
  overallScore: number
  overallScoreChange: number
}

interface FunnelItem {
  stage: string
  count: number
  color: string
}

interface FailureItem {
  type: string
  count: number
  severity: string
}

interface EvolutionPoint {
  date: string
  score: number
  responseTime: number
  abandonment: number
  valueAtRisk: number
}

interface PriorityItem {
  id: string
  customerName: string
  customerPhone: string
  agentName: string
  agentTeam: string
  primaryIntent: string
  urgency: string
  waitingMinutes: number
  potentialValue: number
  score: number
  riskScore: number
}

interface TeamPerfItem {
  name: string
  team: string
  score: number
  avgResponseTime: number
  opportunities: number
  criticalFailures: number
  promisesKept: number
  promisesTotal: number
  trend: string
}

export async function GET() {
  try {
    // Get the first (and likely only) organization
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // --- Dashboard Summary from DailyMetric ---
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

    const [todayMetrics, yesterdayMetrics] = await Promise.all([
      db.dailyMetric.findFirst({ where: { organizationId: org.id, date: today } }),
      db.dailyMetric.findFirst({ where: { organizationId: org.id, date: yesterday } }),
    ])

    const t = todayMetrics
    const y = yesterdayMetrics

    const calcChange = (todayVal: number, yestVal: number): number => {
      if (yestVal === 0) return todayVal > 0 ? 100 : 0
      return +(((todayVal - yestVal) / Math.abs(yestVal)) * 100).toFixed(1)
    }

    const summary: DashboardSummary = {
      conversationsStarted: t?.conversationsStarted ?? 0,
      conversationsStartedChange: calcChange(t?.conversationsStarted ?? 0, y?.conversationsStarted ?? 0),
      customersWaiting: t?.customersWaiting ?? 0,
      customersWaitingChange: calcChange(t?.customersWaiting ?? 0, y?.customersWaiting ?? 0),
      medianFirstResponse: t?.medianFirstResponse ?? 0,
      medianFirstResponseChange: calcChange(t?.medianFirstResponse ?? 0, y?.medianFirstResponse ?? 0),
      opportunitiesDetected: t?.opportunitiesDetected ?? 0,
      opportunitiesDetectedChange: calcChange(t?.opportunitiesDetected ?? 0, y?.opportunitiesDetected ?? 0),
      opportunitiesAtRisk: t?.opportunitiesAtRisk ?? 0,
      opportunitiesAtRiskChange: calcChange(t?.opportunitiesAtRisk ?? 0, y?.opportunitiesAtRisk ?? 0),
      overduePromises: t?.overduePromises ?? 0,
      overduePromisesChange: calcChange(t?.overduePromises ?? 0, y?.overduePromises ?? 0),
      potentialValueAtRisk: t?.potentialValueAtRisk ?? 0,
      potentialValueAtRiskChange: calcChange(t?.potentialValueAtRisk ?? 0, y?.potentialValueAtRisk ?? 0),
      overallScore: Math.round(t?.overallScore ?? 0),
      overallScoreChange: calcChange(t?.overallScore ?? 0, y?.overallScore ?? 0),
    }

    // --- Audit Funnel ---
    const allConversations = await db.conversation.count({
      where: { organizationId: org.id },
    })
    const opportunityCount = await db.revenueOpportunity.count({
      where: { conversation: { organizationId: org.id } },
    })
    const priceStage = await db.conversation.count({
      where: { organizationId: org.id, inferredStage: 'price' },
    })
    const proposalStage = await db.conversation.count({
      where: { organizationId: org.id, inferredStage: 'proposal' },
    })
    const wonCount = await db.conversation.count({
      where: { organizationId: org.id, operationalStatus: 'won' },
    })
    const lostCount = await db.conversation.count({
      where: { organizationId: org.id, operationalStatus: 'lost' },
    })
    const noOutcome = allConversations - wonCount - lostCount

    const funnel: FunnelItem[] = [
      { stage: 'Conversas', count: allConversations, color: 'var(--chart-1)' },
      { stage: 'Oportunidades', count: opportunityCount, color: 'var(--chart-2)' },
      { stage: 'Pedidos de preço', count: priceStage, color: 'var(--chart-3)' },
      { stage: 'Propostas', count: proposalStage, color: 'var(--chart-4)' },
      { stage: 'Vendas confirmadas', count: wonCount, color: 'var(--chart-1)' },
      { stage: 'Perdas confirmadas', count: lostCount, color: 'var(--destructive)' },
      { stage: 'Sem desfecho', count: Math.max(0, noOutcome), color: 'var(--muted-foreground)' },
    ]

    // --- Failures by Type ---
    const findingsGrouped = await db.auditFinding.groupBy({
      by: ['type', 'severity'],
      where: { conversation: { organizationId: org.id } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    })

    const typeLabels: Record<string, string> = {
      no_response: 'Sem resposta',
      slow_response: 'Resposta lenta',
      ignored_question: 'Pergunta ignorada',
      pending_quote: 'Orçamento pendente',
      overdue_promise: 'Promessa vencida',
      abandoned_lead: 'Lead abandonado',
      customer_frustrated: 'Cliente frustrado',
    }

    const failures: FailureItem[] = findingsGrouped.map((f) => ({
      type: typeLabels[f.type] || f.type,
      count: f._count.id,
      severity: f.severity,
    }))

    // --- Evolution Data (last 14 days) ---
    const fourteenDaysAgo = new Date(Date.now() - 13 * 86400000).toISOString().split('T')[0]
    const dailyData = await db.dailyMetric.findMany({
      where: { organizationId: org.id, date: { gte: fourteenDaysAgo } },
      orderBy: { date: 'asc' },
    })

    // Fill missing dates
    const evolution: EvolutionPoint[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0]
      const dm = dailyData.find((m) => m.date === d)
      evolution.push({
        date: d,
        score: dm ? +dm.overallScore.toFixed(1) : 0,
        responseTime: dm ? +dm.medianFirstResponse.toFixed(1) : 0,
        abandonment: dm ? dm.customersWaiting : 0,
        valueAtRisk: dm ? Math.round(dm.potentialValueAtRisk) : 0,
      })
    }

    // --- Top 10 Priorities (by riskScore) ---
    const topConversations = await db.conversation.findMany({
      where: { organizationId: org.id },
      include: {
        contact: { select: { displayName: true, phoneLast4: true } },
        agent: { select: { name: true, team: true } },
      },
      orderBy: { riskScore: 'desc' },
      take: 10,
    })

    const priorities: PriorityItem[] = topConversations.map((c) => {
      const waitingMs = c.waitingSince
        ? Date.now() - new Date(c.waitingSince).getTime()
        : 0
      return {
        id: c.id,
        customerName: c.contact?.displayName || 'Desconhecido',
        customerPhone: c.contact?.phoneLast4
          ? `*****${c.contact.phoneLast4}`
          : '******',
        agentName: c.agent?.name || 'Sem agente',
        agentTeam: c.agent?.team || '',
        primaryIntent: c.primaryIntent || '',
        urgency: c.urgency,
        waitingMinutes: Math.floor(waitingMs / 60000),
        potentialValue: Math.round(c.potentialValue),
        score: Math.round(c.score),
        riskScore: Math.round(c.riskScore * 100) / 100,
      }
    })

    // --- Team Performance ---
    const agentsWithMetrics = await db.agent.findMany({
      where: { organizationId: org.id, status: 'active' },
      include: { metrics: { orderBy: { date: 'desc' }, take: 2 } },
    })

    const teamPerformance: TeamPerfItem[] = agentsWithMetrics.map((a) => {
      const latest = a.metrics[0]
      const prev = a.metrics[1]
      const scoreTrend =
        latest && prev
          ? latest.score > prev.score
            ? 'up'
            : latest.score < prev.score
              ? 'down'
              : 'stable'
          : 'stable'

      // Count critical failures (findings with severity=critical for this agent's conversations)
      // We'll approximate from today's agent metric
      return {
        id: a.id,
        team: a.team || 'Sem equipe',
        score: latest ? Math.round(latest.score) : 0,
        avgResponseTime: latest ? +(latest.avgResponseTime).toFixed(1) : 0,
        opportunities: latest ? latest.opportunitiesHandled : 0,
        criticalFailures: latest ? latest.opportunitiesLost : 0,
        promisesKept: latest ? latest.promisesKept : 0,
        promisesTotal: latest ? latest.promisesTotal : 0,
        trend: scoreTrend,
      }
    })

    return NextResponse.json({
      summary,
      funnel,
      failures,
      evolution,
      priorities,
      teamPerformance,
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json(
      { error: 'Failed to load dashboard data' },
      { status: 500 }
    )
  }
}
