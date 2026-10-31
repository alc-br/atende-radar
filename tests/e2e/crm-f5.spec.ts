import { test, expect, type APIRequestContext } from '@playwright/test'
import { createUser, loginAs, signupOrg, uid } from './helpers'
import { testDb } from './db'
import { crmOffAfterFile } from './crm-cleanup'

// F5 · inteligência comercial no dia a dia (CRM-04, CRM-05, CRM-07): tarefa a partir de alerta e de item de recuperação,
// e os negócios ligados a uma conversa. A origem passa pelo mesmo escopo das telas de alertas e recuperação; contato
// excluído do monitoramento nunca aparece; uma tarefa aberta por causa; a ação humana tira a sugestão automática.

crmOffAfterFile()

let operator: APIRequestContext
test.beforeAll(async () => {
  operator = await loginAs('platform@test.local')
})
test.afterAll(async () => {
  await operator.dispose()
})

async function company() {
  const { email, password } = await signupOrg()
  const admin = await loginAs(email, password)
  const me = await (await admin.get('/api/me')).json()
  const orgId = me.organizationId as string
  expect((await operator.patch(`/api/admin/organizations/${orgId}/crm`, { data: { enabled: true } })).status()).toBe(200)
  return { admin, orgId, memberId: me.member.id as string }
}

/** Conversa (com contato e atendente monitorado) direto no banco: o que importa aqui é o escopo, não a análise. */
async function conversation(orgId: string, agentEmail: string) {
  const agent = await testDb.agent.create({ data: { organizationId: orgId, name: `Atendente ${uid()}`, email: agentEmail } })
  const contact = await testDb.contact.create({ data: { organizationId: orgId, displayName: `Cliente ${uid()}` } })
  const conv = await testDb.conversation.create({ data: { organizationId: orgId, agentId: agent.id, contactId: contact.id } })
  return { agent, contact, conv }
}

const newAlert = (orgId: string, conversationId: string) =>
  testDb.alert.create({ data: { organizationId: orgId, conversationId, title: 'Cliente esperando resposta', severity: 'high' } })

async function newDeal(api: APIRequestContext, data: Record<string, unknown> = {}) {
  const r = await api.post('/api/crm/deals', { data: { title: `Negócio ${uid()}`, ...data } })
  expect(r.status(), await r.text()).toBe(201)
  return (await r.json()).deal as { id: string; ownerMemberId: string | null }
}

const task = (api: APIRequestContext, data: Record<string, unknown>) => api.post('/api/crm/activities', { data: { type: 'follow_up', title: 'Retornar ao cliente', ...data } })

test.describe('F5 · tarefa a partir de alerta', () => {
  test('uma tarefa aberta por alerta; liga o negócio à conversa; a sugestão automática de tarefa deixa de valer; auditada', async () => {
    const c = await company()
    const { conv } = await conversation(c.orgId, `ag.${uid()}@cliente.test`)
    const alert = await newAlert(c.orgId, conv.id)
    const deal = await newDeal(c.admin, { ownerMemberId: c.memberId })
    const pending = await testDb.crmSuggestion.create({
      data: { organizationId: c.orgId, kind: 'create_task', alertId: alert.id, dealId: deal.id, payloadJson: '{}', reason: 'Alerta aberto', ruleVersion: 'test', dedupeKey: `${c.orgId}:t:${uid()}` },
    })

    const r = await task(c.admin, { alertId: alert.id, dealId: deal.id })
    expect(r.status(), await r.text()).toBe(201)
    const first = await r.json()
    expect(first.created).toBe(true)
    expect(first.activity).toMatchObject({ source: 'alert', sourceId: alert.id, dealId: deal.id })

    // pedir de novo (outro título, outro clique) devolve a mesma tarefa aberta
    const again = await task(c.admin, { alertId: alert.id, title: 'Outro título' })
    expect(again.status()).toBe(200)
    expect(await again.json()).toMatchObject({ created: false, activity: { id: first.activity.id } })
    expect(await testDb.crmActivity.count({ where: { organizationId: c.orgId, source: 'alert', sourceId: alert.id } })).toBe(1)

    expect(await testDb.crmBusinessLink.count({ where: { dealId: deal.id, alertId: alert.id, conversationId: conv.id } })).toBe(1)
    expect((await testDb.crmSuggestion.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('expired')
    const audit = await testDb.auditLog.findFirst({ where: { organizationId: c.orgId, action: 'crm.activity_created', targetId: first.activity.id } })
    expect(audit?.details).toContain('"source":"alert"')

    // concluída, a mesma causa pode gerar outra tarefa
    const done = await c.admin.patch(`/api/crm/activities/${first.activity.id}`, { data: { status: 'done', version: first.activity.version } })
    expect(done.status(), await done.text()).toBe(200)
    const next = await task(c.admin, { alertId: alert.id })
    expect(next.status()).toBe(201)
    expect((await next.json()).activity.id).not.toBe(first.activity.id)
    await c.admin.dispose()
  })

  test('entrada e isolamento: alerta e recuperação juntos = 400; de outra empresa ou inexistente = 404; contato excluído = 404', async () => {
    const c = await company()
    const other = await company()
    const { conv, contact } = await conversation(c.orgId, `ag.${uid()}@cliente.test`)
    const alert = await newAlert(c.orgId, conv.id)
    const foreign = await conversation(other.orgId, `ag.${uid()}@cliente.test`)
    const foreignAlert = await newAlert(other.orgId, foreign.conv.id)
    const item = await testDb.recoveryItem.create({ data: { organizationId: c.orgId, conversationId: conv.id } })

    expect((await task(c.admin, { alertId: alert.id, recoveryItemId: item.id })).status()).toBe(400)
    const cross = await task(c.admin, { alertId: foreignAlert.id })
    expect(cross.status()).toBe(404)
    expect((await cross.json()).code).toBe('crm_not_found')
    expect((await task(c.admin, { alertId: 'alerta-que-nao-existe' })).status()).toBe(404)
    expect(await testDb.crmActivity.count({ where: { organizationId: { in: [c.orgId, other.orgId] } } })).toBe(0)

    // contato excluído do monitoramento (privacidade): o alerta e o item de recuperação somem para o CRM
    await testDb.contact.update({ where: { id: contact.id }, data: { excluded: true } })
    expect((await task(c.admin, { alertId: alert.id })).status()).toBe(404)
    expect((await task(c.admin, { recoveryItemId: item.id })).status()).toBe(404)
    expect((await c.admin.get(`/api/crm/deals?conversationId=${conv.id}`)).status()).toBe(404)
    await c.admin.dispose()
    await other.admin.dispose()
  })

  test('atendente: só alertas das conversas dele; tarefa aberta de outra pessoa para o mesmo alerta não vaza', async () => {
    const c = await company()
    const att = `atendente.${uid()}@cliente.test`
    const attMember = await createUser(c.admin, { email: att, role: 'atendente' })
    const a = await loginAs(att, 'Senha-Forte-2026x')
    const mine = await conversation(c.orgId, att)
    const theirs = await conversation(c.orgId, `outro.${uid()}@cliente.test`)
    const myAlert = await newAlert(c.orgId, mine.conv.id)
    const otherAlert = await newAlert(c.orgId, theirs.conv.id)

    expect((await task(a, { alertId: otherAlert.id })).status()).toBe(404)
    const own = await task(a, { alertId: myAlert.id })
    expect(own.status(), await own.text()).toBe(201)
    expect((await own.json()).activity.ownerMemberId).toBe(attMember.id)

    // o admin já tinha uma tarefa aberta para outro alerta da conversa do atendente, com ele mesmo de responsável
    const shared = await newAlert(c.orgId, mine.conv.id)
    expect((await task(c.admin, { alertId: shared.id, title: 'Nota do gestor', ownerMemberId: c.memberId })).status()).toBe(201)
    const dup = await task(a, { alertId: shared.id })
    expect(dup.status()).toBe(409)
    const body = await dup.text()
    expect(body).toContain('crm_duplicate')
    expect(body).not.toContain('Nota do gestor')
    await a.dispose()
    await c.admin.dispose()
  })
})

test.describe('F5 · tarefa a partir de item de recuperação', () => {
  test('uma tarefa aberta por item; liga o negócio ao item e à conversa; atendente só os itens dele', async () => {
    const c = await company()
    const att = `atendente.${uid()}@cliente.test`
    await createUser(c.admin, { email: att, role: 'atendente' })
    const a = await loginAs(att, 'Senha-Forte-2026x')
    const mine = await conversation(c.orgId, att)
    const theirs = await conversation(c.orgId, `outro.${uid()}@cliente.test`)
    const item = await testDb.recoveryItem.create({ data: { organizationId: c.orgId, conversationId: mine.conv.id, agentId: mine.agent.id, reason: 'Orçamento sem retorno' } })
    const otherItem = await testDb.recoveryItem.create({ data: { organizationId: c.orgId, conversationId: theirs.conv.id, agentId: theirs.agent.id } })
    const deal = await newDeal(c.admin)

    const r = await task(c.admin, { recoveryItemId: item.id, dealId: deal.id, type: 'call', title: 'Ligar para recuperar' })
    expect(r.status(), await r.text()).toBe(201)
    const created = (await r.json()).activity
    expect(created).toMatchObject({ source: 'recovery', sourceId: item.id, type: 'call' })
    expect((await (await task(c.admin, { recoveryItemId: item.id })).json()).activity.id).toBe(created.id)
    expect(await testDb.crmBusinessLink.count({ where: { dealId: deal.id, relationshipType: 'recovery', recoveryItemId: item.id, conversationId: mine.conv.id } })).toBe(1)

    expect((await task(a, { recoveryItemId: otherItem.id })).status()).toBe(404)
    await a.dispose()
    await c.admin.dispose()
  })
})

test.describe('F5 · negócios ligados à conversa (bloco "Negócios relacionados")', () => {
  test('lista só os ligados, com etapa e próxima tarefa; escopo da conversa e do negócio; outra empresa = 404', async () => {
    const c = await company()
    const other = await company()
    const att = `atendente.${uid()}@cliente.test`
    const attMember = await createUser(c.admin, { email: att, role: 'atendente' })
    const a = await loginAs(att, 'Senha-Forte-2026x')
    const mine = await conversation(c.orgId, att)
    const theirs = await conversation(c.orgId, `outro.${uid()}@cliente.test`)
    const foreign = await conversation(other.orgId, `ag.${uid()}@cliente.test`)

    const linked = await newDeal(c.admin, { ownerMemberId: attMember.id })
    const adminLinked = await newDeal(c.admin, { ownerMemberId: c.memberId })
    await newDeal(c.admin, { ownerMemberId: attMember.id }) // sem vínculo com a conversa
    const alert = await newAlert(c.orgId, mine.conv.id)
    expect((await task(c.admin, { alertId: alert.id, dealId: linked.id, title: 'Retornar amanhã' })).status()).toBe(201)
    const alert2 = await newAlert(c.orgId, mine.conv.id)
    expect((await task(c.admin, { alertId: alert2.id, dealId: adminLinked.id })).status()).toBe(201)

    const r = await c.admin.get(`/api/crm/deals?conversationId=${mine.conv.id}`)
    expect(r.status(), await r.text()).toBe(200)
    const list = await r.json()
    expect((list.items as Array<{ id: string }>).map((d) => d.id).sort()).toEqual([linked.id, adminLinked.id].sort())
    const card = (list.items as Array<{ id: string; stage: { name: string } | null; nextTask: { title: string } | null }>).find((d) => d.id === linked.id)!
    expect(card.stage?.name).toBe('Novo interesse')
    expect(card.nextTask?.title).toBe('Retornar amanhã')

    // atendente: a conversa é dele, mas só vê o negócio que é dele
    expect(((await (await a.get(`/api/crm/deals?conversationId=${mine.conv.id}`)).json()).items as Array<{ id: string }>).map((d) => d.id)).toEqual([linked.id])
    expect((await a.get(`/api/crm/deals?conversationId=${theirs.conv.id}`)).status()).toBe(404)
    // conversa sem vínculo: lista vazia, não erro
    expect((await (await c.admin.get(`/api/crm/deals?conversationId=${theirs.conv.id}`)).json()).items).toEqual([])
    expect((await c.admin.get(`/api/crm/deals?conversationId=${foreign.conv.id}`)).status()).toBe(404)
    await a.dispose()
    await c.admin.dispose()
    await other.admin.dispose()
  })
})
