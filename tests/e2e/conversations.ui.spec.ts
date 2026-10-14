import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

// Conversas: no celular vira lista de cartões (com o que importa) e filtros recolhidos; no desktop segue a tabela.
test('Conversas: cartões e filtros recolhíveis no celular, tabela no desktop', async ({ page, context, isMobile }) => {
  const api = await loginAs('admin.a@test.local')
  for (const tourId of ['welcome', 'conversations']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()

  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-conversations"]').click()
  await expect(page.locator('main').getByRole('heading', { name: /Conversas/i }).first()).toBeVisible()

  const cards = page.getByTestId('conversation-cards')
  if (isMobile) {
    await expect(cards).toBeVisible()
    const first = cards.getByRole('button').first()
    await expect(first).toBeVisible()
    // o cartão mostra mais do que o nome: contato, atendente e situação/valor
    await expect(first).toContainText(/\*{5}\d{4}/)
    await expect(page.locator('table')).toBeHidden()

    // filtros recolhidos até pedir
    const filters = page.getByTestId('conversations-filters-toggle').or(page.getByRole('button', { name: /^Filtros$/ }))
    await expect(filters).toBeVisible()
    await expect(page.locator('[data-tour="conversations-filters"]')).toBeHidden()
    await filters.click()
    await expect(page.locator('[data-tour="conversations-filters"]')).toBeVisible()

    await first.click()
    await expect(page.getByRole('button', { name: /Voltar|Conversas/ }).first()).toBeVisible()
  } else {
    await expect(cards).toBeHidden()
    await expect(page.locator('table').first()).toBeVisible()
    await expect(page.locator('[data-tour="conversations-filters"]')).toBeVisible()
  }
})

// Detalhe da conversa: abrir, voltar (este botão lançava erro) e o menu de privacidade só para quem configura.
test('Detalhe da conversa: "Voltar" funciona e o menu de Privacidade aparece para o administrador', async ({ page, context, isMobile }) => {
  const api = await loginAs('admin.a@test.local')
  for (const tourId of ['welcome', 'conversations', 'conversation-detail']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-conversations"]').click()
  if (isMobile) await page.getByTestId('conversation-cards').getByRole('button').first().click()
  else await page.locator('table tbody tr').first().click()

  await expect(page.getByRole('button', { name: 'Privacidade do cliente' })).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: 'Privacidade do cliente' }).click()
  await expect(page.getByRole('menuitem', { name: /Parar de monitorar/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Apagar dados/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Exportar dados/ })).toBeVisible() // baixa ou avisa: privacy-export.ui.spec.ts
  await page.keyboard.press('Escape')

  // voltar para a lista
  await page.locator('main button:has(svg.lucide-arrow-left)').first().click()
  await expect(page.locator('main').getByRole('heading', { name: /Conversas/i }).first()).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

// Detalhe de uma conversa que não existe mais (404): "Conversa não encontrada", não "Erro ao carregar".
// Falha do servidor (500) continua como erro, com "Tentar novamente".
for (const [status, text] of [[404, 'Conversa não encontrada'], [500, 'Erro ao carregar conversa']] as const) {
  test(`Detalhe da conversa com resposta ${status}: "${text}"`, async ({ page, context, isMobile }) => {
    const api = await loginAs('admin.a@test.local')
    for (const tourId of ['welcome', 'conversations', 'conversation-detail']) await api.patch('/api/tours', { data: { tourId } })
    await context.addCookies((await api.storageState()).cookies)
    await api.dispose()

    await page.goto('/')
    if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
    await page.locator('[data-tour="nav-conversations"]').click()
    const row = isMobile ? page.getByTestId('conversation-cards').getByRole('button').first() : page.locator('table tbody tr').first()
    await expect(row).toBeVisible({ timeout: 20000 })
    // só o detalhe (GET /api/conversations/{id}) responde com o status do teste; a lista já carregou
    await page.route(/\/api\/conversations\/[^/?]+$/, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: status === 404 ? 'Conversation not found' : 'boom' }) })
        : route.continue()
    )
    await row.click()

    const main = page.locator('main')
    await expect(main.getByText(text, { exact: true })).toBeVisible({ timeout: 20000 })
    if (status === 404) {
      await expect(main.getByText('Erro ao carregar conversa')).toHaveCount(0)
      await expect(main.getByRole('button', { name: 'Tentar novamente' })).toHaveCount(0)
    } else {
      await expect(main.getByRole('button', { name: 'Tentar novamente' })).toBeVisible()
    }
    await main.getByRole('button', { name: 'Voltar para Conversas' }).click()
    await expect(main.getByRole('heading', { name: /Conversas/i }).first()).toBeVisible()
  })
}