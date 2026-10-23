import { test, expect, type Page } from '@playwright/test'
import { STRONG, uid } from './helpers'
import { testDb } from './db'
import { gtmSnippet } from '../../src/lib/gtm'

// Aviso de cookies (Consent Mode v2 + LGPD) e eventos do dataLayer (docs/operacao/medicao.md).
// Começa SEM escolha (os outros testes já vêm com "recusado": consent-state.ts).
test.use({ storageState: { cookies: [], origins: [] } })

const GTM = 'GTM-P43TS3SF'
// cookies de terceiros que as tags gravam (Google Analytics, Google Ads, Meta)
const TERCEIROS = /^(_ga|_gid|_gat|_gcl|_fbp|_fbc|_uet|IDE|test_cookie)/

// Tudo que o dataLayer recebe, guardado no sessionStorage (sobrevive à navegação depois do cadastro)
async function gravaDataLayer(page: Page) {
  await page.addInitScript(() => {
    const dl: unknown[] = ((window as unknown as { dataLayer?: unknown[] }).dataLayer ||= [])
    const push = dl.push.bind(dl)
    dl.push = (...items: unknown[]) => {
      try {
        const saved = JSON.parse(sessionStorage.getItem('__dl') || '[]')
        sessionStorage.setItem('__dl', JSON.stringify([...saved, ...items.map((i) => JSON.parse(JSON.stringify(i)))]))
      } catch {
        // sem sessionStorage: o teste falha nas conferências
      }
      return push(...items)
    }
  })
  return async () => JSON.parse((await page.evaluate(() => sessionStorage.getItem('__dl'))) || '[]') as Record<string, unknown>[]
}

// gtag() empurra o objeto arguments: vira {"0": "consent", "1": "update", "2": {...}}
const consentCalls = (dl: Record<string, unknown>[], kind: 'default' | 'update') => dl.filter((i) => i['0'] === 'consent' && i['1'] === kind).map((i) => i['2'] as Record<string, string>)

test('recusar: padrão negado antes do GTM, o GTM carrega e nenhum cookie de terceiro é gravado', async ({ page, context }) => {
  test.setTimeout(90_000)
  // nenhuma coleta sai do teste (as tags do contêiner real, se houver, ficam sem rede)
  await context.route(/google-analytics\.com|analytics\.google\.com|doubleclick\.net|googleadservices\.com|facebook\.com|facebook\.net/, (r) => r.abort())
  // o servidor de testes roda sem GTM_ID: roda o snippet do layout logo depois do HTML (o padrão do <head> já rodou),
  // com o nonce da página, para provar com o contêiner real
  await page.addInitScript({ content: `document.addEventListener('DOMContentLoaded',function(){${gtmSnippet(GTM)}})` })
  const dataLayer = await gravaDataLayer(page)
  await page.goto('/inicio')
  const aviso = page.getByTestId('aviso-cookies')
  await expect(aviso).toBeVisible({ timeout: 30_000 })
  await expect(aviso.getByRole('button', { name: 'Recusar' })).toBeVisible()
  await expect(aviso.getByRole('button', { name: 'Aceitar todos' })).toBeVisible()
  await expect(aviso.getByRole('button', { name: 'Configurar' })).toBeVisible()
  await expect.poll(() => page.evaluate((id) => !!(window as unknown as { google_tag_manager?: Record<string, unknown> }).google_tag_manager?.[id], GTM), { timeout: 30_000 }).toBe(true)

  const antes = await dataLayer()
  expect(consentCalls(antes, 'default')[0]).toMatchObject({ analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
  // o padrão vem antes do GTM começar
  expect(antes.findIndex((i) => i['1'] === 'default')).toBeLessThan(antes.findIndex((i) => i.event === 'gtm.js'))

  await aviso.getByRole('button', { name: 'Recusar' }).click()
  await expect(aviso).toBeHidden()
  const depois = await dataLayer()
  expect(consentCalls(depois, 'update').at(-1)).toMatchObject({ analytics_storage: 'denied', ad_storage: 'denied' })
  expect(depois.find((i) => i.event === 'consent_update')).toMatchObject({ consent_analytics: 'denied', consent_ads: 'denied' })

  await page.waitForTimeout(2_000) // dá tempo de as tags rodarem
  const cookies = await context.cookies()
  expect(cookies.filter((c) => TERCEIROS.test(c.name)).map((c) => c.name)).toEqual([])
  expect(cookies.every((c) => c.domain.replace(/^\./, '') === '127.0.0.1'), JSON.stringify(cookies.map((c) => c.domain))).toBe(true)
  expect(JSON.parse(decodeURIComponent(cookies.find((c) => c.name === 'ar_consent')!.value))).toMatchObject({ analytics: false, ads: false })

  // a escolha vale nas próximas páginas e pode ser revista pelo rodapé
  await page.goto('/privacidade')
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 })
  await expect(aviso).toBeHidden()
  await page.locator('.rodape').getByRole('button', { name: 'Preferências de cookies' }).click()
  await expect(aviso.getByRole('checkbox', { name: 'Medição' })).not.toBeChecked()
  await expect(aviso.getByRole('button', { name: 'Salvar minhas escolhas' })).toBeVisible()
})

test('aceitar: consentimento atualizado, campanha guardada e o sign_up no dataLayer com o event_id do servidor', async ({ page, context }) => {
  test.setTimeout(120_000)
  await context.route(/google-analytics\.com|analytics\.google\.com|doubleclick\.net|googleadservices\.com|facebook\.com|facebook\.net/, (r) => r.abort())
  const dataLayer = await gravaDataLayer(page)
  await page.goto('/?modo=cadastro&utm_source=google&utm_medium=cpc&utm_campaign=teste-medicao&gclid=teste123')
  const aviso = page.getByTestId('aviso-cookies')
  await expect(aviso).toBeVisible({ timeout: 30_000 })
  // campanha da visita, 90 dias, sem dado pessoal
  const attr = (await context.cookies()).find((c) => c.name === 'ar_attr')
  expect(JSON.parse(decodeURIComponent(attr!.value))).toMatchObject({ utm_source: 'google', utm_campaign: 'teste-medicao', gclid: 'teste123' })
  expect(attr!.expires - Date.now() / 1000).toBeGreaterThan(89 * 86400)

  await aviso.getByRole('button', { name: 'Aceitar todos' }).click()
  await expect(aviso).toBeHidden()
  const dl = await dataLayer()
  expect(consentCalls(dl, 'update').at(-1)).toEqual({ analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' })
  expect(dl.find((i) => i.event === 'consent_update')).toMatchObject({ consent_analytics: 'granted', consent_ads: 'granted' })

  const email = `medicao.${uid()}@test.local`
  await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible({ timeout: 20_000 })
  await page.locator('#signup-name').fill('Pessoa Medição')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(STRONG)
  await page.locator('#signup-org').fill('Empresa Medição')
  await page.locator('#signup-terms').check()
  await page.locator('form button[type="submit"]').click()

  await expect.poll(async () => !!(await testDb.organizationMember.findFirst({ where: { email } })), { timeout: 30_000 }).toBe(true)
  const orgId = (await testDb.organizationMember.findFirstOrThrow({ where: { email } })).organizationId
  await expect.poll(async () => (await dataLayer()).find((i) => i.event === 'sign_up'), { timeout: 30_000 }).toMatchObject({ event_id: `sign_up.${orgId}`, method: 'email' })
  // nada pessoal no dataLayer
  expect(JSON.stringify(await dataLayer())).not.toContain(email)

  // origem gravada na empresa e a conversão do servidor com o mesmo event_id (sem os segredos no teste: meta:sem-id)
  const org = await testDb.organization.findUniqueOrThrow({ where: { id: orgId } })
  expect(JSON.parse(org.attribution!)).toMatchObject({ utm_source: 'google', utm_campaign: 'teste-medicao', gclid: 'teste123', consent: { analytics: true, ads: true } })
  await expect.poll(async () => (await testDb.conversionEvent.findUnique({ where: { id: `sign_up.${orgId}` } }))?.status, { timeout: 20_000 }).toBe('sent')
  const ev = await testDb.conversionEvent.findUniqueOrThrow({ where: { id: `sign_up.${orgId}` } })
  expect(ev.result).toMatch(/^ga4:pelo-navegador meta:(sem-id|ok)$/)
  expect(ev.payload).not.toContain(email)
})
