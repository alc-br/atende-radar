import { test, expect } from '@playwright/test'
import { newChat, setupCompany } from './gw'
import { testDb } from './db'

// P2 · As Configurações VALEM: horário comercial, regra fora do expediente, SLA, abandono, inatividade e reabertura
// mudam o que o motor faz. Cada teste usa uma empresa nova (cadastro real).

const NEVER_OPEN = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, { open: '', close: '', enabled: false }]))
const ALWAYS_OPEN = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, { open: '00:00', close: '23:59', enabled: true }]))

test.describe('P2 · horário comercial e regra fora do expediente', () => {
  test('"ignora": fora do expediente o cliente não conta como esperando → sem alerta; "atraso": conta → alerta', async () => {
    const c = await setupCompany()
    await c.settings({ businessHours: NEVER_OPEN, outsideRule: 'ignora', toleranceBefore: '0', toleranceAfter: '0' })
    await c.send(newChat(), 'Bom dia, alguém aí?', { minutes: 45, pushName: 'Fora Do Horario' })
    await c.tick()
    expect((await c.alerts()).alerts.filter((a) => a.customerName === 'Fora Do Horario')).toHaveLength(0)

    await c.settings({ outsideRule: 'atraso' })
    await c.tick()
    expect((await c.alerts()).alerts.filter((a) => a.customerName === 'Fora Do Horario' && a.status === 'new').length).toBeGreaterThan(0)
    await c.dispose()
  })

  test('"alerta, mas não pune": o alerta dispara, mas a nota da conversa não cai por espera fora do expediente', async () => {
    const punida = await setupCompany()
    await punida.settings({ businessHours: NEVER_OPEN, outsideRule: 'atraso' })
    await punida.send(newChat(), 'Oi, tem alguém?', { minutes: 100, pushName: 'Nota' })
    await punida.tick()

    const poupada = await setupCompany()
    await poupada.settings({ businessHours: NEVER_OPEN, outsideRule: 'alerta' })
    await poupada.send(newChat(), 'Oi, tem alguém?', { minutes: 100, pushName: 'Nota' })
    await poupada.tick()

    expect((await poupada.alerts()).alerts.some((a) => a.customerName === 'Nota')).toBe(true)
    const scorePoupada = (await poupada.conversations('Nota'))[0].score
    const scorePunida = (await punida.conversations('Nota'))[0].score
    expect(scorePoupada).toBeGreaterThan(scorePunida)
    expect(scorePoupada).toBeGreaterThanOrEqual(80)
    await punida.dispose()
    await poupada.dispose()
  })

  test('expediente 24 h com "ignora" conta tudo (equivale ao tempo corrido)', async () => {
    const c = await setupCompany()
    await c.settings({ businessHours: ALWAYS_OPEN, outsideRule: 'ignora', toleranceBefore: '0', toleranceAfter: '1' })
    await c.send(newChat(), 'Olá', { minutes: 45, pushName: 'Sempre Aberto' })
    await c.tick()
    expect((await c.alerts()).alerts.some((a) => a.customerName === 'Sempre Aberto')).toBe(true)
    await c.dispose()
  })
})

test.describe('P2 · SLA de primeira resposta na nota', () => {
  test('a mesma demora vale nota diferente conforme o SLA da empresa', async () => {
    const exigente = await setupCompany()
    await exigente.settings({ slaFirst: '5', slaContinuity: '10' })
    const folgada = await setupCompany()
    await folgada.settings({ slaFirst: '60', slaContinuity: '120' })
    for (const c of [exigente, folgada]) {
      const chat = newChat()
      await c.send(chat, 'Oi, quanto custa?', { minutes: 60, pushName: 'Mesma Demora' })
      await c.send(chat, 'Olá! Custa R$ 300.', { minutes: 35, fromMe: true })
      await c.send(chat, 'Ok, obrigado', { minutes: 30, pushName: 'Mesma Demora' })
      await c.send(chat, 'Por nada!', { minutes: 29, fromMe: true })
      await c.tick()
    }
    const nExigente = (await exigente.conversations('Mesma Demora'))[0].score
    const nFolgada = (await folgada.conversations('Mesma Demora'))[0].score
    expect(nFolgada).toBeGreaterThan(nExigente)
    await exigente.dispose()
    await folgada.dispose()
  })
})

test.describe('P2 · encerramento por inatividade, abandono e reabertura', () => {
  test('sem mensagens por mais tempo que "Encerramento por inatividade" → conversa encerrada e alertas resolvidos', async () => {
    const c = await setupCompany()
    await c.settings({ inactivityClose: '1', abandonTime: '48' })
    const chat = newChat()
    await c.send(chat, 'Oi', { minutes: 200, pushName: 'Sumiu' })
    await c.send(chat, 'Olá, em que posso ajudar?', { minutes: 190, fromMe: true })
    await c.tick()
    const conv = await testDb.conversation.findFirstOrThrow({ where: { contact: { displayName: 'Sumiu' }, organization: { adminEmail: c.email } } })
    expect(conv.closedAt).not.toBeNull()
    expect(conv.operationalStatus).toBe('closed')
    await c.dispose()
  })

  test('cliente com oportunidade que some por mais que "Tempo de abandono" → perdido por abandono (opportunidade e conversa)', async () => {
    const c = await setupCompany()
    await c.settings({ abandonTime: '1', inactivityClose: '48' })
    const chat = newChat()
    await c.send(chat, 'Quanto custa a limpeza?', { minutes: 150, pushName: 'Abandonou' })
    await c.send(chat, 'Custa R$ 200. Quer agendar?', { minutes: 140, fromMe: true })
    await c.tick()
    const conv = await testDb.conversation.findFirstOrThrow({ where: { contact: { displayName: 'Abandonou' }, organization: { adminEmail: c.email } }, include: { opportunities: true } })
    expect(conv.operationalStatus).toBe('lost')
    expect(conv.closedAt).not.toBeNull()
    expect(JSON.parse(conv.tags)).toContain('abandono')
    expect(conv.opportunities.length).toBeGreaterThan(0)
    expect(conv.opportunities.every((o) => o.status === 'lost')).toBe(true)

    // ainda sem 1 h desde a última mensagem da empresa → NÃO é abandono
    const chat2 = newChat()
    await c.send(chat2, 'Quanto custa a limpeza?', { minutes: 50, pushName: 'Ainda Pensando' })
    await c.send(chat2, 'Custa R$ 200.', { minutes: 40, fromMe: true })
    await c.tick()
    const conv2 = await testDb.conversation.findFirstOrThrow({ where: { contact: { displayName: 'Ainda Pensando' }, organization: { adminEmail: c.email } } })
    expect(conv2.closedAt).toBeNull()
    await c.dispose()
  })

  test('mensagem nova dentro da "Janela de reabertura" reabre a MESMA conversa; fora dela abre outra', async () => {
    const c = await setupCompany()
    await c.settings({ inactivityClose: '1', reopenWindow: '72' })
    const chat = newChat()
    await c.send(chat, 'Oi', { minutes: 200, pushName: 'Voltou' })
    await c.send(chat, 'Olá!', { minutes: 190, fromMe: true })
    await c.tick()
    const org = { organization: { adminEmail: c.email } }
    expect((await testDb.conversation.findFirstOrThrow({ where: { contact: { displayName: 'Voltou' }, ...org } })).closedAt).not.toBeNull()

    await c.send(chat, 'Voltei, ainda tem vaga?', { minutes: 1, pushName: 'Voltou' })
    const reopened = await testDb.conversation.findMany({ where: { contact: { displayName: 'Voltou' }, ...org } })
    expect(reopened).toHaveLength(1)
    expect(reopened[0].closedAt).toBeNull()
    expect(reopened[0].operationalStatus).toBe('waiting_company')

    // janela 0 h = nunca reabre: a próxima mensagem depois de encerrar abre outra conversa
    await c.settings({ reopenWindow: '0' })
    await testDb.conversation.updateMany({ where: { id: reopened[0].id }, data: { closedAt: new Date(), operationalStatus: 'closed' } })
    await c.send(chat, 'Oi de novo', { pushName: 'Voltou' })
    expect(await testDb.conversation.count({ where: { contact: { displayName: 'Voltou' }, ...org } })).toBe(2)
    await c.dispose()
  })
})
