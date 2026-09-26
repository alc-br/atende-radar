import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loginAs } from './helpers'

// Configurações › Auditoria: o registro aparece na tela, com autor e ação, e sem violações de acessibilidade.
test('aba Auditoria lista as ações com quem fez e o quê', async ({ page, context, isMobile }) => {
  const api = await loginAs('admin.a@test.local')
  for (const tourId of ['welcome', 'dashboard', 'settings']) await api.patch('/api/tours', { data: { tourId } })
  await api.patch('/api/settings', { data: { settings: { slaContinuity: '31' } } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()

  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-settings"]').click()
  await page.getByRole('tab', { name: 'Auditoria' }).click()

  const table = page.getByTestId('audit-table')
  await expect(table).toBeVisible({ timeout: 15000 })
  const first = table.locator('tbody tr').first()
  await expect(first).toContainText('admin.a@test.local')
  await expect(first).toContainText('Alterou configurações')
  await expect(first).toContainText('slaContinuity')

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.help}`)
  expect(bad).toEqual([])
})
