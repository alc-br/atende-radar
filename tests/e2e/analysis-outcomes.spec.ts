import { test, expect } from '@playwright/test'
import { newChat, setupCompany } from './gw'
import { testDb } from './db'

// B6 · Alertas agrupados (mesma conversa + mesma causa = um alerta com contador), venda/perda pelas mensagens e
// reanálise que respeita a correção humana. Cada teste usa uma empresa nova.

type Company = Awaited<ReturnType<typeof setupCompany>>
const orgOf = async (c: Company) => (await (await c.admin.get('/api/me')).json()).organizationId as string
const convOf = (orgId: string, name: string) =>
  testDb.conversation.findFirstOrThrow({ where: { organizationId: orgId, contact: { displayName: name } }, orderBy: { openedAt: 'desc' } })

/** Webhook ligado para os três eventos (a entrega falha, mas a fila registra cada evento) e e-mail em todas as regras. */
async function withHooks(c: Company, orgId: string) {
  const r = await c.admin.put('/api/settings/webhook', { data: { url: 'https://hooks.example.com/b6', enabled: true, events: ['alert.created', 'alert.resolved', 'alert.updated'] } })
  expect(r.status()).toBe(201)
  await testDb.alertRule.updateMany({ where: { organizationId: orgId }, data: { notificationChannels: '["in_app","email"]' } })
  await c.settings({ silenceStart: '00:00', silenceEnd: '00:00' })
  return {
    events: (event: string) => testDb.webhookDelivery.count({ where: { organizationId: orgId, event } }),
    emails: (alertId: string) => testDb.alertEmailItem.count({ where: { alertId } }),
  }
}

test.describe('B6 · alertas agrupados', () => {
  test('várias regras pela mesma causa → UM alerta: título da mais específica, gravidade da mais grave', async () => {
    const c = await setupCompany()
    // 25 min: dispara "sem primeira resposta" (crítico, 10 min) E "preço sem retorno" (alto, 15 min)
    await c.send(newChat(), 'Oi, quanto custa o clareamento?', { minutes: 25, pushName: 'Agrupa Preco' })
    await c.tick()
    const mine = (await c.alerts()).alerts.filter((a) => a.customerName === 'Agrupa Preco')
    expect(mine).toHaveLength(1)
    expect(mine[0].ruleName).toBe('Pedido de preço sem retorno')
    expect(mine[0].severity).toBe('critical')
    await c.tick()
    expect((await c.alerts()).alerts.filter((a) => a.customerName === 'Agrupa Preco')).toHaveLength(1)
    await c.dispose()
  })

  test('o problema volta na mesma conversa → o MESMO alerta reabre com contador, sem novo e-mail nem "alert.created"', async () => {
    const c = await setupCompany()
    const orgId = await orgOf(c)
    const hooks = await withHooks(c, orgId)
    const chat = newChat()
    await c.send(chat, 'Bom dia, preciso de ajuda', { minutes: 120, pushName: 'Repete Muito' })
    await c.tick()
    const first = (await c.alerts()).alerts.filter((a) => a.customerName === 'Repete Muito')
    expect(first).toHaveLength(1)
    const id = first[0].id
    const emailsBefore = await hooks.emails(id)
    expect(emailsBefore).toBeGreaterThan(0)
    expect(await hooks.events('alert.created')).toBe(1)

    await c.send(chat, 'Olá! Como posso ajudar?', { fromMe: true, minutes: 100 }) // empresa responde → motor resolve
    await c.tick()
    expect((await testDb.alert.findUniqueOrThrow({ where: { id } })).status).toBe('resolved')
    expect((await testDb.alert.findUniqueOrThrow({ where: { id } })).resolvedBy).toBe('auto')

    await c.send(chat, 'Oi? Ainda estou esperando', { minutes: 60 }) // cliente volta a esperar (> 30 min: acompanhamento)
    await c.tick()
    const again = (await c.alerts()).alerts.filter((a) => a.customerName === 'Repete Muito')
    expect(again).toHaveLength(1)
    expect(again[0].id).toBe(id)
    expect(again[0].status).toBe('new')
    expect(again[0].ruleName).toBe('Cliente sem resposta após interação')
    const row = await testDb.alert.findUniqueOrThrow({ where: { id } })
    expect(row.occurrences).toBe(2)
    expect(row.lastOccurredAt!.getTime()).toBeGreaterThan(row.createdAt.getTime())
    const api = (await (await c.admin.get('/api/alerts?limit=100')).json()).alerts.find((a: { id: string }) => a.id === id)
    expect(api.occurrences).toBe(2)
    expect(api.lastOccurredAt).toBe(row.lastOccurredAt!.toISOString())

    expect(await hooks.emails(id)).toBe(emailsBefore) // repetição não manda e-mail
    expect(await hooks.events('alert.created')).toBe(1) // nem "alerta criado" de novo
    expect(await hooks.events('alert.updated')).toBe(1) // só quem assinou "alerta atualizado" fica sabendo

    // resolvido por uma pessoa: se voltar, é alerta novo (aquele caso foi encerrado por alguém)
    expect((await c.admin.post(`/api/alerts/${id}/resolve`, { data: { reason: 'resolvido' } })).status()).toBe(200)
    expect((await testDb.alert.findUniqueOrThrow({ where: { id } })).resolvedBy).toBe('user')
    await c.send(chat, 'Olá', { fromMe: true, minutes: 50 })
    await c.send(chat, 'Alguém?', { minutes: 40 })
    await c.tick()
    // (o cliente insistindo pode abrir também "Cliente irritado": outra causa, outro alerta)
    const third = (await c.alerts('new')).alerts.filter((a) => a.customerName === 'Repete Muito' && a.ruleName !== 'Cliente irritado')
    expect(third).toHaveLength(1)
    expect(third[0].id).not.toBe(id)
    expect(await testDb.webhookDelivery.count({ where: { organizationId: orgId, event: 'alert.created', payload: { contains: third[0].id } } })).toBe(1)
    await c.dispose()
  })

  test('alerta aberto que fica mais grave sobe de gravidade no mesmo alerta e avisa de novo', async () => {
    const c = await setupCompany()
    const orgId = await orgOf(c)
    const hooks = await withHooks(c, orgId)
    await testDb.alertRule.updateMany({ where: { organizationId: orgId, type: 'pending_quote' }, data: { severity: 'medium', limitMinutes: 15 } })
    await testDb.alertRule.updateMany({ where: { organizationId: orgId, type: 'no_response' }, data: { severity: 'critical', limitMinutes: 60 } })
    await c.send(newChat(), 'Qual o valor da limpeza?', { minutes: 20, pushName: 'Vai Piorar' })
    await c.tick()
    const [a] = (await c.alerts()).alerts.filter((x) => x.customerName === 'Vai Piorar')
    expect(a.severity).toBe('medium')
    const emails = await hooks.emails(a.id)

    const conv = await convOf(orgId, 'Vai Piorar')
    await testDb.conversation.update({ where: { id: conv.id }, data: { waitingSince: new Date(Date.now() - 70 * 60000) } })
    await c.tick()
    const after = (await c.alerts()).alerts.filter((x) => x.customerName === 'Vai Piorar')
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe(a.id)
    expect(after[0].severity).toBe('critical')
    expect(after[0].ruleName).toBe('Pedido de preço sem retorno') // o título continua o mais específico
    expect(await hooks.emails(a.id)).toBeGreaterThan(emails) // agravou: e-mail de novo
    expect(await hooks.events('alert.updated')).toBe(1)
    expect(await hooks.events('alert.created')).toBe(1)
    const notifs = (await (await c.admin.get('/api/notifications')).json()).notifications as Array<{ title: string }>
    expect(notifs.some((n) => n.title.startsWith('Mais grave:') && n.title.includes('Vai Piorar'))).toBe(true)
    await c.dispose()
  })
})

test.describe('B6 · venda e perda pelas mensagens', () => {
  test('cliente diz que pagou → conversa ganha, oportunidade ganha, item da Recuperação recuperado e alerta resolvido', async () => {
    const c = await setupCompany()
    const orgId = await orgOf(c)
    await c.settings({ avgTicket: '1000', convRate: '20' })
    const chat = newChat()
    await c.send(chat, 'Oi, quanto custa o clareamento?', { minutes: 60, pushName: 'Pagou Pix' })
    await c.tick()
    expect((await testDb.recoveryItem.findMany({ where: { organizationId: orgId, customerName: 'Pagou Pix' } })).map((r) => r.status)).toEqual(['new'])

    await c.send(chat, 'Fica R$ 800. Segue a chave pix', { fromMe: true, minutes: 30 })
    await c.send(chat, 'Pronto, fiz o pix! Segue o comprovante', { minutes: 20 })
    await c.tick()
    const conv = await convOf(orgId, 'Pagou Pix')
    expect(conv.operationalStatus).toBe('won')
    expect(conv.closedAt).not.toBeNull()
    expect(JSON.parse(conv.tags)).toContain('venda-detectada')
    expect((await testDb.revenueOpportunity.findMany({ where: { conversationId: conv.id } })).map((o) => o.status)).toEqual(['won'])
    const rec = await testDb.recoveryItem.findMany({ where: { conversationId: conv.id } })
    expect(rec.map((r) => r.status)).toEqual(['recovered'])
    expect(rec[0].outcome).toContain('(automático)')
    expect((await c.alerts()).alerts.filter((a) => a.customerName === 'Pagou Pix').every((a) => a.status === 'resolved')).toBe(true)
    await c.dispose()
  })

  test('cliente diz que fechou com outra → perdida (sem item de abandono); pergunta ou negação não decidem nada', async () => {
    const c = await setupCompany()
    const orgId = await orgOf(c)
    const lost = newChat()
    await c.send(lost, 'Quanto custa a limpeza?', { minutes: 90, pushName: 'Comprou Fora' })
    await c.send(lost, 'Fica R$ 300', { fromMe: true, minutes: 80 })
    await c.send(lost, 'Obrigado, mas já fechei com outra clínica', { minutes: 10 })
    const unsure = newChat()
    await c.send(unsure, 'Quanto custa a limpeza?', { minutes: 90, pushName: 'Ainda Nao' })
    await c.send(unsure, 'Fica R$ 300', { fromMe: true, minutes: 80 })
    await c.send(unsure, 'Ainda não paguei, pode mandar a chave de novo?', { minutes: 10 })
    await c.tick()

    const l = await convOf(orgId, 'Comprou Fora')
    expect(l.operationalStatus).toBe('lost')
    expect(JSON.parse(l.tags)).toContain('perda-declarada')
    expect(JSON.parse(l.tags)).not.toContain('abandono')
    expect((await testDb.revenueOpportunity.findMany({ where: { conversationId: l.id } })).map((o) => o.status)).toEqual(['lost'])
    expect(await testDb.recoveryItem.count({ where: { conversationId: l.id } })).toBe(0)

    const u = await convOf(orgId, 'Ainda Nao')
    expect(u.closedAt).toBeNull()
    expect(u.operationalStatus).toBe('waiting_company')
    expect((await testDb.revenueOpportunity.findMany({ where: { conversationId: u.id } })).map((o) => o.status)).toEqual(['active'])
    await c.dispose()
  })
})

test.describe('B6 · reanálise respeita a correção humana', () => {
  test('resultado marcado por uma pessoa não é desfeito: nem por mensagem nova, nem por venda/perda automática, nem por abandono', async () => {
    const c = await setupCompany()
    const orgId = await orgOf(c)
    await c.settings({ abandonTime: '1', reopenWindow: '72' })
    const chat = newChat()
    await c.send(chat, 'Quero comprar o kit clareamento', { minutes: 30, pushName: 'Decidido Humano' })
    await c.tick()
    const conv = await convOf(orgId, 'Decidido Humano')
    expect((await c.admin.post(`/api/conversations/${conv.id}/outcome`, { data: { outcome: 'won', value: 900, reason: 'fechou no balcão' } })).status()).toBe(200)
    const fb = await testDb.classificationFeedback.findFirst({ where: { targetId: conv.id, targetType: 'outcome' } })
    expect(fb).toMatchObject({ correctedValue: 'won', justification: 'fechou no balcão' })

    // o cliente escreve de novo (dentro da janela de reabertura) dizendo que desistiu
    await c.send(chat, 'Desisti, obrigado', { minutes: 5 })
    await c.tick()
    await c.tick()
    const after = await testDb.conversation.findUniqueOrThrow({ where: { id: conv.id } })
    expect(after.operationalStatus).toBe('won')
    expect(after.closedAt).not.toBeNull()
    expect((await testDb.revenueOpportunity.findMany({ where: { conversationId: conv.id } })).map((o) => o.status)).toEqual(['won'])
    // a mensagem nova virou outra conversa
    expect(await testDb.conversation.count({ where: { organizationId: orgId, contact: { displayName: 'Decidido Humano' } } })).toBe(2)
    await c.dispose()
  })

  test('correção da intenção para "não é venda" sobrevive à reanálise e tira o valor em risco; corrigir intenção vazia funciona', async () => {
    const c = await setupCompany()
    await c.settings({ avgTicket: '1000', convRate: '20' })
    await c.send(newChat(), 'Quanto custa a revisão?', { minutes: 5, pushName: 'Era Garantia' })
    await c.tick()
    const conv = (await c.conversations('Era Garantia'))[0]
    expect(conv.potentialValue).toBeGreaterThan(0)

    // valor anterior é opcional
    expect((await c.admin.post(`/api/conversations/${conv.id}/feedback`, { data: { type: 'intent', correctedValue: 'suporte', justification: 'é garantia' } })).status()).toBe(200)
    await c.tick()
    await c.tick()
    const again = (await c.conversations('Era Garantia'))[0]
    expect(again.primaryIntent).toBe('suporte')
    expect(again.potentialValue).toBe(0)
    expect(await testDb.revenueOpportunity.count({ where: { conversationId: conv.id, status: 'active' } })).toBe(0)
    const cls = await testDb.conversationClassification.findFirstOrThrow({ where: { conversationId: conv.id, classificationType: 'intent' } })
    expect(cls).toMatchObject({ label: 'suporte', reviewedStatus: 'corrected' })

    // intenção vazia ("Bom dia") corrigida para compra: antes dava 400 por faltar o valor anterior
    await c.send(newChat(), 'Bom dia', { minutes: 3, pushName: 'Sem Intencao' })
    await c.tick()
    const blank = (await c.conversations('Sem Intencao'))[0]
    expect(blank.primaryIntent ?? null).toBeNull()
    expect((await c.admin.post(`/api/conversations/${blank.id}/feedback`, { data: { type: 'intent', previousValue: '', correctedValue: 'compra' } })).status()).toBe(200)
    await c.tick()
    const fixed = (await c.conversations('Sem Intencao'))[0]
    expect(fixed.primaryIntent).toBe('compra')
    expect(fixed.potentialValue).toBeGreaterThan(0)

    // correção pela classificação ("classification:<id>") vale como correção do tipo dela
    const sent = await testDb.conversationClassification.findFirstOrThrow({ where: { conversationId: blank.id, classificationType: 'sentiment' } })
    expect((await c.admin.post(`/api/conversations/${blank.id}/feedback`, { data: { type: `classification:${sent.id}`, correctedValue: 'frustrated' } })).status()).toBe(200)
    await c.tick()
    expect((await testDb.conversation.findUniqueOrThrow({ where: { id: blank.id } })).sentiment).toBe('frustrated')
    expect((await c.admin.post(`/api/conversations/${blank.id}/feedback`, { data: { type: 'qualquer', correctedValue: 'x' } })).status()).toBe(400)
    await c.dispose()
  })
})
