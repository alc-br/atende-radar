import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAs } from './helpers'

// B3 · Isolamento entre organizações. Org B é "Clínica B"; os usuários da Org A não podem ver nem tocar nada dela.
let a: APIRequestContext // gestor da Org A
let admA: APIRequestContext // admin da Org A
let b: APIRequestContext // gestor da Org B
let admB: APIRequestContext // admin da Org B

test.beforeAll(async () => {
  a = await loginAs('gestor.a@test.local')
  admA = await loginAs('admin.a@test.local')
  b = await loginAs('gestor.b@test.local')
  admB = await loginAs('admin.b@test.local')
})
test.afterAll(async () => {
  await a.dispose()
  await admA.dispose()
  await b.dispose()
  await admB.dispose()
})

const text = async (r: { text(): Promise<string> }) => r.text()

test.describe('B3 · listagens da Org A não mostram nada da Org B', () => {
  const SECRETS = ['Cliente Secreto B', 'Alerta secreto B', 'Regra secreta B', 'Notificação secreta B', 'Equipe B', 'Agente B', 'Conexão B', 'Clínica B', 'MENSAGEM CONFIDENCIAL', 'rec_b', 'conv_b', 'conn_b', 'agent_b']
  const LISTS = ['/api/conversations', '/api/alerts', '/api/alert-rules', '/api/connections', '/api/recovery', '/api/notifications', '/api/team', '/api/teams', '/api/reports', '/api/settings', '/api/subscription', '/api/dashboard']
  for (const path of LISTS) {
    test(`Org A: GET ${path} sem dados da Org B`, async () => {
      // assinatura é restrita ao admin (billing); as demais listagens são do gestor
      const res = await (path === '/api/subscription' ? admA : a).get(path)
      expect(res.status(), path).toBe(200)
      const body = await text(res)
      for (const secret of SECRETS) expect(body, `${path} vazou "${secret}"`).not.toContain(secret)
    })
  }
  test('admin da Org A: /api/members não lista membros da Org B', async () => {
    const res = await admA.get('/api/members')
    expect(res.status()).toBe(200)
    expect(await text(res)).not.toContain('.b@test.local')
  })
  test('a Org B enxerga os próprios dados (e só eles)', async () => {
    const conv = await text(await b.get('/api/conversations'))
    expect(conv).toContain('Cliente Secreto B')
    expect(conv).not.toContain('Cliente do Atendente A')
    const members = await text(await admB.get('/api/members'))
    expect(members).toContain('gestor.b@test.local')
    expect(members).not.toContain('.a@test.local')
  })
})

test.describe('B3 · recursos da Org B por id, vistos pela Org A → 404', () => {
  const CASES: Array<[string, string, object?]> = [
    ['GET', '/api/conversations/conv_b'],
    ['PATCH', '/api/conversations/conv_b', { markReviewed: true }],
    ['POST', '/api/conversations/conv_b/outcome', { outcome: 'won' }],
    ['POST', '/api/conversations/conv_b/feedback', { type: 'intent', previousValue: 'a', correctedValue: 'b' }],
    ['PUT', '/api/alerts/alert_b', { status: 'resolved' }],
    ['POST', '/api/alerts/alert_b/acknowledge'],
    ['POST', '/api/alerts/alert_b/resolve', { reason: 'x' }],
    ['POST', '/api/alerts/alert_b/dismiss', { reason: 'x' }],
    ['POST', '/api/alerts/alert_b/false-positive'],
    ['PUT', '/api/alert-rules/rule_b', { name: 'HACK' }],
    ['PATCH', '/api/connections/conn_b', { action: 'disconnect' }],
    ['DELETE', '/api/connections/conn_b'],
    ['GET', '/api/connections/conn_b/health'],
    ['PATCH', '/api/findings/finding_b', { falsePositive: true }],
    ['PATCH', '/api/open-questions/oq_b', { status: 'answered' }],
    ['PATCH', '/api/promises/promise_b', { status: 'kept' }],
    ['PATCH', '/api/recovery/rec_b', { status: 'lost' }],
    ['PATCH', '/api/notifications/notif_b', { read: true }],
    ['GET', '/api/team/agent_b'],
    ['PATCH', '/api/teams/team_b', { name: 'HACK' }],
    ['DELETE', '/api/teams/team_b'],
    ['PATCH', '/api/members/member_b_gestor', { role: 'viewer' }],
    ['DELETE', '/api/members/member_b_gestor'],
  ]
  for (const [method, path, data] of CASES) {
    test(`Org A: ${method} ${path} → 404`, async () => {
      const client = path.startsWith('/api/members') || (path.startsWith('/api/connections') && method !== 'GET') ? admA : a
      const res = await client.fetch(path, { method, data: data ?? {} })
      expect(res.status()).toBe(404)
    })
  }

  test('os recursos da Org B continuam intactos depois das tentativas', async () => {
    const conv = await text(await b.get('/api/conversations/conv_b'))
    expect(conv).toContain('MENSAGEM CONFIDENCIAL')
    const alerts = JSON.parse(await text(await b.get('/api/alerts')))
    expect(alerts.alerts.find((x: { id: string }) => x.id === 'alert_b').status).toBe('new')
    const rules = JSON.parse(await text(await b.get('/api/alert-rules')))
    expect(rules.rules.map((r: { name: string }) => r.name)).toContain('Regra secreta B')
    const conns = JSON.parse(await text(await b.get('/api/connections')))
    expect(conns.connections.find((c: { id: string }) => c.id === 'conn_b').status).toBe('connected')
    const teams = JSON.parse(await text(await b.get('/api/teams')))
    expect(teams.teams.map((t: { id: string }) => t.id)).toContain('team_b')
    const rec = JSON.parse(await text(await b.get('/api/recovery')))
    expect(rec.items.find((i: { id: string }) => i.id === 'rec_b').status).toBe('new')
    const members = await text(await admB.get('/api/members'))
    expect(members).toContain('gestor.b@test.local')
  })
})

test.describe('B3 · escritas caem na organização de quem escreve', () => {
  test('regra criada pela Org A não aparece para a Org B', async () => {
    const created = await a.post('/api/alert-rules', { data: { name: 'Regra só da A', type: 'no_response' } })
    expect(created.status()).toBe(201)
    expect(await text(await b.get('/api/alert-rules'))).not.toContain('Regra só da A')
    expect(await text(await a.get('/api/alert-rules'))).toContain('Regra só da A')
  })
  test('organizationId enviado no corpo é ignorado', async () => {
    const res = await a.post('/api/alert-rules', { data: { name: 'Tentativa injeção', type: 'no_response', organizationId: 'org_b' } })
    expect(res.status()).toBe(201)
    expect(await text(await b.get('/api/alert-rules'))).not.toContain('Tentativa injeção')
  })
  test('configurações alteradas pela Org A não mudam a Org B', async () => {
    const before = JSON.parse(await text(await b.get('/api/settings')))
    await a.patch('/api/settings', { data: { displayName: 'A renomeou' } })
    const after = JSON.parse(await text(await b.get('/api/settings')))
    expect(after.organization.id).toBe('org_b')
    expect(after.organization.displayName).toBe(before.organization.displayName)
  })
})

test.describe('B3 · referências cruzadas entre organizações são recusadas', () => {
  test('não dá para atribuir conversa da A a agente da B', async () => {
    const res = await a.patch('/api/conversations/conv_a_own', { data: { agentId: 'agent_b' } })
    expect(res.status()).toBe(400)
  })
  test('equipe da A não pode ter supervisor da B', async () => {
    const res = await a.post('/api/teams', { data: { name: 'Eq X', code: 'EQX', supervisorId: 'agent_b' } })
    expect(res.status()).toBe(400)
  })
  test('equipe da A não pode apontar para conexão da B', async () => {
    const res = await a.post('/api/teams', { data: { name: 'Eq Y', code: 'EQY', connectionIds: ['conn_b'] } })
    expect(res.status()).toBe(400)
  })
  test('item de recuperação da A não pode apontar para conversa da B', async () => {
    const res = await a.post('/api/recovery', { data: { conversationId: 'conv_b', reason: 'x' } })
    expect(res.status()).toBe(400)
  })
})
