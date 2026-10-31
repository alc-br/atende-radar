import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { crmEnabled } from './flags'
import { errTag } from './log'

// Eventos internos de domínio do CRM (CRM-06, docs/crm/05-sincronizacao.md). Não são os eventos do webhook público
// (src/lib/webhooks.ts), que têm contrato próprio. Payload mínimo: IDs, números e rótulos fechados; nunca texto de
// mensagem, nome ou telefone do cliente final. Cada tipo tem schema; payload inválido não entra na fila.

const id = z.string().min(1).max(64)
const cents = z.number().int().min(0).nullable()

export const EVENT_SCHEMAS = {
  'opportunity.detected': z.object({ opportunityId: id, conversationId: id, agentId: id.nullable(), intent: z.string().max(40).nullable(), status: z.string().max(20), estimatedValueCents: cents, confidence: z.number().min(0).max(1) }).strict(),
  'opportunity.estimate_changed': z.object({ opportunityId: id, conversationId: id, estimatedValueCents: cents, confidence: z.number().min(0).max(1) }).strict(),
  'alert.created': z.object({ alertId: id, conversationId: id.nullable(), agentId: id.nullable(), type: z.string().max(60), severity: z.string().max(20) }).strict(),
  'alert.resolved': z.object({ alertId: id, conversationId: id.nullable() }).strict(),
  'conversation.stage_inferred': z.object({ conversationId: id, agentId: id.nullable(), inferredStage: z.string().max(40) }).strict(),
  'outcome.detected': z.object({ conversationId: id, agentId: id.nullable(), outcome: z.enum(['sale_confirmed', 'lost']), confirmedValueCents: cents }).strict(),
  'recovery.completed': z.object({ recoveryItemId: id, conversationId: id.nullable(), result: z.string().max(40) }).strict(),
  'contact.privacy_changed': z.object({ contactId: id, excluded: z.boolean() }).strict(),
} as const

export type CrmEventType = keyof typeof EVENT_SCHEMAS
export type CrmEventData<T extends CrmEventType> = z.infer<(typeof EVENT_SCHEMAS)[T]>

export interface CrmEventInput<T extends CrmEventType> {
  organizationId: string
  eventType: T
  aggregateType: string
  aggregateId: string
  /** Versão do agregado na origem. Evento com versão menor que a já aplicada é ignorado pelo consumidor. */
  aggregateVersion: number
  data: CrmEventData<T>
  correlationId?: string | null
}

export const eventIdempotencyKey = (e: Pick<CrmEventInput<CrmEventType>, 'organizationId' | 'eventType' | 'aggregateType' | 'aggregateId' | 'aggregateVersion'>) =>
  `${e.organizationId}:${e.eventType}:${e.aggregateType}:${e.aggregateId}:${e.aggregateVersion}`

type Tx = Prisma.TransactionClient

/**
 * Grava o evento no outbox. Passe `tx` quando a mudança de origem está numa transação (outbox transacional). Empresa sem
 * CRM ligado não grava nada. O mesmo (tipo, agregado, versão) gravado de novo é ignorado (idempotencyKey única).
 * Devolve false quando não gravou. Nunca lança: falha do CRM não pode derrubar a análise nem a ingestão do WhatsApp.
 */
export async function emitCrmEvent<T extends CrmEventType>(input: CrmEventInput<T>, tx?: Tx): Promise<boolean> {
  try {
    if (!(await crmEnabled(input.organizationId))) return false
    const parsed = EVENT_SCHEMAS[input.eventType].safeParse(input.data)
    if (!parsed.success) {
      console.error('[crm] evento com payload inválido descartado', input.eventType, parsed.error.issues[0]?.path.join('.'))
      return false
    }
    const client = tx ?? db
    const idempotencyKey = eventIdempotencyKey(input)
    const exists = await client.crmOutboxEvent.findUnique({ where: { idempotencyKey }, select: { id: true } })
    if (exists) return false
    await client.crmOutboxEvent.create({
      data: {
        organizationId: input.organizationId,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        aggregateVersion: input.aggregateVersion,
        payloadJson: JSON.stringify(parsed.data),
        correlationId: input.correlationId ?? null,
        idempotencyKey,
      },
    })
    return true
  } catch (e) {
    console.error('[crm] falha ao gravar evento', input.eventType, errTag(e))
    return false
  }
}
