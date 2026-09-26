import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'
import { newChat, setupCompany } from './gw'

// Detalhe da conversa: os marcadores da linha do tempo são eventos REAIS (antes eram gerados "para demo" a partir do id).
test('linha do tempo mostra "Promessa feita" na mensagem da empresa e "Alerta disparado" depois da última do cliente', async ({ page, context, isMobile }) => {
  const c = await setupCompany()
  const chat = newChat()
  await c.send(chat, 'Oi, quanto custa a limpeza?', { minutes: 70, pushName: 'Linha Do Tempo' })
  await c.send(chat, 'Olá! Já te retorno em 1 hora com o valor.', { minutes: 65, fromMe: true })
  await c.send(chat, 'Ok, fico no aguardo', { minutes: 60, pushName: 'Linha Do Tempo' })
  await c.tick()
  expect((await c.alerts()).alerts.some((a) => a.customerName === 'Linha Do Tempo')).toBe(true)

  const api = await loginAs(c.email, c.password)
  for (const tourId of ['welcome', 'dashboard', 'conversations', 'conversation-detail']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()

  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-conversations"]').click()
  if (isMobile) await page.getByTestId('conversation-cards').getByRole('button').first().click()
  else await page.locator('table tbody tr').first().click()

  await expect(page.getByLabel(/^Promessa feita:/).first()).toBeVisible({ timeout: 20000 })
  await expect(page.getByLabel(/^Alerta disparado:/).first()).toBeVisible()
  // nada de marcador inventado
  await expect(page.getByLabel(/Intenção detectada|Pergunta feita|Mudança de sentimento/)).toHaveCount(0)
  await c.dispose()
})
