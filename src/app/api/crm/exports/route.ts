import { NextResponse } from 'next/server'
import { audit } from '@/lib/audit'
import { exportDeals, exportPeople } from '@/lib/crm/exports'
import { crmFlags } from '@/lib/crm/flags'
import { crmCatch, crmError, crmForbidden, crmGuard, parseBody } from '@/lib/crm/http'
import { exportBody } from '@/lib/crm/schemas'

// Exporta pessoas ou negócios em CSV (só admin, com a exportação ligada nas configurações do CRM). O arquivo volta
// na resposta e não fica guardado. Telefone completo só com includeFullPhone + confirm, e isso fica na auditoria.
export async function POST(request: Request) {
  const g = await crmGuard('crm.export', { heavy: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, exportBody, ctx)
  if (!b.ok) return b.res
  const { entity, includeFullPhone, confirm } = b.data
  if (includeFullPhone && entity === 'people' && !confirm) {
    return crmError(400, 'crm_invalid', 'Confirme que quer o telefone completo no arquivo.', ctx.requestId)
  }
  try {
    if (!(await crmFlags(ctx.auth.orgId))['crm.exports']) return crmForbidden(ctx, 'A exportação está desligada nas configurações do CRM.')
    const fullPhone = entity === 'people' && !!includeFullPhone && !!confirm
    const out = entity === 'people' ? await exportPeople(ctx.auth.orgId, { fullPhone }) : await exportDeals(ctx.auth.orgId)
    await audit(ctx.auth, { action: 'crm.exported', targetType: 'crm_export', details: { entity, rows: out.rows, truncated: out.truncated, fullPhone } })
    const day = new Date().toISOString().slice(0, 10)
    return new NextResponse(out.csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="atenderadar-crm-${entity === 'people' ? 'pessoas' : 'negocios'}-${day}.csv"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'x-request-id': ctx.requestId,
        ...(out.truncated ? { 'x-crm-truncated': 'true' } : {}),
      },
    })
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
