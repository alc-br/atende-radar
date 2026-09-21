import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params
    const g = await guard('reports.configure')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    const existing = await db.reportDefinition.findFirst({
      where: { organizationId: org.id, reportType: type },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Report definition not found' }, { status: 404 })
    }

    const body = await request.json()
    const { schedule, recipients } = body as { schedule?: string; recipients?: string[] }

    const data: Record<string, unknown> = {}
    if (schedule !== undefined) data.schedule = schedule
    if (recipients !== undefined) data.recipients = JSON.stringify(recipients)

    const updated = await db.reportDefinition.update({
      where: { id: existing.id },
      data,
    })

    return NextResponse.json({ success: true, definition: updated })
  } catch (error) {
    console.error('Report definition PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update report definition' }, { status: 500 })
  }
}
