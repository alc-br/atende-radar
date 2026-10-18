import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, alertScope } from '@/lib/api-auth'
import { maskSensitive } from '@/lib/mask-sensitive'
import { Prisma } from '@prisma/client'
import { pageParams } from '@/lib/pagination'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const severity = searchParams.get('severity')
    const type = searchParams.get('type')
    const agentId = searchParams.get('agentId')
    const team = searchParams.get('team')
    const { page, limit } = pageParams(searchParams, 20)

    const g = await guard('alerts.view')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    // Build where clause
    const where: Prisma.AlertWhereInput = { AND: [alertScope(g.auth)] }

    if (status && status !== 'all') {
      where.status = status
    }
    if (severity && severity !== 'all') {
      where.severity = severity
    }
    if (type && type !== 'all') {
      where.ruleName = type
    }
    if (agentId) {
      where.agentName = undefined // will filter via conversation
      where.conversation = agentId ? { agentId } : undefined
    }
    if (team) {
      where.conversation = { ...((where.conversation as Prisma.ConversationWhereInput) || {}), agent: { team } }
    }

    const [alerts, total, countsRaw] = await Promise.all([
      db.alert.findMany({
        where,
        include: {
          conversation: {
            select: {
              id: true,
              contact: { select: { displayName: true, phoneLast4: true } },
              agent: { select: { id: true, name: true, team: true } },
            },
          },
        },
        // B6: alerta agrupado que se repetiu volta para o topo (última ocorrência)
        orderBy: [{ lastOccurredAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.alert.count({ where }),
      db.alert.groupBy({
        by: ['status'],
        where: alertScope(g.auth),
        _count: { id: true },
      }),
    ])

    const counts: Record<string, number> = {}
    for (const c of countsRaw) {
      counts[c.status] = c._count.id
    }

    const formattedAlerts = alerts.map((a) => ({
      id: a.id,
      conversationId: a.conversationId,
      ruleName: a.ruleName,
      severity: a.severity,
      title: a.title,
      description: maskSensitive(a.description), // alertas antigos podem citar a mensagem do cliente em claro
      customerName: a.customerName || a.conversation?.contact?.displayName || 'Desconhecido',
      agentName: a.agentName || a.conversation?.agent?.name || 'Sem agente',
      status: a.status,
      potentialValue: a.potentialValue ?? undefined,
      confidence: a.confidence ?? undefined,
      createdAt: a.createdAt.toISOString(),
      occurrences: a.occurrences, // B6: quantas vezes aconteceu nesta conversa
      // "encerrar sozinho" da regra (Alertas › Regras › Mais opções): fechou pelo prazo, não porque o problema acabou
      autoClosed: a.status === 'resolved' && !!a.dismissedReason?.startsWith('Encerrado sozinho'),
      lastOccurredAt: (a.lastOccurredAt ?? a.createdAt).toISOString(),
      evidence: undefined, // evidence is on AuditFinding, not directly on Alert
    }))

    return NextResponse.json({
      alerts: formattedAlerts,
      total,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      counts,
    })
  } catch (error) {
    console.error('Alerts GET error:', error)
    return NextResponse.json({ error: 'Failed to load alerts' }, { status: 500 })
  }
}
