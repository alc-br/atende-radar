import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { loginAs, signupOrg, uid } from './helpers'
import { testDb } from './db'

// D1 (docs/crm/09-deploy-e-rollback.md § 3) · O operador liga e desliga o CRM comercial de uma empresa no Admin,
// com confirmação antes de gravar. É o mesmo PATCH /api/admin/organizations/:id/crm, com auditoria.

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
  await expect(dialog.getByTestId('admin-crm')).toBeVisible()
  return dialog
}

const crmFlag = (orgId: string) =>
  testDb.crmFeatureState.findUnique({ where: { organizationId_flag: { organizationId: orgId, flag: 'crm.enabled' } } })

test('operador liga e desliga o CRM comercial de uma empresa, com confirmação; a empresa passa a ver o CRM', async ({ page, context, isMobile }) => {
  const organizationName = `Empresa CRM Admin ${uid()}`
  const { email, password } = await signupOrg({ organizationName })
  const c = await loginAs(email, password)
  const orgId = (await (await c.get('/api/me')).json()).organizationId as string

  await enterAsOperator(context)
  const dialog = await openOrganization(page, organizationName, !!isMobile)
  const section = dialog.getByTestId('admin-crm')
  await expect(section.getByTestId('admin-crm-estado')).toHaveText('Desligado nesta empresa.')

  // nada é gravado antes de confirmar; "Voltar" desiste
  await section.getByRole('button', { name: 'Ligar o CRM comercial' }).click()
  const confirm = section.getByRole('alertdialog')
  await expect(confirm).toContainText(organizationName)
  await expect(confirm).toContainText('Nenhuma mensagem é enviada')
  await confirm.getByRole('button', { name: 'Voltar' }).click()
  expect(await crmFlag(orgId)).toBeNull()

  await section.getByRole('button', { name: 'Ligar o CRM comercial' }).click()
  await section.getByRole('alertdialog').getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText('CRM comercial ligado nesta empresa.')).toBeVisible()
  await expect(section.getByTestId('admin-crm-estado')).toHaveText('Ligado nesta empresa.')
  expect((await crmFlag(orgId))?.enabled).toBe(true)
  expect((await (await c.get('/api/me')).json()).crm.enabled).toBe(true)
  const audit = await testDb.auditLog.findFirst({ where: { organizationId: orgId, action: 'crm.enabled_changed' }, orderBy: { createdAt: 'desc' } })
  expect(audit?.details).toContain('"operator":true')

  // desligar: os dados ficam, o funil não é apagado
  await section.getByRole('button', { name: 'Desligar o CRM comercial' }).click()
  await expect(section.getByRole('alertdialog')).toContainText('Nada é apagado')
  await section.getByRole('alertdialog').getByRole('button', { name: 'Confirmar' }).click()
  await expect(section.getByTestId('admin-crm-estado')).toHaveText('Desligado nesta empresa.')
  expect((await crmFlag(orgId))?.enabled).toBe(false)
  expect((await (await c.get('/api/me')).json()).crm.enabled).toBe(false)
  expect(await testDb.crmPipeline.count({ where: { organizationId: orgId } })).toBeGreaterThan(0)
  await c.dispose()
})
