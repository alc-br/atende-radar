import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'

export async function PATCH() {
  try {
    const g = await guard('notifications.view')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    const result = await db.notification.updateMany({
      where: { organizationId: org.id, read: false },
      data: { read: true },
    })

    return NextResponse.json({ success: true, markedAsRead: result.count })
  } catch (error) {
    console.error('Notifications read-all error:', error)
    return NextResponse.json({ error: 'Failed to mark notifications as read' }, { status: 500 })
  }
}
