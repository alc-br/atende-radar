import { test, expect } from '@playwright/test'
import { uid } from './helpers'

// Tela de entrar: depois de 5 senhas erradas aparece "Muitas tentativas… em 15 minutos" (não "e-mail ou senha
// inválidos"), e o aviso é o mesmo para um e-mail que não tem conta.
// (Sem X-Forwarded-For o servidor de testes não atribui as falhas a um IP, então elas não contam no limite por IP.)
test('5 senhas erradas mostram o aviso de muitas tentativas com o tempo de espera', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible() // a página de vendas carregou
  const entrar = page.locator('header').getByRole('link', { name: 'Entrar', exact: true })
  if (!(await entrar.first().isVisible())) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await entrar.first().click()
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible()

  const toasts = page.locator('[data-sonner-toast][data-type="error"]')
  await page.locator('#login-email').fill(`ninguem.${uid()}@cliente.test`)
  const botao = page.locator('form').getByRole('button', { name: 'Entrar', exact: true })
  for (let i = 0; i < 5; i++) {
    await page.locator('#login-password').fill(`errada-${i}-Zz9`)
    const resposta = page.waitForResponse((r) => r.url().includes('/api/auth/callback/credentials'))
    await botao.click()
    await resposta
    await expect(botao).toBeEnabled() // terminou de tratar a resposta antes da próxima tentativa
    if (i === 0) await expect(toasts.filter({ hasText: 'E-mail ou senha inválidos' })).toBeVisible()
  }
  await expect(toasts.filter({ hasText: 'Muitas tentativas' })).toContainText('Tente novamente em 15 minutos')
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible() // continua na tela de entrar
})
