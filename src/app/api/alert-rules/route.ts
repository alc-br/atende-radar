import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard } from '@/lib/api-auth'
import { enforceQuota } from '@/lib/quotas'
import { readJson } from '@/lib/json-body'
import { parseRuleChannels, RULE_CHANNELS_ERROR } from '@/lib/alert-channels'

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

    const overQuota = await enforceQuota(g.auth.orgId, 'alertRules')
    if (overQuota) return overQuota

    const j = await readJson(request)
    if (!j.ok) return j.res
    const body = j.body
    const {
      name,
      type,
      active,
      severity,
      channels,
      cooldownMinutes,
      limitMinutes,
      scopeConnections,
      scopeTeams,
      daysAndHours,
      recipients,
      autoCloseMinutes,
      exceptions,
      minConfidence,
    } = body as {
      name?: string
      type?: string
      active?: boolean
      severity?: string
      channels?: string[]
      cooldownMinutes?: number
      limitMinutes?: number
      scopeConnections?: string[]
      scopeTeams?: string[]
      daysAndHours?: Record<string, unknown>
      recipients?: string[]
      autoCloseMinutes?: number
      exceptions?: string[]
      minConfidence?: number
    }

    if (!name || !type) {
      return NextResponse.json(
        { error: 'name and type are required' },
        { status: 400 }
      )
    }

    // canais: só os que o motor entende (in_app, email); sem a lista, só no sistema
    const parsedChannels = channels === undefined ? ['in_app'] : parseRuleChannels(channels)
    if (!parsedChannels) return NextResponse.json({ error: RULE_CHANNELS_ERROR, code: 'invalid_channels' }, { status: 400 })

    const rule = await db.alertRule.create({
      data: {
        organizationId: org.id,
        name,
        type,
        active: active ?? true,
        severity: severity ?? 'medium',
        notificationChannels: JSON.stringify(parsedChannels),
        cooldownMinutes: cooldownMinutes ?? 30,
        limitMinutes: limitMinutes ?? null,
        scopeConnections: JSON.stringify(scopeConnections || []),
        scopeTeams: JSON.stringify(scopeTeams || []),
        daysAndHours: JSON.stringify(daysAndHours || {}),
        recipients: JSON.stringify(recipients || []),
        autoCloseMinutes: autoCloseMinutes ?? null,
        exceptions: JSON.stringify(exceptions || []),
        minConfidence: minConfidence ?? 0.5,
      },
    })

    await audit(g.auth, { action: 'alert_rule.created', targetType: 'alert_rule', targetId: rule.id, targetLabel: rule.name, details: { type: rule.type, severity: rule.severity, limitMinutes: rule.limitMinutes, channels: parsedChannels } })
    return NextResponse.json({ success: true, rule }, { status: 201 })
  } catch (error) {
    console.error('Alert rules POST error:', error)
    return NextResponse.json({ error: 'Failed to create alert rule' }, { status: 500 })
  }
}
