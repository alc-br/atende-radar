import { test, expect, type APIRequestContext } from '@playwright/test'
import { createUser, loginAs, signupOrg, uid } from './helpers'
import { testDb } from './db'
import { newChat, setupCompany } from './gw'
import { crmOffAfterFile } from './crm-cleanup'

// CRM comercial · API (docs/crm/04-api-crm.md, 05-sincronizacao.md, ADR-002/003). Cada teste usa empresa nova pelo
// cadastro real; o CRM é ligado pelo operador da plataforma, como em produção (D1/D7: desligado por padrão).
// As empresas do seed (org_seed_1, org_b) ficam com o CRM desligado: o rbac.spec.ts conta com isso.

crmOffAfterFile()

let operator: APIRequestContext
test.beforeAll(async () => {
  operator = await loginAs('platform@test.local')
})
test.afterAll(async () => {
  await operator.dispose()
})

const toggle = (orgId: string, enabled: boolean) => operator.patch(`/api/admin/organizations/${orgId}/crm`, { data: { enabled } })

async function company(opts: { crm?: boolean } = {}) {
  const { email, password } = await signupOrg()
  const admin = await loginAs(email, password)
  const me = await (await admin.get('/api/me')).json()
  const orgId = me.organizationId as string
  if (opts.crm !== false) expect((await toggle(orgId, true)).status()).toBe(200)
  return { email, password, admin, orgId, memberId: me.member.id as string }
}

const phone = () => `11 9${Math.floor(1000_0000 + Math.random() * 8999_9999)}`
const digitsOf = (p: string) => `55${p.replace(/\D/g, '')}`

async function stagesOf(api: APIRequestContext) {
  const r = await api.get('/api/crm/pipelines')
  expect(r.status()).toBe(200)
  const p = (await r.json()).pipelines.find((x: { isDefault: boolean }) => x.isDefault)
  return { pipelineId: p.id as string, stages: p.stages as Array<{ id: string; name: string; position: number }> }
}

async function newDeal(api: APIRequestContext, data: Record<string, unknown> = {}) {
  const r = await api.post('/api/crm/deals', { data: { title: `Negócio ${uid()}`, ...data } })
  expect(r.status(), await r.text()).toBe(201)
  return (await r.json()).deal as { id: string; version: number; stageId: string; status: string; ownerMemberId: string | null; amountCents: number | null }
}

test.describe('CRM · liberação por empresa', () => {
  test('só o operador da plataforma liga ou desliga; corpo validado; empresa inexistente = 404', async () => {
    const c = await company({ crm: false })
    expect((await c.admin.patch(`/api/admin/organizations/${c.orgId}/crm`, { data: { enabled: true } })).status()).toBe(403)
    const form = await operator.patch(`/api/admin/organizations/${c.orgId}/crm`, { data: 'enabled=true', headers: { 'content-type': 'application/x-www-form-urlencoded' } })
    expect(form.status()).toBe(415)
    expect((await operator.patch(`/api/admin/organizations/${c.orgId}/crm`, { data: { enabled: 'sim' } })).status()).toBe(400)
    expect((await operator.patch(`/api/admin/organizations/${c.orgId}/crm`, { data: { enabled: true, plan: 'pro' } })).status()).toBe(400)
    expect((await toggle('org-que-nao-existe', true)).status()).toBe(404)
    expect((await (await c.admin.get('/api/me')).json()).crm.enabled).toBe(false)
    await c.admin.dispose()
  })

  test('desligado: toda rota do CRM responde 404 crm_disabled (igual a rota inexistente) e nada é gravado', async () => {
    const c = await company({ crm: false })
    for (const [method, path] of [['get', '/api/crm/contacts'], ['get', '/api/crm/deals'], ['get', '/api/crm/overview'], ['post', '/api/crm/contacts']] as const) {
      const r = await c.admin[method](path, method === 'post' ? { data: { name: 'Ana' } } : undefined)
      expect(r.status(), path).toBe(404)
      expect((await r.json()).code).toBe('crm_disabled')
    }
    expect(await testDb.crmPerson.count({ where: { organizationId: c.orgId } })).toBe(0)
    await c.admin.dispose()
  })

  test('ligar provisiona o funil padrão uma vez (idempotente), audita, e desligar esconde sem apagar', async () => {
    const c = await company()
    expect((await (await c.admin.get('/api/me')).json()).crm).toMatchObject({ enabled: true, flags: { autoCreateDeals: false, suggestStage: false, notifications: false, exports: false } })
    const { stages } = await stagesOf(c.admin)
    expect(stages.map((s) => s.name)).toEqual(['Novo interesse', 'Qualificação', 'Proposta/orçamento', 'Negociação', 'Aguardando cliente'])
    expect((await toggle(c.orgId, true)).status()).toBe(200) // de novo: não duplica o funil
    expect(await testDb.crmPipeline.count({ where: { organizationId: c.orgId } })).toBe(1)
    expect(await testDb.auditLog.count({ where: { organizationId: c.orgId, action: 'crm.enabled_changed' } })).toBe(2)

    const person = (await (await c.admin.post('/api/crm/contacts', { data: { name: 'Fica Guardada' } })).json()).person
    expect((await toggle(c.orgId, false)).status()).toBe(200)
    expect((await c.admin.get(`/api/crm/contacts/${person.id}`)).status()).toBe(404)
    expect(await testDb.crmPerson.count({ where: { id: person.id } })).toBe(1)
    expect((await toggle(c.orgId, true)).status()).toBe(200)
    expect((await c.admin.get(`/api/crm/contacts/${person.id}`)).status()).toBe(200)
    await c.admin.dispose()
  })
})

test.describe('CRM · pessoas', () => {
  test('cria sem expor o telefone (só os 4 últimos), recusa duplicado na empresa e devolve o ID existente', async () => {
    const c = await company()
    const p = phone()
    const r = await c.admin.post('/api/crm/contacts', { data: { name: 'Maria Souza', email: 'Maria@Exemplo.com', phone: p } })
    expect(r.status()).toBe(201)
    const text = await r.text()
    expect(text).not.toContain(p.replace(/\D/g, '').slice(2))
    const person = JSON.parse(text).person
    expect(person).toMatchObject({ name: 'Maria Souza', phoneLast4: p.slice(-4), hasPhone: true, status: 'active', version: 1 })
    expect(person.phoneEncrypted).toBeUndefined()
    expect(person.phoneHash).toBeUndefined()

    // o mesmo número em outro formato e o mesmo e-mail com outra caixa são o mesmo contato
    const dupPhone = await c.admin.post('/api/crm/contacts', { data: { name: 'Outra', phone: `+${digitsOf(p)}` } })
    expect(dupPhone.status()).toBe(409)
    expect(await dupPhone.json()).toMatchObject({ code: 'crm_duplicate', existingId: person.id })
    const dupEmail = await c.admin.post('/api/crm/contacts', { data: { name: 'Outra', email: 'maria@exemplo.COM' } })
    expect((await dupEmail.json()).code).toBe('crm_duplicate')
    expect(await testDb.crmPerson.count({ where: { organizationId: c.orgId } })).toBe(1)
    await c.admin.dispose()
  })

  test('Idempotency-Key: repetir devolve a mesma resposta sem criar de novo; outro corpo = 422; chave inválida = 400', async () => {
    const c = await company()
    const key = `pessoa-${uid()}-${uid()}`
    const body = { name: `Idem ${uid()}` }
    const a = await c.admin.post('/api/crm/contacts', { data: body, headers: { 'Idempotency-Key': key } })
    expect(a.status()).toBe(201)
    const b = await c.admin.post('/api/crm/contacts', { data: body, headers: { 'Idempotency-Key': key } })
    expect(b.status()).toBe(201)
    expect(b.headers()['idempotent-replay']).toBe('true')
    expect((await b.json()).person.id).toBe((await a.json()).person.id)
    expect((await c.admin.post('/api/crm/contacts', { data: { name: 'Outro nome' }, headers: { 'Idempotency-Key': key } })).status()).toBe(422)
    expect((await c.admin.post('/api/crm/contacts', { data: body, headers: { 'Idempotency-Key': 'curta' } })).status()).toBe(400)
    expect(await testDb.crmPerson.count({ where: { organizationId: c.orgId, name: body.name } })).toBe(1)
    await c.admin.dispose()
  })

  test('mesma chave em paralelo: um único registro', async () => {
    const c = await company()
    const key = `paralelo-${uid()}-${uid()}`
    const body = { name: `Paralelo ${uid()}` }
    const rs = await Promise.all(Array.from({ length: 5 }, () => c.admin.post('/api/crm/contacts', { data: body, headers: { 'Idempotency-Key': key } })))
    expect(rs.some((r) => r.status() === 201)).toBe(true)
    for (const r of rs) expect([201, 409]).toContain(r.status())
    expect(await testDb.crmPerson.count({ where: { organizationId: c.orgId, name: body.name } })).toBe(1)
    await c.admin.dispose()
  })

  test('edição com versão: a versão velha recebe 409 com a atual; arquivar libera o telefone para novo cadastro', async () => {
    const c = await company()
    const p = phone()
    const person = (await (await c.admin.post('/api/crm/contacts', { data: { name: 'Versão', phone: p } })).json()).person
    const ok = await c.admin.patch(`/api/crm/contacts/${person.id}`, { data: { notes: 'primeira', version: 1 } })
    expect(ok.status()).toBe(200)
    expect((await ok.json()).person.version).toBe(2)
    const stale = await c.admin.patch(`/api/crm/contacts/${person.id}`, { data: { notes: 'atrasada', version: 1 } })
    expect(stale.status()).toBe(409)
    expect(await stale.json()).toMatchObject({ code: 'crm_version_conflict', currentVersion: 2 })
    expect((await testDb.crmPerson.findUniqueOrThrow({ where: { id: person.id } })).notes).toBe('primeira')

    expect((await c.admin.delete(`/api/crm/contacts/${person.id}`, { data: {} })).status()).toBe(400) // sem versão
    const del = await c.admin.delete(`/api/crm/contacts/${person.id}`, { data: { version: 2 } })
    expect(del.status()).toBe(200)
    expect((await del.json()).person.status).toBe('archived')
    const list = (await (await c.admin.get('/api/crm/contacts')).json()).items as Array<{ id: string }>
    expect(list.map((x) => x.id)).not.toContain(person.id)
    expect((await c.admin.post('/api/crm/contacts', { data: { name: 'Nova dona do número', phone: p } })).status()).toBe(201)
    await c.admin.dispose()
  })

  test('entrada: sem JSON = 415 (CSRF), campo desconhecido = 400, HTML guardado como texto, ID inexistente = 404', async () => {
    const c = await company()
    const form = await c.admin.post('/api/crm/contacts', { data: 'name=Ana', headers: { 'content-type': 'application/x-www-form-urlencoded' } })
    expect(form.status()).toBe(415)
    expect((await form.json()).code).toBe('crm_invalid')
    const extra = await c.admin.post('/api/crm/contacts', { data: { name: 'Ana', organizationId: 'org_b' } })
    expect(extra.status()).toBe(400)
    expect((await extra.json()).error).toContain('Campo não permitido')
    const xss = '<img src=x onerror=alert(1)>'
    const r = await c.admin.post('/api/crm/contacts', { data: { name: xss, notes: '<script>alert(1)</script>' } })
    expect(r.status()).toBe(201)
    expect(r.headers()['content-type']).toContain('application/json')
    const id = (await r.json()).person.id
    expect((await (await c.admin.get(`/api/crm/contacts/${id}`)).json()).person.name).toBe(xss)
    const missing = await c.admin.get('/api/crm/contacts/nao-existe')
    expect(missing.status()).toBe(404)
    const err = await missing.json()
    expect(err).toMatchObject({ code: 'crm_not_found' })
    expect(err.requestId).toBe(missing.headers()['x-request-id'])
    await c.admin.dispose()
  })

  test('mescla (admin): negócios passam para quem fica, a mesclada some da lista; atendente não mescla', async () => {
    const c = await company()
    const keep = (await (await c.admin.post('/api/crm/contacts', { data: { name: 'Fica' } })).json()).person
    const merge = (await (await c.admin.post('/api/crm/contacts', { data: { name: 'Sai', phone: phone() } })).json()).person
    const deal = await newDeal(c.admin, { personId: merge.id })
    const r = await c.admin.post('/api/crm/contacts/merge', { data: { keepId: keep.id, mergeId: merge.id, keepVersion: keep.version, mergeVersion: merge.version } })
    expect(r.status(), await r.text()).toBe(200)
    const out = await r.json()
    expect(out.person.id).toBe(keep.id)
    expect(out.person.hasPhone).toBe(true) // o telefone da mesclada completa a que fica
    expect((await testDb.crmDeal.findUniqueOrThrow({ where: { id: deal.id } })).personId).toBe(keep.id)
    expect((await testDb.crmPerson.findUniqueOrThrow({ where: { id: merge.id } })).status).toBe('merged')
    const again = await c.admin.post('/api/crm/contacts/merge', { data: { keepId: keep.id, mergeId: merge.id, keepVersion: out.person.version, mergeVersion: merge.version + 1 } })
    expect(again.status()).toBe(409)

    const att = `atendente.${uid()}@cliente.test`
    await createUser(c.admin, { email: att, role: 'atendente' })
    const a = await loginAs(att, 'Senha-Forte-2026x')
    expect((await a.post('/api/crm/contacts/merge', { data: { keepId: keep.id, mergeId: merge.id, keepVersion: 1, mergeVersion: 1 } })).status()).toBe(403)
    await a.dispose()
    await c.admin.dispose()
  })
})

test.describe('CRM · negócios', () => {
  test('ciclo completo: cria na 1ª etapa, move, ganha (valor ou confirmação), reabre, perde com motivo, arquiva', async () => {
    const c = await company()
    const { stages } = await stagesOf(c.admin)
    const deal = await newDeal(c.admin)
    expect(deal).toMatchObject({ stageId: stages[0].id, status: 'open', amountCents: null, version: 1 })

    const board = (await (await c.admin.get('/api/crm/deals?view=board')).json()) as { columns: Array<{ stage: { id: string }; total: number; deals: Array<{ id: string }> }> }
    expect(board.columns).toHaveLength(5)
    expect(board.columns[0].deals.map((d) => d.id)).toContain(deal.id)

    const moved = await c.admin.post(`/api/crm/deals/${deal.id}/stage`, { data: { stageId: stages[2].id, version: 1 } })
    expect(moved.status()).toBe(200)
    const m = (await moved.json()).deal
    expect(m).toMatchObject({ stageId: stages[2].id, version: 2, stageLockedByHuman: true, probability: 50 })

    // ganho sem valor: só com confirmação explícita (nunca R$ 0,00 inventado)
    const noValue = await c.admin.post(`/api/crm/deals/${deal.id}/close`, { data: { outcome: 'won', version: 2 } })
    expect(noValue.status()).toBe(400)
    const won = await c.admin.post(`/api/crm/deals/${deal.id}/close`, { data: { outcome: 'won', version: 2, confirmNoAmount: true } })
    expect(won.status(), await won.text()).toBe(200)
    expect((await won.json()).deal).toMatchObject({ status: 'won', amountCents: null, probability: 100 })
    const twice = await c.admin.post(`/api/crm/deals/${deal.id}/close`, { data: { outcome: 'won', version: 3, confirmNoAmount: true } })
    expect(twice.status()).toBe(409)
    expect((await twice.json()).code).toBe('crm_invalid_transition')
    expect((await c.admin.post(`/api/crm/deals/${deal.id}/stage`, { data: { stageId: stages[1].id, version: 3 } })).status()).toBe(409)

    const reopened = await c.admin.post(`/api/crm/deals/${deal.id}/reopen`, { data: { version: 3, reason: 'O cliente pediu outra proposta' } })
    expect(reopened.status()).toBe(200)
    expect((await reopened.json()).deal).toMatchObject({ status: 'open', stageId: stages[2].id })
    expect((await c.admin.post(`/api/crm/deals/${deal.id}/reopen`, { data: { version: 4, reason: 'De novo, já aberto' } })).status()).toBe(409)

    expect((await c.admin.post(`/api/crm/deals/${deal.id}/close`, { data: { outcome: 'lost', version: 4 } })).status()).toBe(400)
    const lost = await c.admin.post(`/api/crm/deals/${deal.id}/close`, { data: { outcome: 'lost', version: 4, lostReasonCode: 'price', note: 'achou caro' } })
    expect(lost.status()).toBe(200)
    expect((await lost.json()).deal).toMatchObject({ status: 'lost', lostReasonCode: 'price', probability: 0 })

    const archived = await c.admin.delete(`/api/crm/deals/${deal.id}`, { data: { version: 5 } })
    expect(archived.status()).toBe(200)
    expect((await c.admin.patch(`/api/crm/deals/${deal.id}`, { data: { title: 'x', version: 6 } })).status()).toBe(409)

    const detail = await (await c.admin.get(`/api/crm/deals/${deal.id}`)).json()
    expect((detail.events as Array<{ type: string }>).map((e) => e.type).reverse()).toEqual(['created', 'stage_changed', 'won', 'reopened', 'lost', 'archived'])
    expect(await testDb.auditLog.count({ where: { organizationId: c.orgId, action: { startsWith: 'crm.deal_' } } })).toBeGreaterThanOrEqual(6)
    await c.admin.dispose()
  })

  test('ganho usa o valor já declarado; valor em centavos inteiros', async () => {
    const c = await company()
    const deal = await newDeal(c.admin, { amountCents: 150000 })
    const won = await c.admin.post(`/api/crm/deals/${deal.id}/close`, { data: { outcome: 'won', version: 1 } })
    expect((await won.json()).deal).toMatchObject({ status: 'won', amountCents: 150000, amountSource: 'manual' })
    expect((await c.admin.post('/api/crm/deals', { data: { title: 'x', amountCents: 10.5 } })).status()).toBe(400)
    const ov = await (await c.admin.get('/api/crm/overview')).json()
    expect(ov.won).toMatchObject({ count: 1, confirmedCents: 150000 })
    expect(ov.conversion).toBe(1)
    await c.admin.dispose()
  })

  test('duas pessoas movem o mesmo negócio ao mesmo tempo: uma vence, a outra recebe 409 (nada se perde em silêncio)', async () => {
    const c = await company()
    const { stages } = await stagesOf(c.admin)
    const deal = await newDeal(c.admin)
    const gestor = `gestor.${uid()}@cliente.test`
    await createUser(c.admin, { email: gestor, role: 'gestor' })
    const g = await loginAs(gestor, 'Senha-Forte-2026x')
    const [a, b] = await Promise.all([
      c.admin.post(`/api/crm/deals/${deal.id}/stage`, { data: { stageId: stages[1].id, version: 1 } }),
      g.post(`/api/crm/deals/${deal.id}/stage`, { data: { stageId: stages[3].id, version: 1 } }),
    ])
    expect([a.status(), b.status()].sort()).toEqual([200, 409])
    const row = await testDb.crmDeal.findUniqueOrThrow({ where: { id: deal.id } })
    expect(row.version).toBe(2)
    expect(await testDb.crmDealEvent.count({ where: { dealId: deal.id, type: 'stage_changed' } })).toBe(1)
    await g.dispose()
    await c.admin.dispose()
  })

  test('etapa de outro funil é recusada; funil novo com etapas e ordem', async () => {
    const c = await company()
    const deal = await newDeal(c.admin)
    const created = await c.admin.post('/api/crm/pipelines', { data: { name: 'Pós-venda', stages: [{ name: 'Contato' }, { name: 'Renovação', probability: 60 }] } })
    expect(created.status(), await created.text()).toBe(201)
    const other = (await created.json()).pipeline
    expect(other.isDefault).toBe(false)
    expect(other.stages.map((s: { name: string }) => s.name)).toEqual(['Contato', 'Renovação'])
    const r = await c.admin.post(`/api/crm/deals/${deal.id}/stage`, { data: { stageId: other.stages[0].id, version: 1 } })
    expect(r.status()).toBe(409)
    expect((await r.json()).code).toBe('crm_invalid_transition')
    await c.admin.dispose()
  })
})

test.describe('CRM · isolamento entre empresas (ADR-003)', () => {
  test('ID de outra empresa responde 404 em leitura, edição, transição e arquivamento; nada muda lá', async () => {
    const a = await company()
    const b = await company()
    const person = (await (await a.admin.post('/api/crm/contacts', { data: { name: 'Só da A' } })).json()).person
    const deal = await newDeal(a.admin, { personId: person.id })
    const { stages } = await stagesOf(a.admin)

    expect((await b.admin.get(`/api/crm/deals/${deal.id}`)).status()).toBe(404)
    expect((await b.admin.patch(`/api/crm/deals/${deal.id}`, { data: { title: 'invadido', version: 1 } })).status()).toBe(404)
    expect((await b.admin.post(`/api/crm/deals/${deal.id}/stage`, { data: { stageId: stages[1].id, version: 1 } })).status()).toBe(404)
    expect((await b.admin.post(`/api/crm/deals/${deal.id}/close`, { data: { outcome: 'lost', version: 1, lostReasonCode: 'price' } })).status()).toBe(404)
    expect((await b.admin.delete(`/api/crm/deals/${deal.id}`, { data: { version: 1 } })).status()).toBe(404)
    expect((await b.admin.get(`/api/crm/contacts/${person.id}`)).status()).toBe(404)
    expect((await b.admin.patch(`/api/crm/contacts/${person.id}`, { data: { name: 'x', version: 1 } })).status()).toBe(404)
    // referência cruzada na criação também não passa
    expect((await b.admin.post('/api/crm/deals', { data: { title: 'x', personId: person.id } })).status()).toBe(400)
    expect((await b.admin.post('/api/crm/deals', { data: { title: 'x', stageId: stages[0].id } })).status()).toBe(409)
    expect((await (await b.admin.get('/api/crm/contacts')).json()).items).toHaveLength(0)
    expect((await (await b.admin.get(`/api/crm/deals?personId=${person.id}`)).json()).items).toHaveLength(0)

    const row = await testDb.crmDeal.findUniqueOrThrow({ where: { id: deal.id } })
    expect(row.title).not.toBe('invadido')
    expect(row).toMatchObject({ version: 1, status: 'open', stageId: stages[0].id, organizationId: a.orgId })
    expect(await testDb.crmDeal.count({ where: { organizationId: b.orgId } })).toBe(0)
    await a.admin.dispose()
    await b.admin.dispose()
  })

  test('o mesmo telefone em duas empresas não é duplicado (a deduplicação nunca cruza empresas)', async () => {
    const a = await company()
    const b = await company()
    const p = phone()
    expect((await a.admin.post('/api/crm/contacts', { data: { name: 'Mesmo número', phone: p } })).status()).toBe(201)
    const rb = await b.admin.post('/api/crm/contacts', { data: { name: 'Mesmo número', phone: p } })
    expect(rb.status()).toBe(201)
    expect((await rb.json()).existingId).toBeUndefined()
    await a.admin.dispose()
    await b.admin.dispose()
  })
})

test.describe('CRM · escopo por papel', () => {
  test('atendente vê e altera só o que é dele; não atribui a outro; analista só vê os números', async () => {
    const c = await company()
    const att = `atendente.${uid()}@cliente.test`
    const attMember = await createUser(c.admin, { email: att, role: 'atendente' })
    const ana = `analista.${uid()}@cliente.test`
    await createUser(c.admin, { email: ana, role: 'analista' })
    const a = await loginAs(att, 'Senha-Forte-2026x')
    const an = await loginAs(ana, 'Senha-Forte-2026x')

    const adminDeal = await newDeal(c.admin, { ownerMemberId: c.memberId })
    const unowned = await newDeal(c.admin)
    const mine = await newDeal(a)
    expect(mine.ownerMemberId).toBe(attMember.id) // sem responsável informado, é de quem criou

    const items = ((await (await a.get('/api/crm/deals')).json()).items as Array<{ id: string }>).map((d) => d.id)
    expect(items).toEqual([mine.id])
    expect((await a.get(`/api/crm/deals/${adminDeal.id}`)).status()).toBe(404)
    expect((await a.get(`/api/crm/deals/${unowned.id}`)).status()).toBe(404)
    expect((await a.patch(`/api/crm/deals/${adminDeal.id}`, { data: { title: 'meu', version: 1 } })).status()).toBe(404)
    const assign = await a.post('/api/crm/deals', { data: { title: 'pro chefe', ownerMemberId: c.memberId } })
    expect(assign.status()).toBe(403)
    expect((await a.patch(`/api/crm/deals/${mine.id}`, { data: { ownerMemberId: c.memberId, version: 1 } })).status()).toBe(403)
    expect((await a.get('/api/crm/settings')).status()).toBe(403)
    expect((await a.post('/api/crm/exports', { data: { entity: 'people' } })).status()).toBe(403)

    // board e visão geral do atendente contam só o dele
    const board = (await (await a.get('/api/crm/deals?view=board')).json()) as { columns: Array<{ total: number }> }
    expect(board.columns.reduce((s, col) => s + col.total, 0)).toBe(1)
    expect((await (await a.get('/api/crm/overview')).json()).open.count).toBe(1)

    expect((await an.get('/api/crm/overview')).status()).toBe(200)
    expect((await (await an.get('/api/crm/overview')).json()).open.count).toBe(3)
    expect((await an.get('/api/crm/deals')).status()).toBe(403)
    expect((await an.get('/api/crm/contacts')).status()).toBe(403)
    expect((await an.post('/api/crm/deals', { data: { title: 'x' } })).status()).toBe(403)
    await a.dispose()
    await an.dispose()
    await c.admin.dispose()
  })

  test('empresas: as contagens da lista são as do detalhe (pessoas ativas, no escopo) e vêm com o nome do responsável', async () => {
    const c = await company()
    const att = `atendente.${uid()}@cliente.test`
    const attMember = await createUser(c.admin, { name: 'Vendedora Escopo', email: att, role: 'atendente' })
    const a = await loginAs(att, 'Senha-Forte-2026x')

    const cr = await c.admin.post('/api/crm/companies', { data: { name: `Empresa Escopo ${uid()}`, ownerMemberId: attMember.id } })
    expect(cr.status(), await cr.text()).toBe(201)
    const co = (await cr.json()).company as { id: string }
    const person = async (ownerMemberId: string) => {
      const r = await c.admin.post('/api/crm/contacts', { data: { name: `Pessoa ${uid()}`, companyId: co.id, ownerMemberId } })
      expect(r.status(), await r.text()).toBe(201)
      return (await r.json()).person as { id: string; version: number }
    }
    await person(attMember.id)
    await person(c.memberId)
    const archived = await person(attMember.id)
    expect((await c.admin.delete(`/api/crm/contacts/${archived.id}`, { data: { version: archived.version } })).status()).toBe(200)
    await newDeal(c.admin, { companyId: co.id, ownerMemberId: attMember.id })
    await newDeal(c.admin, { companyId: co.id, ownerMemberId: c.memberId })

    type Row = { id: string; peopleCount: number; dealCount: number }
    type List = { items: Row[]; members: Array<{ id: string; name: string }> }
    for (const [api, people, deals] of [[c.admin, 2, 2], [a, 1, 1]] as const) {
      const list = (await (await api.get('/api/crm/companies')).json()) as List
      const row = list.items.find((x) => x.id === co.id)
      expect(row).toMatchObject({ peopleCount: people, dealCount: deals })
      expect(list.members).toContainEqual({ id: attMember.id, name: 'Vendedora Escopo' })
      const detail = (await (await api.get(`/api/crm/companies/${co.id}`)).json()) as { people: unknown[]; deals: unknown[]; members: Array<{ id: string; name: string }> }
      expect([detail.people.length, detail.deals.length]).toEqual([people, deals])
      expect(detail.members).toContainEqual({ id: attMember.id, name: 'Vendedora Escopo' })
      // nenhum e-mail nos nomes
      expect(JSON.stringify(list.members) + JSON.stringify(detail.members)).not.toContain('@')
    }
    await a.dispose()
    await c.admin.dispose()
  })
})

test.describe('CRM · tarefas e visão geral', () => {
  test('tarefa vencida aparece no filtro e na visão geral; concluída sai', async () => {
    const c = await company()
    const deal = await newDeal(c.admin)
    const past = new Date(Date.now() - 2 * 86400_000).toISOString()
    const r = await c.admin.post('/api/crm/activities', { data: { type: 'follow_up', title: 'Ligar de volta', dealId: deal.id, dueAt: past } })
    expect(r.status(), await r.text()).toBe(201)
    const act = (await r.json()).activity
    const overdue = (await (await c.admin.get('/api/crm/activities?overdue=1')).json()).items as Array<{ id: string; overdue: boolean }>
    expect(overdue.map((x) => x.id)).toEqual([act.id])
    expect(overdue[0].overdue).toBe(true)
    expect((await (await c.admin.get('/api/crm/overview')).json()).overdueTasks).toBe(1)

    const done = await c.admin.patch(`/api/crm/activities/${act.id}`, { data: { status: 'done', result: 'Cliente atendeu', version: act.version } })
    expect(done.status(), await done.text()).toBe(200)
    expect((await done.json()).activity.completedAt).not.toBeNull()
    expect((await (await c.admin.get('/api/crm/activities?overdue=1')).json()).items).toHaveLength(0)
    await c.admin.dispose()
  })

  test('período da visão geral: from >= to ou mais de 366 dias = 400', async () => {
    const c = await company()
    const now = Date.now()
    const iso = (t: number) => encodeURIComponent(new Date(t).toISOString())
    expect((await c.admin.get(`/api/crm/overview?from=${iso(now)}&to=${iso(now - 1000)}`)).status()).toBe(400)
    expect((await c.admin.get(`/api/crm/overview?from=${iso(now - 400 * 86400_000)}&to=${iso(now)}`)).status()).toBe(400)
    const ok = await c.admin.get(`/api/crm/overview?from=${iso(now - 7 * 86400_000)}&to=${iso(now)}`)
    expect(ok.status()).toBe(200)
    const body = await ok.json()
    expect(body.conversion).toBeNull() // sem fechamento: sem taxa (nunca 0% inventado)
    expect(body.methodology.estimated).toContain('Não é receita')
    await c.admin.dispose()
  })
})

test.describe('CRM · exportação e importação', () => {
  test('exportar: desligado nas configurações = 403; ligado, CSV com telefone mascarado e célula sem fórmula', async () => {
    const c = await company()
    const p = phone()
    await c.admin.post('/api/crm/contacts', { data: { name: '=HYPERLINK("http://mal.example")', phone: p } })
    const off = await c.admin.post('/api/crm/exports', { data: { entity: 'people' } })
    expect(off.status()).toBe(403)
    const set = await c.admin.patch('/api/crm/settings', { data: { exports: true } })
    expect(set.status()).toBe(200)
    expect((await set.json()).crm.flags.exports).toBe(true)

    const r = await c.admin.post('/api/crm/exports', { data: { entity: 'people' } })
    expect(r.status()).toBe(200)
    expect(r.headers()['content-type']).toContain('text/csv')
    expect(r.headers()['cache-control']).toBe('no-store')
    const csv = await r.text()
    expect(csv).toContain(`•••• ${p.slice(-4)}`)
    expect(csv).not.toContain(p.replace(/\D/g, ''))
    expect(csv).toContain(`"'=HYPERLINK(""http://mal.example"")"`)

    expect((await c.admin.post('/api/crm/exports', { data: { entity: 'people', includeFullPhone: true } })).status()).toBe(400)
    const full = await c.admin.post('/api/crm/exports', { data: { entity: 'people', includeFullPhone: true, confirm: true } })
    expect(full.status()).toBe(200)
    expect((await full.text()).replace(/\D/g, '')).toContain(p.replace(/\D/g, '').slice(-8))
    const audits = await testDb.auditLog.findMany({ where: { organizationId: c.orgId, action: 'crm.exported' }, orderBy: { createdAt: 'asc' } })
    expect(audits).toHaveLength(2)
    expect(JSON.parse(audits[1].details ?? '{}')).toMatchObject({ entity: 'people', fullPhone: true })
    expect(audits.map((x) => (x.details ?? '').replace(/[\s().+-]/g, '')).join(' ')).not.toContain(p.replace(/\D/g, '').slice(-8))

    const gestor = `gestor.${uid()}@cliente.test`
    await createUser(c.admin, { email: gestor, role: 'gestor' })
    const g = await loginAs(gestor, 'Senha-Forte-2026x')
    expect((await g.post('/api/crm/exports', { data: { entity: 'people' } })).status()).toBe(403)
    await g.dispose()
    await c.admin.dispose()
  })

  test('importar: prévia não grava; gravar cria as válidas e pula duplicadas (planilha e empresa) e erros por linha', async () => {
    const c = await company()
    const existing = phone()
    await c.admin.post('/api/crm/contacts', { data: { name: 'Já existe', phone: existing } })
    const repeated = phone()
    const rows = [
      { name: 'Linha Boa', phone: phone(), company: 'Clínica Sorriso' },
      { name: 'Repetida 1', phone: repeated },
      { name: 'Repetida 2', phone: repeated },
      { name: 'Da empresa', phone: existing },
      { name: '', phone: phone() },
      { name: 'Telefone ruim', phone: '123' },
      { name: 'Campo extra', cpf: '123' },
    ]
    const dry = await c.admin.post('/api/crm/imports', { data: { dryRun: true, rows } })
    expect(dry.status(), await dry.text()).toBe(200)
    const preview = await dry.json()
    expect(preview).toMatchObject({ total: 7, valid: 2, created: 0, companiesToCreate: 1, batchId: null })
    expect(preview.duplicates).toEqual(expect.arrayContaining([{ row: 4, field: 'telefone', where: 'planilha' }, { row: 5, field: 'telefone', where: 'empresa' }]))
    expect((preview.errors as Array<{ row: number }>).map((e) => e.row).sort()).toEqual([6, 7, 8])
    expect(await testDb.crmPerson.count({ where: { organizationId: c.orgId } })).toBe(1)

    const real = await (await c.admin.post('/api/crm/imports', { data: { dryRun: false, rows } })).json()
    expect(real.created).toBe(2)
    expect(real.batchId).toBeTruthy()
    expect(await testDb.crmPerson.count({ where: { organizationId: c.orgId } })).toBe(3)
    expect(await testDb.crmCompany.count({ where: { organizationId: c.orgId, name: 'Clínica Sorriso' } })).toBe(1)
    // de novo: tudo já existe, nada novo
    expect((await (await c.admin.post('/api/crm/imports', { data: { dryRun: false, rows } })).json()).created).toBe(0)
    expect(await testDb.crmPerson.count({ where: { organizationId: c.orgId } })).toBe(3)
    await c.admin.dispose()
  })

  test('ações pesadas têm limite por minuto (429 com Retry-After)', async () => {
    const c = await company()
    const codes: number[] = []
    for (let i = 0; i < 11; i++) codes.push((await c.admin.post('/api/crm/imports', { data: { dryRun: true, rows: [{ name: `L${i}` }] } })).status())
    expect(codes.slice(0, 10).every((s) => s === 200)).toBe(true)
    expect(codes[10]).toBe(429)
    const r = await c.admin.post('/api/crm/imports', { data: { dryRun: true, rows: [{ name: 'L' }] } })
    expect(r.headers()['retry-after']).toBe('60')
    expect((await r.json()).code).toBe('crm_rate_limited')
    await c.admin.dispose()
  })
})

test.describe('CRM · sincronização com o AtendeRadar (ADR-002)', () => {
  test('oportunidade da conversa vira SUGESTÃO (não negócio); aceitar cria o negócio com estimativa separada do valor; sem duplicar', async () => {
    const c = await setupCompany()
    const orgId = (await (await c.admin.get('/api/me')).json()).organizationId as string
    expect((await toggle(orgId, true)).status()).toBe(200)
    const chat = newChat()
    await c.send(chat, 'Quanto custa a limpeza?', { minutes: 90, pushName: 'Lead Sincronizado' })
    await c.send(chat, 'Fica R$ 300', { fromMe: true, minutes: 80 })
    await c.send(chat, 'Ainda não paguei, pode mandar a chave de novo?', { minutes: 10 })
    const tick = await c.tick({ onlyThisCompany: true })
    expect(tick.crm).toMatchObject({ organizations: 1 })
    expect(tick.crm.dead).toBe(0)

    const conv = await testDb.conversation.findFirstOrThrow({ where: { organizationId: orgId, contact: { displayName: 'Lead Sincronizado' } } })
    const opp = await testDb.revenueOpportunity.findFirstOrThrow({ where: { conversationId: conv.id, status: 'active' } })
    // D2: com a criação automática desligada, nada vira negócio sozinho
    expect(await testDb.crmDeal.count({ where: { organizationId: orgId } })).toBe(0)
    const list = (await (await c.admin.get('/api/crm/suggestions')).json()).suggestions as Array<{ id: string; kind: string; opportunityId: string; payload: { estimatedAmountCents: number | null } }>
    const s = list.find((x) => x.kind === 'create_deal' && x.opportunityId === opp.id)
    expect(s).toBeTruthy()

    // reler (nova rodada) não duplica evento nem sugestão
    await c.tick({ onlyThisCompany: true })
    expect(await testDb.crmOutboxEvent.count({ where: { organizationId: orgId, eventType: 'opportunity.detected', aggregateId: opp.id } })).toBe(1)
    expect(await testDb.crmSuggestion.count({ where: { organizationId: orgId, opportunityId: opp.id, kind: 'create_deal' } })).toBe(1)
    // o payload do evento não leva nome, telefone ou texto da mensagem
    const evt = await testDb.crmOutboxEvent.findFirstOrThrow({ where: { organizationId: orgId, aggregateId: opp.id } })
    expect(evt.payloadJson).not.toContain('Lead Sincronizado')
    expect(evt.payloadJson).not.toContain('limpeza')
    expect(evt.payloadJson).not.toContain(chat.slice(0, 13))

    const acc = await c.admin.post(`/api/crm/suggestions/${s!.id}/accept`, { data: {} })
    expect(acc.status(), await acc.text()).toBe(200)
    const { dealId } = await acc.json()
    const deal = await testDb.crmDeal.findUniqueOrThrow({ where: { id: dealId } })
    expect(deal).toMatchObject({ source: 'opportunity', amountCents: null, amountSource: 'unknown', estimatedAmountCents: s!.payload.estimatedAmountCents })
    expect((await c.admin.post(`/api/crm/suggestions/${s!.id}/accept`, { data: {} })).status()).toBe(409)
    const again = await c.admin.post('/api/crm/deals/from-opportunity', { data: { opportunityId: opp.id } })
    expect(again.status()).toBe(200)
    expect(await again.json()).toMatchObject({ created: false, deal: { id: dealId } })
    expect(await testDb.crmDeal.count({ where: { organizationId: orgId } })).toBe(1)

    // pessoa criada a partir do contato do WhatsApp, ligada à conversa
    const person = await (await c.admin.get(`/api/crm/contacts/${deal.personId}`)).json()
    expect(person.person).toMatchObject({ name: 'Lead Sincronizado', source: 'whatsapp', phoneLast4: chat.split('@')[0].slice(-4) })
    expect((person.conversations as Array<{ id: string }>).map((x) => x.id)).toContain(conv.id)
    expect(await testDb.crmBusinessLink.count({ where: { dealId, conversationId: conv.id, revenueOpportunityId: opp.id } })).toBe(1)

    const status = await (await c.admin.get('/api/crm/integration/status')).json()
    expect(status.canRetry).toBe(true)
    expect(status.dead).toEqual([])
    expect((status.checkpoints as Array<{ resource: string; lastSuccessAt: string | null }>).find((x) => x.resource === 'capture:opportunities')?.lastSuccessAt).toBeTruthy()

    // CRM desligado: a rodada não lê mais esta empresa
    expect((await toggle(orgId, false)).status()).toBe(200)
    expect((await c.tick({ onlyThisCompany: true })).crm.organizations).toBe(0)
    await c.dispose()
  })

  test('desfecho humano manda: fechar o negócio como perdido reflete na conversa só pela regra do produto', async () => {
    const c = await setupCompany()
    const orgId = (await (await c.admin.get('/api/me')).json()).organizationId as string
    expect((await toggle(orgId, true)).status()).toBe(200)
    const chat = newChat()
    await c.send(chat, 'Quanto custa o clareamento?', { minutes: 60, pushName: 'Lead Perdido' })
    await c.send(chat, 'Fica R$ 900', { fromMe: true, minutes: 50 })
    await c.tick({ onlyThisCompany: true })
    const conv = await testDb.conversation.findFirstOrThrow({ where: { organizationId: orgId, contact: { displayName: 'Lead Perdido' } } })
    const opp = await testDb.revenueOpportunity.findFirstOrThrow({ where: { conversationId: conv.id } })
    const created = await c.admin.post('/api/crm/deals/from-opportunity', { data: { opportunityId: opp.id } })
    expect(created.status(), await created.text()).toBe(201)
    const deal = (await created.json()).deal
    const lost = await c.admin.post(`/api/crm/deals/${deal.id}/close`, { data: { outcome: 'lost', version: deal.version, lostReasonCode: 'competitor' } })
    expect(lost.status(), await lost.text()).toBe(200)
    // a conversa de origem recebe o resultado (uma, sem divergência) e fica como perdida no banco
    expect((await lost.json()).conversations).toEqual({ reflected: 1, kept: 0 })
    expect((await testDb.conversation.findUniqueOrThrow({ where: { id: conv.id } })).operationalStatus).toBe('lost')
    // a análise roda de novo e não desfaz a decisão humana
    await c.tick({ onlyThisCompany: true })
    expect((await testDb.crmDeal.findUniqueOrThrow({ where: { id: deal.id } })).status).toBe('lost')
    await c.dispose()
  })
})

test.describe('CRM · dados da empresa (LGPD)', () => {
  test('a exportação de dados da empresa leva o CRM (telefone decifrado só para a própria empresa, sem chaves internas)', async () => {
    const c = await company()
    const p = phone()
    await c.admin.post('/api/crm/contacts', { data: { name: 'Na exportação', phone: p } })
    await newDeal(c.admin, { title: 'Negócio exportado' })
    const r = await c.admin.get('/api/organization/export')
    expect(r.status()).toBe(200)
    const text = await r.text()
    expect(text).not.toContain('phoneEncrypted')
    expect(text).not.toContain('phoneKey')
    const data = JSON.parse(text)
    expect(data.crmPessoas.map((x: { name: string }) => x.name)).toContain('Na exportação')
    expect(data.crmNegocios.map((x: { title: string }) => x.title)).toContain('Negócio exportado')
    expect(data.crmFunis).toHaveLength(1)
    expect(data.crmFunis[0].stages).toHaveLength(5)
    await c.admin.dispose()
  })
})
