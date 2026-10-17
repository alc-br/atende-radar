import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { AuthContext } from '@/lib/api-auth'
import {
  type BillingCycle, deriveFromProvider, effectiveStatus, friendlyPaymentError, isValidDocument, mapInvoice, onlyDigits, priceCents,
  reactivationStartAt, UFS,
} from './core'
import { pagarme, pagarmeConfig, PagarmeError, type Address, type PagarmeConfig } from './pagarme'
import { overageMessage, planOverage } from '@/lib/quotas'
import { milestone } from '@/lib/product-events'

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

// No checkout, espera a 1ª fatura ter um desfecho (paga ou recusada): o Pagar.me às vezes leva alguns segundos para
// cobrar o cartão. Se passar de ~15 s, a tela mostra "em análise" e a sincronização termina o serviço.
async function invoicesFor(cfg: PagarmeConfig, subscriptionId: string, waitForOutcome = false) {
  for (let attempt = 0; ; attempt++) {
    const list = await pagarme.listInvoices(cfg, subscriptionId)
    const decided = list.some((i) => ['paid', 'failed', 'canceled'].includes(mapInvoice(i).status))
    if (decided || !waitForOutcome || attempt >= 10) return list
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
  const derived = deriveFromProvider({
    providerStatus,
    invoices: invoices.map((i) => ({ status: i.status, dueAt: i.dueAt, cycleStart: i.periodStart, cycleEnd: i.periodEnd, createdAt: i.createdAt })),
    prepaid: !!meta.reactivatedFrom, // renovação reativada: o período atual foi pago pela assinatura anterior
  })
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
    await milestone(orgId, 'first_payment') // funil (I7): só a 1ª ativação paga conta; nunca lança erro
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
  const plan = input.planId ? await db.plan.findFirst({ where: { id: input.planId, active: true } }) : null
  if (!plan) return fail(404, 'plan_not_found', 'Plano não encontrado')
  // V7/T11 · rebaixar só quando o uso atual cabe no plano novo (antes de qualquer chamada ao provedor)
  const over = await planOverage(auth.orgId, plan)
  if (over.length) return fail(409, 'plan_limits_exceeded', overageMessage(plan.name, over))
  const cfg = pagarmeConfig()
  if (!cfg) return fail(503, 'billing_disabled', 'O pagamento on-line ainda não está disponível. Use "Solicitar troca".')
  const cycle: BillingCycle = input.cycle === 'annual' ? 'annual' : 'monthly'
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
  // Assinatura paga em vigor: só sobe de plano (mais caro, ou do mensal para o anual do mesmo plano), nunca rebaixa
  if (row.providerSubscriptionId && row.status === 'active') {
    const current = await db.plan.findUnique({ where: { id: row.planId } })
    const downgrade = !!current && (plan.id === current.id ? row.billingCycle === 'annual' && cycle === 'monthly' : plan.monthlyPrice <= current.monthlyPrice)
    if (downgrade) return fail(409, 'downgrade_not_allowed', `Sua empresa assina o plano ${current!.name}. Pela tela dá para subir de plano; para mudar para um plano menor, fale com o suporte.`)
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

/** Prazo do direito de arrependimento (Código de Defesa do Consumidor, art. 49): 7 dias da contratação paga. */
export const WITHDRAWAL_DAYS = 7

/**
 * Pagamento que abriu a contratação vigente, se ainda estiver no prazo de arrependimento. Só a 1ª fatura paga da
 * assinatura vigente conta: renovação não é contratação nova, e a renovação reativada (continuação) não tem fatura paga
 * própria no período atual.
 */
export async function withdrawalOffer(orgId: string, now = new Date()) {
  const cfg = pagarmeConfig()
  const row = await db.subscription.findUnique({ where: { organizationId: orgId } })
  if (!cfg || !row?.providerSubscriptionId || row.billingMode !== cfg.mode || row.status === 'canceled') return null
  const paid = await db.billingInvoice.findMany({ where: { organizationId: orgId, providerSubscriptionId: row.providerSubscriptionId, status: 'paid' }, orderBy: { paidAt: 'asc' } })
  const first = paid[0]
  if (paid.length !== 1 || !first.paidAt || !first.providerChargeId) return null
  const until = new Date(first.paidAt.getTime() + WITHDRAWAL_DAYS * 86400_000)
  if (until.getTime() <= now.getTime()) return null
  return { invoice: first, until, amountCents: first.amountCents }
}

/**
 * Direito de arrependimento: dentro de 7 dias do pagamento que abriu a contratação, a empresa desiste e recebe de volta
 * o valor INTEGRAL no cartão. A cobrança automática para no Pagar.me, o estorno é pedido na hora e o acesso pago termina
 * agora. A assinatura fica desligada do provedor (a sincronização não a reabre); as faturas continuam no histórico.
 */
export async function withdraw(auth: AuthContext, now = new Date()): Promise<Fail | { ok: true; amountCents: number }> {
  const cfg = pagarmeConfig()
  const offer = await withdrawalOffer(auth.orgId, now)
  if (!cfg || !offer) return fail(409, 'withdrawal_unavailable', `O prazo de arrependimento é de ${WITHDRAWAL_DAYS} dias a partir do pagamento da contratação. Fora dele, use "Cancelar assinatura": nada mais é cobrado e o plano vale até o fim do período pago.`)
  const row = await db.subscription.findUniqueOrThrow({ where: { organizationId: auth.orgId }, include: { plan: true } })
  const subId = row.providerSubscriptionId!

  // trava contra clique duplo: só um pedido passa (o outro já encontra a assinatura desligada do provedor)
  const claimed = await db.subscription.updateMany({ where: { organizationId: auth.orgId, providerSubscriptionId: subId }, data: { providerSubscriptionId: null } })
  if (claimed.count !== 1) return fail(409, 'withdrawal_unavailable', 'O pedido de arrependimento já foi feito.')
  const undo = () => db.subscription.update({ where: { organizationId: auth.orgId }, data: { providerSubscriptionId: subId } })

  try {
    // já cancelada (renovação cancelada antes): o Pagar.me recusa um 2º cancelamento, e tudo bem
    if (!row.cancelAtPeriodEnd) await pagarme.cancelSubscription(cfg, subId)
  } catch (e) {
    await undo()
    if (e instanceof PagarmeError) return fail(502, 'provider_error', friendlyPaymentError(e.status, e.body))
    throw e
  }
  try {
    await pagarme.refundCharge(cfg, offer.invoice.providerChargeId!)
  } catch (e) {
    // a renovação já parou no provedor: fica como cancelamento comum (vale até o fim do período) e o estorno vai para o suporte
    await db.subscription.update({ where: { organizationId: auth.orgId }, data: { providerSubscriptionId: subId, cancelAtPeriodEnd: true, lastSyncedAt: now } })
    console.error('[billing] estorno recusado', offer.invoice.providerChargeId, e instanceof PagarmeError ? e.status : e)
    await audit(auth, { action: 'subscription.withdrawal_failed', targetType: 'subscription', targetId: subId, targetLabel: row.plan.name, details: { chargeId: offer.invoice.providerChargeId, amountCents: offer.amountCents } })
    return fail(502, 'refund_failed', 'A renovação foi cancelada, mas o estorno não foi aceito pela operadora agora. Nossa equipe vai concluir o reembolso; se preferir, escreva para contato@atenderadar.com.br.')
  }

  await db.billingInvoice.update({ where: { id: offer.invoice.id }, data: { status: 'refunded' } })
  await db.subscription.update({ where: { organizationId: auth.orgId }, data: { status: 'canceled', cancelAtPeriodEnd: false, currentPeriodEnd: now, lastPaymentError: null, lastSyncedAt: now } })
  const valor = (offer.amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  await audit(auth, { action: 'subscription.withdrawn', targetType: 'subscription', targetId: subId, targetLabel: row.plan.name, details: { chargeId: offer.invoice.providerChargeId, amountCents: offer.amountCents, mode: cfg.mode } })
  await db.notification.create({
    data: {
      organizationId: auth.orgId, type: 'billing', title: 'Contratação desfeita e valor estornado',
      message: `O plano ${row.plan.name} foi encerrado e o estorno de ${valor} foi pedido à operadora do cartão${row.cardLast4 ? ` final ${row.cardLast4}` : ''}. O crédito aparece na fatura do cartão conforme o prazo do banco emissor.`,
    },
  })
  return { ok: true, amountCents: offer.amountCents }
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

/**
 * Reativa a renovação cancelada enquanto o período pago ainda vale (V7).
 *
 * O cancelamento no Pagar.me (DELETE /subscriptions/{id}) é definitivo: a API v5 não tem como "descancelar". Então a
 * reativação cria uma assinatura NOVA que continua a anterior, sem cobrar nada agora:
 * - mesmo cliente e mesmo cartão (card_id da carteira do cliente; o cartão continua lá depois do cancelamento);
 * - mesmo valor, descrição e ciclo da assinatura anterior, lidos do Pagar.me e não do catálogo (preço novo do
 *   catálogo só vale para novas contratações);
 * - start_at = dia seguinte ao fim do período pago. Até lá o Pagar.me não gera fatura (status "future").
 * A assinatura nova passa a ser a vigente (providerSubscriptionId) e leva metadata.reactivatedFrom, que faz a
 * sincronização tratar o período atual como já pago (deriveFromProvider prepaid).
 */
export async function reactivateRenewal(auth: AuthContext): Promise<Fail | { ok: true; nextChargeAt: string; amountCents: number; cardLast4: string | null }> {
  const cfg = pagarmeConfig()
  const row = await db.subscription.findUnique({ where: { organizationId: auth.orgId }, include: { plan: true } })
  if (!row?.providerSubscriptionId || !cfg || row.billingMode !== cfg.mode) return fail(409, 'no_recurring', 'Não há cobrança automática para reativar. Escolha um plano para contratar.')
  if (!row.cancelAtPeriodEnd) return fail(409, 'not_canceled', 'A renovação automática já está ativa.')
  if (row.pendingProviderSubscriptionId) return fail(409, 'change_pending', 'Há uma troca de plano aguardando a confirmação do pagamento. Tente novamente em alguns minutos.')
  const now = new Date()
  // margem de 1 h: o Pagar.me precisa de uma data de início no futuro
  if (effectiveStatus(row, now) !== 'active' || row.currentPeriodEnd.getTime() <= now.getTime() + 3600_000) {
    return fail(409, 'period_over', 'O período pago já terminou. Para voltar, contrate um plano em Planos.')
  }
  const previousId = row.providerSubscriptionId
  const startAt = reactivationStartAt(row.currentPeriodEnd)

  // trava contra clique duplo: só um pedido passa daqui (o outro já encontra cancelAtPeriodEnd = false)
  const claimed = await db.subscription.updateMany({ where: { organizationId: auth.orgId, cancelAtPeriodEnd: true, providerSubscriptionId: previousId }, data: { cancelAtPeriodEnd: false } })
  if (claimed.count !== 1) return fail(409, 'not_canceled', 'A renovação automática já está ativa.')
  const undo = () => db.subscription.update({ where: { organizationId: auth.orgId }, data: { cancelAtPeriodEnd: true } })

  let created: Json
  let amountCents = 0
  try {
    const previous = await pagarme.getSubscription(cfg, previousId)
    const meta = (previous.metadata ?? {}) as Record<string, string>
    const card = (previous.card ?? null) as Json | null
    const customerId = String(((previous.customer ?? {}) as Json).id ?? row.providerCustomerId ?? '')
    const item = (((previous.items ?? []) as Json[])[0] ?? {}) as Json
    amountCents = Number(((item.pricing_scheme ?? {}) as Json).price) || 0
    const cycle: BillingCycle = (meta.cycle ?? row.billingCycle) === 'annual' ? 'annual' : 'monthly'
    if (meta.app !== APP_TAG || meta.organizationId !== auth.orgId) {
      await undo()
      return fail(409, 'no_recurring', 'Não há cobrança automática para reativar. Escolha um plano para contratar.')
    }
    if (!card?.id || card.status !== 'active' || !customerId || amountCents <= 0) {
      await undo()
      return fail(409, 'card_unavailable', 'O cartão da assinatura não está mais disponível. Para continuar depois do período pago, contrate de novo em Planos.')
    }
    created = await pagarme.createContinuation(cfg, {
      customerId,
      cardId: String(card.id),
      startAt,
      interval: cycle === 'annual' ? 'year' : 'month',
      priceCents: amountCents,
      description: String(item.description ?? `AtendeRadar ${row.plan.name} (${cycle === 'annual' ? 'anual' : 'mensal'})`),
      metadata: { app: APP_TAG, organizationId: auth.orgId, planId: meta.planId ?? row.planId, planCode: meta.planCode ?? row.plan.code, cycle, reactivatedFrom: previousId },
    })
  } catch (e) {
    await undo()
    if (e instanceof PagarmeError) {
      console.error('[billing] reativação recusada', e.status, JSON.stringify(e.body)?.slice(0, 300))
      return fail(502, 'provider_error', friendlyPaymentError(e.status, e.body))
    }
    throw e
  }

  const newId = String(created.id)
  const updated = await db.subscription.update({ where: { organizationId: auth.orgId }, data: { providerSubscriptionId: newId, ...cardOf(created), lastSyncedAt: now } })
  const valor = (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const data = startAt.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) // start_at é uma data (meia-noite UTC)
  await audit(auth, { action: 'subscription.reactivated', targetType: 'subscription', targetId: newId, targetLabel: row.plan.name, details: { previous: previousId, nextChargeAt: startAt.toISOString(), amountCents, mode: cfg.mode } })
  await db.notification.create({
    data: {
      organizationId: auth.orgId,
      type: 'billing',
      title: 'Renovação automática reativada',
      message: `O plano ${row.plan.name} volta a renovar sozinho. A próxima cobrança, de ${valor}, será em ${data}${updated.cardLast4 ? ` no cartão final ${updated.cardLast4}` : ''}. Nada foi cobrado agora.`,
    },
  })
  return { ok: true, nextChargeAt: startAt.toISOString(), amountCents, cardLast4: updated.cardLast4 }
}
