import { alertScope, recoveryScope, type AuthContext } from '@/lib/api-auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { alertTaskKey, createActivity, type ActivityOrigin } from '@/lib/crm/activities'
import { crmTx, DomainError, linkDeal } from '@/lib/crm/deals'
import { activityDto, actorOf } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody, parseQuery } from '@/lib/crm/http'
import { withIdempotency } from '@/lib/crm/idempotency'
import { listActivities } from '@/lib/crm/queries'
import { activitiesQuery, activityCreate } from '@/lib/crm/schemas'
import { activityWhere, ownerScope } from '@/lib/crm/scope'

// Tarefas e próximas ações. Nada aqui manda mensagem: "whatsapp_external" é só o registro de um contato feito fora.
export async function GET(request: Request) {
  const g = await crmGuard('crm.activities.view')
  if (!g.ok) return g.res
  const { ctx } = g
  const q = parseQuery(new URL(request.url), activitiesQuery, ctx)
  if (!q.ok) return q.res
  try {
    const scope = await ownerScope(ctx.auth)
    return crmJson(await listActivities(db, ctx.auth.orgId, scope, q.data), ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}

type Source = { origin: ActivityOrigin; link?: { type: 'alert' | 'recovery'; refs: { alertId?: string; recoveryItemId?: string; conversationId?: string } } }

/**
 * Tarefa a partir de um alerta ou de um item de recuperação (F5, CRM-04 e CRM-07). A origem passa pelo mesmo escopo da
 * tela de alertas e da recuperação (atendente: só os dele) e nunca vem de contato excluído do monitoramento: fora disso
 * é 404, como ID inexistente. Uma tarefa aberta por causa (`dedupeKey`).
 */
async function sourceOf(auth: AuthContext, alertId?: string, recoveryItemId?: string): Promise<Source> {
  if (alertId && recoveryItemId) throw new DomainError(400, 'crm_invalid', 'Informe o alerta ou o item de recuperação, não os dois.')
  if (alertId) {
    const alert = await db.alert.findFirst({
      where: { AND: [alertScope(auth), { id: alertId }, { NOT: { conversation: { contact: { excluded: true } } } }] },
      select: { id: true, conversationId: true },
    })
    if (!alert) throw new DomainError(404, 'crm_not_found', 'Alerta não encontrado.')
    return {
      origin: { source: 'alert', sourceId: alert.id, dedupeKey: alertTaskKey(auth.orgId, alert.id) },
      link: { type: 'alert', refs: { alertId: alert.id, conversationId: alert.conversationId ?? undefined } },
    }
  }
  if (recoveryItemId) {
    const item = await db.recoveryItem.findFirst({ where: { AND: [recoveryScope(auth), { id: recoveryItemId }] }, select: { id: true, conversationId: true } })
    const excluded = item?.conversationId
      ? await db.conversation.count({ where: { id: item.conversationId, organizationId: auth.orgId, contact: { excluded: true } } })
      : 0
    if (!item || excluded) throw new DomainError(404, 'crm_not_found', 'Item de recuperação não encontrado.')
    return {
      origin: { source: 'recovery', sourceId: item.id, dedupeKey: `${auth.orgId}:recovery:${item.id}` },
      link: { type: 'recovery', refs: { recoveryItemId: item.id, conversationId: item.conversationId ?? undefined } },
    }
  }
  return { origin: { source: 'manual' } }
}

export async function POST(request: Request) {
  const g = await crmGuard('crm.activities.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, activityCreate, ctx)
  if (!b.ok) return b.res
  try {
    return await withIdempotency(request, ctx, 'activities.create', b.data, async () => {
      const scope = await ownerScope(ctx.auth)
      const { alertId, recoveryItemId, ...input } = b.data
      const src = await sourceOf(ctx.auth, alertId, recoveryItemId)
      const actor = actorOf(ctx.auth)
      const orgId = ctx.auth.orgId
      const { activity, created } = await crmTx(async (tx) => {
        const r = await createActivity(tx, orgId, scope, input, actor, src.origin)
        if (!r.created) {
          // já há tarefa aberta para esta causa: devolve a mesma, se estiver no escopo de quem pede (sem vazar a de outro)
          const visible = await tx.crmActivity.count({ where: { id: r.activity.id, ...activityWhere(orgId, scope) } })
          if (!visible) throw new DomainError(409, 'crm_duplicate', 'Já existe uma tarefa aberta para isto, com outra pessoa.')
          return r
        }
        if (src.link && r.activity.dealId) await linkDeal(tx, orgId, r.activity.dealId, src.link.type, src.link.refs, { createdBy: actor.memberId })
        // a pessoa agiu sobre o alerta: a sugestão automática de tarefa para ele deixa de valer (sem tarefa em dobro)
        if (alertId) {
          await tx.crmSuggestion.updateMany({
            where: { organizationId: orgId, alertId, kind: 'create_task', status: 'pending' },
            data: { status: 'expired', decisionNote: 'Tarefa criada à mão para este alerta' },
          })
        }
        return r
      })
      if (created) {
        await audit(ctx.auth, {
          action: 'crm.activity_created',
          targetType: 'crm_activity',
          targetId: activity.id,
          details: { type: activity.type, dealId: activity.dealId, source: activity.source, sourceId: activity.sourceId },
        })
      }
      return { status: created ? 201 : 200, body: { activity: activityDto(activity), created } }
    })
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
