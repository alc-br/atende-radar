import { test, expect } from '@playwright/test'
import { anonymous, createUser, loginAs, signupOrg, uid } from './helpers'
import { testDb } from './db'

// V7 · Admin › Planos: só o operador da plataforma (PLATFORM_ADMIN_EMAILS; nos testes, platform@test.local) lê e edita o
// catálogo. Os testes editam um plano próprio, criado aqui e fora de venda, para não mexer nos três planos do site
// (a página de vendas e o cadastro dependem deles).

test.describe('V7 · catálogo de planos no Admin', () => {
  let planId = ''
  let code = ''

  test.beforeAll(async () => {
    code = `teste_${uid()}`
    const p = await testDb.plan.create({
      data: { code, name: 'Plano de Teste', description: 'Descrição inicial', monthlyPrice: 9999, annualPrice: 99990, active: false, sortOrder: 99, features: JSON.stringify({ conversation_audit: true, api_access: false }) },
    })
    planId = p.id
  })

  test.afterAll(async () => {
    await testDb.subscription.deleteMany({ where: { planId } })
    await testDb.plan.deleteMany({ where: { id: planId } })
  })

  test('cliente (mesmo administrador da empresa) não lê nem edita: 403; sem sessão: 401', async () => {
    const { email, password } = await signupOrg()
    const admin = await loginAs(email, password)
    expect((await admin.get('/api/admin/plans')).status()).toBe(403)
    expect((await admin.patch(`/api/admin/plans/${planId}`, { data: { name: 'Invadido' } })).status()).toBe(403)
    const gestorEmail = `gestor.${uid()}@cliente.test`
    await createUser(admin, { email: gestorEmail, role: 'gestor' })
    const gestor = await loginAs(gestorEmail, 'Senha-Forte-2026x')
    expect((await gestor.patch(`/api/admin/plans/${planId}`, { data: { name: 'Invadido' } })).status()).toBe(403)
    const anon = await anonymous()
    expect((await anon.get('/api/admin/plans')).status()).toBe(401)
    expect((await anon.patch(`/api/admin/plans/${planId}`, { data: { name: 'Invadido' } })).status()).toBe(401)
    expect((await testDb.plan.findUniqueOrThrow({ where: { id: planId } })).name).toBe('Plano de Teste')
    await Promise.all([admin.dispose(), gestor.dispose(), anon.dispose()])
  })

  test('operador lista todos os planos, inclusive fora de venda, com limites e número de assinaturas', async () => {
    const op = await loginAs('platform@test.local')
    const res = await op.get('/api/admin/plans')
    expect(res.status()).toBe(200)
    const { plans } = await res.json()
    expect(plans.map((p: { code: string }) => p.code)).toEqual(expect.arrayContaining(['essencial', 'gestao', 'performance', code]))
    const mine = plans.find((p: { code: string }) => p.code === code)
    expect(mine).toMatchObject({ id: planId, active: false, subscribers: 0, features: { conversation_audit: true }, limits: { maxConnections: 1 } })
    await op.dispose()
  })

  test('operador edita nome, descrição, destaques e preço; fica na auditoria com o de/para; limites não mudam', async () => {
    const op = await loginAs('platform@test.local')
    const before = await testDb.plan.findUniqueOrThrow({ where: { id: planId } })
    const res = await op.patch(`/api/admin/plans/${planId}`, {
      data: { name: '  Plano   Editado ', description: 'Texto novo da vitrine', monthlyPrice: 8888.5, features: { api_access: true }, highlight: true },
    })
    expect(res.status(), await res.text()).toBe(200)
    expect((await res.json()).changed.sort()).toEqual(['description', 'features', 'highlight', 'monthlyPrice', 'name'])
    const after = await testDb.plan.findUniqueOrThrow({ where: { id: planId } })
    expect(after).toMatchObject({ name: 'Plano Editado', description: 'Texto novo da vitrine', monthlyPrice: 8888.5, annualPrice: 99990, highlight: true, active: false })
    expect(JSON.parse(after.features)).toEqual({ conversation_audit: true, api_access: true }) // mescla, não apaga os outros
    expect(after.maxConnections).toBe(before.maxConnections)

    const log = await testDb.auditLog.findFirst({ where: { action: 'plan.updated', targetId: planId }, orderBy: { createdAt: 'desc' } })
    expect(log?.targetLabel).toBe(`${code} · Plano Editado`)
    const details = JSON.parse(log?.details ?? '{}')
    expect(details.operator).toBe(true)
    expect(details.changes.monthlyPrice).toEqual({ from: 9999, to: 8888.5 })
    expect(details.changes.name).toEqual({ from: 'Plano de Teste', to: 'Plano Editado' })

    // a mesma coisa de novo: nada muda e nada vai para a auditoria
    const count = await testDb.auditLog.count({ where: { action: 'plan.updated', targetId: planId } })
    const same = await op.patch(`/api/admin/plans/${planId}`, { data: { name: 'Plano Editado' } })
    expect(await same.json()).toEqual({ success: true, changed: [] })
    expect(await testDb.auditLog.count({ where: { action: 'plan.updated', targetId: planId } })).toBe(count)
    await op.dispose()
  })

  test('validação: campo de limite ou código, valor inválido e plano inexistente', async () => {
    const op = await loginAs('platform@test.local')
    for (const data of [{ maxAgents: 999 }, { code: 'outro' }, { monthlyPrice: 0 }, { monthlyPrice: 'caro' }, { name: 'x' }, { features: { inventado: true } }, {}]) {
      const r = await op.patch(`/api/admin/plans/${planId}`, { data })
      expect(r.status(), JSON.stringify(data)).toBe(400)
    }
    expect((await op.patch('/api/admin/plans/nao-existe', { data: { name: 'Qualquer' } })).status()).toBe(404)
    expect((await testDb.plan.findUniqueOrThrow({ where: { id: planId } })).maxAgents).toBe(1)
    await op.dispose()
  })

  test('fora de venda: não aparece no site nem em Planos e não pode ser contratado; à venda, aparece', async () => {
    const op = await loginAs('platform@test.local')
    const { email, password } = await signupOrg()
    const c = await loginAs(email, password)
    const anon = await anonymous()
    const listed = async () => ((await (await anon.get('/api/public/plans')).json()).plans as Array<{ code: string }>).some((p) => p.code === code)
    const inApp = async () => ((await (await c.get('/api/plans')).json()).plans as Array<{ code: string }>).some((p) => p.code === code)

    expect(await listed()).toBe(false)
    expect(await inApp()).toBe(false)
    const checkout = await c.post('/api/billing/checkout', { data: { planId, cycle: 'monthly' } })
    expect(checkout.status()).toBe(404)
    expect((await checkout.json()).code).toBe('plan_not_found')

    // à venda por um instante (o preço alto mantém o cadastro no plano mais barato do site) e de volta para fora de venda
    try {
      expect((await op.patch(`/api/admin/plans/${planId}`, { data: { active: true } })).status()).toBe(200)
      expect(await listed()).toBe(true)
    } finally {
      expect((await op.patch(`/api/admin/plans/${planId}`, { data: { active: false } })).status()).toBe(200)
    }
    expect(await listed()).toBe(false)
    await Promise.all([op.dispose(), c.dispose(), anon.dispose()])
  })
})
