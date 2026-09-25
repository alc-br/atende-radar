import { db } from './db'

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
  await db.contact.update({ where: { id: conv.contactId }, data: { excluded: true } })
  const convs = await db.conversation.findMany({ where: { organizationId: orgId, contactId: conv.contactId }, select: { id: true } })
  await db.alert.updateMany({
    where: { organizationId: orgId, conversationId: { in: convs.map((c) => c.id) }, status: { in: ['new', 'acknowledged', 'in_progress'] } },
    data: { status: 'dismissed', dismissedReason: 'Contato excluído do monitoramento' },
  })
  return true
}

const parseDays = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
}

/** Retenção: apaga o TEXTO das mensagens depois de `retContent` dias (padrão 365) e as conversas inteiras depois de `retMetadata` dias (padrão 730). */
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
}
