import { audit } from '@/lib/audit'
import { crmTx } from '@/lib/crm/deals'
import { actorOf } from '@/lib/crm/dto'
import { crmCatch, crmError, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { suggestionAccept } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'
import { acceptSuggestion } from '@/lib/crm/suggestions'

// Aceita a sugestão: o efeito (criar negócio, mover etapa, criar tarefa, confirmar desfecho) roda com a pessoa como
// autora. Sugestão que perdeu o sentido (venceu, negócio fechado ou já em outra etapa) é marcada como vencida e
// responde 409: a marcação fica gravada, por isso o domínio devolve "stale" em vez de lançar erro.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await crmGuard('crm.deals.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, suggestionAccept, ctx)
  if (!b.ok) return b.res
  const { id } = await params
  try {
    const scope = await ownerScope(ctx.auth)
    const r = await crmTx((tx) => acceptSuggestion(tx, ctx.auth.orgId, scope, id, b.data, actorOf(ctx.auth)))
    if (r.status === 'stale') return crmError(409, 'crm_invalid_transition', r.message, ctx.requestId, { expired: true })
    await audit(ctx.auth, { action: 'crm.suggestion_accepted', targetType: 'crm_suggestion', targetId: id, details: { kind: r.kind, dealId: r.dealId, activityId: r.activityId ?? null } })
    return crmJson(r, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
