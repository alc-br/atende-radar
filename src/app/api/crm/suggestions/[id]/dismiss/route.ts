import { audit } from '@/lib/audit'
import { crmTx } from '@/lib/crm/deals'
import { actorOf } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { suggestionDismiss } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'
import { dismissSuggestion } from '@/lib/crm/suggestions'

// Descarta a sugestão, com motivo opcional (vai para o histórico do negócio; a mesma sugestão não volta: dedupeKey).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await crmGuard('crm.deals.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, suggestionDismiss, ctx)
  if (!b.ok) return b.res
  const { id } = await params
  try {
    const scope = await ownerScope(ctx.auth)
    const r = await crmTx((tx) => dismissSuggestion(tx, ctx.auth.orgId, scope, id, b.data.note, actorOf(ctx.auth)))
    await audit(ctx.auth, { action: 'crm.suggestion_dismissed', targetType: 'crm_suggestion', targetId: id, details: { withNote: !!b.data.note } })
    return crmJson(r, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
