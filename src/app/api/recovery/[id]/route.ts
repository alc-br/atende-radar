import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface PatchBody {
  status?: string
  assignedTo?: string
  attempts?: number
  outcome?: string
  recoveredValue?: number
  dueAt?: string
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = (await request.json()) as PatchBody

    const existing = await db.recoveryItem.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Recovery item not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = { updatedAt: new Date() }

    if (body.status) data.status = body.status
    if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo
    if (body.attempts !== undefined) data.attempts = body.attempts
    if (body.outcome !== undefined) data.outcome = body.outcome
    if (body.recoveredValue !== undefined) data.recoveredValue = body.recoveredValue
    if (body.dueAt !== undefined) data.dueAt = body.dueAt ? new Date(body.dueAt) : null

    // If status is completed, set completedAt
    if (body.status === 'recovered' || body.status === 'lost') {
      data.completedAt = new Date()
    }

    const updated = await db.recoveryItem.update({
      where: { id },
      data,
    })

    return NextResponse.json({ success: true, item: updated })
  } catch (error) {
    console.error('Recovery PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update recovery item' }, { status: 500 })
  }
}
