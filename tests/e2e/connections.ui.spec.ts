import { test, expect, type Page } from '@playwright/test'
import { loginAs, signupOrg, uid } from './helpers'
import { enter, openView } from './ui'

// Conexões: o erro da criação aparece no diálogo (402 do limite do plano leva a Planos) e a conexão pausada aparece como "Pausada".
const main = (page: Page) => page.locator('main')
const card = (page: Page, name: string) =>
  page.locator('div.conexao', { has: page.getByRole('heading', { name, exact: true }) })

async function fillNewConnection(page: Page, name: string, phone: string) {
  await main(page).getByRole('button', { name: 'Nova conexão', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Nova conexão WhatsApp' })
  await dialog.getByLabel('Nome da conexão').fill(name)
  await dialog.getByLabel('Número do WhatsApp').fill(phone)
  await dialog.getByRole('switch').click()
  await dialog.getByRole('button', { name: 'Criar conexão' }).click()
  return dialog
}

test('acima do limite do plano, "Nova conexão" mostra o erro e o caminho para Planos', async ({ page, context, isMobile }) => {
  // teste grátis = plano mais barato, com 1 conexão
  const { email, password } = await signupOrg()
  const api = await loginAs(email, password)
  expect((await api.post('/api/connections', { data: { name: `Primeira ${uid()}`, phoneNumber: '5511900001111' } })).status()).toBe(201)
  await api.dispose()

  await enter(context, email, password)
  await page.goto('/')
  await openView(page, 'connections', !!isMobile)
  const dialog = await fillNewConnection(page, `Segunda ${uid()}`, '5511900002222')

  const erro = dialog.getByTestId('nova-conexao-erro')
  await expect(erro).toBeVisible()
  await expect(erro).toContainText('permite até 1')
  await expect(erro).toContainText('Troque de plano')
  await expect(dialog).toBeVisible() // fica aberto para tentar de novo
  await erro.getByRole('button', { name: 'Ver planos' }).click()
  await expect(main(page).getByRole('heading', { level: 1, name: /^Planos e faturamento$/i })).toBeVisible({ timeout: 15000 })
})

test('falha do servidor na criação aparece no diálogo (não some em silêncio)', async ({ page, context, isMobile }) => {
  await enter(context, 'admin.a@test.local')
  await page.route('**/api/connections', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Não foi possível criar a conexão. Tente novamente.' }) })
      : route.continue()
  )
  await page.goto('/')
  await openView(page, 'connections', !!isMobile)
  const dialog = await fillNewConnection(page, `Falha ${uid()}`, '5511900003333')
  await expect(dialog.getByTestId('nova-conexao-erro')).toContainText('Não foi possível criar a conexão')
  await expect(dialog.getByRole('button', { name: 'Ver planos' })).toHaveCount(0)
})

test('conexão pausada aparece como "Pausada" (não "Erro") e continua assim depois de recarregar', async ({ page, context, isMobile }) => {
  const { email, password } = await signupOrg()
  const api = await loginAs(email, password)
  const name = `Pausa ${uid()}`
  const created = await api.post('/api/connections', { data: { name, phoneNumber: '5511900004444' } })
  expect(created.status()).toBe(201)
  // compila a rota do PATCH antes da tela: no servidor de dev o 1º POST/PATCH a uma rota nova pode perder o corpo
  const { connection } = await created.json()
  expect((await api.patch(`/api/connections/${connection.id}`, { data: { name } })).status()).toBe(200)
  await api.dispose()

  await enter(context, email, password)
  await page.goto('/')
  await openView(page, 'connections', !!isMobile)
  const c = card(page, name)
  await expect(c).toContainText('QR necessário', { timeout: 15000 })
  await c.getByRole('button', { name: 'Pausar' }).click()
  await expect(c.locator('.tag', { hasText: 'Pausada' })).toBeVisible()
  await expect(c.locator('.tag', { hasText: /^Erro$/ })).toHaveCount(0)

  await page.reload()
  await openView(page, 'connections', !!isMobile)
  await expect(c.locator('.tag', { hasText: 'Pausada' })).toBeVisible({ timeout: 15000 })
  await expect(c.getByRole('button', { name: 'Retomar' })).toBeVisible()
})
