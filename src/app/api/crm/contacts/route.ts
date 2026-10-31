import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { crmTx } from '@/lib/crm/deals'
import { actorOf, personDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody, parseQuery } from '@/lib/crm/http'
import { withIdempotency } from '@/lib/crm/idempotency'
import { createPerson } from '@/lib/crm/people'
import { listPeople } from '@/lib/crm/queries'
import { contactsQuery, personCreate } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'

// Pessoas comerciais. Busca por nome, e-mail ou 4 últimos dígitos do telefone (o número completo nunca sai da API).
export async function GET(request: Request) {
  const g = await crmGuard('crm.contacts.view')
  if (!g.ok) return g.res
  const { ctx } = g
  const q = parseQuery(new URL(request.url), contactsQuery, ctx)
  if (!q.ok) return q.res
  try {
    const scope = await ownerScope(ctx.auth)
    return crmJson(await listPeople(db, ctx.auth.orgId, scope, q.data), ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}

export async function POST(request: Request) {
  const g = await crmGuard('crm.contacts.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, personCreate, ctx)
  if (!b.ok) return b.res
  try {
    return await withIdempotency(request, ctx, 'contacts.create', b.data, async () => {
      const scope = await ownerScope(ctx.auth)
      const person = await crmTx((tx) => createPerson(tx, ctx.auth.orgId, scope, b.data, actorOf(ctx.auth)))
      // sem nome, e-mail ou telefone na auditoria: são dados do cliente final
      await audit(ctx.auth, { action: 'crm.person_created', targetType: 'crm_person', targetId: person.id, details: { hasPhone: !!person.phoneHash, hasEmail: !!person.email } })
      return { status: 201, body: { person: personDto(person) } }
    })
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
