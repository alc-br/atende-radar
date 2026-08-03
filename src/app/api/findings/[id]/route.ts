import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { falsePositive, status } = body as { falsePositive?: boolean; status?: string }

    const existing = await db.auditFinding.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (falsePositive !== undefined) {
      data.falsePositive = falsePositive
      data.status = falsePositive ? 'dismissed' : existing.status
      data.resolutionReason = falsePositive ? 'false_positive' : existing.resolutionReason
      data.resolvedAt = falsePositive ? new Date() : existing.resolvedAt
    }
    if (status !== undefined) data.status = status

    const updated = await db.auditFinding.update({ where: { id }, data })

    return NextResponse.json({ success: true, finding: updated })
  } catch (error) {
    console.error('Finding PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update finding' }, { status: 500 })
  }
}
