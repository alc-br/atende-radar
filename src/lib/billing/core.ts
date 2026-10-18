import { timingSafeEqual } from 'node:crypto'

// Cobrança recorrente (B8): regras puras, sem banco nem rede — testadas em tests/unit/billing.unit.spec.ts.
// Usado no servidor (rotas) e, nas funções de formatação, também no navegador (ver ./format.ts).
export * from './format'

export type BillingCycle = 'monthly' | 'annual'

export function priceCents(plan: { monthlyPrice: number; annualPrice: number }, cycle: BillingCycle): number {
  return Math.round((cycle === 'annual' ? plan.annualPrice : plan.monthlyPrice) * 100)
}

export interface SubscriptionLike {
  status: string
  trialEnd: Date | null
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: Date
}

/** Situação que vale AGORA: teste grátis vencido = expired; cancelada vale até o fim do período já pago. */
export function effectiveStatus(sub: SubscriptionLike, now = new Date()): string {
  if (sub.status === 'trialing' && sub.trialEnd && sub.trialEnd.getTime() <= now.getTime()) return 'expired'
  if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd.getTime() <= now.getTime()) return 'canceled'
  return sub.status
}

export const isActiveStatus = (status: string) => status === 'active' || status === 'trialing'

export interface InvoiceLike {
  status: string // pending | paid | canceled | scheduled | failed | refunded
  dueAt: Date | null
  cycleStart: Date | null
  cycleEnd: Date | null
  createdAt: Date
}

// Uma fatura pendente só vira "pagamento pendente" depois do vencimento (até lá o Pagar.me ainda tenta de novo no cartão).

/**
 * Situação da assinatura a partir do que o provedor diz: assinatura (active/canceled/…) + faturas.
 * O período vigente é o ciclo da última fatura PAGA.
 */
export function deriveFromProvider(
  input: { providerStatus: string; invoices: InvoiceLike[]; /** período atual já pago por uma assinatura anterior (renovação reativada) */ prepaid?: boolean },
  now = new Date(),
): { status: string; periodStart: Date | null; periodEnd: Date | null; everPaid: boolean } {
  const sorted = [...input.invoices].filter((i) => i.status !== 'canceled').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const lastPaid = [...sorted].reverse().find((i) => i.status === 'paid') ?? null
  const latest = sorted[sorted.length - 1] ?? null
  const periodStart = lastPaid?.cycleStart ?? null
  const periodEnd = lastPaid?.cycleEnd ?? null
  const everPaid = !!lastPaid
  if (input.providerStatus === 'canceled') return { status: 'canceled', periodStart, periodEnd, everPaid }
  if (latest && latest !== lastPaid) {
    const overdue = latest.status === 'failed' || (latest.dueAt !== null && latest.dueAt.getTime() < now.getTime())
    if (overdue) return { status: 'past_due', periodStart, periodEnd, everPaid }
  }
  // renovação reativada: até a 1ª cobrança da assinatura nova (no fim do período já pago), segue ativa
  return { status: everPaid || input.prepaid ? 'active' : 'past_due', periodStart, periodEnd, everPaid }
}

/**
 * Data da 1ª cobrança de uma renovação reativada: o dia seguinte ao fim do período pago. O Pagar.me guarda só a data
 * (meia-noite UTC); com o próprio fim do período ele cobraria um dia antes do que a assinatura original cobraria.
 */
export function reactivationStartAt(periodEnd: Date): Date {
  const d = new Date(periodEnd.getTime() + 1000)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds() ? 1 : 0)))
}

// ── formato do Pagar.me (API v5) ────────────────────────────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' ? (v as Obj) : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const date = (v: unknown): Date | null => {
  const s = str(v)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export interface InvoiceRow {
  providerInvoiceId: string
  providerSubscriptionId: string
  providerChargeId: string | null
  amountCents: number
  status: string
  paymentMethod: string | null
  dueAt: Date | null
  paidAt: Date | null
  periodStart: Date | null
  periodEnd: Date | null
  failureMessage: string | null
  createdAt: Date
}

/**
 * Estorno é final: a fatura que já está "refunded" no nosso banco não volta para outra situação. Logo depois do estorno o
 * Pagar.me ainda lista a fatura como paga por um tempo, e um aviso que chega nesse meio-tempo desfaria o estorno.
 */
export function keepRefunded(row: InvoiceRow, currentStatus: string | null | undefined): InvoiceRow {
  if (currentStatus !== 'refunded' || row.status === 'refunded') return row
  return { ...row, status: 'refunded', failureMessage: null }
}

export function mapInvoice(inv: Obj): InvoiceRow {
  const charge = obj(inv.charge)
  const tx = obj(charge?.last_transaction)
  const cycle = obj(inv.cycle)
  // estorno (arrependimento): o Pagar.me cancela a cobrança já paga (fatura e cobrança "canceled", com canceled_amount);
  // aqui isso vira "refunded" para não se confundir com fatura cancelada antes de cobrar
  const refunded = str(charge?.status) === 'refunded' || (str(charge?.status) === 'canceled' && Number(charge?.paid_amount) > 0 && Number(charge?.canceled_amount) > 0)
  const status = refunded ? 'refunded' : (str(inv.status) ?? 'pending')
  return {
    providerInvoiceId: String(inv.id),
    providerSubscriptionId: str(obj(inv.subscription)?.id) ?? str(inv.subscription_id) ?? str(inv.subscriptionId) ?? '',
    providerChargeId: str(charge?.id),
    amountCents: Number(inv.amount) || 0,
    status,
    paymentMethod: str(inv.payment_method),
    dueAt: date(inv.due_at),
    paidAt: status === 'paid' || status === 'refunded' ?(date(charge?.paid_at) ?? date(inv.updated_at)) : null,
    periodStart: date(cycle?.start_at),
    periodEnd: date(cycle?.end_at),
    failureMessage: status === 'failed' ? (str(tx?.acquirer_message) ?? str(tx?.gateway_response && obj(tx.gateway_response)?.code) ?? 'Pagamento recusado') : null,
    createdAt: date(inv.created_at) ?? new Date(),
  }
}

/** Id da assinatura citada num aviso (webhook) do Pagar.me, qualquer que seja o tipo. null = não é de assinatura. */
export function subscriptionIdFromEvent(event: unknown): string | null {
  const e = obj(event)
  const data = obj(e?.data)
  if (!e || !data) return null
  const type = str(e.type) ?? ''
  if (type.startsWith('subscription.')) return str(data.id)
  const sub = obj(data.subscription)
  const invoice = obj(data.invoice)
  return (
    str(sub?.id) ?? str(data.subscription_id) ?? str(data.subscriptionId) ??
    str(obj(invoice?.subscription)?.id) ?? str(invoice?.subscription_id) ?? str(invoice?.subscriptionId) ?? null
  )
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Confere "Authorization: Basic …" do aviso do Pagar.me. Sem usuário/senha configurados, recusa sempre. */
export function checkBasicAuth(header: string | null, user: string, pass: string): boolean {
  if (!header || !user || !pass || !header.startsWith('Basic ')) return false
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
  const i = decoded.indexOf(':')
  if (i < 0) return false
  return safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), pass)
}

/** Erro do Pagar.me → frase para quem está pagando (nunca o texto técnico cru). */
export function friendlyPaymentError(status: number, body: unknown): string {
  const msg = (str(obj(body)?.message) ?? '').toLowerCase()
  if (msg.includes('card verification failed') || msg.includes('could not create credit card')) {
    return 'Cartão recusado pela operadora. Confira os dados ou use outro cartão.'
  }
  if (msg.includes('antifraud') || msg.includes('antifraude')) return 'Pagamento recusado pela análise antifraude. Use outro cartão ou fale com o banco.'
  if (status === 401 || status === 403) return 'O pagamento está indisponível por um problema de configuração. Nossa equipe já foi avisada; tente mais tarde.'
  if (status === 400 || status === 422) return 'Algum dado do pagamento está inválido. Confira os dados do cartão e do endereço.'
  if (status === 412) return 'Pagamento não autorizado. Confira os dados ou use outro cartão.'
  return 'Não foi possível falar com o Pagar.me agora. Nenhuma cobrança foi feita; tente de novo em alguns minutos.'
}
