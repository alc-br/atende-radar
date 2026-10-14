import { db } from '../db'
import { dayKey, dayMetrics, firstResponseMinutes, mean, metricsWindowStart } from './day-metrics'

// o cálculo puro (dayKey, dayMetrics, janela) mora em day-metrics.ts; quem importava daqui continua importando
export * from './day-metrics'

/**
 * Recalcula os números do painel (DailyMetric) e do desempenho por atendente (AgentMetric) a partir das conversas REAIS.
 * Grava hoje (sempre) e ontem (só se houve movimento); dias antigos ficam como estão.
 */
export async function recomputeMetrics(orgId: string, timezone: string, now = new Date()) {
  const tz = timezone || 'America/Sao_Paulo'
  const today = dayKey(now, tz)
  const yesterday = dayKey(new Date(now.getTime() - 86400000), tz)
  const since = metricsWindowStart(now)

  // Só as conversas da janela (inMetricsWindow) e só os campos usados: antes lia a empresa inteira a cada rodada do motor.
  const convs = await db.conversation.findMany({
    where: {
      organizationId: orgId,
      messages: { some: { externalId: { not: null } } },
      NOT: { contact: { excluded: true } },
      OR: [{ openedAt: { gte: since } }, { closedAt: null }, { messages: { some: { occurredAt: { gte: since } } } }, { opportunities: { some: { createdAt: { gte: since } } } }],
    },
    select: {
      agentId: true, openedAt: true, closedAt: true, operationalStatus: true, score: true,
      messages: { select: { direction: true, occurredAt: true } },
      opportunities: { select: { status: true, expectedValue: true, createdAt: true } },
    },
  })
  const promises = await db.promise.findMany({ where: { conversation: { organizationId: orgId } }, select: { status: true, dueAt: true, conversation: { select: { agentId: true } } } })

  for (const date of [today, yesterday]) {
    const data = dayMetrics(convs, promises, date, tz, now)
    if (!data) continue
    const opened = convs.filter((c) => dayKey(c.openedAt, tz) === date)
    const existing = await db.dailyMetric.findFirst({ where: { organizationId: orgId, date, connectionId: null, teamId: null } })
    if (existing) await db.dailyMetric.update({ where: { id: existing.id }, data })
    else await db.dailyMetric.create({ data: { organizationId: orgId, date, ...data } })

    // desempenho por atendente (só conversas com atendente identificado)
    const byAgent = new Map<string, typeof opened>()
    for (const c of opened) if (c.agentId) byAgent.set(c.agentId, [...(byAgent.get(c.agentId) ?? []), c])
    for (const [agentId, list] of byAgent) {
      const fr = list.map(firstResponseMinutes).filter((x): x is number => x != null)
      const agentPromises = promises.filter((p) => p.conversation.agentId === agentId)
      const agentData = {
        conversations: list.length,
        avgResponseTime: +mean(fr).toFixed(1),
        score: Math.round(mean(list.filter((c) => c.messages.length >= 2).map((c) => c.score))),
        opportunitiesHandled: list.filter((c) => c.opportunities.length > 0).length,
        opportunitiesLost: list.filter((c) => c.operationalStatus === 'lost').length,
        promisesKept: agentPromises.filter((p) => p.status === 'kept').length,
        promisesTotal: agentPromises.length,
        questionsAnswered: 0,
        questionsTotal: 0,
      }
      const ex = await db.agentMetric.findFirst({ where: { organizationId: orgId, agentId, date } })
      if (ex) await db.agentMetric.update({ where: { id: ex.id }, data: agentData })
      else await db.agentMetric.create({ data: { organizationId: orgId, date, agentId, ...agentData } })
    }
  }
}
