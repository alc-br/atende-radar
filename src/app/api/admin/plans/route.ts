import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, isPlatformOperator } from '@/lib/api-auth'

// Admin › Planos (V7): catálogo completo, inclusive planos desativados, para o operador da plataforma editar.
export async function GET() {
  const g = await guard()
  if (!g.ok) return g.res
  if (!isPlatformOperator(g.auth.email)) return NextResponse.json({ error: 'Sem permissão para esta ação' }, { status: 403 })

  const [plans, subs] = await Promise.all([
    db.plan.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.subscription.groupBy({ by: ['planId'], _count: { _all: true } }),
  ])
  const subscribers = new Map(subs.map((s) => [s.planId, s._count._all]))
  return NextResponse.json({
    plans: plans.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      monthlyPrice: p.monthlyPrice,
      annualPrice: p.annualPrice,
      active: p.active,
      highlight: p.highlight,
      features: JSON.parse(p.features || '{}') as Record<string, boolean>,
      limits: {
        maxConnections: p.maxConnections,
        maxAgents: p.maxAgents,
        maxConversationsMonthly: p.maxConversationsMonthly,
        maxMessagesMonthly: p.maxMessagesMonthly,
        maxAlertRules: p.maxAlertRules,
        maxExports: p.maxExports,
        retentionDays: p.retentionDays,
      },
      subscribers: subscribers.get(p.id) ?? 0,
    })),
  })
}
