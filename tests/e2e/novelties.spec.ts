import { test, expect } from '@playwright/test'
import { anonymous, loginAs, signupOrg, uid } from './helpers'
import { testDb } from './db'
import { gatewayClient } from './gw'

// Situações novas (Admin): o Claude marca nas conversas o que os alertas não cobrem, o agrupamento semanal junta em
// temas e o operador decide. Nos testes a IA fica desligada: aqui só a tela do operador, a decisão e a retenção.

const OPERATOR = 'platform@test.local'
const DAY = 86400000

test.describe('Situações novas no Admin', () => {
  let clusterId = ''
  let conversationId = ''
  const tag = `novidade-${uid()}`

  test.beforeAll(async () => {
    conversationId = (await testDb.conversation.findFirstOrThrow({ where: { organizationId: 'org_seed_1' }, select: { id: true } })).id
    clusterId = (await testDb.novelCluster.create({
      data: {
        title: `Cliente relata reação alérgica ${tag}`, summary: 'Cliente conta reação depois do procedimento; risco de saúde.',
        conversations: 3, lastRunConversations: 3, orgIdsJson: JSON.stringify(['org_seed_1', 'outra']),
        examplesJson: JSON.stringify(['cliente relata reação alérgica após o procedimento']),
      },
    })).id
  })

  test.afterAll(async () => {
    await testDb.novelSignal.deleteMany({ where: { description: { contains: tag } } })
    await testDb.novelCluster.deleteMany({ where: { id: clusterId } })
  })

  test('cliente (mesmo administrador da empresa) não vê nem decide: 403; sem sessão: 401', async () => {
    const { email, password } = await signupOrg()
    const admin = await loginAs(email, password)
    expect((await admin.get('/api/admin/novelties')).status()).toBe(403)
    expect((await admin.patch(`/api/admin/novelties/${clusterId}`, { data: { status: 'dismissed' } })).status()).toBe(403)
    expect((await admin.post('/api/admin/novelties/cluster')).status()).toBe(403)
    const anon = await anonymous()
    expect((await anon.get('/api/admin/novelties')).status()).toBe(401)
    expect((await testDb.novelCluster.findUniqueOrThrow({ where: { id: clusterId } })).status).toBe('new')
    await Promise.all([admin.dispose(), anon.dispose()])
  })

  test('o operador vê o tema com a contagem de empresas (sem quais) e decide', async () => {
    const op = await loginAs(OPERATOR)
    const res = await op.get('/api/admin/novelties')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.aiEnabled).toBe(false)
    const c = body.clusters.find((x: { id: string }) => x.id === clusterId)
    expect(c).toMatchObject({ status: 'new', conversations: 3, organizations: 2, examples: ['cliente relata reação alérgica após o procedimento'] })
    expect(JSON.stringify(c)).not.toContain('org_seed_1')

    const mapped = await op.patch(`/api/admin/novelties/${clusterId}`, { data: { status: 'mapped' } })
    expect(mapped.status()).toBe(200)
    expect((await mapped.json()).cluster).toMatchObject({ status: 'mapped', decidedBy: OPERATOR })
    expect((await op.patch(`/api/admin/novelties/${clusterId}`, { data: { status: 'apagar' } })).status()).toBe(400)
    expect((await op.patch('/api/admin/novelties/nao-existe', { data: { status: 'dismissed' } })).status()).toBe(404)
    const back = await op.patch(`/api/admin/novelties/${clusterId}`, { data: { status: 'new' } })
    expect((await back.json()).cluster).toMatchObject({ status: 'new', decidedAt: null, decidedBy: null })
    // sem IA ligada não há o que agrupar
    expect((await op.post('/api/admin/novelties/cluster')).status()).toBe(409)
    await op.dispose()
  })

  test('a frase de cada conversa fica 30 dias; o tema fica', async () => {
    const old = await testDb.novelSignal.create({ data: { organizationId: 'org_seed_1', conversationId, description: `antiga ${tag}`, clusterId, createdAt: new Date(Date.now() - 31 * DAY) } })
    const recent = await testDb.novelSignal.create({ data: { organizationId: 'org_seed_1', conversationId, description: `recente ${tag}`, createdAt: new Date(Date.now() - 29 * DAY) } })
    const gw = await gatewayClient()
    expect((await gw.post('/api/gateway/tick', { data: { organizationId: 'org_seed_1' } })).status()).toBe(200)
    await gw.dispose()
    expect(await testDb.novelSignal.findUnique({ where: { id: old.id } })).toBeNull()
    expect(await testDb.novelSignal.findUnique({ where: { id: recent.id } })).not.toBeNull()
    expect(await testDb.novelCluster.findUnique({ where: { id: clusterId } })).not.toBeNull()
  })
})
