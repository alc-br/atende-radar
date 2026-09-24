import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { db } from './db'

// ---------- contrato dos eventos (gateway → sistema) ----------
export const EventSchema = z.object({
  eventId: z.string().min(1).max(200),
  connectionId: z.string().min(1).max(100),
  type: z.enum(['message.received', 'message.sent', 'connection.status', 'connection.qr']),
  occurredAt: z.string().datetime().optional(),
  payload: z.record(z.string(), z.unknown()),
})
export type GatewayEvent = z.infer<typeof EventSchema>

const MessagePayload = z.object({
  externalId: z.string().min(1).max(200),
  chatId: z.string().min(3).max(200),
  isGroup: z.boolean().default(false),
  fromMe: z.boolean().default(false),
  text: z.string().max(20000).nullish(),
  messageType: z.string().max(40).default('text'),
  pushName: z.string().max(200).nullish(),
})
const StatusPayload = z.object({
  status: z.enum(['connected', 'disconnected', 'qr_required', 'syncing', 'degraded']),
  reason: z.string().max(200).nullish(),
  phoneNumber: z.string().max(40).nullish(),
})
const QrPayload = z.object({ qr: z.string().min(1).max(4000) })

export type IngestResult =
  | { ok: true; duplicate?: true; ignored?: string }
  | { ok: false; status: 400 | 404; error: string }

/** O telefone nunca é guardado em claro: só HMAC (para reconhecer o mesmo contato) e os 4 últimos dígitos (para exibir). */
export function phoneHash(orgId: string, digits: string): string {
  const key = process.env.PHONE_HASH_SECRET || process.env.NEXTAUTH_SECRET || 'atenderadar-dev-only'
  return createHmac('sha256', key).update(`${orgId}:${digits}`).digest('hex')
}

const digitsOf = (jid: string) => jid.split('@')[0].split(':')[0].replace(/\D/g, '')
const maxDate = (a: Date | null | undefined, b: Date) => (a && a > b ? a : b)

export async function ingestEvent(raw: unknown): Promise<IngestResult> {
  const parsed = EventSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, status: 400, error: 'Evento inválido' }
  const evt = parsed.data

  // A organização vem SEMPRE da conexão cadastrada, nunca do que o gateway diz.
  const connection = await db.whatsAppConnection.findUnique({ where: { id: evt.connectionId } })
  if (!connection) return { ok: false, status: 404, error: 'Conexão não encontrada' }

  const occurredAt = evt.occurredAt ? new Date(evt.occurredAt) : new Date()

  // Idempotência: o mesmo evento nunca é processado duas vezes (gateway pode reenviar).
  try {
    await db.rawChannelEvent.create({
      data: {
        connectionId: connection.id,
        eventId: evt.eventId,
        idempotencyKey: `${connection.id}:${evt.eventId}`,
        eventType: evt.type,
        // conteúdo das mensagens não é duplicado no registro bruto
        payload: JSON.stringify(evt.type.startsWith('message') ? { ...evt.payload, text: undefined } : evt.payload),
        occurredAt,
        processingStatus: 'received',
      },
    })
  } catch {
    return { ok: true, duplicate: true }
  }

  if (evt.type === 'connection.qr') {
    const p = QrPayload.safeParse(evt.payload)
    if (!p.success) return { ok: false, status: 400, error: 'Payload de QR inválido' }
    await db.whatsAppConnection.update({
      where: { id: connection.id },
      data: { qrCode: p.data.qr, qrUpdatedAt: new Date(), status: 'qr_required', lastEventAt: new Date() },
    })
    return { ok: true }
  }

  if (evt.type === 'connection.status') {
    const p = StatusPayload.safeParse(evt.payload)
    if (!p.success) return { ok: false, status: 400, error: 'Payload de status inválido' }
    const digits = p.data.phoneNumber ? p.data.phoneNumber.replace(/\D/g, '') : ''
    await db.$transaction([
      db.whatsAppConnection.update({
        where: { id: connection.id },
        data: {
          status: p.data.status,
          statusReason: p.data.reason ?? null,
          lastEventAt: new Date(),
          lastSeenAt: new Date(),
          ...(p.data.status === 'connected' ? { qrCode: null, qrUpdatedAt: null, pairedAt: connection.pairedAt ?? new Date() } : {}),
          ...(digits ? { phoneNumber: `+${digits}`, phoneLast4: digits.slice(-4) } : {}),
        },
      }),
      db.connectionSessionEvent.create({
        data: {
          connectionId: connection.id,
          eventType: 'status_change',
          previousStatus: connection.status,
          newStatus: p.data.status,
          reasonCode: p.data.reason ?? null,
          occurredAt,
        },
      }),
    ])
    return { ok: true }
  }

  // ---------- mensagens ----------
  const m = MessagePayload.safeParse(evt.payload)
  if (!m.success) return { ok: false, status: 400, error: 'Payload de mensagem inválido' }
  const msg = m.data

  if (msg.isGroup || msg.chatId.endsWith('@g.us') || msg.chatId === 'status@broadcast') {
    await db.rawChannelEvent.update({ where: { eventId: evt.eventId }, data: { processingStatus: 'ignored' } })
    return { ok: true, ignored: 'group' }
  }

  const digits = digitsOf(msg.chatId)
  if (digits.length < 8) return { ok: false, status: 400, error: 'Número inválido' }
  const inbound = !msg.fromMe && evt.type === 'message.received'
  const hash = phoneHash(connection.organizationId, digits)

  // Mesma mensagem do WhatsApp chegando de novo (histórico/reconexão) com outro eventId.
  const already = await db.message.findUnique({ where: { connectionId_externalId: { connectionId: connection.id, externalId: msg.externalId } } })
  if (already) return { ok: true, duplicate: true }

  await db.$transaction(async (tx) => {
    let contact = await tx.contact.findFirst({ where: { organizationId: connection.organizationId, phoneHash: hash } })
    if (!contact) {
      contact = await tx.contact.create({
        data: {
          organizationId: connection.organizationId,
          connectionId: connection.id,
          displayName: inbound ? msg.pushName ?? null : null,
          phoneHash: hash,
          phoneLast4: digits.slice(-4),
          firstSeenAt: occurredAt,
          lastSeenAt: occurredAt,
        },
      })
    } else {
      await tx.contact.update({
        where: { id: contact.id },
        data: {
          lastSeenAt: maxDate(contact.lastSeenAt, occurredAt),
          ...(inbound && msg.pushName && !contact.displayName ? { displayName: msg.pushName } : {}),
        },
      })
    }

    // Reaproveita a conversa aberta desse contato nessa conexão; senão abre outra.
    let conversation = await tx.conversation.findFirst({
      where: { organizationId: connection.organizationId, connectionId: connection.id, contactId: contact.id, closedAt: null },
      orderBy: { openedAt: 'desc' },
    })
    if (!conversation) {
      conversation = await tx.conversation.create({
        data: {
          organizationId: connection.organizationId,
          connectionId: connection.id,
          contactId: contact.id,
          openedAt: occurredAt,
          operationalStatus: inbound ? 'waiting_company' : 'waiting_customer',
        },
      })
    }

    await tx.message.create({
      data: {
        conversationId: conversation.id,
        connectionId: connection.id,
        externalId: msg.externalId,
        direction: inbound ? 'inbound' : 'outbound',
        senderType: inbound ? 'customer' : 'agent',
        messageType: msg.messageType,
        text: msg.text ?? null,
        occurredAt,
      },
    })

    // Estado da conversa = quem falou POR ÚLTIMO (mensagens atrasadas não bagunçam).
    const lastIn = inbound ? maxDate(conversation.lastInboundAt, occurredAt) : conversation.lastInboundAt
    const lastOut = !inbound ? maxDate(conversation.lastOutboundAt, occurredAt) : conversation.lastOutboundAt
    const customerSpokeLast = !!lastIn && (!lastOut || lastIn > lastOut)
    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        lastInboundAt: lastIn,
        lastOutboundAt: lastOut,
        operationalStatus: customerSpokeLast ? 'waiting_company' : 'waiting_customer',
        // desde quando o cliente espera resposta (só enquanto ele falou por último)
        waitingSince: customerSpokeLast ? (conversation.operationalStatus === 'waiting_company' && conversation.waitingSince ? conversation.waitingSince : lastIn) : null,
      },
    })
    await tx.rawChannelEvent.update({ where: { eventId: evt.eventId }, data: { processingStatus: 'processed' } })
  })

  await db.whatsAppConnection.update({ where: { id: connection.id }, data: { lastEventAt: new Date() } })
  return { ok: true }
}
