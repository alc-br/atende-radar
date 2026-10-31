import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { TOURS } from '../../src/lib/tours'
import { createUser, loginAs, STRONG, uid } from './helpers'
import { testDb } from './db'
import { crmCompany, enter, openView } from './crm-ui'
import { crmOffAfterFile } from './crm-cleanup'

// F9 · teste de interface por requisito (§ 13.1 da especificação) para os Ajustes do CRM (CRM-02, CRM-09) e a Visão
// comercial (CRM-08, CRM-12): cada teste faz o caminho pela tela, confere o efeito na API e traz um negativo (dado
// inválido sem gravar nada, ou 403 para o papel sem permissão). O menu por papel já está em crm-telas (T12.04); aqui a
// autorização é conferida na API. Dados inventados.

crmOffAfterFile()

/** Membro convidado e com senha, já logado na API, com os guias marcados como vistos (como em crmCompany). */
async function member(admin: APIRequestContext, role: string) {
  const email = `${role}.${uid()}@cliente.test`
  await createUser(admin, { email, role })
  const api = await loginAs(email, STRONG)
  for (const tourId of ['welcome', ...Object.keys(TOURS)]) await api.patch('/api/tours', { data: { tourId } })
  return api
}

type Flags = { autoCreateDeals: boolean; suggestStage: boolean; notifications: boolean; exports: boolean }
type Pipeline = { id: string; name: string; isDefault: boolean; version: number; stages: Array<{ id: string; name: string; position: number; status: string }> }

async function flagsOf(api: APIRequestContext): Promise<Flags> {
  const r = await api.get('/api/crm/settings')
  expect(r.status(), await r.text()).toBe(200)
  return (await r.json()).crm.flags
}

async function pipelinesOf(api: APIRequestContext): Promise<Pipeline[]> {
  const r = await api.get('/api/crm/pipelines')
  expect(r.status(), await r.text()).toBe(200)
  return (await r.json()).pipelines
}

const stageNamesOf = async (api: APIRequestContext) => (await pipelinesOf(api)).find((p) => p.isDefault)!.stages.map((s) => s.name)

const FUNIL_PADRAO = ['Novo interesse', 'Qualificação', 'Proposta/orçamento', 'Negociação', 'Aguardando cliente']

/** Nomes das etapas na ordem em que o editor do funil mostra. */
const stagesOnScreen = (funil: Locator) =>
  funil
    .getByRole('list', { name: 'Etapas, na ordem do quadro', exact: true })
    .getByRole('textbox')
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))

/** Cartão de indicador da Visão comercial pelo rótulo. */
const kpi = (page: Page, rotulo: string) => page.locator('div.cartao.kpi').filter({ has: page.getByText(rotulo, { exact: true }) })

async function openSettings(page: Page) {
  await openView(page, 'crm-settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes do CRM', exact: true })).toBeVisible({ timeout: 20000 })
}

async function openOverview(page: Page) {
  await openView(page, 'crm-overview')
  await expect(page.getByRole('heading', { level: 1, name: 'Visão comercial', exact: true })).toBeVisible({ timeout: 20000 })
}

test('CRM-09 · liga e desliga uma opção da Automação pela tela; com falha no servidor o interruptor volta e nada é gravado', async ({ page, context }) => {
  test.setTimeout(150000)
  const c = await crmCompany()
  expect(await flagsOf(c.admin)).toMatchObject({ autoCreateDeals: false, suggestStage: false, exports: false })
  await enter(context, c.admin)
  await page.goto('/')
  await openSettings(page)

  const opcao = page.getByRole('checkbox', { name: 'Sugerir mudança de etapa', exact: true })
  await expect(opcao).not.toBeChecked({ timeout: 20000 })
  await opcao.click({ timeout: 10000 })
  await expect(page.getByText('Opção ligada: Sugerir mudança de etapa.', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(opcao).toBeChecked()
  await expect.poll(async () => (await flagsOf(c.admin)).suggestStage, { timeout: 10000 }).toBe(true)
  // as outras opções não mudam junto
  expect(await flagsOf(c.admin)).toMatchObject({ autoCreateDeals: false, exports: false })

  // continua ligada depois de recarregar
  await page.reload()
  await openSettings(page)
  await expect(opcao).toBeChecked({ timeout: 20000 })

  await opcao.click({ timeout: 10000 })
  await expect(page.getByText('Opção desligada: Sugerir mudança de etapa.', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(opcao).not.toBeChecked()
  await expect.poll(async () => (await flagsOf(c.admin)).suggestStage, { timeout: 10000 }).toBe(false)

  // negativo: o servidor recusa a gravação; o interruptor volta, a mensagem aparece e a opção segue desligada na API
  const recusados: unknown[] = []
  await page.route('**/api/crm/settings', (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    recusados.push(route.request().postDataJSON())
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'falha simulada', code: 'crm_unavailable' }) })
  })
  const exportar = page.getByRole('checkbox', { name: 'Exportar dados do CRM', exact: true })
  await exportar.click({ timeout: 10000 })
  await expect(page.getByText('Não foi possível concluir a ação. Tente novamente.', { exact: true })).toBeVisible({ timeout: 15000 })
  // a tela mandou só a opção clicada, e o erro veio da recusa simulada (não de um clique perdido)
  expect(recusados).toEqual([{ exports: true }])
  await expect(exportar).not.toBeChecked()
  await expect(exportar).toBeEnabled()
  await expect(page.getByText('Opção ligada: Exportar dados do CRM.', { exact: true })).toHaveCount(0)
  await page.unroute('**/api/crm/settings')
  expect(await flagsOf(c.admin)).toMatchObject({ autoCreateDeals: false, suggestStage: false, exports: false })
  await c.admin.dispose()
})

test('CRM-02 · T04.01 · cria um funil pelo diálogo; sem nome ou sem etapa com nome mostra o erro e não envia nada', async ({ page, context }) => {
  test.setTimeout(150000)
  const c = await crmCompany()
  expect(await pipelinesOf(c.admin)).toHaveLength(1)
  await enter(context, c.admin)
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/crm/pipelines') posts.push(r.url())
  })
  await page.goto('/')
  await openSettings(page)
  await expect(page.getByRole('article', { name: 'Funil comercial', exact: true })).toBeVisible({ timeout: 20000 })

  await page.getByRole('button', { name: 'Novo funil', exact: true }).click({ timeout: 10000 })
  const dialog = page.getByRole('dialog', { name: 'Novo funil', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Nome da etapa 1', { exact: true })).toHaveValue('Primeiro contato')
  await expect(dialog.getByLabel('Nome da etapa 2', { exact: true })).toHaveValue('Proposta enviada')
  await expect(dialog.getByLabel('Nome da etapa 3', { exact: true })).toHaveValue('Negociação')

  // negativo 1: sem nome
  await dialog.getByRole('button', { name: 'Criar funil', exact: true }).click({ timeout: 10000 })
  await expect(dialog.getByRole('alert')).toHaveText('Dê um nome para o funil.')

  // negativo 2: com nome, mas todas as etapas em branco
  const nome = `Funil de revenda ${uid()}`
  await dialog.getByLabel('Nome do funil', { exact: true }).fill(nome)
  for (const n of [1, 2, 3]) await dialog.getByLabel(`Nome da etapa ${n}`, { exact: true }).fill('')
  await dialog.getByRole('button', { name: 'Criar funil', exact: true }).click({ timeout: 10000 })
  await expect(dialog.getByRole('alert')).toHaveText('O funil precisa de pelo menos uma etapa com nome.')
  expect(posts).toHaveLength(0)
  expect(await pipelinesOf(c.admin)).toHaveLength(1)

  // positivo: etapas preenchidas e uma a mais
  await dialog.getByLabel('Nome da etapa 1', { exact: true }).fill('Primeiro contato')
  await dialog.getByLabel('Nome da etapa 2', { exact: true }).fill('Proposta enviada')
  await dialog.getByLabel('Nome da etapa 3', { exact: true }).fill('Negociação')
  await dialog.getByRole('button', { name: 'Adicionar etapa', exact: true }).click({ timeout: 10000 })
  await dialog.getByLabel('Nome da etapa 4', { exact: true }).fill('Pós-venda')
  await dialog.getByRole('button', { name: 'Criar funil', exact: true }).click({ timeout: 10000 })
  await expect(page.getByText(`Funil "${nome}" criado.`, { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(dialog).toBeHidden({ timeout: 10000 })
  expect(posts).toHaveLength(1)

  const novo = page.getByRole('article', { name: nome, exact: true })
  await expect(novo).toBeVisible({ timeout: 15000 })
  await expect(novo.getByText('Padrão', { exact: true })).toHaveCount(0)
  await expect.poll(() => stagesOnScreen(novo), { timeout: 10000 }).toEqual(['Primeiro contato', 'Proposta enviada', 'Negociação', 'Pós-venda'])

  const all = await pipelinesOf(c.admin)
  expect(all).toHaveLength(2)
  const criado = all.find((p) => p.name === nome)
  expect(criado, 'funil criado na API').toBeTruthy()
  expect(criado!.isDefault).toBe(false)
  expect(criado!.stages.map((s) => s.name)).toEqual(['Primeiro contato', 'Proposta enviada', 'Negociação', 'Pós-venda'])
  // o funil padrão continua o mesmo
  expect(all.find((p) => p.isDefault)!.name).toBe('Funil comercial')
  await c.admin.dispose()
})

test('CRM-02 · T04.01 · T04.03 · reordena as etapas com Subir e Descer e salva; etapa sem nome ou com negócio aberto não sai', async ({ page, context }) => {
  test.setTimeout(180000)
  const c = await crmCompany()
  expect(await stageNamesOf(c.admin)).toEqual(FUNIL_PADRAO)
  await enter(context, c.admin)
  await page.goto('/')
  await openSettings(page)

  const funil = page.getByRole('article', { name: 'Funil comercial', exact: true })
  await expect(funil).toBeVisible({ timeout: 20000 })
  await expect.poll(() => stagesOnScreen(funil), { timeout: 10000 }).toEqual(FUNIL_PADRAO)
  const salvar = funil.getByRole('button', { name: 'Salvar etapas', exact: true })
  await expect(salvar).toBeDisabled()
  await expect(funil.getByRole('button', { name: 'Subir etapa Novo interesse', exact: true })).toBeDisabled()
  await expect(funil.getByRole('button', { name: 'Descer etapa Aguardando cliente', exact: true })).toBeDisabled()

  // negativo 1: etapa sem nome não deixa salvar
  await funil.getByLabel('Nome da etapa 1', { exact: true }).fill('')
  await expect(funil.getByText('Dê um nome para a etapa 1 antes de salvar.', { exact: true })).toBeVisible()
  await expect(salvar).toBeDisabled()
  await funil.getByRole('button', { name: 'Desfazer alterações', exact: true }).click({ timeout: 10000 })
  await expect.poll(() => stagesOnScreen(funil), { timeout: 10000 }).toEqual(FUNIL_PADRAO)
  await expect(salvar).toBeDisabled()

  // positivo: "Novo interesse" desce uma posição e "Aguardando cliente" sobe uma
  const anuncio = funil.locator('p[aria-live="polite"]')
  await funil.getByRole('button', { name: 'Descer etapa Novo interesse', exact: true }).click({ timeout: 10000 })
  await expect(anuncio).toHaveText('Etapa Novo interesse agora é a 2ª de 5.')
  await funil.getByRole('button', { name: 'Subir etapa Aguardando cliente', exact: true }).click({ timeout: 10000 })
  await expect(anuncio).toHaveText('Etapa Aguardando cliente agora é a 4ª de 5.')
  const nova = ['Qualificação', 'Novo interesse', 'Proposta/orçamento', 'Aguardando cliente', 'Negociação']
  await expect.poll(() => stagesOnScreen(funil), { timeout: 10000 }).toEqual(nova)
  expect(await stageNamesOf(c.admin), 'nada gravado antes de salvar').toEqual(FUNIL_PADRAO)

  await expect(salvar).toBeEnabled()
  await salvar.click({ timeout: 10000 })
  await expect(page.getByText('Etapas salvas.', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect.poll(() => stageNamesOf(c.admin), { timeout: 10000 }).toEqual(nova)
  await expect(salvar).toBeDisabled()

  // a ordem nova vem do servidor depois de recarregar
  await page.reload()
  await openSettings(page)
  await expect(funil).toBeVisible({ timeout: 20000 })
  await expect.poll(() => stagesOnScreen(funil), { timeout: 15000 }).toEqual(nova)

  // negativo 2 (T04.03): negócio aberto na primeira etapa (agora "Qualificação") impede tirá-la do funil
  const r = await c.admin.post('/api/crm/deals', { data: { title: `Orçamento de vitrine ${uid()}` } })
  expect(r.status(), await r.text()).toBe(201)
  const deal = (await r.json()).deal
  const qualificacao = (await pipelinesOf(c.admin)).find((p) => p.isDefault)!.stages.find((s) => s.name === 'Qualificação')!
  expect(deal.stageId).toBe(qualificacao.id)

  await funil.getByRole('button', { name: 'Desativar etapa Qualificação', exact: true }).click({ timeout: 10000 })
  await expect(funil.getByText('Saem do funil ao salvar:', { exact: true })).toBeVisible()
  await expect(funil.getByRole('button', { name: 'Manter etapa Qualificação', exact: true })).toBeVisible()
  await salvar.click({ timeout: 10000 })
  await expect(funil.getByRole('alert')).toHaveText('A etapa "Qualificação" tem 1 negócio(s) aberto(s). Mova os negócios antes de tirá-la do funil.', {
    timeout: 15000,
  })
  expect(await stageNamesOf(c.admin)).toEqual(nova)
  const depois = (await pipelinesOf(c.admin)).find((p) => p.isDefault)!
  expect(depois.stages.find((s) => s.id === qualificacao.id)?.status).toBe('active')
  await c.admin.dispose()
})

test('CRM-09 · T12.04 · gestor muda os Ajustes do CRM pela tela; supervisor e atendente recebem 403 nas rotas de ajustes e funis', async ({ page, context }) => {
  test.setTimeout(180000)
  const c = await crmCompany()
  const gestor = await member(c.admin, 'gestor')
  await enter(context, gestor)
  await page.goto('/')
  await openSettings(page)
  for (const secao of ['Automação', 'Funil de vendas', 'Sincronização']) {
    await expect(page.getByRole('heading', { level: 2, name: secao, exact: true })).toBeVisible({ timeout: 20000 })
  }
  await expect(page.getByText('Esta tela é só para administradores e gestores', { exact: true })).toHaveCount(0)
  // reprocessar evento parado é só do administrador: o gestor lê o aviso correspondente
  await expect(page.getByText('Quando um evento falha várias vezes, ele para aqui e um administrador pode reprocessar.', { exact: true })).toBeVisible({
    timeout: 20000,
  })

  const exportar = page.getByRole('checkbox', { name: 'Exportar dados do CRM', exact: true })
  await exportar.click({ timeout: 10000 })
  await expect(page.getByText('Opção ligada: Exportar dados do CRM.', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(exportar).toBeChecked()
  await expect.poll(async () => (await flagsOf(c.admin)).exports, { timeout: 10000 }).toBe(true)

  // negativo: supervisor e atendente não leem nem mudam ajustes e funis
  const antes = await pipelinesOf(c.admin)
  const padrao = antes.find((p) => p.isDefault)!
  for (const role of ['supervisor', 'atendente']) {
    const api = await member(c.admin, role)
    const tentativas = [
      await api.get('/api/crm/settings'),
      await api.patch('/api/crm/settings', { data: { exports: false } }),
      await api.post('/api/crm/pipelines', { data: { name: 'Funil indevido', stages: [{ name: 'Etapa única' }] } }),
      await api.patch(`/api/crm/pipelines/${padrao.id}/stages`, { data: { version: padrao.version, stages: [...padrao.stages].reverse().map((s) => ({ id: s.id, name: s.name })) } }),
    ]
    for (const r of tentativas) {
      expect(r.status(), `${role} · ${r.url()}`).toBe(403)
      expect((await r.json()).error).toBe('Sem permissão para esta ação')
    }
    await api.dispose()
  }
  expect((await flagsOf(c.admin)).exports).toBe(true)
  const depois = await pipelinesOf(c.admin)
  expect(depois.map((p) => p.id)).toEqual(antes.map((p) => p.id))
  expect(depois.find((p) => p.isDefault)!.stages.map((s) => s.name)).toEqual(FUNIL_PADRAO)
  await gestor.dispose()
  await c.admin.dispose()
})

test('CRM-08 · T12.01 · T09.05 · T10.01 · T04.07 · Visão comercial: conta nova sem números, estimativa separada do declarado, ganho sem valor não vira R$ 0,00 e o atalho abre Tarefas atrasadas', async ({
  page,
  context,
}) => {
  test.setTimeout(180000)
  const c = await crmCompany()
  await enter(context, c.admin)
  await page.goto('/')
  await openOverview(page)

  // conta nova: o "Comece por aqui" no lugar do vazio comum e nenhum valor inventado
  const comece = page.getByRole('region', { name: 'Comece por aqui', exact: true })
  await expect(comece).toBeVisible({ timeout: 20000 })
  await expect(comece.getByText('Três passos para o CRM começar a mostrar números.', { exact: true })).toBeVisible()
  await expect(comece.getByText('0 de 3', { exact: true })).toBeVisible()
  await expect(comece.getByRole('button', { name: 'Ir para negócios', exact: true })).toBeVisible()
  await expect(comece.getByRole('button', { name: 'Ir para contatos', exact: true })).toBeVisible()
  await expect(page.getByText('Nenhum negócio no período', { exact: true })).toHaveCount(0)
  await expect(kpi(page, 'Valor ganho (declarado)').locator('.kpi__valor')).toHaveText('—')
  await expect(kpi(page, 'Valor ganho (declarado)').locator('.kpi__ref')).toHaveText('nenhum ganho no período')
  await expect(kpi(page, 'Valor em aberto (declarado)').locator('.kpi__valor')).toHaveText('—')
  const estimativa = page.getByRole('region', { name: 'Estimativa (não é receita)', exact: true })
  await expect(estimativa.locator('.kpi__valor')).toHaveText('Sem estimativa')
  await expect(estimativa.locator('.kpi__ref')).toHaveText('nenhum negócio aberto tem estimativa')
  const atrasadas = page.getByRole('region', { name: 'Tarefas atrasadas', exact: true })
  await expect(atrasadas.locator('.kpi__ref')).toHaveText('nenhuma tarefa com prazo vencido')
  await expect(atrasadas.getByRole('button', { name: 'Ver tarefas', exact: true })).toBeVisible()
  await expect(page.getByRole('main')).not.toContainText(/R\$\s*0,00/)

  // dados: um aberto com valor declarado e estimativa da análise, um ganho sem valor e uma tarefa vencida
  const tag = uid()
  const aberto = await c.admin.post('/api/crm/deals', { data: { title: `Reforma da loja ${tag}`, amountCents: 250000 } })
  expect(aberto.status(), await aberto.text()).toBe(201)
  const dealA = (await aberto.json()).deal
  await testDb.crmDeal.update({ where: { id: dealA.id }, data: { estimatedAmountCents: 180000 } })
  const semValor = await c.admin.post('/api/crm/deals', { data: { title: `Pedido sem valor ${tag}` } })
  expect(semValor.status(), await semValor.text()).toBe(201)
  const dealB = (await semValor.json()).deal
  // negativo: ganho sem valor só com confirmação explícita; sem ela nada muda
  const recusado = await c.admin.post(`/api/crm/deals/${dealB.id}/close`, { data: { outcome: 'won', version: dealB.version } })
  expect(recusado.status()).toBe(400)
  expect((await recusado.json()).error).toBe('Informe o valor da venda ou confirme que ele não é conhecido.')
  expect((await (await c.admin.get(`/api/crm/deals/${dealB.id}`)).json()).deal.status).toBe('open')
  const ganho = await c.admin.post(`/api/crm/deals/${dealB.id}/close`, { data: { outcome: 'won', version: dealB.version, confirmNoAmount: true } })
  expect(ganho.status(), await ganho.text()).toBe(200)
  expect((await ganho.json()).deal).toMatchObject({ status: 'won', amountCents: null })
  const tarefa = `Retornar sobre o orçamento ${tag}`
  const t = await c.admin.post('/api/crm/activities', {
    data: { type: 'follow_up', title: tarefa, dealId: dealA.id, dueAt: new Date(Date.now() - 2 * 86400_000).toISOString() },
  })
  expect(t.status(), await t.text()).toBe(201)
  const act = (await t.json()).activity

  const ov = await (await c.admin.get('/api/crm/overview')).json()
  expect(ov.open).toMatchObject({ count: 1, declaredCents: 250000, estimatedCents: 180000, withoutDeclaredAmount: 0 })
  expect(ov.won).toMatchObject({ count: 1, confirmedCents: 0, withoutAmount: 1 })
  expect(ov.overdueTasks).toBe(1)

  await page.reload()
  await openOverview(page)
  await expect(kpi(page, 'Negócios abertos').locator('.kpi__valor')).toHaveText('1', { timeout: 20000 })
  await expect(page.getByRole('region', { name: 'Comece por aqui', exact: true })).toHaveCount(0)
  // T10.01: estimativa no cartão próprio, rotulada, fora do valor declarado
  await expect(estimativa.locator('.kpi__valor')).toHaveText(/^R\$\s1\.800,00$/)
  await expect(estimativa.locator('.kpi__ref')).toHaveText('valor estimado, não é receita')
  await expect(kpi(page, 'Valor em aberto (declarado)').locator('.kpi__valor')).toHaveText(/^R\$\s2\.500,00$/)
  await expect(kpi(page, 'Valor em aberto (declarado)').locator('.kpi__ref')).toHaveText('informado nos negócios')
  // T04.07: ganho sem valor conta como ganho, mas não entra na soma nem aparece como R$ 0,00
  await expect(kpi(page, 'Ganhos no período').locator('.kpi__valor')).toHaveText('1')
  await expect(kpi(page, 'Ganhos no período').locator('.kpi__ref')).toHaveText('1 sem valor informado')
  await expect(kpi(page, 'Valor ganho (declarado)').locator('.kpi__valor')).toHaveText('Valor não informado')
  await expect(kpi(page, 'Valor ganho (declarado)').locator('.kpi__ref')).toHaveText('1 ganho sem valor fica fora da soma')
  // os dois negócios estão sem responsável (criados pela administradora sem escolher ninguém)
  const semDono = page.getByRole('region', { name: 'Negócios por responsável', exact: true }).getByRole('row').filter({ hasText: 'Sem responsável' })
  await expect(semDono).toContainText('Valor não informado', { timeout: 15000 })
  await expect(page.getByRole('main')).not.toContainText(/R\$\s*0,00/)

  // atalho das tarefas vencidas: abre Tarefas já no filtro "Atrasadas"
  await expect(atrasadas.locator('.kpi__ref')).toHaveText('1 tarefa precisa de atenção')
  await atrasadas.getByRole('button', { name: 'Ver tarefas atrasadas', exact: true }).click({ timeout: 10000 })
  await expect(page.getByRole('heading', { level: 1, name: 'Tarefas', exact: true })).toBeVisible({ timeout: 20000 })
  const filtros = page.getByRole('group', { name: 'Situação das tarefas', exact: true })
  await expect(filtros.getByRole('button', { name: 'Atrasadas', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(filtros.getByRole('button', { name: 'Abertas', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('heading', { level: 2, name: 'Tarefas atrasadas', exact: true })).toBeVisible()
  const item = page.getByRole('listitem').filter({ hasText: tarefa })
  await expect(item).toBeVisible({ timeout: 15000 })
  await expect(item.getByText('Atrasada', { exact: true })).toBeVisible()
  const vencidas = (await (await c.admin.get('/api/crm/activities?overdue=1')).json()).items as Array<{ id: string; overdue: boolean }>
  expect(vencidas.map((x) => x.id)).toEqual([act.id])
  expect(vencidas[0].overdue).toBe(true)
  await c.admin.dispose()
})

for (const role of ['analista', 'viewer']) {
  test(`CRM-08 · CRM-12 · T12.04 · ${role} abre a Visão comercial só com os números agregados; a API de negócios dá 403`, async ({ page, context }) => {
    test.setTimeout(180000)
    const c = await crmCompany()
    const api = await member(c.admin, role)
    await enter(context, api)
    await page.goto('/')
    await openOverview(page)

    // vazio próprio de quem só lê: sem checklist e sem botões para criar ou abrir negócios e tarefas
    await expect(page.getByText('Nenhum negócio no período', { exact: true })).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('Os indicadores aparecem quando a equipe comercial registrar negócios no CRM.', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Comece por aqui', exact: true })).toHaveCount(0)
    for (const botao of ['Ir para negócios', 'Ver tarefas', 'Ver tarefas atrasadas', 'Ver negócios']) {
      await expect(page.getByRole('button', { name: botao, exact: true }), botao).toHaveCount(0)
    }
    await page.getByRole('button', { name: 'Ver os últimos 90 dias', exact: true }).click({ timeout: 10000 })
    const periodo = page.getByRole('group', { name: 'Período', exact: true })
    await expect(periodo.getByRole('button', { name: '90 dias', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Ver os últimos 90 dias', exact: true })).toHaveCount(0)
    await expect(page.getByText('Nenhum negócio no período', { exact: true })).toBeVisible()

    // a equipe comercial registra negócios; quem só lê vê os números, sem a tabela por pessoa
    const tag = uid()
    const aberto = await c.admin.post('/api/crm/deals', { data: { title: `Instalação de toldo ${tag}`, amountCents: 250000 } })
    expect(aberto.status(), await aberto.text()).toBe(201)
    const semValor = await c.admin.post('/api/crm/deals', { data: { title: `Visita técnica ${tag}` } })
    expect(semValor.status(), await semValor.text()).toBe(201)
    const dealB = (await semValor.json()).deal
    expect((await c.admin.post(`/api/crm/deals/${dealB.id}/close`, { data: { outcome: 'won', version: dealB.version, confirmNoAmount: true } })).status()).toBe(200)

    await page.reload()
    await openOverview(page)
    await expect(kpi(page, 'Negócios abertos').locator('.kpi__valor')).toHaveText('1', { timeout: 20000 })
    await expect(kpi(page, 'Ganhos no período').locator('.kpi__valor')).toHaveText('1')
    await expect(kpi(page, 'Valor em aberto (declarado)').locator('.kpi__valor')).toHaveText(/^R\$\s2\.500,00$/)
    await expect(kpi(page, 'Valor ganho (declarado)').locator('.kpi__valor')).toHaveText('Valor não informado')
    await expect(page.getByRole('heading', { level: 2, name: 'Negócios abertos por etapa', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Por responsável', exact: true })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Negócios por responsável', exact: true })).toHaveCount(0)
    for (const botao of ['Ver negócios', 'Ver tarefas']) await expect(page.getByRole('button', { name: botao, exact: true }), botao).toHaveCount(0)
    await expect(page.getByText(`Instalação de toldo ${tag}`)).toHaveCount(0)

    // API: o agregado responde; a lista de negócios, as tarefas e os ajustes não
    const ov = await api.get('/api/crm/overview')
    expect(ov.status()).toBe(200)
    const d = await ov.json()
    expect(d.open).toMatchObject({ count: 1, declaredCents: 250000 })
    expect(d.won).toMatchObject({ count: 1, confirmedCents: 0, withoutAmount: 1 })
    for (const path of ['/api/crm/deals', `/api/crm/deals/${dealB.id}`, '/api/crm/activities', '/api/crm/settings']) {
      const r = await api.get(path)
      expect(r.status(), `${role} · ${path}`).toBe(403)
      expect((await r.json()).error).toBe('Sem permissão para esta ação')
    }
    await api.dispose()
    await c.admin.dispose()
  })
}
