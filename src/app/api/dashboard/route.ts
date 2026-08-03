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

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

// Windows are [start, end] inclusive, in days-ago terms (0 = today)
function resolveWindows(period: string): { curStart: number; curEnd: number; prevStart: number; prevEnd: number } {
  switch (period) {
    case 'today':
      return { curStart: 0, curEnd: 0, prevStart: 1, prevEnd: 1 }
    case 'yesterday':
      return { curStart: 1, curEnd: 1, prevStart: 2, prevEnd: 2 }
    case '30d':
      return { curStart: 29, curEnd: 0, prevStart: 59, prevEnd: 30 }
    case '7d':
    case 'custom':
    default:
      return { curStart: 6, curEnd: 0, prevStart: 13, prevEnd: 7 }
  }
}

function sumOrAvg(rows: { [key: string]: unknown }[], field: string, mode: 'sum' | 'avg'): number {
  if (rows.length === 0) return 0
  const total = rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0)
  return mode === 'sum' ? total : total / rows.length
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '7d'

    // Get the first (and likely only) organization
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // --- Dashboard Summary from DailyMetric, filtered by the selected period ---
    const { curStart, curEnd, prevStart, prevEnd } = resolveWindows(period)
    const curFrom = dateStr(new Date(Date.now() - curStart * 86400000))
    const curTo = dateStr(new Date(Date.now() - curEnd * 86400000))
    const prevFrom = dateStr(new Date(Date.now() - prevStart * 86400000))
    const prevTo = dateStr(new Date(Date.now() - prevEnd * 86400000))

    const [curRows, prevRows] = await Promise.all([
      db.dailyMetric.findMany({ where: { organizationId: org.id, date: { gte: curFrom, lte: curTo } } }),
      db.dailyMetric.findMany({ where: { organizationId: org.id, date: { gte: prevFrom, lte: prevTo } } }),
    ])

    const calcChange = (curVal: number, prevVal: number): number => {
      if (prevVal === 0) return curVal > 0 ? 100 : 0
      return +(((curVal - prevVal) / Math.abs(prevVal)) * 100).toFixed(1)
    }

    const agg = (field: string, mode: 'sum' | 'avg') => ({
      cur: sumOrAvg(curRows, field, mode),
      prev: sumOrAvg(prevRows, field, mode),
    })

    const conversationsStarted = agg('conversationsStarted', 'sum')
    const customersWaiting = agg('customersWaiting', 'avg')
    const medianFirstResponse = agg('medianFirstResponse', 'avg')
    const opportunitiesDetected = agg('opportunitiesDetected', 'sum')
    const opportunitiesAtRisk = agg('opportunitiesAtRisk', 'sum')
    const overduePromises = agg('overduePromises', 'sum')
    const potentialValueAtRisk = agg('potentialValueAtRisk', 'avg')
    const overallScore = agg('overallScore', 'avg')

    const summary: DashboardSummary = {
      conversationsStarted: Math.round(conversationsStarted.cur),
      conversationsStartedChange: calcChange(conversationsStarted.cur, conversationsStarted.prev),
      customersWaiting: Math.round(customersWaiting.cur),
      customersWaitingChange: calcChange(customersWaiting.cur, customersWaiting.prev),
      medianFirstResponse: +medianFirstResponse.cur.toFixed(1),
      medianFirstResponseChange: calcChange(medianFirstResponse.cur, medianFirstResponse.prev),
      opportunitiesDetected: Math.round(opportunitiesDetected.cur),
      opportunitiesDetectedChange: calcChange(opportunitiesDetected.cur, opportunitiesDetected.prev),
      opportunitiesAtRisk: Math.round(opportunitiesAtRisk.cur),
      opportunitiesAtRiskChange: calcChange(opportunitiesAtRisk.cur, opportunitiesAtRisk.prev),
      overduePromises: Math.round(overduePromises.cur),
      overduePromisesChange: calcChange(overduePromises.cur, overduePromises.prev),
      potentialValueAtRisk: Math.round(potentialValueAtRisk.cur),
      potentialValueAtRiskChange: calcChange(potentialValueAtRisk.cur, potentialValueAtRisk.prev),
      overallScore: Math.round(overallScore.cur),
      overallScoreChange: calcChange(overallScore.cur, overallScore.prev),
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
