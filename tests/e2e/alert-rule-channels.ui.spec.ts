import { test, expect } from '@playwright/test'
import { signupOrg } from './helpers'
import { enter, openView } from './ui'

// Nova regra pela tela: escolher os canais (no sistema, e-mail) e trocar depois em "Editar".
test('Nova regra: escolhe e-mail como canal e a edição troca os canais', async ({ page, context, isMobile }) => {
  test.skip(!!isMobile, 'a coluna Canais só aparece em telas largas; a API é coberta em alert-rule-channels.spec.ts')
  const { email, password } = await signupOrg()
  await enter(context, email, password)
  await page.goto('/')
  await openView(page, 'alerts', !!isMobile)
  await page.getByRole('tab', { name: /Regras/ }).click()
  await expect(page.getByRole('region', { name: 'Regras de alerta' })).toBeVisible({ timeout: 15000 })

  await page.locator('main').getByRole('button', { name: 'Nova regra', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Nova regra de alerta' })
  await dialog.getByLabel('Nome').fill('Regra com e-mail')
  await dialog.getByRole('combobox', { name: 'Selecione o tipo' }).click()
  await page.getByRole('option', { name: 'Sem resposta', exact: true }).click()

  const inApp = dialog.getByRole('checkbox', { name: /No sistema/ })
  const mail = dialog.getByRole('checkbox', { name: /E-mail/ })
  await expect(inApp).toBeChecked()
  await expect(mail).toBeChecked()
  // sem nenhum canal não dá para criar
  await inApp.uncheck()
  await mail.uncheck()
  await expect(dialog.getByRole('alert')).toHaveText('Escolha pelo menos um canal.')
  await expect(dialog.getByRole('button', { name: 'Criar regra' })).toBeDisabled()
  await mail.check()
  await dialog.getByRole('button', { name: 'Criar regra' }).click()
  await expect(page.getByText('Regra criada.')).toBeVisible()

  const row = page.getByRole('region', { name: 'Regras de alerta' }).getByRole('row', { name: /Regra com e-mail/ })
  await expect(row.locator('.tag', { hasText: 'E-mail' })).toBeVisible()
  await expect(row.locator('.tag', { hasText: 'No sistema' })).toHaveCount(0)

  await row.getByRole('button', { name: 'Editar regra Regra com e-mail' }).click()
  const edit = page.getByRole('dialog', { name: 'Editar regra de alerta' })
  await expect(edit.getByLabel('Nome')).toHaveValue('Regra com e-mail')
  await expect(edit.getByRole('checkbox', { name: /E-mail/ })).toBeChecked()
  await edit.getByRole('checkbox', { name: /No sistema/ }).check()
  await edit.getByRole('checkbox', { name: /E-mail/ }).uncheck()
  await edit.getByRole('button', { name: 'Salvar regra' }).click()
  await expect(page.getByText('Regra atualizada.')).toBeVisible()
  await expect(row.locator('.tag', { hasText: 'No sistema' })).toBeVisible()
  await expect(row.locator('.tag', { hasText: 'E-mail' })).toHaveCount(0)
})
