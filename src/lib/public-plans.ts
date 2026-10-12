import { db } from '@/lib/db'

export interface PublicPlan {
  code: string
  name: string
  description: string | null
  monthlyPrice: number
  annualPrice: number
  currency: string
  trialDays: number
  highlight: boolean
  limits: { maxConnections: number; maxAgents: number; maxConversationsMonthly: number; retentionDays: number; maxAlertRules: number }
  features: Record<string, boolean>
}

// Catálogo público para a página de vendas: só o que é seguro mostrar (nada de ids de gateway nem de clientes).
export async function publicPlans(): Promise<PublicPlan[]> {
  const plans = await db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
  return plans.map((p) => ({
    code: p.code,
    name: p.name,
    description: p.description,
    monthlyPrice: p.monthlyPrice,
    annualPrice: p.annualPrice,
    currency: p.currency,
    trialDays: p.trialDays,
    highlight: p.highlight,
    limits: {
      maxConnections: p.maxConnections,
      maxAgents: p.maxAgents,
      maxConversationsMonthly: p.maxConversationsMonthly,
      retentionDays: p.retentionDays,
      maxAlertRules: p.maxAlertRules,
    },
    features: JSON.parse(p.features || '{}') as Record<string, boolean>,
  }))
}
