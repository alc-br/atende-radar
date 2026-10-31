import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { TOURS } from '../../src/lib/tours'
import { createUser, loginAs, STRONG, uid } from './helpers'
import { testDb } from './db'
import { CONSENT_DENIED_STATE } from './consent-state'
import { crmCompany, enter, openView, settle } from './crm-ui'
import { crmOffAfterFile } from './crm-cleanup'

// F9 · teste de interface por requisito, parte de dados, sugestões e ajuda: importar planilha com prévia e erro por
// linha e exportar contatos com telefone mascarado (CRM-11), aceitar e descartar sugestões no Negócios (CRM-06) e a
// Central de ajuda do CRM (CRM-10). O que crm-api.spec.ts já prova só pela API (injeção de fórmula, limite por minuto,
// duplicadas, includeFullPhone sem confirmação) não se repete aqui. Dados inventados.

crmOffAfterFile()

const CABECALHO_PESSOAS = ['ID', 'Nome', 'E-mail', 'Telefone', 'Empresa', 'Etiquetas', 'Responsável', 'Origem', 'Situação', 'Criada em (UTC)', 'Última interação (UTC)']

type Stage = { id: string; name: string; position: number }
type Deal = { id: string; title: string; stageId: string; version: number }
type DealDetail = {
  deal: Deal
  events: { type: string; origin: string; data: Record<string, unknown> }[]
  activities: { title: string; source: string | null; sourceId: string | null }[]
  suggestions: unknown[]
}

async function member(admin: APIRequestContext, role: string) {
  const email = `${role}.${uid()}@cliente.test`
  await createUser(admin, { email, role })
  const api = await loginAs(email, STRONG)
  for (const tourId of ['welcome', ...Object.keys(TOURS)]) await api.patch('/api/tours', { data: { tourId } })
  return api
}

/** Celular sintético de DDD 11 que passa na validação (10 a 15 dígitos; ganha o 55 no servidor). */
function fakePhone() {
  const last4 = String(1000 + Math.floor(Math.random() * 9000))
  return { input: `(11) 90000-${last4}`, last4, full: `+55 (11) 90000-${last4}` }
}

async function stagesOf(api: APIRequestContext): Promise<Stage[]> {
  const r = await api.get('/api/crm/pipelines')
  expect(r.status(), await r.text()).toBe(200)
  const { pipelines } = (await r.json()) as { pipelines: { isDefault: boolean; stages: Stage[] }[] }
  const p = pipelines.find((x) => x.isDefault) ?? pipelines[0]
  return [...p.stages].sort((a, b) => a.position - b.position)
}

async function newDeal(api: APIRequestContext, title: string): Promise<Deal> {
  const r = await api.post('/api/crm/deals', { data: { title } })
  expect(r.status(), await r.text()).toBe(201)
  return (await r.json()).deal as Deal
}

async function dealOf(api: APIRequestContext, id: string): Promise<DealDetail> {
  const r = await api.get(`/api/crm/deals/${id}`)
  expect(r.status(), await r.text()).toBe(200)
  return (await r.json()) as DealDetail
}

/** Sugestão pendente direto no banco, como o motor deixaria (o motor em si é provado em crm-f5.spec.ts). */
function seedSuggestion(orgId: string, dealId: string, kind: 'move_stage' | 'create_task', payload: Record<string, unknown>, reason: string) {
  return testDb.crmSuggestion.create({
    data: { organizationId: orgId, kind, dealId, payloadJson: JSON.stringify(payload), reason, ruleVersion: 'test', dedupeKey: `${orgId}:f9:${uid()}` },
  })
}

/** Central de ajuda pelo botão do menu lateral (em tela estreita, abre a gaveta antes). */
async function openHelp(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) <= 1024) {
    const menu = page.getByRole('button', { name: 'Abrir menu' })
    await expect(menu).toBeVisible({ timeout: 20000 })
    if ((await menu.getAttribute('aria-expanded')) !== 'true') await menu.click({ timeout: 10000 })
  }
  await page.getByTestId('abrir-ajuda').click({ timeout: 10000 })
}

const kpi = (dialog: Locator, rotulo: string) => dialog.locator('.kpi').filter({ hasText: rotulo }).locator('.kpi__valor')

/** CSV exportado: confere BOM e CRLF e devolve as linhas já separadas por ";". */
function csvRows(text: string) {
  expect(text.charCodeAt(0)).toBe(0xfeff)
  expect(text.endsWith('\r\n')).toBe(true)
  return text
    .slice(1)
    .split('\r\n')
    .filter(Boolean)
    .map((l) => l.split(';'))
}

test('CRM-11 · T03.03 · importar planilha: prévia com contagens e o erro na linha da planilha, nada gravado antes de confirmar', async ({ page, context }) => {
  test.setTimeout(150000)
  const c = await crmCompany()
  const tag = uid()
  const fone = fakePhone()
  const empresa = `Ótica Exemplo ${tag}`
  const boa1 = `Bruna Importada ${tag}`
  const ruim = `Caio Telefone Curto ${tag}`
  const boa2 = `Dora Importada ${tag}`
  // BOM, ponto e vírgula, CRLF e uma linha vazia no meio: o erro aparece na linha 4 da planilha (o cabeçalho é a 1)
  const csv =
    '﻿' +
    [
      'Nome;Telefone;E-mail;Empresa;Cidade',
      `${boa1};${fone.input};bruna.${tag}@cliente.test;${empresa};Campinas`,
      '',
      `${ruim};123;caio.${tag}@cliente.test;${empresa};Santos`,
      `${boa2};;dora.${tag}@cliente.test;${empresa};Sorocaba`,
    ].join('\r\n') +
    '\r\n'
  const fileName = `contatos-${tag}.csv`
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await enter(context, c.admin)
  await page.goto('/')
  await openView(page, 'crm-contacts')
  await expect(page.getByRole('heading', { level: 1, name: 'Contatos' })).toBeVisible({ timeout: 20000 })
  await page.locator('[data-tour="crm-contacts-import"]').click({ timeout: 10000 })
  const dialog = page.getByRole('dialog', { name: 'Importar planilha' })
  await expect(dialog).toBeVisible()
  const conferir = dialog.getByRole('button', { name: 'Conferir', exact: true })
  await expect(conferir).toBeDisabled()
  const arquivo = dialog.getByLabel('Planilha em CSV')

  // arquivo que não é CSV: avisa e não deixa conferir
  await arquivo.setInputFiles({ name: `contatos-${tag}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('nao e uma planilha csv') }, { timeout: 10000 })
  await expect(dialog.getByRole('alert')).toHaveText('Escolha um arquivo .csv. No Excel, use "Salvar como" e o tipo CSV; no Google Planilhas, "Fazer download" em CSV.')
  await expect(conferir).toBeDisabled()

  await arquivo.setInputFiles({ name: fileName, mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') }, { timeout: 10000 })
  await expect(dialog).toContainText(`${fileName}: 3 linhas com dados.`, { timeout: 15000 })
  await expect(dialog.getByRole('list', { name: 'Colunas do arquivo' }).getByRole('listitem')).toHaveText(['Nome: Nome', 'Telefone: Telefone', 'E-mail: E-mail', 'Empresa: Empresa', 'Cidade: ignorada'])
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await conferir.click({ timeout: 10000 })

  // prévia: 3 lidas, 2 prontas, 0 repetidas, 1 com erro, e a empresa nova anunciada
  await expect(kpi(dialog, 'Linhas lidas')).toHaveText('3', { timeout: 20000 })
  await expect(kpi(dialog, 'Prontas para importar')).toHaveText('2')
  await expect(kpi(dialog, 'Repetidas')).toHaveText('0')
  await expect(kpi(dialog, 'Com erro')).toHaveText('1')
  await expect(dialog.getByText('1 empresa nova será criada a partir da coluna Empresa.', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Com erro (não entram)' })).toBeVisible()
  await expect(dialog.getByRole('region', { name: 'Linhas com erro' }).getByRole('cell')).toHaveText(['4', 'Telefone inválido (use DDD e número).'])
  await expect(dialog.getByRole('region', { name: 'Linhas repetidas' })).toHaveCount(0)
  const antes = await c.admin.get(`/api/crm/contacts?q=${tag}`)
  expect(antes.status()).toBe(200)
  expect((await antes.json()).total).toBe(0)
  expect(await testDb.crmCompany.count({ where: { organizationId: c.orgId, name: empresa } })).toBe(0)

  await dialog.getByRole('button', { name: 'Importar 2 contatos', exact: true }).click({ timeout: 10000 })
  await expect(page.getByText('2 contatos importados.')).toBeVisible({ timeout: 20000 })
  await expect(dialog.getByText('Importação concluída.', { exact: true })).toBeVisible()
  await expect(dialog.getByText('2 contatos criados, 1 linha com erro ficou de fora.', { exact: true })).toBeVisible()
  // o "Fechar" do rodapé vem antes do X do diálogo (que também se chama "Fechar")
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).first().click({ timeout: 10000 })
  await expect(dialog).toBeHidden()
  await expect(page.getByText(boa1).first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(ruim)).toHaveCount(0)

  // pela API: as 2 boas existem, com origem "import", a empresa criada e o mesmo lote; a ruim não entrou
  const depois = await c.admin.get(`/api/crm/contacts?q=${tag}`)
  expect(depois.status()).toBe(200)
  const lista = (await depois.json()) as { total: number; items: { name: string; email: string | null; phoneLast4: string | null; source: string; companyId: string | null }[] }
  expect(lista.total).toBe(2)
  expect(lista.items.map((p) => p.name).sort()).toEqual([boa1, boa2])
  const empresas = await testDb.crmCompany.findMany({ where: { organizationId: c.orgId, name: empresa } })
  expect(empresas).toHaveLength(1)
  expect(lista.items.find((p) => p.name === boa1)).toMatchObject({ email: `bruna.${tag}@cliente.test`, phoneLast4: fone.last4, source: 'import', companyId: empresas[0].id })
  expect(lista.items.find((p) => p.name === boa2)).toMatchObject({ email: `dora.${tag}@cliente.test`, phoneLast4: null, source: 'import', companyId: empresas[0].id })
  const lote = await testDb.crmPerson.findMany({ where: { organizationId: c.orgId, source: 'import' }, select: { importBatchId: true } })
  expect(lote).toHaveLength(2)
  expect(lote[0].importBatchId).toBeTruthy()
  expect(new Set(lote.map((p) => p.importBatchId)).size).toBe(1)
  expect(await testDb.crmPerson.count({ where: { organizationId: c.orgId, email: `caio.${tag}@cliente.test` } })).toBe(0)

  expect(errors, errors.join('\n')).toEqual([])
  await c.admin.dispose()
})

test('CRM-11 · T03.05 · exportar contatos: desligada avisa e a API recusa; ligada baixa o CSV com telefone mascarado e o completo só com confirmação', async ({ page, context }) => {
  test.setTimeout(180000)
  const c = await crmCompany()
  const tag = uid()
  const fone = fakePhone()
  const nome = `Elisa Exportada ${tag}`
  const email = `elisa.${tag}@cliente.test`
  const cr = await c.admin.post('/api/crm/contacts', { data: { name: nome, email, phone: fone.input } })
  expect(cr.status(), await cr.text()).toBe(201)
  const pessoaId = (await cr.json()).person.id as string
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  // exportação desligada (o padrão): a API recusa com 403 e a tela avisa, sem botão de baixar
  const off = await c.admin.post('/api/crm/exports', { data: { entity: 'people' } })
  expect(off.status()).toBe(403)
  expect((await off.json()).error).toBe('A exportação está desligada nas configurações do CRM.')

  await enter(context, c.admin)
  await page.goto('/')
  await openView(page, 'crm-contacts')
  await expect(page.getByRole('heading', { level: 1, name: 'Contatos' })).toBeVisible({ timeout: 20000 })
  const exportar = page.locator('[data-tour="crm-contacts-export"]')
  await exportar.click({ timeout: 10000 })
  const dialog = page.getByRole('dialog', { name: 'Exportar', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('status')).toContainText('A exportação está desligada nesta empresa.')
  await expect(dialog.getByText('Para baixar planilhas, ligue a exportação em Comercial › Ajustes do CRM.', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Baixar CSV' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Abrir ajustes do CRM' }).click({ timeout: 10000 })
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes do CRM' })).toBeVisible({ timeout: 20000 })

  // liga pela API e recarrega (a tela lê a opção de /api/me)
  const on = await c.admin.patch('/api/crm/settings', { data: { exports: true } })
  expect(on.status(), await on.text()).toBe(200)
  expect((await on.json()).crm.flags.exports).toBe(true)
  await page.goto('/')
  await openView(page, 'crm-contacts')
  await expect(page.getByRole('heading', { level: 1, name: 'Contatos' })).toBeVisible({ timeout: 20000 })
  await exportar.click({ timeout: 10000 })
  await expect(dialog.getByRole('group', { name: 'O que exportar' })).toBeVisible()
  await expect(dialog.locator('#crm-exportar-contatos')).toBeChecked()
  const fullPhone = dialog.getByLabel('Incluir telefone completo')
  await expect(fullPhone).not.toBeChecked()
  await expect(dialog.getByText('Até 20.000 linhas por arquivo.', { exact: true })).toBeVisible()
  const baixar = dialog.getByRole('button', { name: 'Baixar CSV' })
  await expect(baixar).toBeEnabled()

  const [mascarado] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), baixar.click({ timeout: 10000 })])
  await expect(page.getByText('Arquivo baixado.')).toBeVisible({ timeout: 15000 })
  await expect(dialog).toBeHidden()
  expect(mascarado.suggestedFilename()).toMatch(/^atenderadar-crm-pessoas-\d{4}-\d{2}-\d{2}\.csv$/)
  const texto1 = readFileSync(await mascarado.path(), 'utf8')
  const linhas1 = csvRows(texto1)
  expect(linhas1[0]).toEqual(CABECALHO_PESSOAS)
  expect(linhas1).toHaveLength(2)
  const pessoa1 = linhas1.find((l) => l[0] === pessoaId)
  expect(pessoa1?.slice(1, 4)).toEqual([nome, email, `•••• ${fone.last4}`])
  expect(pessoa1?.[7]).toBe('manual')
  expect(pessoa1?.[8]).toBe('Ativa')
  expect(texto1).not.toContain(fone.input)
  expect(texto1).not.toContain(`90000-${fone.last4}`)

  // telefone completo: aviso de dado pessoal e o botão só libera depois de confirmar o risco
  await exportar.click({ timeout: 10000 })
  await expect(dialog).toBeVisible()
  await fullPhone.check({ timeout: 10000 })
  await expect(dialog.getByText('Telefone completo é dado pessoal.', { exact: true })).toBeVisible()
  await expect(baixar).toBeDisabled()
  await dialog.getByLabel('Entendo o risco e quero o telefone completo no arquivo').check({ timeout: 10000 })
  await expect(baixar).toBeEnabled()
  const [completo] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), baixar.click({ timeout: 10000 })])
  await expect(dialog).toBeHidden({ timeout: 15000 })
  const linhas2 = csvRows(readFileSync(await completo.path(), 'utf8'))
  expect(linhas2[0]).toEqual(CABECALHO_PESSOAS)
  // célula que começa com "+" ganha apóstrofo (proteção contra fórmula na planilha)
  expect(linhas2.find((l) => l[0] === pessoaId)?.[3]).toBe(`'${fone.full}`)

  expect(errors, errors.join('\n')).toEqual([])
  await c.admin.dispose()
})

test('CRM-11 · T03.05 · gestor (sem crm.import e crm.export) não vê Importar nem Exportar, e a API recusa com 403', async ({ page, context }) => {
  test.setTimeout(150000)
  const c = await crmCompany()
  const tag = uid()
  // exportação ligada: a recusa vem do papel, não da opção da empresa
  const on = await c.admin.patch('/api/crm/settings', { data: { exports: true } })
  expect(on.status(), await on.text()).toBe(200)
  const gestor = await member(c.admin, 'gestor')

  const imp = await gestor.post('/api/crm/imports', { data: { dryRun: true, rows: [{ name: `Gil Recusado ${tag}`, email: `gil.${tag}@cliente.test` }] } })
  expect(imp.status()).toBe(403)
  expect((await imp.json()).error).toBe('Sem permissão para esta ação')
  const exp = await gestor.post('/api/crm/exports', { data: { entity: 'people' } })
  expect(exp.status()).toBe(403)
  expect((await exp.json()).error).toBe('Sem permissão para esta ação')
  expect(await testDb.crmPerson.count({ where: { organizationId: c.orgId } })).toBe(0)

  await enter(context, gestor)
  await page.goto('/')
  await openView(page, 'crm-contacts')
  await expect(page.getByRole('heading', { level: 1, name: 'Contatos' })).toBeVisible({ timeout: 20000 })
  await expect(page.locator('[data-tour="crm-contacts-new"]')).toBeVisible()
  await settle(page)
  await expect(page.locator('[data-tour="crm-contacts-import"]')).toHaveCount(0)
  await expect(page.locator('[data-tour="crm-contacts-export"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Importar planilha' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Exportar', exact: true })).toHaveCount(0)

  await gestor.dispose()
  await c.admin.dispose()
})

test('CRM-06 · T05.03 · sugestões no Negócios: aceitar aplica o efeito, descartar tira da lista, e a de etapa que mudou à mão não é aplicada', async ({ page, context }) => {
  test.setTimeout(180000)
  const c = await crmCompany()
  const tag = uid()
  const dealA = await newDeal(c.admin, `Reforma da vitrine ${tag}`)
  const dealB = await newDeal(c.admin, `Uniformes da equipe ${tag}`)
  const stages = await stagesOf(c.admin)
  expect(stages.length).toBeGreaterThanOrEqual(3)
  expect(dealA.stageId).toBe(stages[0].id)
  expect(dealB.stageId).toBe(stages[0].id)
  const tarefa = `Ligar para confirmar a proposta ${tag}`
  const moveA = await seedSuggestion(c.orgId, dealA.id, 'move_stage', { stageId: stages[1].id, stageName: stages[1].name, fromStageId: stages[0].id }, `O cliente pediu o orçamento ${tag}.`)
  const taskA = await seedSuggestion(c.orgId, dealA.id, 'create_task', { type: 'follow_up', title: tarefa, priority: 'normal', dueInHours: 48 }, `O cliente decide até sexta ${tag}.`)
  const moveB = await seedSuggestion(c.orgId, dealB.id, 'move_stage', { stageId: stages[2].id, stageName: stages[2].name, fromStageId: stages[0].id }, `O cliente pediu desconto ${tag}.`)
  // alguém move o negócio B à mão depois da sugestão: ela perde o sentido
  const mov = await c.admin.post(`/api/crm/deals/${dealB.id}/stage`, { data: { stageId: stages[1].id, version: dealB.version } })
  expect(mov.status(), await mov.text()).toBe(200)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await enter(context, c.admin)
  await page.goto('/')
  await openView(page, 'crm-deals')
  await expect(page.getByRole('heading', { level: 1, name: 'Negócios' })).toBeVisible({ timeout: 20000 })
  const painel = page.getByRole('region', { name: 'Sugestões', exact: true })
  const item = (reason: string) => painel.locator('li').filter({ hasText: `Por quê: ${reason}` })
  await expect(painel).toBeVisible({ timeout: 20000 })
  await expect(painel).toContainText('Vindas das conversas. Nada muda no CRM sem você aceitar.')
  await expect(painel.getByText('3 pendentes', { exact: true })).toBeVisible()
  await expect(item(moveA.reason).getByText(`Mudar para a etapa “${stages[1].name}”`, { exact: true })).toBeVisible()
  await expect(item(taskA.reason).getByText(`Criar tarefa: ${tarefa}`, { exact: true })).toBeVisible()
  await expect(item(taskA.reason).getByText('Prazo sugerido: em 48 horas', { exact: true })).toBeVisible()
  // só existir a sugestão não muda nada
  expect((await dealOf(c.admin, dealA.id)).deal.stageId).toBe(stages[0].id)

  // B: aceitar a sugestão vencida não move o negócio; ela sai da lista como "expired"
  await item(moveB.reason).getByRole('button', { name: 'Aceitar', exact: true }).click({ timeout: 10000 })
  await expect(page.getByText('Esta sugestão não vale mais: o negócio mudou.')).toBeVisible({ timeout: 15000 })
  await expect(item(moveB.reason)).toHaveCount(0)
  await expect(painel.getByText('2 pendentes', { exact: true })).toBeVisible()
  expect(await testDb.crmSuggestion.findUnique({ where: { id: moveB.id }, select: { status: true, decisionNote: true } })).toEqual({
    status: 'expired',
    decisionNote: 'A etapa do negócio mudou depois da sugestão.',
  })
  expect((await dealOf(c.admin, dealB.id)).deal.stageId).toBe(stages[1].id)

  // A: abre o negócio pelo painel; no detalhe ficam só as sugestões dele, sem "Abrir negócio"
  await item(moveA.reason).getByRole('button', { name: 'Abrir negócio' }).click({ timeout: 10000 })
  await expect(page.getByRole('heading', { level: 1, name: dealA.title })).toBeVisible({ timeout: 20000 })
  await expect(painel.getByText('2 pendentes', { exact: true })).toBeVisible({ timeout: 20000 })
  await expect(painel.getByRole('button', { name: 'Abrir negócio' })).toHaveCount(0)

  await item(moveA.reason).getByRole('button', { name: 'Aceitar', exact: true }).click({ timeout: 10000 })
  await expect(page.getByText('Etapa alterada.')).toBeVisible({ timeout: 15000 })
  await expect(item(moveA.reason)).toHaveCount(0)
  await expect(painel.getByText('1 pendente', { exact: true })).toBeVisible()
  const aceito = await dealOf(c.admin, dealA.id)
  expect(aceito.deal.stageId).toBe(stages[1].id)
  expect(aceito.events.some((e) => e.type === 'suggestion_accepted' && e.origin === 'suggested' && e.data.suggestionId === moveA.id)).toBe(true)
  const historico = page.getByRole('region', { name: 'Histórico' })
  await expect(historico).toContainText('Sugestão aceita: mudar de etapa.', { timeout: 15000 })

  // descartar com motivo: some do painel, nenhuma tarefa é criada e o histórico registra
  await item(taskA.reason).getByRole('button', { name: 'Descartar', exact: true }).click({ timeout: 10000 })
  const descartar = page.getByRole('dialog', { name: 'Descartar sugestão' })
  await expect(descartar).toBeVisible()
  await expect(descartar).toContainText(`Criar tarefa: ${tarefa}. Ela sai da lista e nada muda no CRM.`)
  const motivo = 'O cliente já respondeu por telefone.'
  await descartar.getByLabel('Motivo (opcional)').fill(motivo, { timeout: 10000 })
  const [resposta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/api/crm/suggestions/${taskA.id}/dismiss`) && r.request().method() === 'POST', { timeout: 20000 }),
    descartar.getByRole('button', { name: 'Descartar sugestão', exact: true }).click({ timeout: 10000 }),
  ])
  expect(resposta.status()).toBe(200)
  expect(await resposta.json()).toEqual({ id: taskA.id, status: 'dismissed' })
  await expect(page.getByText('Sugestão descartada.')).toBeVisible({ timeout: 15000 })
  await expect(descartar).toBeHidden()
  await expect(painel).toHaveCount(0, { timeout: 15000 })
  await expect(historico).toContainText('Sugestão dispensada: criar uma tarefa.', { timeout: 15000 })

  expect(await testDb.crmSuggestion.findUnique({ where: { id: taskA.id }, select: { status: true, decisionNote: true, decidedBy: true } })).toEqual({
    status: 'dismissed',
    decisionNote: motivo,
    decidedBy: c.memberId,
  })
  const depois = await dealOf(c.admin, dealA.id)
  expect(depois.suggestions).toEqual([])
  expect(depois.events.some((e) => e.type === 'suggestion_dismissed' && e.data.suggestionId === taskA.id)).toBe(true)
  expect(depois.activities.some((a) => a.title === tarefa || a.sourceId === taskA.id)).toBe(false)
  // decidir de novo pela API não muda nada
  const again = await c.admin.post(`/api/crm/suggestions/${taskA.id}/dismiss`, { data: {} })
  expect(again.status()).toBe(409)
  expect((await again.json()).error).toBe('Esta sugestão não está mais pendente.')
  const twice = await c.admin.post(`/api/crm/suggestions/${moveA.id}/accept`, { data: {} })
  expect(twice.status()).toBe(409)
  expect((await twice.json()).error).toBe('Esta sugestão já foi aceita.')

  expect(errors, errors.join('\n')).toEqual([])
  await c.admin.dispose()
})

test('CRM-06 · T12.04 · analista não vê o painel de Sugestões e a API recusa aceitar e descartar com 403', async ({ page, context }) => {
  test.setTimeout(150000)
  const c = await crmCompany()
  const tag = uid()
  const deal = await newDeal(c.admin, `Cardápio do evento ${tag}`)
  const tarefa = `Enviar o cardápio revisado ${tag}`
  const s = await seedSuggestion(c.orgId, deal.id, 'create_task', { type: 'follow_up', title: tarefa, priority: 'normal', dueInHours: 24 }, `O cliente pediu o cardápio ${tag}.`)
  const analista = await member(c.admin, 'analista')

  const aceitar = await analista.post(`/api/crm/suggestions/${s.id}/accept`, { data: {} })
  expect(aceitar.status()).toBe(403)
  expect((await aceitar.json()).error).toBe('Sem permissão para esta ação')
  const descartar = await analista.post(`/api/crm/suggestions/${s.id}/dismiss`, { data: { note: 'Tentativa sem permissão' } })
  expect(descartar.status()).toBe(403)
  expect((await analista.get('/api/crm/suggestions')).status()).toBe(403)
  expect(await testDb.crmSuggestion.findUnique({ where: { id: s.id }, select: { status: true, decidedBy: true } })).toEqual({ status: 'pending', decidedBy: null })
  expect(await testDb.crmActivity.count({ where: { organizationId: c.orgId, sourceId: s.id } })).toBe(0)

  // a administradora vê a sugestão na Visão comercial...
  const painel = page.getByRole('region', { name: 'Sugestões', exact: true })
  await enter(context, c.admin)
  await page.goto('/')
  await openView(page, 'crm-overview')
  await expect(page.getByRole('heading', { level: 1, name: 'Visão comercial' })).toBeVisible({ timeout: 20000 })
  await expect(painel).toBeVisible({ timeout: 20000 })
  await expect(painel.getByText(`Criar tarefa: ${tarefa}`, { exact: true })).toBeVisible()
  await expect(painel.getByRole('button', { name: 'Aceitar', exact: true })).toBeVisible()

  // ...a analista, na mesma tela, não vê o painel
  await context.clearCookies()
  // clearCookies leva junto a escolha do aviso de cookies (storageState do config): sem ela o aviso volta e cobre botões
  await context.addCookies(CONSENT_DENIED_STATE.cookies)
  await enter(context, analista)
  await page.goto('/')
  await openView(page, 'crm-overview')
  await expect(page.getByRole('heading', { level: 1, name: 'Visão comercial' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('status', { name: 'Carregando indicadores' })).toHaveCount(0, { timeout: 20000 })
  // os indicadores carregaram de fato (não é a tela de erro): o painel, se fosse para aparecer, estaria logo abaixo
  await expect(page.getByRole('heading', { level: 2, name: 'Negócios parados' })).toBeVisible({ timeout: 20000 })
  await settle(page)
  await expect(painel).toHaveCount(0)
  await expect(page.getByText(`Criar tarefa: ${tarefa}`)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Aceitar', exact: true })).toHaveCount(0)

  await analista.dispose()
  await c.admin.dispose()
})

test('CRM-10 · Central de ajuda: a busca acha o artigo do CRM, palavra sem resultado avisa e o guia de Negócios abre na própria tela', async ({ page, context }) => {
  test.setTimeout(120000)
  const c = await crmCompany()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await enter(context, c.admin)
  await page.goto('/')
  await openView(page, 'crm-deals')
  await expect(page.getByRole('heading', { level: 1, name: 'Negócios' })).toBeVisible({ timeout: 20000 })

  await openHelp(page)
  const main = page.locator('main')
  await expect(main.getByRole('heading', { level: 1, name: 'Central de ajuda' })).toBeVisible({ timeout: 20000 })
  const busca = main.getByRole('searchbox', { name: 'Buscar na ajuda' })
  const artigo = main.getByRole('button', { name: /^CRM comercial: negócios, contatos e tarefas/ })

  await busca.fill('negócio', { timeout: 10000 })
  await expect(main.getByText(/^\d+ artigos? encontrados?$/)).toBeVisible()
  await expect(artigo).toBeVisible()
  await artigo.click({ timeout: 10000 })
  const titulo = main.getByRole('heading', { level: 2, name: 'CRM comercial: negócios, contatos e tarefas' })
  await expect(titulo).toBeVisible()
  await expect(titulo).toBeFocused()
  await expect(main.getByRole('heading', { level: 3, name: 'Sugestões: ninguém é movido sozinho' })).toBeVisible()
  await expect(main.getByRole('heading', { level: 3, name: 'Quem vê o quê' })).toBeVisible()
  await expect(main.getByRole('button', { name: 'Voltar para os artigos' })).toBeVisible()

  // digitar de novo fecha o artigo; palavra que não existe avisa e não lista nada
  await busca.fill('zzzz', { timeout: 10000 })
  await expect(titulo).toHaveCount(0)
  await expect(main.getByText('Nenhum artigo com essas palavras.', { exact: true })).toBeVisible()
  await expect(main.getByText('Tente outra palavra ou fale com o suporte logo abaixo.', { exact: true })).toBeVisible()
  await expect(artigo).toHaveCount(0)

  // sem acento e com dois termos, acha o mesmo artigo
  await busca.fill('negocio funil', { timeout: 10000 })
  await expect(artigo).toBeVisible()

  // o guia da tela de origem (Negócios) volta para ela e abre o tour do CRM
  await main.getByRole('button', { name: 'Ver o guia da tela Negócios', exact: true }).click({ timeout: 10000 })
  await expect(page.getByRole('heading', { level: 1, name: 'Negócios' })).toBeVisible({ timeout: 20000 })
  const card = page.getByTestId('tour-card')
  await expect(card).toBeVisible({ timeout: 15000 })
  await expect(card).toHaveAttribute('aria-label', 'Comercial')
  await expect(page.getByTestId('tour-step-count')).toHaveText(/^Passo 1 de \d+$/)
  await page.getByRole('button', { name: 'Fechar o tour' }).click({ timeout: 10000 })
  await expect(card).toHaveCount(0)
  // no celular o 1º passo (item "Comercial" do menu) abriu a gaveta, e ela só fecha num efeito depois do tour sair: espera
  // fechar, senão o openView lê aria-expanded="true", não clica no menu e tenta o item com a gaveta já fora da tela
  if ((page.viewportSize()?.width ?? 1280) <= 1024) {
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute('aria-expanded', 'false', { timeout: 10000 })
  }

  // aberta a partir de Ajustes do CRM (tela sem guia), não oferece "Ver o guia da tela"
  await openView(page, 'crm-settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes do CRM' })).toBeVisible({ timeout: 20000 })
  await openHelp(page)
  await expect(main.getByRole('heading', { level: 1, name: 'Central de ajuda' })).toBeVisible({ timeout: 20000 })
  await expect(main.getByRole('button', { name: 'Tour de boas-vindas' })).toBeVisible()
  await expect(main.getByRole('button', { name: /^Ver o guia da tela/ })).toHaveCount(0)

  expect(errors, errors.join('\n')).toEqual([])
  await c.admin.dispose()
})
