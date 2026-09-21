import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAs } from './helpers'

let admA: APIRequestContext
let atendA: APIRequestContext

test.beforeAll(async () => {
  admA = await loginAs('admin.a@test.local')
  atendA = await loginAs('atendente.a@test.local')
})
test.afterAll(async () => {
  await admA.dispose()
  await atendA.dispose()
})

const uid = () => Math.random().toString(36).slice(2, 8)

test.describe('B4 · sessão acompanha o cadastro em tempo real', () => {
  test('membro removido perde o acesso imediatamente (mesmo com cookie válido)', async () => {
    const email = `saindo.${uid()}@test.local`
    const created = await admA.post('/api/members', { data: { name: 'Saindo', email, role: 'gestor' } })
    expect(created.status()).toBe(201)
    const { member } = await created.json()

    const sessao = await loginAs(email)
    expect((await sessao.get('/api/dashboard')).status()).toBe(200)

    expect((await admA.delete(`/api/members/${member.id}`)).status()).toBe(200)
    expect((await sessao.get('/api/dashboard')).status()).toBe(401)
    await sessao.dispose()
  })

  test('mudança de papel vale na hora, sem novo login', async () => {
    const email = `promovido.${uid()}@test.local`
    const { member } = await (await admA.post('/api/members', { data: { name: 'Promovido', email, role: 'viewer' } })).json()
    const sessao = await loginAs(email)
    expect((await sessao.get('/api/settings')).status()).toBe(403)

    expect((await admA.patch(`/api/members/${member.id}`, { data: { role: 'gestor' } })).status()).toBe(200)
    expect((await sessao.get('/api/settings')).status()).toBe(200)

    expect((await admA.patch(`/api/members/${member.id}`, { data: { role: 'viewer' } })).status()).toBe(200)
    expect((await sessao.get('/api/settings')).status()).toBe(403)
    await sessao.dispose()
  })

  test('membro suspenso perde o acesso', async () => {
    const email = `suspenso.${uid()}@test.local`
    const { member } = await (await admA.post('/api/members', { data: { name: 'Suspenso', email, role: 'gestor' } })).json()
    const sessao = await loginAs(email)
    expect((await sessao.get('/api/dashboard')).status()).toBe(200)
    expect((await admA.patch(`/api/members/${member.id}`, { data: { status: 'suspended' } })).status()).toBe(200)
    expect((await sessao.get('/api/dashboard')).status()).toBe(401)
    await sessao.dispose()
  })
})

test.describe('B4 · regras de gestão de membros', () => {
  test('papel inexistente é recusado', async () => {
    const res = await admA.post('/api/members', { data: { name: 'X', email: `x.${uid()}@test.local`, role: 'superuser' } })
    expect(res.status()).toBe(400)
  })
  test('e-mail já usado (em qualquer organização) é recusado', async () => {
    expect((await admA.post('/api/members', { data: { name: 'Dup', email: 'gestor.b@test.local', role: 'viewer' } })).status()).toBe(409)
    expect((await admA.post('/api/members', { data: { name: 'Dup', email: 'gestor.a@test.local', role: 'viewer' } })).status()).toBe(409)
  })
  test('admin não remove nem rebaixa a si mesmo', async () => {
    expect((await admA.delete('/api/members/member_a_admin')).status()).toBe(400)
    expect((await admA.patch('/api/members/member_a_admin', { data: { role: 'viewer' } })).status()).toBe(400)
  })
  test('papel inválido em PATCH é recusado', async () => {
    expect((await admA.patch('/api/members/member_a_viewer', { data: { role: 'deus' } })).status()).toBe(400)
  })
})

test.describe('B4 · /api/me alimenta o menu da interface', () => {
  test('devolve papel e organização de quem está logado', async () => {
    const me = await (await atendA.get('/api/me')).json()
    expect(me.member.role).toBe('atendente')
    expect(me.member.email).toBe('atendente.a@test.local')
    expect(me.organizationId).toBe('org_seed_1')
    expect(me.isPlatformOperator).toBe(false)
  })
  test('operador da plataforma é identificado', async () => {
    const op = await loginAs('platform@test.local')
    expect((await (await op.get('/api/me')).json()).isPlatformOperator).toBe(true)
    await op.dispose()
  })
})

test.describe('B4 · painel da plataforma só para o operador', () => {
  test('admin de cliente recebe 403', async () => {
    expect((await admA.get('/api/admin')).status()).toBe(403)
  })
  test('operador da plataforma recebe 200', async () => {
    const op = await loginAs('platform@test.local')
    const res = await op.get('/api/admin')
    expect(res.status()).toBe(200)
    expect(await res.text()).toContain('Clínica B')
    await op.dispose()
  })
})

test.describe('B4 · atendente só enxerga o que é seu', () => {
  test('lista de conversas contém só as conversas do próprio agente', async () => {
    const body = await (await atendA.get('/api/conversations')).json()
    const ids = body.conversations.map((c: { id: string }) => c.id)
    expect(ids).toEqual(['conv_a_own'])
  })
  test('conversa de outro agente da mesma organização → 404', async () => {
    const admList = await (await admA.get('/api/conversations?limit=50')).json()
    const outra = admList.conversations.find((c: { id: string }) => c.id !== 'conv_a_own')
    expect(outra).toBeTruthy()
    expect((await atendA.get(`/api/conversations/${outra.id}`)).status()).toBe(404)
    expect((await atendA.get('/api/conversations/conv_a_own')).status()).toBe(200)
  })
  test('alertas e recuperação: só os próprios', async () => {
    const alerts = await (await atendA.get('/api/alerts')).json()
    expect(alerts.alerts.map((x: { id: string }) => x.id)).toEqual(['alert_a_own'])
    const rec = await (await atendA.get('/api/recovery')).json()
    expect(rec.items.map((x: { id: string }) => x.id)).toEqual(['rec_a_own'])
  })
  test('dashboard do atendente não traz o ranking dos colegas', async () => {
    const body = await (await atendA.get('/api/dashboard')).json()
    expect(body.teamPerformance).toEqual([])
  })
})
