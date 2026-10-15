import { randomUUID } from 'node:crypto'
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import type net from 'node:net'
import { db } from './db'
import { isBlockedAddress, signBody, validateWebhookUrl } from './webhook-url'
import { isIsolatedOrg } from './sandbox'

// Webhook de saída (P4): avisa o sistema do cliente quando um alerta abre ou se resolve.
// Entrega por FILA (WebhookDelivery): quem cria/resolve o alerta só grava uma linha (rápido, nunca derruba o motor);
// a fila é processada logo em seguida (em segundo plano) e pelo agendador a cada minuto, com até 3 tentativas.
// Segurança (SSRF): só https, nada de localhost/IP interno; o DNS é resolvido NA HORA do envio e cada endereço
// é conferido antes de conectar (a conexão usa o endereço conferido: troca de DNS no meio não escapa). Sem redirecionamento.

export const WEBHOOK_EVENTS = ['alert.created', 'alert.resolved', 'alert.updated'] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]
export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  'alert.created': 'Alerta criado',
  'alert.resolved': 'Alerta resolvido',
  'alert.updated': 'Alerta atualizado (repetição ou agravamento)',
}
export const TEST_EVENT = 'webhook.test'

export const isWebhookEvent = (v: unknown): v is WebhookEvent => typeof v === 'string' && (WEBHOOK_EVENTS as readonly string[]).includes(v)

export function parseEvents(json: string | null | undefined): WebhookEvent[] {
  try {
    const v = JSON.parse(json || '[]') as unknown
    return Array.isArray(v) ? v.filter(isWebhookEvent) : []
  } catch {
    return []
  }
}

const TIMEOUT_MS = 5000
const MAX_ATTEMPTS = 3
const BACKOFF_MS = [60_000, 5 * 60_000] // espera depois da 1ª e da 2ª falha
const KEEP_DAYS = 30

// ---------- leitura para a tela (sem segredo, sem corpo) ----------

export async function webhookView(organizationId: string) {
  const ep = await db.webhookEndpoint.findUnique({ where: { organizationId } })
  const deliveries = await db.webhookDelivery.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, event: true, status: true, attempts: true, lastStatusCode: true, lastError: true, createdAt: true, deliveredAt: true, nextAttemptAt: true },
  })
  return {
    webhook: ep
      ? {
          url: ep.url,
          enabled: ep.enabled,
          events: parseEvents(ep.events),
          secretHint: `…${ep.secret.slice(-4)}`,
          lastStatus: ep.lastStatus,
          lastStatusCode: ep.lastStatusCode,
          lastError: ep.lastError,
          lastEvent: ep.lastEvent,
          lastAttemptAt: ep.lastAttemptAt?.toISOString() ?? null,
          updatedAt: ep.updatedAt.toISOString(),
        }
      : null,
    deliveries: deliveries.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      deliveredAt: d.deliveredAt?.toISOString() ?? null,
      nextAttemptAt: d.status === 'pending' ? d.nextAttemptAt.toISOString() : null,
    })),
    availableEvents: WEBHOOK_EVENTS.map((id) => ({ id, label: WEBHOOK_EVENT_LABELS[id] })),
  }
}

// ---------- envio assinado ----------

export interface DeliveryResult {
  ok: boolean
  statusCode?: number
  error?: string
}

/** DNS resolvido na hora e conferido; a conexão usa exatamente o endereço conferido. */
function safeLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void,
) {
  dns.lookup(hostname, { all: true, family: options.family }, (err, addresses) => {
    if (err) return callback(err, '')
    const list = addresses as dns.LookupAddress[]
    if (!list.length || list.some((a) => isBlockedAddress(a.address))) {
      return callback(Object.assign(new Error('O endereço resolve para uma rede interna ou privada.'), { code: 'EBLOCKED' }), '')
    }
    if (options.all) return callback(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

export function postSigned(target: string, secret: string, event: string, deliveryId: string, body: string): Promise<DeliveryResult> {
  const check = validateWebhookUrl(target)
  if (!check.ok) return Promise.resolve({ ok: false, error: check.error })
  const u = new URL(check.url)
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': String(Buffer.byteLength(body)),
    'User-Agent': 'AtendeRadar-Webhook/1',
    'X-AtendeRadar-Event': event,
    'X-AtendeRadar-Delivery': deliveryId,
    'X-AtendeRadar-Timestamp': String(Math.floor(Date.now() / 1000)),
    'X-AtendeRadar-Signature': `sha256=${signBody(body, secret)}`,
  }
  const mod = u.protocol === 'https:' ? https : http
  return new Promise((resolve) => {
    let done = false
    const finish = (r: DeliveryResult) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(r)
    }
    // agent: false = conexão nova a cada envio (nada reaproveitado de outro destino); redirecionamento nunca é seguido.
    const req = mod.request(u, { method: 'POST', headers, agent: false, lookup: safeLookup as unknown as net.LookupFunction }, (res) => {
      const code = res.statusCode ?? 0
      if (code >= 200 && code < 300) finish({ ok: true, statusCode: code })
      else finish({ ok: false, statusCode: code, error: code >= 300 && code < 400 ? 'Redirecionamento não é seguido' : `HTTP ${code}` })
      res.destroy() // corpo da resposta não interessa
    })
    const timer = setTimeout(() => req.destroy(new Error('Tempo esgotado (5 s)')), TIMEOUT_MS)
    timer.unref?.()
    req.on('error', (e) => finish({ ok: false, error: (e.message || 'Falha de conexão').slice(0, 200) }))
    req.end(body)
  })
}

async function recordAttempt(organizationId: string, event: string, r: DeliveryResult) {
  await db.webhookEndpoint.updateMany({
    where: { organizationId },
    data: { lastStatus: r.ok ? 'ok' : 'error', lastStatusCode: r.statusCode ?? null, lastError: r.ok ? null : (r.error ?? null), lastEvent: event, lastAttemptAt: new Date() },
  })
}

// ---------- eventos de alerta ----------

export interface AlertForWebhook {
  id: string
  organizationId: string
  conversationId: string | null
  ruleName: string | null
  severity: string
  status: string
  potentialValue: number | null
  confidence: number | null
  createdAt: Date
  updatedAt: Date
  occurrences?: number // B6: quantas vezes o problema aconteceu nesta conversa (alerta agrupado)
  lastOccurredAt?: Date | null
}

/** Só metadados do alerta: nada de texto de mensagem, telefone ou nome do cliente (o título e a descrição ficam de fora). */
function alertData(a: AlertForWebhook) {
  return {
    alertId: a.id,
    ruleName: a.ruleName,
    severity: a.severity,
    status: a.status,
    conversationId: a.conversationId,
    potentialValue: a.potentialValue,
    confidence: a.confidence,
    createdAt: a.createdAt.toISOString(),
    occurrences: a.occurrences ?? 1,
    lastOccurredAt: (a.lastOccurredAt ?? a.createdAt).toISOString(),
    resolvedAt: a.status === 'resolved' ? a.updatedAt.toISOString() : null,
  }
}

/** Põe o evento na fila, se a empresa tem webhook ligado para ele. Nunca lança erro (não pode atrapalhar o motor nem a tela). */
export async function enqueueAlertEvent(event: WebhookEvent, alert: AlertForWebhook): Promise<void> {
  try {
    if (await isIsolatedOrg(alert.organizationId)) return // demonstração e simulação nunca chamam sistema de cliente
    const ep = await db.webhookEndpoint.findUnique({ where: { organizationId: alert.organizationId } })
    if (!ep?.enabled || !parseEvents(ep.events).includes(event)) return
    const id = randomUUID()
    const payload = JSON.stringify({ event, occurredAt: new Date().toISOString(), organizationId: alert.organizationId, data: alertData(alert) })
    await db.webhookDelivery.create({ data: { id, organizationId: alert.organizationId, event, payload } })
    kickWebhooks()
  } catch (e) {
    console.error('[webhook] falha ao enfileirar', event, e instanceof Error ? e.message : e)
  }
}

/** Envia um evento de teste agora (botão "Enviar teste") e registra o resultado. */
export async function sendTestEvent(organizationId: string): Promise<DeliveryResult> {
  const ep = await db.webhookEndpoint.findUnique({ where: { organizationId } })
  if (!ep) return { ok: false, error: 'Webhook não configurado.' }
  const id = randomUUID()
  const body = JSON.stringify({ event: TEST_EVENT, occurredAt: new Date().toISOString(), organizationId, data: { message: 'Teste de webhook do AtendeRadar' } })
  const r = await postSigned(ep.url, ep.secret, TEST_EVENT, id, body)
  await db.webhookDelivery.create({
    data: { id, organizationId, event: TEST_EVENT, status: r.ok ? 'sent' : 'failed', attempts: 1, lastStatusCode: r.statusCode ?? null, lastError: r.error ?? null, deliveredAt: r.ok ? new Date() : null },
  })
  await recordAttempt(organizationId, TEST_EVENT, r)
  return r
}

// ---------- processamento da fila ----------

/** Entrega o que está vencido na fila. Seguro para rodar em paralelo: cada entrega é "reservada" antes do envio. */
export async function processWebhookOutbox(opts: { organizationId?: string; limit?: number } = {}): Promise<{ sent: number; failed: number }> {
  const now = new Date()
  // reservada há mais de 1 min sem terminar (servidor reiniciou no meio): volta para a fila
  await db.webhookDelivery.updateMany({ where: { status: 'sending', nextAttemptAt: { lt: now } }, data: { status: 'pending' } })
  const due = await db.webhookDelivery.findMany({
    where: { status: 'pending', nextAttemptAt: { lte: now }, ...(opts.organizationId ? { organizationId: opts.organizationId } : {}) },
    orderBy: { createdAt: 'asc' },
    take: opts.limit ?? 50,
    select: { id: true },
  })
  let sent = 0
  let failed = 0
  for (const { id } of due) {
    const claimed = await db.webhookDelivery.updateMany({ where: { id, status: 'pending' }, data: { status: 'sending', nextAttemptAt: new Date(Date.now() + 60_000) } })
    if (!claimed.count) continue
    const d = await db.webhookDelivery.findUnique({ where: { id } })
    if (!d) continue
    const ep = await db.webhookEndpoint.findUnique({ where: { organizationId: d.organizationId } })
    if (!ep || !ep.enabled || !d.payload || !parseEvents(ep.events).includes(d.event as WebhookEvent)) {
      await db.webhookDelivery.update({ where: { id }, data: { status: 'skipped', payload: null, lastError: 'Webhook desligado, removido ou sem este evento' } })
      continue
    }
    const r = await postSigned(ep.url, ep.secret, d.event, d.id, d.payload)
    const attempts = d.attempts + 1
    const final = r.ok || attempts >= MAX_ATTEMPTS
    await db.webhookDelivery.update({
      where: { id },
      data: {
        attempts,
        status: r.ok ? 'sent' : final ? 'failed' : 'pending',
        payload: final ? null : d.payload, // corpo não fica guardado depois da entrega
        lastStatusCode: r.statusCode ?? null,
        lastError: r.ok ? null : (r.error ?? null),
        deliveredAt: r.ok ? new Date() : null,
        nextAttemptAt: final ? new Date() : new Date(Date.now() + BACKOFF_MS[attempts - 1]),
      },
    })
    await recordAttempt(d.organizationId, d.event, r)
    if (r.ok) sent += 1
    else failed += 1
  }
  await db.webhookDelivery.deleteMany({ where: { status: { in: ['sent', 'failed', 'skipped'] }, createdAt: { lt: new Date(now.getTime() - KEEP_DAYS * 86400000) } } })
  return { sent, failed }
}

const g = globalThis as { __whKick?: ReturnType<typeof setTimeout> | null; __whRunning?: boolean; __whAgain?: boolean }

/** Uma rodada por vez neste processo (agendador e "chutes" depois de enfileirar). */
export async function runWebhookOutbox(): Promise<void> {
  if (g.__whRunning) {
    g.__whAgain = true
    return
  }
  g.__whRunning = true
  try {
    do {
      g.__whAgain = false
      await processWebhookOutbox()
    } while (g.__whAgain)
  } catch (e) {
    console.error('[webhook] fila falhou:', e instanceof Error ? e.message : e)
  } finally {
    g.__whRunning = false
  }
}

/** Processa a fila em ~0,5 s, fora da requisição/motor (vários alertas seguidos viram uma rodada só). */
export function kickWebhooks(): void {
  if (g.__whKick) return
  g.__whKick = setTimeout(() => {
    g.__whKick = null
    void runWebhookOutbox()
  }, 500)
  g.__whKick.unref?.()
}
