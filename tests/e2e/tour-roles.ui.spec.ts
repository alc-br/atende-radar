import { test, expect } from '@playwright/test'
import { createUser, loginAs, uid } from './helpers'

// Cada pessoa nova vê o tour DO PAPEL DELA na primeira entrada (e só uma vez).
async function enterAs(context: import('@playwright/test').BrowserContext, role: string) {
  const adm = await loginAs('admin.a@test.local')
  const email = `tour.${role}.${uid()}@test.local`
  await createUser(adm, { email, role })
  await adm.dispose()
  const api = await loginAs(email, 'Senha-Forte-2026x')
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
  return email
}

test.describe('Tour de boas-vindas por papel', () => {
  test('atendente: roteiro dele, só com o que ele usa', async ({ page, context }) => {
    await enterAs(context, 'atendente')
    await page.goto('/')
    const card = page.locator('div.shadow-xl', { hasText: /Passo \d+ de/ })
    await expect(card).toBeVisible({ timeout: 20000 })
    await expect(card).toContainText('Bem-vindo, atendente')
    await expect(card).toContainText(/Passo 1 de 4/)
    // percorre o tour inteiro sem nenhum passo "pulado" por alvo inexistente
    for (let i = 1; i < 4; i++) {
      await card.getByRole('button', { name: 'Próximo' }).click()
      await expect(card).toContainText(new RegExp(`Passo ${i + 1} de 4`))
    }
    await card.getByRole('button', { name: 'Concluir' }).click()
    await expect(page.getByText('Bem-vindo, atendente')).toHaveCount(0)
    await page.reload()
    await page.waitForTimeout(2500)
    await expect(page.getByText('Bem-vindo, atendente')).toHaveCount(0) // o boas-vindas só aparece uma vez
  })

  test('administrador: começa pela conexão do WhatsApp e cita a equipe e o plano', async ({ page, context }) => {
    await enterAs(context, 'admin')
    await page.goto('/')
    const card = page.locator('div.shadow-xl', { hasText: /Passo \d+ de/ })
    await expect(card).toBeVisible({ timeout: 20000 })
    await expect(card).toContainText('Bem-vindo, administrador')
    await expect(card).toContainText('WhatsApp')
  })

  test('leitura (viewer): o roteiro explica que é só leitura', async ({ page, context }) => {
    await enterAs(context, 'viewer')
    await page.goto('/')
    const card = page.locator('div.shadow-xl', { hasText: /Passo \d+ de/ })
    await expect(card).toBeVisible({ timeout: 20000 })
    await expect(card).toContainText(/leitura/i)
  })
})
