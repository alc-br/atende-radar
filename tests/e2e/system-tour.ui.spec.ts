import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createUser, loginAs, signupOrg, uid } from './helpers'
import { SYSTEM_TOUR_CHAPTERS } from '../../src/lib/system-tour/content'

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

/**
 * Abre o capítulo. A leitura automática começa ligada; por padrão o teste a pausa na hora (sem tirar o foco do
 * título) para conduzir os passos à mão. keepAuto: deixa a leitura seguir.
 */
async function startChapter(page: Page, id: string, { keepAuto = false } = {}) {
  await chapterCard(page, id).getByRole('button', { name: /Começar|Continuar de onde parei/ }).click()
  await expect(panel(page)).toBeVisible()
  if (keepAuto) return
  const auto = panel(page).getByTestId('system-tour-auto')
  if ((await auto.count()) && (await auto.getAttribute('aria-pressed')) === 'true') {
    // "Parar": desliga a leitura automática e a fala (o painel volta a mostrar "Ouvir")
    await panel(page).getByRole('button', { name: 'Parar' }).evaluate((b: HTMLButtonElement) => b.click())
    await expect(auto).toHaveAttribute('aria-pressed', 'false')
  }
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

test('destaque em 3 níveis: item aceso, menu em meia-luz, resto mais escuro; o foco acompanha a voz', async ({ page, context, isMobile }) => {
  await page.addInitScript(fakeSpeechSynthesis)
  await enterAsNewOwner(context)
  await openSystemTour(page, !!isMobile)
  await startChapter(page, 'primeiros-passos')
  const p = panel(page)
  await p.getByRole('button', { name: 'Próximo' }).click()
  await expect(p.getByRole('heading', { name: 'O menu lateral' })).toBeVisible()

  const veu = page.locator('.tour-sistema__veu')
  const ring = page.locator('.tour-sistema__destaque')
  const opacity = (sel: string) => page.locator(sel).evaluate((el) => Number(getComputedStyle(el).opacity))
  const fillAlpha = (sel: string) =>
    page.locator(sel).evaluate((el) => Number(getComputedStyle(el).fill.match(/rgba?\(([^)]+)\)/)?.[1].split(',')[3] ?? 1))
  // parado: os 3 níveis (o anel no item, a meia-luz no menu, o resto mais escuro que o menu sem esconder)
  await expect(veu).toHaveAttribute('data-focus', 'target')
  await expect.poll(() => opacity('.tour-sistema__destaque')).toBe(1)
  await expect.poll(() => opacity('.tour-sistema__veu-medio')).toBe(1)
  const dark = await fillAlpha('.tour-sistema__veu-escuro')
  const medium = await fillAlpha('.tour-sistema__veu-medio')
  expect(dark).toBeGreaterThan(medium)
  expect(dark).toBeLessThan(0.75)
  // no celular a gaveta do menu ainda desliza: a meia-luz e o anel acompanham até assentar
  await expect.poll(async () => {
    const area = await page.locator('.tour-sistema__area').boundingBox()
    const aside = await page.locator('aside.lateral').boundingBox()
    return !!(area && aside && Math.abs(area.x - aside.x) < 2 && Math.abs(area.width - aside.width) < 2)
  }).toBe(true)
  await expect.poll(async () => {
    const item = await page.locator('[data-tour="nav-dashboard"]').boundingBox()
    const ringBox = await ring.boundingBox()
    return !!(item && ringBox && ringBox.x <= item.x && ringBox.x + ringBox.width >= item.x + item.width)
  }).toBe(true)

  // falando "Este é o menu lateral": o menu inteiro acende e o anel do item some; no fim volta aos 3 níveis
  // o áudio falso dos testes tem ~2,6 s para a narração inteira: o trecho do menu dura uma fração de segundo. A página
  // pausa a fala no instante em que o foco vai para o menu, e o teste confere com a fala parada ali.
  await veu.evaluate((svg) => {
    const mo = new MutationObserver(() => {
      if (svg.getAttribute('data-focus') !== 'area') return
      mo.disconnect()
      ;[...document.querySelectorAll<HTMLButtonElement>('[data-testid="system-tour-panel"] button')].find((b) => b.textContent?.trim() === 'Pausar')?.click()
    })
    mo.observe(svg, { attributes: true, attributeFilter: ['data-focus'] })
  })
  await p.getByRole('button', { name: 'Ouvir' }).click()
  await expect(p.getByRole('button', { name: 'Continuar' })).toBeVisible({ timeout: 15000 })
  await expect(veu).toHaveAttribute('data-focus', 'area')
  await expect.poll(() => opacity('.tour-sistema__area')).toBe(1)
  await expect.poll(() => opacity('.tour-sistema__destaque')).toBe(0)
  await p.getByRole('button', { name: 'Continuar' }).click()
  await expect(p.getByRole('button', { name: 'Ouvir' })).toBeVisible({ timeout: 15000 })
  await expect(veu).toHaveAttribute('data-focus', 'target')
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

/** Voz do navegador falsa: guarda cada fala (texto, idioma e velocidade) em window.__tts. */
function fakeSpeechSynthesis() {
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
}

/** Sem voz no navegador. */
function noSpeechSynthesis() {
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => undefined })
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, writable: true, value: undefined })
}

/** Registra cada play() de <audio> (endereço, velocidade e tom) em window.__plays e guarda o último em window.__lastAudio. */
function spyAudioPlay() {
  const plays: Array<{ src: string; rate: number; pitch: boolean }> = []
  const w = window as unknown as { __plays: typeof plays; __lastAudio: HTMLMediaElement | null }
  w.__plays = plays
  w.__lastAudio = null
  const original = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    plays.push({ src: this.src, rate: this.playbackRate, pitch: this.preservesPitch })
    w.__lastAudio = this
    return original.call(this)
  }
}

const ttsCalls = (page: Page) => page.evaluate(() => (window as unknown as { __tts: Array<{ text: string; lang: string; rate: number }> }).__tts)
const audioPlays = (page: Page) =>
  page.evaluate(() => (window as unknown as { __plays: Array<{ src: string; rate: number; pitch: boolean }> }).__plays)
/** Velocidade do <audio> que está tocando agora (depois dos metadados). */
const liveAudioRate = (page: Page) =>
  page.evaluate(() => (window as unknown as { __lastAudio: HTMLMediaElement | null }).__lastAudio?.playbackRate ?? null)
const narration = (chapterId: string, stepId: string) => SYSTEM_TOUR_CHAPTERS.find((c) => c.id === chapterId)!.steps.find((s) => s.id === stepId)!.narration!
const stepAudio = (step: number) => `/api/tours/system/audio?chapter=primeiros-passos&step=${step}`
const playedStep = (src: string, step: number) => src.includes(stepAudio(step))

/** O servidor diz que NÃO tem a narração em áudio (sem Azure configurada): o painel usa só a voz do navegador. */
async function withoutServerAudio(page: Page) {
  await page.route(
    (url) => url.pathname === '/api/tours/system',
    async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const res = await route.fetch()
      await route.fulfill({ response: res, json: { ...(await res.json()), audio: false } })
    },
  )
}

test.describe('leitura em voz alta', () => {
  test('Ouvir toca a narração gravada no servidor: pausar, continuar, parar; a velocidade fica guardada', async ({ page, context, isMobile }) => {
    await page.addInitScript(fakeSpeechSynthesis)
    await page.addInitScript(spyAudioPlay)
    await enterAsNewOwner(context)
    await openSystemTour(page, !!isMobile)
    // A leitura automática já pede o áudio do passo 0 ao abrir o capítulo; o "Ouvir" depois pode vir do cache do
    // navegador (sem nova ida à rede). Por isso a resposta é observada desde a abertura.
    const audio = page.waitForResponse((r) => r.url().includes(stepAudio(0)))
    await startChapter(page, 'primeiros-passos')
    const p = panel(page)
    const voz = p.getByRole('group', { name: 'Leitura em voz alta' })

    const before = (await audioPlays(page)).length
    await p.getByRole('button', { name: 'Ouvir' }).click()
    const res = await audio
    expect([200, 206], `o Chromium pede o áudio com Range (${res.status()} ${res.headers()['content-type']} ${res.status() >= 400 ? (await res.text()).slice(0, 300) : ''})`).toContain(res.status())
    expect(res.headers()['content-type']).toMatch(/^audio\//)
    await expect(voz).toHaveAttribute('data-voice-source', 'server')
    await expect.poll(async () => (await audioPlays(page)).length).toBe(before + 1)
    expect((await audioPlays(page)).at(-1)).toMatchObject({ rate: 1, pitch: true })
    await expect(p.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible()
    await p.getByRole('button', { name: 'Pausar', exact: true }).click()
    await expect(p.getByRole('button', { name: 'Continuar' })).toBeVisible()
    await p.getByRole('button', { name: 'Continuar' }).click()
    await expect(p.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible()
    await p.getByRole('button', { name: 'Parar' }).click()
    await expect(p.getByRole('button', { name: 'Ouvir' })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Parar' })).toBeDisabled()

    // 0,8× a 2×; a escolhida fica guardada e vale depois de recarregar
    const options = await p.getByLabel('Velocidade').locator('option').allTextContents()
    expect(options).toEqual(['0,8×', '1,0×', '1,25×', '1,5×', '1,75×', '2,0×'])
    await p.getByLabel('Velocidade').selectOption('2')
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('ar.systemTour.tts'))) || '{}')).toEqual({ rate: 2 })
    // reabre o manual depois de recarregar: a velocidade continua 2×
    await openSystemTour(page, !!isMobile)
    await startChapter(page, 'primeiros-passos')
    await expect(panel(page).getByLabel('Velocidade')).toHaveValue('2')
    await panel(page).getByRole('button', { name: 'Ouvir' }).click()
    await expect.poll(async () => (await audioPlays(page)).at(-1)?.rate).toBe(2)
    await expect.poll(() => liveAudioRate(page)).toBe(2)
    expect(await ttsCalls(page), 'com o áudio do servidor, a voz do navegador não fala').toEqual([])
  })

  test('Ler automaticamente: começa ao abrir, avança sozinho 2 passos, aponta o clique e espera a pessoa', async ({ page, context, isMobile }) => {
    await page.addInitScript(fakeSpeechSynthesis)
    await page.addInitScript(spyAudioPlay)
    await page.addInitScript(() => localStorage.setItem('ar.systemTour.tts', JSON.stringify({ rate: 1.5 })))
    await enterAsNewOwner(context)
    await openSystemTour(page, !!isMobile)
    await startChapter(page, 'primeiros-passos', { keepAuto: true })
    const p = panel(page)
    const step = p.getByTestId('system-tour-step')
    const auto = p.getByTestId('system-tour-auto')

    // abrir o capítulo já lê o 1º passo
    await expect(p.getByLabel('Velocidade')).toHaveValue('1.5')
    await expect(auto).toHaveAccessibleName('Pausar leitura')
    await expect(auto).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await audioPlays(page)).length).toBeGreaterThanOrEqual(1)
    expect((await audioPlays(page))[0]).toMatchObject({ rate: 1.5, pitch: true })
    expect((await audioPlays(page))[0].src).toContain(stepAudio(0))

    // o áudio curto do TTS falso termina e o passo avança sozinho, duas vezes, sempre a 1,5×; o áudio do passo
    // seguinte já vem baixado (começa junto com a tela)
    await expect(step).toHaveText(/Passo 2 de \d+/, { timeout: 15000 })
    await expect.poll(async () => (await audioPlays(page)).length).toBe(2)
    expect((await audioPlays(page))[1]).toMatchObject({ rate: 1.5 })
    expect(playedStep((await audioPlays(page))[1].src, 1)).toBe(true)
    await expect.poll(() => liveAudioRate(page)).toBe(1.5)
    await expect(step).toHaveText(/Passo 3 de \d+/, { timeout: 15000 })
    await expect.poll(async () => (await audioPlays(page)).length).toBe(3)
    expect(playedStep((await audioPlays(page))[2].src, 2)).toBe(true)

    // passo de clique: o cursor simulado aponta "Alertas" e o tour ESPERA (nunca clica sozinho)
    const ghost = page.getByTestId('system-tour-ghost')
    await expect(ghost).toBeAttached({ timeout: 15000 })
    await expect(ghost).toHaveAttribute('aria-hidden', 'true')
    expect(await ghost.evaluate((el) => [getComputedStyle(el).pointerEvents, getComputedStyle(el).zIndex])).toEqual(['none', '55'])
    await expect(page.getByTestId('system-tour-ghost-balloon')).toHaveText('Clique aqui para continuar', { timeout: 15000 })
    await page.waitForTimeout(3000)
    await expect(step).toHaveText(/Passo 3 de \d+/)
    await expect(page.locator('main').getByRole('heading', { name: 'Alertas', level: 1 })).toHaveCount(0)
    expect((await audioPlays(page)).length).toBe(3)

    // a pessoa clica: o passo avança e a leitura continua
    await page.locator('[data-tour="nav-alerts"]').click()
    await expect(step).toHaveText(/Passo 4 de \d+/, { timeout: 15000 })
    await expect(page.locator('main').getByRole('heading', { name: 'Alertas', level: 1 })).toBeVisible()
    await expect(auto).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await audioPlays(page)).length).toBe(4)
    expect(playedStep((await audioPlays(page))[3].src, 3)).toBe(true)

    // Pausar leitura: a fala para, o cursor some e o passo não avança mais
    await auto.click()
    await expect(auto).toHaveAccessibleName('Ler automaticamente')
    await expect(auto).toHaveAttribute('aria-pressed', 'false')
    await expect(ghost).toHaveCount(0)
    await page.waitForTimeout(2500)
    await expect(step).toHaveText(/Passo 4 de \d+/)
    expect((await audioPlays(page)).length).toBe(4)
    expect(await ttsCalls(page)).toEqual([])
    // a velocidade guardada continua; a leitura automática não fica salva
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('ar.systemTour.tts'))) || '{}')).toEqual({ rate: 1.5 })
  })

  test('Ler automaticamente desliga com Próximo e não pula para outro capítulo no fim', async ({ page, context, isMobile }) => {
    await page.addInitScript(fakeSpeechSynthesis)
    await page.addInitScript(spyAudioPlay)
    await enterAsNewOwner(context)
    await openSystemTour(page, !!isMobile)
    await startChapter(page, 'primeiros-passos', { keepAuto: true })
    const p = panel(page)
    const step = p.getByTestId('system-tour-step')
    const auto = p.getByTestId('system-tour-auto')

    await expect(auto).toHaveAttribute('aria-pressed', 'true')
    const before = (await step.textContent()) ?? ''
    await p.getByRole('button', { name: 'Próximo' }).click()
    await expect(step).not.toHaveText(before)
    await expect(auto).toHaveAttribute('aria-pressed', 'false')
    const after = (await step.textContent()) ?? ''
    await page.waitForTimeout(3500)
    await expect(step).toHaveText(after)

    // último passo: lê, para e mostra "Concluir capítulo" (sem abrir outro capítulo)
    const total = SYSTEM_TOUR_CHAPTERS.find((c) => c.id === 'primeiros-passos')!.steps.length
    for (let i = 0; i < total && !(await p.getByRole('button', { name: 'Concluir capítulo' }).isVisible()); i++) {
      const before = (await step.textContent()) ?? ''
      const next = p.getByRole('button', { name: 'Próximo' })
      if (await next.isVisible()) await next.click()
      else await page.locator('[data-tour="nav-alerts"]').click() // o passo de clique do capítulo
      await expect(step).not.toHaveText(before)
    }
    await auto.click()
    await expect(auto).toHaveAttribute('aria-pressed', 'true')
    await expect(auto).toHaveAttribute('aria-pressed', 'false', { timeout: 15000 })
    await expect(step).toHaveText(new RegExp(`Passo ${total} de ${total}`))
    await expect(p.getByRole('button', { name: 'Concluir capítulo' })).toBeVisible()
  })

  test.describe('Ler automaticamente simula as ações', () => {
    /** Vai até o passo de clique do primeiro capítulo ("abra os Alertas") sem a leitura automática. */
    async function toClickStep(page: Page, isMobile: boolean) {
      await page.addInitScript(fakeSpeechSynthesis)
      await enterAsNewOwner(page.context())
      await openSystemTour(page, isMobile)
      await startChapter(page, 'primeiros-passos')
      const p = panel(page)
      await p.getByRole('button', { name: 'Próximo' }).click()
      await p.getByRole('button', { name: 'Próximo' }).click()
      await expect(p.getByRole('heading', { name: 'Experimente: abra os Alertas' })).toBeVisible()
      return p
    }

    test('Pausar com o cursor apontando tira o cursor e o passo não avança', async ({ page, isMobile }) => {
      const p = await toClickStep(page, !!isMobile)
      const auto = p.getByTestId('system-tour-auto')
      await auto.click()
      const ghost = page.getByTestId('system-tour-ghost')
      await expect(ghost).toBeAttached({ timeout: 15000 })
      await auto.click()
      await expect(auto).toHaveAttribute('aria-pressed', 'false')
      await expect(ghost).toHaveCount(0)
      await page.waitForTimeout(2500)
      await expect(p.getByTestId('system-tour-step')).toHaveText(/Passo 3 de \d+/)
      await expect(page.locator('main').getByRole('heading', { name: 'Alertas', level: 1 })).toHaveCount(0)
    })

    test('com movimento reduzido, o cursor não desliza: aponta parado e espera o clique da pessoa', async ({ page, isMobile }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const p = await toClickStep(page, !!isMobile)
      // registra se o cursor chegou a deslizar
      await page.evaluate(() => {
        const w = window as unknown as { __glide: boolean }
        w.__glide = false
        new MutationObserver(() => {
          if (document.querySelector('.tour-fantasma--deslizando')) w.__glide = true
        }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
      })
      await p.getByTestId('system-tour-auto').click()
      await expect(page.getByTestId('system-tour-ghost-balloon')).toHaveText('Clique aqui para continuar', { timeout: 15000 })
      await page.waitForTimeout(1500)
      await expect(p.getByTestId('system-tour-step')).toHaveText(/Passo 3 de \d+/)
      await page.locator('[data-tour="nav-alerts"]').click()
      await expect(p.getByTestId('system-tour-step')).toHaveText(/Passo 4 de \d+/, { timeout: 15000 })
      await expect(page.locator('main').getByRole('heading', { name: 'Alertas', level: 1 })).toBeVisible()
      expect(await page.evaluate(() => (window as unknown as { __glide: boolean }).__glide)).toBe(false)
    })

    test('passo de cadastro: o tour mostra como, não cria nada e espera a pessoa salvar para seguir', async ({ page, context, isMobile }) => {
      await page.addInitScript(fakeSpeechSynthesis)
      await enterAsRole(context, 'admin')
      const writes: string[] = []
      page.on('request', (r) => {
        if (r.method() !== 'GET' && /\/api\/teams/.test(r.url())) writes.push(`${r.method()} ${r.url()}`)
      })
      await openSystemTour(page, !!isMobile)
      await startChapter(page, 'equipes', { keepAuto: true })
      const p = panel(page)
      const step = p.getByTestId('system-tour-step')
      const balloon = page.getByTestId('system-tour-ghost-balloon')
      await expect(p.getByRole('heading', { name: 'Abra Equipes' })).toBeVisible()

      // passos de clique: o cursor aponta e espera; quem clica é a pessoa
      await expect(balloon).toHaveText('Clique aqui para continuar', { timeout: 15000 })
      await page.locator('[data-tour="nav-teams"]').click()
      await expect(p.getByRole('heading', { name: 'Crie uma equipe' })).toBeVisible({ timeout: 30000 })
      await expect(balloon).toHaveText('Clique aqui para continuar', { timeout: 15000 })
      await page.locator('[data-tour="teams-create"]').click()
      const dialog = page.getByRole('dialog', { name: 'Criar equipe' })
      await expect(dialog).toBeVisible()

      // demonstração: um exemplo digitado e apagado, nada enviado; depois o aviso "é com você" no painel e no balão
      const taskMessage = 'Agora é com você: preencha e salve. O tour continua quando você terminar.'
      await expect(balloon).toHaveText(taskMessage, { timeout: 15000 })
      await expect(p.getByTestId('system-tour-demo-note')).toHaveText(taskMessage)
      await expect(dialog.locator('#team-name')).toHaveValue('')
      // o tour espera: não passa para o próximo passo sozinho
      const stepText = await step.textContent()
      await page.waitForTimeout(4000)
      await expect(step).toHaveText(stepText!)
      expect(writes, 'a leitura automática nunca cria nada').toEqual([])
      const teams = (await (await page.request.get('/api/teams')).json()) as { teams: Array<{ name: string }> }
      expect(teams.teams.some((t) => t.name === 'Exemplo' || t.name.startsWith('Exemp'))).toBe(false)

      // a pessoa cadastra: o tour segue com a leitura ligada
      const nome = `Equipe Tour ${uid()}`
      await dialog.locator('#team-name').fill(nome)
      await dialog.getByRole('combobox', { name: 'Selecione o supervisor' }).click()
      await page.getByRole('option').first().click()
      await dialog.getByRole('button', { name: 'Criar', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(p.getByRole('heading', { name: 'Sua equipe apareceu' })).toBeVisible({ timeout: 15000 })
      await expect(p.getByTestId('system-tour-auto')).toHaveAttribute('aria-pressed', 'true')
      expect(writes).toHaveLength(1)
    })
  })

  test('se o servidor não tiver o áudio (503), a voz do navegador lê a narração em português', async ({ page, context, isMobile }) => {
    await page.addInitScript(fakeSpeechSynthesis)
    let audioRequests = 0
    await page.route('**/api/tours/system/audio**', (route) => {
      audioRequests++
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"indisponível"}' })
    })
    await enterAsNewOwner(context)
    await openSystemTour(page, !!isMobile)
    await startChapter(page, 'primeiros-passos')
    const p = panel(page)

    const spoken = (await ttsCalls(page)).length
    await p.getByRole('button', { name: 'Ouvir' }).click()
    await expect.poll(async () => (await ttsCalls(page)).length).toBe(spoken + 1)
    const first = (await ttsCalls(page)).at(-1)!
    expect(first.lang).toMatch(/^pt/i)
    expect(first.text).toBe(narration('primeiros-passos', 'boas-vindas'))
    expect(audioRequests).toBeGreaterThanOrEqual(1)
    await expect(p.getByRole('group', { name: 'Leitura em voz alta' })).toHaveAttribute('data-voice-source', 'browser')
    await expect(p.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Parar' })).toBeEnabled()

    await p.getByLabel('Velocidade').selectOption('1.5')
    await p.getByRole('button', { name: 'Parar' }).click()
    const requestsBefore = audioRequests
    await p.getByRole('button', { name: 'Próximo' }).click()
    await p.getByRole('button', { name: 'Ouvir' }).click()
    await expect.poll(async () => (await ttsCalls(page)).at(-1)?.text).toBe(narration('primeiros-passos', 'menu'))
    expect((await ttsCalls(page)).at(-1)!.rate).toBe(1.5)
    expect(audioRequests, 'depois de uma falha, vai direto para a voz do navegador').toBe(requestsBefore)
  })

  test('Ler automaticamente com a voz do navegador: avança no fim da fala; se a voz falhar, desliga', async ({ page, context, isMobile }) => {
    // voz falsa que termina sozinha (onend) ou falha (onerror), conforme window.__ttsMode no momento da fala
    await page.addInitScript(() => {
      const calls: Array<{ text: string; rate: number }> = []
      const w = window as unknown as { __tts: typeof calls; __ttsMode: 'end' | 'error' }
      w.__tts = calls
      w.__ttsMode = 'end'
      class U {
        text: string
        lang = ''
        rate = 1
        voice: unknown = null
        onend: (() => void) | null = null
        onerror: (() => void) | null = null
        constructor(t: string) {
          this.text = t
        }
      }
      const synth = {
        speak: (u: U) => {
          calls.push({ text: u.text, rate: u.rate })
          // o modo vale a partir da próxima fala: a que já começou termina como começou
          const mode = w.__ttsMode
          setTimeout(() => (mode === 'end' ? u.onend?.() : u.onerror?.()), 300)
        },
        cancel: () => {},
        pause: () => {},
        resume: () => {},
        getVoices: () => [{ lang: 'pt-BR', name: 'Português (Brasil)' }],
      }
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth })
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, writable: true, value: U })
    })
    await page.addInitScript(() => localStorage.setItem('ar.systemTour.tts', JSON.stringify({ rate: 1.75 })))
    await withoutServerAudio(page)
    await enterAsNewOwner(context)
    await openSystemTour(page, !!isMobile)
    await startChapter(page, 'primeiros-passos', { keepAuto: true })
    const p = panel(page)
    const step = p.getByTestId('system-tour-step')
    const auto = p.getByTestId('system-tour-auto')

    await expect(step).toHaveText(/Passo 2 de \d+/, { timeout: 10000 })
    await expect.poll(async () => (await ttsCalls(page)).length).toBe(2)
    expect((await ttsCalls(page)).map((c) => c.rate)).toEqual([1.75, 1.75])

    // a voz passa a falhar: a leitura automática desliga (sem loop de tentativas)
    await page.evaluate(() => ((window as unknown as { __ttsMode: string }).__ttsMode = 'error'))
    await expect(step).toHaveText(/Passo 3 de \d+/, { timeout: 10000 })
    await expect(auto).toHaveAttribute('aria-pressed', 'false', { timeout: 5000 })
    const n = (await ttsCalls(page)).length
    await page.waitForTimeout(1500)
    expect((await ttsCalls(page)).length).toBe(n)
  })

  test('sem voz no navegador e sem áudio no servidor, os controles somem e aparece um aviso curto', async ({ page, context, isMobile }) => {
    await page.addInitScript(noSpeechSynthesis)
    await withoutServerAudio(page)
    await enterAsNewOwner(context)
    await openSystemTour(page, !!isMobile)
    await startChapter(page, 'primeiros-passos')
    const p = panel(page)
    await expect(p.getByTestId('system-tour-no-speech')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Ouvir' })).toHaveCount(0)
    await expect(p.getByTestId('system-tour-auto')).toHaveCount(0)
  })

  test('sem voz no navegador, mas com áudio no servidor, Ouvir continua funcionando', async ({ page, context, isMobile }) => {
    await page.addInitScript(noSpeechSynthesis)
    await page.addInitScript(spyAudioPlay)
    await enterAsNewOwner(context)
    await openSystemTour(page, !!isMobile)
    await startChapter(page, 'primeiros-passos')
    const p = panel(page)
    await expect(p.getByTestId('system-tour-no-speech')).toHaveCount(0)
    const before = (await audioPlays(page)).length
    await p.getByRole('button', { name: 'Ouvir' }).click()
    await expect.poll(async () => (await audioPlays(page)).length).toBe(before + 1)
    await expect(p.getByRole('group', { name: 'Leitura em voz alta' })).toHaveAttribute('data-voice-source', 'server')
  })
})

test('painel do tour sem violações de acessibilidade (axe)', async ({ page, context, isMobile }) => {
  await enterAsNewOwner(context)
  await openSystemTour(page, !!isMobile)
  await startChapter(page, 'primeiros-passos')
  await expect(panel(page).getByRole('heading', { name: 'Bem-vindo ao manual do AtendeRadar' })).toBeFocused()
  // O axe mede contraste errado no meio da animação de entrada (cor ainda em transição): espera terminar
  await panel(page).evaluate((el) =>
    Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  )
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
