import { test, expect } from '@playwright/test'
import { signupOrg } from './helpers'
import { enter, openView } from './ui'

// Regras de alerta (16/10/2026): nomes legíveis (nunca no_response, in_app...), (?) explicando Tipo, Severidade,
// Cooldown e Canais, e a opção "E-mail" do "Nova regra" numa linha só.
test.describe('regras de alerta: nomes e explicações', () => {
  test.skip(({ isMobile }) => !!isMobile, 'as colunas Tipo, Cooldown e Canais só aparecem em telas largas')

  test('Configurações › Regras mostra nomes, não códigos, e o (?) explica cada coluna', async ({ page, context }) => {
    const { email, password } = await signupOrg()
    await enter(context, email, password)
    await page.goto('/')
    await openView(page, 'settings', false)
    await page.getByRole('tab', { name: 'Regras' }).click()
    const tabela = page.getByRole('region', { name: 'Regras de alerta', exact: true })
    await expect(tabela).toBeVisible({ timeout: 15000 })

    await expect(tabela.getByRole('cell', { name: 'Sem resposta', exact: true }).first()).toBeVisible()
    await expect(tabela.locator('.tag', { hasText: 'No sistema' }).first()).toBeVisible()
    for (const slug of ['no_response', 'pending_quote', 'in_app', 'email']) {
      await expect(tabela.getByText(slug, { exact: true })).toHaveCount(0)
    }

    for (const [coluna, trecho] of [['Tipo', 'situação que a regra vigia'], ['Severidade', 'peso do alerta'], ['Cooldown', 'Tempo de espera']] as const) {
      await tabela.getByRole('button', { name: `O que é ${coluna}?` }).click()
      await expect(page.getByRole('dialog').filter({ hasText: trecho })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog').filter({ hasText: trecho })).toHaveCount(0)
    }
  })

  test('Alertas › Nova regra: (?) nos campos e "E-mail" sem quebrar', async ({ page, context }) => {
    const { email, password } = await signupOrg()
    await enter(context, email, password)
    await page.goto('/')
    await openView(page, 'alerts', false)
    await page.getByRole('tab', { name: /Regras/ }).click()
    const tabela = page.getByRole('region', { name: 'Regras de alerta' })
    await expect(tabela).toBeVisible({ timeout: 15000 })
    await expect(tabela.getByRole('button', { name: 'O que é Cooldown?' })).toBeVisible()

    await page.locator('main').getByRole('button', { name: 'Nova regra', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Nova regra de alerta' })
    for (const campo of ['Tipo', 'Severidade', 'Cooldown', 'Canais']) {
      await expect(dialog.getByRole('button', { name: `O que é ${campo}?` })).toBeVisible()
    }
    await dialog.getByRole('button', { name: 'O que é Cooldown?' }).click()
    await expect(page.getByText(/Tempo de espera, em minutos/)).toBeVisible()
    await page.keyboard.press('Escape')

    // "E-mail" numa linha só (antes quebrava em "E-" / "mail")
    const nome = dialog.locator('.canal-opcao__nome', { hasText: 'E-mail' })
    const box = await nome.boundingBox()
    expect(box!.height).toBeLessThan(26)
    await expect(dialog.getByRole('checkbox', { name: /E-mail/ })).toBeChecked()
  })
})
