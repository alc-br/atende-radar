import { test, expect } from '@playwright/test'
import { newChat, setupCompany } from './gw'
import { testDb } from './db'

// Onda 4 · Configurações que antes eram só guardadas agora VALEM: números excluídos (Privacidade), parâmetros financeiros
// (teto, amostra mínima, exibir estimativas), relatório diário/semanal (vira o agendamento real da tela Relatórios),
// mascaramento automático e exportação pelo titular. Cada teste usa uma empresa nova (cadastro real).

const orgIdOf = async (c: Awaited<ReturnType<typeof setupCompany>>) => (await (await c.admin.get('/api/me')).json()).organizationId as string
const nationalOf = (chatId: string) => chatId.split('@')[0].slice(2) // 55 11 9XXXXXXXX → 119XXXXXXXX

test.describe('Privacidade · números excluídos do monitoramento', () => {
  test('número na lista: o que já existia sai das telas e mensagens novas não são guardadas nem analisadas', async () => {
    const c = await setupCompany()
    const orgId = await orgIdOf(c)
    const antigo = newChat()
    const novo = newChat()
    const monitorado = newChat()
    await c.send(antigo, 'Oi, quanto custa o clareamento?', { minutes: 40, pushName: 'Excluido Antigo' })
    await c.send(monitorado, 'Oi, quanto custa o clareamento?', { minutes: 40, pushName: 'Segue Monitorado' })
    await c.tick({ onlyThisCompany: true })
    expect((await c.alerts()).alerts.some((a) => a.customerName === 'Excluido Antigo')).toBe(true)

    // formatos diferentes do que o WhatsApp manda: com máscara e sem o 55; com +55 e espaços
    const d = nationalOf(antigo)
    const n = nationalOf(novo)
    const list = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}\n+55 ${n.slice(0, 2)} ${n.slice(2)}`
    const r = await c.admin.patch('/api/settings', { data: { settings: { privExcluded: list } } })
    expect(r.status()).toBe(200)
    expect((await r.json()).excludedContacts).toBe(1)

    // o contato que já existia: some da lista e os alertas abertos são dispensados
    expect(await c.conversations('Excluido Antigo')).toHaveLength(0)
    expect((await c.alerts('new')).alerts.some((a) => a.customerName === 'Excluido Antigo')).toBe(false)
    expect((await c.conversations('Segue Monitorado')).length).toBe(1)

    // mensagens novas de números da lista: nada guardado
    await c.send(antigo, 'Ainda estou esperando', { minutes: 1, pushName: 'Excluido Antigo' })
    await c.send(novo, 'Oi, quanto custa?', { minutes: 30, pushName: 'Excluido Novo' })
    await c.tick({ onlyThisCompany: true })
    expect(await c.conversations('Excluido Novo')).toHaveLength(0)
    expect(await testDb.contact.count({ where: { organizationId: orgId, phoneLast4: n.slice(-4), displayName: 'Excluido Novo' } })).toBe(0)
    const oldContact = await testDb.contact.findFirst({ where: { organizationId: orgId, displayName: 'Excluido Antigo' } })
    expect(oldContact?.excluded).toBe(true)
    expect(await testDb.message.count({ where: { conversation: { contactId: oldContact!.id }, text: 'Ainda estou esperando' } })).toBe(0)

    // a ação fica no registro de auditoria
    expect(await testDb.auditLog.count({ where: { organizationId: orgId, action: 'privacy.exclude' } })).toBeGreaterThan(0)
    await c.dispose()
  })
})

test.describe('Financeiro · teto, amostra mínima e exibir estimativas', () => {
  test('teto por oportunidade limita o valor estimado e o "Como calculamos" explica', async () => {
    const c = await setupCompany()
    await c.settings({ avgTicket: '2000', convRate: '20', opportunityCeiling: '500' })
    await c.send(newChat(), 'Oi, quanto custa o clareamento?', { minutes: 5, pushName: 'Com Teto' })
    await c.tick({ onlyThisCompany: true })

    const conv = (await c.conversations('Com Teto'))[0]
    expect(conv.potentialValue).toBe(500) // 2000 × 20 % × 1,6 = 640, limitado a 500
    const detail = await (await c.admin.get(`/api/conversations/${conv.id}`)).json()
    expect(detail.valueExplanation).toMatchObject({ expectedValue: 500, uncappedValue: 640, ceiling: 500, ceilingApplied: true })
    expect(detail.valueExplanation.rangeHigh).toBeLessThanOrEqual(500)

    // sem teto (vazio) volta ao valor cheio
    await c.settings({ opportunityCeiling: '' })
    await c.send(newChat(), 'Oi, quanto custa o clareamento?', { minutes: 5, pushName: 'Sem Teto' })
    await c.tick({ onlyThisCompany: true })
    expect((await c.conversations('Sem Teto'))[0].potentialValue).toBe(640)
    await c.dispose()
  })

  test('amostra mínima: com N vendas confirmadas o ticket passa a ser a média delas', async () => {
    const c = await setupCompany()
    await c.settings({ avgTicket: '2000', convRate: '20', minSample: '2' })
    for (const [name, value] of [['Venda Um', 3000], ['Venda Dois', 5000]] as const) {
      await c.send(newChat(), 'Oi, quanto custa o clareamento?', { minutes: 5, pushName: name })
      await c.tick({ onlyThisCompany: true })
      const conv = (await c.conversations(name))[0]
      expect(conv.potentialValue).toBe(640) // ainda com o ticket informado
      const r = await c.admin.post(`/api/conversations/${conv.id}/outcome`, { data: { outcome: 'won', value } })
      expect(r.status()).toBe(200)
    }

    await c.send(newChat(), 'Oi, quanto custa o clareamento?', { minutes: 5, pushName: 'Depois Da Amostra' })
    await c.tick({ onlyThisCompany: true })
    const conv = (await c.conversations('Depois Da Amostra'))[0]
    expect(conv.potentialValue).toBe(Math.round(4000 * 0.2 * 1.6)) // média (3000 + 5000) / 2
    const detail = await (await c.admin.get(`/api/conversations/${conv.id}`)).json()
    expect(detail.valueExplanation).toMatchObject({ avgTicket: 4000, ticketSource: 'confirmed_sales', salesSample: 2, minSample: 2 })
    expect(detail.opportunities[0].ticketSource).toBe('confirmed_sales')
    await c.dispose()
  })

  test('"Exibir estimativas" desligado: Conversas não mostram valor; ligado de novo, voltam', async () => {
    const c = await setupCompany()
    await c.settings({ avgTicket: '2000', convRate: '20' })
    await c.send(newChat(), 'Oi, quanto custa o clareamento?', { minutes: 5, pushName: 'Estimativa' })
    await c.tick({ onlyThisCompany: true })
    const id = (await c.conversations('Estimativa'))[0].id as string

    await c.settings({ showEstimates: false })
    const list = await (await c.admin.get('/api/conversations?search=Estimativa')).json()
    expect(list.estimatesHidden).toBe(true)
    expect(list.conversations[0]).toMatchObject({ potentialValue: 0, hasOpportunity: false })
    const hidden = await (await c.admin.get(`/api/conversations/${id}`)).json()
    expect(hidden).toMatchObject({ potentialValue: 0, valueExplanation: null, estimatesHidden: true, opportunities: [] })

    await c.settings({ showEstimates: true })
    expect((await c.conversations('Estimativa'))[0].potentialValue).toBe(640)
    await c.dispose()
  })
})

test.describe('Notificações › Relatórios agendados viram o agendamento real', () => {
  test('diário/semanal salvos nas Configurações (ou no onboarding) mudam o Relatório Diário e o Semanal', async () => {
    const c = await setupCompany()
    const orgId = await orgIdOf(c)
    const r = await c.admin.patch('/api/settings', { data: { settings: { notifDailyEnabled: false, notifWeeklyEnabled: true, notifWeeklyTime: '07:30' } } })
    expect(r.status()).toBe(200)
    expect((await r.json()).reportsUpdated).toEqual(['daily', 'weekly'])

    let s = await (await c.admin.get('/api/settings')).json()
    const def = (type: string) => (s.reportDefinitions as Array<{ reportType: string; schedule: string | null }>).find((d) => d.reportType === type)
    expect(def('daily')?.schedule).toBeNull() // sem envio automático
    expect(def('weekly')?.schedule).toBe('07:30')
    // não fica uma segunda cópia solta no JSON das Configurações
    expect(s.settings.notifDailyEnabled).toBeUndefined()
    expect(s.settings.notifWeeklyTime).toBeUndefined()

    await c.settings({ notifDailyEnabled: true, notifDailyTime: '19:15', notifDailyDays: '2,3' })
    s = await (await c.admin.get('/api/settings')).json()
    expect(def('daily')?.schedule).toBe('19:15')
    const daily = await testDb.reportDefinition.findFirst({ where: { organizationId: orgId, reportType: 'daily' } })
    expect(JSON.parse(daily!.daysOfWeek)).toEqual([1, 2]) // 2 = segunda → 1, 3 = terça → 2 (0 = domingo)

    // horário inválido não apaga o agendamento
    await c.settings({ notifWeeklyTime: '25:99' })
    s = await (await c.admin.get('/api/settings')).json()
    expect(def('weekly')?.schedule).toBe('07:30')
    await c.dispose()
  })
})

test.describe('Privacidade · mascaramento automático e exportação pelo titular', () => {
  const CPF = '529.982.247-25'

  test('mascaramento desligado: mensagens novas ficam como chegaram; ligado (padrão), mascaradas', async () => {
    const c = await setupCompany()
    const chat = newChat()
    await c.send(chat, `Meu CPF é ${CPF}`, { minutes: 3, pushName: 'Mascara Toggle' })
    await c.tick({ onlyThisCompany: true })
    const id = (await c.conversations('Mascara Toggle'))[0].id as string
    let stored = await testDb.message.findMany({ where: { conversationId: id }, orderBy: { occurredAt: 'asc' } })
    expect(stored[0].text).not.toContain(CPF)

    await c.settings({ privMasking: false })
    await c.send(chat, `Repetindo: ${CPF}`, { minutes: 2, pushName: 'Mascara Toggle' })
    stored = await testDb.message.findMany({ where: { conversationId: id }, orderBy: { occurredAt: 'asc' } })
    expect(stored[1].text).toBe(`Repetindo: ${CPF}`)
    expect(stored[0].text).not.toContain(CPF) // o que já entrou mascarado continua mascarado
    const detail = await (await c.admin.get(`/api/conversations/${id}`)).json()
    expect(detail.messages[1].text).toBe(`Repetindo: ${CPF}`)

    await c.settings({ privMasking: true })
    const again = await (await c.admin.get(`/api/conversations/${id}`)).text()
    expect(again).not.toContain(CPF) // a tela volta a mascarar o que ficou guardado
    await c.dispose()
  })

  test('exportação pelo titular: desligada = 403; ligada sai com base legal e encarregado', async () => {
    const c = await setupCompany()
    await c.send(newChat(), 'Oi, quero meus dados', { minutes: 3, pushName: 'Titular Export' })
    await c.tick({ onlyThisCompany: true })
    const id = (await c.conversations('Titular Export'))[0].id as string

    await c.settings({ privExport: false })
    const off = await c.admin.get(`/api/conversations/${id}/privacy/export`)
    expect(off.status()).toBe(403)
    expect((await off.json()).code).toBe('export_disabled')

    await c.settings({ privExport: true, privLegalBasis: 'consentimento', privDPO: 'dpo@empresa.test' })
    const on = await c.admin.get(`/api/conversations/${id}/privacy/export`)
    expect(on.status()).toBe(200)
    expect(await on.json()).toMatchObject({ baseLegal: 'Consentimento do titular', encarregado: 'dpo@empresa.test' })
    await c.dispose()
  })
})
