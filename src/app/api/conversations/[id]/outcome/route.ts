import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'

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
      include: { opportunities: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const now = new Date()

    // B6: o resultado dado por uma pessoa fica registrado como correção: a reanálise nunca o desfaz (nem venda/perda
    // automática, nem abandono) e mensagem nova depois dele abre outra conversa em vez de reabrir esta.
    await db.classificationFeedback.create({
      data: {
        organizationId: conversation.organizationId, targetId: id, targetType: 'outcome',
        previousValue: conversation.operationalStatus, correctedValue: outcome, justification: typeof reason === 'string' ? reason.slice(0, 500) : '',
      },
    })
    const tags = (() => { try { return JSON.parse(conversation.tags || '[]') as string[] } catch { return [] } })()

    // Update conversation status
    const updated = await db.conversation.update({
      where: { id },
      data: {
        tags: JSON.stringify(tags.filter((t) => t !== 'abandono')), // decisão humana, não mais "perda por abandono"
        waitingSince: null,
        operationalStatus: outcome,
        closedAt: now,
        updatedAt: now,
        needsAnalysisAt: now,
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

    // Fila de Recuperação acompanha a decisão: venda → recuperado; perda → perdido
    await db.recoveryItem.updateMany({
      where: { conversationId: id, organizationId: conversation.organizationId, status: { notIn: ['recovered', 'lost'] } },
      data: { status: outcome === 'won' ? 'recovered' : 'lost', outcome: typeof reason === 'string' && reason ? reason.slice(0, 500) : 'Resultado marcado na conversa', completedAt: now },
    })

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
