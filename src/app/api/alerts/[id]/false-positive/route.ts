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
        status: 'false_positive',
        updatedAt: new Date(),
      },
    })

    // Also mark the related finding as false positive if exists
    if (alert.findingId) {
      await db.auditFinding.update({
        where: { id: alert.findingId },
        data: {
          falsePositive: true,
          status: 'resolved',
          resolvedAt: new Date(),
          resolutionReason: 'Marcado como falso positivo via alerta',
        },
      }).catch(() => {
        // finding might not exist, that's okay
      })
    }

    return NextResponse.json({ success: true, alert: updated })
  } catch (error) {
    console.error('Alert false-positive error:', error)
    return NextResponse.json({ error: 'Failed to mark alert as false positive' }, { status: 500 })
  }
}
