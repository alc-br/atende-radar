import { audit } from '@/lib/audit'
import { crmTx } from '@/lib/crm/deals'
import { pipelineDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { updatePipeline } from '@/lib/crm/pipelines'
import { pipelineUpdate } from '@/lib/crm/schemas'

// Renomeia, define como padrão ou desativa (não desativa o padrão nem funil com negócio aberto).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await crmGuard('crm.pipelines.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, pipelineUpdate, ctx)
  if (!b.ok) return b.res
  const { id } = await params
  try {
    const pipeline = await crmTx((tx) => updatePipeline(tx, ctx.auth.orgId, id, b.data))
    await audit(ctx.auth, {
      action: 'crm.pipeline_updated',
      targetType: 'crm_pipeline',
      targetId: pipeline.id,
      targetLabel: pipeline.name,
      details: { fields: Object.keys(b.data).filter((k) => k !== 'version'), status: pipeline.status, isDefault: pipeline.isDefault },
    })
    return crmJson({ pipeline: pipelineDto(pipeline) }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
