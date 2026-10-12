import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { AuthContext } from '@/lib/api-auth'
import {
  type BillingCycle, deriveFromProvider, friendlyPaymentError, isValidDocument, mapInvoice, onlyDigits, priceCents, UFS,
} from './core'
import { pagarme, pagarmeConfig, PagarmeError, type Address, type PagarmeConfig } from './pagarme'

// Cobrança recorrente (B8) com Pagar.me. A fonte de verdade é o provedor: toda mudança de situação passa por
// applyProviderState(), que lê a assinatura e as faturas DIRETO da API (o conteúdo do webhook nunca é confiado).

export const APP_TAG = 'atende-radar'

type Json = Record<string, unknown>
type Fail = { ok: false; status: number; code: string; error: string }
const fail = (status: number, code: string, error: string): Fail => ({ ok: false, status, code, error })

export interface CheckoutInput {
  planId?: string
  cycle?: string
  cardToken?: string
  holder?: { name?: string; email?: string; document?: string; phone?: string }
  address?: { zipCode?: string; street?: string; number?: string; complement?: string; neighborhood?: string; city?: string; state?: string }
}

interface CleanAddress { zipCode: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string }

function cleanAddress(a: CheckoutInput['address']): CleanAddress | string {
  const v = {
    zipCode: onlyDigits(a?.zipCode ?? ''),
    street: (a?.street ?? '').trim(),
    number: (a?.number ?? '').trim(),
    complement: (a?.complement ?? '').trim(),
    neighborhood: (a?.neighborhood ?? '').trim(),
    city: (a?.city ?? '').trim(),
    state: (a?.state ?? '').trim().toUpperCase(),
  }
  if (v.zipCode.length !== 8) return 'CEP inválido'
  if (!v.street || !v.number || !v.neighborhood || !v.city) return 'Preencha o endereço de cobrança completo'
  if (!UFS.includes(v.state)) return 'UF inválida'
  return v
}

const toProviderAddress = (a: CleanAddress): Address => ({
  line_1: `${a.number}, ${a.street}, ${a.neighborhood}`.slice(0, 256),
  ...(a.complement ? { line_2: a.complement.slice(0, 128) } : {}),
  zip_code: a.zipCode,
  city: a.city.slice(0, 64),
  state: a.state,
  country: 'BR',
})

const cardOf = (sub: Json) => {
  const card = (sub.card ?? null) as Json | null
  return { cardBrand: (card?.brand as string) ?? null, cardLast4: (card?.last_four_digits as string) ?? null }
}

async function invoicesFor(cfg: PagarmeConfig, subscriptionId: string, waitForFirst = false) {
  for (let attempt = 0; ; attempt++) {
    const list = await pagarme.listInvoices(cfg, subscriptionId)
    if (list.length || !waitForFirst || attempt >= 4) return list
    await new Promise((r) => setTimeout(r, 1500))
  }
}

export type ApplyOutcome =
  | { kind: 'synced'; status: string }
  | { kind: 'activated'; planName: string }
  | { kind: 'pending' }
  | { kind: 'failed'; message: string }
  | { kind: 'ignored'; reason: string }

/**
 * Aplica o que o Pagar.me diz sobre UMA assinatura à empresa dona dela.
 * - assinatura vigente: atualiza situação, período e cartão;
 * - assinatura nova (troca de plano): só troca o plano quando a 1ª fatura estiver PAGA; aí cancela a anterior no provedor.
 */
export async function applyProviderState(cfg: PagarmeConfig, orgId: string, providerSub: Json, rawInvoices?: Json[]): Promise<ApplyOutcome> {
  const subId = String(providerSub.id)
  const meta = (providerSub.metadata ?? {}) as Record<string, string>
  if (meta.app !== APP_TAG || meta.organizationId !== orgId) return { kind: 'ignored', reason: 'assinatura de outro sistema' }
  const row = await db.subscription.findUnique({ where: { organizationId: orgId }, include: { plan: true } })
  if (!row) return { kind: 'ignored', reason: 'empresa sem assinatura' }

  const plan = meta.planId ? await db.plan.findUnique({ where: { id: meta.planId } }) : null
  const cycle: BillingCycle = meta.cycle === 'annual' ? 'annual' : 'monthly'
  const invoices = (rawInvoices ?? (await invoicesFor(cfg, subId))).map(mapInvoice)
  for (const inv of invoices) {
    const data = { ...inv, providerSubscriptionId: inv.providerSubscriptionId || subId, organizationId: orgId, planId: plan?.id ?? null, planName: plan?.name ?? null, billingCycle: cycle }
    await db.billingInvoice.upsert({ where: { providerInvoiceId: inv.providerInvoiceId }, create: data, update: data })
  }
  const providerStatus = String(providerSub.status ?? '')
  const derived = deriveFromProvider({ providerStatus, invoices: invoices.map((i) => ({ status: i.status, dueAt: i.dueAt, cycleStart: i.periodStart, cycleEnd: i.periodEnd, createdAt: i.createdAt })) })
  const latestFailure = [...invoices].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).find((i) => i.status === 'failed')?.failureMessage ?? null
  const now = new Date()

  if (row.providerSubscriptionId === subId) {
    // cancelada a pedido do cliente: continua valendo até o fim do período pago (effectiveStatus cuida da virada)
    const status = derived.status === 'canceled' && row.cancelAtPeriodEnd ? 'active' : derived.status
    await db.subscription.update({
      where: { organizationId: orgId },
      data: {
        status,
        ...(derived.periodStart && derived.periodEnd ? { currentPeriodStart: derived.periodStart, currentPeriodEnd: derived.periodEnd } : {}),
        ...cardOf(providerSub),
        lastPaymentError: status === 'past_due' ? latestFailure ?? 'Pagamento da renovação pendente' : null,
        lastSyncedAt: now,
      },
    })
    if (status !== row.status && status === 'past_due') {
      await db.notification.create({ data: { organizationId: orgId, type: 'billing', title: 'Pagamento da assinatura não confirmado', message: latestFailure ? `Motivo informado pela operadora: ${latestFailure}. Atualize o cartão em Planos.` : 'Atualize o cartão em Planos para não perder o acesso.' } })
    }
    return { kind: 'synced', status }
  }

  // assinatura nova (checkout ou troca de plano)
  if (derived.everPaid && providerStatus !== 'canceled' && plan) {
    const previous = row.providerSubscriptionId
    await db.subscription.update({
      where: { organizationId: orgId },
      data: {
        planId: plan.id,
        status: 'active',
        billingProvider: 'pagarme',
        billingMode: cfg.mode,
        billingCycle: cycle,
        paymentMethod: 'credit_card',
        providerCustomerId: String(((providerSub.customer ?? {}) as Json).id ?? row.providerCustomerId ?? ''),
        providerSubscriptionId: subId,
        pendingProviderSubscriptionId: null,
        currentPeriodStart: derived.periodStart ?? now,
        currentPeriodEnd: derived.periodEnd ?? now,
        trialEnd: null,
        cancelAtPeriodEnd: false,
        ...cardOf(providerSub),
        lastPaymentError: null,
        lastSyncedAt: now,
      },
    })
    // a assinatura anterior para de cobrar (sem proporcional: avisado no checkout)
    if (previous && previous !== subId && row.billingMode === cfg.mode) {
      await pagarme.cancelSubscription(cfg, previous).catch((e) => console.error('[billing] falha ao cancelar assinatura anterior', previous, e instanceof Error ? e.message : e))
    }
    await db.notification.create({ data: { organizationId: orgId, type: 'billing', title: `Plano ${plan.name} ativo`, message: `Pagamento confirmado. A renovação é automática (${cycle === 'annual' ? 'anual' : 'mensal'}) no mesmo cartão.` } })
    return { kind: 'activated', planName: plan.name }
  }
  if (providerStatus === 'canceled' || invoices.some((i) => i.status === 'failed')) {
    if (row.pendingProviderSubscriptionId === subId) await db.subscription.update({ where: { organizationId: orgId }, data: { pendingProviderSubscriptionId: null } })
    return { kind: 'failed', message: latestFailure ?? 'Pagamento não autorizado' }
  }
  if (row.pendingProviderSubscriptionId !== subId) await db.subscription.update({ where: { organizationId: orgId }, data: { pendingProviderSubscriptionId: subId } })
  return { kind: 'pending' }
}

export async function checkout(auth: AuthContext, input: CheckoutInput): Promise<Fail | { ok: true; status: 'active' | 'processing'; planName: string; mode: string }> {
  const cfg = pagarmeConfig()
  if (!cfg) return fail(503, 'billing_disabled', 'O pagamento on-line ainda não está disponível. Use "Solicitar troca".')
  const cycle: BillingCycle = input.cycle === 'annual' ? 'annual' : 'monthly'
  const plan = input.planId ? await db.plan.findFirst({ where: { id: input.planId, active: true } }) : null
  if (!plan) return fail(404, 'plan_not_found', 'Plano não encontrado')
  const amount = priceCents(plan, cycle)
  if (amount <= 0) return fail(400, 'invalid_price', 'Este plano não tem preço para o ciclo escolhido')
  if (!input.cardToken || !/^token_[A-Za-z0-9]+$/.test(input.cardToken)) return fail(400, 'invalid_card', 'Dados do cartão não recebidos. Preencha o cartão de novo.')

  const name = (input.holder?.name ?? '').trim()
  const email = (input.holder?.email ?? '').trim().toLowerCase()
  const doc = isValidDocument(input.holder?.document ?? '')
  const phone = onlyDigits(input.holder?.phone ?? '')
  if (name.length < 3) return fail(400, 'invalid_name', 'Informe o nome ou a razão social')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'invalid_email', 'E-mail de cobrança inválido')
  if (!doc.ok) return fail(400, 'invalid_document', 'CPF ou CNPJ inválido')
  if (phone.length < 10 || phone.length > 11) return fail(400, 'invalid_phone', 'Celular inválido (DDD + número)')
  const address = cleanAddress(input.address)
  if (typeof address === 'string') return fail(400, 'invalid_address', address)

  const row = await db.subscription.findUnique({ where: { organizationId: auth.orgId } })
  if (!row) return fail(409, 'no_subscription', 'Empresa sem assinatura cadastrada. Fale com o suporte.')
  if (row.providerSubscriptionId && row.planId === plan.id && row.billingCycle === cycle && row.status === 'active' && !row.cancelAtPeriodEnd) {
    return fail(409, 'already_subscribed', `Sua empresa já assina o plano ${plan.name} neste ciclo.`)
  }

  let providerSub: Json
  try {
    const customer = await pagarme.createCustomer(cfg, {
      name: name.slice(0, 64),
      email: email.slice(0, 64),
      document: doc.digits,
      document_type: doc.type,
      type: doc.type === 'CNPJ' ? 'company' : 'individual',
      code: auth.orgId,
      phones: { mobile_phone: { country_code: '55', area_code: phone.slice(0, 2), number: phone.slice(2) } },
      address: toProviderAddress(address),
    })
    providerSub = await pagarme.createSubscription(cfg, {
      customerId: customer.id,
      cardToken: input.cardToken,
      billingAddress: toProviderAddress(address),
      interval: cycle === 'annual' ? 'year' : 'month',
      priceCents: amount,
      description: `AtendeRadar ${plan.name} (${cycle === 'annual' ? 'anual' : 'mensal'})`,
      metadata: { app: APP_TAG, organizationId: auth.orgId, planId: plan.id, planCode: plan.code, cycle },
    })
    await db.subscription.update({ where: { organizationId: auth.orgId }, data: { providerCustomerId: customer.id } })
  } catch (e) {
    if (e instanceof PagarmeError) {
      console.error('[billing] checkout recusado', e.status, JSON.stringify(e.body)?.slice(0, 300))
      return fail(e.status === 0 || e.status >= 500 ? 502 : 402, 'payment_declined', friendlyPaymentError(e.status, e.body))
    }
    throw e
  }

  const outcome = await applyProviderState(cfg, auth.orgId, providerSub, await invoicesFor(cfg, String(providerSub.id), true))
  await audit(auth, { action: 'subscription.changed', targetType: 'subscription', targetId: String(providerSub.id), targetLabel: plan.name, details: { cycle, provider: 'pagarme', mode: cfg.mode, outcome: outcome.kind } })
  if (outcome.kind === 'failed') {
    await pagarme.cancelSubscription(cfg, String(providerSub.id)).catch(() => {})
    return fail(402, 'payment_declined', `Pagamento recusado: ${outcome.message}. Nenhum valor foi cobrado; confira os dados ou use outro cartão.`)
  }
  if (outcome.kind === 'activated') return { ok: true, status: 'active', planName: plan.name, mode: cfg.mode }
  return { ok: true, status: 'processing', planName: plan.name, mode: cfg.mode }
}

/** Reconsulta o provedor para a empresa (assinatura vigente e troca pendente). Silencioso em falha de rede. */
export async function syncOrganization(orgId: string, opts: { maxAgeMs?: number } = {}): Promise<void> {
  const cfg = pagarmeConfig()
  if (!cfg) return
  const row = await db.subscription.findUnique({ where: { organizationId: orgId } })
  if (!row || (row.billingMode && row.billingMode !== cfg.mode && !row.pendingProviderSubscriptionId)) return
  if (opts.maxAgeMs && row.lastSyncedAt && Date.now() - row.lastSyncedAt.getTime() < opts.maxAgeMs && !row.pendingProviderSubscriptionId) return
  const ids = [row.billingMode === cfg.mode ? row.providerSubscriptionId : null, row.pendingProviderSubscriptionId].filter((x): x is string => !!x)
  for (const id of ids) {
    try {
      await applyProviderState(cfg, orgId, await pagarme.getSubscription(cfg, id))
    } catch (e) {
      console.error('[billing] sync falhou', orgId, id, e instanceof Error ? e.message : e)
    }
  }
}

/** Varredura periódica (agendador): renovações, recusas e cancelamentos que vencem, mesmo sem webhook configurado. */
export async function billingSweep(): Promise<number> {
  const cfg = pagarmeConfig()
  if (!cfg) return 0
  const staleBefore = new Date(Date.now() - 55 * 60_000)
  const rows = await db.subscription.findMany({
    where: {
      OR: [
        { billingMode: cfg.mode, providerSubscriptionId: { not: null }, OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleBefore } }] },
        { pendingProviderSubscriptionId: { not: null } },
      ],
    },
    select: { organizationId: true },
    take: 500,
  })
  for (const r of rows) await syncOrganization(r.organizationId)
  // cancelada que chegou ao fim do período pago
  await db.subscription.updateMany({ where: { cancelAtPeriodEnd: true, status: { not: 'canceled' }, currentPeriodEnd: { lt: new Date() } }, data: { status: 'canceled' } })
  return rows.length
}

export async function cancelAtPeriodEnd(auth: AuthContext): Promise<Fail | { ok: true; until: string }> {
  const cfg = pagarmeConfig()
  const row = await db.subscription.findUnique({ where: { organizationId: auth.orgId }, include: { plan: true } })
  if (!row?.providerSubscriptionId || !cfg || row.billingMode !== cfg.mode) return fail(409, 'no_recurring', 'Não há cobrança automática ativa para cancelar.')
  if (row.cancelAtPeriodEnd) return fail(409, 'already_canceled', 'A renovação já está cancelada.')
  try {
    await pagarme.cancelSubscription(cfg, row.providerSubscriptionId)
  } catch (e) {
    if (e instanceof PagarmeError) return fail(502, 'provider_error', friendlyPaymentError(e.status, e.body))
    throw e
  }
  await db.subscription.update({ where: { organizationId: auth.orgId }, data: { cancelAtPeriodEnd: true, lastSyncedAt: new Date() } })
  await audit(auth, { action: 'subscription.canceled', targetType: 'subscription', targetId: row.providerSubscriptionId, targetLabel: row.plan.name, details: { until: row.currentPeriodEnd.toISOString() } })
  await db.notification.create({ data: { organizationId: auth.orgId, type: 'billing', title: 'Renovação automática cancelada', message: `O plano ${row.plan.name} vale até ${row.currentPeriodEnd.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Nenhuma nova cobrança será feita.` } })
  return { ok: true, until: row.currentPeriodEnd.toISOString() }
}

export async function replaceCard(auth: AuthContext, input: { cardToken?: string; address?: CheckoutInput['address'] }): Promise<Fail | { ok: true; cardBrand: string | null; cardLast4: string | null }> {
  const cfg = pagarmeConfig()
  const row = await db.subscription.findUnique({ where: { organizationId: auth.orgId } })
  if (!row?.providerSubscriptionId || !cfg || row.billingMode !== cfg.mode || row.cancelAtPeriodEnd) return fail(409, 'no_recurring', 'Não há cobrança automática ativa para trocar o cartão.')
  if (!input.cardToken || !/^token_[A-Za-z0-9]+$/.test(input.cardToken)) return fail(400, 'invalid_card', 'Dados do cartão não recebidos. Preencha o cartão de novo.')
  const address = cleanAddress(input.address)
  if (typeof address === 'string') return fail(400, 'invalid_address', address)
  try {
    await pagarme.updateCard(cfg, row.providerSubscriptionId, input.cardToken, toProviderAddress(address))
    const sub = await pagarme.getSubscription(cfg, row.providerSubscriptionId)
    await applyProviderState(cfg, auth.orgId, sub)
  } catch (e) {
    if (e instanceof PagarmeError) return fail(e.status >= 500 || e.status === 0 ? 502 : 402, 'card_declined', friendlyPaymentError(e.status, e.body))
    throw e
  }
  const updated = await db.subscription.findUnique({ where: { organizationId: auth.orgId } })
  await audit(auth, { action: 'billing.card_updated', targetType: 'subscription', targetId: row.providerSubscriptionId, details: { brand: updated?.cardBrand ?? null } })
  return { ok: true, cardBrand: updated?.cardBrand ?? null, cardLast4: updated?.cardLast4 ?? null }
}
