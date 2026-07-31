import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const agent = await db.agent.findUnique({
      where: { id },
      include: {
        metrics: { orderBy: { date: 'asc' } },
        organization: { select: { id: true, name: true } },
        conversations: {
          select: {
            id: true,
            operationalStatus: true,
            inferredStage: true,
            primaryIntent: true,
            urgency: true,
            sentiment: true,
            score: true,
            potentialValue: true,
            openedAt: true,
            closedAt: true,
            contact: { select: { displayName: true, phoneLast4: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        },
      },
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Score evolution from metrics
    const scoreEvolution = agent.metrics.map((m) => ({
      date: m.date,
      score: Math.round(m.score),
      avgResponseTime: +m.avgResponseTime.toFixed(1),
      conversations: m.conversations,
      opportunitiesHandled: m.opportunitiesHandled,
      opportunitiesLost: m.opportunitiesLost,
      promisesKept: m.promisesKept,
      promisesTotal: m.promisesTotal,
    }))

    // Latest metrics summary
    const latestMetric = agent.metrics[agent.metrics.length - 1]
    const prevMetric = agent.metrics.length > 1 ? agent.metrics[agent.metrics.length - 2] : null
    const trend =
      latestMetric && prevMetric
        ? latestMetric.score > prevMetric.score
          ? 'up'
          : latestMetric.score < prevMetric.score
            ? 'down'
            : 'stable'
        : 'stable'

    return NextResponse.json({
      id: agent.id,
      name: agent.name,
      email: agent.email,
      role: agent.role,
      team: agent.team,
      status: agent.status,
      createdAt: agent.createdAt.toISOString(),
      metrics: {
        score: latestMetric ? Math.round(latestMetric.score) : 0,
        conversations: latestMetric?.conversations ?? 0,
        avgResponseTime: latestMetric ? +latestMetric.avgResponseTime.toFixed(1) : 0,
        opportunities: latestMetric?.opportunitiesHandled ?? 0,
        opportunitiesLost: latestMetric?.opportunitiesLost ?? 0,
        promisesKept: latestMetric?.promisesKept ?? 0,
        promisesTotal: latestMetric?.promisesTotal ?? 0,
        questionsAnswered: latestMetric?.questionsAnswered ?? 0,
        questionsTotal: latestMetric?.questionsTotal ?? 0,
        trend,
      },
      scoreEvolution,
      recentConversations: agent.conversations.map((c) => ({
        id: c.id,
        customerName: c.contact?.displayName || 'Desconhecido',
        customerPhone: c.contact?.phoneLast4 ? `*****${c.contact.phoneLast4}` : '******',
        operationalStatus: c.operationalStatus,
        inferredStage: c.inferredStage,
        primaryIntent: c.primaryIntent,
        urgency: c.urgency,
        sentiment: c.sentiment,
        score: Math.round(c.score),
        potentialValue: Math.round(c.potentialValue),
        openedAt: c.openedAt.toISOString(),
        closedAt: c.closedAt?.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Agent profile error:', error)
    return NextResponse.json({ error: 'Failed to load agent profile' }, { status: 500 })
  }
}
