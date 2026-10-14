import { test, expect, type Page } from '@playwright/test'
import { newChat, setupCompany } from './gw'
import { enter, home, openView } from './ui'

// T3 · Nome vindo de fora (nome do contato no WhatsApp) ou digitado (nome da equipe) com HTML/JS aparece como TEXTO
// e não executa: nada de alerta do navegador, nada de variável global criada, nenhuma <img src="x"> na página.
const CONTACT = '<img src=x onerror="window.__xss=1;alert(1)">'
const TEAM = '<img src=x onerror="window.__xss=2;alert(2)"> Equipe'

async function watch(page: Page) {
  const dialogs: string[] = []
  page.on('dialog', async (d) => {
    dialogs.push(d.message())
    await d.dismiss()
  })
  return {
    async assertClean() {
      expect(dialogs, 'nenhum alert() deveria abrir').toEqual([])
      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
      expect(await page.locator('img[src="x"]').count()).toBe(0)
    },
  }
}

test('nome de contato e de equipe com <img onerror> aparecem como texto e não executam', async ({ page, context, isMobile }) => {
  test.setTimeout(120_000)
  const c = await setupCompany()
  await c.send(newChat(), 'Oi, quanto custa?', { minutes: 45, pushName: CONTACT })
  await c.tick({ onlyThisCompany: true })
  const team = await c.admin.post('/api/teams', { data: { name: TEAM, code: 'XSS' } })
  expect(team.status()).toBeLessThan(300)
  await enter(context, c.email, c.password)
  const w = await watch(page)

  await home(page)
  await openView(page, 'conversations', !!isMobile)
  const list = isMobile ? page.getByTestId('conversation-cards') : page.locator('table tbody')
  await expect(list.getByText(CONTACT, { exact: false }).first()).toBeVisible({ timeout: 15000 })
  await w.assertClean()

  // detalhe da conversa
  if (isMobile) await list.getByRole('button').first().click()
  else await page.locator('table tbody tr').first().click()
  await expect(page.getByText(CONTACT).first()).toBeVisible({ timeout: 20000 })
  await w.assertClean()

  // alertas (nome mascarado, mas ainda vindo do contato)
  await openView(page, 'alerts', !!isMobile)
  await expect(page.locator('main').getByRole('heading', { name: 'Alertas', exact: true })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Carregando alertas' })).toHaveCount(0, { timeout: 15000 })
  await w.assertClean()

  // equipes
  await openView(page, 'teams', !!isMobile)
  await expect(page.getByText(TEAM).first()).toBeVisible({ timeout: 15000 })
  await w.assertClean()
  await c.dispose()
})
