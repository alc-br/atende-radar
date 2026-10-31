import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { crmTx } from '@/lib/crm/deals'
import { pipelineDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody, parseQuery } from '@/lib/crm/http'
import { withIdempotency } from '@/lib/crm/idempotency'
import { createPipeline, listPipelines } from '@/lib/crm/pipelines'
import { pipelineCreate, pipelinesQuery } from '@/lib/crm/schemas'

// Funis com as etapas em ordem. Ler: quem vê negócios (o Kanban precisa das colunas). Criar: admin e gestor.
export async function GET(request: Request) {
  const g = await crmGuard('crm.deals.view')
  if (!g.ok) return g.res
  const { ctx } = g
  const q = parseQuery(new URL(request.url), pipelinesQuery, ctx)
  if (!q.ok) return q.res
  try {
    const rows = await listPipelines(db, ctx.auth.orgId, { includeInactive: q.data.includeInactive === '1' })
    return crmJson({ pipelines: rows.map(pipelineDto) }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}

export async function POST(request: Request) {
  const g = await crmGuard('crm.pipelines.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, pipelineCreate, ctx)
  if (!b.ok) return b.res
  try {
    return await withIdempotency(request, ctx, 'pipelines.create', b.data, async () => {
      const pipeline = await crmTx((tx) => createPipeline(tx, ctx.auth.orgId, b.data))
      await audit(ctx.auth, { action: 'crm.pipeline_created', targetType: 'crm_pipeline', targetId: pipeline.id, targetLabel: pipeline.name, details: { stages: pipeline.stages.length } })
      return { status: 201, body: { pipeline: pipelineDto(pipeline) } }
    })
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
