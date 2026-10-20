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
  for (const caminho of ['/', '/conteudos', '/conteudos/vendas-perdidas-whatsapp', '/privacidade', '/termos', '/status', '/login']) {
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
  // prova de que a política vale e de que o vigia enxerga: chamada a um domínio fora da lista é barrada (no-cors: sem a
  // CSP ela passaria, então a falha é da política e não do CORS). O WebKit do Playwright não aplica connect-src (nem no
  // Windows nem no Linux do CI); a prova fica com Chromium e Firefox, e no WebKit valem o cabeçalho e o "nada bloqueado".
  if (browserName === 'webkit') return
  const passou = await page.evaluate(() => fetch('https://example.com/', { mode: 'no-cors' }).then(() => true, () => false))
  expect(passou).toBe(false)
  await expect.poll(async () => (await violacoes()).join(' ')).toMatch(/connect-src|example\.com/)
})

test('scripts só com o nonce da requisição (sem unsafe-inline), nonce novo a cada acesso e isolamento entre origens', async ({ request, page }) => {
  const nonceDe = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1]
  const scriptSrc = (csp: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src ')) || ''
  const nonces: string[] = []
  for (const caminho of ['/', '/', '/conteudos', '/conteudos/vendas-perdidas-whatsapp', '/privacidade']) {
    const res = await request.get(caminho)
    expect(res.status(), caminho).toBe(200)
    const h = res.headers()
    const csp = h['content-security-policy'] || ''
    expect(scriptSrc(csp), caminho).not.toContain("'unsafe-inline'")
    expect(scriptSrc(csp), caminho).toContain("'strict-dynamic'")
    const nonce = nonceDe(csp)
    expect(nonce, caminho).toBeTruthy()
    // os scripts da página carregam o nonce do cabeçalho
    expect(await res.text(), caminho).toContain(`nonce="${nonce}"`)
    nonces.push(nonce!)
    expect(h['cross-origin-opener-policy'], caminho).toBe('same-origin')
    expect(h['cross-origin-embedder-policy'], caminho).toBe('require-corp')
    expect(h['cross-origin-resource-policy'], caminho).toBe('same-site')
  }
  expect(new Set(nonces).size).toBe(nonces.length)
  // o logo vai nos e-mails: pode ser carregado por outro domínio
  expect((await request.get('/brand/favicon.png')).headers()['cross-origin-resource-policy']).toBe('cross-origin')
  // API: CSP sem nonce e sem script inline
  expect(scriptSrc((await request.get('/api/public/status')).headers()['content-security-policy'] || '')).not.toContain("'unsafe-inline'")
  // /login responde o redirecionamento direto, sem a página junto
  const login = await request.get('/login?modo=cadastro', { maxRedirects: 0 })
  expect(login.status()).toBe(307)
  const destino = new URL(login.headers()['location'], 'http://base.invalid') // o Next pode devolver relativo à origem
  expect(destino.pathname + destino.search).toBe('/?modo=cadastro')
  expect((await login.body()).byteLength).toBeLessThan(200) // antes: a página inteira (~11 KB) ia junto
  // script inline sem o nonce, vindo no próprio HTML (como num XSS), é barrado de verdade; os do Next (com o nonce) rodam
  const violacoes = await vigiaCsp(page)
  await page.route('**/privacidade', async (route) => {
    const res = await route.fetch()
    const html = (await res.text()).replace('</body>', '<script>window.__injetado = true</script></body>')
    await route.fulfill({ response: res, body: html })
  })
  await page.goto('/privacidade')
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 })
  expect(await page.evaluate(() => (window as unknown as { __injetado?: boolean }).__injetado)).toBeUndefined()
  await expect.poll(async () => (await violacoes()).join(' ')).toMatch(/script-src/)
  // o WebKit recarrega a página depois do bloqueio: a interceptação ainda pendente não deve derrubar o teste
  await page.unrouteAll({ behavior: 'ignoreErrors' })
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
