import { test, expect } from '@playwright/test'
import { newChat, setupCompany } from './gw'
import { testDb } from './db'
import { enter, home, openView } from './ui'

// T8 · fluxos principais pela tela, numa empresa nova (dados só deste teste): Alertas (abas, filtros, resolver,
// ignorar), Conversas (filtro, ordenação, ação em lote), Recuperação (filtro, registrar tentativa), Notificações
// e troca de período da Visão Geral.

const orgIdOf = async (c: Awaited<ReturnType<typeof setupCompany>>) => (await (await c.admin.get('/api/me')).json()).organizationId as string

test.describe('Alertas pela tela', () => {
  test('abas, busca, filtro de criticidade, resolver e ignorar', async ({ page, context, isMobile }) => {
    test.setTimeout(120_000)
    const c = await setupCompany()
    await c.send(newChat(), 'Oi, quanto custa a limpeza?', { minutes: 40, pushName: 'Paula Lima' })
    await c.send(newChat(), 'Bom dia, tem horário amanhã?', { minutes: 40, pushName: 'Rafael Souza' })
    await c.tick({ onlyThisCompany: true })
    await expect.poll(async () => new Set((await c.alerts('new')).alerts.map((a) => a.customerName)).size).toBe(2)
    // aquece as rotas (no modo dev a 1ª chamada compila e pode passar do tempo do clique)
    await c.admin.post('/api/alerts/aquecer/resolve', { data: { reason: 'aquecer' } })
    await c.admin.post('/api/alerts/aquecer/dismiss', { data: { reason: 'aquecer' } })

    await enter(context, c.email, c.password)
    await home(page)
    await openView(page, 'alerts', !!isMobile)
    const cards = page.locator('article.alerta')
    await expect(page.getByRole('tab', { name: /Ativos/ })).toHaveAttribute('aria-selected', 'true')
    await expect(cards.filter({ hasText: 'Paula L***' }).first()).toBeVisible({ timeout: 15000 })
    await expect(cards.filter({ hasText: 'Rafael S***' }).first()).toBeVisible()

    // busca (no nome completo, mesmo que a tela mostre o nome mascarado)
    const busca = page.getByPlaceholder('Buscar alertas, clientes ou atendentes...')
    await busca.fill('Paula Lima')
    await expect(cards.filter({ hasText: 'Rafael S***' })).toHaveCount(0)
    await expect(cards.filter({ hasText: 'Paula L***' }).first()).toBeVisible()
    await busca.fill('')
    await expect(cards.filter({ hasText: 'Rafael S***' }).first()).toBeVisible()

    // filtro de criticidade: "Limpar filtros" só se habilita com filtro ativo e devolve a lista
    const limpar = page.getByRole('button', { name: 'Limpar filtros' })
    await expect(limpar).toBeDisabled()
    await page.locator('#f-alertas-criticidade').selectOption('informativo')
    await expect(limpar).toBeEnabled()
    await limpar.click()
    await expect(page.locator('#f-alertas-criticidade')).toHaveValue('todas')
    await expect(cards.filter({ hasText: 'Paula L***' }).first()).toBeVisible({ timeout: 15000 })

    // resolver com motivo
    await cards.filter({ hasText: 'Paula L***' }).first().getByRole('button', { name: 'Resolver' }).click()
    await page.getByRole('menuitem', { name: 'Cliente respondido' }).click()
    await expect.poll(async () => (await c.alerts('resolved')).alerts.filter((a) => a.customerName === 'Paula Lima').length).toBeGreaterThan(0)

    // ignorar com motivo
    await cards.filter({ hasText: 'Rafael S***' }).first().getByRole('button', { name: 'Ignorar' }).click()
    await page.getByRole('menuitem', { name: 'Spam' }).click()
    await expect.poll(async () => (await c.alerts('dismissed')).alerts.filter((a) => a.customerName === 'Rafael Souza').length).toBeGreaterThan(0)

    // cada um aparece na sua aba
    await page.getByRole('tab', { name: /Resolvidos/ }).click()
    await expect(page.getByRole('tab', { name: /Resolvidos/ })).toHaveAttribute('aria-selected', 'true')
    await expect(cards.filter({ hasText: 'Paula L***' }).first()).toBeVisible({ timeout: 15000 })
    await expect(cards.filter({ hasText: 'Rafael S***' })).toHaveCount(0)
    await page.getByRole('tab', { name: /Ignorados/ }).click()
    await expect(cards.filter({ hasText: 'Rafael S***' }).first()).toBeVisible({ timeout: 15000 })
    await expect(cards.filter({ hasText: 'Paula L***' })).toHaveCount(0)
    await c.dispose()
  })
})

test.describe('Conversas pela tela', () => {
  test('filtro de período e busca, ordenação por cliente e etiqueta em lote', async ({ page, context, isMobile }) => {
    test.skip(!!isMobile, 'ordenação e seleção em lote são da tabela (desktop); o celular usa cartões — conversations.ui.spec.ts')
    test.setTimeout(120_000)
    const c = await setupCompany()
    for (const name of ['Ana Teste', 'Bruno Teste', 'Carla Teste']) await c.send(newChat(), 'Olá, bom dia', { pushName: name })
    const convs = await c.conversations()
    const id = (n: string) => convs.find((x) => x.customerName === n)!.id as string
    await testDb.conversation.update({ where: { id: id('Ana Teste') }, data: { createdAt: new Date(Date.now() - 3 * 86400000) } })
    await c.admin.patch('/api/conversations/aquecer', { data: {} }) // aquece a rota do lote

    await enter(context, c.email, c.password)
    await home(page)
    await openView(page, 'conversations', false)
    const rows = page.locator('table tbody tr')
    await expect(rows).toHaveCount(3, { timeout: 15000 })

    // período "Hoje": a conversa criada há 3 dias sai; "7 dias" traz de volta
    await page.locator('#cv-periodo').selectOption('today')
    await expect(rows).toHaveCount(2)
    await expect(rows.filter({ hasText: 'Ana Teste' })).toHaveCount(0)
    await page.locator('#cv-periodo').selectOption('7d')
    await expect(rows).toHaveCount(3)

    // busca no servidor
    await page.getByPlaceholder('Buscar por cliente, telefone ou atendente...').fill('bruno')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Bruno Teste')
    await page.getByPlaceholder('Buscar por cliente, telefone ou atendente...').fill('')
    await expect(rows).toHaveCount(3)

    // ordenação pelo nome do cliente (1º clique: decrescente; 2º: crescente)
    const header = page.locator('th[data-ordenar]', { hasText: 'Cliente' })
    await header.getByRole('button').click()
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    await expect(rows.first()).toContainText('Carla Teste')
    await header.getByRole('button').click()
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    await expect(rows.first()).toContainText('Ana Teste')

    // lote: etiqueta em duas conversas
    await page.getByRole('checkbox', { name: 'Selecionar conversa de Bruno Teste' }).check()
    await page.getByRole('checkbox', { name: 'Selecionar conversa de Carla Teste' }).check()
    await expect(page.getByText('2 selecionadas')).toBeVisible()
    await page.getByRole('button', { name: 'Adicionar tag', exact: true }).click()
    await page.getByRole('dialog').getByRole('textbox', { name: 'Tag' }).fill('vip')
    await page.getByRole('dialog').getByRole('button', { name: 'Adicionar' }).click()
    const tags = async (n: string) => (await testDb.conversation.findUniqueOrThrow({ where: { id: id(n) } })).tags || '[]'
    await expect.poll(() => tags('Bruno Teste')).toContain('vip')
    await expect.poll(() => tags('Carla Teste')).toContain('vip')
    expect(await tags('Ana Teste')).not.toContain('vip')
    await expect(page.getByText(/\d+ selecionadas?/)).toHaveCount(0) // seleção limpa depois da ação

    // lote: marcar como revisada (selecionar todas da página)
    await page.getByRole('checkbox', { name: 'Selecionar todas as conversas da página' }).check()
    await expect(page.getByText('3 selecionadas')).toBeVisible()
    await page.getByRole('button', { name: 'Marcar como revisada', exact: true }).click()
    await expect.poll(async () => testDb.conversation.count({ where: { id: { in: convs.map((x) => x.id as string) }, reviewedAt: { not: null } } })).toBe(3)
    await c.dispose()
  })
})

test.describe('Recuperação pela tela', () => {
  test('busca, filtro de status e "Registrar tentativa"', async ({ page, context, isMobile }) => {
    test.setTimeout(120_000)
    const c = await setupCompany()
    await c.send(newChat(), 'Quero um orçamento', { pushName: 'Paula Lima' })
    await c.send(newChat(), 'Qual o valor?', { pushName: 'Rafael Souza' })
    for (const conv of await c.conversations()) {
      const r = await c.admin.post('/api/recovery', { data: { conversationId: conv.id, reason: 'Sem resposta', customerName: conv.customerName, priorityScore: 0.5 } })
      expect(r.status()).toBe(201)
    }
    await c.admin.patch('/api/recovery/aquecer', { data: {} })
    const orgId = await orgIdOf(c)

    await enter(context, c.email, c.password)
    await home(page)
    await openView(page, 'recovery', !!isMobile)
    await expect(page.getByText('2 itens encontrados')).toBeVisible({ timeout: 15000 })

    const busca = page.getByRole('searchbox', { name: 'Buscar cliente, motivo ou atendente' })
    await busca.fill('paula')
    await expect(page.getByText('1 item encontrado')).toBeVisible()
    await busca.fill('')
    await expect(page.getByText('2 itens encontrados')).toBeVisible()

    await page.locator('#rec-f-status').selectOption('attempted')
    await expect(page.getByText('Nenhum item de recuperação encontrado.')).toBeVisible({ timeout: 15000 })
    await page.locator('#rec-f-status').selectOption('all')
    await expect(page.getByText('2 itens encontrados')).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: 'Ações para Paula Lima' }).click()
    await page.getByRole('menuitem', { name: 'Registrar tentativa' }).click()
    await expect.poll(async () => {
      const it = await testDb.recoveryItem.findFirst({ where: { organizationId: orgId, customerName: 'Paula Lima' } })
      return it && { status: it.status, attempts: it.attempts }
    }).toEqual({ status: 'attempted', attempts: 1 })

    await page.locator('#rec-f-status').selectOption('attempted')
    await expect(page.getByText('1 item encontrado')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('region', { name: 'Itens de recuperação' })).toContainText('Paula Lima')
    await c.dispose()
  })
})

test.describe('Notificações pela tela', () => {
  test('abre pelo sino, marca uma como lida e depois todas', async ({ page, context }) => {
    const c = await setupCompany()
    const orgId = await orgIdOf(c)
    await testDb.notification.deleteMany({ where: { organizationId: orgId } }) // só os dois avisos deste teste
    await testDb.notification.createMany({
      data: [
        { organizationId: orgId, type: 'alert', title: 'Aviso de teste um', message: 'Cliente sem resposta' },
        { organizationId: orgId, type: 'report_ready', title: 'Aviso de teste dois' },
      ],
    })
    await c.admin.patch('/api/notifications/aquecer', { data: { read: true } }) // aquece a rota (404)

    await enter(context, c.email, c.password)
    await home(page)
    await page.getByRole('button', { name: 'Notificações' }).click()
    await page.getByRole('menuitem', { name: 'Ver todas as notificações' }).click()
    await expect(page.locator('main').getByRole('heading', { name: 'Notificações', exact: true })).toBeVisible()
    await expect(page.getByText('Você tem 2 notificações não lidas.')).toBeVisible({ timeout: 15000 })

    const um = page.getByRole('button', { name: /Aviso de teste um/ })
    await expect(um).toHaveAttribute('aria-pressed', 'false')
    await um.click()
    await expect(um).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Você tem 1 notificação não lida.')).toBeVisible()
    await expect.poll(async () => (await testDb.notification.findFirstOrThrow({ where: { organizationId: orgId, title: 'Aviso de teste um' } })).read).toBe(true)

    await page.getByRole('button', { name: 'Marcar todas como lidas' }).click()
    await expect(page.getByText('Todas as notificações foram lidas.').first()).toBeVisible()
    await expect.poll(() => testDb.notification.count({ where: { organizationId: orgId, read: false } })).toBe(0)
    await c.dispose()
  })
})

test.describe('Visão Geral: período', () => {
  test('trocar o período refaz a consulta com o período escolhido e mostra o rótulo novo', async ({ page, context, isMobile }) => {
    test.skip(!!isMobile, 'seletor de período do topo: conferido no desktop')
    await enter(context, 'admin.a@test.local')
    await home(page)
    const periodo = page.getByRole('button', { name: 'Período' })
    await expect(periodo).toContainText('Últimos 7 dias')
    const req = page.waitForRequest((r) => /\/api\/dashboard\?period=30d$/.test(r.url()))
    await periodo.click()
    await page.getByRole('menuitemradio', { name: 'Últimos 30 dias' }).click()
    await req
    await expect(periodo).toContainText('Últimos 30 dias')
    // só os avisos do app (fora do <main> fica o anunciador de rotas do Next, que também tem role=alert)
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0)
    await expect(page.locator('[data-tour="dashboard-kpis"]')).toBeVisible({ timeout: 15000 })

    const req2 = page.waitForRequest((r) => /\/api\/dashboard\?period=today$/.test(r.url()))
    await periodo.click()
    await page.getByRole('menuitemradio', { name: 'Hoje' }).click()
    await req2
    await expect(periodo).toContainText('Hoje')
  })
})
