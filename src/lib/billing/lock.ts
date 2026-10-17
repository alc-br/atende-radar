import { db } from '../db'
import { effectiveStatus } from './core'
import { isDemoOrg } from '../sandbox'

// T11 · Bloqueio por falta de plano: teste grátis vencido sem contratação, ou assinatura encerrada (fim do período pago
// depois de cancelar a renovação). Com a empresa bloqueada:
//  · a interface mostra só Planos/Pagamento (e o Perfil, Ajuda e Sair);
//  · toda rota de API responde 402 (code subscription_locked), menos as liberadas com guard(..., { allowLocked: true });
//  · nada é analisado, nenhum alerta, relatório ou e-mail de operação sai.
// Os dados ficam guardados e as mensagens do WhatsApp continuam chegando: ao contratar, tudo volta como estava.
// Inadimplência (past_due) NÃO bloqueia: a operadora ainda tenta cobrar e a pessoa recebe o aviso para trocar o cartão.

export type LockReason = 'trial_expired' | 'canceled'

export interface OrgLock {
  reason: LockReason
  since: Date | null
}

/** Situação de bloqueio da empresa agora, ou null quando liberada (sem assinatura cadastrada ou demonstração: liberada). */
export async function orgLock(orgId: string, now = new Date()): Promise<OrgLock | null> {
  if (isDemoOrg(orgId)) return null
  const sub = await db.subscription.findUnique({
    where: { organizationId: orgId },
    select: { status: true, trialEnd: true, cancelAtPeriodEnd: true, currentPeriodEnd: true },
  })
  if (!sub) return null
  const status = effectiveStatus(sub, now)
  if (status === 'expired') return { reason: 'trial_expired', since: sub.trialEnd }
  if (status === 'canceled') return { reason: 'canceled', since: sub.currentPeriodEnd }
  return null
}

export const LOCKED_MESSAGE: Record<LockReason, string> = {
  trial_expired: 'O teste grátis desta empresa terminou. Contrate um plano para voltar a usar o AtendeRadar.',
  canceled: 'A assinatura desta empresa foi encerrada. Contrate um plano para voltar a usar o AtendeRadar.',
}
