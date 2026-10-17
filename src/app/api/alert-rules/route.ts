import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard } from '@/lib/api-auth'
import { createAlertRule, type RuleInput } from '@/lib/alert-rules'
import { readJson } from '@/lib/json-body'

export async function GET() {
  try {
    const g = await guard('alert_rules.view')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    const rules = await db.alertRule.findMany({
      where: { organizationId: org.id },
      orderBy: { name: 'asc' },
    })

    const formatted = rules.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      active: r.active,
      severity: r.severity,
      channels: JSON.parse(r.notificationChannels || '["in_app"]') as string[],
      cooldownMinutes: r.cooldownMinutes,
      limitMinutes: r.limitMinutes,
      scopeConnections: JSON.parse(r.scopeConnections || '[]') as string[],
      scopeTeams: JSON.parse(r.scopeTeams || '[]') as string[],
      daysAndHours: JSON.parse(r.daysAndHours || '{}') as Record<string, unknown>,
      recipients: JSON.parse(r.recipients || '[]') as string[],
      autoCloseMinutes: r.autoCloseMinutes,
      exceptions: JSON.parse(r.exceptions || '[]') as string[],
      minConfidence: r.minConfidence,
    }))

    return NextResponse.json({ rules: formatted })
  } catch (error) {
    console.error('Alert rules GET error:', error)
    return NextResponse.json({ error: 'Failed to load alert rules' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const g = await guard('alert_rules.manage')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    const j = await readJson(request)
    if (!j.ok) return j.res
    // mesma validação do simulador (src/lib/alert-rules.ts): cota do plano, tipo conhecido, nome único e prazo do tipo
    const r = await createAlertRule(org.id, j.body as RuleInput)
    if (!r.ok) return NextResponse.json({ ...(r.extra ?? {}), error: r.error, code: r.code }, { status: r.status })
    const rule = r.rule

    await audit(g.auth, { action: 'alert_rule.created', targetType: 'alert_rule', targetId: rule.id, targetLabel: rule.name, details: { type: rule.type, severity: rule.severity, limitMinutes: rule.limitMinutes, channels: JSON.parse(rule.notificationChannels) as string[] } })
    return NextResponse.json({ success: true, rule }, { status: 201 })
  } catch (error) {
    console.error('Alert rules POST error:', error)
    return NextResponse.json({ error: 'Failed to create alert rule' }, { status: 500 })
  }
}
