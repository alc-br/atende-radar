import { test, expect, type Page } from '@playwright/test'
import { enter, home, openView } from './ui'

// T4/T2 · Dentro das telas, quem não pode agir não vê o botão de escrita (o servidor já recusa com 403 — rbac.spec.ts).
// Antes: leitura e analista viam "Atribuir / Resolver / Ignorar" nos alertas; atendente via as "Ações de correção"
// da conversa e "Atribuir atendente" no lote; supervisor e gestor viam "Nova conexão" e "Excluir" em Conexões.
// Que o menu não mostra Conexões/Configurações para leitura e atendente já é coberto por role-screens.ui.spec.ts.

const card = (page: Page) => page.locator('article.alerta')
const btn = (page: Page, name: string) => page.locator('main').getByRole('button', { name, exact: true })

async function alertsLoaded(page: Page, isMobile: boolean) {
  await openView(page, 'alerts', isMobile)
  await expect(page.locator('main').getByRole('heading', { name: 'Alertas', exact: true })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Carregando alertas' })).toHaveCount(0, { timeout: 15000 })
  await expect(card(page).first()).toBeVisible({ timeout: 15000 })
}

for (const role of ['viewer', 'analista'] as const) {
  test(`${role}: Alertas só para consulta — sem Atribuir, Resolver, Ignorar, Recuperação nem a aba Regras`, async ({ page, context, isMobile }) => {
    await enter(context, `${role}.a@test.local`)
    await home(page)
    await alertsLoaded(page, !!isMobile)
    await expect(page.getByRole('tab', { name: /Ativos/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Regras/ })).toHaveCount(0)
    for (const name of ['Atribuir', 'Acompanhar', 'Resolver', 'Ignorar', 'Falso positivo', 'Recuperação', 'Abrir conversa']) {
      await expect(card(page).getByRole('button', { name, exact: true }), `${role} não deveria ver "${name}"`).toHaveCount(0)
    }
  })
}

test('atendente: trata alertas (Resolver, Ignorar) mas não vê as Regras', async ({ page, context, isMobile }) => {
  await enter(context, 'atendente.a@test.local')
  await home(page)
  await alertsLoaded(page, !!isMobile)
  await expect(page.getByRole('tab', { name: /Regras/ })).toHaveCount(0)
  await expect(card(page).first().getByRole('button', { name: 'Resolver' })).toBeVisible()
  await expect(card(page).first().getByRole('button', { name: 'Ignorar' })).toBeVisible()
})

test('supervisor: vê as Regras, mas sem "Nova regra" e com as chaves de ativar travadas', async ({ page, context, isMobile }) => {
  await enter(context, 'supervisor.a@test.local')
  await home(page)
  await alertsLoaded(page, !!isMobile)
  await page.getByRole('tab', { name: /Regras/ }).click()
  await expect(page.getByRole('region', { name: 'Regras de alerta' })).toBeVisible({ timeout: 15000 })
  await expect(btn(page, 'Nova regra')).toHaveCount(0)
  const switches = page.getByRole('switch', { name: /^Ativar regra / })
  expect(await switches.count()).toBeGreaterThan(0)
  for (const s of await switches.all()) await expect(s).toBeDisabled()
})

test('atendente: na conversa não vê "Ações de correção" nem "Marcar como respondida"; no lote, só recuperação e exportar', async ({ page, context, isMobile }) => {
  test.skip(!!isMobile, 'seleção em lote é da tabela (desktop)')
  await enter(context, 'atendente.a@test.local')
  await home(page)
  await openView(page, 'conversations', false)
  const row = page.locator('table tbody tr', { hasText: 'Cliente do Atendente A' })
  await expect(row).toBeVisible({ timeout: 15000 })

  await row.getByRole('checkbox').check()
  await expect(page.getByText('1 selecionada')).toBeVisible()
  await expect(btn(page, 'Enviar à recuperação')).toBeVisible()
  await expect(btn(page, 'Exportar metadados')).toBeVisible()
  for (const name of ['Atribuir atendente', 'Adicionar tag', 'Marcar como revisada']) await expect(btn(page, name)).toHaveCount(0)
  await page.getByRole('button', { name: 'Limpar seleção' }).click()

  await row.click()
  await expect(page.getByRole('button', { name: 'Mais opções' })).toBeVisible({ timeout: 20000 }) // "Enviar para recuperação" é dele
  await expect(page.getByRole('heading', { name: 'Ações de correção' })).toHaveCount(0)
  for (const name of ['Alterar intenção', 'Alterar urgência', 'Mudar responsável', 'Confirmar venda', 'Confirmar perda', 'Marcar como respondida']) {
    await expect(page.getByRole('button', { name }), `atendente não deveria ver "${name}"`).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Mais opções' }).click()
  await expect(page.getByRole('menuitem', { name: /Enviar para recupera/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Marcar como revisada/ })).toHaveCount(0)
})

for (const role of ['gestor', 'supervisor'] as const) {
  test(`${role}: Conexões só para consulta — sem "Nova conexão", Renomear, Pausar nem Excluir`, async ({ page, context, isMobile }) => {
    await enter(context, `${role}.a@test.local`)
    await home(page)
    await openView(page, 'connections', !!isMobile)
    await expect(page.locator('main').getByRole('heading', { name: /Conex[õo]es/ }).first()).toBeVisible()
    await expect(page.locator('main summary', { hasText: 'Diagnóstico' }).first()).toBeVisible({ timeout: 15000 })
    for (const name of ['Nova conexão', 'Renomear', 'Excluir', 'Reconectar', 'Gerar QR', 'Desconectar']) {
      await expect(page.locator('main').getByRole('button', { name, exact: true }), `${role} não deveria ver "${name}"`).toHaveCount(0)
    }
    await expect(page.locator('main').getByRole('button', { name: /^(Pausar|Retomar)$/ })).toHaveCount(0)
  })
}

test('administrador continua vendo as ações: alertas, regras, correção da conversa e conexões', async ({ page, context, isMobile }) => {
  test.skip(!!isMobile, 'a abertura da conversa pela tabela é do desktop; os botões são os mesmos no celular')
  await enter(context, 'admin.a@test.local')
  await home(page)
  await alertsLoaded(page, false)
  await expect(card(page).first().getByRole('button', { name: 'Atribuir', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /Regras/ }).click()
  await expect(btn(page, 'Nova regra')).toBeVisible({ timeout: 15000 })

  await openView(page, 'conversations', false)
  await page.locator('table tbody tr').first().getByRole('checkbox').check()
  await expect(btn(page, 'Atribuir atendente')).toBeVisible()
  await page.getByRole('button', { name: 'Limpar seleção' }).click()
  await page.locator('table tbody tr').first().click()
  await expect(page.getByRole('heading', { name: 'Ações de correção' })).toBeVisible({ timeout: 20000 })

  await openView(page, 'connections', false)
  await expect(btn(page, 'Nova conexão')).toBeVisible({ timeout: 15000 })
})

test('administrador: "Excluir" conexão pede confirmação e Cancelar não exclui nada', async ({ page, context, isMobile }) => {
  await enter(context, 'admin.a@test.local')
  await home(page)
  await openView(page, 'connections', !!isMobile)
  const excluir = btn(page, 'Excluir').first()
  await expect(excluir).toBeVisible({ timeout: 15000 })
  const deletes: string[] = []
  page.on('request', (r) => { if (r.method() === 'DELETE' && r.url().includes('/api/connections/')) deletes.push(r.url()) })
  await excluir.click()
  const dialog = page.getByRole('dialog', { name: /Excluir a conexão/ })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Excluir conexão' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialog).toHaveCount(0)
  expect(deletes, 'cancelar não pode chamar a exclusão').toEqual([])
})
