import { test, expect } from '@playwright/test'
import { loginAs, signupOrg } from './helpers'
import { enter, openView } from './ui'

// Nova regra › Mais opções pela tela: equipe, dias e horários (com validação), encerrar sozinho e exceções são gravados,
// aparecem resumidos embaixo do nome da regra e voltam preenchidos ao editar.
test('Nova regra: Mais opções grava equipe, dias e horários, encerrar sozinho e exceções', async ({ page, context, isMobile }) => {
  const { email, password } = await signupOrg()
  const api = await loginAs(email, password)
  expect((await api.post('/api/teams', { data: { name: 'Vendas', code: 'VEN' } })).status()).toBe(201)

  await enter(context, email, password)
  await page.goto('/')
  await openView(page, 'alerts', !!isMobile)
  await page.getByRole('tab', { name: /Regras/ }).click()
  const region = page.getByRole('region', { name: 'Regras de alerta' })
  await expect(region).toBeVisible({ timeout: 15000 })
  // a tabela de regras rola dentro do cartão: não alarga a página (no celular isso empurrava o diálogo para fora da tela)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)

  await page.locator('main').getByRole('button', { name: 'Nova regra', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Nova regra de alerta' })
  const box = (await dialog.boundingBox())!
  const vp = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width)
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height)
  await dialog.getByLabel('Nome').fill('Vendas em horário comercial')
  await dialog.getByRole('combobox', { name: 'Selecione o tipo' }).click()
  await page.getByRole('option', { name: 'Pergunta ignorada', exact: true }).click()

  await dialog.getByText('Mais opções').click()
  await dialog.getByRole('checkbox', { name: 'Vendas' }).check()
  await dialog.getByRole('checkbox', { name: 'Só abrir alerta em alguns dias e horários' }).check()
  // padrão: segunda a sexta, 08:00–18:00; início igual ao fim é recusado na hora
  await dialog.locator('#nova-regra-fim').fill('08:00')
  await expect(dialog.getByRole('alert')).toHaveText('O horário de início e o de fim não podem ser iguais.')
  await expect(dialog.getByRole('button', { name: 'Criar regra' })).toBeDisabled()
  await dialog.locator('#nova-regra-fim').fill('18:00')
  await dialog.getByRole('group', { name: 'Dias da semana' }).getByRole('checkbox', { name: 'Sex' }).uncheck()
  await dialog.getByLabel('Encerrar sozinho depois de (minutos)').fill('99999')
  await expect(dialog.getByRole('alert')).toHaveText('Use de 0 a 43.200 minutos (30 dias).')
  await dialog.getByLabel('Encerrar sozinho depois de (minutos)').fill('90')
  await dialog.getByLabel('Exceções (etiquetas da conversa)').fill('Cliente VIP, Atacado, ')
  await dialog.getByRole('button', { name: 'Criar regra' }).click()
  await expect(page.getByText('Regra criada.')).toBeVisible()

  const row = region.getByRole('row', { name: /Vendas em horário comercial/ })
  await expect(row.getByTestId('rule-filters')).toHaveText('Só Vendas · Seg, Ter, Qua, Qui 08:00–18:00 · encerra sozinho em 90 min · exceto Cliente VIP, Atacado')

  type R = { id: string; name: string; scopeTeams: string[]; daysAndHours: unknown; autoCloseMinutes: number | null; exceptions: string[] }
  const saved = async () => ((await (await api.get('/api/alert-rules')).json()).rules as R[]).find((r) => r.name === 'Vendas em horário comercial')!
  const teamId = ((await (await api.get('/api/teams')).json()).teams as Array<{ id: string }>)[0].id
  expect(await saved()).toMatchObject({ scopeTeams: [teamId], daysAndHours: { days: [1, 2, 3, 4], start: '08:00', end: '18:00' }, autoCloseMinutes: 90, exceptions: ['Cliente VIP', 'Atacado'] })

  // editar: a seção abre preenchida; tirar a janela e o prazo deixa a regra valendo sempre
  await row.getByRole('button', { name: /Editar regra/ }).click()
  const edit = page.getByRole('dialog', { name: 'Editar regra de alerta' })
  await expect(edit.getByRole('checkbox', { name: 'Vendas' })).toBeChecked()
  await expect(edit.getByLabel('Encerrar sozinho depois de (minutos)')).toHaveValue('90')
  await expect(edit.getByLabel('Exceções (etiquetas da conversa)')).toHaveValue('Cliente VIP, Atacado')
  await expect(edit.getByRole('group', { name: 'Dias da semana' }).getByRole('checkbox', { name: 'Sex' })).not.toBeChecked()
  await edit.getByRole('checkbox', { name: 'Só abrir alerta em alguns dias e horários' }).uncheck()
  await edit.getByLabel('Encerrar sozinho depois de (minutos)').fill('')
  await edit.getByRole('button', { name: 'Salvar regra' }).click()
  await expect(page.getByText('Regra atualizada.')).toBeVisible()
  await expect(row.getByTestId('rule-filters')).toHaveText('Só Vendas · exceto Cliente VIP, Atacado')
  expect(await saved()).toMatchObject({ daysAndHours: {}, autoCloseMinutes: null, exceptions: ['Cliente VIP', 'Atacado'] })
  await api.dispose()
})
