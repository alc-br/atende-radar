import { audit } from '@/lib/audit'
import { crmTx, reopenDeal } from '@/lib/crm/deals'
import { actorOf, dealDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { dealReopen } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'

// Reabre na etapa em que estava (ou na primeira ativa, se ela saiu do funil). O desfecho das conversas não volta: ele
// é da conversa, e quem quiser muda lá. O motivo (obrigatório, CRM-03) vai só para o histórico do negócio: a auditoria
// registra quem reabriu, sem o texto livre.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await crmGuard('crm.deals.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, dealReopen, ctx)
  if (!b.ok) return b.res
  const { id } = await params
  try {
    const scope = await ownerScope(ctx.auth)
    const deal = await crmTx((tx) => reopenDeal(tx, ctx.auth.orgId, scope, id, { version: b.data.version, reason: b.data.reason }, actorOf(ctx.auth)))
    await audit(ctx.auth, { action: 'crm.deal_reopened', targetType: 'crm_deal', targetId: deal.id })
    return crmJson({ deal: dealDto(deal) }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
