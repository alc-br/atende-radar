import { audit } from '@/lib/audit'
import { activityChanges, loadActivity, updateActivity } from '@/lib/crm/activities'
import { crmTx } from '@/lib/crm/deals'
import { activityDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { activityUpdate } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'

// Edita, atribui, reagenda, conclui ou cancela (com versão). O atendente não troca o responsável.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await crmGuard('crm.activities.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, activityUpdate, ctx)
  if (!b.ok) return b.res
  const { id } = await params
  try {
    const scope = await ownerScope(ctx.auth)
    const orgId = ctx.auth.orgId
    const { before, activity } = await crmTx(async (tx) => {
      const before = await loadActivity(tx, orgId, scope, id)
      return { before, activity: await updateActivity(tx, orgId, scope, id, b.data) }
    })
    // só o que mudou de fato. Reatribuição e conclusão ficam rastreáveis: nomes de campo, situação e IDs de membro,
    // nunca o título nem a observação
    const fields = activityChanges(before, activity)
    if (fields.length) {
      await audit(ctx.auth, {
        action: 'crm.activity_updated',
        targetType: 'crm_activity',
        targetId: activity.id,
        details: {
          fields,
          status: activity.status,
          ...(fields.includes('status') ? { statusFrom: before.status } : {}),
          ...(fields.includes('ownerMemberId') ? { ownerFrom: before.ownerMemberId, ownerTo: activity.ownerMemberId } : {}),
        },
      })
    }
    return crmJson({ activity: activityDto(activity) }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
