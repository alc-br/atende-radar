import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'
import { testDb } from './db'

// S1 · Aba "Simulação" do Admin: o operador roda um cenário, vê as verificações verdes, abre a empresa mantida
// (retrato só leitura), injeta uma mensagem e limpa. O servidor de teste sobe com SIMULATION_ENABLED=on.

test('operador roda um cenário pela aba Simulação, abre a empresa mantida e limpa', async ({ page, context, isMobile }) => {
  test.setTimeout(120_000)
  const api = await loginAs('platform@test.local')
  for (const tourId of ['welcome', 'dashboard', 'admin']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()

  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-admin"]').click()
  await page.getByRole('tab', { name: 'Simulação' }).click()
  const panel = page.getByTestId('admin-simulation')
  const catalog = panel.getByRole('region', { name: 'Cenários', exact: true })
  await expect(catalog.getByText('cpf-mascarado')).toBeVisible()

  await panel.getByLabel('Manter a empresa (24 h)').check()
  await catalog.getByRole('row').filter({ hasText: 'cpf-mascarado' }).getByRole('button', { name: 'Rodar' }).click()
  const results = page.getByTestId('simulation-results')
  await expect(results.getByText('Verde').first()).toBeVisible({ timeout: 60_000 })
  await expect(results.getByText('✗')).toHaveCount(0)

  const [snapRes] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/admin/simulation/orgs/')),
    results.getByRole('button', { name: 'Ver empresa' }).click(),
  ])
  expect(snapRes.status(), (await snapRes.text()).slice(0, 300)).toBe(200)
  const snap = page.getByTestId('simulation-snapshot')
  await expect(snap).toContainText('Retrato só leitura')
  const rows = snap.getByRole('region', { name: 'Conversas simuladas' }).getByRole('row')
  await expect(rows.nth(1)).toBeVisible()
  const before = await rows.count()
  await snap.getByLabel('Mensagem', { exact: true }).fill('Oi, ainda tem horário amanhã?')
  await snap.getByLabel('Conversa', { exact: true }).fill('ui-nova')
  await snap.getByRole('button', { name: 'Injetar' }).click()
  await expect(rows).toHaveCount(before + 1)

  await panel.getByRole('button', { name: 'Limpar simuladas' }).click()
  await expect(snap).toBeHidden()
  await expect.poll(() => testDb.organization.count({ where: { isSimulation: true } })).toBe(0)
})

test('cliente comum não vê a aba (nem o Admin)', async ({ page, context }) => {
  const api = await loginAs('admin.a@test.local')
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
  const res = await page.request.get('/api/admin/simulation/scenarios')
  expect(res.status()).toBe(403)
  await page.goto('/')
  await expect(page.getByRole('tab', { name: 'Simulação' })).toHaveCount(0)
})
