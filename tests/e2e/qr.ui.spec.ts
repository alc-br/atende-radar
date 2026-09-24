import { test, expect } from '@playwright/test'
import { loginAs, uid } from './helpers'
import { gatewayClient } from './gw'

// B5 · QR real: o QR que o serviço do WhatsApp emitiu aparece na tela e a tela percebe quando conecta.
test('Gerar QR mostra o QR do WhatsApp e avisa quando conectar', async ({ page, context, isMobile }) => {
  const admin = await loginAs('admin.a@test.local')
  for (const tourId of ['welcome', 'connections']) await admin.patch('/api/tours', { data: { tourId } })
  const name = `Conexao QR ${uid()}`
  const conn = (await (await admin.post('/api/connections', { data: { name, phoneNumber: '+5511900007777' } })).json()).connection.id as string
  const gw = await gatewayClient()
  await gw.post('/api/gateway/events', { data: { eventId: `qr-${uid()}`, connectionId: conn, type: 'connection.qr', payload: { qr: '2@teste-de-qr-code,abc,def' } } })
  await context.addCookies((await admin.storageState()).cookies)

  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-connections"]').click()

  const card = page.locator('div', { has: page.getByText(name, { exact: true }) }).filter({ has: page.getByRole('button', { name: /Gerar QR/ }) }).last()
  await card.getByRole('button', { name: /Gerar QR/ }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Conectar o WhatsApp' })).toBeVisible()
  await expect(dialog.locator('svg[aria-label="QR Code do WhatsApp"]')).toBeVisible({ timeout: 40000 })
  await expect(dialog).toContainText('Aparelhos conectados')

  // o serviço reporta que o celular leu o QR
  await gw.post('/api/gateway/events', { data: { eventId: `ok-${uid()}`, connectionId: conn, type: 'connection.status', payload: { status: 'connected', phoneNumber: '+5511900007777' } } })
  await expect(dialog.getByText('WhatsApp conectado!')).toBeVisible({ timeout: 40000 })

  await gw.dispose()
  await admin.dispose()
})
