import type { Prisma, PrismaClient } from '@prisma/client'

// Resultado (venda ou perda) decidido por uma pessoa numa conversa. Uma regra só para a tela da conversa
// (POST /api/conversations/:id/outcome) e para o CRM (fechar negócio ligado à conversa, CRM-07).

type Client = PrismaClient | Prisma.TransactionClient

export interface ConversationOutcome {
  outcome: 'won' | 'lost'
  /** Valor da venda em reais (o legado guarda Float). */
  value?: number
  reason?: string
  /** Oportunidade a fechar. Sem ela, a mais recente da conversa. */
  opportunityId?: string
}

export async function applyConversationOutcome(
  client: Client,
  conversation: { id: string; organizationId: string; operationalStatus: string; tags: string | null },
  { outcome, value, reason, opportunityId }: ConversationOutcome,
) {
  const now = new Date()
  const note = typeof reason === 'string' ? reason.slice(0, 500) : ''

  // B6: o resultado dado por uma pessoa fica registrado como correção: a reanálise nunca o desfaz (nem venda/perda
  // automática, nem abandono) e mensagem nova depois dele abre outra conversa em vez de reabrir esta.
  await client.classificationFeedback.create({
    data: {
      organizationId: conversation.organizationId, targetId: conversation.id, targetType: 'outcome',
      previousValue: conversation.operationalStatus, correctedValue: outcome, justification: note,
    },
  })
  const tags = (() => { try { return JSON.parse(conversation.tags || '[]') as string[] } catch { return [] } })()

  const updated = await client.conversation.update({
    where: { id: conversation.id },
    data: {
      tags: JSON.stringify(tags.filter((t) => t !== 'abandono')), // decisão humana, não mais "perda por abandono"
      waitingSince: null,
      operationalStatus: outcome,
      closedAt: now,
      updatedAt: now,
      needsAnalysisAt: now,
    },
  })

  const opp = opportunityId
    ? await client.revenueOpportunity.findFirst({ where: { id: opportunityId, conversationId: conversation.id }, select: { id: true } })
    : await client.revenueOpportunity.findFirst({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'desc' }, select: { id: true } })
  if (opp) {
    await client.revenueOpportunity.update({
      where: { id: opp.id },
      data: { status: outcome, ...(outcome === 'won' && value !== undefined ? { confirmedSaleValue: value } : {}) },
    })
  }

  // Fila de Recuperação acompanha a decisão: venda → recuperado; perda → perdido
  await client.recoveryItem.updateMany({
    where: { conversationId: conversation.id, organizationId: conversation.organizationId, status: { notIn: ['recovered', 'lost'] } },
    data: { status: outcome === 'won' ? 'recovered' : 'lost', outcome: note || 'Resultado marcado na conversa', completedAt: now },
  })

  return updated
}
