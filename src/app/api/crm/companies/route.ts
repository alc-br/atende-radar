import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { crmTx } from '@/lib/crm/deals'
import { actorOf, companyDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody, parseQuery } from '@/lib/crm/http'
import { withIdempotency } from '@/lib/crm/idempotency'
import { createCompany } from '@/lib/crm/people'
import { listCompanies } from '@/lib/crm/queries'
import { companyCreate, contactsQuery } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'

// Empresas (clientes PJ). Busca por nome ou CNPJ.
export async function GET(request: Request) {
  const g = await crmGuard('crm.contacts.view')
  if (!g.ok) return g.res
  const { ctx } = g
  const q = parseQuery(new URL(request.url), contactsQuery, ctx)
  if (!q.ok) return q.res
  try {
    const scope = await ownerScope(ctx.auth)
    return crmJson(await listCompanies(db, ctx.auth.orgId, scope, q.data), ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}

export async function POST(request: Request) {
  const g = await crmGuard('crm.contacts.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, companyCreate, ctx)
  if (!b.ok) return b.res
  try {
    return await withIdempotency(request, ctx, 'companies.create', b.data, async () => {
      const scope = await ownerScope(ctx.auth)
      const company = await crmTx((tx) => createCompany(tx, ctx.auth.orgId, scope, b.data, actorOf(ctx.auth)))
      await audit(ctx.auth, { action: 'crm.company_created', targetType: 'crm_company', targetId: company.id })
      return { status: 201, body: { company: companyDto(company) } }
    })
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
