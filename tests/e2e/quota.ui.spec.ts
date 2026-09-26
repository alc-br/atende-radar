import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'
import { newChat, setupCompany } from './gw'
import { testDb } from './db'

// B8 · Cota de conversas por mês: aviso em 80 %, 95 % e 100 % na faixa do topo (só para o administrador).
// Limite "suave": as mensagens continuam chegando; o aviso pede a troca de plano.
test('administrador vê o aviso de cota ao passar de 80 % e "limite atingido" em 100 %', async ({ page, context, isMobile }) => {
  const c = await setupCompany()
  const me = await (await c.admin.get('/api/me')).json()
  // plano de teste com limite pequeno, só para esta empresa
  const plan = await testDb.plan.create({
    data: { code: `teste_${Date.now()}`, name: 'Teste Cota', monthlyPrice: 1, annualPrice: 10, maxConnections: 5, maxAgents: 5, maxConversationsMonthly: 5, maxMessagesMonthly: 100, maxAlertRules: 50, retentionDays: 30, maxExports: 10, active: false, sortOrder: 99 },
  })
  await testDb.subscription.update({ where: { organizationId: me.organizationId }, data: { planId: plan.id } })

  for (let i = 0; i < 4; i++) await c.send(newChat(), `Oi ${i}`, { minutes: 5, pushName: `Cliente ${i}` })
  const api = await loginAs(c.email, c.password)
  for (const tourId of ['welcome', 'dashboard']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()

  await page.goto('/')
  const warning = page.getByTestId('quota-warning')
  await expect(warning).toBeVisible({ timeout: 20000 })
  await expect(warning).toContainText('4 de 5 conversas')
  await expect(warning).toContainText('80%')

  await c.send(newChat(), 'Oi 5', { minutes: 5, pushName: 'Cliente 5' })
  await c.send(newChat(), 'Oi 6', { minutes: 5, pushName: 'Cliente 6' }) // continua recebendo além do limite
  await page.reload()
  await expect(page.getByTestId('quota-warning')).toContainText('Limite do plano Teste Cota atingido', { timeout: 20000 })
  await expect(page.getByTestId('quota-warning')).toContainText('6 de 5')
  expect((await c.conversations()).length).toBe(6)
  void isMobile
  await c.dispose()
})
