import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { newChat, setupCompany } from './gw'
import { enter, openView } from './ui'

// Exportar os dados de um cliente (LGPD): com "Exportação pelo titular" desligada, a tela avisa e NÃO baixa nada.
// Antes era um link direto e o navegador baixava um .json contendo a mensagem de erro.
async function openExport(page: Page, isMobile: boolean) {
  await page.goto('/')
  await openView(page, 'conversations', isMobile)
  if (isMobile) await page.getByTestId('conversation-cards').getByRole('button').first().click()
  else await page.locator('table tbody tr').first().click()
  await page.getByRole('button', { name: 'Privacidade do cliente' }).click({ timeout: 20000 })
  await page.getByRole('menuitem', { name: /Exportar dados/ }).click()
}

test('exportação desligada: aviso na tela e nenhum arquivo baixado; ligada: baixa o JSON', async ({ page, context, isMobile }) => {
  const c = await setupCompany()
  await c.send(newChat(), 'Oi, quero meus dados', { minutes: 5, pushName: 'Titular Teste' })
  await c.settings({ privExport: false })
  await enter(context, c.email, c.password)

  const downloads: string[] = []
  page.on('download', (d) => downloads.push(d.suggestedFilename()))
  await openExport(page, !!isMobile)
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toContainText('desligada em Configurações › Privacidade', { timeout: 10000 })
  await page.waitForTimeout(1000)
  expect(downloads).toEqual([])

  await c.settings({ privExport: true })
  const download = page.waitForEvent('download')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Privacidade do cliente' }).click()
  await page.getByRole('menuitem', { name: /Exportar dados/ }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^dados-cliente-.*\.json$/)
  const body = JSON.parse(readFileSync(await file.path(), 'utf8'))
  expect(body.conversations.length).toBeGreaterThan(0)
  await c.dispose()
})
