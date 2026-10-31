import { db } from '@/lib/db'
import { crmCatch, crmGuard, crmJson } from '@/lib/crm/http'
import { outboxHealth } from '@/lib/crm/worker'
import { can } from '@/lib/permissions'

const stats = (json: string | null) => {
  try {
    return json ? (JSON.parse(json) as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// Saúde da sincronização AtendeRadar → CRM da empresa: fila por estado, atraso, última captura e reconciliação, e os
// eventos parados na DLQ (só tipo, tentativas e código do erro; nunca o payload).
export async function GET() {
  const g = await crmGuard('crm.settings.manage')
  if (!g.ok) return g.res
  const { ctx } = g
  const orgId = ctx.auth.orgId
  try {
    const [health, link, checkpoints, dead] = await Promise.all([
      outboxHealth(orgId),
      db.crmTenantLink.findUnique({ where: { organizationId: orgId }, select: { provider: true, status: true, lastHealthyAt: true, lastErrorCode: true } }),
      db.crmSyncCheckpoint.findMany({ where: { organizationId: orgId }, select: { resource: true, lastRunAt: true, lastSuccessAt: true, lagSeconds: true, lastErrorCode: true, statsJson: true } }),
      db.crmOutboxEvent.findMany({
        where: { organizationId: orgId, status: 'dead' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, eventType: true, aggregateType: true, attempts: true, lastErrorCode: true, createdAt: true },
      }),
    ])
    return crmJson(
      {
        ...health,
        link,
        checkpoints: checkpoints.map(({ statsJson, ...c }) => ({ ...c, stats: stats(statsJson) })),
        dead,
        canRetry: can(ctx.auth.role, 'crm.sync.retry'),
      },
      ctx.requestId,
    )
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
