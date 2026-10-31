import { audit } from '@/lib/audit'
import { crmTx } from '@/lib/crm/deals'
import { pipelineDto } from '@/lib/crm/dto'
import { crmCatch, crmGuard, crmJson, parseBody } from '@/lib/crm/http'
import { updateStages } from '@/lib/crm/pipelines'
import { stagesUpdate } from '@/lib/crm/schemas'

// Lista completa e ordenada das etapas: cria, renomeia, reordena e tira do funil (só etapa sem negócio aberto).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await crmGuard('crm.pipelines.manage', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, stagesUpdate, ctx)
  if (!b.ok) return b.res
  const { id } = await params
  try {
    const pipeline = await crmTx((tx) => updateStages(tx, ctx.auth.orgId, id, b.data))
    await audit(ctx.auth, { action: 'crm.stages_updated', targetType: 'crm_pipeline', targetId: pipeline.id, targetLabel: pipeline.name, details: { stages: pipeline.stages.length } })
    return crmJson({ pipeline: pipelineDto(pipeline) }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
