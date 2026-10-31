import { applyConversationOutcome } from '@/lib/conversation-outcome'
import { addDealEvent, type Actor, type Tx } from './deals'
import type { LOST_REASONS } from './schemas'

// CRM-07: ganho ou perda decidido por uma pessoa no negócio vale também para a conversa de origem, a oportunidade e a
// recuperação, pela mesma regra da tela da conversa (src/lib/conversation-outcome.ts). Corre na transação do fechamento.
// Não sobrescreve resultado que outra pessoa já deu na conversa: registra a divergência no histórico do negócio.
// Reabrir o negócio não reabre a conversa (a conversa encerrada por uma pessoa só reabre com mensagem nova).

export const LOST_REASON_LABEL: Record<(typeof LOST_REASONS)[number], string> = {
  price: 'Preço',
  no_response: 'Cliente parou de responder',
  competitor: 'Comprou com concorrente',
  no_stock: 'Sem estoque ou indisponível',
  timing: 'Não era o momento',
  not_qualified: 'Fora do perfil',
  other: 'Outro motivo',
}

export async function reflectDealOutcome(
  tx: Tx,
  deal: { id: string; organizationId: string; version: number; status: string; amountCents: number | null; lostReasonCode: string | null; outcomeNote: string | null },
  actor: Actor,
): Promise<{ reflected: number; kept: number }> {
  const out = { reflected: 0, kept: 0 }
  if (actor.origin === 'system' || (deal.status !== 'won' && deal.status !== 'lost')) return out
  const outcome = deal.status

  const links = await tx.crmBusinessLink.findMany({
    where: { organizationId: deal.organizationId, dealId: deal.id, relationshipType: { in: ['origin', 'opportunity'] }, conversationId: { not: null } },
    select: { conversationId: true, revenueOpportunityId: true },
  })
  const seen = new Set<string>()
  for (const link of links) {
    const conversationId = link.conversationId as string
    if (seen.has(conversationId)) continue
    seen.add(conversationId)
    const conv = await tx.conversation.findFirst({
      where: { id: conversationId, organizationId: deal.organizationId },
      select: { id: true, organizationId: true, operationalStatus: true, tags: true },
    })
    if (!conv || conv.operationalStatus === outcome) continue
    const human = await tx.classificationFeedback.findFirst({
      where: { organizationId: deal.organizationId, targetId: conv.id, targetType: 'outcome' },
      orderBy: { createdAt: 'desc' },
      select: { correctedValue: true },
    })
    if (human && human.correctedValue !== outcome) {
      out.kept++
      await addDealEvent(tx, deal, 'divergence', actor, { data: { conversation: human.correctedValue, deal: outcome, kept: 'conversation' } })
      continue
    }
    const reasonLabel = deal.lostReasonCode ? LOST_REASON_LABEL[deal.lostReasonCode as keyof typeof LOST_REASON_LABEL] : null
    await applyConversationOutcome(tx, conv, {
      outcome,
      value: outcome === 'won' && deal.amountCents !== null ? deal.amountCents / 100 : undefined,
      reason: [`Negócio ${outcome === 'won' ? 'ganho' : 'perdido'} no CRM`, reasonLabel, deal.outcomeNote].filter(Boolean).join(' · '),
      opportunityId: link.revenueOpportunityId ?? undefined,
    })
    out.reflected++
  }
  return out
}
