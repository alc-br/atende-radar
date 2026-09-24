import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Catálogo público para a página de vendas: só o que é seguro mostrar (nada de ids de gateway nem de clientes).
export async function GET() {
  const plans = await db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
  return NextResponse.json({
    plans: plans.map((p) => ({
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
    })),
  })
}
