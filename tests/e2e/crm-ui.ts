import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { TOURS } from '../../src/lib/tours'
import { loginAs, signupOrg } from './helpers'

// Apoio dos testes de interface do CRM comercial: empresa nova com o CRM ligado pelo operador (o mesmo PATCH do Admin),
// guias já vistos, navegação pelo menu e a varredura de acessibilidade (axe), como em a11y.ui.spec.ts.

export const CRM_VIEWS = [
  { view: 'crm-overview', h1: 'Visão comercial' },
  { view: 'crm-deals', h1: 'Negócios' },
  { view: 'crm-contacts', h1: 'Contatos' },
  { view: 'crm-companies', h1: 'Empresas' },
  { view: 'crm-activities', h1: 'Tarefas' },
  { view: 'crm-settings', h1: 'Ajustes do CRM' },
] as const

/** Empresa nova (dona = administradora), guias marcados como vistos (menos os de `unseen`) e, por padrão, o CRM ligado
 *  pelo operador. */
export async function crmCompany(opts: { crm?: boolean; unseen?: string[] } = {}) {
  const { email, password } = await signupOrg()
  const admin = await loginAs(email, password)
  const me = await (await admin.get('/api/me')).json()
  for (const tourId of ['welcome', ...Object.keys(TOURS)]) {
    if (!opts.unseen?.includes(tourId)) await admin.patch('/api/tours', { data: { tourId } })
  }
  if (opts.crm !== false) {
    const operator = await loginAs('platform@test.local')
    expect((await operator.patch(`/api/admin/organizations/${me.organizationId}/crm`, { data: { enabled: true } })).status()).toBe(200)
    await operator.dispose()
  }
  return { admin, email, password, orgId: me.organizationId as string, memberId: me.member.id as string }
}

/** O navegador entra com a mesma sessão da API. */
export async function enter(context: BrowserContext, api: APIRequestContext) {
  await context.addCookies((await api.storageState()).cookies)
}

/** Abre uma tela pelo menu lateral; em tela estreita, pelo "Abrir menu". Espera o painel carregar antes. */
export async function openView(page: Page, view: string) {
  const menu = page.getByRole('button', { name: 'Abrir menu' })
  const item = page.locator(`[data-tour="nav-${view}"]`)
  // até 1024 px o menu é uma gaveta fora da tela, mas o Playwright a conta como visível: decide pela largura. O botão
  // é esperado (não só consultado) porque um diálogo ou menu que acabou de fechar ainda deixa o resto da página
  // aria-hidden por um instante, e aí o getByRole não o acha. Ele alterna a gaveta: só clica se ela estiver fechada.
  if ((page.viewportSize()?.width ?? 1280) <= 1024) {
    await expect(menu).toBeVisible({ timeout: 20000 })
    if ((await menu.getAttribute('aria-expanded')) !== 'true') await menu.click()
  } else {
    await expect(item).toBeVisible({ timeout: 20000 })
  }
  await item.click()
}

/** Espera a tela assentar (rede parada e animações de entrada) antes de medir ou fotografar. */
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(400)
}

/** Problemas CRÍTICOS e SÉRIOS do axe (WCAG 2.1 A/AA); o relatório completo vai para test-results/a11y. */
export async function audit(page: Page, label: string, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  if (include) builder.include(include)
  const results = await builder.analyze()
  const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  mkdirSync('test-results/a11y', { recursive: true })
  writeFileSync(
    `test-results/a11y/${label.replace(/[^a-z0-9-]/gi, '_')}.json`,
    JSON.stringify(results.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 12).map((n) => ({ target: n.target, html: (n.html || '').slice(0, 260) })) })), null, 2),
  )
  return bad.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} elemento(s), ex.: ${JSON.stringify(v.nodes[0]?.target)}`)
}

/** Quantos pixels a página passa da largura da janela (rolagem lateral da página inteira). */
export const pageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
