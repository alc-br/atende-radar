import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const alert = await db.alert.findUnique({ where: { id } })
    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
    }

    const updated = await db.alert.update({
      where: { id },
      data: {
        status: 'acknowledged',
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true, alert: updated })
  } catch (error) {
    console.error('Alert acknowledge error:', error)
    return NextResponse.json({ error: 'Failed to acknowledge alert' }, { status: 500 })
  }
}
