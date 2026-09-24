import { test, expect, request } from '@playwright/test'
import { BASE_URL, loginAs } from './helpers'
import { gatewayClient, newChat, setupCompany } from './gw'
import { testDb } from './db'

// B6 · O motor lê as conversas REAIS (vindas do WhatsApp) e produz alertas, oportunidades, promessas, notas e as métricas do painel.
// Cada teste usa uma empresa nova (cadastro real): o que acontece numa não existe na outra.

test.describe('B6 · motor de análise: acesso', () => {
  test('o gatilho do motor exige o segredo do gateway', async () => {
    const anon = await request.newContext({ baseURL: BASE_URL })
    expect((await anon.post('/api/gateway/tick', { data: {} })).status()).toBe(401)
    const admin = await loginAs('admin.a@test.local')
    expect((await admin.post('/api/gateway/tick', { data: {} })).status()).toBe(401)
    await anon.dispose()
    await admin.dispose()
  })
})

test.describe('B6 · alertas de tempo de resposta', () => {
  test('cliente sem primeira resposta além do limite → alerta crítico + notificação; dentro do limite → nada', async () => {
    const c = await setupCompany()
    await c.send(newChat(), 'Bom dia', { minutes: 30, pushName: 'Esperando Muito' })
    await c.send(newChat(), 'Oi', { minutes: 2, pushName: 'Acabou De Chegar' })
    await c.tick()

    const { alerts } = await c.alerts()
    const semResposta = alerts.filter((a) => a.ruleName === 'Cliente sem primeira resposta')
    expect(semResposta).toHaveLength(1)
    expect(semResposta[0].severity).toBe('critical')
    expect(semResposta[0].customerName).toBe('Esperando Muito')
    expect(semResposta[0].status).toBe('new')

    const notifs = (await (await c.admin.get('/api/notifications')).json()).notifications
    expect(notifs.some((n: { title: string }) => n.title.includes('Esperando Muito'))).toBe(true)
    await c.dispose()
  })

  test('não duplica: rodar o motor várias vezes mantém 1 alerta', async () => {
    const c = await setupCompany()
    await c.send(newChat(), 'Alguém aí?', { minutes: 40, pushName: 'Sem Duplicar' })
    await c.tick()
    await c.tick()
    await c.tick()
    const { alerts } = await c.alerts()
    expect(alerts.filter((a) => a.customerName === 'Sem Duplicar' && a.ruleName === 'Cliente sem primeira resposta')).toHaveLength(1)
    const findings = await testDb.auditFinding.count({ where: { conversation: { organization: { adminEmail: c.email } } } })
    expect(findings).toBe(1)
    await c.dispose()
  })

  test('quando a empresa responde, o alerta se resolve sozinho', async () => {
    const c = await setupCompany()
    const chat = newChat()
    await c.send(chat, 'Oi, tem alguém?', { minutes: 25, pushName: 'Vai Ser Atendido' })
    await c.tick()
    expect((await c.alerts('new')).alerts.some((a) => a.customerName === 'Vai Ser Atendido')).toBe(true)

    await c.send(chat, 'Olá! Desculpe a demora.', { fromMe: true })
    await c.tick()
    const all = (await c.alerts()).alerts.filter((a) => a.customerName === 'Vai Ser Atendido')
    expect(all.length).toBeGreaterThan(0)
    expect(all.every((a) => a.status === 'resolved')).toBe(true)
    await c.dispose()
  })

  test('cliente que já falou com a empresa e ficou sem retorno → alerta de acompanhamento', async () => {
    const c = await setupCompany()
    const chat = newChat()
    await c.send(chat, 'Olá, em que posso ajudar?', { fromMe: true, minutes: 90 })
    await c.send(chat, 'Preciso trocar meu horário', { minutes: 50, pushName: 'Acompanhamento' })
    await c.tick()
    const { alerts } = await c.alerts()
    expect(alerts.some((a) => a.ruleName === 'Cliente sem resposta após interação' && a.customerName === 'Acompanhamento')).toBe(true)
    expect(alerts.some((a) => a.ruleName === 'Cliente sem primeira resposta' && a.customerName === 'Acompanhamento')).toBe(false)
    await c.dispose()
  })
})

test.describe('B6 · intenção, oportunidade e recuperação', () => {
  test('pedido de preço sem retorno → alerta, oportunidade com valor estimado do ticket da empresa e item na fila de recuperação', async () => {
    const c = await setupCompany()
    await c.admin.patch('/api/settings', { data: { settings: { financeiro: { avgTicket: '2000', convRate: '20' } } } })
    await c.send(newChat(), 'Oi, quanto custa o clareamento?', { minutes: 25, pushName: 'Quer Preço' })
    await c.tick()

    const conv = (await c.conversations('Quer Preço'))[0]
    expect(conv.primaryIntent).toBe('preco')
    expect(conv.inferredStage).toBe('price')
    expect(conv.potentialValue).toBeGreaterThan(0)
    expect(conv.potentialValue).toBe(Math.round(2000 * 0.2 * 1.6)) // ticket × conversão × fator da intenção

    const { alerts } = await c.alerts()
    expect(alerts.some((a) => a.ruleName === 'Pedido de preço sem retorno')).toBe(true)

    const rec = (await (await c.admin.get('/api/recovery')).json()).items
    expect(rec.some((r: { customerName: string }) => r.customerName === 'Quer Preço')).toBe(true)
    await c.tick()
    expect(((await (await c.admin.get('/api/recovery')).json()).items as unknown[]).length).toBe(rec.length) // sem duplicar
    await c.dispose()
  })

  test('quem quer agendar e não é respondido dispara "intenção alta sem resposta"', async () => {
    const c = await setupCompany()
    await c.send(newChat(), 'Quero agendar uma consulta amanhã', { minutes: 12, pushName: 'Quer Agendar' })
    await c.tick()
    const { alerts } = await c.alerts()
    const a = alerts.find((x) => x.ruleName === 'Intenção alta sem resposta')
    expect(a).toBeTruthy()
    expect(a!.severity).toBe('critical')
    await c.dispose()
  })

  test('cliente irritado → alerta; a correção manual da intenção não é desfeita pelo motor', async () => {
    const c = await setupCompany()
    await c.send(newChat(), 'Absurdo!!! Ninguém me responde faz dois dias', { minutes: 9, pushName: 'Irritado' })
    await c.tick()
    expect((await c.alerts()).alerts.some((a) => a.ruleName === 'Cliente irritado')).toBe(true)
    const conv = (await c.conversations('Irritado'))[0]
    expect(conv.sentiment).toBe('frustrated')

    // gestor corrige a intenção
    await c.admin.post(`/api/conversations/${conv.id}/feedback`, { data: { type: 'intent', previousValue: conv.primaryIntent ?? 'x', correctedValue: 'suporte', justification: 'era dúvida' } })
    await c.tick()
    const again = (await c.conversations('Irritado'))[0]
    expect(again.primaryIntent).toBe('suporte')
    await c.dispose()
  })

  test('suporte/reclamação não viram oportunidade de venda', async () => {
    const c = await setupCompany()
    await c.send(newChat(), 'Tenho um problema, o produto não funciona', { minutes: 3, pushName: 'So Suporte' })
    await c.tick()
    const conv = (await c.conversations('So Suporte'))[0]
    expect(conv.primaryIntent).toBe('suporte')
    expect(conv.potentialValue).toBe(0)
    await c.dispose()
  })
})

test.describe('B6 · promessas', () => {
  test('promessa "já te retorno em 1 hora" sem cumprimento → promessa vencida; cumprir resolve', async () => {
    const c = await setupCompany()
    const chat = newChat()
    await c.send(chat, 'Vocês fazem clareamento?', { minutes: 240, pushName: 'Promessa Cliente' })
    await c.send(chat, 'Fazemos sim! Já te retorno em 1 hora com os valores.', { fromMe: true, minutes: 200 })
    await c.tick()

    const { alerts } = await c.alerts()
    expect(alerts.some((a) => a.ruleName === 'Promessa vencida' && a.customerName === 'Promessa Cliente')).toBe(true)
    const promise = await testDb.promise.findFirst({ where: { conversation: { organization: { adminEmail: c.email } } } })
    expect(promise!.status).toBe('open')

    await c.send(chat, 'Os valores são R$ 400 no total.', { fromMe: true })
    await c.tick()
    const after = await testDb.promise.findFirst({ where: { id: promise!.id } })
    expect(after!.status).toBe('kept')
    const open = (await c.alerts('new')).alerts.filter((a) => a.ruleName === 'Promessa vencida')
    expect(open).toHaveLength(0)
    await c.dispose()
  })
})

test.describe('B6 · atendente pela assinatura', () => {
  test('mensagem assinada "*Carlos*:" atribui a conversa ao atendente cadastrado', async () => {
    const c = await setupCompany()
    await c.admin.post('/api/team', { data: { name: 'Carlos Mendes', email: 'carlos@empresa.test', role: 'atendente' } })
    const chat = newChat()
    await c.send(chat, 'Oi, tudo bem?', { minutes: 5, pushName: 'Assinatura' })
    await c.send(chat, '*Carlos*: Olá! Como posso ajudar?', { fromMe: true, minutes: 3 })
    await c.tick()
    const conv = (await c.conversations('Assinatura'))[0]
    expect(conv.agentName).toBe('Carlos Mendes')
    await c.dispose()
  })
})

test.describe('B6 · conexão', () => {
  test('conexão que estava conectada e caiu → alerta crítico; QR pendente de uma conexão nova NÃO alerta', async () => {
    const c = await setupCompany()
    // uma segunda conexão, nova e ainda sem parear
    await c.admin.post('/api/connections', { data: { name: 'Nova', phoneNumber: '+5511900004321' } })
    await c.gw.post('/api/gateway/events', { data: { eventId: `dn-${Date.now()}`, connectionId: c.connectionId, type: 'connection.status', payload: { status: 'disconnected', reason: 'logged_out' } } })
    await c.tick()
    const down = (await c.alerts()).alerts.filter((a) => a.ruleName === 'Conexão desconectada')
    expect(down).toHaveLength(1)
    expect(down[0].conversationId).toBeNull()
    await c.dispose()
  })
})

test.describe('B6 · métricas do painel vêm dos dados reais', () => {
  test('dashboard: conversas iniciadas, clientes aguardando, 1ª resposta e nota', async () => {
    const c = await setupCompany()
    const a = newChat()
    const b = newChat()
    await c.send(a, 'Bom dia, quanto custa?', { minutes: 120, pushName: 'Atendida' })
    await c.send(a, 'Bom dia! Custa R$ 150.', { fromMe: true, minutes: 114 }) // 1ª resposta em 6 min
    await c.send(b, 'Alguém?', { minutes: 30, pushName: 'Aguardando' })
    await c.tick()

    const d = await (await c.admin.get('/api/dashboard?period=7d')).json()
    expect(d.summary.conversationsStarted).toBe(2)
    expect(d.summary.customersWaiting).toBe(1)
    expect(d.summary.medianFirstResponse).toBeGreaterThanOrEqual(5.5)
    expect(d.summary.medianFirstResponse).toBeLessThanOrEqual(6.5)
    expect(d.summary.overallScore).toBeGreaterThan(0)
    expect(d.priorities.map((p: { customerName: string }) => p.customerName)).toContain('Aguardando')

    // o gráfico de falhas reflete os alertas de verdade
    expect(d.failures.length).toBeGreaterThan(0)
    const conv = (await c.conversations('Aguardando'))[0]
    expect(conv.score).toBeGreaterThanOrEqual(0)
    await c.dispose()
  })
})

test.describe('B6 · isolamento e dados antigos', () => {
  test('alertas de uma empresa não aparecem na outra', async () => {
    const x = await setupCompany()
    const y = await setupCompany()
    await x.send(newChat(), 'Olá??', { minutes: 45, pushName: 'So Da X' })
    await x.tick()
    expect((await x.alerts()).alerts.some((a) => a.customerName === 'So Da X')).toBe(true)
    expect((await y.alerts()).alerts.some((a) => a.customerName === 'So Da X')).toBe(false)
    expect((await y.conversations()).length).toBe(0)
    await x.dispose()
    await y.dispose()
  })

  test('conversas de demonstração (sem mensagens reais) não são tocadas pelo motor', async () => {
    const admin = await loginAs('admin.a@test.local')
    const before = await (await admin.get('/api/alerts?limit=100')).json()
    const gw = await gatewayClient()
    expect((await gw.post('/api/gateway/tick', { data: {} })).status()).toBe(200)
    const after = await (await admin.get('/api/alerts?limit=100')).json()
    const key = (r: { alerts: Array<{ id: string; status: string }> }) => r.alerts.map((a) => `${a.id}:${a.status}`).sort()
    expect(key(after)).toEqual(key(before))
    await gw.dispose()
    await admin.dispose()
  })
})
