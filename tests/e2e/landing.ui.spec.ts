import { test, expect } from '@playwright/test'

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
    const section = page.locator('#precos')
    await expect(section).toBeVisible()
    for (const plan of plans) {
      await expect(section.getByRole('heading', { name: plan.name })).toBeVisible()
      await expect(section).toContainText(`R$ ${plan.monthlyPrice}`)
    }
    // os planos antigos (inventados) não podem aparecer
    const text = await section.innerText()
    for (const fake of ['Starter', 'Profissional', 'Enterprise', 'R$297', 'R$697', 'Sob consulta']) expect(text).not.toContain(fake)
  })

  test('menu do topo leva às seções (Funcionalidades, Preços) — no celular, pelo menu de seções', async ({ page, isMobile }) => {
    const go = async (name: string) => {
      if (isMobile) {
        await page.getByRole('button', { name: 'Seções da página' }).click()
        await page.getByRole('menuitem', { name }).click()
      } else {
        await page.getByRole('button', { name }).click()
      }
    }
    await go('Preços')
    await expect(page.locator('#precos')).toBeInViewport()
    await go('Funcionalidades')
    await expect(page.locator('#funcionalidades')).toBeInViewport()
  })

  test('"Entrar" abre o login e "Começar" abre o cadastro', async ({ page }) => {
    await page.getByRole('button', { name: 'Entrar' }).first().click()
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible()

    await page.goto('/')
    await page.getByRole('button', { name: /Começar Agora/ }).click()
    await expect(page.getByRole('heading', { name: 'Crie a sua conta' })).toBeVisible()
  })

  test('cada plano leva ao cadastro', async ({ page }) => {
    const buttons = page.locator('#precos').getByRole('button')
    await expect(buttons).toHaveCount(3) // os planos chegam por fetch: espera carregar
    for (let i = 0; i < 3; i++) {
      await page.goto('/')
      await expect(page.locator('#precos').getByRole('button')).toHaveCount(3)
      await page.locator('#precos').getByRole('button').nth(i).click()
      await expect(page.getByRole('heading', { name: 'Crie a sua conta' })).toBeVisible()
    }
  })

  test('"Ver Demonstração" entra no painel de demonstração', async ({ page }) => {
    await page.getByRole('button', { name: /Ver Demonstração/ }).click()
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

  test('cartões de plano com a mesma altura e botões alinhados embaixo', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'no celular os cartões ficam empilhados')
    const buttons = page.locator('#precos').getByRole('button')
    await expect(buttons).toHaveCount(3)
    const boxes = await Promise.all([0, 1, 2].map((i) => buttons.nth(i).boundingBox()))
    const bottoms = boxes.map((b) => Math.round(b!.y + b!.height))
    expect(Math.max(...bottoms) - Math.min(...bottoms), `botões desalinhados: ${bottoms}`).toBeLessThanOrEqual(2)
    const cards = page.locator('#precos [data-slot="card"]')
    const heights = await Promise.all([0, 1, 2].map(async (i) => Math.round((await cards.nth(i).boundingBox())!.height)))
    expect(Math.max(...heights) - Math.min(...heights), `alturas diferentes: ${heights}`).toBeLessThanOrEqual(2)
  })

  test('sem barra de rolagem horizontal e sem texto vazando (layout)', async ({ page }, info) => {
    const deviceWidth = page.viewportSize()!.width
    const overflow = await page.evaluate((w) => document.documentElement.scrollWidth - w, deviceWidth)
    expect(overflow, 'a página é mais larga que a tela').toBeLessThanOrEqual(0)
    await page.screenshot({ path: `test-results/screens/landing-${info.project.name}.png`, fullPage: true })
  })
})
