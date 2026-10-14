import { test, expect } from '@playwright/test'
import { loginAs, uid } from './helpers'
import { testDb } from './db'

// V7 · Admin › Planos na tela: o operador da plataforma edita um plano (aqui, um plano de teste fora de venda, para não
// mexer nos três planos do site) e a tela avisa que preço novo vale só para novas contratações.

test('operador edita nome, preço e destaques de um plano em Admin › Planos', async ({ page, context, isMobile }) => {
  const code = `teste_ui_${uid()}`
  const plan = await testDb.plan.create({
    data: { code, name: 'Plano Tela', description: 'Antes', monthlyPrice: 7777, annualPrice: 77770, active: false, sortOrder: 98, features: JSON.stringify({ conversation_audit: true }) },
  })
  try {
    const api = await loginAs('platform@test.local')
    for (const tourId of ['welcome', 'dashboard', 'admin']) await api.patch('/api/tours', { data: { tourId } })
    await context.addCookies((await api.storageState()).cookies)
    await api.dispose()

    await page.goto('/')
    if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
    await page.locator('[data-tour="nav-admin"]').click()
    await page.getByRole('tab', { name: 'Planos' }).click()
    const row = page.getByTestId(`admin-plano-${code}`)
    await expect(row).toContainText('Plano Tela')
    await expect(row).toContainText('Fora de venda')
    await expect(page.getByTestId('admin-plano-gestao')).toBeVisible()

    await row.getByRole('button', { name: 'Editar plano Plano Tela' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('aviso-preco')).toContainText('vale só para quem contratar a partir de agora')
    await expect(dialog).toContainText('Os limites são as cotas')
    await dialog.getByLabel('Nome').fill('Plano Tela Editado')
    await dialog.getByLabel('Descrição').fill('Depois')
    await dialog.getByLabel('Mensal (R$)').fill('1.234,50')
    await dialog.getByLabel('Acesso à API').check()
    await dialog.getByRole('button', { name: 'Salvar plano' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(row).toContainText('Plano Tela Editado')

    const saved = await testDb.plan.findUniqueOrThrow({ where: { id: plan.id } })
    expect(saved).toMatchObject({ name: 'Plano Tela Editado', description: 'Depois', monthlyPrice: 1234.5, annualPrice: 77770, active: false })
    expect(JSON.parse(saved.features)).toMatchObject({ conversation_audit: true, api_access: true })
  } finally {
    await testDb.plan.deleteMany({ where: { id: plan.id } })
  }
})
