import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { loginAs, signupOrg, uid } from './helpers'
import { testDb } from './db'

// B8 · Tela do operador da plataforma (Admin → Organizações): escolhe plano, situação e "válido até" de uma empresa,
// com confirmação antes de gravar. Só quem está em PLATFORM_ADMIN_EMAILS (nos testes, platform@test.local) vê o Admin.

async function enterAsOperator(context: BrowserContext) {
  const api = await loginAs('platform@test.local')
  for (const tourId of ['welcome', 'dashboard', 'admin']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
}

async function openOrganization(page: Page, name: string, isMobile: boolean) {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-admin"]').click()
  await page.getByRole('tab', { name: 'Organizações' }).click()
  await page.getByPlaceholder('Buscar organização...').fill(name)
  await page.getByRole('button', { name, exact: true }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('admin-assinatura')).toBeVisible()
  return dialog
}

async function newCompany() {
  const organizationName = `Empresa Operador ${uid()}`
  const { email, password } = await signupOrg({ organizationName })
  const c = await loginAs(email, password)
  const orgId = (await (await c.get('/api/me')).json()).organizationId as string
  const plans = (await (await c.get('/api/plans')).json()).plans as Array<{ id: string; code: string }>
  return { c, orgId, organizationName, plan: (code: string) => plans.find((p) => p.code === code)! }
}

test('operador troca o plano para Growth, ativa e define a validade, com confirmação', async ({ page, context, isMobile }) => {
  const { c, orgId, organizationName, plan } = await newCompany()
  await enterAsOperator(context)
  const dialog = await openOrganization(page, organizationName, !!isMobile)
  await expect(dialog.getByTestId('admin-assinatura')).toContainText('Em teste')

  const until = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10)
  await dialog.locator('#adm-sub-plano').selectOption(plan('gestao').id)
  await dialog.locator('#adm-sub-status').selectOption('active')
  await dialog.locator('#adm-sub-validade').fill(until)
  await dialog.getByRole('button', { name: 'Salvar assinatura' }).click()

  // nada é gravado antes de confirmar; "Voltar" desiste
  const confirm = dialog.getByRole('alertdialog')
  await expect(confirm).toContainText('Growth')
  await expect(confirm).toContainText('Ativa')
  await confirm.getByRole('button', { name: 'Voltar' }).click()
  expect((await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })).planId).toBe(plan('essencial').id)

  await dialog.getByRole('button', { name: 'Salvar assinatura' }).click()
  await dialog.getByRole('alertdialog').getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText('Assinatura atualizada.')).toBeVisible()
  await expect(dialog.getByTestId('admin-assinatura')).toContainText('Ativa')

  const sub = await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })
  expect(sub.planId).toBe(plan('gestao').id)
  expect(sub.status).toBe('active')
  expect(sub.currentPeriodEnd.toISOString().slice(0, 10)).toBe(new Date(`${until}T23:59:59-03:00`).toISOString().slice(0, 10))
  expect((await (await c.get('/api/subscription')).json()).subscription.plan.code).toBe('gestao')
  await c.dispose()
})

test('rebaixar com uso acima do plano novo: aplica e mostra o aviso do excedente', async ({ page, context, isMobile }) => {
  const { c, orgId, organizationName, plan } = await newCompany()
  const op = await loginAs('platform@test.local')
  await op.patch(`/api/admin/organizations/${orgId}/subscription`, { data: { planId: plan('gestao').id, status: 'active' } })
  await op.dispose()
  for (let i = 1; i <= 4; i++) {
    expect((await c.post('/api/team', { data: { name: `Atendente ${i}`, email: `opui${i}.${uid()}@cliente.test` } })).status()).toBe(201)
  }
  await enterAsOperator(context)
  const dialog = await openOrganization(page, organizationName, !!isMobile)
  await dialog.locator('#adm-sub-plano').selectOption(plan('essencial').id)
  await dialog.getByRole('button', { name: 'Salvar assinatura' }).click()
  await dialog.getByRole('alertdialog').getByRole('button', { name: 'Confirmar' }).click()
  const warning = dialog.getByTestId('admin-assinatura-aviso')
  await expect(warning).toContainText('Plano Essencial aplicado')
  await expect(warning).toContainText('4 atendentes ativos')
  expect((await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })).planId).toBe(plan('essencial').id)
  await c.dispose()
})

// T11 · reta final do teste grátis: a faixa do topo muda de estado (e continua levando aos planos)
test('faixa do teste nos últimos dias: aviso de que o teste termina e "Ver planos" continua lá', async ({ page, context }) => {
  const { c, orgId } = await newCompany()
  const trialEnd = new Date(Date.now() + 1.5 * 86_400_000)
  await testDb.subscription.update({ where: { organizationId: orgId }, data: { status: 'trialing', trialEnd, currentPeriodEnd: trialEnd } })
  for (const tourId of ['welcome', 'dashboard']) await c.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await c.storageState()).cookies)
  await page.goto('/')
  const banner = page.getByTestId('trial-banner')
  await expect(banner).toBeVisible({ timeout: 20_000 })
  await expect(banner).toHaveAttribute('data-state', /ending|last-day/)
  await expect(banner).toContainText('Seu teste grátis termina')
  await banner.getByRole('button', { name: /Ver planos/ }).click()
  await expect(page.locator('main').getByRole('heading', { name: /Planos/i }).first()).toBeVisible()
  await c.dispose()
})

test('quem não é operador da plataforma não vê o Admin', async ({ page, context }) => {
  const { c } = await newCompany()
  await context.addCookies((await c.storageState()).cookies)
  await page.goto('/')
  await expect(page.locator('[data-tour="nav-dashboard"]').first()).toBeAttached({ timeout: 15000 })
  await expect(page.locator('[data-tour="nav-admin"]')).toHaveCount(0)
  await c.dispose()
})
