import { test, expect } from '@playwright/test'
import { uid } from './helpers'
import { audit, crmCompany, enter, openView, settle } from './crm-ui'
import { crmOffAfterFile } from './crm-cleanup'

// CRM-03 · reabrir com justificativa, na tela do negócio: «Reabrir» abre o diálogo com o motivo obrigatório. Vazio, curto
// ou só invisíveis não enviam nada (o erro fica ligado ao campo e a API continua com o negócio ganho); o erro da API
// (versão velha) aparece no diálogo e devolve o foco ao campo; com o motivo, reabre, avisa e o histórico mostra o motivo
// como texto, com as quebras de linha. A API confirma o que ficou gravado.

crmOffAfterFile()

test('negócio ganho: Reabrir pede o motivo; vazio mostra o erro e nada muda; com o motivo reabre e o histórico mostra o motivo', async ({ page, context }, info) => {
  test.setTimeout(150000)
  const c = await crmCompany()
  const title = `Venda reaberta ${uid()}`
  const created = await c.admin.post('/api/crm/deals', { data: { title } })
  expect(created.status(), await created.text()).toBe(201)
  const deal = (await created.json()).deal as { id: string; version: number; stageId: string }
  const won = await c.admin.post(`/api/crm/deals/${deal.id}/close`, { data: { outcome: 'won', version: deal.version, confirmNoAmount: true } })
  expect(won.status(), await won.text()).toBe(200)
  const wonVersion = (await won.json()).deal.version as number
  const pipelines = (await (await c.admin.get('/api/crm/pipelines')).json()).pipelines as Array<{ stages: Array<{ id: string; name: string }> }>
  const stageName = pipelines.flatMap((p) => p.stages).find((s) => s.id === deal.stageId)!.name
  const read = async () => (await (await c.admin.get(`/api/crm/deals/${deal.id}`)).json()) as { deal: { status: string; version: number }; events: Array<{ type: string; actorMemberId: string | null; data: Record<string, unknown> }> }

  await enter(context, c.admin)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  // o negócio ganho sai do quadro: pela lista, filtrando os ganhos
  await page.goto('/')
  await openView(page, 'crm-deals')
  await expect(page.getByRole('heading', { level: 1, name: 'Negócios' })).toBeVisible()
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page.locator('#crm-neg-situacao').selectOption('won')
  await page.getByRole('button', { name: title, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Marcar como ganho' })).toHaveCount(0)

  // abrir: o foco vai para o motivo
  await page.getByRole('button', { name: 'Reabrir', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Reabrir negócio' })
  await expect(dialog).toBeVisible()
  const field = dialog.getByLabel('Motivo da reabertura')
  await expect(field).toBeFocused()
  const submit = dialog.getByRole('button', { name: 'Reabrir negócio' })
  // a prova de que a validação é do cliente: o servidor daria a mesma mensagem, então conta os POSTs de reabrir
  const sent: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes(`/api/crm/deals/${deal.id}/reopen`)) sent.push(r.url())
  })

  // vazio: o erro aparece ligado ao campo, o foco volta para ele e nada é enviado
  await submit.click()
  const required = dialog.getByText('Informe o motivo da reabertura.')
  await expect(required).toBeVisible()
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(field).toHaveAttribute('aria-describedby', /crm-reopen-erro/)
  await expect(field).toBeFocused()
  // curto (só espaços em volta) e só invisíveis: o erro some com um texto válido, volta com o inválido, e o envio
  // devolve o foco ao campo sem chamar a API
  for (const invalid of ['  ok  ', '​​​​']) {
    await field.fill('Texto que vale')
    await expect(required).toBeHidden()
    await expect(field).toHaveAttribute('aria-invalid', 'false')
    await field.fill(invalid)
    await submit.click()
    await expect(required).toBeVisible()
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(field).toBeFocused()
  }
  expect(sent).toHaveLength(0)
  expect((await read()).deal).toMatchObject({ status: 'won', version: wonVersion })
  await settle(page)
  const problems = await audit(page, `${info.project.name}-crm-reabrir-dialogo`, '[role="dialog"]')
  expect(problems, problems.join('\n')).toEqual([])

  if (info.project.name === 'ui-mobile') {
    // celular estreito (320x568) com o motivo no limite: o diálogo cabe na tela e rola, e título e botões ficam ao alcance
    const original = page.viewportSize()!
    await page.setViewportSize({ width: 320, height: 568 })
    await field.fill('Motivo comprido '.repeat(40).slice(0, 500))
    const box = (await dialog.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(568)
    for (const target of [submit, dialog.getByRole('button', { name: 'Cancelar' }), dialog.getByRole('heading', { name: 'Reabrir negócio' })]) {
      await target.scrollIntoViewIfNeeded()
      await expect(target).toBeInViewport()
    }
    await page.setViewportSize(original)
  }

  // outra pessoa altera o negócio enquanto o diálogo está aberto: o erro da API aparece no diálogo, que fica aberto
  const patched = await c.admin.patch(`/api/crm/deals/${deal.id}`, { data: { priority: 'high', version: wonVersion } })
  expect(patched.status(), await patched.text()).toBe(200)
  // duas linhas: a quebra tem de chegar à linha do tempo
  const reason = 'Cliente <b>voltou</b>\ne pediu nova proposta'
  await field.fill(reason)
  await expect(required).toBeHidden()
  await expect(field).toHaveAttribute('aria-invalid', 'false')
  await submit.click()
  const apiError = dialog.getByRole('alert')
  await expect(apiError).toHaveText('Alguém alterou este registro enquanto você editava. A versão atual foi carregada: confira e tente novamente.')
  await expect(dialog).toBeVisible()
  await expect(field).toHaveValue(reason)
  // o foco volta ao campo, que o erro descreve
  await expect(field).toBeFocused()
  await expect(field).toHaveAttribute('aria-describedby', /crm-reopen-erro/)
  expect((await read()).deal).toMatchObject({ status: 'won', version: wonVersion + 1 })
  // a tela recarregou o negócio (a prioridade nova aparece no formulário atrás do diálogo): a próxima tentativa vai com a versão atual
  await expect(page.locator('#crm-ed-prioridade')).toHaveValue('high')
  // editar o motivo apaga o aviso da API, que falava do envio anterior
  await field.fill(`${reason}.`)
  await expect(apiError).toHaveCount(0)
  await field.fill(reason)

  // com a versão recarregada, reabre: aviso, diálogo fecha, os botões de ganho e perda voltam e o foco vai para o título
  await submit.click()
  await expect(page.getByText('Negócio reaberto.')).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Marcar como ganho' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reabrir', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeFocused()
  // o envio com erro (409) e o que deu certo: os únicos POSTs de reabrir
  expect(sent).toHaveLength(2)

  // histórico: o motivo aparece como texto (as marcas de HTML ficam visíveis, nada vira elemento), com o autor
  const history = page.getByRole('region', { name: 'Histórico' })
  const last = history.locator('li').first()
  const lastText = last.locator('.crm-historico__texto')
  await expect(lastText).toHaveText(`Reaberto (estava ganho) na etapa ${stageName}. Motivo: ${reason}.`)
  // a quebra de linha do motivo fica na tela (não vira espaço)
  expect(await lastText.evaluate((el) => (el as HTMLElement).innerText)).toContain('voltou</b>\ne pediu')
  await expect(last).toContainText('por Dona Teste')
  expect(await history.locator('b').count()).toBe(0)

  // gravado: a API diz aberto, e o evento traz o motivo e quem reabriu
  const after = await read()
  expect(after.deal).toMatchObject({ status: 'open', version: wonVersion + 2 })
  expect(after.events[0]).toMatchObject({ type: 'reopened', actorMemberId: c.memberId, data: { from: 'won', reason } })
  expect(errors, errors.join('\n')).toEqual([])
  await c.admin.dispose()
})
