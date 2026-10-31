import { db } from '@/lib/db'
import { crmCatch, crmGuard, crmJson, parseQuery } from '@/lib/crm/http'
import { suggestionsQuery } from '@/lib/crm/schemas'
import { ownerScope } from '@/lib/crm/scope'
import { listSuggestions } from '@/lib/crm/suggestions'

// Sugestões pendentes no escopo (D2: o sistema sugere, a pessoa decide).
export async function GET(request: Request) {
  const g = await crmGuard('crm.deals.view')
  if (!g.ok) return g.res
  const { ctx } = g
  const q = parseQuery(new URL(request.url), suggestionsQuery, ctx)
  if (!q.ok) return q.res
  try {
    const scope = await ownerScope(ctx.auth)
    return crmJson({ suggestions: await listSuggestions(db, ctx.auth.orgId, scope, { dealId: q.data.dealId }) }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
