import { test, expect, type Page } from '@playwright/test'
import { newChat, setupCompany } from './gw'
import { enter, home, openView } from './ui'

// D3 · Resiliência das telas: falha do servidor (500) vira mensagem clara com "Tentar novamente" (sem detalhe técnico)
// e a tela volta quando o servidor volta; nome muito longo não cria rolagem horizontal; lista grande pagina.

const SCREENS: Array<{ view: string; api: RegExp; message: string }> = [
  { view: 'alerts', api: /\/api\/alerts(\?|$)/, message: 'Erro ao carregar alertas' },
  { view: 'conversations', api: /\/api\/conversations(\?|$)/, message: 'Erro ao carregar conversas' },
  { view: 'recovery', api: /\/api\/recovery(\?|$)/, message: 'Erro ao carregar recuperação' },
  { view: 'connections', api: /\/api\/connections(\?|$)/, message: 'Erro ao carregar conexões' },
  { view: 'reports', api: /\/api\/reports(\?|$)/, message: 'Erro ao carregar relatórios' },
]
const FAIL = { status: 500, contentType: 'application/json', body: '{"error":"Internal error: Prisma P2024 at /app/src/x.ts:12"}' }

async function expectFriendlyError(page: Page, message: string) {
  const box = page.getByRole('alert').filter({ hasText: message })
  await expect(box).toBeVisible({ timeout: 15000 })
  await expect(box.getByRole('button', { name: 'Tentar novamente' })).toBeVisible()
  // nada do detalhe técnico que veio na resposta
  expect(await page.locator('main').innerText()).not.toMatch(/Prisma|P2024|\/app\/src|Internal error|\bat \S+ \(/)
  return box
}

test.describe('Servidor com erro', () => {
  test('Visão Geral: mensagem clara e "Tentar novamente" recupera quando o servidor volta', async ({ page, context }) => {
    await enter(context, 'admin.a@test.local')
    await page.route(/\/api\/dashboard(\?|$)/, (r) => r.fulfill(FAIL))
    await page.goto('/')
    const box = await expectFriendlyError(page, 'Erro ao carregar a Visão Geral')
    await page.unroute(/\/api\/dashboard(\?|$)/)
    await box.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Erro ao carregar' })).toHaveCount(0, { timeout: 15000 })
    await expect(page.locator('[data-tour="dashboard-kpis"]')).toBeVisible({ timeout: 15000 })
  })

  for (const s of SCREENS) {
    test(`${s.view}: mensagem clara e "Tentar novamente" recupera quando o servidor volta`, async ({ page, context, isMobile }) => {
      await enter(context, 'admin.a@test.local')
      await home(page)
      await page.route(s.api, (r) => r.fulfill(FAIL))
      await openView(page, s.view, !!isMobile)
      const box = await expectFriendlyError(page, s.message)
      await page.unroute(s.api)
      await box.getByRole('button', { name: 'Tentar novamente' }).click()
      await expect(page.getByRole('alert').filter({ hasText: s.message })).toHaveCount(0, { timeout: 15000 })
    })
  }
})

test.describe('Nome muito longo', () => {
  const LONG = 'Maria Aparecida da Conceição Albuquerque Cavalcanti de Vasconcelos Sobrinho Neta'
  const noHorizontalScroll = async (page: Page, where: string) => {
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
    expect(scroll, `${where}: rolagem horizontal na página (${scroll} > ${client})`).toBeLessThanOrEqual(client + 1)
  }

  test(`nome de ${LONG.length} caracteres não estoura a largura (conversas, detalhe, alertas, recuperação)`, async ({ page, context, isMobile }) => {
    test.setTimeout(120_000)
    expect(LONG.length).toBeGreaterThanOrEqual(60)
    const c = await setupCompany()
    await c.send(newChat(), 'Oi, quanto custa o tratamento?', { minutes: 40, pushName: LONG })
    await c.tick({ onlyThisCompany: true })
    const conv = (await c.conversations())[0]
    await c.admin.post('/api/recovery', { data: { conversationId: conv.id, reason: 'Sem resposta', customerName: LONG, originalAgentName: LONG } })

    await enter(context, c.email, c.password)
    await home(page)
    await openView(page, 'conversations', !!isMobile)
    await expect(page.getByText(LONG).first()).toBeVisible({ timeout: 15000 })
    await noHorizontalScroll(page, 'Conversas')

    if (isMobile) await page.getByTestId('conversation-cards').getByRole('button').first().click()
    else await page.locator('table tbody tr').first().click()
    await expect(page.getByText(LONG).first()).toBeVisible({ timeout: 20000 })
    await noHorizontalScroll(page, 'Detalhe da conversa')

    await openView(page, 'alerts', !!isMobile)
    await expect(page.getByRole('status', { name: 'Carregando alertas' })).toHaveCount(0, { timeout: 15000 })
    await noHorizontalScroll(page, 'Alertas')

    await openView(page, 'recovery', !!isMobile)
    await expect(page.getByText(LONG).first()).toBeVisible({ timeout: 15000 })
    await noHorizontalScroll(page, 'Recuperação')
    await c.dispose()
  })
})

test.describe('Lista grande pagina', () => {
  test('Conversas: 17 conversas viram 2 páginas (15 + 2)', async ({ page, context, isMobile }) => {
    test.setTimeout(120_000)
    const c = await setupCompany()
    for (let i = 1; i <= 17; i++) await c.send(newChat(), 'Olá', { pushName: `Cliente Lista ${String(i).padStart(2, '0')}` })

    await enter(context, c.email, c.password)
    await home(page)
    await openView(page, 'conversations', !!isMobile)
    await expect(page.getByText('Mostrando 1–15 de 17')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
    await page.getByRole('button', { name: 'Próxima página' }).click()
    await expect(page.getByText('Mostrando 16–17 de 17')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('button', { name: 'Próxima página' })).toBeDisabled()
    const items = isMobile ? page.getByTestId('conversation-cards').getByRole('button') : page.locator('table tbody tr')
    await expect(items).toHaveCount(2)
    await c.dispose()
  })

  test('Recuperação: 22 itens aparecem todos, em 2 páginas (antes só os 20 primeiros chegavam à tela)', async ({ page, context, isMobile }) => {
    test.setTimeout(120_000)
    const c = await setupCompany()
    await c.send(newChat(), 'Olá', { pushName: 'Cliente Fila' })
    const conv = (await c.conversations())[0]
    for (let i = 1; i <= 22; i++) {
      const r = await c.admin.post('/api/recovery', { data: { conversationId: conv.id, reason: 'Sem resposta', customerName: `Fila ${String(i).padStart(2, '0')}`, priorityScore: 0.5 } })
      expect(r.status()).toBe(201)
    }

    await enter(context, c.email, c.password)
    await home(page)
    await openView(page, 'recovery', !!isMobile)
    await expect(page.getByText('22 itens encontrados')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Mostrando 1–20 de 22/)).toBeVisible()
    const rows = page.getByRole('region', { name: 'Itens de recuperação' }).locator('tbody tr')
    await expect(rows).toHaveCount(20)
    await page.getByRole('button', { name: 'Próxima página' }).click()
    await expect(page.getByText(/Mostrando 21–22 de 22/)).toBeVisible()
    await expect(rows).toHaveCount(2)
    await c.dispose()
  })
})
