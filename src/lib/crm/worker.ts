import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { EVENT_SCHEMAS, type CrmEventType } from './events'
import { crmEnabled } from './flags'
import { errTag } from './log'

// Worker do outbox do CRM (docs/crm/05-sincronizacao.md): at-least-once com consumidor idempotente.
//  - reserva cada evento (processing + lockedUntil) antes de processar: seguro com mais de uma rodada ao mesmo tempo;
//  - o consumidor grava os efeitos e a linha do inbox (consumer, eventId) na MESMA transação: reprocessar não duplica;
//  - erro temporário: nova tentativa com backoff exponencial + jitter; erro permanente ou tentativas esgotadas: dead (DLQ);
//  - evento de versão menor que a já aplicada ao agregado é ignorado (não desfaz decisão humana).

export const MAX_ATTEMPTS = 8
const LOCK_MS = 60_000
const BATCH = 50
const KEEP_PROCESSED_DAYS = 30

export class PermanentError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

export interface OutboxRow {
  id: string
  organizationId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  aggregateVersion: number
  payloadJson: string
  correlationId: string | null
}

export type ConsumerResult = { status: 'processed' | 'ignored'; result?: Record<string, unknown> }
export type Consumer = (tx: Prisma.TransactionClient, evt: OutboxRow, data: unknown) => Promise<ConsumerResult>

// No processo, mas fora do módulo: o agendador (instrumentation) e cada rota são pacotes separados no Next, e um Map do
// módulo ficaria vazio em quem não importou o consumidor. Fila sem consumidor não processa (ver processOne).
const reg = globalThis as { __crmConsumers?: Map<string, Consumer> }
const consumers = (reg.__crmConsumers ??= new Map<string, Consumer>())

/** Registra o consumidor (um por nome). O nativo fica em src/lib/crm/consumer.ts. */
export function registerConsumer(name: string, fn: Consumer) {
  consumers.set(name, fn)
}

/** Espera até a próxima tentativa: 30 s, 1 min, 2 min, ... até 1 h, com ±20% de jitter. */
export function backoffMs(attempts: number, rand: () => number = Math.random): number {
  const base = Math.min(3600_000, 30_000 * 2 ** Math.max(0, attempts - 1))
  return Math.round(base * (0.8 + rand() * 0.4))
}

async function applyToConsumer(name: string, fn: Consumer, evt: OutboxRow, data: unknown): Promise<void> {
  await db.$transaction(async (tx) => {
    const seen = await tx.crmSyncInbox.findUnique({ where: { consumer_eventId: { consumer: name, eventId: evt.id } }, select: { id: true } })
    if (seen) return
    const r = await fn(tx, evt, data)
    await tx.crmSyncInbox.create({
      data: { organizationId: evt.organizationId, consumer: name, eventId: evt.id, status: r.status, resultJson: r.result ? JSON.stringify(r.result).slice(0, 2000) : null },
    })
  }, { timeout: 30_000, maxWait: 10_000 })
}

/** Processa um evento já reservado. */
async function processOne(evt: OutboxRow & { attempts: number }): Promise<'processed' | 'retry' | 'dead'> {
  let code: string | null = null
  let permanent = false
  try {
    const schema = EVENT_SCHEMAS[evt.eventType as CrmEventType]
    if (!schema) throw new PermanentError('unknown_event_type')
    let raw: unknown
    try {
      raw = JSON.parse(evt.payloadJson)
    } catch {
      throw new PermanentError('invalid_json')
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw new PermanentError('invalid_payload')
    // nenhum consumidor registrado neste processo: erro temporário (nova tentativa), nunca "processado sem efeito"
    if (!consumers.size) throw new Error('no_consumer')
    // CRM desligado depois do evento: não aplica (fica registrado como processado sem efeito)
    if (await crmEnabled(evt.organizationId)) {
      for (const [name, fn] of consumers) await applyToConsumer(name, fn, evt, parsed.data)
    }
  } catch (e) {
    permanent = e instanceof PermanentError
    code = permanent
      ? (e as PermanentError).code
      : e instanceof Prisma.PrismaClientKnownRequestError
        ? `db_${e.code}`
        : e instanceof Error && e.message === 'no_consumer'
          ? 'no_consumer'
          : 'consumer_error'
    if (!permanent) console.error('[crm] falha ao processar evento', evt.eventType, evt.id, errTag(e))
  }

  const attempts = evt.attempts + 1
  if (!code) {
    await db.crmOutboxEvent.update({ where: { id: evt.id }, data: { status: 'processed', attempts, processedAt: new Date(), lockedUntil: null, lastErrorCode: null } })
    return 'processed'
  }
  const dead = permanent || attempts >= MAX_ATTEMPTS
  await db.crmOutboxEvent.update({
    where: { id: evt.id },
    data: { status: dead ? 'dead' : 'failed', attempts, lastErrorCode: code, lockedUntil: null, nextAttemptAt: new Date(Date.now() + (dead ? 0 : backoffMs(attempts))) },
  })
  return dead ? 'dead' : 'retry'
}

/** Uma rodada: devolve contagens. Seguro para rodar em paralelo (cada evento é reservado com updateMany condicional). */
export async function processCrmOutbox(opts: { organizationId?: string; limit?: number } = {}) {
  const now = new Date()
  const stats = { processed: 0, retry: 0, dead: 0 }
  // reservado e não terminado (servidor reiniciou no meio): volta para a fila
  await db.crmOutboxEvent.updateMany({ where: { status: 'processing', lockedUntil: { lt: now } }, data: { status: 'failed', lockedUntil: null } })
  const due = await db.crmOutboxEvent.findMany({
    where: { status: { in: ['pending', 'failed'] }, nextAttemptAt: { lte: now }, ...(opts.organizationId ? { organizationId: opts.organizationId } : {}) },
    orderBy: [{ createdAt: 'asc' }],
    take: opts.limit ?? BATCH,
    select: { id: true },
  })
  for (const { id } of due) {
    const claimed = await db.crmOutboxEvent.updateMany({
      where: { id, status: { in: ['pending', 'failed'] } },
      data: { status: 'processing', lockedUntil: new Date(Date.now() + LOCK_MS) },
    })
    if (!claimed.count) continue
    const evt = await db.crmOutboxEvent.findUnique({ where: { id } })
    if (!evt) continue
    stats[await processOne(evt)] += 1
  }
  return stats
}

/** Reprocessa um evento da DLQ (ação do admin, auditada na rota). */
export async function retryDeadEvent(organizationId: string, id: string): Promise<boolean> {
  const r = await db.crmOutboxEvent.updateMany({
    where: { id, organizationId, status: 'dead' },
    data: { status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastErrorCode: null },
  })
  return r.count > 0
}

/** Limpeza: processados com mais de 30 dias, inbox correspondente e chaves de idempotência vencidas. */
export async function purgeCrmOutbox(now = new Date()) {
  const cutoff = new Date(now.getTime() - KEEP_PROCESSED_DAYS * 86400_000)
  await db.crmOutboxEvent.deleteMany({ where: { status: 'processed', processedAt: { lt: cutoff } } })
  await db.crmSyncInbox.deleteMany({ where: { createdAt: { lt: cutoff } } })
  await db.crmIdempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 86400_000) } } })
}

const g = globalThis as { __crmRunning?: boolean; __crmAgain?: boolean; __crmKick?: ReturnType<typeof setTimeout> | null }

/** Uma rodada por vez neste processo (agendador e "chutes" depois de gravar evento). */
export async function runCrmOutbox(): Promise<void> {
  if (g.__crmRunning) {
    g.__crmAgain = true
    return
  }
  g.__crmRunning = true
  try {
    do {
      g.__crmAgain = false
      const s = await processCrmOutbox()
      if (s.processed + s.retry + s.dead >= BATCH) g.__crmAgain = true
    } while (g.__crmAgain)
  } catch (e) {
    console.error('[crm] fila falhou:', errTag(e))
  } finally {
    g.__crmRunning = false
  }
}

/** Processa a fila em ~1 s, fora da requisição e do motor de análise. */
export function kickCrmOutbox(): void {
  if (g.__crmKick) return
  g.__crmKick = setTimeout(() => {
    g.__crmKick = null
    void runCrmOutbox()
  }, 1000)
  g.__crmKick.unref?.()
}

/** Estado da fila para Configurações › CRM e Admin (sem payload). */
export async function outboxHealth(organizationId?: string) {
  const where = organizationId ? { organizationId } : {}
  const groups = await db.crmOutboxEvent.groupBy({ by: ['status'], where, _count: { _all: true } })
  const counts = Object.fromEntries(['pending', 'processing', 'processed', 'failed', 'dead'].map((s) => [s, 0])) as Record<string, number>
  for (const row of groups) counts[row.status] = row._count._all
  const oldest = await db.crmOutboxEvent.findFirst({ where: { ...where, status: { in: ['pending', 'failed'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
  const lagSeconds = oldest ? Math.max(0, Math.round((Date.now() - oldest.createdAt.getTime()) / 1000)) : 0
  const status = counts.dead > 0 ? 'degraded' : lagSeconds > 300 ? 'syncing' : 'operational'
  return { status, counts, lagSeconds }
}
