import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { crmTx } from '@/lib/crm/deals'
import { personDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { archivePerson, updatePerson } from '@/lib/crm/people'
import { personDetail } from '@/lib/crm/queries'
import { personUpdate, versionOnly } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'

type Params = { params: Promise<{ id: string }> }

// Detalhe (negócios, atividades e conversas ligadas), edição com versão e arquivamento (DELETE com { version }).
export async function GET(_request: Request, { params }: Params) {
  const g = await crmGuard('crm.contacts.view')
  if (!g.ok) return g.res
  const { ctx } = g
  const { id } = await params
  try {
    const scope = await ownerScope(ctx.auth)
    return crmJson(await personDetail(db, ctx.auth.orgId, scope, id), ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const g = await crmGuard('crm.contacts.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, personUpdate, ctx)
  if (!b.ok) return b.res
  const { id } = await params
  try {
    const scope = await ownerScope(ctx.auth)
    const person = await crmTx((tx) => updatePerson(tx, ctx.auth.orgId, scope, id, b.data))
    // só os nomes dos campos: o valor (telefone, e-mail) não vai para a auditoria
    await audit(ctx.auth, { action: 'crm.person_updated', targetType: 'crm_person', targetId: person.id, details: { fields: Object.keys(b.data).filter((k) => k !== 'version') } })
    return crmJson({ person: personDto(person) }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const g = await crmGuard('crm.contacts.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, versionOnly, ctx)
  if (!b.ok) return b.res
  const { id } = await params
  try {
    const scope = await ownerScope(ctx.auth)
    const person = await crmTx((tx) => archivePerson(tx, ctx.auth.orgId, scope, id, b.data.version))
    await audit(ctx.auth, { action: 'crm.person_archived', targetType: 'crm_person', targetId: person.id })
    return crmJson({ person: personDto(person) }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
