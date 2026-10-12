import { test, expect, type Page } from '@playwright/test'

// No celular/tablet estreito o "Entrar" fica dentro do menu do topo ("Abrir menu").
async function clickEntrar(page: Page) {
  const entrar = page.locator('header').getByRole('link', { name: 'Entrar', exact: true })
  if (!(await entrar.first().isVisible())) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await entrar.filter({ visible: true }).first().click()
}

const ctaPlanos = (page: Page) => page.locator('#planos').getByRole('link', { name: 'Começar teste grátis' })

// V1–V7 · Página de vendas: nada inventado, preços reais, todo botão faz alguma coisa, sem quebra de layout.
test.describe('Página de vendas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('não exibe números, selos ou depoimentos inventados', async ({ page }) => {
    const text = await page.locator('body').innerText()
    const FORBIDDEN: RegExp[] = [/\+\s?500/, /\+\s?2\s?M/i, /R\$\s?15\s?M/i, /4[.,]9\s?★/, /#\s?1\b/, /milh[õo]es/i, /mais de 500/i]
    for (const re of FORBIDDEN) expect(text, `texto proibido: ${re}`).not.toMatch(re)
  })

  test('mostra os planos reais do banco, com os preços certos', async ({ page, request }) => {
    const { plans } = await (await request.get('/api/public/plans')).json()
    const section = page.locator('#planos')
    await expect(section).toBeVisible()
    for (const plan of plans) {
      await expect(section.getByRole('heading', { name: plan.name })).toBeVisible()
      await expect(section).toContainText(`R$${plan.monthlyPrice.toLocaleString('pt-BR')}/mês`)
    }
    // os planos antigos (inventados) não podem aparecer
    const text = await section.innerText()
    for (const fake of ['Starter', 'Profissional', 'Enterprise', 'R$297', 'R$697', 'Sob consulta']) expect(text).not.toContain(fake)
  })

  test('anual mostra o preço anual do banco dividido por 12 e o total cobrado no ano', async ({ page, request }) => {
    const { plans } = await (await request.get('/api/public/plans')).json()
    const section = page.locator('#planos')
    await expect(ctaPlanos(page)).toHaveCount(plans.length)
    await section.getByRole('button', { name: /Anual/ }).click()
    for (const plan of plans) {
      await expect(section).toContainText(`R$${Math.round(plan.annualPrice / 12).toLocaleString('pt-BR')}/mês`)
      await expect(section).toContainText(`R$ ${plan.annualPrice.toLocaleString('pt-BR')} cobrados por ano`)
    }
  })

  test('menu do topo leva às seções (Como funciona, Planos) — em telas estreitas, pelo botão "Abrir menu"', async ({ page }) => {
    const menuButton = page.getByRole('button', { name: 'Abrir menu' })
    const go = async (name: string) => {
      if (await menuButton.isVisible()) await menuButton.click()
      await page.locator('#menu').getByRole('link', { name }).click()
    }
    await go('Planos')
    await expect(page.locator('#planos')).toBeInViewport()
    await go('Como funciona')
    await expect(page.locator('#como-funciona')).toBeInViewport()
  })

  test('"Entrar" abre o login; "Começar teste grátis" e "Descobrir o que estou perdendo" abrem o cadastro', async ({ page }) => {
    await clickEntrar(page)
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible()

    await page.goto('/')
    await page.locator('header').getByRole('link', { name: /Começar teste grátis/ }).click()
    await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible()

    await page.goto('/')
    await page.getByRole('link', { name: /Descobrir o que estou perdendo/ }).click()
    await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible()
  })

  test('FAQ abre um item por vez', async ({ page }) => {
    const faq = page.locator('.faq details')
    await faq.nth(0).locator('summary').click()
    await faq.nth(1).locator('summary').click()
    await expect(faq.nth(1)).toHaveAttribute('open', '')
    await expect(faq.nth(0)).not.toHaveAttribute('open', '')
  })

  test('cada plano leva ao cadastro', async ({ page }) => {
    await expect(ctaPlanos(page)).toHaveCount(3) // os planos chegam por fetch: espera carregar
    for (let i = 0; i < 3; i++) {
      await page.goto('/')
      await expect(ctaPlanos(page)).toHaveCount(3)
      await ctaPlanos(page).nth(i).click()
      await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible()
    }
  })

  test('"Explorar o painel de demonstração" entra no painel de demonstração', async ({ page }) => {
    await page.getByRole('button', { name: /Explorar o painel de demonstração/i }).click()
    await expect(page.getByText('Visão Geral').first()).toBeVisible({ timeout: 20000 })
  })

  test('rodapé sem botões mortos, com o ano atual, artigos e páginas legais', async ({ page }) => {
    const footer = page.locator('footer')
    for (const [name, href] of [['Artigos', '/conteudos'], ['Política de Privacidade', '/privacidade'], ['Termos de Uso', '/termos']]) {
      await expect(footer.getByRole('link', { name })).toHaveAttribute('href', href)
    }
    // artigos só no rodapé, não no menu do topo
    await expect(page.locator('#menu').getByRole('link', { name: /Conteúdos|Artigos/ })).toHaveCount(0)
    await expect(footer).toContainText(String(new Date().getFullYear()))
    // todo botão/link do rodapé precisa levar a algum lugar
    const clickable = footer.locator('button, a')
    for (let i = 0; i < (await clickable.count()); i++) {
      const el = clickable.nth(i)
      const tag = await el.evaluate((n) => n.tagName)
      if (tag === 'A') expect(await el.getAttribute('href'), `link sem destino: ${await el.innerText()}`).toBeTruthy()
      else throw new Error(`botão sem ação no rodapé: "${await el.innerText()}"`)
    }
  })

  // No design, o plano em destaque é um pouco maior e fica centralizado na linha;
  // os comuns têm a mesma altura, e em todos o botão fica no fim do cartão.
  test('cartões de plano comuns com a mesma altura, destaque centralizado e botões no fim do cartão', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'no celular os cartões ficam empilhados')
    await expect(ctaPlanos(page)).toHaveCount(3)
    const cards = page.locator('#planos .plano')
    const info = await Promise.all([0, 1, 2].map(async (i) => {
      const card = cards.nth(i)
      const box = (await card.boundingBox())!
      const btn = (await card.getByRole('link').boundingBox())!
      const highlight = await card.evaluate((n) => n.classList.contains('plano--destaque'))
      return { highlight, height: Math.round(box.height), center: Math.round(box.y + box.height / 2), btnGap: Math.round(box.y + box.height - (btn.y + btn.height)) }
    }))
    const heights = info.filter((c) => !c.highlight).map((c) => c.height)
    expect(Math.max(...heights) - Math.min(...heights), `alturas diferentes: ${heights}`).toBeLessThanOrEqual(2)
    const centers = info.map((c) => c.center)
    expect(Math.max(...centers) - Math.min(...centers), `cartões fora do centro da linha: ${centers}`).toBeLessThanOrEqual(2)
    const gaps = info.map((c) => c.btnGap)
    expect(Math.max(...gaps) - Math.min(...gaps), `botões fora do fim do cartão: ${gaps}`).toBeLessThanOrEqual(8)
  })

  test('sem barra de rolagem horizontal e sem texto vazando (layout)', async ({ page }, info) => {
    const deviceWidth = page.viewportSize()!.width
    const overflow = await page.evaluate((w) => document.documentElement.scrollWidth - w, deviceWidth)
    expect(overflow, 'a página é mais larga que a tela').toBeLessThanOrEqual(0)
    await page.screenshot({ path: `test-results/screens/landing-${info.project.name}.png`, fullPage: true })
  })
})

// SEO: a página de vendas que o site serve em "/" (rota /inicio) já vem com o texto e os preços no HTML, sem JavaScript.
test.describe('Página de vendas renderizada no servidor', () => {
  test('HTML tem título, descrição, canônico, dados estruturados, texto e preços reais', async ({ request }) => {
    const { plans } = await (await request.get('/api/public/plans')).json()
    const html = await (await request.get('/inicio')).text()
    expect(html).toMatch(/<title>AtendeRadar: auditoria de vendas e atendimento no WhatsApp<\/title>/)
    expect(html).toMatch(/<meta name="description" content="Descubra quantas vendas/)
    expect(html).toMatch(/<link rel="canonical"/)
    expect(html).toContain('application/ld+json')
    expect(html).toContain('Quantas vendas sua empresa perde')
    for (const plan of plans) {
      expect(html).toContain(plan.name)
      expect(html).toContain(`<strong>${plan.monthlyPrice.toLocaleString('pt-BR')}</strong>`)
    }
    expect(html).toContain('href="/conteudos"')
  })

  test('sem JavaScript, o conteúdo fica visível e os planos aparecem', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false })
    const page = await ctx.newPage()
    await page.goto('/inicio')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('#planos .plano')).toHaveCount(3)
    await expect(page.locator('#duvidas')).toBeVisible()
    await ctx.close()
  })
})
