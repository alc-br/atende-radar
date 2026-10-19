import { test, expect } from '@playwright/test'
import { newChat, setupCompany } from './gw'
import { testDb } from './db'
import { uid } from './helpers'

// Inadimplência e empresa bloqueada (billing/delinquency.ts):
//  · renovação sem pagamento: 7 dias com tudo liberado (inclusive cadastrar), lembretes no 3º e 6º dia e aviso do
//    bloqueio no 7º (sino + e-mail, uma vez cada); depois, painel bloqueado (402, motivo payment_overdue);
//  · bloqueada, a empresa exporta todos os dados (JSON);
//  · 2 dias depois do bloqueio (qualquer motivo), os números de WhatsApp são desconectados e o que chega é ignorado.
// O tick com { delinquencyAt } roda os avisos e a desconexão como se fosse aquele instante, só para esta empresa.

const DAY = 86_400_000
test.describe.configure({ mode: 'serial' })

const orgIdOf = async (c: Awaited<ReturnType<typeof setupCompany>>) => (await (await c.admin.get('/api/me')).json()).organizationId as string

async function delinquencyTick(c: Awaited<ReturnType<typeof setupCompany>>, orgId: string, at: Date) {
  const r = await c.gw.post('/api/gateway/tick', { data: { delinquencyAt: at.toISOString(), organizationId: orgId } })
  expect(r.status(), await r.text()).toBe(200)
  return (await r.json()) as { pastDueNotices: number; disconnected: number }
}

test('pagamento em atraso: 7 dias liberado, lembretes no 3º e 6º dia, bloqueio no 7º; bloqueada exporta tudo e desconecta em 2 dias', async () => {
  const c = await setupCompany()
  const orgId = await orgIdOf(c)
  await c.send(newChat(), 'Oi, quanto custa o clareamento?', { minutes: 5, pushName: 'Cliente Atraso' })
  const since = new Date(Date.now() - 3600_000)
  await testDb.subscription.update({ where: { organizationId: orgId }, data: { status: 'past_due', pastDueSince: since, trialEnd: null, currentPeriodEnd: since } })

  // dentro da tolerância: tudo funciona, inclusive cadastrar
  const me = await (await c.admin.get('/api/me')).json()
  expect(me.subscriptionLock).toBeNull()
  expect((await c.admin.get('/api/alerts')).status()).toBe(200)
  const created = await c.admin.post('/api/team', { data: { name: 'Atendente Tolerância', email: `tol.${uid()}@cliente.test` } })
  expect(created.status(), await created.text()).toBe(201)
  const sub = (await (await c.admin.get('/api/subscription')).json()).subscription
  expect(sub.status).toBe('past_due')
  expect(sub.graceEndsAt).toBe(new Date(since.getTime() + 7 * DAY).toISOString())

  // lembretes: nada antes do 3º dia; 3º, 6º e o bloqueio no 7º, uma vez cada
  expect((await delinquencyTick(c, orgId, new Date(since.getTime() + 2 * DAY))).pastDueNotices).toBe(0)
  for (const [days, title] of [[3, 'Pagamento em atraso: o painel será bloqueado em'], [6, 'Pagamento em atraso: o painel será bloqueado em'], [7, 'Painel bloqueado por falta de pagamento']] as const) {
    const at = new Date(since.getTime() + days * DAY + 60_000)
    expect((await delinquencyTick(c, orgId, at)).pastDueNotices, `dia ${days}`).toBe(1)
    expect((await delinquencyTick(c, orgId, at)).pastDueNotices, `dia ${days} de novo`).toBe(0)
    const last = await testDb.notification.findFirstOrThrow({ where: { organizationId: orgId, type: 'billing', data: { contains: '"kind":"past_due"' } }, orderBy: { createdAt: 'desc' } })
    expect(last.title).toContain(title)
  }
  const mails = await testDb.emailOutbox.findMany({ where: { organizationId: orgId, kind: { startsWith: 'billing:past_due_' } } })
  expect(mails.filter((m) => (m.kind ?? '').startsWith('billing:past_due_reminder')).length).toBeGreaterThanOrEqual(2)
  expect(mails.some((m) => (m.kind ?? '').startsWith('billing:past_due_locked'))).toBe(true)

  // 8 dias de atraso: painel bloqueado (só Planos/Pagamento), motivo payment_overdue
  const lockedSince = new Date(Date.now() - 8 * DAY)
  await testDb.subscription.update({ where: { organizationId: orgId }, data: { pastDueSince: lockedSince } })
  const locked = await c.admin.get('/api/alerts')
  expect(locked.status()).toBe(402)
  expect((await locked.json()).code).toBe('subscription_locked')
  expect((await (await c.admin.get('/api/me')).json()).subscriptionLock).toMatchObject({ reason: 'payment_overdue' })
  expect((await (await c.admin.get('/api/subscription')).json()).subscription.status).toBe('unpaid')
  const blockedCreate = await c.admin.post('/api/team', { data: { name: 'Atendente Bloqueio', email: `blq.${uid()}@cliente.test` } })
  expect(blockedCreate.status()).toBe(402)

  // bloqueada: exporta todos os dados (JSON), sem segredos
  const exp = await c.admin.get('/api/organization/export')
  expect(exp.status()).toBe(200)
  expect(exp.headers()['content-disposition']).toContain('atenderadar-dados-da-empresa-')
  const text = await exp.text()
  expect(text).not.toContain('passwordHash')
  expect(text).not.toContain('phoneEncrypted')
  const data = JSON.parse(text)
  expect(data.empresa.id).toBe(orgId)
  expect(data.assinatura.status).toBe('past_due')
  expect(data.conversas).toHaveLength(1)
  expect(data.conversas[0].messages[0].text).toContain('clareamento')
  expect(data.contatos[0].phone).toBeTruthy()
  expect(data.atendentes.some((a: { name: string }) => a.name === 'Atendente Tolerância')).toBe(true)
  expect(await testDb.auditLog.count({ where: { organizationId: orgId, action: 'organization.exported' } })).toBe(1)

  // desconexão: bloqueio começou há 1 dia (fim da tolerância) → ainda não; 2 dias depois → desconecta, uma vez
  expect((await delinquencyTick(c, orgId, new Date())).disconnected).toBe(0)
  const later = new Date(Date.now() + DAY + 60_000)
  expect((await delinquencyTick(c, orgId, later)).disconnected).toBe(1)
  expect((await delinquencyTick(c, orgId, later)).disconnected).toBe(0)
  const conn = await testDb.whatsAppConnection.findUniqueOrThrow({ where: { id: c.connectionId } })
  expect(conn).toMatchObject({ status: 'disconnected', statusReason: 'plan_locked', qrCode: null })
  expect(conn.disabledAt).not.toBeNull()
  expect(await testDb.auditLog.count({ where: { organizationId: orgId, action: 'connection.auto_disconnected' } })).toBe(1)
  expect(await testDb.emailOutbox.count({ where: { organizationId: orgId, kind: { startsWith: 'billing:numbers_disconnected' } } })).toBeGreaterThanOrEqual(1)
  expect(await testDb.notification.count({ where: { organizationId: orgId, type: 'billing', data: { contains: '"kind":"numbers_disconnected"' } } })).toBe(1)

  // o que ainda chegar pelo número desconectado é ignorado (nada é guardado)
  const before = await testDb.message.count({ where: { conversation: { organizationId: orgId } } })
  await c.send(newChat(), 'Mensagem depois da desconexão', { pushName: 'Depois' })
  expect(await testDb.message.count({ where: { conversation: { organizationId: orgId } } })).toBe(before)

  // pago (troca de cartão aprovada): volta ao normal, sem data de inadimplência
  await testDb.subscription.update({ where: { organizationId: orgId }, data: { status: 'active', pastDueSince: null, currentPeriodEnd: new Date(Date.now() + 30 * DAY) } })
  expect((await c.admin.get('/api/alerts')).status()).toBe(200)
  await c.dispose()
})

test('teste grátis vencido há 2 dias: números desconectados; antes disso, não', async () => {
  const c = await setupCompany()
  const orgId = await orgIdOf(c)
  const ended = new Date(Date.now() - DAY)
  await testDb.subscription.update({ where: { organizationId: orgId }, data: { status: 'trialing', trialEnd: ended, currentPeriodEnd: ended } })
  expect((await delinquencyTick(c, orgId, new Date())).disconnected).toBe(0)
  expect((await testDb.whatsAppConnection.findUniqueOrThrow({ where: { id: c.connectionId } })).status).not.toBe('disconnected')
  expect((await delinquencyTick(c, orgId, new Date(Date.now() + DAY + 60_000))).disconnected).toBe(1)
  const conn = await testDb.whatsAppConnection.findUniqueOrThrow({ where: { id: c.connectionId } })
  expect(conn).toMatchObject({ status: 'disconnected', statusReason: 'plan_locked' })
  const audit = await testDb.auditLog.findFirstOrThrow({ where: { organizationId: orgId, action: 'connection.auto_disconnected' } })
  expect(JSON.parse(audit.details ?? '{}')).toMatchObject({ reason: 'trial_expired', connections: 1 })
  await c.dispose()
})

test('empresa em dia: nenhum aviso de atraso e nada desconectado', async () => {
  const c = await setupCompany()
  const orgId = await orgIdOf(c)
  await testDb.subscription.update({ where: { organizationId: orgId }, data: { status: 'active', trialEnd: null, currentPeriodEnd: new Date(Date.now() + 30 * DAY) } })
  const r = await delinquencyTick(c, orgId, new Date(Date.now() + 10 * DAY))
  expect(r).toMatchObject({ pastDueNotices: 0, disconnected: 0 })
  expect((await testDb.whatsAppConnection.findUniqueOrThrow({ where: { id: c.connectionId } })).status).not.toBe('disconnected')
  await c.dispose()
})
