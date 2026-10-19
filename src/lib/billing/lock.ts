import { db } from '../db'
import { lockOf, type LockReason } from './core'
import { isDemoOrg } from '../sandbox'

// T11 · Bloqueio por falta de plano: teste grátis vencido sem contratação, assinatura encerrada (fim do período pago
// depois de cancelar a renovação) ou renovação sem pagamento há mais de 7 dias (PAST_DUE_GRACE_DAYS). Com a empresa
// bloqueada:
//  · a interface mostra só Planos/Pagamento (e o Perfil, Ajuda, a exportação dos dados e Sair);
//  · toda rota de API responde 402 (code subscription_locked), menos as liberadas com guard(..., { allowLocked: true });
//  · nada é analisado, nenhum alerta, relatório ou e-mail de operação sai;
//  · em até 2 dias (LOCKED_DISCONNECT_DAYS) os números de WhatsApp são desconectados (privacidade: as mensagens param de
//    chegar). Ver ./delinquency.ts.
// Os dados ficam guardados e podem ser exportados (GET /api/organization/export). Ao contratar, tudo volta (os números
// precisam ler o QR de novo).
// Dentro da tolerância da inadimplência (past_due) NÃO bloqueia: tudo funciona e a pessoa recebe avisos para trocar o cartão.

export type { LockReason }

export interface OrgLock {
  reason: LockReason
  since: Date | null
}

/** Situação de bloqueio da empresa agora, ou null quando liberada (sem assinatura cadastrada ou demonstração: liberada). */
export async function orgLock(orgId: string, now = new Date()): Promise<OrgLock | null> {
  if (isDemoOrg(orgId)) return null
  const sub = await db.subscription.findUnique({
    where: { organizationId: orgId },
    select: { status: true, trialEnd: true, cancelAtPeriodEnd: true, currentPeriodEnd: true, pastDueSince: true },
  })
  if (!sub) return null
  return lockOf(sub, now)
}

export const LOCKED_MESSAGE: Record<LockReason, string> = {
  trial_expired: 'O teste grátis desta empresa terminou. Contrate um plano para voltar a usar o AtendeRadar.',
  canceled: 'A assinatura desta empresa foi encerrada. Contrate um plano para voltar a usar o AtendeRadar.',
  payment_overdue: 'O pagamento da assinatura desta empresa está em atraso há mais de 7 dias. Troque o cartão ou contrate um plano para voltar a usar o AtendeRadar.',
}
