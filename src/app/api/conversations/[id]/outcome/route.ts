import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'
import { applyConversationOutcome } from '@/lib/conversation-outcome'

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
    const g = await guard('conversations.manage')
    if (!g.ok) return g.res
    const { id } = await params
    const j = await readJson<OutcomeBody>(request)
    if (!j.ok) return j.res
    const body = j.body
    const { outcome, value, reason } = body

    if (!outcome || !['won', 'lost'].includes(outcome)) {
      return NextResponse.json(
        { error: 'outcome must be "won" or "lost"' },
        { status: 400 }
      )
    }

    const conversation = await db.conversation.findFirst({
      where: { id, organizationId: g.auth.orgId },
      select: { id: true, organizationId: true, operationalStatus: true, tags: true },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // a mesma regra do CRM (fechar negócio ligado à conversa), numa transação: correção, conversa, oportunidade e
    // recuperação mudam juntas ou nenhuma muda
    const updated = await db.$transaction((tx) => applyConversationOutcome(tx, conversation, { outcome, value, reason }))

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
