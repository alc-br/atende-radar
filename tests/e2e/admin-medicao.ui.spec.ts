import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// Admin › Medição na tela: funil por campanha, escolhas no aviso de cookies, os dois CSVs e a lista de internos.
// Só leitura aqui (salvar a lista fica no teste de API, tests/e2e/marketing.spec.ts, para não disputar a mesma chave).

test('operador vê o funil por campanha, o aviso de cookies e baixa o CSV do Google Ads', async ({ page, context, isMobile }) => {
  const api = await loginAs('platform@test.local')
  for (const tourId of ['welcome', 'dashboard', 'admin']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()

  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-admin"]').click()
  await page.getByRole('tab', { name: 'Medição' }).click()
  const panel = page.getByTestId('admin-medicao')
  await expect(panel.getByRole('heading', { name: 'Funil por dia e campanha' })).toBeVisible()
  await expect(panel.getByTestId('admin-medicao-consent')).toContainText('Aceitar todos:')
  await expect(panel.getByRole('heading', { name: 'Quem é interno' })).toBeVisible()

  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByTestId('admin-medicao-csv-gads').click()])
  expect(download.suggestedFilename()).toMatch(/^google-ads-conversoes_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/)
  const [funil] = await Promise.all([page.waitForEvent('download'), panel.getByTestId('admin-medicao-csv-funil').click()])
  expect(funil.suggestedFilename()).toMatch(/^funil_/)
})
