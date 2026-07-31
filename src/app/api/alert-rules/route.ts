import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

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
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body = await request.json()
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

    const rule = await db.alertRule.create({
      data: {
        organizationId: org.id,
        name,
        type,
        active: active ?? true,
        severity: severity ?? 'medium',
        notificationChannels: JSON.stringify(channels || ['in_app']),
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

    return NextResponse.json({ success: true, rule }, { status: 201 })
  } catch (error) {
    console.error('Alert rules POST error:', error)
    return NextResponse.json({ error: 'Failed to create alert rule' }, { status: 500 })
  }
}
