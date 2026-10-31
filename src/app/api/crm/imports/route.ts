import { audit } from '@/lib/audit'
import { actorOf } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { importPeople } from '@/lib/crm/imports'
import { importBody } from '@/lib/crm/schemas'

// Importação de pessoas (só admin). dryRun: true devolve a prévia (válidas, duplicadas e erros por linha) sem gravar;
// dryRun: false grava as válidas e pula as duplicadas. Até 5.000 linhas por envio.
export async function POST(request: Request) {
  const g = await crmGuard('crm.import', { heavy: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, importBody, ctx)
  if (!b.ok) return b.res
  try {
    const report = await importPeople(ctx.auth.orgId, b.data.rows, b.data.dryRun, actorOf(ctx.auth))
    if (!b.data.dryRun) {
      await audit(ctx.auth, {
        action: 'crm.imported',
        targetType: 'crm_import',
        targetId: report.batchId,
        details: { total: report.total, created: report.created, duplicates: report.duplicates.length, errors: report.errors.length, companiesCreated: report.companiesToCreate },
      })
    }
    return crmJson(report, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
