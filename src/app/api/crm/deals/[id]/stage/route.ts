import { audit } from '@/lib/audit'
import { crmTx, moveDealStage } from '@/lib/crm/deals'
import { actorOf, dealDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { dealStage } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'

// Move de etapa (Kanban e teclado). Movido por pessoa: o sistema passa a só sugerir para este negócio.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await crmGuard('crm.deals.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, dealStage, ctx)
  if (!b.ok) return b.res
  const { id } = await params
  try {
    const scope = await ownerScope(ctx.auth)
    const deal = await crmTx((tx) => moveDealStage(tx, ctx.auth.orgId, scope, id, b.data.stageId, b.data.version, actorOf(ctx.auth)))
    await audit(ctx.auth, { action: 'crm.deal_moved', targetType: 'crm_deal', targetId: deal.id, details: { stageId: deal.stageId } })
    return crmJson({ deal: dealDto(deal) }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
