import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'
import { newChat, setupCompany } from './gw'

// P6 · "Por que este valor em risco": o detalhe da conversa mostra o passo a passo do cálculo (ticket médio, conversão,
// intenção detectada, multiplicador) e o resultado é o MESMO valor exibido no cabeçalho.
test('"Como calculamos" mostra ticket, conversão e multiplicador e chega ao valor exibido', async ({ page, context, isMobile }) => {
  const c = await setupCompany()
  await c.settings({ avgTicket: '2000', convRate: '20' })
  await c.send(newChat(), 'Oi, quanto custa o clareamento?', { minutes: 25, pushName: 'Por Que Valor' })
  await c.tick({ onlyThisCompany: true })

  const conv = (await c.conversations('Por Que Valor'))[0]
  const expected = Math.round(2000 * 0.2 * 1.6) // ticket × conversão × fator de "preço"
  expect(conv.potentialValue).toBe(expected)

  // a API devolve o passo a passo calculado pela mesma função do motor
  const detail = await (await c.admin.get(`/api/conversations/${conv.id}`)).json()
  expect(detail.valueExplanation).toMatchObject({ intent: 'preco', avgTicket: 2000, conversionRate: 0.2, intentFactor: 1.6, expectedValue: expected })
  expect(detail.valueExplanation.expectedValue).toBe(detail.potentialValue)

  const api = await loginAs(c.email, c.password)
  for (const tourId of ['welcome', 'dashboard', 'conversations', 'conversation-detail']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()

  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-conversations"]').click()
  if (isMobile) await page.getByTestId('conversation-cards').getByRole('button').first().click()
  else await page.locator('table tbody tr').first().click()

  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  const shown = money.format(expected)
  await expect(page.locator('.contato__meta')).toContainText(shown, { timeout: 20000 })

  const box = page.getByTestId('value-explanation')
  await box.getByText('Como calculamos').click()
  await expect(box).toContainText(money.format(2000))
  await expect(box).toContainText('20%')
  await expect(box).toContainText('×1,6')
  await expect(box).toContainText('32%')
  await expect(page.getByTestId('value-explanation-result')).toContainText(`= ${shown}`)
  await c.dispose()
})
