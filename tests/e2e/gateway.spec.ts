import { test, expect, request, type APIRequestContext } from '@playwright/test'
import { BASE_URL, loginAs, uid } from './helpers'
import { testDb } from './db'

// B5 · Entrada de eventos do WhatsApp (gateway → sistema): status, QR e mensagens viram conversas reais.
const SECRET = 'gateway-secret-test'

let admA: APIRequestContext
let admB: APIRequestContext
let gw: APIRequestContext // gateway autenticado
let connA: string
let connB: string

const evt = (connectionId: string, type: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  eventId: `evt-${uid()}-${Date.now()}`,
  connectionId,
  type,
  occurredAt: new Date().toISOString(),
  payload,
  ...extra,
})
const msg = (over: Record<string, unknown> = {}) => ({
  externalId: `wamid-${uid()}${Date.now()}`,
  chatId: '5511988887777@s.whatsapp.net',
  isGroup: false,
  fromMe: false,
  text: 'Oi, quanto custa a limpeza?',
  messageType: 'text',
  pushName: 'Cliente Teste',
  ...over,
})

test.beforeAll(async () => {
  admA = await loginAs('admin.a@test.local')
  admB = await loginAs('admin.b@test.local')
  gw = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Authorization: `Bearer ${SECRET}` } })
  connA = (await (await admA.post('/api/connections', { data: { name: 'GW A', phoneNumber: '+5511900000010' } })).json()).connection.id
  connB = (await (await admB.post('/api/connections', { data: { name: 'GW B', phoneNumber: '+5511900000011' } })).json()).connection.id
})
test.afterAll(async () => {
  await admA.dispose()
  await admB.dispose()
  await gw.dispose()
})

test.describe('B5 · autenticação do gateway', () => {
  test('sem segredo ou com segredo errado → 401; a sessão de usuário NÃO vale aqui', async () => {
    const anon = await request.newContext({ baseURL: BASE_URL })
    expect((await anon.post('/api/gateway/events', { data: evt(connA, 'message.received', msg()) })).status()).toBe(401)
    const wrong = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Authorization: 'Bearer errado' } })
    expect((await wrong.post('/api/gateway/events', { data: evt(connA, 'message.received', msg()) })).status()).toBe(401)
    expect((await admA.post('/api/gateway/events', { data: evt(connA, 'message.received', msg()) })).status()).toBe(401)
    expect((await anon.get('/api/gateway/connections')).status()).toBe(401)
    await anon.dispose()
    await wrong.dispose()
  })

  test('conexão desconhecida → 404 (sem revelar nada)', async () => {
    const r = await gw.post('/api/gateway/events', { data: evt('nao-existe', 'message.received', msg()) })
    expect(r.status()).toBe(404)
  })

  test('corpo inválido → 400', async () => {
    expect((await gw.post('/api/gateway/events', { data: { foo: 'bar' } })).status()).toBe(400)
    expect((await gw.post('/api/gateway/events', { data: evt(connA, 'tipo.inventado', {}) })).status()).toBe(400)
    expect((await gw.post('/api/gateway/events', { data: evt(connA, 'message.received', { chatId: '' }) })).status()).toBe(400)
  })
})

test.describe('B5 · status e QR da conexão', () => {
  test('QR fica disponível só para quem administra a conexão; conectar limpa o QR e atualiza o status', async () => {
    await gw.post('/api/gateway/events', { data: evt(connA, 'connection.qr', { qr: '2@QRDATA-ABC' }) })
    const qr = await (await admA.get(`/api/connections/${connA}/qr`)).json()
    expect(qr.qr).toBe('2@QRDATA-ABC')
    expect(qr.status).toBe('qr_required')
    // outra organização não enxerga (404) e quem não administra não vê (403)
    expect((await admB.get(`/api/connections/${connA}/qr`)).status()).toBe(404)
    const viewer = await loginAs('viewer.a@test.local')
    expect((await viewer.get(`/api/connections/${connA}/qr`)).status()).toBe(403)
    await viewer.dispose()

    const r = await gw.post('/api/gateway/events', { data: evt(connA, 'connection.status', { status: 'connected', phoneNumber: '+5511977776666' }) })
    expect(r.status()).toBe(200)
    const list = (await (await admA.get('/api/connections')).json()).connections
    const c = list.find((x: { id: string }) => x.id === connA)
    expect(c.status).toBe('connected')
    expect(c.phoneLast4).toBe('6666')
    expect((await (await admA.get(`/api/connections/${connA}/qr`)).json()).qr).toBeNull()
    const events = await testDb.connectionSessionEvent.findMany({ where: { connectionId: connA } })
    expect(events.some((e) => e.newStatus === 'connected')).toBe(true)
  })

  test('o gateway lista só as conexões que devem estar rodando', async () => {
    const paused = (await (await admA.post('/api/connections', { data: { name: 'Pausada', phoneNumber: '+5511900000012' } })).json()).connection.id
    await admA.patch(`/api/connections/${paused}`, { data: { action: 'pause' } })
    const list = (await (await gw.get('/api/gateway/connections')).json()).connections
    const ids = list.map((c: { id: string }) => c.id)
    expect(ids).toContain(connA)
    expect(ids).toContain(connB)
    expect(ids).not.toContain(paused)
  })
})

test.describe('B5 · mensagens viram conversas', () => {
  test('mensagem recebida cria contato + conversa aguardando a empresa, com telefone mascarado', async () => {
    const chat = `55119${Math.floor(10000000 + Math.random() * 89999999)}@s.whatsapp.net`
    const r = await gw.post('/api/gateway/events', { data: evt(connA, 'message.received', msg({ chatId: chat, pushName: 'Beatriz Nova', text: 'Quero agendar uma consulta' })) })
    expect(r.status()).toBe(200)

    const list = (await (await admA.get('/api/conversations?search=Beatriz%20Nova')).json()).conversations
    expect(list).toHaveLength(1)
    const c = list[0]
    expect(c.customerName).toBe('Beatriz Nova')
    expect(c.operationalStatus).toBe('waiting_company')
    expect(c.customerPhone).toMatch(/^\*{5}\d{4}$/)
    expect(c.messagesCount).toBe(1)

    const detail = await (await admA.get(`/api/conversations/${c.id}`)).text()
    expect(detail).toContain('Quero agendar uma consulta')
    expect(detail).not.toContain(chat.split('@')[0]) // número completo nunca sai pela API
  })

  test('é idempotente: o mesmo evento duas vezes não duplica a mensagem', async () => {
    const chat = `55119${Math.floor(10000000 + Math.random() * 89999999)}@s.whatsapp.net`
    const e = evt(connA, 'message.received', msg({ chatId: chat, pushName: 'Idem Potente' }))
    expect((await gw.post('/api/gateway/events', { data: e })).status()).toBe(200)
    const again = await gw.post('/api/gateway/events', { data: e })
    expect(again.status()).toBe(200)
    expect((await again.json()).duplicate).toBe(true)
    // mesma mensagem do WhatsApp reenviada com outro eventId (reconexão/histórico) também não duplica
    const same = { ...e, eventId: `evt-${uid()}` }
    expect((await gw.post('/api/gateway/events', { data: same })).status()).toBe(200)
    const conv = (await (await admA.get('/api/conversations?search=Idem%20Potente')).json()).conversations
    expect(conv).toHaveLength(1)
    expect(conv[0].messagesCount).toBe(1)
  })

  test('resposta da empresa passa a conversa para "aguardando cliente"; nova pergunta volta a "aguardando empresa" na MESMA conversa', async () => {
    const chat = `55119${Math.floor(10000000 + Math.random() * 89999999)}@s.whatsapp.net`
    const t0 = Date.now()
    const at = (min: number) => ({ occurredAt: new Date(t0 + min * 60000).toISOString() })
    await gw.post('/api/gateway/events', { data: evt(connA, 'message.received', msg({ chatId: chat, pushName: 'Fluxo Completo' }), at(0)) })
    await gw.post('/api/gateway/events', { data: evt(connA, 'message.sent', msg({ chatId: chat, fromMe: true, text: 'Olá! Custa R$ 150.', pushName: undefined }), at(3)) })
    let conv = (await (await admA.get('/api/conversations?search=Fluxo%20Completo')).json()).conversations
    expect(conv).toHaveLength(1)
    expect(conv[0].operationalStatus).toBe('waiting_customer')
    expect(conv[0].messagesCount).toBe(2)

    await gw.post('/api/gateway/events', { data: evt(connA, 'message.received', msg({ chatId: chat, text: 'E tem desconto?' }), at(10)) })
    conv = (await (await admA.get('/api/conversations?search=Fluxo%20Completo')).json()).conversations
    expect(conv).toHaveLength(1) // não abriu outra
    expect(conv[0].operationalStatus).toBe('waiting_company')
    expect(conv[0].messagesCount).toBe(3)
  })

  test('mensagem antiga chegando atrasada não bagunça o estado (usa a mais recente)', async () => {
    const chat = `55119${Math.floor(10000000 + Math.random() * 89999999)}@s.whatsapp.net`
    const now = Date.now()
    await gw.post('/api/gateway/events', { data: evt(connA, 'message.sent', msg({ chatId: chat, fromMe: true, text: 'resposta recente', pushName: 'Fora De Ordem' }), { occurredAt: new Date(now).toISOString() }) })
    await gw.post('/api/gateway/events', { data: evt(connA, 'message.received', msg({ chatId: chat, text: 'pergunta antiga', pushName: 'Fora De Ordem' }), { occurredAt: new Date(now - 3600000).toISOString() }) })
    const conv = (await (await admA.get('/api/conversations?search=Fora%20De%20Ordem')).json()).conversations
    expect(conv).toHaveLength(1)
    expect(conv[0].operationalStatus).toBe('waiting_customer') // a última palavra foi da empresa
  })

  test('grupos são ignorados', async () => {
    const r = await gw.post('/api/gateway/events', { data: evt(connA, 'message.received', msg({ chatId: '120363000000000001@g.us', isGroup: true, pushName: 'Grupo Da Familia' })) })
    expect(r.status()).toBe(200)
    expect((await r.json()).ignored).toBe('group')
    expect((await (await admA.get('/api/conversations?search=Grupo%20Da%20Familia')).json()).conversations).toHaveLength(0)
  })

  test('isolamento: mensagem da conexão da Org B só aparece para a Org B', async () => {
    const chat = `55119${Math.floor(10000000 + Math.random() * 89999999)}@s.whatsapp.net`
    await gw.post('/api/gateway/events', { data: evt(connB, 'message.received', msg({ chatId: chat, pushName: 'Cliente Exclusivo Da B' })) })
    expect((await (await admB.get('/api/conversations?search=Exclusivo')).json()).conversations).toHaveLength(1)
    expect((await (await admA.get('/api/conversations?search=Exclusivo')).json()).conversations).toHaveLength(0)
    // o mesmo número falando com as duas empresas vira DOIS contatos separados
    await gw.post('/api/gateway/events', { data: evt(connA, 'message.received', msg({ chatId: chat, pushName: 'Cliente Exclusivo Da B' })) })
    expect((await (await admA.get('/api/conversations?search=Exclusivo')).json()).conversations).toHaveLength(1)
    expect((await (await admB.get('/api/conversations?search=Exclusivo')).json()).conversations).toHaveLength(1)
  })

  test('o telefone é guardado só como hash + últimos 4 dígitos', async () => {
    const digits = `55119${Math.floor(10000000 + Math.random() * 89999999)}`
    await gw.post('/api/gateway/events', { data: evt(connA, 'message.received', msg({ chatId: `${digits}@s.whatsapp.net`, pushName: 'Hash Do Telefone' })) })
    const contact = await testDb.contact.findFirst({ where: { displayName: 'Hash Do Telefone' } })
    expect(contact!.phoneLast4).toBe(digits.slice(-4))
    expect(contact!.phoneHash).toBeTruthy()
    expect(contact!.phoneHash).not.toContain(digits)
    expect(contact!.phoneEncrypted).toBeNull()
  })
})
