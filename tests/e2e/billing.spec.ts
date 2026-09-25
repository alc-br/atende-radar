import { test, expect } from '@playwright/test'
import { createUser, loginAs, signupOrg, uid } from './helpers'
import { setupCompany } from './gw'
import { testDb } from './db'

// B8 (parte sem gateway de pagamento) · limites do plano e troca de plano.
// O plano do teste grátis é o mais barato (Essencial: 1 conexão · 3 atendentes · 5 regras de alerta).

test.describe('B8 · limites do plano', () => {
  test('conexões: o 2º número no plano Essencial é recusado com 402 e mensagem clara', async () => {
    const { email, password } = await signupOrg()
    const c = await loginAs(email, password)
    expect((await c.post('/api/connections', { data: { name: 'Um', phoneNumber: '+5511900000001' } })).status()).toBe(201)
    const second = await c.post('/api/connections', { data: { name: 'Dois', phoneNumber: '+5511900000002' } })
    expect(second.status()).toBe(402)
    const body = await second.json()
    expect(body.code).toBe('quota_exceeded')
    expect(body.error).toContain('Essencial')
    expect(body.error).toContain('1')
    await c.dispose()
  })

  test('atendentes: o 4º é recusado', async () => {
    const { email, password } = await signupOrg()
    const c = await loginAs(email, password)
    for (let i = 1; i <= 3; i++) {
      expect((await c.post('/api/team', { data: { name: `Atendente ${i}`, email: `at${i}.${uid()}@cliente.test` } })).status(), `atendente ${i}`).toBe(201)
    }
    expect((await c.post('/api/team', { data: { name: 'Atendente 4', email: `at4.${uid()}@cliente.test` } })).status()).toBe(402)
    await c.dispose()
  })

  test('regras de alerta: as 8 padrão já passam do limite de 5, então novas são recusadas', async () => {
    const { email, password } = await signupOrg()
    const c = await loginAs(email, password)
    const r = await c.post('/api/alert-rules', { data: { name: 'Extra', type: 'no_response' } })
    expect(r.status()).toBe(402)
    await c.dispose()
  })

  test('assinatura cancelada/expirada não cria nada novo', async () => {
    const { email, password } = await signupOrg()
    const c = await loginAs(email, password)
    const me = await (await c.get('/api/me')).json()
    await testDb.subscription.update({ where: { organizationId: me.organizationId }, data: { status: 'canceled' } })
    const r = await c.post('/api/connections', { data: { name: 'X', phoneNumber: '+5511900000003' } })
    expect(r.status()).toBe(402)
    expect((await r.json()).error).toContain('assinatura')
    await c.dispose()
  })

  test('a organização de demonstração (plano Gestão) não é afetada pelos limites de teste', async () => {
    const adm = await loginAs('admin.a@test.local')
    expect((await adm.post('/api/connections', { data: { name: 'Demo extra', phoneNumber: '+5511900000004' } })).status()).toBe(201)
    await adm.dispose()
  })
})

test.describe('B8 · troca de plano', () => {
  test('o cliente NÃO consegue trocar de plano sozinho (não há cobrança ainda)', async () => {
    const { email, password } = await signupOrg()
    const c = await loginAs(email, password)
    const plans = (await (await c.get('/api/plans')).json()).plans as Array<{ id: string; code: string }>
    const gestao = plans.find((p) => p.code === 'gestao')!
    const r = await c.patch('/api/subscription', { data: { planId: gestao.id } })
    expect(r.status()).toBe(409)
    expect((await r.json()).error).toContain('pagamento')
    const sub = (await (await c.get('/api/subscription')).json()).subscription
    expect(sub.plan.code).toBe('essencial')
    await c.dispose()
  })

  test('o cliente pode PEDIR a troca: fica registrado para a equipe comercial', async () => {
    const { email, password } = await signupOrg()
    const c = await loginAs(email, password)
    const plans = (await (await c.get('/api/plans')).json()).plans as Array<{ id: string; code: string }>
    const r = await c.post('/api/subscription/request', { data: { planId: plans.find((p) => p.code === 'gestao')!.id } })
    expect(r.status()).toBe(200)
    const notifs = (await (await c.get('/api/notifications')).json()).notifications
    expect(notifs.some((n: { title: string }) => n.title.includes('Pedido de troca de plano'))).toBe(true)
    const mail = await testDb.emailOutbox.findFirst({ where: { toEmail: 'vendas@atenderadar.test' }, orderBy: { createdAt: 'desc' } })
    expect(mail!.body).toContain(email)
    expect(mail!.body).toContain('Gestão')
    await c.dispose()
  })

  test('só quem administra a assinatura pede troca', async () => {
    const adm = await loginAs('admin.a@test.local')
    const viewer = await loginAs('viewer.a@test.local')
    const plans = (await (await adm.get('/api/plans')).json()).plans as Array<{ id: string }>
    expect((await viewer.post('/api/subscription/request', { data: { planId: plans[0].id } })).status()).toBe(403)
    await adm.dispose()
    await viewer.dispose()
  })

  test('o operador da plataforma troca o plano de uma empresa e os limites acompanham', async () => {
    const { email, password } = await signupOrg()
    const c = await loginAs(email, password)
    const me = await (await c.get('/api/me')).json()
    await c.post('/api/connections', { data: { name: 'Um', phoneNumber: '+5511900000005' } })
    expect((await c.post('/api/connections', { data: { name: 'Dois', phoneNumber: '+5511900000006' } })).status()).toBe(402)

    const op = await loginAs('platform@test.local')
    const plans = (await (await c.get('/api/plans')).json()).plans as Array<{ id: string; code: string }>
    const gestao = plans.find((p) => p.code === 'gestao')!
    // cliente comum não pode usar a rota do operador
    expect((await c.patch(`/api/admin/organizations/${me.organizationId}/subscription`, { data: { planId: gestao.id } })).status()).toBe(403)
    const r = await op.patch(`/api/admin/organizations/${me.organizationId}/subscription`, { data: { planId: gestao.id, status: 'active' } })
    expect(r.status()).toBe(200)

    expect((await (await c.get('/api/subscription')).json()).subscription.plan.code).toBe('gestao')
    expect((await c.post('/api/connections', { data: { name: 'Dois', phoneNumber: '+5511900000006' } })).status()).toBe(201)
    await c.dispose()
    await op.dispose()
  })

  test('operador: plano/status inválidos e empresa inexistente', async () => {
    const op = await loginAs('platform@test.local')
    expect((await op.patch('/api/admin/organizations/nao-existe/subscription', { data: { status: 'active' } })).status()).toBe(404)
    const { email, password } = await signupOrg()
    const c = await loginAs(email, password)
    const me = await (await c.get('/api/me')).json()
    expect((await op.patch(`/api/admin/organizations/${me.organizationId}/subscription`, { data: { status: 'inventado' } })).status()).toBe(400)
    expect((await op.patch(`/api/admin/organizations/${me.organizationId}/subscription`, { data: { planId: 'plano-fantasma' } })).status()).toBe(404)
    await c.dispose()
    await op.dispose()
  })
})

test.describe('Aviso de teste grátis', () => {
  test('/api/subscription informa dias restantes do teste', async () => {
    const { email, password } = await signupOrg()
    const c = await loginAs(email, password)
    const sub = (await (await c.get('/api/subscription')).json()).subscription
    expect(sub.status).toBe('trialing')
    expect(sub.trialDaysLeft).toBeGreaterThanOrEqual(13)
    expect(sub.trialDaysLeft).toBeLessThanOrEqual(14)
    await c.dispose()
  })
})

test.describe('Isolamento dos limites entre empresas', () => {
  test('a cota de uma empresa não afeta a outra', async () => {
    const a = await setupCompany() // já tem 1 conexão (limite do Essencial)
    const b = await signupOrg()
    const cb = await loginAs(b.email, b.password)
    expect((await cb.post('/api/connections', { data: { name: 'B1', phoneNumber: '+5511900000007' } })).status()).toBe(201)
    await cb.dispose()
    await a.dispose()
  })
})
