import { test, expect } from '@playwright/test'
import { loginAs, signupOrg } from './helpers'

// P8 · Central de ajuda: o botão "Ajuda" do menu lateral abre a central, e a busca encontra o artigo certo.

test('botão Ajuda abre a central e a busca encontra o artigo do valor em risco', async ({ page, context, isMobile }) => {
  const { email, password } = await signupOrg()
  const c = await loginAs(email, password)
  for (const tourId of ['welcome', 'dashboard']) await c.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await c.storageState()).cookies)
  await c.dispose()

  await page.goto('/')
  await expect(page.locator('[data-tour="nav-dashboard"]').first()).toBeAttached({ timeout: 15000 })
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.getByTestId('abrir-ajuda').click()

  const main = page.locator('main')
  await expect(main.getByRole('heading', { name: 'Central de ajuda', level: 1 })).toBeVisible()
  // o atalho para o guia da tela de onde a pessoa veio continua lá
  await expect(main.getByRole('button', { name: 'Ver o guia da tela Visão Geral' })).toBeVisible()

  await main.getByRole('searchbox', { name: 'Buscar na ajuda' }).fill('valor em risco')
  const resultado = main.getByRole('button', { name: /Como é calculado o valor em risco/ })
  await expect(resultado).toBeVisible()
  await resultado.click()
  await expect(main.getByRole('heading', { name: 'Como é calculado o valor em risco', level: 2 })).toBeVisible()
})
