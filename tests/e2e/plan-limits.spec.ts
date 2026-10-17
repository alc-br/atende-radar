import { test, expect } from '@playwright/test'
import { loginAs, signupOrg, uid } from './helpers'
import { gatewayClient, setupCompany } from './gw'
import { testDb } from './db'

// V2/V7/T11 · lacunas de plano e cobrança: cota de exportações, bloqueio de rebaixamento acima dos limites
// e avisos de fim do teste grátis. Nada aqui fala com o Pagar.me (o bloqueio vem antes de qualquer cobrança).

const DAY = 86_400_000
const period = () => ({ periodStart: new Date(Date.now() - 7 * DAY).toISOString(), periodEnd: new Date().toISOString() })

test.describe('V2 · cota de exportações (maxExports)', () => {
  test('no Essencial (5/mês) a 6ª exportação é recusada com 402; HTML não conta; outro plano libera', async () => {
    const c = await setupCompany()
    const me = await (await c.admin.get('/api/me')).json()
    const runId = (await (await c.admin.post('/api/reports/generate', { data: { reportTypeId: 'daily', ...period() } })).json()).reportRun.id

    // abrir o relatório em HTML (leitura/impressão) não consome a cota
    for (let i = 0; i < 3; i++) expect((await c.admin.get(`/api/reports/runs/${runId}/download?format=html`)).status()).toBe(200)

    // 5 exportações: indicadores CSV/JSON e CSV do histórico contam igual
    expect((await c.admin.get('/api/reports/export?format=csv')).status()).toBe(200)
    expect((await c.admin.get('/api/reports/export?format=json')).status()).toBe(200)
    expect((await c.admin.get(`/api/reports/runs/${runId}/download?format=csv`)).status()).toBe(200)
    expect((await c.admin.get('/api/reports/export?format=csv')).status()).toBe(200)
    expect((await c.admin.get(`/api/reports/runs/${runId}/download?format=csv`)).status()).toBe(200)

    const usage = (await (await c.admin.get('/api/subscription')).json()).usage
    expect(usage.exports).toMatchObject({ current: 5, limit: 5, percentage: 100 })

    for (const url of ['/api/reports/export?format=csv', `/api/reports/runs/${runId}/download?format=csv`]) {
      const r = await c.admin.get(url)
      expect(r.status(), url).toBe(402)
      const body = await r.json()
      expect(body.code).toBe('quota_exceeded')
      expect(body).toMatchObject({ limit: 5, used: 5 })
      expect(body.error).toContain('exportações')
      expect(body.error).toContain('Essencial')
    }
    // o HTML continua abrindo mesmo com a cota esgotada
    expect((await c.admin.get(`/api/reports/runs/${runId}/download?format=html`)).status()).toBe(200)

    // plano com limite maior: volta a exportar até o novo limite
    const plan = await testDb.plan.create({
      data: { code: `teste_exp_${uid()}`, name: 'Teste Export', monthlyPrice: 1, annualPrice: 10, maxConnections: 5, maxAgents: 5, maxConversationsMonthly: 500, maxMessagesMonthly: 5000, maxAlertRules: 50, retentionDays: 30, maxExports: 6, active: false, sortOrder: 99 },
    })
    await testDb.subscription.update({ where: { organizationId: me.organizationId }, data: { planId: plan.id } })
    expect((await c.admin.get('/api/reports/export?format=csv')).status()).toBe(200)
    expect((await c.admin.get('/api/reports/export?format=csv')).status()).toBe(402)
    await c.dispose()
  })

  test('a organização de demonstração não é limitada nas exportações', async () => {
    const adm = await loginAs('admin.a@test.local')
    for (let i = 0; i < 3; i++) expect((await adm.get('/api/reports/export?format=json')).status()).toBe(200)
    await adm.dispose()
  })
})

test.describe('V7/T11 · rebaixamento com uso acima do plano novo', () => {
  async function companyOnGrowthWith4Agents() {
    const { email, password } = await signupOrg()
    const c = await loginAs(email, password)
    const me = await (await c.get('/api/me')).json()
    const plans = (await (await c.get('/api/plans')).json()).plans as Array<{ id: string; code: string }>
    const gestao = plans.find((p) => p.code === 'gestao')!
    const essencial = plans.find((p) => p.code === 'essencial')!
    const op = await loginAs('platform@test.local')
    expect((await op.patch(`/api/admin/organizations/${me.organizationId}/subscription`, { data: { planId: gestao.id, status: 'active' } })).status()).toBe(200)
    for (let i = 1; i <= 4; i++) {
      expect((await c.post('/api/team', { data: { name: `Atendente ${i}`, email: `rb${i}.${uid()}@cliente.test` } })).status(), `atendente ${i}`).toBe(201)
    }
    return { c, op, orgId: me.organizationId as string, gestao, essencial }
  }

  test('pedir troca para o Essencial com 4 atendentes ativos: 409 com a lista do que passa', async () => {
    const { c, op, orgId, essencial } = await companyOnGrowthWith4Agents()
    const r = await c.post('/api/subscription/request', { data: { planId: essencial.id } })
    expect(r.status()).toBe(409)
    const body = await r.json()
    expect(body.code).toBe('plan_limits_exceeded')
    expect(body.error).toContain('Você tem 4 atendentes ativos; o plano Essencial permite 3')
    expect(body.over).toEqual([{ kind: 'agents', used: 4, limit: 3 }])
    // nada mudou
    expect((await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId }, include: { plan: true } })).plan.code).toBe('gestao')
    await c.dispose()
    await op.dispose()
  })

  test('checkout para o Essencial também é bloqueado (antes de qualquer cobrança)', async () => {
    const { c, op, essencial } = await companyOnGrowthWith4Agents()
    const r = await c.post('/api/billing/checkout', { data: { planId: essencial.id, cycle: 'monthly', cardToken: 'token_naousado' } })
    expect(r.status()).toBe(409)
    const body = await r.json()
    expect(body.code).toBe('plan_limits_exceeded')
    expect(body.error).toContain('4 atendentes ativos')
    await c.dispose()
    await op.dispose()
  })

  test('depois de desativar o excedente o pedido passa', async () => {
    const { c, op, essencial } = await companyOnGrowthWith4Agents()
    const team = (await (await c.get('/api/team')).json()) as { agents: Array<{ id: string; name: string }> }
    const agent = team.agents.find((a) => a.name === 'Atendente 4')
    expect(agent).toBeTruthy()
    const orgId = (await (await c.get('/api/me')).json()).organizationId
    await testDb.agent.update({ where: { id: agent!.id }, data: { status: 'inactive' } })
    expect((await testDb.agent.count({ where: { organizationId: orgId, status: 'active' } }))).toBe(3)
    expect((await c.post('/api/subscription/request', { data: { planId: essencial.id } })).status()).toBe(200)
    await c.dispose()
    await op.dispose()
  })

  test('o operador pode rebaixar mesmo assim, mas recebe o aviso', async () => {
    const { c, op, orgId, essencial } = await companyOnGrowthWith4Agents()
    const r = await op.patch(`/api/admin/organizations/${orgId}/subscription`, { data: { planId: essencial.id } })
    expect(r.status()).toBe(200)
    const body = await r.json()
    expect(body.subscription.plan).toBe('Essencial')
    expect(body.warning).toContain('Plano Essencial aplicado')
    expect(body.warning).toContain('4 atendentes ativos (o plano permite 3)')
    // sem excedente, sem aviso
    const back = await (await op.patch(`/api/admin/organizations/${orgId}/subscription`, { data: { status: 'active' } })).json()
    expect(back.warning).toBeNull()
    // e os novos cadastros ficam bloqueados pela cota
    expect((await c.post('/api/team', { data: { name: 'Atendente 5', email: `rb5.${uid()}@cliente.test` } })).status()).toBe(402)
    await c.dispose()
    await op.dispose()
  })
})

test.describe('T11 · avisos de fim do teste grátis', () => {
  async function trialCompany(trialEndInMs: number) {
    const { email, password } = await signupOrg()
    const c = await loginAs(email, password)
    const orgId = (await (await c.get('/api/me')).json()).organizationId as string
    const trialEnd = new Date(Date.now() + trialEndInMs)
    await testDb.subscription.update({ where: { organizationId: orgId }, data: { status: 'trialing', trialEnd, currentPeriodEnd: trialEnd } })
    return { c, orgId, trialEnd }
  }
  const notices = (orgId: string) => testDb.notification.findMany({ where: { organizationId: orgId, type: 'billing', data: { contains: 'trial_ending' } }, orderBy: { createdAt: 'asc' } })
  const mails = (orgId: string) => testDb.emailOutbox.findMany({ where: { organizationId: orgId, kind: { startsWith: 'billing:trial_' } }, orderBy: { createdAt: 'asc' } })

  test('avisos a 3 dias, 1 dia, último aviso a 6 h e "terminou": cada um uma vez, no sino e por e-mail', async () => {
    const { c, orgId, trialEnd } = await trialCompany(2.5 * DAY)
    const admin = (await testDb.organizationMember.findFirstOrThrow({ where: { organizationId: orgId, role: 'admin' } })).email
    const gw = await gatewayClient()
    const tick = async (at: Date) => {
      const r = await gw.post('/api/gateway/tick', { data: { trialNoticesAt: at.toISOString(), organizationId: orgId } })
      expect(r.status()).toBe(200)
      return (await r.json()).trialNotices as number
    }
    const now = new Date()
    expect(await tick(now)).toBe(1)
    expect(await tick(now)).toBe(0) // idempotente
    let list = await notices(orgId)
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('Seu teste grátis termina em 3 dias')

    const lastDay = new Date(trialEnd.getTime() - 12 * 3600_000)
    expect(await tick(lastDay)).toBe(1)
    expect(await tick(lastDay)).toBe(0)
    list = await notices(orgId)
    expect(list).toHaveLength(2)
    expect(list[1].title).toBe('Seu teste grátis termina em menos de 1 dia')

    // último aviso faltando 6 horas ou menos
    const last = new Date(trialEnd.getTime() - 5 * 3600_000)
    expect(await tick(last)).toBe(1)
    expect(await tick(last)).toBe(0)
    list = await notices(orgId)
    expect(list[2].title).toBe('Último aviso: seu teste grátis termina em 5 horas')

    // o fim do teste vira o aviso "terminou" (uma vez) e, passados 7 dias, nada mais
    const after = new Date(trialEnd.getTime() + 3600_000)
    expect(await tick(after)).toBe(1)
    expect(await tick(after)).toBe(0)
    expect((await notices(orgId))[3].title).toBe('Seu teste grátis terminou')
    expect(await tick(new Date(trialEnd.getTime() + 8 * DAY))).toBe(0)

    // cada aviso foi também por e-mail ao administrador, com o link para Planos
    const sent = await mails(orgId)
    expect(sent.map((m) => m.kind!.split(':')[1])).toEqual(['trial_3d', 'trial_1d', 'trial_6h', 'trial_ended'])
    expect(sent.every((m) => m.toEmail === admin)).toBe(true)
    expect(sent[2].subject).toBe('Último aviso: seu teste grátis termina em 5 horas')
    expect(sent[2].body).toContain('/#plans')
    expect(sent[3].subject).toBe('Seu teste grátis do AtendeRadar terminou')

    // o administrador vê os avisos na central de notificações
    const notifs = (await (await c.get('/api/notifications')).json()).notifications as Array<{ title: string }>
    expect(notifs.some((n) => n.title.includes('menos de 1 dia'))).toBe(true)
    await gw.dispose()
    await c.dispose()
  })

  test('teste com 10 dias pela frente, assinatura ativa ou data inválida: nada é criado', async () => {
    const far = await trialCompany(10 * DAY)
    const gw = await gatewayClient()
    expect((await (await gw.post('/api/gateway/tick', { data: { trialNoticesAt: new Date().toISOString(), organizationId: far.orgId } })).json()).trialNotices).toBe(0)

    const paid = await trialCompany(2 * DAY)
    await testDb.subscription.update({ where: { organizationId: paid.orgId }, data: { status: 'active' } })
    expect((await (await gw.post('/api/gateway/tick', { data: { trialNoticesAt: new Date().toISOString(), organizationId: paid.orgId } })).json()).trialNotices).toBe(0)
    expect(await notices(far.orgId)).toHaveLength(0)
    expect(await notices(paid.orgId)).toHaveLength(0)
    expect(await mails(paid.orgId)).toHaveLength(0)

    // quem já contratou não recebe aviso de teste, nem o "terminou" (assinatura no provedor)
    const sub = await trialCompany(-3600_000)
    await testDb.subscription.update({ where: { organizationId: sub.orgId }, data: { providerSubscriptionId: `sub_${Date.now()}` } })
    expect((await (await gw.post('/api/gateway/tick', { data: { trialNoticesAt: new Date().toISOString(), organizationId: sub.orgId } })).json()).trialNotices).toBe(0)
    expect(await mails(sub.orgId)).toHaveLength(0)
    await sub.c.dispose()

    expect((await gw.post('/api/gateway/tick', { data: { trialNoticesAt: 'ontem' } })).status()).toBe(400)
    await gw.dispose()
    await far.c.dispose()
    await paid.c.dispose()
  })

  test('teste curto (TRIAL_MINUTES): os marcos viram 60%, 40% e 20% do tempo restante', async () => {
    const { c, orgId } = await trialCompany(10 * 60_000) // 10 minutos a partir do cadastro
    const sub = await testDb.subscription.findUniqueOrThrow({ where: { organizationId: orgId } })
    const start = sub.createdAt.getTime()
    const end = sub.trialEnd!.getTime()
    const gw = await gatewayClient()
    const tick = async (at: number) => (await (await gw.post('/api/gateway/tick', { data: { trialNoticesAt: new Date(at).toISOString(), organizationId: orgId } })).json()).trialNotices as number
    expect(await tick(start + 60_000)).toBe(0) // 9 min restantes: ainda nada
    expect(await tick(end - 5 * 60_000)).toBe(1) // 50% restante → 1º aviso
    expect(await tick(end - 3 * 60_000)).toBe(1) // 30% → 2º
    expect(await tick(end - 60_000)).toBe(1) // 10% → último aviso
    expect(await tick(end + 1000)).toBe(1) // terminou
    const list = await notices(orgId)
    expect(list.map((n) => n.title)).toEqual([
      'Seu teste grátis termina em 5 minutos',
      'Seu teste grátis termina em 3 minutos',
      'Último aviso: seu teste grátis termina em 1 minuto',
      'Seu teste grátis terminou',
    ])
    expect(await mails(orgId)).toHaveLength(4)
    await gw.dispose()
    await c.dispose()
  })

  test('estender o teste vale como um teste novo: os avisos saem de novo para a data nova', async () => {
    const { c, orgId, trialEnd } = await trialCompany(2 * DAY)
    const gw = await gatewayClient()
    const tick = async () => (await (await gw.post('/api/gateway/tick', { data: { trialNoticesAt: new Date().toISOString(), organizationId: orgId } })).json()).trialNotices
    expect(await tick()).toBe(1)
    await testDb.subscription.update({ where: { organizationId: orgId }, data: { trialEnd: new Date(trialEnd.getTime() + DAY) } })
    expect(await tick()).toBe(1)
    expect(await notices(orgId)).toHaveLength(2)
    await gw.dispose()
    await c.dispose()
  })
})
