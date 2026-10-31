import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { uid } from './helpers'
import { CRM_VIEWS, audit, crmCompany, enter, openView, pageOverflow, settle } from './crm-ui'
import { crmOffAfterFile } from './crm-cleanup'

// F4 · telas do CRM comercial no navegador (docs/crm/06-ux-e-design.md): menu "Comercial", quadro de negócios (criar,
// mover pelo menu, pelo teclado e arrastando, e o que mudou fica gravado), fechar como ganho e como perdido, acessibilidade
// (axe) nos dois temas em todas as telas do CRM e nenhuma rolagem lateral da página de 320 a 1920 px.

crmOffAfterFile()

const board = (page: Page) => page.getByRole('region', { name: 'Quadro de negócios' })
const column = (page: Page, i: number) => board(page).locator('section.crm-coluna').nth(i)
const cardIn = (page: Page, i: number, title: string) => column(page, i).getByRole('button', { name: title, exact: true })

async function seed(api: APIRequestContext) {
  const tag = uid()
  const company = (await (await api.post('/api/crm/companies', { data: { name: `Empresa Cliente ${tag}`, segment: 'Varejo' } })).json()).company
  const person = (await (await api.post('/api/crm/contacts', { data: { name: `Cliente Teste ${tag}`, email: `cliente.${tag}@cliente.test`, companyId: company.id } })).json()).person
  const r = await api.post('/api/crm/deals', { data: { title: `Proposta ${tag}`, personId: person.id, companyId: company.id, amountCents: 250000 } })
  expect(r.status(), await r.text()).toBe(201)
  const deal = (await r.json()).deal
  const due = new Date(Date.now() + 86400000).toISOString()
  const t = await api.post('/api/crm/activities', { data: { type: 'call', title: 'Ligar para confirmar a proposta', dealId: deal.id, dueAt: due } })
  expect(t.status(), await t.text()).toBe(201)
  return { company, person, deal }
}

test('Negócios: criar pelo diálogo, mover pelo menu, pelo teclado e arrastando; fechar como ganho e como perdido', async ({ page, context, isMobile }) => {
  test.setTimeout(180000)
  const c = await crmCompany()
  await enter(context, c.admin)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await openView(page, 'crm-deals')
  await expect(page.getByRole('heading', { level: 1, name: 'Negócios' })).toBeVisible()
  await expect(page.getByText('Nenhum negócio aberto')).toBeVisible()

  // criar: sem título não envia; com título, o cartão aparece na primeira etapa
  const title = `Negócio UI ${uid()}`
  await page.locator('[data-tour="crm-new-deal"]').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Novo negócio' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Criar negócio' }).click()
  await expect(dialog.getByText('Informe o título do negócio.')).toBeVisible()
  await dialog.locator('#crm-nd-titulo').fill(title)
  await dialog.getByRole('button', { name: 'Criar negócio' }).click()
  await expect(page.getByText('Negócio criado.')).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect(board(page)).toBeVisible()
  const stages = await board(page).locator('section.crm-coluna h2').allTextContents()
  expect(stages.length).toBeGreaterThanOrEqual(3)
  await expect(cardIn(page, 0, title)).toBeVisible()

  // mover pelo menu (o caminho que funciona em qualquer tela); o foco volta ao botão Mover do cartão
  const moveBtn = board(page).getByRole('button', { name: `Mover ${title} para outra etapa` })
  await moveBtn.click()
  await page.getByRole('menuitem', { name: stages[1], exact: true }).click()
  await expect(page.getByText(`Negócio movido para ${stages[1]}.`)).toBeVisible()
  await expect(cardIn(page, 1, title)).toBeVisible()
  await expect(moveBtn).toBeFocused()

  let finalStage = 1
  if (!isMobile) {
    // teclado: espaço pega, seta para a direita vai à próxima etapa, espaço solta. Cada passo espera o aviso do quadro
    // (role=status): no WebKit a seta apertada antes de o quadro medir as colunas não sai do lugar, e aí ela é repetida
    const live = page.getByRole('status').filter({ hasText: title })
    await board(page).getByRole('button', { name: `Arrastar ${title}` }).focus()
    await page.keyboard.press('Space')
    // o "Movendo" pode ser trocado logo pelo aviso de onde o card está (no Chromium chega a sumir antes da leitura)
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await expect(live).toContainText(new RegExp(`Movendo ${esc(title)}|${esc(title)} sobre a etapa ${esc(stages[1])}\\.`))
    await expect(async () => {
      if (!(await live.textContent())?.includes(`sobre a etapa ${stages[2]}`)) await page.keyboard.press('ArrowRight')
      await expect(live).toContainText(`${title} sobre a etapa ${stages[2]}.`, { timeout: 1000 })
    }).toPass({ timeout: 10000 })
    await page.keyboard.press('Space')
    await expect(page.getByText(`Negócio movido para ${stages[2]}.`)).toBeVisible()
    await expect(cardIn(page, 2, title)).toBeVisible()

    // arrastar com o ponteiro pela alça, de volta à etapa anterior. Em 1920 px as colunas 1 e 2 ficam no meio do quadro,
    // longe das bordas que rolam sozinhas durante o arraste; o alvo é medido de novo no caminho e o quadro avisa onde
    // soltou.
    const viewport = page.viewportSize()!
    await page.setViewportSize({ width: 1920, height: 900 })
    const handle = board(page).getByRole('button', { name: `Arrastar ${title}` })
    await handle.scrollIntoViewIfNeeded()
    const from = (await handle.boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 - 12, from.y + from.height / 2 + 8, { steps: 4 })
    await page.waitForTimeout(150)
    const to = (await column(page, 1).boundingBox())!
    await page.mouse.move(to.x + to.width / 2, to.y + 90, { steps: 14 })
    await page.waitForTimeout(150)
    const again = (await column(page, 1).boundingBox())!
    await page.mouse.move(again.x + again.width / 2, again.y + 90, { steps: 2 })
    // a gravação termina antes de recarregar (no Firefox o reload chegava antes do POST e o cartão voltava)
    const saved = page.waitForResponse((r) => r.url().includes('/api/crm/deals/') && r.url().endsWith('/stage') && r.request().method() === 'POST')
    await page.mouse.up()
    await expect(page.getByRole('status').filter({ hasText: `${title} solto na etapa ${stages[1]}.` })).toHaveCount(1)
    expect((await saved).status()).toBe(200)
    await expect(cardIn(page, 1, title)).toBeVisible({ timeout: 10000 })
    await page.setViewportSize(viewport)
    finalStage = 1
  }

  // gravado de verdade: depois de recarregar, o cartão continua na etapa
  await page.reload()
  await openView(page, 'crm-deals')
  await expect(cardIn(page, finalStage, title)).toBeVisible()
  const deal = ((await (await c.admin.get('/api/crm/deals?limit=5')).json()).items as { id: string; title: string; stageId: string }[]).find((d) => d.title === title)!
  const pipeline = (await (await c.admin.get('/api/crm/pipelines')).json()).pipelines?.[0]
  if (pipeline?.stages) expect(pipeline.stages.find((s: { id: string }) => s.id === deal.stageId)?.name).toBe(stages[finalStage])

  // abrir o negócio e fechar como ganho (sem valor informado), reabrir e fechar como perdido
  await cardIn(page, finalStage, title).click()
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await page.getByRole('button', { name: 'Marcar como ganho' }).click()
  const won = page.getByRole('dialog')
  await expect(won.getByRole('button', { name: 'Confirmar ganho' })).toBeDisabled()
  await won.getByLabel('Fechou sem valor informado').check()
  await won.getByRole('button', { name: 'Confirmar ganho' }).click()
  await expect(page.getByText('Negócio marcado como ganho.')).toBeVisible()
  await page.getByRole('button', { name: 'Reabrir', exact: true }).click()
  const reopen = page.getByRole('dialog', { name: 'Reabrir negócio' })
  await reopen.getByLabel('Motivo da reabertura').fill('O cliente desistiu da compra')
  await reopen.getByRole('button', { name: 'Reabrir negócio' }).click()
  await expect(page.getByText('Negócio reaberto.')).toBeVisible()
  await expect(reopen).toBeHidden()
  await page.getByRole('button', { name: 'Marcar como perdido' }).click()
  const lost = page.getByRole('dialog')
  await lost.locator('#crm-lost-motivo').selectOption({ index: 1 })
  await lost.getByRole('button', { name: 'Confirmar perda' }).click()
  await expect(page.getByText('Negócio marcado como perdido.')).toBeVisible()
  const closed = (await (await c.admin.get(`/api/crm/deals/${deal.id}`)).json()).deal
  expect(closed.status).toBe('lost')

  // de volta ao quadro: só negócios abertos
  await page.getByRole('button', { name: 'Voltar para negócios' }).click()
  await expect(page.getByText('Nenhum negócio aberto')).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
  await c.admin.dispose()
})

test.describe('CRM · acessibilidade e temas', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`telas do CRM em tema ${theme}: sem violações críticas/sérias e sem rolagem lateral`, async ({ page, context }, info) => {
      test.setTimeout(300000)
      await context.addInitScript((t) => window.localStorage.setItem('theme', t), theme)
      const c = await crmCompany()
      const data = await seed(c.admin)
      await enter(context, c.admin)
      const problems: string[] = []
      const shot = (name: string) => page.screenshot({ path: `test-results/screens/crm-${theme}-${info.project.name}-${name}.png`, fullPage: true })
      const check = async (name: string) => {
        await settle(page)
        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
        expect(isDark, `tema ${theme} não foi aplicado`).toBe(theme === 'dark')
        for (const p of await audit(page, `${info.project.name}-${theme}-${name}`)) problems.push(`[${name}] ${p}`)
        const over = await pageOverflow(page)
        if (over > 1) problems.push(`[${name}] a página rola ${over}px para o lado`)
        await shot(name)
      }

      await page.goto('/')
      for (const { view, h1 } of CRM_VIEWS) {
        await openView(page, view)
        await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible()
        await check(view)
      }

      // detalhes e o diálogo de novo negócio
      await openView(page, 'crm-deals')
      await board(page).getByRole('button', { name: data.deal.title, exact: true }).click()
      await expect(page.getByRole('heading', { level: 1, name: data.deal.title })).toBeVisible()
      await check('crm-deal')
      await openView(page, 'crm-contacts')
      await page.locator('main').getByRole('button', { name: data.person.name, exact: true }).first().click()
      await expect(page.getByRole('heading', { level: 1, name: data.person.name })).toBeVisible()
      await check('crm-contact')
      await openView(page, 'crm-companies')
      await page.locator('main').getByRole('button', { name: data.company.name, exact: true }).first().click()
      await expect(page.getByRole('heading', { level: 1, name: data.company.name })).toBeVisible()
      await check('crm-company')
      await openView(page, 'crm-deals')
      await page.locator('[data-tour="crm-new-deal"]').click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await settle(page)
      for (const p of await audit(page, `${info.project.name}-${theme}-crm-novo-negocio`, '[role="dialog"]')) problems.push(`[novo negócio] ${p}`)
      await shot('crm-novo-negocio')

      expect(problems, problems.join('\n')).toEqual([])
      await c.admin.dispose()
    })
  }
})

test('CRM: nenhuma tela rola para o lado de 320 a 1920 px', async ({ page, context, isMobile }) => {
  test.skip(!!isMobile, 'a varredura de larguras roda no projeto de desktop (a janela muda de tamanho)')
  test.setTimeout(300000)
  const c = await crmCompany()
  await seed(c.admin)
  await enter(context, c.admin)
  const problems: string[] = []
  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    for (const { view, h1 } of CRM_VIEWS) {
      await openView(page, view)
      await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible()
      await settle(page)
      const over = await pageOverflow(page)
      if (over > 1) problems.push(`${view} em ${width}px: rola ${over}px para o lado`)
    }
  }
  expect(problems, problems.join('\n')).toEqual([])
  await c.admin.dispose()
})

test('T08.02 · texto hostil gravado aparece como texto nas listas e nos detalhes do CRM e não roda nada', async ({ page, context }) => {
  test.setTimeout(180000)
  const c = await crmCompany()
  const tag = uid()
  const hostile = {
    company: `<svg onload="window.__crmXss=1">Empresa ${tag}`,
    person: `<img src=x onerror="window.__crmXss=2">Pessoa ${tag}`,
    notes: `<b onmouseover="window.__crmXss=3">nota ${tag}</b>`,
    deal: `<script>window.__crmXss=4</script>Negócio ${tag}`,
  }
  const company = (await (await c.admin.post('/api/crm/companies', { data: { name: hostile.company } })).json()).company
  const person = (await (await c.admin.post('/api/crm/contacts', { data: { name: hostile.person, notes: hostile.notes, companyId: company.id } })).json()).person
  const r = await c.admin.post('/api/crm/deals', { data: { title: hostile.deal, personId: person.id, companyId: company.id } })
  expect(r.status(), await r.text()).toBe(201)
  await enter(context, c.admin)
  const dialogs: string[] = []
  page.on('dialog', (d) => {
    dialogs.push(d.message())
    void d.dismiss()
  })
  // nada injetado: nenhuma marca no window e nenhum elemento com os atributos do texto hostil no documento
  const injected = () =>
    page.evaluate(() => ({
      flag: (window as unknown as { __crmXss?: number }).__crmXss ?? null,
      nodes: document.querySelectorAll('img[src="x"], svg[onload], [onerror], [onmouseover]').length,
    }))
  const clean = { flag: null, nodes: 0 }

  await page.goto('/')
  await openView(page, 'crm-deals')
  await expect(board(page).getByRole('button', { name: hostile.deal, exact: true })).toBeVisible()
  expect(await injected()).toEqual(clean)
  await board(page).getByRole('button', { name: hostile.deal, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: hostile.deal })).toBeVisible()
  await expect(page.locator('main').getByText(hostile.person).first()).toBeVisible()
  expect(await injected()).toEqual(clean)

  await openView(page, 'crm-contacts')
  await page.locator('main').getByRole('button', { name: hostile.person, exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: hostile.person })).toBeVisible()
  await expect(page.locator('main').getByText(hostile.notes)).toBeVisible()
  await page.locator('main').getByText(hostile.notes).hover()
  expect(await injected()).toEqual(clean)

  await openView(page, 'crm-companies')
  await page.locator('main').getByRole('button', { name: hostile.company, exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: hostile.company })).toBeVisible()
  expect(await injected()).toEqual(clean)
  expect(dialogs).toEqual([])
  await c.admin.dispose()
})
