import { audit } from '@/lib/audit'
import { crmTx, dealFromOpportunity } from '@/lib/crm/deals'
import { actorOf, dealDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { fromOpportunity } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'

// Negócio a partir de uma oportunidade da análise. Idempotente sem cabeçalho: a chave de origem (originKey) é única,
// então a primeira chamada cria (201) e as seguintes devolvem o mesmo negócio (200).
export async function POST(request: Request) {
  const g = await crmGuard('crm.deals.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, fromOpportunity, ctx)
  if (!b.ok) return b.res
  try {
    const scope = await ownerScope(ctx.auth)
    const { deal, created } = await crmTx((tx) => dealFromOpportunity(tx, ctx.auth.orgId, scope, b.data.opportunityId, actorOf(ctx.auth)), { retryUnique: true })
    if (created) await audit(ctx.auth, { action: 'crm.deal_created', targetType: 'crm_deal', targetId: deal.id, details: { source: 'opportunity' } })
    return crmJson({ deal: dealDto(deal), created }, ctx.requestId, created ? 201 : 200)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
