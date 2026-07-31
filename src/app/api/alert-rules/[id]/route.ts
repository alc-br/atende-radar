import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const existing = await db.alertRule.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Alert rule not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = name
    if (type !== undefined) data.type = type
    if (active !== undefined) data.active = active
    if (severity !== undefined) data.severity = severity
    if (channels !== undefined) data.notificationChannels = JSON.stringify(channels)
    if (cooldownMinutes !== undefined) data.cooldownMinutes = cooldownMinutes
    if (limitMinutes !== undefined) data.limitMinutes = limitMinutes
    if (scopeConnections !== undefined) data.scopeConnections = JSON.stringify(scopeConnections)
    if (scopeTeams !== undefined) data.scopeTeams = JSON.stringify(scopeTeams)
    if (daysAndHours !== undefined) data.daysAndHours = JSON.stringify(daysAndHours)
    if (recipients !== undefined) data.recipients = JSON.stringify(recipients)
    if (autoCloseMinutes !== undefined) data.autoCloseMinutes = autoCloseMinutes
    if (exceptions !== undefined) data.exceptions = JSON.stringify(exceptions)
    if (minConfidence !== undefined) data.minConfidence = minConfidence

    const updated = await db.alertRule.update({
      where: { id },
      data,
    })

    return NextResponse.json({ success: true, rule: updated })
  } catch (error) {
    console.error('Alert rule update error:', error)
    return NextResponse.json({ error: 'Failed to update alert rule' }, { status: 500 })
  }
}
