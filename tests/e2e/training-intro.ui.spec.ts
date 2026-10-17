import { test, expect } from '@playwright/test'
import { loginAs, signupOrg } from './helpers'
import { enter } from './ui'

// Introdução do treinamento (17/10/2026): ao clicar em "Começar o treinamento", antes da 1ª aula aparece um passo que
// mostra onde ficam todas as aulas (Treinamento do sistema, no rodapé do menu), com outra voz; depois emenda na 1ª aula.

const INTRO_AUDIO = /\/api\/tours\/system\/audio\?chapter=antes-de-comecar&step=0/

test.describe('treinamento: introdução antes da 1ª aula', () => {
  test('destaca "Treinamento do sistema" e "Começar a 1ª aula" abre a aula 1 (só ela salva progresso)', async ({ page, context, isMobile }) => {
    test.skip(!!isMobile, 'no celular o item fica na gaveta do menu; o fluxo é o mesmo')
    const { email, password } = await signupOrg()
    await enter(context, email, password)
    // segura o áudio da introdução: dá tempo de pausar a leitura automática e conferir a tela com calma
    await page.route(INTRO_AUDIO, async (route) => {
      await new Promise((r) => setTimeout(r, 3000))
      await route.continue().catch(() => {})
    })
    await page.goto('/')
    const treino = page.getByTestId('training-banner')
    await expect(treino).toBeVisible({ timeout: 20000 })
    await treino.getByRole('button', { name: 'Começar o treinamento' }).click()

    const panel = page.getByTestId('system-tour-panel')
    await expect(panel).toContainText('Antes de começar')
    await panel.getByTestId('system-tour-auto').click() // pausa a leitura automática
    await expect(panel.getByRole('heading', { name: 'Todas as aulas ficam em "Treinamento do sistema"' })).toBeVisible()

    // o destaque fica sobre o botão "Treinamento do sistema" do menu
    const alvo = (await page.locator('[data-tour="sidebar-tour"]').boundingBox())!
    const destaque = page.locator('.tour-sistema__destaque')
    await expect(destaque).toBeVisible()
    const d = (await destaque.boundingBox())!
    expect(d.x).toBeLessThanOrEqual(alvo.x + 1)
    expect(d.y).toBeLessThanOrEqual(alvo.y + 1)
    expect(d.x + d.width).toBeGreaterThanOrEqual(alvo.x + alvo.width - 1)
    expect(d.y + d.height).toBeGreaterThanOrEqual(alvo.y + alvo.height - 1)

    // a introdução não conta como aula nem salva progresso
    const api = await loginAs(email, password)
    const before = await (await api.get('/api/tours/system')).json()
    expect(JSON.stringify(before)).not.toContain('antes-de-comecar')

    await panel.getByRole('button', { name: 'Começar a 1ª aula' }).click()
    await expect(panel).toContainText('Primeiros passos e navegação')
    await expect(panel.getByTestId('system-tour-step')).toHaveText(/^Passo 1 de \d+$/)
    await expect(panel.getByRole('heading', { name: 'Bem-vindo ao manual do AtendeRadar' })).toBeVisible()
    await expect.poll(async () => JSON.stringify(await (await api.get('/api/tours/system')).json())).toContain('primeiros-passos')
    expect(JSON.stringify(await (await api.get('/api/tours/system')).json())).not.toContain('antes-de-comecar')
    await api.dispose()
  })

  test('com a leitura automática, a introdução fala com a voz dela e segue sozinha para a 1ª aula', async ({ page, context, isMobile }) => {
    test.skip(!!isMobile, 'no celular o item fica na gaveta do menu; o fluxo é o mesmo')
    const { email, password } = await signupOrg()
    await enter(context, email, password)
    await page.goto('/')
    const treino = page.getByTestId('training-banner')
    await expect(treino).toBeVisible({ timeout: 20000 })
    const audio = page.waitForResponse(INTRO_AUDIO)
    await treino.getByRole('button', { name: 'Começar o treinamento' }).click()
    expect([200, 206]).toContain((await audio).status()) // o navegador pode pedir o áudio por intervalo (Range)
    const panel = page.getByTestId('system-tour-panel')
    await expect(panel).toContainText('Primeiros passos e navegação', { timeout: 20000 })
    await expect(panel.getByTestId('system-tour-step')).toHaveText(/^Passo 1 de \d+$/)
  })
})
