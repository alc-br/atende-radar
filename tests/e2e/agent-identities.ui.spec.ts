import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'
import { newChat, setupCompany } from './gw'

// P5 · Equipe › Identidades do WhatsApp: a assinatura aparece como "Sugerido"; o gestor confirma, a tela mostra "Confirmado"
// e o atendente; "Desfazer" volta para a sugestão. Funciona no celular (cartões empilhados).
test('identidades do WhatsApp: confirmar e desfazer o vínculo pela tela', async ({ page, context, isMobile }) => {
  const c = await setupCompany()
  await c.admin.post('/api/team', { data: { name: 'Carlos Mendes', email: 'carlos@empresa.test', role: 'atendente' } })
  await c.admin.post('/api/team', { data: { name: 'Ana Souza', email: 'ana@empresa.test', role: 'atendente' } })
  const chat = newChat()
  await c.send(chat, 'Oi, tudo bem?', { minutes: 10, pushName: 'Tela Identidade' })
  await c.send(chat, '*Carlos*: Olá! Como posso ajudar?', { minutes: 8, fromMe: true })
  await c.tick()

  const api = await loginAs(c.email, c.password)
  for (const tourId of ['welcome', 'dashboard', 'team']) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()

  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-team"]').click()

  const section = page.getByTestId('whatsapp-identities')
  const card = section.getByTestId('identity-card').filter({ hasText: 'Assinatura' })
  await card.scrollIntoViewIfNeeded()
  await expect(card.getByTestId('identity-status')).toHaveText(/Sugerido/, { timeout: 20000 })
  await expect(card.getByTestId('identity-suggested')).toHaveText('Carlos Mendes')
  await expect(section.getByTestId('identities-summary')).toContainText('confirmado')

  await card.getByRole('button', { name: 'Confirmar' }).click()
  await expect(card.getByTestId('identity-status')).toHaveText(/Confirmado/)
  await expect(card.getByTestId('identity-agent')).toHaveText('Carlos Mendes')

  await card.getByRole('button', { name: 'Desfazer' }).click()
  await expect(card.getByTestId('identity-status')).toHaveText(/Sugerido/)

  // nada de rolagem horizontal no celular
  if (isMobile) expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await c.dispose()
})
