import { test, expect, request, type APIRequestContext } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { anonymous, BASE_URL, loginAs } from './helpers'
import { gatewayClient } from './gw'
import { testDb } from './db'
import { TEST_DB_URL } from './test-db-url'

// Ambiente de simulação (S1): acesso (só operador ou Bearer SIMULATION_SECRET), todos os cenários verdes,
// isolamento (nada em e-mail, webhook, eventos de produto, motor agendado, métricas do Admin) e limpeza só de simuladas.
// O servidor de teste sobe com SIMULATION_ENABLED=on e o segredo abaixo (playwright.config.ts).

const SECRET = 'simulation-secret-test-only-0123456789'
const OPERATOR = 'platform@test.local'

type Assertion = { at: number | null; label: string; ok: boolean; detail?: string }
type Result = { scenarioId: string; status: string; organizationId: string | null; kept: boolean; error?: string; assertions: Assertion[] }

async function bearer(token = SECRET): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
}

const failures = (results: Result[]) =>
  results
    .filter((r) => r.status !== 'passed')
    .map((r) => `${r.scenarioId}: ${r.error ?? r.assertions.filter((a) => !a.ok).map((a) => `[min ${a.at ?? 'fim'}] ${a.label} — ${a.detail ?? ''}`).join(' | ')}`)

let op: APIRequestContext

test.beforeAll(async () => {
  op = await loginAs(OPERATOR)
})
test.afterAll(async () => {
  await op.dispose()
})

test.describe('acesso', () => {
  test('sem sessão → 401; admin de empresa cliente → 403; operador → 200', async () => {
    const anon = await anonymous()
    expect((await anon.get('/api/admin/simulation/scenarios')).status()).toBe(401)
    expect((await anon.post('/api/admin/simulation/run', { data: { scenarioId: 'todos' } })).status()).toBe(401)
    const client = await loginAs('admin.a@test.local')
    expect((await client.get('/api/admin/simulation/scenarios')).status()).toBe(403)
    expect((await client.post('/api/admin/simulation/run', { data: { scenarioId: 'cpf-mascarado' } })).status()).toBe(403)
    expect((await client.post('/api/admin/simulation/clean', { data: {} })).status()).toBe(403)
    const res = await op.get('/api/admin/simulation/scenarios')
    expect(res.status()).toBe(200)
    const { scenarios } = await res.json()
    expect(scenarios.length).toBeGreaterThanOrEqual(6)
    await anon.dispose()
    await client.dispose()
  })

  test('Bearer: segredo certo → 200; errado ou o do gateway → 401 (sem cair para a sessão)', async () => {
    const ok = await bearer()
    expect((await ok.get('/api/admin/simulation/scenarios')).status()).toBe(200)
    for (const wrong of ['errado-errado-errado-errado', 'gateway-secret-test']) {
      const c = await bearer(wrong)
      expect((await c.get('/api/admin/simulation/scenarios')).status()).toBe(401)
      expect((await c.post('/api/admin/simulation/clean', { data: {} })).status()).toBe(401)
      await c.dispose()
    }
    // sessão de operador + Bearer errado: o cabeçalho manda (segredo errado não vira acesso pela sessão)
    const both = await op.get('/api/admin/simulation/scenarios', { headers: { Authorization: 'Bearer errado-errado-errado-errado' } })
    expect(both.status()).toBe(401)
    await ok.dispose()
  })

  test('desligado (sem SIMULATION_ENABLED=on): o CLI recusa com código 2', () => {
    const env = { ...process.env, DATABASE_URL: TEST_DB_URL } as NodeJS.ProcessEnv
    delete env.SIMULATION_ENABLED
    const r = spawnSync('bun', ['scripts/simular.ts', 'listar'], { env, encoding: 'utf8', shell: process.platform === 'win32' })
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('desligado')
  })
})

test.describe('cenários', () => {
  test('todos os cenários verdes pela API (operador)', async () => {
    test.setTimeout(300_000)
    const res = await op.post('/api/admin/simulation/run', { data: { scenarioId: 'todos' }, timeout: 280_000 })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(failures(body.results), 'cenários com falha').toEqual([])
    expect(body.total).toBeGreaterThanOrEqual(6)
    expect(body.ok).toBe(true)
    // sem --manter: nenhuma empresa simulada fica para trás
    const ids = (body.results as Result[]).map((r) => r.organizationId).filter(Boolean) as string[]
    expect(await testDb.organization.count({ where: { id: { in: ids } } })).toBe(0)
    // auditoria: registro na empresa do operador e linha por execução com quem rodou
    expect(await testDb.auditLog.count({ where: { actorEmail: OPERATOR, action: 'simulation.run' } })).toBeGreaterThan(0)
    expect(await testDb.simulationRun.count({ where: { startedBy: OPERATOR, kind: 'run', status: 'passed' } })).toBeGreaterThanOrEqual(body.total)
  })

  test('pelo CLI (como o agente de IA): rodar um cenário com --json sai com 0', () => {
    test.setTimeout(120_000)
    const env = { ...process.env, DATABASE_URL: TEST_DB_URL, SIMULATION_ENABLED: 'on' }
    const r = spawnSync('bun', ['scripts/simular.ts', 'rodar', 'cpf-mascarado', '--json'], { env, encoding: 'utf8', shell: process.platform === 'win32' })
    expect(r.status, r.stderr).toBe(0)
    const out = JSON.parse(r.stdout)
    expect(out.ok).toBe(true)
    expect(out.passed).toBe(1)
    const bad = spawnSync('bun', ['scripts/simular.ts', 'rodar', 'nao-existe'], { env, encoding: 'utf8', shell: process.platform === 'win32' })
    expect(bad.status).toBe(2)
  })

  test('cenário inexistente → 400', async () => {
    expect((await op.post('/api/admin/simulation/run', { data: { scenarioId: 'nao-existe' } })).status()).toBe(400)
  })
})

test.describe('isolamento', () => {
  test('empresa simulada fica fora de e-mail, webhook, eventos de produto, motor agendado, login e Admin', async () => {
    test.setTimeout(120_000)
    const api = await bearer()
    const run = await api.post('/api/admin/simulation/run', { data: { scenarioId: 'primeira-resposta-estourada', keep: true } })
    expect(run.status()).toBe(200)
    const [result] = (await run.json()).results as Result[]
    expect(failures([result])).toEqual([])
    const orgId = result.organizationId!
    expect(result.kept).toBe(true)
    const org = await testDb.organization.findUnique({ where: { id: orgId } })
    expect(org?.isSimulation).toBe(true)
    expect(org?.simulationExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000)
    expect(await testDb.simulationRun.count({ where: { organizationId: orgId, startedBy: 'token' } })).toBe(1)

    // armadilhas: webhook ligado e membros com alerta por e-mail ligado (se o isolamento falhar, aparece algo)
    await testDb.webhookEndpoint.create({ data: { organizationId: orgId, url: 'http://127.0.0.1:9/simulacao', enabled: true, secret: 'whsec_simulacao_teste' } })
    await testDb.organizationMember.updateMany({ where: { organizationId: orgId }, data: { alertEmails: true } })

    // mensagem avulsa de 40 min atrás; o motor agendado (analyzeAll, via tick do gateway) NÃO analisa a simulada
    const inj = await api.post(`/api/admin/simulation/orgs/${orgId}/inject`, { data: { chat: 'novo', from: 'customer', text: 'Bom dia, alguém?', name: 'Novo Simulado', minutesAgo: 40 } })
    expect(inj.status()).toBe(200)
    const { conversationId } = await inj.json()
    expect(conversationId).toBeTruthy()
    const gw = await gatewayClient()
    expect((await gw.post('/api/gateway/tick', { data: {} })).status()).toBe(200)
    expect(await testDb.alert.count({ where: { conversationId } })).toBe(0)

    // o tick da simulação analisa: alerta abre na conversa nova
    const tick = await api.post(`/api/admin/simulation/orgs/${orgId}/tick`, { data: {} })
    expect(tick.status()).toBe(200)
    expect((await tick.json()).summary.alertsOpened).toBeGreaterThanOrEqual(1)
    expect(await testDb.alert.count({ where: { conversationId, status: 'new' } })).toBe(1)
    expect((await gw.post('/api/gateway/tick', { data: {} })).status()).toBe(200) // fila de webhooks e e-mails processada

    // nada saiu da empresa simulada
    const members = await testDb.organizationMember.findMany({ where: { organizationId: orgId }, select: { email: true } })
    expect(members.length).toBeGreaterThan(0)
    expect(members.every((m) => m.email.endsWith('@sim.invalid'))).toBe(true)
    expect(await testDb.emailOutbox.count({ where: { OR: [{ organizationId: orgId }, { toEmail: { endsWith: '@sim.invalid' } }] } })).toBe(0)
    expect(await testDb.alertEmailItem.count({ where: { organizationId: orgId } })).toBe(0)
    expect(await testDb.webhookDelivery.count({ where: { organizationId: orgId } })).toBe(0)
    expect(await testDb.productEvent.count({ where: { organizationId: orgId } })).toBe(0)
    expect(await testDb.productMilestone.count({ where: { organizationId: orgId } })).toBe(0)

    // retrato só leitura
    const snap = await op.get(`/api/admin/simulation/orgs/${orgId}`)
    expect(snap.status()).toBe(200)
    expect((await snap.json()).conversations.length).toBe(2)

    // Admin da plataforma: a simulada não aparece em empresas, usuários nem números
    const admin = await (await op.get('/api/admin')).json()
    expect(admin.organizations.some((o: { id: string }) => o.id === orgId)).toBe(false)
    expect(admin.users.some((u: { email: string }) => u.email.endsWith('@sim.invalid'))).toBe(false)
    expect(admin.kpis.totalUsers).toBe(await testDb.organizationMember.count({ where: { organization: { isSimulation: false } } }))
    expect(admin.kpis.activeAlerts).toBe(await testDb.alert.count({ where: { status: 'new', organization: { isSimulation: false } } }))
    const runs = await (await op.get('/api/admin/simulation/runs')).json()
    expect(runs.keptOrganizations.some((o: { id: string }) => o.id === orgId)).toBe(true)

    // membro sintético não entra pelo login comum (nem com a senha da demonstração)
    for (const m of members) {
      const s = await loginAs(m.email, 'demo123')
      expect((await s.get('/api/me')).status()).toBe(401)
      await s.dispose()
    }

    // o gateway real não alimenta conexão simulada
    const conn = await testDb.whatsAppConnection.findFirst({ where: { organizationId: orgId } })
    expect(conn?.provider).toBe('simulator')
    const cross = await gw.post('/api/gateway/events', {
      data: { eventId: `cross-${Date.now()}`, connectionId: conn!.id, type: 'message.received', payload: { externalId: `x-${Date.now()}`, chatId: '5511912345678@s.whatsapp.net', text: 'oi' } },
    })
    expect(cross.status()).toBe(404)
    const gwConns = await (await gw.get('/api/gateway/connections')).json()
    expect(JSON.stringify(gwConns)).not.toContain(conn!.id)

    // limpar apaga só as simuladas
    const realBefore = await testDb.organization.count({ where: { isSimulation: false } })
    const clean = await api.post('/api/admin/simulation/clean', { data: {} })
    expect(clean.status()).toBe(200)
    expect((await clean.json()).deleted).toBeGreaterThanOrEqual(1)
    expect(await testDb.organization.count({ where: { id: orgId } })).toBe(0)
    expect(await testDb.organization.count({ where: { isSimulation: true } })).toBe(0)
    expect(await testDb.organization.count({ where: { isSimulation: false } })).toBe(realBefore)
    expect(await testDb.webhookEndpoint.count({ where: { organizationId: orgId } })).toBe(0)
    expect(await testDb.simulationRun.count({ where: { kind: 'clean', startedBy: 'token' } })).toBeGreaterThan(0)
    await gw.dispose()
    await api.dispose()
  })

  test('empresa REAL nunca é alcançada: retrato, injetar e tick respondem 404', async () => {
    const me = await testDb.organizationMember.findFirst({ where: { email: OPERATOR }, select: { organizationId: true } })
    const realId = me!.organizationId
    const api = await bearer()
    for (const c of [op, api]) {
      expect((await c.get(`/api/admin/simulation/orgs/${realId}`)).status()).toBe(404)
      expect((await c.post(`/api/admin/simulation/orgs/${realId}/inject`, { data: { chat: 'x', from: 'customer', text: 'oi' } })).status()).toBe(404)
      expect((await c.post(`/api/admin/simulation/orgs/${realId}/tick`, { data: {} })).status()).toBe(404)
    }
    expect(await testDb.simulationRun.count({ where: { organizationId: realId } })).toBe(0)
    await api.dispose()
  })
})
