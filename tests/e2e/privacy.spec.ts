import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'
import { gatewayClient, newChat, setupCompany } from './gw'
import { testDb } from './db'

// B9 (parte técnica) · Privacidade: parar de monitorar um contato, apagar os dados de um cliente e expurgo por prazo de retenção.
async function conversationOf(c: Awaited<ReturnType<typeof setupCompany>>, name: string) {
  return (await c.conversations(name))[0] as { id: string }
}

test.describe('Privacidade · parar de monitorar um contato', () => {
  test('excluir do monitoramento: a conversa some da análise e as mensagens seguintes são ignoradas', async () => {
    const c = await setupCompany()
    const chat = newChat()
    await c.send(chat, 'Oi, quanto custa?', { minutes: 30, pushName: 'Pessoa Reservada' })
    await c.tick()
    expect((await c.alerts()).alerts.some((a) => a.customerName === 'Pessoa Reservada')).toBe(true)
    const conv = await conversationOf(c, 'Pessoa Reservada')

    const r = await c.admin.post(`/api/conversations/${conv.id}/privacy`, { data: { action: 'exclude' } })
    expect(r.status()).toBe(200)

    // alertas e conversa deixam de aparecer; mensagem nova é ignorada
    expect((await c.conversations('Pessoa Reservada')).length).toBe(0)
    expect((await c.alerts()).alerts.filter((a) => a.customerName === 'Pessoa Reservada' && a.status === 'new')).toHaveLength(0)
    const gw = await gatewayClient()
    const res = await gw.post('/api/gateway/events', {
      data: { eventId: `x-${Date.now()}`, connectionId: c.connectionId, type: 'message.received', payload: { externalId: `wa-x-${Date.now()}`, chatId: chat, isGroup: false, fromMe: false, text: 'oi de novo', messageType: 'text', pushName: 'Pessoa Reservada' } },
    })
    expect((await res.json()).ignored).toBe('excluded')
    expect((await c.conversations('Pessoa Reservada')).length).toBe(0)
    await gw.dispose()
    await c.dispose()
  })

  test('apagar dados: remove contato, conversas, mensagens, alertas e o resto do histórico daquele cliente', async () => {
    const c = await setupCompany()
    const chat = newChat()
    await c.send(chat, 'Quero agendar amanhã', { minutes: 40, pushName: 'Apagar Tudo' })
    await c.send(chat, 'Já te retorno em 1 hora', { fromMe: true, minutes: 35 })
    await c.tick()
    const other = newChat()
    await c.send(other, 'Bom dia', { minutes: 5, pushName: 'Nao Apagar' })
    const conv = await conversationOf(c, 'Apagar Tudo')

    const r = await c.admin.post(`/api/conversations/${conv.id}/privacy`, { data: { action: 'erase' } })
    expect(r.status()).toBe(200)
    expect((await r.json()).erased.messages).toBeGreaterThanOrEqual(2)

    expect((await c.conversations('Apagar Tudo')).length).toBe(0)
    expect(await testDb.message.count({ where: { conversationId: conv.id } })).toBe(0)
    expect(await testDb.alert.count({ where: { conversationId: conv.id } })).toBe(0)
    expect(await testDb.promise.count({ where: { conversationId: conv.id } })).toBe(0)
    expect(await testDb.contact.count({ where: { displayName: 'Apagar Tudo' } })).toBe(0)
    // os outros clientes ficam intactos
    expect((await c.conversations('Nao Apagar')).length).toBe(1)
    await c.dispose()
  })

  test('permissão e isolamento: atendente não apaga; outra empresa recebe 404', async () => {
    const c = await setupCompany()
    await c.send(newChat(), 'Oi', { minutes: 5, pushName: 'Protegido' })
    const conv = await conversationOf(c, 'Protegido')

    const att = await loginAs('atendente.a@test.local')
    expect((await att.post(`/api/conversations/${conv.id}/privacy`, { data: { action: 'erase' } })).status()).toBe(403)
    await att.dispose()

    const other = await setupCompany()
    expect((await other.admin.post(`/api/conversations/${conv.id}/privacy`, { data: { action: 'erase' } })).status()).toBe(404)
    expect(await testDb.message.count({ where: { conversationId: conv.id } })).toBe(1)
    await other.dispose()
    await c.dispose()
  })

  test('ação inválida → 400', async () => {
    const c = await setupCompany()
    await c.send(newChat(), 'Oi', { minutes: 5, pushName: 'Qualquer' })
    const conv = await conversationOf(c, 'Qualquer')
    expect((await c.admin.post(`/api/conversations/${conv.id}/privacy`, { data: { action: 'explodir' } })).status()).toBe(400)
    await c.dispose()
  })
})

test.describe('Privacidade · retenção', () => {
  test('o conteúdo das mensagens some depois do prazo configurado, mantendo os números (metadados)', async () => {
    const c = await setupCompany()
    await c.admin.patch('/api/settings', { data: { settings: { retContent: '30' } } })
    const chat = newChat()
    await c.send(chat, 'Mensagem antiga com conteúdo sensível', { minutes: 60 * 24 * 45, pushName: 'Retencao Velha' }) // 45 dias
    await c.send(newChat(), 'Mensagem recente', { minutes: 10, pushName: 'Retencao Nova' })
    await c.tick()

    const old = await testDb.message.findFirst({ where: { text: null, conversation: { contact: { displayName: 'Retencao Velha' } } } })
    expect(old).toBeTruthy() // conteúdo apagado, registro mantido
    expect(await testDb.message.count({ where: { text: 'Mensagem recente' } })).toBe(1)
    await c.dispose()
  })

  test('sem configuração usa 365 dias (nada de 45 dias é apagado)', async () => {
    const c = await setupCompany()
    await c.send(newChat(), 'Conteudo com 45 dias', { minutes: 60 * 24 * 45, pushName: 'Retencao Padrao' })
    await c.tick()
    expect(await testDb.message.count({ where: { text: 'Conteudo com 45 dias' } })).toBe(1)
    await c.dispose()
  })
})
