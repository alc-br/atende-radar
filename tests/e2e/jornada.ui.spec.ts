import { test, expect, type Page } from '@playwright/test'
import { STRONG, uid } from './helpers'
import { gatewayClient, newChat, minutesAgo } from './gw'
import { lastTokenFor, testDb } from './db'
import { APPROVED, billingData, cardToken } from './pagarme'
import { TOURS } from '../../src/lib/tours'

// Jornada completa de um cliente, do site ao cancelamento, numa empresa nova e sem atalhos no que a pessoa faz na tela:
// site → cadastro → WhatsApp conectado (o gateway é simulado: o QR real é provado no celular, card T6) → mensagens →
// alerta → resolve → convida a equipe → convidado entra → relatório → assina (sandbox Pagar.me) → cancela a renovação →
// exporta e apaga os dados de um cliente (LGPD) → tudo no registro de auditoria.
// Só no desktop: cada passo já é coberto em celular/tablet pelos testes de cada tela.

// Item do menu lateral pela tela que ele abre (o nome visível pode trazer o contador de pendências)
async function irPara(page: Page, view: string) {
  await page.locator(`nav.nav-lateral a[data-tour="nav-${view}"]`).click()
}

test('jornada completa do cliente: do site ao cancelamento', async ({ page, browser, isMobile }) => {
  test.skip(!!isMobile, 'jornada roda no desktop; as telas têm testes próprios no celular')
  test.setTimeout(300_000)
  const sufixo = uid()
  const dono = { nome: 'Dona Jornada', email: `dona.${sufixo}@jornada.test`, empresa: `Clínica Jornada ${sufixo}` }

  await test.step('site: começa o teste grátis pela página de vendas', async () => {
    await page.goto('/')
    await page.locator('header').getByRole('link', { name: /Começar teste grátis/ }).click()
    await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible()
    await page.locator('#signup-name').fill(dono.nome)
    await page.locator('#login-email').fill(dono.email)
    await page.locator('#login-password').fill(STRONG)
    await page.locator('#signup-org').fill(dono.empresa)
    await page.getByRole('button', { name: /Iniciar teste grátis/ }).click()
    await expect(page.getByTestId('trial-banner')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('trial-banner')).toContainText(/1[34] dias/)
  })

  // O guia de telas é testado à parte (tour-roles); aqui ele sairia na frente dos cliques
  for (const tourId of ['welcome', ...Object.keys(TOURS)]) await page.request.patch('/api/tours', { data: { tourId } })
  const org = await testDb.organization.findFirstOrThrow({ where: { adminEmail: dono.email } })

  const gw = await gatewayClient()
  let connectionId = ''
  await test.step('WhatsApp: cadastra a conexão e o gateway informa que conectou', async () => {
    const r = await page.request.post('/api/connections', { data: { name: 'Recepção', phoneNumber: '+5511900005678' } })
    expect(r.status(), await r.text()).toBe(201)
    connectionId = (await r.json()).connection.id
    const st = await gw.post('/api/gateway/events', { data: { eventId: `st-${sufixo}`, connectionId, type: 'connection.status', payload: { status: 'connected' } } })
    expect(st.status()).toBe(200)
    await page.request.patch('/api/settings', { data: { settings: { outsideRule: 'atraso' } } }) // não depender da hora em que o teste roda
  })

  const chat = newChat()
  await test.step('mensagens chegam e o motor aponta o cliente sem resposta', async () => {
    const r = await gw.post('/api/gateway/events', {
      data: {
        eventId: `ev-${sufixo}`, connectionId, type: 'message.received', occurredAt: minutesAgo(40),
        payload: { externalId: `wa-${sufixo}`, chatId: chat, isGroup: false, fromMe: false, text: 'Bom dia, quanto custa a consulta?', messageType: 'text', pushName: 'Cliente Jornada' },
      },
    })
    expect(r.status()).toBe(200)
    expect((await gw.post('/api/gateway/tick', { data: { organizationId: org.id } })).status()).toBe(200)
  })

  await test.step('alertas: vê o cliente na tela e resolve com o motivo', async () => {
    await page.reload()
    await irPara(page, 'alerts')
    const card = page.locator('main').locator('article, li, div').filter({ hasText: 'Cliente Jornada' }).filter({ has: page.getByRole('button', { name: /Resolver/ }) }).last()
    await expect(card).toBeVisible({ timeout: 20_000 })
    await card.getByRole('button', { name: /Resolver/ }).click()
    await page.getByRole('menuitem', { name: 'Cliente respondido' }).click()
    await expect.poll(async () => (await testDb.alert.findMany({ where: { organizationId: org.id, status: 'resolved' } })).length).toBeGreaterThan(0)
  })

  const convidado = { nome: 'Atendente Jornada', email: `atendente.${sufixo}@jornada.test` }
  await test.step('equipe: convida um atendente pela tela', async () => {
    await irPara(page, 'members')
    await page.getByRole('button', { name: /Adicionar membro/ }).click()
    await page.locator('#invite-name').fill(convidado.nome)
    await page.locator('#invite-email').fill(convidado.email)
    await page.getByRole('dialog').getByRole('button', { name: 'Adicionar' }).click()
    await expect(page.locator('main')).toContainText(convidado.email, { timeout: 15_000 })
  })

  await test.step('convidado: abre o link do e-mail, cria a senha e entra no painel', async () => {
    const ctx = await browser.newContext()
    const p2 = await ctx.newPage()
    await p2.goto(`/accept-invite?token=${await lastTokenFor(convidado.email)}`)
    await expect(p2.getByRole('heading', { name: 'Aceitar convite' })).toBeVisible()
    await p2.locator('#new-password').fill(STRONG)
    await p2.locator('#confirm-password').fill(STRONG)
    await p2.locator('button[type="submit"]').click()
    await p2.getByRole('link', { name: /Ir para o AtendeRadar/ }).click()
    await p2.locator('header').getByRole('link', { name: 'Entrar' }).click() // o link leva ao site; entra pelo cabeçalho
    await expect(p2.getByRole('heading', { name: /Bem-vindo de volta/ })).toBeVisible()
    await p2.locator('#login-email').fill(convidado.email)
    await p2.locator('#login-password').fill(STRONG)
    await p2.locator('form').getByRole('button', { name: 'Entrar', exact: true }).click()
    // se o login falhar, o aviso aparece no lugar do painel (e o erro do teste diz qual foi)
    const painelOuErro = p2.locator('nav.nav-lateral').or(p2.locator('[data-sonner-toast][data-type="error"]'))
    await expect(painelOuErro.first()).toBeVisible({ timeout: 45_000 })
    await expect(p2.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)
    await expect(p2.locator('nav.nav-lateral')).toBeVisible()
    await expect(p2.locator('nav.nav-lateral')).not.toContainText('Membros') // atendente não administra a equipe
    await ctx.close()
  })

  await test.step('relatórios: gera agora e baixa o CSV com o cliente', async () => {
    await irPara(page, 'reports')
    await page.getByRole('button', { name: /Gerar agora/ }).first().click()
    await page.getByRole('tab', { name: 'Histórico' }).click()
    const baixar = page.getByRole('link', { name: 'Baixar CSV' }).first()
    await expect(baixar).toBeVisible({ timeout: 30_000 })
    const csv = await (await page.request.get((await baixar.getAttribute('href'))!)).text()
    expect(csv.length).toBeGreaterThan(20)
  })

  const billing = (await (await page.request.get('/api/billing')).json()) as { enabled: boolean; publicKey: string }
  // Sem chaves do Pagar.me no ambiente, este passo fica de fora (o resto da jornada continua valendo)
  if (!billing.enabled) test.info().annotations.push({ type: 'pulado', description: 'assinatura: sem chaves do Pagar.me neste ambiente' })
  else await test.step('assinatura: contrata no sandbox do Pagar.me e cancela a renovação', async () => {
    const plano = await testDb.plan.findFirstOrThrow({ where: { code: 'essencial' } })
    const r = await page.request.post('/api/billing/checkout', { data: { planId: plano.id, cycle: 'monthly', cardToken: await cardToken(billing.publicKey, APPROVED), ...billingData() } })
    expect(r.status(), await r.text()).toBe(200)
    await page.reload()
    await expect(page.getByTestId('trial-banner')).toHaveCount(0)
    expect((await page.request.post('/api/billing/cancel')).status()).toBe(200)
    const sub = await testDb.subscription.findUniqueOrThrow({ where: { organizationId: org.id } })
    expect(sub).toMatchObject({ status: 'active', cancelAtPeriodEnd: true })
  })

  await test.step('LGPD: exporta e depois apaga os dados do cliente', async () => {
    const conv = await testDb.conversation.findFirstOrThrow({ where: { organizationId: org.id } })
    const exp = await page.request.get(`/api/conversations/${conv.id}/privacy/export`)
    expect(exp.status()).toBe(200)
    expect(await exp.text()).toContain('quanto custa a consulta')
    const del = await page.request.post(`/api/conversations/${conv.id}/privacy`, { data: { action: 'erase' } })
    expect(del.status()).toBe(200)
    expect(await testDb.message.count({ where: { conversation: { organizationId: org.id } } })).toBe(0)
  })

  await test.step('auditoria registra o que foi feito', async () => {
    const { entries } = (await (await page.request.get('/api/audit?limit=200')).json()) as { entries: { action: string }[] }
    const acoes = new Set(entries.map((e) => e.action))
    for (const a of ['connection.created', 'member.invited', 'report.generated', 'privacy.export', 'privacy.erase']) expect(acoes, a).toContain(a)
    if (billing.enabled) expect(acoes).toContain('subscription.canceled')
  })
  await gw.dispose()
})
