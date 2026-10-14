import { NextResponse } from 'next/server'
import { db } from './db'
import { DEFAULT_RULE_NAMES } from './org-defaults'
import { effectiveStatus, isActiveStatus } from './billing/core'

export type QuotaKind = 'connections' | 'agents' | 'alertRules'

const LABEL: Record<QuotaKind, string> = {
  connections: 'conexões de WhatsApp',
  agents: 'atendentes',
  alertRules: 'regras de alerta próprias (além das regras padrão do produto)',
}

const isDemoOrg = (orgId: string) => orgId === (process.env.DEMO_ORG_ID || 'org_seed_1')

/** Ação de auditoria que conta como uma exportação na cota do plano (maxExports). */
export const EXPORT_ACTION = 'report.exported'

/** Início do período de uso das cotas mensais (conversas, mensagens, exportações): dia 1º do mês, 00:00. */
export function usagePeriodStart(now = new Date()): Date {
  const d = new Date(now)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Exportações feitas no mês corrente (CSV/JSON de indicadores e CSV de relatórios), lidas do registro de auditoria. */
export function countExports(orgId: string, now = new Date()): Promise<number> {
  return db.auditLog.count({ where: { organizationId: orgId, action: EXPORT_ACTION, createdAt: { gte: usagePeriodStart(now) } } })
}

/** Uso que os limites "fixos" do plano medem (o mesmo que enforceQuota conta). As 8 regras padrão não contam. */
export async function currentUsage(orgId: string): Promise<Record<QuotaKind, number>> {
  const [connections, agents, alertRules] = await Promise.all([
    db.whatsAppConnection.count({ where: { organizationId: orgId } }),
    db.agent.count({ where: { organizationId: orgId, status: 'active' } }),
    db.alertRule.count({ where: { organizationId: orgId, name: { notIn: DEFAULT_RULE_NAMES } } }),
  ])
  return { connections, agents, alertRules }
}

/**
 * Confere o limite do plano antes de CRIAR algo. Devolve a resposta 402 se estourou (ou null se pode criar).
 * A organização de demonstração fica fora (seus dados são fixos). Sem assinatura cadastrada = sem limite.
 */
export async function enforceQuota(orgId: string, kind: QuotaKind): Promise<NextResponse | null> {
  if (isDemoOrg(orgId)) return null
  const sub = await db.subscription.findUnique({ where: { organizationId: orgId }, include: { plan: true } })
  if (!sub) return null

  if (!isActiveStatus(effectiveStatus(sub))) {
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
        : await db.alertRule.count({ where: { organizationId: orgId, name: { notIn: DEFAULT_RULE_NAMES } } }) // as padrão não contam

  if (used >= limit) {
    return NextResponse.json(
      {
        error: `O plano ${sub.plan.name} permite até ${limit} ${LABEL[kind]} e você já usa ${used}. Troque de plano em Planos para cadastrar mais.`,
        code: 'quota_exceeded',
        limit,
        used,
      },
      { status: 402 }
    )
  }
  return null
}

/**
 * Cota de exportações por mês (maxExports). Chamada ANTES de exportar; cada exportação conta quando é registrada na
 * auditoria (EXPORT_ACTION). A contagem volta a zero no dia 1º. Limite nulo = sem limite. Exportar não exige
 * assinatura ativa (a empresa pode levar os próprios dados), só respeita a cota do plano.
 */
export async function enforceExportQuota(orgId: string): Promise<NextResponse | null> {
  if (isDemoOrg(orgId)) return null
  const sub = await db.subscription.findUnique({ where: { organizationId: orgId }, include: { plan: true } })
  const limit = (sub?.plan.maxExports ?? null) as number | null
  if (!sub || limit === null || limit === undefined) return null
  const used = await countExports(orgId)
  if (used >= limit) {
    return NextResponse.json(
      {
        error: `O plano ${sub.plan.name} permite até ${limit} exportações por mês e você já fez ${used}. A contagem recomeça no dia 1º; troque de plano em Planos para exportar mais.`,
        code: 'quota_exceeded',
        limit,
        used,
      },
      { status: 402 }
    )
  }
  return null
}

// ── troca de plano (V7/T11) ──────────────────────────────────────────────────────────────────────────────────────────

const OVER_LABEL: Record<QuotaKind, string> = {
  connections: 'conexões de WhatsApp',
  agents: 'atendentes ativos',
  alertRules: 'regras de alerta próprias',
}

export interface PlanOverage {
  kind: QuotaKind
  used: number
  limit: number
}

type PlanLimits = { maxConnections: number; maxAgents: number; maxAlertRules: number }

/**
 * O que o uso atual da empresa passa dos limites de outro plano (vazio = cabe). Só os limites fixos contam:
 * conversas/mensagens são limite "suave" e exportações recomeçam todo mês.
 */
export async function planOverage(orgId: string, plan: PlanLimits): Promise<PlanOverage[]> {
  const usage = await currentUsage(orgId)
  const limits: Record<QuotaKind, number | null | undefined> = { connections: plan.maxConnections, agents: plan.maxAgents, alertRules: plan.maxAlertRules }
  return (Object.keys(limits) as QuotaKind[])
    .filter((k) => limits[k] !== null && limits[k] !== undefined && usage[k] > (limits[k] as number))
    .map((k) => ({ kind: k, used: usage[k], limit: limits[k] as number }))
}

/** "Você tem 6 atendentes ativos; o plano Essencial permite 3. …". applied = a troca já foi feita (operador). */
export function overageMessage(planName: string, over: PlanOverage[], opts: { applied?: boolean } = {}): string {
  const items = over.map((o) => `Você tem ${o.used} ${OVER_LABEL[o.kind]}; o plano ${planName} permite ${o.limit}.`)
  if (opts.applied) {
    const facts = over.map((o) => `${o.used} ${OVER_LABEL[o.kind]} (o plano permite ${o.limit})`)
    return `Plano ${planName} aplicado, mas a empresa passa dos limites: ${facts.join('; ')}. Novos cadastros ficam bloqueados até ela reduzir o uso.`
  }
  return `${items.join(' ')} Remova o excedente antes de trocar para o plano ${planName}.`
}
