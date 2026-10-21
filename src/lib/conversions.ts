import { db } from './db'
import { normalizedPhone, sha256, type Attribution } from './attribution'

// Conversões enviadas pelo servidor para a mídia paga (docs/operacao/medicao.md):
// - purchase: a 1ª cobrança paga de uma assinatura do Pagar.me (contratação ou troca de plano). Vai para o GA4
//   (Measurement Protocol, com o client_id do _ga guardado no checkout) e para a Meta (API de Conversões, "Purchase").
// - sign_up: conta criada; só para a Meta ("CompleteRegistration").
// - renewal: renovação paga. NÃO é conversão: fica só registrada (status skipped), nada é enviado.
// Cada uma leva o mesmo event_id do navegador ("purchase.<assinatura>", "sign_up.<empresa>"), para a Meta contar uma vez.
// Consentimento: GA4 só com "medição" (analytics), Meta só com "anúncios" (ads); sem ele, "sem-consentimento".
// Sem os IDs (GA4_MEASUREMENT_ID + GA4_API_SECRET, META_PIXEL_ID + META_CAPI_TOKEN), "ga4:sem-id" / "meta:sem-id".
// Assinaturas do sandbox do Pagar.me (PAGARME_MODE=test) não são compra de verdade: "ignorado:sandbox".
// Fila na tabela ConversionEvent: 1ª tentativa logo depois de enfileirar, novas tentativas a cada minuto (agendador).

export type ConversionKind = 'purchase' | 'sign_up' | 'renewal'

export interface ConversionPayload {
  eventTime: number // segundos (unix)
  sourceUrl: string
  attribution: Attribution | null
  em?: string // e-mail em SHA-256
  ph?: string // celular em SHA-256
  externalId?: string // id da empresa em SHA-256
  sandbox?: boolean
  value?: number // reais
  currency?: 'BRL'
  transactionId?: string
  items?: { item_id: string; item_name: string; item_variant?: string; price: number; quantity: number }[]
  invoiceId?: string
}

export const purchaseEventId = (subscriptionId: string) => `purchase.${subscriptionId}`
export const signUpEventId = (organizationId: string) => `sign_up.${organizationId}`
export const renewalEventId = (invoiceId: string) => `renewal.${invoiceId}`

const MAX_ATTEMPTS = 6
const BACKOFF_MIN = [1, 5, 15, 60, 240]

/** Página onde a conversão aconteceu, sem query string (que pode levar dados de quem preencheu). */
export function pageUrl(referer: string | null, fallback: string): string {
  try {
    const u = new URL(referer || fallback)
    return `${u.origin}${u.pathname}`
  } catch {
    return fallback
  }
}

const log = (kind: string, id: string, result: string[]) => console.log(JSON.stringify({ event: 'conversion', kind, id, result }))

/** Enfileira uma conversão (uma vez por id). Renovação só fica registrada. Nunca lança: medir não atrapalha a cobrança. */
export async function queueConversion(kind: ConversionKind, id: string, organizationId: string | null, payload: ConversionPayload): Promise<boolean> {
  try {
    if (await db.conversionEvent.findUnique({ where: { id }, select: { id: true } })) return false
    const skipped = kind === 'renewal'
    await db.conversionEvent.create({
      data: {
        id, kind, organizationId, payload: JSON.stringify(payload),
        ...(skipped ? { status: 'skipped', result: 'nao-enviado:renovacao' } : {}),
      },
    })
    if (skipped) log(kind, id, ['nao-enviado:renovacao'])
    else kickConversions()
    return true
  } catch (e) {
    // corrida (mesmo id ao mesmo tempo) ou banco ocupado: o outro já gravou ou o próximo sync grava
    console.error('[conversion] não enfileirou', id, e instanceof Error ? e.message : e)
    return false
  }
}

async function ga4(clientId: string, events: object[]): Promise<string> {
  const id = process.env.GA4_MEASUREMENT_ID?.trim()
  const secret = process.env.GA4_API_SECRET?.trim()
  if (!id || !secret) return 'ga4:sem-id'
  const r = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(secret)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, events }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!r.ok) throw new Error(`GA4 HTTP ${r.status}`)
  return 'ga4:ok'
}

async function meta(event: object): Promise<string> {
  const pixel = process.env.META_PIXEL_ID?.trim()
  const token = process.env.META_CAPI_TOKEN?.trim()
  if (!pixel || !token) return 'meta:sem-id'
  const version = process.env.META_GRAPH_VERSION?.trim() || 'v23.0'
  const testCode = process.env.META_TEST_EVENT_CODE?.trim()
  const r = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [event], ...(testCode ? { test_event_code: testCode } : {}) }),
    signal: AbortSignal.timeout(15_000),
  })
  // o corpo do erro da Meta não leva o token; a URL leva, por isso nunca é impressa
  if (!r.ok) throw new Error(`Meta HTTP ${r.status}`)
  return 'meta:ok'
}

function userData(p: ConversionPayload) {
  const at = p.attribution ?? {}
  return {
    ...(p.em ? { em: [p.em] } : {}),
    ...(p.ph ? { ph: [p.ph] } : {}),
    ...(p.externalId ? { external_id: [p.externalId] } : {}),
    ...(at.fbp ? { fbp: at.fbp } : {}),
    ...(at.fbc ? { fbc: at.fbc } : {}),
  }
}

/** Envia uma conversão já enfileirada. Devolve o resultado de cada destino; erro de rede/HTTP lança (nova tentativa). */
export async function sendConversion(kind: ConversionKind, id: string, p: ConversionPayload): Promise<string[]> {
  if (kind === 'renewal') return ['nao-enviado:renovacao']
  if (p.sandbox) return ['ignorado:sandbox']
  const consent = p.attribution?.consent ?? { analytics: false, ads: false }
  const at = p.attribution ?? {}
  const out: string[] = []
  if (kind === 'purchase') {
    if (consent.analytics && at.ga) {
      out.push(await ga4(at.ga, [{
        name: 'purchase',
        params: {
          transaction_id: p.transactionId, value: p.value, currency: p.currency ?? 'BRL', items: p.items ?? [], engagement_time_msec: 1,
          ...(at.gs ? { session_id: at.gs } : {}),
          ...(process.env.GA4_DEBUG === '1' ? { debug_mode: 1 } : {}),
          ...(at.utm_source ? { campaign_source: at.utm_source } : {}),
          ...(at.utm_medium ? { campaign_medium: at.utm_medium } : {}),
          ...(at.utm_campaign ? { campaign: at.utm_campaign } : {}),
        },
      }]))
    } else out.push(consent.analytics ? 'ga4:sem-client-id' : 'ga4:sem-consentimento')
    if (consent.ads) {
      out.push(await meta({
        event_name: 'Purchase', event_time: p.eventTime, event_id: id, action_source: 'website', event_source_url: p.sourceUrl,
        user_data: userData(p),
        custom_data: { currency: p.currency ?? 'BRL', value: p.value, order_id: p.transactionId, content_type: 'product', content_ids: (p.items ?? []).map((i) => i.item_id), num_items: (p.items ?? []).length },
      }))
    } else out.push('meta:sem-consentimento')
  } else {
    // sign_up: o GA4 recebe o do navegador (tag do GTM); a Meta recebe pelos dois lados, com o mesmo event_id
    if (consent.ads) {
      out.push(await meta({ event_name: 'CompleteRegistration', event_time: p.eventTime, event_id: id, action_source: 'website', event_source_url: p.sourceUrl, user_data: userData(p), custom_data: { status: 'trial' } }))
    } else out.push('meta:sem-consentimento')
  }
  return out
}

async function processOutbox(now = new Date()): Promise<number> {
  const due = await db.conversionEvent.findMany({
    where: { status: { in: ['pending', 'failed'] }, attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: now } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })
  for (const row of due) {
    // reserva: outro processo/rodada não envia o mesmo evento
    const claimed = await db.conversionEvent.updateMany({ where: { id: row.id, status: row.status, attempts: row.attempts }, data: { status: 'sending' } })
    if (claimed.count !== 1) continue
    let payload: ConversionPayload
    try {
      payload = JSON.parse(row.payload) as ConversionPayload
    } catch {
      await db.conversionEvent.update({ where: { id: row.id }, data: { status: 'skipped', result: 'ignorado:payload-invalido', attempts: row.attempts + 1 } })
      continue
    }
    try {
      const result = await sendConversion(row.kind as ConversionKind, row.id, payload)
      await db.conversionEvent.update({ where: { id: row.id }, data: { status: 'sent', result: result.join(' '), attempts: row.attempts + 1, sentAt: new Date(), lastError: null } })
      log(row.kind, row.id, result)
    } catch (e) {
      const attempts = row.attempts + 1
      const msg = (e instanceof Error ? e.message : 'erro').slice(0, 300)
      const wait = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)]
      await db.conversionEvent.update({ where: { id: row.id }, data: { status: 'failed', attempts, lastError: msg, nextAttemptAt: new Date(Date.now() + wait * 60_000) } })
      log(row.kind, row.id, [`erro:${msg}`, attempts >= MAX_ATTEMPTS ? 'desistiu' : `nova-tentativa-em-${wait}min`])
    }
  }
  return due.length
}

const g = globalThis as { __cvKick?: ReturnType<typeof setTimeout> | null; __cvRunning?: boolean; __cvAgain?: boolean }

/** Uma rodada por vez neste processo (agendador e "chutes" depois de enfileirar). */
export async function runConversionOutbox(): Promise<void> {
  if (g.__cvRunning) {
    g.__cvAgain = true
    return
  }
  g.__cvRunning = true
  try {
    do {
      g.__cvAgain = false
      await processOutbox()
    } while (g.__cvAgain)
  } catch (e) {
    console.error('[conversion] fila falhou:', e instanceof Error ? e.message : e)
  } finally {
    g.__cvRunning = false
  }
}

export function kickConversions(): void {
  if (g.__cvKick) return
  g.__cvKick = setTimeout(() => {
    g.__cvKick = null
    void runConversionOutbox()
  }, 500)
  g.__cvKick.unref?.()
}

/** Dados de quem contratou, só em hash (gravados no checkout junto com a origem). */
export function hashedContact(email: string, phoneDigits: string, organizationId: string) {
  const ph = normalizedPhone(phoneDigits)
  return { em: sha256(email), ph: ph ? sha256(ph) : undefined, externalId: sha256(organizationId) }
}
