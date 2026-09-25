import { test, expect } from '@playwright/test'
import { loginAs, signupOrg } from './helpers'

test('Relatórios: gerar cria uma execução baixável (CSV e HTML), sem botões "não disponível"', async ({ page, context, isMobile }) => {
  const { email, password } = await signupOrg()
  const api = await loginAs(email, password)
  for (const tourId of ['welcome', 'dashboard', 'reports']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()

  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-reports"]').click()
  await expect(page.locator('main').getByRole('heading', { name: /Relat[óo]rios/i }).first()).toBeVisible()

  // exportações de indicadores são links de verdade
  await expect(page.getByRole('link', { name: /Indicadores \(CSV\)/ })).toHaveAttribute('href', /\/api\/reports\/export\?format=csv/)
  await expect(page.getByRole('button', { name: /XLSX|PDF executivo|JSON API/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Gerar agora' }).first().click()
  await expect(page.getByText('Relatório gerado.')).toBeVisible({ timeout: 30000 })

  await page.getByRole('tab', { name: /Hist[óo]rico/ }).click()
  const csv = page.getByRole('link', { name: 'Baixar CSV' }).first()
  await expect(csv).toBeVisible()
  const href = await csv.getAttribute('href')
  expect(href).toMatch(/\/api\/reports\/runs\/.+\/download\?format=csv/)
  const res = await page.request.get(href!)
  expect(res.status()).toBe(200)
  expect(await res.text()).toContain('Empresa')
})
