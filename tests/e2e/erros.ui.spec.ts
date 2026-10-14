import { test, expect } from '@playwright/test'

// D3 · Páginas de erro: endereço inexistente mostra a página "não encontrada" (404), sem detalhe técnico,
// e o botão leva de volta ao sistema. Nos testes os domínios não são separados: "Ir para o painel" vai para "/".
test('endereço inexistente mostra "Página não encontrada" com caminho de volta', async ({ page }) => {
  test.setTimeout(90_000) // em dev a página compila na primeira visita
  const res = await page.goto('/pagina-que-nao-existe-e2e')
  expect(res?.status()).toBe(404)
  const titulo = page.getByRole('heading', { level: 1, name: 'Página não encontrada' })
  await expect(titulo).toBeVisible({ timeout: 30_000 })
  await expect(page).toHaveTitle(/Página não encontrada/)
  expect(await page.locator('body').innerText()).not.toMatch(/\bat \S+ \(|Error:|NEXT_NOT_FOUND/)

  await page.getByRole('link', { name: 'Ir para o painel' }).click()
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\/$/)
  await expect(titulo).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 })
})
