import { test, expect } from '@playwright/test'
import { anonymous, loginAs, signupOrg, uid } from './helpers'
import { testDb } from './db'
import { gatewayClient, newChat, setupCompany } from './gw'

// I7 · Eventos analíticos do produto e custo de IA (tudo no próprio servidor, sem ferramenta de terceiros).

const OPERATOR = 'platform@test.local'
const DAY = 86400000

const milestonesOf = (organizationId: string) =>
  testDb.productMilestone.findMany({ where: { organizationId }, orderBy: { name: 'asc' } })

const landingTotal = async () => (await testDb.pageViewDaily.aggregate({ where: { page: 'landing' }, _sum: { count: true } }))._sum.count ?? 0

test.describe('I7 · marcos do funil', () => {
  test('cadastro, conexão, 1ª conversa e 1º alerta são gravados uma vez só', async () => {
    test.setTimeout(90_000)
    const c = await setupCompany()
    const me = await (await c.admin.get('/api/me')).json()
    const orgId = me.organizationId as string

    // a 1ª conversa vira o 1º alerta (cliente sem resposta há 30 min)
    await c.send(newChat(), 'Oi, alguém?', { minutes: 30, pushName: 'Cliente Um' })
    await c.tick({ onlyThisCompany: true })

    const first = await milestonesOf(orgId)
    expect(first.map((m) => m.name).sort()).toEqual(['first_alert', 'first_connection', 'first_conversation', 'signup'])

    // repete tudo: outra reconexão, outra conversa e outro alerta
    await c.gw.post('/api/gateway/events', { data: { eventId: `st-${uid()}`, connectionId: c.connectionId, type: 'connection.status', payload: { status: 'connected' } } })
    await c.send(newChat(), 'Tem alguém aí?', { minutes: 30, pushName: 'Cliente Dois' })
    await c.tick({ onlyThisCompany: true })
    expect((await c.alerts()).total).toBeGreaterThanOrEqual(2)

    const again = await milestonesOf(orgId)
    expect(again).toHaveLength(4)
    for (const m of again) {
      expect(m.reachedAt.getTime(), `marco ${m.name} foi regravado`).toBe(first.find((f) => f.name === m.name)!.reachedAt.getTime())
    }
    // sem pagamento aprovado, não existe o marco de pagamento
    expect(again.some((m) => m.name === 'first_payment')).toBe(false)
    await c.dispose()
  })
})

test.describe('I7 · painel do produto (Admin › Produto)', () => {
  test('o operador da plataforma vê funil, ativação, retenção, telas, tour e custo de IA', async () => {
    await signupOrg() // garante ao menos um cadastro no período
    const op = await loginAs(OPERATOR)
    const res = await op.get('/api/admin/analytics')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.days).toBe(30)
    expect(body.funnel.map((s: { key: string }) => s.key)).toEqual(['visit', 'signup', 'first_connection', 'first_conversation', 'first_alert', 'first_payment'])
    expect(body.funnel.find((s: { key: string }) => s.key === 'signup').count).toBeGreaterThanOrEqual(1)
    expect(body.activation).toHaveProperty('medianHoursToFirstAlert')
    expect(Array.isArray(body.retention)).toBe(true)
    expect(Array.isArray(body.screens)).toBe(true)
    expect(Array.isArray(body.tours)).toBe(true)
    expect(['rules', 'provider']).toContain(body.ai.mode)

    const ninety = await (await op.get('/api/admin/analytics?days=90')).json()
    expect(ninety.days).toBe(90)
    await op.dispose()
  })

  test('quem não é operador recebe 403; sem login, 401', async () => {
    const admin = await loginAs('admin.a@test.local')
    const res = await admin.get('/api/admin/analytics')
    expect(res.status()).toBe(403)
    expect(JSON.stringify(await res.json())).not.toContain('funnel')
    await admin.dispose()

    const anon = await anonymous()
    expect((await anon.get('/api/admin/analytics')).status()).toBe(401)
    await anon.dispose()
  })

  test('sem nenhuma chamada de IA registrada, o custo é zero por regras (não inventa custo)', async () => {
    await testDb.aiUsage.deleteMany({})
    const op = await loginAs(OPERATOR)
    const body = await (await op.get('/api/admin/analytics')).json()
    expect(body.ai.mode).toBe('rules')
    expect(body.ai.totalCostBrl).toBe(0)
    expect(body.ai.byOrganization).toEqual([])
    await op.dispose()
  })
})

test.describe('I7 · uso por tela e tour', () => {
  test('isolamento: organização e membro vêm da sessão, nunca do corpo; tela fora da lista é recusada', async () => {
    const a = await loginAs('admin.a@test.local')
    const me = await (await a.get('/api/me')).json()
    const marker = new Date()

    const res = await a.post('/api/events', { data: { name: 'screen_view', view: 'reports', organizationId: 'org_b', memberId: 'member_b_admin', email: 'x@y.z' } })
    expect(res.status()).toBe(204)
    const rows = await testDb.productEvent.findMany({ where: { name: 'screen_view', createdAt: { gte: marker }, memberId: me.member.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].organizationId).toBe(me.organizationId)
    expect(JSON.parse(rows[0].props!)).toEqual({ view: 'reports' })
    expect(await testDb.productEvent.count({ where: { createdAt: { gte: marker }, OR: [{ organizationId: 'org_b' }, { memberId: 'member_b_admin' }] } })).toBe(0)

    expect((await a.post('/api/events', { data: { name: 'screen_view', view: 'qualquer-coisa' } })).status()).toBe(400)
    expect((await a.post('/api/events', { data: { name: 'signup', view: 'reports' } })).status()).toBe(400)
    await a.dispose()
  })

  test('tour pulado conta uma vez só (repetir o PATCH não soma)', async () => {
    const { email, password } = await signupOrg()
    const ctx = await loginAs(email, password)
    const me = await (await ctx.get('/api/me')).json()
    for (let i = 0; i < 2; i++) {
      expect((await ctx.patch('/api/tours', { data: { tourId: 'reports', outcome: 'skipped' } })).status()).toBe(200)
    }
    expect((await ctx.patch('/api/tours', { data: { tourId: 'alerts', outcome: 'completed' } })).status()).toBe(200)
    const events = await testDb.productEvent.findMany({ where: { memberId: me.member.id, name: { in: ['tour_completed', 'tour_skipped'] } } })
    expect(events.map((e) => `${e.name}:${JSON.parse(e.props!).tour}`).sort()).toEqual(['tour_completed:alerts', 'tour_skipped:reports'])
    expect(events.every((e) => e.organizationId === me.organizationId)).toBe(true)
    await ctx.dispose()
  })
})

test.describe('I7 · visitas à página de vendas', () => {
  test('soma 1 no contador do dia sem cookie e sem guardar IP ou identificador', async () => {
    const anon = await anonymous()
    const before = await landingTotal()
    const res = await anon.post('/api/public/pageview', { data: { page: 'landing' }, headers: { 'X-Forwarded-For': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })
    expect(res.status()).toBe(204)
    expect(res.headers()['set-cookie']).toBeUndefined()
    expect(await landingTotal()).toBe(before + 1)

    // a tabela só tem dia, página e contagem
    const row = await testDb.pageViewDaily.findFirst({ where: { page: 'landing' }, orderBy: { day: 'desc' } })
    expect(Object.keys(row!).sort()).toEqual(['count', 'day', 'page'])
    expect(row!.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    expect((await anon.post('/api/public/pageview', { data: { page: '/qualquer' } })).status()).toBe(400)
    await anon.dispose()
  })

  test('acima do limite por IP responde sem contar (recarregar em loop não infla o número)', async () => {
    const anon = await anonymous()
    const ip = `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
    const before = await landingTotal()
    for (let i = 0; i < 70; i++) {
      const r = await anon.post('/api/public/pageview', { data: { page: 'landing' }, headers: { 'X-Forwarded-For': ip } })
      expect(r.status()).toBe(204)
    }
    expect(await landingTotal()).toBe(before + 60) // PAGEVIEW_RATE_LIMIT_PER_MIN padrão = 60
    await anon.dispose()
  })
})

test.describe('I7 · retenção dos eventos brutos', () => {
  test('o tick apaga eventos, custo de IA e contadores mais velhos que o prazo (padrão 400 dias)', async () => {
    const old = new Date(Date.now() - 401 * DAY)
    const oldDay = old.toISOString().slice(0, 10)
    const tag = `ret-${uid()}`
    const oldEvent = await testDb.productEvent.create({ data: { organizationId: 'org_seed_1', name: 'screen_view', props: JSON.stringify({ view: tag }), createdAt: old } })
    const newEvent = await testDb.productEvent.create({ data: { organizationId: 'org_seed_1', name: 'screen_view', props: JSON.stringify({ view: tag }) } })
    const oldAi = await testDb.aiUsage.create({ data: { organizationId: 'org_seed_1', provider: 'teste', model: 'teste', feature: 'teste', inputTokens: 1, outputTokens: 1, costBrl: 0, createdAt: old } })
    await testDb.pageViewDaily.upsert({ where: { day_page: { day: oldDay, page: 'landing' } }, create: { day: oldDay, page: 'landing', count: 5 }, update: {} })

    const gw = await gatewayClient()
    const r = await gw.post('/api/gateway/tick', { data: { organizationId: 'org_seed_1' } })
    expect(r.status()).toBe(200)
    expect((await r.json()).purgedProductEvents).not.toBeNull()
    await gw.dispose()

    expect(await testDb.productEvent.findUnique({ where: { id: oldEvent.id } })).toBeNull()
    expect(await testDb.productEvent.findUnique({ where: { id: newEvent.id } })).not.toBeNull()
    expect(await testDb.aiUsage.findUnique({ where: { id: oldAi.id } })).toBeNull()
    expect(await testDb.pageViewDaily.findUnique({ where: { day_page: { day: oldDay, page: 'landing' } } })).toBeNull()
    await testDb.productEvent.delete({ where: { id: newEvent.id } })
  })
})
