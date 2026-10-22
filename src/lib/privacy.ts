import { db } from './db'
import { NOVELTY_RETENTION_DAYS } from './analysis/novelty-signal'
import { EXPORT_ACTION, usagePeriodStart } from './quotas'

export interface ErasedCounts {
  conversations: number
  messages: number
  alerts: number
  recoveryItems: number
}

/** Apaga de verdade (não só esconde) as conversas indicadas e tudo que nasceu delas, da PRÓPRIA organização. */
export async function eraseConversations(orgId: string, conversationIds: string[]): Promise<ErasedCounts> {
  if (conversationIds.length === 0) return { conversations: 0, messages: 0, alerts: 0, recoveryItems: 0 }
  const ids = await db.conversation.findMany({ where: { organizationId: orgId, id: { in: conversationIds } }, select: { id: true, contactId: true } })
  const convIds = ids.map((c) => c.id)
  const contactIds = [...new Set(ids.map((c) => c.contactId).filter((x): x is string => !!x))]

  return db.$transaction(async (tx) => {
    const messages = await tx.message.count({ where: { conversationId: { in: convIds } } })
    const alerts = await tx.alert.deleteMany({ where: { organizationId: orgId, conversationId: { in: convIds } } })
    const recovery = await tx.recoveryItem.deleteMany({ where: { organizationId: orgId, conversationId: { in: convIds } } })
    await tx.classificationFeedback.deleteMany({ where: { organizationId: orgId, targetId: { in: convIds } } })
    // notificações guardam o id da conversa no JSON e o nome do cliente no título
    for (const id of convIds) await tx.notification.deleteMany({ where: { organizationId: orgId, data: { contains: id } } })
    // mensagens, classificações, achados, promessas, perguntas, notas e oportunidades saem em cascata
    await tx.conversation.deleteMany({ where: { organizationId: orgId, id: { in: convIds } } })
    // o contato só é apagado se não sobrou nenhuma conversa dele
    for (const contactId of contactIds) {
      if ((await tx.conversation.count({ where: { contactId } })) === 0) await tx.contact.deleteMany({ where: { id: contactId, organizationId: orgId } })
    }
    return { conversations: convIds.length, messages, alerts: alerts.count, recoveryItems: recovery.count }
  })
}

/** Para de monitorar o contato: some das telas e das análises, e as próximas mensagens dele são ignoradas. */
export async function excludeContactOf(orgId: string, conversationId: string): Promise<boolean> {
  const conv = await db.conversation.findFirst({ where: { id: conversationId, organizationId: orgId }, select: { contactId: true } })
  if (!conv?.contactId) return false
  await excludeContacts(orgId, [conv.contactId])
  return true
}

/** Marca os contatos (da PRÓPRIA organização) como excluídos do monitoramento e dispensa os alertas abertos deles. */
export async function excludeContacts(orgId: string, contactIds: string[]): Promise<number> {
  if (contactIds.length === 0) return 0
  const { count } = await db.contact.updateMany({ where: { organizationId: orgId, id: { in: contactIds } }, data: { excluded: true, phoneEncrypted: null } }) // não monitorar = não guardar o telefone completo
  const convs = await db.conversation.findMany({ where: { organizationId: orgId, contactId: { in: contactIds } }, select: { id: true } })
  await db.alert.updateMany({
    where: { organizationId: orgId, conversationId: { in: convs.map((c) => c.id) }, status: { in: ['new', 'acknowledged', 'in_progress'] } },
    data: { status: 'dismissed', dismissedReason: 'Contato excluído do monitoramento' },
  })
  return count
}

const parseDays = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
}

/** Prazo dos eventos analíticos brutos (I7): PRODUCT_EVENTS_RETENTION_DAYS, padrão 400 dias. */
export const productEventsRetentionDays = () => parseDays(process.env.PRODUCT_EVENTS_RETENTION_DAYS, 400)

/**
 * Retenção dos eventos analíticos (I7): apaga eventos de produto, uso de IA e contadores de visita mais velhos que o prazo.
 * Os marcos do funil (um por empresa) ficam enquanto a empresa existir e saem junto com ela.
 */
export async function purgeProductEvents(now = new Date(), days = productEventsRetentionDays()) {
  const cutoff = new Date(now.getTime() - days * 86400000)
  const cutoffDay = cutoff.toISOString().slice(0, 10)
  const [events, ai, views, signals] = await Promise.all([
    db.productEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.aiUsage.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.pageViewDaily.deleteMany({ where: { day: { lt: cutoffDay } } }),
    // situações novas: a frase de cada conversa fica 30 dias, agrupada ou não (o tema fica, sem a frase)
    db.novelSignal.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - NOVELTY_RETENTION_DAYS * 86400000) } } }),
  ])
  return { productEvents: events.count, aiUsage: ai.count, pageViewDays: views.count, novelSignals: signals.count }
}

/** Retenção: apaga o TEXTO das mensagens depois de `retContent` dias (padrão 365), as conversas inteiras e o registro de auditoria depois de `retMetadata` dias (padrão 730). */
export async function purgeExpired(orgId: string, settingsJson: string | null, now = new Date()) {
  let settings: { retContent?: unknown; retMetadata?: unknown } = {}
  try {
    settings = settingsJson ? JSON.parse(settingsJson) : {}
  } catch {
    settings = {}
  }
  const contentDays = parseDays(settings.retContent, 365)
  const metaDays = parseDays(settings.retMetadata, 730)

  const contentCutoff = new Date(now.getTime() - contentDays * 86400000)
  await db.message.updateMany({ where: { conversation: { organizationId: orgId }, text: { not: null }, occurredAt: { lt: contentCutoff } }, data: { text: null } })

  const metaCutoff = new Date(now.getTime() - metaDays * 86400000)
  const old = await db.conversation.findMany({ where: { organizationId: orgId, updatedAt: { lt: metaCutoff }, messages: { some: { externalId: { not: null } } } }, select: { id: true }, take: 500 })
  if (old.length) await eraseConversations(orgId, old.map((c) => c.id))
  // o registro de auditoria é metadado: segue o mesmo prazo. Exceção: as exportações do mês corrente ficam até o mês
  // virar, porque são a contagem da cota de exportações do plano (senão um prazo curto zeraria a cota).
  await db.auditLog.deleteMany({
    where: { organizationId: orgId, createdAt: { lt: metaCutoff }, NOT: { action: EXPORT_ACTION, createdAt: { gte: usagePeriodStart(now) } } },
  })
}
