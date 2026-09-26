import { test, expect, type BrowserContext } from '@playwright/test'
import { createUser, loginAs, uid } from './helpers'

// B4 · Dentro das telas, quem não pode agir não vê o botão (antes: gestor via "Adicionar membro" e recebia erro ao clicar).
async function enterAs(context: BrowserContext, role: string) {
  const adm = await loginAs('admin.a@test.local')
  const email = `rbacui.${role}.${uid()}@test.local`
  await createUser(adm, { email, role })
  await adm.dispose()
  const api = await loginAs(email, 'Senha-Forte-2026x')
  for (const tourId of ['welcome', 'dashboard', 'members', 'teams']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
}

async function openView(page: import('@playwright/test').Page, view: string, isMobile: boolean) {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator(`[data-tour="nav-${view}"]`).click()
}

test('gestor vê Membros sem "Adicionar membro" nem menu de ações; em Equipes pode criar (é dele a configuração)', async ({ page, context, isMobile }) => {
  await enterAs(context, 'gestor')
  await openView(page, 'members', !!isMobile)
  await expect(page.locator('main').getByRole('heading', { name: 'Membros' })).toBeVisible()
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Adicionar membro' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mais ações' })).toHaveCount(0)

  await openView(page, 'teams', !!isMobile)
  await expect(page.locator('main').getByRole('heading', { name: 'Equipes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Criar equipe' })).toBeVisible()
})

test('supervisor vê Equipes só para consulta: sem "Criar equipe"', async ({ page, context, isMobile }) => {
  await enterAs(context, 'supervisor')
  await openView(page, 'teams', !!isMobile)
  await expect(page.locator('main').getByRole('heading', { name: 'Equipes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Criar equipe' })).toHaveCount(0)
})

test('administrador vê "Adicionar membro", o menu de ações e "Criar equipe"', async ({ page, context, isMobile }) => {
  await enterAs(context, 'admin')
  await openView(page, 'members', !!isMobile)
  await expect(page.getByRole('button', { name: 'Adicionar membro' })).toBeVisible()
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 })
  expect(await page.getByRole('button', { name: 'Mais ações' }).count()).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Mais ações' }).first().click()
  await page.getByRole('menuitem', { name: 'Definir equipe' }).click()
  await expect(page.getByRole('dialog')).toContainText('Definir equipe de')
  await page.keyboard.press('Escape')

  await openView(page, 'teams', !!isMobile)
  await expect(page.getByRole('button', { name: 'Criar equipe' })).toBeVisible()
})
