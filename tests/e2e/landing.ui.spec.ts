import { test, expect, type Page } from '@playwright/test'

// No celular/tablet estreito o "Entrar" fica dentro do menu do topo ("Abrir menu").
async function clickEntrar(page: Page) {
  const entrar = page.getByRole('button', { name: 'Entrar', exact: true })
  if (!(await entrar.first().isVisible())) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await entrar.first().click()
}

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
      await expect(section).toContainText(`R$ ${plan.monthlyPrice}`)
    }
    // os planos antigos (inventados) não podem aparecer
    const text = await section.innerText()
    for (const fake of ['Starter', 'Profissional', 'Enterprise', 'R$297', 'R$697', 'Sob consulta']) expect(text).not.toContain(fake)
  })

  test('menu do topo leva às seções (Como Funciona, Planos) — em telas estreitas, pelo botão "Abrir menu"', async ({ page }) => {
    const menuButton = page.getByRole('button', { name: 'Abrir menu' })
    const go = async (name: string) => {
      if (await menuButton.isVisible()) await menuButton.click()
      await page.locator('#menu').getByRole('link', { name }).click()
    }
    await go('Planos')
    await expect(page.locator('#planos')).toBeInViewport()
    await go('Como Funciona')
    await expect(page.locator('#como-funciona')).toBeInViewport()
  })

  test('"Entrar" abre o login; "Teste Grátis" e "Quero parar de perder receita" abrem o cadastro', async ({ page }) => {
    await clickEntrar(page)
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible()

    await page.goto('/')
    await page.getByRole('button', { name: /Teste Grátis/ }).click()
    await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible()

    await page.goto('/')
    await page.getByRole('button', { name: /Quero parar de perder receita/ }).click()
    await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible()
  })

  test('cada plano leva ao cadastro', async ({ page }) => {
    const buttons = page.locator('#planos').getByRole('button')
    await expect(buttons).toHaveCount(3) // os planos chegam por fetch: espera carregar
    for (let i = 0; i < 3; i++) {
      await page.goto('/')
      await expect(page.locator('#planos').getByRole('button')).toHaveCount(3)
      await page.locator('#planos').getByRole('button').nth(i).click()
      await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible()
    }
  })

  test('"Ver demonstração" entra no painel de demonstração', async ({ page }) => {
    await page.getByRole('button', { name: /Ver demonstração/i }).click()
    await expect(page.getByText('Visão Geral').first()).toBeVisible({ timeout: 20000 })
  })

  test('rodapé sem botões mortos e com o ano atual', async ({ page }) => {
    const footer = page.locator('footer')
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
    await expect(page.locator('#planos').getByRole('button')).toHaveCount(3)
    const cards = page.locator('#planos .plano')
    const info = await Promise.all([0, 1, 2].map(async (i) => {
      const card = cards.nth(i)
      const box = (await card.boundingBox())!
      const btn = (await card.getByRole('button').boundingBox())!
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
