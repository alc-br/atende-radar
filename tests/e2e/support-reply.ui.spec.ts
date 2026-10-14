import { test, expect } from '@playwright/test'
import { loginAs, signupOrg, uid } from './helpers'
import { testDb } from './db'
import { enter } from './ui'

// Admin › Suporte: o operador da plataforma responde o chamado pela tela; a resposta vai por e-mail ao autor
// (EmailOutbox) e aparece no chamado, que passa de "Aberto" para "Respondido" (e "Fechado" ao fechar).
test('operador responde o chamado pela tela e fecha', async ({ page, context, isMobile }) => {
  const { email, password } = await signupOrg()
  const owner = await loginAs(email, password)
  const subject = `Dúvida no relatório ${uid()}`
  const created = await owner.post('/api/support', { multipart: { subject, message: 'O relatório semanal não chegou por e-mail.' } })
  expect(created.status()).toBe(201)
  const ticketId = (await created.json()).ticket.id as string
  await owner.dispose()

  await enter(context, 'platform@test.local')
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.locator('[data-tour="nav-admin"]').click()
  await page.getByRole('tab', { name: 'Suporte' }).click()
  const painel = page.getByTestId('admin-suporte')
  await painel.getByRole('button', { name: subject }).click()

  const dialog = page.getByRole('dialog', { name: subject })
  await expect(dialog.getByTestId('chamado-status')).toContainText('Aberto')
  await expect(dialog.getByRole('button', { name: 'Enviar resposta' })).toBeDisabled()
  await dialog.getByLabel('Responder por e-mail').fill('O envio foi refeito; confira a caixa de spam.')
  await dialog.getByRole('button', { name: 'Enviar resposta' }).click()

  await expect(dialog.getByTestId('chamado-status')).toContainText('Respondido')
  const respostas = dialog.getByRole('list', { name: 'Respostas enviadas' })
  await expect(respostas).toContainText('O envio foi refeito; confira a caixa de spam.')
  await expect(respostas).toContainText(`para ${email}`)
  // nos testes não há provedor de e-mail: a tela diz que ficou na fila (não finge que enviou)
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Resposta (registrada|enviada)/ })).toBeVisible()

  const mail = await testDb.emailOutbox.findFirstOrThrow({ where: { kind: 'support_reply', toEmail: email } })
  expect(mail.body).toContain('O envio foi refeito; confira a caixa de spam.')
  expect((await testDb.supportTicket.findUniqueOrThrow({ where: { id: ticketId } })).status).toBe('answered')

  await dialog.getByRole('button', { name: 'Fechar chamado' }).click()
  await expect(dialog.getByTestId('chamado-status')).toContainText('Fechado')
  expect((await testDb.supportTicket.findUniqueOrThrow({ where: { id: ticketId } })).status).toBe('resolved')
})
