import { conversationScope } from '@/lib/api-auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { createDeal, crmTx, DomainError } from '@/lib/crm/deals'
import { actorOf, dealDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody, parseQuery } from '@/lib/crm/http'
import { withIdempotency } from '@/lib/crm/idempotency'
import { boardDeals, listDeals } from '@/lib/crm/queries'
import { dealCreate, dealsQuery } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'

// Negócios: lista paginada ou Kanban (view=board, até 50 por coluna, com cursor por coluna). Escopo do papel sempre.
export async function GET(request: Request) {
  const g = await crmGuard('crm.deals.view')
  if (!g.ok) return g.res
  const { ctx } = g
  const q = parseQuery(new URL(request.url), dealsQuery, ctx)
  if (!q.ok) return q.res
  try {
    const scope = await ownerScope(ctx.auth)
    const { conversationId, ...filters } = q.data
    let ids: string[] | undefined
    if (conversationId) {
      // a conversa precisa estar no escopo de quem pede (atendente: só as dele; contato excluído: nunca)
      const conv = await db.conversation.findFirst({ where: { id: conversationId, ...conversationScope(ctx.auth) }, select: { id: true } })
      if (!conv) throw new DomainError(404, 'crm_not_found', 'Conversa não encontrada.')
      const links = await db.crmBusinessLink.findMany({ where: { organizationId: ctx.auth.orgId, conversationId }, select: { dealId: true } })
      ids = [...new Set(links.map((l) => l.dealId))]
    }
    const f = { ...filters, ids }
    const body = f.view === 'board' ? await boardDeals(db, ctx.auth.orgId, scope, f) : await listDeals(db, ctx.auth.orgId, scope, f)
    return crmJson(body, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}

export async function POST(request: Request) {
  const g = await crmGuard('crm.deals.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, dealCreate, ctx)
  if (!b.ok) return b.res
  try {
    return await withIdempotency(request, ctx, 'deals.create', b.data, async () => {
      const scope = await ownerScope(ctx.auth)
      const deal = await crmTx((tx) => createDeal(tx, ctx.auth.orgId, scope, b.data, actorOf(ctx.auth)))
      await audit(ctx.auth, { action: 'crm.deal_created', targetType: 'crm_deal', targetId: deal.id, details: { source: 'manual', hasAmount: deal.amountCents !== null } })
      return { status: 201, body: { deal: dealDto(deal) } }
    })
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
