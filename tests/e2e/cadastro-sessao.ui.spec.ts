import { expect, test } from '@playwright/test'
import { enter } from './ui'

// "Começar teste grátis" no site leva ao app com ?modo=cadastro. Quem já estava logado neste navegador sai da conta
// e vê o cadastro (16/10/2026: antes caía direto no painel da conta logada).
test('?modo=cadastro com sessão aberta sai da conta e abre o cadastro', async ({ context, page }) => {
  await enter(context, 'admin.a@test.local')
  await page.goto('/?modo=cadastro')
  await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible({ timeout: 20000 })
  const session = await (await page.request.get('/api/auth/session')).json()
  expect(session?.user).toBeFalsy()
})

test('cadastro: campos um embaixo do outro, senha pede 8 caracteres e não há botão de demonstração', async ({ page }) => {
  await page.goto('/?modo=cadastro')
  await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('Mínimo de 8 caracteres, com letras e números.')).toBeVisible()
  const boxes = await Promise.all(['#signup-name', '#login-email', '#login-password', '#signup-org'].map((s) => page.locator(s).boundingBox()))
  for (let i = 1; i < boxes.length; i++) {
    expect(Math.abs(boxes[i]!.x - boxes[0]!.x), 'mesma coluna').toBeLessThan(60)
    expect(boxes[i]!.y).toBeGreaterThan(boxes[i - 1]!.y)
  }
  await page.goto('/?modo=entrar')
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible()
  await expect(page.getByText(/demonstração/i)).toHaveCount(0)
})
