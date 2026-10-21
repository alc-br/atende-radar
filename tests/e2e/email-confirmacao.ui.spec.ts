import { test, expect } from '@playwright/test'
import { signupOrg } from './helpers'
import { enter } from './ui'
import { mailsTo, lastTokenFor } from './db'

// Faixa "Confirme o seu e-mail" (21/10/2026): conta nova sem o e-mail confirmado vê o aviso no painel e pode pedir um
// link novo; depois de confirmar, a faixa some. Quem já confirmou (usuários do seed) não vê nada.
test('conta nova vê a faixa, reenvia o link e, confirmado o e-mail, a faixa some', async ({ page, context }) => {
  test.setTimeout(90_000)
  const { email, password } = await signupOrg()
  await enter(context, email, password)
  await page.goto('/')
  const faixa = page.getByTestId('email-verify-banner')
  await expect(faixa).toBeVisible({ timeout: 30_000 })
  await expect(faixa).toContainText('Confirme o seu e-mail')
  await expect(faixa).toContainText(email)

  expect(await mailsTo(email)).toHaveLength(1) // o do cadastro
  const primeiro = await lastTokenFor(email)
  await faixa.getByRole('button', { name: 'Reenviar e-mail' }).click()
  await expect(faixa.getByRole('button', { name: 'E-mail enviado' })).toBeDisabled()
  await expect.poll(async () => (await mailsTo(email)).length).toBe(2)
  const novo = await lastTokenFor(email)
  expect(novo).not.toBe(primeiro)

  // o link antigo deixou de valer; o novo confirma
  expect((await page.request.post('/api/auth/verify-email', { data: { token: primeiro } })).status()).toBe(400)
  expect((await page.request.post('/api/auth/verify-email', { data: { token: novo } })).status()).toBe(200)
  await page.reload()
  await expect(page.locator('main').getByRole('heading', { name: /Vis[ãa]o Geral/i }).first()).toBeVisible({ timeout: 30_000 })
  await expect(faixa).toHaveCount(0)
  // já confirmado: pedir de novo não manda nada
  expect(await (await page.request.post('/api/profile/verify-email')).json()).toMatchObject({ alreadyVerified: true })
  expect(await mailsTo(email)).toHaveLength(2)
})

test('reenvio tem limite: 3 por hora', async ({ context, page }) => {
  const { email, password } = await signupOrg()
  await enter(context, email, password)
  for (let i = 0; i < 3; i++) expect((await page.request.post('/api/profile/verify-email')).status()).toBe(200)
  const res = await page.request.post('/api/profile/verify-email')
  expect(res.status()).toBe(429)
  expect((await res.json()).error).toContain('spam')
})

test('quem já confirmou o e-mail não vê a faixa', async ({ context, page }) => {
  await enter(context, 'admin.a@test.local')
  await page.goto('/')
  await expect(page.locator('main').getByRole('heading', { name: /Vis[ãa]o Geral/i }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('email-verify-banner')).toHaveCount(0)
})
