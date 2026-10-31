import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { crmMe, setCrmFlag, type CrmFlag } from '@/lib/crm/flags'
import { crmCatch, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { settingsUpdate } from '@/lib/crm/schemas'

const FLAG: Record<'autoCreateDeals' | 'suggestStage' | 'notifications' | 'exports', CrmFlag> = {
  autoCreateDeals: 'crm.autoCreateDeals',
  suggestStage: 'crm.suggestStage',
  notifications: 'crm.notifications',
  exports: 'crm.exports',
}

async function current(orgId: string) {
  const link = await db.crmTenantLink.findUnique({ where: { organizationId: orgId }, select: { provider: true, status: true, lastHealthyAt: true } })
  return { crm: await crmMe(orgId), link }
}

// Sub-flags do CRM da empresa (admin e gestor). Ligar ou desligar o CRM inteiro (crm.enabled) não é daqui: é do
// operador da plataforma (/api/admin/organizations/:id/crm).
export async function GET() {
  const g = await crmGuard('crm.settings.manage')
  if (!g.ok) return g.res
  const { ctx } = g
  try {
    return crmJson(await current(ctx.auth.orgId), ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}

export async function PATCH(request: Request) {
  const g = await crmGuard('crm.settings.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, settingsUpdate, ctx)
  if (!b.ok) return b.res
  try {
    const changes = Object.entries(b.data).filter((e): e is [keyof typeof FLAG, boolean] => typeof e[1] === 'boolean')
    for (const [key, enabled] of changes) await setCrmFlag(ctx.auth.orgId, FLAG[key], enabled, ctx.auth.memberId)
    if (changes.length) await audit(ctx.auth, { action: 'crm.settings_updated', targetType: 'crm_settings', details: Object.fromEntries(changes) })
    return crmJson(await current(ctx.auth.orgId), ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
