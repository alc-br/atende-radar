import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createUser, loginAs, STRONG, signupOrg, uid } from './helpers'
import { enter, home, openView } from './ui'

// T5 · Assistente de configuração (7 etapas) continua de onde parou; tours: "Pular" não volta depois de recarregar
// e passo cujo elemento não existe na tela não trava o tour.

const tourCard = (page: Page) => page.getByTestId('tour-card')

async function openOnboarding(page: Page, isMobile: boolean) {
  await home(page)
  await openView(page, 'settings', isMobile)
  await page.getByRole('button', { name: 'Refazer onboarding' }).click()
}
const etapa = (page: Page, n: number) => expect(page.getByText(`Etapa ${n} de 7`, { exact: true })).toBeVisible({ timeout: 15000 })

test.describe('Assistente de configuração', () => {
  test('recarregar a página e voltar ao assistente retoma a etapa e o que já foi preenchido', async ({ page, context, isMobile }) => {
    const { email, password } = await signupOrg()
    await enter(context, email, password)
    await openOnboarding(page, !!isMobile)
    await etapa(page, 1)
    await page.locator('#orgName').fill('Clínica Retomada')
    await page.locator('#orgSegment').selectOption('Saúde')
    await page.getByRole('button', { name: 'Próximo' }).click()
    await etapa(page, 2)
    await page.getByRole('button', { name: 'Próximo' }).click()
    await etapa(page, 3)
    await page.locator('#avgTicket').fill('35000') // máscara de reais: centavos à direita
    await page.locator('#convRate').fill('20')

    await page.reload() // a tela volta para a Visão Geral; o assistente é reaberto por Configurações
    await openOnboarding(page, !!isMobile)
    await etapa(page, 3)
    await expect(page.locator('#avgTicket')).toHaveValue('350,00')
    await expect(page.locator('#convRate')).toHaveValue('20')
    await page.getByRole('button', { name: 'Voltar' }).click()
    await page.getByRole('button', { name: 'Voltar' }).click()
    await etapa(page, 1)
    await expect(page.locator('#orgName')).toHaveValue('Clínica Retomada')
    await expect(page.locator('#orgSegment')).toHaveValue('Saúde')
  })

  test('sem acesso ao armazenamento do navegador o assistente abre normalmente na etapa 1', async ({ page, context, isMobile }) => {
    const { email, password } = await signupOrg()
    await enter(context, email, password)
    await context.addInitScript(() => {
      const fail = () => { throw new Error('armazenamento bloqueado') }
      Object.defineProperty(window, 'localStorage', { configurable: true, get: fail })
    })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await openOnboarding(page, !!isMobile)
    await etapa(page, 1)
    await page.locator('#orgName').fill('Sem armazenamento')
    await page.locator('#orgSegment').selectOption('Outro')
    await page.getByRole('button', { name: 'Próximo' }).click()
    await etapa(page, 2)
    expect(errors.filter((m) => /armazenamento bloqueado/.test(m)), errors.join('\n')).toEqual([])
  })
})

async function newPerson(context: BrowserContext, role: string, seenTours: string[]) {
  const adm = await loginAs('admin.a@test.local')
  const email = `t5.${role}.${uid()}@test.local`
  await createUser(adm, { email, role })
  await adm.dispose()
  const api = await loginAs(email, STRONG)
  for (const tourId of seenTours) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  return api
}

test.describe('Tours', () => {
  test('"Pular tour" no boas-vindas: não aparece de novo depois de recarregar', async ({ page, context }) => {
    const api = await newPerson(context, 'gestor', [])
    await page.goto('/')
    const card = tourCard(page)
    await expect(card).toBeVisible({ timeout: 20000 })
    await expect(card).toContainText(/Boas-vindas/)
    await card.getByRole('button', { name: 'Pular tour' }).click()
    await expect(page.getByText(/Boas-vindas/)).toHaveCount(0)
    await expect.poll(async () => ((await (await api.get('/api/tours')).json()).seen as string[]).includes('welcome')).toBe(true)

    await page.reload()
    await expect(page.locator('main').getByRole('heading', { name: /Vis[ãa]o Geral/i }).first()).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(2500) // o tour abre ~600 ms depois de carregar
    await expect(page.getByText(/Boas-vindas/)).toHaveCount(0)
    await api.dispose()
  })

  test('passo cujo elemento não está na tela (Visão Geral com erro) é pulado e o tour termina sem travar a tela', async ({ page, context, isMobile }) => {
    const api = await newPerson(context, 'gestor', ['welcome'])
    await api.dispose()
    // sem os dados, os cartões que o tour da Visão Geral aponta (indicadores, prioridades, equipe) não existem
    await page.route(/\/api\/dashboard(\?|$)/, (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"falha simulada"}' }))
    await page.goto('/')
    await expect(page.getByRole('alert').filter({ hasText: 'Erro ao carregar a Visão Geral' })).toBeVisible({ timeout: 20000 })

    // o guia da Visão Geral não abre sozinho (é a tela de entrada): abre pelo menu "Tour desta tela"
    const card = tourCard(page)
    await page.waitForTimeout(1500)
    await expect(card).toHaveCount(0)
    await page.locator('[data-tour="header-help"]').click()
    await page.getByRole('menuitem', { name: 'Tour desta tela' }).click()
    // no desktop o 1º passo (seletor de período, no topo) existe; no celular o tour pode já começar pulando passos
    if (!isMobile) await expect(card).toBeVisible({ timeout: 10000 })
    else await page.waitForTimeout(1500)
    for (let i = 0; i < 10 && (await card.count()) > 0; i++) {
      const next = card.getByRole('button', { name: /^(Próximo|Concluir)$/ })
      if (await next.isVisible().catch(() => false)) await next.click().catch(() => {})
      await page.waitForTimeout(600) // passos sem alvo são pulados em ~350 ms
    }
    await expect(card).toHaveCount(0, { timeout: 5000 })

    // a tela continua usável: o menu abre outra tela normalmente
    await openView(page, 'alerts', !!isMobile)
    await expect(page.locator('main').getByRole('heading', { name: 'Alertas', exact: true })).toBeVisible({ timeout: 15000 })
  })
})
