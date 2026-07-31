import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH() {
  try {
    const org = await db.organization.findFirst()
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

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
