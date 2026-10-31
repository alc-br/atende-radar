import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { archiveDeal, crmTx, updateDeal } from '@/lib/crm/deals'
import { actorOf, dealDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { dealDetail } from '@/lib/crm/queries'
import { dealUpdate, versionOnly } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'

type Params = { params: Promise<{ id: string }> }

// Detalhe (histórico, atividades, vínculos e sugestões), edição com versão e arquivamento (DELETE com { version }).
export async function GET(_request: Request, { params }: Params) {
  const g = await crmGuard('crm.deals.view')
  if (!g.ok) return g.res
  const { ctx } = g
  const { id } = await params
  try {
    const scope = await ownerScope(ctx.auth)
    return crmJson(await dealDetail(db, ctx.auth.orgId, scope, id), ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const g = await crmGuard('crm.deals.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, dealUpdate, ctx)
  if (!b.ok) return b.res
  const { id } = await params
  try {
    const scope = await ownerScope(ctx.auth)
    const before = await db.crmDeal.findFirst({ where: { id, organizationId: ctx.auth.orgId }, select: { ownerMemberId: true, amountCents: true } })
    const deal = await crmTx((tx) => updateDeal(tx, ctx.auth.orgId, scope, id, b.data, actorOf(ctx.auth)))
    await audit(ctx.auth, {
      action: 'crm.deal_updated',
      targetType: 'crm_deal',
      targetId: deal.id,
      details: {
        fields: Object.keys(b.data).filter((k) => k !== 'version'),
        ...(before && before.ownerMemberId !== deal.ownerMemberId ? { ownerFrom: before.ownerMemberId, ownerTo: deal.ownerMemberId } : {}),
        ...(before && before.amountCents !== deal.amountCents ? { amountChanged: true } : {}),
      },
    })
    return crmJson({ deal: dealDto(deal) }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const g = await crmGuard('crm.deals.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, versionOnly, ctx)
  if (!b.ok) return b.res
  const { id } = await params
  try {
    const scope = await ownerScope(ctx.auth)
    const deal = await crmTx((tx) => archiveDeal(tx, ctx.auth.orgId, scope, id, b.data.version, actorOf(ctx.auth)))
    await audit(ctx.auth, { action: 'crm.deal_archived', targetType: 'crm_deal', targetId: deal.id })
    return crmJson({ deal: dealDto(deal) }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
