import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface OutcomeBody {
  outcome: 'won' | 'lost'
  value?: number
  reason?: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = (await request.json()) as OutcomeBody
    const { outcome, value, reason } = body

    if (!outcome || !['won', 'lost'].includes(outcome)) {
      return NextResponse.json(
        { error: 'outcome must be "won" or "lost"' },
        { status: 400 }
      )
    }

    const conversation = await db.conversation.findUnique({
      where: { id },
      include: { opportunities: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const now = new Date()

    // Update conversation status
    const updated = await db.conversation.update({
      where: { id },
      data: {
        operationalStatus: outcome,
        closedAt: now,
        updatedAt: now,
      },
    })

    // Update the primary opportunity if it exists
    if (conversation.opportunities.length > 0) {
      const opp = conversation.opportunities[0]
      const updateData: Record<string, unknown> = { status: outcome }

      if (outcome === 'won' && value !== undefined) {
        updateData.confirmedSaleValue = value
      }
      if (outcome === 'won') {
        updateData.status = 'won'
      } else if (outcome === 'lost') {
        updateData.status = 'lost'
      }

      await db.revenueOpportunity.update({
        where: { id: opp.id },
        data: updateData,
      })
    }

    return NextResponse.json({
      success: true,
      conversation: updated,
      outcome,
      value,
      reason,
    })
  } catch (error) {
    console.error('Conversation outcome error:', error)
    return NextResponse.json(
      { error: 'Failed to update conversation outcome' },
      { status: 500 }
    )
  }
}
