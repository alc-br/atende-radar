import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { read } = body as { read?: boolean }

    const existing = await db.notification.findUnique({ where: { id } })
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
