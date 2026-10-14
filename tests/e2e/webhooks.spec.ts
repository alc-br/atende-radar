import { test, expect } from '@playwright/test'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHmac } from 'node:crypto'
import { createUser, loginAs, signupOrg, uid, STRONG } from './helpers'
import { newChat, setupCompany } from './gw'
import { testDb } from './db'

// P4 · Webhook de saída assinado: configuração (CRUD + papéis + SSRF) e entrega real para um receptor HTTP local.
// O receptor escuta em 127.0.0.1, liberado só porque o servidor de teste roda com WEBHOOK_ALLOW_LOCAL=1 (playwright.config.ts).

interface Received {
  headers: http.IncomingHttpHeaders
  raw: string
  body: { event: string; occurredAt: string; organizationId: string; data: Record<string, unknown> }
}

/** Receptor HTTP mínimo numa porta livre. `fail = true` faz responder 500. */
async function startReceiver() {
  const received: Received[] = []
  const state = { fail: false }
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      try {
        received.push({ headers: req.headers, raw, body: JSON.parse(raw) })
      } catch {
        received.push({ headers: req.headers, raw, body: { event: '?', occurredAt: '', organizationId: '', data: {} } })
      }
      res.statusCode = state.fail ? 500 : 200
      res.end('ok')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return { url: `http://127.0.0.1:${port}/hook`, received, state, close: () => new Promise<void>((r) => server.close(() => r())) }
}

const hmac = (raw: string, secret: string) => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`

function expectSigned(r: Received, secret: string) {
  expect(r.headers['x-atenderadar-signature']).toBe(hmac(r.raw, secret))
  expect(r.headers['x-atenderadar-event']).toBe(r.body.event)
  expect(String(r.headers['x-atenderadar-delivery'])).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  const ts = Number(r.headers['x-atenderadar-timestamp'])
  expect(Math.abs(Date.now() / 1000 - ts)).toBeLessThan(300)
  expect(r.headers['content-type']).toContain('application/json')
}

test.describe('P4 · webhook: configuração', () => {
  test('cria, altera, troca o segredo e remove; segredo só aparece uma vez; tudo vai para a auditoria', async ({}, info) => {
    test.skip(info.project.name !== 'api')
    const { email, password } = await signupOrg()
    const admin = await loginAs(email, password)

    expect((await (await admin.get('/api/settings/webhook')).json()).webhook).toBeNull()

    const created = await admin.put('/api/settings/webhook', { data: { url: 'https://hooks.example.com/atende', enabled: false, events: ['alert.created'] } })
    expect(created.status()).toBe(201)
    const c = await created.json()
    const secret = c.secret as string
    expect(secret).toMatch(/^whsec_/)
    expect(c.webhook).toMatchObject({ url: 'https://hooks.example.com/atende', enabled: false, events: ['alert.created'], secretHint: `…${secret.slice(-4)}` })

    // leitura e alteração nunca devolvem o segredo
    const readText = await (await admin.get('/api/settings/webhook')).text()
    expect(readText).not.toContain(secret)
    const upd = await admin.put('/api/settings/webhook', { data: { enabled: true, events: ['alert.created', 'alert.resolved'] } })
    expect(upd.status()).toBe(200)
    const updText = await upd.text()
    expect(updText).not.toContain(secret)
    expect(JSON.parse(updText).webhook).toMatchObject({ enabled: true, events: ['alert.created', 'alert.resolved'] })

    expect((await admin.put('/api/settings/webhook', { data: { events: ['mensagem.recebida'] } })).status()).toBe(400)
    expect((await admin.put('/api/settings/webhook', { data: { enabled: 'sim' } })).status()).toBe(400)

    // gestor também configura
    const gestorEmail = `gestor.${uid()}@cliente.test`
    await createUser(admin, { email: gestorEmail, role: 'gestor' })
    const gestor = await loginAs(gestorEmail, STRONG)
    const rotated = await gestor.post('/api/settings/webhook/secret')
    expect(rotated.status()).toBe(200)
    const newSecret = (await rotated.json()).secret as string
    expect(newSecret).toMatch(/^whsec_/)
    expect(newSecret).not.toBe(secret)
    expect((await (await gestor.get('/api/settings/webhook')).json()).webhook.secretHint).toBe(`…${newSecret.slice(-4)}`)

    // outra empresa não enxerga
    const other = await signupOrg()
    const otherAdmin = await loginAs(other.email, other.password)
    expect((await (await otherAdmin.get('/api/settings/webhook')).json()).webhook).toBeNull()
    expect((await otherAdmin.post('/api/settings/webhook/secret')).status()).toBe(404)

    expect((await admin.delete('/api/settings/webhook')).status()).toBe(200)
    expect((await (await admin.get('/api/settings/webhook')).json()).webhook).toBeNull()

    const auditText = await (await admin.get('/api/audit?limit=100')).text()
    expect(auditText).not.toContain(secret)
    expect(auditText).not.toContain(newSecret)
    const actions = (JSON.parse(auditText).entries as Array<{ action: string; targetLabel: string | null }>).map((e) => e.action)
    for (const a of ['webhook.created', 'webhook.updated', 'webhook.secret_rotated', 'webhook.removed']) expect(actions, a).toContain(a)

    await Promise.all([admin.dispose(), gestor.dispose(), otherAdmin.dispose()])
  })

  test('só admin e gestor acessam (os demais papéis recebem 403)', async ({}, info) => {
    test.skip(info.project.name !== 'api')
    for (const role of ['admin', 'gestor']) {
      const ctx = await loginAs(`${role}.a@test.local`)
      expect((await ctx.get('/api/settings/webhook')).status(), role).toBe(200)
      await ctx.dispose()
    }
    for (const role of ['supervisor', 'analista', 'member', 'atendente', 'viewer']) {
      const ctx = await loginAs(`${role}.a@test.local`)
      expect((await ctx.get('/api/settings/webhook')).status(), `${role} GET`).toBe(403)
      expect((await ctx.put('/api/settings/webhook', { data: { url: 'https://hooks.example.com/x' } })).status(), `${role} PUT`).toBe(403)
      expect((await ctx.delete('/api/settings/webhook')).status(), `${role} DELETE`).toBe(403)
      expect((await ctx.post('/api/settings/webhook/secret')).status(), `${role} secret`).toBe(403)
      expect((await ctx.post('/api/settings/webhook/test')).status(), `${role} test`).toBe(403)
      await ctx.dispose()
    }
  })

  test('SSRF: recusa http, localhost, IPs internos/privados/link-local e URLs com credencial', async ({}, info) => {
    test.skip(info.project.name !== 'api')
    const { email, password } = await signupOrg()
    const admin = await loginAs(email, password)
    const BAD = [
      'http://hooks.example.com/x', 'ftp://hooks.example.com/x', 'não é url', 'https://localhost/x', 'https://app.localhost/x',
      'https://intranet/x', 'https://servidor.local/x', 'https://127.0.0.2/x', 'https://10.1.2.3/x', 'https://0x0a000001/x',
      'https://172.16.5.4/x', 'https://192.168.1.10/x', 'https://100.64.0.1/x', 'https://169.254.169.254/latest/meta-data/',
      'https://0.0.0.0/x', 'https://[::1]/x', 'https://[fd00::1]/x', 'https://[fe80::1]/x', 'https://[::ffff:10.0.0.1]/x',
      'https://user:senha@hooks.example.com/x',
    ]
    for (const url of BAD) {
      const r = await admin.put('/api/settings/webhook', { data: { url, enabled: true } })
      expect(r.status(), url).toBe(400)
    }
    expect((await (await admin.get('/api/settings/webhook')).json()).webhook).toBeNull()

    // depois de salvo, também não dá para trocar para endereço interno
    expect((await admin.put('/api/settings/webhook', { data: { url: 'https://hooks.example.com/ok' } })).status()).toBe(201)
    expect((await admin.put('/api/settings/webhook', { data: { url: 'https://192.168.0.1/x' } })).status()).toBe(400)
    expect((await (await admin.get('/api/settings/webhook')).json()).webhook.url).toBe('https://hooks.example.com/ok')
    await admin.dispose()
  })
})

test.describe('P4 · webhook: entrega', () => {
  test('alerta criado e resolvido chegam assinados (HMAC do corpo cru), sem dados de cliente; "Enviar teste" funciona', async ({}, info) => {
    test.skip(info.project.name !== 'api')
    test.setTimeout(90_000)
    const rx = await startReceiver()
    const c = await setupCompany()
    try {
      const orgId = (await (await c.admin.get('/api/me')).json()).organizationId as string
      const created = await c.admin.put('/api/settings/webhook', { data: { url: rx.url, enabled: true, events: ['alert.created', 'alert.resolved'] } })
      expect(created.status()).toBe(201)
      const secret = (await created.json()).secret as string

      // botão "Enviar teste"
      const t = await c.admin.post('/api/settings/webhook/test')
      expect(await t.json()).toMatchObject({ ok: true, statusCode: 200 })
      const test1 = rx.received.find((r) => r.body.event === 'webhook.test')
      expect(test1).toBeTruthy()
      expectSigned(test1!, secret)
      expect(test1!.body.organizationId).toBe(orgId)

      // alerta criado pelo motor
      const chat = newChat()
      await c.send(chat, 'Bom dia, preciso de ajuda', { minutes: 30, pushName: 'Cliente Webhook Secreto' })
      await c.tick({ onlyThisCompany: true })
      const isNoResponse = (r: Received) => r.body.event === 'alert.created' && r.body.data.ruleName === 'Cliente sem primeira resposta'
      await expect.poll(() => rx.received.filter(isNoResponse).length, { timeout: 15_000 }).toBe(1)
      const createdEv = rx.received.find(isNoResponse)!
      expectSigned(createdEv, secret)
      expect(createdEv.body.organizationId).toBe(orgId)
      expect(Number.isNaN(Date.parse(createdEv.body.occurredAt))).toBe(false)
      const alertId = createdEv.body.data.alertId as string
      expect((await c.alerts()).alerts.map((a) => a.id)).toContain(alertId)
      expect(createdEv.body.data.status).toBe('new')
      // nada de conteúdo de mensagem, nome do cliente ou telefone
      expect(createdEv.raw).not.toContain('Bom dia')
      expect(createdEv.raw).not.toContain('Cliente Webhook Secreto')
      expect(createdEv.raw).not.toContain(chat.split('@')[0])

      // assinatura não confere com outro segredo nem com corpo alterado
      expect(createdEv.headers['x-atenderadar-signature']).not.toBe(hmac(createdEv.raw, 'whsec_outro'))
      expect(createdEv.headers['x-atenderadar-signature']).not.toBe(hmac(createdEv.raw + ' ', secret))

      // a empresa responde → alerta resolvido
      await c.send(chat, 'Olá! Já vamos te atender.', { fromMe: true })
      await c.tick({ onlyThisCompany: true })
      await expect.poll(() => rx.received.filter((r) => r.body.event === 'alert.resolved' && r.body.data.alertId === alertId).length, { timeout: 15_000 }).toBe(1)
      const resolvedEv = rx.received.find((r) => r.body.event === 'alert.resolved' && r.body.data.alertId === alertId)!
      expectSigned(resolvedEv, secret)
      expect(resolvedEv.body.data.status).toBe('resolved')
      expect(resolvedEv.body.data.resolvedAt).toBeTruthy()

      // tela: último status OK e histórico sem corpo nem segredo
      const viewText = await (await c.admin.get('/api/settings/webhook')).text()
      expect(viewText).not.toContain(secret)
      expect(viewText).not.toContain('"payload"')
      const view = JSON.parse(viewText)
      expect(view.webhook.lastStatus).toBe('ok')
      expect(view.deliveries.some((d: { event: string; status: string }) => d.event === 'alert.created' && d.status === 'sent')).toBe(true)
      // corpo apagado depois da entrega
      const stored = await testDb.webhookDelivery.findMany({ where: { organizationId: orgId, status: 'sent' } })
      expect(stored.length).toBeGreaterThan(0)
      expect(stored.every((d) => d.payload === null)).toBe(true)
    } finally {
      await rx.close()
      await c.dispose()
    }
  })

  test('falha é repetida pela fila (até 3 tentativas) e o último status aparece na configuração', async ({}, info) => {
    test.skip(info.project.name !== 'api')
    test.setTimeout(90_000)
    const rx = await startReceiver()
    const c = await setupCompany()
    try {
      const orgId = (await (await c.admin.get('/api/me')).json()).organizationId as string
      expect((await c.admin.put('/api/settings/webhook', { data: { url: rx.url, enabled: true, events: ['alert.created'] } })).status()).toBe(201)

      rx.state.fail = true
      await c.send(newChat(), 'Oi, alguém?', { minutes: 30, pushName: 'Falha Um' })
      await c.tick({ onlyThisCompany: true })
      const delivery = async () => testDb.webhookDelivery.findFirst({ where: { organizationId: orgId, event: 'alert.created' }, orderBy: { createdAt: 'asc' } })
      await expect.poll(async () => { const d = await delivery(); return d ? `${d.status}/${d.attempts}` : 'none' }, { timeout: 15_000 }).toBe('pending/1')
      const view1 = (await (await c.admin.get('/api/settings/webhook')).json()).webhook
      expect(view1).toMatchObject({ lastStatus: 'error', lastStatusCode: 500 })

      // 2ª tentativa (antecipa o horário da fila) → continua falhando
      const id = (await delivery())!.id
      await testDb.webhookDelivery.update({ where: { id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } })
      await c.tick({ onlyThisCompany: true })
      await expect.poll(async () => { const d = await delivery(); return `${d?.status}/${d?.attempts}` }, { timeout: 15_000 }).toBe('pending/2')

      // 3ª tentativa: receptor volta → entregue, com o mesmo id de entrega
      rx.state.fail = false
      await testDb.webhookDelivery.update({ where: { id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } })
      await c.tick({ onlyThisCompany: true })
      await expect.poll(async () => { const d = await delivery(); return `${d?.status}/${d?.attempts}` }, { timeout: 15_000 }).toBe('sent/3')
      const tries = rx.received.filter((r) => r.headers['x-atenderadar-delivery'] === id)
      expect(tries).toHaveLength(3)
      expect(new Set(tries.map((r) => r.raw)).size).toBe(1) // mesmo corpo em todas as tentativas
      expect((await (await c.admin.get('/api/settings/webhook')).json()).webhook).toMatchObject({ lastStatus: 'ok', lastStatusCode: 200 })

      // outra entrega que falha 3 vezes → desiste e apaga o corpo
      rx.state.fail = true
      await c.send(newChat(), 'Bom dia?', { minutes: 30, pushName: 'Falha Dois' })
      await c.tick({ onlyThisCompany: true })
      const second = async () => testDb.webhookDelivery.findFirst({ where: { organizationId: orgId, event: 'alert.created', id: { not: id } } })
      await expect.poll(async () => (await second())?.attempts ?? 0, { timeout: 15_000 }).toBe(1)
      for (const n of [2, 3]) {
        await testDb.webhookDelivery.update({ where: { id: (await second())!.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } })
        await c.tick({ onlyThisCompany: true })
        await expect.poll(async () => (await second())?.attempts ?? 0, { timeout: 15_000 }).toBe(n)
      }
      const final = (await second())!
      expect(final.status).toBe('failed')
      expect(final.payload).toBeNull()
    } finally {
      await rx.close()
      await c.dispose()
    }
  })
})
