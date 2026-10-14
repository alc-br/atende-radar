import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createUser, loginAs, signupOrg, uid } from './helpers'

// Tour pelo sistema: manual interativo por papel, com passos de clique e de cadastro real, progresso salvo e voz.

const QUICK_TOURS = ['welcome', 'dashboard', 'alerts', 'teams', 'members', 'help']

/** Entra no contexto do navegador com os guias rápidos já vistos (para não abrirem por cima do manual). */
async function enter(context: BrowserContext, email: string, password?: string) {
  const api = await loginAs(email, password)
  for (const tourId of QUICK_TOURS) await api.patch('/api/tours', { data: { tourId } })
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
}

async function enterAsNewOwner(context: BrowserContext) {
  const { email, password } = await signupOrg()
  await enter(context, email, password)
}

/** Pessoa nova numa empresa já com atendentes e conversas (admin.a@test.local). */
async function enterAsRole(context: BrowserContext, role: string) {
  const adm = await loginAs('admin.a@test.local')
  const email = `tourapp.${role}.${uid()}@test.local`
  await createUser(adm, { email, role })
  await adm.dispose()
  await enter(context, email, 'Senha-Forte-2026x')
}

async function openSystemTour(page: Page, isMobile: boolean) {
  await page.goto('/')
  await expect(page.locator('[data-tour="nav-dashboard"]').first()).toBeAttached({ timeout: 15000 })
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.getByTestId('abrir-tour-sistema').click()
  await expect(page.locator('main').getByRole('heading', { name: 'Tour pelo sistema', level: 1 })).toBeVisible()
  await expect(page.getByTestId('system-tour-chapters')).toBeVisible({ timeout: 15000 })
}

const chapterCard = (page: Page, id: string) => page.locator(`[data-chapter="${id}"]`)
const panel = (page: Page) => page.getByTestId('system-tour-panel')

async function startChapter(page: Page, id: string) {
  await chapterCard(page, id).getByRole('button', { name: /Começar|Continuar de onde parei/ }).click()
  await expect(panel(page)).toBeVisible()
}

test('o botão fica logo acima de "Precisa de ajuda?" e abre a lista de capítulos', async ({ page, context, isMobile }) => {
  await enterAsNewOwner(context)
  await page.goto('/')
  await expect(page.locator('[data-tour="nav-dashboard"]').first()).toBeAttached({ timeout: 15000 })
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()

  const footer = page.locator('aside.lateral > button.ajuda')
  await expect(footer).toHaveCount(2)
  await expect(footer.nth(0)).toHaveAttribute('data-testid', 'abrir-tour-sistema')
  await expect(footer.nth(1)).toHaveAttribute('data-testid', 'abrir-ajuda')
  const tourBox = await page.getByTestId('abrir-tour-sistema').boundingBox()
  const helpBox = await page.getByTestId('abrir-ajuda').boundingBox()
  expect(tourBox && helpBox && tourBox.y + tourBox.height <= helpBox.y + 1).toBeTruthy()
  await expect(page.getByTestId('abrir-tour-sistema')).toContainText('Tour pelo sistema')

  await page.getByTestId('abrir-tour-sistema').click()
  await expect(page.locator('main').getByRole('heading', { name: 'Tour pelo sistema', level: 1 })).toBeVisible()
  await expect(chapterCard(page, 'primeiros-passos')).toBeVisible({ timeout: 15000 })
  await expect(chapterCard(page, 'primeiros-passos').getByRole('button', { name: 'Começar' })).toBeVisible()
})

test.describe('capítulos por papel', () => {
  test('dono vê Equipes e Membros (e não o Admin)', async ({ page, context, isMobile }) => {
    await enterAsNewOwner(context)
    await openSystemTour(page, !!isMobile)
    for (const id of ['equipes', 'membros', 'whatsapp', 'planos', 'privacidade']) await expect(chapterCard(page, id)).toBeVisible()
    await expect(chapterCard(page, 'admin')).toHaveCount(0)
  })

  test('atendente não vê Equipes nem Membros; vê Conversas e Recuperação', async ({ page, context, isMobile }) => {
    await enterAsRole(context, 'atendente')
    await openSystemTour(page, !!isMobile)
    await expect(chapterCard(page, 'conversas')).toBeVisible()
    await expect(chapterCard(page, 'recuperacao')).toBeVisible()
    for (const id of ['equipes', 'membros', 'whatsapp', 'planos', 'configuracoes', 'admin']) await expect(chapterCard(page, id)).toHaveCount(0)
  })

  test('operador da plataforma vê o capítulo do Admin', async ({ page, context, isMobile }) => {
    await enter(context, 'platform@test.local')
    await openSystemTour(page, !!isMobile)
    await expect(chapterCard(page, 'admin')).toBeVisible()
  })
})

test('passo de clique só avança quando o item destacado é clicado', async ({ page, context, isMobile }) => {
  await enterAsNewOwner(context)
  await openSystemTour(page, !!isMobile)
  await startChapter(page, 'primeiros-passos')
  const p = panel(page)
  await expect(p.getByTestId('system-tour-step')).toHaveText(/Passo 1 de \d+/)
  await p.getByRole('button', { name: 'Próximo' }).click()
  await expect(p.getByTestId('system-tour-step')).toHaveText(/Passo 2 de \d+/)
  await p.getByRole('button', { name: 'Próximo' }).click()

  // Passo 3: "Experimente: abra os Alertas" — sem "Próximo", e a seta → não pula
  await expect(p.getByTestId('system-tour-step')).toHaveText(/Passo 3 de \d+/)
  await expect(p.getByRole('heading', { name: 'Experimente: abra os Alertas' })).toBeVisible()
  await expect(p.getByRole('button', { name: 'Próximo' })).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(400)
  await expect(p.getByTestId('system-tour-step')).toHaveText(/Passo 3 de \d+/)
  // clicar fora do item também não avança
  await page.locator('main h1').first().click({ force: true })
  await expect(p.getByTestId('system-tour-step')).toHaveText(/Passo 3 de \d+/)

  await page.locator('[data-tour="nav-alerts"]').click()
  await expect(p.getByTestId('system-tour-step')).toHaveText(/Passo 4 de \d+/)
  await expect(page.locator('main').getByRole('heading', { name: 'Alertas', level: 1 })).toBeVisible()
})

test('passo de cadastro avança sozinho depois de criar uma equipe de verdade pela tela', async ({ page, context, isMobile }) => {
  await enterAsRole(context, 'admin')
  await openSystemTour(page, !!isMobile)
  await startChapter(page, 'equipes')
  const p = panel(page)

  await expect(p.getByRole('heading', { name: 'Abra Equipes' })).toBeVisible()
  await page.locator('[data-tour="nav-teams"]').click()
  await expect(p.getByRole('heading', { name: 'As equipes cadastradas' })).toBeVisible()
  await p.getByRole('button', { name: 'Próximo' }).click()

  await expect(p.getByRole('heading', { name: 'Crie uma equipe' })).toBeVisible()
  await page.locator('[data-tour="teams-create"]').click()

  const dialog = page.getByRole('dialog', { name: 'Criar equipe' })
  await expect(dialog).toBeVisible()
  await expect(p.getByRole('heading', { name: 'Dê um nome e escolha o supervisor', includeHidden: true })).toBeAttached()
  const name = `Equipe Tour ${uid()}`
  await dialog.locator('#team-name').fill(name)
  await dialog.getByRole('combobox', { name: 'Selecione o supervisor' }).click()
  await page.getByRole('option').first().click()
  await dialog.getByRole('button', { name: 'Criar', exact: true }).click()

  await expect(dialog).toHaveCount(0)
  await expect(p.getByRole('heading', { name: 'Sua equipe apareceu' })).toBeVisible({ timeout: 10000 })
  await expect(page.locator('[data-tour="teams-list"]')).toContainText(name)
})

test('o progresso fica salvo e continua depois de recarregar a página', async ({ page, context, isMobile }) => {
  await enterAsNewOwner(context)
  await openSystemTour(page, !!isMobile)
  await startChapter(page, 'primeiros-passos')
  const p = panel(page)
  await p.getByRole('button', { name: 'Próximo' }).click()
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/tours/system') && r.request().method() === 'PATCH' && r.ok())
  await p.getByRole('button', { name: 'Próximo' }).click()
  await saved
  await expect(p.getByTestId('system-tour-step')).toHaveText(/Passo 3 de \d+/)

  // Esc fecha sem perguntar nada e mantém o progresso
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)

  await page.reload()
  await openSystemTour(page, !!isMobile)
  const card = chapterCard(page, 'primeiros-passos')
  await expect(card.getByTestId('chapter-status')).toHaveText(/Parou no passo 3 de \d+/)
  await expect(card.getByRole('button', { name: 'Recomeçar' })).toBeVisible()
  await card.getByRole('button', { name: 'Continuar de onde parei' }).click()
  await expect(panel(page).getByTestId('system-tour-step')).toHaveText(/Passo 3 de \d+/)
})

test.describe('leitura em voz alta', () => {
  test('Ouvir chama speechSynthesis.speak com voz em português; leitura automática e velocidade ficam guardadas', async ({ page, context, isMobile }) => {
    await page.addInitScript(() => {
      const calls: Array<{ text: string; lang: string; rate: number }> = []
      ;(window as unknown as { __tts: typeof calls }).__tts = calls
      class FakeUtterance {
        text: string
        lang = ''
        rate = 1
        voice: unknown = null
        onend: (() => void) | null = null
        onerror: (() => void) | null = null
        constructor(text: string) {
          this.text = text
        }
      }
      const synth = {
        speaking: false,
        paused: false,
        speak: (u: FakeUtterance) => calls.push({ text: u.text, lang: u.lang, rate: u.rate }),
        cancel: () => {},
        pause: () => {},
        resume: () => {},
        getVoices: () => [{ lang: 'en-US', name: 'English' }, { lang: 'pt-BR', name: 'Português (Brasil)' }],
        addEventListener: () => {},
        removeEventListener: () => {},
      }
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth })
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, writable: true, value: FakeUtterance })
    })
    await enterAsNewOwner(context)
    await openSystemTour(page, !!isMobile)
    await startChapter(page, 'primeiros-passos')
    const p = panel(page)

    await p.getByRole('button', { name: 'Ouvir' }).click()
    const calls = () => page.evaluate(() => (window as unknown as { __tts: Array<{ text: string; lang: string; rate: number }> }).__tts)
    await expect.poll(async () => (await calls()).length).toBe(1)
    const first = (await calls())[0]
    expect(first.lang).toMatch(/^pt/i)
    expect(first.text).toContain('Bem-vindo ao manual do AtendeRadar')
    await expect(p.getByRole('button', { name: 'Pausar' })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Parar' })).toBeEnabled()

    await p.getByLabel('Velocidade').selectOption('1.5')
    await p.getByLabel('Ler automaticamente cada passo').check()
    await p.getByRole('button', { name: 'Parar' }).click()
    const before = (await calls()).length
    await p.getByRole('button', { name: 'Próximo' }).click()
    await expect.poll(async () => (await calls()).length).toBeGreaterThan(before)
    const last = (await calls()).at(-1)!
    expect(last.text).toContain('O menu lateral')
    expect(last.rate).toBe(1.5)
    const prefs = await page.evaluate(() => localStorage.getItem('ar.systemTour.tts'))
    expect(JSON.parse(prefs || '{}')).toEqual({ auto: true, rate: 1.5 })
  })

  test('sem suporte no navegador, os controles somem e aparece um aviso curto', async ({ page, context, isMobile }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => undefined })
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, writable: true, value: undefined })
    })
    await enterAsNewOwner(context)
    await openSystemTour(page, !!isMobile)
    await startChapter(page, 'primeiros-passos')
    const p = panel(page)
    await expect(p.getByTestId('system-tour-no-speech')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Ouvir' })).toHaveCount(0)
    await expect(p.getByLabel('Ler automaticamente cada passo')).toHaveCount(0)
  })
})

test('painel do tour sem violações de acessibilidade (axe)', async ({ page, context, isMobile }) => {
  await enterAsNewOwner(context)
  await openSystemTour(page, !!isMobile)
  await startChapter(page, 'primeiros-passos')
  await expect(panel(page).getByRole('heading', { name: 'Bem-vindo ao manual do AtendeRadar' })).toBeFocused()
  const results = await new AxeBuilder({ page })
    .include('[data-testid="system-tour-panel"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
})

test.describe('celular (375 px)', () => {
  test.use({ viewport: { width: 375, height: 740 } })

  test('o tour abre como folha no rodapé e o passo do menu abre a gaveta', async ({ page, context }) => {
    await enterAsNewOwner(context)
    await openSystemTour(page, true)
    await startChapter(page, 'primeiros-passos')
    const p = panel(page)
    const box = await p.boundingBox()
    expect(box && box.width).toBeGreaterThanOrEqual(370)
    await expect(page.locator('.ar.app')).not.toHaveClass(/menu-aberto/)

    await p.getByRole('button', { name: 'Próximo' }).click()
    await expect(p.getByRole('heading', { name: 'O menu lateral' })).toBeVisible()
    await expect(page.locator('.ar.app')).toHaveClass(/menu-aberto/)
    await expect(page.locator('[data-tour="nav-dashboard"]')).toBeInViewport()

    // passo de clique dentro da gaveta: tocar em Alertas fecha a gaveta e segue o tour
    await p.getByRole('button', { name: 'Próximo' }).click()
    await page.locator('[data-tour="nav-alerts"]').click()
    await expect(p.getByTestId('system-tour-step')).toHaveText(/Passo 4 de \d+/)
    await expect(page.locator('.ar.app')).not.toHaveClass(/menu-aberto/)
  })
})
