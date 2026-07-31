import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { reason } = body as { reason?: string }

    if (!reason || typeof reason !== 'string') {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }

    const alert = await db.alert.findUnique({ where: { id } })
    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
    }

    const updated = await db.alert.update({
      where: { id },
      data: {
        status: 'resolved',
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true, alert: updated, reason })
  } catch (error) {
    console.error('Alert resolve error:', error)
    return NextResponse.json({ error: 'Failed to resolve alert' }, { status: 500 })
  }
}
