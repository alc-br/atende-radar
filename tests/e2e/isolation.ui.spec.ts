import { test, expect, type Page } from '@playwright/test'
import { enter, home, openView } from './ui'

// T3 · isolamento entre empresas PELA TELA. Quem entra na empresa A (OdontoVida, org_seed_1) procura os dados da
// empresa B ("Clínica B", tests/e2e/seed-test-orgs.ts) pela busca do topo, pelas listas e por endereço direto de um
// recurso de B. Nada de B pode aparecer: nem nome de cliente, nem alerta, nem atendente, nem texto de mensagem.
// Os testes de API (isolation.spec.ts, isolation-search.spec.ts) provam o mesmo nas rotas; aqui é o que a pessoa VÊ.
// Cada busca tem um controle na própria empresa A (o item de A aparece), para o teste não passar com a tela vazia.
// Só no desktop: o isolamento é do servidor e o celular mostra os mesmos dados (as telas do celular têm testes próprios).

const SEGREDOS_B = ['Cliente Secreto B', 'Secreto', 'Alerta secreto B', 'Agente B', 'Equipe B', 'Conexão B', 'MENSAGEM CONFIDENCIAL', 'Clínica B', 'Clinica B', 'admin.b@test.local']

async function semDadosDeB(page: Page, onde: string) {
  // textContent inclui o que está escondido (ex.: os cartões do celular no desktop): vazamento escondido também conta
  const texto = ((await page.locator('main').textContent()) ?? '') + ((await page.locator('header.topo').textContent()) ?? '')
  for (const s of SEGREDOS_B) expect(texto, `${onde}: "${s}" não pode aparecer`).not.toContain(s)
}

/** Digita na busca da própria tela (lista) e espera a resposta da API da lista. */
async function buscarNaTela(page: Page, placeholder: string | RegExp, termo: string, apiPath: string) {
  const campo = page.getByPlaceholder(placeholder)
  await expect(campo).toBeVisible({ timeout: 20000 })
  const resp = page.waitForResponse((r) => r.url().includes(apiPath) && r.request().method() === 'GET', { timeout: 20000 }).catch(() => null)
  await campo.fill(termo)
  await campo.press('Enter')
  await resp
  await page.waitForTimeout(600) // debounce das buscas que filtram enquanto digita
}

test.describe('T3 · isolamento pela tela (empresa A procurando dados da empresa B)', () => {
  test.beforeEach(async ({ context, isMobile }) => {
    test.skip(isMobile, 'isolamento é do servidor; a varredura de telas no celular fica em design.ui.spec.ts')
    await enter(context, 'admin.a@test.local')
  })

  test('busca do topo: o cliente de B não aparece (nome nem final do telefone); o de A aparece', async ({ page }) => {
    await home(page)
    const busca = page.locator('[data-tour="header-search"]')

    // controle: a busca do topo acha um cliente da própria empresa A
    await busca.fill('Cliente do Atendente A')
    await busca.press('Enter')
    await expect(page.locator('main').getByRole('heading', { name: /Conversas/i }).first()).toBeVisible({ timeout: 20000 })
    await expect(page.locator('main').getByText('Cliente do Atendente A').locator('visible=true').first()).toBeVisible({ timeout: 20000 })

    for (const termo of ['Cliente Secreto B', 'Secreto', '9999']) {
      const resp = page.waitForResponse((r) => r.url().includes('/api/conversations') && r.url().includes('search='), { timeout: 20000 })
      await busca.fill(termo)
      await busca.press('Enter')
      await resp
      await expect(page.locator('main').getByText('Cliente do Atendente A').locator('visible=true')).toHaveCount(0, { timeout: 20000 })
      await semDadosDeB(page, `busca do topo "${termo}"`)
    }
  })

  test('listas de conversas, alertas, recuperação, equipe e membros: nada de B', async ({ page, isMobile }) => {
    test.setTimeout(180_000) // 5 telas, cada uma compilada sob demanda no next dev
    await home(page)
    await semDadosDeB(page, 'Visão Geral')

    // Conversas: a busca da tela acha o de A e não acha o de B
    await openView(page, 'conversations', isMobile)
    await buscarNaTela(page, 'Buscar por cliente, telefone ou atendente...', 'Cliente do Atendente A', '/api/conversations')
    await expect(page.locator('main').getByText('Cliente do Atendente A').locator('visible=true').first()).toBeVisible({ timeout: 20000 })
    await buscarNaTela(page, 'Buscar por cliente, telefone ou atendente...', 'Secreto', '/api/conversations')
    await expect(page.locator('main').getByText('Cliente do Atendente A').locator('visible=true')).toHaveCount(0)
    await semDadosDeB(page, 'Conversas (busca "Secreto")')

    // Alertas: o alerta de A existe na lista; o de B não aparece nem buscando pelo título
    await openView(page, 'alerts', isMobile)
    await buscarNaTela(page, 'Buscar alertas, clientes ou atendentes...', 'Alerta do atendente A', '/api/alerts')
    await expect(page.locator('main').getByText('Alerta do atendente A').locator('visible=true').first()).toBeVisible({ timeout: 20000 })
    await buscarNaTela(page, 'Buscar alertas, clientes ou atendentes...', 'secreto', '/api/alerts')
    await expect(page.locator('main').getByText('Alerta do atendente A').locator('visible=true')).toHaveCount(0)
    await semDadosDeB(page, 'Alertas (busca "secreto")')

    // Recuperação: idem
    await openView(page, 'recovery', isMobile)
    await buscarNaTela(page, 'Buscar cliente, motivo ou atendente...', 'Cliente do Atendente A', '/api/recovery')
    await expect(page.locator('main').getByText('Cliente do Atendente A').locator('visible=true').first()).toBeVisible({ timeout: 20000 })
    await buscarNaTela(page, 'Buscar cliente, motivo ou atendente...', 'Secreto', '/api/recovery')
    await expect(page.locator('main').getByText('Cliente do Atendente A').locator('visible=true')).toHaveCount(0)
    await semDadosDeB(page, 'Recuperação (busca "Secreto")')

    // Equipe (desempenho por atendente): só atendentes de A
    await openView(page, 'team', isMobile)
    await expect(page.locator('main').getByRole('heading', { name: /Equipe/i }).first()).toBeVisible({ timeout: 20000 })
    await expect(page.locator('main').getByText('Ana Silva').locator('visible=true').first()).toBeVisible({ timeout: 20000 })
    await semDadosDeB(page, 'Equipe')

    // Membros: só pessoas de A
    await openView(page, 'members', isMobile)
    await expect(page.locator('main').getByText('admin.a@test.local').locator('visible=true').first()).toBeVisible({ timeout: 20000 })
    await semDadosDeB(page, 'Membros')
  })

  test('endereço direto de um recurso de B: "não encontrado", sem o nome nem o conteúdo de B', async ({ page }) => {
    // O painel não tem endereço por recurso (a tela troca dentro de "/"); os endereços diretos que existem são os
    // abertos no navegador: exportação de dados do titular, arquivo de relatório, QR e saúde da conexão, perfil do
    // atendente e a própria conversa. Com a sessão de A, todos devem responder 404 sem nada de B no corpo.
    await home(page)
    const urls = [
      '/api/conversations/conv_b',
      '/api/conversations/conv_b/privacy/export',
      '/api/reports/runs/run_b/download',
      '/api/connections/conn_b/qr',
      '/api/connections/conn_b/health',
      '/api/team/agent_b',
    ]
    for (const url of urls) {
      const resp = await page.goto(url)
      expect(resp, url).not.toBeNull()
      expect(resp!.status(), `${url} deve ser "não encontrado"`).toBe(404)
      const corpo = await resp!.text()
      expect(corpo.toLowerCase(), url).toMatch(/n[ãa]o encontrad|not found/)
      for (const s of SEGREDOS_B) expect(corpo, `${url}: "${s}" não pode aparecer`).not.toContain(s)
    }

    // controle: o mesmo tipo de endereço funciona para um recurso da própria empresa A
    const own = await page.goto('/api/conversations/conv_a_own')
    expect(own!.status()).toBe(200)
    expect(await own!.text()).toContain('Cliente do Atendente A')
  })
})
