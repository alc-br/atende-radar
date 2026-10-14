import { test, expect } from '@playwright/test'
import { createUser, loginAs, signupOrg, STRONG, uid } from './helpers'
import { gatewayClient, newChat, setupCompany } from './gw'
import { testDb } from './db'

// T17 · LGPD: o dono encerra a conta. 7 dias para desistir; depois o agendador apaga a empresa e tudo dela.
const DAY = 86400000
type Api = Awaited<ReturnType<typeof loginAs>>

const meOf = async (api: Api) => (await (await api.get('/api/me')).json()) as { organizationId: string; organizationName: string; organizationDeletion: { daysLeft: number; scheduledFor: string } | null }
const auditActions = async (api: Api) => ((await (await api.get('/api/audit')).json()).entries as Array<{ action: string }>).map((e) => e.action)

async function owner() {
  const { email, password } = await signupOrg()
  const api = await loginAs(email, password)
  const me = await meOf(api)
  return { email, password, api, orgId: me.organizationId, orgName: me.organizationName }
}

test.describe('Encerrar conta · pedido e permissões', () => {
  test('só o dono pede ou cancela: gestor e visualizador recebem 403', async () => {
    const o = await owner()
    const gestorEmail = `gestor.${uid()}@cliente.test`
    await createUser(o.api, { email: gestorEmail, role: 'gestor' })
    const gestor = await loginAs(gestorEmail, STRONG)
    expect((await gestor.post('/api/organization/deletion', { data: { password: STRONG, confirmName: o.orgName } })).status()).toBe(403)
    expect((await gestor.delete('/api/organization/deletion')).status()).toBe(403)
    // ler a situação é liberado (a faixa aparece para todos)
    expect((await gestor.get('/api/organization/deletion')).status()).toBe(200)
    expect((await testDb.organization.findUnique({ where: { id: o.orgId } }))?.deletionRequestedAt).toBeNull()
    await gestor.dispose()
    await o.api.dispose()
  })

  test('senha errada ou nome diferente → 400 e nada muda', async () => {
    const o = await owner()
    const wrongPass = await o.api.post('/api/organization/deletion', { data: { password: 'Senha-Errada-123', confirmName: o.orgName } })
    expect(wrongPass.status()).toBe(400)
    expect((await wrongPass.json()).error).toMatch(/senha/i)
    const wrongName = await o.api.post('/api/organization/deletion', { data: { password: o.password, confirmName: `${o.orgName} X` } })
    expect(wrongName.status()).toBe(400)
    expect((await wrongName.json()).error).toMatch(/nome/i)
    expect((await o.api.post('/api/organization/deletion', { data: {} })).status()).toBe(400)
    expect((await meOf(o.api)).organizationDeletion).toBeNull()
    await o.api.dispose()
  })

  test('pedido válido: 7 dias, faixa para todos, WhatsApp desconectado, auditoria, aviso e operador vê', async () => {
    const c = await setupCompany()
    const me = await meOf(c.admin)
    const viewerEmail = `leitor.${uid()}@cliente.test`
    await createUser(c.admin, { email: viewerEmail, role: 'viewer' })

    const res = await c.admin.post('/api/organization/deletion', { data: { password: c.password, confirmName: me.organizationName } })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.deletion.daysLeft).toBe(7)
    const scheduled = new Date(body.deletion.scheduledFor).getTime()
    expect(Math.abs(scheduled - (Date.now() + 7 * DAY))).toBeLessThan(5 * 60_000)

    // faixa: dono e demais membros recebem os dados da exclusão
    expect((await meOf(c.admin)).organizationDeletion?.daysLeft).toBe(7)
    const viewer = await loginAs(viewerEmail, STRONG)
    expect((await meOf(viewer)).organizationDeletion?.daysLeft).toBe(7)
    expect((await (await viewer.get('/api/organization/deletion')).json()).deletion.daysLeft).toBe(7)
    await viewer.dispose()

    const conn = await testDb.whatsAppConnection.findUnique({ where: { id: c.connectionId } })
    expect(conn?.status).toBe('disconnected')
    expect(conn?.disabledAt).not.toBeNull()
    expect(await auditActions(c.admin)).toContain('organization.deletion_requested')
    expect(await testDb.notification.count({ where: { organizationId: me.organizationId, title: 'Exclusão da empresa agendada' } })).toBe(1)

    // pedir de novo não reagenda
    expect((await c.admin.post('/api/organization/deletion', { data: { password: c.password, confirmName: me.organizationName } })).status()).toBe(409)

    const op = await loginAs('platform@test.local')
    const admin = await (await op.get('/api/admin')).json()
    expect(admin.pendingDeletions.some((d: { id: string }) => d.id === me.organizationId)).toBe(true)
    expect(admin.organizations.find((o: { id: string }) => o.id === me.organizationId).deletionScheduledFor).toBeTruthy()
    await op.dispose()
    await c.dispose()
  })

  test('desistir: a faixa some, fica no registro e a assinatura não é reativada sozinha', async () => {
    const o = await owner()
    expect((await o.api.post('/api/organization/deletion', { data: { password: o.password, confirmName: o.orgName } })).status()).toBe(200)
    const before = await testDb.subscription.findUnique({ where: { organizationId: o.orgId } })

    const res = await o.api.delete('/api/organization/deletion')
    expect(res.status()).toBe(200)
    expect((await meOf(o.api)).organizationDeletion).toBeNull()
    const org = await testDb.organization.findUnique({ where: { id: o.orgId } })
    expect(org?.deletionRequestedAt).toBeNull()
    expect(org?.deletionScheduledFor).toBeNull()
    expect(await auditActions(o.api)).toContain('organization.deletion_canceled')
    const after = await testDb.subscription.findUnique({ where: { organizationId: o.orgId } })
    expect(after?.cancelAtPeriodEnd).toBe(before?.cancelAtPeriodEnd)
    expect(after?.status).toBe(before?.status)
    expect((await o.api.delete('/api/organization/deletion')).status()).toBe(409)

    // desistiu: o prazo passar não apaga nada
    const gw = await gatewayClient()
    const tick = await gw.post('/api/gateway/tick', { data: { organizationId: o.orgId, deletionsAt: new Date(Date.now() + 8 * DAY).toISOString() } })
    expect((await tick.json()).deleted).toBe(0)
    expect(await testDb.organization.count({ where: { id: o.orgId } })).toBe(1)
    await gw.dispose()
    await o.api.dispose()
  })
})

test.describe('Encerrar conta · exclusão definitiva após 7 dias', () => {
  test('o agendador apaga a empresa e tudo dela; outra empresa fica intacta', async () => {
    // empresa que será apagada, com conversa, mensagens, alertas e um membro
    const a = await setupCompany()
    const meA = await meOf(a.admin)
    const orgA = meA.organizationId
    const chat = newChat()
    await a.send(chat, 'Quanto custa o clareamento?', { minutes: 40, pushName: 'Cliente Apagado' })
    await a.send(chat, 'Já te retorno em 1 hora', { fromMe: true, minutes: 35 })
    await a.tick({ onlyThisCompany: true })
    const memberEmail = `colega.${uid()}@cliente.test`
    const member = await createUser(a.admin, { email: memberEmail, role: 'atendente' })

    // outra empresa, com dados próprios
    const b = await setupCompany()
    const orgB = (await meOf(b.admin)).organizationId
    await b.send(newChat(), 'Oi, tem horário amanhã?', { minutes: 30, pushName: 'Cliente Fica' })
    await b.tick({ onlyThisCompany: true })
    // a mesma pessoa também é membro da empresa B: lá ela continua
    const shared = await testDb.organizationMember.create({ data: { organizationId: orgB, userId: memberEmail, name: 'Colega', email: memberEmail, role: 'viewer', status: 'active' } })
    const countB = async () => ({
      conversations: await testDb.conversation.count({ where: { organizationId: orgB } }),
      messages: await testDb.message.count({ where: { conversation: { organizationId: orgB } } }),
      members: await testDb.organizationMember.count({ where: { organizationId: orgB } }),
      connections: await testDb.whatsAppConnection.count({ where: { organizationId: orgB } }),
      contacts: await testDb.contact.count({ where: { organizationId: orgB } }),
    })
    const beforeB = await countB()
    expect(beforeB.messages).toBeGreaterThan(0)

    const convIds = (await testDb.conversation.findMany({ where: { organizationId: orgA }, select: { id: true } })).map((x) => x.id)
    expect(convIds.length).toBeGreaterThan(0)
    expect(await testDb.message.count({ where: { conversationId: { in: convIds } } })).toBeGreaterThanOrEqual(2)

    expect((await a.admin.post('/api/organization/deletion', { data: { password: a.password, confirmName: meA.organizationName } })).status()).toBe(200)

    // antes do prazo: nada é apagado
    let r = await a.gw.post('/api/gateway/tick', { data: { organizationId: orgA, deletionsAt: new Date(Date.now() + 6 * DAY).toISOString() } })
    expect(r.status()).toBe(200)
    expect((await r.json()).deleted).toBe(0)
    expect(await testDb.organization.count({ where: { id: orgA } })).toBe(1)

    // passou o prazo: a empresa some com tudo
    r = await a.gw.post('/api/gateway/tick', { data: { organizationId: orgA, deletionsAt: new Date(Date.now() + 7 * DAY + 3600_000).toISOString() } })
    expect(r.status()).toBe(200)
    expect((await r.json()).deleted).toBe(1)

    expect(await testDb.organization.count({ where: { id: orgA } })).toBe(0)
    const where = { organizationId: orgA }
    expect(await testDb.conversation.count({ where })).toBe(0)
    expect(await testDb.message.count({ where: { conversationId: { in: convIds } } })).toBe(0)
    expect(await testDb.contact.count({ where })).toBe(0)
    expect(await testDb.alert.count({ where })).toBe(0)
    expect(await testDb.recoveryItem.count({ where })).toBe(0)
    expect(await testDb.whatsAppConnection.count({ where })).toBe(0)
    expect(await testDb.rawChannelEvent.count({ where: { connectionId: a.connectionId } })).toBe(0)
    expect(await testDb.agent.count({ where })).toBe(0)
    expect(await testDb.organizationMember.count({ where })).toBe(0)
    expect(await testDb.authToken.count({ where: { memberId: member.id } })).toBe(0)
    expect(await testDb.subscription.count({ where })).toBe(0)
    expect(await testDb.auditLog.count({ where })).toBe(0)
    expect(await testDb.notification.count({ where })).toBe(0)
    expect(await testDb.alertRule.count({ where })).toBe(0)
    expect(await testDb.reportDefinition.count({ where })).toBe(0)
    // e-mails de quem não tem mais conta somem; de quem continua em outra empresa, ficam
    expect(await testDb.emailOutbox.count({ where: { toEmail: a.email } })).toBe(0)
    expect(await testDb.emailOutbox.count({ where: { toEmail: memberEmail } })).toBeGreaterThan(0)

    // a sessão do dono deixa de valer
    expect((await a.admin.get('/api/me')).status()).toBe(401)

    // empresa B intacta, inclusive o membro com o mesmo e-mail
    expect(await testDb.organization.count({ where: { id: orgB } })).toBe(1)
    expect(await countB()).toEqual(beforeB)
    expect(await testDb.organizationMember.count({ where: { id: shared.id } })).toBe(1)
    expect((await meOf(b.admin)).organizationDeletion).toBeNull()

    await a.dispose()
    await b.dispose()
  })
})
