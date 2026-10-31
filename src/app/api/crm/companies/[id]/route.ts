import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { crmTx } from '@/lib/crm/deals'
import { companyDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { archiveCompany, updateCompany } from '@/lib/crm/people'
import { companyDetail } from '@/lib/crm/queries'
import { companyUpdate, versionOnly } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const g = await crmGuard('crm.contacts.view')
  if (!g.ok) return g.res
  const { ctx } = g
  const { id } = await params
  try {
    const scope = await ownerScope(ctx.auth)
    return crmJson(await companyDetail(db, ctx.auth.orgId, scope, id), ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const g = await crmGuard('crm.contacts.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, companyUpdate, ctx)
  if (!b.ok) return b.res
  const { id } = await params
  try {
    const scope = await ownerScope(ctx.auth)
    const company = await crmTx((tx) => updateCompany(tx, ctx.auth.orgId, scope, id, b.data))
    await audit(ctx.auth, { action: 'crm.company_updated', targetType: 'crm_company', targetId: company.id, details: { fields: Object.keys(b.data).filter((k) => k !== 'version') } })
    return crmJson({ company: companyDto(company) }, ctx.requestId)
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
    const company = await crmTx((tx) => archiveCompany(tx, ctx.auth.orgId, scope, id, b.data.version))
    await audit(ctx.auth, { action: 'crm.company_archived', targetType: 'crm_company', targetId: company.id })
    return crmJson({ company: companyDto(company) }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
