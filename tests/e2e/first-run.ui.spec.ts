import { test, expect } from '@playwright/test'
import { loginAs, signupOrg } from './helpers'

// Primeira experiência: quem acabou de criar a conta precisa saber o que fazer, sem tela cheia de zeros.
async function enter(context: import('@playwright/test').BrowserContext, email: string, password: string) {
  const api = await loginAs(email, password)
  for (const tourId of ['welcome', 'dashboard', 'connections', 'members', 'plans']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
}

test.describe('Primeiros passos', () => {
  test('conta nova vê o guia com 3 passos e chega à tela certa com um clique', async ({ page, context, isMobile }) => {
    const { email, password } = await signupOrg()
    await enter(context, email, password)
    await page.goto('/')
    const card = page.getByTestId('setup-checklist')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Primeiros passos')
    await expect(card).toContainText('0 de 3')
    for (const t of ['Conecte o WhatsApp da empresa', 'Convide a sua equipe', 'Receba as primeiras conversas']) await expect(card).toContainText(t)

    await card.getByRole('button', { name: /Conectar WhatsApp/ }).click()
    await expect(page.locator('main').getByRole('heading', { name: /Conex[õo]es/i }).first()).toBeVisible()
    if (isMobile) expect(true).toBe(true)
  })

  test('conta nova vê quantos dias faltam do teste grátis e um caminho para os planos', async ({ page, context }) => {
    const { email, password } = await signupOrg()
    await enter(context, email, password)
    await page.goto('/')
    const banner = page.getByTestId('trial-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText(/1[34] dias/)
    await banner.getByRole('button', { name: /Ver planos/ }).click()
    await expect(page.locator('main').getByRole('heading', { name: /Planos/i }).first()).toBeVisible()
  })

  test('organização com plano ativo não vê o aviso de teste', async ({ page, context }) => {
    await enter(context, 'admin.a@test.local', 'demo123')
    await page.goto('/')
    await expect(page.locator('main').getByRole('heading', { name: /Vis[ãa]o Geral/i }).first()).toBeVisible()
    await expect(page.getByTestId('trial-banner')).toHaveCount(0)
  })

  test('organização com tudo pronto não mostra o guia', async ({ page, context }) => {
    await enter(context, 'admin.a@test.local', 'demo123')
    await page.goto('/')
    await expect(page.locator('main').getByRole('heading', { name: /Vis[ãa]o Geral/i }).first()).toBeVisible()
    await expect(page.getByTestId('setup-checklist')).toHaveCount(0)
  })

  test('quem não administra (atendente) não vê o guia de configuração', async ({ page, context }) => {
    await enter(context, 'atendente.a@test.local', 'demo123')
    await page.goto('/')
    await expect(page.locator('main').getByRole('heading', { name: /Vis[ãa]o Geral/i }).first()).toBeVisible()
    await expect(page.getByTestId('setup-checklist')).toHaveCount(0)
  })
})
