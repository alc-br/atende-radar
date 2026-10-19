import { db } from '../db'
import { usagePeriodStart } from '../quotas'
import { lockOf, type LockReason } from './core'
import { isDemoOrg } from '../sandbox'

// T11 · O que o plano libera para o motor de análise:
//  · empresa bloqueada (teste grátis vencido sem plano, assinatura encerrada ou pagamento em atraso há mais de 7 dias):
//    a análise PAUSA (nada é analisado nem gera alerta até contratar; em até 2 dias os números são desconectados).
//  · limite de conversas do mês (maxConversationsMonthly): as conversas que passaram do limite não são analisadas
//    (continuam guardadas). Quando o limite sobe (troca de plano), elas entram na próxima rodada.
// Sem assinatura cadastrada ou na empresa de demonstração não há limite. Cada situação vira UMA notificação (billing).

export type PauseReason = LockReason

export interface AnalysisGate {
  paused: PauseReason | null
  limit: number | null
  used: number // conversas abertas no mês
  skipped: Set<string> // conversas do mês acima do limite
}

const OPEN: AnalysisGate = { paused: null, limit: null, used: 0, skipped: new Set() }

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Só lê: situação da análise da empresa agora (usado pelo motor e pela tela Planos). */
export async function analysisGateStatus(orgId: string, now = new Date()): Promise<AnalysisGate & { since: Date | null; planName: string | null }> {
  // só a demonstração fica fora; a simulação passa pelo plano (é o que os cenários de teste vencido/cota testam)
  if (isDemoOrg(orgId)) return { ...OPEN, since: null, planName: null }
  const sub = await db.subscription.findUnique({ where: { organizationId: orgId }, include: { plan: { select: { name: true, maxConversationsMonthly: true } } } })
  if (!sub) return { ...OPEN, since: null, planName: null }

  const lock = lockOf(sub, now)
  if (lock) return { ...OPEN, paused: lock.reason, since: lock.since, planName: sub.plan.name }

  const limit = sub.plan.maxConversationsMonthly > 0 ? sub.plan.maxConversationsMonthly : null
  if (!limit) return { ...OPEN, since: null, planName: sub.plan.name }
  const where = { organizationId: orgId, createdAt: { gte: usagePeriodStart(now) } }
  const used = await db.conversation.count({ where })
  const over = used > limit
    ? await db.conversation.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: limit, select: { id: true } })
    : []
  return { paused: null, limit, used, skipped: new Set(over.map((c) => c.id)), since: null, planName: sub.plan.name }
}

const PAUSED_TEXT: Record<PauseReason, { title: string; lead: string; action: string }> = {
  trial_expired: { title: 'Teste grátis encerrado', lead: 'Seu teste grátis terminou', action: 'Contrate um plano em Planos para retomar.' },
  canceled: { title: 'Assinatura encerrada', lead: 'Sua assinatura foi encerrada', action: 'Contrate um plano em Planos para retomar.' },
  payment_overdue: { title: 'Pagamento em atraso', lead: 'O pagamento da assinatura está em atraso há mais de 7 dias', action: 'Troque o cartão ou contrate um plano em Planos para retomar.' },
}

/** Notificação de cobrança que sai uma vez só por chave (comparada pelo JSON). */
export async function notifyOnce(orgId: string, key: Record<string, string>, title: string, message: string) {
  const data = JSON.stringify(key) // mesma ordem de campos sempre: comparação exata
  const exists = await db.notification.findFirst({ where: { organizationId: orgId, type: 'billing', data }, select: { id: true } })
  if (exists) return
  await db.notification.create({ data: { organizationId: orgId, type: 'billing', title, message, data } })
}

/** Para o motor: a situação + o aviso ao dono (uma vez por situação). */
export async function analysisGate(orgId: string, now = new Date()): Promise<AnalysisGate> {
  const g = await analysisGateStatus(orgId, now)
  if (g.paused) {
    const what = PAUSED_TEXT[g.paused]
    await notifyOnce(
      orgId,
      { kind: 'analysis_paused', reason: g.paused, since: g.since?.toISOString() ?? '' },
      `${what.title}: análise pausada`,
      `${what.lead}. Nada é analisado e nenhum alerta é gerado. Para proteger a sua privacidade, os números de WhatsApp são desconectados em até 2 dias e as mensagens param de chegar. Seus dados ficam guardados e podem ser exportados. ${what.action}`,
    )
  } else if (g.limit && g.skipped.size > 0) {
    await notifyOnce(
      orgId,
      { kind: 'conversation_quota', period: monthKey(now) },
      'Limite de conversas do plano atingido',
      `O plano${g.planName ? ` ${g.planName}` : ''} analisa até ${g.limit} conversas por mês. As conversas novas continuam sendo recebidas, mas só serão analisadas quando o mês virar ou o plano mudar (em Planos).`,
    )
  }
  return { paused: g.paused, limit: g.limit, used: g.used, skipped: g.skipped }
}
