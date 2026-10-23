import { test, expect, request } from '@playwright/test'
import { BASE_URL, loginAs, signupOrg, STRONG, uid } from './helpers'
import { testDb } from './db'
import { setupCompany } from './gw'

// Medição (docs/operacao/medicao.md): ativação na 1ª conexão do WhatsApp, empresas internas fora das conversões e do
// funil, Admin › Medição (funil por campanha, CSV do Google Ads) e o contador do aviso de cookies.
// O servidor dos testes não tem os IDs do GA4/Meta: o que sairia fica registrado no resultado da fila, sem rede.

const OPERATOR = 'platform@test.local'

/** Cadastro real pela API; devolve o corpo da resposta (organizationId e internal). */
async function signup(email: string) {
  const anon = await request.newContext({ baseURL: BASE_URL })
  const r = await anon.post('/api/auth/signup', { data: { name: 'Dona Teste', email, password: STRONG, organizationName: `Empresa ${uid()}`, acceptTerms: true } })
  expect(r.status()).toBe(201)
  const body = await r.json()
  await anon.dispose()
  return body as { organizationId: string; internal: boolean }
}

const conversion = (id: string) => testDb.conversionEvent.findUnique({ where: { id } })

test.describe('medição: ativação', () => {
  test('a 1ª conexão do WhatsApp enfileira "activation" uma vez; o app recebe o event_id para o dataLayer', async () => {
    test.setTimeout(90_000)
    const c = await setupCompany()
    const me = await (await c.admin.get('/api/me')).json()
    const orgId = me.organizationId as string
    const id = `activation.${orgId}`
    await expect.poll(async () => (await conversion(id))?.status, { timeout: 15_000 }).toBe('sent')
    // cadastro sem cookies: sem consentimento, nada sai
    expect((await conversion(id))!.result).toBe('ga4:sem-consentimento meta:sem-consentimento')
    expect(me).toMatchObject({ internal: false, activation: { eventId: id } })

    // reconectar não é outra ativação
    await c.gw.post('/api/gateway/events', { data: { eventId: `st-${uid()}`, connectionId: c.connectionId, type: 'connection.status', payload: { status: 'connected' } } })
    expect(await testDb.conversionEvent.count({ where: { organizationId: orgId, kind: 'activation' } })).toBe(1)
    await c.dispose()
  })
})

test.describe('medição: empresas internas e Admin › Medição', () => {
  test.describe.configure({ mode: 'serial' })
  const domain = `interno-${uid()}.test`

  test.afterAll(async () => {
    await testDb.platformSetting.deleteMany({ where: { key: { in: ['marketing.internal', 'marketing.gads_names'] } } })
  })

  test('só o operador mexe na medição', async () => {
    const { email, password } = await signupOrg()
    const dono = await loginAs(email, password)
    expect((await dono.get('/api/admin/marketing')).status()).toBe(403)
    expect((await dono.put('/api/admin/marketing', { data: { internal: { domains: ['x.com'] } } })).status()).toBe(403)
    expect((await dono.get('/api/admin/marketing/export?type=gads')).status()).toBe(403)
  })

  test('cadastro de domínio interno: o navegador não manda sign_up e a fila não envia', async () => {
    const op = await loginAs(OPERATOR)
    const put = await op.put('/api/admin/marketing', { data: { internal: { emails: ' Fulano@Exemplo.com , lixo', domains: `@${domain.toUpperCase()}\nnao é domínio` }, gadsNames: { activation: 'Ativação teste', purchase: 'Compra teste' } } })
    expect(put.status()).toBe(200)
    expect(await put.json()).toMatchObject({ internal: { emails: ['fulano@exemplo.com'], domains: [domain] }, gadsNames: { activation: 'Ativação teste', purchase: 'Compra teste' } })
    // a lista não vai para o log de auditoria, só a contagem
    const log = await testDb.auditLog.findFirst({ where: { action: 'marketing.internal_updated' }, orderBy: { createdAt: 'desc' } })
    expect(log?.details).toBe(JSON.stringify({ emails: 1, domains: 1 }))

    const email = `teste.${uid()}@${domain}`
    const body = await signup(email)
    expect(body.internal).toBe(true)
    await expect.poll(async () => (await conversion(`sign_up.${body.organizationId}`))?.result, { timeout: 15_000 }).toBe('ignorado:interna')
    const me = await (await loginAs(email, STRONG)).get('/api/me')
    expect(await me.json()).toMatchObject({ internal: true, activation: null })

    // cadastro de fora da lista segue normal
    const fora = await signup(`fora.${uid()}@cliente.test`)
    expect(fora.internal).toBe(false)
  })

  test('funil por campanha e CSV do Google Ads, sem as internas', async () => {
    test.setTimeout(60_000)
    // visita de anúncio com consentimento (os cookies que o site grava), depois o cadastro
    const attr = encodeURIComponent(JSON.stringify({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: `pre_anuncio_${uid()}`, gclid: `TESTE${uid()}`, landing: '/', at: new Date().toISOString() }))
    const consent = encodeURIComponent(JSON.stringify({ v: 1, analytics: true, ads: true }))
    const anon = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { cookie: `ar_attr=${attr}; ar_consent=${consent}; _ga=GA1.1.111.222` } })
    const email = `anuncio.${uid()}@cliente.test`
    const r = await anon.post('/api/auth/signup', { data: { name: 'Dona Anúncio', email, password: STRONG, organizationName: `Anúncio ${uid()}`, acceptTerms: true } })
    expect(r.status()).toBe(201)
    const orgId = (await r.json()).organizationId as string
    await anon.dispose()
    const org = await testDb.organization.findUniqueOrThrow({ where: { id: orgId } })
    const saved = JSON.parse(org.attribution!)
    expect(saved).toMatchObject({ utm_source: 'google', utm_medium: 'cpc', gclid: expect.stringMatching(/^TESTE/), ga: '111.222', consent: { analytics: true, ads: true } })

    // a ativação dessa empresa (como a fila grava) e uma de empresa interna com gclid, que fica fora
    const internalOrg = await testDb.organization.create({ data: { name: 'Interna', displayName: 'Interna', status: 'active', adminEmail: `x.${uid()}@${domain}` } })
    const at = Math.floor(Date.now() / 1000)
    await testDb.conversionEvent.createMany({
      data: [
        { id: `activation.${orgId}`, kind: 'activation', organizationId: orgId, payload: JSON.stringify({ eventTime: at, sourceUrl: 'x', attribution: saved }), status: 'sent' },
        { id: `activation.${internalOrg.id}`, kind: 'activation', organizationId: internalOrg.id, payload: JSON.stringify({ eventTime: at, sourceUrl: 'x', attribution: { gclid: 'NAO_PODE' } }), status: 'skipped' },
        { id: `purchase.sub_mkt_${uid()}`, kind: 'purchase', organizationId: orgId, payload: JSON.stringify({ eventTime: at, sourceUrl: 'x', attribution: saved, value: 299, sandbox: false }), status: 'sent' },
      ],
    })
    await testDb.productMilestone.create({ data: { organizationId: orgId, name: 'first_connection' } })

    const op = await loginAs(OPERATOR)
    const csv = await op.get('/api/admin/marketing/export?type=gads')
    expect(csv.status()).toBe(200)
    expect(csv.headers()['content-type']).toContain('text/csv')
    const text = await csv.text()
    const lines = text.trim().split('\r\n')
    expect(lines[0]).toBe('Parameters:TimeZone=America/Sao_Paulo')
    expect(lines[1]).toBe('Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency')
    const mine = lines.filter((l) => l.startsWith(`${saved.gclid},`))
    expect(mine).toHaveLength(2)
    expect(mine.find((l) => l.includes('Ativação teste'))).toMatch(/^TESTE\w+,Ativação teste,\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},,BRL$/)
    expect(mine.find((l) => l.includes('Compra teste'))).toMatch(/,299\.00,BRL$/)
    expect(text).not.toContain('NAO_PODE')
    expect(text).not.toContain('@')

    const data = await (await op.get('/api/admin/marketing')).json()
    const row = data.rows.find((x: { utm_campaign: string }) => x.utm_campaign === saved.utm_campaign)
    expect(row).toMatchObject({ utm_source: 'google', utm_medium: 'cpc', signups: 1, activations: 1 })
    expect(data.internalOrgCount).toBeGreaterThanOrEqual(2)
    const funnel = await (await op.get('/api/admin/marketing/export?type=funnel')).text()
    expect(funnel.split('\r\n')[0]).toBe('dia,utm_source,utm_medium,utm_campaign,cadastros,ativacoes,testes_vencidos_sem_contratar,assinaturas_pagas,receita_brl,cancelamentos')
    expect(funnel).toContain(`,google,cpc,${saved.utm_campaign},1,1,`)
    expect((await op.get('/api/admin/marketing?from=2026-13-01')).status()).toBe(400)
  })
})

test('aviso de cookies: cada escolha soma 1 no contador do dia, sem identificar ninguém', async () => {
  const anon = await request.newContext({ baseURL: BASE_URL })
  const total = async () => (await testDb.consentChoiceDaily.aggregate({ where: { choice: 'reject_all' }, _sum: { count: true } }))._sum.count ?? 0
  const before = await total()
  expect((await anon.post('/api/public/consent', { data: { choice: 'reject_all' } })).status()).toBe(204)
  expect(await total()).toBe(before + 1)
  expect((await anon.post('/api/public/consent', { data: { choice: 'qualquer' } })).status()).toBe(400)
  expect((await anon.post('/api/public/consent', { data: { choice: 'reject_all' } })).headers()['set-cookie']).toBeUndefined()
  await anon.dispose()
})
