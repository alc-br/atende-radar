import { test, expect } from '@playwright/test'
import { signupOrg } from './helpers'
import { enter, home, openView } from './ui'

// Ajustes de 16/10/2026 a partir do teste grátis feito pelo dono:
// guia rápido com destaque visível e sem emendar o guia da tela no boas-vindas; treinamento (Tour pelo sistema) em
// destaque na Visão Geral com as aulas feitas; Planos sem guia automático e com "Assinar" no cartão do plano atual;
// "Adicionar membro" explica cada função; senha nova com mínimo de 8 caracteres.

test.describe('teste grátis: primeiros minutos', () => {
  test('boas-vindas até o fim: destaque visível, passo numa linha e o guia da Visão Geral não abre em seguida', async ({ page, context, isMobile }) => {
    test.skip(!!isMobile, 'no celular o cartão do guia fica ancorado embaixo; o fluxo é o mesmo')
    const { email, password } = await signupOrg()
    await enter(context, email, password, { tours: false })
    await page.goto('/')
    const card = page.getByTestId('tour-card')
    await expect(card).toBeVisible({ timeout: 20000 })
    await expect(card).toContainText(/Bem-vindo/)

    // anel do destaque (branco + verde) sobre o alvo e "Passo X de N" numa linha só
    const spot = page.getByTestId('tour-spot')
    await expect(spot).toBeVisible()
    expect(await spot.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgb(22, 180, 104)')
    const passo = page.getByTestId('tour-step-count')
    const altura = (await passo.boundingBox())!.height
    expect(altura).toBeLessThan(22)

    for (let i = 0; i < 12; i++) {
      const concluir = card.getByRole('button', { name: 'Concluir' })
      if (await concluir.isVisible().catch(() => false)) { await concluir.click(); break }
      const antes = await passo.textContent()
      await card.getByRole('button', { name: 'Próximo' }).click()
      await expect(passo).not.toHaveText(antes!)
      expect((await passo.boundingBox())!.height).toBeLessThan(22)
    }
    await expect(card).toHaveCount(0)
    await page.waitForTimeout(2500) // o guia da tela abriria ~600 ms depois
    await expect(card).toHaveCount(0)

    // a Visão Geral chama para o treinamento, com as aulas feitas
    const treino = page.getByTestId('training-banner')
    await expect(treino).toBeVisible({ timeout: 15000 })
    await expect(treino).toContainText('equipe')
    await expect(treino.getByTestId('training-count')).toHaveText(/^0 de \d+ aulas concluídas$/)
    await treino.getByRole('button', { name: 'Ver as aulas' }).click()
    await expect(page.locator('main').getByRole('heading', { name: 'Treinamento do sistema' })).toBeVisible()

    // Planos: sem guia automático; no teste grátis, "Assinar" fica no próprio cartão do plano atual
    await openView(page, 'plans', false)
    await expect(page.getByTestId('current-plan')).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(2000)
    await expect(card).toHaveCount(0)
    const cta = page.getByTestId('subscribe-cta')
    const online = (await page.getByTestId('plans-cycle').count()) > 0
    if (online) {
      await expect(cta).toContainText(/teste/)
      await expect(cta.getByRole('button', { name: /^Assinar o plano/ })).toBeVisible()
      // Mensal | Anual: o selo "2 meses grátis" fica dentro do botão Anual
      const anual = page.getByTestId('plans-cycle').getByRole('radio', { name: /Anual/ })
      const selo = anual.locator('.ciclo-seg__selo')
      const [a, b] = [(await anual.boundingBox())!, (await selo.boundingBox())!]
      expect(b.x + b.width).toBeLessThanOrEqual(a.x + a.width + 0.5)
      expect(b.y + b.height).toBeLessThanOrEqual(a.y + a.height + 0.5)
      await anual.click()
      await expect(anual).toHaveAttribute('aria-checked', 'true')
      // sem assinatura paga não há cancelamento nem reembolso na tela
      await expect(page.getByTestId('cancel-subscription-hint')).toHaveCount(0)
      await cta.getByRole('button', { name: /^Assinar o plano/ }).click()
      await expect(page.locator('main').getByRole('heading', { name: 'Contratar plano' })).toBeVisible()
    }
  })

  test('"Adicionar membro" explica o que cada função acessa', async ({ page, context, isMobile }) => {
    const { email, password } = await signupOrg()
    await enter(context, email, password)
    await home(page)
    await openView(page, 'members', !!isMobile)
    await page.locator('main').getByRole('button', { name: 'Adicionar membro' }).click()
    const dialog = page.getByRole('dialog', { name: 'Adicionar membro' })
    const desc = dialog.getByTestId('role-description')
    await expect(desc).toContainText('Membro:')
    await dialog.getByRole('combobox', { name: 'Função' }).click()
    await page.getByRole('option', { name: 'Atendente' }).click()
    await expect(desc).toContainText('Atendente:')
    await expect(desc).toContainText('conversas')
    await dialog.getByRole('button', { name: 'O que é cada função?' }).click()
    await expect(page.getByText('Acesso total: conexões do WhatsApp')).toBeVisible()
  })

  test('senha nova aceita 8 caracteres (o navegador não barra em 10)', async ({ page, context }) => {
    const { email, password } = await signupOrg()
    await enter(context, email, password)
    await page.goto('/')
    await page.getByRole('button', { name: 'Menu do usuário' }).click()
    await page.getByRole('menuitem', { name: 'Meu perfil' }).click()
    const campo = page.locator('#profile-new-password')
    await expect(campo).toBeVisible({ timeout: 15_000 })
    await expect(campo).toHaveAttribute('minlength', '8')
  })
})
