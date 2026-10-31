import { audit } from '@/lib/audit'
import { crmTx } from '@/lib/crm/deals'
import { actorOf, personDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { mergePeople } from '@/lib/crm/people'
import { mergeBody } from '@/lib/crm/schemas'

// Mescla duas pessoas (admin e gestor, empresa inteira): negócios, atividades e vínculos com o WhatsApp vão para
// keepId; mergeId fica marcada como mesclada (não some, para o histórico). Conta no limite das ações pesadas.
export async function POST(request: Request) {
  const g = await crmGuard('crm.contacts.merge', { heavy: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, mergeBody, ctx)
  if (!b.ok) return b.res
  try {
    const { person, moved } = await crmTx((tx) => mergePeople(tx, ctx.auth.orgId, b.data, actorOf(ctx.auth)))
    await audit(ctx.auth, { action: 'crm.people_merged', targetType: 'crm_person', targetId: person.id, details: { mergedId: b.data.mergeId, moved } })
    return crmJson({ person: personDto(person), moved }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
