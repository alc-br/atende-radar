import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { REAL_ORGS, SIMULATOR_PROVIDER, isIsolatedOrg } from '@/lib/sandbox'
import { LOCKED_DISCONNECT_DAYS, PAST_DUE_GRACE_DAYS, graceEndsAt, lockOf } from './core'
import { billingEmail, numbersDisconnectedEmail, pastDueLockedEmail, pastDueReminderEmail, whenText } from './emails'
import { notifyOnce } from './analysis-gate'

// Inadimplência e empresa bloqueada (o agendador interno chama a cada minuto; os testes, POST /api/gateway/tick com
// { delinquencyAt }):
//  · renovação sem pagamento (past_due): 7 dias de tolerância com tudo liberado. Lembrete no 3º e no 6º dia (sino +
//    e-mail aos administradores) e, no 7º, o aviso do bloqueio. Cada aviso sai uma vez por inadimplência.
//  · empresa bloqueada por qualquer motivo (teste vencido, plano encerrado, pagamento em atraso): 2 dias depois do
//    bloqueio os números de WhatsApp são desconectados (logout, credenciais apagadas: as mensagens param de chegar).
//    Proteção da privacidade do cliente: o AtendeRadar não fica recebendo conversas de quem não usa mais o painel.
//    Ao contratar, cada número lê o QR Code de novo (Conexões › Reconectar).
// Demonstração e simulação ficam de fora.

const DAY = 86_400_000

export type PastDueStage = 'd3' | 'd6' | 'locked'

/** Aviso que cabe agora na inadimplência (o mais adiantado), ou null. */
export function pastDueStage(pastDueSince: Date, now: Date): PastDueStage | null {
  const elapsed = now.getTime() - pastDueSince.getTime()
  if (elapsed >= PAST_DUE_GRACE_DAYS * DAY) return 'locked'
  if (elapsed >= 6 * DAY) return 'd6'
  if (elapsed >= 3 * DAY) return 'd3'
  return null
}

/** Lembretes da inadimplência e aviso do bloqueio. Devolve quantos avisos novos saíram. */
export async function pastDueNotices(now = new Date(), orgId?: string): Promise<number> {
  if (orgId && (await isIsolatedOrg(orgId))) return 0
  const subs = await db.subscription.findMany({
    where: { status: 'past_due', organization: { status: 'active', ...REAL_ORGS(), ...(orgId ? { id: orgId } : {}) } },
    select: { id: true, organizationId: true, status: true, pastDueSince: true, plan: { select: { name: true } } },
    take: 1000,
  })
  let count = 0
  for (const s of subs) {
    // inadimplência anterior a este campo: a tolerância começa a contar agora
    if (!s.pastDueSince) {
      await db.subscription.updateMany({ where: { id: s.id, pastDueSince: null }, data: { pastDueSince: now } })
      continue
    }
    const stage = pastDueStage(s.pastDueSince, now)
    if (!stage) continue
    const graceEnd = graceEndsAt(s)!
    const key = `${s.id}:${s.pastDueSince.toISOString()}`
    const notice = { kind: 'past_due', stage, since: s.pastDueSince.toISOString() }
    if (await db.notification.findFirst({ where: { organizationId: s.organizationId, type: 'billing', data: JSON.stringify(notice) }, select: { id: true } })) continue
    if (stage === 'locked') {
      await notifyOnce(s.organizationId, notice, 'Painel bloqueado por falta de pagamento',
        `A renovação ficou ${PAST_DUE_GRACE_DAYS} dias sem pagamento. Nada é analisado e nenhum alerta é gerado. Para proteger a sua privacidade, os números de WhatsApp são desconectados em até ${LOCKED_DISCONNECT_DAYS} dias. Seus dados ficam guardados e podem ser exportados. Troque o cartão ou contrate um plano em Planos para voltar.`)
      await billingEmail(s.organizationId, 'past_due_locked', key, pastDueLockedEmail(s.plan.name))
    } else {
      await notifyOnce(s.organizationId, notice, `Pagamento em atraso: o painel será bloqueado em ${whenText(graceEnd)}`,
        'Tudo continua funcionando até lá. Troque o cartão em Planos: a fatura em aberto é cobrada na hora no cartão novo.')
      await billingEmail(s.organizationId, 'past_due_reminder', `${key}:${stage}`, pastDueReminderEmail(s.plan.name, graceEnd, now))
    }
    count++
  }
  return count
}

/**
 * Empresas bloqueadas há LOCKED_DISCONNECT_DAYS dias ou mais: desconecta os números de WhatsApp (o gateway faz o logout
 * em até 15 s, na reconciliação). Devolve quantos números desconectou.
 */
export async function disconnectLockedOrgs(now = new Date(), orgId?: string): Promise<number> {
  if (orgId && (await isIsolatedOrg(orgId))) return 0
  const subs = await db.subscription.findMany({
    where: {
      OR: [{ status: { in: ['trialing', 'past_due', 'canceled', 'expired'] } }, { cancelAtPeriodEnd: true }],
      organization: {
        ...REAL_ORGS(),
        ...(orgId ? { id: orgId } : {}),
        connections: { some: { status: { not: 'disconnected' }, provider: { not: SIMULATOR_PROVIDER } } },
      },
    },
    select: { organizationId: true, status: true, trialEnd: true, cancelAtPeriodEnd: true, currentPeriodEnd: true, pastDueSince: true },
    take: 1000,
  })
  let total = 0
  for (const s of subs) {
    const lock = lockOf(s, now)
    if (!lock) continue
    const since = lock.since ?? s.currentPeriodEnd
    if (now.getTime() - since.getTime() < LOCKED_DISCONNECT_DAYS * DAY) continue
    const conns = await db.whatsAppConnection.findMany({
      where: { organizationId: s.organizationId, status: { not: 'disconnected' }, provider: { not: SIMULATOR_PROVIDER } },
      select: { id: true, name: true },
    })
    if (!conns.length) continue
    const done = await db.whatsAppConnection.updateMany({
      where: { id: { in: conns.map((c) => c.id) }, status: { not: 'disconnected' } },
      data: { status: 'disconnected', statusReason: 'plan_locked', disabledAt: now, qrCode: null, qrUpdatedAt: null },
    })
    if (!done.count) continue
    total += done.count
    await audit({ orgId: s.organizationId, email: 'sistema', role: 'system', memberId: null }, {
      action: 'connection.auto_disconnected', targetType: 'organization', targetId: s.organizationId,
      details: { reason: lock.reason, lockedSince: since.toISOString(), connections: done.count },
    })
    const key = `${lock.reason}:${since.toISOString()}`
    await notifyOnce(s.organizationId, { kind: 'numbers_disconnected', since: key },
      done.count === 1 ? 'Número de WhatsApp desconectado' : `${done.count} números de WhatsApp desconectados`,
      `Como o painel está bloqueado há ${LOCKED_DISCONNECT_DAYS} dias, os números foram desconectados para proteger a sua privacidade: as mensagens não chegam mais. Seus dados continuam guardados e podem ser exportados. Ao contratar um plano, leia o QR Code em Conexões para reconectar.`)
    await billingEmail(s.organizationId, 'numbers_disconnected', key, numbersDisconnectedEmail(done.count))
  }
  return total
}
