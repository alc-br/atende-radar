import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import type { AuthContext } from '@/lib/api-auth'
import {
  type BillingCycle, deriveFromProvider, effectiveStatus, friendlyPaymentError, graceEndsAt, isValidDocument, keepRefunded, mapInvoice, onlyDigits,
  priceCents, reactivationStartAt, UFS,
} from './core'
import { pagarme, pagarmeConfig, PagarmeError, type Address, type PagarmeConfig } from './pagarme'
import { overageMessage, planOverage } from '@/lib/quotas'
import { milestone } from '@/lib/product-events'
import {
  activatedEmail, billingEmail, cardUpdatedEmail, paymentFailedEmail, planEndedEmail, providerCanceledEmail, reactivatedEmail, refundFailedEmail,
  renewalCanceledEmail, renewalPaidEmail, withdrawnEmail,
} from './emails'
import { notifyOnce } from './analysis-gate'
import { kickNfse, saveBillingCustomer, updateBillingAddress } from '@/lib/nfse/service'
import { parseAttribution, withCampaign, type Attribution } from '@/lib/attribution'
import { hashedContact, purchaseEventId, queueConversion, renewalEventId } from '@/lib/conversions'
import { appUrl } from '@/lib/mailer'

// Cobrança recorrente (B8) com Pagar.me. A fonte de verdade é o provedor: toda mudança de situação passa por
// applyProviderState(), que lê a assinatura e as faturas DIRETO da API (o conteúdo do webhook nunca é confiado).

export const APP_TAG = 'atende-radar'

type Json = Record<string, unknown>
type Fail = { ok: false; status: number; code: string; error: string }
const fail = (status: number, code: string, error: string): Fail => ({ ok: false, status, code, error })

// Origem da contratação, gravada no checkout (Subscription.attribution) para a conversão do servidor
// (lib/conversions.ts): a assinatura do Pagar.me, a campanha/cookies/consentimento e o contato só em hash.
interface CheckoutOrigin { sub: string; at: Attribution | null; em: string; ph?: string; externalId: string }

const checkoutOrigin = (json: string | null | undefined, subId: string): CheckoutOrigin | null => {
  const o = parseAttribution(json) as unknown as CheckoutOrigin | null
  return o && o.sub === subId ? o : null
}

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
  for (const fresh of invoices) {
    const current = await db.billingInvoice.findUnique({ where: { providerInvoiceId: fresh.providerInvoiceId }, select: { status: true, paidAt: true } })
    const inv = keepRefunded(fresh, current?.status)
    if (inv !== fresh) inv.paidAt = current?.paidAt ?? fresh.paidAt
    const data = { ...inv, providerSubscriptionId: inv.providerSubscriptionId || subId, organizationId: orgId, planId: plan?.id ?? null, planName: plan?.name ?? null, billingCycle: cycle }
    await db.billingInvoice.upsert({ where: { providerInvoiceId: inv.providerInvoiceId }, create: data, update: data })
  }
  // NFS-e: fatura paga gera nota; reembolsada (inclusive pelo painel do Pagar.me) cancela a nota
  kickNfse()
  const providerStatus = String(providerSub.status ?? '')
  const derived = deriveFromProvider({
    providerStatus,
    invoices: invoices.map((i) => ({ status: i.status, dueAt: i.dueAt, cycleStart: i.periodStart, cycleEnd: i.periodEnd, createdAt: i.createdAt })),
    prepaid: !!meta.reactivatedFrom, // renovação reativada: o período atual foi pago pela assinatura anterior
  })
  const byDate = [...invoices].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const latestFailure = byDate.find((i) => i.status === 'failed')?.failureMessage ?? null
  const now = new Date()

  if (row.providerSubscriptionId === subId) {
    // cancelada pela operadora depois das tentativas sem pagamento (não a pedido do cliente): a empresa segue na
    // tolerância da inadimplência (past_due) até ela acabar; para voltar a pagar, contrata de novo
    const latestFailed = byDate.find((i) => i.status !== 'canceled')?.status === 'failed'
    const providerGaveUp = derived.status === 'canceled' && !row.cancelAtPeriodEnd && (row.status === 'past_due' || latestFailed)
    // cancelada a pedido do cliente: continua valendo até o fim do período pago (effectiveStatus cuida da virada)
    const status = derived.status === 'canceled' && row.cancelAtPeriodEnd ? 'active' : providerGaveUp ? 'past_due' : derived.status
    // início da inadimplência: conta os 7 dias de tolerância (PAST_DUE_GRACE_DAYS); some quando a fatura é paga
    const pastDueSince = status === 'past_due' ? row.pastDueSince ?? now : null
    await db.subscription.update({
      where: { organizationId: orgId },
      data: {
        status,
        pastDueSince,
        ...(derived.periodStart && derived.periodEnd ? { currentPeriodStart: derived.periodStart, currentPeriodEnd: derived.periodEnd } : {}),
        ...cardOf(providerSub),
        lastPaymentError: status === 'past_due' ? latestFailure ?? 'Pagamento da renovação pendente' : null,
        lastSyncedAt: now,
      },
    })
    const graceEnd = graceEndsAt({ status, pastDueSince })
    if (status !== row.status && status === 'past_due') {
      await db.notification.create({ data: { organizationId: orgId, type: 'billing', title: 'Pagamento da assinatura não confirmado', message: `${latestFailure ? `Motivo informado pela operadora: ${latestFailure}. ` : ''}Tudo continua funcionando por 7 dias. Troque o cartão em Planos: a fatura em aberto é cobrada na hora.` } })
      await billingEmail(orgId, 'payment_failed', `${subId}:${(derived.periodEnd ?? row.currentPeriodEnd).toISOString()}`, paymentFailedEmail(row.plan.name, latestFailure, graceEnd!))
    }
    if (providerGaveUp) {
      await notifyOnce(orgId, { kind: 'provider_canceled', subscription: subId }, 'Cobrança automática encerrada pela operadora', 'Depois das tentativas sem sucesso, a operadora encerrou a cobrança automática. Para continuar usando o AtendeRadar, contrate o plano de novo em Planos.')
      await billingEmail(orgId, 'provider_canceled', subId, providerCanceledEmail(row.plan.name, graceEnd, now))
    }
    // recibo das renovações pagas nos últimos 7 dias (uma vez por fatura). A 1ª fatura paga da assinatura é a da
    // contratação e já teve o e-mail de ativação; na renovação reativada (prepaid) toda fatura paga é renovação.
    const paid = invoices.filter((i) => i.status === 'paid' && i.paidAt).sort((a, b) => a.paidAt!.getTime() - b.paidAt!.getTime())
    for (const inv of meta.reactivatedFrom ? paid : paid.slice(1)) {
      if (now.getTime() - inv.paidAt!.getTime() > 7 * 86400_000) continue
      // renovação não é conversão: fica registrada, nada vai para o GA4/Meta
      await queueConversion('renewal', renewalEventId(inv.providerInvoiceId), orgId, {
        eventTime: Math.floor(inv.paidAt!.getTime() / 1000), sourceUrl: `${appUrl()}/`, attribution: null, sandbox: cfg.mode !== 'live',
        value: inv.amountCents / 100, currency: 'BRL', invoiceId: inv.providerInvoiceId,
      })
      await billingEmail(orgId, 'renewal_paid', inv.providerInvoiceId, renewalPaidEmail(row.plan.name, inv.amountCents, inv.periodEnd ?? derived.periodEnd, cardOf(providerSub).cardLast4))
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
        pastDueSince: null,
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
    const firstPaid = invoices.filter((i) => i.status === 'paid').sort((a, b) => (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0))[0]
    await billingEmail(orgId, 'activated', subId, activatedEmail(plan.name, cycle, firstPaid?.amountCents ?? 0, derived.periodEnd, cardOf(providerSub).cardLast4))
    // conversão "compra": a 1ª cobrança paga desta assinatura, uma vez (o id é o da assinatura). Reativação não é venda.
    if (!meta.reactivatedFrom) {
      const origin = checkoutOrigin(row.attribution, subId)
      const org = await db.organization.findUnique({ where: { id: orgId }, select: { attribution: true } })
      const value = (firstPaid?.amountCents ?? 0) / 100
      await queueConversion('purchase', purchaseEventId(subId), orgId, {
        eventTime: Math.floor((firstPaid?.paidAt ?? now).getTime() / 1000),
        sourceUrl: `${appUrl()}/`,
        attribution: withCampaign(origin?.at ?? null, parseAttribution(org?.attribution)),
        em: origin?.em, ph: origin?.ph, externalId: origin?.externalId,
        sandbox: cfg.mode !== 'live',
        value, currency: 'BRL', transactionId: subId,
        items: [{ item_id: plan.code, item_name: plan.name, item_variant: cycle, price: value, quantity: 1 }],
      })
    }
    return { kind: 'activated', planName: plan.name }
  }
  if (providerStatus === 'canceled' || invoices.some((i) => i.status === 'failed')) {
    if (row.pendingProviderSubscriptionId === subId) await db.subscription.update({ where: { organizationId: orgId }, data: { pendingProviderSubscriptionId: null } })
    return { kind: 'failed', message: latestFailure ?? 'Pagamento não autorizado' }
  }
  if (row.pendingProviderSubscriptionId !== subId) await db.subscription.update({ where: { organizationId: orgId }, data: { pendingProviderSubscriptionId: subId } })
  return { kind: 'pending' }
}

export async function checkout(auth: AuthContext, input: CheckoutInput, visit: Attribution | null = null): Promise<Fail | { ok: true; status: 'active' | 'processing'; planName: string; mode: string; subscriptionId: string }> {
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
    const origin: CheckoutOrigin = { sub: String(providerSub.id), at: visit, ...hashedContact(email, phone, auth.orgId) }
    await db.subscription.update({ where: { organizationId: auth.orgId }, data: { providerCustomerId: customer.id, attribution: JSON.stringify(origin) } })
    // tomador da NFS-e: os mesmos dados enviados ao Pagar.me
    await saveBillingCustomer(auth.orgId, { name, email, documentType: doc.type, document: doc.digits, address })
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
  const subscriptionId = String(providerSub.id)
  if (outcome.kind === 'activated') return { ok: true, status: 'active', planName: plan.name, mode: cfg.mode, subscriptionId }
  return { ok: true, status: 'processing', planName: plan.name, mode: cfg.mode, subscriptionId }
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
  await endExpiredPlans()
  return rows.length
}

/**
 * Renovação cancelada que chegou ao fim do período pago: encerra e avisa os administradores (o painel fica bloqueado).
 * Roda na varredura de cobrança e no POST /api/gateway/tick. Devolve quantas encerrou.
 */
export async function endExpiredPlans(now = new Date(), orgId?: string): Promise<number> {
  const ended = await db.subscription.findMany({
    where: { cancelAtPeriodEnd: true, status: { not: 'canceled' }, currentPeriodEnd: { lt: now }, ...(orgId ? { organizationId: orgId } : {}) },
    select: { id: true, organizationId: true, providerSubscriptionId: true, currentPeriodEnd: true, plan: { select: { name: true } } },
    take: 500,
  })
  let count = 0
  for (const s of ended) {
    const done = await db.subscription.updateMany({ where: { id: s.id, status: { not: 'canceled' } }, data: { status: 'canceled' } })
    if (done.count !== 1) continue
    await db.notification.create({ data: { organizationId: s.organizationId, type: 'billing', title: `O plano ${s.plan.name} terminou`, message: 'O período pago acabou e a renovação estava cancelada. Contrate um plano em Planos para voltar a usar o painel.' } })
    await billingEmail(s.organizationId, 'plan_ended', `${s.providerSubscriptionId ?? s.id}:${s.currentPeriodEnd.toISOString()}`, planEndedEmail(s.plan.name))
    count++
  }
  return count
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
  await billingEmail(auth.orgId, 'renewal_canceled', row.providerSubscriptionId, renewalCanceledEmail(row.plan.name, row.currentPeriodEnd))
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
    await billingEmail(auth.orgId, 'refund_failed', offer.invoice.providerChargeId!, refundFailedEmail(row.plan.name, offer.amountCents))
    return fail(502, 'refund_failed', 'A renovação foi cancelada, mas o estorno não foi aceito pela operadora agora. Nossa equipe vai concluir o reembolso; se preferir, escreva para contato@atenderadar.com.br.')
  }

  await db.billingInvoice.update({ where: { id: offer.invoice.id }, data: { status: 'refunded' } })
  kickNfse() // a NFS-e da contratação é cancelada
  await db.subscription.update({ where: { organizationId: auth.orgId }, data: { status: 'canceled', cancelAtPeriodEnd: false, currentPeriodEnd: now, lastPaymentError: null, lastSyncedAt: now } })
  const valor = (offer.amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  await audit(auth, { action: 'subscription.withdrawn', targetType: 'subscription', targetId: subId, targetLabel: row.plan.name, details: { chargeId: offer.invoice.providerChargeId, amountCents: offer.amountCents, mode: cfg.mode } })
  await db.notification.create({
    data: {
      organizationId: auth.orgId, type: 'billing', title: 'Contratação desfeita e valor estornado',
      message: `O plano ${row.plan.name} foi encerrado e o estorno de ${valor} foi pedido à operadora do cartão${row.cardLast4 ? ` final ${row.cardLast4}` : ''}. O crédito aparece na fatura do cartão conforme o prazo do banco emissor.`,
    },
  })
  await billingEmail(auth.orgId, 'withdrawn', offer.invoice.providerChargeId!, withdrawnEmail(row.plan.name, offer.amountCents, row.cardLast4))
  return { ok: true, amountCents: offer.amountCents }
}

export async function replaceCard(auth: AuthContext, input: { cardToken?: string; address?: CheckoutInput['address'] }): Promise<Fail | { ok: true; cardBrand: string | null; cardLast4: string | null; openInvoicePaid?: true }> {
  const cfg = pagarmeConfig()
  const row = await db.subscription.findUnique({ where: { organizationId: auth.orgId } })
  if (!row?.providerSubscriptionId || !cfg || row.billingMode !== cfg.mode || row.cancelAtPeriodEnd) return fail(409, 'no_recurring', 'Não há cobrança automática ativa para trocar o cartão.')
  if (!input.cardToken || !/^token_[A-Za-z0-9]+$/.test(input.cardToken)) return fail(400, 'invalid_card', 'Dados do cartão não recebidos. Preencha o cartão de novo.')
  const address = cleanAddress(input.address)
  if (typeof address === 'string') return fail(400, 'invalid_address', address)
  const subId = row.providerSubscriptionId
  let paidNow: boolean | null = null // null: não havia fatura em aberto
  try {
    const current = await pagarme.getSubscription(cfg, subId)
    if (String(current.status ?? '') === 'canceled') {
      await applyProviderState(cfg, auth.orgId, current)
      return fail(409, 'provider_canceled', 'A cobrança automática foi encerrada pela operadora depois das tentativas sem sucesso. Contrate o plano de novo em Planos.')
    }
    const changed = await pagarme.updateCard(cfg, subId, input.cardToken, toProviderAddress(address))
    await updateBillingAddress(auth.orgId, address)
    // renovação em aberto (recusada): cobra a fatura na hora no cartão novo. Só trocar o cartão da assinatura não
    // cobra de novo (o Pagar.me retentaria no cartão antigo).
    const open = (await pagarme.listInvoices(cfg, subId)).map(mapInvoice)
      .filter((i) => i.status !== 'canceled').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    const newCardId = String(((changed.card ?? {}) as Json).id ?? '')
    if (open && open.providerChargeId && newCardId && (open.status === 'failed' || (open.status === 'pending' && open.dueAt && open.dueAt.getTime() < Date.now()))) {
      const charge = await pagarme.updateChargeCard(cfg, open.providerChargeId, newCardId).catch((e) => {
        if (e instanceof PagarmeError) return null // cartão novo recusado: a fatura continua em aberto
        throw e
      })
      paidNow = String(charge?.status ?? '') === 'paid'
    }
    await applyProviderState(cfg, auth.orgId, await pagarme.getSubscription(cfg, subId))
    // cobrança aprovada, mas a leitura logo em seguida pode ainda trazer a fatura recusada (o Pagar.me demora a
    // refletir): relê por alguns segundos para a empresa não ficar inadimplente depois de pagar
    for (let i = 0; paidNow && i < 8; i++) {
      const s = await db.subscription.findUnique({ where: { organizationId: auth.orgId }, select: { status: true } })
      if (s?.status !== 'past_due' && s?.status !== 'unpaid') break
      await new Promise((r) => setTimeout(r, 1000))
      await applyProviderState(cfg, auth.orgId, await pagarme.getSubscription(cfg, subId))
    }
  } catch (e) {
    if (e instanceof PagarmeError) return fail(e.status >= 500 || e.status === 0 ? 502 : 402, 'card_declined', friendlyPaymentError(e.status, e.body))
    throw e
  }
  const updated = await db.subscription.findUnique({ where: { organizationId: auth.orgId } })
  await audit(auth, { action: 'billing.card_updated', targetType: 'subscription', targetId: subId, details: { brand: updated?.cardBrand ?? null, ...(paidNow === null ? {} : { openInvoicePaid: paidNow }) } })
  await billingEmail(auth.orgId, 'card_updated', `${subId}:${Date.now()}`, cardUpdatedEmail(updated?.cardBrand ?? null, updated?.cardLast4 ?? null))
  if (paidNow === false) {
    return fail(402, 'card_declined', 'O cartão novo foi salvo, mas a cobrança da fatura em aberto não foi aprovada. Confira os dados ou use outro cartão.')
  }
  return { ok: true, cardBrand: updated?.cardBrand ?? null, cardLast4: updated?.cardLast4 ?? null, ...(paidNow ? { openInvoicePaid: true } : {}) }
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
  await billingEmail(auth.orgId, 'reactivated', newId, reactivatedEmail(row.plan.name, startAt, amountCents, updated.cardLast4))
  return { ok: true, nextChargeAt: startAt.toISOString(), amountCents, cardLast4: updated.cardLast4 }
}
