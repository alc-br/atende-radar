import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, alertScope } from '@/lib/api-auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard('alerts.manage')
    if (!g.ok) return g.res
    const { id } = await params

    const alert = await db.alert.findFirst({ where: { id, ...alertScope(g.auth) } })
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
