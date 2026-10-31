import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { TOURS } from '../../src/lib/tours'
import { createUser, loginAs, STRONG, uid } from './helpers'
import { CRM_VIEWS, crmCompany, enter, openView, settle } from './crm-ui'
import { crmOffAfterFile } from './crm-cleanup'

// F9 · teste de interface por requisito (§ 13.1 da especificação: cada CRM-XX com um teste positivo, um negativo de
// autorização ou dado inválido e um de interface). O que crm.ui.spec.ts e crm-f5.ui.spec.ts já provam (quadro, ganho e
// perda, alerta e recuperação virando tarefa, XSS, temas, larguras) não se repete aqui. Dados inventados.

crmOffAfterFile()

/** Membro convidado e com senha, já logado na API, com os guias marcados como vistos (como em crmCompany). */
async function member(admin: APIRequestContext, role: string) {
  const email = `${role}.${uid()}@cliente.test`
  await createUser(admin, { email, role })
  const api = await loginAs(email, STRONG)
  for (const tourId of ['welcome', ...Object.keys(TOURS)]) await api.patch('/api/tours', { data: { tourId } })
  return api
}

const NAV = (view: string) => `[data-tour="nav-${view}"]`

/** Abre o link direto numa carga nova (de "/" para "/#x" o navegador só troca o #, sem recarregar) e espera o app
 *  consumir o # (page.tsx tira o # do endereço depois de escolher a tela). */
async function deepLink(page: Page, view: string) {
  await page.goto('about:blank')
  await page.goto(`/#${view}`)
  await page.waitForFunction(() => window.location.hash === '', undefined, { timeout: 20000 })
  await settle(page)
}

// T12.04 e CRM-09: o grupo "Comercial" do menu mostra a cada papel só as telas que a API deixa abrir. As permissões são
// as de src/lib/permissions.ts: admin e gestor veem tudo; supervisor e atendente não veem os Ajustes; analista e
// visualizador só a Visão comercial (números agregados); membro não vê o grupo.
const MENU: Record<string, string[]> = {
  admin: CRM_VIEWS.map((v) => v.view),
  gestor: CRM_VIEWS.map((v) => v.view),
  supervisor: ['crm-overview', 'crm-deals', 'crm-contacts', 'crm-companies', 'crm-activities'],
  atendente: ['crm-overview', 'crm-deals', 'crm-contacts', 'crm-companies', 'crm-activities'],
  analista: ['crm-overview'],
  viewer: ['crm-overview'],
  member: [],
}

test('T12.04 · CRM-09 · cada papel vê no menu Comercial só as telas permitidas; link direto para tela proibida volta à Visão geral', async ({ browser, isMobile }) => {
  test.skip(!!isMobile, 'o menu lateral fica aberto só no desktop; a gaveta do celular já é coberta por openView nos outros testes')
  test.setTimeout(240000)
  const c = await crmCompany()
  for (const [role, views] of Object.entries(MENU)) {
    const api = role === 'admin' ? c.admin : await member(c.admin, role)
    const context = await browser.newContext()
    await enter(context, api)
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible({ timeout: 20000 })
    await settle(page)
    const comercial = page.getByRole('navigation', { name: 'Comercial' })
    if (views.length === 0) {
      await expect(comercial, role).toHaveCount(0)
    } else {
      await expect(comercial, role).toBeVisible()
      for (const v of CRM_VIEWS) await expect(page.locator(NAV(v.view)), `${role} · ${v.view}`).toHaveCount(views.includes(v.view) ? 1 : 0)
    }
    // negativo: o link direto (#crm-deals, o mesmo dos e-mails) não abre a tela que o papel não pode ver
    if (!views.includes('crm-deals')) {
      await deepLink(page, 'crm-deals')
      await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible({ timeout: 20000 })
      await expect(page.getByRole('heading', { level: 1, name: 'Negócios' })).toHaveCount(0)
      expect((await api.get('/api/crm/deals')).status(), `${role} · API de negócios`).toBe(403)
    }
    // positivo: o link direto abre a tela permitida
    if (views.includes('crm-overview')) {
      await deepLink(page, 'crm-overview')
      await expect(page.getByRole('heading', { level: 1, name: 'Visão comercial' })).toBeVisible({ timeout: 20000 })
    }
    await context.close()
    if (api !== c.admin) await api.dispose()
  }
  await c.admin.dispose()
})

// CRM-10 e T12.01: na primeira visita a Negócios abre o guia do CRM (e só ele: o boas-vindas já foi visto, então não
// emenda um guia no outro); depois de concluído, não volta ao recarregar. Passo sem alvo na tela (o painel de sugestões
// só existe com sugestão) é pulado pelo próprio guia, e o guia que termina assim fica gravado como visto no servidor.
test('CRM-10 · T12.01 · o guia de Negócios abre na primeira visita, percorre os passos e não volta depois de concluído', async ({ page, context }) => {
  test.setTimeout(150000)
  const c = await crmCompany({ unseen: ['crm-deals'] })
  const r = await c.admin.post('/api/crm/deals', { data: { title: `Negócio do guia ${uid()}` } })
  expect(r.status(), await r.text()).toBe(201)
  await enter(context, c.admin)
  const card = page.getByTestId('tour-card')

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(1500)
  await expect(card, 'na Visão geral nenhum guia abre (todos vistos menos o do CRM)').toHaveCount(0)

  await openView(page, 'crm-deals')
  await expect(page.getByRole('heading', { level: 1, name: 'Negócios' })).toBeVisible()
  await expect(card).toBeVisible({ timeout: 15000 })
  await expect(card).toHaveAttribute('aria-label', 'Comercial')
  await expect(page.getByTestId('tour-step-count')).toHaveText(/^Passo 1 de \d+$/)
  const titles: string[] = []
  const stepText = async () => ((await card.count()) ? ((await page.getByTestId('tour-step-count').textContent().catch(() => '')) ?? '') : 'fim')
  for (let i = 0; i < 10 && (await card.count()) > 0; i++) {
    titles.push((await card.getAttribute('aria-label').catch(() => null)) ?? '')
    const next = card.getByRole('button', { name: /^(Próximo|Concluir)$/ })
    // o botão fica inteiro na tela em todo passo: com o alvo perto do pé da página (o "Mover" do cartão), o cartão do
    // passo vai para cima dele em vez de cair fora da tela
    await expect(next, `passo ${i + 1}`).toBeInViewport({ ratio: 1 })
    const before = await stepText()
    await next.click({ timeout: 5000 })
    await expect.poll(stepText, { timeout: 5000 }).not.toBe(before)
    await page.waitForTimeout(700)
  }
  await expect(card).toHaveCount(0, { timeout: 5000 })
  const seen = async () => ((await (await c.admin.get('/api/tours')).json()).seen as string[]).includes('crm-deals')
  await expect.poll(seen).toBe(true)

  // não volta: recarrega, entra de novo em Negócios e espera mais que os 600 ms do disparo
  await page.reload()
  await openView(page, 'crm-deals')
  await expect(page.getByRole('heading', { level: 1, name: 'Negócios' })).toBeVisible()
  await page.waitForTimeout(2500)
  await expect(card).toHaveCount(0)
  // os passos com alvo na tela, na ordem do guia (src/lib/tours.ts); o de Sugestões não tem alvo sem sugestão
  expect([...new Set(titles.filter(Boolean))].slice(0, 4)).toEqual(['Comercial', 'Novo negócio', 'Quadro de negócios', 'Mudar de etapa'])
  await c.admin.dispose()
})
