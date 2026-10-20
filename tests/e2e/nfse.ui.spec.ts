import { test, expect, type Page } from '@playwright/test'
import { signupOrg, uid } from './helpers'
import { testDb } from './db'
import { gatewayClient } from './gw'
import { enter } from './ui'

// Admin › Notas fiscais: o operador vê como a emissão está configurada, a nota emitida com os XML, o motivo de uma
// falha com "Tentar novamente" e cancela uma nota pela tela (motivo + explicação de 15 caracteres ou mais).
// Sistema Nacional falso (NFSE_FAKE=1), mesmo XML e assinatura conferida.

test.describe.configure({ mode: 'serial' })

async function notaDe(tomador: string, status: string) {
  const organizationName = `Empresa NF ${uid()}`
  const { email } = await signupOrg({ organizationName })
  const m = await testDb.organizationMember.findFirstOrThrow({ where: { email } })
  await testDb.billingCustomer.create({
    data: {
      organizationId: m.organizationId, name: tomador, email: 'financeiro@cliente.test', documentType: 'CNPJ', document: '00000000000191',
      zipCode: '80010000', street: 'Rua XV de Novembro', number: '100', neighborhood: 'Centro', city: 'Curitiba', state: 'PR',
    },
  })
  const inv = await testDb.billingInvoice.create({
    data: {
      organizationId: m.organizationId, providerInvoiceId: `in_nfui_${uid()}${uid()}`, providerSubscriptionId: `sub_nfui_${uid()}`, providerChargeId: `ch_${uid()}`,
      planName: 'Pro', billingCycle: 'monthly', amountCents: 9700, status: 'paid', paidAt: new Date(Date.now() - 60_000),
      periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86400_000),
    },
  })
  const gw = await gatewayClient()
  await expect.poll(async () => {
    await gw.post('/api/gateway/tick', { data: {} })
    return (await testDb.nfseDocument.findUnique({ where: { billingInvoiceId: inv.id } }))?.status
  }, { timeout: 30_000, intervals: [300, 500, 1000] }).toBe(status)
  await gw.dispose()
  return { organizationName, invoiceId: inv.id }
}

async function abrirNotas(page: Page, isMobile: boolean) {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-admin"]').click()
  await page.getByRole('tab', { name: 'Notas fiscais' }).click()
  return page.getByTestId('admin-nfse')
}

test('operador vê a configuração e a nota emitida, baixa o XML e cancela pela tela', async ({ page, context, isMobile }) => {
  const { organizationName, invoiceId } = await notaDe('Cliente Tela Ltda', 'issued')
  await enter(context, 'platform@test.local')
  const painel = await abrirNotas(page, isMobile)

  const cfg = painel.getByTestId('nfse-config')
  await expect(cfg).toContainText('Produção restrita (testes, sem valor fiscal)')
  await expect(cfg).toContainText('Sistema Nacional simulado')
  await expect(cfg).toContainText('CNPJ 22629446000112')
  await expect(cfg).toContainText('EMPRESA DE TESTE (CNPJ 22629446000112)')

  await painel.getByRole('button', { name: organizationName }).click()
  const dialog = page.getByRole('dialog', { name: `Nota de ${organizationName}` })
  await expect(dialog.getByTestId('nfse-status')).toContainText('Emitida')
  await expect(dialog).toContainText('Cliente Tela Ltda · CNPJ 00.000.000/0001-91')
  const doc = await testDb.nfseDocument.findUniqueOrThrow({ where: { billingInvoiceId: invoiceId } })
  await expect(dialog).toContainText(doc.chave!)

  // XML da nota: link de download que devolve o XML autorizado
  const link = dialog.getByRole('link', { name: 'XML da nota' })
  await expect(link).toHaveAttribute('href', `/api/admin/nfse/${doc.id}/xml?tipo=nfse`)
  const xml = await page.request.get(`/api/admin/nfse/${doc.id}/xml?tipo=nfse`)
  expect(await xml.text()).toContain(`<infNFSe Id="NFS${doc.chave}">`)
  await expect(dialog.getByRole('link', { name: 'XML do cancelamento' })).toHaveCount(0)

  // cancelamento: confirmar só libera com explicação de 15 caracteres ou mais
  await dialog.getByRole('button', { name: 'Cancelar esta nota' }).click()
  const confirmar = dialog.getByRole('button', { name: 'Confirmar cancelamento' })
  await dialog.getByLabel('Motivo do cancelamento').selectOption('erro')
  await dialog.getByLabel(/Explicação/).fill('curto')
  await expect(confirmar).toBeDisabled()
  await dialog.getByLabel(/Explicação/).fill('Nota emitida com o valor errado')
  await confirmar.click()

  await expect(dialog.getByTestId('nfse-status')).toContainText('Cancelada', { timeout: 15_000 })
  await expect(dialog).toContainText('Erro na emissão: Nota emitida com o valor errado')
  await expect(dialog.getByRole('link', { name: 'XML do cancelamento' })).toBeVisible()
  const cancelada = await testDb.nfseDocument.findUniqueOrThrow({ where: { id: doc.id } })
  expect(cancelada.status).toBe('canceled')
  expect(cancelada.eventoXml).toContain('<tpEvento>101101</tpEvento>')
  expect(cancelada.cancelMotivo).toBe('erro')
  expect(await testDb.auditLog.count({ where: { action: 'nfse.cancel_requested', targetId: doc.id } })).toBe(1)
})

test('falha de emissão aparece com o motivo do governo e "Tentar novamente agora"', async ({ page, context, isMobile }) => {
  const { organizationName } = await notaDe('Empresa NFSE-REJEITAR Ltda', 'failed')
  await enter(context, 'platform@test.local')
  const painel = await abrirNotas(page, isMobile)
  await painel.getByRole('button', { name: 'Falhas' }).click()
  await painel.getByRole('button', { name: organizationName }).click()
  const dialog = page.getByRole('dialog', { name: `Nota de ${organizationName}` })
  await expect(dialog.getByTestId('nfse-status')).toContainText('Falha na emissão')
  await expect(dialog.getByRole('alert')).toContainText('E0000')
  await expect(dialog.getByRole('alert')).toContainText('tentativa 1 de 6')
  await expect(dialog.getByRole('button', { name: 'Cancelar esta nota' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Tentar novamente agora' }).click()
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Nova tentativa pedida.' })).toBeVisible()
})
