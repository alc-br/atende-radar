import { test, expect } from '@playwright/test'
import { loginAs, signupOrg } from './helpers'
import { enter, openView } from './ui'

// Nova regra pela tela: o campo de prazo aparece com o padrão do tipo (minutos ou % do limite de conversas), recusa
// número fora da faixa, some nos tipos sem prazo e o valor gravado aparece na coluna "Prazo".
test('Nova regra: prazo com o padrão do tipo, validação e coluna Prazo', async ({ page, context, isMobile }) => {
  test.skip(!!isMobile, 'a coluna Prazo só aparece em telas largas; o prazo pela API é coberto pelo simulador (limite-regras-plano)')
  const { email, password } = await signupOrg()
  await enter(context, email, password)
  await page.goto('/')
  await openView(page, 'alerts', !!isMobile)
  await page.getByRole('tab', { name: /Regras/ }).click()
  const region = page.getByRole('region', { name: 'Regras de alerta' })
  await expect(region).toBeVisible({ timeout: 15000 })

  await page.locator('main').getByRole('button', { name: 'Nova regra', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Nova regra de alerta' })
  await dialog.getByLabel('Nome').fill('Pergunta sem resposta')
  const type = dialog.getByRole('combobox', { name: 'Selecione o tipo' })
  const prazo = dialog.locator('#nova-regra-prazo')

  // tipo sem prazo (conexão): o campo não aparece
  await type.click()
  await page.getByRole('option', { name: 'Conexão desconectada', exact: true }).click()
  await expect(prazo).toHaveCount(0)

  // % do limite de conversas: padrão 80, faixa 1–100
  await type.click()
  await page.getByRole('option', { name: 'Conversas do mês perto do limite', exact: true }).click()
  await expect(prazo).toHaveValue('80')
  await prazo.fill('150')
  await expect(dialog.getByRole('alert')).toHaveText('Use de 1 a 100.')
  await expect(dialog.getByRole('button', { name: 'Criar regra' })).toBeDisabled()

  // minutos: padrão do tipo (pergunta ignorada = 15) e o valor escolhido é gravado
  await type.click()
  await page.getByRole('option', { name: 'Pergunta ignorada', exact: true }).click()
  await expect(prazo).toHaveValue('15')
  await prazo.fill('25')
  await dialog.getByRole('button', { name: 'Criar regra' }).click()
  await expect(page.getByText('Regra criada.')).toBeVisible()
  const row = region.getByRole('row', { name: /Pergunta sem resposta/ })
  await expect(row.getByTestId('rule-limit')).toHaveText('25 min')

  // a API devolve o prazo gravado
  const api = await loginAs(email, password)
  const rules = (await (await api.get('/api/alert-rules')).json()).rules as Array<{ name: string; type: string; limitMinutes: number }>
  expect(rules.find((r) => r.name === 'Pergunta sem resposta')).toMatchObject({ type: 'ignored_question', limitMinutes: 25 })
  await api.dispose()
})
