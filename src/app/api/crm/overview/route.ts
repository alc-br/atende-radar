import { db } from '@/lib/db'
import { crmCatch, crmError, crmGuard, crmJson, parseQuery } from '@/lib/crm/http'
import { crmOverview } from '@/lib/crm/overview'
import { overviewQuery } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'

const DAY = 86400_000

// Indicadores do CRM (CRM-08). Sem período: os últimos 30 dias. Analista e visualizador veem só estes agregados.
export async function GET(request: Request) {
  const g = await crmGuard('crm.analytics.view')
  if (!g.ok) return g.res
  const { ctx } = g
  const q = parseQuery(new URL(request.url), overviewQuery, ctx)
  if (!q.ok) return q.res
  const now = new Date()
  const to = q.data.to ? new Date(q.data.to) : now
  const from = q.data.from ? new Date(q.data.from) : new Date(to.getTime() - 30 * DAY)
  if (from >= to) return crmError(400, 'crm_invalid', 'O início do período precisa ser antes do fim.', ctx.requestId)
  if (to.getTime() - from.getTime() > 366 * DAY) return crmError(400, 'crm_invalid', 'Escolha um período de até 1 ano.', ctx.requestId)
  try {
    const scope = await ownerScope(ctx.auth)
    return crmJson(await crmOverview(db, ctx.auth.orgId, scope, { from, to }, now), ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
