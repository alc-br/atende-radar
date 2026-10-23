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
    // nada de menu: os únicos links são o cadastro, os planos e o legal (em nova aba), o e-mail de contato e as
    // preferências de cookies (abre na própria página)
    await expect(page.locator('nav#menu, .nav')).toHaveCount(0)
    const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))
    for (const h of hrefs) expect(h).toMatch(/^(\/privacidade|\/termos|\/#planos|mailto:[^?]+\?subject=.+|#preferencias-de-cookies|.*\?modo=cadastro.*)$/)
    // o que a agência pediu: preço depois do teste, bloqueio, quem vê as conversas, vídeo, dúvidas e contato
    await expect(page.locator('#t-preco')).toBeVisible()
    await expect(page.locator('.preco-segmento')).toContainText(/R\$\s?\d+ por mês/)
    await expect(page.locator('#t-bloqueio')).toHaveText('Meu número pode ser bloqueado?')
    await expect(page.locator('#t-quem-ve')).toHaveText('Quem vê as conversas?')
    if (s.privacidade) await expect(page.locator('.seguranca-segmento')).toContainText('LGPD')
    await expect(page.locator('video[data-video="demo-20s"]')).toHaveAttribute('preload', 'none')
    expect(await page.locator('[data-faq] details').count()).toBeGreaterThanOrEqual(3)
    await expect(page.locator('a[data-cta="contato"]')).toHaveText('Fale com a gente')
    await expect(page.getByText('As conversas são auditadas')).toHaveCount(0)
    const ctas = page.locator('a[data-cta="cadastro"]')
    expect(await ctas.count()).toBeGreaterThanOrEqual(3)
    const url = new URL((await ctas.first().getAttribute('href'))!, page.url())
    expect(Object.fromEntries(url.searchParams)).toEqual({ modo: 'cadastro', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'pre_anuncio', gclid: 'TESTE123' })
    // sem rolagem lateral no celular
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('eventos do dataLayer: cta_click, faq_open, video_play e video_complete', async ({ page }) => {
  await page.goto('/para/clinicas')
  const eventos = () => page.evaluate(() => ((window as unknown as { dataLayer?: Record<string, unknown>[] }).dataLayer ?? []).filter((e) => typeof e.event === 'string' && /^(cta_click|faq_open|video_)/.test(e.event as string)))
  await page.waitForFunction(() => document.querySelector('[data-faq]') && (window as unknown as { dataLayer?: unknown[] }).dataLayer)
  // o clique no cadastro sairia da página: um ouvinte na janela (roda depois do da página, no documento) segura a navegação
  await page.evaluate(() => window.addEventListener('click', (e) => e.preventDefault(), { once: true }))
  await page.locator('a[data-cta="cadastro"][data-cta-pos="hero"]').click()
  await page.locator('[data-faq] summary').first().click()
  const video = page.locator('video[data-video="demo-20s"]')
  await video.evaluate(async (v: HTMLVideoElement) => { v.muted = true; await v.play() })
  await video.evaluate((v: HTMLVideoElement) => { v.currentTime = Math.max(0, v.duration - 0.3) })
  await page.waitForFunction(() => ((window as unknown as { dataLayer?: { event?: string }[] }).dataLayer ?? []).some((e) => e.event === 'video_complete'), null, { timeout: 15_000 })
  const ev = await eventos()
  expect(ev).toContainEqual(expect.objectContaining({ event: 'cta_click', cta_id: 'cadastro', cta_position: 'hero', page_segment: 'clinicas' }))
  expect(ev).toContainEqual(expect.objectContaining({ event: 'faq_open', page_segment: 'clinicas', faq_question: expect.any(String) }))
  expect(ev).toContainEqual(expect.objectContaining({ event: 'video_play', video_title: 'demo-20s', page_segment: 'clinicas' }))
  expect(ev).toContainEqual(expect.objectContaining({ event: 'video_complete', video_title: 'demo-20s', page_segment: 'clinicas' }))
  expect(ev.filter((e) => e.event === 'video_play')).toHaveLength(1)
})

test('segmento que não existe: 404', async ({ page }) => {
  expect((await page.goto('/para/padarias'))?.status()).toBe(404)
})
