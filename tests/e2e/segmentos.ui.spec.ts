import { test, expect } from '@playwright/test'
import { SEGMENTS } from '../../src/lib/segments'

// Páginas de anúncio por segmento (src/app/para/[segmento]): fora do Google, sem menu de saída, e o botão de cadastro
// leva a campanha do anúncio até o app.

for (const s of SEGMENTS) {
  test(`/para/${s.slug}: noindex, sem menu e o cadastro leva a campanha`, async ({ page }) => {
    const res = await page.goto(`/para/${s.slug}?utm_source=google&utm_medium=cpc&utm_campaign=pre_anuncio&gclid=TESTE123&outro=x`)
    expect(res?.status()).toBe(200)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page.locator('h1')).toContainText(s.destaque)
    // nada de menu: os únicos links são o cadastro, o legal do rodapé e as preferências de cookies (abre na própria página)
    await expect(page.locator('nav#menu, .nav')).toHaveCount(0)
    const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))
    for (const h of hrefs) expect(h).toMatch(/^(\/privacidade|\/termos|#preferencias-de-cookies|.*\?modo=cadastro.*)$/)
    const ctas = page.locator('a[data-cta="cadastro"]')
    expect(await ctas.count()).toBeGreaterThanOrEqual(3)
    const url = new URL((await ctas.first().getAttribute('href'))!, page.url())
    expect(Object.fromEntries(url.searchParams)).toEqual({ modo: 'cadastro', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'pre_anuncio', gclid: 'TESTE123' })
    // sem rolagem lateral no celular
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('segmento que não existe: 404', async ({ page }) => {
  expect((await page.goto('/para/padarias'))?.status()).toBe(404)
})
