import type { Prisma, PrismaClient } from '@prisma/client'
import { DomainError, type Tx } from './deals'
import { cleanText } from './text'

// Funis e etapas (CRM-02), só admin e gestor. Etapa nunca é apagada: sai do funil como "inactive", e só quando não
// tem negócio aberto (o histórico continua apontando para ela). As etapas ativas ficam com posições 0..n-1 na ordem
// enviada: o consumidor procura a etapa-alvo pela posição (consumer.ts STAGE_TARGET_POSITION).

type Client = PrismaClient | Prisma.TransactionClient

export interface StageInput {
  id?: string
  name: string
  probability?: number
  slaDays?: number | null
}

const notFound = () => new DomainError(404, 'crm_not_found', 'Funil não encontrado.')
const invalid = (msg: string) => new DomainError(409, 'crm_invalid_transition', msg)

export async function listPipelines(client: Client, organizationId: string, opts: { includeInactive?: boolean } = {}) {
  return client.crmPipeline.findMany({
    where: { organizationId, ...(opts.includeInactive ? {} : { status: 'active' }) },
    orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
    include: { stages: { where: opts.includeInactive ? {} : { status: 'active' }, orderBy: { position: 'asc' } } },
  })
}

async function loadPipeline(tx: Tx, organizationId: string, id: string, version: number) {
  const p = await tx.crmPipeline.findFirst({ where: { id, organizationId } })
  if (!p) throw notFound()
  if (p.version !== version) throw new DomainError(409, 'crm_version_conflict', 'Este funil foi alterado por outra pessoa. Recarregue e tente de novo.', { currentVersion: p.version })
  return p
}

async function bumpPipeline(tx: Tx, p: { id: string; version: number }, data: Prisma.CrmPipelineUpdateManyMutationInput = {}) {
  const r = await tx.crmPipeline.updateMany({ where: { id: p.id, version: p.version }, data: { ...data, version: { increment: 1 } } })
  if (!r.count) {
    const now = await tx.crmPipeline.findUnique({ where: { id: p.id }, select: { version: true } })
    throw new DomainError(409, 'crm_version_conflict', 'Este funil foi alterado por outra pessoa. Recarregue e tente de novo.', { currentVersion: now?.version ?? p.version })
  }
}

const stageData = (s: StageInput, position: number) => ({
  name: cleanText(s.name, 60),
  probability: s.probability ?? 0,
  slaDays: s.slaDays ?? null,
  position,
  status: 'active',
})

export async function createPipeline(tx: Tx, organizationId: string, input: { name: string; stages: StageInput[] }) {
  const last = await tx.crmPipeline.findFirst({ where: { organizationId }, orderBy: { position: 'desc' }, select: { position: true } })
  const hasDefault = await tx.crmPipeline.findFirst({ where: { organizationId, status: 'active', isDefault: true }, select: { id: true } })
  const p = await tx.crmPipeline.create({
    data: { organizationId, name: cleanText(input.name, 60), isDefault: !hasDefault, position: (last?.position ?? -1) + 1 },
  })
  await tx.crmStage.createMany({ data: input.stages.map((s, i) => ({ organizationId, pipelineId: p.id, ...stageData(s, i) })) })
  return tx.crmPipeline.findUniqueOrThrow({ where: { id: p.id }, include: { stages: { orderBy: { position: 'asc' } } } })
}

export async function updatePipeline(tx: Tx, organizationId: string, id: string, input: { version: number; name?: string; isDefault?: true; active?: boolean }) {
  const p = await loadPipeline(tx, organizationId, id, input.version)
  const data: Prisma.CrmPipelineUpdateManyMutationInput = {}
  if (input.name !== undefined) data.name = cleanText(input.name, 60)
  if (input.active === false && p.status === 'active') {
    if (p.isDefault) throw invalid('Escolha outro funil como padrão antes de desativar este.')
    const open = await tx.crmDeal.count({ where: { organizationId, pipelineId: p.id, status: 'open' } })
    if (open) throw invalid(`O funil tem ${open} negócio(s) aberto(s). Feche ou mova os negócios antes de desativar.`)
    data.status = 'inactive'
  }
  if (input.active === true && p.status !== 'active') data.status = 'active'
  if (input.isDefault && !p.isDefault) {
    if ((data.status ?? p.status) !== 'active') throw invalid('Só um funil ativo pode ser o padrão.')
    await tx.crmPipeline.updateMany({ where: { organizationId, isDefault: true, id: { not: p.id } }, data: { isDefault: false } })
    data.isDefault = true
  }
  if (!Object.keys(data).length) return tx.crmPipeline.findUniqueOrThrow({ where: { id: p.id }, include: { stages: { orderBy: { position: 'asc' } } } })
  await bumpPipeline(tx, p, data)
  return tx.crmPipeline.findUniqueOrThrow({ where: { id: p.id }, include: { stages: { orderBy: { position: 'asc' } } } })
}

/** Lista completa e ordenada das etapas ativas: com id edita ou reordena, sem id cria, ausente é desativada. */
export async function updateStages(tx: Tx, organizationId: string, pipelineId: string, input: { version: number; stages: StageInput[] }) {
  const p = await loadPipeline(tx, organizationId, pipelineId, input.version)
  const current = await tx.crmStage.findMany({ where: { pipelineId: p.id } })
  const byId = new Map(current.map((s) => [s.id, s]))
  const sent = input.stages.filter((s) => s.id).map((s) => s.id as string)
  if (new Set(sent).size !== sent.length) throw new DomainError(400, 'crm_invalid', 'A mesma etapa aparece duas vezes.')
  for (const sid of sent) if (!byId.has(sid)) throw new DomainError(400, 'crm_invalid', 'Etapa de outro funil ou inexistente.')

  const removed = current.filter((s) => s.status === 'active' && !sent.includes(s.id))
  for (const s of removed) {
    const open = await tx.crmDeal.count({ where: { organizationId, stageId: s.id, status: 'open' } })
    if (open) throw invalid(`A etapa "${s.name}" tem ${open} negócio(s) aberto(s). Mova os negócios antes de tirá-la do funil.`)
  }
  // fora do caminho primeiro: inativas vão para o fim, sem disputar posição com as ativas
  for (const [i, s] of removed.entries()) await tx.crmStage.update({ where: { id: s.id }, data: { status: 'inactive', position: 1000 + i } })
  for (const [i, s] of input.stages.entries()) {
    if (s.id) await tx.crmStage.update({ where: { id: s.id }, data: stageData(s, i) })
    else await tx.crmStage.create({ data: { organizationId, pipelineId: p.id, ...stageData(s, i) } })
  }
  await bumpPipeline(tx, p)
  return tx.crmPipeline.findUniqueOrThrow({ where: { id: p.id }, include: { stages: { where: { status: 'active' }, orderBy: { position: 'asc' } } } })
}
