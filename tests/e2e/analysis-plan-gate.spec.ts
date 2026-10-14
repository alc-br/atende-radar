import { test, expect } from '@playwright/test'
import { newChat, setupCompany } from './gw'
import { testDb } from './db'
import { uid } from './helpers'

// T11 · O plano manda no motor de análise:
//  · acima do limite de conversas do mês, as conversas novas são guardadas mas NÃO analisadas (e o dono é avisado);
//  · teste grátis vencido sem plano contratado pausa a análise da empresa (as mensagens continuam chegando).
// O tick com organizationId roda só esta empresa.

const orgIdOf = async (c: Awaited<ReturnType<typeof setupCompany>>) => (await (await c.admin.get('/api/me')).json()).organizationId as string
const billingNotices = (organizationId: string, kind: string) =>
  testDb.notification.findMany({ where: { organizationId, type: 'billing', data: { contains: `"kind":"${kind}"` } } })

test('limite de conversas do mês: a que passou do limite não é analisada; com limite maior, é', async () => {
  const c = await setupCompany()
  const orgId = await orgIdOf(c)
  const plan = await testDb.plan.create({
    data: { code: `teste_lim_${uid()}`, name: 'Teste Limite', monthlyPrice: 1, annualPrice: 10, maxConnections: 5, maxAgents: 5, maxConversationsMonthly: 2, maxMessagesMonthly: 1000, maxAlertRules: 50, retentionDays: 30, maxExports: 10, active: false, sortOrder: 99 },
  })
  await testDb.subscription.update({ where: { organizationId: orgId }, data: { planId: plan.id } })

  // três conversas novas, na ordem; todas pedem preço e esperam resposta há 30 min (gerariam alerta)
  for (const name of ['Cota Um', 'Cota Dois', 'Cota Tres']) {
    await c.send(newChat(), 'Oi, quanto custa o clareamento?', { minutes: 30, pushName: name })
  }
  const t = await c.tick({ onlyThisCompany: true })
  expect(t.overQuota).toBe(1)

  const alerts = (await c.alerts()).alerts
  expect(alerts.some((a) => a.customerName === 'Cota Um')).toBe(true)
  expect(alerts.some((a) => a.customerName === 'Cota Dois')).toBe(true)
  expect(alerts.some((a) => a.customerName === 'Cota Tres')).toBe(false)
  const terceira = (await c.conversations('Cota Tres'))[0]
  expect(terceira).toBeTruthy() // guardada, só não analisada
  const row = await testDb.conversation.findUnique({ where: { id: terceira.id } })
  expect(row?.needsAnalysisAt).not.toBeNull()
  expect(await testDb.message.count({ where: { conversationId: terceira.id } })).toBe(1)

  // aviso ao dono: uma vez só, por mais rodadas que haja
  await c.tick({ onlyThisCompany: true })
  expect(await billingNotices(orgId, 'conversation_quota')).toHaveLength(1)
  const sub = await (await c.admin.get('/api/subscription')).json()
  expect(sub.analysis).toEqual({ paused: null, unanalyzed: 1 })

  // plano com limite maior: entra na próxima rodada
  await testDb.plan.update({ where: { id: plan.id }, data: { maxConversationsMonthly: 10 } })
  const t2 = await c.tick({ onlyThisCompany: true })
  expect(t2.overQuota).toBeUndefined()
  expect((await c.alerts()).alerts.some((a) => a.customerName === 'Cota Tres')).toBe(true)
  expect((await (await c.admin.get('/api/subscription')).json()).analysis.unanalyzed).toBe(0)
  await c.dispose()
})

test('teste grátis vencido sem plano: análise pausada, aviso claro; contratando, volta a analisar', async () => {
  const c = await setupCompany()
  const orgId = await orgIdOf(c)
  const ended = new Date(Date.now() - 3600_000)
  await testDb.subscription.update({ where: { organizationId: orgId }, data: { status: 'trialing', trialEnd: ended, currentPeriodEnd: ended } })

  await c.send(newChat(), 'Oi, quanto custa o clareamento?', { minutes: 30, pushName: 'Teste Vencido' })
  const t = await c.tick({ onlyThisCompany: true })
  expect(t.paused).toBe('trial_expired')
  expect(t.conversations).toBe(0)
  expect((await c.alerts()).alerts.some((a) => a.customerName === 'Teste Vencido')).toBe(false)
  expect((await c.conversations('Teste Vencido')).length).toBe(1) // a mensagem foi recebida e guardada

  await c.tick({ onlyThisCompany: true })
  const notices = await billingNotices(orgId, 'analysis_paused')
  expect(notices).toHaveLength(1)
  expect(notices[0].title).toContain('análise pausada')
  const sub = await (await c.admin.get('/api/subscription')).json()
  expect(sub.subscription.status).toBe('expired')
  expect(sub.analysis.paused).toBe('trial_expired')

  // plano contratado: a próxima rodada analisa o que ficou parado
  await testDb.subscription.update({ where: { organizationId: orgId }, data: { status: 'active', trialEnd: null, currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) } })
  const t2 = await c.tick({ onlyThisCompany: true })
  expect(t2.paused).toBeUndefined()
  expect((await c.alerts()).alerts.some((a) => a.customerName === 'Teste Vencido')).toBe(true)
  expect((await (await c.admin.get('/api/subscription')).json()).analysis.paused).toBeNull()
  await c.dispose()
})
