import { db } from '../db'

const dayKey = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

const median = (xs: number[]) => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const minutes = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 60000)

/**
 * Recalcula os números do painel (DailyMetric) e do desempenho por atendente (AgentMetric) a partir das conversas REAIS.
 * Grava hoje (sempre) e ontem (só se houve movimento); dias antigos ficam como estão.
 */
export async function recomputeMetrics(orgId: string, timezone: string, now = new Date()) {
  const tz = timezone || 'America/Sao_Paulo'
  const today = dayKey(now, tz)
  const yesterday = dayKey(new Date(now.getTime() - 86400000), tz)

  const convs = await db.conversation.findMany({
    where: { organizationId: orgId, messages: { some: { externalId: { not: null } } }, NOT: { contact: { excluded: true } } },
    include: { messages: { select: { direction: true, occurredAt: true } }, opportunities: true },
  })
  const promises = await db.promise.findMany({ where: { conversation: { organizationId: orgId } }, include: { conversation: { select: { agentId: true } } } })

  const firstResponse = (c: (typeof convs)[number]) => {
    const inbound = c.messages.filter((m) => m.direction === 'inbound').sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0]
    if (!inbound) return null
    const out = c.messages.filter((m) => m.direction === 'outbound' && m.occurredAt > inbound.occurredAt).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0]
    return out ? minutes(inbound.occurredAt, out.occurredAt) : null
  }

  for (const date of [today, yesterday]) {
    const isToday = date === today
    const opened = convs.filter((c) => dayKey(c.openedAt, tz) === date)
    const msgsOfDay = convs.flatMap((c) => c.messages).filter((m) => dayKey(m.occurredAt, tz) === date)
    if (!isToday && opened.length === 0 && msgsOfDay.length === 0) continue

    const open = convs.filter((c) => c.closedAt == null && !['won', 'lost'].includes(c.operationalStatus))
    const waiting = open.filter((c) => c.operationalStatus === 'waiting_company')
    const atRiskOpps = waiting.flatMap((c) => c.opportunities.filter((o) => o.status === 'active'))
    const scores = opened.filter((c) => c.messages.length >= 2).map((c) => c.score)
    const firsts = opened.map(firstResponse).filter((x): x is number => x != null)

    const data = {
      conversationsStarted: opened.length,
      customersWaiting: isToday ? waiting.length : 0,
      medianFirstResponse: +median(firsts).toFixed(1),
      opportunitiesDetected: convs.flatMap((c) => c.opportunities).filter((o) => dayKey(o.createdAt, tz) === date).length,
      opportunitiesAtRisk: isToday ? atRiskOpps.length : 0,
      overduePromises: isToday ? promises.filter((p) => p.status === 'open' && p.dueAt && p.dueAt < now).length : 0,
      potentialValueAtRisk: isToday ? Math.round(atRiskOpps.reduce((s, o) => s + o.expectedValue, 0)) : 0,
      overallScore: Math.round(mean(scores)),
      messagesReceived: msgsOfDay.filter((m) => m.direction === 'inbound').length,
      messagesSent: msgsOfDay.filter((m) => m.direction === 'outbound').length,
    }
    const existing = await db.dailyMetric.findFirst({ where: { organizationId: orgId, date, connectionId: null, teamId: null } })
    if (existing) await db.dailyMetric.update({ where: { id: existing.id }, data })
    else await db.dailyMetric.create({ data: { organizationId: orgId, date, ...data } })

    // desempenho por atendente (só conversas com atendente identificado)
    const byAgent = new Map<string, typeof opened>()
    for (const c of opened) if (c.agentId) byAgent.set(c.agentId, [...(byAgent.get(c.agentId) ?? []), c])
    for (const [agentId, list] of byAgent) {
      const fr = list.map(firstResponse).filter((x): x is number => x != null)
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
      else await db.agentMetric.create({ data: { organizationId: orgId, agentId, date, ...agentData } })
    }
  }
}
