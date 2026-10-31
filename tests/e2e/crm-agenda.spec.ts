import { test, expect, type APIRequestContext } from '@playwright/test'
import { createUser, loginAs, signupOrg, STRONG, uid } from './helpers'
import { testDb } from './db'
import { crmOffAfterFile } from './crm-cleanup'

// CRM-04 · agenda das tarefas pela API: janela de prazo (dueAfter inclusivo, dueBefore estrito), "Hoje" e "Próximos 7
// dias" (due=today|next7) no fuso da empresa, "pendente" = aberta + em andamento, escopo do atendente e a auditoria de
// reatribuição e conclusão (só nomes de campo, situação e IDs de membro). Empresa nova pelo cadastro real; o CRM é ligado
// pelo operador, como em crm-api.spec.ts.

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

type Act = { id: string; title: string; status: string; ownerMemberId: string | null; dueAt: string | null; version: number; overdue?: boolean }
type ListBody = { items: Act[]; total: number; timezone: string }

async function task(api: APIRequestContext, data: Record<string, unknown> = {}) {
  const r = await api.post('/api/crm/activities', { data: { type: 'follow_up', title: `Tarefa ${uid()}`, ...data } })
  expect(r.status(), await r.text()).toBe(201)
  return (await r.json()).activity as Act
}

async function patch(api: APIRequestContext, a: { id: string; version: number }, data: Record<string, unknown>) {
  const r = await api.patch(`/api/crm/activities/${a.id}`, { data: { ...data, version: a.version } })
  expect(r.status(), await r.text()).toBe(200)
  return (await r.json()).activity as Act
}

async function list(api: APIRequestContext, query: string): Promise<ListBody> {
  const r = await api.get(`/api/crm/activities?${query}${query ? '&' : ''}limit=100`)
  expect(r.status(), await r.text()).toBe(200)
  return r.json()
}

const ids = (items: Array<{ id: string }>) => items.map((a) => a.id).sort()
const find = async (api: APIRequestContext, id: string) => (await list(api, '')).items.find((a) => a.id === id)

const HOUR = 3600_000
const DAY = 24 * HOUR
/** Dia (AAAA-MM-DD) num fuso de deslocamento fixo, `plus` dias depois de hoje. São Paulo (-3) e Manaus (-4) não têm
 *  horário de verão desde 2019: a conta é independente da que o servidor faz com o Intl. */
const dayIn = (offsetHours: number, plus = 0) => new Date(Date.now() + offsetHours * HOUR + plus * DAY).toISOString().slice(0, 10)
/** Folga antes da meia-noite: maior que o trecho do teste que compara dias (a primeira chamada de uma rota compila no dev). */
const MIDNIGHT_MARGIN = 5 * 60_000
/** Perto da meia-noite do fuso o "hoje" do teste e o do servidor podem cair em dias diferentes: espera a virada. */
async function awayFromMidnight(offsetHours: number) {
  const left = DAY - ((((Date.now() + offsetHours * HOUR) % DAY) + DAY) % DAY)
  if (left < MIDNIGHT_MARGIN) await new Promise((r) => setTimeout(r, left + 2000))
}

test.describe('CRM-04 · agenda e janela de prazo', () => {
  test('dueAfter (inclusivo) e dueBefore (estrito) devolvem só as tarefas da janela; o mesmo instante com offset dá o mesmo', async () => {
    const c = await company()
    const at = (dueAt: string) => task(c.admin, { dueAt })
    const antes = await at('2031-03-10T09:59:59.999Z')
    const inicio = await at('2031-03-10T10:00:00.000Z')
    const meio = await at('2031-03-10T15:00:00.000Z')
    const fim = await at('2031-03-10T20:00:00.000Z')
    const semPrazo = await task(c.admin)

    const janela = await list(c.admin, `dueAfter=${encodeURIComponent('2031-03-10T10:00:00Z')}&dueBefore=${encodeURIComponent('2031-03-10T20:00:00Z')}`)
    expect(ids(janela.items)).toEqual(ids([inicio, meio]))
    expect(janela.total).toBe(2)
    // o mesmo intervalo escrito no horário de Brasília
    const comOffset = await list(c.admin, `dueAfter=${encodeURIComponent('2031-03-10T07:00:00-03:00')}&dueBefore=${encodeURIComponent('2031-03-10T17:00:00-03:00')}`)
    expect(ids(comOffset.items)).toEqual(ids([inicio, meio]))
    // só o limite de baixo: dali em diante (sem prazo fica fora)
    expect(ids((await list(c.admin, `dueAfter=${encodeURIComponent('2031-03-10T15:00:00Z')}`)).items)).toEqual(ids([meio, fim]))
    // sem filtro de prazo as cinco aparecem (nada foi escondido por engano)
    expect(ids((await list(c.admin, '')).items)).toEqual(ids([antes, inicio, meio, fim, semPrazo]))
    await c.admin.dispose()
  })

  test('filtro inválido = 400 com a mensagem exata; "pending" vale só na leitura, não como situação gravada', async () => {
    const c = await company()
    const a = await task(c.admin)
    for (const [query, message] of [
      ['dueAfter=ontem', 'Data inválida.'],
      ['dueAfter=2031-03-10', 'Data inválida.'],
      [`dueBefore=${encodeURIComponent('amanhã')}`, 'Data inválida.'],
      ['due=amanha', 'Campo inválido: due.'],
      ['status=pendente', 'Campo inválido: status.'],
      [`dueFrom=${encodeURIComponent('2031-03-10T10:00:00Z')}`, 'Campo não permitido: dueFrom.'],
    ]) {
      const r = await c.admin.get(`/api/crm/activities?${query}`)
      expect(r.status(), query).toBe(400)
      expect(await r.json(), query).toMatchObject({ code: 'crm_invalid', error: message })
    }
    const r = await c.admin.patch(`/api/crm/activities/${a.id}`, { data: { status: 'pending', version: a.version } })
    expect(r.status()).toBe(400)
    expect(await r.json()).toMatchObject({ code: 'crm_invalid', error: 'Campo inválido: status.' })
    expect(await find(c.admin, a.id)).toMatchObject({ status: 'open', version: a.version })
    await c.admin.dispose()
  })

  test('due=today e due=next7 contam o dia no fuso da empresa (São Paulo; depois Manaus), com abertas e em andamento', async () => {
    // a meia-noite de São Paulo e a de Manaus ficam 1 h longe: no máximo uma das duas esperas acontece
    test.setTimeout(240000 + MIDNIGHT_MARGIN)
    const c = await company()
    await awayFromMidnight(-3)
    const hoje = dayIn(-3)
    const sp = (plus: number) => dayIn(-3, plus)
    const dues = {
      ontemFim: `${sp(-1)}T23:59:59-03:00`,
      hojeInicio: `${hoje}T00:00:00-03:00`,
      hojeFim: `${hoje}T23:59:59-03:00`,
      amanha: `${sp(1)}T00:00:00-03:00`,
      dia7Fim: `${sp(7)}T23:59:59-03:00`,
      dia8: `${sp(8)}T00:00:00-03:00`,
    }
    const t = {} as Record<keyof typeof dues, Act>
    for (const [k, dueAt] of Object.entries(dues) as Array<[keyof typeof dues, string]>) t[k] = await task(c.admin, { dueAt, title: `Agenda ${k}` })
    // em andamento entra na agenda; concluída e cancelada, não
    const andamento = await patch(c.admin, await task(c.admin, { dueAt: `${hoje}T12:00:00-03:00` }), { status: 'in_progress' })
    const feita = await patch(c.admin, await task(c.admin, { dueAt: `${hoje}T12:00:00-03:00` }), { status: 'done' })
    const cancelada = await patch(c.admin, await task(c.admin, { dueAt: `${sp(2)}T12:00:00-03:00` }), { status: 'cancelled' })

    const today = await list(c.admin, 'status=pending&due=today')
    expect(today.timezone).toBe('America/Sao_Paulo')
    expect(ids(today.items)).toEqual(ids([t.hojeInicio, t.hojeFim, andamento]))
    const next7 = await list(c.admin, 'status=pending&due=next7')
    expect(ids(next7.items)).toEqual(ids([t.hojeInicio, t.hojeFim, t.amanha, t.dia7Fim, andamento]))
    // sem "status", due filtra só o prazo: concluída e cancelada da janela aparecem
    expect(ids((await list(c.admin, 'due=next7')).items)).toEqual(ids([t.hojeInicio, t.hojeFim, t.amanha, t.dia7Fim, andamento, feita, cancelada]))

    // a empresa passa para Manaus (-04:00): os limites do dia acompanham
    const s = await c.admin.patch('/api/settings', { data: { timezone: 'America/Manaus' } })
    expect(s.status(), await s.text()).toBe(200)
    await awayFromMidnight(-4)
    const mn = dayIn(-4)
    const lo = Date.parse(`${mn}T00:00:00-04:00`)
    const pending = [...Object.values(t), andamento]
    const inWindow = (end: number) => ids(pending.filter((a) => Date.parse(a.dueAt!) >= lo && Date.parse(a.dueAt!) < end))
    const todayMn = await list(c.admin, 'status=pending&due=today')
    expect(todayMn.timezone).toBe('America/Manaus')
    expect(ids(todayMn.items)).toEqual(inWindow(lo + DAY))
    expect(ids((await list(c.admin, 'status=pending&due=next7')).items)).toEqual(inWindow(lo + 8 * DAY))
    // 00:00 de Brasília ainda é 23:00 do dia anterior em Manaus
    if (mn === hoje) expect(ids(todayMn.items)).not.toContain(t.hojeInicio.id)
    await c.admin.dispose()
  })

  test('em andamento é pendente: aparece em status=pending e em atrasadas quando vence; status=open segue só as abertas', async () => {
    const c = await company()
    const vencida = await task(c.admin, { dueAt: new Date(Date.now() - 2 * HOUR).toISOString() })
    const futura = await task(c.admin, { dueAt: new Date(Date.now() + 2 * DAY).toISOString() })
    const aberta = await task(c.admin, { dueAt: new Date(Date.now() - HOUR).toISOString() })
    const emAndamento = await patch(c.admin, vencida, { status: 'in_progress' })
    const futuraAndamento = await patch(c.admin, futura, { status: 'in_progress' })
    expect(emAndamento).toMatchObject({ status: 'in_progress', version: vencida.version + 1 })

    expect(ids((await list(c.admin, 'status=pending')).items)).toEqual(ids([emAndamento, futuraAndamento, aberta]))
    // compatível: "open" continua sendo só a situação "Aberta"
    expect(ids((await list(c.admin, 'status=open')).items)).toEqual([aberta.id])
    expect(ids((await list(c.admin, 'status=in_progress')).items)).toEqual(ids([emAndamento, futuraAndamento]))

    const atrasadas = await list(c.admin, 'overdue=1')
    expect(ids(atrasadas.items)).toEqual(ids([emAndamento, aberta]))
    expect(atrasadas.items.every((a) => a.overdue)).toBe(true)
    expect((await find(c.admin, futuraAndamento.id))?.overdue).toBe(false)
    expect((await (await c.admin.get('/api/crm/overview')).json()).overdueTasks).toBe(2)

    // concluída sai das pendentes e das atrasadas
    await patch(c.admin, emAndamento, { status: 'done' })
    expect(ids((await list(c.admin, 'overdue=1')).items)).toEqual([aberta.id])
    expect(ids((await list(c.admin, 'status=pending')).items)).toEqual(ids([futuraAndamento, aberta]))
    await c.admin.dispose()
  })
})

test.describe('CRM-04 · quem edita e o que fica auditado', () => {
  test('atendente não troca o responsável (403 com a mensagem do domínio) e não vê nem altera tarefa de outra pessoa (404)', async () => {
    const c = await company()
    const email = `atendente.${uid()}@cliente.test`
    const att = await createUser(c.admin, { email, role: 'atendente' })
    const attApi = await loginAs(email, STRONG)

    const minha = await task(attApi, { title: 'Retornar ao cliente da loja' })
    expect(minha.ownerMemberId).toBe(att.id)
    const r = await attApi.patch(`/api/crm/activities/${minha.id}`, { data: { ownerMemberId: c.memberId, version: minha.version } })
    expect(r.status()).toBe(403)
    expect(await r.json()).toMatchObject({ code: 'crm_forbidden', error: 'Só o supervisor ou o gestor troca o responsável.' })
    expect(await find(attApi, minha.id)).toMatchObject({ ownerMemberId: att.id, version: minha.version })

    // ele edita o resto da própria tarefa (título, situação), sem trocar o responsável
    const editada = await patch(attApi, minha, { title: 'Retornar ao cliente amanhã', status: 'in_progress' })
    expect(await find(attApi, minha.id)).toMatchObject({ title: 'Retornar ao cliente amanhã', status: 'in_progress', ownerMemberId: att.id, version: editada.version })

    const daAdmin = await task(c.admin, { title: 'Tarefa da administradora' })
    expect(daAdmin.ownerMemberId).toBe(c.memberId)
    expect(ids((await list(attApi, 'status=pending')).items)).toEqual([minha.id])
    const outra = await attApi.patch(`/api/crm/activities/${daAdmin.id}`, { data: { status: 'done', version: daAdmin.version } })
    expect(outra.status()).toBe(404)
    expect(await outra.json()).toMatchObject({ code: 'crm_not_found', error: 'Atividade não encontrada.' })
    expect(await find(c.admin, daAdmin.id)).toMatchObject({ status: 'open', version: daAdmin.version })
    expect(await testDb.auditLog.count({ where: { organizationId: c.orgId, action: 'crm.activity_updated', targetId: daAdmin.id } })).toBe(0)
    await attApi.dispose()
    await c.admin.dispose()
  })

  test('administradora reatribui e conclui: a auditoria guarda os campos, a situação e os IDs de membro, nunca o texto', async () => {
    const c = await company()
    const email = `atendente.${uid()}@cliente.test`
    const att = await createUser(c.admin, { email, role: 'atendente' })
    const segredo = `Ligar para Joana ${uid()}`
    const a = await task(c.admin, { title: segredo, notes: 'Cliente pediu desconto de 10%' })

    const reatribuida = await patch(c.admin, a, { ownerMemberId: att.id })
    expect(await find(c.admin, a.id)).toMatchObject({ ownerMemberId: att.id, version: a.version + 1 })
    // o atendente passa a ver a tarefa que agora é dele
    const attApi = await loginAs(email, STRONG)
    expect(ids((await list(attApi, 'status=pending')).items)).toEqual([a.id])
    await attApi.dispose()

    // mandar o mesmo responsável não muda nada: nem versão nem auditoria
    const igual = await patch(c.admin, reatribuida, { ownerMemberId: att.id })
    expect(igual.version).toBe(reatribuida.version)

    const concluida = await patch(c.admin, reatribuida, { status: 'done' })
    expect(await find(c.admin, a.id)).toMatchObject({ status: 'done', version: reatribuida.version + 1 })

    const logs = await testDb.auditLog.findMany({ where: { organizationId: c.orgId, action: 'crm.activity_updated', targetId: a.id } })
    expect(logs).toHaveLength(2)
    expect(logs.map((l) => JSON.parse(l.details ?? '{}'))).toEqual(
      expect.arrayContaining([
        { fields: ['ownerMemberId'], status: 'open', ownerFrom: c.memberId, ownerTo: att.id },
        { fields: ['status'], status: 'done', statusFrom: 'open' },
      ]),
    )
    expect(concluida.status).toBe('done')
    for (const l of logs) {
      expect(l.details).not.toContain('Joana')
      expect(l.details).not.toContain('desconto')
      expect(l.details).not.toContain(email)
      expect(l.targetLabel).toBeNull()
    }
    await c.admin.dispose()
  })

  test('PATCH sem mudança real (mesmo título, observação, prioridade, situação e prazo em outro offset) não gasta versão nem audita', async () => {
    const c = await company()
    const due = '2031-03-10T15:00:00.000Z'
    const a = await task(c.admin, { title: 'Ligar para o cliente', notes: 'Confirmar o horário', priority: 'high', dueAt: due })
    const same = await patch(c.admin, a, { title: '  Ligar para o cliente  ', notes: 'Confirmar o horário', priority: 'high', status: 'open', dueAt: '2031-03-10T12:00:00-03:00' })
    expect(same.version).toBe(a.version)
    expect(await find(c.admin, a.id)).toMatchObject({ title: 'Ligar para o cliente', dueAt: due, version: a.version })
    expect(await testDb.auditLog.count({ where: { organizationId: c.orgId, action: 'crm.activity_updated', targetId: a.id } })).toBe(0)

    // quem leu a versão antes continua salvando: a escrita que não mudou nada não deu 409 a ninguém
    const changed = await patch(c.admin, a, { title: 'Ligar para o cliente amanhã' })
    expect(changed.version).toBe(a.version + 1)
    expect(await find(c.admin, a.id)).toMatchObject({ title: 'Ligar para o cliente amanhã', version: a.version + 1 })
    const logs = await testDb.auditLog.findMany({ where: { organizationId: c.orgId, action: 'crm.activity_updated', targetId: a.id } })
    expect(logs.map((l) => JSON.parse(l.details ?? '{}'))).toEqual([{ fields: ['title'], status: 'open' }])
    await c.admin.dispose()
  })

  test('responsável precisa ver as tarefas: visualizador e analista são recusados ao criar e ao reatribuir (400) e nada muda', async () => {
    const c = await company()
    const viewer = await createUser(c.admin, { email: `visualizador.${uid()}@cliente.test`, role: 'viewer' })
    const analista = await createUser(c.admin, { email: `analista.${uid()}@cliente.test`, role: 'analista' })
    const error = 'Esta pessoa não vê as tarefas do CRM. Escolha outro responsável.'

    for (const m of [viewer, analista]) {
      const r = await c.admin.post('/api/crm/activities', { data: { type: 'follow_up', title: `Tarefa ${uid()}`, ownerMemberId: m.id } })
      expect(r.status()).toBe(400)
      expect(await r.json()).toMatchObject({ code: 'crm_invalid', error })
    }
    const a = await task(c.admin)
    for (const m of [viewer, analista]) {
      const r = await c.admin.patch(`/api/crm/activities/${a.id}`, { data: { ownerMemberId: m.id, version: a.version } })
      expect(r.status()).toBe(400)
      expect(await r.json()).toMatchObject({ code: 'crm_invalid', error })
    }
    // só a tarefa válida existe, com o responsável e a versão de antes, e sem auditoria de alteração
    const all = await list(c.admin, '')
    expect(ids(all.items)).toEqual([a.id])
    expect(all.items[0]).toMatchObject({ ownerMemberId: c.memberId, version: a.version })
    expect(await testDb.auditLog.count({ where: { organizationId: c.orgId, action: 'crm.activity_updated', targetId: a.id } })).toBe(0)

    // atendente vê as tarefas: a reatribuição passa
    const att = await createUser(c.admin, { email: `atendente.${uid()}@cliente.test`, role: 'atendente' })
    await patch(c.admin, a, { ownerMemberId: att.id })
    expect(await find(c.admin, a.id)).toMatchObject({ ownerMemberId: att.id, version: a.version + 1 })
    await c.admin.dispose()
  })
})
