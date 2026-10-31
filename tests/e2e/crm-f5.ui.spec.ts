import { test, expect, type Page } from '@playwright/test'
import { uid } from './helpers'
import { testDb } from './db'
import { audit, crmCompany, enter, openView, settle } from './crm-ui'
import { crmOffAfterFile } from './crm-cleanup'

// F5 · o CRM no dia a dia das telas de auditoria (CRM-04, CRM-05, CRM-07): "Tarefa no CRM" no alerta e "Criar tarefa no
// CRM" no item de recuperação (uma tarefa aberta por causa: pedir de novo avisa e não duplica), o bloco "Negócios
// relacionados" no detalhe da conversa e nada disso aparece com o CRM desligado. Nada envia mensagem (D3).

crmOffAfterFile()

/** Conversa com contato e atendente direto no banco, um alerta e um item de recuperação ligados a ela. */
async function scenario(orgId: string) {
  const tag = uid()
  const agent = await testDb.agent.create({ data: { organizationId: orgId, name: `Atendente ${tag}`, email: `ag.${tag}@cliente.test` } })
  const contact = await testDb.contact.create({ data: { organizationId: orgId, displayName: `Cliente ${tag}` } })
  const conv = await testDb.conversation.create({ data: { organizationId: orgId, agentId: agent.id, contactId: contact.id } })
  const alert = await testDb.alert.create({ data: { organizationId: orgId, conversationId: conv.id, title: `Cliente esperando resposta ${tag}`, severity: 'high', customerName: contact.displayName } })
  const item = await testDb.recoveryItem.create({
    data: { organizationId: orgId, conversationId: conv.id, agentId: agent.id, reason: 'Orçamento sem retorno', customerName: `Cliente Recuperação ${tag}` },
  })
  return { tag, agent, contact, conv, alert, item }
}

const alertCard = (page: Page, title: string) => page.locator('article.alerta').filter({ hasText: title })

test('alerta e recuperação viram tarefa do CRM sem duplicar; a conversa mostra os negócios relacionados', async ({ page, context }, info) => {
  test.setTimeout(240000)
  const c = await crmCompany()
  const s = await scenario(c.orgId)
  // um negócio ligado à conversa por uma tarefa de outro alerta dela (o mesmo caminho da API)
  const other = await testDb.alert.create({ data: { organizationId: c.orgId, conversationId: s.conv.id, title: `Orçamento parado ${s.tag}`, severity: 'medium' } })
  const dr = await c.admin.post('/api/crm/deals', { data: { title: `Negócio da conversa ${s.tag}`, ownerMemberId: c.memberId } })
  expect(dr.status(), await dr.text()).toBe(201)
  const deal = (await dr.json()).deal as { id: string; title: string }
  const linked = await c.admin.post('/api/crm/activities', { data: { type: 'follow_up', title: 'Retornar ao cliente', alertId: other.id, dealId: deal.id } })
  expect(linked.status(), await linked.text()).toBe(201)

  await enter(context, c.admin)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const problems: string[] = []

  // alerta → "Tarefa no CRM": o diálogo já vem com um título; criar
  await page.goto('/')
  await openView(page, 'alerts')
  const card = alertCard(page, s.alert.title)
  await expect(card).toBeVisible({ timeout: 20000 })
  await card.getByRole('button', { name: 'Tarefa no CRM' }).click()
  const dialog = page.getByTestId('crm-task-dialog')
  await expect(dialog.getByRole('heading', { name: 'Criar tarefa no CRM' })).toBeVisible()
  await expect(dialog).toContainText('Uma tarefa aberta por alerta.')
  await expect(dialog.locator('#crm-nova-tarefa-titulo')).toHaveValue(`Tratar alerta: ${s.alert.title}`)
  await expect(dialog.locator('#crm-nova-tarefa-tipo-dica')).toContainText('o AtendeRadar não envia nada ao cliente')
  await settle(page)
  for (const p of await audit(page, `${info.project.name}-crm-tarefa-dialogo`, '[role="dialog"]')) problems.push(`[diálogo de tarefa] ${p}`)
  await page.screenshot({ path: `test-results/screens/crm-f5-${info.project.name}-tarefa-dialogo.png` })
  await dialog.locator('#crm-nova-tarefa-titulo').fill('')
  await dialog.getByRole('button', { name: 'Criar tarefa' }).click()
  await expect(dialog.getByText('Informe o título.')).toBeVisible()
  await dialog.locator('#crm-nova-tarefa-titulo').fill('Responder o cliente que está esperando')
  await dialog.getByRole('button', { name: 'Criar tarefa' }).click()
  await expect(page.getByText('Tarefa criada no CRM.')).toBeVisible()
  await expect(dialog).toBeHidden()
  const fromAlert = await testDb.crmActivity.findMany({ where: { organizationId: c.orgId, source: 'alert', sourceId: s.alert.id } })
  expect(fromAlert).toHaveLength(1)
  expect(fromAlert[0]).toMatchObject({ title: 'Responder o cliente que está esperando', status: 'open' })

  // de novo no mesmo alerta: avisa que já existe e não cria outra
  await card.getByRole('button', { name: 'Tarefa no CRM' }).click()
  await dialog.getByRole('button', { name: 'Criar tarefa' }).click()
  await expect(page.getByText('Já existe uma tarefa aberta para isto: “Responder o cliente que está esperando”. Nada foi duplicado.')).toBeVisible()
  expect(await testDb.crmActivity.count({ where: { organizationId: c.orgId, source: 'alert', sourceId: s.alert.id } })).toBe(1)

  // recuperação → menu do item → "Criar tarefa no CRM"
  await openView(page, 'recovery')
  await page.getByRole('button', { name: `Ações para ${s.item.customerName}` }).click()
  await page.getByRole('menuitem', { name: 'Criar tarefa no CRM' }).click()
  await expect(dialog).toContainText('Uma tarefa aberta por item.')
  await expect(dialog.locator('#crm-nova-tarefa-titulo')).toHaveValue('Recuperação: Orçamento sem retorno')
  await dialog.locator('#crm-nova-tarefa-tipo').selectOption('call')
  await dialog.getByRole('button', { name: 'Criar tarefa' }).click()
  // o aviso "Tarefa criada no CRM." do alerta ainda pode estar na tela: espera o diálogo fechar e a gravação
  await expect(dialog).toBeHidden({ timeout: 15000 })
  const fromItem = await testDb.crmActivity.findMany({ where: { organizationId: c.orgId, source: 'recovery', sourceId: s.item.id } })
  expect(fromItem).toHaveLength(1)
  expect(fromItem[0].type).toBe('call')

  // a conversa mostra o negócio ligado, com a próxima tarefa; dá para criar tarefa e abrir o negócio dali
  await openView(page, 'alerts')
  await alertCard(page, s.alert.title).getByRole('button', { name: 'Abrir conversa' }).click()
  const related = page.getByTestId('crm-related-deals')
  await expect(related).toBeVisible({ timeout: 20000 })
  await expect(related.getByRole('heading', { name: 'Negócios relacionados' })).toBeVisible()
  await expect(related).toContainText(deal.title)
  await expect(related).toContainText('Próxima tarefa: Retornar ao cliente')
  await related.scrollIntoViewIfNeeded()
  await settle(page)
  for (const p of await audit(page, `${info.project.name}-crm-negocios-relacionados`, '[data-testid="crm-related-deals"]')) problems.push(`[negócios relacionados] ${p}`)
  await related.screenshot({ path: `test-results/screens/crm-f5-${info.project.name}-negocios-relacionados.png` })

  await related.getByRole('button', { name: `Criar tarefa para ${deal.title}` }).click()
  await expect(dialog).toContainText('A tarefa fica ligada a este negócio.')
  await dialog.locator('#crm-nova-tarefa-titulo').fill('Enviar a proposta revisada')
  await dialog.getByRole('button', { name: 'Criar tarefa' }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
  expect(await testDb.crmActivity.count({ where: { organizationId: c.orgId, dealId: deal.id, title: 'Enviar a proposta revisada' } })).toBe(1)

  await related.getByRole('button', { name: `Abrir no CRM: ${deal.title}` }).click()
  await expect(page.getByRole('heading', { level: 1, name: deal.title })).toBeVisible()

  expect(problems, problems.join('\n')).toEqual([])
  expect(errors, errors.join('\n')).toEqual([])
  await c.admin.dispose()
})

test('com o CRM desligado, alerta, recuperação e conversa não mostram nada do CRM', async ({ page, context }) => {
  test.setTimeout(120000)
  const c = await crmCompany({ crm: false })
  const s = await scenario(c.orgId)
  await enter(context, c.admin)

  await page.goto('/')
  await openView(page, 'alerts')
  const card = alertCard(page, s.alert.title)
  await expect(card).toBeVisible({ timeout: 20000 })
  // o menu já carregou o papel (/api/me): os itens comuns estão lá e o grupo Comercial não
  await expect(page.locator('[data-tour="nav-alerts"]')).toBeAttached()
  await expect(page.locator('[data-tour="nav-crm"]')).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Abrir conversa' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Tarefa no CRM' })).toHaveCount(0)

  await openView(page, 'recovery')
  await page.getByRole('button', { name: `Ações para ${s.item.customerName}` }).click()
  await expect(page.getByRole('menuitem', { name: 'Copiar contexto' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Criar tarefa no CRM' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await openView(page, 'alerts')
  await alertCard(page, s.alert.title).getByRole('button', { name: 'Abrir conversa' }).click()
  await expect(page.getByRole('heading', { name: 'Classificação' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('crm-related-deals')).toHaveCount(0)

  // link direto (#crm-deals, o mesmo dos e-mails) com o CRM desligado: abre a Visão geral, sem a tela de Negócios
  await page.goto('about:blank')
  await page.goto('/#crm-deals')
  await page.waitForFunction(() => window.location.hash === '', undefined, { timeout: 20000 })
  await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('heading', { level: 1, name: 'Negócios' })).toHaveCount(0)
  await expect(page.locator('[data-tour="nav-crm"]')).toHaveCount(0)
  expect((await c.admin.get('/api/crm/deals')).status()).toBe(404)
  expect(await testDb.crmActivity.count({ where: { organizationId: c.orgId } })).toBe(0)
  await c.admin.dispose()
})
