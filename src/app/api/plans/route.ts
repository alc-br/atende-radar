import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const plans = await db.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    })

    const formatted = plans.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      monthlyPrice: p.monthlyPrice,
      annualPrice: p.annualPrice,
      currency: p.currency,
      trialDays: p.trialDays,
      limits: {
        maxConnections: p.maxConnections,
        maxAgents: p.maxAgents,
        maxConversationsMonthly: p.maxConversationsMonthly,
        maxMessagesMonthly: p.maxMessagesMonthly,
        maxAudioMinutes: p.maxAudioMinutes,
        retentionDays: p.retentionDays,
        maxExports: p.maxExports,
        maxAlertRules: p.maxAlertRules,
      },
      features: JSON.parse(p.features || '{}') as Record<string, boolean | string | number>,
      highlight: p.highlight,
    }))

    // Feature comparison keys
    const allFeatures = new Set<string>()
    for (const p of formatted) {
      for (const key of Object.keys(p.features)) {
        allFeatures.add(key)
      }
    }

    return NextResponse.json({
      plans: formatted,
      featureKeys: Array.from(allFeatures),
    })
  } catch (error) {
    console.error('Plans GET error:', error)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}
