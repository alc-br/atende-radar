import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'
import { newChat, setupCompany } from './gw'
import { testDb } from './db'

// B6 · Alerta agrupado: o mesmo problema que voltou na conversa aparece UMA vez, com "Repetiu N vezes" e a última ocorrência.
test('tela de alertas mostra o contador de repetições do alerta agrupado', async ({ page, context, isMobile }) => {
  const c = await setupCompany()
  await c.send(newChat(), 'Bom dia, preciso de ajuda', { minutes: 30, pushName: 'Cliente Repetido' })
  await c.send(newChat(), 'Olá, tudo bem? Vocês abrem sábado', { minutes: 30, pushName: 'Cliente Uma Vez' })
  await c.tick({ onlyThisCompany: true })
  const repeated = (await c.alerts()).alerts.find((a) => a.customerName === 'Cliente Repetido')!
  // o problema já voltou duas vezes nesta conversa (como o motor faria ao reabrir o mesmo alerta)
  await testDb.alert.update({ where: { id: repeated.id }, data: { occurrences: 3, lastOccurredAt: new Date(Date.now() - 5 * 60000), createdAt: new Date(Date.now() - 3 * 3600000) } })

  const api = await loginAs(c.email, c.password)
  for (const tourId of ['welcome', 'dashboard', 'alerts']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()

  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-alerts"]').click()

  const card = page.locator('article.alerta').filter({ hasText: 'Cliente Repetido' }) // nome aparece mascarado no corpo, inteiro no título
  await expect(card).toHaveCount(1, { timeout: 20000 })
  const info = card.getByTestId('alerta-repeticao')
  await expect(info).toContainText('Repetiu 3 vezes')
  await expect(info).toContainText('Última: 5min atrás')
  await expect(info).toContainText('1ª vez: 3h atrás')
  await expect(card.locator('.alerta__quando')).toContainText('5min atrás') // o horário do cartão é a última ocorrência

  // alerta que aconteceu uma vez só não mostra contador
  const once = page.locator('article.alerta').filter({ hasText: 'Cliente Uma Vez' })
  await expect(once).toHaveCount(1)
  await expect(once.getByTestId('alerta-repeticao')).toHaveCount(0)
  await c.dispose()
})
