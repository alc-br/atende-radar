import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard('conversations.manage')
    if (!g.ok) return g.res
    const { id } = await params
    const body = await request.json()
    const { status } = body as { status?: string }

    const existing = await db.openQuestion.findFirst({ where: { id, conversation: { organizationId: g.auth.orgId } } })
    if (!existing) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    const updated = await db.openQuestion.update({
      where: { id },
      data: { status: status ?? 'answered' },
    })

    return NextResponse.json({ success: true, question: updated })
  } catch (error) {
    console.error('Open question PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update question' }, { status: 500 })
  }
}
