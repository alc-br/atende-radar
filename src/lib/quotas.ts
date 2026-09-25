import { NextResponse } from 'next/server'
import { db } from './db'

export type QuotaKind = 'connections' | 'agents' | 'alertRules'

const LABEL: Record<QuotaKind, string> = {
  connections: 'conexões de WhatsApp',
  agents: 'atendentes',
  alertRules: 'regras de alerta',
}

/**
 * Confere o limite do plano antes de CRIAR algo. Devolve a resposta 402 se estourou (ou null se pode criar).
 * A organização de demonstração fica fora (seus dados são fixos). Sem assinatura cadastrada = sem limite.
 */
export async function enforceQuota(orgId: string, kind: QuotaKind): Promise<NextResponse | null> {
  if (orgId === (process.env.DEMO_ORG_ID || 'org_seed_1')) return null
  const sub = await db.subscription.findUnique({ where: { organizationId: orgId }, include: { plan: true } })
  if (!sub) return null

  if (!['active', 'trialing'].includes(sub.status)) {
    return NextResponse.json(
      { error: 'A assinatura desta empresa não está ativa. Contrate um plano para continuar cadastrando.', code: 'subscription_inactive' },
      { status: 402 }
    )
  }

  const limit = kind === 'connections' ? sub.plan.maxConnections : kind === 'agents' ? sub.plan.maxAgents : sub.plan.maxAlertRules
  const used =
    kind === 'connections'
      ? await db.whatsAppConnection.count({ where: { organizationId: orgId } })
      : kind === 'agents'
        ? await db.agent.count({ where: { organizationId: orgId, status: 'active' } })
        : await db.alertRule.count({ where: { organizationId: orgId } })

  if (used >= limit) {
    return NextResponse.json(
      {
        error: `O plano ${sub.plan.name} permite até ${limit} ${LABEL[kind]} e você já usa ${used}. Peça a troca de plano para cadastrar mais.`,
        code: 'quota_exceeded',
        limit,
        used,
      },
      { status: 402 }
    )
  }
  return null
}
