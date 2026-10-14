import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard('notifications.view')
    if (!g.ok) return g.res
    const { id } = await params
    const j = await readJson(request)
    if (!j.ok) return j.res
    const body = j.body
    const { read } = body as { read?: boolean }

    const existing = await db.notification.findFirst({ where: { id, organizationId: g.auth.orgId } })
    if (!existing) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }

    const updated = await db.notification.update({
      where: { id },
      data: { read: read ?? !existing.read },
    })

    return NextResponse.json({ success: true, notification: updated })
  } catch (error) {
    console.error('Notification PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 })
  }
}
