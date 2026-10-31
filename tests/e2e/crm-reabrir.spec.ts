import { test, expect, type APIRequestContext } from '@playwright/test'
import { createUser, loginAs, signupOrg, STRONG, uid } from './helpers'
import { testDb } from './db'
import { DomainError, reopenDeal, SYSTEM_ACTOR, type Tx } from '../../src/lib/crm/deals'
import { REOPEN_REASON } from '../../src/lib/crm/labels'
import { crmOffAfterFile } from './crm-cleanup'

// CRM-03 · reabrir com justificativa: o motivo é obrigatório (3 a 500 caracteres visíveis, validado no servidor e de
// novo no domínio), fica no evento "reopened" do histórico com quem reabriu e quando, e não vai para a auditoria. Papel
// sem crm.deals.manage = 403; negócio de outra empresa ou fora do escopo do atendente = 404. Cada teste confere pela API
// (GET) o que ficou gravado.

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

type Deal = { id: string; version: number; status: string; stageId: string; ownerMemberId: string | null }
type DealEvent = { type: string; data: Record<string, unknown>; actorMemberId: string | null; actorLabel: string | null; origin: string; toStageId: string | null; createdAt: string }

/** Negócio novo já marcado como ganho (sem valor, com a confirmação explícita). */
async function wonDeal(api: APIRequestContext, extra: Record<string, unknown> = {}): Promise<Deal> {
  const r = await api.post('/api/crm/deals', { data: { title: `Negócio ${uid()}`, ...extra } })
  expect(r.status(), await r.text()).toBe(201)
  const deal = (await r.json()).deal as Deal
  const won = await api.post(`/api/crm/deals/${deal.id}/close`, { data: { outcome: 'won', version: deal.version, confirmNoAmount: true } })
  expect(won.status(), await won.text()).toBe(200)
  return (await won.json()).deal as Deal
}

async function detail(api: APIRequestContext, id: string) {
  const r = await api.get(`/api/crm/deals/${id}`)
  expect(r.status()).toBe(200)
  return (await r.json()) as { deal: Deal; events: DealEvent[] }
}

const reopen = (api: APIRequestContext, id: string, data: Record<string, unknown>) => api.post(`/api/crm/deals/${id}/reopen`, { data })

test.describe('CRM-03 · reabrir com justificativa', () => {
  test('sem motivo, curto, só invisíveis, longo, com caractere de controle ou bidi, ou campo a mais: 400 com a mensagem e o negócio continua ganho', async () => {
    const c = await company()
    const deal = await wonDeal(c.admin)
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['sem motivo', { version: deal.version }, 'Informe o motivo da reabertura.'],
      ['motivo nulo', { version: deal.version, reason: null }, 'Informe o motivo da reabertura.'],
      ['motivo vazio', { version: deal.version, reason: '' }, 'Informe o motivo da reabertura.'],
      ['motivo curto (só espaços em volta)', { version: deal.version, reason: '   ab   ' }, 'Informe o motivo da reabertura.'],
      ['motivo que não é texto', { version: deal.version, reason: 123 }, 'Informe o motivo da reabertura.'],
      // invisíveis não contam para o mínimo: espaço de largura zero, preenchimento hangul, duas letras com invisíveis
      ['só espaços de largura zero', { version: deal.version, reason: '​​​' }, 'Informe o motivo da reabertura.'],
      ['só preenchimento invisível', { version: deal.version, reason: 'ㅤㅤㅤ' }, 'Informe o motivo da reabertura.'],
      ['duas letras com invisíveis', { version: deal.version, reason: 'o‍k⁠﻿' }, 'Informe o motivo da reabertura.'],
      ['motivo com 501 caracteres', { version: deal.version, reason: 'a'.repeat(501) }, 'Motivo com mais de 500 caracteres.'],
      ['caractere de controle', { version: deal.version, reason: 'Cliente\u0007 voltou' }, 'O motivo tem caracteres que não podem ser gravados.'],
      ['controle bidi (isolamento)', { version: deal.version, reason: '⁦Cliente voltou⁩' }, 'O motivo tem caracteres que não podem ser gravados.'],
      ['controle bidi (inversão)', { version: deal.version, reason: 'Cliente ‮atlov' }, 'O motivo tem caracteres que não podem ser gravados.'],
      ['campo a mais', { version: deal.version, reason: 'Cliente voltou', status: 'open' }, 'Campo não permitido: status.'],
    ]
    for (const [label, body, message] of cases) {
      const r = await reopen(c.admin, deal.id, body)
      expect(r.status(), label).toBe(400)
      expect(await r.json(), label).toMatchObject({ code: 'crm_invalid', error: message })
    }
    const after = await detail(c.admin, deal.id)
    expect(after.deal).toMatchObject({ status: 'won', version: deal.version })
    expect(after.events.map((e) => e.type)).not.toContain('reopened')
    expect(await testDb.auditLog.count({ where: { organizationId: c.orgId, action: 'crm.deal_reopened' } })).toBe(0)
    await c.admin.dispose()
  })

  test('com motivo: 200, o negócio volta aberto e o evento traz o motivo (sem os espaços em volta), o autor e a data; a auditoria não leva o texto', async () => {
    const c = await company()
    const deal = await wonDeal(c.admin)
    const before = Date.now()
    const r = await reopen(c.admin, deal.id, { version: deal.version, reason: '   O cliente pediu para rever o prazo de entrega   ' })
    expect(r.status(), await r.text()).toBe(200)
    expect((await r.json()).deal).toMatchObject({ id: deal.id, status: 'open', stageId: deal.stageId, version: deal.version + 1 })

    const after = await detail(c.admin, deal.id)
    expect(after.deal).toMatchObject({ status: 'open', version: deal.version + 1 })
    const ev = after.events[0] // do mais recente para o mais antigo
    expect(ev).toMatchObject({ type: 'reopened', origin: 'manual', actorMemberId: c.memberId, toStageId: deal.stageId, data: { from: 'won', reason: 'O cliente pediu para rever o prazo de entrega' } })
    expect(ev.actorLabel).toBeTruthy()
    const at = new Date(ev.createdAt).getTime()
    expect(at).toBeGreaterThanOrEqual(before - 5_000)
    expect(at).toBeLessThanOrEqual(Date.now() + 5_000)

    const logs = await testDb.auditLog.findMany({ where: { organizationId: c.orgId, action: 'crm.deal_reopened' } })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ targetType: 'crm_deal', targetId: deal.id, actorMemberId: c.memberId })
    expect(JSON.stringify(logs[0])).not.toContain('prazo de entrega')

    // a versão lida antes da reabertura ficou velha: 409, e nada é gravado de novo
    const stale = await reopen(c.admin, deal.id, { version: deal.version, reason: 'Segunda tentativa' })
    expect(stale.status()).toBe(409)
    expect((await stale.json()).code).toBe('crm_version_conflict')
    expect((await detail(c.admin, deal.id)).events.filter((e) => e.type === 'reopened')).toHaveLength(1)
    await c.admin.dispose()
  })

  test('motivo no limite (500 caracteres, com aspas, barras e quebras de linha) e com HTML: gravado inteiro, como texto', async () => {
    const c = await company()
    const deal = await wonDeal(c.admin)
    // aspas e barras dobram de tamanho no JSON do evento: o motivo inteiro tem de caber
    const long = `Início "${'\\"'.repeat(120)}"\n${'x'.repeat(500)}`.slice(0, 499) + 'Z'
    expect(long).toHaveLength(500)
    const r = await reopen(c.admin, deal.id, { version: deal.version, reason: long })
    expect(r.status(), await r.text()).toBe(200)
    expect((await detail(c.admin, deal.id)).events[0].data.reason).toBe(long)

    const lost = await c.admin.post(`/api/crm/deals/${deal.id}/close`, { data: { outcome: 'lost', version: deal.version + 1, lostReasonCode: 'price' } })
    expect(lost.status(), await lost.text()).toBe(200)
    const html = '<img src=x onerror=alert(1)> cliente voltou'
    const again = await reopen(c.admin, deal.id, { version: deal.version + 2, reason: html })
    expect(again.status(), await again.text()).toBe(200)
    const ev = (await detail(c.admin, deal.id)).events[0]
    expect(ev).toMatchObject({ type: 'reopened', data: { from: 'lost', reason: html } })

    // emoji com ZWJ (caractere de formato) continua aceito: dos caracteres de formato, só os controles bidi são recusados
    const archived = await c.admin.delete(`/api/crm/deals/${deal.id}`, { data: { version: deal.version + 3 } })
    expect(archived.status(), await archived.text()).toBe(200)
    const emoji = 'Cliente \u{1F468}‍\u{1F469}‍\u{1F467} voltou com a família'
    const third = await reopen(c.admin, deal.id, { version: deal.version + 4, reason: emoji })
    expect(third.status(), await third.text()).toBe(200)
    expect((await detail(c.admin, deal.id)).events[0]).toMatchObject({ type: 'reopened', data: { from: 'archived', reason: emoji } })
    await c.admin.dispose()
  })

  test('papel sem crm.deals.manage (analista) recebe 403 e o negócio continua ganho', async () => {
    const c = await company()
    const deal = await wonDeal(c.admin)
    const email = `analista.${uid()}@cliente.test`
    await createUser(c.admin, { email, role: 'analista' })
    const analista = await loginAs(email, STRONG)
    const r = await reopen(analista, deal.id, { version: deal.version, reason: 'O cliente pediu outra proposta' })
    expect(r.status()).toBe(403)
    const after = await detail(c.admin, deal.id)
    expect(after.deal).toMatchObject({ status: 'won', version: deal.version })
    expect(after.events.map((e) => e.type)).not.toContain('reopened')
    await analista.dispose()
    await c.admin.dispose()
  })

  test('atendente: negócio de outro responsável ou sem responsável = 404 (fora do escopo); o próprio ele reabre com motivo', async () => {
    const c = await company()
    // um com outro responsável de verdade (o admin) e um sem responsável: os dois ficam fora do escopo "só os meus"
    const others = await wonDeal(c.admin, { ownerMemberId: c.memberId })
    expect(others.ownerMemberId).toBe(c.memberId)
    const ownerless = await wonDeal(c.admin)
    expect(ownerless.ownerMemberId).toBeNull()
    const email = `atendente.${uid()}@cliente.test`
    const member = await createUser(c.admin, { email, role: 'atendente' })
    const att = await loginAs(email, STRONG)
    for (const [label, d] of [['de outro responsável', others], ['sem responsável', ownerless]] as const) {
      const denied = await reopen(att, d.id, { version: d.version, reason: 'O cliente pediu outra proposta' })
      expect(denied.status(), label).toBe(404)
      expect((await denied.json()).code, label).toBe('crm_not_found')
      const after = await detail(c.admin, d.id)
      expect(after.deal, label).toMatchObject({ status: 'won', version: d.version, ownerMemberId: d.ownerMemberId })
      expect(after.events.map((e) => e.type), label).not.toContain('reopened')
    }

    const own = await wonDeal(att)
    const ok = await reopen(att, own.id, { version: own.version, reason: 'Cliente desistiu do cancelamento' })
    expect(ok.status(), await ok.text()).toBe(200)
    const ev = (await detail(c.admin, own.id)).events[0]
    expect(ev).toMatchObject({ type: 'reopened', actorMemberId: member.id, data: { from: 'won', reason: 'Cliente desistiu do cancelamento' } })
    await att.dispose()
    await c.admin.dispose()
  })

  test('negócio de outra empresa: 404 crm_not_found, e nada muda na empresa dona', async () => {
    const a = await company()
    const b = await company()
    const deal = await wonDeal(a.admin)
    const r = await reopen(b.admin, deal.id, { version: deal.version, reason: 'Tentativa de outra empresa' })
    expect(r.status()).toBe(404)
    expect((await r.json()).code).toBe('crm_not_found')
    const after = await detail(a.admin, deal.id)
    expect(after.deal).toMatchObject({ status: 'won', version: deal.version })
    expect(after.events.map((e) => e.type)).not.toContain('reopened')
    expect(await testDb.auditLog.count({ where: { organizationId: b.orgId, action: 'crm.deal_reopened' } })).toBe(0)
    await a.admin.dispose()
    await b.admin.dispose()
  })

  test('domínio: reopenDeal aplica a mesma regra do motivo antes de tocar no banco (defesa para outro chamador)', async () => {
    // sem a regra aqui, um motivo longo ou cheio de controles estouraria o teto do JSON do evento, que seria cortado
    const untouched = new Proxy({}, { get: () => { throw new Error('reopenDeal tocou no banco') } }) as unknown as Tx
    const cases: Array<[string, string, string]> = [
      ['curto', '  ab  ', REOPEN_REASON.required],
      ['só invisíveis', '​​​', REOPEN_REASON.required],
      ['2.000 caracteres', 'x'.repeat(2000), REOPEN_REASON.tooLong],
      ['400 caracteres de controle', '\u0001'.repeat(400), REOPEN_REASON.badChars],
      ['controle bidi', 'Cliente ‮atlov', REOPEN_REASON.badChars],
    ]
    for (const [label, reason, message] of cases) {
      const err = await reopenDeal(untouched, 'org', { kind: 'all' }, 'deal', { version: 1, reason }, SYSTEM_ACTOR).then(() => null, (e: unknown) => e)
      expect(err, label).toBeInstanceOf(DomainError)
      expect(err, label).toMatchObject({ status: 400, code: 'crm_invalid', message })
    }
  })
})
