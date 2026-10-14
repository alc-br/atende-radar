import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, alertScope } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard('alerts.manage')
    if (!g.ok) return g.res
    const { id } = await params
    const j = await readJson(request)
    if (!j.ok) return j.res
    const body = j.body
    const { reason } = body as { reason?: string }

    if (!reason || typeof reason !== 'string') {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }

    const alert = await db.alert.findFirst({ where: { id, ...alertScope(g.auth) } })
    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
    }

    const updated = await db.alert.update({
      where: { id },
      data: {
        status: 'dismissed',
        dismissedReason: reason,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true, alert: updated, reason })
  } catch (error) {
    console.error('Alert dismiss error:', error)
    return NextResponse.json({ error: 'Failed to dismiss alert' }, { status: 500 })
  }
}
