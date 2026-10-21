import { test, expect } from '@playwright/test'
import { loginAs, signupOrg, uid } from './helpers'
import { enter, home, openView } from './ui'
import { gatewayClient } from './gw'
import { downConnections } from '../../src/components/layout/connection-banner'

// Faixa "WhatsApp desconectado" (21/10/2026, teste real do dono): quando um número que já estava conectado cai, todas as
// telas mostram o aviso no topo, com o botão para Conexões. Quando o número volta, a faixa some sozinha.
test('número conectado que cai mostra a faixa vermelha no topo; reconectado, a faixa some', async ({ page, context, isMobile }) => {
  test.setTimeout(120_000)
  const { email, password } = await signupOrg()
  const api = await loginAs(email, password)
  const name = `Recepção ${uid()}`
  const conn = (await (await api.post('/api/connections', { data: { name, phoneNumber: '+5511900005151' } })).json()).connection.id as string
  const gw = await gatewayClient()
  const status = (s: string, reason?: string) =>
    gw.post('/api/gateway/events', { data: { eventId: `st-${uid()}`, connectionId: conn, type: 'connection.status', payload: { status: s, ...(reason ? { reason } : {}), phoneNumber: '+5511900005151' } } })

  // nunca pareado (QR ainda não lido): quem cuida são os "Primeiros passos", não a faixa
  await enter(context, email, password)
  await home(page)
  const faixa = page.getByTestId('connection-banner')
  await page.waitForTimeout(1500)
  await expect(faixa).toHaveCount(0)

  // conectou e depois caiu (o celular desconectou o aparelho)
  expect((await status('connected')).ok()).toBe(true)
  expect((await status('qr_required', 'logged_out')).ok()).toBe(true)
  await page.reload()
  await expect(faixa).toBeVisible({ timeout: 20_000 })
  await expect(faixa).toContainText(`WhatsApp desconectado: ${name} (final 5151)`)
  await expect(faixa).toContainText('parou de receber as conversas')

  // aparece em qualquer tela; o botão leva para Conexões (lá o botão some, a faixa fica)
  await openView(page, 'alerts', !!isMobile)
  await expect(faixa).toBeVisible()
  await faixa.getByRole('button', { name: 'Reconectar' }).click()
  await expect(page.locator('main').getByRole('heading', { name: 'Conexões' })).toBeVisible({ timeout: 15_000 })
  await expect(faixa.getByRole('button', { name: 'Reconectar' })).toHaveCount(0)

  // voltou: a faixa some sem recarregar (a tela confere de novo ao trocar de tela)
  expect((await status('connected')).ok()).toBe(true)
  await openView(page, 'dashboard', !!isMobile)
  await expect(faixa).toHaveCount(0, { timeout: 20_000 })
  await gw.dispose()
  await api.dispose()
})

test('quem entra na faixa: só número que já foi pareado e está fora do ar', () => {
  const c = (status: string, pairedAt: string | null) => ({ id: status, name: status, status, phoneLast4: '1515', pairedAt })
  const p = '2026-10-01T00:00:00Z'
  const down = downConnections([
    c('connected', p), c('paused', p), c('connecting', p), c('syncing', p), c('degraded', p),
    c('qr_required', null), c('disconnected', null),
    c('qr_required', p), c('disconnected', p), c('logged_out', p), c('blocked', p), c('error', p),
  ])
  expect(down.map((d) => d.status)).toEqual(['qr_required', 'disconnected', 'logged_out', 'blocked', 'error'])
})
