import { test, expect, type Page } from '@playwright/test'
import { loginAs, signupOrg } from './helpers'

// Política de conteúdo (CSP): o cabeçalho vai em todas as páginas e nenhuma página do site ou do painel tem algo
// bloqueado por ela (script, estilo, imagem, fonte ou chamada de rede). O token do cartão no Pagar.me, que também
// passa pela CSP, é provado no billing-checkout.

async function vigiaCsp(page: Page) {
  const violacoes: string[] = []
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const w = window as unknown as { __csp?: string[] }
      ;(w.__csp ||= []).push(`${e.effectiveDirective} bloqueou ${e.blockedURI || '(inline)'}`)
    })
  })
  page.on('console', (m) => {
    if (/Content[- ]Security[- ]Policy|Refused to (load|connect|execute|apply|frame)/i.test(m.text())) violacoes.push(m.text())
  })
  return async () => [...violacoes, ...((await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp)) || [])]
}

test('site: CSP em todas as páginas e nada bloqueado', async ({ page, browserName }) => {
  test.setTimeout(180_000) // em dev cada página compila na primeira visita
  const violacoes = await vigiaCsp(page)
  for (const caminho of ['/', '/conteudos', '/conteudos/vendas-perdidas-whatsapp', '/privacidade', '/termos', '/login']) {
    const res = await page.goto(caminho)
    expect(res?.status(), caminho).toBe(200)
    const csp = res!.headers()['content-security-policy'] || ''
    expect(csp, caminho).toContain("default-src 'self'")
    expect(csp, caminho).toContain("frame-ancestors 'none'")
    expect(csp, caminho).toContain("object-src 'none'")
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(500) // deixa imagens, fontes e efeitos carregarem
    expect(await violacoes(), caminho).toEqual([])
  }
  // prova de que a política vale e de que o vigia enxerga: chamada a um domínio fora da lista é barrada
  // (o WebKit do Playwright no Windows não aplica connect-src; no Linux, onde o CI roda, a prova vale)
  if (browserName === 'webkit' && process.platform === 'win32') return
  const passou = await page.evaluate(() => fetch('https://example.com/').then(() => true, () => false))
  expect(passou).toBe(false)
  await expect.poll(async () => (await violacoes()).join(' ')).toMatch(/connect-src|example\.com/)
})

test('painel: todas as telas do menu abrem sem nada bloqueado pela CSP', async ({ page, context, isMobile }) => {
  test.skip(!!isMobile, 'o menu lateral é o do desktop; o conteúdo das telas é o mesmo')
  test.setTimeout(240_000)
  const { email, password } = await signupOrg()
  const api = await loginAs(email, password)
  for (const tourId of ['welcome', 'dashboard', 'connections', 'members', 'plans', 'alerts', 'reports', 'settings', 'conversations'])
    await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()

  const violacoes = await vigiaCsp(page)
  const res = await page.goto('/')
  expect(res!.headers()['content-security-policy']).toContain("connect-src 'self' https://api.pagar.me")
  const itens = page.locator('nav.nav-lateral a[data-tour^="nav-"]')
  await expect(itens.first()).toBeVisible({ timeout: 45_000 })
  const telas = await itens.evaluateAll((as) => as.map((a) => a.getAttribute('data-tour')!))
  expect(telas.length).toBeGreaterThan(4)
  for (const tela of telas) {
    await page.locator(`nav.nav-lateral a[data-tour="${tela}"]`).click()
    await expect(page.locator(`nav.nav-lateral a[data-tour="${tela}"][aria-current="page"]`)).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(800) // a tela busca os dados dela
    expect(await violacoes(), tela).toEqual([])
  }
})
