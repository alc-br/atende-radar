import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { loginAs, signupOrg } from './helpers'
import { mkdirSync } from 'node:fs'

// D1–D4 · Varredura de design: cada tela, em desktop e celular, com dados e com conta nova vazia.
// Detecta: página mais larga que a tela, elementos vazando para fora, erros de console, chamadas de API com erro.
// Também salva uma captura de cada tela em test-results/screens para revisão visual.

const VIEWS: Array<{ view: string; heading: RegExp }> = [
  { view: 'dashboard', heading: /Vis[ãa]o Geral|Dashboard/i },
  { view: 'alerts', heading: /Alertas/i },
  { view: 'conversations', heading: /Conversas/i },
  { view: 'recovery', heading: /Recupera[çc][ãa]o/i },
  { view: 'team', heading: /Equipe|Desempenho/i },
  { view: 'reports', heading: /Relat[óo]rios/i },
  { view: 'connections', heading: /Conex[õo]es/i },
  { view: 'settings', heading: /Configura[çc][õo]es/i },
  { view: 'members', heading: /Membros/i },
  { view: 'teams', heading: /Equipes/i },
  { view: 'plans', heading: /Planos/i },
]
const TOUR_IDS = ['welcome', ...VIEWS.map((v) => v.view), 'conversation-detail', 'agent-profile', 'notifications']

async function authenticate(context: BrowserContext, email: string, password: string) {
  const api = await loginAs(email, password)
  // marca todos os tours como vistos para o guia não cobrir a tela
  for (const tourId of TOUR_IDS) await api.patch('/api/tours', { data: { tourId } })
  const state = await api.storageState()
  await context.addCookies(state.cookies)
  await api.dispose()
}

async function openView(page: Page, view: string, isMobile: boolean) {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator(`[data-tour="nav-${view}"]`).click()
}

async function sweep(page: Page, label: string, isMobile: boolean, projectName: string) {
  mkdirSync('test-results/screens', { recursive: true })
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`erro de página: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Download the React DevTools/.test(m.text())) problems.push(`console: ${m.text().slice(0, 160)}`)
  })
  page.on('response', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api/') && r.status() >= 400 && r.status() !== 401) problems.push(`API ${r.status()} ${u.pathname}`)
  })

  for (const { view, heading } of VIEWS) {
    problems.length = 0
    await openView(page, view, isMobile)
    await expect.soft(page.locator('main').getByRole('heading', { name: heading }).first(), `${label}/${view}: título da tela`).toBeVisible({ timeout: 15000 })
    await page.waitForLoadState('networkidle').catch(() => {})

    // compara com a largura REAL do aparelho: no celular, quando algo vaza, o navegador amplia a janela e innerWidth engana
    const deviceWidth = page.viewportSize()!.width
    const overflow = await page.evaluate((w) => document.documentElement.scrollWidth - w, deviceWidth)
    expect.soft(overflow, `${label}/${view}: página mais larga que a tela em ${overflow}px`).toBeLessThanOrEqual(0)

    // elementos visíveis cuja borda direita passa da tela (fora de contêineres com rolagem própria)
    const escaped = await page.evaluate((deviceW) => {
      const vw = deviceW
      const out: string[] = []
      const scrollable = (el: Element | null): boolean => {
        for (let n = el; n && n !== document.body; n = n.parentElement) {
          const s = getComputedStyle(n)
          if (/(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth) return true
        }
        return false
      }
      document.querySelectorAll('main *').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0 && r.right > vw + 1 && !scrollable(el)) {
          out.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(' ')[0]}`)
        }
      })
      return out.slice(0, 3)
    }, deviceWidth)
    expect.soft(escaped, `${label}/${view}: elementos vazando para fora da tela`).toEqual([])

    expect.soft(problems, `${label}/${view}: erros no console/API`).toEqual([])
    await page.screenshot({ path: `test-results/screens/${label}-${projectName}-${view}.png`, fullPage: true })
  }
}

test.describe('Design QA · conta com dados (Org A, admin)', () => {
  test('todas as telas', async ({ page, context, isMobile }, info) => {
    test.setTimeout(240000)
    await authenticate(context, 'admin.a@test.local', 'demo123')
    await sweep(page, 'dados', !!isMobile, info.project.name)
  })
})

test.describe('Design QA · conta nova, vazia (primeira experiência)', () => {
  test('todas as telas', async ({ page, context, isMobile }, info) => {
    test.setTimeout(240000)
    const { email, password } = await signupOrg()
    await authenticate(context, email, password)
    await sweep(page, 'vazia', !!isMobile, info.project.name)
  })
})

test.describe('Design QA · menu no celular', () => {
  test('menu lateral não cobre a tela: abre pelo botão, fecha ao escolher e pelo fundo', async ({ page, context, isMobile }) => {
    test.skip(!isMobile, 'só faz sentido no celular')
    await authenticate(context, 'admin.a@test.local', 'demo123')
    await page.goto('/')
    const aside = page.locator('aside')
    const menuButton = page.getByRole('button', { name: 'Abrir menu' })
    await expect(menuButton).toBeVisible()

    // fechado por padrão: fora da tela e sem tapar o botão
    const closed = await aside.boundingBox()
    expect(closed!.x + closed!.width, 'menu deveria começar fechado, fora da tela').toBeLessThanOrEqual(1)

    await menuButton.click()
    await expect(aside).toBeInViewport({ ratio: 0.9 })
    await expect(aside.getByText('Alertas')).toBeVisible() // com os textos, não só ícones

    await aside.getByText('Alertas').click()
    await expect(page.locator('main').getByRole('heading', { name: /Alertas/i }).first()).toBeVisible()
    await expect(aside).not.toBeInViewport() // fechou sozinho depois de escolher

    await menuButton.click()
    await page.mouse.click(360, 400) // toque no fundo escurecido
    await expect(aside).not.toBeInViewport()
  })
})
