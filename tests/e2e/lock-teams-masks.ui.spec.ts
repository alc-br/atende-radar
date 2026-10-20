import { readFileSync } from 'fs'
import { test, expect } from '@playwright/test'
import { loginAs, signupOrg, uid } from './helpers'
import { enter, openView } from './ui'
import { testDb } from './db'

// Ajustes de 17/10/2026: teste/plano vencido bloqueia tudo (só Planos, perfil e ajuda), supervisor cadastrado de dentro
// do "Criar equipe", máscaras dos campos da empresa e menu lateral com topo e rodapé fixos.

async function company() {
  const { email, password } = await signupOrg()
  const api = await loginAs(email, password)
  const orgId = (await (await api.get('/api/me')).json()).organizationId as string
  return { email, password, api, orgId }
}

test.describe('acesso bloqueado quando o teste acaba', () => {
  test('só Planos, Meu perfil e Ajuda; o menu do painel some; contratando, o painel volta', async ({ page, context }) => {
    const { email, password, api, orgId } = await company()
    const ended = new Date(Date.now() - 60_000)
    await testDb.subscription.update({ where: { organizationId: orgId }, data: { status: 'trialing', trialEnd: ended, currentPeriodEnd: ended } })
    await enter(context, email, password)
    await page.goto('/')
    const shell = page.getByTestId('locked-shell')
    await expect(shell).toBeVisible({ timeout: 20000 })
    await expect(shell).toHaveAttribute('data-reason', 'trial_expired')
    await expect(page.getByTestId('locked-notice')).toContainText('Seu teste grátis terminou')
    // privacidade: o aviso conta que os números são desconectados em até 2 dias (não mais "as mensagens seguem chegando")
    await expect(page.getByTestId('locked-text')).toContainText('desconectados automaticamente em até 2 dias')
    await expect(page.getByTestId('locked-text')).not.toContainText('seguem chegando')
    await expect(page.locator('[data-tour="nav-dashboard"]')).toHaveCount(0)
    await expect(page.getByTestId('current-plan')).toBeVisible({ timeout: 15000 })
    await shell.getByRole('button', { name: 'Meu perfil' }).click()
    await expect(page.locator('main').getByRole('heading', { name: /perfil/i }).first()).toBeVisible()
    // a API também recusa o resto (402 subscription_locked)
    expect((await api.get('/api/alerts')).status()).toBe(402)

    // pagamento confirmado (simulado no banco): ao recarregar, o painel volta inteiro
    await testDb.subscription.update({ where: { organizationId: orgId }, data: { status: 'active', trialEnd: null, currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) } })
    await page.reload()
    await expect(page.locator('[data-tour="nav-dashboard"]').first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('locked-shell')).toHaveCount(0)
    await api.dispose()
  })

  test('pagamento em atraso: 7 dias com faixa e tudo liberado; depois, painel bloqueado com exportação dos dados', async ({ page, context }) => {
    const { email, password, api, orgId } = await company()
    const since = new Date(Date.now() - 2 * 86_400_000)
    await testDb.subscription.update({ where: { organizationId: orgId }, data: { status: 'past_due', pastDueSince: since, trialEnd: null, currentPeriodEnd: since } })
    await enter(context, email, password)
    await page.goto('/')
    // na tolerância: painel inteiro, faixa com o prazo e o botão para trocar o cartão
    await expect(page.locator('[data-tour="nav-dashboard"]').first()).toBeVisible({ timeout: 20000 })
    const warning = page.getByTestId('past-due-warning')
    await expect(warning).toBeVisible({ timeout: 15000 })
    await expect(warning).toContainText('Tudo continua funcionando até')
    await expect(page.getByTestId('grace-ends')).toHaveText(/\d{2}\/\d{2}/)
    await expect(page.getByRole('button', { name: 'Trocar cartão' }).first()).toBeVisible()

    // 8 dias de atraso: bloqueado, motivo próprio, texto da desconexão e exportação de todos os dados
    await testDb.subscription.update({ where: { organizationId: orgId }, data: { pastDueSince: new Date(Date.now() - 8 * 86_400_000) } })
    await page.reload()
    const shell = page.getByTestId('locked-shell')
    await expect(shell).toBeVisible({ timeout: 20000 })
    await expect(shell).toHaveAttribute('data-reason', 'payment_overdue')
    await expect(page.getByTestId('locked-notice')).toContainText('em atraso há mais de 7 dias')
    await expect(page.getByTestId('locked-text')).toContainText('desconectados automaticamente em até 2 dias')
    const download = page.waitForEvent('download')
    await page.getByTestId('locked-notice').getByTestId('org-export').click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^atenderadar-dados-da-empresa-\d{4}-\d{2}-\d{2}\.json$/)
    const data = JSON.parse(readFileSync(await file.path(), 'utf8'))
    expect(data.empresa.id).toBe(orgId)
    expect(await testDb.auditLog.count({ where: { organizationId: orgId, action: 'organization.exported' } })).toBe(1)
    await api.dispose()
  })
})

test.describe('Equipes › Criar equipe sem supervisores', () => {
  test('"Adicionar membro supervisor" convida e volta ao formulário com ele escolhido', async ({ page, context, isMobile }) => {
    const { email, password, api, orgId } = await company()
    await enter(context, email, password)
    await page.goto('/')
    await openView(page, 'teams', !!isMobile)
    await page.locator('[data-tour="teams-create"]').click()
    const dialog = page.getByRole('dialog')
    const team = `Vendas ${uid()}`
    await dialog.locator('#team-name').fill(team)
    // o próprio administrador já aparece; logo abaixo vem "Adicionar membro supervisor"
    await dialog.getByRole('combobox', { name: 'Selecione o supervisor' }).click()
    await page.getByTestId('add-supervisor-option').click()

    const form = dialog.getByTestId('add-supervisor-form')
    await expect(form).toBeVisible()
    const supEmail = `sup.${uid()}@cliente.test`
    await form.locator('#sup-name').fill('Sofia Supervisora')
    await form.locator('#sup-email').fill(supEmail)
    await dialog.getByRole('button', { name: 'Adicionar e escolher' }).click()

    // de volta ao "Criar equipe": nome mantido e a supervisora já escolhida
    await expect(dialog.locator('#team-name')).toHaveValue(team)
    await expect(dialog.getByRole('combobox', { name: 'Selecione o supervisor' })).toContainText('Sofia Supervisora')
    await dialog.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(page.locator('main')).toContainText(team)

    const member = await testDb.organizationMember.findFirstOrThrow({ where: { organizationId: orgId, email: supEmail } })
    expect(member).toMatchObject({ role: 'supervisor', status: 'invited', team })
    const created = await testDb.team.findFirstOrThrow({ where: { organizationId: orgId, name: team } })
    expect(created.supervisorId).toBe(member.id)
    await api.dispose()
  })
})

test.describe('máscaras dos dados da empresa', () => {
  test('CNPJ e telefone com máscara na tela; o servidor confere e guarda formatado', async ({ page, context, isMobile }) => {
    const { email, password, api } = await company()
    for (const tourId of ['welcome', 'dashboard', 'settings']) await api.patch('/api/tours', { data: { tourId } })
    await enter(context, email, password)
    await page.goto('/')
    await openView(page, 'settings', !!isMobile)
    const cnpj = page.locator('#c-cnpj')
    await expect(cnpj).toBeVisible({ timeout: 15000 })
    // a tela pode terminar de carregar os dados da empresa no meio da digitação e repor o campo: digita de novo
    await expect(async () => {
      await cnpj.fill('')
      await cnpj.pressSequentially('11222333000181')
      await expect(cnpj).toHaveValue('11.222.333/0001-81', { timeout: 2000 })
    }).toPass({ timeout: 20000 })
    const tel = page.locator('#c-tel')
    await tel.fill('')
    await tel.pressSequentially('11987654321')
    await expect(tel).toHaveValue('(11) 98765-4321')
    // Site: o https:// fica fixo na frente; colado com http(s)://, sai ao deixar o campo
    const site = page.locator('#c-site')
    await expect(page.locator('.entrada-prefixo').filter({ has: site })).toContainText('https://')
    await site.fill('http://www.minhaloja.com.br')
    await site.blur()
    await expect(site).toHaveValue('www.minhaloja.com.br')
    await site.fill('HTTPS://empresa.com.br')
    await tel.focus()
    await expect(site).toHaveValue('empresa.com.br')
    // gravado com o https:// na frente
    await page.getByRole('button', { name: 'Salvar alterações' }).first().click()
    await expect(page.getByText('Dados da empresa salvos.')).toBeVisible()
    expect((await (await api.get('/api/settings')).json()).organization.website).toBe('https://empresa.com.br')

    // servidor: inválido é recusado com o campo; válido sem máscara é guardado formatado
    const bad = await api.patch('/api/settings', { data: { cnpj: '11111111111111' } })
    expect(bad.status()).toBe(400)
    expect((await bad.json()).field).toBe('cnpj')
    expect((await api.patch('/api/settings', { data: { phone: '123' } })).status()).toBe(400)
    expect((await api.patch('/api/settings', { data: { website: 'sem dominio' } })).status()).toBe(400)
    const ok = await api.patch('/api/settings', { data: { cnpj: '11222333000181', phone: '+55 11 3333-4444', website: 'www.empresa.com.br' } })
    expect(ok.status(), await ok.text()).toBe(200)
    const org = (await (await api.get('/api/settings')).json()).organization
    expect(org).toMatchObject({ cnpj: '11.222.333/0001-81', phone: '(11) 3333-4444', website: 'https://www.empresa.com.br' })
    await api.dispose()
  })
})

test.describe('menu lateral', () => {
  test('logo fixo em cima, rodapé (treinamento e ajuda) fixo embaixo e os itens rolam no meio', async ({ page, context, isMobile }) => {
    test.skip(!!isMobile, 'no celular o menu é gaveta')
    await page.setViewportSize({ width: 1280, height: 700 })
    const { email, password, api } = await company()
    await enter(context, email, password)
    await page.goto('/')
    const aside = page.locator('aside.lateral')
    const scroll = aside.locator('.lateral__rolagem')
    const footer = aside.locator('.lateral__rodape')
    await expect(scroll).toBeVisible({ timeout: 20000 })
    await expect(footer.locator('[data-tour="sidebar-tour"]')).toBeVisible()
    await expect(footer.locator('[data-tour="sidebar-help"]')).toBeVisible()
    expect(await scroll.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto')

    // o rodapé encosta no fim do menu (o conteúdo dele, como a dica do dia, pode carregar depois)
    const bottomGap = async () => {
      const [as, ft] = [(await aside.boundingBox())!, (await footer.boundingBox())!]
      return Math.abs(ft.y + ft.height - (as.y + as.height))
    }
    await expect.poll(bottomGap).toBeLessThan(24)
    // rolar o meio não mexe no logo nem no rodapé
    const logoBefore = (await aside.locator('img').first().boundingBox())!
    await scroll.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    expect(await bottomGap()).toBeLessThan(24)
    expect((await aside.locator('img').first().boundingBox())!.y).toBeCloseTo(logoBefore.y, 0)
    await api.dispose()
  })
})

test.describe('guias rápidos de tela', () => {
  test('Conversas, Conexões, Configurações, Membros, Equipes e Planos abrem sem guia (o Treinamento continua)', async ({ page, context, isMobile }) => {
    const { email, password, api } = await company()
    for (const tourId of ['welcome', 'dashboard']) await api.patch('/api/tours', { data: { tourId } })
    await enter(context, email, password, { tours: false }) // sem marcar os guias como vistos
    await page.goto('/')
    await expect(page.locator('[data-tour="nav-dashboard"]').first()).toBeAttached({ timeout: 20000 })
    for (const view of ['conversations', 'connections', 'settings', 'members', 'teams', 'plans']) {
      await openView(page, view, !!isMobile)
      await page.waitForTimeout(1200) // o guia automático abriria 600 ms depois de chegar na tela
      await expect(page.getByTestId('tour-card'), view).toHaveCount(0)
    }
    // telas com mais coisa (ex.: Alertas) continuam com o guia
    await openView(page, 'alerts', !!isMobile)
    await expect(page.getByTestId('tour-card')).toBeVisible({ timeout: 10000 })
    await api.dispose()
  })
})
