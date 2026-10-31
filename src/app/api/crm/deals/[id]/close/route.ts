import { audit } from '@/lib/audit'
import { closeDeal, crmTx } from '@/lib/crm/deals'
import { actorOf, dealDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { reflectDealOutcome } from '@/lib/crm/outcome'
import { dealClose } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'

// Fecha como ganho (valor declarado ou "sem valor" confirmado) ou perdido (motivo obrigatório). Na mesma transação, o
// desfecho vai para as conversas de origem que ainda não têm desfecho marcado por pessoa (outcome.ts).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await crmGuard('crm.deals.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, dealClose, ctx)
  if (!b.ok) return b.res
  const { id } = await params
  try {
    const scope = await ownerScope(ctx.auth)
    const actor = actorOf(ctx.auth)
    const { deal, reflected } = await crmTx(async (tx) => {
      const closed = await closeDeal(tx, ctx.auth.orgId, scope, id, b.data, actor)
      return { deal: closed, reflected: await reflectDealOutcome(tx, closed, actor) }
    })
    await audit(ctx.auth, {
      action: 'crm.deal_closed',
      targetType: 'crm_deal',
      targetId: deal.id,
      details: { outcome: deal.status, hasAmount: deal.amountCents !== null, lostReasonCode: deal.lostReasonCode, conversationsUpdated: reflected.reflected },
    })
    return crmJson({ deal: dealDto(deal), conversations: reflected }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
