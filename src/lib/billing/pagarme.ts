// Cliente da API v5 do Pagar.me (só no servidor: usa a chave SECRETA). O cartão nunca passa por aqui: o navegador
// gera um token direto no Pagar.me com a chave pública (checkout transparente) e o servidor só recebe esse token.
//
// Ambiente: PAGARME_MODE=live usa PAGARME_PUBLIC_KEY / PAGARME_SECRET_KEY; qualquer outro valor (padrão: test) usa
// PAGARME_PUBLIC_KEY_TEST / PAGARME_SECRET_KEY_TEST (sandbox, nenhum cartão é cobrado de verdade).

const BASE = 'https://api.pagar.me/core/v5'

export type PagarmeMode = 'test' | 'live'

export interface PagarmeConfig {
  mode: PagarmeMode
  publicKey: string
  secretKey: string
}

export function pagarmeConfig(): PagarmeConfig | null {
  const mode: PagarmeMode = process.env.PAGARME_MODE === 'live' ? 'live' : 'test'
  const publicKey = (mode === 'live' ? process.env.PAGARME_PUBLIC_KEY : process.env.PAGARME_PUBLIC_KEY_TEST)?.trim() ?? ''
  const secretKey = (mode === 'live' ? process.env.PAGARME_SECRET_KEY : process.env.PAGARME_SECRET_KEY_TEST)?.trim() ?? ''
  if (!publicKey || !secretKey) return null
  return { mode, publicKey, secretKey }
}

export class PagarmeError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`Pagar.me ${status}: ${JSON.stringify(body)?.slice(0, 300)}`)
  }
}

type Json = Record<string, unknown>

async function call<T = Json>(cfg: PagarmeConfig, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { Authorization: 'Basic ' + Buffer.from(cfg.secretKey + ':').toString('base64'), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    })
  } catch (e) {
    throw new PagarmeError(0, { message: e instanceof Error ? e.message : 'falha de rede' })
  }
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { message: text.slice(0, 300) }
  }
  if (!res.ok) throw new PagarmeError(res.status, data)
  return data as T
}

export interface Address {
  line_1: string // "número, rua, bairro"
  line_2?: string
  zip_code: string
  city: string
  state: string
  country: 'BR'
}

export interface CustomerInput {
  name: string
  email: string
  document: string
  type: 'individual' | 'company'
  document_type: 'CPF' | 'CNPJ'
  code: string
  phones?: { mobile_phone: { country_code: string; area_code: string; number: string } }
  address: Address
}

export const pagarme = {
  createCustomer: (cfg: PagarmeConfig, input: CustomerInput) => call<{ id: string }>(cfg, 'POST', '/customers', input),

  createSubscription: (cfg: PagarmeConfig, input: {
    customerId: string
    cardToken: string
    billingAddress: Address
    interval: 'month' | 'year'
    priceCents: number
    description: string
    metadata: Record<string, string>
  }) =>
    call<Json>(cfg, 'POST', '/subscriptions', {
      customer_id: input.customerId,
      payment_method: 'credit_card',
      interval: input.interval,
      interval_count: 1,
      billing_type: 'prepaid',
      installments: 1,
      currency: 'BRL',
      statement_descriptor: 'ATENDERADAR',
      items: [{ description: input.description, quantity: 1, pricing_scheme: { scheme_type: 'unit', price: input.priceCents } }],
      card_token: input.cardToken,
      card: { billing_address: input.billingAddress },
      metadata: input.metadata,
    }),

  /**
   * Renovação reativada: o cancelamento no Pagar.me é definitivo (status "canceled" não volta), então a reativação cria
   * uma assinatura NOVA com o cartão que já está na carteira do cliente (card_id) e start_at no fim do período pago.
   * Com start_at no futuro o Pagar.me não cobra nada agora (status "future"); a 1ª fatura sai na data de início.
   */
  createContinuation: (cfg: PagarmeConfig, input: {
    customerId: string
    cardId: string
    startAt: Date
    interval: 'month' | 'year'
    priceCents: number
    description: string
    metadata: Record<string, string>
  }) =>
    call<Json>(cfg, 'POST', '/subscriptions', {
      customer_id: input.customerId,
      payment_method: 'credit_card',
      interval: input.interval,
      interval_count: 1,
      billing_type: 'prepaid',
      installments: 1,
      currency: 'BRL',
      statement_descriptor: 'ATENDERADAR',
      start_at: input.startAt.toISOString(),
      items: [{ description: input.description, quantity: 1, pricing_scheme: { scheme_type: 'unit', price: input.priceCents } }],
      card_id: input.cardId,
      metadata: input.metadata,
    }),

  getSubscription: (cfg: PagarmeConfig, id: string) => call<Json>(cfg, 'GET', `/subscriptions/${encodeURIComponent(id)}`),

  listInvoices: async (cfg: PagarmeConfig, subscriptionId: string) =>
    (await call<{ data?: Json[] }>(cfg, 'GET', `/invoices?subscription_id=${encodeURIComponent(subscriptionId)}&size=100`)).data ?? [],

  cancelSubscription: (cfg: PagarmeConfig, id: string) =>
    call<Json>(cfg, 'DELETE', `/subscriptions/${encodeURIComponent(id)}`, { cancel_pending_invoices: true }),

  /** Estorno integral de uma cobrança de cartão (direito de arrependimento). */
  refundCharge: (cfg: PagarmeConfig, chargeId: string) => call<Json>(cfg, 'DELETE', `/charges/${encodeURIComponent(chargeId)}`),

  updateCard: (cfg: PagarmeConfig, id: string, cardToken: string, billingAddress: Address) =>
    call<Json>(cfg, 'PATCH', `/subscriptions/${encodeURIComponent(id)}/card`, { card_token: cardToken, card: { billing_address: billingAddress } }),
}
