import { createHash } from 'node:crypto'
import { db } from './db'
import { audit } from './audit'
import type { AuthContext } from './api-auth'
import { verifyPassword } from './passwords'
import { allow } from './rate-limit'
import { cancelAtPeriodEnd } from './billing/service'
import { pagarme, pagarmeConfig } from './billing/pagarme'
import { discardSession } from './whatsapp/manager'

// Encerramento da conta pelo próprio cliente (LGPD · T17). O dono pede, a empresa fica 7 dias "em exclusão" (dá para
// desistir) e depois o agendador apaga a organização e TUDO dela. Sobra só uma linha no log do servidor (sem dado pessoal).

export const DELETION_GRACE_DAYS = 7
const DAY = 86400000

type Fail = { ok: false; status: number; error: string }
const fail = (status: number, error: string): Fail => ({ ok: false, status, error })

export interface DeletionInfo {
  requestedAt: string
  scheduledFor: string
  daysLeft: number
  requestedBy: string | null
}

/** Situação da exclusão para a faixa de aviso (null = conta normal). */
export function deletionInfo(
  org: { deletionRequestedAt: Date | null; deletionScheduledFor: Date | null },
  requestedByName: string | null = null,
  now = new Date(),
): DeletionInfo | null {
  if (!org.deletionRequestedAt || !org.deletionScheduledFor) return null
  return {
    requestedAt: org.deletionRequestedAt.toISOString(),
    scheduledFor: org.deletionScheduledFor.toISOString(),
    daysLeft: Math.max(0, Math.ceil((org.deletionScheduledFor.getTime() - now.getTime()) / DAY)),
    requestedBy: requestedByName,
  }
}

export async function deletionInfoFor(orgId: string, now = new Date()): Promise<DeletionInfo | null> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { deletionRequestedAt: true, deletionScheduledFor: true, deletionRequestedBy: true } })
  if (!org?.deletionRequestedAt) return null
  const by = org.deletionRequestedBy ? await db.organizationMember.findUnique({ where: { id: org.deletionRequestedBy }, select: { name: true } }) : null
  return deletionInfo(org, by?.name ?? null, now)
}

/** Nome que o dono precisa digitar: o mesmo que aparece na barra superior. */
export const confirmationName = (org: { name: string; displayName: string }) => (org.displayName || org.name).trim()

export async function requestDeletion(auth: AuthContext, input: { password?: unknown; confirmName?: unknown }): Promise<Fail | { ok: true; deletion: DeletionInfo }> {
  const org = await db.organization.findUnique({ where: { id: auth.orgId } })
  if (!org) return fail(404, 'Empresa não encontrada')
  if (org.deletionRequestedAt) return fail(409, 'A exclusão desta empresa já foi pedida.')
  const password = typeof input.password === 'string' ? input.password : ''
  const typedName = typeof input.confirmName === 'string' ? input.confirmName.trim() : ''
  if (!password || !typedName) return fail(400, 'Informe a sua senha e o nome da empresa.')
  // a senha é conferida aqui: limita tentativas como no login
  if (!allow(`org-delete:${auth.memberId}`, 5, 15 * 60_000)) return fail(429, 'Muitas tentativas. Tente novamente em alguns minutos.')
  const member = await db.organizationMember.findUnique({ where: { id: auth.memberId }, select: { passwordHash: true } })
  if (!verifyPassword(password, member?.passwordHash)) return fail(400, 'Senha incorreta.')
  if (typedName !== confirmationName(org)) return fail(400, 'O nome digitado não confere com o nome da empresa.')

  // 1) para a cobrança: cancela a renovação (o que já foi pago não é estornado). Sem cobrança automática: segue.
  const billing = await cancelAtPeriodEnd(auth)
  if (!billing.ok && billing.code === 'provider_error') return fail(502, `Não foi possível cancelar a renovação da assinatura agora (${billing.error}). Nada foi alterado; tente de novo.`)
  const renewalCanceled = billing.ok

  const now = new Date()
  const scheduledFor = new Date(now.getTime() + DELETION_GRACE_DAYS * DAY)
  // 2) marca a empresa e desconecta os WhatsApp (o gerenciador encerra as sessões e apaga as credenciais)
  const [, conns] = await db.$transaction([
    db.organization.update({ where: { id: org.id }, data: { deletionRequestedAt: now, deletionScheduledFor: scheduledFor, deletionRequestedBy: auth.memberId } }),
    db.whatsAppConnection.updateMany({ where: { organizationId: org.id, NOT: { status: 'disconnected', disabledAt: { not: null } } }, data: { status: 'disconnected', disabledAt: now, qrCode: null } }),
  ])
  await audit(auth, { action: 'organization.deletion_requested', targetType: 'organization', targetId: org.id, details: { scheduledFor: scheduledFor.toISOString(), connectionsDisconnected: conns.count, renewalCanceled } })
  const when = scheduledFor.toLocaleDateString('pt-BR', { timeZone: org.timezone || 'America/Sao_Paulo' })
  await db.notification.create({
    data: {
      organizationId: org.id,
      type: 'system',
      title: 'Exclusão da empresa agendada',
      message: `${auth.name} pediu o encerramento da conta. A empresa e todos os dados serão apagados em ${when}. Até lá, o dono pode desistir em Configurações › Privacidade.`,
      data: JSON.stringify({ kind: 'organization_deletion', scheduledFor: scheduledFor.toISOString() }),
    },
  })
  return { ok: true, deletion: deletionInfo({ deletionRequestedAt: now, deletionScheduledFor: scheduledFor }, auth.name, now)! }
}

export async function cancelDeletion(auth: AuthContext): Promise<Fail | { ok: true }> {
  const org = await db.organization.findUnique({ where: { id: auth.orgId }, select: { deletionRequestedAt: true, deletionScheduledFor: true } })
  if (!org?.deletionRequestedAt) return fail(409, 'Não há exclusão pendente para esta empresa.')
  await db.organization.update({ where: { id: auth.orgId }, data: { deletionRequestedAt: null, deletionScheduledFor: null, deletionRequestedBy: null } })
  await audit(auth, { action: 'organization.deletion_canceled', targetType: 'organization', targetId: auth.orgId, details: { wasScheduledFor: org.deletionScheduledFor?.toISOString() ?? null } })
  await db.notification.create({
    data: {
      organizationId: auth.orgId,
      type: 'system',
      title: 'Exclusão da empresa cancelada',
      message: `${auth.name} desistiu da exclusão. A assinatura não volta sozinha: reative em Planos. Os WhatsApp precisam ser conectados de novo em Conexões.`,
    },
  })
  return { ok: true }
}

/** Para de cobrar no provedor, se ainda houver algo ativo (a renovação já foi cancelada no pedido; isto cobre o resto). */
async function stopProviderBilling(orgId: string) {
  const cfg = pagarmeConfig()
  const sub = await db.subscription.findUnique({ where: { organizationId: orgId } })
  if (!cfg || !sub || sub.billingMode !== cfg.mode) return
  const ids = [sub.cancelAtPeriodEnd ? null : sub.providerSubscriptionId, sub.pendingProviderSubscriptionId].filter((x): x is string => !!x)
  for (const id of ids) {
    await pagarme.cancelSubscription(cfg, id).catch((e) => console.error('[org-deletion] falha ao cancelar assinatura no provedor', id, e instanceof Error ? e.message : e))
  }
}

/** Apaga a organização e tudo que pertence a ela, numa transação, na ordem que as chaves estrangeiras exigem. */
export async function hardDeleteOrganization(orgId: string, now = new Date()): Promise<boolean> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true, createdAt: true, deletionRequestedAt: true, deletionScheduledFor: true } })
  if (!org?.deletionRequestedAt) return false // só apaga o que o dono pediu (e não desistiu)
  await stopProviderBilling(orgId)
  const connectionIds = (await db.whatsAppConnection.findMany({ where: { organizationId: orgId }, select: { id: true } })).map((c) => c.id)
  const members = await db.organizationMember.findMany({ where: { organizationId: orgId }, select: { id: true, email: true } })

  await db.$transaction(
    async (tx) => {
      const where = { organizationId: orgId }
      // o que aponta para conversas, oportunidades e atendentes sem cascata sai primeiro
      await tx.alert.deleteMany({ where })
      await tx.recoveryItem.deleteMany({ where })
      await tx.agentMetric.deleteMany({ where })
      await tx.classificationFeedback.deleteMany({ where })
      await tx.notification.deleteMany({ where })
      await tx.reportRun.deleteMany({ where })
      await tx.reportDefinition.deleteMany({ where })
      await tx.alertRule.deleteMany({ where })
      await tx.dailyMetric.deleteMany({ where })
      await tx.team.deleteMany({ where })
      // mensagens, classificações, achados, oportunidades, perguntas, promessas e notas saem em cascata
      await tx.conversation.deleteMany({ where })
      await tx.contact.deleteMany({ where })
      // eventos de sessão, eventos brutos e identidades de atendente saem em cascata com a conexão
      await tx.whatsAppConnection.deleteMany({ where })
      await tx.agent.deleteMany({ where })
      await tx.authToken.deleteMany({ where: { memberId: { in: members.map((m) => m.id) } } })
      // membros são por empresa: quem também está em outra empresa continua com aquele acesso
      await tx.organizationMember.deleteMany({ where })
      await tx.billingInvoice.deleteMany({ where })
      await tx.subscription.deleteMany({ where })
      await tx.paymentEvent.deleteMany({ where })
      // chamados de suporte (com as capturas de tela, guardadas no próprio banco)
      await tx.supportTicket.deleteMany({ where })
      await tx.auditLog.deleteMany({ where })
      // eventos analíticos (I7): marcos do funil, uso por tela/tour e uso de IA
      await tx.productEvent.deleteMany({ where })
      await tx.productMilestone.deleteMany({ where })
      await tx.aiUsage.deleteMany({ where })
      // alertas por e-mail: fila de envio e os e-mails de alerta da empresa
      await tx.alertEmailItem.deleteMany({ where })
      await tx.emailOutbox.deleteMany({ where })
      await tx.organization.delete({ where: { id: orgId } })
      // e-mails enviados a quem não tem mais conta em lugar nenhum
      const emails = [...new Set(members.map((m) => m.email.toLowerCase()))]
      const stillUsed = new Set((await tx.organizationMember.findMany({ where: { email: { in: emails } }, select: { email: true } })).map((m) => m.email.toLowerCase()))
      const gone = emails.filter((e) => !stillUsed.has(e))
      if (gone.length) await tx.emailOutbox.deleteMany({ where: { toEmail: { in: gone } } })
    },
    { timeout: 120_000, maxWait: 30_000 },
  )

  // credenciais dos números no disco (WA_SESSIONS_DIR/<conexão>)
  for (const id of connectionIds) {
    await discardSession(id).catch((e) => console.error('[org-deletion] falha ao apagar sessão do WhatsApp', id, e instanceof Error ? e.message : e))
  }
  // lápide: só o necessário para provar que a exclusão aconteceu (sem nome, e-mail ou qualquer dado pessoal)
  const nameHash = createHash('sha256').update(org.name).digest('hex').slice(0, 16)
  console.log(
    `[org-deletion] organização apagada id=${org.id} nameHash=${nameHash} createdAt=${org.createdAt.toISOString()} requestedAt=${org.deletionRequestedAt?.toISOString() ?? '-'} scheduledFor=${org.deletionScheduledFor?.toISOString() ?? '-'} deletedAt=${now.toISOString()} members=${members.length} connections=${connectionIds.length}`,
  )
  return true
}

/** Agendador: apaga as empresas cujo prazo de desistência acabou. `orgId` restringe a uma empresa (testes). */
export async function purgeDueDeletions(now = new Date(), orgId?: string): Promise<{ deleted: number }> {
  const due = await db.organization.findMany({
    where: { deletionScheduledFor: { not: null, lte: now }, deletionRequestedAt: { not: null }, ...(orgId ? { id: orgId } : {}) },
    select: { id: true },
    take: 20,
  })
  let deleted = 0
  for (const o of due) {
    try {
      if (await hardDeleteOrganization(o.id, now)) deleted++
    } catch (e) {
      console.error('[org-deletion] falha ao apagar organização', o.id, e instanceof Error ? e.message : e)
    }
  }
  return { deleted }
}
