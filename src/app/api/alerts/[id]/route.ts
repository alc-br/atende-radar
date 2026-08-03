import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { assignedTo, status } = body as { assignedTo?: string; status?: string }

    const existing = await db.alert.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (assignedTo !== undefined) data.assignedTo = assignedTo
    if (status !== undefined) data.status = status

    const updated = await db.alert.update({ where: { id }, data })

    return NextResponse.json({ success: true, alert: updated })
  } catch (error) {
    console.error('Alert PUT error:', error)
    return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 })
  }
}
