import { test, expect, type APIRequestContext } from '@playwright/test'
import { anonymous, createUser, loginAs, signupOrg } from './helpers'
import { testDb } from './db'
import { gatewayClient } from './gw'
import { APPROVED, DECLINED, MASTERCARD, basic, billingData, cardToken } from './pagarme'

// B8 · Cobrança recorrente com Pagar.me (checkout transparente), contra o SANDBOX real do Pagar.me — nada simulado aqui.
// Sem as chaves de teste no ambiente (PAGARME_*_TEST), a suíte é pulada.

async function newAdmin() {
  const { email, password } = await signupOrg()
  const c = await loginAs(email, password)
  const me = await (await c.get('/api/me')).json()
  return { c, orgId: me.organizationId as string }
}

async function config(c: APIRequestContext) {
  const r = await c.get('/api/billing')
  expect(r.status()).toBe(200)
  return r.json()
}

async function plan(code: string) {
  return testDb.plan.findUniqueOrThrow({ where: { code } })
}

// leitura direta no sandbox (confere o que ficou no provedor); a chave secreta só vai no cabeçalho, nunca para a saída
async function providerSubscription(id: string): Promise<Record<string, any>> {
  const key = process.env.PAGARME_SECRET_KEY_TEST?.trim() ?? ''
  const res = await fetch(`https://api.pagar.me/core/v5/subscriptions/${id}`, { headers: { Authorization: 'Basic ' + Buffer.from(`${key}:`).toString('base64') } })
  expect(res.status, `GET subscriptions/${id}`).toBe(200)
  return res.json()
}

test.describe('B8 · checkout Pagar.me (sandbox)', () => {
  test.describe.configure({ mode: 'serial' })
  let enabled = false
  let publicKey = ''

  test.beforeAll(async () => {
    const { c } = await newAdmin()
    const cfg = await config(c)
    enabled = cfg.enabled
    publicKey = cfg.publicKey
    await c.dispose()
  })

  test('resumo expõe só a chave PÚBLICA e o ambiente; a secreta nunca sai do servidor', async () => {
    test.skip(!enabled, 'sem chaves do Pagar.me neste ambiente')
    const { c } = await newAdmin()
    const r = await c.get('/api/billing')
    const text = await r.text()
    const cfg = JSON.parse(text)
    expect(cfg.mode).toBe('test')
    expect(cfg.publicKey).toMatch(/^pk_test_/)
    expect(text).not.toMatch(/sk_(test_)?[A-Za-z0-9]{8,}/)
    expect(cfg.subscription).toMatchObject({ status: 'trialing', recurring: false })
    await c.dispose()
  })

  test('cartão aprovado: plano ativa na hora, fatura paga registrada e limites do novo plano valem', async () => {
    test.skip(!enabled, 'sem chaves do Pagar.me neste ambiente')
    const { c, orgId } = await newAdmin()
    const gestao = await plan('gestao')
    const res = await c.post('/api/billing/checkout', { data: { planId: gestao.id, cycle: 'monthly', cardToken: await cardToken(publicKey, APPROVED), ...billingData() } })
    expect(res.status(), await res.text()).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, status: 'active', planName: 'Growth', mode: 'test' })

    const sub = await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })
    expect(sub).toMatchObject({ planId: gestao.id, status: 'active', billingProvider: 'pagarme', billingMode: 'test', billingCycle: 'monthly', cardLast4: '0010', trialEnd: null, cancelAtPeriodEnd: false })
    expect(sub.providerSubscriptionId).toMatch(/^sub_/)
    expect(sub.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now() + 25 * 86400000) // ~1 mês pago

    const summary = await config(c)
    expect(summary.subscription).toMatchObject({ status: 'active', recurring: true, cardBrand: 'Visa', cardLast4: '0010', plan: { code: 'gestao' } })
    expect(summary.invoices).toHaveLength(1)
    expect(summary.invoices[0]).toMatchObject({ status: 'paid', amount: gestao.monthlyPrice, planName: 'Growth' })

    // Essencial permitia 1 conexão; Growth permite 3
    expect((await c.post('/api/connections', { data: { name: 'Um', phoneNumber: '+5511900000101' } })).status()).toBe(201)
    expect((await c.post('/api/connections', { data: { name: 'Dois', phoneNumber: '+5511900000102' } })).status()).toBe(201)

    // e-mail de ativação (recibo) ao administrador, uma vez só; a sincronização seguinte não manda "renovação paga"
    const activated = await testDb.emailOutbox.findMany({ where: { organizationId: orgId, kind: `billing:activated:${sub.providerSubscriptionId}` } })
    expect(activated).toHaveLength(1)
    expect(activated[0].subject).toBe('Plano Growth ativo — pagamento confirmado')
    expect(activated[0].body).toContain('final 0010')
    expect(await testDb.emailOutbox.count({ where: { organizationId: orgId, kind: { startsWith: 'billing:renewal_paid:' } } })).toBe(0)

    const audit = await testDb.auditLog.findFirst({ where: { organizationId: orgId, action: 'subscription.changed' } })
    expect(audit?.targetLabel).toBe('Growth')
    expect(audit?.details ?? '').not.toContain('token_') // token do cartão não vai para a auditoria

    // mesmo plano e ciclo de novo: recusado sem cobrar
    const again = await c.post('/api/billing/checkout', { data: { planId: gestao.id, cycle: 'monthly', cardToken: await cardToken(publicKey, APPROVED), ...billingData() } })
    expect(again.status()).toBe(409)
    await c.dispose()
  })

  test('cartão recusado: 402 com motivo claro, nada muda (continua no teste grátis)', async () => {
    test.skip(!enabled, 'sem chaves do Pagar.me neste ambiente')
    const { c, orgId } = await newAdmin()
    const before = await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })
    const res = await c.post('/api/billing/checkout', { data: { planId: (await plan('performance')).id, cycle: 'monthly', cardToken: await cardToken(publicKey, DECLINED), ...billingData() } })
    expect(res.status()).toBe(402)
    const body = await res.json()
    expect(body.code).toBe('payment_declined')
    expect(body.error).toMatch(/recusad|não autorizado/i)
    const after = await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })
    expect(after).toMatchObject({ planId: before.planId, status: 'trialing', providerSubscriptionId: null })
    await c.dispose()
  })

  test('dados inválidos são barrados antes de falar com o Pagar.me', async () => {
    test.skip(!enabled, 'sem chaves do Pagar.me neste ambiente')
    const { c } = await newAdmin()
    const planId = (await plan('gestao')).id
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ cardToken: 'abc' }, 'invalid_card'],
      [{ holder: { ...billingData().holder, document: '111.111.111-11' } }, 'invalid_document'],
      [{ holder: { ...billingData().holder, email: 'x' } }, 'invalid_email'],
      [{ holder: { ...billingData().holder, phone: '123' } }, 'invalid_phone'],
      [{ address: { ...billingData().address, zipCode: '123' } }, 'invalid_address'],
      [{ address: { ...billingData().address, state: 'XX' } }, 'invalid_address'],
    ]
    for (const [override, code] of cases) {
      const res = await c.post('/api/billing/checkout', { data: { planId, cycle: 'monthly', cardToken: 'token_abc123', ...billingData(override) } })
      expect(res.status(), code).toBe(400)
      expect((await res.json()).code).toBe(code)
    }
    const noPlan = await c.post('/api/billing/checkout', { data: { planId: 'nao-existe', cycle: 'monthly', cardToken: 'token_abc', ...billingData() } })
    expect(noPlan.status()).toBe(404)
    await c.dispose()
  })

  test('troca de cartão e cancelamento da renovação (vale até o fim do período pago)', async () => {
    test.skip(!enabled, 'sem chaves do Pagar.me neste ambiente')
    const { c, orgId } = await newAdmin()
    const essencial = await plan('essencial')
    const ok = await c.post('/api/billing/checkout', { data: { planId: essencial.id, cycle: 'annual', cardToken: await cardToken(publicKey, APPROVED), ...billingData() } })
    expect(ok.status(), await ok.text()).toBe(200)
    const paid = await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })
    expect(paid.billingCycle).toBe('annual')
    expect(paid.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now() + 360 * 86400000)
    expect((await config(c)).invoices[0]).toMatchObject({ amount: essencial.annualPrice, status: 'paid', billingCycle: 'annual' })

    // só sobe de plano: do anual para o mensal do mesmo plano é rebaixar, recusado antes de falar com o Pagar.me
    const down = await c.post('/api/billing/checkout', { data: { planId: essencial.id, cycle: 'monthly', cardToken: 'token_abc123', ...billingData() } })
    expect(down.status()).toBe(409)
    expect((await down.json()).code).toBe('downgrade_not_allowed')

    const card = await c.post('/api/billing/card', { data: { cardToken: await cardToken(publicKey, MASTERCARD), address: billingData().address } })
    expect(card.status(), await card.text()).toBe(200)
    expect(await card.json()).toMatchObject({ cardBrand: 'Mastercard', cardLast4: '4444' })

    const cancel = await c.post('/api/billing/cancel')
    expect(cancel.status(), await cancel.text()).toBe(200)
    const s = (await config(c)).subscription
    expect(s).toMatchObject({ status: 'active', cancelAtPeriodEnd: true })
    expect((await c.post('/api/billing/cancel')).status()).toBe(409)
    expect((await c.post('/api/billing/card', { data: { cardToken: await cardToken(publicKey, APPROVED), address: billingData().address } })).status()).toBe(409)
    const actions = (await testDb.auditLog.findMany({ where: { organizationId: orgId }, select: { action: true } })).map((a) => a.action)
    expect(actions).toEqual(expect.arrayContaining(['subscription.changed', 'billing.card_updated', 'subscription.canceled']))

    // e-mails: cartão trocado e renovação cancelada
    const kinds = async () => (await testDb.emailOutbox.findMany({ where: { organizationId: orgId, kind: { startsWith: 'billing:' } }, orderBy: { createdAt: 'asc' } })).map((m) => m.kind!.split(':')[1])
    expect(await kinds()).toEqual(['activated', 'card_updated', 'renewal_canceled'])

    // período pago acabou → empresa bloqueada: só Planos/Pagamento respondem (402 subscription_locked)
    await testDb.subscription.update({ where: { organizationId: orgId }, data: { currentPeriodEnd: new Date(Date.now() - 60_000) } })
    expect((await config(c)).subscription.status).toBe('canceled')
    // a varredura encerra o plano e avisa por e-mail (uma vez)
    const gw = await gatewayClient()
    expect((await (await gw.post('/api/gateway/tick', { data: { organizationId: orgId } })).json()).endedPlans).toBe(1)
    expect((await (await gw.post('/api/gateway/tick', { data: { organizationId: orgId } })).json()).endedPlans).toBe(0)
    await gw.dispose()
    expect(await kinds()).toEqual(['activated', 'card_updated', 'renewal_canceled', 'plan_ended'])
    const blocked = await c.post('/api/connections', { data: { name: 'X', phoneNumber: '+5511900000199' } })
    expect(blocked.status()).toBe(402)
    expect((await blocked.json()).code).toBe('subscription_locked')
    await c.dispose()
  })

  test('V7 · direito de arrependimento: em 7 dias, encerra agora e estorna o valor integral no Pagar.me', async () => {
    test.skip(!enabled, 'sem chaves do Pagar.me neste ambiente')
    const { c, orgId } = await newAdmin()
    const essencial = await plan('essencial')
    expect((await c.post('/api/billing/checkout', { data: { planId: essencial.id, cycle: 'monthly', cardToken: await cardToken(publicKey, APPROVED), ...billingData() } })).status()).toBe(200)
    const offer = (await config(c)).subscription.withdrawal
    expect(offer.amount).toBe(essencial.monthlyPrice)
    expect(new Date(offer.until).getTime()).toBeGreaterThan(Date.now() + 6.9 * 86400000)
    const subId = (await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })).providerSubscriptionId!

    const res = await c.post('/api/billing/withdraw')
    expect(res.status(), await res.text()).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, amountCents: Math.round(essencial.monthlyPrice * 100) })

    // no banco: plano encerrado agora, desligado do provedor; fatura estornada
    const after = await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })
    expect(after).toMatchObject({ status: 'canceled', cancelAtPeriodEnd: false, providerSubscriptionId: null })
    expect(after.currentPeriodEnd.getTime()).toBeLessThanOrEqual(Date.now())
    const summary = await config(c)
    expect(summary.subscription).toMatchObject({ status: 'canceled', recurring: false, withdrawal: null })
    expect(summary.invoices[0]).toMatchObject({ status: 'refunded', amount: essencial.monthlyPrice })

    // no Pagar.me: assinatura cancelada e cobrança estornada
    expect((await providerSubscription(subId)).status).toBe('canceled')
    const chargeId = (await testDb.billingInvoice.findFirstOrThrow({ where: { organizationId: orgId } })).providerChargeId!
    const key = process.env.PAGARME_SECRET_KEY_TEST?.trim() ?? ''
    const charge = await (await fetch(`https://api.pagar.me/core/v5/charges/${chargeId}`, { headers: { Authorization: 'Basic ' + Buffer.from(`${key}:`).toString('base64') } })).json()
    // estorno de cartão no Pagar.me v5 = cobrança paga cancelada (valor cancelado = valor pago)
    expect(charge).toMatchObject({ status: 'canceled', canceled_amount: charge.paid_amount })
    expect(charge.paid_amount).toBe(Math.round(essencial.monthlyPrice * 100))

    // o aviso (webhook) do cancelamento chega depois: não reabre o plano e a fatura segue "estornada"
    const anon = await anonymous()
    const hook = await anon.post('/api/billing/webhook', { data: { id: `hook_e2e_wd_${Date.now()}`, type: 'subscription.canceled', created_at: new Date().toISOString(), data: { id: subId } }, headers: { Authorization: basic() } })
    expect(hook.status(), await hook.text()).toBe(200)
    await anon.dispose()
    expect(await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })).toMatchObject({ status: 'canceled', providerSubscriptionId: null })
    expect((await testDb.billingInvoice.findFirstOrThrow({ where: { organizationId: orgId } })).status).toBe('refunded')

    // pedido repetido não estorna duas vezes; sem plano, nada novo é cadastrado
    expect((await c.post('/api/billing/withdraw')).status()).toBe(409)
    expect((await c.post('/api/connections', { data: { name: 'X', phoneNumber: '+5511900000198' } })).status()).toBe(402)
    const actions = (await testDb.auditLog.findMany({ where: { organizationId: orgId }, select: { action: true } })).map((a) => a.action)
    expect(actions).toContain('subscription.withdrawn')
    expect(await testDb.notification.count({ where: { organizationId: orgId, title: 'Contratação desfeita e valor estornado' } })).toBe(1)
    const wd = await testDb.emailOutbox.findFirst({ where: { organizationId: orgId, kind: { startsWith: 'billing:withdrawn:' } } })
    expect(wd?.subject).toBe('Contratação desfeita e estorno solicitado')
    await c.dispose()
  })

  test('V7 · arrependimento: fora dos 7 dias é recusado; com a renovação já cancelada ainda vale no prazo', async () => {
    test.skip(!enabled, 'sem chaves do Pagar.me neste ambiente')
    const { c, orgId } = await newAdmin()
    const essencial = await plan('essencial')
    expect((await c.post('/api/billing/checkout', { data: { planId: essencial.id, cycle: 'monthly', cardToken: await cardToken(publicKey, APPROVED), ...billingData() } })).status()).toBe(200)
    expect((await c.post('/api/billing/cancel')).status()).toBe(200)
    const inv = await testDb.billingInvoice.findFirstOrThrow({ where: { organizationId: orgId } })

    await testDb.billingInvoice.update({ where: { id: inv.id }, data: { paidAt: new Date(Date.now() - 8 * 86400000) } })
    expect((await config(c)).subscription.withdrawal).toBeNull()
    const late = await c.post('/api/billing/withdraw')
    expect(late.status()).toBe(409)
    expect((await late.json()).code).toBe('withdrawal_unavailable')
    expect(await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })).toMatchObject({ cancelAtPeriodEnd: true, status: 'active' })

    await testDb.billingInvoice.update({ where: { id: inv.id }, data: { paidAt: inv.paidAt } })
    const ok = await c.post('/api/billing/withdraw')
    expect(ok.status(), await ok.text()).toBe(200)
    expect(await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })).toMatchObject({ status: 'canceled', cancelAtPeriodEnd: false, providerSubscriptionId: null })
    await c.dispose()
  })

  test('V7 · reativar a renovação depois de cancelar:assinatura de continuação no Pagar.me, sem cobrar o período já pago', async () => {
    test.skip(!enabled, 'sem chaves do Pagar.me neste ambiente')
    const { c, orgId } = await newAdmin()
    const gestao = await plan('gestao')
    expect((await c.post('/api/billing/checkout', { data: { planId: gestao.id, cycle: 'monthly', cardToken: await cardToken(publicKey, APPROVED), ...billingData() } })).status()).toBe(200)
    // sem cancelamento não há o que reativar
    expect(await (await c.post('/api/billing/reactivate')).json()).toMatchObject({ code: 'not_canceled' })
    expect((await c.post('/api/billing/cancel')).status()).toBe(200)
    const canceled = await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })
    expect(canceled.cancelAtPeriodEnd).toBe(true)
    const previousId = canceled.providerSubscriptionId!
    expect((await providerSubscription(previousId)).status).toBe('canceled') // cancelamento no Pagar.me é definitivo
    const invoicesBefore = await testDb.billingInvoice.count({ where: { organizationId: orgId } })

    const res = await c.post('/api/billing/reactivate')
    expect(res.status(), await res.text()).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, amountCents: Math.round(gestao.monthlyPrice * 100), cardLast4: '0010' })
    const next = new Date(body.nextChargeAt)
    // 1ª cobrança: dia seguinte ao fim do período pago, à meia-noite UTC (nunca dentro do período já pago)
    expect(next.getTime()).toBeGreaterThan(canceled.currentPeriodEnd.getTime())
    expect(next.getTime() - canceled.currentPeriodEnd.getTime()).toBeLessThanOrEqual(86400_000)
    expect(next.toISOString().endsWith('T00:00:00.000Z')).toBe(true)

    const sub = await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })
    expect(sub).toMatchObject({ status: 'active', cancelAtPeriodEnd: false, planId: gestao.id, billingCycle: 'monthly', cardLast4: '0010' })
    expect(sub.providerSubscriptionId).toMatch(/^sub_/)
    expect(sub.providerSubscriptionId).not.toBe(previousId)
    expect(sub.currentPeriodEnd.getTime()).toBe(canceled.currentPeriodEnd.getTime()) // período pago não muda

    // no provedor: continuação futura, mesmo cartão e valor, nenhuma fatura agora
    const cont = await providerSubscription(sub.providerSubscriptionId!)
    expect(cont.status).toBe('future')
    expect(cont.metadata).toMatchObject({ organizationId: orgId, reactivatedFrom: previousId, planCode: 'gestao', cycle: 'monthly' })
    expect(cont.items[0].pricing_scheme.price).toBe(Math.round(gestao.monthlyPrice * 100))
    expect(new Date(cont.start_at).getTime()).toBe(next.getTime())

    // a tela segue ativa e com o valor da assinatura; a sincronização com o provedor não derruba a situação
    await testDb.subscription.update({ where: { organizationId: orgId }, data: { lastSyncedAt: null } })
    const summary = await config(c)
    expect(summary.subscription).toMatchObject({ status: 'active', cancelAtPeriodEnd: false, recurring: true, renewalAmount: gestao.monthlyPrice })
    expect(await testDb.billingInvoice.count({ where: { organizationId: orgId } })).toBe(invoicesBefore) // nada cobrado agora
    expect((await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })).status).toBe('active')

    const audit = await testDb.auditLog.findFirst({ where: { organizationId: orgId, action: 'subscription.reactivated' } })
    expect(audit?.targetId).toBe(sub.providerSubscriptionId)
    expect(JSON.parse(audit?.details ?? '{}')).toMatchObject({ previous: previousId, amountCents: Math.round(gestao.monthlyPrice * 100) })
    const note = await testDb.notification.findFirst({ where: { organizationId: orgId, title: 'Renovação automática reativada' } })
    expect(note?.message).toContain('Nada foi cobrado agora')
    expect(note?.message).toContain('0010')
    expect(await testDb.emailOutbox.count({ where: { organizationId: orgId, kind: `billing:reactivated:${sub.providerSubscriptionId}` } })).toBe(1)

    // de novo: já está ativa; e dá para cancelar outra vez (cancela a continuação no provedor)
    expect(await (await c.post('/api/billing/reactivate')).json()).toMatchObject({ code: 'not_canceled' })
    expect((await c.post('/api/billing/cancel')).status()).toBe(200)
    expect((await providerSubscription(sub.providerSubscriptionId!)).status).toBe('canceled')
    expect((await config(c)).subscription).toMatchObject({ status: 'active', cancelAtPeriodEnd: true })

    // reativar uma segunda vez também funciona (continuação da continuação, mesmo valor)
    const again = await c.post('/api/billing/reactivate')
    expect(again.status(), await again.text()).toBe(200)
    const third = (await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })).providerSubscriptionId!
    expect((await providerSubscription(third)).items[0].pricing_scheme.price).toBe(Math.round(gestao.monthlyPrice * 100))

    // período pago acabou: não reativa (contrata de novo)
    expect((await c.post('/api/billing/cancel')).status()).toBe(200)
    await testDb.subscription.update({ where: { organizationId: orgId }, data: { currentPeriodEnd: new Date(Date.now() - 60_000) } })
    const over = await c.post('/api/billing/reactivate')
    expect(over.status()).toBe(409)
    expect((await over.json()).code).toBe('period_over')
    await c.dispose()
  })

  test('V7 · reativar: preço novo do catálogo não muda o valor de quem já assina', async () => {
    test.skip(!enabled, 'sem chaves do Pagar.me neste ambiente')
    const { c, orgId } = await newAdmin()
    const essencial = await plan('essencial')
    expect((await c.post('/api/billing/checkout', { data: { planId: essencial.id, cycle: 'monthly', cardToken: await cardToken(publicKey, APPROVED), ...billingData() } })).status()).toBe(200)
    expect((await c.post('/api/billing/cancel')).status()).toBe(200)
    try {
      // o operador aumenta o preço do plano para novas contratações
      await testDb.plan.update({ where: { id: essencial.id }, data: { monthlyPrice: essencial.monthlyPrice + 100 } })
      const res = await c.post('/api/billing/reactivate')
      expect(res.status(), await res.text()).toBe(200)
      expect((await res.json()).amountCents).toBe(Math.round(essencial.monthlyPrice * 100))
      expect((await config(c)).subscription.renewalAmount).toBe(essencial.monthlyPrice)
    } finally {
      await testDb.plan.update({ where: { id: essencial.id }, data: { monthlyPrice: essencial.monthlyPrice } })
    }
    const sub = await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })
    expect((await providerSubscription(sub.providerSubscriptionId!)).items[0].pricing_scheme.price).toBe(Math.round(essencial.monthlyPrice * 100))
    await c.dispose()
  })

  test('V7 · reativar sem cobrança automática (teste grátis): 409', async () => {
    test.skip(!enabled, 'sem chaves do Pagar.me neste ambiente')
    const { c } = await newAdmin()
    const res = await c.post('/api/billing/reactivate')
    expect(res.status()).toBe(409)
    expect((await res.json()).code).toBe('no_recurring')
    await c.dispose()
  })

  test('aviso (webhook): exige autenticação, ignora o que não é nosso, sincroniza o que é e não processa duas vezes', async () => {
    test.skip(!enabled, 'sem chaves do Pagar.me neste ambiente')
    const anon = await anonymous()
    const event = (id: string, subId: string) => ({ id, type: 'invoice.paid', created_at: new Date().toISOString(), data: { id: 'in_x', subscription: { id: subId } } })

    expect((await anon.post('/api/billing/webhook', { data: event('hook_e2e_a', 'sub_x') })).status()).toBe(401)
    expect((await anon.post('/api/billing/webhook', { data: event('hook_e2e_a', 'sub_x'), headers: { Authorization: basic('webhook-e2e', 'errada') } })).status()).toBe(401)

    const foreign = await anon.post('/api/billing/webhook', { data: event(`hook_e2e_${Date.now()}`, 'sub_naoexiste123'), headers: { Authorization: basic() } })
    expect(foreign.status()).toBe(200)
    expect((await foreign.json()).outcome).toBe('ignored')

    const { c, orgId } = await newAdmin()
    const ok = await c.post('/api/billing/checkout', { data: { planId: (await plan('gestao')).id, cycle: 'monthly', cardToken: await cardToken(publicKey, APPROVED), ...billingData() } })
    expect(ok.status()).toBe(200)
    const sub = await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })
    // simula um estado velho no nosso banco: o aviso faz reler o Pagar.me e corrigir
    await testDb.subscription.update({ where: { organizationId: orgId }, data: { status: 'past_due', cardLast4: null, lastSyncedAt: null } })
    const hookId = `hook_e2e_${Date.now()}`
    const res = await anon.post('/api/billing/webhook', { data: event(hookId, sub.providerSubscriptionId!), headers: { Authorization: basic() } })
    expect(res.status(), await res.text()).toBe(200)
    expect((await res.json()).outcome).toBe('synced')
    expect(await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })).toMatchObject({ status: 'active', cardLast4: '0010' })
    const dup = await anon.post('/api/billing/webhook', { data: event(hookId, sub.providerSubscriptionId!), headers: { Authorization: basic() } })
    expect(await dup.json()).toMatchObject({ duplicate: true })
    const ev = await testDb.paymentEvent.findUniqueOrThrow({ where: { providerEventId: hookId } })
    expect(ev).toMatchObject({ organizationId: orgId, outcome: 'synced', type: 'invoice.paid' })
    await anon.dispose()
    await c.dispose()
  })

  test('só o administrador contrata', async () => {
    test.skip(!enabled, 'sem chaves do Pagar.me neste ambiente')
    const { c } = await newAdmin()
    const email = `gestor.${Date.now()}@cliente.test`
    await createUser(c, { email, role: 'gestor' })
    const gestor = await loginAs(email, 'Senha-Forte-2026x')
    expect((await gestor.get('/api/billing')).status()).toBe(403)
    expect((await gestor.post('/api/billing/checkout', { data: {} })).status()).toBe(403)
    await Promise.all([c.dispose(), gestor.dispose()])
  })
})
