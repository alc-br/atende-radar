import { test, expect, type Page } from '@playwright/test'
import { uid } from './helpers'
import { newChat, setupCompany } from './gw'
import { enter } from './ui'

// Empresa cheia de dados (vários números, equipes, atendentes, ~40 conversas com nomes, links e textos longos, alertas,
// regras próprias e relatório): nenhuma tela nem aba pode rolar para os lados, em nenhum tamanho de tela. Uma página
// mais larga que a tela empurra diálogos e menus para fora dela (achado no celular em Alertas › Regras).

const LONG_URL = 'https://loja.exemplo.com.br/produtos/categoria/clareamento-dental-premium-com-moldeira-personalizada?utm_source=whatsapp&utm_medium=conversa&utm_campaign=outubro2026'
const LONG_NAME = 'Maria Aparecida dos Santos Albuquerque Ferreira de Oliveira'

async function overflow(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement
    const extra = root.scrollWidth - root.clientWidth
    if (extra <= 0) return null
    // culpado: desce pela árvore escondendo um filho por vez; o filho que, escondido, acaba com a rolagem é o caminho
    const path: string[] = []
    let node: Element = document.body
    for (let depth = 0; depth < 25; depth++) {
      let next: Element | null = null
      for (const child of [...node.children]) {
        const h = child as HTMLElement
        const prev = h.style.display
        h.style.display = 'none'
        const fixed = root.scrollWidth <= root.clientWidth
        h.style.display = prev
        if (fixed) { next = child; break }
      }
      // vários filhos vazam ao mesmo tempo: segue pelo que vai mais para a direita
      // (pelo que vai mais longe à direita, contando o que transborda de dentro dele)
      const reach = (e: Element) => e.getBoundingClientRect().left + (e as HTMLElement).scrollWidth
      if (!next) next = [...node.children].sort((x, y) => reach(y) - reach(x))[0] ?? null
      if (!next || reach(next) <= root.clientWidth + 1) break
      node = next
      path.push(`${next.tagName.toLowerCase()}.${(next as HTMLElement).className.toString().split(' ')[0]}`)
    }
    return `+${extra}px: ${path.slice(-5).join(' > ')} "${(node.textContent ?? '').trim().slice(0, 40)}" w=${Math.round(node.getBoundingClientRect().width)}`
  })
}

test('empresa cheia: nenhuma tela nem aba rola para os lados', async ({ page, context, isMobile }) => {
  test.setTimeout(480000)
  const c = await setupCompany()
  const { admin } = c

  // números, equipes e atendentes
  const conn2 = (await (await admin.post('/api/connections', { data: { name: 'Comercial e Vendas Corporativas Região Sul', phoneNumber: '+5511900005678' } })).json()).connection?.id as string | undefined
  const conns = [c.connectionId, conn2].filter(Boolean) as string[]
  const teamNames = ['Vendas Corporativas e Grandes Contas', 'Suporte Técnico Pós-venda']
  for (const [i, name] of teamNames.entries()) {
    expect((await admin.post('/api/teams', { data: { name, code: `T${i}${uid().slice(0, 2).toUpperCase()}`, connectionIds: [conns[i % conns.length]] } })).status()).toBe(201)
  }
  const agentNames = ['Carlos Mendes', 'Juliana Albuquerque Ferreira', 'Roberto Carlos da Silva Junior']
  for (const [i, name] of agentNames.entries()) {
    await admin.post('/api/team', { data: { name, email: `${name.split(' ')[0].toLowerCase()}.${uid()}@empresa-com-dominio-bem-comprido.com.br`, role: 'atendente', team: teamNames[i % 2] } })
  }
  for (const role of ['gestor', 'supervisor']) {
    await admin.post('/api/members', { data: { name: `Pessoa ${role} com nome bem comprido`, email: `${role}.${uid()}@empresa-com-dominio-bem-comprido.com.br`, role } })
  }
  // regras próprias com nomes longos
  for (const name of ['Cliente perguntou preço do clareamento e ficou sem retorno', 'Reclamação de atraso na entrega']) {
    await admin.post('/api/alert-rules', { data: { name, type: 'unanswered_question', severity: 'high', config: { minutes: 5 }, scopeTeams: [], exceptions: ['Cliente VIP com contrato anual'] } })
  }

  // ~40 conversas com textos reais e longos
  const scripts: Array<(chat: string, n: number) => Promise<void>> = [
    async (chat, n) => c.send(chat, `Oi, quanto custa o clareamento? Vi aqui ${LONG_URL}`, { minutes: 40 + n, pushName: `${LONG_NAME} ${n}` }),
    async (chat, n) => {
      await c.send(chat, 'Bom dia, vocês têm horário disponível amanhã de manhã para uma avaliação completa?', { minutes: 90 + n, pushName: `Cliente Agendamento ${n}` })
      await c.send(chat, '*Carlos Mendes*: Bom dia! Vou verificar a agenda e te retorno amanhã sem falta.', { minutes: 85 + n, fromMe: true })
    },
    async (chat, n) => c.send(chat, 'Absurdo! Ninguém me responde faz dois dias, péssimo atendimento, quero cancelar meu plano', { minutes: 300 + n, pushName: `Cliente Irritado ${n}` }),
    async (chat, n) => {
      await c.send(chat, 'Pode me passar um orçamento para a família toda?', { minutes: 200 + n, pushName: `Família ${n}` })
      await c.send(chat, 'Juliana Albuquerque Ferreira: Claro! O valor fica R$ 1.250,00 em até 10x no cartão. ' + LONG_URL, { minutes: 190 + n, fromMe: true })
    },
  ]
  for (let n = 0; n < 40; n++) await scripts[n % scripts.length](newChat(), n)
  await c.tick()
  await c.confirmSignatures()
  const convs = await c.conversations()
  for (const cv of convs.slice(0, 6)) await admin.patch(`/api/conversations/${cv.id}`, { data: { addTag: 'Cliente VIP com contrato anual' } })
  const now = Date.now()
  await admin.post('/api/reports/generate', { data: { reportTypeId: 'daily', periodStart: new Date(now - 7 * 86400000).toISOString(), periodEnd: new Date(now).toISOString() } })
  await c.tick()
  const { total } = await c.alerts()
  expect(convs.length).toBeGreaterThanOrEqual(30)
  expect(total).toBeGreaterThan(5)

  await enter(context, c.email, c.password)
  if (process.env.LAYOUT_WIDE_FONT) await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '*{font-family:Verdana,sans-serif!important;letter-spacing:.04em!important}'; document.head.appendChild(st) }))
  await page.goto('/')
  await expect(page.locator('[data-tour="nav-dashboard"]')).toBeAttached({ timeout: 20000 })
  const views = await page.evaluate(() => [...document.querySelectorAll('[data-tour^="nav-"]')].map((e) => e.getAttribute('data-tour')!.slice(4)))
  expect(views.length).toBeGreaterThan(5)

  const problems: string[] = []
  const check = async (where: string) => {
    let o: string | null = null
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(500)
      o = await overflow(page)
      if (!o) break
    }
    if (o) problems.push(`${where} ${o}`)
  }
  for (const v of views) {
    if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
    await page.locator(`[data-tour="nav-${v}"]`).click()
    await page.waitForLoadState('networkidle').catch(() => {})
    await check(v)
    const tabs = await page.locator('main [role=tab]').all()
    for (const t of tabs) {
      const label = ((await t.textContent()) ?? '').trim().slice(0, 20)
      await t.click()
      await page.waitForLoadState('networkidle').catch(() => {})
      await check(`${v} › ${label}`)
    }
  }

  // detalhe de uma conversa
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-conversations"]').click()
  const firstConv = page.locator('main').getByText(LONG_NAME, { exact: false }).filter({ visible: true }).first()
  await firstConv.click()
  await check('conversations › detalhe')
  await page.keyboard.press('Escape')

  console.log(`telas: ${views.join(', ')} · conversas: ${convs.length} · alertas: ${total}`)
  expect(problems, problems.join('\n')).toEqual([])
  await c.dispose()
})
