import { randomBytes } from 'node:crypto'
import { db } from '../db'
import { ingestEvent, type IngestResult } from '../ingest'

// Entrega eventos à ingestão com o MESMO envelope que o gateway do WhatsApp manda (EventSchema), só que em processo e
// com source 'simulator' (a ingestão recusa conexão real vinda daqui e conexão simulada vinda do gateway).

export interface InjectMessage {
  connectionId: string
  chatId: string
  from: 'customer' | 'company'
  text: string
  occurredAt: Date
  pushName?: string
  /** Para reenviar o mesmo evento (idempotência). */
  eventId?: string
  externalId?: string
}

export interface Injected {
  result: IngestResult
  eventId: string
  externalId: string
  conversationId: string | null
}

export async function injectMessage(m: InjectMessage): Promise<Injected> {
  const externalId = m.externalId ?? `sim-${randomBytes(8).toString('hex')}`
  const eventId = m.eventId ?? `sim-msg-${randomBytes(8).toString('hex')}`
  const result = await ingestEvent(
    {
      eventId,
      connectionId: m.connectionId,
      type: m.from === 'customer' ? 'message.received' : 'message.sent',
      occurredAt: m.occurredAt.toISOString(),
      payload: { externalId, chatId: m.chatId, isGroup: false, fromMe: m.from === 'company', text: m.text, messageType: 'text', ...(m.pushName ? { pushName: m.pushName } : {}) },
    },
    { source: 'simulator' },
  )
  const msg = await db.message.findUnique({ where: { connectionId_externalId: { connectionId: m.connectionId, externalId } }, select: { conversationId: true } })
  return { result, eventId, externalId, conversationId: msg?.conversationId ?? null }
}

export async function injectConnectionStatus(connectionId: string, status: 'connected' | 'disconnected' | 'degraded', occurredAt: Date, reason?: string): Promise<IngestResult> {
  return ingestEvent(
    {
      eventId: `sim-status-${randomBytes(8).toString('hex')}`,
      connectionId,
      type: 'connection.status',
      occurredAt: occurredAt.toISOString(),
      payload: { status, ...(reason ? { reason } : {}) },
    },
    { source: 'simulator' },
  )
}
