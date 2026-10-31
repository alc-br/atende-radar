import { db } from '@/lib/db'
import { setCrmFlag } from './flags'

// Provisionamento do CRM por empresa (CRM-00, ADR-001). Idempotente: rodar de novo não duplica funil nem etapas.
// Ligar o CRM provisiona; desligar só apaga a flag (os dados ficam, e voltam quando religar).

/** Funil padrão (CRM-02). Ganho e perdido são status do negócio, não etapas. */
export const DEFAULT_PIPELINE = {
  name: 'Funil comercial',
  stages: [
    { name: 'Novo interesse', probability: 10 },
    { name: 'Qualificação', probability: 25 },
    { name: 'Proposta/orçamento', probability: 50 },
    { name: 'Negociação', probability: 70 },
    { name: 'Aguardando cliente', probability: 80 },
  ],
} as const

export const PROVISIONING_VERSION = 1

/** Cria o vínculo do tenant e o funil padrão, se faltarem. Devolve o id do funil padrão. */
export async function provisionCrmTenant(organizationId: string): Promise<{ pipelineId: string; created: boolean }> {
  return db.$transaction(async (tx) => {
    // a escrita vem primeiro: no SQLite ela pega o lock de escrita, então duas chamadas simultâneas não criam dois funis
    await tx.crmTenantLink.upsert({
      where: { organizationId },
      create: { organizationId, provider: 'native', status: 'active', provisioningVersion: PROVISIONING_VERSION, lastHealthyAt: new Date() },
      update: { status: 'active', provisioningVersion: PROVISIONING_VERSION, lastHealthyAt: new Date(), lastErrorCode: null },
    })
    const existing = await tx.crmPipeline.findFirst({
      where: { organizationId, status: 'active' },
      orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
      select: { id: true },
    })
    if (existing) return { pipelineId: existing.id, created: false }
    const pipeline = await tx.crmPipeline.create({
      data: {
        organizationId,
        name: DEFAULT_PIPELINE.name,
        isDefault: true,
        position: 0,
        stages: { create: DEFAULT_PIPELINE.stages.map((s, i) => ({ organizationId, name: s.name, probability: s.probability, position: i })) },
      },
      select: { id: true },
    })
    return { pipelineId: pipeline.id, created: true }
  })
}

/** Liga ou desliga o CRM da empresa (só o operador da plataforma, na rota de admin). */
export async function setCrmEnabled(organizationId: string, enabled: boolean, updatedBy: string) {
  if (enabled) await provisionCrmTenant(organizationId)
  await setCrmFlag(organizationId, 'crm.enabled', enabled, updatedBy)
  if (!enabled) {
    await db.crmTenantLink.updateMany({ where: { organizationId }, data: { status: 'disabled' } })
  }
}

/** Funil padrão da empresa (o primeiro ativo, se nenhum estiver marcado). */
export async function defaultPipeline(organizationId: string) {
  return db.crmPipeline.findFirst({
    where: { organizationId, status: 'active' },
    orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
    include: { stages: { where: { status: 'active' }, orderBy: { position: 'asc' } } },
  })
}
