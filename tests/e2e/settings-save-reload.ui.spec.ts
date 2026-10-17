import { test, expect, type Page } from '@playwright/test'
import { loginAs, signupOrg } from './helpers'

// T10 · Cada aba de Configurações que tem formulário: muda um campo, salva, recarrega a página e o valor continua lá.
// Empresa nova (cadastro real) para não mexer na empresa de demonstração.

// shown: o que o campo mostra depois (campos com máscara, ex.: reais digitados em centavos)
const TABS: Array<{ tab: string; field: string; value: string; shown?: string }> = [
  { tab: 'Empresa', field: '#c-exibicao', value: 'Clínica Recarregada' },
  { tab: 'Horários', field: '#h-tol-antes', value: '7' },
  { tab: 'Atendimento', field: '#m-sla', value: '13' },
  { tab: 'Financeiro', field: '#f-teto', value: '432100', shown: '4.321,00' },
  { tab: 'Análise', field: '#a-termos', value: 'clareamento, faceta' },
  { tab: 'Notificações', field: '#n-ini', value: '21:45' },
  { tab: 'Privacidade', field: '#p-dpo', value: 'dpo@recarregada.test' },
]

async function openSettings(page: Page, isMobile: boolean) {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-settings"]').click()
}

test('salva e recarrega: o valor de cada aba continua lá depois de recarregar', async ({ page, context, isMobile }) => {
  test.setTimeout(120_000)
  const { email, password } = await signupOrg()
  const api = await loginAs(email, password)
  for (const tourId of ['welcome', 'dashboard', 'settings']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)

  await openSettings(page, isMobile)
  for (const t of TABS) {
    await page.getByRole('tab', { name: t.tab }).click()
    const panel = page.getByRole('tabpanel', { name: t.tab })
    const field = panel.locator(t.field)
    await expect(field).toBeVisible({ timeout: 15000 })
    await field.fill(t.value)
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/settings') && r.request().method() === 'PATCH')
    await panel.locator('button[type="submit"]').first().click()
    expect((await saved).status()).toBe(200)
  }

  await page.reload()
  await openSettings(page, isMobile)
  for (const t of TABS) {
    await page.getByRole('tab', { name: t.tab }).click()
    await expect(page.getByRole('tabpanel', { name: t.tab }).locator(t.field)).toHaveValue(t.shown ?? t.value, { timeout: 15000 })
  }

  // e no servidor (o que o motor lê)
  const s = await (await api.get('/api/settings')).json()
  expect(s.organization.displayName).toBe('Clínica Recarregada')
  expect(s.settings).toMatchObject({ toleranceBefore: '7', slaFirst: '13', opportunityCeiling: '4321', aiTerms: 'clareamento, faceta', silenceStart: '21:45', privDPO: 'dpo@recarregada.test' })
  await api.dispose()
})

test('Notificações aponta para a tela Relatórios, onde o envio automático é configurado', async ({ page, context, isMobile }) => {
  const { email, password } = await signupOrg()
  const api = await loginAs(email, password)
  for (const tourId of ['welcome', 'dashboard', 'settings', 'reports']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()

  await openSettings(page, isMobile)
  await page.getByRole('tab', { name: 'Notificações' }).click()
  const card = page.getByTestId('settings-reports-link')
  await expect(card).toBeVisible({ timeout: 15000 })
  await expect(card).not.toContainText('ainda não está ativo')
  await card.getByRole('button', { name: /Configurar envios em Relatórios/ }).click()
  await expect(page.locator('main').getByRole('heading', { name: /Relatórios/i }).first()).toBeVisible({ timeout: 15000 })
})
