import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { TOURS } from '../../src/lib/tours'
import { createUser, loginAs, STRONG, uid } from './helpers'
import { audit, crmCompany, enter, openView, settle } from './crm-ui'
import { crmOffAfterFile } from './crm-cleanup'

// CRM-04 · agenda na tela Tarefas: "Hoje", "Próximos 7 dias" e "Atrasadas" com prazos de ontem, hoje, +3 e +10 dias
// (no horário de Brasília, o fuso da empresa nova), e o diálogo "Editar tarefa" (título, responsável, situação). As
// tarefas nascem pela API; o efeito de cada ação é conferido de novo pela API.

crmOffAfterFile()

type Act = { id: string; title: string; status: string; ownerMemberId: string | null; priority: string; notes: string | null; dueAt: string | null; version: number }

const HOUR = 3600_000
const DAY = 24 * HOUR
/** Dia (AAAA-MM-DD) em São Paulo, `plus` dias depois de hoje (sem horário de verão desde 2019: -03:00 fixo). */
const spDay = (plus = 0) => new Date(Date.now() - 3 * HOUR + plus * DAY).toISOString().slice(0, 10)
/** AAAA-MM-DD como a tela mostra (dd/mm/aaaa). */
const br = (day: string) => day.split('-').reverse().join('/')
/** Folga antes da meia-noite: maior que o resto do teste depois da espera (o timeout de 240 s), para os dias não virarem no meio. */
const MIDNIGHT_MARGIN = 6 * 60_000
/** Perto da meia-noite de São Paulo o "hoje" do teste e o do servidor podem ser dias diferentes: espera a virada. */
async function awayFromMidnight() {
  const left = DAY - ((Date.now() - 3 * HOUR) % DAY)
  if (left < MIDNIGHT_MARGIN) await new Promise((r) => setTimeout(r, left + 2000))
}

async function task(api: APIRequestContext, data: Record<string, unknown>) {
  const r = await api.post('/api/crm/activities', { data: { type: 'follow_up', ...data } })
  expect(r.status(), await r.text()).toBe(201)
  return (await r.json()).activity as Act
}

async function idsOf(api: APIRequestContext, query: string) {
  const r = await api.get(`/api/crm/activities?${query}&limit=100`)
  expect(r.status(), await r.text()).toBe(200)
  return ((await r.json()).items as Act[]).map((a) => a.id).sort()
}

async function findTask(api: APIRequestContext, id: string) {
  const r = await api.get('/api/crm/activities?limit=100')
  expect(r.status(), await r.text()).toBe(200)
  return ((await r.json()).items as Act[]).find((a) => a.id === id)
}

/** Membro novo já logado, com os guias vistos (como em crm-ajustes-visao.ui.spec.ts). */
async function member(admin: APIRequestContext, role: string, name: string) {
  const email = `${role}.${uid()}@cliente.test`
  const m = await createUser(admin, { email, role, name })
  const api = await loginAs(email, STRONG)
  for (const tourId of ['welcome', ...Object.keys(TOURS)]) await api.patch('/api/tours', { data: { tourId } })
  return { id: m.id, name, api }
}

const filters = (page: Page) => page.getByRole('group', { name: 'Situação das tarefas', exact: true })
const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })

async function pick(page: Page, label: string, heading: string) {
  const button = filters(page).getByRole('button', { name: label, exact: true })
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { level: 2, name: heading, exact: true })).toBeVisible({ timeout: 15000 })
}

async function openTasks(page: Page) {
  await page.goto('/')
  await openView(page, 'crm-activities')
  await expect(page.getByRole('heading', { level: 1, name: 'Tarefas', exact: true })).toBeVisible({ timeout: 20000 })
}

test.describe('navegador em outro fuso', () => {
  // a empresa está em São Paulo e o navegador em Tóquio (12 h à frente): o dia que vale é o da empresa
  test.use({ timezoneId: 'Asia/Tokyo' })

  test('CRM-04 · Hoje, Próximos 7 dias e Atrasadas seguem o dia da empresa, não o do navegador; prazo mostrado e reagendado no horário de Brasília', async ({ page, context }) => {
    // no máximo uma espera pela virada do dia (até MIDNIGHT_MARGIN + 2 s) antes dos 240 s do teste
    test.setTimeout(240000 + MIDNIGHT_MARGIN + 5000)
    const c = await crmCompany()
    await awayFromMidnight()
    const tag = uid()
    const [dia0, diaM1, dia3, dia10] = [spDay(0), spDay(-1), spDay(3), spDay(10)]
    const hojeDue = `${dia0}T23:00:00-03:00`
    const ontem = await task(c.admin, { title: `Ontem ${tag}`, dueAt: `${diaM1}T12:00:00-03:00` })
    const hoje = await task(c.admin, { title: `Hoje ${tag}`, dueAt: hojeDue })
    const em3 = await task(c.admin, { title: `Em 3 dias ${tag}`, dueAt: `${dia3}T12:00:00-03:00` })
    const em10 = await task(c.admin, { title: `Em 10 dias ${tag}`, dueAt: `${dia10}T12:00:00-03:00` })

    await enter(context, c.admin)
    await openTasks(page)
    // padrão: Abertas, com as quatro
    await expect(filters(page).getByRole('button', { name: 'Abertas', exact: true })).toHaveAttribute('aria-pressed', 'true')
    for (const t of [ontem, hoje, em3, em10]) await expect(row(page, t.title)).toBeVisible({ timeout: 15000 })

    await pick(page, 'Hoje', 'Tarefas de hoje')
    await expect(row(page, hoje.title)).toBeVisible({ timeout: 15000 })
    for (const t of [ontem, em3, em10]) await expect(row(page, t.title)).toHaveCount(0)
    await expect(page.getByText('Prazos no horário de Brasília, o fuso da empresa.', { exact: true })).toBeVisible()
    // 23:00 em São Paulo é 11:00 do dia seguinte em Tóquio: a tela mostra o dia e a hora da empresa
    await expect(row(page, hoje.title)).toContainText(new RegExp(`Prazo: ${br(dia0)},? 23:00`))

    await pick(page, 'Próximos 7 dias', 'Tarefas dos próximos 7 dias')
    await expect(row(page, hoje.title)).toBeVisible({ timeout: 15000 })
    await expect(row(page, em3.title)).toBeVisible()
    for (const t of [ontem, em10]) await expect(row(page, t.title)).toHaveCount(0)

    // Reagendar abre com a data e a hora da empresa e grava a hora digitada no horário de Brasília
    await row(page, em3.title).getByRole('button', { name: 'Reagendar', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Reagendar tarefa' })
    await expect(dialog.getByLabel('Data', { exact: true })).toHaveValue(dia3)
    await expect(dialog.getByLabel('Hora', { exact: true })).toHaveValue('12:00')
    await expect(dialog.getByText('Data e hora no horário de Brasília.', { exact: true })).toBeVisible()
    await dialog.getByLabel('Hora', { exact: true }).fill('15:00')
    await dialog.getByRole('button', { name: 'Salvar novo prazo', exact: true }).click()
    await expect(page.getByText('Tarefa reagendada.', { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(dialog).toBeHidden()
    await expect(row(page, em3.title)).toContainText(new RegExp(`Prazo: ${br(dia3)},? 15:00`), { timeout: 15000 })
    expect(await findTask(c.admin, em3.id)).toMatchObject({ dueAt: new Date(`${dia3}T15:00:00-03:00`).toISOString(), version: em3.version + 1 })

    await pick(page, 'Atrasadas', 'Tarefas atrasadas')
    await expect(row(page, ontem.title)).toBeVisible({ timeout: 15000 })
    await expect(row(page, ontem.title).getByText('Atrasada', { exact: true })).toBeVisible()
    for (const t of [em3, em10]) await expect(row(page, t.title)).toHaveCount(0)
    // a de hoje vence às 23:00: só fica fora das atrasadas antes disso
    if (Date.now() < Date.parse(hojeDue) - 60_000) await expect(row(page, hoje.title)).toHaveCount(0)

    // a API devolve as mesmas janelas que a tela mostrou
    expect(await idsOf(c.admin, 'status=pending&due=today')).toEqual([hoje.id])
    expect(await idsOf(c.admin, 'status=pending&due=next7')).toEqual([hoje.id, em3.id].sort())
    await c.admin.dispose()
  })
})

test('CRM-04 · Editar tarefa: título vazio não salva; título, responsável e Em andamento ficam gravados', async ({ page, context }, info) => {
  test.setTimeout(180000)
  const c = await crmCompany()
  const tag = uid()
  const bruno = await member(c.admin, 'atendente', `Bruno ${tag}`)
  const a = await task(c.admin, { title: `Ligar para o cliente ${tag}`, dueAt: new Date(Date.now() + 2 * DAY).toISOString() })
  expect(a.ownerMemberId).toBe(c.memberId)

  await enter(context, c.admin)
  await openTasks(page)
  const item = row(page, a.title)
  await expect(item).toBeVisible({ timeout: 20000 })
  await expect(item.getByText('Aberta', { exact: true })).toBeVisible()
  await item.getByRole('button', { name: 'Editar', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Editar tarefa' })
  const title = dialog.getByLabel('Título', { exact: true })
  await expect(title).toHaveValue(a.title)
  await expect(title).toBeFocused()
  await expect(dialog.getByLabel('Responsável', { exact: true })).toBeVisible()
  await settle(page)
  const problems = await audit(page, `${info.project.name}-crm-editar-tarefa`, '[role="dialog"]')
  expect(problems, problems.join('\n')).toEqual([])

  // título vazio: erro ligado ao campo, foco nele e nada gravado
  await title.fill('')
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Informe o título.')
  await expect(title).toHaveAttribute('aria-invalid', 'true')
  await expect(title).toHaveAttribute('aria-describedby', 'crm-editar-titulo-erro')
  await expect(title).toBeFocused()
  await expect(dialog).toBeVisible()
  expect(await findTask(c.admin, a.id)).toMatchObject({ title: a.title, status: 'open', ownerMemberId: c.memberId, version: a.version })

  const novo = `Retornar ao cliente ${tag}`
  await title.fill(novo)
  await dialog.getByLabel('Responsável', { exact: true }).selectOption({ label: bruno.name })
  await dialog.getByLabel('Situação', { exact: true }).selectOption({ label: 'Em andamento' })
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click()
  await expect(page.getByText('Tarefa atualizada.', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(dialog).toBeHidden()

  const edited = row(page, novo)
  await expect(edited.getByText('Em andamento', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(edited).toContainText(bruno.name)
  await expect(row(page, a.title)).toHaveCount(0)
  expect(await findTask(c.admin, a.id)).toMatchObject({ title: novo, ownerMemberId: bruno.id, status: 'in_progress', version: a.version + 1 })
  // em andamento segue nas pendentes: o Bruno vê a tarefa que agora é dele
  expect(await idsOf(bruno.api, 'status=pending')).toEqual([a.id])
  await bruno.api.dispose()
  await c.admin.dispose()
})

test('CRM-04 · atendente edita a própria tarefa sem o campo Responsável', async ({ page, context }) => {
  test.setTimeout(180000)
  const c = await crmCompany()
  const tag = uid()
  const carla = await member(c.admin, 'atendente', `Carla ${tag}`)
  const a = await task(carla.api, { title: `Mandar o orçamento ${tag}` })
  expect(a.ownerMemberId).toBe(carla.id)

  await enter(context, carla.api)
  await openTasks(page)
  const item = row(page, a.title)
  await expect(item).toBeVisible({ timeout: 20000 })
  await item.getByRole('button', { name: 'Editar', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Editar tarefa' })
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue(a.title)
  await expect(dialog.getByLabel('Situação', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('Prioridade', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('Responsável')).toHaveCount(0)
  await expect(page.locator('#crm-editar-responsavel')).toHaveCount(0)

  await dialog.getByLabel('Prioridade', { exact: true }).selectOption({ label: 'Alta' })
  await dialog.getByLabel('Observações (opcional)', { exact: true }).fill('Confirmar o endereço de entrega')
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click()
  await expect(page.getByText('Tarefa atualizada.', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(dialog).toBeHidden()
  await expect(item).toContainText('Prioridade alta', { timeout: 15000 })
  await expect(item).toContainText('Confirmar o endereço de entrega')
  expect(await findTask(carla.api, a.id)).toMatchObject({ priority: 'high', notes: 'Confirmar o endereço de entrega', ownerMemberId: carla.id, status: 'open', version: a.version + 1 })
  await carla.api.dispose()
  await c.admin.dispose()
})
