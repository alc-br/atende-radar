import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import sharp from 'sharp'
import { loginAs, signupOrg, uid } from './helpers'
import { lastTokenFor, testDb } from './db'
import { newChat, setupCompany } from './gw'
import { formatPhone } from '../../src/lib/phone-crypto'
import { TOURS } from '../../src/lib/tours'

// P7 · na tela: foto do perfil (menu do usuário), troca de e-mail com confirmação pelo link, logotipo da empresa na
// barra superior. B5/B9 · "Mostrar" o telefone completo no detalhe da conversa.

const png = () => sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 200, g: 60, b: 40 } } }).png().toBuffer()

async function enterAs(context: BrowserContext, email: string, password: string) {
  const api = await loginAs(email, password)
  for (const tourId of ['welcome', ...Object.keys(TOURS)]) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  return api
}

async function openProfile(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Menu do usuário' }).click()
  await page.getByRole('menuitem', { name: 'Meu perfil' }).click()
  await expect(page.locator('#profile-name')).toBeVisible({ timeout: 15_000 })
}

test('Meu perfil: enviar foto mostra no menu do usuário; remover volta a inicial', async ({ page, context }) => {
  const { email, password } = await signupOrg({ name: 'Paula Foto' })
  const api = await enterAs(context, email, password)
  await openProfile(page)
  const avatar = page.locator('.usuario .avatar-u img')
  await expect(avatar).toHaveCount(0)

  await page.locator('#profile-avatar-file').setInputFiles({ name: 'eu.png', mimeType: 'image/png', buffer: await png() })
  await expect(page.getByText('Foto atualizada.')).toBeVisible()
  await expect(avatar).toBeVisible()
  await expect(avatar).toHaveAttribute('src', /\/api\/media\/avatar\//)
  await expect.poll(() => avatar.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(256) // carregou de verdade

  // arquivo que não é imagem: mensagem clara, nada muda
  await page.locator('#profile-avatar-file').setInputFiles({ name: 'falso.png', mimeType: 'image/png', buffer: Buffer.from('não sou imagem') })
  await expect(page.getByText(/Envie uma imagem PNG, JPG ou WEBP/)).toBeVisible()

  await page.getByRole('button', { name: 'Remover foto' }).click()
  await expect(page.getByText('Foto removida.')).toBeVisible()
  await expect(avatar).toHaveCount(0)
  await expect(page.locator('.usuario .avatar-u')).toHaveText('P')
  await api.dispose()
})

test('Meu perfil: trocar e-mail fica pendente até abrir o link; a página do link confirma com um clique', async ({ page, context }) => {
  const { email, password } = await signupOrg({ name: 'Edu Email' })
  const api = await enterAs(context, email, password)
  await openProfile(page)
  const novo = `ui.novo.${uid()}@cliente.test`

  await page.locator('#profile-new-email').fill(novo)
  await page.locator('#profile-email-password').fill('senha-errada-123')
  await page.getByRole('button', { name: 'Enviar link de confirmação' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Senha atual incorreta.' })).toBeVisible()

  await page.locator('#profile-email-password').fill(password)
  await page.getByRole('button', { name: 'Enviar link de confirmação' }).click()
  await expect(page.getByRole('status').filter({ hasText: `Aguardando confirmação de ${novo}` })).toBeVisible()
  await expect(page.locator('#profile-email')).toHaveValue(email) // ainda o antigo

  // recarregar mantém o aviso; o link chega ao novo endereço
  await page.reload()
  await openProfile(page)
  await expect(page.getByRole('status').filter({ hasText: novo })).toBeVisible()
  const token = await lastTokenFor(novo)

  // a página do link não confirma sozinha (leitor automático de links): pede o clique
  await page.goto(`/confirm-email?token=${token}`)
  await expect(page.getByRole('heading', { name: 'Confirmar o novo e-mail' })).toBeVisible()
  expect((await testDb.organizationMember.findFirstOrThrow({ where: { email } })).pendingEmail).toBe(novo)
  await page.getByRole('button', { name: 'Confirmar novo e-mail' }).click()
  await expect(page.getByText('E-mail alterado! Use o novo e-mail para entrar.')).toBeVisible()
  expect(await testDb.organizationMember.count({ where: { email: novo } })).toBe(1)

  // de novo o mesmo link: erro claro
  await page.reload()
  await page.getByRole('button', { name: 'Confirmar novo e-mail' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Link inválido ou expirado' })).toBeVisible()
  await api.dispose()
})

test('Configurações › Empresa: logotipo enviado aparece na barra superior no lugar do marcador', async ({ page, context, isMobile }) => {
  const { email, password } = await signupOrg()
  const api = await enterAs(context, email, password)
  // o seletor da empresa na barra superior só aparece em tela larga (> 1280 px); no celular confere só o DOM
  if (!isMobile) await page.setViewportSize({ width: 1440, height: 900 })
  const shown = (l: ReturnType<Page['locator']>) => (isMobile ? expect(l).toBeAttached() : expect(l).toBeVisible())
  await page.goto('/')
  await shown(page.locator('button.org .ponto'))
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-settings"]').click()
  await expect(page.getByRole('heading', { name: 'Logotipo' })).toBeVisible({ timeout: 15_000 })

  await page.locator('#org-logo-file').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await png() })
  await expect(page.getByText('Logotipo atualizado.')).toBeVisible()
  const logo = page.locator('button.org img.org-logo')
  await shown(logo)
  await expect(page.locator('button.org .ponto')).toHaveCount(0)
  await expect.poll(() => logo.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Remover logotipo' }).click()
  await expect(page.getByText('Logotipo removido.')).toBeVisible()
  await shown(page.locator('button.org .ponto'))
  await api.dispose()
})

test('Detalhe da conversa: telefone mascarado até clicar em "Mostrar"', async ({ page, context, isMobile }) => {
  const c = await setupCompany()
  const chat = newChat()
  const digits = chat.split('@')[0]
  await c.send(chat, 'Oi, tem horário amanhã?', { minutes: 5, pushName: 'Cliente Tela' })
  const api = await enterAs(context, c.email, c.password)

  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-conversations"]').click()
  if (isMobile) await page.getByTestId('conversation-cards').getByRole('button').first().click()
  else await page.locator('table tbody tr').first().click()

  const phone = page.getByTestId('contact-phone')
  await expect(phone).toHaveText(`***${digits.slice(-4)}`, { timeout: 20_000 })
  await page.getByRole('button', { name: 'Mostrar telefone completo' }).click()
  await expect(phone).toHaveText(formatPhone(digits))
  await page.getByRole('button', { name: 'Esconder telefone' }).click()
  await expect(phone).toHaveText(`***${digits.slice(-4)}`)
  await api.dispose()
  await c.dispose()
})
