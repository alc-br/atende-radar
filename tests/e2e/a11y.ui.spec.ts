import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loginAs, signupOrg } from './helpers'
import { mkdirSync, writeFileSync } from 'node:fs'

// D4 · Acessibilidade automática (axe) e temas: claro e escuro, em telas-chave.
// Falha em problemas CRÍTICOS e SÉRIOS (rótulo ausente, contraste, nome de botão, etc.); o relatório completo vai para test-results.
const VIEWS = ['dashboard', 'alerts', 'conversations', 'recovery', 'team', 'reports', 'connections', 'settings', 'members', 'teams', 'plans']
const TOUR_IDS = ['welcome', ...VIEWS]

async function authenticate(context: BrowserContext, email: string, password: string) {
  const api = await loginAs(email, password)
  for (const tourId of TOUR_IDS) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
}

async function open(page: Page, view: string, isMobile: boolean) {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator(`[data-tour="nav-${view}"]`).click()
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(400)
}

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  mkdirSync('test-results/a11y', { recursive: true })
  writeFileSync(`test-results/a11y/${label.replace(/[^a-z0-9-]/gi, '_')}.json`, JSON.stringify(results.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 12).map((n) => ({ target: n.target, html: (n.html || '').slice(0, 260), data: (n.any?.[0]?.data ? JSON.stringify({ fg: n.any[0].data.fgColor, bg: n.any[0].data.bgColor, ratio: n.any[0].data.contrastRatio, size: n.any[0].data.fontSize }) : undefined) })) })), null, 2))
  return bad.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} elemento(s), ex.: ${JSON.stringify(v.nodes[0]?.target)}`)
}

test.describe('Acessibilidade e temas', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`telas do sistema em tema ${theme}: sem violações críticas/sérias de acessibilidade`, async ({ page, context, isMobile }, info) => {
      test.setTimeout(300000)
      await context.addInitScript((t) => window.localStorage.setItem('theme', t), theme)
      await authenticate(context, 'admin.a@test.local', 'demo123')
      const problems: string[] = []
      for (const view of VIEWS) {
        await open(page, view, !!isMobile)
        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
        expect(isDark, `tema ${theme} não foi aplicado`).toBe(theme === 'dark')
        for (const p of await audit(page, `${info.project.name}-${theme}-${view}`)) problems.push(`[${view}] ${p}`)
        await page.screenshot({ path: `test-results/screens/${theme}-${info.project.name}-${view}.png`, fullPage: true })
      }
      expect(problems, problems.join('\n')).toEqual([])
    })
  }

  test('página de vendas e login: sem violações críticas/sérias', async ({ page }, info) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const landing = await audit(page, `${info.project.name}-landing`)
    await page.getByRole('button', { name: 'Entrar' }).first().click()
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible()
    const login = await audit(page, `${info.project.name}-login`)
    expect([...landing.map((x) => `[landing] ${x}`), ...login.map((x) => `[login] ${x}`)]).toEqual([])
  })

  test('telas de detalhe (conversa, atendente) e diálogo: sem violações críticas/sérias', async ({ page, context, isMobile }, info) => {
    test.setTimeout(180000)
    await authenticate(context, 'admin.a@test.local', 'demo123')
    const problems: string[] = []

    await open(page, 'conversations', !!isMobile)
    if (isMobile) await page.getByTestId('conversation-cards').getByRole('button').first().click()
    else await page.locator('table tbody tr').first().click()
    await expect(page.getByRole('button', { name: 'Privacidade do cliente' })).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(400)
    for (const p of await audit(page, `${info.project.name}-conversation-detail`)) problems.push(`[detalhe da conversa] ${p}`)

    await open(page, 'team', !!isMobile)
    await page.locator('[data-tour="team-table"] tbody tr').first().click()
    await expect(page.locator('main h1')).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(400)
    for (const p of await audit(page, `${info.project.name}-agent-profile`)) problems.push(`[perfil do atendente] ${p}`)

    await open(page, 'members', !!isMobile)
    await page.getByRole('button', { name: 'Adicionar membro' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    // espera a animação de entrada terminar: durante o fade-in o axe mede o texto misturado com o fundo escuro atrás
    await page.getByRole('dialog').evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))
    await page.waitForTimeout(250)
    for (const p of await audit(page, `${info.project.name}-dialog-member`)) problems.push(`[diálogo adicionar membro] ${p}`)
    await page.keyboard.press('Escape')

    expect(problems, problems.join('\n')).toEqual([])
  })

  test('conta nova (vazia): telas sem violações críticas/sérias', async ({ page, context, isMobile }, info) => {
    test.setTimeout(300000)
    const { email, password } = await signupOrg()
    await authenticate(context, email, password)
    const problems: string[] = []
    for (const view of ['dashboard', 'alerts', 'connections', 'members', 'plans']) {
      await open(page, view, !!isMobile)
      for (const p of await audit(page, `${info.project.name}-vazia-${view}`)) problems.push(`[${view}] ${p}`)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })
})
