import { test, expect, type APIRequestContext } from '@playwright/test'
import { anonymous, createUser, loginAs, signupOrg } from './helpers'
import { testDb } from './db'
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
    expect(await res.json()).toMatchObject({ ok: true, status: 'active', planName: 'Gestão', mode: 'test' })

    const sub = await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })
    expect(sub).toMatchObject({ planId: gestao.id, status: 'active', billingProvider: 'pagarme', billingMode: 'test', billingCycle: 'monthly', cardLast4: '0010', trialEnd: null, cancelAtPeriodEnd: false })
    expect(sub.providerSubscriptionId).toMatch(/^sub_/)
    expect(sub.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now() + 25 * 86400000) // ~1 mês pago

    const summary = await config(c)
    expect(summary.subscription).toMatchObject({ status: 'active', recurring: true, cardBrand: 'Visa', cardLast4: '0010', plan: { code: 'gestao' } })
    expect(summary.invoices).toHaveLength(1)
    expect(summary.invoices[0]).toMatchObject({ status: 'paid', amount: gestao.monthlyPrice, planName: 'Gestão' })

    // Essencial permitia 1 conexão; Gestão permite 3
    expect((await c.post('/api/connections', { data: { name: 'Um', phoneNumber: '+5511900000101' } })).status()).toBe(201)
    expect((await c.post('/api/connections', { data: { name: 'Dois', phoneNumber: '+5511900000102' } })).status()).toBe(201)

    const audit = await testDb.auditLog.findFirst({ where: { organizationId: orgId, action: 'subscription.changed' } })
    expect(audit?.targetLabel).toBe('Gestão')
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

    // período pago acabou → sem acesso para cadastrar (402 subscription_inactive)
    await testDb.subscription.update({ where: { organizationId: orgId }, data: { currentPeriodEnd: new Date(Date.now() - 60_000) } })
    expect((await config(c)).subscription.status).toBe('canceled')
    const blocked = await c.post('/api/connections', { data: { name: 'X', phoneNumber: '+5511900000199' } })
    expect(blocked.status()).toBe(402)
    expect((await blocked.json()).code).toBe('subscription_inactive')
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

  test('só o administrador contrata; conta de demonstração não paga nada', async () => {
    test.skip(!enabled, 'sem chaves do Pagar.me neste ambiente')
    const { c } = await newAdmin()
    const email = `gestor.${Date.now()}@cliente.test`
    await createUser(c, { email, role: 'gestor' })
    const gestor = await loginAs(email, 'Senha-Forte-2026x')
    expect((await gestor.get('/api/billing')).status()).toBe(403)
    expect((await gestor.post('/api/billing/checkout', { data: {} })).status()).toBe(403)
    const demo = await loginAs('demo@atenderadar.com', 'demo123')
    expect((await demo.post('/api/billing/checkout', { data: {} })).status()).toBe(403)
    await Promise.all([c.dispose(), gestor.dispose(), demo.dispose()])
  })
})
